"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type StartFitRequest,
  type StartListsEvent,
  type StartListsRequest,
  type StartMergeRequest,
  type StartPaths,
  type StartStepNoneReason,
  type StartStepRoom
} from "@debateai/contract";
import { contractClient } from "../api.js";
import { SHARE_DELTA_SHOW_MS, startPathsShare } from "./money.js";
import {
  pathPlanFromMenu,
  pathPlanOwnWords,
  pathPlanReduce,
  pathPlanToStartPaths,
  type PathPlan,
  type PathPlanAction,
  type PathPlanRefusal
} from "./pathPlan.js";
import type { ReadingLevel, V4StartHandOver } from "./types.js";

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
 *    Q8). STALE comes only from a 409 START_PATHS_STALE (markStale, or a merge or fit answered so).
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
}>;

/** `questionLine` is the line posted at Next; the page never passes the step-2 box here (Task 76). */
export type V4StartPathsInput = Readonly<{
  active: boolean;
  questionLine: string;
  siteLanguage: SiteLanguage;
  readingLevel: ReadingLevel;
  clarify: PurposeLines | null;
  room: StartStepRoom | null;
  freePlan: boolean;
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
}>;
/**
 * The running side of a reading: its one AbortController, its timers, and the number of its latest lists post (a reading
 * posts again after the language choice; the earlier stream's last callbacks are then ignored).
 */
type Run = { readonly controller: AbortController; posts: number; giveUp: ReturnType<typeof setTimeout> | null;
  merge: ReturnType<typeof setTimeout> | null; landed: ReturnType<typeof setTimeout> | null };

const WAITING: ReadonlySet<ReadingPhase> = new Set(["CHECKING", "READING", "MERGING"]);

function freshReading(line: string): Reading {
  return {
    line, phase: "CHECKING", progress: null, checkRef: null, checkedLine: null, originalLine: null, languageOffer: null, refusal: null,
    lists: [], late: [], merging: false, menu: null, plan: null, landedKeys: [], noneReason: null, noneLine: null, justLanded: false
  };
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
    for (const timer of [run.giveUp, run.merge, run.landed]) if (timer !== null) clearTimeout(timer);
    run.giveUp = null;
    run.merge = null;
    run.landed = null;
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
  }, [clearGiveUp, commit, endNone]);

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
        checkedLine: posted, originalLine: original, progress: { answered: 0, of: event.data.seats } }));
    } else if (event.event === "language_offer") {
      clearGiveUp(run);
      commit(run, (current) => WAITING.has(current.phase) ? { ...current, phase: "LANGUAGE_CHOICE", languageOffer: event.data.offer } : current);
    } else if (event.event === "refused") {
      clearGiveUp(run);
      commit(run, (current) => WAITING.has(current.phase) ? { ...current, phase: "REFUSED", refusal: refusalOf(event.data.body) } : current);
    } else if (event.event === "progress") {
      commit(run, (current) => ({ ...current, progress: { answered: event.data.answered, of: event.data.of } }));
    } else if (event.event === "list") {
      commit(run, (current) => ({ ...current, lists: [...current.lists, event.data.list] }));
    } else if (event.event === "late_list") {
      commit(run, (current) => ({ ...current, late: [...current.late, event.data.list] }));
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
  }, [clearGiveUp, commit, endNone, merge, settleEnd]);

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

  const begin = useCallback((line: string): void => {
    const run: Run = { controller: new AbortController(), posts: 0, giveUp: null, merge: null, landed: null };
    runRef.current = run;
    const fresh = freshReading(line);
    readingRef.current = fresh;
    setReading(fresh);
    if (browserOffline()) {
      endNone(run, "TRANSPORT", "OFFLINE");
      return;
    }
    post(run, { question_line: line, site_language: latest.current.siteLanguage, reading_level: latest.current.readingLevel });
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

  // Effects read primitives only. A new read line stops the old reading; the line is read once, when active with the step on.
  useEffect(() => {
    if (readingRef.current !== null && readingRef.current.line !== questionLine) {
      stop();
      setReading(null);
    }
    if (!active || !listsOn || readingRef.current !== null) return;
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

  const dispatch = useCallback((action: PathPlanAction): PathPlanRefusal | null => {
    const run = runRef.current;
    const current = readingRef.current;
    if (run === null || current === null || current.plan === null || current.line !== latest.current.questionLine) return null;
    const result = pathPlanReduce(current.plan, action);
    if (result.plan !== current.plan) commit(run, (now) => ({ ...now, plan: result.plan }));
    return result.refusal;
  }, [commit]);

  const chooseLanguage = useCallback((choice: "USE_REWRITE" | "KEEP_MINE"): void => {
    const run = runRef.current;
    const current = readingRef.current;
    if (run === null || current === null || current.phase !== "LANGUAGE_CHOICE" || current.languageOffer === null) return;
    const offer = current.languageOffer;
    const rewrite = choice === "USE_REWRITE";
    const languageChoice: QuestionLanguageChoice = rewrite
      ? { check_ref: offer.check_ref, choice, original_question_line: current.line }
      : { check_ref: offer.check_ref, choice };
    commit(run, (now) => ({ ...now, phase: "CHECKING", languageOffer: null }));
    post(run, { question_line: rewrite ? offer.proposed_question : current.line, site_language: latest.current.siteLanguage,
      reading_level: latest.current.readingLevel, question_language_choice: languageChoice });
  }, [commit, post]);

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

  /** Paths still being written get at most the combine wait, then their joined words (FALLBACK). */
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
    if (now === null || runRef.current !== run || now.plan === null) throw new TypeError("START_HAND_OVER_NOT_READY");
    const plan = now.plan;
    const late = lateListsOf(now);
    const startPaths: StartPaths = { source: "MENU", menu, paths: [...pathPlanToStartPaths(plan)], width: plan.width, chosen_by: "PERSON",
      ...(late.length === 0 ? {} : { late_lists: [...late] }),
      ...(plan.questionSwap === null ? {} : { question_swap: { card_id: plan.questionSwap.cardId, original_question_line: plan.questionSwap.original } }) };
    return { questionLine: questionLineOut, ...withCheck, startPaths, ownWords: [...pathPlanOwnWords(plan)] };
  }, [writtenOrJoined]);

  const landedKeys = own?.landedKeys;
  const lateIdeas = plan === null || landedKeys === undefined ? 0
    : plan.more.filter((path) => path.isNew && !landedKeys.includes(path.key)).length;

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
    justLanded: own?.justLanded ?? false
  };
}
