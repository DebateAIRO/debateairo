"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Answer } from "@debateai/contract";
import type { AskRoom } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { replayHighlight } from "@/lib/v4/highlight";
import { reportWaitLine } from "@/lib/v4/money";
import {
  canAskForReport, carryOnOf, digsRestFor, firstReportLeftOf, reportMomentAllowed, reportSeenFor, reportSharePercentOf, type ReportStage
} from "@/lib/v4/reportWriting";
import { stateWordText, whenText } from "@/lib/v4/stateWords";
import { quotaChanged } from "@/lib/v4/quotaPulse";
import { levelHref } from "@/lib/v4/storage";
import { useBrowserLayoutEffect } from "@/lib/v4/useBrowserLayoutEffect";
import { focusInPlace } from "@/lib/v4/useFocusHandOff";
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
 *
 * The owner's answers of 5 Nov 2026 (OPEN-OWNER-QUESTIONS-2026-11-04.md, "Your answers" and both rounds of follow-ups):
 *  - question 2 A: once a report is asked for, the top bar's link reads "See my report" while the report waits for a dig,
 *    while it is written, and once it stands with nothing new to ask (lib/v4/reportWriting.ts reportSeenFor); "Write my
 *    report" again as soon as a dig reopens it; "Write it again" after a version that did not finish. Before the map's first
 *    report check answers, the button's place is held with no words, as wide as "Write my report" (what most first checks
 *    give), so nothing moves when it comes (ask-f16); when that first check fails, today's "Write my report" link stays.
 *  - question 18 A: on a phone the top bar shows its report button only while the bottom bar does not show "Write my
 *    report" (`bottomShowsReport`, from V4BottomStack's `onReportShown`); a computer always keeps it (v4-debate.css). When
 *    the top button steps aside while it has focus, focus goes on to the pinned bar's job, without scrolling.
 *  - question 23 A: the waiting card names the one dig the report waits for (`waitingDigQuestion`, report-f7's rule in
 *    lib/v4/reportWriting.ts waitingDigQuestionOf), its words marked in the debate's language when known
 *    (`waitingDigLanguage`, as the report page does), and says "the digs in progress", with no number, when several wait.
 *
 * V4 start step, Task 56c (item public-f25; owner answer Q20 B: only a debate's very first report uses the kept reserve): a further
 * report on a public debate waits for the reset like digs, and its button says when it can run. While the page is sure of it (the
 * debate is public, the investigation read says the next report is not its first, and the room holds new starts: lib/v4/money.ts
 * reportWaitLine), the top bar's "Write my report" stays where it is, greyed but focusable, with "This report can start after 08:00."
 * beside it; a press shows the line again and opens nothing (journey-f14, as the dig button waits). The rail's report step says the
 * same line, and the page puts it on the phone bar's report job (`waitLine`). A press refused anyway: the strip's own WAITS note.
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
  /**
   * Question 23 A (5 Nov): the question of the one dig the report waits for (lib/v4/reportWriting.ts waitingDigQuestionOf,
   * over this map's READ digs). Null or absent: the wait line names no dig. Never used on a dig's own map (`isDig`), whose
   * investigation is the first question's and whose digs it does not all know.
   */
  waitingDigQuestion?: string | null;
  /**
   * Question 23 A with report-f14: the language the dig's question is written in (the debate's, a BCP 47 tag), so its words
   * carry it as on the report page. Null, absent or "und": the words carry no language, as before.
   */
  waitingDigLanguage?: string | null;
  /**
   * Question 18 A (5 Nov): the phone's bottom bar shows "Write my report" now (its own button, the slim line, or the strip
   * grown from the bar: V4BottomStack's `onReportShown`). True: the header's report button steps aside on a phone (below
   * 768 px; v4-debate.css), so one is on screen. Absent or false: it shows, as before.
   */
  bottomShowsReport?: boolean;
  /** Task 56c: the person's room read (the map's dig room, read again after each quota moment); absent or null: nothing waits. */
  room?: AskRoom | null;
  /** Task 56c: the debate is public now (the map's public stage is PUBLIC); absent: false, so nothing waits. */
  isPublic?: boolean;
}>;

