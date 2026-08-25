import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const sourceContext = JSON.stringify({
  ipArgon2id: `argon2id-audit:v1:${"1".repeat(64)}`,
  userAgentArgon2id: `argon2id-audit:v1:${"2".repeat(64)}`
});

function opaqueHash(): string {
  return `sha256:${randomBytes(32).toString("hex")}`;
}

async function encryptedRunDocument(
  client: Pick<Pool,"query"> | Pick<PoolClient,"query">,
  input: Readonly<{ runId:string;ownerRef:string;executionRef:string;provenance:string }>
): Promise<Readonly<Record<string,unknown>>> {
  const secret = randomBytes(32);
  const envelope = { v:1,keyId:"s10-t9",nonce:"AA==",ct:"AA==",tag:"AA==" };
  const attestation = (await client.query<{ attestation: Buffer }>(`
    SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes(
        $1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb
      ),$3,'sha256'
    ) AS attestation
  `,[input.runId,JSON.stringify(envelope),secret])).rows[0]!.attestation;
  return Object.freeze({
    runId:input.runId,questionLine:"⟦DEBATEAI:CIPHERTEXT:V1⟧",
    askerId:`owner:${input.ownerRef}`,executionRef:input.executionRef,
    callerScope:"ASKER",asOf:new Date().toISOString(),askerRiskTier:"casual",
    riskTier:"casual",tierSource:"ASKER",tierProvenanceRef:input.provenance,
    compositionBudgetTier:"low",depthParams:{ depth:1 },
    discoveredPanel:[{ agentId:"s10-t9-agent" }],strangerSampleRate:1,
    envelopeBasis:{ source:input.provenance },registerVersion:1,
    batteryVersion:input.provenance,askContract:{ ciphertext:true,v:1 },
    contentCiphertext:envelope,contentAttestation:attestation.toString("base64"),
    contentAttestationSecret:secret.toString("base64")
  });
}

interface Fixture {
  readonly userId: string;
  readonly ownerRef: string;
  readonly auditToken: string;
  readonly passwordHash: string;
  readonly emailBlindIndex: Buffer;
  readonly emailChannelId: string;
  readonly verificationTokenHash: string;
  readonly factorId: string;
  readonly recoveryCodeId: string;
  readonly sessionId: string;
  readonly sessionTokenHash: string;
  readonly loginChallengeId: string;
  readonly loginChallengeTokenHash: string;
  readonly bindingHash: string;
  readonly erasureId: string;
}

interface EncryptedRunFixture extends Fixture {
  readonly runId: string;
  readonly executionRef: string;
}

interface PrivateErasureFixture extends EncryptedRunFixture {
  readonly deleteGrantHash: string;
  readonly privateErasureId: string;
}

interface ClaimedProvisionFixture extends Fixture {
  readonly runId: string;
  readonly executionRef: string;
  readonly claimToken: string;
}

async function fixtureAccount(label: string): Promise<Fixture> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const emailBlindIndex = randomBytes(32);
  const passwordHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const emailChannelId = randomUUID();
  const recoveryChannelId = randomUUID();
  const verificationTokenHash = opaqueHash();
  const factorId = randomUUID();
  const recoveryCodeId = randomUUID();
  const sessionId = randomUUID();
  const sessionTokenHash = opaqueHash();
  const loginChallengeId = randomUUID();
  const loginChallengeTokenHash = opaqueHash();
  const bindingHash = opaqueHash();
  const erasureId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `,[userId,emailBlindIndex,passwordHash,`s10-t9-${label}-${randomUUID()}`,auditToken,ownerRef]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,
      verified_at,verification_token_hash,verification_expires_at,
      verification_last_sent_at,verification_consumed_at,delivery_status,delivery_error
    ) VALUES
      ($1,$3,'email','{}','verified',clock_timestamp(),clock_timestamp(),$4,
        clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',
        clock_timestamp(),'sent',NULL),
      ($2,$3,'recovery_email','{}','verified',clock_timestamp(),clock_timestamp(),
        NULL,NULL,NULL,NULL,'not_requested',NULL)
  `,[emailChannelId,recoveryChannelId,userId,verificationTokenHash]);
  await database.pool.query(`
    INSERT INTO identity.verification_token_credential(
      token_hash,channel_binding_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour',clock_timestamp()-interval '30 seconds')
  `,[verificationTokenHash,emailChannelId]);
  await database.pool.query(`
    INSERT INTO identity.mfa_factor(
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,revoked_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}',NULL,NULL,'active',clock_timestamp(),
      clock_timestamp(),NULL,10)
  `,[factorId,userId]);
  await database.pool.query(`
    INSERT INTO identity.recovery_code(
      recovery_code_id,user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
    ) VALUES ($1,$2,1,$3,clock_timestamp(),NULL,NULL)
  `,[recoveryCodeId,userId,opaqueHash()]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),
      clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp(),NULL)
  `,[sessionId,userId,sessionTokenHash,opaqueHash(),bindingHash]);
  await database.pool.query(`
    INSERT INTO identity.login_challenge(
      login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
      password_hash_snapshot,created_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),
      clock_timestamp()+interval '1 hour',NULL)
  `,[loginChallengeId,userId,factorId,loginChallengeTokenHash,bindingHash,passwordHash]);
  await database.pool.query(`
    INSERT INTO identity.account_erasure_request(
      erasure_id,user_id,requested_at,execute_at
    ) VALUES ($1,$2,clock_timestamp()-interval '2 seconds',
      clock_timestamp()-interval '1 second')
  `,[erasureId,userId]);
  return Object.freeze({
    userId,ownerRef,auditToken,passwordHash,emailBlindIndex,emailChannelId,
    verificationTokenHash,factorId,recoveryCodeId,sessionId,sessionTokenHash,
    loginChallengeId,loginChallengeTokenHash,bindingHash,erasureId
  });
}

async function encryptedRunFixture(label: string): Promise<EncryptedRunFixture> {
  const account = await fixtureAccount(label);
  const runId = randomUUID();
  const provision = await database.pool.query<{ execution_ref: string | null }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId,account.userId,account.ownerRef,account.sessionId]
  );
  const executionRef = provision.rows[0]?.execution_ref;
  expect(executionRef).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  const document = await encryptedRunDocument(database.pool,{
    runId,ownerRef:account.ownerRef,executionRef:executionRef!,provenance:"s10:t9-race"
  });
  const created = await database.pool.query<{ created: boolean }>(
    "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document),account.userId,account.ownerRef,JSON.stringify([])]
  );
  expect(created.rows[0]?.created).toBe(true);
  return Object.freeze({ ...account,runId,executionRef: executionRef! });
}

async function claimedProvisionFixture(label: string): Promise<ClaimedProvisionFixture> {
  const account = await fixtureAccount(label);
  const runId = randomUUID();
  const provision = await database.pool.query<{ execution_ref: string | null }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId,account.userId,account.ownerRef,account.sessionId]
  );
  const executionRef = provision.rows[0]?.execution_ref;
  expect(executionRef).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  await database.pool.query(`
    UPDATE core.run_key_provision_intent
    SET requested_at=clock_timestamp()-interval '2 minutes',
      expires_at=clock_timestamp()-interval '1 minute'
    WHERE run_id=$1
  `,[runId]);
  const claimer = await database.pool.connect();
  try {
    await claimer.query("BEGIN");
    await claimer.query("SET LOCAL ROLE debateai_content_provision");
    const claimed = await claimer.query<{
      run_id: string;
      claim_token: string;
    }>("SELECT run_id,claim_token FROM core.claim_run_key_provision_cleanup(100)");
    await claimer.query("COMMIT");
    const row = claimed.rows.find((candidate) => candidate.run_id === runId);
    expect(row?.claim_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    return Object.freeze({
      ...account,runId,executionRef: executionRef!,claimToken: row!.claim_token
    });
  } finally {
    await claimer.query("ROLLBACK").catch(() => undefined);
    claimer.release();
  }
}

async function attemptClaimedRunCreation(
  client: PoolClient,fixture: ClaimedProvisionFixture
): Promise<boolean> {
  // In production the attestation is computed from the external run key before
  // the least-privilege content-provision SQL call. Keep that pure preparation
  // outside the role-switched transaction so this race reaches the DB locks.
  const document = await encryptedRunDocument(database.pool,{
    runId:fixture.runId,ownerRef:fixture.ownerRef,executionRef:fixture.executionRef,
    provenance:"s10:t9-provision-cleanup-race"
  });
  const created = await client.query<{ created: boolean }>(
    "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document),fixture.userId,fixture.ownerRef,JSON.stringify([])]
  );
  return created.rows[0]?.created === true;
}

async function completeProvisionCleanup(
  client: PoolClient,fixture: ClaimedProvisionFixture,claimToken=fixture.claimToken
): Promise<boolean> {
  const result = await client.query<{ completed: boolean }>(
    "SELECT core.complete_run_key_provision_cleanup($1,$2) AS completed",
    [fixture.runId,claimToken]
  );
  return result.rows[0]?.completed === true;
}

async function privateErasureFixture(label: string): Promise<PrivateErasureFixture> {
  const fixture = await encryptedRunFixture(label);
  const deleteGrantHash = opaqueHash();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      target_account_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,'DELETE_PRIVATE_DEBATE',$5,NULL,
      clock_timestamp(),clock_timestamp()+interval '5 minutes',NULL)
  `,[randomUUID(),deleteGrantHash,fixture.sessionId,fixture.userId,fixture.runId]);
  const prepared = await database.pool.query<{
    outcome: string;
    erasure_id: string | null;
  }>("SELECT * FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)",[
    fixture.runId,fixture.userId,fixture.ownerRef,fixture.sessionId,deleteGrantHash
  ]);
  expect(prepared.rows[0]?.outcome).toBe("PREPARED");
  expect(prepared.rows[0]?.erasure_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  return Object.freeze({
    ...fixture,deleteGrantHash,privateErasureId: prepared.rows[0]!.erasure_id!
  });
}

