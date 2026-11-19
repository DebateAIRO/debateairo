// PREVIEW_ASKS_OPEN_TO and the runs already in the system: the API's waker and its stalled-start re-send start or hand
// over runs without passing POST /v1/asks, so they follow the same rule. With asks open the rule is "any account": a
// stranger's waiting run starts and their stalled start is re-sent, while a run no account owns (a legacy asker's) is
// still recorded FAILED, as the routes still refuse a session without a user id. The team list is never read, and an
// empty team is not "unset".
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import type { WaitingRun } from "@debateai/db";
import { PREVIEW_ACCOUNT_RUNS_SQL, PREVIEW_TEAM_RUNS_SQL, parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AskWaitingLinePort, WaitingStart } from "../../apps/api/src/ask-room.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const STRANGER_OWNER = "44444444-4444-4444-8444-444444444444";
const TX = Object.freeze({ marker: "the start's own transaction" }) as unknown as PoolClient;

function waitingRun(owner: Readonly<{ ownerRef: string } | { legacyAskerId: string }>): WaitingRun {
  return Object.freeze({
    runId: randomUUID(), waitingSince: new Date("2026-10-07T12:00:00.000Z"), releaseKey: TEST_RELEASE_KEY,
    ownerRef: "ownerRef" in owner ? owner.ownerRef : null, legacyAskerId: "legacyAskerId" in owner ? owner.legacyAskerId : null,
    planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 1,
    waitsFor: "SITE", personRecheckAt: null, reasonAt: new Date("2026-10-07T12:00:00.000Z")
  });
}

function arrange(input: Readonly<{
  open: boolean; line: ReadonlyArray<WaitingRun>; stalled: ReadonlyArray<string>;
  /** The runs the database says an account owns (PREVIEW_ACCOUNT_RUNS_SQL's answer). */
  accountOwned?: ReadonlySet<string>;
}>) {
  const tried: string[] = [];
  const dispatched: string[] = [];
  const recorded: unknown[] = [];
  const accountReads: unknown[] = [];
  const teamReads: unknown[] = [];
  vi.spyOn(WorkItemRepository.prototype, "listStalledStarts").mockImplementation(async () =>
    input.stalled.map((runId) => Object.freeze({ runId, workItemId: `job:${runId}` })));
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockImplementation(async (_client, job) => `job:${job.runId ?? ""}`);
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => { recorded.push(record); return true; });
  const waitingLine: AskWaitingLinePort = {
    wakeCandidates: async ({ after }) => (after === null ? input.line : []),
    startWaiting: async <T,>(run: WaitingRun, enqueue: (tx: PoolClient, runId: string) => Promise<T>): Promise<WaitingStart<T>> => {
      tried.push(run.runId);
      return { kind: "STARTED", runId: run.runId, value: await enqueue(TX, run.runId) };
    }
  };
  // An empty team, as the parser demands beside an open setting; with the setting absent that is today's "unset" team.
  const settings: RunCreationSettings = {
    previewProviderTestConfig: PREVIEW, previewTeamUserIds: [], ...(input.open ? { previewAsksOpen: true as const } : {}),
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "preview-open", settlementWatchHandle: "preview-open",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    waitingLine
  };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    if (text === PREVIEW_ACCOUNT_RUNS_SQL) {
      accountReads.push(values);
      const rows = (values[0] as readonly string[]).filter((runId) => input.accountOwned?.has(runId) === true).map((run_id) => ({ run_id }));
      return { rows, rowCount: rows.length } as unknown as QueryResult;
    }
    if (text === PREVIEW_TEAM_RUNS_SQL || text.includes("identity.\"user\"")) { teamReads.push(values); return { rows: [], rowCount: 0 } as unknown as QueryResult; }
    return { rows: [{ locked: true, unlocked: true }], rowCount: 1 } as unknown as QueryResult;
  });
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  const runtime = { connect: vi.fn(async () => client), query } as unknown as Pool;
  const other = () => ({ connect: vi.fn(), query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }) as unknown as Pool;
  const application = new PostgresAskApplication(runtime,
    { dispatch: vi.fn(async ({ runId }) => { dispatched.push(runId); }) },
    settings, { read: async () => [] }, other(), { server: other(), legacy: other() });
  return { application, tried, dispatched, recorded, accountReads, teamReads };
}

