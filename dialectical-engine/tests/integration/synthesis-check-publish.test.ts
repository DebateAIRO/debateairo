import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, migrate, withRunContentLease, isRunContentLeaseHeld,
  PostgresSynthesisCheckErasureRepository, SynthesisCheckErasureCoordinator, type Pool } from "@debateai/db";
import { FileRunContentKeyStore } from "@debateai/crypto";
import { ServeRepository, SynthesisCheckRepository, synthesisTextOf } from "@debateai/serve";
import { readPromptFrame } from "../../packages/providers/src/prompt-frame.js";
import { judgeCallValue } from "../../apps/api/src/publication-check/verdict.js";
import type { PromptPacket } from "../../packages/providers/src/index.js";
import type { SynthesisCheckCategory } from "@debateai/contract";
import { buildApi, type ApiOptions } from "../../apps/api/src/index.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import type { SynthesisPublishGate } from "../../apps/api/src/synthesis-check/publish-gate.js";
import { createSynthesisAnswerAccess, OPEN_SYNTHESIS_ANSWER_ACCESS, type SynthesisAnswerAccess } from "../../apps/api/src/synthesis-check/hold.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

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

async function settled() {
  const runId = await createEncryptedStoryRun(database.pool, owner, `Publish ${randomUUID()}?`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: randomUUID(),
    factBundle: {
      facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  const answer = await serve.readAnswerProjection(answerId, { ownerRef: owner.ownerRef, legacyAskerId: null }, 1);
  if (answer === null) throw new Error("TEST_ANSWER_MISSING");
  return { runId, answerId, answerVersion: 1, answer };
}

type Target = Awaited<ReturnType<typeof settled>>;
function lease(target: Target) {
  return {
    run: <T>(use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use),
    readAnswer: async () => target.answer
  };
}
async function final(target: Target, verdict: "CLEAR" | "FLAGGED" | "NO_SYNTHESIS", categories: readonly SynthesisCheckCategory[] = []) {
  const attempt = await repository.startPublishAttempt(target);
  await repository.insertResult({
    ...target, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
    outcome: verdict === "FLAGGED" ? { verdict, categories } : { verdict, categories: [] },
    modelProviderRef: verdict === "FLAGGED" ? "anthropic" : null,
    modelId: verdict === "FLAGGED" ? "claude-haiku-5-5" : null,
    policyVersion: "synthesis.content-check.v1@0123456789abcdef",
    callCount: verdict === "FLAGGED" ? 1 : 0, deadlineMs: 60_000
  });
}
function gateFor(options: {
  text?: string | null;
  flags?: readonly number[];
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onModel?: () => void;
}) {
  const deadlineMs = options.deadlineMs ?? 60_000;
  return import("../../apps/api/src/synthesis-check/publish-gate.js").then(({ createSynthesisPublishGate }) =>
    createSynthesisPublishGate({
      repository,
      readAnswerVersions: async () => new Map([[1, options.text === undefined ? null : options.text]]),
      check: {
        port: () => options.flags === undefined ? null : {
          providerRef: "anthropic", modelId: "claude-haiku-5-5",
          complete: async ({ packet }: { packet: PromptPacket; signal: AbortSignal }) => {
            options.onModel?.();
            const call = judgeCallValue(readPromptFrame(packet).fence);
            const flags = options.flags!;
            return { text: `{"call":"${call}","TERRORISM":${flags[0]},"HATE_SPEECH":${flags[1]},"SUICIDE_OR_HARM_TO_OTHERS":${flags[2]},"WEAPONS_OR_DRUGS":${flags[3]}}` };
          }
        },
        deadlineMs, recordSpend: async () => {},
        priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {}
      },
      deadlineMs, clock: () => new Date(),
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    })
  );
}

async function routeDecision(target: Target, gate: SynthesisPublishGate, access?: SynthesisAnswerAccess) {
  const identityBase = testHttpIdentity(`publish-${randomUUID()}`);
  const identity = {
    ...identityBase,
    authenticated: {
      ...identityBase.authenticated, ownerRef: owner.ownerRef,
      session: { ...identityBase.authenticated.session, asker_id: `owner:${owner.ownerRef}` }
    }
  };
  let publicationCalls = 0;
  const application = {
    withContentLease: <T>(_runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use),
    readRunAnswer: async () => target.answer
  } as unknown as ApiOptions["application"];
  const publications = {
    preflightGrant: async () => true,
    auditPreflightDenial: async () => {},
    publish: async () => { publicationCalls++; return null; }
  } as unknown as NonNullable<ApiOptions["publications"]>;
  const api = buildApi({
    application, publications, sessions: testSessionApplication([identity]),
    allowedOrigin: TEST_APP_ORIGIN, synthesisPublishGate: gate,
    ...(access === undefined ? {} : { synthesisAnswerAccess: access })
  });
  try {
    const response = await api.inject({
      method: "POST", url: `/v1/runs/${target.runId}/publish`,
      headers: testSessionHeaders(identity, true),
      payload: { step_up_grant: "g".repeat(43), warning_acknowledged: true }
    });
    return { status: response.statusCode, body: response.json(), publicationCalls };
  } finally { await api.close(); }
}

describe("synthesis publish gate under debateai_runtime", () => {
  it("a stored CLEAR verdict proceeds without another model call", async () => {
    const target = await settled();
    await final(target, "CLEAR");
    let calls = 0;
    const gate = await gateFor({ text: "Synthesis", flags: [0, 1, 0, 0], onModel: () => calls++ });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("PROCEED");
    expect(calls).toBe(0);
  });

  it("a stored harmful flag removes the debate before a model call", async () => {
    const target = await settled();
    await final(target, "FLAGGED", ["SUICIDE_OR_HARM_TO_OTHERS"]);
    let calls = 0;
    const gate = await gateFor({ text: "Synthesis", flags: [0, 0, 0, 0], onModel: () => calls++ });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("REMOVED");
    expect(calls).toBe(0);
    expect(await routeDecision(target, gate)).toEqual({
      status: 410, body: { error: "DEBATE_REMOVED_BY_CHECK", message: "DEBATE_REMOVED_BY_CHECK" }, publicationCalls: 0
    });
    const keys = new FileRunContentKeyStore(owner.secretRoot,
      {} as ConstructorParameters<typeof FileRunContentKeyStore>[1], async () => owner.userId);
    await new SynthesisCheckErasureCoordinator(
      new PostgresSynthesisCheckErasureRepository(database.pool), keys
    ).reconcile(100);
    expect(await keys.exists(target.runId)).toBe(false);
    const access = createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 });
    expect(await routeDecision(target, gate, access)).toEqual({
      status: 410, body: { error: "DEBATE_REMOVED_BY_CHECK", message: "DEBATE_REMOVED_BY_CHECK" }, publicationCalls: 0
    });
    expect(await access.takeRemovalNotice(owner.ownerRef)).toBe(true);
    const afterNotice = await routeDecision(target, gate, access);
    expect(afterNotice).toEqual(await routeDecision(target, gate, OPEN_SYNTHESIS_ANSWER_ACCESS));
    expect(afterNotice.publicationCalls).toBe(0);
  });

  it("an unchecked flagged synthesis requires approval and persists its category", async () => {
    const target = await settled();
    let calls = 0;
    const gate = await gateFor({ text: "Flag this synthesis", flags: [0, 1, 0, 0], onModel: () => calls++ });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("APPROVAL_REQUIRED");
    expect(calls).toBe(1);
    expect((await repository.readRecords({ ...target, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "FLAGGED", categories: ["HATE_SPEECH"] });
    expect(await routeDecision(target, gate)).toEqual({
      status: 409, body: { error: "PUBLICATION_APPROVAL_REQUIRED", message: "PUBLICATION_APPROVAL_REQUIRED" }, publicationCalls: 0
    });
  });

  it("an unchecked clear synthesis reaches the publication decision", async () => {
    const target = await settled();
    const gate = await gateFor({ text: "Clear synthesis", flags: [0, 0, 0, 0] });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("PROCEED");
    expect((await repository.readRecords({ ...target, maxVersion: 1 }))[0]?.outcome.verdict).toBe("CLEAR");
  });

  it("an unchecked harmful synthesis removes the debate without proceeding", async () => {
    const target = await settled();
    const gate = await gateFor({ text: "Harmful synthesis", flags: [0, 0, 1, 0] });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("REMOVED");
    expect(await repository.runRemovedByCheck(target.runId)).toBe(true);
  });

  it("an unchecked synthesis with no model returns UNAVAILABLE and stays private", async () => {
    const target = await settled();
    const gate = await gateFor({ text: "Synthesis" });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("UNAVAILABLE");
    expect((await repository.readRecords({ ...target, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "NOT_CONFIGURED" });
    expect(await routeDecision(target, gate)).toEqual({
      status: 503, body: { error: "PUBLICATION_CHECK_UNAVAILABLE", message: "PUBLICATION_CHECK_UNAVAILABLE" }, publicationCalls: 0
    });
  });

  it("waits for an in-flight flag without holding the run lease", async () => {
    const target = await settled();
    const attempt = await repository.startPublishAttempt(target);
    const gate = await gateFor({ text: "Synthesis", sleep: async () => {
      expect(isRunContentLeaseHeld()).toBe(false);
      await repository.insertResult({
        ...target, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
        outcome: { verdict: "FLAGGED", categories: ["HATE_SPEECH"] },
        modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
        policyVersion: "synthesis.content-check.v1@0123456789abcdef", callCount: 1, deadlineMs: 60_000
      });
    } });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("APPROVAL_REQUIRED");
    expect((await repository.readRecords({ ...target, maxVersion: 1 })).filter((record) => record.final)).toHaveLength(1);
  });

  it("waits for an in-flight clear verdict then proceeds", async () => {
    const target = await settled();
    const attempt = await repository.startPublishAttempt(target);
    const gate = await gateFor({ sleep: async () => {
      await repository.insertResult({
        ...target, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
        outcome: { verdict: "CLEAR", categories: [] }, modelProviderRef: null, modelId: null,
        policyVersion: "synthesis.content-check.v1@0123456789abcdef", callCount: 0, deadlineMs: 60_000
      });
    } });
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date() })).toBe("PROCEED");
  });

  it("an in-flight check with no result times out inside D", async () => {
    const target = await settled();
    await repository.startPublishAttempt(target);
    const gate = await gateFor({ text: "Synthesis", deadlineMs: 100, sleep: async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, Math.max(ms, 110)));
    } });
    const started = Date.now();
    expect(await gate.decide({ runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date(started) })).toBe("UNAVAILABLE");
    expect(Date.now() - started).toBeLessThan(2_100);
  });

  it("uses the route start time, leaving no new attempt after an expired deadline", async () => {
    const target = await settled();
    const gate = await gateFor({ text: "Synthesis", deadlineMs: 100 });
    expect(await gate.decide({
      runId: target.runId, answer: target.answer, contentLease: lease(target), startedAt: new Date(Date.now() - 200)
    })).toBe("UNAVAILABLE");
    expect((await repository.readRecords({ ...target, maxVersion: 1 }))).toEqual([]);
  });
  it("a final FLAGGED version requires approval before any model or publication judge call", async () => {
    // Property: Publish cannot proceed from a stored flag even when no check call is available.
    const { createSynthesisPublishGate } = await import("../../apps/api/src/synthesis-check/publish-gate.js");
    const target = await settled();
    const attempt = await repository.startPublishAttempt(target);
    await repository.insertResult({
      ...target, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
      outcome: { verdict: "FLAGGED", categories: ["HATE_SPEECH"] },
      modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
      policyVersion: "synthesis.content-check.v1@0123456789abcdef",
      callCount: 1, deadlineMs: 60_000
    });
    let calls = 0;
    const gate = createSynthesisPublishGate({
      repository,
      readAnswerVersions: async (_runId: string, answerId: string, maxVersion: number, ownerRef: string) => {
        const texts = new Map<number, string | null>();
        for (let version = 1; version <= maxVersion; version++) {
          const answer = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
          texts.set(version, answer === null ? null : synthesisTextOf(answer));
        }
        return texts;
      },
      check: {
        port: () => { calls++; return null; }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, clock: () => new Date(), sleep: async () => {}
    });
    expect(await gate.decide({
      runId: target.runId, answer: target.answer,
      contentLease: {
        run: <T>(use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use),
        readAnswer: async () => target.answer
      },
      startedAt: new Date()
    })).toBe("APPROVAL_REQUIRED");
    expect(calls).toBe(0);
  });

  it("an unchecked components-only answer records NO_SYNTHESIS and proceeds without a model call", async () => {
    // Property: an unchecked version cannot bypass the check, including the no-synthesis case.
    const { createSynthesisPublishGate } = await import("../../apps/api/src/synthesis-check/publish-gate.js");
    const target = await settled();
    let calls = 0;
    const gate = createSynthesisPublishGate({
      repository,
      readAnswerVersions: async (_runId: string, answerId: string, maxVersion: number, ownerRef: string) => {
        const texts = new Map<number, string | null>();
        for (let version = 1; version <= maxVersion; version++) {
          const answer = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
          texts.set(version, answer === null ? null : synthesisTextOf(answer));
        }
        return texts;
      },
      check: {
        port: () => { calls++; return null; }, deadlineMs: 60_000,
        recordSpend: async () => {}, priceOf: () => null, clock: () => new Date(), log: () => {}
      },
      deadlineMs: 60_000, clock: () => new Date(), sleep: async () => {}
    });
    const decision = await gate.decide({
      runId: target.runId, answer: target.answer,
      contentLease: {
        run: <T>(use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use),
        readAnswer: async () => target.answer
      },
      startedAt: new Date()
    });
    expect(decision).toBe("PROCEED");
    expect(calls).toBe(0);
    expect((await repository.readRecords({ ...target, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "NO_SYNTHESIS", categories: [] });
  });
});
