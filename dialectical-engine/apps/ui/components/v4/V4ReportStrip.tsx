"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { contractClient } from "@/lib/api";
import { readAskRoom, type AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { v4RoomQuery } from "@/lib/v4/askConfig";
import { waitForDigs } from "@/lib/v4/digUndo";
import { replayHighlight } from "@/lib/v4/highlight";
import { writeReport } from "@/lib/v4/load";
import { loadRunPublished, REPORT_SLOW_MS, reportWaitLineOf, type ReportStage } from "@/lib/v4/reportWriting";
import { quotaChanged, useQuotaRefresh } from "@/lib/v4/quotaPulse";
import type { WaitState } from "@/lib/v4/stateWords";
import { useFocusHandOff } from "@/lib/v4/useFocusHandOff";
import type { ReportWatch } from "@/lib/v4/useReportVersions";
import { V4ReportDigWait } from "./V4DigUndo";
import { V4WaitCard } from "./V4WaitCard";

/*
 * V4 screen review (owner picks 3 Nov 2026), the report from the map.
 *
 * report-d1 A: pressing "Write my report" turns the button into a small strip in the same spot (in the top bar, or in
 * the phone's pinned bar when it was pressed there): what the report covers, roughly what share of today's quota it uses
 * (only once the server says it; never on Free, where the report comes from the small reserve), that no dig can start
 * while it is written, and on Free "This question is public, so your report will be public too." (report-f15, unless the
 * question's check kept it private). Two buttons: Write it and Not yet; focus goes to Write it, and Esc or Not yet brings
 * the button back. Write it sends at once (no 10-second Undo: journey-f21 keeps the report's confirmation strip), after
 * any dig still in its 10 seconds (ruling F7: "Your report will wait for it."). A press that cannot be confirmed says
 * "We couldn't confirm your report started." and reads the versions again (report-f6): writing found means the map shows
 * it being written, else Try again. When the person asked at the start step to let the AIs carry on to the report, there
 * is no strip: the press asks for it at once.
 *
 * report-d2 A: the person stays on the map, which shows the report waiting for digs or being written in the shared
 * waiting card (journey-d2: V4WaitCard, "Being written", "Started 14:02" only when this visit knows it), with the quiet
 * reason "Digging opens again when your report is written."; after 15 minutes the report page's "This is taking longer
 * than usual. We keep checking." with Check again (report-f8). A version that could not be written says so; the top
 * button then reads "Write it again". The ready moment is the map's (useV4Ready). Nothing here is kept in the browser.
 *
 * V4 start step, Task 56c (item public-f25; owner answer Q20 B: only a debate's very first report uses the kept reserve): a further
 * report on a public debate waits for the reset like digs. While the page is sure of it (lib/v4/money.ts reportWaitLine), Write it
 * waits as the dig button does (journey-f14): greyed but focusable, with "This report can start after 08:00." above it; a press shows
 * that line again and sends nothing. A press refused anyway (WAITS_FOR_RESET: the room changed since it was read) shows the same line,
 * never "We couldn't confirm your report started." and never Try again, and reads the room and the versions again.
 */

/** Where the strip shows: by the button that opened it (the top bar, or the phone's pinned bar). */
export type ReportStripPlace = "top" | "bottom";
/**
 * report-f6: a press whose answer was lost: being checked, or checked and nothing started (Try again). Task 56c: WAITS, the press was
 * refused until the reset (nothing started; the strip says when it can start).
 */
export type ReportPressNote = "CHECKING" | "TRY_AGAIN" | "WAITS";

export type V4ReportStripProps = Readonly<{
  id: string;
  place: ReportStripPlace;
  /** Whether any dig was made: the line on what the report covers says so. */
  hasDigs: boolean;
  /** The report's share of today, once the server says it (never guessed); null: the line is left out. */
  sharePercent: number | null;
  /** report-f15: a Free question that is public: "your report will be public too". */
  publicLine: boolean;
  /** The first question's run id: a dig of it still in its 10 seconds is named (ruling F7). */
  rootRunId: string;
  busy: boolean;
  note: ReportPressNote | null;
  /**
   * Task 56c: the report waits for the reset: the words that say when it can start (shown, and Write it waits). Null or absent: none,
   * except after a press refused until the reset (note WAITS), which says the site's plain reset line until the room is read again.
   */
  waitLine?: string | null;
  onWrite: () => void;
  onNotYet: () => void;
  catalog: MessageCatalog;
}>;

export function V4ReportStrip(props: V4ReportStripProps) {
  const { catalog, id } = props;
  const writeRef = useRef<HTMLButtonElement | null>(null);
  // Task 56c: the line that says when the report can start, while it waits (a refused press too).
  const waits = props.waitLine ?? (props.note === "WAITS" ? t(catalog, "v4.public.refusal.waitsForReset") : null);
  const waitsId = `${id}-waits`;
  // Focus goes to Write it as the strip opens; the lines above it describe the group, so a screen reader reads them first.
  useEffect(() => {
    writeRef.current?.focus();
  }, []);
  // report-f6: once the check found nothing started, focus comes back to the button, which now reads Try again.
  useEffect(() => {
    if (props.note === "TRY_AGAIN") writeRef.current?.focus();
  }, [props.note]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    props.onNotYet();
  };
  const described = [`${id}-covers`, props.sharePercent === null ? null : `${id}-share`, `${id}-rest`,
    props.publicLine ? `${id}-public` : null, waits === null ? null : waitsId].filter((part): part is string => part !== null).join(" ");
  return (
    <div
      id={id}
      className={`v4RepStrip v4RepStrip-${props.place} v4Highlight`}
      role="group"
      aria-label={t(catalog, "v4.rail.writeReport")}
      aria-describedby={described}
      onKeyDown={onKeyDown}
      data-report-strip={props.place}
    >
      <p id={`${id}-covers`} className="v4RepStripLine">
        {t(catalog, props.hasDigs ? "v4.reportStrip.covers" : "v4.reportStrip.coversNoDigs")}
      </p>
      {props.sharePercent === null ? null : (
        <p id={`${id}-share`} className="v4RepStripLine" data-report-share="">
          {t(catalog, "v4.reportStrip.share", { percent: props.sharePercent })}
        </p>
      )}
      <p id={`${id}-rest`} className="v4RepStripLine v4Muted">{t(catalog, "v4.reportStrip.digsWait")}</p>
      <V4ReportDigWait runId={props.rootRunId} catalog={catalog} />
      {/* Task 56c: while the report waits for the reset, when it can start, in place of "We couldn't confirm" (never with it). */}
      {waits !== null ? (
        <p id={waitsId} className="v4RepStripLine v4RepStripNote" role={props.note === "WAITS" ? "alert" : undefined} data-report-waits="">{waits}</p>
      ) : props.note === null ? null : (
        <p className="v4RepStripLine v4RepStripNote" role="alert">{t(catalog, "v4.investigation.startUnconfirmed")}</p>
      )}
      {/* report-f15 / ACCESS-1: right above Write it, so it is in view where focus lands (the phone's stack is short). */}
      {props.publicLine ? (
        <p id={`${id}-public`} className="v4RepStripLine v4RepStripPublic" data-report-public="">{t(catalog, "v4.report.publicToo")}</p>
      ) : null}
      <div className="v4RepStripActions">
        {/* ACCESS-6: both stay focusable while the press is on its way (up to a dig's 10 seconds), so Esc still reaches the
            strip and focus is never lost; a press meanwhile does nothing. */}
        {/* Task 56c: while the report waits, Write it stays here, greyed (journey-f14); a press shows the line again and sends nothing. */}
        <button
          ref={writeRef}
          type="button"
          className={`v4Btn v4BtnPrimary v4RepStripWrite${waits === null ? "" : " v4DigWaiting"}`}
          aria-disabled={props.busy || waits !== null ? "true" : undefined}
          aria-busy={props.busy}
          aria-describedby={waits === null ? undefined : waitsId}
          onClick={() => {
            if (waits !== null) {
              replayHighlight(document.getElementById(waitsId));
              return;
            }
            if (!props.busy) props.onWrite();
          }}
        >
          {t(catalog, props.note === "TRY_AGAIN" ? "v4.common.retry" : "v4.reportStrip.write")}
        </button>
        <button type="button" className="v4Link v4RepStripNotYet" aria-disabled={props.busy ? "true" : undefined}
          onClick={() => { if (!props.busy) props.onNotYet(); }}>
          {t(catalog, "v4.reportStrip.notYet")}
        </button>
      </div>
    </div>
  );
}

export type ReportStart = Readonly<{
  /** Where the strip shows (by the button that opened it), or null while it is closed. */
  at: ReportStripPlace | null;
  /** A press is on its way (waiting for a dig's 10 seconds, sent, or being checked). */
  busy: boolean;
  note: ReportPressNote | null;
  /** "Write my report" pressed at this place: the strip opens there (with carry-on: the report is asked for at once). */
  open: (at: ReportStripPlace) => void;
  write: () => void;
  notYet: () => void;
  /** report-f16's rule (focus goes to the new status): the waiting card takes focus once, after the report was asked for. */
  focusCard: boolean;
  cardFocused: () => void;
}>;

/** The press of "Write my report" on the map: the strip's place, Write it and Not yet. */
export function useReportStart(input: Readonly<{
  watch: Pick<ReportWatch, "rootRunId" | "notePress" | "reread">;
  /** The map's own run id, until the investigation names the first question's. */
  runId: string;
  /** False once the report waits, is written or stands (asked from elsewhere): an open strip closes. */
  canAsk: boolean;
  /** The person asked at the start step to let the AIs carry on to the report: no strip (report-d1). Absent: false. */
  carryOn?: boolean;
  /** Task 56c: the report waits for the reset (its line shows): a press opens nothing and sends nothing. Absent: false. */
  waits?: boolean;
  /** Not yet (or Esc): focus goes back to the button that opened the strip, once it is drawn again. */
  focusOpener: (at: ReportStripPlace) => void;
}>): ReportStart {
  const [at, setAt] = useState<ReportStripPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ReportPressNote | null>(null);
  const [focusCard, setFocusCard] = useState(false);
  const [back, setBack] = useState<Readonly<{ at: ReportStripPlace; serial: number }> | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const live = useRef(input);
  useEffect(() => {
    live.current = input;
  });
  useEffect(() => {
    if (back !== null) live.current.focusOpener(back.at);
  }, [back]);
  // Asked from elsewhere (another tab, the carry-on): the strip has nothing left to ask.
  useEffect(() => {
    if (at !== null && !input.canAsk && !flight.current) {
      setAt(null);
      setNote(null);
    }
  }, [at, input.canAsk]);

  const send = useCallback((place: ReportStripPlace): void => {
    if (flight.current || live.current.waits === true) return;
    flight.current = true;
    setBusy(true);
    setNote(null);
    void (async () => {
      const { watch, runId } = live.current;
      const root = watch.rootRunId ?? runId;
      // Ruling F7: a dig still in its 10 seconds is not on the server yet; the report is asked for once it is sent (or undone).
      await waitForDigs(root);
      if (!alive.current) return;
      watch.notePress();
      const result = await writeReport(root);
      if (!alive.current) return;
      if (result.kind === "WAITS_FOR_RESET") {
        // Task 56c (public-f25): refused before anything started, since the room changed after the page read it. The strip says when
        // the report can start, never "We couldn't confirm" and never Try again; the room and the versions are read again, so the
        // line names the reset and the button waits from now on.
        setNote("WAITS");
        setAt(place);
        flight.current = false;
        setBusy(false);
        quotaChanged();
        void live.current.watch.reread();
        return;
      }
      let asked = true;
      if (result.kind === "FAILED") {
        // report-f6: the reply may have been lost after the server started, so the page never says nothing was used.
        setNote("CHECKING");
        setAt(place);
      }
      const next = await live.current.watch.reread();
      if (!alive.current) return;
      const writing = next !== null && next.versions.at(-1)?.state === "WRITING";
      if (result.kind === "FAILED") {
        asked = writing;
        setNote(asked ? null : "TRY_AGAIN");
      }
      flight.current = false;
      setBusy(false);
      if (!asked) return;
      // WHOLE-11 (public-d3 A, public-f15): the report uses quota, so the figures read again ("updates quietly after each start").
      quotaChanged();
      setAt(null);
      // The waiting card takes focus once it shows (a press answered CLOSED found a finished report instead: no card, so
      // focus goes back to the button that opened the strip, ACCESS-6).
      if (writing) setFocusCard(true);
      else setBack((before) => ({ at: place, serial: (before?.serial ?? 0) + 1 }));
    })();
  }, []);

  const open = useCallback((place: ReportStripPlace): void => {
    if (flight.current || live.current.waits === true) return;
    if (live.current.carryOn === true) {
      send(place);
      return;
    }
    setNote(null);
    setAt(place);
  }, [send]);

  const atNow = useRef(at);
  useEffect(() => {
    atNow.current = at;
  });
  const notYet = useCallback((): void => {
    if (flight.current) return;
    const place = atNow.current;
    setAt(null);
    setNote(null);
    if (place !== null) setBack((before) => ({ at: place, serial: (before?.serial ?? 0) + 1 }));
  }, []);

  const cardFocused = useCallback((): void => setFocusCard(false), []);
  return {
    at,
    busy,
    note,
    open,
    write: () => {
      if (at !== null) send(at);
    },
    notYet,
    focusCard,
    cardFocused
  };
}

/**
 * report-f15: on Free, whether the question is public now (the visibility read says PUBLISHED; a question its check kept
 * private stays PRIVATE). Read once per question, only when `free`; false until it answers, and when it cannot be read.
 */
export function useQuestionPublic(runId: string | null, free: boolean): boolean {
  const [published, setPublished] = useState<Readonly<{ runId: string; value: boolean }> | null>(null);
  useEffect(() => {
    if (runId === null || !free) return;
    let active = true;
    void loadRunPublished(runId).then((value) => {
      if (active) setPublished({ runId, value: value === true });
    });
    return () => {
      active = false;
    };
  }, [runId, free]);
  return free && runId !== null && published?.runId === runId && published.value;
}

/**
 * V4 start step, Task 56c (public-f25): the person's room read for the report page, which has no ask of its own: whether new starts
 * wait for a reset, and until when (the windows are the person's, whatever question the read names; a new question's quick look is
 * named). Read only while `wanted` (a public debate whose next report is not its first, or after a press refused until the reset), and
 * again after each quota moment and when the tab comes back. Null while not wanted, before it answers, and when it cannot be read.
 */
export function useReportRoom(wanted: boolean, free: boolean): AskRoom | null {
  const [room, setRoom] = useState<Readonly<{ free: boolean; room: AskRoom | null }> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const read = useCallback((): void => {
    void readAskRoom(contractClient, v4RoomQuery("quick", "plain", { planTier: free ? "free" : "premium", shapeSettings: false, lengthSettings: false }))
      .then((next) => {
        if (alive.current) setRoom({ free, room: next });
      });
  }, [free]);
  useEffect(() => {
    if (wanted) read();
  }, [wanted, read]);
  useQuotaRefresh(read, wanted);
  return wanted && room?.free === free ? room.room : null;
}

/** The shared waiting card's state for the report (report-d2), or null when nothing waits. */
export function reportWaitStateOf(stage: ReportStage): WaitState | null {
  switch (stage.kind) {
    case "WAITING_DIGS":
      return { kind: "WAITING", startsAfter: null };
    case "WRITING":
      return { kind: "BEING_WRITTEN" };
    case "FAILED":
      return { kind: "DIDNT_FINISH" };
    default:
      return null;
  }
}

/** True once `from` (ms) is `afterMs` behind; it turns true at that moment, without a clock ticking on the page. */
function useLater(from: number | null, afterMs: number): boolean {
  const [late, setLate] = useState<Readonly<{ from: number }> | null>(null);
  useEffect(() => {
    if (from === null) return;
    const left = from + afterMs - Date.now();
    if (left <= 0) {
      setLate({ from });
      return;
    }
    const timer = window.setTimeout(() => setLate({ from }), left);
    return () => window.clearTimeout(timer);
  }, [from, afterMs]);
  return from !== null && late?.from === from;
}

export type V4ReportWaitProps = Readonly<{
  stage: ReportStage;
  /**
   * The owner's answers of 5 Nov (question 23 A): the question of the one dig the report waits for (report-f7's rule,
   * lib/v4/reportWriting.ts waitingDigQuestionOf), named in the wait line as the report page does. Null or absent: no name.
   */
  waitingDig?: string | null;
  /**
   * report-f14: the language the dig's question is written in (the debate's), so its words carry it as on the report page.
   * Null, absent or "und": no language mark, as before.
   */
  waitingDigLanguage?: string | null;
  /** When writing started, only when this visit knows it (ms). */
  writingSince: number | null;
  /** report-f8: where the 15 minutes count from (ms), or null. */
  slowFrom: number | null;
  checkedAt: number | null;
  reconnecting: boolean;
  onTryNow: () => void;
  /** Focus moves here once, after this page asked for the report (`onFocused` says it is done). */
  focusPending?: boolean;
  onFocused?: () => void;
  /**
   * The wave-2 checks (4 Nov): the card goes once the report is written. Where it held focus, this gives focus a place to
   * go (on the map: the phone's pinned bar, else the header's report link, without scrolling), never the page's body.
   * Absent: nothing is moved.
   */
  onFocusGone?: () => void;
  catalog: MessageCatalog;
  locale: string;
}>;

/**
 * The report's wait line, the report page's (question 23 A): the one dig by its question, its words marked as AI text in
 * their own direction and, when known, their language (report-f14); else "the dig in progress" or "the digs in progress",
 * with no number.
 */
function WaitLine({ waiting, dig, language, catalog, locale }: Readonly<{
  waiting: number; dig: string | null; language: string | null; catalog: MessageCatalog; locale: string;
}>) {
  const line = reportWaitLineOf(waiting, dig, catalog, locale);
  const lang = language === null || language.trim().length === 0 || language === "und" ? undefined : language;
  return (
    <p className="v4DebReportWaitLine">
      {line.kind === "NAMED" ? <>{line.before}<span data-ai-generated="true" dir="auto" lang={lang}>{line.dig}</span>{line.after}</> : line.text}
    </p>
  );
}

/** report-d2: the report waiting for digs, being written, or not written, in the shared waiting card on the map. */
export function V4ReportWait(props: V4ReportWaitProps) {
  const { stage, catalog, locale } = props;
  const state = reportWaitStateOf(stage);
  const slow = useLater(props.slowFrom, REPORT_SLOW_MS);
  const ref = useRef<HTMLElement | null>(null);
  const { focusPending, onFocused, onFocusGone } = props;
  const shown = state !== null;
  useEffect(() => {
    if (focusPending !== true || !shown) return;
    ref.current?.focus();
    onFocused?.();
  }, [focusPending, onFocused, shown]);
  // Whether focus is in the card, from its own focus events (lib/v4/useFocusHandOff.ts): once it goes while it holds
  // focus, focus is handed on (never to the page's body); a click on plain text meanwhile means it no longer holds it.
  const handOff = useFocusHandOff(shown, onFocusGone);
  if (state === null) return null;
  const rests = stage.kind === "WAITING_DIGS" || stage.kind === "WRITING";
  return (
    <section
      ref={ref}
      className="v4DebReportWait"
      aria-labelledby="v4-deb-report-wait"
      tabIndex={-1}
      data-report-wait={stage.kind}
      onFocus={handOff.onFocus}
      onBlur={handOff.onBlur}
    >
      <p id="v4-deb-report-wait" className="v4Eyebrow">{t(catalog, "v4.rail.stepReport")}</p>
      <V4WaitCard
        variant="inline"
        state={state}
        startedAt={props.writingSince === null ? null : new Date(props.writingSince).toISOString()}
        checkedAt={props.checkedAt}
        reconnecting={props.reconnecting}
        onTryNow={props.onTryNow}
        catalog={catalog}
        locale={locale}
      >
        {stage.kind === "WAITING_DIGS" ? <WaitLine waiting={stage.waitingForDigs} dig={props.waitingDig ?? null} language={props.waitingDigLanguage ?? null} catalog={catalog} locale={locale} /> : null}
        {stage.kind === "FAILED" ? <p className="v4DebReportWaitLine">{t(catalog, "v4.investigation.failed")}</p> : null}
        {stage.kind === "WRITING" && slow ? (
          <div className="v4DebReportWaitSlow" data-report-slow="">
            <p className="v4DebReportWaitLine">{t(catalog, "v4.investigation.slow")}</p>
            <button type="button" className="v4Link v4DebReportWaitCheck" onClick={props.onTryNow}>
              {t(catalog, "v4.investigation.checkAgain")}
            </button>
          </div>
        ) : null}
        {rests ? <p className="v4DebReportWaitLine v4Muted" data-dig-rest="">{t(catalog, "v4.reportWait.digsRest")}</p> : null}
      </V4WaitCard>
    </section>
  );
}
