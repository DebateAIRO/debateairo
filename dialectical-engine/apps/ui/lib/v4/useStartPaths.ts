"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ContractHttpError,
  QuestionNotStartedSchema,
  START_PATHS_STALE,
  START_STEP_LIMITS,
  startListNosOfMenu,
  type PurposeLines,
  type QuestionLanguageChoice,
  type QuestionLanguageOffer,
  type SignedStartList,
  type SignedStartMenu,
  type SiteLanguage,
  type StartCombineMember,
  type StartCombineRequest,
  type StartCombineResponse,
  type StartFitRequest,
  type StartListsEvent,
  type StartListsRequest,
  type StartMergeRequest,
  type StartMergeResponse,
  type StartPaths,
  type StartStepNoneReason,
  type StartStepRoom
} from "@debateai/contract";
import { contractClient } from "../api.js";
import { SHARE_DELTA_SHOW_MS, startPathsShare } from "./money.js";
import {
  combineMembersKey,
  isPersonPath,
  pathPlanChanged,
  pathPlanCombineMembers,
  pathPlanFromMenu,
  pathPlanOwnWords,
  pathPlanReduce,
  pathPlanToStartPaths,
  pathPlanWithRevision,
  type PathPlan,
  type PathPlanAction,
  type PathPlanRefusal
} from "./pathPlan.js";
import { keptLineOf, type V4StartEnd, type V4StartKept, type V4StartLanguage, type V4StartReading } from "./startKept.js";
import type { ReadingLevel, V4StartHandOver } from "./types.js";
import { useBrowserLayoutEffect } from "./useBrowserLayoutEffect.js";

/*
 * V4 start step, Task 70 (spec 2026-11-03 §2 items 1-3 and "When the list is missing"; chat-start-waits-for-paths, read-d6,
 * read-d2, choose-d2, read-d4, choose-d1, choose-f10, choose-f11, choose-f3, choose-f22, ask-f7; owner answers Q8 and Q10):
 * the start card's hook. Plain words:
 *  - The lists are read once, for the line posted at Next (the read line; after an accepted language rewrite, the rewrite).
 *    One lists post; the check, the language offer or the refusal come first; then the lists as each AI answers, the cut,
 *    and one merge of the lists in by then, with the person's answers as they are at that moment (never `matters`: the
 *    step-2 box is gone, answer Q4). The menu becomes the plan the person shapes (pathPlan.ts).
 *  - Nothing on step 2 is read again: the hook has no box input. A new read line (Back, new words, Next) stops the reading
 *    and starts over; the same line asks nothing again. Becoming inactive never stops a reading; only a new line, leaving
 *    the page (unmount) and the page's own give-up do.
 *  - Start waits for the paths (chat answer "Early Start"; answer Q10 greys "Just answer it" the same way): greyed while the
 *    AIs read and merge, after a refusal, on a stale reading, while offline, when the quota is used up, and while the plan
 *    holds more paths than the room's widest (answer Q8: after a site update, combine or remove down to it). With no list
 *    Start works and the debate chooses its own paths; the card says why the list is missing in one line.
 *  - Never hangs: the page gives up 5 s after the server's own limit (the 215-second line), and a merge that never answers
 *    ends the same way. The suggestions never go out of date by time: there is no lifetime and no timer on them (answer
 *    Q8). STALE comes only from a 409 START_PATHS_STALE (markStale, or a merge, combine or fit answered so).
 * Task 71 (read-d2, choose-d2, choose-f4, owner answer Q8, ask-f13, read-f1):
 *  - Late lists, and lists a CODE fallback left out, are merged in by late merges, one at a time, with the menu so far; their
 *    new paths go to the end of "+ N more", marked new, and never onto the list. Lists wait while there is no menu yet or a
 *    late merge runs, and go with Start (late_lists) until merged. A late merge that brings nothing is asked once more with
 *    the same lists; none after revision 9.
 *  - Each new path being written gets one combine call; the AI's words are kept in the page's memory for this reading, so
 *    putting the same viewpoints together again (after Undo, say) asks nothing. No words, a failure or the combine wait:
 *    the joined words stay (FALLBACK), and the next time asks again.
 *  - A stale reading starts no new call (the calls already asked finish), and is read again on Back, then Next (read-f1).
 *  - "Use my words instead" (ask-f13): after an accepted rewrite, the person's own words are read fresh with KEEP_MINE.
 * Task 76e (owner answers Q8 and S1 A; saved-questions spec §3.5): a kept step 2 (`kept`, from the account through the page's
 * restore) opens as it was, READY with its menu, lists and plan, or NONE (also when the person had left before the list),
 * and posts nothing: no lists, no merge, no combine. A path still being written shows its joined words (no call; combining
 * again is the person's choice) and nothing is left picked. `reading` is what the server signed for this reading, which
 * Task 76f saves.
 * Every call is the contract client's; nothing is kept in the browser.
 */

/** The page's waits: the server's START_STEP_TIMING plus 5 s each (the page cannot import packages/map; a unit test pins them). */
export const START_PAGE_WAITS = Object.freeze({
  /** The lists stream's whole life (210 s) plus 5 s: "The AIs are taking too long." */
  giveUpMs: 215_000,
  mergeMs: 50_000,
  lateMergeMs: 35_000,
  combineMs: 20_000,
  fitMs: 15_000,
  /** Task 69: a share change shows its grey "−3%" this long. */
  deltaShowMs: SHARE_DELTA_SHOW_MS,
  /** The bar's "Your paths are ready ↓" (Task 75). */
  readyNoteMs: 4_000
} as const);

export type StartCardPhase = "OFF" | "IDLE" | "CHECKING" | "LANGUAGE_CHOICE" | "READING" | "MERGING" | "READY" | "NONE" | "REFUSED" | "STALE";
/** Why the list is missing, as one line (choose-f11, choose-f3). */
export type StartNoneLine = "PASSING" | "NOT_OFFERED" | "QUOTA" | "OFFLINE" | "SIGNED_OUT" | "TOO_SLOW";

