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

const reply = (packet: PromptPacket, flags: number[]) =>
  `{"call":"${judgeCallValue(readPromptFrame(packet).fence)}","TERRORISM":${flags[0]},"HATE_SPEECH":${flags[1]},"SUICIDE_OR_HARM_TO_OTHERS":${flags[2]},"WEAPONS_OR_DRUGS":${flags[3]}}`;
const materialOf = (packet: PromptPacket) => readPromptFrame(packet).fields[0]?.content;

async function secondVersion(first: { runId: string; answerId: string }, differentSynthesis = false) {
  const sealed = await encryptAttestedContentForRun(database.pool, first.runId, "serve.answer", `${first.answerId}:2`, { answerForm: null });
  if (sealed === null) throw new Error("PROBE_CIPHER_MISSING");
  let composedId: string | null = null;
  if (differentSynthesis) {
    composedId = randomUUID();
    const composed = await encryptAttestedContentForRun(database.pool, first.runId,
      "serve.composed_text", composedId, { segments: [{ segment_id: randomUUID(),
        text: "Second synthesis", load_bearing: true, served_number_refs: [] }] });
    const rawId = randomUUID();
    const raw = await encryptAttestedContentForRun(database.pool, first.runId,
      "ledger.raw_artifact", rawId, { rawText: "fixture", metadataJson: {} });
    if (composed === null || raw === null) throw new Error("PROBE_CIPHER_MISSING");
    await database.pool.query(`INSERT INTO ledger.raw_artifact
      (raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,raw_text,metadata_json,
       parse_status,input_hash,input_hash_version,contract_hash,content_hash,content_hash_version,at_seq,
       content_ciphertext,content_attestation)
      VALUES ($1,$2,$3,'test','test','test','test','⟦DEBATEAI:CIPHERTEXT:V1⟧',
        '{}'::jsonb,'PARSED','test',1,'test','test',1,ledger.allocate_sequence(),$4::jsonb,$5)`,
      [rawId, randomUUID(), first.runId, JSON.stringify(raw.envelope), raw.attestation]);
    await database.pool.query(`INSERT INTO serve.composed_text
      (composed_text_id,fact_bundle_id,segments,raw_artifact_ref,attempt,content_ciphertext,content_attestation)
      SELECT $2,fact_bundle_id,'[]'::jsonb,$3,1,$4::jsonb,$5 FROM serve.answer
      WHERE answer_id=$1 AND answer_version=1`,
      [first.answerId, composedId, rawId, JSON.stringify(composed.envelope), composed.attestation]);
  }
  await database.pool.query(
    `INSERT INTO serve.answer (answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
       answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,sealed_at_seq,confidence_band,
       band_ceiling,reversal_point,builds_on_previous,badges,verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation)
     SELECT answer_id,2,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,condition_marks,fact_bundle_id,
       CASE WHEN $4::uuid IS NULL THEN composed_text_id ELSE $4::uuid END,conformance_record_id,ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
       builds_on_previous,badges,verdict_unavailable,memory_disclosure,$2::jsonb,$3
     FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
    [first.answerId, JSON.stringify(sealed.envelope), sealed.attestation, composedId]);
  return { ...first, answerVersion: 2 };
}
async function answerOf(target: { answerId: string }, version: number): Promise<Answer> {
  const answer = await serve.readAnswerProjection(target.answerId, { ownerRef: owner.ownerRef, legacyAskerId: null }, version);
  if (answer === null) throw new Error("PROBE_ANSWER_MISSING");
  return answer;
}
function lease(runId: string, answer: Answer) {
  return { run: <T>(use: () => Promise<T>) => withRunContentLease(runtime, [runId], use), readAnswer: async () => answer };
}
function checkDeps(onCall: (packet: PromptPacket, signal: AbortSignal) => Promise<string>, deadlineMs = 60_000) {
  return {
    port: () => ({ providerRef: "anthropic", modelId: "claude-haiku-5-5",
      async complete(input: { packet: PromptPacket; signal: AbortSignal }) { return { text: await onCall(input.packet, input.signal) }; } }),
    deadlineMs, recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
    clock: () => new Date(), log: () => {}
  };
}

describe("REV p2 probe: the FIX diff's server races", () => {
  it("E4: a claim made visible after requested_at + D by a slow later candidate is never seen SHOW then HELD", async () => {
    const D = 1_000;
    const x = await settled(), y = await settled();
    await database.pool.query(`INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version,requested_at)
      VALUES (gen_random_uuid(),$1,$2,1,clock_timestamp() - make_interval(secs => $3::double precision / 1000.0))`,
      [x.runId, x.answerId, D - 300]);
    await database.pool.query(`INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version)
      VALUES (gen_random_uuid(),$1,$2,1)`, [y.runId, y.answerId]);
    await database.pool.query(`CREATE FUNCTION serve.rev_p2_slow_y() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$`);
    await database.pool.query(`CREATE TRIGGER rev_p2_slow_y BEFORE INSERT ON serve.synthesis_check_attempt
      FOR EACH ROW WHEN (NEW.run_id = '${y.runId}'::uuid) EXECUTE FUNCTION serve.rev_p2_slow_y()`);
    try {
      const before = await repository.readAnswerAccess({ ...x, deadlineMs: D });
      const t0 = Date.now();
      const claiming = repository.claimNextRequests(2, D);
      await wait(400);
      const r0 = Date.now();
      const during = await repository.readAnswerAccess({ ...x, deadlineMs: D });
      const duringMs = Date.now() - r0;
      const claims = await claiming;
      const claimMs = Date.now() - t0;
      const claimX = claims.find((claim) => claim.runId === x.runId);
      const after = await repository.readAnswerAccess({ ...x, deadlineMs: D });
      const inserted = claimX === undefined ? "NO_CLAIM" : await repository.insertResult({
        ...x, attemptId: claimX.attemptId, synthesisOriginVersion: 1,
        outcome: { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] },
        modelProviderRef: "anthropic", modelId: "claude-haiku-5-5", policyVersion, callCount: 1, deadlineMs: D
      });
      const removed = await repository.runRemovedByCheck(x.runId);
      const facts = { before, during, duringMs, claimMs, claimedX: claimX !== undefined,
        claimedY: claims.some((claim) => claim.runId === y.runId), after, inserted, removed };
      console.log(`REV_P2_E4 ${JSON.stringify(facts)}`);
      // The invariant (PLAN :759): a background deletion never follows a SHOW of the finished answer.
      expect(removed && [before, during, after].includes("SHOW")).toBe(false);
    } finally {
      await database.pool.query("DROP TRIGGER rev_p2_slow_y ON serve.synthesis_check_attempt");
      await database.pool.query("DROP FUNCTION serve.rev_p2_slow_y()");
    }
  }, 60_000);

  it("E5: a Publish attempt that commits after requested_at + D does not flip SHOW back to HELD", async () => {
    const D = 1_000;
    const z = await settled();
    await database.pool.query(`INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version,requested_at)
      VALUES (gen_random_uuid(),$1,$2,1,clock_timestamp() - make_interval(secs => $3::double precision / 1000.0))`,
      [z.runId, z.answerId, D - 200]);
    await database.pool.query(`CREATE FUNCTION serve.rev_p2_slow_publish() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$`);
    await database.pool.query(`CREATE TRIGGER rev_p2_slow_publish BEFORE INSERT ON serve.synthesis_check_attempt
      FOR EACH ROW WHEN (NEW.origin = 'PUBLISH' AND NEW.run_id = '${z.runId}'::uuid) EXECUTE FUNCTION serve.rev_p2_slow_publish()`);
    try {
      const before = await repository.readAnswerAccess({ ...z, deadlineMs: D });
      const starting = repository.startPublishAttempt(z);
      await wait(400);
      const during = await repository.readAnswerAccess({ ...z, deadlineMs: D });
      const attempt = await starting;
      const boundary = await database.pool.query<{ started_before_end: boolean }>(
        `SELECT attempt.started_at < request.requested_at + make_interval(secs => $2::double precision / 1000.0) AS started_before_end
         FROM serve.synthesis_check_attempt AS attempt JOIN serve.synthesis_check_request AS request
           ON request.answer_id=attempt.answer_id AND request.answer_version=attempt.answer_version
         WHERE attempt.attempt_id=$1`, [attempt.attemptId, D]);
      const after = await repository.readAnswerAccess({ ...z, deadlineMs: D });
      const facts = { before, during, after, ...boundary.rows[0] };
      console.log(`REV_P2_E5 ${JSON.stringify(facts)}`);
      expect(during === "SHOW" && after === "HELD").toBe(false);
    } finally {
      await database.pool.query("DROP TRIGGER rev_p2_slow_publish ON serve.synthesis_check_attempt");
      await database.pool.query("DROP FUNCTION serve.rev_p2_slow_publish()");
    }
  }, 60_000);

  it("E1: a Publish that waited acts on the verdict of record stored just after its last read (CLEAR → PROCEED)", async () => {
    const { createSynthesisPublishGate } = await import("../../apps/api/src/synthesis-check/publish-gate.js");
    const target = await settled();
    const answer = await answerOf(target, 1);
    const inFlight = await repository.startPublishAttempt(target);
    let inFlightReads = 0, calls = 0;
    const injected = new Proxy(repository, { get(object, property) {
      if (property === "readInFlightAttempts") return async (input: Parameters<SynthesisCheckRepository["readInFlightAttempts"]>[0]) => {
        inFlightReads += 1;
        if (inFlightReads === 2) await repository.insertResult({ ...target, attemptId: inFlight.attemptId, synthesisOriginVersion: 1,
          outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
          policyVersion, callCount: 1, deadlineMs: 60_000 });
        return object.readInFlightAttempts(input);
      };
      const value = Reflect.get(object, property);
      return typeof value === "function" ? value.bind(object) : value;
    } });
    const gate = createSynthesisPublishGate({ repository: injected,
      readAnswerVersions: async () => new Map([[1, "Some synthesis"]]),
      check: checkDeps(async (packet) => { calls++; return reply(packet, [0, 0, 0, 0]); }),
      deadlineMs: 60_000, clock: () => new Date(), sleep: async () => {} });
    const decision = await gate.decide({ runId: target.runId, answer, contentLease: lease(target.runId, answer), startedAt: new Date() });
    const finals = (await repository.readRecords({ ...target, maxVersion: 1 })).filter((record) => record.final)
      .map((record) => record.outcome.verdict);
    const facts = { decision, calls, inFlightReads, finals };
    console.log(`REV_P2_E1 ${JSON.stringify(facts)}`);
    expect(facts.decision).toBe("PROCEED");
  }, 60_000);

  it("E2: a check of a DIFFERENT synthesis in flight does not stop Publish from running its own check", async () => {
    const { createSynthesisPublishGate } = await import("../../apps/api/src/synthesis-check/publish-gate.js");
    const first = await settled();
    const second = await secondVersion(first, true);
    const answer = await answerOf(first, 2);
    const inFlight = await repository.startPublishAttempt(first);
    let calls = 0, sleeps = 0;
    const material: unknown[] = [];
    const gate = createSynthesisPublishGate({ repository,
      readAnswerVersions: async () => new Map([[1, "First synthesis"], [2, "Second synthesis"]]),
      check: checkDeps(async (packet) => { calls++; material.push(materialOf(packet)); return reply(packet, [0, 1, 0, 0]); }),
      deadlineMs: 60_000, clock: () => new Date(),
      sleep: async () => {
        sleeps += 1;
        await repository.insertResult({ ...first, attemptId: inFlight.attemptId, synthesisOriginVersion: 1,
          outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
          policyVersion, callCount: 1, deadlineMs: 60_000 });
      } });
    const decision = await gate.decide({ runId: first.runId, answer, contentLease: lease(first.runId, answer), startedAt: new Date() });
    const records = (await repository.readRecords({ ...second, maxVersion: 2 }))
      .map((record) => ({ v: record.answerVersion, origin: record.synthesisOriginVersion, verdict: record.outcome.verdict }));
    const facts = { decision, calls, sleeps, material, records };
    console.log(`REV_P2_E2 ${JSON.stringify(facts)}`);
    expect({ decision, calls }).toEqual({ decision: "APPROVAL_REQUIRED", calls: 1 });
  }, 60_000);

  it("E3: a later version with a different synthesis, claimed in the same tick, keeps its own deadline D", async () => {
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const D = 2_000;
    const first = await settled();
    const second = await secondVersion(first, true);
    await repository.insertRequest(first);
    await repository.insertRequest(second);
    const calls: { material: unknown; at: number }[] = [];
    const t0 = Date.now();
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: async (runId: string, answerId: string, version: number, ownerRef: string) => {
        if (runId !== first.runId) return null;
        const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : { ...stored, serve_state: "COMPOSED",
          composed_text: [{ segment_id: randomUUID(), text: version === 1 ? "First synthesis" : "Second synthesis",
            load_bearing: true, served_number_refs: [] }] } as Answer;
      },
      check: checkDeps(async (packet) => {
        const material = materialOf(packet);
        calls.push({ material, at: Date.now() - t0 });
        await wait(material === "First synthesis" ? 0.7 * D : 0.45 * D);
        return reply(packet, [0, 0, 0, 0]);
      }, D),
      deadlineMs: D, log: () => {}
    });
    await worker.runOnce();
    const records = (await repository.readRecords({ ...second, maxVersion: 2 }))
      .map((record) => ({ v: record.answerVersion, origin: record.synthesisOriginVersion, outcome: record.outcome }));
    const facts = { calls, records, totalMs: Date.now() - t0 };
    console.log(`REV_P2_E3 ${JSON.stringify(facts)}`);
    expect(records.find((record) => record.v === 2)?.outcome).toEqual({ verdict: "CLEAR", categories: [] });
  }, 60_000);

  it("E6: concurrent claimers over runs with two requests each finish without a deadlock", async () => {
    const errors: string[] = [];
    let claimed = 0, requests = 0;
    for (let round = 0; round < 8; round++) {
      const firsts = [];
      for (let i = 0; i < 6; i++) firsts.push(await settled());
      const seconds = [];
      for (const first of firsts) seconds.push(await secondVersion(first));
      for (const first of firsts) await repository.insertRequest(first);
      for (const second of seconds) await repository.insertRequest(second);
      requests += 12;
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => repository.claimNextRequests(4, 60_000)));
      for (const result of results) {
        if (result.status === "rejected") errors.push(String((result.reason as { code?: string })?.code ?? "") + " " + String(result.reason).slice(0, 100));
        else claimed += result.value.length;
      }
    }
    const facts = { rounds: 8, requests, claimed, errors: errors.length, deadlocks: errors.filter((e) => /40P01|deadlock/i.test(e)).length,
      sample: errors.slice(0, 3) };
    console.log(`REV_P2_E6 ${JSON.stringify(facts)}`);
    expect(facts.errors).toBe(0);
  }, 240_000);
});
