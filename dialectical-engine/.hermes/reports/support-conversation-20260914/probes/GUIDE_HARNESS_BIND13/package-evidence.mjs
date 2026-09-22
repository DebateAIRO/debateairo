import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readdir,readFile,stat,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const harness=fileURLToPath(new URL("./",import.meta.url));
const previousHarness=fileURLToPath(new URL("../GUIDE_HARNESS_BIND12/",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND13/",import.meta.url));
const previousAdapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND12/",import.meta.url));
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const expectedHarnessSha256="4a73ade641ff12f9772aed1d858bf3694224b256d43babed528fa85120a58646";
const orderedEight=[
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","pre-request-verifier.ts",
  "runtime-capacity.mjs","session-lifecycle.mjs","verify-final-branches.ts","verify-guide-harness.mjs"
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const fileRecord=async (directory,path) => {
  const bytes=await readFile(resolve(directory,path));
  return { path,bytes:bytes.length,sha256:sha256(bytes) };
};
const writeNew=(path,value) => writeFile(path,typeof value === "string" ? value : `${JSON.stringify(value,null,2)}\n`,{ mode:0o600 });
const proofPath=`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-proof.json`;
const previousProofPath=`${evidenceRoot}/GUIDE_HARNESS_BIND12-control-proof.json`;
const productInventoryPath=`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`;
const attestationPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-snapshot-receipt.json`;
const suiteReceiptPath=`${evidenceRoot}/GUIDE_LOCK_HANDOFF_FIX-required-suites.json`;

const [proof,previousProof,productInventoryBytes,attestationBytes,suiteReceiptBytes]=await Promise.all([
  readFile(proofPath,"utf8").then(JSON.parse),
  readFile(previousProofPath,"utf8").then(JSON.parse),
  readFile(productInventoryPath),readFile(attestationPath),readFile(suiteReceiptPath)
]);
const productInventory=JSON.parse(productInventoryBytes);
const attestation=JSON.parse(attestationBytes);
const suiteReceipt=JSON.parse(suiteReceiptBytes);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,120);
assert.equal(proof.passed,120);
assert.equal(previousProof.controls,116);
assert.deepEqual(proof.names.slice(0,116),previousProof.names);
const addedNames=proof.names.slice(116);
assert.deepEqual(addedNames,[
  "compact transition projection rejects malformed or extra state",
  "compact precondition requires hydration before the single support click",
  "opening helper hydrates and checkpoints before one compact interaction",
  "failed compact transition checkpoints a closed discriminator"
]);
assert.equal(productInventory.revision,revision);
assert.equal(productInventory.productFiles.length,144);
assert.equal(attestation.finalCommit,revision);
assert.equal(attestation.snapshot.kbVersion,proof.kbVersion);
assert.equal(suiteReceipt.revision,revision);
assert.equal(suiteReceipt.files.length,34);

const orderedFiles=[];
for (const path of orderedEight) orderedFiles.push(await fileRecord(harness,path));
const harnessSha256=sha256(JSON.stringify(orderedFiles));
assert.equal(harnessSha256,expectedHarnessSha256);
assert.equal(orderedFiles.find(({ path }) => path === "matrix.mjs").sha256,"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c");
assert.equal(orderedFiles.find(({ path }) => path === "pre-request-verifier.ts").sha256,"d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39");

async function delta(directory,previousDirectory) {
  const names=(await readdir(directory)).filter(name => name !== "browser-profile").sort();
  const records=[];
  for (const path of names) {
    const current=await fileRecord(directory,path);
    let previous=null;
    try { previous=await fileRecord(previousDirectory,path); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    records.push({
      ...current,status:previous === null ? "NEW" : previous.sha256 === current.sha256 ? "UNCHANGED" : "CHANGED",
      ...(previous === null ? {} : { previousSha256:previous.sha256,previousBytes:previous.bytes })
    });
  }
  return records;
}
const harnessDelta=await delta(harness,previousHarness);
const adapterDelta=await delta(adapter,previousAdapter);

const outputPaths=[
  `${evidenceRoot}/GUIDE_LIVE_GUIDE13-actual-receipt.json`,
  `${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json`,
  resolve(harness,"browser-profile")
];
for (let sequence=1;sequence<=54;sequence+=1) {
  outputPaths.push(`${evidenceRoot}/GUIDE_LIVE_GUIDE13-row-${String(sequence).padStart(2,"0")}.png`);
}
const present=[];
for (const path of outputPaths) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

const probePath=resolve(harness,"probe-zero-request-ui.mjs");
const probeBytes=await readFile(probePath);
const probeContract={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",revision,
  script:{ path:probePath,sha256:sha256(probeBytes),bytes:probeBytes.length },
  outputPath:`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json`,
  argv:["node",probePath,revision,`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json`],
  cwd:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
  logPath:`${reportRoot}/logs/GUIDE_UI_TRANSITION_PROBE-LIVE8.log`,
  childStatusPreservedBy:"direct stdout/stderr redirection without tee",
  prerequisites:[
    "exact revision owned preview independently verified",
    "ordinary system TLS for https://localhost:3100",
    "pinned installed Playwright Chromium exists",
    "output path absent"
  ],
  transitions:[
    "fresh full/en","same-session full/ro","storage-reset compact/ro",
    "route-remount full/en","storage-reset compact/en"
  ],
  noTrafficGuard:{
    behavior:"abort before runtime; never fulfill or substitute a response",
    routes:["support status","support session create","support message send","other support"],
    requiredActualForwardedSupportRequests:0,
    requiredCreateSessionAttempts:0,requiredSendMessageAttempts:0,requiredOtherSupportAttempts:0,
    blockedStatusAttemptsReportedSeparately:true
  },
  outputFields:"fixed transition enums/counts only",
  executed:false
};
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13-probe-contract.json`,probeContract);
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13-custody.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",revision,productClean:true,
  orderedEightDigestAlgorithm:"sha256(JSON.stringify(ordered file records))",
  harnessSha256,orderedFiles,
  matrixSha256:"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c",
  preRequestVerifierSha256:"d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39",
  controlProof:{ path:proofPath,sha256:sha256(await readFile(proofPath)),controls:120,passed:120 },
  retainedControlPurposes:116,addedControlPurposes:4,
  matrixRows:54,suiteFiles:34,productFiles:144,
  traffic:{ browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0 }
});
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-delta.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",revision,
  finding:"COMPACT_HYDRATION_PRECONDITION_AND_FAILURE_OBSERVABILITY",
  disposition:"HARNESS_PRECONDITION_CORRECTED_LIVE7_CAUSE_UNRESOLVED_NO_PRODUCT_DEFECT_PROVED",
  controls:{ previous:116,current:120,retained:116,added:4,names:addedNames },
  unchangedContracts:{ matrixRows:54,matrixSha256:"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c",suiteFiles:34,productFiles:144 },
  harnessDelta,adapterDelta,
  productPatch:false,liveProbeExecuted:false,actualCaptureExecuted:false
});
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13-output-absence.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",checked:outputPaths.length,present,
  futureCaptureNamespace:"GUIDE_LIVE_GUIDE13",futureScreenshots:54,
  futureUiProbe:"GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json",browserProfile:"ABSENT"
});

