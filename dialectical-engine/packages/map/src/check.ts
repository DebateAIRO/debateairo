import { mapFillPointsRaised } from "./choose.js";
import { mapNamesInternalWord } from "./internal-words.js";
import { mapRankMergedAnswers } from "./items.js";
import type { MapCheckReply } from "./replies.js";
import { mapNormaliseText } from "./text.js";
import {
  MAP_ENGINE_LIMITS,
  MAP_LIMITS,
  type MapAnswerCheckOutcome,
  type MapAnswerCheckReading,
  type MapAnswerCheckResult,
  type MapCheckCandidate,
  type MapChoice,
  type MapChosenAnswer,
  type MapKeyPoint,
  type MapMarkRecord,
  type MapMergedAnswer,
  type MapSeat
} from "./types.js";

/**
 * ENGINE REDESIGN R3 — THE ANSWER CHECK (spec 2026-10-15 §5.2 item 5, §5.5, §5.6 as edited 2026-10-16; INTERFACE §10.4
 * with deviation 12). Pure: no clock, no I/O.
 * Plain words: after choose, one AI of another maker reads each chosen answer and up to three candidates, and says for
 * each whether it answers the question as asked, whether it states as the asker's fact something the question does not
 * give, and (unless the answer challenges the question's premise) whether anything that would go wrong if it were
 * followed with no regard for the other answers' concerns can be named (owner decision D4(b)). Code only acts on what
 * the checker said: a failing chosen answer is replaced by the first passing candidate, else dropped while at least two
 * answers remain, else kept and marked. It runs once. Code never judges an answer, nor any of the three tests, itself.
 */

/**
 * One stored code (`core.map_answer_check.answer_check`; migration 0122 spells the same pattern in its CHECK, at most 8
 * codes per run). The outcome names each failed test in the fixed order NOT_AN_ANSWER, ADDED_FACT, NO_COST, so the code
 * is lossless; INTERFACE §10.4's BOTH is retired (FINAL Ruling D4(b) encoding, deviation 12) (pre-flight PF-R33.1).
 */
export const MAP_ANSWER_CHECK_CODE = /^(a[1-4]|c[1-4]):(PASSED|UNCHECKED|NOT_AN_ANSWER(\+ADDED_FACT)?(\+NO_COST)?|ADDED_FACT(\+NO_COST)?|NO_COST)(>(c[1-4]|DROPPED|KEPT))?$/u;

const candidateId = (index: number): string => `c${String(index + 1)}`;

/**
 * The candidates the check also reads (spec §5.2 item 5): choose's reserves in its order, then the most-raised unchosen
 * merged answers; never a statement equal (normalised) to a chosen answer or to an earlier candidate, never a merged
 * answer the chooser reused (`keptMergedAnswerIds`, pre-flight PF-R33.8), never one with no words or naming an internal word. At most `max` (the receipt's `answerCheck.candidates`) and at most four (`c1..c4`).
 */
export function mapCheckCandidatesOf(input: Readonly<{ choice: MapChoice; mergedAnswers: readonly MapMergedAnswer[]; max: number;
  internalNames: readonly string[];
  /**
   * Merged answer ids the chooser's reply reused (it kept them, maybe reworded); empty or absent under the fallback. Such
   * an answer is never a candidate: its words may differ from the chosen statement, so the text guard alone would let it
   * come back and the debate argue two wordings of one answer (Review Focus 2; pre-flight PF-R33.8).
   */
  keptMergedAnswerIds?: ReadonlySet<string> }>): readonly MapCheckCandidate[] {
  const limit = Math.max(0, Math.min(Math.trunc(input.max), MAP_ENGINE_LIMITS.candidatesMax));
  const taken = new Set(input.choice.answers.map((answer) => mapNormaliseText(answer.statement)).filter((key) => key !== ""));
  const found: Omit<MapCheckCandidate, "checkId">[] = [];
  const add = (candidate: Omit<MapCheckCandidate, "checkId">): void => {
    const key = mapNormaliseText(candidate.statement);
    if (found.length >= limit || key === "" || taken.has(key) || mapNamesInternalWord(candidate.statement, input.internalNames)) return;
    taken.add(key);
    found.push(candidate);
  };
  for (const reserve of input.choice.reserves ?? []) {
    add({ statement: reserve.statement, source: "RESERVE", forKeyPointIds: reserve.forKeyPointIds, againstKeyPointIds: reserve.againstKeyPointIds,
      assumptions: reserve.assumptions });
  }
  for (const answer of mapRankMergedAnswers(input.mergedAnswers)) {
    if (input.keptMergedAnswerIds?.has(answer.answerId) === true) continue;
    add({ statement: answer.answer, source: "MERGED", forKeyPointIds: [], againstKeyPointIds: [], assumptions: [] });
  }
  return Object.freeze(found.map((candidate, index) => Object.freeze({ checkId: candidateId(index), ...candidate })));
}

