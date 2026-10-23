#!/usr/bin/env node
// Builds apps/web for the Android app. The API base URL is baked into the bundle
// at build time, and the app has no sensible default (the web build's
// http://localhost:3001 means the phone itself), so it must be given explicitly:
//
//   VITE_API_URL=https://api.keyboardsensei.example pnpm --filter @keyboard-sensei/mobile build:web
//
// `https://api.keyboardsensei.example` is a placeholder: the public API domain
// does not exist yet. Plain http:// is refused unless KS_ANDROID_DEV_API=1 (a
// debug build against a local API; see docs/android.md).
import { spawnSync } from "node:child_process";

const apiUrl = process.env.VITE_API_URL?.trim();
const devApi = process.env.KS_ANDROID_DEV_API === "1";

function fail(message) {
  console.error(`build-web: ${message}`);
  process.exit(1);
}

if (!apiUrl) fail("VITE_API_URL is not set. Example: VITE_API_URL=https://api.keyboardsensei.example");
let parsed;
try {
  parsed = new URL(apiUrl);
} catch {
  fail(`VITE_API_URL is not a URL: ${apiUrl}`);
}
if (parsed.protocol !== "https:" && !(devApi && parsed.protocol === "http:")) {
  fail(`VITE_API_URL must be https:// (got ${apiUrl}). Set KS_ANDROID_DEV_API=1 only for a local debug build.`);
}

console.log(`build-web: VITE_API_URL=${apiUrl}${devApi ? " (local dev API)" : ""}`);
const result = spawnSync("pnpm", ["--filter", "@keyboard-sensei/web", "build"], { stdio: "inherit", env: { ...process.env, VITE_API_URL: apiUrl } });
process.exit(result.status ?? 1);
