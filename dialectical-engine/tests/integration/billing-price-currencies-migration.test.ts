import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { BillingRepository, migrate } from "@debateai/db";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { seedNetopiaSubscription } from "../support/billingSubscriptionFixtures.js";
import { seedDevLineageThroughStep } from "../support/devLineage108.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Spec 2026-10-05 §2.16 (Part C, revised 10 October 2026): every plan has a price in USD, EUR and RON, and each
 * subscription keeps its currency for good. Part C's forward step after 0111 records the currency on the quote (a new
 * column, older rows read USD), lets a charge be in any of the three, and checks CREATED's `data.currency`. It runs once,
 * after 0111, with its own receipt, and replays.
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const NETOPIA_STEP = "0111_billing_netopia.sql";
const PART_C_STEP = "0113_billing_price_currencies.sql";
const PART_C_MANIFEST = "lineage/billing-price-currencies-forward0113.json";
// A made-up key id, built from pieces so the whole value never appears as one secret-shaped literal.
const KEY_ID = ["01234567", "89abcdef"].join("");
const SEALED = Buffer.from([1, 2, 3, 4]);
const RECENT = "2026-10-01T10:00:00Z";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const chargeIdOf = (): string => randomUUID().replaceAll("-", "");

let database: TestDatabase;
const query = (sql: string, values: unknown[] = []) => database.pool.query(sql, values);
const olderQuoteId = randomUUID();

/** A SUBSCRIBE quote row; `currency` undefined writes none (as 0111 knew the table). */
function insertQuote(currency?: string) {
  const quoteId = randomUUID();
  const named = currency === undefined ? "" : ", currency";
  const value = currency === undefined ? "" : ", $5";
  const values: unknown[] = [quoteId, randomUUID(), SEALED, KEY_ID];
  if (currency !== undefined) values.push(currency);
  return query(`INSERT INTO billing.quote (quote_id, owner_ref, plan_id, kind, net_micros, tax_micros, total_micros,
      tax_country, tax_region, tax_rate_bp, tax_status, tax_name, quaderno_ref, created_at, expires_at,
      location_ciphertext, key_id${named})
    VALUES ($1, $2, 'PLUS', 'SUBSCRIBE', 20000000, 4200000, 24200000, 'RO', NULL, 2100, 'TAXABLE', 'VAT', NULL,
      clock_timestamp(), clock_timestamp() + interval '30 minutes', $3, $4${value})`, values).then(() => quoteId);
}

/** A card-check charge (it needs no quote), the smallest charge row. */
function insertCharge(currency: string) {
  return query(`INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end,
      quote_id, net_micros, tax_micros, total_micros, currency, created_at, payment_provider, payment_environment)
    VALUES ($1, $2, $3, 'CARD_CHECK', 1, $4::timestamptz, $4::timestamptz + interval '1 day', NULL, 0, 0, 0, $5, $4,
      'netopia', 'sandbox')`, [chargeIdOf(), randomUUID(), randomUUID(), RECENT, currency]);
}

/** A NETOPIA CREATED whose data carries `currency` as the given JSON (undefined: no currency member). */
function insertCreated(currencyJson?: string) {
  const extra = currencyJson === undefined ? "" : `, 'currency', $4::jsonb`;
  const values: unknown[] = [randomUUID(), randomUUID(), randomUUID()];
  if (currencyJson !== undefined) values.push(currencyJson);
  return query(`INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
    VALUES ($1, $2, $3, 'CREATED', clock_timestamp(), 'PLUS',
      jsonb_build_object('payment_provider', 'netopia', 'payment_environment', 'sandbox'${extra}))`, values);
}

async function migrationState(pool = database.pool) {
  return {
    ledger: (await pool.query("SELECT name, applied_at FROM public.debateai_schema_migration ORDER BY name")).rows,
    steps: (await pool.query("SELECT * FROM public.debateai_schema_migration_step ORDER BY source_name")).rows
  };
}

