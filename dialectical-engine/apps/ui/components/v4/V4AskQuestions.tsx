"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { AskClarifyResponse, ClarifyQuestion } from "@debateai/contract";
import { V4StartAnswersFold } from "@/components/v4/V4StartCard";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { answerCounts, FREE_GOAL_CHOICES_MAX, GOAL_ANSWERS_MAX, goalChoiceCount } from "@/lib/v4/askText";
import {
  ASK_CLARIFY_STILL_MS, ASK_CLARIFY_USUAL_TOP_MS, CLARIFY_HELD_ROWS, clarifyArrivalDelays, clarifyWaitLineAt, type ClarifyWaitLine
} from "@/lib/v4/clarifyWait";
import { PATH_PLAN_LIMITS } from "@/lib/v4/pathPlan";
import type { V4Goal, V4GoalAnswer } from "@/lib/v4/types";

/*
 * V4 start step, Task 76h (4 Nov night: ask-d3, read-f5, read-f8, read-f15, read-f23; the owner's cards "Add these as extra
 * moves" and "As picked, on measured time"): step 2's clarifying questions, moved here from V4AskClient's ClarifyBlock.
 * - One status line (read-f5) stays for the whole of step 2, right under the question box, and only its words change: the
 *   wait's line; once, when questions arrive, the section's title (heard, not seen: the heading shows it); or "No extra
 *   questions for this one." (seen).
 * - The wait (ask-d3): "Analyzing your question…" over a thin moving line (three stepping dots with less motion), "Still
 *   analyzing. Your words are still here." from 6 s, and only past the MEASURED usual time "This is taking longer than usual.
 *   You can wait, or try again." with a free "Try again" right after the line.
 * - Two pale held rows (read-f23) keep the questions' place; the first questions take them top first, each later one slides
 *   up into place (two extra moves beside the six, each on its own token, under 0.5 s); an unused row folds shut. With less
 *   motion everything changes at once and the block takes the 1-second highlight. A reply not waited for draws at once.
 * - "Other…" puts the cursor in its line (read-f15). Free's cap (read-f8) counts only real answers, says so in one still line
 *   under the title, and keeps every button reachable: muted, described by that line, a press changing nothing.
 * V4 start step, Task 76g (read-f1): after a new reading, an answer kept under its own question's words (typed, or put back) is
 * one more block after the new questions (the page passes it among `questions`); an answer the reading set aside is one line where
 * its question was, "Set aside: To 2035 · Put it back", whose button counts in Free's cap and waits, muted, like any answer. A
 * reading that brought nothing back keeps the earlier questions on screen as they were (`quiet`): no arrival, and the status line
 * says nothing new.
 * Nothing here is kept in the browser.
 */

/** Task 76g (read-f1): an answer a new reading set aside, with its question and its place in the earlier list. */
export type SetAsideAnswer = Readonly<{ given: V4GoalAnswer; question: ClarifyQuestion; at: number }>;

/** The longest answer a person types under "Other". */
const OTHER_MAX = 120;
/** The arrival's look stays this long after the last question starts to move (with less motion: the 1-second highlight). */
const ARRIVAL_SHOWN_MS = 1_000;
/** A folding held row goes once its fold ends; at the latest after this (a page hidden meanwhile never ends a transition). */
const HELD_FOLD_LATEST_MS = 1_000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The wait's three lines (ask-d3; the owner's words). */
const WAIT_KEYS: Readonly<Record<ClarifyWaitLine, string>> = Object.freeze({
  ANALYZING: "v4.read.clarifyWaiting",
  STILL: "v4.read.clarifyStill",
  LONGER: "v4.read.clarifyLonger"
});

/** useLayoutEffect in the browser, useEffect on the server (which has no layout). */
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function lessMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** The held rows from `from` up to CLARIFY_HELD_ROWS (the ones no question took). */
function rowsFrom(from: number): readonly number[] {
  const rows: number[] = [];
  for (let row = from; row < CLARIFY_HELD_ROWS; row += 1) rows.push(row);
  return rows;
}

