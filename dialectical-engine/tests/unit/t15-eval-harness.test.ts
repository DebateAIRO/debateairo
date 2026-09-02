import { describe, expect, test } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  EVAL_HARNESS_MATRIX,
  EVAL_HARNESS_SPEND,
  GRADER_REQUEST_KEYS,
  BLIND_GRADING_DEGRADED_MARK,
  CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK,
  CANDIDATE_SET_REDUCED_MARK,
  CROSS_ARM_COMPARISON_UNAVAILABLE_MARK,
  GRADER_IS_CANDIDATE_EVALUATOR_MARK,
  GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
  GRADER_REPEATS_IDENTITY_MARK,
  GRADER_SET_VARIES_BY_CONFIG_MARK,
  GRADER_SHARES_CANDIDATE_FAMILY_MARK,
  INSTANCE_FRESHNESS_UNVERIFIED_MARK,
  MODEL_IDENTITY_UNKNOWN_MARK,
  assertSpendCeilingWithinSealedBound,
  assessComparability,
  assignBlindGraders,
  buildGraderRequest,
  projectCallCount,
  renderComparisonTable,
  renderProjection,
  resolveRoundCap,
  runEvalHarness,
  deriveCandidateSet,
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

/**
 * A deployment whose ARMS and PANEL are disjoint: `a`/`b` fill the role seats, `g1`/`g2` are
 * reserved for grading. That disjointness is what makes the arms comparable — every arm faces
 * the identical panel, so grader effects are constant and the means measure the roles.
 */
const SHARED_PANEL_POOL: readonly ConfiguredProviderIdentity[] = Object.freeze([
  Object.freeze({ providerRef: "a-cli", maker: "A" }),
  Object.freeze({ providerRef: "b-cli", maker: "B" }),
  Object.freeze({ providerRef: "g1-cli", maker: "G" }),
  Object.freeze({ providerRef: "g2-cli", maker: "G" })
]);

const SEALED_CONTROLS = Object.freeze({
  registerVersion: 7,
  synthesizerRoleRef: "acceptance:codex-cli",
  evaluatorRoleRef: "acceptance:claude-cli",
  evaluatorLoopMaxRounds: 3
});

