"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { canDigFromLevel, type AnswerStory, type DigLinks, type DigSuggestion, type RunProjection, type UsageBorrow } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4ChangesBar } from "@/components/v4/V4ChangesBar";
import { V4MoneyLines, type V4DigChoice } from "@/components/v4/V4DigSuggest";
import { V4DigToast, type V4DigNotice } from "@/components/v4/V4DigToast";
import { V4Header } from "@/components/v4/V4Header";
import { digFor, digsUnder, openCount, pathTitle, resolveSelection, selectionIdOf, TitleText, V4MapTree } from "@/components/v4/V4MapTree";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { isNotFound } from "@/lib/api";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { digQuestion, digTargetQuestions, ownWords, parseDigQuestion } from "@/lib/v4/askText";
import { mergeDigLinks, readDigRecords, readLastVisit, recordDig, recordLastVisit, storableItems } from "@/lib/v4/accountMemory";
import { diffSnapshots, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import { effectiveDigMode } from "@/lib/v4/askConfig";
import { digLinksFor, digParentOf, mergeIndex, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import { loadDigView, loadStory, loadV4, storyReadFailed, type V4Load } from "@/lib/v4/load";
import { buildV4Map, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import {
  borrowLines,
  continueRun,
  digShareLine,
  monthPauseOf,
  readBorrowed,
  startsWaitLine,
  type ContinueOutcome,
  type MoneyLine
} from "@/lib/v4/money";
import {
  addPick,
  askParentOf,
  draftTarget,
  editPick,
  EMPTY_DRAFT,
  openPick,
  ownViewPick,
  pickedOpenIds,
  pickRefusal,
  picksMax,
  placesOf,
  removePick,
  suggestionPick,
  togglePick as toggleDraftPick
} from "@/lib/v4/suggestions";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import type {
  DigLink,
  DigMode,
  DigTarget,
  DigView,
  PendingDig,
  ReadingLevel,
  SeenSnapshot,
  V4Change,
  V4DigDraft,
  V4Map,
  V4Selection
} from "@/lib/v4/types";
import { useV4Ask, type V4AskOutcome } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (2026-10-28), the map page shell (D3 map, D4 what changed, D6/D7 phone). It loads the debate over
 * today's V3 reads, waits calmly while it runs, then lays out rail | map | panel and owns the dig flow (row D
 * decision 1: a dig starts at once with a 10-second Undo, nothing is sent before then). Every polling loop keeps one
 * request in flight at a time and stops when the page goes. Fix wave 1, Decision A: nothing is kept in the browser's
 * storage. V4 account memory (owner rulings N7 and N11, 2026-10-29): the account keeps each debate's last visit, so "what
 * changed" starts "since your last visit" (from any device) and goes on "while you were here"; and it keeps each dig's
 * link, so digs and the back link come from those records, with the account's question list (by text) only for digs
 * made before the records existed. Every read of that memory can fail; the page then does what it did without it.
 */

const RUN_POLL_MS = 5_000;
const RUN_POLL_AFTER_ERROR_MS = 30_000;
/** R2TIME-3: while the story is being written it is asked again after 10 s, then 20 s, 40 s, and every 60 s after. */
const STORY_POLL_FIRST_MS = 10_000;
const STORY_POLL_MAX_MS = 60_000;
/** R2TIME-3: the page stops waiting for a story still being written only after about this long in total. */
const STORY_WAIT_LIMIT_MS = 15 * 60_000;
/** DATA-3: a story read that failed is accepted only after this many failures in a row (V3's readFailureLimit). */
const STORY_READ_FAILURE_LIMIT = 4;
const DIG_POLL_MS = 15_000;
/** TIME-8/FIT-3: a dig read as done before its story was written is asked again, at most this many times. */
const DIG_HEADLESS_TRIES = 30;
/** TIME-1: a dig whose reads keep failing stops holding back "what changed" after this many failures. */
const DIG_FIRST_READ_FAILURES = 3;
/** Decision A: the account's question list is read again this often while a dig is going, and when all are final. */
const INDEX_POLL_BUSY_MS = 20_000;
const INDEX_POLL_IDLE_MS = 60_000;
/** R2DIG-3/R2TIME-5: a failed first read of the list is tried again after 5 s, and settles after 3 failures in a row. */
const INDEX_FIRST_RETRY_MS = 5_000;
const INDEX_FIRST_READ_FAILURES = 3;
/** R2DIG-7: re-reads ask only for the newest rows (a new dig is always among them) and merge them into the first read. */
const INDEX_REREAD_LIMIT = 20;
/** R2DIG-6: a dig's own page reads this many pages past the dig itself, to reach the older debate it came from. */
const INDEX_PARENT_PAGES = 2;
const UNDO_MS = 10_000;
/** N7: after the first save of a visit, later changes of the map are saved at most this often while the page is open. */
const VISIT_SAVE_MS = 10_000;
const CLOCK_TICK_MS = 15_000;
/** The reading level a page uses when the address names none (Decision A). */
const DEFAULT_LEVEL: ReadingLevel = "background";
/** Spec: desktop ≥ 1100 px, 768–1099 px a top strip, < 768 px the phone layout. */
const PHONE_QUERY = "(max-width: 767px)";
const MID_QUERY = "(max-width: 1099px)";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

type Layout = "desktop" | "mid" | "phone";
type LoadProblem = "NOT_FOUND" | "UNREACHABLE";

/** What the page last read of one dig, and how its reads went. */
type DigStatus = Readonly<{
  view: Pick<DigView, "state" | "headline" | "counts"> | null;
  /** Failed reads in a row. */
  failures: number;
  /** Reads that found it done but without its story headline yet. */
  headlessTries: number;
}>;

const NO_STATUS: DigStatus = { view: null, failures: 0, headlessTries: 0 };
/** RULES-4/TIME-1: a dig not read yet shows as working, never as "waiting for a free spot" and never vanishes. */
const STAND_IN: NonNullable<DigStatus["view"]> = { state: "RUNNING", headline: null, counts: null };

/**
 * Decision A: the digs started in this tab, in memory only (gone on reload). Module-level so they survive moving
 * between V4 pages without a reload: the dig's own page then knows when it started and where it came from.
 */
type VisitDig = Readonly<{ link: DigLink; parentQuestion: string }>;
const startedThisVisit = new Map<string, VisitDig>();

export type V4DebateClientProps = Readonly<{
  id: string;
  /** The reading level the address names (`?level=`), or null. */
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
}>;

/** Every V3 read is asker-scoped, so the page waits for a session first (the classic page does the same). */
export function V4DebateClient(props: V4DebateClientProps) {
  return (
    <AuthGate catalog={props.newDebateCatalog}>
      {() => (
        // Keyed by id: moving between two debates (a dig's back link) starts fresh, never with the last one's state.
        <V4Debate key={props.id} {...props} />
      )}
    </AuthGate>
  );
}

/** Desktop on the server render and the first paint; the real width is read once mounted. */
function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("desktop");
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const mid = window.matchMedia(MID_QUERY);
    const update = (): void => setLayout(phone.matches ? "phone" : mid.matches ? "mid" : "desktop");
    update();
    phone.addEventListener("change", update);
    mid.addEventListener("change", update);
    return () => {
      phone.removeEventListener("change", update);
      mid.removeEventListener("change", update);
    };
  }, []);
  return layout;
}

/** "HH:MM" in the page's language, or null when the time cannot be read. */
function clockTime(iso: string | null | undefined, locale: string): string | null {
  if (typeof iso !== "string") return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(when);
  }
}

function isRunning(dig: DigView): boolean {
  return dig.state === "WAITING" || dig.state === "RUNNING";
}