export type V4StartCardState = Readonly<{
  phase: StartCardPhase;
  /** The AIs' answers so far, for the dots (read-d4, choose-d1): seats, never items. Null before the check. */
  progress: Readonly<{ answered: number; of: number }> | null;
  plan: PathPlan | null;
  menu: SignedStartMenu | null;
  dispatch(action: PathPlanAction): PathPlanRefusal | null;
  languageOffer: QuestionLanguageOffer | null;
  chooseLanguage(choice: "USE_REWRITE" | "KEEP_MINE"): void;
  refusal: ContractHttpError | null;
  sharePercent: number | null;
  shareDelta: number | null;
  startReady: boolean;
  online: boolean;
  handOver(input: Readonly<{ chosenBy: "PERSON" | "AIS"; questionLine: string }>): Promise<V4StartHandOver>;
  width: number;
  noneReason: StartStepNoneReason | null;
  noneLine: StartNoneLine | null;
  /** The line the check read (the read line, or the accepted rewrite); every pre-Start call sends it. */
  checkedLine: string | null;
  fitOwn(text: string): Promise<string | null>;
  markStale(): void;
  /** The room's widest when the plan holds more paths (Free 3); null otherwise. */
  narrowedTo: number | null;
  lateLists: readonly SignedStartList[];
  lateIdeas: number;
  justLanded: boolean;
  /**
   * ask-f13: after chooseLanguage("USE_REWRITE") only, the person's own words (the offer's original line), which the page
   * then passes as questionLine; they are read fresh with KEEP_MINE (a new reading; the offer does not come back). Else null.
   */
  keepMyWords(): string | null;
  /** The person shaped the list (a change on the Undo stack, or a path of their own): the page's leave rule (Task 76c). */
  shaped: boolean;
  /** Task 76e: what the server signed for this reading once the check passed (Task 76f saves it); null before the check. */
  reading: V4StartReading | null;
}>;

/**
 * `questionLine` is the line posted at Next; the page never passes the step-2 box here (Task 76). Task 76e: `kept`, step 2 as
 * kept, opens a reading of its own for its line (the person's words: `check.original_question_line`, else `readLine`) when the
 * page reads that line, and posts nothing; a new kept step 2 (another object) opens again.
 */
export type V4StartPathsInput = Readonly<{
  active: boolean;
  questionLine: string;
  siteLanguage: SiteLanguage;
  readingLevel: ReadingLevel;
  clarify: PurposeLines | null;
  room: StartStepRoom | null;
  freePlan: boolean;
  kept?: V4StartKept;
}>;

type ReadingPhase = Exclude<StartCardPhase, "OFF" | "IDLE">;
/** One reading of one read line: what the card shows. Immutable; every change goes through `commit`. */
type Reading = Readonly<{
  line: string;
  phase: ReadingPhase;
  progress: Readonly<{ answered: number; of: number }> | null;
  checkRef: string | null;
  checkedLine: string | null;
  /** After USE_REWRITE: the person's own words, sent back as the check's original_question_line. */
  originalLine: string | null;
  /**
   * After USE_REWRITE: the offer's check and the person's own words, for "Use my words instead" (ask-f13). Task 76e: a kept
   * step 2 keeps no offer, so its check is null there and the person's words are read fresh with no choice.
   */
  rewrite: Readonly<{ checkRef: string | null; original: string }> | null;
  /** The language choice is made for this reading: an offer is not shown again. */
  choiceMade: boolean;
  languageOffer: QuestionLanguageOffer | null;
  refusal: ContractHttpError | null;
  lists: readonly SignedStartList[];
  late: readonly SignedStartList[];
  merging: boolean;
  menu: SignedStartMenu | null;
  plan: PathPlan | null;
  /** Every path key the plan held when it landed: late ideas count from here. */
  landedKeys: readonly string[];
  noneReason: StartStepNoneReason | null;
  noneLine: StartNoneLine | null;
  justLanded: boolean;
  /** Task 76e: the level the lists were read at, and the check event's language and seats (null for a kept step 2). */
  level: ReadingLevel;
  language: V4StartLanguage | null;
  seats: number | null;
  /** Task 76e: a kept step 2 whose AIs had not finished when the person left (NONE on the card, LEFT_EARLY when saved). */
  leftEarly: boolean;
}>;
type Timer = ReturnType<typeof setTimeout>;
/** The AI's words for a set of viewpoints put together, with its combine reference (Task 71). */
type Written = Readonly<{ title: string; question: string; combineRef: string }>;
/**
 * The running side of a reading: its one AbortController, its timers, and the number of its latest lists post (a reading
 * posts again after the language choice; the earlier stream's last callbacks are then ignored). Task 71: the late merges
 * and the combines, each call with its own stop (stopped too with the reading) and its own wait.
 */
type Run = {
  readonly controller: AbortController; posts: number; giveUp: Timer | null; merge: Timer | null; landed: Timer | null;
  /** The waits of the late merges and combines being asked. */
  readonly waits: Set<Timer>;
  /** A late merge is being asked (one at a time). */
  lateBusy: boolean;
  /** Lists a late merge was asked about: asked about again only together with a list that came after. */
  readonly lateAsked: Set<number>;
  /** The AI's combined words in this reading, by combineMembersKey (AI answers only). */
  readonly written: Map<string, Written>;
  /** The combines being asked, by path key: the members they were asked for. */
  readonly combining: Map<string, Readonly<{ members: string; call: AbortController }>>;
};

const WAITING: ReadonlySet<ReadingPhase> = new Set(["CHECKING", "READING", "MERGING"]);

function freshReading(line: string, choiceMade: boolean, level: ReadingLevel): Reading {
  return {
    line, phase: "CHECKING", progress: null, checkRef: null, checkedLine: null, originalLine: null, rewrite: null, choiceMade,
    languageOffer: null, refusal: null, lists: [], late: [], merging: false, menu: null, plan: null, landedKeys: [], noneReason: null,
    noneLine: null, justLanded: false, level, language: null, seats: null, leftEarly: false
  };
}

/**
 * Task 76e (saved-questions spec §3.5): the kept plan as it opens. A path still being written takes its joined words (FALLBACK:
 * no call; combining again is the person's choice and is counted), and nothing stays picked. Neither is an Undo step.
 */
function settledPlan(plan: PathPlan): PathPlan {
  const writing = [...plan.paths, ...plan.more].filter((path) => path.wording === "WRITING").map((path) => path.key);
  const answered = writing.reduce((held, key) => pathPlanReduce(held, { type: "COMBINE_FAILED", key }).plan, plan);
  return pathPlanReduce(answered, { type: "CLEAR_SELECTION" }).plan;
}

/**
 * Task 76e: a kept step 2 as this hook's reading of `line`. READY with its menu, lists and plan (every path counted as landed, so
 * no late ideas are announced and no ready note shows); NONE with its reason's line; LEFT_EARLY as NONE on the card (Start works,
 * and the debate chooses its own paths), still LEFT_EARLY in `reading`. Nothing is asked from here.
 */
