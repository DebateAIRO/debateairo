import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createBillingTestAccount, eraseBillingTestAccount } from "../support/billingAccountFixture.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

const APPEND_ONLY = [
  "billing.customer", "billing.customer_xmoney", "billing.customer_profile_event", "billing.quote",
  "billing.subscription_event", "billing.charge", "billing.charge_event", "billing.quote_use",
  "billing.location_evidence", "billing.invoice_intent", "billing.invoice", "billing.invoice_status_event",
  "billing.xmoney_notice", "billing.xmoney_notice_outcome", "billing.cancel_token", "billing.cancel_token_use"
] as const;
/** B5's 0084 tables carry the same guard (R-13), so the one purge path reaches them too. */
const ENTITLEMENT_TABLES = ["billing.entitlement_event", "billing.run_charge_scope"] as const;
type XMoneySystem = "stage" | "live";
const chargeIdOf = (): string => randomUUID().replaceAll("-", "");
const keyId = "0123456789abcdef";
// Dates relative to the database clock's year, so the retention cases stay true in any year.
const thisYear = new Date().getUTCFullYear();
// Every row outside the retention cases is dated this year, so no purge below ever reaches it.
const RECENT = `${thisYear}-01-15T10:00:00Z`;

async function asRuntime<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_runtime");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertQuote(i: Readonly<{
  quoteId: string; ownerRef: string; kind: "SUBSCRIBE" | "UPGRADE" | "RENEWAL"; createdAt: string; recurringTotalMicros: number | null;
}>) {
  return database.pool.query(`
    INSERT INTO billing.quote (quote_id, owner_ref, plan_id, kind, net_micros, tax_micros, total_micros, tax_country,
      tax_region, tax_rate_bp, tax_status, tax_name, quaderno_ref, created_at, expires_at, location_ciphertext, key_id,
      recurring_total_micros)
    VALUES ($1, $2, 'PLUS', $3, 20000000, 4200000, 24200000, 'RO', NULL, 2100, 'TAXABLE', 'VAT', NULL,
      $4::timestamptz, $4::timestamptz + interval '30 minutes', '\\x01', $5, $6)
  `, [i.quoteId, i.ownerRef, i.kind, i.createdAt, keyId, i.recurringTotalMicros]);
}

async function createdEvent(subscriptionId: string, ownerRef: string, at: string, system: XMoneySystem): Promise<void> {
  await database.pool.query(`
    INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
    VALUES ($1, $2, $3, 'CREATED', $4, 'PLUS', jsonb_build_object('xmoney_environment', $5::text))
  `, [randomUUID(), subscriptionId, ownerRef, at, system]);
}

async function seedCharge(createdAt = RECENT, system: XMoneySystem = "stage"): Promise<{
  ownerRef: string; subscriptionId: string; quoteId: string; chargeId: string;
}> {
  const ownerRef = randomUUID();
  const subscriptionId = randomUUID();
  const quoteId = randomUUID();
  const chargeId = chargeIdOf();
  await insertQuote({ quoteId, ownerRef, kind: "SUBSCRIBE", createdAt, recurringTotalMicros: null });
  await createdEvent(subscriptionId, ownerRef, createdAt, system);
  await database.pool.query(`
    INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end, quote_id,
      net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
    VALUES ($1, $2, $3, 'INITIAL', 1, $4::timestamptz, $4::timestamptz + interval '1 month', $5, 20000000, 4200000,
      24200000, 'USD', $4, $6)
  `, [chargeId, ownerRef, subscriptionId, createdAt, quoteId, system]);
  return { ownerRef, subscriptionId, quoteId, chargeId };
}

/** A12: the card-change hold, which has no quote and may be 0.00 if X0 shows xMoney allows it. */
async function seedCardCheck(totalMicros: number): Promise<string> {
  const chargeId = chargeIdOf();
  await database.pool.query(`
    INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end, quote_id,
      net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
    VALUES ($1, $2, $3, 'CARD_CHECK', 1, $4::timestamptz, $4::timestamptz + interval '1 month', NULL, $5, 0, $5,
      'USD', $4, 'stage')
  `, [chargeId, randomUUID(), randomUUID(), RECENT, totalMicros]);
  return chargeId;
}

async function chargeEvent(
  chargeId: string, kind: string, transactionId: string | null, amountMicros: number | null,
  options: Readonly<{ at?: string; refunds?: string; system?: XMoneySystem }> = {}
) {
  return database.pool.query(`
    INSERT INTO billing.charge_event (charge_id, kind, at, xmoney_transaction_id, amount_micros, error_code,
      refunds_transaction_id, xmoney_environment)
    VALUES ($1, $2, $3, $4, $5, NULL, $6, $7) ON CONFLICT DO NOTHING RETURNING event_id
  `, [chargeId, kind, options.at ?? `${thisYear}-01-15T10:01:00Z`, transactionId, amountMicros, options.refunds ?? null,
    options.system ?? "stage"]);
}

