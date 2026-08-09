import { describe, expect, it, vi } from "vitest";
import { readLivenessPolicy } from "@debateai/register";

describe("S11 / AC-76 — liveness policy authority", () => {
  it("returns the exact class member with its register receipt", async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{
      value_json: {
        kind: "LIVENESS_POLICY",
        classes: { standard: { review_after_ms: 86_400_000, retire_after_ms: 15_552_000_000 } }
      },
      source_ref: "test-layer:DR-015-016"
    }] })) };
    await expect(readLivenessPolicy(pool as never, 3, "standard")).resolves.toEqual({
      rowKey: "livenessPolicy",
      registerVersion: 3,
      sourceRef: "test-layer:DR-015-016",
      questionClass: "standard",
      reviewAfterMs: 86_400_000,
      retireAfterMs: 15_552_000_000
    });
  });

  it("fails typed-loud when the row or requested class is absent", async () => {
    const absent = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(readLivenessPolicy(absent as never, 3, "standard"))
      .rejects.toMatchObject({ code: "LIVENESS_POLICY_UNRESOLVED" });

    const wrongClass = { query: vi.fn(async () => ({ rows: [{
      value_json: { kind: "LIVENESS_POLICY", classes: { fast: { review_after_ms: 1, retire_after_ms: 2 } } },
      source_ref: "test-layer:DR-015-016"
    }] })) };
    await expect(readLivenessPolicy(wrongClass as never, 3, "standard"))
      .rejects.toMatchObject({ code: "LIVENESS_POLICY_INVALID" });
  });
});
