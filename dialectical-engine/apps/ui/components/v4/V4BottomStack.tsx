"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 UX fixes (owner picks 3 Nov: journey-d3 A, dig-f16, dig-f17): the bottom of the map page is ONE stack that measures
 * itself, so nothing overlaps and the page's bottom room is the stack's real height (never a guessed 150 px).
 *  - Phone: one pinned bar whose job changes ("Dig into your pick · up to 3%"; dig-f31: with nothing picked, "Choose what
 *    to dig ›", which goes to the choices; or "Write my report" when that is the next step),
 *    with the Map button. Above it, inside the same surface: the slim "Good time to write your report" line when the rule
 *    fires (dig-f17, with a small × to close it), the Undo and ready notes for their few seconds (never floating over
 *    anything), and the picks folded to one line ("Your picks ▸", which opens them); a tour's pinned bar sits right
 *    above the bar (dig-f18). It never takes more than about a
 *    quarter of the screen, steps aside while the keyboard is open, and sits in the page while the cookie bar shows.
 *  - Computer: the Undo and ready notes bottom-left, then the tray, in one column.
 */

export type V4BarJob =
  /**
   * `waiting` (dig-f11, owner's screen review 3 Nov): new digs wait for a reset, so the button stays where it is, greyed,
   * its label carrying the reset time; pressing it shows why (the panel's line above).
   */
  | Readonly<{ kind: "dig"; label: string; onDig: () => void; waiting?: boolean }>
  /** dig-f31: with nothing picked, "Choose what to dig ›" takes the person to the choices instead of digging at once. */
  | Readonly<{ kind: "choose"; label: string; onChoose: () => void }>
  | Readonly<{ kind: "report"; href: string }>
  /** wait-f2: "Paused · Continue" (after the reset) or "Paused · Continues on 1 Dec" (before it; nothing to press). */
  | Readonly<{ kind: "paused"; label: string; continueLabel: string | null; untilLabel: string | null; busy: boolean; onContinue: () => void }>
  | Readonly<{ kind: "none" }>;

/** The stack's real height, as the page's bottom room (a CSS variable on the page root), while it is on screen. */
function useStackRoom(ref: RefObject<HTMLDivElement | null>, phone: boolean): void {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (element === null) return;
    const set = (): void => root.style.setProperty("--v4-stack-room", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    set();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--v4-stack-room");
    };
  }, [ref, phone]);
}

const TYPING = "textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], [contenteditable=true]";

/** dig-f16: true while a text box has focus on a phone (its keyboard is open), so the stack steps aside. */
function useKeyboardOpen(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    const typing = (element: Element | null): boolean => element instanceof Element && element.matches(TYPING);
    const update = (): void => setOpen(typing(document.activeElement));
    // Focus leaving a box lands on the next element only after focusout, so the check waits a tick.
    let timer: number | undefined;
    const later = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 0);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    update();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, [active]);
  return open;
}

