import { describe, expect, it, vi } from "vitest";
import {
  decideRetirement,
  foldStaleness,
  planAffectedReassessment,
  propagateAffectedNodes,
  type LivenessPolicyReceipt
} from "@debateai/liveness";

const policy: LivenessPolicyReceipt = Object.freeze({
  rowKey: "livenessPolicy",
  registerVersion: 7,
  sourceRef: "register:test-layer:liveness",
  questionClass: "standard",
  reviewAfterMs: 86_400_000,
  retireAfterMs: 180 * 86_400_000
});

describe("S11 / DR-015 / FX-C52-05 — snapshot, wake, and visible staleness", () => {
  it("projects a fired trigger as STALE without mutating the snapshot", () => {
    const input = Object.freeze({
      relevantAsOf: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-02T00:00:00Z"),
      reviewDueAt: new Date("2026-02-01T00:00:00Z"),
      triggerEvents: Object.freeze([
        Object.freeze({ triggerKey: "provider:model", state: "FIRED" as const, atSequence: 11 })
      ]),
      stateEvents: Object.freeze([])
    });

    expect(foldStaleness(input)).toEqual({
      state: "STALE",
      badge: "STALE",
      relevantAsOf: "2026-01-01T00:00:00.000Z",
      basis: "FIRED_TRIGGER"
    });
    expect(input.triggerEvents).toHaveLength(1);
  });

  it("derives TTL expiry on every read and keeps a future clock FRESH", () => {
    const shared = {
      relevantAsOf: new Date("2026-01-01T00:00:00Z"),
      triggerEvents: [],
      stateEvents: []
    } as const;
    expect(foldStaleness({ ...shared, now: new Date("2026-01-03T00:00:00Z"), reviewDueAt: new Date("2026-01-02T00:00:00Z") }))
      .toMatchObject({ state: "UNDER_REVIEW", badge: "UNDER-REVIEW", basis: "TTL_EXPIRED" });
    expect(foldStaleness({ ...shared, now: new Date("2026-01-01T12:00:00Z"), reviewDueAt: new Date("2026-01-02T00:00:00Z") }))
      .toMatchObject({ state: "FRESH", badge: null });
  });
});

describe("S11 / DR-015 — affected-only child-to-parent propagation", () => {
  it("recomputes arithmetic for affected ancestors and rejudges only those nodes", async () => {
    const plan = planAffectedReassessment("leaf", [
      { nodeId: "root", parentNodeId: null },
      { nodeId: "sibling", parentNodeId: "root" },
      { nodeId: "leaf", parentNodeId: "root" }
    ]);
    expect(plan).toEqual({ affectedNodeIds: ["leaf", "root"], rejudgeNodeIds: ["leaf", "root"] });

    const recomputeArithmetic = vi.fn(async () => undefined);
    const rejudgeNode = vi.fn(async (_nodeId: string) => undefined);
    await propagateAffectedNodes(plan, {
      recordedArrowOrder: ["arrow:leaf-root"],
      recomputeArithmetic,
      rejudgeNode
    });
    expect(recomputeArithmetic).toHaveBeenCalledWith(["leaf", "root"], ["arrow:leaf-root"]);
    expect(rejudgeNode.mock.calls.map(([nodeId]) => nodeId)).toEqual(["leaf", "root"]);
    expect(rejudgeNode).not.toHaveBeenCalledWith("sibling");
  });
});

describe("S11 / DR-016 — composite archival", () => {
  it("archives only after the register window and with no open trigger", () => {
    const expired = {
      now: new Date("2026-08-01T00:00:00Z"),
      lastQueriedAt: new Date("2026-01-01T00:00:00Z"),
      policy
    } as const;
    expect(decideRetirement({ ...expired, hasOpenRevisionTrigger: false, underExplored: true })).toEqual({ kind: "ARCHIVE" });
    expect(decideRetirement({ ...expired, hasOpenRevisionTrigger: true, underExplored: false })).toEqual({ kind: "KEEP", reason: "OPEN_REVISION_TRIGGER" });
    expect(decideRetirement({ ...expired, lastQueriedAt: new Date("2026-07-01T00:00:00Z"), hasOpenRevisionTrigger: false, underExplored: false }))
      .toEqual({ kind: "KEEP", reason: "RECENT_QUERY" });
  });
});
