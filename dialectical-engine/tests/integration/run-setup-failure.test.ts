import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { WorkItemRepository } from "@debateai/battery";
import { migrate } from "@debateai/db";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { ServeRepository } from "@debateai/serve";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import {
  createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase
} from "../support/testDatabase.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";

/**
 * `submit` writes the run row first and then, outside that write, records the
 * memory question, queues the run's first job and hands it to the job system.
 * Before this fix a throw in any of those later steps answered the asker 500 and
 * left the run behind with no job: nothing ever queues one (only `submit` does,
 * start-up recovery re-sends only existing jobs, the scheduler never sweeps
 * runs), yet the owner's list showed the run as generating, forever.
 *
 * Each step is broken here by the real database or a dispatcher that throws, and
 * every assertion reads the rows the owner's pages read.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => {
  await database?.stop();
});

const settings: RunCreationSettings = {
  strangerSampleRate: 0,
  registerVersion: 1,
  batteryVersion: "run-setup-failure-test",
  settlementWatchHandle: "run-setup-failure-test",
  resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
    provider_ref: `provider:run-setup-failure:${String(index + 1)}`,
    maker: `maker:run-setup-failure:${String(index + 1)}`,
    model_id: modelId,
    probe_evidence_ref: randomUUID(),
    probed_at: "2026-09-28T00:00:00.000Z"
  })),
  resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
  resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
    effectiveRiskTier,
    tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY",
    tierProvenanceRef
  })
};

const ask: AskRequest = {
  question_line: "Should cities make public transport free at the point of use?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:run-setup-failure",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "run setup failure integration test",
  as_of: "2026-09-28T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

function submitAs(askerId: string, dispatcher: Dispatcher): Promise<unknown> {
  const application = new PostgresAskApplication(
    database.pool,
    dispatcher,
    settings,
    undefined,
    database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
  );
  const session = {
    asker_id: askerId,
    session_id: `session:run-setup-failure:${randomUUID()}`,
    caller_scope: "ASKER",
    ownership_provenance: "user_dev_token",
    provisional_identity_model: true
  } as unknown as Session;
  return application.submit(ask, session, { kind: "legacy", legacyAskerId: askerId });
}

/** The asker's one run, found by owner: `submit` threw, so it never returned the id. */
async function onlyRunOf(askerId: string): Promise<string> {
  const runs = await database.pool.query<{ run_id: string }>(
    "SELECT run_id FROM core.run WHERE core.run_is_owned_by(run_id,NULL,$1)", [askerId]
  );
  expect(runs.rows).toHaveLength(1);
  return runs.rows[0]!.run_id;
}

async function jobsOf(runId: string): Promise<readonly { state: string; terminal_reason: string | null }[]> {
  const jobs = await database.pool.query<{ state: string; terminal_reason: string | null }>(
    "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1 ORDER BY created_at_seq", [runId]
  );
  return jobs.rows;
}

/** The row the owner's list shows for a run that has no answer yet. */
async function openRunRow(askerId: string, runId: string): Promise<unknown> {
  const index = await new ServeRepository(database.pool)
    .readAnswerIndex({ ownerRef: null, legacyAskerId: askerId }, 10, 0);
  return index.open_runs.find((row) => row.run_ref === runId);
}

async function isDispatchable(runId: string): Promise<boolean> {
  const dispatchable = await new WorkItemRepository(database.pool).listDispatchable(1_000);
  return dispatchable.some((item) => item.runId === runId);
}

/**
 * Makes the database refuse one insert for this asker's runs only, so the rest
 * of the file (and the step under test's neighbours) keep working. Dropped in
 * `finally` by the caller.
 */
async function refuseInsert(input: {
  readonly name: string;
  readonly table: "memory.question_key" | "core.work_item";
  readonly askerId: string;
  readonly when: string;
  readonly message: string;
}): Promise<() => Promise<void>> {
  const fn = `test_refuse_${input.name}`;
  await database.pool.query(`
    CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF core.run_is_owned_by(NEW.run_id, NULL, '${input.askerId}') AND (${input.when}) THEN
        RAISE EXCEPTION '${input.message}';
      END IF;
      RETURN NEW;
    END;
    $$`);
  await database.pool.query(`
    CREATE TRIGGER ${fn} BEFORE INSERT ON ${input.table}
    FOR EACH ROW EXECUTE FUNCTION public.${fn}()`);
  return async () => {
    await database.pool.query(`DROP TRIGGER IF EXISTS ${fn} ON ${input.table}`);
    await database.pool.query(`DROP FUNCTION IF EXISTS public.${fn}()`);
  };
}