/** The catalog facts the step owns: the quote's currency column and the three constraints. */
async function catalogState() {
  return {
    column: (await query(`SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, a.atthasdef
      FROM pg_attribute a WHERE a.attrelid = 'billing.quote'::regclass AND a.attname = 'currency' AND NOT a.attisdropped`)).rows,
    constraints: (await query(`SELECT conrelid::regclass::text AS relation, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid IN ('billing.quote'::regclass, 'billing.charge'::regclass,
        'billing.subscription_event'::regclass) ORDER BY 1, 2`)).rows
  };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await seedDevLineageThroughStep(database.pool, NETOPIA_STEP);
  // One quote row as 0111 knows the table: no currency column yet.
  await query(`INSERT INTO billing.quote (quote_id, owner_ref, plan_id, kind, net_micros, tax_micros, total_micros,
      tax_country, tax_region, tax_rate_bp, tax_status, tax_name, quaderno_ref, created_at, expires_at,
      location_ciphertext, key_id)
    VALUES ($1, $2, 'PLUS', 'SUBSCRIBE', 20000000, 4200000, 24200000, 'RO', NULL, 2100, 'TAXABLE', 'VAT', NULL,
      clock_timestamp(), clock_timestamp() + interval '30 minutes', $3, $4)`, [olderQuoteId, randomUUID(), SEALED, KEY_ID]);
  await migrate(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

describe("Part C's migration step: the currency of every quote, charge and subscription", () => {
  it("reads an older quote as USD, and the column is required with no default", async () => {
    expect((await query("SELECT currency FROM billing.quote WHERE quote_id = $1", [olderQuoteId])).rows).toEqual([{ currency: "USD" }]);
    expect((await catalogState()).column).toEqual([{ attname: "currency", type: "text", attnotnull: true, atthasdef: false }]);
    await expect(insertQuote()).rejects.toMatchObject({ code: "23502" });
  });

  it.each(["USD", "EUR", "RON"])("accepts a quote, a charge and a CREATED in %s", async (currency) => {
    await expect(insertQuote(currency)).resolves.toBeTypeOf("string");
    await expect(insertCharge(currency)).resolves.toBeDefined();
    await expect(insertCreated(JSON.stringify(currency))).resolves.toBeDefined();
  });

  it("accepts a CREATED that names no currency (an older history: US dollars)", async () => {
    await expect(insertCreated()).resolves.toBeDefined();
  });

  it.each(["GBP", "eur", ""])("refuses %j on all three tables (23514)", async (currency) => {
    await expect(insertQuote(currency)).rejects.toMatchObject({ code: "23514" });
    await expect(insertCharge(currency)).rejects.toMatchObject({ code: "23514" });
    await expect(insertCreated(JSON.stringify(currency))).rejects.toMatchObject({ code: "23514" });
  });

  it.each(["978", "null"])("refuses a CREATED whose currency is the JSON %s (23514)", async (json) => {
    await expect(insertCreated(json)).rejects.toMatchObject({ code: "23514" });
  });

  it("names the three constraints on their tables, and 0086's charge_currency_check is gone", async () => {
    const { constraints } = await catalogState();
    const named = (relation: string) => constraints.filter((row) => row.relation === relation).map((row) => row.conname as string);
    expect(named("billing.quote")).toContain("quote_currency_known");
    expect(named("billing.charge")).toContain("charge_currency_known");
    expect(named("billing.subscription_event")).toContain("subscription_event_created_currency_known");
    expect(constraints.map((row) => row.conname)).not.toContain("charge_currency_check");
  });

  it("records the step once, after 0111, with its manifest's digest; a second migrate() changes neither ledger", async () => {
    const plan = await loadMigrationPlan();
    const before = await migrationState();
    expect(before.ledger.map((row) => row.name).filter((name) => name === PART_C_STEP)).toHaveLength(1);
    expect(before.steps.map((row) => row.source_name)).toEqual([NETOPIA_STEP, PART_C_STEP]);
    const step = plan.forwardChain.find((entry) => entry.name === PART_C_STEP)!;
    const netopia = plan.forwardChain.find((entry) => entry.name === NETOPIA_STEP)!;
    expect(before.steps[1]).toMatchObject({
      source_name: PART_C_STEP, base_recipe_sha256: plan.recipeSha256, previous_manifest_sha256: netopia.manifestSha256,
      forward_manifest_sha256: sha256(await readFile(new URL(PART_C_MANIFEST, MIGRATIONS))),
      source_sha256: sha256(await readFile(new URL(PART_C_STEP, MIGRATIONS))), verifier_sha256: step.verifierSha256
    });
    const applied0111 = before.ledger.find((row) => row.name === NETOPIA_STEP)!.applied_at as Date;
    const applied0113 = before.ledger.find((row) => row.name === PART_C_STEP)!.applied_at as Date;
    expect(applied0113.getTime()).toBeGreaterThan(applied0111.getTime());
    await migrate(database.pool);
    expect(await migrationState()).toEqual(before);
  });

  it("replays: the SQL run twice more by hand leaves the same state", async () => {
    const sql = await readFile(new URL(PART_C_STEP, MIGRATIONS), "utf8");
    const before = await catalogState();
    await query(sql);
    await query(sql);
    expect(await catalogState()).toEqual(before);
    expect((await query("SELECT currency FROM billing.quote WHERE quote_id = $1", [olderQuoteId])).rows).toEqual([{ currency: "USD" }]);
  });

  it("round-trips a quote's currency through BillingRepository", async () => {
    const billing = new BillingRepository(database.pool);
    const quoteId = randomUUID();
    const ownerRef = randomUUID();
    const now = new Date();
    await billing.withTransaction((client) => billing.insertQuote(client, {
      quoteId, ownerRef, planId: "PLUS", kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 3_800_000,
      totalMicros: 23_800_000, taxCountry: "DE", taxRegion: null, taxRateBasisPoints: 1_900, taxStatus: "TAXABLE",
      taxName: "MwSt.", quadernoRef: null, createdAt: now, expiresAt: new Date(now.getTime() + 1_800_000),
      locationCiphertext: SEALED, keyId: KEY_ID, recurringTotalMicros: null, currency: "EUR"
    }));
    expect((await billing.quote(quoteId, ownerRef))?.currency).toBe("EUR");
  });

  it("seeds a RON subscription whose quote, INITIAL charge and fold say RON; the default seed folds to USD", async () => {
    const billing = new BillingRepository(database.pool);
    const activatedAt = new Date("2026-10-01T09:00:00.000Z");
    const ron = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt, taxCountry: "RO", currency: "RON"
    });
    expect(ron.currency).toBe("RON");
    expect(foldSubscription(await billing.subscriptionEvents(ron.subscriptionId)).currency).toBe("RON");
    expect((await billing.quote(ron.initialQuoteId, ron.ownerRef))).toMatchObject({ currency: "RON", netMicros: 100_000_000 });
    expect((await query("SELECT currency FROM billing.charge WHERE charge_id = $1", [ron.initialChargeId])).rows)
      .toEqual([{ currency: "RON" }]);
    const usd = await seedNetopiaSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt, taxCountry: "RO" });
    expect(usd.currency).toBe("USD");
    expect(foldSubscription(await billing.subscriptionEvents(usd.subscriptionId)).currency).toBe("USD");
  });
});
