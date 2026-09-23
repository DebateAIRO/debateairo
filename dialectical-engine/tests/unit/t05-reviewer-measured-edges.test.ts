import { describe, expect, it, vi } from "vitest";
import { STRENGTH_SOURCES } from "@debateai/kernel";
import { Judge } from "@debateai/judgement";
import type { ProviderGateway } from "@debateai/providers";

/**
 * T5 (goal 144-159; rulings S3-1, S4-1) — the reviewer measures the edges it
 * is already looking at.
 *
 * S3-1 puts the measurement inside the EXISTING cross-maker review visit: zero
 * extra calls, different-maker measurement. S4-1 keeps panel judging and review
 * separate, so nothing here touches `Judge.assess`.
 */

const bound = { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 } as const;

function gatewayReturning(content: string): { readonly gateway: ProviderGateway; readonly call: ReturnType<typeof vi.fn> } {
  const call = vi.fn(async () => ({
    rawArtifactRef: "artifact:review",
    ledgerEntryRef: "ledger:review",
    content,
    provider: "test",
    model: "model-b",
    maker: "house-b",
    modelVersion: "model-b"
  }));
  return { gateway: { call } as unknown as ProviderGateway, call };
}

const subject = {
  runId: "run:t05",
  subjectItemId: "work:t05",
  callSiteKey: "JUDGE:review:node:child",
  questionLine: "Should the proposal stand?",
  statement: "The proposal rests on a measurement nobody has taken.",
  authorMaker: "house-a",
  providerRef: "provider:b",
  contractHash: "b".repeat(64),
  bound
} as const;

const twoEdges = [
  { edgeId: "edge:child-to-root", targetStatement: "The proposal should stand.", polarity: "attack" },
  { edgeId: "edge:child-to-sibling", targetStatement: "A sibling position.", polarity: "support" }
] as const;

describe("T5 · the review call carries the edge measurements (S3-1, S4-1)", () => {
  it("returns one bearing per edge sourced by the reviewed node, from a SINGLE model call", async () => {
    const { gateway, call } = gatewayReturning(JSON.stringify({
      outcome: "dispute",
      reasons: ["The conclusion outruns the supplied premise."],
      edge_bearings: [0.75, 0.2]
    }));

    const reviewed = await new Judge(gateway).review({ ...subject, edges: twoEdges });

    // ALL of the reviewed node's edge measurements arrive on the one review
    // call — this is the zero-extra-calls half of S3-1.
    expect(call).toHaveBeenCalledTimes(1);
    expect(reviewed.edgeMeasurements).toEqual([
      { edgeId: "edge:child-to-root", bearing: 0.75 },
      { edgeId: "edge:child-to-sibling", bearing: 0.2 }
    ]);
    expect(reviewed.outcome).toBe("dispute");
  });

  it("carries the edges into the one prompt it sends, so no second call could be needed", async () => {
    const { gateway, call } = gatewayReturning(JSON.stringify({
      outcome: "agree",
      reasons: ["Sound."],
      edge_bearings: [0.5, 0.5]
    }));

    await new Judge(gateway).review({ ...subject, edges: twoEdges });

    const packet = JSON.stringify(call.mock.calls[0]![0].packet);
    expect(packet).toContain("The proposal should stand.");
    expect(packet).toContain("A sibling position.");
  });

  it("reports cannot-assess per edge as a null bearing, which leaves that edge unmeasured", async () => {
    const { gateway } = gatewayReturning(JSON.stringify({
      outcome: "cannot-assess",
      reasons: ["The supplied material does not support an honest bearing."],
      edge_bearings: [null, 0.4]
    }));

    const reviewed = await new Judge(gateway).review({ ...subject, edges: twoEdges });

    expect(reviewed.edgeMeasurements).toEqual([
      { edgeId: "edge:child-to-root", bearing: null },
      { edgeId: "edge:child-to-sibling", bearing: 0.4 }
    ]);
  });

  it("refuses a review that does not measure EVERY supplied edge", async () => {
    const { gateway } = gatewayReturning(JSON.stringify({
      outcome: "agree",
      reasons: ["Sound."],
      edge_bearings: [0.75]
    }));

    await expect(new Judge(gateway).review({ ...subject, edges: twoEdges })).rejects.toThrowError(
      expect.objectContaining({ code: "NODE_REVIEW_SCHEMA_FAILURE" })
    );
  });

  it("refuses a bearing outside the 0-1 interval", async () => {
    const { gateway } = gatewayReturning(JSON.stringify({
      outcome: "agree",
      reasons: ["Sound."],
      edge_bearings: [1.4, 0.2]
    }));

    await expect(new Judge(gateway).review({ ...subject, edges: twoEdges })).rejects.toThrowError(
      expect.objectContaining({ code: "NODE_REVIEW_SCHEMA_FAILURE" })
    );
  });

  it("still reviews a node that sources no edges, and measures nothing", async () => {
    const { gateway, call } = gatewayReturning(JSON.stringify({
      outcome: "agree",
      reasons: ["Sound."],
      edge_bearings: []
    }));

    const reviewed = await new Judge(gateway).review({ ...subject, edges: [] });

    expect(call).toHaveBeenCalledTimes(1);
    expect(reviewed.edgeMeasurements).toEqual([]);
  });
});

describe("T5 · the strength stamp names the role that actually measures", () => {
  it("mints REVIEWER in the kernel vocabulary and retires the evidence-verifier stamp", () => {
    expect(STRENGTH_SOURCES).toEqual(["REVIEWER", "CLUSTER_COLLAPSE", "UNDERCUT_TRANSMISSION"]);
  });
});
