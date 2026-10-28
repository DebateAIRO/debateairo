import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, migrate, type Pool } from "@debateai/db";
import { ServeRepository, SynthesisCheckRepository } from "@debateai/serve";
import {
  ownerSession, readOwnerAnswer, readOwnerRun, readOwnerRunAnswer, readOwnerInspection,
  readOwnerLedgerDigest, readOwnerStory, readOwnerDisclosure, readOwnerNode
} from "../../apps/api/src/owner-read.js";
import type { ApiOptions } from "../../apps/api/src/index.js";
import { buildApi } from "../../apps/api/src/index.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
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

async function settled() {
  const runId = await createEncryptedStoryRun(database.pool, owner, `Hold ${randomUUID()}?`);
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

async function claimFor(answer: { runId: string; answerId: string; answerVersion: number }) {
  const claims = await repository.claimNextRequests(10, 60_000);
  const claim = claims.find((candidate) =>
    candidate.runId === answer.runId && candidate.answerId === answer.answerId
      && candidate.answerVersion === answer.answerVersion
  );
  expect(claim).toBeDefined();
  return claim!;
}

describe("synthesis answer access under debateai_runtime", () => {
  it("reports HELD for a fresh request and SHOW after its result is stored", async () => {
    // Property: the owner hold follows the repository state of the current answer version.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const access = createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 });
    expect(await access.stateOf(answer)).toBe("HELD");
    const claim = await claimFor(answer);
    await repository.insertResult({
      ...answer, attemptId: claim.attemptId, synthesisOriginVersion: 1,
      outcome: { verdict: "NO_SYNTHESIS", categories: [] },
      modelProviderRef: null, modelId: null,
      policyVersion: "synthesis.content-check.v1@0123456789abcdef",
      callCount: 0, deadlineMs: 60_000
    });
    expect(await access.stateOf(answer)).toBe("SHOW");
  });

  it("the owner answer read returns no answer while the current version is held", async () => {
    // Property: the held answer stays unreadable through the public owner adapter.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const access = createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 });
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    const application = {
      readAnswer: (answerId: string, _session: unknown, version: number | undefined) =>
        serve.readAnswerProjection(answerId, ownership, version)
    } as unknown as ApiOptions["application"];
    const session = ownerSession(owner.ownerRef, owner.sessionId);
    expect(await application.readAnswer(answer.answerId, session, 1, ownership)).not.toBeNull();
    expect(await readOwnerAnswer({ application, synthesisAnswerAccess: access },
      answer.answerId, 1, session, ownership)).toBeNull();
  });

  it("the run read shows CHECKING while held and omits a run removed by the check", async () => {
    // Property: the run summary reveals only the waiting state, then no deleted run.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const access = createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 });
    const projection = {
      run_ref: answer.runId, question_line: "Held question", state: "SETTLED" as const,
      terminal_reason: null, hold_until: null
    };
    const application = { readRun: async () => projection } as unknown as ApiOptions["application"];
    const session = ownerSession(owner.ownerRef, owner.sessionId);
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    expect(await readOwnerRun({ application, synthesisAnswerAccess: access }, answer.runId, session, ownership))
      .toEqual({ ...projection, synthesis_check: "CHECKING" });
    const claim = await claimFor(answer);
    await repository.insertResult({
      ...answer, attemptId: claim.attemptId, synthesisOriginVersion: 1,
      outcome: { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] },
      modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
      policyVersion: "synthesis.content-check.v1@0123456789abcdef",
      callCount: 1, deadlineMs: 60_000
    });
    expect(await readOwnerRun({ application, synthesisAnswerAccess: access }, answer.runId, session, ownership))
      .toBeNull();
  });

  it("all eight owner answer adapters return no held content before dependent reads", async () => {
    // Property: every owner answer surface refuses the held version without opening downstream content.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    const actual = await serve.readAnswerProjection(answer.answerId, ownership, 1);
    expect(actual).not.toBeNull();
    const forbidden = async (): Promise<never> => { throw new Error("HELD_CONTENT_READ"); };
    const application = {
      readAnswer: async () => actual,
      readRunAnswer: async () => actual,
      readInspection: forbidden, readLedgerDigest: forbidden, readNode: forbidden
    } as unknown as ApiOptions["application"];
    const deps = {
      application,
      synthesisAnswerAccess: createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 }),
      stories: { readStory: forbidden, readStoryAnchor: forbidden },
      disclosures: { readDisclosure: forbidden, readFloor: forbidden }
    } as unknown as Parameters<typeof readOwnerAnswer>[0];
    const session = ownerSession(owner.ownerRef, owner.sessionId);
    expect(await readOwnerAnswer(deps, answer.answerId, 1, session, ownership)).toBeNull();
    expect(await readOwnerRunAnswer(deps, answer.runId, session, ownership)).toBeNull();
    expect(await readOwnerInspection(deps, answer.answerId, 1, session, ownership)).toBeNull();
    expect(await readOwnerLedgerDigest(deps, answer.answerId, session, ownership)).toBeNull();
    expect(await readOwnerStory(deps, answer.answerId, session, ownership)).toBeNull();
    expect(await readOwnerDisclosure(deps, answer.answerId, session, ownership)).toBeNull();
    expect(await readOwnerNode(deps, answer.answerId, "node", session, ownership)).toBeNull();
  });

  it("the answer list shows CHECKING without a verdict while held and omits a removed debate", async () => {
    // Property: list projections do not expose pending or removed check content.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const identityBase = testHttpIdentity(`hold-${randomUUID()}`);
    const identity = {
      ...identityBase,
      authenticated: {
        ...identityBase.authenticated, ownerRef: owner.ownerRef,
        session: { ...identityBase.authenticated.session, asker_id: `owner:${owner.ownerRef}` }
      }
    };
    const application = {
      readAnswerIndex: (_session: unknown, limit: number, offset: number) =>
        new ServeRepository(apiPool).readAnswerIndex({ ownerRef: owner.ownerRef, legacyAskerId: null }, limit, offset)
    } as unknown as ApiOptions["application"];
    const api = buildApi({
      application, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 })
    });
    try {
      const url = "/v1/answers?limit=10&offset=0";
      const held = await api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
      expect(held.statusCode).toBe(200);
      expect(held.json().items.find((item: { run_ref: string }) => item.run_ref === answer.runId))
        .toEqual(expect.objectContaining({
          run_ref: answer.runId, synthesis_check: "CHECKING", verdict_state: null
        }));
      const heldItem = held.json().items.find((item: { run_ref: string }) => item.run_ref === answer.runId);
      expect(heldItem).not.toHaveProperty("models");
      expect(heldItem).not.toHaveProperty("synthesis_flag");
      const claim = await claimFor(answer);
      await repository.insertResult({
        ...answer, attemptId: claim.attemptId, synthesisOriginVersion: 1,
        outcome: { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] },
        modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
        policyVersion: "synthesis.content-check.v1@0123456789abcdef",
        callCount: 1, deadlineMs: 60_000
      });
      const removed = await api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().items.some((item: { run_ref: string }) => item.run_ref === answer.runId)).toBe(false);
    } finally {
      await api.close();
    }
  });

  it("an unstarted check releases the owner hold after its deadline", async () => {
    // Property: the hold has a bounded lifetime even when the worker is stopped.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    await repository.insertRequest(answer);
    const access = createSynthesisAnswerAccess({ repository, deadlineMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await access.stateOf(answer)).toBe("SHOW");
  });

  it("takes a removal notice once and never gives it to another account", async () => {
    // Property: the notice is a one-time owner-scoped post-erasure signal.
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const answer = await settled();
    const attempt = await repository.startPublishAttempt(answer);
    await repository.insertResult({
      ...answer, attemptId: attempt.attemptId, synthesisOriginVersion: 1,
      outcome: { verdict: "FLAGGED", categories: ["SUICIDE_OR_HARM_TO_OTHERS"] },
      modelProviderRef: "anthropic", modelId: "claude-haiku-5-5",
      policyVersion: "synthesis.content-check.v1@0123456789abcdef",
      callCount: 1, deadlineMs: 60_000
    });
    const identityBase = testHttpIdentity(`notice-${randomUUID()}`);
    const identity = {
      ...identityBase,
      authenticated: {
        ...identityBase.authenticated, ownerRef: owner.ownerRef,
        session: { ...identityBase.authenticated.session, asker_id: `owner:${owner.ownerRef}` }
      }
    };
    const other = testHttpIdentity(`notice-other-${randomUUID()}`);
    const api = buildApi({
      application: {} as ApiOptions["application"],
      sessions: testSessionApplication([identity, other]), allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 })
    });
    try {
      const url = "/v1/account/removal-notice/take";
      const request = (who: typeof identity) => api.inject({ method: "POST", url, headers: testSessionHeaders(who, true) });
      expect((await request(other)).json()).toEqual({ notice: false });
      expect((await request(identity)).json()).toEqual({ notice: true });
      expect((await request(identity)).json()).toEqual({ notice: false });
    } finally { await api.close(); }
  });
});