function keptReading(kept: V4StartKept, line: string, level: ReadingLevel): Reading {
  const original = kept.check.original_question_line ?? null;
  const ready = kept.end === "READY" && kept.menu !== null;
  const plan = ready ? settledPlan(kept.plan) : null;
  const reason = kept.noneReason ?? null;
  return {
    line, phase: ready ? "READY" : "NONE", progress: null, checkRef: kept.check.ref, checkedLine: kept.readLine, originalLine: original,
    rewrite: original === null ? null : { checkRef: null, original }, choiceMade: true, languageOffer: null, refusal: null,
    lists: [...kept.lists], late: [...kept.lateLists], merging: false, menu: ready ? kept.menu : null, plan,
    landedKeys: plan === null ? [] : [...plan.paths, ...plan.more].map((path) => path.key),
    noneReason: ready || kept.end === "LEFT_EARLY" ? null : reason,
    noneLine: ready ? null : kept.end === "LEFT_EARLY" || reason === null ? "PASSING" : noneLineOf(reason),
    justLanded: false, level, language: null, seats: null, leftEarly: !ready && kept.end === "LEFT_EARLY"
  };
}

/**
 * Review (wave 16; saved-questions spec §3.2, "the combined questions already written, so that Undo and combine again stays
 * free"): the AI's combined words a kept plan holds, on the list, under "+ N more" and in every Undo step, by their members, so
 * the restored reading knows them as the reading that wrote them did: combining the same paths again after Undo takes them at
 * once, with no call. The plan's own paths win over its Undo steps.
 */
function keptWritten(plan: PathPlan): ReadonlyMap<string, Written> {
  const written = new Map<string, Written>();
  for (const step of [...plan.undo, plan]) {
    for (const path of [...step.paths, ...step.more]) {
      if (path.wording !== "COMBINED" || path.combineRef === null) continue;
      written.set(combineMembersKey(pathPlanCombineMembers(path)), { title: path.title, question: path.question, combineRef: path.combineRef });
    }
  }
  return written;
}

/**
 * Task 76e: how a reading ended, as saved: READY with a list (a stale reading keeps its paths, so it counts as READY when it
 * holds a menu); NONE with no list; LEFT_EARLY while the AIs were still reading, or a kept step 2 left before its list.
 */
function endOf(reading: Reading): V4StartEnd {
  if (reading.phase === "READY" || (reading.phase === "STALE" && reading.menu !== null)) return "READY";
  return reading.phase === "NONE" && !reading.leftEarly ? "NONE" : "LEFT_EARLY";
}

function freshRun(): Run {
  return { controller: new AbortController(), posts: 0, giveUp: null, merge: null, landed: null, waits: new Set(), lateBusy: false,
    lateAsked: new Set(), written: new Map(), combining: new Map() };
}

/** One call's own stop: by its own wait, and with the whole reading. */
function callOf(run: Run): AbortController {
  const call = new AbortController();
  if (run.controller.signal.aborted) call.abort();
  else run.controller.signal.addEventListener("abort", () => { call.abort(); }, { once: true });
  return call;
}

/** One call's wait, cleared with the reading's timers. */
function waitOn(run: Run, ms: number, then: () => void): Timer {
  const timer = setTimeout(() => {
    run.waits.delete(timer);
    then();
  }, ms);
  run.waits.add(timer);
  return timer;
}

function clearWait(run: Run, timer: Timer): void {
  clearTimeout(timer);
  run.waits.delete(timer);
}

/** The path being written with this key, on the list or in more, when it still holds the members its call was asked for. */
function writingWith(plan: PathPlan, key: string, members: string): boolean {
  const path = [...plan.paths, ...plan.more].find((one) => one.key === key && one.wording === "WRITING");
  return path !== undefined && combineMembersKey(pathPlanCombineMembers(path)) === members;
}

/** The server's reason as the card's one line: not offered here, the quota used up, too slow, or a passing fault. */
function noneLineOf(reason: StartStepNoneReason): StartNoneLine {
  if (reason === "OFF" || reason === "NOT_ASKED") return "NOT_OFFERED";
  if (reason === "POOL_EMPTY") return "QUOTA";
  if (reason === "DEADLINE") return "TOO_SLOW";
  return "PASSING";
}

function isStale(error: unknown): boolean {
  return error instanceof ContractHttpError && error.status === 409 && error.serverCode === START_PATHS_STALE;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError";
}

function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** A failed call as the card's missing-list line (choose-f11): signed out, offline, or a passing fault. */
function failureLineOf(error: unknown): StartNoneLine {
  if (error instanceof ContractHttpError && error.status === 401) return "SIGNED_OUT";
  if (error instanceof TypeError || (error instanceof ContractHttpError && error.code === "NETWORK_FAILURE") || browserOffline()) return "OFFLINE";
  return "PASSING";
}

/** The check's refusal as the contract client builds a 422 (`QuestionNotStartedSchema` details), so the refusal screen reads it. */
function refusalOf(body: Readonly<Record<string, unknown>>): ContractHttpError {
  const code = typeof body.error === "string" && body.error.trim().length > 0 ? body.error : null;
  const message = typeof body.message === "string" && body.message.trim().length > 0 ? body.message : null;
  const detail = code !== null && message !== null ? `${code}: ${message}` : code ?? message ?? "Contract request failed with 422";
  const parsed = QuestionNotStartedSchema.safeParse(body);
  return new ContractHttpError("UNPROCESSABLE", 422, detail, code, null, null, null, parsed.success
    ? Object.freeze({ kind: parsed.data.kind, screen: parsed.data.screen, emergencyNumber: parsed.data.emergency_number }) : null);
}

/** How wide before the menu lands: the room's default (Free at most 3). */
function pendingWidthOf(room: StartStepRoom | null, freePlan: boolean): number {
  const asked = room?.widths.default ?? START_STEP_LIMITS.freePathsMax;
  return freePlan ? Math.min(asked, START_STEP_LIMITS.freePathsMax) : asked;
}

/** The most paths the room allows now (Free 3); null without a room. */
function widestOf(room: StartStepRoom | null, freePlan: boolean): number | null {
  if (room === null) return null;
  const widest = Math.max(...room.widths.options);
  return freePlan ? Math.min(widest, START_STEP_LIMITS.freePathsMax) : widest;
}

function narrowedToOf(plan: PathPlan | null, room: StartStepRoom | null, freePlan: boolean): number | null {
  const widest = widestOf(room, freePlan);
  return plan !== null && widest !== null && plan.paths.length > widest ? widest : null;
}