const [live7Capacity,row1Stat,row2Stat]=await Promise.all([
  readFile(`${evidenceRoot}/GUIDE_LIVE7-runtime-capacity.json`,"utf8").then(JSON.parse),
  stat(`${evidenceRoot}/GUIDE_LIVE_GUIDE12-row-01.png`),
  stat(`${evidenceRoot}/GUIDE_LIVE_GUIDE12-row-02.png`)
]);
const latestSessionUpperBoundMs=Math.max(row1Stat.mtimeMs,row2Stat.mtimeMs);
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13-natural-capacity-plan.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND13",revision,
  basis:"SEALED_LIVE7_ONLY_NO_NEW_CAPACITY_READ",
  limit:{ anonymousSessionsPerIpPerHour:live7Capacity.limits.support_limit_anon_sessions_1h },
  preCaptureMeasurement:{
    measuredAtUtc:live7Capacity.measuredAtUtc,
    observedMaxAnonSessionEvents1hByIp:live7Capacity.observed.maxAnonSessionEvents1hByIp
  },
  live7CreatedSessions:2,
  creationTimeEvidence:[
    { group:"lifecycle-full-en",exactCreationTimeUtc:null,createdNoLaterThanUtc:new Date(row1Stat.mtimeMs).toISOString(),bound:"row-01 screenshot mtime" },
    { group:"full-ro",exactCreationTimeUtc:null,createdNoLaterThanUtc:new Date(row2Stat.mtimeMs).toISOString(),bound:"row-02 screenshot mtime" }
  ],
  fiveFreeSlotsCalculatedNotBeforeUtc:new Date(latestSessionUpperBoundMs+60*60*1000).toISOString(),
  availabilityKind:"CONSERVATIVE_NATURAL_EXPIRY_CALCULATION",
  futureMeasuredCapacityStillRequired:true,
  limitation:"Exact create-session timestamps were not serialized; screenshot mtimes are the smallest sealed upper bounds after each completed group's first response. This calculation is not a current capacity measurement and does not account for later external use."
});

