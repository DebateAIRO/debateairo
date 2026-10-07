import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Spec 2026-10-05 §2.5 and review finding SR-16: 0096 applies on a database that already holds xMoney-era rows (the
 * dev-stack fakes leave them), keeps them as inert history, can run twice, and repeats 0093's grant contract.
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const NETOPIA_MIGRATION = "0096_billing_netopia.sql";
const KEY_ID = "0123456789abcdef";
const SEALED = Buffer.from([1, 2, 3, 4]);
const thisYear = new Date().getUTCFullYear();
const RECENT = `${thisYear}-01-15T10:00:00Z`;
const OLD = `${thisYear - 11}-06-01T10:00:00Z`;
const chargeIdOf = (): string => randomUUID().replaceAll("-", "");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const toolOrderOf = (): string => `t-${chargeIdOf().slice(0, 30)}`;
const NEW_TABLES = [
  "billing.payment_notice", "billing.payment_notice_raw", "billing.notice_quarantine", "billing.payment_notice_outcome",
  "billing.card_token", "billing.card_token_revocation", "billing.hosted_payment", "billing.status_read",
  "billing.tool_order"
] as const;
const refused = { code: "23514", message: "REFUND_EXCEEDS_CHARGE" } as const;

let database: TestDatabase;
const legacy = {
  ownerRef: randomUUID(), subscriptionId: randomUUID(), chargeId: chargeIdOf(), jobId: randomUUID()
} as const;
const query = (sql: string, values: unknown[] = []) => database.pool.query(sql, values);

