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
import type { V4DigChoice } from "@/components/v4/V4DigSuggest";
import { V4DigTray, V4PicksList } from "@/components/v4/V4DigTray";
import { V4DigNotes, V4DigStartingLine } from "@/components/v4/V4DigUndo";
import { V4FailedScreen } from "@/components/v4/V4FailedScreen";
import { V4Header } from "@/components/v4/V4Header";
import { V4ContributionNote } from "@/components/v4/V4ContributionNote";
import { V4LevelTrail } from "@/components/v4/V4LevelTrail";
import { V4LeaveQuestion } from "@/components/v4/V4LeaveQuestion";
import { V4LoadingOutline, V4LoadingPage, V4SignInAgain } from "@/components/v4/V4LoadingOutline";
import { V4PicksClearedNote } from "@/components/v4/V4PicksClearedNote";
import {
  digFor, digsUnder, openCount, pathTitle, resolveSelection, rootPanelOpen, selectionIdOf, shortText, TitleText, V4MapTree
} from "@/components/v4/V4MapTree";
import { V4Outline } from "@/components/v4/V4Outline";
import { V4Panel } from "@/components/v4/V4Panel";
import { useQuestionShare, V4QuestionShareLine, V4TopLine } from "@/components/v4/V4QuestionShare";
import type { V4ResearchedPress } from "@/components/v4/V4Sources";
import { V4ChangedSince } from "@/components/v4/V4PathRewrite";
import { V4AnswerCard, type V4ReportAnswer } from "@/components/v4/V4AnswerCard";
import { V4PathList, V4SkipToAnswer, V4WhereBar } from "@/components/v4/V4MapPlace";
import { V4PausedScreen } from "@/components/v4/V4PausedScreen";
import { V4Rail, type V4DigCounts } from "@/components/v4/V4Rail";
import { useMapView } from "@/components/v4/useMapView";
import { V4Steps } from "@/components/v4/V4Steps";
import { useV4Ready } from "@/components/v4/useV4Ready";
import { isNotFound } from "@/lib/api";
import { isSignedOut, signInHrefHere } from "@/lib/signInWayBack";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords, parseDigQuestion } from "@/lib/v4/askText";
import { mergeDigLinks, readDigRecords, storableItems } from "@/lib/v4/accountMemory";
import { diffSnapshots, isRewriteWord, selectionForChange, snapshotItems } from "@/lib/v4/changes";
import {
  firstAnswerArriving, laterNewsOnly, mainAnswerItems, mainAnswerWriting, pathResults, pathsChangedSinceReport, stopsOfChanges, unseenIdsOf
} from "@/lib/v4/readyMoment";
import { useReportVersions } from "@/lib/v4/useReportVersions";
import { effectiveDigMode } from "@/lib/v4/askConfig";
import { panelDigsPicks, trayShows } from "@/lib/v4/digDock";
import { askAgainHref } from "@/lib/v4/failedRun";
import { digLinksFor, digParentOf, mergeIndex, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import { useClaimDigNotes, waitingDigFor } from "@/lib/v4/digUndo";
import { startedThisVisit, useDigQueue } from "@/lib/v4/useDigQueue";
import { useFailedDigs } from "@/lib/v4/useFailedDigs";
import { useUnseenSaving, useVisitMemory } from "@/lib/v4/useVisitMemory";
import { selectedDigOf, usePausedBarJob } from "@/lib/v4/usePausedBarJob";
import {
  addToResearched, loadAnswer, loadDigProgress, loadDigTrail, loadDigView, loadStory, loadV4, storyReadFailed, type DigTrail, type V4Load
} from "@/lib/v4/load";
import { researchedWaiting } from "@/lib/v4/web";
import { buildV4Map, rewriteByDig, rewriteWaiting, uniqueOpenQuestions } from "@/lib/v4/mapModel";
import {
  borrowLines,
  continueRun,
  limitLine,
  monthPauseOf,
  readBorrowed,
  type ContinueOutcome,
  type MoneyLine
} from "@/lib/v4/money";
import { clock24 } from "@/lib/v4/clock";
import type { V4DigQuota } from "@/lib/v4/digQuota";
import { useQuotaRefresh } from "@/lib/v4/quotaPulse";
import { useDigQuota } from "@/lib/v4/useDigQuota";
import { useQuotaMoments } from "@/lib/v4/useQuotaMoments";
import { pausedDigCount, pauseOfDig, pauseOfRun } from "@/lib/v4/monthPause";
import {
  addPick,
  draftTarget,
  editPick,
  EMPTY_DRAFT,
  isEdited,
  openPick,
  ownViewPick,
  pickedOpenIds,
  pickRefusal,
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
  ReadingLevel,
  V4Change,
  V4DigDraft,
  V4Map,
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

/** dig-f2: the reads that follow the digs below this map's own (their records, their state, the answers in between). */
const BELOW_READS: DigsBelowReads = { readDigRecords, loadDigView, loadAnswer };

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

/** "HH:MM" in the page's language on the 24-hour clock (journey-f15, lib/v4/clock.ts), or null when unreadable. */
function clockTime(iso: string | null | undefined, locale: string): string | null {
  return typeof iso === "string" ? clock24(iso, locale) : null;
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
 * journey-d3 / dig-f31 (owner's screen review, 3 Nov): the phone's pinned bar. On a path with nothing picked on it,
 * "Choose what to dig ›" takes the person to the path's choices first, so a whole path is never dug before they have
 * seen them and the share; once shown (`choicesSeen`), the bar digs the whole path ("Dig here · up to 4%"). With picks
 * there, it digs them ("Dig into your pick · up to 3%"); an open question's own screen digs that one question. While new
 * digs wait for a reset the button stays, greyed with the reset time, and pressing it shows the line that says why.
 */
function phoneBarJob(phone: PhoneTarget, quota: V4DigQuota, catalog: MessageCatalog, onDig: () => void,
  show: (place: "choices" | "dig") => void, choicesSeen: boolean): V4BarJob {
  if (phone.target.kind === "path" && !choicesSeen) {
    return { kind: "choose", label: t(catalog, "v4.dig.chooseWhat"), onChoose: () => show("choices") };
  }
  return quota.waitLine === null
    ? { kind: "dig", label: quota.label(phone.target), onDig }
    : { kind: "dig", label: quota.label(phone.target), onDig: () => show("dig"), waiting: true };
}

/** dig-f5: the place the person's picks wait on, named, and the way to it; null while nothing is picked. */
function picksPlaceOf(map: V4Map, draft: V4DigDraft, catalog: MessageCatalog,
  select: (selection: V4Selection, viaKeyboard: boolean) => void): Pick<V4DigChoice, "picksPlace"> | null {
  if (draft.picks.length === 0) return null;
  const path = draft.group === null ? null : map.paths.find((candidate) => candidate.id === draft.group) ?? null;
  if (draft.group !== null && path === null) return null;
  const title = path === null ? { text: t(catalog, "v4.nest.trailRoot"), ai: false } : pathTitle(path, catalog, 40);
  return { picksPlace: { title, onGo: () => select(path === null ? "root" : `path:${path.id}`, false) } };
}

/**
 * dig-f31: brings the place's choices (a path's "Choose what to dig") or its dig block into view at once, moves focus there
 * and gives it the shared 1-second highlight (app/v4/v4-base.css). Nothing is dug.
 */
function showChoices(column: HTMLElement | null, place: "choices" | "dig"): void {
  const choices = place === "choices" ? column?.querySelector<HTMLElement>(".v4Sugs") ?? null : null;
  const target = choices ?? column?.querySelector<HTMLElement>(".v4PanelDig") ?? null;
  if (target === null) return;
  if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.classList.remove("v4Highlight");
  void target.offsetWidth;
  target.classList.add("v4Highlight");
}

/** Stands in for the dug place's words while the sentence around them is read from the catalogue (they are AI text). */
const PLACE_SLOT = "\u0000place\u0000";

/**
 * dig-f9: "About your dig on “Mostly renewables”:", said first on the question check's screen when it answers a sent dig.
 * The place is the dig's path (its label), or its first open question; only those words are marked as AI text.
 */
function digAboutLine(target: DigTarget, catalog: MessageCatalog): ReactNode {
  const path = target.kind === "open" ? null : target.path;
  const place = path !== null
    ? pathTitle(path, catalog, 70)
    : target.kind === "open" && target.questions[0] !== undefined
      ? { text: shortText(target.questions[0].text), ai: true, more: 0 }
      : { text: t(catalog, "v4.panel.crumbRoot"), ai: false, more: 0 };
  const [before = "", after = ""] = t(catalog, "v4.dig.checkAbout", { path: PLACE_SLOT }).split(PLACE_SLOT);
  return <>{before}<span data-ai-generated={place.ai ? "true" : undefined}>{place.text}</span>{after}</>;
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

  // ── The debate: poll the run until it is served or failed ─────────────────────────────────────────────────────────
  // wait-f19 (owner's screen review): rarely while the tab is hidden, at once when it is shown again or the connection
  // returns (useWaitPolling); a retry from the status screen starts afresh. What the hook returns (when a check last
  // answered, lost touch, Try now) is what the waiting card (V4WaitCard) shows once the start-step session places it in
  // the wait view; until then nothing on the page reads it.
  const [load, setLoad] = useState<V4Load | null>(null);
  const [loadProblem, setLoadProblem] = useState<LoadProblem | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  // Owner's screen review (3 Nov): every dig button's quota words, from its own check with the server (dig-f5), read
  // again after each quota moment (dig-f11); lib/v4/useDigQuota.ts.
  const digQuota = useDigQuota({
    room: ask.room, parentRunId: servedRunId === null || !canDig ? null : servedRunId, picks: draft.picks.length,
    mode: digMode, readingLevel, catalog, locale
  });
  const digQuotaRef = useRef(digQuota);
  useEffect(() => {
    digQuotaRef.current = digQuota;
  });
  // map-f9: "This question: 11% of today", when the run read says it (an optional server field), read again on each moment.
  const questionShare = useQuestionShare(servedRunId);
  // dig-f31: the phone place whose choices "Choose what to dig ›" has shown (its bar then digs the whole path).
  const [choicesShownFor, setChoicesShownFor] = useState<V4Selection | null>(null);

  // ── The money rule (owner, 31 Oct): what running work borrowed from tomorrow or next week; map-f9: read again ─────
  // after each quota moment and when the person comes back to the tab.
  const [borrowed, setBorrowed] = useState<readonly UsageBorrow[]>([]);
  const borrowReads = useRef(0);
  const readBorrowedNow = useCallback(() => {
    borrowReads.current += 1;
    const mine = borrowReads.current;
    void readBorrowed().then((next) => {
      if (mine === borrowReads.current) setBorrowed(next);
    });
  }, []);
  useEffect(() => {
    if (!hasLoad) return undefined;
    readBorrowedNow();
    return () => {
      borrowReads.current += 1;
    };
  }, [hasLoad, readBorrowedNow]);
  useQuotaRefresh(readBorrowedNow, hasLoad);

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
  useQuotaMoments({ running: load?.kind === "RUN" && served === null, served: served !== null, digs });

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
      // dig-f5: where the picks wait, by name, with [Go to them] (the path, or the main question for its own open questions).
      ...(picksPlaceOf(map, draft, catalog, select) ?? {}),
      // dig-f26: on a Free debate the server named as public, the own-view box says the view may be shown there.
      publicDebate: ask.freePublicNotice
    };
  }, [map, draft, planTier, canDig, isDigMap, digs, commitDraft, clearPicks, typed, catalog, select, ask.freePublicNotice]);
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
    setVisitLinks, ask, onCounting: dismissPicksUndo, aboutOf: (target) => digAboutLine(target, catalog), catalog, locale
  });
  const { waitingDigs, queueDig, startDig, undoDig } = digQueue;
  const trayTarget = map === null || !canDig ? null : draftTarget(draft, map.paths);
  // While the picks' own dig waits, they are on their way: the tray steps back (Undo brings them back). dig-f4 / map-f14:
  // the tray shows on a computer only, from the second pick, or from the first while new digs wait for a reset
  // (public-d4 A: it is then the only way to keep a pick) (lib/v4/digDock.ts).
  const picksOnTheirWay = trayTarget !== null && waitingDigFor(waitingDigs, servedRunId, trayTarget) !== null;
  const hasTray = !picksOnTheirWay && trayShows(trayTarget, layout === "phone", digQuota.quota.waitLine !== null);
  const barJobRef = useRef<HTMLElement | null>(null);
  /** The tray's Clear button (dig-f23: focus comes back to it after "Picks cleared" is undone). */
  const trayClearRef = useRef<HTMLButtonElement | null>(null);

  // ── A dig that did not finish (owner review 3 Nov, dig-f12/wait-f18): lib/v4/useFailedDigs.ts ───────────────────
  const failedDigs = useFailedDigs({
    map, digs, canDig, digMode, planTier, servedQuestionLine, queueDig, catalog, homeCatalog, locale
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
  useUnseenSaving({ map, news, opened, servedRunId, baseline, visit });

  // ── The ready moments and the changes tour (V4 screen review, 3 Nov 2026: journey-f17, wait-f4, dig-f3, dig-f18) ──
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, chosenLevel);
  const ready = useV4Ready({
    map,
    // wait-f5 / journey-f22: a debate paused at the month wall is "Paused", never "Looking into it".
    waiting: map === null && load?.kind === "RUN" && load.run.state !== "FAILED" && pauseOfRun(load.run) === null,
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

  // ── The map as shown (V4 screen review, 3 Nov): components/v4/useMapView.ts ─────────────────────────────────────
  // The star moved off what is dug (map-f5), the cards that turn over (dig-d4 B), the answer card's fold (map-d1), the
  // phone's sideways swipe (map-d3 B) and the report moment (dig-f29).
  const { shownMap, reveal, shortWindow, answerUnfolded, setAnswerUnfolded, position, swipe, moment } = useMapView({
    map, digs, changed, shownSelection, select
  });

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const classicHref = `/debate/${encodeURIComponent(runId)}`;
  // R2REG-5: links carry only a level the person chose (none chosen: /v4 still offers its one-time choice); the report
  // link is made above, with the ready moments.
  const askHref = levelHref("/v4", chosenLevel);
  // wait-f23 / ask-f6 / journey-f19 (owner's screen review): "Open in the classic view" shows once. While the question
  // waits, is paused or did not finish, it is at the bottom of that screen; otherwise in the header's account menu.
  const classicInBody = map === null && load?.kind === "RUN";
  // map-f6: no reading level shows until the saved one is known; the map waits for it behind its outline (not forever).
  const levelSettled = useLevelSettled(levelKnown, map !== null);
  // journey-d3 / dig-f16: this page draws the dig notes in its own bottom stack once its map shows (and not while the
  // grey outline waits for the reading level, which draws no notes: the site-wide holder keeps them until then).
  useClaimDigNotes(map !== null && levelSettled);
  // wait-f2: a dig paused at the month wall, open in the panel: the phone's pinned bar says "Paused · Continue".
  const pausedBar = usePausedBarJob(map === null ? null : selectedDigOf(digs, shownSelection), catalog, locale);
  const header = (
    <V4Header
      catalog={catalog}
      readingLevel={levelSettled ? readingLevel : null}
      linkLevel={chosenLevel}
      onReadingLevel={chooseLevel}
      classicHref={classicInBody ? null : classicHref}
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
  // The room read the dig buttons work from: the page's own, or the newer one read after a quota moment (useDigQuota).
  const room = digQuota.room;
  // The money rule: new starts waiting for the reset get their own line (with the time) in place of today's notice.
  // public-f24: the one V4 line whichever server switch is in force. dig-f5 / public-d3 A: a dig's share is on its own
  // button (digQuota), in no other line.
  const startsWait = limitLine(room, locale);
  const money: readonly MoneyLine[] = startsWait === null ? [] : [startsWait];
  const roomNotice = startsWait === null && room !== null
    && (room.room === "CLOSE" || room.room === "FULL" || room.room === "ALREADY_WAITING")
    ? <RoomNotice room={room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
    : null;
  const phoneTarget = layout === "phone" && choice !== undefined ? targetOf(view, digs, shownSelection, choice) : null;
  // dig-f17 / dig-f29 (the map track): the slim report line follows the page's report moment, the corrected rule.
  const goodTime = moment === "GOOD";
  // journey-d3: the pinned bar's one job. A place whose dig waits has its Undo in the note above the bar instead.
  // journey-d3 / dig-f31: the bar's dig job ("Choose what to dig ›" first on a whole path, then "Dig here · up to 4%"; with
  // picks "Dig into your pick · up to 3%"), greyed with the reset time while new digs wait (dig-f11). A paused dig open in
  // the panel gives the bar its Continue instead.
  const phoneJob: V4BarJob = pausedBar !== null
    ? pausedBar
    : phoneTarget !== null
      ? waitingDigFor(waitingDigs, servedRunId, phoneTarget.target) === null
        ? phoneBarJob(phoneTarget, digQuota.quota, catalog, () => startDig(phoneTarget.target), (place) => {
          showChoices(panelColRef.current, place);
          if (place === "choices") setChoicesShownFor(shownSelection);
        }, choicesShownFor === shownSelection)
        : { kind: "none" }
      : goodTime ? { kind: "report", href: reportHref } : { kind: "none" };

  const rail = (variant: "column" | "strip" | "marks" | "notes" | "steps") => (
    <V4Rail
      runId={runId}
      level={chosenLevel}
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
      canDigNow={canDig && startsWait === null}
      folded={answerFolded}
      onUnfold={() => (layout === "phone" && !rootShown ? select("root", false) : setAnswerUnfolded(true))}
      {...(answerUnfolded ? { onFold: () => setAnswerUnfolded(false) } : {})}
      catalog={catalog}
      locale={locale}
    />
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
      quota={digQuota.quota}
      withDig={!panelDigsPicks(shownSelection, draft, rootPanelOpen(view, digs), view.paths)}
      onDig={() => startDig(picksTarget)}
      onClear={clearPicks}
      clearRef={trayClearRef}
      catalog={catalog}
      locale={locale}
    />
  ) : null;
  const picksList = layout === "phone" && picksTarget !== null
    ? <V4PicksList target={picksTarget} planTier={planTier} onClear={clearPicks} clearRef={trayClearRef} catalog={catalog} />
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
        {/* map-f9: the top bar's question on one line and what this question has used (the phone: below and in its bar). */}
        {layout === "phone" ? null : <V4TopLine question={ownWords(map.question)} share={questionShare} catalog={catalog} />}
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
            // journey-f18: on a phone the four steps are small dots in the pinned top, beside the breadcrumb.
            steps={<V4Steps current="map" shape="dots" hrefs={{ report: reportHref }} catalog={catalog} />}
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
          {/* map-f9: on the phone, "This question: …" on the question's own screen, and the borrow notices on every other
              screen too (the question's screen has them in its notes). */}
          {layout === "phone" && rootShown ? <V4QuestionShareLine share={questionShare} catalog={catalog} /> : null}
          {layout === "phone" && !rootShown && borrowed.length > 0 ? (
            <div className="v4DebRailUsage v4DebPhoneUsage" role="status">
              {borrowLines(borrowed).map((note) => <p key={note.key} className="v4DebRailUsageNote">{t(catalog, note.key, note.values)}</p>)}
            </div>
          ) : null}

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
                {/* map-f10: past the map in one step, to the answer of the question open in the panel. */}
                <V4SkipToAnswer onSkip={() => headingRef.current?.focus()} catalog={catalog} />
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
                digQuota={digQuota.quota}
                digPathLine={trail?.steps.at(-1)?.line ?? null}
                reportAnswer={reportAnswer}
                answerOnTop
                {...(choice === undefined ? {} : { choice })}
                {...(failedDigs === undefined ? {} : { failedDigs })}
                headingRef={headingRef}
                underCrumbs={ready.underCrumbs}
                openDigProgress={openDigLive.progress}
                openDigCheckedAt={openDigLive.progress !== null ? openDigLive.checkedAt : digsCheckedAt}
                catalog={catalog}
                locale={locale}
              />
              {/* dig-f4: from the second pick, the tray docked at the foot of the panel column (never on a phone). */}
              {tray}
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
          // dig-f4: the tray is docked in the panel column on a computer; a phone's "Your picks ▸" opens the Map sheet.
          tray={null}
          {...(picksList === null ? {} : { onOpenPicks: openSheet })}
          trayTitle={picksTarget !== null && picksTarget.path !== null
            ? <TitleText title={pathTitle(picksTarget.path, catalog, 40)} catalog={catalog} />
            : undefined}
          mapButtonRef={mapButtonRef}
          jobRef={barJobRef}
          onMap={openSheet}
          job={phoneJob}
          goodTime={goodTime}
          reportHref={reportHref}
          {...(layout === "phone" && !rootShown && questionShare !== null
            ? { status: <V4QuestionShareLine share={questionShare} catalog={catalog} /> } : {})}
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
