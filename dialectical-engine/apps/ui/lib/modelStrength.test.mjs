import assert from "node:assert/strict";
import test from "node:test";
import { DEBATE_ROLES, MODEL_STRENGTHS } from "@debateai/kernel";
import {
  MODEL_ASSIGNMENT_COPY,
  MODEL_STRENGTH_COPY,
  MODEL_STRENGTH_OPTIONS,
  debateRoleLabel,
  isModelStrength,
  modelAssignmentJobs,
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
// A21.3 carry 14 (A21.2 review Minor 2): when the page could not learn the answer
// (null: the session read failed or has not answered), the note claims no reason.
test("A21 O4: not in effect outranks the plan; Free locks; Premium leaves the choice open; unknown claims no reason", () => {
  assert.deepEqual(
    [
      modelStrengthControl({ scorecardInForce: false, planTier: "free" }),
      modelStrengthControl({ scorecardInForce: false, planTier: "premium" }),
      modelStrengthControl({ scorecardInForce: true, planTier: "free" }),
      modelStrengthControl({ scorecardInForce: true, planTier: "premium" }),
      modelStrengthControl({ scorecardInForce: null, planTier: "free" }),
      modelStrengthControl({ scorecardInForce: null, planTier: "premium" })
    ],
    [
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notInEffect },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.fixedByFree },
      { locked: false, hint: MODEL_STRENGTH_COPY.hint.yoursToChoose },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notAvailable },
      { locked: true, hint: MODEL_STRENGTH_COPY.hint.notAvailable }
    ]
  );
  assert.match(MODEL_STRENGTH_COPY.hint.notInEffect, /not in effect/u);
  assert.match(MODEL_STRENGTH_COPY.hint.notAvailable, / · not available right now$/u);
  assert.doesNotMatch(MODEL_STRENGTH_COPY.hint.notAvailable, /scored|Free|plan|choose/u);
});

// Owner rules: plain words, no internals, no prices. O2: every new string lives in
// MODEL_STRENGTH_COPY, so the port to the site's language catalogs has one place to read.
test("A21 O2: every visitor-facing string is in one place and names no figure or internal term", () => {
  const strings = [
    MODEL_STRENGTH_COPY.label,
    ...Object.values(MODEL_STRENGTH_COPY.options),
    ...Object.values(MODEL_STRENGTH_COPY.hint)
  ];
  // 7 from A21.2, plus A21.3's "not available right now" (carry 14).
  assert.equal(strings.length, 8);
  for (const text of strings) {
    assert.doesNotMatch(text, /[$€\d]|USD/u);
    assert.doesNotMatch(text, /scorecard|deployment|tier|picker|roster|seat/iu);
  }
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => option.label), MODEL_STRENGTHS.map((strength) =>
    MODEL_STRENGTH_COPY.options[strength]));
});

/*
 * A21.3 — the finished debate's honesty drawer names the models chosen for each debate job.
 * Owner decision O1: a PLAIN list — per job, the model names, and one sentence that another
 * model may have stepped in. No seat, thinking level, backup share, strength, step-down or
 * scorecard version (O3); that detail stays in the JSON export.
 */
const ALPHA = { maker: "Alpha", model_id: "alpha-large", thinking_level: "high" };
const ALPHA_LOW = { maker: "Alpha", model_id: "alpha-large", thinking_level: "low" };
const BETA = { maker: "Beta", model_id: "beta-large", thinking_level: "DEFAULT_ONLY" };
const GAMMA = { maker: "Gamma", model_id: "gamma-small", thinking_level: "DEFAULT_ONLY" };

function seat(seatIndex, source, main, runnerUp = null) {
  return { seat_index: seatIndex, source, main, runner_up: runnerUp, runner_up_share: runnerUp === null ? 0 : 0.2 };
}

const ASSIGNMENT = Object.freeze({
  strength: "BALANCED",
  stepped_down: true,
  scorecard_version: 4,
  roles: [
    { role: "POSITION", seats: [seat(0, "SCORECARD", ALPHA, BETA), seat(1, "SCORECARD", GAMMA, ALPHA_LOW)] },
    { role: "SUPPORT_ATTACK", seats: [] },
    { role: "CROSS_EXCHANGE", seats: [seat(0, "SCORECARD", ALPHA, BETA), seat(1, "SCORECARD", GAMMA, ALPHA_LOW)] },
    { role: "JUDGE", seats: [seat(0, "FALLBACK", BETA)] },
    { role: "REVIEWER", seats: [] },
    { role: "ANSWER_WRITER", seats: [seat(0, "SCORECARD", ALPHA, GAMMA)] },
    { role: "ANSWER_CHECKER", seats: [seat(0, "FALLBACK", BETA)] }
  ]
});

