import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_STRENGTHS } from "@debateai/kernel";
import {
  MODEL_STRENGTH_COPY,
  MODEL_STRENGTH_OPTIONS,
  isModelStrength,
  modelStrengthControl,
  modelStrengthLabel
} from "./modelStrength.ts";

test("A21: offers the kernel's three strengths, in its order, with plain labels", () => {
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => option.value), [...MODEL_STRENGTHS]);
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => option.label), ["Economy", "Balanced", "Best"]);
  assert.deepEqual(MODEL_STRENGTHS.map((strength) => modelStrengthLabel(strength)), ["Economy", "Balanced", "Best"]);
});

test("A21: recognises exactly the three strengths", () => {
  for (const strength of MODEL_STRENGTHS) assert.equal(isModelStrength(strength), true);
  for (const other of ["economy", "TURBO", "", null, undefined, 2]) assert.equal(isModelStrength(other), false);
});

test("A21: no option carries a price or a figure the API never sent", () => {
  for (const option of MODEL_STRENGTH_OPTIONS) assert.doesNotMatch(option.label, /[$€\d]|USD/u);
});

// A21 · owner decision O4: shown, but greyed out and marked "not in effect" while no
// scored model list is in force — on either plan. The Free lock applies only once it is.
test("A21 O4: not in effect outranks the plan; Free locks; Premium leaves the choice open", () => {
  assert.deepEqual(
    [
      modelStrengthControl({ scorecardInForce: false, planTier: "free" }),
      modelStrengthControl({ scorecardInForce: false, planTier: "premium" }),
      modelStrengthControl({ scorecardInForce: true, planTier: "free" }),
      modelStrengthControl({ scorecardInForce: true, planTier: "premium" })
    ],
    [
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.fixedByFree },
      { locked: false, hint: MODEL_STRENGTH_COPY.hint.yoursToChoose }
    ]
  );
  assert.match(MODEL_STRENGTH_COPY.hint.notInEffect, /not in effect/u);
});

// Owner rules: plain words, no internals, no prices. O2: every new string lives in
// MODEL_STRENGTH_COPY, so the port to the site's language catalogs has one place to read.
test("A21 O2: every visitor-facing string is in one place and names no figure or internal term", () => {
  const strings = [
    MODEL_STRENGTH_COPY.label,
    ...Object.values(MODEL_STRENGTH_COPY.options),
    ...Object.values(MODEL_STRENGTH_COPY.hint)
  ];
  assert.equal(strings.length, 7);
  for (const text of strings) {
    assert.doesNotMatch(text, /[$€\d]|USD/u);
    assert.doesNotMatch(text, /scorecard|deployment|tier|picker|roster|seat/iu);
  }
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => option.label), MODEL_STRENGTHS.map((strength) =>
    MODEL_STRENGTH_COPY.options[strength]));
});
