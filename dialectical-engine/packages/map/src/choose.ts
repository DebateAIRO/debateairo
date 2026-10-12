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

type MapAnswerDraft = { answerId: string; statement: string; forIds: string[]; againstIds: string[]; rival: string | null; filled: boolean };

const mapSideOf = (keyPoint: MapKeyPoint): "for" | "against" =>
  keyPoint.leansAgainst || keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE") ? "against" : "for";

export function mapFinishChoice(input: MapFinishChoiceInput): Readonly<{ choice: MapChoice; marks: readonly MapMarkRecord[] }> {
  const marks: MapMarkRecord[] = [];
  const ranked = mapRankKeyPoints(input.keyPoints);
  const byId = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  const place = (draft: MapAnswerDraft, keyPoint: MapKeyPoint) =>
    (mapSideOf(keyPoint) === "against" ? draft.againstIds : draft.forIds).push(keyPoint.keyPointId);
  const drafts: MapAnswerDraft[] = [];

  if (input.reply === null) {
    marks.push(Object.freeze({ mark: "MAP_CHOOSE_FALLBACK", step: "CHOOSE", detail: "choose reply missing" }));
    mapRankMergedAnswers(input.mergedAnswers).slice(0, Math.max(1, input.maxAnswers)).forEach((answer, index) => {
      drafts.push({ answerId: `a${String(index + 1)}`, statement: answer.answer, forIds: [], againstIds: [], rival: null, filled: false });
    });
    if (drafts.length > 0) {
      ranked.forEach((keyPoint, index) => {
        const draft = drafts[index % drafts.length]!;
        if (draft.forIds.length + draft.againstIds.length < input.pointsPerAnswer) place(draft, keyPoint);
      });
    }
  } else {
    for (const answer of input.reply.answers.slice(0, input.maxAnswers)) {
      if (drafts.some((draft) => mapNormaliseText(draft.statement) === mapNormaliseText(answer.statement))) continue;
      drafts.push({ answerId: answer.answer_id, statement: answer.statement, forIds: [...answer.for], againstIds: [...answer.against],
        rival: answer.strongest_rival, filled: false });
    }
  }

  // Distinct answers (spec §1.1): at least two.
  while (drafts.length < MAP_LIMITS.chooseDistinctAnswersMin) {
    const taken = new Set(drafts.map((draft) => mapNormaliseText(draft.statement)));
    const fromMap = mapRankMergedAnswers(input.mergedAnswers).find((answer) => !taken.has(mapNormaliseText(answer.answer)));
    const fromOpposite = input.items.find((item): item is MapAnswerItem => item.kind === "ANSWER"
      && item.angleKind === "OPPOSITE_CASE" && !taken.has(mapNormaliseText(item.answer)));
    const first = drafts[0];
    const [statement, source]: readonly [string, string] = fromMap !== undefined ? [fromMap.answer, "MAP_CANDIDATE"]
      : fromOpposite !== undefined ? [fromOpposite.answer, "OPPOSITE_CASE_LIST"]
        : [mapOppositeTemplate(first?.statement ?? "", input.languageTag), "TEMPLATE"];
    drafts.push({ answerId: `filled-${String(drafts.length + 1)}`, statement, forIds: [], againstIds: [], rival: first?.answerId ?? null, filled: true });
    marks.push(Object.freeze({ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: source }));
  }

  // Quotas over the whole chosen set (spec §1.1, as ruled 2026-10-12).
  const chosenIds = () => new Set(drafts.flatMap((draft) => [...draft.forIds, ...draft.againstIds]));
  const quota = (name: string, eligible: (keyPoint: MapKeyPoint) => boolean) => {
    const chosen = chosenIds();
    if ([...chosen].some((id) => { const keyPoint = byId.get(id); return keyPoint !== undefined && eligible(keyPoint); })) return;
    const pick = ranked.find((keyPoint) => eligible(keyPoint) && !chosen.has(keyPoint.keyPointId));
    if (pick === undefined) return;
    const target = [...drafts].sort((a, b) => (a.forIds.length + a.againstIds.length) - (b.forIds.length + b.againstIds.length))[0]!;
    place(target, pick);
    marks.push(Object.freeze({ mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: `${name}:${pick.keyPointId}` }));
  };
  // "Raised by exactly one AI", blind and gap makers counted together (a shown item is not an independent raising).
  quota("SINGLE_AI", (keyPoint) => new Set([...keyPoint.blindMakers, ...keyPoint.gapMakers]).size === 1);
  quota("OPPOSITE_CASE", (keyPoint) => keyPoint.fixedAngleKinds.includes("OPPOSITE_CASE"));
  quota("ASKER_WORRY", (keyPoint) => keyPoint.fixedAngleKinds.includes("ASKER_WORRY"));

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
