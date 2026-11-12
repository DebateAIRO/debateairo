"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { StartStepRoom } from "@debateai/contract";
import { useModalSurface } from "@/components/consent/modalSemantics";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { SHARE_DELTA_SHOW_MS, shareDeltaLine, startPathsShareLine } from "@/lib/v4/money";
import { DIG_MODES, type DigMode, type ReadingLevel } from "@/lib/v4/types";

/*
 * V4 start step, Task 75 (read-d5, choose-f16, read-f9, choose-f14, read-f24, choose-d5, choose-f4, choose-f10, r2-2, r2-3,
 * the owner's 2-second request, owner answers Q9 and Q10; 4 Nov night: ask-d2, ask-f3, read-f17): step 2's bottom bar.
 *  - What the person gets, never the answers again (r2-3): "You'll get: a plain answer from 5 paths." ("an answer" at
 *    Expert); without the card (the start step off), R22's line.
 *  - One share line (choose-f14): "about 18% of today" (Free: "of this month"). Its number rolls to a new value (the "roll"
 *    move; with reduced motion it changes at once, with the 1-second highlight), and the change shows in grey for
 *    SHARE_DELTA_SHOW_MS ("+4%", never red). Never a price, never what would be left (r2-2).
 *  - How wide (only with more than one width) and Quick look / Thorough, neither on Free (N13).
 *  - Start waits for the paths (chat answer): "Paths coming…" until the list, "Start investigating" once it can go. Under it
 *    "Just answer it" (answer Q9: the page hides it after the first change; answer Q10: greyed like Start until the list).
 *  - ask-f3 (4 Nov night): with crisis words (`helpFirst`) Start and the link stay pressable whatever the state, with their
 *    READY words; the page then opens only the help screen (Task 76b rule 1).
 *  - Phone (`narrow`): two pinned lines only, "5 paths · Quick look · about 11% of today  Options ⌃" and a full-width Start;
 *    "Options" opens a sheet with the rest. A computer keeps the full bar in one card.
 *  - The lines above the bar (`above`: the room and error lines) sit before it, outside its sticky box (read-f9); a focused
 *    text box (`textFocused`) puts the bar in the page, so the keyboard never covers the words (v4-ask.css).
 * Task 75b (owner's evening card "Steps aside", ask-d2 A; journey-d3 A, r2-4, ask-f8): step 1 draws Next through the same
 * bar (`job: "NEXT"`). On a phone one pinned element holds the Free notice, Next, "Just answer it" and the grey line under
 * them; the lines above and a declined consent's line sit right before it (journey-d3 keeps the bar to about a quarter of the
 * screen, read-f9 keeps notices out of it). On a computer the same pieces are one plain row, no card ("On a computer, Next
 * sits right under the box"), the declined line right under Next, and the late lines after the row (ask-f16).
 */

/**
 * Task 76b (read-f3, 4 Nov night): CHECKING_PLAN while a press waits for one more read of a plan still unknown ("Checking
 * your plan…", busy; nothing waits or is sent meanwhile).
 */
export type StartBarState = "PATHS_COMING" | "READY" | "WRITING_WAIT" | "PENDING" | "SENDING" | "CHECKING_PLAN" | "OFFLINE" | "BLOCKED";

/** One press of the bar's "Just answer it". */
export type StartBarJustAnswer = Readonly<{
  shown: boolean;
  ready: boolean;
  onPress(event?: MouseEvent<HTMLElement>): void;
  /** Job NEXT only (Task 70b): step 1's own words ("Getting ready…", "Starting…"), its busy mark and its reason line. */
  label?: string;
  busy?: boolean;
  describedBy?: string;
  /** Job NEXT, signed out (ask-d1 A): a link to sign in with this way back; the press goes on unless `onPress` stops it. */
  href?: string;
}>;

