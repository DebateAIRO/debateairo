import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { OutboxJob } from "@debateai/db";
import {
  createEmailJobHandler,
  emailJob,
  type AttachmentResolver,
  type BillingAttachmentKind,
  type BillingMail
} from "../../apps/api/src/billing/email-job.js";
import { sealBillingProfile, type BillingProfile } from "../../apps/api/src/billing/records.js";
import { MailDeliveryError } from "../../apps/api/src/mail-channel.js";
import { TypedDomainError } from "@debateai/kernel";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const KEY = randomBytes(32);
const CUSTOMER = "4b1c6f2a-9f55-4d47-9d0e-3c1f8b2a7e10";
const JOB_ID = "8c3f1b2e-6a4d-4f1e-9b7a-2d5c8e1f0a93";
const profile = (email: string, locale: string): BillingProfile => ({
  email, locale, name: null, country: "RO", region: null, postalCode: null, city: null, street: null, company: null
});

function asJob(request: ReturnType<typeof emailJob>, attempts = 1): OutboxJob {
  return { jobId: JOB_ID, kind: "EMAIL", ref: request.ref, notBefore: NOW, attempts, payload: request.payload } as unknown as OutboxJob;
}

function harness(current: BillingProfile | null, attachments = new Map<BillingAttachmentKind, AttachmentResolver>()) {
  const sent: BillingMail[] = [];
  const sealed = current === null ? null : sealBillingProfile(KEY, CUSTOMER, current);
  // P1b's `latestProfile` row carries the profile's locale beside the ciphertext.
  const row = current === null || sealed === null ? null
    : { profileCiphertext: sealed.ciphertext, keyId: sealed.keyId, at: NOW, locale: current.locale };
  const latestProfile = vi.fn(async () => row);
  const handler = createEmailJobHandler({
    repository: { latestProfile },
    recordsKey: KEY,
    ownerReportEmail: "owner@example.test",
    mail: { sendTemplated: vi.fn(async (mail: BillingMail) => { sent.push(mail); }) },
    attachments
  });
  return { handler, sent, latestProfile };
}

