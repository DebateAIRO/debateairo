import { describe, expect, it } from "vitest";
import type { Pool } from "@debateai/db";
import { StoryRepository, type StoryRecordInput } from "@debateai/story";

/**
 * Engine redesign R1d (INTERFACE §5.3, deviation 13): the backup storyteller's record is an optional, strict member of the
 * story's SEALED content (`StoredStoryContentSchema`, packages/story/src/repository.ts), never a readable column. The schema
 * is module-private, so this file reaches it through `insert`'s parse-before-seal, which refuses a bad record before the
 * pool is touched. The round trip and an old row without the member are `tests/integration/story-repository.test.ts`.
 */
const RECORD: StoryRecordInput = Object.freeze({
  runId: "33333333-3333-4333-8333-333333333333",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  outcome: "FAILED",
  failureCode: "STORY_TRANSPORT_DEATH",
  shapeId: null,
  packVersion: null,
  packFingerprint: null,
  storytellerLineage: null,
  checkerLineage: null,
  rounds: 0,
  artifactRefs: Object.freeze([]),
  body: null,
  reservation: null,
  verdictBasis: null,
  pointNumbers: null,
  languageTag: null,
  storytellerRepairs: null
});

function untouchablePool() {
  const touched = { count: 0 };
  const refuse = async (): Promise<never> => {
    touched.count += 1;
    throw new Error("POOL_TOUCHED");
  };
  return { pool: { query: refuse, connect: refuse } as unknown as Pool, touched };
}

describe("the story row's sealed backup record (engine redesign R1d)", () => {
  it.each([
    ["an unknown signal", { code: "STORY_BACKUP_USED", signal: "MONEY", firstModel: "provider:a" }],
    ["a member the record does not name", { code: "STORY_BACKUP_USED", signal: "TOO_SLOW", firstModel: "provider:a", reason: "slow" }],
    ["another code", { code: "STORY_BACKUP_SKIPPED", signal: "TOO_SLOW", firstModel: "provider:a" }],
    ["an empty first model", { code: "STORY_BACKUP_USED", signal: "TOO_SLOW", firstModel: "" }],
    ["no first model", { code: "STORY_BACKUP_USED", signal: "TOO_SLOW" }]
  ])("refuses %s, typed and before the pool is touched", async (_label, backup) => {
    const { pool, touched } = untouchablePool();
    const record = { ...RECORD, backup } as unknown as StoryRecordInput;
    await expect(new StoryRepository(pool).insert(record)).rejects.toMatchObject({ code: "STORY_RECORD_INVALID" });
    await expect(new StoryRepository(pool).insert(record)).rejects.toThrow(/declared shape: backup$/u);
    expect(touched.count).toBe(0);
  });

  it("accepts each of the four signals and a record without the member: the parse passes and the pool is reached", async () => {
    for (const signal of ["UNREACHABLE", "TOO_SLOW", "OUT_OF_ROOM", "UNUSABLE"] as const) {
      const { pool, touched } = untouchablePool();
      const record: StoryRecordInput = { ...RECORD, backup: { code: "STORY_BACKUP_USED", signal, firstModel: "provider:a" } };
      await expect(new StoryRepository(pool).insert(record)).rejects.not.toMatchObject({ code: "STORY_RECORD_INVALID" });
      expect(touched.count).toBeGreaterThan(0);
    }
    const { pool, touched } = untouchablePool();
    await expect(new StoryRepository(pool).insert(RECORD)).rejects.not.toMatchObject({ code: "STORY_RECORD_INVALID" });
    expect(touched.count).toBeGreaterThan(0);
  });
});
