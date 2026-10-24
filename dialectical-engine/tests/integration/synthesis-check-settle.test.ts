import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { migrate, withRunContentLease } from "@debateai/db";
import { ServeRepository, SynthesisCheckRepository, buildFactBundle, type ServeGateResult } from "@debateai/serve";
import { SynthesisCheckWorker } from "../../apps/api/src/synthesis-check/worker.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";

type Answer = { runId: string; workItemId: string; answerId: string; answerVersion: number };
let database: TestDatabase;
let owner: StoryEncryptedOwner;
let runnerSource: string;

beforeAll(async () => {
  runnerSource = await readFile("apps/runner/src/index.ts", "utf8");
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function requestFlag(site: "settlement" | "catch-up"): boolean {
  const start = site === "settlement"
    ? runnerSource.indexOf("this.#serve.persist({")
    : runnerSource.indexOf("persist: async () => serve.persist({");
  const end = site === "settlement"
    ? runnerSource.indexOf("    // Task M3", start)
    : runnerSource.indexOf("          supersedes: { answerId }", start);
  if (start < 0 || end < 0) throw new Error(`RUNNER_PERSIST_SITE_MISSING: ${site}`);
  return /\bsynthesisCheckRequest:\s*true\b/u.test(runnerSource.slice(start, end));
}

async function persistAnswer(site: "settlement" | "catch-up", previous?: Answer): Promise<Answer> {
  const runId = previous?.runId
    ?? await createEncryptedStoryRun(database.pool, owner, `Settle check ${randomUUID()}?`);
  const workItemId = previous?.workItemId ?? await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `synthesis-settle:${randomUUID()}`
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
    ...(requestFlag(site) ? { synthesisCheckRequest: true as const } : {}),
    ...(previous === undefined ? {} : { supersedes: { answerId: previous.answerId } })
  });
  return { runId, workItemId, answerId: persisted.answerId, answerVersion: persisted.answerVersion };
}

async function settle(answer: Answer): Promise<void> {
  expect(await new WorkItemRepository(database.pool).settle({
    workItemId: answer.workItemId, attemptId: randomUUID(), artifactRef: answer.answerId
  })).toBe(true);
}

async function settleAndStartStory(
  answer: Answer,
  storyWriter: { writeAfterSettle(): Promise<void> }
): Promise<{ storyCompletion: Promise<void> }> {
  await settle(answer);
  return { storyCompletion: storyWriter.writeAfterSettle() };
}

async function requestVersions(answerId: string): Promise<number[]> {
  const rows = await database.pool.query<{ answer_version: number }>(
    "SELECT answer_version FROM serve.synthesis_check_request WHERE answer_id=$1 ORDER BY answer_version",
    [answerId]
  );
  return rows.rows.map((row) => row.answer_version);
}

async function claimFor(answerId: string) {
  return (await new SynthesisCheckRepository(database.pool).claimNextRequests(100, 60_000))
    .filter((claim) => claim.answerId === answerId);
}