/** Job NEXT (Task 75b): Task 70b's Next. */
export type StartBarNext = Readonly<{
  label: string;
  disabled: boolean;
  busy: boolean;
  describedBy?: string;
  onPress(event?: MouseEvent<HTMLElement>): void;
  /** Signed out (ask-d1 A): Next is a link to sign in with this way back, the press going on unless `onPress` stops it. */
  href?: string;
  /** The signed-out link, which Enter in the question box presses (ask-f17). */
  linkRef?: RefObject<HTMLAnchorElement | null>;
}>;

/** What both jobs share. */
type BarCommon = Readonly<{
  catalog: MessageCatalog;
  locale: string;
  /** The page's planIsFree (read-f3): an unknown plan is never Free. */
  freePlan: boolean;
  justAnswer: StartBarJustAnswer;
  /** Decision 13: the Free notice, right before Start (job NEXT on a phone: first in the pinned element). */
  publicNotice: ReactNode;
  /** The room and error lines: before the bar, outside its sticky box (read-f9); job NEXT on a computer: after the row. */
  above: ReactNode;
  narrow: boolean;
  /** An input or textarea has focus (answer buttons never count): the bar steps aside. */
  textFocused: boolean;
  /** ask-f3: crisis words in the box or an own path; Start (Next) and the link stay pressable. */
  helpFirst: boolean;
}>;

/** Job NEXT (Task 75b): step 1's buttons. */
export type V4NextBarProps = BarCommon & Readonly<{
  job: "NEXT";
  next: StartBarNext;
  /** Task 70b's declined line and "Show it again" (null when none). */
  declined: ReactNode;
  /** The grey r2-4 line (signed out: the sign-in line). */
  under: ReactNode;
}>;

export type V4StartBarProps = Readonly<{
  /** Absent: "START", Task 75's bar exactly as built. */
  job?: "START";
  catalog: MessageCatalog;
  locale: string;
  /** The page's planIsFree (read-f3): an unknown plan is never Free. */
  freePlan: boolean;
  level: ReadingLevel;
  widths: StartStepRoom["widths"] | null;
  width: number;
  onWidth(width: number): void;
  mode: DigMode;
  onMode(mode: DigMode): void;
  /** The paths Start would send; null: no card (the start step is off). */
  pathCount: number | null;
  sharePercent: number | null;
  /** The last change of the share, shown in grey for SHARE_DELTA_SHOW_MS; null: none. */
  shareDelta: number | null;
  state: StartBarState;
  onStart(): void;
  justAnswer: StartBarJustAnswer;
  /** CARRY_ON_BUILT (Task 56): the box shows only once the behaviour is built. */
  carryOnOffered: boolean;
  carryOn: boolean;
  onCarryOn(value: boolean): void;
  /** choose-f4: "Your paths are ready ↓" while the list landed out of sight. */
  readyNote: boolean;
  onReadyNote(): void;
  /** Decision 13: the Free notice, right before Start. */
  publicNotice: ReactNode;
  /** The room and error lines: before the bar, outside its sticky box (read-f9). */
  above: ReactNode;
  /** The card's combine line (Task 72), above a slimmer Start bar. */
  combineLine: ReactNode | null;
  narrow: boolean;
  /** An input or textarea has focus (answer buttons never count): the bar steps aside. */
  textFocused: boolean;
  /** ask-f3: crisis words in the box or an own path. */
  helpFirst: boolean;
}>;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Stands in for the share's number in its catalogue line, so the number alone can roll. */
const NUMBER_MARK = "\u0000";

/** True while the device asks for less motion (read once mounted; the server render assumes no). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** How many times the share changed since the bar showed (0: never), so the number rolls on each change and not at first. */
function useShareChanges(percent: number | null): number {
  const before = useRef(percent);
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    const was = before.current;
    before.current = percent;
    if (was !== null && percent !== null && was !== percent) setChanges((count) => count + 1);
  }, [percent]);
  return changes;
}

/** The grey change ("+4%", "−2%") for SHARE_DELTA_SHOW_MS after each new share; null when there is none to show. */
function useShareDelta(percent: number | null, delta: number | null): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (delta === null || shareDeltaLine(delta) === null) {
      setShown(null);
      return undefined;
    }
    setShown(delta);
    const timer = window.setTimeout(() => setShown(null), SHARE_DELTA_SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [percent, delta]);
  return shown;
}

