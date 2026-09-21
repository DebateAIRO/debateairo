import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  GUIDE_CANONICAL_MATRIX,GUIDE_MATRIX,GUIDE_OWNER_ROWS
} from "../GUIDE_HARNESS_BIND21/matrix.mjs";
import { validateExactGuide58Identity } from "./exact58-contract.mjs";

const sha256=bytes => createHash("sha256").update(bytes).digest("hex");
const clone=value => JSON.parse(JSON.stringify(value));
const expectedFailure=(value,code) => assert.throws(
  () => validateExactGuide58Identity(value,GUIDE_CANONICAL_MATRIX,GUIDE_OWNER_ROWS),
  error => error?.message === code
);

assert.equal(validateExactGuide58Identity(
  GUIDE_MATRIX,GUIDE_CANONICAL_MATRIX,GUIDE_OWNER_ROWS
),true);
expectedFailure(clone(GUIDE_MATRIX).slice(0,-1),"GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH");
expectedFailure([...clone(GUIDE_MATRIX),clone(GUIDE_MATRIX[0])],"GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH");
const duplicate=clone(GUIDE_MATRIX);
duplicate[57]=clone(duplicate[56]);
expectedFailure(duplicate,"GUIDE_ROW_PROOF_MATRIX_IDENTITY_MISMATCH");
const changedOwner=clone(GUIDE_MATRIX);
changedOwner[56].requiredActionId="sign-up";
expectedFailure(changedOwner,"GUIDE_ROW_PROOF_MATRIX_IDENTITY_MISMATCH");

const importerPath=new URL("./replay-row-proofs.mjs",import.meta.url);
const importerBytes=await readFile(importerPath);
const importer=importerBytes.toString("utf8");
assert.match(importer,/validateExactGuide58Identity\(GUIDE_MATRIX,GUIDE_CANONICAL_MATRIX,GUIDE_OWNER_ROWS\)/u);
assert.match(importer,/rows\.length !== 58/u);
assert.match(importer,/row\.requiredActionId \?\? row\.navigation\?\.actionId \?\? null/u);

process.stdout.write(`${JSON.stringify({
  result:"PASS",controls:8,canonicalRows:54,ownerRows:4,totalRows:58,
  ownerSources:["product-identity","account-access"],
  ownerActions:["sign-in","sign-up"],
  importerSha256:sha256(importerBytes)
})}\n`);
