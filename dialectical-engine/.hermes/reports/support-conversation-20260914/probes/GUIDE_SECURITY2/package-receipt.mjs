import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const receiptPath = `${root}/.hermes/reports/support-conversation-20260914/evidence/GUIDE_SECURITY2-receipt.json`;
const paths = [
  `${root}/docs/missions/support-conversation-20260914/reviews/GUIDE_SECURITY2.md`,
  `${root}/.hermes/reports/support-conversation-20260914/agent-reports/GUIDE_SECURITY2.md`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-custody-pre-attempt.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-custody-pre.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31-retry.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31-matrix31.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-focused.log`,
  `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-custody-post.log`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/matrix.json`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/matrix31.json`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/run-adjacent-probe.mts`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/run-route31.mts`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/run-custody-post.mjs`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/COMMANDS.txt`,
  `${root}/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2/package-receipt.mjs`,
];
const artifact = (path) => ({
  path,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  bytes: statSync(path).size,
});

const result = {
  schema: "GUIDE_SECURITY2_RECEIPT_V1",
  node: "GUIDE_SECURITY2",
  ticket: "t_4e63dfa5",
  session: "/root/forgot_destination",
  model: "gpt-5.6-sol",
  revision: "2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0",
  base: "c34c64d4e643e404cefe96dfaf167536ae364a94",
  verdict: "REWORK",
  commentsReadThrough: 1789654930,
  usage: "UNAVAILABLE",
  executions: [
    {
      id: "sealed31-preflight",
      command: "run-capture env TSX_DISABLE_CACHE=1 GUIDE_SECURITY2_TARGET_ROOT=<detached> GUIDE_SECURITY2_TARGET_REVISION=<revision> GUIDE_SECURITY2_TARGET_MANIFEST=<manifest> node --import tsx GUIDE_SECURITY2_PREP/run-security2-probe.mts",
      log: `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31.log`,
      rc: 2,
      importsStarted: false,
      result: "authorized dependency symlinks appeared as untracked; harness preflight only",
      runnerSha256: "cbe8c90c6bd098df6c70c74cc2838c2a07d1237ed192d2bf0c16ad09321b9640",
    },
    {
      id: "adjacent4-actual-route",
      command: "run-capture env TSX_DISABLE_CACHE=1 GUIDE_SECURITY2_TARGET_ROOT=<detached> GUIDE_SECURITY2_TARGET_REVISION=<revision> GUIDE_SECURITY2_TARGET_MANIFEST=<manifest> GUIDE_SECURITY2_DEPENDENCY_ROOT=<primary> node --import tsx GUIDE_SECURITY2/run-route31.mts",
      log: `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31-retry.log`,
      rc: 1,
      matrixSha256: "a23b5cc8fc61adfef88e989ef7f10212e24ff13f789ce2c97aee1cbbb7acc890",
      cases: 4,
      passed: 2,
      failed: 2,
      note: "The log filename says route31, but this sole execution self-binds the adjacent4 matrix hash and count. The runner then selected matrix.json; it was not rerun after rebinding to matrix31.",
    },
    {
      id: "sealed31-actual-route",
      command: "run-capture env TSX_DISABLE_CACHE=1 GUIDE_SECURITY2_TARGET_ROOT=<detached> GUIDE_SECURITY2_TARGET_REVISION=<revision> GUIDE_SECURITY2_TARGET_MANIFEST=<manifest> GUIDE_SECURITY2_DEPENDENCY_ROOT=<primary> node --import tsx GUIDE_SECURITY2/run-route31.mts",
      log: `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route31-matrix31.log`,
      rc: 1,
      runnerSha256: "ecbae854e90455477190b6777b4a317b435b1f367119d32b24fa06cdad4f6939",
      matrixSha256: "9b0438841af1dfe9b7fa6925f660a401f8c398887445ffedd8eccc9c4e18c53f",
      cases: 31,
      passed: 25,
      failed: 6,
    },
    {
      id: "changed-unit-files",
      command: "run-capture env LANG=en_US.UTF-8 TSX_DISABLE_CACHE=1 pnpm exec vitest run tests/unit/support-recovery-intent.test.ts tests/unit/support-public-guide-boundary.test.ts tests/unit/support-classify.test.ts --maxWorkers=1",
      log: `${root}/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-focused.log`,
      rc: 0,
      testFiles: 3,
      testsPassed: 562,
    },
  ],
  findings: {
    exactPriorFiveResolved: 5,
    boundedCases: 35,
    boundedPassed: 27,
    boundedFailed: 8,
    unsafeInertAnswerReach: 4,
    actionlessPolicyOrOutputMismatch: 4,
  },
  custody: {
    indexedInputsMatched: 57,
    productFilesMatched: 143,
    expectedDeletedAbsent: 3,
    roleDefiningFilesUnchanged: 9,
    detachedCleanExact: true,
    primaryCleanExact: true,
    temporaryDependencyLinksRemoved: 5,
  },
  artifacts: paths.map(artifact),
};
writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ receiptPath, artifacts: result.artifacts.length }));