const report=`# GUIDE_HARNESS_BIND13 — compact precondition and observability correction

## Result

- Ticket/session: \`t_1c75df2b\` / \`/root/preview\`
- Revision: \`${revision}\` (clean)
- Verdict: \`PASS_BOUNDED_COMPACT_PRECONDITION_REPAIR\`
- Controls: 120/120, retaining all 116 BIND12 purposes and adding four transition guards
- Ordered-eight digest: \`${harnessSha256}\`
- Traffic: none; the browser probe and actual capture were not run

## Correction

The capture and prepared UI probe now share \`openGuideSupportSurface\`. It proves an actual React click handler is attached before a compact Support-toggle interaction, checkpoints an exact fixed projection before and after the one click, and requires an expanded panel, compact root, and visible composer before language selection or any Support request. Failures retain the last fixed projection and one closed predicate code. Missing state remains \`UNKNOWN\`; arbitrary browser text, DOM, headers, storage/cookie values, capability data, private records, and response bodies cannot enter the projection.

The exact 54-row matrix and every response, privacy, pacing, lifecycle, capacity, source, action, navigation, and API/DOM oracle remain unchanged. The fresh inert branch proof covers all 54 rows. Adapter negative controls remain 3/3 with zero importer calls and zero successful rows.

## Operational follow-up

The prepared zero-Support probe runs full EN, same-session full RO, compact RO, full EN, and compact EN with both compact transitions at 390x844. It uses a fresh browser profile and aborts Support routes before they reach the runtime. Blocked status attempts are reported separately; responses are never substituted. The direct-redirection command in README preserves the actual Node exit status, avoiding LIVE7's unguarded \`tee\` masking.

Using sealed LIVE7 evidence only, the two created sessions are known to have existed no later than the first two screenshot mtimes. The later upper bound is used plus one hour to calculate a conservative five-free-slot planning time. This is not a current capacity measurement; a fresh supported measurement remains mandatory before any live capture.

This inert result proves the harness correction, not the historical LIVE7 cause and not current browser success. Separate baseline review and the zero-Support operational probe must pass before any new 54-row capture. Forgot remains unresolved and actionless; no readiness, acceptance, or checkpoint claim is made.
`;
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND13.md`,report);

const self=`# GUIDE_HARNESS_BIND13 self-report

## Identity and verdict

- Ticket/session: \`t_1c75df2b\` / \`/root/preview\`
- Revision: \`${revision}\`
- Verdict: \`PASS_BOUNDED_COMPACT_PRECONDITION_REPAIR\`
- Usage: unavailable; no token budget was exposed.

## SKILLS LOADED

- \`superpowers:using-superpowers\` retained from the original session
- \`superpowers:systematic-debugging\` retained from the original session
- \`superpowers:test-driven-development\` retained from the original session
- \`superpowers:verification-before-completion\` retained from the original session
- mission heartbeat protocol and worker-role instructions retained from the original session

## Handoff

All 116 reviewed purposes remain, four meaningful transition guards pass, the exact 54-row derivation remains green, and the ordered-eight digest is rebound. The later five-transition UI probe is prepared but was not executed. No product, Git, runtime, browser, database, capacity, Support, model, or service state changed.

## Requested retrospective

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

LIVE7 spent capacity and fifteen requests before discovering that the next UI surface could not be opened. The repeated cost came from validating response policy while leaving browser transition readiness until the long live run. The wrapper then lost the child exit status behind \`tee\`, creating extra forensic work.

The upgrade is a generated, typed launch contract with three ordered phases: static policy proof, zero-request UI transition proof, then fresh-capacity live capture. The same opening helper and fixed projection now serve the last two phases, while direct logging preserves child status. A single orchestrated command can stop before paid traffic whenever revision, output custody, UI hydration, full/compact transitions, or evidence shape fails. That preserves the safety gates while avoiding another late failure and reducing prose-carried argv drift.

The historical failure remains unattributed. Separate review and operational UI evidence are still required; there is no readiness or acceptance claim.
`;
await writeNew(`${reportRoot}/agent-reports/GUIDE_HARNESS_BIND13.md`,self);

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,harnessSha256,controls:120,retained:116,added:4,
  harnessFiles:harnessDelta.length,adapterFiles:adapterDelta.length,
  futureOutputsChecked:outputPaths.length,probePrepared:true,traffic:0
},null,2)}\n`);
