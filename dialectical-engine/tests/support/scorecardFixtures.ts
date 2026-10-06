import { readFileSync } from "node:fs";
import { DEBATE_ROLES, THINKING_LEVEL_DEFAULT_ONLY, type DebateRole } from "@debateai/kernel";
import {
  parseScorecard,
  type PickerInput,
  type PickerOutcome,
  type PickerSettings,
  type ReachableTarget,
  type Scorecard,
  type ScorecardCandidate,
  type ScorecardRoleEntry,
  type TargetPrice,
  type Tier
} from "@debateai/scorecard";

/** The engine version every scorecard test parses at: the root package.json version. */
export const TEST_ENGINE_VERSION = "0.1.0";

const EXAMPLE_SCORECARD_URL = new URL("../../packages/scorecard/fixtures/example-scorecard.json", import.meta.url);

/** A fresh, mutable copy of the example file, exactly as a caller reads it from disk. */
export function readExampleScorecardJson(): unknown {
  return JSON.parse(readFileSync(EXAMPLE_SCORECARD_URL, "utf8")) as unknown;
}

/** The example, parsed. A refusal here is a broken fixture, and it fails loudly. */
export function exampleScorecard(): Scorecard {
  const parsed = parseScorecard(readExampleScorecardJson(), TEST_ENGINE_VERSION);
  if (parsed.state !== "VALID") {
    throw new Error(`the example scorecard is refused: ${parsed.reason}: ${parsed.detail}`);
  }
  return parsed.scorecard;
}

/** Every role at `fill`, the named roles overridden. */
export function roleNumbers(values: Partial<Record<DebateRole, number>>, fill = 0): Record<DebateRole, number> {
  return Object.fromEntries(DEBATE_ROLES.map((role) => [role, values[role] ?? fill])) as Record<DebateRole, number>;
}

/** An economy cap of 50 (micros and seconds) for every role, the named roles overridden. */
export function economyCaps(overrides: Partial<PickerSettings["economyCap"]> = {}): PickerSettings["economyCap"] {
  return Object.fromEntries(DEBATE_ROLES.map((role) => [
    role, overrides[role] ?? { moneyMicrosPerCall: 50, secondsPerCall: 50 }
  ])) as PickerSettings["economyCap"];
}

export const TEST_PICKER_SETTINGS: PickerSettings = {
  balancedMargin: 5,
  economyCap: economyCaps(),
  planStrengthCaps: { free: "BALANCED" },
  defaultStrength: "BALANCED",
  diversityShare: 0.2,
  runnerUpCostTolerance: 0.25
};

export function testCandidate(
  candidateId: string,
  maker: string,
  options: Readonly<{
    modelId?: string;
    thinkingLevel?: string;
    routes?: ScorecardCandidate["accessRoutes"];
    contextWindowTokens?: number;
  }> = {}
): ScorecardCandidate {
  return {
    candidateId,
    vendor: maker,
    maker,
    modelId: options.modelId ?? `model-${candidateId}`,
    thinkingLevel: options.thinkingLevel ?? THINKING_LEVEL_DEFAULT_ONLY,
    accessRoutes: options.routes ?? [{ kind: "API" }],
    apiPrice: null,
    contextWindowTokens: options.contextWindowTokens ?? null
  };
}

/** One role entry; `cost` is the typical call's seconds (the LOCAL cost). 1000 input tokens, no output. */
export function testEntry(
  candidateId: string,
  quality: number,
  cost: number,
  options: Readonly<{ tier?: Tier; inputTokens?: number }> = {}
): ScorecardRoleEntry {
  return {
    candidateId,
    tier: options.tier ?? "TOP",
    quality: { score: quality, low: quality, high: quality },
    qualityByLanguage: null,
    typicalCall: { inputTokens: options.inputTokens ?? 1000, outputTokens: 0, thinkingTokens: null, seconds: cost },
    tags: [],
    promptVersion: "standard",
    itemsMeasured: 10,
    measuredAt: "2026-09-26"
  };
}

/** A HOSTED price under which one `testEntry` call costs exactly `micros`. */
export function testPrice(micros: number): TargetPrice {
  return { inputMicrosPerMTok: micros * 1000, outputMicrosPerMTok: 0 };
}

/** A scorecard built from parts and passed through parseScorecard, so a malformed fixture fails loudly. */
export function testScorecard(
  candidates: readonly ScorecardCandidate[],
  roles: Readonly<Partial<Record<DebateRole, readonly ScorecardRoleEntry[]>>>,
  settings: Partial<PickerSettings> = {}
): Scorecard {
  const parsed = parseScorecard({
    kind: "DEBATEAI_SCORECARD",
    formatVersion: 1,
    scorecardVersion: 7,
    createdAt: "2026-09-26",
    testSetVersion: "test-set-v1",
    engineCompatibility: { minEngineVersion: "0.1.0", maxEngineVersion: null },
    languages: ["en"],
    candidates,
    roles: Object.fromEntries(DEBATE_ROLES.map((role) => [role, roles[role] ?? []])),
    pickerSettings: { ...TEST_PICKER_SETTINGS, ...settings }
  }, TEST_ENGINE_VERSION);
  if (parsed.state !== "VALID") throw new Error(`the test scorecard is refused: ${parsed.reason}: ${parsed.detail}`);
  return parsed.scorecard;
}

/** The one route a test candidate is reached by: `provider:<candidateId>`, declaring its own level. */
export function targetFor(candidate: ScorecardCandidate, overrides: Partial<ReachableTarget> = {}): ReachableTarget {
  return {
    providerRef: `provider:${candidate.candidateId}`,
    maker: candidate.maker,
    modelId: candidate.modelId,
    thinkingLevels: candidate.thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY ? [] : [candidate.thinkingLevel],
    contextWindowTokens: null,
    ...overrides
  };
}

/**
 * The sealed per-call answer bound every test role gets unless a test names its own: 2048, the
 * development and acceptance registers' JUDGE and synthesis `tokenCeiling` (final review I3).
 */
export const TEST_ANSWER_TOKEN_CEILING = 2048;

/** LOCAL, no strength, no plan, no demand, no calls, no ceiling, no prices — then the overrides. */
export function testPickerInput(overrides: Partial<PickerInput> & Pick<PickerInput, "scorecard" | "reachable">): PickerInput {
  return {
    mode: "LOCAL",
    strength: null,
    planTier: null,
    seatDemand: roleNumbers({}),
    expectedCallsByRole: roleNumbers({}),
    perRunCeilingMicros: null,
    prices: new Map(),
    answerTokenCeilingByRole: roleNumbers({}, TEST_ANSWER_TOKEN_CEILING),
    ...overrides
  };
}

/** The ASSIGNED outcome, or a loud failure naming the refusal. */
export function assignedOutcome(outcome: PickerOutcome): Extract<PickerOutcome, { state: "ASSIGNED" }> {
  if (outcome.state !== "ASSIGNED") throw new Error(`expected an assignment, got ${outcome.reason}: ${outcome.detail}`);
  return outcome;
}
