/**
 * The preview's start-of-debate estimate on a real (embedded) PostgreSQL (review findings 2 and 4,
 * 2026-10-10):
 * - the admission lock is one advisory lock: a second ask waits until the first releases it;
 * - the unfinished-debates read holds a debate still debating (a READY job) and one only writing its
 *   story (answer served, no story row, a model call within the window), and nothing else.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { createPreviewAdmissionLock, PREVIEW_UNFINISHED_RUNS_SQL } from "../../apps/api/src/preview-budget-estimate.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const WINDOW_SECONDS = 3600;
const LABEL_PREFIX = "preview-estimate";
const STORY_SITE = "STORY:STORYTELLER:1";
const commandFor = (runId: string) => `${LABEL_PREFIX}:${runId}`;
const fixtureFor = (label: string) => `${LABEL_PREFIX}-${label}`;
const storySubject = (runId: string) => `story:${runId}`;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterAll(async () => database?.stop());

async function createRun(label: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: `Is the ${label} debate still spending?`,
    principal: { kind: "legacy", legacyAskerId: `asker:${label}` },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-10-10T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: { source: label }, registerVersion: 1, batteryVersion: "preview-estimate", batteryRows: []
  });
}
const readyJob = (runId: string) => new WorkItemRepository(database.pool).enqueue({
  runId, batteryRowId: "Q1", nodeSet: [], commandKey: commandFor(runId)
});
async function servedRun(label: string): Promise<string> {
  const runId = await createRun(label);
  await persistTerminalRun({ pool: database.pool, runId, fixtureKey: fixtureFor(label), factBundle: {
    facts: [`fact:${label}`], residualObjections: [], badges: [], conditionMarks: [],
    reversalPoint: `reversal:${label}`, buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
  } });
  return runId;
}
async function modelCall(runId: string, finishedAt: Date): Promise<void> {
  await new LedgerRepository(database.pool).append({
    runId, actionKind: "MODEL_CALL", subjectItemId: storySubject(runId),
    callSiteKey: STORY_SITE,
    stanceAtAction: "UNASSIGNED", outcome: "OK", actorRef: "preview:fixture-a", inputHash: "fixture-input",
    contractHash: "fixture-contract", startedAt: new Date(finishedAt.getTime() - 1000), finishedAt
  });
}
async function unfinished(storyOn: boolean, windowSeconds = WINDOW_SECONDS): Promise<ReadonlyMap<string, string>> {
  const result = await database.pool.query<{ envelope_basis: { source: string }; phase: string }>(
    PREVIEW_UNFINISHED_RUNS_SQL, [storyOn, windowSeconds]);
  return new Map(result.rows.map((row) => [row.envelope_basis.source, row.phase]));
}

describe("the unfinished debates the estimate holds", () => {
  it("a READY job is DEBATE; a served answer still writing its story is STORY; nothing else is held", async () => {
    await readyJob(await createRun("debating"));
    await modelCall(await servedRun("story-live"), new Date());
    await modelCall(await servedRun("story-stale"), new Date(Date.now() - 2 * WINDOW_SECONDS * 1000));
    await servedRun("served-no-call");
    const failed = await createRun("failed");
    const failedJob = await readyJob(failed);
    await database.pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason='RUN_SETUP_FAILED:DISPATCH' WHERE work_item_id=$1", [failedJob]);
    await createRun("no-job-yet");
    const withStory = await unfinished(true);
    expect(withStory.get("debating")).toBe("DEBATE");
    expect(withStory.get("story-live")).toBe("STORY");
    for (const label of ["story-stale", "served-no-call", "failed", "no-job-yet"]) expect(withStory.has(label)).toBe(false);
    // No story in the register: only debates still debating.
    const withoutStory = await unfinished(false);
    expect(withoutStory.get("debating")).toBe("DEBATE");
    expect(withoutStory.has("story-live")).toBe(false);
  });

  it("a story row ends the hold", async () => {
    const runId = await servedRun("story-written");
    await modelCall(runId, new Date());
    expect((await unfinished(true)).get("story-written")).toBe("STORY");
    const answer = await database.pool.query<{ answer_id: string; answer_version: number }>(
      "SELECT answer_id, answer_version FROM serve.answer WHERE run_id=$1", [runId]);
    await database.pool.query(
      `INSERT INTO serve.answer_story (story_id, run_id, answer_id, answer_version, outcome, failure_code, rounds, artifact_refs, content)
       VALUES ($1,$2,$3,$4,'FAILED','STORY_FIXTURE_FAILED',0,'[]'::jsonb,'{}'::jsonb)`,
      [randomUUID(), runId, answer.rows[0]!.answer_id, answer.rows[0]!.answer_version]);
    expect((await unfinished(true)).has("story-written")).toBe(false);
  });
});

describe("the admission lock", () => {
  it("a second ask waits for the first to release; each release frees its connection", async () => {
    const first = createPreviewAdmissionLock(database.pool);
    const second = createPreviewAdmissionLock(database.pool);
    await first.acquire();
    let secondHeld = false;
    const waiting = second.acquire().then(() => { secondHeld = true; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondHeld).toBe(false);
    await first.release();
    await waiting;
    expect(secondHeld).toBe(true);
    await second.release();
    const third = createPreviewAdmissionLock(database.pool);
    await third.acquire();
    await third.release();
  });
});