/** What the checker reads: each chosen answer under its own id (a1..a4), then each candidate (c1..c4). */
export function mapCheckEntriesOf(choice: MapChoice, candidates: readonly MapCheckCandidate[]): readonly Readonly<{ checkId: string; answer: string }>[] {
  return Object.freeze([
    ...choice.answers.map((answer) => Object.freeze({ checkId: answer.answerId, answer: answer.statement })),
    ...candidates.map((candidate) => Object.freeze({ checkId: candidate.checkId, answer: candidate.statement }))
  ]);
}

/**
 * Every combination of the three tests, failed tests named in the fixed order NOT_AN_ANSWER, ADDED_FACT, NO_COST. A lookup,
 * indexed by which tests failed: 1 = not an answer, 2 = adds an unstated fact, 4 = no cost can be named.
 */
const MAP_CHECK_OUTCOME_BY_FAILURES = Object.freeze([
  "PASSED", "NOT_AN_ANSWER", "ADDED_FACT", "NOT_AN_ANSWER+ADDED_FACT",
  "NO_COST", "NOT_AN_ANSWER+NO_COST", "ADDED_FACT+NO_COST", "NOT_AN_ANSWER+ADDED_FACT+NO_COST"
] as const satisfies readonly Exclude<MapAnswerCheckOutcome, "UNCHECKED">[]);

/**
 * The checker's three answers as one outcome (spec §5.2 item 5; owner decision D4(b); FINAL Ruling D4(b) encoding)
 * (pre-flight PF-R33.1). The third test ("if it were followed with no regard for the other answers' concerns, what would
 * go wrong?") fails only on `false`; `null` is the checker saying the answer challenges the question's premise, which the
 * third test exempts. Code never decides any of the three.
 */
export function mapCheckOutcomeOf(answersQuestion: boolean, addsUnstatedFact: boolean, costCanBeNamed: boolean | null):
  Exclude<MapAnswerCheckOutcome, "UNCHECKED"> {
  const failures = (answersQuestion ? 0 : 1) + (addsUnstatedFact ? 2 : 0) + (costCanBeNamed === false ? 4 : 0);
  return MAP_CHECK_OUTCOME_BY_FAILURES[failures]!;
}

/**
 * D4(b) / D1: the ids the checker exempted from the third test because the answer challenges the question's premise
 * (its own `cost_can_be_named: null`), in reply order. The stored code cannot show the exemption (it is PASSED when the
 * other tests pass), so `mapCheckReadingOf` puts these ids in the reading's `premiseExempt`; Task 11 stores them beside
 * the codes (0122's `premise_exempt`), where the practice report counts them (pre-flight PF-R33.1; pre-flight consistency).
 */
export function mapCheckPremiseExemptIds(reply: MapCheckReply): readonly string[] {
  return Object.freeze(reply.checks.filter((entry) => entry.cost_can_be_named === null).map((entry) => entry.check_id));
}

