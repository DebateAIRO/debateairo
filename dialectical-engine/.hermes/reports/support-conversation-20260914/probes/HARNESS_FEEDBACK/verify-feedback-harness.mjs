import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FEEDBACK_MATRIX,validateFeedbackMatrix } from "./matrix.mjs";
import {
  assertFeedbackObservation,deriveDeclaredControlCount,validateFinalGateInput
} from "./controls.mjs";
import { deriveFeedbackRowProof } from "./pre-request-verifier.ts";

const results = [];
async function control(name,operation) {
  await operation();
  results.push(name);
}

await control("matrix has the exact nine ordered prompts",async () => {
  assert.equal(FEEDBACK_MATRIX.length,9);
  assert.deepEqual(FEEDBACK_MATRIX.map(({ prompt }) => prompt),[
    "What is Dialectical-Engine?",
    "Ce este Dialectical Engine?",
    "How do I export my debate from Dialectical-Engine?",
    "Cum public o dezbatere în DebateAIRO?",
    "How do I create a debate?",
    "Can you give me the password recovery link?",
    "Dă-mi linkul de recuperare a parolei.",
    "Tell me about DebateAIRO.",
    "Can Dialectical Engine diagnose my symptoms?"
  ]);
  assert.equal(validateFeedbackMatrix(FEEDBACK_MATRIX),true);
});

for (const [name,mutate] of [
  ["duplicate sequence rejected",rows => { rows[1] = { ...rows[1],sequence:1 }; }],
  ["changed prompt rejected",rows => { rows[0] = { ...rows[0],prompt:"changed" }; }],
  ["changed branch rejected",rows => { rows[8] = { ...rows[8],branch:"MODEL" }; }]
]) {
  await control(name,async () => {
    const rows = FEEDBACK_MATRIX.map(row => ({ ...row }));
    mutate(rows);
    assert.throws(() => validateFeedbackMatrix(rows),/HARNESS_FEEDBACK_MATRIX_INVALID/u);
  });
}

const modelRow = FEEDBACK_MATRIX[0];
const recoveryRow = FEEDBACK_MATRIX[5];
const noSourceRow = FEEDBACK_MATRIX[8];
const visible = text => ({ text,sources:[],actions:[] });

await control("model accepted draft attribution is diagnostic-backed",async () => {
  const result = assertFeedbackObservation({
    row:modelRow,proof:{ branch:"MODEL",topSourceId:"product-identity" },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"About the product",sources:[{ id:"product-identity",label:"About" }],actions:[] },
    visible:{ text:"About the product",sources:["About"],actions:[] },
    diagnostic:{ status:"ACCEPTED_DRAFT",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"MODEL_ACCEPTED_DRAFT");
});

await control("model reviewed fallback attribution is diagnostic-backed",async () => {
  const result = assertFeedbackObservation({
    row:modelRow,proof:{ branch:"MODEL",topSourceId:"product-identity" },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Reviewed",sources:[{ id:"product-identity",label:"About" }],actions:[] },
    visible:{ text:"Reviewed",sources:["About"],actions:[] },
    diagnostic:{ status:"ATTRIBUTED_RECOVERY",candidateCount:1 }
  });
  assert.equal(result.responseOrigin,"REVIEWED_FALLBACK");
});

await control("ambiguous model attribution fails closed",async () => {
  assert.throws(() => assertFeedbackObservation({
    row:modelRow,proof:{ branch:"MODEL",topSourceId:"product-identity" },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"x",sources:[{ id:"product-identity",label:"About" }],actions:[] },
    visible:{ text:"x",sources:["About"],actions:[] },diagnostic:{ status:"AMBIGUOUS",candidateCount:2 }
  }),/HARNESS_FEEDBACK_ATTRIBUTION_AMBIGUOUS/u);
});

