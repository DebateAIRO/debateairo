import { MAP_INTERNAL_FIELD_NAMES, mapNamesInternalWord } from "./internal-words.js";
import { mapRankKeyPoints, mapRankMergedAnswers } from "./items.js";
import { MAP_OPPOSITE_SEPARATORS, MAP_OPPOSITE_TEMPLATES } from "./opposite-templates.js";
import type { MapChooseReply, MapChooseReplyV2 } from "./replies.js";
import { mapNormaliseText, mapPrimarySubtag } from "./text.js";
import {
  MAP_ENGINE_LIMITS,
  MAP_LIMITS,
  type MapAnswerItem,
  type MapChoice,
  type MapItem,
  type MapKeyPoint,
  type MapMarkRecord,
  type MapMergedAnswer,
  type MapNoteRecord,
  type MapReserveAnswer
} from "./types.js";

/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE).
 * Code-owned text in every site locale (`MAP_OPPOSITE_TEMPLATES`), read by the tag's primary subtag ("ro-RO" → "ro");
 * a language the site does not serve gets English.
 */
export function mapOppositeTemplate(statement: string, languageTag: string, claimMaxChars: number = MAP_LIMITS.claimMaxChars): string {
  // Own keys only: a tag such as "constructor" must not read the object's prototype.
  const subtag = mapPrimarySubtag(languageTag);
  const template = Object.hasOwn(MAP_OPPOSITE_TEMPLATES, subtag) ? MAP_OPPOSITE_TEMPLATES[subtag]! : MAP_OPPOSITE_TEMPLATES.en!;
  const separator = Object.hasOwn(MAP_OPPOSITE_SEPARATORS, subtag) ? MAP_OPPOSITE_SEPARATORS[subtag]! : ": ";
  return (statement.trim() === "" ? template.empty : `${template.lead}${separator}${statement.trim()}`).slice(0, claimMaxChars);
}

/**
 * The chosen answers' ids (controller ruling T7-PRIV): `a1`..`aN` in choice order, filled answers included, minted by
 * code. A chosen answer's id lands in a readable column (core.map_position.answer_id) on an encrypted run, so it is never
 * the chooser's own answer_id (a slug such as "sell-family-home"): that one stays in the raw reply, which the runner
 * stores encrypted. N is at most MAP_LIMITS.chooseAnswersMax; migration 0117's CHECK holds the same bound.
 */
export const mapChosenAnswerCodeId = (index: number): string => `a${String(index + 1)}`;

/** A debate argues its map's own answers only when there are at least this many of them. */
const MAP_ARGUED_ANSWERS_MIN = 2;

/**
 * Debate shape P2c, ruling C-TWO — were the map's own answers argued? `answerCount` is how many of the map's chosen
 * answers the run planned to argue (the runner's map positions; the stored choice keeps exactly those, as
 * `writeMapRun` cuts it to the run's P). Fewer than two, and the run argued today's opening instead. ONE rule for both
 * sides: the runner hands the story the "also raised" points only when it holds, and the debate page shows the map view
 * only when it holds, so the page never shows a map the story left out.
 */
export function mapAnswersArgued(answerCount: number): boolean {
  return Number.isSafeInteger(answerCount) && answerCount >= MAP_ARGUED_ANSWERS_MIN;
}

export type MapFinishChoiceInput = Readonly<{
  /** The choose AI's checked reply, or null when the step failed (MAP_CHOOSE_FALLBACK). */
  reply: MapChooseReply | MapChooseReplyV2 | null;
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  items: readonly MapItem[];
  languageTag: string;
  /** P: the most answers the debate argues (never more than MAP_LIMITS.chooseAnswersMax). */
  maxAnswers: number;
  /** K: points per answer, used when the code chooses (the fallback). */
  pointsPerAnswer: number;
  /** Length guidance: a filled answer's limit (today's, or the runaway one with the row). */
  claimMaxChars?: number;
  /**
   * Engine redesign (spec 2026-10-15 §5.2 rule 4; deviation 5): "NONE" never puts a point on a side by code — a code-
   * chosen answer, a code-filled answer and a quota fill get UNSIDED points raised instead. Absent = "LEAN" (engine 1).
   */
  siding?: "LEAN" | "NONE";
  /**
   * Engine 2: the internal words the skip reads (MAP_ENGINE_INTERNAL_FIELD_NAMES); absent = engine 1's. Pass the frozen
   * constant itself, never a copy: Task 3's pattern cache is keyed by the array, so a fresh array compiles and caches a
   * new pattern on every call (pre-flight PF-R33.12).
   */
  internalNames?: readonly string[];
}>;

