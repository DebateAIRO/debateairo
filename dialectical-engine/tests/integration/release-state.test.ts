import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  migrate, readCurrentRelease, readReleaseState, recordReleaseEvent, recordReleaseSwitch
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The release table (side-by-side uploads spec 2026-10-21 §4, §6; migration 0123 §3; plan A Task A2 and its addendum):
 * core.release_event is the append-only record of which release takes the site's traffic, core.release_state_v reads
 * one row per release from it, and the two writers serialize on one advisory lock so two switches can never both win.
 * The cases run in order on one database; each name states the state it expects. The race runs on a fresh database.
 */
const A = ["r17", "aaaaaaaaaaaa"].join("-");
const B = ["r18", "bbbbbbbbbbbb"].join("-");
const C = ["r19", "cccccccccccc"].join("-");
const D = ["r20", "dddddddddddd"].join("-");
const E = ["r21", "eeeeeeeeeeee"].join("-");
const T1 = new Date("2026-10-21T10:00:00.000Z");
const T2 = new Date("2026-10-21T11:00:00.000Z");
const T3 = new Date("2026-10-21T12:00:00.000Z");
const T4 = new Date("2026-10-21T13:00:00.000Z");
const T5 = new Date("2026-10-21T14:00:00.000Z");
const T6 = new Date("2026-10-21T15:00:00.000Z");
const T7 = new Date("2026-10-21T16:00:00.000Z");
const T8 = new Date("2026-10-21T17:00:00.000Z");
const BY = "test:release-state";

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the call succeeded");
}

let database: TestDatabase;
const eventCount = async (): Promise<number> =>
  (await database.pool.query<{ n: number }>("SELECT count(*)::int n FROM core.release_event")).rows[0]!.n;
const state = (key: string) => readReleaseState(database.pool, key);
const stage = (key: string) => recordReleaseEvent(database.pool, { releaseKey: key, kind: "STAGED", recordedBy: BY });
const live = (s: "STAGED" | "CURRENT" | "DRAINING" | "RETIRED") => ({ state: s, frontPairStopped: false, retireRequested: false });
/** One refused call: the typed code, and nothing written. */
async function expectRefused(work: () => Promise<unknown>, code: string, message?: string): Promise<void> {
  const before = await eventCount();
  const error = await refusal(work());
  expect(codeOf(error), messageOf(error)).toBe(code);
  if (message !== undefined) expect(messageOf(error)).toBe(message);
  expect(await eventCount()).toBe(before);
}

