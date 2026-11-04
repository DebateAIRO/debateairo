"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Answer } from "@debateai/contract";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import {
  canAskForReport, carryOnOf, digsRestFor, reportMomentAllowed, reportSharePercentOf, type ReportStage
} from "@/lib/v4/reportWriting";
import { stateWordText, whenText } from "@/lib/v4/stateWords";
import { quotaChanged } from "@/lib/v4/quotaPulse";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";
import { useReportWatch, type ReportAnswer } from "@/lib/v4/useReportVersions";
import type { V4RailReport } from "./V4Rail";
import { reportWaitStateOf, useQuestionPublic, useReportStart, V4ReportStrip, V4ReportWait, type ReportStripPlace } from "./V4ReportStrip";

/*
 * V4 screen review (owner picks 3 Nov 2026), report-d1 A, report-d2 A and report-f15: the map page's report, in one place,
 * so V4DebateClient only wires it in. It watches the investigation (useReportWatch), presses "Write my report" through
 * the strip (useReportStart), and hands the page:
 *  - the top bar's one report button (map-f15): it opens the strip while a report can be asked for (FAILED: "Write it
 *    again"), and is the link to the first question's report page otherwise (report-f9: never a dig's);
 *  - on the phone, the same strip in the pinned bar when "Write my report" was pressed there, and the bar's line while
 *    the report waits or is written ("Your report · Being written"), in place of the dig button;
 *  - the waiting card (V4ReportWait) and the rail step's line ("Being written · Started 14:02", with the working dot);
 *  - whether dig buttons rest, with the quiet reason, and whether dig-f29's "Good time to write your report" may show.
 * Nothing here is kept in the browser.
 */

export type MapReportInput = Readonly<{
  /** The page's own run id (a dig's on a dig's map). */
  runId: string;
  /** The served debate's run id, or null while the page waits for it. */
  servedRunId: string | null;
  isDig: boolean;
  /** The served answer (the start step's "carry on to the report" box, once its answers carry it). */
  answer: Answer | null | undefined;
  /** report-f15: a Free question (it ran on Free, or the person is on Free). */
  free: boolean;
  /** report-d1: a share of today may be shown (never on Free: its report comes from the small reserve). */
  sharesShown: boolean;
  /** The digs on this map, as a key: a new one reopens a closed investigation, so the versions are read again. */
  digsKey: string;
  /** The reading level the report link carries (only one the person chose). */
  level: ReadingLevel | null;
  /** The report this page saw being written is ready (the map's ready moment, journey-f17). */
  onReady: (version: number) => void;
  /** The phone's pinned bar job button, for focus coming back after "Not yet". */
  barJobRef: RefObject<HTMLElement | null>;
  catalog: MessageCatalog;
  locale: string;
}>;

export type MapReport = Readonly<{
  /** The first question's current report answer, on its own map (null on a dig's map and before any report). */
  answer: ReportAnswer | null;
  /** The first question's report page (report-f9). */
  href: string;
  stage: ReportStage;
  /** The top bar's report button (with dig-f29's mark when `good`); nothing while the strip is open there. */
  headerItem: (good: boolean) => ReactNode;
  /**
   * The strip, once "Write my report" in the top bar opened it (null otherwise). The header draws it after its account
   * button (V4Header's `after`), so the keyboard meets it where it is seen.
   */
  headerStrip: ReactNode;
  /** Phone: the strip when "Write my report" was pressed in the pinned bar (null otherwise). */
  bottomStrip: ReactNode;
  /** Phone: "Write my report" in the pinned bar opens the strip there; absent while it cannot (it links, as before). */
  writeFromBar: (() => void) | undefined;
  /** Phone: the pinned bar's line while the report waits or is written (null otherwise). */
  barStatus: V4RailReport | null;
  /** The waiting card, or null when nothing waits. */
  waitCard: ReactNode;
  /** The rail's "Your report" step line, or undefined when nothing waits. */
  rail: V4RailReport | undefined;
  /** Dig buttons rest (the report waits, is written, or is being asked for), with this quiet reason. */
  digsRest: boolean;
  restReason: string;
  /** dig-f29's report moment may show. */
  momentAllowed: boolean;
}>;

/** The rail's (and the phone bar's) words for where the report stands, from the shared state words (journey-f22). */
function railOf(stage: ReportStage, writingSince: number | null, catalog: MessageCatalog, locale: string): V4RailReport | undefined {
  const state = reportWaitStateOf(stage);
  if (state === null) return undefined;
  const word = stateWordText(state, catalog, locale);
  const since = writingSince === null ? null : whenText(writingSince, locale);
  return {
    text: since === null ? word : `${word} · ${t(catalog, "v4.wait.started", { time: since })}`,
    working: state.kind === "BEING_WRITTEN"
  };
}