/** One chosen answer of either choose reply (engine 1's, or engine 2's with its optional assumptions). */
type MapChooseReplyAnswer = (MapChooseReply | MapChooseReplyV2)["answers"][number];

type MapAnswerDraft = {
  /**
   * The answer's id while the choice is built: the chooser's own answer_id (its rivals name it), `a<n>` in the fallback,
   * `filled-<n>` for a filled one. Never returned: the answers are renamed a1..aN at the end.
   */
  answerId: string;
  statement: string;
  forIds: string[];
  againstIds: string[];
  rival: string | null;
  filled: boolean;
  /** The answer came from the opposite case: a merged answer with fromOppositeCase, an OPPOSITE_CASE candidate, or the OPPOSITE_CASE_LIST fill. */
  opposite: boolean;
  /** Engine 2: the chooser's assumptions for this answer ([] for a code-made answer, and always under engine 1). */
  assumptions: string[];
  /** Engine 2: key point ids dealt to this answer UNSIDED ("points raised"); always [] under engine 1. */
  raised: string[];
  /** Ruling R3-T9.1: the merged answer it reuses (written only under engine 2), or null. */
  mergedAnswerId: string | null;
};

const mapSideOf = (keyPoint: MapKeyPoint): "for" | "against" =>
  keyPoint.leansAgainst || keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE") ? "against" : "for";

/**
 * The first entry of each statement (normalised), in order: one answer worded twice counts once. A statement that
 * normalises to nothing (only signs) matches nothing, so it is always kept.
 */
function mapFirstOfEachStatement<T>(entries: readonly T[], statement: (entry: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = mapNormaliseText(statement(entry));
    if (key !== "" && seen.has(key)) continue;
    if (key !== "") seen.add(key);
    out.push(entry);
  }
  return out;
}

/** Final review M-3: a text with at least one letter or digit (one that does not normalise to nothing). */
const hasWords = (text: string): boolean => mapNormaliseText(text) !== "";

/**
 * The operator-only note for what the choice left out because it names an internal field or item id: how many key points
 * (never dealt, never "also raised") and merged answers (never chosen, never filled). Null when there were none.
 */
export function mapInternalWordsSkipped(keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[],
  names: readonly string[] = MAP_INTERNAL_FIELD_NAMES): MapNoteRecord | null {
  const points = keyPoints.filter((keyPoint) => mapNamesInternalWord(keyPoint.claim, names)).length;
  const answers = mergedAnswers.filter((answer) => mapNamesInternalWord(answer.answer, names)).length;
  if (points + answers === 0) return null;
  return Object.freeze({ note: "INTERNAL_WORDS_SKIPPED", step: "CHOOSE", detail: `key points ${String(points)}, answers ${String(answers)}` });
}

