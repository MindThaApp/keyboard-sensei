import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, ProgressStatus, type Prisma } from "@prisma/client";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { exercises, lessons } from "../src/content.js";
const prisma=new PrismaClient();
const json=(value:unknown)=>value as Prisma.InputJsonValue;

async function main(){
  lessons.forEach(validateLesson);exercises.forEach(validateMidiExercise);
  const password_hash=await bcrypt.hash("demo-password",12);
  const demo=await prisma.user.upsert({where:{email:"demo@keyboardsensei.local"},create:{email:"demo@keyboardsensei.local",display_name:"Demo User",password_hash},update:{display_name:"Demo User",password_hash}});
  for(const [index,lesson] of lessons.entries())await prisma.lesson.upsert({where:{id:lesson.id},create:{id:lesson.id,lesson_json:json(lesson),path:lesson.path,level:lesson.level,branch:lesson.branch,order:index+1},update:{lesson_json:json(lesson),path:lesson.path,level:lesson.level,branch:lesson.branch,order:index+1}});
  for(const exercise of exercises){const lesson=lessons.find(item=>item.sections.some(section=>section.type==="midi-exercise"&&section.exerciseId===exercise.exerciseId));if(!lesson)throw new Error(`No lesson owns ${exercise.exerciseId}`);await prisma.exercise.upsert({where:{id:exercise.exerciseId},create:{id:exercise.exerciseId,exercise_json:json(exercise),lesson_id:lesson.id},update:{exercise_json:json(exercise),lesson_id:lesson.id}})}
  for(const [index,lesson] of lessons.entries())await prisma.userProgress.upsert({where:{user_id_lesson_id:{user_id:demo.id,lesson_id:lesson.id}},create:{user_id:demo.id,lesson_id:lesson.id,status:index===0?ProgressStatus.unlocked:ProgressStatus.locked},update:{status:index===0?ProgressStatus.unlocked:ProgressStatus.locked,best_score:0,completed_at:null}});
  console.log(`Seeded ${lessons.length} lessons, ${exercises.length} exercises, and demo user ${demo.email}`);
}
main().finally(()=>prisma.$disconnect());
