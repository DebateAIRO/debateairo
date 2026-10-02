import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DEBATE_ROLES, MODEL_STRENGTHS } from "@debateai/kernel";
import { t } from "./i18n/translate.ts";
import {
  MODEL_ASSIGNMENT_KEYS,
  MODEL_STRENGTH_KEYS,
  MODEL_STRENGTH_OPTIONS,
  PLAN_CARD_KEYS,
  isModelStrength,
  modelAssignmentJobs,
  modelStrengthControl,
  planCardNamesRoster
} from "./modelStrength.ts";

// S1b (owner decision O2): the scorecard's copy tables are catalogue keys now, in
// 35 locales; the English sentences these rows compare are the `en` catalogues'.
const english = (namespace) => JSON.parse(readFileSync(join(process.cwd(), "messages", "en", `${namespace}.json`), "utf8"));
const newDebate = english("newDebate");
const misc = english("misc");

test("A21: offers the kernel's three strengths, in its order, with plain labels", () => {
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => option.value), [...MODEL_STRENGTHS]);
  assert.deepEqual(MODEL_STRENGTH_OPTIONS.map((option) => t(newDebate, option.labelKey)), ["Economy", "Balanced", "Best"]);
  assert.deepEqual(MODEL_STRENGTHS.map((strength) => t(newDebate, MODEL_STRENGTH_KEYS.options[strength])), ["Economy", "Balanced", "Best"]);
});

test("A21: recognises exactly the three strengths", () => {
  for (const strength of MODEL_STRENGTHS) assert.equal(isModelStrength(strength), true);
  for (const other of ["economy", "TURBO", "", null, undefined, 2]) assert.equal(isModelStrength(other), false);
});

test("A21: no option carries a price or a figure the API never sent", () => {
  for (const option of MODEL_STRENGTH_OPTIONS) assert.doesNotMatch(t(newDebate, option.labelKey), /[$€\d]|USD/u);
});

test("A21 O4: not in effect outranks the plan; Free locks; Premium chooses; a failed or pending read claims no reason", () => {
  assert.deepEqual(
    [
      modelStrengthControl({ scorecard: "NOT_IN_FORCE", planTier: "free" }),
      modelStrengthControl({ scorecard: "NOT_IN_FORCE", planTier: "premium" }),
      modelStrengthControl({ scorecard: "IN_FORCE", planTier: "free" }),
      modelStrengthControl({ scorecard: "IN_FORCE", planTier: "premium" }),
      modelStrengthControl({ scorecard: "READ_FAILED", planTier: "free" }),
      modelStrengthControl({ scorecard: "READ_FAILED", planTier: "premium" }),
      modelStrengthControl({ scorecard: "PENDING", planTier: "free" }),
      modelStrengthControl({ scorecard: "PENDING", planTier: "premium" })
    ],
    [
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notInEffect },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notInEffect },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.fixedByFree },
      { locked: false, hintKey: MODEL_STRENGTH_KEYS.hint.yoursToChoose },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notAvailable },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.notAvailable },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.pending },
      { locked: true, hintKey: MODEL_STRENGTH_KEYS.hint.pending }
    ]
  );
  const hint = (name) => t(newDebate, MODEL_STRENGTH_KEYS.hint[name]);
  assert.match(hint("notInEffect"), /not in effect/u);
  assert.match(hint("notAvailable"), / · not available right now$/u);
  assert.doesNotMatch(hint("notAvailable"), /scored|Free|plan|choose/u);
  // Pending: the shared description every other hint starts with, and no note after it.
  assert.doesNotMatch(hint("pending"), /·/u);
  for (const name of Object.keys(MODEL_STRENGTH_KEYS.hint)) {
    if (name !== "pending") assert.ok(hint(name).startsWith(`${hint("pending")} · `), name);
  }
});

test("A21 O2: every visitor-facing string is a newDebate key and names no figure or internal term", () => {
  const keys = [MODEL_STRENGTH_KEYS.label, ...Object.values(MODEL_STRENGTH_KEYS.options), ...Object.values(MODEL_STRENGTH_KEYS.hint)];
  assert.equal(keys.length, 9);
  for (const key of keys) {
    assert.ok(Object.hasOwn(newDebate, key), key);
    assert.doesNotMatch(newDebate[key], /[$€\d]|USD/u);
    assert.doesNotMatch(newDebate[key], /scorecard|deployment|tier|picker|roster|seat/iu);
  }
});

test("C1: a plan card names the plan's models only when the session says no scored model list is in force", () => {
  assert.deepEqual(
    ["IN_FORCE", "NOT_IN_FORCE", "PENDING", "READ_FAILED"].map((scorecard) => planCardNamesRoster(scorecard)),
    [false, true, false, false]
  );
  assert.deepEqual(Object.keys(PLAN_CARD_KEYS), ["modelsChosenPerPart"]);
  const line = t(newDebate, PLAN_CARD_KEYS.modelsChosenPerPart);
  assert.equal(line, "The AI models are chosen for each part of the debate.");
  assert.doesNotMatch(line, /[$€\d]|USD/u);
  assert.doesNotMatch(line, /scorecard|scored|deployment|tier|picker|roster|seat|strength|plan|free|premium|role/iu);
});

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
  const labels = DEBATE_ROLES.map((role) => t(misc, MODEL_ASSIGNMENT_KEYS.jobs[role]));
  assert.equal(new Set(labels).size, DEBATE_ROLES.length);
  for (const label of labels) assert.match(label, /^[A-Z][A-Za-z -]+$/u);
  // O1 / O-11: plain words, never the engine's own names for its jobs.
  for (const label of labels) assert.doesNotMatch(label, /panel|cross-maker|cross-exchange|seat|role|synthes/iu);
});

