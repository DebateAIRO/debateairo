// Step 1 review fix (2026-10-08): on the private preview only the team may start a debate,
// and that rule must hold for runs that are ALREADY in the system too — the API's waiting-line
// waker and its stalled-start re-dispatch start or hand over existing runs without passing
// POST /v1/asks. An outsider's run that waited from before the cutover must never reach GLM:
// it is recorded FAILED (RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY, read by the UI as "never started")
// and nothing of it is dispatched. Off the preview nothing changes, and no identity is read.
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { WaitingRun } from "@debateai/db";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AskWaitingLinePort, WaitingStart } from "../../apps/api/src/ask-room.js";

const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
/** Identity user ids (what PREVIEW_TEAM_USER_IDS_JSON lists) and the opaque owner refs runs carry. */
const MEMBER_USER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER_USER = "22222222-2222-4222-8222-222222222222";
const MEMBER_OWNER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER_OWNER = "44444444-4444-4444-8444-444444444444";
const TX = Object.freeze({ marker: "the start's own transaction" }) as unknown as PoolClient;

function waitingRun(person: Readonly<{ ownerRef?: string; legacyAskerId?: string }>): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-10-07T12:00:00.000Z"),
    ownerRef: person.ownerRef ?? null, legacyAskerId: person.ownerRef === undefined ? (person.legacyAskerId ?? "legacy:x") : null,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 1,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-07T12:00:00.000Z")
  });
}

/**
 * The runtime pool, standing in for the database: it answers the one identity read the
 * team rule makes ("which of these runs belong to one of these identity users?") from
 * `owners` (run id → the identity user id that owns it; a legacy run has none).
 */
function identityPool(owners: ReadonlyMap<string, string>) {
  const identityReads: Array<Readonly<{ runIds: readonly string[]; userIds: readonly string[] }>> = [];
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    if (text.includes("identity.\"user\"")) {
      const runIds = values[0] as readonly string[];
      const userIds = values[1] as readonly string[];
      identityReads.push({ runIds: [...runIds], userIds: [...userIds] });
      const rows = runIds.filter((runId) => {
        const owner = owners.get(runId);
        return owner !== undefined && userIds.includes(owner);
      }).map((runId) => ({ run_id: runId }));
      return { rows, rowCount: rows.length } as unknown as QueryResult;
    }
    return { rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult;
  });
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { pool: { connect: vi.fn(async () => client), query } as unknown as Pool, identityReads };
}

function otherPool(): Pool {
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 } as unknown as QueryResult));
  return { connect: vi.fn(), query } as unknown as Pool;
}

