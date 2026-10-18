import { createHash } from "node:crypto";
import { LENGTH_SENTENCE_PARTS, languageDirectiveFor, type QuestionLanguage } from "@debateai/kernel";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { MAP_ENGINE_LIMITS, MAP_LIMITS } from "./types.js";

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
    "Do not argue the answers here.",
    "When an answer comes from answers, reuse its answer_id."
  ].join(" ")
});

const L = MAP_LIMITS;
const STRICT = "Return only one JSON object with exactly this schema and no additional keys:";
const ID_FORM = `short id of lowercase letters, digits and hyphens, at most ${String(L.idMaxChars)} characters`;
const POINT_FORM = `{ "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "why_it_matters": non-empty string of at most ${String(L.whyMaxChars)} characters, "leans": "for_some_answer" | "against_some_answer" | "context" }`;
const LIST_FORM = `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has ${String(L.listPointsMin)} to ${String(L.listPointsMax)} entries; candidate_answers has ${String(L.listAnswersMin)} to ${String(L.listAnswersMax)} entries.`;

export const MAP_ANSWER_FORMS: Readonly<Record<MapContractName, string>> = Object.freeze({
  // Question-language spec 2026-10-13 (L7): the planner names the question's language FIRST. The request sits in this
  // code-owned form, not in the owners' instruction text, so an owner edit cannot drop it (pre-flight PF-L48).
  angles: `${STRICT}\n{ "question_language": FIRST, the two-letter ISO 639-1 code of the language the question in question_line is written in, in lower case, "angles": [{ "angle_id": ${ID_FORM}, "kind": "OPPOSITE_CASE" | "ASKER_WORRY" | "PRACTICAL" | "SPECIFIC", "label": non-empty string of at most ${String(L.angleLabelMaxChars)} characters, "focus": non-empty string of at most ${String(L.angleFocusMaxChars)} characters }, ...] }\nangles has ${String(L.anglesMin)} to ${String(L.anglesMax)} entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and ${String(L.specificAnglesMin)} to ${String(L.specificAnglesMax)} of SPECIFIC; every angle_id is different.`,
  listAngle: LIST_FORM,
  listOpen: LIST_FORM,
  listSnowball: `${STRICT}\n{ "points": [${POINT_FORM}, ...], "candidate_answers": [non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, ...] }\npoints has 0 to ${String(L.snowballPointsMax)} entries; candidate_answers has 0 to ${String(L.snowballAnswersMax)} entries.`,
  merge: `${STRICT}\n{ "key_points": [{ "key_point_id": ${ID_FORM}, "claim": non-empty string of at most ${String(L.claimMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...], "answers": [{ "answer_id": ${ID_FORM}, "answer": non-empty string of at most ${String(L.candidateAnswerMaxChars)} characters, "member_item_ids": [item_id, ...] }, ...] }\nEvery member_item_ids list has at least one item_id; every item_id appears in exactly one list; every key_point_id and answer_id is different.`,
  gap: `${STRICT}\n{ "new_points": [${POINT_FORM}, ...], "framing_challenges": [non-empty string of at most ${String(L.claimMaxChars)} characters, ...] }\nnew_points has 0 to ${String(L.gapPointsMax)} entries; framing_challenges has 0 to ${String(L.framingChallengesMax)} entries.`,
  choose: `${STRICT}\n{ "answers": [{ "answer_id": ${ID_FORM}, "statement": non-empty string of at most ${String(L.claimMaxChars)} characters, "for": [key_point_id, ...], "against": [key_point_id, ...], "strongest_rival": answer_id of another answer, or null }, ...] }\nanswers has ${String(L.chooseAnswersMin)} to ${String(L.chooseAnswersMax)} entries (at least ${String(L.chooseDistinctAnswersMin)} when the question allows it); for and against each have at most ${String(L.choosePointsPerSideMax)} entries and use only key_point_id values given in key_points; every answer_id is different.`
});

/** Length guidance (spec 2026-10-15 §3.2): the map's seven variants, one per contract, sealed after today's seven. */
export const MAP_LENGTH_CONTRACT_IDS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: "map.angles.length.v1",
  listAngle: "map.list.angle.length.v1",
  listOpen: "map.list.open.length.v1",
  listSnowball: "map.list.snowball.length.v1",
  merge: "map.merge.length.v1",
  gap: "map.gap.length.v1",
  choose: "map.choose.length.v1"
});