async function accountChildSnapshot(fixture: Fixture): Promise<string> {
  const queries = [
    `SELECT * FROM identity.channel_binding WHERE user_id=$1 ORDER BY channel_type,channel_binding_id`,
    `SELECT credential.* FROM identity.verification_token_credential AS credential
       JOIN identity.channel_binding AS channel USING (channel_binding_id)
       WHERE channel.user_id=$1 ORDER BY credential.channel_binding_id,credential.token_hash`,
    `SELECT * FROM identity.mfa_factor WHERE user_id=$1 ORDER BY mfa_factor_id`,
    `SELECT * FROM identity.recovery_code WHERE user_id=$1 ORDER BY recovery_code_id`,
    `SELECT * FROM identity.session WHERE user_id=$1 ORDER BY session_id`,
    `SELECT * FROM identity.login_challenge WHERE user_id=$1 ORDER BY login_challenge_id`,
    `SELECT * FROM identity.step_up_grant WHERE user_id=$1 ORDER BY step_up_grant_id`
  ];
  const result = [];
  for (const sql of queries) result.push((await database.pool.query(sql,[fixture.userId])).rows);
  return JSON.stringify(result);
}

async function prepare(
  client: PoolClient,erasureId: string,runIds: readonly string[] = []
): Promise<string> {
  const result = await client.query<{ outcome: string }>(`
    SELECT identity.prepare_account_erasure(
      $1,$2::uuid[],'{}'::uuid[],'{}'::uuid[]
    ) AS outcome
  `,[erasureId,runIds]);
  return result.rows[0]!.outcome;
}

