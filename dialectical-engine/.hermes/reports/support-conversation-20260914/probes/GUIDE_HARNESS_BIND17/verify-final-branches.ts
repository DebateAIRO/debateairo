import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { GUIDE_MATRIX } from "./matrix.mjs";

const [productRoot,expectedCommit]=process.argv.slice(2);
if (typeof productRoot !== "string" || !productRoot.startsWith("/")
  || typeof expectedCommit !== "string" || !/^[0-9a-f]{40}$/u.test(expectedCommit)) {
  throw new Error("GUIDE_HARNESS_BRANCH_ARGS_INVALID");
}
const head=execFileSync("git",["-C",productRoot,"rev-parse","HEAD"],{ encoding:"utf8" }).trim();
const status=execFileSync("git",["-C",productRoot,"status","--short"],{ encoding:"utf8" });
if (head !== expectedCommit || status !== "") throw new Error("GUIDE_HARNESS_PRODUCT_CUSTODY_MISMATCH");
const assistantBytes=readFileSync(resolve(productRoot,"apps/ui/components/support/Assistant.tsx"));
const assistantSha256=createHash("sha256").update(assistantBytes).digest("hex");
assert.equal(
  assistantSha256,"5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3",
  "GUIDE_HARNESS_ASSISTANT_CONTRACT_CHANGED"
);
const load=(relative:string) => import(`${pathToFileURL(resolve(productRoot,relative)).href}?guide-branch=${expectedCommit}`);
const [classifier,boundary,recovery,loader]=await Promise.all([
  load("apps/api/src/support/classify.ts"),
  load("apps/api/src/support/public-guide-boundary.ts"),
  load("apps/api/src/support/recovery-intent.ts"),
  load("packages/support-kb/src/index.ts")
]);
const corpus=loader.loadHelpCorpus(resolve(productRoot,"packages/support-kb/content"),{
  reviewManifest:JSON.parse(readFileSync(resolve(productRoot,"packages/support-kb/reviews/manifest.json"),"utf8")),
  recoveryComponents:readFileSync(resolve(productRoot,"packages/support-kb/recovery/components.json")),
  requireReviewedRecovery:true
});
assert.match(corpus.kbVersion,/^[0-9a-f]{64}$/u,"GUIDE_HARNESS_KB_VERSION_INVALID");
const findings=[];
for (const row of GUIDE_MATRIX) {
  const classified=classifier.classifySupportMessage(row.prompt);
  const bounded=boundary.classifyPublicGuideBoundary(row.prompt,row.language);
  const semantics=recovery.analyzeRecoverySemantics(row.prompt,row.language);
  if (row.branch === "DETERMINISTIC_PRIVATE_REFUSAL") {
    assert.equal(bounded.kind,"PRIVATE_RECORD_REQUEST",`GUIDE_HARNESS_PRIVATE_BRANCH_PROOF_MISMATCH:${row.sequence}`);
    assert.notEqual(classified.outcome,"REFUSE_INJECTION");
    assert.notEqual(classified.outcome,"REFUSE_SAFETY");
  } else if (row.branch === "DETERMINISTIC_INJECTION_REFUSAL") {
    assert.equal(bounded.kind,"PUBLIC_GUIDE",`GUIDE_HARNESS_INJECTION_BRANCH_PROOF_MISMATCH:${row.sequence}`);
    assert.equal(classified.outcome,"REFUSE_INJECTION",`GUIDE_HARNESS_INJECTION_BRANCH_PROOF_MISMATCH:${row.sequence}`);
  } else if (row.branch === "DETERMINISTIC_RECOVERY") {
    const expected={
      POSITIVE_NAVIGATION:["AFFIRMATIVE","ABSENT","FORGOT_PASSWORD",undefined],
      OPERATION_ONLY:["ABSENT","AFFIRMATIVE",undefined,"CREDENTIAL_OPERATION"],
      OPERATION_AND_NAVIGATION:["AFFIRMATIVE","AFFIRMATIVE","FORGOT_PASSWORD","CREDENTIAL_OPERATION"],
      NEGATED_OPERATION_AND_NAVIGATION:["AFFIRMATIVE","NEGATED","FORGOT_PASSWORD",undefined]
    }[row.recoveryClass];
    assert.ok(expected,`GUIDE_HARNESS_RECOVERY_CLASS_INVALID:${row.sequence}`);
    assert.deepEqual(
      [semantics.navigation,semantics.credentialOperation,classified.securityNavigation,classified.securityOperation],
      expected,`GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH:${row.sequence}`
    );
    assert.equal(classified.outcome,"REFUSE_ZONE",`GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH:${row.sequence}`);
  } else {
    if (bounded.kind !== "PUBLIC_GUIDE" || classified.outcome !== null
      || classified.securityNavigation !== undefined || classified.securityOperation !== undefined) {
      findings.push(Object.freeze({
        sequence:row.sequence,family:row.family,mode:row.mode,language:row.language,
        outcome:classified.outcome,link:classified.link,
        securityNavigation:classified.securityNavigation ?? null,
        securityOperation:classified.securityOperation ?? null,boundary:bounded.kind
      }));
    }
    if (row.recoveryClass === "NEGATED_OR_UNRELATED") {
      assert.deepEqual(
        [semantics.navigation,semantics.credentialOperation],["ABSENT","NEGATED"],
        `GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH:${row.sequence}`
      );
    }
  }
}
if (findings.length !== 0) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion:1,revision:expectedCommit,kbVersion:corpus.kbVersion,
    assistantSha256,verdict:"PUBLIC_NAVIGATION_REFUSED",findings
  },null,2)}\n`);
  throw new Error("GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED");
}
process.stdout.write(`${JSON.stringify({
  schemaVersion:1,revision:expectedCommit,kbVersion:corpus.kbVersion,
  assistantSha256,verdict:"PASS",rows:GUIDE_MATRIX.length,
  branches:GUIDE_MATRIX.reduce((counts,row) => ({
    ...counts,[row.branch]:(counts[row.branch] ?? 0)+1
  }),{})
},null,2)}\n`);
