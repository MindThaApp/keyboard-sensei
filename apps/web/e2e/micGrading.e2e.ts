/**
 * End-to-end check of mic grading (docs/specs/MUSIC-PORTAL.md 9.1, M4): Chromium's
 * fake capture plays a synthesized recording into a real lesson exercise through
 * the whole path (getUserMedia, analysis, MicNoteSource, exercise player, API
 * re-score) and the grade on screen is asserted.
 *
 * Needs the API (seeded database) and the web dev server running:
 *   pnpm db:start && pnpm db:migrate:deploy && pnpm db:seed
 *   pnpm dev
 *   npx tsx apps/web/e2e/micGrading.e2e.ts
 * WEB_URL / API_URL override http://localhost:5173 and http://localhost:3001.
 * Playwright is not a repo dependency: the machine's installed copy (and its
 * Chromium) is loaded, so a global `npm i -g playwright` or NODE_PATH works.
 * The WAV fixture is generated into a temporary folder; nothing binary is committed.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { chromium as Chromium } from "playwright";
import { encodeWav, synthesizeMelody, type SynthNote } from "../../../packages/audio-analysis/src/index.js";

const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: typeof Chromium };

const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const LESSON_ID = "lesson-01";
const EXERCISE_TITLE_PATTERN = /warm/i;

/** C4, C5, C4 on a piano-like decaying tone, after a lead-in, then a long rest before the file loops. */
function writeFixture(notes: SynthNote[], name: string): string {
  const samples = synthesizeMelody(notes, { decayMs: 900, harmonics: [1, 0.6, 0.4, 0.25, 0.15, 0.1], noiseDb: -62, seed: 11, totalMs: 9000 });
  const path = join(mkdtempSync(join(tmpdir(), "mic-e2e-")), name);
  writeFileSync(path, encodeWav(samples));
  return path;
}

async function token(): Promise<string> {
  const email = `mic-e2e-${Date.now()}@example.test`;
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "mic-e2e-password", display_name: "Mic Test" }),
  });
  if (!response.ok) throw new Error(`register failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

interface Scenario { name: string; notes: SynthNote[]; expectPass: boolean }

const SCENARIOS: Scenario[] = [
  {
    name: "right notes",
    notes: [
      { midi: 60, startMs: 2500, durationMs: 900 },
      { midi: 72, startMs: 3600, durationMs: 900 },
      { midi: 60, startMs: 4700, durationMs: 900 },
    ],
    expectPass: true,
  },
  {
    // D5 instead of C5: the exercise never completes; Finish grades what was heard.
    name: "wrong note",
    notes: [
      { midi: 60, startMs: 2500, durationMs: 900 },
      { midi: 74, startMs: 3600, durationMs: 900 },
      { midi: 60, startMs: 4700, durationMs: 900 },
    ],
    expectPass: false,
  },
];

async function runScenario(scenario: Scenario): Promise<void> {
  const wav = writeFixture(scenario.notes, "take.wav");
  const accessToken = await token();
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const context = await browser.newContext({ permissions: ["microphone"] });
    await context.addInitScript((value) => localStorage.setItem("keyboard-sensei-access-token", value), accessToken);
    const page = await context.newPage();
    const scored = page.waitForResponse((r) => r.url().includes("/exercises/") && r.url().endsWith("/attempts") && r.request().method() === "POST", { timeout: 60_000 });
    await page.goto(`${WEB_URL}/lessons/${LESSON_ID}`);
    const exercise = page.locator("section").filter({ has: page.getByRole("heading", { name: EXERCISE_TITLE_PATTERN }) }).first();
    await exercise.getByRole("radio", { name: "Microphone" }).or(exercise.getByRole("button", { name: "Microphone" })).first().click();
    const turnOn = page.getByRole("button", { name: "Turn on microphone" });
    if (await turnOn.isVisible({ timeout: 3000 }).catch(() => false)) await turnOn.click();
    await page.getByTestId("mic-status").waitFor({ timeout: 15_000 });
    await exercise.getByRole("button", { name: "Start" }).click();
    if (!scenario.expectPass) {
      await page.waitForTimeout(6500);
      await exercise.getByRole("button", { name: "Finish" }).click();
    }

    const response = await scored;
    const request = response.request().postDataJSON() as { performedNotes: { note: number; source?: string; centsOffset?: number }[] };
    const result = (await response.json()) as { score: number };
    const notes = request.performedNotes.map((n) => n.note);
    console.log(`${scenario.name}: sent ${notes.join(",")} → score ${result.score}`);
    if (!request.performedNotes.every((n) => n.source === "mic" && typeof n.centsOffset === "number")) throw new Error("attempt notes are not mic notes");
    const expectedHeard = scenario.notes.map((n) => n.midi);
    if (!expectedHeard.every((midi) => notes.includes(midi))) throw new Error(`expected ${expectedHeard.join(",")}, got ${notes.join(",")}`);
    if (scenario.expectPass && result.score < 70) throw new Error(`expected a passing grade, got ${result.score}`);
    if (!scenario.expectPass && result.score >= 70) throw new Error(`expected a failing grade, got ${result.score}`);
    await page.getByText(scenario.expectPass ? /Passed/ : /Score 70 to pass\. Keep at it/).first().waitFor({ timeout: 5000 });
  } finally {
    await browser.close();
  }
}

async function run(): Promise<void> {
  for (const scenario of SCENARIOS) await runScenario(scenario);
  console.log("mic grading e2e: passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
