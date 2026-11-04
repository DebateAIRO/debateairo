"use client";

import { useEffect, useRef, useState } from "react";
import { currentReportVersion, loadInvestigation } from "./load.js";

/*
 * R22 W5-1 (owner Q-D11): on the first debate's map, once its investigation has a finished report version, the panel's
 * answer is that version's (the first debate's answer one click away). Read once per visit; a failed read leaves the
 * first answer.
 * V4 screen review (owner picks 3 Nov 2026), journey-f17 / report-d2: when the newest version is still being written, the
 * map reads it again (one read in flight; every 15 s at first, then less often, for up to an hour, the run limit) and,
 * when it is ready, gives the report its ready moment (the same note, tab title and screen-reader line as the answer and
 * a dig). A version that failed ends the reads quietly.
 */

/** The current report version's answer, and when it was written (dig-f19: what changed after it is named on the map). */
export type ReportAnswer = Readonly<{ version: number; segments: readonly string[]; writtenAt: string }>;

const REPORT_POLL_FIRST_MS = 15_000;
const REPORT_POLL_MAX_MS = 60_000;
const REPORT_WAIT_LIMIT_MS = 60 * 60_000;

export function useReportVersions(runId: string | null, isDig: boolean, onReady: (version: number) => void): ReportAnswer | null {
  const [reportAnswer, setReportAnswer] = useState<ReportAnswer | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  useEffect(() => {
    if (runId === null || isDig) return;
    let active = true;
    let timer: number | undefined;
    let writing: number | null = null;
    let delay = REPORT_POLL_FIRST_MS;
    const startedAt = Date.now();
    const again = (): void => {
      if (writing === null || Date.now() - startedAt >= REPORT_WAIT_LIMIT_MS) return;
      timer = window.setTimeout(() => void read(), delay);
      delay = Math.min(REPORT_POLL_MAX_MS, delay * 2);
    };
    const read = async (): Promise<void> => {
      const next = await loadInvestigation(runId);
      if (!active) return;
      // A read that failed keeps what the page shows; while a version is being written it is tried again.
      if (next === null) return again();
      if (next.root_run_id.toLowerCase() !== runId.toLowerCase()) return;
      const current = currentReportVersion(next);
      setReportAnswer(current === null ? null
        : { version: current.report_version, segments: current.answer.segments, writtenAt: current.written_at });
      const newest = next.versions.at(-1) ?? null;
      if (writing !== null && newest !== null && newest.report_version === writing && newest.state !== "WRITING") {
        // The version this page saw being written is finished (or failed): a finished one is its ready moment.
        if (current !== null && current.report_version === writing) onReadyRef.current(writing);
        writing = null;
      }
      if (newest?.state === "WRITING") writing = newest.report_version;
      again();
    };
    void read();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [runId, isDig]);
  return reportAnswer;
}
