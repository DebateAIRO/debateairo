import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { renderMail, type MailTemplateId } from "@debateai/mail-templates";
import * as alert from "../../apps/api/src/staff/threat-report-alert.js";

const owner = randomUUID();
const invited = randomUUID();
const asker = "asker@example.test";
const question = "Tomorrow I will hurt my neighbour";
const reportRef = randomUUID();

async function tick(recipient: (staffId: string) => Promise<string | null>) {
  vi.useFakeTimers();
  const claims = [owner, invited].map(recipient_staff_id => ({ alert_id: randomUUID(),
    recipient_staff_id, claim_token: randomUUID() }));
  const sent: unknown[] = [];
  const completed: { alert: string; delivered: boolean }[] = [];
  const repository = { claimAlerts: async () => claims,
    completeAlert: async (alertId: string, _claim: string, delivered: boolean) => { completed.push({ alert: alertId, delivered }); } };
  let timer: NodeJS.Timeout | undefined;
  try {
    timer = alert.startThreatReportAlerts?.({ repository, mail: { sendTemplated: async mail => { sent.push(mail); } },
      readRecipientEmail: recipient, everyMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    return { sent, completed };
  } finally { if (timer) clearInterval(timer); vi.useRealTimers(); }
}

describe("S04 kept threat mail alert", () => {
  it("mails each current holder once without a question or account identifier", async () => {
    // Property: the waiting mail carries no kept content or person/report identifier.
    // Mutant: include the question or report reference in params; a closure timer change is a neighbour.
    const { sent, completed } = await tick(async staffId => staffId === owner ? "owner@example.test" : "holder@example.test");
    expect({ recipients: sent.map(mail => (mail as { to: string }).to),
      payloadHasSensitive: [question, asker, reportRef, owner, invited].some(value => JSON.stringify(sent).includes(value)),
      completed: completed.map(item => item.delivered) }).toEqual({
      recipients: ["owner@example.test", "holder@example.test"], payloadHasSensitive: false,
      completed: [true, true] });
  });

  it("sends nothing to a holder disabled before the drain", async () => {
    // Property: the current holder read gates delivery, not the earlier queued recipient list.
    // Mutant: mail a queued disabled holder; a template wording change is a neighbour.
    const { sent, completed } = await tick(async staffId => staffId === owner ? "owner@example.test" : null);
    expect({ recipients: sent.map(mail => (mail as { to: string }).to),
      completed: completed.map(item => item.delivered) }).toEqual({
      recipients: ["owner@example.test"], completed: [true, true] });
  });

  it("renders the waiting template in English with no parameters", () => {
    // Property: staff receive a generic English notice with no link or identifier.
    // Mutant: require a reportRef param; a billing template change is a neighbour.
    const rendered = renderMail("THREAT_REPORT_WAITING" as MailTemplateId, "ro", {});
    expect({ subject: rendered.subject, text: rendered.text.includes("Open the staff console and go to Threat reports to read it.") }).toEqual({
      subject: "A threat report waits", text: true });
  });
});
