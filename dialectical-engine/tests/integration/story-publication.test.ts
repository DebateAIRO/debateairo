import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MemoryPublicationKeyStore,
  PublicationCipher,
  hashToken,
  loadKek,
  type AuditContextHasher
} from "../../packages/crypto/src/index.js";
import { PostgresPublicationRepository, RunRepository, ServeDisclosureRepository, migrate, withRunContentLease } from "@debateai/db";
import { StoryRepository, type StoryRecordInput } from "@debateai/story";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { RepositoryPublicationStoryReader } from "../../apps/api/src/stories.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { persistCatchUpVersion } from "../support/catchUpVersion.js";
import { recordFloorLabelReceipt } from "../support/floorReceipt.js";
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
 * public read carries it. The checker's reservation never crosses, and a
 * FAILED story publishes no short story.
 */

const RESERVATION = "P7, the rent figure, comes from a single source.";
type StoredOutcome = "READY" | "READY_WITH_RESERVATION" | "FAILED";

const source = Object.freeze({ ip: "192.0.2.11", userAgent: "Story Publication Browser", requestId: "request:story-publication" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

/** The six public fields of STORY_TEST_BODY: the short version (R1: with its confidence sentence) and the reviewer's note. */
const PUBLIC_SHORT = Object.freeze({
  headline: STORY_TEST_BODY.short.headline,
  summary: STORY_TEST_BODY.short.summary,
  confidence: STORY_TEST_BODY.short.confidence,
  paths: STORY_TEST_BODY.short.paths,
  change: STORY_TEST_BODY.short.change,
  reviewer_note: STORY_TEST_BODY.reviewer_note
});

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

function storyRecord(runId: string, answerId: string, outcome: StoredOutcome): StoryRecordInput {
  const ready = outcome !== "FAILED";
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
    reservation: outcome === "READY_WITH_RESERVATION" ? RESERVATION : null,
    verdictBasis: ready ? STORY_TEST_BASIS : null,
    pointNumbers: ready ? { "node:position": "P1", "node:defeater": "P2" } : null,
    languageTag: ready ? "ro" : null
  };
}

/** One owner's run with a settled answer and a stored story of the given outcome. */
async function storiedRun(
  outcome: StoredOutcome,
  language?: Readonly<{ tag: string; name: string }>,
  /** M5: the floor's label receipt, recorded before the answer is sealed, as the runner records it. */
  floorReceipt?: Readonly<{ servedNodeId: string; basisAbsence: readonly ("MARGIN" | "DISAGREEMENT")[] }>
): Promise<{ runId: string; answerId: string }> {
  const marker = `${outcome.toLowerCase()}-${randomUUID()}`;
  const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story publication ${marker}`, language);
  if (floorReceipt !== undefined) {
    await recordFloorLabelReceipt(database.pool, { runId, label: "UNSUPPORTED", ...floorReceipt });
  }
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

async function publish(runId: string, answerId: string, answerVersion = 1): Promise<string> {
  const transition = await application.publish({
    runId,
    answer: buildFairShapedAnswer({
      run_ref: runId, answer_id: answerId, answer_version: answerVersion, question_line: "story publication question"
    }),
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
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
    const text = JSON.stringify(debate);
    expect(text).not.toContain("model-a");
    expect(text).not.toContain("e".repeat(64));
    expect(text).not.toContain(STORY_TEST_BODY.long.sections[0]!.title);
    // The reasons are for the full report only (R1).
    expect(text).not.toContain(STORY_TEST_BODY.why.reasons[0]!.text);
  });

  it("copies a READY_WITH_RESERVATION story without the checker's reservation", async () => {
    const { runId, answerId } = await storiedRun("READY_WITH_RESERVATION");
    const publicRef = await publish(runId, answerId);
    const debate = await application.readPublicDebate(publicRef);
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
    expect(JSON.stringify(debate)).not.toContain("the rent figure");
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

describe("publishing copies the question's language from the run over the real database (R2, spec §14.3)", () => {
  it("copies the run's argument_language_tag into the snapshot", async () => {
    const { runId, answerId } = await storiedRun("READY", { tag: "ro", name: "Romanian" });
    const debate = await application.readPublicDebate(await publish(runId, answerId));
    expect(debate?.language).toBe("ro");
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
  });

  it("copies und for a run whose language was not detected, with or without a story", async () => {
    const storied = await storiedRun("READY");
    expect((await application.readPublicDebate(await publish(storied.runId, storied.answerId)))?.language).toBe("und");
    const failed = await storiedRun("FAILED", { tag: "de", name: "German" });
    const debate = await application.readPublicDebate(await publish(failed.runId, failed.answerId));
    expect(debate?.language).toBe("de");
    expect("story_short" in debate!).toBe(false);
  });

  it("reads the language on the owner's run read too (GET /v1/runs/{id})", async () => {
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), "story publication run read", { tag: "ro", name: "Romanian" });
    const projection = await new RunRepository(database.pool).readLoadingProjection(runId, {
      ownerRef: theOwner().ownerRef, legacyAskerId: null
    });
    expect(projection?.argumentLanguage).toEqual({ tag: "ro", name: "Romanian" });
  });
});

/** The components-only answer the owner publishes, its first position the record's leading one. */
async function publishComponentsOnly(runId: string, answerId: string, leadingNodeId: string, answerVersion = 1): Promise<string> {
  const served = buildFairShapedAnswer({
    run_ref: runId, answer_id: answerId, answer_version: answerVersion, question_line: "story publication question"
  });
  const transition = await application.publish({
    runId,
    answer: {
      ...served,
      terminal: "COMPONENTS_ONLY", serve_state: "COMPONENTS_ONLY", verdict_state: null,
      verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" }, composed_text: [],
      confidence_band: null, band_ceiling: null,
      nodes: served.nodes.map((node, index) => index === 0 ? { ...node, node_id: leadingNodeId } : node)
    },
    authenticated: ownerSession(),
    grantToken: await publishGrant(runId),
    source
  });
  expect(transition?.state).toBe("PUBLISHED");
  return transition!.public_ref;
}

describe("publishing copies the floor from the owner's record over the real database (engine money rule, Task M5)", () => {
  /** The owner's record for a components-only answer: with a floor, or with none. */
  async function recordFor(runId: string, answerId: string, leadingNodeId: string | null): Promise<void> {
    await expect(new ServeDisclosureRepository(database.pool).insert({
      answerId, answerVersion: 1, runId,
      writerPlannedRef: "provider:a", checkerPlannedRef: "provider:a", writerServedRef: null, checkerServedRef: null,
      writerFallback: false, checkerFallback: false, fallbackReason: null, checkerSameAsWriter: false,
      bodyStop: null, pointsWithoutReview: null, serveStop: "MONEY", digestRung: 0, digestPointsOmitted: 0,
      floorVerdictState: leadingNodeId === null ? null : "UNSUPPORTED",
      floorLeadingNodeId: leadingNodeId,
      floorReason: leadingNodeId === null ? null : "ENVELOPE_EXHAUSTED"
    })).resolves.toBe("INSERTED");
  }

  it("copies a components-only answer's floor — its label, leading position and thin-basis flag, nothing else — into the public snapshot", async () => {
    const leading = randomUUID();
    const { runId, answerId } = await storiedRun("READY", undefined, { servedNodeId: leading, basisAbsence: ["MARGIN", "DISAGREEMENT"] });
    await recordFor(runId, answerId, leading);
    const debate = await application.readPublicDebate(await publishComponentsOnly(runId, answerId, leading));
    expect(debate?.floor).toEqual({ verdict_state: "UNSUPPORTED", leading_node_id: leading, basis_incomplete: true });
    expect(debate?.answer).toMatchObject({ terminal: "COMPONENTS_ONLY", verdict: null, verdict_available: false });
    // Owner-side facts never cross: the reason code, the makers, the stops.
    const text = JSON.stringify(debate);
    for (const ownerOnly of ["ENVELOPE_EXHAUSTED", "provider:a", "MONEY"]) expect(text).not.toContain(ownerOnly);
  });

  it("publishes no floor for a components-only answer whose record has none, or that has no record", async () => {
    const recorded = await storiedRun("FAILED");
    await recordFor(recorded.runId, recorded.answerId, null);
    const withoutFloor = await application.readPublicDebate(await publishComponentsOnly(recorded.runId, recorded.answerId, randomUUID()));
    expect(withoutFloor).not.toBeNull();
    expect("floor" in withoutFloor!).toBe(false);
    const unrecorded = await storiedRun("FAILED");
    const withoutRecord = await application.readPublicDebate(await publishComponentsOnly(unrecorded.runId, unrecorded.answerId, randomUUID()));
    expect("floor" in withoutRecord!).toBe(false);
  });

  it("publishes no floor whose label receipt is missing: its basis would be unknown (M5 review, I2)", async () => {
    const { runId, answerId } = await storiedRun("READY");
    const leading = randomUUID();
    await recordFor(runId, answerId, leading);
    const debate = await application.readPublicDebate(await publishComponentsOnly(runId, answerId, leading));
    expect(debate).not.toBeNull();
    expect("floor" in debate!).toBe(false);
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
  });
});

/**
 * M5 review, I1 — a DR-184 review catch-up appends version 2 with no story of
 * its own. Before the fix the publish read the story of version 2 exactly, so a
 * debate published after a catch-up lost its short story.
 */
describe("publishing after a review catch-up version still carries the story (M5 review, I1)", () => {
  it("copies the READY story of version 1 into the snapshot of version 2", async () => {
    const { runId, answerId } = await storiedRun("READY");
    expect(await persistCatchUpVersion(database.pool, runId)).toBe(2);
    const debate = await application.readPublicDebate(await publish(runId, answerId, 2));
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
  });

  it("copies a floor answer's story and its floor into the snapshot of version 2", async () => {
    const leading = randomUUID();
    const { runId, answerId } = await storiedRun("READY", undefined, { servedNodeId: leading, basisAbsence: [] });
    const records = new ServeDisclosureRepository(database.pool);
    await expect(records.insert({
      answerId, answerVersion: 1, runId,
      writerPlannedRef: "provider:a", checkerPlannedRef: "provider:a", writerServedRef: null, checkerServedRef: null,
      writerFallback: false, checkerFallback: false, fallbackReason: null, checkerSameAsWriter: false,
      bodyStop: null, pointsWithoutReview: null, serveStop: "TRANSPORT_DEATH", digestRung: 0, digestPointsOmitted: 0,
      floorVerdictState: "UNSUPPORTED", floorLeadingNodeId: leading, floorReason: "TRANSPORT_DEATH"
    })).resolves.toBe("INSERTED");
    expect(await persistCatchUpVersion(database.pool, runId)).toBe(2);
    const debate = await application.readPublicDebate(await publishComponentsOnly(runId, answerId, leading, 2));
    expect(debate?.story_short).toEqual(PUBLIC_SHORT);
    expect(debate?.floor).toEqual({ verdict_state: "UNSUPPORTED", leading_node_id: leading, basis_incomplete: false });
  });
});