async function purge(at: string): Promise<number> {
  const row = (await database.pool.query<{ purged: string }>(
    "SELECT billing.purge_expired_records($1::timestamptz) AS purged", [at]
  )).rows[0];
  return Number(row!.purged);
}

async function exists(sql: string, values: unknown[]): Promise<boolean> {
  return ((await database.pool.query(sql, values)).rowCount ?? 0) > 0;
}

const refused = { code: "23514", message: "REFUND_EXCEEDS_CHARGE" } as const;

describe("P1a — billing tables are append-only and guarded", () => {
  it("installs the truncate guard and the retention-aware mutation guard on every table, B5's included", async () => {
    const rows = (await database.pool.query<{ relation: string; guards: string[] }>(`
      SELECT trigger.tgrelid::regclass::text AS relation,
        array_agg(trigger.tgname::text ORDER BY trigger.tgname) AS guards
      FROM pg_catalog.pg_trigger AS trigger
      WHERE NOT trigger.tgisinternal AND trigger.tgenabled IN ('O','A')
        AND trigger.tgfoid = ANY(ARRAY['core.reject_truncate()'::regprocedure,
          'billing.reject_mutation_unless_retention_purge()'::regprocedure])
        AND trigger.tgrelid::regclass::text LIKE 'billing.%'
      GROUP BY trigger.tgrelid
    `)).rows;
    const byRelation = new Map(rows.map((row) => [row.relation, row.guards]));
    for (const relation of [...APPEND_ONLY, ...ENTITLEMENT_TABLES]) {
      expect(byRelation.get(relation), relation).toEqual(["reject_mutation", "reject_truncate"]);
    }
    expect(byRelation.get("billing.outbox")).toEqual(["reject_delete", "reject_truncate"]);
  });

  it("refuses UPDATE, DELETE and TRUNCATE even for the owner", async () => {
    const seeded = await seedCharge();
    await expect(database.pool.query("UPDATE billing.charge SET attempt = 2 WHERE charge_id = $1", [seeded.chargeId]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query("DELETE FROM billing.subscription_event WHERE subscription_id = $1", [seeded.subscriptionId]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query("TRUNCATE billing.quote CASCADE")).rejects.toMatchObject({ code: "55000" });
  });

  it("gives the runtime SELECT and INSERT only, and on the outbox only the claim columns", async () => {
    const privileges = (await database.pool.query<{ relation: string; can_insert: boolean; can_update: boolean; can_delete: boolean }>(`
      SELECT relation, has_table_privilege('debateai_runtime', relation, 'INSERT') AS can_insert,
        has_table_privilege('debateai_runtime', relation, 'UPDATE') AS can_update,
        has_table_privilege('debateai_runtime', relation, 'DELETE') AS can_delete
      FROM unnest($1::text[]) AS relation
    `, [[...APPEND_ONLY, "billing.outbox"]])).rows;
    for (const row of privileges) {
      expect(row, row.relation).toMatchObject({ can_insert: true, can_update: false, can_delete: false });
    }
    const columns = (await database.pool.query<{ column_name: string; allowed: boolean }>(`
      SELECT column_name, has_column_privilege('debateai_runtime', 'billing.outbox', column_name, 'UPDATE') AS allowed
      FROM information_schema.columns WHERE table_schema = 'billing' AND table_name = 'outbox' ORDER BY column_name
    `)).rows;
    expect(columns.filter((column) => column.allowed).map((column) => column.column_name)).toEqual([
      "attempts", "claimed_at", "claimed_by", "dead_at", "done_at", "last_error_code", "not_before"
    ]);
    await asRuntime(async (client) => {
      const jobId = randomUUID();
      await client.query(`INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
        VALUES ($1, 'EMAIL', $2, '{}'::jsonb, clock_timestamp(), clock_timestamp())`, [jobId, `m1:${jobId}`]);
      await client.query("UPDATE billing.outbox SET claimed_by = 'w1', claimed_at = clock_timestamp(), attempts = attempts + 1 WHERE job_id = $1", [jobId]);
    });
    await expect(asRuntime((client) => client.query("UPDATE billing.outbox SET kind = 'EMAIL'")))
      .rejects.toMatchObject({ code: "42501" });
    await expect(database.pool.query("DELETE FROM billing.outbox")).rejects.toMatchObject({ code: "55000" });
  });

  it("queues every job kind the billing jobs use, the refund executor and the yearly purge included (R-30)", async () => {
    for (const kind of [
      "VERIFY_PAYMENT", "QUADERNO_RECORD_SALE", "QUADERNO_RECORD_REFUND", "SMARTBILL_INVOICE", "SMARTBILL_STORNO",
      "EMAIL", "RENEWAL_NOTICE", "OWNER_TAX_SUMMARY", "XMONEY_REFUND", "RETENTION_PURGE"
    ]) {
      await asRuntime((client) => client.query(`INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
        VALUES ($1, $2, $3, '{}'::jsonb, clock_timestamp(), clock_timestamp())`, [randomUUID(), kind, `kinds:${randomUUID()}`]));
    }
    await expect(asRuntime((client) => client.query(`INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
      VALUES ($1, 'CANCEL_ORDER', 'kinds:x', '{}'::jsonb, clock_timestamp(), clock_timestamp())`, [randomUUID()])))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("keeps billing tables free of any foreign key to identity.user", async () => {
    const references = (await database.pool.query<{ name: string }>(`
      SELECT constraint_row.conname AS name FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.contype = 'f' AND constraint_row.conrelid::regclass::text LIKE 'billing.%'
        AND constraint_row.confrelid = 'identity."user"'::regclass
    `)).rows;
    expect(references).toEqual([]);
  });

  it("links one xMoney customer per environment, stage or live (R-14)", async () => {
    const customerId = randomUUID();
    await database.pool.query(`INSERT INTO billing.customer (customer_id, owner_ref, created_at, created_locale)
      VALUES ($1, $2, clock_timestamp(), 'ro')`, [customerId, randomUUID()]);
    await database.pool.query(`INSERT INTO billing.customer_xmoney (customer_id, environment, xmoney_customer_id, at)
      VALUES ($1, 'stage', '5501', clock_timestamp()), ($1, 'live', '9001', clock_timestamp())`, [customerId]);
    await expect(database.pool.query(`INSERT INTO billing.customer_xmoney (customer_id, environment, xmoney_customer_id, at)
      VALUES ($1, 'stage', '5502', clock_timestamp())`, [customerId])).rejects.toMatchObject({ code: "23505" });
    await expect(database.pool.query(`INSERT INTO billing.customer_xmoney (customer_id, environment, xmoney_customer_id, at)
      VALUES ($1, 'sandbox', '5503', clock_timestamp())`, [customerId])).rejects.toMatchObject({ code: "23514" });
  });

  it("makes every subscription name its xMoney system when it is created", async () => {
    await expect(database.pool.query(`
      INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
      VALUES ($1, $2, $3, 'CREATED', clock_timestamp(), 'PLUS', '{}'::jsonb)
    `, [randomUUID(), randomUUID(), randomUUID()])).rejects.toMatchObject({ code: "23514" });
    await createdEvent(randomUUID(), randomUUID(), RECENT, "live");
  });
});

describe("P1a — money invariants in SQL", () => {
  it("numbers dunning attempts 1..4 only, the range B4a's dunning_retry_days.max(3) allows (A2)", async () => {
    const seeded = await seedCharge();
    const renewal = (attempt: number) => database.pool.query(`
      INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end, quote_id,
        net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
      VALUES ($1, $2, $3, 'RENEWAL', $4, $5::timestamptz + interval '1 month', $5::timestamptz + interval '2 months', $6,
        20000000, 4200000, 24200000, 'USD', $5, 'stage')
    `, [chargeIdOf(), seeded.ownerRef, seeded.subscriptionId, attempt, RECENT, seeded.quoteId]);
    // The last retry a sealed policy can ask for (three retry days after the first attempt) inserts.
    expect((await renewal(4)).rowCount).toBe(1);
    // One more is refused by the attempt CHECK, so the reader and the table can never disagree unseen.
    await expect(renewal(5)).rejects.toMatchObject({ code: "23514", constraint: "charge_attempt_check" });
  });

  it("allows one SUCCEEDED per charge, one row per (transaction, kind) and one payment per transaction", async () => {
    const { chargeId } = await seedCharge();
    expect((await chargeEvent(chargeId, "SUCCEEDED", "9001", 24_200_000)).rowCount).toBe(1);
    expect((await chargeEvent(chargeId, "SUCCEEDED", "9001", 24_200_000)).rowCount).toBe(0);
    expect((await chargeEvent(chargeId, "SUCCEEDED", "9002", 24_200_000)).rowCount).toBe(0);
    // A transaction takes money once: the payment itself can never also be its own duplicate.
    expect((await chargeEvent(chargeId, "DUPLICATE_PAYMENT", "9001", 24_200_000)).rowCount).toBe(0);
    await expect(chargeEvent(chargeId, "SUBMITTED", null, null)).rejects.toMatchObject({ code: "23514" });
    await expect(chargeEvent(chargeId, "DUPLICATE_PAYMENT", "9003", null)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a refund above what its transaction paid, counting a request and its confirmation once", async () => {
    const { chargeId } = await seedCharge();
    await expect(chargeEvent(chargeId, "REFUND_REQUESTED", "9101", 1_000_000)).rejects.toMatchObject(refused);
    await chargeEvent(chargeId, "SUCCEEDED", "9101", 24_200_000);
    expect((await chargeEvent(chargeId, "REFUND_REQUESTED", "9101", 20_000_000)).rowCount).toBe(1);
    expect((await chargeEvent(chargeId, "REFUNDED", "9101", 20_000_000)).rowCount).toBe(1);
    expect((await chargeEvent(chargeId, "REFUNDED", "9101", 20_000_000)).rowCount).toBe(0);
    // A later dashboard refund that xMoney reports as its own transaction, linked to the payment.
    await expect(chargeEvent(chargeId, "REFUNDED", "9102", 4_300_000, { refunds: "9101" })).rejects.toMatchObject(refused);
    expect((await chargeEvent(chargeId, "REFUNDED", "9102", 4_200_000, { refunds: "9101" })).rowCount).toBe(1);
    // A refund that names no paid transaction is refused, whatever room the charge has left.
    const other = await seedCharge();
    await chargeEvent(other.chargeId, "SUCCEEDED", "9103", 24_200_000);
    await expect(chargeEvent(other.chargeId, "REFUNDED", "9104", 1_000_000)).rejects.toMatchObject(refused);
  });

  it("counts a refund that is its own transaction once against the payment it refunds", async () => {
    const { chargeId } = await seedCharge();
    await chargeEvent(chargeId, "SUCCEEDED", "9111", 24_200_000);
    expect((await chargeEvent(chargeId, "REFUND_REQUESTED", "9111", 12_100_000)).rowCount).toBe(1);
    // Our request's confirmation arrives on the refund's own transaction 9112, linked to 9111: still 12.10 in all.
    expect((await chargeEvent(chargeId, "REFUNDED", "9112", 12_100_000, { refunds: "9111" })).rowCount).toBe(1);
    // So the other 12.10 is still refundable (a dashboard refund), and not one cent more.
    expect((await chargeEvent(chargeId, "REFUNDED", "9113", 12_100_000, { refunds: "9111" })).rowCount).toBe(1);
    await expect(chargeEvent(chargeId, "REFUNDED", "9114", 10_000, { refunds: "9111" })).rejects.toMatchObject(refused);
    // A request names its own target; it cannot point elsewhere.
    await expect(chargeEvent(chargeId, "REFUND_REQUESTED", "9111", 10_000, { refunds: "9199" }))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("refunds a second payment of one charge like the first, per transaction and in total (DUPLICATE_PAYMENT)", async () => {
    const { chargeId } = await seedCharge();
    await chargeEvent(chargeId, "SUCCEEDED", "9121", 24_200_000);
    expect((await chargeEvent(chargeId, "DUPLICATE_PAYMENT", "9122", 24_200_000)).rowCount).toBe(1);
    // The duplicate goes back in full, then a withdrawal refunds the real payment in full: both pass.
    expect((await chargeEvent(chargeId, "REFUND_REQUESTED", "9122", 24_200_000)).rowCount).toBe(1);
    expect((await chargeEvent(chargeId, "REFUNDED", "9122", 24_200_000)).rowCount).toBe(1);
    expect((await chargeEvent(chargeId, "REFUND_REQUESTED", "9121", 24_200_000)).rowCount).toBe(1);
    // Per transaction: 9121 paid 24.20, so a report of 30.00 refunded on it is refused, although the charge as a
    // whole took 48.40 — a total-only check would let our records refund one payment twice.
    const other = await seedCharge();
    await chargeEvent(other.chargeId, "SUCCEEDED", "9131", 24_200_000);
    await chargeEvent(other.chargeId, "DUPLICATE_PAYMENT", "9132", 24_200_000);
    await expect(chargeEvent(other.chargeId, "REFUNDED", "9133", 30_000_000, { refunds: "9131" })).rejects.toMatchObject(refused);
  });

  it("releases a zero card-check hold, and refuses a zero refund of a real payment", async () => {
    const hold = await seedCardCheck(0);
    await chargeEvent(hold, "SUCCEEDED", "9141", 0);
    expect((await chargeEvent(hold, "REFUND_REQUESTED", "9141", 0)).rowCount).toBe(1);
    const { chargeId } = await seedCharge();
    await chargeEvent(chargeId, "SUCCEEDED", "9142", 24_200_000);
    await expect(chargeEvent(chargeId, "REFUND_REQUESTED", "9142", 0))
      .rejects.toMatchObject({ code: "23514", message: "REFUND_AMOUNT_INVALID" });
  });

  it("keeps stage and live transaction ids apart: the same number in live is a new payment", async () => {
    const stage = await seedCharge(RECENT, "stage");
    const live = await seedCharge(RECENT, "live");
    expect((await chargeEvent(stage.chargeId, "SUCCEEDED", "9401", 24_200_000)).rowCount).toBe(1);
    expect((await chargeEvent(live.chargeId, "SUCCEEDED", "9401", 24_200_000, { system: "live" })).rowCount).toBe(1);
    // An event can never name another system than its charge.
    await expect(chargeEvent(stage.chargeId, "REFUND_REQUESTED", "9401", 1_000_000, { system: "live" }))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("keeps xMoney's own time only on a row that IS that xMoney transaction (the tax summary's date)", async () => {
    const seeded = await seedCharge();
    const timeRefused = { code: "23514", constraint: "charge_event_xmoney_time_names_transaction" } as const;
    const timed = (kind: string, transactionId: string | null, amountMicros: number | null, refunds: string | null) =>
      database.pool.query<{ at: Date; xmoney_created_at: Date }>(`
        INSERT INTO billing.charge_event (charge_id, kind, at, xmoney_transaction_id, amount_micros, error_code,
          refunds_transaction_id, xmoney_environment, xmoney_created_at)
        VALUES ($1, $2, $3::timestamptz + interval '1 hour', $4, $5, NULL, $6, 'stage', $3)
        RETURNING at, xmoney_created_at
      `, [seeded.chargeId, kind, RECENT, transactionId, amountMicros, refunds]);
    await expect(timed("REQUESTED", null, null, null)).rejects.toMatchObject(timeRefused);
    // Recorded an hour after xMoney took the money: both instants are kept, each in its own column.
    const written = await timed("SUCCEEDED", "9451", 24_200_000, null);
    expect(written.rows[0]!.xmoney_created_at.toISOString()).toBe(new Date(RECENT).toISOString());
    expect(written.rows[0]!.at.getTime() - written.rows[0]!.xmoney_created_at.getTime()).toBe(3_600_000);
    // A status change of the payment itself (refund-ok, charge-back) names the PAYMENT's transaction, whose
    // creationDate is the payment's: such a row carries no xMoney time (the refund-sum trigger lets both through
    // first — 9451 paid 24.20 — so the refusal is this constraint's).
    await expect(timed("REFUNDED", "9451", 1_000_000, null)).rejects.toMatchObject(timeRefused);
    await expect(timed("CHARGEBACK", "9451", null, null)).rejects.toMatchObject(timeRefused);
    // A refund xMoney reports as its own transaction, linked to the payment, is that transaction: its time is kept.
    expect((await timed("REFUNDED", "9452", 1_000_000, "9451")).rowCount).toBe(1);
    // A second payment is its own transaction too.
    expect((await timed("DUPLICATE_PAYMENT", "9453", 24_200_000, null)).rowCount).toBe(1);
  });

  it("serialises two concurrent refunds of one charge so only one can pass", async () => {
    const { chargeId } = await seedCharge();
    await chargeEvent(chargeId, "SUCCEEDED", "9201", 24_200_000);
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    const refundOf9201 = (refundTransaction: string) => `INSERT INTO billing.charge_event (charge_id, kind, at,
        xmoney_transaction_id, amount_micros, refunds_transaction_id, xmoney_environment)
      VALUES ($1, 'REFUNDED', clock_timestamp(), '${refundTransaction}', 20000000, '9201', 'stage')`;
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      // Two refunds of 20.00 each reported against the 24.20 payment: each fits alone, together they do not.
      await first.query(refundOf9201("9202"), [chargeId]);
      // The handler is attached at once, so the rejection is never "unhandled" while COMMIT is awaited.
      const racing = second.query(refundOf9201("9203"), [chargeId])
        .then(() => "INSERTED" as const, (error: unknown) => error);
      await first.query("COMMIT");
      expect(await racing).toMatchObject({ message: "REFUND_EXCEEDS_CHARGE" });
    } finally {
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it("makes a charge attempt, a quote use and a cancel-token use single", async () => {
    const seeded = await seedCharge();
    await expect(database.pool.query(`
      INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end, quote_id,
        net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
      VALUES ($1, $2, $3, 'INITIAL', 1, $5::timestamptz, $5::timestamptz + interval '1 month', $4, 20000000, 4200000, 24200000, 'USD',
        clock_timestamp(), 'stage')
    `, [chargeIdOf(), seeded.ownerRef, seeded.subscriptionId, seeded.quoteId, RECENT])).rejects.toMatchObject({ code: "23505" });
    await database.pool.query("INSERT INTO billing.quote_use (quote_id, used_at, charge_id) VALUES ($1, clock_timestamp(), $2)", [seeded.quoteId, seeded.chargeId]);
    await expect(database.pool.query("INSERT INTO billing.quote_use (quote_id, used_at, charge_id) VALUES ($1, clock_timestamp(), $2)", [seeded.quoteId, seeded.chargeId]))
      .rejects.toMatchObject({ code: "23505" });
  });

  it("an upgrade quote names the recurring total it announces (A7, R-31)", async () => {
    const ownerRef = randomUUID();
    await expect(insertQuote({ quoteId: randomUUID(), ownerRef, kind: "UPGRADE", createdAt: RECENT, recurringTotalMicros: null }))
      .rejects.toMatchObject({ code: "23514" });
    await expect(insertQuote({ quoteId: randomUUID(), ownerRef, kind: "UPGRADE", createdAt: RECENT, recurringTotalMicros: 60_500_001 }))
      .rejects.toMatchObject({ code: "23514" });
    expect((await insertQuote({ quoteId: randomUUID(), ownerRef, kind: "UPGRADE", createdAt: RECENT, recurringTotalMicros: 60_500_000 })).rowCount).toBe(1);
  });
});

describe("P1a — the one sanctioned delete: retention purge (A15, R-13, R-36)", () => {
  it("purges rows ten full calendar years after their year, nothing younger, and returns the count", async () => {
    const old = await seedCharge(`${thisYear - 11}-06-01T10:00:00Z`);
    const young = await seedCharge(`${thisYear - 10}-02-01T10:00:00Z`);
    await chargeEvent(old.chargeId, "SUCCEEDED", "9301", 24_200_000, { at: `${thisYear - 11}-06-01T10:02:00Z` });
    await chargeEvent(young.chargeId, "SUCCEEDED", "9302", 24_200_000, { at: `${thisYear - 10}-02-01T10:02:00Z` });
    // A clock in last December still keeps everything from eleven years ago.
    expect(await purge(`${thisYear - 1}-12-31T23:59:59Z`)).toBe(0);
    // From 1 January the old charge's event, charge, quote and finished subscription go: four rows.
    expect(await purge(`${thisYear}-01-01T00:00:00Z`)).toBe(4);
    expect(await exists("SELECT 1 FROM billing.charge WHERE charge_id = $1", [old.chargeId])).toBe(false);
    expect(await exists("SELECT 1 FROM billing.quote WHERE quote_id = $1", [old.quoteId])).toBe(false);
    expect(await exists("SELECT 1 FROM billing.subscription_event WHERE subscription_id = $1", [old.subscriptionId])).toBe(false);
    expect(await exists("SELECT 1 FROM billing.charge WHERE charge_id = $1", [young.chargeId])).toBe(true);
    expect(await exists("SELECT 1 FROM billing.subscription_event WHERE subscription_id = $1", [young.subscriptionId])).toBe(true);
  });

  it("reaches B5's entitlement events, keeps a living account's latest one, and lets an erased account's go (R-13, A15)", async () => {
    const living = await createBillingTestAccount(database.pool, "purge-living");
    const erased = await createBillingTestAccount(database.pool, "purge-erased");
    expect(await eraseBillingTestAccount(database.pool, erased)).toBe("COMMITTED");
    const other = randomUUID();
    const old = thisYear - 11;
    const [signedUp, subscribed, ended, erasedLast, recent] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await database.pool.query(`
      INSERT INTO billing.entitlement_event (event_id, owner_ref, plan_id, effective_at, period_anchor_at, cause,
        subscription_id, month_credit_override_micros, paid_through)
      VALUES
        ($1, $6, 'FREE', $9::timestamptz, $9::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL),
        ($2, $6, 'PLUS', $10::timestamptz, $10::timestamptz, 'SUBSCRIBED', $13, NULL, $11::timestamptz),
        ($3, $6, 'FREE', $11::timestamptz, $11::timestamptz, 'ENDED_CANCEL', $13, NULL, NULL),
        ($4, $7, 'FREE', $9::timestamptz, $9::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL),
        ($5, $8, 'FREE', $12::timestamptz, $12::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL)
    `, [signedUp, subscribed, ended, erasedLast, recent, living.ownerRef, erased.ownerRef, other,
      `${old}-01-10T10:00:00Z`, `${old}-02-10T10:00:00Z`, `${old}-03-10T10:00:00Z`, `${thisYear - 1}-05-01T10:00:00Z`,
      randomUUID()]);
    // The living account's two older events, and the erased account's last (and only) event: three rows.
    expect(await purge(`${thisYear}-01-01T00:00:00Z`)).toBe(3);
    const kept = (await database.pool.query<{ event_id: string }>(
      "SELECT event_id FROM billing.entitlement_event WHERE event_id = ANY($1::uuid[]) ORDER BY effective_at",
      [[signedUp, subscribed, ended, erasedLast, recent]]
    )).rows.map((row) => row.event_id);
    expect(kept).toEqual([ended, recent]);
  });

  it("keeps a living account's event in force however old — a lone eleven-year-old sign-up, a lapsed paid event — and purges what was superseded", async () => {
    const onlyFree = await createBillingTestAccount(database.pool, "purge-only-free");
    const superseded = await createBillingTestAccount(database.pool, "purge-superseded");
    const lapsed = await createBillingTestAccount(database.pool, "purge-lapsed");
    const old = thisYear - 11;
    const [onlySignup, oldSignup, recentPaid, lapsedPaid, aheadFree] =
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await database.pool.query(`
      INSERT INTO billing.entitlement_event (event_id, owner_ref, plan_id, effective_at, period_anchor_at, cause,
        subscription_id, month_credit_override_micros, paid_through)
      VALUES
        ($1, $6, 'FREE', $9::timestamptz, $9::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL),
        ($2, $7, 'FREE', $10::timestamptz, $10::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL),
        ($3, $7, 'PLUS', $11::timestamptz, $11::timestamptz, 'SUBSCRIBED', $14, NULL, $12::timestamptz),
        ($4, $8, 'PLUS', $9::timestamptz, $9::timestamptz, 'SUBSCRIBED', $15, NULL, $13::timestamptz),
        ($5, $8, 'FREE', $16::timestamptz, $16::timestamptz, 'ENDED_CANCEL', $15, NULL, NULL)
    `, [onlySignup, oldSignup, recentPaid, lapsedPaid, aheadFree, onlyFree.ownerRef, superseded.ownerRef, lapsed.ownerRef,
      `${old}-01-10T10:00:00Z`, `${old - 1}-01-10T10:00:00Z`, `${thisYear - 1}-05-01T10:00:00Z`,
      `${thisYear - 1}-06-01T10:00:00Z`, `${old}-02-10T10:00:00Z`, randomUUID(), randomUUID(),
      `${thisYear + 1}-01-10T10:00:00Z`]);
    // One row goes: the sign-up a later subscription superseded. The lone sign-up is its owner's plan in force; the
    // lapsed paid event is too (its paid_through anchors that owner's Free month), and the Free event written for a
    // date after the purge's clock does not unseat it — a "latest event" rule would have deleted it.
    expect(await purge(`${thisYear}-01-01T00:00:00Z`)).toBe(1);
    const kept = (await database.pool.query<{ event_id: string }>(
      "SELECT event_id FROM billing.entitlement_event WHERE event_id = ANY($1::uuid[])",
      [[onlySignup, oldSignup, recentPaid, lapsedPaid, aheadFree]]
    )).rows.map((row) => row.event_id);
    expect(kept.sort()).toEqual([onlySignup, recentPaid, lapsedPaid, aheadFree].sort());
    // The runner's read (A20) still resolves the lone sign-up: a running debate keeps its person wall.
    const view = await database.pool.query<{ entitlement_event_id: string }>(
      "SELECT entitlement_event_id FROM billing.person_windows_v WHERE owner_ref = $1", [onlyFree.ownerRef]
    );
    expect(view.rows.map((row) => row.entitlement_event_id)).toEqual([onlySignup]);
  });

  it("counts an account the age gate froze as living: its event in force stays (RULINGS-R3 R3-2, migration 0077)", async () => {
    const frozen = await createBillingTestAccount(database.pool, "purge-age-frozen");
    // 0077's interstitial refusal sets exactly this state; the row stays until an erasure deletes it.
    await database.pool.query(`UPDATE identity."user" SET state = 'age_frozen' WHERE user_id = $1`, [frozen.userId]);
    const [superseded, inForce] = [randomUUID(), randomUUID()];
    // B5 allows one SIGNED_UP_FREE per owner, so the later event is the Free month after a cancelled plan.
    await database.pool.query(`
      INSERT INTO billing.entitlement_event (event_id, owner_ref, plan_id, effective_at, period_anchor_at, cause,
        subscription_id, month_credit_override_micros, paid_through)
      VALUES
        ($1, $3, 'FREE', $4::timestamptz, $4::timestamptz, 'SIGNED_UP_FREE', NULL, NULL, NULL),
        ($2, $3, 'FREE', $5::timestamptz, $5::timestamptz, 'ENDED_CANCEL', $6, NULL, NULL)
    `, [superseded, inForce, frozen.ownerRef, `${thisYear - 12}-01-10T10:00:00Z`, `${thisYear - 11}-01-10T10:00:00Z`,
      randomUUID()]);
    // The older event is superseded and goes; the frozen account's event in force (eleven years old) stays.
    expect(await purge(`${thisYear}-01-01T00:00:00Z`)).toBe(1);
    expect(await exists("SELECT 1 FROM billing.entitlement_event WHERE event_id = $1", [inForce])).toBe(true);
    expect(await exists("SELECT 1 FROM billing.entitlement_event WHERE event_id = $1", [superseded])).toBe(false);
  });

  it("never purges ahead of the database clock", async () => {
    const recent = await seedCharge(`${thisYear - 1}-03-01T10:00:00Z`);
    // A clock a lifetime ahead purges exactly what today would: nothing is left that is due today.
    expect(await purge("2200-01-01T00:00:00Z")).toBe(0);
    expect(await exists("SELECT 1 FROM billing.charge WHERE charge_id = $1", [recent.chargeId])).toBe(true);
  });

  it("cannot be imitated: the owner without the setting and the runtime with it are both refused", async () => {
    const { chargeId } = await seedCharge(`${thisYear - 1}-06-01T10:00:00Z`);
    await expect(database.pool.query("DELETE FROM billing.charge_event WHERE charge_id = $1", [chargeId]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(asRuntime(async (client) => {
      await client.query("SET LOCAL debateai.retention_purge = 'on'");
      await client.query("DELETE FROM billing.charge_event WHERE charge_id = $1", [chargeId]);
    })).rejects.toMatchObject({ code: "42501" });
    // R-36: the yearly job's principal may call the function itself.
    const purged = await asRuntime((client) => client.query<{ purged: string }>(
      "SELECT billing.purge_expired_records(clock_timestamp()) AS purged"
    ));
    expect(Number(purged.rows[0]!.purged)).toBe(0);
  });
});

/**
 * Part 1b's final review, deferred minor 12 (B3), binding controller note B11d: core.run_waiting_v casts
 * substr(asker_id, 7)::uuid for an 'owner:' asker with no ownership event and (depth_params->>'depth')::integer,
 * so ONE waiting row whose run carries a malformed value would make every read of the line fail. 0085 refuses
 * such a row where it enters the line (0083 is applied and never edited).
 */
describe("P1a — the waiting line refuses a row its reader could not read (B11d, B3 minor 12)", () => {
  async function legacyRun(): Promise<string> {
    return new RunRepository(database.pool).startRun({
      questionLine: "Does one bad waiting row take the whole line down?",
      principal: { kind: "legacy", legacyAskerId: `wait-guard:${randomUUID()}` },
      sessionId: randomUUID(),
      callerScope: "ASKER",
      asOf: new Date(),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker:test",
      compositionBudgetTier: "low",
      planTier: "free",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(2),
      strangerSampleRate: 0,
      envelopeBasis: fixtureStructuralCeiling(4),
      registerVersion: 1,
      batteryVersion: "test",
      askContract: {},
      batteryRows: []
    });
  }

  /** A copy of a proven run row with one column replaced: no program writer can produce these values. */
  async function runLike(sourceRunId: string, changed: Readonly<Record<string, unknown>>): Promise<string> {
    const runId = randomUUID();
    await database.pool.query(`
      INSERT INTO core.run
      SELECT (pg_catalog.jsonb_populate_record(NULL::core.run,
        pg_catalog.to_jsonb(source)
          || jsonb_build_object('run_id', $2::uuid, 'created_at_seq', ledger.allocate_sequence())
          || $3::jsonb)).*
      FROM core.run AS source WHERE source.run_id = $1
    `, [sourceRunId, runId, JSON.stringify(changed)]);
    return runId;
  }

  const enterLine = (runId: string) => database.pool.query(
    "INSERT INTO core.run_wait (run_id, waiting_since) VALUES ($1, clock_timestamp())", [runId]
  );
  const unreadable = { code: "23514", message: "RUN_WAIT_ROW_UNREADABLE" } as const;

  it("refuses an 'owner:' asker that is not a uuid and a depth that is not a whole number, and keeps the line readable", async () => {
    const good = await legacyRun();
    expect((await enterLine(good)).rowCount).toBe(1);
    for (const changed of [
      // 0040's barrier lets an unencrypted run through with any 'owner:' asker its pattern does not match.
      { asker_id: "owner:not-a-uuid" },
      { asker_id: `owner:${randomUUID().toUpperCase()}x` },
      { depth_params: { depth: 2.5 } },
      { depth_params: { depth: "deep" } },
      { depth_params: { depth: 99_999_999_999 } }
    ]) {
      const bad = await runLike(good, changed);
      await expect(enterLine(bad), JSON.stringify(changed)).rejects.toMatchObject(unreadable);
    }
    // The API and the waker write the line as debateai_runtime: the guard's read of the run works under that role.
    const asWriter = await legacyRun();
    await asRuntime((client) => client.query(
      "INSERT INTO core.run_wait (run_id, waiting_since) VALUES ($1, clock_timestamp())", [asWriter]
    ));
    // A legacy run with no depth reads as depth 1 (the view's COALESCE), so it may still wait.
    expect((await enterLine(await runLike(good, { depth_params: {} }))).rowCount).toBe(1);
    const line = await database.pool.query<{ run_id: string; depth: number }>(
      "SELECT run_id, depth FROM core.run_waiting_v WHERE run_id = $1", [good]
    );
    expect(line.rows).toEqual([{ run_id: good, depth: 1 }]);
  });
});
