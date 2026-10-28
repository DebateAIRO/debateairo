import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateDek,
  MemoryRunContentKeyStore,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AccountErasureCoordinator,
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  migrate,
  PostgresAccountErasureRepository
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * NV-08 (security-audit run 3, K02). An expired orphan run-key provision intent whose owner is no longer in a state the
 * intent trigger admits (identity.enforce_active_user_child: pending_verification, pending_mfa, active) made 0040's
 * core.claim_run_key_provision_cleanup fail as a whole statement (55000 ACCOUNT_NOT_ACTIVE), so no other owner's orphan
 * was ever cleaned and the coordinator's reconcileRunKeyProvisionIntents rejected on every 30 s pass. 0125's
 * erasure_reconcile.claim_run_key_provision_cleanup skips such owners and claims everyone else. It lives in the new
 * schema erasure_reconcile, which the N-1 release's exact-count witnesses do not count, and the new release's
 * content-provision witness counts it by catalog OID, so a swapped pool still gets the bounded refusal.
 *
 * Embedded PostgreSQL, synthetic owners only (no MFA, login challenge or erasure rows).
 */
const { Pool: PgPool } = pg;
let database: TestDatabase;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type Owner = Readonly<{ userId: string; ownerRef: string; sessionId: string }>;
type Orphan = Owner & Readonly<{ runId: string }>;

/** Test-local, as in tests/unit/s6-content-encryption.test.ts. */
class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> { this.#keys.set(userId, Buffer.from(dek)); }
  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }
  async exists(userId: string): Promise<boolean> { return this.#keys.has(userId); }
  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}

const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;

/** The fixtureAccount shape of s10-t9-account-erasure-races.test.ts:96-170: active, one verified email, one live session. */
async function activeOwner(label: string): Promise<Owner> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const channelId = randomUUID();
  const tokenHash = opaqueHash();
  const sessionId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32),
    "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    `nv08-${label}-${randomUUID()}`, randomUUID(), ownerRef]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,
      verified_at,verification_token_hash,verification_expires_at,
      verification_last_sent_at,verification_consumed_at,delivery_status,delivery_error
    ) VALUES ($1,$2,'email','{}','verified',clock_timestamp(),clock_timestamp(),$3,
      clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',
      clock_timestamp(),'sent',NULL)
  `, [channelId, userId, tokenHash]);
  await database.pool.query(`
    INSERT INTO identity.verification_token_credential(
      token_hash,channel_binding_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour',clock_timestamp()-interval '30 seconds')
  `, [tokenHash, channelId]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),
      clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp(),NULL)
  `, [sessionId, userId, opaqueHash(), opaqueHash(), opaqueHash()]);
  return Object.freeze({ userId, ownerRef, sessionId });
}

/** A prepared intent with no run row, backdated past its expiry (as s10-t9's claimedProvisionFixture, :212-217). */
async function expiredOrphan(label: string): Promise<Orphan> {
  const owner = await activeOwner(label);
  const runId = randomUUID();
  const prepared = await database.pool.query<{ execution_ref: string | null }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId, owner.userId, owner.ownerRef, owner.sessionId]
  );
  expect(prepared.rows[0]?.execution_ref).toMatch(UUID);
  await database.pool.query(`
    UPDATE core.run_key_provision_intent
    SET requested_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute'
    WHERE run_id=$1
  `, [runId]);
  return Object.freeze({ ...owner, runId });
}

/** The two writes of identity.confirm_account_age_with_audit's refusal (0077:101-108), as the fixture superuser. */
async function freeze(owner: Owner): Promise<void> {
  await database.pool.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE user_id=$1", [owner.userId]);
  await database.pool.query(`UPDATE identity."user" SET state='age_frozen' WHERE user_id=$1`, [owner.userId]);
}

/** Runs `sql` as debateai_content_provision in a transaction that is always rolled back. */
async function asProvisionRolledBack<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_content_provision");
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function intentState(runId: string): Promise<string | null> {
  return (await database.pool.query<{ cleanup_state: string }>(
    "SELECT cleanup_state FROM core.run_key_provision_intent WHERE run_id=$1", [runId]
  )).rows[0]?.cleanup_state ?? null;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => database?.stop());

