import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, decryptContentForRun, migrate, type Pool } from "@debateai/db";
import { PublicationReviewRepository, PublicationReviewRefusal, ServeRepository, SynthesisCheckRepository } from "@debateai/serve";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";

const policyVersion = "synthesis.content-check.v1@0123456789abcdef";
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let database: TestDatabase, runtime: Pool, owner: StoryEncryptedOwner;
let reviews: PublicationReviewRepository, checks: SynthesisCheckRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
  configureContentEncryption(runtime, contentCipherFor(database.pool)!);
  reviews = new PublicationReviewRepository(runtime);
  checks = new SynthesisCheckRepository(runtime);
}, 180_000);
afterAll(async () => {
  await runtime?.end();
  await database?.stop();
  if (owner) await releaseStoryEncryptedOwner(owner);
});

async function debate(questionLine = `Review ${randomUUID()}?`) {
  const runId = await createEncryptedStoryRun(database.pool, owner, questionLine);
  const { answerId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: randomUUID(),
    factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null }
  });
  return { runId, answerId, originVersion: 1, questionLine };
}
type Debate = Awaited<ReturnType<typeof debate>>;
async function grant(d: Debate) {
  const tokenHash = hash(randomUUID());
  await database.pool.query(
    `INSERT INTO identity.step_up_grant
      (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(), tokenHash, owner.sessionId, owner.userId, d.runId]
  );
  return tokenHash;
}
async function ask(d: Debate, tokenHash?: string) {
  return reviews.ask({ grantTokenHash: tokenHash ?? await grant(d), sessionId: owner.sessionId, userId: owner.userId,
    ownerRef: owner.ownerRef, ...d });
}
async function reviewRef(d: Debate) {
  return (await database.pool.query<{ review_ref: string }>(
    "SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1 ORDER BY ask_ordinal DESC LIMIT 1",
    [d.runId]
  )).rows[0]!.review_ref;
}
async function staff(existingOwner = false) {
  const userId = existingOwner ? owner.userId : randomUUID();
  const sessionId = existingOwner ? owner.sessionId : randomUUID();
  if (!existingOwner) {
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [userId,createHash("sha256").update(userId).digest(),userId]);
    await database.pool.query(`INSERT INTO identity.session
      (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
      [sessionId,userId,hash(sessionId),hash(`csrf${sessionId}`)]);
  }
  await database.pool.query(`INSERT INTO identity.mfa_factor
    (mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`,[randomUUID(),userId]);
  await database.pool.query(`INSERT INTO identity.channel_binding
    (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',now(),now())`,[userId]);
  const staffId=randomUUID(),privilegeSessionId=randomUUID();
  await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,state,capabilities)
    VALUES($1,$2,'ACTIVE',ARRAY['PUBLICATION_REVIEW']::text[])`,[staffId,userId]);
  await database.pool.query(`INSERT INTO staff.privilege_session
    (privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,
     security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,
    [privilegeSessionId,staffId,userId,sessionId,hash(`staff${staffId}`),hash(`csrf${staffId}`)]);
  const context={staffId,userId,ordinarySessionId:sessionId,privilegeSessionId,
    designation:"DELEGATED",securityEpoch:0,accountSecurityEpoch:0,grantRevision:0,
    capabilities:["PUBLICATION_REVIEW"]};
  return {staffId,context,tokenHash:hash(sessionId)};
}
async function attempt(d: Debate, outcome: { verdict: "CLEAR" | "FLAGGED"; categories: readonly string[] }, version = 1) {
  const { attemptId } = await checks.startPublishAttempt({runId:d.runId,answerId:d.answerId,answerVersion:version});
  return checks.insertResult({attemptId,runId:d.runId,answerId:d.answerId,answerVersion:version,
    synthesisOriginVersion:version,outcome:outcome as never,modelProviderRef:"fixture",modelId:"fixture",
    policyVersion,callCount:1,deadlineMs:60_000});
}
async function seedDecision(d: Debate, ref: string, staffId: string, outcome: "APPROVE" | "REFUSE") {
  const seed=await database.pool.connect();
  try {await seed.query("BEGIN");await seed.query("SET LOCAL session_replication_role=replica");
    await seed.query(`INSERT INTO serve.publication_review_decision
      (review_ref,run_id,outcome,reviewer_staff_id,content) VALUES($1,$2,$3,$4,'{}')`,
      [ref,d.runId,outcome,staffId]);
    await seed.query("COMMIT");
  } catch(error) {await seed.query("ROLLBACK");throw error;} finally {seed.release();}
}

