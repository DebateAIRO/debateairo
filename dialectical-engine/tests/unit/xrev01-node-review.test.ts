import { describe, expect, it, vi } from "vitest";
import { REVIEW_OUTCOMES } from "@debateai/kernel";
import { Judge } from "@debateai/judgement";
import { resolveExpansionDepth, selectDifferentMakerReviewer } from "@debateai/runner";
import type { ProviderGateway } from "@debateai/providers";
import type { Pool } from "pg";
import { createPostgresProviderGateway } from "@debateai/runner";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";

describe("XREV-01 cross-maker node review", () => {
  it("mints the closed outcome vocabulary once in the kernel", () => {
    expect(REVIEW_OUTCOMES).toEqual(["agree", "dispute", "cannot-assess"]);
  });

  it("selects any configured maker other than the author without assuming a pair", () => {
    const makers = [
      { maker: "house-a", value: 1 },
      { maker: "house-b", value: 2 },
      { maker: "house-c", value: 3 }
    ] as const;
    expect(selectDifferentMakerReviewer("house-a", makers)).toBe(makers[1]);
    expect(selectDifferentMakerReviewer("house-b", makers)).toBe(makers[0]);
    expect(() => selectDifferentMakerReviewer("house-a", [makers[0]])).toThrowError(
      expect.objectContaining({ code: "DIFFERENT_MAKER_REVIEWER_UNAVAILABLE" })
    );
  });

  it("rotates away from the last recorded reviewer when a third maker gives a lawful choice", () => {
    const makers = [
      { maker: "house-a", value: 1 },
      { maker: "house-b", value: 2 },
      { maker: "house-c", value: 3 }
    ] as const;

    expect(selectDifferentMakerReviewer("house-a", makers, "house-b")).toBe(makers[2]);
    expect(selectDifferentMakerReviewer("house-a", makers, "house-c")).toBe(makers[1]);
    // Removing the third member leaves the ratified M=2 policy byte-stable:
    // the sole different-maker reviewer remains selected on every review.
    expect(selectDifferentMakerReviewer("house-a", makers.slice(0, 2), "house-b")).toBe(makers[1]);
  });

  it("pins the single depth authority at 1..5 after the coverage-table guard retires", () => {
    for (const depth of [1, 2, 3, 4, 5]) expect(resolveExpansionDepth({ depth })).toBe(depth);
    expect(() => resolveExpansionDepth({ depth: 6 })).toThrowError(expect.objectContaining({
      code: "RUN_DEPTH_PARAMS_INVALID"
    }));
  });

  it("records the review model's own typed outcome and artifact lineage", async () => {
    const call = vi.fn(async () => ({
      rawArtifactRef: "artifact:review",
      ledgerEntryRef: "ledger:review",
      content: JSON.stringify({ outcome: "dispute", reasons: ["The conclusion outruns the supplied premise."] }),
      provider: "test",
      model: "model-b",
      maker: "house-b",
      modelVersion: "model-b"
    }));
    const reviewer = new Judge({ call } as ProviderGateway);

    await expect(reviewer.review({
      runId: "run:test",
      subjectItemId: "work:test",
      callSiteKey: "JUDGE:review:node:test",
      questionLine: "Should the proposal stand?",
      statement: "The proposal should stand.",
      authorMaker: "house-a",
      providerRef: "provider:b",
      contractHash: "b".repeat(64),
      bound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 }
    })).resolves.toMatchObject({
      outcome: "dispute",
      reasons: ["The conclusion outruns the supplied premise."],
      provenanceRef: "artifact:review"
    });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      role: "JUDGE",
      callSiteKey: "JUDGE:review:node:test"
    }));
  });

  it("stops a review loudly when the ratified model-call envelope is exhausted", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT envelope_basis")) {
          return { rows: [{ envelope_basis: fixtureStructuralCeiling(8, 2, 1) }] };
        }
        if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "8" }] };
        throw new Error(`UNEXPECTED_QUERY:${sql}`);
      })
    } as unknown as Pool;
    const gateway = createPostgresProviderGateway(pool, {
      endpoint: "http://127.0.0.1:1",
      model: "test/model",
      maker: "reviewer"
    });

    await expect(gateway.call({
      runId: "run:review-exhausted",
      subjectItemId: "work:review-exhausted",
      callSiteKey: "JUDGE:review:node:8",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 1_000 },
      contractHash: "c".repeat(64),
      providerRef: "provider:reviewer",
      packet: { messages: [{ role: "user", content: "review" }] }
    })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
  });
});
