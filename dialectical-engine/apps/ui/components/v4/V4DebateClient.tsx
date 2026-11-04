"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  canDigFromLevel,
  type Answer,
  type AnswerStory,
  type DigLinks,
  type DigSuggestion,
  type RunProjection,
  type UsageBorrow
} from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { TAB_PREFIX_ATTRIBUTE } from "@/components/DocumentTitle";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4BottomStack, type V4BarJob } from "@/components/v4/V4BottomStack";
import { V4ChangesBar } from "@/components/v4/V4ChangesBar";
import { V4PickChips } from "@/components/v4/V4ChoiceChips";
import { V4MoneyLines, type V4DigChoice } from "@/components/v4/V4DigSuggest";
import { V4DigNotes, V4DigStartingLine } from "@/components/v4/V4DigUndo";
import type { V4FailedDigs } from "@/components/v4/V4DigFailed";
import { V4FailedScreen } from "@/components/v4/V4FailedScreen";
import { V4Header } from "@/components/v4/V4Header";
import { V4ContributionNote } from "@/components/v4/V4ContributionNote";
import { V4LevelTrail } from "@/components/v4/V4LevelTrail";
import { V4LeaveQuestion } from "@/components/v4/V4LeaveQuestion";
import { V4LoadingOutline, V4LoadingPage, V4SignInAgain } from "@/components/v4/V4LoadingOutline";
import { V4PicksClearedNote } from "@/components/v4/V4PicksClearedNote";
import { digFor, digsUnder, openCount, pathTitle, resolveSelection, selectionIdOf, TitleText, V4MapTree } from "@/components/v4/V4MapTree";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { V4PublicMark } from "@/components/v4/V4PublicMark";
import { typedGoesPublic, usePublicStage } from "@/lib/v4/publicState";
import type { V4ResearchedPress } from "@/components/v4/V4Sources";
import { V4ChangedSince } from "@/components/v4/V4PathRewrite";
import { V4AnswerCard, type V4ReportAnswer } from "@/components/v4/V4AnswerCard";
import { swipeTarget, usePositionFlash, useShortWindow, useSideSwipe, V4PathList, V4WhereBar } from "@/components/v4/V4MapPlace";
import { V4MonthPause } from "@/components/v4/V4MonthPause";
import { V4PausedScreen } from "@/components/v4/V4PausedScreen";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { useV4Ready } from "@/components/v4/useV4Ready";
import { isNotFound } from "@/lib/api";
import type { AskRoom } from "@/lib/billing/room";
import { isSignedOut, signInHrefHere } from "@/lib/signInWayBack";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import { digQuestion, digTargetQuestions, ownWords, parseDigQuestion } from "@/lib/v4/askText";
import { mergeDigLinks, readDigRecords, readLastVisit, recordDig, recordLastVisit, storableItems } from "@/lib/v4/accountMemory";
import { diffSnapshots, isRewriteWord, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import {
  firstAnswerArriving, laterNewsOnly, mainAnswerItems, mainAnswerWriting, pathResults, pathsChangedSinceReport, stopsOfChanges, unseenIdsOf,
  visitItemsToKeep
} from "@/lib/v4/readyMoment";
import { useReportVersions } from "@/lib/v4/useReportVersions";
import { effectiveDigMode } from "@/lib/v4/askConfig";
import { digRetryOf, retryPending } from "@/lib/v4/digRetry";
import { askAgainHref } from "@/lib/v4/failedRun";
import { digLinksFor, digParentOf, mergeIndex, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import {
  addDig, readDigUndo, undoDig as undoWaitingDig, useClaimDigNotes, useDigUndo, waitingDigFor, type DigUndoResult
} from "@/lib/v4/digUndo";
import {
  addToResearched, loadAnswer, loadDigTrail, loadDigView, loadStory, loadV4, storyReadFailed, type DigTrail, type V4Load
} from "@/lib/v4/load";
import { researchedWaiting } from "@/lib/v4/web";
import { buildV4Map, restarMap, rewriteByDig, rewriteWaiting, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import { dugIds, firstByOf, reportMoment, starOf } from "@/lib/v4/mapLooks";
import { useRevealOnce } from "@/lib/v4/useReveal";
import {
  borrowLines,
  digShareLine,
  monthPauseOf,
  readBorrowed,
  startsWaitLine,
  type MoneyLine
} from "@/lib/v4/money";
import { pausedDigCount, pauseOfDig, pauseOfRun } from "@/lib/v4/monthPause";
import {
  addPick,
  askParentOf,
  draftTarget,
  editPick,
  EMPTY_DRAFT,
  isEdited,
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
import { rememberSentDig, sentDigOf } from "@/lib/v4/useSentDigs";
import { useV4Ask, type V4AskOutcome } from "@/lib/v4/useV4Ask";
import { useWaitPolling } from "@/lib/v4/useWaitPolling";
import { useLeaveLinkGuard, useTypedWords } from "@/lib/v4/useLeaveGuard";
import { useLevelSettled } from "@/lib/v4/useLevelSettled";
import { usePicksUndo } from "@/lib/v4/usePicksUndo";
import { useAddressPicks, useQuestionAddress } from "@/lib/v4/useQuestionAddress";

/*
 * V4 initial (2026-10-28), the map page shell (D3 map, D4 what changed, D6/D7 phone). It loads the debate over
 * today's V3 reads, waits calmly while it runs, then lays out rail | map | panel and owns the dig flow (row D
 * decision 1: a dig starts at once with a 10-second Undo, nothing is sent before then). Every polling loop keeps one
 * request in flight at a time and stops when the page goes. Fix wave 1, Decision A: nothing is kept in the browser's
 * storage. V4 account memory (owner rulings N7 and N11, 2026-10-29): the account keeps each debate's last visit, so "what
 * changed" starts "since your last visit" (from any device) and goes on "while you were here"; and it keeps each dig's
 * link, so digs and the back link come from those records, with the account's question list (by text) only for digs
 * made before the records existed. Every read of that memory can fail; the page then does what it did without it.
 * Dig model revision W4-6: a dig rewrites the path it came from, so while a rewrite is being written (or a dig finished
 * and its rewrite is not on this map yet) the page reads its answer again; a finished rewrite is news. A dig writes no
 * story (owner Q-D13): its own page never waits for one, and shows where it sits ("Level {n} of 10"). The top of the map
 * says how many paths changed since the answer (or the latest report) was written.
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
/** W4-6: while a path is being rewritten (or a finished rewrite is not on the map yet), the answer is read this often. */
const REWRITE_POLL_MS = 15_000;
/** W4-4: how often the answer is read while an added page is being read (the runner's sweep looks every 15 s). */
const RESEARCHED_POLL_MS = 5_000;
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
/**
 * Spec: desktop ≥ 1100 px, 768–1099 px a top strip, < 768 px the phone layout. map-d3 (3 Nov): from 1440 px the three
 * columns; 1100–1439 px ("laptop") a 56 px strip of steps, the map in two columns with only the opened path unfolded;
 * 768–1099 px the steps across the top and the map as an indented list beside the panel.
 */
const PHONE_QUERY = "(max-width: 767px)";
const MID_QUERY = "(max-width: 1099px)";
const LAPTOP_QUERY = "(max-width: 1439px)";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

type Layout = "desktop" | "laptop" | "mid" | "phone";
/** wait-f1: SIGNED_OUT, the server said the sign-in has ended (never shown as a lost connection). */
type LoadProblem = "NOT_FOUND" | "UNREACHABLE" | "SIGNED_OUT";

/** What the page last read of one dig, and how its reads went. */
type DigStatus = Readonly<{
  view: Omit<DigView, "link"> | null;
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
  /** W4-6: the path the address names (`?path=`, a link back from a dig), opened in the panel at first; null: none. */
  initialPath?: string | null;
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
    // map-f6: one look while the page loads, from the session check on: a grey outline of the page.
    <AuthGate catalog={props.newDebateCatalog} checkingView={<V4LoadingPage catalog={props.catalog} />}>
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
    const laptop = window.matchMedia(LAPTOP_QUERY);
    const update = (): void => setLayout(phone.matches ? "phone" : mid.matches ? "mid" : laptop.matches ? "laptop" : "desktop");
    update();
    for (const query of [phone, mid, laptop]) query.addEventListener("change", update);
    return () => {
      for (const query of [phone, mid, laptop]) query.removeEventListener("change", update);
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

/**
 * No more reads needed: it failed, or it is done with its headline (or we stopped waiting for the headline). W4-6: a dig
 * of the new model has no headline (no story): it is final once its rewrite is no longer being written.
 */
function isFinal(status: DigStatus | undefined): boolean {
  const view = status?.view ?? null;
  if (view === null) return false;
  if (view.state === "FAILED") return true;
  if (view.state === "DONE" && view.rewrite !== undefined) return view.rewrite === null || view.rewrite.state !== "WRITING";
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
 * dig-f8: the share of today the room read said for this dig. The read is for the person's picks when there are some, else
 * for one whole path or open question (W3-4), so a dig of anything else gets no share rather than another dig's.
 */
function shareFor(target: DigTarget, draft: V4DigDraft, room: AskRoom | null): number | null {
  const percent = room?.dig_share_percent;
  if (percent === undefined || percent === null || percent <= 0) return null;
  return (draft.picks.length > 0) === (target.kind === "picks") ? percent : null;
}

/** journey-d3: the pinned bar's dig job, "Dig here · up to 3%" (the share only when the room read is for this dig). */
function barDigLabel(phone: PhoneTarget, percent: number | null, catalog: MessageCatalog): string {
  const label = t(catalog, phone.again ? "v4.nest.digHereToo" : "v4.debate.digHere");
  return percent === null ? label : `${label} · ${t(catalog, "v4.undo.barShare", { percent })}`;
}

/**
 * "While you were here" (fix wave 1): which live changes are news. A dig this tab started is not news when it appears
 * (the person just started it), nor is it while it is still going; it is news when it finishes or fails, and a dig that
 * appears from elsewhere (another tab) is news. An open question turning "dug" is told by its dig, not twice.
 * W4-6: a dig's rewrite of the path it came from is news as it finishes (and the dig finishing, as before).
 */
function isNews(change: V4Change, startedHere: ReadonlySet<string>): boolean {
  if (change.id.startsWith("dig:")) {
    if (change.kind === "ADDED") return !startedHere.has(change.id.slice("dig:".length)) || isRewriteWord(change.now);
    return change.now === "DONE" || change.now === "FAILED" || isRewriteWord(change.now);
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
 * N7: the news a last visit's snapshot gives on the first complete load. V4 screen review (3 Nov 2026), wait-f15 /
 * map-f21: the short answer arriving since (the stand-in path, fate "none", gave way to the story's paths) is the
 * person's first sight of it, never news; only what digs did since is.
 */
function visitNews(stored: Readonly<Record<string, string>>, now: Readonly<Record<string, string>>,
  startedHere: ReadonlySet<string>): readonly V4Change[] {
  const fresh = diffSnapshots({ at: "", items: stored }, storableItems(now)).filter((change) => isNews(change, startedHere));
  const standIn = (items: Readonly<Record<string, string>>) => Object.entries(items).some(([id, word]) => id.startsWith("path:") && word === "none");
  return standIn(stored) && !standIn(now) ? laterNewsOnly(fresh) : fresh;
}

function V4Debate({
  id,
  initialPath = null,
  initialLevel,
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint
}: V4DebateClientProps) {
  const layout = useLayout();
  const [chosenLevel, chooseLevel, levelKnown] = useReadingLevel(initialLevel);
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
  // wait-f19 (owner's screen review): rarely while the tab is hidden, at once when it is shown again or the connection
  // returns (useWaitPolling); a retry from the status screen starts afresh. `runChecks` (when a check last answered, lost
  // touch, Try now) is what the waiting card (V4WaitCard) shows.
  const [load, setLoad] = useState<V4Load | null>(null);
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const runChecks = useWaitPolling(async (stillWanted) => {
    try {
      const next = await loadV4(id);
      if (stillWanted()) {
        setLoad(next);
        setLoadProblem(null);
      }
      return next.kind === "RUN" && next.run.state !== "FAILED" ? "AGAIN" : "DONE";
    } catch (failure) {
      if (isNotFound(failure)) {
        if (stillWanted()) setLoadProblem("NOT_FOUND");
        return "DONE";
      }
      // wait-f1: the sign-in has ended; asking again cannot help, so the card asks the person to sign in.
      if (isSignedOut(failure)) {
        if (stillWanted()) setLoadProblem("SIGNED_OUT");
        return "DONE";
      }
      // Spec: back off to 30 s after an error; the page keeps what it last showed.
      if (stillWanted()) setLoadProblem("UNREACHABLE");
      throw failure;
    }
  }, { everyMs: RUN_POLL_MS, afterFailureMs: RUN_POLL_AFTER_ERROR_MS, restartKey: `${id}/${String(loadAttempt)}` });

  const servedLoad = load?.kind === "SERVED" ? load : null;
  // W4-6: the answer as read again since (paths a dig rewrote), when it is still this debate's.
  const [freshAnswer, setFreshAnswer] = useState<Answer | null>(null);
  const served = useMemo(() => (servedLoad === null ? null
    : freshAnswer !== null && freshAnswer.run_ref === servedLoad.answer.run_ref ? { ...servedLoad, answer: freshAnswer } : servedLoad),
  [servedLoad, freshAnswer]);
  const runId = load?.runId ?? id;
  const answerId = served?.answer.answer_id ?? null;
  const answerVersion = served?.answer.answer_version ?? 1;
  /** W4-6 (Q-D13): this debate is a dig of the new model, so it has no story to read or wait for. */
  const noStory = served !== null && (served.answer.dig !== undefined || served.answer.contribution !== undefined);
  /** The whole text that was sent for this debate (the person's words plus any added lines). */
  const questionLine = served !== null ? served.answer.question_line : load?.kind === "RUN" ? load.run.question_line : null;

  // ── The story: while it is missing, being written or its read failed, ask again, backing off (R2TIME-3) ─────────
  const [polledStory, setPolledStory] = useState<Readonly<{ answerId: string; story: AnswerStory | null }> | null>(null);
  const [storyGaveUp, setStoryGaveUp] = useState(false);
  const story = polledStory !== null && polledStory.answerId === answerId ? polledStory.story : served?.story ?? null;
  const storyFailedRead = story !== null && storyReadFailed(story);
  const storyPending = served !== null && !noStory && !storyGaveUp && (story === null || story.status === "WRITING" || storyFailedRead);
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
  // dig-f23: typed words kept in the page; the ticks kept in the address (ids only); "Clear" with a 10-second Undo; and a
  // question before a link loses typed words (the browser's own one before a reload or a closed tab).
  const typed = useTypedWords();
  const addressPicks = useAddressPicks({ map, canDig, draft, commit: commitDraft });
  const picksUndo = usePicksUndo({ draft, current: draftRef, commit: commitDraft });
  const { clear: clearPicks, dismiss: dismissPicksUndo } = picksUndo;
  const leaveGuard = useLeaveLinkGuard(
    () => typed.any() || draftRef.current.picks.some((pick) => pick.kind === "OWN_VIEW" || isEdited(pick))
  );
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
      // W4-6: once done, this map's record of the dig's rewrite (read with the answer) wins over the dig's own copy.
      const onMap = map === null || view.state !== "DONE" ? null : rewriteByDig(map, link.childRunId)?.rewrite ?? null;
      return { link, ...view, ...(onMap === null ? {} : { rewrite: onMap }) };
    }),
    [links, statuses, map]
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
        const { link: _read, ...view } = result.view;
        const headless = view.state === "DONE" && view.headline === null;
        next.set(result.childRunId, {
          view,
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

  // ── Rewrites (W4-6): read the answer again while a path is being rewritten, or a dig's rewrite is not on it yet ────
  // One read in flight; a finished rewrite a dig reports first is fetched at once, a path still being rewritten every 15 s.
  const behind = map !== null && statuses.size > 0 && links.some((link) => {
    const view = statuses.get(link.childRunId)?.view ?? null;
    const own = view?.state === "DONE" ? view.rewrite ?? null : null;
    if (own === null || own.state === "WRITING") return false;
    const onMap = rewriteByDig(map, link.childRunId)?.rewrite ?? null;
    return onMap === null || onMap.rewrite_id !== own.rewrite_id || onMap.state !== own.state;
  });
  // dig-f1 (V4 screen review, 3 Nov 2026): and while a change is being written into the main answer, so it shows without a reload.
  const rewriteBehind = map !== null && (behind || rewriteWaiting(map) || mainAnswerWriting(served?.answer));
  const rewriteBehindRef = useRef(rewriteBehind);
  useEffect(() => {
    rewriteBehindRef.current = rewriteBehind;
  });
  useEffect(() => {
    if (servedRunId === null || !rewriteBehind) return;
    let active = true;
    let timer: number | undefined;
    const read = async (): Promise<void> => {
      const next = await loadAnswer(servedRunId);
      if (!active) return;
      if (next !== null) setFreshAnswer(next);
      if (rewriteBehindRef.current) timer = window.setTimeout(() => void read(), REWRITE_POLL_MS);
    };
    timer = window.setTimeout(() => void read(), behind ? 0 : REWRITE_POLL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [servedRunId, rewriteBehind, behind]);

  // ── "Add to researched" (W4-4): the presses the answer does not say yet, kept here only; the answer read again until each has its outcome ────
  const [researchedPresses, setResearchedPresses] = useState<ReadonlyMap<string, V4ResearchedPress>>(new Map());
  const pressResearched = useCallback((pathId: string, pageRef: string) => {
    if (servedRunId === null) return;
    const press = (state: V4ResearchedPress): void => setResearchedPresses((before) => new Map(before).set(pageRef, state));
    press("ADDING");
    void addToResearched(servedRunId, pathId, pageRef).then(press);
  }, [servedRunId]);
  const researchedPending = served !== null && (researchedWaiting(served.answer)
    || (served.answer.web?.paths ?? []).some((path) => path.other_pages.some((page) => page.researched === undefined && researchedPresses.get(page.page_ref) === "READING")));
  useEffect(() => {
    if (servedRunId === null || !researchedPending) return;
    let active = true;
    let timer: number | undefined;
    const read = async (): Promise<void> => {
      const next = await loadAnswer(servedRunId);
      if (!active) return;
      if (next !== null) setFreshAnswer(next);
      timer = window.setTimeout(() => void read(), RESEARCHED_POLL_MS);
    };
    timer = window.setTimeout(() => void read(), RESEARCHED_POLL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [servedRunId, researchedPending]);

  // ── A dig on a public debate (decision 13): the answer read again while the AI check on it runs, until it says how the check went ────
  const contributionChecking = served?.answer.contribution?.state === "CHECKING";
  useEffect(() => {
    if (servedRunId === null || !contributionChecking) return;
    let active = true;
    let timer: number | undefined;
    const read = async (): Promise<void> => {
      const next = await loadAnswer(servedRunId);
      if (!active) return;
      if (next !== null) setFreshAnswer(next);
      timer = window.setTimeout(() => void read(), REWRITE_POLL_MS);
    };
    timer = window.setTimeout(() => void read(), REWRITE_POLL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [servedRunId, contributionChecking]);

  // ── Where a dig sits (W4-6): the debates above it, read once, up to the main question ────────────────────────────
  const servedDig = served?.answer.dig ?? null;
  const trailKey = servedDig === null ? null : `${servedDig.parent_run_id}|${servedDig.position_ref ?? ""}`;
  const servedDigRef = useRef(servedDig);
  useEffect(() => {
    servedDigRef.current = servedDig;
  });
  const [trail, setTrail] = useState<DigTrail | null>(null);
  useEffect(() => {
    const dig = servedDigRef.current;
    if (trailKey === null || dig === null) return;
    let active = true;
    void loadDigTrail(dig).then((next) => {
      if (active) setTrail(next);
    });
    return () => {
      active = false;
    };
  }, [trailKey]);

  // public-f26 / journey-f20 (lib/v4/publicState.ts): the public state of the debate this map belongs to (the top one, under
  // a dig), for the globe line under the question and "This will be public." where the person types. Not on a dig made from
  // someone else's public page (its own note says what became of it).
  const publicStage = usePublicStage(served === null || served.answer.contribution !== undefined ? null
    : isDigMap ? (trail?.complete === true ? trail.steps[0]?.runId ?? null : null) : servedRunId, answerVersion);
  const publicLine = typedGoesPublic(publicStage) ? t(catalog, "v4.publicMark.willBePublic") : null;

  // ── The report's answer (R22 W5-1, owner Q-D11), and its ready moment (journey-f17) ─────────────────────────────
  const isDig = servedDig !== null;
  const reportReady = useRef<() => void>(() => undefined);
  const reportAnswer = useReportVersions(servedRunId, isDig, () => reportReady.current());

  // ── Selection ───────────────────────────────────────────────────────────────────────────────────────────────────
  // W4-6: a link back from a dig names the path it dug (`?path=`); the panel opens there (a path gone: the question).
  // journey-d4 A / map-f24: the open question lives in the address (`?path=`, `?open=`, `?dig=`), so opening one adds one
  // step to the history, Back and Forward open the one before or after, and a reload or a shared link opens it again.
  // The phone's Map sheet leaves no step behind, and Back with it open closes it (lib/v4/useQuestionAddress.ts).
  const address = useQuestionAddress({
    initial: initialPath === null ? "root" : `path:${initialPath}`,
    picks: addressPicks,
    onTraverse: (selection) => {
      setOpened((previous) => (previous.has(selection) ? previous : new Set([...previous, selection])));
      if (layout === "phone") setFocusRequest((count) => count + 1);
    }
  });
  const { selected, openQuestion, openSheet, closeSheet } = address;
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(["root", selected]));
  const [focusRequest, setFocusRequest] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const panelColRef = useRef<HTMLElement | null>(null);
  const shownSelection: V4Selection = map === null ? "root" : selectionIdOf(resolveSelection(map, digs, selected));
  const sheetOpen = layout === "phone" && address.sheetOpen;

  const select = useCallback((selection: V4Selection, viaKeyboard: boolean): void => {
    // Phone: tapping a row of the outline opens it in the panel, so the sheet closes (openQuestion closes it).
    openQuestion(selection);
    setOpened((previous) => (previous.has(selection) ? previous : new Set([...previous, selection])));
    // UI-5: on the phone the new question always opens at its heading (focus scrolls it into view).
    if (viaKeyboard || layout === "phone") setFocusRequest((count) => count + 1);
  }, [layout, openQuestion]);

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
      onClear: clearPicks,
      typed,
      ...(publicLine === null ? {} : { publicLine })
    };
  }, [map, draft, planTier, canDig, isDigMap, digs, commitDraft, clearPicks, typed, publicLine]);
  // dig-d3: the digs still in their 10 seconds, on any V4 page (lib/v4/digUndo.ts, memory only).
  const waitingDigs = useDigUndo();
  const trayTarget = map === null || !canDig ? null : draftTarget(draft, map.paths);
  // While the picks' own dig waits, they are on their way: the tray steps back (Undo brings them back).
  const hasTray = trayTarget !== null && waitingDigFor(waitingDigs, servedRunId, trayTarget) === null;

  // ── The dig flow ────────────────────────────────────────────────────────────────────────────────────────────────
  // dig-d3 (owner pick B, 3 Nov): a dig waiting out its 10 seconds belongs to the whole V4 site, not to this page: it
  // keeps its own Undo when the person digs again or opens another page, and the other dig buttons stay active. Nothing
  // is sent before `sendsAt` (row D decision 1, ruling N4); the sends go one at a time (lib/v4/digUndo.ts).
  // Owner N13: Free has no Quick look / Thorough choice; its digs are quick looks.
  const sentDigMode = effectiveDigMode(digMode, planTier);
  // The debates above this one (top first): their report pages wait for a dig sent from here too (ruling F7).
  const aboveRunIds = useMemo(() => trail?.steps.map((step) => step.runId) ?? [], [trail]);

  /** Puts a dig in its 10 seconds, in the site-wide list (a dig pressed here, or a failed dig tried again, dig-f12). */
  const queueDig = useCallback((dig: PendingDig): void => {
    // W3-4: nothing is dug from the deepest level (the page offers no button there; this holds it).
    if (map === null || !canDig || servedRunId === null || servedQuestionLine === null) return;
    // One waiting dig per place: its buttons say it is starting, with its Undo, instead of starting a second one. The live
    // list is read (not this render's copy), so a quick second press never starts a second dig.
    if (waitingDigFor(readDigUndo(), servedRunId, dig.target) !== null) return;
    const parentRunId = servedRunId;
    const parentQuestionLine = servedQuestionLine;
    addDig({
      parentRunId,
      runIds: aboveRunIds,
      dig,
      sharePercent: shareFor(dig.target, draftRef.current, ask.room),
      showMode: planTier !== "free",
      // The page may be gone by then: the send works from its last state (useV4Ask reads through refs).
      send: (waiting) => sendRef.current(waiting, parentRunId, parentQuestionLine),
      failedLine: t(catalog, "v4.dig.failed")
    });
  }, [map, canDig, servedRunId, servedQuestionLine, aboveRunIds, ask.room, planTier, catalog]);

  const startDig = useCallback((target: DigTarget): void => {
    queueDig({ target, mode: sentDigMode, sendsAt: Date.now() + UNDO_MS });
  }, [queueDig, sentDigMode]);

  const undoDig = useCallback((id: number): void => {
    undoWaitingDig(id);
  }, []);
  // dig-f23: a dig being started ends the "Picks cleared" offer (its note would sit beside the dig's own note).
  const newestCounting = waitingDigs.reduce((newest, entry) =>
    (entry.phase === "COUNTING" && entry.parentRunId === servedRunId && entry.id > newest ? entry.id : newest), 0);
  useEffect(() => {
    if (newestCounting > 0) dismissPicksUndo();
  }, [newestCounting, dismissPicksUndo]);

  const send = async (dig: PendingDig, parentRunId: string, parentQuestionLine: string): Promise<DigUndoResult> => {
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
      const startedAt = new Date().toISOString();
      const link: DigLink = {
        parentRunId,
        childRunId: outcome.runId,
        openQuestionIds: placesOf(dig.target),
        questions: digTargetQuestions(dig.target),
        mode: dig.mode,
        startedAt,
        // dig-f20: the person's own words are never marked as AI text (kept for this visit; the dig's answer tells later).
        firstBy: firstByOf(dig.target)
      };
      // Kept for this visit even when the page has gone meanwhile (Decision A: memory only), and in the account (N11:
      // which debate it came from, where on the map, its mode). Best-effort: without the record it is found by text.
      startedThisVisit.set(link.childRunId, { link, parentQuestion: ownWords(parentQuestionLine) });
      // dig-f12: "Try this dig again" digs exactly what was sent (memory only, lib/v4/useSentDigs.ts).
      rememberSentDig(link.childRunId, { target: dig.target, mode: dig.mode });
      void recordDig(link);
      const started: DigUndoResult = { kind: "STARTED", childRunId: link.childRunId, startedAt };
      if (!mounted.current) return started;
      // Shown at once (as working); the dig loop reads its real state straight away.
      setVisitLinks((previous) => [...previous.filter((known) => known.childRunId !== link.childRunId), link]);
      // The picks it was made of are taken off the tray (picks made during the send stay).
      const sentKeys = new Set(dig.target.kind === "picks"
        ? dig.target.picks.map((pick) => pick.key)
        : dig.target.kind === "open" ? dig.target.questions.map((question) => `open:${question.id}`) : []);
      if (sentKeys.size > 0) {
        commitDraft([...sentKeys].reduce((left, key) => removePick(left, key), draftRef.current));
      }
      // dig-f10: the person stays where they are; the note says it started, with [See it].
      return started;
    }
    return outcome.kind === "REFUSED" ? { kind: "REFUSED", message: outcome.message } : { kind: "STOPPED" };
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  // A dig sent while this map was not on screen (the person had opened another page) shows once it has started.
  useEffect(() => {
    if (servedRunId === null) return;
    const started = waitingDigs.flatMap((entry) => {
      const result = entry.result;
      if (entry.parentRunId !== servedRunId || result?.kind !== "STARTED") return [];
      const visit = startedThisVisit.get(result.childRunId);
      return visit === undefined ? [] : [visit.link];
    });
    if (started.length === 0) return;
    setVisitLinks((previous) => {
      const known = new Set(previous.map((link) => link.childRunId));
      const fresh = started.filter((link) => !known.has(link.childRunId));
      return fresh.length === 0 ? previous : [...previous, ...fresh];
    });
  }, [waitingDigs, servedRunId]);

  // journey-d3 / dig-f16: this page draws the dig notes in its own bottom stack once its map shows.
  useClaimDigNotes(map !== null);
  const barJobRef = useRef<HTMLElement | null>(null);

  // ── A dig that did not finish (owner review 3 Nov, dig-f12/wait-f18): its reason, and "Try this dig again" ──────────
  // The digs this visit sends are remembered as sent (memory only), so a retry digs exactly the same picks; the retry goes
  // through the same 10-second Undo note as any dig, with the failed dig's own Quick/Thorough choice.
  const failedDigs = useMemo<V4FailedDigs | undefined>(() => {
    if (map === null) return undefined;
    // A dig rebuilt from its link is offered only when it would ask exactly what the failed one asked.
    const asked = (line: string): string => line.replace(/\s+/gu, " ").trim();
    const retryOf = (dig: DigView) => digRetryOf(dig, digs, map, sentDigOf(dig.link.childRunId), (target) =>
      servedQuestionLine !== null && dig.questionLine !== undefined
        && asked(digQuestion(target, servedQuestionLine, catalog, locale)) === asked(dig.questionLine));
    return {
      retryOf,
      onRetry: (dig: DigView) => {
        const retry = retryOf(dig);
        if (retry.kind !== "OFFER" || !canDig) return;
        // The shared dig Undo (lib/v4/digUndo.ts): the same note, 10 seconds and one-at-a-time send as any dig.
        queueDig(retryPending(retry, effectiveDigMode(retry.mode ?? digMode, planTier), Date.now(), UNDO_MS));
      },
      reasonText: (reason) => runFailureMessage(reason, homeCatalog)
    };
  }, [map, digs, canDig, digMode, planTier, homeCatalog, servedQuestionLine, catalog, locale, queueDig]);

  // ── What changed since your last visit and while you were here (D4, fix wave 1, N7) ─────────────────────────────
  // The first complete load (map + every dig read once + the question list and dig records read once + the last visit
  // read) is the baseline; when the account kept a last visit, what differs from it is the first news ("since your last
  // visit"). Later live changes are news too ("while you were here"), each with a dot and a tour stop. The map as shown
  // is saved as the new last visit after the first complete load, then at most every 10 s while it changes; nothing is
  // kept in the browser (Decision A). A last visit that could not be read is never overwritten in this visit.
  // V4 screen review (3 Nov 2026), journey-f17: whether a place with news was seen is kept with the account, in that same
  // last visit: an item whose news the person has not opened yet keeps the word the account had, so the next visit (on
  // any device) still tells it and still marks its place, until it is opened (lib/v4/readyMoment.ts visitItemsToKeep).
  const [lastVisit, setLastVisit] = useState<LastVisitRead>({ status: "PENDING" });
  /** journey-f17: what the account holds as this debate's last visit (what was read, then what this page saved). */
  const accountVisit = useRef<Readonly<Record<string, string>>>({});
  /** journey-f17: the items whose news the person has not opened yet (their places still carry the "New" dot). */
  const unseenIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (servedRunId === null) return;
    let active = true;
    readLastVisit(servedRunId).then(
      (snapshot) => {
        if (!active) return;
        accountVisit.current = snapshot?.items ?? {};
        setLastVisit({ status: "READ", snapshot });
      },
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
  /**
   * Saves `items` as this debate's last visit unless they are what was saved last, the items with unseen news kept as the
   * account had them (journey-f17). Best-effort; never throws.
   */
  const saveVisit = useCallback((runIdToSave: string, items: Readonly<Record<string, string>>,
    unseen: ReadonlySet<string> = unseenIds.current): void => {
    const kept = storableItems(visitItemsToKeep(items, accountVisit.current, unseen));
    const key = JSON.stringify(kept);
    if (key === visitSave.current.sent) return;
    visitSave.current.sent = key;
    accountVisit.current = kept;
    void recordLastVisit(runIdToSave, kept);
  }, []);
  /** N7: a later save, gathered for VISIT_SAVE_MS (the newest map wins). */
  const scheduleVisitSave = useCallback((runIdToSave: string, items: Readonly<Record<string, string>>): void => {
    visitSave.current.items = items;
    if (visitSave.current.timer !== undefined) return;
    visitSave.current.timer = window.setTimeout(() => {
      visitSave.current.timer = undefined;
      if (visitSave.current.items !== null) saveVisit(runIdToSave, visitSave.current.items);
    }, VISIT_SAVE_MS);
  }, [saveVisit]);
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
  /** The story state the baseline last saw (wait-f15 / map-f21: while the first answer arrives, nothing it changes is news). */
  const baselineStory = useRef<V4Map["storyState"] | null>(null);
  /** R2DIG-3: digs found by a first read that landed after the baseline; their first appearance is not news. */
  const foldIds = useRef<ReadonlySet<string>>(new Set());
  const selectedRef = useRef(selected);
  const openedRef = useRef(opened);
  /** journey-f17: the ready moment's handler for live news (set once the moment's hook has run, below). */
  const onNewsRef = useRef<(fresh: readonly V4Change[]) => void>(() => undefined);
  useEffect(() => {
    selectedRef.current = selected;
    openedRef.current = opened;
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
  // dig-f1: the main answer is an item of the page's snapshot too (news at the question, never kept by the account).
  const mainItems = useMemo(() => mainAnswerItems(served?.answer), [served]);
  useEffect(() => {
    if (!liveReady || map === null || servedRunId === null) return;
    const items = { ...snapshotItems(map, digs), ...mainItems };
    const before = baseline.current;
    const storyBefore = baselineStory.current;
    baseline.current = items;
    baselineStory.current = map.storyState;
    const startedHere = new Set(visitLinks.map((link) => link.childRunId));
    if (before === null) {
      // N7: since the last visit the account kept (none on a first visit, or when it could not be read).
      const fresh = lastVisit.status === "READ" && lastVisit.snapshot !== null ? visitNews(lastVisit.snapshot.items, items, startedHere) : [];
      // N7: the first save at once; journey-f17: the places of that news not opened yet stay unseen in it.
      if (lastVisit.status === "READ") saveVisit(servedRunId, items, unseenIdsOf(map, fresh, openedRef.current));
      if (fresh.length === 0) return;
      setNews(fresh);
      setVisitNewsCount(fresh.length);
      return;
    }
    if (lastVisit.status === "READ") scheduleVisitSave(servedRunId, items);
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
    // wait-f15 / map-f21 (V4 screen review, 3 Nov 2026): the first answer arriving (its short answer written, its paths
    // filling in) is the person's first sight of it, never news; only digs and the main answer's rewrite are.
    if (firstAnswerArriving(storyBefore, map.storyState)) fresh = [...laterNewsOnly(fresh)];
    if (fresh.length === 0) return;
    setNews((previous) => [...previous, ...fresh]);
    // journey-f17: a dig finishing (or the main answer rewritten) while the person is here is a ready moment.
    onNewsRef.current(fresh);
    // A question opened earlier gets its "New" dot back when news lands on it (not the one on screen now).
    const landed = new Set<string>(fresh.map((change) => selectionForChange(map, change)));
    setOpened((previous) => new Set([...previous].filter((stop) => !landed.has(stop) || stop === selectedRef.current)));
  }, [liveReady, map, digs, mainItems, visitLinks, servedRunId, lastVisit, saveVisit, scheduleVisitSave]);

  // RULES-11/FIT-7: news is told by place (a stop); news on the question itself is one stop too, so every change can be
  // reached. R2TIME-6: the notice and its tour cover the news since the last "Hide this"; the "New" dots cover all news.
  const changed = useMemo<ReadonlySet<string>>(
    () => new Set(map === null ? [] : stopsOfChanges(map, news).filter((stop) => stop !== "root" && !opened.has(stop))),
    [map, news, opened]
  );
  // journey-f17: the account keeps these items as unseen; a place opened (or new news) is saved like any change.
  const unseen = useMemo(() => (map === null ? new Set<string>() : unseenIdsOf(map, news, opened)), [map, news, opened]);
  const unseenKey = [...unseen].sort().join("|");
  useEffect(() => {
    unseenIds.current = unseen;
  });
  useEffect(() => {
    if (lastVisit.status !== "READ" || servedRunId === null || baseline.current === null) return;
    scheduleVisitSave(servedRunId, baseline.current);
  }, [unseenKey, lastVisit.status, servedRunId, scheduleVisitSave]);

  // ── The ready moments and the changes tour (V4 screen review, 3 Nov 2026: journey-f17, wait-f4, dig-f3, dig-f18) ──
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, chosenLevel);
  const ready = useV4Ready({
    map,
    waiting: map === null && load?.kind === "RUN" && load.run.state !== "FAILED",
    isDigPage: isDigPage || recordParent !== null,
    news,
    hiddenNews,
    visitNewsCount,
    changed,
    selected: shownSelection,
    phone: layout === "phone",
    select,
    hideNews: () => setHiddenNews(news.length),
    focusHeading: () => headingRef.current?.focus(),
    reportHref,
    catalog,
    locale
  });
  useEffect(() => {
    onNewsRef.current = ready.onNews;
    reportReady.current = ready.onReportReady;
  });
  // The person opening any place on the map has seen the answer's ready moment.
  const selectionSeen = useRef(selected);
  useEffect(() => {
    if (selectionSeen.current === selected) return;
    selectionSeen.current = selected;
    ready.acknowledge();
  });

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

  // ── The map as shown (V4 screen review, 3 Nov) ──────────────────────────────────────────────────────────────────
  // map-f5 / journey-f12: the star sits on one open question no dig covers yet, and moves on when that one is dug.
  const dugKey = [...dugIds(digs)].sort().join("|");
  const shownMap = useMemo(() => (map === null ? null : restarMap(map, new Set(dugKey.length === 0 ? [] : dugKey.split("|")))), [map, dugKey]);
  // dig-f29: "the starred question" is the one the map starred first, before any dig moved the star.
  const firstStarId = useMemo(() => (map === null ? null : starOf(map)?.id ?? null), [map]);
  // dig-d4 B / map-d5: each card with unopened news turns over once in this visit.
  const reveal = useRevealOnce(changed);
  // map-d1: the answer card folds when another question is open or the window is short; a tap unfolds it until the
  // person opens another question.
  const shortWindow = useShortWindow();
  const [answerUnfolded, setAnswerUnfolded] = useState(false);
  useEffect(() => {
    setAnswerUnfolded(false);
  }, [shownSelection]);
  // map-d3 B: on the phone, a sideways swipe moves to the next or the previous path, and says where it landed.
  const [position, flashPosition] = usePositionFlash();
  const swipe = useSideSwipe(useCallback((step: 1 | -1) => {
    if (shownMap === null) return;
    const next = swipeTarget(shownMap, digs, shownSelection, step);
    if (next === null) return;
    select(next.selection, false);
    if (next.n > 0) flashPosition({ n: next.n, total: next.total });
  }, [shownMap, digs, shownSelection, select, flashPosition]));
  const moment = map === null ? null : reportMoment(map, digs, firstStarId);

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  // R2REG-5: links carry only a level the person chose (none chosen: /v4 still offers its one-time choice); the report
  // link is made above, with the ready moments.
  const askHref = levelHref("/v4", chosenLevel);
  // wait-f23 (owner's screen review): while the question waits, "Open in the classic view" shows once, at the bottom of
  // the waiting card, and not in the header too.
  const waitingCard = map === null && load?.kind === "RUN" && load.run.state !== "FAILED";
  // map-f6: no reading level shows until the saved one is known; the map waits for it behind its outline (not forever).
  const levelSettled = useLevelSettled(levelKnown, map !== null);
  const header = (
    <V4Header
      catalog={catalog}
      readingLevel={levelSettled ? readingLevel : null}
      linkLevel={chosenLevel}
      onReadingLevel={chooseLevel}
      classicHref={waitingCard ? null : classicHref}
    >
      {served !== null ? (
        // W3-4: "Write my report" is always there once the answer is served (the owner's money rule keeps it possible).
        // map-f15: it is the page's one report button; dig-f29's "Good time" is a small mark on it, with the words.
        <Link className={`v4Btn v4BtnPrimary v4DebReportLink${moment === "GOOD" ? " v4DebReportGood" : ""}`} href={reportHref}>
          {moment === "GOOD" ? <span className="v4DebReportMark" aria-hidden="true" /> : null}
          {t(catalog, "v4.rail.writeReport")}
          {moment === "GOOD" ? <span className="v4SrOnly">{` · ${t(catalog, "v4.rail.goodTimeTitle")}`}</span> : null}
        </Link>
      ) : null}
    </V4Header>
  );

  // wait-f4: the tab title's state word ("Looking into it", "Ready", "(1) changed"), read by DocumentTitle.
  const tabPrefix = ready.tabPrefix === "" ? {} : { [TAB_PREFIX_ATTRIBUTE]: ready.tabPrefix };
  if (loadProblem === "SIGNED_OUT" && map === null) {
    // wait-f1: the sign-in ended (on the waiting card, or before the first read): sign in again, and come back here.
    return (
      <div className="v4DebPage">
        {header}
        <div className="v4DebCentre">
          <V4SignInAgain
            questionLine={load?.kind === "RUN" ? load.run.question_line : null}
            signInHref={signInHrefHere()}
            catalog={catalog}
          />
        </div>
      </div>
    );
  }
  if ((map === null && load === null && loadProblem === null) || (map !== null && !levelSettled)) {
    // map-f6: the page's grey outline until there is something to show (and, on the map, until the level is known).
    return (
      <div className="v4DebPage">
        {header}
        <div className="v4DebMain"><V4LoadingOutline catalog={catalog} /></div>
      </div>
    );
  }
  if (map === null) {
    return (
      <div className="v4DebPage" {...tabPrefix}>
        {ready.announcer}
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
            // Owner review 3 Nov (wait-f11, map-f30): "Ask this again" fills the ask step from this debate; a dig leads back to its map.
            <V4FailedScreen
              run={load.run}
              askAgainHref={levelHref(askAgainHref(runId), chosenLevel)}
              askHref={askHref}
              classicHref={classicHref}
              dig={isDigPage || recordParent !== null
                ? { backHref: parent === null ? null : levelHref(`/v4/debate/${encodeURIComponent(parent.runId)}`, chosenLevel) }
                : null}
              catalog={catalog}
              homeCatalog={homeCatalog}
            />
          ) : pauseOfRun(load.run) !== null ? (
            // Owner review 3 Nov (wait-f5, public-f17): paused at the month wall, the pause is said once, with a still mark.
            <V4PausedScreen
              run={load.run}
              runId={runId}
              reconnecting={loadProblem === "UNREACHABLE"}
              classicHref={classicHref}
              catalog={catalog}
              locale={locale}
            />
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

  // Owner review 3 Nov (wait-f2): a dig paused at the month wall is counted as paused, not as running.
  const dugCounts: V4DigCounts = {
    running: digs.filter((dig) => isRunning(dig) && pauseOfDig(dig) === null).length,
    paused: pausedDigCount(digs),
    done: digs.filter((dig) => dig.state === "DONE").length,
    failed: digs.filter((dig) => dig.state === "FAILED").length
  };
  // The map as shown: its star moved off what is dug (map-f5). Everything else reads the same map.
  const view = shownMap ?? map;
  const openLeft = openCount(view, digs);
  const room = ask.room;
  // The money rule: new starts waiting for the reset get their own line (with the time) in place of today's notice.
  const startsWait = startsWaitLine(room, locale);
  const money: readonly MoneyLine[] = [digShareLine(room), startsWait].filter((line): line is MoneyLine => line !== null);
  const roomNotice = startsWait === null && room !== null
    && (room.room === "CLOSE" || room.room === "FULL" || room.room === "ALREADY_WAITING")
    ? <RoomNotice room={room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
    : null;
  const phoneTarget = layout === "phone" && choice !== undefined ? targetOf(view, digs, shownSelection, choice) : null;
  // dig-f17 / dig-f29 (the map track): the slim report line follows the page's report moment, the corrected rule.
  const goodTime = moment === "GOOD";
  // journey-d3: the pinned bar's one job. A place whose dig waits has its Undo in the note above the bar instead.
  const phoneJob: V4BarJob = phoneTarget !== null
    ? waitingDigFor(waitingDigs, servedRunId, phoneTarget.target) === null
      ? { kind: "dig", label: barDigLabel(phoneTarget, shareFor(phoneTarget.target, draft, room), catalog), onDig: () => startDig(phoneTarget.target) }
      : { kind: "none" }
    : goodTime ? { kind: "report", href: reportHref } : { kind: "none" };

  const rail = (variant: "column" | "strip" | "marks" | "notes" | "steps") => (
    <V4Rail
      runId={runId}
      level={chosenLevel}
      showReadStep={!isDigPage && recordParent === null}
      openLeft={openLeft}
      digs={dugCounts}
      variant={variant}
      usageNotes={borrowLines(borrowed)}
      moment={moment}
      reportReady={ready.reportDot}
      catalog={catalog}
      locale={locale}
    />
  );
  const pieces = {
    map: view,
    digs,
    selected: shownSelection,
    changed,
    picked,
    onSelect: select,
    onTogglePick: togglePick,
    catalog,
    locale,
    reveal,
    ...(choice === undefined ? {} : { choice })
  } as const;
  // map-d1: the answer card folds into its line when another question is open or the window is short. On a phone its
  // line goes back to "Your question"; elsewhere it unfolds in place.
  const rootShown = shownSelection === "root";
  const answerFolded = !answerUnfolded && (!rootShown || shortWindow);
  const answerCard = (
    <V4AnswerCard
      map={view}
      mainAnswer={served?.answer.main_answer}
      reportAnswer={reportAnswer}
      answeredAt={served?.answer.as_of ?? null}
      folded={answerFolded}
      onUnfold={() => (layout === "phone" && !rootShown ? select("root", false) : setAnswerUnfolded(true))}
      {...(answerUnfolded ? { onFold: () => setAnswerUnfolded(false) } : {})}
      catalog={catalog}
      locale={locale}
    />
  );
  // map-f10: past the map in one step, to the answer of the question open in the panel.
  const skipLink = (
    <a
      className="v4SkipLink"
      href="#v4-deb-panel"
      onClick={(event) => {
        event.preventDefault();
        headingRef.current?.focus();
      }}
    >
      {t(catalog, "v4.map.skipToAnswer")}
    </a>
  );

  // W3-4: the tray names the path its picks are on (owner Q-D1: one path per dig), the money lines, and Free's cap.
  // journey-f23 (owner's screen review): the picks show as chips, never as a count. dig-f8: no mode word on Free.
  // journey-d3: inside the phone's bar the bar's own button digs the picks when the person is on their path, so the
  // folded tray does not offer a second one.
  const trayOf = (withDig: boolean): ReactNode => (hasTray && trayTarget !== null && trayTarget.kind === "picks" ? (
    <section className="v4DebTray" aria-label={t(catalog, "v4.dig.trayLabel")}>
      <V4PickChips picks={trayTarget.picks} label={t(catalog, "v4.map.picked")} />
      <p className="v4DebTrayText">
        {trayTarget.path !== null ? <TitleText title={pathTitle(trayTarget.path, catalog, 40)} catalog={catalog} /> : null}
        {trayTarget.path !== null && planTier !== "free" ? " · " : null}
        {planTier === "free" ? null : t(catalog, `v4.digMode.${sentDigMode}`)}
      </p>
      <p className="v4DebTrayHint v4Muted">
        {t(catalog, "v4.suggest.onePath")}
        {planTier === "free" ? <>{" "}{t(catalog, "v4.suggest.freeCap", { count: picksMax("free") })}</> : null}
      </p>
      <V4MoneyLines lines={money} catalog={catalog} />
      {publicLine === null ? null : <p className="v4DebTrayPublic">{t(catalog, "v4.publicMark.addsToPublic")}</p>}
      <div className="v4DebTrayActions">
        {withDig ? (
          <button
            type="button"
            className="v4Btn v4BtnPrimary"
            onClick={() => startDig(trayTarget)}
          >
            {trayTarget.picks.length >= 2
              ? tPlural(catalog, "v4.dig.trayDig", trayTarget.picks.length, locale)
              : t(catalog, "v4.panel.dig")}
          </button>
        ) : null}
        <button type="button" className="v4Link v4DebTrayClear" onClick={clearPicks}>
          {t(catalog, "v4.dig.trayClear")}
        </button>
      </div>
    </section>
  ) : null);
  const tray = trayOf(true);

  // dig-f23: where the tray was, "Picks cleared [Undo]" for 10 seconds, in the shared Undo note (journey-f21).
  const picksClearedNote = picksUndo.offered
    ? <V4PicksClearedNote onUndo={picksUndo.undo} endsAt={picksUndo.endsAt ?? undefined} catalog={catalog} />
    : null;

  // dig-d3 / dig-f10: every waiting dig of the site, in this page's bottom stack (the site-wide holder steps back). [See it]
  // opens a started dig of this map in the panel, so the person is never moved there by itself.
  const digNotes = (
    <V4DigNotes
      entries={waitingDigs}
      catalog={catalog}
      locale={locale}
      narrow={layout === "phone"}
      hereRunId={servedRunId}
      onSeeIt={(_entry, childRunId) => select(`dig:${childRunId}`, false)}
      viewingDig={shownSelection}
      returnFocus={() => barJobRef.current ?? mapButtonRef.current}
    />
  );

  const pageClass = `v4DebPage v4DebLayout-${layout}${hasTray ? " v4DebHasTray" : ""}${sheetOpen ? " v4DebSheetOpen" : ""}`;
  return (
    <div className={pageClass} {...tabPrefix}>
      {/* The tab title follows this heading (DocumentTitle): the person's own words, not the added lines. R2TIME-9: it
          sits outside the inert wrapper, so the title stays while the phone map is open. wait-f4: the state word above
          (data-tab-prefix) and the one live region sit outside it too. */}
      <h1 className="v4SrOnly" data-ai-generated="true">{ownWords(map.question)}</h1>
      {ready.announcer}
      {/* UI-6: while the phone map is open, everything behind it is inert (the sheet is a real modal). */}
      <div className="v4DebBehind" inert={sheetOpen}>
        {header}
        {layout === "mid" ? rail("strip") : null}
        {/* map-f7 / map-d3 B: on the phone, where you are stays pinned under the header, with the live minimap. */}
        {layout === "phone" ? (
          <V4WhereBar
            map={view}
            digs={digs}
            selected={shownSelection}
            onSelect={select}
            onOpenMap={openSheet}
            position={position}
            catalog={catalog}
          />
        ) : null}
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
          {/* W4-6: a dig's map says where it sits; the top of every map, how many paths changed since the answer. */}
          {map.dig !== null && map.dig !== undefined ? (
            <V4LevelTrail level={map.dig.level} trail={trail} linkLevel={chosenLevel} catalog={catalog} />
          ) : null}
          <V4PublicMark stage={publicStage} catalog={catalog} />
          <V4ContributionNote contribution={served?.answer.contribution} catalog={catalog} />
          {answerCard}
          {/* dig-f19 / map-f17: once a report exists and the map moved on, the paths it does not have yet, named. */}
          <V4ChangedSince
            changedSince={map.changedSince}
            changedPaths={pathsChangedSinceReport(map, reportAnswer?.writtenAt ?? null)}
            digRunning={dugCounts.running > 0}
            reportHref={reportHref}
            catalog={catalog}
            locale={locale}
          />
          {/* journey-f10 / dig-f3: "What your digs did", which is also the finished-dig notice. wait-f9 / map-f21: the
              short answer being written is said once, in the answer card, not here as well. */}
          <V4ChangesBar
            headline={ready.notice.headline}
            stops={ready.notice.stops}
            sinceLastVisit={hiddenNews < visitNewsCount}
            onSee={ready.notice.onSee}
            onDismiss={() => setHiddenNews(news.length)}
            results={pathResults(map)}
            catalog={catalog}
          />
          {/* W3-4: the deepest level offers no dig anywhere on its map; this line says so once, at the top. */}
          {canDig ? null : <p className="v4DebNote v4DebDeepest" role="note">{t(catalog, "v4.nest.deepest")}</p>}

          {/* map-f23: on the phone's "Your question", the paths looked into come right under the answer. */}
          {layout === "phone" && rootShown ? (
            <>
              <V4PathList map={view} onSelect={select} catalog={catalog} />
              {rail("notes")}
            </>
          ) : null}

          <div className="v4DebGrid">
            {layout === "desktop" ? <div className="v4DebRailCol">{rail("column")}</div> : null}
            {layout === "laptop" ? <div className="v4DebRailCol v4DebRailMarksCol">{rail("marks")}</div> : null}
            {layout !== "phone" ? (
              <section className="v4DebMapCol" aria-label={t(catalog, "v4.debate.mapRegion")}>
                {layout === "laptop" ? rail("notes") : null}
                {skipLink}
                {layout === "mid" ? <V4Outline {...pieces} /> : <V4MapTree {...pieces} fold={layout === "laptop"} />}
              </section>
            ) : null}
            <section
              ref={panelColRef}
              id="v4-deb-panel"
              className="v4DebPanelCol"
              aria-label={t(catalog, "v4.debate.panelRegion")}
              {...(layout === "phone" ? swipe : {})}
            >
              <V4Panel
                map={view}
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
                // dig-d3: other dig buttons stay active while a dig waits; the place being dug says it is starting.
                digBusy={false}
                digStarting={(target) => {
                  const entry = waitingDigFor(waitingDigs, servedRunId, target);
                  return entry === null ? null : <V4DigStartingLine entry={entry} onUndo={undoDig} catalog={catalog} />;
                }}
                digStartingAtTop={layout === "phone"}
                // W4-4: not on Free (owner: paid plans read added pages), and not while new starts wait for a reset.
                {...(planTier === "free" || startsWait !== null ? {} : { onAddResearched: pressResearched })}
                researchedPresses={researchedPresses}
                roomNotice={roomNotice}
                money={money}
                digPathLine={trail?.steps.at(-1)?.line ?? null}
                reportAnswer={reportAnswer}
                answerOnTop
                {...(choice === undefined ? {} : { choice })}
                {...(failedDigs === undefined ? {} : { failedDigs })}
                headingRef={headingRef}
                underCrumbs={ready.underCrumbs}
                catalog={catalog}
                locale={locale}
              />
            </section>
          </div>
        </div>
      </div>

      {/* journey-d3 / dig-f16: one bottom stack that measures itself (notes, tray, and on a phone the pinned bar). */}
      {sheetOpen ? null : (
        <V4BottomStack
          phone={layout === "phone"}
          // journey-f17 / wait-f4 (the ready-digs track): the ready note sits with the Undo notes, above the pinned bar.
          notes={<>{ready.note}{digNotes}{picksClearedNote}</>}
          // dig-f18: the tour's pinned "Next change › · Done" sits right above the phone's bar.
          pinned={ready.phoneTourBar}
          tray={layout === "phone" ? trayOf(phoneTarget?.target.kind !== "picks") : tray}
          trayTitle={trayTarget !== null && trayTarget.kind === "picks" && trayTarget.path !== null
            ? <TitleText title={pathTitle(trayTarget.path, catalog, 40)} catalog={catalog} />
            : undefined}
          mapButtonRef={mapButtonRef}
          jobRef={barJobRef}
          onMap={openSheet}
          job={phoneJob}
          goodTime={goodTime}
          reportHref={reportHref}
          catalog={catalog}
        />
      )}

      {sheetOpen ? (
        <OutlineSheet
          onClose={closeSheet}
          footer={<>{ready.note}{digNotes}{picksClearedNote}{tray}</>}
          catalog={catalog}
        >
          {/* map-f23: the sheet opens straight at the outline; the steps are one line at its foot. */}
          <V4Outline {...pieces} />
          {rail("steps")}
        </OutlineSheet>
      ) : null}
      {ask.dialogs}
      {leaveGuard.asking ? <V4LeaveQuestion onStay={leaveGuard.stay} onLeave={leaveGuard.leave} catalog={catalog} /> : null}
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
  // map-f6: the page's grey outline, never a bare "Loading…" line.
  return <V4LoadingOutline catalog={catalog} />;
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
 * W3-4 (the money rule, owner 31 Oct): a debate paused at the month wall. Owner review 3 Nov (wait-f2): it is the one
 * pause block (V4MonthPause). The page shows a paused run on V4PausedScreen, so this stays only for ProgressScreen's
 * own reference until the start-step's wait view takes the block in.
 */
function MonthPaused({ run, runId, catalog, locale }: Readonly<{
  run: RunProjection; runId: string; catalog: MessageCatalog; locale: string;
}>) {
  const pause = pauseOfRun(run);
  return pause === null ? null : <V4MonthPause runId={runId} pause={pause} catalog={catalog} locale={locale} />;
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
