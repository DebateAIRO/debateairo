import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient, QUESTION_NOT_STARTED_KINDS, type AskRequest } from "@debateai/contract";

const ASK = {
  question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", plan_tier: "free",
  depth_params: { depth: 1 }, decision_scope: "test", as_of: "2026-10-21T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
} as AskRequest;

async function refused(status: number, body: unknown): Promise<ContractHttpError> {
  const client = createContractClient("https://api.debateai.test", (async () => Response.json(body, { status })) as typeof fetch);
  const error: unknown = await client.submitAsk(ASK).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ContractHttpError);
  return error as ContractHttpError;
}

describe("S04 contract refusal", () => {
  it.each(QUESTION_NOT_STARTED_KINDS)("a 422 body with kind %s yields questionNotStarted.kind", async (kind) => {
    const error = await refused(422, { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind });
    expect(error.questionNotStarted).toEqual({ kind });
    expect(error.serverCode).toBe("QUESTION_NOT_STARTED");
  });

  it("keeps serverCode but no kind for an unknown refusal kind", async () => {
    const error = await refused(422, { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: "UNKNOWN" });
    expect(error.questionNotStarted).toBeNull();
    expect(error.serverCode).toBe("QUESTION_NOT_STARTED");
  });

  it("keeps the 503 QUESTION_CHECK_UNAVAILABLE serverCode", async () => {
    const error = await refused(503, { error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" });
    expect(error.serverCode).toBe("QUESTION_CHECK_UNAVAILABLE");
    expect(error.questionNotStarted).toBeNull();
  });

  it("leaves a crisis 422 without questionNotStarted", async () => {
    const error = await refused(422, { error: "CRISIS_SUPPORT_OFFERED", message: "CRISIS_SUPPORT_OFFERED", country: "RO" });
    expect(error.questionNotStarted).toBeNull();
  });
});
