import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

const repo = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const reportRoot = `${repo}/.hermes/reports/support-conversation-20260914`;
const evidence = `${reportRoot}/evidence`;
const logs = `${reportRoot}/logs`;
const probes = `${reportRoot}/probes/GUIDE_LIVE8`;
const agentReports = `${reportRoot}/agent-reports`;
const packet = `${repo}/.hermes/planning/support-conversation-20260914/packets/GUIDE_LIVE8.md`;
const common = `${repo}/.hermes/planning/support-conversation-20260914/packets/COMMON.md`;
const revision = "152eed4da1cd3e66b74d8301159ba76427552409";
const ticket = "t_6cf2b039";
const capturePath = `${evidence}/GUIDE_LIVE_GUIDE16-actual-receipt.json`;
const capture = JSON.parse(await readFile(capturePath, "utf8"));
const gate = JSON.parse(await readFile(`${evidence}/GUIDE_LIVE8-gate.json`, "utf8"));
const capacity = JSON.parse(await readFile(`${evidence}/GUIDE_LIVE8-runtime-capacity.json`, "utf8"));
const rowProof = JSON.parse(await readFile(`${evidence}/GUIDE_ROW_PROOF-run-LIVE8.json`, "utf8"));
const custody = JSON.parse(await readFile(`${evidence}/GUIDE_LIVE8-idle-custody.json`, "utf8"));
const captureStat = await stat(capturePath);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeNew = (path, value) => writeFile(
  path,
  typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  { mode: 0o600, flag: "wx" },
);
const sourceIds = (sources = []) => sources.map((source) => typeof source === "string" ? source : source.id);
const actionIds = (actions = []) => actions.map((action) => typeof action === "string" ? action : action.id);
const countBy = (items, key) => Object.fromEntries(
  [...new Set(items.map((item) => item[key]))].map((value) => [value, items.filter((item) => item[key] === value).length]),
);
const plusMs = (iso, milliseconds) => new Date(new Date(iso).getTime() + milliseconds).toISOString();

if (capture.completed !== false || capture.attemptedRowCount !== 21 || capture.completedRowCount !== 20) {
  throw new Error("GUIDE_LIVE8_CAPTURE_SHAPE_UNEXPECTED");
}
if (capture.networkCounts?.sendMessage !== 21 || capture.networkCounts?.createSession !== 3) {
  throw new Error("GUIDE_LIVE8_NETWORK_COUNTS_UNEXPECTED");
}
if (capture.failureObservation?.canonicalRow?.sequence !== 26) {
  throw new Error("GUIDE_LIVE8_FAILURE_ROW_UNEXPECTED");
}
if (capture.screenshots?.length !== 20 || capture.rows?.length !== 20) {
  throw new Error("GUIDE_LIVE8_PARTIAL_ARTIFACT_COUNT_UNEXPECTED");
}

const completedRows = capture.rows.map((row) => ({
  sequence: row.sequence,
  prompt: row.prompt,
  kind: row.kind,
  family: row.family,
  mode: row.mode,
  language: row.language,
  branch: row.branch,
  httpStatus: row.api.status,
  outcome: row.api.outcome,
  responseOrigin: row.attribution.responseOrigin,
  sourceIds: sourceIds(row.api.sources),
  actionIds: actionIds(row.api.actions),
  diagnostic: row.diagnostic,
  apiDomEquality: {
    text: row.attribution.apiDomTextEqual,
    sources: row.attribution.apiDomSourcesEqual,
    actions: row.attribution.apiDomActionsEqual,
  },
  selectedLanguage: row.selectedLanguage,
  sessionCreateCount: row.sessionCreateCount,
}));

