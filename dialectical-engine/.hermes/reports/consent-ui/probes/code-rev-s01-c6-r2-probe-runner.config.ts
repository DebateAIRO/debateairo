/**
 * CODE-REV-S01-C6-r2 — run a PROMOTED probe byte-untouched, from OUTSIDE the lane.
 *
 * Refutes `TOOLING-TRAPS :2248`'s "can only be satisfied by a transient tests/<dir>"
 * and confirms the pre-existing `:1965` entry. Writes nothing into the lane.
 *
 *   LANE=/abs/path/to/lane pnpm exec vitest run --config <this file>
 *
 * Run with cwd = LANE so a probe's `process.cwd()`-relative reads still resolve.
 * `root` is this config's own directory (COMMON 10.35: no hard-coded .worktrees/).
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: [
    // Exact-string aliases for the promoted probe's own relative specifiers, which
    // assume a file exactly two levels under the lane root.
    { find: "../../apps/ui/lib/consent.js", replacement: LANE + "/apps/ui/lib/consent.ts" },
    { find: "../../apps/ui/components/consent/CookieConsent.js", replacement: LANE + "/apps/ui/components/consent/CookieConsent.tsx" },
    { find: "../../apps/ui/components/consent/ConsentSettingsPanel.js", replacement: LANE + "/apps/ui/components/consent/ConsentSettingsPanel.tsx" },
    { find: "react-dom/client", replacement: LANE + "/apps/ui/node_modules/react-dom/client.js" },
    { find: "react-dom", replacement: LANE + "/apps/ui/node_modules/react-dom" },
    { find: "react", replacement: LANE + "/apps/ui/node_modules/react" }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: { include: ["probes/**/*.test.tsx"], fileParallelism: false, reporters: ["verbose"] }
});
