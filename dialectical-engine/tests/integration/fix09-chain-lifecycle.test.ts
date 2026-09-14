import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  appendChainedOccurrences,
  configureOccurrenceGatewayForTest,
  materializeDirectOccurrence,
} from "../../packages/obs-capture/src/chain/occurrence-gateway.js";
import { installReleasedSignerForTest } from "../../packages/obs-capture/src/chain/signer.js";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

function occurrence(sourceEventRef: string, writerIdentity = "api-lifecycle-writer") {
  const envelope = createSharedRedactor({
    allowlist_set_id: "g0-empty-parameters", build_dirty: false, build_ref: "build:lifecycle",
    component: Object.freeze({ package: "@debateai/api", process: "api" }), environment: "test",
    now: () => new Date("2026-09-08T01:02:03.004Z"), redaction_policy_version: "g0",
    runtime: "api", sourceEventRef: () => sourceEventRef, writer_identity: writerIdentity,
  }).redact(Object.freeze({
    ambient_context_ref: undefined, kind: "envelope" as const,
    payload_ref: Object.freeze({ capture_point: "self", code: "OBS_CAPTURE_SELF",
      disposition: "SELF", source: "first_party", taxonomy_class: "CAPTURE_SELF" }),
  }));
  return materializeDirectOccurrence(envelope);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  configureOccurrenceGatewayForTest(database.pool);
  await database.pool.query(`INSERT INTO obs.audit_chain_activation (
    singleton,protocol,activation_id,activated_at,
    occurrence_legacy_max_seq,occurrence_legacy_count,occurrence_legacy_digest,
    agent_action_legacy_max_seq,agent_action_legacy_count,agent_action_legacy_digest,
    initial_public_keyring_sha256,activation_manifest_sha256,created_by_custodian_id
  ) VALUES (true,'obs-audit-chain/v1',$1,'2026-09-08T01:02:03.004Z',
    0,0,$2,0,0,$2,$2,$2,'V')`,[randomUUID(),Buffer.alloc(32,9)]);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 chain lifecycle on real PostgreSQL", () => {
  it("proves activation, planned rotation, V-signed recovery, forward rollback, and fail-closed loss", async () => {
    const absent = occurrence(randomUUID());
    await expect(appendChainedOccurrences([absent])).rejects.toThrow("FIX09_SIGNER_UNAVAILABLE");
    expect((await database.pool.query("SELECT 1 FROM obs.occurrence WHERE source_event_ref=$1",[
      absent.source_event_ref,
    ])).rowCount).toBe(0);

    installReleasedSignerForTest(
      "occurrence","first_party","wrong-writer",generateKeyPairSync("ed25519").privateKey,
      Buffer.alloc(32,9).toString("hex"),
    );
    const mismatched = occurrence(randomUUID());
    await expect(appendChainedOccurrences([mismatched])).rejects.toThrow("FIX09_SIGNER_UNAVAILABLE");
    expect((await database.pool.query("SELECT 1 FROM obs.occurrence WHERE source_event_ref=$1",[
      mismatched.source_event_ref,
    ])).rowCount).toBe(0);

    const firstKey = generateKeyPairSync("ed25519").privateKey;
    installReleasedSignerForTest(
      "occurrence","first_party","api-lifecycle-writer",firstKey,Buffer.alloc(32,8).toString("hex"),
    );
    await expect(appendChainedOccurrences([occurrence(randomUUID())]))
      .rejects.toThrow("FIX09_SIGNER_ACTIVATION");
    installReleasedSignerForTest(
      "occurrence","first_party","api-lifecycle-writer",firstKey,Buffer.alloc(32,9).toString("hex"),
    );
    const first = occurrence(randomUUID());
    await appendChainedOccurrences([first]);
    const firstStored = await database.pool.query<{chain_key_id:string;chain_link:Buffer}>(
      "SELECT chain_key_id,chain_link FROM obs.occurrence WHERE source_event_ref=$1",[first.source_event_ref],
    );
    const second = occurrence(randomUUID());
    await appendChainedOccurrences([second]);
    const secondStored = await database.pool.query<{chain_key_id:string;prev_link:Buffer}>(
      "SELECT chain_key_id,prev_link FROM obs.occurrence WHERE source_event_ref=$1",[second.source_event_ref],
    );
    expect(secondStored.rows[0]?.chain_key_id).toBe(firstStored.rows[0]?.chain_key_id);
    expect(secondStored.rows[0]?.prev_link).toEqual(firstStored.rows[0]?.chain_link);

    const rotatedKey = generateKeyPairSync("ed25519").privateKey;
    installReleasedSignerForTest(
      "occurrence","first_party","api-lifecycle-writer",rotatedKey,Buffer.alloc(32,9).toString("hex"),
    );
    const rotated = occurrence(randomUUID());
    await appendChainedOccurrences([rotated]);
    const rotatedStored = await database.pool.query<{chain_key_id:string;chain_seq:string;prev_link:Buffer}>(
      "SELECT chain_key_id,chain_seq::text,prev_link FROM obs.occurrence WHERE source_event_ref=$1",
      [rotated.source_event_ref],
    );
    expect(rotatedStored.rows[0]?.chain_key_id).not.toBe(firstStored.rows[0]?.chain_key_id);
    expect(rotatedStored.rows[0]?.chain_seq).toBe("3");
  });
});
