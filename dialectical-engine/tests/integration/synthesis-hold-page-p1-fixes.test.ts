// Promoted REV-SF-S01-p1-product regression: a held card must lead to its run read.
// Claim under test (S01-R3 + DONE screens 3 → 4): the held card in Your debates leads to the held page.
// The card links /debate/<summary.id>. While CHECKING, that id must be the run
// reference: getDebateServer reads an answer id, then a run answer, then the run.
// This drives all three routes against the real repositories under debateai_runtime.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { configureContentEncryption, contentCipherFor, createPool, migrate, RunRepository, type Pool } from "@debateai/db";
import { RunEventSchema, RunProjectionSchema } from "@debateai/contract";
import { ServeRepository, SynthesisCheckRepository, synthesisTextOf } from "@debateai/serve";
import { TypedDomainError } from "@debateai/kernel";
import type { ApiOptions } from "../../apps/api/src/index.js";
import { buildApi, CSRF_COOKIE_NAME, PostgresAskApplication } from "../../apps/api/src/index.js";
import { debateSummariesFromIndex } from "../../apps/ui/lib/v3/adapter.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

let database: TestDatabase;
let runtime: Pool;
let owner: StoryEncryptedOwner;

function postHeaders(identity: ReturnType<typeof testHttpIdentity>) {
  const base = testSessionHeaders(identity);
  const parts = String(base.cookie).split(";").map((part) => part.trim());
  const csrfCookie = parts
    .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  const existingToken = csrfCookie?.slice(CSRF_COOKIE_NAME.length + 1);
  const token = existingToken !== undefined && /^[A-Za-z0-9_-]{43}$/.test(existingToken)
    ? existingToken : "c".repeat(43);
  return { ...base, origin: TEST_APP_ORIGIN,
    cookie: [...parts.filter((part) => !part.startsWith(`${CSRF_COOKIE_NAME}=`)),
      `${CSRF_COOKIE_NAME}=${token}`].join("; "),
    "x-csrf-token": token };
}

describe("encrypted story owner fixture", () => {
  it("exposes the run content key store used for this owner's cipher", async () => {
    const fixture = await provisionStoryEncryptedOwner({ query: async () => ({ rows: [] }) } as unknown as Pool);
    try { expect(fixture).toHaveProperty("runKeys"); }
    finally { await releaseStoryEncryptedOwner(fixture); }
  });
});

