"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigTrail } from "@/lib/v4/load";
import { clockText, isWorking, keepsGoing, stateWordText, waitDotOf, whenText, type WaitState } from "@/lib/v4/stateWords";
import type { ReadingLevel } from "@/lib/v4/types";
import { focusInPlace, useFocusHandOff } from "@/lib/v4/useFocusHandOff";
import { V4ChoiceChips } from "./V4ChoiceChips";
import { V4LevelTrail } from "./V4LevelTrail";

/*
 * Owner's screen review, 3 Nov 2026 (journey-d2 A): ONE waiting card for every wait, with the same parts in the same
 * order: the "Back to: …" link and the level trail above it (wait-f12); the question; one true state line from the
 * shared list (lib/v4/stateWords.ts, journey-f22); "Started 14:31" as a clock time, nothing ticking (journey-f16);
 * the person's choices as chips, never a count (journey-f23); what the page holds for this wait (`children`: the month
 * pause's Continue, the paths being looked into); "You can leave this page. It keeps going." with the one account-wide
 * "Tell me when it's ready" (`notify`, built later); "taking longer than usual" only past the MEASURED top of the usual
 * range (wait-f8: there is no default number); with reduced motion a still dot and "Still working · checked 14:09"
 * (wait-f17); the lost-touch line with [Try now] (wait-f19). The card draws no classic-view link: "Open in the classic view"
 * is in the account menu only (the owner's answers of 5 Nov, question 12 B, journey-f19). The card reads nothing itself: the
 * page passes what it knows (useWaitPolling gives `checkedAt`, `reconnecting` and `onTryNow`). Before Start it may sit inside
 * the question card (`variant="inline"`, no heading).
 *
 * Motion (journey-d1 A and the owner's chat answer): the working dot has one slow pulse; a new state line shows at once
 * with a 1-second soft highlight; with reduced motion the dot is still, and the highlight and the written line stay.
 * The highlight is the shared one (.v4Highlight, app/v4/v4-base.css); the pulse is the map's working dot's (v4MapPulse).
 */

/** The 1-second soft highlight of a changed line (the owner's motion rule). */
const HIGHLIGHT_MS = 1_000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type V4WaitCardBack = Readonly<{
  /** The page it goes back to (a debate's map, at the path the dig came from). */
  href: string;
  /** The question it goes back to, in the person's own words; empty: "Back to the earlier debate". */
  question: string;
}>;

export type V4WaitCardTrail = Readonly<{
  /** The dig's level (1 to DIG_LEVEL_MAX). */
  level: number;
  /** The debates above it, top first (lib/v4/load.ts loadDigTrail); null while they are being read. */
  trail: DigTrail | null;
  /** The reading level the trail's links carry (the one the person chose), or null. */
  linkLevel: ReadingLevel | null;
}>;

export type V4WaitCardProps = Readonly<{
  /** What is happening, from the shared list (waitStateOfRun / waitStateOfDig, or a state built by the page). */
  state: WaitState;
  /** The person's own words (askText.ts ownWords), shown as the card's heading; null or absent: no heading. */
  question?: string | null;
  /** 1 on the question's own page (the tab title follows it); 2 or 3 inside another card or on the map. */
  headingLevel?: 1 | 2 | 3;
  /** "page" (default): a card of its own. "inline": inside the question card or a place on the map, no card border. */
  variant?: "page" | "inline";
  /** When the work started (ISO), shown as "Started 14:31" (with the day when it was not today); null: not shown. */
  startedAt?: string | null;
  /** The person's choices as chips (their answers, picks or the chosen paths); absent or empty: none. */
  choices?: readonly string[];
  /** The page's own part of this wait (the month pause's Continue, the paths being looked into), after the chips. */
  children?: ReactNode;
  /** The account-wide "Tell me when it's ready" (journey-f9), right after "You can leave this page"; absent today. */
  notify?: ReactNode;
  /**
   * The top of the MEASURED usual range, in minutes from the start (the Mac timing run). Absent or null: the "taking
   * longer than usual" line never shows. The page must never pass a guessed number.
   */
  usualTopMinutes?: number | null;
  /** Something to do once it takes longer than usual (journey-d2: "Try again", or "we'll email you"). */
  longerAction?: ReactNode;
  /** When a check last answered (ms since 1970, useWaitPolling's `checkedAt`); null before the first. */
  checkedAt?: number | null;
  /** True while the page has lost touch with the server (useWaitPolling's `reconnecting`). */
  reconnecting?: boolean;
  /** [Try now] beside "Trying again…" (useWaitPolling's `tryNow`); absent: no button. */
  onTryNow?: () => void;
  /** "Back to: …" above the card (a dig's own page); null or absent: none. */
  back?: V4WaitCardBack | null;
  /** The level trail above the card (a dig's own page); null or absent: none. */
  levelTrail?: V4WaitCardTrail | null;
  catalog: MessageCatalog;
  locale: string;
}>;

