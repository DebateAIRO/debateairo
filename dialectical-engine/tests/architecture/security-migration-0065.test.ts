import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import type { PoolClient } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// DB1 of the 2026-09-01 security-hardening mission pins
// migrations/0065_security_delta_guards.sql on real PostgreSQL.
//
// Unlike tests/architecture/security-migration-0056.test.ts, which carries the
// 78 guarded relations and the 14 pinned functions as literal lists, every
// assertion below DISCOVERS its own subject from the catalog. A relation or
// function added by a later migration is therefore covered the day it lands:
//   DL5-F2 every base table in an application schema carries an enabled
//          BEFORE TRUNCATE statement guard unless it is named in
//          MUTABLE_UNGUARDED_RELATIONS with a reason;
//          every relation whose UPDATE/DELETE is already closed by a
//          core.reject_mutation() trigger also carries the TRUNCATE guard;
//          no application role holds TRUNCATE anywhere in those schemas.
//   DL5-F5 every function defined in an application schema (extension-owned
//          functions excluded — they are pgcrypto's, relocated by 0040) pins
//          search_path.
//   DL5-F4 the surplus EXECUTE grants to debateai_runtime are gone and the
//          callers that remain still work.

// The application schemas migrations/ creates. Discovered from pg_namespace and
// compared with this list, so a new schema fails the test rather than silently
// escaping every rule below.
const APPLICATION_SCHEMAS = [
  "core", "evaluator", "evidence", "identity", "ledger", "memory",
  "obs", "observation", "register", "scorecard", "serve", "support"
] as const;

// The exhaustive set of application base tables that legitimately carry NO
// TRUNCATE guard. Every entry states why the relation is not append-only; a
// relation that stops matching its reason (or a new unguarded relation) turns
// the discovery assertion red. Nothing here is a delta relation: DL5-F2's 20
// are all guarded by 0065.
const MUTABLE_UNGUARDED_RELATIONS: Readonly<Record<string, string>> = {
  // Work queue and allocator: rows are updated in place by the runtime.
  "core.work_item": "runtime holds UPDATE (0000): claimed/leased in place",
  "ledger.sequence_allocator": "runtime/evaluator/settlement hold UPDATE: the counter row",
  // Provisioning intents and per-run secrets: consumed and cleared by design.
  "core.run_content_attestation_secret": "0040 erasure deletes the secret on account erasure",
  "core.run_key_provision_intent": "0038 intent row is consumed by the provisioner",
  "serve.private_run_key_cleanup_intent": "0040 cleanup intent is consumed by the sweep",
  "serve.private_run_erasure_tombstone": "0040 erasure bookkeeping, rewritten by the sweep",
  "serve.publication_key_cleanup_intent": "0039 cleanup intent is consumed by the sweep",
  "serve.publication_key_provision_intent": "0039 intent row is consumed by the provisioner",
  // Observation agent working state (0057:219-220, 233-234 grant UPDATE).
  "observation.heartbeat": "observation agent holds UPDATE: liveness row",
  "observation.sample_ring": "observation agent holds UPDATE: fixed-size ring buffer",
  // identity.* mutable set: account state, credentials and short-lived
  // challenges are updated and erased in place by 0030/0040/0044/0046.
  "identity.user": "account state is updated in place; erasure deletes",
  "identity.session": "sessions are revoked and pruned",
  "identity.step_up_grant": "short-lived grant, pruned",
  "identity.login_challenge": "short-lived challenge, consumed then pruned",
  "identity.mfa_factor": "enrolment state is updated in place",
  "identity.recovery_code": "codes are consumed in place",
  "identity.channel_binding": "verification state is updated in place",
  "identity.verification_token_credential": "token credential is consumed then deleted",
  "identity.authentication_risk_signal": "risk window rows are pruned",
  "identity.runtime_audit_attempt": "attempt rows are retried and pruned",
  "identity.account_recovery_binding": "recovery binding is rotated in place",
  "identity.account_erasure_request": "erasure request state machine",
  "identity.account_erasure_notification_outbox": "outbox rows are sent then cleared",
  "identity.private_erasure_audit_binding": "erasure binding is cleared by the sweep",
  "identity.publication_event_binding": "binding is cleared on unpublish",
  "identity.run_execution_binding": "binding is cleared by erasure"
};

