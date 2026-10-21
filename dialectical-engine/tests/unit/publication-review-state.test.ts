import { describe, expect, it } from "vitest";
import { reviewStateOf, type PublicationReviewRecord } from "../../packages/serve/src/publication-review.js";

const ORIGIN = 3;
const otherOrigin = 9;
const refusalAt = new Date("2026-10-20T12:00:00.000Z");

function request(
  askOrdinal: 1 | 2,
  decision: PublicationReviewRecord["decision"] = null,
  originVersion = ORIGIN
): PublicationReviewRecord {
  return { originVersion, askOrdinal, decision };
}

describe("reviewStateOf", () => {
  it("offers the first ask when no request covers the origin", () => {
    expect(reviewStateOf([request(1, { outcome: "APPROVE", decidedAt: refusalAt }, otherOrigin)], ORIGIN))
      .toEqual({ state: "NONE", asksUsed: 0, mayAsk: true, refusal: null });
  });

  it("holds a pending first request", () => {
    expect(reviewStateOf([request(1)], ORIGIN))
      .toEqual({ state: "UNDER_REVIEW", asksUsed: 1, mayAsk: false, refusal: null });
  });

  it("keeps an approved origin approved", () => {
    expect(reviewStateOf([request(1, { outcome: "APPROVE", decidedAt: refusalAt })], ORIGIN))
      .toEqual({ state: "APPROVED", asksUsed: 1, mayAsk: false, refusal: null });
  });

  it("offers one more ask after the first refusal and shows its reason", () => {
    expect(reviewStateOf([request(1, { outcome: "REFUSE", reason: "First reason", decidedAt: refusalAt })], ORIGIN))
      .toEqual({ state: "REFUSED", asksUsed: 1, mayAsk: true,
        refusal: { reason: "First reason", decidedAt: refusalAt } });
  });

  it("uses the pending second ask over the decided first ask", () => {
    expect(reviewStateOf([
      request(2), request(1, { outcome: "REFUSE", reason: "Old reason", decidedAt: refusalAt })
    ], ORIGIN)).toEqual({ state: "UNDER_REVIEW", asksUsed: 2, mayAsk: false, refusal: null });
  });

  it("closes the ask path after a second refusal", () => {
    expect(reviewStateOf([
      request(1, { outcome: "REFUSE", reason: "Old reason", decidedAt: refusalAt }),
      request(2, { outcome: "REFUSE", reason: "Final reason", decidedAt: refusalAt })
    ], ORIGIN)).toEqual({ state: "REFUSED", asksUsed: 2, mayAsk: false,
      refusal: { reason: "Final reason", decidedAt: refusalAt } });
  });
});
