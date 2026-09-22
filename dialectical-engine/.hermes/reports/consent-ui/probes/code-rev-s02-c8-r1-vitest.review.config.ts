// CODE-REV-S02-C8 r1 — a scratch-local vitest config so the reviewer's probes never enter
// `tests/`. Mirrors the root config's aliases; include is scoped to this directory.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = resolve(import.meta.dirname, "..");

export default defineConfig({
  root,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(root, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(root, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(root, "apps/ui") },
    { find: "react", replacement: resolve(root, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(root, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [".review-scratch/**/*.test.tsx"],
    fileParallelism: false,
    reporters: ["verbose"]
  }
});
