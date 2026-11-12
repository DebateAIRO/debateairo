"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  askQuestionMaxBytes, ContractHttpError, detectCrisis, purposeAnswerSentence, SavedQuestionDocSchema, savedQuestionOwnWords, WEB_CONTRACT_LIMITS, type AskClarifyEarlier, type AskClarifyResponse, type ClarifyQuestion, type PurposeLines,
  type QuestionLanguageOffer, type SavedQuestionDoc, type SavedQuestionRead, type SavedQuestionSummary
} from "@debateai/contract";
import { alreadyWaitingShown, RoomNotice } from "@/components/billing/RoomNotice";
import { useQuestionLanguageChoice } from "@/components/QuestionLanguageChoice";
import { useQuestionRefusal } from "@/components/QuestionRefusal";
import { V4AskGate, type V4Session } from "@/components/v4/V4AskGate";
import { V4MoneyLines } from "@/components/v4/V4DigSuggest";
import { V4Header } from "@/components/v4/V4Header";
import { V4LeaveQuestion } from "@/components/v4/V4LeaveQuestion";
import { V4PendingMap } from "@/components/v4/V4PendingMap";
import { V4StartBar, type StartBarState } from "@/components/v4/V4StartBar";
import { V4AskQuestions, type SetAsideAnswer } from "@/components/v4/V4AskQuestions";
import { startWiderWidth, V4StartCard } from "@/components/v4/V4StartCard";
import { V4StartCombineBar } from "@/components/v4/V4StartCombineBar";
import { V4Steps } from "@/components/v4/V4Steps";
import { V4UndoNote } from "@/components/v4/V4UndoNote";
import { V4MapSeed } from "@/components/v4/V4MapSeed";
import { SHELF_MAX, useMapShelf, V4MapShelf } from "@/components/v4/V4MapShelf";
import { V4NotStarted } from "@/components/v4/V4NotStarted";
import { contractClient } from "@/lib/api";
import type { AskRoom } from "@/lib/billing/room";
import { catalogLocale, isLocale, type LocaleCode } from "@/lib/i18n/locales";
import { focusIsLost } from "@/lib/focusGuard";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { currentReturnPath, signInHrefFor } from "@/lib/signInWayBack";
import { askHistoryOf, loadPage, stepOneAddress, stepTwoAddress, withAskHistory } from "@/lib/v4/askHistory";
import {
  answerCounts, answerSentenceOf, answersAcrossReadings, clarifyingQuestions, composeQuestion, FREE_GOAL_CHOICES_MAX, GOAL_ANSWERS_MAX,
  goalChoiceCount, goalWithinPlan, ownWords, purposeLinesOfGoal, sameAnswerWords
} from "@/lib/v4/askText";
import { CARRY_ON_BUILT } from "@/lib/v4/carryOn";
import { siteCountryOf, withSiteCountryFirst } from "@/lib/v4/clarifyPlace";
import { DIG_CANCELLED_SHOWN_MS, DIG_UNDO_MS } from "@/lib/v4/digUndo";
import { foldTransform, type FoldRect } from "@/lib/v4/foldMove";
import { buildV4PendingMap } from "@/lib/v4/mapModel";
import {
  limitLine, startPathsShare, startPathsShareLine, startShareChange, startShareLine, startsWaitLine, usedUpLine, type MoneyLine
} from "@/lib/v4/money";
import { PATH_PLAN_LIMITS, pathPlanFromMenu, pathPlanFromPicks, pathPlanOwnWords, type PathPlan } from "@/lib/v4/pathPlan";
import {
  boxChanged, boxDropped, boxLine, boxOf, boxOwnWords, boxPlace, boxRekey, boxRemove, boxTyped, type QuestionBox
} from "@/lib/v4/questionBox";
import { keptOfSaved, savedDocOf } from "@/lib/v4/savedQuestion";
import { reloadPage, useSiteVersion } from "@/lib/v4/siteVersion";
import { handOffStart } from "@/lib/v4/startHandOff";
import { keptLineOf, startKeptOf, type V4StartKept, type V4StartReading } from "@/lib/v4/startKept";
import { pendingPathsOf, START_UNDO_MS, type PendingStart } from "@/lib/v4/startUndo";
import {
  EMPTY_GOAL,
  READING_LEVELS,
  type DigMode,
  type ReadingLevel,
  type V4Goal,
  type V4GoalAnswer,
  type V4StartHandOver
} from "@/lib/v4/types";
import { useAskAgain } from "@/lib/v4/useAskAgain";
import { handOffContinue, sameStoppedWords } from "@/lib/v4/failedRun";
import { useAskClarify } from "@/lib/v4/useAskClarify";
import { useLeaveSiteGuard } from "@/lib/v4/useLeaveGuard";
import { useSavedQuestion } from "@/lib/v4/useSavedQuestion";
import { useStartPaths } from "@/lib/v4/useStartPaths";
import { useV4Ask } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (spec "/v4 — D1 Ask + D2 How we read your question", row D decisions 5 and 10). D1: the question and,
 * once, the reading level. D2 (decision 29, dynamic): a small AI's clarifying questions, all optional, then EXACTLY the
 * text the AIs will get (composeQuestion), so nothing is hidden. The ask itself is V3's, through useV4Ask (consent, crisis help, room, question language).
 * Fix wave 1, Decision A: nothing is kept in this browser; the recent questions come from the account only. V4 start step, Task
 * 75d (owner, 5 Nov, second round): the level belongs to each question. Its choice always starts on Plain words; the account
 * remembers no level and the address names none ("Ask this again" starts on the failed debate's own level, read from the server).
 * V4 start step, Task 76 (spec 2026-11-03 §2 items 2-6; read-d3, chat-one-place-for-answers, chat-start-waits-for-paths,
 * owner answers Q4, Q8, Q9, Q10; 4 Nov night ask-f3, ask-f13, read-f3, read-f5, read-f8, read-f17): step 2's answers live in
 * the question box (a tap places its sentence, typing over it unticks it), so there is no "We'll ask the AIs:" box and no
 * "what matters most" box; the card "What we'll look into" sits under the questions; Start waits for the paths and sends
 * what the box says with the check of Next; the refusal and language screens of Next lead back with "Edit my question".
 * Start and both "Just answer it" wait out the Undo window in the site's one Undo note before anything is sent. The map
 * shows at once (the question and the paths being sent, the note under the question) while step 2 (or step 1) stays in
 * memory as it was; the card folds into the map's first card, and back on Undo. A declined consent or a plan still unknown
 * at the press leaves nothing waiting.
 * V4 start step, Task 76c (read-f2, choose-f2, choose-f21, ask-f12; owner answers Q2 A, Q3 A): step 2 has its own entry in
 * this tab's history (lib/v4/askHistory.ts: the words, never in the address). Back goes to step 1 with the words and keeps
 * the paths (a menu or sheet open closes first); during Start's Undo window Back is an Undo, and from the send it is held; a
 * reload brings the words back and calls no AI; the page asks before leaving only when something would be lost; after the
 * send the entry is the started question's, which says so when it is opened again.
 * V4 start step, Task 76h (ask-d3, read-f5, read-f8, read-f15, read-f23): step 2's clarifying questions are V4AskQuestions'
 * (one status line whose words change, held rows while they are read, their arrival, the slow-wait lines, Free's cap line).
 * V4 start step, Task 76d (owner answers Q4, Q5; read-d3, read-f22, r2-5): with version 2 of the clarifying call (sealed only
 * through Task 92), an offered answer's sentence in the box is the small AI's own, "What do you care about most?" comes last and
 * is answered like any other (one of Free's 3), and the site's country comes first among the place question's answers, never
 * ticked. A version 1 reply reads as before: no care question, today's pairs.
 * V4 start step, Task 76g (read-f1, owner "All in this build", 4 Nov night; read-d3): a new reading keeps the person's answers
 * where it can. At Next with new words the box shows their sentences at once and the clarifying call is told the earlier
 * questions and answers. When it lands, an answer it offers again sits under its new question with its sentence untouched, a
 * typed answer keeps its own question's words, and one it no longer offers is set aside where its question was, until "Put it
 * back"; a reading that brings nothing back keeps the earlier questions and answers exactly as they were.
 * V4 start step, Task 76e (owner answer Q8; amended 4 Nov night by owner answer S1 A, read-f3, read-f23): when the site is
 * updated while the page is open, one banner says so at the top, on step 1 and step 2, with Reload, and the card's quiet reload
 * line goes meanwhile; step 1 sends nothing until Next. Step 2 is never written into the tab's history: the account keeps it
 * (Task 76f), and the page's restore (restoreStepTwo) opens it exactly as kept, with no clarifying call, no lists and no merge,
 * its questions drawn at once, and the room read fresh (fewer paths allowed now: combine or remove first).
 * V4 start step, Task 76f (owner cards "When saved", "How long", "Where shown"; answers Q1, Q2, Q3, Q8, S1 A, S2 A, S3 A; saved-
 * questions spec 2026-11-04): once the check passes after Next, the account keeps step 2 by itself (useSavedQuestion; its id in
 * step 2's history entry, never in the address); Start names it and removes it; "Not started yet" on step 1 lists the newest 5
 * with Pick up and Delete (the shared Undo window); Pick up and a reload on step 2 reopen it through the restore with no AI
 * call; the page asks before leaving only while the latest change is not saved, and the card's reload line goes meanwhile.
 */

/** The API's own floor for a question is a few words; Start waits for it (spec: "under 7 characters"). */
const QUESTION_MIN = 7;

/** Owner N6b (2026-10-29): what each level shows, in plain words (the earlier example sentences are gone). */
const SHOWS_KEYS: Readonly<Record<ReadingLevel, string>> = Object.freeze({
  plain: "v4.ask.levelShows.plain",
  background: "v4.ask.levelShows.background",
  expert: "v4.ask.levelShows.expert"
});

type Step = "ask" | "read";
/**
 * V4 start step, Task 70b (read-f13, ask-f9): Next's own press. CONSENT while the one-time consent window is open (Next
 * busy, still reading "Next"), READING for the moment after its yes ("Reading…"), then step 2; a press meanwhile does nothing.
 */
type NextPress = "IDLE" | "CONSENT" | "READING";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** useLayoutEffect in the browser (no frame at the old height), useEffect on the server (which has no layout). */
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** V4 start step, Task 75b (ask-d2 A): a phone's width, where step 1's Next sits in the bottom bar (the card's 600 px rule). */
const NARROW_QUERY = "(max-width: 600px)";

/** True on a phone's width (read once mounted, and again when it changes; the server render and jsdom assume a computer). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(NARROW_QUERY);
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return narrow;
}

/**
 * ask-f19: the question box grows with the words, from 3 lines to about 8 (the CSS bounds), then scrolls inside; no
 * drag handle. The height follows the words' own height, borders included.
 */
function growToWords(field: HTMLTextAreaElement | null): void {
  if (field === null) return;
  field.style.height = "auto";
  const borders = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + Math.max(0, borders)}px`;
}

/** Task 76 (spec §2 item 6, chat-start-waits-for-paths): the card's waiting phases, while Start reads "Paths coming…". */
const PATHS_COMING_PHASES: ReadonlySet<string> = new Set(["CHECKING", "LANGUAGE_CHOICE", "READING", "MERGING"]);
/** Task 76 (read-d3 B): the fly-in falls back to the 1-second highlight of the box with less motion or no animation API. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const BOX_HIGHLIGHT_MS = 1_000;
/** The fly-in's own token (v4-base.css `--v4-move-fly`), read from the page; this when the page names none. */
const FLY_IN_FALLBACK_MS = 250;

/**
 * Task 76 (read-d3): one answer as the sentence the box holds and the AIs read (today's pair, "Which region? The north."); null for
 * an "Other…" left blank. Task 76d (owner answer Q5): an offered answer of a question on the page reads as the small AI's own
 * sentence when it wrote one (answerSentenceOf); a typed answer keeps the pair.
 */
function answerSentence(given: V4GoalAnswer, questions: readonly ClarifyQuestion[]): string | null {
  const sent = purposeLinesOfGoal({ answers: [given], matters: "" })?.answers?.[0];
  if (sent === undefined) return null;
  const question = questions.find((shown) => shown.text === given.question);
  return question === undefined ? purposeAnswerSentence(sent) : answerSentenceOf(question, given);
}

/**
 * Task 76g (read-f1, read-d3): a kept answer's sentence as it stood in the box, by the question the answer now sits under. It
 * holds while that answer stays the same, so a new reading's question (or its own sentence for the answer) never rewrites it.
 */
type HeldSentence = Readonly<{ answer: string; other: boolean; text: string }>;
const NO_HELD: ReadonlyMap<string, HeldSentence> = new Map();

/** Task 76g: the held sentences without these questions' (an answer the person changed, or whose sentence they typed over). */
function withoutHeld(held: ReadonlyMap<string, HeldSentence>, keys: readonly string[]): ReadonlyMap<string, HeldSentence> {
  const next = new Map(held);
  for (const key of keys) next.delete(key);
  return next;
}

/** Task 76g: an answer's sentence in the box: the one held for it while it is the same answer, else answerSentence. */
function sentenceIn(given: V4GoalAnswer, questions: readonly ClarifyQuestion[], held: ReadonlyMap<string, HeldSentence>): string | null {
  const kept = held.get(given.question);
  if (kept !== undefined && kept.answer === given.answer && kept.other === given.other) return kept.text;
  return answerSentence(given, questions);
}

/**
 * Task 76e: a kept step 2's sentences as its box holds them, held for their answers, so the box comes back exactly as kept
 * (never rewritten from the questions it is shown with).
 */
function heldOfKept(box: QuestionBox, goal: V4Goal): ReadonlyMap<string, HeldSentence> {
  const held = new Map<string, HeldSentence>();
  for (const given of goal.answers) {
    const placed = box.placed.find((sentence) => sentence.key === given.question);
    if (placed !== undefined) held.set(given.question, { answer: given.answer, other: given.other, text: placed.text });
  }
  return held;
}

/** Task 76e: a kept step 2 whose questions had not come yet opens with none, and asks for none. */
const NO_CLARIFY: AskClarifyResponse = Object.freeze({ source: "NONE" });

/** Task 76f (saved-questions spec §3.3): a reading that was never checked (not offered, switched off, quota used up) is never saved. */
const UNCHECKED_REASONS: ReadonlySet<string> = new Set(["NOT_ASKED", "OFF", "POOL_EMPTY"]);

/** Task 76f: a saved question the account no longer holds (deleted, started, or its key gone) answers 404. */
function savedQuestionGone(error: unknown): boolean {
  return error instanceof ContractHttpError && error.status === 404;
}

/** A delete waiting out its Undo window in the shared Undo note, then (`sent`) its answer. */
type WaitingDelete = Readonly<{ item: SavedQuestionSummary; sendsAt: number; sent: boolean }>;

/**
 * Task 76g (read-f1): step 2's questions as shown, kept apart from the clarifying hook's reply so a new reading can keep them.
 * `line`: the line whose reading they are (null: none yet); `earlier`: that reply's own questions (the AI's, the purpose and the
 * care question), as the next new line's call is told them; `questions`: the same with the site's country added; `kept`: blocks kept
 * under their own question's words after them (a typed answer, an answer put back); `setAside`: the answers set aside; `quiet`: the
 * last reading brought nothing back and these are the earlier questions, as they were; `seen`: the reply last taken in.
 */
type ShownQuestions = Readonly<{
  line: string | null;
  earlier: readonly ClarifyQuestion[];
  questions: readonly ClarifyQuestion[];
  kept: readonly ClarifyQuestion[];
  setAside: readonly SetAsideAnswer[];
  quiet: boolean;
  seen: Readonly<{ reply: AskClarifyResponse; line: string }> | null;
}>;
const NOTHING_SHOWN: ShownQuestions = Object.freeze({ line: null, earlier: [], questions: [], kept: [], setAside: [], quiet: false, seen: null });

/**
 * Task 76g: several keys moved at once (a new reading's kept answers). Each goes through a key of its own first, so a key that
 * another answer is leaving is never placed twice on the way.
 */
function boxRekeyAll(box: QuestionBox, moves: readonly Readonly<{ from: string; to: string }>[]): QuestionBox {
  const passing = (at: number): string => `\u0000read-f1:${at}`;
  const halfway = moves.reduce((held, move, at) => boxRekey(held, move.from, passing(at)), box);
  return moves.reduce((held, move, at) => boxRekey(held, passing(at), move.to), halfway);
}

/**
 * Task 76 (read-d3): the box holds one sentence for each answer sent (`goal`, Free's cap applied), in the order the questions
 * show, and no other placed sentence; what the person typed is never touched. An answer whose sentence was typed over is
 * unticked where the typing happens, so it is not placed again here. Task 76g: a kept answer's held sentence stays as it was.
 */
function boxWithAnswers(box: QuestionBox, goal: V4Goal, questions: readonly ClarifyQuestion[], held: ReadonlyMap<string, HeldSentence>): QuestionBox {
  const order = questions.map((shown) => shown.text);
  const wanted = new Map<string, string>();
  for (const given of goal.answers) {
    const sentence = sentenceIn(given, questions, held);
    if (sentence !== null) wanted.set(given.question, sentence);
  }
  let next = box;
  for (const placed of box.placed) if (!wanted.has(placed.key)) next = boxRemove(next, placed.key);
  for (const [key, text] of wanted) {
    if (next.placed.find((placed) => placed.key === key)?.text !== text) next = boxPlace(next, { key, text }, order);
  }
  return next;
}

function lessMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The fly-in's length in milliseconds, from the page's own move token (0.01ms under reduced motion). */
function flyInMs(from: Element): number {
  const token = getComputedStyle(from).getPropertyValue("--v4-move-fly").trim();
  const parsed = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(token);
  if (parsed === null) return FLY_IN_FALLBACK_MS;
  return Number(parsed[1]) * (parsed[2] === "s" ? 1_000 : 1);
}

/**
 * Task 76 (read-d3 B, the "fly-in" move): a copy of the tapped answer travels from its button into the question box, then
 * goes. False when it cannot move (less motion asked, no animation API, no box): the page then highlights the box instead.
 */
function flyAnswer(from: HTMLElement, to: HTMLElement | null, text: string): boolean {
  if (to === null || lessMotion() || typeof from.animate !== "function") return false;
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const copy = document.createElement("span");
  copy.textContent = text;
  copy.className = "v4Chip";
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, { position: "fixed", left: `${start.left}px`, top: `${start.top}px`, margin: "0", pointerEvents: "none", zIndex: "40" });
  // Inside the V4 root, so the copy takes the chip's look.
  (from.closest(".v4Root") ?? document.body).append(copy);
  const animation = copy.animate([
    { transform: "translate(0, 0)", opacity: 1 },
    { transform: `translate(${end.left + 12 - start.left}px, ${end.bottom - 24 - start.top}px)`, opacity: 0.3 }
  ], { duration: flyInMs(from), easing: "cubic-bezier(.2, .7, .2, 1)" });
  const done = (): void => copy.remove();
  animation.onfinish = done;
  animation.oncancel = done;
  return true;
}

/** Which press waits out its Undo window: step 2's Start or its "Just answer it", or step 1's "Just answer it". */
type StartPress = "start" | "just" | "quick";

/**
 * A press waiting out its Undo window while the map shows. What is sent is kept from the press
 * (step 2 is not drawn meanwhile, so none of it can change); the hand-over is taken at the send (rule 5), so a combine that
 * lands meanwhile still goes with it.
 */
type PendingSend = PendingStart & Readonly<{
  press: StartPress;
  /** The line sent, and the line a rewrite accepted on its way would stand for (ASK-5). */
  line: string;
  basis: string;
  purposeLines: PurposeLines | undefined;
  /** Step 2 with the start step: the hand-over is taken at the send. False: the line alone (step 1, or no start step). */
  handsOver: boolean;
  /** "Just answer it" at READY: the menu's top paths, which the map draws (Start draws the plan as it stands). */
  topPaths: PathPlan | null;
  /** The share the note names (the bar's on step 2, step 1's own on step 1); null: none. */
  share: MoneyLine | null;
}>;

/** read-f3: a room read names the plan Free (an internal grant names none: its plan is null). */
function roomIsFree(room: AskRoom): boolean {
  return room.plan_id === "FREE";
}

/**
 * Task 76 (choose-f14): step 1's share, the share of the room's default width (Free: at most 3 paths); a room with no start
 * step keeps the room read's own share. Null without either.
 */
function stepOnePercentOf(room: AskRoom | null, free: boolean): number | null {
  const step = room?.start_step ?? null;
  const width = step === null ? null : free ? Math.min(step.widths.default, PATH_PLAN_LIMITS.freePathsMax) : step.widths.default;
  return (width === null ? null : startPathsShare(step, width)) ?? room?.start_share_percent ?? null;
}

function rectOf(element: Element | null | undefined): FoldRect | null {
  if (element === null || element === undefined) return null;
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** The next frame (a timer of one frame where the browser has no frames, as in a test page). */
function nextFrame(run: () => void): void {
  if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => run());
  else setTimeout(run, 16);
}

/**
 * Task 76b (choose-f19, "the fold"): `target` starts where `from` was (one transform from the top left, no transition), then
 * on the next frame goes to its place under the fold's own token (`.v4FoldMoving`). False when nothing moved (no size to
 * fold from or to); with less motion the caller highlights instead.
 */
function foldFrom(target: HTMLElement, from: FoldRect | null): boolean {
  const to = rectOf(target);
  const transform = from === null || to === null ? "none" : foldTransform(from, to);
  if (transform === "none") return false;
  target.classList.remove("v4FoldMoving");
  target.style.transformOrigin = "0 0";
  target.style.transform = transform;
  // The browser takes the starting place before the move begins (a style read), so the next frame's change is a transition.
  void target.offsetHeight;
  nextFrame(() => {
    target.classList.add("v4FoldMoving");
    target.style.transform = "none";
  });
  return true;
}

export function V4AskClient({
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint,
  initialQuestion,
  againRunId = null,
  kept = null
}: Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
  initialQuestion: string;
  /**
   * The level the address carried (`?level=`), or null. V4 start step, Task 75d (owner, 5 Nov): no longer read; the level choice
   * always starts on Plain words.
   */
  initialLevel?: ReadingLevel | null;
  /** Owner review 3 Nov (wait-f11): "Ask this again" names the debate (`?again=`) whose question fills the box; null: none. */
  againRunId?: string | null;
  /**
   * V4 start step, Task 76e: step 2 as kept, opened at once by the page's restore (the same restore Task 76f calls with the
   * account's copy on Pick up and on a reload); one the page cannot read is ignored. Absent or null: the page opens as Task 76c says.
   */
  kept?: V4StartKept | null;
}>) {
  // ask-d1 D / ask-f16: the real page from the first frame, signed in or not; the session is learnt beside it (V4AskGate).
  // The accept screen reads newDebate.* keys, as on /new.
  return (
    <V4AskGate catalog={newDebateCatalog} locale={locale}>{(session) => (
      <V4AskForm
        catalog={catalog}
        homeCatalog={homeCatalog}
        newDebateCatalog={newDebateCatalog}
        billingCatalog={billingCatalog}
        locale={locale}
        crisisCountryHint={crisisCountryHint}
        initialQuestion={initialQuestion}
        session={session}
        againRunId={againRunId}
        kept={kept}
      />
    )}</V4AskGate>
  );
}

function V4AskForm({
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint,
  initialQuestion,
  session,
  againRunId,
  kept: keptAtOpen
}: Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
  initialQuestion: string;
  /** Whether the visitor is signed in (CHECKING until the session read answers). */
  session: V4Session;
  /** Owner review 3 Nov (wait-f11): the debate whose question fills the box (`?again=`); null: none. */
  againRunId: string | null;
  /** Task 76e: step 2 as kept, restored when the page opens; null: none. */
  kept: V4StartKept | null;
}>) {
  const router = useRouter();
  // V4 start step, Task 75d (owner, 5 Nov, second round): the level belongs to this question. Its choice always starts on Plain
  // words (the D1 prototype's), for every question and every visit: the account remembers no level and the address names none.
  // A chip changes it (so every sample can be compared, UI-2/TIME-4); "Ask this again" starts it on the failed debate's own level.
  const [level, setLevel] = useState<ReadingLevel>("plain");
  /** Set once the person picks a level here: the failed debate's level, read late, never overrides their pick. */
  const levelPicked = useRef(false);
  const pickLevel = (next: ReadingLevel): void => {
    levelPicked.current = true;
    setLevel(next);
  };
  const [step, setStep] = useState<Step>("ask");
  const [question, setQuestion] = useState(initialQuestion);
  const [goal, setGoal] = useState<V4Goal>(EMPTY_GOAL);
  const [mode, setMode] = useState<DigMode>("quick");
  const [refusal, setRefusal] = useState<string | null>(null);
  // The press waiting out its Undo window (the map shows meanwhile), as a ref too for its timer
  // and Undo; its note's phase: COUNTING (Undo still there), SENDING, or WRITING (the hand-over waits for a path being written).
  const [pending, setPendingState] = useState<PendingSend | null>(null);
  const pendingRef = useRef<PendingSend | null>(null);
  const setPending = useCallback((next: PendingSend | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);
  const [pendingPhase, setPendingPhase] = useState<"COUNTING" | "SENDING" | "WRITING">("COUNTING");
  const pendingSent = useRef(false);
  // Task 76b (read-f3): which press waits for one more read of a plan still unknown ("Checking your plan…"); then, when that
  // read failed too, its one line. ask-f8: which step-2 press a declined consent stopped. Answer Q13: "Cancelled." shows.
  const [checkingPlan, setCheckingPlan] = useState<StartPress | null>(null);
  const [planUnknown, setPlanUnknown] = useState(false);
  const [declinedAtStart, setDeclinedAtStart] = useState<"PERSON" | "AIS" | null>(null);
  const [undone, setUndone] = useState(false);
  const undoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // choose-f19: the fold to play once the switch is drawn (where the moving card starts), and the press whose button takes
  // focus once step 2 (or step 1) is back.
  const foldPlan = useRef<Readonly<{ from: FoldRect | null }> | null>(null);
  const focusAfter = useRef<StartPress | null>(null);
  const foldFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoneTimer.current !== null) clearTimeout(undoneTimer.current);
    if (foldFlashTimer.current !== null) clearTimeout(foldFlashTimer.current);
  }, []);
  const pendingBox = useRef<HTMLDivElement>(null);
  const stepOne = useRef<HTMLDivElement>(null);
  const stepOneQuestion = useRef<HTMLDivElement>(null);
  // ASK-5: a rewrite the person accepted in the language pop-up, kept for the next Start while the text it replaced
  // (`basis`) is still what would be sent.
  const [accepted, setAccepted] = useState<Readonly<{ basis: string; text: string }> | null>(null);
  const readHeading = useRef<HTMLHeadingElement>(null);
  const questionField = useRef<HTMLTextAreaElement>(null);
  const shownStep = useRef<Step>(step);
  const ids = useId();
  // ask-d5 B: "My questions" (the owner's third round, 5 Nov), read once the person is known to be signed in.
  const shelf = useMapShelf({ enabled: session === "IN", want: SHELF_MAX, catalog });
  // Owner review 3 Nov (wait-f11): "Ask this again" fills the box with the earlier question, read back from the server, as
  // long as the person has not started typing; nothing starts by itself. Read once the person is known to be signed in.
  // Task 75d: with the failed debate's own level, unless the person picked one meanwhile.
  const again = useAskAgain(session === "IN" ? againRunId : null, catalog);
  const againQuestion = again?.question ?? null;
  useEffect(() => {
    if (againQuestion === null) return;
    setQuestion((current) => (current === initialQuestion ? againQuestion : current));
  }, [againQuestion, initialQuestion]);
  const againLevel = again?.level ?? null;
  useEffect(() => {
    if (againLevel !== null && !levelPicked.current) setLevel(againLevel);
  }, [againLevel]);
  // journey-d4 A: before Next, the browser's own "Leave site?" protects typed words (a reload or a closed tab); words a
  // reload brings back by themselves (from the address, or "Ask this again" from the server) are not at risk. Task 76c
  // (ask-f12): nor are the words this tab's history entry holds (a reload brings them back too). The guard itself is below,
  // with step 2's part.
  const filledByItself = againQuestion ?? initialQuestion;

  const ask = useV4Ask({
    catalog,
    homeCatalog,
    newDebateCatalog,
    locale,
    crisisCountryHint,
    // ASK-8: on D1 the only ask is "Just answer it" (quick), so its room notice describes a quick ask.
    mode: step === "ask" ? "quick" : mode,
    readingLevel: level,
    // V4 start step, Task 70b (ask-f8): a declined consent's line sits right under Next, never at the page's bottom.
    showDeclinedLine: false
  });
  // Task 76e (owner answer Q8): the site updated while the page is open (the room read again every 5 minutes, on focus and on
  // becoming visible, Task 70b's refreshRoom); its latest room is the start step's, so the new widths reach the card.
  const site = useSiteVersion({ room: ask.room, refresh: ask.refreshRoom });
  // Task 76e (owner answer S1 A): the kept step 2 this page restored (its clarifying questions come back without a call while
  // its line is read); null once another line is read.
  const [restored, setRestored] = useState<V4StartKept | null>(null);
  // Task 76f (owner answers S1 A, S3 A): the question the account keeps for the step 2 this page holds (its first save's answer,
  // or the one picked up or reopened), as a ref too for the send; the revision it was read at; the check event's language and
  // seats a saved reading carried (a restored reading has neither of its own); a reload on step 2 still reopening from the
  // account; "Not started yet" as last read (null: not read) and its reads; the deletes waiting out their Undo window.
  const [savedId, setSavedIdState] = useState<string | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [savedExtras, setSavedExtras] = useState<Readonly<{ ref: string; language: V4StartReading["language"]; seats: number | null }> | null>(null);
  const [reopening, setReopening] = useState<Readonly<{ id: string; words: string }> | null>(null);
  const [savedList, setSavedList] = useState<readonly SavedQuestionSummary[] | null>(null);
  const [savedListReads, setSavedListReads] = useState(0);
  const [waitingDeletes, setWaitingDeletes] = useState<readonly WaitingDelete[]>([]);
  const deleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => {
    for (const timer of deleteTimers.current.values()) clearTimeout(timer);
    deleteTimers.current.clear();
  }, []);
  const setSavedId = useCallback((id: string | null, revision: number | null = null) => {
    savedIdRef.current = id;
    setSavedIdState(id);
    setSavedRevision(revision);
  }, []);
  // Task 70b (read-d2, read-f14): the question is read once, at Next. `readLine` is the line read then (the step-1 words, tidied
  // as R22 sends them); step 2's box starts as it (Task 70c), and nothing typed there is read again. Back keeps both.
  const [readLine, setReadLine] = useState<string | null>(null);
  const [box, setBox] = useState<QuestionBox>(() => boxOf(""));
  const boxWords = boxLine(box);
  const [nextPress, setNextPressState] = useState<NextPress>("IDLE");
  // The press state as a ref too, so a second press in the same moment (before a re-render) sees the first.
  const nextPressRef = useRef<NextPress>("IDLE");
  const setNextPress = useCallback((value: NextPress) => {
    nextPressRef.current = value;
    setNextPressState(value);
  }, []);
  const pressedLine = useRef<string | null>(null);
  // Start and "Just answer it" in flight (a ref for the same reason).
  const startFlight = useRef(false);
  // Answer Q1 / ask-f8: a declined consent keeps the person on step 1, with one line right under Next.
  const [declinedAtNext, setDeclinedAtNext] = useState(false);
  // read-f17: the refusal says one question already waits (shown only while the room notice does not say it).
  const [refusalWaits, setRefusalWaits] = useState(false);
  // Task 75b (ask-d2 A, "Steps aside"): on a phone step 1's Next sits in the bottom bar, which steps aside while the question
  // box has focus, so the keyboard never covers the box. The level block's "What does it change?" opens the honest note.
  const narrow = useNarrow();
  const [boxFocused, setBoxFocused] = useState(false);
  const [levelWhatOpen, setLevelWhatOpen] = useState(false);
  // Task 76 (ask-f13): the rewrite the person accepted in the language pop-up of Next, while it is in force ("Use my words
  // instead" shows under the box); null otherwise.
  const [rewriteLine, setRewriteLine] = useState<string | null>(null);
  // Task 76 (read-d4 A, Task 73's split): the answered questions fold into one line once the person acts on a path.
  const [answersFolded, setAnswersFolded] = useState(false);
  // Task 76: the carry-on box (Task 56), an input or textarea on step 2 having focus (read-f9), and what a refusal at Start
  // was about (the card then says it: one line). Task 76b: a path still being written is the pending note's (choose-f10).
  const [carryOn, setCarryOn] = useState(false);
  const [textFocused, setTextFocused] = useState(false);
  const [refusalStart, setRefusalStart] = useState<"STALE" | "NARROWED" | null>(null);
  // Task 76 (read-d3 B): the box's 1-second highlight, the fly-in's stand-in with less motion.
  const [boxFlash, setBoxFlash] = useState(false);
  const boxFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (boxFlashTimer.current !== null) clearTimeout(boxFlashTimer.current);
  }, []);
  const boxField = useRef<HTMLTextAreaElement>(null);
  const stepTwo = useRef<HTMLDivElement>(null);
  // Task 76c (choose-f21, answer Q3): the debate a started question became, when the page opened on its history entry; the
  // logo's own question (read-f2) and the link it holds; a Leave that lets the page go without the browser asking again; and
  // whether the page is still here (a send that ends after the person left touches no other page's entry).
  const [startedRun, setStartedRun] = useState<string | null>(null);
  const [leaveAsking, setLeaveAsking] = useState(false);
  // Task 76f: the logo's question as asked (Task 76c's, or the change not saved yet while the account keeps the question).
  const leaveKey = useRef("v4.ask.leavePaths");
  const brandLink = useRef<HTMLAnchorElement | null>(null);
  const leaving = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // Task 76c (answer Q3): the page opens on its history entry as it was left. A reload (or a way back) to step 1 or step 2
  // shows step 1 with the entry's words and calls no AI; step 2's entry becomes step 1's, so the address says step 1 again.
  // A started question's entry shows one line with its map, the box empty, and no step 2. Task 76f (owner answer S1 A): step
  // 2's entry naming the question the account keeps reopens step 2 from the account (below), with no AI call.
  useBrowserLayoutEffect(() => {
    const held = askHistoryOf(window.history.state);
    if (held === null) return;
    if (held.step === "started") {
      setStartedRun(held.runId);
      setQuestion("");
      return;
    }
    setQuestion(held.words);
    if (held.step === "read" && held.savedId !== undefined) {
      setReopening({ id: held.savedId, words: held.words });
      return;
    }
    if (held.step === "read") {
      window.history.replaceState(withAskHistory(window.history.state, { step: "ask", words: held.words }), "",
        stepOneAddress(window.location.pathname, window.location.search));
    }
  }, []);

  // Owner 2026-10-29 (Free plan shape): a Free ask carries at most FREE_GOAL_CHOICES_MAX choices; paid plans have no cap.
  // Once Free's cap is reached, only the choices already set can still be changed (Task 76h: V4AskQuestions mutes the rest,
  // read-f8). What is sent never carries more.
  // Task 76 (read-f3): Free-only things read planIsFree, so an unknown plan is never treated as Free.
  const freePlan = ask.planIsFree === true;
  const sentGoal = useMemo(() => goalWithinPlan(goal, freePlan ? "free" : "premium"), [goal, freePlan]);
  const trimmed = question.trim();
  const longEnough = trimmed.length >= QUESTION_MIN;
  // ASK-3: a crisis message may be very short; it must still reach the crisis help (V3 enables Start for it).
  const crisisText = ask.flagsCrisis(trimmed);
  // Decision 29: the question goes to the small AI only once the person has agreed to the sensitive-data notice, and never in crisis words.
  // Task 70b: step 2 opens only after that yes, and crisis words never reach it; the clarifying call reads the read line, at once.
  const [consented, setConsented] = useState(false);
  // Task 76 (ask-f13): while an accepted rewrite of Next is in force, the clarifying questions are the rewrite's; "Use my
  // words instead" reads the person's own words again (a reply the page already holds comes back with no call).
  const clarifyLine = rewriteLine ?? readLine;
  // Task 76g (read-f1): the questions on screen, and the sentences kept answers hold as they were.
  const [shown, setShown] = useState<ShownQuestions>(NOTHING_SHOWN);
  const [held, setHeld] = useState<ReadonlyMap<string, HeldSentence>>(NO_HELD);
  // Task 50b (owner answer Q4, "Goal in answer"): the words of each "What do you care about most?" a reading brought, so Start marks
  // its answer in the purpose lines (`cares: true`) and the run knows the person stated a goal without reading the words.
  const [caresAsked, setCaresAsked] = useState<readonly string[]>([]);
  // Task 76g: a new line's call is told the earlier wording's questions (the reply's own: the site's country is the page's) and
  // the answers given, within the request's bounds.
  const earlier = useMemo((): AskClarifyEarlier | null => {
    if (shown.line === null || shown.line === clarifyLine || shown.earlier.length === 0) return null;
    const most = WEB_CONTRACT_LIMITS.clarifyQuestionsMax + 2;
    const answers = purposeLinesOfGoal({ answers: sentGoal.answers, matters: "" })?.answers ?? [];
    return { questions: shown.earlier.slice(0, most), answers: answers.slice(0, most) };
  }, [shown, clarifyLine, sentGoal]);
  // Task 76e (read-f23): a restored step 2's questions as shown come back without a call while its line is the one read.
  const clarifySeed = restored !== null && clarifyLine === restored.readLine ? restored.clarify ?? NO_CLARIFY : undefined;
  const clarify = useAskClarify({ active: step === "read" && clarifyLine !== null, question: clarifyLine ?? "", mayCall: consented, earlier,
    ...(clarifySeed === undefined ? {} : { seed: clarifySeed }) });
  // Task 76d (r2-5): the site's country, first among the answers of the question that asks where, never ticked. It is named in the
  // site's language (the page knows no other for the question before its paths come).
  const questionLanguage = catalogLocale(isLocale(locale) ? locale : "en");
  const siteCountry = useMemo(() => siteCountryOf({ locale, countryHint: crisisCountryHint, questionLanguage }),
    [locale, crisisCountryHint, questionLanguage]);
  // Task 76g (read-f1): a reply for the line read now is taken in once, while the page draws (so the questions, the answers and
  // the box change in the same frame as the wait ends). Nothing on screen yet: its questions show. With questions on screen (an
  // earlier wording's, or this one's): a reading that brought nothing back keeps them exactly as they were and says nothing new;
  // one with questions keeps each answer it can (answersAcrossReadings), and sets the others aside.
  const landed = !clarify.waiting && clarify.reply !== null && clarify.line !== null && clarify.line === clarifyLine
    && (shown.seen?.reply !== clarify.reply || shown.seen.line !== clarify.line) ? { reply: clarify.reply, line: clarify.line } : null;
  if (landed !== null) {
    // Task 76d (answer Q4): version 2's "What do you care about most?" comes last (clarifyingQuestions), answered like any other.
    const fresh = clarifyingQuestions(landed.reply);
    const caresText = landed.reply.source === "AI" ? landed.reply.cares?.text : undefined;
    if (caresText !== undefined && !caresAsked.includes(caresText)) setCaresAsked([...caresAsked, caresText]);
    const after = fresh.map((one) => withSiteCountryFirst(one, siteCountry));
    const onScreen = [...shown.questions, ...shown.kept];
    if (onScreen.length === 0) {
      setShown({ ...NOTHING_SHOWN, line: landed.line, earlier: fresh, questions: after, seen: landed });
    } else if (after.length === 0) {
      setShown({ ...shown, quiet: true, seen: landed });
    } else {
      const before = sentGoal.answers.filter(answerCounts).map((given) => ({
        given, question: onScreen.find((one) => one.text === given.question) ?? { text: given.question, answers: [given.answer] }
      }));
      const across = answersAcrossReadings(before, after, questionLanguage);
      const asked = new Set(after.map((one) => one.text));
      const kept: ClarifyQuestion[] = [];
      const answers: V4GoalAnswer[] = [];
      const moves: Array<Readonly<{ from: string; to: string }>> = [];
      const nextHeld = new Map<string, HeldSentence>();
      for (const { given, to } of across.kept) {
        const was = before.find((one) => one.given === given)?.question;
        const sentence = sentenceIn(given, onScreen, held);
        // A typed answer stays under its own question's words: that question's block, or one of its own after the new ones.
        const now: V4GoalAnswer = given.other ? given : {
          question: to, other: false,
          answer: after.find((one) => one.text === to)?.answers.find((offered) => sameAnswerWords(offered, given.answer, questionLanguage)) ?? given.answer
        };
        if (given.other && !asked.has(to) && was !== undefined) kept.push(was);
        if (given.question !== to) moves.push({ from: given.question, to });
        if (sentence !== null) nextHeld.set(to, { answer: now.answer, other: now.other, text: sentence });
        answers.push(now);
      }
      // A line set aside before stays until put back, at the end; each new one where its question was in the earlier list.
      const setAside: SetAsideAnswer[] = [
        ...shown.setAside.map((aside) => ({ ...aside, at: Number.MAX_SAFE_INTEGER })),
        ...across.setAside.map((aside) => {
          const place = onScreen.findIndex((one) => one.text === aside.question.text);
          return { ...aside, at: place === -1 ? aside.at : place };
        })
      ];
      const order = [...after, ...kept].map((one) => one.text);
      setGoal({ ...goal, answers: [...answers].sort((first, second) => order.indexOf(first.question) - order.indexOf(second.question)) });
      setBox(boxRekeyAll(across.setAside.reduce((emptied, aside) => boxRemove(emptied, aside.given.question), box), moves));
      setHeld(nextHeld);
      setShown({ line: landed.line, earlier: fresh, questions: after, kept, setAside, quiet: false, seen: landed });
    }
  }
  const questions = useMemo(() => [...shown.questions, ...shown.kept], [shown]);
  // Task 76 (read-d3): the box holds exactly the answers sent, one sentence each, in the questions' order (an answer kept by
  // a new reading keeps its sentence too). Laid out before the browser paints, so a tap never shows a box without its sentence.
  useBrowserLayoutEffect(() => {
    setBox((current) => boxWithAnswers(current, sentGoal, questions, held));
  }, [sentGoal, questions, readLine, held]);
  // Task 70b: the lists too are read once, for the read line (the hook asks nothing again for the same line and starts over
  // for a new one). Task 76: what they hold shows on step 2's card. `active` stays tied to the step (Task 71's note: a later
  // flip of the crisis patterns or of the length must never start read-f1's re-read of a stale card without Back and Next;
  // step 2 opens only for words that passed both).
  // Task 76e: the start step of the latest room read (a failed read of the update check keeps the one before; useSiteVersion).
  const startRoom = site.latestRoom?.start_step ?? null;
  const start = useStartPaths({
    active: step === "read" && readLine !== null && consented,
    questionLine: readLine ?? "",
    siteLanguage: catalogLocale(isLocale(locale) ? locale : "en"),
    readingLevel: level,
    clarify: purposeLinesOfGoal(sentGoal) ?? null,
    room: startRoom,
    freePlan,
    // Task 76e: a restored step 2 opens as kept, and nothing is posted for it.
    ...(restored === null ? {} : { kept: restored })
  });
  const plan = start.plan;

  // Task 76f (saved-questions spec §3.3; owner card "When saved"): the account keeps step 2 once its check passed: signed in, the
  // start step on the site, the consent given, step 2 shown (not during Start's Undo window, nor after its send), no language offer
  // waiting, no refusal, and a reading that was checked. So nothing is saved before Next, after a declined consent or crisis help.
  const reading = start.reading;
  const savingOn = session === "IN" && startRoom !== null && consented && step === "read" && pending === null && reading !== null
    && start.languageOffer === null && start.phase !== "REFUSED" && !(reading.end === "NONE" && UNCHECKED_REASONS.has(reading.noneReason ?? ""));
  // The document: the reading the server signed (with the language and seats a saved reading carried, which a restored one has
  // not), and the page's own state: the box, the answers, the clarifying questions as shown, the plan, How wide, the mode and
  // the carry-on tick. A reading with no list keeps an empty plan.
  const clarifyReplyShown = clarify.line !== null && clarify.line === clarifyLine && !clarify.waiting ? clarify.reply : null;
  const savedDoc = useMemo(() => {
    if (reading === null) return null;
    const extras = savedExtras !== null && savedExtras.ref === reading.check.ref ? savedExtras : null;
    const signed: V4StartReading = { ...reading, language: reading.language ?? extras?.language ?? null, seats: reading.seats ?? extras?.seats ?? null };
    const kept: V4StartKept = {
      v: 1, readLine: reading.checkedLine, box, sentGoal, clarify: clarifyReplyShown, check: reading.check, menu: reading.menu, lists: [],
      lateLists: reading.lateLists, end: reading.end, ...(reading.noneReason === undefined ? {} : { noneReason: reading.noneReason }),
      plan: plan ?? { ...pathPlanFromPicks([], freePlan), width: start.width }, width: start.width, mode, carryOn,
      // Task 76m (spec §3.2): the AI's combined words of the reading, also a combine undone before this save.
      written: start.written
    };
    return savedDocOf({ kept, reading: signed });
  }, [reading, savedExtras, box, sentGoal, clarifyReplyShown, plan, freePlan, start.width, mode, carryOn, start.written]);
  // What goes at once (spec §3.3): the reading's end (the list landing) and a late merge (a new menu), and a path's AI words
  // written or given up (COMBINE_WRITTEN, COMBINE_FAILED). Every other change waits SAVE_PAUSE_MS.
  const savedMoment = `${reading?.end ?? ""} ${reading?.menu?.ref ?? ""}`;
  const writingKeys = useMemo(() => plan === null ? [] : [...plan.paths, ...plan.more].filter((path) => path.wording === "WRITING").map((path) => path.key),
    [plan]);
  const [saveAtOnce, setSaveAtOnce] = useState(0);
  const lastSavedMoment = useRef<Readonly<{ moment: string; writing: readonly string[] }>>({ moment: savedMoment, writing: writingKeys });
  useEffect(() => {
    const before = lastSavedMoment.current;
    lastSavedMoment.current = { moment: savedMoment, writing: writingKeys };
    const settled = before.writing.some((key) => !writingKeys.includes(key) && [...(plan?.paths ?? []), ...(plan?.more ?? [])]
      .some((path) => path.key === key && (path.wording === "COMBINED" || path.wording === "FALLBACK")));
    if (before.moment !== savedMoment || settled) setSaveAtOnce((count) => count + 1);
  }, [savedMoment, writingKeys, plan]);
  /** Task 76f: the first save's id, in memory and in step 2's history entry beside the words (never in the address). */
  const keepSavedId = useCallback((id: string): void => {
    setSavedId(id);
    if (!alive.current) return;
    const entry = askHistoryOf(window.history.state);
    if (entry?.step === "read") window.history.replaceState(withAskHistory(window.history.state, { step: "read", words: entry.words, savedId: id }), "");
  }, [setSavedId]);
  const save = useSavedQuestion({ enabled: savingOn, savedId, revision: savedRevision, doc: savedDoc, immediate: saveAtOnce, client: contractClient,
    onSavedId: keepSavedId });
  // Owner answers S1 A and S2 A: the account keeps this question (its first save landed and saving has not stopped); then only a
  // change not saved yet is at risk when leaving, and the card's reload line goes (a reload reopens step 2 from the account).
  const accountKeeps = savedId !== null && save.state !== "OFF" && save.state !== "STOPPED";
  const changeUnsaved = accountKeeps && (save.state === "PENDING" || save.state === "SAVING" || save.state === "FAILED");
  // Spec §3.10: a picked-up reading that no longer verifies (a plan change, a new signing key) opens as left, to be read again.
  const staleOnOpen = useRef<string | null>(null);
  const markStale = start.markStale;
  useEffect(() => {
    const ref = staleOnOpen.current;
    if (ref === null || reading?.check.ref !== ref) return;
    staleOnOpen.current = null;
    markStale();
  }, [reading, markStale]);

  // Task 76f (spec §3.4; owner card "Where shown"): "Not started yet" is read on step 1 when signed in on a site with the start
  // step: as the page opens, after each Back to step 1, and after a Pick up found its question gone. The question whose step 2
  // this page holds is not listed, nor one waiting out its Delete.
  const listOffered = session === "IN" && startRoom !== null && reopening === null;
  const onStepOne = step === "ask";
  useEffect(() => {
    if (!onStepOne || !listOffered) return undefined;
    let live = true;
    void (async () => {
      try {
        const read = await contractClient.listSavedQuestions();
        if (live) setSavedList(read.questions);
      } catch {
        // Nothing to show: the list stays as it was.
      }
    })();
    return () => { live = false; };
  }, [onStepOne, listOffered, savedListReads]);
  const heldSavedId = readLine === null ? null : savedId;
  const notStartedItems = useMemo(() => (savedList ?? [])
    .filter((one) => one.id !== heldSavedId && !waitingDeletes.some((waiting) => waiting.item.id === one.id)), [savedList, heldSavedId, waitingDeletes]);
  // "Just answer it" sends the question alone, tidied the same way (so its title is the person's whole words); Next reads this line.
  const plain = useMemo(() => composeQuestion(trimmed, EMPTY_GOAL, newDebateCatalog), [trimmed, newDebateCatalog]);
  const boxLongEnough = boxWords.length >= QUESTION_MIN;
  const boxCrisis = ask.flagsCrisis(boxWords);
  // Task 76 (read-d3): Start sends what the box says (ASK-5: or the rewrite accepted at a Start of exactly this line).
  const sentLine = accepted !== null && accepted.basis === boxWords ? accepted.text : boxWords;
  const quickLine = accepted !== null && accepted.basis === plain ? accepted.text : plain;
  const tooLong = byteLength(sentLine) > askQuestionMaxBytes();
  // A press is busy from its consent until it is sent or comes back (its plan read, its Undo window, its send).
  const busy = ask.submitting || pending !== null || checkingPlan !== null;
  // W3-4 (the money rule, owner 31 Oct): before a new question, its share of today; when new starts wait for the day,
  // week or month reset, that line with the time takes the place of today's room notice. Shares only, never a price.
  // public-f24 (owner's screen review, 3 Nov): step 1's one V4 line whichever server switch is in force, never the older
  // "will start by itself … Or upgrade" sentences; read-f19 / public-f14: the share names its own window (lib/v4/money.ts).
  const startsWait = limitLine(ask.room, locale);
  // Step 2 (above the bar) belongs to the start-step session (everything from the Next press onward). Task 76 (choose-f14):
  // the bar's own share is step 2's one share line; above it only the reset line or the room notice.
  const stepTwoWait = startsWaitLine(ask.room, locale);
  const shortHint = trimmed.length > 0 && !longEnough && !crisisText;
  // Decision 13: before every Start press of a Free person, in their language (the sentence is in all 35 catalogues). The ask then says it was shown.
  const publicNotice = ask.freePublicNotice === true
    ? <p className="v4AskPublicNotice" role="note">{t(newDebateCatalog, "newDebate.freePublicNotice")}</p>
    : null;

  // Step 1's own lines. ask-f14 / read-f18: the one reason line under the box says why a step-1 button cannot be pressed
  // yet (an empty box, a few letters, a question too long to send), and both buttons are described by it, so screen
  // readers hear it too. ask-f18 / ask-d4 C: when new questions wait for a reset, one line above the box names the
  // window and the time; the box keeps the words. Below the buttons stay the share and the room notice (late parts,
  // ask-f16), the reset line no longer among them.
  const quickTooLong = byteLength(quickLine) > askQuestionMaxBytes();
  const reasonKey = trimmed.length === 0 ? "v4.ask.typeFirst" : shortHint ? "v4.ask.tooShort" : quickTooLong ? "v4.ask.tooLong" : null;
  const usedUp = usedUpLine(ask.room, locale);
  // Task 70b (read-f17): while the room notice says one question already waits (sentence D), both buttons wait, described by it.
  const waitingShown = alreadyWaitingShown(ask.room);
  const stepOneWhy = [usedUp === null ? null : `${ids}-usedup`, waitingShown ? `${ids}-room` : null, reasonKey === null ? null : `${ids}-why`]
    .filter((id): id is string => id !== null).join(" ") || undefined;
  // Task 76 (choose-f14): step 1's share is the share of the room's default width (Free: at most 3 paths), in the same unit
  // as step 2's (planIsFree); a room with no start step keeps the room read's own share. Task 76b: the same share in the note.
  const stepOnePercent = stepOnePercentOf(ask.room, freePlan);
  const startShare = startShareLine(stepOnePercent === null || ask.room === null ? ask.room : { ...ask.room, start_share_percent: stepOnePercent }, freePlan);
  const stepOneRoomLines = (
    <>
      <V4MoneyLines lines={startShare === null ? [] : [startShare]} catalog={catalog} />
      {startsWait === null ? (
        <div id={`${ids}-room`}>
          <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
        </div>
      ) : null}
    </>
  );
  // ask-d1 D: the seed of the map, for a first visit only (signed out, or an account with no debate yet).
  const firstVisit = session === "OUT" || (session === "IN" && shelf.load.status === "READ" && !shelf.load.read.anyRows);
  // ask-d1 A (in D): the promise line too is for first visits only; returning people never see it. Until the account
  // says which (ask-f16), its place is held, then closed at once for a returning person.
  const promise: "SHOW" | "HOLD" | "NONE" = firstVisit ? "SHOW"
    : session === "CHECKING" || (session === "IN" && shelf.load.status === "LOADING") ? "HOLD" : "NONE";
  // ask-d1: sign-in sends the person back to this page, its address as it is (the one rule of lib/signInWayBack.ts, which
  // keeps only an allowed way back). Worked out once mounted: the server has no window. Task 75d: no level rides it; the level
  // choice starts on Plain words again on the way back, as on every visit.
  const [signInHref, setSignInHref] = useState("/login");
  useEffect(() => {
    setSignInHref(signInHrefFor(currentReturnPath()));
  }, []);
  // ask-d1 A: the sign-in panel at Next is the start-step session's. Until it lands, a signed-out visitor's Next and "Just
  // answer it" go to sign in (with the way back), and a grey line under Next says so; nothing reaches the consent screen or
  // step 2 without a session. While the session is unknown both wait.
  const signedOut = session === "OUT";
  const sessionUnknown = session === "CHECKING";
  // V, 2026-09-30 (ask-f3: "even signed out"): words of a person in crisis get the help numbers before any sign-in step.
  // The page stays and nothing is sent: useV4Ask's own first check opens the help screen and stops there.
  const helpBeforeSignIn = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (trimmed.length === 0 || !detectCrisis(trimmed).crisis) return;
    event.preventDefault();
    void ask.submit(trimmed, "quick", "ask");
  };
  // ask-d1: the signed-out Next, which Enter presses too (ask-f17).
  const signInNext = useRef<HTMLAnchorElement>(null);

  // Task 70b (choose-f3, ask-f2, read-f17): what keeps Next and "Just answer it" waiting besides the words and the session:
  // the plan still being read ("Getting ready…"), new questions waiting for a reset, one question already waiting. Their press
  // then reads nothing and counts nothing. ask-f3 (4 Nov night): crisis words keep both pressable, with their usual words,
  // for the help screen alone, whatever else greys them.
  const planLoading = ask.planState === "LOADING";
  const stepOneHeld = planLoading || stepTwoWait !== null || waitingShown;
  const helpFirst = crisisText;
  const nextGreyed = nextPress !== "IDLE" || (!helpFirst && (!longEnough || busy || sessionUnknown || stepOneHeld));
  const justGreyed = nextPress !== "IDLE" || (!helpFirst && (!longEnough || busy || quickTooLong || sessionUnknown || stepOneHeld));
  const gettingReady = planLoading && !helpFirst;

  /** ask-f3: crisis words get the help screen first, whatever their length; nothing else happens (no consent, no AI, no step). */
  function helpFirstAt(words: string): boolean {
    return words.length > 0 && detectCrisis(words).crisis && ask.offerCrisisHelp([words]);
  }

  // ask-f17: Enter presses Next on a computer; a phone (a coarse pointer, read once mounted) keeps its new line.
  const coarsePointer = useRef(false);
  useEffect(() => {
    coarsePointer.current = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }, []);

  // Changing step moves focus to the new step's heading or the question, and back to the top.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0 });
    if (step === "read") readHeading.current?.focus();
    else questionField.current?.focus();
  }, [step]);

  // ask-f19: the step-1 box follows the words' height (and the width the page now has); Task 76b: also once it is back.
  const pendingShown = pending !== null;
  useBrowserLayoutEffect(() => {
    if (step !== "ask" || pendingShown) return;
    growToWords(questionField.current);
  }, [question, step, pendingShown]);
  useEffect(() => {
    if (step !== "ask") return;
    const regrow = () => growToWords(questionField.current);
    window.addEventListener("resize", regrow);
    return () => window.removeEventListener("resize", regrow);
  }, [step]);

  /** Task 76b: a new press clears what the last one said (its refusal, its declined consent, its plan line, "Cancelled."). */
  function clearPressLines(): void {
    setRefusal(null);
    setRefusalWaits(false);
    setPlanUnknown(false);
    setDeclinedAtStart(null);
    setUndone(false);
  }

  /**
   * Task 76b, rule 2b (read-f3, 4 Nov night): while the plan is unknown (FAILED), a press first reads the room once more, with
   * "Checking your plan…" on what was pressed and nothing waiting. A read that answers names the plan the press goes on with;
   * one that fails says "We couldn't check your plan. Try again." and nothing is sent (the coordinator's ruling: a wrong shape
   * cannot be undone after the send), so null. The next press tries again.
   */
  async function planAtPress(press: StartPress): Promise<Readonly<{ free: boolean; room: AskRoom | null; readNow: boolean }> | null> {
    if (ask.planState !== "FAILED") return { free: freePlan, room: ask.room, readNow: false };
    setCheckingPlan(press);
    const fresh = await ask.refreshRoom().catch(() => null);
    setCheckingPlan(null);
    if (fresh === null) {
      setPlanUnknown(true);
      return null;
    }
    return { free: roomIsFree(fresh), room: fresh, readNow: true };
  }

  /**
   * Task 76b, rule 3 (answers Q11, Q12): the press waits START_UNDO_MS on the map; the card (or step 1's question block, `card`)
   * is measured first, so the map's first card can fold out of it (choose-f19).
   */
  function beginPending(next: Omit<PendingSend, "sendsAt">, card: Element | null): void {
    foldPlan.current = { from: rectOf(card) };
    pendingSent.current = false;
    setTextFocused(false);
    setBoxFocused(false);
    setPendingPhase("COUNTING");
    setPending({ ...next, sendsAt: Date.now() + START_UNDO_MS });
  }

  /**
   * Task 76b, rule 4 (answer Q13): Undo (or Esc in the note) before the send: nothing is ever sent, the step comes back exactly
   * as it was (it was only kept in memory), the fold plays backwards from the map's first card, focus goes back to what was
   * pressed, and "Cancelled. Nothing more was used." shows for a few seconds.
   */
  function undoPending(): void {
    const waiting = pendingRef.current;
    if (waiting === null || pendingSent.current) return;
    foldPlan.current = { from: rectOf(pendingBox.current?.querySelector(".v4MapRoot")) };
    focusAfter.current = waiting.press;
    setPending(null);
    setUndone(true);
    if (undoneTimer.current !== null) clearTimeout(undoneTimer.current);
    undoneTimer.current = setTimeout(() => {
      undoneTimer.current = null;
      setUndone(false);
    }, DIG_CANCELLED_SHOWN_MS);
  }

  /**
   * The Undo window is over. The note reads "Starting…" and Undo goes; step 2's hand-over is taken now (it
   * waits for a path still being written: the note says so), then the ask. STARTED: the map's page. REFUSED or STOPPED: the
   * step back, unlocked, every pick kept, with the refusal's line (a stale reading marked, a narrowed one the card's line).
   */
  async function sendPending(sending: PendingSend): Promise<void> {
    if (pendingRef.current !== sending || pendingSent.current) return;
    pendingSent.current = true;
    setPendingPhase("SENDING");
    try {
      let handOver: V4StartHandOver | undefined;
      if (sending.handsOver) {
        // Task 76f (saved-questions spec §3.7): the latest change goes to the account first (whatever it answers), then the ask
        // names the question the account keeps, which the server removes once it accepts the debate.
        await save.flush();
        if (sending.chosenBy === "PERSON" && start.plan?.paths.some((path) => path.wording === "WRITING") === true) setPendingPhase("WRITING");
        const handed = await start.handOver({ chosenBy: sending.chosenBy, questionLine: sending.line });
        setPendingPhase("SENDING");
        handOver = sending.carryOn ? { ...handed, carryOnToReport: true as const } : handed;
        const kept = savedIdRef.current;
        if (kept !== null) handOver = { ...handOver, savedQuestionId: kept };
      } else if (sending.press !== "quick") {
        // Step 2 with no start step: the line alone, as the card's hook hands it over then.
        handOver = { questionLine: sending.line, ownWords: [] };
      } else if (savedIdRef.current !== null && sending.basis === readLine) {
        // Review (wave 16; saved-questions spec §3.7, '"Just answer it" starts a debate too, so it removes the saved copy'): step
        // 1's press for the words whose step 2 the account keeps (after Back, unchanged) starts that question, so the ask names
        // it, as Start does; other words start another question and name none.
        await save.flush();
        const kept = savedIdRef.current;
        if (kept !== null) handOver = { questionLine: sending.line, ownWords: [], savedQuestionId: kept };
      }
      const outcome = await ask.submit(handOver?.questionLine ?? sending.line, sending.mode, "ask", null, sending.purposeLines, undefined, handOver);
      switch (outcome.kind) {
        case "STARTED": {
          // Task 76f (spec §3.7): the page removes the saved copy too, in case the server's removal failed; it never holds the
          // debate up, and a refused or stopped Start deletes nothing.
          const startedFrom = handOver?.savedQuestionId;
          if (startedFrom !== undefined) {
            void (async () => {
              try {
                await contractClient.deleteSavedQuestion(startedFrom);
              } catch {
                // The server's own removal at Start stands; a copy left behind shows in the list and can be deleted there.
              }
            })();
          }
          // Task 76i (wait-f14): the question and the paths the map shows now go to the map page in this tab's memory only, so
          // they stay on screen while it checks the session and reads the debate for the first time.
          handOffStart({ runId: outcome.runId, questionLine: sending.line, paths: shownPendingPaths.current ?? [], level, at: Date.now() });
          // Task 76c (answer Q3): this entry is the started question's from now on (step 2's, or step 1's for its "Just
          // answer it"), so Back from the map never comes to a half-started ask. Not once the person has left the page.
          if (alive.current) {
            window.history.replaceState(withAskHistory(window.history.state, { step: "started", runId: outcome.runId }), "", "/v4");
          }
          // Task 75d: no level in the map's address; the map shows the debate at the level it was asked at (its run read).
          router.push(`/v4/debate/${encodeURIComponent(outcome.runId)}`);
          return; // the map stays until the map page takes over
        }
        case "REFUSED": {
          if (outcome.startPathsStale === true) {
            start.markStale();
            setRefusalStart("STALE");
          } else if (outcome.startPathsNarrowed === true) {
            setRefusalStart("NARROWED");
          }
          setRefusal(outcome.message);
          // read-f17: one question already waits; while the room notice says so (sentence D), this line is not shown.
          setRefusalWaits(outcome.code === "ALREADY_WAITING");
          // ASK-5: a rewrite accepted before the refusal sticks for the next Start of the same text.
          const kept = outcome.acceptedQuestion;
          if (kept !== undefined && kept.trim().length > 0) setAccepted({ basis: sending.basis, text: kept });
          break;
        }
        case "STOPPED": {
          // ASK-5: the same for a rewrite accepted before the question check's screen opened.
          const kept = outcome.acceptedQuestion;
          if (kept !== undefined && kept.trim().length > 0) setAccepted({ basis: sending.basis, text: kept });
          break;
        }
      }
    } catch {
      setRefusal(t(catalog, "v4.ask.failed"));
      setRefusalWaits(false);
    }
    if (pendingRef.current !== sending) return;
    focusAfter.current = sending.press;
    setPending(null);
    setPendingPhase("COUNTING");
  }

  // Task 76b, rules 3 and 6: the press is sent at its time, by the page as it is then; leaving the page (unmounting) before it
  // clears the timer, so nothing is ever sent.
  const sendPendingNow = useRef(sendPending);
  sendPendingNow.current = sendPending;
  useEffect(() => {
    if (pending === null) return undefined;
    const sending = pending;
    const timer = setTimeout(() => { void sendPendingNow.current(sending); }, Math.max(0, sending.sendsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);

  // choose-f19: once the switch is drawn (before the browser paints), the moving card folds from where the other one was: the
  // map's first card out of the card, or on Undo the card out of the first card; with less motion it switches at once and
  // takes the 1-second highlight. Then focus goes back to what was pressed, when the step is back.
  useBrowserLayoutEffect(() => {
    const fold = foldPlan.current;
    foldPlan.current = null;
    if (fold !== null) {
      const target = pendingShown ? pendingBox.current?.querySelector<HTMLElement>(".v4MapRoot") ?? null
        : step === "ask" ? stepOneQuestion.current : stepTwo.current?.querySelector<HTMLElement>(".v4AskCard") ?? null;
      if (target !== null && lessMotion()) {
        target.classList.add("v4Highlight");
        if (foldFlashTimer.current !== null) clearTimeout(foldFlashTimer.current);
        foldFlashTimer.current = setTimeout(() => {
          foldFlashTimer.current = null;
          target.classList.remove("v4Highlight");
        }, BOX_HIGHLIGHT_MS);
      } else if (target !== null) {
        foldFrom(target, fold.from);
      }
    }
    const press = focusAfter.current;
    focusAfter.current = null;
    if (pendingShown || press === null) return;
    const within = step === "ask" ? stepOne.current : stepTwo.current;
    const pressed = press === "quick" ? within?.querySelector<HTMLElement>(".v4AskJust")
      : press === "just" ? within?.querySelector<HTMLElement>(".v4StartBarJust") ?? within?.querySelector<HTMLElement>(".v4StartBarStart")
        : within?.querySelector<HTMLElement>(".v4StartBarStart");
    pressed?.focus();
  }, [pendingShown]);

  /**
   * Step 1's "Just answer it": crisis help first (ask-f3), then nothing while it waits; the one-time consent (a no shows the
   * line under Next, ask-f8); a plan still unknown is read once more (read-f3); then its Undo window. Step 1 has
   * no card, so it sends the line alone, as a quick look, and the map says the AIs are choosing what to look into.
   */
  function justAnswer(): void {
    if (nextPressRef.current !== "IDLE") return;
    if (helpFirstAt(trimmed)) return;
    if (!longEnough || busy || quickTooLong || sessionUnknown || stepOneHeld) return;
    if (continuesStopped()) return;
    void pressQuick();
  }

  /**
   * V4 start step, Task 57g (the owner's 7 Nov answers: "if it stays the same, we need to use whatever was already generated and paid
   * for"): opened from the stopped page's "Change the question", the words left as they were (trimmed) continue that debate itself when
   * the server can: no consent, no reading, no charge here; its map starts the same Continue, with its Undo window. Next and step 1's
   * "Just answer it" alike (either would otherwise charge the same question twice). True: the page is on its way to the map.
   */
  function continuesStopped(): boolean {
    if (againRunId === null || again?.continuable !== true || !sameStoppedWords(trimmed, againQuestion)) return false;
    handOffContinue(againRunId, Date.now());
    router.push(`/v4/debate/${encodeURIComponent(againRunId)}`);
    return true;
  }

  async function pressQuick(): Promise<void> {
    if (busy || startFlight.current || pendingRef.current !== null) return;
    startFlight.current = true;
    clearPressLines();
    try {
      // Task 70b (ask-f8): the one-time consent first, so a no shows the same line under Next (the ask page shows no other);
      // a yes is remembered, so the ask's own consent step passes at once.
      const agreed = await ask.ensureConsent().catch(() => false);
      setDeclinedAtNext(!agreed);
      if (!agreed) return;
      const known = await planAtPress("quick");
      if (known === null) return;
      beginPending({
        press: "quick", chosenBy: "AIS", mode: "quick", carryOn: false, line: quickLine, basis: plain, purposeLines: undefined,
        handsOver: false, topPaths: null, share: startPathsShareLine(stepOnePercentOf(known.room, known.free), known.free)
      }, stepOneQuestion.current);
    } finally {
      startFlight.current = false;
    }
  }

  /**
   * Task 70b: Next. (1) One press at a time; (2) crisis words get the help screen, whatever their length and whatever greys the
   * button, and nothing else; (3) what greys Next stops its press too, so nothing is read or counted; (4) the one-time consent
   * before any reading: a no stays on step 1 with the line under Next (answer Q1, ask-f8); (5) "Reading…" once it is given, and
   * the line read is the words as R22 sends them; (6) step 2 (the effect below). "Show it again" and Enter press it the same way.
   */
  async function goOn(): Promise<void> {
    if (nextPressRef.current !== "IDLE" || startFlight.current) return;
    if (helpFirstAt(trimmed)) return;
    if (!longEnough || busy || sessionUnknown || stepOneHeld) return;
    if (continuesStopped()) return;
    setRefusal(null);
    setRefusalStart(null);
    setNextPress("CONSENT");
    const agreed = await ask.ensureConsent().catch(() => false);
    if (!agreed) {
      setNextPress("IDLE");
      setDeclinedAtNext(true);
      return;
    }
    setDeclinedAtNext(false);
    setConsented(true);
    pressedLine.current = plain;
    setNextPress("READING");
  }

  // (5)-(6), once "Reading…" is on the button: the same line as the one read before (Back, then Next with the same words) brings
  // step 2 back as it was, its box, answers and reading; another starts a fresh box, and the clarifying questions and the lists
  // read the new line (read-d2). A stale reading read again with the same words is Task 71's.
  useEffect(() => {
    if (nextPress !== "READING") return;
    const line = pressedLine.current;
    pressedLine.current = null;
    if (line !== null && line !== readLine) {
      setReadLine(line);
      setBox(boxOf(line));
      // Task 76: a new reading has no rewrite in force, no card swap to undo and no folded answers. Task 76e: nor a kept step 2.
      setRewriteLine(null);
      swapWords.current = null;
      setAnswersFolded(false);
      setRestored(null);
    }
    setStep("read");
    setNextPress("IDLE");
    // Task 76c (read-f2, answer Q3): step 1's entry keeps the words read, and step 2 gets an entry of its own; the address
    // says only that it is step 2. A started question's line belongs to the question before.
    const words = line ?? readLine;
    if (words !== null) {
      window.history.replaceState(withAskHistory(window.history.state, { step: "ask", words }), "");
      pushStepTwo(words);
    }
    setStartedRun(null);
  }, [nextPress, readLine, setNextPress]);

  /**
   * Task 76c: step 2 to step 1 by the page's own Back (and the screens that lead back with "Edit my question"): step 1 at once,
   * and the tab goes back to step 1's entry too, so the history and the page agree and Forward brings step 2 back as held.
   */
  function toStepOne(): void {
    setStep("ask");
    if (askHistoryOf(window.history.state)?.step === "read") window.history.back();
  }

  /**
   * ask-f17: on a computer, Enter in the step-1 box presses Next, exactly as the button does (greyed: nothing, unless crisis
   * words); Shift+Enter, a phone, and a word still being composed keep the box's own new line. No hint.
   */
  function pressOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || coarsePointer.current) return;
    event.preventDefault();
    if (signedOut) {
      signInNext.current?.click();
      return;
    }
    void goOn();
  }

  /**
   * Sets or clears one question's answer, keeping them in the order the questions are shown (so the sentences read in that order).
   * Task 76 (read-d3): the box follows (boxWithAnswers); a tapped answer's sentence flies from its button into the box (the
   * "fly-in" move), or, with less motion, the box is highlighted for a second.
   */
  function answerQuestion(question: ClarifyQuestion, next: V4GoalAnswer | null, from?: HTMLElement) {
    const others = goal.answers.filter((given) => given.question !== question.text);
    const answers = next === null ? others : [...others, next];
    const place = (given: V4GoalAnswer): number => questions.findIndex((shown) => shown.text === given.question);
    setGoal({ ...goal, answers: [...answers].sort((a, b) => place(a) - place(b)) });
    // Task 76g: an answer the person changes is theirs now; no sentence is held for its question any more.
    if (held.has(question.text)) setHeld((current) => withoutHeld(current, [question.text]));
    if (next === null || next.other || from === undefined) return;
    const sentence = answerSentence(next, [question]);
    if (sentence === null || flyAnswer(from, boxField.current, sentence)) return;
    if (boxFlashTimer.current !== null) clearTimeout(boxFlashTimer.current);
    setBoxFlash(true);
    boxFlashTimer.current = setTimeout(() => {
      boxFlashTimer.current = null;
      setBoxFlash(false);
    }, BOX_HIGHLIGHT_MS);
  }

  // Task 76 (ask-f3): crisis words in the box or in the person's own path words keep Start and "Just answer it" pressable, for
  // the help screen alone (the same texts the press screens first).
  const ownPathWords = useMemo(() => plan === null ? [] : pathPlanOwnWords(plan), [plan]);
  const helpFirstTwo = (boxWords.length > 0 && boxCrisis) || ownPathWords.some((words) => ask.flagsCrisis(words));
  const carryOnOffered = CARRY_ON_BUILT && startRoom !== null;

  // Task 76 (spec §2 item 6; answers Q8, Q10; read-f17): what Start can do now. PATHS_COMING while the AIs read; OFFLINE;
  // BLOCKED on a used-up quota, a refusal, a stale reading, more paths than the site now allows, sentence D, or a box Start
  // cannot send (too short, too long); else READY. CHECKING_PLAN while a press reads a plan still unknown; through the
  // Undo window and the send the map stands in the bar's place (its note says "Starting…" and the written-path wait).
  const barState: StartBarState = checkingPlan === "start" || checkingPlan === "just" ? "CHECKING_PLAN"
    : !start.online ? "OFFLINE"
      : !start.startReady && PATHS_COMING_PHASES.has(start.phase) ? "PATHS_COMING"
        : !start.startReady || start.narrowedTo !== null || waitingShown || !boxLongEnough || tooLong ? "BLOCKED"
          : "READY";

  /**
   * Task 76: step 2's Start ("PERSON") and its "Just answer it" ("AIS"). Task 76b's rules: (1) crisis words in the box or the
   * person's own path words open the help screen, whatever the bar says (ask-f3), and nothing waits; then only from READY;
   * (2) the consent is ensured again (a no shows the declined line above the bar, ask-f8); (2b) a plan still unknown is read
   * once more (read-f3); a read naming Free while more is chosen than Free allows leaves nothing waiting: Free's cap or the
   * narrowed line shows and the press waits until the choices fit (never a silent drop; Thorough simply goes as a quick look);
   * (3) the Undo window, with the map (sendPending above takes the hand-over at the send).
   */
  async function pressStart(chosenBy: "PERSON" | "AIS"): Promise<void> {
    if (busy || startFlight.current || pendingRef.current !== null) return;
    const line = sentLine;
    if (ask.offerCrisisHelp([line, ...ownPathWords])) return;
    if (barState !== "READY") return;
    const press: StartPress = chosenBy === "PERSON" ? "start" : "just";
    startFlight.current = true;
    clearPressLines();
    setRefusalStart(null);
    try {
      const agreed = await ask.ensureConsent().catch(() => false);
      if (!agreed) {
        setDeclinedAtStart(chosenBy);
        return;
      }
      const known = await planAtPress(press);
      if (known === null) return;
      const free = known.free;
      // The choices were made while the plan was unknown (no cap shown): over Free's, they wait for the person, never dropped.
      if (known.readNow && free && (goalChoiceCount(goal) > FREE_GOAL_CHOICES_MAX
        || (chosenBy === "PERSON" && (plan?.paths.length ?? 0) > PATH_PLAN_LIMITS.freePathsMax))) return;
      const menu = start.menu;
      beginPending({
        press, chosenBy, mode, carryOn: carryOnOffered && carryOn, line, basis: boxWords,
        purposeLines: purposeLinesOfGoal(goalWithinPlan(goal, free ? "free" : "premium"), caresAsked),
        handsOver: startRoom !== null,
        topPaths: chosenBy === "AIS" && start.phase === "READY" && menu !== null ? pathPlanFromMenu(menu.menu, start.width, free) : null,
        share: startPathsShareLine(start.sharePercent, free)
      }, stepTwo.current?.querySelector(".v4AskCard") ?? null);
    } finally {
      startFlight.current = false;
    }
  }

  // Answer Q8: once the paths fit the site's new widest again, the narrowed refusal has nothing more to say.
  const wasNarrowed = useRef(false);
  useEffect(() => {
    if (start.narrowedTo !== null) {
      wasNarrowed.current = true;
      return;
    }
    if (!wasNarrowed.current) return;
    wasNarrowed.current = false;
    if (refusalStart !== "NARROWED") return;
    setRefusal(null);
    setRefusalStart(null);
  }, [start.narrowedTo, refusalStart]);

  // Task 76 (ask-f7): the language offer of Next is answered by its own pop-up, whose way back reads "Edit my question" and
  // leads to step 1 with the words untouched (the offer comes back on Next with the same words). Use: the rewrite goes in the
  // box (the answers' sentences stay under it) and the lists read it; Keep: the person's words are read as they are.
  const pageLocale: LocaleCode = isLocale(locale) ? locale : "en";
  const languageAtNext = useQuestionLanguageChoice({ catalog: newDebateCatalog, locale: pageLocale, backLabel: t(catalog, "v4.ask.editMyQuestion") });
  const offerAtNext = step === "read" ? start.languageOffer : null;
  const offerShown = useRef<QuestionLanguageOffer | null>(null);
  useEffect(() => {
    if (offerAtNext === null) {
      offerShown.current = null;
      return;
    }
    if (offerShown.current === offerAtNext) return;
    offerShown.current = offerAtNext;
    const offer = offerAtNext;
    void languageAtNext.ensureChoice(offer).then((answer) => {
      if (answer === "EDIT") {
        offerShown.current = null;
        toStepOne();
        return;
      }
      if (answer === "USE") {
        setRewriteLine(offer.proposed_question);
        setAccepted(null);
        setBox((current) => boxOwnWords(current, offer.proposed_question));
      }
      start.chooseLanguage(answer === "USE" ? "USE_REWRITE" : "KEEP_MINE");
    });
  }, [offerAtNext]);

  // Task 76 (ask-f7): the check's refusal from the lists stream opens the check's own screen once, with "Edit my question";
  // closing it (or the help numbers it may lead to) returns to step 1 with the words untouched.
  const refusalAtNext = useQuestionRefusal({ catalog: homeCatalog, locale, countryHint: crisisCountryHint, backLabel: t(catalog, "v4.ask.editMyQuestion") });
  const streamRefusal = step === "read" && start.phase === "REFUSED" ? start.refusal : null;
  const refusalShown = useRef<unknown>(null);
  const refusalFromStream = useRef(false);
  useEffect(() => {
    if (streamRefusal === null || refusalShown.current === streamRefusal) return;
    refusalShown.current = streamRefusal;
    if (refusalAtNext.offer(streamRefusal)) refusalFromStream.current = true;
  }, [streamRefusal]);
  const refusalAtNextOpen = refusalAtNext.dialog !== null;
  useEffect(() => {
    if (refusalAtNextOpen || !refusalFromStream.current) return;
    refusalFromStream.current = false;
    toStepOne();
  }, [refusalAtNextOpen]);

  /**
   * Task 76 (ask-f13): "Use my words instead". The person's own words come back and are read fresh (KEEP_MINE, the hook's
   * one lists post), with new clarifying questions; the rewrite's answers leave the box and are dropped; lines the person
   * typed into the box themselves stay under the original words (ruling: they are the person's words too). Task 76g: a fresh
   * reading, so the rewrite's questions, kept blocks and set-aside lines go too (nothing is carried across).
   */
  function keepOwnWords(): void {
    const words = start.keepMyWords();
    if (words === null) return;
    swapWords.current = null;
    setRewriteLine(null);
    // Task 76e: a fresh reading, so a restored step 2's questions are not seeded any more.
    setRestored(null);
    setAccepted(null);
    setAnswersFolded(false);
    setGoal((current) => ({ ...current, answers: [] }));
    setShown(NOTHING_SHOWN);
    setHeld(NO_HELD);
    setReadLine(words);
    setBox((current) => boxOwnWords(current.placed.reduce((emptied, placed) => boxRemove(emptied, placed.key), current), words));
  }

  /**
   * Task 76e (owner answers Q8 and S1 A; saved-questions spec §3.5; read-f3, read-f23): the restore, which Task 76f calls with the
   * account's copy (Pick up, and a reload on step 2). Step 2 opens exactly as kept: the box, the answers, the clarifying questions
   * as shown (no clarifying call; drawn at once), the reading with its menu, lists and plan (no lists post, no merge; a path still
   * being written takes its joined words), How wide, Quick look or Thorough and the carry-on tick. Step 1 holds the person's words,
   * so Back finds them and "Your paths are kept". The room is read fresh, so a site that now allows fewer paths shows the narrowed
   * line and Start waits until the person combines or removes down to it. Nothing is written to the tab's history here (Task 76f
   * writes its entry). False, and nothing changes, for a kept step 2 the page cannot read (the page then follows Task 76c's rule).
   */
  function restoreStepTwo(given: unknown): boolean {
    const kept = startKeptOf(given);
    if (kept === null) return false;
    const words = keptLineOf(kept);
    const rewrite = kept.check.original_question_line === undefined ? null : kept.readLine;
    setRestored(kept);
    setQuestion(words);
    setReadLine(words);
    setRewriteLine(rewrite);
    setAccepted(null);
    swapWords.current = kept.plan.questionSwap?.original ?? null;
    setAnswersFolded(false);
    setBox(kept.box);
    setGoal(kept.sentGoal);
    setHeld(heldOfKept(kept.box, kept.sentGoal));
    setShown(NOTHING_SHOWN);
    setMode(kept.mode);
    setCarryOn(kept.carryOn);
    setConsented(true);
    clearPressLines();
    setRefusalStart(null);
    setDeclinedAtNext(false);
    setStartedRun(null);
    setStep("read");
    // Review (wave 16): read through the update check, so a read that fails keeps the room before it (and the card with it).
    site.readAgain();
    return true;
  }
  // Task 76e: a kept step 2 handed to the page opens at once, before the browser paints.
  useBrowserLayoutEffect(() => {
    if (keptAtOpen !== null) restoreStepTwo(keptAtOpen);
  }, []);

  /**
   * Task 76f (saved-questions spec §3.5, §3.10): a saved question as Pick up and a reload get it. Its document is checked
   * (SavedQuestionDocSchema) and read into a kept step 2 (another version, or one the page cannot read: UNREADABLE); crisis words
   * in the person's own words open the help screen instead (HELP); else step 2 opens through the restore above, with the level it
   * was read at, the check's language and seats, the id and revision the account answered, and, when the reading no longer
   * verifies (NEEDS_READING), marked to be read again (Back, then Next). Pick up puts step 1's entry behind step 2's (`push`);
   * a reload is already on step 2's entry.
   */
  function openSaved(read: SavedQuestionRead, push: boolean): "OPENED" | "UNREADABLE" | "HELP" {
    const checked = SavedQuestionDocSchema.safeParse(read.doc);
    const kept = checked.success ? keptOfSaved(read.doc as SavedQuestionDoc) : null;
    if (!checked.success || kept === null) return "UNREADABLE";
    const own = savedQuestionOwnWords(read.doc as SavedQuestionDoc);
    if (own.some((words) => detectCrisis(words).crisis) && ask.offerCrisisHelp([...own])) return "HELP";
    const words = keptLineOf(kept);
    if (push) {
      window.history.replaceState(withAskHistory(window.history.state, { step: "ask", words }), "");
      window.history.pushState(withAskHistory(window.history.state, { step: "read", words, savedId: read.id }), "",
        stepTwoAddress(window.location.search));
    } else {
      window.history.replaceState(withAskHistory(window.history.state, { step: "read", words, savedId: read.id }), "");
    }
    const signed = checked.data.reading;
    const level = READING_LEVELS.find((one) => one === signed.reading_level);
    if (level !== undefined) setLevel(level);
    setSavedExtras({ ref: signed.check.ref, language: signed.language ?? null, seats: signed.seats ?? null });
    setSavedId(read.id, read.revision);
    staleOnOpen.current = read.state === "NEEDS_READING" ? kept.check.ref : null;
    return restoreStepTwo(kept) ? "OPENED" : "UNREADABLE";
  }

  /**
   * Task 76f (owner card "Where shown"; spec §3.5): Pick up. The step 2 this page holds goes to the account first; then one read of
   * the saved question, and step 2 opens as it was left, with no AI call (the room is read fresh). Gone: the list is read again.
   * Unreadable: step 1 with its title in the box.
   */
  const pickingUp = useRef(false);
  async function pickUp(id: string): Promise<void> {
    if (pickingUp.current || pendingRef.current !== null) return;
    pickingUp.current = true;
    try {
      await save.flush();
      let read: SavedQuestionRead;
      try {
        read = await contractClient.readSavedQuestion(id);
      } catch (error) {
        if (savedQuestionGone(error)) {
          savedLineFocus(id);
          setSavedListReads((count) => count + 1);
        }
        return;
      }
      if (!alive.current) return;
      if (openSaved(read, true) === "UNREADABLE") {
        const title = savedList?.find((one) => one.id === id)?.question;
        if (title !== undefined) setQuestion(title);
      }
    } finally {
      pickingUp.current = false;
    }
  }

  // Task 76f (owner answer S1 A): a reload on step 2 whose entry names a saved question reopens it from the account, as Pick up
  // does, with no AI call; gone or unreadable (or crisis words), step 1 shows the entry's words and the entry is step 1's again
  // (Task 76c's rule).
  const openSavedNow = useRef(openSaved);
  openSavedNow.current = openSaved;
  useEffect(() => {
    if (reopening === null) return undefined;
    const { id, words } = reopening;
    let live = true;
    void (async () => {
      let read: SavedQuestionRead | null = null;
      try {
        read = await contractClient.readSavedQuestion(id);
      } catch {
        read = null;
      }
      if (!live) return;
      setReopening(null);
      if (read !== null && openSavedNow.current(read, false) === "OPENED") return;
      setQuestion(words);
      window.history.replaceState(withAskHistory(window.history.state, { step: "ask", words }), "",
        stepOneAddress(window.location.pathname, window.location.search));
    })();
    return () => { live = false; };
  }, [reopening]);

  /**
   * Task 76f (spec §3.6): Delete. The line leaves the list at once and the shared Undo note shows for DIG_UNDO_MS; then one DELETE.
   * Undo before it brings the line back and sends nothing; leaving the page meanwhile sends nothing. A DELETE that fails brings
   * the line back (nothing is tried again by itself); one that answers gone takes it out of the list.
   */
  const focusAfterUndo = useRef<string | null>(null);
  // Keyboard audit 2026-11-12 (V4A-2, V4A-3): a Delete's note that goes at the end of its window with focus on its Undo, or a
  // Pick up whose question is gone (its line goes), hands focus to the Pick up of the line now in that place (the one before
  // it at the end of the list), or to the question box once the list is empty; never to step 1 as a whole.
  const deleteAt = useRef(new Map<string, number>());
  const deleteHeld = useRef<string | null>(null);
  const savedFocusAt = useRef<number | null>(null);
  const savedLines = (): HTMLElement[] => [...(stepOne.current?.querySelectorAll<HTMLElement>(".v4NotStartedItem") ?? [])];
  function savedLineFocus(id: string): void {
    const lines = savedLines();
    const at = lines.findIndex((one) => one.dataset.savedId === id);
    if (at >= 0 && lines[at]!.contains(document.activeElement)) savedFocusAt.current = at;
  }
  useEffect(() => {
    const at = savedFocusAt.current;
    if (at === null) return;
    if (!focusIsLost()) {
      // Still on the line (its new read has not come): wait for it; anywhere else, the person has moved on.
      if (!(stepOne.current?.querySelector(".v4NotStarted")?.contains(document.activeElement) ?? false)) savedFocusAt.current = null;
      return;
    }
    savedFocusAt.current = null;
    const lines = savedLines();
    const line = lines[Math.min(at, lines.length - 1)];
    (line?.querySelector<HTMLElement>(".v4NotStartedPickUp") ?? questionField.current)?.focus();
  }, [notStartedItems]);
  function deleteSaved(item: SavedQuestionSummary): void {
    if (waitingDeletes.some((one) => one.item.id === item.id)) return;
    deleteAt.current.set(item.id, Math.max(0, notStartedItems.findIndex((one) => one.id === item.id)));
    setWaitingDeletes((now) => [...now, { item, sendsAt: Date.now() + DIG_UNDO_MS, sent: false }]);
    deleteTimers.current.set(item.id, setTimeout(() => {
      deleteTimers.current.delete(item.id);
      if (deleteHeld.current === item.id) savedFocusAt.current = deleteAt.current.get(item.id) ?? 0;
      deleteAt.current.delete(item.id);
      setWaitingDeletes((now) => now.map((one) => one.item.id === item.id ? { ...one, sent: true } : one));
      void (async () => {
        let gone = true;
        try {
          await contractClient.deleteSavedQuestion(item.id);
        } catch (error) {
          gone = savedQuestionGone(error);
        }
        if (!alive.current) return;
        if (gone) setSavedList((now) => now === null ? now : now.filter((one) => one.id !== item.id));
        setWaitingDeletes((now) => now.filter((one) => one.item.id !== item.id));
      })();
    }, DIG_UNDO_MS));
  }
  function undoDelete(id: string): void {
    const timer = deleteTimers.current.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    deleteTimers.current.delete(id);
    deleteAt.current.delete(id);
    focusAfterUndo.current = id;
    setWaitingDeletes((now) => now.filter((one) => one.item.id !== id));
  }
  // After Undo the line is back; focus goes to its Delete, where it was before the note took it.
  useEffect(() => {
    const id = focusAfterUndo.current;
    if (id === null) return;
    focusAfterUndo.current = null;
    const line = [...(stepOne.current?.querySelectorAll<HTMLElement>(".v4NotStartedItem") ?? [])].find((one) => one.dataset.savedId === id);
    line?.querySelector<HTMLElement>(".v4NotStartedDelete")?.focus();
  }, [waitingDeletes]);

  /**
   * Task 76g (read-f1): "Put it back". The answer comes back under its own question's words, as a block of its own after the new
   * questions, and its sentence goes back in the box as it was (answerSentenceOf). It is one more answer: while Free's cap is
   * reached it waits (the button is muted). When a question on screen already has those very words, the answer goes there instead
   * (one answer per question: as offered when it offers them, else as that question's "Other…" words), in place of its answer.
   */
  function putBack(aside: SetAsideAnswer): void {
    // Review of Task 76g: never past the most answers an ask carries, on any plan (the button is muted then, as for Free's cap).
    if (goalChoiceCount(goal) >= (freePlan ? FREE_GOAL_CHOICES_MAX : GOAL_ANSWERS_MAX)) return;
    const same = questions.find((one) => one.text === aside.question.text);
    const given: V4GoalAnswer = same === undefined || aside.given.other || same.answers.includes(aside.given.answer) ? aside.given
      : { ...aside.given, other: true };
    const kept = same === undefined ? [...shown.kept, aside.question] : shown.kept;
    const order = [...shown.questions, ...kept].map((one) => one.text);
    const answers = [...goal.answers.filter((one) => one.question !== given.question), given];
    setGoal({ ...goal, answers: answers.sort((first, second) => order.indexOf(first.question) - order.indexOf(second.question)) });
    setShown({ ...shown, kept, setAside: shown.setAside.filter((one) => one !== aside) });
    setHeld((current) => new Map(current).set(given.question, { answer: given.answer, other: given.other, text: answerSentenceOf(aside.question, aside.given) }));
  }

  // Task 76 (read-d3, choose-d2): "Make this my question" puts the card's question in place of the words in the box (the
  // sentences stay); Undo puts the words back. The words before the first swap are kept until then.
  const swapWords = useRef<string | null>(null);
  function makeMyQuestion(cardId: string): void {
    const card = plan?.cards.find((one) => one.card_id === cardId);
    if (card === undefined || card.as_question === null) return;
    if (swapWords.current === null) swapWords.current = ownWords(boxWords);
    const words = card.as_question;
    setBox((current) => boxOwnWords(current, words));
  }
  const swap = plan?.questionSwap ?? null;
  useEffect(() => {
    if (swap === null) {
      const before = swapWords.current;
      if (before === null) return;
      swapWords.current = null;
      setBox((current) => boxOwnWords(current, before));
      return;
    }
    setBox((current) => ownWords(boxLine(current)) === swap.question.trim() ? current : boxOwnWords(current, swap.question));
  }, [swap]);

  // Task 76 (choose-f4, choose-f5): "Your paths are ready ↓" while the list landed out of sight (no IntersectionObserver, as in
  // jsdom: out of sight); the note brings row 1 into view and gives it focus, and the answered questions fold (read-d4 A).
  const [firstRowSeen, setFirstRowSeen] = useState(false);
  useEffect(() => {
    if (!start.justLanded) return undefined;
    const row = stepTwo.current?.querySelector(".v4StartList .v4StartRow") ?? null;
    if (row === null || typeof IntersectionObserver !== "function") {
      setFirstRowSeen(false);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => setFirstRowSeen(entries.some((entry) => entry.isIntersecting)));
    observer.observe(row);
    return () => observer.disconnect();
  }, [start.justLanded]);
  function goToFirstPath(): void {
    setAnswersFolded(true);
    const row = stepTwo.current?.querySelector<HTMLElement>(".v4StartList .v4StartRowButton") ?? null;
    row?.scrollIntoView?.({ block: "center" });
    row?.focus();
  }

  // Task 76: the card's look-wider share (choose-f7) and the combine line's share (owner answer Q7, Task 72's handover).
  const widerWidth = plan === null ? null : startWiderWidth(startRoom?.widths ?? null, plan.width, freePlan);
  const widerShare = plan === null || widerWidth === null ? null : startShareChange(startRoom, plan.paths.length, widerWidth);
  const combineLine = plan !== null && plan.selected.length > 0 && (start.phase === "READY" || start.phase === "STALE") ? (
    <V4StartCombineBar plan={plan} catalog={catalog} locale={locale} dispatch={start.dispatch} onRefusal={() => undefined}
      share={startShareChange(startRoom, plan.paths.length, plan.paths.length - 1)} narrow={narrow} />
  ) : null;

  // Task 76c (read-f2, choose-f2; answer Q2 A): what leaving would lose. On step 2's side: an answer picked, words typed in its
  // box beyond the answers' sentences, or paths the person shaped (Task 71's `shaped`); never the question alone, and never a
  // list nobody touched (the server reads the same words again for free for 10 minutes, a reload included).
  function stepTwoAtRisk(): boolean {
    if (readLine === null) return false;
    const sentencesOut = box.placed.reduce((emptied, placed) => boxRemove(emptied, placed.key), box);
    return goal.answers.length > 0 || boxChanged(sentencesOut, rewriteLine ?? readLine) || start.shaped;
  }
  /** Step 1's typed words (journey-d4 A): not words the page filled in itself, nor the words this tab's entry holds (ask-f12). */
  function stepOneAtRisk(): boolean {
    if (step !== "ask" || trimmed.length === 0) return false;
    const held = askHistoryOf(window.history.state);
    const kept = held === null || held.step === "started" ? null : held.words;
    return trimmed !== filledByItself.trim() && trimmed !== initialQuestion.trim() && kept?.trim() !== trimmed && kept !== plain;
  }
  /**
   * Task 76f (owner answer S2 A): while the account keeps the question, step 2 risks only a change not saved yet (on its way, or
   * not landed); while saving is off or stopped (20 kept included), Task 76c's rule.
   */
  function stepTwoLeaveRisk(): boolean {
    return accountKeeps ? changeUnsaved : stepTwoAtRisk();
  }
  useLeaveSiteGuard(() => stepOneAtRisk() || stepTwoLeaveRisk(), leaving);

  /**
   * Task 76c: puts step 2's entry (back) on top of this tab's history; the address says only that it is step 2. Task 76f: with the
   * question the account keeps (a reload then reopens it from the account).
   */
  function pushStepTwo(words: string): void {
    const kept = savedIdRef.current;
    window.history.pushState(withAskHistory(window.history.state, kept === null ? { step: "read", words } : { step: "read", words, savedId: kept }), "",
      stepTwoAddress(window.location.search));
  }

  /** Task 76c: the ⋯ menu, Options sheet or More drawer open on step 2 (the innermost, when one is inside another); null: none. */
  function openOverlay(): HTMLElement | null {
    return [...(stepTwo.current?.querySelectorAll<HTMLElement>(".v4StartMenu, .v4StartSheet, .v4StartMore") ?? [])].at(-1) ?? null;
  }

  /**
   * Task 76c: the browser's Back or Forward moved this tab to another entry. (1) A press waiting out its Undo window:
   * Back is its Undo, so nothing is ever sent, and step 2's entry goes back on top (step 1's "Just answer it" has no step-2
   * entry behind it: Back leaves the page as usual and nothing is sent); from the send until the outcome Back is held: step 2's
   * entry goes back and nothing else changes. (2) On step 2 with a ⋯ menu, the Options sheet or the More drawer open, only that
   * closes, and step 2's entry goes back. (3) Otherwise the page shows what the entry holds: step 1 (its words are the page's
   * own); step 2 as held when the page holds it for those words, else step 1 with them, as a reload would; or a started
   * question's line. Another page's entry is the browser's to show.
   */
  function historyMoved(state: unknown): void {
    const arrived = askHistoryOf(state);
    const waiting = pendingRef.current;
    if (waiting !== null) {
      if (!pendingSent.current) undoPending();
      if (waiting.press !== "quick" && readLine !== null) pushStepTwo(readLine);
      return;
    }
    if (step === "read" && arrived?.step !== "read") {
      const open = openOverlay();
      if (open !== null) {
        open.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        if (readLine !== null) pushStepTwo(readLine);
        return;
      }
    }
    if (arrived === null) return;
    if (arrived.step === "started") {
      setStartedRun(arrived.runId);
      setStep("ask");
      setQuestion("");
      return;
    }
    setStartedRun(null);
    if (arrived.step === "read" && arrived.words === readLine) {
      setStep("read");
      return;
    }
    setStep("ask");
    if (arrived.step === "read") {
      setQuestion(arrived.words);
      window.history.replaceState(withAskHistory(state, { step: "ask", words: arrived.words }), "",
        stepOneAddress(window.location.pathname, window.location.search));
    }
  }
  const historyMovedNow = useRef(historyMoved);
  historyMovedNow.current = historyMoved;
  useEffect(() => {
    const onMove = (event: PopStateEvent): void => historyMovedNow.current(event.state);
    window.addEventListener("popstate", onMove);
    return () => window.removeEventListener("popstate", onMove);
  }, []);

  /**
   * Task 76c (read-f2, choose-f2): the logo names this very page. While something would be lost it asks first, in the page
   * ("Leave this page? The paths the AIs suggested will be lost."); never for the question alone. Stay keeps the page; Leave
   * loads the link's page afresh, without the browser asking again. A click that opens another tab loses nothing.
   */
  function onBrandClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!stepTwoLeaveRisk()) return;
    event.preventDefault();
    brandLink.current = event.currentTarget;
    // Task 76f (owner answer S2 A): while the account keeps the question, the question names the change not saved yet.
    leaveKey.current = accountKeeps ? "v4.ask.leaveUnsaved" : "v4.ask.leavePaths";
    setLeaveAsking(true);
  }
  function stayHere(): void {
    setLeaveAsking(false);
    brandLink.current?.focus();
  }
  function leaveHere(): void {
    const link = brandLink.current;
    setLeaveAsking(false);
    if (link === null) return;
    leaving.current = true;
    loadPage(link.href);
  }
  // Task 76c (read-f2): back on step 1 with the words read and a list held, one line under Next says the paths wait for them.
  const pathsKeptLine = step === "ask" && readLine !== null && plain === readLine && plan !== null
    ? <p className="v4AskHint v4AskPathsKept" role="status">{t(catalog, "v4.ask.pathsKept")}</p>
    : null;

  // ask-d1 / ask-d6 A: the header knows the session from this page, so a signed-out visitor reads "Sign in" at its end (the
  // way back is this page) and a signed-in person the round account button. ask-f6 / journey-f19: no classic link here.
  // V4 start step, Task 75c (owner answer Q15, 5 Nov): the level is chosen only here, for this question (the step-1 level block);
  // the header offers no level change. Task 75d: and shows no level (no menu or label in any header, the owner's 5 Nov answers);
  // Task 76j: so no level is handed to it at all. Task 76c: the logo asks first while something would be lost.
  const header = <V4Header catalog={catalog} session={session} onBrandClick={onBrandClick} />;
  // read-f17: one line, never both: while the room notice says one question already waits, its refusal adds nothing.
  const refusalAlert = refusal === null || (refusalWaits && waitingShown) ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>;
  /**
   * Task 76e: the banner's Reload. Nothing else is sent from the banner. Task 76f (spec §6, risk 12): the latest change goes to the
   * account first, then the page reloads whatever it answered (the reload reopens the last copy that landed, or, with none kept
   * yet, Task 76c's rule).
   */
  async function reloadForUpdate(): Promise<void> {
    await save.flush();
    reloadPage();
  }
  // Task 76e (owner answer Q8): while the site is updated, one line at the top of the page, on step 1 and step 2 (draft wording).
  const updateBanner = site.updated ? (
    <p className="v4AskHint v4AskSiteUpdated" role="status">
      {t(catalog, "v4.ask.siteUpdated")}{" "}
      <button type="button" className="v4Link" onClick={() => void reloadForUpdate()}>{t(catalog, "v4.ask.siteUpdatedReload")}</button>
    </p>
  ) : null;

  // Task 76, step 2's lines. Above the bar (read-f9): the reset line (unless the card already says it) or the room notice, and
  // a refusal at Start, one line each: not while sentence D says it (read-f17), not while the card says a stale reading or the
  // site's new widest (answer Q8).
  const cardSaysQuota = startRoom !== null && start.phase === "NONE" && start.noneLine === "QUOTA";
  const stepTwoRefusal = refusal === null || (refusalWaits && waitingShown) || refusalStart === "STALE"
    || (refusalStart === "NARROWED" && start.narrowedTo !== null) ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>;
  // Task 76b: a press's own lines, one at a time: the plan still unknown after its read at the press (read-f3; step 1: under
  // the buttons), a declined consent at Start (ask-f8: Task 70b's line, "Show it again" pressing the same button again), and
  // after Undo the shared note's confirmation (answer Q13), which goes after a few seconds.
  const planUnknownLine = planUnknown
    ? <p className="v4AskRefusal v4AskPlanUnknown" role="alert">{t(catalog, "v4.ask.planUnknown")}</p>
    : null;
  const declinedAtStartLine = declinedAtStart === null ? null : (
    <p className="v4AskDeclined" role="status">
      {t(catalog, "v4.ask.consentDeclined")}{" "}
      <button type="button" className="v4Link" onClick={() => void pressStart(declinedAtStart)}>{t(catalog, "v4.ask.consentShowAgain")}</button>
    </p>
  );
  const undoneNote = undone ? (
    <V4UndoNote
      state="cancelled"
      label=""
      sendsAt={0}
      durationMs={START_UNDO_MS}
      onUndo={() => undefined}
      undoLabel={t(catalog, "v4.start.undo")}
      stillLine={t(catalog, "v4.undo.still")}
      announce={t(catalog, "v4.start.undo.announce")}
      sendingLine={t(catalog, "v4.ask.starting")}
      confirmedLine={t(catalog, "v4.start.undo.done")}
      takeFocus={false}
    />
  ) : null;
  // Each Delete waiting out its Undo window, in the shared Undo note ("Deleted “…”", Undo, the shrinking
  // line); it goes once the DELETE is sent.
  const deleteNotes = waitingDeletes.filter((one) => !one.sent).map((one) => (
    <V4UndoNote
      key={one.item.id}
      state="counting"
      label={t(catalog, "v4.saved.deleted", { question: one.item.question })}
      sendsAt={one.sendsAt}
      durationMs={DIG_UNDO_MS}
      onUndo={() => undoDelete(one.item.id)}
      onHold={(held) => {
        if (held) deleteHeld.current = one.item.id;
        else if (deleteHeld.current === one.item.id) deleteHeld.current = null;
      }}
      undoLabel={t(catalog, "v4.start.undo")}
      stillLine={t(catalog, "v4.saved.deleteStill")}
      announce={t(catalog, "v4.saved.deleteAnnounce")}
      sendingLine={t(catalog, "v4.saved.deleteStill")}
      confirmedLine={t(catalog, "v4.saved.deleteStill")}
    />
  ));
  // Task 76f (spec §3.3, §3.4): why the account stopped keeping this question, above the bar: changed in another window, 20 already
  // kept, or signed out (the existing line, unless the card already says it); any other refusal stops saving quietly.
  const savedStopKey = save.stopped === "ELSEWHERE" ? "v4.saved.elsewhere" : save.stopped === "FULL" ? "v4.saved.full"
    : save.stopped === "SIGNED_OUT" && start.noneLine !== "SIGNED_OUT" ? "v4.start.none.SIGNED_OUT" : null;
  const savedStopLine = savedStopKey === null ? null : <p className="v4AskHint v4AskSavedStopped" role="status">{t(catalog, savedStopKey)}</p>;
  const stepTwoAbove = (
    <>
      {stepTwoWait === null ? (
        <div id={`${ids}-room2`}>
          <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
        </div>
      ) : cardSaysQuota ? null : <V4MoneyLines lines={[stepTwoWait]} catalog={catalog} />}
      {declinedAtStartLine}
      {planUnknownLine}
      {stepTwoRefusal}
      {savedStopLine}
      {undoneNote}
    </>
  );

  // The map during the Undo window, before any run exists: the question as it is
  // sent and the paths being sent, each being looked into (Start: the plan as it stands, so a combine written meanwhile shows;
  // "Just answer it" at READY: the menu's top paths; otherwise none, and the AIs are choosing). Task 61's tree, read-only (no
  // pick boxes), the question's card selected, no panel and nothing pulsing; the shared note under the question. Task 76i: the
  // drawing is V4PendingMap, which the map page also draws until its first run read (the hand-off below).
  const pendingPaths = useMemo(() => pending === null ? null
    : pendingPathsOf(pending.press === "start" && pending.handsOver ? plan : pending.topPaths), [pending, plan]);
  const pendingMap = useMemo(() => pending === null || pendingPaths === null ? null
    : buildV4PendingMap({ questionLine: pending.line, paths: pendingPaths }), [pending, pendingPaths]);
  /** Task 76i (wait-f14): the paths the map shows now (a combine written during the send included), for the hand-off at STARTED. */
  const shownPendingPaths = useRef(pendingPaths);
  shownPendingPaths.current = pendingPaths;
  const pendingWords = pending === null ? "" : pending.share === null ? t(catalog, "v4.start.undo.noteNoShare")
    : t(catalog, "v4.start.undo.note", { share: t(catalog, pending.share.key, pending.share.values) });
  const pendingView = pending === null || pendingMap === null ? null : (
    <div ref={pendingBox} className="v4AskMain v4AskPendingMap">
      <V4PendingMap
        map={pendingMap}
        catalog={catalog}
        locale={locale}
        rootExtra={(
          <>
            {pendingMap.pending ? <p className="v4RunChoosing" role="status">{t(catalog, "v4.paths.choosing")}</p> : null}
            <V4UndoNote
              state={pendingPhase === "COUNTING" ? "counting" : "sending"}
              label={pendingWords}
              sendsAt={pending.sendsAt}
              durationMs={START_UNDO_MS}
              onUndo={undoPending}
              undoLabel={t(catalog, "v4.start.undo")}
              stillLine={t(catalog, "v4.undo.still")}
              announce={t(catalog, "v4.start.undo.announce")}
              sendingLine={t(catalog, pendingPhase === "WRITING" ? "v4.start.writingWait" : "v4.ask.starting")}
              confirmedLine={t(catalog, "v4.start.undo.done")}
              returnFocus={() => pendingBox.current?.querySelector<HTMLElement>(".v4MapRoot") ?? null}
            />
          </>
        )}
      />
    </div>
  );
  // Task 76h (read-f5, r2-6): the questions' one status line says "No extra questions for this one." when none come; never for
  // crisis words (a later flip of the patterns), whose line then says nothing.
  const clarifyShown = !clarify.waiting && questions.length === 0 && ask.flagsCrisis(clarifyLine ?? "") ? { ...clarify, reply: null } : clarify;
  const stepTwoWhy = [!boxLongEnough && !boxCrisis ? `${ids}-short2` : null, tooLong ? `${ids}-long2` : null]
    .filter((id): id is string => id !== null).join(" ") || undefined;

  // One tree for both steps, so the consent / crisis / language pop-ups stay mounted in one place. During Start's
  // Undo window the map stands in the step's place; the step's state stays in memory, so Undo brings it back as it was.
  return (
    <>
      {header}
      {updateBanner}
      {pendingView !== null ? pendingView : step === "ask" ? (
        <div ref={stepOne} className="v4AskMain">
          {/* Task 76c (choose-f21, answer Q3): the page opened on a started question's entry: one line at the top, with its map. */}
          {startedRun === null ? null : (
            <p className="v4AskStarted" role="status">
              {t(catalog, "v4.ask.started")}{" "}
              <Link className="v4Link" href={`/v4/debate/${encodeURIComponent(startedRun)}`}>{t(catalog, "v4.ask.openItsMap")}</Link>
            </p>
          )}
          {/* journey-f18 / read-f25: the four steps, this one marked. */}
          <V4Steps current="question" shape="line" catalog={catalog} />
          <div ref={stepOneQuestion} className="v4AskQuestion">
            <h1 id={`${ids}-title`} className="v4AskTitle v4Serif">
              <label htmlFor={`${ids}-q`}>{t(catalog, "v4.ask.title")}</label>
            </h1>
            {/* ask-d1: the one grey promise line under the title, for first visits only (its place held until known). */}
            {promise === "NONE" ? null : (
              <p
                className="v4AskPromise v4Muted"
                {...(promise === "HOLD" ? { "aria-hidden": "true" as const, style: { visibility: "hidden" as const } } : {})}
              >
                {t(catalog, "v4.ask.promise")}
              </p>
            )}
            {usedUp === null ? null : (
              <p id={`${ids}-usedup`} className="v4AskUsedUp" role="status">{t(catalog, usedUp.key, usedUp.values)}</p>
            )}
            <textarea
              ref={questionField}
              id={`${ids}-q`}
              className="v4AskField v4AskFieldGrow"
              rows={3}
              dir="auto"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                // ask-f14: the red "nothing was started" line was about the words before; new words clear it.
                if (refusal !== null) setRefusal(null);
              }}
              onKeyDown={pressOnEnter}
              onFocus={() => setBoxFocused(true)}
              onBlur={() => setBoxFocused(false)}
              placeholder={t(catalog, "v4.ask.questionPlaceholder")}
              aria-labelledby={`${ids}-title`}
              aria-describedby={stepOneWhy}
            />
            {reasonKey === null ? null : (
              <p id={`${ids}-why`} className="v4AskHint v4Muted v4AskWhy">{t(catalog, reasonKey)}</p>
            )}
          </div>

          {/* Task 75d (owner, 5 Nov, second round): the level choice is on every first screen, starting on Plain words; nothing is
              held while an account answers, for no account level is read. */}
          <fieldset className="v4AskLevels">
            <legend className="v4AskLegend">{t(catalog, "v4.ask.levelLegend")}</legend>
            {/* ask-f15: one choice of three (native radios: arrow keys move and choose, in either writing direction); Task 75b
                (ask-d2): the three pills in one row. */}
            <div className="v4AskChips v4AskLevelRow">
              {READING_LEVELS.map((option) => (
                <label key={option} className="v4Chip v4AskLevelChip" data-checked={option === level}>
                  <input
                    type="radio"
                    className="v4AskLevelInput"
                    name={`${ids}-level`}
                    value={option}
                    checked={option === level}
                    onChange={() => pickLevel(option)}
                  />
                  <span>{t(catalog, `v4.readingLevel.${option}`)}</span>
                </label>
              ))}
            </div>
            {/* Task 75b (ask-d2): one changing sentence, with no label box. */}
            <p className="v4AskSample" aria-live="polite">{t(catalog, SHOWS_KEYS[level])}</p>
            {/* Task 75b (owner answer Q15, 5 Nov): the level belongs to this question, one grey line says so; "What does it
                change?" opens the honest note in place, and closes it again. */}
            <p className="v4AskHint v4Muted v4AskLevelKept">
              {t(catalog, "v4.ask.levelKept")}{" "}
              <button
                type="button"
                className="v4Link v4AskLevelWhat"
                aria-expanded={levelWhatOpen}
                aria-controls={`${ids}-honest`}
                onClick={() => setLevelWhatOpen((open) => !open)}
              >
                {t(catalog, "v4.ask.levelWhat")}
              </button>
            </p>
            {levelWhatOpen ? <p id={`${ids}-honest`} className="v4AskHint v4Muted">{t(catalog, "v4.ask.levelHonest")}</p> : null}
          </fieldset>

          {/* Task 75b (ask-d2 A, journey-d3 A): step 1's buttons through the bottom bar. On a phone Next sits pinned at the bottom
              like Start, with the Free notice and the lines under Next; on a computer it is one plain row under the level block.
              ask-d1 A, until the start-step's sign-in panel: signed out, both go to sign in, with the way back to this page. */}
          <V4StartBar
            job="NEXT"
            catalog={catalog}
            locale={locale}
            freePlan={ask.planIsFree}
            narrow={narrow}
            textFocused={boxFocused}
            helpFirst={!signedOut && helpFirst}
            publicNotice={publicNotice}
            next={signedOut
              ? { label: t(catalog, "v4.ask.continue"), disabled: false, busy: false, describedBy: `${ids}-signin`, href: signInHref,
                linkRef: signInNext, onPress: (event) => { if (event !== undefined) helpBeforeSignIn(event as MouseEvent<HTMLAnchorElement>); } }
              // Task 70b: busy and still "Next" while the consent window is open, "Reading…" once it is given.
              : { label: nextPress === "READING" ? t(catalog, "v4.ask.reading")
                : gettingReady ? t(catalog, "v4.ask.gettingReady") : t(catalog, "v4.ask.continue"),
              disabled: nextGreyed, busy: nextPress !== "IDLE", ...(stepOneWhy === undefined ? {} : { describedBy: stepOneWhy }),
              onPress: () => void goOn() }}
            justAnswer={signedOut
              ? { shown: true, ready: true, describedBy: `${ids}-signin`, href: signInHref,
                onPress: (event) => { if (event !== undefined) helpBeforeSignIn(event as MouseEvent<HTMLAnchorElement>); } }
              // Task 76b (read-f3): "Checking your plan…" while its press reads a plan still unknown.
              : { shown: true, ready: !justGreyed, busy: checkingPlan === "quick", ...(stepOneWhy === undefined ? {} : { describedBy: stepOneWhy }),
                label: checkingPlan === "quick" ? t(catalog, "v4.ask.checkingPlan")
                  : gettingReady ? t(catalog, "v4.ask.gettingReady") : t(catalog, "v4.ask.justAnswer"),
                onPress: justAnswer }}
            // ask-f8: after a declined consent, right under Next, in normal text; "Show it again" is a fresh press of Next.
            // Task 76c (read-f2): after Back, "Your paths are kept. Press Next to see them." right under Next too.
            declined={<>
              {!signedOut && declinedAtNext ? (
                <p className="v4AskDeclined v4AskUnderNext" role="status">
                  {t(catalog, "v4.ask.consentDeclined")}{" "}
                  <button type="button" className="v4Link" onClick={() => void goOn()}>{t(catalog, "v4.ask.consentShowAgain")}</button>
                </p>
              ) : null}
              {pathsKeptLine}
            </>}
            // r2-4: the grey quota line under Next, on every visit; signed out, the sign-in line. Task 76b (read-f3): a plan
            // still unknown after the press's read says so here, under the buttons.
            under={signedOut
              ? <p id={`${ids}-signin`} className="v4AskHint v4Muted v4AskSignInFirst">{t(catalog, "v4.ask.signInFirst")}</p>
              : <>{planUnknownLine}<p className="v4AskHint v4Muted v4AskQuotaNote v4AskUnderNext">{t(catalog, "v4.ask.readingUsesQuota")}</p></>}
            above={<>{stepOneRoomLines}{refusalAlert}{undoneNote}</>}
          />

          {/* Task 76f (owner card "Where shown"; answer S3 A): the questions the account keeps, under the question box and its
              lines and above "Your maps", newest first, with Pick up and Delete; then any Delete's shared Undo note. */}
          {listOffered ? (
            <V4NotStarted items={notStartedItems} locale={locale} catalog={catalog} onPickUp={(id) => void pickUp(id)} onDelete={deleteSaved} />
          ) : null}
          {deleteNotes}
          {firstVisit ? <V4MapSeed question={question} catalog={catalog} /> : null}
          {/* Task 75d: no level rides the shelf's links; each map shows its debate at its own level (Task 76j: none is handed). */}
          <V4MapShelf load={shelf.load} catalog={catalog} locale={locale} />
        </div>
      ) : (
        <div
          ref={stepTwo}
          className="v4AskMain v4AskMainRead"
          // read-f9: while an input or textarea on step 2 has focus, the bar steps back into the page (answer buttons never count).
          onFocus={(event) => setTextFocused(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)}
          onBlur={() => setTextFocused(false)}
        >
          <div>
            <button type="button" className="v4Link v4AskBack" onClick={toStepOne}>
              <span aria-hidden="true">‹ </span>{t(catalog, "v4.common.back")}
            </button>
          </div>
          <section className="v4Card v4AskCard" aria-labelledby={`${ids}-read`}>
            <h1 id={`${ids}-read`} ref={readHeading} tabIndex={-1} className="v4AskReadTitle v4Serif">
              {t(catalog, "v4.read.title")}
            </h1>

            <div className="v4AskBlock">
              <label id={`${ids}-q2label`} className="v4AskLabel" htmlFor={`${ids}-q2`}>
                {t(catalog, "v4.read.questionLabel")}
              </label>
              {/* Task 70b (read-d2): the box starts as the line read at Next; what is typed here joins it and is never read again.
                  Task 76 (read-d3): the answers' sentences live here too; the box shows its text exactly as typed (a trailing line
                  break stays: the wave-3 review), and Start sends it tidied (boxLine). Typing over a sentence unticks its answer. */}
              <textarea
                ref={boxField}
                id={`${ids}-q2`}
                className={boxFlash ? "v4AskField v4AskFieldSmall v4Highlight" : "v4AskField v4AskFieldSmall"}
                rows={2}
                dir="auto"
                value={box.text}
                onChange={(event) => {
                  const next = boxTyped(box, event.target.value);
                  const dropped = boxDropped(box, next);
                  setBox(next);
                  if (dropped.length > 0) {
                    setGoal((current) => ({ ...current, answers: current.answers.filter((given) => !dropped.includes(given.question)) }));
                    // Task 76g: a held sentence typed over is the person's now; ticking the answer again gives its own sentence.
                    setHeld((current) => withoutHeld(current, dropped));
                  }
                }}
                aria-labelledby={`${ids}-q2label`}
                aria-describedby={stepTwoWhy}
              />
              {!boxLongEnough && !boxCrisis ? (
                <p id={`${ids}-short2`} className="v4AskHint v4Muted">{t(catalog, "v4.ask.tooShort")}</p>
              ) : null}
              {tooLong ? <p id={`${ids}-long2`} className="v4AskRefusal" role="alert">{t(catalog, "v4.read.tooLong")}</p> : null}
              {/* ask-f13: while a rewrite of Next is in force, the person's own words are one small link away. */}
              {rewriteLine === null ? null : (
                <p className="v4AskHint v4AskUseMine">
                  <button type="button" className="v4Link" onClick={keepOwnWords}>{t(catalog, "v4.ask.useMyWords")}</button>
                </p>
              )}
            </div>

            {/* Task 76h (read-f5, read-f8, read-f15, read-f23, ask-d3): the questions' one status line, the wait and its held rows,
                the questions (the answered ones fold once a path is used, read-d4 A) and Free's joined line. Task 76e: a restored
                step 2's seed is drawn as seeded; any other reply this page already holds draws at once by itself (the block never
                waited for it). Task 76g (read-f1): the
                answers a new reading kept under their own question's words are blocks after its questions, the ones it set aside
                are lines where their question was, and a reading that brought nothing back leaves the earlier questions as they were. */}
            <V4AskQuestions
              clarify={clarifyShown}
              questions={questions}
              goal={goal}
              planIsFree={freePlan}
              seeded={clarifySeed !== undefined}
              onAnswer={answerQuestion}
              fold={{ folded: answersFolded, onShow: () => setAnswersFolded(false) }}
              setAside={shown.setAside}
              onPutBack={putBack}
              quiet={shown.quiet}
              catalog={catalog}
              newDebateCatalog={newDebateCatalog}
              locale={locale}
            />
          </section>

          {/* Spec §2 item 2: "What we'll look into", under the questions; none when the room has no start step. */}
          {startRoom === null ? null : (
            <V4StartCard
              start={start}
              widths={startRoom.widths}
              freePlan={freePlan}
              catalog={catalog}
              locale={locale}
              offerIfCrisis={(text) => ask.offerCrisisHelp([text])}
              onMakeMyQuestion={makeMyQuestion}
              questionsShown={questions.length > 0}
              quotaLine={stepTwoWait}
              narrow={narrow}
              share={{ wider: widerShare }}
              onPathsUsed={() => setAnswersFolded(true)}
              // Task 76e (owner, 4 Nov, "Hide the old line"): while the update banner shows, only the banner speaks. Task 76f (owner
              // answer S1 A): nor while the account keeps the question, since a reload then reopens step 2 from the account.
              hideReloadLine={site.updated || accountKeeps}
            />
          )}

          <V4StartBar
            catalog={catalog}
            locale={locale}
            freePlan={freePlan}
            level={level}
            widths={startRoom?.widths ?? null}
            width={start.width}
            onWidth={(width) => { start.dispatch({ type: "SET_WIDTH", width }); }}
            mode={mode}
            onMode={setMode}
            pathCount={startRoom === null ? null : plan?.paths.length ?? start.width}
            sharePercent={start.sharePercent}
            shareDelta={start.shareDelta}
            state={barState}
            onStart={() => void pressStart("PERSON")}
            justAnswer={{ shown: !start.shaped, ready: barState === "READY", onPress: () => void pressStart("AIS") }}
            carryOnOffered={carryOnOffered}
            carryOn={carryOn}
            onCarryOn={setCarryOn}
            readyNote={start.justLanded && !firstRowSeen}
            onReadyNote={goToFirstPath}
            publicNotice={publicNotice}
            above={stepTwoAbove}
            combineLine={combineLine}
            narrow={narrow}
            textFocused={textFocused}
            helpFirst={helpFirstTwo}
          />
        </div>
      )}
      {ask.dialogs}
      {languageAtNext.dialog}
      {refusalAtNext.dialog}
      {leaveAsking ? (
        <V4LeaveQuestion question={t(catalog, leaveKey.current)} onStay={stayHere} onLeave={leaveHere} catalog={catalog} />
      ) : null}
    </>
  );
}
