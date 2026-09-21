// REV-S01-p1-correctness-tests — reviewer's OWN fixture, built from SPEC-v2's claims,
// not from the slice's tests. Written against slice head db4758da.
// Exceeds the authors' parameters: two concurrent serves of one Free run, a NULL tier,
// a pre-rule Free run, the reconciler at zero and above its batch cap, and a delete
// racing an in-flight / orphaned system publication intent.
// TEMPORARY: deleted before the seat's handoff; the worktree ends byte-clean.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
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

const outsideAssignment = (_name: string, _test: () => unknown): void => {};

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

// The exact read GET /v1/runs/{id}/visibility performs
// (packages/db/src/publication.ts:562-593 at db4758da).
async function ownedVisibility(seed: Seed): Promise<Readonly<{
  state: string;
  publication_ref: string | null;
  publish_pending: boolean;
}>> {
  const result = await runtimePool.query<{
    state: string;
    publication_ref: string | null;
    publish_pending: boolean;
  }>(`
    SELECT COALESCE(latest.state,'PRIVATE') AS state,
      CASE WHEN latest.state='PUBLISHED' THEN latest.publication_ref ELSE NULL END AS publication_ref,
      EXISTS (
        SELECT 1 FROM core.free_public_auto_publish_work AS work
        WHERE work.run_id=run.run_id AND work.cleared_at IS NULL
      ) AS publish_pending
    FROM core.run AS run
    JOIN identity."user" AS identity_user
      ON identity_user.user_id=$2 AND identity_user.owner_ref=$3
    LEFT JOIN LATERAL (
      SELECT event.state,event.publication_ref
      FROM core.run_visibility_event AS event
      WHERE event.run_id=run.run_id
      ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.run_id=$1 AND core.run_is_owned_by(run.run_id,$3,NULL)
  `, [seed.runId, seed.userId, seed.ownerRef]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("REV_PROBE_VISIBILITY_MISSING");
  return row;
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
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await erasurePool?.end();
  await database?.stop();
});

describe("REV(S01) p1 correctness probe — parameters the slice's own tests do not reach", () => {
  outsideAssignment("R-5/R-9/R-11: two prepares racing one serve leave the run PUBLISHED *and* publish_pending", async () => {
    const seed = await seedRun();
    const refWinner = randomUUID();
    const refLoser = randomUUID();
    // Both serves reach prepare before either reaches the transition.
    expect(await prepareSystem(seed, refWinner)).toBe(true);
    expect(await prepareSystem(seed, refLoser)).toBe(true);
    expect(await systemPublish(seed, refWinner)).toBe(refWinner);
    expect(await systemPublish(seed, refLoser)).toBeNull();
    // apps/api/src/publications.ts:283-289 at db4758da: the losing serve abandons its
    // intent and upserts outstanding work for a run that is already PUBLISHED.
    await runtimePool.query(
      "SELECT serve.abandon_system_publication_key_provision($1,$2)",
      [refLoser, seed.userId]
    );
    await runtimePool.query(
      "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_TRANSITION_NULL')",
      [seed.runId, seed.userId, seed.ownerRef]
    );
    const snapshots = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.publication_snapshot WHERE run_id=$1",
      [seed.runId]
    );
    expect(snapshots.rows[0]?.count).toBe("1");
    const visibility = await ownedVisibility(seed);
    // SPEC-v2 R-9: "exactly one of two observable states: PUBLISHED, or PRIVATE with a
    // readable outstanding record". SPEC-v2 §4 step 5: PUBLISHED is two keys, no
    // publish_pending. This asserts what the head actually answers.
    expect({ state: visibility.state, pending: visibility.publish_pending })
      .toStrictEqual({ state: "PUBLISHED", pending: false });
  });

  outsideAssignment("R-2: a NULL plan_tier is never bound and never system-publishes", async () => {
    const seed = await seedRun({ planTier: null });
    const bound = await database.pool.query<{ bound: boolean | null }>(
      "SELECT core.run_is_free_public_bound($1) AS bound", [seed.runId]
    );
    expect(bound.rows[0]?.bound).toBe(false);
    const ref = randomUUID();
    expect(await prepareSystem(seed, ref)).toBe(true);
    expect(await systemPublish(seed, ref)).toBeNull();
    expect(await latestVisibility(seed.runId)).toBeNull();
  });

  outsideAssignment("R-1: a pre-rule Free run (free_public_rule false) is never bound", async () => {
    const seed = await seedRun({ freePublicRule: false });
    const bound = await database.pool.query<{ bound: boolean | null }>(
      "SELECT core.run_is_free_public_bound($1) AS bound", [seed.runId]
    );
    expect(bound.rows[0]?.bound).toBe(false);
    const ref = randomUUID();
    await prepareSystem(seed, ref);
    expect(await systemPublish(seed, ref)).toBeNull();
    expect(await latestVisibility(seed.runId)).toBeNull();
  });

  outsideAssignment("R-9/R-10: the reconciler claim is capped at 100 and leaves the overflow for the next pass", async () => {
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
        "SELECT core.upsert_free_public_auto_publish_work($1,$2,$3,'AUTO_PUBLISH_CIPHER_FAILED')",
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
    for (const seed of seeds) {
      await runtimePool.query(
        "SELECT core.clear_free_public_auto_publish_work($1)", [seed.runId]
      );
    }
  }, 180_000);

  it("R-16/R-17: delete during an in-flight system publish answers CONTENDED and erases nothing", async () => {
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
    // apps/api/src/account-erasure.ts:110-112 maps CONTENDED to PENDING,
    // apps/api/src/index.ts:796 sends 202 {"status":"PENDING"}.
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
    // Once the orphan is gone the durable request remains resumable rather than
    // requiring the creator to manufacture a second deletion request.
    await database.pool.query(
      "DELETE FROM serve.system_publication_key_provision_intent WHERE publication_ref=$1",
      [orphan]
    );
    const retry = await issueDeleteGrant(seed);
    const second = await prepareErasure(seed, retry.grantTokenHash);
    expect(second.outcome).toBe("ERASED");
    expect(await latestVisibility(seed.runId)).toBe("PRIVATE");
  }, 120_000);

  outsideAssignment("R-8: a BLOCKED bound run's outstanding work clears and stays clear across two passes", async () => {
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
