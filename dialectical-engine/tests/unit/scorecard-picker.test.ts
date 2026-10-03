import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, MODEL_STRENGTHS, THINKING_LEVEL_DEFAULT_ONLY, type DebateRole, type ModelStrength } from "@debateai/kernel";
import { estimatePromptTokens, estimateWindowTokens } from "@debateai/providers";
import {
  RoleAssignmentSchema,
  backupFor,
  diversityOrdinalForRun,
  pickRoleAssignment,
  selectSeatCandidate,
  typicalCallWindowTokens,
  type PickerSettings,
  type ReachableTarget,
  type RoleAssignment,
  type RoleSeat,
  type Scorecard,
  type ScorecardRoleEntry,
  type SeatCandidate
} from "@debateai/scorecard";
import {
  assignedOutcome,
  economyCaps,
  exampleScorecard,
  roleNumbers,
  targetFor,
  testCandidate,
  testEntry,
  testPickerInput,
  testPrice,
  testScorecard
} from "../support/scorecardFixtures.js";

const mainIds = (seats: readonly RoleSeat[]): (string | null)[] => seats.map((seat) => seat.main.candidateId);
const runnerUpIds = (seats: readonly RoleSeat[]): (string | null)[] => seats.map((seat) => seat.runnerUp?.candidateId ?? null);

// The R2 cast: three candidates of three makers; LOCAL cost = the typical call's seconds.
const best = testCandidate("best", "OpenAI");
const mid = testCandidate("mid", "Anthropic");
const cheap = testCandidate("cheap", "Google");
const writerEntries = [testEntry("best", 92, 300), testEntry("mid", 88, 120), testEntry("cheap", 70, 20)];
const reachable = [best, mid, cheap].map((candidate) => targetFor(candidate));
const writerOnly = roleNumbers({ ANSWER_WRITER: 1 });
const writerScorecard = (cap: number | null): Scorecard => testScorecard([best, mid, cheap], { ANSWER_WRITER: writerEntries }, {
  economyCap: economyCaps({ ANSWER_WRITER: { moneyMicrosPerCall: cap, secondsPerCall: cap } })
});

describe("pickRoleAssignment — R2 strength rules", () => {
  it.each([
    { strength: "BEST", cap: 100, main: "best", runnerUp: "mid" },
    { strength: "BALANCED", cap: 100, main: "mid", runnerUp: null },
    { strength: "ECONOMY", cap: 100, main: "cheap", runnerUp: null },
    { strength: "ECONOMY", cap: 150, main: "mid", runnerUp: null },
    { strength: "ECONOMY", cap: null, main: "cheap", runnerUp: null }
  ] as const)("$strength with an economy cap of $cap seats $main", ({ strength, cap, main, runnerUp }) => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: writerScorecard(cap), reachable, seatDemand: writerOnly, strength
    })));
    expect(mainIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual([main]);
    expect(runnerUpIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual([runnerUp]);
    expect(outcome.appliedStrength).toBe(strength);
    expect(outcome.steppedDown).toBe(false);
  });

  it("breaks a quality tie by lower cost, then by candidateId in code-unit order, whatever the file order", () => {
    const candidates = [testCandidate("b-tie", "OpenAI"), testCandidate("a-tie", "Anthropic"), testCandidate("c-dear", "Google")];
    const entries = [testEntry("b-tie", 90, 40), testEntry("c-dear", 90, 45), testEntry("a-tie", 90, 40)];
    for (const strength of MODEL_STRENGTHS) {
      for (const ordering of [entries, [...entries].reverse()]) {
        const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
          scorecard: testScorecard(candidates, { ANSWER_WRITER: ordering }),
          reachable: candidates.map((candidate) => targetFor(candidate)),
          seatDemand: writerOnly,
          strength
        })));
        expect(mainIds(outcome.assignment.roles.ANSWER_WRITER), strength).toEqual(["a-tie"]);
      }
    }
  });

  it("seats the cheapest when nothing is under the economy cap, and says so", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: writerScorecard(10), reachable, seatDemand: writerOnly, strength: "ECONOMY"
    })));
    expect(mainIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual(["cheap"]);
    expect(outcome.notes).toContain("ECONOMY_CAP_UNMET:ANSWER_WRITER");
  });

  it("defaults to the scorecard's defaultStrength, and to BALANCED without a scorecard", () => {
    const bestByDefault = testScorecard([best, mid, cheap], { ANSWER_WRITER: writerEntries }, { defaultStrength: "BEST" });
    const withScorecard = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: bestByDefault, reachable, seatDemand: writerOnly
    })));
    expect(withScorecard.appliedStrength).toBe("BEST");
    expect(mainIds(withScorecard.assignment.roles.ANSWER_WRITER)).toEqual(["best"]);
    const withoutScorecard = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: null, reachable, seatDemand: writerOnly
    })));
    expect(withoutScorecard.appliedStrength).toBe("BALANCED");
    expect(withoutScorecard.assignment.strength).toBe("BALANCED");
  });
});

describe("pickRoleAssignment — plan caps apply in HOSTED mode only", () => {
  const prices = new Map([
    ["provider:best", testPrice(300)], ["provider:mid", testPrice(120)], ["provider:cheap", testPrice(20)]
  ]);
  it.each([
    { mode: "HOSTED", planTier: "free", applied: "BALANCED", main: "mid" },
    { mode: "HOSTED", planTier: "premium", applied: "BEST", main: "best" },
    { mode: "HOSTED", planTier: null, applied: "BEST", main: "best" },
    { mode: "LOCAL", planTier: "free", applied: "BEST", main: "best" }
  ] as const)("$mode on plan $planTier asks BEST and gets $applied", ({ mode, planTier, applied, main }) => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: writerScorecard(100), reachable, seatDemand: writerOnly, strength: "BEST", mode, planTier, prices
    })));
    expect(outcome.appliedStrength).toBe(applied);
    expect(mainIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual([main]);
    expect(outcome.notes.includes("PLAN_CAP:free:BEST->BALANCED")).toBe(mode === "HOSTED" && planTier === "free");
    expect(outcome.steppedDown).toBe(false);
  });
});

