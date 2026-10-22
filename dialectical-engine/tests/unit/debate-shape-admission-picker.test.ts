/**
 * Debate shape Phase 2a, Task 8: admission WITH a model scorecard (the picker is a recorded double, as in
 * tests/unit/model-picker-admission.test.ts).
 *
 *  - note 3: a shaped run with a runner-up mints a shape receipt that provisions the backup; it is admitted, never
 *    refused for not being DR-184-v5 (the check reads `structuralBasisProvisionsBackup`);
 *  - note 4: the picker's window check reads the run's own bounds — the answer writer's answer length and, for the
 *    debaters, the map's merge and choose bounds;
 *  - the plan key it is handed sizes the shape; the seated debaters' makers cap it;
 *  - a shaped receipt the strict reader refuses is an engine fault (a 500 at the boundary), never an ask refusal
 *    whose message would reach the caller (I6).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PickerInput, PickerOutcome, RoleAssignment, RoleSeat, Scorecard, SeatCandidate } from "@debateai/scorecard";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const picker = vi.hoisted(() => ({ calls: [] as unknown[], outcome: null as unknown }));

vi.mock("@debateai/scorecard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/scorecard")>()),
  pickRoleAssignment: (input: unknown) => {
    picker.calls.push(input);
    return picker.outcome;
  }
}));

import { AskRefusal, evaluateAskAdmission, type AskModelPickerSettings, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues,
  type EngineSettings
} from "@debateai/register";
import { normaliseAskForDebateShape } from "../../apps/api/src/debate-shape-ask.js";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const POLICY = debateShapePolicyStartValues();
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-13T00:00:00.000Z" });
const PANEL: readonly DiscoveredPanelMember[] = Object.freeze([
  member("development:codex-cli", "OpenAI", "gpt-5.6-luna"),
  member("development:claude-cli", "Anthropic", "claude-sonnet-5"),
  member("development:grok-cli", "xAI", "grok-4.7-build")
]);
const ASK: AskRequest = { question_line: "Which models should debate this?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1, answerLength: "detailed" },
  decision_scope: "shape picker test", as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };
const SEALED = Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
  ANSWER_WRITER: 4096, ANSWER_CHECKER: 1024 });

function settings(input: Readonly<{ policy: boolean; shapes?: unknown[]; dropsBackup?: boolean;
  mangle?: (basis: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>> }>): RunCreationSettings {
  const modelPicker: AskModelPickerSettings = {
    scorecard: Object.freeze({ state: "VALID" as const, scorecard: Object.freeze({ scorecardVersion: 7 }) as unknown as Scorecard,
      sourceRef: "test:shape-scorecard" }),
    mode: "LOCAL", targetFacts: new Map(), perRunCeilingMicros: null, answerTokenCeilings: SEALED
  };
  return {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "battery:shape", settlementWatchHandle: "watch:shape",
    resolveDiscoveredPanel: async () => PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => {
      input.shapes?.push(shape);
      const basis = computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth),
        ...(input.dropsBackup === true ? {} : { backupSequencesProvisioned }), ...(shape === null ? {} : { shape }) });
      return input.mangle === undefined ? basis : input.mangle(basis);
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    modelPicker,
    ...(input.policy ? { debateShapePolicy: POLICY } : {})
  };
}

const candidate = (source: DiscoveredPanelMember): SeatCandidate => Object.freeze({
  candidateId: `${source.model_id}@DEFAULT_ONLY`, providerRef: source.provider_ref, maker: source.maker, modelId: source.model_id,
  thinkingLevel: "DEFAULT_ONLY" });
const seat = (seatIndex: number, main: SeatCandidate, runnerUp: SeatCandidate | null = null): RoleSeat =>
  Object.freeze({ seatIndex, main, runnerUp, diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD" as const });

function assigned(debaters: readonly SeatCandidate[], judgeRunnerUp: SeatCandidate | null = null): PickerOutcome {
  const seats = Object.freeze(debaters.map((main, index) => seat(index, main)));
  const judges = Object.freeze(debaters.map((main, index) => seat(index, main, index === 0 ? judgeRunnerUp : null)));
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: 7, strength: "BALANCED",
    roles: Object.freeze({ POSITION: seats, SUPPORT_ATTACK: seats, CROSS_EXCHANGE: seats, JUDGE: judges, REVIEWER: seats,
      ANSWER_WRITER: Object.freeze([seat(0, debaters[0]!)]), ANSWER_CHECKER: Object.freeze([seat(0, debaters.at(-1)!)]) })
  });
  return Object.freeze({ state: "ASSIGNED" as const, assignment, appliedStrength: "BALANCED", steppedDown: false,
    estimate: Object.freeze({ mode: "LOCAL" as const, moneyMicros: null, seconds: 900 }), notes: Object.freeze([]) });
}

const TWO = [candidate(PANEL[0]!), candidate(PANEL[1]!)];
const shaped = normaliseAskForDebateShape(ASK, POLICY, "free");

beforeEach(() => {
  picker.calls.length = 0;
  picker.outcome = null;
});

describe("a shaped run with a runner-up is admitted (note 3)", () => {
  it("mints the shape receipt with its backup, and the backup check reads the receipt, not the DR-184-v5 name", async () => {
    picker.outcome = assigned(TWO, candidate(PANEL[2]!));
    const admitted = await evaluateAskAdmission(settings({ policy: true }), shaped);
    expect(admitted.envelopeBasis).toMatchObject({ formula_version: "DR-185-shape-v1", panel_size: 2,
      shape: { plan: "free", answers: 2, backup_sequences: 1 } });
    expect(admitted.modelAssignment?.assignment.roles.JUDGE[0]?.runnerUp).not.toBeNull();
  });

  it("still refuses a shaped ceiling minted without the backup a runner-up needs", async () => {
    picker.outcome = assigned(TWO, candidate(PANEL[2]!));
    await expect(evaluateAskAdmission(settings({ policy: true, dropsBackup: true }), shaped))
      .rejects.toThrow("The attempt ceiling was minted without the backup sequence a runner-up needs");
  });
});

describe("the picker's window check reads the run's own bounds (note 4)", () => {
  it("with the row: the writer's answer length and the map's merge and choose bounds; the other roles keep the sealed ones", async () => {
    picker.outcome = assigned(TWO);
    await evaluateAskAdmission(settings({ policy: true }), shaped);
    const input = picker.calls.at(-1) as PickerInput;
    expect(input.answerTokenCeilingByRole).toEqual({ ...SEALED, POSITION: 32_768, ANSWER_WRITER: 16_384 });
  });

  it("without the row the picker gets the sealed table itself, byte for byte", async () => {
    picker.outcome = assigned(TWO);
    await evaluateAskAdmission(settings({ policy: false }), ASK);
    expect((picker.calls.at(-1) as PickerInput).answerTokenCeilingByRole).toBe(SEALED);
  });
});

describe("the plan key and the seated makers size the shape", () => {
  it("the plan key submit hands admission reaches the composition; the seated debaters' makers cap the sizes", async () => {
    picker.outcome = assigned(TWO);
    const shapes: unknown[] = [];
    const plusAsk = normaliseAskForDebateShape({ ...ASK, plan_tier: "premium" as const }, POLICY, "plus");
    const admitted = await evaluateAskAdmission(settings({ policy: true, shapes }), plusAsk, null, undefined, "plus");
    expect(shapes.every((shape) => (shape as { plan: string }).plan === "plus")).toBe(true);
    // The final basis is always minted for the seated debaters (two makers): two answers, one grader.
    expect(admitted.envelopeBasis.shape).toMatchObject({ plan: "plus", answers: 2, map_ais: 2, graders: 1 });
  });
});

describe("a shaped receipt the strict reader refuses never reaches the caller as an ask refusal (note 5)", () => {
  it("is an engine fault: not an AskRefusal, so the boundary answers 500 INTERNAL_ERROR and logs the reason", async () => {
    picker.outcome = assigned(TWO);
    const wrongReserve = (basis: Readonly<Record<string, unknown>>) => ({ ...basis,
      serve_reserve_attempts: Number(basis.serve_reserve_attempts) + 1 });
    const failure = await evaluateAskAdmission(settings({ policy: true, mangle: wrongReserve }), shaped).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "ASK_MODEL_ASSIGNMENT_INVALID" });
    expect(failure).not.toBeInstanceOf(AskRefusal);
  });
});

// Engine redesign R1d, Task 6 review 1 (final wave B4): on the picker path the comparing judges are counted from the
// SEATED debaters' makers, not the planned ones: min(judges.count, seated makers).
describe("engine 2 on the picker path: the seated makers size the comparing judges", () => {
  it("three makers planned, two seated: the planned basis has 3 comparing judges, the admitted receipt 2", async () => {
    picker.outcome = assigned(TWO);
    const lengthPolicy = lengthGuidancePolicyStartValues();
    const engines: (EngineSettings | null)[] = [];
    const base = settings({ policy: false });
    const engineSettings: RunCreationSettings = {
      ...base,
      lengthGuidancePolicy: lengthPolicy,
      engineVersionPolicy: engineVersionPolicyStartValues(),
      resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, length, engine }) => {
        engines.push(engine);
        return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned,
          ...(length === null ? {} : { length }), ...(engine === null ? {} : { engine }) });
      }
    };
    // The premium roster seats three debaters from the panel's three makers; the picker seats two of them.
    const premiumAsk = normaliseAskForDebateShape({ ...ASK, plan_tier: "premium" as const }, null, "premium", lengthPolicy);
    const admitted = await evaluateAskAdmission(engineSettings, premiumAsk);
    expect(engines.map((engine) => engine?.sites.comparingJudges)).toEqual([3, 2]);
    expect((admitted.envelopeBasis.engine as { sites: { comparing_judges: number } }).sites.comparing_judges).toBe(2);
    expect(admitted.envelopeBasis.panel_size).toBe(2);
  });
});
