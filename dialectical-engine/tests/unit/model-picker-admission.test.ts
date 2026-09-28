/**
 * A20 — ask admission with a model scorecard.
 *
 * The picker is another task's unit (`@debateai/scorecard`); here it is a
 * recorded double, so every assertion is about what ADMISSION hands it and
 * what admission does with each answer. The no-scorecard path is
 * tests/unit/tiers-s02-admission.test.ts, unchanged and still green.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PickerInput,
  PickerOutcome,
  RoleAssignment,
  RoleSeat,
  Scorecard,
  SeatCandidate
} from "@debateai/scorecard";

const picker = vi.hoisted(() => ({ calls: [] as unknown[], outcome: null as unknown }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  pickRoleAssignment: (input: unknown) => {
    picker.calls.push(input);
    return picker.outcome;
  }
}));

import {
  evaluateAskAdmission,
  type AskModelPickerSettings,
  type AskTargetFacts,
  type RunCreationSettings
} from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import { TypedDomainError, type ModelStrength } from "@debateai/kernel";
import { computeStructuralCeilingBasis } from "@debateai/register";

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

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-09-26T00:00:00.000Z"
  });
}

/** This Mac's seven relays as the dev panel names them (M4: grok now answers as grok-4.7-build). */
const LOCAL_PANEL: readonly DiscoveredPanelMember[] = Object.freeze([
  member("development:codex-cli", "OpenAI", "gpt-5.6-luna"),
  member("development:codex-premium-cli", "OpenAI", "gpt-5.6-sol"),
  member("development:claude-cli", "Anthropic", "claude-sonnet-5"),
  member("development:claude-premium-cli", "Anthropic", "claude-opus-5"),
  member("development:grok-cli", "xAI", "grok-4.7-build"),
  member("development:agy-cli", "Google", "gemini-3.8-flash"),
  member("development:pi-glm-cli", "Z.AI", "glm-5.3-flash")
]);

function at(providerRef: string): DiscoveredPanelMember {
  return LOCAL_PANEL.find((candidate) => candidate.provider_ref === providerRef)!;
}

function ask(planTier: AskRequest["plan_tier"], modelStrength?: ModelStrength): AskRequest {
  return {
    question_line: "Which models should debate this question?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "a20 admission test",
    as_of: "2026-09-26T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: [],
    ...(modelStrength === undefined ? {} : { model_strength: modelStrength })
  };
}

function settingsWith(input: Readonly<{
  panel?: readonly DiscoveredPanelMember[];
  modelPicker?: AskModelPickerSettings;
  panelSizes?: number[];
  /** Pre-flight ruling F17: every backup provision admission asked the ceiling for, in order. */
  backups?: (0 | 1)[];
  discoveries?: { count: number };
  assertDailyCostEnvelope?: () => Promise<void>;
  /** Carry 15 m3: a composition that forgets to pass the backup provision through. */
  dropsBackupProvision?: boolean;
}>): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:a20",
    settlementWatchHandle: "watch:a20",
    ...(input.assertDailyCostEnvelope === undefined ? {} : { assertDailyCostEnvelope: input.assertDailyCostEnvelope }),
    resolveDiscoveredPanel: async () => {
      if (input.discoveries !== undefined) input.discoveries.count += 1;
      return input.panel ?? LOCAL_PANEL;
    },
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) => {
      input.panelSizes?.push(panelSize);
      input.backups?.push(backupSequencesProvisioned);
      return computeStructuralCeilingBasis({
        ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth),
        ...(input.dropsBackupProvision === true ? {} : { backupSequencesProvisioned })
      });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    }),
    ...(input.modelPicker === undefined ? {} : { modelPicker: input.modelPicker })
  };
}

/** The picker is a recorded double, so admission only carries the scorecard through. */
const SCORECARD = Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard;

