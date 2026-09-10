import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
/* REV(S01) p2 correctness lens — the promoted pass-1 probes (mine + the SECURITY lens's five),
   RE-PATHED from the security lane (still parked at f6c147cc) to MY worktree, which is at the
   FIX head 53b903d2.  Explicit workspace aliases because the probe files live in scratch, outside
   the pnpm workspace, so bare specifiers do not resolve from their own directory. */
const W = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine";
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
    include: ["/private/tmp/debate-tiers-REV-S01-p2-correctness-tests/rerun/probe-*.test.ts", "/private/tmp/debate-tiers-REV-S01-p2-correctness-tests/rerun/probe-*.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
