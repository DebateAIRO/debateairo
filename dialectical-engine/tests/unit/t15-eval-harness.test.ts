import { describe, expect, test } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  EVAL_HARNESS_MATRIX,
  EVAL_HARNESS_SPEND,
  GRADER_REQUEST_KEYS,
  CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK,
  CANDIDATE_SET_REDUCED_MARK,
  CROSS_ARM_COMPARISON_UNAVAILABLE_MARK,
  GRADER_IS_CANDIDATE_EVALUATOR_MARK,
  GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
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
  resolveFixedGrader,
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
 * candidate role configs x <=2 evaluator rounds. Its grader clause — "graded
 * blind by 2 graders that are never the candidate" — was OVERTURNED by V on
 * 2026-09-03: V-S11-GRADER seats ONE FIXED grader for every arm and holds that
 * a grader sharing an identity with the candidate is not contamination. Every
 * grader assertion below cites that ruling; the other numbers are goal text.
 *
 * MEASURED BEFORE WRITING (worker contract 3): the acceptance deployment seals
 * exactly THREE provider identities today (acceptance/README.md; GROK-01
 * DR-177). Under the ruling that is no longer a shortfall of any kind — one of
 * those three grades all three arms — so the fourth-identity fixture below now
 * only exercises a larger pool, never a repair.
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

/**
 * V-S11-GRADER: the run's ONE grader, resolved from the configured set without looking at any
 * candidate. Used wherever the seating is under test but the CHOICE of identity is not; where the
 * choice is the point, the identity is passed explicitly instead.
 */