const failure = capture.failureObservation;
const failurePublicEvidence = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  ticket,
  revision,
  evidenceClass: "APPROVED_PUBLIC_QUESTION_AND_ACCEPTED_VISIBLE_ANSWER",
  canonicalRow: {
    sequence: failure.canonicalRow.sequence,
    prompt: failure.canonicalRow.prompt,
    kind: failure.canonicalRow.kind,
    family: failure.canonicalRow.family,
    mode: failure.canonicalRow.mode,
    language: failure.canonicalRow.language,
    branch: failure.canonicalRow.branch,
  },
  api: {
    status: failure.api.status,
    outcome: failure.api.outcome,
    text: failure.api.text,
    sources: failure.api.sources,
    actions: failure.api.actions,
  },
  visible: {
    text: failure.visible.text,
    sources: failure.visible.sources,
    actions: failure.visible.actions,
  },
  equality: failure.equality,
  diagnostic: failure.diagnostic,
  failureCode: failure.failureCode,
  limits: [
    "This artifact contains only the approved public canonical question, accepted API answer, visible answer, public source/action metadata, and fixed safe diagnostics already present in the sealed actual record.",
    "No rejected draft, private record, headers, credentials, raw runtime log, or underlying exception is included.",
  ],
};
await writeNew(`${evidence}/GUIDE_LIVE8-failed-row-public-evidence.json`, failurePublicEvidence);

const partialSummary = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  ticket,
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING",
  attemptedRowCount: capture.attemptedRowCount,
  completedRowCount: capture.completedRowCount,
  completedRows,
  completedOutcomeCounts: countBy(completedRows, "outcome"),
  completedOriginCounts: countBy(completedRows, "responseOrigin"),
  failure: {
    attemptedOrdinal: capture.attemptedRowCount,
    canonicalSequence: failure.canonicalRow.sequence,
    prompt: failure.canonicalRow.prompt,
    kind: failure.canonicalRow.kind,
    family: failure.canonicalRow.family,
    mode: failure.canonicalRow.mode,
    language: failure.canonicalRow.language,
    branch: failure.canonicalRow.branch,
    phase: failure.phase,
    proofBranch: failure.proof.branch,
    apiReceived: failure.apiReceived,
    httpStatus: failure.api.status,
    outcome: failure.api.outcome,
    responseOrigin: failure.diagnostic.status === "ACCEPTED_DRAFT" ? "MODEL_ACCEPTED_DRAFT" : "UNKNOWN",
    sourceIds: sourceIds(failure.api.sources),
    actionIds: actionIds(failure.api.actions),
    expectedSourceIds: ["guide-how-it-works", "debate-workspace-menus"],
    rowProofDerivedSourceIds: ["app-navigation", "guide-how-it-works", "debate-workspace-menus"],
    equality: failure.equality,
    diagnostic: failure.diagnostic,
    failureCode: failure.failureCode,
  },
  traffic: {
    browserStarted: true,
    sessions: capture.networkCounts.createSession,
    supportRequests: capture.networkCounts.sendMessage,
    forbiddenAnswers: capture.networkCounts.forbiddenAnswers,
    forbiddenConsent: capture.networkCounts.forbiddenConsent,
    modelRequestCeiling: 42,
    retryPerformed: false,
  },
  sessionEvidence: capture.groupSessionEvidence,
  pacing: capture.pacing,
  navigationCount: capture.navigations.length,
  consoleErrorCount: capture.consoleErrorCount,
  consoleErrorCategories: capture.consoleErrorCategories,
  noPrivateControls: capture.noPrivateControls,
  uiTransitions: capture.uiTransitions,
  postReadyStages: capture.postReadyStages,
  limits: [
    "Only 20 of 54 rows completed.",
    "The row-proof adapter passed the declared policy before traffic; the accepted row-26 response exposed only app-navigation and then failed the primary-source assertion.",
    "This observation does not by itself prove whether the product policy, producer selection, model output, or oracle contract is wrong.",
    "No retry, favorable reread, rejected-draft read, raw private-log read, quota change, or extra capacity/status call was performed.",
  ],
};
await writeNew(`${evidence}/GUIDE_LIVE8-partial-row-summary.json`, partialSummary);

