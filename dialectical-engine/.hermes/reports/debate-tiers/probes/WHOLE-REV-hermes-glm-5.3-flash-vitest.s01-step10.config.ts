// Promoted probe config — WHOLE-REV-hermes-glm-5.3-flash S01 step-10 probe.
// Runnable from ANY worktree: the root comes from $WORKTREE (or --root argv);
// there is NO silent default (a hard-coded root is the defect the packet bans).
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const here = resolve(import.meta.dirname);
const W = process.env.WORKTREE
  ?? process.argv[process.argv.indexOf("--root") + 1];
if (!W || process.argv[process.argv.indexOf("--root") + 1] === undefined && !process.env.WORKTREE) {
  throw new Error("WORKTREE env var or --root <path> required");
}

export default defineConfig({
  root: W,
  resolve: { alias: [
    { find: "next/headers", replacement: resolve(W, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(W, "tests/render/stubs/next-navigation.ts") },
    { find: "@nd/page", replacement: resolve(W, "apps/ui/app/new/page.tsx") },
    { find: "@", replacement: resolve(W, "apps/ui") },
    { find: "react", replacement: resolve(W, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(W, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [resolve(here, "WHOLE-REV-hermes-glm-5.3-flash-s01-step10-probe.test.tsx")],
    fileParallelism: false,
    reporters: ["verbose"]
  }
});
