import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import type { PoolClient } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { auditMigrationReplaySafety } from "../../tools/orphan-audit/src/index.js";

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
  "billing", "core", "evaluator", "evidence", "identity", "ledger", "legal", "memory",
  "obs", "observation", "register", "scorecard", "serve", "staff", "support"
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
  "identity.age_check": "0077 written once per account; erasure deletes it with the account (ON DELETE CASCADE)",
  "identity.sensitive_data_consent": "0078 written once per account; erasure deletes it with the account (ON DELETE CASCADE)",
  "identity.registration_region": "0090 written once per account; erasure deletes it with the account (ON DELETE CASCADE)",
  "identity.account_erasure_request": "erasure request state machine",
  "identity.account_erasure_notification_outbox": "outbox rows are sent then cleared",
  "identity.private_erasure_audit_binding": "erasure binding is cleared by the sweep",
  "identity.publication_event_binding": "binding is cleared on unpublish",
  "identity.run_execution_binding": "binding is cleared by erasure",
  "identity.account_security_hold": "0085/0104-0106: held/security_epoch state updated by exact private security owners",
  "identity.staff_webauthn_metadata": "0086: inserted with factor; erased by account/factor cascade; private selected-column reader",
  "identity.password_reset_control": "0104: request state advances and closes",
  "identity.password_reset_notice_binding": "0104: private request/account-cascade binding",
  "identity.password_reset_notice": "0104: delivery lease/sent/dead/retry state changes",
  "identity.password_reset_source_window": "0104: source window increments and is pruned",
  "identity.backup_email_control": "0105: verification state advances/expires",
  "identity.backup_email_notice_binding": "0105: private challenge/account-cascade binding",
  "identity.backup_email_notice": "0105: delivery lease/sent/dead state changes",
  "identity.backup_email_source_window": "0105: source window increments and is pruned",
  "identity.backup_email_proof_window": "0105: per-session proof window increments; session cascade erases",
  "identity.mfa_recovery_control": "0106: staged request completes/cancels/expires",
  "identity.mfa_recovery_staged_code": "0106: staged codes are replaced then copied on completion",
  "identity.mfa_recovery_notice_binding": "0106: private request/account-cascade binding",
  "identity.mfa_recovery_notice": "0106: delivery lease/sent/dead state changes",
  "identity.mfa_recovery_source_window": "0106: source window increments and is pruned",
  "staff.subject": "0085/0089: capabilities/state/epoch and erased user binding change",
  "staff.privilege_session": "0087: idle renewal/revocation and account/session cascade",
  "staff.action_proof": "0085/0086: proof consumed; parent/session cascade",
  "staff.invitation_proof": "0085/0086: proof consumed; parent/session cascade",
  "staff.prerequisite_receipt": "0085/0086: prerequisite consumed and registration handle bound",
  "staff.webauthn_challenge": "0086: challenge bound/consumed; failed attempts change",
  "staff.owner_possession_receipt": "0085/0089: receipt consumed; account/session/command cascade",
  "staff.invitation": "0085: invitation consumed/revoked; account cascade",
  "staff.owner_command": "0089: command committed/cancelled and erased previous user binding",
  "staff.owner_designation": "0089: active designation rotates false",
  "staff.owner_lineage": "0089: current singleton lineage changes in owner recovery transaction",
  "staff.owner_recovery_generation": "0089: current offline generation/verifier rotates",
  "staff.password_totp_rotation_receipt": "0085: account/session/factor ON DELETE CASCADE erases receipt",
  "staff.alert_dispatch_state": "0088: claim/retry/terminal delivery state changes",
  "staff.alert_operation_readiness": "0088: current per-operation readiness expires/replaces",
  "staff.independent_alert_readiness": "0088: current readiness singleton published/revoked",
  "staff.funding_policy_selection": "0092: current selected policy changes through exact capability"
};