describe("synthesis check request at settlement", () => {
  it("a won settlement writes exactly one request for the served answer version, and the review catch-up's later version gets its own", async () => {
    const first = await persistAnswer("settlement");
    await settle(first);
    const later = await persistAnswer("catch-up", first);
    expect(later.answerVersion).toBe(first.answerVersion + 1);
    expect(await requestVersions(first.answerId)).toEqual([first.answerVersion, later.answerVersion]);
  });

  it("a lost settlement's and a TERMINAL_FAILED run's requests are never claimed: no attempt and no result", async () => {
    const loser = await persistAnswer("settlement");
    expect(await new WorkItemRepository(database.pool).settle({
      workItemId: loser.workItemId, attemptId: randomUUID(), artifactRef: randomUUID()
    })).toBe(true);
    const failed = await persistAnswer("settlement");
    expect(await new WorkItemRepository(database.pool).recordTerminalFailure({
      runId: failed.runId, workItemId: failed.workItemId, reason: "TERMINAL_FAILED"
    })).toBe(true);
    expect(await requestVersions(loser.answerId)).toEqual([loser.answerVersion]);
    expect(await requestVersions(failed.answerId)).toEqual([failed.answerVersion]);
    expect(await claimFor(loser.answerId)).toEqual([]);
    expect(await claimFor(failed.answerId)).toEqual([]);
    const rows = await database.pool.query<{ attempts: string; results: string }>(
      `SELECT (SELECT count(*)::text FROM serve.synthesis_check_attempt WHERE answer_id IN ($1,$2)) AS attempts,
              (SELECT count(*)::text FROM serve.synthesis_check_result WHERE answer_id IN ($1,$2)) AS results`,
      [loser.answerId, failed.answerId]
    );
    expect(rows.rows[0]).toEqual({ attempts: "0", results: "0" });
  });

  it("two lost answer versions in one run leave both requests unclaimed", async () => {
    const first = await persistAnswer("settlement");
    const second = await persistAnswer("catch-up", first);
    expect(second.answerVersion).toBe(2);
    expect(await new WorkItemRepository(database.pool).settle({
      workItemId: first.workItemId, attemptId: randomUUID(), artifactRef: randomUUID()
    })).toBe(true);
    expect(await requestVersions(first.answerId)).toEqual([1, 2]);
    expect(await claimFor(first.answerId)).toEqual([]);
    const counts = await database.pool.query<{ attempts: number; results: number }>(
      `SELECT (SELECT count(*)::integer FROM serve.synthesis_check_attempt WHERE answer_id=$1) AS attempts,
              (SELECT count(*)::integer FROM serve.synthesis_check_result WHERE answer_id=$1) AS results`,
      [first.answerId]
    );
    expect(counts.rows[0]).toEqual({ attempts: 0, results: 0 });
  });

  it("a refused request insert leaves the result COMPLETED and the answer, label, story and work item unchanged", async () => {
    const failures: string[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      failures.push(String(message));
    });
    await database.pool.query(`CREATE FUNCTION serve.test_refuse_settle_request() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_REQUEST_REFUSED'; END $$`);
    await database.pool.query(`CREATE TRIGGER test_refuse_settle_request BEFORE INSERT
      ON serve.synthesis_check_request FOR EACH ROW EXECUTE FUNCTION serve.test_refuse_settle_request()`);
    try {
      const answer = await persistAnswer("settlement");
      await settle(answer);
      expect(failures.some((entry) => entry.includes('"event":"synthesis_check_request_failed"'))).toBe(true);
      expect(await requestVersions(answer.answerId)).toEqual([]);
      const rows = await database.pool.query<{ state: string; settled_artifact_ref: string; terminal: string }>(
        `SELECT work.state,work.settled_artifact_ref,answer.terminal
         FROM core.work_item AS work JOIN serve.answer AS answer ON answer.work_item_id=work.work_item_id
         WHERE work.work_item_id=$1`, [answer.workItemId]
      );
      expect(rows.rows[0]).toEqual({ state: "DONE", settled_artifact_ref: answer.answerId, terminal: "COMPONENTS_ONLY" });
    } finally {
      logged.mockRestore();
      await database.pool.query("DROP TRIGGER test_refuse_settle_request ON serve.synthesis_check_request");
      await database.pool.query("DROP FUNCTION serve.test_refuse_settle_request()");
    }
  });

  it("a timed-out worker check does not delay a same-run later version or another run's settlement", async () => {
    const first = await persistAnswer("settlement");
    await settle(first);
    let sent!: () => void;
    const packetSent = new Promise<void>((resolve) => { sent = resolve; });
    const repository = new SynthesisCheckRepository(database.pool);
    const serve = new ServeRepository(database.pool);
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) =>
        withRunContentLease(database.pool, [runId], use),
      readAnswer: async (runId, answerId, version, ownerRef) => {
        if (runId !== first.runId) return null;
        const stored = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version);
        return stored === null ? null : { ...stored, serve_state: "COMPOSED" as const,
          composed_text: [{ segment_id: randomUUID(), text: "A conclusion", load_bearing: true,
            served_number_refs: [] }] };
      },
      check: { port: () => ({ providerRef: "anthropic", modelId: "claude-haiku-5-5",
        complete: async () => { sent(); return new Promise<{ text: string }>(() => {}); } }),
        deadlineMs: 1_500, recordSpend: async () => {},
        priceOf: () => ({ inputUsdPerM: "0.10", outputUsdPerM: "0.50" }),
        clock: () => new Date(), log: () => {} },
      deadlineMs: 1_500, log: () => {}
    });
    const running = worker.runOnce();
    await packetSent;
    const started = performance.now();
    const later = await persistAnswer("catch-up", first);
    const other = await persistAnswer("settlement");
    await settle(other);
    expect(performance.now() - started).toBeLessThan(1_500);
    expect(await requestVersions(first.answerId)).toEqual([1, 2]);
    expect(await requestVersions(other.answerId)).toEqual([1]);
    await running;
    expect((await repository.readRecords({ ...first, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
  }, 60_000);

  it("the worker stores a check while a post-settlement story callback remains pending", async () => {
    const answer = await persistAnswer("settlement");
    let signalStoryStarted!: () => void;
    const storyStarted = new Promise<void>((resolve) => { signalStoryStarted = resolve; });
    let releaseStory!: () => void;
    const storyPending = new Promise<void>((resolve) => { releaseStory = resolve; });
    let storyFinished = false;
    const storyWriter = { writeAfterSettle: vi.fn(async () => {
      const row = await database.pool.query<{ state: string }>(
        "SELECT state FROM core.work_item WHERE work_item_id=$1", [answer.workItemId]
      );
      expect(row.rows[0]?.state).toBe("DONE");
      signalStoryStarted();
      await storyPending;
      storyFinished = true;
    }) };
    const { storyCompletion } = await settleAndStartStory(answer, storyWriter);
    expect(storyWriter.writeAfterSettle).toHaveBeenCalledOnce();
    await storyStarted;
    const repository = new SynthesisCheckRepository(database.pool);
    const serve = new ServeRepository(database.pool);
    const worker = new SynthesisCheckWorker({
      repository, erasure: { reconcile: async () => [] },
      withContentLease: <T>(runId: string, use: () => Promise<T>) =>
        withRunContentLease(database.pool, [runId], use),
      readAnswer: (runId, answerId, version, ownerRef) => runId === answer.runId
        ? serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, version) : Promise.resolve(null),
      check: { port: () => null, deadlineMs: 60_000, recordSpend: async () => {},
        priceOf: () => null, clock: () => new Date(), log: () => {} },
      deadlineMs: 60_000, log: () => {}
    });
    await worker.runOnce();
    expect((await repository.readRecords({ ...answer, maxVersion: 1 }))[0]?.outcome)
      .toEqual({ verdict: "NO_SYNTHESIS", categories: [] });
    expect(storyFinished).toBe(false);
    releaseStory();
    await storyCompletion;
    expect(storyFinished).toBe(true);
  });
});
