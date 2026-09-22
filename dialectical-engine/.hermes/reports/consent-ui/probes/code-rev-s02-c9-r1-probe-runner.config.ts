// CODE-REV-S02-C9 r1 probe runner. LANE from the env (COMMON §10.35 — no hard-coded .worktrees path).
// The alias array is a COPY of the lane's own vitest.config.ts with import.meta.dirname -> LANE
// (TOOLING-TRAPS 2026-09-07 04:25). include points at THIS directory's probe (COMMON §10.46).
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined) throw new Error("set LANE=<dir holding package.json>");

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(LANE, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(LANE, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(LANE, "apps/ui") },
    { find: "react", replacement: resolve(LANE, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(LANE, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["code-rev-s02-c9-r1-crossslice.probe.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