const STAFF_OWNER = "debateai_staff_security_owner";
const RECOVERY_READERS = ["debateai_password_recovery_owner", "debateai_password_reset_owner", "debateai_backup_email_owner", "debateai_mfa_recovery_owner"];
const PRIVATE_READERS = [STAFF_OWNER, ...RECOVERY_READERS];
const PRIVATE_TABLE_OWNERS: Readonly<Record<string, string>> = Object.fromEntries([
  ...["action_proof", "alert_delivery_receipt", "alert_dispatch_state", "alert_operation_readiness", "alert_outbox", "audit_event", "bootstrap_marker", "funding_policy_selection", "grant_event", "independent_alert_readiness", "invitation", "invitation_proof", "owner_command", "owner_designation", "owner_lineage", "owner_possession_receipt", "owner_recovery_generation", "owner_recovery_operation", "password_totp_rotation_receipt", "prerequisite_receipt", "privilege_session", "subject", "webauthn_challenge"].map((name) => [`staff.${name}`, STAFF_OWNER]),
  ...["internal_grant", "internal_grant_event", "internal_provider_admission"].map((name) => [`billing.${name}`, STAFF_OWNER]),
  ...["password_reset_control", "password_reset_notice_binding", "password_reset_notice", "password_reset_source_window"].map((name) => [`identity.${name}`, "debateai_password_reset_owner"]),
  ...["backup_email_control", "backup_email_notice_binding", "backup_email_notice", "backup_email_source_window", "backup_email_proof_window"].map((name) => [`identity.${name}`, "debateai_backup_email_owner"]),
  ...["mfa_recovery_control", "mfa_recovery_staged_code", "mfa_recovery_notice_binding", "mfa_recovery_notice", "mfa_recovery_source_window", "mfa_recovery_legacy_cohort"].map((name) => [`identity.${name}`, "debateai_mfa_recovery_owner"]),
  ...["password_recovery_control", "password_recovery_feed", "password_recovery_notice", "password_recovery_retry_lock", "password_recovery_source_window", "password_recovery_staged_code"].map((name) => [`identity.${name}`, "debateai_password_recovery_owner"])
]);

