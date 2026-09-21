import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { GUIDE_FAMILIES,GUIDE_MATRIX,validateGuideMatrix } from "./matrix.mjs";
import {
  assertGuideObservation,deriveDeclaredControlCount,validateBoundReceiptMembership,validateGuideGateInput
} from "./controls.mjs";
import { deriveGuideRowProof } from "./pre-request-verifier.ts";

const results=[];
async function control(name,operation) {
  await operation();
  results.push(name);
}

await control("matrix covers twenty approved inventory families",async () => {
  assert.equal(GUIDE_FAMILIES.length,20);
  assert.deepEqual(new Set(GUIDE_FAMILIES.map(({ id }) => id)).size,20);
});

await control("matrix has exact full compact EN RO family coverage",async () => {
  const guideRows=GUIDE_MATRIX.filter(({ kind }) => kind === "GUIDE_FAMILY");
  assert.equal(guideRows.length,40);
  for (const family of GUIDE_FAMILIES) {
    const rows=guideRows.filter(row => row.family === family.id);
    assert.deepEqual(rows.map(({ mode }) => mode).sort(),["compact","full"]);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
});

await control("matrix includes required lifecycle privacy injection and recovery rows",async () => {
  assert.equal(GUIDE_MATRIX.length,GUIDE_FAMILIES.length*2+2+2+5*2);
  assert.deepEqual(
    GUIDE_MATRIX.filter(({ lifecycleRole }) => lifecycleRole !== null).map(({ prompt }) => prompt),
    ["Pricing","Account"]
  );
  for (const kind of ["PRIVATE_RECORD","PROMPT_INJECTION"]) {
    const rows=GUIDE_MATRIX.filter(row => row.kind === kind);
    assert.deepEqual(rows.map(({ mode }) => mode).sort(),["compact","full"]);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
  for (const recoveryClass of [
    "POSITIVE_NAVIGATION","OPERATION_ONLY","OPERATION_AND_NAVIGATION",
    "NEGATED_OPERATION_AND_NAVIGATION","NEGATED_OR_UNRELATED"
  ]) {
    const rows=GUIDE_MATRIX.filter(row => row.recoveryClass === recoveryClass);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
  assert.equal(validateGuideMatrix(GUIDE_MATRIX),true);
});

for (const [name,mutate] of [
  ["duplicate sequence rejected",rows => { rows[1]={ ...rows[1],sequence:1 }; }],
  ["changed prompt rejected",rows => { rows[0]={ ...rows[0],prompt:"changed" }; }],
  ["missing surface coverage rejected",rows => { rows.splice(0,1); }],
  ["recovery branch drift rejected",rows => {
    const index=rows.findIndex(({ recoveryClass }) => recoveryClass === "OPERATION_ONLY");
    rows[index]={ ...rows[index],branch:"MODEL" };
  }]
]) {
  await control(name,async () => {
    const rows=GUIDE_MATRIX.map(row => ({ ...row,expectedSourceIds:[...row.expectedSourceIds] }));
    mutate(rows);
    assert.throws(() => validateGuideMatrix(rows),/GUIDE_HARNESS_MATRIX_INVALID/u);
  });
}

const digest=value => createHash("sha256").update(value).digest("hex");
const sourceIds=[...new Set(GUIDE_MATRIX.flatMap(({ expectedSourceIds }) => expectedSourceIds))];
const inertEntries=sourceIds.flatMap(id => ["en","ro"].map(lang => {
  const fallback=`Reviewed ${id} ${lang}`;
  return {
    id,lang,title:`${id} ${lang}`,body:`Public ${id} ${lang}`,modelProjection:`Public ${id} ${lang}`,
    fallback,recoveryReview:{
      fallbackSha256:digest(fallback),reviewedBy:"SOL",reviewerSession:"inert-reviewer",
      reviewedOn:"2026-09-17",evidence:"inert://guide-harness"
    }
  };
}));
const rowByPrompt=new Map(GUIDE_MATRIX.map(row => [row.prompt,row]));
const inertActions={
  method:{ id:"method",label:"Method",href:"/#method" },
  "sample-transcript":{ id:"sample-transcript",label:"Transcripts",href:"/#transcripts" }
};
const inertDependencies={
  loadHelpCorpus:() => ({ kbVersion:"a".repeat(64),entries:inertEntries }),
  supportActionIds:Object.keys(inertActions),supportCapabilities:{},
  buildSupportKnowledgeContext:({ query }) => {
    const row=rowByPrompt.get(query);
    if (row === undefined) throw new Error("INERT_PROMPT_UNKNOWN");
    return {
      sourceIds:[...row.expectedSourceIds],
      requestedActionIds:row.navigation === null ? [] : [row.navigation.actionId]
    };
  },
  resolveSupportActions:(ids) => ids.flatMap(id => inertActions[id] === undefined ? [] : [inertActions[id]]),
  redactSupportMessage:text => ({ text }),
  classifyPublicGuideBoundary:() => ({ kind:"PRIVATE_RECORD_REQUEST" }),
  classifySupportMessage:() => ({ outcome:"REFUSE_ZONE",securityNavigation:"FORGOT_PASSWORD",link:null }),
  analyzeRecoverySemantics:(text,language) => {
    const recoveryClass=rowByPrompt.get(text)?.recoveryClass;
    const semantics={
      POSITIVE_NAVIGATION:["AFFIRMATIVE","ABSENT"],
      OPERATION_ONLY:["ABSENT","AFFIRMATIVE"],
      OPERATION_AND_NAVIGATION:["AFFIRMATIVE","AFFIRMATIVE"],
      NEGATED_OPERATION_AND_NAVIGATION:["AFFIRMATIVE","NEGATED"]
    }[recoveryClass];
    return { language,navigation:semantics?.[0],credentialOperation:semantics?.[1] };
  },
  classifySupportResponseEvidence:() => ({ status:"ACCEPTED_DRAFT",candidateCount:0 })
};

await control("all matrix rows derive an inert pre request proof",async () => {
  const corpus={ kbVersion:"a".repeat(64),entries:inertEntries };
  for (const row of GUIDE_MATRIX) {
    const proof=deriveGuideRowProof(corpus,row,inertDependencies);
    assert.equal(proof.branch,row.branch);
  }
});

await control("private branch proof rejects public classification",async () => {
  const row=GUIDE_MATRIX.find(({ branch }) => branch === "DETERMINISTIC_PRIVATE_REFUSAL");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,classifyPublicGuideBoundary:() => ({ kind:"PUBLIC_GUIDE" })
  }),/GUIDE_HARNESS_PRIVATE_BRANCH_PROOF_MISMATCH/u);
});

