import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoryBodySchema, type StoryBody, type StoryVerdictBasis } from "@debateai/contract";
import { migrate, withRunContentLease } from "@debateai/db";
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
  });

  it("closes the story to a foreign owner and to a malformed principal", async () => {
    const mark = marker();
    const runId = await createEncryptedStoryRun(database.pool, theOwner(), `story foreign ${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await repository.insert(readyRecord(runId, answerId, mark));

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

  it("refuses an incoherent outcome", async () => {
    const mark = marker();
    const runId = await createLegacyStoryRun(database.pool, `story incoherent ${mark}`, `asker:${mark}`);
    const answerId = await answerFor(runId, mark);
    const repository = new StoryRepository(database.pool);
    await expect(repository.insert({ ...readyRecord(runId, answerId, mark), failureCode: "STORY_WRITE_REJECTED" }))
      .rejects.toThrowError(/answer_story_outcome_is_coherent/u);
    await expect(repository.insert({
      ...readyRecord(runId, answerId, mark), outcome: "FAILED", failureCode: null
    })).rejects.toThrowError(/answer_story_outcome_is_coherent/u);
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
});
