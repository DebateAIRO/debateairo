import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { PostgresAskApplication, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import type { Session } from "@debateai/contract";
import { RunRepository, RunWaitRepository, migrate, recordRunSupersession, type RunOwnershipAccess } from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { collectSnapshot, type OwnerViewPort, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createTestAskAdmissionPoolFacades, startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C9) — AN OLD RUN ID KEEPS WORKING, the database half. A debate
 * re-admitted from the waiting line is a NEW run, and core.run_supersession records old → new (0123 §4). Over embedded
 * Postgres and migration 0123: the application resolves the old id to the new run (and the new run to itself), the
 * person's list shows the question once (as its new run, counted once), an event stream still open on the old id reads
 * no mark (the clean close the page treats as "reconnect"), and the data export carries the new run alone. The route
 * half: tests/unit/side-by-side-run-ref-routes.test.ts. CI skips this directory; run it alone.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

const ASKER = `c9-run-ref-${randomUUID()}`;
const OWNERSHIP: RunOwnershipAccess = Object.freeze({ ownerRef: null, legacyAskerId: ASKER });
const SESSION = {
  asker_id: ASKER, session_id: `session:c9:${randomUUID()}`, caller_scope: "ASKER",
  ownership_provenance: "user_dev_token", provisional_identity_model: true
} as unknown as Session;

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** A legacy run of the file's one asker (a re-admission copies the old run's asker into the new run). */
function legacyRun(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Should a waiting debate keep its link after an upload?",
    principal: { kind: "legacy", legacyAskerId: ASKER },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date("2026-10-22T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:side-by-side-c9",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    releaseKey: TEST_RELEASE_KEY,
    batteryVersion: "side-by-side-c9",
    askContract: {},
    batteryRows: []
  });
}

function application(): PostgresAskApplication {
  const dispatcher: Dispatcher = { dispatch: async () => undefined };
  const settings: RunCreationSettings = {
    strangerSampleRate: 0,
    registerVersion: 1,
    releaseKey: TEST_RELEASE_KEY,
    batteryVersion: "side-by-side-c9",
    settlementWatchHandle: "side-by-side-c9",
    resolveDiscoveredPanel: async () => fixtureDiscoveredPanel(2),
    resolveEnvelopeBasis: async ({ panelSize }) => fixtureStructuralCeiling(12, panelSize, 1),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource: tierSource as "ASKER" | "MACHINE_DEFAULT" | "DEPLOYMENT_POLICY", tierProvenanceRef
    })
  };
  return new PostgresAskApplication(
    database.pool, dispatcher, settings, undefined, database.pool, createTestAskAdmissionPoolFacades(database.pool)
  );
}

let OLD: string;
let NEW: string;

beforeAll(async () => {
  // The old run waited in line; its re-admission wrote the new run's place and the edge in one transaction (plan C).
  OLD = await legacyRun();
  const waits = new RunWaitRepository(database.pool);
  await inTransaction(async (client) => {
    await waits.enterWait(client, OLD, new Date());
    await waits.recordReason(client, OLD, { waitsFor: "SWITCHING", personRecheckAt: null, at: new Date() });
  });
  NEW = await legacyRun();
  await inTransaction(async (client) => {
    await waits.enterWait(client, NEW, new Date());
    await recordRunSupersession(client, { oldRunId: OLD, newRunId: NEW });
  });
}, 120_000);

describe("side-by-side C9: an old run id follows its re-admission chain", () => {
  it("resolveRunRef: the old id names the new run, the new run names itself", async () => {
    const app = application();
    expect(await app.resolveRunRef(OLD)).toBe(NEW);
    expect(await app.resolveRunRef(NEW)).toBe(NEW);
  });

  it("the person's list shows the question once, as its new run, counted once", async () => {
    const index = await new ServeRepository(database.pool).readAnswerIndex(OWNERSHIP, 10, 0);
    expect(index.items).toEqual([]);
    expect(index.open_runs.map((run) => run.run_ref)).toEqual([NEW]);
    expect(index.total).toBe(1);
    // The same list through the application the route calls.
    const routed = await application().readAnswerIndex(SESSION, 10, 0, OWNERSHIP);
    expect(routed.open_runs.map((run) => run.run_ref)).toEqual([NEW]);
    expect(routed.total).toBe(1);
  });

  it("a stream still open on the old id reads no mark; the new run has one", async () => {
    const app = application();
    expect(await app.eventMark(OLD, SESSION, OWNERSHIP)).toBeNull();
    expect(await app.eventMark(NEW, SESSION, OWNERSHIP)).not.toBeNull();
  });

  it("the data export carries one entry, for the new run", async () => {
    const app = application();
    const raw = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8")) as Record<string, any>;
    const template = raw.runs[0];
    raw.runs = [OLD, NEW].map((runId) => ({ ...template, run_id: runId }));
    raw.erasure_tombstones = [];
    raw.visibility_events = [];
    const ownerView: OwnerViewPort = {
      runKeyPresent: async () => true,
      readRun: async (_owner, runId) => ({ run_ref: runId, question_line: "Re-admitted question", state: "QUEUED", terminal_reason: null, hold_until: null }),
      readRunAnswer: async () => null,
      readAnswer: async () => null,
      readInspection: async () => null,
      readLedgerDigest: async () => null,
      readStory: async () => null,
      readDisclosure: async () => null,
      readNode: async () => null,
      resolveRunRef: (runId) => app.resolveRunRef(runId),
      runRemovedByCheck: async () => false,
      readSynthesisChecks: async () => [],
      readPublicationReviews: async () => []
    };
    const snapshot = await collectSnapshot({
      claim: {
        exportId: "export-c9", userId: "user-c9", ownerRef: "owner-c9", sessionId: "session-c9",
        locale: "en", requestedAt: new Date("2026-10-22T00:00:00.000Z"), attempt: 1
      },
      workerId: "worker-c9",
      source: { readRaw: async () => raw as unknown as RawExportRows },
      ownerView,
      decrypt: {
        openUserField: async (_user, field) => `PLAIN:${field}`,
        openRecord: () => "PLAIN:record",
        openSupport: async () => "PLAIN:support"
      },
      now: () => new Date("2026-10-22T00:00:00.000Z")
    });
    expect(snapshot.debates.debates.map((entry) => entry.reference)).toEqual([NEW]);
  });
});