/** No more reads needed: it failed, or it is done with its headline (or we stopped waiting for the headline). */
function isFinal(status: DigStatus | undefined): boolean {
  const view = status?.view ?? null;
  if (view === null) return false;
  if (view.state === "FAILED") return true;
  return view.state === "DONE" && (view.headline !== null || (status?.headlessTries ?? 0) >= DIG_HEADLESS_TRIES);
}

/** Read once, or given up on for now (TIME-1): only then may "what changed" take its baseline. */
function isSettled(status: DigStatus | undefined): boolean {
  return status !== undefined && (status.view !== null || status.failures >= DIG_FIRST_READ_FAILURES);
}

function linkKeyOf(links: readonly DigLink[]): string {
  return links.map((link) => link.childRunId).join("|");
}

/** What the phone's pinned dig button digs into, and whether it reads "Dig here too" (a dig is already there). */
type PhoneTarget = Readonly<{ target: DigTarget; again: boolean }>;

/**
 * What the phone's pinned "Dig deeper here" digs into: a path (the person's picks on it, when there are some) or one
 * open question (never the root or a dig). W3-4: an open question that already has a dig, and a path that has one (or
 * any path of a dig's own map), offer "Dig here too"; at the deepest level nothing is offered.
 */
function targetOf(map: V4Map, digs: readonly DigView[], selection: V4Selection, choice: V4DigChoice): PhoneTarget | null {
  if (!choice.canDig) return null;
  if (selection.startsWith("path:")) {
    const path = map.paths.find((candidate) => `path:${candidate.id}` === selection);
    if (path === undefined) return null;
    const mine = choice.draft.group === path.id ? draftTarget(choice.draft, map.paths) : null;
    return { target: mine ?? { kind: "path", path }, again: choice.digHereToo(path.id) };
  }
  if (selection.startsWith("open:")) {
    const question = uniqueOpenQuestions(map).find((candidate) => `open:${candidate.id}` === selection);
    return question === undefined ? null : { target: { kind: "open", questions: [question] }, again: digFor(question, digs) !== null };
  }
  return null;
}

/**
 * "While you were here" (fix wave 1): which live changes are news. A dig this tab started is not news when it appears
 * (the person just started it), nor is it while it is still going; it is news when it finishes or fails, and a dig that
 * appears from elsewhere (another tab) is news. An open question turning "dug" is told by its dig, not twice.
 */
function isNews(change: V4Change, startedHere: ReadonlySet<string>): boolean {
  if (change.id.startsWith("dig:")) {
    if (change.kind === "ADDED") return !startedHere.has(change.id.slice("dig:".length));
    return change.now === "DONE" || change.now === "FAILED";
  }
  if (change.id.startsWith("open:")) return change.kind === "ADDED";
  return true;
}

/** N7: the debate's last visit as the account kept it — still being read, read (null: no visit yet), or unreadable. */
type LastVisitRead =
  | Readonly<{ status: "PENDING" }>
  | Readonly<{ status: "READ"; snapshot: SeenSnapshot | null }>
  | Readonly<{ status: "FAILED" }>;

/**
 * N7: the news a last visit's snapshot gives on the first complete load. The story arriving since (the stand-in path,
 * fate "none", gave way to the story's paths) is one piece of news at the question, as R2TIME-1 tells it live.
 */
function visitNews(stored: Readonly<Record<string, string>>, now: Readonly<Record<string, string>>, map: V4Map,
  startedHere: ReadonlySet<string>): readonly V4Change[] {
  let fresh = diffSnapshots({ at: "", items: stored }, storableItems(now)).filter((change) => isNews(change, startedHere));
  const standIn = (items: Readonly<Record<string, string>>) => Object.entries(items).some(([id, word]) => id.startsWith("path:") && word === "none");
  if (standIn(stored) && !standIn(now)) {
    fresh = fresh.filter((change) => !change.id.startsWith("path:"));
    if (map.storyState === "READY") fresh = [{ id: `story:${map.answerId}`, kind: "CHANGED", before: "WRITING", now: "READY" }, ...fresh];
  }
  return fresh;
}

