import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
  readClaimTypeCompositionMap
} from "@debateai/register";

describe("DR-128 claim-type composition register reader", () => {
  it("uses the minted key and fails typed-loud when V has supplied no value row", async () => {
    expect(CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY).toBe("claimTypeCompositionMap");
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;

    await expect(readClaimTypeCompositionMap(pool, 1)).rejects.toMatchObject({
      code: "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED"
    });
  });

  it("rejects a present row whose value violates the declared member type", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      row_key: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
      value_json: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: { unknown: { branch: "EVIDENCE_AWARE" } } },
      source_ref: "test-layer:invalid-member"
    }] }) } as unknown as Pool;

    await expect(readClaimTypeCompositionMap(pool, 1)).rejects.toMatchObject({
      code: "CLAIM_TYPE_COMPOSITION_MAP_INVALID"
    });
  });
});
