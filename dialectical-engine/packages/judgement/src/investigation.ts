/**
 * ENGINE 2: INVESTIGATING A "CANNOT ASSESS" POINT (spec 2026-10-15 §4.2b, E13; INTERFACE §8).
 *
 * The owner's reading of "cannot assess": the point is worth investigating. One AI, of a maker that is neither the
 * point's author's nor its reviewer's, names the missing piece, tries to supply it, says whether that is established
 * knowledge or an assumption, and says whether the point then holds, fails or still cannot be decided. Its outcome is
 * read as the review the point lacked: holds = agree (links at full weight), fails = dispute (the dispute weight on its
 * score, its links still at the cannot-assess weight), dead end = still "cannot assess" (pre-flight PF-R2a8.11; the
 * controller-corrected weight, spec §4.2b/§17: holds > dead end > fails).
 *
 * Here: the sealed contract (`verdict.investigate.v1`, sealed by `engineContractHash`, never by the judge's seal), the
 * material fields, the code-owned answer form and its checks, and the pure choices code makes (which points, in what
 * order, which AI). The call itself is `Judge.investigatePoint` (index.ts), beside the review it stands in for.
 */
import { z } from "zod";
import { LENGTH_SENTENCE_WRITING, lengthGuidanceField, type LengthGuide, type PointInvestigationMaterial } from "@debateai/kernel";
import type { FramedMaterialField, PromptContract } from "@debateai/providers";
import type { EngineReviewStatus } from "./honest-score.js";
import type { StructuredReadingOptions } from "./s04.js";
// A10 declared the two stored lists (its table CHECKs read them); this file re-uses them and never redeclares them.
import { POINT_INVESTIGATION_BASES, type PointInvestigationResult } from "./engine-repository.js";

export const POINT_INVESTIGATION_CONTRACT_ID = "verdict.investigate.v1" as const;

export const POINT_INVESTIGATION_OUTCOMES = Object.freeze(["holds", "fails", "dead_end"] as const);
export type PointInvestigationOutcome = typeof POINT_INVESTIGATION_OUTCOMES[number];

// OWNER WORDING — approve before switch-on (pre-flight PF-R2a8.12: option 1 ships behind the off switch; a later
// rewording is a new contract id, verdict.investigate.v2, and a new engine seal).
/** OWNER-EDITABLE (spec §4.2b, option 1, verbatim; approve before switch-on). It names no material field. */
export const POINT_INVESTIGATION_INSTRUCTIONS =
  "A reviewer could not tell whether the point below holds. Find out exactly what is needed to decide it: name the "
  + "missing piece, such as a fact, a figure, a definition, a source or a step of reasoning. Then try to supply that "
  + "piece from what is generally known, and say whether it is established knowledge or your own assumption. Finally "
  + "say whether, with that piece, the point holds, fails, or still cannot be decided. If it still cannot be decided, "
  + "say what would decide it. Do not judge which answer to the question is right, and state nothing about the person "
  + "asking that the question does not give.";

const union = (values: readonly string[]): string => values.map((value) => `"${value}"`).join(" | ");

// OWNER WORDING — approve before switch-on (the answer form's closing sentence is new text the AI reads).
/** The required answer form. Code-owned (spec §4.2b): an instruction edit cannot drop it; built from the two lists. */
export const POINT_INVESTIGATION_ANSWER_FORM =
  "Return only one JSON object with exactly this schema and no additional keys:\n{\n"
  + "  \"missing\": non-empty string,\n"
  + "  \"found\": string,\n"
  + `  "basis": ${union(POINT_INVESTIGATION_BASES)},\n`
  + `  "outcome": ${union(POINT_INVESTIGATION_OUTCOMES)},\n`
  + "  \"reason\": non-empty string\n}\n"
  + "found is empty, and basis is \"none\", exactly when you could supply nothing.";

/**
 * The sealed contract. Engine 2 always runs with the length row (engine INTERFACE §0), so the one lengthed variant is
 * the only variant: today's length sentence follows the instruction, as in every LG-C lengthed contract.
 */
export const POINT_INVESTIGATION_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: POINT_INVESTIGATION_CONTRACT_ID,
  instruction: `${POINT_INVESTIGATION_INSTRUCTIONS} ${LENGTH_SENTENCE_WRITING}`,
  answerForm: POINT_INVESTIGATION_ANSWER_FORM
});

/** The fields the call may carry, in order (`question_language` follows LAST, added by `withQuestionLanguageField`). */
export const POINT_INVESTIGATION_MATERIAL_FIELDS = Object.freeze([
  "question", "answer", "point", "target_point", "relation", "rests_on", "reviewer_reason", "length"
] as const);

/** The relation, as one code word the AI reads in the `relation` field. */
const RELATION_WORDS = Object.freeze({ ATTACKS: "attacks", SUPPORTS: "supports" } as const);

/** The material, framed field by field; `rests_on` only when the map named it (R3); the length guide last. */
export function pointInvestigationMaterialFields(material: PointInvestigationMaterial, length: LengthGuide): readonly FramedMaterialField[] {
  return Object.freeze([
    Object.freeze({ name: "question", content: material.question }),
    Object.freeze({ name: "answer", content: material.answer }),
    Object.freeze({ name: "point", content: material.point }),
    Object.freeze({ name: "target_point", content: material.targetPoint }),
    Object.freeze({ name: "relation", content: RELATION_WORDS[material.targetRelation] }),
    ...(material.restsOn === null ? [] : [Object.freeze({ name: "rests_on", content: material.restsOn })]),
    Object.freeze({ name: "reviewer_reason", content: material.reviewerReason }),
    lengthGuidanceField(length.words, length.languageCode, length.charactersPerWord)
  ]);
}

