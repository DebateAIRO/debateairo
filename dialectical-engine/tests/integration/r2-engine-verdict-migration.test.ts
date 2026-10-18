// tests/integration/r2-engine-verdict-migration.test.ts
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/** Engine redesign R2 (INTERFACE §8.7, §9.5-§9.7, §14): migration 0121 in a real database. Run alone. */
let database: TestDatabase;
beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); }, 600_000);
afterAll(async () => { await database?.stop(); });

const TABLES = ["ledger.point_investigation", "ledger.verdict_vote"] as const;

/** What 0121 sets: its tables' constraints and triggers, its four functions, and the four CHECKs it re-adds. */
async function catalog(): Promise<readonly unknown[]> {
  return (await database.pool.query(`
    SELECT c.conrelid::regclass::text AS relation, c.conname::text AS name, pg_get_constraintdef(c.oid) AS definition, c.convalidated AS live
      FROM pg_constraint AS c
     WHERE c.conrelid IN ('ledger.point_investigation'::regclass, 'ledger.verdict_vote'::regclass)
        OR (c.conrelid, c.conname) IN (('serve.answer'::regclass, 'answer_verdict_state_check'),
          ('serve.serve_disclosure'::regclass, 'serve_disclosure_floor_verdict_state_check'),
          ('serve.condition_mark'::regclass, 'condition_mark_served_root_rule_rule_check'),
          ('serve.condition_mark'::regclass, 'condition_mark_review_outcome_check'))
    UNION ALL
    SELECT t.tgrelid::regclass::text, t.tgname::text, pg_get_triggerdef(t.oid), t.tgenabled <> 'D'
      FROM pg_trigger AS t
     WHERE t.tgrelid IN ('ledger.point_investigation'::regclass, 'ledger.verdict_vote'::regclass) AND NOT t.tgisinternal
    UNION ALL
    SELECT p.oid::regprocedure::text, p.proname::text, md5(pg_get_functiondef(p.oid)), p.prosecdef
      FROM pg_proc AS p
     WHERE p.proname IN ('enforce_content_ciphertext_point_investigation', 'enforce_content_attestation_v2_point_investigation',
                         'enforce_content_ciphertext_verdict_vote', 'enforce_content_attestation_v2_verdict_vote')
     ORDER BY 1, 2`)).rows;
}

describe("migration 0121 — the engine verdict", () => {
  it.each([
    ["serve.answer", "CONTESTED", "answer_verdict_state_check", ["'SUPPORTED'", "'CONTESTED'", "'UNSUPPORTED'", "'SPLIT'"]],
    ["serve.serve_disclosure", "CONTESTED", "serve_disclosure_floor_verdict_state_check", ["'SUPPORTED'", "'CONTESTED'", "'UNSUPPORTED'", "'SPLIT'"]],
    ["serve.condition_mark", "max-propagated-strength-lexicographic-tiebreak", "condition_mark_served_root_rule_rule_check",
      ["'max-propagated-strength-lexicographic-tiebreak'", "'comparing-judges-votes-honest-strength-tiebreak'", "'first-configured-provider'"]],
    ["serve.condition_mark", "cannot-assess", "condition_mark_review_outcome_check",
      ["'HIDDEN-UNJUDGEABLE'", "'DERIVED-STANDING-UNREVIEWED'", "'UNASSESSED-AT-REDUCED-WEIGHT'", "'cannot-assess'"]]
  ] as const)("%s has ONE CHECK listing %s, named %s, validated, every old value kept and the new one added", async (table, needle, name, values) => {
    const rows = (await database.pool.query<{ name: string; definition: string; validated: boolean }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition, convalidated AS validated FROM pg_constraint
        WHERE conrelid = $1::regclass AND contype = 'c' AND strpos(pg_get_constraintdef(oid), $2) > 0`, [table, needle])).rows;
    expect(rows.map((row) => row.name)).toEqual([name]);
    expect(rows[0]!.validated).toBe(true);
    for (const value of values) expect(rows[0]!.definition).toContain(value);
  });

  it.each(TABLES)("%s: the runtime reads and inserts, the replay role reads, nobody changes a row", async (table) => {
    const can = async (role: string, privilege: string): Promise<boolean> => (await database.pool.query<{ ok: boolean }>(
      "SELECT has_table_privilege($1, $2, $3) AS ok", [role, table, privilege])).rows[0]!.ok;
    expect(await can("debateai_runtime", "SELECT")).toBe(true);
    expect(await can("debateai_runtime", "INSERT")).toBe(true);
    for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) expect(await can("debateai_runtime", privilege), privilege).toBe(false);
    expect(await can("debateai_replay", "SELECT")).toBe(true);
    expect(await can("debateai_replay", "INSERT")).toBe(false);
  });

  it("applied again, the file changes nothing", async () => {
    const before = await catalog();
    expect(before.length).toBeGreaterThan(0);
    await database.pool.query(await readFile("migrations/0121_engine_verdict.sql", "utf8"));
    expect(await catalog()).toEqual(before);
  });
});
