import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema, type StoryBody, type StoryVerdictBasis } from "@debateai/contract";
import {
  CONTENT_JSON_SENTINEL,
  encryptAttestedContentForRun,
  migrate,
  withRunContentLease
} from "@debateai/db";
import { StoryRepository, type StoryRecordInput } from "@debateai/story";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun,
  createLegacyStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Verdict story, Task 6 — `serve.answer_story` (migration 0072) and the
 * repository over it: insert-once, encrypted at rest for an encrypted run,
 * owner-gated on read, benign on an erased run, append-only.
 */

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("STORY_TEST_OWNER_UNPROVISIONED");
  return owner;
}

const VERDICT_BASIS: StoryVerdictBasis = {
  label: "CONTESTED",
  rung: 2,
  trigger: "MARGIN_WITHIN_GAMMA",
  winner_node_id: "node-1",
  winner_strength: 0.62,
  runner_up_node_id: "node-2",
  runner_up_strength: 0.58,
  margin: 0.04,
  disagreement: 0.12,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "FULL",
  marks: []
};

function bodyWith(marker: string): StoryBody {
  const paragraph = (text: string) => ({ text: `${text} ${marker}`, node_refs: ["node-1"] });
  return StoryBodySchema.parse({
    shape_id: "general",
    short: {
      headline: `Headline ${marker}`,
      summary: `Summary ${marker}`,
      paths: [{ position_ref: "node-1", fate: "HELD_UP", line: `Line ${marker}`, node_refs: ["node-1"] }],
      change: paragraph("Change")
    },
    long: {
      sections: ["Reading", "Verdict", "Change"].map((title) => ({ title, paragraphs: [paragraph(title)] }))
    },
    reviewer_note: paragraph("Note")
  });
}

