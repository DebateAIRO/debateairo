"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, AnswerStory, DigLinks } from "@debateai/contract";
import type { MessageCatalog } from "../i18n/translate.js";
import { mergeDigLinks } from "./accountMemory.js";
import { digQuestion } from "./askText.js";
import { digLinksFor, type IndexEntry } from "./digIndex.js";
import { digRetryOf, type DigRetry } from "./digRetry.js";
import { buildV4Map, storyReadFailed } from "./mapModel.js";
import type { DigLink, DigView } from "./types.js";
import { sentDigOf } from "./useSentDigs.js";

/*
 * V4 start step, Task 76j (the review session's wiring list of 6 Nov, item 12; the owner's third round, 5 Nov, confirmed on
 * 6 Nov): a dig's own failed page says "You can try this dig again from the map." only when the map it was dug from offers
 * that try (V4FailedScreen's `digRetry`). The page reads that map once, as the map itself shows it: its answer and story
 * (its paths and open questions), its digs (the records, the ones found by text, then the ones started in this visit,
 * merged as V4DebateClient merges them), and each dig's own read; then the panel's own rule (lib/v4/digRetry.ts digRetryOf,
 * called as lib/v4/useFailedDigs.ts calls it) says what the map offers. A read that fails, or a map that does not list this
 * dig, gives nothing: the page stays as it was. While the reads are on their way it is as it was too. Nothing is kept in the
 * browser.
 */

export type ParentDigRetryReads = Readonly<{
  loadAnswer: (runId: string) => Promise<Answer | null>;
  loadStory: (answerId: string) => Promise<AnswerStory>;
  readDigRecords: (runId: string) => Promise<DigLinks>;
  loadDigView: (link: DigLink) => Promise<DigView>;
}>;

export type ParentDigRetryInput = Readonly<{
  /** The failed dig's own run (the page's). */
  runId: string;
  /** The page shows this dig's failed screen; nothing is read otherwise. */
  failed: boolean;
  /** The map it was dug from; null: not known, nothing is read. */
  parentRunId: string | null;
  /** The account's question list as the page read it (the digs found by text), and whether its first read has settled. */
  index: readonly IndexEntry[];
  indexSettled: boolean;
  /** The digs started in this visit on any V4 page. */
  visit: readonly DigLink[];
  catalog: MessageCatalog;
  locale: string;
  reads: ParentDigRetryReads;
}>;

const oneLine = (line: string): string => line.replace(/\s+/gu, " ").trim();

/** What the map `parentRunId` offers for its dig `runId` (read now); undefined when it cannot be known. Throws when a read fails. */
export async function readParentDigRetry(input: ParentDigRetryInput, parentRunId: string): Promise<DigRetry["kind"] | undefined> {
  const { runId, reads, catalog, locale } = input;
  const answer = await reads.loadAnswer(parentRunId);
  if (answer === null) return undefined;
  // A dig of the new model has no story to read (W4-6, Q-D13). Independent review (Task 76j): a story whose read failed just
  // now, or that is still being written, leaves the map without its paths for the moment (the map reads it again), so what
  // the map offers is not known yet: nothing, the page as it was. A story the server says is gone for good is the map's own.
  const noStory = answer.dig !== undefined || answer.contribution !== undefined;
  const story = noStory ? null : await reads.loadStory(answer.answer_id);
  if (story !== null && (story.status === "WRITING" || storyReadFailed(story))) return undefined;
  const map = buildV4Map({ runId: parentRunId, answer, story });
  const records = await reads.readDigRecords(parentRunId);
  // The map's own order (V4DebateClient's `links`): a dig started in this visit keeps its exact link.
  const mine = input.visit.filter((link) => link.parentRunId === parentRunId);
  const mineById = new Map(mine.map((link) => [link.childRunId, link]));
  const found = mergeDigLinks(records, digLinksFor(parentRunId, answer.question_line, map, input.index, catalog), map);
  const foundIds = new Set(found.map((link) => link.childRunId));
  const links = [...found.map((link) => mineById.get(link.childRunId) ?? link), ...mine.filter((link) => !foundIds.has(link.childRunId))];
  if (!links.some((link) => link.childRunId === runId)) return undefined;
  const digs = await Promise.all(links.map((link) => reads.loadDigView(link)));
  const dig = digs.find((view) => view.link.childRunId === runId)!;
  return digRetryOf(dig, digs, map, sentDigOf(runId), (target) =>
    dig.questionLine !== undefined && oneLine(digQuestion(target, answer.question_line, catalog, locale)) === oneLine(dig.questionLine)).kind;
}

/** What the map a failed dig was dug from offers for it, once read; undefined while unknown (V4FailedScreen: as it was). */
export function useParentDigRetry(input: ParentDigRetryInput): DigRetry["kind"] | undefined {
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });
  const { runId, parentRunId } = input;
  const ready = input.failed && parentRunId !== null && input.indexSettled;
  const key = `${runId}|${parentRunId ?? ""}`;
  const [read, setRead] = useState<Readonly<{ key: string; kind: DigRetry["kind"] | undefined }> | null>(null);
  useEffect(() => {
    if (!ready || parentRunId === null) return;
    let active = true;
    readParentDigRetry(inputRef.current, parentRunId).then(
      (kind) => { if (active) setRead({ key, kind }); },
      () => { if (active) setRead({ key, kind: undefined }); }
    );
    return () => {
      active = false;
    };
  }, [ready, key, parentRunId]);
  return read !== null && read.key === key ? read.kind : undefined;
}
