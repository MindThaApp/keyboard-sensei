import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, type PrismaClient, type TtsNarration, type TtsUsage } from "@prisma/client";

export const TTS_LIMIT = 10_000;
const moduleDirectory=dirname(fileURLToPath(import.meta.url));
export const TTS_CACHE_DIR = resolve(moduleDirectory,basename(dirname(moduleDirectory))==="dist"?"../../data/tts-cache":"../data/tts-cache");

export interface TtsUsageSummary { charactersUsed: number; limit: number; remaining: number; disabled: boolean }
export interface NarrationResult { narration: TtsNarration; cached: boolean; usage: TtsUsageSummary }

/** `scope` says which allowance ran out: the shared monthly pool, or this user's daily cap. */
export class TtsLimitError extends Error {
  constructor(message: string, readonly scope: "monthly" | "user-daily") {
    super(message);
  }
}

export function currentTtsPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentTtsDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function summarizeUsage(charactersUsed: number): TtsUsageSummary {
  return {charactersUsed,limit:TTS_LIMIT,remaining:Math.max(0,TTS_LIMIT-charactersUsed),disabled:charactersUsed>=TTS_LIMIT};
}

type TtsDb = Pick<PrismaClient, "ttsNarration" | "ttsUsage" | "ttsUserUsage" | "$transaction">;
type Synthesizer = (voiceId:string,text:string)=>Promise<Uint8Array>;

export async function synthesizeElevenLabs(voiceId:string,text:string): Promise<Uint8Array> {
  const { env } = await import("./config.js");
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,{method:"POST",headers:{"content-type":"application/json","xi-api-key":env.ELEVENLABS_API_KEY},body:JSON.stringify({text,model_id:"eleven_flash_v2_5"})});
  if(!response.ok)throw new Error(`ElevenLabs TTS failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function ensureTtsUsage(db:Pick<PrismaClient,"ttsUsage">,period=currentTtsPeriod()): Promise<TtsUsage> {
  return db.ttsUsage.upsert({where:{period},create:{period},update:{}});
}

interface Reservation { period: string; userId: string; day: string; characters: number }

/**
 * Atomically reserve `characters` against BOTH the shared monthly pool and the user's
 * daily cap, before any ElevenLabs call. Each counter is bumped by a single conditional
 * UPDATE (`... WHERE charactersUsed <= limit - n`), so two concurrent requests can never
 * both pass a check-then-increment race. Both bumps share one transaction: if the
 * daily cap refuses, the monthly bump is rolled back too.
 */
async function reserveCharacters(db: TtsDb, reservation: Reservation, userDailyLimit: number): Promise<void> {
  const { period, userId, day, characters } = reservation;
  await db.$transaction(async (tx) => {
    await tx.ttsUsage.upsert({ where: { period }, create: { period }, update: {} });
    const monthly = await tx.ttsUsage.updateMany({
      where: { period, charactersUsed: { lte: TTS_LIMIT - characters } },
      data: { charactersUsed: { increment: characters } },
    });
    if (monthly.count === 0) throw new TtsLimitError("This month's free narration allowance is used up.", "monthly");

    await tx.ttsUserUsage.upsert({
      where: { user_id_day: { user_id: userId, day } },
      create: { user_id: userId, day },
      update: {},
    });
    const daily = await tx.ttsUserUsage.updateMany({
      where: { user_id: userId, day, charactersUsed: { lte: userDailyLimit - characters } },
      data: { charactersUsed: { increment: characters } },
    });
    if (daily.count === 0) {
      throw new TtsLimitError("You've reached today's narration limit — try again tomorrow.", "user-daily");
    }
  });
}

/** Give a reservation back when synthesis didn't produce a new narration. */
async function releaseCharacters(db: TtsDb, reservation: Reservation): Promise<void> {
  const { period, userId, day, characters } = reservation;
  await db.$transaction([
    db.ttsUsage.updateMany({ where: { period }, data: { charactersUsed: { decrement: characters } } }),
    db.ttsUserUsage.updateMany({ where: { user_id: userId, day }, data: { charactersUsed: { decrement: characters } } }),
  ]);
}

export async function getOrCreateNarration(db:TtsDb,input:{userId:string;lessonId:string;sectionIndex:number;voiceId:string;text:string;userDailyLimit:number;now?:Date;cacheDir?:string;synthesize?:Synthesizer}): Promise<NarrationResult> {
  const key={lessonId:input.lessonId,sectionIndex:input.sectionIndex,voiceId:input.voiceId};
  const now=input.now??new Date();
  const period=currentTtsPeriod(now);
  const cached=await db.ttsNarration.findUnique({where:{lessonId_sectionIndex_voiceId:key}});
  if(cached){const usage=await ensureTtsUsage(db,period);return {narration:cached,cached:true,usage:summarizeUsage(usage.charactersUsed)}}

  const reservation: Reservation = { period, userId: input.userId, day: currentTtsDay(now), characters: input.text.length };
  await reserveCharacters(db, reservation, input.userDailyLimit);

  let narration: TtsNarration;
  try {
    const audio=await (input.synthesize??synthesizeElevenLabs)(input.voiceId,input.text);
    const cacheDir=input.cacheDir??TTS_CACHE_DIR;
    await mkdir(cacheDir,{recursive:true});
    const fileName=`${input.lessonId}-${input.sectionIndex}-${createHash("sha256").update(input.voiceId).digest("hex").slice(0,16)}.mp3`;
    const filePath=resolve(cacheDir,fileName);
    await writeFile(filePath,audio);
    narration=await db.ttsNarration.create({data:{...key,filePath,characterCount:input.text.length}});
  } catch (error) {
    await releaseCharacters(db, reservation);
    // A concurrent request for the same section+voice won the race and cached it first:
    // serve theirs, and (above) don't bill this one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.ttsNarration.findUnique({ where: { lessonId_sectionIndex_voiceId: key } });
      if (winner) {
        const usage = await ensureTtsUsage(db, period);
        return { narration: winner, cached: true, usage: summarizeUsage(usage.charactersUsed) };
      }
    }
    throw error;
  }
  const usage=await ensureTtsUsage(db,period);
  return {narration,cached:false,usage:summarizeUsage(usage.charactersUsed)};
}
