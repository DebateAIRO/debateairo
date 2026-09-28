/**
 * A20 — the pure half of ask admission with a model scorecard: what admission
 * hands the picker. Nothing here decides a seat; every row pins how one
 * deployment fact becomes one picker input.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ASK_MODEL_ASSIGNMENT_INVALID,
  ASK_MODEL_REFUSALS,
  answerTokenCeilingsByRole,
  askModelPickerSettings,
  askTargetFacts,
  debaterSeatCount,
  describeModelScorecard,
  expectedCallsByRoleFromBasis,
  isUsablePerRunCeiling,
  reachableInTodaysOrder,
  seatDemandForDebaters,
  targetPricesOf
} from "@debateai/api";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import {
  BUNDLED_MODEL_SCORECARD_SOURCE_REF,
  computeStructuralCeilingBasis,
  readBundledModelScorecard,
  readCallTokenCeilings,
  readEngineVersion
} from "@debateai/register";
import type { Scorecard } from "@debateai/scorecard";
import { compatibleExampleScorecard } from "../support/modelScorecardFixture.js";

const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3,
  organMaxAttempts: 3,
  maxRecompose: 1,
  maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1,
  branchingFactor: 2,
  compositionSegmentCap: 4,
  fixedOrgansPerComposition: 6,
  reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3,
  evaluatorMaxRounds: 3,
  maxDepth: 5
});

function basis(panelSize: number, depth: number) {
  return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth });
}

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-09-26T00:00:00.000Z"
  });
}

const TARGETS: readonly ProviderDiscoveryTarget[] = Object.freeze([
  Object.freeze({
    providerRef: "vendor:alpha", maker: "Alpha", baseUrl: "https://api.alpha-vendor-fixture.com/v1",
    model: "alpha-large", inputPriceMicrosPerMillionTokens: 3_000_000, outputPriceMicrosPerMillionTokens: 15_000_000,
    thinkingParameter: "reasoning_effort" as const, thinkingLevels: Object.freeze(["low", "high"]),
    contextWindowTokens: 200_000
  }),
  Object.freeze({
    providerRef: "development:pi-glm-cli", maker: "Z.AI", baseUrl: "http://127.0.0.1:8798/v1", model: "glm-5.3-flash",
    thinkingParameter: "x_thinking_level" as const, thinkingLevels: Object.freeze(["low", "high"]),
    contextWindowTokens: 1_000_000
  }),
  Object.freeze({
    providerRef: "development:grok-cli", maker: "xAI", baseUrl: "http://127.0.0.1:8793/v1", model: "grok-4.7-build"
  })
]);


/** Final review I3: the sealed per-call answer bounds — debate calls, the writer's and the checker's. */
const CEILINGS = Object.freeze({ judge: 2048, synthesizer: 4096, evaluator: 1024 });

