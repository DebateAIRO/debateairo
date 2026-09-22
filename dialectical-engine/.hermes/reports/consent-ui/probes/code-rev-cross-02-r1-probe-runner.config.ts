/**
 * CODE-REV-CROSS-02 r1 — reviewer-owned probe runner (COMMON §10.46, TOOLING-TRAPS :2306/:2440).
 *
 * Starts as a COPY of the lane's own `vitest.config.ts` alias array with `import.meta.dirname`
 * replaced by $LANE (TRAPS :2440), then adds the promoted probe's relative specifiers so the
 * reviewer's ORIGINAL fixture can run byte-untouched from here.
 *
 *   LANE=<absolute lane path> pnpm exec vitest run --config <this file>
 *
 * Lane comes from the environment; no worktree path is written into this file (COMMON §10.35).
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      // --- the promoted probe's own two-levels-under-the-root relative specifiers ---
      { find: "../../apps/ui/components/SignUpFlow.js", replacement: LANE + "/apps/ui/components/SignUpFlow.tsx" },
      { find: "../../apps/ui/components/consent/CookieConsent.js", replacement: LANE + "/apps/ui/components/consent/CookieConsent.tsx" },
      { find: "../../apps/ui/components/consent/ConsentSettingsPanel.js", replacement: LANE + "/apps/ui/components/consent/ConsentSettingsPanel.tsx" },
      { find: "../../apps/ui/components/consent/modalSemantics.js", replacement: LANE + "/apps/ui/components/consent/modalSemantics.ts" },
      { find: "../../apps/ui/lib/consent.js", replacement: LANE + "/apps/ui/lib/consent.ts" },
      // --- the lane's own array (TRAPS :2440) ---
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
    include: ["*.probe.test.tsx"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
