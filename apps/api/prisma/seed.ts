import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient, ProgressStatus, type Prisma } from "@prisma/client";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { exercises, lessons } from "../src/content.js";
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
 * Upsert the curated song library from scripts/midi-manifest.json. Files come
 * from `pnpm exec tsx scripts/fetch-midi-library.ts`; entries whose file is
 * missing on disk are skipped with a warning so a partial library never
 * breaks seeding.
 */
async function seedSongs():Promise<void>{
  let raw:string;
  try{raw=await readFile(MANIFEST_PATH,"utf8")}catch{console.warn("No midi-manifest.json — skipping song library seed (run scripts/fetch-midi-library.ts)");return}
  const entries=JSON.parse(raw) as LibraryManifestEntry[];
  let seeded=0,missing=0;
  for(const entry of entries){
    const file_path=path.join(LIBRARY_DIR,entry.file);
    if(!existsSync(file_path)){missing+=1;continue}
    const data={title:entry.title,artist:entry.artist,genre:entry.genre,difficulty:entry.difficulty,duration_sec:entry.durationSec,note_count:entry.noteCount,content_rights:entry.rights,source_url:`${entry.source}`,file_path};
    await prisma.song.upsert({where:{id:`seed-${entry.id}`},create:{id:`seed-${entry.id}`,...data},update:data});
    seeded+=1;
  }
  if(missing>0)console.warn(`Song library: ${missing} manifest entries missing on disk (run scripts/fetch-midi-library.ts to fetch)`);
  console.log(`Seeded ${seeded} library songs`);
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
  lessons.forEach(validateLesson);exercises.forEach(validateMidiExercise);
  const password_hash=await bcrypt.hash("demo-password",12);
  const demo=await prisma.user.upsert({where:{email:"demo@keyboardsensei.local"},create:{email:"demo@keyboardsensei.local",display_name:"Demo User",password_hash},update:{display_name:"Demo User",password_hash}});
  const adminPassword=process.env.ADMIN_PASSWORD;
  if(!adminPassword)console.warn("ADMIN_PASSWORD not set; seeding admin with the dev fallback password 'admin-sensei-dev'");
  const admin_hash=await bcrypt.hash(adminPassword??"admin-sensei-dev",12);
  const admin=await prisma.user.upsert({where:{email:"admin@keyboardsensei.local"},create:{email:"admin@keyboardsensei.local",display_name:"Sensei Admin",password_hash:admin_hash,role:"admin"},update:{display_name:"Sensei Admin",password_hash:admin_hash,role:"admin"}});
  for(const [index,lesson] of lessons.entries())await prisma.lesson.upsert({where:{id:lesson.id},create:{id:lesson.id,lesson_json:json(lesson),path:lesson.path,level:lesson.level,branch:lesson.branch,order:index+1},update:{lesson_json:json(lesson),path:lesson.path,level:lesson.level,branch:lesson.branch,order:index+1}});
  for(const exercise of exercises){const lesson=lessons.find(item=>item.sections.some(section=>section.type==="midi-exercise"&&section.exerciseId===exercise.exerciseId));if(!lesson)throw new Error(`No lesson owns ${exercise.exerciseId}`);await prisma.exercise.upsert({where:{id:exercise.exerciseId},create:{id:exercise.exerciseId,exercise_json:json(exercise),lesson_id:lesson.id},update:{exercise_json:json(exercise),lesson_id:lesson.id}})}
  for(const [index,lesson] of lessons.entries())await prisma.userProgress.upsert({where:{user_id_lesson_id:{user_id:demo.id,lesson_id:lesson.id}},create:{user_id:demo.id,lesson_id:lesson.id,status:index===0?ProgressStatus.unlocked:ProgressStatus.locked},update:{status:index===0?ProgressStatus.unlocked:ProgressStatus.locked,best_score:0,completed_at:null}});
  await seedSongs();
  await seedInstruments();
  console.log(`Seeded ${lessons.length} lessons, ${exercises.length} exercises, demo user ${demo.email}, and admin ${admin.email}`);
}
main().finally(()=>prisma.$disconnect());
