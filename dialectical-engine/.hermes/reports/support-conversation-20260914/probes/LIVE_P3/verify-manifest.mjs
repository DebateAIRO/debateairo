import { createHash } from "node:crypto";
import { readFile,stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const repositoryRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const manifestPath = `${repositoryRoot}/.hermes/reports/support-conversation-20260914/evidence/LIVE_P3-manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath,"utf8"));
if (manifest.receiptSelfExcluded !== true || manifest.artifactCount !== manifest.artifacts.length) {
  throw new Error("LIVE_P3_MANIFEST_SHAPE_INVALID");
}
for (const artifact of manifest.artifacts) {
  if (artifact.absolute === manifestPath
    || artifact.missionRelative === ".hermes/reports/support-conversation-20260914/logs/LIVE_P3-stack-detached.log") {
    throw new Error("LIVE_P3_MANIFEST_EXCLUSION_FAILED");
  }
  const bytes = await readFile(artifact.absolute);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== artifact.sha256 || (await stat(artifact.absolute)).size !== artifact.bytes
    || artifact.absolute !== `${repositoryRoot}/${artifact.missionRelative}`) {
    throw new Error(`LIVE_P3_MANIFEST_MISMATCH:${artifact.missionRelative}`);
  }
}
const head = execFileSync("/usr/bin/git",["rev-parse","HEAD"],{ cwd:productRoot,encoding:"utf8" }).trim();
const status = execFileSync("/usr/bin/git",["status","--porcelain=v1"],{ cwd:productRoot,encoding:"utf8" }).trim();
if (head !== manifest.productRevision || status.length !== 0) {
  throw new Error("LIVE_P3_PRODUCT_CUSTODY_MISMATCH");
}
process.stdout.write(`LIVE_P3 manifest verified: ${manifest.artifactCount} artifacts; product clean at ${head}\n`);
