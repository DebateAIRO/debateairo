"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  canDigFromLevel,
  type Answer,
  type AnswerStory,
  type CarryOnPart,
  type DigLinks,
  type DigSuggestion,
  type RunProjection
} from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { TAB_PREFIX_ATTRIBUTE } from "@/components/DocumentTitle";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4BottomStack, type V4BarJob } from "@/components/v4/V4BottomStack";
import { V4ChangesBar } from "@/components/v4/V4ChangesBar";
import type { V4DigChoice } from "@/components/v4/V4DigSuggest";
import { V4DigTray, V4PicksList } from "@/components/v4/V4DigTray";
import { useDigPaths } from "@/components/v4/V4DigPaths";
import { V4DigNotes, V4DigStartingLine } from "@/components/v4/V4DigUndo";
import { V4FailedScreen } from "@/components/v4/V4FailedScreen";
import { V4Header } from "@/components/v4/V4Header";
import { V4ContributionNote } from "@/components/v4/V4ContributionNote";
import { V4LevelTrail } from "@/components/v4/V4LevelTrail";
import { V4LeaveQuestion } from "@/components/v4/V4LeaveQuestion";
import { V4LoadingOutline, V4LoadingPage, V4SignInAgain } from "@/components/v4/V4LoadingOutline";
import { V4PicksClearedNote } from "@/components/v4/V4PicksClearedNote";
import {
  digFor, digsUnder, firstCardQuestion, openCount, pathIdOf, pathTitle, resolveSelection, resolveSelectionNear, rootPanelOpen, selectionIdOf,
  shortText, TitleText, V4MapTree
} from "@/components/v4/V4MapTree";
import { V4MainAnswer } from "@/components/v4/V4MainAnswer";
import { CARRY_ON_REPORT_POLL_MS, runIsRunning, V4RunRoot } from "@/components/v4/V4RunPaths";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { V4PendingMap } from "@/components/v4/V4PendingMap";
import { useQuestionShare, V4QuestionShareLine, V4TopLine } from "@/components/v4/V4QuestionShare";
import { V4PublicMark } from "@/components/v4/V4PublicMark";
import { usePublicStage } from "@/lib/v4/publicState";
import { typedPublicNotes } from "@/lib/v4/publicNotes";
import type { V4ResearchedPress } from "@/components/v4/V4Sources";
import { V4ChangedSince } from "@/components/v4/V4PathRewrite";
import { V4AnswerCard, type V4ReportAnswer } from "@/components/v4/V4AnswerCard";
import { V4PathList, V4SkipToAnswer, V4WhereBar } from "@/components/v4/V4MapPlace";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { useMapView } from "@/components/v4/useMapView";
import { useStoppedContinue } from "@/components/v4/useStoppedContinue";
import { V4Steps } from "@/components/v4/V4Steps";
import { useV4Ready } from "@/components/v4/useV4Ready";
import { useMapReport } from "@/components/v4/useMapReport";
import { digAboutLine } from "@/components/v4/digAbout";
import { phoneBarJob, picksPlaceOf, showChoices, type PhoneTarget } from "@/components/v4/mapDigHelpers";
import { contractClient, isNotFound } from "@/lib/api";
import { isSignedOut, signInHrefHere } from "@/lib/signInWayBack";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords, parseDigQuestion } from "@/lib/v4/askText";
import { mergeDigLinks, readDigRecords, storableItems } from "@/lib/v4/accountMemory";
import { diffSnapshots, isRewriteWord, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import {
  firstAnswerArriving, laterNewsOnly, mainAnswerItems, mainAnswerWriting, pathResults, pathsChangedSinceReport, stopsOfChanges, unseenIdsOf
} from "@/lib/v4/readyMoment";
import { effectiveDigMode } from "@/lib/v4/askConfig";
import { panelDigsPicks, trayShows } from "@/lib/v4/digDock";
import { askAgainHref } from "@/lib/v4/failedRun";
import { digLinksFor, digParentOf, mergeIndex, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import { DIG_UNDO_MS, useClaimDigNotes, waitingDigFor } from "@/lib/v4/digUndo";
import { isPathsParent } from "@/lib/v4/digPathPlan";
import { startedThisVisit, useDigQueue } from "@/lib/v4/useDigQueue";
import { useFailedDigs } from "@/lib/v4/useFailedDigs";
import { useParentDigRetry, type ParentDigRetryReads } from "@/lib/v4/useParentDigRetry";
import { waitingDigQuestionOf } from "@/lib/v4/reportWriting";
import { useUnseenSaving, useVisitMemory } from "@/lib/v4/useVisitMemory";
import { selectedDigOf, usePausedBarJob } from "@/lib/v4/usePausedBarJob";
import {
  addToResearched, loadAnswer, loadDigProgress, loadDigTrail, loadDigView, loadStory, loadV4, storyReadFailed, type DigTrail, type V4Load
} from "@/lib/v4/load";
import { researchedWaiting } from "@/lib/v4/web";
import { buildV4Map, buildV4PendingMap, buildV4RunMap, rewriteByDig, rewriteWaiting, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import { clearHandOff, handOffFor, type StartHandOff } from "@/lib/v4/startHandOff";
import { borrowLines, digShareLine, limitLine, limitLineWhileReportWaits, type MoneyLine } from "@/lib/v4/money";
import { digButtonLabel, type V4DigQuota } from "@/lib/v4/digQuota";
import { useBorrowed } from "@/lib/v4/useBorrowed";
import { useDigQuota } from "@/lib/v4/useDigQuota";
import { useQuotaMoments } from "@/lib/v4/useQuotaMoments";
import { pausedDigCount, pauseOfDig, pauseOfRun } from "@/lib/v4/monthPause";
import { CARRY_ON_BUILT } from "@/lib/v4/carryOn";
import { stateWordText, waitStateOfRun } from "@/lib/v4/stateWords";
import {
  addPick,
  digSuggestionsWithMore,
  draftTarget,
  editPick,
  EMPTY_DRAFT,
  isEdited,
  mainQuestionTarget,
  morePick,
  openPick,
  ownViewPick,
  pickedOpenIds,
  pickRefusal,
  removePick,
  suggestionPick,
  togglePick as toggleDraftPick
} from "@/lib/v4/suggestions";
import { levelHref } from "@/lib/v4/storage";
import type {
  DigLink,
  DigMode,
  DigTarget,
  DigView,
  ReadingLevel,
  V4Change,
  V4DigDraft,
  V4DigPick,
  V4Map,
  V4MoreItem,
  V4Selection
} from "@/lib/v4/types";
import { useV4Ask } from "@/lib/v4/useV4Ask";
import { useWaitPolling } from "@/lib/v4/useWaitPolling";
import { useDigProgress } from "@/lib/v4/useDigProgress";
import { useDigsBelow, type DigsBelowReads } from "@/lib/v4/useDigsBelow";
import { useLeaveLinkGuard, useTypedWords } from "@/lib/v4/useLeaveGuard";
import { useLevelSettled } from "@/lib/v4/useLevelSettled";
import { usePicksUndo } from "@/lib/v4/usePicksUndo";
import { useAddressPicks, useQuestionAddress } from "@/lib/v4/useQuestionAddress";
import { useSheetFocusReturn } from "@/lib/v4/useSheetFocusReturn";

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
/**
 * V4 start step, Task 62 (wait-f10): once the page stopped waiting for a short answer still being written, it asks again this
 * often (the pace of the site-version check), and once at once when the tab is shown again.
 */
export const STORY_SLOW_POLL_MS = 300_000;
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
/** Task 62: a sign no path title holds, so the polite line splits around the title and the title alone is marked AI text. */
const FILLED_SLOT = "\u2063\u2063";
/** Task 62: a path's whole title in the polite "ready to read" line (the panel's heading shows it whole too). */
const PATH_TITLE_WHOLE = 2_000;
/**
 * The reading level the page uses for a debate asked without one. V4 start step, Task 75d (owner, 5 Nov, second round): Plain
 * words, the level every question starts on (it was "some background" while the address named the level).
 */
const DEFAULT_LEVEL: ReadingLevel = "plain";
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

/** dig-f2: the reads that follow the digs below this map's own (their records, their state, the answers in between). */
const BELOW_READS: DigsBelowReads = { readDigRecords, loadDigView, loadAnswer };
/** Task 76j (wiring item 12): the reads of the map a failed dig was dug from (lib/v4/useParentDigRetry.ts). */
const PARENT_RETRY_READS: ParentDigRetryReads = { ...BELOW_READS, loadStory: (answerId) => loadStory(answerId) };

export type V4DebateClientProps = Readonly<{
  id: string;
  /** W4-6: the path the address names (`?path=`, a link back from a dig), opened in the panel at first; null: none. */
  initialPath?: string | null;
  /**
   * The reading level the address names (`?level=`), or null. V4 start step, Task 75c (owner answer Q15, 5 Nov): no longer read;
   * the page shows the debate's own level, as its run read says.
   */
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
}>;

/**
 * V4 start step, Task 76i (the review session's note "the map header remounts while loading"): every screen of the page (the
 * outline, the hand-off, the status screens and the map) holds its header in the wrapper with this key, so React keeps the one
 * header element from the first look to the map, wherever the wrapper sits among the screen's other parts. The wrapper adds no
 * box of its own (`.v4DebBehind`), so on the screens before the map it holds the header alone.
 */
const HEADER_FRAME = "header-frame";

/** Every V3 read is asker-scoped, so the page waits for a session first (the classic page does the same). */
export function V4DebateClient(props: V4DebateClientProps) {
  // Task 76i (wait-f14): the ask page's hand-off for this debate, read once when the page opens on it; none after a reload, in
  // another tab, for another debate, or once it is a minute old (lib/v4/startHandOff.ts).
  const handOff = useHandOff(props.id);
  return (
    // map-f6: one look while the page loads, from the session check on: a grey outline of the page. Task 76i: after Start, the
    // question and its paths instead, under the held header bar (the sign-in check runs behind them, never on a blank page).
    <AuthGate
      catalog={props.newDebateCatalog}
      checkingView={handOff === null
        ? <V4LoadingPage catalog={props.catalog} />
        : <HandOffPage handOff={handOff} catalog={props.catalog} locale={props.locale} />}
    >
      {() => (
        // Keyed by id: moving between two debates (a dig's back link) starts fresh, never with the last one's state.
        <V4Debate key={props.id} {...props} handOff={handOff} />
      )}
    </AuthGate>
  );
}

/** Task 76i: this debate's hand-off, read once for each debate the page opens on (as V4Debate is keyed by its id). */
function useHandOff(id: string): StartHandOff | null {
  const [held, setHeld] = useState(() => ({ id, handOff: handOffFor(id, Date.now()) }));
  if (held.id === id) return held.handOff;
  const next = { id, handOff: handOffFor(id, Date.now()) };
  setHeld(next);
  return next.handOff;
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

/**
 * What the phone's pinned "Dig deeper here" digs into: the person's picks when there are some (dig-f4, 3 Nov: a phone has
 * no tray, so the pinned button carries them on whichever screen is open), else a path or one open question (never the
 * root or a dig). W3-4: an open question that already has a dig, and a path that has one (or any path of a dig's own
 * map), offer "Dig here too"; at the deepest level nothing is offered.
 */
function targetOf(map: V4Map, digs: readonly DigView[], selection: V4Selection, choice: V4DigChoice): PhoneTarget | null {
  if (!choice.canDig) return null;
  const picks = draftTarget(choice.draft, map.paths);
  if (picks !== null) return { target: picks, again: false };
  if (selection.startsWith("path:")) {
    const path = map.paths.find((candidate) => `path:${candidate.id}` === selection);
    return path === undefined ? null : { target: { kind: "path", path }, again: choice.digHereToo(path.id) };
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
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint,
  handOff
}: V4DebateClientProps & Readonly<{ handOff: StartHandOff | null }>) {
  const layout = useLayout();
  const [digMode, setDigMode] = useState<DigMode>("quick");

  // ── The debate: poll the run until it is served or failed ─────────────────────────────────────────────────────────
  // wait-f19 (owner's screen review): rarely while the tab is hidden, at once when it is shown again or the connection
  // returns (useWaitPolling); a retry from the status screen starts afresh. What the hook returns (when a check last
  // answered, lost touch, Try now) is what the waiting card (V4WaitCard) shows once the start-step session places it in
  // the wait view; until then nothing on the page reads it.
  const [load, setLoad] = useState<V4Load | null>(null);
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // V4 start step, Task 75c (owner answer Q15, 5 Nov): the level belongs to the question. The page shows the debate at the level it
  // was asked at, as its run read says (lib/v4/load.ts); the address's `?level=` and the account's saved level no longer change it,
  // and nothing on this page changes it. A debate asked without one reads as the default level (Task 75d: Plain words). Links from
  // here carry no `?level=`: into its report (Task 76l: the report page reads the level itself) or to its other maps (Task 76n:
  // each map reads its own debate's level, so the address never names one).
  const debateLevel: ReadingLevel | null = load === null ? null : load.kind === "RUN" ? load.run.reading_level ?? null : load.level ?? null;
  const readingLevel: ReadingLevel = debateLevel ?? DEFAULT_LEVEL;
  /** The level is known once the debate was read (map-f6: no level shows before). */
  const levelKnown = load !== null;
  // Task 76i (wait-f14): once the debate's first read answered, whatever it said, the ask page's hand-off is used up; a reload,
  // or this map opened again, finds none.
  const firstReadAnswered = load !== null || loadProblem !== null;
  useEffect(() => {
    if (firstReadAnswered) clearHandOff(id);
  }, [firstReadAnswered, id]);
  useWaitPolling(async (stillWanted) => {
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
  // Task 62 (wait-f10): the page gave up waiting for ONE answer version, so a newer version (after a dig) is waited for afresh.
  const versionKey = answerId === null ? null : `${answerId}/${answerVersion}`;
  const [gaveUpFor, setGaveUpFor] = useState<string | null>(null);
  const storyGaveUp = versionKey !== null && gaveUpFor === versionKey;
  /** wait-f10: how many times a short answer came after the page stopped waiting for it (each is one ready moment). */
  const [shortAnswerLate, setShortAnswerLate] = useState(0);
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
        setGaveUpFor(`${answerId}/${answerVersion}`);
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

  // ── Task 62 (wait-f10): after the page stops waiting, the short answer still being written is asked for every 5 minutes ──
  // and once at once when the tab is shown again. A read that answers READY clears the gave-up state (the map takes the story's
  // paths, the answer card's short answer fills its place, and the late moment plays once); UNAVAILABLE, or the page leaving,
  // stops the reads.
  const slowStory = storyGaveUp && story !== null && (story.status === "WRITING" || storyFailedRead);
  useEffect(() => {
    if (answerId === null || !slowStory) return;
    const key = `${answerId}/${answerVersion}`;
    let active = true;
    let busy = false;
    let timer: number | undefined;
    const read = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      window.clearTimeout(timer);
      let next: AnswerStory | null = null;
      try {
        next = await loadStory(answerId, undefined, answerVersion);
      } catch {
        next = null;
      }
      busy = false;
      if (!active) return;
      if (next !== null) {
        setPolledStory({ answerId, story: next });
        if (!storyReadFailed(next) && (next.status === "READY" || next.status === "READY_WITH_RESERVATION")) {
          setGaveUpFor((was) => (was === key ? null : was));
          setShortAnswerLate((count) => count + 1);
        }
      }
      timer = window.setTimeout(() => void read(), STORY_SLOW_POLL_MS);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void read();
    };
    timer = window.setTimeout(() => void read(), STORY_SLOW_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [answerId, answerVersion, slowStory]);

  // TIME-6/FIT-5: once the page stops waiting, the map says the summary is unavailable, not "still being written".
  const map = useMemo<V4Map | null>(
    () => (served === null ? null : buildV4Map({ runId: served.runId, answer: served.answer, story, storyGaveUp })),
    [served, story, storyGaveUp]
  );
  const servedRunId = served?.runId ?? null;
  const servedQuestionLine = served?.answer.question_line ?? null;
  // ── V4 start step, Task 62 (wait-d1, map-d2): a path debate's run read draws the map at once, before the answer ─────────
  // (lib/v4/mapModel.ts buildV4RunMap; null for an R22 run read and for a failed run). The page DRAWS `map ?? runMap`;
  // everything that digs, picks, tours or keeps news reads `map` (the served one), so during the wait none of them exists.
  const runRead = load?.kind === "RUN" ? load.run : null;
  const runMap = useMemo<V4Map | null>(() => (runRead === null ? null : buildV4RunMap({ runId, run: runRead })), [runId, runRead]);
  const drawn: V4Map | null = map ?? runMap;

  // ── The carry-on line (wait-f16): the part the server says is running (`carry_on_part`, Task 58) ──────────────────────
  // During the run the page's usual run reads carry it. Once the answer is served, while the line shows, the owner's run read
  // is asked again every CARRY_ON_REPORT_POLL_MS; the reads stop when the server names no part, and the line then goes.
  const lastRunCarry = useRef<CarryOnPart | null>(null);
  useEffect(() => {
    if (runRead !== null) lastRunCarry.current = runRead.carry_on_part ?? null;
  });
  const [servedCarry, setServedCarry] = useState<Readonly<{ runId: string; part: CarryOnPart | null }> | null>(null);
  const carryPart: CarryOnPart | null = served === null
    ? runRead?.carry_on_part ?? null
    : servedCarry !== null && servedCarry.runId === served.runId ? servedCarry.part : served.answer.carry_on_part ?? lastRunCarry.current;
  const carryShown = CARRY_ON_BUILT && drawn?.carryOnToReport === true && carryPart !== null;
  useEffect(() => {
    if (servedRunId === null || !carryShown) return;
    let active = true;
    let timer: number | undefined;
    const read = async (): Promise<void> => {
      let part: CarryOnPart | null | undefined;
      try {
        part = (await contractClient.readRun(servedRunId)).carry_on_part ?? null;
      } catch {
        // Quiet: the line keeps what it showed, and the run is asked again later.
        part = undefined;
      }
      if (!active) return;
      if (part !== undefined) setServedCarry({ runId: servedRunId, part });
      if (part !== null) timer = window.setTimeout(() => void read(), CARRY_ON_REPORT_POLL_MS);
    };
    timer = window.setTimeout(() => void read(), CARRY_ON_REPORT_POLL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [servedRunId, carryShown]);

  // ── Task 62 (map-f4): a path that fills in between two run reads is said once, politely, per path per visit ──────────
  // (the main answer's arrival is its own ready moment, not this line).
  // Review of Tasks 60-62: each title keeps whether an AI wrote it (a path the person added or rewrote is theirs, Task 61).
  const [filledTitles, setFilledTitles] = useState<readonly Readonly<{ text: string; ai: boolean }>[]>([]);
  const filledSeen = useRef<Set<string>>(new Set());
  const lookingBefore = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (runMap === null) {
      lookingBefore.current = null;
      return;
    }
    const looking = new Set(runMap.paths.filter((path) => path.branch?.state === "LOOKING").map((path) => path.id));
    const before = lookingBefore.current;
    lookingBefore.current = looking;
    if (before === null) return;
    const fresh = runMap.paths.filter((path) => before.has(path.id) && !looking.has(path.id) && !filledSeen.current.has(path.id));
    if (fresh.length === 0) return;
    for (const path of fresh) filledSeen.current.add(path.id);
    setFilledTitles(fresh.map((path) => {
      const title = pathTitle(path, catalog, PATH_TITLE_WHOLE);
      return { text: title.text, ai: title.ai };
    }));
  }, [runMap, catalog]);

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
  // Owner's screen review (3 Nov): every dig button's quota words, from its own check with the server (dig-f5), read
  // again after each quota moment (dig-f11); lib/v4/useDigQuota.ts.
  const { quota: readQuota, room: digRoomRead } = useDigQuota({
    room: ask.room, parentRunId: servedRunId === null || !canDig ? null : servedRunId, picks: draft.picks.length,
    mode: digMode, readingLevel, catalog, locale
  });
  // V4 start step, Task 79b (owner answer Q19 of 4 Nov, "a dig's share follows a combine"; journey-f8): on a path debate a dig of
  // picks looks into one path per pick (the server's rule for a dig that sends no paths; Task 79: the dig plan's paths), so the
  // picks' share is the room read's own for that many paths (`digShareLine(room, paths)`): a change of the count moves it at once,
  // without another read, and its grey change shows for SHARE_DELTA_SHOW_MS (V4ShareChange). A whole path, one open question and a
  // wait for a reset keep their own words; an R22 debate's dig, or a read with no share per path count, keeps today's single share.
  // Independent review (Task 79b): an open question picked stays a place in the dig's question, never a path (spec 2026-11-03 §4.4;
  // the ask sends it in `places`, not in `picks`, so the server makes no path of it), so it is not counted; a dig of open questions
  // alone sends no picks and is today's dig, with today's single share.
  // V4 start step, Task 79 (spec §4.4, dig-f35; answer Q19): the count is the dig plan's paths (components/v4/V4DigPaths.tsx
  // useDigPaths: the picks that are not open questions, as the person combined and split them), which travels with the draft.
  // Coordinator ruling (7 Nov, the wave-16 review of Task 79): where the start step runs, the server argues EVERY dig of picks as paths,
  // an R22 debate's too (apps/api/src/index.ts digRuns), and its room read then names a share per path count; so the page follows it.
  const digPathsParent = served !== null && (isPathsParent(served.answer) || digRoomRead?.dig_share_by_paths !== undefined);
  const digPathPlan = useDigPaths({
    pathsParent: digPathsParent, parentRunId: servedRunId === null || !canDig ? null : servedRunId,
    freePlan: ask.planTier === "free", planTier: ask.planTier, readingLevel, draft, draftRef, commitDraft, holding: picksUndo.offered
  });
  const digPaths = digPathPlan.pathCount;
  const digQuota = useMemo((): Readonly<{ quota: V4DigQuota; room: typeof digRoomRead }> => {
    const line = digPaths === undefined || digRoomRead?.dig_share_by_paths === undefined ? null : digShareLine(digRoomRead, digPaths);
    const percent = typeof line?.values.percent === "number" ? line.values.percent : null;
    if (percent === null) return { quota: readQuota, room: digRoomRead };
    const share = (target: DigTarget): number | null => (target.kind === "picks" && readQuota.share(target) !== null ? percent : readQuota.share(target));
    return {
      room: digRoomRead,
      quota: Object.freeze({
        ...readQuota,
        share,
        label: (target: DigTarget, tray?: boolean) => (target.kind === "picks" && readQuota.share(target) !== null
          ? digButtonLabel({ target, share: percent, wait: null, catalog, locale, tray: tray === true })
          : readQuota.label(target, tray))
      })
    };
  }, [readQuota, digRoomRead, digPaths, catalog, locale]);
  const digQuotaRef = useRef(digQuota);
  useEffect(() => {
    digQuotaRef.current = digQuota;
  });
  // map-f9: "This question: 11% of today", when the run read says it (an optional server field), read again on each moment.
  const questionShare = useQuestionShare(servedRunId);

  // ── The money rule (owner, 31 Oct): what running work borrowed from tomorrow or next week; map-f9: read again ─────
  // after each quota moment and when the person comes back to the tab (lib/v4/useBorrowed.ts).
  const borrowed = useBorrowed(hasLoad);

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

  // ── The digs below this map's own (dig-f2, owner's screen review 3 Nov): while one of them works or its change is
  // still climbing up, this map's answer is read again every 15 s (with the rewrites, below), so a change made two or
  // three levels down shows without a reload; once nothing below moves, those reads stop (lib/v4/useDigsBelow.ts).
  // The digs started in this visit on any V4 page are in module memory; `visitLinks` changes whenever one is added here.
  const visitAll = useMemo(() => [...startedThisVisit.values()].map((entry) => entry.link), [visitLinks]);
  const below = useDigsBelow({
    rootRunId: servedRunId, rootAnswer: served?.answer ?? null, direct: links, index, visit: visitAll, catalog, reads: BELOW_READS
  });

  const [statuses, setStatuses] = useState<ReadonlyMap<string, DigStatus>>(() => new Map());
  /** When the dig loop's reads last answered (the running dig's reduced-motion "Still working · checked 14:09"). */
  const [digsCheckedAt, setDigsCheckedAt] = useState<number | null>(null);
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
    // dig-f2: a dig below this map's own that still works counts too (the question list is then read every 20 s).
    digsLiveRef.current = links.some((link) => !isFinal(statuses.get(link.childRunId))) || below.busy;
  }, [links, statuses, below.busy]);
  // wait-f22 / map-f9: the answer arriving, a dig starting and a dig finishing are quota moments: the figures read again.
  const digsSettled = indexSettled && recordsSettled && links.every((link) => isSettled(statuses.get(link.childRunId)));
  useQuotaMoments({ running: load?.kind === "RUN" && served === null, served: served !== null, digs, settled: digsSettled });

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
      setDigsCheckedAt(Date.now());
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
  // V4 start step, Task 57i (lib/v4/useFailedDigs.ts): a failed dig continued in place shows as running at once (the API re-opened it with
  // its answer) and the dig loop follows it again; one the API would not continue is read once more.
  const rereadDig = useCallback((childRunId: string, running: boolean): void => {
    const link = linksRef.current.find((known) => known.childRunId === childRunId);
    if (link === undefined) return;
    const put = (view: Omit<DigView, "link">): void => {
      const next = new Map(statusesRef.current);
      next.set(childRunId, { view, failures: 0, headlessTries: 0 });
      statusesRef.current = next;
      setStatuses(next);
    };
    if (running) {
      put(STAND_IN);
      digLoop.current?.kick();
      return;
    }
    loadDigView(link).then(({ link: _read, ...view }) => put(view), () => undefined);
  }, []);

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
  // dig-f2: and while a dig further down still works or climbs (its change reaches this map's paths without a reload).
  const rewriteBehind = map !== null && (behind || rewriteWaiting(map) || mainAnswerWriting(served?.answer) || below.busy);
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
  // Where the person types something that may go public (lib/v4/publicNotes.ts): the debate's own state decides, never the
  // person's plan today (the wave-2 review, 4 Nov: a Free person's private debate never says it will be public).
  const publicNotes = typedPublicNotes({
    stage: publicStage,
    ranOnFree: map?.webNote === "FREE",
    ownDebate: served !== null && served.answer.contribution === undefined,
    catalog
  });
  const publicLine = publicNotes.ownView;

  // ── The report's answer (R22 W5-1, owner Q-D11), and its ready moment (journey-f17) ─────────────────────────────
  // V4 screen review (3 Nov 2026), report-d1 / report-d2 / report-f15: the report is asked for and waited for on the map,
  // the first question's report on a dig's map too (components/v4/useMapReport.tsx).
  const isDig = servedDig !== null;
  const reportReady = useRef<() => void>(() => undefined);
  const barJobRef = useRef<HTMLElement | null>(null);
  // Task 76j (the owner's 5 Nov answers; the review session's wiring list, items 6 and 7): question 18 A, the phone's bottom
  // bar says when it shows "Write my report" (V4BottomStack's onReportShown), so the top bar's own steps aside; question 23 A,
  // the wait line names the one dig the report waits for: report-f7's rule over this map's digs as READ (never the stand-in
  // of a dig not read yet), the same digs the report page waits on; never on a dig's own map.
  const [bottomShowsReport, setBottomShowsReport] = useState(false);
  const waitingDigQuestion = isDig ? null
    : waitingDigQuestionOf(links.map((link) => ({ link, view: statuses.get(link.childRunId)?.view })));
  // Task 76l (the review session's wiring list, item 21): a report version this visit saw being written is done, so the answer
  // is read again once and the map's count of changes names that version. A rewrite that finished after the version began but
  // before it was written then brings "Your report is older than the map" back (the owner's fourth round, 6 Nov).
  const readAnswerAfterReport = (): void => {
    if (servedRunId === null) return;
    void loadAnswer(servedRunId).then((next) => {
      if (next !== null) setFreshAnswer(next);
    });
  };
  const report = useMapReport({
    runId, servedRunId, isDig, answer: served?.answer,
    free: map?.webNote === "FREE" || planTier === "free", sharesShown: planTier !== "free",
    // Task 76l (owner, 5 Nov: no level is ever taken from the address on V4 pages): the links into the report carry none; the
    // report page reads the debate's own level from its loader.
    digsKey: linkKey, level: null, barJobRef, catalog, locale,
    onReady: () => {
      reportReady.current();
      readAnswerAfterReport();
    },
    waitingDigQuestion, waitingDigLanguage: served?.language ?? served?.story?.language ?? null, bottomShowsReport,
    // V4 start step, Task 56c (public-f25, owner answer Q20 B): a further report on a public debate waits for the reset, and its
    // buttons say when (the dig buttons' room read, read again after each quota moment).
    room: digQuota.room, isPublic: publicStage?.kind === "PUBLIC"
  });
  const reportAnswer = report.answer;

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
  // Task 62 (map-f4, "Kept where you were"): the selection lives above both maps and survives the switch from the run map to
  // the served one (the same `path:b<n>` ids). A part that left the map opens the part right above it (the path of the last
  // selection that opened, else the question), and one line says so until the next selection. Nothing moves focus or scrolls.
  const lastPathRef = useRef<string | null>(null);
  const lastOpenedRef = useRef<V4Selection | null>(null);
  const near = drawn === null ? null : resolveSelectionNear(drawn, digs, selected, lastPathRef.current);
  const shownSelection: V4Selection = near === null ? "root" : selectionIdOf(near.resolved);
  const movedShown = near !== null && near.moved && lastOpenedRef.current === selected;
  useEffect(() => {
    if (near === null || near.moved) return;
    lastPathRef.current = pathIdOf(near.resolved);
    lastOpenedRef.current = selected;
  });
  // dig-d1 B (owner's screen review, 3 Nov): the open dig's steps and checked findings while it works (lib/v4/useDigProgress.ts).
  const openDig = useMemo(() => {
    if (map === null) return null;
    const resolved = resolveSelection(map, digs, selected);
    return resolved.kind === "dig" ? resolved.dig : null;
  }, [map, digs, selected]);
  const openDigLive = useDigProgress(openDig, loadDigProgress);
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

  // R2TIME-4/R2REG-4, the wave-2 browser check (4 Nov): closing the phone map puts focus back on what opened it (the Map
  // button, "Your picks ▸" or the minimap), unless a row already moved it on to the panel heading (the effect above runs
  // first in the same commit). lib/v4/useSheetFocusReturn.ts.
  const sheetFocus = useSheetFocusReturn(sheetOpen, openSheet);
  const { mapButtonRef } = sheetFocus;

  // UI-5: the side panel scrolls on its own; a new question starts at its top, not where the last one was left.
  useEffect(() => {
    if (panelColRef.current !== null) panelColRef.current.scrollTop = 0;
  }, [shownSelection]);

  // ── Picks (row D decision 1; W3-4: the picks are dug together; dig-f4: the tray shows from the second) ───────────
  // Owner Q-D1: picks stay on one path; a pick box of another path is closed while picks wait (lib/v4/suggestions.ts
  // refuses it too). FIT-1: a point still argued under two paths is one pick, sent once.
  const picked = useMemo<ReadonlySet<string>>(() => pickedOpenIds(draft), [draft]);
  const togglePick = useCallback((openQuestionId: string): void => {
    if (map === null || !canDig) return;
    const question = uniqueOpenQuestions(map).find((candidate) => candidate.id === openQuestionId);
    if (question === undefined) return;
    commitDraft(toggleDraftPick(draftRef.current, openPick(question), planTier).draft);
  }, [map, canDig, planTier, commitDraft]);
  // Task 62 (spec §2.5): what the main question offers first when you dig (on a path debate, the menu paths left out).
  const mainQuestionPicks = useMemo(() => (served === null ? [] : digSuggestionsWithMore(served.answer, [])), [served]);
  const choice = useMemo<V4DigChoice | undefined>(() => {
    if (map === null) return undefined;
    // Task 79 (spec §4.4): on a path debate one more pick that makes a path than the dig may look into is refused (PATHS_FULL).
    const pathPicks = (picks: readonly V4DigPick[]): number => picks.filter((pick) => pick.kind !== "OPEN").length;
    const keep = (change: Readonly<{ draft: V4DigDraft; refused: ReturnType<typeof pickRefusal> }>) => {
      if (change.refused !== null) return change.refused;
      if (digPathPlan.newPickRefusal !== null && pathPicks(change.draft.picks) > pathPicks(draftRef.current.picks)) return digPathPlan.newPickRefusal;
      commitDraft(change.draft);
      return null;
    };
    return {
      draft,
      planTier,
      canDig,
      digHereToo: (pathId: string) => canDig && (isDigMap || digsUnder(map, digs, pathId).length > 0),
      refusalFor: (group: string | null, makesPath?: boolean) =>
        pickRefusal(draft, group, planTier) ?? (makesPath === true ? digPathPlan.newPickRefusal : null),
      onToggleSuggestion: (pathId: string, suggestion: DigSuggestion) => {
        if (canDig) keep(toggleDraftPick(draftRef.current, suggestionPick(pathId, suggestion), planTier, digPathsParent));
      },
      onEditPick: (key: string, text: string) => keep(editPick(draftRef.current, key, text, digPathsParent)),
      onAddOwnView: (pathId: string, text: string) => {
        ownViewSerial.current += 1;
        return keep(addPick(draftRef.current, ownViewPick(pathId, text, ownViewSerial.current), planTier, digPathsParent));
      },
      onRemovePick: (key: string) => commitDraft(removePick(draftRef.current, key)),
      onClear: clearPicks,
      mainQuestionPicks,
      onToggleMainPick: (pick: V4DigPick) => {
        if (canDig) keep(toggleDraftPick(draftRef.current, pick, planTier, digPathsParent));
      },
      typed,
      // dig-f5: where the picks wait, by name, with [Go to them] (the path, or the main question for its own open questions).
      ...(picksPlaceOf(map, draft, catalog, select) ?? {}),
      // journey-f20 / dig-f26 / public-f26: the own-view box's one grey line when what is typed there will be public.
      ...(publicLine === null ? {} : { publicLine }),
      // Task 79 (dig-f35): a path debate's dig, and its path rows under the picks.
      pathsParent: digPathsParent,
      ...(digPathPlan.rows === null ? {} : { digPaths: { ...digPathPlan.rows, locale } })
    };
  }, [map, draft, planTier, canDig, isDigMap, digs, commitDraft, clearPicks, typed, catalog, select, publicLine, mainQuestionPicks, digPathsParent,
    digPathPlan.newPickRefusal, digPathPlan.rows, locale]);
  // ── The dig flow (dig-d3 B, owner pick 3 Nov): lib/v4/useDigQueue.tsx ──────────────────────────────────────────
  // A dig waiting out its 10 seconds belongs to the whole V4 site, not to this page (lib/v4/digUndo.ts, memory only): it
  // keeps its own Undo when the person digs again or opens another page, and the other dig buttons stay active. Its
  // crisis help and the one-time consent run at the press, before its 10 seconds start (dig-f9), while this page can
  // show them.
  // Owner N13: Free has no Quick look / Thorough choice; its digs are quick looks.
  const sentDigMode = effectiveDigMode(digMode, planTier);
  // The debates above this one (top first): their report pages wait for a dig sent from here too (ruling F7).
  const aboveRunIds = useMemo(() => trail?.steps.map((step) => step.runId) ?? [], [trail]);
  const digQueue = useDigQueue({
    map, canDig, servedRunId, servedQuestionLine, aboveRunIds, digQuotaRef, planTier, sentDigMode, draftRef, commitDraft,
    setVisitLinks, ask, onCounting: dismissPicksUndo, aboutOf: (target) => digAboutLine(target, catalog),
    // Task 79 review: a combined question written during the dig's 10 seconds goes with it.
    digsRest: report.digsRest, settlePaths: digPathPlan.settledPaths, catalog, locale
  });
  const { waitingDigs, queueDig, undoDig } = digQueue;
  // V4 start step, Task 79 (dig-f35, r2-22): a dig of the draft's picks on a path debate goes with its path plan (DIG_PICKS) through
  // the shared 10-second Undo, unchanged; the words the person wrote on its rows get the crisis check at the press, as their own
  // views do (V, 2026-09-30). Every other dig is today's.
  const { startPathsFor, ownWords: digRowWords } = digPathPlan;
  const startPicksDig = digQueue.startDig;
  const offerCrisisHelp = ask.offerCrisisHelp;
  const startDig = useCallback((target: DigTarget): void => {
    const paths = startPathsFor(target);
    if (paths === undefined) {
      startPicksDig(target);
      return;
    }
    const written = digRowWords();
    if (written.length > 0 && offerCrisisHelp(written)) return;
    queueDig({ target, mode: sentDigMode, sendsAt: Date.now() + DIG_UNDO_MS, paths });
  }, [startPathsFor, digRowWords, startPicksDig, offerCrisisHelp, queueDig, sentDigMode]);
  // Task 62 (journey-f13, r2-22): a chosen path's one dig button digs deeper into it, and a "+ N more" item is dug as a MORE
  // pick of the main question; both through the shared Undo note (nothing is sent for 10 seconds), once the answer is served.
  const digDeeper = useMemo(() => (map === null || !canDig ? undefined : (pathId: string): void => {
    const path = map.paths.find((candidate) => candidate.id === pathId);
    if (path !== undefined) startDig({ kind: "path", path });
  }), [map, canDig, startDig]);
  const digMore = useMemo(() => (map === null || !canDig ? undefined : (item: V4MoreItem): void => {
    startDig({ kind: "picks", path: null, picks: [morePick(item)] });
  }), [map, canDig, startDig]);
  const trayTarget = map === null || !canDig ? null : draftTarget(draft, map.paths);
  // While the picks' own dig waits, they are on their way: the tray steps back (Undo brings them back). dig-f4 / map-f14:
  // the tray shows on a computer only, from the second pick, or from the first while new digs wait for a reset
  // (public-d4 A: it is then the only way to keep a pick) (lib/v4/digDock.ts).
  const picksOnTheirWay = trayTarget !== null && waitingDigFor(waitingDigs, servedRunId, trayTarget) !== null;
  const hasTray = !picksOnTheirWay && trayShows(trayTarget, layout === "phone", digQuota.quota.waitLine !== null);
  /** The tray's Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  const trayClearRef = useRef<HTMLButtonElement | null>(null);

  // ── A dig that did not finish (owner review 3 Nov, dig-f12/wait-f18): lib/v4/useFailedDigs.ts ───────────────────
  // Task 76j (wiring item 15): its optional homeCatalog is no longer read (question 3 A), so the page hands none.
  const failedDigs = useFailedDigs({
    map, digs, canDig, digMode, planTier, servedQuestionLine, queueDig, catalog, locale,
    // Task 57i: a dig that can continue is continued in place, through the same Undo.
    room: ask.room, aboveRunIds, rereadDig
  });

  // ── What changed since your last visit and while you were here (D4, fix wave 1, N7) ─────────────────────────────
  // The first complete load (map + every dig read once + the question list and dig records read once + the last visit
  // read) is the baseline; when the account kept a last visit, what differs from it is the first news ("since your last
  // visit"). Later live changes are news too ("while you were here"), each with a dot and a tour stop. The map as shown
  // is saved as the new last visit after the first complete load, then at most every 10 s while it changes; nothing is
  // kept in the browser (Decision A). A last visit that could not be read is never overwritten in this visit.
  // V4 screen review (3 Nov 2026), journey-f17: whether a place with news was seen is kept with the account, in that same
  // last visit: an item whose news the person has not opened yet keeps the word the account had, so the next visit (on
  // any device) still tells it and still marks its place, until it is opened (lib/v4/readyMoment.ts visitItemsToKeep).
  const visit = useVisitMemory(servedRunId);
  const { lastVisit, saveVisit, scheduleVisitSave } = visit;
  /** How many of the first news items came from the last visit (the bar says "since your last visit" while one shows). */
  const [visitNewsCount, setVisitNewsCount] = useState(0);
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
  useUnseenSaving({ map, news, opened, servedRunId, baseline, visit });

  // ── The ready moments and the changes tour (V4 screen review, 3 Nov 2026: journey-f17, wait-f4, dig-f3, dig-f18) ──
  // report-f9: every report link leads to the first question's report.
  const reportHref = report.href;
  const ready = useV4Ready({
    map,
    // wait-f5 / journey-f22: a debate paused at the month wall is "Paused", never "Looking into it".
    waiting: map === null && load?.kind === "RUN" && load.run.state !== "FAILED" && pauseOfRun(load.run) === null,
    // Task 76l (the owner's fourth and fifth rounds, 6-7 Nov): the tab says the page's own state word for the unfinished
    // question ("Waiting" for a free spot, a short break, the other question, the month's pause), from its run read.
    waitState: runRead === null ? null : waitStateOfRun(runRead),
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
    // Task 62 (wait-f10): a short answer that came after the page had stopped waiting for it.
    shortAnswerLate,
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
  // Task 76j (wiring item 12; the owner's third round, 5 Nov): a dig's own failed page says what the map it was dug from offers
  // for it (V4FailedScreen's digRetry), read once from that map; unknown or unreadable: nothing, the page as it was.
  const parentRetry = useParentDigRetry({
    runId, failed: load?.kind === "RUN" && load.run.state === "FAILED" && (isDigPage || recordParent !== null),
    parentRunId: parent?.runId ?? null, index, indexSettled, visit: visitAll, catalog, locale, reads: PARENT_RETRY_READS
  });
  // V4 start step, Task 57g (the owner's 7 Nov answers): "Continue where it stopped" on a question that did not finish, when its read says
  // `continuable`: the 10-second Undo, then the same debate continues on this page (components/v4/useStoppedContinue.tsx).
  const stoppedContinue = useStoppedContinue({
    runId, run: load?.kind === "RUN" ? load.run : null, loaded: load !== null, dig: isDigPage || recordParent !== null, room: ask.room,
    reread: () => setLoadAttempt((count) => count + 1), catalog, locale
  });

  // ── The map as shown (V4 screen review, 3 Nov): components/v4/useMapView.ts ─────────────────────────────────────
  // The star moved off what is dug (map-f5), the cards that turn over (dig-d4 B), the answer card's fold (map-d1), the
  // phone's sideways swipe (map-d3 B) and the report moment (dig-f29).
  const { shownMap, reveal, shortWindow, answerUnfolded, setAnswerUnfolded, position, swipe, moment: viewMoment } = useMapView({
    map, digs, changed, shownSelection, select
  });
  // report-d2: while the report waits, is written or stands, no "good time to write your report" moment.
  const moment = report.momentAllowed ? viewMoment : null;

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  // R2REG-5: links carry only a level the person chose (none chosen: /v4 still offers its one-time choice); the report
  // link is made above, with the ready moments. Task 75c: the debate's own level is no choice for the next question, so the ask
  // page's link carries none (step 1 offers the account's level, as before).
  const askHref = levelHref("/v4", null);
  // map-f6: no reading level shows until the saved one is known; the map waits for it behind its outline (not forever).
  // Task 62: the run read's map too.
  const levelSettled = useLevelSettled(levelKnown, drawn !== null);
  // journey-d3 / dig-f16: this page draws the dig notes in its own bottom stack once its map shows (and not while the
  // grey outline waits for the reading level, which draws no notes: the site-wide holder keeps them until then).
  // Task 62: the run read's map draws its own bottom stack too.
  useClaimDigNotes(drawn !== null && levelSettled);
  // wait-f2: a dig paused at the month wall, open in the panel: the phone's pinned bar says "Paused · Continue".
  const pausedBar = usePausedBarJob(map === null ? null : selectedDigOf(digs, shownSelection), catalog, locale);
  const header = (
    <V4Header
      catalog={catalog}
      // wait-f23 / ask-f6 / journey-f19 with the owner's answer 12 B (5 Nov): "Open in the classic view" is in the account
      // menu only, once, on every screen of the map's step (waiting, paused and failed too); no body screen draws one. No
      // level is handed (the 5 Nov ruling: no header shows or carries one).
      classicHref={classicHref}
      after={served !== null ? report.headerStrip : null}
    >
      {/* W3-4: "Write my report" is always there once the answer is served (the owner's money rule keeps it possible).
          map-f15: it is the page's one report button; dig-f29's "Good time" is a small mark on it, with the words.
          report-d1: while a report can be asked for, it opens the short strip, drawn after the account button. */}
      {served !== null ? report.headerItem(moment === "GOOD") : null}
    </V4Header>
  );

  // wait-f4: the tab title's state word ("Looking into it", "Ready", "(1) changed"), read by DocumentTitle.
  const tabPrefix = ready.tabPrefix === "" ? {} : { [TAB_PREFIX_ATTRIBUTE]: ready.tabPrefix };
  if (loadProblem === "SIGNED_OUT" && map === null) {
    // wait-f1: the sign-in ended (on the waiting card, or before the first read): sign in again, and come back here.
    return (
      <div className="v4DebPage">
        <div key={HEADER_FRAME} className="v4DebBehind">{header}</div>
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
  if ((map === null && load === null && loadProblem === null) || (drawn !== null && !levelSettled)) {
    // map-f6: the page's grey outline until there is something to show (and, on the map, until the level is known). Task 76i
    // (wait-f14): after Start, never the outline: the question and its paths, each being looked into, until the first read answers.
    return (
      <div className="v4DebPage">
        <div key={HEADER_FRAME} className="v4DebBehind">{header}</div>
        {handOff !== null && load === null
          ? <HandOffMap handOff={handOff} catalog={catalog} locale={locale} />
          : <div className="v4DebMain"><V4LoadingOutline catalog={catalog} /></div>}
      </div>
    );
  }
  // Task 62 (wait-d1, journey-d2): an R22 run read is the map's first card alone, the question and the waiting card under it,
  // in place of the progress screen; a path debate's run read draws the map below (`drawn`).
  if (map === null && runMap === null) {
    return (
      <div className="v4DebPage" {...tabPrefix}>
        {ready.announcer}
        <div key={HEADER_FRAME} className="v4DebBehind">{header}</div>
        {/* journey-f18 / read-f25: the waiting, paused and failed screens are on the map's step of the four. */}
        {load?.kind === "RUN" ? <div className="v4StepsTop"><V4Steps current="map" shape="line" catalog={catalog} /></div> : null}
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
              // Task 75d: the ask step reads this debate's level back from the server with its words, never from the address.
              askAgainHref={askAgainHref(runId)}
              askHref={askHref}
              dig={isDigPage || recordParent !== null
                ? { backHref: parent === null ? null : levelHref(`/v4/debate/${encodeURIComponent(parent.runId)}`, null) }
                : null}
              {...(parentRetry === undefined ? {} : { digRetry: parentRetry })}
              // Task 57g: "Continue where it stopped" only when the read says `continuable` ("Ask this again" then says "Change the question").
              {...(stoppedContinue.offered ? { onContinue: stoppedContinue.press, continueNote: stoppedContinue.note } : {})}
              catalog={catalog}
              homeCatalog={homeCatalog}
            />
          ) : (
            <section className="v4Card v4DebStatus v4DebProgress v4DebFirstCard">
              <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
              {/* The person's own words (the tab title follows this heading); the added lines are not a title. */}
              <h1 className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{ownWords(load.run.question_line)}</h1>
              {/* Owner review 3 Nov (wait-f5): paused at the month wall, the one pause block stands in the waiting card's place. */}
              <V4RunRoot
                map={null}
                run={load.run}
                startedAt={startedAt}
                reconnecting={loadProblem === "UNREACHABLE"}
                carryOn={null}
                free={planTier === "free"}
                layout={layout === "phone" ? "phone" : layout === "mid" ? "mid" : "desktop"}
                selected="root"
                onSelect={select}
                catalog={catalog}
                locale={locale}
                pauseFocusAfter={firstCardHeading}
              />
            </section>
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
  // The map as shown: its star moved off what is dug (map-f5). Everything else reads the same map. Task 62: while the debate
  // runs, the run read's map (nothing on it digs, picks, tours or keeps news).
  const view: V4Map = map === null ? runMap! : shownMap ?? map;
  /** Task 62: the debate is still running, so the page draws the run read's map. */
  const runPhase = map === null;
  /** The AIs work on it right now (the cards pulse); not while it waits, holds or is paused at the month wall. */
  const running = runPhase && runIsRunning(runRead);
  const openLeft = openCount(view, digs);
  // The room read the dig buttons work from: the page's own, or the newer one read after a quota moment (useDigQuota).
  const room = digQuota.room;
  // The money rule: new starts waiting for the reset get their own line (with the time) in place of today's notice.
  // public-f24: the one V4 line whichever server switch is in force. dig-f5 / public-d3 A: a dig's share is on its own
  // button (digQuota), in no other line.
  const startsWait = limitLine(room, locale);
  // Task 56c: while this debate's report waits for the reset, the month line goes without "You can still write your report.".
  const money: readonly MoneyLine[] = startsWait === null ? [] : [limitLineWhileReportWaits(startsWait, report.waitLine !== null)];
  // Task 56c: beside a dig button the month's wait line is that same line (lib/v4/digQuota.ts digWaitLine), so it goes without it too.
  const startsWaitText = startsWait === null ? null : t(catalog, startsWait.key, startsWait.values);
  const shownQuota: V4DigQuota = money[0] !== undefined && money[0] !== startsWait && digQuota.quota.waitLine === startsWaitText
    ? Object.freeze({ ...digQuota.quota, waitLine: t(catalog, money[0].key, money[0].values) })
    : digQuota.quota;
  const roomNotice = startsWait === null && room !== null
    && (room.room === "CLOSE" || room.room === "FULL" || room.room === "ALREADY_WAITING")
    ? <RoomNotice room={room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
    : null;
  const phoneTarget = layout === "phone" && choice !== undefined ? targetOf(view, digs, shownSelection, choice) : null;
  // dig-f17 / dig-f29 (the map track): the slim report line follows the page's report moment, the corrected rule.
  const goodTime = moment === "GOOD";
  // journey-d3: the pinned bar's one job. A place whose dig waits has its Undo in the note above the bar instead.
  // journey-d3 / dig-f31: the bar's dig job (the record's two states: "Choose what to dig ›" on a whole path, "Dig into
  // your pick · up to 3%" with picks; mapDigHelpers.ts). journey-f14 / dig-f11 / report-d2: while new digs wait for a reset
  // or the report waits or is written, a dig button stays where it is, greyed, with the visible line that says why, and
  // pressing it shows the panel's line. A whole path keeps dig-f31's "Choose what to dig ›" while the report is written too
  // (report-d2 rests the dig buttons; this one only leads to the choices, their greyed buttons and "Add to tray"); the
  // report's state stays on the rail and its waiting card (the wave-2 checks, P3; an owner question). A screen with no dig
  // job says the report's state in the bar. A paused dig open in the panel gives the bar its Continue.
  const digRest = report.digsRest ? report.restReason : null;
  const phoneDig: V4BarJob | null = phoneTarget !== null && waitingDigFor(waitingDigs, servedRunId, phoneTarget.target) === null
    ? phoneBarJob(phoneTarget, shownQuota, catalog, () => startDig(phoneTarget.target), (place) => showChoices(panelColRef.current, place), digRest)
    : null;
  // Task 62 (wait-d1 A, answer Q15): during the wait the bar holds "Map" and one quiet line for the whole question: the waiting
  // card's state word while any path works, then "Writing your answer" once every path is filled and the run still runs. Each
  // path's step stays on its card; no dig button until the answer.
  const allFilled = view.paths.length > 0 && view.paths.every((path) => path.branch?.state === "ARGUED" || path.branch?.state === "FAILED");
  const waitBar: V4BarJob | null = !runPhase || runRead === null ? null : {
    kind: "status",
    text: allFilled && running ? t(catalog, "v4.paths.writingAnswer") : stateWordText(waitStateOfRun(runRead), catalog, locale),
    working: running
  };
  const phoneJob: V4BarJob = waitBar !== null
    ? waitBar
    : digRest !== null && phoneDig !== null
    ? phoneDig
    : report.barStatus !== null
      ? { kind: "status", ...report.barStatus }
      : pausedBar !== null
        ? pausedBar
        : phoneTarget !== null
          ? phoneDig ?? { kind: "none" }
          // Task 56c: a report that waits for the reset keeps its place in the bar, greyed, with the line that says when.
          : goodTime ? { kind: "report", href: reportHref, ...(report.waitLine === null ? {} : { waiting: true, reason: report.waitLine }) }
            : { kind: "none" };

  const rail = (variant: "column" | "strip" | "marks" | "notes" | "steps") => (
    <V4Rail
      runId={runId}
      // Task 76l: no level rides a link into the report (the rail's own link is the page's `reportHref`, which carries none).
      level={null}
      openLeft={openLeft}
      digs={dugCounts}
      variant={variant}
      usageNotes={borrowLines(borrowed)}
      // Review of Task 56c: no "Good time to write your report" while the report waits for the reset (its step says when instead).
      moment={moment === "GOOD" && report.waitLine !== null ? null : moment}
      reportReady={ready.reportDot}
      {...(report.rail === undefined ? {} : { report: report.rail })}
      reportHref={reportHref}
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
    ...(choice === undefined ? {} : { choice }),
    // Task 61 / 62: the paths being looked into pulse only while the AIs work.
    running,
    ...(digDeeper === undefined ? {} : { onDigDeeper: digDeeper }),
    ...(digMore === undefined ? {} : { onDigMore: digMore })
  } as const;
  // Task 62 (journey-d2): under the map's first card, the waiting card and its lines while the debate runs; after the answer,
  // only the carry-on line (V4RunPaths.tsx). A computer and a tablet draw it under the question's card on the map, a phone on
  // the question's own screen.
  const runRoot = runPhase || carryShown ? (
    <V4RunRoot
      map={view}
      run={runPhase ? runRead : null}
      startedAt={startedAt}
      reconnecting={loadProblem === "UNREACHABLE"}
      carryOn={carryPart}
      free={planTier === "free"}
      layout={layout === "phone" ? "phone" : layout === "mid" ? "mid" : "desktop"}
      selected={shownSelection}
      onSelect={select}
      catalog={catalog}
      locale={locale}
      pauseFocusAfter={firstCardHeading}
    />
  ) : null;
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
      // Phase A review F10 / WHOLE-5: "You can dig or write your report now." only where a dig can start now (not while the
      // report waits for digs or is written: digging rests then).
      canDigNow={canDig && startsWait === null && !report.digsRest}
      folded={answerFolded}
      onUnfold={() => (layout === "phone" && !rootShown ? select("root", false) : setAnswerUnfolded(true))}
      {...(answerUnfolded ? { onFold: () => setAnswerUnfolded(false) } : {})}
      catalog={catalog}
      locale={locale}
    >
      {/* Task 61 / 62: on a path debate, how sure the main answer is, worked out from its paths' words. */}
      <V4MainAnswer mainAnswer={null} mainTrust={view.mainTrust ?? null} catalog={catalog} locale={locale} />
    </V4AnswerCard>
  );
  // The tray of picks (components/v4/V4DigTray.tsx). dig-f4 / map-f14 (3 Nov): on a computer the tray shows from the second
  // pick (the first while new digs wait, public-d4 A), docked at the foot of the panel column, with no dig button of its
  // own when the panel's pinned button already digs the picks; a phone has no tray (its pinned bar carries the picks, and
  // the Map sheet lists them with Clear).
  const picksTarget = trayTarget !== null && trayTarget.kind === "picks" && !picksOnTheirWay ? trayTarget : null;
  const tray = hasTray && picksTarget !== null ? (
    <V4DigTray
      target={picksTarget}
      planTier={planTier}
      mode={sentDigMode}
      money={money}
      quota={shownQuota}
      rest={report.digsRest ? report.restReason : null}
      publicNote={publicNotes.tray}
      // Task 62: the main question's own button also digs its "+ N more" picks when it lists every pick.
      withDig={!(panelDigsPicks(shownSelection, draft, rootPanelOpen(view, digs), view.paths)
        || (shownSelection === "root" && mainQuestionTarget(rootPanelOpen(view, digs), mainQuestionPicks, draft, view.paths) !== null))}
      onDig={() => startDig(picksTarget)}
      onClear={clearPicks}
      clearRef={trayClearRef}
      catalog={catalog}
      locale={locale}
    />
  ) : null;
  const picksList = layout === "phone" && picksTarget !== null
    ? (
      <V4PicksList
        target={picksTarget}
        planTier={planTier}
        onClear={clearPicks}
        clearRef={trayClearRef}
        publicNote={publicNotes.tray}
        catalog={catalog}
      />
    )
    : null;
  // dig-f7: where focus goes when a note's button is gone (the pressed button hidden, a note that went): the tray's Clear
  // button, the phone's bar job or Map button, else the panel's heading, the first that is on the page.
  const focusBack = (): HTMLElement | null => [trayClearRef.current, barJobRef.current, mapButtonRef.current, headingRef.current]
    .find((element): element is HTMLElement => element !== null && element.isConnected) ?? null;

  // dig-f23: where the tray was, "Picks cleared [Undo]" for 10 seconds, in the shared Undo note (journey-f21).
  const picksClearedNote = picksUndo.offered
    ? (
      <V4PicksClearedNote
        onUndo={picksUndo.undo}
        endsAt={picksUndo.endsAt ?? undefined}
        takeFocus={!picksUndo.focusTaken}
        onFocusTaken={picksUndo.markFocusTaken}
        returnFocus={focusBack}
        catalog={catalog}
      />
    )
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
      returnFocus={focusBack}
    />
  );

  // Task 62 (wait-f9, coordinator's ruling of 4 Nov night): an R22 answer whose short answer is still being written keeps a wait
  // view with no path column until the story is READY or UNAVAILABLE: the map's first card, then the answer card, which says
  // "Almost ready: the short answer is being written." once and holds the long answer under "Read the full answer". No waiting
  // card: the debate has finished. The answer card keeps its place in the page, so its fold stays as the reader left it.
  const storyWait = !runPhase && served !== null && served.answer.branches === undefined && view.paths.length === 0
    && view.storyState === "WRITING";
  // wait-d1 A: during the wait a computer and a tablet draw the panel column only while something other than the question is
  // open; with the question open the map takes the width. After the answer, today's layout.
  const panelShown = !runPhase || layout === "phone" || shownSelection !== "root";
  const mapPieces = layout !== "phone" && runRoot !== null ? { ...pieces, rootExtra: runRoot } : pieces;
  const pageClass = `v4DebPage v4DebLayout-${layout}${hasTray ? " v4DebHasTray" : ""}${sheetOpen ? " v4DebSheetOpen" : ""}`
    + `${panelShown ? "" : " v4DebNoPanel"}`;
  return (
    <div className={pageClass} {...tabPrefix}>
      {/* The tab title follows this heading (DocumentTitle): the person's own words, not the added lines. R2TIME-9: it
          sits outside the inert wrapper, so the title stays while the phone map is open. wait-f4: the state word above
          (data-tab-prefix) and the one live region sit outside it too. */}
      <h1 className="v4SrOnly" data-ai-generated="true">{ownWords(view.question)}</h1>
      {ready.announcer}
      {/* Task 62 (map-f4): a path that filled in between two reads, said once, politely (the title marked as AI text only when
          an AI wrote it). */}
      <p className="v4SrOnly" role="status" aria-live="polite" data-paths-filled="">
        {filledTitles.map((title, at) => {
          const [before = "", after = ""] = t(catalog, "v4.paths.filled", { title: FILLED_SLOT }).split(FILLED_SLOT);
          return (
            <span key={at}>
              {at > 0 ? " " : null}
              {before}<span data-ai-generated={title.ai ? "true" : undefined}>{title.text}</span>{after}
            </span>
          );
        })}
      </p>
      {/* UI-6: while the phone map is open, everything behind it is inert (the sheet is a real modal). */}
      <div key={HEADER_FRAME} className="v4DebBehind" inert={sheetOpen}>
        {header}
        {/* map-f9: the top bar's question on one line and what this question has used (the phone: below and in its bar). */}
        {layout === "phone" ? null : <V4TopLine question={ownWords(view.question)} share={questionShare} catalog={catalog} />}
        {layout === "mid" ? rail("strip") : null}
        {/* map-f7 / map-d3 B: on the phone, where you are stays pinned under the header, with the live minimap. */}
        {layout === "phone" && !storyWait ? (
          <V4WhereBar
            map={view}
            digs={digs}
            selected={shownSelection}
            onSelect={select}
            onOpenMap={sheetFocus.openFromHere}
            position={position}
            // journey-f18: on a phone the four steps are small dots in the pinned top, beside the breadcrumb.
            steps={<V4Steps current="map" shape="dots" hrefs={{ report: reportHref }} catalog={catalog} />}
            catalog={catalog}
          />
        ) : null}
        <div className="v4DebMain">
          {parent !== null ? (
            <Link className="v4DebBack" href={levelHref(`/v4/debate/${encodeURIComponent(parent.runId)}`, null)}>
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
          {view.dig !== null && view.dig !== undefined ? (
            <V4LevelTrail level={view.dig.level} trail={trail} linkLevel={null} catalog={catalog} />
          ) : null}
          <V4PublicMark stage={publicStage} catalog={catalog} />
          <V4ContributionNote contribution={served?.answer.contribution} catalog={catalog} />
          {/* Task 62 (wait-f9): while an old debate's short answer is written, the map's first card stands above the answer. */}
          {storyWait ? (
            <section className="v4Card v4DebFirstCard" aria-label={t(catalog, "v4.debate.yourQuestion")}>
              <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
              <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{firstCardQuestion(view)}</p>
            </section>
          ) : null}
          {/* Task 62: the answer card waits for the answer (during the run the map's first card is the question). */}
          {runPhase ? null : answerCard}
          {/* report-d2: the report waiting for digs, being written or not written, in the shared waiting card. */}
          {runPhase || storyWait ? null : report.waitCard}
          {/* dig-f19 / map-f17: once a report exists and the map moved on, the paths it does not have yet, named. */}
          {runPhase || storyWait || map === null ? null : (
            <V4ChangedSince
              changedSince={map.changedSince}
              // Item 21 (this side's follow-up, 9 Nov): named from the same read as the server's count, with the counted version's
              // asked-for time as a floor, never cut at a report's written time.
              changedPaths={pathsChangedSinceReport(map, report.versions)}
              digRunning={dugCounts.running > 0}
              // Task 76l (the owner's fourth round, 6 Nov): hidden while a new report version waits or is written.
              reportStage={report.stage}
              // Held, with nothing drawn, until the first report check answers (as the report button's place is).
              reportRead={report.firstCheckAnswered}
              reportHref={reportHref}
              catalog={catalog}
              locale={locale}
            />
          )}
          {/* journey-f10 / dig-f3: "What your digs did", which is also the finished-dig notice. wait-f9 / map-f21: the
              short answer being written is said once, in the answer card, not here as well. */}
          {runPhase || storyWait || map === null ? null : (
            <V4ChangesBar
              headline={ready.notice.headline}
              stops={ready.notice.stops}
              sinceLastVisit={hiddenNews < visitNewsCount}
              onSee={ready.notice.onSee}
              onDismiss={() => setHiddenNews(news.length)}
              results={pathResults(map)}
              catalog={catalog}
            />
          )}
          {/* W3-4: the deepest level offers no dig anywhere on its map; this line says so once, at the top. */}
          {canDig ? null : <p className="v4DebNote v4DebDeepest" role="note">{t(catalog, "v4.nest.deepest")}</p>}
          {/* map-f9: on the phone, "This question: …" on the question's own screen, and the borrow notices on every other
              screen too (the question's screen has them in its notes). */}
          {layout === "phone" && rootShown ? <V4QuestionShareLine share={questionShare} catalog={catalog} /> : null}
          {layout === "phone" && !rootShown && borrowed.length > 0 ? (
            <div className="v4DebRailUsage v4DebPhoneUsage" role="status">
              {borrowLines(borrowed).map((note) => <p key={note.key} className="v4DebRailUsageNote">{t(catalog, note.key, note.values)}</p>)}
            </div>
          ) : null}

          {/* map-f23: on the phone's "Your question", the paths looked into come right under the answer. Task 62: during the
              wait they are the waiting card's "Your paths" (in the question's screen), so not here as well. */}
          {layout === "phone" && rootShown && !runPhase && !storyWait ? (
            <>
              <V4PathList map={view} onSelect={select} catalog={catalog} />
              {rail("notes")}
            </>
          ) : null}

          {storyWait ? null : (
          <div className="v4DebGrid">
            {layout === "desktop" ? <div className="v4DebRailCol">{rail("column")}</div> : null}
            {layout === "laptop" ? <div className="v4DebRailCol v4DebRailMarksCol">{rail("marks")}</div> : null}
            {layout !== "phone" ? (
              <section className="v4DebMapCol" aria-label={t(catalog, "v4.debate.mapRegion")}>
                {layout === "laptop" ? rail("notes") : null}
                {/* map-f10: past the map in one step, to the answer of the question open in the panel. */}
                {/* Task 62: during the wait, with the question open, there is no panel to skip to. */}
                {panelShown ? <V4SkipToAnswer onSkip={() => headingRef.current?.focus()} catalog={catalog} /> : null}
                {layout === "mid" ? <V4Outline {...mapPieces} /> : <V4MapTree {...mapPieces} fold={layout === "laptop"} />}
              </section>
            ) : null}
            {panelShown ? (
            <section
              ref={panelColRef}
              id="v4-deb-panel"
              className="v4DebPanelCol"
              aria-label={t(catalog, "v4.debate.panelRegion")}
              {...(layout === "phone" ? swipe : {})}
            >
              {/* Task 62 (map-f4): what was open left the map, so the part right above it opened; said until the next selection. */}
              {movedShown ? <p className="v4PanelHint v4DebMoved" role="status" data-moved="">{t(catalog, "v4.paths.movedUp")}</p> : null}
              <V4Panel
                map={view}
                digs={digs}
                selected={shownSelection}
                readingLevel={readingLevel}
                linkLevel={null}
                picked={picked}
                onTogglePick={togglePick}
                onSelect={select}
                digMode={digMode}
                onDigMode={setDigMode}
                showDigModes={planTier !== "free"}
                onDig={startDig}
                // dig-d3: other dig buttons stay active while a dig waits; the place being dug says it is starting.
                digBusy={false}
                digRest={report.digsRest ? report.restReason : null}
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
                digQuota={shownQuota}
                digPathLine={trail?.steps.at(-1)?.line ?? null}
                reportAnswer={reportAnswer}
                answerOnTop
                {...(choice === undefined ? {} : { choice })}
                {...(failedDigs === undefined ? {} : { failedDigs })}
                headingRef={headingRef}
                underCrumbs={ready.underCrumbs}
                openDigProgress={openDigLive.progress}
                openDigCheckedAt={openDigLive.progress !== null ? openDigLive.checkedAt : digsCheckedAt}
                // Task 62: a chosen path's one dig button and "Dig into this" on a "+ N more" item, once the answer is served.
                {...(digDeeper === undefined ? {} : { onDigDeeper: digDeeper })}
                {...(digMore === undefined ? {} : { onDigMore: digMore })}
                // Task 62: on a phone the question's own screen is the map's first card, with the waiting card under it.
                {...(layout === "phone" && runRoot !== null ? { rootExtra: runRoot } : {})}
                catalog={catalog}
                locale={locale}
              />
              {/* dig-f4: from the second pick, the tray docked at the foot of the panel column (never on a phone). */}
              {tray}
            </section>
            ) : null}
          </div>
          )}
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
          // dig-f4: the tray is docked in the panel column on a computer; a phone's "Your picks ▸" opens the Map sheet.
          tray={null}
          {...(picksList === null ? {} : { onOpenPicks: sheetFocus.openFromPicks })}
          picksButtonRef={sheetFocus.picksButtonRef}
          trayTitle={picksTarget !== null && picksTarget.path !== null
            ? <TitleText title={pathTitle(picksTarget.path, catalog, 40)} catalog={catalog} />
            : undefined}
          mapButtonRef={mapButtonRef}
          jobRef={barJobRef}
          onMap={sheetFocus.openFromMap}
          job={phoneJob}
          // Task 56c: no slim "Good time to write your report" line while the report waits for the reset (the top bar's button
          // says when, greyed).
          goodTime={goodTime && report.waitLine === null}
          reportHref={reportHref}
          {...(layout === "phone" && !rootShown && questionShare !== null
            ? { status: <V4QuestionShareLine share={questionShare} catalog={catalog} /> } : {})}
          {...(report.writeFromBar === undefined ? {} : { onWriteReport: report.writeFromBar })}
          strip={layout === "phone" ? report.bottomStrip : null}
          // Question 18 A (Task 76j): it says, before the browser paints, whether it shows "Write my report" now.
          onReportShown={setBottomShowsReport}
          catalog={catalog}
        />
      )}

      {sheetOpen ? (
        <OutlineSheet
          onClose={closeSheet}
          footer={<>{ready.note}{digNotes}{picksClearedNote}{picksList}</>}
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

/**
 * V4 start step, Task 76i (wait-f14, wait-f20; choose-f19's "if the map takes long"): after Start, until the debate's first run
 * read answers, the map the ask page showed: the question as it was sent and each path being looked into (b1..bn, so the run
 * map's cards come where these were), with one quiet "Starting…" under the question; nothing pulses, picks or opens a panel.
 */
function HandOffMap({ handOff, catalog, locale }: Readonly<{ handOff: StartHandOff; catalog: MessageCatalog; locale: string }>) {
  const map = useMemo(() => buildV4PendingMap({ questionLine: handOff.questionLine, paths: handOff.paths }), [handOff]);
  return (
    <div className="v4DebMain">
      <V4PendingMap
        map={map}
        rootExtra={<p className="v4DebNote v4Muted" role="status">{t(catalog, "v4.ask.starting")}</p>}
        catalog={catalog}
        locale={locale}
      />
    </div>
  );
}

/**
 * Task 76i: the session check's view after Start (AuthGate's `checkingView`): the outline's held header bar (V4LoadingPage's,
 * the real header's size, so nothing moves when the header comes) over the hand-off's map. The generic check keeps its own look.
 */
function HandOffPage(props: Readonly<{ handOff: StartHandOff; catalog: MessageCatalog; locale: string }>) {
  return (
    <div className="v4DebPage">
      <div className="v4Hdr v4DebOutlineHdr" aria-hidden="true"><span className="v4DebOutlineBrand" /></div>
      <HandOffMap {...props} />
    </div>
  );
}

/**
 * W2L-4 (the wave-2 checks) for Task 62's first card: once a paused run continues, the pause block goes. Where Continue held
 * focus, it goes to the question it was under (the first card's heading, or the map's question card), found on the page.
 */
function firstCardHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>(".v4DebFirstCard .v4DebStatusQuestion, .v4DebMapCol .v4MapRoot, .v4Panel-root .v4PanelH2");
  if (heading !== null && heading.tagName !== "BUTTON" && !heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  return heading;
}

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

// ── Phone pieces (D6, D7) ───────────────────────────────────────────────────────────────────────────────────────

/**
 * D7: the phone map, full screen. UI-6: a real modal — the page behind is inert, Tab stays inside, Escape closes, and
 * the picks with Clear (dig-f4: the outline is also the tray) and the dig note with its Undo live inside it while it is open.
 */
function OutlineSheet({ onClose, footer, catalog, children }: Readonly<{
  onClose: () => void;
  footer: ReactNode;
  catalog: MessageCatalog;
  children: ReactNode;
}>) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Focus goes back to what opened the sheet from the page (R2TIME-4, lib/v4/useSheetFocusReturn.ts): the bottom stack's
  // buttons are re-mounted when the sheet closes.
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