function valid(overrides: Partial<AskModelPickerSettings> = {}): AskModelPickerSettings {
  return {
    scorecard: Object.freeze({ state: "VALID" as const, scorecard: SCORECARD, sourceRef: "test:a20-scorecard" }),
    mode: "LOCAL",
    // Typed, so the two entries' `contextWindowTokens` (null and 1_000_000) unify (pre-flight fix F10).
    targetFacts: new Map<string, AskTargetFacts>([
      ["development:claude-premium-cli", Object.freeze({
        thinkingLevels: Object.freeze(["low", "high", "max"]), contextWindowTokens: null, price: null
      })],
      ["development:pi-glm-cli", Object.freeze({
        thinkingLevels: Object.freeze(["low", "high"]), contextWindowTokens: 1_000_000, price: null
      })]
    ]),
    perRunCeilingMicros: null,
    ...overrides
  };
}

function candidate(source: DiscoveredPanelMember, thinkingLevel = "DEFAULT_ONLY"): SeatCandidate {
  return Object.freeze({
    candidateId: `${source.model_id}@${thinkingLevel}`, providerRef: source.provider_ref,
    maker: source.maker, modelId: source.model_id, thinkingLevel
  });
}

function seat(seatIndex: number, main: SeatCandidate): RoleSeat {
  return Object.freeze({ seatIndex, main, runnerUp: null, diversityShare: 0, source: "SCORECARD" as const });
}

function assigned(debaters: readonly SeatCandidate[], strength: ModelStrength = "BALANCED", steppedDown = false): PickerOutcome {
  const seats = Object.freeze(debaters.map((main, index) => seat(index, main)));
  const perDebater = debaters.length >= 2 ? seats : Object.freeze([]);
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: 7,
    strength,
    roles: Object.freeze({
      POSITION: seats,
      SUPPORT_ATTACK: perDebater,
      CROSS_EXCHANGE: perDebater,
      JUDGE: perDebater,
      REVIEWER: perDebater,
      ANSWER_WRITER: Object.freeze([seat(0, debaters[0]!)]),
      ANSWER_CHECKER: Object.freeze([seat(0, debaters[debaters.length - 1]!)])
    })
  });
  return Object.freeze({
    state: "ASSIGNED" as const,
    assignment,
    appliedStrength: strength,
    steppedDown,
    estimate: Object.freeze({ mode: "LOCAL" as const, moneyMicros: null, seconds: 900 }),
    notes: Object.freeze(["REVIEWER: no scorecard entry reachable; discovery order used"])
  });
}

function lastInput(): PickerInput {
  return picker.calls.at(-1) as PickerInput;
}

beforeEach(() => {
  picker.calls.length = 0;
  picker.outcome = null;
});

describe("A20 · without a VALID scorecard admission is today's roster path", () => {
  it.each([
    { name: "no picker configured", modelPicker: undefined },
    { name: "an ABSENT scorecard", modelPicker: valid({ scorecard: Object.freeze({ state: "ABSENT" as const }) }) },
    {
      name: "a REFUSED scorecard",
      modelPicker: valid({
        scorecard: Object.freeze({ state: "REFUSED" as const, reason: "ENGINE_INCOMPATIBLE" as const, detail: "test" })
      })
    }
  ])("$name: roster order, roster-sized envelope, no assignment, no picker call", async ({ modelPicker }) => {
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(
      settingsWith({ panelSizes, ...(modelPicker === undefined ? {} : { modelPicker }) }), ask("free", "BEST")
    );
    expect(result.discoveredPanel.map((entry) => entry.model_id)).toEqual(["gpt-5.6-luna", "claude-sonnet-5"]);
    expect(panelSizes).toEqual([2]);
    expect("modelAssignment" in result).toBe(false);
    expect(picker.calls).toEqual([]);
  });
});

