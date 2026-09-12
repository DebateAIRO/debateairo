import { EventEmitter } from "node:events";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import {
  PLAN_TIER_ROSTERS,
  type AskRequest,
  type PlanTier,
  type Session
} from "@debateai/contract";
import { RunRepository, type StartRunInput } from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";

function rosterPanel(tier: PlanTier) {
  return PLAN_TIER_ROSTERS[tier].map((modelId, index) => Object.freeze({
    provider_ref: `provider:${tier}:${index + 1}`,
    maker: `maker:${tier}:${index + 1}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${tier}:${index + 1}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  }));
}

function stubPool(): Pool {
  const query = vi.fn(async () => ({
    rows: [{ locked: true, unlocked: true }],
    rowCount: 1
  } as unknown as QueryResult));
  const client = Object.assign(new EventEmitter(), {
    query,
    release: vi.fn()
  }) as unknown as PoolClient;
  return {
    connect: vi.fn(async () => client),
    query
  } as unknown as Pool;
}

function askFor(planTier: PlanTier): AskRequest {
  return {
    question_line: `Should the ${planTier} tier be selected?`,
    as_of: "2026-09-12T00:00:00.000Z",
    risk_tier: "R1",
    tier_source: "ASKER",
    tier_provenance_ref: `test:${planTier}`,
    composition_budget_tier: "STANDARD",
    depth_params: {},
    decision_scope: {},
    steering_presets: [],
    steering_annotations: [],
    plan_tier: planTier
  } as unknown as AskRequest;
}

function session(): Session {
  return {
    session_id: "33333333-3333-4333-8333-333333333333",
    asker_id: `owner:${OWNER_REF}`,
    caller_scope: "ASKER",
    ownership_provenance: "server_session",
    provisional_identity_model: false
  };
}

function settingsFor(tier: PlanTier): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "tiers-s02-wire",
    settlementWatchHandle: "tiers-s02-wire",
    resolveDiscoveredPanel: async () => rosterPanel(tier),
    resolveEnvelopeBasis: async () => Object.freeze({}),
    resolveRisk: (askerRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier: askerRiskTier,
      tierSource: tierSource as never,
      tierProvenanceRef
    })
  };
}

function productionSourceFiles(repoRoot: string): readonly string[] {
  const excludedDirectories = new Set(["dist", "generated", "node_modules"]);
  const files: string[] = [resolve(repoRoot, "apps/api/src/index.ts")];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) walk(entryPath);
      } else if (/\.tsx?$/u.test(entry.name) && !/\.(?:spec|test)\./u.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  for (const packageEntry of readdirSync(resolve(repoRoot, "packages"), { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    const sourceRoot = resolve(repoRoot, "packages", packageEntry.name, "src");
    if (existsSync(sourceRoot)) walk(sourceRoot);
  }
  return files;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("S02 plan-tier run wiring", () => {
  // Property: each accepted ask carries its selected plan tier into the real run-start boundary.
  // Production break: remove the planTier member from PostgresAskApplication's startRun input.
  it("forwards both ask plan tiers to StartRunInput.planTier", async () => {
    const capturedInputs: StartRunInput[] = [];
    vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (input) => {
      capturedInputs.push(input);
      return RUN_ID;
    });
    vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
    vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
    vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue(WORK_ITEM_ID);

    for (const tier of ["free", "premium"] as const) {
      const primaryPool = stubPool();
      const application = new PostgresAskApplication(
        primaryPool,
        { dispatch: vi.fn(async () => undefined) },
        settingsFor(tier),
        { read: async () => [] },
        stubPool(),
        { server: stubPool(), legacy: stubPool() }
      );
      const ask = askFor(tier);
      await application.submit(
        ask,
        session(),
        { kind: "server", userId: "tiers-s02-wire-user", ownerRef: OWNER_REF }
      );
    }

    expect(capturedInputs.map((input) => input.planTier)).toEqual(["free", "premium"]);
  });

  // Property: one production startRun caller exists, and that caller supplies planTier.
  // Production break: remove planTier from the sole call or add another production .startRun call.
  it("keeps one production startRun caller and wires planTier at that call", () => {
    const repoRoot = process.cwd();
    const calls = productionSourceFiles(repoRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/\.startRun\(/gu)].map((match) => ({
        file: relative(repoRoot, file),
        source,
        offset: match.index
      }));
    });

    expect(calls.map((call) => call.file)).toEqual(["apps/api/src/index.ts"]);
    const callSite = calls[0]!.source.slice(calls[0]!.offset, calls[0]!.offset + 1_200);
    expect(callSite).toMatch(/\.startRun\(\{[\s\S]*?\bplanTier\s*:/u);
  });
});