describe("pickRoleAssignment — R3 runner-up: the 80-20 partner and the backup", () => {
  const oMain = testCandidate("o-main", "OpenAI");
  const oAlt = testCandidate("o-alt", "OpenAI");
  const aAlt = testCandidate("a-alt", "Anthropic");
  const writerSeat = (entries: readonly ScorecardRoleEntry[], settings: Partial<PickerSettings> = {}): RoleSeat => {
    const candidates = [oMain, oAlt, aAlt].filter((candidate) => entries.some((entry) => entry.candidateId === candidate.candidateId));
    return assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard(candidates, { ANSWER_WRITER: entries }, settings),
      reachable: candidates.map((candidate) => targetFor(candidate)),
      seatDemand: writerOnly,
      strength: "BEST"
    }))).assignment.roles.ANSWER_WRITER[0]!;
  };

  it("prefers a runner-up of another maker within the margin and the cost tolerance", () => {
    const seat = writerSeat([testEntry("o-main", 90, 100), testEntry("o-alt", 89, 100), testEntry("a-alt", 87, 110)]);
    expect([seat.main.candidateId, seat.runnerUp?.candidateId, seat.diversityShare]).toEqual(["o-main", "a-alt", 0.2]);
  });

  it("falls back to a same-maker runner-up when the other maker costs too much", () => {
    const seat = writerSeat([testEntry("o-main", 90, 100), testEntry("o-alt", 89, 100), testEntry("a-alt", 87, 130)]);
    expect(seat.runnerUp?.candidateId).toBe("o-alt");
  });

  it("names no runner-up, and no share, when nobody qualifies", () => {
    const seat = writerSeat([testEntry("o-main", 90, 100), testEntry("a-alt", 84, 110)]);
    expect(seat.runnerUp).toBeNull();
    expect(seat.diversityShare).toBe(0);
  });

  it("admits a runner-up exactly at the margin and exactly at the cost tolerance", () => {
    const seat = writerSeat([testEntry("o-main", 90, 100), testEntry("a-alt", 85, 125)]);
    expect(seat.runnerUp?.candidateId).toBe("a-alt");
  });

  it("keeps the runner-up as the backup when the share is zero", () => {
    const seat = writerSeat([testEntry("o-main", 90, 100), testEntry("a-alt", 87, 110)], { diversityShare: 0 });
    expect(seat.runnerUp?.candidateId).toBe("a-alt");
    expect(seat.diversityShare).toBe(0);
  });

  it("never names a runner-up on the main's own route", () => {
    const high = testCandidate("o-high", "OpenAI", { modelId: "shared-model", thinkingLevel: "high" });
    const low = testCandidate("o-low", "OpenAI", { modelId: "shared-model", thinkingLevel: "low" });
    const shared: ReachableTarget = {
      providerRef: "provider:shared", maker: "OpenAI", modelId: "shared-model", thinkingLevels: ["high", "low"], contextWindowTokens: null
    };
    const seat = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([high, low], { ANSWER_WRITER: [testEntry("o-high", 90, 100), testEntry("o-low", 89, 50)] }),
      reachable: [shared],
      seatDemand: writerOnly,
      strength: "BEST"
    }))).assignment.roles.ANSWER_WRITER[0]!;
    expect(seat.main).toEqual({
      candidateId: "o-high", providerRef: "provider:shared", maker: "OpenAI", modelId: "shared-model", thinkingLevel: "high"
    });
    expect(seat.runnerUp).toBeNull();
  });
});

