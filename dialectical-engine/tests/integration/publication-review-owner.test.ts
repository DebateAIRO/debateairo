import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "@debateai/crypto";
import {
  CONTENT_JSON_SENTINEL, configureContentEncryption, contentCipherFor, createPool,
  encryptAttestedContentForRun, migrate, withRunContentLease, type Pool
} from "@debateai/db";
import {
  PublicationReviewRepository, ServeRepository, SynthesisCheckRepository, verdictOfRecord,
  type SynthesisCheckRecord
} from "@debateai/serve";
import { buildApi, type ApiOptions } from "../../apps/api/src/index.js";
import { createSynthesisPublishGate, type SynthesisPublishGate } from "../../apps/api/src/synthesis-check/publish-gate.js";
import type { Answer } from "@debateai/contract";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

const POLICY_VERSION = "synthesis.content-check.v1@0123456789abcdef";
const grantToken = () => randomBytes(32).toString("base64url");
let database: TestDatabase;
let runtime: Pool;
let owner: StoryEncryptedOwner;
let reviews: PublicationReviewRepository;
let checks: SynthesisCheckRepository;
let serve: ServeRepository;
let reviewerStaffId: string;

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
  serve = new ServeRepository(runtime);
  reviewerStaffId = randomUUID();
  await database.pool.query(
    "INSERT INTO staff.subject(staff_id,user_id,state,capabilities) VALUES($1,$2,'ACTIVE',ARRAY['PUBLICATION_REVIEW']::text[])",
    [reviewerStaffId, owner.userId]
  );
}, 180_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
  if (owner) await releaseStoryEncryptedOwner(owner);
});