/** The arms only; `deriveCandidateSet` carries the reduction facts beside them. */
function arms(input: Parameters<typeof deriveCandidateSet>[0]): readonly CandidateRoleConfig[] {
  return deriveCandidateSet(input).configs;
}

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
    // 8..11 are the evidence-gap and non-commensurability disclosures: even on four identities
    // C3 draws a different independent pair than C1/C2, so the arms face different panels.
    expect(refusalIndex).toBe(12);
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
    baseline: true,
    rolesDistinct: true
  });

  test("with enough identities: two INDEPENDENT seats, nothing degraded, no mark", () => {
    const assignment = assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:fourth-cli", relations: ["INDEPENDENT"], repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:grok-cli", relations: ["INDEPENDENT"], repeatOfEarlierSeat: false }
    ]);
    expect(assignment.degraded).toBe(false);
    expect(assignment.marks).toEqual([]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(false);
    // B3: a DIFFERENT provider ref may still be backed by the same model. The register carries
    // no model, so the honest answer is UNKNOWN — never NO.
    expect(assignment.sameModelAsCandidate).toBe("UNKNOWN");
    expect(assignment.sameMakerAsCandidate).toBe("NO");
  });

  test("the REAL three-identity deployment RUNS on a repeated independent grader and discloses it", () => {
    const assignment = assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 });
    // V-S11-1: "graded by another AI" is preserved for BOTH seats by repeating the one
    // independent identity, rather than seating a member of the candidate config.
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:grok-cli", relations: ["INDEPENDENT"], repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:grok-cli", relations: ["INDEPENDENT"], repeatOfEarlierSeat: true }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.marks).toEqual([BLIND_GRADING_DEGRADED_MARK, GRADER_REPEATS_IDENTITY_MARK]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(false);
    expect(assignment.sameModelAsCandidate).toBe("UNKNOWN");
    expect(assignment.sameMakerAsCandidate).toBe("NO");
    // B3: the disclosure no longer asserts "fresh instances" — the harness carries no per-call
    // instance reference, so it says what it has and marks the rest unverified.
    expect(assignment.disclosure).toBe(
      "C1: 2 grader seats filled from 1 distinct identity that is not the candidate's; "
      + "the two observations come from one provider identity and are not independent of each "
      + "other. Instance freshness is UNVERIFIED: no per-call instance reference is recorded."
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
      { graderRoleRef: "acceptance:claude-cli", relations: ["CANDIDATE_EVALUATOR"], repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:codex-cli", relations: ["CANDIDATE_SYNTHESIZER"], repeatOfEarlierSeat: false }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.marks).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      GRADER_IS_CANDIDATE_EVALUATOR_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(true);
    // Identity equality is the ONE case where same-model is KNOWN: the same ref is the same model.
    expect(assignment.sameModelAsCandidate).toBe("YES");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
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
    expect(assignment.sameProviderIdentityAsCandidate).toBe(false);
    expect(assignment.sameModelAsCandidate).toBe("UNKNOWN");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
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
      { graderRoleRef: "acceptance:codex-cli", relations: ["CANDIDATE_SYNTHESIZER"], repeatOfEarlierSeat: false },
      { graderRoleRef: "acceptance:codex-cli", relations: ["CANDIDATE_SYNTHESIZER"], repeatOfEarlierSeat: true }
    ]);
    expect(assignment.degraded).toBe(true);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(true);
    expect(assignment.sameModelAsCandidate).toBe("YES");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
    expect(assignment.marks).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      GRADER_REPEATS_IDENTITY_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.disclosure).toBe(
      "C1: the candidate's own identities grade it — acceptance:codex-cli as CANDIDATE_SYNTHESIZER, "
      + "acceptance:codex-cli as CANDIDATE_SYNTHESIZER; the grade is not independent of the "
      + "configuration it scores. Instance freshness is UNVERIFIED: no per-call instance "
      + "reference is recorded."
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
    const configs = arms({
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

  test("one shared panel across every arm raises no DEGRADATION — only the evidence gaps", () => {
    // Measured while fixing this fixture, and it is the design lesson: arms and panel must be
    // DISJOINT. Deriving arms from all four identities put g1 into an arm's evaluator seat, so
    // that arm could no longer be graded by g1 and the panels diverged. Arms drawn from the
    // role-capable pair, graded by the reserved pair, is what makes the comparison valid.
    const configs = arms({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
      configuredProviderRefs: ["a-cli", "b-cli"],
      candidateConfigCount: 2
    });
    const assignments = configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: SHARED_PANEL_POOL, gradersPerCell: 2 }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.anyDegraded).toBe(false);
    // The two remaining marks are B3 evidence gaps, not capacity degradations.
    expect(summary.marks).toEqual([MODEL_IDENTITY_UNKNOWN_MARK, INSTANCE_FRESHNESS_UNVERIFIED_MARK]);
    expect(summary.comparability.comparable).toBe(true);
  });
});

