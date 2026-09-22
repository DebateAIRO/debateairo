import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateRetainedCompositionContract } from "./composition.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function validateGuidePreflightSchema(contract, { reachUiChild = async () => ({ intercepted: false }) } = {}) {
  const compositionBytes = await readFile(contract.compositionContractPath);
  assert.equal(sha256(compositionBytes), contract.compositionContractSha256, "GUIDE_PREFLIGHT_COMPOSITION_BINDING_INVALID");
  const composition = await validateRetainedCompositionContract(JSON.parse(compositionBytes));
  assert.equal(composition.schemaVersion, 2, "GUIDE_PREFLIGHT_SCHEMA_INVALID");
  assert.equal(composition.retainedSequences.length, 11, "GUIDE_PREFLIGHT_RETAINED_CARDINALITY_INVALID");
  assert.equal(composition.remainingSequences.length, 20, "GUIDE_PREFLIGHT_REMAINING_CARDINALITY_INVALID");
  assert.equal(new Set([...composition.retainedSequences, ...composition.remainingSequences]).size, 31, "GUIDE_PREFLIGHT_UNION_CARDINALITY_INVALID");
  assert.deepEqual(contract.retainedSequences, composition.retainedSequences, "GUIDE_PREFLIGHT_RETAINED_BINDING_INVALID");
  assert.deepEqual(contract.actualSequences, composition.remainingSequences, "GUIDE_PREFLIGHT_REMAINING_BINDING_INVALID");

  const ui = contract.phases.preflight.ui;
  const uiBytes = await readFile(ui.script);
  assert.equal(sha256(uiBytes), ui.sha256, "GUIDE_PREFLIGHT_UI_BINDING_INVALID");
  assert.equal(uiBytes.byteLength, ui.bytes, "GUIDE_PREFLIGHT_UI_SIZE_INVALID");
  const boundary = await reachUiChild(ui);
  return { composition, ui, boundary, retainedRows: 11, remainingRows: 20 };
}