describe("A20 · with a VALID scorecard the picker replaces the roster filter", () => {
  it("hands the picker today's order: roster members first, then every other reachable target", async () => {
    picker.outcome = assigned([
      candidate(at("development:codex-premium-cli")),
      candidate(at("development:claude-premium-cli"), "high"),
      candidate(at("development:agy-cli"))
    ]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("premium"));
    expect(lastInput().reachable.map((target) => target.modelId)).toEqual([
      "gpt-5.6-sol", "claude-opus-5", "grok-4.7-build",
      "gpt-5.6-luna", "claude-sonnet-5", "gemini-3.8-flash", "glm-5.3-flash"
    ]);
    expect(lastInput().reachable.find((target) => target.providerRef === "development:pi-glm-cli")).toEqual({
      providerRef: "development:pi-glm-cli", maker: "Z.AI", modelId: "glm-5.3-flash",
      thinkingLevels: ["low", "high"], contextWindowTokens: 1_000_000
    });
  });

  it("demands the plan's debaters and the admitted structure's calls", async () => {
    picker.outcome = assigned([candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free"));
    expect(lastInput().seatDemand).toEqual({
      POSITION: 2, SUPPORT_ATTACK: 2, CROSS_EXCHANGE: 2, JUDGE: 2, REVIEWER: 2, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    });
    expect(lastInput().expectedCallsByRole).toEqual({
      POSITION: 2, SUPPORT_ATTACK: 4, CROSS_EXCHANGE: 2, JUDGE: 8, REVIEWER: 8, ANSWER_WRITER: 3, ANSWER_CHECKER: 3
    });
    picker.outcome = assigned([
      candidate(at("development:codex-premium-cli")),
      candidate(at("development:claude-premium-cli")),
      candidate(at("development:grok-cli"))
    ]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("premium"));
    expect(lastInput().seatDemand.POSITION).toBe(3);
    expect(lastInput().expectedCallsByRole).toEqual({
      POSITION: 3, SUPPORT_ATTACK: 6, CROSS_EXCHANGE: 6, JUDGE: 30, REVIEWER: 15, ANSWER_WRITER: 3, ANSWER_CHECKER: 3
    });
  });

  it("passes the asker's strength, the plan only when hosted, the per-run ceiling and the configured prices", async () => {
    picker.outcome = assigned([candidate(at("development:codex-premium-cli")), candidate(at("development:claude-premium-cli"))]);
    const price = Object.freeze({ inputMicrosPerMTok: 15_000_000, outputMicrosPerMTok: 75_000_000 });
    await evaluateAskAdmission(settingsWith({
      modelPicker: valid({
        mode: "HOSTED",
        perRunCeilingMicros: 250_000,
        targetFacts: new Map([["development:claude-premium-cli", Object.freeze({
          thinkingLevels: Object.freeze([]), contextWindowTokens: null, price
        })]])
      })
    }), ask("premium", "BEST"));
    const hosted = lastInput();
    expect(hosted).toMatchObject({
      scorecard: SCORECARD, mode: "HOSTED", strength: "BEST", planTier: "premium", perRunCeilingMicros: 250_000
    });
    expect([...hosted.prices]).toEqual([["development:claude-premium-cli", price]]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("premium"));
    expect(lastInput()).toMatchObject({ mode: "LOCAL", strength: null, planTier: null, perRunCeilingMicros: null });
    expect(lastInput().prices.size).toBe(0);
  });

  it("pins the debaters' mains, in seat order, as the run's panel and sizes the envelope to them", async () => {
    const outcome = assigned([
      candidate(at("development:agy-cli")),
      candidate(at("development:claude-premium-cli"), "high"),
      candidate(at("development:codex-premium-cli"))
    ], "ECONOMY", true);
    picker.outcome = outcome;
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(settingsWith({ modelPicker: valid(), panelSizes }), ask("premium", "BEST"));
    expect(result.discoveredPanel.map((entry) => entry.provider_ref))
      .toEqual(["development:agy-cli", "development:claude-premium-cli", "development:codex-premium-cli"]);
    expect(result.discoveredPanel[0]).toBe(at("development:agy-cli"));
    expect(panelSizes).toEqual([3]);
    expect(result.envelopeBasis).toMatchObject({ panel_size: 3 });
    expect(result.criticUnavailableCap.conditionMarks).toEqual([]);
    expect(result.modelAssignment).toEqual({
      assignment: (outcome as Extract<PickerOutcome, { state: "ASSIGNED" }>).assignment,
      appliedStrength: "ECONOMY",
      steppedDown: true
    });
  });

  it("re-sizes the envelope when the picker seats fewer debaters than planned", async () => {
    picker.outcome = assigned([candidate(at("development:claude-premium-cli"), "max")]);
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(settingsWith({ modelPicker: valid(), panelSizes }), ask("premium"));
    expect(panelSizes).toEqual([3, 1]);
    expect(result.envelopeBasis).toMatchObject({ panel_size: 1 });
    expect(result.criticUnavailableCap.conditionMarks).toEqual(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]);
  });

  it("logs the picker's notes and estimate for the operator", async () => {
    picker.outcome = assigned([candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))]);
    const lines: string[] = [];
    await evaluateAskAdmission(settingsWith({ modelPicker: valid({ log: (line) => lines.push(line) }) }), ask("free"));
    expect(lines).toContain("MODEL_PICKER note REVIEWER: no scorecard entry reachable; discovery order used");
    expect(lines.some((line) => line.startsWith("MODEL_PICKER assigned strength=BALANCED"))).toBe(true);
  });
});

