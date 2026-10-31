"use client";

import Link from "next/link";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { MoneyLine } from "@/lib/v4/money";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), D3 rail ("when"): the steps, the rounds, how many open questions could still change the
 * answer, and row D decision 8, "Good time to write your report". No engine number reaches it: the counts are of
 * questions and digs the person can see on the map.
 */

export type V4DigCounts = Readonly<{ running: number; done: number; failed: number }>;

/**
 * Decision 8, first version (the engine has no "little is left" rule yet): nothing open is left without a dig, or at
 * least one dig is done and none is still running.
 */
export function goodTimeForReport(openLeft: number, digs: V4DigCounts): boolean {
  return openLeft === 0 || (digs.done > 0 && digs.running === 0);
}

export function V4Rail(props: Readonly<{
  runId: string;
  /**
   * The reading level the person chose, carried by the report link (Decision A: the level lives in the address).
   * R2REG-5: null when none was chosen, so the link never invents one.
   */
  level: ReadingLevel | null;
  /**
   * R2RULES-8: the "How we read it" step, ticked. A dig never went through that screen, so its page leaves the row
   * out (the later steps renumber).
   */
  showReadStep: boolean;
  /** Open questions with no dig yet (each counted once). */
  openLeft: number;
  digs: V4DigCounts;
  /** "strip": the 768–1099 px top strip; "column": the desktop rail and the phone map sheet. */
  variant: "column" | "strip";
  /**
   * W3-4 (the money rule, owner 31 Oct): the usage area's notices — running work went past today's or this week's
   * allowance and used part of the next one to finish (lib/v4/money.ts borrowLines). Shares only, never a price.
   */
  usageNotes?: readonly MoneyLine[];
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { runId, level, showReadStep, openLeft, digs, variant, catalog, locale } = props;
  const usageNotes = props.usageNotes ?? [];
  const mapStep = showReadStep ? 3 : 2;
  const reportHref = levelHref(`/v4/debate/${encodeURIComponent(runId)}/report`, level);
  const anyDig = digs.running + digs.done + digs.failed > 0;
  const goodTime = goodTimeForReport(openLeft, digs);
  return (
    <nav className={`v4DebRail v4DebRail-${variant}`} aria-label={t(catalog, "v4.rail.label")}>
      <ol className="v4DebRailSteps">
        <li className="v4DebRailStep v4DebRailDone">
          <span className="v4DebRailMark" aria-hidden="true">✓</span>
          <span>{t(catalog, "v4.rail.stepQuestion")}</span>
        </li>
        {showReadStep ? (
          <li className="v4DebRailStep v4DebRailDone">
            <span className="v4DebRailMark" aria-hidden="true">✓</span>
            <span>{t(catalog, "v4.rail.stepRead")}</span>
          </li>
        ) : null}
        <li className="v4DebRailStep v4DebRailHere" aria-current="step">
          <span className="v4DebRailMark" aria-hidden="true">{mapStep}</span>
          <span>
            {t(catalog, "v4.rail.stepMap")}
            <span className="v4DebRailNote">{t(catalog, "v4.rail.youAreHere")}</span>
          </span>
        </li>
        <li className="v4DebRailStep">
          <span className="v4DebRailMark" aria-hidden="true">{mapStep + 1}</span>
          <Link className="v4Link" href={reportHref}>{t(catalog, "v4.rail.stepReport")}</Link>
        </li>
      </ol>

      <div className="v4DebRailBlock">
        <p className="v4Eyebrow">{t(catalog, "v4.rail.roundsTitle")}</p>
        <ul className="v4DebRailRounds">
          <li className="v4DebRailDone">
            <span className="v4DebRailMark" aria-hidden="true">✓</span>
            <span>{t(catalog, "v4.rail.round1")}</span>
          </li>
          {anyDig ? (
            <li className={digs.running === 0 ? "v4DebRailDone" : undefined}>
              <span className="v4DebRailMark" aria-hidden="true">{digs.running === 0 ? "✓" : "●"}</span>
              <span>
                {t(catalog, "v4.rail.round2")}
                <span className="v4DebRailNote">
                  {tPlural(catalog, "v4.rail.digsRunning", digs.running, locale)}
                  {" · "}
                  {tPlural(catalog, "v4.rail.digsDone", digs.done, locale)}
                  {digs.failed > 0 ? <>{" · "}{tPlural(catalog, "v4.rail.digsFailed", digs.failed, locale)}</> : null}
                </span>
              </span>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="v4DebRailBlock v4DebRailOpen">
        <span>{t(catalog, "v4.rail.openLeft")}</span>
        <strong className="v4DebRailOpenCount">{openLeft}</strong>
      </div>

      {usageNotes.length > 0 ? (
        <div className="v4DebRailBlock v4DebRailUsage" role="status">
          {usageNotes.map((note) => <p key={note.key} className="v4DebRailUsageNote">{t(catalog, note.key, note.values)}</p>)}
        </div>
      ) : null}

      {goodTime ? (
        <div className="v4DebRailGoodTime" role="note">
          <p className="v4DebRailGoodTitle">{t(catalog, "v4.rail.goodTimeTitle")}</p>
          <p className="v4Muted">
            {openLeft === 0 ? t(catalog, "v4.rail.goodTimeNoneOpen") : t(catalog, "v4.rail.goodTimeDigsDone")}
          </p>
          <Link className="v4Btn v4BtnPrimary v4DebRailReport" href={reportHref}>{t(catalog, "v4.rail.writeReport")}</Link>
        </div>
      ) : null}
    </nav>
  );
}
