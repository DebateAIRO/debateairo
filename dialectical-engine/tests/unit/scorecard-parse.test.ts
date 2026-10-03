import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";
import { canonicalDecimal } from "@debateai/register";
import {
  isRegisterSealableNumber,
  parseScorecard,
  type Scorecard,
  type ScorecardParseResult
} from "@debateai/scorecard";
import { TEST_ENGINE_VERSION, exampleScorecard, readExampleScorecardJson } from "../support/scorecardFixtures.js";

type EditableScorecard = Record<string, unknown> & Scorecard;

/** A fresh copy of the example file with one edit applied. */
function exampleWith(edit: (value: EditableScorecard) => void): unknown {
  const value = readExampleScorecardJson() as EditableScorecard;
  edit(value);
  return value;
}

function refusalOf(result: ScorecardParseResult): Readonly<{ reason: string; detail: string }> {
  if (result.state !== "REFUSED") throw new Error("expected the scorecard to be refused");
  return { reason: result.reason, detail: result.detail };
}

describe("model-scorecard Part 1 — the example file", () => {
  it("is a VALID scorecard covering every role, three or more makers and both edge candidates", () => {
    const scorecard = exampleScorecard();
    for (const role of DEBATE_ROLES) expect(scorecard.roles[role].length, role).toBeGreaterThan(0);
    expect(new Set(scorecard.candidates.map((candidate) => candidate.maker)).size).toBeGreaterThanOrEqual(3);
    expect(scorecard.candidates.length).toBeGreaterThanOrEqual(6);
    expect(scorecard.candidates.some((candidate) => candidate.thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY)).toBe(true);
    expect(scorecard.candidates.some((candidate) => candidate.contextWindowTokens === 16_000)).toBe(true);
  });
});

