import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const baseRevision = "8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6";
const productRevision = "c34c64d4e643e404cefe96dfaf167536ae364a94";
const kbVersion = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const productPaths = [
  "apps/api/src/support/recovery-intent.ts",
  "tests/architecture/sup-03-projection.test.ts",
  "tests/architecture/support-catalog-coverage.test.ts",
  "tests/integration/support-routes.test.ts",
  "tests/unit/support-context.test.ts",
  "tests/unit/support-recovery-intent.test.ts",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const absoluteArtifact = (relative) => `${reportRoot}/${relative}`;
const bindAbsolute = (absolute) => {
  const bytes = readFileSync(absolute);
  return { absolute, sha256: sha256(bytes), bytes: bytes.length };
};
const bindProduct = (laneRelative) => {
  const bytes = readFileSync(`${productRoot}/${laneRelative}`);
  return { laneRelative, sha256: sha256(bytes), bytes: bytes.length };
};
const writeJson = (absolute, value) =>
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);

const actualRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: productRoot, encoding: "utf8",
}).trim();
if (actualRevision !== productRevision) throw new Error(`revision mismatch ${actualRevision}`);
const dirty = execFileSync("git", ["status", "--short"], {
  cwd: productRoot, encoding: "utf8",
}).trim();
if (dirty !== "") throw new Error(`dirty product lane: ${dirty}`);
const changed = execFileSync("git", ["diff", "--name-only", `${baseRevision}..${productRevision}`], {
  cwd: productRoot, encoding: "utf8",
}).trim().split("\n").filter(Boolean).map((path) =>
  path.startsWith("dialectical-engine/") ? path.slice("dialectical-engine/".length) : path
);
if (JSON.stringify(changed) !== JSON.stringify([...productPaths].sort())) {
  throw new Error(`scope mismatch: ${JSON.stringify(changed)}`);
}

const suiteLogPath = absoluteArtifact("logs/GUIDE_TYPEFIX-suite.log");
const typecheckLogPath = absoluteArtifact("logs/GUIDE_TYPEFIX-typecheck.log");
const baselineLogPath = absoluteArtifact("logs/ATTEST_P2-typecheck-final2.log");
const evalLogPath = absoluteArtifact("logs/GUIDE_TYPEFIX-eval.log");
const suiteLog = readFileSync(suiteLogPath, "utf8");
const typecheckLog = readFileSync(typecheckLogPath);
const baselineLog = readFileSync(baselineLogPath);
const evalLog = readFileSync(evalLogPath, "utf8");
if (!suiteLog.includes("Test Files  33 passed (33)") ||
    !suiteLog.includes("Tests  1496 passed | 1 todo (1497)")) {
  throw new Error("exact33 summary mismatch");
}
const typecheckDiagnostics = (typecheckLog.toString("utf8").match(/error TS\d+:/gu) ?? []).length;
const baselineDiagnostics = (baselineLog.toString("utf8").match(/error TS\d+:/gu) ?? []).length;
const byteIdentical = typecheckLog.equals(baselineLog);
if (!byteIdentical || typecheckDiagnostics !== 76 || baselineDiagnostics !== 76) {
  throw new Error("typecheck output is not the exact attributed baseline");
}
const evalRuns = [...evalLog.matchAll(/run (\d+): structural (\d+)\/(\d+);/gu)].map((match) => ({
  run: Number(match[1]), passed: Number(match[2]), applicable: Number(match[3]),
}));
if (evalRuns.length !== 3 || evalRuns.some((run) => run.passed !== 60 || run.applicable !== 60) ||
    !evalLog.includes("rubric: PENDING (independent-eval-author)") ||
    !evalLog.includes("VERDICT (worst run): PENDING")) {
  throw new Error("controlled evaluator summary mismatch");
}
const classCounts = Object.fromEntries(
  [...evalLog.matchAll(/class ([A-G]): (\d+)\/(\d+)/gu)]
    .slice(0, 7)
    .map((match) => [match[1], { passed: Number(match[2]), applicable: Number(match[3]) }])
);
const measuredAt = new Date().toISOString();