describe("T15 · the harness reads sealed identities and refuses loudly when reality is short", () => {
  test("candidate configs derive from the SEALED provider identities, baseline first", () => {
    const configs = arms({
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

  test("two identities still yield three arms — the third has NON-DISTINCT roles, and says so", () => {
    // V-S11-1 is general policy, not a grader-pool waiver: a capacity shortfall degrades with
    // disclosure wherever it occurs. Goal 91-93 permits identical synthesizer/evaluator refs
    // (J7 warns rather than refuses), so the same-ref arm is a lawful arm, marked as such.
    const set = deriveCandidateSet({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ["acceptance:codex-cli", "acceptance:claude-cli"],
      candidateConfigCount: 3
    });
    expect(set.configs.map((config) => [config.synthesizerRoleRef, config.evaluatorRoleRef])).toEqual([
      ["acceptance:codex-cli", "acceptance:claude-cli"],
      ["acceptance:claude-cli", "acceptance:codex-cli"],
      ["acceptance:claude-cli", "acceptance:claude-cli"]
    ]);
    expect(set.reduced).toBe(false);
    expect(set.configs.map((config) => config.rolesDistinct)).toEqual([true, true, false]);
    expect(set.marks).toEqual([CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK]);
  });

  test("ONE identity yields ONE arm — not three fabricated copies of it", () => {
    // Codex B1's concrete input: one configured identity, both sealed refs equal to it.
    const set = deriveCandidateSet({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "solo", evaluatorRoleRef: "solo" },
      configuredProviderRefs: ["solo"],
      candidateConfigCount: 3
    });
    expect(set.configs).toHaveLength(1);
    expect(set.configs[0]?.synthesizerRoleRef).toBe("solo");
    expect(set.configs[0]?.evaluatorRoleRef).toBe("solo");
    expect(set.configs[0]?.rolesDistinct).toBe(false);
    expect(set.reduced).toBe(true);
    expect(set.marks).toEqual([CANDIDATE_SET_REDUCED_MARK, CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK]);
    expect(set.disclosure).toBe(
      "1 configured provider identity yields 1 candidate arm; the goal's matrix asks for 3. "
      + "The comparison runs on what the deployment can express and no arm is duplicated to "
      + "reach the requested count."
    );
  });

  test("ZERO identities is an absence, not a degradation, and refuses loudly", () => {
    expectRefusalCode(() => deriveCandidateSet({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: [],
      candidateConfigCount: 3
    }), "EVAL_CANDIDATE_POOL_EMPTY");
  });

  test("a dual-role identity carries BOTH candidate relations, not just the synthesizer one", () => {
    // Codex B1, second half: the scalar check classified only CANDIDATE_SYNTHESIZER and
    // silently dropped the evaluator relation on the very deployment shape V legitimised.
    const assignment = assignBlindGraders({
      candidate: {
        configId: "C1",
        synthesizerRoleRef: "solo",
        evaluatorRoleRef: "solo",
        baseline: true,
        rolesDistinct: false
      },
      graderPool: [{ providerRef: "solo", maker: "Solo" }],
      gradersPerCell: 2
    });
    expect(assignment.seats[0]?.relations).toEqual(["CANDIDATE_EVALUATOR", "CANDIDATE_SYNTHESIZER"]);
    expect(assignment.marks).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      GRADER_REPEATS_IDENTITY_MARK,
      GRADER_IS_CANDIDATE_EVALUATOR_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
  });

  test("THE ONE-PROVIDER PATH runs end to end through runEvalHarness to the approval refusal", async () => {
    // The r2 filing pinned only a helper boundary. This is the coherent deployment: one
    // identity, both sealed refs equal to it, driven through the whole harness.
    const { dependencies, calls, emitted } = spyingDependencies({
      readSynthesisRoleControls: async () => ({
        ...SEALED_CONTROLS, synthesizerRoleRef: "solo", evaluatorRoleRef: "solo"
      }),
      readConfiguredProviders: async () => [{ providerRef: "solo", maker: "Solo" }]
    });
    const outcome = await runEvalHarness({ approved: false }, dependencies);
    expect(outcome.decision).toBe("REFUSED_AWAITING_APPROVAL");
    expect(outcome.refusalCode).toBe("EVAL_HARNESS_NOT_APPROVED");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
    expect(outcome.configs).toHaveLength(1);
    expect(outcome.candidateSet.reduced).toBe(true);
    // The matrix is qualified, not silently reduced: 1 arm x 5 debates x 2 rounds x (2+2).
    expect(outcome.effectiveProjection.candidateConfigCount).toBe(1);
    expect(outcome.effectiveProjection.nominalCalls).toBe(30);
    expect(outcome.effectiveProjection.worstCaseCalls).toBe(60);
    expect(emitted).toContain("REVISED projected provider calls (nominal): 30");
    expect(emitted).toContain("REVISED projected provider calls (worst case): 60");
  });

  test("the one-provider path, once APPROVED, grades its single arm rather than refusing", async () => {
    const { dependencies, calls } = spyingDependencies({
      readSynthesisRoleControls: async () => ({
        ...SEALED_CONTROLS, synthesizerRoleRef: "solo", evaluatorRoleRef: "solo"
      }),
      readConfiguredProviders: async () => [{ providerRef: "solo", maker: "Solo" }]
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("PROCEEDED");
    // 5 debates x 1 arm x (1 synthesizer + 1 evaluator + 2 graders)
    expect(outcome.providerCallsMade).toBe(20);
    expect(calls.filter((call) => call.startsWith("GRADER:"))).toHaveLength(10);
  });

  test("a sealed role ref outside the configured provider set refuses loudly (J24: identity, never substitution)", () => {
    expectRefusalCode(() => arms({
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
    // N1: pin the exact DISTINCT mark set and require EVERY emitted mark line — not just the
    // umbrella — to precede the gate. Checking one mark left the other two unordered.
    const markIndices = emitted
      .map((line, index) => (line.startsWith("CONDITION MARK ") ? index : -1))
      .filter((index) => index !== -1);
    const markNames = [...new Set(markIndices.map((index) =>
      emitted[index]?.slice("CONDITION MARK ".length).split(" ·")[0] ?? ""))].sort();
    const gateIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    expect(markNames).toEqual([
      BLIND_GRADING_DEGRADED_MARK,
      CROSS_ARM_COMPARISON_UNAVAILABLE_MARK,
      GRADER_REPEATS_IDENTITY_MARK,
      GRADER_SET_VARIES_BY_CONFIG_MARK,
      INSTANCE_FRESHNESS_UNVERIFIED_MARK,
      MODEL_IDENTITY_UNKNOWN_MARK
    ].sort());
    expect(markIndices.length).toBeGreaterThan(0);
    expect(Math.max(...markIndices)).toBeLessThan(gateIndex);
    expect(emitted).toContain(
      `CONDITION MARK ${BLIND_GRADING_DEGRADED_MARK} · C1: 2 grader seats filled from 1 distinct `
      + "identity that is not the candidate's; the two observations come from one provider "
      + "identity and are not independent of each other. Instance freshness is UNVERIFIED: no "
      + "per-call instance reference is recorded."
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

describe("T15 · run-level degradation, comparability and provenance honesty", () => {
  test("N2: four identities and three arms — no arm is degraded, yet the RUN is", () => {
    // Every arm gets two distinct non-candidate graders, so each assignment is clean; the
    // panels still differ between arms, which is a run-level degradation. Reporting
    // anyDegraded:false beside a degradation mark is the contradiction this pins.
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    });
    const assignments = configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: FOUR_IDENTITY, gradersPerCell: 2 }));
    expect(assignments.map((assignment) => assignment.degraded)).toEqual([false, false, false]);
    const summary = summariseGradingProvenance(assignments);
    expect(summary.marks).toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
    expect(summary.anyDegraded).toBe(true);
  });

  test("B2: arms graded by different panels are NOT comparable, and the verdict says why", () => {
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const verdict = assessComparability(configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 })));
    expect(verdict.comparable).toBe(false);
    expect(verdict.reason).toBe(
      "the arms were graded by different panels, so an arm's mean confounds the grader with the "
      + "role configuration and no cross-arm ranking can be inferred"
    );
  });

  test("B2: one shared panel across every arm IS comparable", () => {
    const configs = arms({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
      configuredProviderRefs: ["a-cli", "b-cli"],
      candidateConfigCount: 2
    });
    const verdict = assessComparability(configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: SHARED_PANEL_POOL, gradersPerCell: 2 })));
    expect(verdict.comparable).toBe(true);
    expect(verdict.reason).toBe("every arm faced the same panel");
  });

  test("B2: a single arm is not a comparison", () => {
    const verdict = assessComparability([assignBlindGraders({
      candidate: { configId: "C1", synthesizerRoleRef: "solo", evaluatorRoleRef: "solo", baseline: true, rolesDistinct: false },
      graderPool: [{ providerRef: "solo", maker: "Solo" }],
      gradersPerCell: 2
    })]);
    expect(verdict.comparable).toBe(false);
    expect(verdict.reason).toBe("a single arm is not a comparison");
  });

  test("B3: the run declares model identity UNKNOWN and instance freshness UNVERIFIED", () => {
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const summary = summariseGradingProvenance(configs.map((candidate) =>
      assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 })));
    expect(summary.marks).toContain(MODEL_IDENTITY_UNKNOWN_MARK);
    expect(summary.marks).toContain(INSTANCE_FRESHNESS_UNVERIFIED_MARK);
  });

  test("B3: when an adapter DOES report the model, same-model becomes known in both directions", () => {
    const candidate: CandidateRoleConfig = Object.freeze({
      configId: "C1",
      synthesizerRoleRef: "alpha-cli",
      evaluatorRoleRef: "beta-cli",
      baseline: true,
      rolesDistinct: true
    });
    const sameModelPool: readonly ConfiguredProviderIdentity[] = [
      { providerRef: "alpha-cli", maker: "A", model: "shared-model-1" },
      { providerRef: "beta-cli", maker: "B", model: "other-model" },
      { providerRef: "gamma-cli", maker: "G", model: "shared-model-1" },
      { providerRef: "delta-cli", maker: "D", model: "distinct-model" }
    ];
    // gamma is a DIFFERENT provider ref backed by the SAME model as the synthesizer — the exact
    // wrong outcome B3 names, which provider-ref equality reports as "not the same model".
    const withGamma = assignBlindGraders({
      candidate,
      graderPool: sameModelPool.filter((identity) => identity.providerRef !== "delta-cli"),
      gradersPerCell: 2
    });
    expect(withGamma.sameProviderIdentityAsCandidate).toBe(false);
    expect(withGamma.sameModelAsCandidate).toBe("YES");

    const withDelta = assignBlindGraders({
      candidate,
      graderPool: sameModelPool.filter((identity) => identity.providerRef !== "gamma-cli"),
      gradersPerCell: 2
    });
    expect(withDelta.sameModelAsCandidate).toBe("NO");
  });

  test("N5: a stated spend ceiling above the sealed organ bound refuses", () => {
    expectRefusalCode(() => assertSpendCeilingWithinSealedBound({
      stated: { maxAttempts: 2, tokenCeiling: 4_096 },
      sealed: { maxAttempts: 3, tokenCeiling: 2_048 }
    }), "EVAL_SPEND_CEILING_EXCEEDS_SEALED_BOUND");
    expectRefusalCode(() => assertSpendCeilingWithinSealedBound({
      stated: { maxAttempts: 9, tokenCeiling: 2_048 },
      sealed: { maxAttempts: 3, tokenCeiling: 2_048 }
    }), "EVAL_SPEND_CEILING_EXCEEDS_SEALED_BOUND");
  });

  test("N5: at or below the sealed bound passes; an unread bound is marked, never assumed", () => {
    expect(assertSpendCeilingWithinSealedBound({
      stated: { maxAttempts: EVAL_HARNESS_SPEND.maxAttemptsPerCall, tokenCeiling: EVAL_HARNESS_SPEND.tokenCeilingPerCall },
      sealed: { maxAttempts: 3, tokenCeiling: 2_048 }
    }).marks).toEqual([]);
    expect(assertSpendCeilingWithinSealedBound({
      stated: { maxAttempts: EVAL_HARNESS_SPEND.maxAttemptsPerCall, tokenCeiling: EVAL_HARNESS_SPEND.tokenCeilingPerCall },
      sealed: null
    }).marks).toEqual(["SPEND-CEILING-UNVERIFIED"]);
  });
});