function arrange(input: Readonly<{
  preview: boolean;
  team?: readonly string[];
  line: ReadonlyArray<WaitingRun>;
  /** Started runs whose first job is still READY past the bound. */
  stalled?: ReadonlyArray<string>;
  owners: ReadonlyMap<string, string>;
}>) {
  const tried: string[] = [];
  const dispatched: string[] = [];
  const recorded: unknown[] = [];
  vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockImplementation(async () =>
    (input.stalled ?? []).map((runId) => Object.freeze({ runId, workItemId: `job:${runId}` })));
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async (client, job) => {
    if (client !== TX) throw new Error("test: the first job must be queued on the start's transaction");
    return `job:${job.runId ?? ""}`;
  });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    recorded.push(record);
    return true;
  });
  const waitingLine: AskWaitingLinePort = {
    wakeCandidates: async ({ after }) => (after === null ? input.line : []),
    startWaiting: async <T,>(run: WaitingRun, enqueue: (tx: PoolClient) => Promise<T>): Promise<WaitingStart<T>> => {
      tried.push(run.runId);
      return { kind: "STARTED", value: await enqueue(TX) };
    }
  };
  const settings: RunCreationSettings = {
    ...(input.preview ? { previewProviderTestConfig: PREVIEW, previewTeamUserIds: input.team ?? [] } : {}),
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "preview-team", settlementWatchHandle: "preview-team",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    waitingLine
  };
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const runtime = identityPool(input.owners);
  const application = new PostgresAskApplication(
    runtime.pool,
    { dispatch: vi.fn(async ({ runId, workItemId }) => {
      if (workItemId !== `job:${runId}`) throw new Error("test: dispatched a job the tick did not queue");
      dispatched.push(runId);
    }) },
    settings, { read: async () => [] }, otherPool(), { server: otherPool(), legacy: otherPool() }
  );
  const lines = () => [...info.mock.calls, ...error.mock.calls].map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
  return { application, tried, dispatched, recorded, lines, identityReads: runtime.identityReads };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("off the preview the waiting line is unchanged", () => {
  it("starts every waiting run and re-dispatches every stalled start, and reads no identity", async () => {
    const outsider = waitingRun({ ownerRef: OUTSIDER_OWNER });
    const legacy = waitingRun({ legacyAskerId: "legacy:a" });
    const stalled = randomUUID();
    const owners = new Map([[outsider.runId, OUTSIDER_USER], [stalled, OUTSIDER_USER]]);
    const { application, tried, dispatched, recorded, identityReads } = arrange({
      preview: false, line: [outsider, legacy], stalled: [stalled], owners
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({
      waiting: 2, started: 2, skipped: 0, failed: 0, stopped: false, redispatched: 1
    });
    expect(tried).toEqual([outsider.runId, legacy.runId]);
    expect(dispatched).toEqual([outsider.runId, legacy.runId, stalled]);
    expect(recorded).toEqual([]);
    expect(identityReads).toEqual([]);
  });
});

describe("on the preview the waiting line starts only the team's runs", () => {
  it("wakes a team member's waiting run and re-dispatches their stalled start exactly as before", async () => {
    const member = waitingRun({ ownerRef: MEMBER_OWNER });
    const stalled = randomUUID();
    const owners = new Map([[member.runId, MEMBER_USER], [stalled, MEMBER_USER]]);
    const { application, tried, dispatched, recorded } = arrange({
      preview: true, team: [MEMBER_USER], line: [member], stalled: [stalled], owners
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({
      waiting: 1, started: 1, skipped: 0, failed: 0, stopped: false, redispatched: 1
    });
    expect(tried).toEqual([member.runId]);
    expect(dispatched).toEqual([member.runId, stalled]);
    expect(recorded).toEqual([]);
  });

  it("never starts an outsider's or a legacy asker's waiting run: each is recorded FAILED as PREVIEW_TEAM_ONLY", async () => {
    const outsider = waitingRun({ ownerRef: OUTSIDER_OWNER });
    const legacy = waitingRun({ legacyAskerId: "legacy:a" });
    const member = waitingRun({ ownerRef: MEMBER_OWNER });
    const owners = new Map([[outsider.runId, OUTSIDER_USER], [member.runId, MEMBER_USER]]);
    const { application, tried, dispatched, recorded, lines } = arrange({
      preview: true, team: [MEMBER_USER], line: [outsider, legacy, member], owners
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({
      waiting: 3, started: 1, skipped: 0, failed: 2, stopped: false, redispatched: 0
    });
    // Neither outsider run reached the room: no hold, no start mark, no job.
    expect(tried).toEqual([member.runId]);
    expect(dispatched).toEqual([member.runId]);
    expect(recorded).toEqual([
      { runId: outsider.runId, batteryRowId: "Q1", commandKey: `S00:${outsider.runId}:Q1`, reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" },
      { runId: legacy.runId, batteryRowId: "Q1", commandKey: `S00:${legacy.runId}:Q1`, reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" }
    ]);
    // Ids and codes only: never an identity user id.
    expect(JSON.stringify(lines())).not.toContain(OUTSIDER_USER);
    expect(JSON.stringify(lines())).not.toContain(MEMBER_USER);
  });

  it("refuses every waiting run of one outsider in the same tick, not one per tick", async () => {
    const first = waitingRun({ ownerRef: OUTSIDER_OWNER });
    const second = waitingRun({ ownerRef: OUTSIDER_OWNER });
    const owners = new Map([[first.runId, OUTSIDER_USER], [second.runId, OUTSIDER_USER]]);
    const { application, recorded, dispatched } = arrange({ preview: true, team: [MEMBER_USER], line: [first, second], owners });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 0, failed: 2 });
    expect(recorded.map((record) => (record as { runId: string }).runId)).toEqual([first.runId, second.runId]);
    expect(dispatched).toEqual([]);
  });

  it("never re-dispatches an outsider's stalled start: it is recorded FAILED as PREVIEW_TEAM_ONLY", async () => {
    const outsiderJob = randomUUID();
    const memberJob = randomUUID();
    const owners = new Map([[outsiderJob, OUTSIDER_USER], [memberJob, MEMBER_USER]]);
    const { application, dispatched, recorded } = arrange({
      preview: true, team: [MEMBER_USER], line: [], stalled: [outsiderJob, memberJob], owners
    });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ redispatched: 1 });
    expect(dispatched).toEqual([memberJob]);
    expect(recorded).toEqual([
      { runId: outsiderJob, batteryRowId: "Q1", commandKey: `S00:${outsiderJob}:Q1`, reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" }
    ]);
  });

  it("asks the database about the tick's runs against the configured team ids", async () => {
    const member = waitingRun({ ownerRef: MEMBER_OWNER });
    const stalled = randomUUID();
    const owners = new Map([[member.runId, MEMBER_USER], [stalled, MEMBER_USER]]);
    const { application, identityReads } = arrange({
      preview: true, team: [MEMBER_USER], line: [member], stalled: [stalled], owners
    });
    await application.wakeWaitingRuns();
    expect(identityReads).toEqual([
      { runIds: [member.runId], userIds: [MEMBER_USER] },
      { runIds: [stalled], userIds: [MEMBER_USER] }
    ]);
  });

  it("with an empty team dispatches nothing, starts nothing, and leaves every run where it is", async () => {
    // Fail closed without destroying anything: a team list the operator forgot is not a reason to
    // fail the team's own waiting runs; they start once the list names them.
    const member = waitingRun({ ownerRef: MEMBER_OWNER });
    const outsider = waitingRun({ ownerRef: OUTSIDER_OWNER });
    const stalled = randomUUID();
    const owners = new Map([[member.runId, MEMBER_USER], [outsider.runId, OUTSIDER_USER], [stalled, MEMBER_USER]]);
    const { application, tried, dispatched, recorded, identityReads } = arrange({
      preview: true, team: [], line: [member, outsider], stalled: [stalled], owners
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({
      waiting: 2, started: 0, skipped: 2, failed: 0, stopped: false, redispatched: 0
    });
    expect(tried).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(recorded).toEqual([]);
    expect(identityReads).toEqual([]);
  });
});