async function expectStillPending<T>(operation: Promise<T>): Promise<void> {
  const state = await Promise.race([
    operation.then(() => "settled" as const,() => "settled" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"),75))
  ]);
  expect(state).toBe("pending");
}

interface Writer {
  readonly name: string;
  readonly role: "debateai_runtime" | "debateai_authorization_runtime";
  readonly invoke: (client: PoolClient,fixture: Fixture) => Promise<unknown>;
  readonly assertDeletionWin: (value: unknown) => void;
}

const runtimeQuery = async <T>(client: PoolClient,sql: string,values: unknown[]): Promise<T> =>
  (await client.query<{ value: T }>(sql,values)).rows[0]!.value;

const writers: readonly Writer[] = Object.freeze([
  {
    name: "verification-resend",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT status AS value FROM identity.prepare_verification_resend_with_audit(
        $1,$2,clock_timestamp()+interval '1 hour',clock_timestamp(),0,$3::jsonb
      )
    `,[fixture.emailBlindIndex,opaqueHash(),sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe("IGNORED")
  },
  {
    name: "verification-consume",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.consume_verification_with_audit(
        $1,clock_timestamp(),$2::jsonb
      ) AS value
    `,[fixture.verificationTokenHash,sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "verification-delivery",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.record_verification_delivery_with_audit(
        $1,clock_timestamp(),true,NULL,$2::jsonb
      ) AS value
    `,[fixture.userId,sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "duplicate-registration",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT status AS value FROM identity.create_pending_account_with_audit(
        $1,$2,'{}','{}',$3,$4,clock_timestamp(),clock_timestamp(),$5,
        clock_timestamp()+interval '1 hour',$6::jsonb
      )
    `,[randomUUID(),fixture.emailBlindIndex,fixture.passwordHash,
      `duplicate-${randomUUID()}`,opaqueHash(),sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe("EMAIL_DUPLICATE")
  },
  {
    name: "login-challenge-create",role: "debateai_authorization_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.create_login_challenge_with_audit(
        $1,$2,$3,$4,$5,$6,$7,clock_timestamp(),
        clock_timestamp()+interval '1 hour',$8::jsonb
      ) AS value
    `,[fixture.userId,fixture.ownerRef,fixture.passwordHash,fixture.factorId,
      randomUUID(),opaqueHash(),fixture.bindingHash,sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "session-create",role: "debateai_authorization_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.complete_totp_login_with_audit(
        $1,$2,$3,$4,$5,$6,$7,11,$8,$9,$10,'{}',clock_timestamp(),
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',$11::jsonb
      ) AS value
    `,[fixture.userId,fixture.ownerRef,fixture.passwordHash,fixture.factorId,
      fixture.loginChallengeId,fixture.loginChallengeTokenHash,fixture.bindingHash,
      randomUUID(),opaqueHash(),opaqueHash(),sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "session-revoke",role: "debateai_authorization_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.revoke_session_with_audit(
        $1,$2,clock_timestamp(),$3::jsonb
      ) AS value
    `,[fixture.userId,fixture.sessionId,sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "mfa-enrollment-begin",role: "debateai_runtime",
    invoke: async (client,fixture) => (await client.query(`
      SELECT * FROM identity.begin_totp_enrollment_with_audit(
        $1,$2,'{}',clock_timestamp(),$3::jsonb
      )
    `,[fixture.verificationTokenHash,randomUUID(),sourceContext])).rowCount,
    assertDeletionWin: (value) => expect(value).toBe(0)
  },
  {
    name: "mfa-enrollment-verify",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.confirm_totp_enrollment_with_audit(
        $1,$2,11,clock_timestamp(),$3::jsonb
      ) AS value
    `,[fixture.verificationTokenHash,fixture.factorId,sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe("INVALID")
  },
  {
    name: "mfa-recovery-consume",role: "debateai_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.consume_recovery_code_with_audit(
        $1,$2,$3,clock_timestamp(),$4::jsonb
      ) AS value
    `,[fixture.userId,fixture.recoveryCodeId,opaqueHash(),sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  },
  {
    name: "session-step-up",role: "debateai_authorization_runtime",
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.rotate_session_after_step_up_with_audit(
        $1,$2,$3,$4,11,$5,$6,$7,$8,'{}',
        clock_timestamp()+interval '1 hour',NULL,NULL,NULL,NULL,NULL,$9::jsonb
      ) AS value
    `,[fixture.userId,fixture.ownerRef,fixture.passwordHash,fixture.factorId,
      fixture.sessionId,fixture.sessionTokenHash,opaqueHash(),opaqueHash(),sourceContext]),
    assertDeletionWin: (value) => expect(value).toBe(false)
  }
]);

async function resumePrivate(
  client: PoolClient,fixture: PrivateErasureFixture
): Promise<{ outcome: string; erasure_id: string | null }> {
  return (await client.query<{ outcome: string; erasure_id: string | null }>(
    "SELECT * FROM core.resume_private_run_erasure($1,$2,$3,$4,$5)",[
      fixture.runId,fixture.userId,fixture.ownerRef,fixture.sessionId,
      fixture.deleteGrantHash
    ]
  )).rows[0]!;
}

async function finalizePrivate(
  client: PoolClient,fixture: PrivateErasureFixture
): Promise<string> {
  const result = await client.query<{ outcome: string }>(`
    SELECT core.finalize_private_run_erasure(
      $1,clock_timestamp(),clock_timestamp(),1,0
    ) AS outcome
  `,[fixture.privateErasureId]);
  return result.rows[0]!.outcome;
}

async function finalizeAccount(
  client: PoolClient,fixture: EncryptedRunFixture
): Promise<string> {
  const result = await client.query<{ outcome: string }>(`
    SELECT identity.finalize_account_erasure(
      $1,clock_timestamp(),clock_timestamp(),1,0,1,0
    ) AS outcome
  `,[fixture.erasureId]);
  return result.rows[0]!.outcome;
}

async function acknowledgeFixtureNotifications(fixture: EncryptedRunFixture): Promise<void> {
  // T9 isolates row-lock order from the separately verified mail transport.
  // PREPARE now creates completion rows, so make that prerequisite literal
  // before exercising FINALIZE rather than relying on vacuous readiness.
  const acknowledged = await database.pool.query(`
    UPDATE identity.account_erasure_notification_outbox
    SET claim_token=gen_random_uuid(),claim_expires_at=NULL,
      acknowledged_at=clock_timestamp(),last_error_code=NULL
    WHERE user_id=$1 AND acknowledged_at IS NULL
  `,[fixture.userId]);
  expect(acknowledged.rowCount).toBeGreaterThan(0);
}

interface PrivateWriter {
  readonly name: string;
  readonly role: "debateai_runtime" | "debateai_authorization_runtime";
  readonly beginsAuditAttempt: boolean;
  readonly invoke: (client: PoolClient,fixture: PrivateErasureFixture) => Promise<unknown>;
  readonly assertSucceeded: (value: unknown) => void;
  readonly resumeAfterWriter: "PREPARED" | "NOT_FOUND";
}

const privateWriters: readonly PrivateWriter[] = Object.freeze([
  {
    name: "authenticate",role: "debateai_authorization_runtime",beginsAuditAttempt: false,
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT count(*)::integer AS value FROM identity.authenticate_session_t9(
        $1,$2,clock_timestamp(),clock_timestamp()+interval '1 hour'
      )
    `,[fixture.sessionTokenHash,fixture.bindingHash]),
    assertSucceeded: (value) => expect(value).toBe(1),
    resumeAfterWriter: "PREPARED"
  },
  {
    name: "revoke-all",role: "debateai_authorization_runtime",beginsAuditAttempt: true,
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.revoke_all_sessions_with_audit(
        $1,$2,clock_timestamp(),$3::jsonb
      ) AS value
    `,[fixture.userId,fixture.sessionId,sourceContext]),
    assertSucceeded: (value) => expect(Number(value)).toBeGreaterThan(0),
    resumeAfterWriter: "NOT_FOUND"
  },
  {
    name: "step-up",role: "debateai_authorization_runtime",beginsAuditAttempt: true,
    invoke: (client,fixture) => runtimeQuery(client,`
      SELECT identity.rotate_session_after_step_up_with_audit(
        $1,$2,$3,$4,11,$5,$6,$7,$8,
        jsonb_build_object('user_agent_hash',$9::text),
        clock_timestamp()+interval '1 hour',NULL,NULL,NULL,NULL,NULL,$10::jsonb
      ) AS value
    `,[fixture.userId,fixture.ownerRef,fixture.passwordHash,fixture.factorId,
      fixture.sessionId,fixture.sessionTokenHash,opaqueHash(),opaqueHash(),
      fixture.bindingHash,sourceContext]),
    assertSucceeded: (value) => expect(value).toBe(true),
    resumeAfterWriter: "PREPARED"
  }
]);