describe("database-backed S01 route reads", () => {
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
  configureContentEncryption(runtime, contentCipherFor(database.pool)!);
}, 180_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("REV-SF-S01-p1-product: the held card's own link", () => {
  it("reads the page's three reads at the card's href while the debate is held", async () => {
    const { createSynthesisAnswerAccess } = await import("../../apps/api/src/synthesis-check/hold.js");
    const runId = await createEncryptedStoryRun(database.pool, owner, `Held link ${randomUUID()}?`);
    const { answerId } = await persistTerminalRun({
      pool: database.pool, runId, fixtureKey: randomUUID(),
      factBundle: {
        facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
      }
    });
    const repository = new SynthesisCheckRepository(runtime);
    await repository.insertRequest({ runId, answerId, answerVersion: 1 });
    const serve = new ServeRepository(runtime);
    const runs = new RunRepository(runtime);
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    // The production Application's four reads (apps/api/src/index.ts:5544-5583), minus the waiting-line fields.
    const application = {
      readAnswerIndex: (_s: unknown, limit: number, offset: number) => serve.readAnswerIndex(ownership, limit, offset),
      readAnswer: (id: string, _s: unknown, version: number | undefined) => serve.readAnswerProjection(id, ownership, version),
      readRunAnswer: (id: string) => serve.readRunAnswerProjection(id, ownership),
      readRun: async (id: string) => {
        const run = await runs.readLoadingProjection(id, ownership);
        return run === null ? null : RunProjectionSchema.parse({
          run_ref: run.runRef, question_line: run.questionLine, state: run.state,
          terminal_reason: run.terminalReason, hold_until: run.holdUntil?.toISOString() ?? null
        });
      }
    } as unknown as ApiOptions["application"];
    const base = testHttpIdentity(`revp-${randomUUID()}`);
    const identity = { ...base, authenticated: { ...base.authenticated, ownerRef: owner.ownerRef,
      session: { ...base.authenticated.session, asker_id: `owner:${owner.ownerRef}` } } };
    const api = buildApi({ application, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: createSynthesisAnswerAccess({ repository, deadlineMs: 60_000 }) });
    try {
      const get = (url: string) => api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
      const index = await get("/v1/answers?limit=10&offset=0");
      const item = (index.json() as { items: { answer_id: string; run_ref: string; question_line: string;
        synthesis_check?: string; verdict_state?: string | null }[] }).items
        .find((row) => row.run_ref === runId)!;
      // The render suite pins the actual card href to this summary id; here the
      // same id is exercised through the real API's three page reads.
      const href = debateSummariesFromIndex(index.json() as never)
        .find((summary) => summary.topic === item.question_line)?.id;
      expect(href).toBeDefined();
      const frame = {
        indexStatus: index.statusCode, synthesis_check: item.synthesis_check, hrefIsRunRef: href === item.run_ref,
        answerRead: (await get(`/v1/answers/${href}`)).statusCode,
        runAnswerRead: (await get(`/v1/runs/${href}/answer`)).statusCode,
        runRead: (await get(`/v1/runs/${href}`)).statusCode,
        runReadByRunRef: (await get(`/v1/runs/${item.run_ref}`)).json()
      };
      console.log(`REVP_FRAME ${JSON.stringify(frame)}`);
      // What S01-R3 needs at the card's address: the page's run read answers CHECKING, as it does by run id.
      expect(frame.synthesis_check).toBe("CHECKING");
      expect(item.verdict_state).toBeNull();
      expect(frame.hrefIsRunRef).toBe(true);
      expect(frame.runRead).toBe(200);
      expect(frame.runReadByRunRef).toMatchObject({ question_line: item.question_line, synthesis_check: "CHECKING" });
      expect(frame.runReadByRunRef).not.toHaveProperty("synthesis");
    } finally {
      await api.close();
    }
  }, 120_000);
});

describe("S01 held route boundary", () => {
  it("exports an inherited verdict for two versions of the same synthesis", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner, `Inherited export ${randomUUID()}?`);
    const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(),
      factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    const first = await new ServeRepository(runtime).readAnswerProjection(answerId, ownership);
    expect(first).not.toBeNull();
    const answerWithSynthesis = { ...first!, serve_state: "SERVED" as const,
      composed_text: [{ text: "The same synthesis for both versions." }] };
    expect(synthesisTextOf(answerWithSynthesis as never)).toBe("The same synthesis for both versions.");
    const original = ServeRepository.prototype.readAnswerProjection;
    const versionRead = vi.spyOn(ServeRepository.prototype, "readAnswerProjection")
      .mockImplementation(function (this: ServeRepository, id, access, version) {
        if (id === answerId) return Promise.resolve({ ...answerWithSynthesis, answer_version: version === 1 ? 1 : 2 } as never);
        return original.call(this, id, access, version);
      });
    const records = vi.spyOn(SynthesisCheckRepository.prototype, "readRecords").mockResolvedValue([{
      runId, answerId, answerVersion: 1, synthesisOriginVersion: 1,
      outcome: { verdict: "FLAGGED", categories: ["PROTECTED_CLASS_HATE"] }, checkedAt: new Date("2026-10-20T12:00:00Z"),
      final: true
    }] as never);
    try {
      const application = new PostgresAskApplication(database.pool, {} as never, {} as never,
        undefined, runtime, { server: {} as never, legacy: {} as never });
      const exported = await application.readSynthesisChecks(answerId, {} as never, ownership);
      expect(exported).toEqual([
        { answer_version: 1, verdict: "FLAGGED", categories: ["PROTECTED_CLASS_HATE"], checked_at: "2026-10-20T12:00:00.000Z" },
        { answer_version: 2, verdict: "FLAGGED", categories: ["PROTECTED_CLASS_HATE"], checked_at: "2026-10-20T12:00:00.000Z" }
      ]);
      expect(records).toHaveBeenCalledWith({ runId, answerId, maxVersion: 2 });
    } finally { versionRead.mockRestore(); records.mockRestore(); }
  }, 120_000);
  it("does not read synthesis records after the owner run was removed", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner, `Removed records ${randomUUID()}?`);
    const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(),
      factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    const removed = vi.spyOn(SynthesisCheckRepository.prototype, "runRemovedByCheck").mockResolvedValue(true);
    const records = vi.spyOn(SynthesisCheckRepository.prototype, "readRecords")
      .mockImplementation(async () => { throw new Error("REMOVED_RECORDS_MUST_NOT_BE_READ"); });
    try {
      const application = new PostgresAskApplication(database.pool, {} as never, {} as never,
        undefined, runtime, { server: {} as never, legacy: {} as never });
      const found = await application.readSynthesisChecks(answerId, {} as never,
        { ownerRef: owner.ownerRef, legacyAskerId: null });
      expect(found).toEqual([]);
      expect(removed).toHaveBeenCalledWith(runId);
      expect(records).not.toHaveBeenCalled();
    } finally { removed.mockRestore(); records.mockRestore(); }
  }, 120_000);

  it("closes an already-open event stream when the run enters the hold", async () => {
    const runId = randomUUID();
    const base = testHttpIdentity(`held-tail-${randomUUID()}`);
    const identity = { ...base, authenticated: { ...base.authenticated, ownerRef: owner.ownerRef,
      session: { ...base.authenticated.session, asker_id: `owner:${owner.ownerRef}` } } };
    let accessReads = 0, marks = 0, now = 0;
    const api = buildApi({
      application: {
        readRun: async () => RunProjectionSchema.parse({ run_ref: runId, question_line: "A live question?",
          state: "RUNNING", terminal_reason: null, hold_until: null }),
        events: async function* () {},
        eventMark: async () => { marks += 1; return { mark: "unchanged", settled: false }; }
      } as unknown as ApiOptions["application"],
      sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: { stateOf: async () => ++accessReads < 3 ? "SHOW" : "HELD",
        removalNoticeExists: async () => false, takeRemovalNotice: async () => false },
      runEventTail: { pollMs: 1, heartbeatMs: 1000, maxLifeMs: 10,
        clock: { now: () => now, sleep: async (ms: number) => { now += ms; } } }
    });
    try {
      const response = await api.inject({ method: "GET", url: `/v1/runs/${runId}/events`,
        headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("data:");
      expect(marks).toBe(1);
    } finally { await api.close(); }
  });

  it("suppresses a stored event when hold begins after the stream preflight", async () => {
    const runId = randomUUID();
    const base = testHttpIdentity(`held-event-${randomUUID()}`);
    const identity = { ...base, authenticated: { ...base.authenticated, ownerRef: owner.ownerRef,
      session: { ...base.authenticated.session, asker_id: `owner:${owner.ownerRef}` } } };
    let accessReads = 0, eventReads = 0;
    const api = buildApi({
      application: {
        readRun: async () => RunProjectionSchema.parse({ run_ref: runId, question_line: "A live question?",
          state: "RUNNING", terminal_reason: null, hold_until: null }),
        events: async function* () { eventReads += 1; yield RunEventSchema.parse({ event_id: randomUUID(),
          event_type: "run.running", at_sequence: 1, run_ref: runId, payload: { phase: "RUNNING" } }); }
      } as unknown as ApiOptions["application"],
      sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: { stateOf: async () => ++accessReads === 1 ? "SHOW" : "HELD",
        removalNoticeExists: async () => false, takeRemovalNotice: async () => false }
    });
    try {
      const response = await api.inject({ method: "GET", url: `/v1/runs/${runId}/events`,
        headers: testSessionHeaders(identity) });
      expect(response.statusCode).toBe(200);
      expect(eventReads).toBe(1);
      expect(response.body).not.toContain("data:");
    } finally { await api.close(); }
  });

  it("keeps events, map content, and investigation writes behind the hold", async () => {
    const runId = await createEncryptedStoryRun(database.pool, owner, `Held routes ${randomUUID()}?`);
    const { answerId } = await persistTerminalRun({ pool: database.pool, runId, fixtureKey: randomUUID(),
      factBundle: { facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    const checks = new SynthesisCheckRepository(runtime);
    await checks.insertRequest({ runId, answerId, answerVersion: 1 });
    const ownership = { ownerRef: owner.ownerRef, legacyAskerId: null };
    const serve = new ServeRepository(runtime);
    const runs = new RunRepository(runtime);
    let eventsRead = 0, mapRead = 0, investigationWritten = 0;
    const application = {
      readRun: async (id: string) => {
        const run = await runs.readLoadingProjection(id, ownership);
        return run === null ? null : RunProjectionSchema.parse({ run_ref: run.runRef,
          question_line: run.questionLine, state: run.state, terminal_reason: run.terminalReason,
          hold_until: run.holdUntil?.toISOString() ?? null });
      },
      readAnswer: (id: string) => serve.readAnswerProjection(id, ownership),
      events: async function* () { eventsRead += 1; },
      recordInvestigation: async () => { investigationWritten += 1; return null; }
    } as unknown as ApiOptions["application"];
    const base = testHttpIdentity(`held-routes-${randomUUID()}`);
    const identity = { ...base, authenticated: { ...base.authenticated, ownerRef: owner.ownerRef,
      session: { ...base.authenticated.session, asker_id: `owner:${owner.ownerRef}` } } };
    const api = buildApi({ application,
      sessions: { ...testSessionApplication([identity]), verifyCsrf: () => true } as never,
      allowedOrigin: TEST_APP_ORIGIN,
      synthesisAnswerAccess: { stateOf: async () => "HELD",
        removalNoticeExists: async () => false, takeRemovalNotice: async () => false },
      mapViews: { findMapRun: async () => runId, readMapView: async () => { mapRead += 1; return null; } } as never });
    try {
      const get = (url: string) => api.inject({ method: "GET", url, headers: testSessionHeaders(identity) });
      const events = await get(`/v1/runs/${runId}/events`);
      const map = await get(`/v1/answers/${answerId}/map`);
      const investigation = await api.inject({ method: "POST",
        url: `/v1/answers/${answerId}/investigations/gap-1`,
        headers: postHeaders(identity),
        payload: { human_steer_input: true, user_input: "Please investigate" } });
      expect(events.statusCode).toBe(404);
      expect(map.statusCode).toBe(404);
      expect(investigation.statusCode, investigation.body).toBe(404);
      expect({ eventsRead, mapRead, investigationWritten }).toEqual({ eventsRead: 0, mapRead: 0, investigationWritten: 0 });
    } finally { await api.close(); }
  }, 120_000);
});

});

describe("S01 removed Publish ownership boundary", () => {
  it("answers Publish after its removal notice with RUN_NOT_FOUND", async () => {
    const runId = randomUUID();
    const victim = testHttpIdentity(`removed-consumed-${randomUUID()}`);
    const application = { withContentLease: async (_runId: string, use: () => Promise<unknown>) => use(),
      readRunAnswer: async () => { throw new TypedDomainError("PRIVATE_CONTENT_ERASED", "Content erased"); }
    } as unknown as ApiOptions["application"];
    const api = buildApi({ application,
      sessions: { ...testSessionApplication([victim]), verifyCsrf: () => true } as never,
      allowedOrigin: TEST_APP_ORIGIN,
      publications: { preflightGrant: async () => true, auditPreflightDenial: async () => true } as never,
      synthesisAnswerAccess: { stateOf: async () => "REMOVED", removalNoticeExists: async () => false,
        takeRemovalNotice: async () => false }
    });
    try {
      const response = await api.inject({ method: "POST", url: `/v1/runs/${runId}/publish`,
        headers: postHeaders(victim),
        payload: { step_up_grant: "g".repeat(43), warning_acknowledged: true } });
      expect(response.statusCode, response.body).toBe(404);
      expect(response.json()).toMatchObject({ error: "RUN_NOT_FOUND" });
    } finally { await api.close(); }
  });

  it("answers another account's removed run like an unrelated id while its owner keeps 410", async () => {
    const runId = randomUUID(), missing = randomUUID();
    const victim = testHttpIdentity(`removed-owner-${randomUUID()}`);
    const attacker = testHttpIdentity(`removed-other-${randomUUID()}`);
    const application = { withContentLease: async (_runId: string, use: () => Promise<unknown>) => use(),
      readRunAnswer: async () => null } as unknown as ApiOptions["application"];
    const api = buildApi({ application,
      sessions: { ...testSessionApplication([victim, attacker]), verifyCsrf: () => true } as never,
      allowedOrigin: TEST_APP_ORIGIN,
      publications: { preflightGrant: async () => true, auditPreflightDenial: async () => true } as never,
      synthesisAnswerAccess: {
        stateOf: async ({ runId: candidate }: { runId: string }) => candidate === runId ? "REMOVED" as const : "SHOW" as const,
        removalNoticeExists: async () => true, takeRemovalNotice: async () => false,
        ownerOf: async (candidate: string) => candidate === runId ? victim.authenticated.ownerRef : null
      }
    });
    const publish = (id: string, identity: ReturnType<typeof testHttpIdentity>) => api.inject({ method: "POST",
      url: `/v1/runs/${id}/publish`,
      headers: postHeaders(identity),
      payload: { step_up_grant: "g".repeat(43), warning_acknowledged: true } });
    try {
      const otherRemoved = await publish(runId, attacker);
      const otherMissing = await publish(missing, attacker);
      const ownerRemoved = await publish(runId, victim);
      expect(otherRemoved.statusCode, otherRemoved.body).toBe(otherMissing.statusCode);
      expect(otherRemoved.body).toBe(otherMissing.body);
      expect(ownerRemoved.statusCode).toBe(410);
    } finally { await api.close(); }
  });
});
