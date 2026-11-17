// tests/integration/erased-owner-unlinked-0177.test.ts
// Migration 0177 (once an account is erased, nothing kept beside a debate names its owner reference) on real PostgreSQL: what the seven
// guarded tables still refuse, the one change they allow and when, and what deleting an account row does to the rows that name it. Data is made up.
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** The guarded tables, the column that holds the reference and what stands before it there. */
const GUARDED = [
  ["core.run", "asker_id", "owner:"], ["core.run_ownership_event", "owner_ref", ""], ["core.legacy_run_claim", "owner_ref", ""],
  ["memory.question_key", "asker_scope", "owner:"], ["memory.pull_record", "asker_scope", "owner:"],
  ["memory.memory_link_event", "actor_ref", "asker:owner:"], ["billing.run_charge_scope", "owner_ref", ""]
] as const;
let database: TestDatabase;
const owners: StoryEncryptedOwner[] = [];
/** One pool per account: a pool carries one account's content cipher. */
const accountPools: Pool[] = [];

type Seeded = Readonly<{ who: StoryEncryptedOwner; runs: readonly [string, string]; entitlementEventId: string }>;

/** Statements on one connection inside a transaction that is rolled back: what a refusal leaves behind is nothing. */
async function rolledBack<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    return await work(client);
  } finally { await client.query("ROLLBACK"); client.release(); }
}
const refusal = async (work: Promise<unknown>): Promise<string> =>
  work.then(() => "ALLOWED", (error: unknown) => `${(error as { code?: string }).code}:${(error as Error).message.split(":")[0]}`);

/**
 * An account with two debates and, beside each, every row that names an owner reference: the ownership record and the run (written with the
 * run), the usage row admission writes, and seeded as the memory step and the legacy claim write them, a question key, a memory link from the
 * second debate to the first with its pull record and the person's unlink, and a legacy claim.
 */
async function accountWithEveryRow(): Promise<Seeded> {
  const pool = new Pool({ connectionString: database.connectionString, max: 2 });
  accountPools.push(pool);
  const who = await provisionStoryEncryptedOwner(pool);
  owners.push(who);
  const runs = [await createEncryptedStoryRun(pool, who, "first question"), await createEncryptedStoryRun(pool, who, "second question")] as const;
  const entitlementEventId = randomUUID();
  await database.pool.query(`INSERT INTO billing.entitlement_event (event_id,owner_ref,plan_id,effective_at,period_anchor_at,cause,subscription_id,month_credit_override_micros,paid_through)
    VALUES ($1,$2,'FREE',now(),now(),'SIGNED_UP_FREE',NULL,NULL,NULL)`, [entitlementEventId, who.ownerRef]);
  for (const run of runs) await database.pool.query(
    "INSERT INTO billing.run_charge_scope (run_id,owner_ref,plan_id,entitlement_event_id,admitted_at) VALUES ($1,$2,'FREE',$3,now())", [run, who.ownerRef, entitlementEventId]);
  const linkId = randomUUID();
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    // Seeded past the writers' own checks (sealed content, the legacy cut-over list): this file is about the owner columns only.
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const run of runs) await seed.query(`INSERT INTO memory.question_key (question_key_id,run_id,canonical_question_text,caller_scope,asker_scope,normalized_binding,frozen_terms,as_of,policy_version,key_version,at_seq)
      VALUES ($1,$2,'sealed','ASKER',$3,'{}'::jsonb,'[]'::jsonb,now(),1,1,ledger.allocate_sequence())`, [randomUUID(), run, `owner:${who.ownerRef}`]);
    await seed.query(`INSERT INTO memory.memory_link (memory_link_id,source_run_id,prior_run_id,relation,match_tier,agreed_fields,disagreed_fields,not_compared_fields,decided_by,decided_at,
        source_as_of,prior_as_of,source_policy_version,prior_policy_version,source_key_version,prior_key_version,alias_row_ids,prior_answer_id,at_seq)
      VALUES ($1,$2,$3,'REPEATS','EXACT_QUESTION','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'memory:database-predicate',now(),now(),now(),1,1,1,1,'[]'::jsonb,$4,ledger.allocate_sequence())`,
      [linkId, runs[1], runs[0], randomUUID()]);
    await seed.query("INSERT INTO memory.memory_link_event (memory_link_id,state,actor_ref,reason,at_seq) VALUES ($1,'UNLINKED',$2,'ASKER_UNLINK',ledger.allocate_sequence())",
      [linkId, `asker:owner:${who.ownerRef}`]);
    await seed.query(`INSERT INTO memory.pull_record (pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,artifact_as_of,staleness_state_at_pull,asker_scope,
        payload_snapshot,register_row_key,register_version,register_source_ref,at_seq)
      VALUES ($1,$2,'PRIOR_ANSWER','answer',1,$3,now(),'FRESH',$4,'{}'::jsonb,'row',1,'source',ledger.allocate_sequence())`, [randomUUID(), linkId, "a".repeat(64), `owner:${who.ownerRef}`]);
    await seed.query("INSERT INTO core.legacy_run_claim (run_id,owner_ref,claimed_at,audit_id) VALUES ($1,$2,now(),$3)", [runs[0], who.ownerRef, randomUUID()]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  return { who, runs: [runs[0], runs[1]], entitlementEventId };
}

