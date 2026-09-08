import { describe, expect, it } from "vitest";

import { computeProofWindow, GAP_QUERY, gapQueryParameters } from "../../tools/obs-listener/src/obsctl/proof-gap-window.js";

describe("FIX-10 proof gap window", () => {
  it("checked_W_and_Q_equations", () => {
    expect(computeProofWindow({ proofStalenessMs: 5, refreshIntervalMs: 7, skewToleranceMs: 11,
      flushIntervalMs: 13, quietWindowMs: 43 })).toEqual({ W: 43, Q: 54 });
    expect(() => computeProofWindow({ proofStalenessMs: 5, refreshIntervalMs: 7, skewToleranceMs: 11,
      flushIntervalMs: 13, quietWindowMs: 44 })).toThrow("FIX10_PROOF_WINDOW");
  });
  it("overflow_is_rejected", () => {
    expect(() => computeProofWindow({ proofStalenessMs: Number.MAX_SAFE_INTEGER, refreshIntervalMs: 1,
      skewToleranceMs: 1, flushIntervalMs: 1, quietWindowMs: Number.MAX_SAFE_INTEGER }))
      .toThrow("FIX10_PROOF_WINDOW");
  });
  it("query_is_overlap_complete", () => {
    expect(GAP_QUERY).toContain("closed_at IS NULL");
    expect(GAP_QUERY).toContain("closed_at > now()");
    expect(GAP_QUERY).toContain("opened_at > now()");
    expect(GAP_QUERY).not.toContain("source =");
  });
  it("parameter_order_is_source_end_start", () => {
    expect(gapQueryParameters(43, 11)).toEqual(["43", "11"]);
  });
  it.each(Array.from({ length: 24 }, (_, index) => index + 1))("gap_boundary_matrix_%i", (value) => {
    const result = computeProofWindow({ proofStalenessMs: value, refreshIntervalMs: value,
      skewToleranceMs: value, flushIntervalMs: value, quietWindowMs: value * 5 });
    expect(result).toEqual({ W: value * 5, Q: value * 6 });
  });
});