describe("pickRoleAssignment — R5 fairness", () => {
  const o1 = testCandidate("o1", "OpenAI");
  const o2 = testCandidate("o2", "OpenAI");
  const a1 = testCandidate("a1", "Anthropic");
  const a2 = testCandidate("a2", "Anthropic");
  const g1 = testCandidate("g1", "Google");
  const x1 = testCandidate("x1", "xAI");

  it("seats POSITION from distinct makers, runner-ups included, and mirrors it into CROSS_EXCHANGE", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, a1, a2], { POSITION: [testEntry("o1", 95, 10), testEntry("a1", 90, 10), testEntry("a2", 93, 10)] }),
      reachable: [o1, a1, a2].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ POSITION: 2, CROSS_EXCHANGE: 2 }),
      strength: "BEST"
    })));
    const position = outcome.assignment.roles.POSITION;
    expect(mainIds(position)).toEqual(["o1", "a2"]);
    // a1 qualifies as o1's runner-up on quality and cost, but it is Anthropic: seat 1's maker.
    expect(runnerUpIds(position)).toEqual([null, "a1"]);
    expect(outcome.assignment.roles.CROSS_EXCHANGE).toEqual(position);
  });

  it("seats one POSITION when only one maker is eligible, says so, and leaves CROSS_EXCHANGE empty when not asked", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, o2], { POSITION: [testEntry("o1", 95, 10), testEntry("o2", 94, 10)] }),
      reachable: [o1, o2].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ POSITION: 2 }),
      strength: "BEST"
    })));
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["o1"]);
    expect(runnerUpIds(outcome.assignment.roles.POSITION)).toEqual(["o2"]);
    expect(outcome.notes).toContain("SEATS_SHORT:POSITION:1/2");
    expect(outcome.assignment.roles.CROSS_EXCHANGE).toEqual([]);
  });

  it("prefers a maker not yet seated in the role for SUPPORT_ATTACK", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, o2, a1], { SUPPORT_ATTACK: [testEntry("o1", 95, 10), testEntry("o2", 94, 10), testEntry("a1", 70, 10)] }),
      reachable: [o1, o2, a1].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ SUPPORT_ATTACK: 2 }),
      strength: "BEST"
    })));
    expect(mainIds(outcome.assignment.roles.SUPPORT_ATTACK)).toEqual(["o1", "a1"]);
  });

  it("fills JUDGE seats from makers that are not debating first", () => {
    const withJudges = (judges: readonly ScorecardRoleEntry[]) => testPickerInput({
      scorecard: testScorecard([o1, a1, g1, x1], { POSITION: [testEntry("o1", 90, 10), testEntry("a1", 88, 10)], JUDGE: judges }),
      reachable: [o1, a1, g1, x1].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ POSITION: 2, JUDGE: 2 }),
      strength: "BEST"
    });
    const both = assignedOutcome(pickRoleAssignment(withJudges([
      testEntry("o1", 95, 10), testEntry("a1", 94, 10), testEntry("g1", 70, 10), testEntry("x1", 60, 10)
    ])));
    expect(mainIds(both.assignment.roles.POSITION)).toEqual(["o1", "a1"]);
    expect(mainIds(both.assignment.roles.JUDGE)).toEqual(["g1", "x1"]);
    const one = assignedOutcome(pickRoleAssignment(withJudges([
      testEntry("o1", 95, 10), testEntry("a1", 94, 10), testEntry("g1", 70, 10)
    ])));
    expect(mainIds(one.assignment.roles.JUDGE)).toEqual(["g1", "o1"]);
  });

  it("falls back for REVIEWER when the scorecard's reviewers cannot review every author's maker", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, o2, a1], {
        POSITION: [testEntry("o1", 90, 10), testEntry("a1", 88, 10)],
        REVIEWER: [testEntry("o1", 90, 10), testEntry("o2", 85, 10)]
      }),
      reachable: [o1, o2, a1].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ POSITION: 2, REVIEWER: 2 }),
      strength: "BEST"
    })));
    expect(outcome.assignment.roles.REVIEWER.map((seat) => [seat.source, seat.main.providerRef, seat.main.candidateId]))
      .toEqual([["FALLBACK", "provider:o1", null], ["FALLBACK", "provider:a1", null]]);
    expect(outcome.notes).toContain("ROLE_FALLBACK:REVIEWER:MAKER_COVERAGE");
  });

  it("prefers an answer checker of another maker than the answer writer (soft)", () => {
    const entries = [testEntry("o1", 95, 10), testEntry("a1", 80, 10)];
    const pick = (checker: readonly ScorecardRoleEntry[]) => assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, a1], { ANSWER_WRITER: entries, ANSWER_CHECKER: checker }),
      reachable: [o1, a1].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ ANSWER_WRITER: 1, ANSWER_CHECKER: 1 }),
      strength: "BEST"
    })));
    const preferred = pick(entries);
    expect(mainIds(preferred.assignment.roles.ANSWER_WRITER)).toEqual(["o1"]);
    expect(mainIds(preferred.assignment.roles.ANSWER_CHECKER)).toEqual(["a1"]);
    expect(mainIds(pick([testEntry("o1", 95, 10)]).assignment.roles.ANSWER_CHECKER)).toEqual(["o1"]);
  });
});

describe("pickRoleAssignment — CROSS_EXCHANGE eligibility (fix round 1, R5)", () => {
  it("excludes a POSITION candidate the scorecard marks AVOID for its own cross-exchange call, and says why (probe)", () => {
    // Final review I3: a window the POSITION call fits under the gateway's own rule (2000 × 4 + 2048).
    const z1 = testCandidate("z1", "OpenAI", { contextWindowTokens: 16_000 });
    const a1 = testCandidate("a1", "Anthropic");
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1], {
        POSITION: [testEntry("z1", 95, 10, { inputTokens: 2000 }), testEntry("a1", 90, 10)],
        CROSS_EXCHANGE: [testEntry("z1", 95, 10, { tier: "AVOID", inputTokens: 9000 })]
      }),
      reachable: [targetFor(z1), targetFor(a1)],
      seatDemand: roleNumbers({ POSITION: 1, CROSS_EXCHANGE: 1 }),
      strength: "BEST"
    })));
    // z1 is the higher-quality POSITION candidate and its own POSITION entry (2000 input) fits
    // its 16 000-token window, so without the fix it would be seated despite being AVOID for
    // cross-exchange (its CX entry asks for 9000 input, which would also overflow the window).
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["a1"]);
    expect(outcome.assignment.roles.CROSS_EXCHANGE).toEqual(outcome.assignment.roles.POSITION);
    expect(outcome.notes).toContain("CROSS_EXCHANGE_INELIGIBLE:z1");
  });

  it("excludes a POSITION candidate whose own cross-exchange typical call overflows its window", () => {
    // Final review I3: POSITION fits (2000 × 4 + 2048 ≤ 16 000); the cross-exchange call does not.
    const z1 = testCandidate("z1", "OpenAI", { contextWindowTokens: 16_000 });
    const a1 = testCandidate("a1", "Anthropic");
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1], {
        POSITION: [testEntry("z1", 95, 10, { inputTokens: 2000 }), testEntry("a1", 90, 10)],
        // TOP tier, but 6000 input (24 000 window tokens) overflows the window on its own cross-exchange call.
        CROSS_EXCHANGE: [testEntry("z1", 95, 10, { inputTokens: 6000 })]
      }),
      reachable: [targetFor(z1), targetFor(a1)],
      seatDemand: roleNumbers({ POSITION: 1, CROSS_EXCHANGE: 1 }),
      strength: "BEST"
    })));
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["a1"]);
    expect(outcome.assignment.roles.CROSS_EXCHANGE).toEqual(outcome.assignment.roles.POSITION);
    expect(outcome.notes).toContain("CROSS_EXCHANGE_INELIGIBLE:z1");
  });

  it("still seats a POSITION candidate with no cross-exchange entry of its own (F28 stand-in)", () => {
    const z1 = testCandidate("z1", "OpenAI");
    const a1 = testCandidate("a1", "Anthropic");
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1], {
        POSITION: [testEntry("z1", 95, 10), testEntry("a1", 80, 10)],
        // Only a1 has a CROSS_EXCHANGE entry; z1 has none, so its POSITION entry stands in (F28)
        // and it remains eligible.
        CROSS_EXCHANGE: [testEntry("a1", 80, 10)]
      }),
      reachable: [targetFor(z1), targetFor(a1)],
      seatDemand: roleNumbers({ POSITION: 1, CROSS_EXCHANGE: 1 }),
      strength: "BEST"
    })));
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["z1"]);
    expect(outcome.assignment.roles.CROSS_EXCHANGE).toEqual(outcome.assignment.roles.POSITION);
    expect(outcome.notes).not.toContain("CROSS_EXCHANGE_INELIGIBLE:z1");
  });
});