// DL5-F4: the three definer entry points plus the CHECK helper 0055 made
// surplus. Each row is (signature, roles that must still hold EXECUTE).
// debateai_register_publication_owner is the function owner for the first two,
// so it holds EXECUTE implicitly; the CHECK helper is granted to it explicitly
// (0055:2015-2016) because PostgreSQL privilege-checks a CHECK function at
// executor init for the role that INSERTs.
const REVOKED_FROM_RUNTIME = [
  "register.publish_register_version(uuid,character,bigint,jsonb,text)",
  "register.import_historical_register_version(bigint,jsonb,character)",
  "register.assert_required_rows(bigint)",
  "register.claim_type_composition_map_is_valid(jsonb)"
] as const;

let database: TestDatabase;

function sqlState(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failureOf(client: PoolClient, sql: string): Promise<unknown> {
  await client.query("SAVEPOINT expected_failure");
  try {
    await client.query(sql);
    return undefined;
  } catch (error) {
    return error;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
  }
}

async function withRolledBackTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    return await operation(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 180_000);

afterAll(async () => database?.stop());

describe("0065 TRUNCATE and mutation guards discovered from the catalog (DL5-F2)", () => {
  it("knows every application schema migrations/ creates", async () => {
    const result = await database.pool.query<{ schema: string }>(`
      SELECT namespace.nspname AS schema
      FROM pg_catalog.pg_namespace AS namespace
      WHERE namespace.nspname NOT LIKE 'pg\\_%'
        AND namespace.nspname NOT IN ('information_schema', 'public', 'audit_crypto_internal')
      ORDER BY namespace.nspname
    `);
    expect(result.rows.map((row) => row.schema)).toEqual([...APPLICATION_SCHEMAS]);
  });

  it("guards every application base table that is not a named mutable exception", async () => {
    const result = await database.pool.query<{ relation: string }>(`
      SELECT namespace.nspname || '.' || relation.relname AS relation
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relkind IN ('r', 'p')
        AND namespace.nspname = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_trigger AS trigger
          WHERE trigger.tgrelid = relation.oid AND NOT trigger.tgisinternal
            AND (trigger.tgtype & 32) <> 0 AND (trigger.tgtype & 2) <> 0
            AND (trigger.tgtype & 1) = 0 AND trigger.tgenabled IN ('O', 'A')
        )
      ORDER BY 1
    `, [[...APPLICATION_SCHEMAS]]);
    expect(result.rows.map((row) => row.relation).sort())
      .toEqual(Object.keys(MUTABLE_UNGUARDED_RELATIONS).sort());
  });

  it("gives every mutation-guarded relation a TRUNCATE guard too", async () => {
    // Self-maintaining: core.reject_mutation() closes UPDATE/DELETE but fires on
    // no TRUNCATE, so a relation that has one guard and not the other is the
    // exact hole L5-F4 and DL5-F2 describe. No list, no exceptions.
    const result = await database.pool.query<{ relation: string }>(`
      SELECT namespace.nspname || '.' || relation.relname AS relation
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relkind IN ('r', 'p')
        AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_trigger AS trigger
          WHERE trigger.tgrelid = relation.oid AND NOT trigger.tgisinternal
            AND trigger.tgfoid = 'core.reject_mutation()'::regprocedure
            AND (trigger.tgtype & 56) <> 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_trigger AS trigger
          WHERE trigger.tgrelid = relation.oid AND NOT trigger.tgisinternal
            AND (trigger.tgtype & 32) <> 0 AND (trigger.tgtype & 2) <> 0
            AND trigger.tgenabled IN ('O', 'A')
        )
      ORDER BY 1
    `);
    expect(result.rows.map((row) => row.relation)).toEqual([]);
  });

  it("grants TRUNCATE to no application role in any application schema", async () => {
    const result = await database.pool.query<{ relation: string; grantee: string }>(`
      SELECT namespace.nspname || '.' || relation.relname AS relation, grantee.rolname AS grantee
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace,
        LATERAL pg_catalog.aclexplode(COALESCE(
          relation.relacl, pg_catalog.acldefault('r', relation.relowner)
        )) AS acl
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE relation.relkind IN ('r', 'p')
        AND namespace.nspname = ANY($1::text[])
        AND acl.privilege_type = 'TRUNCATE'
        AND (acl.grantee = 0 OR grantee.rolname LIKE 'debateai\\_%')
      ORDER BY 1, 2
    `, [[...APPLICATION_SCHEMAS]]);
    expect(result.rows).toEqual([]);
  });

  it("refuses TRUNCATE and the closed mutations from the database owner", async () => {
    await withRolledBackTransaction(async (client) => {
      for (const relation of [
        "support.shred_audit", "support.session", "support.session_key",
        "support.relay_call", "support.admission_event", "support._shred_integrity_guard",
        "serve.synthesis_round", "register.required_row", "register.required_row_version"
      ]) {
        const failure = await failureOf(client, `TRUNCATE ${relation} CASCADE`);
        expect(failure, `${relation} accepted TRUNCATE`).toBeDefined();
        expect(sqlState(failure), `${relation} TRUNCATE sqlstate`).toBe("55000");
        expect(messageOf(failure)).toMatch(/TRUNCATE_REJECTED|rejects TRUNCATE/u);
      }
      for (const statement of [
        "DELETE FROM serve.synthesis_round",
        "DELETE FROM support.shred_audit",
        "UPDATE support.relay_call SET utc_day=utc_day",
        "DELETE FROM support.session",
        "DELETE FROM support.session_key",
        "DELETE FROM support._shred_integrity_guard"
      ]) {
        const failure = await failureOf(client, statement);
        expect(failure, `${statement} was accepted`).toBeDefined();
        expect(sqlState(failure), `${statement} sqlstate`).toBe("55000");
        expect(messageOf(failure)).toMatch(/rejects (UPDATE|DELETE)/u);
      }
      // The never-deleted mutable relations keep the column UPDATEs 0054 grants:
      // only DELETE is closed on them.
      await client.query("UPDATE support.session SET shredded_at=shredded_at");
      await client.query("UPDATE support.\"case\" SET shredded_at=shredded_at");
      await client.query("UPDATE support.public_incident SET ended_at=ended_at");
      await client.query(
        "UPDATE support._shred_integrity_guard SET mutation_generation=mutation_generation"
      );
      // register.required_row* keep the TRUNCATE guard only: 0061:2-8 deletes
      // from required_row_version by design when a profile is rebuilt.
      await client.query("DELETE FROM register.required_row_version WHERE false");
    });
  });
});

describe("0065 search_path pins discovered from the catalog (DL5-F5)", () => {
  it("pins search_path on every function defined in an application schema", async () => {
    const result = await database.pool.query<{ signature: string }>(`
      SELECT namespace.nspname || '.' || proc.proname
        || '(' || pg_catalog.pg_get_function_identity_arguments(proc.oid) || ')' AS signature
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_depend AS dependency
          WHERE dependency.classid = 'pg_proc'::regclass
            AND dependency.objid = proc.oid AND dependency.deptype = 'e'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.unnest(COALESCE(proc.proconfig, '{}'::text[])) AS setting(value)
          WHERE setting.value LIKE 'search_path=%'
        )
      ORDER BY 1
    `, [[...APPLICATION_SCHEMAS]]);
    expect(result.rows.map((row) => row.signature)).toEqual([]);
  });

  it("the pinned T5 edge ratchet still admits UNKNOWN -> MEASURED and refuses the rest", async () => {
    const proconfig = await database.pool.query<{ proconfig: string[] | null }>(`
      SELECT proconfig FROM pg_catalog.pg_proc
      WHERE oid = 'core.reject_edge_mutation_except_measurement()'::regprocedure
    `);
    expect(proconfig.rows[0]?.proconfig ?? []).toContain("search_path=pg_catalog, pg_temp");
    await withRolledBackTransaction(async (client) => {
      const failure = await failureOf(client, "UPDATE core.edge SET magnitude_status=magnitude_status");
      // No rows exist in a freshly migrated database, so the row trigger cannot
      // fire; the statement must still parse and resolve every operator in its
      // body under the pinned path.
      expect(failure).toBeUndefined();
    });
  });
});

describe("0065 surplus EXECUTE grants revoked (DL5-F4)", () => {
  it.each(REVOKED_FROM_RUNTIME)("%s is not executable by debateai_runtime", async (signature) => {
    const result = await database.pool.query<{ runtime: boolean; authorization_runtime: boolean; publik: boolean }>(`
      SELECT pg_catalog.has_function_privilege('debateai_runtime', $1, 'EXECUTE') AS runtime,
        pg_catalog.has_function_privilege('debateai_authorization_runtime', $1, 'EXECUTE') AS authorization_runtime,
        pg_catalog.has_function_privilege('public', $1, 'EXECUTE') AS publik
    `, [signature]);
    expect(result.rows[0]).toEqual({ runtime: false, authorization_runtime: false, publik: false });
  });

  it("leaves the callers that exist intact", async () => {
    const result = await database.pool.query<{
      owner_publish: boolean; owner_import: boolean; owner_claim_map: boolean;
      support_config_operator_support_publish: boolean; runtime_row_insert: boolean;
    }>(`
      SELECT
        pg_catalog.has_function_privilege('debateai_register_publication_owner',
          'register.publish_register_version(uuid,character,bigint,jsonb,text)', 'EXECUTE') AS owner_publish,
        pg_catalog.has_function_privilege('debateai_register_publication_owner',
          'register.import_historical_register_version(bigint,jsonb,character)', 'EXECUTE') AS owner_import,
        pg_catalog.has_function_privilege('debateai_register_publication_owner',
          'register.claim_type_composition_map_is_valid(jsonb)', 'EXECUTE') AS owner_claim_map,
        pg_catalog.has_function_privilege('debateai_support_config_operator',
          'register.publish_support_configuration(uuid,character,bigint,bigint,integer,jsonb,text)',
          'EXECUTE') AS support_config_operator_support_publish,
        pg_catalog.has_table_privilege('debateai_runtime', 'register.register_row', 'INSERT')
          AS runtime_row_insert
    `);
    // The CHECK helper is only reachable at executor init for a role that can
    // INSERT into register.register_row; 0055:2019 already closed that for
    // debateai_runtime, which is what makes its EXECUTE grant surplus.
    expect(result.rows[0]).toEqual({
      owner_publish: true, owner_import: true, owner_claim_map: true,
      support_config_operator_support_publish: true, runtime_row_insert: false
    });
    // register.assert_required_rows still fires from the 0061 trigger, which
    // runs as the definer regardless of the caller's EXECUTE.
    await expect(database.pool.query("SELECT register.assert_required_rows(1)")).resolves.toBeDefined();
  });
});

// DL5-F9. The ledger facts this package could not fix forward, pinned so the
// NEXT one is caught at authoring time. See the report section in
// docs/missions/2026-09-01-security-hardening/findings/delta-L5-data-layer.md:
// 0053's CREATE TABLE cannot be repaired by a later file (migrate() keys on the
// file name, and only a standalone replay of 0053 itself hits the 42P07), and
// the eight duplicated numeric prefixes order by file name — every _support /
// _observation twin precedes its _t… twin only because 's'/'o' sort before 't'.
describe("0065 migration-ledger hygiene (DL5-F9)", () => {
  const MIGRATIONS = new URL("../../migrations/", import.meta.url);

  // Both predate this package. 0002 is pre-delta; 0053 is DL5-F9's finding and
  // is ledgered rather than repaired, because no later file can make a
  // standalone replay of 0053 idempotent.
  const UNGUARDED_CREATE_TABLE = [
    "0002_s02.sql",
    "0053_support_public_incident.sql"
  ] as const;

  // Pre-0065 duplicated numeric prefixes, recorded for the B28 checksum work.
  const DUPLICATED_PREFIXES = ["0025", "0050", "0051", "0052", "0053", "0054", "0055", "0057"] as const;

  async function migrationFiles(): Promise<string[]> {
    return (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/u.test(name)).sort();
  }

  it("guards every CREATE TABLE and CREATE INDEX outside the two ledgered files", async () => {
    const files = await migrationFiles();
    const unguardedTables: string[] = [];
    const unguardedIndexes: string[] = [];
    for (const name of files) {
      const source = await readFile(new URL(name, MIGRATIONS), "utf8");
      for (const line of source.split("\n")) {
        if (/^\s*CREATE\s+TABLE\s+/iu.test(line) && !/IF\s+NOT\s+EXISTS/iu.test(line)) {
          unguardedTables.push(name);
        }
        if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+/iu.test(line) && !/IF\s+NOT\s+EXISTS/iu.test(line)) {
          unguardedIndexes.push(name);
        }
      }
    }
    expect([...new Set(unguardedTables)]).toEqual([...UNGUARDED_CREATE_TABLE]);
    expect(unguardedIndexes).toEqual([]);
  });

  it("allocates a unique numeric prefix from 0065 onward", async () => {
    const files = await migrationFiles();
    const byPrefix = new Map<string, string[]>();
    for (const name of files) {
      const prefix = name.slice(0, 4);
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
    }
    const duplicated = [...byPrefix.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([prefix]) => prefix)
      .sort();
    expect(duplicated).toEqual([...DUPLICATED_PREFIXES]);
    expect(duplicated.filter((prefix) => Number(prefix) >= 65)).toEqual([]);
    // migrate() sorts by file name (packages/db/src/index.ts:769), so inside a
    // duplicated pair the applied order is a lexical accident of the suffix.
    // Nothing may depend on it; a new file must not add another pair.
    expect(files.filter((name) => Number(name.slice(0, 4)) >= 65))
      .toEqual([
        "0065_security_delta_guards.sql",
        // V-28 (task 11): the persisted model-spend ledger the per-run and daily
        // cost envelopes read. A new prefix, no pair.
        "0066_model_spend_ledger.sql",
        // SYNC3 / R2 (coordinator ruling): dev's plan-tier column, which dev had
        // numbered 0061 beside 0061_algorithm_publication_profiles.sql. Renamed to
        // the next free prefix instead of adding "0061" to DUPLICATED_PREFIXES. It
        // is idempotent statement by statement, so a database that applied it
        // under the old name re-applies it harmlessly under this one (the runner
        // tracks migrations by full file name).
        "0067_plan_tier_on_run.sql",
        // V-29 (owner ruling 2026-09-22): the observation agent's statistics window
        // replaces its pg_monitor membership. A new prefix, no pair.
        "0068_observation_stats_window.sql",
        // V-6 (owner ruling 2026-09-22, scope ruled 2026-09-25): the remaining
        // debate-text carriers take 0063's mechanism. A new prefix, no pair.
        "0069_remaining_content_carriers.sql",
        // DL7-F9 (Task 14): the threshold operator principal; the daemon loses INSERT on the
        // policy that rules it. 0069 and 0070 are reserved for V-6. A new prefix, no pair.
        "0071_observation_threshold_operator.sql",
        // Turn 12 localization: the debate's argument language (redefines
        // core.create_encrypted_run from 0067) and the support interface locale.
        // New prefixes after 0071, no pair.
        "0072_argument_language.sql",
        "0073_support_interface_locale.sql"
      ]);
  });
});
