/**
 * Paid plans P4-E (Part 3b re-review M-4; the controller's ruling C4 of 3 October 2026) — THE RULE
 * THAT A FREE ASK CAN SEAT ITS ANSWER JOBS, on its own.
 *
 * With billing on, a Free ask's answer writer and answer checker take a scored Free-roster model or
 * none (S4b fix round 1), so publish and boot refuse a scorecard under which no declared Free-roster
 * model can take one of them (SCORECARD_FREE_ANSWER_UNSCORED; the publish and boot rows are in
 * hosted-register-publish.test.ts and model-picker-boot-stages.test.ts). The rule reads the picker's
 * own eligibility, so its answer is the picker's: the last block checks that, case by case, against
 * a real Free ask.
 */
import { describe, expect, it } from "vitest";
import { THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";
import {
  SCORECARD_FREE_ANSWER_UNSCORED,
  freeAnswerJobsFollowPaidSiteRule,
  pickRoleAssignment,
  type DeclaredModelTarget,
  type Scorecard,
  type ScorecardCandidate,
  type ScorecardRoleEntry
} from "@debateai/scorecard";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { roleNumbers, testCandidate, testEntry, testPickerInput, testScorecard } from "../support/scorecardFixtures.js";

const [FREE_A, FREE_B] = PLAN_TIER_ROSTERS.free as readonly [string, string];
const PAID = PLAN_TIER_ROSTERS.premium[0]!;
type AnswerBounds = Readonly<Record<"ANSWER_WRITER" | "ANSWER_CHECKER", number>>;
const BOUNDS: AnswerBounds = Object.freeze({ ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048 });

const freeA = testCandidate("free-a", "OpenAI", { modelId: FREE_A });
const freeB = testCandidate("free-b", "Anthropic", { modelId: FREE_B });
const paid = testCandidate("paid", "OpenAI", { modelId: PAID });

function declared(candidate: ScorecardCandidate, overrides: Partial<DeclaredModelTarget> = {}): DeclaredModelTarget {
  return { providerRef: `provider:${candidate.candidateId}`, maker: candidate.maker, model: candidate.modelId, ...overrides };
}

function answers(writer: readonly ScorecardRoleEntry[], checker: readonly ScorecardRoleEntry[] = writer) {
  return { ANSWER_WRITER: writer, ANSWER_CHECKER: checker };
}

function rule(scorecard: Scorecard, targets: readonly DeclaredModelTarget[], bounds: AnswerBounds = BOUNDS): boolean {
  return freeAnswerJobsFollowPaidSiteRule({
    scorecard, targets, freeRosterModelIds: PLAN_TIER_ROSTERS.free, answerTokenCeilingByRole: bounds
  });
}

type Case = Readonly<{ name: string; scorecard: Scorecard; targets: readonly DeclaredModelTarget[]; seatable: boolean }>;

const CASES: readonly Case[] = [
  {
    name: "a declared Free-roster model scored for both jobs",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeA)],
    seatable: true
  },
  {
    name: "one Free-roster model for the writer, the other for the checker",
    scorecard: testScorecard([freeA, freeB], answers([testEntry("free-a", 80, 1)], [testEntry("free-b", 80, 1)])),
    targets: [declared(freeA), declared(freeB)],
    seatable: true
  },
  {
    name: "only a paid-roster model scored, though it is declared",
    scorecard: testScorecard([paid], answers([testEntry("paid", 95, 1)])),
    targets: [declared(paid)],
    seatable: false
  },
  {
    name: "a Free-roster model scored but not declared",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeB)],
    seatable: false
  },
  {
    name: "a Free-roster model scored for the writer only",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)], [])),
    targets: [declared(freeA)],
    seatable: false
  },
  {
    name: "a Free-roster model AVOID for the checker",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)], [testEntry("free-a", 80, 1, { tier: "AVOID" })])),
    targets: [declared(freeA)],
    seatable: false
  },
  {
    name: "a Free-roster model UNTESTED for the writer",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1, { tier: "UNTESTED" })], [testEntry("free-a", 80, 1)])),
    targets: [declared(freeA)],
    seatable: false
  },
  {
    name: "a Free-roster model reachable only through a subscription",
    scorecard: testScorecard(
      [testCandidate("free-a", "OpenAI", { modelId: FREE_A, routes: [{ kind: "SUBSCRIPTION", tool: "codex" }] })],
      answers([testEntry("free-a", 80, 1)])
    ),
    targets: [declared(freeA)],
    seatable: false
  },
  {
    name: "a Free-roster model at a level its connection does not declare",
    scorecard: testScorecard([testCandidate("free-a", "OpenAI", { modelId: FREE_A, thinkingLevel: "high" })], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeA)],
    seatable: false
  },
  {
    name: "a Free-roster model at a level its connection declares",
    scorecard: testScorecard([testCandidate("free-a", "OpenAI", { modelId: FREE_A, thinkingLevel: "high" })], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeA, { thinkingLevels: ["high"] })],
    seatable: true
  },
  {
    name: "a Free-roster model whose typical answer does not fit its connection's window",
    // 1000 input tokens x 4 + the bound 2048 = 6048 window tokens.
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeA, { contextWindowTokens: 6_047 })],
    seatable: false
  },
  {
    name: "a Free-roster model whose typical answer just fits its connection's window",
    scorecard: testScorecard([freeA], answers([testEntry("free-a", 80, 1)])),
    targets: [declared(freeA, { contextWindowTokens: 6_048 })],
    seatable: true
  }
];