/** Every migration before 0096, recorded as `migrate` records it, so `migrate` then applies 0096 alone. */
async function applyMigrationsBefore(name: string): Promise<void> {
  const files = (await readdir(MIGRATIONS)).filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
      name text PRIMARY KEY CHECK (length(btrim(name)) > 0), applied_at timestamptz NOT NULL)`);
    for (const file of files.filter((candidate) => candidate < name)) {
      await client.query(await readFile(new URL(file, MIGRATIONS), "utf8"));
      await client.query("INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())", [file]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** What a 0095 database holds after a dev-stack xMoney plan, a card-check payment and a refund request. */
async function seedXMoneyEraRows(): Promise<void> {
  await query(`INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
    VALUES ($1, $2, $3, 'CREATED', $4, 'PLUS', jsonb_build_object('xmoney_environment', 'stage'))`,
  [randomUUID(), legacy.subscriptionId, legacy.ownerRef, RECENT]);
  await query(`INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id,
      period_anchor_at, xmoney_order_id, card_ref, data)
    VALUES ($1, $2, $3, 'ACTIVATED', $4, 'PLUS', $4, '4711', '77', jsonb_build_object('announced_total_micros', 24200000))`,
  [randomUUID(), legacy.subscriptionId, legacy.ownerRef, RECENT]);
  await query(`INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end,
      quote_id, net_micros, tax_micros, total_micros, currency, created_at, xmoney_environment)
    VALUES ($1, $2, $3, 'CARD_CHECK', 1, $4::timestamptz, $4::timestamptz + interval '1 day', NULL, 24200000, 0,
      24200000, 'USD', $4, 'stage')`, [legacy.chargeId, legacy.ownerRef, legacy.subscriptionId, RECENT]);
  for (const [kind, transactionId, amount, code, createdAt] of [
    ["REQUESTED", null, 24_200_000, null, null], ["SUCCEEDED", "7001", 24_200_000, null, RECENT],
    ["REFUND_REQUESTED", "7001", 1_000_000, "WITHDRAWAL", null]
  ] as const) {
    await query(`INSERT INTO billing.charge_event (charge_id, kind, at, xmoney_transaction_id, amount_micros, error_code,
      xmoney_environment, xmoney_created_at) VALUES ($1, $2, clock_timestamp(), $3, $4, $5, 'stage', $6)`,
    [legacy.chargeId, kind, transactionId, amount, code, createdAt]);
  }
  await query(`INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
    VALUES ($1, 'XMONEY_REFUND', $2, '{}'::jsonb, clock_timestamp(), clock_timestamp())`, [legacy.jobId, `${legacy.chargeId}:7001`]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await applyMigrationsBefore(NETOPIA_MIGRATION);
  await seedXMoneyEraRows();
  await migrate(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

/** A card-check charge (it needs no quote), the smallest charge row of any provider. */
async function charge(provider: string, environment: string, totalMicros = 24_200_000, createdAt = RECENT): Promise<string> {
  const chargeId = chargeIdOf();
  await query(`INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end,
      quote_id, net_micros, tax_micros, total_micros, currency, created_at, payment_provider, payment_environment)
    VALUES ($1, $2, $3, 'CARD_CHECK', 1, $4::timestamptz, $4::timestamptz + interval '1 day', NULL, $5, 0, $5, 'USD', $4, $6, $7)`,
  [chargeId, randomUUID(), randomUUID(), createdAt, totalMicros, provider, environment]);
  return chargeId;
}

function chargeEvent(chargeId: string, kind: string, paymentId: string | null, amountMicros: number | null,
  options: Readonly<{ provider?: string; environment?: string; refunds?: string; providerCreatedAt?: string }> = {}) {
  return query(`INSERT INTO billing.charge_event (charge_id, kind, at, provider_payment_id, amount_micros,
      refunds_transaction_id, payment_provider, payment_environment, provider_created_at)
    VALUES ($1, $2, clock_timestamp(), $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING event_id`,
  [chargeId, kind, paymentId, amountMicros, options.refunds ?? null, options.provider ?? "netopia",
    options.environment ?? "sandbox", options.providerCreatedAt ?? null]);
}
const xmoney = { provider: "xmoney", environment: "stage" } as const;

async function asRole<T>(role: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
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
const purgeAs = (role: string, fn: string, at: string) => asRole(role, async (client) =>
  Number((await client.query<{ purged: string }>(`SELECT billing.${fn}($1::timestamptz) AS purged`, [at])).rows[0]!.purged));

async function paymentNotice(receivedAt = "clock_timestamp()", orderId: string | null = chargeIdOf()): Promise<string> {
  const noticeId = randomUUID();
  await query(`INSERT INTO billing.payment_notice (notice_id, payment_provider, payment_environment, received_at,
      body_sha256, order_id, provider_payment_id, provider_status, amount_text, currency, card_country, key_fingerprint,
      jwt_iat, allowed_ciphertext, key_id)
    VALUES ($1, 'netopia', 'sandbox', ${receivedAt}, $2, $3, '1234567', 3, '24.2', 'USD', 'RO', $4, '1759744800', $5, $6)`,
  [noticeId, sha256(noticeId), orderId, sha256(`key-${noticeId}`), SEALED, KEY_ID]);
  return noticeId;
}

async function cardToken(input: Readonly<{ sourceChargeId?: string | null; toolOrder?: string | null; customerId?: string | null;
  column?: string; value?: string | number }> = {}): Promise<string> {
  const tokenId = randomUUID();
  const extra = input.column === undefined ? "" : `, ${input.column}`;
  await query(`INSERT INTO billing.card_token (token_id, customer_id, payment_provider, payment_environment,
      source_charge_id, source_tool_order, source_paid_at, token_ciphertext, key_id, created_at${extra})
    VALUES ($1, $2, 'netopia', 'sandbox', $3, $4, clock_timestamp(), $5, $6, clock_timestamp()${input.column === undefined ? "" : ", $7"})`,
  [tokenId, input.customerId === undefined ? randomUUID() : input.customerId,
    input.sourceChargeId === undefined ? chargeIdOf() : input.sourceChargeId, input.toolOrder ?? null, SEALED, KEY_ID,
    ...(input.column === undefined ? [] : [input.value])]);
  return tokenId;
}

describe("N6 — 0096 over an xMoney-era database (spec §2.5, §2.5.4)", () => {
  it("keeps the xMoney-era rows as inert history: marked xmoney, renamed columns, the same values", async () => {
    expect((await query("SELECT payment_provider, payment_environment FROM billing.charge WHERE charge_id = $1", [legacy.chargeId])).rows)
      .toEqual([{ payment_provider: "xmoney", payment_environment: "stage" }]);
    const events = (await query(`SELECT kind, payment_provider, payment_environment, provider_payment_id, provider_created_at
      FROM billing.charge_event WHERE charge_id = $1 ORDER BY seq`, [legacy.chargeId])).rows;
    expect(events.map((event) => [event.kind, event.payment_provider, event.payment_environment, event.provider_payment_id]))
      .toEqual([["REQUESTED", "xmoney", "stage", null], ["SUCCEEDED", "xmoney", "stage", "7001"],
        ["REFUND_REQUESTED", "xmoney", "stage", "7001"]]);
    expect((events[1]!.provider_created_at as Date).toISOString()).toBe(new Date(RECENT).toISOString());
    expect((await query("SELECT kind FROM billing.outbox WHERE job_id = $1", [legacy.jobId])).rows).toEqual([{ kind: "XMONEY_REFUND" }]);
    expect((await query("SELECT kind, card_token_id FROM billing.subscription_event WHERE subscription_id = $1 ORDER BY seq",
      [legacy.subscriptionId])).rows).toEqual([{ kind: "CREATED", card_token_id: null }, { kind: "ACTIVATED", card_token_id: null }]);
  });
  it("makes every new charge and charge event name its provider: no default, no old column (SR-16 (a))", async () => {
    // 0096's own verify block also refuses a default or a NULL left on either column.
    expect((await query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'billing'
      AND table_name IN ('charge', 'charge_event') AND column_name LIKE 'xmoney%'`)).rows).toEqual([]);
    await expect(query(`INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start,
        period_end, quote_id, net_micros, tax_micros, total_micros, currency, created_at, payment_environment)
      VALUES ($1, $2, $3, 'CARD_CHECK', 1, clock_timestamp(), clock_timestamp() + interval '1 day', NULL, 0, 0, 0, 'USD',
        clock_timestamp(), 'sandbox')`, [chargeIdOf(), randomUUID(), randomUUID()])).rejects.toMatchObject({ code: "23502" });
  });
  it("pairs each provider with its own environments, and an event with its own charge's (three-column key)", async () => {
    const netopia = await charge("netopia", "sandbox");
    await charge("netopia", "live");
    await charge("xmoney", "stage");
    for (const [provider, environment] of [["netopia", "stage"], ["xmoney", "sandbox"], ["stripe", "live"]] as const) {
      await expect(charge(provider, environment), `${provider}/${environment}`)
        .rejects.toMatchObject({ code: "23514", constraint: "charge_payment_system_check" });
    }
    await expect(chargeEvent(netopia, "REQUESTED", null, null, { environment: "live" })).rejects.toMatchObject({ code: "23503" });
    await expect(chargeEvent(netopia, "REQUESTED", null, null, xmoney)).rejects.toMatchObject({ code: "23503" });
    expect((await chargeEvent(netopia, "REQUESTED", null, null)).rowCount).toBe(1);
  });
  it("takes NETOPIA's payment ids, keeps xMoney's digits-only, and keeps the payment's own time on the payment only", async () => {
    const netopia = await charge("netopia", "sandbox");
    expect((await chargeEvent(netopia, "SUCCEEDED", "ntp.1001-A:b_2", 24_200_000, { providerCreatedAt: RECENT })).rowCount).toBe(1);
    for (const id of ["has space", "x".repeat(65)]) {
      await expect(chargeEvent(netopia, "SUBMITTED", id, null)).rejects.toMatchObject({ code: "23514", constraint: "charge_event_provider_payment_id_shape" });
    }
    // The refund-sum trigger lets this through (it names the paid payment); the CHECK then refuses a separate target.
    await expect(chargeEvent(netopia, "REFUNDED", "ntp.1002", 1_000_000, { refunds: "ntp.1001-A:b_2" }))
      .rejects.toMatchObject({ code: "23514", constraint: "charge_event_refund_target_shape" });
    // NETOPIA reports a refund as a status of the payment itself, so its REFUNDED carries no time of its own.
    await expect(chargeEvent(netopia, "REFUNDED", "ntp.1001-A:b_2", 1_000_000, { providerCreatedAt: RECENT }))
      .rejects.toMatchObject({ code: "23514", constraint: "charge_event_provider_time_names_payment" });
    const old = await charge("xmoney", "stage");
    await expect(chargeEvent(old, "SUCCEEDED", "ntp.1003", 24_200_000, xmoney))
      .rejects.toMatchObject({ code: "23514", constraint: "charge_event_provider_payment_id_shape" });
    expect((await chargeEvent(old, "SUCCEEDED", "1003", 24_200_000, xmoney)).rowCount).toBe(1);
  });
  it("re-keys the unique keys on the provider: one payment per id per system, the same number in two systems", async () => {
    const [first, second, live, old] = [await charge("netopia", "sandbox"), await charge("netopia", "sandbox"),
      await charge("netopia", "live"), await charge("xmoney", "stage")];
    expect((await chargeEvent(first, "SUCCEEDED", "2001", 24_200_000)).rowCount).toBe(1);
    expect((await chargeEvent(first, "SUCCEEDED", "2001", 24_200_000)).rowCount).toBe(0);
    expect((await chargeEvent(second, "SUCCEEDED", "2001", 24_200_000)).rowCount).toBe(0);
    expect((await chargeEvent(second, "DUPLICATE_PAYMENT", "2001", 24_200_000)).rowCount).toBe(0);
    expect((await chargeEvent(live, "SUCCEEDED", "2001", 24_200_000, { environment: "live" })).rowCount).toBe(1);
    expect((await chargeEvent(old, "SUCCEEDED", "2001", 24_200_000, xmoney)).rowCount).toBe(1);
    expect((await query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'billing' AND tablename = 'charge_event'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%' ORDER BY indexname`)).rows.map((row) => row.indexname)).toEqual([
      "charge_event_charge_payment_kind_unique", "charge_event_one_payment_per_provider_payment", "charge_event_one_success",
      "charge_event_payment_kind_unique", "charge_event_pkey", "charge_event_seq_key"
    ]);
  });
  it("keeps the refund-sum guard on both providers' rows (the replaced trigger function)", async () => {
    const netopia = await charge("netopia", "sandbox");
    await expect(chargeEvent(netopia, "REFUND_REQUESTED", "3001", 1_000_000)).rejects.toMatchObject(refused);
    await chargeEvent(netopia, "SUCCEEDED", "3001", 24_200_000);
    expect((await chargeEvent(netopia, "REFUND_REQUESTED", "3001", 24_200_000)).rowCount).toBe(1);
    // NETOPIA's REFUNDED status confirms our request on the payment itself: counted once, not twice.
    expect((await chargeEvent(netopia, "REFUNDED", "3001", 24_200_000)).rowCount).toBe(1);
    const over = await charge("netopia", "sandbox");
    await chargeEvent(over, "SUCCEEDED", "3002", 24_200_000);
    await expect(chargeEvent(over, "REFUND_REQUESTED", "3002", 24_210_000)).rejects.toMatchObject(refused);
    // The xMoney-era charge took 24.20 on 7001 and holds a 1.00 request: 23.30 more reported on it is refused.
    expect((await chargeEvent(legacy.chargeId, "REFUNDED", "7001", 1_000_000, xmoney)).rowCount).toBe(1);
    await expect(chargeEvent(legacy.chargeId, "REFUNDED", "7002", 23_300_000, { ...xmoney, refunds: "7001" })).rejects.toMatchObject(refused);
  });
  it("records a NETOPIA refund in parts, each part under the sum guard (ruling PR-20, spec §2.12.2 item 4)", async () => {
    const parts = await charge("netopia", "sandbox");
    await chargeEvent(parts, "SUCCEEDED", "3101", 24_200_000);
    expect((await chargeEvent(parts, "REFUND_REQUESTED", "3101", 10_000_000)).rowCount).toBe(1);
    // Two REFUNDED parts on the same NETOPIA payment are two rows, not a duplicate.
    expect((await chargeEvent(parts, "REFUNDED", "3101", 4_000_000)).rowCount).toBe(1);
    expect((await chargeEvent(parts, "REFUNDED", "3101", 6_000_000)).rowCount).toBe(1);
    // A part that would take the refunded sum past what the payment paid is refused; up to the payment is accepted.
    await expect(chargeEvent(parts, "REFUNDED", "3101", 14_200_001)).rejects.toMatchObject(refused);
    expect((await chargeEvent(parts, "REFUNDED", "3101", 14_200_000)).rowCount).toBe(1);
    // xMoney-era rows keep one REFUNDED per (system, transaction, kind).
    const old = await charge("xmoney", "stage");
    await chargeEvent(old, "SUCCEEDED", "3102", 24_200_000, xmoney);
    expect((await chargeEvent(old, "REFUNDED", "3102", 1_000_000, xmoney)).rowCount).toBe(1);
    expect((await chargeEvent(old, "REFUNDED", "3102", 1_000_000, xmoney)).rowCount).toBe(0);
  });
  it("subscription events: a card on the adopting kinds, CARD_SAVED, an anchor for ACTIVATED, either system for CREATED", async () => {
    const insert = (kind: string, data: object, extra: Readonly<{ anchor?: string; token?: string; order?: string }> = {}) =>
      query(`INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id,
          period_anchor_at, xmoney_order_id, card_token_id, data)
        VALUES ($1, $2, $3, $4, clock_timestamp(), 'PLUS', $5, $6, $7, $8::jsonb)`,
      [randomUUID(), randomUUID(), randomUUID(), kind, extra.anchor ?? null, extra.order ?? null, extra.token ?? null, JSON.stringify(data)]);
    for (const data of [{ payment_provider: "netopia", payment_environment: "sandbox" },
      { payment_provider: "netopia", payment_environment: "live" }, { xmoney_environment: "live" }]) {
      expect((await insert("CREATED", data)).rowCount, JSON.stringify(data)).toBe(1);
    }
    for (const data of [{}, { payment_provider: "netopia", payment_environment: "stage" }, { payment_provider: "netopia" },
      { xmoney_environment: "sandbox" }]) {
      await expect(insert("CREATED", data), JSON.stringify(data)).rejects.toMatchObject({ code: "23514" });
    }
    // An ACTIVATED needs its anchor, nothing provider-specific (SR-16 (b)).
    expect((await insert("ACTIVATED", {}, { anchor: RECENT })).rowCount).toBe(1);
    await expect(insert("ACTIVATED", {}, { order: "4711" })).rejects.toMatchObject({ constraint: "subscription_event_activation_names_anchor" });
    for (const kind of ["ACTIVATED", "RENEWED", "UPGRADED", "CARD_CHANGED", "CARD_SAVED"]) {
      expect((await insert(kind, {}, { anchor: RECENT, token: randomUUID() })).rowCount, kind).toBe(1);
    }
    await expect(insert("CARD_SAVED", {})).rejects.toMatchObject({ constraint: "subscription_event_card_saved_names_token" });
    await expect(insert("PAST_DUE", {}, { token: randomUUID() })).rejects.toMatchObject({ constraint: "subscription_event_card_token_kinds" });
    await expect(insert("PAUSED", {})).rejects.toMatchObject({ constraint: "subscription_event_kind_known" });
  });
  it("queues PAYMENT_REFUND jobs and records the card-saving agreement on the upgrade and card pages", async () => {
    await asRole("debateai_billing_runtime", (client) => client.query(`INSERT INTO billing.outbox (job_id, kind, ref, payload,
      created_at, not_before) VALUES ($1, 'PAYMENT_REFUND', $2, '{}'::jsonb, clock_timestamp(), clock_timestamp())`,
    [randomUUID(), `refund:${chargeIdOf()}`]));
    await expect(query(`INSERT INTO billing.outbox (job_id, kind, ref, payload, created_at, not_before)
      VALUES ($1, 'CANCEL_ORDER', 'x', '{}'::jsonb, clock_timestamp(), clock_timestamp())`, [randomUUID()]))
      .rejects.toMatchObject({ constraint: "outbox_kind_known" });
    const accept = (surface: string) => query(`INSERT INTO legal.acceptance (acceptance_id, owner_ref, kind, document_version,
        document_sha256, locale, surface, accepted_at, evidence_ciphertext, key_id)
      VALUES ($1, $2, 'TERMS', '1.0', $3, 'en', $4, clock_timestamp(), $5, $6)`,
    [randomUUID(), randomUUID(), sha256(surface), surface, Buffer.alloc(40, 1), KEY_ID]);
    for (const surface of ["SIGN_UP", "CHECKOUT", "REACCEPT", "UPGRADE", "CARD_CHANGE"]) {
      expect((await accept(surface)).rowCount, surface).toBe(1);
    }
    await expect(accept("RENEWAL")).rejects.toMatchObject({ constraint: "acceptance_surface_known" });
  });
  it("leaves no billing function or view naming a renamed column, and none of the replaced constraints", async () => {
    expect((await query(`SELECT proname FROM pg_catalog.pg_proc WHERE pronamespace = 'billing'::regnamespace
      AND prosrc ~ 'xmoney_(environment|transaction_id|created_at)'`)).rows).toEqual([]);
    expect((await query(`SELECT viewname FROM pg_catalog.pg_views WHERE schemaname = 'billing'
      AND definition ~ 'xmoney_(environment|transaction_id|created_at)'`)).rows).toEqual([]);
    // subscription_event keeps its xmoney_order_id / xmoney_customer_id / card_ref CHECKs for old rows.
    expect((await query(`SELECT conname FROM pg_catalog.pg_constraint
      WHERE (conrelid IN ('billing.charge'::regclass, 'billing.charge_event'::regclass)
          AND conname ~ '(xmoney|environment_key|same_environment)')
        OR conname IN ('subscription_event_activation_names_order', 'subscription_event_created_names_environment',
          'subscription_event_kind_check', 'outbox_kind_check', 'acceptance_surface_check')`)).rows).toEqual([]);
  });
});

