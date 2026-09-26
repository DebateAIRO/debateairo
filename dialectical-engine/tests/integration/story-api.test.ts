import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, SESSION_COOKIE_NAME, buildApi } from "@debateai/api";
import { AnswerSchema, AnswerStorySchema, type Session } from "@debateai/contract";
import { migrate, withRunContentLease } from "@debateai/db";
import { StoryRepository, type StoryRecordInput } from "@debateai/story";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";
import { RepositoryAnswerStoryApplication } from "../../apps/api/src/stories.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { STORY_TEST_BASIS, STORY_TEST_BODY } from "../support/storyApiFixtures.js";
import {
  createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase
} from "../support/testDatabase.js";

/**
 * Verdict story, Task 10 — spec §11: "The owner API returns the story and a
 * foreigner gets 404", over the real database. The story is written through
 * StoryRepository for an ENCRYPTED run, so the owner's read goes through the
 * ownership predicate, the content lease and decryption; a different active
 * account asking for the same answer gets exactly the closed 404 an absent
 * answer gets.
 */

const ORIGIN = "https://ui.story-api.test";
const OWNER_TOKEN = "s".repeat(43);
const FOREIGN_TOKEN = "t".repeat(43);

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
let api: ReturnType<typeof buildApi> | undefined;
let ownerAuth: AuthenticatedSession;
let foreignAuth: AuthenticatedSession;
let storiedAnswerId: string;
let storiedRunId: string;
let storylessAnswerId: string;

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("STORY_TEST_OWNER_UNPROVISIONED");
  return owner;
}

function theApi(): ReturnType<typeof buildApi> {
  if (api === undefined) throw new Error("STORY_TEST_API_UNBUILT");
  return api;
}

function serverSession(ownerRef: string, sessionId: string): Session {
  return Object.freeze({
    asker_id: `owner:${ownerRef}`,
    session_id: sessionId,
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  });
}

function authenticated(input: { userId: string; ownerRef: string; sessionId: string; token: string }): AuthenticatedSession {
  return Object.freeze({
    session: serverSession(input.ownerRef, input.sessionId),
    userId: input.userId,
    ownerRef: input.ownerRef,
    tokenHash: `hash:${input.token}`,
    csrfTokenHash: `hash:csrf:${input.token}`,
    authKind: "cookie" as const
  });
}

/** A second ACTIVE account with its own session: a real foreigner, not an unknown ref. */
async function provisionForeignAccount(): Promise<AuthenticatedSession> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `story-foreign-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [sessionId, userId, `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  return authenticated({ userId, ownerRef, sessionId, token: FOREIGN_TOKEN });
}

