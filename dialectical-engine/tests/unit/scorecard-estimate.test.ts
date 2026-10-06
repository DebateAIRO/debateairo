import { describe, expect, it } from "vitest";
import type { DebateRole } from "@debateai/kernel";
import { chargeMicrosForUsage } from "@debateai/budget";
import { estimateRunCost, typicalCallMicros, type RoleAssignment, type RoleSeat, type SeatCandidate } from "@debateai/scorecard";
import { roleNumbers, testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";

describe("typicalCallMicros — the budget's own arithmetic on a typical call", () => {
  it.each([
    { inputTokens: 1000, outputTokens: 500, thinkingTokens: 250, input: 1_250_000, output: 10_000_000 },
    { inputTokens: 1, outputTokens: 1, thinkingTokens: null, input: 1, output: 1 },
    { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, input: 5, output: 5 },
    { inputTokens: 123_457, outputTokens: 9_999, thinkingTokens: 77, input: 3_000_000, output: 15_000_000 }
  ])("prices $inputTokens in / $outputTokens out / $thinkingTokens thinking as chargeMicrosForUsage does", (row) => {
    const typicalCall = { inputTokens: row.inputTokens, outputTokens: row.outputTokens, thinkingTokens: row.thinkingTokens, seconds: 1 };
    expect(typicalCallMicros(typicalCall, { inputMicrosPerMTok: row.input, outputMicrosPerMTok: row.output })).toBe(
      chargeMicrosForUsage(
        { inputMicrosPerMillionTokens: row.input, outputMicrosPerMillionTokens: row.output },
        { promptTokens: row.inputTokens, completionTokens: row.outputTokens + (row.thinkingTokens ?? 0) }
      )
    );
  });

  it("bills thinking tokens as output and rounds each side up to a whole micro", () => {
    expect(typicalCallMicros({ inputTokens: 1000, outputTokens: 500, thinkingTokens: 250, seconds: 1 },
      { inputMicrosPerMTok: 1_250_000, outputMicrosPerMTok: 10_000_000 })).toBe(8750);
    expect(typicalCallMicros({ inputTokens: 1, outputTokens: 1, thinkingTokens: null, seconds: 1 },
      { inputMicrosPerMTok: 1, outputMicrosPerMTok: 1 })).toBe(2);
  });

  it("has no figure for a price that is not two non-negative safe integers", () => {
    const call = { inputTokens: 1, outputTokens: 1, thinkingTokens: null, seconds: 1 };
    expect(typicalCallMicros(call, { inputMicrosPerMTok: 1.5, outputMicrosPerMTok: 1 })).toBeNull();
    expect(typicalCallMicros(call, { inputMicrosPerMTok: -1, outputMicrosPerMTok: 1 })).toBeNull();
  });
});

describe("estimateRunCost", () => {
  const scorecard = testScorecard(
    [testCandidate("a", "OpenAI"), testCandidate("b", "Anthropic"), testCandidate("c", "Google"), testCandidate("d", "xAI")],
    { POSITION: [testEntry("a", 90, 10), testEntry("b", 88, 20), testEntry("c", 80, 5)], JUDGE: [testEntry("d", 80, 12.5)] }
  );
  const candidate = (id: string, maker: string): SeatCandidate => ({
    candidateId: id, providerRef: `provider:${id}`, maker, modelId: `model-${id}`, thinkingLevel: "DEFAULT_ONLY"
  });
  const assignmentWith = (roles: Partial<Record<DebateRole, readonly RoleSeat[]>>): RoleAssignment => ({
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: { POSITION: [], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [], JUDGE: [], REVIEWER: [], ANSWER_WRITER: [], ANSWER_CHECKER: [], ...roles }
  });
  const position: readonly RoleSeat[] = [
    { seatIndex: 0, main: candidate("a", "OpenAI"), runnerUp: candidate("b", "Anthropic"), diversityShare: 0.25, source: "SCORECARD" },
    { seatIndex: 1, main: candidate("c", "Google"), runnerUp: null, diversityShare: 0, source: "SCORECARD" }
  ];
  const fallbackJudge: readonly RoleSeat[] = [
    { seatIndex: 0, main: { ...candidate("x", "xAI"), candidateId: null }, runnerUp: null, diversityShare: 0, source: "FALLBACK" }
  ];
  // 1000 input tokens per testEntry call: a = 100, b = 200, c = 50, d = 2 (1.5 rounded up) micros per call.
  const prices = new Map([
    ["provider:a", { inputMicrosPerMTok: 100_000, outputMicrosPerMTok: 0 }],
    ["provider:b", { inputMicrosPerMTok: 200_000, outputMicrosPerMTok: 0 }],
    ["provider:c", { inputMicrosPerMTok: 50_000, outputMicrosPerMTok: 0 }],
    ["provider:d", { inputMicrosPerMTok: 1_500, outputMicrosPerMTok: 0 }]
  ]);

  it("HOSTED: expected calls × typical call × configured price, the runner-up weighted by its share", () => {
    // 8 calls over 2 seats: seat 0 = 3 × a + 1 × b, seat 1 = 4 × c.
    expect(estimateRunCost({ assignment: assignmentWith({ POSITION: position }), expectedCallsByRole: roleNumbers({ POSITION: 8 }), scorecard, prices, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: 700, seconds: 70 });
  });

  it("LOCAL: the same sum in seconds, and no money", () => {
    expect(estimateRunCost({ assignment: assignmentWith({ POSITION: position }), expectedCallsByRole: roleNumbers({ POSITION: 8 }), scorecard, prices, mode: "LOCAL" }))
      .toEqual({ mode: "LOCAL", moneyMicros: null, seconds: 70 });
  });

  it("has no money figure when a seated route has no price", () => {
    const unpriced = new Map([...prices].filter(([providerRef]) => providerRef !== "provider:c"));
    expect(estimateRunCost({ assignment: assignmentWith({ POSITION: position }), expectedCallsByRole: roleNumbers({ POSITION: 8 }), scorecard, prices: unpriced, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: null, seconds: 70 });
  });

  it("has no figure at all for a FALLBACK seat that is called, and ignores one that is not", () => {
    expect(estimateRunCost({ assignment: assignmentWith({ JUDGE: fallbackJudge }), expectedCallsByRole: roleNumbers({ JUDGE: 3 }), scorecard, prices, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: null, seconds: null });
    expect(estimateRunCost({
      assignment: assignmentWith({ POSITION: position, JUDGE: fallbackJudge }),
      expectedCallsByRole: roleNumbers({ POSITION: 8, JUDGE: 0 }), scorecard, prices, mode: "HOSTED"
    })).toEqual({ mode: "HOSTED", moneyMicros: 700, seconds: 70 });
  });

  it("prices a CROSS_EXCHANGE call from the candidate's POSITION entry when it has no CROSS_EXCHANGE entry (F28)", () => {
    // This scorecard lists no CROSS_EXCHANGE entry at all; CROSS_EXCHANGE seats are POSITION's seats (R5).
    expect(estimateRunCost({ assignment: assignmentWith({ CROSS_EXCHANGE: position }), expectedCallsByRole: roleNumbers({ CROSS_EXCHANGE: 8 }), scorecard, prices, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: 700, seconds: 70 });
    // Any other role keeps the rule: no entry for the role, no figure.
    expect(estimateRunCost({ assignment: assignmentWith({ SUPPORT_ATTACK: position }), expectedCallsByRole: roleNumbers({ SUPPORT_ATTACK: 8 }), scorecard, prices, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: null, seconds: null });
  });

  it("rounds each total up to a whole micro and a whole second", () => {
    const judge: readonly RoleSeat[] = [{ seatIndex: 0, main: candidate("d", "xAI"), runnerUp: null, diversityShare: 0, source: "SCORECARD" }];
    expect(estimateRunCost({ assignment: assignmentWith({ JUDGE: judge }), expectedCallsByRole: roleNumbers({ JUDGE: 1 }), scorecard, prices, mode: "HOSTED" }))
      .toEqual({ mode: "HOSTED", moneyMicros: 2, seconds: 13 });
  });
});
