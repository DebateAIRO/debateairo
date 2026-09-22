/**
 * GROK-REV-S02-10C r1 — vitest config OWNED BY THE REVIEW SEAT (COMMON §10.46).
 * LANE=/abs/path/to/lane PROBE=<file>.test.tsx pnpm exec vitest run --config <this file>
 */
import { defineConfig } from "vitest/config";

const LANE = process.env.LANE;
if (LANE === undefined || LANE === "") throw new Error("set LANE=<absolute lane path>");
const PROBE = process.env.PROBE ?? "**/*.probe.test.tsx";

export default defineConfig({
  root: LANE,
  resolve: {
    alias: [
      { find: "@lane/PrivacyPolicyModal", replacement: LANE + "/apps/ui/components/consent/PrivacyPolicyModal.tsx" },
      { find: "@lane/SignUpFlow", replacement: LANE + "/apps/ui/components/SignUpFlow.tsx" },
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