for (const [name,row,proof,outcome,origin] of [
  ["recovery is attributed by current branch proof",recoveryRow,{ branch:"DETERMINISTIC_RECOVERY",actionStatus:"UNAVAILABLE",action:null },"REFUSE_ZONE","DETERMINISTIC_RECOVERY"],
  ["unsupported topic is attributed by zero-source proof",noSourceRow,{ branch:"DETERMINISTIC_NO_SOURCE",sourceIds:[],actionIds:[] },"NO_SOURCE","DETERMINISTIC_NO_SOURCE"]
]) {
  await control(name,async () => {
    const result = assertFeedbackObservation({
      row,proof,api:{ status:200,outcome,text:"Fixed",sources:[],actions:[] },
      visible:visible("Fixed"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
    });
    assert.equal(result.responseOrigin,origin);
  });
}

await control("deterministic attribution rejects any model diagnostic",async () => {
  assert.throws(() => assertFeedbackObservation({
    row:recoveryRow,proof:{ branch:"DETERMINISTIC_RECOVERY",actionStatus:"UNAVAILABLE",action:null },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Fixed"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:1 }
  }),/HARNESS_FEEDBACK_UNEXPECTED_MODEL_DIAGNOSTIC/u);
});

await control("API and DOM mismatch fails closed",async () => {
  assert.throws(() => assertFeedbackObservation({
    row:noSourceRow,proof:{ branch:"DETERMINISTIC_NO_SOURCE",sourceIds:[],actionIds:[] },
    api:{ status:200,outcome:"NO_SOURCE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Different"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  }),/HARNESS_FEEDBACK_API_DOM_MISMATCH/u);
});

await control("verified recovery action must equal the supplied first-party destination",async () => {
  const proof = { branch:"DETERMINISTIC_RECOVERY",actionStatus:"VERIFIED",action:{ id:"forgot-password",label:"Forgot password",href:"/recover" } };
  const result = assertFeedbackObservation({
    row:recoveryRow,proof,
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[proof.action] },
    visible:{ text:"Fixed",sources:[],actions:[{ label:"Forgot password",href:"/recover" }] },
    diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_RECOVERY");
});

await control("recovery action cannot be inferred or substituted",async () => {
  assert.throws(() => assertFeedbackObservation({
    row:recoveryRow,proof:{ branch:"DETERMINISTIC_RECOVERY",actionStatus:"UNAVAILABLE",action:null },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[{ id:"settings",label:"Settings",href:"/settings" }] },
    visible:{ text:"Fixed",sources:[],actions:[{ label:"Settings",href:"/settings" }] },
    diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  }),/HARNESS_FEEDBACK_RECOVERY_ACTION_MISMATCH/u);
});

await control("gate rejects placeholders and unverified recovery destinations",async () => {
  assert.throws(() => validateFinalGateInput({}),/HARNESS_FEEDBACK_FINAL_GATE_INVALID/u);
  assert.throws(() => validateFinalGateInput({
    schemaVersion:1,productRoot:"/tmp/product",finalCommit:"a".repeat(40),
    inventoryPath:"/tmp/inventory.json",inventorySha256:"b".repeat(64),
    attestationPath:"/tmp/attestation.json",attestationSha256:"c".repeat(64),
    expectedSnapshotVersion:"d".repeat(64),expectedEntryCount:38,
    recovery:{ status:"VERIFIED",action:{ id:"forgot-password",label:{ en:"Forgot password",ro:"Am uitat parola" },href:"https://invalid.example/reset" } },
    controlProofPath:"/tmp/controls.json",controlProofSha256:"e".repeat(64),
    runtimeLogPath:"/tmp/runtime.log",baseUrl:"https://localhost:3100"
  }),/HARNESS_FEEDBACK_FINAL_GATE_INVALID/u);
});

await control("declared control count is derived from the completed result",async () => {
  assert.equal(deriveDeclaredControlCount(results),results.length);
});

const review = id => ({
  id,lang:"en",articleSha256:"a".repeat(64),modelProjectionSha256:"b".repeat(64),
  fallbackSha256:"",ratifiedBy:"",ratifiedOn:"",reviewedBy:"SOL",
  reviewerSession:"inert-reviewer",reviewedOn:"2026-09-17",evidence:"inert://review"
});
const inertEntry = (id,lang,title,body) => {
  const fallback = `Reviewed ${id} ${lang}`;
  const recoveryReview = { ...review(id),lang,
    fallbackSha256:createHash("sha256").update(fallback).digest("hex") };
  return { id,lang,title,body,status:"shipped",sources:[],verifiedAgainst:"inert",
    ratifiedBy:"",ratifiedOn:"",modelProjection:body,fallback,recoveryReview };
};
const inertCorpus = {
  kbVersion:"f".repeat(64),entries:[
    inertEntry("product-identity","en","About Dialectical Engine","Dialectical Engine is the DebateAIRO reasoning product."),
    inertEntry("product-identity","ro","Despre Dialectical Engine","Dialectical Engine este produsul de raționament DebateAIRO."),
    inertEntry("export-json","en","Export a debate as JSON","Export your debate as JSON."),
    inertEntry("publish-a-debate","ro","Publică o dezbatere","Publică o dezbatere din spațiul proprietarului."),
    inertEntry("getting-started-debate","en","Start a debate","Create and start a debate.")
  ]
};
for (const row of FEEDBACK_MATRIX) {
  await control(`pre-request branch proof row ${row.sequence}`,async () => {
    const proof = deriveFeedbackRowProof(inertCorpus,row,{ status:"UNAVAILABLE" });
    assert.equal(proof.branch,row.branch);
    if (row.branch === "MODEL") assert.equal(proof.topSourceId,row.topSourceId);
    if (row.branch === "DETERMINISTIC_RECOVERY") assert.equal(proof.actionStatus,"UNAVAILABLE");
    if (row.branch === "DETERMINISTIC_NO_SOURCE") assert.deepEqual(proof.sourceIds,[]);
  });
}

await control("future capture module parses without executing traffic",async () => {
  execFileSync(process.execPath,["--check",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/HARNESS_FEEDBACK/capture-owner-feedback.mjs"
  ],{ stdio:"pipe" });
});

const root = await mkdtemp(join(tmpdir(),"harness-feedback-"));
try {
  const output = { schemaVersion:1,controls:deriveDeclaredControlCount(results),passed:results.length,names:results };
  await writeFile(join(root,"controls.json"),JSON.stringify(output,null,2)+"\n");
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
} finally {
  await rm(root,{ recursive:true,force:true });
}
