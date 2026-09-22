// CODE-REV-S01-C6-r2 — reviewer-owned vitest config.
// Lives entirely inside .review-scratch/ (this seat's allowed surface); creates
// NO file under tests/. Mirrors the repo config's aliases, resolved against the
// LANE ROOT, which is one level up from this file. Lane taken from the config's
// own location (COMMON 10.35: no hard-coded .worktrees/ path).
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const LANE = resolve(import.meta.dirname, "..");

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
    include: [".review-scratch/probes/**/*.test.tsx", ".review-scratch/probes/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
