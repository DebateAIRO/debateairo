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

type PrepareResult = Readonly<{
  outcome: string;
  erasure_id: string | null;
}>;

let database: TestDatabase;
let runtimePool: Pool;
let erasurePool: Pool;
let cleanupPool: Pool;
let unprivilegedPool: Pool;

const SYSTEM_PUBLISH_ACTOR = "00000000-0000-4000-8000-0000000000f1";
const BOUND_ERASURE_ACTOR = "00000000-0000-4000-8000-0000000000f2";

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
  const pseudonym = `C4 Creator ${runId}`;
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
        'standard','standard','ASKER','c4-test','low',$4,$5,'{}'::jsonb,1,
        '[{}]'::jsonb,0.1,'{}'::jsonb,1,'c4-test',ledger.allocate_sequence(),1,2,
        '{"v":1,"keyId":"c4-key","nonce":"c4-nonce","ct":"c4-ciphertext","tag":"c4-tag"}'::jsonb,
        audit_crypto_internal.hmac(
          core.content_envelope_attestation_bytes(
            $1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',
            '{"v":1,"keyId":"c4-key","nonce":"c4-nonce","ct":"c4-ciphertext","tag":"c4-tag"}'::jsonb
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

async function issueGrant(
  seed: Seed,
  targetRunId = seed.runId,
  action: "DELETE_PRIVATE_DEBATE" | "PUBLISH" = "DELETE_PRIVATE_DEBATE"
): Promise<Readonly<{
  grantId: string;
  grantTokenHash: string;
}>> {
  const grantId = randomUUID();
  const grantTokenHash = tokenHash();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,session_id,user_id,action,target_run_id,target_account_id,
      token_hash,issued_at,expires_at,consumed_at
    ) VALUES (
      $1,$2,$3,$6,$4,NULL,$5,
      clock_timestamp(),clock_timestamp()+interval '5 minutes',NULL
    )
  `, [grantId, seed.sessionId, seed.userId, targetRunId, grantTokenHash, action]);
  return { grantId, grantTokenHash };
}

async function prepareErasure(seed: Seed, targetRunId = seed.runId): Promise<PrepareResult> {
  const grant = await issueGrant(seed, targetRunId);
  const result = await erasurePool.query<PrepareResult>(`
    SELECT outcome,erasure_id
    FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)
  `, [targetRunId, seed.userId, seed.ownerRef, seed.sessionId, grant.grantTokenHash]);
  const row = result.rows[0];
  if (row === undefined) throw new TypeError("C4_ERASURE_RESULT_MISSING");
  return row;
}

async function prepareSystemPublication(seed: Seed, publicationRef: string): Promise<void> {
  const prepared = await runtimePool.query<{ prepared: boolean }>(`
    SELECT serve.prepare_system_publication_key_provision($1,$2,$3,$4) AS prepared
  `, [publicationRef, seed.runId, seed.userId, seed.ownerRef]);
  if (prepared.rows[0]?.prepared !== true) throw new TypeError("C4_SYSTEM_PREPARE_FAILED");
}

async function systemPublish(seed: Seed): Promise<string> {
  const publicationRef = randomUUID();
  await prepareSystemPublication(seed, publicationRef);
  const published = await runtimePool.query<{ publication_ref: string | null }>(`
    SELECT core.transition_system_run_publication(
      $1,$2,$3,$4,$5,$6,$7::jsonb,clock_timestamp(),$8,$9
    ) AS publication_ref
  `, [
    randomUUID(), seed.runId, seed.userId, seed.ownerRef, publicationRef,
    seed.pseudonym, JSON.stringify({ public_ref: publicationRef }),
    randomUUID(), randomUUID()
  ]);
  if (published.rows[0]?.publication_ref !== publicationRef) {
    throw new TypeError("C4_SYSTEM_PUBLISH_FAILED");
  }
  return publicationRef;
}

async function markPublishedForOwnerPath(seed: Seed): Promise<string> {
  const publicationRef = randomUUID();
  const eventId = randomUUID();
  const auditId = randomUUID();
  const deniedAuditId = randomUUID();
  const reservationId = randomUUID();
  const visibilityActorRef = randomUUID();
  const auditActorRef = randomUUID();
  const auditTargetRef = randomUUID();
  const deniedAuditActorRef = randomUUID();
  const deniedAuditTargetRef = randomUUID();
  const grant = await issueGrant(seed, seed.runId, "PUBLISH");
  await database.pool.query(`
    INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
    VALUES ($1,'publication_ref',clock_timestamp())
  `, [publicationRef]);
  await database.pool.query(`
    INSERT INTO serve.publication_key_provision_intent(
      publication_ref,run_id,user_id,owner_ref,session_id,grant_token_hash,
      requested_at,expires_at,cleanup_state
    ) VALUES (
      $1,$2,$3,$4,$5,$6,clock_timestamp(),
      clock_timestamp()+interval '5 minutes','PREPARED'
    )
  `, [
    publicationRef, seed.runId, seed.userId, seed.ownerRef,
    seed.sessionId, grant.grantTokenHash
  ]);
  await database.pool.query(`
    INSERT INTO identity.publication_event_binding(
      reservation_id,user_id,session_id,run_id,action,grant_token_hash,
      visibility_event_id,visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,
      denied_audit_id,denied_audit_actor_ref,denied_audit_target_ref,grant_id,
      created_at,expires_at,consumed_at
    ) VALUES (
      $1,$2,$3,$4,'PUBLISH',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
      clock_timestamp(),clock_timestamp()+interval '5 minutes',NULL
    )
  `, [
    reservationId, seed.userId, seed.sessionId, seed.runId, grant.grantTokenHash,
    eventId, visibilityActorRef, auditId, auditActorRef, auditTargetRef,
    deniedAuditId, deniedAuditActorRef, deniedAuditTargetRef, grant.grantId
  ]);
  const published = await runtimePool.query<{ publication_ref: string | null }>(`
    SELECT core.transition_run_publication(
      $1,$2,$3,$4,$5,$6,'PUBLISH',$7,$8,$9::jsonb,clock_timestamp(),$10,$11,$12
    ) AS publication_ref
  `, [
    eventId, seed.runId, seed.userId, seed.ownerRef, seed.sessionId,
    grant.grantTokenHash, publicationRef, seed.pseudonym,
    JSON.stringify({ public_ref: publicationRef }), auditId, deniedAuditId, reservationId
  ]);
  if (published.rows[0]?.publication_ref !== publicationRef) {
    throw new TypeError("C4_OWNER_PUBLISH_FAILED");
  }
  return publicationRef;
}

async function insertSystemIntent(
  seed: Seed,
  input: Readonly<{ expired?: boolean }> = {}
): Promise<string> {
  const publicationRef = randomUUID();
  await database.pool.query(`
    INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
    VALUES ($1,'publication_ref',clock_timestamp())
  `, [publicationRef]);
  await database.pool.query(`
    INSERT INTO serve.system_publication_key_provision_intent(
      publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
    ) VALUES (
      $1,$2,$3,$4,clock_timestamp()-interval '10 minutes',
      clock_timestamp()+CASE WHEN $5::boolean THEN -interval '5 minutes' ELSE interval '5 minutes' END,
      'PREPARED'
    )
  `, [publicationRef, seed.runId, seed.userId, seed.ownerRef, input.expired ?? false]);
  return publicationRef;
}

async function insertSystemIntentForRef(
  seed: Seed,
  publicationRef: string,
  input: Readonly<{ expired?: boolean }> = {}
): Promise<void> {
  await database.pool.query(`
    INSERT INTO serve.system_publication_key_provision_intent(
      publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
    ) VALUES (
      $1,$2,$3,$4,clock_timestamp()-interval '10 minutes',
      clock_timestamp()+CASE WHEN $5::boolean THEN -interval '5 minutes' ELSE interval '5 minutes' END,
      'PREPARED'
    )
  `, [publicationRef, seed.runId, seed.userId, seed.ownerRef, input.expired ?? false]);
}

async function insertPendingCleanup(publicationRef: string): Promise<void> {
  await database.pool.query(`
    INSERT INTO serve.publication_key_cleanup_intent(
      publication_ref,requested_at,completed_at,cleanup_state,
      cleanup_claim_token,cleanup_claim_expires_at,destroy_result
    ) VALUES ($1,clock_timestamp(),NULL,'PENDING',NULL,NULL,NULL)
    ON CONFLICT (publication_ref) DO UPDATE
    SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
      completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
      cleanup_claim_expires_at=NULL,destroy_result=NULL
  `, [publicationRef]);
}

async function directPrivateVisibility(
  seed: Seed,
  publicationRef: string,
  actorAuditToken: string
): Promise<string | undefined> {
  const result = await erasurePool.query<{ sqlstate: string | null }>(`
    SELECT core.c4_test_attempt_visibility_insert(
      $1,$2,$3,'PRIVATE',$4,'COPIES_MAY_PERSIST_V1'
    ) AS sqlstate
  `, [randomUUID(), seed.runId, publicationRef, actorAuditToken]);
  return result.rows[0]?.sqlstate ?? undefined;
}

async function directSystemPublishedVisibility(
  seed: Seed,
  publicationRef: string
): Promise<string | undefined> {
  const result = await runtimePool.query<{ sqlstate: string | null }>(`
    SELECT core.c4_test_attempt_visibility_insert(
      $1,$2,$3,'PUBLISHED',$4,'PUBLIC_INDEXED_V1'
    ) AS sqlstate
  `, [randomUUID(), seed.runId, publicationRef, SYSTEM_PUBLISH_ACTOR]);
  return result.rows[0]?.sqlstate ?? undefined;
}

async function count(query: string, values: readonly unknown[]): Promise<number> {
  const result = await database.pool.query<{ count: string }>(query, [...values]);
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`
    CREATE ROLE debateai_c4_unprivileged NOLOGIN NOINHERIT;
    GRANT USAGE ON SCHEMA core TO debateai_c4_unprivileged;
    CREATE OR REPLACE FUNCTION core.c4_test_attempt_visibility_insert(
      p_event_id uuid,p_run_id uuid,p_publication_ref uuid,p_state text,
      p_actor_audit_token uuid,p_warning_version text
    ) RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path=pg_catalog
    AS $function$
    BEGIN
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES (
        p_event_id,p_run_id,p_publication_ref,p_state,p_actor_audit_token,
        2,p_warning_version,clock_timestamp(),ledger.allocate_sequence()
      );
      RETURN NULL;
    EXCEPTION WHEN OTHERS THEN
      RETURN SQLSTATE;
    END;
    $function$;
    REVOKE ALL ON FUNCTION core.c4_test_attempt_visibility_insert(
      uuid,uuid,uuid,text,uuid,text
    ) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION core.c4_test_attempt_visibility_insert(
      uuid,uuid,uuid,text,uuid,text
    ) TO debateai_runtime,debateai_erasure_runtime
  `);
  runtimePool = createPool(database.connectionString, { max: 1 });
  erasurePool = createPool(database.connectionString, { max: 1 });
  cleanupPool = createPool(database.connectionString, { max: 1 });
  unprivilegedPool = createPool(database.connectionString, { max: 1 });
  await runtimePool.query("SET ROLE debateai_runtime");
  await erasurePool.query("SET ROLE debateai_erasure_runtime");
  await cleanupPool.query("SET ROLE debateai_publication_cleanup");
  await unprivilegedPool.query("SET ROLE debateai_c4_unprivileged");
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await erasurePool?.end();
  await cleanupPool?.end();
  await unprivilegedPool?.end();
  await database?.stop();
});

describe("S01-C4 published-run erasure on real PostgreSQL", () => {
  it("admits a bound system-published run under debateai_erasure_runtime", async () => {
    // PROPERTY: bound PUBLISHED bypasses only the historical PUBLISHED return.
    // CATCHES: omitting the bound carve-out. NEIGHBOUR: Premium remains PUBLISHED.
    const seed = await seedRun();
    await systemPublish(seed);
    const result = await prepareErasure(seed);
    expect(["PREPARED", "COMMITTED", "ERASED", "CLEANED"]).toContain(result.outcome);
    expect(result.outcome).not.toBe("CONTENDED");
  });

  it("writes PRIVATE and removes the old public ref from latest membership", async () => {
    // PROPERTY: admitted deletion makes the live public ref unreachable by latest visibility.
    // CATCHES: falling through without the PRIVATE event. NEIGHBOUR: the snapshot remains cleanup evidence.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    const result = await prepareErasure(seed);
    const latest = await database.pool.query<{ state: string; publication_ref: string | null }>(`
      SELECT state,publication_ref FROM core.run_visibility_event
      WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1
    `, [seed.runId]);
    const publicMembership = await count(`
      WITH latest AS (
        SELECT DISTINCT ON (run_id) run_id,publication_ref,state
        FROM core.run_visibility_event ORDER BY run_id,at_seq DESC
      ) SELECT count(*) FROM latest WHERE publication_ref=$1 AND state='PUBLISHED'
    `, [publicationRef]);
    expect({ outcome: result.outcome, latest: latest.rows[0], publicMembership }).toMatchObject({
      outcome: "PREPARED",
      latest: { state: "PRIVATE", publication_ref: publicationRef },
      publicMembership: 0
    });
  });

  it("uses only the pinned bound-erasure visibility shape", async () => {
    // PROPERTY: bound erasure emits exactly f2/v2/PRIVATE/COPIES while minting no owner binding or audit.
    // CATCHES: reusing f1, fabricating UNPUBLISH authority, or emitting a system unpublished audit.
    // NEIGHBOUR: the existing system PUBLISHED event retains f1 and PUBLIC_INDEXED_V1.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    const unpublishedBefore = await count(`
      SELECT count(*) FROM identity.audit_event
      WHERE event_type='debate.publication.unpublished'
    `, []);
    const result = await prepareErasure(seed);
    const latest = await database.pool.query<{
      state: string;
      publication_ref: string | null;
      actor_audit_token: string;
      actor_ref_version: number;
      warning_version: string;
    }>(`
      SELECT state,publication_ref,actor_audit_token,actor_ref_version,warning_version
      FROM core.run_visibility_event
      WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1
    `, [seed.runId]);
    const bindingCount = await count(`
      SELECT count(*) FROM identity.publication_event_binding WHERE run_id=$1
    `, [seed.runId]);
    const unpublishedAfter = await count(`
      SELECT count(*) FROM identity.audit_event
      WHERE event_type='debate.publication.unpublished'
    `, []);
    expect({
      outcome: result.outcome,
      latest: latest.rows[0],
      bindingCount,
      unpublishedDelta: unpublishedAfter - unpublishedBefore
    }).toEqual({
      outcome: "PREPARED",
      latest: {
        state: "PRIVATE",
        publication_ref: publicationRef,
        actor_audit_token: BOUND_ERASURE_ACTOR,
        actor_ref_version: 2,
        warning_version: "COPIES_MAY_PERSIST_V1"
      },
      bindingCount: 0,
      unpublishedDelta: 0
    });
  });

  it("rejects the f2 PRIVATE shape for a Premium run even with pending cleanup", async () => {
    // PROPERTY: cleanup state cannot turn an unbound run into a bound-erasure transition.
    // CATCHES: omitting run_is_free_public_bound from the f2 admission.
    // NEIGHBOUR: the same shape is admitted for a bound run with pending cleanup.
    const seed = await seedRun({ planTier: "premium" });
    const publicationRef = await markPublishedForOwnerPath(seed);
    await insertPendingCleanup(publicationRef);
    await expect(
      directPrivateVisibility(seed, publicationRef, BOUND_ERASURE_ACTOR)
    ).resolves.toBe("55000");
  });

  it("rejects the f2 PRIVATE shape for a bound run without pending cleanup", async () => {
    // PROPERTY: the pinned actor is authorized only after cleanup is durably pending.
    // CATCHES: admitting f2 on bound membership alone.
    // NEIGHBOUR: prepare_private_run_erasure writes cleanup before visibility.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    await expect(
      directPrivateVisibility(seed, publicationRef, BOUND_ERASURE_ACTOR)
    ).resolves.toBe("55000");
  });

  it("rejects the system-publish f1 actor for bound PRIVATE even with pending cleanup", async () => {
    // PROPERTY: f1 authorizes only system PUBLISHED; bound erasure has a distinct f2 capability.
    // CATCHES: broadening the pre-existing f1 exception to PRIVATE.
    // NEIGHBOUR: the exact f2 shape is admitted inside the erasure function.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    await insertPendingCleanup(publicationRef);
    await expect(
      directPrivateVisibility(seed, publicationRef, SYSTEM_PUBLISH_ACTOR)
    ).resolves.toBe("55000");
  });

  it("rejects f1 PUBLISHED for an unbound run even with a prepared intent", async () => {
    // PROPERTY: f1 admission independently enforces the Free/public binding rule.
    // CATCHES: relying only on transition_system_run_publication for boundness.
    // NEIGHBOUR: the existing bound/live f1 system publication remains admitted.
    const seed = await seedRun({ planTier: "premium" });
    const publicationRef = await markPublishedForOwnerPath(seed);
    await insertSystemIntentForRef(seed, publicationRef);
    await expect(directSystemPublishedVisibility(seed, publicationRef)).resolves.toBe("55000");
  });

  it("rejects f1 PUBLISHED after its prepared intent lease expires", async () => {
    // PROPERTY: a PREPARED intent authorizes f1 only during its lease.
    // CATCHES: checking cleanup_state without checking expires_at.
    // NEIGHBOUR: a live prepared intent still admits the normal system transition.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    await insertSystemIntentForRef(seed, publicationRef, { expired: true });
    await expect(directSystemPublishedVisibility(seed, publicationRef)).resolves.toBe("55000");
  });

  it("rejects f2 PRIVATE when the cleanup publication belongs to another run", async () => {
    // PROPERTY: f2 cleanup proof and publication snapshot must name the same run as the event.
    // CATCHES: authorizing run A with run B's pending cleanup publication_ref.
    // NEIGHBOUR: erasure of the run that owns the snapshot remains admitted.
    const victim = await seedRun();
    const attacker = await seedRun();
    const victimRef = await systemPublish(victim);
    await systemPublish(attacker);
    await insertPendingCleanup(victimRef);
    await expect(
      directPrivateVisibility(attacker, victimRef, BOUND_ERASURE_ACTOR)
    ).resolves.toBe("55000");
  });

  it("keeps a Premium published run at PUBLISHED", async () => {
    // PROPERTY: Premium never enters the bound-public erasure carve-out.
    // CATCHES: deleting the bound predicate. NEIGHBOUR: bound Free is admitted.
    const seed = await seedRun({ planTier: "premium" });
    await markPublishedForOwnerPath(seed);
    await expect(prepareErasure(seed)).resolves.toMatchObject({ outcome: "PUBLISHED" });
  });

  it("keeps a pre-rule Free published run at PUBLISHED", async () => {
    // PROPERTY: Free tier alone cannot authorize published erasure.
    // CATCHES: ignoring free_public_rule. NEIGHBOUR: rule=true is admitted.
    const seed = await seedRun({ planTier: "free", freePublicRule: false });
    await markPublishedForOwnerPath(seed);
    await expect(prepareErasure(seed)).resolves.toMatchObject({ outcome: "PUBLISHED" });
  });

  it("allows the erasure role and denies an unprivileged role with 42501", async () => {
    // PROPERTY: CREATE OR REPLACE preserves the product-role grant but grants nothing to unrelated roles.
    // CATCHES: DROP/recreate or PUBLIC execute. NEIGHBOUR: invalid product inputs remain typed, not 42501.
    const seed = await seedRun();
    await systemPublish(seed);
    const runtime = await prepareErasure(seed);
    let sqlstate: string | undefined;
    try {
      await unprivilegedPool.query(
        "SELECT * FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)",
        [seed.runId, seed.userId, seed.ownerRef, seed.sessionId, tokenHash()]
      );
    } catch (error) {
      sqlstate = (error as { code?: string }).code;
    }
    expect({ runtime: runtime.outcome, sqlstate }).toEqual({ runtime: "PREPARED", sqlstate: "42501" });
  });

  it("preserves the five-argument function identity and EXECUTE grant", async () => {
    // PROPERTY: migration 0068 replaces the existing signature in place.
    // CATCHES: DROP or overload. NEIGHBOUR: unrelated roles remain denied.
    const result = await database.pool.query<{
      signature: string | null;
      erasure_allowed: boolean;
      unprivileged_allowed: boolean;
    }>(`
      SELECT
        to_regprocedure('core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)')::text AS signature,
        has_function_privilege(
          'debateai_erasure_runtime',
          'core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)',
          'execute'
        ) AS erasure_allowed,
        has_function_privilege(
          'debateai_c4_unprivileged',
          'core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)',
          'execute'
        ) AS unprivileged_allowed
    `);
    expect(result.rows[0]).toEqual({
      signature: "core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)",
      erasure_allowed: true,
      unprivileged_allowed: false
    });
  });

  it("returns CONTENDED only after queuing erasure during a live system publication intent", async () => {
    // PROPERTY: HTTP PENDING is backed by durable cleanup work and immediate public-list removal.
    // CATCHES: returning CONTENDED before consuming the grant or preparing any erasure work.
    // NEIGHBOUR: an expired intent removed before deletion follows the synchronous PREPARED path.
    const seed = await seedRun();
    const publicationRef = await systemPublish(seed);
    await insertSystemIntent(seed);
    const grant = await issueGrant(seed);
    const prepared = await erasurePool.query<PrepareResult>(`
      SELECT outcome,erasure_id
      FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)
    `, [seed.runId, seed.userId, seed.ownerRef, seed.sessionId, grant.grantTokenHash]);
    const latest = await database.pool.query<{ state: string; publication_ref: string | null }>(`
      SELECT state,publication_ref FROM core.run_visibility_event
      WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1
    `, [seed.runId]);
    const consumed = await count(`
      SELECT count(*) FROM identity.step_up_grant
      WHERE step_up_grant_id=$1 AND consumed_at IS NOT NULL
    `, [grant.grantId]);
    const erasureQueue = await count(`
      SELECT count(*) FROM serve.private_run_key_cleanup_intent WHERE run_id=$1
    `, [seed.runId]);
    const publicationCleanup = await count(`
      SELECT count(*) FROM serve.publication_key_cleanup_intent
      WHERE publication_ref=$1 AND cleanup_state='PENDING' AND completed_at IS NULL
    `, [publicationRef]);
    const attestationSecret = await count(`
      SELECT count(*) FROM core.run_content_attestation_secret WHERE run_id=$1
    `, [seed.runId]);
    expect({
      prepared: prepared.rows[0], latest: latest.rows[0], consumed,
      erasureQueue, publicationCleanup, attestationSecret
    }).toEqual({
      prepared: { outcome: "CONTENDED", erasure_id: null },
      latest: { state: "PRIVATE", publication_ref: publicationRef },
      consumed: 1,
      erasureQueue: 1,
      publicationCleanup: 1,
      attestationSecret: 0
    });
  });

  it("admits erasure after cleanup removes an expired orphan system intent", async () => {
    // PROPERTY: only a live system publication intent contends erasure.
    // CATCHES: treating an expired orphan as permanent contention. NEIGHBOUR: a future PREPARED row contends.
    const seed = await seedRun();
    await systemPublish(seed);
    const orphanRef = await insertSystemIntent(seed, { expired: true });
    const claimed = await cleanupPool.query<{ publication_ref: string; claim_token: string }>(`
      SELECT * FROM serve.claim_system_publication_key_provision_cleanup(100)
    `);
    const orphan = claimed.rows.find((row) => row.publication_ref === orphanRef);
    const completed = orphan === undefined ? false : (await cleanupPool.query<{ completed: boolean }>(`
      SELECT serve.complete_system_publication_key_provision_cleanup($1,$2) AS completed
    `, [orphanRef, orphan.claim_token])).rows[0]?.completed === true;
    const result = await prepareErasure(seed);
    expect({ claimed: orphan?.publication_ref, completed, outcome: result.outcome }).toEqual({
      claimed: orphanRef, completed: true, outcome: "PREPARED"
    });
  });

  it("returns NOT_FOUND for a different authenticated owner", async () => {
    // PROPERTY: ownership is checked before the bound-public carve-out.
    // CATCHES: applying bound deletion to a non-owner. NEIGHBOUR: the creator is admitted.
    const creator = await seedRun();
    const other = await seedRun();
    await systemPublish(creator);
    await expect(prepareErasure(other, creator.runId)).resolves.toMatchObject({ outcome: "NOT_FOUND" });
  });

  it("still contends on a different snapshot with no completed cleanup", async () => {
    // PROPERTY: the carve-out excludes only the public ref it just scheduled for cleanup.
    // CATCHES: exempting every snapshot of the run. NEIGHBOUR: the current public ref is admitted.
    const seed = await seedRun();
    await systemPublish(seed);
    const otherRef = randomUUID();
    await database.pool.query(`
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES ($1,'publication_ref',clock_timestamp())
    `, [otherRef]);
    await database.pool.query(`
      INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at
      ) VALUES ($1,$2,1,'{}'::jsonb,clock_timestamp())
    `, [otherRef, seed.runId]);
    await expect(prepareErasure(seed)).resolves.toMatchObject({ outcome: "CONTENDED" });
  });
});