describe("N6 — the new tables (spec §2.5.2, §2.5.6)", () => {
  it("guards every new table (append-only, TRUNCATE refused, for the owner too) and grants it to the billing role only", async () => {
    const guards = new Map((await query(`SELECT trigger.tgrelid::regclass::text AS relation,
        array_agg(trigger.tgname::text ORDER BY trigger.tgname) AS guards
      FROM pg_catalog.pg_trigger AS trigger
      WHERE NOT trigger.tgisinternal AND trigger.tgenabled IN ('O','A')
        AND trigger.tgfoid = ANY(ARRAY['core.reject_truncate()'::regprocedure,
          'billing.reject_mutation_unless_retention_purge()'::regprocedure])
        AND trigger.tgrelid::regclass::text = ANY($1::text[])
      GROUP BY trigger.tgrelid`, [[...NEW_TABLES]])).rows.map((row) => [row.relation, row.guards]));
    const privileges = (await query(`SELECT relation,
        has_table_privilege('debateai_billing_runtime', relation, 'SELECT') AND has_table_privilege('debateai_billing_runtime', relation, 'INSERT') AS writes,
        has_table_privilege('debateai_billing_runtime', relation, 'UPDATE,DELETE') AS changes,
        has_table_privilege('debateai_runtime', relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS shared
      FROM unnest($1::text[]) AS relation`, [[...NEW_TABLES]])).rows;
    for (const relation of NEW_TABLES) {
      expect(guards.get(relation), relation).toEqual(["reject_mutation", "reject_truncate"]);
      expect(privileges.find((row) => row.relation === relation), relation).toMatchObject({ writes: true, changes: false, shared: false });
    }
    const tokenId = await cardToken();
    await expect(query("UPDATE billing.card_token SET last4 = '2222' WHERE token_id = $1", [tokenId])).rejects.toMatchObject({ code: "55000" });
    await expect(query("DELETE FROM billing.card_token WHERE token_id = $1", [tokenId])).rejects.toMatchObject({ code: "55000" });
    await expect(query("TRUNCATE billing.payment_notice CASCADE")).rejects.toMatchObject({ code: "55000" });
    await expect(asRole("debateai_runtime", (client) => client.query("SELECT 1 FROM billing.card_token"))).rejects.toMatchObject({ code: "42501" });
  });
  it("holds each table's shape: hashes, ids, card fields, one source per token, reasons, purposes, the charge's system", async () => {
    const noticeId = await paymentNotice();
    const insertBare = (bodySha256: string, environment: string) => query(`INSERT INTO billing.payment_notice (notice_id,
        payment_provider, payment_environment, received_at, body_sha256, key_fingerprint, allowed_ciphertext, key_id)
      VALUES ($1, 'netopia', $2, clock_timestamp(), $3, $4, $5, $6)`, [randomUUID(), environment, bodySha256, sha256("k"), SEALED, KEY_ID]);
    await expect(insertBare(sha256(noticeId), "sandbox")).rejects.toMatchObject({ code: "23505" });
    // Every content column may be empty: a verified message is stored whatever it holds (§2.5.2).
    expect((await insertBare(sha256(randomUUID()), "live")).rowCount).toBe(1);
    await expect(paymentNotice("clock_timestamp()", "has space")).rejects.toMatchObject({ code: "23514" });
    const toolOrder = (orderId: string, purpose: string) => query(`INSERT INTO billing.tool_order (order_id,
      payment_environment, created_at, purpose) VALUES ($1, 'sandbox', clock_timestamp(), $2)`, [orderId, purpose]);
    await expect(toolOrder(chargeIdOf(), "SANDBOX_RECORDING")).rejects.toMatchObject({ code: "23514" });
    await expect(toolOrder(toolOrderOf(), "DEMO")).rejects.toMatchObject({ code: "23514" });
    expect(await cardToken({ sourceChargeId: null, toolOrder: toolOrderOf(), customerId: null })).toMatch(/-/u);
    await expect(cardToken({ sourceChargeId: null })).rejects.toMatchObject({ constraint: "card_token_one_source" });
    await expect(cardToken({ customerId: null })).rejects.toMatchObject({ constraint: "card_token_customer_unless_tool_order" });
    for (const [column, value] of [["exp_month", 13], ["exp_year", 1999], ["last4", "12a4"], ["card_country", "ro"]] as const) {
      await expect(cardToken({ column, value }), column).rejects.toMatchObject({ code: "23514" });
    }
    await expect(query(`INSERT INTO billing.notice_quarantine (quarantine_id, received_at, reason, raw_ciphertext, key_id)
      VALUES ($1, clock_timestamp(), 'NOTICE_TOO_LATE', $2, $3)`, [randomUUID(), SEALED, KEY_ID])).rejects.toMatchObject({ code: "23514" });
    await expect(query("INSERT INTO billing.card_token_revocation (token_id, at, reason) VALUES ($1, clock_timestamp(), 'BORED')",
      [randomUUID()])).rejects.toMatchObject({ code: "23514" });
    // A hosted payment and a status read belong to a charge of NETOPIA's own system.
    const chargeId = await charge("netopia", "sandbox");
    const hosted = (environment: string) => query(`INSERT INTO billing.hosted_payment (charge_id, payment_provider,
      payment_environment, provider_payment_id, redirect_ciphertext, key_id, started_at)
      VALUES ($1, 'netopia', $2, '1234567', $3, $4, clock_timestamp())`, [chargeId, environment, SEALED, KEY_ID]);
    await expect(hosted("live")).rejects.toMatchObject({ code: "23503" });
    expect((await hosted("sandbox")).rowCount).toBe(1);
    await expect(query("INSERT INTO billing.status_read (charge_id, at, outcome) VALUES ($1, clock_timestamp(), 'paid')", [chargeId]))
      .rejects.toMatchObject({ code: "23514" });
    await expect(query("INSERT INTO billing.status_read (charge_id, at, outcome) VALUES ($1, clock_timestamp(), 'PAID')", [chargeIdOf()]))
      .rejects.toMatchObject({ code: "23503" });
  });
});