describe("0123 §3: the release table, its state view and its serialized writers", () => {
  beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 240_000);
  afterAll(async () => { await database?.stop(); });

  it("no current release before the first switch", async () => {
    expect(await readCurrentRelease(database.pool)).toBeNull();
    expect(await state(A)).toBeNull();
    expect(await state("legacy")).toBeNull();
  });

  it("the first switch makes A current", async () => {
    const staged = await stage(A);
    expect(Object.isFrozen(staged)).toBe(true);
    expect(await state(A)).toEqual(live("STAGED"));
    const switched = await recordReleaseSwitch(database.pool, { newReleaseKey: A, expectedCurrent: null, takeTrafficFrom: T1, recordedBy: BY });
    expect(Object.isFrozen(switched)).toBe(true);
    expect(switched.eventSeq).toBeGreaterThan(staged.eventSeq);
    const current = await readCurrentRelease(database.pool);
    expect(current).toEqual({ releaseKey: A, takeTrafficFrom: T1 });
    expect(current?.takeTrafficFrom).toBeInstanceOf(Date);
    expect(Object.isFrozen(current)).toBe(true);
    const aState = await state(A);
    expect(aState).toEqual(live("CURRENT"));
    expect(Object.isFrozen(aState)).toBe(true);
  });

  it("a switch drains the old release in the same transaction", async () => {
    await stage(B);
    const { eventSeq } = await recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: A, takeTrafficFrom: T2, recordedBy: BY });
    expect(await state(A)).toEqual(live("DRAINING"));
    expect(await state(B)).toEqual(live("CURRENT"));
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: B, takeTrafficFrom: T2 });
    const rows = (await database.pool.query<{ event_seq: string; release_key: string; kind: string; take_traffic_from: Date | null; xmin: string }>(
      "SELECT event_seq::text, release_key, kind, take_traffic_from, xmin::text FROM core.release_event ORDER BY event_seq DESC LIMIT 2")).rows.reverse();
    expect(rows.map(({ release_key, kind, take_traffic_from }) => ({ release_key, kind, take_traffic_from })))
      .toEqual([{ release_key: B, kind: "CURRENT", take_traffic_from: T2 }, { release_key: A, kind: "DRAINING", take_traffic_from: null }]);
    expect(Number(rows[0]!.event_seq)).toBe(eventSeq);
    expect(Number(rows[1]!.event_seq)).toBe(eventSeq + 1);
    // One transaction wrote both rows.
    expect(rows[0]!.xmin).toBe(rows[1]!.xmin);
  });

  it("a stale expected current refuses and writes nothing", async () => {
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: A, takeTrafficFrom: T3, recordedBy: BY }),
      "RELEASE_SWITCH_CONFLICT");
    // NULL expected means "no current yet": also stale now.
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: null, takeTrafficFrom: T3, recordedBy: BY }),
      "RELEASE_SWITCH_CONFLICT");
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: B, takeTrafficFrom: T2 });
  });

  it("no third live release: A draining and B current refuse a switch to C until A is retired", async () => {
    await stage(C);
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: B, takeTrafficFrom: T3, recordedBy: BY }),
      "RELEASE_SWITCH_CONFLICT");
    await recordReleaseEvent(database.pool, { releaseKey: A, kind: "RETIRED", recordedBy: BY, reason: "DRAINED" });
    expect(await state(A)).toEqual(live("RETIRED"));
    await recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: B, takeTrafficFrom: T3, recordedBy: BY });
    expect(await state(C)).toEqual(live("CURRENT"));
    expect(await state(B)).toEqual(live("DRAINING"));
  });

  it("rollback: a draining release is staged again, then becomes current again (B current, C draining)", async () => {
    // Addendum item 4: a switch needs STAGED as the new release's latest state, so a draining release is re-staged first.
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: C, takeTrafficFrom: T4, recordedBy: BY }),
      "RELEASE_EVENT_INVALID");
    await stage(B); // addendum item 2: STAGED is accepted on a DRAINING release
    expect(await state(B)).toEqual(live("STAGED"));
    await recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: C, takeTrafficFrom: T4, recordedBy: BY });
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: B, takeTrafficFrom: T4 });
    expect(await state(C)).toEqual(live("DRAINING"));
  });

  it("flags belong to the latest epoch: set on draining C, clean after C is staged again and switched back (C current, B draining)", async () => {
    await recordReleaseEvent(database.pool, { releaseKey: C, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    expect(await state(C)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: false });
    await recordReleaseEvent(database.pool, { releaseKey: C, kind: "RETIRE_REQUESTED", recordedBy: BY });
    expect(await state(C)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: true });
    // Addendum item 1: a re-staged release starts clean.
    await stage(C);
    expect(await state(C)).toEqual(live("STAGED"));
    await recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: B, takeTrafficFrom: T5, recordedBy: BY });
    expect(await state(C)).toEqual(live("CURRENT"));
    expect(await state(B)).toEqual(live("DRAINING"));
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: C, takeTrafficFrom: T5 });
    // The view's take_traffic_from is the latest CURRENT event's, one row per key.
    const view = (await database.pool.query("SELECT release_key, state, current, take_traffic_from FROM core.release_state_v ORDER BY release_key")).rows;
    expect(view).toEqual([
      { release_key: A, state: "RETIRED", current: false, take_traffic_from: T1 },
      { release_key: B, state: "DRAINING", current: false, take_traffic_from: T4 },
      { release_key: C, state: "CURRENT", current: true, take_traffic_from: T5 }
    ]);
  });

  it("a staged release that never went current can stop its pair and retire, and a retired one is staged clean (D staged)", async () => {
    await stage(D);
    await recordReleaseEvent(database.pool, { releaseKey: D, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    expect(await state(D)).toEqual({ state: "STAGED", frontPairStopped: true, retireRequested: false });
    // Addendum item 3: RETIRED on a STAGED release that was never CURRENT.
    await recordReleaseEvent(database.pool, { releaseKey: D, kind: "RETIRED", recordedBy: BY, reason: "NOT_SWITCHED" });
    expect(await state(D)).toEqual({ state: "RETIRED", frontPairStopped: true, retireRequested: false });
    await stage(D);
    expect(await state(D)).toEqual(live("STAGED"));
    const reason = (await database.pool.query("SELECT reason FROM core.release_event WHERE release_key=$1 AND kind='RETIRED'", [D])).rows;
    expect(reason).toEqual([{ reason: "NOT_SWITCHED" }]);
  });

  it("a draining release staged again without a switch still drains: no third live release, no NOT_SWITCHED retirement (C current, B draining)", async () => {
    // A rollback that stages B again but never switches leaves B's drained debates running: B is still live.
    await stage(B);
    expect(await state(B)).toEqual(live("STAGED"));
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: D, expectedCurrent: C, takeTrafficFrom: T7, recordedBy: BY }),
      "RELEASE_SWITCH_CONFLICT");
    // Only the drain path may retire it, whatever the reason given.
    for (const reason of ["NOT_SWITCHED", "DRAINED"]) {
      await expectRefused(() => recordReleaseEvent(database.pool, { releaseKey: B, kind: "RETIRED", recordedBy: BY, reason }),
        "RELEASE_EVENT_INVALID");
    }
    // The loud way out: finish the rollback (B current, C draining), then switch back (C current, B draining). The
    // quiet one, DRAINING again, is the fresh database's "abandon the re-stage" case.
    await recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: C, takeTrafficFrom: T7, recordedBy: BY });
    expect(await state(C)).toEqual(live("DRAINING"));
    await stage(C);
    await recordReleaseSwitch(database.pool, { newReleaseKey: C, expectedCurrent: B, takeTrafficFrom: T8, recordedBy: BY });
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: C, takeTrafficFrom: T8 });
    expect(await state(B)).toEqual(live("DRAINING"));
  });

  it("refused transitions (C current, B draining, A retired, D staged)", async () => {
    const event = (releaseKey: string, kind: string, extra: Partial<{ recordedBy: string; reason: string }> = {}) =>
      () => recordReleaseEvent(database.pool, { releaseKey, kind: kind as "STAGED", recordedBy: BY, ...extra });
    await expectRefused(event(C, "RETIRED"), "RELEASE_EVENT_INVALID"); // RETIRED on the current release
    await expectRefused(event(D, "RETIRE_REQUESTED"), "RELEASE_EVENT_INVALID"); // RETIRE_REQUESTED on a STAGED release
    await expectRefused(event(A, "RETIRE_REQUESTED"), "RELEASE_EVENT_INVALID"); // ... and on a RETIRED one
    await expectRefused(event(C, "STAGED"), "RELEASE_EVENT_INVALID"); // STAGED on a CURRENT release
    await expectRefused(event(D, "STAGED"), "RELEASE_EVENT_INVALID"); // STAGED on a STAGED release
    await expectRefused(event(A, "RETIRED"), "RELEASE_EVENT_INVALID"); // RETIRED twice
    await expectRefused(event(C, "FRONT_PAIR_STOPPED"), "RELEASE_EVENT_INVALID"); // never on the current release
    await expectRefused(event(E, "FRONT_PAIR_STOPPED"), "RELEASE_EVENT_INVALID"); // nor on an unknown one
    await expectRefused(event(E, "RETIRED"), "RELEASE_EVENT_INVALID");
    for (const kind of ["CURRENT", "DRAINING", "BOGUS"]) await expectRefused(event(E, kind), "RELEASE_EVENT_INVALID");
    await expectRefused(event("legacy", "STAGED"), "RELEASE_EVENT_INVALID");
    await expectRefused(event("r0-aaaaaaaaaaaa", "STAGED"), "RELEASE_EVENT_INVALID");
    await expectRefused(event(E, "STAGED", { recordedBy: "   " }), "RELEASE_EVENT_INVALID");
    await expectRefused(event(E, "STAGED", { recordedBy: "x".repeat(129) }), "RELEASE_EVENT_INVALID");
    await expectRefused(event(E, "STAGED", { reason: "x".repeat(501) }), "RELEASE_EVENT_INVALID");
    const sw = (newReleaseKey: string, expectedCurrent: string | null) =>
      () => recordReleaseSwitch(database.pool, { newReleaseKey, expectedCurrent, takeTrafficFrom: T6, recordedBy: BY });
    await expectRefused(sw(E, C), "RELEASE_EVENT_INVALID"); // a never-staged key
    await expectRefused(sw(C, C), "RELEASE_EVENT_INVALID"); // the current release itself
    await expectRefused(sw(A, C), "RELEASE_EVENT_INVALID"); // a retired release (staged again first)
    await expectRefused(sw("legacy", C), "RELEASE_EVENT_INVALID");
    await expectRefused(() => database.pool.query("SELECT core.record_release_switch($1,$2,NULL,$3)", [D, C, BY]), "22023", "RELEASE_EVENT_INVALID");
    // The table's own CHECK refuses 'legacy' even from the migrator, who bypasses the writers.
    await expectRefused(() => database.pool.query(
      "INSERT INTO core.release_event(release_key,kind,recorded_by) VALUES ('legacy','STAGED',$1)", [BY]), "23514");
    await expectRefused(() => database.pool.query(
      "INSERT INTO core.release_event(release_key,kind,recorded_by) VALUES ($1,'STAGED',$2)", [E, " "]), "23514");
    await expectRefused(() => database.pool.query(
      "INSERT INTO core.release_event(release_key,kind,recorded_by,take_traffic_from) VALUES ($1,'STAGED',$2,now())", [E, BY]), "23514");
    // Both writers need READ COMMITTED: a snapshot older than the lock would read a stale current release.
    const client = await database.pool.connect();
    let clean = false;
    try {
      for (const call of [
        () => client.query("SELECT core.record_release_event($1,'STAGED',$2)", [E, BY]),
        () => client.query("SELECT core.record_release_switch($1,$2,now(),$3)", [D, C, BY])
      ]) {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const error = await refusal(call());
        await client.query("ROLLBACK");
        expect(messageOf(error)).toBe("RELEASE_EVENT_INVALID");
      }
      clean = true;
    } finally { client.release(!clean); } // a client left mid-transaction is destroyed, never pooled
    expect(await state(C)).toEqual(live("CURRENT"));
    expect(await state(E)).toBeNull();
  });

  it("the settings hook: without 0124's hook a non-NULL expected settings version refuses, a NULL one switches (D current, C draining)", async () => {
    await recordReleaseEvent(database.pool, { releaseKey: B, kind: "RETIRED", recordedBy: BY, reason: "DRAINED" });
    expect(await database.pool.query("SELECT to_regprocedure('register.release_switch_settings_hook(text,bigint)') AS hook"))
      .toMatchObject({ rows: [{ hook: null }] });
    const before = await eventCount();
    const error = await refusal(database.pool.query("SELECT core.record_release_switch($1,$2,$3,$4,5)", [D, C, T6, BY]));
    expect(messageOf(error)).toBe("SETTINGS_ACTIVATION_CONFLICT");
    expect(await eventCount()).toBe(before);
    // When 0124's hook exists, the switch calls it with its own arguments after the compare-and-swap (rolled back here).
    const client = await database.pool.connect();
    let clean = false;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE FUNCTION register.release_switch_settings_hook(p_new text, p_expected bigint) RETURNS void
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HOOK_SAW %/%', p_new, coalesce(p_expected::text, 'none'); END $$`);
      const hooked = await refusal(client.query("SELECT core.record_release_switch($1,$2,$3,$4,7)", [D, C, T6, BY]));
      expect(messageOf(hooked)).toBe(`HOOK_SAW ${D}/7`);
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query(`CREATE FUNCTION register.release_switch_settings_hook(p_new text, p_expected bigint) RETURNS void
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HOOK_SAW %/%', p_new, coalesce(p_expected::text, 'none'); END $$`);
      // A stale expected current refuses BEFORE the hook is reached.
      const stale = await refusal(client.query("SELECT core.record_release_switch($1,$2,$3,$4,7)", [D, B, T6, BY]));
      expect(messageOf(stale)).toBe("RELEASE_SWITCH_CONFLICT");
      await client.query("ROLLBACK");
      clean = true;
    } finally { client.release(!clean); }
    expect(await database.pool.query("SELECT to_regprocedure('register.release_switch_settings_hook(text,bigint)') AS hook"))
      .toMatchObject({ rows: [{ hook: null }] });
    const nulled = (await database.pool.query<{ seq: string }>("SELECT core.record_release_switch($1,$2,$3,$4,NULL)::text AS seq", [D, C, T6, BY])).rows[0]!;
    expect(Number(nulled.seq)).toBeGreaterThan(0);
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: D, takeTrafficFrom: T6 });
    expect(await state(C)).toEqual(live("DRAINING"));
  });

  it("append-only: UPDATE, DELETE and TRUNCATE core.release_event each reject", async () => {
    const before = await eventCount();
    for (const statement of [
      "UPDATE core.release_event SET reason = 'x'",
      "DELETE FROM core.release_event",
      "TRUNCATE core.release_event"
    ]) {
      const error = await refusal(database.pool.query(statement));
      expect(messageOf(error)).toMatch(/append-only|TRUNCATE_REJECTED/u);
    }
    expect(await eventCount()).toBe(before);
  });

  it("runtime reads, never writes; the operator writes, never reads the table", async () => {
    const client: PoolClient = await database.pool.connect();
    let clean = false;
    try {
      await client.query("SET ROLE debateai_runtime");
      expect(await readCurrentRelease(client)).toEqual({ releaseKey: D, takeTrafficFrom: T6 });
      expect(await readReleaseState(client, C)).toEqual(live("DRAINING"));
      for (const work of [
        () => recordReleaseSwitch(client, { newReleaseKey: E, expectedCurrent: D, takeTrafficFrom: T6, recordedBy: BY }),
        () => recordReleaseEvent(client, { releaseKey: E, kind: "STAGED", recordedBy: BY }),
        () => client.query("SELECT * FROM core.release_event"),
        () => client.query("SELECT * FROM core.release_state_v")
      ]) expect(codeOf(await refusal(work()))).toBe("42501");
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_release_operator");
      expect((await recordReleaseEvent(client, { releaseKey: E, kind: "STAGED", recordedBy: BY })).eventSeq).toBeGreaterThan(0);
      expect(codeOf(await refusal(client.query("SELECT * FROM core.release_event")))).toBe("42501");
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_release_operator");
      expect(codeOf(await refusal(readCurrentRelease(client)))).toBe("42501");
      await client.query("ROLLBACK");
      clean = true;
    } finally { client.release(!clean); } // a client left mid-transaction or under SET ROLE is destroyed, never pooled
    expect(await state(E)).toBeNull();
  });

  it("the roles and grants are exactly the brief's", async () => {
    const roles = (await database.pool.query(`
      SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname IN ('debateai_release_owner','debateai_release_operator') ORDER BY rolname`)).rows;
    expect(roles).toEqual(["debateai_release_operator", "debateai_release_owner"].map((rolname) => ({
      rolname, rolcanlogin: false, rolinherit: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false
    })));
    const functions = (await database.pool.query(`
      SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS definer, p.proconfig AS config,
        p.provolatile AS volatility,
        (SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM pg_roles r
          WHERE r.rolname LIKE 'debateai\\_%' AND NOT r.rolsuper AND r.oid <> p.proowner AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
            AND NOT pg_has_role(r.oid, 'debateai_runtime', 'MEMBER')) AS non_runtime_callers,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
        has_function_privilege('debateai_runtime', p.oid, 'EXECUTE') AS runtime_execute
      FROM pg_proc p WHERE p.oid IN ('core.read_current_release()'::regprocedure, 'core.read_release_state(text)'::regprocedure,
        'core.record_release_switch(text,text,timestamptz,text,bigint)'::regprocedure, 'core.record_release_event(text,text,text,text)'::regprocedure)
      ORDER BY 1`)).rows;
    expect(functions).toEqual([
      { signature: "core.read_current_release()", owner: "debateai_release_owner", definer: true, config: ["search_path=pg_catalog"], volatility: "s", non_runtime_callers: null, public_execute: false, runtime_execute: true },
      { signature: "core.read_release_state(text)", owner: "debateai_release_owner", definer: true, config: ["search_path=pg_catalog"], volatility: "s", non_runtime_callers: null, public_execute: false, runtime_execute: true },
      { signature: "core.record_release_event(text,text,text,text)", owner: "debateai_release_owner", definer: true, config: ["search_path=pg_catalog"], volatility: "v", non_runtime_callers: ["debateai_release_operator"], public_execute: false, runtime_execute: false },
      { signature: "core.record_release_switch(text,text,timestamp with time zone,text,bigint)", owner: "debateai_release_owner", definer: true, config: ["search_path=pg_catalog"], volatility: "v", non_runtime_callers: ["debateai_release_operator"], public_execute: false, runtime_execute: false }
    ]);
    // No application role reaches the table or the view directly; the owner holds SELECT, INSERT only.
    const reach = (await database.pool.query(`
      SELECT c.relname, r.rolname,
        has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select, has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
        has_table_privilege(r.oid, c.oid, 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS other
      FROM pg_class c CROSS JOIN pg_roles r
      WHERE c.oid IN ('core.release_event'::regclass, 'core.release_state_v'::regclass) AND r.rolname LIKE 'debateai\\_%' AND NOT r.rolsuper
        AND has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ORDER BY 1, 2`)).rows;
    expect(reach).toEqual([
      { relname: "release_event", rolname: "debateai_release_owner", can_select: true, can_insert: true, other: false },
      { relname: "release_state_v", rolname: "debateai_release_owner", can_select: true, can_insert: false, other: false }
    ]);
  });
});

