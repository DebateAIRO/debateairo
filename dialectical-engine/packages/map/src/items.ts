import { createHash } from "node:crypto";
import { mapNamesInternalWord } from "./internal-words.js";
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

export function mapKeyPoint(keyPointId: string, claim: string, memberItemIds: readonly string[],
  itemsById: ReadonlyMap<string, MapItem>): MapKeyPoint {
  const members = memberItemIds.map((id) => itemsById.get(id)).filter((item): item is MapItem => item !== undefined);
  const points = members.filter((item): item is MapPointItem => item.kind === "POINT");
  const against = points.filter((item) => item.leans === "against_some_answer").length;
  const support = points.filter((item) => item.leans === "for_some_answer").length;
  return Object.freeze({
    keyPointId,
    claim,
    memberItemIds: Object.freeze([...memberItemIds]),
    ...mapRaisedBy(memberItemIds, itemsById),
    fixedAngleKinds: Object.freeze(MAP_FIXED_ANGLE_KINDS.filter((kind) => members.some((item) => item.angleKind === kind))),
    leansAgainst: against > support
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
export type MapAlsoRaisedEntry = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;

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
export function mapMergeAlsoRaised<T extends Readonly<{ claim: string; makers: readonly string[] }>>(entries: readonly T[]): readonly T[] {
  const merged = new Map<string, { first: T; claim: string; makers: Set<string>; order: number }>();
  for (const [order, entry] of entries.entries()) {
    const claim = entry.claim.trim();
    if (claim === "" || mapNamesInternalWord(claim)) continue;
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
}>): readonly MapAlsoRaisedEntry[] {
  if (input.choice === null) return Object.freeze([]);
  const argued = Math.max(0, Math.trunc(input.arguedAnswers));
  const byId = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
  const pointsOf = (answer: MapChoice["answers"][number]): readonly string[] => [...answer.forKeyPointIds, ...answer.againstKeyPointIds];
  const arguedPoints = new Set(input.choice.answers.slice(0, argued).flatMap(pointsOf));
  const cut = input.choice.answers.slice(argued);
  const makersOf = (statement: string): readonly string[] => {
    const key = mapNormaliseText(statement);
    return key === "" ? [] : [...new Set(input.mergedAnswers.filter((answer) => mapNormaliseText(answer.answer) === key)
      .flatMap((answer) => answer.makers))];
  };
  const answers = cut.filter((answer) => !answer.filled)
    .map((answer): MapAlsoRaisedEntry => ({ keyPointId: answer.answerId, claim: answer.statement, makers: makersOf(answer.statement) }));
  const pointIds = [...new Set([...cut.flatMap(pointsOf).filter((id) => !arguedPoints.has(id)), ...input.choice.alsoRaised])];
  const points = mapRankKeyPoints(pointIds.flatMap((id) => byId.get(id) ?? []))
    .map((keyPoint): MapAlsoRaisedEntry => ({ keyPointId: keyPoint.keyPointId, claim: keyPoint.claim, makers: keyPoint.makers }));
  return mapMergeAlsoRaised([...answers, ...points]);
}
