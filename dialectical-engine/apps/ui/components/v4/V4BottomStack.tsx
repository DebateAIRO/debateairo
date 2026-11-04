"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { V4ShareChange } from "@/components/v4/V4ShareChange";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { focusInPlace, useFocusHandOff } from "@/lib/v4/useFocusHandOff";

/*
 * V4 UX fixes (owner picks 3 Nov: journey-d3 A, dig-f16, dig-f17): the bottom of the map page is ONE stack that measures
 * itself, so nothing overlaps and the page's bottom room is the stack's real height (never a guessed 150 px).
 *  - Phone: one pinned bar whose job changes ("Dig into your pick · up to 3%"; dig-f31: with nothing picked, "Choose what
 *    to dig ›", which goes to the choices; or "Write my report" when that is the next step),
 *    with the Map button. Above it, inside the same surface: the slim "Good time to write your report" line when the rule
 *    fires (dig-f17, with a small × to close it), the Undo and ready notes for their few seconds (never floating over
 *    anything), and the picks folded to one line ("Your picks ▸", which opens them: dig-f4, in the Map sheet, since a
 *    phone has no tray); a tour's pinned bar sits right
 *    above the bar (dig-f18). It never takes more than about a
 *    quarter of the screen, steps aside while the keyboard is open, and sits in the page while the cookie bar shows.
 *  - Computer: the Undo and ready notes bottom-left, then the tray, in one column.
 */

