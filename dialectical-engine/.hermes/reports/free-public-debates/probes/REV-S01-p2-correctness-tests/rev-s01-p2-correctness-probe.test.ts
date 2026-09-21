// REV-S01-p1-correctness-tests — reviewer's OWN fixture, built from SPEC-v2's claims,
// not from the slice's tests. RE-DERIVED at slice head c358d494 (pass 2); the db4758da
// version measured the PRE-FIX behaviour of C-B2 and C-B3 and used pre-0070 prepare/backoff
// semantics, so three cases are restated below against what SPEC-v3 requires now.
// Exceeds the authors' parameters: two concurrent serves of one Free run, a NULL tier,
// a pre-rule Free run, the reconciler at zero and above its batch cap, and a delete
// racing an in-flight / orphaned system publication intent.
// TEMPORARY: deleted before the seat's handoff; the worktree ends byte-clean.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresPublicationRepository, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type Seed = Readonly<{
  runId: string;
  userId: string;
  ownerRef: string;
  sessionId: string;
  pseudonym: string;
}>;

let database: TestDatabase;
let runtimePool: Pool;
let erasurePool: Pool;
let repository: PostgresPublicationRepository;

function tokenHash(): string {
  return `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;
}

async function seedRun(input: Readonly<{
  planTier?: "free" | "premium" | null;
  freePublicRule?: boolean;
}> = {}): Promise<Seed> {
  const runId = randomUUID();
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const auditToken = randomUUID();
  const pseudonym = `REV Probe ${runId}`;
  const planTier = input.planTier === undefined ? "free" : input.planTier;
  const freePublicRule = input.freePublicRule ?? true;
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      password_hash,pseudonym,state,adult_affirmed_at,audit_token,owner_ref
    ) VALUES (
      $1::uuid,
      decode(md5(($1::uuid)::text)||md5(($1::uuid)::text||':email'),'hex'),
      '{}'::jsonb,'{}'::jsonb,'test-password-hash',$2,'active',
      clock_timestamp(),$3,$4
    )
  `, [userId, pseudonym, auditToken, ownerRef]);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(`
      INSERT INTO identity.session(
        session_id,user_id,token_hash,binding_context,idle_expires_at,
        absolute_expires_at,csrf_token_hash,last_mfa_at
      ) VALUES (
        $1,$2,md5(($1::uuid)::text)||md5(($1::uuid)::text||':session'),'{}'::jsonb,
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
        'sha256:'||md5(($1::uuid)::text||':csrf')||md5(($1::uuid)::text||':csrf:2'),
        clock_timestamp()
      )
    `, [sessionId, userId]);
    await client.query(`
      INSERT INTO identity.run_execution_binding(
        execution_ref,user_id,identity_session_id,run_id,created_at
      ) VALUES ($1,$2,$1,$3,clock_timestamp())
    `, [sessionId, userId, runId]);
    await client.query(`
      INSERT INTO core.run_key_provision_intent(
        run_id,user_id,owner_ref,identity_session_id,execution_ref,
        requested_at,expires_at,cleanup_state
      ) VALUES (
        $1,$2,$3,$4,$4,clock_timestamp(),
        clock_timestamp()+interval '5 minutes','PREPARED'
      )
    `, [runId, userId, ownerRef, sessionId]);
    await client.query(`
      INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
      VALUES (
        $1::uuid,
        decode(md5(($1::uuid)::text||':secret')||md5(($1::uuid)::text||':secret:2'),'hex'),
        clock_timestamp()
      )
    `, [runId]);
    await client.query(`
      INSERT INTO core.run(
        run_id,question_line,ask_contract,asker_id,session_id,caller_scope,as_of,
        asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
        composition_budget_tier,plan_tier,free_public_rule,depth_params,agent_count,
        discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
        created_at_seq,content_encryption_version,question_blind_index_version,
        content_ciphertext,content_attestation
      ) VALUES (
        $1::uuid,'⟦DEBATEAI:CIPHERTEXT:V1⟧','{"ciphertext":true,"v":1}'::jsonb,
        'owner:'||$2::text,$3::text,'ASKER',clock_timestamp(),
        'standard','standard','ASKER','rev-probe','low',$4,$5,'{}'::jsonb,1,
        '[{}]'::jsonb,0.1,'{}'::jsonb,1,'rev-probe',ledger.allocate_sequence(),1,2,
        '{"v":1,"keyId":"rev-key","nonce":"rev-nonce","ct":"rev-ct","tag":"rev-tag"}'::jsonb,
        audit_crypto_internal.hmac(
          core.content_envelope_attestation_bytes(
            $1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',
            '{"v":1,"keyId":"rev-key","nonce":"rev-nonce","ct":"rev-ct","tag":"rev-tag"}'::jsonb
          ),
          decode(md5(($1::uuid)::text||':secret')||md5(($1::uuid)::text||':secret:2'),'hex'),
          'sha256'
        )
      )
    `, [runId, ownerRef, sessionId, planTier, freePublicRule]);
    await client.query(`
      INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
      VALUES ($1,$2,ledger.allocate_sequence())
    `, [runId, ownerRef]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { runId, userId, ownerRef, sessionId, pseudonym };
}

