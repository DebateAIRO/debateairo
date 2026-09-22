/**
 * GROK-REV-S01-10A r1 independent probe runner.
 * Lane from LANE env (COMMON §10.35). Run with cwd = LANE:
 *   LANE="$PWD" pnpm exec vitest run --config .review-scratch/GROK-REV-S01-10A-r1/probe.config.ts
 */
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");

export default defineConfig({
  root: LANE,
  resolve: {
    alias: [
      { find: "next/headers", replacement: resolve(LANE, "tests/render/stubs/next-headers.ts") },
      { find: "next/navigation", replacement: resolve(LANE, "tests/render/stubs/next-navigation.ts") },
      { find: "@", replacement: resolve(LANE, "apps/ui") },
      { find: "react-dom/client", replacement: resolve(LANE, "apps/ui/node_modules/react-dom/client.js") },
      { find: "react-dom", replacement: resolve(LANE, "apps/ui/node_modules/react-dom") },
      { find: "react", replacement: resolve(LANE, "apps/ui/node_modules/react") }
    ]
  },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [".review-scratch/GROK-REV-S01-10A-r1/*.probe.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
