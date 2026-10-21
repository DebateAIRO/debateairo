import type { PostgresThreatReportRepository } from "@debateai/db";

/** The coordinator invokes this while the account is PREPARED and before it destroys the user DEK. */
export function threatReportEmailHold(repository: Pick<PostgresThreatReportRepository, "holdEmails">) {
  return async ({ erasureId, email }: Readonly<{ erasureId: string; userId: string; email: string }>): Promise<void> => {
    await repository.holdEmails(erasureId, email);
  };
}

/** The shortest retention period is 30 days; an hourly sweep adds under 0.2% lag. */
const THREAT_REPORT_ERASURE_EVERY_MS = 3_600_000;

export function startThreatReportErasure(input: Readonly<{
  repository: Pick<PostgresThreatReportRepository, "eraseDue">;
  everyMs?: number;
}>): NodeJS.Timeout {
  const timer = setInterval(() => { void input.repository.eraseDue().catch(() => undefined); },
    input.everyMs ?? THREAT_REPORT_ERASURE_EVERY_MS);
  timer.unref();
  return timer;
}
