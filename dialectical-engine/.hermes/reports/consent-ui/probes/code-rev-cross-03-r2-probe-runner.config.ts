/**
 * CODE-REV-CROSS-03 r2 — vitest config OWNED BY THE REVIEW SEAT (COMMON §10.46).
 *
 * MODELS: running a probe file that lives OUTSIDE the lane, against the lane's real modules.
 * DOES NOT MODEL: anything about the lane's own `vitest.config.ts` `test` options beyond
 *   `fileParallelism` and the reporter.
 *
 * Both the lane AND the probe come from the environment (COMMON §10.35 — never a hard-coded
 * `.worktrees/` path; and unlike its five predecessors this one needs no editing to reuse):
 *
 *   LANE=/abs/path/to/lane PROBE=<file>.test.tsx pnpm exec vitest run --config <this file>
 *
 * The alias array MIRRORS the lane's own `vitest.config.ts` with `import.meta.dirname` replaced
 * by LANE (TOOLING-TRAPS `:2440`), plus the probe's own `@lane/...` specifier. A resolve error
 * naming a PACKAGE is a root defect, one naming a PATH ALIAS is a missing alias, and
 * `No test files found` is an `include` defect (TRAPS `:2485`).
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");
const PROBE = process.env.PROBE ?? "**/*.probe.test.tsx";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: "@lane/modalSemantics", replacement: LANE + "/apps/ui/components/consent/modalSemantics.ts" },
      { find: "next/headers", replacement: LANE + "/tests/render/stubs/next-headers.ts" },
      { find: "next/navigation", replacement: LANE + "/tests/render/stubs/next-navigation.ts" },
      { find: "@", replacement: LANE + "/apps/ui" },
      { find: "react-dom/client", replacement: LANE + "/apps/ui/node_modules/react-dom/client.js" },
      { find: "react-dom", replacement: LANE + "/apps/ui/node_modules/react-dom" },
      { find: "react", replacement: LANE + "/apps/ui/node_modules/react" }
    ]
  },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: { include: [PROBE], fileParallelism: false, reporters: ["verbose"] }
});
