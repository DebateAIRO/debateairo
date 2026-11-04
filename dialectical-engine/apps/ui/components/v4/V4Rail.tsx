"use client";

import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { ReportMoment } from "@/lib/v4/mapLooks";
import type { MoneyLine } from "@/lib/v4/money";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";
import { NewDot } from "./V4MapTree";
import { V4Steps } from "./V4Steps";

/*
 * V4 initial (2026-10-28), D3 rail ("when"): the steps, the rounds, how many open questions could still change the
 * answer, and row D decision 8, "Good time to write your report". No engine number reaches it: the counts are of
 * questions and digs the person can see on the map.
 * V4 screen review (3 Nov):
 *   - map-f28: the one approved count is "Open questions that could still change the answer", said as one line; the
 *     rounds name their state instead of counting digs ("Looking into it", "Done").
 *   - map-f26 / dig-f29: the page works out the count and the report moment (lib/v4/mapLooks.ts): a question leaves the
 *     count only when a dig comes back Confirmed or Corrected, and "Good time to write your report" follows that rule; a
 *     dig done without it gets the neutral "Your dig is done. Keep digging, or write your report."
 *   - map-f15: there is one "Write my report" button, in the top bar; the rail's note points to it and has none of its own.
 *   - map-d3 / map-f23: the rail also comes as a 56 px strip of four marks (laptops, "marks"), as the line above the map
 *     that carries the count and the notes ("notes"), and as the steps alone on one line (the foot of the phone's map,
 *     "steps").
 *   - journey-f18 / read-f25: the steps are the one step marker every V4 page shows (V4Steps), always all four, "Your
 *     question · What we'll look into · The map · Your report"; a dig's page shows the four too.
 */

/**
 * Owner review 3 Nov (wait-f2): `paused` counts the digs paused at the month wall, apart from the running ones (absent:
 * none). A paused dig is not running, but it has not finished either.
 */
export type V4DigCounts = Readonly<{ running: number; done: number; failed: number; paused?: number }>;

/**
 * Decision 8, first version (the engine has no "little is left" rule yet): nothing open is left without a dig, or at
 * least one dig is done and none is still running (or paused: it has not finished, as before it was counted apart).
 * Kept for callers that pass no `moment` (dig-f29's rule is in lib/v4/mapLooks.ts, reportMoment).
 */
export function goodTimeForReport(openLeft: number, digs: V4DigCounts): boolean {
  return openLeft === 0 || (digs.done > 0 && digs.running === 0 && (digs.paused ?? 0) === 0);
}

type RailProps = Readonly<{
  runId: string;
  /**
   * The reading level the person chose, carried by the report link (Decision A: the level lives in the address).
   * R2REG-5: null when none was chosen, so the link never invents one.
   */
  level: ReadingLevel | null;
  /**
   * No longer read: journey-f18 / read-f25 (3 Nov) show the same four steps on every page, a dig's included. Kept optional
   * so callers that still pass it need no change.
   */
  showReadStep?: boolean;
  /** Open questions that could still change the answer (map-f26: only a Confirmed or Corrected dig takes one off). */
  openLeft: number;
  digs: V4DigCounts;
  /**
   * "column": the wide desktop rail; "strip": the 768–1099 px top strip; "marks": the laptop's 56 px strip of steps;
   * "notes": the line above the laptop's map (the count, the notes); "steps": the steps alone on one line.
   */
  variant: "column" | "strip" | "marks" | "notes" | "steps";
  /**
   * W3-4 (the money rule, owner 31 Oct): the usage area's notices — running work went past today's or this week's
   * allowance and used part of the next one to finish (lib/v4/money.ts borrowLines). Shares only, never a price.
   */
  usageNotes?: readonly MoneyLine[];
  /** dig-f29: the report moment as the page works it out; absent: decision 8's first version (goodTimeForReport). */
  moment?: ReportMoment;
  /**
   * V4 screen review (3 Nov 2026), journey-f17: the report this page saw being written is ready and not opened yet; its
   * step carries the "New" dot until it is.
   */
  reportReady?: boolean;
  catalog: MessageCatalog;
  locale: string;
}>;

function Steps(props: Readonly<{ rail: RailProps; reportHref: string; marksOnly: boolean }>) {
  const { catalog } = props.rail;
  // The marks strip names only the step the person is on, under its mark; the others say their names to screen readers.
  return (
    <V4Steps
      current="map"
      shape={props.marksOnly ? "marks" : "list"}
      hrefs={{ report: props.reportHref }}
      reportMark={props.rail.reportReady === true ? <NewDot catalog={catalog} /> : null}
      catalog={catalog}
    />
  );
}