describe("A20 · expected calls per role come from the admitted structure", () => {
  it.each([
    { panelSize: 1, depth: 1, expected: { POSITION: 1, SUPPORT_ATTACK: 0, CROSS_EXCHANGE: 0, JUDGE: 0, REVIEWER: 0, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 2, depth: 1, expected: { POSITION: 2, SUPPORT_ATTACK: 4, CROSS_EXCHANGE: 2, JUDGE: 8, REVIEWER: 8, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 3, depth: 1, expected: { POSITION: 3, SUPPORT_ATTACK: 6, CROSS_EXCHANGE: 6, JUDGE: 30, REVIEWER: 15, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 3, depth: 2, expected: { POSITION: 3, SUPPORT_ATTACK: 18, CROSS_EXCHANGE: 6, JUDGE: 54, REVIEWER: 27, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } }
  ])("maps $panelSize debaters at depth $depth", ({ panelSize, depth, expected }) => {
    const admitted = basis(panelSize, depth);
    const calls = expectedCallsByRoleFromBasis(admitted);
    expect(calls).toEqual(expected);
    const sites = admitted.call_sites as { author: number };
    const serveLeg = admitted.serve_leg as { synthesis_loop_sites: number };
    // The split partitions the same tree the run ceiling counts: nothing lost, nothing invented.
    expect(calls.POSITION + calls.SUPPORT_ATTACK + calls.CROSS_EXCHANGE).toBe(sites.author);
    expect(calls.ANSWER_WRITER + calls.ANSWER_CHECKER).toBe(serveLeg.synthesis_loop_sites);
  });

  it("refuses a basis with no call-site split as an engine fault", () => {
    expect(() => expectedCallsByRoleFromBasis({ max_model_attempts: 1 }))
      .toThrowError(expect.objectContaining({ name: "TypedDomainError", code: "ASK_MODEL_ASSIGNMENT_INVALID" }));
  });

  // Carry 11 (A20.1 review M3): the second engine-fault branch, each half on its own.
  it.each([
    { name: "fewer author sites than P + CX and an odd synthesis count", author: 5, synthesis: 3 },
    { name: "fewer author sites than P + CX", author: 5, synthesis: 6 },
    { name: "an odd synthesis-site count", author: 9, synthesis: 3 }
  ])("refuses a basis that does not split into roles: $name", ({ author, synthesis }) => {
    const handBuilt = {
      panel_size: 3,
      call_sites: { author, panel: 0, reviewer: 0, serve: 0 },
      serve_leg: { synthesis_loop_sites: synthesis }
    };
    expect(() => expectedCallsByRoleFromBasis(handBuilt)).toThrowError(expect.objectContaining({
      name: "TypedDomainError",
      code: "ASK_MODEL_ASSIGNMENT_INVALID",
      message: "The admitted structural basis does not split into roles"
    }));
  });
});

describe("A20 · seats", () => {
  it("demands a seat per debater in every debate role, and one per answer role", () => {
    expect(seatDemandForDebaters(1)).toEqual({
      POSITION: 1, SUPPORT_ATTACK: 0, CROSS_EXCHANGE: 0, JUDGE: 0, REVIEWER: 0, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    });
    expect(seatDemandForDebaters(3)).toEqual({
      POSITION: 3, SUPPORT_ATTACK: 3, CROSS_EXCHANGE: 3, JUDGE: 3, REVIEWER: 3, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    });
  });

  // Carry 11 (A20.1 review M2): "no debaters, but a writer and a checker" is never demanded.
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses %s debaters as an engine fault",
    (debaters) => {
      expect(() => seatDemandForDebaters(debaters)).toThrowError(expect.objectContaining({
        name: "TypedDomainError", code: "ASK_MODEL_ASSIGNMENT_INVALID"
      }));
    }
  );

  it("seats the plan's number of debaters, capped by the distinct makers reachable", () => {
    const facts = new Map();
    const five = reachableInTodaysOrder([
      member("a", "OpenAI", "m1"), member("b", "Anthropic", "m2"), member("c", "xAI", "m3"),
      member("d", "Google", "m4"), member("e", "Z.AI", "m5")
    ], [], facts);
    const two = reachableInTodaysOrder([
      member("a", "OpenAI", "m1"), member("b", "OpenAI", "m2"), member("c", "Anthropic", "m3")
    ], [], facts);
    expect(debaterSeatCount(five, 3)).toBe(3);
    expect(debaterSeatCount(two, 3)).toBe(2);
    expect(debaterSeatCount([], 3)).toBe(0);
  });
});

describe("A20 · reachable targets keep today's order", () => {
  it("puts the plan roster's members first, in roster order, then every other target in discovery order", () => {
    const discovered = [
      member("vendor:x", "xAI", "grok-4.7-build"),
      member("vendor:b", "Anthropic", "claude-opus-5"),
      member("vendor:a", "OpenAI", "gpt-5.6-sol"),
      member("vendor:a2", "OpenAI", "gpt-5.6-sol"),
      member("development:pi-glm-cli", "Z.AI", "glm-5.3-flash")
    ];
    // The premium roster, read from the contract (pre-flight ruling F22): this row holds before and
    // after A20b moves its grok id, because vendor:x comes third either way.
    const reachable = reachableInTodaysOrder(discovered, PLAN_TIER_ROSTERS.premium, askTargetFacts(TARGETS));
    // The first target serving a roster id is the one today's filter seats; the second stays reachable after it.
    expect(reachable.map((target) => target.providerRef))
      .toEqual(["vendor:a", "vendor:b", "vendor:x", "vendor:a2", "development:pi-glm-cli"]);
    expect(reachable.find((target) => target.providerRef === "development:pi-glm-cli")).toEqual({
      providerRef: "development:pi-glm-cli", maker: "Z.AI", modelId: "glm-5.3-flash",
      thinkingLevels: ["low", "high"], contextWindowTokens: 1_000_000
    });
    // A target the deployment declares nothing for can set no level and has no declared window.
    expect(reachable.find((target) => target.providerRef === "vendor:x"))
      .toMatchObject({ thinkingLevels: [], contextWindowTokens: null });
  });
});

describe("A20 · deployment facts", () => {
  it("reads each target's levels, window and configured price, and keys prices by provider ref", () => {
    const facts = askTargetFacts(TARGETS);
    expect(facts.get("vendor:alpha")).toEqual({
      thinkingLevels: ["low", "high"], contextWindowTokens: 200_000,
      price: { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 }
    });
    expect(facts.get("development:grok-cli")).toEqual({ thinkingLevels: [], contextWindowTokens: null, price: null });
    expect([...targetPricesOf(facts)]).toEqual([
      ["vendor:alpha", { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 }]
    ]);
  });

  it("builds HOSTED settings with the per-run ceiling, and LOCAL settings without one", () => {
    const absent = Object.freeze({ state: "ABSENT" as const });
    expect(askModelPickerSettings({
      scorecard: absent, deploymentMode: "hosted", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros: 250_000
    })).toMatchObject({ mode: "HOSTED", perRunCeilingMicros: 250_000 });
    expect(askModelPickerSettings({
      scorecard: absent, deploymentMode: "local", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros: 250_000
    })).toMatchObject({ mode: "LOCAL", perRunCeilingMicros: null });
  });

  // Carry 11 (A20.1 review M1): a hosted ceiling that bounds nothing would switch off the step-down silently.
  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses HOSTED settings at boot whose per-run ceiling is %s",
    (perRunCeilingMicros) => {
      expect(() => askModelPickerSettings({
        scorecard: Object.freeze({ state: "ABSENT" as const }), deploymentMode: "hosted", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros
      })).toThrowError(new TypeError("ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED"));
    }
  );

  // Carry 16 (A20.3 review m4): ONE test of a usable per-run ceiling, asked by boot and by admission.
  it("judges a per-run ceiling in one place, for the boot guard and for admission alike", async () => {
    for (const usable of [1, 250_000, Number.MAX_SAFE_INTEGER]) expect(isUsablePerRunCeiling(usable)).toBe(true);
    for (const unusable of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isUsablePerRunCeiling(unusable)).toBe(false);
    }
    const [admission, settings] = await Promise.all([
      readFile("apps/api/src/index.ts", "utf8"),
      readFile("apps/api/src/ask-model-picker.ts", "utf8")
    ]);
    expect(admission).toContain("isUsablePerRunCeiling(picker.perRunCeilingMicros)");
    expect(settings).toContain("!isUsablePerRunCeiling(input.perRunCeilingMicros)");
    // Neither restates the test.
    for (const source of [admission, settings]) expect(source).not.toContain("Number.isSafeInteger(ceiling)");
  });

  it("keeps LOCAL settings without a ceiling: local mode has no money bound", () => {
    expect(askModelPickerSettings({
      scorecard: Object.freeze({ state: "ABSENT" as const }), deploymentMode: "local", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros: null
    })).toMatchObject({ mode: "LOCAL", perRunCeilingMicros: null });
  });

  // Carry 11 (A20.1 review M3): the settings carry the deployment's facts and the operator's log through.
  it("passes the targets' facts and the operator log through, and adds no log when none is given", () => {
    const log = (_line: string): void => undefined;
    const scorecard = Object.freeze({ state: "ABSENT" as const });
    const withLog = askModelPickerSettings({
      scorecard, deploymentMode: "hosted", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros: 250_000, log
    });
    expect(withLog.scorecard).toBe(scorecard);
    expect([...withLog.targetFacts]).toEqual([...askTargetFacts(TARGETS)]);
    expect(withLog.log).toBe(log);
    const withoutLog = askModelPickerSettings({
      scorecard, deploymentMode: "local", targets: TARGETS, callTokenCeilings: CEILINGS, perRunCeilingMicros: null
    });
    expect("log" in withoutLog).toBe(false);
    expect(Object.isFrozen(withLog)).toBe(true);
  });

  // Carry 11 (A20.1 review M3): the two refusals the asker reads are constant sentences with typed codes.
  it("keeps the picker refusals' codes and sentences constant", () => {
    expect(ASK_MODEL_REFUSALS).toEqual({
      BUDGET_TOO_SMALL: {
        code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
        // A21.3 fix rounds 1-2: only what the picker established — the ESTIMATE, even at Economy, is
        // over the per-run limit. No remedy (a Free asker cannot change the tree depth), and no claim
        // about the cheapest models (Economy is the best model under a cost cap, not the cheapest).
        message: "This debate would cost more than this site allows for one debate"
      },
      NO_REACHABLE_CANDIDATE: {
        code: "ASK_MODEL_CANDIDATE_UNAVAILABLE",
        message: "No model is reachable right now for one of this debate's jobs"
      }
    });
    for (const refusal of Object.values(ASK_MODEL_REFUSALS)) {
      expect(refusal.message).not.toMatch(/tree depth/iu);
      expect(refusal.message).not.toMatch(/most economical|least costly|whichever/iu);
    }
    expect(Object.isFrozen(ASK_MODEL_REFUSALS)).toBe(true);
    expect(Object.isFrozen(ASK_MODEL_REFUSALS.BUDGET_TOO_SMALL)).toBe(true);
    expect(Object.isFrozen(ASK_MODEL_REFUSALS.NO_REACHABLE_CANDIDATE)).toBe(true);
    expect(ASK_MODEL_ASSIGNMENT_INVALID).toBe("ASK_MODEL_ASSIGNMENT_INVALID");
  });

  it("says in one line which scorecard the deployment runs", () => {
    const scorecard = Object.freeze({ scorecardVersion: 4 }) as unknown as Scorecard;
    expect(describeModelScorecard({ state: "VALID", scorecard, sourceRef: BUNDLED_MODEL_SCORECARD_SOURCE_REF }, "local"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=bundled-file");
    expect(describeModelScorecard({ state: "ABSENT" }, "hosted"))
      .toBe("MODEL_SCORECARD state=ABSENT source=register (asks keep the plan rosters)");
    expect(describeModelScorecard({ state: "REFUSED", reason: "ENGINE_INCOMPATIBLE", detail: "long text" }, "hosted"))
      .toBe("MODEL_SCORECARD state=REFUSED reason=ENGINE_INCOMPATIBLE source=register (asks keep the plan rosters)");
  });

  // A20.4 review M1: for a VALID scorecard the line names what was READ (its sourceRef), not only the
  // mode, and says in plain words when that is not what this mode reads. The sourceRef itself, which
  // can carry operator text, is never printed.
  it("names the source a VALID scorecard was read from, and flags one this mode must not read", async () => {
    const scorecard = Object.freeze({ scorecardVersion: 4 }) as unknown as Scorecard;
    const fromRegister = {
      state: "VALID" as const, scorecard, sourceRef: "operator:hosted-2026-09 | modelScorecard v4 sha256:ab12"
    };
    const fromFile = { state: "VALID" as const, scorecard, sourceRef: BUNDLED_MODEL_SCORECARD_SOURCE_REF };
    expect(describeModelScorecard(fromRegister, "hosted"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=register");
    expect(describeModelScorecard(fromFile, "local"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=bundled-file");
    expect(describeModelScorecard(fromFile, "hosted"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=bundled-file (wrong source: hosted mode reads the register)");
    expect(describeModelScorecard(fromRegister, "local"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=register (wrong source: local mode reads the bundled file)");
    for (const mode of ["hosted", "local"] as const) {
      expect(describeModelScorecard(fromRegister, mode)).not.toContain("operator:");
    }
    // Tied to the real reader: what readBundledModelScorecard returns is labelled bundled-file.
    const root = await mkdtemp(join(tmpdir(), "a204-scorecard-line-"));
    try {
      const location = pathToFileURL(join(root, "current.json"));
      await writeFile(location, JSON.stringify(await compatibleExampleScorecard(4)));
      const read = await readBundledModelScorecard(await readEngineVersion(), location);
      expect(describeModelScorecard(read, "local"))
        .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=bundled-file");
      expect(describeModelScorecard(read, "hosted")).toMatch(/source=bundled-file \(wrong source: /u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/*
 * Final review I3 — the picker's window check is never looser than the gateway's wall, whose
 * answer side is each call's sealed `tokenCeiling`. Admission reads those bounds ONCE at boot
 * (never per ask) and hands the picker each role's own: every debate call — positions,
 * arguments, exchanges, the panel and reviews — goes through the JUDGE bound; the answer writer
 * through the SYNTHESIZER bound, the checker through the EVALUATOR bound.
 */
describe("final review I3 · the sealed answer bounds reach the picker", () => {
  it("maps the three sealed bounds onto the seven debate jobs", () => {
    expect(answerTokenCeilingsByRole(CEILINGS)).toEqual({
      POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
      ANSWER_WRITER: 4096, ANSWER_CHECKER: 1024
    });
  });

  it("carries them in the settings, in both modes, and refuses a bound that bounds nothing", () => {
    for (const deploymentMode of ["hosted", "local"] as const) {
      expect(askModelPickerSettings({
        scorecard: Object.freeze({ state: "ABSENT" as const }), deploymentMode, targets: TARGETS,
        callTokenCeilings: CEILINGS, perRunCeilingMicros: 250_000
      }).answerTokenCeilings).toEqual(answerTokenCeilingsByRole(CEILINGS));
    }
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const role of ["judge", "synthesizer", "evaluator"] as const) {
        expect(() => askModelPickerSettings({
          scorecard: Object.freeze({ state: "ABSENT" as const }), deploymentMode: "local", targets: TARGETS,
          callTokenCeilings: { ...CEILINGS, [role]: bad }, perRunCeilingMicros: null
        })).toThrowError(new TypeError("ASK_MODEL_PICKER_CALL_TOKEN_CEILINGS_INVALID"));
      }
    }
  });

  it("reads the three bounds once from the register rows in force, and refuses rows that do not carry them", async () => {
    const rows = (overrides: Readonly<Record<string, unknown>> = {}) => ({
      acceptanceOrganCostBounds: {
        kind: "ACCEPTANCE_ORGAN_COST_BOUNDS",
        organs: {
          JUDGE: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180_000 },
          COMPOSER: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 60_000 },
          CONFORMANCE: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 60_000 }
        }
      },
      synthesizerCallBound: { kind: "SYNTHESIZER_CALL_BOUND", maxAttempts: 3, tokenCeiling: 4096, deadlineMs: 240_000 },
      evaluatorCallBound: { kind: "EVALUATOR_CALL_BOUND", maxAttempts: 3, tokenCeiling: 1024, deadlineMs: 240_000 },
      ...overrides
    });
    const queries: unknown[][] = [];
    const poolWith = (values: Readonly<Record<string, unknown>>) => ({
      query: async (_sql: string, parameters: unknown[]) => {
        queries.push(parameters);
        return { rows: Object.entries(values).map(([row_key, value_json]) => ({ row_key, value_json })) };
      }
    }) as unknown as Parameters<typeof readCallTokenCeilings>[0];
    expect(await readCallTokenCeilings(poolWith(rows()), 7)).toEqual(CEILINGS);
    expect(queries).toEqual([[7, ["acceptanceOrganCostBounds", "synthesizerCallBound", "evaluatorCallBound"]]]);
    const { evaluatorCallBound: _missing, ...withoutEvaluator } = rows();
    for (const broken of [
      withoutEvaluator,
      rows({ synthesizerCallBound: { kind: "SYNTHESIZER_CALL_BOUND", maxAttempts: 3, deadlineMs: 1 } }),
      rows({ acceptanceOrganCostBounds: { kind: "ACCEPTANCE_ORGAN_COST_BOUNDS", organs: { JUDGE: { maxAttempts: 3 } } } })
    ]) {
      await expect(readCallTokenCeilings(poolWith(broken), 7)).rejects.toThrowError(new TypeError("CALL_TOKEN_CEILINGS_UNRESOLVED"));
    }
  });
});