describe("publication review repository under debateai_runtime", () => {
  it("ask maps ASKED, PENDING, NOT_ALLOWED and GRANT_INVALID", async () => {
    const d=await debate();
    expect(await ask(d,hash(randomUUID()))).toBe("GRANT_INVALID");
    expect(await ask(d)).toBe("ASKED");
    expect(await ask(d)).toBe("PENDING");
    const actor=await staff();
    await seedDecision(d,await reviewRef(d),actor.staffId,"APPROVE");
    expect(await ask(d)).toBe("NOT_ALLOWED");
  });

  it("readStates returns the owner's requests with decisions and the decrypted reason, and nothing for another owner", async () => {
    const d=await debate(); await ask(d);
    const actor=await staff(),opened=await reviews.open({context:actor.context,tokenHash:actor.tokenHash,
      reviewRef:await reviewRef(d),purpose:"DECIDE"});
    const proofId=randomUUID(),operationId=randomUUID();
    const binding={action:"PUBLICATION_REVIEW_REFUSE",targetId:opened.reviewRef,
      bodySha256:"0".repeat(64),expectedRevision:0,operationId};
    await database.pool.query(`INSERT INTO staff.action_proof
      (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,
       account_security_epoch,grant_revision,binding,credential_id,expires_at)
      VALUES($1,$2,$3,$4,$5,0,0,0,$6::jsonb,'fixture-verified-key',now()+interval '5 minutes')`,
      [proofId,actor.staffId,actor.context.userId,actor.context.ordinarySessionId,
        actor.context.privilegeSessionId,binding]);
    await reviews.decide({context:actor.context,tokenHash:actor.tokenHash,proofId,binding,
      opened,outcome:"REFUSE",reason:"Private reason"});
    const records=await reviews.readStates({ownerRef:owner.ownerRef,runId:d.runId,answerId:d.answerId});
    expect(records).toMatchObject([{originVersion:1,askOrdinal:1,
      decision:{outcome:"REFUSE",reason:"Private reason"}}]);
    expect(await reviews.readStates({ownerRef:randomUUID(),runId:d.runId,answerId:d.answerId})).toEqual([]);
  });

  it("approvalCovers is true only for the approved (answer, origin) pair", async () => {
    const d=await debate(); await ask(d);
    const actor=await staff();
    await seedDecision(d,await reviewRef(d),actor.staffId,"APPROVE");
    expect(await reviews.approvalCovers(d)).toBe(true);
    expect(await reviews.approvalCovers({...d,originVersion:2})).toBe(false);
    expect(await reviews.approvalCovers({...d,answerId:randomUUID()})).toBe(false);
  });

  it("a refusal never covers the origin for publication", async () => {
    const d=await debate(); await ask(d);
    const actor=await staff();
    await seedDecision(d,await reviewRef(d),actor.staffId,"REFUSE");
    expect(await reviews.approvalCovers(d)).toBe(false);
  });

  it("recordCopy stores a sealed copy: no plaintext column holds the question line, and decryption returns the snapshot", async () => {
    const d=await debate("Private publication question"); await ask(d);
    const actor=await staff(),opened=await reviews.open({context:actor.context,tokenHash:actor.tokenHash,
      reviewRef:await reviewRef(d),purpose:"READ"});
    const snapshot={question_line:d.questionLine,categories:["SUICIDE_OR_HARM_TO_OTHERS"]};
    await reviews.recordCopy({context:actor.context,tokenHash:actor.tokenHash,opened,answerVersion:1,snapshot});
    const row=(await database.pool.query<{copy_ref:string;content:unknown;content_ciphertext:never}>(
      "SELECT copy_ref,content,content_ciphertext FROM serve.publication_review_copy WHERE review_ref=$1",
      [opened.reviewRef])).rows[0]!;
    expect(row.content).toEqual({ciphertext:true,v:1});
    expect(JSON.stringify(row.content)).not.toContain(d.questionLine);
    expect(await decryptContentForRun(database.pool,d.runId,"serve.publication_review_copy",
      row.copy_ref,row.content_ciphertext,row.content)).toEqual(snapshot);
  });

  it("a decision waits for an in-flight READ copy and leaves no copy after it commits", async () => {
    const d=await debate(); await ask(d);
    const ref=await reviewRef(d),reader=await staff(),decider=await staff();
    const openedRead=await reviews.open({context:reader.context,tokenHash:reader.tokenHash,
      reviewRef:ref,purpose:"READ"});
    const openedDecide=await reviews.open({context:decider.context,tokenHash:decider.tokenHash,
      reviewRef:ref,purpose:"DECIDE"});
    const proofId=randomUUID(),operationId=randomUUID();
    const binding={action:"PUBLICATION_REVIEW_APPROVE",targetId:ref,bodySha256:"0".repeat(64),
      expectedRevision:0,operationId};
    await database.pool.query(`INSERT INTO staff.action_proof
      (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,
       account_security_epoch,grant_revision,binding,credential_id,expires_at)
      VALUES($1,$2,$3,$4,$5,0,0,0,$6::jsonb,'fixture-verified-key',now()+interval '5 minutes')`,
      [proofId,decider.staffId,decider.context.userId,decider.context.ordinarySessionId,
        decider.context.privilegeSessionId,binding]);
    const scheduler=await database.pool.connect();
    let reading: Promise<unknown>|undefined,deciding: Promise<unknown>|undefined;
    try {
      await scheduler.query("BEGIN");
      await scheduler.query("SELECT 1 FROM serve.answer WHERE answer_id=$1 AND answer_version=1 FOR UPDATE",[d.answerId]);
      reading=reviews.recordCopy({context:reader.context,tokenHash:reader.tokenHash,
        opened:openedRead,answerVersion:1,snapshot:{question_line:d.questionLine}});
      let blocked=false;
      for(let tries=0;tries<100 && !blocked;tries++) {
        const row=await database.pool.query<{waiting:boolean}>(`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'
            AND query LIKE '%record_publication_review_copy%') waiting`);
        blocked=row.rows[0]!.waiting;
        if(!blocked) await new Promise(resolve=>setTimeout(resolve,50));
      }
      expect(blocked).toBe(true);
      let settled=false;
      deciding=reviews.decide({context:decider.context,tokenHash:decider.tokenHash,proofId,binding,
        opened:openedDecide,outcome:"APPROVE",reason:""}).finally(()=>{settled=true;});
      await new Promise(resolve=>setTimeout(resolve,100));
      expect(settled).toBe(false);
      await scheduler.query("COMMIT");
      await reading; await deciding;
      expect((await database.pool.query("SELECT count(*)::int n FROM serve.publication_review_copy WHERE review_ref=$1",[ref])).rows[0]!.n).toBe(0);
    } finally {
      await scheduler.query("ROLLBACK").catch(()=>{});
      await Promise.allSettled([reading,deciding].filter((value): value is Promise<unknown>=>value!==undefined));
      scheduler.release();
    }
  },30_000);

  it("decide seals the reason, deletes the request's copies and writes one APPROVE or REFUSE event", async () => {
    const d=await debate(); await ask(d);
    const actor=await staff(),ref=await reviewRef(d);
    const read=await reviews.open({context:actor.context,tokenHash:actor.tokenHash,reviewRef:ref,purpose:"READ"});
    await reviews.recordCopy({context:actor.context,tokenHash:actor.tokenHash,opened:read,
      answerVersion:1,snapshot:{question_line:"Secret copy"}});
    const opened=await reviews.open({context:actor.context,tokenHash:actor.tokenHash,reviewRef:ref,purpose:"DECIDE"});
    const proofId=randomUUID(),operationId=randomUUID();
    const binding={action:"PUBLICATION_REVIEW_APPROVE",targetId:ref,bodySha256:"0".repeat(64),
      expectedRevision:0,operationId};
    await database.pool.query(`INSERT INTO staff.action_proof
      (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,
       account_security_epoch,grant_revision,binding,credential_id,expires_at)
      VALUES($1,$2,$3,$4,$5,0,0,0,$6::jsonb,'fixture-verified-key',now()+interval '5 minutes')`,
      [proofId,actor.staffId,actor.context.userId,actor.context.ordinarySessionId,
        actor.context.privilegeSessionId,binding]);
    const decided=await reviews.decide({context:actor.context,tokenHash:actor.tokenHash,proofId,binding,
      opened,outcome:"APPROVE",reason:"Must be absent"});
    expect(decided.decidedAt).toBeInstanceOf(Date);
    const row=(await database.pool.query<{content:unknown;content_ciphertext:unknown}>(
      "SELECT content,content_ciphertext FROM serve.publication_review_decision WHERE review_ref=$1",[ref])).rows[0]!;
    expect(row.content).toEqual({ciphertext:true,v:1});
    expect(JSON.stringify(row)).not.toContain("Must be absent");
    expect((await database.pool.query("SELECT count(*)::int n FROM serve.publication_review_copy WHERE review_ref=$1",[ref])).rows[0]!.n).toBe(0);
    expect((await database.pool.query("SELECT action FROM staff.publication_review_event WHERE review_ref=$1 ORDER BY recorded_at",[ref])).rows)
      .toEqual([{action:"READ"},{action:"APPROVE"}]);
  });

  it("listPending orders by asked_at and omits decided and erased requests", async () => {
    const first=await debate(),second=await debate(),third=await debate(),fourth=await debate();
    await ask(first); await ask(second); await ask(third); await ask(fourth);
    const actor=await staff(), firstRef=await reviewRef(first),secondRef=await reviewRef(second),
      thirdRef=await reviewRef(third),fourthRef=await reviewRef(fourth);
    await database.pool.query("UPDATE serve.publication_review_request SET asked_at=now()-interval '2 hours' WHERE review_ref=$1",[firstRef]);
    await database.pool.query("UPDATE serve.publication_review_request SET asked_at=now()-interval '1 hour' WHERE review_ref=$1",[fourthRef]);
    await seedDecision(third,thirdRef,actor.staffId,"APPROVE");
    await database.pool.query("DELETE FROM core.run_content_attestation_secret WHERE run_id=$1",[second.runId]);
    const items=await reviews.listPending({context:actor.context,tokenHash:actor.tokenHash,limit:100});
    expect(items.filter(item=>[firstRef,fourthRef].includes(item.reviewRef)).map(item=>item.reviewRef))
      .toEqual([firstRef,fourthRef]);
    expect(items.map(item=>item.reviewRef)).not.toContain(secondRef);
    expect(items.map(item=>item.reviewRef)).not.toContain(thirdRef);
    expect(items.find(item=>item.reviewRef===firstRef)?.askedAt).toBeInstanceOf(Date);
  });

  it("readAnswerIndex sets publication_review on a FLAGGED row and null on a CLEAR row", async () => {
    const flagged=await debate(),clear=await debate();
    expect(await attempt(flagged,{verdict:"FLAGGED",categories:["HATE_SPEECH"]})).toBe("INSERTED");
    expect(await attempt(clear,{verdict:"CLEAR",categories:[]})).toBe("INSERTED");
    expect(await ask(flagged)).toBe("ASKED");
    const page=await new ServeRepository(database.pool).readAnswerIndex({ownerRef:owner.ownerRef,legacyAskerId:null},100,0);
    expect(page.items.find(item=>item.run_ref===flagged.runId)?.publication_review)
      .toEqual({review_state:"UNDER_REVIEW",asks_used:1,visibility:"PRIVATE"});
    expect(page.items.find(item=>item.run_ref===clear.runId)?.publication_review).toBeNull();
  });

  it("readAnswerIndex reports visibility PUBLISHED after a publish event and PRIVATE after an unpublish event", async () => {
    const d=await debate();
    expect(await attempt(d,{verdict:"FLAGGED",categories:["HATE_SPEECH"]})).toBe("INSERTED");
    const visibility=async (state:"PUBLISHED"|"PRIVATE") => {
      const seed=await database.pool.connect();
      try { await seed.query("BEGIN"); await seed.query("SET LOCAL session_replication_role=replica");
        await seed.query(`INSERT INTO core.run_visibility_event
          (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
           actor_ref_version,warning_version,occurred_at,at_seq)
          VALUES($1,$2,$3,$4,$5,2,$6,now(),ledger.allocate_sequence())`,
          [randomUUID(),d.runId,randomUUID(),state,randomUUID(),
            state==="PUBLISHED"?"PUBLIC_INDEXED_V1":"COPIES_MAY_PERSIST_V1"]);
        await seed.query("COMMIT");
      } catch(error) {await seed.query("ROLLBACK");throw error;} finally {seed.release();}
      const page=await new ServeRepository(database.pool).readAnswerIndex({ownerRef:owner.ownerRef,legacyAskerId:null},100,0);
      return page.items.find(item=>item.run_ref===d.runId)?.publication_review?.visibility;
    };
    expect(await visibility("PUBLISHED")).toBe("PUBLISHED");
    expect(await visibility("PRIVATE")).toBe("PRIVATE");
  });

  it("after the run is erased readStates returns nothing and listPending omits it", async () => {
    const d=await debate();await ask(d);
    const actor=await staff(),ref=await reviewRef(d);
    await database.pool.query("DELETE FROM core.run_content_attestation_secret WHERE run_id=$1",[d.runId]);
    expect(await reviews.readStates({ownerRef:owner.ownerRef,runId:d.runId,answerId:d.answerId})).toEqual([]);
    expect((await reviews.listPending({context:actor.context,tokenHash:actor.tokenHash,limit:100}))
      .some(item=>item.reviewRef===ref)).toBe(false);
  });

  it("removal closes the pending request before erasure, then prepare severs private links and keeps staff events", async () => {
    const d=await debate();await ask(d);
    const firstReviewer=await staff(),firstRef=await reviewRef(d);
    await seedDecision(d,firstRef,firstReviewer.staffId,"REFUSE");
    expect(await ask(d)).toBe("ASKED");
    const actor=await staff(),ref=await reviewRef(d);
    const opened=await reviews.open({context:actor.context,tokenHash:actor.tokenHash,reviewRef:ref,purpose:"READ"});
    await reviews.recordCopy({context:actor.context,tokenHash:actor.tokenHash,opened,
      answerVersion:1,snapshot:{question_line:d.questionLine,categories:["HATE_SPEECH"]}});
    expect((await database.pool.query(`SELECT
      (SELECT count(*)::int FROM serve.publication_review_request WHERE run_id=$1) requests,
      (SELECT count(*)::int FROM serve.publication_review_decision WHERE run_id=$1) decisions,
      (SELECT count(*)::int FROM serve.publication_review_copy WHERE run_id=$1) copies`,[d.runId])).rows[0])
      .toEqual({requests:2,decisions:1,copies:1});
    await reviews.listPending({context:actor.context,tokenHash:actor.tokenHash,limit:100});
    const sealed=await import("@debateai/db").then(db=>db.encryptAttestedContentForRun(
      database.pool,d.runId,"serve.answer",`${d.answerId}:2`,{answerForm:null}));
    await database.pool.query(`INSERT INTO serve.answer (
      answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
      answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
      sealed_at_seq,confidence_band,band_ceiling,reversal_point,builds_on_previous,badges,
      verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation
    ) SELECT answer_id,2,run_id,work_item_id,terminal,serve_state,verdict_state,
      answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
      ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
      builds_on_previous,badges,verdict_unavailable,memory_disclosure,$2::jsonb,$3
      FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
      [d.answerId,JSON.stringify(sealed!.envelope),sealed!.attestation]);
    expect(await attempt(d,{verdict:"FLAGGED",categories:["SUICIDE_OR_HARM_TO_OTHERS"]},2)).toBe("INSERTED");
    expect((await reviews.listPending({context:actor.context,tokenHash:actor.tokenHash,limit:100}))
      .some(item=>item.reviewRef===ref)).toBe(false);
    for (const purpose of ["READ","DECIDE"] as const) {
      await expect(reviews.open({context:actor.context,tokenHash:actor.tokenHash,reviewRef:ref,purpose}))
        .rejects.toMatchObject({code:"PUBLICATION_REVIEW_NOT_FOUND"});
    }
    const erasure=await database.pool.connect();
    try {await erasure.query("BEGIN");await erasure.query("SET LOCAL ROLE debateai_erasure_runtime");
      await erasure.query("SELECT * FROM core.prepare_synthesis_check_erasures(100)");
      await erasure.query("COMMIT");
    } catch(error) {await erasure.query("ROLLBACK");throw error;} finally {erasure.release();}
    const counts=(await database.pool.query(`SELECT
      (SELECT count(*)::int FROM serve.publication_review_request WHERE run_id=$1) requests,
      (SELECT count(*)::int FROM serve.publication_review_decision WHERE run_id=$1) decisions,
      (SELECT count(*)::int FROM serve.publication_review_copy WHERE run_id=$1) copies,
      (SELECT count(*)::int FROM staff.publication_review_event WHERE review_ref=$2) events`,
      [d.runId,ref])).rows[0]!;
    expect(counts).toEqual({requests:0,decisions:0,copies:0,events:1});
    const join=`SELECT e.review_ref,r.run_id,r.answer_id,run.asker_id
      FROM staff.publication_review_event e
      LEFT JOIN serve.publication_review_request r ON r.review_ref=e.review_ref
      LEFT JOIN core.run run ON run.run_id=r.run_id WHERE e.review_ref=$1`;
    expect((await database.pool.query(join,[ref])).rows[0]).toMatchObject({run_id:null,answer_id:null,asker_id:null});
    const staffOwner=await database.pool.connect();
    try {await staffOwner.query("SET ROLE debateai_staff_security_owner");
      expect((await staffOwner.query(join,[ref])).rows[0]).toMatchObject({run_id:null,answer_id:null,asker_id:null});
    } finally {staffOwner.release();}
    await expect(runtime.query(join,[ref])).rejects.toMatchObject({code:"42501"});
  });
});