/** A text a variant's form asks for: no character number, the part's target named in `length` instead (spec §3.2). */
const LENGTHED = (key: string): string => `non-empty string of about the length named for ${key} in length`;
const POINT_FORM_LENGTHED = `{ "claim": ${LENGTHED("claim")}, "why_it_matters": ${LENGTHED("why_it_matters")}, "leans": "for_some_answer" | "against_some_answer" | "context" }`;
const LIST_FORM_LENGTHED = `${STRICT}\n{ "points": [${POINT_FORM_LENGTHED}, ...], "candidate_answers": [${LENGTHED("candidate_answers")}, ...] }\npoints has ${String(L.listPointsMin)} to ${String(L.listPointsMax)} entries; candidate_answers has ${String(L.listAnswersMin)} to ${String(L.listAnswersMax)} entries.`;

/** The variants' answer forms: today's forms with every text limit replaced by its `length` target; ids and counts as today. */
export const MAP_LENGTH_ANSWER_FORMS: Readonly<Record<MapContractName, string>> = Object.freeze({
  angles: `${STRICT}\n{ "question_language": FIRST, the two-letter ISO 639-1 code of the language the question in question_line is written in, in lower case, "angles": [{ "angle_id": ${ID_FORM}, "kind": "OPPOSITE_CASE" | "ASKER_WORRY" | "PRACTICAL" | "SPECIFIC", "label": ${LENGTHED("label")}, "focus": ${LENGTHED("focus")} }, ...] }\nangles has ${String(L.anglesMin)} to ${String(L.anglesMax)} entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and ${String(L.specificAnglesMin)} to ${String(L.specificAnglesMax)} of SPECIFIC; every angle_id is different.`,
  listAngle: LIST_FORM_LENGTHED,
  listOpen: LIST_FORM_LENGTHED,
  listSnowball: `${STRICT}\n{ "points": [${POINT_FORM_LENGTHED}, ...], "candidate_answers": [${LENGTHED("candidate_answers")}, ...] }\npoints has 0 to ${String(L.snowballPointsMax)} entries; candidate_answers has 0 to ${String(L.snowballAnswersMax)} entries.`,
  merge: `${STRICT}\n{ "key_points": [{ "key_point_id": ${ID_FORM}, "claim": ${LENGTHED("claim")}, "member_item_ids": [item_id, ...] }, ...], "answers": [{ "answer_id": ${ID_FORM}, "answer": ${LENGTHED("answer")}, "member_item_ids": [item_id, ...] }, ...] }\nEvery member_item_ids list has at least one item_id; every item_id appears in exactly one list; every key_point_id and answer_id is different.`,
  gap: `${STRICT}\n{ "new_points": [${POINT_FORM_LENGTHED}, ...], "framing_challenges": [${LENGTHED("framing_challenges")}, ...] }\nnew_points has 0 to ${String(L.gapPointsMax)} entries; framing_challenges has 0 to ${String(L.framingChallengesMax)} entries.`,
  choose: `${STRICT}\n{ "answers": [{ "answer_id": ${ID_FORM}, "statement": ${LENGTHED("statement")}, "for": [key_point_id, ...], "against": [key_point_id, ...], "strongest_rival": answer_id of another answer, or null }, ...] }\nanswers has ${String(L.chooseAnswersMin)} to ${String(L.chooseAnswersMax)} entries (at least ${String(L.chooseDistinctAnswersMin)} when the question allows it); for and against each have at most ${String(L.choosePointsPerSideMax)} entries and use only key_point_id values given in key_points; every answer_id is different.`
});

/** The contract a recorded map call was asked under, by its id: today's or its variant; null for any other id. */
export function mapContractNameOf(contractId: string): MapContractName | null {
  return MAP_CONTRACT_NAMES.find((name) => MAP_CONTRACT_IDS[name] === contractId || MAP_LENGTH_CONTRACT_IDS[name] === contractId) ?? null;
}

