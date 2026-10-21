import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, RunWaitRepository } from "@debateai/db";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 — RE-ADMISSION, the database half. Plan C task C10: a waiting debate's
 * stored ask is read back whole (`RunRepository.readStoredAsk`, under the run's content lease, decrypted like
 * `readFrozenHead`), and the waker's line carries each run's own release (`WaitingRun.releaseKey`), so the API can tell
 * a run another release admitted. C11 extends this file with the START that re-admits. Over embedded Postgres and
 * migration 0123, with the content cipher configured (tests/support/contentRunFixture.ts). CI skips this directory; run
 * it alone.
 */
let fixture: ContentRunFixture;

beforeAll(async () => {
  fixture = await startContentRunFixture("side-by-side-c10");
}, 600_000);

afterAll(async () => {
  await fixture?.stop();
});

describe("RunRepository.readStoredAsk (side-by-side C10)", () => {
  it("reads a legacy-principal run's question and contract unchanged, with its stamp and stored choices", async () => {
    const question = "Should a legacy run keep its question when it is re-admitted?";
    const runId = await fixture.createLegacyRun(question, { releaseKey: TEST_RELEASE_KEY });
    const stored = await new RunRepository(fixture.database.pool).readStoredAsk(runId);
    const row = (await fixture.database.pool.query<{ asker_id: string; session_id: string }>(
      "SELECT asker_id, session_id FROM core.run WHERE run_id = $1", [runId]
    )).rows[0]!;
    expect(stored).toEqual({
      runId,
      releaseKey: TEST_RELEASE_KEY,
      registerVersion: 1,
      questionLine: question,
      askContract: { audience: "side-by-side-c10" },
      askerId: row.asker_id,
      sessionId: row.session_id,
      callerScope: "ASKER",
      asOf: new Date("2026-09-26T00:00:00.000Z"),
      askerRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "side-by-side-c10:integration",
      compositionBudgetTier: "low",
      planTier: null,
      depthParams: { depth: 1 },
      argumentLanguageTag: "und",
      argumentLanguageName: "the same language as the question",
      contentEncrypted: false
    });
    expect(row.asker_id.startsWith("legacy-side-by-side-c10-")).toBe(true);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it("decrypts an encrypted server run: the plaintext question and contract, contentEncrypted true", async () => {
    const question = "Should an encrypted run be read back in plain words for its re-admission?";
    const runId = await fixture.createEncryptedRun(question, { releaseKey: TEST_RELEASE_KEY });
    const columns = (await fixture.database.pool.query<{ question_line: string }>(
      "SELECT question_line FROM core.run WHERE run_id = $1", [runId]
    )).rows[0]!;
    expect(columns.question_line).not.toBe(question);
    const stored = await new RunRepository(fixture.database.pool).readStoredAsk(runId);
    expect(stored).toMatchObject({
      runId, releaseKey: TEST_RELEASE_KEY, questionLine: question, askContract: { audience: "side-by-side-c10" },
      askerId: `owner:${fixture.ownerRef}`, contentEncrypted: true
    });
  });

  it("returns null for a run that does not exist", async () => {
    await expect(new RunRepository(fixture.database.pool).readStoredAsk(randomUUID())).resolves.toBeNull();
  });
});

describe("WaitingRun.releaseKey (side-by-side C10)", () => {
  it("a run read through wakeCandidates carries its own release key", async () => {
    const runId = await fixture.createLegacyRun("Which release admitted this waiting run?", { releaseKey: TEST_RELEASE_KEY });
    const legacy = await fixture.createLegacyRun("And this one, written before any stamp?");
    const waits = new RunWaitRepository(fixture.database.pool);
    const client = await fixture.database.pool.connect();
    try {
      await client.query("BEGIN");
      await waits.enterWait(client, runId, new Date("2026-10-22T08:00:00.000Z"));
      await waits.enterWait(client, legacy, new Date("2026-10-22T08:00:01.000Z"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const line = await waits.wakeCandidates({ now: new Date("2026-10-22T09:00:00.000Z"), after: null, limit: 100, everyPerson: true });
    const keys = new Map(line.map((run) => [run.runId, run.releaseKey]));
    expect(keys.get(runId)).toBe(TEST_RELEASE_KEY);
    expect(keys.get(legacy)).toBe("legacy");
  });
});
