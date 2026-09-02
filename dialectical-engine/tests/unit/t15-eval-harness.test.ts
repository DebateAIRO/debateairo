import { describe, expect, test } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  EVAL_HARNESS_MATRIX,
  EVAL_HARNESS_SPEND,
  GRADER_REQUEST_KEYS,
  BLIND_GRADING_DEGRADED_MARK,
  GRADER_IS_CANDIDATE_EVALUATOR_MARK,
  GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
  GRADER_REPEATS_IDENTITY_MARK,
  GRADER_SET_VARIES_BY_CONFIG_MARK,
  GRADER_SHARES_CANDIDATE_FAMILY_MARK,
  assignBlindGraders,
  buildGraderRequest,
  deriveCandidateConfigs,
  projectCallCount,
  renderComparisonTable,
  renderProjection,
  resolveRoundCap,
  runEvalHarness,
  summariseGradingProvenance,
  type CandidateRoleConfig,
  type ConfiguredProviderIdentity,
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

/**
 * The three identities the acceptance deployment actually seals, with the maker
 * each one belongs to — both read off the same sealed configuredProviderSet row
 * (acceptance/seed-register.ts, anchor proven unique in the citation record).
 */
const ACCEPTANCE_SEALED: readonly ConfiguredProviderIdentity[] = Object.freeze([
  Object.freeze({ providerRef: "acceptance:codex-cli", maker: "OpenAI" }),
  Object.freeze({ providerRef: "acceptance:claude-cli", maker: "Anthropic" }),
  Object.freeze({ providerRef: "acceptance:grok-cli", maker: "xAI" })
]);
const ACCEPTANCE_SEALED_REFS = Object.freeze(ACCEPTANCE_SEALED.map((identity) => identity.providerRef));

/** A four-identity deployment: the smallest set that seats two INDEPENDENT graders. */
const FOUR_IDENTITY: readonly ConfiguredProviderIdentity[] = Object.freeze([
  ...ACCEPTANCE_SEALED,
  Object.freeze({ providerRef: "acceptance:fourth-cli", maker: "Mistral" })
]);
const FOUR_IDENTITY_REFS = Object.freeze(FOUR_IDENTITY.map((identity) => identity.providerRef));

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
    readConfiguredProviders: async () => FOUR_IDENTITY,
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
    // V-S11-1 removed the unconditional promise: a grader MAY be a candidate identity on a
    // short deployment, so the projection may not claim otherwise.
    expect(lines).toContain(
      "blind graders per cell: 2 (independent of the candidate where the deployment allows; "
      + "any shortfall is disclosed below)"
    );
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
    // 8 is the GRADER-SET-VARIES-BY-CONFIG disclosure: even on four identities C3 draws a
    // different independent pair than C1/C2, so the arms are not graded by one panel.
    expect(refusalIndex).toBe(9);
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

