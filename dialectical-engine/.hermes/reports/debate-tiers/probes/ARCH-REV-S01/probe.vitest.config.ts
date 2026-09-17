import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine";

export default defineConfig({
  root: LANE,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(LANE, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(LANE, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(LANE, "apps/ui") },
    { find: "react", replacement: resolve(LANE, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(LANE, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["coverage/arch-rev-probe/**/*.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