/**
 * ENGINE REDESIGN R3 (spec 2026-10-15 §5.2, §5.6, §9): the map's engine-2 contracts. Engine 2 only, new shape only: a
 * run without the receipt's `engine` member never frames one. They are sealed ONLY by `engineContractHash`
 * (apps/runner/src/engine-contracts.ts), never by `mapContractHash`: today's seven and LG-C's seven keep their bytes.
 * Always lengthed (engine INTERFACE §0): each instruction ends with LG-C's parts sentence, and every text in a form points
 * to the `length` field. P2.7 (deviation 7): the instructions name no field and no code value; the forms, which are
 * code's, name their keys and gloss each code once. The texts are spec §5.6 as edited 2026-10-16 (D4, D5): the
 * instructions that write answers describe only the committed form; only the check names the failing forms. Every
 * instruction is OWNER WORDING, option 1: approve before switch-on (pre-flight PF-R3-2.1, PF-R3-2.4).
 */
export const MAP_ENGINE_CONTRACT_NAMES = Object.freeze([...MAP_CONTRACT_NAMES, "check"] as const);
export type MapEngineContractName = typeof MAP_ENGINE_CONTRACT_NAMES[number];
export type MapEngineInstructionTexts = Readonly<Record<MapEngineContractName, string>>;
export type MapEnginePromptContractSet = Readonly<Record<MapEngineContractName, PromptContract>>;

export const MAP_ENGINE_CONTRACT_IDS: Readonly<Record<MapEngineContractName, string>> = Object.freeze({
  angles: "map.angles.v2",
  listAngle: "map.list.angle.v2",
  listOpen: "map.list.open.v2",
  listSnowball: "map.list.snowball.v2",
  merge: "map.merge.v2",
  gap: "map.gap.v2",
  choose: "map.choose.v2",
  check: "map.check.v1"
});

const ENGINE_LEANS_SENTENCE = "Say how each point leans: for some answer to the question, against some answer, or context that "
  + "any answer has to take into account.";
const ENGINE_RESTS_ON_SENTENCES = "For each point, say what it rests on: a fact the question gives, or an assumption. Never "
  + "present an assumption about the person or their situation as a fact the question gives; when a point needs one, make "
  + "it a condition.";
// (pre-flight PF-R3-2.1) spec §5.6 "Lists (angle, open, snowball)" as edited 2026-10-16: D4(c)'s condition rule, no quoted hedge (D5).
const ENGINE_COMMIT_SENTENCES = "An answer may be conditional: it says which way it goes in which case, and each condition names "
  + "a fact of the person's situation they can check or, for a personal choice, a real trade-off they can weigh. You may "
  + "also name an answer that challenges the question's own premise, when the premise looks doubtful.";