describe("pickRoleAssignment — FALLBACK reproduces today's roster", () => {
  const today: readonly ReachableTarget[] = [
    { providerRef: "provider:openai", maker: "OpenAI", modelId: "model-openai", thinkingLevels: [], contextWindowTokens: null },
    { providerRef: "provider:anthropic", maker: "Anthropic", modelId: "model-anthropic", thinkingLevels: [], contextWindowTokens: null },
    { providerRef: "provider:openai-second", maker: "OpenAI", modelId: "model-openai-second", thinkingLevels: [], contextWindowTokens: null },
    { providerRef: "provider:xai", maker: "xAI", modelId: "model-xai", thinkingLevels: [], contextWindowTokens: null }
  ];
  const everyRole = roleNumbers({
    POSITION: 3, SUPPORT_ATTACK: 3, CROSS_EXCHANGE: 3, JUDGE: 3, REVIEWER: 3, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
  });

  it("without a scorecard, fills every role from the reachable targets in their given order", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({ scorecard: null, reachable: today, seatDemand: everyRole })));
    const refs = (role: DebateRole): string[] => outcome.assignment.roles[role].map((seat) => seat.main.providerRef);
    for (const role of ["POSITION", "SUPPORT_ATTACK", "CROSS_EXCHANGE", "JUDGE", "REVIEWER"] as const) {
      expect(refs(role), role).toEqual(["provider:openai", "provider:anthropic", "provider:xai"]);
    }
    expect(refs("ANSWER_WRITER")).toEqual(["provider:openai"]);
    expect(refs("ANSWER_CHECKER")).toEqual(["provider:anthropic"]);
    for (const role of DEBATE_ROLES) {
      for (const seat of outcome.assignment.roles[role]) {
        expect(seat).toMatchObject({
          source: "FALLBACK", runnerUp: null, diversityShare: 0,
          main: { candidateId: null, thinkingLevel: THINKING_LEVEL_DEFAULT_ONLY }
        });
      }
    }
    expect(outcome.assignment.scorecardVersion).toBeNull();
    expect(outcome.appliedStrength).toBe("BALANCED");
    expect(outcome.notes).toContain("SCORECARD_ABSENT");
    expect(outcome.estimate).toEqual({ mode: "LOCAL", moneyMicros: null, seconds: 0 });
  });

  it("keeps the order it is given", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: null, reachable: [today[1]!, today[0]!], seatDemand: roleNumbers({ POSITION: 2 })
    })));
    expect(outcome.assignment.roles.POSITION.map((seat) => seat.main.providerRef)).toEqual(["provider:anthropic", "provider:openai"]);
  });

  it("falls back for one role only when the scorecard does not cover it", () => {
    const o1 = testCandidate("o1", "OpenAI");
    const a1 = testCandidate("a1", "Anthropic");
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([o1, a1], { POSITION: [testEntry("o1", 90, 10), testEntry("a1", 88, 10)] }),
      reachable: [o1, a1].map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ POSITION: 2, JUDGE: 2 })
    })));
    expect(outcome.assignment.roles.POSITION.map((seat) => seat.source)).toEqual(["SCORECARD", "SCORECARD"]);
    expect(outcome.assignment.roles.JUDGE.map((seat) => [seat.source, seat.main.providerRef]))
      .toEqual([["FALLBACK", "provider:o1"], ["FALLBACK", "provider:a1"]]);
    expect(outcome.notes).toContain("ROLE_FALLBACK:JUDGE:NO_ELIGIBLE_CANDIDATE");
    expect(outcome.assignment.scorecardVersion).toBe(7);
  });

  it("never seats AVOID or UNTESTED; a role left with neither falls back", () => {
    const o1 = testCandidate("o1", "OpenAI");
    const a1 = testCandidate("a1", "Anthropic");
    const input = (entries: readonly ScorecardRoleEntry[]) => testPickerInput({
      scorecard: testScorecard([o1, a1], { ANSWER_WRITER: entries }),
      reachable: [o1, a1].map((candidate) => targetFor(candidate)),
      seatDemand: writerOnly,
      strength: "BEST"
    });
    const avoided = assignedOutcome(pickRoleAssignment(input([testEntry("o1", 99, 10, { tier: "AVOID" }), testEntry("a1", 70, 10)])));
    expect(mainIds(avoided.assignment.roles.ANSWER_WRITER)).toEqual(["a1"]);
    const none = assignedOutcome(pickRoleAssignment(input([
      testEntry("o1", 99, 10, { tier: "AVOID" }), testEntry("a1", 0, 10, { tier: "UNTESTED" })
    ])));
    expect(none.assignment.roles.ANSWER_WRITER.map((seat) => [seat.source, seat.main.providerRef, seat.main.candidateId]))
      .toEqual([["FALLBACK", "provider:o1", null]]);
    expect(none.notes).toContain("ROLE_FALLBACK:ANSWER_WRITER:NO_ELIGIBLE_CANDIDATE");
  });
});