type ScorecardCarrier = "routing_decision" | "session_assignment";

async function seedRoutingDecision(fixture: EncryptedRunFixture): Promise<string> {
  const result = await database.pool.query<{ routing_decision_id: string }>(`
    INSERT INTO scorecard.routing_decision(
      session_id,task_class,lane,selected_model_id,selected_model_version,
      propensity,guard_trail,policy_row_key,policy_register_version,
      policy_source_ref,at_seq
    ) VALUES ($1,'debate','SERVED','s10-t9-model','v1',1,'[]'::jsonb,
      's10-t9-policy',1,'s10:t9-scorecard',ledger.allocate_sequence())
    RETURNING routing_decision_id
  `,[fixture.executionRef]);
  return result.rows[0]!.routing_decision_id;
}

async function insertScorecardCarrier(
  client: PoolClient,fixture: EncryptedRunFixture,carrier: ScorecardCarrier,
  routingDecisionId?: string
): Promise<string> {
  if (carrier === "routing_decision") {
    return (await client.query<{ id: string }>(`
      INSERT INTO scorecard.routing_decision(
        session_id,task_class,lane,selected_model_id,selected_model_version,
        propensity,guard_trail,policy_row_key,policy_register_version,
        policy_source_ref,at_seq
      ) VALUES ($1,'debate','SERVED','s10-t9-race-model','v1',1,'[]'::jsonb,
        's10-t9-race-policy',1,'s10:t9-scorecard-race',ledger.allocate_sequence())
      RETURNING routing_decision_id AS id
    `,[fixture.executionRef])).rows[0]!.id;
  }
  return (await client.query<{ id: string }>(`
    INSERT INTO scorecard.session_assignment(
      session_id,task_class,model_id,model_version,provider,
      routing_decision_id,at_seq
    ) VALUES ($1,'debate','s10-t9-race-model','v1','fixture',$2,
      ledger.allocate_sequence())
    RETURNING session_assignment_id AS id
  `,[fixture.executionRef,routingDecisionId])).rows[0]!.id;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => database?.stop());