/** Finite metadata-only oracle; private ownership is never inferred from NOLOGIN alone. */
async function privateBoundaryProblems(client: Pick<PoolClient, "query">, expectedOwners = PRIVATE_TABLE_OWNERS): Promise<string[]> {
  const problems: string[] = [];
  const owners = await client.query<{ role: string; safe: boolean }>(`
    SELECT rolname AS role, NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls
      AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid=pg_roles.oid) AS safe
    FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [PRIVATE_READERS]);
  if (owners.rows.length !== PRIVATE_READERS.length || owners.rows.some((row) => !row.safe)) problems.push("PRIVATE_OWNER_ROLE_OR_MEMBERSHIP");
  const tables = await client.query<{ relation: string; owner: string }>(`
    SELECT n.nspname||'.'||c.relname AS relation,pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN('r','p') AND n.nspname=ANY($1::text[])
      AND pg_get_userbyid(c.relowner)=ANY($2::text[]) ORDER BY 1`, [[...APPLICATION_SCHEMAS], PRIVATE_READERS]);
  const actual = Object.fromEntries(tables.rows.map((row) => [row.relation, row.owner]));
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(expectedOwners).sort())) problems.push("PRIVATE_TABLE_OWNER_INVENTORY");
  const creator = await client.query<{ safe: boolean; oid: number }>(`
    SELECT c.relowner AS oid, c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND c.relowner=(SELECT datdba FROM pg_database WHERE datname=current_database())
      AND c.relowner=(SELECT nspowner FROM pg_namespace WHERE nspname='billing') AS safe
    FROM pg_class c WHERE c.oid='public.debateai_schema_migration'::regclass`);
  if (creator.rows.length !== 1 || creator.rows[0]?.safe !== true) return [...problems, "ORIGINAL_CREATOR_ANCHOR"];
  const newRelations = Object.keys(MUTABLE_UNGUARDED_RELATIONS).filter((name) => name.startsWith("staff.") || /identity\.(?:account_security_hold|staff_webauthn_metadata|password_reset_|backup_email_|mfa_recovery_)/.test(name));
  const identityOwners = await client.query<{ ok: boolean }>(`SELECT count(*)=2 AND bool_and(relowner=$1::oid) AS ok FROM pg_class WHERE oid IN('identity.account_security_hold'::regclass,'identity.staff_webauthn_metadata'::regclass)`, [creator.rows[0]!.oid]);
  if (identityOwners.rows[0]?.ok !== true) problems.push("IDENTITY_CREATOR_OWNER");
  const effective = await client.query<{ relation: string; role: string }>(`
    SELECT n.nspname||'.'||c.relname AS relation,r.rolname AS role
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
    WHERE n.nspname||'.'||c.relname=ANY($1::text[]) AND r.oid<>c.relowner AND r.oid<>$2::oid
      AND r.rolname LIKE 'debateai\\_%' AND NOT(r.rolname=ANY($3::text[]))
      AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))`, [newRelations, creator.rows[0]!.oid, PRIVATE_READERS]);
  for (const row of effective.rows) problems.push(`REACHABLE_RUNTIME_RAW:${row.relation}:${row.role}`);
  const access = await client.query<{ relation: string; role: string; privilege: string; column_name: string | null }>(`
    WITH grants AS (
      SELECT c.oid,c.relowner,n.nspname||'.'||c.relname AS relation,a.grantee,a.privilege_type AS privilege,NULL::text AS column_name
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
        LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      UNION ALL
      SELECT c.oid,c.relowner,n.nspname||'.'||c.relname,a.grantee,a.privilege_type,attribute.attname
      FROM pg_attribute attribute JOIN pg_class c ON c.oid=attribute.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace,
        LATERAL aclexplode(attribute.attacl) a WHERE attribute.attnum>0 AND NOT attribute.attisdropped
    ) SELECT relation,coalesce(r.rolname,'PUBLIC') AS role,privilege,column_name
    FROM grants g LEFT JOIN pg_roles r ON r.oid=g.grantee
    WHERE relation=ANY($1::text[]) AND g.grantee<>g.relowner AND g.grantee<>$2::oid
    ORDER BY relation,role,privilege,column_name`, [newRelations, creator.rows[0]!.oid]);
  for (const row of access.rows) {
    const allowed = row.relation === "identity.account_security_hold" && PRIVATE_READERS.includes(row.role)
      && row.column_name === null && ["SELECT", "INSERT", "UPDATE"].includes(row.privilege)
      || row.relation === "identity.staff_webauthn_metadata" && row.role === STAFF_OWNER && row.privilege === "SELECT"
        && row.column_name !== null && ["mfa_factor_id", "user_id", "transports"].includes(row.column_name)
      || row.relation === "staff.subject" && RECOVERY_READERS.includes(row.role) && row.privilege === "SELECT" && row.column_name === null;
    if (!allowed) problems.push(`PRIVATE_RAW_GRANT:${row.relation}:${row.role}:${row.privilege}:${row.column_name ?? "table"}`);
  }
  return problems;
}

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

  // Split 2026-10-09 (review of PR #82): since e7db678bf the private tables are OWNED by NOLOGIN private roles, and a
  // table owner holds TRUNCATE implicitly (acldefault), so this ACL scan cannot say "no application role" any more.
  // It now pins exactly that exception — the owner of its own private table, nobody else — and the next test proves
  // no application role or owner path can actually TRUNCATE an append-only (audit/ledger) table.
  it("grants TRUNCATE to no application role except a private table's own NOLOGIN owner", async () => {
    expect(await privateBoundaryProblems(database.pool)).toEqual([]);
    const result = await database.pool.query<{ relation: string; grantee: string; is_owner: boolean }>(`
      SELECT namespace.nspname || '.' || relation.relname AS relation, grantee.rolname AS grantee,acl.grantee=relation.relowner AS is_owner
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
    expect(result.rows.filter((row) => !row.is_owner || PRIVATE_TABLE_OWNERS[row.relation] !== row.grantee)).toEqual([]);
  });

  it("lets no application role, owner or definer path TRUNCATE an append-only audit or ledger table", async () => {
    // Append-only = every application base table that is not a named mutable exception (the discovery test above
    // proves each carries an enabled BEFORE TRUNCATE guard). Audit and ledger tables are all in it.
    const tables = (await database.pool.query<{ relation: string; owner: string }>(`
      SELECT n.nspname||'.'||c.relname AS relation, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname=ANY($1::text[]) ORDER BY 1`, [[...APPLICATION_SCHEMAS]])).rows
      .filter((row) => MUTABLE_UNGUARDED_RELATIONS[row.relation] === undefined);
    const names = tables.map((row) => row.relation);
    for (const audit of ["staff.audit_event", "staff.grant_event", "billing.internal_grant_event", "identity.audit_event", "support.shred_audit"])
      expect(names, audit).toContain(audit);
    expect(names.filter((name) => name.startsWith("ledger.")).length).toBeGreaterThan(0);

    // 1. Effective privilege (ACL + every membership chain): no debateai_* role other than the table's owner has it.
    const effective = await database.pool.query<{ relation: string; role: string }>(`
      SELECT n.nspname||'.'||c.relname AS relation, r.rolname AS role
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
      WHERE n.nspname||'.'||c.relname=ANY($1::text[]) AND r.rolname LIKE 'debateai\\_%' AND r.oid<>c.relowner
        AND has_table_privilege(r.oid, c.oid, 'TRUNCATE')
      ORDER BY 1, 2`, [names]);
    expect(effective.rows).toEqual([]);

    // 2. Owners: an application-named owner must be a private NOLOGIN role nobody can become.
    const reachableOwners = await database.pool.query<{ owner: string }>(`
      SELECT DISTINCT r.rolname AS owner FROM pg_roles r
      WHERE r.rolname=ANY($1::text[]) AND r.rolname LIKE 'debateai\\_%'
        AND (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid=r.oid))
      ORDER BY 1`, [[...new Set(tables.map((row) => row.owner))]]);
    expect(reachableOwners.rows).toEqual([]);

    // 3. Definer path: no SECURITY DEFINER function an application role can call carries TRUNCATE or switches the
    //    guard off (DISABLE TRIGGER, session_replication_role) — the only way to act as a NOLOGIN owner.
    const definers = await database.pool.query<{ fn: string }>(`
      SELECT p.oid::regprocedure::text AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=ANY($1::text[]) AND p.prosecdef
        AND p.prosrc ~* '(\\mtruncate\\M|disable\\s+trigger|session_replication_role)'
      ORDER BY 1`, [[...APPLICATION_SCHEMAS]]);
    expect(definers.rows).toEqual([]);

    // 4. Behaviour: acting AS each owner (the strongest holder of the implicit grant), TRUNCATE is refused —
    //    55000 is the table's own guard; 42501 means the cascade reached a table that role may not truncate at all.
    //    Neither CASCADE nor ONLY may ever succeed, and the guard itself must fire on at least the audit tables.
    const refusals: Record<string, string> = {};
    await withRolledBackTransaction(async (client) => {
      for (const { relation, owner } of tables) {
        for (const statement of [`TRUNCATE ${relation} CASCADE`, `TRUNCATE ONLY ${relation}`]) {
          await client.query(`SET LOCAL ROLE ${JSON.stringify(owner)}`);
          const failure = await failureOf(client, statement);
          await client.query("RESET ROLE");
          expect(failure, `${owner}: ${statement} succeeded`).toBeDefined();
          refusals[`${statement} as ${owner}`] = sqlState(failure) ?? messageOf(failure);
        }
      }
    });
    // 0A000 (ONLY on a table other tables reference) is also a refusal; anything else is a broken probe.
    expect(Object.entries(refusals).filter(([, state]) => !["55000", "42501", "0A000"].includes(state))).toEqual([]);
    // The guard itself, for identities that DO hold the privilege: the creator/superuser this database runs as
    // (stronger than any owner) is refused by the table's BEFORE TRUNCATE trigger, not by a missing grant.
    await withRolledBackTransaction(async (client) => {
      for (const audit of ["staff.audit_event", "staff.grant_event", "billing.internal_grant_event", "identity.audit_event", "support.shred_audit"]) {
        const failure = await failureOf(client, `TRUNCATE ${audit} CASCADE`);
        expect(sqlState(failure), `${audit} TRUNCATE as the database superuser`).toBe("55000");
        // core.reject_mutation()/core's TRUNCATE guard, or the staff schema's own immutability trigger (0085+).
        expect(messageOf(failure)).toMatch(/TRUNCATE_REJECTED|rejects TRUNCATE|STAFF_RECORD_IMMUTABLE/u);
      }
    });
  });

  it("keeps all six legacy103 owner tables guarded instead of treating them as mutable", async () => {
    const names=Object.entries(PRIVATE_TABLE_OWNERS).filter(([,owner])=>owner==='debateai_password_recovery_owner').map(([name])=>name);
    expect(names).toHaveLength(6);for(const name of names)expect(MUTABLE_UNGUARDED_RELATIONS[name]).toBeUndefined();
    const guards=await database.pool.query<{ok:boolean}>(`SELECT count(*)=6 AND bool_and(EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND (t.tgtype&32)<>0 AND (t.tgtype&2)<>0 AND t.tgenabled IN('O','A'))) AS ok FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname||'.'||c.relname=ANY($1::text[])`,[names]);
    expect(guards.rows[0]?.ok).toBe(true);
  });

  it("refuses unsafe private owners, raw grants and unknown or missing table maps in rolled-back synthetic catalog states", async () => {
    expect(await privateBoundaryProblems(database.pool)).toEqual([]);
    const absent = { ...PRIVATE_TABLE_OWNERS }; delete absent["identity.backup_email_control"];
    expect(await privateBoundaryProblems(database.pool, absent)).toContain("PRIVATE_TABLE_OWNER_INVENTORY");
    expect(await privateBoundaryProblems(database.pool, { ...PRIVATE_TABLE_OWNERS, "staff.synthetic_missing": STAFF_OWNER })).toContain("PRIVATE_TABLE_OWNER_INVENTORY");
    for (const sql of [
      "ALTER TABLE identity.backup_email_control OWNER TO debateai_mfa_recovery_owner",
      "ALTER ROLE debateai_staff_security_owner LOGIN",
      "ALTER ROLE debateai_staff_security_owner SUPERUSER",
      "ALTER ROLE debateai_staff_security_owner BYPASSRLS",
      "GRANT debateai_staff_security_owner TO debateai_runtime",
      "CREATE ROLE debateai_task5_inherited NOLOGIN; GRANT debateai_backup_email_owner TO debateai_task5_inherited; GRANT debateai_task5_inherited TO debateai_runtime",
      "CREATE TABLE staff.synthetic_unclassified(value text); ALTER TABLE staff.synthetic_unclassified OWNER TO debateai_staff_security_owner",
      "GRANT SELECT ON identity.backup_email_control TO debateai_runtime",
      "GRANT SELECT(challenge_id) ON identity.backup_email_control TO debateai_runtime",
      "GRANT TRUNCATE ON identity.backup_email_control TO debateai_authorization_runtime",
      "CREATE ROLE debateai_task5_untrusted_nologin NOLOGIN; GRANT TRUNCATE ON identity.backup_email_control TO debateai_task5_untrusted_nologin",
      "GRANT SELECT ON identity.backup_email_control TO PUBLIC"
    ]) await withRolledBackTransaction(async (client) => {
      await client.query(sql);
      expect(await privateBoundaryProblems(client), sql).not.toEqual([]);
    });
    // NOLOGIN capability remains untrusted: it cannot inherit a private owner or hold raw TRUNCATE.
    expect(await privateBoundaryProblems(database.pool)).toEqual([]);
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
  const NATIVE_TABLE_SITES: Readonly<Record<string, readonly string[]>> = {
    "0104_password_only_reset.sql": ["identity.password_reset_control", "identity.password_reset_notice_binding", "identity.password_reset_notice", "identity.password_reset_source_window"],
    "0105_backup_email_verification.sql": ["identity.backup_email_control", "identity.backup_email_notice_binding", "identity.backup_email_notice", "identity.backup_email_source_window", "identity.backup_email_proof_window"],
    "0106_known_password_mfa_recovery.sql": ["identity.mfa_recovery_control", "identity.mfa_recovery_staged_code", "identity.mfa_recovery_notice_binding", "identity.mfa_recovery_notice", "identity.mfa_recovery_source_window"],
    "0107_auth_dev_integration.sql": ["identity.mfa_recovery_legacy_cohort"]
  };

  async function migrationFiles(): Promise<string[]> {
    return (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/u.test(name)).sort();
  }

  it("guards every CREATE TABLE and CREATE INDEX outside the two ledgered files", async () => {
    const files = await migrationFiles();
    const plan = await loadMigrationPlan();
    const migrateSource = await readFile(new URL("../../packages/db/src/index.ts", import.meta.url), "utf8");
    const unguardedTables: string[] = [];
    const unguardedIndexes: string[] = [];
    const classifiedTables: string[] = [];
    for (const name of files) {
      const source = await readFile(new URL(name, MIGRATIONS), "utf8");
      for (const line of source.split("\n")) {
        if (/^\s*CREATE\s+TABLE\s+/iu.test(line) && !/IF\s+NOT\s+EXISTS/iu.test(line)) {
          const relation = /^\s*CREATE\s+TABLE\s+([^\s(]+)/iu.exec(line)?.[1];
          if (relation !== undefined && NATIVE_TABLE_SITES[name]?.includes(relation)) {
            // Exact15 table sites, including one pre107 cohort; no standalone replay or reseed.
            expect(auditMigrationReplaySafety(`migrations/${name}`, source, { plan, migrateSource })).toEqual([]);
            classifiedTables.push(`${name}:${relation}`);
          } else unguardedTables.push(name);
        }
        if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+/iu.test(line) && !/IF\s+NOT\s+EXISTS/iu.test(line)) {
          if (name === "0105_backup_email_verification.sql" && line === "CREATE UNIQUE INDEX backup_email_one_pending ON identity.backup_email_control(user_id) WHERE stage='EMAIL_REQUIRED';") {
            expect(auditMigrationReplaySafety(`migrations/${name}`, source, { plan, migrateSource })).toEqual([]);
          } else unguardedIndexes.push(name);
        }
      }
    }
    expect([...new Set(unguardedTables)]).toEqual([...UNGUARDED_CREATE_TABLE]);
    expect(unguardedIndexes).toEqual([]);
    expect(classifiedTables.sort()).toEqual(Object.entries(NATIVE_TABLE_SITES).flatMap(([name, relations]) => relations.map((relation) => `${name}:${relation}`)).sort());
  });

  it("binds every full migration name and intentional collision to the closed native order", async () => {
    const files = await migrationFiles();
    const plan = await loadMigrationPlan();
    const migrateSource = await readFile(new URL("../../packages/db/src/index.ts", import.meta.url), "utf8");
    expect(plan.manifest.order).toHaveLength(128);
    expect(files).toEqual([...plan.manifest.order, plan.forward108.name].sort());
    for (const name of ["0104_password_only_reset.sql", "0105_backup_email_verification.sql", "0106_known_password_mfa_recovery.sql", "0107_auth_dev_integration.sql"]) {
      expect(auditMigrationReplaySafety(`migrations/${name}`, plan.sources.get(name)!.sql, { plan, migrateSource })).toEqual([]);
    }
    const byPrefix = new Map<string, string[]>();
    for (const name of files) byPrefix.set(name.slice(0, 4), [...(byPrefix.get(name.slice(0, 4)) ?? []), name]);
    const duplicated = [...byPrefix].filter(([, names]) => names.length > 1).map(([prefix]) => prefix).sort();
    expect(duplicated.filter((prefix) => Number(prefix) < 65)).toEqual([...DUPLICATED_PREFIXES]);
    expect(duplicated.filter((prefix) => Number(prefix) >= 65)).toEqual([
      "0085", "0086", "0087", "0088", "0089", "0090", "0091", "0092", "0093", "0094", "0095", "0104", "0105"
    ]);
    // Runtime follows the checked recipe, including its nonlexical auth/Dev joins.
    const ordered = plan.manifest.order;
    expect(ordered.indexOf("0095_registration_region.sql")).toBeLessThan(ordered.indexOf("0092_internal_funded_allowance.sql"));
    expect(ordered.indexOf("0106_known_password_mfa_recovery.sql")).toBeLessThan(ordered.indexOf("0104_account_flow_recovery_bridge.sql"));
    expect(ordered.at(-1)).toBe("0107_auth_dev_integration.sql");
    expect(plan.forward108.name).toBe("0108_preview_recovery_verified_bindings.sql");
  });
});