/**
 * map-f28: the rounds name what state they are in; nothing counts the digs. Owner review 3 Nov (wait-f2): a round whose
 * only open digs are paused at the month wall shows the still pause dot and says "Paused".
 */
function Rounds(props: Readonly<{ rail: RailProps }>) {
  const { digs, catalog, locale } = props.rail;
  const paused = digs.paused ?? 0;
  const anyDig = digs.running + paused + digs.done + digs.failed > 0;
  // A round with digs still running shows the working mark; one whose only open digs are paused, the still pause dot.
  const roundOpen = digs.running > 0 || paused > 0;
  return (
    <div className="v4DebRailBlock">
      <p className="v4Eyebrow">{t(catalog, "v4.rail.roundsTitle")}</p>
      <ul className="v4DebRailRounds">
        <li className="v4DebRailDone">
          <span className="v4DebRailMark" aria-hidden="true">✓</span>
          <span>{t(catalog, "v4.rail.round1")}</span>
        </li>
        {anyDig ? (
          <li className={roundOpen ? undefined : "v4DebRailDone"}>
            <span className="v4DebRailMark" aria-hidden="true">
              {digs.running > 0 ? "●" : paused > 0 ? <span className="v4PauseDot" /> : "✓"}
            </span>
            <span>
              {t(catalog, "v4.rail.round2")}
              <span className="v4DebRailNote">
                {digs.running > 0
                  ? tPlural(catalog, "v4.rail.digsRunning", digs.running, locale)
                  : paused > 0 ? tPlural(catalog, "v4.rail.digsPaused", paused, locale) : tPlural(catalog, "v4.rail.digsDone", digs.done, locale)}
                {digs.running > 0 && paused > 0 ? <>{" · "}{tPlural(catalog, "v4.rail.digsPaused", paused, locale)}</> : null}
                {digs.failed > 0 ? <>{" · "}{tPlural(catalog, "v4.rail.digsFailed", digs.failed, locale)}</> : null}
              </span>
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** The one approved count, as one line. */
function OpenLine(props: Readonly<{ rail: RailProps }>) {
  return (
    <p className="v4DebRailBlock v4DebRailOpen">
      {t(props.rail.catalog, "v4.rail.openLeftLine", { count: props.rail.openLeft })}
    </p>
  );
}

function Usage(props: Readonly<{ rail: RailProps }>) {
  const notes = props.rail.usageNotes ?? [];
  if (notes.length === 0) return null;
  return (
    <div className="v4DebRailBlock v4DebRailUsage" role="status">
      {notes.map((note) => <p key={note.key} className="v4DebRailUsageNote">{t(props.rail.catalog, note.key, note.values)}</p>)}
    </div>
  );
}

/** dig-f29 / map-f15: the report moment in words, pointing to the one "Write my report" button at the top. */
function ReportNote(props: Readonly<{ rail: RailProps }>) {
  const { rail } = props;
  const moment: ReportMoment = rail.moment !== undefined
    ? rail.moment
    : goodTimeForReport(rail.openLeft, rail.digs) ? "GOOD" : null;
  if (moment === null) return null;
  if (moment === "DIG_DONE") {
    return <p className="v4DebRailDigDone v4Muted" role="note">{t(rail.catalog, "v4.rail.digDoneNeutral")}</p>;
  }
  return (
    <div className="v4DebRailGoodTime" role="note">
      <p className="v4DebRailGoodTitle">{t(rail.catalog, "v4.rail.goodTimeTitle")}</p>
      <p className="v4Muted">
        {rail.openLeft === 0 ? t(rail.catalog, "v4.rail.goodTimeNoneOpen") : t(rail.catalog, "v4.rail.goodTimeStarDone")}
        {" "}
        {t(rail.catalog, "v4.rail.goodTimeHint")}
      </p>
    </div>
  );
}

export function V4Rail(props: RailProps) {
  const { runId, level, variant, catalog } = props;
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, level);
  if (variant === "marks" || variant === "steps") {
    return (
      <nav className={`v4DebRail v4DebRail-${variant}`} aria-label={t(catalog, "v4.rail.label")}>
        <Steps rail={props} reportHref={reportHref} marksOnly={variant === "marks"} />
      </nav>
    );
  }
  if (variant === "notes") {
    return (
      <div className="v4DebRail v4DebRail-notes">
        <OpenLine rail={props} />
        <Usage rail={props} />
        <ReportNote rail={props} />
      </div>
    );
  }
  return (
    <nav className={`v4DebRail v4DebRail-${variant}`} aria-label={t(catalog, "v4.rail.label")}>
      <Steps rail={props} reportHref={reportHref} marksOnly={false} />
      <Rounds rail={props} />
      <OpenLine rail={props} />
      <Usage rail={props} />
      <ReportNote rail={props} />
    </nav>
  );
}
