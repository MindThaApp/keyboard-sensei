import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@keyboard-sensei/shared-types": path.resolve(
        workspaceRoot,
        "packages/shared-types/src/index.ts",
      ),
      "@keyboard-sensei/lesson-engine": path.resolve(
        workspaceRoot,
        "packages/lesson-engine/src/index.ts",
      ),
      "@keyboard-sensei/midi-engine": path.resolve(
        workspaceRoot,
        "packages/midi-engine/src/index.ts",
      ),
      "@keyboard-sensei/music-theory": path.resolve(
        workspaceRoot,
        "packages/music-theory/src/index.ts",
      ),
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
});

