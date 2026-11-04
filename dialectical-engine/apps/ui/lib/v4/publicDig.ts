import { useMemo, useSyncExternalStore } from "react";
import {
  ContractHttpError, DigSuggestionSchema, WEB_CONTRACT_LIMITS,
  type Answer, type ContractClient, type DigSuggestion, type PublicDebate, type RunProjection
} from "@debateai/contract";
import { contractClient } from "../api.js";
import type { AskRoom } from "../billing/room.js";
import type { DigUndoEntry } from "./digUndo.js";
import { waitStateOfRun, type WaitState } from "./stateWords.js";

/*
 * V4 screen review (owner picks 3 Nov 2026), the public dig flow: public-f11, public-d2 A and dig-f25.
 *  - A dig pressed on someone else's public page waits out the site's one 10-second Undo (lib/v4/digUndo.ts) like a dig
 *    on the map: nothing is sent before its time, Undo means nothing is sent. Its place in that store is the page's own
 *    reference (and the dig it hangs under), never a run id: a public page carries none, by design.
 *  - After the 10 seconds the person stays on the page; a card under the path says the dig is running, then shows two
 *    stops ("Dig done", "Checked") and one outcome, read from the dig's own run (its `contribution`, served to the
 *    digger only). This visit's started digs are kept in the page's memory only, so the card is still there when the
 *    person comes back to the page in the same tab; after a reload the server has to say it (written in the track's
 *    server notes: the reader's own digs on a public debate).
 *  - The box starts with the path's own suggestions as chips, when the public read carries them (an OPTIONAL field the
 *    server does not send yet: `dig_suggestions`; absent, the box is as before). A chip someone has dug since then says
 *    "Someone dug near here on 2 Nov" and opens that dig's result on the page instead.
 * No browser storage of any kind.
 */

/** The dig store's place for a public page's dig: the page's reference and the dig it hangs under (no run id). */
export function publicDigParentKey(publicRef: string, digRef: string | null): string {
  return digRef === null ? `public:${publicRef}` : `public:${publicRef}/${digRef}`;
}

/** The waiting dig (counting or being sent) of this path's box, or null. One waiting dig per box. */
export function waitingPublicDig(entries: readonly DigUndoEntry[], publicRef: string, path: Readonly<{ ref: string; digRef: string | null }>): DigUndoEntry | null {
  const parent = publicDigParentKey(publicRef, path.digRef);
  return entries.find((entry) => (entry.phase === "COUNTING" || entry.phase === "SENDING")
    && entry.parentRunId === parent && entry.targetKey === `picks:${path.ref}`) ?? null;
}

/**
 * public-f11: the share a public dig takes, shown on its button before the press, when the room read says one for this
 * dig. The read a public page makes today is a new question's (the server works a dig's share out only for the person's
 * own debate), so `dig_share_percent` is absent and nothing is shown: never a new question's share in its place, never
 * worked out here. The period it is of is named once by the switch, from the server's window (read-f19 / public-f14:
 * lib/v4/digQuota.ts digPeriodLine, "of this month" on Free), as on the map.
 */
export function publicDigShare(room: AskRoom | null): number | null {
  const percent = room?.dig_share_percent;
  return percent === undefined || percent <= 0 ? null : percent;
}

// ---------------------------------------------------------------------------------------------------------------
// This visit's started digs (memory only)
// ---------------------------------------------------------------------------------------------------------------

export type PublicDigStarted = Readonly<{
  childRunId: string;
  publicRef: string;
  pathRef: string;
  /** The dig the path hangs under (null: the debate's own path). */
  digRef: string | null;
  startedAt: string;
  /** public-f10: it started, but as the person's own private debate (the page is unchanged). */
  notJoined: boolean;
  /** The path's line on the page when the dig was pressed: the "before" of its outcome. */
  before: string;
  /** The first thing the dig looks into, in the person's words or the chip's (the card's title). */
  first: string;
  /** Whether that first thing is a suggestion the AIs wrote (marked as AI text). */
  firstIsAi: boolean;
}>;