/**
 * Start (and "Just answer it", answer Q10) may be pressed: before the reading, with the list, or with none (except the quota
 * used up); never while offline, and never while the plan holds more paths than the room allows.
 */
function startReadyOf(phase: StartCardPhase, noneLine: StartNoneLine | null, online: boolean, narrowedTo: number | null): boolean {
  if (!online || narrowedTo !== null) return false;
  if (phase === "OFF" || phase === "IDLE" || phase === "READY") return true;
  return phase === "NONE" && noneLine !== "QUOTA";
}

/** Signed lists the menu does not hold (late lists, and lists a CODE fallback left out), once each, at most the wire's limit. */
function lateListsOf(reading: Reading): readonly SignedStartList[] {
  if (reading.menu === null) return reading.late;
  const inMenu = new Set(startListNosOfMenu(reading.menu.menu));
  const seen = new Set<number>();
  const held: SignedStartList[] = [];
  for (const one of [...reading.lists, ...reading.late]) {
    if (inMenu.has(one.list.list_no) || seen.has(one.list.list_no)) continue;
    seen.add(one.list.list_no);
    held.push(one);
  }
  return held.slice(0, START_STEP_LIMITS.lateListsMax);
}

const NO_LISTS: readonly SignedStartList[] = Object.freeze([]);

