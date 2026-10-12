import { createHash } from "node:crypto";
import {
  MAP_FIXED_ANGLE_KINDS,
  type MapAngleKind,
  type MapItem,
  type MapItemOrigin,
  type MapKeyPoint,
  type MapLean,
  type MapMergedAnswer,
  type MapPointItem,
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
  | (MapDraftBase & Readonly<{ kind: "POINT"; claim: string; whyItMatters: string; leans: MapLean }>)
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
        whyItMatters: draft.whyItMatters, leans: draft.leans }));
    } else {
      answers += 1;
      out.push(Object.freeze({ ...base, itemId: mapItemLabel("ca", answers), kind: "ANSWER" as const, answer: draft.answer }));
    }
  }
  return Object.freeze(out);
}

export function mapItemsById(items: readonly MapItem[]): ReadonlyMap<string, MapItem> {
  return new Map(items.map((item) => [item.itemId, item] as const));
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