function readyRecord(runId: string, answerId: string, marker: string): StoryRecordInput {
  return {
    runId,
    answerId,
    answerVersion: 1,
    outcome: "READY_WITH_RESERVATION",
    failureCode: null,
    shapeId: "general",
    packVersion: "2026-09-26.1",
    packFingerprint: "f".repeat(64),
    storytellerLineage: { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" },
    checkerLineage: { maker: "maker-b", model_id: "model-b", transport: "openai-compatible-http", provider_ref: "provider:b" },
    rounds: 2,
    artifactRefs: [randomUUID(), randomUUID()],
    body: bodyWith(marker),
    reservation: `RESERVATION ${marker}`,
    verdictBasis: VERDICT_BASIS,
    pointNumbers: { "node-1": "P1", "node-2": "P2" }
  };
}

async function answerFor(runId: string, marker: string): Promise<string> {
  const persisted = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`story-fact-${marker}`], residualObjections: [], badges: [],
      conditionMarks: ["DEFECT"], reversalPoint: `story-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    }
  });
  return persisted.answerId;
}

function marker(): string {
  return `STORYMARK${randomUUID().replaceAll("-", "")}`;
}

/** The sealed payload a story row carries, as the repository builds it. */
function storyContent(mark: string): Record<string, unknown> {
  const record = readyRecord(randomUUID(), randomUUID(), mark);
  return {
    body: record.body, reservation: record.reservation,
    verdictBasis: record.verdictBasis, pointNumbers: record.pointNumbers
  };
}

/** An envelope sealed while the run is live, bound to (run, serve.answer_story, storyId). */
async function sealFor(runId: string, storyId: string, mark: string): Promise<{
  readonly envelope: Record<string, unknown>; readonly attestation: Buffer;
}> {
  const sealed = await encryptAttestedContentForRun(
    database.pool, runId, "serve.answer_story", storyId, storyContent(mark)
  );
  if (sealed === null) throw new Error("STORY_TEST_CIPHER_UNCONFIGURED");
  return { envelope: { ...sealed.envelope }, attestation: Buffer.from(sealed.attestation) };
}

/**
 * A direct INSERT that bypasses the repository and its content lease, so the
 * row meets serve.answer_story's triggers with exactly the carrier columns given.
 * Its default outcome is READY_WITH_RESERVATION, the outcome `storyContent`'s
 * payload (a body AND a reservation) belongs to.
 */
function insertRawStory(row: {
  readonly storyId: string;
  readonly runId: string;
  readonly answerId: string;
  readonly content: unknown;
  readonly envelope: unknown;
  readonly attestation: Buffer | null;
  readonly outcome?: string;
  readonly failureCode?: string | null;
}) {
  return database.pool.query(
    `INSERT INTO serve.answer_story (
       story_id, run_id, answer_id, answer_version, outcome, failure_code, shape_id,
       pack_version, pack_fingerprint, storyteller_lineage, checker_lineage, rounds,
       artifact_refs, content, content_ciphertext, content_attestation
     ) VALUES (
       $1,$2,$3,1,$8,$9,'general','2026-09-26.1',$4,NULL,NULL,1,'[]'::jsonb,$5::jsonb,$6::jsonb,$7
     )`,
    [
      row.storyId, row.runId, row.answerId, "f".repeat(64), JSON.stringify(row.content),
      row.envelope === null ? null : JSON.stringify(row.envelope), row.attestation,
      row.outcome ?? "READY_WITH_RESERVATION", row.failureCode ?? null
    ]
  );
}

async function storyCount(answerId: string): Promise<string> {
  return (await database.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM serve.answer_story WHERE answer_id = $1", [answerId]
  )).rows[0]!.count;
}

async function eraseRun(runId: string): Promise<void> {
  // The run's key cleanup intent makes core.run_private_content_is_live false.
  await database.pool.query(
    `INSERT INTO serve.private_run_key_cleanup_intent (
       request_ref,user_id,run_id,requested_at,cleanup_publication_refs
     ) VALUES ($1,$2,$3,now(),'{}')`,
    [randomUUID(), theOwner().userId, runId]
  );
}

describe("serve.answer_story — the encrypted, insert-once story row", () => {
  it("seals an encrypted run's story: no readable column holds any story text", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story repository ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(withRunContentLease(database.pool, [runId], () =>
      repository.insert(readyRecord(runId, answerId, mark)))).resolves.toBe("INSERTED");

    const stored = await database.pool.query<{
      row_text: string; content: unknown; has_envelope: boolean; attestation_bytes: number;
    }>(
      `SELECT to_jsonb(story)::text AS row_text, story.content,
              story.content_ciphertext IS NOT NULL AS has_envelope,
              octet_length(story.content_attestation) AS attestation_bytes
       FROM serve.answer_story AS story WHERE story.answer_id = $1`,
      [answerId]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.row_text).not.toContain(mark);
    expect(stored.rows[0]!.row_text).not.toContain("\"P2\"");
    // The verdict basis is sealed too: none of its code-computed values is readable.
    expect(stored.rows[0]!.row_text).not.toContain(VERDICT_BASIS.trigger);
    expect(stored.rows[0]!.row_text).not.toContain(VERDICT_BASIS.winner_node_id);
    expect(stored.rows[0]!.content).toEqual({ ciphertext: true, v: 1 });
    expect(stored.rows[0]!.has_envelope).toBe(true);
    expect(stored.rows[0]!.attestation_bytes).toBe(32);
  });

  it("round-trips the story, the reservation and the verdict basis for the run's owner", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story roundtrip ${mark}`);
    const answerId = await answerFor(runId, mark);
    const record = readyRecord(runId, answerId, mark);
    const repository = new StoryRepository(database.pool);
    await repository.insert(record);

    const ownership = { ownerRef: theOwner().ownerRef };
    const read = await repository.readForAnswer({ answerId, answerVersion: null, ownership });
    expect(read).toMatchObject({
      runId, answerId, answerVersion: 1, outcome: "READY_WITH_RESERVATION", failureCode: null,
      shapeId: "general", packVersion: "2026-09-26.1", packFingerprint: "f".repeat(64), rounds: 2,
      storytellerLineage: record.storytellerLineage, checkerLineage: record.checkerLineage,
      artifactRefs: record.artifactRefs, reservation: `RESERVATION ${mark}`, verdictBasis: VERDICT_BASIS,
      pointNumbers: { "node-1": "P1", "node-2": "P2" }
    });
    expect(read?.body).toEqual(record.body);
    expect(read?.storyId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(read?.createdAt).toBeInstanceOf(Date);
    await expect(repository.readForAnswer({ answerId, answerVersion: 1, ownership }))
      .resolves.toMatchObject({ answerVersion: 1 });
    await expect(repository.readForAnswer({ answerId, answerVersion: 2, ownership })).resolves.toBeNull();
    // Past PostgreSQL's integer range the answer is "no story", not an out-of-range error.
    await expect(repository.readForAnswer({ answerId, answerVersion: 2_147_483_648, ownership }))
      .resolves.toBeNull();
    await expect(repository.readForAnswer({ answerId, answerVersion: Number.MAX_SAFE_INTEGER, ownership }))
      .resolves.toBeNull();
  });

  it("closes the story to a foreign owner and to a malformed principal", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story foreign ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
    // Positive control: the rightful owner reads it, so every null below is the gate closing.
    await expect(repository.readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    })).resolves.toMatchObject({ answerId, reservation: `RESERVATION ${mark}` });

    await expect(repository.readForAnswer({ answerId, answerVersion: null, ownership: { ownerRef: randomUUID() } }))
      .resolves.toBeNull();
    await expect(repository.readForAnswer({ answerId, answerVersion: null, ownership: { legacyAskerId: "asker:someone" } }))
      .resolves.toBeNull();
    await expect(repository.readForAnswer({ answerId, answerVersion: null, ownership: {} })).resolves.toBeNull();
    await expect(repository.readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef, legacyAskerId: "asker:both" }
    })).resolves.toBeNull();
    await expect(repository.readForAnswer({
      answerId: "not-a-uuid", answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    })).resolves.toBeNull();
  });

  it("is insert-once: a second write for the same answer version is ALREADY_PRESENT and the first stands", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story twice ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
    await expect(repository.insert({
      ...readyRecord(runId, answerId, `${mark}SECOND`),
      outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR", shapeId: null, body: null, reservation: null,
      rounds: 0, pointNumbers: null
    })).resolves.toBe("ALREADY_PRESENT");
    const read = await repository.readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    });
    expect(read?.outcome).toBe("READY_WITH_RESERVATION");
    const count = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.answer_story WHERE answer_id = $1", [answerId]
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("keeps a legacy run's story in plaintext with no envelope, readable by its legacy asker", async () => {
    const mark = marker();
    const askerId = `asker:${mark}`;
    const runId = await createLegacyStoryRun(database.pool, `story legacy ${mark}`, askerId);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
    const stored = await database.pool.query<{ has_envelope: boolean; has_attestation: boolean; row_text: string }>(
      `SELECT story.content_ciphertext IS NOT NULL AS has_envelope,
              story.content_attestation IS NOT NULL AS has_attestation,
              story.content::text AS row_text
       FROM serve.answer_story AS story WHERE story.answer_id = $1`,
      [answerId]
    );
    expect(stored.rows[0]).toMatchObject({ has_envelope: false, has_attestation: false });
    expect(stored.rows[0]!.row_text).toContain(mark);
    await expect(repository.readForAnswer({ answerId, answerVersion: null, ownership: { legacyAskerId: askerId } }))
      .resolves.toMatchObject({
        outcome: "READY_WITH_RESERVATION", reservation: `RESERVATION ${mark}`,
        pointNumbers: { "node-1": "P1", "node-2": "P2" }
      });
  });

  it("refuses a story whose run is not the answer's run", async () => {
    const mark = marker();
    const runId = await createLegacyStoryRun(database.pool, `story owner run ${mark}`, `asker:${mark}`);
    const otherRunId = await createLegacyStoryRun(database.pool, `story other run ${mark}`, `asker:other:${mark}`);
    const answerId = await answerFor(runId, mark);
    await expect(new StoryRepository(database.pool).insert(readyRecord(otherRunId, answerId, mark)))
      .rejects.toThrowError(/ANSWER_STORY_RUN_MISMATCH/u);
  });

  it("refuses an incoherent outcome: typed in the repository, and by the table's own CHECK", async () => {
    const mark = marker();
    const runId = await createLegacyStoryRun(database.pool, `story incoherent ${mark}`, `asker:${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    const refused = { name: "TypedDomainError", code: "STORY_RECORD_INVALID" };
    // The repository refuses both before anything is sealed or sent.
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), failureCode: "STORY_WRITE_REJECTED" }))
      .rejects.toMatchObject(refused);
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark), outcome: "FAILED", failureCode: null, body: null, reservation: null
    })).rejects.toMatchObject(refused);
    expect(await storyCount(answerId)).toBe("0");
    // A writer that skips the repository still meets the table's CHECK.
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: storyContent(mark), envelope: null, attestation: null,
      failureCode: "STORY_WRITE_REJECTED"
    })).rejects.toThrowError(/answer_story_outcome_is_coherent/u);
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: storyContent(mark), envelope: null, attestation: null,
      outcome: "FAILED", failureCode: null
    })).rejects.toThrowError(/answer_story_outcome_is_coherent/u);
    expect(await storyCount(answerId)).toBe("0");
  });

  it("refuses a malformed record BEFORE sealing it: a typed STORY_RECORD_INVALID, and no row", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story malformed ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    const refused = { name: "TypedDomainError", code: "STORY_RECORD_INVALID" };
    // A point number that is not `Pn`: sealed, it could never be read back.
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark), pointNumbers: { "node-1": "P1", "node-2": "Q2" }
    })).rejects.toMatchObject(refused);
    // A body outside the story schema.
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark),
      body: { ...bodyWith(mark), shape_id: "Not A Shape" } as StoryBody
    })).rejects.toMatchObject(refused);
    // The outcome invariants. READY_WITH_RESERVATION needs a non-empty reservation…
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), reservation: null }))
      .rejects.toMatchObject(refused);
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), reservation: "   " }))
      .rejects.toMatchObject(refused);
    // …READY carries a body and no reservation…
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), outcome: "READY" }))
      .rejects.toMatchObject(refused);
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), outcome: "READY", body: null, reservation: null }))
      .rejects.toMatchObject(refused);
    // …and FAILED carries neither a body nor a reservation.
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark), outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", reservation: null
    })).rejects.toMatchObject(refused);
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark), outcome: "FAILED", failureCode: "STORY_WRITE_REJECTED", body: null
    })).rejects.toMatchObject(refused);
    expect(await storyCount(answerId)).toBe("0");
    // Positive control: the same answer takes a well-formed story.
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
  });

  it("reads a stored row that breaks the outcome invariants as STORY_ROW_INVALID", async () => {
    const mark = marker();
    const askerId = `asker:${mark}`;
    const runId = await createLegacyStoryRun(database.pool, `story row invariants ${mark}`, askerId);
    const answerId = await answerFor(runId, mark);
    // Written past the repository: a READY row whose content carries a reservation.
    await insertRawStory({
      storyId: randomUUID(), runId, answerId, content: storyContent(mark), envelope: null, attestation: null,
      outcome: "READY"
    });
    await expect(new StoryRepository(database.pool).readForAnswer({
      answerId, answerVersion: null, ownership: { legacyAskerId: askerId }
    })).rejects.toMatchObject({ name: "TypedDomainError", code: "STORY_ROW_INVALID" });
  });

  it("the attestation guard binds an envelope to its own story row: forged or copied, it is CONTENT_ATTESTATION_INVALID", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story attestation ${mark}`);
    const answerId = await answerFor(runId, mark);
    const storyId = randomUUID();
    const sealed = await sealFor(runId, storyId, mark);
    const ct = String(sealed.envelope.ct);
    const forgedEnvelope = { ...sealed.envelope, ct: `${ct.startsWith("A") ? "B" : "A"}${ct.slice(1)}` };

    // A forged ciphertext under the genuine attestation.
    await expect(insertRawStory({
      storyId, runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: forgedEnvelope,
      attestation: sealed.attestation
    })).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // The genuine envelope under a forged attestation.
    await expect(insertRawStory({
      storyId, runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: sealed.envelope,
      attestation: randomBytes(32)
    })).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // The genuine envelope and attestation, moved to another story id.
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: sealed.envelope,
      attestation: sealed.attestation
    })).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    expect(await storyCount(answerId)).toBe("0");

    // Positive control: the same envelope on its own row is accepted.
    await insertRawStory({
      storyId, runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: sealed.envelope,
      attestation: sealed.attestation
    });
    expect(await storyCount(answerId)).toBe("1");
    // A stored row copied whole under a fresh story id. The guard is a BEFORE
    // INSERT trigger, so it refuses before the one-per-answer-version index is consulted.
    await expect(database.pool.query(
      `INSERT INTO serve.answer_story
       SELECT (jsonb_populate_record(NULL::serve.answer_story, to_jsonb(source)
         || jsonb_build_object('story_id', gen_random_uuid()))).*
       FROM serve.answer_story AS source WHERE source.story_id = $1`,
      [storyId]
    )).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    expect(await storyCount(answerId)).toBe("1");
  });

  it("the plaintext guard refuses readable story content on an encrypted run", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story plaintext ${mark}`);
    const answerId = await answerFor(runId, mark);
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: storyContent(mark), envelope: null, attestation: null
    })).rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve\.answer_story$/u);
    // The sentinel alone, with no envelope behind it, is refused the same way.
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: null, attestation: null
    })).rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve\.answer_story$/u);
    expect(await storyCount(answerId)).toBe("0");
  });

  it("a legacy run's story row may carry no envelope", async () => {
    const mark = marker();
    const legacyRunId = await createLegacyStoryRun(database.pool, `story legacy envelope ${mark}`, `asker:${mark}`);
    const answerId = await answerFor(legacyRunId, mark);
    const encryptedRunId = await createEncryptedStoryRun(database.pool, theOwner(), `story envelope donor ${mark}`);
    const donor = await sealFor(encryptedRunId, randomUUID(), mark);
    await expect(insertRawStory({
      storyId: randomUUID(), runId: legacyRunId, answerId, content: CONTENT_JSON_SENTINEL,
      envelope: donor.envelope, attestation: null
    })).rejects.toThrowError(/^CONTENT_ENCRYPTION_STATE_INVALID: serve\.answer_story$/u);
    // With an attestation too, the attestation guard refuses it first.
    await expect(insertRawStory({
      storyId: randomUUID(), runId: legacyRunId, answerId, content: CONTENT_JSON_SENTINEL,
      envelope: donor.envelope, attestation: donor.attestation
    })).rejects.toThrowError(/^CONTENT_ATTESTATION_STATE_INVALID$/u);
    expect(await storyCount(answerId)).toBe("0");
  });

  it("answers RUN_ERASED, never a throw, once the run's private content is erased; the read closes too", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story erased ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
    // Erase: the run's key cleanup intent makes core.run_private_content_is_live false.
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (
         request_ref,user_id,run_id,requested_at,cleanup_publication_refs
       ) VALUES ($1,$2,$3,now(),'{}')`,
      [randomUUID(), theOwner().userId, runId]
    );
    await expect(repository.insert(readyRecord(runId, answerId, `${mark}AFTER`))).resolves.toBe("RUN_ERASED");
    await expect(repository.readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    })).resolves.toBeNull();
  });

  it("the erasure barrier itself refuses a sealed direct INSERT, with no lease, once the run is erased", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story barrier ${mark}`);
    const answerId = await answerFor(runId, mark);
    const storyId = randomUUID();
    // Sealed while the run is live, so the attestation and plaintext guards
    // (which fire first, by trigger name) accept the row: the refusal below can
    // only be the barrier's own.
    const sealed = await sealFor(runId, storyId, mark);
    await eraseRun(runId);
    await expect(insertRawStory({
      storyId, runId, answerId, content: CONTENT_JSON_SENTINEL, envelope: sealed.envelope,
      attestation: sealed.attestation
    })).rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    expect(await storyCount(answerId)).toBe("0");
  });

  it("is append-only: UPDATE, DELETE and TRUNCATE are refused, owner included", async () => {
    // Each refusal is matched on the guard's OWN text (core.reject_mutation for
    // UPDATE / DELETE, core.reject_truncate for TRUNCATE), so a permission or a
    // syntax error cannot pass as "append-only".
    await expect(database.pool.query("UPDATE serve.answer_story SET rounds = rounds"))
      .rejects.toThrowError(/^append-only or immutable table answer_story rejects UPDATE$/u);
    await expect(database.pool.query("DELETE FROM serve.answer_story"))
      .rejects.toThrowError(/^append-only or immutable table answer_story rejects DELETE$/u);
    await expect(database.pool.query("TRUNCATE serve.answer_story"))
      .rejects.toThrowError(/^TRUNCATE_REJECTED: append-only or immutable table serve\.answer_story rejects TRUNCATE$/u);
  });

  it("0072 widens the spend source to STORY, and a story charge must name its run", async () => {
    const mark = marker();
    const runId = await createLegacyStoryRun(database.pool, `story spend ${mark}`, `asker:${mark}`);
    await database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'STORY',$2,'provider-1',current_date,1,1,1)`,
      [randomUUID(), runId]
    );
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'STORY',NULL,'provider-1',current_date,1,1,1)`,
      [randomUUID()]
    )).rejects.toThrowError(/model_spend_story_charge_names_its_run/u);
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'GIFT',$2,'provider-1',current_date,1,1,1)`,
      [randomUUID(), runId]
    )).rejects.toThrowError(/model_spend_spend_source_check/u);
  });

  // LAST in the file: the replays recreate the triggers, so nothing after this
  // case may rely on the state the earlier cases built.
  it("stays intact and guarded after 0072 and its neighbours are replayed over the finished chain", async () => {
    const directory = new URL("../../migrations/", import.meta.url);
    const before = Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.answer_story"
    )).rows[0]!.count);
    expect(before).toBeGreaterThan(0);
    for (const replayed of [
      "0063_serve_answer_content_carrier.sql",
      "0066_model_spend_ledger.sql",
      "0069_remaining_content_carriers.sql",
      "0072_answer_story.sql",
      "0072_answer_story.sql"
    ]) {
      await expect(database.pool.query(await readFile(new URL(replayed, directory), "utf8")))
        .resolves.toBeDefined();
    }
    await expect(migrate(database.pool)).resolves.toBeUndefined();

    const triggers = await database.pool.query<{ tgname: string; function_name: string; enabled: string }>(
      `SELECT trigger.tgname, trigger.tgfoid::regproc::text AS function_name, trigger.tgenabled AS enabled
       FROM pg_trigger AS trigger
       WHERE trigger.tgrelid = 'serve.answer_story'::regclass AND NOT trigger.tgisinternal
       ORDER BY trigger.tgname`
    );
    expect(triggers.rows).toEqual([
      { tgname: "aaa_enforce_content_attestation_v2", function_name: "core.enforce_content_attestation_v2_answer_story", enabled: "O" },
      { tgname: "enforce_content_ciphertext", function_name: "core.enforce_content_ciphertext_answer_story", enabled: "O" },
      { tgname: "enforce_erasure_barrier", function_name: "core.enforce_erasure_barrier_answer_story", enabled: "O" },
      { tgname: "reject_mutation", function_name: "core.reject_mutation", enabled: "O" },
      { tgname: "reject_truncate", function_name: "core.reject_truncate", enabled: "O" }
    ]);
    const constraints = await database.pool.query<{ table_name: string; conname: string; definition: string }>(
      `SELECT constraint_row.conrelid::regclass::text AS table_name, constraint_row.conname,
              pg_get_constraintdef(constraint_row.oid) AS definition
       FROM pg_constraint AS constraint_row
       WHERE constraint_row.conname IN (
         'answer_story_outcome_is_coherent', 'answer_story_one_per_answer_version',
         'model_spend_spend_source_check', 'model_spend_story_charge_names_its_run',
         'model_spend_run_charge_names_its_run'
       )
       ORDER BY constraint_row.conname`
    );
    expect(constraints.rows.map(({ table_name, conname }) => [table_name, conname])).toEqual([
      ["serve.answer_story", "answer_story_one_per_answer_version"],
      ["serve.answer_story", "answer_story_outcome_is_coherent"],
      ["ledger.model_spend", "model_spend_run_charge_names_its_run"],
      ["ledger.model_spend", "model_spend_spend_source_check"],
      ["ledger.model_spend", "model_spend_story_charge_names_its_run"]
    ]);
    expect(constraints.rows.find((row) => row.conname === "model_spend_spend_source_check")?.definition)
      .toContain("'STORY'::text");

    // Nothing written before the replay moved, and the table still writes, reads and refuses.
    expect(Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.answer_story"
    )).rows[0]!.count)).toBe(before);
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story replay ${mark}`);
    const answerId = await answerFor(runId, mark);
    await expect(insertRawStory({
      storyId: randomUUID(), runId, answerId, content: storyContent(mark), envelope: null, attestation: null
    })).rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve\.answer_story$/u);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert(readyRecord(runId, answerId, mark))).resolves.toBe("INSERTED");
    await expect(repository.readForAnswer({
      answerId, answerVersion: null, ownership: { ownerRef: theOwner().ownerRef }
    })).resolves.toMatchObject({ reservation: `RESERVATION ${mark}` });
  });
});
