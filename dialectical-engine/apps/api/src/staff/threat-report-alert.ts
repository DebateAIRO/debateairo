import type { PostgresThreatReportRepository } from "@debateai/db";
import type { TemplatedMailChannel } from "../mail-channel.js";

type AlertRepository = Pick<PostgresThreatReportRepository, "claimAlerts" | "completeAlert">;
export type ThreatReportAlertInputs = Readonly<{
  repository: AlertRepository;
  mail: TemplatedMailChannel;
  /** A null result means the staff member no longer holds THREAT_REPORT. */
  readRecipientEmail(staffId: string): Promise<string | null>;
  everyMs?: number;
}>;

/** Claims are one-use database leases; mail payloads never contain the report or asker. */
export async function drainThreatReportAlerts(input: ThreatReportAlertInputs): Promise<void> {
  const claims = await input.repository.claimAlerts(100);
  for (const claim of claims) {
    try {
      const recipient = await input.readRecipientEmail(claim.recipient_staff_id);
      if (recipient !== null) {
        await input.mail.sendTemplated({ to: recipient, templateId: "THREAT_REPORT_WAITING",
          locale: "en", params: {}, messageId: claim.alert_id });
      }
      await input.repository.completeAlert(claim.alert_id, claim.claim_token, true);
    } catch {
      await input.repository.completeAlert(claim.alert_id, claim.claim_token, false);
    }
  }
}

/** A 15-second tick gives three retries inside the one-minute notice target. */
const THREAT_REPORT_ALERT_EVERY_MS = 15_000;
export function startThreatReportAlerts(input: ThreatReportAlertInputs): NodeJS.Timeout {
  let active = false;
  const timer = setInterval(() => {
    if (active) return;
    active = true;
    void drainThreatReportAlerts(input).catch(() => undefined).finally(() => { active = false; });
  }, input.everyMs ?? THREAT_REPORT_ALERT_EVERY_MS);
  timer.unref();
  return timer;
}
