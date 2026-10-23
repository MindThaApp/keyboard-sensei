import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { sentryRelease } from "../../packages/shared-types/src/sentry.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const staticShellExtensions = new Set([
  ".html",
  ".js",
  ".css",
  ".png",
  ".webmanifest",
]);
const neverPrecacheExtensions = new Set([
  ".flac",
  ".mp3",
  ".ogg",
  ".wav",
]);

type StaticShellFile = {
  url: string;
  digest: string;
};

async function listStaticShellFiles(dir: string, prefix = ""): Promise<StaticShellFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.posix.join(prefix, entry.name);
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listStaticShellFiles(fullPath, relativePath);
      }

      if (!entry.isFile() || entry.name === "sw.js" || entry.name.endsWith(".map")) {
        return [];
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (neverPrecacheExtensions.has(extension) || !staticShellExtensions.has(extension)) {
        return [];
      }

      const digest = crypto
        .createHash("sha256")
        .update(await fs.readFile(fullPath))
        .digest("hex")
        .slice(0, 12);

      return [{ url: `/${relativePath}`, digest }];
    }),
  );

  return files.flat();
}

function serviceWorkerSource(staticShellUrls: string[], cacheVersion: string) {
  return `const CACHE_NAME = "keyboard-sensei-shell-${cacheVersion}";
const STATIC_SHELL_URLS = ${JSON.stringify(staticShellUrls, null, 2)};
const AUDIO_EXTENSION_PATTERN = /\\.(?:mp3|ogg|wav|flac)(?:$|[?#])/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("keyboard-sensei-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (url.pathname.includes("/samples/") || AUDIO_EXTENSION_PATTERN.test(url.pathname)) return;

  if (STATIC_SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((response) => response || fetch(request)));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
  }
});
`;
}

function pwaServiceWorkerPlugin() {
  return {
    name: "keyboard-sensei-pwa-service-worker",
    apply: "build" as const,
    async writeBundle(options: { dir?: string }) {
      const outDir = options.dir ? path.resolve(__dirname, options.dir) : path.resolve(__dirname, "dist");
      const staticShellFiles = (await listStaticShellFiles(outDir)).sort((a, b) => a.url.localeCompare(b.url));
      const cacheVersion = crypto
        .createHash("sha256")
        .update(staticShellFiles.map((file) => `${file.url}:${file.digest}`).join("\n"))
        .digest("hex")
        .slice(0, 12);
      const staticShellUrls = staticShellFiles.map((file) => file.url);

      await fs.writeFile(path.join(outDir, "sw.js"), serviceWorkerSource(staticShellUrls, cacheVersion));
    },
  };
}

/**
 * `keyboard-sensei@<version>+<git sha>`: baked into the bundle as __APP_RELEASE__ and used
 * by the Sentry plugin, so the release uploaded with the source maps is the one the app
 * reports. Docker builds have no .git, so CI passes GIT_SHA instead.
 */
function gitSha(): string | undefined {
  if (process.env.GIT_SHA?.trim()) return process.env.GIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return undefined;
  }
}
const packageVersion = (JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8")) as { version: string }).version;
const release = sentryRelease(packageVersion, gitSha());

// Source maps are uploaded to Sentry and then deleted from the output: they must never be
// served publicly. Without SENTRY_AUTH_TOKEN nothing is uploaded, so no maps are made.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());
if (uploadSourceMaps && !process.env.SENTRY_PROJECT?.trim()) {
  console.warn("SENTRY_AUTH_TOKEN is set but SENTRY_PROJECT is not: source maps will not be uploaded.");
}

export default defineConfig({
  define: { __APP_RELEASE__: JSON.stringify(release) },
  build: { sourcemap: uploadSourceMaps ? "hidden" : false },
  plugins: [
    react(),
    pwaServiceWorkerPlugin(),
    // Last, so it sees the finished bundle.
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG || "mindtheapp",
            project: process.env.SENTRY_PROJECT,
            url: process.env.SENTRY_URL || "https://de.sentry.io",
            telemetry: false,
            release: { name: release },
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
          }),
        ]
      : []),
  ],
  resolve: {
    // Exact-match patterns: a plain string alias is a PREFIX match, so
    // "@keyboard-sensei/midi-engine" would also swallow "@keyboard-sensei/midi-engine/web".
    alias: [
      { find: /^@keyboard-sensei\/shared-types$/, replacement: path.resolve(workspaceRoot, "packages/shared-types/src/index.ts") },
      { find: /^@keyboard-sensei\/lesson-engine$/, replacement: path.resolve(workspaceRoot, "packages/lesson-engine/src/index.ts") },
      { find: /^@keyboard-sensei\/midi-engine$/, replacement: path.resolve(workspaceRoot, "packages/midi-engine/src/index.ts") },
      { find: /^@keyboard-sensei\/midi-engine\/web$/, replacement: path.resolve(workspaceRoot, "packages/midi-engine/src/web.ts") },
      { find: /^@keyboard-sensei\/midi-engine\/capacitor$/, replacement: path.resolve(workspaceRoot, "packages/midi-engine/src/capacitor.ts") },
      { find: /^@keyboard-sensei\/music-theory$/, replacement: path.resolve(workspaceRoot, "packages/music-theory/src/index.ts") },
      { find: /^@keyboard-sensei\/playalong-core$/, replacement: path.resolve(workspaceRoot, "packages/playalong-core/src/index.ts") },
    ],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
});
