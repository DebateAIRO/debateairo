import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { migrate } from "@debateai/db";
import { ServeRepository, buildFactBundle, type ServeGateResult } from "@debateai/serve";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

async function persistAnswer(flag: boolean, supersedes?: { runId: string; workItemId: string; answerId: string }) {
  const runId = supersedes?.runId
    ?? await createEncryptedStoryRun(database.pool, owner, `Persist check ${randomUUID()}?`);
  const workItemId = supersedes?.workItemId ?? await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `synthesis-check:${randomUUID()}`
  });
  const factBundle = buildFactBundle({
    facts: [], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
    reversalPoint: "No firm conclusion", buildsOnPrevious: { value: false, answerRef: null },
    memoryDisclosure: null
  });
  const result: ServeGateResult = {
    terminal: "COMPONENTS_ONLY", answerForm: null, factBundle,
    gateTrace: ["GATE1_R9_BLOCK", "COMPONENTS_ONLY_DEFECT"], conditionMarks: ["DEFECT"],
    conformance: [], coverageMode: "NOT_RUN", segments: [],
    compositionBudget: { tier: "low", bound: 1, registerRowKey: "test:synthesis-check-budget", registerVersion: 1, sourceRef: "test:synthesis-check" },
    confidenceBand: null, bandCeiling: null, digest: null, loopRounds: [],
    standingObjection: null, crashClass: null,
    projections: {
      reversalPoint: factBundle.reversalPoint,
      buildsOnPrevious: factBundle.buildsOnPrevious,
      memoryDisclosure: factBundle.memoryDisclosure
    }
  };
  const persisted = await new ServeRepository(database.pool).persist({
    runId, workItemId, factBundleVersion: 1,
    factBundleContentHash: createHash("sha256").update(JSON.stringify(factBundle)).digest("hex"),
    factBundle, result, segments: [], compositionRawArtifactRef: null, compositionAttempt: 0,
    conformanceRawArtifactRefs: [], servedNumber: null,
    ...(flag ? { synthesisCheckRequest: true as const } : {}),
    ...(supersedes === undefined ? {} : { supersedes: { answerId: supersedes.answerId } })
  });
  return { runId, workItemId, answerId: persisted.answerId, answerVersion: persisted.answerVersion };
}

async function requests(answerId: string) {
  return (await database.pool.query<{ answer_version: number }>(
    `SELECT answer_version FROM serve.synthesis_check_request WHERE answer_id=$1 ORDER BY answer_version`,
    [answerId]
  )).rows.map((row) => row.answer_version);
}

describe("serve persist synthesis check request", () => {
  it("persist with synthesisCheckRequest writes exactly one request for the persisted version, in the same transaction as the answer", async () => {
    const answer = await persistAnswer(true);
    expect(await requests(answer.answerId)).toEqual([answer.answerVersion]);
  });

  it("persist without the flag writes no request", async () => {
    const answer = await persistAnswer(false);
    expect(await requests(answer.answerId)).toEqual([]);
  });

  it("a refused request insert leaves the answer stored and persist resolving as without the flag", async () => {
    await database.pool.query(`CREATE FUNCTION serve.test_refuse_synthesis_request() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_REQUEST_REFUSED'; END $$`);
    await database.pool.query(`CREATE TRIGGER test_refuse_synthesis_request BEFORE INSERT
      ON serve.synthesis_check_request FOR EACH ROW EXECUTE FUNCTION serve.test_refuse_synthesis_request()`);
    try {
      const answer = await persistAnswer(true);
      expect((await database.pool.query(
        `SELECT count(*)::integer AS n FROM serve.answer WHERE answer_id=$1`, [answer.answerId]
      )).rows[0]?.n).toBe(1);
      expect(await requests(answer.answerId)).toEqual([]);
    } finally {
      await database.pool.query(`DROP TRIGGER test_refuse_synthesis_request ON serve.synthesis_check_request`);
      await database.pool.query(`DROP FUNCTION serve.test_refuse_synthesis_request()`);
    }
  });

  it("a superseding version persisted with the flag gets its own request", async () => {
    const first = await persistAnswer(true);
    const second = await persistAnswer(true, first);
    expect(second.answerVersion).toBe(first.answerVersion + 1);
    expect(await requests(first.answerId)).toEqual([first.answerVersion, second.answerVersion]);
  });

  it("a request inserted with the answer does not make the same-version persist fail", async () => {
    await database.pool.query(`CREATE FUNCTION serve.test_early_synthesis_request() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO serve.synthesis_check_request(request_id,run_id,answer_id,answer_version)
        VALUES (gen_random_uuid(),NEW.run_id,NEW.answer_id,NEW.answer_version);
        RETURN NEW;
      END $$`);
    await database.pool.query(`CREATE TRIGGER test_early_synthesis_request AFTER INSERT ON serve.answer
      FOR EACH ROW EXECUTE FUNCTION serve.test_early_synthesis_request()`);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const answer = await persistAnswer(true);
      expect(await requests(answer.answerId)).toEqual([answer.answerVersion]);
      expect((await database.pool.query<{ n: number }>(
        `SELECT count(*)::integer AS n FROM serve.answer WHERE answer_id=$1`, [answer.answerId]
      )).rows[0]?.n).toBe(1);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
      await database.pool.query("DROP TRIGGER test_early_synthesis_request ON serve.answer");
      await database.pool.query("DROP FUNCTION serve.test_early_synthesis_request()");
    }
  });
});