/**
 * Every string comes back trimmed (pre-flight PF-R2a8.6, Ruling PF-R2a6.1): what A14 stores is what this reader read, so a
 * whitespace-only `found` with basis "none" is "" here and A10's write check accepts it.
 */
export const pointInvestigationReplySchema = z.object({
  missing: z.string().trim().min(1),
  found: z.string().trim(),
  basis: z.enum(POINT_INVESTIGATION_BASES),
  outcome: z.enum(POINT_INVESTIGATION_OUTCOMES),
  reason: z.string().trim().min(1)
}).strict();
export type PointInvestigationReply = z.infer<typeof pointInvestigationReplySchema>;

export const POINT_INVESTIGATION_BASIS_MISMATCH = "POINT_INVESTIGATION_BASIS_MISMATCH" as const;

/**
 * The content check: `found` is empty exactly when `basis` is "none". Issues in the shape the repair locator reads. The
 * schema already trims `found`; the `trim()` here keeps the rule A10's write check uses for a value handed in unparsed.
 */
export function pointInvestigationContentIssues(reply: PointInvestigationReply):
  readonly Readonly<{ code: typeof POINT_INVESTIGATION_BASIS_MISMATCH; path: readonly string[]; message: typeof POINT_INVESTIGATION_BASIS_MISMATCH }>[] {
  const nothingFound = reply.found.trim() === "";
  return nothingFound === (reply.basis === "none") ? Object.freeze([]) : Object.freeze([Object.freeze({
    code: POINT_INVESTIGATION_BASIS_MISMATCH, path: Object.freeze(["basis"]), message: POINT_INVESTIGATION_BASIS_MISMATCH
  })]);
}

/** The judge's tolerant reading (unasked root keys dropped) with LG-A's schema-guided fixer on (L31). */
export const POINT_INVESTIGATION_READING: StructuredReadingOptions = Object.freeze({ unaskedKeys: true, fixer: Object.freeze({}) });
/** The prose a reply must write in the question's language. */
export const POINT_INVESTIGATION_PROSE = Object.freeze(["missing", "found", "reason"] as const);

const RESULT_OF_OUTCOME: Readonly<Record<PointInvestigationOutcome, PointInvestigationResult>> =
  Object.freeze({ holds: "HOLDS", fails: "FAILS", dead_end: "DEAD_END" });
const STATUS_OF_OUTCOME: Readonly<Record<PointInvestigationOutcome, EngineReviewStatus>> =
  Object.freeze({ holds: "AGREE", fails: "DISPUTE", dead_end: "CANNOT_ASSESS" });

export function pointInvestigationResultOf(outcome: PointInvestigationOutcome): PointInvestigationResult {
  return RESULT_OF_OUTCOME[outcome];
}

/**
 * holds -> "AGREE"; fails -> "DISPUTE"; dead_end -> "CANNOT_ASSESS" (the review the point lacked). A FAILS point keeps
 * `cannotAssessReview` in its facts, so A6 keeps its links at the cannot-assess weight and puts the dispute weight on its
 * score (pre-flight PF-R2a8.11).
 */
export function pointInvestigationStatus(outcome: PointInvestigationOutcome): EngineReviewStatus {
  return STATUS_OF_OUTCOME[outcome];
}

export type PointInvestigationCandidate = Readonly<{
  nodeId: string;
  authorMaker: string;
  reviewerMaker: string;
  /** 1 = attacks or supports an answer's root; 2 = one link further; ... */
  distanceToAnswer: number;
  honestScore: number;
  /** The order the reviews were recorded in. */
  reviewOrder: number;
}>;

const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Fixed order, no judgment: distanceToAnswer asc, then honestScore desc, then reviewOrder asc (then node id). */
export function orderPointInvestigations(candidates: readonly PointInvestigationCandidate[]): readonly PointInvestigationCandidate[] {
  for (const entry of candidates) {
    if (!Number.isSafeInteger(entry.distanceToAnswer) || entry.distanceToAnswer < 1
      || !Number.isFinite(entry.honestScore) || !Number.isSafeInteger(entry.reviewOrder)) {
      throw new TypeError("POINT_INVESTIGATION_CANDIDATE_INVALID");
    }
  }
  return Object.freeze([...candidates].sort((left, right) => left.distanceToAnswer - right.distanceToAnswer
    || right.honestScore - left.honestScore || left.reviewOrder - right.reviewOrder || byText(left.nodeId, right.nodeId)));
}

/** A seat as the runner's `SeatIdentity` (apps/runner/src/run-seats.ts:118), structurally. */
export type PointInvestigationSeat = Readonly<{ maker: string; providerRef: string }>;

/**
 * The investigator: going round `seats` (book order) from `rotationOffset` (modulo their count), the first seat whose
 * maker is neither the author's nor the reviewer's and argued no answer; else the first such seat of an arguing maker;
 * null when none (INVESTIGATION_SKIPPED). Returns the very seat object it was given.
 */
export function pickPointInvestigator<T extends PointInvestigationSeat>(input: Readonly<{
  seats: readonly T[]; authorMaker: string; reviewerMaker: string; arguingMakers: ReadonlySet<string>; rotationOffset: number;
}>): T | null {
  const { seats } = input;
  if (seats.length === 0) return null;
  if (!Number.isSafeInteger(input.rotationOffset) || input.rotationOffset < 0) throw new TypeError("POINT_INVESTIGATION_ROTATION_INVALID");
  const start = input.rotationOffset % seats.length;
  const rotated = [...seats.slice(start), ...seats.slice(0, start)];
  const eligible = rotated.filter((seat) => seat.maker !== input.authorMaker && seat.maker !== input.reviewerMaker);
  return eligible.find((seat) => !input.arguingMakers.has(seat.maker)) ?? eligible[0] ?? null;
}