/** One question's arrival: revealed in a held row's place, or sliding in after them; its delay from the reply. */
type Move = Readonly<{ delayMs: number; held: boolean }>;

/** read-f23: one pale row holding a question's place (a short grey bar and three pill outlines); it folds shut when unused. */
function HeldRow({ folding, onFolded }: Readonly<{ folding: boolean; onFolded(): void }>) {
  const row = useRef<HTMLDivElement>(null);
  const folded = useRef(onFolded);
  folded.current = onFolded;
  useEffect(() => {
    const element = row.current;
    if (!folding || element === null) return undefined;
    const ended = (event: Event): void => {
      if (event.target === element) folded.current();
    };
    element.addEventListener("transitionend", ended);
    const latest = setTimeout(() => folded.current(), HELD_FOLD_LATEST_MS);
    return () => {
      element.removeEventListener("transitionend", ended);
      clearTimeout(latest);
    };
  }, [folding]);
  return (
    <div ref={row} className={folding ? "v4AskHeldRow v4AskHeldFold" : "v4AskHeldRow"} aria-hidden="true">
      <div className="v4AskHeldInner">
        <span className="v4AskHeldBar" />
        <span className="v4AskHeldPills">
          <span className="v4AskHeldPill" />
          <span className="v4AskHeldPill" />
          <span className="v4AskHeldPill" />
        </span>
      </div>
    </div>
  );
}

/**
 * Decision 29: one clarifying question, in the look the fixed buttons had: its label, its answers as chips, then "Other" with
 * a line to type on. Task 76h: "Other…" puts the cursor in its line (never on a restore), and Free's cap mutes what would be
 * a fourth answer without taking it out of the keyboard's order.
 */
