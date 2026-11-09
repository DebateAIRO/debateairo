/**
 * V4 start step, Task 16: a path debate's paths for tests (Answer.branches), parsed with their own schemas so a fixture
 * is always a legal answer. Made-up words only.
 */
import { AnswerBranchesSchema, AnswerBranchSchema, PathOutcomeSchema, pathIdOf, type AnswerBranch, type AnswerBranches, type PathOutcome,
  type PathOutcomeState } from "@debateai/contract";

/** An outcome in `state`: READY (and READY_WITH_RESERVATION) with its text and a trust word, FAILED with nothing. */
export function outcomeFixture(state: PathOutcomeState = "READY", extra: Partial<PathOutcome> = {}): PathOutcome {
  const base = state === "FAILED"
    ? { state, text: null, what_changed: [], view: null, trust: null, rests_on: [] }
    : { state, text: { line: "The costs come before the savings.", summary: "Building takes ten years; savings come later.", fate: "HELD_UP" },
      what_changed: ["The costs were checked against two sources."], view: null, trust: "SURE_FOR_CASE", rests_on: ["n1"] };
  return PathOutcomeSchema.parse({ ...base, ...extra });
}

/** The `order`-th path (b<order>), argued with a READY outcome unless `extra` says otherwise. */
export function branchFixture(order: number, extra: Partial<AnswerBranch> = {}): AnswerBranch {
  return AnswerBranchSchema.parse({
    path_id: pathIdOf(order), order, title: `Path ${order}`, question: `What does path ${order} add to the main question?`,
    author: "AI_SUGGESTION", viewpoints: [{ title: `Viewpoint ${order}`, question: `Question ${order}?`, own: false }],
    state: "ARGUED", root_node_id: `node-root-${order}`, outcome: outcomeFixture(), ...extra
  });
}

/** A path debate of `paths` argued paths (or the paths given), chosen from a menu at the default width. */
export function branchesFixture(paths: number | readonly AnswerBranch[], extra: Partial<AnswerBranches> = {}): AnswerBranches {
  const list = typeof paths === "number" ? Array.from({ length: paths }, (_, index) => branchFixture(index + 1)) : paths;
  return AnswerBranchesSchema.parse({ source: "MENU", width: Math.max(5, list.length), paths: list, more: [], also_raised: [],
    main_trust: "SURE_FOR_CASE", carry_on_to_report: false, ...extra });
}