await control("recovery branch proof rejects changed predicate polarity",async () => {
  const row=GUIDE_MATRIX.find(({ recoveryClass }) => recoveryClass === "NEGATED_OPERATION_AND_NAVIGATION");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,analyzeRecoverySemantics:(_text,language) => ({
      language,navigation:"AFFIRMATIVE",credentialOperation:"AFFIRMATIVE"
    })
  }),/GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH/u);
});

await control("required navigation rejects a missing closed action",async () => {
  const row=GUIDE_MATRIX.find(({ actionPolicy }) => actionPolicy === "REQUIRE_CLOSED");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,resolveSupportActions:() => []
  }),/GUIDE_HARNESS_REQUIRED_ACTION_PROOF_MISMATCH/u);
});

const modelRow=GUIDE_MATRIX.find(row => row.branch === "MODEL");
const privateRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_PRIVATE_REFUSAL");
const recoveryRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_RECOVERY");
const visible=(text,sources=[],actions=[]) => ({ text,sources,actions });

await control("accepted model draft attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Public guide",["Guide"]),diagnostic:{ status:"ACCEPTED_DRAFT",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"MODEL_ACCEPTED_DRAFT");
});

await control("reviewed fallback attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Reviewed",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Reviewed",["Guide"]),diagnostic:{ status:"ATTRIBUTED_RECOVERY",candidateCount:1 }
  });
  assert.equal(result.responseOrigin,"REVIEWED_FALLBACK");
});

await control("ambiguous model attribution fails closed",async () => {
  assert.throws(() => assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"x",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("x",["Guide"]),diagnostic:{ status:"AMBIGUOUS",candidateCount:2 }
  }),/GUIDE_HARNESS_ATTRIBUTION_AMBIGUOUS/u);
});

