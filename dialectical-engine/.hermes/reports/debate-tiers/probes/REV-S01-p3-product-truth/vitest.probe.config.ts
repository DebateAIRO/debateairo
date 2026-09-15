import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/* REV(S01) p3 product-truth — my own probe harness.
   Descendant of REV-S01-p1-security--vitest.probe.config.ts, which hard-coded ITS worktree
   (pass-2 N5). This one takes the worktree from $WORKTREE so it runs from any lane. */
const W = process.env.WORKTREE;
if (!W) throw new Error("set WORKTREE=<abs path to the lane holding apps/ui>");
const SCRATCH = process.env.PROBE_ROOT ?? "/private/tmp/debate-tiers-REV-S01-p3-product-truth";

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
    root: SCRATCH,
    include: ["probe-*.test.ts", "probe-*.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
