import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient, TtsNarration, TtsUsage } from "@prisma/client";

export const TTS_LIMIT = 10_000;
const moduleDirectory=dirname(fileURLToPath(import.meta.url));
export const TTS_CACHE_DIR = resolve(moduleDirectory,basename(dirname(moduleDirectory))==="dist"?"../../data/tts-cache":"../data/tts-cache");

export interface TtsUsageSummary { charactersUsed: number; limit: number; remaining: number; disabled: boolean }
export interface NarrationResult { narration: TtsNarration; cached: boolean; usage: TtsUsageSummary }
export class TtsLimitError extends Error {}

export function currentTtsPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function summarizeUsage(charactersUsed: number): TtsUsageSummary {
  return {charactersUsed,limit:TTS_LIMIT,remaining:Math.max(0,TTS_LIMIT-charactersUsed),disabled:charactersUsed>=TTS_LIMIT};
}

type TtsDb = Pick<PrismaClient, "ttsNarration" | "ttsUsage">;
type Synthesizer = (voiceId:string,text:string)=>Promise<Uint8Array>;

export async function synthesizeElevenLabs(voiceId:string,text:string): Promise<Uint8Array> {
  const { env } = await import("./config.js");
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,{method:"POST",headers:{"content-type":"application/json","xi-api-key":env.ELEVENLABS_API_KEY},body:JSON.stringify({text,model_id:"eleven_flash_v2_5"})});
  if(!response.ok)throw new Error(`ElevenLabs TTS failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function ensureTtsUsage(db:TtsDb,period=currentTtsPeriod()): Promise<TtsUsage> {
  return db.ttsUsage.upsert({where:{period},create:{period},update:{}});
}

export async function getOrCreateNarration(db:TtsDb,input:{lessonId:string;sectionIndex:number;voiceId:string;text:string;period?:string;cacheDir?:string;synthesize?:Synthesizer}): Promise<NarrationResult> {
  const key={lessonId:input.lessonId,sectionIndex:input.sectionIndex,voiceId:input.voiceId};
  const cached=await db.ttsNarration.findUnique({where:{lessonId_sectionIndex_voiceId:key}});
  const period=input.period??currentTtsPeriod();
  if(cached){const usage=await ensureTtsUsage(db,period);return {narration:cached,cached:true,usage:summarizeUsage(usage.charactersUsed)}}

  const usage=await ensureTtsUsage(db,period);
  if(usage.charactersUsed+input.text.length>TTS_LIMIT)throw new TtsLimitError("This month's free narration allowance is used up.");

  const audio=await (input.synthesize??synthesizeElevenLabs)(input.voiceId,input.text);
  const cacheDir=input.cacheDir??TTS_CACHE_DIR;
  await mkdir(cacheDir,{recursive:true});
  const fileName=`${input.lessonId}-${input.sectionIndex}-${createHash("sha256").update(input.voiceId).digest("hex").slice(0,16)}.mp3`;
  const filePath=resolve(cacheDir,fileName);
  await writeFile(filePath,audio);
  const narration=await db.ttsNarration.create({data:{...key,filePath,characterCount:input.text.length}});
  const updated=await db.ttsUsage.update({where:{period},data:{charactersUsed:{increment:input.text.length}}});
  return {narration,cached:false,usage:summarizeUsage(updated.charactersUsed)};
}
