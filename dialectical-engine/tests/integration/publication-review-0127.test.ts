import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "../../packages/db/src/index.js";
import { ownerCandidate, ownerNativeReceipts } from "../support/ownerRecoveryFixtures.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { digest } from "../support/staffWebAuthnFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const tables = [
  "serve.publication_review_request",
  "serve.publication_review_decision",
  "serve.publication_review_copy",
  "staff.publication_review_event"
] as const;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let fixtureSequence = 0;
async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(role: string, statement: string, values: unknown[] = []): Promise<T[]> {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const rows = (await client.query<T>(statement, values)).rows;
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ownerRun() {
  const userId = randomUUID(), sessionId = randomUUID(), runId = randomUUID();
  const answerId = randomUUID(), token = hash(randomUUID());
  await database.pool.query(
    `INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
    [userId, createHash("sha256").update(userId).digest(), userId]
  );
  const ownerRef = (await database.pool.query<{ owner_ref: string }>(
    'SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId]
  )).rows[0]!.owner_ref;
  await database.pool.query(
    `INSERT INTO identity.session
      (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES ($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
    [sessionId, userId, hash(sessionId), hash('csrf'+sessionId)]
  );
  const seq = ++fixtureSequence;
  // This suite isolates review functions; the production run-provision path is
  // exercised in its own suites. The superuser seeds its resulting records.
  const seed = await database.pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query(
      `INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`,
      [runId, 'owner:' + ownerRef, sessionId, seq]
    );
    await seed.query(
      `INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)`,
      [runId,ownerRef,seq]
    );
    await seed.query(
      `INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
        VALUES ($1,$2,now())`,
      [runId,Buffer.alloc(32,7)]
    );
    await seed.query(
      `INSERT INTO serve.answer
      (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,
       condition_marks,fact_bundle_id,sealed_at_seq,relevant_as_of)
      VALUES ($1,1,$2,$3,'SERVED','COMPOSED','SUPPORTED','{}'::jsonb,'[]'::jsonb,$4,$5,now())`,
      [answerId, runId, randomUUID(), randomUUID(),seq]
    );
    await seed.query('COMMIT');
  } catch (error) {
    await seed.query('ROLLBACK');
    throw error;
  } finally {
    seed.release();
  }
  await database.pool.query(
    `INSERT INTO identity.step_up_grant
      (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
      VALUES ($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(), token, sessionId, userId, runId]
  );
  return { userId, sessionId, runId, answerId, ownerRef, token };
}

async function staffActor(existing?: Awaited<ReturnType<typeof ownerRun>>, capabilities = ['PUBLICATION_REVIEW']) {
  const userId = existing?.userId ?? randomUUID();
  const sessionId = existing?.sessionId ?? randomUUID();
  if (!existing) {
    await database.pool.query(
      `INSERT INTO identity."user"
        (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
        VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [userId, createHash('sha256').update(userId).digest(),userId]
    );
    await database.pool.query(
      `INSERT INTO identity.session
        (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
        VALUES ($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
      [sessionId,userId,hash(sessionId),hash('csrf'+sessionId)]
    );
  }
  await database.pool.query(
    `INSERT INTO identity.mfa_factor
      (mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
      VALUES ($1,$2,'totp','{}','active',now(),now(),1)`,
    [randomUUID(),userId]
  );
  await database.pool.query(
    `INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
      VALUES($1,'email','{}','verified',now(),now())`,[userId]
  );
  const staffId=randomUUID(), privilegeSessionId=randomUUID(), privilegeTokenHash=hash(randomUUID());
  await database.pool.query(
    `INSERT INTO staff.subject(staff_id,user_id,state,capabilities)
      VALUES($1,$2,'ACTIVE',$3)`,[staffId,userId,capabilities]
  );
  await database.pool.query(
    `INSERT INTO staff.privilege_session
      (privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,
       account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,
    [privilegeSessionId,staffId,userId,sessionId,privilegeTokenHash,hash('csrf'+privilegeSessionId)]
  );
  const context={staffId,userId,ordinarySessionId:sessionId,privilegeSessionId,
    designation:'DELEGATED',securityEpoch:0,accountSecurityEpoch:0,grantRevision:0,capabilities};
  return {userId,sessionId,staffId,privilegeSessionId,tokenHash:hash(sessionId),context};
}

async function requestFor(owner: Awaited<ReturnType<typeof ownerRun>>) {
  const result=await asRole<{ result: string }>('debateai_runtime',
    'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
    [owner.token,owner.sessionId,owner.userId,owner.ownerRef,owner.runId,owner.answerId,1]);
  expect(result[0]!.result).toBe('ASKED');
  return (await database.pool.query<{ review_ref: string }>(
    'SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1 ORDER BY asked_at DESC LIMIT 1',
    [owner.runId])).rows[0]!.review_ref;
}
async function freshGrant(owner: Awaited<ReturnType<typeof ownerRun>>) {
  const token=hash(randomUUID());
  await database.pool.query(
    `INSERT INTO identity.step_up_grant
      (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(),token,owner.sessionId,owner.userId,owner.runId]
  );
  return token;
}
async function seedDecision(reviewRef:string,runId:string,staffId:string,outcome:'APPROVE'|'REFUSE') {
  const client=await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query(
      `INSERT INTO serve.publication_review_decision
        (review_ref,run_id,outcome,reviewer_staff_id,content)
        VALUES($1,$2,$3,$4,'{}'::jsonb)`,
      [reviewRef,runId,outcome,staffId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 180_000);
afterAll(async () => database?.stop());

describe("0127 publication review database boundary", () => {
  it("debateai_runtime is refused SELECT on each of the four tables with 42501", async () => {
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      for (const table of tables) {
        await client.query("SAVEPOINT access_probe");
        await expect(client.query(`SELECT * FROM ${table} LIMIT 0`)).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT access_probe");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("runtime can call owner and staff entry points but cannot execute the sever or liveness helper", async () => {
    const functions = [
      "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
      "serve.read_publication_review_state(uuid,uuid,uuid)",
      "serve.publication_review_approved(uuid,uuid,integer)",
      "staff.list_publication_reviews(jsonb,text,integer)",
      "staff.open_publication_review(jsonb,text,uuid,text)",
      "staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea)",
      "staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea)"
    ];
    const rows = (await database.pool.query<{ signature: string; allowed: boolean }>(
      "SELECT signature,has_function_privilege('debateai_runtime',signature,'EXECUTE') allowed FROM unnest($1::text[]) signature",
      [functions]
    )).rows;
    expect(rows.map((row) => row.allowed)).toEqual(functions.map(() => true));
    for (const signature of ["serve.sever_publication_review(uuid)", "serve.publication_review_run_live(uuid)"]) {
      expect((await database.pool.query("SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') allowed", [signature])).rows[0]!.allowed).toBe(false);
    }
    expect((await database.pool.query("SELECT has_function_privilege('debateai_staff_security_owner','serve.publication_review_run_live(uuid)','EXECUTE') allowed")).rows[0]!.allowed).toBe(true);
  });

  it("Ask consumes the first PUBLISH grant and inserts ordinal 1; a pending retry keeps its grant", async () => {
    const owner = await ownerRun();
    const call = (token: string) => asRole<{ result: string }>(
      'debateai_runtime','SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
      [token, owner.sessionId, owner.userId, owner.ownerRef, owner.runId, owner.answerId, 1]
    );
    expect((await call(owner.token))[0]!.result).toBe('ASKED');
    const second = hash(randomUUID());
    await database.pool.query(
      `INSERT INTO identity.step_up_grant
        (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
        VALUES ($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
      [randomUUID(), second, owner.sessionId, owner.userId, owner.runId]
    );
    expect((await call(second))[0]!.result).toBe('PENDING');
    expect((await database.pool.query(
      'SELECT ask_ordinal FROM serve.publication_review_request WHERE run_id=$1', [owner.runId]
    )).rows).toEqual([{ ask_ordinal: 1 }]);
    expect((await database.pool.query(
      'SELECT consumed_at IS NOT NULL spent FROM identity.step_up_grant WHERE token_hash=$1',
      [second]
    )).rows).toEqual([{ spent: false }]);
  });

  it("a refused Ask leaves its PUBLISH grant available", async () => {
    const owner = await ownerRun();
    const ref = await requestFor(owner);
    const reviewer = await staffActor();
    await seedDecision(ref, owner.runId, reviewer.staffId, 'APPROVE');
    const token = await freshGrant(owner);
    const result = await asRole<{ result: string }>('debateai_runtime',
      'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
      [token, owner.sessionId, owner.userId, owner.ownerRef, owner.runId, owner.answerId, 1]);
    expect(result[0]!.result).toBe('NOT_ALLOWED');
    expect((await database.pool.query(
      'SELECT consumed_at IS NOT NULL spent FROM identity.step_up_grant WHERE token_hash=$1', [token]
    )).rows).toEqual([{ spent: false }]);
  });

  it("a missing 0127 sever trigger is rejected on forward replay", async () => {
    const isolated = await startTestDatabase();
    try {
      await migrate(isolated.pool);
      await isolated.pool.query('DROP TRIGGER zz_sever_publication_review ON core.run_content_attestation_secret');
      await expect(migrate(isolated.pool)).rejects.toThrow();
    } finally { await isolated.stop(); }
  }, 180_000);

  it("an unsevered request cannot make an erased run live to staff", async () => {
    const owner = await ownerRun();
    await requestFor(owner);
    const seed = await database.pool.connect();
    try {
      await seed.query('BEGIN');
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query('DELETE FROM core.run_content_attestation_secret WHERE run_id=$1', [owner.runId]);
      await seed.query(`INSERT INTO serve.private_run_key_cleanup_intent
        (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
        VALUES($1,$2,$3,now(),'{}'::uuid[])`, [randomUUID(),owner.userId,owner.runId]);
      await seed.query('COMMIT');
    } catch (error) { await seed.query('ROLLBACK'); throw error; }
    finally { seed.release(); }
    expect((await database.pool.query(
      'SELECT count(*)::int n FROM serve.publication_review_request WHERE run_id=$1', [owner.runId]
    )).rows[0]!.n).toBe(1);
    expect((await asRole<{ live: boolean }>('debateai_staff_security_owner',
      'SELECT serve.publication_review_run_live($1) live', [owner.runId]))[0]!.live).toBe(false);
  });

  it("an Ask waiting on a private delete returns GRANT_INVALID without an orphan request", async () => {
    const owner = await ownerRun();
    const deleting = await database.pool.connect();
    try {
      await deleting.query('BEGIN');
      await deleting.query('SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE', [owner.runId]);
      let settled = false;
      const asking = asRole<{ result: string }>('debateai_runtime',
        'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
        [owner.token, owner.sessionId, owner.userId, owner.ownerRef, owner.runId, owner.answerId, 1]
      ).finally(() => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(settled).toBe(false);
      await deleting.query(`INSERT INTO serve.private_run_key_cleanup_intent
        (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
        VALUES($1,$2,$3,now(),'{}'::uuid[])`, [randomUUID(),owner.userId,owner.runId]);
      await deleting.query('DELETE FROM core.run_content_attestation_secret WHERE run_id=$1', [owner.runId]);
      await deleting.query('COMMIT');
      expect((await asking)[0]!.result).toBe('GRANT_INVALID');
      expect((await database.pool.query(
        'SELECT count(*)::int n FROM serve.publication_review_request WHERE run_id=$1', [owner.runId]
      )).rows[0]!.n).toBe(0);
    } finally {
      await deleting.query('ROLLBACK').catch(() => {});
      deleting.release();
    }
  }, 30_000);

  it("the request erasure barrier refuses a late direct insert", async () => {
    const owner = await ownerRun();
    const seed = await database.pool.connect();
    try {
      await seed.query('BEGIN');
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO serve.private_run_key_cleanup_intent
        (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
        VALUES($1,$2,$3,now(),'{}'::uuid[])`, [randomUUID(),owner.userId,owner.runId]);
      await seed.query('COMMIT');
    } catch (error) { await seed.query('ROLLBACK'); throw error; }
    finally { seed.release(); }
    await expect(database.pool.query(`INSERT INTO serve.publication_review_request
      (review_ref,run_id,answer_id,synthesis_origin_version,ask_ordinal)
      VALUES($1,$2,$3,1,1)`, [randomUUID(),owner.runId,owner.answerId]))
      .rejects.toMatchObject({code:'55000',message:'PRIVATE_CONTENT_ERASED'});
  });

  it("Ask refuses missing, expired, consumed, wrong-action and wrong-run grants without a request", async () => {
    const owner = await ownerRun();
    const other = await ownerRun();
    const variants = [
      { token: hash(randomUUID()), action: 'PUBLISH', target: owner.runId, start: '-20 minutes', end: '-10 minutes', spent: false },
      { token: hash(randomUUID()), action: 'PUBLISH', target: owner.runId, start: '-1 minute', end: '5 minutes', spent: true },
      { token: hash(randomUUID()), action: 'UNPUBLISH', target: owner.runId, start: '-1 minute', end: '5 minutes', spent: false },
      { token: hash(randomUUID()), action: 'PUBLISH', target: other.runId, start: '-1 minute', end: '5 minutes', spent: false }
    ];
    for (const grant of variants) {
      await database.pool.query(
        `INSERT INTO identity.step_up_grant
          (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at,consumed_at)
          VALUES ($1,$2,$3,$4,$5,$6,now()+($7::text)::interval,now()+($8::text)::interval,
            CASE WHEN $9 THEN now() ELSE NULL END)`,
        [randomUUID(), grant.token, owner.sessionId, owner.userId, grant.action, grant.target, grant.start, grant.end, grant.spent]
      );
    }
    for (const token of [hash(randomUUID()), ...variants.map((grant) => grant.token)]) {
      const result = await asRole<{ result: string }>('debateai_runtime',
        'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
        [token, owner.sessionId, owner.userId, owner.ownerRef, owner.runId, owner.answerId, 1]);
      expect(result[0]!.result).toBe('GRANT_INVALID');
    }
    expect((await database.pool.query(
      'SELECT count(*)::int n FROM serve.publication_review_request WHERE run_id=$1', [owner.runId]
    )).rows[0]!.n).toBe(0);
  });

  it("staff list and open expose only a pending live request and audit the list", async () => {
    const owner = await ownerRun();
    const reviewRef = await requestFor(owner);
    const reviewer = await staffActor();
    const list = (await asRole<{ value: { items: Array<Record<string, unknown>>; order: string } }>(
      'debateai_runtime',
      'SELECT staff.list_publication_reviews($1::jsonb,$2,$3) value',
      [reviewer.context,reviewer.tokenHash,100]
    ))[0]!.value;
    expect(list.order).toBe('ASKED_AT_ASC');
    expect(list.items.map((item) => item.reviewRef)).toContain(reviewRef);
    const opened = (await asRole<{ value: Record<string, unknown> }>(
      'debateai_runtime',
      'SELECT staff.open_publication_review($1::jsonb,$2,$3,$4) value',
      [reviewer.context,reviewer.tokenHash,reviewRef,'READ']
    ))[0]!.value;
    expect(Object.keys(opened).sort()).toEqual([
      'answerId','askOrdinal','askedAt','originVersion','ownerRef',
      'ownerUserId','reasonSalt','reviewRef','runId'
    ].sort());
    expect(opened.ownerRef).toBe(owner.ownerRef);
    expect((await database.pool.query(
      "SELECT action,review_ref FROM staff.publication_review_event WHERE actor_staff_id=$1 ORDER BY recorded_at",
      [reviewer.staffId]
    )).rows).toEqual([{ action: 'LIST', review_ref: null }]);
  });

  it("staff list accepts one overflow probe row but rejects a larger page", async () => {
    const owner = await ownerRun();
    const reviewRef = await requestFor(owner);
    const reviewer = await staffActor();
    const query = 'SELECT staff.list_publication_reviews($1::jsonb,$2,$3) value';
    const args = [reviewer.context, reviewer.tokenHash];

    const list = (await asRole<{ value: { items: Array<{ reviewRef: string }> } }>(
      'debateai_runtime', query, [...args, 101]
    ))[0]!.value;
    expect(list.items.map((item) => item.reviewRef)).toContain(reviewRef);
    await expect(asRole('debateai_runtime', query, [...args, 102]))
      .rejects.toThrow('STAFF_PAGE_INVALID');
  });

  it("a secret deletion fired as debateai_runtime severs requests, decisions and copies but keeps audit events", async () => {
    const owner = await ownerRun();
    const reviewRef = await requestFor(owner);
    const reviewer = await staffActor();
    const seed = await database.pool.connect();
    try {
      await seed.query('BEGIN');
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(
        `INSERT INTO serve.publication_review_decision
          (review_ref,run_id,outcome,reviewer_staff_id,content)
          VALUES($1,$2,'REFUSE',$3,'{}'::jsonb)`,
        [reviewRef,owner.runId,reviewer.staffId]
      );
      await seed.query(
        `INSERT INTO serve.publication_review_copy
          (copy_ref,review_ref,run_id,answer_id,answer_version,content)
          VALUES($1,$2,$3,$4,1,'{}'::jsonb)`,
        [randomUUID(),reviewRef,owner.runId,owner.answerId]
      );
      await seed.query('COMMIT');
    } catch (error) {
      await seed.query('ROLLBACK');
      throw error;
    } finally {
      seed.release();
    }
    await database.pool.query(
      "INSERT INTO staff.publication_review_event(actor_staff_id,action,review_ref) VALUES($1,'REFUSE',$2)",
      [reviewer.staffId,reviewRef]
    );
    await database.pool.query('GRANT DELETE, SELECT(run_id) ON core.run_content_attestation_secret TO debateai_runtime');
    await asRole('debateai_runtime',
      'DELETE FROM core.run_content_attestation_secret WHERE run_id=$1', [owner.runId]);
    const counts = (await database.pool.query(
      `SELECT
        (SELECT count(*)::int FROM serve.publication_review_request WHERE run_id=$1) requests,
        (SELECT count(*)::int FROM serve.publication_review_decision WHERE run_id=$1) decisions,
        (SELECT count(*)::int FROM serve.publication_review_copy WHERE run_id=$1) copies,
        (SELECT count(*)::int FROM staff.publication_review_event WHERE review_ref=$2) events`,
      [owner.runId,reviewRef]
    )).rows[0]!;
    expect(counts).toEqual({requests:0,decisions:0,copies:0,events:1});
  });

  it("a cleanup intent insertion severs the same run-linked records", async () => {
    const owner = await ownerRun();
    const reviewRef = await requestFor(owner);
    const reviewer = await staffActor();
    const seed = await database.pool.connect();
    try {
      await seed.query('BEGIN');
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(
        "INSERT INTO serve.publication_review_decision(review_ref,run_id,outcome,reviewer_staff_id,content) VALUES($1,$2,'REFUSE',$3,'{}'::jsonb)",
        [reviewRef,owner.runId,reviewer.staffId]
      );
      await seed.query(
        "INSERT INTO serve.publication_review_copy(copy_ref,review_ref,run_id,answer_id,answer_version,content) VALUES($1,$2,$3,$4,1,'{}'::jsonb)",
        [randomUUID(),reviewRef,owner.runId,owner.answerId]
      );
      await seed.query('COMMIT');
    } catch (error) {
      await seed.query('ROLLBACK');
      throw error;
    } finally {
      seed.release();
    }
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent
        (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
        VALUES($1,$2,$3,now(),'{}'::uuid[])`,
      [randomUUID(),owner.userId,owner.runId]
    );
    const counts=(await database.pool.query(
      `SELECT (SELECT count(*)::int FROM serve.publication_review_request WHERE run_id=$1) requests,
        (SELECT count(*)::int FROM serve.publication_review_decision WHERE run_id=$1) decisions,
        (SELECT count(*)::int FROM serve.publication_review_copy WHERE run_id=$1) copies`,
      [owner.runId]
    )).rows[0]!;
    expect(counts).toEqual({requests:0,decisions:0,copies:0});
  });

  it("after severing no runtime, staff owner, or superuser query can join an audit ref back to an owner", async () => {
    const owner=await ownerRun();
    const reviewRef=await requestFor(owner);
    const reviewer=await staffActor();
    await database.pool.query(
      "INSERT INTO staff.publication_review_event(actor_staff_id,action,review_ref) VALUES($1,'READ',$2)",
      [reviewer.staffId,reviewRef]
    );
    await database.pool.query('DELETE FROM core.run_content_attestation_secret WHERE run_id=$1',[owner.runId]);
    const join=`SELECT e.review_ref,r.run_id,r.answer_id,run.asker_id
      FROM staff.publication_review_event e
      LEFT JOIN serve.publication_review_request r ON r.review_ref=e.review_ref
      LEFT JOIN core.run run ON run.run_id=r.run_id
      WHERE e.review_ref=$1`;
    const expected=[{review_ref:reviewRef,run_id:null,answer_id:null,asker_id:null}];
    expect((await database.pool.query(join,[reviewRef])).rows).toEqual(expected);
    expect(await asRole('debateai_staff_security_owner',join,[reviewRef])).toEqual(expected);
    await expect(asRole('debateai_runtime',join,[reviewRef])).rejects.toMatchObject({code:'42501'});
  });

  it("staff.grant stores PUBLICATION_REVIEW for a delegate and invitation validation accepts it", async () => {
    const issuer=await staffActor(undefined,
      ['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW']);
    await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)',[issuer.staffId]);
    const ownerContext={...issuer.context,designation:'OWNER'};
    const reviewer = await staffActor(undefined,['TEAM_READ']);
    const operationId=randomUUID(),proofId=randomUUID();
    const binding={action:'TEAM_GRANT',targetId:reviewer.staffId,
      expectedRevision:0,operationId,bodySha256:createHash('sha256').update(operationId).digest('hex')};
    await database.pool.query(
      `INSERT INTO staff.action_proof
        (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,
         security_epoch,account_security_epoch,grant_revision,binding,credential_id,expires_at)
        VALUES($1,$2,$3,$4,$5,0,0,0,$6::jsonb,'fixture-verified-key',now()+interval '5 minutes')`,
      [proofId,issuer.staffId,issuer.userId,issuer.sessionId,issuer.privilegeSessionId,binding]
    );
    await authorizeStaffAlertFixture(database.pool,operationId);
    const alert={schema:'staff-alert-v1',event:'GRANT',operationId,
      envelope:{v:1,keyId:'fixture',nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}};
    await asRole('debateai_runtime',
      'SELECT staff.grant($1::jsonb,$2,$3::jsonb,$4,$5::text[],$6,$7::jsonb,$8::jsonb)',
      [ownerContext,proofId,binding,reviewer.staffId,['PUBLICATION_REVIEW'],operationId,
        {code:'GRANT_CHANGE'},alert]
    );
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE staff_id=$1',[issuer.staffId]);
    expect((await database.pool.query(
      'SELECT capabilities FROM staff.subject WHERE staff_id=$1',[reviewer.staffId]
    )).rows[0]!.capabilities).toEqual(['PUBLICATION_REVIEW']);
    expect((await database.pool.query(
      "SELECT staff.valid_capabilities(ARRAY['PUBLICATION_REVIEW']::text[]) valid"
    )).rows[0]!.valid).toBe(true);
    // The grant revokes the old privilege session; the new capability needs reelevation.
    expect((await database.pool.query(
      "SELECT staff.authorize_action($1::jsonb,'PUBLICATION_REVIEW') allowed",
      [reviewer.context]
    )).rows[0]!.allowed).toBe(false);
  });

  it("the two review actions require PUBLICATION_REVIEW in owned_action_allowed", async () => {
    const reviewer=await staffActor();
    const without=await staffActor(undefined,['TEAM_READ']);
    for (const action of ['PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE']) {
      const binding={action,targetId:randomUUID(),bodySha256:'0'.repeat(64),
        expectedRevision:0,operationId:randomUUID()};
      const allowed=await asRole<{ value:boolean }>('debateai_staff_security_owner',
        'SELECT staff.owned_action_allowed($1::jsonb,$2::jsonb) value',
        [reviewer.context,binding]);
      const refused=await asRole<{ value:boolean }>('debateai_staff_security_owner',
        'SELECT staff.owned_action_allowed($1::jsonb,$2::jsonb) value',
        [without.context,binding]);
      expect(allowed[0]!.value).toBe(true);
      expect(refused[0]!.value).toBe(false);
    }
    const definition=(await database.pool.query(
      "SELECT pg_get_functiondef('staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)'::regprocedure) definition"
    )).rows[0]!.definition as string;
    expect(definition).toContain("'PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE'");
  });

  it("every review row trigger is SECURITY DEFINER and the three serve tables reject TRUNCATE", async () => {
    const rows=(await database.pool.query<{ relation:string; trigger:string; row_level:boolean; definer:boolean; before_truncate:boolean }>(`
      SELECT t.tgrelid::regclass::text relation,t.tgname trigger,
        (t.tgtype & 1)=1 row_level,p.prosecdef definer,
        (t.tgtype & 32)<>0 AND (t.tgtype & 2)<>0 AND (t.tgtype & 1)=0 before_truncate
      FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=ANY($1::regclass[]) AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
    `,[tables.slice(0,3)])).rows;
    expect(rows.filter((row)=>row.row_level && !row.definer)).toEqual([]);
    for(const table of tables.slice(0,3)) {
      expect(rows.some((row)=>row.relation===table && row.trigger==='reject_truncate' && row.before_truncate)).toBe(true);
    }
  });

  it("a decided request closes READ, reports DECIDED to DECIDE, and a second refusal exhausts Ask", async () => {
    const owner=await ownerRun();
    const first=await requestFor(owner);
    const reviewer1=await staffActor(), reviewer2=await staffActor();
    await seedDecision(first,owner.runId,reviewer1.staffId,'REFUSE');
    await expect(asRole('debateai_runtime',
      'SELECT staff.open_publication_review($1::jsonb,$2,$3,$4)',
      [reviewer2.context,reviewer2.tokenHash,first,'READ']
    )).rejects.toThrow('PUBLICATION_REVIEW_NOT_FOUND');
    await expect(asRole('debateai_runtime',
      'SELECT staff.open_publication_review($1::jsonb,$2,$3,$4)',
      [reviewer2.context,reviewer2.tokenHash,first,'DECIDE']
    )).rejects.toThrow('PUBLICATION_REVIEW_DECIDED');
    await expect(asRole('debateai_runtime',
      'SELECT staff.decide_publication_review($1::jsonb,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9)',
      [reviewer2.context,reviewer2.tokenHash,randomUUID(),{},first,'APPROVE',{},null,null]
    )).rejects.toThrow('PUBLICATION_REVIEW_DECIDED');
    const secondToken=await freshGrant(owner);
    expect((await asRole<{ result:string }>('debateai_runtime',
      'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
      [secondToken,owner.sessionId,owner.userId,owner.ownerRef,owner.runId,owner.answerId,1]
    ))[0]!.result).toBe('ASKED');
    const second=(await database.pool.query<{review_ref:string}>(
      'SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1 AND ask_ordinal=2',
      [owner.runId])).rows[0]!.review_ref;
    await expect(asRole('debateai_runtime',
      'SELECT staff.open_publication_review($1::jsonb,$2,$3,$4)',
      [reviewer1.context,reviewer1.tokenHash,second,'READ']
    )).rejects.toThrow('PUBLICATION_REVIEW_SAME_REVIEWER');
    expect((await asRole<{value:Record<string,unknown>}>('debateai_runtime',
      'SELECT staff.open_publication_review($1::jsonb,$2,$3,$4) value',
      [reviewer2.context,reviewer2.tokenHash,second,'READ']
    ))[0]!.value.reviewRef).toBe(second);
    await seedDecision(second,owner.runId,reviewer2.staffId,'REFUSE');
    const thirdToken=await freshGrant(owner);
    expect((await asRole<{result:string}>('debateai_runtime',
      'SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) result',
      [thirdToken,owner.sessionId,owner.userId,owner.ownerRef,owner.runId,owner.answerId,1]
    ))[0]!.result).toBe('NOT_ALLOWED');
  });

  it("the staff security owner inserts encrypted copy and decision carriers through DEFINER guards", async () => {
    const owner=await ownerRun();
    const reviewRef=await requestFor(owner);
    const reviewer=await staffActor();
    const copyRef=randomUUID();
    const envelope={v:1,keyId:'fixture-key',nonce:'AAAAAAAAAAAAAAAA',
      tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='};
    const attestation=async(table:string,ref:string)=>(await database.pool.query<{value:Buffer}>(`
      SELECT audit_crypto_internal.hmac(
        core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),
        $5::bytea,'sha256') value
    `,[owner.runId,table,ref,envelope,Buffer.alloc(32,7)])).rows[0]!.value;
    await asRole('debateai_staff_security_owner',
      `INSERT INTO serve.publication_review_copy
        (copy_ref,review_ref,run_id,answer_id,answer_version,
         content,content_ciphertext,content_attestation)
        VALUES($1,$2,$3,$4,1,$5::jsonb,$6::jsonb,$7)`,
      [copyRef,reviewRef,owner.runId,owner.answerId,
        {ciphertext:true,v:1},envelope,await attestation('serve.publication_review_copy',copyRef)]
    );
    await asRole('debateai_staff_security_owner',
      `INSERT INTO serve.publication_review_decision
        (review_ref,run_id,outcome,reviewer_staff_id,content,content_ciphertext,content_attestation)
        VALUES($1,$2,'APPROVE',$3,$4::jsonb,$5::jsonb,$6)`,
      [reviewRef,owner.runId,reviewer.staffId,{ciphertext:true,v:1},envelope,
        await attestation('serve.publication_review_decision',reviewRef)]
    );
    expect((await database.pool.query(
      'SELECT count(*)::int n FROM serve.publication_review_copy WHERE review_ref=$1',
      [reviewRef])).rows[0]!.n).toBe(1);
    expect((await database.pool.query(
      'SELECT outcome FROM serve.publication_review_decision WHERE review_ref=$1',
      [reviewRef])).rows[0]!.outcome).toBe('APPROVE');
  });

  it("staff.read_audit_page orders team and review events together without private reason or delivery on review rows", async () => {
    const reviewer=await staffActor(undefined,['AUDIT_READ','PUBLICATION_REVIEW']);
    const first=randomUUID(),second=randomUUID(),third=randomUUID();
    await database.pool.query(
      "INSERT INTO staff.publication_review_event(event_id,actor_staff_id,action,review_ref,recorded_at) VALUES($1,$2,'LIST',NULL,now()-interval '3 seconds'),($3,$2,'READ',$4,now()-interval '1 second')",
      [first,reviewer.staffId,second,third]
    );
    const auditSeed=await database.pool.connect();
    try {
      await auditSeed.query('BEGIN');
      await auditSeed.query("SET LOCAL session_replication_role = 'replica'");
      await auditSeed.query(
        "INSERT INTO staff.audit_event(event_id,operation_id,request_sha256,actor_staff_id,event_type,reason_code,recorded_at) VALUES($1,$2,$3,$4,'KEY_CHANGE','KEY_MAINTENANCE',now()-interval '2 seconds')",
        [randomUUID(),randomUUID(),createHash('sha256').update('team-audit').digest('hex'),reviewer.staffId]
      );
      await auditSeed.query('COMMIT');
    } catch(error) {
      await auditSeed.query('ROLLBACK');throw error;
    } finally { auditSeed.release(); }
    const page=(await asRole<{value:{events:Record<string,unknown>[]}}>('debateai_runtime',
      'SELECT staff.read_audit_page($1::jsonb,$2,100,NULL,NULL) value',
      [reviewer.context,reviewer.tokenHash]))[0]!.value;
    const auditIds: string[]=[first,second];
    const rows=page.events.filter((row)=>auditIds.includes(String(row.event_id)) || row.event==='CREDENTIAL_REGISTERED');
    expect(rows.map((row)=>row.event)).toEqual(['PUBLICATION_REVIEW_LISTED','CREDENTIAL_REGISTERED','PUBLICATION_REVIEW_READ']);
    for(const row of rows.filter((item)=>String(item.event).startsWith('PUBLICATION_REVIEW_'))) {
      expect(row).toHaveProperty('review_ref');
      expect(row).not.toHaveProperty('reason');
      expect(row).not.toHaveProperty('delivery_state');
    }
  });

  it("the owner backfill grants PUBLICATION_REVIEW once, revokes owner sessions, and leaves delegates intact", async () => {
    const owner=await staffActor(undefined,['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']);
    const delegate=await staffActor(undefined,['TEAM_READ']);
    await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)',[owner.staffId]);
    const sql=await readFile(new URL('../../migrations/0127_publication_review.sql',import.meta.url),'utf8');
    const start=sql.indexOf('WITH owner AS (');
    const statement=sql.slice(start,sql.indexOf(';',start)+1);
    expect(statement).toContain('UPDATE staff.privilege_session');
    await database.pool.query(statement);
    const first=(await database.pool.query(
      'SELECT staff_id,capabilities,grant_revision::int,security_epoch::int FROM staff.subject WHERE staff_id=ANY($1::uuid[]) ORDER BY staff_id',
      [[owner.staffId,delegate.staffId]])).rows;
    const ownerRow=first.find((row)=>row.staff_id===owner.staffId)!;
    const delegateRow=first.find((row)=>row.staff_id===delegate.staffId)!;
    expect(ownerRow.capabilities).toContain('PUBLICATION_REVIEW');
    expect([ownerRow.grant_revision,ownerRow.security_epoch]).toEqual([1,1]);
    expect(delegateRow.capabilities).toEqual(['TEAM_READ']);
    expect([delegateRow.grant_revision,delegateRow.security_epoch]).toEqual([0,0]);
    const sessions=(await database.pool.query(
      'SELECT staff_id,revoked_at IS NOT NULL revoked FROM staff.privilege_session WHERE staff_id=ANY($1::uuid[])',
      [[owner.staffId,delegate.staffId]])).rows;
    expect(sessions.find((row)=>row.staff_id===owner.staffId)?.revoked).toBe(true);
    expect(sessions.find((row)=>row.staff_id===delegate.staffId)?.revoked).toBe(false);
    await database.pool.query(statement);
    expect((await database.pool.query(
      'SELECT capabilities,grant_revision::int,security_epoch::int FROM staff.subject WHERE staff_id=$1',[owner.staffId]
    )).rows[0]!).toMatchObject({capabilities:ownerRow.capabilities,grant_revision:1,security_epoch:1});
  });

  it("a newly bootstrapped owner receives all six team capabilities, PUBLICATION_REVIEW and THREAT_REPORT", async () => {
    const isolated=await startTestDatabase();
    let runtime:Pool|undefined,jit:Pool|undefined;
    try {
      await migrate(isolated.pool);
      await isolated.pool.query("CREATE ROLE publication_review_fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE debateai_runtime");
      await isolated.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'fixture-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
      const url=new URL(isolated.connectionString);
      url.username='publication_review_fixture_runtime';url.password='fixture-only';runtime=createPool(url.toString());
      url.username='debateai_prod_staff_recovery';url.password='fixture-jit-only';jit=createPool(url.toString());
      const target=await ownerCandidate(isolated.pool);
      const generation=randomUUID(),verifier=digest('publication-review-offline-proof');
      const commandId=randomUUID(),operationId=randomUUID(),nonce=Buffer.alloc(32,13).toString('base64url');
      await jit.query('SELECT staff.install_owner_recovery_generation($1,$2,$3)',[generation,verifier,randomUUID()]);
      await jit.query('SELECT staff.prepare_owner_command_v2($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11)',
        [commandId,'BOOTSTRAP',target.userId,null,null,false,target.credentialIds,operationId,digest(nonce),generation,verifier]);
      const receipts=await ownerNativeReceipts(runtime,target,commandId,nonce);
      const readiness=randomUUID();
      await jit.query('SELECT staff.publish_independent_alert_readiness($1,$2,$3,$4,$5)',
        ['f'.repeat(64),readiness,'fixture-only',randomUUID(),new Date(Date.now()+60000)]);
      await jit.query('SELECT staff.authorize_owner_alert_operation($1,$2,$3,$4)',
        [commandId,operationId,'f'.repeat(64),readiness]);
      const alert={schema:'staff-alert-v1',event:'BOOTSTRAP',operationId,
        envelope:{v:1,keyId:'fixture',nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}};
      const result=(await jit.query('SELECT staff.commit_owner_command($1,$2::uuid[],$3,$4,$5,$6,$7,$8,$9,$10::jsonb) value',
        [commandId,receipts,operationId,'BOOTSTRAP',generation,verifier,randomUUID(),digest('next'),randomUUID(),alert])).rows[0]!.value;
      expect(result.outcome).toBe('COMPLETED');
      expect((await isolated.pool.query(
        'SELECT capabilities FROM staff.subject WHERE user_id=$1',[target.userId]
      )).rows[0]!.capabilities).toEqual(['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW','THREAT_REPORT']);
    } finally {
      await jit?.end();await runtime?.end();await isolated.stop();
    }
  },120_000);
});
