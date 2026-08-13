import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  assertRatifiedMakerCount,
  buildCrossRootExchangePlan,
  buildFixedSingleRootServeNodes,
  buildMultiMakerExpansionPlan,
  createPostgresProviderGateway,
  partitionServedSegments,
  resolveExpansionDepth
} from "@debateai/runner";

describe("PANEL-01 multi-maker root authorship", () => {
  it("guards DR-159's envelope against more than the ratified two makers", () => {
    expect(() => assertRatifiedMakerCount(2)).not.toThrow();
    expect(() => assertRatifiedMakerCount(3)).toThrowError(expect.objectContaining({
      code: "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE"
    }));
  });

  it("grows each maker-authored root through its own B3-B tree", () => {
    expect(buildMultiMakerExpansionPlan(1, 2)).toEqual([
      { round: 1, rootIndex: 0, parentIndex: 0, childIndex: 2, polarity: "support", author: "secondary" },
      { round: 1, rootIndex: 0, parentIndex: 0, childIndex: 3, polarity: "attack", author: "secondary" },
      { round: 1, rootIndex: 1, parentIndex: 1, childIndex: 4, polarity: "support", author: "primary" },
      { round: 1, rootIndex: 1, parentIndex: 1, childIndex: 5, polarity: "attack", author: "primary" }
    ]);
  });

  it("has no FAIR-illegal one-maker branch in the multi-maker planner", () => {
    expect(() => buildMultiMakerExpansionPlan(1, 1)).toThrowError(expect.objectContaining({
      code: "MULTI_MAKER_PLAN_REQUIRES_TWO_MAKERS"
    }));
  });

  it("plans one ordered cross-root attack-and-defence exchange per maker", () => {
    expect(buildCrossRootExchangePlan(2)).toEqual([
      { author: "primary", authorRootIndex: 0, targetRootIndex: 1 },
      { author: "secondary", authorRootIndex: 1, targetRootIndex: 0 }
    ]);
  });

  it("observes DR-159 B2-A independently of the fixed-single-root guard", () => {
    const authoredRoots = [
      {
        nodeId: "node:primary",
        statement: "Primary position",
        wayOfKnowing: "REASONING" as const,
        provenanceRef: "artifact:primary",
        locator: null,
        restatementStatus: "PASS" as const
      },
      {
        nodeId: "node:secondary",
        statement: "Secondary position",
        wayOfKnowing: "REASONING" as const,
        provenanceRef: "artifact:secondary",
        locator: null,
        restatementStatus: "PASS" as const
      }
    ];

    expect(buildFixedSingleRootServeNodes(authoredRoots, "node:primary")).toEqual([{
      nodeId: "node:primary",
      text: "Primary position",
      wayOfKnowing: "REASONING",
      provenanceRef: "artifact:primary",
      locator: null,
      restatementStatus: "PASS",
      loadBearing: true
    }]);
    expect(() => buildFixedSingleRootServeNodes(authoredRoots, "node:absent")).toThrowError(
      expect.objectContaining({ code: "FIXED_SINGLE_ROOT_SERVE_VIOLATED" })
    );
  });
});

describe("PRO-01 depth-driven pro/con expansion", () => {
  it("reads the ruled depth from the pinned envelope basis and refuses an invalid value loudly", () => {
    expect(resolveExpansionDepth({ depth: 3 })).toBe(3);
    expect(() => resolveExpansionDepth({ depth: 0 })).toThrowError(expect.objectContaining({
      code: "RUN_DEPTH_PARAMS_INVALID"
    }));
    expect(() => resolveExpansionDepth({ depth: 6 })).toThrowError(expect.objectContaining({
      code: "RUN_DEPTH_PARAMS_INVALID"
    }));
    expect(() => resolveExpansionDepth({})).toThrowError(expect.objectContaining({
      code: "RUN_DEPTH_PARAMS_INVALID"
    }));
  });

  it("persists typed memory disclosure without adding a third conformance segment", () => {
    const composed = [
      { segmentId: "verdict", text: "Verdict", loadBearing: false, assertedNodeRefs: ["node:root"], servedNumberRefs: [] },
      { segmentId: "next", text: "Next", loadBearing: false, assertedNodeRefs: [], servedNumberRefs: [] }
    ] as const;

    const partitioned = partitionServedSegments(composed, "This answer builds on a prior answer.");

    expect(partitioned.conformanceSegments).toEqual(composed);
    expect(partitioned.persistedSegments).toHaveLength(3);
    expect(partitioned.persistedSegments[2]).toMatchObject({
      segmentId: "memory:disclosure",
      text: "This answer builds on a prior answer."
    });
  });

  it("stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path", async () => {
    const envelope = {
      max_model_attempts: 2,
      register_row_key: "runCostEnvelope",
      register_version: 1,
      source_ref: "test:DR-159",
      derived_from: { depth_params: { depth: 2 }, risk_tier: "standard" }
    } as const;
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT envelope_basis")) return { rows: [{ envelope_basis: envelope }] };
        if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "2" }] };
        throw new Error(`UNEXPECTED_QUERY:${sql}`);
      })
    } as unknown as Pool;
    const gateway = createPostgresProviderGateway(pool, {
      endpoint: "http://127.0.0.1:1",
      model: "test/model",
      maker: "test-maker"
    });

    await expect(gateway.call({
      runId: "run:depth-2",
      subjectItemId: "work:depth-2",
      callSiteKey: "JUDGE:defender:r2:p1",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 3, tokenCeiling: 64, deadlineMs: 1_000 },
      contractHash: "a".repeat(64),
      providerRef: "provider:test",
      packet: { messages: [{ role: "user", content: "defend" }] }
    })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
  });
});