describe("pickRoleAssignment — reachability", () => {
  it("in HOSTED mode seats only candidates with an API route", () => {
    const g1 = testCandidate("g1", "Google", { routes: [{ kind: "SUBSCRIPTION", tool: "agy" }] });
    const a1 = testCandidate("a1", "Anthropic");
    for (const [mode, expected] of [["HOSTED", "a1"], ["LOCAL", "g1"]] as const) {
      const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
        scorecard: testScorecard([g1, a1], { ANSWER_WRITER: [testEntry("g1", 99, 10), testEntry("a1", 70, 10)] }),
        reachable: [g1, a1].map((candidate) => targetFor(candidate)),
        seatDemand: writerOnly,
        strength: "BEST",
        mode,
        prices: new Map([["provider:g1", testPrice(10)], ["provider:a1", testPrice(10)]])
      })));
      expect(mainIds(outcome.assignment.roles.ANSWER_WRITER), mode).toEqual([expected]);
    }
  });

  it("matches a thinking level the target declares; DEFAULT_ONLY needs none", () => {
    const oMax = testCandidate("o-max", "OpenAI", { modelId: "m-o", thinkingLevel: "max" });
    const oDefault = testCandidate("o-default", "OpenAI", { modelId: "m-o2" });
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([oMax, oDefault], { ANSWER_WRITER: [testEntry("o-max", 99, 10), testEntry("o-default", 80, 10)] }),
      reachable: [
        { providerRef: "provider:o", maker: "OpenAI", modelId: "m-o", thinkingLevels: ["low", "high"], contextWindowTokens: null },
        { providerRef: "provider:o2", maker: "OpenAI", modelId: "m-o2", thinkingLevels: [], contextWindowTokens: null }
      ],
      seatDemand: writerOnly,
      strength: "BEST"
    })));
    expect(outcome.assignment.roles.ANSWER_WRITER[0]?.main).toEqual({
      candidateId: "o-default", providerRef: "provider:o2", maker: "OpenAI", modelId: "m-o2", thinkingLevel: THINKING_LEVEL_DEFAULT_ONLY
    });
  });

  it("skips a candidate whose context window cannot hold the role's typical input, and says why", () => {
    const z1 = testCandidate("z1", "Z.AI", { contextWindowTokens: 16_000 });
    const a1 = testCandidate("a1", "Anthropic");
    const a2 = testCandidate("a2", "Anthropic");
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1, a2], {
        POSITION: [testEntry("z1", 99, 10, { inputTokens: 3000 })],
        ANSWER_WRITER: [
          testEntry("z1", 99, 10, { inputTokens: 21_000 }),
          testEntry("a2", 95, 10, { inputTokens: 9000 }),
          testEntry("a1", 70, 10, { inputTokens: 9000 })
        ]
      }),
      reachable: [targetFor(z1), targetFor(a1), targetFor(a2, { contextWindowTokens: 8000 })],
      seatDemand: roleNumbers({ POSITION: 1, ANSWER_WRITER: 1 }),
      strength: "BEST"
    })));
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["z1"]);
    expect(mainIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual(["a1"]);
    expect(outcome.notes).toEqual(expect.arrayContaining([
      "CONTEXT_WINDOW_SKIP:ANSWER_WRITER:z1", "CONTEXT_WINDOW_SKIP:ANSWER_WRITER:a2"
    ]));
  });

  /*
   * Final review I3 — the picker's window check is never looser than the gateway's wall. The
   * gateway refuses an attempt when the prompt's UTF-8 bytes / 2 PLUS the attempt's answer bound
   * (`tokenCeiling`) exceed the window; a scorecard's `typicalCall.inputTokens` are vendor-style
   * tokens (about 4 characters each, and a character is at most 2 bytes in the prompts this engine
   * sends), so the picker counts them at WINDOW_TOKENS_PER_VENDOR_TOKEN = 4 and adds the role's
   * sealed answer bound. The typical output and thinking tokens are not what the wall adds.
   */
  it("seats a candidate only if its typical input at 4 window tokens per vendor token, plus the role's answer bound, fits (I3)", () => {
    const z1 = testCandidate("z1", "Z.AI", { contextWindowTokens: 16_000 });
    const a1 = testCandidate("a1", "Anthropic");
    const writerEntry = (inputTokens: number): ScorecardRoleEntry => ({
      ...testEntry("z1", 99, 10),
      // The output and thinking tokens are far past the window: the wall does not count them.
      typicalCall: { inputTokens, outputTokens: 50_000, thinkingTokens: 50_000, seconds: 10 }
    });
    const pick = (entry: ScorecardRoleEntry, writerCeiling = 2048) => assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1], { ANSWER_WRITER: [entry, testEntry("a1", 70, 10)] }),
      reachable: [targetFor(z1), targetFor(a1)],
      seatDemand: roleNumbers({ ANSWER_WRITER: 1 }),
      answerTokenCeilingByRole: roleNumbers({ ANSWER_WRITER: writerCeiling }, 2048),
      strength: "BEST"
    })));
    // 3488 × 4 + 2048 = 16 000: exactly the window fits.
    const fitting = pick(writerEntry(3488));
    expect(mainIds(fitting.assignment.roles.ANSWER_WRITER)).toEqual(["z1"]);
    expect(fitting.notes).not.toContain("CONTEXT_WINDOW_SKIP:ANSWER_WRITER:z1");
    // 3489 × 4 + 2048 = 16 004 > 16 000: skipped, although 3489 vendor tokens alone are far inside it.
    const skipped = pick(writerEntry(3489));
    expect(mainIds(skipped.assignment.roles.ANSWER_WRITER)).toEqual(["a1"]);
    expect(skipped.notes).toContain("CONTEXT_WINDOW_SKIP:ANSWER_WRITER:z1");
    // The ROLE's own bound is the one added: a writer bound of 4001 pushes 3000 × 4 past the window.
    expect(mainIds(pick(writerEntry(3000), 4000).assignment.roles.ANSWER_WRITER)).toEqual(["z1"]);
    expect(pick(writerEntry(3000), 4001).notes).toContain("CONTEXT_WINDOW_SKIP:ANSWER_WRITER:z1");
  });

  it("applies the same rule to a POSITION candidate's own cross-exchange call (I3)", () => {
    const z1 = testCandidate("z1", "OpenAI", { contextWindowTokens: 16_000 });
    const a1 = testCandidate("a1", "Anthropic");
    const outcome = (crossInput: number) => assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: testScorecard([z1, a1], {
        POSITION: [testEntry("z1", 95, 10, { inputTokens: 1000 }), testEntry("a1", 90, 10)],
        CROSS_EXCHANGE: [testEntry("z1", 95, 10, { inputTokens: crossInput })]
      }),
      reachable: [targetFor(z1), targetFor(a1)],
      seatDemand: roleNumbers({ POSITION: 1, CROSS_EXCHANGE: 1 }),
      answerTokenCeilingByRole: roleNumbers({ CROSS_EXCHANGE: 2000 }, 2048),
      strength: "BEST"
    })));
    // 3500 × 4 + 2000 = 16 000 fits; 3501 × 4 + 2000 = 16 004 does not.
    expect(mainIds(outcome(3500).assignment.roles.POSITION)).toEqual(["z1"]);
    expect(mainIds(outcome(3501).assignment.roles.POSITION)).toEqual(["a1"]);
    expect(outcome(3501).notes).toContain("CROSS_EXCHANGE_INELIGIBLE:z1");
  });

  it.each([
    ["an ASCII prompt", "The committee weighed the evidence and found the argument sound. "],
    ["a Romanian prompt with diacritics", "Ștefan își țese argumentul în fața juriului, cântărind fiecare dovadă. "]
  ])("agrees with the gateway's wall on %s: the picker's count is never below estimateWindowTokens (I3)", (_name, sentence) => {
    const messages = [
      { role: "system" as const, content: "Answer as JSON." },
      { role: "user" as const, content: sentence.repeat(150) }
    ];
    // The typical call as a scorecard records it: vendor-style tokens, about 4 characters each.
    const inputTokens = estimatePromptTokens(messages);
    const typicalCall = { inputTokens, outputTokens: 0, thinkingTokens: null, seconds: 1 };
    // ONE conversion: a vendor-style token is 4 of the wall's tokens.
    expect(typicalCallWindowTokens({ inputTokens: 1, outputTokens: 0, thinkingTokens: null, seconds: 0 }, 0)).toBe(4);
    for (const answerBound of [0, 2048]) {
      expect(typicalCallWindowTokens(typicalCall, answerBound))
        .toBeGreaterThanOrEqual(estimateWindowTokens(messages) + answerBound);
    }
    // And the old count (input + output + thinking) was below the wall on this very prompt.
    expect(inputTokens).toBeLessThan(estimateWindowTokens(messages));
  });

  it("refuses NO_REACHABLE_CANDIDATE when nothing can take a demanded seat", () => {
    const outcome = pickRoleAssignment(testPickerInput({ scorecard: null, reachable: [], seatDemand: roleNumbers({ POSITION: 2 }) }));
    expect(outcome).toMatchObject({ state: "REFUSED", reason: "NO_REACHABLE_CANDIDATE" });
    if (outcome.state === "REFUSED") expect(outcome.detail).toContain("POSITION");
  });
});

