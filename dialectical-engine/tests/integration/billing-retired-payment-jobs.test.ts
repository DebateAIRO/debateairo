import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingRepository, RETIRED_OUTBOX_KINDS } from "@debateai/db";
import { startBillingStack, type BillingStack } from "../support/billingStack.js";

/**
 * N23 (spec 2026-10-05 §2.5.4): a developer database filled by the old dev-stack fakes may still hold queued jobs of
 * the previous card processor. Through the runtime exactly as main.ts composes it, each ends DEAD
 * OTHER_PAYMENT_SYSTEM before any call to NETOPIA, and a dead refund of that era is listed as owing nothing here.
 */
let stack: BillingStack;
beforeAll(async () => { stack = await startBillingStack(); }, 600_000);
afterAll(async () => { await stack?.stop(); });

const CHARGE = "b".repeat(32);

async function queueOld(kind: string, ref: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
  await stack.database.pool.query(
    `INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
     VALUES ($1, $2, $3, $4::jsonb, clock_timestamp(), clock_timestamp() - interval '1 second')`,
    [randomUUID(), kind, ref, JSON.stringify(payload)]
  );
}

async function ending(kind: string, ref: string): Promise<Array<{ dead: boolean; done: boolean; code: string | null }>> {
  return (await stack.database.pool.query<{ dead: boolean; done: boolean; code: string | null }>(
    `SELECT dead_at IS NOT NULL AS dead, done_at IS NOT NULL AS done, last_error_code AS code
     FROM billing.outbox WHERE kind = $1 AND ref = $2`, [kind, ref]
  )).rows;
}

describe("N23 old jobs end instead of staying queued", () => {
  it("ends an old refund job DEAD OTHER_PAYMENT_SYSTEM, calls nothing, and lists it as REFUND_OTHER_SYSTEM's code", async () => {
    const kind = RETIRED_OUTBOX_KINDS[0]!;
    const ref = `${CHARGE}:61001`;
    const calls = stack.netopia.lastRequests.length;
    await queueOld(kind, ref, {
      charge_id: CHARGE, transaction_id: "61001", amount_micros: 24_200_000, whole: true, owner_ref: randomUUID(),
      reason: "WITHDRAWAL"
    });
    await stack.runJobs();
    expect(await ending(kind, ref)).toEqual([{ dead: true, done: false, code: "OTHER_PAYMENT_SYSTEM" }]);
    expect(stack.netopia.lastRequests.length).toBe(calls);
    const dead = (await new BillingRepository(stack.database.pool).deadRefunds()).filter((row) => row.chargeId === CHARGE);
    expect(dead.map((row) => [row.transactionId, row.code])).toEqual([["61001", "OTHER_PAYMENT_SYSTEM"]]);
    // No refund is owed here, so the owner is not asked to make one.
    expect(stack.mailsTo("owner@example.test").filter((mail) => mail.templateId === "O2_REFUND_DUE")).toEqual([]);
  });

  it("ends a payment check keyed by an old transaction number DEAD OTHER_PAYMENT_SYSTEM, before any status read", async () => {
    const ref = "9912345";
    const calls = stack.netopia.lastRequests.length;
    await queueOld("VERIFY_PAYMENT", ref, { notice_id: null, order_id: "4711", external_order_id: CHARGE });
    await stack.runJobs();
    expect(await ending("VERIFY_PAYMENT", ref)).toEqual([{ dead: true, done: false, code: "OTHER_PAYMENT_SYSTEM" }]);
    expect(stack.netopia.lastRequests.length).toBe(calls);
  });

  it("still reads NETOPIA's status for a payment check keyed by one of our charge ids (control: no blanket refusal)", async () => {
    const person = await stack.signUp("retired.control@example.test", "DE");
    const quote = await stack.quote(person, "PLUS");
    const checkout = await stack.checkout(person, String(quote.body.quote_ref));
    expect(checkout.status).toBe(200);
    const ref = String(checkout.body.charge_ref);
    const calls = stack.netopia.lastRequests.length;
    await stack.database.pool.query(
      `INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
       VALUES ($1, 'VERIFY_PAYMENT', $2, '{}'::jsonb, clock_timestamp(), clock_timestamp() - interval '1 second')
       ON CONFLICT (kind, ref) WHERE done_at IS NULL AND dead_at IS NULL DO NOTHING`,
      [randomUUID(), ref]
    );
    await stack.runJobs();
    expect((await ending("VERIFY_PAYMENT", ref)).map((row) => row.code)).not.toContain("OTHER_PAYMENT_SYSTEM");
    // The check asked NETOPIA (a status read), which an old job never does.
    expect(stack.netopia.lastRequests.length).toBeGreaterThan(calls);
  });
});