describe("P7 the EMAIL job", () => {
  it("keeps no address in the queue and reads it from the latest billing profile at send time", async () => {
    const request = emailJob({
      template: "M1", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "sub-1",
      params: { plan: "PLUS", totalAmount: "24.20" }, notBefore: NOW
    });
    expect(request.ref).toBe("M1:sub-1");
    expect(JSON.stringify(request.payload)).not.toContain("@");
    const { handler, sent } = harness(profile("new-address@example.test", "ro"));
    expect(await handler(asJob(request), NOW)).toEqual({ kind: "DONE" });
    expect(sent).toEqual([{
      messageId: JOB_ID, to: "new-address@example.test", templateId: "M1", locale: "ro",
      params: { plan: "PLUS", totalAmount: "24.20" }, attachments: []
    }]);
  });

  it("sends the owner's mail to the owner's custody address in English", async () => {
    const request = emailJob({
      template: "O1", recipient: { kind: "OWNER" }, dedupeRef: "2026-Q4",
      params: { quarter: "2026-Q4", summaryText: "RO net 1.00" }, notBefore: NOW
    });
    const { handler, sent, latestProfile } = harness(null);
    await handler(asJob(request), NOW);
    expect(latestProfile).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ to: "owner@example.test", locale: "en", templateId: "O1" });
    // Q-5: the refund that could not be completed reaches the owner the same way (RefundDesk queues it, P9b).
    const deadRefund = emailJob({
      template: "O2", recipient: { kind: "OWNER" }, dedupeRef: "0123456789abcdef0123456789abcdef:7700001",
      params: { chargeRef: "0123456789abcdef0123456789abcdef", refundAmount: "12.10", reasonCode: "REFUND_OUTCOME_UNKNOWN" },
      notBefore: NOW
    });
    expect(deadRefund.ref).toBe("O2:0123456789abcdef0123456789abcdef:7700001");
    await handler(asJob(deadRefund), NOW);
    expect(sent[1]).toMatchObject({
      to: "owner@example.test", locale: "en", templateId: "O2",
      params: { chargeRef: "0123456789abcdef0123456789abcdef", refundAmount: "12.10", reasonCode: "REFUND_OUTCOME_UNKNOWN" }
    });
  });

  it("resolves each named attachment at send time and skips one that resolves to nothing", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    const attachments = new Map<BillingAttachmentKind, AttachmentResolver>([
      ["SMARTBILL_INVOICE_PDF", async (fields) => ({ filename: `${fields.series}-${fields.number}.pdf`, contentType: "application/pdf", content: pdf })],
      ["ACCEPTED_TERMS", async () => null]
    ]);
    const request = emailJob({
      template: "M2_INVOICE_ATTACHED", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "charge-1",
      params: { plan: "PLUS", totalAmount: "24.20", chargeDate: NOW.toISOString(), invoiceNumber: "DBAI 0042" },
      attachments: [
        { kind: "SMARTBILL_INVOICE_PDF", fields: { series: "DBAI", number: "0042" } },
        { kind: "ACCEPTED_TERMS", fields: { sha256: "a".repeat(64) } }
      ],
      notBefore: NOW
    });
    const { handler, sent } = harness(profile("person@example.test", "ro"), attachments);
    await handler(asJob(request), NOW);
    expect(sent[0]?.attachments).toEqual([{ filename: "DBAI-0042.pdf", contentType: "application/pdf", content: pdf }]);
  });

  it("dead-letters a job it can never send, and lets a mail failure retry", async () => {
    const request = emailJob({
      template: "M10", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "charge-1",
      params: { plan: "PLUS" }, notBefore: NOW
    });
    expect(await harness(null).handler(asJob(request), NOW)).toEqual({ kind: "DEAD", code: "BILLING_PROFILE_MISSING" });
    const unknownAttachment = emailJob({
      template: "M10", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "charge-2",
      params: { plan: "PLUS" }, attachments: [{ kind: "WITHDRAWAL_FORM", fields: {} }], notBefore: NOW
    });
    expect(await harness(profile("p@example.test", "en")).handler(asJob(unknownAttachment), NOW))
      .toEqual({ kind: "DEAD", code: "EMAIL_ATTACHMENT_UNRESOLVED" });
    const failing = createEmailJobHandler({
      repository: { latestProfile: async () => {
        const sealed = sealBillingProfile(KEY, CUSTOMER, profile("p@example.test", "en"));
        return { profileCiphertext: sealed.ciphertext, keyId: sealed.keyId, at: NOW, locale: "en" };
      } },
      recordsKey: KEY, ownerReportEmail: "owner@example.test",
      mail: { sendTemplated: async () => { throw new MailDeliveryError("SENDMAIL_TIMEOUT"); } },
      attachments: new Map()
    });
    await expect(failing(asJob(request), NOW)).rejects.toBeInstanceOf(MailDeliveryError);
  });

  const failingPdf = () => {
    const terms = Buffer.from("terms");
    const attachments = new Map<BillingAttachmentKind, AttachmentResolver>([
      ["SMARTBILL_INVOICE_PDF", async () => { throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "502"); }],
      ["ACCEPTED_TERMS", async () => ({ filename: "terms.txt", contentType: "text/plain; charset=UTF-8", content: terms })]
    ]);
    const request = emailJob({
      template: "M2_INVOICE_ATTACHED", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "charge-3",
      params: { plan: "PLUS", totalAmount: "24.20", chargeDate: NOW.toISOString(), invoiceNumber: "DBAI 0043" },
      attachments: [
        { kind: "SMARTBILL_INVOICE_PDF", fields: { series: "DBAI", number: "0043" } },
        { kind: "ACCEPTED_TERMS", fields: { sha256: "b".repeat(64) } }
      ],
      notBefore: NOW
    });
    return { terms, request, ...harness(profile("person@example.test", "ro"), attachments) };
  };

  it("sends the receipt without an attachment that still fails on the attempt the worker would dead-letter", async () => {
    const { terms, request, handler, sent } = failingPdf();
    // Attempt 6: failureRetryAt(6, now) is null, so a throw here would dead-letter the receipt.
    expect(await handler(asJob(request, 6), NOW)).toEqual({ kind: "DONE" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ templateId: "M2_INVOICE_ATTACHED", params: { invoiceNumber: "DBAI 0043" } });
    expect(sent[0]?.attachments).toEqual([{ filename: "terms.txt", contentType: "text/plain; charset=UTF-8", content: terms }]);
  });

  it("retries an attachment that fails on an earlier attempt, sending nothing yet", async () => {
    const { request, handler, sent } = failingPdf();
    await expect(handler(asJob(request, 1), NOW)).rejects.toMatchObject({ code: "INVOICE_SERVICE_UNAVAILABLE" });
    expect(sent).toEqual([]);
  });
});
