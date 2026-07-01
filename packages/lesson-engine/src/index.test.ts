import { describe, expect, it } from "vitest";
import { calculateAssessmentPlacement } from "./index.js";

describe("assessment placement", () => {
  it("places only consistently strong players beyond lesson one", () => {
    expect(calculateAssessmentPlacement([100, 90, 90])).toEqual({ completedLessonCount: 3, placementScore: 93 });
    expect(calculateAssessmentPlacement([100, 79, 100]).completedLessonCount).toBe(0);
    expect(calculateAssessmentPlacement([])).toEqual({ completedLessonCount: 0, placementScore: 0 });
  });
});
import { contentRightsSchema, isLessonUnlocked } from "./index.js";
import type { Lesson } from "@keyboard-sensei/shared-types";
const lesson={unlockCriteria:{requiresLessonIds:["one"],minScore:70}} as Lesson;
describe("isLessonUnlocked",()=>it("requires completion and score",()=>{expect(isLessonUnlocked({lesson,completedLessonIds:["one"],scoresByLessonId:{one:80}})).toBe(true);expect(isLessonUnlocked({lesson,completedLessonIds:["one"],scoresByLessonId:{one:60}})).toBe(false)}));
describe("content rights",()=>{
  it("accepts licensed copyrighted works with documented permission",()=>expect(()=>contentRightsSchema.parse({workTitle:"Licensed Work",composer:"A Composer",status:"licensed-copyright",copyrightHolder:"Rights Holder",licenseReference:"license-contract-2026-01"})).not.toThrow());
  it("rejects undocumented copyrighted works",()=>expect(()=>contentRightsSchema.parse({workTitle:"Unlicensed Work",composer:"A Composer",status:"licensed-copyright",copyrightHolder:null,licenseReference:null})).toThrow());
});
