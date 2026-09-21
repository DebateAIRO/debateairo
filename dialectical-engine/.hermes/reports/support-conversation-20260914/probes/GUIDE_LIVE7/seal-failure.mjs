import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence = join(root, "evidence");
const logs = join(root, "logs");
const probes = join(root, "probes", "GUIDE_LIVE7");
const agentReports = join(root, "agent-reports");
const revision = "152eed4da1cd3e66b74d8301159ba76427552409";
const ticket = "t_248ebea2";
const receiptPath = join(evidence, "GUIDE_LIVE7-receipt.json");
const actualPath = join(evidence, "GUIDE_LIVE_GUIDE12-actual-receipt.json");
const actual = JSON.parse(await readFile(actualPath, "utf8"));
const custody = JSON.parse(await readFile(join(evidence, "GUIDE_LIVE7-idle-custody.json"), "utf8"));

const sha256 = buffer => createHash("sha256").update(buffer).digest("hex");
const writeNew = async (path, value) => writeFile(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });

if (actual.finalCommit !== revision || actual.attemptedRowCount !== 15 || actual.completedRowCount !== 15 || actual.completed !== false) {
  throw new Error("GUIDE_LIVE7_SEAL_ACTUAL_RECEIPT_INVALID");
}
if (actual.networkCounts?.createSession !== 2 || actual.networkCounts?.sendMessage !== 15) {
  throw new Error("GUIDE_LIVE7_SEAL_TRAFFIC_COUNTS_INVALID");
}
if (actual.attemptedRows?.at(-1) !== 43 || actual.rows?.at(-1)?.sequence !== 43) {
  throw new Error("GUIDE_LIVE7_SEAL_LAST_ROW_INVALID");
}

const countBy = (rows, getter) => Object.fromEntries(
  [...new Set(rows.map(getter))].sort().map(key => [key, rows.filter(row => getter(row) === key).length])
);
const outcomeCounts = countBy(actual.rows, row => row.api.outcome);
const originCounts = countBy(actual.rows, row => row.attribution.responseOrigin);
const rowSummary = {
  schemaVersion: 1,
  node: "GUIDE_LIVE7",
  revision,
  containsResponseText: false,
  completedRowCount: actual.rows.length,
  rows: actual.rows.map(row => ({
    sequence: row.sequence,
    kind: row.kind,
    family: row.family,
    mode: row.mode,
    language: row.language,
    branch: row.branch,
    outcome: row.api.outcome,
    responseOrigin: row.attribution.responseOrigin,
    httpStatus: row.api.status,
    sourceIds: row.api.sources.map(source => source.id),
    actionIds: row.api.actions.map(action => action.id),
    apiDomTextEqual: row.attribution.apiDomTextEqual,
    apiDomSourcesEqual: row.attribution.apiDomSourcesEqual,
    apiDomActionsEqual: row.attribution.apiDomActionsEqual,
    diagnostic: row.diagnostic
  })),
  outcomeCounts,
  originCounts
};
await writeNew(join(evidence, "GUIDE_LIVE7-partial-row-summary.json"), rowSummary);

