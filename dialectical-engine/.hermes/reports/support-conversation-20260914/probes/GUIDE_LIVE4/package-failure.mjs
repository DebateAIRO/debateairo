import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=`${root}/evidence`;
const receiptPath=`${evidence}/GUIDE_LIVE_GUIDE7-actual-receipt.json`;
const capacityPath=`${evidence}/GUIDE_LIVE4-runtime-capacity.json`;
const idlePath=`${evidence}/GUIDE_LIVE4-idle-custody.json`;
const captureLogPath=`${root}/logs/GUIDE_LIVE4-capture.log`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));
const writeNewJson=(path,value) => writeFile(path,`${JSON.stringify(value,null,2)}\n`,{ flag:"wx",mode:0o600 });

const [capture,capacity,idle,captureLogStat]=await Promise.all([
  readJson(receiptPath),readJson(capacityPath),readJson(idlePath),stat(captureLogPath)
]);
if (capture.completed !== false || capture.failureCode !== "GUIDE_HARNESS_API_PROJECTION_INVALID"
  || capture.attemptedRowCount !== 15 || capture.completedRowCount !== 14
  || capture.failure?.sequence !== 43 || capture.rows?.length !== 14) {
  throw new Error("GUIDE_LIVE4_FAILURE_SHAPE_INVALID");
}
const failed=capture.failureObservation;
if (failed?.phase !== "ATTEMPTED" || failed?.api !== null || failed?.visible !== null
  || failed?.equality !== null || failed?.diagnostic !== null
  || failed?.canonicalRow?.sequence !== 43) {
  throw new Error("GUIDE_LIVE4_FAILURE_STAGE_INVALID");
}

const rows=capture.rows.map(row => Object.freeze({
  sequence:row.sequence,kind:row.kind,family:row.family,mode:row.mode,language:row.language,
  branch:row.branch,httpStatus:row.api.status,outcome:row.api.outcome,
  sourceIds:row.api.sources.map(({ id }) => id),actionIds:row.api.actions.map(({ id }) => id),
  diagnostic:row.diagnostic,attribution:row.attribution,
  selectedLanguage:row.selectedLanguage,sessionCreateCount:row.sessionCreateCount
}));
const origins=rows.reduce((counts,{ attribution }) => {
  const origin=attribution.responseOrigin;
  counts[origin]=(counts[origin] ?? 0)+1;
  return counts;
},{});
const rowOutcomes={
  schemaVersion:1,node:"GUIDE_LIVE4",ticket:"t_77905880",
  revision:capture.finalCommit,kbVersion:capture.kbVersion,
  completed:false,attemptedRowCount:capture.attemptedRowCount,
  completedRowCount:capture.completedRowCount,attemptedRows:capture.attemptedRows,
  completedRows:rows,originCounts:origins,
  failure:{
    sequence:43,
    prompt:failed.canonicalRow.prompt,
    kind:failed.canonicalRow.kind,family:failed.canonicalRow.family,
    mode:failed.canonicalRow.mode,language:failed.canonicalRow.language,
    branch:failed.canonicalRow.branch,actionPolicy:failed.canonicalRow.actionPolicy,
    recoveryClass:failed.canonicalRow.recoveryClass,
    phase:failed.phase,code:failed.failureCode,
    proof:failed.proof,
    api:"UNAVAILABLE_NOT_PERSISTED",visible:"UNAVAILABLE_NOT_PERSISTED",
    equality:"UNAVAILABLE_NOT_PERSISTED",diagnostic:"UNAVAILABLE_NOT_PERSISTED",
    httpStatus:"UNAVAILABLE_NOT_PERSISTED",outcome:"UNAVAILABLE_NOT_PERSISTED",
    responseOrigin:"UNAVAILABLE_NOT_PERSISTED"
  },
  networkCounts:capture.networkCounts,navigations:capture.navigations.length,
  screenshots:capture.screenshots.length,
  consoleErrors:{ total:capture.consoleErrorCount,categories:capture.consoleErrorCategories },
  limitation:"The failed row did not retain a safe API/DOM/diagnostic projection. This receipt does not infer response content, outcome, origin, predicate cause, or product cause."
};
await writeNewJson(`${evidence}/GUIDE_LIVE4-row-outcomes.json`,rowOutcomes);