describe("N6 — the sanctioned deletes (A15, spec §2.5.2, §2.15.4)", () => {
  it("purge_short_lived deletes raw messages and the quarantine after 14 days, never ahead of the database clock", async () => {
    const [old, young] = [await paymentNotice("clock_timestamp() - interval '20 days'"), await paymentNotice("clock_timestamp() - interval '13 days'")];
    for (const [noticeId, age] of [[old, "15 days"], [young, "13 days"]] as const) {
      await query(`INSERT INTO billing.payment_notice_raw (notice_id, raw_ciphertext, key_id, stored_at)
        VALUES ($1, $2, $3, clock_timestamp() - interval '${age}')`, [noticeId, SEALED, KEY_ID]);
      await query(`INSERT INTO billing.notice_quarantine (quarantine_id, received_at, reason, raw_ciphertext, header_ciphertext, key_id)
        VALUES ($1, clock_timestamp() - interval '${age}', 'NOTICE_SIGNATURE_INVALID', $2, $2, $3)`, [randomUUID(), SEALED, KEY_ID]);
    }
    expect(await purgeAs("debateai_billing_runtime", "purge_short_lived", "2200-01-01T00:00:00Z")).toBe(2);
    expect(await purgeAs("debateai_billing_runtime", "purge_short_lived", new Date().toISOString())).toBe(0);
    expect((await query("SELECT 1 FROM billing.payment_notice_raw WHERE notice_id = $1", [young])).rowCount).toBe(1);
    // The message itself is kept ten years: only its raw bytes go.
    expect((await query("SELECT 1 FROM billing.payment_notice WHERE notice_id = $1", [old])).rowCount).toBe(1);
    await expect(query("SELECT billing.purge_short_lived(NULL)")).rejects.toMatchObject({ code: "22004" });
    await expect(purgeAs("debateai_runtime", "purge_short_lived", RECENT)).rejects.toMatchObject({ code: "42501" });
  });
  it("purge_revoked_card_tokens deletes a token a day after its revocation and keeps the revocation", async () => {
    const [revokedLongAgo, revokedNow, live] = [await cardToken(), await cardToken(), await cardToken()];
    await query(`INSERT INTO billing.card_token_revocation (token_id, at, reason) VALUES
      ($1, clock_timestamp() - interval '2 days', 'PLAN_ENDED'), ($2, clock_timestamp() - interval '1 hour', 'REPLACED')`,
    [revokedLongAgo, revokedNow]);
    expect(await purgeAs("debateai_billing_runtime", "purge_revoked_card_tokens", new Date().toISOString())).toBe(1);
    expect((await query("SELECT token_id FROM billing.card_token WHERE token_id = ANY($1::uuid[]) ORDER BY token_id",
      [[revokedLongAgo, revokedNow, live]])).rows.map((row) => row.token_id)).toEqual([revokedNow, live].sort());
    expect((await query("SELECT reason FROM billing.card_token_revocation WHERE token_id = $1", [revokedLongAgo])).rows)
      .toEqual([{ reason: "PLAN_ENDED" }]);
    await expect(purgeAs("debateai_runtime", "purge_revoked_card_tokens", RECENT)).rejects.toMatchObject({ code: "42501" });
  });
  it("the ten-year purge reaches every new table, children before parents", async () => {
    const chargeId = await charge("netopia", "sandbox", 0, OLD);
    await chargeEvent(chargeId, "REQUESTED", null, null);
    await query(`INSERT INTO billing.hosted_payment (charge_id, payment_provider, payment_environment, provider_payment_id,
      redirect_ciphertext, key_id, started_at) VALUES ($1, 'netopia', 'sandbox', '99', $2, $3, $4)`, [chargeId, SEALED, KEY_ID, OLD]);
    await query("INSERT INTO billing.status_read (charge_id, at, outcome) VALUES ($1, $2, 'PENDING')", [chargeId, OLD]);
    const noticeId = await paymentNotice(`'${OLD}'::timestamptz`);
    await query("INSERT INTO billing.payment_notice_raw (notice_id, raw_ciphertext, key_id, stored_at) VALUES ($1, $2, $3, $4)", [noticeId, SEALED, KEY_ID, OLD]);
    await query("INSERT INTO billing.payment_notice_outcome (notice_id, at, outcome) VALUES ($1, $2, 'APPLIED')", [noticeId, OLD]);
    await query("INSERT INTO billing.tool_order (order_id, payment_environment, created_at, purpose) VALUES ($1, 'sandbox', $2, 'SANDBOX_RECORDING')", [toolOrderOf(), OLD]);
    await query("INSERT INTO billing.card_token_revocation (token_id, at, reason) VALUES ($1, $2, 'NOT_ADOPTED')", [randomUUID(), OLD]);
    // charge_event, hosted_payment, status_read, charge, payment_notice_outcome, payment_notice_raw, payment_notice,
    // tool_order, card_token_revocation: nine rows, nothing younger.
    expect(await purgeAs("debateai_billing_runtime", "purge_expired_records", `${thisYear}-01-01T00:00:00Z`)).toBe(9);
    expect((await query("SELECT 1 FROM billing.charge WHERE charge_id = ANY($1::text[])", [[chargeId, legacy.chargeId]])).rowCount).toBe(1);
    expect((await query("SELECT 1 FROM billing.payment_notice WHERE notice_id = $1", [noticeId])).rowCount).toBe(0);
  });
});

