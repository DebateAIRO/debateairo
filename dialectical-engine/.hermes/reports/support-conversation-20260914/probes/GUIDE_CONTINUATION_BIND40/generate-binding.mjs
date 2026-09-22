import { createHash } from "node:crypto";
import { readdir,readFile,stat,writeFile } from "node:fs/promises";
const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const E=`${ROOT}/evidence`,L=`${ROOT}/logs`,P=`${ROOT}/probes/GUIDE_CONTINUATION_BIND40`;
const PRODUCT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const REV="0d34f82f4a2188d0ce1db04655b693798ffd2169",KB="7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const ref=async path=>{const bytes=await readFile(path);return{path,sha256:sha256(bytes),bytes:bytes.length};};
const control=await ref(`${E}/GUIDE_CONTINUATION_BIND40-core-control-proof-final.json`);
const gateTemplate={schemaVersion:1,productRoot:PRODUCT,finalCommit:REV,
  productInventoryPath:`${E}/GATE_GUIDE_FINAL18-manifest.json`,productInventorySha256:"8e57b2dfcd1ece63058be87d62cad23d6ecda69a6e3bbba8ad42c421eaf303ff",
  attestationPath:`${E}/GUIDE_PREVIEW_BIND32-snapshot-receipt.json`,attestationSha256:"f34e31760d19b3ce08fe6cf67a7be18b18f7a2683c35a6d0cb56d731e6aba6c3",
  expectedSnapshotVersion:KB,expectedEntryCount:44,
  requiredSuiteReceiptPath:`${E}/GUIDE_PREVIEW_BIND32-required-suites.json`,requiredSuiteReceiptSha256:"8713e0d6cdcae75b1a1a663046801b7902ba93cf0960ee18be354162caa97f8a",
  controlProofPath:control.path,controlProofSha256:control.sha256,
  runtimeLogPath:`${L}/GUIDE_RUNTIME9-stack.log`,baseUrl:"https://localhost:3100",forgotConnector:{status:"UNRESOLVED_ACTIONLESS"}};
const gateTemplatePath=`${E}/GUIDE_CONTINUATION_BIND40-gate-template.json`;
await writeFile(gateTemplatePath,`${JSON.stringify(gateTemplate,null,2)}\n`,{flag:"wx",mode:0o600});
const gateTemplateRef=await ref(gateTemplatePath);

const retainedNames=(await readdir(E)).filter(name=>/^GUIDE_LIVE_GUIDE23-row-(01|02|15|19|23|27|31|35|39)-.+\.png$/u.test(name)
  ||name==="GUIDE_LIVE_GUIDE23-row-47-original-pane-top.png").sort();
const retainedPaths=[`${E}/GUIDE_LIVE31-receipt.json`,`${E}/GUIDE_LIVE_GUIDE23-actual-receipt.json`,
  `${E}/GUIDE_LIVE31-row47-visual-inspection.json`,...retainedNames.map(name=>`${E}/${name}`)];
const retainedArtifacts=await Promise.all(retainedPaths.map(ref));
const actualReceiptRef=retainedArtifacts.find(item=>item.path.endsWith("GUIDE_LIVE_GUIDE23-actual-receipt.json"));
const composition={schemaVersion:1,node:"GUIDE_CONTINUATION_BIND40",productRevision:REV,kbVersion:KB,
  live31Verdict:"FAILED_CAPTURE_ROW47_NO_RETRY",row47Disposition:"PASS_COMPLETE_SHORT_FOOTERLESS_SCREENSHOT_NO_RECAPTURE",
  retainedSequences:[1,2,15,19,23,27,31,35,39,47],
  remainingSequences:[10,18,26,34,56,58,54,43,5,13,21,25,29,37,45,53,8,12,42,55,57],
  retainedActualReceiptPath:actualReceiptRef.path,retainedActualReceiptSha256:actualReceiptRef.sha256,
  retainedSessionTimes:[{ordinal:1,observedAtUtc:"2026-09-21T09:52:36.856Z"},{ordinal:2,observedAtUtc:"2026-09-21T09:53:08.483Z"}],
  retainedArtifacts,futureRemainingReceiptPath:`${E}/GUIDE_LIVE_GUIDE24-actual-receipt.json`,
  futureComposedManifestPath:`${E}/GUIDE_LIVE32-composed31-manifest.json`,continuousSingleRun:false};
const compositionPath=`${E}/GUIDE_CONTINUATION_BIND40-composition-contract.json`;
await writeFile(compositionPath,`${JSON.stringify(composition,null,2)}\n`,{flag:"wx",mode:0o600});
const compositionRef=await ref(compositionPath);

const contractPath=`${E}/GUIDE_CONTINUATION_BIND40-command-contract.json`;
const phase=(name,script)=>({argv:["/Users/vladmihaimiron/.local/bin/node",script,contractPath],
  output:`${E}/GUIDE_LIVE32-${name}.json`,log:`${L}/GUIDE_LIVE32-${name}.log`});