export function useStartPaths(input: V4StartPathsInput): V4StartCardState {
  const { active, questionLine, room, freePlan } = input;
  const latest = useRef(input);
  latest.current = input;
  const listsOn = room !== null && room.lists === "ON";

  const [reading, setReading] = useState<Reading | null>(null);
  const readingRef = useRef<Reading | null>(null);
  const runRef = useRef<Run | null>(null);
  /** Woken after every change, for a hand-over waiting on a path still being written. */
  const waiters = useRef(new Set<() => void>());
  const [online, setOnline] = useState(() => !browserOffline());
  const onlineRef = useRef(online);

  const commit = useCallback((run: Run, change: (reading: Reading) => Reading): void => {
    const current = readingRef.current;
    if (current === null || runRef.current !== run) return;
    const next = change(current);
    if (next === current) return;
    readingRef.current = next;
    setReading(next);
    for (const wake of [...waiters.current]) wake();
  }, []);

  const stopTimers = useCallback((run: Run): void => {
    for (const timer of [run.giveUp, run.merge, run.landed, ...run.waits]) if (timer !== null) clearTimeout(timer);
    run.giveUp = null;
    run.merge = null;
    run.landed = null;
    run.waits.clear();
  }, []);

  const clearGiveUp = useCallback((run: Run): void => {
    if (run.giveUp !== null) clearTimeout(run.giveUp);
    run.giveUp = null;
  }, []);

  /** The list is missing: one reason, one line. A missing list never waits for anything more. */
  const endNone = useCallback((run: Run, reason: StartStepNoneReason, line: StartNoneLine): void => {
    clearGiveUp(run);
    if (run.merge !== null) clearTimeout(run.merge);
    run.merge = null;
    commit(run, (current) => ({ ...current, phase: "NONE", merging: false, noneReason: reason, noneLine: line }));
  }, [clearGiveUp, commit]);

  const endStale = useCallback((run: Run): void => {
    clearGiveUp(run);
    commit(run, (current) => current.phase === "STALE" ? current : { ...current, phase: "STALE", merging: false });
  }, [clearGiveUp, commit]);

  /** A call that failed: STALE on a 409 START_PATHS_STALE, the check's 422 refusal, else the missing-list line it means. */
  const endFailed = useCallback((run: Run, error: unknown): void => {
    if (isStale(error)) {
      endStale(run);
      return;
    }
    if (error instanceof ContractHttpError && error.status === 422 && error.questionNotStarted !== null) {
      clearGiveUp(run);
      commit(run, (current) => ({ ...current, phase: "REFUSED", merging: false, refusal: error }));
      return;
    }
    endNone(run, "TRANSPORT", failureLineOf(error));
  }, [clearGiveUp, commit, endNone, endStale]);

  /** A late merge's menu of this reading (the same menu id, a later revision): its new paths into more, marked new (Task 66). */
  const applyLate = useCallback((run: Run, menu: SignedStartMenu): boolean => {
    const current = readingRef.current;
    if (current === null || runRef.current !== run || current.menu === null || current.plan === null
      || menu.menu.menu_id !== current.menu.menu.menu_id || menu.menu.revision <= current.menu.menu.revision) return false;
    let plan: PathPlan;
    try {
      plan = pathPlanWithRevision(current.plan, menu.menu);
    } catch {
      return false;
    }
    commit(run, (now) => ({ ...now, menu, plan }));
    return true;
  }, [commit]);

  /**
   * The next late merge (choose-f4), one at a time, at READY only, never after revision 9: every held list the menu does not
   * hold (late lists, and lists a CODE fallback left out), with the menu so far, when one of them was not asked about yet.
   * NONE, a failure or the page's late-merge wait asks once more with the same lists, then the menu stays and those lists go
   * with Start until a later list brings them into the next late merge. A 409 START_PATHS_STALE makes the card STALE.
   */
  const mergeLate = useCallback((run: Run): void => {
    const current = readingRef.current;
    if (current === null || runRef.current !== run || run.lateBusy || current.phase !== "READY" || current.menu === null
      || current.checkRef === null || current.checkedLine === null || current.menu.menu.revision >= START_STEP_LIMITS.menuRevisionsMax) return;
    const lists = lateListsOf(current);
    if (lists.every((one) => run.lateAsked.has(one.list.list_no))) return;
    const answers = latest.current.clarify?.answers;
    const request: StartMergeRequest = {
      question_line: current.checkedLine, check_ref: current.checkRef, reading_level: latest.current.readingLevel, lists: [...lists],
      ...(answers === undefined || answers.length === 0 ? {} : { clarify: { answers: [...answers] } }),
      prior_menu: current.menu
    };
    run.lateBusy = true;
    const ask = (tries: number): void => {
      const call = callOf(run);
      let done = false;
      const settle = (answer: StartMergeResponse | null): void => {
        if (done) return;
        done = true;
        clearWait(run, wait);
        if (runRef.current !== run) return;
        const merged = answer !== null && answer.source !== "NONE" && applyLate(run, answer.menu);
        if (!merged && tries < 2 && readingRef.current?.phase === "READY") {
          ask(tries + 1);
          return;
        }
        for (const one of lists) run.lateAsked.add(one.list.list_no);
        run.lateBusy = false;
        mergeLate(run);
      };
      const wait = waitOn(run, START_PAGE_WAITS.lateMergeMs, () => {
        call.abort();
        settle(null);
      });
      contractClient.startPathMerge(request, call.signal).then(settle, (error: unknown) => {
        if (done || runRef.current !== run) return;
        if (isStale(error)) {
          done = true;
          clearWait(run, wait);
          run.lateBusy = false;
          endStale(run);
          return;
        }
        settle(null);
      });
    };
    ask(1);
  }, [applyLate, endStale]);

  /** The menu landed: the plan at How wide (the room's default; Free 3), "Your paths are ready ↓" for a few seconds. */
  const land = useCallback((run: Run, menu: SignedStartMenu): void => {
    let plan: PathPlan;
    try {
      plan = pathPlanFromMenu(menu.menu, pendingWidthOf(latest.current.room, latest.current.freePlan), latest.current.freePlan);
    } catch {
      endNone(run, "UNREADABLE", "PASSING");
      return;
    }
    clearGiveUp(run);
    if (run.merge !== null) clearTimeout(run.merge);
    run.merge = null;
    if (readingRef.current?.phase !== "MERGING" || runRef.current !== run) return;
    commit(run, (current) => ({ ...current, phase: "READY", merging: false, menu, plan,
      landedKeys: [...plan.paths, ...plan.more].map((path) => path.key), justLanded: true }));
    run.landed = setTimeout(() => {
      run.landed = null;
      commit(run, (current) => ({ ...current, justLanded: false }));
    }, START_PAGE_WAITS.readyNoteMs);
    // Task 71: lists that came while the first merge ran, or that a CODE fallback left out, merge in now.
    mergeLate(run);
  }, [clearGiveUp, commit, endNone, mergeLate]);

  /** The one merge, at the cut: the lists in by then and the answers as they are now (never `matters`). */
  const merge = useCallback((run: Run, lists: readonly SignedStartList[]): void => {
    const current = readingRef.current;
    if (current === null || current.checkRef === null || current.checkedLine === null) {
      endNone(run, "UNREADABLE", "PASSING");
      return;
    }
    const answers = latest.current.clarify?.answers;
    const request: StartMergeRequest = {
      question_line: current.checkedLine, check_ref: current.checkRef, reading_level: latest.current.readingLevel, lists: [...lists],
      ...(answers === undefined || answers.length === 0 ? {} : { clarify: { answers: [...answers] } })
    };
    run.merge = setTimeout(() => {
      run.merge = null;
      if (readingRef.current?.phase !== "MERGING" || runRef.current !== run) return;
      run.controller.abort();
      endNone(run, "DEADLINE", "TOO_SLOW");
    }, START_PAGE_WAITS.mergeMs);
    contractClient.startPathMerge(request, run.controller.signal).then((answer) => {
      if (run.controller.signal.aborted || runRef.current !== run || readingRef.current?.phase !== "MERGING") return;
      if (answer.source === "NONE") endNone(run, answer.reason, noneLineOf(answer.reason));
      else land(run, answer.menu);
    }, (error: unknown) => {
      if (run.controller.signal.aborted || isAbort(error) || runRef.current !== run || readingRef.current?.phase !== "MERGING") return;
      endFailed(run, error);
    });
  }, [endFailed, endNone, land]);

  /** The stream ended (its `end`, or the connection closed): with no cut, no list came; a running merge decides by itself. */
  const settleEnd = useCallback((run: Run, reason: StartStepNoneReason): void => {
    const current = readingRef.current;
    if (current === null || runRef.current !== run || !WAITING.has(current.phase) || current.merging) return;
    endNone(run, reason, noneLineOf(reason));
  }, [endNone]);

  const onEvent = useCallback((run: Run, postNo: number, event: StartListsEvent, posted: string, original: string | null): void => {
    if (run.controller.signal.aborted || runRef.current !== run || run.posts !== postNo) return;
    if (event.event === "check") {
      commit(run, (current) => ({ ...current, phase: current.phase === "CHECKING" ? "READING" : current.phase, checkRef: event.data.check_ref,
        checkedLine: posted, originalLine: original, progress: { answered: 0, of: event.data.seats }, language: event.data.language,
        seats: event.data.seats }));
    } else if (event.event === "language_offer") {
      // The choice is made (chooseLanguage, or "Use my words instead"): the offer does not come back.
      if (readingRef.current?.choiceMade === true) return;
      clearGiveUp(run);
      commit(run, (current) => WAITING.has(current.phase) ? { ...current, phase: "LANGUAGE_CHOICE", languageOffer: event.data.offer } : current);
    } else if (event.event === "refused") {
      clearGiveUp(run);
      commit(run, (current) => WAITING.has(current.phase) ? { ...current, phase: "REFUSED", refusal: refusalOf(event.data.body) } : current);
    } else if (event.event === "progress") {
      commit(run, (current) => ({ ...current, progress: { answered: event.data.answered, of: event.data.of } }));
    } else if (event.event === "list") {
      commit(run, (current) => ({ ...current, lists: [...current.lists, event.data.list] }));
      mergeLate(run);
    } else if (event.event === "late_list") {
      // Kept until merged; it waits while there is no menu yet or a late merge runs (Task 71).
      commit(run, (current) => ({ ...current, late: [...current.late, event.data.list] }));
      mergeLate(run);
    } else if (event.event === "cut") {
      const current = readingRef.current;
      if (current === null || current.phase !== "READING" || current.merging || current.lists.length === 0) return;
      commit(run, (now) => ({ ...now, phase: "MERGING", merging: true }));
      merge(run, current.lists);
    } else if (event.event === "none") {
      const current = readingRef.current;
      if (current === null || !WAITING.has(current.phase) || current.merging) return;
      endNone(run, event.data.reason, noneLineOf(event.data.reason));
    } else if (event.event === "end") {
      if (event.data.reason === "LANGUAGE_CHOICE" || event.data.reason === "REFUSED") return;
      settleEnd(run, event.data.reason === "DRAINING" ? "DRAINING" : "NO_LISTS");
    }
  }, [clearGiveUp, commit, endNone, merge, mergeLate, settleEnd]);

  /** One lists post; the page gives up after the stream's whole life (the 215-second line), and nothing is asked again by itself. */
  const post = useCallback((run: Run, request: StartListsRequest): void => {
    clearGiveUp(run);
    run.posts += 1;
    const postNo = run.posts;
    run.giveUp = setTimeout(() => {
      run.giveUp = null;
      const current = readingRef.current;
      if (current === null || runRef.current !== run || !WAITING.has(current.phase)) return;
      run.controller.abort();
      endNone(run, "DEADLINE", "TOO_SLOW");
    }, START_PAGE_WAITS.giveUpMs);
    const posted = request.question_line;
    const original = request.question_language_choice?.original_question_line ?? null;
    contractClient.startPathLists(request, (event) => { onEvent(run, postNo, event, posted, original); }, run.controller.signal).then(() => {
      if (!run.controller.signal.aborted && run.posts === postNo) settleEnd(run, "TRANSPORT");
    }, (error: unknown) => {
      const current = readingRef.current;
      if (run.controller.signal.aborted || isAbort(error) || current === null || runRef.current !== run || run.posts !== postNo) return;
      if (!WAITING.has(current.phase) || current.merging) return;
      endFailed(run, error);
    });
  }, [clearGiveUp, endFailed, endNone, onEvent, settleEnd]);

  /** A new reading of `line`; with `choice` ("Use my words instead"), the language choice goes with its one lists post. */
  const begin = useCallback((line: string, choice?: QuestionLanguageChoice): void => {
    const run = freshRun();
    runRef.current = run;
    const fresh = freshReading(line, choice !== undefined, latest.current.readingLevel);
    readingRef.current = fresh;
    setReading(fresh);
    if (browserOffline()) {
      endNone(run, "TRANSPORT", "OFFLINE");
      return;
    }
    post(run, { question_line: line, site_language: latest.current.siteLanguage, reading_level: latest.current.readingLevel,
      ...(choice === undefined ? {} : { question_language_choice: choice }) });
  }, [endNone, post]);

  const stop = useCallback((): void => {
    const run = runRef.current;
    runRef.current = null;
    readingRef.current = null;
    if (run === null) return;
    stopTimers(run);
    run.controller.abort();
  }, [stopTimers]);

  // Leaving the page stops the reading (the calls already asked run on and count, Calls item 8).
  useEffect(() => stop, [stop]);

  // Task 76e (answers Q8 and S1 A): a kept step 2 opens as its own reading once the page reads its line, before the browser
  // paints and before the reading below could post; nothing is asked. The same kept object opens once.
  const { kept } = input;
  const opened = useRef<V4StartKept | null>(null);
  useBrowserLayoutEffect(() => {
    if (kept === undefined || kept === opened.current || keptLineOf(kept) !== questionLine) return;
    opened.current = kept;
    stop();
    const run = freshRun();
    for (const [members, words] of keptWritten(kept.plan)) run.written.set(members, words);
    runRef.current = run;
    const restored = keptReading(kept, questionLine, latest.current.readingLevel);
    readingRef.current = restored;
    setReading(restored);
  }, [kept, questionLine, stop]);

  // Effects read primitives only. A new read line stops the old reading; the line is read once, when active with the step on.
  // read-f1: a stale reading is read again when the page makes the hook inactive and then active with the same line (Back,
  // then Next): the only way the same line is read again.
  const away = useRef(false);
  useEffect(() => {
    if (readingRef.current !== null && readingRef.current.line !== questionLine) {
      stop();
      setReading(null);
    }
    if (!active) {
      away.current = true;
      return;
    }
    const back = away.current;
    away.current = false;
    if (!listsOn) return;
    if (back && readingRef.current?.phase === "STALE") stop();
    if (readingRef.current !== null) return;
    begin(questionLine);
  }, [active, questionLine, listsOn, begin, stop]);

  // `online` follows the browser; back online the offline line goes (the list is still missing) and nothing is asked again.
  useEffect(() => {
    const up = (): void => {
      onlineRef.current = true;
      setOnline(true);
      const run = runRef.current;
      if (run !== null) commit(run, (current) => current.phase === "NONE" && current.noneLine === "OFFLINE" ? { ...current, noneLine: "PASSING" } : current);
    };
    const down = (): void => {
      onlineRef.current = false;
      setOnline(false);
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [commit]);

  const own = reading !== null && reading.line === questionLine ? reading : null;
  const phase: StartCardPhase = own !== null ? own.phase : listsOn ? "IDLE" : "OFF";
  const plan = own?.plan ?? null;
  const width = plan?.width ?? pendingWidthOf(room, freePlan);
  const sharePercent = startPathsShare(room, plan?.paths.length ?? width);
  const narrowedTo = narrowedToOf(plan, room, freePlan);
  const noneLine = own?.phase === "NONE" ? own.noneLine : null;
  const startReady = startReadyOf(phase, noneLine, online, narrowedTo);

  // Task 69: a change of the share while the plan is on screen shows its grey change for 2 s (the landing itself is no change).
  const [shareDelta, setShareDelta] = useState<number | null>(null);
  const lastShare = useRef<Readonly<{ planned: boolean; percent: number | null }>>({ planned: false, percent: null });
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const planned = plan !== null;
  useEffect(() => {
    const before = lastShare.current;
    lastShare.current = { planned, percent: sharePercent };
    if (!before.planned || !planned || before.percent === null || sharePercent === null || before.percent === sharePercent) return;
    if (deltaTimer.current !== null) clearTimeout(deltaTimer.current);
    setShareDelta(sharePercent - before.percent);
    deltaTimer.current = setTimeout(() => {
      deltaTimer.current = null;
      setShareDelta(null);
    }, START_PAGE_WAITS.deltaShowMs);
  }, [planned, sharePercent]);
  useEffect(() => () => {
    if (deltaTimer.current !== null) clearTimeout(deltaTimer.current);
  }, []);

  /** COMBINE_FAILED (the joined words stay) for the path still being written with the members its call was asked for. */
  const failCombine = useCallback((run: Run, key: string, members: string): void => {
    commit(run, (current) => {
      if (current.plan === null || !writingWith(current.plan, key, members)) return current;
      const plan = pathPlanReduce(current.plan, { type: "COMBINE_FAILED", key }).plan;
      return plan === current.plan ? current : { ...current, plan };
    });
  }, [commit]);

  /**
   * The paths being written (choose-d2, choose-f10): the AI's words already written in this reading for the same members land
   * at once (COMBINE_WRITTEN, no call); a path on the list with none and no call for its members gets one combine call, with
   * the read line, the check and the menu id. Its AI words are kept for these members and land; NONE, a failure or the
   * combine wait (the call stopped first, so a late answer cannot land) keep the joined words (FALLBACK), and the next time
   * asks again. A stale reading starts no call; a call already asked finishes.
   */
  const combine = useCallback((run: Run): void => {
    const current = readingRef.current;
    if (current === null || runRef.current !== run || current.plan === null) return;
    /** One combine call for one path being written. */
    const ask = (key: string, members: readonly StartCombineMember[], membersKey: string, context: StartCombineRequest["context"]): void => {
      const call = callOf(run);
      run.combining.set(key, { members: membersKey, call });
      let done = false;
      const settle = (answer: StartCombineResponse | null): void => {
        if (done) return;
        done = true;
        clearWait(run, wait);
        if (run.combining.get(key)?.call === call) run.combining.delete(key);
        if (runRef.current !== run) return;
        if (answer !== null && answer.source === "AI") {
          run.written.set(membersKey, { title: answer.title, question: answer.question, combineRef: answer.combine_ref });
          combine(run);
        } else {
          failCombine(run, key, membersKey);
        }
      };
      const wait = waitOn(run, START_PAGE_WAITS.combineMs, () => {
        call.abort();
        settle(null);
      });
      const request: StartCombineRequest = { context, reading_level: latest.current.readingLevel, members: [...members] };
      contractClient.startPathCombine(request, call.signal).then(settle, (error: unknown) => {
        if (done || runRef.current !== run) return;
        if (isStale(error)) endStale(run);
        settle(null);
      });
    };
    const onList = new Set(current.plan.paths);
    for (const path of [...current.plan.paths, ...current.plan.more]) {
      if (path.wording !== "WRITING") continue;
      const members = pathPlanCombineMembers(path);
      const membersKey = combineMembersKey(members);
      const words = run.written.get(membersKey);
      if (words !== undefined) {
        commit(run, (now) => {
          if (now.plan === null || !writingWith(now.plan, path.key, membersKey)) return now;
          const plan = pathPlanReduce(now.plan, { type: "COMBINE_WRITTEN", key: path.key, ...words }).plan;
          return plan === now.plan ? now : { ...now, plan };
        });
        continue;
      }
      const now = readingRef.current;
      if (!onList.has(path) || run.combining.get(path.key)?.members === membersKey || now === null || now.phase === "STALE"
        || now.menu === null || now.checkRef === null || now.checkedLine === null) continue;
      ask(path.key, members, membersKey, { kind: "MENU", question_line: now.checkedLine, check_ref: now.checkRef, menu_id: now.menu.menu.menu_id });
    }
  }, [commit, endStale, failCombine]);

  const dispatch = useCallback((action: PathPlanAction): PathPlanRefusal | null => {
    const run = runRef.current;
    const current = readingRef.current;
    if (run === null || current === null || current.plan === null || current.line !== latest.current.questionLine) return null;
    const result = pathPlanReduce(current.plan, action);
    if (result.plan !== current.plan) {
      commit(run, (now) => ({ ...now, plan: result.plan }));
      combine(run);
    }
    return result.refusal;
  }, [combine, commit]);

  const chooseLanguage = useCallback((choice: "USE_REWRITE" | "KEEP_MINE"): void => {
    const run = runRef.current;
    const current = readingRef.current;
    if (run === null || current === null || current.phase !== "LANGUAGE_CHOICE" || current.languageOffer === null) return;
    const offer = current.languageOffer;
    const rewrite = choice === "USE_REWRITE";
    const languageChoice: QuestionLanguageChoice = rewrite
      ? { check_ref: offer.check_ref, choice, original_question_line: current.line }
      : { check_ref: offer.check_ref, choice };
    commit(run, (now) => ({ ...now, phase: "CHECKING", languageOffer: null, choiceMade: true,
      rewrite: rewrite ? { checkRef: offer.check_ref, original: current.line } : null }));
    post(run, { question_line: rewrite ? offer.proposed_question : current.line, site_language: latest.current.siteLanguage,
      reading_level: latest.current.readingLevel, question_language_choice: languageChoice });
  }, [commit, post]);

  /**
   * ask-f13 ("Use my words instead"): after an accepted rewrite only, the person's own words are read fresh with KEEP_MINE
   * and the offer's check: a new reading (menu, lists, late lists, plan and progress start again). The page's calls of the
   * rewrite's reading stop here; the server's run on and count (Calls item 8), as when the line changes.
   */
  const keepMyWords = useCallback((): string | null => {
    const current = readingRef.current;
    if (current === null || current.rewrite === null || current.line !== latest.current.questionLine) return null;
    const { checkRef, original } = current.rewrite;
    stop();
    // Task 76e: a kept step 2 kept no offer; its person's words are read fresh with no choice (an offer may come again).
    begin(original, checkRef === null ? undefined : { check_ref: checkRef, choice: "KEEP_MINE" });
    return original;
  }, [begin, stop]);

  const markStale = useCallback((): void => {
    const run = runRef.current;
    if (run !== null) endStale(run);
  }, [endStale]);

  /** Which path on the list the person's own words fit inside (its key), else null. Nothing is asked on a stale reading. */
  const fitOwn = useCallback(async (text: string): Promise<string | null> => {
    const run = runRef.current;
    const current = readingRef.current;
    const ownText = text.trim();
    if (run === null || current === null || current.phase === "STALE" || current.checkRef === null || current.checkedLine === null
      || current.plan === null || current.plan.paths.length === 0 || ownText.length === 0 || ownText.length > START_STEP_LIMITS.ownTextMaxChars) {
      return null;
    }
    const request: StartFitRequest = { question_line: current.checkedLine, check_ref: current.checkRef, reading_level: latest.current.readingLevel,
      own_text: ownText, paths: current.plan.paths.map((path) => ({ key: path.key, title: path.title, question: path.question })) };
    const wait: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };
    const slow = new Promise<null>((resolve) => { wait.timer = setTimeout(() => { resolve(null); }, START_PAGE_WAITS.fitMs); });
    try {
      const answer = await Promise.race([contractClient.startPathFit(request, run.controller.signal), slow]);
      if (answer === null || answer.source !== "AI" || answer.fits_key === null || runRef.current !== run) return null;
      const key = answer.fits_key;
      return readingRef.current?.plan?.paths.some((path) => path.key === key) === true ? key : null;
    } catch (error) {
      if (isStale(error) && runRef.current === run) endStale(run);
      return null;
    } finally {
      if (wait.timer !== null) clearTimeout(wait.timer);
    }
  }, [endStale]);

  /**
   * Paths still being written get at most the combine wait, then their joined words (FALLBACK). Each one's call (Task 71) is
   * stopped first, so an answer for its members cannot land on it later.
   */
  const writtenOrJoined = useCallback(async (run: Run): Promise<void> => {
    const writing = (): boolean => readingRef.current?.plan?.paths.some((path) => path.wording === "WRITING") === true;
    if (writing()) {
      await new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          waiters.current.delete(check);
          resolve();
        };
        const check = (): void => { if (!writing() || runRef.current !== run) done(); };
        const timer = setTimeout(done, START_PAGE_WAITS.combineMs);
        waiters.current.add(check);
      });
    }
    const still = readingRef.current?.plan?.paths.filter((path) => path.wording === "WRITING").map((path) => path.key) ?? [];
    for (const key of still) {
      const current = readingRef.current;
      if (current === null || current.plan === null || runRef.current !== run) return;
      run.combining.get(key)?.call.abort();
      const result = pathPlanReduce(current.plan, { type: "COMBINE_FAILED", key });
      if (result.plan !== current.plan) commit(run, (now) => ({ ...now, plan: result.plan }));
    }
  }, [commit]);

  /**
   * What Start sends (Task 68's V4StartHandOver). `questionLine` is the box's line; the check is the read line's, exactly as
   * it was given. PERSON at READY: the plan (paths still being written wait at most the combine wait). AIS ("Just answer
   * it"): the menu's top paths at How wide, never the shaped plan. With no list: the check alone; before the reading: the
   * line alone. Never asked while Start is greyed (answer Q10).
   */
  const handOver = useCallback(async (asked: Readonly<{ chosenBy: "PERSON" | "AIS"; questionLine: string }>): Promise<V4StartHandOver> => {
    const run = runRef.current;
    const current = readingRef.current;
    const given = latest.current;
    const mine = current !== null && current.line === given.questionLine ? current : null;
    const nowPhase: StartCardPhase = mine !== null ? mine.phase : given.room?.lists === "ON" ? "IDLE" : "OFF";
    const nowNarrowed = narrowedToOf(mine?.plan ?? null, given.room, given.freePlan);
    if (!startReadyOf(nowPhase, mine?.phase === "NONE" ? mine.noneLine : null, onlineRef.current, nowNarrowed)) {
      throw new TypeError("START_HAND_OVER_NOT_READY");
    }
    const questionLineOut = asked.questionLine;
    if (mine === null || run === null) return { questionLine: questionLineOut, ownWords: [] };
    const startCheck = mine.checkRef === null ? null
      : { ref: mine.checkRef, ...(mine.originalLine === null ? {} : { original_question_line: mine.originalLine }) };
    const withCheck = startCheck === null ? {} : { startCheck };
    if (mine.phase !== "READY" || mine.menu === null || mine.plan === null) return { questionLine: questionLineOut, ...withCheck, ownWords: [] };
    const menu = mine.menu;
    if (asked.chosenBy === "AIS") {
      // Answer Q8: never more paths than the room now allows (after a site update the person removed down to its widest, and
      // How wide may still say more); the server would refuse them as START_PATHS_NARROWED.
      const widest = widestOf(given.room, given.freePlan);
      const top = pathPlanFromMenu(menu.menu, widest === null ? mine.plan.width : Math.min(mine.plan.width, widest), given.freePlan);
      const late = lateListsOf(mine);
      const startPaths: StartPaths = { source: "MENU", menu, paths: [...pathPlanToStartPaths(top)], width: top.width, chosen_by: "AIS",
        ...(late.length === 0 ? {} : { late_lists: [...late] }) };
      return { questionLine: questionLineOut, ...withCheck, startPaths, ownWords: [] };
    }
    await writtenOrJoined(run);
    const now = readingRef.current;
    if (now === null || runRef.current !== run || now.plan === null || now.menu === null) throw new TypeError("START_HAND_OVER_NOT_READY");
    const plan = now.plan;
    // Review of Task 71: a late merge may land during the wait, so the menu, the plan and late_lists are all read now, from
    // one reading: the menu from before the wait with late_lists counted against the newer one would hold a list nowhere.
    const late = lateListsOf(now);
    const startPaths: StartPaths = { source: "MENU", menu: now.menu, paths: [...pathPlanToStartPaths(plan)], width: plan.width, chosen_by: "PERSON",
      ...(late.length === 0 ? {} : { late_lists: [...late] }),
      ...(plan.questionSwap === null ? {} : { question_swap: { card_id: plan.questionSwap.cardId, original_question_line: plan.questionSwap.original } }) };
    return { questionLine: questionLineOut, ...withCheck, startPaths, ownWords: [...pathPlanOwnWords(plan)] };
  }, [writtenOrJoined]);

  const landedKeys = own?.landedKeys;
  const lateIdeas = plan === null || landedKeys === undefined ? 0
    : plan.more.filter((path) => path.isNew && !landedKeys.includes(path.key)).length;

  // Task 76e: what the server signed for this reading, once the check passed (one object per reading state, for Task 76f's saves).
  const signed = useMemo((): V4StartReading | null => {
    if (own === null || own.checkRef === null || own.checkedLine === null) return null;
    const end = endOf(own);
    return {
      check: { ref: own.checkRef, ...(own.originalLine === null ? {} : { original_question_line: own.originalLine }) },
      menu: own.menu, lateLists: lateListsOf(own), end,
      ...(end === "NONE" && own.noneReason !== null ? { noneReason: own.noneReason } : {}),
      checkedLine: own.checkedLine, readingLevel: own.level, language: own.language, seats: own.seats
    };
  }, [own]);

  return {
    phase,
    progress: own?.progress ?? null,
    plan,
    menu: own?.menu ?? null,
    dispatch,
    languageOffer: own?.languageOffer ?? null,
    chooseLanguage,
    refusal: own?.refusal ?? null,
    sharePercent,
    shareDelta: planned ? shareDelta : null,
    startReady,
    online,
    handOver,
    width,
    noneReason: own?.phase === "NONE" ? own.noneReason : null,
    noneLine,
    checkedLine: own?.checkedLine ?? null,
    fitOwn,
    markStale,
    narrowedTo,
    lateLists: own === null ? NO_LISTS : lateListsOf(own),
    lateIdeas,
    justLanded: own?.justLanded ?? false,
    keepMyWords,
    // Task 71: what the page's leave rule reads (Task 76c); the hook itself adds no beforeunload listener.
    shaped: plan !== null && (pathPlanChanged(plan) || plan.paths.some(isPersonPath)),
    reading: signed
  };
}
