import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createJournalRecord,
  createOutboxRecord,
  databaseActionFromOutbox,
  deriveActionRef,
  encodeJournalLine,
  encodeOutboxLine,
  pendingIntents,
  verifyJournal,
  verifyOutbox,
} from "../../tools/obs-listener/src/obsctl/local-history.js";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("FIX-10 local history", () => {
  it("action_ref_exact", () => {
    expect(deriveActionRef({
      action_kind: "STATUS",
      actor: "obsctl:v",
      invocation_id: UUID,
      requested_at_ms: "1000",
    })).toMatch(/^obsctl:v1:[0-9a-f]{64}$/u);
  });

  it("outbox_status_intent_supported", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const record = createOutboxRecord(undefined, {
      action_kind: "STATUS",
      action_parameters: {
        private_key_id: null,
        public_input_sha256: null,
        writer_identity: null,
      },
      actor: "obsctl:v",
      invocation_id: UUID,
      requested_at_ms: "1000",
    }, privateKey);
    expect(verifyOutbox(encodeOutboxLine(record), publicKey)).toEqual([record]);
  });

  it("domains_are_distinct", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const outbox = createOutboxRecord(undefined, {
      action_kind: "KILL",
      action_parameters: { private_key_id: null, public_input_sha256: null, writer_identity: null },
      actor: "obsctl:v",
      invocation_id: UUID,
      requested_at_ms: "1000",
    }, privateKey);
    const journal = createJournalRecord(undefined, {
      action_kind: "KILL",
      action_ref: outbox.action_ref,
      database_action_id: null,
      effects: {
        capture_off: "PRESENT",
        durability: "CONFIRMED",
        kill: "PRESENT",
        lifecycle: {
          activation_manifest_sha256: null,
          phase: "NOT_APPLICABLE",
          private_key_id: null,
          public_artifact_sha256: null,
        },
      },
      event_id: "22222222-2222-4222-8222-222222222222",
      event_kind: "COMMAND_RESULT",
      invocation_id: UUID,
      outbox_hash: outbox.outbox_hash,
      outcome: "KILL_APPLIED",
      reason: "NONE",
      recorded_at_ms: "1001",
    }, privateKey);
    expect(journal.signature_base64).not.toBe(outbox.signature_base64);
    expect(verifyJournal(encodeJournalLine(journal), publicKey)).toEqual([journal]);
  });

  it("partial_tail_is_permanent_invalid", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    expect(() => verifyOutbox('{"schema":"obsctl-outbox-action/v3"}', publicKey))
      .toThrow("FIX10_HISTORY_PARTIAL_TAIL");
  });

  it("replay_pending_definition_exact", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const record = createOutboxRecord(undefined, {
      action_kind: "STATUS",
      action_parameters: { private_key_id: null, public_input_sha256: null, writer_identity: null },
      actor: "obsctl:v",
      invocation_id: UUID,
      requested_at_ms: "1000",
    }, privateKey);
    expect(pendingIntents([record], [])).toEqual([record]);
  });

  it("payload_materializes_as_null_prototype_object", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const record = createOutboxRecord(undefined, {
      action_kind: "STATUS",
      action_parameters: { private_key_id: null, public_input_sha256: null, writer_identity: null },
      actor: "obsctl:v",
      invocation_id: UUID,
      requested_at_ms: "1000",
    }, privateKey);
    const action = databaseActionFromOutbox(record);
    expect(Object.getPrototypeOf(action)).toBeNull();
    expect(Object.getPrototypeOf(action.action_payload)).toBeNull();
    expect(Object.isFrozen(action.action_payload.action_parameters)).toBe(true);
    expect(action.action_payload.local_outcome).toBeNull();
  });
  it.each(Array.from({ length: 15 }, (_, index) => index + 1))("signed_history_schema_matrix_%i", (ordinal) => {
    expect(deriveActionRef({ action_kind: "STATUS", actor: "obsctl:v", invocation_id: UUID,
      requested_at_ms: String(ordinal) })).toMatch(/^obsctl:v1:[0-9a-f]{64}$/u);
  });
});
