"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { askQuestionMaxBytes, type ClarifyQuestion } from "@debateai/contract";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4AskGate, type V4Session } from "@/components/v4/V4AskGate";
import { V4MoneyLines } from "@/components/v4/V4DigSuggest";
import { V4Header } from "@/components/v4/V4Header";
import { V4MapSeed } from "@/components/v4/V4MapSeed";
import { SHELF_MAX, useMapShelf, V4MapShelf } from "@/components/v4/V4MapShelf";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import {
  answersStillAsked, clarifyingQuestions, composeQuestion, FREE_GOAL_CHOICES_MAX, goalChoiceCount, goalWithinPlan, purposeLinesOfGoal
} from "@/lib/v4/askText";
import { startShareLine, startsWaitLine, usedUpLine, type MoneyLine } from "@/lib/v4/money";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import {
  DIG_MODES,
  EMPTY_GOAL,
  READING_LEVELS,
  type DigMode,
  type ReadingLevel,
  type V4Goal,
  type V4GoalAnswer
} from "@/lib/v4/types";
import { useAskAgain } from "@/lib/v4/useAskAgain";
import { useAskClarify } from "@/lib/v4/useAskClarify";
import { useLeaveSiteGuard } from "@/lib/v4/useLeaveGuard";
import { useV4Ask } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (spec "/v4 — D1 Ask + D2 How we read your question", row D decisions 5 and 10). D1: the question and,
 * once, the reading level. D2 (decision 29, dynamic): a small AI's clarifying questions, all optional, then EXACTLY the
 * text the AIs will get (composeQuestion), so nothing is hidden. The ask itself is V3's, through useV4Ask (consent, crisis help, room, question language).
 * Fix wave 1, Decision A: nothing is kept in this browser. The level lives in the address (`?level=`), and the recent
 * questions come from the account only. N7 (2026-10-29): the chosen level is kept in the account too (useReadingLevel).
 */

/** The API's own floor for a question is a few words; Start waits for it (spec: "under 7 characters"). */
const QUESTION_MIN = 7;
/** The longest answer a person types under "Other". */
const OTHER_MAX = 120;
/** D2 "Add your own angle": at most five (V4Goal.angles). */
const ANGLES_MAX = 5;

/** Owner N6b (2026-10-29): what each level shows, in plain words (the earlier example sentences are gone). */
const SHOWS_KEYS: Readonly<Record<ReadingLevel, string>> = Object.freeze({
  plain: "v4.ask.levelShows.plain",
  background: "v4.ask.levelShows.background",
  expert: "v4.ask.levelShows.expert"
});

type Step = "ask" | "read";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** useLayoutEffect in the browser (no frame at the old height), useEffect on the server (which has no layout). */
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

