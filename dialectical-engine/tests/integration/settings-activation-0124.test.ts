import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { migrate } from "@debateai/db";
import {
  SUPPORT_CONFIGURATION_KEYS,
  createPostgresRegisterPublicationPort,
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber,
  type SupportConfigurationKey
} from "../../packages/register/src/index.js";
import { importHistoricalRegisterFixture, publishReplacementRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Migration 0124 (side-by-side uploads spec 2026-10-21 §13, §11; plan 2026-10-21-side-by-side-S-settings Task S1,
 * decisions D1 and D8): the settings activation pointer, the verdict log and the release switch's settings check,
 * against a real database. The register holds v4 (a historical import: its kind is NULL), v5 (a support publication),
 * and three GENERAL versions published from v4 (G1, G2, G3). Release A is r4-…, so its own site version is v4; release
 * B's key carries G1, its own site version. The cases run in order on one database; each name states the state it
 * expects. Embedded Postgres; CI skips this directory, run it alone.
 */
// The code parts are kept apart from the key names, so no line pairs a *_KEY name with a literal (gitleaks).
const A = ["r4", "a".repeat(12)].join("-");
const R17 = ["r17", "a".repeat(12)].join("-");
const BY = "test:settings-activation";
const DIGEST = "d".repeat(64);
const LOCK_WAIT = "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted) AS waiting";

const SUPPORT_VALUES: Readonly<Record<SupportConfigurationKey, unknown>> = Object.freeze({
  support_enabled: true,
  support_model_ref: "development:claude-cli",
  support_relay_concurrency: 2,
  support_daily_call_cap: 500,
  support_limit_anon_msgs_10m: 20,
  support_limit_anon_msgs_24h: 100,
  support_limit_anon_sessions_1h: 5,
  support_limit_session_msgs: 40,
  support_limit_msg_chars: 2000,
  support_limit_account_msgs_10m: 60,
  support_limit_account_msgs_24h: 300,
  support_queue_depth: 10,
  support_lock_after_injections: 3,
  support_ip_cooldown_minutes: 60,
  support_retention_policy: "keep",
  support_retention_ratified_by: null
});

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the call succeeded");
}
/** A pool or one client in a transaction: the calls below run on either. */
type Db = { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let database: TestDatabase;
let G1 = 0;
let G2 = 0;
let G3 = 0;
let SUPPORT = 0;
let B = "";

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await database.pool.query(sql, params)).rows[0] as T;
const passed = async (key: string | null, version: number): Promise<boolean> =>
  (await one<{ passed: boolean }>("SELECT register.settings_version_passed($1::text, $2::bigint) AS passed", [key, version])).passed;
const passedList = async (key: string): Promise<number[]> =>
  (await database.pool.query<{ v: string }>("SELECT v::text FROM register.read_passed_settings_versions($1::text) AS v", [key])).rows.map((row) => Number(row.v));
const pointer = async (): Promise<number | null> => {
  const value = (await one<{ v: string | null }>("SELECT register.read_active_settings_version()::text AS v")).v;
  return value === null ? null : Number(value);
};
const current = async (): Promise<string | null> =>
  (await database.pool.query<{ release_key: string }>("SELECT release_key FROM core.read_current_release()")).rows[0]?.release_key ?? null;
const count = async (table: string): Promise<number> =>
  (await one<{ n: number }>(`SELECT count(*)::int AS n FROM register.${table}`)).n;
const verdict = (key: string, version: number, word: string, digest = DIGEST, on: Db = database.pool) =>
  on.query("SELECT register.record_settings_verdict($1::text, $2::bigint, $3::text, $4::text)", [key, version, word, digest]);
const activate = async (version: number, previous: number | null, release: string, on: Db = database.pool): Promise<number> =>
  Number((await on.query(
    "SELECT register.activate_settings_version($1::bigint, $2::bigint, $3::text, $4::text, $5::text)::text AS seq",
    [version, previous, release, "owner", "settings change"])).rows[0]!.seq);