async function prepareSystem(seed: Seed, publicationRef: string): Promise<boolean> {
  const result = await runtimePool.query<{ prepared: boolean }>(`
    SELECT serve.prepare_system_publication_key_provision($1,$2,$3,$4) AS prepared
  `, [publicationRef, seed.runId, seed.userId, seed.ownerRef]);
  return result.rows[0]?.prepared === true;
}

async function systemPublish(seed: Seed, publicationRef: string): Promise<string | null> {
  const result = await runtimePool.query<{ publication_ref: string | null }>(`
    SELECT core.transition_system_run_publication(
      $1,$2,$3,$4,$5,$6,$7::jsonb,clock_timestamp(),$8,$9
    ) AS publication_ref
  `, [
    randomUUID(), seed.runId, seed.userId, seed.ownerRef, publicationRef,
    seed.pseudonym, JSON.stringify({ public_ref: publicationRef }),
    randomUUID(), randomUUID()
  ]);
  return result.rows[0]?.publication_ref ?? null;
}

// The read GET /v1/runs/{id}/visibility performs, through the PRODUCT's own repository
// (packages/db/src/publication.ts) rather than a transcribed copy of its SQL: at pass 1 this
// helper inlined the query, so a mutant of the repository could not turn it RED.
async function ownedVisibility(seed: Seed): Promise<Readonly<{
  state: string;
  publication_ref: string | null;
  publish_pending: boolean;
}>> {
  const visibility = await repository.readOwnedVisibility(
    seed.runId, seed.userId, seed.ownerRef
  );
  if (visibility === null) throw new TypeError("REV_PROBE_VISIBILITY_MISSING");
  return Object.freeze({
    state: visibility.state,
    publication_ref: visibility.publicRef,
    publish_pending: visibility.publishPending === true
  });
}

async function latestVisibility(runId: string): Promise<string | null> {
  const result = await database.pool.query<{ state: string }>(`
    SELECT event.state FROM core.run_visibility_event AS event
    WHERE event.run_id=$1 ORDER BY event.at_seq DESC LIMIT 1
  `, [runId]);
  return result.rows[0]?.state ?? null;
}