export type MapReport = Readonly<{
  /** The first question's current report answer, on its own map (null on a dig's map and before any report). */
  answer: ReportAnswer | null;
  /** The first question's report page (report-f9). */
  href: string;
  stage: ReportStage;
  /**
   * Question 2 A: the first report check has answered (a read, or a check that failed). Until then the top bar's report button
   * holds its place with no words, and the "older than the map" box draws nothing (V4ChangedSince's `reportRead`).
   */
  firstCheckAnswered: boolean;
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
  /**
   * Task 56c: while a report could be asked for but waits for the reset, the words that say when it can start ("This report can
   * start after 08:00."); null otherwise. The page greys the phone bar's report job with it and drops the month line's "You can still
   * write your report.".
   */
  waitLine: string | null;
}>;

/** Task 56c: the id of the top bar's line beside a "Write my report" that waits for the reset. */
const REPORT_WAITS_TOP = "v4-report-waits-top";

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
  // Task 56c: the report waits for the reset, as far as the page is sure (lib/v4/money.ts reportWaitLine), while it could be asked for.
  const room = input.room ?? null;
  const sure = reportWaitLine({ room, isPublic: input.isPublic === true, firstReportLeft: firstReportLeftOf(watch.read), locale });
  const waitLine = canAsk && sure !== null ? t(catalog, sure.key, sure.values) : null;
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
    waits: waitLine !== null,
    focusOpener: (at: ReportStripPlace) => (at === "top" ? headerRef.current : input.barJobRef.current)?.focus()
  });
  // Task 56c: after a press refused until the reset, the strip says when (the server said this report is not the debate's first and
  // the debate is public); before the room is read again, the strip's plain reset line.
  const refused = start.note === "WAITS" ? reportWaitLine({ room, isPublic: true, firstReportLeft: false, locale }) : null;
  const stripWaitLine = waitLine ?? (refused === null ? null : t(catalog, refused.key, refused.values));

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
      // The browser check (4 Nov): the investigation is read when the page opens, so a dig started on this page since then
      // is known from the page's own digs (`digsKey`), and the strip never says nothing was dug.
      hasDigs={(watch.read?.digs ?? 0) > 0 || input.digsKey !== ""}
      sharePercent={sharePercent}
      publicLine={publicLine}
      rootRunId={root}
      busy={start.busy}
      note={start.note}
      waitLine={stripWaitLine}
      onWrite={start.write}
      onNotYet={start.notYet}
      catalog={catalog}
    />
  );
  const label = t(catalog, stage.kind === "FAILED" ? "v4.investigation.writeAgain" : "v4.rail.writeReport");
  // Question 2 A: the first report check has answered (a read, or a check that failed) once any of these is known.
  const firstCheckAnswered = watch.read !== null || watch.checkedAt !== null || watch.reconnecting;
  // Question 18 A: on a phone the header's report button steps aside while the bottom bar shows "Write my report".
  const atBottom = input.bottomShowsReport === true ? " v4DebReportAtBottom" : "";
  // ...and, before the browser paints, focus held by it goes on to the pinned bar's job (it is hidden only on a phone, where
  // the bar is), without scrolling, never to the page's body.
  const bottomShows = input.bottomShowsReport === true;
  const { barJobRef } = input;
  useBrowserLayoutEffect(() => {
    const top = headerRef.current;
    if (!bottomShows || top === null || document.activeElement !== top) return;
    focusInPlace(barJobRef.current);
  }, [bottomShows, barJobRef]);

  const headerItem = (goodTime: boolean): ReactNode => {
    if (start.at === "top") return null;
    // Task 56c: no "Good time to write your report" on a button that waits for the reset.
    const good = goodTime && waitLine === null;
    // Question 2 A: before the first check answers, the place is held with no words (ask-f16: nothing moves when it comes).
    // The CSS draws "Write my report" and "See my report" from the attributes in one cell, hidden (v4-debate.css), so the
    // place is as wide as the wider of the two and nothing is read out or found as text. The button that comes draws both
    // too, behind its own words (the w6 browser check: "See my report" was narrower, and the quota circle moved).
    if (stage.kind === "UNKNOWN" && !firstCheckAnswered) {
      return (
        <span className={`v4Btn v4DebReportHold${atBottom}`} aria-hidden="true" data-report-hold=""
          data-hold-label={t(catalog, "v4.rail.writeReport")} data-hold-other={t(catalog, "v4.rail.seeReport")} />
      );
    }
    // The button's words, with the two labels it can show drawn invisibly behind them (v4-debate.css .v4DebReportLabel).
    const sized = (words: string): ReactNode => (
      <span className="v4DebReportLabel" data-size-write={t(catalog, "v4.rail.writeReport")} data-size-see={t(catalog, "v4.rail.seeReport")}>
        <span>{words}</span>
      </span>
    );
    const mark = good ? <span className="v4DebReportMark" aria-hidden="true" /> : null;
    const goodWords = good ? <span className="v4SrOnly">{` · ${t(catalog, "v4.rail.goodTimeTitle")}`}</span> : null;
    const className = `v4Btn v4BtnPrimary v4DebReportLink${good ? " v4DebReportGood" : ""}${atBottom}`;
    if (canAsk) {
      // Task 56c: while the report waits for the reset, the button stays here, greyed, with the line beside it (journey-f14). On a
      // phone whose bottom bar carries "Write my report" (question 18 A) this button is hidden, and the bar says the line instead.
      const waiting = waitLine !== null;
      const lineShown = waiting && !bottomShows;
      return (
        <>
          <button
            ref={headerRef as RefObject<HTMLButtonElement | null>}
            type="button"
            className={`${className}${waiting ? " v4DigWaiting" : ""}`}
            // The wave-2 checks (ACCESS-6's rule on this button): with the start step's carry-on box a press sends at once and
            // may wait for a dig's 10 seconds; the button keeps its focus (aria-disabled, never native) and ignores presses.
            aria-disabled={start.busy || waiting ? "true" : undefined}
            aria-busy={start.busy ? "true" : undefined}
            aria-describedby={lineShown ? REPORT_WAITS_TOP : undefined}
            onClick={() => {
              if (waiting) {
                replayHighlight(document.getElementById(REPORT_WAITS_TOP));
                return;
              }
              if (!start.busy) start.open("top");
            }}
          >
            {mark}
            {sized(label)}
            {goodWords}
          </button>
          {lineShown ? <span id={REPORT_WAITS_TOP} className="v4DigWaitLine v4DebReportWaits" data-report-waits="">{waitLine}</span> : null}
        </>
      );
    }
    // W3-4: always there once the answer is served; while the report waits, is written or stands, it leads to its page
    // and reads "See my report" (question 2 A). A first check that failed keeps today's "Write my report" link.
    return (
      <Link ref={headerRef as RefObject<HTMLAnchorElement | null>} className={className} href={href}>
        {mark}
        {sized(t(catalog, reportSeenFor(stage) ? "v4.rail.seeReport" : "v4.rail.writeReport"))}
        {goodWords}
      </Link>
    );
  };

  // The wave-2 checks (4 Nov, journey-f17's "focus kept where it was"): when the waiting card goes while it holds focus,
  // focus goes on without scrolling the page: to the phone's pinned bar (always in view), else to the header's report link.
  const focusAfterWait = (): void => {
    const bar = input.barJobRef.current;
    focusInPlace(bar !== null && bar.isConnected ? bar : headerRef.current);
  };
  const rail = railOf(stage, watch.writingSince, catalog, locale);
  const barStatus = digsRestFor(stage) && rail !== undefined
    ? { text: `${t(catalog, "v4.rail.stepReport")} · ${rail.text}`, working: rail.working }
    : null;
  // Task 56c: while the report waits for the reset, the rail's report step says when it can start.
  const railReport: V4RailReport | undefined = waitLine !== null ? { text: waitLine, working: false } : rail;
  return {
    answer: watch.answer,
    href,
    stage,
    firstCheckAnswered,
    headerItem,
    headerStrip: start.at === "top" ? strip("top") : null,
    bottomStrip: start.at === "bottom" ? strip("bottom") : null,
    // Task 56c: while the report waits, the bar's own greyed job says why and opens nothing.
    writeFromBar: canAsk && start.at === null && waitLine === null ? () => start.open("bottom") : undefined,
    barStatus,
    waitCard: (
      <V4ReportWait
        stage={stage}
        waitingDig={input.isDig ? null : input.waitingDigQuestion ?? null}
        waitingDigLanguage={input.waitingDigLanguage ?? null}
        writingSince={watch.writingSince}
        slowFrom={watch.slowFrom}
        checkedAt={watch.checkedAt}
        reconnecting={watch.reconnecting}
        onTryNow={watch.tryNow}
        focusPending={start.focusCard}
        onFocused={start.cardFocused}
        onFocusGone={focusAfterWait}
        catalog={catalog}
        locale={locale}
      />
    ),
    rail: railReport,
    digsRest: digsRestFor(stage) || start.busy,
    restReason: t(catalog, "v4.reportWait.digsRest"),
    momentAllowed: reportMomentAllowed(stage),
    waitLine
  };
}
