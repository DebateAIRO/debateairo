import { createHash } from "node:crypto";
import { argumentLanguageDirective } from "@debateai/kernel";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { MAP_LIMITS } from "./types.js";

/**
 * The map's prompt contracts (spec 2026-10-12 §4). Each step's INSTRUCTION is the owners' editable text; its ANSWER
 * FORM and the safety frame around it are code's. An edit of the text is a new fingerprint, so in Phase 2 it can only
 * ship as a new register version. The safety frame already says the material is evidence, never orders.
 */
export const MAP_CONTRACT_NAMES = Object.freeze(["angles", "listAngle", "listOpen", "listSnowball", "merge", "gap", "choose"] as const);
export type MapContractName = typeof MAP_CONTRACT_NAMES[number];
export type MapInstructionTexts = Readonly<Record<MapContractName, string>>;
export type MapPromptContractSet = Readonly<Record<MapContractName, PromptContract>>;

export const MAP_CONTRACT_IDS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: "map.angles.v1",
  listAngle: "map.list.angle.v1",
  listOpen: "map.list.open.v1",
  listSnowball: "map.list.snowball.v1",
  merge: "map.merge.v1",
  gap: "map.gap.v1",
  choose: "map.choose.v1"
});

const LEANS_SENTENCE = "Mark how each point leans: for_some_answer when it supports some answer to the question, "
  + "against_some_answer when it counts against some answer, context when it is background that any answer has to take into account.";
const POINT_SENTENCE = "A point is one short claim and one short line on why it matters for the answer.";