describe("a run whose setup fails after it was created", () => {
  it("is marked FAILED when the memory question cannot be recorded, before any job exists", async () => {
    const askerId = `asker:setup-memory:${randomUUID()}`;
    const dispatched: string[] = [];
    const restore = await refuseInsert({
      name: "memory", table: "memory.question_key", askerId,
      when: "true", message: "test: memory question refused"
    });
    try {
      await expect(submitAs(askerId, { dispatch: async ({ runId }) => { dispatched.push(runId); } }))
        .rejects.toThrow("test: memory question refused");
    } finally {
      await restore();
    }

    const runId = await onlyRunOf(askerId);
    expect(await jobsOf(runId)).toEqual([
      { state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:MEMORY_QUESTION" }
    ]);
    expect(await openRunRow(askerId, runId)).toMatchObject({
      state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:MEMORY_QUESTION"
    });
    expect(dispatched).toEqual([]);
    expect(await isDispatchable(runId)).toBe(false);
  });

  it("is marked FAILED when its first job cannot be queued", async () => {
    const askerId = `asker:setup-queue:${randomUUID()}`;
    const restore = await refuseInsert({
      name: "queue", table: "core.work_item", askerId,
      when: "NEW.state = 'READY'", message: "test: work queue refused"
    });
    try {
      await expect(submitAs(askerId, { dispatch: async () => undefined }))
        .rejects.toThrow("test: work queue refused");
    } finally {
      await restore();
    }

    const runId = await onlyRunOf(askerId);
    expect(await jobsOf(runId)).toEqual([
      { state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:WORK_QUEUE" }
    ]);
    expect(await openRunRow(askerId, runId)).toMatchObject({
      state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:WORK_QUEUE"
    });
  });

  it("fails its queued job when dispatch throws, so start-up recovery never starts a debate the asker was told failed", async () => {
    const askerId = `asker:setup-dispatch:${randomUUID()}`;
    await expect(submitAs(askerId, {
      dispatch: async () => { throw new Error("test: job system unreachable"); }
    })).rejects.toThrow("test: job system unreachable");

    const runId = await onlyRunOf(askerId);
    expect(await jobsOf(runId)).toEqual([
      { state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:DISPATCH" }
    ]);
    expect(await openRunRow(askerId, runId)).toMatchObject({
      state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:DISPATCH"
    });
    expect(await isDispatchable(runId)).toBe(false);
  });

  it("leaves a job alone that a runner already claimed before dispatch reported its error", async () => {
    const askerId = `asker:setup-claimed:${randomUUID()}`;
    const work = new WorkItemRepository(database.pool);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls: unknown[][];
    try {
      await expect(submitAs(askerId, {
        // The job system took the job and a runner claimed it, then the answer
        // to the API was lost: the debate is running and must not be failed.
        dispatch: async ({ workItemId }) => {
          expect(await work.claimById({ workItemId, workerId: "runner:setup-claimed", claimSeconds: 60 }))
            .not.toBeNull();
          throw new Error("test: dispatch answer lost");
        }
      })).rejects.toThrow("test: dispatch answer lost");
    } finally {
      calls = [...logged.mock.calls];
      logged.mockRestore();
    }

    const runId = await onlyRunOf(askerId);
    expect(await jobsOf(runId)).toEqual([{ state: "CLAIMED", terminal_reason: null }]);
    // Left alone on purpose, not refused by the table's claim rule: no false
    // "could not record" alarm reaches the operator.
    expect(calls).toEqual([]);
  });

  it("still answers with the original error, and names the run in the log, when the failure cannot be recorded either", async () => {
    const askerId = `asker:setup-unrecorded:${randomUUID()}`;
    const restoreQueue = await refuseInsert({
      name: "unrecorded_queue", table: "core.work_item", askerId,
      when: "NEW.state = 'READY'", message: "test: work queue refused"
    });
    const restoreRecord = await refuseInsert({
      name: "unrecorded_record", table: "core.work_item", askerId,
      when: "NEW.state = 'FAILED'", message: "test: failure record refused"
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls: unknown[][];
    try {
      await expect(submitAs(askerId, { dispatch: async () => undefined }))
        .rejects.toThrow("test: work queue refused");
    } finally {
      // Copied first: restoring the spy also clears what it recorded.
      calls = [...logged.mock.calls];
      logged.mockRestore();
      await restoreRecord();
      await restoreQueue();
    }

    const runId = await onlyRunOf(askerId);
    expect(await jobsOf(runId)).toEqual([]);
    const lines = calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toEqual([{
      event: "api.run.setup_failure_unrecorded",
      runId,
      reason: "RUN_SETUP_FAILED:WORK_QUEUE",
      diagnostic: expect.any(String)
    }]);
    // Ids and codes only: neither error's text reaches the log.
    expect(JSON.stringify(lines)).not.toMatch(/test: /);
  });
});