/** The same outcome with a runner-up on its first JUDGE seat: the one difference pre-flight ruling F17 reads. */
function withJudgeRunnerUp(outcome: PickerOutcome, runnerUp: SeatCandidate): PickerOutcome {
  if (outcome.state !== "ASSIGNED") return outcome;
  return Object.freeze({
    ...outcome,
    assignment: Object.freeze({
      ...outcome.assignment,
      roles: Object.freeze({
        ...outcome.assignment.roles,
        JUDGE: Object.freeze(outcome.assignment.roles.JUDGE.map((judge, index) => index === 0
          ? Object.freeze({ ...judge, runnerUp, diversityShare: 0.2 })
          : judge))
      })
    })
  });
}

describe("A20 · the attempt ceiling provisions a backup only when a seat has a runner-up (pre-flight ruling F17)", () => {
  it("the roster path pins no assignment, so its ceiling is DR-184-v4 exactly", async () => {
    const backups: (0 | 1)[] = [];
    const result = await evaluateAskAdmission(settingsWith({ backups }), ask("free"));
    expect(backups).toEqual([0]);
    expect(result.envelopeBasis).toMatchObject({ formula_version: "DR-184-v4", max_model_attempts: 106 });
  });

  it("keeps DR-184-v4 for an assignment without a runner-up, and re-sizes to DR-184-v5 for one with a runner-up", async () => {
    const debaters = [candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))];
    picker.outcome = assigned(debaters);
    const plain: (0 | 1)[] = [];
    const withoutBackup = await evaluateAskAdmission(settingsWith({ modelPicker: valid(), backups: plain }), ask("free"));
    expect(plain).toEqual([0]);
    expect(withoutBackup.envelopeBasis).toMatchObject({ formula_version: "DR-184-v4", max_model_attempts: 106 });

    picker.outcome = withJudgeRunnerUp(assigned(debaters), candidate(at("development:grok-cli")));
    const backed: (0 | 1)[] = [];
    const withBackup = await evaluateAskAdmission(settingsWith({ modelPicker: valid(), backups: backed }), ask("free"));
    // The planned basis sizes the expected calls only; the admitted one provisions the backup.
    expect(backed).toEqual([0, 1]);
    // Carry 1 (pre-flight E3): 190, not 196 — A14 kept cross-exchange author sites at v4's allowance
    // (tests/unit/t17-envelope.test.ts pins the same receipt: 106 + 66 + 18).
    expect(withBackup.envelopeBasis).toMatchObject({ formula_version: "DR-184-v5", max_model_attempts: 190, panel_size: 2 });
  });
});