describe("pickRoleAssignment — the per-run money ceiling (HOSTED)", () => {
  const budgetScorecard = testScorecard([best, mid, cheap], {
    ANSWER_WRITER: [testEntry("best", 95, 400), testEntry("mid", 92, 150), testEntry("cheap", 70, 30)]
  }, { diversityShare: 0 });
  const prices = new Map([
    ["provider:best", testPrice(400)], ["provider:mid", testPrice(150)], ["provider:cheap", testPrice(30)]
  ]);
  const run = (strength: ModelStrength, perRunCeilingMicros: number | null, mode: "HOSTED" | "LOCAL" = "HOSTED") =>
    pickRoleAssignment(testPickerInput({
      scorecard: budgetScorecard, reachable, mode, strength, perRunCeilingMicros, prices,
      seatDemand: writerOnly, expectedCallsByRole: roleNumbers({ ANSWER_WRITER: 10 })
    }));

  it.each([
    { strength: "BEST", ceiling: null, applied: "BEST", steppedDown: false, money: 4000, steps: [] },
    { strength: "BEST", ceiling: 4000, applied: "BEST", steppedDown: false, money: 4000, steps: [] },
    { strength: "BEST", ceiling: 2000, applied: "BALANCED", steppedDown: true, money: 1500, steps: ["STEPPED_DOWN:BEST->BALANCED"] },
    {
      strength: "BEST", ceiling: 1000, applied: "ECONOMY", steppedDown: true, money: 300,
      steps: ["STEPPED_DOWN:BEST->BALANCED", "STEPPED_DOWN:BALANCED->ECONOMY"]
    },
    { strength: "BALANCED", ceiling: 1000, applied: "ECONOMY", steppedDown: true, money: 300, steps: ["STEPPED_DOWN:BALANCED->ECONOMY"] }
  ] as const)("$strength under a ceiling of $ceiling runs at $applied", ({ strength, ceiling, applied, steppedDown, money, steps }) => {
    const outcome = assignedOutcome(run(strength, ceiling));
    expect(outcome.appliedStrength).toBe(applied);
    expect(outcome.steppedDown).toBe(steppedDown);
    expect(outcome.estimate.moneyMicros).toBe(money);
    expect(outcome.notes.filter((note) => note.startsWith("STEPPED_DOWN:"))).toEqual([...steps]);
  });

  it.each(["BEST", "ECONOMY"] as const)("refuses BUDGET_TOO_SMALL from %s when even ECONOMY does not fit", (strength) => {
    expect(run(strength, 299)).toMatchObject({ state: "REFUSED", reason: "BUDGET_TOO_SMALL" });
  });

  it("never applies the ceiling in LOCAL mode, where the estimate is seconds", () => {
    const outcome = assignedOutcome(run("BEST", 1, "LOCAL"));
    expect(outcome.appliedStrength).toBe("BEST");
    expect(outcome.steppedDown).toBe(false);
    expect(outcome.estimate).toEqual({ mode: "LOCAL", moneyMicros: null, seconds: 4000 });
  });

  it("cannot step down on an estimate it does not have, and says so", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: budgetScorecard, reachable, mode: "HOSTED", strength: "BEST", perRunCeilingMicros: 10, prices,
      seatDemand: roleNumbers({ ANSWER_WRITER: 1, JUDGE: 2 }),
      expectedCallsByRole: roleNumbers({ ANSWER_WRITER: 10, JUDGE: 5 })
    })));
    expect(outcome.appliedStrength).toBe("BEST");
    expect(outcome.steppedDown).toBe(false);
    expect(outcome.estimate.moneyMicros).toBeNull();
    expect(outcome.notes).toEqual(expect.arrayContaining(["ROLE_FALLBACK:JUDGE:NO_ELIGIBLE_CANDIDATE", "ESTIMATE_UNAVAILABLE"]));
  });
});

