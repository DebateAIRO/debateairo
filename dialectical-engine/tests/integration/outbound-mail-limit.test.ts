import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "@debateai/crypto";
import { migrate } from "@debateai/db";
import { PostgresOutboundMailStore } from "../../packages/db/src/outbound-mail.js";
import { OutboundMailGate, type OutboundMailGateEvent } from "../../apps/api/src/outbound-mail-gate.js";
import { RLS_SCOPE_RULE_SQL } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// Migration 0170 against a real database: the count lives there, survives a restart, is shared by every API copy, and the
// API's login can reach it only through the four functions.

const TABLES = ["identity.outbound_mail_daily_count", "identity.outbound_mail_suppression"];
const FUNCTIONS = ["identity.reserve_outbound_mail(text,integer)", "identity.outbound_mail_today()",
  "identity.claim_outbound_mail_alert(text,date)", "identity.outbound_mail_recipient_suppressed(bytea)"];
const KEY = Buffer.alloc(32, 0x5a);
const timeout = 300000;

let db: TestDatabase;
let copyOne: Pool;
let copyTwo: Pool;

/** Pools acting as the API's runtime login: SET ROLE on every new connection of the test's superuser. */
function runtimePool(): Pool {
  const pool = new Pool({ connectionString: db.connectionString, max: 8 });
  pool.on("connect", (client) => { void client.query("SET ROLE debateai_runtime"); });
  return pool;
}

async function resetToday(): Promise<void> {
  await db.pool.query("DELETE FROM identity.outbound_mail_daily_count");
  await db.pool.query("DELETE FROM identity.outbound_mail_suppression");
}

beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  copyOne = runtimePool();
  copyTwo = runtimePool();
}, timeout);
afterAll(async () => {
  await copyOne?.end();
  await copyTwo?.end();
  await db?.stop();
}, timeout);