describe("S10 T9 account erasure race matrix on real PostgreSQL", () => {
  it("linearizes every surviving identity writer against PREPARE in both orders", async () => {
    const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    for (const writer of writers) {
      const writerFirst = await fixtureAccount(`${writer.name}-writer-first`);
      const writerClient = await database.pool.connect();
      const erasureClient = await database.pool.connect();
      try {
        await writerClient.query("BEGIN");
        await writerClient.query(`SET LOCAL ROLE ${writer.role}`);
        await writerClient.query("SELECT identity.begin_runtime_audit_attempt()");
        await writer.invoke(writerClient,writerFirst);
        await erasureClient.query("BEGIN");
        await erasureClient.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(erasureClient,writerFirst.erasureId),writer.name).toBe("CONTENDED");
        await erasureClient.query("COMMIT");
        await writerClient.query("COMMIT");
        await erasureClient.query("BEGIN");
        await erasureClient.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(erasureClient,writerFirst.erasureId),writer.name).toBe("PREPARED");
        await erasureClient.query("COMMIT");
      } finally {
        await writerClient.query("ROLLBACK").catch(() => undefined);
        await erasureClient.query("ROLLBACK").catch(() => undefined);
        writerClient.release();
        erasureClient.release();
      }

      const deletionFirst = await fixtureAccount(`${writer.name}-deletion-first`);
      const before = await accountChildSnapshot(deletionFirst);
      const deleting = await database.pool.connect();
      const following = await database.pool.connect();
      try {
        await deleting.query("BEGIN");
        await deleting.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(deleting,deletionFirst.erasureId),writer.name).toBe("PREPARED");
        await following.query("BEGIN");
        await following.query(`SET LOCAL ROLE ${writer.role}`);
        await following.query("SELECT identity.begin_runtime_audit_attempt()");
        const attempted = writer.invoke(following,deletionFirst);
        await expectStillPending(attempted);
        await deleting.query("COMMIT");
        const outcome = await attempted;
        writer.assertDeletionWin(outcome);
        await following.query("COMMIT");
      } finally {
        await deleting.query("ROLLBACK").catch(() => undefined);
        await following.query("ROLLBACK").catch(() => undefined);
        deleting.release();
        following.release();
      }
      expect(await accountChildSnapshot(deletionFirst),writer.name).toBe(before);
      expect((await database.pool.query<{ state: string }>(
        `SELECT state FROM identity."user" WHERE user_id=$1`,[deletionFirst.userId]
      )).rows[0]!.state,writer.name).toBe("suspended");
    }
    const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    expect(deadlocksAfter-deadlocksBefore).toBe(0);
  },120_000);

  it("locks private resume before every session writer and keeps CONTENDED typed", async () => {
    const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    // Mutation witness for the exact acquisition order. Holding USER makes the
    // real resume pause after it has acquired RUN but before it reaches
    // SESSION. The former SESSION -> USER implementation produces the exact
    // opposite NOWAIT results and therefore cannot pass this schedule.
    const orderProbe = await privateErasureFixture("resume-order-probe");
    const userBlocker = await database.pool.connect();
    const resumer = await database.pool.connect();
    const probe = await database.pool.connect();
    try {
      await userBlocker.query("BEGIN");
      await userBlocker.query(
        `SELECT 1 FROM identity."user" WHERE user_id=$1 FOR UPDATE`,[orderProbe.userId]
      );
      await resumer.query("BEGIN");
      await resumer.query("SET LOCAL ROLE debateai_erasure_runtime");
      const resuming = resumePrivate(resumer,orderProbe);
      await expectStillPending(resuming);
      await probe.query("BEGIN");
      await expect(probe.query(
        "SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE NOWAIT",[orderProbe.runId]
      )).rejects.toMatchObject({ code: "55P03" });
      await probe.query("ROLLBACK");
      await probe.query("BEGIN");
      await expect(probe.query(
        "SELECT 1 FROM identity.session WHERE session_id=$1 FOR UPDATE NOWAIT",
        [orderProbe.sessionId]
      )).resolves.toMatchObject({ rowCount: 1 });
      await probe.query("ROLLBACK");
      await userBlocker.query("COMMIT");
      expect((await resuming).outcome).toBe("PREPARED");
      await resumer.query("COMMIT");
    } finally {
      await userBlocker.query("ROLLBACK").catch(() => undefined);
      await resumer.query("ROLLBACK").catch(() => undefined);
      await probe.query("ROLLBACK").catch(() => undefined);
      userBlocker.release();
      resumer.release();
      probe.release();
    }
    for (const writer of privateWriters) {
      const resumeFirst = await privateErasureFixture(`${writer.name}-resume-first`);
      const erasureClient = await database.pool.connect();
      const writerClient = await database.pool.connect();
      try {
        await erasureClient.query("BEGIN");
        await erasureClient.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await resumePrivate(erasureClient,resumeFirst)).toMatchObject({
          outcome: "PREPARED",erasure_id: resumeFirst.privateErasureId
        });
        await writerClient.query("BEGIN");
        await writerClient.query(`SET LOCAL ROLE ${writer.role}`);
        if (writer.beginsAuditAttempt) {
          await writerClient.query("SELECT identity.begin_runtime_audit_attempt()");
        }
        const writing = writer.invoke(writerClient,resumeFirst);
        await expectStillPending(writing);
        await erasureClient.query("COMMIT");
        writer.assertSucceeded(await writing);
        await writerClient.query("COMMIT");
      } finally {
        await erasureClient.query("ROLLBACK").catch(() => undefined);
        await writerClient.query("ROLLBACK").catch(() => undefined);
        erasureClient.release();
        writerClient.release();
      }

      const writerFirst = await privateErasureFixture(`${writer.name}-writer-first`);
      const first = await database.pool.connect();
      const second = await database.pool.connect();
      try {
        await first.query("BEGIN");
        await first.query(`SET LOCAL ROLE ${writer.role}`);
        if (writer.beginsAuditAttempt) {
          await first.query("SELECT identity.begin_runtime_audit_attempt()");
        }
        writer.assertSucceeded(await writer.invoke(first,writerFirst));
        await second.query("BEGIN");
        await second.query("SET LOCAL ROLE debateai_erasure_runtime");
        const resuming = resumePrivate(second,writerFirst);
        await expectStillPending(resuming);
        await first.query("COMMIT");
        expect((await resuming).outcome).toBe(writer.resumeAfterWriter);
        await second.query("COMMIT");
      } finally {
        await first.query("ROLLBACK").catch(() => undefined);
        await second.query("ROLLBACK").catch(() => undefined);
        first.release();
        second.release();
      }
    }

    const contended = await privateErasureFixture("resume-contended");
    const blocker = await database.pool.connect();
    const erasure = await database.pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE",[contended.runId]);
      await erasure.query("BEGIN");
      await erasure.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await resumePrivate(erasure,contended)).toEqual({
        outcome: "CONTENDED",erasure_id: null
      });
      await erasure.query("COMMIT");
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await erasure.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      erasure.release();
    }
    const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    expect(deadlocksAfter-deadlocksBefore).toBe(0);
  },120_000);

  it("serializes both scorecard carriers run-first against account PREPARE", async () => {
    const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    // The shared scorecard trigger must block on RUN before it can touch the
    // mutable execution binding. A joined/execution-first lock mutant makes
    // the second NOWAIT probe fail.
    const orderProbe = await encryptedRunFixture("scorecard-order-probe");
    const runBlocker = await database.pool.connect();
    const writer = await database.pool.connect();
    const bindingProbe = await database.pool.connect();
    try {
      await runBlocker.query("BEGIN");
      await runBlocker.query(
        "SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE",[orderProbe.runId]
      );
      await writer.query("BEGIN");
      await writer.query("SET LOCAL ROLE debateai_runtime");
      const inserting = insertScorecardCarrier(writer,orderProbe,"routing_decision");
      await expectStillPending(inserting);
      await bindingProbe.query("BEGIN");
      await expect(bindingProbe.query(`
        SELECT 1 FROM identity.run_execution_binding
        WHERE execution_ref=$1 FOR UPDATE NOWAIT
      `,[orderProbe.executionRef])).resolves.toMatchObject({ rowCount: 1 });
      await bindingProbe.query("ROLLBACK");
      await runBlocker.query("COMMIT");
      await expect(inserting).resolves.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      await writer.query("COMMIT");
    } finally {
      await runBlocker.query("ROLLBACK").catch(() => undefined);
      await writer.query("ROLLBACK").catch(() => undefined);
      await bindingProbe.query("ROLLBACK").catch(() => undefined);
      runBlocker.release();
      writer.release();
      bindingProbe.release();
    }
    for (const carrier of ["routing_decision","session_assignment"] as const) {
      const writerFirst = await encryptedRunFixture(`${carrier}-writer-first`);
      const baseline = carrier === "session_assignment"
        ? await seedRoutingDecision(writerFirst) : undefined;
      const writerClient = await database.pool.connect();
      const erasureClient = await database.pool.connect();
      try {
        await writerClient.query("BEGIN");
        await writerClient.query("SET LOCAL ROLE debateai_runtime");
        await insertScorecardCarrier(writerClient,writerFirst,carrier,baseline);
        await erasureClient.query("BEGIN");
        await erasureClient.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(erasureClient,writerFirst.erasureId,[writerFirst.runId]))
          .toBe("CONTENDED");
        await erasureClient.query("COMMIT");
        await writerClient.query("COMMIT");
        await erasureClient.query("BEGIN");
        await erasureClient.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(erasureClient,writerFirst.erasureId,[writerFirst.runId]))
          .toBe("PREPARED");
        await erasureClient.query("COMMIT");
      } finally {
        await writerClient.query("ROLLBACK").catch(() => undefined);
        await erasureClient.query("ROLLBACK").catch(() => undefined);
        writerClient.release();
        erasureClient.release();
      }

      const deletionFirst = await encryptedRunFixture(`${carrier}-deletion-first`);
      const deletionBaseline = carrier === "session_assignment"
        ? await seedRoutingDecision(deletionFirst) : undefined;
      const deleting = await database.pool.connect();
      const following = await database.pool.connect();
      try {
        await deleting.query("BEGIN");
        await deleting.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await prepare(deleting,deletionFirst.erasureId,[deletionFirst.runId]))
          .toBe("PREPARED");
        await following.query("BEGIN");
        await following.query("SET LOCAL ROLE debateai_runtime");
        const insertion = insertScorecardCarrier(
          following,deletionFirst,carrier,deletionBaseline
        );
        await expectStillPending(insertion);
        await deleting.query("COMMIT");
        await expect(insertion).rejects.toMatchObject({ code: "55000" });
        await following.query("ROLLBACK");
      } finally {
        await deleting.query("ROLLBACK").catch(() => undefined);
        await following.query("ROLLBACK").catch(() => undefined);
        deleting.release();
        following.release();
      }
    }
    for (const carrier of ["routing_decision","session_assignment"] as const) {
      const finalizeFirst = await encryptedRunFixture(`${carrier}-finalize-first`);
      const finalizeBaseline = carrier === "session_assignment"
        ? await seedRoutingDecision(finalizeFirst) : undefined;
      await database.pool.query(
        "SELECT identity.prepare_account_erasure($1,$2::uuid[],'{}','{}')",
        [finalizeFirst.erasureId,[finalizeFirst.runId]]
      );
      await acknowledgeFixtureNotifications(finalizeFirst);
      const finalizer = await database.pool.connect();
      const following = await database.pool.connect();
      try {
        await finalizer.query("BEGIN");
        await finalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await finalizeAccount(finalizer,finalizeFirst)).toBe("COMMITTED");
        await following.query("BEGIN");
        await following.query("SET LOCAL ROLE debateai_runtime");
        const insertion = insertScorecardCarrier(
          following,finalizeFirst,carrier,finalizeBaseline
        );
        await expectStillPending(insertion);
        await finalizer.query("COMMIT");
        await expect(insertion).rejects.toMatchObject({ code: "55000" });
        await following.query("ROLLBACK");
      } finally {
        await finalizer.query("ROLLBACK").catch(() => undefined);
        await following.query("ROLLBACK").catch(() => undefined);
        finalizer.release();
        following.release();
      }

      const writerFirst = await encryptedRunFixture(`${carrier}-before-finalize`);
      const writerBaseline = carrier === "session_assignment"
        ? await seedRoutingDecision(writerFirst) : undefined;
      await database.pool.query(
        "SELECT identity.prepare_account_erasure($1,$2::uuid[],'{}','{}')",
        [writerFirst.erasureId,[writerFirst.runId]]
      );
      await acknowledgeFixtureNotifications(writerFirst);
      const bindingBlocker = await database.pool.connect();
      const insertingClient = await database.pool.connect();
      const followingFinalizer = await database.pool.connect();
      try {
        await bindingBlocker.query("BEGIN");
        await bindingBlocker.query(`
          SELECT 1 FROM identity.run_execution_binding
          WHERE execution_ref=$1 FOR UPDATE
        `,[writerFirst.executionRef]);
        await insertingClient.query("BEGIN");
        await insertingClient.query("SET LOCAL ROLE debateai_runtime");
        const insertion = insertScorecardCarrier(
          insertingClient,writerFirst,carrier,writerBaseline
        );
        await expectStillPending(insertion);
        await followingFinalizer.query("BEGIN");
        await followingFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await finalizeAccount(followingFinalizer,writerFirst)).toBe("CONTENDED");
        await followingFinalizer.query("COMMIT");
        await bindingBlocker.query("COMMIT");
        await expect(insertion).rejects.toMatchObject({ code: "55000" });
        await insertingClient.query("ROLLBACK");
        await followingFinalizer.query("BEGIN");
        await followingFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await finalizeAccount(followingFinalizer,writerFirst)).toBe("COMMITTED");
        await followingFinalizer.query("COMMIT");
      } finally {
        await bindingBlocker.query("ROLLBACK").catch(() => undefined);
        await insertingClient.query("ROLLBACK").catch(() => undefined);
        await followingFinalizer.query("ROLLBACK").catch(() => undefined);
        bindingBlocker.release();
        insertingClient.release();
        followingFinalizer.release();
      }
    }
    const wrong = await encryptedRunFixture("scorecard-wrong-ref");
    const wrongClient = await database.pool.connect();
    try {
      await wrongClient.query("BEGIN");
      await wrongClient.query("SET LOCAL ROLE debateai_runtime");
      await expect(insertScorecardCarrier(
        wrongClient,{ ...wrong,executionRef: randomUUID() },"routing_decision"
      )).rejects.toMatchObject({ code: "55000" });
    } finally {
      await wrongClient.query("ROLLBACK").catch(() => undefined);
      wrongClient.release();
    }
    const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    expect(deadlocksAfter-deadlocksBefore).toBe(0);
  },120_000);

  it("keeps private finalize after the canonical prefix when resume wins or loses", async () => {
    const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    // Like resume, finalize must reach RUN and then pause at the T9 USER gate
    // without taking its late binding/intent locks. The old
    // RUN -> intent -> binding -> USER implementation fails these probes.
    const orderProbe = await privateErasureFixture("finalize-order-probe");
    const userBlocker = await database.pool.connect();
    const orderedFinalizer = await database.pool.connect();
    const lateLockProbe = await database.pool.connect();
    try {
      await userBlocker.query("BEGIN");
      await userBlocker.query(
        `SELECT 1 FROM identity."user" WHERE user_id=$1 FOR UPDATE`,[orderProbe.userId]
      );
      await orderedFinalizer.query("BEGIN");
      await orderedFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      const finalizing = finalizePrivate(orderedFinalizer,orderProbe);
      await expectStillPending(finalizing);
      await lateLockProbe.query("BEGIN");
      await expect(lateLockProbe.query(
        "SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE NOWAIT",[orderProbe.runId]
      )).rejects.toMatchObject({ code: "55P03" });
      await lateLockProbe.query("ROLLBACK");
      await lateLockProbe.query("BEGIN");
      await expect(lateLockProbe.query(`
        SELECT 1 FROM identity.private_erasure_audit_binding
        WHERE request_ref=$1 FOR UPDATE NOWAIT
      `,[orderProbe.privateErasureId])).resolves.toMatchObject({ rowCount: 1 });
      await expect(lateLockProbe.query(`
        SELECT 1 FROM serve.private_run_key_cleanup_intent
        WHERE request_ref=$1 FOR UPDATE NOWAIT
      `,[orderProbe.privateErasureId])).resolves.toMatchObject({ rowCount: 1 });
      await lateLockProbe.query("ROLLBACK");
      await userBlocker.query("COMMIT");
      expect(await finalizing).toBe("COMMITTED");
      await orderedFinalizer.query("COMMIT");
    } finally {
      await userBlocker.query("ROLLBACK").catch(() => undefined);
      await orderedFinalizer.query("ROLLBACK").catch(() => undefined);
      await lateLockProbe.query("ROLLBACK").catch(() => undefined);
      userBlocker.release();
      orderedFinalizer.release();
      lateLockProbe.release();
    }
    for (const writer of privateWriters.filter(
      (candidate) => candidate.name === "revoke-all" || candidate.name === "step-up"
    )) {
      const finalizeFirst = await privateErasureFixture(
        `${writer.name}-finalize-first`
      );
      const finalizer = await database.pool.connect();
      const writerClient = await database.pool.connect();
      try {
        await finalizer.query("BEGIN");
        await finalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
        expect(await finalizePrivate(finalizer,finalizeFirst)).toBe("COMMITTED");
        await writerClient.query("BEGIN");
        await writerClient.query(`SET LOCAL ROLE ${writer.role}`);
        await writerClient.query("SELECT identity.begin_runtime_audit_attempt()");
        const writing = writer.invoke(writerClient,finalizeFirst);
        await expectStillPending(writing);
        await finalizer.query("COMMIT");
        writer.assertSucceeded(await writing);
        await writerClient.query("COMMIT");
      } finally {
        await finalizer.query("ROLLBACK").catch(() => undefined);
        await writerClient.query("ROLLBACK").catch(() => undefined);
        finalizer.release();
        writerClient.release();
      }

      const writerFirst = await privateErasureFixture(
        `${writer.name}-before-finalize`
      );
      const first = await database.pool.connect();
      const second = await database.pool.connect();
      try {
        await first.query("BEGIN");
        await first.query(`SET LOCAL ROLE ${writer.role}`);
        await first.query("SELECT identity.begin_runtime_audit_attempt()");
        writer.assertSucceeded(await writer.invoke(first,writerFirst));
        await second.query("BEGIN");
        await second.query("SET LOCAL ROLE debateai_erasure_runtime");
        const finalizing = finalizePrivate(second,writerFirst);
        await expectStillPending(finalizing);
        await first.query("COMMIT");
        expect(await finalizing).toBe("COMMITTED");
        await second.query("COMMIT");
      } finally {
        await first.query("ROLLBACK").catch(() => undefined);
        await second.query("ROLLBACK").catch(() => undefined);
        first.release();
        second.release();
      }
    }

    const privateFinalizeFirst = await privateErasureFixture(
      "private-finalize-before-account-prepare"
    );
    const privateFinalizer = await database.pool.connect();
    const accountPreparer = await database.pool.connect();
    try {
      await privateFinalizer.query("BEGIN");
      await privateFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(privateFinalizer,privateFinalizeFirst)).toBe("COMMITTED");
      await accountPreparer.query("BEGIN");
      await accountPreparer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await prepare(
        accountPreparer,privateFinalizeFirst.erasureId,[privateFinalizeFirst.runId]
      )).toBe("CONTENDED");
      await accountPreparer.query("COMMIT");
      await privateFinalizer.query("COMMIT");
      await accountPreparer.query("BEGIN");
      await accountPreparer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await prepare(
        accountPreparer,privateFinalizeFirst.erasureId,[privateFinalizeFirst.runId]
      )).toBe("PREPARED");
      await accountPreparer.query("COMMIT");
    } finally {
      await privateFinalizer.query("ROLLBACK").catch(() => undefined);
      await accountPreparer.query("ROLLBACK").catch(() => undefined);
      privateFinalizer.release();
      accountPreparer.release();
    }

    const accountFirst = await privateErasureFixture(
      "account-prepare-before-private-finalize"
    );
    const firstAccount = await database.pool.connect();
    const followingFinalizer = await database.pool.connect();
    try {
      await firstAccount.query("BEGIN");
      await firstAccount.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await prepare(firstAccount,accountFirst.erasureId,[accountFirst.runId]))
        .toBe("CONTENDED");
      await followingFinalizer.query("BEGIN");
      await followingFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(followingFinalizer,accountFirst)).toBe("CONTENDED");
      await followingFinalizer.query("COMMIT");
      await firstAccount.query("COMMIT");
      await followingFinalizer.query("BEGIN");
      await followingFinalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(followingFinalizer,accountFirst)).toBe("COMMITTED");
      await followingFinalizer.query("COMMIT");
    } finally {
      await firstAccount.query("ROLLBACK").catch(() => undefined);
      await followingFinalizer.query("ROLLBACK").catch(() => undefined);
      firstAccount.release();
      followingFinalizer.release();
    }
    const resumeFirst = await privateErasureFixture("resume-before-finalize");
    const resumer = await database.pool.connect();
    const finalizer = await database.pool.connect();
    try {
      await resumer.query("BEGIN");
      await resumer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await resumePrivate(resumer,resumeFirst)).outcome).toBe("PREPARED");
      await finalizer.query("BEGIN");
      await finalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(finalizer,resumeFirst)).toBe("CONTENDED");
      await finalizer.query("COMMIT");
      await resumer.query("COMMIT");
      await finalizer.query("BEGIN");
      await finalizer.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(finalizer,resumeFirst)).toBe("COMMITTED");
      await finalizer.query("COMMIT");
    } finally {
      await resumer.query("ROLLBACK").catch(() => undefined);
      await finalizer.query("ROLLBACK").catch(() => undefined);
      resumer.release();
      finalizer.release();
    }

    const finalizeFirst = await privateErasureFixture("finalize-before-resume");
    const first = await database.pool.connect();
    const second = await database.pool.connect();
    try {
      await first.query("BEGIN");
      await first.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect(await finalizePrivate(first,finalizeFirst)).toBe("COMMITTED");
      await second.query("BEGIN");
      await second.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await resumePrivate(second,finalizeFirst)).outcome).toBe("CONTENDED");
      await second.query("COMMIT");
      await first.query("COMMIT");
      await second.query("BEGIN");
      await second.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await resumePrivate(second,finalizeFirst)).outcome).toBe("NOT_FOUND");
      await second.query("COMMIT");
    } finally {
      await first.query("ROLLBACK").catch(() => undefined);
      await second.query("ROLLBACK").catch(() => undefined);
      first.release();
      second.release();
    }
    const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    expect(deadlocksAfter-deadlocksBefore).toBe(0);
  },120_000);

  it("keeps run-key provision cleanup binding-before-intent against create, claim, and PREPARE", async () => {
    const deadlocksBefore = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);

    // Hold the late intent lock. The cleanup capability must already own the
    // execution binding before it waits. The old intent-first DELETE leaves
    // the binding probe lockable and turns this receipt RED.
    const orderProbe = await claimedProvisionFixture("provision-cleanup-order");
    const intentBlocker = await database.pool.connect();
    const completingClient = await database.pool.connect();
    const bindingProbe = await database.pool.connect();
    try {
      await intentBlocker.query("BEGIN");
      await intentBlocker.query(`
        SELECT 1 FROM core.run_key_provision_intent
        WHERE run_id=$1 FOR UPDATE
      `,[orderProbe.runId]);
      await completingClient.query("BEGIN");
      await completingClient.query("SET LOCAL ROLE debateai_content_provision");
      const completing = completeProvisionCleanup(completingClient,orderProbe);
      await expectStillPending(completing);
      await bindingProbe.query("BEGIN");
      await expect(bindingProbe.query(`
        SELECT 1 FROM identity.run_execution_binding
        WHERE execution_ref=$1 FOR UPDATE NOWAIT
      `,[orderProbe.executionRef])).rejects.toMatchObject({ code: "55P03" });
      await bindingProbe.query("ROLLBACK");
      await intentBlocker.query("COMMIT");
      await expect(completing).resolves.toBe(true);
      await completingClient.query("COMMIT");
    } finally {
      await intentBlocker.query("ROLLBACK").catch(() => undefined);
      await completingClient.query("ROLLBACK").catch(() => undefined);
      await bindingProbe.query("ROLLBACK").catch(() => undefined);
      intentBlocker.release();
      completingClient.release();
      bindingProbe.release();
    }

    for (const winner of ["cleanup","create"] as const) {
      const fixture = await claimedProvisionFixture(`provision-${winner}-first`);
      const first = await database.pool.connect();
      const second = await database.pool.connect();
      try {
        await first.query("BEGIN");
        await second.query("BEGIN");
        if (winner === "cleanup") {
          await first.query("SET LOCAL ROLE debateai_content_provision");
          expect(await completeProvisionCleanup(first,fixture)).toBe(true);
          await second.query("SET LOCAL ROLE debateai_content_provision");
          const creating = attemptClaimedRunCreation(second,fixture);
          await expectStillPending(creating);
          await first.query("COMMIT");
          await expect(creating).resolves.toBe(false);
          await second.query("COMMIT");
        } else {
          await first.query("SET LOCAL ROLE debateai_content_provision");
          expect(await attemptClaimedRunCreation(first,fixture)).toBe(false);
          await second.query("SET LOCAL ROLE debateai_content_provision");
          const completing = completeProvisionCleanup(second,fixture);
          await expectStillPending(completing);
          await first.query("COMMIT");
          await expect(completing).resolves.toBe(true);
          await second.query("COMMIT");
        }
      } finally {
        await first.query("ROLLBACK").catch(() => undefined);
        await second.query("ROLLBACK").catch(() => undefined);
        first.release();
        second.release();
      }
      expect((await database.pool.query<{ count: string }>(`
        SELECT (
          (SELECT count(*) FROM core.run_key_provision_intent WHERE run_id=$1)
          +(SELECT count(*) FROM identity.run_execution_binding WHERE run_id=$1)
        )::text AS count
      `,[fixture.runId])).rows[0]?.count).toBe("0");
    }

    for (const winner of ["cleanup","claim"] as const) {
      const fixture = await claimedProvisionFixture(`reclaim-${winner}-first`);
      await database.pool.query(`
        UPDATE core.run_key_provision_intent
        SET requested_at=clock_timestamp()-interval '8 minutes',
          expires_at=clock_timestamp()-interval '7 minutes',
          cleanup_claimed_at=clock_timestamp()-interval '6 minutes'
        WHERE run_id=$1
      `,[fixture.runId]);
      const first = await database.pool.connect();
      const second = await database.pool.connect();
      try {
        await first.query("BEGIN");
        await first.query("SET LOCAL ROLE debateai_content_provision");
        await second.query("BEGIN");
        await second.query("SET LOCAL ROLE debateai_content_provision");
        if (winner === "cleanup") {
          expect(await completeProvisionCleanup(first,fixture)).toBe(true);
          const reclaiming = second.query<{ run_id: string }>(
            "SELECT run_id FROM core.claim_run_key_provision_cleanup(100)"
          );
          await expectStillPending(reclaiming);
          await first.query("COMMIT");
          await expect(reclaiming).resolves.toMatchObject({ rows: [] });
          await second.query("COMMIT");
        } else {
          const reclaimed = await first.query<{
            run_id: string;
            claim_token: string;
          }>("SELECT run_id,claim_token FROM core.claim_run_key_provision_cleanup(100)");
          const replacement = reclaimed.rows.find((row) => row.run_id === fixture.runId);
          expect(replacement?.claim_token).not.toBe(fixture.claimToken);
          const staleCompletion = completeProvisionCleanup(second,fixture);
          await expectStillPending(staleCompletion);
          await first.query("COMMIT");
          await expect(staleCompletion).resolves.toBe(false);
          await second.query("COMMIT");
          const cleanup = await database.pool.connect();
          try {
            await cleanup.query("BEGIN");
            await cleanup.query("SET LOCAL ROLE debateai_content_provision");
            expect(await completeProvisionCleanup(
              cleanup,fixture,replacement!.claim_token
            )).toBe(true);
            await cleanup.query("COMMIT");
          } finally {
            await cleanup.query("ROLLBACK").catch(() => undefined);
            cleanup.release();
          }
        }
      } finally {
        await first.query("ROLLBACK").catch(() => undefined);
        await second.query("ROLLBACK").catch(() => undefined);
        first.release();
        second.release();
      }
    }

    for (const winner of ["cleanup","prepare"] as const) {
      const fixture = await claimedProvisionFixture(`prepare-${winner}-first`);
      const first = await database.pool.connect();
      const second = await database.pool.connect();
      try {
        await first.query("BEGIN");
        await second.query("BEGIN");
        if (winner === "cleanup") {
          await first.query("SET LOCAL ROLE debateai_content_provision");
          expect(await completeProvisionCleanup(first,fixture)).toBe(true);
          await second.query("SET LOCAL ROLE debateai_erasure_runtime");
          expect(await prepare(second,fixture.erasureId)).toBe("CONTENDED");
          await second.query("COMMIT");
          await first.query("COMMIT");
          await second.query("BEGIN");
          await second.query("SET LOCAL ROLE debateai_erasure_runtime");
          expect(await prepare(second,fixture.erasureId)).toBe("PREPARED");
          await second.query("COMMIT");
        } else {
          await first.query("SET LOCAL ROLE debateai_erasure_runtime");
          expect(await prepare(first,fixture.erasureId)).toBe("CONTENDED");
          await second.query("SET LOCAL ROLE debateai_content_provision");
          const completing = completeProvisionCleanup(second,fixture);
          await expectStillPending(completing);
          await first.query("COMMIT");
          await expect(completing).resolves.toBe(true);
          await second.query("COMMIT");
          await second.query("BEGIN");
          await second.query("SET LOCAL ROLE debateai_erasure_runtime");
          expect(await prepare(second,fixture.erasureId)).toBe("PREPARED");
          await second.query("COMMIT");
        }
      } finally {
        await first.query("ROLLBACK").catch(() => undefined);
        await second.query("ROLLBACK").catch(() => undefined);
        first.release();
        second.release();
      }
    }

    const deadlocksAfter = Number((await database.pool.query<{ deadlocks: string }>(`
      SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()
    `)).rows[0]!.deadlocks);
    expect(deadlocksAfter-deadlocksBefore).toBe(0);
  },120_000);
});