async function answerFor(runId: string, marker: string): Promise<string> {
  const persisted = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`story-api-fact-${marker}`], residualObjections: [], badges: [],
      conditionMarks: ["DEFECT"], reversalPoint: `story-api-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    }
  });
  return persisted.answerId;
}

function readyRecord(runId: string, answerId: string): StoryRecordInput {
  return {
    runId,
    answerId,
    answerVersion: 1,
    outcome: "READY",
    failureCode: null,
    shapeId: "money-decision",
    packVersion: "2026-09-26.1",
    packFingerprint: "e".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 2,
    artifactRefs: [randomUUID(), randomUUID()],
    body: STORY_TEST_BODY,
    reservation: null,
    verdictBasis: STORY_TEST_BASIS,
    pointNumbers: { "node:position": "P1", "node:defeater": "P2" }
  };
}

function headersFor(token: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  const theOwnerNow = theOwner();
  ownerAuth = authenticated({
    userId: theOwnerNow.userId, ownerRef: theOwnerNow.ownerRef, sessionId: theOwnerNow.sessionId, token: OWNER_TOKEN
  });
  foreignAuth = await provisionForeignAccount();

  storiedRunId = await createEncryptedStoryRun(database.pool, theOwnerNow, "story api storied answer");
  storiedAnswerId = await answerFor(storiedRunId, `storied-${randomUUID()}`);
  const repository = new StoryRepository(database.pool);
  await expect(withRunContentLease(database.pool, [storiedRunId], () =>
    repository.insert(readyRecord(storiedRunId, storiedAnswerId)))).resolves.toBe("INSERTED");

  const storylessRunId = await createEncryptedStoryRun(database.pool, theOwnerNow, "story api storyless answer");
  storylessAnswerId = await answerFor(storylessRunId, `storyless-${randomUUID()}`);

  const sessionsByToken = new Map([[OWNER_TOKEN, ownerAuth], [FOREIGN_TOKEN, foreignAuth]]);
  const sessions = {
    authenticate: async (token: string) => sessionsByToken.get(token) ?? null,
    verifyCsrf: () => false
  } as unknown as SessionApplication;
  api = buildApi({
    application: new PostgresAskApplication(
      database.pool, {} as never, {} as never, undefined, database.pool,
      createTestAskAdmissionPoolFacades(database.pool)
    ),
    sessions,
    allowedOrigin: ORIGIN,
    stories: new RepositoryAnswerStoryApplication(new StoryRepository(database.pool))
  });
}, 180_000);

afterAll(async () => {
  await api?.close();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("GET /v1/answers/{id}/story over the real database (spec §11)", () => {
  it("stores the story sealed: its text is in no readable column", async () => {
    const row = await database.pool.query<{ row_text: string; has_envelope: boolean }>(
      `SELECT to_jsonb(story)::text AS row_text, story.content_ciphertext IS NOT NULL AS has_envelope
       FROM serve.answer_story AS story WHERE story.answer_id = $1`,
      [storiedAnswerId]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.has_envelope).toBe(true);
    expect(row.rows[0]!.row_text).not.toContain(STORY_TEST_BODY.short.headline);
  });

  it("returns the decrypted READY story to its owner", async () => {
    const response = await theApi().inject({
      method: "GET", url: `/v1/answers/${storiedAnswerId}/story`, headers: headersFor(OWNER_TOKEN)
    });
    expect(response.statusCode).toBe(200);
    const body = AnswerStorySchema.parse(response.json());
    expect(body).toMatchObject({
      answer_id: storiedAnswerId,
      answer_version: 1,
      status: "READY",
      unavailable_reason: null,
      shape: { id: "money-decision", title: "Money decision" },
      pack: { version: "2026-09-26.1", fingerprint: "e".repeat(64) },
      rounds: 2,
      reservation: null,
      point_numbers: { "node:position": "P1", "node:defeater": "P2" },
      story: STORY_TEST_BODY,
      verdict_basis: STORY_TEST_BASIS
    });
    expect(body.storyteller?.model_id).toBe("model-a");
    expect(body.checker?.model_id).toBe("model-b");
    expect(body.written_at).not.toBeNull();
  });

  it("gives a different active account exactly the closed 404 an absent answer gets", async () => {
    const [foreign, absent] = await Promise.all([
      theApi().inject({ method: "GET", url: `/v1/answers/${storiedAnswerId}/story`, headers: headersFor(FOREIGN_TOKEN) }),
      theApi().inject({ method: "GET", url: `/v1/answers/${randomUUID()}/story`, headers: headersFor(FOREIGN_TOKEN) })
    ]);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: "STORY_NOT_FOUND" });
    expect(absent.statusCode).toBe(404);
    expect(foreign.body).toBe(absent.body);
    expect(foreign.body).not.toContain(STORY_TEST_BODY.short.headline);
  });

  it("refuses the foreigner at the repository too, not only at the answer gate", async () => {
    const reader = new RepositoryAnswerStoryApplication(new StoryRepository(database.pool));
    await expect(reader.readStory({
      answerId: storiedAnswerId, answerVersion: 1,
      ownership: { ownerRef: foreignAuth.ownerRef, legacyAskerId: null }
    })).resolves.toBeNull();
    await expect(reader.readStory({
      answerId: storiedAnswerId, answerVersion: 1,
      ownership: { ownerRef: ownerAuth.ownerRef, legacyAskerId: null }
    })).resolves.toMatchObject({ outcome: "READY", body: STORY_TEST_BODY });
  });

  it("reports the owner's answer without a verdict and without a story as UNAVAILABLE, not WRITING", async () => {
    const answer = await theApi().inject({
      method: "GET", url: `/v1/answers/${storylessAnswerId}`, headers: headersFor(OWNER_TOKEN)
    });
    expect(answer.statusCode).toBe(200);
    // The fixture terminal is COMPONENTS_ONLY: it carries no label, so the runner never writes it a story.
    expect(AnswerSchema.parse(answer.json()).verdict_state).toBeNull();
    const response = await theApi().inject({
      method: "GET", url: `/v1/answers/${storylessAnswerId}/story`, headers: headersFor(OWNER_TOKEN)
    });
    expect(response.statusCode).toBe(200);
    expect(AnswerStorySchema.parse(response.json())).toMatchObject({
      answer_id: storylessAnswerId, status: "UNAVAILABLE", unavailable_reason: "NO_VERDICT", story: null
    });
  });
});
