import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access,readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const evidenceRoot=`${reportRoot}/evidence`;
const productRoot="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const harness=fileURLToPath(new URL("./",import.meta.url));
const previousHarness=fileURLToPath(new URL("../GUIDE_HARNESS_BIND13/",import.meta.url));
const adapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND14/",import.meta.url));
const previousAdapter=fileURLToPath(new URL("../GUIDE_ROW_PROOF_BIND13/",import.meta.url));
const revision="152eed4da1cd3e66b74d8301159ba76427552409";
const expectedHarnessSha256="ba72808c15fe611c1999e440c206cb41d637d064884dde856a82ee7865f6f0d6";
const orderedEight=[
  "capture-public-guide.mjs","controls.mjs","matrix.mjs","pre-request-verifier.ts",
  "runtime-capacity.mjs","session-lifecycle.mjs","verify-final-branches.ts","verify-guide-harness.mjs"
];
const addedNames=[
  "full readiness projection is fixed and surface specific",
  "full readiness classifier distinguishes public preconditions",
  "full readiness preserves nonempty Support state on same locale remount",
  "full readiness changes locale once only at the planned session boundary",
  "full capture call sites retain the exact five session boundary plan",
  "failed full interaction checkpoints its closed predicate",
  "blocked Support classifier isolates only the automatic case list read"
];
const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const writeNew=(path,value) => writeFile(
  path,typeof value === "string" ? value : `${JSON.stringify(value,null,2)}\n`,
  { flag:"wx",mode:0o600 }
);
const fileRecord=async (directory,path) => {
  const bytes=await readFile(resolve(directory,path));
  return { path,bytes:bytes.length,sha256:sha256(bytes) };
};
async function delta(directory,previousDirectory) {
  const records=[];
  for (const path of (await readdir(directory)).filter(name => name !== "browser-profile").sort()) {
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

const proofPath=`${evidenceRoot}/GUIDE_HARNESS_BIND14-control-proof.json`;
const [proof,previousProof,productInventory]=await Promise.all([
  readFile(proofPath,"utf8").then(JSON.parse),
  readFile(`${evidenceRoot}/GUIDE_HARNESS_BIND13-control-proof.json`,"utf8").then(JSON.parse),
  readFile(`${evidenceRoot}/GATE_GUIDE_FINAL9-manifest.json`,"utf8").then(JSON.parse)
]);
assert.equal(proof.result,"PASS");
assert.equal(proof.revision,revision);
assert.equal(proof.harnessSha256,expectedHarnessSha256);
assert.equal(proof.controls,127);
assert.equal(proof.passed,127);
assert.equal(previousProof.controls,120);
assert.deepEqual(proof.names.slice(0,120),previousProof.names);
assert.deepEqual(proof.names.slice(120),addedNames);
assert.equal(productInventory.revision,revision);
assert.equal(productInventory.productFiles.length,144);

const orderedFiles=[];
for (const path of orderedEight) orderedFiles.push(await fileRecord(harness,path));
assert.equal(sha256(JSON.stringify(orderedFiles)),expectedHarnessSha256);
assert.equal(orderedFiles.find(({ path }) => path === "matrix.mjs").sha256,
  "4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c");
assert.equal(orderedFiles.find(({ path }) => path === "pre-request-verifier.ts").sha256,
  "d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39");

const outputPaths=[
  `${evidenceRoot}/GUIDE_LIVE_GUIDE14-actual-receipt.json`,
  `${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`,
  resolve(harness,"browser-profile")
];
for (let sequence=1;sequence<=54;sequence+=1) {
  outputPaths.push(`${evidenceRoot}/GUIDE_LIVE_GUIDE14-row-${String(sequence).padStart(2,"0")}.png`);
}
const present=[];
for (const path of outputPaths) {
  try { await access(path); present.push(path); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
assert.deepEqual(present,[]);

const [assistantBytes,caseViewBytes,helpPageBytes,modeToggleBytes,clarificationBytes,oldProbeResult]=await Promise.all([
  readFile(`${productRoot}/apps/ui/components/support/Assistant.tsx`),
  readFile(`${productRoot}/apps/ui/components/support/CaseView.tsx`),
  readFile(`${productRoot}/apps/ui/app/help/page.tsx`),
  readFile(`${productRoot}/apps/ui/components/ModeToggle.tsx`),
  readFile("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/decisions/GUIDE_HARNESS_BIND14-scope-clarification.md"),
  readFile(`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json`,"utf8").then(JSON.parse)
]);
assert.equal(oldProbeResult.traffic.guardedAttempts.otherSupport,3);
assert.equal(oldProbeResult.traffic.actualSupportRequestsForwarded,0);

const probePath=resolve(harness,"probe-zero-request-ui.mjs");
const probeBytes=await readFile(probePath);
const probeContract={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",revision,
  script:{ path:probePath,sha256:sha256(probeBytes),bytes:probeBytes.length },
  outputPath:`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`,
  argv:["node",probePath,revision,`${evidenceRoot}/GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`],
  cwd:productRoot,
  logPath:`${reportRoot}/logs/GUIDE_UI_TRANSITION_PROBE2-LIVE8.log`,
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
    behavior:"abort every classified Support operation before runtime; never fulfill or substitute a response",
    exactBlockedPageRead:{ method:"GET",path:"/api/v1/support/cases",counter:"pageCaseListRead" },
    requiredActualForwardedSupportRequests:0,
    requiredCreateSessionAttempts:0,requiredSendMessageAttempts:0,requiredOtherSupportAttempts:0,
    blockedStatusAndPageCaseListReadAttemptsReportedSeparately:true
  },
  outputFields:"fixed transition enums/counts only",
  executed:false
};

const diagnosis={
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",revision,
  established:[
    {
      finding:"FULL_READINESS_PRIVATE_REACT_MARKER_IS_NOT_PRODUCT_CONTRACT",
      priorFailure:{ transition:4,code:"GUIDE_HARNESS_FULL_HYDRATION_TIMEOUT",composerVisible:"VISIBLE",urlClass:"HELP" },
      producer:{ path:"apps/ui/components/support/Assistant.tsx",lines:"625-628",sha256:sha256(assistantBytes),contract:"two public language buttons with aria-pressed and onClick" },
      correction:"reversible public mode transition proves hydration; locale changes only when requested locale differs"
    },
    {
      finding:"OTHER_SUPPORT_BUCKET_MIXED_EXPECTED_PAGE_READ_WITH_UNEXPECTED_OPERATIONS",
      producer:{ path:"apps/ui/components/support/CaseView.tsx",lines:"131-149",sha256:sha256(caseViewBytes),contract:"Help auxiliary OwnCaseLookup automatically GETs /api/v1/support/cases" },
      page:{ path:"apps/ui/app/help/page.tsx",lines:"1-16",sha256:sha256(helpPageBytes),contract:"OwnCaseLookup is mounted on Help" },
      correction:"only exact GET /api/v1/support/cases receives pageCaseListRead; all other Support paths remain forbidden"
    }
  ],
  supplementalScope:{
    path:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/support-conversation-20260914/decisions/GUIDE_HARNESS_BIND14-scope-clarification.md",
    sha256:sha256(clarificationBytes),bytes:clarificationBytes.length
  },
  nonDestructiveReadiness:{
    producer:{ path:"apps/ui/components/ModeToggle.tsx",lines:"9-43",sha256:sha256(modeToggleBytes) },
    languageSemantics:{ path:"apps/ui/components/support/Assistant.tsx",lines:"462-470",sameLocale:"NO_OP",differentLocale:"SESSION_RESET_TRANSCRIPT_RETAINED" },
    captureGroups:["fresh full/en","language-reset full/ro","storage-reset compact/ro","language-reset full/en","storage-reset compact/en"],
    sameLocaleNonemptyFixturePreserved:true,exactSessionCount:5
  },
  historicalLimits:[
    "The sealed old probe retained otherSupport only as an aggregate count, so its three historical URLs and methods cannot be retrospectively assigned.",
    "This inert node proves source and harness contracts, not that the corrected five-transition browser probe succeeds.",
    "No product defect is inferred and no runtime or browser discriminator was collected here."
  ]
};

const harnessDelta=await delta(harness,previousHarness);
const adapterDelta=await delta(adapter,previousAdapter);
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14-probe-contract.json`,probeContract);
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14-diagnosis.json`,diagnosis);
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14-custody.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",revision,productClean:true,
  harnessSha256:expectedHarnessSha256,orderedFiles,
  matrixSha256:"4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c",
  preRequestVerifierSha256:"d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39",
  controlProof:{ path:proofPath,sha256:sha256(await readFile(proofPath)),controls:127,passed:127 },
  retainedControlPurposes:120,addedControlPurposes:7,matrixRows:54,suiteFiles:34,productFiles:144,
  traffic:{ browser:0,runtime:0,http:0,database:0,status:0,capacity:0,supportRequests:0,modelRequests:0 }
});
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14-control-delta.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",revision,
  finding:"FULL_PUBLIC_READINESS_AND_EXACT_BLOCKED_PAGE_READ_CLASSIFICATION",
  disposition:"HARNESS_CORRECTED_LIVE_PROBE_STILL_REQUIRED_NO_PRODUCT_DEFECT_PROVED",
  controls:{ previous:120,current:127,retained:120,added:7,names:addedNames },
  unchangedContracts:{ matrixRows:54,suiteFiles:34,productFiles:144,compactOneClick:true },
  harnessDelta,adapterDelta,productPatch:false,liveProbeExecuted:false,actualCaptureExecuted:false
});
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14-output-absence.json`,{
  schemaVersion:1,node:"GUIDE_HARNESS_BIND14",checked:outputPaths.length,present,
  futureCaptureNamespace:"GUIDE_LIVE_GUIDE14",futureScreenshots:54,
  futureUiProbe:"GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json",browserProfile:"ABSENT"
});

const report=`# GUIDE_HARNESS_BIND14 — full readiness and zero-request route classification\n\n## Result\n\n- Ticket/session: \`t_f14d341e\` / \`/root/preview\`\n- Revision: \`${revision}\` (clean)\n- Verdict: \`PASS_BOUNDED_FULL_READINESS_AND_ROUTE_GUARD\`\n- Controls: 127/127, retaining all 120 BIND13 purposes and adding seven bounded discriminators\n- Ordered-eight digest: \`${expectedHarnessSha256}\`\n- Traffic: none; no browser, runtime, HTTP, Support, model, status, or capacity operation ran\n- Supplemental scope: \`GUIDE_HARNESS_BIND14-scope-clarification.md\`, SHA-256 \`${sha256(clarificationBytes)}\`\n\n## Established cause and correction\n\nThe old full-page predicate depended on a React-private \`__reactProps$\` field. BIND14 now proves hydration by toggling the public mode control once and restoring it. It does not probe hydration by changing Support language. It requires two visible EN/RO controls, one active locale, one visible composer, one visible mode toggle and \`/help\`, then changes locale only when the requested locale differs. Product semantics return immediately for the same locale and reset only the session on a real locale change while retaining transcript messages. The nonempty same-locale fixture remains unchanged; all five capture groups retain their original fresh/language-reset/storage-reset boundaries and exact five-session plan. The reviewed compact one-click contract is unchanged.\n\nThe old \`otherSupport\` classifier combined all remaining Support paths. Help mounts \`OwnCaseLookup\`, which automatically requests \`GET /api/v1/support/cases\`. Under the frozen clarification, BIND14 isolates only that known blocked operation as \`pageCaseListRead\`; it stays aborted and is never called public data. Every method mismatch, token read, consent, escalation, rating, or unknown Support route remains \`otherSupport\` and fails. The historical three aggregate attempts cannot be assigned to exact URLs because BIND13 did not retain them.\n\nThe exact 54-row matrix, FINAL9 inventory, 34-suite receipt, source/action/outcome/API-DOM proofs, privacy rules, pacing, sessions, capacity, navigation, and Forgot actionless state are unchanged. Adapter negatives remain 3/3 with no import or successful row.\n\n## Next gate\n\nREVIEW13 must assess this inert correction. Then the documented one-shot zero-Support probe writes new PROBE2 output and directly preserves its Node status. Only a successful five-transition result can unblock a later fresh-capacity 54-row capture. No product defect, readiness, acceptance, or checkpoint claim is made.\n`;
await writeNew(`${evidenceRoot}/GUIDE_HARNESS_BIND14.md`,report);