describe("parseScorecard — refuse whole, never throw, never half-apply", () => {
  it("ignores an unknown future field, at the top and inside a candidate", () => {
    const result = parseScorecard(exampleWith((value) => {
      value.futureField = { addedBy: "a newer evaluator" };
      (value.candidates[0]! as Record<string, unknown>).futureTag = "ignored";
    }), TEST_ENGINE_VERSION);
    if (result.state !== "VALID") throw new Error(`refused: ${result.detail}`);
    expect(result.scorecard).not.toHaveProperty("futureField");
    expect(result.scorecard.candidates[0]).not.toHaveProperty("futureTag");
  });

  it("reads an omitted contextWindowTokens or qualityByLanguage as null (both optional in the file)", () => {
    const result = parseScorecard(exampleWith((value) => {
      delete (value.candidates[0]! as Record<string, unknown>).contextWindowTokens;
      delete (value.roles.POSITION[0]! as Record<string, unknown>).qualityByLanguage;
    }), TEST_ENGINE_VERSION);
    if (result.state !== "VALID") throw new Error(`refused: ${result.detail}`);
    expect(result.scorecard.candidates[0]!.contextWindowTokens).toBeNull();
    expect(result.scorecard.roles.POSITION[0]!.qualityByLanguage).toBeNull();
  });

  const SCHEMA_INVALID: readonly { readonly name: string; readonly edit: (value: EditableScorecard) => void }[] = [
    { name: "a missing pickerSettings", edit: (value) => { delete (value as Record<string, unknown>).pickerSettings; } },
    { name: "another kind of file", edit: (value) => { (value as Record<string, unknown>).kind = "DEBATEAI_MOMENT"; } },
    { name: "a role the engine does not know", edit: (value) => { (value.roles as Record<string, unknown>).ORACLE = []; } },
    { name: "a missing role", edit: (value) => { delete (value.roles as Partial<Record<string, unknown>>).JUDGE; } },
    { name: "a latest alias instead of a pinned model", edit: (value) => { value.candidates[0]!.modelId = "example-openai-latest"; } },
    { name: "a quality band whose low is above its score", edit: (value) => { value.roles.POSITION[0]!.quality.low = 89; } },
    { name: "the same candidate listed twice", edit: (value) => { value.candidates.push(structuredClone(value.candidates[0]!)); } },
    { name: "a thinking level that is not a level name", edit: (value) => { value.candidates[0]!.thinkingLevel = "very high"; } },
    { name: "a thinking level the gateway and the ledger refuse (capitalised)", edit: (value) => { value.candidates[0]!.thinkingLevel = "High"; } },
    { name: "a scorecard version the ledger's integer column cannot hold", edit: (value) => { value.scorecardVersion = 2_147_483_648; } },
    { name: "a diversity share above one half", edit: (value) => { value.pickerSettings.diversityShare = 0.6; } },
    { name: "a candidate with no access route", edit: (value) => { value.candidates[0]!.accessRoutes = []; } },
    {
      name: "a subscription tool that has no relay",
      edit: (value) => { (value.candidates[0]! as Record<string, unknown>).accessRoutes = [{ kind: "SUBSCRIPTION", tool: "cursor" }]; }
    }
  ];

  it.each(SCHEMA_INVALID)("refuses $name as SCHEMA_INVALID", ({ edit }) => {
    expect(refusalOf(parseScorecard(exampleWith(edit), TEST_ENGINE_VERSION)).reason).toBe("SCHEMA_INVALID");
  });

  it("compares engine versions as dotted integers, not as text", () => {
    const within = (minEngineVersion: string, maxEngineVersion: string | null): unknown => exampleWith((value) => {
      value.engineCompatibility = { minEngineVersion, maxEngineVersion };
    });
    expect(parseScorecard(within("0.9.0", null), "0.10.0").state).toBe("VALID");
    expect(refusalOf(parseScorecard(within("0.9.0", null), "0.8.12")).reason).toBe("ENGINE_INCOMPATIBLE");
    expect(parseScorecard(within("0.1.0", "0.2.0"), "0.2.0").state).toBe("VALID");
    expect(parseScorecard(within("0.1.0", null), "0.1").state).toBe("VALID");
    expect(refusalOf(parseScorecard(within("0.1.0", "0.2.0"), "0.2.1")).reason).toBe("ENGINE_INCOMPATIBLE");
    expect(refusalOf(parseScorecard(within("0.1.0", null), "v0.1.0")).reason).toBe("ENGINE_INCOMPATIBLE");
  });

  it("refuses a role entry naming a candidate that is not listed as UNKNOWN_CANDIDATE", () => {
    const refusal = refusalOf(parseScorecard(exampleWith((value) => {
      value.roles.REVIEWER[0]!.candidateId = "ghost-candidate";
    }), TEST_ENGINE_VERSION));
    expect(refusal.reason).toBe("UNKNOWN_CANDIDATE");
    expect(refusal.detail).toContain("ghost-candidate");
  });

  it("refuses a number the register could not seal as NUMBER_SHAPE, naming its path", () => {
    const decimals = refusalOf(parseScorecard(exampleWith((value) => {
      value.roles.POSITION[0]!.quality.score = 85.1234567;
    }), TEST_ENGINE_VERSION));
    expect(decimals.reason).toBe("NUMBER_SHAPE");
    expect(decimals.detail).toContain("$.roles.POSITION[0].quality.score");
    const unsafe = refusalOf(parseScorecard(exampleWith((value) => {
      value.roles.POSITION[0]!.typicalCall.seconds = 2 ** 53;
    }), TEST_ENGINE_VERSION));
    expect(unsafe.reason).toBe("NUMBER_SHAPE");
    // Unknown fields are stripped from the result but a register row seals the file as
    // published, so they are held to the same rule.
    const hidden = refusalOf(parseScorecard(exampleWith((value) => {
      value.futureWeight = 1e-7;
    }), TEST_ENGINE_VERSION));
    expect(hidden.reason).toBe("NUMBER_SHAPE");
    expect(hidden.detail).toContain("$.futureWeight");
  });

  it("never throws, whatever it is handed", () => {
    const hostile = new Proxy({}, { get() { throw new Error("hostile getter"); } });
    for (const value of [undefined, null, "a scorecard", 42, [], hostile]) {
      const read = (): ScorecardParseResult => parseScorecard(value, TEST_ENGINE_VERSION);
      expect(read).not.toThrow();
      expect(read().state).toBe("REFUSED");
    }
    const cyclic = readExampleScorecardJson() as Record<string, unknown>;
    cyclic.loop = cyclic;
    expect(parseScorecard(cyclic, TEST_ENGINE_VERSION).state).toBe("VALID");
  });

  it("hands back its own copy, so a later edit of the input changes nothing", () => {
    const value = readExampleScorecardJson() as Scorecard;
    const result = parseScorecard(value, TEST_ENGINE_VERSION);
    if (result.state !== "VALID") throw new Error(result.detail);
    value.candidates[0]!.maker = "Changed after parsing";
    expect(result.scorecard.candidates[0]!.maker).toBe("OpenAI");
  });
});

describe("NUMBER_SHAPE is the register's canonical-decimal rule", () => {
  const PROBES = [
    0, -0, 1, -1, 0.5, 14.5, 0.2, 0.25, 0.000001, 1e-7, 0.1234567, 0.1 + 0.2, 1 / 3,
    123456789.123456, 1234567890.123456, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
    -Number.MAX_SAFE_INTEGER, 1e21, 2.5e-3, 99.999999, Number.NaN, Number.POSITIVE_INFINITY
  ];
  const registerSeals = (value: number): boolean => {
    try {
      canonicalDecimal(String(value));
      return true;
    } catch {
      return false;
    }
  };

  it("agrees with canonicalDecimal(String(n)), the dev seeder's own conversion, on every probe", () => {
    expect(PROBES.map((value) => isRegisterSealableNumber(value))).toEqual(PROBES.map(registerSeals));
  });

  it("does not agree vacuously: it seals plain decimals and refuses the rest", () => {
    expect([0.5, 0.000001, 99.999999, Number.MAX_SAFE_INTEGER].map((value) => isRegisterSealableNumber(value)))
      .toEqual([true, true, true, true]);
    expect([1e-7, 0.1234567, 0.1 + 0.2, Number.MAX_SAFE_INTEGER + 1, 1e21, Number.NaN].map((value) => isRegisterSealableNumber(value)))
      .toEqual([false, false, false, false, false, false]);
  });
});
