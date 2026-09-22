import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sourceRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const detached = `${sourceRoot}/.worktrees/support-cp1-p3-security/dialectical-engine`;
const primary = `${sourceRoot}/.worktrees/support-conversation-cp1/dialectical-engine`;
const revision = "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13";
const retainedRevision = "5731eb6faac25f9712f04aea029a021f6eee9352";
const crossLanePaths = [
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "packages/support-kb/content", "packages/support-kb/recovery/components.json",
  "packages/support-kb/src/catalog.ts", "packages/support-kb/src/context.ts",
  "packages/support-kb/src/index.ts", "packages/support-kb/src/recovery.ts",
  "packages/support-kb/src/navigation.ts", "apps/api/src/support/answer.ts",
];
const retainedPaths = [
  "apps/api/src/support/answer.ts", "apps/api/src/support/public-guide-boundary.ts",
  "apps/api/src/support/classify.ts", "packages/support-kb/src/catalog.ts",
  "packages/support-kb/src/index.ts", "packages/support-kb/src/recovery.ts",
  "apps/api/src/support/recovery-intent.ts", "apps/api/src/support/response-policy.ts",
  "apps/api/src/support/security-guidance.ts", "packages/support-kb/src/navigation.ts",
  "migrations/0050_support_foundation.sql", "migrations/0051_support_cases.sql",
  "migrations/0052_support_tool_calls.sql", "migrations/0053_support_public_incident.sql",
  "migrations/0054_support_keys_audit.sql", "tests/support/testDatabase.ts",
  "packages/db/src/index.ts", "package.json", "pnpm-lock.yaml",
];
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const object = (cwd, ref, path) => git(cwd, "rev-parse", `${ref}:./${path}`);
const crossLane = crossLanePaths.map((path) => ({
  path, detached: object(detached, revision, path), primary: object(primary, revision, path),
}));
const retained = retainedPaths.map((path) => ({
  path, prior: object(detached, retainedRevision, path), current: object(detached, revision, path),
}));
const result = {
  revision, retainedRevision, crossLane, retained,
  crossLaneMismatches: crossLane.filter(({ detached: left, primary: right }) => left !== right),
  retainedMismatches: retained.filter(({ prior, current }) => prior !== current),
};
result.ok = result.crossLaneMismatches.length === 0 && result.retainedMismatches.length === 0;
const outputPath = `${sourceRoot}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY7-dependency-custody.log`;
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ok: result.ok }));
if (!result.ok) process.exitCode = 1;
