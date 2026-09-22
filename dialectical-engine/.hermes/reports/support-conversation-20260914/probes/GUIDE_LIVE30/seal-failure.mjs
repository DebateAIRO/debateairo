import { createHash } from "node:crypto";
import { access,readdir,readFile,stat,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine";
const R=`${root}/.hermes/reports/support-conversation-20260914`,E=`${R}/evidence`,L=`${R}/logs`,A=`${R}/agent-reports`,P=`${R}/probes/GUIDE_LIVE30`;
const revision="0d34f82f4a2188d0ce1db04655b693798ffd2169";
const verdict="FAILED_CAPTURE_SCREENSHOT_FOOTER_UNREACHABLE_NO_RETRY";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const exists=async path=>{ try { await access(path);return true; } catch { return false; } };
const desc=async path=>{ const bytes=await readFile(path);return { absolute:path,sha256:sha(bytes),bytes:bytes.byteLength }; };
const actualPath=`${E}/GUIDE_LIVE_GUIDE22-actual-receipt.json`;
const actual=await json(actualPath),capacity=await json(`${E}/GUIDE_LIVE30-capacity.json`),readiness=await json(`${E}/GUIDE_LIVE30-readiness.json`),rowProof=await json(`${E}/GUIDE_LIVE30-row-proof-status.json`),capture=await json(`${E}/GUIDE_LIVE30-capture.json`),preflight=await json(`${E}/GUIDE_LIVE30-preflight.json`);
const failure=actual.failureObservation;
const failedRow=actual.freshRows.find(row=>row.sequence===23);
const failedTopPath=`${E}/GUIDE_LIVE_GUIDE22-row-23-original-pane-top.png`;
const failedTopBytes=await readFile(failedTopPath);
const branchCounts=Object.entries(actual.freshRows.reduce((counts,row)=>(counts[row.branch]=(counts[row.branch]??0)+1,counts),{})).map(([branch,count])=>({ branch,count }));
const summary={
  schemaVersion:1,node:"GUIDE_LIVE30",ticket:"t_67ade796",revision,verdict,
  operator:{ toolSessionId:87674,exitStatus:1,stopFirst:true,retries:0 },
  phases:{ preflight:0,readiness:0,capacity:0,gate:0,rowProof:rowProof.status,capture:capture.status,idle:"NOT_RUN" },
  preflight:{ verdict:preflight.ui.verdict,transitions:preflight.ui.transitions,actualSupportRequestsForwarded:preflight.ui.actualSupportRequestsForwarded,checkedAbsent:preflight.checkedAbsent },
  readiness:{ pid:readiness.pid,pgid:readiness.pgid,ordinarySystemTls:readiness.ordinarySystemTls },
  capacity:{ measuredAtUtc:capacity.measuredAtUtc,kbVersion:capacity.kbVersion,limits:capacity.limits,observed:capacity.observed },
  rowProof:{ validatedRows:rowProof.validatedRows,validation:rowProof.validation,completedAtUtc:rowProof.completedAtUtc },
  capture:{ consumedRowCount:capture.consumedRowCount,attemptedRowCount:actual.attemptedRowCount,completedRowCount:actual.completedRowCount,attemptedRows:actual.attemptedRows,createSessionCount:actual.networkCounts.createSession,sendMessageCount:actual.networkCounts.sendMessage,forbiddenAnswers:actual.networkCounts.forbiddenAnswers,forbiddenConsent:actual.networkCounts.forbiddenConsent,sessionCreationTimesUtc:actual.sessionCreationTimesUtc,modelBranchRows:branchCounts.find(value=>value.branch==="MODEL")?.count??0,providerCallCount:"UNAVAILABLE",modelCallCeiling:actual.coveragePlan.modelCallCeiling },
  failure:{ code:actual.failureCode,stage:"POST_RESPONSE_SCREENSHOT_ORIGINAL_PANE_FOOTER",canonicalRow:{ sequence:failure.canonicalRow.sequence,kind:failure.canonicalRow.kind,family:failure.canonicalRow.family,mode:failure.canonicalRow.mode,language:failure.canonicalRow.language,branch:failure.canonicalRow.branch,actionPolicy:failure.canonicalRow.actionPolicy,recoveryClass:failure.canonicalRow.recoveryClass },api:{ status:failure.api.status,outcome:failure.api.outcome,sources:failure.api.sources,actions:failure.api.actions },apiDomEquality:failure.equality,diagnostic:failure.diagnostic,proof:failure.proof,classification:"CAPTURE_INSTRUMENTATION_FAILURE_AFTER_ACCEPTED_APP_RESPONSE",productCause:"NOT_ESTABLISHED" },
  artifactsAtFailure:{ completedScreenshotRows:actual.screenshots.map(value=>value.sequence),failedRow:{ sequence:23,provenance:failedRow.provenance,responseOrigin:failedRow.attribution.responseOrigin,currentArticleIdentitySha256:"UNAVAILABLE_BEFORE_THROW",sourceLayout:{ apiSourceIds:failedRow.api.sources.map(value=>value.id),visibleSourceLabels:failedRow.visible.sources,apiActionIds:failedRow.api.actions.map(value=>value.id),visibleActionIds:failedRow.visible.actions,sourceActionEquality:{ sources:failedRow.attribution.apiDomSourcesEqual,actions:failedRow.attribution.apiDomActionsEqual } },topPanePng:{ path:failedTopPath,sha256:sha(failedTopBytes),bytes:failedTopBytes.byteLength,width:652,height:700 },footerPanePng:"NOT_CREATED",completeExpandedPng:"NOT_CREATED",paneRect:"UNAVAILABLE_BEFORE_THROW",footerRect:"UNAVAILABLE_BEFORE_THROW",scrollTop:"UNAVAILABLE_BEFORE_THROW",scrollHeight:"UNAVAILABLE_BEFORE_THROW",clientHeight:"UNAVAILABLE_BEFORE_THROW",stylesScrollViewportRestored:"UNAVAILABLE_BEFORE_THROW" } },
  futureTiming:{ conservativeFiveSessionNotBeforeUtc:"2026-09-21T09:51:12.590Z",derivation:"second observed session creation + 1h + 5s; not a future capacity PASS",ownerWalkthroughCreated:false },
  custody:{ idlePhaseRun:false,postFailureCustody:"NOT_ESTABLISHED",runtimeRestarted:false,privateRuntimeLogRead:false },
  traffic:{ statusReads:1,capacityQueries:1,createSession:actual.networkCounts.createSession,sendMessage:actual.networkCounts.sendMessage,supportRequests:actual.networkCounts.sendMessage,modelBranchRows:branchCounts.find(value=>value.branch==="MODEL")?.count??0,retries:0 }
};
const summaryPath=`${E}/GUIDE_LIVE30-failure-summary.json`;
await writeFile(summaryPath,`${JSON.stringify(summary,null,2)}\n`,{ flag:"wx",mode:0o600 });

const narrative=`# GUIDE_LIVE30

Verdict: **${verdict}** at \`${revision}\`.

The sealed PROCESS_BIND37 operator ran once under the required escalated execution context. PRETRAFFIC, corrected READINESS, the first and only capacity frame, gate and fresh58 row proof all passed. Capacity was measured at \`${capacity.measuredAtUtc}\`; row proof completed at \`${rowProof.completedAtUtc}\`. Capture stopped first with child status 1 and operator status 1. Idle did not run and no retry, resampling, restart or additional capacity read occurred.

Capture attempted and completed five approved rows, created two sessions and sent five messages. Identifier-free session creation observations are \`${actual.sessionCreationTimesUtc[0].observedAtUtc}\` and \`${actual.sessionCreationTimesUtc[1].observedAtUtc}\`. All five rows were MODEL-branch, \`ANSWER_GROUNDED\`, \`ACCEPTED_DRAFT\` public responses. The sealed receipt does not expose an independent provider-call counter, so the exact provider-call count is UNAVAILABLE; measured model-branch rows are five under the ceiling of 27.

The stop was \`${actual.failureCode}\` on canonical row 23 (export, full, Romanian). Its application response had HTTP 200, \`ANSWER_GROUNDED\`, accepted diagnostics, no actions, and exact API/DOM text, source and action equality. The failure occurred afterward while proving the original-pane footer screenshot. Four earlier rows have complete expanded/top/footer evidence; row 23 produced only its 652×700 top-pane PNG at \`${failedTopPath}\` (SHA-256 \`${sha(failedTopBytes)}\`). The helper threw before persisting row23 pane/footer rectangles, scrollTop/scrollHeight/clientHeight, case identity or restoration state, so those fields are explicitly UNAVAILABLE rather than reconstructed. This is a capture-instrumentation failure after an accepted application response. It does not establish whether the actual pane footer was usable, a product defect, or a provider-response failure.

The fresh frame and partial accepted rows are failed-attempt evidence and are not reusable. A conservative future five-session bound is \`2026-09-21T09:51:12.590Z\`, derived from the second observed creation plus one hour and five seconds; it is not a future capacity PASS. The owner walkthrough was not created because the actual31 capture did not complete. Runtime9 was not restarted and its private ongoing log was not read or hashed. Post-failure custody is unverified because stop-first correctly prevented idle.

SKILLS LOADED: retained mission BODY/protocol context; no new skill invoked. Native session: original Sol \`/root/preview\`, ticket \`t_67ade796\`.

Self-report prompt retained verbatim: “treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.”
`;
const reportPath=`${E}/GUIDE_LIVE30.md`,agentPath=`${A}/GUIDE_LIVE30.md`;
await writeFile(reportPath,narrative,{ flag:"wx",mode:0o600 });
await writeFile(agentPath,narrative,{ flag:"wx",mode:0o600 });
const selfPath=`${E}/GUIDE_LIVE30-self-report.json`;
await writeFile(selfPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_LIVE30",ticket:"t_67ade796",revision,verdict,phases:summary.phases,capture:summary.capture,failure:summary.failure,futureTiming:summary.futureTiming,limitations:["ACTUAL31_INCOMPLETE","POST_FAILURE_CUSTODY_NOT_ESTABLISHED","PROVIDER_CALL_COUNT_UNAVAILABLE","OWNER_WALKTHROUGH_NOT_CREATED","FORGOT_UNRESOLVED","INDEPENDENT_DIAGNOSIS_REQUIRED"] },null,2)}\n`,{ flag:"wx",mode:0o600 });

const phaseArtifacts=[
  `${E}/GUIDE_LIVE30-prerequisites.json`,`${E}/GUIDE_LIVE30-stop.json`,`${E}/GUIDE_LIVE30-preflight.json`,`${E}/GUIDE_LIVE30-readiness.json`,`${E}/GUIDE_LIVE30-capacity.json`,`${E}/GUIDE_LIVE30-gate.json`,`${E}/GUIDE_LIVE30-row-proof-status.json`,`${E}/GUIDE_LIVE30-capture.json`,`${E}/GUIDE_ROW_PROOF-run-LIVE30.json`,`${E}/GUIDE_UI_TRANSITION_PROBE-run-LIVE30.json`,actualPath,
  `${L}/GUIDE_PROCESS_BIND37-operator-preflight.log`,`${L}/GUIDE_PROCESS_BIND37-operator-readiness.log`,`${L}/GUIDE_PROCESS_BIND37-operator-capacity.log`,`${L}/GUIDE_PROCESS_BIND37-operator-gate.log`,`${L}/GUIDE_PROCESS_BIND37-operator-rowProof.log`,`${L}/GUIDE_PROCESS_BIND37-operator-capture.log`,`${L}/GUIDE_LIVE30-row-proof.log`,`${L}/GUIDE_LIVE30-capture.log`,`${L}/GUIDE_UI_TRANSITION_PROBE-LIVE30.log`
];
const screenshotNames=(await readdir(E)).filter(name=>/^GUIDE_LIVE_GUIDE22-row-(?:01|02|15|19|23)-.+\.png$/u.test(name)).sort();
const paths=[
  `${root}/.hermes/planning/support-conversation-20260914/packets/GUIDE_LIVE30.md`,`${E}/GUIDE_LIVE30-inputs.json`,`${E}/GUIDE_LIVE30-freeze-resume.json`,
  `${E}/GUIDE_PROCESS_BIND37-command-contract.json`,`${E}/GUIDE_PROCESS_BIND37-operator-contract.json`,`${E}/GUIDE_PROCESS_BIND37-receipt.json`,
  `${E}/GUIDE_PROCESS_REVIEW37-receipt.json`,`${E}/GUIDE_PROCESS_REVIEW37-consumption.json`,
  ...phaseArtifacts,...screenshotNames.map(name=>`${E}/${name}`),summaryPath,reportPath,agentPath,selfPath,`${P}/seal-failure.mjs`
];
for (const path of paths) if (!(await exists(path))) throw new Error(`GUIDE_LIVE30_RECEIPT_ARTIFACT_MISSING:${path}`);
const manifestPath=`${E}/GUIDE_LIVE30-manifest.json`;
await writeFile(manifestPath,`${JSON.stringify({ schemaVersion:1,node:"GUIDE_LIVE30",ticket:"t_67ade796",revision,verdict,artifacts:await Promise.all(paths.map(desc)) },null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptPath=`${E}/GUIDE_LIVE30-receipt.json`;
const receipt={ schemaVersion:1,node:"GUIDE_LIVE30",ticket:"t_67ade796",revision,verdict,artifacts:await Promise.all([...paths,manifestPath].map(desc)) };
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const bytes=await readFile(receiptPath),metadata=await stat(receiptPath);
console.log(JSON.stringify({ verdict,receiptPath,receiptSha256:sha(bytes),receiptBytes:metadata.size,artifacts:receipt.artifacts.length,attempted:actual.attemptedRowCount,completed:actual.completedRowCount,sessions:actual.networkCounts.createSession,failureCode:actual.failureCode }));