describe("0170 the daily outbound mail limit", () => {
  it("two API copies never take more than the ceiling between them: 50 at once, ceiling 10, exactly 10", async () => {
    await resetToday();
    const one = new PostgresOutboundMailStore(copyOne);
    const two = new PostgresOutboundMailStore(copyTwo);
    const results = await Promise.all(Array.from({ length: 50 }, (_, index) => (index % 2 === 0 ? one : two).reserve({ purposeClass: "standard", ceiling: 10 })));
    expect(results.filter((result) => result.admitted)).toHaveLength(10);
    expect(results.filter((result) => result.admitted).map((result) => result.total).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(results.filter((result) => !result.admitted).every((result) => result.total === 10)).toBe(true);
    expect((await one.today()).total).toBe(10);
    expect((await two.today()).total).toBe(10);
  }, timeout);

  it("the count survives a restart: a new store on a new pool reads what the old one counted", async () => {
    await resetToday();
    const before = runtimePool();
    await new PostgresOutboundMailStore(before).reserve({ purposeClass: "security", ceiling: 10 });
    await before.end();
    const after = runtimePool();
    try {
      expect((await new PostgresOutboundMailStore(after).today()).total).toBe(1);
    } finally { await after.end(); }
  }, timeout);

  it("standard mail stops below the ceiling security mail may reach, both classes sharing one total", async () => {
    await resetToday();
    const store = new PostgresOutboundMailStore(copyOne);
    for (let i = 0; i < 8; i += 1) expect((await store.reserve({ purposeClass: "standard", ceiling: 8 })).admitted).toBe(true);
    expect(await store.reserve({ purposeClass: "standard", ceiling: 8 })).toMatchObject({ admitted: false, total: 8 });
    expect((await store.reserve({ purposeClass: "security", ceiling: 10 })).admitted).toBe(true);
    expect((await store.reserve({ purposeClass: "security", ceiling: 10 })).admitted).toBe(true);
    expect(await store.reserve({ purposeClass: "security", ceiling: 10 })).toMatchObject({ admitted: false, total: 10 });
    expect((await db.pool.query("SELECT standard_sent,security_sent FROM identity.outbound_mail_daily_count")).rows).toEqual([{ standard_sent: 8, security_sent: 2 }]);
  }, timeout);

  it("a new UTC day starts a new count and clears rows older than 35 days, keeping the rest", async () => {
    await resetToday();
    await db.pool.query(`INSERT INTO identity.outbound_mail_daily_count(day,standard_sent) VALUES
      ((clock_timestamp() AT TIME ZONE 'UTC')::date-1,100),((clock_timestamp() AT TIME ZONE 'UTC')::date-35,1),((clock_timestamp() AT TIME ZONE 'UTC')::date-36,1)`);
    const result = await new PostgresOutboundMailStore(copyOne).reserve({ purposeClass: "standard", ceiling: 1 });
    expect(result).toMatchObject({ admitted: true, total: 1 });
    expect((await db.pool.query(`SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date-day) AS age FROM identity.outbound_mail_daily_count ORDER BY day DESC`)).rows.map((row) => row.age)).toEqual([0, 1, 35]);
    expect(result.day).toBe((await db.pool.query(`SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date)::text AS day`)).rows[0].day);
  }, timeout);

  it("an alert goes to exactly one copy, once a day per kind, and stays taken across a restart", async () => {
    await resetToday();
    const one = new PostgresOutboundMailStore(copyOne);
    const two = new PostgresOutboundMailStore(copyTwo);
    const { day } = await one.today();
    const claims = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? one : two).claimAlert("ALERT_SHARE", day)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await one.claimAlert("ALERT_SHARE", day)).toBe(false);
    expect(await one.claimAlert("STANDARD_LIMIT", day)).toBe(true);
    expect(await two.claimAlert("DAILY_LIMIT", day)).toBe(true);
    await expect(one.claimAlert("OTHER" as never, day)).rejects.toThrow("OUTBOUND_MAIL_ALERT_INVALID");
    await expect(one.claimAlert("ALERT_SHARE", "2020-01-01")).rejects.toThrow("OUTBOUND_MAIL_ALERT_INVALID");
  }, timeout);

  it("the real gate on the real store: half alert, sign-up stop and the last slot, across two copies", async () => {
    await resetToday();
    const events: OutboundMailGateEvent[] = [];
    const gateOn = (pool: Pool) => {
      const store = new PostgresOutboundMailStore(pool);
      return new OutboundMailGate({ policy: { dailyLimit: 10, reservedForSecurityPct: 20, alertAtPct: 50 }, blindIndexKey: KEY, ledger: store, suppression: store, report: (event) => { events.push(event); } });
    };
    const one = gateOn(copyOne);
    const two = gateOn(copyTwo);
    const sends = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? one : two).authorize({ recipient: `p${String(i)}@example.com`, purpose: "verification" })));
    expect(sends.filter((send) => send.status === "fulfilled")).toHaveLength(8);
    expect(await one.hasStandardRoom()).toBe(false);
    expect(await two.authorize({ recipient: "reset@example.com", purpose: "password-reset" })).toBe(true);
    const alerts = events.flatMap((event) => event.kind === "alert" ? [event.alert] : []).sort();
    expect(alerts).toEqual(["ALERT_SHARE", "STANDARD_LIMIT"]);
  }, timeout);

  it("a suppressed digest is found; the address is never stored, and the count holds no person", async () => {
    await resetToday();
    const store = new PostgresOutboundMailStore(copyOne);
    const gate = new OutboundMailGate({ policy: { dailyLimit: 10, reservedForSecurityPct: 20, alertAtPct: 100 }, blindIndexKey: KEY, ledger: store, suppression: store, report: () => undefined });
    const address = "bounced.person@example.com";
    await db.pool.query(`INSERT INTO identity.outbound_mail_suppression(recipient_digest,reason,first_at,last_at) VALUES($1,'COMPLAINT',now(),now())`, [createEmailBlindIndex(KEY, address)]);
    expect(await gate.authorize({ recipient: address, purpose: "verification" })).toBe(false);
    expect(await gate.authorize({ recipient: "fine.person@example.com", purpose: "verification" })).toBe(true);
    expect((await store.today()).total).toBe(1);
    await expect(store.isSuppressed(Buffer.alloc(3))).rejects.toThrow("OUTBOUND_MAIL_DIGEST_INVALID");
    await expect(db.pool.query(`INSERT INTO identity.outbound_mail_suppression(recipient_digest,reason,first_at,last_at) VALUES('\\x00','COMPLAINT',now(),now())`)).rejects.toThrow();
    await expect(db.pool.query(`INSERT INTO identity.outbound_mail_suppression(recipient_digest,reason,first_at,last_at) VALUES($1,'OTHER',now(),now())`, [Buffer.alloc(32, 1)])).rejects.toThrow();
    const dump = JSON.stringify((await db.pool.query("SELECT * FROM identity.outbound_mail_daily_count")).rows)
      + JSON.stringify((await db.pool.query("SELECT encode(recipient_digest,'escape') d,reason FROM identity.outbound_mail_suppression")).rows);
    expect(dump).not.toContain("person");
    const countColumns = (await db.pool.query(`SELECT a.attname FROM pg_attribute a WHERE a.attrelid='identity.outbound_mail_daily_count'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows.map((row) => row.attname as string);
    expect(countColumns).toEqual(["day", "standard_sent", "security_sent", "alert_share_at", "standard_limit_at", "daily_limit_at"]);
  }, timeout);

  it("the API's logins hold no right on the tables, only EXECUTE on the four functions, which nobody else inherits by PUBLIC", async () => {
    const roles = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime"];
    for (const role of roles) {
      for (const table of TABLES) {
        const privileges = (await db.pool.query(`SELECT bool_or(has_table_privilege($1,$2::regclass,p)) AS any FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`, [role, table])).rows[0].any as boolean;
        expect(privileges, `${role} ${table}`).toBe(false);
      }
      for (const fn of FUNCTIONS) {
        expect((await db.pool.query("SELECT has_function_privilege($1,$2::regprocedure,'EXECUTE') AS ok", [role, fn])).rows[0].ok, `${role} ${fn}`).toBe(true);
      }
    }
    for (const fn of FUNCTIONS) {
      const proc = (await db.pool.query(`SELECT p.prosecdef,p.proconfig,(pg_get_userbyid(p.proowner)=(SELECT pg_get_userbyid(q.proowner) FROM pg_proc q WHERE q.oid='identity.read_email_settings(uuid,uuid)'::regprocedure)) AS house_owner,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public_execute
        FROM pg_proc p WHERE p.oid=$1::regprocedure`, [fn])).rows[0];
      expect({ fn, ...proc }).toEqual({ fn, prosecdef: true, proconfig: ["search_path=pg_catalog"], house_owner: true, public_execute: false });
    }
    await expect(copyOne.query("SELECT * FROM identity.outbound_mail_daily_count")).rejects.toMatchObject({ code: "42501" });
    await expect(copyOne.query("UPDATE identity.outbound_mail_daily_count SET standard_sent=0")).rejects.toMatchObject({ code: "42501" });
    await expect(copyOne.query("SELECT * FROM identity.outbound_mail_suppression")).rejects.toMatchObject({ code: "42501" });
    await expect(db.pool.query("TRUNCATE identity.outbound_mail_daily_count")).rejects.toThrow();
  }, timeout);

  it("is outside row-level security's rule: no API login can read it, and it holds no account's row", async () => {
    const roleRows = (await db.pool.query(RLS_SCOPE_RULE_SQL)).rows.map((row) => row.relation as string);
    for (const table of TABLES) expect(roleRows).not.toContain(table);
  }, timeout);

  it("states in the SQL that the bounce and complaint feed is still owed", () => {
    const sql = readFileSync(new URL("../../migrations/0170_outbound_mail_limit.sql", import.meta.url), "utf8");
    expect(sql).toContain("that feed is still owed");
  });
});