/** How many rows of each guarded table hold `reference` in their owner column. */
async function rowsNaming(reference: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, column, prefix] of GUARDED) {
    counts[table] = (await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}::text = $1`, [`${prefix}${reference}`])).rows[0]!.n;
  }
  return counts;
}
/** The account row goes as the erasure's last step deletes it; what hangs off it by foreign key goes with it. */
const deleteAccount = (who: StoryEncryptedOwner) => database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [who.userId]);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, timeout);

afterAll(async () => {
  for (const owner of owners) await releaseStoryEncryptedOwner(owner);
  for (const pool of accountPools) await pool.end();
  await database?.stop();
});

describe("0177: an erased account's owner reference leaves its debates", () => {
  it("still refuses every change of the seven tables, for the tables' owner too: an UPDATE of any column, a DELETE, the flag set by hand while the account exists", async () => {
    const { who } = await accountWithEveryRow();
    const fresh = randomUUID();
    for (const [table, column, prefix] of GUARDED) {
      // The usage row's one change is its two columns together.
      const also = table === "billing.run_charge_scope" ? `, entitlement_event_id = '${randomUUID()}'` : "";
      // As before the step: no flag, no change.
      expect(await rolledBack((client) => refusal(client.query(`UPDATE ${table} SET ${column} = $1${also} WHERE ${column}::text = $2`, [`${prefix}${fresh}`, `${prefix}${who.ownerRef}`]))), table)
        .toBe(`55000:append-only or immutable table ${table.split(".")[1]} rejects UPDATE`);
      expect(await rolledBack((client) => refusal(client.query(`DELETE FROM ${table} WHERE ${column}::text = $1`, [`${prefix}${who.ownerRef}`]))), table)
        .toBe(`55000:append-only or immutable table ${table.split(".")[1]} rejects DELETE`);
      // The flag alone opens nothing while an account holds the reference, and never opens a DELETE.
      expect(await rolledBack(async (client) => {
        await client.query("SET LOCAL debateai.erased_owner_unlink = 'on'");
        return refusal(client.query(`UPDATE ${table} SET ${column} = $1${also} WHERE ${column}::text = $2`, [`${prefix}${fresh}`, `${prefix}${who.ownerRef}`]));
      }), table).toBe("55000:ERASED_OWNER_ACCOUNT_EXISTS");
      expect(await rolledBack(async (client) => {
        await client.query("SET LOCAL debateai.erased_owner_unlink = 'on'");
        return refusal(client.query(`DELETE FROM ${table} WHERE ${column}::text = $1`, [`${prefix}${who.ownerRef}`]));
      }), table).toBe(`55000:append-only or immutable table ${table.split(".")[1]} rejects DELETE`);
    }
    expect(await rowsNaming(who.ownerRef)).toEqual({ "core.run": 2, "core.run_ownership_event": 2, "core.legacy_run_claim": 1, "memory.question_key": 2,
      "memory.pull_record": 1, "memory.memory_link_event": 1, "billing.run_charge_scope": 2 });
  }, timeout);

  it("no role but the tables' owner may UPDATE them, so the flag is nothing in another role's hands", async () => {
    const roles = (await database.pool.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname LIKE 'debateai\\_%' ORDER BY rolname")).rows.map((row) => row.rolname);
    expect(roles).toContain("debateai_runtime");
    expect(roles).toContain("debateai_erasure_runtime");
    for (const [table, column] of GUARDED) {
      const allowed = (await database.pool.query<{ rolname: string }>(`
        SELECT rolname FROM unnest($1::text[]) AS rolname
        WHERE has_table_privilege(rolname,$2,'UPDATE') OR has_column_privilege(rolname,$2,$3,'UPDATE')`, [roles, table, column])).rows;
      expect(allowed, table).toEqual([]);
    }
    for (const signature of ["core.reject_mutation_except_erased_owner()", "billing.reject_charge_scope_mutation()",
      "billing.reject_charge_scope_update_except_erased_owner()", "identity.unlink_erased_owner_runs()"]) {
      expect((await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM unnest($1::text[]) AS rolname WHERE has_function_privilege(rolname,$2,'EXECUTE')", [roles, signature])).rows[0]!.n, signature).toBe(0);
      expect((await database.pool.query<{ open: boolean }>("SELECT has_function_privilege('public',$1,'EXECUTE') AS open", [signature])).rows[0]!.open, signature).toBe(false);
    }
  }, timeout);

  it("when the account row is deleted, each of its debates gets one new reference in all of its rows, and another account's rows are as they were", async () => {
    const ana = await accountWithEveryRow();
    const ben = await accountWithEveryRow();
    const benBefore = await rowsNaming(ben.who.ownerRef);
    await deleteAccount(ana.who);
    expect(Object.values(await rowsNaming(ana.who.ownerRef)).reduce((sum, n) => sum + n, 0)).toBe(0);
    expect(await rowsNaming(ben.who.ownerRef)).toEqual(benBefore);
    const references: string[] = [];
    for (const run of ana.runs) {
      const row = (await database.pool.query<{ asker_id: string; event_owner: string; key_scope: string; scope_owner: string; scope_event: string; plan_id: string }>(`
        SELECT run.asker_id, event.owner_ref::text AS event_owner, key.asker_scope AS key_scope, scope.owner_ref::text AS scope_owner,
          scope.entitlement_event_id::text AS scope_event, scope.plan_id
        FROM core.run AS run JOIN core.run_ownership_event AS event USING (run_id) JOIN memory.question_key AS key USING (run_id)
          JOIN billing.run_charge_scope AS scope USING (run_id) WHERE run.run_id = $1`, [run])).rows;
      expect(row).toHaveLength(1);
      const reference = row[0]!.event_owner;
      expect(reference).toMatch(V4);
      // One value for the debate, on the run, its ownership record, its question key and its usage row; the plan stays.
      expect(row[0]).toMatchObject({ asker_id: `owner:${reference}`, key_scope: `owner:${reference}`, scope_owner: reference, plan_id: "FREE" });
      // The usage row's entitlement event id is new and points at nothing.
      expect(row[0]!.scope_event).toMatch(V4);
      expect(row[0]!.scope_event).not.toBe(ana.entitlementEventId);
      expect((await database.pool.query("SELECT 1 FROM billing.entitlement_event WHERE event_id = $1", [row[0]!.scope_event])).rowCount).toBe(0);
      references.push(reference, row[0]!.scope_event);
    }
    const claim = (await database.pool.query<{ owner_ref: string }>("SELECT owner_ref::text FROM core.legacy_run_claim WHERE run_id = $1", [ana.runs[0]])).rows[0]!.owner_ref;
    expect(claim).toBe(references[0]);
    // The rows that hang off the memory link: each a new reference, in the shape its column had.
    const pull = (await database.pool.query<{ asker_scope: string }>(
      "SELECT pull.asker_scope FROM memory.pull_record AS pull JOIN memory.memory_link AS link USING (memory_link_id) WHERE link.source_run_id = $1", [ana.runs[1]])).rows[0]!.asker_scope;
    const unlink = (await database.pool.query<{ actor_ref: string }>(
      "SELECT event.actor_ref FROM memory.memory_link_event AS event JOIN memory.memory_link AS link USING (memory_link_id) WHERE link.source_run_id = $1", [ana.runs[1]])).rows[0]!.actor_ref;
    expect(pull.startsWith("owner:") && V4.test(pull.slice(6))).toBe(true);
    expect(unlink.startsWith("asker:owner:") && V4.test(unlink.slice(12))).toBe(true);
    references.push(pull.slice(6), unlink.slice(12));
    // No two of them are the same value, none is the account's, none is an account.
    expect(new Set([...references, ana.who.ownerRef, ana.entitlementEventId]).size).toBe(references.length + 2);
    expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE owner_ref::text = ANY($1::text[])', [references])).rowCount).toBe(0);
    // The records kept for the law are as they were: the entitlement event keeps the account's reference, and the closure is recorded under it.
    expect((await database.pool.query("SELECT 1 FROM billing.entitlement_event WHERE event_id = $1 AND owner_ref = $2", [ana.entitlementEventId, ana.who.ownerRef])).rowCount).toBe(1);
    expect((await database.pool.query("SELECT 1 FROM legal.account_closure WHERE owner_ref = $1", [ana.who.ownerRef])).rowCount).toBe(1);
    // Nobody owns the debates, the new reference included.
    expect((await database.pool.query<{ owned: boolean }>("SELECT core.run_is_owned_by($1,$2,NULL) AS owned", [ana.runs[0], references[0]])).rows[0]!.owned).toBe(false);
  }, timeout);

  it("with the account gone, the flag opens only the owner column, only to a new reference no account holds", async () => {
    const gone = await accountWithEveryRow();
    const stays = await accountWithEveryRow();
    await deleteAccount(gone.who);
    const current = (await database.pool.query<{ owner_ref: string }>("SELECT owner_ref::text FROM core.run_ownership_event WHERE run_id = $1", [gone.runs[0]])).rows[0]!.owner_ref;
    const flagged = <T>(work: (client: PoolClient) => Promise<T>) => rolledBack(async (client) => {
      await client.query("SET LOCAL debateai.erased_owner_unlink = 'on'");
      return work(client);
    });
    // Another column with it, or instead of it.
    expect(await flagged((client) => refusal(client.query("UPDATE core.run SET question_line = 'changed' WHERE run_id = $1", [gone.runs[0]])))).toBe("55000:ERASED_OWNER_ONLY");
    expect(await flagged((client) => refusal(client.query("UPDATE core.run_ownership_event SET owner_ref = $2, at_seq = at_seq + 1000000 WHERE run_id = $1", [gone.runs[0], randomUUID()]))))
      .toBe("55000:ERASED_OWNER_ONLY");
    expect(await flagged((client) => refusal(client.query("UPDATE billing.run_charge_scope SET owner_ref = $2, entitlement_event_id = $3, plan_id = 'MAX' WHERE run_id = $1",
      [gone.runs[0], randomUUID(), randomUUID()])))).toBe("55000:ERASED_OWNER_ONLY");
    // To an account that exists, to something that is no reference, to the same value.
    expect(await flagged((client) => refusal(client.query("UPDATE core.run_ownership_event SET owner_ref = $2 WHERE run_id = $1", [gone.runs[0], stays.who.ownerRef]))))
      .toBe("55000:ERASED_OWNER_ACCOUNT_EXISTS");
    expect(await flagged((client) => refusal(client.query("UPDATE core.run SET asker_id = 'someone' WHERE run_id = $1", [gone.runs[0]])))).toBe("55000:ERASED_OWNER_SHAPE");
    expect(await flagged((client) => refusal(client.query("UPDATE core.run SET asker_id = $2 WHERE run_id = $1", [gone.runs[0], `owner:${stays.who.ownerRef}`]))))
      .toBe("55000:ERASED_OWNER_ACCOUNT_EXISTS");
    // The usage row: the owner reference alone, or an entitlement event id that names an event.
    expect(await flagged((client) => refusal(client.query("UPDATE billing.run_charge_scope SET owner_ref = $2 WHERE run_id = $1", [gone.runs[0], randomUUID()]))))
      .toBe("55000:ERASED_OWNER_SHAPE");
    expect(await flagged((client) => refusal(client.query("UPDATE billing.run_charge_scope SET owner_ref = $2, entitlement_event_id = $3 WHERE run_id = $1",
      [gone.runs[0], randomUUID(), stays.entitlementEventId])))).toBe("55000:ERASED_OWNER_ENTITLEMENT_EXISTS");
    // The one change, as the trigger makes it.
    expect(await flagged((client) => refusal(client.query("UPDATE core.run_ownership_event SET owner_ref = $2 WHERE run_id = $1", [gone.runs[0], randomUUID()])))).toBe("ALLOWED");
    // Rolled back each time: the reference the deletion gave is still there.
    expect((await database.pool.query<{ owner_ref: string }>("SELECT owner_ref::text FROM core.run_ownership_event WHERE run_id = $1", [gone.runs[0]])).rows[0]!.owner_ref).toBe(current);
  }, timeout);

  it("the ten-year purge still deletes a usage row, and nothing else does", async () => {
    const { who, runs } = await accountWithEveryRow();
    await deleteAccount(who);
    expect(await rolledBack((client) => refusal(client.query("DELETE FROM billing.run_charge_scope WHERE run_id = $1", [runs[0]]))))
      .toBe("55000:append-only or immutable table run_charge_scope rejects DELETE");
    expect(await rolledBack(async (client) => {
      await client.query("SET LOCAL debateai.retention_purge = 'on'");
      return (await client.query("DELETE FROM billing.run_charge_scope WHERE run_id = $1", [runs[0]])).rowCount;
    })).toBe(1);
  }, timeout);
});
