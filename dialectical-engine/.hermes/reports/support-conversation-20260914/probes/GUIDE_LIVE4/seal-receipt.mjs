import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidence=`${root}/evidence`;
const logs=`${root}/logs`;
const probes=`${root}/probes/GUIDE_LIVE4`;
const agentReport=`${root}/agent-reports/GUIDE_LIVE4.md`;
const receiptPath=`${evidence}/GUIDE_LIVE4-receipt.json`;
const ongoingPrivateLog=`${logs}/GUIDE_LIVE4-stack.log`;
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const readJson=async path => JSON.parse(await readFile(path,"utf8"));

const [capture,capacity,gate,rowProof,idle,owner]=await Promise.all([
  readJson(`${evidence}/GUIDE_LIVE_GUIDE7-actual-receipt.json`),
  readJson(`${evidence}/GUIDE_LIVE4-runtime-capacity.json`),
  readJson(`${evidence}/GUIDE_LIVE4-gate.json`),
  readJson(`${evidence}/GUIDE_ROW_PROOF-run-GUIDE_LIVE4.json`),
  readJson(`${evidence}/GUIDE_LIVE4-idle-custody.json`),
  readJson(`${evidence}/GUIDE_LIVE4-owner-testability.json`)
]);
const artifactPaths=[];
for (const name of await readdir(probes)) artifactPaths.push(`${probes}/${name}`);
for (const name of await readdir(evidence)) {
  if (name === "GUIDE_LIVE4-receipt.json") continue;
  if (name.startsWith("GUIDE_LIVE4-") || name === "GUIDE_LIVE4.md"
    || name === "GUIDE_ROW_PROOF-run-GUIDE_LIVE4.json"
    || name === "GUIDE_LIVE_GUIDE7-actual-receipt.json"
    || /^GUIDE_LIVE_GUIDE7-row-\d+\.png$/u.test(name)) artifactPaths.push(`${evidence}/${name}`);
}
for (const name of await readdir(logs)) {
  if (name.startsWith("GUIDE_LIVE4-") && `${logs}/${name}` !== ongoingPrivateLog) {
    artifactPaths.push(`${logs}/${name}`);
  }
}
artifactPaths.push(agentReport);
artifactPaths.sort();
const artifacts=[];
for (const absolute of artifactPaths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const receipt={
  schemaVersion:1,node:"GUIDE_LIVE4",ticket:"t_77905880",session:"/root/preview",
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  kbVersion:capture.kbVersion,harnessSha256:capture.preRequestControlProof.harnessSha256,
  verdict:"FAILED_CAPTURE_API_PROJECTION_INVALID",
  lifecycle:{
    oldOwnedSupervisor:65268,newSupervisor:idle.pid,newPgid:idle.pgid,newPpid:idle.ppid,
    readinessObservedAt:"2026-09-17T20:00:27.862Z",postFailureObservedAt:idle.observedAt,
    previewListeners:idle.previewListeners,originalListenersPreserved:idle.originalListenersPreserved,
    ordinarySystemTls:idle.ordinarySystemTls,leftRunning:true
  },
  pretraffic:{
    outputPathsChecked:56,collisions:0,capacityReads:1,capacityMeasuredAt:capacity.measuredAtUtc,
    gateSha256:sha256(Buffer.from(`${JSON.stringify(gate,null,2)}\n`)),
    rowProof:rowProof.verdict,rowProofCode:rowProof.resultCode,rowProofRows:rowProof.rows.length,
    rowProofTraffic:rowProof.traffic
  },
  capture:{
    attempts:1,retries:0,attemptedRows:capture.attemptedRowCount,
    completedRows:capture.completedRowCount,failedSequence:capture.failure.sequence,
    errorCode:capture.failure.code,createSessionRequests:capture.networkCounts.createSession,
    sendMessageRequests:capture.networkCounts.sendMessage,
    forbiddenAnswers:capture.networkCounts.forbiddenAnswers,
    forbiddenConsent:capture.networkCounts.forbiddenConsent,
    navigations:capture.navigations.length,screenshots:capture.screenshots.length,
    completedOriginCounts:{
      MODEL_ACCEPTED_DRAFT:10,REVIEWED_FALLBACK:1,
      DETERMINISTIC_PRIVATE_REFUSAL:1,DETERMINISTIC_RECOVERY:2
    }
  },
  failedRowEvidence:{
    sequence:43,
    prompt:capture.failureObservation.canonicalRow.prompt,
    kind:capture.failureObservation.canonicalRow.kind,
    family:capture.failureObservation.canonicalRow.family,
    mode:capture.failureObservation.canonicalRow.mode,
    language:capture.failureObservation.canonicalRow.language,
    branch:capture.failureObservation.canonicalRow.branch,
    actionPolicy:capture.failureObservation.canonicalRow.actionPolicy,
    phase:capture.failureObservation.phase,
    api:"UNAVAILABLE_NOT_PERSISTED",httpStatus:"UNAVAILABLE_NOT_PERSISTED",
    outcome:"UNAVAILABLE_NOT_PERSISTED",visible:"UNAVAILABLE_NOT_PERSISTED",
    equality:"UNAVAILABLE_NOT_PERSISTED",diagnostic:"UNAVAILABLE_NOT_PERSISTED",
    responseOrigin:"UNAVAILABLE_NOT_PERSISTED"
  },
  ownerTestability:{
    verdict:owner.verdict,freshPostCaptureMeasurement:false,
    requiredSessions:owner.manual.requiredSessions,
    requiredMessages:owner.manual.messageCountsByLanguage.total,
    conservativeNotBeforeUtc:owner.conservativeNotBeforeUtc
  },
  heavyLeaseReleased:true,ongoingPrivateLogExcluded:ongoingPrivateLog,
  receiptExcludesItself:true,artifacts,
  limits:[
    "Only 14 rows completed; 40 rows were not attempted.",
    "The failed row has no persisted safe API/status/outcome/diagnostic/origin projection and no product cause is inferred.",
    "No pointer or keyboard navigation was reached.",
    "Calculated owner capacity is not a fresh post-wait read.",
    "Forgot remains unresolved and actionless.",
    "No full-guide, readiness, acceptance or checkpoint verdict is claimed."
  ]
};
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ flag:"wx",mode:0o600 });
const receiptBytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length,
  artifactCount:artifacts.length,verdict:receipt.verdict
},null,2)}\n`);
