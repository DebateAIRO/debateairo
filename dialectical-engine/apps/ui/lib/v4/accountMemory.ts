import {
  ACCOUNT_MEMORY_LIMITS,
  DIG_PLACE_PATTERN,
  VISIT_ITEM_ID_PATTERN,
  VISIT_WORD_PATTERN,
  VisitItemsSchema,
  type ContractClient,
  type DigLinkRecord,
  type DigLinks
} from "@debateai/contract";
import { contractClient } from "../api.js";
import { findOpenQuestion, findPath } from "./mapModel.js";
import { READING_LEVELS, type DigLink, type ReadingLevel, type SeenSnapshot, type V4Map } from "./types.js";

/*
 * V4 account memory (owner rulings N7 and N11, 2026-10-29; migration 0130): what the V4 pages keep in the person's
 * ACCOUNT, never in the browser — the reading level, the last visit of each debate ("since your last visit") and the link
 * of each dig to the debate it came from. Reads throw, so a page can tell "nothing saved yet" from "could not read" and
 * fall back to what it did before this memory existed; writes are best-effort and never throw (a page never waits on
 * one, and a failed write only means the next visit remembers less).
 */

type LevelClient = Pick<ContractClient, "readReadingLevel" | "saveReadingLevel">;
type VisitClient = Pick<ContractClient, "readLastVisit" | "recordLastVisit">;
type DigClient = Pick<ContractClient, "readDigLinks" | "recordDigLink">;

/** Runs a client call so that one throwing at once (a body the contract refuses) is a failed promise, never a crash. */
function attempt<T>(call: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(call);
}

/** The account's reading level, or null before the person first chooses. Throws when it cannot be read. */
export async function readAccountLevel(client: LevelClient = contractClient): Promise<ReadingLevel | null> {
  const state = await attempt(() => client.readReadingLevel());
  // Checked here rather than through storage.ts, which re-exports the hook that imports this module.
  const level = state.reading_level;
  return level !== null && (READING_LEVELS as readonly string[]).includes(level) ? level : null;
}

/** Saves the level to the account. Best-effort: true when saved, false otherwise; never throws. */
export async function saveAccountLevel(level: ReadingLevel, client: LevelClient = contractClient): Promise<boolean> {
  try {
    await attempt(() => client.saveReadingLevel(level));
    return true;
  } catch {
    return false;
  }
}

/**
 * The part of a map snapshot the account can keep: entries whose id and word fit 0130's shape. The same filter is used
 * on the snapshot compared with the kept one, so an item that can never be kept is never reported as new.
 */
export function storableItems(items: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(items)
    .filter(([id, word]) => VISIT_ITEM_ID_PATTERN.test(id) && VISIT_WORD_PATTERN.test(word))));
}

/** The map as the person last saw it on any device, or null before a first visit. Throws when it cannot be read. */
export async function readLastVisit(runId: string, client: VisitClient = contractClient): Promise<SeenSnapshot | null> {
  const visit = await attempt(() => client.readLastVisit(runId));
  return visit.seen_at === null || visit.items === null ? null : Object.freeze({ at: visit.seen_at, items: Object.freeze({ ...visit.items }) });
}

/**
 * Keeps what the map shows now as this debate's last visit. Best-effort and never throws: false when the snapshot does not
 * fit the account's limits (512 entries, 64 KiB; nothing is sent then) or the write failed.
 */
export async function recordLastVisit(runId: string, items: Readonly<Record<string, string>>, client: VisitClient = contractClient): Promise<boolean> {
  const kept = storableItems(items);
  if (!VisitItemsSchema.safeParse(kept).success) return false;
  try {
    await attempt(() => client.recordLastVisit(runId, { ...kept }));
    return true;
  } catch {
    return false;
  }
}

/** The dig records around one debate: the link it was dug by (or null) and the digs made from it. Throws when unread. */
export async function readDigRecords(runId: string, client: DigClient = contractClient): Promise<DigLinks> {
  return attempt(() => client.readDigLinks(runId));
}

/**
 * Records a dig just started (N11): its parent, the places it was dug from and its mode. Places the account cannot keep
 * are left out (the dig then hangs under the question, as a dig found by text does). Best-effort and never throws.
 */
export async function recordDig(link: DigLink, client: DigClient = contractClient): Promise<boolean> {
  if (link.mode === null) return false;
  const places = link.openQuestionIds.filter((place) => DIG_PLACE_PATTERN.test(place)).slice(0, ACCOUNT_MEMORY_LIMITS.digPlacesMax);
  try {
    await attempt(() => client.recordDigLink(link.parentRunId, { child_run_id: link.childRunId, places, mode: link.mode! }));
    return true;
  } catch {
    return false;
  }
}

/** What the map shows at the places a dig names (an open question's text, a path's line), in order; unknown places add nothing. */
export function questionsAtPlaces(places: readonly string[], map: V4Map | null): readonly string[] {
  if (map === null) return Object.freeze([]);
  const texts: string[] = [];
  for (const place of places) {
    const text = place.startsWith("path:") ? findPath(map, place.slice("path:".length))?.line : findOpenQuestion(map, place)?.text;
    if (text !== undefined && text.trim().length > 0) texts.push(text);
  }
  return Object.freeze(texts);
}

/** One recorded dig as the map shows it; the questions are the ones its text gives, else the map's own at its places. */
function linkOfRecord(record: DigLinkRecord, byText: DigLink | undefined, map: V4Map | null): DigLink {
  const fromMap = questionsAtPlaces(record.places, map);
  return Object.freeze({
    parentRunId: record.parent_run_id,
    childRunId: record.child_run_id,
    openQuestionIds: Object.freeze([...record.places]),
    questions: byText !== undefined && byText.questions.length > 0 ? byText.questions : fromMap,
    mode: record.mode,
    startedAt: record.created_at
  });
}

/**
 * The digs of a debate (N11): its dig records first decide which debates are its digs, where they hang and their mode
 * and start; the digs found by text (lib/v4/digIndex.ts) stay only for digs without a record — made before the records
 * existed, so older, and listed first. A dig found both ways takes the record's link and the text's questions.
 */
export function mergeDigLinks(records: DigLinks | null, byText: readonly DigLink[], map: V4Map | null): readonly DigLink[] {
  if (records === null) return byText;
  const textByChild = new Map(byText.map((link) => [link.childRunId, link]));
  const recorded = new Set(records.children.map((record) => record.child_run_id));
  return Object.freeze([
    ...byText.filter((link) => !recorded.has(link.childRunId)),
    ...records.children.map((record) => linkOfRecord(record, textByChild.get(record.child_run_id), map))
  ]);
}
