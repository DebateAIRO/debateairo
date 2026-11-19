import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, createPool, migrate } from "@debateai/db";
import { PREVIEW_ACCOUNT_RUNS_SQL, PREVIEW_TEAM_RUNS_SQL } from "@debateai/providers";
import {
  postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork
} from "../../apps/runner/src/runner-preview-team-gate.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * PREVIEW_ASKS_OPEN_TO over embedded Postgres: with asks open the API's waker, its stalled-start re-send and the
 * runner's start-up gate keep only the runs ANY account owns (PREVIEW_ACCOUNT_RUNS_SQL), by the team query's own owner
 * rule, so a legacy asker's run is still recorded FAILED. Read as the live runner's own login (a system twin of
 * debateai_runtime, as tests/integration/runner-preview-team-gate.test.ts) and compared with the team query given every
 * account's id. CI skips this directory; run it by hand.
 */
const RELEASE = ["r1", "aaaaaaaaaaaa"].join("-");
let database: TestDatabase;
let runner: Pool;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runner = createPool(await createSystemTwin(database, "lock_asks_runner_runtime", ["debateai_runtime"]));
}, 600_000);

afterAll(async () => {
  await runner?.end();
  await database?.stop();
});

async function account(): Promise<Readonly<{ userId: string; ownerRef: string }>> {
  const userId = randomUUID(), ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `lock-asks-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return { userId, ownerRef };
}

/** A run with its first job READY; owned by `ownerRef` through an ownership event, or a legacy asker's run when null. */
async function runWithJob(ownerRef: string | null): Promise<Readonly<{ runId: string; workItemId: string }>> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does an open preview still refuse a debate no account owns?",
    principal: { kind: "legacy", legacyAskerId: `lock-asks:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: [], releaseKey: RELEASE
  });
  if (ownerRef !== null) await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
  });
  return { runId, workItemId };
}

/**
 * An older run's form: no ownership event, its owner only in an `owner:` asker id. Product code cannot write that asker
 * id through a legacy principal, so the fixture sets it directly, with the row triggers off for this one statement.
 */
async function withAskerId(runId: string, askerId: string): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query("UPDATE core.run SET asker_id = $2 WHERE run_id = $1", [runId, askerId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function accountRuns(pool: Pool, runIds: readonly string[]): Promise<readonly string[]> {
  return (await pool.query<{ run_id: string }>(PREVIEW_ACCOUNT_RUNS_SQL, [[...runIds]])).rows.map((row) => row.run_id).sort();
}

async function teamRunsOfEveryAccount(pool: Pool, runIds: readonly string[]): Promise<readonly string[]> {
  const everyone = (await database.pool.query<{ user_id: string }>(`SELECT user_id::text AS user_id FROM identity."user"`)).rows.map((row) => row.user_id);
  return [...new Set((await pool.query<{ run_id: string }>(PREVIEW_TEAM_RUNS_SQL, [[...runIds], everyone])).rows.map((row) => row.run_id))].sort();
}

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null }>(
    "SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1", [workItemId]
  )).rows[0];
}

describe("PREVIEW_ACCOUNT_RUNS_SQL, as the runner's login", () => {
  beforeEach(async () => {
    await database.pool.query(
      "UPDATE core.work_item SET state='FAILED', claimed_by=NULL, claim_deadline=NULL, terminal_reason='TEST_CASE_CLOSED' WHERE state IN ('READY','CLAIMED')"
    );
  });

  it("keeps every account's run and no legacy asker's run, exactly as the team query given every account", async () => {
    const [first, second] = [await account(), await account()];
    const firstRun = await runWithJob(first.ownerRef);
    const secondRun = await runWithJob(second.ownerRef);
    const legacy = await runWithJob(null);
    // Ownership moved: the latest event decides.
    const moved = await runWithJob(first.ownerRef);
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [moved.runId, second.ownerRef]);
    const ids = [firstRun.runId, secondRun.runId, legacy.runId, moved.runId];
    expect(await accountRuns(runner, ids)).toEqual([firstRun.runId, secondRun.runId, moved.runId].sort());
    expect(await accountRuns(runner, ids)).toEqual(await teamRunsOfEveryAccount(runner, ids));
    expect(await accountRuns(runner, [])).toEqual([]);
  });

  it("reads an owner: asker id only in its exact form, never failing on another, as the team query does", async () => {
    const owner = await account();
    const exact = await runWithJob(null);
    const upper = await runWithJob(null);
    const noAccount = await runWithJob(null);
    const malformed = await runWithJob(null);
    await withAskerId(exact.runId, `owner:${owner.ownerRef}`);
    await withAskerId(upper.runId, `owner:${owner.ownerRef.toUpperCase()}`);
    await withAskerId(noAccount.runId, `owner:${randomUUID()}`);
    await withAskerId(malformed.runId, "owner:not-a-uuid");
    const ids = [exact.runId, upper.runId, noAccount.runId, malformed.runId];
    expect(await accountRuns(runner, ids)).toEqual([exact.runId]);
    expect(await accountRuns(runner, ids)).toEqual(await teamRunsOfEveryAccount(runner, ids));
  });

  it("the runner's start-up gate with asks open fails only the legacy asker's job, with no team at all", async () => {
    const [first, second] = [await account(), await account()];
    const firstRun = await runWithJob(first.ownerRef);
    const secondRun = await runWithJob(second.ownerRef);
    const legacy = await runWithJob(null);
    const lines: unknown[] = [];
    await expect(refusePreviewOutsiderWork({
      previewConfigured: true, asksOpen: true, teamUserIds: undefined,
      ...postgresRunnerPreviewTeamGateStore(runner, RELEASE), log: (line) => lines.push(line)
    })).resolves.toEqual({ checked: 3, refused: 1 });
    expect(await jobRow(legacy.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" });
    expect(await jobRow(firstRun.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    expect(await jobRow(secondRun.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_ONLY", runId: legacy.runId }]);
  });
});
