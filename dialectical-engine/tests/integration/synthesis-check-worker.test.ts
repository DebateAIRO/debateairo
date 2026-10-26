import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun, isRunContentLeaseHeld,
  PostgresSynthesisCheckErasureRepository, SynthesisCheckErasureCoordinator,
  migrate, withRunContentLease, type Pool } from "@debateai/db";
import { FileRunContentKeyStore } from "@debateai/crypto";
import { PostgresModelSpendStore } from "@debateai/budget";
import { ServeRepository, SynthesisCheckRepository } from "@debateai/serve";
import type { Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { readPromptFrame } from "../../packages/providers/src/prompt-frame.js";
import type { PromptPacket } from "../../packages/providers/src/index.js";
import { judgeCallValue } from "../../apps/api/src/publication-check/verdict.js";
import { SynthesisCheckFailure } from "../../apps/api/src/synthesis-check/transport.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

let database: TestDatabase;
let runtime: Pool;
/** The answer list as the API's login reads it: debateai_billing_runtime, which 0123 (side-by-side releases) grants
 * core.run_supersession, a table the list reads since that merge. Everything else here stays on debateai_runtime. */
let apiPool: Pool;
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
  const apiUrl = new URL(database.connectionString);
  apiUrl.searchParams.set("options", "-c role=debateai_billing_runtime");
  apiPool = createPool(apiUrl.toString());
  configureContentEncryption(apiPool, contentCipherFor(database.pool)!);
  repository = new SynthesisCheckRepository(runtime);
  serve = new ServeRepository(runtime);
}, 180_000);

