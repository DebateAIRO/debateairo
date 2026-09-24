import type { Answer, EventType, ExecutionLedgerDigest, InvestigationGap } from "@debateai/contract";

/**
 * UI-01: the ONE decision behind the answer export.
 *
 * S14 gated the export affordance on the answer AND the execution-ledger
 * digest (web/app/debate/[id]/DebatePageClient.tsx:109). The restored surface
 * first gated on the answer alone, so a run whose digest had not loaded — or
 * whose digest read had refused — still offered a download labelled
 * "answer + honesty + ledger" whose `execution_ledger_digest` was null, and a
 * drawer line promising the digest "loads" even when it never would.
 *
 * Both the top-bar affordance and the honesty drawer now read this one
 * result, so the button, its toast, and the explanatory copy cannot drift
 * apart from the bytes the download actually carries (DR-115: the label is
 * part of the honesty surface, not decoration).
 */

export type ExportLiveHonesty = Readonly<{
  cycleRefusals: readonly string[];
  investigationGaps: readonly InvestigationGap[];
  honestyEvents: readonly EventType[];
  ledgerEvents: readonly EventType[];
}>;

export type AnswerExportInput = Readonly<{
  answer: Answer | null;
  ledgerDigest: ExecutionLedgerDigest | null;
  /** The typed code a failed digest read returned, or null if none has failed. */
  ledgerError: string | null;
  live: ExportLiveHonesty;
}>;

export type AnswerExportWithheldReason =
  | "NO_SERVED_ANSWER"
  | "LEDGER_DIGEST_PENDING"
  | "LEDGER_DIGEST_UNREADABLE"
  /** Public (reader) mode with no published export supplied by the page. */
  | "ANSWER_UNAVAILABLE";

export type AnswerExport =
  | Readonly<{ available: true; href: string; filename: string; label: string; toast: string }>
  | Readonly<{ available: false; reason: AnswerExportWithheldReason; message: string }>;

const EXPORT_LABEL = "Export answer + honesty + ledger";
const EXPORT_TOAST = "Exported answer + honesty + ledger";

export function buildAnswerExport(input: AnswerExportInput): AnswerExport {
  const { answer, ledgerDigest, ledgerError, live } = input;

  if (answer === null) {
    return {
      available: false,
      reason: "NO_SERVED_ANSWER",
      message: "Nothing to export yet: no answer has been served for this run."
    };
  }
  if (ledgerDigest === null) {
    // A refused read is not a slow read. Saying it "becomes available once the
    // digest loads" would promise something that is not coming.
    if (ledgerError !== null) {
      return {
        available: false,
        reason: "LEDGER_DIGEST_UNREADABLE",
        message:
          `Export withheld: the execution-ledger digest could not be read (${ledgerError}). ` +
          "An export without it would not carry the executed ledger this download names."
      };
    }
    return {
      available: false,
      reason: "LEDGER_DIGEST_PENDING",
      message: "Export withheld until the execution-ledger digest has been read; it is still loading."
    };
  }

  const payload = {
    answer,
    execution_ledger_digest: ledgerDigest,
    live_honesty: {
      investigation_gaps: live.investigationGaps,
      cycle_refusals: live.cycleRefusals,
      honesty_events: live.honestyEvents,
      ledger_events: live.ledgerEvents
    }
  };
  return {
    available: true,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`,
    filename: `${answer.answer_id}-v${answer.answer_version}.json`,
    label: EXPORT_LABEL,
    toast: EXPORT_TOAST
  };
}
