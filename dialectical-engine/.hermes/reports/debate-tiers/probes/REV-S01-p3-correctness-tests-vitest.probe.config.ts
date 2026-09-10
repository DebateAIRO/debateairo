import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
/* REV(S01) p3 correctness lens — every promoted probe of passes 1 and 2, re-pathed to MY worktree.
   Root resolved from PROBE_WORKTREE so this file is runnable from ANY worktree (pass-2 N5). */
const W = process.env.PROBE_WORKTREE ?? "";
if (!W) throw new Error("set PROBE_WORKTREE=<abs path to the dir holding package.json>");
const R = process.env.PROBE_DIR ?? "/private/tmp/debate-tiers-REV-S01-p3-correctness-tests/rerun";
export default defineConfig({
  root: W,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(W, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(W, "tests/render/stubs/next-navigation.ts") },
    { find: /^@debateai\/contract$/, replacement: resolve(W, "node_modules/@debateai/contract/generated/client.ts") },
    { find: /^@debateai\/api$/, replacement: resolve(W, "node_modules/@debateai/api/src/index.ts") },
    { find: /^zod$/, replacement: resolve(W, "node_modules/zod") },
    { find: "@", replacement: resolve(W, "apps/ui") },
    { find: "react", replacement: resolve(W, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(W, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [`${R}/probe-*.test.ts`, `${R}/probe-*.test.tsx`],
    fileParallelism: false, hookTimeout: 120_000, testTimeout: 120_000, reporters: ["verbose"]
  }
});
