/**
 * The CI gate's half of tests/integration/run-setup-failure.test.ts (the gate
 * runs unit and architecture tests only): once `submit` has created a run,
 * whichever later step throws is named in the FAILED record, and the asker's
 * error is rethrown untouched. What the record does in the database is proven
 * by the integration file.
 */
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunRepository } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";

/** `unlocked: false` makes the admission lease's release throw after the run was created. */
function stubPool(unlocked = true): Pool {
  const query = vi.fn(async () => ({
    rows: [{ locked: true, unlocked }],
    rowCount: 1
  } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
  return { connect: vi.fn(async () => client), query } as unknown as Pool;
}

const settings: RunCreationSettings = {
  strangerSampleRate: 0,
  registerVersion: 1,
  batteryVersion: "run-setup-failure-unit",
  settlementWatchHandle: "run-setup-failure-unit",
  resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
    provider_ref: `provider:free:${index + 1}`,
    maker: `maker:free:${index + 1}`,
    model_id: modelId,
    probe_evidence_ref: `probe:free:${index + 1}`,
    probed_at: "2026-09-28T00:00:00.000Z"
  })),
  resolveEnvelopeBasis: async () => Object.freeze({}),
  resolveRisk: (askerRiskTier, tierSource, tierProvenanceRef) => ({
    effectiveRiskTier: askerRiskTier,
    tierSource: tierSource as never,
    tierProvenanceRef
  })
};

const ask = {
  question_line: "Should cities make public transport free at the point of use?",
  as_of: "2026-09-28T00:00:00.000Z",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "test:run-setup-failure",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "run setup failure unit test",
  steering_presets: [],
  steering_annotations: [],
  plan_tier: "free"
} as unknown as AskRequest;

const session: Session = {
  session_id: "33333333-3333-4333-8333-333333333333",
  asker_id: `owner:${OWNER_REF}`,
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

type Step = "startRun" | "recordMemoryQuestion" | "enqueue" | "dispatch" | "release";

function arrange(input: { readonly failAt?: Step; readonly recordFails?: boolean } = {}) {
  const failure = new Error(`test: ${input.failAt ?? "nothing"} failed`);
  const order: string[] = [];
  const recorded: unknown[] = [];
  const failIf = (step: Step): void => {
    order.push(step);
    if (input.failAt === step) throw failure;
  };
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async () => {
    failIf("startRun");
    return RUN_ID;
  });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockImplementation(async () => {
    failIf("recordMemoryQuestion");
  });
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockImplementation(async () => {
    failIf("enqueue");
    return WORK_ITEM_ID;
  });
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockImplementation(async (record) => {
    order.push("recordSetupFailure");
    recorded.push(record);
    if (input.recordFails === true) throw new Error("test: the record failed too");
    return true;
  });
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const application = new PostgresAskApplication(
    stubPool(),
    { dispatch: vi.fn(async () => { failIf("dispatch"); }) },
    settings,
    { read: async () => [] },
    stubPool(),
    { server: stubPool(input.failAt !== "release"), legacy: stubPool() }
  );
  const submit = () => application.submit(ask, session, {
    kind: "server", userId: "run-setup-failure-user", ownerRef: OWNER_REF
  });
  return { application, submit, failure, order, recorded, logged };
}

const recordFor = (reason: string) => ({
  runId: RUN_ID, batteryRowId: "Q1", commandKey: `S00:${RUN_ID}:Q1`, reason
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submit records a run FAILED when a step after its creation throws", () => {
  it.each([
    ["recordMemoryQuestion", "RUN_SETUP_FAILED:MEMORY_QUESTION", ["startRun", "recordMemoryQuestion"]],
    ["enqueue", "RUN_SETUP_FAILED:WORK_QUEUE", ["startRun", "recordMemoryQuestion", "enqueue"]],
    ["dispatch", "RUN_SETUP_FAILED:DISPATCH", ["startRun", "recordMemoryQuestion", "enqueue", "dispatch"]]
  ] as const)("names %s and rethrows the asker's error unchanged", async (step, reason, before) => {
    const { submit, failure, order, recorded, logged } = arrange({ failAt: step });
    await expect(submit()).rejects.toBe(failure);
    expect(order).toEqual([...before, "recordSetupFailure"]);
    expect(recorded).toEqual([recordFor(reason)]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("names the admission lease when it cannot be released after startRun committed the run", async () => {
    const { submit, order, recorded } = arrange({ failAt: "release" });
    await expect(submit()).rejects.toThrow("OWNER_ASK_ADMISSION_LEASE_UNLOCK_FAILED");
    expect(order).toEqual(["startRun", "recordSetupFailure"]);
    expect(recorded).toEqual([recordFor("RUN_SETUP_FAILED:ADMISSION_RELEASE")]);
  });

  it("records nothing when startRun itself throws: this call created no run", async () => {
    const { submit, failure, order, recorded } = arrange({ failAt: "startRun" });
    await expect(submit()).rejects.toBe(failure);
    expect(order).toEqual(["startRun"]);
    expect(recorded).toEqual([]);
  });

  it("records nothing when every step succeeds", async () => {
    const { submit, recorded } = arrange();
    await expect(submit()).resolves.toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(recorded).toEqual([]);
  });

  it("still rethrows the asker's error, and logs only ids and codes, when the record fails too", async () => {
    const { submit, failure, logged } = arrange({ failAt: "enqueue", recordFails: true });
    await expect(submit()).rejects.toBe(failure);
    const lines = logged.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(lines).toEqual([{
      event: "api.run.setup_failure_unrecorded",
      runId: RUN_ID,
      reason: "RUN_SETUP_FAILED:WORK_QUEUE",
      diagnostic: expect.any(String)
    }]);
    expect(JSON.stringify(lines)).not.toMatch(/test: /);
  });
});
