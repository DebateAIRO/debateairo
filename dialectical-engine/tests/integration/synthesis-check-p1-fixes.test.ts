// Focused database regressions for the hold deadline, same-synthesis batching,
// Publish's wait, and the runtime's restricted write grants.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun, migrate, withRunContentLease, type Pool } from "@debateai/db";
import { ServeRepository, SynthesisCheckRepository } from "@debateai/serve";
import type { Answer } from "@debateai/contract";
import { readPromptFrame } from "../../packages/providers/src/prompt-frame.js";
import type { PromptPacket } from "../../packages/providers/src/index.js";
import { judgeCallValue } from "../../apps/api/src/publication-check/verdict.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";

let database: TestDatabase;
let runtime: Pool;
let owner: StoryEncryptedOwner;
let repository: SynthesisCheckRepository;
let serve: ServeRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
  configureContentEncryption(runtime, contentCipherFor(database.pool)!);
  repository = new SynthesisCheckRepository(runtime);
  serve = new ServeRepository(runtime);
}, 180_000);
afterAll(async () => {
  await runtime?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const policyVersion = "synthesis.content-check.v1@0123456789abcdef";

async function settled() {
  const runId = await createEncryptedStoryRun(database.pool, owner, `REV race ${randomUUID()}?`);
  const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(), factBundle: {
    facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"], reversalPoint: "No firm conclusion",
    buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
  return { runId, answerId, answerVersion: 1 };
}

describe("synthesis check race and runtime-capability regressions", () => {
  it("the API runtime has no direct INSERT capability on removal notices or inheritance", async () => {
    const rights = await runtime.query<{ relation: string; allowed: boolean }>(`
      SELECT relation,has_table_privilege(current_user,relation,'INSERT') AS allowed
      FROM (VALUES ('serve.synthesis_check_removal_notice'),('serve.synthesis_check_inheritance')) AS names(relation)`);
    expect(rights.rows).toEqual([
      { relation: "serve.synthesis_check_removal_notice", allowed: false },
      { relation: "serve.synthesis_check_inheritance", allowed: false }
    ]);
  });
  it("A: a claim crossing requested_at + D cannot re-hold or delete a shown answer", async () => {
    const D = 1_000;
    const answer = await settled();
    await database.pool.query(`INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version,requested_at)
      VALUES (gen_random_uuid(),$1,$2,1,clock_timestamp() - make_interval(secs => $3::double precision / 1000.0))`,
      [answer.runId, answer.answerId, D - 200]);
    await database.pool.query(`CREATE FUNCTION serve.rev_slow_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$`);
    await database.pool.query(`CREATE TRIGGER rev_slow_attempt BEFORE INSERT ON serve.synthesis_check_attempt
      FOR EACH ROW EXECUTE FUNCTION serve.rev_slow_attempt()`);
    try {
      const before = await repository.readAnswerAccess({ ...answer, deadlineMs: D });
      const claiming = repository.claimNextRequests(1, D);
      await wait(400);
      const during = await repository.readAnswerAccess({ ...answer, deadlineMs: D });
      const [claim] = await claiming;
      const boundary = await database.pool.query<{ started_before_end: boolean; committed_after_end: boolean }>(
        `SELECT attempt.started_at < request.requested_at + make_interval(secs => $2::double precision / 1000.0) AS started_before_end,
                clock_timestamp() > request.requested_at + make_interval(secs => $2::double precision / 1000.0) AS committed_after_end
         FROM serve.synthesis_check_attempt AS attempt JOIN serve.synthesis_check_request AS request USING (request_id)
         WHERE attempt.answer_id=$1`, [answer.answerId, D]);
      const after = await repository.readAnswerAccess({ ...answer, deadlineMs: D });
      const inserted = claim === undefined ? "NO_CLAIM" : await repository.insertResult({
        ...answer, attemptId: claim.attemptId, synthesisOriginVersion: 1,
        outcome: { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] },
        modelProviderRef: "anthropic", modelId: "claude-haiku-5-5", policyVersion, callCount: 1, deadlineMs: D
      });
      const facts = { before, during, claimed: claim !== undefined, ...boundary.rows[0], after, inserted,
        removed: await repository.runRemovedByCheck(answer.runId) };
      console.log(`REV_PROBE_RACE_A ${JSON.stringify(facts)}`);
      expect(facts.before).toBe("HELD");
      expect(facts.removed).toBe(false);
    } finally {
      await database.pool.query("DROP TRIGGER rev_slow_attempt ON serve.synthesis_check_attempt");
      await database.pool.query("DROP FUNCTION serve.rev_slow_attempt()");
    }
  }, 60_000);

  it("B: same-synthesis versions served together cost one model call in one tick", async () => {
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const first = await settled();
    const sealed = await encryptAttestedContentForRun(database.pool, first.runId, "serve.answer", `${first.answerId}:2`, { answerForm: null });
    if (sealed === null) throw new Error("PROBE_CIPHER_MISSING");
    await database.pool.query(
      `INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
         answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,sealed_at_seq,confidence_band,
         band_ceiling,reversal_point,builds_on_previous,badges,verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation)
       SELECT answer_id,2,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,condition_marks,fact_bundle_id,
         composed_text_id,conformance_record_id,ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
         builds_on_previous,badges,verdict_unavailable,memory_disclosure,$2::jsonb,$3
       FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
      [first.answerId, JSON.stringify(sealed.envelope), sealed.attestation]);
    await repository.insertRequest(first);
    await repository.insertRequest({ ...first, answerVersion: 2 });
    let calls = 0;
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: async (_runId: string, answerId: string, version: number, ownerRef: string) => {
        if (_runId !== first.runId) return null;
        const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : { ...stored, serve_state: "COMPOSED",
          composed_text: [{ segment_id: randomUUID(), text: "Same synthesis", load_bearing: true, served_number_refs: [] }] } as Answer;
      },
      check: {
        port: () => ({ providerRef: "anthropic", modelId: "claude-haiku-5-5", async complete(input: { packet: PromptPacket; signal: AbortSignal }) {
          calls++;
          await wait(300);
          return { text: `{"call":"${judgeCallValue(readPromptFrame(input.packet).fence)}","TERRORISM":0,"HATE_SPEECH":0,"SUICIDE_OR_HARM_TO_OTHERS":0,"WEAPONS_OR_DRUGS":0}` };
        } }),
        deadlineMs: 60_000, recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    const rows = await database.pool.query<{ results: string; finals: string; inheritances: string }>(
      `SELECT (SELECT count(*)::text FROM serve.synthesis_check_result WHERE answer_id=$1) AS results,
              (SELECT count(*)::text FROM serve.synthesis_check_result WHERE answer_id=$1 AND final) AS finals,
              (SELECT count(*)::text FROM serve.synthesis_check_inheritance WHERE answer_id=$1) AS inheritances`, [first.answerId]);
    const recorded = await database.pool.query(
      `SELECT answer_version,synthesis_origin_version,final FROM serve.synthesis_check_result WHERE answer_id=$1`,
      [first.answerId]);
    const facts = { calls, ...rows.rows[0], recorded: recorded.rows };
    console.log(`REV_PROBE_RACE_B ${JSON.stringify(facts)}`);
    expect(facts.calls).toBe(1);
    expect(facts.finals).toBe("1");
  }, 60_000);
  it("C: ten claimers at once over twenty fresh requests, under the runtime role: every request claimed exactly once, no error", async () => {
    const answers = [];
    for (let i = 0; i < 20; i++) answers.push(await settled());
    for (const answer of answers) await repository.insertRequest(answer);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => repository.claimNextRequests(4, 60_000)));
    const errors = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason).slice(0, 120));
    const claims = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
    const ours = new Set(answers.map((a) => a.answerId));
    const mine = claims.filter((c) => ours.has(c.answerId));
    const attempts = await database.pool.query<{ n: string; d: string }>(
      `SELECT count(*)::text AS n, count(DISTINCT request_id)::text AS d FROM serve.synthesis_check_attempt WHERE answer_id = ANY($1::uuid[])`,
      [[...ours]]);
    const facts = { errors, claimed: mine.length, distinct: new Set(mine.map((c) => c.requestId)).size, ...attempts.rows[0] };
    console.log(`REV_PROBE_RACE_C ${JSON.stringify(facts)}`);
    expect(facts).toEqual({ errors: [], claimed: 20, distinct: 20, n: "20", d: "20" });
  }, 120_000);
  it("D: a Publish waiting for an in-flight UNAVAILABLE answers 503 without its own call", async () => {
    const { createSynthesisPublishGate } = await import("../../apps/api/src/synthesis-check/publish-gate.js");
    const target = await settled();
    const answer = await serve.readAnswerProjection(target.answerId, { ownerRef: owner.ownerRef, legacyAskerId: null }, 1);
    if (answer === null) throw new Error("PROBE_ANSWER_MISSING");
    const inFlight = await repository.startPublishAttempt(target);
    let calls = 0;
    const gate = createSynthesisPublishGate({
      repository,
      readAnswerVersions: async () => new Map([[1, "Some synthesis"]]),
      check: {
        port: () => ({ providerRef: "anthropic", modelId: "claude-haiku-5-5", async complete(input: { packet: PromptPacket; signal: AbortSignal }) {
          calls++;
          return { text: `{"call":"${judgeCallValue(readPromptFrame(input.packet).fence)}","TERRORISM":0,"HATE_SPEECH":1,"SUICIDE_OR_HARM_TO_OTHERS":0,"WEAPONS_OR_DRUGS":0}` };
        } }),
        deadlineMs: 60_000, recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, clock: () => new Date(),
      sleep: async () => {
        await repository.insertResult({ ...target, attemptId: inFlight.attemptId, synthesisOriginVersion: 1,
          outcome: { verdict: "UNAVAILABLE", categories: [], failureCode: "TRANSPORT_FAILED" },
          modelProviderRef: "anthropic", modelId: "claude-haiku-5-5", policyVersion, callCount: 1, deadlineMs: 60_000 });
      }
    });
    const decision = await gate.decide({ runId: target.runId, answer,
      contentLease: { run: <T>(use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use), readAnswer: async () => answer },
      startedAt: new Date() });
    const facts = { decision, calls };
    console.log(`REV_PROBE_RACE_D ${JSON.stringify(facts)}`);
    expect(facts).toEqual({ decision: "UNAVAILABLE", calls: 0 });
  }, 60_000);
});