const EMPTY: readonly PublicDigStarted[] = Object.freeze([]);
let started: readonly PublicDigStarted[] = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** A public dig that started (the send's answer). Kept for this visit only. */
export function rememberPublicDig(dig: PublicDigStarted): void {
  started = Object.freeze([...started.filter((known) => known.childRunId !== dig.childRunId), Object.freeze({ ...dig })]);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getStarted = (): readonly PublicDigStarted[] => started;
const getServerStarted = (): readonly PublicDigStarted[] => EMPTY;

/** This visit's started digs on one path of one public page, oldest first. */
export function usePublicDigsStarted(publicRef: string, path: Readonly<{ ref: string; digRef: string | null }>): readonly PublicDigStarted[] {
  const all = useSyncExternalStore(subscribe, getStarted, getServerStarted);
  return useMemo(() => all.filter((dig) => dig.publicRef === publicRef && dig.pathRef === path.ref && dig.digRef === path.digRef),
    [all, publicRef, path.ref, path.digRef]);
}

/** Tests only: forgets this visit's started digs. */
export function resetPublicDigs(): void {
  started = EMPTY;
  emit();
}

// ---------------------------------------------------------------------------------------------------------------
// What became of a started dig: the return card's stops and outcome
// ---------------------------------------------------------------------------------------------------------------

export type PublicDigProgress =
  /** Still running (or waiting, or paused): stop 1 open. `wait` is the run's one state word. */
  | Readonly<{ kind: "RUNNING"; wait: WaitState }>
  /** The dig is done; the AI check on it runs: stop 2 open. */
  | Readonly<{ kind: "CHECKING" }>
  /** It changed the public page: the path's text after it (null: the server has not given the new text yet). */
  | Readonly<{ kind: "ON_THE_PAGE"; after: string | null }>
  /** It went on the page and changed nothing: "Confirmed: the answer holds." */
  | Readonly<{ kind: "CONFIRMED" }>
  /** The check kept it with the digger: the page is unchanged. */
  | Readonly<{ kind: "KEPT_PRIVATE" }>
  /** It was on the page and was taken off after a review. */
  | Readonly<{ kind: "REMOVED" }>
  | Readonly<{ kind: "FAILED" }>;

/** Whether the card is settled (nothing more to read). */
export function progressSettled(progress: PublicDigProgress | null): boolean {
  return progress !== null && progress.kind !== "RUNNING" && progress.kind !== "CHECKING";
}

/** Which of the card's two stops are reached: "Dig done", then "Checked". */
export function stopsReached(progress: PublicDigProgress | null): Readonly<{ dug: boolean; checked: boolean }> {
  if (progress === null || progress.kind === "RUNNING" || progress.kind === "FAILED") return { dug: false, checked: false };
  if (progress.kind === "CHECKING") return { dug: true, checked: false };
  return { dug: true, checked: true };
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function isNotFound(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.status === 404;
}

/**
 * The outcome a finished check gives, from the digger's own `contribution` (the server's words; nothing is worked out
 * beyond "did the path's text change"). A dig with no contribution never joined the page (public-f10): it is the
 * person's own, as a kept one is.
 */
export function progressOfAnswer(answer: Answer, before: string): PublicDigProgress {
  const contribution = answer.contribution;
  if (contribution === undefined) return { kind: "KEPT_PRIVATE" };
  switch (contribution.state) {
    case "CHECKING":
      return { kind: "CHECKING" };
    case "KEPT_PRIVATE":
      return { kind: "KEPT_PRIVATE" };
    case "REMOVED_AFTER_REVIEW":
      return { kind: "REMOVED" };
    case "ON_THE_PAGE": {
      const rewrite = contribution.rewrite ?? null;
      // On the page, its new text not given yet: said as on the page, without a "before and after".
      if (rewrite === null) return { kind: "ON_THE_PAGE", after: null };
      const changed = oneLine(rewrite.line) !== oneLine(before) || rewrite.what_changed.length > 0;
      return changed ? { kind: "ON_THE_PAGE", after: rewrite.line } : { kind: "CONFIRMED" };
    }
  }
}

type ProgressClient = Pick<ContractClient, "readRun" | "readRunAnswer">;

/** Reads the dig's own run (and, once settled, its answer). Throws only when the server cannot be reached. */
export async function readPublicDigProgress(childRunId: string, before: string, client: ProgressClient = contractClient): Promise<PublicDigProgress> {
  let run: RunProjection;
  try {
    run = await Promise.resolve().then(() => client.readRun(childRunId));
  } catch (failure) {
    if (isNotFound(failure)) return { kind: "FAILED" };
    throw failure;
  }
  if (run.state === "FAILED") return { kind: "FAILED" };
  if (run.state !== "SETTLED") return { kind: "RUNNING", wait: waitStateOfRun(run) };
  try {
    return progressOfAnswer(await client.readRunAnswer(childRunId), before);
  } catch (failure) {
    // Settled, its answer not readable yet: still finishing.
    if (isNotFound(failure)) return { kind: "RUNNING", wait: { kind: "LOOKING" } };
    throw failure;
  }
}

/** One stretch of the "after" text: `added` marks words that were not in the "before" (shown underlined). */
export type MarkedWords = Readonly<{ text: string; added: boolean }>;

/** At most this many words on each side are compared word by word; past it nothing is underlined. */
const DIFF_WORDS_MAX = 400;

/** A word as compared: its letters and digits only, in lower case (punctuation and symbols of any script left out). */
function bareWord(word: string): string {
  return word.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

/**
 * "New words underlined" (public-d2): the after-text in stretches, a word marked when it is not part of the longest run
 * of words both texts share in order (compared without case and punctuation). Worked out in the browser, at no cost.
 * Spaces stay as written; a space is underlined only between two new words. Punctuation alone is never new.
 */
export function newWordMarks(before: string, after: string): readonly MarkedWords[] {
  const tokens = after.split(/(\s+)/u).filter((token) => token.length > 0);
  const space = (token: string): boolean => /^\s+$/u.test(token);
  const words = tokens.filter((token) => !space(token));
  const old = before.split(/\s+/u).filter((word) => word.length > 0);
  if (words.length === 0) return after.length === 0 ? [] : [{ text: after, added: false }];
  if (words.length > DIFF_WORDS_MAX || old.length > DIFF_WORDS_MAX) return [{ text: after, added: false }];
  const a = words.map(bareWord);
  const b = old.map(bareWord);
  // The longest common subsequence of the bare words, then a walk that keeps the words of `after` inside it.
  const cols = b.length + 1;
  const table = new Uint16Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const added = a.map((bare) => bare.length > 0);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      added[i] = false;
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) i += 1;
    else j += 1;
  }
  const marks: MarkedWords[] = [];
  let word = 0;
  tokens.forEach((token) => {
    let flag: boolean;
    if (space(token)) flag = word > 0 && word < words.length && added[word - 1]! && added[word]!;
    else {
      flag = added[word]!;
      word += 1;
    }
    const last = marks.at(-1);
    if (last !== undefined && last.added === flag) marks[marks.length - 1] = { text: last.text + token, added: flag };
    else marks.push({ text: token, added: flag });
  });
  return Object.freeze(marks.map((mark) => Object.freeze(mark)));
}

// ---------------------------------------------------------------------------------------------------------------
// The path's own suggestions on the public read (OPTIONAL field, not sent by the server yet)
// ---------------------------------------------------------------------------------------------------------------

/** One chip: a suggestion the server holds for the path; `dugOn`/`dugRef` when someone has dug near it since. */
export type PublicDigSuggestion = Readonly<{
  suggestion: DigSuggestion;
  /** "YYYY-MM-DD": the day someone dug near this suggestion (the chip then opens their result instead). */
  dugOn: string | null;
  /** The contribution (`update_ref`) whose result the chip opens. */
  dugRef: string | null;
}>;

/**
 * The public read's optional field: one entry per path (`position_ref`, and `dig_ref` for a dig's own path), with its
 * suggestions. The contract's PublicDebate is strict and does not name it yet, so it arrives only once the contract and
 * the server carry it (the stand-in shows it on its draft view).
 */
export const PUBLIC_SUGGESTIONS_FIELD = "dig_suggestions";

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EMPTY_SUGGESTIONS: readonly PublicDigSuggestion[] = Object.freeze([]);

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

/**
 * The chips of one path, when the public read carries them (absent today: none, and the box is as before). Only
 * well-formed suggestions, each once, at most the contract's limit per path; a malformed entry is left out, never guessed.
 */
export function publicSuggestionsFor(debate: PublicDebate, path: Readonly<{ ref: string; digRef: string | null }>): readonly PublicDigSuggestion[] {
  const field = (debate as PublicDebate & Readonly<Record<string, unknown>>)[PUBLIC_SUGGESTIONS_FIELD];
  if (!Array.isArray(field)) return EMPTY_SUGGESTIONS;
  const group = field.map(record).find((entry) => entry !== null && entry.position_ref === path.ref && (entry.dig_ref ?? null) === path.digRef);
  const list = group?.suggestions;
  if (!Array.isArray(list)) return EMPTY_SUGGESTIONS;
  const seen = new Set<string>();
  const chips: PublicDigSuggestion[] = [];
  for (const raw of list) {
    const entry = record(raw);
    if (entry === null) continue;
    const { dug_on: dugOn, dug_ref: dugRef, ...rest } = entry;
    const parsed = DigSuggestionSchema.safeParse(rest);
    if (!parsed.success || seen.has(parsed.data.suggestion_id)) continue;
    seen.add(parsed.data.suggestion_id);
    const dug = typeof dugOn === "string" && DAY.test(dugOn) && typeof dugRef === "string" && REF.test(dugRef);
    chips.push(Object.freeze({ suggestion: parsed.data, dugOn: dug ? dugOn : null, dugRef: dug ? dugRef : null }));
    if (chips.length === WEB_CONTRACT_LIMITS.suggestionsPerPathMax) break;
  }
  return chips.length === 0 ? EMPTY_SUGGESTIONS : Object.freeze(chips);
}

/** Where a path's note sits on the public page: "See it on the page" and a dug chip scroll there and glow it once. */
export function publicPathAnchor(path: Readonly<{ ref: string; digRef: string | null }>): string {
  return `public-path-${path.digRef ?? "root"}-${path.ref}`;
}

/** Where a dig's own paths sit on the public page (a dug chip opens that dig's result). */
export function publicDigAnchor(digRef: string): string {
  return `public-dig-${digRef}`;
}