test("A21 O1: each job lists the distinct models chosen for it, by maker and model id only", () => {
  const jobs = modelAssignmentJobs(ASSIGNMENT);
  assert.deepEqual(jobs.map((job) => job.role), ["POSITION", "CROSS_EXCHANGE", "JUDGE", "ANSWER_WRITER", "ANSWER_CHECKER"]);
  assert.deepEqual(jobs[0], {
    role: "POSITION",
    labelKey: MODEL_ASSIGNMENT_KEYS.jobs.POSITION,
    models: [
      { maker: "Alpha", modelId: "alpha-large" },
      { maker: "Beta", modelId: "beta-large" },
      { maker: "Gamma", modelId: "gamma-small" }
    ],
    noteKey: null
  });
  assert.deepEqual(jobs[2].models, [{ maker: "Beta", modelId: "beta-large" }]);
  assert.deepEqual(jobs[3].models, [{ maker: "Alpha", modelId: "alpha-large" }, { maker: "Gamma", modelId: "gamma-small" }]);
  for (const job of jobs) for (const model of job.models) assert.deepEqual(Object.keys(model), ["maker", "modelId"]);
  assert.doesNotMatch(JSON.stringify(jobs.map((job) => job.models)), /seat|thinking|DEFAULT_ONLY|"high"|"low"|share|0\.2|scorecard|BALANCED|stepped/u);
});

test("A21 carries 4 and 5: a FALLBACK answer seat and the cross-exchange get one fixed line, never a model name", () => {
  const byRole = new Map(modelAssignmentJobs(ASSIGNMENT).map((job) => [job.role, job]));
  assert.deepEqual(byRole.get("CROSS_EXCHANGE"), {
    role: "CROSS_EXCHANGE", labelKey: MODEL_ASSIGNMENT_KEYS.jobs.CROSS_EXCHANGE, models: [], noteKey: MODEL_ASSIGNMENT_KEYS.crossExchange
  });
  assert.deepEqual(byRole.get("ANSWER_CHECKER"), {
    role: "ANSWER_CHECKER", labelKey: MODEL_ASSIGNMENT_KEYS.jobs.ANSWER_CHECKER, models: [], noteKey: MODEL_ASSIGNMENT_KEYS.siteSetting
  });
  const flipped = {
    ...ASSIGNMENT,
    roles: [
      { role: "ANSWER_WRITER", seats: [seat(0, "FALLBACK", ALPHA)] },
      { role: "ANSWER_CHECKER", seats: [seat(0, "SCORECARD", BETA)] }
    ]
  };
  assert.deepEqual(modelAssignmentJobs(flipped).map((job) => [job.role, job.models, job.noteKey]), [
    ["ANSWER_WRITER", [], MODEL_ASSIGNMENT_KEYS.siteSetting],
    ["ANSWER_CHECKER", [{ maker: "Beta", modelId: "beta-large" }], null]
  ]);
});

test("A21 O3: the list is the same whatever the strength, the step-down or the scorecard version", () => {
  assert.deepEqual(
    modelAssignmentJobs({ ...ASSIGNMENT, strength: "BEST", stepped_down: false, scorecard_version: null }),
    modelAssignmentJobs(ASSIGNMENT)
  );
});

test("A21 O2: the drawer's strings are misc keys and name no figure or internal term", () => {
  assert.deepEqual(Object.keys(MODEL_ASSIGNMENT_KEYS), ["title", "standIn", "siteSetting", "crossExchange", "jobs"]);
  const keys = [
    MODEL_ASSIGNMENT_KEYS.title,
    MODEL_ASSIGNMENT_KEYS.standIn,
    MODEL_ASSIGNMENT_KEYS.siteSetting,
    MODEL_ASSIGNMENT_KEYS.crossExchange,
    ...Object.values(MODEL_ASSIGNMENT_KEYS.jobs)
  ];
  assert.equal(keys.length, 11);
  for (const key of keys) {
    assert.ok(Object.hasOwn(misc, key), key);
    assert.doesNotMatch(misc[key], /[$€%\d]|USD/u);
    assert.doesNotMatch(
      misc[key],
      /scorecard|deployment|tier|picker|roster|seat|thinking|plan list|backup|runner|fallback|stepped down|step-down|lower|strength/iu
    );
  }
  // Carry 6: the title claims a choice, never use.
  assert.doesNotMatch(misc[MODEL_ASSIGNMENT_KEYS.title], /used/iu);
});
