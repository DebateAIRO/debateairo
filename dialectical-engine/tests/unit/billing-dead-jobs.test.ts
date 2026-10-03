import { describe, expect, it, vi } from "vitest";
import type { OutboxJob, OutboxKind } from "@debateai/db";
import {
  createDeadJobAlert,
  deadEmailAction,
  documentJobAction,
  unbackedDocumentCode
} from "../../apps/api/src/billing/dead-jobs.js";
import { BillingOutboxWorker } from "../../apps/api/src/billing/outbox.js";
import { createEmailJobHandler, emailJob, type BillingMail } from "../../apps/api/src/billing/email-job.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const CHARGE = "0123456789abcdef0123456789abcdef";
const JOB_ID = "8c3f1b2e-6a4d-4f1e-9b7a-2d5c8e1f0a93";

function job(kind: OutboxKind, ref: string, payload: OutboxJob["payload"] = {}, attempts = 1): OutboxJob {
  return { jobId: JOB_ID, kind, ref, payload, notBefore: NOW, createdAt: NOW, attempts, claimedBy: "w-1", claimedAt: NOW } as unknown as OutboxJob;
}

function workerWith(onDead: (job: OutboxJob, code: string, now: Date) => Promise<void>, fenced = true) {
  const audit = vi.fn();
  const repository = {
    claim: vi.fn(async () => [job("SMARTBILL_INVOICE", CHARGE)]),
    renewClaim: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => fenced)
  };
  const worker = new BillingOutboxWorker({ repository, workerId: "w-1", clock: () => NOW, audit, batchSize: 20, onDead });
  return { worker, audit, repository };
}

function alertOn() {
  const enqueued: Array<Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>> = [];
  const alert = createDeadJobAlert({
    repository: {
      withTransaction: async <T>(work: (client: never) => Promise<T>) => work({} as never),
      enqueue: async (_client: unknown, entry: { kind: string; ref: string; payload: Readonly<Record<string, unknown>> }) => {
        enqueued.push(entry);
        return "job";
      }
    }
  });
  return { alert, enqueued };
}