describe("A20 · refusals", () => {
  it("refuses 'even Economy does not fit' with a constant message that names no money", async () => {
    picker.outcome = Object.freeze({
      state: "REFUSED", reason: "BUDGET_TOO_SMALL", detail: "ECONOMY estimate 912345 exceeds the ceiling 250000"
    });
    const lines: string[] = [];
    const error = await evaluateAskAdmission(settingsWith({
      modelPicker: valid({ mode: "HOSTED", perRunCeilingMicros: 250_000, log: (line) => lines.push(line) })
    }), ask("premium")).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ name: "AskRefusal", code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL" });
    expect((error as Error).message).not.toMatch(/250000|912345/u);
    // A21.3 fix round 1: no remedy the asker may be unable to act on.
    expect((error as Error).message).not.toMatch(/tree depth/iu);
    expect(lines.some((line) => line.includes("912345"))).toBe(true);
  });

  it("refuses an unreachable role, and an empty discovery before the picker is asked", async () => {
    picker.outcome = Object.freeze({ state: "REFUSED", reason: "NO_REACHABLE_CANDIDATE", detail: "ANSWER_CHECKER" });
    await expect(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free")))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    picker.calls.length = 0;
    await expect(evaluateAskAdmission(settingsWith({ modelPicker: valid(), panel: [] }), ask("free")))
      .rejects.toMatchObject({ name: "AskRefusal", code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
    expect(picker.calls).toEqual([]);
  });

  it("refuses zero reachable makers before the envelope basis and before the picker (carry 10)", async () => {
    // A20.1 counts 0 debaters here, yet its seat demand would still ask for a writer and a checker.
    // Admission refuses first, so neither the basis nor the picker ever sees that demand.
    const panelSizes: number[] = [];
    const discoveries = { count: 0 };
    const refusal = await evaluateAskAdmission(
      settingsWith({ modelPicker: valid(), panel: [], panelSizes, discoveries }), ask("premium", "BEST")
    ).catch((failure: unknown) => failure);
    expect(refusal).toMatchObject({
      name: "AskRefusal",
      code: "ASK_MODEL_CANDIDATE_UNAVAILABLE",
      message: "No model is reachable right now for one of this debate's jobs"
    });
    expect(discoveries.count).toBe(1);
    expect(panelSizes).toEqual([]);
    expect(picker.calls).toEqual([]);
    // One reachable maker is not zero: the picker is asked for one debater.
    picker.outcome = assigned([candidate(at("development:pi-glm-cli"))]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid(), panel: [at("development:pi-glm-cli")] }), ask("premium"));
    expect(picker.calls).toHaveLength(1);
    expect(lastInput().seatDemand.POSITION).toBe(1);
  });

  it("still asks the day's money first: a reached day refuses before discovery and before the picker", async () => {
    const discoveries = { count: 0 };
    const refusal = await evaluateAskAdmission(settingsWith({
      modelPicker: valid(),
      discoveries,
      assertDailyCostEnvelope: async () => {
        throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "the day is spent");
      }
    }), ask("premium")).catch((failure: unknown) => failure);
    expect(refusal).toMatchObject({ name: "AskRefusal", code: "DAILY_COST_ENVELOPE_REACHED" });
    expect(discoveries.count).toBe(0);
    expect(picker.calls).toEqual([]);
  });

  it("treats a debater discovery never returned as an engine fault, not an ask refusal", async () => {
    picker.outcome = assigned([Object.freeze({
      candidateId: "ghost@DEFAULT_ONLY", providerRef: "development:ghost", maker: "Ghost",
      modelId: "ghost-1", thinkingLevel: "DEFAULT_ONLY"
    })]);
    const error = await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free"))
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(TypedDomainError);
    expect(error).toMatchObject({ code: "ASK_MODEL_ASSIGNMENT_INVALID" });
    expect(error).not.toMatchObject({ name: "AskRefusal" });
  });

  it("never pins an assignment the pinned-assignment schema refuses: an engine fault (pre-flight fix F19)", async () => {
    const outcome = assigned([candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))]);
    if (outcome.state !== "ASSIGNED") throw new Error("the fixture must be assigned");
    // A checker seat that carries seatIndex 1 in a one-seat role: RoleAssignmentSchema refuses it.
    picker.outcome = Object.freeze({
      ...outcome,
      assignment: Object.freeze({
        ...outcome.assignment,
        roles: Object.freeze({ ...outcome.assignment.roles, ANSWER_CHECKER: Object.freeze([{ ...outcome.assignment.roles.ANSWER_CHECKER[0]!, seatIndex: 1 }]) })
      })
    });
    const error = await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free"))
      .catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "ASK_MODEL_ASSIGNMENT_INVALID" });
    expect(error).not.toMatchObject({ name: "AskRefusal" });
  });

  it("never pins an assignment whose own strength is not the applied one: an engine fault (carry 4)", async () => {
    // Migration 0072 CHECKs strength = assignment->>'strength', but only at the pin, after the run
    // exists. Admission runs before startRun, so refusing here leaves no run without a work item.
    const outcome = assigned([candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))], "BALANCED");
    if (outcome.state !== "ASSIGNED") throw new Error("the fixture must be assigned");
    picker.outcome = Object.freeze({ ...outcome, appliedStrength: "ECONOMY" as const, steppedDown: true });
    const error = await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free", "BEST"))
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(TypedDomainError);
    expect(error).toMatchObject({ code: "ASK_MODEL_ASSIGNMENT_INVALID" });
    expect(error).not.toMatchObject({ name: "AskRefusal" });
  });
});

