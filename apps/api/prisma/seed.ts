import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient, ProgressStatus, type Prisma } from "@prisma/client";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { exercises, lessons } from "../src/content.js";
import { seedContent } from "../src/seed-content.js";
import { DUPLICATE_OF, prepareLibraryManifest } from "../src/library-titles.js";
import { extractSongMetadata, type SongMetadata } from "../src/midi-metadata.js";
import { readEssentialsIndex, supersededLibraryIds } from "../src/essentials/replacements.js";
import { seedEssentials } from "../src/essentials/seed.js";
import { backfillAll } from "../src/progression/backfill.js";
const prisma=new PrismaClient();
const json=(value:unknown)=>value as Prisma.InputJsonValue;

const SEED_DIR=path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH=path.resolve(SEED_DIR,"../scripts/midi-manifest.json");
const LIBRARY_DIR=path.resolve(SEED_DIR,"../data/midi-library");
const INSTRUMENT_MANIFEST_PATH=path.resolve(SEED_DIR,"../scripts/instrument-manifest.json");
const INSTRUMENT_LIBRARY_DIR=path.resolve(SEED_DIR,"../data/instruments");

interface LibraryManifestEntry{id:string;title:string;artist:string;genre:string;rights:string;source:string;file:string;durationSec:number;noteCount:number;difficulty:number}
interface InstrumentManifestEntry{id:string;name:string;description:string;category:string;rights:string;sourceUrl:string;packDir:string}

/**
 * Re-measure duration/notes/difficulty from the file itself, so a change to
 * the difficulty heuristic reaches an existing database on reseed without
 * re-running the fetch. Falls back to the stored values if the file no longer
 * parses (it validated when it was fetched).
 */
async function measureSongFile(filePath:string,fallback:SongMetadata):Promise<SongMetadata>{
  try{
    return extractSongMetadata(new Uint8Array(await readFile(filePath)));
  }catch(error){
    console.warn(`Could not re-measure ${path.basename(filePath)}: ${error instanceof Error?error.message:String(error)}`);
    return fallback;
  }
}

/**
 * Upsert the curated song library from scripts/midi-manifest.json. Files come
 * from `pnpm exec tsx scripts/fetch-midi-library.ts`; entries whose file is
 * missing on disk are skipped with a warning so a partial library never
 * breaks seeding.
 *
 * Titles are cleaned and known duplicates dropped (src/library-titles.ts).
 * Idempotent: ids never change, and a dropped duplicate's row is deleted only
 * while nobody has a play-along attempt on it.
 */
async function seedSongs():Promise<void>{
  let raw:string;
  try{raw=await readFile(MANIFEST_PATH,"utf8")}catch{console.warn("No midi-manifest.json — skipping song library seed (run scripts/fetch-midi-library.ts)");return}
  const prepared=prepareLibraryManifest(JSON.parse(raw) as LibraryManifestEntry[]);
  if(prepared.unresolvedDuplicates.length>0){
    console.warn(`Song library: possible duplicates not in DUPLICATE_OF: ${prepared.unresolvedDuplicates.map((ids)=>ids.join(" = ")).join("; ")}`);
  }

  let seeded=0,missing=0;
  // Songs an Essentials version supersedes are not re-created (src/essentials/replacements.ts).
  const superseded=supersededLibraryIds(readEssentialsIndex());
  for(const entry of prepared.entries){
    if(superseded.has(entry.id))continue;
    const file_path=path.join(LIBRARY_DIR,entry.file);
    if(!existsSync(file_path)){missing+=1;continue}
    const metadata=await measureSongFile(file_path,{durationSec:entry.durationSec,noteCount:entry.noteCount,difficulty:entry.difficulty});
    const data={
      title:entry.title,
      artist:entry.artist,
      genre:entry.genre,
      difficulty:metadata.difficulty,
      duration_sec:metadata.durationSec,
      note_count:metadata.noteCount,
      content_rights:entry.rights,
      source_url:`${entry.source}`,
      file_path,
    };
    await prisma.song.upsert({where:{id:`seed-${entry.id}`},create:{id:`seed-${entry.id}`,...data},update:data});
    seeded+=1;
  }
  if(missing>0)console.warn(`Song library: ${missing} manifest entries missing on disk (run scripts/fetch-midi-library.ts to fetch)`);
  console.log(`Seeded ${seeded} library songs (${prepared.renamed.length} titles cleaned up)`);

  // Walk DUPLICATE_OF itself, not just this manifest's drops: a manifest
  // written by the fetch script already omits them, but old rows may remain.
  let removed=0;
  for(const [duplicateId,keptId] of Object.entries(DUPLICATE_OF)){
    const row=await prisma.song.findUnique({where:{id:`seed-${duplicateId}`},select:{id:true,title:true,uploader_id:true,_count:{select:{attempts:true}}}});
    if(!row)continue;
    if(row.uploader_id||row._count.attempts>0){
      console.warn(`Song library: keeping duplicate "${row.title}" (${row.id}) — it has ${row._count.attempts} play-along attempt(s)`);
      continue;
    }
    await prisma.song.delete({where:{id:row.id}});
    removed+=1;
    console.log(`Song library: removed duplicate "${row.title}" (kept ${keptId})`);
  }
  if(removed>0)console.log(`Removed ${removed} duplicate library songs`);
}

/**
 * Other public songs (the authored beginner pack) also get the current
 * difficulty heuristic. Users' own uploads keep what was measured at upload.
 */
