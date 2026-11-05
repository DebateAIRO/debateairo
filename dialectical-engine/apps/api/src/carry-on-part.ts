import type { CarryOnPart } from "@debateai/contract";
import type { CarryOnMarkState, InvestigationReportsOwnerRead, PublicReportCounts } from "@debateai/db";

/**
 * V4 start step, Task 58 (spec 2026-11-03 §2 item 8, "The carry-on line"; item wait-f16; owner card "Carry-on", "Show it from the start"):
 * which part a carry-on debate is running, for the one calm line under the question. The server says it, so the line is the same after a
 * reload and on another device. Pure: the run read and the owner's answer read hand it what they read (the box, whether the debate settled,
 * Task 53a's carry-on mark and the person's newest report version) and serve what it answers.
 */

/** The person's newest report version: none pressed (or none written), one being written, one written. */
export type CarryOnReportState = "NONE" | "WRITING" | "FINISHED";

/**
 * Not asked: none. While the debate runs: its answer. Then the person's newest report version being written: the report; a written one:
 * none (the report is ready, the line goes). The carry-on done with no version (nothing pressed): none. Else the digs.
 */
export function carryOnPartOf(input: Readonly<{ carryOnToReport: boolean; runSettled: boolean; mark: CarryOnMarkState;
  report: CarryOnReportState }>): CarryOnPart | null {
  if (!input.carryOnToReport) return null;
  if (!input.runSettled) return "ANSWER";
  if (input.report === "WRITING") return "REPORT";
  if (input.report === "FINISHED") return null;
  if (input.mark === "DONE") return null;
  return "DIGS";
}

const written = (outcome: string): boolean => outcome === "READY" || outcome === "READY_WITH_RESERVATION";

/**
 * A private debate's newest report version, from the person's investigation read (0133's closings, 0136's reports; no content opened): the
 * newest closing not written and not reopened is being written, as GET /v1/runs/{id}/investigation says; else any written version is the
 * report; else (none pressed, only failed ones, or one reopened before its report) none.
 */
export function carryOnReportOfInvestigation(read: Pick<InvestigationReportsOwnerRead, "investigation" | "reports"> | null): CarryOnReportState {
  if (read === null) return "NONE";
  const closings = [...read.investigation.closings].sort((a, b) => a.report_version - b.report_version);
  const reportOf = new Map(read.reports.map((report) => [report.report_version, report] as const));
  const newest = closings.at(-1);
  if (newest === undefined) return "NONE";
  if (!reportOf.has(newest.report_version) && newest.reopened_at === null) return "WRITING";
  return closings.some((closing) => written(reportOf.get(closing.report_version)?.outcome ?? "")) ? "FINISHED" : "NONE";
}

/**
 * A public debate's report versions (decision 13: the author's press is the same public report as anyone's): Task 53a's counts of the
 * versions that did not fail (`own`: the person's; `all`: every writer's, one being written included) and how many copies the page holds
 * (written and past the publication check; their words are never opened here). The person with no version of their own: none, whatever a
 * visitor wrote (owner answer Q20: the carry-on still owes its own). Else a version not on the page yet is being written; else finished.
 */
export function carryOnReportOfPublic(input: Readonly<{ counts: PublicReportCounts; onPage: number }>): CarryOnReportState {
  if (input.counts.own === 0) return "NONE";
  return input.counts.all > input.onPage ? "WRITING" : "FINISHED";
}
