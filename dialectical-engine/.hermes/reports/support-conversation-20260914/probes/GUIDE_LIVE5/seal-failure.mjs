import { createHash } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const paths=[
  `${root}/probes/GUIDE_LIVE5/verify-ready.mjs`,
  `${root}/probes/GUIDE_LIVE5/assert-capture-outputs-absent.mjs`,
  `${root}/probes/GUIDE_LIVE5/materialize-runtime-capacity.mjs`,
  `${root}/probes/GUIDE_LIVE5/materialize-final-gate.mjs`,
  `${root}/probes/GUIDE_LIVE5/verify-postfailure.mjs`,
  `${root}/probes/GUIDE_LIVE5/seal-failure.mjs`,
  `${root}/evidence/GUIDE_LIVE5-inputs.json`,
  `${root}/evidence/GUIDE_LIVE5-gate-template.json`,
  `${root}/evidence/GUIDE_LIVE5-readiness.json`,
  `${root}/evidence/GUIDE_LIVE5-output-absence.json`,
  `${root}/evidence/GUIDE_LIVE5-runtime-capacity.json`,
  `${root}/evidence/GUIDE_LIVE5-gate.json`,
  `${root}/evidence/GUIDE_ROW_PROOF-run-GUIDE_LIVE5.json`,
  `${root}/evidence/GUIDE_LIVE5-postfailure-custody.json`,
  `${root}/evidence/GUIDE_LIVE5-postfailure-output-absence.json`,
  `${root}/evidence/GUIDE_LIVE5-failure.json`,
  `${root}/evidence/GUIDE_LIVE5-owner-testability.json`,
  `${root}/evidence/GUIDE_LIVE5-manual.md`,
  `${root}/evidence/GUIDE_LIVE5.md`,
  `${root}/agent-reports/GUIDE_LIVE5.md`,
  `${root}/logs/GUIDE_LIVE5-readiness.log`,
  `${root}/logs/GUIDE_LIVE5-output-absence.log`,
  `${root}/logs/GUIDE_LIVE5-capacity.log`,
  `${root}/logs/GUIDE_LIVE5-gate.log`,
  `${root}/logs/GUIDE_LIVE5-row-proof.log`,
  `${root}/logs/GUIDE_LIVE5-postfailure-custody.log`,
  `${root}/logs/GUIDE_LIVE5-postfailure-output-absence.log`,
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const artifacts=[];
for (const absolute of paths) {
  const bytes=await readFile(absolute);
  artifacts.push({ absolute,sha256:sha256(bytes),bytes:bytes.length });
}
const capacity=JSON.parse(await readFile(`${root}/evidence/GUIDE_LIVE5-runtime-capacity.json`,"utf8"));
const rowProof=JSON.parse(await readFile(`${root}/evidence/GUIDE_ROW_PROOF-run-GUIDE_LIVE5.json`,"utf8"));
const post=JSON.parse(await readFile(`${root}/evidence/GUIDE_LIVE5-postfailure-custody.json`,"utf8"));
const receipt={
  schemaVersion:1,node:"GUIDE_LIVE5",ticket:"t_ad9d20bc",session:"/root/preview",
  revision:"0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
  verdict:"FAIL_PRETRAFFIC_OPERATOR_INVOCATION",
  stage:"ROW_PROOF_ADAPTER_INVOCATION",
  exactFailedCommand:[
    "node",".hermes/reports/support-conversation-20260914/probes/GUIDE_ROW_PROOF_FIX9/replay-row-proofs.mjs",
    `${root}/evidence/GUIDE_LIVE5-gate.json`,
    "0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13",
    `${root}/evidence/GUIDE_ROW_PROOF-run-GUIDE_LIVE5.json`
  ],
  requiredCorrectLoaderArgs:["--import","tsx"],
  failure:{ processExitCode:1,errorCode:"ERR_MODULE_NOT_FOUND",failedResolution:"packages/support-kb/src/catalog.js",
    adapterVerdict:rowProof.verdict,adapterResultCode:rowProof.resultCode,rows:rowProof.rows.length },
  capacity:{ measuredAtUtc:capacity.measuredAtUtc,limits:capacity.limits,observed:capacity.observed },
  traffic:{ capacityStatusReads:1,capacityCountsOnlyReads:1,browserStarted:false,sessions:0,supportRequests:0,modelRequests:0 },
  outputAbsence:{ fixedPathsChecked:56,present:[] },
  custody:{ pid:post.pid,ppid:post.ppid,pgid:post.pgid,previewListeners:post.previewListeners,
    ordinarySystemTls:post.ordinarySystemTls },
  ongoingPrivateLog:`${root}/logs/GUIDE_LIVE5-stack.log`,
  ongoingPrivateLogExcludedFromArtifacts:true,
  retryPerformed:false,productOrHarnessFailureInferred:false,heavyLeaseReleased:true,gitLeaseUsed:false,
  artifacts,receiptExcludesItself:true,
  limits:[
    "No actual capture rows, screenshots, replies, origins, navigation, or language transitions exist.",
    "The fresh capacity and gate are historical failure evidence and are not reusable as fresh inputs.",
    "Owner manual availability is unavailable because the capture created no sessions.",
    "Historical LIVE3 and LIVE4 failures remain unknown and are not relabeled.",
    "Forgot remains unresolved and actionless; no readiness, checkpoint, or acceptance claim is made."
  ]
};
const receiptPath=`${root}/evidence/GUIDE_LIVE5-receipt.json`;
await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{ mode:0o600,flag:"wx" });
const bytes=await readFile(receiptPath);
process.stdout.write(`${JSON.stringify({
  receiptPath,sha256:sha256(bytes),bytes:bytes.length,artifacts:artifacts.length,verdict:receipt.verdict
},null,2)}\n`);