const screenshots=[];
for (const absolute of capture.screenshots) {
  const bytes=await readFile(absolute);
  if (bytes.length < 24 || bytes.subarray(1,4).toString("ascii") !== "PNG") {
    throw new Error("GUIDE_LIVE4_SCREENSHOT_FORMAT_INVALID");
  }
  screenshots.push({
    sequence:Number(basename(absolute).match(/row-(\d+)\.png$/u)?.[1]),
    absolute,sha256:sha256(bytes),bytes:bytes.length,
    width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)
  });
}
await writeNewJson(`${evidence}/GUIDE_LIVE4-screenshot-qa.json`,{
  schemaVersion:1,node:"GUIDE_LIVE4",expectedFromCompletedRows:14,
  screenshotCount:screenshots.length,format:"PNG",screenshots,
  limitation:"Mechanical file, digest, and dimension verification only; the partial run stopped before navigation and before the remaining 40 screenshots."
});

const captureStartedAt=new Date(captureLogStat.birthtimeMs);
const requestStarts=capture.pacing.requestStarts.map(item => ({
  sequence:item.sequence,
  estimatedRequestStartUtc:new Date(captureStartedAt.getTime()+item.requestStartOffsetMs).toISOString(),
  basis:"capture log birth time plus sealed monotonic request offset"
}));
const firstBySession=capture.groupSessionEvidence.map(group => {
  const request=requestStarts.find(({ sequence }) => sequence === group.firstSequence);
  return {
    groupIndex:group.groupIndex,groupId:group.groupId,firstSequence:group.firstSequence,
    estimatedSessionCreationNoLaterThanUtc:request?.estimatedRequestStartUtc ?? null,
    evidence:"session creation completed before its first request; wall time is conservatively derived from capture log birth plus monotonic offset"
  };
});
const fullyRefreshedMessagesAt=new Date(captureLogStat.mtimeMs+10*60_000).toISOString();
const manual={
  path:`${evidence}/GUIDE_LIVE4-manual.md`,requiredSessions:2,
  messageCountsByLanguage:{ en:3,ro:2,total:5 },
  steps:[
    "Fresh full-mode English session: ask product identity, a menu question, and one free-text guide question.",
    "Fresh compact-mode Romanian session: change the language, ask one Romanian menu question, and ask about account recovery limitations without submitting a recovery operation."
  ]
};
await writeNewJson(`${evidence}/GUIDE_LIVE4-owner-testability.json`,{
  schemaVersion:1,node:"GUIDE_LIVE4",revision:capture.finalCommit,
  verdict:"CALCULATED_FULL_MESSAGE_CAPACITY_AFTER_NATURAL_EXPIRY",
  freshPostCaptureMeasurement:false,manual,
  observedBeforeCapture:{ measuredAtUtc:capacity.measuredAtUtc,limits:capacity.limits,counts:capacity.observed },
  observedDuringCapture:{ createdSessions:capture.networkCounts.createSession,sentMessages:capture.networkCounts.sendMessage,requestStarts,sessionCreationBounds:firstBySession },
  arithmetic:{
    sessionsRemainingNow:capacity.limits.support_limit_anon_sessions_1h-capacity.observed.maxAnonSessionEvents1hByIp-capture.networkCounts.createSession,
    messagesRemainingInMeasuredTenMinuteWindow:capacity.limits.support_limit_anon_msgs_10m-capacity.observed.maxAnonMessageEvents10mByIp-capture.networkCounts.sendMessage,
    manualSessionsRequired:manual.requiredSessions,manualMessagesRequired:manual.messageCountsByLanguage.total
  },
  conservativeNotBeforeUtc:fullyRefreshedMessagesAt,
  basis:"The two-session allowance is arithmetically sufficient immediately, but the five-message walkthrough would consume every remaining ten-minute message slot. The conservative time waits ten minutes after the partial capture receipt was sealed; it is a calculation, not a fresh capacity read.",
  limits:[
    "No post-wait capacity request was made.",
    "Session creation wall times are conservative bounds derived from immutable local capture timing because the fixed receipt does not serialize absolute creation timestamps.",
    "Forgot remains unresolved and actionless; no recovery submission is part of the manual."
  ]
});

process.stdout.write(`${JSON.stringify({
  rowOutcomes:rows.length,failureSequence:43,screenshots:screenshots.length,
  origins,conservativeNotBeforeUtc:fullyRefreshedMessagesAt,
  idleObservedAt:idle.observedAt
},null,2)}\n`);
