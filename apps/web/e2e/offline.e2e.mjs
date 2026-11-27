// Offline check for M10 (spec 9.1): a signed-in learner opens the app online,
// then loses the network, reloads, and must still see the lesson list, open a
// downloaded lesson and see that the app knows it is offline.
//
// Needs a running, seeded API whose CORS_ORIGIN includes http://localhost:4173,
// and a production build of apps/web made with VITE_API_URL pointing at it:
//   VITE_API_URL=http://localhost:3001 pnpm --filter @keyboard-sensei/web build
//   API_URL=http://localhost:3001 node apps/web/e2e/offline.e2e.mjs
// The script serves apps/web/dist itself the way nginx does (no `Vary: Origin`,
// which `vite preview` adds and which stops the service worker matching its
// cache). Uses the Playwright library, not a test runner, so it adds no dependency.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// require() also finds a globally installed Playwright, which ESM import does not.
const { chromium } = createRequire(import.meta.url)("playwright");

const WEB_PORT = Number(process.env.WEB_PORT ?? 4173);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };

const web = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, WEB_URL).pathname);
  const file = normalize(join(DIST, pathname));
  const send = async (path) => {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  };
  try {
    if (!file.startsWith(DIST) || pathname.endsWith("/")) throw new Error("index");
    await send(file);
  } catch {
    await send(join(DIST, "index.html")).catch(() => res.writeHead(500).end());
  }
});
await new Promise((resolve) => web.listen(WEB_PORT, resolve));
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "keyboard-sensei-access-token";

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
};

async function register() {
  const email = `offline-${Date.now()}@test.local`;
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery", display_name: "Offline tester" }),
  });
  const body = await res.json();
  if (!body.accessToken) throw new Error(`register failed: ${res.status} ${JSON.stringify(body)}`);
  return body.accessToken;
}

const token = await register();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(([key, value]) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, value);
}, [TOKEN_KEY, token]);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
page.on("pageerror", (error) => consoleErrors.push(String(error)));
page.on("requestfailed", (request) => consoleErrors.push(`request failed: ${request.url()}`));

try {
  // Online: lesson list loads, the service worker installs, the bundle downloads.
  const bundle = page.waitForResponse((res) => res.url().endsWith("/content/offline") && res.status() === 200);
  await page.goto(`${WEB_URL}/learn`);
  await bundle;
  // The app shell must be cached and the page controlled before going offline.
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false;
    const names = await caches.keys();
    return names.some((name) => name.includes("-shell-"));
  }, undefined, { timeout: 30000 });
  const firstLesson = await (await fetch(`${API_URL}/lessons`, { headers: { authorization: `Bearer ${token}` } })).json();
  const title = firstLesson[0].title;
  await page.getByText(title, { exact: false }).first().waitFor({ timeout: 15000 });
  console.log("ok   lesson list renders online");
  // Give the cache writes a moment to land in IndexedDB.
  await page.waitForTimeout(500);

  // Offline: no network at all, including the API. (No page.route here: request
  // interception would bypass the service worker that serves the app shell.)
  await context.setOffline(true);
  await page.reload();
  await page.getByText(title, { exact: false }).first().waitFor({ timeout: 15000 });
  console.log(`ok   lesson list renders offline ("${title}")`);

  await page.getByRole("status").filter({ hasText: /offline/i }).waitFor({ timeout: 10000 });
  console.log("ok   offline note shown");

  await page.goto(`${WEB_URL}/lessons/${firstLesson[0].id}`).catch(() => undefined);
  await page.getByRole("heading", { name: title }).first().waitFor({ timeout: 15000 });
  console.log(`ok   downloaded lesson opens offline (${firstLesson[0].id})`);
} catch (error) {
  await page.screenshot({ path: process.env.SCREENSHOT ?? "offline-failure.png" }).catch(() => undefined);
  fail(error instanceof Error ? error.message : String(error));
  if (consoleErrors.length) console.error(consoleErrors.slice(-5).join("\n"));
} finally {
  await browser.close();
  web.close();
}