export function V4BottomStack(props: Readonly<{
  phone: boolean;
  /** The Undo and ready notes (V4DigNotes); null when there are none. */
  notes: ReactNode;
  /** The tray of picks; null when nothing is picked (or the picks' dig is waiting). */
  tray: ReactNode;
  /**
   * Phone: what stays pinned right above the bar, outside the part that scrolls (dig-f18, the ready-digs track: the
   * tour's "Next change › · Done"). Absent: nothing.
   */
  pinned?: ReactNode;
  /** Phone: the path the picks are on, shown on the folded line. */
  trayTitle?: ReactNode;
  /** Phone: the pinned bar. */
  mapButtonRef?: RefObject<HTMLButtonElement | null>;
  jobRef?: RefObject<HTMLElement | null>;
  onMap?: () => void;
  job?: V4BarJob;
  /** dig-f17: the report rule fired (the page's report moment, dig-f29: lib/v4/mapLooks.ts reportMoment). */
  goodTime: boolean;
  /** Phone (map-f9): one quiet line in the bar, "This question: 11% of today", on the screens other than the question's. */
  status?: ReactNode;
  reportHref: string;
  catalog: MessageCatalog;
}>) {
  const { phone, catalog } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  useStackRoom(ref, phone);
  const aside = useKeyboardOpen(phone);
  const [picksOpen, setPicksOpen] = useState(false);
  const [goodTimeClosed, setGoodTimeClosed] = useState(false);
  const job = props.job ?? { kind: "none" };
  const hasTray = props.tray !== null && props.tray !== undefined && props.tray !== false;
  useEffect(() => {
    if (!hasTray) setPicksOpen(false);
  }, [hasTray]);

  if (!phone) {
    return (
      <div ref={ref} className="v4Stack v4StackWide">
        {props.notes}
        {props.tray}
      </div>
    );
  }

  const showGoodTime = props.goodTime && !goodTimeClosed;
  return (
    <div ref={ref} className={`v4Stack v4StackPhone${aside ? " v4StackAside" : ""}`} data-keyboard={aside ? "open" : undefined}>
      <div className="v4StackTop">
        {showGoodTime ? (
          <div className="v4StackGoodTime" role="note">
            <p className="v4StackGoodText">{t(catalog, "v4.bar.goodTime")}</p>
            {job.kind === "report" ? null : (
              <Link className="v4Btn v4BtnPrimary v4StackGoodReport" href={props.reportHref}>{t(catalog, "v4.rail.writeReport")}</Link>
            )}
            <button
              type="button"
              className="v4StackGoodClose"
              aria-label={t(catalog, "v4.bar.goodTimeClose")}
              onClick={() => setGoodTimeClosed(true)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}
        {props.notes}
        {hasTray ? (
          <div className={`v4StackPicks${picksOpen ? " v4StackPicksOpen" : ""}`}>
            <button
              type="button"
              className="v4StackPicksToggle"
              aria-expanded={picksOpen}
              onClick={() => setPicksOpen((open) => !open)}
            >
              <span>{t(catalog, "v4.bar.yourPicks")}</span>
              <span className="v4StackPicksArrow" aria-hidden="true">▸</span>
              {props.trayTitle === undefined ? null : <span className="v4StackPicksPath">{props.trayTitle}</span>}
            </button>
            {picksOpen ? props.tray : null}
          </div>
        ) : null}
      </div>
      {props.pinned ?? null}
      {props.status ?? null}
      <div className="v4DebPhoneBar">
        <button ref={props.mapButtonRef} type="button" className="v4Btn v4DebPhoneMap" onClick={props.onMap} aria-haspopup="dialog">
          {t(catalog, "v4.debate.mapButton")}
        </button>
        {job.kind === "dig" ? (
          <button
            ref={props.jobRef as RefObject<HTMLButtonElement | null> | undefined}
            type="button"
            className={`v4Btn v4BtnPrimary v4DebPhoneDig${job.waiting === true ? " v4DigWaiting" : ""}`}
            aria-disabled={job.waiting === true ? "true" : undefined}
            onClick={job.onDig}
          >
            {job.label}
          </button>
        ) : null}
        {job.kind === "paused" ? (
          <p className="v4DebPhonePaused" role="status">
            <span className="v4DebPhonePausedWord">{job.label}</span>
            {job.continueLabel !== null ? (
              <>
                {" · "}
                <button
                  ref={props.jobRef as RefObject<HTMLButtonElement | null> | undefined}
                  type="button"
                  className="v4Btn v4BtnPrimary v4DebPhoneDig"
                  disabled={job.busy}
                  aria-busy={job.busy}
                  onClick={job.onContinue}
                >
                  {job.continueLabel}
                </button>
              </>
            ) : job.untilLabel !== null ? <span className="v4Muted">{` · ${job.untilLabel}`}</span> : null}
          </p>
        ) : null}
        {job.kind === "choose" ? (
          <button
            ref={props.jobRef as RefObject<HTMLButtonElement | null> | undefined}
            type="button"
            className="v4Btn v4BtnPrimary v4DebPhoneDig v4DebPhoneChoose"
            onClick={job.onChoose}
          >
            {job.label}
          </button>
        ) : null}
        {job.kind === "report" ? (
          <Link
            ref={props.jobRef as RefObject<HTMLAnchorElement | null> | undefined}
            className="v4Btn v4BtnPrimary v4DebPhoneDig v4DebPhoneReport"
            href={job.href}
          >
            {t(catalog, "v4.rail.writeReport")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
