import type { PublicDebate } from "@debateai/contract";

/*
 * public-f9 (owner review, 3 Nov): what the public page knows about a report being written. A finished version is in the debate's `reports`. Whether one
 * is being written, or could not be written, only the server can say: the page reads an OPTIONAL `report_writing` beside the reports.
 * Server need: PublicDebateSchema gains `report_writing?: { report_version, state: "WRITING" | "FAILED", started_at }` (started_at: when the writing
 * started, ISO). Today's contract does not carry it, and PublicDebateSchema is strict, so neither the API nor the stand-in can send it yet: the page then
 * knows of a report only from its own press, and a report that could not be written is not said (after 10 minutes the card says it is taking longer than
 * usual and offers "Check again").
 */

/** A report version being written on a public debate, or one that could not be written, as the server would say it. */
export type PublicReportWriting =
  | Readonly<{ report_version: number; state: "WRITING"; started_at: string }>
  | Readonly<{ report_version: number; state: "FAILED" }>;

/** The server's optional word on a report being written (absent today: null). Anything without the shape is ignored. */
export function publicReportWriting(debate: PublicDebate): PublicReportWriting | null {
  const field = (debate as PublicDebate & Readonly<{ report_writing?: unknown }>).report_writing;
  if (field === null || typeof field !== "object") return null;
  const { report_version: version, state, started_at: startedAt } = field as Record<string, unknown>;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  if (state === "FAILED") return { report_version: version, state };
  if (state === "WRITING" && typeof startedAt === "string" && !Number.isNaN(Date.parse(startedAt))) {
    return { report_version: version, state, started_at: startedAt };
  }
  return null;
}

/** True once the debate shows this report version (or a newer one). */
export function reportShown(debate: PublicDebate, version: number): boolean {
  return (debate.reports ?? []).some((report) => report.report_version >= version);
}
