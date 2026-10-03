import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * playalong-core must stay reusable outside the browser (a future React Native
 * app). tsconfig.json compiles it without the DOM library, which catches typed
 * uses; this test also catches untyped ones (`globalThis.window`, `any` casts) and
 * imports of browser-only entry points.
 */
const FORBIDDEN = [
  /\bwindow\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /\blocalStorage\b/,
  /\bperformance\.now\b/,
  /\bAudioContext\b/,
  /\brequestAnimationFrame\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /midi-engine\/web/,
  /from "react/,
];

const SRC = __dirname;

function runtimeSources(): string[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(SRC, name));
}

/** Drop comments so prose like "the window of notes" doesn't trip the check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("playalong-core import boundary", () => {
  it("has runtime sources to check", () => {
    expect(runtimeSources().length).toBeGreaterThan(5);
  });

  it.each(runtimeSources().map((file) => [file.slice(SRC.length + 1), file]))("%s uses no platform globals", (_name, file) => {
    const code = stripComments(readFileSync(file, "utf8"));
    const hits = FORBIDDEN.filter((pattern) => pattern.test(code)).map(String);
    expect(hits).toEqual([]);
  });
});