export type V4BarJob =
  /**
   * `waiting` (dig-f11, owner's screen review 3 Nov): new digs wait for a reset (or rest while the report is written,
   * journey-f14), so the button stays where it is, greyed; `reason` is the line that says why, shown right above the bar
   * (journey-f14: a visible line next to it), and pressing the button shows the panel's same line. `share` (journey-f8):
   * the button's share, for its grey change mark.
   */
  | Readonly<{ kind: "dig"; label: string; onDig: () => void; waiting?: boolean; reason?: string; share?: number | null; place?: string }>
  /** dig-f31: with nothing picked, "Choose what to dig ›" takes the person to the choices instead of digging at once. */
  | Readonly<{ kind: "choose"; label: string; onChoose: () => void }>
  | Readonly<{ kind: "report"; href: string }>
  /** wait-f2: "Paused · Continue" (after the reset) or "Paused · Continues on 1 Dec" (before it; nothing to press). */
  | Readonly<{ kind: "paused"; label: string; continueLabel: string | null; untilLabel: string | null; busy: boolean; onContinue: () => void }>
  /**
   * V4 screen review (3 Nov 2026), report-d2: while the report waits or is written, the bar says so where the dig button
   * lives ("Your report · Being written", with the working dot); digging rests meanwhile.
   */
  | Readonly<{ kind: "status"; text: string; working: boolean }>
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
  /** Computer: the tray of picks; null when nothing is picked (or the picks' dig is waiting). A phone has no tray (dig-f4). */
  tray: ReactNode;
  /**
   * Phone: what stays pinned right above the bar, outside the part that scrolls (dig-f18, the ready-digs track: the
   * tour's "Next change › · Done"). Absent: nothing.
   */
  pinned?: ReactNode;
  /** Phone: the path the picks are on, shown on the folded line. */
  trayTitle?: ReactNode;
  /**
   * Phone (dig-f4, 3 Nov): there are picks, and a phone has no tray, so "Your picks ▸" opens the Map sheet, which lists
   * them with Clear (the outline is also the tray), while the pinned bar carries their dig. Absent: no picks line.
   */
  onOpenPicks?: () => void;
  /** Phone: "Your picks ▸", so closing the Map sheet it opened gives focus back to it (lib/v4/useSheetFocusReturn.ts). */
  picksButtonRef?: RefObject<HTMLButtonElement | null>;
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
  /**
   * report-d1 (V4 screen review, 3 Nov 2026): "Write my report" here opens the report's strip in the pinned bar instead of
   * leading to the report page. Absent: the link, as before.
   */
  onWriteReport?: () => void;
  /** report-d1: the report's strip, grown up from the bar while it is open (the bar's report button steps back). */
  strip?: ReactNode;
  catalog: MessageCatalog;
}>) {
  const { phone, catalog } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  useStackRoom(ref, phone);
  const aside = useKeyboardOpen(phone);
  const [goodTimeClosed, setGoodTimeClosed] = useState(false);
  const reasonId = useId();
  const job = props.job ?? { kind: "none" };
  // W2L-4 (the wave-2 checks, 4 Nov): "Paused · Continue" goes once the dig continues. Where its Continue held focus, focus
  // goes to the bar's next job (else the Map button), without scrolling, never to the page's body.
  const { jobRef, mapButtonRef } = props;
  const pausedHandOff = useFocusHandOff(job.kind === "paused", () => focusInPlace(jobRef?.current ?? mapButtonRef?.current ?? null));
  // W2L-5: pressing the greyed dig button gives its visible reason, right above the bar, the shared highlight again.
  const [whyReplay, setWhyReplay] = useState(0);

  if (!phone) {
    return (
      <div ref={ref} className="v4Stack v4StackWide">
        {props.notes}
        {props.tray}
      </div>
    );
  }

  const hasStrip = props.strip !== null && props.strip !== undefined && props.strip !== false;
  const showGoodTime = props.goodTime && !goodTimeClosed && !hasStrip;
  const writeReport = (className: string, ref?: RefObject<HTMLElement | null>): ReactNode => (props.onWriteReport === undefined ? (
    <Link ref={ref as RefObject<HTMLAnchorElement | null> | undefined} className={className} href={job.kind === "report" ? job.href : props.reportHref}>
      {t(catalog, "v4.rail.writeReport")}
    </Link>
  ) : (
    <button ref={ref as RefObject<HTMLButtonElement | null> | undefined} type="button" className={className} onClick={props.onWriteReport}>
      {t(catalog, "v4.rail.writeReport")}
    </button>
  ));
  return (
    <div ref={ref} className={`v4Stack v4StackPhone${aside ? " v4StackAside" : ""}`} data-keyboard={aside ? "open" : undefined}>
      <div className="v4StackTop">
        {showGoodTime ? (
          <div className="v4StackGoodTime" role="note">
            <p className="v4StackGoodText">{t(catalog, "v4.bar.goodTime")}</p>
            {job.kind === "report" ? null : writeReport("v4Btn v4BtnPrimary v4StackGoodReport")}
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
        {props.strip}
        {props.notes}
        {props.onOpenPicks !== undefined ? (
          <div className="v4StackPicks">
            <button ref={props.picksButtonRef} type="button" className="v4StackPicksToggle" aria-haspopup="dialog" onClick={props.onOpenPicks}>
              <span>{t(catalog, "v4.bar.yourPicks")}</span>
              <span className="v4StackPicksArrow" aria-hidden="true">▸</span>
              {props.trayTitle === undefined ? null : <span className="v4StackPicksPath">{props.trayTitle}</span>}
            </button>
          </div>
        ) : null}
      </div>
      {props.pinned ?? null}
      {props.status ?? null}
      {/* journey-f14 (the wave-2 checks, 4 Nov): the greyed button's reason is a visible line right above it, never only
          for screen readers. */}
      {job.kind === "dig" && job.waiting === true && job.reason !== undefined ? (
        <p key={whyReplay} id={reasonId} className={`v4PanelHint v4Muted v4DebPhoneWhy${whyReplay > 0 ? " v4Highlight" : ""}`} data-bar-why="">
          {job.reason}
        </p>
      ) : null}
      <div className="v4DebPhoneBar">
        <button ref={props.mapButtonRef} type="button" className="v4Btn v4DebPhoneMap" onClick={props.onMap} aria-haspopup="dialog">
          {t(catalog, "v4.debate.mapButton")}
        </button>
        {job.kind === "dig" ? (
          <>
            <button
              ref={props.jobRef as RefObject<HTMLButtonElement | null> | undefined}
              type="button"
              className={`v4Btn v4BtnPrimary v4DebPhoneDig${job.waiting === true ? " v4DigWaiting" : ""}`}
              aria-disabled={job.waiting === true ? "true" : undefined}
              aria-describedby={job.waiting === true && job.reason !== undefined ? reasonId : undefined}
              onClick={() => {
                if (job.waiting === true) setWhyReplay((count) => count + 1);
                job.onDig();
              }}
            >
              {job.label}
            </button>
            {/* journey-f8: a changed share in grey for 2 seconds, here too (the panel's own mark is hidden on a phone). */}
            {job.waiting === true ? null : <V4ShareChange share={job.share ?? null} subject={job.place ?? null} />}
          </>
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
                  // W2L-4: it keeps its focus while the press is on its way (never natively disabled); a press then does nothing.
                  aria-disabled={job.busy ? "true" : undefined}
                  aria-busy={job.busy ? "true" : undefined}
                  onClick={() => { if (!job.busy) job.onContinue(); }}
                  onFocus={pausedHandOff.onFocus}
                  onBlur={pausedHandOff.onBlur}
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
        {job.kind === "report" && !hasStrip ? writeReport("v4Btn v4BtnPrimary v4DebPhoneDig v4DebPhoneReport", props.jobRef) : null}
        {job.kind === "status" ? (
          <p className="v4DebPhoneStatus" data-bar-status="">
            {job.working ? <span className="v4WaitDot v4WaitDot-PULSE" aria-hidden="true" /> : null}
            <span>{job.text}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
