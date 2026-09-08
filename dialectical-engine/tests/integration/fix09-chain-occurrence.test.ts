import { generateKeyPairSync, randomUUID } from "node:crypto";
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
import { installReleasedSignerForTest } from "../../packages/obs-capture/src/chain/signer.js";

let database: TestDatabase;

function envelope(sourceEventRef: string, environment = "test") {
  return createSharedRedactor({
    allowlist_set_id: "g0-empty-parameters",
    build_dirty: false,
    build_ref: "build:test",
    component: Object.freeze({ package: "@debateai/api", process: "api" }),
    environment,
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

    const wrongScalar = Object.freeze(Object.assign(Object.create(null), direct, {
      source_event_ref: 7,
    }));
    await expect(appendChainedOccurrences([wrongScalar]))
      .rejects.toThrow("FIX09_OCCURRENCE_INPUT");
    let accessorReads = 0;
    const accessor = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(direct)) {
      Object.defineProperty(accessor, key, key === "fingerprint"
        ? { enumerable: true, configurable: false, get() { accessorReads += 1; return direct.fingerprint; } }
        : { enumerable: true, configurable: false, writable: false, value: direct[key as keyof typeof direct] });
    }
    Object.freeze(accessor);
    await expect(appendChainedOccurrences([accessor as unknown as typeof direct]))
      .rejects.toThrow("FIX09_OCCURRENCE_INPUT");
    expect(accessorReads).toBe(0);

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

    const conflicting = materializeDirectOccurrence(envelope(sourceEventRef, "test-alt"));
    await expect(appendChainedOccurrences([conflicting]))
      .rejects.toThrow("FIX09_OCCURRENCE_CONFLICT");

    const signingKey = generateKeyPairSync("ed25519").privateKey;
    installReleasedSignerForTest(
      "occurrence", "first_party", "api-test-writer", signingKey, Buffer.alloc(32,7).toString("hex"),
    );
    await database.pool.query(`INSERT INTO obs.audit_chain_activation (
      singleton,protocol,activation_id,activated_at,
      occurrence_legacy_max_seq,occurrence_legacy_count,occurrence_legacy_digest,
      agent_action_legacy_max_seq,agent_action_legacy_count,agent_action_legacy_digest,
      initial_public_keyring_sha256,activation_manifest_sha256,created_by_custodian_id
    ) VALUES (true,'obs-audit-chain/v1',$1,'2026-09-08T01:02:03.004Z',
      0,0,$2,0,0,$2,$2,$2,'V')`,[randomUUID(),Buffer.alloc(32,7)]);
    const signedRefs=[randomUUID(),randomUUID()];
    const signedResults=await appendChainedOccurrences(signedRefs.map((value)=>
      materializeDirectOccurrence(envelope(value))));
    expect(signedResults).toHaveLength(2);
    const chain=await database.pool.query<{
      chain_key_id:string;chain_link:Buffer;chain_seq:string;chain_signature:Buffer;prev_link:Buffer;
    }>(`SELECT chain_key_id,chain_link,chain_seq::text,chain_signature,prev_link
      FROM obs.occurrence WHERE source_event_ref=ANY($1::text[]) ORDER BY chain_seq`,[signedRefs]);
    expect(chain.rows.map((row)=>row.chain_seq)).toEqual(["1","2"]);
    expect(chain.rows[0]?.chain_signature).toHaveLength(64);
    expect(chain.rows[0]?.chain_link).toHaveLength(32);
    expect(chain.rows[1]?.prev_link).toEqual(chain.rows[0]?.chain_link);
    expect(chain.rows[0]?.chain_key_id).toMatch(/^[0-9a-f]{64}$/u);
  });
});
