/**
 * D5 (spec 2026-10-15 §5.6 "Wording N"): the named-forms variant of the map's four answer-writing instructions, for the
 * practice comparison ONLY (Ruling PF-R3-2.3). Never imported by packages/ or apps/, never sealed: each call it frames
 * carries `<sealed id>.wording-n`. The other engine-2 contracts (angles, merge, gap, the answer check) are the sealed ones,
 * so both arms are judged by the same check. OWNER WORDING — approve before the comparison runs.
 */
import {
  MAP_ENGINE_INSTRUCTIONS, mapAnswerCheckCodes, mapEngineContractNameOf, type MapAnswerCheckResult, type MapCallOutcome, type MapCallRequest,
  type MapCaller, type MapEngineContractName, type MapRunInput
} from "@debateai/map";
import {
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import type { OpeningsArmLine } from "./practice-openings-log.js";
import type { OpeningsArm } from "./practice-openings-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import { PracticeRefusal } from "./practice-settings.js";
import { practiceAnswerCheckBlock, type PracticeAnswerCheckBlock } from "./practice-shape.js";

export const MAP_WORDING_N_ID_SUFFIX = ".wording-n" as const;
const LIST_AT = "a real trade-off they can weigh. You may also name";
const LIST_N = "a real trade-off they can weigh; but it may not say only that it depends or that the question is still open, "
  + "and it never just restates the answer as a taste, such as choosing A if you prefer A. You may also name";
const CHOOSE_AT = "a real trade-off they can weigh. When a candidate";
const CHOOSE_N = "a real trade-off they can weigh; but it may not say only that it depends, that it is undetermined or that the "
  + "question is still open, and it never just restates the answer as a taste, such as choosing A if you prefer A. When a candidate";

/** The shipped text with `at` replaced once; a moved anchor (Task 3 reworded) is refused, never guessed. */
function once(text: string, at: string, next: string): string {
  const first = text.indexOf(at);
  if (first < 0 || text.indexOf(at, first + 1) >= 0) throw new PracticeRefusal("PRACTICE_WORDING_N_ANCHOR_MOVED", at);
  return text.replace(at, next);
}

export const MAP_WORDING_N_INSTRUCTIONS: Readonly<Partial<Record<MapEngineContractName, string>>> = Object.freeze({
  listAngle: once(MAP_ENGINE_INSTRUCTIONS.listAngle, LIST_AT, LIST_N),
  listOpen: once(MAP_ENGINE_INSTRUCTIONS.listOpen, LIST_AT, LIST_N),
  listSnowball: once(MAP_ENGINE_INSTRUCTIONS.listSnowball, LIST_AT, LIST_N),
  choose: once(MAP_ENGINE_INSTRUCTIONS.choose, CHOOSE_AT, CHOOSE_N)
});

/**
 * Wraps a map caller: the four writing contracts are sent in wording N (the instruction swapped, every sentence the spec
 * appends after it — length, language — kept, the id suffixed); every other call passes through untouched, the answer
 * check's contract and form included.
 */
export function practiceWordingNCaller(inner: MapCaller): MapCaller {
  return Object.freeze({ call: <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
    const name = mapEngineContractNameOf(request.spec.contract.contractId);
    const text = name === null ? undefined : MAP_WORDING_N_INSTRUCTIONS[name];
    if (name === null || text === undefined) return inner.call(request);
    const shipped = MAP_ENGINE_INSTRUCTIONS[name];
    const { instruction, contractId } = request.spec.contract;
    if (!instruction.startsWith(`${shipped} `)) throw new PracticeRefusal("PRACTICE_WORDING_N_BASE_CHANGED", name);
    const contract = Object.freeze({ ...request.spec.contract, contractId: `${contractId}${MAP_WORDING_N_ID_SUFFIX}`,
      instruction: `${text}${instruction.slice(shipped.length)}` });
    return inner.call({ ...request, spec: { ...request.spec, contract } });
  } });
}

/** The engine-2 arms' map input members (the code's start rows: the free plan's standard length, the engine's candidates). */
export function practiceWordingMapExtras(arm: OpeningsArm): Partial<Pick<MapRunInput, "length" | "engine">> {
  if (arm !== "C2" && arm !== "C2N") return Object.freeze({});
  const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
  const settings = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening: true });
  return Object.freeze({ length: Object.freeze({ targets: guidance.map, charactersPerWord: guidance.charactersPerWord }),
    engine: Object.freeze({ answerCheckCandidates: settings.answerCheck.candidates }) });
}