const screenshotQa = [];
for (const path of capture.screenshots) {
  const bytes = await readFile(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  screenshotQa.push({
    absolute: path,
    sha256: sha256(bytes),
    bytes: bytes.length,
    pngSignatureValid: signature === "89504e470d0a1a0a",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}
const screenshotResult = screenshotQa.every((item) => item.pngSignatureValid && item.width > 0 && item.height > 0)
  ? "PASS_PARTIAL_20"
  : "FAIL";
await writeNew(`${evidence}/GUIDE_LIVE8-screenshot-qa.json`, {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  revision,
  result: screenshotResult,
  screenshotCount: screenshotQa.length,
  screenshots: screenshotQa,
});
if (screenshotResult !== "PASS_PARTIAL_20") throw new Error("GUIDE_LIVE8_SCREENSHOT_QA_FAILED");

const row3Path = capture.screenshots.find((path) => path.endsWith("row-03.png"));
const row3Stat = row3Path ? await stat(row3Path) : null;
const sessionExpiryUpperBoundUtc = row3Stat ? plusMs(row3Stat.mtime.toISOString(), 60 * 60 * 1000) : null;
const recentMessageExpiryUpperBoundUtc = plusMs(captureStat.mtime.toISOString(), 10 * 60 * 1000);
const dailyMessageExpiryUpperBoundUtc = plusMs(captureStat.mtime.toISOString(), 24 * 60 * 60 * 1000);
const ownerTestability = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  revision,
  result: "NOT_PRODUCED_CAPTURE_FAILED",
  manualScriptProduced: false,
  reason: "The packet conditions the owner walkthrough on a successful all-54 capture; this run stopped after 20 completed rows.",
  initialCapacity: {
    measuredAtUtc: capacity.measuredAtUtc,
    hourlySessionLimit: capacity.limits.support_limit_anon_sessions_1h,
    initialObservedHourlySessions: capacity.observed.maxAnonSessionEvents1hByIp,
    dailyMessageLimit: capacity.limits.support_limit_anon_msgs_24h,
    initialObservedDailyMessages: capacity.observed.maxAnonMessageEvents24hByIp,
    initialDailyHeadroom: capacity.limits.support_limit_anon_msgs_24h - capacity.observed.maxAnonMessageEvents24hByIp,
  },
  partialCapture: {
    sessionsCreated: capture.networkCounts.createSession,
    messagesSent: capture.networkCounts.sendMessage,
    calculatedHourlySessionSlotsRemainingUnderSameBound: capacity.limits.support_limit_anon_sessions_1h - capacity.observed.maxAnonSessionEvents1hByIp - capture.networkCounts.createSession,
    calculatedDailyHeadroomRemainingUnderSameBound: capacity.limits.support_limit_anon_msgs_24h - capacity.observed.maxAnonMessageEvents24hByIp - capture.networkCounts.sendMessage,
  },
  futureFullRun: {
    requiredSessions: 5,
    requiredMessages: 54,
    immediateDailyHeadroomSufficient: false,
    sessionCapacityConservativeNotBeforeUtc: sessionExpiryUpperBoundUtc,
    recentMessageCapacityConservativeNotBeforeUtc: recentMessageExpiryUpperBoundUtc,
    dailyCapacityConservativeNotBeforeUtc: dailyMessageExpiryUpperBoundUtc,
    conservativeNotBeforeUtc: dailyMessageExpiryUpperBoundUtc,
    caveat: "The 24-hour bound uses the actual receipt mtime as an upper bound for all 21 new sends. Older rolling-history expiry remains unknown; no future availability may be claimed without a fresh supported capacity read and no intervening traffic.",
  },
  ownerManualPlanningOnly: {
    plannedSessions: 2,
    plannedMessages: 3,
    scriptUnavailableBecauseCaptureFailed: true,
    dailyHeadroomWouldBeSufficientUnderSameBound: true,
    recentMessageCapacityConservativeNotBeforeUtc: recentMessageExpiryUpperBoundUtc,
    caveat: "No owner manual is authorized from a failed full capture. These numbers are planning metadata only, not testability evidence.",
  },
  freshMeasurementRequired: true,
};
await writeNew(`${evidence}/GUIDE_LIVE8-owner-testability.json`, ownerTestability);

const failureArtifact = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  ticket,
  session: "/root/preview",
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING",
  stage: "ACTUAL_CAPTURE_DIAGNOSTIC_PROJECTED",
  rowProof: {
    verdict: rowProof.verdict,
    resultCode: rowProof.resultCode,
    rowCount: rowProof.rows.length,
  },
  failure: partialSummary.failure,
  completedOutcomeCounts: partialSummary.completedOutcomeCounts,
  completedOriginCounts: partialSummary.completedOriginCounts,
  traffic: partialSummary.traffic,
  ownerTestability: ownerTestability.result,
  retryPerformed: false,
  productOrOracleCauseInferred: false,
  postfailureCustody: {
    pid: custody.pid,
    ppid: custody.ppid,
    pgid: custody.pgid,
    previewListeners: custody.previewListeners,
    unrelatedListenerCount: custody.unrelatedListenerCount,
    unrelatedPreserved: custody.unrelatedPreserved,
    ordinarySystemTls: custody.ordinarySystemTls,
  },
  ongoingPrivateLog: `${logs}/GUIDE_LIVE7-stack.log`,
  ongoingPrivateLogExcludedFromArtifacts: true,
};
await writeNew(`${evidence}/GUIDE_LIVE8-failure.json`, failureArtifact);

const report = `# GUIDE_LIVE8 — partial actual-capture failure report

## Result

- Node/ticket/session: \`GUIDE_LIVE8\` / \`${ticket}\` / \`/root/preview\`
- Revision: \`${revision}\` (clean)
- Verdict: \`FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING\`
- Actual capture: 21 attempts, 20 completed rows, stopped once at canonical row 26
- Retry: none

## Pretraffic controls

The reused detached supervisor PID/PGID \`77769\`, PPID \`1\`, passed exact-revision, listener, unrelated-service, and ordinary TLS checks. All GUIDE16 actual output paths and the browser profile were absent. One fresh supported counts-only capacity read had five free sessions, zero recent ten-minute messages, 70 daily-message headroom, 478 daily-call headroom, no cooldown, no waiters, and an available relay. The exact 18-key gate was materialized, and the reviewed row-proof adapter passed all 54 rows before traffic under the same fresh gate.

## Observed rows

Twenty rows completed with HTTP 200: 16 \`ANSWER_GROUNDED\`, 3 \`REFUSE_ZONE\`, and 1 \`REFUSE_INJECTION\`. Origins were 13 \`MODEL_ACCEPTED_DRAFT\`, 3 \`REVIEWED_FALLBACK\`, 1 \`DETERMINISTIC_PRIVATE_REFUSAL\`, 2 \`DETERMINISTIC_RECOVERY\`, and 1 \`DETERMINISTIC_INJECTION_REFUSAL\`. The sealed row summary records the canonical question, outcome, origin, public source/action IDs, fixed diagnostic projection, and API/DOM equality for every completed row. Twenty PNGs passed signature and dimension checks. No navigation row completed.

## Failure

The last completed row was canonical sequence 22, Romanian compact honesty guidance. Attempt 21 was canonical sequence 26, Romanian compact guide guidance. The API returned HTTP 200 with \`ANSWER_GROUNDED\`; the accepted answer and rendered answer were equal, source/action equality passed, and the fixed diagnostic was \`ACCEPTED_DRAFT\`. The response exposed only \`app-navigation\` and no action. The row's primary-source requirement expected \`guide-how-it-works\` and \`debate-workspace-menus\`; the pretraffic proof had derived \`app-navigation\`, \`guide-how-it-works\`, and \`debate-workspace-menus\`. The runner stopped with \`GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING\` at \`DIAGNOSTIC_PROJECTED\`.

The exact approved public question, accepted API answer, visible answer, public source/action metadata, equality flags, and fixed safe diagnostic are bound in \`GUIDE_LIVE8-failed-row-public-evidence.json\`. No rejected draft, private record, header, credential, underlying exception, or private runtime log is included. This evidence does not establish whether product policy, producer selection, model output, or oracle contract is wrong.

## Capacity and custody

The partial capture created three sessions and sent 21 messages. Initial daily headroom was 70, leaving at most 49 under the same bound, below the 54 needed for another full run. The conservative all-new-traffic expiry bound is the actual receipt mtime plus 24 hours; older rolling-history expiry is unknown and a future run still requires a fresh supported capacity read. A manual owner script was not produced because all 54 rows did not pass.

Postfailure custody passed at the same detached supervisor. All 12 owned listeners and 9 unrelated listeners remained preserved, and ordinary system TLS Help returned HTTP 200. The preview remains running. Forgot remains unresolved and actionless. This is not readiness, checkpoint, or acceptance.
`;
await writeNew(`${evidence}/GUIDE_LIVE8.md`, report);

const selfReport = `# GUIDE_LIVE8 self-report

## Identity and verdict

- Ticket/session: \`${ticket}\` / \`/root/preview\`
- Revision: \`${revision}\`
- Verdict: \`FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING\`
- Usage: unavailable; no token budget was exposed.

## SKILLS LOADED

- \`superpowers:using-superpowers\`
- \`superpowers:receiving-code-review\`
- \`superpowers:systematic-debugging\`
- \`superpowers:test-driven-development\`
- \`superpowers:verification-before-completion\`
- mission heartbeat protocol and worker-role instructions retained from this original session

## Handoff

Readiness, output absence, one fresh capacity read, exact 18-key gate materialization, and the reviewed all-54 row proof passed. The one actual capture completed 20 rows and stopped at attempt 21/canonical sequence 26 with \`GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING\`. The API and DOM agreed on the accepted HTTP 200 \`ANSWER_GROUNDED\` response, its sole public source \`app-navigation\`, and no actions. The exact approved public question and accepted visible answer are preserved in the dedicated safe evidence artifact. No retry, favorable reread, quota change, extra capacity/status read, or further Support/model request occurred.

The runtime remains detached under PID/PGID \`77769\`, PPID \`1\`; all 12 owned listeners, 9 unrelated listeners, and ordinary TLS HTTP 200 passed after failure. A new full run cannot fit the same measured daily bound because 70 initial headroom minus 21 sends leaves at most 49. Conservative time bounds are recorded without claiming availability; a fresh supported capacity read remains required.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The expensive repeated pattern is now clear: static product and policy proofs can pass all 54 rows while a later accepted model response omits a required primary source. The live capture then spends roughly eleven minutes and 21 requests before the first mismatch becomes observable. Repeating the capture would consume scarce daily headroom without resolving whether the producer, policy, or oracle is wrong.

The next upgrade should preserve one-shot safety while recording the source-policy decision at the accepted-response boundary in a fixed, privacy-safe form. A single diagnosis node can then compare declared policy, retrieved context, accepted public sources, and oracle expectation without reading rejected text or replaying prompts. The launcher, gate, row proof, capture, and receipt should remain generated from one typed contract so loader flags, artifact names, freshness, output absence, and safe failure fields cannot drift across packets.

This failure should route to an evidence-led source/oracle diagnosis. It should not weaken the assertion or resample the prompt. The preview remains useful for ordinary UI inspection, but the 54-row demonstration is incomplete and no readiness or acceptance claim is made.
`;
await writeNew(`${agentReports}/GUIDE_LIVE8.md`, selfReport);

const artifactPaths = [
  packet,
  common,
  `${probes}/verify-ready.mjs`,
  `${probes}/assert-capture-outputs-absent.mjs`,
  `${probes}/materialize-runtime-capacity.mjs`,
  `${probes}/materialize-final-gate.mjs`,
  `${probes}/run-row-proof.mjs`,
  `${probes}/run-capture.mjs`,
  `${probes}/verify-static-inputs.mjs`,
  `${probes}/verify-idle-custody.mjs`,
  `${probes}/seal-result.mjs`,
  `${evidence}/GUIDE_LIVE8-inputs.json`,
  `${evidence}/GUIDE_LIVE8-freeze-resume.json`,
  `${evidence}/GUIDE_LIVE8-gate-template.json`,
  `${evidence}/GUIDE_LIVE8-readiness.json`,
  `${evidence}/GUIDE_LIVE8-output-absence.json`,
  `${evidence}/GUIDE_LIVE8-runtime-capacity.json`,
  `${evidence}/GUIDE_LIVE8-gate.json`,
  `${evidence}/GUIDE_ROW_PROOF-run-LIVE8.json`,
  capturePath,
  ...capture.screenshots,
  `${evidence}/GUIDE_LIVE8-idle-custody.json`,
  `${evidence}/GUIDE_LIVE8-failed-row-public-evidence.json`,
  `${evidence}/GUIDE_LIVE8-partial-row-summary.json`,
  `${evidence}/GUIDE_LIVE8-screenshot-qa.json`,
  `${evidence}/GUIDE_LIVE8-owner-testability.json`,
  `${evidence}/GUIDE_LIVE8-failure.json`,
  `${evidence}/GUIDE_LIVE8.md`,
  `${agentReports}/GUIDE_LIVE8.md`,
  `${logs}/GUIDE_LIVE8-readiness.log`,
  `${logs}/GUIDE_LIVE8-output-absence.log`,
  `${logs}/GUIDE_LIVE8-static-inputs.log`,
  `${logs}/GUIDE_LIVE8-runtime-capacity.log`,
  `${logs}/GUIDE_LIVE8-gate.log`,
  `${logs}/GUIDE_LIVE8-row-proof.log`,
  `${logs}/GUIDE_LIVE8-capture.log`,
  `${logs}/GUIDE_LIVE8-idle-custody.log`,
];

const artifacts = [];
for (const absolute of artifactPaths) {
  const bytes = await readFile(absolute);
  artifacts.push({ absolute, sha256: sha256(bytes), bytes: bytes.length });
}
const manifest = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  ticket,
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING",
  artifactCount: artifacts.length,
  artifacts,
};
await writeNew(`${evidence}/GUIDE_LIVE8-manifest.json`, manifest);
const manifestBytes = await readFile(`${evidence}/GUIDE_LIVE8-manifest.json`);
const manifestArtifact = {
  absolute: `${evidence}/GUIDE_LIVE8-manifest.json`,
  sha256: sha256(manifestBytes),
  bytes: manifestBytes.length,
};