export function useMapReport(input: MapReportInput): MapReport {
  const { catalog, locale } = input;
  // report-d1: with the start step's "carry on to the report" box the report starts by itself, so the map keeps watching.
  const carryOn = carryOnOf(input.answer);
  const watch = useReportWatch(input.servedRunId, input.isDig, input.onReady, carryOn);
  const { stage } = watch;
  const canAsk = canAskForReport(stage);
  // WHOLE-11 (public-d3 A, public-f15): a report that was being written and is now written (or did not finish) is a quota
  // moment: the figures read again. A report already done when the page opened is not.
  const stageKindBefore = useRef(stage.kind);
  useEffect(() => {
    const before = stageKindBefore.current;
    stageKindBefore.current = stage.kind;
    if ((before === "WRITING" || before === "WAITING_DIGS") && (stage.kind === "DONE" || stage.kind === "FAILED")) quotaChanged();
  }, [stage.kind]);
  // The header's report button, or its link once the report waits, is written or stands (ACCESS-6: focus can go back to it).
  const headerRef = useRef<HTMLElement | null>(null);
  const start = useReportStart({
    watch,
    runId: input.servedRunId ?? input.runId,
    canAsk,
    carryOn,
    focusOpener: (at: ReportStripPlace) => (at === "top" ? headerRef.current : input.barJobRef.current)?.focus()
  });

  // A dig started on this map reopens a closed investigation: the versions are read again, so the button asks again.
  const stageNow = useRef(stage);
  useEffect(() => {
    stageNow.current = stage;
  });
  const digsKey = useRef(input.digsKey);
  const { reread } = watch;
  useEffect(() => {
    if (digsKey.current === input.digsKey) return;
    digsKey.current = input.digsKey;
    if (stageNow.current.kind === "DONE" || stageNow.current.kind === "FAILED") void reread();
  }, [input.digsKey, reread]);

  const root = watch.rootRunId ?? input.servedRunId ?? input.runId;
  const href = levelHref(`/v4/debate/${encodeURIComponent(root)}/report`, input.level);
  const publicLine = useQuestionPublic(watch.rootRunId ?? input.servedRunId, input.free);
  const sharePercent = input.sharesShown ? reportSharePercentOf(watch.read) : null;
  const strip = (place: ReportStripPlace): ReactNode => (
    <V4ReportStrip
      id={`v4-report-strip-${place}`}
      place={place}
      hasDigs={(watch.read?.digs ?? 0) > 0}
      sharePercent={sharePercent}
      publicLine={publicLine}
      rootRunId={root}
      busy={start.busy}
      note={start.note}
      onWrite={start.write}
      onNotYet={start.notYet}
      catalog={catalog}
    />
  );
  const label = t(catalog, stage.kind === "FAILED" ? "v4.investigation.writeAgain" : "v4.rail.writeReport");

  const headerItem = (good: boolean): ReactNode => {
    if (start.at === "top") return null;
    const mark = good ? <span className="v4DebReportMark" aria-hidden="true" /> : null;
    const goodWords = good ? <span className="v4SrOnly">{` · ${t(catalog, "v4.rail.goodTimeTitle")}`}</span> : null;
    const className = `v4Btn v4BtnPrimary v4DebReportLink${good ? " v4DebReportGood" : ""}`;
    if (canAsk) {
      return (
        <button
          ref={headerRef as RefObject<HTMLButtonElement | null>}
          type="button"
          className={className}
          // The wave-2 checks (ACCESS-6's rule on this button): with the start step's carry-on box a press sends at once and
          // may wait for a dig's 10 seconds; the button keeps its focus (aria-disabled, never native) and ignores presses.
          aria-disabled={start.busy ? "true" : undefined}
          aria-busy={start.busy ? "true" : undefined}
          onClick={() => {
            if (!start.busy) start.open("top");
          }}
        >
          {mark}
          {label}
          {goodWords}
        </button>
      );
    }
    // W3-4: always there once the answer is served; while the report waits, is written or stands, it leads to its page.
    return (
      <Link ref={headerRef as RefObject<HTMLAnchorElement | null>} className={className} href={href}>
        {mark}
        {t(catalog, "v4.rail.writeReport")}
        {goodWords}
      </Link>
    );
  };

  const rail = railOf(stage, watch.writingSince, catalog, locale);
  const barStatus = digsRestFor(stage) && rail !== undefined
    ? { text: `${t(catalog, "v4.rail.stepReport")} · ${rail.text}`, working: rail.working }
    : null;
  return {
    answer: watch.answer,
    href,
    stage,
    headerItem,
    headerStrip: start.at === "top" ? strip("top") : null,
    bottomStrip: start.at === "bottom" ? strip("bottom") : null,
    writeFromBar: canAsk && start.at === null ? () => start.open("bottom") : undefined,
    barStatus,
    waitCard: (
      <V4ReportWait
        stage={stage}
        writingSince={watch.writingSince}
        slowFrom={watch.slowFrom}
        checkedAt={watch.checkedAt}
        reconnecting={watch.reconnecting}
        onTryNow={watch.tryNow}
        focusPending={start.focusCard}
        onFocused={start.cardFocused}
        onFocusGone={() => (headerRef.current ?? input.barJobRef.current)?.focus()}
        catalog={catalog}
        locale={locale}
      />
    ),
    rail,
    digsRest: digsRestFor(stage) || start.busy,
    restReason: t(catalog, "v4.reportWait.digsRest"),
    momentAllowed: reportMomentAllowed(stage)
  };
}
