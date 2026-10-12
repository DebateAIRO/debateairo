import { mapRankKeyPoints, mapRankMergedAnswers } from "./items.js";
import type { MapChooseReply } from "./replies.js";
import { mapNormaliseText } from "./text.js";
import {
  MAP_LIMITS,
  type MapAnswerItem,
  type MapChoice,
  type MapItem,
  type MapKeyPoint,
  type MapMarkRecord,
  type MapMergedAnswer
} from "./types.js";

/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE).
 * Code-owned text; Phase 1 needs Romanian and English only. Phase 2 needs it in every locale the site serves.
 */
export function mapOppositeTemplate(statement: string, languageTag: string): string {
  const lead = languageTag === "ro" ? "Opusul acestui răspuns" : "The opposite of this answer";
  const empty = languageTag === "ro" ? "Un răspuns diferit de cel de mai sus" : "An answer different from the one above";
  return (statement.trim() === "" ? empty : `${lead}: ${statement.trim()}`).slice(0, MAP_LIMITS.claimMaxChars);
}

export type MapFinishChoiceInput = Readonly<{
  /** The choose AI's checked reply, or null when the step failed (MAP_CHOOSE_FALLBACK). */
  reply: MapChooseReply | null;
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  items: readonly MapItem[];
  languageTag: string;
  /** P: the most answers the debate argues. */
  maxAnswers: number;
  /** K: points per answer, used when the code chooses (the fallback). */
  pointsPerAnswer: number;
}>;

type MapAnswerDraft = {
  answerId: string;
  statement: string;
  forIds: string[];
  againstIds: string[];
  rival: string | null;
  filled: boolean;
  /** The answer came from the opposite case: a merged answer with fromOppositeCase, an OPPOSITE_CASE candidate, or the OPPOSITE_CASE_LIST fill. */
  opposite: boolean;
};

const mapSideOf = (keyPoint: MapKeyPoint): "for" | "against" =>
  keyPoint.leansAgainst || keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE") ? "against" : "for";

/** The first entry of each statement (normalised), in order: one answer worded twice counts once. */
function mapFirstOfEachStatement<T>(entries: readonly T[], statement: (entry: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = mapNormaliseText(statement(entry));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function mapFinishChoice(input: MapFinishChoiceInput): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[] }> {
  const marks: MapMarkRecord[] = [];
  const ranked = mapRankKeyPoints(input.keyPoints);
  const byId = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  // The texts of the answers that came from the opposite case (a merged answer with fromOppositeCase, or an OPPOSITE_CASE candidate).
  const oppositeTexts = new Set([
    ...input.mergedAnswers.filter((answer) => answer.fromOppositeCase).map((answer) => mapNormaliseText(answer.answer)),
    ...input.items.filter((item): item is MapAnswerItem => item.kind === "ANSWER" && item.angleKind === "OPPOSITE_CASE")
      .map((item) => mapNormaliseText(item.answer))
  ]);
  const isOpposite = (statement: string) => oppositeTexts.has(mapNormaliseText(statement));
  const place = (draft: MapAnswerDraft, keyPoint: MapKeyPoint) =>
    (mapSideOf(keyPoint) === "against" ? draft.againstIds : draft.forIds).push(keyPoint.keyPointId);
  const countOf = (draft: MapAnswerDraft) => draft.forIds.length + draft.againstIds.length;
  const drafts: MapAnswerDraft[] = [];

  if (input.reply === null) {
    marks.push(Object.freeze({ mark: "MAP_CHOOSE_FALLBACK", step: "CHOOSE", detail: "choose reply missing" }));
    const candidates = mapFirstOfEachStatement(mapRankMergedAnswers(input.mergedAnswers), (answer) => answer.answer)
      .slice(0, Math.max(1, input.maxAnswers));
    candidates.forEach((answer, index) => {
      drafts.push({ answerId: `a${String(index + 1)}`, statement: answer.answer, forIds: [], againstIds: [], rival: null, filled: false,
        opposite: isOpposite(answer.answer) });
    });
  } else {
    for (const answer of mapFirstOfEachStatement(input.reply.answers, (entry) => entry.statement).slice(0, input.maxAnswers)) {
      drafts.push({ answerId: answer.answer_id, statement: answer.statement, forIds: [...answer.for], againstIds: [...answer.against],
        rival: answer.strongest_rival, filled: false, opposite: isOpposite(answer.statement) });
    }
  }

  // Distinct answers (spec §1.1): at least two. They are filled before any point is dealt, so a filled answer can receive points.
  const mintFilledId = () => {
    let n = drafts.length + 1;
    while (drafts.some((draft) => draft.answerId === `filled-${String(n)}`)) n += 1;
    return `filled-${String(n)}`;
  };
  while (drafts.length < MAP_LIMITS.chooseDistinctAnswersMin) {
    const taken = new Set(drafts.map((draft) => mapNormaliseText(draft.statement)));
    const fromMap = mapRankMergedAnswers(input.mergedAnswers).find((answer) => !taken.has(mapNormaliseText(answer.answer)));
    const fromOpposite = input.items.find((item): item is MapAnswerItem => item.kind === "ANSWER"
      && item.angleKind === "OPPOSITE_CASE" && !taken.has(mapNormaliseText(item.answer)));
    const first = drafts[0];
    const [statement, source]: readonly [string, string] = fromMap !== undefined ? [fromMap.answer, "MAP_CANDIDATE"]
      : fromOpposite !== undefined ? [fromOpposite.answer, "OPPOSITE_CASE_LIST"]
        : [mapOppositeTemplate(first?.statement ?? "", input.languageTag), "TEMPLATE"];
    drafts.push({ answerId: mintFilledId(), statement, forIds: [], againstIds: [], rival: first?.answerId ?? null, filled: true,
      opposite: source === "OPPOSITE_CASE_LIST" || isOpposite(statement) });
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
  const chosenIds = () => new Set(drafts.flatMap((draft) => [...draft.forIds, ...draft.againstIds]));
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
    if (onOppositeAnswer) target.forIds.push(pick.keyPointId);
    else place(target, pick);
    marks.push(Object.freeze({ mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: `${name}:${pick.keyPointId}` }));
  };
  // "Raised by exactly one AI": every maker of the point counts (blind, gap and shown), per the controller's ruling of
  // 2026-10-12. Arm A's later AIs work on shown items by design, so excluding them would starve this quota.
  quota("SINGLE_AI", (keyPoint) => keyPoint.makers.length === 1, false);
  quota("OPPOSITE_CASE", (keyPoint) => keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE"), true);
  quota("ASKER_WORRY", (keyPoint) => keyPoint.fixedAngleKinds.includes("ASKER_WORRY"), false);

  const answerIds = drafts.map((draft) => draft.answerId);
  const answers = drafts.map((draft, index) => Object.freeze({
    answerId: draft.answerId,
    statement: draft.statement,
    forKeyPointIds: Object.freeze([...draft.forIds]),
    againstKeyPointIds: Object.freeze([...draft.againstIds]),
    strongestRival: draft.rival !== null && draft.rival !== draft.answerId && answerIds.includes(draft.rival)
      ? draft.rival : answerIds[(index + 1) % answerIds.length]!,
    filled: draft.filled
  }));
  const finalChosen = chosenIds();
  return Object.freeze({
    choice: Object.freeze({
      answers: Object.freeze(answers),
      alsoRaised: Object.freeze(ranked.filter((keyPoint) => !finalChosen.has(keyPoint.keyPointId)).map((keyPoint) => keyPoint.keyPointId))
    }),
    marks: Object.freeze(marks)
  });
}