const receipt = {
  schemaVersion: 1,
  node: "GUIDE_LIVE8",
  ticket,
  session: "/root/preview",
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_PRIMARY_SOURCE_MISSING",
  stage: "ACTUAL_CAPTURE_DIAGNOSTIC_PROJECTED",
  pretraffic: {
    readiness: "PASS",
    outputAbsence: "PASS",
    capacityReads: 1,
    gateKeys: Object.keys(gate).length,
    rowProofVerdict: rowProof.verdict,
    rowProofResultCode: rowProof.resultCode,
    rowProofRows: rowProof.rows.length,
  },
  capture: {
    attemptedRowCount: capture.attemptedRowCount,
    completedRowCount: capture.completedRowCount,
    completedOutcomeCounts: partialSummary.completedOutcomeCounts,
    completedOriginCounts: partialSummary.completedOriginCounts,
    failure: partialSummary.failure,
    screenshotCount: capture.screenshots.length,
    navigationCount: capture.navigations.length,
  },
  traffic: partialSummary.traffic,
  ownerTestability: {
    result: ownerTestability.result,
    futureFullRunConservativeNotBeforeUtc: ownerTestability.futureFullRun.conservativeNotBeforeUtc,
    freshMeasurementRequired: true,
  },
  custody: {
    pid: custody.pid,
    ppid: custody.ppid,
    pgid: custody.pgid,
    previewListeners: custody.previewListeners,
    unrelatedListenerCount: custody.unrelatedListenerCount,
    unrelatedPreserved: custody.unrelatedPreserved,
    ordinarySystemTls: custody.ordinarySystemTls,
  },
  ongoingPrivateLog: `${logs}/GUIDE_LIVE7-stack.log`,
  ongoingPrivateLogExcludedFromArtifacts: true,
  retryPerformed: false,
  productOrOracleCauseInferred: false,
  heavyLeaseReleased: true,
  gitLeaseUsed: false,
  artifactCount: artifacts.length + 1,
  artifacts: [...artifacts, manifestArtifact],
  receiptExcludesItself: true,
  limits: [
    "Only 20 of 54 rows completed; no full-matrix, navigation, owner-manual, or acceptance claim is available.",
    "The accepted row-26 response omitted the expected primary sources; exact product/oracle cause remains unproved.",
    "Initial daily headroom minus this run's 21 sends leaves at most 49, below a new 54-row run.",
    "Forgot remains unresolved and actionless.",
  ],
};
await writeNew(`${evidence}/GUIDE_LIVE8-receipt.json`, receipt);

for (const artifact of receipt.artifacts) {
  const bytes = await readFile(artifact.absolute);
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
    throw new Error(`GUIDE_LIVE8_ARTIFACT_DRIFT:${artifact.absolute}`);
  }
}

const receiptBytes = await readFile(`${evidence}/GUIDE_LIVE8-receipt.json`);
process.stdout.write(`${JSON.stringify({
  verdict: receipt.verdict,
  attempted: capture.attemptedRowCount,
  completed: capture.completedRowCount,
  artifactCount: receipt.artifactCount,
  manifestSha256: manifestArtifact.sha256,
  receiptSha256: sha256(receiptBytes),
  receiptBytes: receiptBytes.length,
  receiptPath: `${evidence}/GUIDE_LIVE8-receipt.json`,
})}\n`);
