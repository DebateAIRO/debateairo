import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/* CODE-REV-S02-C3C4 r1 — the root vitest.config.ts `include` is tests/** + acceptance/**,
   so a probe under .review-scratch/ reports "No test files found". Same aliases, wider include. */
const repo = resolve(import.meta.dirname, "..");

export default defineConfig({
  root: repo,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(repo, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(repo, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(repo, "apps/ui") },
    { find: "react", replacement: resolve(repo, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(repo, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [".review-scratch/**/*.test.tsx", ".review-scratch/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