const failedAsOutsider = (runId: string) =>
  ({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, reason: "RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY" });

afterEach(() => { vi.restoreAllMocks(); });

describe("the waker and the stalled-start re-send with asks open", () => {
  it("open: a stranger's waiting run starts and their stalled start is re-sent; the team list is never read", async () => {
    const waiting = waitingRun({ ownerRef: STRANGER_OWNER });
    const stalled = randomUUID();
    const { application, tried, dispatched, recorded, accountReads, teamReads } = arrange({
      open: true, line: [waiting], stalled: [stalled], accountOwned: new Set([waiting.runId, stalled])
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 1, skipped: 0, failed: 0, stopped: false, redispatched: 1 });
    expect(tried).toEqual([waiting.runId]);
    expect(dispatched).toEqual([waiting.runId, stalled]);
    expect(recorded).toEqual([]);
    // One account read per page and one for the stalled starts, each with exactly that tick's run ids.
    expect(accountReads).toEqual([[[waiting.runId]], [[stalled]]]);
    expect(teamReads).toEqual([]);
  });

  it("open: a run no account owns (a legacy asker's) is still recorded FAILED, waiting or stalled, and never started", async () => {
    const legacy = waitingRun({ legacyAskerId: "legacy:a" });
    const stranger = waitingRun({ ownerRef: STRANGER_OWNER });
    const legacyStalled = randomUUID();
    const strangerStalled = randomUUID();
    const { application, tried, dispatched, recorded, teamReads } = arrange({
      open: true, line: [legacy, stranger], stalled: [legacyStalled, strangerStalled], accountOwned: new Set([stranger.runId, strangerStalled])
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 2, started: 1, skipped: 0, failed: 1, stopped: false, redispatched: 1 });
    expect(tried).toEqual([stranger.runId]);
    expect(dispatched).toEqual([stranger.runId, strangerStalled]);
    expect(recorded).toEqual([failedAsOutsider(legacy.runId), failedAsOutsider(legacyStalled)]);
    expect(teamReads).toEqual([]);
  });

  it("open: with no stalled start the re-send reads nothing", async () => {
    const waiting = waitingRun({ ownerRef: STRANGER_OWNER });
    const { application, accountReads } = arrange({ open: true, line: [waiting], stalled: [], accountOwned: new Set([waiting.runId]) });
    await expect(application.wakeWaitingRuns()).resolves.toMatchObject({ started: 1, redispatched: 0 });
    expect(accountReads).toEqual([[[waiting.runId]]]);
  });

  it("absent, with the same empty team: today's UNSET answer, nothing started, re-sent, failed or read", async () => {
    const waiting = waitingRun({ ownerRef: STRANGER_OWNER });
    const stalled = randomUUID();
    const { application, tried, dispatched, recorded, accountReads, teamReads } = arrange({
      open: false, line: [waiting], stalled: [stalled], accountOwned: new Set([waiting.runId, stalled])
    });
    await expect(application.wakeWaitingRuns()).resolves.toEqual({ waiting: 1, started: 0, skipped: 1, failed: 0, stopped: false, redispatched: 0 });
    expect(tried).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(recorded).toEqual([]);
    expect(accountReads).toEqual([]);
    expect(teamReads).toEqual([]);
  });

  it("the waker's one rule method reads the account query only behind the open setting, and still the team query", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const api = await readFile(resolve("apps/api/src/index.ts"), "utf8");
    const method = api.slice(api.indexOf("async #previewTeamRuns("), api.indexOf("async #refusePreviewOutsider("));
    const open = method.indexOf("if (this.settings.previewAsksOpen === true) {");
    expect(open).toBeGreaterThan(method.indexOf("validatePreviewProviderTestConfig(this.settings.previewProviderTestConfig) === undefined) return null;"));
    expect(method.indexOf("PREVIEW_ACCOUNT_RUNS_SQL, [[...runIds]]")).toBeGreaterThan(open);
    expect(method.indexOf("PREVIEW_ACCOUNT_RUNS_SQL, [[...runIds]]")).toBeLessThan(method.indexOf("const teamUserIds = this.settings.previewTeamUserIds ?? [];"));
    expect(method).toContain("PREVIEW_TEAM_RUNS_SQL,");
    expect(method).not.toContain("SELECT");
  });
});