const suitesPath = absoluteArtifact("evidence/GUIDE_TYPEFIX-required-suites.json");
const suites = JSON.parse(readFileSync(suitesPath, "utf8"));
writeJson(suitesPath, {
  ...suites,
  status: "PASSED",
  exitCode: 0,
  passed: 1496,
  failed: 0,
  TODO: 1,
  log: bindAbsolute(suiteLogPath),
  testFiles: { passed: 33, failed: 0, total: 33 },
  completedAt: measuredAt,
});

const typecheckPath = absoluteArtifact("evidence/GUIDE_TYPEFIX-typecheck-comparison.json");
writeJson(typecheckPath, {
  schemaVersion: 1,
  node: "GUIDE_TYPEFIX",
  ticket: "t_a8d71466",
  revision: productRevision,
  command: ["pnpm", "run", "typecheck"],
  exitCode: 1,
  exitMeaning: "ATTRIBUTED_BASELINE_ONLY",
  baseline: { ...bindAbsolute(baselineLogPath), diagnostics: baselineDiagnostics },
  current: { ...bindAbsolute(typecheckLogPath), diagnostics: typecheckDiagnostics },
  byteIdentical,
  missionAddedDiagnostics: 0,
  resolvedFromGuideRecompose: 19,
  measuredAt,
});

const evalPath = absoluteArtifact("evidence/GUIDE_TYPEFIX-eval-summary.json");
writeJson(evalPath, {
  schemaVersion: 1,
  node: "GUIDE_TYPEFIX",
  ticket: "t_a8d71466",
  revision: productRevision,
  command: ["pnpm", "run", "support:eval"],
  exitCode: 1,
  exitMeaning: "PENDING_INDEPENDENT_QUALITY_RUBRIC",
  mode: "deterministic-structural",
  runs: evalRuns,
  classes: classCounts,
  realFirstToken: "NOT_APPLICABLE",
  rubric: "PENDING",
  log: bindAbsolute(evalLogPath),
  measuredAt,
});

const manifestPath = absoluteArtifact("evidence/GUIDE_TYPEFIX-product-manifest.json");
writeJson(manifestPath, {
  schemaVersion: 1,
  node: "GUIDE_TYPEFIX",
  ticket: "t_a8d71466",
  baseRevision,
  finalRevision: productRevision,
  productFiles: productPaths.map(bindProduct),
  scopeExact: true,
  clean: true,
  measuredAt,
});

const evidencePath = absoluteArtifact("evidence/GUIDE_TYPEFIX.md");
writeFileSync(evidencePath, `# GUIDE_TYPEFIX evidence

- Base: \`${baseRevision}\`
- Scoped commit: \`${productRevision}\`
- Product scope: exactly six authorized files; the product lane is clean.
- Existing RED: GUIDE_RECOMPOSE measured 19 added TypeScript diagnostics across those six files.
- Remedy: preserve recovery-parser behavior with a defined fallback for an unreachable missing array element; retain tuple types through direct \`readFile\` promises; widen only the test lookup key type; conform the answer fixture to the port's literal escalation contract; copy a readonly expected-id list into Vitest's mutable matcher input; and type generated callback parameters explicitly.
- Exact 33-file frame: 33/33 files, 1,496 passed, 0 failed, 1 TODO.
- Typecheck: rc1 with 76 diagnostics; output is byte-identical to the frozen attributed baseline (SHA-256 \`06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0\`). The 19 GUIDE_RECOMPOSE additions are absent.
- Controlled evaluator: three runs of 60/60 structural cases; A20/B6/C10/D12/E6/F3/G3; independent quality rubric remains PENDING and therefore exits 1.
- Strict corpus: 44 entries at KB version \`${kbVersion}\`; owner recovery ratification remains blank.
- Limits: no browser, live HTTP, provider/model request, preview lifecycle, checkpoint acceptance, or separate review was performed.
`);

