import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const productRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const reportRoot = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const baseRevision = "c34c64d4e643e404cefe96dfaf167536ae364a94";
const productRevision = "2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0";
const kbVersion = "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278";
const productPaths = [
  "apps/api/src/support/public-guide-boundary.ts",
  "apps/api/src/support/recovery-intent.ts",
  "tests/integration/support-routes.test.ts",
  "tests/unit/support-classify.test.ts",
  "tests/unit/support-public-guide-boundary.test.ts",
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

const suiteLogPath = absoluteArtifact("logs/GUIDE_GUARDFIX-suite-final2.log");
const typecheckLogPath = absoluteArtifact("logs/GUIDE_GUARDFIX-typecheck-final.log");
const baselineLogPath = absoluteArtifact("logs/ATTEST_P2-typecheck-final2.log");
const evalLogPath = absoluteArtifact("logs/GUIDE_GUARDFIX-eval.log");
const harnessLogPath = absoluteArtifact("logs/GUIDE_GUARDFIX-harness-controls-final.log");
const suiteLog = readFileSync(suiteLogPath, "utf8");
const typecheckLog = readFileSync(typecheckLogPath);
const baselineLog = readFileSync(baselineLogPath);
const evalLog = readFileSync(evalLogPath, "utf8");
if (!suiteLog.includes("Test Files  33 passed (33)") ||
    !suiteLog.includes("Tests  1535 passed | 1 todo (1536)")) {
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
const harness = JSON.parse(readFileSync(harnessLogPath,"utf8"));
if (harness.schemaVersion !== 2 || harness.result !== "PASS"
  || harness.revision !== productRevision || harness.kbVersion !== kbVersion
  || harness.harnessSha256 !== "f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917"
  || harness.controls !== 62 || harness.passed !== 62) {
  throw new Error("frozen harness proof mismatch");
}
const measuredAt = new Date().toISOString();

const suitesPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-required-suites.json");
const suites = JSON.parse(readFileSync(suitesPath, "utf8"));
writeJson(suitesPath, {
  ...suites,
  status: "PASSED",
  exitCode: 0,
  passed: 1535,
  failed: 0,
  TODO: 1,
  log: bindAbsolute(suiteLogPath),
  testFiles: { passed: 33, failed: 0, total: 33 },
  completedAt: measuredAt,
});

const typecheckPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-typecheck-comparison.json");
writeJson(typecheckPath, {
  schemaVersion: 1,
  node: "GUIDE_GUARDFIX",
  ticket: "t_a542b328",
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

const evalPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-eval-summary.json");
writeJson(evalPath, {
  schemaVersion: 1,
  node: "GUIDE_GUARDFIX",
  ticket: "t_a542b328",
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

const harnessPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-harness-summary.json");
writeJson(harnessPath, {
  schemaVersion: 2,
  node: "GUIDE_GUARDFIX",
  ticket: "t_a542b328",
  revision: productRevision,
  kbVersion,
  result: harness.result,
  controls: harness.controls,
  passed: harness.passed,
  harnessSha256: harness.harnessSha256,
  log: bindAbsolute(harnessLogPath),
  measuredAt,
});

const manifestPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-product-manifest.json");
writeJson(manifestPath, {
  schemaVersion: 1,
  node: "GUIDE_GUARDFIX",
  ticket: "t_a542b328",
  baseRevision,
  finalRevision: productRevision,
  productFiles: productPaths.map(bindProduct),
  scopeExact: true,
  clean: true,
  measuredAt,
});

const evidencePath = absoluteArtifact("evidence/GUIDE_GUARDFIX.md");
writeFileSync(evidencePath, `# GUIDE_GUARDFIX evidence

- Base: \`${baseRevision}\`
- Scoped commit: \`${productRevision}\`
- Product scope: exactly six authorized files; the product lane is clean.
- RED: the focused four-file frame failed 22 cases and passed 686. All five independently observed route members failed through the ordinary answer path.
- GS-1: reset-token/reset-code becomes a recovery subject only when reset and a credential object coexist; generic recovery-code navigation keeps its prior Settings behavior.
- GS-2: comma joins the existing punctuation and conjunction clause boundaries, so negation remains attached to its predicate.
- GS-3: an affirmative account operation with an explicit Support/assistant actor cannot use a same-clause location word to enter the public answer path. User navigation, negated operations and non-operational Support explanations remain public.
- Focused GREEN/property: four files, 710/710. Deterministic route cases persisted actionless refusals and made zero answer-model calls.
- Exact 33-file frame: 33/33 files, 1,535 passed, 0 failed, 1 TODO. A prior final-revision frame preserved one unchanged relay timing failure; the exact case passed alone and the justified full rerun passed.
- Typecheck: rc1 with 76 diagnostics; output is byte-identical to the frozen attributed baseline (SHA-256 \`06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0\`). The intermediate test-only 77th diagnostic and its focused correction are preserved.
- Controlled evaluator: three runs of 60/60 structural cases; A20/B6/C10/D12/E6/F3/G3; independent quality rubric remains PENDING and therefore exits 1.
- Frozen FIX2 harness: schema 2 PASS, 62/62 controls, final revision and KB bound, unchanged executable digest \`f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917\`.
- Strict corpus: 44 entries at KB version \`${kbVersion}\`; owner recovery ratification remains blank.
- Limits: no browser, live HTTP, provider/model request, preview lifecycle, checkpoint acceptance, or separate review was performed.
`);

const reportPath = absoluteArtifact("agent-reports/GUIDE_GUARDFIX.md");
writeFileSync(reportPath, `# GUIDE_GUARDFIX self-report

## Result

The three reviewed guard classes were corrected in exactly two production and four test files. Reset-token/code operations no longer require a password noun, comma and existing clause boundaries keep negation predicate-local, and explicit Support/assistant account operations no longer become public merely because the same clause contains a location word. Paired navigation, negation, private-record, injection, credential and current-message controls remain intact.

Focused RED was 22 failures; focused generated GREEN was 710/710. The final 33-file frame passed 1,535 tests with one existing TODO. One unchanged relay timing assertion failed under the first full load, passed alone, and passed in the justified full rerun. Typecheck still exits 1 because the repository retains its attributed 76-diagnostic baseline; the final log is byte-identical to that baseline. The controlled evaluator remained structurally green at 60/60 for three runs while its independent quality rubric stayed PENDING. The immutable harness rebind passed 62/62 with schema 2 and the expected digest.

## Skills loaded

Retained same-session BODY reads: \`superpowers:using-superpowers\`, \`heartbeat-protocol\`, \`heartbeat-worker\`, \`superpowers:receiving-code-review\`, \`superpowers:test-driven-development\`, \`superpowers:systematic-debugging\`, and \`superpowers:verification-before-completion\`.

## Retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost was reconstructing executable intent from prose and discovering test typing only at final composition. A single node manifest should carry the frozen base, exact writes, RED and GREEN argv, expected nonzero meanings, diagnostic baseline hash, harness digest and receipt schema. The runner can acquire the lease, validate scope, run each stage once and emit the receipts.

The semantic guards should move from overlapping regex windows toward small tokenized predicate records with actor, operation, object, polarity and clause identity. This correction had to align three independently evolved concepts: recovery subject, account-operation verb, and public location. One shared bounded parser would reduce literal patches and make generated EN/RO properties direct.

CI should reject diagnostic deltas at each scoped commit against the attributed allowlist. The omitted tuple callback parameter would then fail before the broad composition. Timing-sensitive relay tests should wait on an observable queue event rather than a fixed 200 ms delay; that unchanged race caused the only final-suite rerun and avoidable evidence work.
`);

const artifactPaths = [
  "evidence/GUIDE_GUARDFIX.md",
  "evidence/GUIDE_GUARDFIX-snapshot-receipt.json",
  "evidence/GUIDE_GUARDFIX-required-suites.json",
  "evidence/GUIDE_GUARDFIX-typecheck-comparison.json",
  "evidence/GUIDE_GUARDFIX-eval-summary.json",
  "evidence/GUIDE_GUARDFIX-harness-summary.json",
  "evidence/GUIDE_GUARDFIX-product-manifest.json",
  "agent-reports/GUIDE_GUARDFIX.md",
  "logs/GUIDE_GUARDFIX-focused-red.log",
  "logs/GUIDE_GUARDFIX-property-green4.log",
  "logs/GUIDE_GUARDFIX-typecheck.log",
  "logs/GUIDE_GUARDFIX-typefix-focused.log",
  "logs/GUIDE_GUARDFIX-suite-final.log",
  "logs/GUIDE_GUARDFIX-relay-race-probe.log",
  "logs/GUIDE_GUARDFIX-suite-final2.log",
  "logs/GUIDE_GUARDFIX-typecheck-final.log",
  "logs/GUIDE_GUARDFIX-eval.log",
  "logs/GUIDE_GUARDFIX-harness-controls-final.log",
  "probes/GUIDE_GUARDFIX/build-preflight.mts",
  "probes/GUIDE_GUARDFIX/input-verification.json",
  "probes/GUIDE_GUARDFIX/package-evidence.mjs",
];
const receiptPath = absoluteArtifact("evidence/GUIDE_GUARDFIX-receipt.json");
writeJson(receiptPath, {
  schemaVersion: 1,
  node: "GUIDE_GUARDFIX",
  ticket: "t_a542b328",
  session: "/root/requirements",
  baseRevision,
  productRevision,
  kbVersion,
  verdict: "AUTHOR_VERIFIED_PENDING_SEPARATE_REVIEW",
  productFiles: productPaths.map(bindProduct),
  verification: {
    exact33: { exitCode: 0, testFiles: 33, passed: 1535, failed: 0, todo: 1 },
    typecheck: {
      exitCode: 1, exitMeaning: "ATTRIBUTED_BASELINE_ONLY",
      baselineDiagnostics: 76, currentDiagnostics: 76, missionAddedDiagnostics: 0,
      byteIdentical: true,
    },
    supportEval: {
      exitCode: 1, exitMeaning: "PENDING_INDEPENDENT_QUALITY_RUBRIC",
      runs: 3, passedPerRun: 60, failedPerRun: 0, rubric: "PENDING",
    },
    frozenHarness: {
      schemaVersion: 2,exitCode: 0,result: "PASS",controls: 62,passed: 62,
      harnessSha256: "f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917",
    },
    focused: { red: { failed: 22,passed: 686 },green: { failed: 0,passed: 710 } },
    transientRelay: {
      fullFrameFailed: true,focusedRecheckPassed: true,justifiedFullRerunPassed: true,
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
  suite: { passed: 1535, todo: 1 },
  typecheck: { byteIdentical, diagnostics: typecheckDiagnostics },
  evalRuns,
  receipt: bindAbsolute(receiptPath),
}));