test("A21: every debate role has its own plain label", () => {
  const labels = DEBATE_ROLES.map((role) => debateRoleLabel(role));
  assert.equal(new Set(labels).size, DEBATE_ROLES.length);
  for (const label of labels) assert.match(label, /^[A-Z][A-Za-z -]+$/u);
  // O1 / O-11: plain words, never the engine's own names for its jobs.
  for (const label of labels) assert.doesNotMatch(label, /panel|cross-maker|cross-exchange|seat|role|synthes/iu);
});

test("A21 O1: each job lists the distinct models chosen for it, by maker and model id only", () => {
  const jobs = modelAssignmentJobs(ASSIGNMENT);
  // A job with no seats in this debate is not listed; the kernel's order is kept.
  assert.deepEqual(jobs.map((job) => job.role), ["POSITION", "CROSS_EXCHANGE", "JUDGE", "ANSWER_WRITER", "ANSWER_CHECKER"]);
  assert.deepEqual(jobs[0], {
    role: "POSITION",
    label: debateRoleLabel("POSITION"),
    // Mains and backups alike, each model once (alpha-large at two thinking levels is one model).
    models: [
      { maker: "Alpha", modelId: "alpha-large" },
      { maker: "Beta", modelId: "beta-large" },
      { maker: "Gamma", modelId: "gamma-small" }
    ],
    note: null
  });
  // A FALLBACK seat of a debate job is still sat by its model, so it is named.
  assert.deepEqual(jobs[2].models, [{ maker: "Beta", modelId: "beta-large" }]);
  assert.deepEqual(jobs[3].models, [{ maker: "Alpha", modelId: "alpha-large" }, { maker: "Gamma", modelId: "gamma-small" }]);
  for (const job of jobs) for (const model of job.models) assert.deepEqual(Object.keys(model), ["maker", "modelId"]);
  assert.doesNotMatch(JSON.stringify(jobs), /seat|thinking|DEFAULT_ONLY|"high"|"low"|share|0\.2|scorecard|BALANCED|stepped/u);
});

test("A21 carries 4 and 5: a FALLBACK answer seat and the cross-exchange get one fixed line, never a model name", () => {
  const byRole = new Map(modelAssignmentJobs(ASSIGNMENT).map((job) => [job.role, job]));
  assert.deepEqual(byRole.get("CROSS_EXCHANGE"), {
    role: "CROSS_EXCHANGE", label: debateRoleLabel("CROSS_EXCHANGE"), models: [], note: MODEL_ASSIGNMENT_COPY.crossExchange
  });
  assert.deepEqual(byRole.get("ANSWER_CHECKER"), {
    role: "ANSWER_CHECKER", label: debateRoleLabel("ANSWER_CHECKER"), models: [], note: MODEL_ASSIGNMENT_COPY.siteSetting
  });
  const flipped = {
    ...ASSIGNMENT,
    roles: [
      { role: "ANSWER_WRITER", seats: [seat(0, "FALLBACK", ALPHA)] },
      { role: "ANSWER_CHECKER", seats: [seat(0, "SCORECARD", BETA)] }
    ]
  };
  assert.deepEqual(modelAssignmentJobs(flipped).map((job) => [job.role, job.models, job.note]), [
    ["ANSWER_WRITER", [], MODEL_ASSIGNMENT_COPY.siteSetting],
    ["ANSWER_CHECKER", [{ maker: "Beta", modelId: "beta-large" }], null]
  ]);
});

test("A21 O3: the list is the same whatever the strength, the step-down or the scorecard version", () => {
  assert.deepEqual(
    modelAssignmentJobs({ ...ASSIGNMENT, strength: "BEST", stepped_down: false, scorecard_version: null }),
    modelAssignmentJobs(ASSIGNMENT)
  );
});

test("A21 O2: the drawer's strings live in one place and name no figure or internal term", () => {
  const strings = [
    MODEL_ASSIGNMENT_COPY.title,
    MODEL_ASSIGNMENT_COPY.notRecorded,
    MODEL_ASSIGNMENT_COPY.standIn,
    MODEL_ASSIGNMENT_COPY.siteSetting,
    MODEL_ASSIGNMENT_COPY.crossExchange,
    ...Object.values(MODEL_ASSIGNMENT_COPY.jobs)
  ];
  assert.equal(strings.length, 12);
  for (const text of strings) {
    assert.doesNotMatch(text, /[$€%\d]|USD/u);
    assert.doesNotMatch(
      text,
      /scorecard|deployment|tier|picker|roster|seat|thinking|plan list|backup|runner|fallback|stepped down|step-down|lower|strength/iu
    );
  }
  assert.deepEqual(DEBATE_ROLES.map((role) => debateRoleLabel(role)), DEBATE_ROLES.map((role) => MODEL_ASSIGNMENT_COPY.jobs[role]));
  // Carry 6: the title claims a choice, never use; carry 13: true for "no scorecard" AND "unreadable pin".
  assert.doesNotMatch(MODEL_ASSIGNMENT_COPY.title, /used/iu);
  assert.doesNotMatch(MODEL_ASSIGNMENT_COPY.notRecorded, /because|no scorecard|plan/iu);
});