/** A seat candidate on a route discovery never returned: only a picker defect could seat it. */
const GHOST: SeatCandidate = Object.freeze({
  candidateId: "ghost@DEFAULT_ONLY", providerRef: "development:ghost", maker: "Ghost",
  modelId: "ghost-1", thinkingLevel: "DEFAULT_ONLY"
});

/** Expects the engine fault (a 500), never an ask refusal (a 422). */
async function expectEngineFault(admission: Promise<unknown>): Promise<void> {
  const error = await admission.then(() => "admitted", (failure: unknown) => failure);
  expect(error).toBeInstanceOf(TypedDomainError);
  expect(error).toMatchObject({ code: "ASK_MODEL_ASSIGNMENT_INVALID" });
  expect(error).not.toMatchObject({ name: "AskRefusal" });
}

describe("A20 · admission re-checks what the picker and the composition promised (carry 15, A20.2 review m1–m3)", () => {
  it("m1: refuses HOSTED picker settings without a positive safe-integer ceiling, before the basis and the picker", async () => {
    // A composition that builds the settings without askModelPickerSettings would otherwise
    // switch the picker's step-down and BUDGET_TOO_SMALL off without a word.
    picker.outcome = assigned([candidate(at("development:codex-premium-cli")), candidate(at("development:claude-premium-cli"))]);
    for (const perRunCeilingMicros of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      const panelSizes: number[] = [];
      await expectEngineFault(evaluateAskAdmission(
        settingsWith({ modelPicker: valid({ mode: "HOSTED", perRunCeilingMicros }), panelSizes }), ask("premium")
      ));
      expect(panelSizes).toEqual([]);
    }
    expect(picker.calls).toEqual([]);
    // A positive safe-integer ceiling admits, and LOCAL keeps its null ceiling.
    await expect(evaluateAskAdmission(
      settingsWith({ modelPicker: valid({ mode: "HOSTED", perRunCeilingMicros: 1 }) }), ask("premium")
    )).resolves.toHaveProperty("modelAssignment");
    await expect(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("premium")))
      .resolves.toHaveProperty("modelAssignment");
  });

  it("m2: checks every seat's main and runner-up against discovery, and POSITION against the planned debaters", async () => {
    const two = [candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))];
    // A runner-up discovery never returned (JUDGE seat 0).
    picker.outcome = withJudgeRunnerUp(assigned(two), GHOST);
    await expectEngineFault(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free")));
    // A main discovery never returned, in a role other than POSITION (REVIEWER seat 0).
    const plain = assigned(two);
    if (plain.state !== "ASSIGNED") throw new Error("the fixture must be assigned");
    picker.outcome = Object.freeze({
      ...plain,
      assignment: Object.freeze({
        ...plain.assignment,
        roles: Object.freeze({
          ...plain.assignment.roles,
          REVIEWER: Object.freeze([Object.freeze({ ...plain.assignment.roles.REVIEWER[0]!, main: GHOST }),
            plain.assignment.roles.REVIEWER[1]!])
        })
      })
    });
    await expectEngineFault(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free")));
    // More debaters than the free plan's two, all of them discovered: the estimate counted two.
    picker.outcome = assigned([...two, candidate(at("development:grok-cli"))]);
    await expectEngineFault(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free")));
    // The planned count itself is admitted.
    picker.outcome = assigned(two);
    await expect(evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("free")))
      .resolves.toHaveProperty("modelAssignment");
  });

  it("m3: refuses a ceiling minted without the backup a runner-up needs (the composition dropped the provision)", async () => {
    const two = [candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))];
    picker.outcome = withJudgeRunnerUp(assigned(two), candidate(at("development:grok-cli")));
    const backups: (0 | 1)[] = [];
    await expectEngineFault(evaluateAskAdmission(
      settingsWith({ modelPicker: valid(), backups, dropsBackupProvision: true }), ask("free")
    ));
    // Admission did ask for the backup; the composition minted DR-184-v4 anyway.
    expect(backups).toEqual([0, 1]);
    // Without a runner-up DR-184-v4 is the right ceiling, so the same composition still admits.
    picker.outcome = assigned(two);
    await expect(evaluateAskAdmission(
      settingsWith({ modelPicker: valid(), dropsBackupProvision: true }), ask("free")
    )).resolves.toMatchObject({ envelopeBasis: { formula_version: "DR-184-v4" } });
  });
});