function fixedFrom(pool: readonly ConfiguredProviderIdentity[]): ConfiguredProviderIdentity {
  return resolveFixedGrader({ graderPool: pool });
}

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
    // V-S11-GRADER overrode the goal's "2 graders": ONE FIXED identity grades every arm, so a
    // cell is graded once. A second seat would repeat the fixed grader and buy nothing.
    expect(EVAL_HARNESS_MATRIX.gradersPerCell).toBe(1);
  });

  test("the projection is the exact arithmetic of the matrix, nominal and worst case", () => {
    const projection = projectCallCount({
      recordedDebateCount: 5,
      candidateConfigCount: 3,
      evaluatorRoundCap: 2,
      gradersPerCell: 1,
      maxAttemptsPerCall: 2,
      tokenCeilingPerCall: 2_048
    });
    expect(projection.synthesizerCalls).toBe(30);
    expect(projection.evaluatorCalls).toBe(30);
    // V-S11-GRADER: 15 cells x ONE fixed grader. The 30 pinned here before was 15 x 2 graders.
    expect(projection.graderCalls).toBe(15);
    expect(projection.nominalCalls).toBe(75);
    expect(projection.worstCaseCalls).toBe(150);
    expect(projection.worstCaseTokenCeiling).toBe(307_200);
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
      gradersPerCell: 1,
      maxAttemptsPerCall: 2,
      tokenCeilingPerCall: 2_048
    }));
    expect(lines).toContain("matrix: 5 recorded debates x 3 candidate role configs x <=2 evaluator rounds");
    // V-S11-GRADER: the projection states the RULE it is projecting — one fixed identity for
    // every arm, and a shared identity disclosed rather than excluded. The old line promised
    // independence "where the deployment allows", which is no longer the policy being run.
    expect(lines).toContain(
      "blind graders per cell: 1 (ONE FIXED identity grades every arm; a grader that shares an "
      + "identity, model or maker with a candidate is disclosed, never excluded)"
    );
    expect(lines).toContain("per-call max attempts: 2");
    expect(lines).toContain("per-call token ceiling: 2048");
    expect(lines).toContain("projected provider calls (nominal): 75");
    expect(lines).toContain("projected provider calls (worst case): 150");
    expect(lines).toContain("projected token ceiling (worst case): 307200");
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
    // V-S11-GRADER: 90/180 was the two-grader count; one fixed grader makes it 75/150.
    expect(emitted).toContain("projected provider calls (nominal): 75");
    expect(emitted).toContain("projected provider calls (worst case): 150");
  });

  test("the projection is printed BEFORE the refusal, never after it", async () => {
    const { dependencies, emitted } = spyingDependencies();
    await runEvalHarness({ approved: false }, dependencies);
    const projectionIndex = emitted.findIndex((line) => line.startsWith("projected provider calls (worst case):"));
    const refusalIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    expect(projectionIndex).toBe(6);
    // The refusal is the LAST line emitted. The r3 form hard-coded index 12, which made this
    // assertion fail whenever the NUMBER of emitted marks changed — so four mutants that alter
    // the mark set (m14, m17, m18, m19) were credited to this test without it discriminating
    // their mutation at all. Pinning "last" states the actual property and cannot be moved by
    // an unrelated mark; the distinct mark set and its ordering are pinned by their own test.
    expect(refusalIndex).toBe(emitted.length - 1);
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

describe("T15 · blind grading seats ONE FIXED grader and DISCLOSES it (V-S11-GRADER)", () => {
  const candidate: CandidateRoleConfig = Object.freeze({
    configId: "C1",
    synthesizerRoleRef: "acceptance:codex-cli",
    evaluatorRoleRef: "acceptance:claude-cli",
    baseline: true,
    rolesDistinct: true
  });

  test("the fixed grader is chosen from the configured set WITHOUT reference to any candidate", () => {
    // V-S11-GRADER: grader identity may not be a function of the arm — that dependence is
    // precisely what made the arms non-commensurable. The resolver takes no candidate at all, so
    // two different arms of one deployment cannot draw different graders.
    expect(resolveFixedGrader({ graderPool: ACCEPTANCE_SEALED }).providerRef)
      .toBe("acceptance:claude-cli");
    expect(resolveFixedGrader({ graderPool: FOUR_IDENTITY }).providerRef)
      .toBe("acceptance:claude-cli");
    // Order of the configured rows must not move the constant.
    expect(resolveFixedGrader({ graderPool: [...ACCEPTANCE_SEALED].reverse() }).providerRef)
      .toBe("acceptance:claude-cli");
  });

  test("with four identities the fixed grader is seated even though it IS one of the arm's roles", () => {
    // V-S11-GRADER: the old assertion here pinned TWO seats drawn by complementing the candidate
    // (fourth-cli + grok-cli) precisely to avoid this identity. One fixed identity replaces that
    // ranking entirely, and being the candidate's evaluator no longer disqualifies it.
    const assignment = assignBlindGraders({
      candidate,
      fixedGrader: fixedFrom(FOUR_IDENTITY),
      graderPool: FOUR_IDENTITY,
      gradersPerCell: 1
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:claude-cli", relations: ["CANDIDATE_EVALUATOR"] }
    ]);
    expect(assignment.fixedGraderRoleRef).toBe("acceptance:claude-cli");
    // MEASURED, not assumed: claude-cli is the candidate's evaluator AND its maker is in the
    // candidate's maker set, so both facts are RECORDED as disclosure marks — and neither is a
    // degradation any more, since the BLIND-GRADING-DEGRADED umbrella is gone.
    expect(assignment.marks).toEqual([
      GRADER_IS_CANDIDATE_EVALUATOR_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(true);
    expect(assignment.sameModelAsCandidate).toBe("YES");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
  });

  test("a grader INDEPENDENT of the arm it grades records exactly that, and marks nothing", () => {
    // B3 survives V-S11-GRADER untouched: a DIFFERENT provider ref may still be backed by the
    // same model, so the honest answer is UNKNOWN — never NO.
    const assignment = assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "acceptance:grok-cli", maker: "xAI" },
      graderPool: ACCEPTANCE_SEALED,
      gradersPerCell: 1
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:grok-cli", relations: ["INDEPENDENT"] }
    ]);
    expect(assignment.marks).toEqual([]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(false);
    expect(assignment.sameModelAsCandidate).toBe("UNKNOWN");
    expect(assignment.sameMakerAsCandidate).toBe("NO");
    // The disclosure names the identity, says it is the run's constant, and states the relation.
    expect(assignment.disclosure).toBe(
      "C1: graded by acceptance:grok-cli, the run's FIXED grader seated for every arm; to this "
      + "arm it stands as INDEPENDENT. A shared identity, model or family is RECORDED, never a "
      + "reason to exclude (V-S11-GRADER). Instance freshness is UNVERIFIED: no per-call "
      + "instance reference is recorded."
    );
  });

  test("the candidate's own SYNTHESIZER may grade it — lawful, and disclosed rather than excluded", () => {
    // V-S11-GRADER's second rule, and the one the mission had backwards: "each step shouldn't
    // know who made the previous step", so a fresh instance grading a statement it did not know
    // it authored is impartial. The old assertion ranked this identity LAST and marked the run
    // degraded for reaching it.
    const assignment = assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "acceptance:codex-cli", maker: "OpenAI" },
      graderPool: ACCEPTANCE_SEALED,
      gradersPerCell: 1
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:codex-cli", relations: ["CANDIDATE_SYNTHESIZER"] }
    ]);
    expect(assignment.marks).toEqual([
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(true);
    // Identity equality is the ONE case where same-model is KNOWN: the same ref is the same model.
    expect(assignment.sameModelAsCandidate).toBe("YES");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
    expect(assignment.disclosure).toBe(
      "C1: graded by acceptance:codex-cli, the run's FIXED grader seated for every arm; to this "
      + "arm it stands as CANDIDATE_SYNTHESIZER, sharing the candidate's maker family. A shared "
      + "identity, model or family is RECORDED, never a reason to exclude (V-S11-GRADER). "
      + "Instance freshness is UNVERIFIED: no per-call instance reference is recorded."
    );
  });

  test("a grader sharing the candidate's MAKER but not its identity is disclosed as same-family", () => {
    const twoOpenAi: readonly ConfiguredProviderIdentity[] = Object.freeze([
      Object.freeze({ providerRef: "acceptance:codex-cli", maker: "OpenAI" }),
      Object.freeze({ providerRef: "acceptance:claude-cli", maker: "Anthropic" }),
      Object.freeze({ providerRef: "acceptance:codex-two", maker: "OpenAI" })
    ]);
    const assignment = assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "acceptance:codex-two", maker: "OpenAI" },
      graderPool: twoOpenAi,
      gradersPerCell: 1
    });
    expect(assignment.seats.map((seat) => seat.graderRoleRef)).toEqual(["acceptance:codex-two"]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(false);
    expect(assignment.sameModelAsCandidate).toBe("UNKNOWN");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
    // V-S11-1's disclosure law is what survives the ruling unchanged: family is still recorded.
    expect(assignment.marks).toContain(GRADER_SHARES_CANDIDATE_FAMILY_MARK);
  });

  test("EXACTLY ONE identity available: it grades its own statement, and that is disclosed", () => {
    // V-S11-1's headline case, now free of the degradation framing: one model is a legitimate
    // configuration, and under V-S11-GRADER a grader that IS the candidate is not contamination.
    const assignment = assignBlindGraders({
      candidate,
      fixedGrader: fixedFrom([{ providerRef: "acceptance:codex-cli", maker: "OpenAI" }]),
      graderPool: [{ providerRef: "acceptance:codex-cli", maker: "OpenAI" }],
      gradersPerCell: 1
    });
    expect(assignment.seats).toEqual([
      { graderRoleRef: "acceptance:codex-cli", relations: ["CANDIDATE_SYNTHESIZER"] }
    ]);
    expect(assignment.sameProviderIdentityAsCandidate).toBe(true);
    expect(assignment.sameModelAsCandidate).toBe("YES");
    expect(assignment.sameMakerAsCandidate).toBe("YES");
    expect(assignment.marks).toEqual([
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK
    ]);
  });

  test("an EMPTY configured set is an absence, not a degradation, and still refuses loudly", () => {
    // V-S11-GRADER moved this refusal from the per-arm seating to the run-level resolver: the
    // question is no longer "can this arm be complemented" but "can ONE grader stand in front of
    // every arm". The code is unchanged, so every reader of it still reads the same contract.
    expectRefusalCode(
      () => resolveFixedGrader({ graderPool: [] }),
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
  test("arms graded by DIFFERENT identities confound the comparison, and that is disclosed", () => {
    // V-S11-GRADER: this is now the only way to reach non-commensurability — a deployment that
    // could not put ONE grader in front of every arm. It is built here by seating different
    // graders deliberately, because the harness itself can no longer produce it.
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const assignments = configs.map((candidate, index) => assignBlindGraders({
      candidate,
      fixedGrader: index === 2
        ? { providerRef: "acceptance:codex-cli", maker: "OpenAI" }
        : { providerRef: "acceptance:grok-cli", maker: "xAI" },
      graderPool: ACCEPTANCE_SEALED,
      gradersPerCell: 1
    }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.graderSetsByConfig).toEqual({
      C1: ["acceptance:grok-cli"],
      C2: ["acceptance:grok-cli"],
      C3: ["acceptance:codex-cli"]
    });
    expect(summary.marks).toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
    expect(summary.marks).toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
    expect(summary.fixedGraderRoleRef).toBe(null);
    expect(summary.anyDegraded).toBe(true);
  });

  test("one FIXED grader across every arm raises no DEGRADATION — only the evidence gaps", () => {
    // V-S11-GRADER dissolves the old design lesson that arms and panel must be DISJOINT: the
    // grader no longer has to avoid the arms, so a two-identity deployment is comparable on its
    // own terms. The two remaining marks are B3 evidence gaps, not capacity degradations.
    const configs = arms({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
      configuredProviderRefs: ["a-cli", "b-cli"],
      candidateConfigCount: 2
    });
    const assignments = configs.map((candidate) => assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "g1-cli", maker: "G" },
      graderPool: SHARED_PANEL_POOL,
      gradersPerCell: 1
    }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.anyDegraded).toBe(false);
    expect(summary.fixedGraderRoleRef).toBe("g1-cli");
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
      fixedGrader: { providerRef: "solo", maker: "Solo" },
      graderPool: [{ providerRef: "solo", maker: "Solo" }],
      gradersPerCell: 1
    });
    expect(assignment.seats[0]?.relations).toEqual(["CANDIDATE_EVALUATOR", "CANDIDATE_SYNTHESIZER"]);
    // V-S11-GRADER: the umbrella and the repeat mark are gone; what remains is the RECORD of how
    // this grader stands to the arm, which V-S11-1 requires and this ruling leaves untouched.
    expect(assignment.marks).toEqual([
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
    // The matrix is qualified, not silently reduced: 1 arm x 5 debates x (2 rounds x 2 + 1
    // grader). V-S11-GRADER took the grader term from 2 per cell to 1, so 30/60 became 25/50.
    expect(outcome.effectiveProjection.candidateConfigCount).toBe(1);
    expect(outcome.effectiveProjection.nominalCalls).toBe(25);
    expect(outcome.effectiveProjection.worstCaseCalls).toBe(50);
    expect(emitted).toContain("REVISED projected provider calls (nominal): 25");
    expect(emitted).toContain("REVISED projected provider calls (worst case): 50");
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
    // 5 debates x 1 arm x (1 synthesizer + 1 evaluator + 1 fixed grader) — V-S11-GRADER.
    expect(outcome.providerCallsMade).toBe(15);
    expect(calls.filter((call) => call.startsWith("GRADER:"))).toHaveLength(5);
    // The grader is the one identity this deployment configures, and it IS the candidate.
    expect(calls.filter((call) => call.startsWith("GRADER:"))).toEqual(Array(5).fill("GRADER:solo"));
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

  test("the real three-identity deployment RUNS, and emits every mark BEFORE the gate", async () => {
    // The marks are emitted during the FREE preflight, so V reads what was recorded alongside
    // the count it is being asked to approve — a disclosure that arrives after approval has
    // disclosed nothing. V-S11-GRADER changed WHICH marks: the degradation umbrella, the repeat
    // and the two non-commensurability marks are gone, because one fixed grader now covers every
    // arm; what remains are the provenance RECORDS and the two evidence gaps.
    const { dependencies, calls, emitted } = spyingDependencies({
      readConfiguredProviders: async () => ACCEPTANCE_SEALED
    });
    const unapproved = await runEvalHarness({ approved: false }, dependencies);
    expect(unapproved.decision).toBe("REFUSED_AWAITING_APPROVAL");
    expect(calls).toEqual([]);
    // N1: pin the exact DISTINCT mark set and require EVERY emitted mark line to precede the
    // gate. Checking one mark left the others unordered.
    const markIndices = emitted
      .map((line, index) => (line.startsWith("CONDITION MARK ") ? index : -1))
      .filter((index) => index !== -1);
    const markNames = [...new Set(markIndices.map((index) =>
      emitted[index]?.slice("CONDITION MARK ".length).split(" ·")[0] ?? ""))].sort();
    const gateIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    // MEASURED: the fixed grader is claude-cli, which is C1's evaluator and C2/C3's synthesizer,
    // so every arm reports same-identity — and MODEL-IDENTITY-UNKNOWN therefore does NOT fire,
    // because identity equality is the one case where same-model is known without an adapter.
    expect(markNames).toEqual([
      GRADER_IS_CANDIDATE_EVALUATOR_MARK,
      GRADER_IS_CANDIDATE_SYNTHESIZER_MARK,
      GRADER_SHARES_CANDIDATE_FAMILY_MARK,
      INSTANCE_FRESHNESS_UNVERIFIED_MARK
    ].sort());
    expect(markIndices.length).toBeGreaterThan(0);
    expect(Math.max(...markIndices)).toBeLessThan(gateIndex);
    expect(emitted).toContain(
      `CONDITION MARK ${GRADER_IS_CANDIDATE_EVALUATOR_MARK} · C1: graded by acceptance:claude-cli,`
      + " the run's FIXED grader seated for every arm; to this arm it stands as"
      + " CANDIDATE_EVALUATOR, sharing the candidate's maker family. A shared identity, model or"
      + " family is RECORDED, never a reason to exclude (V-S11-GRADER). Instance freshness is"
      + " UNVERIFIED: no per-call instance reference is recorded."
    );
    expect(unapproved.gradingProvenance.marks).not.toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
  });

  test("approved, the three-identity deployment grades every cell rather than refusing", async () => {
    const { dependencies, calls } = spyingDependencies({
      readConfiguredProviders: async () => ACCEPTANCE_SEALED
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("PROCEEDED");
    expect(outcome.refusalCode).toBe(null);
    // 5 debates x 3 configs x (1 synthesizer + 1 evaluator + 1 FIXED grader); the doubles satisfy
    // the evaluator on round 1, so each cell spends one round. V-S11-GRADER: 60 -> 45 calls,
    // because the grader term is one call per cell instead of two.
    expect(outcome.providerCallsMade).toBe(45);
    expect(calls.filter((call) => call.startsWith("GRADER:"))).toHaveLength(15);
    // EVERY grader call went to the one fixed identity — the property the whole ticket exists for.
    expect([...new Set(calls.filter((call) => call.startsWith("GRADER:")))])
      .toEqual(["GRADER:acceptance:claude-cli"]);
    expect(outcome.cells).toHaveLength(15);
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
  test("N2: four identities and three arms — one fixed grader, so neither arm nor RUN is degraded", () => {
    // V-S11-GRADER dissolved the contradiction this test was written for. The r2 summary could
    // report every arm clean while the PANELS differed; with a fixed grader the panels cannot
    // differ, so `anyDegraded` and the varies-by-config mark both go quiet — and they must go
    // quiet TOGETHER, which is the invariant codex r2 N2 actually protects.
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: FOUR_IDENTITY_REFS,
      candidateConfigCount: 3
    });
    const assignments = configs.map((candidate) => assignBlindGraders({
      candidate,
      fixedGrader: fixedFrom(FOUR_IDENTITY),
      graderPool: FOUR_IDENTITY,
      gradersPerCell: 1
    }));
    const summary = summariseGradingProvenance(assignments);
    expect(summary.marks).not.toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
    expect(summary.marks).not.toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
    expect(summary.fixedGraderRoleRef).toBe("acceptance:claude-cli");
    expect(summary.anyDegraded).toBe(false);
  });

  test("B2: arms graded by different identities are NOT comparable, and the verdict says why", () => {
    // V-S11-GRADER: reached only by seating different graders, which is the deployment that
    // cannot supply a fixed one.
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const verdict = assessComparability(configs.map((candidate, index) => assignBlindGraders({
      candidate,
      fixedGrader: index === 2
        ? { providerRef: "acceptance:codex-cli", maker: "OpenAI" }
        : { providerRef: "acceptance:grok-cli", maker: "xAI" },
      graderPool: ACCEPTANCE_SEALED,
      gradersPerCell: 1
    })));
    expect(verdict.comparable).toBe(false);
    expect(verdict.reason).toBe(
      "the arms were graded by different identities, so an arm's mean confounds the grader with "
      + "the role configuration and no cross-arm ranking can be inferred"
    );
  });

  test("B2: one FIXED grader across every arm IS comparable", () => {
    const configs = arms({
      sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
      configuredProviderRefs: ["a-cli", "b-cli"],
      candidateConfigCount: 2
    });
    const verdict = assessComparability(configs.map((candidate) => assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "g1-cli", maker: "G" },
      graderPool: SHARED_PANEL_POOL,
      gradersPerCell: 1
    })));
    expect(verdict.comparable).toBe(true);
    expect(verdict.reason).toBe("every arm was graded by the same fixed grader");
  });

  test("B2: a single arm is not a comparison — and that raises NO non-commensurability mark", () => {
    const assignment = assignBlindGraders({
      candidate: { configId: "C1", synthesizerRoleRef: "solo", evaluatorRoleRef: "solo", baseline: true, rolesDistinct: false },
      fixedGrader: { providerRef: "solo", maker: "Solo" },
      graderPool: [{ providerRef: "solo", maker: "Solo" }],
      gradersPerCell: 1
    });
    const verdict = assessComparability([assignment]);
    expect(verdict.comparable).toBe(false);
    expect(verdict.reason).toBe("a single arm is not a comparison");
    // V-S11-GRADER: the mark fires ONLY when one grader could not cover every arm. Here it did,
    // so "not a comparison" is stated by the verdict and marks nothing.
    expect(summariseGradingProvenance([assignment]).marks)
      .not.toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
  });

  test("B2: ZERO arms means no grader stood in front of anything, and the mark fires", () => {
    const verdict = assessComparability([]);
    expect(verdict.comparable).toBe(false);
    expect(verdict.reason).toBe("no arm was seated with a grader");
    expect(summariseGradingProvenance([]).marks).toEqual([CROSS_ARM_COMPARISON_UNAVAILABLE_MARK]);
    expect(summariseGradingProvenance([]).fixedGraderRoleRef).toBe(null);
  });

  test("B3: the run declares model identity UNKNOWN and instance freshness UNVERIFIED", () => {
    const configs = arms({
      sealed: SEALED_CONTROLS,
      configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
      candidateConfigCount: 3
    });
    const summary = summariseGradingProvenance(configs.map((candidate) => assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "acceptance:grok-cli", maker: "xAI" },
      graderPool: ACCEPTANCE_SEALED,
      gradersPerCell: 1
    })));
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
    // wrong outcome B3 names, which provider-ref equality reports as "not the same model". The
    // grader is passed EXPLICITLY here (V-S11-GRADER): which identity is fixed is the deployment's
    // fact, and this test is about what the harness can OBSERVE about it, not about the choice.
    const withGamma = assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "gamma-cli", maker: "G", model: "shared-model-1" },
      graderPool: sameModelPool.filter((identity) => identity.providerRef !== "delta-cli"),
      gradersPerCell: 1
    });
    expect(withGamma.sameProviderIdentityAsCandidate).toBe(false);
    expect(withGamma.sameModelAsCandidate).toBe("YES");

    const withDelta = assignBlindGraders({
      candidate,
      fixedGrader: { providerRef: "delta-cli", maker: "D", model: "distinct-model" },
      graderPool: sameModelPool.filter((identity) => identity.providerRef !== "gamma-cli"),
      gradersPerCell: 1
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
  // A COMPARABLE deployment: both arms are graded by the one fixed identity g1, so grader effects
  // are constant across arms and the means measure the role configuration (V-S11-GRADER).
  const comparableConfigs = arms({
    sealed: { ...SEALED_CONTROLS, synthesizerRoleRef: "a-cli", evaluatorRoleRef: "b-cli" },
    configuredProviderRefs: ["a-cli", "b-cli"],
    candidateConfigCount: 2
  });
  const comparableAssignments = comparableConfigs.map((candidate) => assignBlindGraders({
    candidate,
    fixedGrader: { providerRef: "g1-cli", maker: "G" },
    graderPool: SHARED_PANEL_POOL,
    gradersPerCell: 1
  }));

  // The deployment that could NOT supply one grader for every arm: each arm drew a different
  // identity. Under V-S11-GRADER this is the only route to a non-comparable table.
  const sealedThreeConfigs = arms({
    sealed: SEALED_CONTROLS,
    configuredProviderRefs: ACCEPTANCE_SEALED_REFS,
    candidateConfigCount: 3
  });
  const sealedThreeAssignments = sealedThreeConfigs.map((candidate, index) => assignBlindGraders({
    candidate,
    fixedGrader: index === 2
      ? { providerRef: "acceptance:codex-cli", maker: "OpenAI" }
      : { providerRef: "acceptance:grok-cli", maker: "xAI" },
    graderPool: ACCEPTANCE_SEALED,
    gradersPerCell: 1
  }));

  // The same three arms as the deployment ACTUALLY runs them now: one fixed grader everywhere.
  const fixedThreeAssignments = sealedThreeConfigs.map((candidate) => assignBlindGraders({
    candidate,
    fixedGrader: fixedFrom(ACCEPTANCE_SEALED),
    graderPool: ACCEPTANCE_SEALED,
    gradersPerCell: 1
  }));

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
        // V-S11-GRADER: both observations come from the ONE fixed grader, across two debates.
        { configId: "C1", debateRef: "run-1", graderRoleRef: "g1-cli", score: 4 },
        { configId: "C1", debateRef: "run-2", graderRoleRef: "g1-cli", score: 2 }
      ]
    });
    expect(table.find((line) => line.startsWith("| C1 "))).toBe(
      "| C1 | a-cli | b-cli | baseline (currently sealed) | 3.00 | 2 from 1 grader |"
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
      + "identities, so an arm's mean confounds the grader with the role configuration and no "
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
    // what is KNOWN. V-S11-GRADER changes WHAT is recorded, not WHETHER: one grader per row, the
    // same one in every row, and its relation to that arm stated rather than engineered away.
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: fixedThreeAssignments,
      cells: []
    });
    expect(table.filter((line) => line.startsWith("| prov C"))).toEqual([
      "| prov C1 | synthesizer acceptance:codex-cli | evaluator acceptance:claude-cli "
        + "| graders acceptance:claude-cli (CANDIDATE_EVALUATOR) "
        + "| same provider identity yes | same model YES | same maker YES |",
      "| prov C2 | synthesizer acceptance:claude-cli | evaluator acceptance:codex-cli "
        + "| graders acceptance:claude-cli (CANDIDATE_SYNTHESIZER) "
        + "| same provider identity yes | same model YES | same maker YES |",
      "| prov C3 | synthesizer acceptance:claude-cli | evaluator acceptance:grok-cli "
        + "| graders acceptance:claude-cli (CANDIDATE_SYNTHESIZER) "
        + "| same provider identity yes | same model YES | same maker YES |"
    ]);
    // Disclosed AS FIXED in the artifact a reader compares rows in.
    expect(table).toContain(
      "FIXED GRADER: acceptance:claude-cli graded every arm — the same identity across rows, "
      + "which is what makes these arms comparable at all."
    );
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

  test("the table carries every condition mark the run raised, in order", () => {
    // V-S11-GRADER: the umbrella and the repeat mark no longer exist; a deployment that could not
    // seat one grader still raises both non-commensurability marks, and they are what a reader
    // needs to see before comparing anything.
    const table = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: sealedThreeAssignments,
      cells: []
    });
    expect(table).toContain(
      `CONDITION MARKS: ${MODEL_IDENTITY_UNKNOWN_MARK}, ${INSTANCE_FRESHNESS_UNVERIFIED_MARK}, `
      + `${GRADER_SET_VARIES_BY_CONFIG_MARK}, ${CROSS_ARM_COMPARISON_UNAVAILABLE_MARK}`
    );
    // …and a run that DID seat one grader for every arm says so instead.
    const fixedTable = renderComparisonTable({
      configs: sealedThreeConfigs,
      assignments: fixedThreeAssignments,
      cells: []
    });
    expect(fixedTable).toContain(
      `CONDITION MARKS: ${GRADER_IS_CANDIDATE_EVALUATOR_MARK}, `
      + `${GRADER_SHARES_CANDIDATE_FAMILY_MARK}, ${GRADER_IS_CANDIDATE_SYNTHESIZER_MARK}, `
      + `${INSTANCE_FRESHNESS_UNVERIFIED_MARK}`
    );
    expect(fixedTable.some((line) => line.includes(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK))).toBe(false);
  });
});