/**
 * Keyboard audit 2026-11-12 (V4A-16, WCAG 2.4.11): the bar's real height on the page root (--v4-start-bar-room, as the map
 * page's stack publishes --v4-stack-room). While the bar is pinned, v4-ask.css keeps that much of the window's foot free, so
 * a control the keyboard reaches is scrolled clear of the bar, never under it.
 */
function useBarRoom(ref: RefObject<HTMLDivElement | null>, narrow: boolean): void {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (element === null) return undefined;
    const set = (): void => root.style.setProperty("--v4-start-bar-room", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    set();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--v4-start-bar-room");
    };
  }, [ref, narrow]);
}

/** Task 75b: the bar's two jobs, Start on step 2 (Task 75) and Next on step 1. */
export function V4StartBar(props: V4StartBarProps | V4NextBarProps) {
  return props.job === "NEXT" ? <NextBar {...props} /> : <StartBar {...props} />;
}

function StartBar(props: V4StartBarProps) {
  const {
    catalog, locale, freePlan, level, widths, width, onWidth, mode, onMode, pathCount, sharePercent, shareDelta, state, onStart,
    justAnswer, carryOnOffered, carryOn, onCarryOn, readyNote, onReadyNote, publicNotice, above, combineLine, narrow, textFocused,
    helpFirst
  } = props;
  const ids = useId();
  const startId = `${ids}-start`;
  const reduced = useReducedMotion();
  const changes = useShareChanges(sharePercent);
  const delta = useShareDelta(sharePercent, shareDelta);
  const [sheetOpen, setSheetOpen] = useState(false);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const barBox = useRef<HTMLDivElement>(null);
  useBarRoom(barBox, narrow);
  const closeSheet = (): void => setSheetOpen(false);

  // The sheet takes focus when it opens and gives it back to "Options" when it closes (Done or Escape). Keyboard audit
  // 2026-11-12 (V4A-11): it is aria-modal, so the shared modal surface also keeps Tab and Shift+Tab inside it.
  useModalSurface(sheetOpen, { containerRef: sheet, initialFocusRef: sheet, onClose: closeSheet, returnFocusRef: optionsButton });
  // A computer has no sheet: one left open when the page widens is closed.
  useEffect(() => {
    if (!narrow) setSheetOpen(false);
  }, [narrow]);

  const shareLine = startPathsShareLine(sharePercent, freePlan);
  const share: ReactNode = (() => {
    if (shareLine === null) return null;
    const words = t(catalog, shareLine.key, { ...shareLine.values, percent: NUMBER_MARK });
    const at = words.indexOf(NUMBER_MARK);
    if (at < 0) return t(catalog, shareLine.key, shareLine.values);
    const moved = changes === 0 ? "" : reduced ? " v4Highlight" : " v4StartRoll";
    return (
      <>
        {words.slice(0, at)}
        <span key={changes} className={`v4StartShareNumber${moved}`}>{sharePercent}</span>
        {words.slice(at + NUMBER_MARK.length)}
      </>
    );
  })();
  const deltaLine = delta === null ? null : shareDeltaLine(delta);
  // ACCESS-14 (as V4ShareChange): "+4%" keeps its sign before the number on right-to-left pages; the share itself says the new figure.
  const deltaMark = deltaLine === null ? null
    : <span key={`${sharePercent}:${delta}`} className="v4ShareChange v4Highlight" aria-hidden="true" dir="ltr">{t(catalog, deltaLine.key, deltaLine.values)}</span>;

  const youGet = pathCount === null ? t(catalog, "v4.read.youGet")
    : tPlural(catalog, level === "expert" ? "v4.start.youGetExpert" : "v4.start.youGet", pathCount, locale);

  const pressable = helpFirst || state === "READY";
  const startWords = helpFirst ? t(catalog, "v4.start.start")
    : state === "PATHS_COMING" ? t(catalog, "v4.start.pathsComing")
      : state === "WRITING_WAIT" ? t(catalog, "v4.start.writingWait")
        : state === "SENDING" ? t(catalog, "v4.ask.starting")
          : state === "CHECKING_PLAN" ? t(catalog, "v4.ask.checkingPlan")
            : t(catalog, "v4.start.start");
  const startButton = (
    <button
      id={startId}
      type="button"
      className="v4Btn v4BtnPrimary v4StartBarStart"
      disabled={!pressable}
      aria-busy={!helpFirst && (state === "SENDING" || state === "WRITING_WAIT" || state === "CHECKING_PLAN")}
      onClick={() => {
        if (pressable) onStart();
      }}
    >
      {startWords}
    </button>
  );

  const justReady = helpFirst || justAnswer.ready;
  const justLink = justAnswer.shown ? (
    <button
      type="button"
      className="v4Link v4AskJust v4StartBarJust"
      aria-disabled={justReady ? undefined : "true"}
      aria-describedby={justReady ? undefined : startId}
      onClick={() => {
        if (justReady) justAnswer.onPress();
      }}
    >
      {t(catalog, "v4.ask.justAnswer")}
    </button>
  ) : null;

  const widthOptions = freePlan || widths === null ? [] : widths.options;
  const howWide = widthOptions.length > 1 ? (
    <div className="v4StartBarWidths" role="group" aria-label={t(catalog, "v4.start.howWide")}>
      <span className="v4StartBarLabel" aria-hidden="true">{t(catalog, "v4.start.howWide")}</span>
      {widthOptions.map((option) => (
        <button key={option} type="button" className="v4Chip" aria-pressed={option === width} onClick={() => onWidth(option)}>
          {tPlural(catalog, "v4.start.pathCount", option, locale)}
        </button>
      ))}
    </div>
  ) : null;

  // Owner N13: Free has no Quick look / Thorough choice (askConfig sends every Free ask as a quick look).
  const modeSwitch = freePlan ? null : (
    <div className="v4AskMode" role="group" aria-label={t(catalog, "v4.read.modeLabel")}>
      {DIG_MODES.map((option) => (
        <button key={option} type="button" aria-pressed={mode === option} onClick={() => onMode(option)}>
          {t(catalog, `v4.digMode.${option}`)}
        </button>
      ))}
    </div>
  );

  const carryOnBox = carryOnOffered ? (
    <label className="v4StartBarCarryOn">
      <input type="checkbox" checked={carryOn} onChange={(event) => onCarryOn(event.target.checked)} />
      <span>{t(catalog, "v4.start.carryOn")}</span>
    </label>
  ) : null;

  const readyButton = readyNote
    ? <button type="button" className="v4Link v4StartBarReady" onClick={onReadyNote}>{t(catalog, "v4.start.readyNote")}</button>
    : null;

  const aside = textFocused ? " v4StartBar--aside" : "";

  if (!narrow) {
    return (
      <>
        {above}
        <div ref={barBox} className={`v4StartBar${aside}`}>
          {combineLine}
          {readyButton}
          <p className="v4StartBarGet">{youGet}</p>
          {share === null ? null : <p className="v4StartBarShare">{share}{deltaMark === null ? null : <>{" "}{deltaMark}</>}</p>}
          {howWide === null && modeSwitch === null ? null : <div className="v4StartBarRow">{howWide}{modeSwitch}</div>}
          {publicNotice}
          <div className="v4StartBarGo">
            {startButton}
            {justLink}
          </div>
          {carryOnBox}
        </div>
      </>
    );
  }

  // Phone: line 1 says the count, the mode (not on Free) and the share, joined as the page's other short lines are.
  const lineParts: ReactNode[] = [
    pathCount === null ? null : tPlural(catalog, "v4.start.pathCount", pathCount, locale),
    freePlan ? null : t(catalog, `v4.digMode.${mode}`),
    share
  ].filter((part) => part !== null);
  const slim = combineLine !== null;

  return (
    <>
      {above}
      <div ref={barBox} className={`v4StartBar v4StartBar--phone${slim ? " v4StartBar--slim" : ""}${aside}`}>
        {publicNotice}
        {slim ? <div className="v4StartBarCombine">{combineLine}</div> : (
          <div className="v4StartBarLine">
            {readyButton}
            <span className="v4StartBarLineText">
              {lineParts.map((part, at) => <span key={at}>{at === 0 ? null : " · "}{part}</span>)}
            </span>
            {deltaMark}
            <button
              ref={optionsButton}
              type="button"
              className="v4Link v4StartBarOptions"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
            >
              {t(catalog, "v4.start.options")}<span aria-hidden="true">{" ⌃"}</span>
            </button>
          </div>
        )}
        <div className="v4StartBarGo">{startButton}</div>
      </div>
      {sheetOpen ? (
        // The sheet appears at once (sliding is not one of the six moves), with the 1-second highlight.
        <div
          ref={sheet}
          className="v4StartSheet v4Highlight"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${ids}-sheet`}
          tabIndex={-1}
        >
          <h2 id={`${ids}-sheet`} className="v4StartSheetTitle">{t(catalog, "v4.start.options")}</h2>
          <p className="v4StartBarGet">{youGet}</p>
          {howWide}
          {modeSwitch}
          {carryOnBox}
          {justLink}
          <button type="button" className="v4Btn v4StartSheetDone" onClick={closeSheet}>{t(catalog, "v4.start.optionsDone")}</button>
        </div>
      ) : null}
    </>
  );
}

/** The step-1 link or button of the NEXT job: a link to sign in when signed out (ask-d1 A), else a button. */
function NextPress({ press, className, pressable, linkRef, children }: Readonly<{
  press: Readonly<{ href?: string; busy?: boolean; describedBy?: string; onPress(event?: MouseEvent<HTMLElement>): void }>;
  className: string;
  pressable: boolean;
  linkRef?: RefObject<HTMLAnchorElement | null> | undefined;
  children: ReactNode;
}>) {
  if (press.href !== undefined) {
    return (
      <a ref={linkRef} className={className} href={press.href} aria-describedby={press.describedBy} onClick={(event) => press.onPress(event)}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={!pressable}
      aria-busy={press.busy === true}
      aria-describedby={press.describedBy}
      onClick={(event) => {
        if (pressable) press.onPress(event);
      }}
    >
      {children}
    </button>
  );
}

/**
 * Task 75b: step 1's Next, "Just answer it" and the grey line under them. Phone: pinned, with the Free notice first; the lines
 * above and the declined line right before it. Computer: one plain row under the level block (no card), the declined line right
 * under Next (ask-f8), the late lines after the row (ask-f16). The Free notice stays right above the row there, as before.
 */
function NextBar(props: V4NextBarProps) {
  const { catalog, justAnswer, next, declined, under, publicNotice, above, narrow, textFocused, helpFirst } = props;
  const barBox = useRef<HTMLDivElement>(null);
  useBarRoom(barBox, narrow);
  // ask-f3: crisis words keep Next and the link pressable, for the help screen alone, whatever greys them.
  const nextButton = (
    <NextPress press={next} className="v4Btn v4BtnPrimary v4StartBarNext" pressable={helpFirst || !next.disabled} linkRef={next.linkRef}>
      {next.label}
    </NextPress>
  );
  const justLink = justAnswer.shown ? (
    <NextPress press={justAnswer} className="v4Link v4AskJust" pressable={helpFirst || justAnswer.ready}>
      {justAnswer.label ?? t(catalog, "v4.ask.justAnswer")}
    </NextPress>
  ) : null;
  const aside = textFocused ? " v4StartBar--aside" : "";
  if (narrow) {
    return (
      <>
        {above}
        {declined}
        <div ref={barBox} className={`v4StartBar v4StartBar--phone v4StartBar--nextPhone v4AskActions${aside}`}>
          {publicNotice}
          {nextButton}
          {justLink}
          {under}
        </div>
      </>
    );
  }
  return (
    <>
      {publicNotice}
      <div ref={barBox} className={`v4StartBar v4StartBar--next v4AskActions${aside}`}>
        {nextButton}
        {declined}
        {justLink}
        {under}
      </div>
      {above}
    </>
  );
}