const screenshots = [];
for (const path of actual.screenshots) {
  const bytes = await readFile(path);
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!png) throw new Error("GUIDE_LIVE7_SCREENSHOT_NOT_PNG");
  screenshots.push({ absolute: path, sha256: sha256(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}
if (screenshots.length !== 15) throw new Error("GUIDE_LIVE7_SCREENSHOT_COUNT_INVALID");
await writeNew(join(evidence, "GUIDE_LIVE7-screenshot-qa.json"), {
  schemaVersion: 1,
  node: "GUIDE_LIVE7",
  revision,
  verdict: "PASS_PARTIAL_CAPTURE_SCREENSHOT_INTEGRITY",
  count: screenshots.length,
  screenshots
});

const failure = {
  schemaVersion: 1,
  node: "GUIDE_LIVE7",
  ticket,
  session: "/root/preview",
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_UI_TRANSITION",
  rowProof: { verdict: "PASS", resultCode: "GUIDE_ROW_PROOF_ALL_ROWS_PASS", rows: 54 },
  traffic: {
    browserStarted: true,
    sessions: actual.networkCounts.createSession,
    supportRequests: actual.networkCounts.sendMessage,
    attemptedRows: actual.attemptedRowCount,
    completedRows: actual.completedRowCount,
    forbiddenAnswers: actual.networkCounts.forbiddenAnswers,
    forbiddenConsent: actual.networkCounts.forbiddenConsent
  },
  completed: {
    canonicalSequences: actual.rows.map(row => row.sequence),
    lastCanonicalRow: { sequence: 43, kind: "PROMPT_INJECTION", family: "pricing-placeholder", mode: "full", language: "ro" },
    outcomeCounts,
    originCounts,
    screenshots: screenshots.length,
    navigations: actual.navigations.length
  },
  failure: {
    nextCanonicalRow: { sequence: 3, kind: "GUIDE_FAMILY", family: "pricing-placeholder", mode: "compact", language: "ro" },
    stage: "OPEN_COMPACT_AFTER_WIDGET_TOGGLE_BEFORE_COMPOSER_VISIBLE",
    requestStarted: false,
    sessionCreatedForNextGroup: false,
    fixedCode: "GUIDE_HARNESS_COMPACT_COMPOSER_VISIBILITY_TIMEOUT",
    observedExceptionClass: "TimeoutError",
    observedWaitMs: 30000,
    observedLocator: ".supportAssistantCompact .supportComposer input[name=\"support-message\"]",
    safeUiStateBeyondLocatorTimeout: "UNAVAILABLE",
    actualReceiptFailureCode: actual.failureCode,
    actualReceiptFailure: actual.failure,
    actualReceiptFailureObservation: actual.failureObservation,
    nodeChild: "UNCAUGHT_TIMEOUT_NONZERO_NUMERIC_STATUS_NOT_CAPTURED",
    shellPipeline: "EXIT_0_FROM_TEE_WITHOUT_PIPEFAIL",
    causeAttribution: "UNDETERMINED"
  },
  retryPerformed: false,
  extraSupportOrModelRequestAfterFailure: false,
  boundedNextDiscriminator: "In a separate zero-Support-request UI diagnosis, capture fixed visibility/count/expanded-state enums immediately after the compact widget toggle at 390x844 and compare the rendered compact root/composer contract; do not weaken the locator or infer product versus harness cause from this timeout alone.",
  postfailureCustody: custody,
  ownerManualScript: { produced: false, reason: "The packet conditions it on successful all-54 capture; no extra capacity read or owner-session claim was made after this failure." },
  ongoingPrivateLogExcludedFromArtifacts: true
};
await writeNew(join(evidence, "GUIDE_LIVE7-failure.json"), failure);

const report = `# GUIDE_LIVE7 — partial actual-capture failure report

## Result

- Node/ticket/session: \`GUIDE_LIVE7\` / \`${ticket}\` / \`/root/preview\`
- Revision: \`${revision}\` (clean)
- Verdict: \`FAIL_PARTIAL_ACTUAL_CAPTURE_UI_TRANSITION\`
- Actual capture: 15 Support requests and 15 completed rows; stopped once before the next row
- Retry: none

## Pretraffic controls

The reused detached supervisor PID/PGID \`77769\`, PPID \`1\`, passed clean-revision, listener, unrelated-service, and ordinary TLS checks. All 56 GUIDE12 output paths and the browser profile were absent. One fresh capacity read materialized the exact 18-key gate, and the reviewed row-proof adapter passed all 54 exact-product rows before traffic. An initial shell redirection used a product-relative evidence path and failed before gate or proof execution; it issued no traffic. The corrected invocation reused the same still-fresh capacity evidence and did not reread capacity.

## Observed rows

Fifteen rows completed with HTTP 200. Outcomes were 11 \`ANSWER_GROUNDED\`, 3 \`REFUSE_ZONE\`, and 1 \`REFUSE_INJECTION\`. Origins were 10 \`MODEL_ACCEPTED_DRAFT\`, 1 \`REVIEWED_FALLBACK\`, 1 \`DETERMINISTIC_PRIVATE_REFUSAL\`, 2 \`DETERMINISTIC_RECOVERY\`, and 1 \`DETERMINISTIC_INJECTION_REFUSAL\`. The text-free row summary records all canonical identities, outcomes, origins, public source/action IDs, diagnostic enums/counts, and API/DOM equality. Fifteen PNGs passed signature and dimension checks. No navigation row had been reached.

## Failure

The last completed canonical row was sequence 43, Romanian full-surface prompt-injection for the pricing family. The next scheduled row was sequence 3, Romanian compact-surface pricing. Before that row was attempted or sent, the compact transition set a 390x844 viewport, loaded the base URL, activated the support widget toggle, and timed out after 30 seconds waiting for the compact composer input to become visible. The safe API counters remain 15 send-message calls and 2 create-session calls, so the failure did not issue the next Support request or create the next group session.

The capture child threw an uncaught \`TimeoutError\`. Its numeric nonzero exit status was not independently retained because the outer shell piped through \`tee\` without \`pipefail\`; the observed pipeline status was 0 from \`tee\`. The partial receipt therefore remains \`completed:false\` with generic \`GUIDE_HARNESS_CAPTURE_FAILED\`, while its failure/failureObservation fields are null. No broader safe UI state was captured. This evidence does not establish whether product rendering, state, timing, or harness selection caused the transition failure.

The smallest next discriminator is a separate zero-Support-request UI probe that records only fixed visibility/count/expanded-state enums immediately after the compact widget toggle at 390x844 and compares them with the reviewed compact root/composer contract. It must not issue a Support/model request, weaken the locator, or reuse this run as a successful capture.

## Capacity and custody

The partial run created two sessions and sent fifteen messages. A manual owner script was not produced because the packet conditions it on successful all-54 capture; no extra capacity read or immediate testability claim was made. Postfailure custody passed at the same detached supervisor, all 12 owned listeners and 9 unrelated listeners remained preserved, and ordinary system TLS Help returned HTTP 200. The preview remains running. This is not readiness, checkpoint, or acceptance.
`;
await writeNew(join(evidence, "GUIDE_LIVE7.md"), report);

const selfReport = `# GUIDE_LIVE7 self-report

## Identity and verdict

- Ticket/session: \`${ticket}\` / \`/root/preview\`
- Revision: \`${revision}\`
- Verdict: \`FAIL_PARTIAL_ACTUAL_CAPTURE_UI_TRANSITION\`
- Usage: unavailable; no token budget was exposed.

## SKILLS LOADED

- \`superpowers:using-superpowers\`
- \`superpowers:receiving-code-review\`
- \`superpowers:systematic-debugging\`
- \`superpowers:test-driven-development\`
- \`superpowers:verification-before-completion\`
- mission heartbeat protocol and worker-role instructions retained from this original session

## Handoff

Clean revision, owned-runtime custody, output absence, one fresh capacity read, exact gate materialization, and all-54 row proof passed. The single actual capture completed 15 rows, then stopped before canonical sequence 3 while opening the compact Romanian surface. It timed out waiting for the compact composer after the widget toggle. The next request was not sent, no retry occurred, and the result is preserved as a partial failure.

The runtime remains detached under PID/PGID \`77769\`; clean revision, all 12 owned listeners, all 9 unrelated listeners, and ordinary TLS HTTP 200 passed after failure. The bounded follow-up is a no-traffic compact-transition discriminator. No product or harness cause is inferred.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The expensive repeated pattern is a long serial live capture discovering a UI transition defect after capacity, gate, proof, and fifteen model-backed rows have already succeeded. The static row proof validates response policies but cannot prove that every UI surface can be reopened at runtime. The launch wrapper also hid the child failure status behind \`tee\`, forcing manual qualification of an otherwise clear stop.

The capture tool should generate the launcher and receipts from one typed contract, enable pipeline failure propagation, and run a zero-request UI-transition preflight across the exact full/compact, language, viewport, and session-reset transitions before the fresh capacity read. Its live phase should persist a fixed failure checkpoint around every fallible UI step, just as the API boundary already does. This keeps the safety and single-sample rules while preventing another 15-row or longer paid run from being lost to a deterministic surface-open failure.

The preview remains useful for ordinary inspection, but the 54-row demonstration is incomplete and no readiness or acceptance claim is made.
`;
await writeNew(join(agentReports, "GUIDE_LIVE7.md"), selfReport);

const candidates = [
  join(evidence, "GUIDE_LIVE7-freeze-resume.json"),
  join(evidence, "GUIDE_LIVE7-gate-template.json"),
  join(evidence, "GUIDE_LIVE7-gate.json"),
  join(evidence, "GUIDE_LIVE7-inputs.json"),
  join(evidence, "GUIDE_LIVE7-output-absence.json"),
  join(evidence, "GUIDE_LIVE7-readiness.json"),
  join(evidence, "GUIDE_LIVE7-runtime-capacity.json"),
  join(evidence, "GUIDE_LIVE7-static-custody.json"),
  join(evidence, "GUIDE_ROW_PROOF-run-LIVE7.json"),
  actualPath,
  join(evidence, "GUIDE_LIVE7-idle-custody.json"),
  join(evidence, "GUIDE_LIVE7-partial-row-summary.json"),
  join(evidence, "GUIDE_LIVE7-screenshot-qa.json"),
  join(evidence, "GUIDE_LIVE7-failure.json"),
  join(evidence, "GUIDE_LIVE7.md"),
  join(agentReports, "GUIDE_LIVE7.md"),
  join(logs, "GUIDE_LIVE7-static-custody.log"),
  join(logs, "GUIDE_LIVE7-output-absence.log"),
  join(logs, "GUIDE_LIVE7-readiness.log"),
  join(logs, "GUIDE_LIVE7-capacity.log"),
  join(logs, "GUIDE_LIVE7-gate.log"),
  join(logs, "GUIDE_LIVE7-row-proof.log"),
  join(logs, "GUIDE_LIVE7-capture.log"),
  join(logs, "GUIDE_LIVE7-idle-custody.log"),
  ...actual.screenshots
];
for (const name of await readdir(probes)) candidates.push(join(probes, name));
const artifacts = [];
for (const absolute of [...new Set(candidates)].sort()) {
  if (absolute.endsWith("GUIDE_LIVE7-stack.log") || absolute === receiptPath) continue;
  const info = await stat(absolute);
  if (!info.isFile()) continue;
  const bytes = await readFile(absolute);
  artifacts.push({ absolute, sha256: sha256(bytes), bytes: bytes.length });
}
const receipt = {
  schemaVersion: 1,
  node: "GUIDE_LIVE7",
  ticket,
  session: "/root/preview",
  revision,
  verdict: "FAIL_PARTIAL_ACTUAL_CAPTURE_UI_TRANSITION",
  artifactCount: artifacts.length,
  artifacts,
  excluded: [{ absolute: join(logs, "GUIDE_LIVE7-stack.log"), reason: "ongoing private runtime log" }]
};
await writeNew(receiptPath, receipt);
process.stdout.write(`${JSON.stringify({ verdict: receipt.verdict, artifactCount: artifacts.length, receiptPath }, null, 2)}\n`);
