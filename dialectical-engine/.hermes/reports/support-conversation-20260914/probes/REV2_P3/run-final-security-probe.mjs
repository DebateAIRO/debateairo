import { existsSync,symlinkSync,unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const expected = "5cbfc6d483aae0f56eabfdee00a6829e09e76c3d";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine";
const dependencyRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const links = [
  "node_modules",
  "apps/api/node_modules",
  "packages/support-kb/node_modules"
].map((relative) => ({
  link:`${productRoot}/${relative}`,
  target:`${dependencyRoot}/${relative}`
}));
const probe = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/REV2_P3/final-security-boundary-probe.ts";

function git(root,args) {
  const result = spawnSync("git",args,{ cwd:root,encoding:"utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function assertBound(root,label) {
  const revision = git(root,["rev-parse","HEAD"]);
  const dirty = git(root,["status","--short","--untracked-files=all"]);
  if (revision !== expected || dirty !== "") {
    throw new Error(`${label} binding failed: revision=${revision} dirty=${JSON.stringify(dirty)}`);
  }
}

assertBound(productRoot,"product");
assertBound(dependencyRoot,"dependency");
for (const { link } of links) {
  if (existsSync(link)) throw new Error(`product dependency path unexpectedly exists: ${link}`);
}
let status = 1;
try {
  for (const { link,target } of links) symlinkSync(target,link,"dir");
  const result = spawnSync(process.execPath,["--import","tsx",probe],{
    cwd:productRoot,stdio:"inherit",env:{ ...process.env,TSX_DISABLE_CACHE:"1" }
  });
  status = result.status ?? 1;
  if (result.error !== undefined) throw result.error;
} finally {
  for (const { link } of [...links].reverse()) if (existsSync(link)) unlinkSync(link);
}
assertBound(productRoot,"product-after");
assertBound(dependencyRoot,"dependency-after");
process.exitCode = status;
