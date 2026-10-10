import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, createPool, migrate } from "@debateai/db";
import {
  postgresRunnerPreviewTeamGateStore, refusePreviewOutsiderWork
} from "../../apps/runner/src/runner-preview-team-gate.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * GAP-RUNNER (2026-10-09): the runner's start-up team gate over embedded Postgres, connected as
 * a principal with exactly the live runner principal's one membership (debateai_runtime,
 * measured on the preview), so every read and write below is one the runner may really make.
 * CI skips this directory; run it before merging.
 */
let database: TestDatabase;
let runner: Pool;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE gate_runner_runtime LOGIN PASSWORD 'gate-runner-private-fixture-only' IN ROLE debateai_runtime");
  const url = new URL(database.connectionString);
  url.username = "gate_runner_runtime";
  url.password = "gate-runner-private-fixture-only";
  runner = createPool(url.toString());
}, 600_000);

afterAll(async () => {
  await runner?.end();
  await database?.stop();
});

async function activeUser(): Promise<Readonly<{ userId: string; ownerRef: string }>> {
  const userId = randomUUID(), ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `gate-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return { userId, ownerRef };
}

/** A run with its first job READY; owned by `ownerRef`, or a legacy asker's run when null. */
async function runWithJob(ownerRef: string | null): Promise<Readonly<{ runId: string; workItemId: string }>> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does the runner refuse an outsider's queued debate on the preview?",
    principal: { kind: "legacy", legacyAskerId: `gate:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: []
  });
  if (ownerRef !== null) await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
  });
  return { runId, workItemId };
}

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null; claimed_by: string | null }>(
    "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id=$1", [workItemId]
  )).rows[0];
}

function gate(teamUserIds: readonly string[], lines: unknown[]) {
  return refusePreviewOutsiderWork({
    previewConfigured: true, teamUserIds, ...postgresRunnerPreviewTeamGateStore(runner), log: (line) => lines.push(line)
  });
}

describe("the runner's start-up team gate, as the runner principal", () => {
  it("refuses the start while an outsider holds a live claim, then fails only the outsiders' claimable jobs", async () => {
    const team = await activeUser(), outsider = await activeUser();
    const teamJob = await runWithJob(team.ownerRef);
    const teamLive = await runWithJob(team.ownerRef);
    const outsiderReady = await runWithJob(outsider.ownerRef);
    const outsiderClaimed = await runWithJob(outsider.ownerRef);
    const legacy = await runWithJob(null);
    await database.pool.query(
      "UPDATE core.work_item SET state='CLAIMED', claimed_by='old-runner', claim_deadline=clock_timestamp()+interval '10 minutes' WHERE work_item_id = ANY($1::uuid[])",
      [[outsiderClaimed.workItemId, teamLive.workItemId]]
    );

    // A live outsider claim: the start is refused and nothing is written.
    const refusedLines: unknown[] = [];
    await expect(gate([team.userId], refusedLines)).rejects.toMatchObject({ code: "RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE" });
    expect(await jobRow(outsiderReady.workItemId)).toMatchObject({ state: "READY", terminal_reason: null });
    expect(await jobRow(outsiderClaimed.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "old-runner" });

    // Once that claim lapses, the next start fails every outsider job and leaves the team's alone.
    await database.pool.query(
      "UPDATE core.work_item SET claim_deadline=clock_timestamp()-interval '1 second' WHERE work_item_id=$1", [outsiderClaimed.workItemId]
    );
    const lines: unknown[] = [];
    expect(await gate([team.userId], lines)).toEqual({ checked: 5, refused: 3 });
    for (const job of [outsiderReady, outsiderClaimed, legacy]) {
      expect(await jobRow(job.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY", claimed_by: null });
    }
    expect(await jobRow(teamJob.workItemId)).toMatchObject({ state: "READY", terminal_reason: null });
    expect(await jobRow(teamLive.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "old-runner" });
    expect(lines).toHaveLength(3);
    expect(JSON.stringify(lines)).not.toMatch(/question|asker|owner/i);

    // What the start-up re-dispatch then hands over: only the team's job.
    const dispatchable = await new WorkItemRepository(runner).listDispatchable(1_000);
    expect(dispatchable.map((item) => item.workItemId)).toEqual([teamJob.workItemId]);

    // A second start finds nothing more to refuse.
    expect(await gate([team.userId], [])).toEqual({ checked: 2, refused: 0 });
  });

  it("never overwrites a job that is no longer claimable, nor the reason already recorded", async () => {
    const outsider = await activeUser();
    const job = await runWithJob(outsider.ownerRef);
    await database.pool.query(
      "UPDATE core.work_item SET state='FAILED', terminal_reason='RUN_SETUP_FAILED:DISPATCH' WHERE work_item_id=$1", [job.workItemId]
    );
    const store = postgresRunnerPreviewTeamGateStore(runner);
    expect(await store.work.failClaimable({ ...job, reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" })).toBe(false);
    expect(await jobRow(job.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:DISPATCH" });
  });
});
