import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun,
  migrate, type Pool } from "@debateai/db";
import { ServeRepository, SynthesisCheckRepository } from "@debateai/serve";
import { WorkItemRepository } from "@debateai/battery";
import { FileRunContentKeyStore } from "@debateai/crypto";
import type { SynthesisCheckOutcome } from "@debateai/contract";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalAnswer, persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

const policyVersion = "synthesis.content-check.v1@0123456789abcdef";
const clear = { verdict: "CLEAR", categories: [] } as const;
const flagged = { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] } as const;
const unavailable = { verdict: "UNAVAILABLE", categories: [], failureCode: "TRANSPORT_FAILED" } as const;

let database: TestDatabase;
let runtime: Pool;
let owner: StoryEncryptedOwner;
let repository: SynthesisCheckRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
  configureContentEncryption(runtime, contentCipherFor(database.pool)!);
  repository = new SynthesisCheckRepository(runtime);
}, 180_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

async function fixture() {
  const runId = await createEncryptedStoryRun(database.pool, owner, `Synthesis ${randomUUID()}?`);
  const { answerId, workItemId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: randomUUID(),
    factBundle: {
      facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  return { runId, answerId, workItemId, answerVersion: 1 };
}

async function publishAttempt(answer: Awaited<ReturnType<typeof fixture>>) {
  return repository.startPublishAttempt(answer);
}

async function cloneVersion(answer: Awaited<ReturnType<typeof fixture>>) {
  const sealed = await encryptAttestedContentForRun(
    database.pool, answer.runId, "serve.answer", `${answer.answerId}:2`, { answerForm: null }
  );
  if (sealed === null) throw new Error("TEST_ANSWER_CIPHER_MISSING");
  await database.pool.query(
    `INSERT INTO serve.answer (
       answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
       answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
       sealed_at_seq,confidence_band,band_ceiling,reversal_point,builds_on_previous,badges,
       verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation
     ) SELECT answer_id,2,run_id,work_item_id,terminal,serve_state,verdict_state,
              answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
              ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
              builds_on_previous,badges,verdict_unavailable,memory_disclosure,
              $2::jsonb,$3
       FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
    [answer.answerId, JSON.stringify(sealed.envelope), sealed.attestation]
  );
  return { ...answer, answerVersion: 2 };
}

function resultInput(answer: Awaited<ReturnType<typeof fixture>>, attemptId: string, outcome: SynthesisCheckOutcome = clear) {
  return {
    ...answer, attemptId, synthesisOriginVersion: 1, outcome,
    modelProviderRef: "haiku", modelId: "claude-haiku-5-5", policyVersion,
    callCount: 1 as const, deadlineMs: 60_000
  };
}

describe("synthesis check repository under debateai_runtime", () => {
  it("refuses a second final for a copied synthesis even when the caller forges its origin version", async () => {
    // Property: a caller-supplied origin cannot turn the same synthesis into a second final verdict.
    const first = await fixture();
    const firstAttempt = await publishAttempt(first);
    expect(await repository.insertResult(resultInput(first, firstAttempt.attemptId))).toBe("INSERTED");
    const second = await cloneVersion(first);
    const forgedAttempt = await publishAttempt(second);
    expect(await repository.insertResult({
      ...resultInput(second, forgedAttempt.attemptId, flagged), synthesisOriginVersion: 2
    })).toBe("ALREADY_FINAL");
    expect(await repository.runRemovedByCheck(first.runId)).toBe(false);
    const finals = await database.pool.query<{ answer_version: number }>(
      `SELECT answer_version FROM serve.synthesis_check_result WHERE answer_id=$1 AND final`, [first.answerId]
    );
    expect(finals.rows).toEqual([{ answer_version: 1 }]);
  });

  it("claims each request once: two claimers running at once insert one attempt per request", async () => {
    expect((await runtime.query<{ current_user: string }>("SELECT current_user")).rows[0]?.current_user)
      .toBe("debateai_runtime");
    const first = await fixture();
    const second = await fixture();
    expect(await repository.insertRequest(first)).toBe("INSERTED");
    expect(await repository.insertRequest(second)).toBe("INSERTED");
    await database.pool.query(`CREATE FUNCTION serve.test_slow_synthesis_attempt() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$`);
    await database.pool.query(`CREATE TRIGGER test_slow_synthesis_attempt BEFORE INSERT
      ON serve.synthesis_check_attempt FOR EACH ROW EXECUTE FUNCTION serve.test_slow_synthesis_attempt()`);
    try {
      const claims = (await Promise.all([
        repository.claimNextRequests(1, 60_000), repository.claimNextRequests(1, 60_000)
      ])).flat();
      expect(claims).toHaveLength(2);
      expect(new Set(claims.map((claim) => claim.requestId)).size).toBe(2);
      expect(new Set(claims.map((claim) => claim.answerId))).toEqual(new Set([first.answerId, second.answerId]));
      expect(claims.every((claim) => claim.startedAt instanceof Date)).toBe(true);
    } finally {
      await database.pool.query(`DROP TRIGGER test_slow_synthesis_attempt ON serve.synthesis_check_attempt`);
      await database.pool.query(`DROP FUNCTION serve.test_slow_synthesis_attempt()`);
    }
  });

  it("insertResult seals verdict, categories, model facts and call count: readable columns contain no decision", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    expect(await repository.insertResult(resultInput(answer, attempt.attemptId, flagged))).toBe("INSERTED");
    const row = (await database.pool.query<Record<string, unknown>>(
      "SELECT * FROM serve.synthesis_check_result WHERE attempt_id=$1", [attempt.attemptId]
    )).rows[0]!;
    expect(Object.keys(row).sort()).toEqual([
      "result_id", "attempt_id", "run_id", "answer_id", "answer_version", "synthesis_origin_version",
      "final", "failure_code", "policy_version", "checked_at", "content", "content_ciphertext",
      "content_attestation"
    ].sort());
    expect(row.content).toEqual({ ciphertext: true, v: 1 });
    expect(row.content_ciphertext).toBeTruthy();
    expect(JSON.stringify({ ...row, content_ciphertext: null })).not.toMatch(/FLAGGED|CLEAR|NO_SYNTHESIS|SUICIDE_OR_HARM_TO_OTHERS/);
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome).toEqual(flagged);
  });

  it("every sealed payload has one length: CLEAR, FLAGGED, NO_SYNTHESIS and UNAVAILABLE envelopes match", async () => {
    const lengths: number[] = [];
    for (const outcome of [clear, flagged, { verdict: "NO_SYNTHESIS", categories: [] } as const, unavailable]) {
      const answer = await fixture();
      const attempt = await publishAttempt(answer);
      await repository.insertResult(resultInput(answer, attempt.attemptId, outcome));
      const row = (await database.pool.query<{ content_ciphertext: { ct: string } }>(
        "SELECT content_ciphertext FROM serve.synthesis_check_result WHERE attempt_id=$1", [attempt.attemptId]
      )).rows[0]!;
      lengths.push(row.content_ciphertext.ct.length);
    }
    expect(new Set(lengths).size).toBe(1);
  });

  it("insertResult answers ALREADY_FINAL for a second final verdict of the same synthesis and stores nothing", async () => {
    const answer = await fixture();
    const first = await publishAttempt(answer);
    const second = await publishAttempt(answer);
    expect(await repository.insertResult(resultInput(answer, first.attemptId))).toBe("INSERTED");
    expect(await repository.insertResult(resultInput(answer, second.attemptId, flagged))).toBe("ALREADY_FINAL");
    expect((await repository.readRecords({ ...answer, maxVersion: 1 })).map((r) => r.outcome)).toEqual([clear]);
  });

  it("readInFlightAttempts lists only unfinished attempts younger than D", async () => {
    const answer = await fixture();
    const current = await publishAttempt(answer);
    const oldId = randomUUID();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_attempt(
         attempt_id,run_id,answer_id,answer_version,origin,started_at
       ) VALUES ($1,$2,$3,1,'PUBLISH',clock_timestamp()-interval '2 minutes')`,
      [oldId, answer.runId, answer.answerId]
    );
    const active = await repository.readInFlightAttempts({ answerId: answer.answerId, maxVersion: 1, deadlineMs: 60_000 });
    expect(active.some((a) => a.attemptId === current.attemptId)).toBe(true);
    expect(active.some((a) => a.attemptId === oldId)).toBe(false);
  });

  it("claimNextRequests claims only DONE settled answers and never a request D or more old", async () => {
    const answer = await fixture();
    await repository.insertRequest(answer);
    const claims = await repository.claimNextRequests(10, 60_000);
    expect(claims.some((claim) => claim.answerId === answer.answerId)).toBe(true);
    expect(claims.find((claim) => claim.answerId === answer.answerId)?.startedAt).toBeInstanceOf(Date);
    const unsettledRunId = await createEncryptedStoryRun(database.pool, owner, `Unsettled ${randomUUID()}?`);
    const unsettledWorkItemId = await new WorkItemRepository(database.pool).enqueue({
      runId: unsettledRunId, batteryRowId: "Q1", nodeSet: [], commandKey: `synthesis-unsettled:${randomUUID()}`
    });
    const unsettled = await persistTerminalAnswer({
      pool: database.pool, runId: unsettledRunId, workItemId: unsettledWorkItemId,
      fixtureKey: randomUUID(),
      factBundle: {
        facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    });
    await repository.insertRequest({ runId: unsettledRunId, answerId: unsettled.answerId, answerVersion: 1 });
    expect((await repository.claimNextRequests(10, 60_000))
      .some((claim) => claim.answerId === unsettled.answerId)).toBe(false);
    const stale = await fixture();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_request(
         request_id,run_id,answer_id,answer_version,requested_at
       ) VALUES ($1,$2,$3,1,clock_timestamp()-interval '2 minutes')`,
      [randomUUID(), stale.runId, stale.answerId]
    );
    expect((await repository.claimNextRequests(10, 1_500)).some((claim) => claim.answerId === stale.answerId)).toBe(false);
  });

  it("insertResult of a final outcome after the attempt deadline stores UNAVAILABLE DEADLINE and answers LATE", async () => {
    const answer = await fixture();
    const attemptId = randomUUID();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_attempt(
         attempt_id,run_id,answer_id,answer_version,origin,started_at
       ) VALUES ($1,$2,$3,1,'PUBLISH',clock_timestamp()-interval '2 minutes')`,
      [attemptId, answer.runId, answer.answerId]
    );
    expect(await repository.insertResult({ ...resultInput(answer, attemptId, flagged), deadlineMs: 1_500 })).toBe("LATE");
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
    expect(await repository.runRemovedByCheck(answer.runId)).toBe(false);
  });

  it("an UNAVAILABLE outcome is stored as given after its attempt deadline", async () => {
    const answer = await fixture();
    const attemptId = randomUUID();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_attempt(
         attempt_id,run_id,answer_id,answer_version,origin,started_at
       ) VALUES ($1,$2,$3,1,'PUBLISH',clock_timestamp()-interval '2 minutes')`,
      [attemptId, answer.runId, answer.answerId]
    );
    expect(await repository.insertResult({ ...resultInput(answer, attemptId, unavailable), deadlineMs: 1_500 }))
      .toBe("INSERTED");
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome).toEqual(unavailable);
  });

  it("insertResult of FLAGGED with SUICIDE_OR_HARM_TO_OTHERS writes a removal request and owner notice", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    expect(await repository.insertResult(resultInput(answer, attempt.attemptId, flagged))).toBe("INSERTED");
    expect(await repository.runRemovedByCheck(answer.runId)).toBe(true);
    expect(await repository.removalNoticeExists(owner.ownerRef)).toBe(true);
    expect(await repository.readAnswerAccess({ runId: answer.runId, deadlineMs: 1_500 })).toBe("REMOVED");
    const refused = await fixture();
    const refusedAttempt = await publishAttempt(refused);
    const noticesBefore = (await database.pool.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM serve.synthesis_check_removal_notice WHERE owner_ref=$1`,
      [owner.ownerRef]
    )).rows[0]!.n;
    await database.pool.query(`CREATE FUNCTION serve.test_refuse_check_removal() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_REMOVAL_REFUSED'; END $$`);
    await database.pool.query(`CREATE TRIGGER test_refuse_check_removal BEFORE INSERT ON serve.synthesis_check_removal_request
      FOR EACH ROW EXECUTE FUNCTION serve.test_refuse_check_removal()`);
    try {
      await expect(repository.insertResult(resultInput(refused, refusedAttempt.attemptId, flagged))).rejects.toThrow("TEST_REMOVAL_REFUSED");
      expect(await repository.readRecords({ ...refused, maxVersion: 1 })).toEqual([]);
      expect(await repository.runRemovedByCheck(refused.runId)).toBe(false);
      expect((await database.pool.query<{ n: number }>(
        `SELECT count(*)::integer AS n FROM serve.synthesis_check_removal_notice WHERE owner_ref=$1`,
        [owner.ownerRef]
      )).rows[0]!.n).toBe(noticesBefore);
    } finally {
      await database.pool.query(`DROP TRIGGER test_refuse_check_removal ON serve.synthesis_check_removal_request`);
      await database.pool.query(`DROP FUNCTION serve.test_refuse_check_removal()`);
    }
  });

  it("readAnswerAccess holds a fresh request, shows an expired request and shows a checked answer", async () => {
    const fresh = await fixture();
    await repository.insertRequest(fresh);
    expect(await repository.readAnswerAccess({ ...fresh, deadlineMs: 60_000 })).toBe("HELD");
    const expired = await fixture();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_request(
         request_id,run_id,answer_id,answer_version,requested_at
       ) VALUES ($1,$2,$3,1,clock_timestamp()-interval '2 minutes')`,
      [randomUUID(), expired.runId, expired.answerId]
    );
    expect(await repository.readAnswerAccess({ ...expired, deadlineMs: 1_500 })).toBe("SHOW");
    const extended = await fixture();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_request(
         request_id,run_id,answer_id,answer_version,requested_at
       ) VALUES ($1,$2,$3,1,clock_timestamp()-interval '2 seconds')`,
      [randomUUID(), extended.runId, extended.answerId]
    );
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_attempt(
         attempt_id,run_id,answer_id,answer_version,origin,started_at
       ) VALUES ($1,$2,$3,1,'PUBLISH',clock_timestamp()-interval '1.2 seconds')`,
      [randomUUID(), extended.runId, extended.answerId]
    );
    expect(await repository.readAnswerAccess({ ...extended, deadlineMs: 1_500 })).toBe("HELD");
    const lateStart = await fixture();
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_request(
         request_id,run_id,answer_id,answer_version,requested_at
       ) VALUES ($1,$2,$3,1,clock_timestamp()-interval '2 seconds')`,
      [randomUUID(), lateStart.runId, lateStart.answerId]
    );
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_attempt(
         attempt_id,run_id,answer_id,answer_version,origin,started_at
       ) VALUES ($1,$2,$3,1,'PUBLISH',clock_timestamp()-interval '0.1 seconds')`,
      [randomUUID(), lateStart.runId, lateStart.answerId]
    );
    expect(await repository.readAnswerAccess({ ...lateStart, deadlineMs: 1_500 })).toBe("SHOW");
    const attempt = await publishAttempt(fresh);
    await repository.insertResult(resultInput(fresh, attempt.attemptId));
    expect(await repository.readAnswerAccess({ ...fresh, deadlineMs: 60_000 })).toBe("SHOW");
  });

  it("readAnswerAccess with no version reads the run's settled answer, not a lost answer", async () => {
    const answer = await fixture();
    await repository.insertRequest(answer);
    expect(await repository.readAnswerAccess({ runId: answer.runId, deadlineMs: 60_000 })).toBe("HELD");
    expect(await repository.readAnswerAccess({ runId: answer.runId, answerId: randomUUID(),
      answerVersion: 1, deadlineMs: 60_000 })).toBe("SHOW");
  });

  it("insertInheritance links a later version to its synthesis's final verdict and its access turns SHOW", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    expect(await repository.readFinalResultId({ answerId: answer.answerId, synthesisOriginVersion: 1 })).toBeNull();
    await repository.insertResult(resultInput(answer, attempt.attemptId));
    const resultId = await repository.readFinalResultId({ answerId: answer.answerId, synthesisOriginVersion: 1 });
    expect(resultId).toMatch(/^[0-9a-f-]{36}$/);
    const later = await cloneVersion(answer);
    await repository.insertRequest(later);
    expect(await repository.readAnswerAccess({ ...later, deadlineMs: 60_000 })).toBe("HELD");
    const inheritedAttempt = await publishAttempt(later);
    expect(await repository.insertInheritance({ ...later, attemptId: inheritedAttempt.attemptId,
      inheritedResultId: resultId! })).toBe("INSERTED");
    expect(await repository.readAnswerAccess({ ...later, deadlineMs: 60_000 })).toBe("SHOW");
  });

  it("take, exists and purge removal notices answer as their database functions do", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    await repository.insertResult(resultInput(answer, attempt.attemptId, flagged));
    expect(await repository.removalNoticeExists(owner.ownerRef)).toBe(true);
    expect(await repository.takeRemovalNotice(owner.ownerRef)).toBe(true);
    expect(await repository.removalNoticeExists(owner.ownerRef)).toBe(false);
    await database.pool.query(
      `INSERT INTO serve.synthesis_check_removal_notice(owner_ref,removed_at)
       VALUES ($1,clock_timestamp()-interval '91 days')`, [owner.ownerRef]
    );
    expect(await repository.purgeExpiredRemovalNotices()).toBe(1);
  });

  it("ownerRefOfRun names the latest recorded owner", async () => {
    const runId = randomUUID();
    await database.pool.query(`INSERT INTO core.run (run_id,question_line,asker_id,session_id,caller_scope,as_of,
      asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,depth_params,
      agent_count,discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,created_at_seq)
      VALUES ($1,'Ownership chronology?','test-asker','test-session','ASKER',clock_timestamp(),'casual','casual',
        'ASKER','test','low','{}'::jsonb,1,'[{}]'::jsonb,0,'{}'::jsonb,1,'test',ledger.allocate_sequence())`, [runId]);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, owner.ownerRef]);
    expect(await repository.ownerRefOfRun(runId)).toBe(owner.ownerRef);
    const successor = { userId: randomUUID(), ownerRef: randomUUID() };
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,owner_ref,state,adult_affirmed_at)
      VALUES ($1,$2,'{}'::jsonb,'fixture-password-hash',$3,$4,'active',clock_timestamp())`,
      [successor.userId, randomBytes(32), `owner-latest-${successor.userId}`, successor.ownerRef]);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, successor.ownerRef]);
    expect(await repository.ownerRefOfRun(runId)).toBe(successor.ownerRef);
  });

  it("verdict of record: a final verdict covers a byte-identical synthesis, while a changed synthesis has none", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    await repository.insertResult(resultInput(answer, attempt.attemptId, flagged));
    const records = await repository.readRecords({ ...answer, maxVersion: 1 });
    const { verdictOfRecord } = await import("../../packages/serve/src/synthesis-check.js");
    expect(verdictOfRecord(records, (origin) => origin === 1)?.verdict).toBe("FLAGGED");
    expect(verdictOfRecord(records, (origin) => origin === 2)).toBeNull();
  });

  it("verdict of record: with no final verdict the most recent UNAVAILABLE is the verdict of record", async () => {
    const answer = await fixture();
    const first = await publishAttempt(answer);
    const second = await publishAttempt(answer);
    await repository.insertResult(resultInput(answer, first.attemptId, unavailable));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repository.insertResult(resultInput(answer, second.attemptId,
      { verdict: "UNAVAILABLE", categories: [], failureCode: "HTTP_STATUS" }));
    const { verdictOfRecord } = await import("../../packages/serve/src/synthesis-check.js");
    const records = await repository.readRecords({ ...answer, maxVersion: 1 });
    expect(records[0]?.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "HTTP_STATUS" });
    expect(verdictOfRecord(records, () => true)?.checkedAt).toEqual(records[0]?.checkedAt);
  });

  it("readAnswerIndex as the owner lists synthesis_flag for FLAGGED and null for CLEAR", async () => {
    const bad = await fixture();
    const good = await fixture();
    const noSynthesis = await fixture();
    const noResult = await fixture();
    const failed = await fixture();
    const badAttempt = await publishAttempt(bad);
    const goodAttempt = await publishAttempt(good);
    await repository.insertResult(resultInput(bad, badAttempt.attemptId,
      { verdict: "FLAGGED", categories: ["TERRORISM"] }));
    await repository.insertResult(resultInput(good, goodAttempt.attemptId));
    await repository.insertResult(resultInput(noSynthesis, (await publishAttempt(noSynthesis)).attemptId,
      { verdict: "NO_SYNTHESIS", categories: [] }));
    await repository.insertResult(resultInput(failed, (await publishAttempt(failed)).attemptId, unavailable));
    expect(await repository.runRemovedByCheck(bad.runId)).toBe(false);
    const inherited = await cloneVersion(bad);
    const inheritedAttempt = await publishAttempt(inherited);
    const resultId = await repository.readFinalResultId({ answerId: bad.answerId, synthesisOriginVersion: 1 });
    await repository.insertInheritance({ ...inherited, attemptId: inheritedAttempt.attemptId,
      inheritedResultId: resultId! });
    const index = await new ServeRepository(runtime).readAnswerIndex({ ownerRef: owner.ownerRef, legacyAskerId: null }, 100, 0);
    expect(index.items.find((item) => item.answer_id === bad.answerId)?.synthesis_flag).toEqual({ verdict: "FLAGGED" });
    expect(index.items.find((item) => item.answer_id === good.answerId)?.synthesis_flag).toBeNull();
    for (const answer of [noSynthesis, noResult, failed]) {
      expect(index.items.find((item) => item.answer_id === answer.answerId)?.synthesis_flag).toBeNull();
    }
  });

  it("readAnswerIndex as account B lists none of account A's rows", async () => {
    const answer = await fixture();
    const otherOwnerRef = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user"(
         user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
         phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
         adult_affirmed_at,created_at
       ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [randomUUID(), randomBytes(32), `synthesis-${randomUUID()}`, randomUUID(), otherOwnerRef]
    );
    const index = await new ServeRepository(runtime).readAnswerIndex({ ownerRef: otherOwnerRef, legacyAskerId: null }, 10, 0);
    expect(index.items.some((item) => item.answer_id === answer.answerId)).toBe(false);
  });

  it("after the run's content is erased no role can read its verdict or category", async () => {
    const answer = await fixture();
    const attempt = await publishAttempt(answer);
    await repository.insertResult(resultInput(answer, attempt.attemptId, flagged));
    const prepared = await database.pool.query<{ outcome: string; run_id: string }>(
      `SELECT * FROM core.prepare_synthesis_check_erasures(100)`
    );
    expect(prepared.rows.find((row) => row.run_id === answer.runId)?.outcome).toBe("PREPARED");
    await expect(repository.readRecords({ ...answer, maxVersion: 1 })).rejects.toThrow(/Private content is no longer available/);
    const readable = (await database.pool.query<Record<string, unknown>>(
      `SELECT * FROM serve.synthesis_check_result WHERE run_id=$1`, [answer.runId]
    )).rows[0]!;
    expect(JSON.stringify({ ...readable, content_ciphertext: null })).not.toMatch(/FLAGGED|SUICIDE_OR_HARM_TO_OTHERS/);
  });

  it("CLEAR and FLAGGED leave the same readable result and spend columns after both keys are destroyed", async () => {
    const pair = [await fixture(), await fixture()];
    const outcomes = [clear, { verdict: "FLAGGED", categories: ["HATE_SPEECH"] } as const];
    const keys = new FileRunContentKeyStore(owner.secretRoot,
      {} as ConstructorParameters<typeof FileRunContentKeyStore>[1], async () => owner.userId);
    for (const [index, answer] of pair.entries()) {
      const attempt = await publishAttempt(answer!);
      expect(await repository.insertResult(resultInput(answer!, attempt.attemptId, outcomes[index]!))).toBe("INSERTED");
      await database.pool.query(`INSERT INTO ledger.model_spend
        (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES ($1,'SYNTHESIS_CHECK',$2,'anthropic',current_date,25,100,30)`, [randomUUID(), answer!.runId]);
      expect(await keys.destroy(answer!.runId)).toBe("DESTROYED");
      await expect(repository.readRecords({ ...answer!, maxVersion: 1 })).rejects.toThrow();
    }
    const rows = await Promise.all(pair.map(async (answer) => ({
      result: (await database.pool.query(`SELECT answer_version,synthesis_origin_version,final,failure_code,
          policy_version,content,length(content_ciphertext->>'ct') AS ciphertext_length,
          octet_length(content_attestation) AS attestation_length
        FROM serve.synthesis_check_result WHERE run_id=$1`, [answer.runId])).rows[0],
      spend: (await database.pool.query(`SELECT spend_source,provider_ref,charge_micros,input_tokens,output_tokens
        FROM ledger.model_spend WHERE run_id=$1 AND spend_source='SYNTHESIS_CHECK'`, [answer.runId])).rows[0]
    })));
    expect(rows[0]).toEqual(rows[1]);
    expect(JSON.stringify(rows[0])).not.toMatch(/HATE_SPEECH|FLAGGED|CLEAR/);
  });

  it("insertResult answers RUN_ERASED after erasure and stores nothing", async () => {
    const answer = await fixture();
    const first = await publishAttempt(answer);
    const second = await publishAttempt(answer);
    await repository.insertResult(resultInput(answer, first.attemptId, flagged));
    const prepared = await database.pool.query<{ outcome: string; run_id: string }>(
      `SELECT * FROM core.prepare_synthesis_check_erasures(100)`
    );
    expect(prepared.rows.find((row) => row.run_id === answer.runId)?.outcome).toBe("PREPARED");
    expect(await repository.insertResult(resultInput(answer, second.attemptId, clear))).toBe("RUN_ERASED");
    expect((await database.pool.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM serve.synthesis_check_result WHERE run_id=$1`, [answer.runId]
    )).rows[0]?.n).toBe(1);
  });
});