describe("A20 · hardening before the picker goes live (carry 16, A20.3 review m2–m3)", () => {
  it("m2: writes no note and no 'assigned' line for an assignment a later check refuses", async () => {
    const two = [candidate(at("development:codex-cli")), candidate(at("development:claude-cli"))];
    for (const [outcome, dropsBackupProvision] of [
      // The carry-15 m2 fault: a runner-up discovery never returned.
      [withJudgeRunnerUp(assigned(two), GHOST), false],
      // The carry-15 m3 fault: a v4 ceiling for a run with a runner-up.
      [withJudgeRunnerUp(assigned(two), candidate(at("development:grok-cli"))), true]
    ] as const) {
      picker.outcome = outcome;
      const lines: string[] = [];
      await expectEngineFault(evaluateAskAdmission(settingsWith({
        modelPicker: valid({ log: (line) => lines.push(line) }), dropsBackupProvision
      }), ask("free")));
      expect(lines.filter((line) => /^MODEL_PICKER (?:assigned|note) /u.test(line))).toEqual([]);
    }
    // An assignment admission keeps still logs its notes, then 'assigned', last.
    picker.outcome = assigned(two);
    const lines: string[] = [];
    await evaluateAskAdmission(settingsWith({ modelPicker: valid({ log: (line) => lines.push(line) }) }), ask("free"));
    expect(lines).toContain("MODEL_PICKER note REVIEWER: no scorecard entry reachable; discovery order used");
    expect(lines.at(-1)).toMatch(/^MODEL_PICKER assigned strength=BALANCED stepped_down=false /u);
  });

  it("m3: refuses HOSTED picker settings without a usable ceiling BEFORE discovery, so no paid probe round runs", async () => {
    for (const perRunCeilingMicros of [null, 0, 1.5]) {
      const discoveries = { count: 0 };
      await expectEngineFault(evaluateAskAdmission(
        settingsWith({ modelPicker: valid({ mode: "HOSTED", perRunCeilingMicros }), discoveries }), ask("premium")
      ));
      expect(discoveries.count).toBe(0);
    }
    expect(picker.calls).toEqual([]);
    // No VALID scorecard, no picker: the roster path is unchanged and still discovers.
    const discoveries = { count: 0 };
    const roster = await evaluateAskAdmission(settingsWith({
      modelPicker: valid({ mode: "HOSTED", perRunCeilingMicros: null, scorecard: Object.freeze({ state: "ABSENT" as const }) }),
      discoveries
    }), ask("free"));
    expect(discoveries.count).toBe(1);
    expect("modelAssignment" in roster).toBe(false);
  });
});

describe("A20b · the premium roster names the grok id the CLI answers as", () => {
  it("admits a premium ask on the roster path with grok-4.7-build, in roster order", async () => {
    const result = await evaluateAskAdmission(settingsWith({}), ask("premium"));
    expect(result.discoveredPanel.map((entry) => entry.model_id))
      .toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]);
  });

  it("with a VALID scorecard grok-4.7-build still reaches the picker, now as a roster member", async () => {
    picker.outcome = assigned([
      candidate(at("development:grok-cli")),
      candidate(at("development:claude-premium-cli")),
      candidate(at("development:codex-premium-cli"))
    ]);
    await evaluateAskAdmission(settingsWith({ modelPicker: valid() }), ask("premium"));
    expect(lastInput().reachable.slice(0, 3).map((target) => target.modelId))
      .toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]);
  });
});
