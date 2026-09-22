/**
 * CODE-REV-CROSS-01 r1 — reviewer-owned probe runner (COMMON §10.46 + TOOLING-TRAPS :2306/:2440).
 *
 *   LANE=/abs/path/to/lane pnpm exec vitest run --config <this file>
 *
 * `root` is this config's own directory, so ZERO files are created in the lane and
 * nothing lands under the lane's `tests/`. The alias array is a COPY of the LANE's
 * `vitest.config.ts` array (including `@`, the entry TOOLING-TRAPS :2440 says the
 * older promoted runner was missing), with every replacement re-pointed at LANE.
 * No `.worktrees/` path is hard-coded (COMMON §10.35).
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: "next/headers", replacement: LANE + "/tests/render/stubs/next-headers.ts" },
      { find: "next/navigation", replacement: LANE + "/tests/render/stubs/next-navigation.ts" },
      { find: "@", replacement: LANE + "/apps/ui" },
      { find: "react-dom/client", replacement: LANE + "/apps/ui/node_modules/react-dom/client.js" },
      { find: "react-dom", replacement: LANE + "/apps/ui/node_modules/react-dom" },
      { find: "react", replacement: LANE + "/apps/ui/node_modules/react" }
    ]
  },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["probes/**/*.test.tsx"],
    fileParallelism: false,
    reporters: ["verbose"]
  }
});
