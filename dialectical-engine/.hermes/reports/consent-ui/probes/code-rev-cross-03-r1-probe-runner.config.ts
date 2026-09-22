/**
 * CODE-REV-CROSS-03 r1 — vitest config OWNED BY THE REVIEW SEAT (COMMON §10.46).
 *
 * Runs probe files that live OUTSIDE the lane, so zero files are created under the lane
 * and zero under `tests/`. The lane comes from `LANE` (COMMON §10.35: never a hard-coded
 * `.worktrees/` path).
 *
 *   LANE=/abs/path/to/lane pnpm exec vitest run --config <this file>
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      // The probe's own specifier for the module under review.
      { find: "@lane/modalSemantics", replacement: LANE + "/apps/ui/components/consent/modalSemantics.ts" },
      // The lane's own `@` alias (vitest.config.ts:  { find: "@", replacement: apps/ui }) —
      // TOOLING-TRAPS records that omitting it makes any transitive `@/...` import fail.
      { find: "@", replacement: LANE + "/apps/ui" },
      { find: "react-dom/client", replacement: LANE + "/apps/ui/node_modules/react-dom/client.js" },
      { find: "react-dom", replacement: LANE + "/apps/ui/node_modules/react-dom" },
      { find: "react", replacement: LANE + "/apps/ui/node_modules/react" }
    ]
  },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: { include: ["probes/**/*.test.tsx"], fileParallelism: false, reporters: ["verbose"] }
});