/** True while the person's device asks for less motion (read once mounted; the server render assumes no). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True for one second after `value` changes (never on the first show): the soft highlight of a changed line. */
function useSoftHighlight(value: string): boolean {
  const previous = useRef(value);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setLit(true);
    const timer = window.setTimeout(() => setLit(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return lit;
}

function BackLink({ back, catalog }: Readonly<{ back: V4WaitCardBack; catalog: MessageCatalog }>) {
  // The same link as on the map (V4DebateClient): "‹ Back to: <the question>".
  return (
    <Link className="v4DebBack v4WaitBack" href={back.href}>
      <span aria-hidden="true">‹</span>{" "}
      {back.question.trim().length > 0 ? (
        <>
          {t(catalog, "v4.debate.backTo")}{" "}
          <span className="v4DebBackQuestion" data-ai-generated="true">{back.question}</span>
        </>
      ) : t(catalog, "v4.debate.backToEarlier")}
    </Link>
  );
}

export function V4WaitCard(props: V4WaitCardProps) {
  const { state, catalog, locale, checkedAt = null } = props;
  const reducedMotion = useReducedMotion();
  // The moment the card compares with: the last check, else when it was first shown (never a running clock).
  const [shownAt] = useState(() => Date.now());
  const now = checkedAt ?? shownAt;
  const word = stateWordText(state, catalog, locale, now);
  const highlighted = useSoftHighlight(word);
  const working = isWorking(state);
  const dot = waitDotOf(state);

  const startedMs = props.startedAt === null || props.startedAt === undefined ? Number.NaN : new Date(props.startedAt).getTime();
  const started = Number.isNaN(startedMs) ? null : whenText(startedMs, locale, now);
  const usualTop = props.usualTopMinutes ?? null;
  const longer = working && usualTop !== null && usualTop > 0 && checkedAt !== null && !Number.isNaN(startedMs)
    && checkedAt - startedMs > usualTop * 60_000;
  const checkedTime = working && reducedMotion && checkedAt !== null ? clockText(checkedAt, locale) : null;
  const question = props.question?.trim() ?? "";
  const Heading = `h${String(props.headingLevel ?? 1)}` as "h1" | "h2" | "h3";
  const inline = props.variant === "inline";
  // W2L-3 (the wave-2 checks, 4 Nov): [Try now] goes once the connection is back, which is what pressing it does. Where it
  // held focus, focus stays in the card (its own section), never on the page's body, and the page does not scroll.
  const card = useRef<HTMLElement | null>(null);
  const tryNowHandOff = useFocusHandOff(props.reconnecting === true, () => {
    // The card takes focus only now (it is not a stop for Tab, and a click on its words does not focus it).
    if (card.current !== null && !card.current.hasAttribute("tabindex")) card.current.setAttribute("tabindex", "-1");
    focusInPlace(card.current);
  });

  return (
    <div className="v4WaitBlock" data-wait-block="">
      {props.back === null || props.back === undefined ? null : <BackLink back={props.back} catalog={catalog} />}
      {props.levelTrail === null || props.levelTrail === undefined ? null : (
        <V4LevelTrail
          level={props.levelTrail.level}
          trail={props.levelTrail.trail}
          linkLevel={props.levelTrail.linkLevel}
          catalog={catalog}
        />
      )}
      <section ref={card} className={inline ? "v4WaitCard v4WaitCardInline" : "v4Card v4WaitCard"} data-wait-state={state.kind}>
        {question.length === 0 ? null : (
          <>
            {inline ? null : <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>}
            {/* The person's own words; on its own page the tab title follows this heading. */}
            <Heading className="v4Serif v4WaitQuestion" data-ai-generated="true">{question}</Heading>
          </>
        )}
        <p className={`v4WaitState${highlighted ? " v4Highlight" : ""}`} role="status" data-wait-word="">
          {dot === "NONE" ? null : (
            <span
              className={`v4WaitDot v4WaitDot-${dot}${reducedMotion ? " v4WaitDotStill" : ""}`}
              data-dot={dot === "PULSE" && reducedMotion ? "STILL" : dot}
              aria-hidden="true"
            />
          )}
          <span>{word}</span>
        </p>
        {checkedTime === null ? null : (
          <p className="v4WaitChecked v4Muted" data-wait-checked="">{t(catalog, "v4.wait.checked", { time: checkedTime })}</p>
        )}
        {started === null ? null : (
          <p className="v4WaitStarted v4Muted" data-wait-started="">{t(catalog, "v4.wait.started", { time: started })}</p>
        )}
        <V4ChoiceChips choices={props.choices ?? []} label={t(catalog, "v4.wait.choices")} />
        {props.children}
        {keepsGoing(state) ? (
          <div className="v4WaitLeave" data-wait-leave="">
            <p className="v4Muted">{t(catalog, "v4.wait.leave")}</p>
            {props.notify}
          </div>
        ) : null}
        {longer ? (
          <div className="v4WaitLonger" data-wait-longer="">
            <p>{t(catalog, "v4.wait.longer")}</p>
            {props.longerAction}
          </div>
        ) : null}
        {props.reconnecting === true ? (
          <p className="v4WaitReconnect v4Muted" data-wait-reconnecting="">
            <span>{t(catalog, "v4.debate.reconnecting")}</span>
            {props.onTryNow === undefined ? null : (
              <button type="button" className="v4Link v4WaitTryNow" onClick={props.onTryNow} onFocus={tryNowHandOff.onFocus}
                onBlur={tryNowHandOff.onBlur}>{t(catalog, "v4.wait.tryNow")}</button>
            )}
          </p>
        ) : null}
      </section>
    </div>
  );
}