export const MAP_DEFAULT_INSTRUCTIONS: MapInstructionTexts = Object.freeze({
  angles: [
    "Plan the angles from which the question will be examined before it is debated.",
    "An angle is one way of looking at the question that is likely to bring up points the other angles miss.",
    "Always include exactly one angle of each of three fixed kinds: OPPOSITE_CASE, the strongest case for an answer different",
    "from the one most people would give first; ASKER_WORRY, what the person asking is probably worried about or trying to decide;",
    "PRACTICAL, what the person should actually do and what it would take.",
    "Then add one to four angles of kind SPECIFIC that fit this particular question, for example a group of people affected,",
    "a time horizon, a cost, a risk or a body of evidence.",
    "Give each angle a short label and one sentence saying what to look at. Do not answer the question."
  ].join(" "),
  listAngle: [
    "List the points that matter for answering the question, looking at it from the angle given in angle_label and angle_focus.",
    POINT_SENTENCE,
    "Prefer points that someone looking from another angle would probably miss.",
    LEANS_SENTENCE,
    "Then name one to three short answers to the question that you think are still open, without arguing for them.",
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listOpen: [
    "List the points that matter most for answering the question, from every side.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "Then name one to three short answers to the question that you think are still open, without arguing for them.",
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listSnowball: [
    "Other participants have already listed the points in points_so_far.",
    "Add only points that are genuinely new and matter for answering the question: a point that says the same as one already",
    "listed, in other words, is not new.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "Then name up to three short answers to the question that you think are still open, or none.",
    "If nothing new is left, return empty lists."
  ].join(" "),
  merge: [
    "Group the items that make the same point. Each entry in points and in candidate_answers has an item_id.",
    "Put points that say the same thing, even in different words, into one key point, and write one short claim that states it fairly.",
    "Keep points that say different things apart, even when they are related; when in doubt, keep them apart.",
    "In the same way, group the candidate answers that mean the same answer and write one short answer for each group.",
    "Use every item_id exactly once: point ids only in key_points, answer ids only in answers.",
    "Do not add points or answers, and do not judge which are right."
  ].join(" "),
  gap: [
    "Look for what is still missing before the question is debated. key_points and answers list what has been raised so far.",
    "Add only points that are genuinely new and matter for the answer, such as a consideration, a group of people, a risk,",
    "a cost or a piece of evidence nobody has mentioned. A point that restates one already listed is not new.",
    POINT_SENTENCE,
    LEANS_SENTENCE,
    "You may also note up to three framing challenges: ways the question itself may be framed too narrowly or rest on a doubtful assumption.",
    "If nothing important is missing, return empty lists."
  ].join(" "),
  choose: [
    "Choose what the debate will be about.",
    "From answers and key_points, name two to four answers to the question that are genuinely different from each other,",
    "so that each can be argued in full by a different participant; prefer answers that people actually hold, and never",
    "two wordings of the same answer.",
    "For each answer, list by key_point_id the key points that speak for it and those that speak against it, most important",
    "first, judging importance by one test: could this point change the answer?",
    "Each key point shows raised_by, how many different AI makers raised it independently, and angle_kind when it came from a fixed",
    "angle; a point raised by only one participant can still be the most important.",
    "For each answer, name in strongest_rival the answer_id of the other answer that competes with it most.",
    "Do not argue the answers here."
  ].join(" ")
});

const L = MAP_LIMITS;
const STRICT = "Return only one JSON object with exactly this schema and no additional keys:";
const ID_FORM = `short id of lowercase letters, digits and hyphens, at most ${String(L.idMaxChars)} characters`;
const POINT_FORM = `{ "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "why_it_matters": non-empty string of at most ${String(L.whyMaxChars)} characters, "leans": "for_some_answer" | "against_some_answer" | "context" }`;
const LIST_FORM = `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has ${String(L.listPointsMin)} to ${String(L.listPointsMax)} entries; candidate_answers has ${String(L.listAnswersMin)} to ${String(L.listAnswersMax)} entries.`;

export const MAP_ANSWER_FORMS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: `${STRICT}\n{ "angles": [{ "angle_id": ${ID_FORM}, "kind": "OPPOSITE_CASE" | "ASKER_WORRY" | "PRACTICAL" | "SPECIFIC", "label": non-empty string of at most ${String(L.angleLabelMaxChars)} characters, "focus": non-empty string of at most ${String(L.angleFocusMaxChars)} characters }, ...] }\nangles has ${String(L.anglesMin)} to ${String(L.anglesMax)} entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and ${String(L.specificAnglesMin)} to ${String(L.specificAnglesMax)} of SPECIFIC; every angle_id is different.`,
  listAngle: LIST_FORM,
  listOpen: LIST_FORM,
  listSnowball: `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has 0 to ${String(L.snowballPointsMax)} entries; candidate_answers has 0 to ${String(L.snowballAnswersMax)} entries.`,
  merge: `${STRICT}\n{ "key_points": [{ "key_point_id": ${ID_FORM}, "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...], "answers": [{ "answer_id": ${ID_FORM}, "answer": non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...] }\nEvery member_item_ids list has at least one item_id; every item_id appears in exactly one list; every key_point_id and answer_id is different.`,
  gap: `${STRICT}\n{ "new_points": [${POINT_FORM}, ...], "framing_challenges": [non-empty string of at most ${String(L.claimMaxChars)} characters, ...] }\nnew_points has 0 to ${String(L.gapPointsMax)} entries; framing_challenges has 0 to ${String(L.framingChallengesMax)} entries.`,
  choose: `${STRICT}\n{ "answers": [{ "answer_id": ${ID_FORM}, "statement": non-empty string of at most ${String(L.claimMaxChars)} characters, "for": [key_point_id, ...], "against": [key_point_id, ...], "strongest_rival": answer_id of another answer, or null }, ...] }\nanswers has ${String(L.chooseAnswersMin)} to ${String(L.chooseAnswersMax)} entries (at least ${String(L.chooseDistinctAnswersMin)} when the question allows it); for and against each have at most ${String(L.choosePointsPerSideMax)} entries and use only key_point_id values given in key_points; every answer_id is different.`
});

/** The seven contracts from the given instruction texts (default: the shipped text). */
export function mapPromptContracts(texts: MapInstructionTexts = MAP_DEFAULT_INSTRUCTIONS): MapPromptContractSet {
  const entries = MAP_CONTRACT_NAMES.map((name) => [name, Object.freeze({
    contractId: MAP_CONTRACT_IDS[name],
    instruction: texts[name],
    answerForm: MAP_ANSWER_FORMS[name]
  })] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<MapContractName, PromptContract>);
}

/** The one fingerprint text over all seven (frame version included, via promptContractFingerprintText). */
export function mapPromptFingerprintText(contracts: MapPromptContractSet = mapPromptContracts()): string {
  return MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(contracts[name])).join("\n---\n");
}

/** The map's contract hash: what Phase 2 seals in the register, and what each map call carries as `contractHash`. */
export function mapPromptContractHash(contracts: MapPromptContractSet = mapPromptContracts()): string {
  return createHash("sha256").update(mapPromptFingerprintText(contracts)).digest("hex");
}

/** The contract a call sends: the instruction followed by the argument-language directive (as the story's contracts do). */
export function mapContractInLanguage(contract: PromptContract, languageName: string): PromptContract {
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${argumentLanguageDirective(languageName)}` });
}
