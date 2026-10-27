"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { askQuestionMaxBytes } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { V4Header } from "@/components/v4/V4Header";
import { contractClient } from "@/lib/api";
import { catalogLocale, isLocale } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { composeQuestion, ownWords } from "@/lib/v4/askText";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import {
  DIG_MODES,
  EMPTY_GOAL,
  GOAL_HORIZONS,
  GOAL_PLACES,
  GOAL_PURPOSES,
  READING_LEVELS,
  type DigMode,
  type ReadingLevel,
  type V4Goal
} from "@/lib/v4/types";
import { useV4Ask } from "@/lib/v4/useV4Ask";

/*
 * V4 initial (spec "/v4 — D1 Ask + D2 How we read your question", row D decisions 5 and 10). D1: the question and,
 * once, the reading level. D2: the optional choices, then EXACTLY the text the AIs will get (composeQuestion), so
 * nothing is hidden. The ask itself is V3's, through useV4Ask (consent, crisis help, room, question language).
 * Fix wave 1, Decision A: nothing is kept in this browser. The level lives in the address (`?level=`), and the recent
 * questions come from the account only.
 */

/** The API's own floor for a question is a few words; Start waits for it (spec: "under 7 characters"). */
const QUESTION_MIN = 7;
/** D2 "Add your own angle": at most five (V4Goal.angles). */
const ANGLES_MAX = 5;
/** Recent questions: this many from the account, at most. */
const RECENT_MAX = 5;

const SAMPLE_KEYS: Readonly<Record<ReadingLevel, string>> = Object.freeze({
  plain: "v4.ask.sample.plain",
  background: "v4.ask.sample.background",
  expert: "v4.ask.sample.expert"
});

type Step = "ask" | "read";
type Recent = Readonly<{ runId: string; question: string; sequence: number }>;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * "Your recent questions": the account's latest answers and open asks (both asker-scoped), newest first, each shown by
 * the person's own words (ownWords). Quiet when there are none or the read fails. Nothing comes from this browser.
 */
function useRecentQuestions(): readonly Recent[] {
  const [recent, setRecent] = useState<readonly Recent[]>([]);
  useEffect(() => {
    let active = true;
    contractClient.readAnswerIndex(RECENT_MAX, 0).then(
      (index) => {
        if (!active) return;
        const byRun = new Map<string, Recent>();
        const rows = [
          ...index.open_runs.map((run) => ({ runId: run.run_ref, line: run.question_line, sequence: run.created_at_sequence })),
          ...index.items.map((item) => ({ runId: item.run_ref, line: item.question_line, sequence: item.created_at_sequence }))
        ];
        for (const row of rows) {
          const question = ownWords(row.line);
          const known = byRun.get(row.runId);
          if (question.length === 0 || (known !== undefined && known.sequence >= row.sequence)) continue;
          byRun.set(row.runId, { runId: row.runId, question, sequence: row.sequence });
        }
        setRecent([...byRun.values()].sort((a, b) => b.sequence - a.sequence).slice(0, RECENT_MAX));
      },
      () => { /* quiet: a failed read shows no list */ }
    );
    return () => { active = false; };
  }, []);
  return recent;
}