describe("0123 §3 on a fresh database: the race, the whole drain path, abandoning a re-stage", () => {
  beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 240_000);
  afterAll(async () => { await database?.stop(); });

  it("two racing switches: exactly one wins", async () => {
    await stage(D);
    await stage(E);
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    let clean = false;
    try {
      // The first switch holds the lock in an open transaction; the second must wait for it, then see D current.
      await first.query("BEGIN");
      const firstSwitch = recordReleaseSwitch(first, { newReleaseKey: D, expectedCurrent: null, takeTrafficFrom: T1, recordedBy: BY });
      await firstSwitch;
      const secondPid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      const secondSwitch = recordReleaseSwitch(second, { newReleaseKey: E, expectedCurrent: null, takeTrafficFrom: T1, recordedBy: BY });
      const settled = Promise.allSettled([firstSwitch, secondSwitch]);
      for (let tries = 0; ; tries += 1) {
        const waiting = (await database.pool.query<{ n: number }>(
          "SELECT count(*)::int n FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted", [secondPid])).rows[0]!.n;
        if (waiting === 1) break;
        if (tries > 100) throw new Error("the second switch never waited on the release-switch lock");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await first.query("COMMIT");
      const outcomes = await settled;
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(codeOf(rejected[0]!.reason)).toBe("RELEASE_SWITCH_CONFLICT");
      clean = true;
    } finally {
      first.release(!clean);
      second.release(!clean);
    }
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: D, takeTrafficFrom: T1 });
    expect(await state(E)).toEqual(live("STAGED"));
    expect((await database.pool.query("SELECT count(*)::int n FROM core.release_event WHERE kind='CURRENT'")).rows[0].n).toBe(1);
  });

  it("the whole drain path: stage, current, draining, front pair stopped, retire requested, retired keeps both flags (E current, D retired)", async () => {
    await recordReleaseSwitch(database.pool, { newReleaseKey: E, expectedCurrent: D, takeTrafficFrom: T2, recordedBy: BY });
    expect(await state(D)).toEqual(live("DRAINING"));
    await recordReleaseEvent(database.pool, { releaseKey: D, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    await recordReleaseEvent(database.pool, { releaseKey: D, kind: "RETIRE_REQUESTED", recordedBy: BY });
    expect(await state(D)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: true });
    await recordReleaseEvent(database.pool, { releaseKey: D, kind: "RETIRED", recordedBy: BY, reason: "DRAINED" });
    expect(await state(D)).toEqual({ state: "RETIRED", frontPairStopped: true, retireRequested: true });
    expect((await database.pool.query("SELECT kind FROM core.release_event WHERE release_key=$1 ORDER BY event_seq", [D])).rows.map((row) => row.kind))
      .toEqual(["STAGED", "CURRENT", "DRAINING", "FRONT_PAIR_STOPPED", "RETIRE_REQUESTED", "RETIRED"]);
  });

  it("abandoning a re-stage: DRAINING again, flags clean, still live until the normal retirement path (B current, A draining, E retired)", async () => {
    await stage(A);
    await recordReleaseSwitch(database.pool, { newReleaseKey: A, expectedCurrent: E, takeTrafficFrom: T3, recordedBy: BY });
    await recordReleaseEvent(database.pool, { releaseKey: E, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    expect(await state(E)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: false });
    // A rollback stages E again, then is abandoned: E goes back to finishing its own debates, its flags clean.
    await stage(E);
    const drainingAgain = await recordReleaseEvent(database.pool, { releaseKey: E, kind: "DRAINING", recordedBy: BY, reason: "RESTAGE_ABANDONED" });
    expect(Object.isFrozen(drainingAgain)).toBe(true);
    expect(await state(E)).toEqual(live("DRAINING"));
    // Still live: no third release while E drains.
    await stage(B);
    await expectRefused(() => recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: A, takeTrafficFrom: T4, recordedBy: BY }),
      "RELEASE_SWITCH_CONFLICT");
    // The normal retirement path, counted from the new DRAINING event.
    await recordReleaseEvent(database.pool, { releaseKey: E, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    await recordReleaseEvent(database.pool, { releaseKey: E, kind: "RETIRE_REQUESTED", recordedBy: BY });
    expect(await state(E)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: true });
    await recordReleaseEvent(database.pool, { releaseKey: E, kind: "RETIRED", recordedBy: BY, reason: "DRAINED" });
    expect(await state(E)).toEqual({ state: "RETIRED", frontPairStopped: true, retireRequested: true });
    await recordReleaseSwitch(database.pool, { newReleaseKey: B, expectedCurrent: A, takeTrafficFrom: T4, recordedBy: BY });
    expect(await readCurrentRelease(database.pool)).toEqual({ releaseKey: B, takeTrafficFrom: T4 });
    expect(await state(A)).toEqual(live("DRAINING"));
  });

  it("DRAINING is refused for any release but a STAGED one that still drains (B current, A draining, C staged, D and E retired)", async () => {
    await stage(C); // never drained
    const draining = (releaseKey: string) => () =>
      recordReleaseEvent(database.pool, { releaseKey, kind: "DRAINING", recordedBy: BY });
    await expectRefused(draining(C), "RELEASE_EVENT_INVALID"); // a STAGED release that never drained
    await expectRefused(draining(B), "RELEASE_EVENT_INVALID"); // the CURRENT release
    await expectRefused(draining(E), "RELEASE_EVENT_INVALID"); // a RETIRED release
    await expectRefused(draining(A), "RELEASE_EVENT_INVALID"); // a release already DRAINING
    await expectRefused(draining(["r22", "ffffffffffff"].join("-")), "RELEASE_EVENT_INVALID"); // an unknown release
    // D drained, retired, then staged again: it no longer drains, so DRAINING is refused there too.
    await stage(D);
    await expectRefused(draining(D), "RELEASE_EVENT_INVALID");
    expect(await state(C)).toEqual(live("STAGED"));
    expect(await state(D)).toEqual(live("STAGED"));
  });

  // Final review A4: a draining release staged again for a rollback still runs its drained debates, yet reads STAGED.
  // The reader also answers still_draining (a DRAINING event with no later RETIRED event, record_release_event's own
  // test), so the API's per-send rule can tell it from a release that never drained. The TS reader keeps its three fields.
  it("the reader answers still_draining, kept through a re-stage until the release retires (B current, A draining, C and D staged, E retired)", async () => {
    const raw = async (key: string, client: Pick<PoolClient, "query"> = database.pool) => (await client.query(
      "SELECT state, retire_requested, still_draining FROM core.read_release_state($1)", [key])).rows;
    expect(await raw(B)).toEqual([{ state: "CURRENT", retire_requested: false, still_draining: false }]);
    expect(await raw(A)).toEqual([{ state: "DRAINING", retire_requested: false, still_draining: true }]);
    expect(await raw(C)).toEqual([{ state: "STAGED", retire_requested: false, still_draining: false }]); // never drained
    expect(await raw(D)).toEqual([{ state: "STAGED", retire_requested: false, still_draining: false }]); // drained, retired, staged
    expect(await raw(E)).toEqual([{ state: "RETIRED", retire_requested: true, still_draining: false }]);
    expect(await raw("legacy")).toEqual([]);
    // A rollback stages A again: its drained debates may still run, so it still drains.
    await stage(A);
    expect(await raw(A)).toEqual([{ state: "STAGED", retire_requested: false, still_draining: true }]);
    // The runtime reads it as the API's login does (EXECUTE on the definer, no grant on the table).
    const client: PoolClient = await database.pool.connect();
    let clean = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      expect(await raw(A, client)).toEqual([{ state: "STAGED", retire_requested: false, still_draining: true }]);
      await client.query("ROLLBACK");
      clean = true;
    } finally { client.release(!clean); }
    // Abandoning the re-stage, then the normal retirement path: it drains until RETIRED.
    await recordReleaseEvent(database.pool, { releaseKey: A, kind: "DRAINING", recordedBy: BY, reason: "RESTAGE_ABANDONED" });
    await recordReleaseEvent(database.pool, { releaseKey: A, kind: "RETIRE_REQUESTED", recordedBy: BY });
    expect(await raw(A)).toEqual([{ state: "DRAINING", retire_requested: true, still_draining: true }]);
    await recordReleaseEvent(database.pool, { releaseKey: A, kind: "RETIRED", recordedBy: BY, reason: "DRAINED" });
    expect(await raw(A)).toEqual([{ state: "RETIRED", retire_requested: true, still_draining: false }]);
    expect(await state(A)).toEqual({ state: "RETIRED", frontPairStopped: false, retireRequested: true });
  });
});
