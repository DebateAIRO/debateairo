import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  hashToken,
  loadKek,
  type AuditContextHasher
} from "../../packages/crypto/src/index.js";
import { PostgresPublicationRepository, migrate, withRunContentLease } from "@debateai/db";
import { StoryRepository, type StoryRecordInput } from "@debateai/story";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { RepositoryPublicationStoryReader } from "../../apps/api/src/stories.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { STORY_TEST_BASIS, STORY_TEST_BODY } from "../support/storyApiFixtures.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 11 — spec §11: "publishing copies `story_short`", over
 * the real database. The story is sealed by StoryRepository for an ENCRYPTED
 * run; publishing reads it back through the owner-scoped repository reader,
 * copies the short story into the encrypted public snapshot, and the anonymous
 * public read carries it. A FAILED story publishes no short story.
 */

const source = Object.freeze({ ip: "192.0.2.11", userAgent: "Story Publication Browser", requestId: "request:story-publication" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
let application: PostgresPublicationApplication;

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("STORY_TEST_OWNER_UNPROVISIONED");
  return owner;
}

function ownerSession(): AuthenticatedSession {
  const { userId, ownerRef, sessionId } = theOwner();
  return Object.freeze({
    session: Object.freeze({
      asker_id: `owner:${ownerRef}`,
      session_id: sessionId,
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const
    }),
    userId,
    ownerRef,
    tokenHash: `hash:${sessionId}`,
    csrfTokenHash: `hash:csrf:${sessionId}`,
    authKind: "cookie" as const
  });
}

/** A live one-use PUBLISH grant for the owner's session, as the step-up flow mints it. */
async function publishGrant(runId: string): Promise<string> {
  const { userId, sessionId } = theOwner();
  const token = `story-publication-${randomUUID()}`;
  await database.pool.query(
    `INSERT INTO identity.step_up_grant (
       step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
       issued_at,expires_at,consumed_at
     ) VALUES ($1,$2,$3,$4,'PUBLISH',$5,$6,$7,NULL)`,
    [randomUUID(), hashToken("step-up-grant", token), sessionId, userId, runId,
      new Date(Date.now() - 1_000), new Date(Date.now() + 60_000)]
  );
  return token;
}

function storyRecord(runId: string, answerId: string, outcome: "READY" | "FAILED"): StoryRecordInput {
  const ready = outcome === "READY";
  return {
    runId,
    answerId,
    answerVersion: 1,
    outcome,
    failureCode: ready ? null : "STORY_WRITE_REJECTED",
    shapeId: ready ? "money-decision" : null,
    packVersion: "2026-09-26.1",
    packFingerprint: "e".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: ready
      ? { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" }
      : null,
    rounds: ready ? 1 : 2,
    artifactRefs: [randomUUID()],
    body: ready ? STORY_TEST_BODY : null,
    reservation: null,
    verdictBasis: ready ? STORY_TEST_BASIS : null,
    pointNumbers: ready ? { "node:position": "P1", "node:defeater": "P2" } : null
  };
}

/** One owner's run with a settled answer and a stored story of the given outcome. */
async function storiedRun(outcome: "READY" | "FAILED"): Promise<{ runId: string; answerId: string }> {
  const marker = `${outcome.toLowerCase()}-${randomUUID()}`;
  const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story publication ${marker}`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`story-publication-fact-${marker}`], residualObjections: [], badges: [],
      conditionMarks: ["DEFECT"], reversalPoint: `story-publication-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    }
  });
  const repository = new StoryRepository(database.pool);
  await expect(withRunContentLease(database.pool, [runId], () =>
    repository.insert(storyRecord(runId, answerId, outcome)))).resolves.toBe("INSERTED");
  return { runId, answerId };
}

async function publish(runId: string, answerId: string): Promise<string> {
  const transition = await application.publish({
    runId,
    answer: buildFairShapedAnswer({ run_ref: runId, answer_id: answerId, question_line: "story publication question" }),
    authenticated: ownerSession(),
    grantToken: await publishGrant(runId),
    source
  });
  expect(transition?.state).toBe("PUBLISHED");
  return transition!.public_ref;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  application = new PostgresPublicationApplication(
    new PostgresPublicationRepository(database.pool, fakeAuditHasher),
    new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xe5)))),
    undefined,
    undefined,
    new RepositoryPublicationStoryReader(new StoryRepository(database.pool))
  );
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("publishing copies story_short over the real database (spec §11)", () => {
  it("copies a READY story's short version into the public snapshot, and nothing owner-only", async () => {
    const { runId, answerId } = await storiedRun("READY");
    const publicRef = await publish(runId, answerId);
    const debate = await application.readPublicDebate(publicRef);
    expect(debate?.story_short).toEqual({
      headline: STORY_TEST_BODY.short.headline,
      summary: STORY_TEST_BODY.short.summary,
      paths: STORY_TEST_BODY.short.paths,
      change: STORY_TEST_BODY.short.change,
      reviewer_note: null,
      reservation: null
    });
    const text = JSON.stringify(debate);
    expect(text).not.toContain("model-a");
    expect(text).not.toContain("e".repeat(64));
    expect(text).not.toContain(STORY_TEST_BODY.long.sections[0]!.title);
  });

  it("publishes no short story when the stored story FAILED, and keeps today's summary", async () => {
    const { runId, answerId } = await storiedRun("FAILED");
    const publicRef = await publish(runId, answerId);
    const debate = await application.readPublicDebate(publicRef);
    expect(debate).not.toBeNull();
    expect("story_short" in debate!).toBe(false);
    expect(debate!.answer.summary_segments).toEqual([{ text: "The served answer prose." }]);
  });
});