describe("NV-08 · run-key provision cleanup skips owners the intent trigger refuses", () => {
  it("the new claim skips a frozen owner and claims everyone else", async () => {
    const a = await expiredOrphan("frozen");
    const b = await expiredOrphan("active");
    await freeze(a);

    // Characterisation (green before and after): the 0040 claim fails as a whole on the frozen owner's row.
    await expect(asProvisionRolledBack("SELECT * FROM core.claim_run_key_provision_cleanup(100)"))
      .rejects.toMatchObject({ code: "55000", message: "ACCOUNT_NOT_ACTIVE" });

    const claimed = await asProvisionRolledBack<{ run_id: string; claim_token: string }>(
      "SELECT run_id,claim_token FROM erasure_reconcile.claim_run_key_provision_cleanup(100)"
    );
    expect(claimed.find((row) => row.run_id === b.runId)?.claim_token).toMatch(UUID);
    expect(claimed.map((row) => row.run_id)).not.toContain(a.runId);
    expect(await intentState(a.runId)).toBe("PREPARED");
    expect(await intentState(b.runId)).toBe("PREPARED");
  });

  it("the coordinator cleans every other owner while one owner is frozen", async () => {
    const a2 = await expiredOrphan("frozen-2");
    const b2 = await expiredOrphan("active-2");
    await freeze(a2);
    const users = new MemoryUserDekStore();
    await users.store(b2.userId, generateDek());
    const keys = new MemoryRunContentKeyStore(users, async () => b2.userId);
    await keys.store(b2.runId, { userId: b2.userId, ownerRef: b2.ownerRef }, generateDek());
    expect(await keys.exists(b2.runId)).toBe(true);
    const coordinator = new AccountErasureCoordinator(
      new PostgresAccountErasureRepository(database.pool, {} as AuditContextHasher, database.pool), users, keys
    );

    const outcomes = await coordinator.reconcileRunKeyProvisionIntents(100);

    // "Contains" only: earlier cases roll back only their claims, so their orphans are claimed here too.
    expect(outcomes).toContainEqual({ runId: b2.runId, outcome: "CLEANED" });
    expect(outcomes.map((outcome) => outcome.runId)).not.toContain(a2.runId);
    expect(await intentState(b2.runId)).toBeNull();
    expect(await keys.exists(b2.runId)).toBe(false);
    expect(await intentState(a2.runId)).toBe("PREPARED");
  });

  it("is owned like 0040's claim, a pinned-path definer, and executable by the content-provision role alone", async () => {
    const row = (await database.pool.query<{
      owner_matches: boolean; schema_owner_matches: boolean; definer: boolean; volatility: string; config: string[];
      public_execute: boolean; provision_execute: boolean; runtime_execute: boolean; erasure_execute: boolean;
      public_usage: boolean; runtime_usage: boolean; provision_usage: boolean;
    }>(`
      SELECT p.proowner=o.proowner AS owner_matches,n.nspowner=o.proowner AS schema_owner_matches,
        p.prosecdef AS definer,p.provolatile::text AS volatility,p.proconfig AS config,
        has_function_privilege('public',p.oid,'EXECUTE') AS public_execute,
        has_function_privilege('debateai_content_provision',p.oid,'EXECUTE') AS provision_execute,
        has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime_execute,
        has_function_privilege('debateai_erasure_runtime',p.oid,'EXECUTE') AS erasure_execute,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
          WHERE a.grantee=0) AS public_usage,
        has_schema_privilege('debateai_runtime',n.oid,'USAGE') AS runtime_usage,
        has_schema_privilege('debateai_content_provision',n.oid,'USAGE') AS provision_usage
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN pg_proc o
      WHERE p.oid='erasure_reconcile.claim_run_key_provision_cleanup(integer)'::regprocedure
        AND o.oid='core.claim_run_key_provision_cleanup(integer)'::regprocedure
    `)).rows[0];
    expect(row).toEqual({
      owner_matches: true, schema_owner_matches: true, definer: true, volatility: "v",
      config: ["search_path=pg_catalog, pg_temp"],
      public_execute: false, provision_execute: true, runtime_execute: false, erasure_execute: false,
      public_usage: false, runtime_usage: false, provision_usage: true
    });
  });

  it("keeps the N-1 release's exact counts, and both releases' attestations hold on 0125", async () => {
    const counts = (await database.pool.query<{ erasure: number; provision: number }>(`
      SELECT
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname=ANY(ARRAY['identity','core','serve'])
            AND has_function_privilege('debateai_erasure_runtime',p.oid,'EXECUTE')) AS erasure,
        (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='core' AND has_function_privilege('debateai_content_provision',p.oid,'EXECUTE')) AS provision
    `)).rows[0];
    // The lengths of the N-1 lists: ERASURE_FUNCTION_SIGNATURES (account-erasure.ts) and CONTENT_PROVISION_SIGNATURES (index.ts).
    expect(counts).toEqual({ erasure: 25, provision: 7 });

    await withLogins(async ({ runtimePool, erasurePool, contentPool, runtimeLogin }) => {
      await expect(assertAccountErasureDatabaseRole(runtimePool, erasurePool)).resolves.toBeUndefined();
      await expect(assertContentProvisionDatabaseRole(runtimePool, contentPool)).resolves.toBeUndefined();

      // A swapped pool gets the bounded refusal, never a raw 42501 from resolving an erasure_reconcile name.
      await expect(assertContentProvisionDatabaseRole(contentPool, runtimePool))
        .rejects.toThrow(/^CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED$/u);
      await expect(assertAccountErasureDatabaseRole(erasurePool, runtimePool))
        .rejects.toThrow(/^ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED$/u);

      // USAGE alone on the new schema, for the runtime login, is refused through reconcile_schema_usage.
      await database.pool.query(`GRANT USAGE ON SCHEMA erasure_reconcile TO ${runtimeLogin}`);
      try {
        await expect(assertContentProvisionDatabaseRole(runtimePool, contentPool))
          .rejects.toThrow(/^CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED$/u);
      } finally {
        await database.pool.query(`REVOKE USAGE ON SCHEMA erasure_reconcile FROM ${runtimeLogin}`);
      }
      await expect(assertContentProvisionDatabaseRole(runtimePool, contentPool)).resolves.toBeUndefined();
    });
  });

  it("digests the schema's ACL in 0125's postcondition, so a later grant on it is drift", async () => {
    await database.pool.query("GRANT USAGE ON SCHEMA erasure_reconcile TO debateai_runtime");
    try {
      await expect(migrate(database.pool))
        .rejects.toThrow("MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT 0125_security_fixes_run3.sql");
    } finally {
      await database.pool.query("REVOKE USAGE ON SCHEMA erasure_reconcile FROM debateai_runtime");
    }
    await migrate(database.pool); // the grant revoked, the same ACL digests again
  }, 300_000);
});

