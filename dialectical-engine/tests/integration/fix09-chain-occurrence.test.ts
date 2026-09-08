import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import {
  appendChainedOccurrences,
  configureOccurrenceGatewayForTest,
  materializeDirectOccurrence,
  materializeSpooledOccurrence,
} from "../../packages/obs-capture/src/chain/occurrence-gateway.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

function envelope(sourceEventRef: string) {
  return createSharedRedactor({
    allowlist_set_id: "g0-empty-parameters",
    build_dirty: false,
    build_ref: "build:test",
    component: Object.freeze({ package: "@debateai/api", process: "api" }),
    environment: "test",
    now: () => new Date("2026-09-08T01:02:03.004Z"),
    redaction_policy_version: "g0",
    runtime: "api",
    sourceEventRef: () => sourceEventRef,
    writer_identity: "api-test-writer",
  }).redact(Object.freeze({
    ambient_context_ref: undefined,
    kind: "envelope" as const,
    payload_ref: Object.freeze({
      capture_point: "self",
      code: "OBS_CAPTURE_SELF",
      disposition: "SELF",
      source: "first_party",
      taxonomy_class: "CAPTURE_SELF",
    }),
  }));
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  configureOccurrenceGatewayForTest(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 chained occurrences on real PostgreSQL", () => {
  it("proves exact detail presence, replay, locks, ordering, signing, concurrency, and atomic rollback", async () => {
    const sourceEventRef = randomUUID();
    const directEnvelope = envelope(sourceEventRef);
    const direct = materializeDirectOccurrence(directEnvelope);
    expect(Object.getPrototypeOf(direct)).toBeNull();
    expect(Object.isFrozen(direct)).toBe(true);
    expect(direct.capture_status).toBe("PERSISTED");
    expect(direct.spool_receipt).toBeNull();
    expect(Object.getOwnPropertySymbols(direct)).toEqual([]);

    const serialized = JSON.parse(JSON.stringify(directEnvelope));
    const spooled = materializeSpooledOccurrence(serialized, "api");
    expect(spooled.capture_status).toBe("SPOOLED");
    expect(spooled.spool_receipt).toEqual({
      source: "first_party",
      spool_ref: sourceEventRef,
    });
    expect(() => materializeDirectOccurrence(serialized)).toThrow(
      "FIX09_OCCURRENCE_ORIGIN",
    );

    const first = await appendChainedOccurrences([direct]);
    const replay = await appendChainedOccurrences([spooled]);
    expect(first).toHaveLength(1);
    expect(replay).toEqual(first);
    const stored = await database.pool.query<{
      chain_version: number | null;
      capture_status: string;
      count: string;
    }>(`
      SELECT min(chain_version) AS chain_version,min(capture_status) AS capture_status,
        count(*)::text AS count FROM obs.occurrence
      WHERE source='first_party' AND source_event_ref=$1
    `, [sourceEventRef]);
    expect(stored.rows[0]).toEqual({ chain_version: null, capture_status: "PERSISTED", count: "1" });

    const concurrentRef = randomUUID();
    const concurrent = materializeDirectOccurrence(envelope(concurrentRef));
    const results = await Promise.all([
      appendChainedOccurrences([concurrent]),
      appendChainedOccurrences([concurrent]),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect((await database.pool.query(
      "SELECT 1 FROM obs.occurrence WHERE source_event_ref=$1",
      [concurrentRef],
    )).rowCount).toBe(1);

    const conflicting = Object.freeze(Object.assign(Object.create(null), direct, {
      fingerprint: "different",
    }));
    await expect(appendChainedOccurrences([conflicting]))
      .rejects.toThrow("FIX09_OCCURRENCE_CONFLICT");
  });
});
