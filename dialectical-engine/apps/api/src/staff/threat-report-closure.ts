import type { PostgresThreatReportRepository } from "@debateai/db";
import { gatedInterval, type ReleaseGate } from "../release-loops.js";

/**
 * The staff threat reports were removed (2026-11-19), but a database may still hold reports kept before 0171, so their
 * retention sweep stays until the migration that drops the schema. The email hold that ran before an account's key
 * was destroyed is gone: it only kept the asker's address readable for the removed staff screen. Erasing the account
 * still unlinks its reports (0128's account_user_id is ON DELETE SET NULL), and this sweep erases them when due.
 */

/** The shortest retention period is 30 days; an hourly sweep adds under 0.2% lag. */
const THREAT_REPORT_ERASURE_EVERY_MS = 3_600_000;

/** Side-by-side C7: the sweep erases shared rows, so it runs only while this process's release is current (`gate`). */
export function startThreatReportErasure(input: Readonly<{
  repository: Pick<PostgresThreatReportRepository, "eraseDue">;
  everyMs?: number;
}>, gate: ReleaseGate): NodeJS.Timeout {
  return gatedInterval(gate, () => { void input.repository.eraseDue().catch(() => undefined); },
    input.everyMs ?? THREAT_REPORT_ERASURE_EVERY_MS);
}