export function V4AskClient({
  catalog,
  homeCatalog,
  newDebateCatalog,
  billingCatalog,
  locale,
  crisisCountryHint,
  initialQuestion,
  initialLevel
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
}>) {
  // AuthGate reads newDebate.* keys (checking session / redirecting), as on /new.
  return (
    <AuthGate catalog={newDebateCatalog}>{() => (
      <V4AskForm
        catalog={catalog}
        homeCatalog={homeCatalog}
        newDebateCatalog={newDebateCatalog}
        billingCatalog={billingCatalog}
        locale={locale}
        crisisCountryHint={crisisCountryHint}
        initialQuestion={initialQuestion}
        initialLevel={initialLevel}
      />
    )}</AuthGate>
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
  initialLevel
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
}>) {
  const router = useRouter();
  const [savedLevel, saveLevel] = useReadingLevel(initialLevel);
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
  const recent = useRecentQuestions();

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

  // ASK-1: the D2 choices are added as English sentences, so they are offered only on English pages for now.
  const choicesOffered = isLocale(locale) && catalogLocale(locale) === "en";
  const trimmed = question.trim();
  const longEnough = trimmed.length >= QUESTION_MIN;
  // ASK-3: a crisis message may be very short; it must still reach the crisis help (V3 enables Start for it).
  const crisisText = ask.flagsCrisis(trimmed);
  const canGoOn = longEnough || crisisText;
  const composed = useMemo(() => composeQuestion(trimmed, goal, catalog, locale), [trimmed, goal, catalog, locale]);
  // "Just answer it" sends the question alone, tidied the same way (so its title is the person's whole words).
  const plain = useMemo(() => composeQuestion(trimmed, EMPTY_GOAL, catalog, locale), [trimmed, catalog, locale]);
  const sentLine = accepted !== null && accepted.basis === composed ? accepted.text : composed;
  const quickLine = accepted !== null && accepted.basis === plain ? accepted.text : plain;
  const tooLong = byteLength(sentLine) > askQuestionMaxBytes();
  const busy = ask.submitting || pressed !== null;
  const shortHint = trimmed.length > 0 && !longEnough && !crisisText;

  // Changing step moves focus to the new step's heading or the question, and back to the top.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0 });
    if (step === "read") readHeading.current?.focus();
    else questionField.current?.focus();
  }, [step]);

  function keepLevel() {
    if (savedLevel === null) saveLevel(draftLevel);
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
      const outcome = await ask.submit(questionLine, askMode, "ask");
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
        case "STOPPED":
          break;
      }
    } catch {
      setRefusal(t(catalog, "v4.ask.failed"));
    }
    setPressed(null);
  }

  function goOn() {
    if (!canGoOn) return;
    // ASK-3: a crisis message goes straight to the ask, which offers help (and sends nothing) instead of D2.
    if (crisisText && !longEnough) {
      void start(quickLine, "quick", "quick", plain);
      return;
    }
    keepLevel();
    setRefusal(null);
    setStep("read");
  }

  function addAngle() {
    const angle = angleDraft.replace(/\s+/g, " ").trim();
    if (angle.length === 0 || goal.angles.length >= ANGLES_MAX) return;
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

  const header = (
    <V4Header catalog={catalog} readingLevel={savedLevel} onReadingLevel={chooseLevelNow} classicHref="/new" />
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
            <textarea
              ref={questionField}
              id={`${ids}-q`}
              className="v4AskField"
              rows={3}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t(catalog, "v4.ask.questionPlaceholder")}
              aria-labelledby={`${ids}-title`}
              aria-describedby={shortHint ? `${ids}-short` : undefined}
            />
            {shortHint ? (
              <p id={`${ids}-short`} className="v4AskHint v4Muted">{t(catalog, "v4.ask.tooShort")}</p>
            ) : null}
          </div>

          {savedLevel === null ? (
            <fieldset className="v4AskLevels">
              <legend className="v4AskLegend">{t(catalog, "v4.ask.levelLegend")}</legend>
              <div className="v4AskChips">
                {READING_LEVELS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="v4Chip"
                    aria-pressed={option === draftLevel}
                    onClick={() => setDraftLevel(option)}
                  >
                    {t(catalog, `v4.readingLevel.${option}`)}
                  </button>
                ))}
              </div>
              <p className="v4AskSample" aria-live="polite">
                <span className="v4Eyebrow v4AskSampleLabel">{t(catalog, "v4.ask.sampleLabel")}</span>
                {t(catalog, SAMPLE_KEYS[draftLevel])}
              </p>
              <p className="v4AskHint v4Muted">{t(catalog, "v4.ask.levelNote")}</p>
              <p className="v4AskHint v4Muted">{t(catalog, "v4.ask.levelHonest")}</p>
            </fieldset>
          ) : null}

          <div className="v4AskActions">
            <button type="button" className="v4Btn v4BtnPrimary" onClick={goOn} disabled={!canGoOn || busy}>
              {t(catalog, "v4.ask.continue")}
            </button>
            <button
              type="button"
              className="v4Link v4AskJust"
              onClick={() => void start(quickLine, "quick", "quick", plain)}
              disabled={!canGoOn || busy || byteLength(quickLine) > askQuestionMaxBytes()}
              aria-busy={pressed === "quick"}
            >
              {pressed === "quick" ? t(catalog, "v4.ask.starting") : t(catalog, "v4.ask.justAnswer")}
            </button>
          </div>
          <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
          {refusalAlert}

          {recent.length === 0 ? null : (
            <section className="v4AskRecent" aria-labelledby={`${ids}-recent`}>
              <h2 id={`${ids}-recent`} className="v4AskRecentTitle">{t(catalog, "v4.recent.title")}</h2>
              <ul className="v4AskRecentList">
                {recent.map((entry) => (
                  <li key={entry.runId}>
                    <Link
                      className="v4AskRecentLink"
                      href={levelHref(`/v4/debate/${encodeURIComponent(entry.runId)}`, savedLevel)}
                    >
                      <span data-ai-generated="true">{entry.question}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
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

            {choicesOffered ? (
              <>
                <h2 className="v4AskSubTitle">
                  {t(catalog, "v4.read.optionalTitle")} <span className="v4Muted v4AskOptional">{t(catalog, "v4.read.optionalNote")}</span>
                </h2>

                <div className="v4AskBlock" role="group" aria-labelledby={`${ids}-place`}>
                  <span id={`${ids}-place`} className="v4AskLabel">{t(catalog, "v4.read.place.label")}</span>
                  <div className="v4AskChips">
                    {GOAL_PLACES.map((place) => (
                      <button
                        key={place}
                        type="button"
                        className="v4Chip"
                        aria-pressed={goal.place === place}
                        onClick={() => setGoal({ ...goal, place: goal.place === place ? null : place })}
                      >
                        {t(catalog, `v4.read.place.${place}`)}
                      </button>
                    ))}
                  </div>
                  {goal.place === "OTHER" ? (
                    <div className="v4AskInline">
                      <label className="v4AskLabelSmall" htmlFor={`${ids}-other`}>{t(catalog, "v4.read.place.otherLabel")}</label>
                      <input
                        id={`${ids}-other`}
                        className="v4AskInput"
                        type="text"
                        value={goal.placeOther}
                        maxLength={120}
                        onChange={(event) => setGoal({ ...goal, placeOther: event.target.value })}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="v4AskBlock" role="group" aria-labelledby={`${ids}-time`}>
                  <span id={`${ids}-time`} className="v4AskLabel">{t(catalog, "v4.read.horizon.label")}</span>
                  <div className="v4AskChips">
                    {GOAL_HORIZONS.map((horizon) => (
                      <button
                        key={horizon}
                        type="button"
                        className="v4Chip"
                        aria-pressed={goal.horizon === horizon}
                        onClick={() => setGoal({ ...goal, horizon: goal.horizon === horizon ? null : horizon })}
                      >
                        {t(catalog, `v4.read.horizon.${horizon}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="v4AskBlock" role="group" aria-labelledby={`${ids}-for`}>
                  <span id={`${ids}-for`} className="v4AskLabel">{t(catalog, "v4.read.purpose.label")}</span>
                  <div className="v4AskChips">
                    {GOAL_PURPOSES.map((purpose) => (
                      <button
                        key={purpose}
                        type="button"
                        className="v4Chip"
                        aria-pressed={goal.purpose === purpose}
                        onClick={() => setGoal({ ...goal, purpose: goal.purpose === purpose ? null : purpose })}
                      >
                        {t(catalog, `v4.read.purpose.${purpose}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="v4AskBlock">
                  <label className="v4AskLabel" htmlFor={`${ids}-matters`}>{t(catalog, "v4.read.matters.label")}</label>
                  <input
                    id={`${ids}-matters`}
                    className="v4AskInput"
                    type="text"
                    value={goal.matters}
                    maxLength={300}
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
                      disabled={goal.angles.length >= ANGLES_MAX}
                      placeholder={t(catalog, "v4.read.angles.placeholder")}
                      onChange={(event) => setAngleDraft(event.target.value)}
                      onKeyDown={onAngleKey}
                    />
                    <button
                      type="button"
                      className="v4Btn"
                      onClick={addAngle}
                      disabled={angleDraft.trim().length === 0 || goal.angles.length >= ANGLES_MAX}
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
            ) : (
              <p className="v4AskHint v4Muted">{t(catalog, "v4.read.englishOnlyNote")}</p>
            )}

            <div className="v4AskBlock">
              <span className="v4AskLabel" id={`${ids}-sent`}>{t(catalog, "v4.read.sentLabel")}</span>
              <p className="v4AskSent" aria-labelledby={`${ids}-sent`}>{sentLine}</p>
              {tooLong ? <p className="v4AskRefusal" role="alert">{t(catalog, "v4.read.tooLong")}</p> : null}
              {choicesOffered ? <p className="v4AskHint v4Muted">{t(catalog, "v4.read.honestNote")}</p> : null}
            </div>
          </section>

          <div className="v4AskBar">
            <p className="v4AskBarGet">{t(catalog, "v4.read.youGet")}</p>
            <div className="v4AskBarRow">
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
            <RoomNotice room={ask.room} catalog={{ ...newDebateCatalog, ...billingCatalog }} locale={locale} />
            {refusalAlert}
          </div>
        </div>
      )}
      {ask.dialogs}
    </>
  );
}
