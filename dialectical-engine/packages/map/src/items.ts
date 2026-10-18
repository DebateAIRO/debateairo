import { createHash } from "node:crypto";
import { MAP_INTERNAL_FIELD_NAMES, mapNamesInternalWord } from "./internal-words.js";
import { mapNormaliseText } from "./text.js";
import {
  MAP_FIXED_ANGLE_KINDS,
  type MapAngleKind,
  type MapChoice,
  type MapItem,
  type MapItemOrigin,
  type MapKeyPoint,
  type MapLean,
  type MapMergedAnswer,
  type MapPointItem,
  type MapRestsOn,
  type MapSeat
} from "./types.js";

type MapDraftBase = Readonly<{
  seat: MapSeat;
  origin: MapItemOrigin;
  angleId: string | null;
  angleKind: MapAngleKind | null;
  listIndex: number;
  /** Its place in its own list. */
  position: number;
}>;

/** An item before it has an id: what one list (or gap round) said, with who said it. */
export type MapItemDraft =
  | (MapDraftBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean; restsOn?: MapRestsOn }>)
  | (MapDraftBase & Readonly<{ kind: "ANSWER"; answer: string }>);

function mapItemLabel(prefix: "pt" | "ca", n: number): string {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/** How many points and answers are numbered so far (the next ids continue from here). */
export function mapNextItemNumbers(items: readonly MapItem[]): Readonly<{ points: number; answers: number }> {
  return Object.freeze({
    points: items.filter((item) => item.kind === "POINT").length,
    answers: items.filter((item) => item.kind === "ANSWER").length
  });
}

/**
 * Opaque ids (spec §1.1, "every item with an opaque item id; never who wrote it"). The drafts are put in a fixed
 * pseudo-random order by a digest of the seed and each draft's place, then numbered: points pt01.., answers ca01...
 * The same seed always gives the same ids; the numbering does not follow the lists, so an id says nothing about its
 * author. Short on purpose: the practice report blanks any 32+ character id-like run.
 */
export function mapAssignItemIds(drafts: readonly MapItemDraft[], seed: string,
  after: Readonly<{ points: number; answers: number }> = { points: 0, answers: 0 }): readonly MapItem[] {
  const keyed = drafts.map((draft) => ({
    draft,
    key: createHash("sha256").update(`${seed}|${String(draft.listIndex)}|${draft.kind}|${String(draft.position)}|${draft.seat.aiRef}`).digest("hex")
  }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let points = after.points;
  let answers = after.answers;
  const out: MapItem[] = [];
  for (const { draft } of keyed) {
    const base = { seat: draft.seat, origin: draft.origin, angleId: draft.angleId, angleKind: draft.angleKind, listIndex: draft.listIndex };
    if (draft.kind === "POINT") {
      points += 1;
      out.push(Object.freeze({ ...base, itemId: mapItemLabel("pt", points), kind: "POINT" as const, claim: draft.claim,
        whyItMatters: draft.whyItMatters, leans: draft.leans,
        // Engine 2 only (P2.2): never written as undefined, so an engine-1 item keeps today's keys.
        ...(draft.restsOn === undefined ? {} : { restsOn: draft.restsOn }) }));
    } else {
      answers += 1;
      out.push(Object.freeze({ ...base, itemId: mapItemLabel("ca", answers), kind: "ANSWER" as const, answer: draft.answer }));
    }
  }
  return Object.freeze(out);
}

/**
 * Items by id. An id given twice is refused, never overwritten: a repeated id would make who-raised-what silently wrong
 * (every merge, count and choice reads items through this map).
 */
export function mapItemsById(items: readonly MapItem[]): ReadonlyMap<string, MapItem> {
  const byId = new Map<string, MapItem>();
  for (const item of items) {
    if (byId.has(item.itemId)) throw new TypeError("MAP_ITEM_ID_DUPLICATE");
    byId.set(item.itemId, item);
  }
  return byId;
}

/**
 * Who raised a group of items, by maker, computed by code from the items alone (spec §1.1, "the merge AI never
 * counts"). Blind items and gap items are kept apart; a shown (snowball) item counts only among all makers.
 */
export function mapRaisedBy(memberItemIds: readonly string[], itemsById: ReadonlyMap<string, MapItem>):
  Readonly<{ blindMakers: readonly string[]; gapMakers: readonly string[]; makers: readonly string[] }> {
  const blind = new Set<string>();
  const gap = new Set<string>();
  const all = new Set<string>();
  for (const id of memberItemIds) {
    const item = itemsById.get(id);
    if (item === undefined) continue;
    all.add(item.seat.maker);
    if (item.origin === "BLIND") blind.add(item.seat.maker);
    if (item.origin === "GAP") gap.add(item.seat.maker);
  }
  return Object.freeze({
    blindMakers: Object.freeze([...blind].sort()),
    gapMakers: Object.freeze([...gap].sort()),
    makers: Object.freeze([...all].sort())
  });
}

/**
 * P2.2's code merge rule (spec 2026-10-15 §5.2 item 2): a group is an assumption when any member (or the merger) says
 * so; a question when every member that says anything says question; nothing when nobody said (engine 1).
 */
export function mapGroupRestsOn(members: readonly (MapRestsOn | undefined)[], named?: MapRestsOn): MapRestsOn | undefined {
  const all = named === undefined ? members : [...members, named];
  if (all.includes("assumption")) return "assumption";
  return all.includes("question") ? "question" : undefined;
}

export function mapKeyPoint(keyPointId: string, claim: string, memberItemIds: readonly string[],
  itemsById: ReadonlyMap<string, MapItem>, named?: MapRestsOn): MapKeyPoint {
  const members = memberItemIds.map((id) => itemsById.get(id)).filter((item): item is MapItem => item !== undefined);
  const points = members.filter((item): item is MapPointItem => item.kind === "POINT");
  const against = points.filter((item) => item.leans === "against_some_answer").length;
  const support = points.filter((item) => item.leans === "for_some_answer").length;
  const restsOn = mapGroupRestsOn(points.map((item) => item.restsOn), named);
  return Object.freeze({
    keyPointId,
    claim,
    memberItemIds: Object.freeze([...memberItemIds]),
    ...mapRaisedBy(memberItemIds, itemsById),
    fixedAngleKinds: Object.freeze(MAP_FIXED_ANGLE_KINDS.filter((kind) => members.some((item) => item.angleKind === kind))),
    leansAgainst: against > support,
    // Engine 2 only: never written as undefined, so an engine-1 key point keeps today's keys (and the stored map its bytes).
    ...(restsOn === undefined ? {} : { restsOn })
  });
}

export function mapMergedAnswer(answerId: string, answer: string, memberItemIds: readonly string[],
  itemsById: ReadonlyMap<string, MapItem>): MapMergedAnswer {
  const raised = mapRaisedBy(memberItemIds, itemsById);
  return Object.freeze({
    answerId,
    answer,
    memberItemIds: Object.freeze([...memberItemIds]),
    blindMakers: raised.blindMakers,
    makers: raised.makers,
    fromOppositeCase: memberItemIds.some((id) => itemsById.get(id)?.angleKind === "OPPOSITE_CASE")
  });
}

/** Most raised first: distinct blind makers, then all makers, then members, then id (a fixed order). */
export function mapRankKeyPoints(keyPoints: readonly MapKeyPoint[]): readonly MapKeyPoint[] {
  return Object.freeze([...keyPoints].sort((a, b) => b.blindMakers.length - a.blindMakers.length
    || b.makers.length - a.makers.length || b.memberItemIds.length - a.memberItemIds.length
    || a.keyPointId.localeCompare(b.keyPointId)));
}

export function mapRankMergedAnswers(answers: readonly MapMergedAnswer[]): readonly MapMergedAnswer[] {
  return Object.freeze([...answers].sort((a, b) => b.blindMakers.length - a.blindMakers.length
    || b.makers.length - a.makers.length || b.memberItemIds.length - a.memberItemIds.length
    || a.answerId.localeCompare(b.answerId)));
}

/** One "also raised, not debated" entry: its claim, the distinct makers who raised it, and the key point (or chosen answer) it is. */
export type MapAlsoRaisedEntry = Readonly<{ keyPointId: string; claim: string; makers: readonly string[];
  /** Engine 2 only (INTERFACE §10.7): "ANSWER" for an answer raised and not debated; absent = a point. */
  kind?: "POINT" | "ANSWER";
  /**
   * Engine 2 only (P2.2; ruling R3-T5.1): a point's key point label, what it rests on; absent for engine 1 and for an
   * answer, except an answer listed in the same words as a labelled point (R3 final wave P9): the one entry keeps the
   * point's label, an assumption winning, so an assumption stays labelled all the way through.
   */
  restsOn?: MapRestsOn }>;

/** Two spellings of one claim (case, spacing, Unicode form) are one claim. */
const alsoRaisedClaimKey = (claim: string): string => claim.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

/**
 * Whole-branch review m-4: THE one rule for what "also raised, not debated" lists, used by the story (the runner's
 * story snapshot) and by the debate page (the stored map choice, then the API's map view) alike. Blank claims are left
 * out, and so is a claim that names one of the map's internal fields or an item id (`mapNamesInternalWord`; practice
 * 2026-10-15: "… nu e analizată de angle_focus, …"): it is skipped whole, never edited. Claims that say the same are one
 * entry, their makers joined; most-raised (distinct makers, at least one) first, ties in the order given. Running it
 * again on its own output changes nothing. Applied again when the API reads a stored list, so a row stored before this
 * rule is cleaned on the page too.
 */
export function mapMergeAlsoRaised<T extends Readonly<{ claim: string; makers: readonly string[] }>>(entries: readonly T[],
  names: readonly string[] = MAP_INTERNAL_FIELD_NAMES): readonly T[] {
  const merged = new Map<string, { first: T; claim: string; makers: Set<string>; order: number }>();
  for (const [order, entry] of entries.entries()) {
    const claim = entry.claim.trim();
    if (claim === "" || mapNamesInternalWord(claim, names)) continue;
    const key = alsoRaisedClaimKey(claim);
    const known = merged.get(key);
    if (known === undefined) merged.set(key, { first: entry, claim, makers: new Set(entry.makers), order });
    else for (const maker of entry.makers) known.makers.add(maker);
  }
  const raisedBy = (makers: ReadonlySet<string>): number => Math.max(1, makers.size);
  return Object.freeze([...merged.values()]
    .sort((left, right) => raisedBy(right.makers) - raisedBy(left.makers) || left.order - right.order)
    .map((entry) => Object.freeze({ ...entry.first, claim: entry.claim, makers: Object.freeze([...entry.makers]) })));
}

/**
 * Engine 2's members of `mapAlsoRaisedOf`, all or none (Task 9 fix round 1): the flag switches three behaviours, so it
 * cannot be set without engine 2's word list, and engine 1 can pass none of them.
 */
type MapAlsoRaisedEngine =
  | Readonly<{ unchosenAnswers?: false; checkFailed?: never; checkFailedMergedAnswerIds?: never; internalNames?: never }>
  | Readonly<{
    /** Engine 2 (spec §5.2 item 8): also list unchosen merged answers some AI raised blind (never a code-filled one). */
    unchosenAnswers: true;
    /** Engine 2 (deviation 8): words the answer check failed (`mapCheckFailedStatements`), never listed. */
    checkFailed?: readonly string[];
    /** Ruling R3-T9.1 (deviation 8 by id): merged answers behind failed answers (`mapCheckFailedMergedAnswerIds`), never listed. */
    checkFailedMergedAnswerIds?: readonly string[];
    /** Engine 2: the internal words the skip reads (MAP_ENGINE_INTERNAL_FIELD_NAMES); required with the flag. */
    internalNames: readonly string[];
  }>;

/**
 * Whole-branch review m-3, ruling W-CUT: what a map run lists as "also raised, not debated", once `arguedAnswers` of
 * the chosen answers are argued. A chosen answer past that count (a maker sat out after the map chose) was raised and
 * never debated, so it is listed, with the key points only such answers took, beside the choice's own also-raised
 * points. A filled answer (added by code to reach two) is never listed: no AI raised it. Merged by mapMergeAlsoRaised.
 * The makers of a listed answer are those of the merged answers that say the same.
 */
export function mapAlsoRaisedOf(input: Readonly<{
  choice: MapChoice | null;
  keyPoints: readonly MapKeyPoint[];
  mergedAnswers: readonly MapMergedAnswer[];
  arguedAnswers: number;
} & MapAlsoRaisedEngine>): readonly MapAlsoRaisedEntry[] {
  if (input.choice === null) return Object.freeze([]);
  const engine = input.unchosenAnswers === true;
  const argued = Math.max(0, Math.trunc(input.arguedAnswers));
  const byId = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  // Ruling W1: engine 2's code-chosen, filled and replacement answers hold their points unsided in pointsRaised (absent on engine 1).
  const pointsOf = (answer: MapChoice["answers"][number]): readonly string[] =>
    [...answer.forKeyPointIds, ...answer.againstKeyPointIds, ...(answer.pointsRaised ?? [])];
  const arguedPoints = new Set(input.choice.answers.slice(0, argued).flatMap(pointsOf));
  const cut = input.choice.answers.slice(argued);
  const makersOf = (statement: string): readonly string[] => {
    const key = mapNormaliseText(statement);
    return key === "" ? [] : [...new Set(input.mergedAnswers.filter((answer) => mapNormaliseText(answer.answer) === key)
      .flatMap((answer) => answer.makers))];
  };
  // R3 final wave P9 (Task 9 O1): a cut answer that reuses a merged answer (engine 2's mergedAnswerId, maybe reworded) is
  // raised by that answer's makers too, not only by the merged answers in the same words. Absent on engine 1.
  const makersOfAnswer = (answer: MapChoice["answers"][number]): readonly string[] => [...new Set([
    ...(answer.mergedAnswerId === undefined ? [] : input.mergedAnswers.filter((merged) => merged.answerId === answer.mergedAnswerId)
      .flatMap((merged) => merged.makers)),
    ...makersOf(answer.statement)])];
  const answers = cut.filter((answer) => !answer.filled)
    .map((answer): MapAlsoRaisedEntry => ({ keyPointId: answer.answerId, claim: answer.statement, makers: makersOfAnswer(answer),
      ...(engine ? { kind: "ANSWER" as const } : {}) }));
  const failed = new Set((input.checkFailed ?? []).map(mapNormaliseText));
  const chosenKeys = new Set(input.choice.answers.map((answer) => mapNormaliseText(answer.statement)));
  // Ruling R3-T9.1: by id first (a chooser may reuse a merged answer in new words), the words as a second guard.
  const leftOut = new Set([...input.choice.answers.flatMap((answer) => (answer.mergedAnswerId === undefined ? [] : [answer.mergedAnswerId])),
    ...(input.checkFailedMergedAnswerIds ?? [])]);
  const unchosen = !engine ? [] : mapRankMergedAnswers(input.mergedAnswers)
    .filter((answer) => answer.blindMakers.length >= 1 && !leftOut.has(answer.answerId))
    .filter((answer) => { const key = mapNormaliseText(answer.answer); return key !== "" && !chosenKeys.has(key) && !failed.has(key); })
    .map((answer): MapAlsoRaisedEntry => ({ keyPointId: answer.answerId, claim: answer.answer, makers: answer.makers, kind: "ANSWER" }));
  const pointIds = [...new Set([...cut.flatMap(pointsOf).filter((id) => !arguedPoints.has(id)), ...input.choice.alsoRaised])];
  const points = mapRankKeyPoints(pointIds.flatMap((id) => byId.get(id) ?? []))
    .map((keyPoint): MapAlsoRaisedEntry => ({ keyPointId: keyPoint.keyPointId, claim: keyPoint.claim, makers: keyPoint.makers,
      // Ruling R3-T5.1 (P2.2 "assumptions stay labelled all the way through"): engine 2 only, never written as undefined.
      ...(engine && keyPoint.restsOn !== undefined ? { restsOn: keyPoint.restsOn } : {}) }));
  const merged = mapMergeAlsoRaised([...answers, ...unchosen, ...points], input.internalNames);
  if (!engine) return merged;
  // R3 final wave P9 (Task 9): an answer and a point in the same words are one entry, the answer's (it comes first); the
  // point's label is kept on it ("assumption" when any same-words point rests on one), never lost by the merge.
  const labels = new Map<string, MapRestsOn>();
  for (const entry of points) {
    if (entry.restsOn === undefined) continue;
    const key = alsoRaisedClaimKey(entry.claim.trim());
    if (labels.get(key) !== "assumption") labels.set(key, entry.restsOn);
  }
  return Object.freeze(merged.map((entry) => {
    const label = labels.get(alsoRaisedClaimKey(entry.claim));
    return label === undefined || entry.restsOn === label ? entry : Object.freeze({ ...entry, restsOn: label });
  }));
}
