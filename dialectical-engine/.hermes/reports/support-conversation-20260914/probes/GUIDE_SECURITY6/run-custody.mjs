import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sourceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const detached = `${sourceRoot}/.worktrees/support-cp1-p3-security/dialectical-engine`;
const primary = `${sourceRoot}/.worktrees/support-conversation-cp1/dialectical-engine`;
const manifestPath = `${sourceRoot}/.hermes/reports/support-conversation-20260914/evidence/GATE_GUIDE_FINAL5-manifest.json`;
const inputIndexPath = `${sourceRoot}/.hermes/reports/support-conversation-20260914/evidence/GUIDE_SECURITY6-inputs.json`;
const priorReviewRevision = "f3be0af81f1691db6c23494f9e286bb6b10f13bf";
const expectedPriorDelta = [
  "dialectical-engine/apps/api/src/support/answer.ts",
  "dialectical-engine/packages/support-kb/src/catalog.ts",
  "dialectical-engine/packages/support-kb/src/context.ts",
  "dialectical-engine/packages/support-kb/src/index.ts",
  "dialectical-engine/packages/support-kb/src/recovery.ts",
  "dialectical-engine/tests/architecture/support-catalog-coverage.test.ts",
  "dialectical-engine/tests/unit/support-answer-context.test.ts",
  "dialectical-engine/tests/unit/support-context.test.ts",
  "dialectical-engine/tests/unit/support-recovery-components.test.ts",
];
const phase = process.argv[2] ?? "pre";
const outputPath = `${sourceRoot}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY6-custody-${phase}.log`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const inputIndex = JSON.parse(readFileSync(inputIndexPath, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const fileCheck = (entry, path) => {
  if (!existsSync(path)) return { path, reason: "missing" };
  const actual = { sha256: sha256(path), bytes: statSync(path).size };
  return actual.sha256 === entry.sha256 && actual.bytes === entry.bytes
    ? null : { path, expected: { sha256: entry.sha256, bytes: entry.bytes }, actual };
};
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const inputBad = inputIndex.inputs.map((entry) => fileCheck(entry, entry.path)).filter(Boolean);
const productBad = manifest.productFiles
  .map((entry) => fileCheck(entry, `${detached}/${entry.laneRelative}`)).filter(Boolean);
const deletedBad = manifest.deletedProductPaths.filter((path) => existsSync(`${detached}/${path}`));
const roleDefiningFiles = [
  "migrations/0050_support_foundation.sql", "migrations/0051_support_cases.sql",
  "migrations/0052_support_tool_calls.sql", "migrations/0053_support_public_incident.sql",
  "migrations/0054_support_keys_audit.sql", "tests/support/testDatabase.ts",
  "packages/db/src/index.ts", "package.json", "pnpm-lock.yaml",
];
const roleChanged = git(detached, ["diff", "--name-only", `${manifest.base}..${manifest.revision}`, "--", ...roleDefiningFiles])
  .split("\n").filter(Boolean);
const priorDelta = git(detached, ["diff", "--name-only", `${priorReviewRevision}..${manifest.revision}`])
  .split("\n").filter(Boolean);
const links = ["node_modules", "apps/api/node_modules", "apps/ui/node_modules", "apps/runner/node_modules", "packages/support-kb/node_modules"]
  .map((path) => ({ path, present: existsSync(`${detached}/${path}`) }));
const result = {
  phase, revision: manifest.revision, base: manifest.base, priorReviewRevision,
  indexedInputs: inputIndex.inputs.length, inputBad,
  productFiles: manifest.productFiles.length, productBad,
  deleted: manifest.deletedProductPaths.length, deletedBad,
  detached: { head: git(detached, ["rev-parse", "HEAD"]), dirty: git(detached, ["status", "--porcelain", "--untracked-files=all"]) },
  primary: { head: git(primary, ["rev-parse", "HEAD"]), dirty: git(primary, ["status", "--porcelain", "--untracked-files=all"]) },
  roleDefiningFiles, roleChanged, expectedPriorDelta, priorDelta, dependencyLinks: links,
};
const ok = inputBad.length === 0 && productBad.length === 0 && deletedBad.length === 0
  && roleChanged.length === 0 && links.every((link) => !link.present)
  && JSON.stringify(priorDelta) === JSON.stringify(expectedPriorDelta)
  && result.detached.head === manifest.revision && result.detached.dirty === ""
  && result.primary.head === manifest.revision && result.primary.dirty === "";
writeFileSync(outputPath, `${JSON.stringify({ ...result, ok }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ok }));
if (!ok) process.exitCode = 1;