type Logins = Readonly<{
  runtimePool: pg.Pool; erasurePool: pg.Pool; contentPool: pg.Pool; runtimeLogin: string;
}>;

/** One runtime, one erasure and one content-provision LOGIN, as s6-content-encryption-database.test.ts creates them. */
async function withLogins(use: (logins: Logins) => Promise<void>): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  const runtimeLogin = `nv08_runtime_${suffix}`;
  const erasureLogin = `nv08_erasure_${suffix}`;
  const contentLogin = `nv08_content_${suffix}`;
  const password = `nv08-${randomUUID()}`;
  const loginUrl = (user: string): string => {
    const url = new URL(database.connectionString);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  await database.pool.query(`
    CREATE ROLE ${runtimeLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    CREATE ROLE ${erasureLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    CREATE ROLE ${contentLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    GRANT debateai_runtime TO ${runtimeLogin};
    GRANT debateai_erasure_runtime TO ${erasureLogin};
    GRANT debateai_content_provision TO ${contentLogin}
  `);
  const pools: pg.Pool[] = [];
  try {
    const open = (user: string): pg.Pool => { const pool = new PgPool({ connectionString: loginUrl(user), max: 2 }); pools.push(pool); return pool; };
    await use({ runtimePool: open(runtimeLogin), erasurePool: open(erasureLogin), contentPool: open(contentLogin), runtimeLogin });
  } finally {
    await Promise.all(pools.map(async (pool) => pool.end().catch(() => undefined)));
    await database.pool.query(`DROP ROLE IF EXISTS ${runtimeLogin}, ${erasureLogin}, ${contentLogin}`);
  }
}