/** Decision 29: one clarifying question, in the look the fixed buttons had: its label, its answers as chips, then "Other" with a line to type on. */
function ClarifyBlock({ question, given, full, onChange, inputId, otherLabel, otherInputLabel }: Readonly<{
  question: ClarifyQuestion;
  given: V4GoalAnswer | undefined;
  /** Free's cap is reached: only a question already answered can still change. */
  full: boolean;
  onChange(next: V4GoalAnswer | null): void;
  inputId: string;
  otherLabel: string;
  otherInputLabel: string;
}>) {
  const labelId = `${inputId}-label`;
  return (
    <div className="v4AskBlock" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="v4AskLabel" dir="auto" data-ai-generated="true">{question.text}</span>
      <div className="v4AskChips">
        {question.answers.map((answer) => {
          const pressed = given !== undefined && !given.other && given.answer === answer;
          return (
            <button
              key={answer}
              type="button"
              className="v4Chip"
              dir="auto"
              aria-pressed={pressed}
              disabled={full && given === undefined}
              onClick={() => onChange(pressed ? null : { question: question.text, answer, other: false })}
            >
              {answer}
            </button>
          );
        })}
        <button
          type="button"
          className="v4Chip"
          aria-pressed={given?.other === true}
          disabled={full && given === undefined}
          onClick={() => onChange(given?.other === true ? null : { question: question.text, answer: "", other: true })}
        >
          {otherLabel}
        </button>
      </div>
      {given?.other === true ? (
        <div className="v4AskInline">
          <label className="v4AskLabelSmall" htmlFor={inputId}>{otherInputLabel}</label>
          <input
            id={inputId}
            className="v4AskInput"
            type="text"
            dir="auto"
            value={given.answer}
            maxLength={OTHER_MAX}
            onChange={(event) => onChange({ question: question.text, answer: event.target.value, other: true })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function V4AskClient({
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint,
  initialQuestion,
  initialLevel,
  againRunId = null
}: Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
  initialQuestion: string;
  /** The level the address carried (`?level=`), or null: then D1 offers the chips. */
  initialLevel: ReadingLevel | null;
  /** Owner review 3 Nov (wait-f11): "Ask this again" names the debate (`?again=`) whose question fills the box; null: none. */
  againRunId?: string | null;
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
        initialLevel={initialLevel}
        session={session}
        againRunId={againRunId}
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
  initialLevel,
  session,
  againRunId
}: Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
  billingCatalog: MessageCatalog;
  locale: string;
  crisisCountryHint: string | null;
  initialQuestion: string;
  /** The level the address carried (`?level=`), or null: then D1 offers the chips. */
  initialLevel: ReadingLevel | null;
  /** Whether the visitor is signed in (CHECKING until the session read answers). */
  session: V4Session;
  /** Owner review 3 Nov (wait-f11): the debate whose question fills the box (`?again=`); null: none. */
  againRunId: string | null;
}>) {
  const router = useRouter();
  // N7: a level the person chose before (on any device) comes back from the account; until that read has answered the
  // one-time chooser stays hidden, so it never flashes for someone who already chose.
  const [savedLevel, saveLevel, levelKnown] = useReadingLevel(initialLevel);
  // The D1 prototype shows "Plain words" chosen. A chip only changes this draft (so every sample can be compared,
  // UI-2/TIME-4); it is saved by Continue, "Just answer it" or the header menu.
  const [draftLevel, setDraftLevel] = useState<ReadingLevel>(initialLevel ?? "plain");
  const level = savedLevel ?? draftLevel;
  const [step, setStep] = useState<Step>("ask");
  const [question, setQuestion] = useState(initialQuestion);
  const [goal, setGoal] = useState<V4Goal>(EMPTY_GOAL);
  const [angleDraft, setAngleDraft] = useState("");
  const [mode, setMode] = useState<DigMode>("quick");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pressed, setPressed] = useState<"start" | "quick" | null>(null);
  // ASK-5: a rewrite the person accepted in the language pop-up, kept for the next Start while the text it replaced
  // (`basis`) is still what would be sent.
  const [accepted, setAccepted] = useState<Readonly<{ basis: string; text: string }> | null>(null);
  const readHeading = useRef<HTMLHeadingElement>(null);
  const questionField = useRef<HTMLTextAreaElement>(null);
  const shownStep = useRef<Step>(step);
  const ids = useId();
  // ask-d5 B: "Your maps", read once the person is known to be signed in.
  const shelf = useMapShelf({ enabled: session === "IN", want: SHELF_MAX, catalog });
  // journey-d4 A: before Next, the browser's own "Leave site?" protects typed words (a reload or a closed tab); words a
  // reload brings back from the address are not at risk.
  useLeaveSiteGuard(() => step === "ask" && question.trim().length > 0 && question.trim() !== initialQuestion.trim());
  // Owner review 3 Nov (wait-f11): "Ask this again" fills the box with the earlier question, read back from the server, as
  // long as the person has not started typing; nothing starts by itself. Read once the person is known to be signed in.
  const againQuestion = useAskAgain(session === "IN" ? againRunId : null, catalog);
  useEffect(() => {
    if (againQuestion === null) return;
    setQuestion((current) => (current === initialQuestion ? againQuestion : current));
  }, [againQuestion, initialQuestion]);

  const ask = useV4Ask({
    catalog,
    homeCatalog,
    newDebateCatalog,
    locale,
    crisisCountryHint,
    // ASK-8: on D1 the only ask is "Just answer it" (quick), so its room notice describes a quick ask.
    mode: step === "ask" ? "quick" : mode,
    readingLevel: level
  });

  // Owner 2026-10-29 (Free plan shape): a Free ask carries at most FREE_GOAL_CHOICES_MAX choices; paid plans have no cap.
  // Once Free's cap is reached, only the choices already set can still be changed. What is sent never carries more.
  const choicesFull = ask.planTier === "free" && goalChoiceCount(goal) >= FREE_GOAL_CHOICES_MAX;
  const sentGoal = useMemo(() => goalWithinPlan(goal, ask.planTier), [goal, ask.planTier]);
  const trimmed = question.trim();
  const longEnough = trimmed.length >= QUESTION_MIN;
  // ASK-3: a crisis message may be very short; it must still reach the crisis help (V3 enables Start for it).
  const crisisText = ask.flagsCrisis(trimmed);
  const canGoOn = longEnough || crisisText;
  // Decision 29: the question goes to the small AI only once the person has agreed to the sensitive-data notice, and never in crisis words.
  const [consented, setConsented] = useState(false);
  const clarify = useAskClarify({ active: step === "read" && longEnough, question: trimmed, mayCall: consented && !crisisText });
  const questions = useMemo(() => (clarify.reply === null ? [] : clarifyingQuestions(clarify.reply)), [clarify.reply]);
  // A changed question: answers that no longer apply are dropped, the moment its new questions arrive.
  useEffect(() => {
    if (clarify.reply === null) return;
    setGoal((current) => {
      const answers = answersStillAsked(current.answers, questions);
      return answers === current.answers ? current : { ...current, answers };
    });
  }, [clarify.reply, questions]);
  // The lead-ins are read from `newDebate`, the namespace every language has (v4 is English in all 35 tonight).
  const composed = useMemo(() => composeQuestion(trimmed, sentGoal, newDebateCatalog), [trimmed, sentGoal, newDebateCatalog]);
  // "Just answer it" sends the question alone, tidied the same way (so its title is the person's whole words).
  const plain = useMemo(() => composeQuestion(trimmed, EMPTY_GOAL, newDebateCatalog), [trimmed, newDebateCatalog]);
  const sentLine = accepted !== null && accepted.basis === composed ? accepted.text : composed;
  const quickLine = accepted !== null && accepted.basis === plain ? accepted.text : plain;
  const tooLong = byteLength(sentLine) > askQuestionMaxBytes();
  const busy = ask.submitting || pressed !== null;
  // W3-4 (the money rule, owner 31 Oct): before a new question, its share of today; when new starts wait for the day,
  // week or month reset, that line with the time takes the place of today's room notice. Shares only, never a price.
  const startsWait = startsWaitLine(ask.room, locale);
  const startLines: readonly MoneyLine[] = [startShareLine(ask.room), startsWait].filter((line): line is MoneyLine => line !== null);
  const roomLines = (
    <>
      <V4MoneyLines lines={startLines} catalog={catalog} />
      {startsWait === null ? <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} /> : null}
    </>
  );
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
  const stepOneWhy = [usedUp === null ? null : `${ids}-usedup`, reasonKey === null ? null : `${ids}-why`]
    .filter((id): id is string => id !== null).join(" ") || undefined;
  const startShare = startShareLine(ask.room);
  const stepOneRoomLines = (
    <>
      <V4MoneyLines lines={startShare === null ? [] : [startShare]} catalog={catalog} />
      {startsWait === null ? <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} /> : null}
    </>
  );
  // ask-d1 D: the seed of the map, for a first visit only (signed out, or an account with no debate yet).
  const firstVisit = session === "OUT" || (session === "IN" && shelf.load.status === "READ" && !shelf.load.read.anyRows);
  const signInHref = `/login?next=${encodeURIComponent(levelHref("/v4", savedLevel))}`;

  // Changing step moves focus to the new step's heading or the question, and back to the top.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0 });
    if (step === "read") readHeading.current?.focus();
    else questionField.current?.focus();
  }, [step]);

  // ask-f19: the step-1 box follows the words' height (and the width the page now has).
  useBrowserLayoutEffect(() => {
    if (step !== "ask") return;
    growToWords(questionField.current);
  }, [question, step]);
  useEffect(() => {
    if (step !== "ask") return;
    const regrow = () => growToWords(questionField.current);
    window.addEventListener("resize", regrow);
    return () => window.removeEventListener("resize", regrow);
  }, [step]);

  function keepLevel() {
    // Only a level the person saw offered is kept: before the account's level is known, the chips were not shown.
    if (savedLevel === null && levelKnown) saveLevel(draftLevel);
  }

  /** The header menu saves at once (and so hides the D1 chips). */
  function chooseLevelNow(next: ReadingLevel) {
    setDraftLevel(next);
    saveLevel(next);
  }

  async function start(questionLine: string, askMode: DigMode, which: "start" | "quick", basis: string) {
    if (busy) return;
    keepLevel();
    setRefusal(null);
    setPressed(which);
    try {
      // "Just answer it" sends the question alone; Start sends the choices too.
      const outcome = await ask.submit(questionLine, askMode, "ask", null, which === "start" ? purposeLinesOfGoal(sentGoal) : undefined);
      switch (outcome.kind) {
        case "STARTED":
          router.push(levelHref(`/v4/debate/${encodeURIComponent(outcome.runId)}`, savedLevel ?? draftLevel));
          return; // keep the busy state until the map page takes over
        case "REFUSED": {
          setRefusal(outcome.message);
          // ASK-5: a rewrite accepted before the refusal sticks for the next Start of the same text.
          const kept = outcome.acceptedQuestion;
          if (kept !== undefined && kept.trim().length > 0) setAccepted({ basis, text: kept });
          break;
        }
        case "STOPPED": {
          // ASK-5: the same for a rewrite accepted before the question check's screen opened.
          const kept = outcome.acceptedQuestion;
          if (kept !== undefined && kept.trim().length > 0) setAccepted({ basis, text: kept });
          break;
        }
      }
    } catch {
      setRefusal(t(catalog, "v4.ask.failed"));
    }
    setPressed(null);
  }

  async function goOn() {
    if (!canGoOn) return;
    // ASK-3: a crisis message goes straight to the ask, which offers help (and sends nothing) instead of D2.
    if (crisisText && !longEnough) {
      void start(quickLine, "quick", "quick", plain);
      return;
    }
    keepLevel();
    setRefusal(null);
    // Decision 29: the small AI reads the question before Start, so the one-time consent comes first. Refused, or the read failed: D2 opens all the
    // same, with no questions; Start asks again.
    setConsented(await ask.ensureConsent().catch(() => false));
    setStep("read");
  }

  /** Sets or clears one question's answer, keeping them in the order the questions are shown (so the sentences read in that order). */
  function answerQuestion(question: ClarifyQuestion, next: V4GoalAnswer | null) {
    const others = goal.answers.filter((given) => given.question !== question.text);
    const answers = next === null ? others : [...others, next];
    const place = (given: V4GoalAnswer): number => questions.findIndex((shown) => shown.text === given.question);
    setGoal({ ...goal, answers: [...answers].sort((a, b) => place(a) - place(b)) });
  }

  function addAngle() {
    const angle = angleDraft.replace(/\s+/g, " ").trim();
    if (angle.length === 0 || goal.angles.length >= ANGLES_MAX || choicesFull) return;
    if (!goal.angles.some((existing) => existing.toLocaleLowerCase() === angle.toLocaleLowerCase())) {
      setGoal({ ...goal, angles: [...goal.angles, angle] });
    }
    setAngleDraft("");
  }

  function onAngleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addAngle();
  }

  // ask-d1: a signed-out visitor reads "Sign in" at the end of the header (the way back is this page).
  const header = (
    <V4Header catalog={catalog} readingLevel={savedLevel} onReadingLevel={chooseLevelNow} classicHref="/new">
      {session === "OUT" ? <Link className="v4Link v4HdrSignIn" href={signInHref}>{t(catalog, "v4.ask.signIn")}</Link> : null}
    </V4Header>
  );
  const refusalAlert = refusal === null ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>;

  // One tree for both steps, so the consent / crisis / language pop-ups stay mounted in one place.
  return (
    <>
      {header}
      {step === "ask" ? (
        <div className="v4AskMain">
          <div className="v4AskQuestion">
            <h1 id={`${ids}-title`} className="v4AskTitle v4Serif">
              <label htmlFor={`${ids}-q`}>{t(catalog, "v4.ask.title")}</label>
            </h1>
            {/* ask-d1: the one grey promise line under the title. */}
            <p className="v4AskPromise v4Muted">{t(catalog, "v4.ask.promise")}</p>
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
              placeholder={t(catalog, "v4.ask.questionPlaceholder")}
              aria-labelledby={`${ids}-title`}
              aria-describedby={stepOneWhy}
            />
            {reasonKey === null ? null : (
              <p id={`${ids}-why`} className="v4AskHint v4Muted v4AskWhy">{t(catalog, reasonKey)}</p>
            )}
          </div>

          {savedLevel === null && levelKnown ? (
            <fieldset className="v4AskLevels">
              <legend className="v4AskLegend">{t(catalog, "v4.ask.levelLegend")}</legend>
              {/* ask-f15: one choice of three (native radios: arrow keys move and choose, in either writing direction). */}
              <div className="v4AskChips">
                {READING_LEVELS.map((option) => (
                  <label key={option} className="v4Chip v4AskLevelChip" data-checked={option === draftLevel}>
                    <input
                      type="radio"
                      className="v4AskLevelInput"
                      name={`${ids}-level`}
                      value={option}
                      checked={option === draftLevel}
                      onChange={() => setDraftLevel(option)}
                    />
                    <span>{t(catalog, `v4.readingLevel.${option}`)}</span>
                  </label>
                ))}
              </div>
              <p className="v4AskSample" aria-live="polite">
                <span className="v4Eyebrow v4AskSampleLabel">{t(catalog, "v4.ask.levelShowsLabel")}</span>
                {t(catalog, SHOWS_KEYS[draftLevel])}
              </p>
              <p className="v4AskHint v4Muted">{t(catalog, "v4.ask.levelNote")}</p>
              <p className="v4AskHint v4Muted">{t(catalog, "v4.ask.levelHonest")}</p>
            </fieldset>
          ) : levelKnown ? null : (
            // ask-f16: the level choice's place is held (a faint shape) until the account says whether it is needed.
            <div className="v4AskLevelsHold" aria-hidden="true" />
          )}

          {publicNotice}
          <div className="v4AskActions">
            <button type="button" className="v4Btn v4BtnPrimary" onClick={() => void goOn()} disabled={!canGoOn || busy} aria-describedby={stepOneWhy}>
              {t(catalog, "v4.ask.continue")}
            </button>
            <button
              type="button"
              className="v4Link v4AskJust"
              onClick={() => void start(quickLine, "quick", "quick", plain)}
              disabled={!canGoOn || busy || quickTooLong}
              aria-busy={pressed === "quick"}
              aria-describedby={stepOneWhy}
            >
              {pressed === "quick" ? t(catalog, "v4.ask.starting") : t(catalog, "v4.ask.justAnswer")}
            </button>
          </div>
          {stepOneRoomLines}
          {refusalAlert}

          {firstVisit ? <V4MapSeed question={question} catalog={catalog} /> : null}
          <V4MapShelf load={shelf.load} catalog={catalog} locale={locale} level={savedLevel} />
        </div>
      ) : (
        <div className="v4AskMain v4AskMainRead">
          <div>
            <button type="button" className="v4Link v4AskBack" onClick={() => setStep("ask")}>
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
              <textarea
                id={`${ids}-q2`}
                className="v4AskField v4AskFieldSmall"
                rows={2}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                aria-labelledby={`${ids}-q2label`}
                aria-describedby={!longEnough && !crisisText ? `${ids}-short2` : undefined}
              />
              {!longEnough && !crisisText ? (
                <p id={`${ids}-short2`} className="v4AskHint v4Muted">{t(catalog, "v4.ask.tooShort")}</p>
              ) : null}
            </div>

            <>
                <h2 className="v4AskSubTitle">
                  {t(catalog, "v4.read.optionalTitle")} <span className="v4Muted v4AskOptional">{t(catalog, "v4.read.optionalNote")}</span>
                </h2>
                {ask.planTier === "free" ? (
                  <p className="v4AskHint v4Muted">{t(catalog, "v4.read.freeChoices", { count: FREE_GOAL_CHOICES_MAX })}</p>
                ) : null}

                {clarify.waiting ? <p className="v4AskHint v4Muted" role="status">{t(catalog, "v4.read.clarifyWaiting")}</p> : null}
                {questions.map((shown, at) => (
                  <ClarifyBlock
                    key={shown.text}
                    question={shown}
                    given={goal.answers.find((given) => given.question === shown.text)}
                    full={choicesFull}
                    onChange={(next) => answerQuestion(shown, next)}
                    inputId={`${ids}-other-${at}`}
                    otherLabel={t(newDebateCatalog, "newDebate.askText.otherAnswer")}
                    otherInputLabel={t(newDebateCatalog, "newDebate.askText.otherLabel")}
                  />
                ))}

                <div className="v4AskBlock">
                  <label className="v4AskLabel" htmlFor={`${ids}-matters`}>{t(catalog, "v4.read.matters.label")}</label>
                  <input
                    id={`${ids}-matters`}
                    className="v4AskInput"
                    type="text"
                    value={goal.matters}
                    maxLength={300}
                    disabled={choicesFull && goal.matters.trim().length === 0}
                    placeholder={t(catalog, "v4.read.matters.placeholder")}
                    onChange={(event) => setGoal({ ...goal, matters: event.target.value })}
                  />
                </div>

                <div className="v4AskBlock">
                  <label className="v4AskLabel" htmlFor={`${ids}-angle`}>{t(catalog, "v4.read.angles.label")}</label>
                  <div className="v4AskAngleRow">
                    <input
                      id={`${ids}-angle`}
                      className="v4AskInput"
                      type="text"
                      value={angleDraft}
                      maxLength={200}
                      disabled={goal.angles.length >= ANGLES_MAX || choicesFull}
                      placeholder={t(catalog, "v4.read.angles.placeholder")}
                      onChange={(event) => setAngleDraft(event.target.value)}
                      onKeyDown={onAngleKey}
                    />
                    <button
                      type="button"
                      className="v4Btn"
                      onClick={addAngle}
                      disabled={angleDraft.trim().length === 0 || goal.angles.length >= ANGLES_MAX || choicesFull}
                    >
                      {t(catalog, "v4.read.angles.add")}
                    </button>
                  </div>
                  {goal.angles.length === 0 ? null : (
                    <ul className="v4AskAngles">
                      {goal.angles.map((angle) => (
                        <li key={angle} className="v4AskAngle">
                          <span>{angle}</span>
                          <button
                            type="button"
                            className="v4AskAngleRemove"
                            aria-label={t(catalog, "v4.read.angles.remove", { angle })}
                            onClick={() => setGoal({ ...goal, angles: goal.angles.filter((kept) => kept !== angle) })}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {goal.angles.length >= ANGLES_MAX ? (
                    <p className="v4AskHint v4Muted">{t(catalog, "v4.read.angles.full")}</p>
                  ) : null}
                </div>
            </>

            <div className="v4AskBlock">
              <span className="v4AskLabel" id={`${ids}-sent`}>{t(catalog, "v4.read.sentLabel")}</span>
              <p className="v4AskSent" aria-labelledby={`${ids}-sent`}>{sentLine}</p>
              {tooLong ? <p className="v4AskRefusal" role="alert">{t(catalog, "v4.read.tooLong")}</p> : null}
              {questions.length === 0 ? null : <p className="v4AskHint v4Muted">{t(catalog, "v4.read.honestNote")}</p>}
            </div>
          </section>

          <div className="v4AskBar">
            <p className="v4AskBarGet">{t(catalog, "v4.read.youGet")}</p>
            {publicNotice}
            <div className="v4AskBarRow">
              {/* Owner N13: Free has no Quick look / Thorough choice (askConfig sends every Free ask as a quick look). */}
              {ask.planTier === "free" ? null : (
                <div className="v4AskMode" role="group" aria-label={t(catalog, "v4.read.modeLabel")}>
                  {DIG_MODES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={mode === option}
                      onClick={() => setMode(option)}
                    >
                      {t(catalog, `v4.digMode.${option}`)}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="v4Btn v4BtnPrimary v4AskStart"
                onClick={() => void start(sentLine, mode, "start", composed)}
                disabled={!canGoOn || tooLong || busy}
                aria-busy={pressed === "start"}
              >
                {pressed === "start" ? t(catalog, "v4.ask.starting") : t(catalog, "v4.read.start")}
              </button>
            </div>
            {roomLines}
            {refusalAlert}
          </div>
        </div>
      )}
      {ask.dialogs}
    </>
  );
}
