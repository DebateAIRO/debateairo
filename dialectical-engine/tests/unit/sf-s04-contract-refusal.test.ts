import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient, type AskRequest } from "@debateai/contract";

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
  // Property (V, 2026-10-28): any subject id from the subjects file reaches the screen with its screen and emergency number,
  // including a subject added after this client was built.
  it.each([
    ["DRUGS", "REFUSE", false], ["HARM_TO_OTHERS", "REFUSE", true], ["SUICIDE_AND_ASSISTED_DYING", "SENSITIVE", false],
    ["GAMBLING", "REFUSE", false]
  ] as const)("a 422 body with kind %s yields its screen", async (kind, screen, emergency) => {
    const error = await refused(422, { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind, screen,
      emergency_number: emergency });
    expect(error.questionNotStarted).toEqual({ kind, screen, emergencyNumber: emergency });
    expect(error.serverCode).toBe("QUESTION_NOT_STARTED");
  });

  it.each([
    ["a lowercase kind", { kind: "drugs", screen: "REFUSE", emergency_number: false }],
    ["no screen", { kind: "DRUGS", emergency_number: false }],
    ["the crisis screen", { kind: "DRUGS", screen: "HELP_NUMBERS", emergency_number: false }],
    ["no emergency flag", { kind: "DRUGS", screen: "REFUSE" }],
    ["an extra key", { kind: "DRUGS", screen: "REFUSE", emergency_number: false, kept: true }]
  ])("keeps serverCode but no refusal for %s", async (_name, fields) => {
    const error = await refused(422, { error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", ...fields });
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
