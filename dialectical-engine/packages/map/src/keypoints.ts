import { TypedDomainError } from "@debateai/kernel";
import { mapItemsById, mapKeyPoint, mapMergedAnswer } from "./items.js";
import type { MapMergeReply, MapMergeReplyV2 } from "./replies.js";
import { mapNormaliseText } from "./text.js";
import type { MapAnswerItem, MapItem, MapKeyPoint, MapMergedAnswer, MapPointItem } from "./types.js";

/** The merged map: key points and merged candidate answers, each with its member items and who raised it. */
export type MapMergedMap = Readonly<{ keyPoints: readonly MapKeyPoint[]; mergedAnswers: readonly MapMergedAnswer[] }>;

const mapKeyPointId = (n: number): string => `kp${String(n).padStart(2, "0")}`;
const mapAnswerGroupId = (n: number): string => `an${String(n).padStart(2, "0")}`;

function mapGroupByText<T extends MapItem>(items: readonly T[], text: (item: T) => string): readonly (readonly T[])[] {
  // An item whose text normalises to nothing (only signs, no letters or digits) matches nothing: it is its own group.
  const groups = new Map<string | symbol, T[]>();
  for (const item of [...items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
    const normalised = mapNormaliseText(text(item));
    const key = normalised === "" ? Symbol(item.itemId) : normalised;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return [...groups.values()];
}

const mapPoints = (items: readonly MapItem[]) => items.filter((item): item is MapPointItem => item.kind === "POINT");
const mapAnswers = (items: readonly MapItem[]) => items.filter((item): item is MapAnswerItem => item.kind === "ANSWER");

function mapAnswerGroups(items: readonly MapItem[]): MapMergedAnswer[] {
  const byId = mapItemsById(items);
  return mapGroupByText(mapAnswers(items), (item) => item.answer).map((group, index) =>
    mapMergedAnswer(mapAnswerGroupId(index + 1), group[0]!.answer, group.map((item) => item.itemId), byId));
}

/** MAP_MERGE_FALLBACK (spec §1.2): identical claims after normalisation group; everything else stays its own point. */
export function mapCodeMerge(items: readonly MapItem[]): MapMergedMap {
  const byId = mapItemsById(items);
  const keyPoints = mapGroupByText(mapPoints(items), (item) => item.claim).map((group, index) =>
    mapKeyPoint(mapKeyPointId(index + 1), group[0]!.claim, group.map((item) => item.itemId), byId));
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mapAnswerGroups(items)) });
}

/**
 * The merge AI's groups (already checked: known ids, each once). Its group ids are replaced by kp01.. / an01.. in its
 * order; an item it left out is kept as its own key point or answer (nothing is lost), listed in `omittedItemIds`.
 * Ruling T7-PRIV: nothing the merger named survives as an id. Its key_point_id and answer_id stay in its raw reply only,
 * and a member id that is not one of the items is dropped (the check refuses one; this holds for any reply).
 */
export function mapApplyMerge(reply: MapMergeReply | MapMergeReplyV2, items: readonly MapItem[]):
  MapMergedMap & Readonly<{ omittedItemIds: readonly string[] }> {
  const byId = mapItemsById(items);
  const used = new Set<string>();
  const members = (ids: readonly string[]): readonly string[] => {
    const known = ids.filter((id) => byId.has(id));
    for (const id of known) used.add(id);
    return known;
  };
  const keyPoints: MapKeyPoint[] = reply.key_points.map((group, index) =>
    mapKeyPoint(mapKeyPointId(index + 1), group.claim, members(group.member_item_ids), byId,
      "rests_on" in group ? group.rests_on : undefined));
  const mergedAnswers: MapMergedAnswer[] = reply.answers.map((group, index) =>
    mapMergedAnswer(mapAnswerGroupId(index + 1), group.answer, members(group.member_item_ids), byId));
  const omitted = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId)).filter((item) => !used.has(item.itemId));
  for (const item of omitted) {
    if (item.kind === "POINT") keyPoints.push(mapKeyPoint(mapKeyPointId(keyPoints.length + 1), item.claim, [item.itemId], byId));
    else mergedAnswers.push(mapMergedAnswer(mapAnswerGroupId(mergedAnswers.length + 1), item.answer, [item.itemId], byId));
  }
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mergedAnswers),
    omittedItemIds: Object.freeze(omitted.map((item) => item.itemId)) });
}

/** Arm A (snowball): each AI added only new points, so every point is its own key point; answers group by text. */
export function mapSingletonMap(items: readonly MapItem[]): MapMergedMap {
  const byId = mapItemsById(items);
  const keyPoints = [...mapPoints(items)].sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((item, index) => mapKeyPoint(mapKeyPointId(index + 1), item.claim, [item.itemId], byId));
  return Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: Object.freeze(mapAnswerGroups(items)) });
}

/**
 * A gap round's points (origin GAP): one that restates a key point (normalised claim equal to the key point's or to
 * one of its members') joins it as a gap member; any other becomes a new key point. `newKeyPoints` is what the stop
 * rule reads (spec §1.1: a round that adds fewer than 2 new points ends the gap rounds).
 */
export function mapAddGapPoints(current: MapMergedMap, items: readonly MapItem[], gapItems: readonly MapPointItem[]):
  Readonly<{ map: MapMergedMap; newKeyPoints: number }> {
  const byId = mapItemsById(items);
  for (const item of gapItems) {
    const known = byId.get(item.itemId);
    if (known === undefined || known.kind !== "POINT" || known.origin !== "GAP") {
      throw new TypedDomainError("MAP_GAP_ITEM_UNKNOWN", `MAP_GAP_ITEM_UNKNOWN: ${item.itemId}`);
    }
  }
  const keyPoints = [...current.keyPoints];
  let created = 0;
  for (const item of gapItems) {
    const key = mapNormaliseText(item.claim);
    // A claim that normalises to nothing matches nothing: it becomes its own key point.
    const at = key === "" ? -1 : keyPoints.findIndex((keyPoint) => mapNormaliseText(keyPoint.claim) === key
      || keyPoint.memberItemIds.some((id) => {
        const member = byId.get(id);
        return member?.kind === "POINT" && mapNormaliseText(member.claim) === key;
      }));
    if (at >= 0) {
      const keyPoint = keyPoints[at]!;
      // The join keeps the merger's word; the members' own (a gap point's included) are added by mapGroupRestsOn.
      keyPoints[at] = mapKeyPoint(keyPoint.keyPointId, keyPoint.claim, [...keyPoint.memberItemIds, item.itemId], byId, keyPoint.restsOn);
    } else {
      created += 1;
      keyPoints.push(mapKeyPoint(mapKeyPointId(keyPoints.length + 1), item.claim, [item.itemId], byId));
    }
  }
  return Object.freeze({ map: Object.freeze({ keyPoints: Object.freeze(keyPoints), mergedAnswers: current.mergedAnswers }), newKeyPoints: created });
}
