import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import { PostgresModelSpendStore } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import { RunWaitRepository, migrate } from "@debateai/db";
import { AskRoom, type AskRoomOptions } from "../../apps/api/src/ask-room.js";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side uploads spec 2026-10-21 §1 (plan C task C2; INTERFACE "core.run.release_key"): every run the API admits
 * is stamped with the API's own release key (`RunCreationSettings.releaseKey`), on all three admission paths — the
 * direct path (no room), a room START and a room WAIT — so a debate is never served by another release (ruling O1). A
 * key the API could never run as (`legacy`, malformed) refuses the application at construction, RELEASE_KEY_INVALID.
 * Embedded Postgres, the B7b harness pattern; CI skips this directory, run it before merging.
 */
// The code part is kept apart from the key name, so no line pairs a *_KEY name with a literal (gitleaks).
const STAMP = ["r1", "0123456789ab"].join("-");

let database: TestDatabase;
let now = new Date("2032-03-01T10:00:00.000Z");
let estimate = 1;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

const ask: AskRequest = {
  question_line: "Should every city plant a tree for each child born there?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:side-by-side-c2",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "side-by-side C2 integration test",
  as_of: "2026-10-21T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
};

function roomWith(overrides: Partial<AskRoomOptions> = {}): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: new PostgresModelSpendStore(database.pool),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => estimate },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 1_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => now,
    ...overrides
  });
}

function settingsWith(releaseKey: string, room?: AskRoom): RunCreationSettings {
  return {
    releaseKey,
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "side-by-side-c2",
    settlementWatchHandle: "side-by-side-c2",
    resolveDiscoveredPanel: async () => PLAN_TIER_ROSTERS.free.map((modelId, index) => Object.freeze({
      provider_ref: `provider:c2:${String(index + 1)}`, maker: `maker:c2:${String(index + 1)}`, model_id: modelId,
      probe_evidence_ref: randomUUID(), probed_at: "2026-10-21T00:00:00.000Z"
    })),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    }),
    ...(room === undefined ? {} : { room, waitingLine: room })
  };
}

const dispatcher: Dispatcher = { dispatch: async () => undefined };

function applicationWith(releaseKey: string, room?: AskRoom): PostgresAskApplication {
  return new PostgresAskApplication(
    database.pool, dispatcher, settingsWith(releaseKey, room), undefined, database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
  );
}

function submitAs(application: PostgresAskApplication) {
  const askerId = `c2:${randomUUID()}`;
  const session = {
    asker_id: askerId, session_id: `session:c2:${randomUUID()}`, caller_scope: "ASKER",
    ownership_provenance: "user_dev_token", provisional_identity_model: true
  } as unknown as Session;
  return application.submit(ask, session, { kind: "legacy", legacyAskerId: askerId });
}

async function stampOf(runId: string): Promise<string | undefined> {
  return (await database.pool.query<{ release_key: string }>(
    "SELECT release_key FROM core.run WHERE run_id=$1", [runId]
  )).rows[0]?.release_key;
}

describe("side-by-side C2: every new run carries the admitting API's release key", () => {
  it("stamps a run admitted on the direct path (no room)", async () => {
    const accepted = await submitAs(applicationWith(STAMP));
    expect(await stampOf(accepted.run_ref)).toBe(STAMP);
  });

  it("stamps a run the room STARTs and a run the room makes WAIT", async () => {
    now = new Date("2032-03-02T10:00:00.000Z");
    estimate = 1;
    const started = await submitAs(applicationWith(STAMP, roomWith()));
    expect(started.status).not.toBe("WAITING");
    expect(await stampOf(started.run_ref)).toBe(STAMP);

    now = new Date("2032-03-03T10:00:00.000Z");
    estimate = 1_000;
    const waiting = await submitAs(applicationWith(STAMP, roomWith({ dailyCeilingMicros: 1 })));
    expect(waiting.status).toBe("WAITING");
    expect(await stampOf(waiting.run_ref)).toBe(STAMP);
  });

  // Side-by-side C14: the key the newer-release fallback reads after a debate read fails its parse.
  it("reads a run's stamp back (readRunReleaseKey); an unknown run or answer reads null", async () => {
    const application = applicationWith(STAMP);
    const accepted = await submitAs(application);
    expect(await application.readRunReleaseKey(accepted.run_ref)).toBe(STAMP);
    expect(await application.readRunReleaseKey(randomUUID())).toBeNull();
    expect(await application.readAnswerReleaseKey(randomUUID())).toBeNull();
  });

  it("refuses to build an application under a key it could never run as", () => {
    for (const releaseKey of ["legacy", "R1-0123456789AB", ""]) {
      expect(() => applicationWith(releaseKey)).toThrowError(expect.objectContaining({ code: "RELEASE_KEY_INVALID" }));
    }
  });
});
