import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrCreateNarration, TtsLimitError } from "./tts.js";

const directories:string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(directory=>rm(directory,{recursive:true,force:true})))});

function memoryDb(charactersUsed=0){
  let usage={id:"usage-1",period:"2026-07",charactersUsed,updatedAt:new Date()};
  const narrations=new Map<string,Record<string,unknown>>();
  const key=(value:{lessonId:string;sectionIndex:number;voiceId:string})=>`${value.lessonId}:${value.sectionIndex}:${value.voiceId}`;
  return {
    ttsNarration:{
      findUnique:vi.fn(async({where}:{where:{lessonId_sectionIndex_voiceId:{lessonId:string;sectionIndex:number;voiceId:string}}})=>narrations.get(key(where.lessonId_sectionIndex_voiceId))??null),
      create:vi.fn(async({data}:{data:{lessonId:string;sectionIndex:number;voiceId:string;filePath:string;characterCount:number}})=>{const row={id:"narration-1",createdAt:new Date(),...data};narrations.set(key(data),row);return row})
    },
    ttsUsage:{
      upsert:vi.fn(async()=>usage),
      update:vi.fn(async({data}:{data:{charactersUsed:{increment:number}}})=>(usage={...usage,charactersUsed:usage.charactersUsed+data.charactersUsed.increment}))
    }
  };
}

describe("TTS narration quota and cache",()=>{
  it("blocks generation before calling ElevenLabs or incrementing usage",async()=>{
    const db=memoryDb(9_950);const synthesize=vi.fn();
    await expect(getOrCreateNarration(db as never,{lessonId:"lesson-01",sectionIndex:0,voiceId:"voice-1",text:"x".repeat(51),period:"2026-07",synthesize})).rejects.toBeInstanceOf(TtsLimitError);
    expect(synthesize).not.toHaveBeenCalled();
    expect(db.ttsUsage.update).not.toHaveBeenCalled();
  });

  it("reuses an identical narration without a second synthesis or usage increment",async()=>{
    const db=memoryDb();const synthesize=vi.fn(async()=>new Uint8Array([1,2,3]));const cacheDir=await mkdtemp(join(tmpdir(),"keyboard-sensei-tts-"));directories.push(cacheDir);
    const input={lessonId:"lesson-01",sectionIndex:0,voiceId:"voice-1",text:"Piano lesson",period:"2026-07",cacheDir,synthesize};
    const first=await getOrCreateNarration(db as never,input);const second=await getOrCreateNarration(db as never,input);
    expect(first.cached).toBe(false);expect(second.cached).toBe(true);
    expect(synthesize).toHaveBeenCalledTimes(1);expect(db.ttsUsage.update).toHaveBeenCalledTimes(1);
    expect(second.usage.charactersUsed).toBe(input.text.length);
  });
});