describe("pickRoleAssignment — the example scorecard", () => {
  const example = exampleScorecard();
  const input = testPickerInput({
    scorecard: example,
    reachable: example.candidates.map((candidate) => targetFor(candidate)),
    seatDemand: roleNumbers({ POSITION: 3, SUPPORT_ATTACK: 3, CROSS_EXCHANGE: 3, JUDGE: 3, REVIEWER: 3, ANSWER_WRITER: 1, ANSWER_CHECKER: 1 })
  });

  it("assigns every role at BALANCED and skips the 16k candidate for the answer writer", () => {
    const outcome = assignedOutcome(pickRoleAssignment(input));
    expect(outcome.appliedStrength).toBe("BALANCED");
    expect(mainIds(outcome.assignment.roles.POSITION)).toEqual(["openai-alpha-low", "anthropic-beta-medium", "google-delta-high"]);
    expect(mainIds(outcome.assignment.roles.ANSWER_WRITER)).toEqual(["openai-alpha-low"]);
    expect(mainIds(outcome.assignment.roles.ANSWER_CHECKER)).toEqual(["google-delta-high"]);
    expect(outcome.notes).toContain("CONTEXT_WINDOW_SKIP:ANSWER_WRITER:zai-epsilon-high");
    expect(RoleAssignmentSchema.parse(JSON.parse(JSON.stringify(outcome.assignment)))).toEqual(outcome.assignment);
  });

  it("is deterministic, whatever the order of the scorecard's own lists", () => {
    const reordered: Scorecard = {
      ...example,
      candidates: [...example.candidates].reverse(),
      roles: Object.fromEntries(DEBATE_ROLES.map((role) => [role, [...example.roles[role]].reverse()])) as Scorecard["roles"]
    };
    expect(pickRoleAssignment(input)).toEqual(pickRoleAssignment(input));
    expect(pickRoleAssignment({ ...input, scorecard: reordered })).toEqual(pickRoleAssignment(input));
  });
});