// OWNER WORDING — approve before switch-on (option 1): the eight instruction texts below (spec §5.6 as edited 2026-10-16,
// D4 and D5), word for word. A rewording is a NEW sealed id (for example map.choose.v3), never an edit of these.
export const MAP_ENGINE_INSTRUCTIONS: MapEngineInstructionTexts = Object.freeze({
  angles: [
    "Plan the angles from which the question will be examined before it is debated.",
    "An angle is one way of looking at the question that is likely to bring up points the other angles miss.",
    "Always include exactly one angle of each of three fixed kinds: the strongest case for an answer different from the one",
    "most people would give first; what the person asking is probably worried about or trying to decide; and what the person",
    "should actually do and what it would take.",
    "Then add one to four angles that fit this particular question, for example a group of people affected, a time horizon,",
    "a cost, a risk or a body of evidence.",
    "An angle may look at one possible situation of the person asking, but it names it as a possibility, never as a fact the question gives.",
    "Give each angle a short label and one sentence saying what to look at. Do not answer the question."
  ].join(" "),
  listAngle: [
    "List the points that matter for answering the question, looking at it from the angle you were given.",
    POINT_SENTENCE,
    "Prefer points that someone looking from another angle would probably miss.",
    ENGINE_LEANS_SENTENCE,
    ENGINE_RESTS_ON_SENTENCES,
    "Then name one to three answers to the question that commit to a position, without arguing for them.",
    ENGINE_COMMIT_SENTENCES,
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listOpen: [
    "List the points that matter most for answering the question, from every side.",
    POINT_SENTENCE,
    ENGINE_LEANS_SENTENCE,
    ENGINE_RESTS_ON_SENTENCES,
    "Then name one to three answers to the question that commit to a position, without arguing for them.",
    ENGINE_COMMIT_SENTENCES,
    "Write points, not an essay, and do not repeat one point in other words."
  ].join(" "),
  listSnowball: [
    "Other participants have already listed some points; they are shown to you.",
    "Add only points that are genuinely new and matter for answering the question: a point that says the same as one already",
    "listed, in other words, is not new.",
    POINT_SENTENCE,
    ENGINE_LEANS_SENTENCE,
    ENGINE_RESTS_ON_SENTENCES,
    "Then name up to three answers to the question that commit to a position, without arguing for them, or none.",
    ENGINE_COMMIT_SENTENCES,
    "If nothing new is left, return empty lists."
  ].join(" "),
  merge: [
    "Group the items that make the same point. Each point and each candidate answer you are given has an id.",
    "Put points that say the same thing, even in different words, into one key point, and write one short claim that states it fairly.",
    "Keep points that say different things apart, even when they are related; when in doubt, keep them apart.",
    "Keep what each point rests on: when a group holds an assumption, the group is an assumption.",
    "In the same way, group the candidate answers that mean the same answer and write one short answer for each group.",
    "Use every id exactly once: the ids of points only in the key points, the ids of candidate answers only in the answers.",
    "Do not add points or answers, and do not judge which are right."
  ].join(" "),
  gap: [
    "Look for what is still missing before the question is debated. The key points and answers you are given list what has been raised so far.",
    "Add only points that are genuinely new and matter for the answer, such as a consideration, a group of people, a risk,",
    "a cost or a piece of evidence nobody has mentioned. A point that restates one already listed is not new.",
    POINT_SENTENCE,
    ENGINE_LEANS_SENTENCE,
    ENGINE_RESTS_ON_SENTENCES,
    "You may also note up to three framing challenges: ways the question itself may be framed too narrowly or rest on a doubtful assumption.",
    "If nothing important is missing, return empty lists."
  ].join(" "),
  // (pre-flight PF-R3-2.1) spec §5.6 "Choose" as edited 2026-10-16: D4(a) "prefer answers that people actually hold",
  // D4(c)'s condition rule, no quoted hedge (D5).
  choose: [
    "Choose what the debate will be about.",
    "Name two to four answers to the question that really differ from each other, so that each can be argued in full by a",
    "different participant; prefer answers that people actually hold, and never two wordings of the same answer.",
    "Every answer must commit: it may be conditional, saying which way it goes in which case, with each condition naming a",
    "fact of the person's situation they can check or, for a personal choice, a real trade-off they can weigh.",
    "When a candidate does not commit, turn it into the committed or conditional answer it stands for.",
    "An answer may not rest on a fact the question does not give: make a missing fact a condition, and list each answer's assumptions.",
    "Each answer shows how many different AI makers raised it on their own; a widely raised answer usually deserves a place,",
    "but a rarely raised one can matter more.",
    "The challenges to the question's framing say where the question may be too narrow or rest on a doubtful assumption;",
    "when one is strong, you may spend one place on an answer that challenges the premise.",
    "For each answer, list the key points that speak for it and those that speak against it, most important first, judging",
    "importance by one test: could this point change the answer?",
    "Name the other answer that competes with it most.",
    "Then name up to two reserve answers, in order.",
    "Do not argue the answers here."
  ].join(" "),
  // (pre-flight PF-R3-2.1) spec §5.6 "Answer check" as edited 2026-10-16: three questions (D4b, premise challenges
  // exempt), circular conditions named (D4c); the only text that names the failing forms (D5).
  check: [
    "Check each answer below against the question before it is debated. For each, say three things.",
    "First: does it answer the question as asked? A conditional answer that says which way it goes in which case answers it,",
    "and so does an answer that challenges the question's premise; an answer that only says it depends, that it is",
    "undetermined or that more information is needed does not, and neither does one whose condition only restates a",
    "preference for it, such as A if you prefer A.",
    "Second: does it state, as a fact about the person or their situation, something the question does not give?",
    "A condition stated as a condition is fine.",
    "Third, unless the answer challenges the question's premise: if this answer were followed with no regard for the other",
    "answers' concerns, what would go wrong? If nothing can be named, it is not a real answer.",
    "Give one short reason for each answer that fails. Do not judge which answer is right."
  ].join(" ")
});

/** Code's part (P2.7): each form names its keys and glosses each code once; texts point to `length` (LG-C's LENGTHED). */
const ENGINE_RESTS_ON_FORM = `"rests_on": "question" (a fact the question gives) | "assumption"`;
const ENGINE_LEANS_FORM = `"leans": "for_some_answer" (for some answer) | "against_some_answer" (against some answer) | "context"`;
const ENGINE_POINT_FORM = `{ "claim": ${LENGTHED("claim")}, "why_it_matters": ${LENGTHED("why_it_matters")}, ${ENGINE_LEANS_FORM}, ${ENGINE_RESTS_ON_FORM} }`;
const ENGINE_LIST_FORM = `${STRICT}\n{ "points": [${ENGINE_POINT_FORM}, ...], "candidate_answers": [${LENGTHED("candidate_answers")}, ...] }\npoints has ${String(L.listPointsMin)} to ${String(L.listPointsMax)} entries; candidate_answers has ${String(L.listAnswersMin)} to ${String(L.listAnswersMax)} entries.`;
const ENGINE_ANGLE_KIND_FORM = `"OPPOSITE_CASE" (the strongest case for a different answer) | "ASKER_WORRY" (what the person asking is worried about) | "PRACTICAL" (what to do in practice) | "SPECIFIC" (an angle that fits this question)`;
const ENGINE_SIDES_FORM = `"for": [key_point_id, ...], "against": [key_point_id, ...]`;
const ENGINE_ASSUMPTIONS_FORM = `"assumptions": [${LENGTHED("assumptions")}, ...]`;
const E = MAP_ENGINE_LIMITS;

export const MAP_ENGINE_ANSWER_FORMS: Readonly<Record<MapEngineContractName, string>> = Object.freeze({
  angles: `${STRICT}\n{ "question_language": FIRST, the two-letter ISO 639-1 code of the language the question in question_line is written in, in lower case, "angles": [{ "angle_id": ${ID_FORM}, "kind": ${ENGINE_ANGLE_KIND_FORM}, "label": ${LENGTHED("label")}, "focus": ${LENGTHED("focus")} }, ...] }\nangles has ${String(L.anglesMin)} to ${String(L.anglesMax)} entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and ${String(L.specificAnglesMin)} to ${String(L.specificAnglesMax)} of SPECIFIC; every angle_id is different.`,
  listAngle: ENGINE_LIST_FORM,
  listOpen: ENGINE_LIST_FORM,
  listSnowball: `${STRICT}\n{ "points": [${ENGINE_POINT_FORM}, ...], "candidate_answers": [${LENGTHED("candidate_answers")}, ...] }\npoints has 0 to ${String(L.snowballPointsMax)} entries; candidate_answers has 0 to ${String(L.snowballAnswersMax)} entries.`,
  merge: `${STRICT}\n{ "key_points": [{ "key_point_id": ${ID_FORM}, "claim": ${LENGTHED("claim")}, ${ENGINE_RESTS_ON_FORM}, "member_item_ids": [item_id, ...] }, ...], "answers": [{ "answer_id": ${ID_FORM}, "answer": ${LENGTHED("answer")}, "member_item_ids": [item_id, ...] }, ...] }\nEvery member_item_ids list has at least one item_id; every item_id appears in exactly one list; every key_point_id and answer_id is different; a key point is "assumption" when any point in it is.`,
  gap: `${STRICT}\n{ "new_points": [${ENGINE_POINT_FORM}, ...], "framing_challenges": [${LENGTHED("framing_challenges")}, ...] }\nnew_points has 0 to ${String(L.gapPointsMax)} entries; framing_challenges has 0 to ${String(L.framingChallengesMax)} entries.`,
  choose: `${STRICT}\n{ "answers": [{ "answer_id": ${ID_FORM} (reuse the answer_id of an answer from answers when you keep it), "statement": ${LENGTHED("statement")}, ${ENGINE_SIDES_FORM}, "strongest_rival": answer_id of another answer, or null, ${ENGINE_ASSUMPTIONS_FORM} }, ...], "reserve_answers": [{ "statement": ${LENGTHED("statement")}, ${ENGINE_SIDES_FORM}, ${ENGINE_ASSUMPTIONS_FORM} }, ...] }\nanswers has ${String(L.chooseAnswersMin)} to ${String(L.chooseAnswersMax)} entries (at least ${String(L.chooseDistinctAnswersMin)} when the question allows it); reserve_answers has 0 to ${String(E.reservesMax)} entries, in order; for and against each have at most ${String(L.choosePointsPerSideMax)} entries and use only key_point_id values given in key_points; assumptions has 0 to ${String(E.assumptionsMax)} entries; every answer_id is different.`,
  // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding; deviation 12, after INTERFACE §10.4) the third question's REQUIRED nullable member.
  check: `${STRICT}\n{ "checks": [{ "check_id": a check_id given in answers, "answers_question": true | false, "adds_unstated_fact": true | false, "cost_can_be_named": true | false | null (null only for an answer that challenges the question's premise), "reason": ${LENGTHED("reason")} | null }, ...] }\nchecks has exactly one entry for every check_id given in answers; reason is required when answers_question is false, adds_unstated_fact is true or cost_can_be_named is false.`
});

/** The eight engine-2 contracts (default: the shipped text). Sealed by engineContractHash only. */
export function mapEnginePromptContracts(texts: MapEngineInstructionTexts = MAP_ENGINE_INSTRUCTIONS): MapEnginePromptContractSet {
  const entries = MAP_ENGINE_CONTRACT_NAMES.map((name) => [name, Object.freeze({
    contractId: MAP_ENGINE_CONTRACT_IDS[name],
    instruction: `${texts[name]} ${LENGTH_SENTENCE_PARTS}`,
    answerForm: MAP_ENGINE_ANSWER_FORMS[name]
  })] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<MapEngineContractName, PromptContract>);
}

/** The engine-2 contract a recorded call was asked under, by its id; null for any other id (engine 1's included). */
export function mapEngineContractNameOf(contractId: string): MapEngineContractName | null {
  return MAP_ENGINE_CONTRACT_NAMES.find((name) => MAP_ENGINE_CONTRACT_IDS[name] === contractId) ?? null;
}

/**
 * The length variants of the given contracts (spec 2026-10-15 §3.2): each one's own instruction, then the parts
 * sentence, under the variant's id and form. Built from the SAME texts a run uses, so an owner's edited map text is never
 * replaced by the shipped one on a lengthed run (Task 14 review 3; the owner-editable prompts rule).
 */
export function mapLengthContractsOf(contracts: MapPromptContractSet): MapPromptContractSet {
  const entries = MAP_CONTRACT_NAMES.map((name) => [name, Object.freeze({ contractId: MAP_LENGTH_CONTRACT_IDS[name],
    instruction: `${contracts[name].instruction} ${LENGTH_SENTENCE_PARTS}`, answerForm: MAP_LENGTH_ANSWER_FORMS[name] })] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<MapContractName, PromptContract>);
}

/** The seven contracts from the given instruction texts (default: the shipped text); `lengthed`: their length variants. */
export function mapPromptContracts(texts: MapInstructionTexts = MAP_DEFAULT_INSTRUCTIONS, lengthed = false): MapPromptContractSet {
  const entries = MAP_CONTRACT_NAMES.map((name) => [name,
    Object.freeze({ contractId: MAP_CONTRACT_IDS[name], instruction: texts[name], answerForm: MAP_ANSWER_FORMS[name] })] as const);
  const today = Object.freeze(Object.fromEntries(entries) as Record<MapContractName, PromptContract>);
  return lengthed ? mapLengthContractsOf(today) : today;
}

/**
 * The one fingerprint text: today's seven, then the seven length variants (spec 2026-10-15 §3.2), frame version included.
 * The variants default to those of the given contracts (owner-edited texts seal their own variants).
 */
export function mapPromptFingerprintText(contracts: MapPromptContractSet = mapPromptContracts(),
  lengthContracts: MapPromptContractSet = mapLengthContractsOf(contracts)): string {
  return [...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(contracts[name])),
    ...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(lengthContracts[name]))].join("\n---\n");
}

/** The map's contract hash: what the register seals as mapContractHash, and what each map call carries. */
export function mapPromptContractHash(contracts: MapPromptContractSet = mapPromptContracts(),
  lengthContracts: MapPromptContractSet = mapLengthContractsOf(contracts)): string {
  return createHash("sha256").update(mapPromptFingerprintText(contracts, lengthContracts)).digest("hex");
}

/** The contract a call sends: the instruction, then the locked language's one sentence (today's directive only for "und"). */
export function mapContractInLanguage(contract: PromptContract, language: QuestionLanguage | null, languageName: string): PromptContract {
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${languageDirectiveFor(languageName, language)}` });
}