function V4Debate({
  id,
  initialLevel,
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint
}: V4DebateClientProps) {
  const layout = useLayout();
  const [chosenLevel, chooseLevel] = useReadingLevel(initialLevel);
  const readingLevel: ReadingLevel = chosenLevel ?? DEFAULT_LEVEL;
  const [digMode, setDigMode] = useState<DigMode>("quick");

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── The debate: poll the run until it is served or failed ─────────────────────────────────────────────────────────
  const [load, setLoad] = useState<V4Load | null>(null);
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const next = await loadV4(id);
        if (!active) return;
        setLoad(next);
        setLoadProblem(null);
        if (next.kind === "RUN" && next.run.state !== "FAILED") timer = window.setTimeout(() => void tick(), RUN_POLL_MS);
      } catch (failure) {
        if (!active) return;
        if (isNotFound(failure)) {
          setLoadProblem("NOT_FOUND");
          return;
        }
        // Spec: back off to 30 s after an error; the page keeps what it last showed.
        setLoadProblem("UNREACHABLE");
        timer = window.setTimeout(() => void tick(), RUN_POLL_AFTER_ERROR_MS);
      }
    };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, loadAttempt]);

  const served = load?.kind === "SERVED" ? load : null;
  const runId = load?.runId ?? id;
  const answerId = served?.answer.answer_id ?? null;
  const answerVersion = served?.answer.answer_version ?? 1;
  /** The whole text that was sent for this debate (the person's words plus any added lines). */
  const questionLine = served !== null ? served.answer.question_line : load?.kind === "RUN" ? load.run.question_line : null;

  // ── The story: while it is missing, being written or its read failed, ask again, backing off (R2TIME-3) ─────────
  const [polledStory, setPolledStory] = useState<Readonly<{ answerId: string; story: AnswerStory | null }> | null>(null);
  const [storyGaveUp, setStoryGaveUp] = useState(false);
  const story = polledStory !== null && polledStory.answerId === answerId ? polledStory.story : served?.story ?? null;
  const storyFailedRead = story !== null && storyReadFailed(story);
  const storyPending = served !== null && !storyGaveUp && (story === null || story.status === "WRITING" || storyFailedRead);
  const storyFailedReadRef = useRef(storyFailedRead);
  useEffect(() => {
    storyFailedReadRef.current = storyFailedRead;
  });
  useEffect(() => {
    if (answerId === null || !storyPending) return;
    let active = true;
    let timer: number | undefined;
    // R2TIME-3: no cap on tries while the story is being written (the server's own window ends WRITING); the page
    // gives up only after the read-failure limit or about 15 minutes, so it never claims to update when it no longer asks.
    const waitStarted = Date.now();
    let delay = STORY_POLL_FIRST_MS;
    // The read the page already holds counts: a failed one is the first of the four in a row (DATA-3).
    let failuresInARow = storyFailedReadRef.current ? 1 : 0;
    const tick = async (): Promise<void> => {
      let next: AnswerStory | null = null;
      let failed = false;
      try {
        next = await loadStory(answerId, undefined, answerVersion);
      } catch {
        failed = true;
      }
      if (!active) return;
      if (!failed) setPolledStory({ answerId, story: next });
      const readFailed = failed || (next !== null && storyReadFailed(next));
      failuresInARow = readFailed ? failuresInARow + 1 : 0;
      if (!readFailed && next !== null && next.status !== "WRITING") return;
      if (failuresInARow >= STORY_READ_FAILURE_LIMIT || Date.now() - waitStarted >= STORY_WAIT_LIMIT_MS) {
        setStoryGaveUp(true);
        return;
      }
      delay = Math.min(STORY_POLL_MAX_MS, delay * 2);
      timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answerId, answerVersion, storyPending]);

  // TIME-6/FIT-5: once the page stops waiting, the map says the summary is unavailable, not "still being written".
  const map = useMemo<V4Map | null>(
    () => (served === null ? null : buildV4Map({ runId: served.runId, answer: served.answer, story, storyGaveUp })),
    [served, story, storyGaveUp]
  );
  const servedRunId = served?.runId ?? null;
  const servedQuestionLine = served?.answer.question_line ?? null;

  // ── The account's question list (Decision A): digs and the back link are found again in it, by text ───────────
  const [index, setIndex] = useState<readonly IndexEntry[]>([]);
  /** The first read of the list succeeded, or failed 3 times in a row: only then may "what changed" take its baseline. */
  const [indexSettled, setIndexSettled] = useState(false);
  const digsLiveRef = useRef(false);
  /** R2DIG-3: set when the first successful read lands after the baseline was taken; its digs are folded in, not news. */
  const foldArmed = useRef(false);
  /** The "while you were here" baseline (declared here: the index loop checks it when its first read lands late). */
  const baseline = useRef<Readonly<Record<string, string>> | null>(null);
  const hasLoad = load !== null;
  const isServed = served !== null;
  const servedNowRef = useRef(isServed);
  const runIdRef = useRef(runId);
  /** R2RULES-8 / R2DIG-6: this debate is itself a dig (its question names an earlier one). */
  const isDigPage = useMemo(
    () => questionLine !== null && parseDigQuestion(questionLine, catalog) !== null,
    [questionLine, catalog]
  );
  const isDigPageRef = useRef(isDigPage);
  useEffect(() => {
    servedNowRef.current = isServed;
    runIdRef.current = runId;
    isDigPageRef.current = isDigPage;
  });
  const indexLoop = useRef<Readonly<{ kick: () => void }> | null>(null);
  useEffect(() => {
    if (!hasLoad) return;
    let active = true;
    let busy = false;
    let timer: number | undefined;
    let loadedOk = false;
    let failures = 0;
    let known: readonly IndexEntry[] = [];
    const arm = (ms: number): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), ms);
    };
    const nextInterval = (): number => (digsLiveRef.current ? INDEX_POLL_BUSY_MS : INDEX_POLL_IDLE_MS);
    const tick = async (): Promise<void> => {
      window.clearTimeout(timer);
      timer = undefined;
      if (busy) return;
      // R2DIG-7: no re-reads while the tab is hidden; coming back to it reads once (the listener below).
      if (loadedOk && document.visibilityState === "hidden") return;
      busy = true;
      try {
        // R2DIG-6: the first read pages until this debate is seen (digs are newer, so they all come first); a dig's own
        // page reads two pages more to reach the debate it came from. Later reads take only the newest rows.
        const fresh = loadedOk
          ? await readQuestionIndex(undefined, { limit: INDEX_REREAD_LIMIT })
          : await readQuestionIndex(undefined, {
            untilRunId: runIdRef.current,
            extraPages: isDigPageRef.current ? INDEX_PARENT_PAGES : 0
          });
        busy = false;
        if (!active) return;
        known = mergeIndex(known, fresh);
        if (!loadedOk) {
          loadedOk = true;
          failures = 0;
          // R2DIG-3: the baseline was already taken without these digs (the first reads failed): fold them in.
          if (baseline.current !== null) foldArmed.current = true;
        }
        setIndex(known);
        setIndexSettled(true);
        // A run page reads once (for the back link) and waits until the answer is served.
        if (servedNowRef.current) arm(nextInterval());
      } catch {
        busy = false;
        if (!active) return;
        if (loadedOk) {
          // Quiet: the digs already found still show; the list is asked again later.
          if (servedNowRef.current) arm(nextInterval());
          return;
        }
        // R2TIME-5: a failed first read is tried again soon; after 3 in a row it stops holding back the baseline,
        // and a served page keeps trying slowly so the digs can still appear (folded in, not as news).
        failures += 1;
        if (failures < INDEX_FIRST_READ_FAILURES) {
          arm(INDEX_FIRST_RETRY_MS);
          return;
        }
        setIndexSettled(true);
        if (servedNowRef.current) arm(INDEX_POLL_IDLE_MS);
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== "visible" || !loadedOk || !servedNowRef.current || busy) return;
      void tick();
    };
    // The answer was served after the page opened: start the regular reads (or retry a first read that never worked).
    indexLoop.current = {
      kick: () => {
        if (busy || timer !== undefined) return;
        if (loadedOk || failures >= INDEX_FIRST_READ_FAILURES) arm(loadedOk ? nextInterval() : 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      indexLoop.current = null;
    };
  }, [hasLoad]);
  useEffect(() => {
    if (isServed) indexLoop.current?.kick();
  }, [isServed]);

  // ── The dig records (N11): which debates were dug from this one, and the one it was dug from ─────────────────────
  // Read like the question list: at once, again while digs run (or slowly when all are final), once when the tab comes
  // back. A first read that keeps failing settles after 3 tries, and the page goes on with the digs found by text.
  const [digRecords, setDigRecords] = useState<DigLinks | null>(null);
  const [recordsSettled, setRecordsSettled] = useState(false);
  const recordsLoop = useRef<Readonly<{ kick: () => void }> | null>(null);
  useEffect(() => {
    if (!hasLoad) return;
    let active = true;
    let busy = false;
    let timer: number | undefined;
    let loadedOk = false;
    let failures = 0;
    const arm = (ms: number): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), ms);
    };
    const nextInterval = (): number => (digsLiveRef.current ? INDEX_POLL_BUSY_MS : INDEX_POLL_IDLE_MS);
    const tick = async (): Promise<void> => {
      window.clearTimeout(timer);
      timer = undefined;
      if (busy) return;
      if (loadedOk && document.visibilityState === "hidden") return;
      busy = true;
      try {
        const next = await readDigRecords(runIdRef.current);
        busy = false;
        if (!active) return;
        if (!loadedOk) {
          loadedOk = true;
          failures = 0;
          // As R2DIG-3 for the list: digs first seen after the baseline was taken are folded in, not news.
          if (baseline.current !== null) foldArmed.current = true;
        }
        setDigRecords(next);
        setRecordsSettled(true);
        if (servedNowRef.current) arm(nextInterval());
      } catch {
        busy = false;
        if (!active) return;
        if (loadedOk) {
          if (servedNowRef.current) arm(nextInterval());
          return;
        }
        failures += 1;
        if (failures < INDEX_FIRST_READ_FAILURES) {
          arm(INDEX_FIRST_RETRY_MS);
          return;
        }
        setRecordsSettled(true);
        if (servedNowRef.current) arm(INDEX_POLL_IDLE_MS);
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== "visible" || !loadedOk || !servedNowRef.current || busy) return;
      void tick();
    };
    recordsLoop.current = {
      kick: () => {
        if (busy || timer !== undefined) return;
        if (loadedOk || failures >= INDEX_FIRST_READ_FAILURES) arm(loadedOk ? nextInterval() : 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      recordsLoop.current = null;
    };
  }, [hasLoad]);
  useEffect(() => {
    if (isServed) recordsLoop.current?.kick();
  }, [isServed]);
  /** N11: the record of the dig this debate is (null when it is not one, or when the records could not be read). */
  const recordParent = digRecords?.parent ?? null;

  // ── The dig level (W3-4): how many digs sit above this debate, never how far one debate's argument tree grows ────
  // The answer says it (`Answer.dig.level`); a dig whose answer does not say is still a dig (its question or its record
  // names a parent), so it offers "Dig here too" on every path, and the API refuses one past the deepest level.
  const mapLevel = map?.digLevel ?? null;
  const isDigMap = mapLevel !== null ? mapLevel > 0 : isDigPage || recordParent !== null;
  const canDig = mapLevel === null || canDigFromLevel(mapLevel);

  // ── What the person chose to dig (W3-4): picks of one path, kept in memory only ─────────────────────────────────
  const [draft, setDraft] = useState<V4DigDraft>(EMPTY_DRAFT);
  const draftRef = useRef(draft);
  const commitDraft = useCallback((next: V4DigDraft): void => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  const ownViewSerial = useRef(0);
  // W3-4 (owner Q14): the room read is for the dig the page would send now, so it says the dig's share of today.
  const ask = useV4Ask({
    catalog, homeCatalog, newDebateCatalog, locale, crisisCountryHint, mode: digMode, readingLevel,
    dig: servedRunId === null || !canDig ? null : { parentRunId: servedRunId, picks: draft.picks.length }
  });
  const planTier = ask.planTier;

  // ── The money rule (owner, 31 Oct): what running work borrowed from tomorrow or next week, read once ────────────
  const [borrowed, setBorrowed] = useState<readonly UsageBorrow[]>([]);
  useEffect(() => {
    if (!hasLoad) return;
    let active = true;
    void readBorrowed().then((next) => {
      if (active) setBorrowed(next);
    });
    return () => {
      active = false;
    };
  }, [hasLoad]);

  // ── Digs: the ones started in this visit (memory) merged with the recorded ones and the ones found by text ──────
  const [visitLinks, setVisitLinks] = useState<readonly DigLink[]>(() => [...startedThisVisit.values()].map((entry) => entry.link));
  const links = useMemo<readonly DigLink[]>(() => {
    if (map === null || servedRunId === null || servedQuestionLine === null) return [];
    const mine = visitLinks.filter((link) => link.parentRunId === servedRunId);
    const mineById = new Map(mine.map((link) => [link.childRunId, link]));
    // Oldest first (the order they were started). A dig started here keeps its exact link (mode, start time). N11: the
    // records decide which debates are digs of this one; the text finds only digs without a record.
    const found = mergeDigLinks(digRecords, digLinksFor(servedRunId, servedQuestionLine, map, index, catalog), map);
    const foundIds = new Set(found.map((link) => link.childRunId));
    return [
      ...found.map((link) => mineById.get(link.childRunId) ?? link),
      ...mine.filter((link) => !foundIds.has(link.childRunId))
    ];
  }, [map, servedRunId, servedQuestionLine, visitLinks, index, digRecords, catalog]);
  const linkKey = linkKeyOf(links);

  const [statuses, setStatuses] = useState<ReadonlyMap<string, DigStatus>>(() => new Map());
  const statusesRef = useRef(statuses);
  const linksRef = useRef(links);
  useEffect(() => {
    linksRef.current = links;
  });
  const digs = useMemo<readonly DigView[]>(
    () => links.map((link) => {
      const view = statuses.get(link.childRunId)?.view ?? STAND_IN;
      return { link, state: view.state, headline: view.headline, counts: view.counts };
    }),
    [links, statuses]
  );
  useEffect(() => {
    digsLiveRef.current = links.some((link) => !isFinal(statuses.get(link.childRunId)));
  }, [links, statuses]);

  // One loop per debate, one round of reads in flight; a new link "kicks" it instead of starting a second loop.
  const digLoop = useRef<Readonly<{ kick: () => void; seenKey: () => string }> | null>(null);
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    let busy = false;
    let again = false;
    let timer: number | undefined;
    let seenKey = "";
    const tick = async (): Promise<void> => {
      window.clearTimeout(timer);
      timer = undefined;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      const current = linksRef.current;
      seenKey = linkKeyOf(current);
      const due = current.filter((link) => !isFinal(statusesRef.current.get(link.childRunId)));
      const results = await Promise.all(due.map(async (link) => {
        try {
          return { childRunId: link.childRunId, view: await loadDigView(link) };
        } catch {
          return { childRunId: link.childRunId, view: null };
        }
      }));
      busy = false;
      if (!active) return;
      const next = new Map(statusesRef.current);
      for (const result of results) {
        const before = next.get(result.childRunId) ?? NO_STATUS;
        if (result.view === null) {
          // TIME-1: a failed read keeps what was shown (or the stand-in), never drops the dig.
          next.set(result.childRunId, { ...before, failures: before.failures + 1 });
          continue;
        }
        const { state, headline, counts } = result.view;
        const headless = state === "DONE" && headline === null;
        next.set(result.childRunId, {
          view: { state, headline, counts },
          failures: 0,
          headlessTries: headless ? before.headlessTries + 1 : before.headlessTries
        });
      }
      statusesRef.current = next;
      setStatuses(next);
      if (again) {
        again = false;
        void tick();
        return;
      }
      if (linksRef.current.some((link) => !isFinal(next.get(link.childRunId)))) {
        timer = window.setTimeout(() => void tick(), DIG_POLL_MS);
      }
    };
    digLoop.current = { kick: () => void tick(), seenKey: () => seenKey };
    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
      digLoop.current = null;
    };
  }, [servedRunId]);
  useEffect(() => {
    const loop = digLoop.current;
    if (loop !== null && loop.seenKey() !== linkKey) loop.kick();
  }, [linkKey]);

  // ── Selection ───────────────────────────────────────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<V4Selection>("root");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(["root"]));
  const [focusRequest, setFocusRequest] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const panelColRef = useRef<HTMLElement | null>(null);
  const shownSelection: V4Selection = map === null ? "root" : selectionIdOf(resolveSelection(map, digs, selected));
  const sheetOpen = layout === "phone" && outlineOpen;

  const select = useCallback((selection: V4Selection, viaKeyboard: boolean): void => {
    setSelected(selection);
    setOpened((previous) => (previous.has(selection) ? previous : new Set([...previous, selection])));
    // Phone: tapping a row of the outline opens it in the panel, so the sheet closes.
    if (layout === "phone" && outlineOpen) setOutlineOpen(false);
    // UI-5: on the phone the new question always opens at its heading (focus scrolls it into view).
    if (viaKeyboard || layout === "phone") setFocusRequest((count) => count + 1);
  }, [layout, outlineOpen]);

  useEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

  // R2TIME-4/R2REG-4: closing the phone map puts focus back on the Map button, unless a row already moved it on to
  // the panel heading (the effect above runs first in the same commit). The button is a new one by then, so the ref
  // points at the one on screen.
  const mapButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (sheetWasOpen.current && !sheetOpen && (document.activeElement === document.body || document.activeElement === null)) {
      mapButtonRef.current?.focus();
    }
    sheetWasOpen.current = sheetOpen;
  }, [sheetOpen]);

  // UI-5: the side panel scrolls on its own; a new question starts at its top, not where the last one was left.
  useEffect(() => {
    if (panelColRef.current !== null) panelColRef.current.scrollTop = 0;
  }, [shownSelection]);

  // ── Picks for the tray (row D decision 1; W3-4: any pick shows the tray, which digs them together) ─────────────
  // Owner Q-D1: picks stay on one path; a pick box of another path is closed while picks wait (lib/v4/suggestions.ts
  // refuses it too). FIT-1: a point still argued under two paths is one pick, sent once.
  const picked = useMemo<ReadonlySet<string>>(() => pickedOpenIds(draft), [draft]);
  const togglePick = useCallback((openQuestionId: string): void => {
    if (map === null || !canDig) return;
    const question = uniqueOpenQuestions(map).find((candidate) => candidate.id === openQuestionId);
    if (question === undefined) return;
    commitDraft(toggleDraftPick(draftRef.current, openPick(question), planTier).draft);
  }, [map, canDig, planTier, commitDraft]);
  const choice = useMemo<V4DigChoice | undefined>(() => {
    if (map === null) return undefined;
    const keep = (change: Readonly<{ draft: V4DigDraft; refused: ReturnType<typeof pickRefusal> }>) => {
      if (change.refused === null) commitDraft(change.draft);
      return change.refused;
    };
    return {
      draft,
      planTier,
      canDig,
      digHereToo: (pathId: string) => canDig && (isDigMap || digsUnder(map, digs, pathId).length > 0),
      refusalFor: (group: string | null) => pickRefusal(draft, group, planTier),
      onToggleSuggestion: (pathId: string, suggestion: DigSuggestion) => {
        if (canDig) keep(toggleDraftPick(draftRef.current, suggestionPick(pathId, suggestion), planTier));
      },
      onEditPick: (key: string, text: string) => keep(editPick(draftRef.current, key, text)),
      onAddOwnView: (pathId: string, text: string) => {
        ownViewSerial.current += 1;
        return keep(addPick(draftRef.current, ownViewPick(pathId, text, ownViewSerial.current), planTier));
      },
      onRemovePick: (key: string) => commitDraft(removePick(draftRef.current, key)),
      onClear: () => commitDraft(EMPTY_DRAFT)
    };
  }, [map, draft, planTier, canDig, isDigMap, digs, commitDraft]);
  const trayTarget = map === null || !canDig ? null : draftTarget(draft, map.paths);
  const hasTray = trayTarget !== null;

  // ── The dig flow ────────────────────────────────────────────────────────────────────────────────────────────────
  const [pending, setPending] = useState<PendingDig | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<V4DigNotice | null>(null);
  const digBusy = pending !== null || sending || ask.submitting;
  // Owner N13: Free has no Quick look / Thorough choice; its digs are quick looks.
  const sentDigMode = effectiveDigMode(digMode, planTier);

  const startDig = useCallback((target: DigTarget): void => {
    // W3-4: nothing is dug from the deepest level (the page offers no button there; this holds it).
    if (digBusy || map === null || !canDig) return;
    setNotice(null);
    setPending({ target, mode: sentDigMode, sendsAt: Date.now() + UNDO_MS });
  }, [digBusy, map, canDig, sentDigMode]);

  const undoDig = useCallback((): void => setPending(null), []);

  const send = async (dig: PendingDig, parentRunId: string, parentQuestionLine: string): Promise<void> => {
    setPending(null);
    setSending(true);
    let outcome: V4AskOutcome;
    try {
      // ASK-4: a dig carries AI-written text, so it is sent as a dig (no client crisis pop-up on AI words). W3-4: with its
      // parent (the debate it digs, the places, the mode and the picks as sent).
      outcome = await ask.submit(digQuestion(dig.target, parentQuestionLine, catalog, locale), dig.mode, "dig",
        askParentOf(parentRunId, dig.target, dig.mode));
    } catch {
      outcome = { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
    }
    if (outcome.kind === "STARTED") {
      const link: DigLink = {
        parentRunId,
        childRunId: outcome.runId,
        openQuestionIds: placesOf(dig.target),
        questions: digTargetQuestions(dig.target),
        mode: dig.mode,
        startedAt: new Date().toISOString()
      };
      // Kept for this visit even when the page has gone meanwhile (Decision A: memory only), and in the account (N11:
      // which debate it came from, where on the map, its mode). Best-effort: without the record it is found by text.
      startedThisVisit.set(link.childRunId, { link, parentQuestion: ownWords(parentQuestionLine) });
      void recordDig(link);
      if (!mounted.current) return;
      // Shown at once (as working); the dig loop reads its real state straight away.
      setVisitLinks((previous) => [...previous.filter((known) => known.childRunId !== link.childRunId), link]);
      // The picks it was made of are taken off the tray (picks made during the send stay).
      const sentKeys = new Set(dig.target.kind === "picks"
        ? dig.target.picks.map((pick) => pick.key)
        : dig.target.kind === "open" ? dig.target.questions.map((question) => `open:${question.id}`) : []);
      if (sentKeys.size > 0) {
        commitDraft([...sentKeys].reduce((left, key) => removePick(left, key), draftRef.current));
      }
      const selection: V4Selection = `dig:${link.childRunId}`;
      setSelected(selection);
      setOpened((previous) => new Set([...previous, selection]));
      setNotice({ kind: "STARTED" });
    } else if (outcome.kind === "REFUSED") {
      if (!mounted.current) return;
      setNotice({ kind: "REFUSED", message: outcome.message });
    }
    if (mounted.current) setSending(false);
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // Nothing is sent before `sendsAt`. Undo (pending → null) and leaving the page both clear the timer.
  useEffect(() => {
    if (pending === null || servedRunId === null || servedQuestionLine === null) return;
    const timer = window.setTimeout(
      () => void sendRef.current(pending, servedRunId, servedQuestionLine),
      Math.max(0, pending.sendsAt - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [pending, servedRunId, servedQuestionLine]);

  // ── What changed since your last visit and while you were here (D4, fix wave 1, N7) ─────────────────────────────
  // The first complete load (map + every dig read once + the question list and dig records read once + the last visit
  // read) is the baseline; when the account kept a last visit, what differs from it is the first news ("since your last
  // visit"). Later live changes are news too ("while you were here"), each with a dot and a tour stop. The map as shown
  // is saved as the new last visit after the first complete load, then at most every 10 s while it changes; nothing is
  // kept in the browser (Decision A). A last visit that could not be read is never overwritten in this visit.
  const [lastVisit, setLastVisit] = useState<LastVisitRead>({ status: "PENDING" });
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    readLastVisit(servedRunId).then(
      (snapshot) => { if (active) setLastVisit({ status: "READ", snapshot }); },
      () => { if (active) setLastVisit({ status: "FAILED" }); }
    );
    return () => {
      active = false;
    };
  }, [servedRunId]);
  /** How many of the first news items came from the last visit (the bar says "since your last visit" while one shows). */
  const [visitNewsCount, setVisitNewsCount] = useState(0);
  const visitSave = useRef<{ timer: number | undefined; items: Readonly<Record<string, string>> | null; sent: string | null }>(
    { timer: undefined, items: null, sent: null });
  /** Saves `items` as this debate's last visit unless they are what was saved last. Best-effort; never throws. */
  const saveVisit = useCallback((runIdToSave: string, items: Readonly<Record<string, string>>): void => {
    const key = JSON.stringify(storableItems(items));
    if (key === visitSave.current.sent) return;
    visitSave.current.sent = key;
    void recordLastVisit(runIdToSave, items);
  }, []);
  useEffect(() => {
    // Leaving the debate (or the page) saves a change still waiting for its timer.
    if (servedRunId === null) return;
    const pendingSave = visitSave.current;
    return () => {
      if (pendingSave.timer === undefined || pendingSave.items === null) return;
      window.clearTimeout(pendingSave.timer);
      pendingSave.timer = undefined;
      saveVisit(servedRunId, pendingSave.items);
    };
  }, [servedRunId, saveVisit]);
  const [news, setNews] = useState<readonly V4Change[]>([]);
  /** R2TIME-6: how many news items "Hide this" put away; news that lands after it brings the bar back. */
  const [hiddenNews, setHiddenNews] = useState(0);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  /** The story state the baseline last saw (R2TIME-1: the story arriving is one piece of news, not one per question). */
  const baselineStory = useRef<V4Map["storyState"] | null>(null);
  /** R2DIG-3: digs found by a first read that landed after the baseline; their first appearance is not news. */
  const foldIds = useRef<ReadonlySet<string>>(new Set());
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  });
  // Runs before the baseline effect below in the same commit, while the new links are not read yet.
  useEffect(() => {
    if (!foldArmed.current || baseline.current === null) return;
    foldArmed.current = false;
    const known = baseline.current;
    foldIds.current = new Set(links
      .filter((link) => !startedThisVisit.has(link.childRunId) && !(`dig:${link.childRunId}` in known))
      .map((link) => link.childRunId));
  }, [links]);
  const digsSettled = indexSettled && recordsSettled && links.every((link) => isSettled(statuses.get(link.childRunId)));
  const liveReady = map !== null && digsSettled && lastVisit.status !== "PENDING";
  useEffect(() => {
    if (!liveReady || map === null || servedRunId === null) return;
    const items = snapshotItems(map, digs);
    const before = baseline.current;
    const storyBefore = baselineStory.current;
    baseline.current = items;
    baselineStory.current = map.storyState;
    const startedHere = new Set(visitLinks.map((link) => link.childRunId));
    if (lastVisit.status === "READ") {
      // N7: the first save at once, later ones gathered for VISIT_SAVE_MS (the newest map wins).
      if (before === null) saveVisit(servedRunId, items);
      else {
        visitSave.current.items = items;
        if (visitSave.current.timer === undefined) {
          visitSave.current.timer = window.setTimeout(() => {
            visitSave.current.timer = undefined;
            if (visitSave.current.items !== null) saveVisit(servedRunId, visitSave.current.items);
          }, VISIT_SAVE_MS);
        }
      }
    }
    if (before === null) {
      // N7: since the last visit the account kept (none on a first visit, or when it could not be read).
      if (lastVisit.status !== "READ" || lastVisit.snapshot === null) return;
      const fresh = visitNews(lastVisit.snapshot.items, items, map, startedHere);
      if (fresh.length === 0) return;
      setNews(fresh);
      setVisitNewsCount(fresh.length);
      return;
    }
    let fresh = diffSnapshots({ at: "", items: before }, items).filter((change) => isNews(change, startedHere));
    // R2DIG-3: a dig that already existed but was missed by the failed first reads is folded into the baseline.
    if (foldIds.current.size > 0) {
      const folding = foldIds.current;
      const foldedOpen = new Set(digs
        .filter((dig) => folding.has(dig.link.childRunId))
        .flatMap((dig) => dig.link.openQuestionIds));
      fresh = fresh.filter((change) => {
        if (change.id.startsWith("dig:") && change.kind === "ADDED") return !folding.has(change.id.slice("dig:".length));
        if (change.id.startsWith("open:")) return !foldedOpen.has(change.id.slice("open:".length));
        return true;
      });
      foldIds.current = new Set([...folding].filter((childRunId) => !(`dig:${childRunId}` in items)));
    }
    // R2TIME-1: the story arriving redraws every question under the answer; that is one piece of news at the question.
    if (storyBefore !== null && storyBefore !== map.storyState) {
      fresh = fresh.filter((change) => !change.id.startsWith("path:"));
      if (map.storyState === "READY") {
        fresh = [{ id: `story:${map.answerId}`, kind: "CHANGED", before: storyBefore, now: map.storyState }, ...fresh];
      }
    }
    if (fresh.length === 0) return;
    setNews((previous) => [...previous, ...fresh]);
    // A question opened earlier gets its "New" dot back when news lands on it (not the one on screen now).
    const landed = new Set<string>(fresh.map((change) => selectionForChange(map, change)));
    setOpened((previous) => new Set([...previous].filter((stop) => !landed.has(stop) || stop === selectedRef.current)));
  }, [liveReady, map, digs, visitLinks, servedRunId, lastVisit, saveVisit]);

  // RULES-11/FIT-7: the bar counts stops (questions), the same unit the tour numbers; news on the question itself is
  // one stop too, so every change can be reached.
  const stopsOf = useCallback((changes: readonly V4Change[]): readonly V4Selection[] => {
    if (map === null) return [];
    const stops: V4Selection[] = [];
    for (const change of changes) {
      const stop = selectionForChange(map, change);
      if (!stops.includes(stop)) stops.push(stop);
    }
    return stops;
  }, [map]);
  // R2TIME-6: the bar and its tour cover the news since the last "Hide this"; the "New" dots cover all news.
  const tourStops = useMemo<readonly V4Selection[]>(() => stopsOf(news.slice(hiddenNews)), [stopsOf, news, hiddenNews]);
  const changed = useMemo<ReadonlySet<string>>(
    () => new Set(stopsOf(news).filter((stop) => stop !== "root" && !opened.has(stop))),
    [stopsOf, news, opened]
  );

  const onTour = useCallback((): void => {
    if (tourStops.length === 0) return;
    const next = tourIndex === null ? 0 : tourIndex + 1;
    if (next >= tourStops.length) {
      setTourIndex(null);
      select("root", false);
      return;
    }
    setTourIndex(next);
    select(tourStops[next]!, false);
  }, [tourStops, tourIndex, select]);

  // ── The back link of a dig, and when it started ─────────────────────────────────────────────────────────────────
  // A dig started in this visit knows both; else N11's record names the parent and the start, from any device; else the
  // parent is found by text (digs made before the records existed) and the start is unknown. A record's parent words come
  // from the question list, else from this dig's own question; when neither has them the link says "the earlier debate".
  const visitEntry = startedThisVisit.get(runId) ?? null;
  const parent = useMemo<Readonly<{ runId: string; question: string }> | null>(() => {
    if (visitEntry !== null) return { runId: visitEntry.link.parentRunId, question: visitEntry.parentQuestion };
    if (recordParent !== null) {
      const listed = index.find((entry) => entry.runId === recordParent.parent_run_id);
      const quoted = questionLine === null ? null : parseDigQuestion(questionLine, catalog)?.parentQuestion ?? null;
      return { runId: recordParent.parent_run_id, question: listed !== undefined ? ownWords(listed.questionLine) : quoted ?? "" };
    }
    if (questionLine === null) return null;
    const entry = digParentOf(runId, questionLine, index, catalog);
    return entry === null || entry.runId === runId ? null : { runId: entry.runId, question: ownWords(entry.questionLine) };
  }, [visitEntry, recordParent, questionLine, index, catalog, runId]);
  const startedAt = visitEntry?.link.startedAt ?? recordParent?.created_at ?? null;

  // A slow clock for "started N minutes ago" while the debate runs (only when the start time is known).
  const [now, setNow] = useState<number | null>(null);
  const waiting = load?.kind === "RUN" && load.run.state !== "FAILED" && startedAt !== null;
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  // R2REG-5: links carry only a level the person chose (none chosen: /v4 still offers its one-time choice).
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, chosenLevel);
  const askHref = levelHref("/v4", chosenLevel);
  const header = (
    <V4Header
      catalog={catalog}
      readingLevel={readingLevel}
      linkLevel={chosenLevel}
      onReadingLevel={chooseLevel}
      classicHref={classicHref}
    >
      {served !== null ? (
        // W3-4: "Write my report" is always there once the answer is served (the owner's money rule keeps it possible).
        <Link className="v4Btn v4BtnPrimary v4DebReportLink" href={reportHref}>{t(catalog, "v4.rail.writeReport")}</Link>
      ) : null}
    </V4Header>
  );

  if (map === null) {
    return (
      <div className="v4DebPage">
        {header}
        {/* UI-4: the layout already holds the page's one <main>. */}
        <div className="v4DebCentre">
          {load === null || load.kind !== "RUN" ? (
            <StatusScreen
              problem={loadProblem}
              onRetry={() => {
                setLoadProblem(null);
                setLoadAttempt((count) => count + 1);
              }}
              askHref={askHref}
              catalog={catalog}
            />
          ) : load.run.state === "FAILED" ? (
            <FailedScreen run={load.run} classicHref={classicHref} askHref={askHref} catalog={catalog} homeCatalog={homeCatalog} />
          ) : (
            <ProgressScreen
              run={load.run}
              runId={runId}
              startedAt={startedAt}
              now={now}
              reconnecting={loadProblem === "UNREACHABLE"}
              classicHref={classicHref}
              catalog={catalog}
              locale={locale}
            />
          )}
        </div>
      </div>
    );
  }

  const dugCounts: V4DigCounts = {
    running: digs.filter(isRunning).length,
    done: digs.filter((dig) => dig.state === "DONE").length,
    failed: digs.filter((dig) => dig.state === "FAILED").length
  };
  const openLeft = openCount(map, digs);
  const room = ask.room;
  // The money rule: new starts waiting for the reset get their own line (with the time) in place of today's notice.
  const startsWait = startsWaitLine(room, locale);
  const money: readonly MoneyLine[] = [digShareLine(room), startsWait].filter((line): line is MoneyLine => line !== null);
  const roomNotice = startsWait === null && room !== null
    && (room.room === "CLOSE" || room.room === "FULL" || room.room === "ALREADY_WAITING")
    ? <RoomNotice room={room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
    : null;
  const phoneTarget = layout === "phone" && choice !== undefined ? targetOf(map, digs, shownSelection, choice) : null;
  const showChanges = tourStops.length > 0;

  const rail = (variant: "column" | "strip") => (
    <V4Rail
      runId={runId}
      level={chosenLevel}
      showReadStep={!isDigPage && recordParent === null}
      openLeft={openLeft}
      digs={dugCounts}
      variant={variant}
      usageNotes={borrowLines(borrowed)}
      catalog={catalog}
      locale={locale}
    />
  );
  const pieces = {
    map,
    digs,
    selected: shownSelection,
    changed,
    picked,
    onSelect: select,
    onTogglePick: togglePick,
    catalog,
    ...(choice === undefined ? {} : { choice })
  } as const;

  // W3-4: the tray names the path its picks are on (owner Q-D1: one path per dig), the money lines, and Free's cap.
  const tray = hasTray && trayTarget !== null && trayTarget.kind === "picks" ? (
    <section className="v4DebTray" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <p className="v4DebTrayText">
        <strong>{tPlural(catalog, "v4.dig.trayPicked", trayTarget.picks.length, locale)}</strong>
        {trayTarget.path !== null ? (
          <>{" · "}<TitleText title={pathTitle(trayTarget.path, catalog, 40)} catalog={catalog} /></>
        ) : null}
        {" · "}
        {t(catalog, `v4.digMode.${sentDigMode}`)}
      </p>
      <p className="v4DebTrayHint v4Muted">
        {t(catalog, "v4.suggest.onePath")}
        {planTier === "free" ? <>{" "}{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</> : null}
      </p>
      <V4MoneyLines lines={money} catalog={catalog} />
      <div className="v4DebTrayActions">
        <button
          type="button"
          className="v4Btn v4BtnPrimary"
          disabled={digBusy}
          onClick={() => startDig(trayTarget)}
        >
          {trayTarget.picks.length >= 2
            ? tPlural(catalog, "v4.dig.trayDig", trayTarget.picks.length, locale)
            : t(catalog, "v4.panel.dig")}
        </button>
        <button type="button" className="v4Link v4DebTrayClear" onClick={() => commitDraft(EMPTY_DRAFT)}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  ) : null;

  const toast = (
    <V4DigToast
      pending={pending}
      onUndo={undoDig}
      notice={notice}
      onCloseNotice={() => setNotice(null)}
      lifted={layout === "phone" || hasTray}
      catalog={catalog}
      locale={locale}
    />
  );

  const pageClass = `v4DebPage v4DebLayout-${layout}${hasTray ? " v4DebHasTray" : ""}${sheetOpen ? " v4DebSheetOpen" : ""}`;
  return (
    <div className={pageClass}>
      {/* The tab title follows this heading (DocumentTitle): the person's own words, not the added lines. R2TIME-9: it
          sits outside the inert wrapper, so the title stays while the phone map is open. */}
      <h1 className="v4SrOnly" data-ai-generated="true">{ownWords(map.question)}</h1>
      {/* UI-6: while the phone map is open, everything behind it is inert (the sheet is a real modal). */}
      <div className="v4DebBehind" inert={sheetOpen}>
        {header}
        {layout === "mid" ? rail("strip") : null}
        <div className="v4DebMain">
          {parent !== null ? (
            <Link className="v4DebBack" href={levelHref(`/v4/debate/${encodeURIComponent(parent.runId)}`, chosenLevel)}>
              <span aria-hidden="true">‹</span>{" "}
              {parent.question.length > 0 ? (
                <>
                  {t(catalog, "v4.debate.backTo")}{" "}
                  <span className="v4DebBackQuestion" data-ai-generated="true">{parent.question}</span>
                </>
              ) : t(catalog, "v4.debate.backToEarlier")}
            </Link>
          ) : null}
          {showChanges ? (
            <V4ChangesBar
              stops={tourStops.length}
              sinceLastVisit={hiddenNews < visitNewsCount}
              tourIndex={tourIndex}
              onTour={onTour}
              onDismiss={() => {
                setHiddenNews(news.length);
                setTourIndex(null);
              }}
              catalog={catalog}
              locale={locale}
            />
          ) : null}
          {map.storyState === "WRITING" ? (
            <p className="v4DebNote v4Muted" role="status">{t(catalog, "v4.debate.storyWriting")}</p>
          ) : null}
          {/* W3-4: the deepest level offers no dig anywhere on its map; this line says so once, at the top. */}
          {canDig ? null : <p className="v4DebNote v4DebDeepest" role="note">{t(catalog, "v4.nest.deepest")}</p>}

          <div className="v4DebGrid">
            {layout === "desktop" ? <div className="v4DebRailCol">{rail("column")}</div> : null}
            {layout !== "phone" ? (
              <section className="v4DebMapCol" aria-label={t(catalog, "v4.debate.mapRegion")}>
                <V4MapTree {...pieces} />
              </section>
            ) : null}
            <section ref={panelColRef} className="v4DebPanelCol" aria-label={t(catalog, "v4.debate.panelRegion")}>
              <V4Panel
                map={map}
                digs={digs}
                selected={shownSelection}
                readingLevel={readingLevel}
                linkLevel={chosenLevel}
                picked={picked}
                onTogglePick={togglePick}
                onSelect={select}
                digMode={digMode}
                onDigMode={setDigMode}
                showDigModes={planTier !== "free"}
                onDig={startDig}
                digBusy={digBusy}
                roomNotice={roomNotice}
                money={money}
                {...(choice === undefined ? {} : { choice })}
                headingRef={headingRef}
                catalog={catalog}
                locale={locale}
              />
            </section>
          </div>
        </div>
      </div>

      {sheetOpen ? null : (
        <div className={`v4DebDock${layout === "phone" ? " v4DebDockPhone" : ""}`}>
          {tray}
          {layout === "phone" ? (
            <PhoneBar
              mapButtonRef={mapButtonRef}
              onMap={() => setOutlineOpen(true)}
              target={phoneTarget}
              onDig={startDig}
              digBusy={digBusy}
              catalog={catalog}
            />
          ) : null}
        </div>
      )}

      {sheetOpen ? (
        <OutlineSheet
          onClose={() => setOutlineOpen(false)}
          footer={<>{tray}{toast}</>}
          catalog={catalog}
        >
          {rail("column")}
          <V4Outline {...pieces} />
        </OutlineSheet>
      ) : toast}
      {ask.dialogs}
    </div>
  );
}

// ── Screens before the map ──────────────────────────────────────────────────────────────────────────────────────

function StatusScreen({ problem, onRetry, askHref, catalog }: Readonly<{
  problem: LoadProblem | null;
  onRetry: () => void;
  askHref: string;
  catalog: MessageCatalog;
}>) {
  if (problem === "NOT_FOUND") {
    return (
      <section className="v4Card v4DebStatus">
        <h1 className="v4Serif v4DebStatusTitle">{t(catalog, "v4.debate.notFoundTitle")}</h1>
        <p className="v4Muted">{t(catalog, "v4.debate.notFoundBody")}</p>
        <Link className="v4Btn" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
      </section>
    );
  }
  if (problem === "UNREACHABLE") {
    return (
      <section className="v4Card v4DebStatus">
        <h1 className="v4Serif v4DebStatusTitle">{t(catalog, "v4.debate.loadFailedTitle")}</h1>
        <p className="v4Muted">{t(catalog, "v4.debate.loadFailedBody")}</p>
        <button type="button" className="v4Btn" onClick={onRetry}>{t(catalog, "v4.common.retry")}</button>
      </section>
    );
  }
  return <p className="v4DebLoading v4Muted" role="status">{t(catalog, "v4.common.loading")}</p>;
}

function FailedScreen({ run, classicHref, askHref, catalog, homeCatalog }: Readonly<{
  run: RunProjection;
  classicHref: string;
  askHref: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}>) {
  return (
    <section className="v4Card v4DebStatus">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</p>
      <h1 className="v4DebStatusTitle">{t(catalog, "v4.debate.failedTitle")}</h1>
      <p>{runFailureMessage(run.terminal_reason, homeCatalog)}</p>
      <div className="v4DebStatusActions">
        <Link className="v4Btn v4BtnPrimary" href={askHref}>{t(catalog, "v4.debate.askNew")}</Link>
        <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
      </div>
    </section>
  );
}

/** RULES-4: QUEUED and CLAIMED say "Starting"; only a run that really waits for a spot says so. */
function stateLine(run: RunProjection, catalog: MessageCatalog, locale: string): string {
  // W3-4 (the money rule): at the month wall the debate's planned calls and searches pause until the month resets.
  const pause = monthPauseOf(run);
  if (pause !== null) return t(catalog, "v4.debate.state.PAUSED_MONTH", { date: formatDate(locale, pause.until, { dateStyle: "medium" }) });
  switch (run.state) {
    case "WAITING": {
      const time = clockTime(run.waits_until, locale);
      return time === null ? t(catalog, "v4.debate.state.WAITING.noTime") : t(catalog, "v4.debate.state.WAITING", { time });
    }
    case "HOLDING": {
      const time = clockTime(run.hold_until, locale);
      return time === null ? t(catalog, "v4.debate.state.HOLDING.noTime") : t(catalog, "v4.debate.state.HOLDING", { time });
    }
    case "RUNNING":
      return t(catalog, "v4.debate.state.RUNNING");
    case "SETTLED":
      return t(catalog, "v4.debate.state.FINISHING");
    case "QUEUED":
    case "CLAIMED":
    case "FAILED":
      return t(catalog, "v4.debate.state.STARTING");
  }
}

/**
 * W3-4 (the money rule, owner 31 Oct): a debate paused at the month wall. Continue resumes it once the month has reset
 * (true resume: what is done is not paid for again); pressed too early, nothing changes and the page says from when.
 */
function MonthPaused({ run, runId, catalog, locale }: Readonly<{
  run: RunProjection; runId: string; catalog: MessageCatalog; locale: string;
}>) {
  const pause = monthPauseOf(run);
  const [pressing, setPressing] = useState(false);
  const [outcome, setOutcome] = useState<ContinueOutcome | null>(null);
  if (pause === null) return null;
  const date = (iso: string): string => formatDate(locale, iso, { dateStyle: "medium" });
  const press = async (): Promise<void> => {
    setPressing(true);
    const next = await continueRun(runId);
    setOutcome(next);
    setPressing(false);
  };
  const continuing = pressing || outcome?.kind === "CONTINUING";
  return (
    <div className="v4DebPaused">
      <p>{pause.can_continue ? t(catalog, "v4.money.pausedReady") : t(catalog, "v4.money.paused", { date: date(pause.until) })}</p>
      <button type="button" className="v4Btn v4BtnPrimary" disabled={continuing} onClick={() => void press()}>
        {continuing ? t(catalog, "v4.money.continuing") : t(catalog, "v4.money.continue")}
      </button>
      <p className="v4Muted">{t(catalog, "v4.money.continueNote")}</p>
      {outcome?.kind === "TOO_EARLY" ? (
        <p role="status">{t(catalog, "v4.money.continueTooEarly", { date: date(outcome.until) })}</p>
      ) : null}
      {outcome?.kind === "FAILED" ? <p role="status">{t(catalog, "v4.money.continueFailed")}</p> : null}
    </div>
  );
}

function ProgressScreen({ run, runId, startedAt, now, reconnecting, classicHref, catalog, locale }: Readonly<{
  run: RunProjection;
  runId: string;
  startedAt: string | null;
  now: number | null;
  reconnecting: boolean;
  classicHref: string;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const started = startedAt === null ? Number.NaN : new Date(startedAt).getTime();
  const minutes = now === null || Number.isNaN(started) ? null : Math.max(0, Math.floor((now - started) / 60_000));
  return (
    <section className="v4Card v4DebStatus v4DebProgress">
      <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
      {/* The person's own words (the tab title follows this heading); the added lines are not a title. */}
      <h1 className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(run.question_line)}</h1>
      <p className="v4DebProgressState" role="status">
        <span className="v4DebPulse" aria-hidden="true" />
        {stateLine(run, catalog, locale)}
      </p>
      {minutes === null ? null : (
        <p className="v4Muted">
          {minutes < 1 ? t(catalog, "v4.debate.elapsedJustNow") : tPlural(catalog, "v4.debate.elapsed", minutes, locale)}
        </p>
      )}
      {monthPauseOf(run) === null
        ? <p className="v4Muted">{t(catalog, "v4.debate.usually")}</p>
        : <MonthPaused run={run} runId={runId} catalog={catalog} locale={locale} />}
      {reconnecting ? <p className="v4Muted">{t(catalog, "v4.debate.reconnecting")}</p> : null}
      <Link className="v4Link" href={classicHref}>{t(catalog, "v4.common.classicView")}</Link>
    </section>
  );
}

// ── Phone pieces (D6, D7) ───────────────────────────────────────────────────────────────────────────────────────

function PhoneBar({ mapButtonRef, onMap, target, onDig, digBusy, catalog }: Readonly<{
  mapButtonRef: RefObject<HTMLButtonElement | null>;
  onMap: () => void;
  target: PhoneTarget | null;
  onDig: (target: DigTarget) => void;
  digBusy: boolean;
  catalog: MessageCatalog;
}>) {
  return (
    <div className="v4DebPhoneBar">
      <button ref={mapButtonRef} type="button" className="v4Btn v4DebPhoneMap" onClick={onMap} aria-haspopup="dialog">
        {t(catalog, "v4.debate.mapButton")}
      </button>
      {target !== null ? (
        <button type="button" className="v4Btn v4BtnPrimary v4DebPhoneDig" disabled={digBusy} onClick={() => onDig(target.target)}>
          {t(catalog, target.again ? "v4.nest.digHereToo" : "v4.debate.digHere")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * D7: the phone map, full screen. UI-6: a real modal — the page behind is inert, Tab stays inside, Escape closes, and
 * the tray (and the dig note with its Undo) live inside it while it is open.
 */
function OutlineSheet({ onClose, footer, catalog, children }: Readonly<{
  onClose: () => void;
  footer: ReactNode;
  catalog: MessageCatalog;
  children: ReactNode;
}>) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Focus goes back to the Map button from the page (R2TIME-4): the button is re-mounted when the sheet closes.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || sheetRef.current === null) return;
    const items = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => item.getClientRects().length > 0
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      ref={sheetRef}
      className="v4DebSheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v4-deb-sheet-title"
      onKeyDown={onKeyDown}
    >
      <div className="v4DebSheetHead">
        <h2 id="v4-deb-sheet-title" className="v4Serif v4DebSheetTitle">{t(catalog, "v4.debate.mapTitle")}</h2>
        <button
          ref={closeRef}
          type="button"
          className="v4Btn v4DebSheetClose"
          onClick={onClose}
          aria-label={t(catalog, "v4.debate.closeMap")}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="v4DebSheetBody">{children}</div>
      <div className="v4DebSheetFoot">{footer}</div>
    </div>
  );
}