const uiScript=await ref(`${P}/ui-transition-live-preflight.mjs`);
const phases={
  preflight:{...phase("preflight",`${P}/phase-preflight.mjs`),ui:{script:uiScript.path,sha256:uiScript.sha256,bytes:uiScript.bytes,
    argv:["/Users/vladmihaimiron/.local/bin/node",uiScript.path,`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE32.json`],
    output:`${E}/GUIDE_CONTINUATION_UI_PROOF-run-LIVE32.json`,log:`${L}/GUIDE_CONTINUATION_UI_PROOF-LIVE32.log`}},
  readiness:phase("readiness",`${ROOT}/probes/GUIDE_PROCESS_BIND37/phase-readiness.mjs`),
  capacity:phase("capacity",`${P}/phase-capacity.mjs`),gate:phase("gate",`${P}/phase-gate.mjs`),
  rowProof:{...phase("row-proof-status",`${P}/phase-row-proof.mjs`),childArgv:["/Users/vladmihaimiron/.local/bin/node","--import","tsx",`${P}/replay-row-proofs.mjs`,`${E}/GUIDE_LIVE32-gate.json`,REV,`${E}/GUIDE_ROW_PROOF-run-LIVE32.json`],result:`${E}/GUIDE_ROW_PROOF-run-LIVE32.json`},
  capture:{...phase("capture",`${P}/phase-capture.mjs`),childArgv:["/Users/vladmihaimiron/.local/bin/node","--import","tsx",`${P}/capture-public-guide.mjs`,`${E}/GUIDE_LIVE32-gate.json`]},
  idle:phase("idle",`${ROOT}/probes/GUIDE_PROCESS_BIND37/phase-idle.mjs`)
};
const sequences=composition.remainingSequences;
const future=[`${E}/GUIDE_LIVE32-stop.json`,`${E}/GUIDE_LIVE32-prerequisites.json`,
  ...Object.values(phases).flatMap(item=>[item.output,item.log]),phases.preflight.ui.output,phases.preflight.ui.log,
  phases.rowProof.result,`${E}/GUIDE_LIVE_GUIDE24-actual-receipt.json`,`${P}/browser-profile-LIVE32`,
  `${E}/GUIDE_LIVE21-owner-capacity.json`,`${E}/GUIDE_LIVE25-owner-testability.json`,`${E}/GUIDE_LIVE32-composed31-manifest.json`,
  ...["preflight","readiness","capacity","gate","rowProof","capture","idle"].map(name=>`${L}/GUIDE_CONTINUATION_BIND40-operator-${name}.log`),
  ...sequences.flatMap(sequence=>{const stem=`${E}/GUIDE_LIVE_GUIDE24-row-${String(sequence).padStart(2,"0")}`;return[
    `${stem}-complete-expanded.png`,`${stem}-original-pane-start.png`,`${stem}-original-pane-end.png`,`${stem}-screenshot-failure.json`];})];
if(new Set(future).size!==future.length)throw new Error("GUIDE_CONTINUATION_FUTURE_PATH_COLLISION");
const screenshotHelper=await ref(`${P}/screenshot-evidence-successor.mjs`),captureImplementation=await ref(`${P}/capture-public-guide.mjs`);
const contract={schemaVersion:1,node:"GUIDE_CONTINUATION_BIND40",revision:REV,kbVersion:KB,cwd:PRODUCT,evidenceRoot:E,baseUrl:"https://localhost:3100",
  runtimeCustodyPath:`${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody.json`,runtimeCustodyContractPath:`${E}/GUIDE_PREVIEW_RECOVER34-runtime-custody-contract.json`,
  runtimeCustodyContractSha256:"9094ce7d0c9543914bf61cd2d0a28a1965c338771acac0b70f04a9d6d00a25eb",runtimeLogPath:`${L}/GUIDE_RUNTIME9-stack.log`,
  gateTemplatePath,gateTemplateSha256:gateTemplateRef.sha256,compositionContractPath:compositionPath,compositionContractSha256:compositionRef.sha256,
  actualReceipt:`${E}/GUIDE_LIVE_GUIDE24-actual-receipt.json`,browserProfile:`${P}/browser-profile-LIVE32`,actualSequences:sequences,
  retainedSequences:composition.retainedSequences,budget:{captureSessions:3,captureMessages:21,modelCallCeiling:18,reservedOwnerMessages:6,reservedOwnerModelCalls:6,
    deferredOwnerSessions:2,requiredSessionHeadroom1h:3,requiredMessageHeadroom24h:27,requiredDailyCallHeadroom:24},phases,
  ownerCapacity:{contractPath:`${E}/GUIDE_PREVIEW_RECOVER34-owner-capacity-contract.json`,contractSha256:"365834e0fd9761e9e1293415f42a296a1399a923bc37c10fdd0b57f75d39cecc",output:`${E}/GUIDE_LIVE21-owner-capacity.json`},
  ownerWalkthrough:`${E}/GUIDE_LIVE25-owner-testability.json`,composedManifest:`${E}/GUIDE_LIVE32-composed31-manifest.json`,futureAbsence:future,
  processIdentityValidator:{path:`${ROOT}/probes/GUIDE_PROCESS_BIND37/process-row.mjs`,sha256:"754aaef056f9dfa207a1ac1d0213761b2f8ebd40fc5c3bb9c0bc8373247e6d42",bytes:886},
  runtimeCommandMarker:"pnpm dev:auth:up",screenshotHelper,captureImplementation,
  adoptedDecisionPath:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/decisions/GUIDE-CP1-SAME-REVISION-CONTINUATION-20260921.md",
  adoptedDecisionSha256:"92d680a1033a10f7ae336d161255b289047849aece1122cb1e353d3f76acd39f"};
await writeFile(contractPath,`${JSON.stringify(contract,null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({gateTemplate:gateTemplateRef.sha256,composition:compositionRef.sha256,contract:sha256(await readFile(contractPath)),future:future.length})}\n`);