await control("private record request is deterministic and actionless",async () => {
  const result=assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Private records unavailable",sources:[],actions:[] },
    visible:visible("Private records unavailable"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_PRIVATE_REFUSAL");
});

await control("unresolved recovery is deterministic and actionless",async () => {
  const result=assertGuideObservation({
    row:recoveryRow,proof:{ branch:recoveryRow.branch,recoveryClass:recoveryRow.recoveryClass },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Recovery guidance",sources:[],actions:[] },
    visible:visible("Recovery guidance"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_RECOVERY");
});

await control("deterministic rows reject model diagnostics",async () => {
  assert.throws(() => assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Fixed"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:1 }
  }),/GUIDE_HARNESS_UNEXPECTED_MODEL_DIAGNOSTIC/u);
});

await control("API DOM mismatch fails closed",async () => {
  assert.throws(() => assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Different"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  }),/GUIDE_HARNESS_API_DOM_MISMATCH/u);
});

await control("gate rejects placeholders and any resolved Forgot connector",async () => {
  assert.throws(() => validateGuideGateInput({}),/GUIDE_HARNESS_FINAL_GATE_INVALID/u);
  const valid={
    schemaVersion:1,
    productRoot:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
    finalCommit:"a".repeat(40),productInventoryPath:"/tmp/inventory.json",productInventorySha256:"b".repeat(64),
    attestationPath:"/tmp/attestation.json",attestationSha256:"c".repeat(64),
    expectedSnapshotVersion:"d".repeat(64),expectedEntryCount:1,
    requiredSuiteReceiptPath:"/tmp/suite.json",requiredSuiteReceiptSha256:"e".repeat(64),
    controlProofPath:"/tmp/controls.json",controlProofSha256:"f".repeat(64),
    runtimeLogPath:"/tmp/runtime.log",baseUrl:"https://localhost:3100",
    forgotConnector:{ status:"UNRESOLVED_ACTIONLESS" }
  };
  assert.equal(validateGuideGateInput(valid).forgotConnector.status,"UNRESOLVED_ACTIONLESS");
  assert.throws(() => validateGuideGateInput({ ...valid,forgotConnector:{ status:"VERIFIED",href:"/reset" } }),/GUIDE_HARNESS_FINAL_GATE_INVALID/u);
});

const finalCommit="a".repeat(40);
const kbVersion="b".repeat(64);
const suiteFiles=[
  ...Array.from({ length:25 },(_,index) => `tests/frozen/live-p2-${index+1}.test.ts`),
  "tests/render/sup-03-consent.test.tsx","tests/render/sup-04-widget.test.tsx",
  "tests/render/support-topbar.test.tsx","tests/unit/support-public-guide-boundary.test.ts",
  "tests/unit/support-recovery-intent.test.ts","tests/unit/s7-authorization.test.ts",
  "tests/architecture/sup-01-boundary.test.ts","tests/architecture/sup-03-projection.test.ts"
];
const boundReceipts={
  finalCommit,kbVersion,entryCount:2,
  inventory:{ revision:finalCommit,productFiles:[{ laneRelative:"a",sha256:"c".repeat(64),bytes:1 }] },
  attestation:{ finalCommit,snapshot:{ kbVersion,entryCount:2 },logicalRecords:[{},{}] },
  suite:{ revision:finalCommit,kbVersion,exitCode:0,files:suiteFiles,argv:["pnpm","exec","vitest","run",...suiteFiles,"--maxWorkers=1"] },
  controlProof:{ controls:17,passed:17,names:Array.from({ length:17 },(_,index) => `control-${index+1}`) }
};

await control("bound receipts pin revision snapshot suite membership and controls",async () => {
  const result=validateBoundReceiptMembership(boundReceipts);
  assert.equal(result.suiteFiles.length,33);
  assert.equal(result.controlCount,17);
});

for (const [name,mutate] of [
  ["wrong revision receipt rejected",input => { input.suite.revision="c".repeat(40); }],
  ["missing required suite member rejected",input => { input.suite.files=input.suite.files.slice(1); }],
  ["unsupported worker flag receipt rejected",input => { input.suite.argv.push("--minWorkers"); }],
  ["stale control count receipt rejected",input => { input.controlProof.passed-=1; }]
]) {
  await control(name,async () => {
    const input=structuredClone(boundReceipts);
    mutate(input);
    assert.throws(() => validateBoundReceiptMembership(input),/GUIDE_HARNESS_BOUND_RECEIPT_INVALID/u);
  });
}

await control("declared count derives from completed controls",async () => {
  assert.equal(deriveDeclaredControlCount(results),results.length);
});

await control("future capture parses without executing traffic",async () => {
  execFileSync(process.execPath,["--check",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS/capture-public-guide.mjs"
  ],{ stdio:"pipe" });
});

const output={ schemaVersion:1,controls:deriveDeclaredControlCount(results),passed:results.length,names:results };
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
