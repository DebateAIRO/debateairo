"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InvestigationReports } from "@debateai/contract";
import { currentReportVersion, loadInvestigation } from "./load.js";
import { canAskForReport, newWritingClock, noteWritingRead, reportStageOf, slowFromOf, writingStartOf, type ReportStage } from "./reportWriting.js";
import { useWaitPolling, type WaitCheck } from "./useWaitPolling.js";

/*
 * R22 W5-1 (owner Q-D11): on the first debate's map, once its investigation has a finished report version, the panel's
 * answer is that version's (the first debate's answer one click away). A failed read leaves the first answer.
 * V4 screen review (owner picks 3 Nov 2026), journey-f17 / report-d2: when the newest version is being written, the map
 * reads it again and, when it is ready, gives the report its ready moment (the same note, tab title and screen-reader
 * line as the answer and a dig). A version that failed ends the reads quietly.
 * report-d1 / report-d2 (the report from the map): the map also knows where the report stands (lib/v4/reportWriting.ts),
 * on a dig's map too (the investigation is the first question's, report-f9), reads again at once after its own "Write
 * it" (and after a dig started, which reopens the investigation), and keeps reading while the report waits for digs or
 * is written, through the shared waiting checks (useWaitPolling, wait-f19: rarely while the tab is hidden, at once when
 * it is shown again or the connection returns, [Try now]). It never gives up while it is written (report-f8). When
 * writing started is said only when this visit knows it (the report page's rule). With the start step's "carry on to the
 * report" box (`watchForStart`), the server asks for the report by itself once the digs are done, so the map also keeps
 * reading while a report could still be asked for. Nothing is kept in the browser.
 */

/** The current report version's answer, and when it was written (dig-f19: what changed after it is named on the map). */
export type ReportAnswer = Readonly<{ version: number; segments: readonly string[]; writtenAt: string }>;

/** How often the map reads the versions while the report waits for digs or is written (the tab shown). */
export const REPORT_POLL_MS = 15_000;

export type ReportWatch = Readonly<{
  /** The first question's current report answer, on its own map only (null on a dig's map, and before any report). */
  answer: ReportAnswer | null;
  /** The newest investigation read, or null before one answered. */
  read: InvestigationReports | null;
  stage: ReportStage;
  /** The first question's run id (every report is its report, report-f9), once read. */
  rootRunId: string | null;
  /** When writing started, only when this visit knows it (ms); null otherwise. */
  writingSince: number | null;
  /** report-f8: where "taking longer than usual" counts its 15 minutes from (ms); null while nothing is written. */
  slowFrom: number | null;
  /** useWaitPolling's: when a check last answered, whether touch is lost, and [Try now]. */
  checkedAt: number | null;
  reconnecting: boolean;
  tryNow: () => void;
  /** This page is about to send its own "Write it" (the version it begins started writing then). */
  notePress: () => void;
  /** Reads the versions again now (after a press) and keeps reading while one waits or is written; null when it failed. */
  reread: () => Promise<InvestigationReports | null>;
}>;

export function useReportWatch(runId: string | null, isDig: boolean, onReady: (version: number) => void,
  watchForStart = false): ReportWatch {
  const [read, setRead] = useState<InvestigationReports | null>(null);
  const [restart, setRestart] = useState(0);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  // Kept in the page's memory only: the starts this visit saw, and the version it saw being written.
  const clock = useRef(newWritingClock());
  const writingSeen = useRef<number | null>(null);
  const forRun = useRef(runId);
  useEffect(() => {
    if (forRun.current === runId) return;
    forRun.current = runId;
    clock.current = newWritingClock();
    writingSeen.current = null;
    setRead(null);
  }, [runId]);

  const apply = useCallback((next: InvestigationReports): void => {
    noteWritingRead(clock.current, next);
    const newest = next.versions.at(-1) ?? null;
    if (writingSeen.current !== null && newest !== null && newest.report_version === writingSeen.current && newest.state !== "WRITING") {
      // The version this page saw being written is finished (or failed): a finished one is its ready moment.
      const current = currentReportVersion(next);
      if (current !== null && current.report_version === writingSeen.current) onReadyRef.current(writingSeen.current);
      writingSeen.current = null;
    }
    if (newest?.state === "WRITING") writingSeen.current = newest.report_version;
    setRead(next);
  }, []);

  const check = useCallback<WaitCheck>(async (stillWanted) => {
    if (runId === null) return "DONE";
    const next = await loadInvestigation(runId);
    if (!stillWanted() || forRun.current !== runId) return "DONE";
    if (next === null) {
      // A read that failed keeps what the page shows; while a version is being written (or the carry-on will start one) it is
      // tried again (lost touch).
      if (writingSeen.current !== null || watchForStart) throw new Error("INVESTIGATION_UNREADABLE");
      return "DONE";
    }
    apply(next);
    if (next.versions.at(-1)?.state === "WRITING") return "AGAIN";
    return watchForStart && canAskForReport(reportStageOf(next)) ? "AGAIN" : "DONE";
  }, [runId, apply, watchForStart]);
  const polling = useWaitPolling(check, {
    everyMs: REPORT_POLL_MS, enabled: runId !== null, restartKey: `${runId ?? ""}|${restart}|${watchForStart ? "carry" : ""}`
  });

  const reread = useCallback(async (): Promise<InvestigationReports | null> => {
    if (runId === null) return null;
    const next = await loadInvestigation(runId);
    if (forRun.current !== runId) return null;
    if (next !== null) {
      apply(next);
      // Waiting or being written now: the checks start afresh (they had stopped when nothing was written).
      if (next.versions.at(-1)?.state === "WRITING") setRestart((count) => count + 1);
    }
    return next;
  }, [runId, apply]);
  const notePress = useCallback((): void => {
    clock.current.pressedAt = Date.now();
  }, []);

  const stage = useMemo(() => reportStageOf(read), [read]);
  const rootRunId = read?.root_run_id ?? null;
  const ownMap = runId !== null && rootRunId !== null && rootRunId.toLowerCase() === runId.toLowerCase();
  const current = isDig || !ownMap ? null : currentReportVersion(read);
  const answer = useMemo<ReportAnswer | null>(
    () => (current === null ? null : { version: current.report_version, segments: current.answer.segments, writtenAt: current.written_at }),
    [current]
  );
  return {
    answer,
    read,
    stage,
    rootRunId,
    writingSince: writingStartOf(clock.current, stage),
    slowFrom: slowFromOf(clock.current, stage),
    checkedAt: polling.checkedAt,
    reconnecting: polling.reconnecting,
    tryNow: polling.tryNow,
    notePress,
    reread
  };
}

/** The current report version's answer on the first question's map (see useReportWatch, which also says where it stands). */
export function useReportVersions(runId: string | null, isDig: boolean, onReady: (version: number) => void): ReportAnswer | null {
  return useReportWatch(runId, isDig, onReady).answer;
}