/** The accepted check reply as a reading (its content check already proved one entry per id shown). */
export function mapCheckReadingOf(reply: MapCheckReply, checker: MapSeat): MapAnswerCheckReading {
  const outcomes: Record<string, Exclude<MapAnswerCheckOutcome, "UNCHECKED">> = {};
  const reasons: Record<string, string> = {};
  for (const entry of reply.checks) {
    outcomes[entry.check_id] = mapCheckOutcomeOf(entry.answers_question, entry.adds_unstated_fact, entry.cost_can_be_named);
    if (entry.reason !== null) reasons[entry.check_id] = entry.reason.trim();
  }
  // (pre-flight consistency) Task 1's REQUIRED premiseExempt: the checker's own nulls, in reply order.
  return Object.freeze({ checker, outcomes: Object.freeze(outcomes), reasons: Object.freeze(reasons), premiseExempt: mapCheckPremiseExemptIds(reply) });
}

type Replacement = MapAnswerCheckResult["replacements"][number];

/**
 * Applies one reading (spec §5.5). Null reading (no seat, a stop, the call failed after LG-A's repairs): the answers stand
 * unchecked, one MAP_CHECK_UNAVAILABLE. Else, for each chosen answer the checker failed, in answer order: the first passing
 * candidate not yet used REPLACES it (same id; a reserve brings its sides and assumptions, a merged answer none, and gets
 * unsided points raised); else it is DROPPED when at least two answers stay; else KEPT and marked. A rival naming a dropped
 * answer moves to the next answer. "Also raised" is recomputed (points freed by a replaced answer come back).
 */