const stage = (key: string) => database.pool.query("SELECT core.record_release_event($1, 'STAGED', $2, NULL)", [key, BY]);
const switchTo = (key: string, expectedCurrent: string | null, expectedSettings: number | null, on: Db = database.pool) =>
  on.query("SELECT core.record_release_switch($1::text, $2::text, now(), $3::text, $4::bigint)", [key, expectedCurrent, BY, expectedSettings]);

/** A client in its own transaction; it is destroyed, never pooled, if the work leaves it mid-transaction. */
async function withClient(work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await database.pool.connect();
  let clean = false;
  try { await work(client); clean = true; } finally { client.release(!clean); }
}
/** Waits until a query is queued on the release switch's advisory lock. */
async function lockWaiting(): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if ((await one<{ waiting: boolean }>(LOCK_WAIT)).waiting) return;
    await sleep(25);
  }
  throw new Error("LOCK_NEVER_WAITED");
}

describe("0124: settings changes without an upload", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    const sourceRef = "fixture:settings-activation";
    const rows = SUPPORT_CONFIGURATION_KEYS.map((key) => registerFixtureRow(key, SUPPORT_VALUES[key], sourceRef));
    await importHistoricalRegisterFixture(database.pool, 4, rows);
    const support = await createPostgresRegisterPublicationPort(database.pool).publishSupport({
      publicationId: randomUUID(),
      baseRegisterVersion: parseRegisterVersionText("4"),
      expectedSupportRegisterVersion: null,
      schemaVersion: 1,
      patch: Object.freeze(rows.filter((row) => row.rowKey === "support_enabled")
        .map((row) => Object.freeze({ key: row.rowKey as SupportConfigurationKey, valueJsonText: row.valueJsonText }))),
      sourceRef
    });
    SUPPORT = registerVersionToSafeLegacyNumber(support.registerVersion);
    const general = async (marker: string): Promise<number> => registerVersionToSafeLegacyNumber((await publishReplacementRegisterFixture(database.pool,
      parseRegisterVersionText("4"), [registerFixtureRow("settingsActivationProbe", marker, sourceRef)], `${sourceRef}:${marker}`)).registerVersion);
    G1 = await general("g1");
    G2 = await general("g2");
    G3 = await general("g3");
    B = [`r${G1}`, "b".repeat(12)].join("-");
    expect(new Set([4, SUPPORT, G1, G2, G3]).size).toBe(5);
  }, 300_000);
  afterAll(async () => { await database?.stop(); });

  it("1. a fresh database: no pointer; a release passes its own site version with no verdict (D1), nothing else, legacy nothing", async () => {
    expect(await pointer()).toBeNull();
    expect(await passed(R17, 17)).toBe(true);
    expect(await passed("legacy", 17)).toBe(false);
    expect(await passed(R17, 18)).toBe(false);
    expect(await passed(null, 17)).toBe(false);
    expect(await passed(["r17", "A".repeat(12)].join("-"), 17)).toBe(false);
    expect(await passedList(A)).toEqual([4]);
    expect(await passedList("legacy")).toEqual([]);
  });

  it("2. verdicts: the latest wins; bad inputs are refused; the pass list is the site version plus the PASS ones", async () => {
    await verdict(A, G1, "PASS");
    await verdict(A, G1, "FAIL");
    expect(await passed(A, G1)).toBe(false);
    await verdict(A, G2, "FAIL");
    await verdict(A, G2, "PASS");
    expect(await passed(A, G2)).toBe(true);
    const rowsBefore = await count("settings_verdict");
    for (const [key, version, word, digest] of [
      [A, G3, "PASS", "D".repeat(64)], [A, G3, "PASS", "d".repeat(63)], ["legacy", G3, "PASS", DIGEST],
      [["r4", "g".repeat(12)].join("-"), G3, "PASS", DIGEST], [A, 999, "PASS", DIGEST], [A, G3, "MAYBE", DIGEST]
    ] as const) {
      const error = await refusal(verdict(key, version, word, digest));
      expect(messageOf(error), `${key} ${version} ${word}`).toBe("SETTINGS_VERDICT_INVALID");
      expect(codeOf(error)).toBe("22023");
    }
    expect(await count("settings_verdict")).toBe(rowsBefore);
    expect(await passedList(A)).toEqual([4, G2]);
    expect(await passed(A, G3)).toBe(false);
  });

  it("3a. activation with no current release refuses SETTINGS_ACTIVATION_CONFLICT", async () => {
    for (const expected of [A, null]) {
      const error = await refusal(activate(G2, null, expected as string));
      expect(messageOf(error)).toBe("SETTINGS_ACTIVATION_CONFLICT");
    }
    expect(await count("settings_activation")).toBe(0);
  });

  it("4a. the first switch with no pointer and no expected version commits with no verdict (D1; A current)", async () => {
    await stage(A);
    const checks = await count("settings_switch_check");
    await switchTo(A, null, null);
    expect(await current()).toBe(A);
    expect(await count("settings_switch_check")).toBe(checks + 1);
  });

  it("3b. activation refusals, one each, then success, unchanged, and going back as a NEW row (A current, pointer G2)", async () => {
    const refused = async (work: () => Promise<unknown>, message: string, code: string): Promise<void> => {
      const before = await count("settings_activation");
      const error = await refusal(work());
      expect(messageOf(error)).toBe(message);
      expect(codeOf(error)).toBe(code);
      expect(await count("settings_activation")).toBe(before);
    };
    await refused(() => activate(G2, null, B), "SETTINGS_ACTIVATION_CONFLICT", "40001"); // wrong expected current
    await refused(() => activate(G2, G1, A), "SETTINGS_ACTIVATION_CONFLICT", "40001"); // wrong expected previous
    await refused(() => activate(SUPPORT, null, A), "SETTINGS_VERSION_KIND_INVALID", "22023"); // a support publication
    await refused(() => activate(999, null, A), "SETTINGS_VERSION_KIND_INVALID", "22023"); // no such sealed version
    await refused(() => activate(G1, null, A), "SETTINGS_VERSION_NOT_PASSED", "55000"); // A's latest verdict for G1 is FAIL
    await refused(() => activate(G3, null, A), "SETTINGS_VERSION_NOT_PASSED", "55000"); // no verdict at all
    // A REPEATABLE READ snapshot could read a stale current release: refused before the lock.
    await withClient(async (client) => {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const error = await refusal(activate(G2, null, A, client));
      await client.query("ROLLBACK");
      expect(messageOf(error)).toBe("SETTINGS_ACTIVATION_CONFLICT");
      expect((error as { detail?: string }).detail).toBe("READ_COMMITTED_REQUIRED");
    });
    // Success, as the operator role: a sequence number, and the pointer moves.
    let first = 0;
    await withClient(async (client) => {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_release_operator");
      first = await activate(G2, null, A, client);
      await client.query("COMMIT");
    });
    expect(first).toBeGreaterThan(0);
    expect(await pointer()).toBe(G2);
    await refused(() => activate(G2, G2, A), "SETTINGS_ACTIVATION_UNCHANGED", "22023");
    // Back to A's own site version, then forward again: each a NEW row, never an edit.
    const second = await activate(4, G2, A);
    expect(await pointer()).toBe(4);
    const third = await activate(G2, 4, A);
    expect([first < second, second < third]).toEqual([true, true]);
    expect(await pointer()).toBe(G2);
    expect((await database.pool.query("SELECT register_version::int AS v, expected_previous::int AS p, release_key FROM register.settings_activation ORDER BY activation_seq")).rows)
      .toEqual([{ v: G2, p: null, release_key: A }, { v: 4, p: G2, release_key: A }, { v: G2, p: 4, release_key: A }]);
  });

  it("4b. the switch hook through 0123's real switch (B current, pointer G1 afterwards)", async () => {
    await stage(B);
    const checks = await count("settings_switch_check");
    // B has passed only its own site version G1, not the pointer G2: the switch itself passes the hook, but its COMMIT
    // fails, and neither the CURRENT row nor the check row survives.
    await withClient(async (client) => {
      await client.query("BEGIN");
      await switchTo(B, A, G2, client);
      const error = await refusal(client.query("COMMIT"));
      expect(messageOf(error)).toBe("SETTINGS_VERSION_NOT_PASSED");
      expect(codeOf(error)).toBe("55000");
    });
    expect(await current()).toBe(A);
    expect(await count("settings_switch_check")).toBe(checks);
    expect(await pointer()).toBe(G2);
    // The same switch, followed in the same transaction by an activation of a version B has passed: it commits.
    await withClient(async (client) => {
      await client.query("BEGIN");
      await switchTo(B, A, G2, client);
      expect(await activate(G1, G2, B, client)).toBeGreaterThan(0);
      await client.query("COMMIT");
    });
    expect(await current()).toBe(B);
    expect(await pointer()).toBe(G1);
    expect(await count("settings_switch_check")).toBe(checks + 1);
    // A wrong expected settings version refuses at once, inside the switch (the release table is unchanged).
    await stage(A);
    const events = (await one<{ n: number }>("SELECT count(*)::int AS n FROM core.release_event")).n;
    for (const expected of [999, null]) {
      const error = await refusal(switchTo(A, B, expected));
      expect(messageOf(error)).toBe("SETTINGS_ACTIVATION_CONFLICT");
      expect(codeOf(error)).toBe("40001");
    }
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM core.release_event")).n).toBe(events);
    expect(await current()).toBe(B);
  });

  it("5a. the race, switch first: B → A wins, the activation that waited refuses (A current, pointer G1)", async () => {
    await verdict(A, G1, "PASS"); // A now passes the pointer G1
    await verdict(B, G3, "PASS"); // B passes G3; A never did
    const c1 = await database.pool.connect();
    const c2 = await database.pool.connect();
    let clean = false;
    try {
      await c2.query("BEGIN");
      await switchTo(A, B, G1, c2);
      await c1.query("BEGIN");
      const waiting = activate(G3, G1, B, c1).then(() => "COMMITTED", (error: unknown) => error);
      await lockWaiting();
      await c2.query("COMMIT");
      const lost = await waiting;
      expect(messageOf(lost)).toBe("SETTINGS_ACTIVATION_CONFLICT");
      await c1.query("ROLLBACK");
      clean = true;
    } finally { c1.release(!clean); c2.release(!clean); }
    expect(await current()).toBe(A);
    expect(await pointer()).toBe(G1);
    expect(await passed(await current(), (await pointer())!)).toBe(true);
  });

  it("5b. the race, activation first: A activates G2, the switch to B that waited refuses (A current, pointer G2)", async () => {
    await stage(B);
    // B has passed G1 (its own) and G3, never G2; A passed G2 (case 2). Either alone would commit.
    const c1 = await database.pool.connect();
    const c2 = await database.pool.connect();
    let clean = false;
    try {
      await c1.query("BEGIN");
      expect(await activate(G2, G1, A, c1)).toBeGreaterThan(0);
      await c2.query("BEGIN");
      const waiting = switchTo(B, A, G1, c2).then(() => "COMMITTED", (error: unknown) => error);
      await lockWaiting();
      await c1.query("COMMIT");
      const lost = await waiting;
      expect(messageOf(lost)).toBe("SETTINGS_ACTIVATION_CONFLICT");
      await c2.query("ROLLBACK");
      clean = true;
    } finally { c1.release(!clean); c2.release(!clean); }
    expect(await current()).toBe(A);
    expect(await pointer()).toBe(G2);
    expect(await passed(await current(), (await pointer())!)).toBe(true);
  });

  it("6. append-only: UPDATE, DELETE and TRUNCATE refuse on all three tables; only the release owner inserts", async () => {
    const tables = ["settings_activation", "settings_verdict", "settings_switch_check"] as const;
    const counts = await Promise.all(tables.map((table) => count(table)));
    for (const table of tables) {
      // The migrator's own role (the database's owner, a superuser here) meets the same guards.
      for (const statement of [`UPDATE register.${table} SET release_key = release_key`, `DELETE FROM register.${table}`, `TRUNCATE register.${table}`]) {
        const error = await refusal(database.pool.query(statement));
        expect(codeOf(error), statement).toBe("55000");
        expect(messageOf(error), statement).toMatch(/append-only|TRUNCATE_REJECTED/u);
      }
    }
    const inserts: Readonly<Record<(typeof tables)[number], readonly [string, unknown[]]>> = {
      settings_activation: ["INSERT INTO register.settings_activation(register_version, expected_previous, release_key, activated_by, reason) VALUES ($1, NULL, $2, 'x', 'x')", [G2, A]],
      settings_verdict: ["INSERT INTO register.settings_verdict(release_key, register_version, verdict, digest) VALUES ($1, $2, 'PASS', $3)", [A, G3, DIGEST]],
      settings_switch_check: ["INSERT INTO register.settings_switch_check(release_key, expected_active_settings) VALUES ($1, NULL)", [A]]
    };
    for (const table of tables) {
      const [statement, params] = inserts[table];
      const direct = await refusal(database.pool.query(statement, params));
      expect(messageOf(direct), table).toBe("SETTINGS_ACTIVATION_WRITER_INVALID");
      expect(codeOf(direct), table).toBe("42501");
      for (const role of ["debateai_runtime", "debateai_release_operator"]) {
        await withClient(async (client) => {
          await client.query("BEGIN");
          await client.query(`SET LOCAL ROLE ${role}`);
          const error = await refusal(client.query(statement, params));
          await client.query("ROLLBACK");
          expect(codeOf(error), `${role} ${table}`).toBe("42501");
        });
      }
    }
    expect(await Promise.all(tables.map((table) => count(table)))).toEqual(counts);
  });

  it("7. grants: the pointer for the API's role only, the pass readers for the runtime, the rest for the operator", async () => {
    const functions = [
      "register.settings_version_passed(text,bigint)", "register.read_passed_settings_versions(text)",
      "register.read_active_settings_version()", "register.record_settings_verdict(text,bigint,text,text)",
      "register.activate_settings_version(bigint,bigint,text,text,text)", "register.release_switch_settings_hook(text,bigint)",
      "register.settings_switch_check_at_commit()", "register.settings_activation_insert_guard()",
      "register.settings_verdict_insert_guard()", "register.settings_switch_check_insert_guard()"
    ];
    const executable = async (role: string): Promise<string[]> => (await database.pool.query<{ signature: string }>(
      "SELECT signature FROM unnest($2::text[]) AS signature WHERE has_function_privilege($1, signature, 'EXECUTE') ORDER BY signature",
      [role, functions])).rows.map((row) => row.signature);
    expect((await one<{ allowed: boolean }>("SELECT has_function_privilege('debateai_runtime', 'register.read_active_settings_version()', 'EXECUTE') AS allowed")).allowed).toBe(false);
    expect((await one<{ allowed: boolean }>("SELECT has_function_privilege('debateai_billing_runtime', 'register.read_active_settings_version()', 'EXECUTE') AS allowed")).allowed).toBe(true);
    expect(await executable("debateai_runtime")).toEqual(["register.read_passed_settings_versions(text)", "register.settings_version_passed(text,bigint)"]);
    expect(await executable("debateai_billing_runtime")).toEqual(["register.read_active_settings_version()",
      "register.read_passed_settings_versions(text)", "register.settings_version_passed(text,bigint)"]);
    expect(await executable("debateai_release_operator")).toEqual(["register.activate_settings_version(bigint,bigint,text,text,text)",
      "register.read_active_settings_version()", "register.read_passed_settings_versions(text)",
      "register.record_settings_verdict(text,bigint,text,text)", "register.settings_version_passed(text,bigint)"]);
    expect(await executable("debateai_replay")).toEqual([]);
    // All ten are the release owner's (ruling R9); the runtime reads none of the three tables.
    expect((await database.pool.query<{ owner: string }>(
      "SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM unnest($1::text[]) AS signature JOIN pg_proc AS p ON p.oid = to_regprocedure(signature)",
      [functions])).rows).toEqual([{ owner: "debateai_release_owner" }]);
    for (const table of ["settings_activation", "settings_verdict", "settings_switch_check"]) {
      expect((await one<{ any: boolean }>(`SELECT has_table_privilege('debateai_runtime', 'register.${table}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS any`)).any, table).toBe(false);
    }
  });
});