describe("N6 — 0096 runs twice and repeats 0093's contract (spec §2.2 rule 3, SR-16 (c), (d))", () => {
  const catalogue = async (): Promise<string[]> => (await query(`
    SELECT 'c:' || conrelid::regclass::text || ':' || conname || ':' || pg_catalog.pg_get_constraintdef(oid) AS item
      FROM pg_catalog.pg_constraint WHERE connamespace = 'billing'::regnamespace OR conrelid = 'legal.acceptance'::regclass
    UNION ALL SELECT 'i:' || indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'billing'
    UNION ALL SELECT 't:' || tgrelid::regclass::text || ':' || tgname FROM pg_catalog.pg_trigger
      WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'billing.%'
    UNION ALL SELECT 'f:' || oid::regprocedure::text || ':' || md5(prosrc) FROM pg_catalog.pg_proc WHERE pronamespace = 'billing'::regnamespace
    UNION ALL SELECT 'g:' || table_name || ':' || grantee || ':' || privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'billing'
    ORDER BY 1`)).rows.map((row) => row.item as string);
  const inTransaction = async (sql: string, keep: boolean): Promise<string> => {
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(keep ? "COMMIT" : "ROLLBACK");
      return "accepted";
    } catch (error) {
      await client.query("ROLLBACK");
      return (error as Error).message;
    } finally {
      client.release();
    }
  };
  it("replays on the migrated database, rows of both providers present, and changes nothing", async () => {
    const before = await catalogue();
    const counted = (await query("SELECT (SELECT count(*) FROM billing.charge) AS c, (SELECT count(*) FROM billing.charge_event) AS e")).rows;
    expect(await inTransaction(await readFile(new URL(NETOPIA_MIGRATION, MIGRATIONS), "utf8"), true)).toBe("accepted");
    expect(await catalogue()).toEqual(before);
    expect((await query("SELECT (SELECT count(*) FROM billing.charge) AS c, (SELECT count(*) FROM billing.charge_event) AS e")).rows).toEqual(counted);
  });
  it("0096's contract refuses a billing role missing one grant, a shared role holding any, and a purge granted wrongly", async () => {
    const source = await readFile(new URL(NETOPIA_MIGRATION, MIGRATIONS), "utf8");
    const contract = /DO \$billing_0096_contract\$[\s\S]*?\$billing_0096_contract\$;/u.exec(source)?.[0];
    expect(contract).toBeDefined();
    const replay = (drift: string) => inTransaction(`${drift};\n${contract!}`, false);
    expect(await replay("SELECT 1")).toBe("accepted");
    expect(await replay("REVOKE INSERT ON billing.card_token FROM debateai_billing_runtime")).toMatch(/^BILLING_0096_BILLING_ROLE_INCOMPLETE card_token$/u);
    expect(await replay("GRANT INSERT ON billing.status_read TO debateai_runtime")).toMatch(/^BILLING_0096_RUNTIME_WRITES/u);
    expect(await replay("GRANT SELECT ON billing.payment_notice TO debateai_runtime")).toMatch(/^BILLING_0096_RUNTIME_READS /u);
    expect(await replay("GRANT EXECUTE ON FUNCTION billing.purge_short_lived(timestamptz) TO debateai_runtime")).toMatch(/^BILLING_0096_RUNTIME_FUNCTIONS /u);
    expect(await replay("REVOKE EXECUTE ON FUNCTION billing.purge_revoked_card_tokens(timestamptz) FROM debateai_billing_runtime"))
      .toBe("BILLING_0096_PURGE_GRANTS_INVALID");
  });
});