describe("W1 · ONE FIXED grader for every arm (V-S11-GRADER)", () => {
  /**
   * V-S11-GRADER (2026-09-03): "The grading should always be done by the same model, so they are
   * correctly measured against each other." The grader is FIXED across every arm — that constant
   * is what makes the scores commensurable — and a grader sharing an identity with the candidate
   * is NOT contamination, because each seat is a fresh instance that never learns who produced
   * what it reads. The exclusion ranking and the repeat-before-candidate rule are superseded.
   */

  test("THREE candidate configs, ONE configured grader: every arm is graded by that identity", async () => {
    const { dependencies, emitted } = spyingDependencies({
      readConfiguredProviders: async () => ACCEPTANCE_SEALED
    });
    const outcome = await runEvalHarness({ approved: false }, dependencies);

    expect(outcome.configs).toHaveLength(3);
    // The constant: one identity across all three arms, chosen without looking at the candidate.
    expect(outcome.gradingProvenance.graderSetsByConfig).toEqual({
      C1: ["acceptance:claude-cli"],
      C2: ["acceptance:claude-cli"],
      C3: ["acceptance:claude-cli"]
    });
    // Fixed grader ⇒ commensurable arms: neither non-commensurability mark may fire.
    expect(outcome.gradingProvenance.comparability.comparable).toBe(true);
    expect(outcome.gradingProvenance.marks).not.toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
    expect(outcome.gradingProvenance.marks).not.toContain(GRADER_SET_VARIES_BY_CONFIG_MARK);
    // Disclosed AS FIXED, before the approval gate: a reader comparing arms must know the constant.
    const fixedLine = "GRADER FIXED: acceptance:claude-cli grades every arm — the constant that "
      + "makes the arms commensurable (V-S11-GRADER)";
    expect(emitted).toContain(fixedLine);
    const gateIndex = emitted.findIndex((line) => line.includes("EVAL_HARNESS_NOT_APPROVED"));
    expect(emitted.indexOf(fixedLine)).toBeLessThan(gateIndex);
  });

  test("ADMITTED boundary: one grader supplied — it is fixed, and its relation to each arm is disclosed", async () => {
    const { dependencies } = spyingDependencies({
      readSynthesisRoleControls: async () => ({
        ...SEALED_CONTROLS, synthesizerRoleRef: "solo", evaluatorRoleRef: "solo"
      }),
      readConfiguredProviders: async () => [{ providerRef: "solo", maker: "Solo" }]
    });
    const outcome = await runEvalHarness({ approved: false }, dependencies);
    expect(outcome.assignments).toHaveLength(1);
    expect(outcome.assignments[0]?.seats.map((seat) => seat.graderRoleRef)).toEqual(["solo"]);
    // Shared identity is lawful under V-S11-GRADER, and still RECORDED (V-S11-1's disclosure law).
    expect(outcome.assignments[0]?.sameProviderIdentityAsCandidate).toBe(true);
    expect(outcome.assignments[0]?.sameModelAsCandidate).toBe("YES");
    expect(outcome.assignments[0]?.sameMakerAsCandidate).toBe("YES");
    expect(outcome.gradingProvenance.marks).not.toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
  });

  test("REJECTED boundary: ZERO graders raises the non-commensurability mark and refuses to project", async () => {
    const { dependencies, calls } = spyingDependencies({
      readConfiguredProviders: async () => []
    });
    const outcome = await runEvalHarness({ approved: true }, dependencies);
    expect(outcome.decision).toBe("REFUSED_MATRIX_UNSATISFIABLE");
    expect(calls).toEqual([]);
    expect(outcome.providerCallsMade).toBe(0);
    // The deployment could not put ONE grader in front of every arm — exactly the case the mark
    // is retained for, and the only case it may fire in.
    expect(outcome.gradingProvenance.marks).toContain(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
    expect(outcome.table.some((line) => line.includes("mean blind score"))).toBe(false);
    expect(outcome.table.some((line) => line.startsWith("FIXED GRADER:"))).toBe(false);
  });

  test("the projection reflects the NEW call count: one grader call per cell, disclosed as fixed", async () => {
    const { dependencies, emitted } = spyingDependencies();
    await runEvalHarness({ approved: false }, dependencies);
    // 5 debates x 3 configs x 2 rounds = 30 synthesizer + 30 evaluator; 15 cells x 1 grader = 15.
    expect(emitted).toContain("call breakdown: 30 synthesizer + 30 evaluator + 15 grader");
    expect(emitted).toContain("projected provider calls (nominal): 75");
    expect(emitted).toContain("projected provider calls (worst case): 150");
    expect(emitted).toContain(
      "blind graders per cell: 1 (ONE FIXED identity grades every arm; a grader that shares an "
      + "identity, model or maker with a candidate is disclosed, never excluded)"
    );
  });
});