describe("T15b · the comparison table that routes to V", () => {
  // A COMPARABLE deployment: both arms draw the identical panel {g1, g2}, so grader effects are
  // constant across arms and the means measure the role configuration.
  const comparableConfigs = arms({
    sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
    configuredProviderRefs: ["a-cli", "b-cli"],
    candidateConfigCount: 2
  });
  const comparableAssignments = comparableConfigs.map((candidate) =>
    assignBlindGraders({ candidate, graderPool: SHARED_PANEL_POOL, gradersPerCell: 2 }));

  // The deployment as actually sealed: each arm draws a DIFFERENT panel.
  const sealedThreeConfigs = arms({
    sealed: SEALED_CONTROLS,
    configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
    candidateConfigCount: 3
  });
  const sealedThreeAssignments = sealedThreeConfigs.map((candidate) =>
    assignBlindGraders({ candidate, graderPool: ACCEPTANCE_SEALED, gradersPerCell: 2 }));

  test("COMPARABLE: an ungraded cell says so instead of showing a number", () => {
    const table = renderComparisonTable({
      configs: comparableConfigs,
      assignments: comparableAssignments,
      cells: []
    });
    // Mutant m8 survived a `toContain("UNGRADED")` row check: the GRADES column still said
    // UNGRADED while the SCORE column rendered NaN. The row is the artifact V reads.
    expect(table.filter((line) => line.startsWith("| C"))).toEqual([
      "| C1 | a-cli | b-cli | baseline (currently sealed) | UNGRADED | UNGRADED |",
      "| C2 | b-cli | a-cli | candidate | UNGRADED | UNGRADED |"
    ]);
    expect(table).toContain("UNGRADED: no V-approved run has produced a grade for this cell");
  });

  test("COMPARABLE: a graded cell shows its mean, its observations and its distinct graders", () => {
    const table = renderComparisonTable({
      configs: comparableConfigs,
      assignments: comparableAssignments,
      cells: [
        { configId: "C1", debateRef: "run-1", graderRoleRef: "g1-cli", score: 4 },
        { configId: "C1", debateRef: "run-1", graderRoleRef: "g2-cli", score: 2 }
      ]
    });
    expect(table.find((line) => line.startsWith("| C1 "))).toBe(
      "| C1 | a-cli | b-cli | baseline (currently sealed) | 3.00 | 2 from 2 distinct graders |"
    );
    expect(table.find((line) => line.startsWith("| C2 "))).toBe(
      "| C2 | b-cli | a-cli | candidate | UNGRADED | UNGRADED |"
    );
  });

  test("NOT COMPARABLE: no mean is rendered anywhere, and the artifact says so first", () => {
    // B2: a warning discloses invalid comparability, it does not restore it. When the panels
    // differ the pooled mean is suppressed entirely rather than printed beside a caveat.
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: [
        { configId: "C1", debateRef: "run-1", graderRoleRef: "acceptance:grok-cli", score: 5 },
        { configId: "C3", debateRef: "run-1", graderRoleRef: "acceptance:codex-cli", score: 1 }
      ]
    });
    expect(table[0]).toBe(
      "NO CROSS-ARM COMPARISON IS POSSIBLE FROM THIS RUN — the arms were graded by different "
      + "panels, so an arm's mean confounds the grader with the role configuration and no "
      + "cross-arm ranking can be inferred. No role choice can be inferred from this artifact."
    );
    expect(table).toContain(
      "| config | synthesizer role ref | evaluator role ref | arm | grader | observations |"
    );
    expect(table.some((line) => line.includes("mean blind score"))).toBe(false);
    // 5 and 1 were recorded; neither may appear as a comparable statistic.
    expect(table.some((line) => line.includes("5.00") || line.includes("1.00"))).toBe(false);
    expect(table.filter((line) => line.startsWith("| C1 "))).toEqual([
      "| C1 | acceptance:codex-cli | acceptance:claude-cli | baseline (currently sealed) "
      + "| acceptance:grok-cli | 1 observation |"
    ]);
  });

  test("THE PROVENANCE TABLE names which identity filled which role, per config", () => {
    // V-S11-1: "same-model provenance is RECORDED, never hidden" — and B3: it is recorded as
    // what is KNOWN. Provider identity is known; model identity is not, so it is UNKNOWN.
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    expect(table.filter((line) => line.startsWith("| prov C"))).toEqual([
      "| prov C1 | synthesizer acceptance:codex-cli | evaluator acceptance:claude-cli "
        + "| graders acceptance:grok-cli (INDEPENDENT), acceptance:grok-cli (INDEPENDENT, repeat) "
        + "| same provider identity no | same model UNKNOWN | same maker NO |",
      "| prov C2 | synthesizer acceptance:claude-cli | evaluator acceptance:codex-cli "
        + "| graders acceptance:grok-cli (INDEPENDENT), acceptance:grok-cli (INDEPENDENT, repeat) "
        + "| same provider identity no | same model UNKNOWN | same maker NO |",
      "| prov C3 | synthesizer acceptance:claude-cli | evaluator acceptance:grok-cli "
        + "| graders acceptance:codex-cli (INDEPENDENT), acceptance:codex-cli (INDEPENDENT, repeat) "
        + "| same provider identity no | same model UNKNOWN | same maker NO |"
    ]);
  });

  test("the table states what would have to exist before it could claim fresh instances", () => {
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    expect(table).toContain(
      "INSTANCE FRESHNESS AND EXACT MODEL IDENTITY ARE NOT ESTABLISHED BY THIS ARTIFACT. Settling "
      + "them needs an adapter that opens a new session per call, carries an explicit stage "
      + "prompt, and returns the observed provider, model, version and a per-call instance "
      + "reference. Until it exists these facts are recorded as UNKNOWN, never as satisfied."
    );
  });

  test("the table carries every condition mark the run raised, and says a clean run raised none", () => {
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    expect(table).toContain(
      `CONDITION MARKS: ${BLIND_GRADING_DEGRADED_MARK}, ${GRADER_REPEATS_IDENTITY_MARK}, `
      + `${MODEL_IDENTITY_UNKNOWN_MARK}, ${INSTANCE_FRESHNESS_UNVERIFIED_MARK}, `
      + `${GRADER_SET_VARIES_BY_CONFIG_MARK}, ${CROSS_ARM_COMPARISON_UNAVAILABLE_MARK}`
    );
  });
});
