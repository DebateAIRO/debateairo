import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Reviewer's own config. `root` is the lane (process.cwd()), taken from the
// environment rather than hard-coded (COMMON §10.35). It exists only so vitest's
// `include` reaches .review-scratch/; every alias is copied from vitest.config.ts.
const lane = process.cwd();

export default defineConfig({
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(lane, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(lane, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(lane, "apps/ui") },
    { find: "react", replacement: resolve(lane, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(lane, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    root: lane,
    include: [".review-scratch/**/*.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