const reportPath = absoluteArtifact("agent-reports/GUIDE_TYPEFIX.md");
writeFileSync(reportPath, `# GUIDE_TYPEFIX self-report

## Result

The 19 added diagnostics were removed in the exact six-path scope. Runtime production behavior is unchanged; five changes are test typing/fixture conformance and the sole production expression preserves the prior comparison result for its unreachable undefined-index case.

The final 33-file frame passed 1,496 tests with one existing TODO. Typecheck still exits 1 because the repository retains its attributed 76-diagnostic baseline; the final log is byte-identical to that baseline. The controlled evaluator remained structurally green at 60/60 for three runs while its independent quality rubric stayed PENDING.

## Skills loaded

Retained same-session BODY reads: \`superpowers:using-superpowers\`, \`heartbeat-protocol\`, \`heartbeat-worker\`, \`superpowers:receiving-code-review\`, \`superpowers:test-driven-development\`, \`superpowers:systematic-debugging\`, and \`superpowers:verification-before-completion\`.

## Retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The recurring cost was reconstructing command, baseline, and receipt semantics from prose after each bounded correction. A single executable node manifest should carry the frozen base, exact write paths, command argv, expected nonzero-exit meanings, baseline hashes, and receipt schema. The runner can then acquire the lease, verify scope, execute each command once, compare diagnostic multisets or exact bytes, and emit receipts automatically.

The 76-diagnostic repository baseline also hid newly introduced errors until a later composed typecheck. CI should store an attributed diagnostic allowlist and reject any delta at every scoped commit. Test fixtures should use typed builders or \`satisfies\` at construction time, avoiding delayed literal-widening and readonly-matcher failures. Generated matrix helpers should declare their callback types once at the data boundary.

Evidence packaging should be generated by the same runner that captures commands. That removes repeated log parsing and hash transcription while keeping the distinction between a structurally green evaluator and a PENDING independent quality rubric.
`);

const artifactPaths = [
  "evidence/GUIDE_TYPEFIX.md",
  "evidence/GUIDE_TYPEFIX-snapshot-receipt.json",
  "evidence/GUIDE_TYPEFIX-required-suites.json",
  "evidence/GUIDE_TYPEFIX-typecheck-comparison.json",
  "evidence/GUIDE_TYPEFIX-eval-summary.json",
  "evidence/GUIDE_TYPEFIX-product-manifest.json",
  "agent-reports/GUIDE_TYPEFIX.md",
  "logs/GUIDE_TYPEFIX-suite.log",
  "logs/GUIDE_TYPEFIX-typecheck.log",
  "logs/GUIDE_TYPEFIX-eval.log",
  "probes/GUIDE_TYPEFIX/build-preflight.mts",
  "probes/GUIDE_TYPEFIX/input-verification.json",
  "probes/GUIDE_TYPEFIX/package-evidence.mjs",
];
const receiptPath = absoluteArtifact("evidence/GUIDE_TYPEFIX-receipt.json");
writeJson(receiptPath, {
  schemaVersion: 1,
  node: "GUIDE_TYPEFIX",
  ticket: "t_a8d71466",
  session: "/root/requirements",
  baseRevision,
  productRevision,
  kbVersion,
  verdict: "AUTHOR_VERIFIED_PENDING_SEPARATE_REVIEW",
  productFiles: productPaths.map(bindProduct),
  verification: {
    exact33: { exitCode: 0, testFiles: 33, passed: 1496, failed: 0, todo: 1 },
    typecheck: {
      exitCode: 1, exitMeaning: "ATTRIBUTED_BASELINE_ONLY",
      baselineDiagnostics: 76, currentDiagnostics: 76, missionAddedDiagnostics: 0,
      byteIdentical: true,
    },
    supportEval: {
      exitCode: 1, exitMeaning: "PENDING_INDEPENDENT_QUALITY_RUBRIC",
      runs: 3, passedPerRun: 60, failedPerRun: 0, rubric: "PENDING",
    },
    snapshot: { entryCount: 44, kbVersion, ownerRecoveryFieldsBlank: true },
  },
  artifacts: artifactPaths.map((relative) => bindAbsolute(absoluteArtifact(relative))),
  receiptExcludesSelf: true,
  leasesReleased: { heavy: true, git: true },
  measuredAt,
});

console.log(JSON.stringify({
  productRevision,
  productFiles: productPaths.length,
  artifacts: artifactPaths.length,
  suite: { passed: 1496, todo: 1 },
  typecheck: { byteIdentical, diagnostics: typecheckDiagnostics },
  evalRuns,
  receipt: bindAbsolute(receiptPath),
}));