function QuestionBlock({ question, given, full, capId, move, onChange, inputId, otherLabel, otherInputLabel }: Readonly<{
  question: ClarifyQuestion;
  given: V4GoalAnswer | undefined;
  /** Free's cap (or, on any plan, the most answers an ask carries) is reached: only a question already answered (with words) can still change. */
  full: boolean;
  capId: string;
  /** Its arrival, while it plays; null: none. */
  move: Move | null;
  /** Task 76: `from`, the answer's own button when it was tapped (the fly-in starts there). */
  onChange(next: V4GoalAnswer | null, from?: HTMLElement): void;
  inputId: string;
  otherLabel: string;
  otherInputLabel: string;
}>) {
  const labelId = `${inputId}-label`;
  const open = given?.other === true;
  // read-f8: an "Other…" with no words counts nothing, so its question's answers would be a fourth.
  const capped = full && (given === undefined || !answerCounts(given));
  const otherField = useRef<HTMLInputElement>(null);
  const focusOther = useRef(false);
  useBrowserLayoutEffect(() => {
    if (!open || !focusOther.current) return;
    focusOther.current = false;
    otherField.current?.focus();
  }, [open]);
  const muted = (isMuted: boolean) => (isMuted
    ? { "aria-disabled": true as const, "aria-describedby": capId, className: "v4Chip v4ChipMuted" }
    : { className: "v4Chip" });
  // read-f8 (ruling): an open "Other…" line with no words takes no typing while the cap is reached, as the muted buttons take no press.
  const locked = given !== undefined && given.other && full && !answerCounts(given);
  return (
    <div
      className={move === null ? "v4AskBlock" : move.held ? "v4AskBlock v4AskReveal" : "v4AskBlock v4AskArrive"}
      style={move === null ? undefined : { animationDelay: `${move.delayMs}ms` }}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="v4AskLabel" dir="auto" data-ai-generated="true">{question.text}</span>
      <div className="v4AskChips">
        {question.answers.map((answer) => {
          const pressed = given !== undefined && !given.other && given.answer === answer;
          const waits = capped && !pressed;
          return (
            <button
              key={answer}
              type="button"
              {...muted(waits)}
              dir="auto"
              aria-pressed={pressed}
              onClick={(event) => {
                if (waits) return;
                onChange(pressed ? null : { question: question.text, answer, other: false }, event.currentTarget);
              }}
            >
              {answer}
            </button>
          );
        })}
        <button
          type="button"
          {...muted(capped && !open)}
          aria-pressed={open}
          onClick={() => {
            if (capped && !open) return;
            if (!open) focusOther.current = true;
            onChange(open ? null : { question: question.text, answer: "", other: true });
          }}
        >
          {otherLabel}
        </button>
      </div>
      {given?.other === true ? (
        <div className="v4AskInline">
          <label className="v4AskLabelSmall" htmlFor={inputId}>{otherInputLabel}</label>
          <input
            ref={otherField}
            id={inputId}
            className="v4AskInput"
            type="text"
            dir="auto"
            value={given.answer}
            maxLength={OTHER_MAX}
            readOnly={locked}
            {...(locked ? { "aria-describedby": capId } : {})}
            onChange={(event) => {
              if (locked) return;
              onChange({ question: question.text, answer: event.target.value, other: true });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Task 76h: step 2's clarifying questions, under the question box: the one status line, the wait, the held rows, the
 * questions (with read-d4 A's fold of the answered ones) and Free's joined line.
 */
export function V4AskQuestions({
  clarify, questions, goal, planIsFree, seeded, onAnswer, fold, setAside = [], onPutBack, quiet = false, catalog, newDebateCatalog
}: Readonly<{
  /** The clarifying call (useAskClarify): its reply, whether the page waits for it and since when, and a fresh ask of the same line. */
  clarify: Readonly<{ reply: AskClarifyResponse | null; waiting: boolean; startedAt: number | null; retry(): void }>;
  questions: readonly ClarifyQuestion[];
  goal: V4Goal;
  /** read-f3: only a plan the server named Free is capped. */
  planIsFree: boolean;
  /** A reply not waited for (Task 76e's and 76f's restore): drawn at once, with no held rows, no wait words and no move. */
  seeded: boolean;
  /** `from`: the tapped answer's own button (Task 76's fly-in starts there). */
  onAnswer(question: ClarifyQuestion, next: V4GoalAnswer | null, from?: HTMLElement): void;
  /** read-d4 A (Task 73's fold, wired by Task 76): the answered questions fold into one line once a path is used. */
  fold?: Readonly<{ folded: boolean; onShow(): void }>;
  /** Task 76g (read-f1): the answers the last new reading set aside, each drawn where its question was (clamped to the end). */
  setAside?: readonly SetAsideAnswer[];
  /** Task 76g: "Put it back" (never while Free's cap is reached: it waits, muted). */
  onPutBack?(answer: SetAsideAnswer): void;
  /** Task 76g: the new reading brought nothing back and the earlier questions stay as they were: drawn at once, nothing new said. */
  quiet?: boolean;
  catalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  locale: string;
}>) {
  const ids = useId();
  const capId = `${ids}-cap`;
  const less = lessMotion();
  const waiting = clarify.waiting && !seeded;
  const shown = !waiting && clarify.reply !== null && questions.length > 0;
  const none = !waiting && clarify.reply !== null && questions.length === 0;

  // read-f23 / ask-d3: the questions arrive only right after a wait this block showed; a reply it never waited for (one the page
  // already held, or a seed) draws at once. The rows no question takes fold shut; with less motion they simply go.
  const [lastWaiting, setLastWaiting] = useState(waiting);
  const [arrival, setArrival] = useState<Readonly<{ reply: AskClarifyResponse; less: boolean; shownMs: number }> | null>(null);
  const [folding, setFolding] = useState<readonly number[]>([]);
  if (lastWaiting !== waiting) {
    setLastWaiting(waiting);
    // Task 76g: questions kept from before a reading that brought nothing back do not arrive again.
    if (!waiting && !seeded && !quiet && clarify.reply !== null && questions.length > 0) {
      const last = less ? 0 : clarifyArrivalDelays(questions.length).at(-1)?.delayMs ?? 0;
      setArrival({ reply: clarify.reply, less, shownMs: last + ARRIVAL_SHOWN_MS });
      setFolding(less ? [] : rowsFrom(Math.min(questions.length, CLARIFY_HELD_ROWS)));
    } else {
      setArrival(null);
      setFolding([]);
    }
  }
  useEffect(() => {
    if (arrival === null) return undefined;
    const timer = setTimeout(() => setArrival(null), arrival.shownMs);
    return () => clearTimeout(timer);
  }, [arrival]);
  const arriving = arrival !== null && arrival.reply === clarify.reply && shown ? arrival : null;
  const moves = arriving === null || arriving.less ? null : clarifyArrivalDelays(questions.length);

  // ask-d3: the wait's words follow the time waited, from when the wait began (a fresh "Try again" keeps that time).
  const [, setTick] = useState(0);
  const elapsed = waiting && clarify.startedAt !== null ? Math.max(0, Date.now() - clarify.startedAt) : 0;
  const waitLine = clarifyWaitLineAt(elapsed, ASK_CLARIFY_USUAL_TOP_MS);
  useEffect(() => {
    const since = clarify.startedAt;
    if (!waiting || since === null) return undefined;
    const usualTop = ASK_CLARIFY_USUAL_TOP_MS;
    const passed = Math.max(0, Date.now() - since);
    const marks = [ASK_CLARIFY_STILL_MS, ...(usualTop === null ? [] : [Math.max(usualTop, ASK_CLARIFY_STILL_MS) + 1])]
      .filter((mark) => mark > passed);
    if (marks.length === 0) return undefined;
    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.min(...marks) - passed);
    return () => clearTimeout(timer);
  }, [waiting, clarify.startedAt, waitLine]);

  // read-f5: the one line's words, and how it shows (the title is heard only; nothing to say is heard as nothing). Task 76g: after
  // a reading that brought nothing back, the earlier questions stay and the line says nothing new.
  const says = waiting ? WAIT_KEYS[waitLine] : quiet && shown ? null : shown ? "v4.read.optionalTitle" : none ? "v4.read.noQuestions" : null;
  const lineClass = waiting ? "v4AskHint v4Muted" : none ? "v4AskHint v4Muted v4AskNoQuestions" : "v4SrOnly";

  // read-f8: Free's cap counts only real answers. Review of Task 76g: on every plan the answers stop at the most an ask carries
  // (GOAL_ANSWERS_MAX); kept blocks and "Put it back" can put more questions on screen than that. On a paid plan the cap line
  // shows only while something waits on it (a question with no real answer, or a set-aside line), so five questions all
  // answered say nothing.
  const cap = planIsFree ? FREE_GOAL_CHOICES_MAX : GOAL_ANSWERS_MAX;
  const full = goalChoiceCount(goal) >= cap;
  const capWaits = full && (planIsFree || setAside.length > 0
    || questions.some((shownQuestion) => !goal.answers.some((given) => given.question === shownQuestion.text && answerCounts(given))));
  const answered = questions.filter((shownQuestion) => goal.answers.some((given) => given.question === shownQuestion.text));
  const folded = fold?.folded === true && answered.length > 0;
  const block = (question: ClarifyQuestion) => {
    const at = questions.indexOf(question);
    return (
      <QuestionBlock
        key={question.text}
        question={question}
        given={goal.answers.find((given) => given.question === question.text)}
        full={full}
        capId={capId}
        move={moves?.[at] ?? null}
        onChange={(next, from) => onAnswer(question, next, from)}
        inputId={`${ids}-other-${at}`}
        otherLabel={t(newDebateCatalog, "newDebate.askText.otherAnswer")}
        otherInputLabel={t(newDebateCatalog, "newDebate.askText.otherLabel")}
      />
    );
  };
  const held = waiting ? rowsFrom(0) : folding;
  // Task 76g (read-f1): one line per answer set aside, "Set aside: To 2035 · Put it back". Putting it back is one more answer, so
  // while Free's cap is reached the button waits, muted, described by the cap line, and a press changes nothing.
  const asideLine = (aside: SetAsideAnswer) => (
    <p key={`aside:${setAside.indexOf(aside)}`} className="v4AskHint v4AskSetAside">
      <span dir="auto">{t(catalog, "v4.read.setAside", { answer: aside.given.answer })}</span>
      <span aria-hidden="true"> · </span>
      <button
        type="button"
        className="v4Link v4AskPutBack"
        {...(full ? { "aria-disabled": true as const, "aria-describedby": capId } : {})}
        onClick={() => {
          if (full) return;
          onPutBack?.(aside);
        }}
      >
        {t(catalog, "v4.read.putBack")}
      </button>
    </p>
  );
  // Each set-aside line goes where its question was in the earlier list, clamped to the end.
  const withAsides = (list: readonly ClarifyQuestion[]) => [
    ...list.flatMap((question, at) => [
      ...setAside.filter((aside) => Math.min(aside.at, list.length) === at).map(asideLine),
      block(question)
    ]),
    ...setAside.filter((aside) => aside.at >= list.length).map(asideLine)
  ];

  return (
    <>
      <div className={waiting || none ? "v4AskClarifyStatus" : "v4AskClarifyStatus v4AskClarifyStatus--quiet"}>
        <p className={lineClass} role="status">{says === null ? "" : t(catalog, says)}</p>
        {waiting && waitLine === "LONGER" ? (
          <button type="button" className="v4Link v4AskTryAgain" onClick={() => clarify.retry()}>{t(catalog, "v4.read.clarifyTryAgain")}</button>
        ) : null}
        {!waiting ? null : less ? (
          <span className="v4AskWaitDots" aria-hidden="true">
            <span className="v4AskWaitDot" />
            <span className="v4AskWaitDot" />
            <span className="v4AskWaitDot" />
          </span>
        ) : <span className="v4AskWaitLine" aria-hidden="true" />}
      </div>
      {shown ? (
        <div className={arriving?.less === true ? "v4AskQuestions v4Highlight" : "v4AskQuestions"}>
          <h2 className="v4AskSubTitle">
            {t(catalog, "v4.read.optionalTitle")} <span className="v4Muted v4AskOptional">{t(catalog, "v4.read.optionalNote")}</span>
          </h2>
          {/* chat-one-place-for-answers: the note stays, under the questions' heading. */}
          <p className="v4AskHint v4Muted v4AskHonest">{t(catalog, "v4.read.honestNote")}</p>
          {/* read-f8: one still line under the title once Free's cap is reached; no dots, no counter. */}
          {capWaits ? <p id={capId} className="v4AskHint v4AskCapLine">{t(catalog, "v4.read.capReached", { count: cap })}</p> : null}
          <V4StartAnswersFold folded={folded} onShow={() => fold?.onShow()} catalog={catalog}>
            {folded ? answered.map(block) : withAsides(questions)}
          </V4StartAnswersFold>
          {/* Task 76g: with the answered questions folded, the set-aside lines follow the questions still open. */}
          {folded ? [...questions.filter((question) => !answered.includes(question)).map(block), ...setAside.map(asideLine)] : null}
          {/* Answer Q4: no "what matters most" box; decision 2: no own-angle box (an own angle is a path at the choosing step). */}
        </div>
      ) : null}
      {held.length === 0 ? null : (
        <div className="v4AskHeld" aria-hidden="true">
          {held.map((row) => (
            <HeldRow key={row} folding={!waiting} onFolded={() => setFolding((rows) => rows.filter((one) => one !== row))} />
          ))}
        </div>
      )}
      {/* choose-f15 / read-f8: Free's one joined line, only once the questions are on screen. */}
      {planIsFree && shown ? (
        <p className="v4AskHint v4Muted v4AskFreeJoined">
          {t(catalog, "v4.read.freeJoined", { count: FREE_GOAL_CHOICES_MAX, paths: PATH_PLAN_LIMITS.freePathsMax })}
        </p>
      ) : null}
    </>
  );
}