async function remeasurePublicSongs():Promise<void>{
  const rows=await prisma.song.findMany({where:{uploader_id:null},select:{id:true,file_path:true,duration_sec:true,note_count:true,difficulty:true}});
  let updated=0;
  for(const row of rows){
    // seed-* rows are the manifest library, already handled by seedSongs.
    if(row.id.startsWith("seed-")||!existsSync(row.file_path))continue;
    const metadata=await measureSongFile(row.file_path,{durationSec:row.duration_sec,noteCount:row.note_count,difficulty:row.difficulty});
    await prisma.song.update({where:{id:row.id},data:{difficulty:metadata.difficulty,duration_sec:metadata.durationSec,note_count:metadata.noteCount}});
    updated+=1;
  }
  if(updated>0)console.log(`Re-measured ${updated} other public songs`);
}

async function seedInstruments():Promise<void>{
  let raw:string;
  try{raw=await readFile(INSTRUMENT_MANIFEST_PATH,"utf8")}catch{console.warn("No instrument-manifest.json — skipping instrument library seed (run scripts/fetch-instrument-library.ts)");return}
  const entries=JSON.parse(raw) as InstrumentManifestEntry[];
  let seeded=0,missing=0;
  for(const entry of entries){
    const pack_path=path.join(INSTRUMENT_LIBRARY_DIR,entry.packDir);
    if(!existsSync(pack_path)){missing+=1;continue}
    const data={name:entry.name,description:entry.description,category:entry.category,pack_path,source_url:entry.sourceUrl,content_rights:entry.rights};
    await prisma.instrument.upsert({where:{id:`seed-${entry.id}`},create:{id:`seed-${entry.id}`,...data},update:data});
    seeded+=1;
  }
  if(missing>0)console.warn(`Instrument library: ${missing} manifest entries missing on disk (run scripts/fetch-instrument-library.ts to fetch)`);
  console.log(`Seeded ${seeded} library instruments`);
}

async function main(){
  // Checked before any write. Empty counts as unset: docker-compose passes ADMIN_PASSWORD
  // as `${ADMIN_PASSWORD:-}`, i.e. "" when the deploy env doesn't define it.
  const adminPassword=process.env.ADMIN_PASSWORD||undefined;
  if(!adminPassword){
    // Never seed a production admin with a password that is published in this repo.
    if(process.env.NODE_ENV==="production")throw new Error("ADMIN_PASSWORD must be set when NODE_ENV=production; refusing to seed the admin with the dev fallback password");
    console.warn("ADMIN_PASSWORD not set; seeding admin with the dev fallback password 'admin-sensei-dev'");
  }
  lessons.forEach(validateLesson);exercises.forEach(validateMidiExercise);
  const password_hash=await bcrypt.hash("demo-password",12);
  const demo=await prisma.user.upsert({where:{email:"demo@keyboardsensei.local"},create:{email:"demo@keyboardsensei.local",display_name:"Demo User",password_hash},update:{display_name:"Demo User",password_hash}});
  const admin_hash=await bcrypt.hash(adminPassword??"admin-sensei-dev",12);
  const admin=await prisma.user.upsert({where:{email:"admin@keyboardsensei.local"},create:{email:"admin@keyboardsensei.local",display_name:"Sensei Admin",password_hash:admin_hash,role:"admin"},update:{display_name:"Sensei Admin",password_hash:admin_hash,role:"admin"}});
  // The seeded accounts can't receive email (.local addresses), so they count as
  // verified; otherwise REQUIRE_EMAIL_VERIFICATION would lock them out.
  await prisma.user.updateMany({where:{id:{in:[demo.id,admin.id]},email_verified_at:null},data:{email_verified_at:new Date()}});
  const content=await seedContent(prisma,lessons,exercises);
  if(content.deletedLessonIds.length>0||content.deletedExerciseIds.length>0)console.log(`Pruned unreferenced content: lessons [${content.deletedLessonIds.join(", ")}], exercises [${content.deletedExerciseIds.join(", ")}]`);
  for(const [index,lesson] of lessons.entries())await prisma.userProgress.upsert({where:{user_id_lesson_id:{user_id:demo.id,lesson_id:lesson.id}},create:{user_id:demo.id,lesson_id:lesson.id,status:index===0?ProgressStatus.unlocked:ProgressStatus.locked},update:{status:index===0?ProgressStatus.unlocked:ProgressStatus.locked,best_score:0,completed_at:null}});
  await seedSongs();
  const essentials=await seedEssentials(prisma);
  console.log(`Seeded ${essentials.seeded} Essentials versions${essentials.removed.length>0?`, removed ${essentials.removed.length} no longer generated`:""}`);
  for(const label of essentials.replacements.deleted)console.log(`Essentials: removed superseded song ${label}`);
  for(const label of essentials.replacements.retired)console.log(`Essentials: retired superseded song ${label}`);
  for(const label of essentials.replacements.restored)console.log(`Essentials: restored ${label} (its replacement is missing)`);
  await remeasurePublicSongs();
  await seedInstruments();
  // XP, practice days and achievements for history saved before progression existed.
  // Re-running adds only what is missing (see src/progression/backfill.ts).
  const progression=await backfillAll(prisma);
  console.log(`Progression backfill: ${progression.xpAwarded} XP and ${progression.achievements} achievements across ${progression.users} users`);
  console.log(`Seeded ${lessons.length} lessons, ${exercises.length} exercises, demo user ${demo.email}, and admin ${admin.email}`);
}
main().finally(()=>prisma.$disconnect());
