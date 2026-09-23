// Promoted probe config — WHOLE-REV-hermes-glm-5.3-flash S02 R10 refusal-path probe.
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
    { find: /^@debateai\/contract$/, replacement: resolve(W, "node_modules/@debateai/contract/generated/client.ts") },
    { find: /^@debateai\/api$/, replacement: resolve(W, "node_modules/@debateai/api/src/index.ts") },
    { find: /^zod$/, replacement: resolve(W, "node_modules/zod") },
    { find: /^@support\/httpSession\.js$/, replacement: resolve(W, "tests/support/httpSession.ts") },
    { find: "@", replacement: resolve(W, "apps/ui") }
  ] },
  test: {
    include: [resolve(here, "WHOLE-REV-hermes-glm-5.3-flash-s02-r10-refusal-path.test.ts")],
    fileParallelism: false,
    reporters: ["verbose"]
  }
});