/**
 * One question under one wording: the debated answers word for word (for the owner's reading; passed through the
 * report's own redaction, `reportableReplyText`, as every reply text in a report is), the codes, D1's counts.
 */
export type PracticeWordingRow = Readonly<{ arm: "C2" | "C2N"; questionId: string; answers: readonly string[]; codes: readonly string[] | null;
  answerCheck: PracticeAnswerCheckBlock | null;
  /** The seats the arm started with (fix round 1): C2 runs first, so a seat that went busy in C2 shows as fewer in C2N. */
  seats: number | null;
  /**
   * Ruling R3-T17a.4 (N2): the code of the practice refusal the arm ended on (no answers, no codes), so a refused arm keeps
   * its row and never drops out of the comparison; null for an arm that ran.
   */
  refused: string | null }>;

type WordingAnswer = Readonly<{ statement: string; assumptions?: readonly unknown[] }>;

/** The engine-2 arms' lines only, in log order. Counts read the checker's and the chooser's verdicts; code judges none (G1). */
export function practiceWordingRows(lines: readonly OpeningsArmLine[]): readonly PracticeWordingRow[] {
  return Object.freeze(lines.flatMap((line): PracticeWordingRow[] => {
    if (line.arm !== "C2" && line.arm !== "C2N") return [];
    const refusal = line.notes.find((note) => note.note === "PRACTICE_REFUSED");
    if (line.map === null) {
      return refusal === undefined ? [] : [Object.freeze({ arm: line.arm, questionId: line.questionId, answers: Object.freeze([]), codes: null,
        answerCheck: null, seats: line.seats ?? null, refused: refusal.detail })];
    }
    const answers = ((line.map.choice?.answers ?? []) as readonly WordingAnswer[]);
    const check = (line.map as Readonly<{ answerCheck?: MapAnswerCheckResult }>).answerCheck;
    const codes = check === undefined ? null : mapAnswerCheckCodes(check);
    const marks: Record<string, number> = {};
    for (const mark of line.marks) marks[mark.mark] = (marks[mark.mark] ?? 0) + 1;
    return [Object.freeze({ arm: line.arm, questionId: line.questionId, answers: Object.freeze(answers.map((answer) => reportableReplyText(answer.statement))), codes,
      answerCheck: practiceAnswerCheckBlock(codes, marks, { premiseExempt: check === undefined ? null : check.premiseExempt?.length ?? 0,
        assumptionsPerAnswer: answers.map((answer) => answer.assumptions?.length ?? 0) }), seats: line.seats ?? null, refused: null })];
  }));
}

/**
 * Per wording, summed over its questions (D1's counts; the owner marks the hedged or circular answers by reading them).
 * `questions` counts the questions the arm ran, `refused` those it was refused on (N2), `seats` each question's seats (N4).
 */
export type PracticeWordingTotals = Readonly<{ arm: "C2" | "C2N"; questions: number; refused: number; seats: readonly number[]; checked: number;
  rejected: number; notAnAnswer: number; addedFact: number; noCost: number; premiseExempt: number; assumptions: readonly number[] }>;
export function practiceWordingTotals(rows: readonly PracticeWordingRow[]): readonly PracticeWordingTotals[] {
  return Object.freeze((["C2", "C2N"] as const).flatMap((arm): PracticeWordingTotals[] => {
    const mine = rows.filter((row) => row.arm === arm);
    if (mine.length === 0) return [];
    const sum = (pick: (block: PracticeAnswerCheckBlock) => number) => mine.reduce((total, row) => total + (row.answerCheck === null ? 0 : pick(row.answerCheck)), 0);
    const refused = mine.filter((row) => row.refused !== null).length;
    return [Object.freeze({ arm, questions: mine.length - refused, refused,
      seats: Object.freeze(mine.flatMap((row) => (row.seats === null ? [] : [row.seats]))), checked: sum((block) => block.checked), rejected: sum((block) => block.rejected),
      notAnAnswer: sum((block) => block.notAnAnswer), addedFact: sum((block) => block.addedFact), noCost: sum((block) => block.noCost),
      premiseExempt: sum((block) => block.premiseExempt ?? 0),
      assumptions: Object.freeze(mine.flatMap((row) => row.answerCheck?.assumptionsPerAnswer ?? [])) })];
  }));
}
