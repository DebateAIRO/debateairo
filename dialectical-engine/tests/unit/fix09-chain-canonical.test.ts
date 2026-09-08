import {
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  canonicalRowBytes,
  chainLink,
  genesisLink,
  keyIdFromPublicKey,
  signatureMessage,
  tagJsonb,
} from "../../packages/obs-capture/src/chain/canonical.js";
import { parseUniqueJson } from "../../packages/obs-capture/src/chain/unique-json.js";

function occurrenceRow(): Record<string, unknown> {
  return {
    chain_version: "1",
    chain_key_id: "a".repeat(64),
    chain_seq: "1",
    prev_link: "00".repeat(32),
    occurrence_id: "10000000-0000-4000-8000-000000000001",
    occ_seq: "7",
    occurred_at: "2026-09-08T00:00:00.123Z",
    captured_at: "2026-09-08T00:00:00.456Z",
    environment: "test",
    build_ref: "build-1",
    build_dirty: false,
    runtime: "api",
    component: { process: "api", package: "@debateai/api" },
    capture_point: "http",
    code: "OBS_TEST",
    taxonomy_class: "HTTP_FAILURE",
    severity: "SEVERE",
    condition_mark: null,
    disposition: "THROWN",
    fingerprint: "fp:test",
    fingerprint_version: "1",
    redaction_policy_version: "redaction-v1",
    allowlist_set_id: "allow-v1",
    fallback_minimized: false,
    capture_status: "PERSISTED",
    run_ref: "NOT_APPLICABLE",
    work_item_ref: "NOT_APPLICABLE",
    node_ref: "NOT_APPLICABLE",
    attempt_ref: "NOT_APPLICABLE",
    ledger_ref: "NOT_APPLICABLE",
    parent_occurrence_ref: "NO_CAUSE",
    cause_relation: null,
    at_seq_watermark: "NOT_APPLICABLE",
    frames: [],
    safe_template_id: "OBS_TEST",
    template_parameters: Object.create(null),
    source: "first_party",
    source_event_ref: "event-1",
    zone_context: false,
    attempt_index: null,
    writer_identity: "api-writer",
  };
}

describe("FIX-09 chain canonical protocol", () => {
  it("proves every public row, genesis, signature, link, JSON boundary, and mutation vector", () => {
    expect(parseUniqueJson('{"a":1,"b":[true,null]}')).toEqual({
      a: 1,
      b: [true, null],
    });
    expect(() => parseUniqueJson('{"a":1,"a":2}')).toThrow(
      "FIX09_DUPLICATE_JSON_MEMBER",
    );
    expect(() => parseUniqueJson('"\\ud800"')).toThrow(
      "FIX09_JSON_LONE_SURROGATE",
    );

    const ordered = Object.create(null) as Record<string, unknown>;
    ordered["\uffff"] = 1;
    ordered["😀"] = 2;
    expect(canonicalJson(ordered)).toBe('{"￿":1,"😀":2}');
    expect(tagJsonb({ b: [null, true, 2], a: "x" })).toEqual([
      "o",
      [
        ["a", ["s", "x"]],
        ["b", ["a", ["n"], ["b", true], ["i", "2"]]],
      ],
    ]);
    for (const hostile of [1.5, Number.MAX_SAFE_INTEGER + 1, 1n, Symbol("x")]) {
      expect(() => tagJsonb(hostile)).toThrow();
    }
    const accessor = Object.create(null);
    Object.defineProperty(accessor, "x", { enumerable: true, get: () => 1 });
    expect(() => tagJsonb(accessor)).toThrow("FIX09_JSON_DATA");
    const cycle: Record<string, unknown> = Object.create(null);
    cycle.self = cycle;
    expect(() => tagJsonb(cycle)).toThrow("FIX09_JSON_CYCLE");

    const row = occurrenceRow();
    const canonical = canonicalRowBytes("occurrence", row);
    expect(canonical.at(-1)).not.toBe(0x0a);
    expect(canonical.toString("utf8")).toContain(
      '["condition_mark","text",null]',
    );
    expect(canonicalRowBytes("occurrence", { ...row, condition_mark: "x" }))
      .not.toEqual(canonical);
    expect(() => canonicalRowBytes("occurrence", { ...row, extra: true }))
      .toThrow("FIX09_ROW_FIELDS");
    expect(() => canonicalRowBytes("occurrence", { ...row, occurred_at: "2026-09-08T00:00:00Z" }))
      .toThrow("FIX09_TIMESTAMP");

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const keyId = keyIdFromPublicKey(publicKey);
    expect(keyId).toMatch(/^[0-9a-f]{64}$/u);
    const message = signatureMessage(canonical);
    const signature = sign(null, message, privateKey);
    expect(signature).toHaveLength(64);
    expect(verify(null, message, publicKey, signature)).toBe(true);
    expect(verify(null, signatureMessage(Buffer.from(canonical).fill(0, 0, 1)), publicKey, signature))
      .toBe(false);
    expect(chainLink(canonical, signature)).toHaveLength(32);
    expect(() => chainLink(canonical, Buffer.alloc(63))).toThrow(
      "FIX09_SIGNATURE_LENGTH",
    );
    expect(
      genesisLink("occurrence", "first_party", "api-writer", Buffer.alloc(32, 7)),
    ).toHaveLength(32);
    expect(
      genesisLink("occurrence", "first_party", "api-writer", Buffer.alloc(32, 7)),
    ).not.toEqual(
      genesisLink("occurrence", "first_party", "other-writer", Buffer.alloc(32, 7)),
    );
  });
});