async function debate(verdict: "FLAGGED" | "CLEAR" = "FLAGGED") {
  const runId = await createEncryptedStoryRun(database.pool, owner, `Review ${randomUUID()}?`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: randomUUID(),
    factBundle: {
      facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  const attempt = await checks.startPublishAttempt({ runId, answerId, answerVersion: 1 });
  const outcome = verdict === "FLAGGED"
    ? { verdict: "FLAGGED" as const, categories: ["HATE_SPEECH"] as const }
    : { verdict: "CLEAR" as const, categories: [] as const };
  await checks.insertResult({
    runId, answerId, answerVersion: 1, synthesisOriginVersion: 1,
    attemptId: attempt.attemptId,
    outcome,
    modelProviderRef: "fixture", modelId: "fixture", policyVersion: POLICY_VERSION,
    callCount: 1, deadlineMs: 60_000
  });
  const answer = await serve.readAnswerProjection(answerId, { ownerRef: owner.ownerRef, legacyAskerId: null }, 1);
  if (answer === null) throw new Error("TEST_ANSWER_MISSING");
  return { runId, answerId, answer };
}

type Debate = Awaited<ReturnType<typeof debate>>;
async function grant(target: Debate, token: string): Promise<void> {
  await database.pool.query(
    `INSERT INTO identity.step_up_grant
      (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(), hashToken("step-up-grant", token), owner.sessionId, owner.userId, target.runId]
  );
}

function apiFor(target: Debate, validGrant: boolean, token = grantToken(), options: {
  gate?: SynthesisPublishGate; answer?: Answer
} = {}) {
  const base = testHttpIdentity(randomUUID());
  const identity = {
    ...base,
    authenticated: {
      ...base.authenticated,
      userId: owner.userId, ownerRef: owner.ownerRef,
      session: { ...base.authenticated.session, session_id: owner.sessionId, asker_id: `owner:${owner.ownerRef}` }
    }
  };
  let denials = 0;
  let publicationCalls = 0;
  const application = {
    withContentLease: <T>(_runId: string, use: () => Promise<T>) => withRunContentLease(runtime, [target.runId], use),
    readRun: async () => ({ run_ref: target.runId }),
    readRunAnswer: async () => options.answer ?? serve.readAnswerProjection(target.answerId, {
      ownerRef: identity.authenticated.ownerRef, legacyAskerId: null
    }, 1)
  } as unknown as ApiOptions["application"];
  const publications = {
    preflightGrant: async () => validGrant,
    auditPreflightDenial: async () => { denials++; return true; },
    publish: async () => { publicationCalls++; return { state: "PUBLISHED", public_ref: randomUUID() }; },
    unpublish: async () => ({ state: "PRIVATE", public_ref: null })
  } as unknown as NonNullable<ApiOptions["publications"]>;
  const api = buildApi({
    application, publications, sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN,
    ...(options.gate === undefined ? {} : { synthesisPublishGate: options.gate }),
    publicationReviews: {
      repository: reviews,
      readOwnedAnswer: async () => {
        const live = await runtime.query<{ live: boolean }>(
          "SELECT core.run_private_content_is_live($1) AS live", [target.runId]
        );
        if (!live.rows[0]?.live) return null;
        return withRunContentLease(runtime, [target.runId], async () => options.answer ??
          serve.readAnswerProjection(target.answerId, {
            ownerRef: identity.authenticated.ownerRef, legacyAskerId: null
          }, 1));
      },
      readVerdictOfRecord: async () => verdictOfRecord(
        await checks.readRecords({ runId: target.runId, answerId: target.answerId, maxVersion: 1 }),
        origin => origin === 1
      )
    }
  });
  const post = async (payload: object = { step_up_grant: token, team_read_acknowledged: true }) => await api.inject({
    method: "POST", url: `/v1/runs/${target.runId}/publication-review`,
    headers: testSessionHeaders(identity, true), payload
  });
  const get = async () => await api.inject({
    method: "GET", url: `/v1/runs/${target.runId}/publication-review`, headers: testSessionHeaders(identity)
  });
  const publish = async () => await api.inject({ method: "POST", url: `/v1/runs/${target.runId}/publish`,
    headers: testSessionHeaders(identity, true), payload: { step_up_grant: token, warning_acknowledged: true }
  });
  const unpublish = async () => await api.inject({ method: "POST", url: `/v1/runs/${target.runId}/unpublish`,
    headers: testSessionHeaders(identity, true), payload: { step_up_grant: token, copies_may_persist_acknowledged: true }
  });
  return { api, post, get, publish, unpublish, token, denials: () => denials,
    publicationCalls: () => publicationCalls };
}

async function approve(target: Debate) {
  const token = grantToken();
  await grant(target, token);
  expect(await reviews.ask({ grantTokenHash: hashToken("step-up-grant", token),
    sessionId: owner.sessionId, userId: owner.userId, ownerRef: owner.ownerRef,
    runId: target.runId, answerId: target.answerId, originVersion: 1
  })).toBe("ASKED");
  const ref = (await database.pool.query<{ review_ref: string }>(
    "SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1", [target.runId]
  )).rows[0]!.review_ref;
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role=replica");
    await seed.query(
      "INSERT INTO serve.publication_review_decision(review_ref,run_id,outcome,reviewer_staff_id,content) VALUES($1,$2,'APPROVE',$3,'{}')",
      [ref, target.runId, reviewerStaffId]
    );
    await seed.query("COMMIT");
  } catch (caught) { await seed.query("ROLLBACK"); throw caught; }
  finally { seed.release(); }
}

async function refuse(target: Debate, reason: string) {
  const ref = (await database.pool.query<{ review_ref: string }>(
    "SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1 ORDER BY ask_ordinal DESC LIMIT 1",
    [target.runId]
  )).rows[0]!.review_ref;
  const sealed = await withRunContentLease(runtime, [target.runId], () =>
    encryptAttestedContentForRun(runtime, target.runId, "serve.publication_review_decision", ref, { reason })
  );
  if (sealed === null) throw new Error("TEST_DECISION_ENCRYPTION_FAILED");
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role=replica");
    await seed.query(
      `INSERT INTO serve.publication_review_decision
       (review_ref,run_id,outcome,reviewer_staff_id,content,content_ciphertext,content_attestation)
       VALUES($1,$2,'REFUSE',$3,$4::jsonb,$5::jsonb,$6)`,
      [ref, target.runId, reviewerStaffId, JSON.stringify(CONTENT_JSON_SENTINEL),
        JSON.stringify(sealed.envelope), sealed.attestation]
    );
    await seed.query("COMMIT");
  } catch (caught) { await seed.query("ROLLBACK"); throw caught; }
  finally { seed.release(); }
}

function gateFor(target: Debate, changed = false) {
  const record = (originVersion: number): SynthesisCheckRecord => ({
    resultId: randomUUID(), attemptId: randomUUID(), runId: target.runId, answerId: target.answerId,
    answerVersion: originVersion, synthesisOriginVersion: originVersion, final: true,
    outcome: { verdict: "FLAGGED", categories: ["HATE_SPEECH"] },
    modelProviderRef: "fixture", modelId: "fixture", policyVersion: POLICY_VERSION,
    callCount: 1, checkedAt: new Date()
  });
  const records = changed ? [record(1), record(2)] : [record(1)];
  const repository = {
    ownerRefOfRun: async () => owner.ownerRef,
    readRecords: async () => records
  } as unknown as SynthesisCheckRepository;
  return createSynthesisPublishGate({
    repository,
    readAnswerVersions: async () => changed
      ? new Map([[1, "First synthesis"], [2, "Changed synthesis"]])
      : new Map([[1, "First synthesis"]]),
    approvalCovers: input => reviews.approvalCovers(input),
    check: { port: () => null, deadlineMs: 60_000, recordSpend: async () => {},
      priceOf: () => null, clock: () => new Date(), log: () => {} },
    deadlineMs: 60_000, clock: () => new Date(), sleep: async () => {}
  });
}

describe("publication review owner routes over migrated database", () => {
  it("POST without a valid PUBLISH grant answers 404 RUN_NOT_FOUND and audits the denial", async () => {
    const target = await debate();
    const fixture = apiFor(target, false);
    try {
      const response = await fixture.post();
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "RUN_NOT_FOUND", message: "RUN_NOT_FOUND" });
      expect(fixture.denials()).toBe(1);
    } finally { await fixture.api.close(); }
  });

  it("POST without team_read_acknowledged answers 400", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    try {
      const response = await fixture.post({ step_up_grant: fixture.token });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    } finally { await fixture.api.close(); }
  });

  it("POST on a FLAGGED version answers 201 UNDER_REVIEW and GET reports UNDER_REVIEW", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      const response = await fixture.post();
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ state: "UNDER_REVIEW" });
      expect((await fixture.get()).json()).toEqual({
        flagged: true, state: "UNDER_REVIEW", categories: ["HATE_SPEECH"],
        asks_used: 1, may_ask: false, refusal: null
      });
    } finally { await fixture.api.close(); }
  });

  it("a second POST while pending answers 409 PUBLICATION_REVIEW_PENDING and adds no row", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      expect((await fixture.post()).statusCode).toBe(201);
      const secondToken = grantToken();
      await grant(target, secondToken);
      const response = await fixture.post({ step_up_grant: secondToken, team_read_acknowledged: true });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("PUBLICATION_REVIEW_PENDING");
      const rows = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM serve.publication_review_request WHERE run_id=$1", [target.runId]
      );
      expect(rows.rows[0]?.n).toBe(1);
    } finally { await fixture.api.close(); }
  });

  it("Ask answers RUN_NOT_FOUND if erasure wins during the request insert", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    const ask = vi.spyOn(reviews, "ask").mockRejectedValueOnce(
      Object.assign(new Error("PRIVATE_CONTENT_ERASED"), { code: "55000" }));
    try {
      const response = await fixture.post();
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("RUN_NOT_FOUND");
    } finally { ask.mockRestore(); await fixture.api.close(); }
  });

  it("POST on a CLEAR version answers 409 PUBLICATION_REVIEW_NOT_ALLOWED", async () => {
    const target = await debate("CLEAR");
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      const response = await fixture.post();
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("PUBLICATION_REVIEW_NOT_ALLOWED");
      const rows = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM serve.publication_review_request WHERE run_id=$1", [target.runId]
      );
      expect(rows.rows[0]?.n).toBe(0);
    } finally { await fixture.api.close(); }
  });

  it("Publish of a FLAGGED version covered by an approval answers 201 and publishes once", async () => {
    const target = await debate();
    await approve(target);
    const fixture = apiFor(target, true, grantToken(), { gate: gateFor(target) });
    try {
      const response = await fixture.publish();
      expect(response.statusCode).toBe(201);
      expect(fixture.publicationCalls()).toBe(1);
    } finally { await fixture.api.close(); }
  });

  it("Publish of a refused version stays blocked by the approval gate", async () => {
    const target = await debate();
    const askToken = grantToken();
    await grant(target, askToken);
    expect(await reviews.ask({ grantTokenHash: hashToken("step-up-grant", askToken),
      sessionId: owner.sessionId, userId: owner.userId, ownerRef: owner.ownerRef,
      runId: target.runId, answerId: target.answerId, originVersion: 1 })).toBe("ASKED");
    await refuse(target, "Still unsafe");
    const fixture = apiFor(target, true, grantToken(), { gate: gateFor(target) });
    await grant(target, fixture.token);
    try {
      const response = await fixture.publish();
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("PUBLICATION_APPROVAL_REQUIRED");
      expect(fixture.publicationCalls()).toBe(0);
    } finally { await fixture.api.close(); }
  });

  it("Publish of a later version with a changed synthesis answers 409 PUBLICATION_APPROVAL_REQUIRED", async () => {
    const target = await debate();
    await approve(target);
    const later = { ...target.answer, answer_version: 2 };
    const fixture = apiFor(target, true, grantToken(), { gate: gateFor(target, true), answer: later });
    try {
      const response = await fixture.publish();
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("PUBLICATION_APPROVAL_REQUIRED");
      expect(fixture.publicationCalls()).toBe(0);
    } finally { await fixture.api.close(); }
  });

  it("after an unpublish, Publish of a covered version answers 201 without a new ask", async () => {
    const target = await debate();
    await approve(target);
    const fixture = apiFor(target, true, grantToken(), { gate: gateFor(target) });
    try {
      expect((await fixture.publish()).statusCode).toBe(201);
      expect((await fixture.unpublish()).statusCode).toBe(200);
      expect((await fixture.publish()).statusCode).toBe(201);
      expect(fixture.publicationCalls()).toBe(2);
      const rows = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM serve.publication_review_request WHERE run_id=$1", [target.runId]
      );
      expect(rows.rows[0]?.n).toBe(1);
    } finally { await fixture.api.close(); }
  });

  it("GET after one refusal reports REFUSED with the reason and may_ask true; after a second refusal may_ask false", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      expect((await fixture.post()).statusCode).toBe(201);
      await refuse(target, "First private reason");
      const first = (await fixture.get()).json();
      expect(first).toMatchObject({ state: "REFUSED", asks_used: 1, may_ask: true,
        refusal: { reason: "First private reason" } });
      const secondToken = grantToken();
      await grant(target, secondToken);
      expect((await fixture.post({ step_up_grant: secondToken, team_read_acknowledged: true })).statusCode).toBe(201);
      await refuse(target, "Second private reason");
      const second = (await fixture.get()).json();
      expect(second).toMatchObject({ state: "REFUSED", asks_used: 2, may_ask: false,
        refusal: { reason: "Second private reason" } });
    } finally { await fixture.api.close(); }
  });

  it("after the private delete of the run, GET answers 404 RUN_NOT_FOUND and the request row is gone", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      expect((await fixture.post()).statusCode).toBe(201);
      await database.pool.query(
        `INSERT INTO serve.private_run_key_cleanup_intent
          (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
          VALUES($1,$2,$3,now(),'{}'::uuid[])`,
        [randomUUID(), owner.userId, target.runId]
      );
      const response = await fixture.get();
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("RUN_NOT_FOUND");
      const rows = await database.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM serve.publication_review_request WHERE run_id=$1", [target.runId]
      );
      expect(rows.rows[0]?.n).toBe(0);
    } finally { await fixture.api.close(); }
  });

  it("no owner-side body contains a reviewer's staff_id or user_id", async () => {
    const target = await debate();
    const fixture = apiFor(target, true);
    await grant(target, fixture.token);
    try {
      expect((await fixture.post()).statusCode).toBe(201);
      await refuse(target, "Owner-visible reason");
      const body = (await fixture.get()).body;
      expect(body).toContain("Owner-visible reason");
      expect(body).not.toContain(reviewerStaffId);
      expect(body).not.toContain(owner.userId);
      expect(body).not.toContain("staff_id");
      expect(body).not.toContain("user_id");
    } finally { await fixture.api.close(); }
  });
});