async function issueDeleteGrant(seed: Seed): Promise<Readonly<{
  grantId: string; grantTokenHash: string;
}>> {
  const grantId = randomUUID();
  const grantTokenHash = tokenHash();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,session_id,user_id,action,target_run_id,target_account_id,
      token_hash,issued_at,expires_at,consumed_at
    ) VALUES (
      $1,$2,$3,'DELETE_PRIVATE_DEBATE',$4,NULL,$5,
      clock_timestamp(),clock_timestamp()+interval '5 minutes',NULL
    )
  `, [grantId, seed.sessionId, seed.userId, seed.runId, grantTokenHash]);
  return { grantId, grantTokenHash };
}

async function prepareErasure(
  seed: Seed, grantTokenHash: string
): Promise<Readonly<{ outcome: string; erasure_id: string | null }>> {
  const result = await erasurePool.query<{ outcome: string; erasure_id: string | null }>(`
    SELECT outcome,erasure_id FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)
  `, [seed.runId, seed.userId, seed.ownerRef, seed.sessionId, grantTokenHash]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("REV_PROBE_ERASURE_RESULT_MISSING");
  return row;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtimePool = createPool(database.connectionString, { max: 1 });
  erasurePool = createPool(database.connectionString, { max: 1 });
  await runtimePool.query("SET ROLE debateai_runtime");
  await erasurePool.query("SET ROLE debateai_erasure_runtime");
  repository = new PostgresPublicationRepository(runtimePool, undefined as never);
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await erasurePool?.end();
  await database?.stop();
});

describe("REV(S01) p1 correctness probe — parameters the slice's own tests do not reach", () => {
  it("R-5/R-9/R-11: a stale work row never projects publish_pending beside PUBLISHED", async () => {
    const seed = await seedRun();
    const refWinner = randomUUID();
    const refLoser = randomUUID();
    // Both serves reach prepare before either reaches the transition.
    expect(await prepareSystem(seed, refWinner)).toBe(true);
    expect(await prepareSystem(seed, refLoser)).toBe(true);
    expect(await systemPublish(seed, refWinner)).toBe(refWinner);
    expect(await systemPublish(seed, refLoser)).toBeNull();
    await runtimePool.query(
      "SELECT serve.abandon_system_publication_key_provision($1,$2)",
      [refLoser, seed.userId]
    );
    // The worst case the fix must survive: a crash leaves outstanding work behind on a
    // run that is already PUBLISHED (at db4758da the losing serve wrote exactly this row).
    await runtimePool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_TRANSITION_NULL')",
      [seed.runId, seed.userId, seed.ownerRef]
    );
    const snapshots = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.publication_snapshot WHERE run_id=$1",
      [seed.runId]
    );
    expect(snapshots.rows[0]?.count).toBe("1");
    const stale = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM core.free_public_auto_publish_work
      WHERE run_id=$1 AND cleared_at IS NULL
    `, [seed.runId]);
    expect(stale.rows[0]?.count).toBe("1");
    const visibility = await ownedVisibility(seed);
    // SPEC-v3 R-9 ("exactly one of two observable states") and section 4 step 5 ("two keys").
    expect({ state: visibility.state, pending: visibility.publish_pending })
      .toStrictEqual({ state: "PUBLISHED", pending: false });
  });

  it("R-2: a NULL plan_tier is never bound and never system-publishes", async () => {
    const seed = await seedRun({ planTier: null });
    const bound = await database.pool.query<{ bound: boolean | null }>(
      "SELECT core.run_is_free_public_bound($1) AS bound", [seed.runId]
    );
    expect(bound.rows[0]?.bound).toBe(false);
    const ref = randomUUID();
    // 0070 moved the bound check to the earliest privilege boundary: prepare refuses.
    expect(await prepareSystem(seed, ref)).toBe(false);
    expect(await systemPublish(seed, ref)).toBeNull();
    expect(await latestVisibility(seed.runId)).toBeNull();
  });

  it("R-1: a pre-rule Free run (free_public_rule false) is never bound", async () => {
    const seed = await seedRun({ freePublicRule: false });
    const bound = await database.pool.query<{ bound: boolean | null }>(
      "SELECT core.run_is_free_public_bound($1) AS bound", [seed.runId]
    );
    expect(bound.rows[0]?.bound).toBe(false);
    const ref = randomUUID();
    expect(await prepareSystem(seed, ref)).toBe(false);
    expect(await systemPublish(seed, ref)).toBeNull();
    expect(await latestVisibility(seed.runId)).toBeNull();
  });

  it("R-9/R-10: the reconciler claim is capped at 100 and leaves the overflow for the next pass", async () => {
    await database.pool.query(
      "UPDATE core.free_public_auto_publish_work SET cleared_at=clock_timestamp() WHERE cleared_at IS NULL"
    );
    const zero = await runtimePool.query(
      "SELECT * FROM core.claim_free_public_auto_publish_work(100)"
    );
    expect(zero.rowCount).toBe(0);
    const seeds: Seed[] = [];
    for (let index = 0; index < 101; index += 1) {
      const seed = await seedRun();
      seeds.push(seed);
      await runtimePool.query(
        "SELECT core.ensure_free_public_auto_publish_work($1,$2,$3)",
        [seed.runId, seed.userId, seed.ownerRef]
      );
    }
    const first = await runtimePool.query(
      "SELECT * FROM core.claim_free_public_auto_publish_work(100)"
    );
    expect(first.rowCount).toBe(100);
    const second = await runtimePool.query(
      "SELECT * FROM core.claim_free_public_auto_publish_work(100)"
    );
    expect(second.rowCount).toBe(1);
    // The application asks for 100 by default even when the caller passes more.
    const overflow = await runtimePool.query(
      "SELECT * FROM core.claim_free_public_auto_publish_work(1000)"
    );
    expect(overflow.rowCount).toBe(0);
    // 0070 added a capped exponential backoff: an upserted failure is NOT claimable now.
    const backoffSeed = seeds[0]!;
    await runtimePool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_CIPHER_FAILED')",
      [backoffSeed.runId, backoffSeed.userId, backoffSeed.ownerRef]
    );
    const delayed = await database.pool.query<{ ahead: boolean }>(`
      SELECT next_attempt_at>clock_timestamp() AS ahead
      FROM core.free_public_auto_publish_work WHERE run_id=$1
    `, [backoffSeed.runId]);
    expect(delayed.rows[0]?.ahead).toBe(true);
    for (const seed of seeds) {
      await runtimePool.query(
        "SELECT core.clear_free_public_auto_publish_work($1)", [seed.runId]
      );
    }
  }, 180_000);

  it("R-16/R-17/V-9: delete during an in-flight system publish answers CONTENDED and QUEUES the erasure", async () => {
    const seed = await seedRun();
    const publicationRef = randomUUID();
    expect(await prepareSystem(seed, publicationRef)).toBe(true);
    expect(await systemPublish(seed, publicationRef)).toBe(publicationRef);
    // A second serve (or a crashed first one) leaves a live PREPARED intent behind.
    const orphan = randomUUID();
    await database.pool.query(`
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES ($1,'publication_ref',clock_timestamp()) ON CONFLICT (ref) DO NOTHING
    `, [orphan]);
    await database.pool.query(`
      INSERT INTO serve.system_publication_key_provision_intent(
        publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
      ) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '5 minutes','PREPARED')
    `, [orphan, seed.runId, seed.userId, seed.ownerRef]);
    const grant = await issueDeleteGrant(seed);
    const result = await prepareErasure(seed, grant.grantTokenHash);
    expect(result.outcome).toBe("CONTENDED");
    // V-9's default: the status stays CONTENDED -> 202 {"status":"PENDING"}
    // (apps/api/src/account-erasure.ts:110-112, apps/api/src/index.ts:793), but the
    // erasure must now be DURABLY QUEUED before that 202 is sent.
    expect(await latestVisibility(seed.runId)).toBe("PRIVATE");
    const consumed = await database.pool.query<{ consumed_at: Date | null }>(
      "SELECT consumed_at FROM identity.step_up_grant WHERE step_up_grant_id=$1",
      [grant.grantId]
    );
    expect(consumed.rows[0]?.consumed_at).not.toBeNull();
    const erasures = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.private_run_key_cleanup_intent WHERE run_id=$1",
      [seed.runId]
    );
    expect(erasures.rows[0]?.count).toBe("1");
    const keyCleanup = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM serve.publication_key_cleanup_intent
      WHERE publication_ref=$1 AND cleanup_state='PENDING' AND completed_at IS NULL
    `, [publicationRef]);
    expect(keyCleanup.rows[0]?.count).toBe("1");
    // The orphaned system intent is untouched by the erasure; it expires on its own.
    const orphaned = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.system_publication_key_provision_intent WHERE publication_ref=$1",
      [orphan]
    );
    expect(orphaned.rows[0]?.count).toBe("1");
  }, 120_000);

  it("R-8: a BLOCKED bound run's outstanding work clears and stays clear across two passes", async () => {
    const seed = await seedRun();
    await runtimePool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_CIPHER_FAILED')",
      [seed.runId, seed.userId, seed.ownerRef]
    );
    // apps/api/src/publications.ts:196-199 at db4758da: terminal BLOCKED clears the work.
    await runtimePool.query(
      "SELECT core.clear_free_public_auto_publish_work($1)", [seed.runId]
    );
    for (let pass = 0; pass < 2; pass += 1) {
      const claimed = await runtimePool.query(
        "SELECT * FROM core.claim_free_public_auto_publish_work(100)"
      );
      expect(claimed.rowCount).toBe(0);
      const outstanding = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM core.free_public_auto_publish_work
        WHERE run_id=$1 AND cleared_at IS NULL
      `, [seed.runId]);
      expect(outstanding.rows[0]?.count).toBe("0");
    }
    expect(await latestVisibility(seed.runId)).toBeNull();
  });
});
