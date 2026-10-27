import type { ContractClient } from "@debateai/contract";
import { contractClient } from "../api.js";
import type { MessageCatalog } from "../i18n/translate.js";
import { ownWords, parseDigQuestion, sameQuestionText } from "./askText.js";
import { uniqueOpenQuestions } from "./mapModel.js";
import type { DigLink, V4Map } from "./types.js";

/*
 * V4 initial, fix wave 1 (Decision A): the API has no link between a dig and the debate it came from, and V4 stores
 * nothing in the browser. So digs are found again from the signed-in account's own question list (GET /v1/answers:
 * answers and open runs, both asker-scoped), by text: a dig's question_line names its parent's own words on its first
 * added line (askText.digQuestion / parseDigQuestion).
 */

export type IndexEntry = Readonly<{ runId: string; questionLine: string; createdAtSequence: number }>;

/** GET /v1/answers allows 1..128 (MAX_OWNER_PRIVATE_HISTORY_SCAN). */
const INDEX_LIMIT_MAX = 128;
const INDEX_LIMIT_DEFAULT = 100;

/**
 * The account's questions, newest first: served answers and open runs together, one entry per run (the newest row wins
 * when a run has several answer versions). A failed read is the caller's to handle (it throws).
 */
export async function readQuestionIndex(
  client: Pick<ContractClient, "readAnswerIndex"> = contractClient,
  limit: number = INDEX_LIMIT_DEFAULT
): Promise<readonly IndexEntry[]> {
  const asked = Number.isFinite(limit) ? Math.min(INDEX_LIMIT_MAX, Math.max(1, Math.floor(limit))) : INDEX_LIMIT_DEFAULT;
  const index = await client.readAnswerIndex(asked, 0);
  const rows: IndexEntry[] = [
    ...index.items.map((item) => ({ runId: item.run_ref, questionLine: item.question_line, createdAtSequence: item.created_at_sequence })),
    ...index.open_runs.map((run) => ({ runId: run.run_ref, questionLine: run.question_line, createdAtSequence: run.created_at_sequence }))
  ];
  const byRun = new Map<string, IndexEntry>();
  for (const row of rows) {
    const known = byRun.get(row.runId);
    if (known === undefined || row.createdAtSequence > known.createdAtSequence) byRun.set(row.runId, Object.freeze(row));
  }
  return Object.freeze([...byRun.values()].sort((a, b) => b.createdAtSequence - a.createdAtSequence));
}

/** Where one dig item hangs on the parent's map: an open question's id, a path ("path:<id>"), or nowhere (null). */
function placeOf(item: string, map: V4Map | null): string | null {
  if (map === null) return null;
  const open = uniqueOpenQuestions(map).find((question) => sameQuestionText(item, question.text));
  if (open !== undefined) return open.id;
  const path = map.paths.find((candidate) => sameQuestionText(item, candidate.line));
  return path === undefined ? null : `path:${path.id}`;
}

/**
 * The digs of this debate found in the account's list, oldest first (the order they were started). An entry is a dig of
 * this parent when its first added line names the parent's own words. Each item is placed on the map by text; an item
 * that matches nothing keeps no id, so the dig hangs under the question itself. Mode and start time are unknown here.
 */
export function digLinksFor(
  parentRunId: string,
  parentQuestionLine: string,
  map: V4Map | null,
  index: readonly IndexEntry[],
  catalog: MessageCatalog
): readonly DigLink[] {
  const parent = ownWords(parentQuestionLine);
  if (parent.length === 0) return [];
  const links: DigLink[] = [];
  const seen = new Set<string>();
  for (const entry of [...index].reverse()) {
    if (entry.runId === parentRunId || seen.has(entry.runId)) continue;
    const dig = parseDigQuestion(entry.questionLine, catalog);
    if (dig === null || !sameQuestionText(dig.parentQuestion, parent)) continue;
    seen.add(entry.runId);
    const ids: string[] = [];
    for (const item of dig.items) {
      const id = placeOf(item, map);
      if (id !== null && !ids.includes(id)) ids.push(id);
    }
    links.push(Object.freeze({
      parentRunId,
      childRunId: entry.runId,
      openQuestionIds: Object.freeze(ids),
      questions: dig.items,
      mode: null,
      startedAt: null
    }));
  }
  return Object.freeze(links);
}

/** The debate this one was dug from: the newest entry whose own words are the ones the dig names. null when not a dig. */
export function digParentOf(childQuestionLine: string, index: readonly IndexEntry[], catalog: MessageCatalog): IndexEntry | null {
  const dig = parseDigQuestion(childQuestionLine, catalog);
  if (dig === null) return null;
  const child = childQuestionLine.trim();
  for (const entry of index) {
    if (entry.questionLine.trim() === child) continue;
    if (sameQuestionText(dig.parentQuestion, ownWords(entry.questionLine))) return entry;
  }
  return null;
}