describe("T15 · blind grading DEGRADES WITH DISCLOSURE, it never hard-refuses (V-S11-1)", () => {
  const candidate: CandidateRoleConfig = Object.freeze({
    configId: "C1",
    synthesizerRoleRef: "acceptance:codex-cli",
    evaluatorRoleRef: "acceptance:claude-cli",
    baseline: true
  });

  test("with enough identities: two INDEPENDENT seats, nothing degraded, no mark", () => {
    const assignment = assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:fourth-cli", relation: "INDEPENDENT", repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:grok-cli", relation: "INDEPENDENT", repeatOfEarlierSeat: false }
    ]);
    expect(assignment.degraded).toBe(false);
    expect(assignment.marks).toEqual([]);
    expect(assignment.sameModelAsCandidate).toBe(false);
    expect(assignment.sameFamilyAsCandidate).toBe(false);
  });

  test("the REAL three-identity deployment RUNS on a repeated independent grader and discloses it", () => {
    const assignment = assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 });
    // V-S11-1: "graded by another AI" is preserved for BOTH seats by repeating the one
    // independent identity, rather than seating a member of the candidate config.
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:grok-cli", relation: "INDEPENDENT", repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:grok-cli", relation: "INDEPENDENT", repeatOfEarlierSeat: true }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.marks).toEqual([BLIND_GRADING_DEGRADED_MARK, GRADER_REPEATS_IDENTITY_MARK]);
    expect(assignment.sameModelAsCandidate).toBe(false);
    expect(assignment.sameFamilyAsCandidate).toBe(false);
    expect(assignment.disclosure).toBe(
      "C1: 2 grader seats filled from 1 distinct identity that is not the candidate's; "
      + "the two grades are fresh instances of the same model and are not independent of each other"
    );
  });

  test("ONE model available: the candidate's own identities grade it, evaluator seated before author", () => {
    // V-S11-1 verbatim in intent: "if only one model is available the whole debate runs on one
    // model; that is a legitimate configuration, not a failure state."
    const assignment = assignBlindGraders({
      candidate,
      graderPool: ACCEPTANCE_SEALED.filter((identity) => identity.providerRef !== "acceptance:grok-cli"),
      gradersPerCell: 2
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:claude-cli", relation: "CANDIDATE_EVALUATOR", repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:codex-cli", relation: "CANDIDATE_SYNTHESIZER", repeatOfEarlierSeat: false }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.marks).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      GRADER_IS_CANDIDATE_EVALUATOR_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.sameModelAsCandidate).toBe(true);
    expect(assignment.sameFamilyAsCandidate).toBe(true);
  });

  test("a grader sharing the candidate's MAKER but not its identity is disclosed as same-family", () => {
    const twoOpenAi: readonly ConfiguredProviderIdentity[] = Object.freeze([
      Object.freeze({ providerRef: "acceptance:codex-cli", maker: "OpenAI" }),
      Object.freeze({ providerRef: "acceptance:claude-cli", maker: "Anthropic" }),
      Object.freeze({ providerRef: "acceptance:codex-two", maker: "OpenAI" })
    ]);
    const assignment = assignBlindGraders({ candidate, graderPool: twoOpenAi, gradersPerCell: 2 });
    expect(assignment.seats.map((seat) => seat.graderRoleRef)).toEqual([
      "acceptance:codex-two",
      "acceptance:codex-two"
    ]);
    expect(assignment.sameModelAsCandidate).toBe(false);
    expect(assignment.sameFamilyAsCandidate).toBe(true);
    expect(assignment.marks).toContain(GRADER_SHARES_CANDIDATE_FAMILY_MARK);
  });

  test("EXACTLY ONE identity available: it grades its own statement, and every seat is disclosed", () => {
    // This is V-S11-1's headline case, verbatim in intent: "if only one model is available, the
    // whole debate runs on that one model; that is a legitimate configuration, not a failure
    // state." Mutant m10 survived the first r2 campaign precisely because nothing pinned the
    // boundary at one identity — the centre of the ruling was unasserted.
    const assignment = assignBlindGraders({
      candidate,
      graderPool: [{ providerRef: "acceptance:codex-cli", maker: "OpenAI" }],
      gradersPerCell: 2
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:codex-cli", relation: "CANDIDATE_SYNTHESIZER", repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:codex-cli", relation: "CANDIDATE_SYNTHESIZER", repeatOfEarlierSeat: true }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.sameModelAsCandidate).toBe(true);
    expect(assignment.sameFamilyAsCandidate).toBe(true);
    expect(assignment.marks).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      GRADER_REPEATS_IDENTITY_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.disclosure).toBe(
      "C1: the candidate's own identities grade it — acceptance:codex-cli as CANDIDATE_SYNTHESIZER, "
      + "acceptance:codex-cli as CANDIDATE_SYNTHESIZER; each seat is a fresh instance under its own "
      + "grading prompt, and the grade is not independent of the configuration it scores"
    );
  });

  test("an EMPTY pool is an absence, not a degradation, and still refuses loudly", () => {
    expectRefusalCode(
      () => assignBlindGraders({ candidate, graderPool: [], gradersPerCell: 2 }),
      "EVAL_BLIND_GRADER_POOL_EMPTY"
    );
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

describe("T15 · run-level grading provenance", () => {
  test("configs that draw DIFFERENT grader sets confound the comparison, and that is disclosed", () => {
    // Measured, not assumed: on the sealed three, C1/C2 leave grok independent while C3
    // leaves codex, so the three arms are not graded by the same panel.
    const configs = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const assignments = configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.graderSetsByConfig).toEqual({
      C1: ["acceptance:grok-cli", "acceptance:grok-cli"],
      C2: ["acceptance:grok-cli", "acceptance:grok-cli"],
      C3: ["acceptance:codex-cli", "acceptance:codex-cli"]
    });
    expect(summary.marks).toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
    expect(summary.anyDegraded).toBe(true);
  });

  test("one shared, fully independent panel across every config raises no run-level mark", () => {
    const configs = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 1
    });
    const assignments = configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.marks).toEqual([]);
    expect(summary.anyDegraded).toBe(false);
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

  test("the real three-identity deployment RUNS, and emits the degradation marks BEFORE the gate", async () => {
    // V-S11-1: a short grader pool is a degradation to disclose, never a stop. The marks are
    // emitted during the FREE preflight, so V reads what was compromised alongside the count
    // it is being asked to approve — a disclosure that arrives after approval discloses nothing.
    const { dependencies, calls, emitted } = spyingDependencies({
      readConfiguredProviders: async () => ACCEPTANCE_SEALED
    });
    const unapproved = await runEvalHarness({ approved: false }, dependencies);
    expect(unapproved.decision).toBe("REFUSED_AWAITING_APPROVAL");
    expect(calls).toEqual([]);
    const markIndex = emitted.findIndex((line) => line.includes(BLIND_GRADING_DEGRADED_MARK));
    const gateIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    expect(markIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(markIndex);
    expect(emitted).toContain(
      `CONDITION MARK ${BLIND_GRADING_DEGRADED_MARK} · C1: 2 grader seats filled from 1 distinct `
      + "identity that is not the candidate's; the two grades are fresh instances of the same "
      + "model and are not independent of each other"
    );
    expect(unapproved.gradingProvenance.marks).toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
  });

  test("approved, the three-identity deployment grades every cell rather than refusing", async () => {
    const { dependencies, calls } = spyingDependencies({
      readConfiguredProviders: async () => ACCEPTANCE_SEALED
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("PROCEEDED");
    expect(outcome.refusalCode).toBe(null);
    // 5 debates x 3 configs x (1 synthesizer + 1 evaluator + 2 graders); the doubles satisfy
    // the evaluator on round 1, so each cell spends one round.
    expect(outcome.providerCallsMade).toBe(60);
    expect(calls.filter((call) => call.startsWith("GRADER:"))).toHaveLength(30);
    expect(outcome.cells).toHaveLength(30);
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
  const configs = deriveCandidateConfigs({
    sealed: SEALED_CONTROLS,
    configuredProviderRefs: FOUR_IDENTITY_REFS,
    candidateConfigCount: 3
  });
  const assignments = configs.map((candidate) =>
    assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 }));

  test("one row per candidate config, and an ungraded cell says so instead of showing a number", () => {
    const table = renderComparisonTable({ configs, assignments, cells: [] });
    const rows = table.filter((line) => line.startsWith("| C"));
    // Mutant m8 survived a `toContain("UNGRADED")` row check: the GRADES column still said
    // UNGRADED while the SCORE column rendered NaN, and "somewhere in this row is the word
    // UNGRADED" cannot tell those apart. The row is the artifact V reads, so the row is what
    // the assertion pins.
    expect(rows).toEqual([
      "| C1 | acceptance:codex-cli | acceptance:claude-cli | baseline (currently sealed) | UNGRADED | UNGRADED |",
      "| C2 | acceptance:claude-cli | acceptance:codex-cli | candidate | UNGRADED | UNGRADED |",
      "| C3 | acceptance:claude-cli | acceptance:fourth-cli | candidate | UNGRADED | UNGRADED |"
    ]);
    expect(table).toContain("UNGRADED: no V-approved run has produced a grade for this cell");
  });

  test("a graded cell shows its mean and the count it was computed from", () => {
    const table = renderComparisonTable({
      configs,
      assignments,
      cells: [
        { configId: "C1", debateRef: "run-1", graderRoleRef: "acceptance:grok-cli", score: 4 },
        { configId: "C1", debateRef: "run-1", graderRoleRef: "acceptance:fourth-cli", score: 2 }
      ]
    });
    expect(table.find((line) => line.startsWith("| C1 "))).toBe(
      "| C1 | acceptance:codex-cli | acceptance:claude-cli | baseline (currently sealed) | 3.00 | 2 grades |"
    );
    expect(table.find((line) => line.startsWith("| C2 "))).toBe(
      "| C2 | acceptance:claude-cli | acceptance:codex-cli | candidate | UNGRADED | UNGRADED |"
    );
  });

  // The sealed-three deployment, whose configs and grader pool must come from the SAME
  // deployment — deriving configs from four identities and grading them against three
  // describes a deployment that does not exist, and the first draft of this test did.
  const sealedThreeConfigs = deriveCandidateConfigs({
    sealed: SEALED_CONTROLS,
    configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
    candidateConfigCount: 3
  });
  const sealedThreeAssignments = sealedThreeConfigs.map((candidate) =>
    assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 }));

  test("THE PROVENANCE TABLE names which identity filled which role, per config", () => {
    // V-S11-1: "same-model provenance is RECORDED, never hidden". A table that reports a score
    // without saying who produced and who graded it cannot support the role decision it exists
    // to inform.
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    const rows = table.filter((line) => line.startsWith("| prov C"));
    expect(rows).toEqual([
      "| prov C1 | synthesizer acceptance:codex-cli | evaluator acceptance:claude-cli "
        + "| graders acceptance:grok-cli (INDEPENDENT), acceptance:grok-cli (INDEPENDENT, repeat) "
        + "| same-model no | same-family no |",
      "| prov C2 | synthesizer acceptance:claude-cli | evaluator acceptance:codex-cli "
        + "| graders acceptance:grok-cli (INDEPENDENT), acceptance:grok-cli (INDEPENDENT, repeat) "
        + "| same-model no | same-family no |",
      "| prov C3 | synthesizer acceptance:claude-cli | evaluator acceptance:grok-cli "
        + "| graders acceptance:codex-cli (INDEPENDENT), acceptance:codex-cli (INDEPENDENT, repeat) "
        + "| same-model no | same-family no |"
    ]);
  });

  test("the table carries every condition mark the run raised, and says a clean run raised none", () => {
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    expect(table).toContain(`CONDITION MARKS: ${BLIND_GRADING_DEGRADED_MARK}, `
      + `${GRADER_REPEATS_IDENTITY_MARK}, ${GRADER_SET_VARIES_BY_CONFIG_MARK}`);

    // A single fully independent arm is the only shape that raises nothing at all.
    const oneCleanConfig = deriveCandidateConfigs({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 1
    });
    const clean = renderComparisonTable({
      configs: oneCleanConfig,
      assignments: oneCleanConfig.map((candidate) =>
        assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 })),
      cells: []
    });
    expect(clean).toContain("CONDITION MARKS: none — every cell was graded by two independent identities");
  });
});