export function mapFinishChoice(input: MapFinishChoiceInput): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[] }> {
  const marks: MapMarkRecord[] = [];
  const noSiding = input.siding === "NONE";
  const names = input.internalNames ?? MAP_INTERNAL_FIELD_NAMES;
  const named = (text: string): boolean => mapNamesInternalWord(text, names);
  /** Final review M-3 and practice 2026-10-15: words, and no internal field or item id (engine 2: engine 2's words). */
  const readable = (text: string): boolean => hasWords(text) && !named(text);
  // Practice 2026-10-15: a key point whose claim names an internal field or item id is never dealt to an answer (its claim
  // would be a debater's consideration) nor listed as also raised: as if it were not shown, the rule below for any id the
  // chooser was not shown. A merged answer or list answer that names one is never chosen or filled, like one with no words.
  const keyPoints = input.keyPoints.filter((keyPoint) => !named(keyPoint.claim));
  const ranked = mapRankKeyPoints(keyPoints);
  const byId = new Map(keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  // The answer ids are a1..aN with N at most chooseAnswersMax (0117's CHECK), whatever the caller's P says.
  const maxAnswers = Math.min(input.maxAnswers, MAP_LIMITS.chooseAnswersMax);
  // Only the key points the chooser was shown: the check refuses any other id; this holds for any reply (T7-PRIV).
  const shownKeyPoints = (ids: readonly string[]): string[] => ids.filter((id) => byId.has(id));
  // The texts of the answers that came from the opposite case (a merged answer with fromOppositeCase, or an OPPOSITE_CASE
  // candidate). A chosen answer is opposite when its text matches one of them, or (F-I3) when it reuses the answer_id of a
  // merged answer from the opposite case.
  const oppositeTexts = new Set([
    ...input.mergedAnswers.filter((answer) => answer.fromOppositeCase).map((answer) => mapNormaliseText(answer.answer)),
    ...input.items.filter((item): item is MapAnswerItem => item.kind === "ANSWER" && item.angleKind === "OPPOSITE_CASE")
      .map((item) => mapNormaliseText(item.answer))
  ].filter((key) => key !== ""));
  // A statement that normalises to nothing matches nothing.
  const isOpposite = (statement: string) => oppositeTexts.has(mapNormaliseText(statement));
  // F-I3: a chooser that reworded an opposite-case merged answer but reused its answer_id still names that answer.
  const oppositeAnswerIds = new Set(input.mergedAnswers.filter((answer) => answer.fromOppositeCase).map((answer) => answer.answerId));
  // Spec §5.2 rule 4: under "NONE" code never sides a point; what it would have dealt is raised to the writer unsided.
  const place = (draft: MapAnswerDraft, keyPoint: MapKeyPoint) => {
    if (noSiding) { draft.raised.push(keyPoint.keyPointId); return; }
    (mapSideOf(keyPoint) === "against" ? draft.againstIds : draft.forIds).push(keyPoint.keyPointId);
  };
  const countOf = (draft: MapAnswerDraft) => draft.forIds.length + draft.againstIds.length + draft.raised.length;
  const drafts: MapAnswerDraft[] = [];

  if (input.reply === null) {
    marks.push(Object.freeze({ mark: "MAP_CHOOSE_FALLBACK", step: "CHOOSE", detail: "choose reply missing" }));
    // Final review M-3: a merged answer with no letter or digit is never chosen.
    const candidates = mapFirstOfEachStatement(mapRankMergedAnswers(input.mergedAnswers).filter((answer) => readable(answer.answer)),
      (answer) => answer.answer).slice(0, Math.max(1, maxAnswers));
    candidates.forEach((answer, index) => {
      drafts.push({ answerId: `a${String(index + 1)}`, statement: answer.answer, forIds: [], againstIds: [], rival: null, filled: false,
        opposite: isOpposite(answer.answer), assumptions: [], raised: [], mergedAnswerId: answer.answerId });
    });
  } else {
    // The choose check refuses such a statement (MAP_ANSWER_NAMES_FIELD); one that reached here anyway is dropped, never shown.
    // Typed as either reply's answer, so the engine-2 `assumptions` member below is read by narrowing, never by a cast.
    const replyAnswers: readonly MapChooseReplyAnswer[] = input.reply.answers.filter((answer) => !named(answer.statement));
    const mergedIds = new Set(input.mergedAnswers.map((answer) => answer.answerId));
    for (const answer of mapFirstOfEachStatement(replyAnswers, (entry) => entry.statement).slice(0, maxAnswers)) {
      drafts.push({ answerId: answer.answer_id, statement: answer.statement, forIds: shownKeyPoints(answer.for), againstIds: shownKeyPoints(answer.against),
        rival: answer.strongest_rival, filled: false, opposite: oppositeAnswerIds.has(answer.answer_id) || isOpposite(answer.statement),
        // R3 final wave P7: at most MAP_ENGINE_LIMITS.assumptionsMax in code too (the schema's limit; this holds for any reply).
        assumptions: noSiding && "assumptions" in answer
          ? (answer.assumptions ?? []).filter(readable).slice(0, MAP_ENGINE_LIMITS.assumptionsMax) : [], raised: [],
        mergedAnswerId: mergedIds.has(answer.answer_id) ? answer.answer_id : null });
    }
  }

  // Distinct answers (spec §1.1): at least two. They are filled before any point is dealt, so a filled answer can receive points.
  const mintFilledId = () => {
    let n = drafts.length + 1;
    while (drafts.some((draft) => draft.answerId === `filled-${String(n)}`)) n += 1;
    return `filled-${String(n)}`;
  };
  while (drafts.length < MAP_LIMITS.chooseDistinctAnswersMin) {
    // `taken` keeps the old rule on purpose (an empty normalised key IS taken): if an answer that normalises to nothing
    // matched nothing here, the same merged answer could be filled in twice while drafts start empty.
    const taken = new Set(drafts.map((draft) => mapNormaliseText(draft.statement)));
    // R3 final wave P9 (Task 9 O2): under engine 2 a merged answer a chosen answer already reuses (maybe reworded) never
    // fills a second place, so the debate never argues two wordings of one answer. Engine 1 keeps today's text rule only.
    const keptIds = new Set(noSiding ? drafts.flatMap((draft) => (draft.mergedAnswerId === null ? [] : [draft.mergedAnswerId])) : []);
    // Final review M-3: an answer with no letter or digit never fills a place (the template is the last resort).
    const fromMap = mapRankMergedAnswers(input.mergedAnswers).find((answer) => readable(answer.answer)
      && !taken.has(mapNormaliseText(answer.answer)) && !keptIds.has(answer.answerId));
    const fromOpposite = input.items.find((item): item is MapAnswerItem => item.kind === "ANSWER"
      && item.angleKind === "OPPOSITE_CASE" && readable(item.answer) && !taken.has(mapNormaliseText(item.answer)));
    const first = drafts[0];
    const [statement, source]: readonly [string, string] = fromMap !== undefined ? [fromMap.answer, "MAP_CANDIDATE"]
      : fromOpposite !== undefined ? [fromOpposite.answer, "OPPOSITE_CASE_LIST"]
        : [mapOppositeTemplate(first?.statement ?? "", input.languageTag, input.claimMaxChars ?? MAP_LIMITS.claimMaxChars), "TEMPLATE"];
    drafts.push({ answerId: mintFilledId(), statement, forIds: [], againstIds: [], rival: first?.answerId ?? null, filled: true,
      opposite: source === "OPPOSITE_CASE_LIST" || isOpposite(statement), assumptions: [], raised: [], mergedAnswerId: fromMap?.answerId ?? null });
    marks.push(Object.freeze({ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: source }));
  }

  // The fallback deals points most-raised first, round-robin over every answer (filled ones too), up to K each.
  if (input.reply === null) {
    ranked.forEach((keyPoint, index) => {
      const draft = drafts[index % drafts.length]!;
      if (countOf(draft) < input.pointsPerAnswer) place(draft, keyPoint);
    });
  }

  // Quotas over the whole chosen set (spec §1.1, as ruled 2026-10-12).
  const chosenIds = () => new Set(drafts.flatMap((draft) => [...draft.forIds, ...draft.againstIds, ...draft.raised]));
  const quota = (name: string, eligible: (keyPoint: MapKeyPoint) => boolean, toOppositeAnswer: boolean) => {
    const chosen = chosenIds();
    if ([...chosen].some((id) => { const keyPoint = byId.get(id); return keyPoint !== undefined && eligible(keyPoint); })) return;
    const pick = ranked.find((keyPoint) => eligible(keyPoint) && !chosen.has(keyPoint.keyPointId));
    if (pick === undefined) return;
    // Controller ruling (fix round 1): an OPPOSITE_CASE point goes to the for of an opposite-case answer when one is
    // chosen (the fewest points first); only when none is, the brief's rule applies: against the answer with the fewest points.
    const opposite = drafts.filter((draft) => draft.opposite);
    const onOppositeAnswer = toOppositeAnswer && opposite.length > 0;
    const pool = onOppositeAnswer ? opposite : drafts;
    const target = [...pool].sort((a, b) => countOf(a) - countOf(b))[0]!;
    if (onOppositeAnswer) { if (noSiding) target.raised.push(pick.keyPointId); else target.forIds.push(pick.keyPointId); }
    else place(target, pick);
    marks.push(Object.freeze({ mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: `${name}:${pick.keyPointId}` }));
  };
  // "Raised by exactly one AI": every maker of the point counts (blind, gap and shown), per the controller's ruling of
  // 2026-10-12. Arm A's later AIs work on shown items by design, so excluding them would starve this quota.
  quota("SINGLE_AI", (keyPoint) => keyPoint.makers.length === 1, false);
  quota("OPPOSITE_CASE", (keyPoint) => keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE"), true);
  quota("ASKER_WORRY", (keyPoint) => keyPoint.fixedAngleKinds.includes("ASKER_WORRY"), false);

  // Engine 2 (spec §5.2 item 3): choose's reserve answers, in its order, renamed r1/r2. Code leaves out a reserve with no
  // words, one naming an internal word or one repeating a chosen answer (after code's own fills), and every one past the
  // second; it keeps at most MAP_ENGINE_LIMITS.assumptionsMax readable assumptions each. Reserves repeating EACH OTHER
  // are the reply check's to refuse (mapChooseCheckV2, MAP_ANSWER_DUPLICATE), as are all of the above in a checked reply.
  const chosenKeys = new Set(drafts.map((draft) => mapNormaliseText(draft.statement)));
  const reserveReplies = noSiding && input.reply !== null && "reserve_answers" in input.reply ? input.reply.reserve_answers ?? [] : [];
  const reserves: MapReserveAnswer[] = reserveReplies
    .filter((reserve) => readable(reserve.statement) && !chosenKeys.has(mapNormaliseText(reserve.statement)))
    .slice(0, MAP_ENGINE_LIMITS.reservesMax)
    .map((reserve, index) => Object.freeze({ reserveId: index === 0 ? "r1" as const : "r2" as const, statement: reserve.statement,
      forKeyPointIds: Object.freeze(shownKeyPoints(reserve.for)), againstKeyPointIds: Object.freeze(shownKeyPoints(reserve.against)),
      assumptions: Object.freeze((reserve.assumptions ?? []).filter(readable).slice(0, MAP_ENGINE_LIMITS.assumptionsMax)) }));

  // Ruling T7-PRIV: the answers are renamed a1..aN in choice order (filled ones too), and each strongest rival with them.
  // A rival that names no chosen answer (or the answer itself) becomes the next answer, as before.
  const draftIds = drafts.map((draft) => draft.answerId);
  const answers = drafts.map((draft, index) => {
    const rivalAt = draft.rival === null || draft.rival === draft.answerId ? -1 : draftIds.indexOf(draft.rival);
    const rival = rivalAt >= 0 && rivalAt !== index ? rivalAt : (index + 1) % drafts.length;
    return Object.freeze({
      answerId: mapChosenAnswerCodeId(index),
      statement: draft.statement,
      forKeyPointIds: Object.freeze([...draft.forIds]),
      againstKeyPointIds: Object.freeze([...draft.againstIds]),
      strongestRival: mapChosenAnswerCodeId(rival),
      filled: draft.filled,
      ...(noSiding ? { assumptions: Object.freeze([...draft.assumptions]), pointsRaised: Object.freeze([...draft.raised]) } : {}),
      ...(noSiding && draft.mergedAnswerId !== null ? { mergedAnswerId: draft.mergedAnswerId } : {})
    });
  });
  const finalChosen = chosenIds();
  const choice: MapChoice = Object.freeze({
    answers: Object.freeze(answers),
    alsoRaised: Object.freeze(ranked.filter((keyPoint) => !finalChosen.has(keyPoint.keyPointId)).map((keyPoint) => keyPoint.keyPointId)),
    ...(noSiding ? { reserves: Object.freeze(reserves) } : {})
  });
  return Object.freeze({
    // Engine 2: an answer with no sided points (code-chosen, code-filled) gets the most-raised points still free, unsided.
    choice: noSiding ? mapFillPointsRaised({ choice, keyPoints, pointsPerAnswer: input.pointsPerAnswer, internalNames: names }) : choice,
    marks: Object.freeze(marks)
  });
}

/**
 * ENGINE 2 (spec 2026-10-15 §5.2 rule 4): each answer with NO sided points gets the most-raised key points nobody holds
 * yet, UNSIDED ("points raised"), dealt round-robin in answer order up to K each; then "also raised" is what is left.
 * Pure. Never puts a point for or against an answer. Used by choose and by the answer check after a replacement.
 */
export function mapFillPointsRaised(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; pointsPerAnswer: number;
  internalNames: readonly string[] }>): MapChoice {
  const ranked = mapRankKeyPoints(input.keyPoints.filter((keyPoint) => !mapNamesInternalWord(keyPoint.claim, input.internalNames)));
  const raised = input.choice.answers.map((answer) => [...(answer.pointsRaised ?? [])]);
  const held = new Set(input.choice.answers.flatMap((answer, index) => [...answer.forKeyPointIds, ...answer.againstKeyPointIds, ...raised[index]!]));
  const open = input.choice.answers.flatMap((answer, index) => (answer.forKeyPointIds.length + answer.againstKeyPointIds.length === 0 ? [index] : []));
  let turn = 0;
  for (const keyPoint of ranked) {
    if (held.has(keyPoint.keyPointId)) continue;
    const withRoom = open.filter((index) => raised[index]!.length < input.pointsPerAnswer);
    if (withRoom.length === 0) break;
    raised[withRoom[turn % withRoom.length]!]!.push(keyPoint.keyPointId);
    held.add(keyPoint.keyPointId);
    turn += 1;
  }
  return Object.freeze({
    ...input.choice,
    answers: Object.freeze(input.choice.answers.map((answer, index) => Object.freeze({ ...answer, pointsRaised: Object.freeze(raised[index]!) }))),
    alsoRaised: Object.freeze(ranked.filter((keyPoint) => !held.has(keyPoint.keyPointId)).map((keyPoint) => keyPoint.keyPointId))
  });
}
