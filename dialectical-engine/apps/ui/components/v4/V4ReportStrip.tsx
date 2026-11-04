"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { waitForDigs } from "@/lib/v4/digUndo";
import { writeReport } from "@/lib/v4/load";
import { loadRunPublished, REPORT_SLOW_MS, type ReportStage } from "@/lib/v4/reportWriting";
import type { WaitState } from "@/lib/v4/stateWords";
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
 */

/** Where the strip shows: by the button that opened it (the top bar, or the phone's pinned bar). */
export type ReportStripPlace = "top" | "bottom";
/** report-f6: a press whose answer was lost: being checked, or checked and nothing started (Try again). */
export type ReportPressNote = "CHECKING" | "TRY_AGAIN";

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
  onWrite: () => void;
  onNotYet: () => void;
  catalog: MessageCatalog;
}>;

export function V4ReportStrip(props: V4ReportStripProps) {
  const { catalog, id } = props;
  const writeRef = useRef<HTMLButtonElement | null>(null);
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
    props.publicLine ? `${id}-public` : null].filter((part): part is string => part !== null).join(" ");
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
      {props.publicLine ? (
        <p id={`${id}-public`} className="v4RepStripLine v4RepStripPublic" data-report-public="">{t(catalog, "v4.report.publicToo")}</p>
      ) : null}
      <V4ReportDigWait runId={props.rootRunId} catalog={catalog} />
      {props.note === null ? null : (
        <p className="v4RepStripLine v4RepStripNote" role="alert">{t(catalog, "v4.investigation.startUnconfirmed")}</p>
      )}
      <div className="v4RepStripActions">
        <button
          ref={writeRef}
          type="button"
          className="v4Btn v4BtnPrimary v4RepStripWrite"
          disabled={props.busy}
          onClick={props.onWrite}
        >
          {t(catalog, props.note === "TRY_AGAIN" ? "v4.common.retry" : "v4.reportStrip.write")}
        </button>
        <button type="button" className="v4Link v4RepStripNotYet" disabled={props.busy} onClick={props.onNotYet}>
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
    if (flight.current) return;
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
      setAt(null);
      // The waiting card takes focus once it shows (a press answered CLOSED found a finished report instead: no card).
      if (writing) setFocusCard(true);
    })();
  }, []);

  const open = useCallback((place: ReportStripPlace): void => {
    if (flight.current) return;
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
  catalog: MessageCatalog;
  locale: string;
}>;

/** report-d2: the report waiting for digs, being written, or not written, in the shared waiting card on the map. */
export function V4ReportWait(props: V4ReportWaitProps) {
  const { stage, catalog, locale } = props;
  const state = reportWaitStateOf(stage);
  const slow = useLater(props.slowFrom, REPORT_SLOW_MS);
  const ref = useRef<HTMLElement | null>(null);
  const { focusPending, onFocused } = props;
  const shown = state !== null;
  useEffect(() => {
    if (focusPending !== true || !shown) return;
    ref.current?.focus();
    onFocused?.();
  }, [focusPending, onFocused, shown]);
  if (state === null) return null;
  const rests = stage.kind === "WAITING_DIGS" || stage.kind === "WRITING";
  return (
    <section
      ref={ref}
      className="v4DebReportWait"
      aria-labelledby="v4-deb-report-wait"
      tabIndex={-1}
      data-report-wait={stage.kind}
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
        {stage.kind === "WAITING_DIGS" ? (
          <p className="v4DebReportWaitLine">
            {tPlural(catalog, "v4.investigation.waitingDigs", stage.waitingForDigs, locale, { n: stage.waitingForDigs })}
          </p>
        ) : null}
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