describe("W12 (P2-I16) a job that dies reaches the owner at once", () => {
  it("hands every dead job to the alert once its dead-letter landed, and never a retried or fenced-out one", async () => {
    const onDead = vi.fn(async () => undefined);
    const { worker } = workerWith(onDead);
    worker.register("SMARTBILL_INVOICE", async () => ({ kind: "DEAD", code: "INVOICE_UNKNOWN" }));
    expect(await worker.runOnce()).toEqual([{ jobId: JOB_ID, kind: "SMARTBILL_INVOICE", outcome: "DEAD" }]);
    expect(onDead).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB_ID, kind: "SMARTBILL_INVOICE" }), "INVOICE_UNKNOWN", NOW);

    const spent = vi.fn(async () => undefined);
    const exhausted = workerWith(spent);
    exhausted.worker.register("SMARTBILL_INVOICE", async () => ({ kind: "RETRY", code: "INVOICE_SERVICE_UNAVAILABLE", retryAt: null }));
    await exhausted.worker.runOnce();
    expect(spent).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB_ID }), "INVOICE_SERVICE_UNAVAILABLE", NOW);

    const later = vi.fn(async () => undefined);
    const retried = workerWith(later);
    retried.worker.register("SMARTBILL_INVOICE", async () => ({ kind: "RETRY", code: "INVOICE_SERVICE_UNAVAILABLE", retryAt: new Date(NOW.getTime() + 60_000) }));
    await retried.worker.runOnce();
    expect(later).not.toHaveBeenCalled();

    const lost = vi.fn(async () => undefined);
    const fencedOut = workerWith(lost, false);
    fencedOut.worker.register("SMARTBILL_INVOICE", async () => ({ kind: "DEAD", code: "INVOICE_UNKNOWN" }));
    await fencedOut.worker.runOnce();
    expect(lost).not.toHaveBeenCalled();
  });

  it("keeps the job dead when the alert cannot be queued, with one content-free line (the lists still name it)", async () => {
    const { worker, audit } = workerWith(async () => { throw new Error("the database went away"); });
    worker.register("SMARTBILL_INVOICE", async () => ({ kind: "DEAD", code: "INVOICE_UNKNOWN" }));
    expect(await worker.runOnce()).toEqual([{ jobId: JOB_ID, kind: "SMARTBILL_INVOICE", outcome: "DEAD" }]);
    expect(audit).toHaveBeenCalledWith("billing.outbox.alert_failed", { kind: "SMARTBILL_INVOICE", code: "INVOICE_UNKNOWN" });
  });

  it("emails the owner O3 for a dead invoice or credit-note job, with the charge, the code and what to do", async () => {
    const { alert, enqueued } = alertOn();
    await alert(job("SMARTBILL_INVOICE", CHARGE), "INVOICE_UNKNOWN", NOW);
    await alert(job("QUADERNO_RECORD_REFUND", `${CHARGE}:9912345`), "TAX_SERVICE_REFUSED", NOW);
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]).toMatchObject({
      kind: "EMAIL", ref: `O3:${JOB_ID}`,
      payload: {
        template: "O3", recipient: "OWNER", "param.jobKind": "SMARTBILL_INVOICE", "param.reference": `charge ${CHARGE}`,
        "param.reasonCode": "INVOICE_UNKNOWN"
      }
    });
    expect(String(enqueued[0]!.payload["param.nextSteps"]))
      .toContain(`pnpm billing:invoice --charge ${CHARGE} --kind INVOICE --record <series>-<number>`);
    expect(String(enqueued[0]!.payload["param.nextSteps"]))
      .toContain(`pnpm billing:invoice --charge ${CHARGE} --kind INVOICE --requeue --confirm-not-issued`);
    expect(String(enqueued[1]!.payload["param.nextSteps"]))
      .toContain(`pnpm billing:invoice --charge ${CHARGE} --kind CREDIT_NOTE --requeue`);
  });

  it("emails the owner O3 for every dead email but its own, and for nothing else", async () => {
    const { alert, enqueued } = alertOn();
    await alert(job("EMAIL", `M1:${CHARGE}`, { template: "M1", recipient: "CUSTOMER" }), "BILLING_PROFILE_UNREADABLE", NOW);
    await alert(job("EMAIL", `M3:sub:2026-11-01T00:00:00.000Z:23800000`, { template: "M3", recipient: "CUSTOMER" }), "OUTBOX_HANDLER_FAILED", NOW);
    await alert(job("EMAIL", `O3:${JOB_ID}`, { template: "O3", recipient: "OWNER" }), "OUTBOX_HANDLER_FAILED", NOW);
    await alert(job("XMONEY_REFUND", `${CHARGE}:9912345`), "XMONEY_REFUSED", NOW);
    await alert(job("VERIFY_PAYMENT", "9912345"), "CHARGE_NOT_FOUND", NOW);
    expect(enqueued.map((entry) => [entry.payload["param.jobKind"], entry.payload["param.reference"]])).toEqual([
      ["EMAIL M1", `M1:${CHARGE}`],
      ["EMAIL M3", "M3:sub:2026-11-01T00:00:00.000Z:23800000"]
    ]);
    expect(String(enqueued[1]!.payload["param.nextSteps"])).toContain("not charged");
  });

  it("presents a job our records do not back as nothing to issue or re-queue (the W4 forward), never as a document to record", () => {
    const missing = documentJobAction({ chargeId: CHARGE, jobKind: "SMARTBILL_STORNO", code: "CREDIT_NOTE_REFUND_MISSING" });
    expect(missing).toContain("no refund is recorded for this sale: nothing to issue or re-queue; tell whoever runs the server");
    for (const code of ["CREDIT_NOTE_REFUND_MISSING", "CREDIT_NOTE_PAYLOAD_INVALID", "INVOICE_CHARGE_NOT_PAID", "OTHER_XMONEY_SYSTEM"]) {
      expect(unbackedDocumentCode(code), code).toBe(true);
      const text = documentJobAction({ chargeId: CHARGE, jobKind: "QUADERNO_RECORD_REFUND", code });
      expect(text, code).not.toContain("--record");
      expect(text, code).not.toContain("--requeue");
    }
    for (const code of ["INVOICE_UNKNOWN", "TAX_SERVICE_REFUSED", "INVOICE_ORIGINAL_MISSING", "OUTBOX_HANDLER_FAILED"]) {
      expect(unbackedDocumentCode(code), code).toBe(false);
    }
  });

  it("says what to do for each way a document is lost", () => {
    const say = (jobKind: string, code: string) => documentJobAction({ chargeId: CHARGE, jobKind, code });
    expect(say("QUADERNO_RECORD_SALE", "TAX_SERVICE_REFUSED")).toContain("revoked key");
    expect(say("QUADERNO_RECORD_SALE", "TAX_SERVICE_REFUSED")).toContain("never issued twice");
    expect(say("QUADERNO_RECORD_SALE", "TAX_SERVICE_UNAVAILABLE")).toContain(`--charge ${CHARGE} --kind INVOICE --requeue`);
    expect(say("SMARTBILL_STORNO", "INVOICE_ORIGINAL_MISSING")).toContain("settle the invoice first");
    expect(say("SMARTBILL_INVOICE", "INVOICE_SERVICE_REFUSED")).toContain("SmartBill never issued it");
    expect(say("SMARTBILL_STORNO", "CREDIT_NOTE_MANUAL")).toContain(`--kind CREDIT_NOTE --record <series>-<number>`);
    expect(say("QUADERNO_RECORD_SALE", "INVOICE_UNKNOWN")).toContain("--record <Quaderno id>");
    expect(say("DASHBOARD_REFUND", "CREDIT_NOTE_MANUAL")).toContain("only the dashboard shows");
    // A SmartBill job is re-queued only after the owner checked SmartBill: it has no lookup (X1 row 8).
    expect(say("SMARTBILL_INVOICE", "OUTBOX_HANDLER_FAILED")).toContain("--requeue --confirm-not-issued");
    expect(say("SMARTBILL_INVOICE", "OUTBOX_HANDLER_FAILED")).toContain("checked in SmartBill that nothing was issued");
  });

  it("says what a lost email means for each kind of email", () => {
    expect(deadEmailAction("M1", "CUSTOMER")).toContain("withdrawal form");
    expect(deadEmailAction("M3", "CUSTOMER")).toContain("not charged");
    expect(deadEmailAction("M8_RECEIVED", "CUSTOMER")).toContain("acknowledgement");
    expect(deadEmailAction("M2_INVOICE_ATTACHED", "CUSTOMER")).toContain("receipt");
    expect(deadEmailAction("O1", "OWNER")).toContain("OWNER_REPORT_EMAIL_PATH");
    expect(deadEmailAction("M7", "CUSTOMER")).toContain("nothing sends it again by itself");
  });

  it("runs the EMAIL job's sent hook only once the email went out, which is where M3's notice record is written (A7)", async () => {
    const sent: BillingMail[] = [];
    const after = vi.fn(async (_job: OutboxJob, _now: Date) => undefined);
    const request = emailJob({ template: "O1", recipient: { kind: "OWNER" }, dedupeRef: "2026-Q4", params: { quarter: "2026-Q4", summaryText: "x" }, notBefore: NOW });
    const handler = (failing: boolean) => createEmailJobHandler({
      repository: { latestProfile: async () => null }, recipients: { currentAddress: async () => null },
      recordsKey: Buffer.alloc(32), ownerReportEmail: "owner@example.test", attachments: new Map(),
      mail: { sendTemplated: async (mail) => { if (failing) throw new Error("relay down"); sent.push(mail); } },
      sent: after
    });
    const claimed = { jobId: JOB_ID, kind: "EMAIL", ref: request.ref, payload: request.payload, notBefore: NOW, attempts: 1 } as unknown as OutboxJob;
    await expect(handler(true)(claimed, NOW)).rejects.toThrow("relay down");
    expect(after).not.toHaveBeenCalled();
    expect(await handler(false)(claimed, NOW)).toEqual({ kind: "DONE" });
    expect(sent).toHaveLength(1);
    expect(after).toHaveBeenCalledWith(claimed, NOW);
  });
});