const self=`# GUIDE_HARNESS_BIND14 self-report\n\n## Identity and verdict\n\n- Ticket/session: \`t_f14d341e\` / \`/root/preview\`\n- Revision: \`${revision}\`\n- Verdict: \`PASS_BOUNDED_FULL_READINESS_AND_ROUTE_GUARD\`\n- Usage: unavailable; no token budget was exposed.\n\n## SKILLS LOADED\n\n- \`superpowers:using-superpowers\` retained from the original session\n- \`superpowers:systematic-debugging\` retained from the original session\n- \`superpowers:test-driven-development\` retained from the original session\n- \`superpowers:verification-before-completion\` retained from the original session\n- mission heartbeat protocol and worker-role instructions retained from the original session\n\n## Handoff\n\nAll 120 reviewed purposes remain and seven new controls pass. The exact 54-row matrix remains unchanged. The readiness handshake uses a reversible non-Support mode change; same-locale nonempty Support state is preserved and language changes occur once only at planned session boundaries. The future probe and GUIDE14 output names are prepared but unused. No product, Git, browser, runtime, database, capacity, Support, model, or service state changed.\n\n## Requested retrospective\n\n> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.\n\nThe repeated cost came from treating a framework-private marker as an application readiness contract, proposing a language-based proof before tracing its session-reset semantics, and compressing distinct blocked requests into one count. Each gap forced another forensic turn. The upgrade is to compile launch gates from public non-destructive behavior, exact caller lifecycle contracts, route/method classifiers, and fixed failure predicates. The future single entry point should execute static proof, zero-request UI proof, capacity measurement, and live capture in that order, with immutable outputs and child-status preservation. It should stop before quota use whenever any earlier contract fails.\n\nHistorical aggregate traffic cannot be reconstructed, and corrected browser behavior remains for separate operational proof. Forgot remains unresolved; CP2 remains gated.\n`;
await writeNew(`${reportRoot}/agent-reports/GUIDE_HARNESS_BIND14.md`,self);

process.stdout.write(`${JSON.stringify({
  result:"PASS",revision,harnessSha256:expectedHarnessSha256,
  controls:127,retained:120,added:7,harnessFiles:harnessDelta.length,adapterFiles:adapterDelta.length,
  futureOutputsChecked:outputPaths.length,probePrepared:true,traffic:0
},null,2)}\n`);
