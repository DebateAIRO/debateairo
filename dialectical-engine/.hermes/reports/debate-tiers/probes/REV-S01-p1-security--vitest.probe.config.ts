import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/* REV(S01) p1 security lens — my own probe harness. Mirrors the repo's aliases
   (worktree /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine)
   but roots at my scratch dir so no probe file ever lands in the product tree. */
const W = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine";

export default defineConfig({
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(W, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(W, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(W, "apps/ui") },
    { find: "react", replacement: resolve(W, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(W, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    root: "/private/tmp/debate-tiers-REV-S01-p1-security-data-safety",
    include: ["probe-*.test.ts", "probe-*.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