describe("P4-E · freeAnswerJobsFollowPaidSiteRule", () => {
  it("names its refusal by a content-free code", () => {
    expect(SCORECARD_FREE_ANSWER_UNSCORED).toBe("SCORECARD_FREE_ANSWER_UNSCORED");
  });

  it.each(CASES.map((entry) => [entry.name, entry] as const))("%s", (_name, entry) => {
    expect(rule(entry.scorecard, entry.targets)).toBe(entry.seatable);
  });

  it("reads each job's own sealed answer bound against the window", () => {
    const scorecard = testScorecard([freeA], answers([testEntry("free-a", 80, 1)]));
    const targets = [declared(freeA, { contextWindowTokens: 6_048 })];
    expect(rule(scorecard, targets, { ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048 })).toBe(true);
    expect(rule(scorecard, targets, { ANSWER_WRITER: 2048, ANSWER_CHECKER: 2049 })).toBe(false);
    expect(rule(scorecard, targets, { ANSWER_WRITER: 2049, ANSWER_CHECKER: 2048 })).toBe(false);
  });

  it("reads the Free roster it is given, never a hard-coded one", () => {
    const scorecard = testScorecard([paid], answers([testEntry("paid", 95, 1)]));
    expect(freeAnswerJobsFollowPaidSiteRule({
      scorecard, targets: [declared(paid)], freeRosterModelIds: [PAID], answerTokenCeilingByRole: BOUNDS
    })).toBe(true);
  });

  it("is the picker's own answer: a Free ask on a site that sells plans is refused FREE_ANSWER_UNSCORED exactly when the rule fails", () => {
    for (const entry of CASES) {
      const reachable = entry.targets
        .filter((target) => PLAN_TIER_ROSTERS.free.includes(target.model))
        .map((target) => ({
          providerRef: target.providerRef,
          maker: target.maker,
          modelId: target.model,
          thinkingLevels: target.thinkingLevels ?? [],
          contextWindowTokens: target.contextWindowTokens ?? null
        }));
      const outcome = pickRoleAssignment(testPickerInput({
        scorecard: entry.scorecard,
        reachable,
        mode: "HOSTED",
        planTier: "free",
        plansSold: true,
        seatDemand: roleNumbers({ ANSWER_WRITER: 1, ANSWER_CHECKER: 1 }),
        answerTokenCeilingByRole: roleNumbers({}, 2048)
      }));
      expect(outcome.state, entry.name).toBe(entry.seatable ? "ASSIGNED" : "REFUSED");
      if (outcome.state === "REFUSED") expect(outcome.detail, entry.name).toContain("FREE_ANSWER_UNSCORED");
    }
  });

  it("keeps the fixture honest: the default level needs no declared level", () => {
    expect(freeA.thinkingLevel).toBe(THINKING_LEVEL_DEFAULT_ONLY);
  });
});