describe("selectSeatCandidate / diversityOrdinalForRun / backupFor", () => {
  const main: SeatCandidate = { candidateId: "main", providerRef: "provider:main", maker: "OpenAI", modelId: "model-main", thinkingLevel: "low" };
  const runnerUp: SeatCandidate = {
    candidateId: "runner-up", providerRef: "provider:runner-up", maker: "Anthropic", modelId: "model-runner-up", thinkingLevel: "medium"
  };
  const seatWith = (diversityShare: number, withRunnerUp = true): RoleSeat => ({
    seatIndex: 0, main, runnerUp: withRunnerUp ? runnerUp : null, diversityShare, source: "SCORECARD"
  });

  it("gives the runner-up exactly one call in five at diversityShare 0.2", () => {
    const picks = Array.from({ length: 1000 }, (_unused, ordinal) => selectSeatCandidate(seatWith(0.2), ordinal));
    expect(picks.filter((pick) => pick.via === "RUNNER_UP")).toHaveLength(200);
    picks.forEach((pick, ordinal) => {
      expect(pick.via).toBe(ordinal % 5 === 4 ? "RUNNER_UP" : "MAIN");
      expect(pick.candidate).toBe(pick.via === "RUNNER_UP" ? runnerUp : main);
    });
  });

  it.each([
    { name: "a share of 0", share: 0, withRunnerUp: true, expected: 0 },
    { name: "no runner-up", share: 0.2, withRunnerUp: false, expected: 0 },
    { name: "a share of 0.25", share: 0.25, withRunnerUp: true, expected: 250 },
    { name: "a share of 0.5", share: 0.5, withRunnerUp: true, expected: 500 }
  ])("gives the runner-up $expected of 1000 calls with $name", ({ share, withRunnerUp, expected }) => {
    const picks = Array.from({ length: 1000 }, (_unused, ordinal) => selectSeatCandidate(seatWith(share, withRunnerUp), ordinal));
    expect(picks.filter((pick) => pick.via === "RUNNER_UP")).toHaveLength(expected);
  });

  it("derives a stable, non-negative ordinal from sha256(runId)", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const ordinal = diversityOrdinalForRun(runId);
    expect(diversityOrdinalForRun(runId)).toBe(ordinal);
    expect(Number.isSafeInteger(ordinal) && ordinal >= 0).toBe(true);
    expect(ordinal).toBe(createHash("sha256").update(runId, "utf8").digest().readUIntBE(0, 6));
    expect(new Set(Array.from({ length: 50 }, (_unused, index) => diversityOrdinalForRun(`run-${String(index)}`) % 5)).size)
      .toBeGreaterThan(1);
  });

  it("names the seat's other candidate as the backup", () => {
    expect(backupFor(seatWith(0.2), "MAIN")).toBe(runnerUp);
    expect(backupFor(seatWith(0.2), "RUNNER_UP")).toBe(main);
    expect(backupFor(seatWith(0, false), "MAIN")).toBeNull();
  });
});

describe("RoleAssignmentSchema — pinning and reading back", () => {
  const candidateOf = (id: string, maker: string): SeatCandidate => ({
    candidateId: id, providerRef: `provider:${id}`, maker, modelId: `model-${id}`, thinkingLevel: "low"
  });
  const seatOf = (index: number, id: string, maker: string, runnerUp: SeatCandidate | null = null): RoleSeat => ({
    seatIndex: index, main: candidateOf(id, maker), runnerUp, diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD"
  });
  const position = [seatOf(0, "o1", "OpenAI", candidateOf("o2", "OpenAI")), seatOf(1, "a1", "Anthropic")];
  const valid: RoleAssignment = {
    scorecardVersion: 3,
    strength: "BALANCED",
    roles: {
      POSITION: position,
      SUPPORT_ATTACK: [seatOf(0, "o1", "OpenAI"), seatOf(1, "a1", "Anthropic")],
      CROSS_EXCHANGE: position,
      JUDGE: [seatOf(0, "g1", "Google"), seatOf(1, "x1", "xAI")],
      REVIEWER: [seatOf(0, "a1", "Anthropic"), seatOf(1, "g1", "Google")],
      ANSWER_WRITER: [seatOf(0, "a1", "Anthropic")],
      ANSWER_CHECKER: [seatOf(0, "o1", "OpenAI")]
    }
  };
  const withRoles = (roles: Partial<Record<DebateRole, readonly RoleSeat[]>>): unknown => ({ ...valid, roles: { ...valid.roles, ...roles } });

  it("reads back exactly what it pins", () => {
    const readBack: RoleAssignment = RoleAssignmentSchema.parse(JSON.parse(JSON.stringify(valid)));
    expect(readBack).toEqual(valid);
  });

  it.each([
    { name: "two POSITION seats of one maker", value: withRoles({ POSITION: [seatOf(0, "o1", "OpenAI"), seatOf(1, "o3", "OpenAI")], CROSS_EXCHANGE: [] }) },
    {
      name: "a POSITION runner-up of another seat's maker",
      value: withRoles({ POSITION: [seatOf(0, "o1", "OpenAI", candidateOf("a2", "Anthropic")), seatOf(1, "a1", "Anthropic")], CROSS_EXCHANGE: [] })
    },
    {
      name: "a runner-up on the main's own route",
      value: withRoles({ ANSWER_WRITER: [{ ...seatOf(0, "a1", "Anthropic"), runnerUp: { ...candidateOf("a1", "Anthropic"), candidateId: "a1-high" }, diversityShare: 0.2 }] })
    },
    { name: "CROSS_EXCHANGE seats that are not POSITION's", value: withRoles({ CROSS_EXCHANGE: [seatOf(0, "o1", "OpenAI"), seatOf(1, "a1", "Anthropic")] }) },
    { name: "a FALLBACK seat with a runner-up", value: withRoles({ JUDGE: [{ ...seatOf(0, "g1", "Google", candidateOf("x1", "xAI")), source: "FALLBACK" }] }) },
    { name: "a seat index that skips", value: withRoles({ JUDGE: [seatOf(1, "g1", "Google")] }) },
    { name: "two answer writers", value: withRoles({ ANSWER_WRITER: [seatOf(0, "a1", "Anthropic"), seatOf(1, "g1", "Google")] }) },
    { name: "a share without a runner-up", value: withRoles({ JUDGE: [{ ...seatOf(0, "g1", "Google"), diversityShare: 0.2 }] }) },
    { name: "an unknown key", value: { ...valid, extra: true } },
    { name: "a strength outside the three", value: { ...valid, strength: "MAXIMUM" } }
  ])("refuses $name", ({ value }) => {
    expect(RoleAssignmentSchema.safeParse(value).success).toBe(false);
  });
});