export function mapApplyAnswerCheck(input: Readonly<{
  choice: MapChoice;
  reading: MapAnswerCheckReading | null;
  candidates: readonly MapCheckCandidate[];
  keyPoints: readonly MapKeyPoint[];
  pointsPerAnswer: number;
  internalNames: readonly string[];
  unavailableDetail: string;
}>): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[]; answerCheck: MapAnswerCheckResult }> {
  const shown = Object.freeze(input.candidates.map((candidate) =>
    Object.freeze({ checkId: candidate.checkId, statement: candidate.statement, source: candidate.source })));
  const ids = [...input.choice.answers.map((answer) => answer.answerId), ...input.candidates.map((candidate) => candidate.checkId)];
  const reading = input.reading;
  if (reading === null) {
    return Object.freeze({
      choice: input.choice,
      marks: Object.freeze([Object.freeze({ mark: "MAP_CHECK_UNAVAILABLE" as const, step: "CHECK" as const, detail: input.unavailableDetail })]),
      answerCheck: Object.freeze({ checker: null, outcomes: Object.freeze(Object.fromEntries(ids.map((id) => [id, "UNCHECKED" as const]))),
        reasons: Object.freeze({}), premiseExempt: Object.freeze([]), candidates: shown, replacements: Object.freeze([]) })
    });
  }
  const outcome = (id: string): MapAnswerCheckOutcome => reading.outcomes[id] ?? "UNCHECKED";
  const known = new Set(input.keyPoints.map((keyPoint) => keyPoint.keyPointId));
  const keptKnown = (list: readonly string[]): readonly string[] => Object.freeze(list.filter((id) => known.has(id)));
  const used = new Set<string>();
  const marks: MapMarkRecord[] = [];
  const replacements: Replacement[] = [];
  let answers: MapChosenAnswer[] = [...input.choice.answers];
  for (const original of input.choice.answers) {
    // Only what the checker failed is acted on: an id it never read (impossible after its content check, but this function
    // is exported and pure) stands, unchecked; code never fails an answer itself (G1) (pre-flight PF-R33.7).
    const said = outcome(original.answerId);
    if (said === "PASSED" || said === "UNCHECKED") continue;
    const candidate = input.candidates.find((entry) => outcome(entry.checkId) === "PASSED" && !used.has(entry.checkId));
    if (candidate !== undefined) {
      used.add(candidate.checkId);
      answers = answers.map((answer) => (answer.answerId !== original.answerId ? answer : Object.freeze({
        answerId: original.answerId, statement: candidate.statement, forKeyPointIds: keptKnown(candidate.forKeyPointIds),
        againstKeyPointIds: keptKnown(candidate.againstKeyPointIds), strongestRival: original.strongestRival, filled: false,
        assumptions: Object.freeze([...candidate.assumptions]), pointsRaised: Object.freeze([]) })));
      replacements.push(Object.freeze({ answerId: original.answerId, statement: original.statement, replacedBy: candidate.checkId, action: "REPLACED" }));
      marks.push(Object.freeze({ mark: "MAP_ANSWER_REPLACED", step: "CHECK", detail: `${original.answerId}>${candidate.checkId}` }));
    } else if (answers.length - 1 >= MAP_LIMITS.chooseDistinctAnswersMin) {
      answers = answers.filter((answer) => answer.answerId !== original.answerId);
      replacements.push(Object.freeze({ answerId: original.answerId, statement: original.statement, replacedBy: null, action: "DROPPED" }));
      marks.push(Object.freeze({ mark: "MAP_ANSWER_DROPPED", step: "CHECK", detail: original.answerId }));
    } else {
      replacements.push(Object.freeze({ answerId: original.answerId, statement: original.statement, replacedBy: null, action: "KEPT_UNCHECKED" }));
      marks.push(Object.freeze({ mark: "MAP_ANSWER_KEPT_UNCHECKED", step: "CHECK", detail: original.answerId }));
    }
  }
  const remaining = answers.map((answer) => answer.answerId);
  answers = answers.map((answer, index) => (remaining.includes(answer.strongestRival) && answer.strongestRival !== answer.answerId ? answer
    : Object.freeze({ ...answer, strongestRival: remaining[(index + 1) % remaining.length]! })));
  const choice = mapFillPointsRaised({ choice: Object.freeze({ ...input.choice, answers: Object.freeze(answers) }), keyPoints: input.keyPoints,
    pointsPerAnswer: input.pointsPerAnswer, internalNames: input.internalNames });
  return Object.freeze({
    choice,
    marks: Object.freeze(marks),
    answerCheck: Object.freeze({ checker: reading.checker, outcomes: Object.freeze(Object.fromEntries(ids.map((id) => [id, outcome(id)]))),
      reasons: reading.reasons, premiseExempt: Object.freeze([...reading.premiseExempt]), candidates: shown, replacements: Object.freeze(replacements) })
  });
}

/** The readable codes (migration 0122): chosen answers a1..a4 in number order, then candidates c1..c4; `>` what became of a failed one. */
export function mapAnswerCheckCodes(result: MapAnswerCheckResult): readonly string[] {
  const after = new Map(result.replacements.map((entry) => [entry.answerId,
    entry.action === "REPLACED" ? `>${entry.replacedBy!}` : entry.action === "DROPPED" ? ">DROPPED" : ">KEPT"] as const));
  const order = (id: string): number => (id.startsWith("a") ? 0 : 10) + Number(id.slice(1));
  return Object.freeze(Object.keys(result.outcomes).sort((left, right) => order(left) - order(right))
    .map((id) => `${id}:${result.outcomes[id]!}${after.get(id) ?? ""}`));
}

/** Deviation 8: the words the check failed (replaced or dropped answers, failed candidates), never listed as "also raised". */
export function mapCheckFailedStatements(result: MapAnswerCheckResult | undefined): readonly string[] {
  if (result === undefined) return Object.freeze([]);
  const failed = (id: string): boolean => { const value = result.outcomes[id]; return value !== undefined && value !== "PASSED" && value !== "UNCHECKED"; };
  return Object.freeze([
    ...result.replacements.filter((entry) => entry.action !== "KEPT_UNCHECKED").map((entry) => entry.statement),
    ...result.candidates.filter((candidate) => failed(candidate.checkId)).map((candidate) => candidate.statement)
  ]);
}