afterAll(async () => {
  await runtime?.end();
  await apiPool?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

async function settledComponentsOnly() {
  const runId = await createEncryptedStoryRun(database.pool, owner, `Worker ${randomUUID()}?`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: randomUUID(),
    factBundle: {
      facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  return { runId, answerId, answerVersion: 1 };
}

async function cloneVersion(answer: Awaited<ReturnType<typeof settledComponentsOnly>>) {
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

function composed(answer: Answer, text: string): Answer {
  return {
    ...answer, serve_state: "COMPOSED",
    composed_text: [{ segment_id: randomUUID(), text, load_bearing: true, served_number_refs: [] }]
  };
}

function modelReply(packet: PromptPacket, flags: readonly number[]) {
  const call = judgeCallValue(readPromptFrame(packet).fence);
  return `{"call":"${call}","TERRORISM":${flags[0]},"HATE_SPEECH":${flags[1]},"SUICIDE_OR_HARM_TO_OTHERS":${flags[2]},"WEAPONS_OR_DRUGS":${flags[3]}}`;
}

function modelPort(flags: readonly number[] = [0, 0, 0, 0]) {
  return {
    providerRef: "anthropic", modelId: "claude-haiku-5-5",
    async complete(input: { packet: PromptPacket; signal: AbortSignal }) {
      return { text: modelReply(input.packet, flags), usage: { input_tokens: 900, output_tokens: 40 } };
    }
  };
}

async function workerFor(options: {
  text?: string | null;
  port?: () => ReturnType<typeof modelPort> | null;
  erasure?: (limit: number) => Promise<unknown>;
  readAnswer?: (_runId: string, answerId: string, version: number, ownerRef: string) => Promise<Answer | null>;
  log?: (line: string) => void;
  deadlineMs?: number;
  recordSpend?: (entry: {
    spendSource: "SYNTHESIS_CHECK"; runId: string; providerRef: string; chargedOn: string;
    inputTokens: number; outputTokens: number; chargeMicros: number
  }) => Promise<void>;
}) {
  const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
  return new SynthesisCheckWorker({
    repository,
    erasure: { reconcile: options.erasure ?? (async () => []) },
    withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
    readAnswer: options.readAnswer ?? (async (_runId, answerId, version, ownerRef) => {
      const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
      return stored === null || options.text === undefined || options.text === null
        ? stored : composed(stored, options.text);
    }),
    check: {
      port: options.port ?? (() => null), deadlineMs: options.deadlineMs ?? 60_000,
      recordSpend: options.recordSpend ?? (async () => {}), priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
      clock: () => new Date(), log: () => {}
    },
    deadlineMs: options.deadlineMs ?? 60_000,
    log: options.log ?? (() => {})
  });
}

describe("synthesis check worker under debateai_runtime", () => {
  it("treats a PRIVATE_CONTENT_ERASED read as unreadable without a model call", async () => {
    // Property: key destruction cannot leak content or turn into a second check attempt.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const lines: string[] = [];
    const worker = await workerFor({
      readAnswer: async () => { throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "erased"); },
      port: () => { throw new Error("MODEL_CALLED"); },
      log: (line) => lines.push(line)
    });
    await worker.runOnce();
    expect(await repository.readRecords({ ...answer, maxVersion: 1 })).toEqual([]);
    expect(lines).toEqual(["SYNTHESIS_CHECK_ANSWER_UNREADABLE"]);
  });

  it("logs a missing run owner as UNEXPECTED and does not call a model", async () => {
    // Property: an orphaned request fails closed with a bounded diagnostic.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const lines: string[] = [];
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const worker = new SynthesisCheckWorker({
      repository: {
        claimNextRequests: () => repository.claimNextRequests(1, 60_000),
        ownerRefOfRun: async () => null,
        purgeExpiredRemovalNotices: async () => 0
      } as unknown as SynthesisCheckRepository,
      erasure: { reconcile: async () => [] },
      withContentLease: <T>(_runId: string, use: () => Promise<T>) => use(),
      readAnswer: async () => { throw new Error("ANSWER_READ"); },
      check: {
        port: () => { throw new Error("MODEL_CALLED"); }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, log: (line) => lines.push(line)
    });
    await worker.runOnce();
    expect(lines).toEqual(["SYNTHESIS_CHECK_UNEXPECTED"]);
  });
  it("reads a held answer beneath the owner hold and stores NO_SYNTHESIS without calling the model", async () => {
    // Property: a held answer remains readable to the worker through its owner-scoped content lease.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    expect(await repository.readAnswerAccess({ ...answer, deadlineMs: 60_000 })).toBe("HELD");
    let modelCalls = 0;
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const worker = new SynthesisCheckWorker({
      repository,
      erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: (_runId: string, answerId: string, version: number, ownerRef: string) =>
        serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version),
      check: {
        port: () => { modelCalls++; return null; }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000,
      log: () => {}
    });
    await worker.runOnce();
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "NO_SYNTHESIS", categories: [] });
    expect(await repository.readAnswerAccess({ ...answer, deadlineMs: 60_000 })).toBe("SHOW");
    expect(modelCalls).toBe(0);
  });

  it("stores CLEAR and FLAGGED categories from owner-scoped synthesis reads", async () => {
    // Property: the model decision and its exact category reach the sealed record of each claimed run.
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    for (const [flags, expected] of [
      [[0, 0, 0, 0], { verdict: "CLEAR", categories: [] }],
      [[0, 1, 0, 0], { verdict: "FLAGGED", categories: ["HATE_SPEECH"] }]
    ] as const) {
      const answer = await settledComponentsOnly();
      await repository.insertRequest(answer);
      const worker = new SynthesisCheckWorker({
        repository, erasure: { reconcile: async () => [] },
        withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
        readAnswer: async (_runId: string, answerId: string, version: number, ownerRef: string) => {
          const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
          return stored === null ? null : composed(stored, "A specific synthesis");
        },
        check: {
          port: () => modelPort(flags), deadlineMs: 60_000,
          recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
          clock: () => new Date(), log: () => {}
        },
        deadlineMs: 60_000, log: () => {}
      });
      await worker.runOnce();
      expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome).toEqual(expected);
    }
  });

  it("checks an answer whose first version is its debate's settings version, not 1", async () => {
    // Property: production stamps an answer's first version with the register version its debate ran on (5 on the
    // merged stack), so versions below it do not exist; the worker reads down to the first version and checks it.
    const runId = await createEncryptedStoryRun(database.pool, owner, `Worker ${randomUUID()}?`);
    const { answerId } = await persistTerminalRun({
      pool: database.pool, runId, fixtureKey: randomUUID(), factBundleVersion: 5,
      factBundle: {
        facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    });
    const answer = { runId, answerId, answerVersion: 5 };
    await repository.insertRequest(answer);
    const lines: string[] = [];
    const reads: number[] = [];
    const worker = await workerFor({
      text: "A specific synthesis", port: () => modelPort([0, 0, 0, 0]), log: (line) => lines.push(line),
      readAnswer: async (_runId, id, version, ownerRef) => {
        reads.push(version);
        const stored = await serve.readAnswerProjection(id, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : composed(stored, "A specific synthesis");
      }
    });
    await worker.runOnce();
    expect(lines).toEqual([]);
    expect((await repository.readRecords({ ...answer, maxVersion: 5 })).map((record) => [
      record.answerVersion, record.synthesisOriginVersion, record.outcome
    ])).toEqual([[5, 5, { verdict: "CLEAR", categories: [] }]]);
    // Down from 5 to the first missing version, never up from 1.
    expect(reads.every((version) => version >= 4)).toBe(true);
  });

  it("an unreadable claimed answer makes no model call, stores no result and logs one fixed code", async () => {
    // Property: an erased or unreadable answer never crosses the model boundary.
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const lines: string[] = [];
    let calls = 0;
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: async () => null,
      check: {
        port: () => { calls++; return modelPort(); }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, log: (line: string) => lines.push(line)
    });
    await worker.runOnce();
    expect(calls).toBe(0);
    expect(await repository.readRecords({ ...answer, maxVersion: 1 })).toEqual([]);
    expect(lines).toEqual(["SYNTHESIS_CHECK_ANSWER_UNREADABLE"]);
  });

  it("a later version with the same synthesis inherits an earlier final without a model call", async () => {
    // Property: a final verdict for the same synthesis ends the later hold through an inheritance row.
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const first = await settledComponentsOnly();
    const attempt = await repository.startPublishAttempt(first);
    expect(await repository.insertResult({
      ...first, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
      outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: null, modelId: null,
      policyVersion: "synthesis.content-check.v1@0123456789abcdef", callCount: 0, deadlineMs: 60_000
    })).toBe("INSERTED");
    const second = await cloneVersion(first);
    await repository.insertRequest(second);
    let calls = 0;
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: async (_runId: string, answerId: string, version: number, ownerRef: string) => {
        const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : composed(stored, "Same synthesis");
      },
      check: {
        port: () => { calls++; return modelPort(); }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    const rows = await runtime.query<{ inherited_result_id: string }>(
      "SELECT inherited_result_id FROM serve.synthesis_check_inheritance WHERE answer_id=$1 AND answer_version=2",
      [second.answerId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(calls).toBe(0);
    expect(await repository.readAnswerAccess({ ...second, deadlineMs: 60_000 })).toBe("SHOW");
  });

  it("a harmful final stores its removal request and starts erasure reconciliation after the claim", async () => {
    // Property: a harmful final destroys the run key and revokes private content reads.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const keys = new FileRunContentKeyStore(owner.secretRoot,
      {} as ConstructorParameters<typeof FileRunContentKeyStore>[1], async () => owner.userId);
    const erasure = new SynthesisCheckErasureCoordinator(
      new PostgresSynthesisCheckErasureRepository(database.pool), keys
    );
    expect(await keys.exists(answer.runId)).toBe(true);
    const worker = await workerFor({
      text: "The synthesis urges harm.",
      port: () => modelPort([0, 0, 1, 0]),
      erasure: (limit) => erasure.reconcile(limit)
    });
    await worker.runOnce();
    expect(await repository.runRemovedByCheck(answer.runId)).toBe(true);
    expect(await keys.exists(answer.runId)).toBe(false);
    await expect(withRunContentLease(runtime, [answer.runId], async () => true)).rejects.toMatchObject({ code: "PRIVATE_CONTENT_ERASED" });
    const index = await new ServeRepository(apiPool).readAnswerIndex({ ownerRef: owner.ownerRef, legacyAskerId: null }, 100, 0);
    expect(index.items.some((item) => item.run_ref === answer.runId)).toBe(false);
  });

  it("a throwing model, a non-answering model and the off flag store UNAVAILABLE without retry", async () => {
    // Property: each failed first attempt records its closed cause and a later tick cannot call the model again.
    const cases = [
      ["TRANSPORT_FAILED", () => ({ ...modelPort(), complete: async () => { throw new SynthesisCheckFailure("TRANSPORT_FAILED"); } })],
      ["DEADLINE", () => ({ ...modelPort(), complete: async () => new Promise<never>(() => {}) })],
      ["NOT_CONFIGURED", () => null]
    ] as const;
    for (const [failureCode, port] of cases) {
      const answer = await settledComponentsOnly();
      await repository.insertRequest(answer);
      let portReads = 0;
      const worker = await workerFor({
        text: "A synthesis to inspect", deadlineMs: 1_500,
        port: () => { portReads++; return port(); }
      });
      await worker.runOnce();
      expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome)
        .toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode });
      const before = portReads;
      await worker.runOnce();
      expect(portReads).toBe(before);
      expect((await runtime.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM serve.synthesis_check_attempt WHERE answer_id=$1", [answer.answerId]
      )).rows[0]?.n).toBe(1);
    }
  });

  it("makes the model call after releasing the run content lease", async () => {
    // Property: a slow model never pins the content lease against erasure.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const worker = await workerFor({
      text: "A composed conclusion",
      port: () => ({ ...modelPort(), complete: async ({ packet }: { packet: PromptPacket; signal: AbortSignal }) => {
        expect(isRunContentLeaseHeld()).toBe(false);
        return { text: modelReply(packet, [0, 0, 0, 0]), usage: { input_tokens: 900, output_tokens: 40 } };
      } })
    });
    await worker.runOnce();
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome.verdict).toBe("CLEAR");
  });

  it("claims at most four requests per tick", async () => {
    // Property: one tick has a fixed concurrency ceiling.
    let limit = 0;
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const worker = new SynthesisCheckWorker({
      repository: {
        claimNextRequests: async (value: number) => { limit = value; return []; },
        purgeExpiredRemovalNotices: async () => 0
      } as unknown as SynthesisCheckRepository,
      erasure: { reconcile: async () => [] }, withContentLease: <T>(_runId: string, use: () => Promise<T>) => use(),
      readAnswer: async () => null,
      check: { port: () => null, deadlineMs: 60_000, recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {} },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    expect(limit).toBe(4);
  });

  it("purges expired removal notices after processing a tick", async () => {
    // Property: routine cleanup still runs on an empty queue.
    let purged = 0;
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const worker = new SynthesisCheckWorker({
      repository: {
        claimNextRequests: async () => [], purgeExpiredRemovalNotices: async () => { purged++; return 0; }
      } as unknown as SynthesisCheckRepository,
      erasure: { reconcile: async () => [] }, withContentLease: <T>(_runId: string, use: () => Promise<T>) => use(),
      readAnswer: async () => null,
      check: { port: () => null, deadlineMs: 60_000, recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {} },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    expect(purged).toBe(1);
  });

  it("an ALREADY_FINAL race writes inheritance for the winning verdict", async () => {
    // Property: a second writer does not leave its requested answer held.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const winner = randomUUID();
    let inherited: string | null = null;
    const { SynthesisCheckWorker } = await import("../../apps/api/src/synthesis-check/worker.js");
    const worker = new SynthesisCheckWorker({
      repository: {
        claimNextRequests: (limit: number, deadline: number) => repository.claimNextRequests(limit, deadline),
        ownerRefOfRun: (runId: string) => repository.ownerRefOfRun(runId),
        readRecords: async () => [], insertResult: async () => "ALREADY_FINAL",
        readFinalResultId: async () => winner,
        insertInheritance: async (input: { inheritedResultId: string }) => { inherited = input.inheritedResultId; return "INSERTED"; },
        purgeExpiredRemovalNotices: async () => 0
      } as unknown as SynthesisCheckRepository,
      erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [runId], use),
      readAnswer: (_runId, answerId, version, ownerRef) => serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version),
      check: { port: () => null, deadlineMs: 60_000, recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {} },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    expect(inherited).toBe(winner);
  });

  it("writes only fixed codes to its log, without verdicts, categories or synthesis text", async () => {
    // Property: the worker's observability does not copy private material.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const spend = new PostgresModelSpendStore(runtime);
    const allowanceBefore = await spend.readRunSpentMicros(answer.runId);
    const lines: string[] = [];
    const worker = await workerFor({
      text: "SECRET_SYNTHESIS", port: () => modelPort([0, 1, 0, 0]), log: (line) => lines.push(line),
      recordSpend: (entry) => spend.recordSpend({ ...entry, spendId: randomUUID() })
    });
    await worker.runOnce();
    expect(lines.join(" ")).not.toMatch(/SECRET_SYNTHESIS|FLAGGED|HATE_SPEECH/);
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome.verdict).toBe("FLAGGED");
    const charges = await runtime.query<{ spend_source: string; run_id: string }>(
      "SELECT spend_source,run_id FROM ledger.model_spend WHERE run_id=$1 AND spend_source='SYNTHESIS_CHECK'", [answer.runId]
    );
    expect(charges.rows).toEqual([{ spend_source: "SYNTHESIS_CHECK", run_id: answer.runId }]);
    expect(await spend.readRunSpentMicros(answer.runId)).toBe(allowanceBefore);
  });

  it("uses the claim's remaining deadline after slow answer reads", async () => {
    // Property: the model cannot finish beyond the request's hold deadline.
    const answer = await settledComponentsOnly();
    await repository.insertRequest(answer);
    const worker = await workerFor({
      text: "Late synthesis", deadlineMs: 1_500,
      readAnswer: async (_runId, answerId, version, ownerRef) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : composed(stored, "Late synthesis");
      },
      port: () => ({ ...modelPort(), complete: async ({ packet }: { packet: PromptPacket; signal: AbortSignal }) => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return { text: modelReply(packet, [0, 1, 0, 0]), usage: { input_tokens: 900, output_tokens: 40 } };
      } })
    });
    await worker.runOnce();
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
  });
});
