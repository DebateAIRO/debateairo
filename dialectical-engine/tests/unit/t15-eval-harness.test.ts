import { describe, expect, test } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  EVAL_HARNESS_MATRIX,
  EVAL_HARNESS_SPEND,
  GRADER_REQUEST_KEYS,
  assignBlindGraders,
  buildGraderRequest,
  deriveCandidateConfigs,
  projectCallCount,
  renderComparisonTable,
  renderProjection,
  resolveRoundCap,
  runEvalHarness,
  type CandidateRoleConfig,
  type EvalHarnessDependencies,
  type RecordedDebate
} from "../../acceptance/eval-harness.js";

/**
 * T15 (goal 309-320). The matrix is FIXED BY THE GOAL: 5 recorded debates x 3
 * candidate role configs x <=2 evaluator rounds, graded blind by 2 graders that
 * are never the candidate. Every number below is that text, not a preference.
 *
 * MEASURED BEFORE WRITING (worker contract 3): the acceptance deployment seals
 * exactly THREE provider identities today (acceptance/README.md; GROK-01
 * DR-177). A candidate config consumes two of them, so a three-identity
 * deployment cannot supply two graders that are neither of the candidate's
 * refs. That is not a test convenience — it is the harness's loud refusal, and
 * it is pinned against the REAL three below. The satisfiable arm needs a fourth
 * identity, which no deployment seals today, so it appears only as a fixture.
 */

/** The three identities the acceptance deployment actually seals. */
const ACCEPTANCE_SEALED_REFS = Object.freeze([
  "acceptance:codex-cli",
  "acceptance:claude-cli",
  "acceptance:grok-cli"
]);

/** A four-identity deployment: the smallest set the goal's matrix can run on. */
const FOUR_IDENTITY_REFS = Object.freeze([...ACCEPTANCE_SEALED_REFS, "acceptance:fourth-cli"]);

const SEALED_CONTROLS = Object.freeze({
  registerVersion: 7,
  synthesizerRoleRef: "acceptance:codex-cli",
  evaluatorRoleRef: "acceptance:claude-cli",
  evaluatorLoopMaxRounds: 3
});

function recordedDebates(count: number): readonly RecordedDebate[] {
  return Object.freeze(Array.from({ length: count }, (_unused, index) => Object.freeze({
    runId: `run-${String(index + 1)}`,
    answerId: `answer-${String(index + 1)}`,
    sealedAtSeq: String(index + 1)
  })));
}

/**
 * Every refusal in this harness is a TypedDomainError whose CODE is the
 * contract; the message is prose and may be reworded. `toThrowError(/CODE/)`
 * matches the MESSAGE, so it would silently pass on any error whose prose
 * happened to contain the token and fail on the real refusal — which is what it
 * did on the first GREEN attempt. Assert the code itself.
 */
function expectRefusalCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(TypedDomainError);
    expect((error as TypedDomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected a TypedDomainError with code ${code}, but nothing was thrown`);
}

/**
 * Every provider-touching dependency records its invocation into `calls`. The
 * spend gate's whole claim is that this array stays EMPTY without approval, so
 * the test asserts the exact empty array rather than a count comparison that
 * any possible state would satisfy (D27 ADDENDUM).
 */
function spyingDependencies(overrides: Partial<EvalHarnessDependencies> = {}): {
  readonly dependencies: EvalHarnessDependencies;
  readonly calls: string[];
  readonly emitted: string[];
} {
  const calls: string[] = [];
  const emitted: string[] = [];
  const dependencies: EvalHarnessDependencies = {
    emit: (line) => { emitted.push(line); },
    readSynthesisRoleControls: async () => SEALED_CONTROLS,
    readConfiguredProviderRefs: async () => FOUR_IDENTITY_REFS,
    readRecordedDebates: async () => recordedDebates(EVAL_HARNESS_MATRIX.recordedDebateCount),
    resolveSynthesisSurface: () => ({
      synthesize: async (request) => {
        calls.push(`SYNTHESIZER:${request.roleRef}`);
        return { statement: "candidate statement" };
      },
      evaluate: async (request) => {
        calls.push(`EVALUATOR:${request.roleRef}`);
        return { satisfied: true, objection: null };
      }
    }),
    grade: async (request) => {
      calls.push(`GRADER:${request.graderRoleRef}`);
      return { score: 1, notes: "" };
    },
    ...overrides
  };
  return { dependencies, calls, emitted };
}

describe("T15 · the goal's exact matrix and its projected call count", () => {
  test("the matrix constants are the goal's own numbers", () => {
    expect(EVAL_HARNESS_MATRIX.recordedDebateCount).toBe(5);
    expect(EVAL_HARNESS_MATRIX.candidateConfigCount).toBe(3);
    expect(EVAL_HARNESS_MATRIX.evaluatorRoundCap).toBe(2);
    expect(EVAL_HARNESS_MATRIX.gradersPerCell).toBe(2);
  });

  test("the projection is the exact arithmetic of the matrix, nominal and worst case", () => {
    const projection = projectCallCount({
      recordedDebateCount: 5,
      candidateConfigCount: 3,
      evaluatorRoundCap: 2,
      gradersPerCell: 2,
      maxAttemptsPerCall: 2,
      tokenCeilingPerCall: 2_048
    });
    expect(projection.synthesizerCalls).toBe(30);
    expect(projection.evaluatorCalls).toBe(30);
    expect(projection.graderCalls).toBe(30);
    expect(projection.nominalCalls).toBe(90);
    expect(projection.worstCaseCalls).toBe(180);
    expect(projection.worstCaseTokenCeiling).toBe(368_640);
  });

  test("the harness config states the per-call attempts and token ceiling the goal demands", () => {
    expect(EVAL_HARNESS_SPEND.maxAttemptsPerCall).toBe(2);
    expect(EVAL_HARNESS_SPEND.tokenCeilingPerCall).toBe(2_048);
  });

  test("the evaluator round cap is the SEALED bound floored by the goal's <=2", () => {
    expect(resolveRoundCap(3)).toBe(2);
    expect(resolveRoundCap(2)).toBe(2);
    expect(resolveRoundCap(1)).toBe(1);
  });

  test("the rendered projection names the matrix, the attempts and the token ceiling", () => {
    const lines = renderProjection(projectCallCount({
      recordedDebateCount: 5,
      candidateConfigCount: 3,
      evaluatorRoundCap: 2,
      gradersPerCell: 2,
      maxAttemptsPerCall: 2,
      tokenCeilingPerCall: 2_048
    }));
    expect(lines).toContain("matrix: 5 recorded debates x 3 candidate role configs x <=2 evaluator rounds");
    expect(lines).toContain("blind graders per cell: 2 (never the candidate)");
    expect(lines).toContain("per-call max attempts: 2");
    expect(lines).toContain("per-call token ceiling: 2048");
    expect(lines).toContain("projected provider calls (nominal): 90");
    expect(lines).toContain("projected provider calls (worst case): 180");
    expect(lines).toContain("projected token ceiling (worst case): 368640");
  });
});

describe("T15 · the spend gate (DoD: projected-count output test)", () => {
  test("without approval it prints the projection and makes ZERO provider calls", async () => {
    const { dependencies, calls, emitted } = spyingDependencies();
    const outcome = await runEvalHarness({ approved: false }, dependencies);

    expect(outcome.decision).toBe("REFUSED_AWAITING_APPROVAL");
    expect(outcome.refusalCode).toBe("EVAL_HARNESS_NOT_APPROVED");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
    expect(emitted).toContain("projected provider calls (nominal): 90");
    expect(emitted).toContain("projected provider calls (worst case): 180");
  });

  test("the projection is printed BEFORE the refusal, never after it", async () => {
    const { dependencies, emitted } = spyingDependencies();
    await runEvalHarness({ approved: false }, dependencies);
    const projectionIndex = emitted.findIndex((line) => line.startsWith("projected provider calls (worst case):"));
    const refusalIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    expect(projectionIndex).toBe(6);
    expect(refusalIndex).toBe(8);
  });

  test("WITH explicit approval it does not refuse — the gate is a gate, not a wall", async () => {
    const { dependencies } = spyingDependencies();
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("PROCEEDED");
    expect(outcome.refusalCode).toBe(null);
  });

  test("the approval gate is the LAST thing before the first call: every check that can refuse runs first", async () => {
    const { dependencies, calls } = spyingDependencies({
      readRecordedDebates: async () => recordedDebates(4)
    });
    const outcome = await runEvalHarness({ approved: false }, dependencies);
    expect(outcome.refusalCode).toBe("EVAL_RECORDED_DEBATES_INSUFFICIENT");
    expect(calls).toEqual([]);
  });
});

describe("T15 · blind grading by graders that are never the candidate", () => {
  const candidate: CandidateRoleConfig = Object.freeze({
    configId: "C1",
    synthesizerRoleRef: "acceptance:codex-cli",
    evaluatorRoleRef: "acceptance:claude-cli",
    baseline: true
  });

  test("exactly two graders, and neither is either of the candidate's role refs", () => {
    const graders = assignBlindGraders({ candidate, graderPoolRefs: FOUR_IDENTITY_REFS, gradersPerCell: 2 });
    expect(graders).toEqual(["acceptance:fourth-cli", "acceptance:grok-cli"]);
    expect(graders).not.toContain(candidate.synthesizerRoleRef);
    expect(graders).not.toContain(candidate.evaluatorRoleRef);
  });

  test("the REAL three-identity acceptance deployment cannot supply two, and says so loudly", () => {
    expectRefusalCode(() => assignBlindGraders({
      candidate,
      graderPoolRefs: ACCEPTANCE_SEALED_REFS,
      gradersPerCell: 2
    }), "EVAL_BLIND_GRADER_POOL_INSUFFICIENT");
  });

  test("the grader request is BLIND: its key set carries no config or author identity", () => {
    const request = buildGraderRequest({
      graderRoleRef: "acceptance:grok-cli",
      debateRef: "run-1",
      candidateStatement: "the statement under grading",
      criteriaKeys: ["fairnessToLosers", "noOverstatement"]
    });
    expect(Object.keys(request).sort()).toEqual([...GRADER_REQUEST_KEYS].sort());
    expect(JSON.stringify(request)).not.toContain("C1");
    expect(JSON.stringify(request)).not.toContain(candidate.synthesizerRoleRef);
    expect(JSON.stringify(request)).not.toContain(candidate.evaluatorRoleRef);
  });
});

describe("T15 · the harness reads sealed identities and refuses loudly when reality is short", () => {
  test("candidate configs derive from the SEALED provider identities, baseline first", () => {
    const configs = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    });
    expect(configs).toHaveLength(3);
    expect(configs[0]?.baseline).toBe(true);
    expect(configs[0]?.synthesizerRoleRef).toBe(SEALED_CONTROLS.synthesizerRoleRef);
    expect(configs[0]?.evaluatorRoleRef).toBe(SEALED_CONTROLS.evaluatorRoleRef);
    expect(configs.filter((config) => config.baseline)).toHaveLength(1);
    for (const config of configs) {
      expect(FOUR_IDENTITY_REFS).toContain(config.synthesizerRoleRef);
      expect(FOUR_IDENTITY_REFS).toContain(config.evaluatorRoleRef);
      expect(config.synthesizerRoleRef).not.toBe(config.evaluatorRoleRef);
    }
    expect(configs.map((config) => config.configId)).toEqual(["C1", "C2", "C3"]);
  });

  test("too few sealed identities to build three distinct configs refuses loudly", () => {
    expectRefusalCode(() => deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ["acceptance:codex-cli", "acceptance:claude-cli"],
      candidateConfigCount: 3
    }), "EVAL_CANDIDATE_CONFIGS_INSUFFICIENT");
  });

  test("a sealed role ref outside the configured provider set refuses loudly (J24: identity, never substitution)", () => {
    expectRefusalCode(() => deriveCandidateConfigs({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "acceptance:not-configured" },
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    }), "EVAL_ROLE_REF_NOT_CONFIGURED");
  });

  test("fewer recorded debates than the matrix demands refuses loudly and spends nothing", async () => {
    const { dependencies, calls } = spyingDependencies({
      readRecordedDebates: async () => recordedDebates(4)
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("REFUSED_MATRIX_UNSATISFIABLE");
    expect(outcome.refusalCode).toBe("EVAL_RECORDED_DEBATES_INSUFFICIENT");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
  });

  test("the real three-identity deployment refuses the whole run, spending nothing", async () => {
    const { dependencies, calls } = spyingDependencies({
      readConfiguredProviderRefs: async () => ACCEPTANCE_SEALED_REFS
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("REFUSED_MATRIX_UNSATISFIABLE");
    expect(outcome.refusalCode).toBe("EVAL_BLIND_GRADER_POOL_INSUFFICIENT");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
  });

  test("an absent T9 synthesis surface refuses loudly instead of grading nothing", async () => {
    const { dependencies, calls } = spyingDependencies({ resolveSynthesisSurface: () => null });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("REFUSED_MATRIX_UNSATISFIABLE");
    expect(outcome.refusalCode).toBe("EVAL_SYNTHESIS_SURFACE_UNAVAILABLE");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
  });
});

describe("T15b · the comparison table that routes to V", () => {
  test("one row per candidate config, and an ungraded cell says so instead of showing a number", () => {
    const configs = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    });
    const table = renderComparisonTable({ configs, cells: [] });
    const rows = table.filter((line) => line.startsWith("| C"));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toContain("UNGRADED");
    expect(table).toContain("UNGRADED: no V-approved run has produced a grade for this cell");
  });

  test("a graded cell shows its mean and the count it was computed from", () => {
    const configs = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    });
    const table = renderComparisonTable({
      configs,
      cells: [
        { configId: "C1", debateRef: "run-1", graderRoleRef: "acceptance:grok-cli", score: 4 },
        { configId: "C1", debateRef: "run-1", graderRoleRef: "acceptance:fourth-cli", score: 2 }
      ]
    });
    const c1 = table.find((line) => line.startsWith("| C1 "));
    expect(c1).toContain("3.00");
    expect(c1).toContain("2 grades");
    expect(table.find((line) => line.startsWith("| C2 "))).toContain("UNGRADED");
  });
});
