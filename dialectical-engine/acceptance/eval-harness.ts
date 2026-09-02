import { TypedDomainError } from "@debateai/kernel";

/**
 * T15 · the synthesizer/evaluator role EVAL HARNESS (goal 309-320, rulings
 * S6-4 / S6-1).
 *
 * THE SPEND GATE IS THE POINT. The goal makes this run an important-operation
 * gate: "projected call count printed BEFORE any provider call and the run
 * proceeds only on explicit V approval". Everything in this module before
 * `applyApprovalGate` is free — register reads, fixture reads, arithmetic — and
 * the gate is the LAST thing that happens before the first provider call, so a
 * refusal cannot leave spend behind it.
 *
 * WHAT THIS MODULE OWNS: the matrix, the projection, the blind grader
 * assignment, the refusals, and the comparison table T15b routes to V.
 *
 * WHAT IT DOES NOT OWN: the synthesizer and evaluator request shapes and the
 * evaluator loop. Those are T9's (`packages/serve/src/synthesis.ts`, lane/s07,
 * unmerged at the time of writing). They are reached through the narrow
 * `SynthesisSurface` port below and are NEVER reimplemented here — a harness
 * that grades its own copy of the roles grades nothing that ships. When the
 * port cannot be resolved the harness refuses loudly rather than grading a
 * substitute (J24's principle: identity, never silent substitution).
 */

/* ------------------------------------------------------------------ matrix */

/**
 * The goal's EXACT matrix, quoted: "5 recorded debates (reused fixtures from
 * acceptance runs — no new debate generation) × 3 candidate role configs × ≤2
 * evaluator rounds; graded blind by 2 graders that are never the candidate".
 * These four numbers are the task text, not a preference, and the harness
 * refuses rather than running a smaller matrix.
 */
export const EVAL_HARNESS_MATRIX = Object.freeze({
  recordedDebateCount: 5,
  candidateConfigCount: 3,
  evaluatorRoundCap: 2,
  gradersPerCell: 2
});

/**
 * The goal: "per-call max attempts + token ceiling stated in the harness
 * config". Stated here, and here only.
 *
 * `maxAttemptsPerCall = 2` — the deployment seals 3 attempts for its own organs
 * (JUDGE / COMPOSER / CONFORMANCE, `apps/runner/src/dev-deployment-register.ts`
 * and `acceptance/seed-register.ts`). An eval is not production: 2 absorbs one
 * transport failure and halves the worst case against the deployment's bound.
 * `tokenCeilingPerCall = 2048` — the deployment's own sealed organ ceiling,
 * matched exactly rather than invented, so a graded candidate is written under
 * the ceiling the shipped organs write under.
 */
export const EVAL_HARNESS_SPEND = Object.freeze({
  maxAttemptsPerCall: 2,
  tokenCeilingPerCall: 2_048
});

/* -------------------------------------------------------------- projection */

export interface CallProjectionInput {
  readonly recordedDebateCount: number;
  readonly candidateConfigCount: number;
  readonly evaluatorRoundCap: number;
  readonly gradersPerCell: number;
  readonly maxAttemptsPerCall: number;
  readonly tokenCeilingPerCall: number;
}

export interface CallProjection extends CallProjectionInput {
  readonly synthesizerCalls: number;
  readonly evaluatorCalls: number;
  readonly graderCalls: number;
  readonly nominalCalls: number;
  readonly worstCaseCalls: number;
  readonly worstCaseTokenCeiling: number;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypedDomainError("EVAL_PROJECTION_INPUT_INVALID", `${label} must be a positive integer`);
  }
  return value;
}

/**
 * One cell is (debate x config). Each of its evaluator rounds costs one
 * synthesizer call and one evaluator call; each cell is then graded once per
 * blind grader. `nominal` assumes every call succeeds on its first attempt;
 * `worst case` assumes every call exhausts its attempts. V approves the worst
 * case, so a run can only ever cost LESS than the number printed.
 */
export function projectCallCount(input: CallProjectionInput): CallProjection {
  const debates = requirePositiveInteger(input.recordedDebateCount, "recordedDebateCount");
  const configs = requirePositiveInteger(input.candidateConfigCount, "candidateConfigCount");
  const rounds = requirePositiveInteger(input.evaluatorRoundCap, "evaluatorRoundCap");
  const graders = requirePositiveInteger(input.gradersPerCell, "gradersPerCell");
  const attempts = requirePositiveInteger(input.maxAttemptsPerCall, "maxAttemptsPerCall");
  const tokens = requirePositiveInteger(input.tokenCeilingPerCall, "tokenCeilingPerCall");
  const cells = debates * configs;
  const synthesizerCalls = cells * rounds;
  const evaluatorCalls = cells * rounds;
  const graderCalls = cells * graders;
  const nominalCalls = synthesizerCalls + evaluatorCalls + graderCalls;
  const worstCaseCalls = nominalCalls * attempts;
  return Object.freeze({
    ...input,
    synthesizerCalls,
    evaluatorCalls,
    graderCalls,
    nominalCalls,
    worstCaseCalls,
    worstCaseTokenCeiling: worstCaseCalls * tokens
  });
}

/**
 * The projected-count OUTPUT the DoD names. Eight lines, in this order, printed
 * before anything else the harness does. The order is load-bearing: the count
 * V approves must be on screen before any code path can reach a provider.
 */
export function renderProjection(projection: CallProjection): readonly string[] {
  return Object.freeze([
    `matrix: ${String(projection.recordedDebateCount)} recorded debates`
      + ` x ${String(projection.candidateConfigCount)} candidate role configs`
      + ` x <=${String(projection.evaluatorRoundCap)} evaluator rounds`,
    `blind graders per cell: ${String(projection.gradersPerCell)}`
      + " (independent of the candidate where the deployment allows; any shortfall is disclosed below)",
    `per-call max attempts: ${String(projection.maxAttemptsPerCall)}`,
    `per-call token ceiling: ${String(projection.tokenCeilingPerCall)}`,
    `call breakdown: ${String(projection.synthesizerCalls)} synthesizer`
      + ` + ${String(projection.evaluatorCalls)} evaluator`
      + ` + ${String(projection.graderCalls)} grader`,
    `projected provider calls (nominal): ${String(projection.nominalCalls)}`,
    `projected provider calls (worst case): ${String(projection.worstCaseCalls)}`,
    `projected token ceiling (worst case): ${String(projection.worstCaseTokenCeiling)}`
  ]);
}

/**
 * The evaluator loop bound is a SEALED T16 row (J8), and the goal caps this
 * eval's matrix at 2 rounds. The harness takes the LOWER of the two: it never
 * runs more rounds than the deployment sealed, and never more than the goal
 * authorised for the eval.
 */
export function resolveRoundCap(sealedMaxRounds: number): number {
  requirePositiveInteger(sealedMaxRounds, "evaluatorLoopMaxRounds");
  return Math.min(sealedMaxRounds, EVAL_HARNESS_MATRIX.evaluatorRoundCap);
}

/* --------------------------------------------------------- candidate roles */

export interface SealedSynthesisRoleControls {
  readonly registerVersion: number;
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly evaluatorLoopMaxRounds: number;
}

export interface CandidateRoleConfig {
  readonly configId: string;
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  /** True for the pair currently sealed in the register — the control arm. */
  readonly baseline: boolean;
  /** False when this arm's synthesizer and evaluator are the SAME identity. */
  readonly rolesDistinct: boolean;
}

export const CANDIDATE_SET_REDUCED_MARK = "CANDIDATE-SET-REDUCED" as const;
export const CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK = "CANDIDATE-ARM-ROLES-NOT-DISTINCT" as const;

export interface CandidateSet {
  readonly configs: readonly CandidateRoleConfig[];
  readonly requestedCount: number;
  /** True when the deployment cannot express as many arms as the goal's matrix asks for. */
  readonly reduced: boolean;
  readonly marks: readonly string[];
  readonly disclosure: string;
}

/**
 * The MAXIMAL MEANINGFUL candidate set the deployment can express.
 *
 * V-S11-1 is GENERAL POLICY, not a grader-pool waiver: "this strict rule should not be followed
 * to the bone... aim for the best possible outcome for a debate GIVEN THE CONSTRAINTS", and it
 * applies "also for other places where this rule is in place". A capacity shortfall therefore
 * degrades with disclosure HERE too. The r2 filing refused instead, and the refusal sat UPSTREAM
 * of the corrected grader logic, so a one-model deployment never reached it (codex r2 B1).
 *
 * Order: the sealed pair first (the control arm), then distinct-ref ordered pairs, then same-ref
 * arms — which goal 91-93 makes LAWFUL and J7 warns about rather than refusing. Sorted, so one
 * deployment always yields the same arms.
 *
 * TWO THINGS IT WILL NOT DO. It does not fabricate duplicate arms to reach the requested count —
 * one identity yields ONE arm, and the reduction is marked. And it does not substitute for an
 * unconfigured sealed ref (J24): that is a broken seal, not a capacity limit.
 */
export function deriveCandidateSet(input: {
  readonly sealed: SealedSynthesisRoleControls;
  readonly configuredProviderRefs: readonly string[];
  readonly candidateConfigCount: number;
}): CandidateSet {
  const configured = [...new Set(input.configuredProviderRefs)].sort();
  if (configured.length === 0) {
    throw new TypedDomainError(
      "EVAL_CANDIDATE_POOL_EMPTY",
      "This deployment configures no provider identity, so there is no arm to run and nothing "
      + "to degrade to"
    );
  }
  for (const [label, ref] of [
    ["synthesizerRoleRef", input.sealed.synthesizerRoleRef],
    ["evaluatorRoleRef", input.sealed.evaluatorRoleRef]
  ] as const) {
    if (!configured.includes(ref)) {
      throw new TypedDomainError(
        "EVAL_ROLE_REF_NOT_CONFIGURED",
        `The sealed ${label} "${ref}" is not one of this deployment's configured provider identities`
      );
    }
  }
  const make = (synthesizerRoleRef: string, evaluatorRoleRef: string, baseline: boolean, index: number)
    : CandidateRoleConfig => Object.freeze({
      configId: `C${String(index)}`,
      synthesizerRoleRef,
      evaluatorRoleRef,
      baseline,
      rolesDistinct: synthesizerRoleRef !== evaluatorRoleRef
    });

  const baseline = make(input.sealed.synthesizerRoleRef, input.sealed.evaluatorRoleRef, true, 1);
  const configs: CandidateRoleConfig[] = [baseline];
  const taken = new Set([`${baseline.synthesizerRoleRef}>${baseline.evaluatorRoleRef}`]);
  // Distinct-ref arms first, then same-ref arms: a same-ref arm is the degraded shape.
  for (const wantDistinct of [true, false]) {
    for (const synthesizerRoleRef of configured) {
      for (const evaluatorRoleRef of configured) {
        if (configs.length >= input.candidateConfigCount) break;
        if ((synthesizerRoleRef !== evaluatorRoleRef) !== wantDistinct) continue;
        const key = `${synthesizerRoleRef}>${evaluatorRoleRef}`;
        if (taken.has(key)) continue;
        taken.add(key);
        configs.push(make(synthesizerRoleRef, evaluatorRoleRef, false, configs.length + 1));
      }
    }
  }
  const reduced = configs.length < input.candidateConfigCount;
  const marks: string[] = [];
  if (reduced) marks.push(CANDIDATE_SET_REDUCED_MARK);
  if (configs.some((config) => !config.rolesDistinct)) marks.push(CANDIDATE_ARM_ROLES_NOT_DISTINCT_MARK);
  const identityWord = configured.length === 1 ? "identity" : "identities";
  const armWord = configs.length === 1 ? "arm" : "arms";
  const disclosure = reduced
    ? `${String(configured.length)} configured provider ${identityWord} yields `
      + `${String(configs.length)} candidate ${armWord}; the goal's matrix asks for `
      + `${String(input.candidateConfigCount)}. The comparison runs on what the deployment can `
      + "express and no arm is duplicated to reach the requested count."
    : `${String(configs.length)} candidate ${armWord} from `
      + `${String(configured.length)} configured provider ${identityWord}`;
  return Object.freeze({
    configs: Object.freeze(configs),
    requestedCount: input.candidateConfigCount,
    reduced,
    marks: Object.freeze(marks),
    disclosure
  });
}

/* ----------------------------------------------------------- blind grading */

/**
 * V RULING V-S11-1 (2026-09-03) — BEST OUTCOME UNDER CONSTRAINTS, NOT A RULE
 * FOLLOWED TO THE BONE. This block is the policy, not a waiver for one
 * deployment.
 *
 * A short grader pool is a DEGRADATION TO DISCLOSE, never a stop. If only one
 * model is available the whole debate runs on that one model: a legitimate
 * configuration, not a failure state. Each seat is a NEW INSTANCE with its own
 * role-specific prompt — never one session carrying several roles — and the
 * same-model provenance is RECORDED rather than hidden. "Graded by another AI"
 * stays the preference, satisfied where the deployment allows; "if possible" is
 * part of the rule, not an escape from it. The shape is V-ROLE-1 / J24's: a
 * DISCLOSED substitution is acceptable, a silent one never is, and goal line 26
 * requires every degradation to emit a visible condition mark.
 */

export const BLIND_GRADING_DEGRADED_MARK = "BLIND-GRADING-DEGRADED" as const;
export const GRADER_REPEATS_IDENTITY_MARK = "GRADER-REPEATS-IDENTITY" as const;
export const GRADER_IS_CANDIDATE_EVALUATOR_MARK = "GRADER-IS-CANDIDATE-EVALUATOR" as const;
export const GRADER_IS_CANDIDATE_SYNTHESIZER_MARK = "GRADER-IS-CANDIDATE-SYNTHESIZER" as const;
export const GRADER_SHARES_CANDIDATE_FAMILY_MARK = "GRADER-SHARES-CANDIDATE-FAMILY" as const;
export const GRADER_SET_VARIES_BY_CONFIG_MARK = "GRADER-SET-VARIES-BY-CONFIG" as const;
export const CROSS_ARM_COMPARISON_UNAVAILABLE_MARK = "CROSS-ARM-COMPARISON-UNAVAILABLE" as const;
export const MODEL_IDENTITY_UNKNOWN_MARK = "MODEL-IDENTITY-UNKNOWN" as const;
export const INSTANCE_FRESHNESS_UNVERIFIED_MARK = "INSTANCE-FRESHNESS-UNVERIFIED" as const;

/**
 * A provenance fact the artifact may state. UNKNOWN is a first-class answer, not a failure:
 * V-S11-1 requires same-model provenance to be RECORDED, and recording a fact you cannot
 * observe is not recording it (codex r2 B3).
 */
export type ProvenanceFact = "YES" | "NO" | "UNKNOWN";

/**
 * A configured provider identity. `maker` comes from the sealed configuredProviderSet row.
 * `model` is ABSENT until an adapter reports the model it actually called — provider identity,
 * maker family, exact model and session freshness are FOUR different facts, and the register
 * carries only the first two.
 */
export interface ConfiguredProviderIdentity {
  readonly providerRef: string;
  readonly maker: string;
  readonly model?: string | undefined;
}

/**
 * What a per-call adapter must return before this harness may state instance freshness or exact
 * model identity as known. Named here so the adapter has a checklist rather than a paragraph.
 */
export const EVAL_PROVENANCE_ADAPTER_REQUIREMENTS: readonly string[] = Object.freeze([
  "opens a NEW session per call",
  "carries an explicit stage-specific prompt for the seat it is filling",
  "returns the OBSERVED provider, model and model version",
  "returns a per-call instance/session reference that is recorded with the grade"
]);

export const EVAL_PROVENANCE_UNSETTLED_NOTICE =
  "INSTANCE FRESHNESS AND EXACT MODEL IDENTITY ARE NOT ESTABLISHED BY THIS ARTIFACT. Settling "
  + "them needs an adapter that opens a new session per call, carries an explicit stage "
  + "prompt, and returns the observed provider, model, version and a per-call instance "
  + "reference. Until it exists these facts are recorded as UNKNOWN, never as satisfied.";

/** How a seated grader stands to the config whose statement it is grading. */
export type GraderRelation = "INDEPENDENT" | "CANDIDATE_EVALUATOR" | "CANDIDATE_SYNTHESIZER";

export interface GraderSeat {
  readonly graderRoleRef: string;
  /**
   * A SET, because one identity can hold both candidate roles. The scalar form silently dropped
   * `CANDIDATE_EVALUATOR` on exactly the one-model deployment V legitimised (codex r2 B1).
   */
  readonly relations: readonly GraderRelation[];
  /** True when an earlier seat in the SAME cell already used this identity. */
  readonly repeatOfEarlierSeat: boolean;
}

export interface BlindGradingAssignment {
  readonly configId: string;
  readonly seats: readonly GraderSeat[];
  readonly degraded: boolean;
  readonly marks: readonly string[];
  /** One sentence naming exactly what was compromised and why. */
  readonly disclosure: string;
  /** KNOWN: a grader seat uses one of the candidate's own provider refs. */
  readonly sameProviderIdentityAsCandidate: boolean;
  /** YES only when observable — same ref, or two refs whose models are both reported. */
  readonly sameModelAsCandidate: ProvenanceFact;
  readonly sameMakerAsCandidate: ProvenanceFact;
}

function relationsOf(ref: string, candidate: CandidateRoleConfig): readonly GraderRelation[] {
  const relations: GraderRelation[] = [];
  if (ref === candidate.evaluatorRoleRef) relations.push("CANDIDATE_EVALUATOR");
  if (ref === candidate.synthesizerRoleRef) relations.push("CANDIDATE_SYNTHESIZER");
  return Object.freeze(relations.length === 0 ? ["INDEPENDENT"] : relations);
}

/**
 * Seats `gradersPerCell` graders, best available first.
 *
 * The ranking, and the reason it is this ranking:
 *   1. INDEPENDENT identities — neither of the candidate's refs. Exhaust these FIRST, and keep
 *      drawing from them by REPEATING one rather than reaching for a candidate ref: a repeat
 *      still satisfies "graded by another AI" for both seats, which a candidate ref does not.
 *   2. The candidate's EVALUATOR — it shaped the statement through its objections but did not
 *      author it.
 *   3. The candidate's SYNTHESIZER — the author of the statement under grading, so it is last.
 *   4. An identity holding BOTH candidate roles is ranked below either alone.
 *
 * Only an EMPTY pool refuses: that is an absence, not a degradation.
 *
 * NOTE ON WHAT THIS DOES NOT FIX. Preferring the complement makes grader identity a function of
 * the arm, which is a CONFOUND for the cross-arm comparison. That is not repaired here — it is
 * detected by `assessComparability` and the table then refuses to rank (codex r2 B2).
 */
export function assignBlindGraders(input: {
  readonly candidate: CandidateRoleConfig;
  readonly graderPool: readonly ConfiguredProviderIdentity[];
  readonly gradersPerCell: number;
}): BlindGradingAssignment {
  const pool = [...new Map(input.graderPool.map((identity) => [identity.providerRef, identity])).values()];
  if (pool.length === 0) {
    throw new TypedDomainError(
      "EVAL_BLIND_GRADER_POOL_EMPTY",
      `Config ${input.candidate.configId} has no configured provider identity to grade with; `
      + "a degradation needs something to degrade to"
    );
  }
  const rankOf = (ref: string): number => {
    const relations = relationsOf(ref, input.candidate);
    if (relations.length === 2) return 3;
    if (relations[0] === "CANDIDATE_SYNTHESIZER") return 2;
    if (relations[0] === "CANDIDATE_EVALUATOR") return 1;
    return 0;
  };
  const independent = pool
    .filter((identity) => rankOf(identity.providerRef) === 0)
    .sort((left, right) => left.providerRef.localeCompare(right.providerRef));
  const ordered = independent.length > 0
    ? independent
    : [...pool].sort((left, right) =>
        rankOf(left.providerRef) - rankOf(right.providerRef)
        || left.providerRef.localeCompare(right.providerRef));

  const seats: GraderSeat[] = [];
  const used = new Set<string>();
  for (let seat = 0; seat < input.gradersPerCell; seat += 1) {
    const identity = ordered[seat % ordered.length];
    if (identity === undefined) break;
    seats.push(Object.freeze({
      graderRoleRef: identity.providerRef,
      relations: relationsOf(identity.providerRef, input.candidate),
      repeatOfEarlierSeat: used.has(identity.providerRef)
    }));
    used.add(identity.providerRef);
  }

  const identityOf = (ref: string): ConfiguredProviderIdentity | undefined =>
    pool.find((entry) => entry.providerRef === ref);
  const candidateRefs = [input.candidate.synthesizerRoleRef, input.candidate.evaluatorRoleRef];
  const candidateMakers = new Set(candidateRefs.map((ref) => identityOf(ref)?.maker)
    .filter((maker): maker is string => maker !== undefined));
  const candidateModels = candidateRefs.map((ref) => identityOf(ref)?.model);

  const sameProviderIdentityAsCandidate = seats.some((seat) => seat.relations[0] !== "INDEPENDENT");
  const sameMakerAsCandidate: ProvenanceFact = seats.some((seat) => {
    const maker = identityOf(seat.graderRoleRef)?.maker;
    return maker !== undefined && candidateMakers.has(maker);
  }) ? "YES" : "NO";
  // Identity equality is the one case where model equality is KNOWN without an adapter: the same
  // provider ref IS the same model. Otherwise it is knowable only if both models were reported —
  // and two DIFFERENT refs backed by the same model must never be reported as "not the same".
  const sameModelAsCandidate: ProvenanceFact = sameProviderIdentityAsCandidate
    ? "YES"
    : seats.some((seat) => {
      const model = identityOf(seat.graderRoleRef)?.model;
      return model !== undefined && candidateModels.includes(model);
    })
      ? "YES"
      : seats.every((seat) => identityOf(seat.graderRoleRef)?.model !== undefined)
        && candidateModels.every((model) => model !== undefined)
        ? "NO"
        : "UNKNOWN";

  const relationUnion = new Set(seats.flatMap((seat) => [...seat.relations]));
  const marks: string[] = [];
  if (seats.some((seat) => seat.repeatOfEarlierSeat)) marks.push(GRADER_REPEATS_IDENTITY_MARK);
  if (relationUnion.has("CANDIDATE_EVALUATOR")) marks.push(GRADER_IS_CANDIDATE_EVALUATOR_MARK);
  if (relationUnion.has("CANDIDATE_SYNTHESIZER")) marks.push(GRADER_IS_CANDIDATE_SYNTHESIZER_MARK);
  if (sameMakerAsCandidate === "YES") marks.push(GRADER_SHARES_CANDIDATE_FAMILY_MARK);
  const degraded = marks.length > 0;

  const distinct = new Set(seats.map((seat) => seat.graderRoleRef)).size;
  const freshness = " Instance freshness is UNVERIFIED: no per-call instance reference is recorded.";
  const disclosure = !degraded
    ? `${input.candidate.configId}: ${String(seats.length)} grader seats filled from `
      + `${String(distinct)} distinct identities, none of them the candidate's`
    : sameProviderIdentityAsCandidate
      ? `${input.candidate.configId}: the candidate's own identities grade it — `
        + `${seats.map((seat) => `${seat.graderRoleRef} as ${seat.relations.join("+")}`).join(", ")}; `
        + "the grade is not independent of the configuration it scores." + freshness
      : `${input.candidate.configId}: ${String(seats.length)} grader seats filled from `
        + `${String(distinct)} distinct identity that is not the candidate's; the two observations `
        + "come from one provider identity and are not independent of each other." + freshness;
  return Object.freeze({
    configId: input.candidate.configId,
    seats: Object.freeze(seats),
    degraded,
    marks: Object.freeze(degraded ? [BLIND_GRADING_DEGRADED_MARK, ...marks] : []),
    disclosure,
    sameProviderIdentityAsCandidate,
    sameModelAsCandidate,
    sameMakerAsCandidate
  });
}

/**
 * B2: whether the arms can be compared at all. A pooled mean is only a role measurement when
 * every arm faced the SAME panel; otherwise the arm's mean carries the grader's effect and the
 * role configuration's effect summed together, and no amount of disclosure separates them.
 */
export interface ComparabilityVerdict {
  readonly comparable: boolean;
  readonly reason: string;
}

export function assessComparability(
  assignments: readonly BlindGradingAssignment[]
): ComparabilityVerdict {
  if (assignments.length < 2) {
    return Object.freeze({ comparable: false, reason: "a single arm is not a comparison" });
  }
  const signatures = new Set(assignments.map((assignment) =>
    assignment.seats.map((seat) => seat.graderRoleRef).sort().join("|")));
  if (signatures.size > 1) {
    return Object.freeze({
      comparable: false,
      reason: "the arms were graded by different panels, so an arm's mean confounds the grader "
        + "with the role configuration and no cross-arm ranking can be inferred"
    });
  }
  return Object.freeze({ comparable: true, reason: "every arm faced the same panel" });
}

export interface GradingProvenanceSummary {
  readonly graderSetsByConfig: Readonly<Record<string, readonly string[]>>;
  readonly marks: readonly string[];
  readonly anyDegraded: boolean;
  readonly disclosures: readonly string[];
  readonly comparability: ComparabilityVerdict;
}

/**
 * Run-level provenance.
 *
 * `anyDegraded` counts RUN-LEVEL degradation too. With four identities and three arms every
 * assignment can be individually clean while the panels still differ — the r2 summary then
 * returned `anyDegraded: false` beside a degradation mark, which is a contradiction a
 * programmatic consumer would act on (codex r2 N2).
 *
 * MODEL-IDENTITY-UNKNOWN and INSTANCE-FRESHNESS-UNVERIFIED are EVIDENCE GAPS, not capacity
 * degradations: they say what this harness cannot observe, and they do not make an arm degraded.
 */
export function summariseGradingProvenance(
  assignments: readonly BlindGradingAssignment[]
): GradingProvenanceSummary {
  const graderSetsByConfig: Record<string, readonly string[]> = {};
  for (const assignment of assignments) {
    graderSetsByConfig[assignment.configId] =
      Object.freeze(assignment.seats.map((seat) => seat.graderRoleRef));
  }
  const marks = [...new Set(assignments.flatMap((assignment) => [...assignment.marks]))];
  if (assignments.some((assignment) => assignment.sameModelAsCandidate === "UNKNOWN")) {
    marks.push(MODEL_IDENTITY_UNKNOWN_MARK);
  }
  if (assignments.length > 0) marks.push(INSTANCE_FRESHNESS_UNVERIFIED_MARK);
  const signatures = new Set(Object.values(graderSetsByConfig).map((refs) => [...refs].sort().join("|")));
  const panelsVary = signatures.size > 1;
  if (panelsVary) marks.push(GRADER_SET_VARIES_BY_CONFIG_MARK);
  const comparability = assessComparability(assignments);
  if (assignments.length > 0 && !comparability.comparable) marks.push(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK);
  return Object.freeze({
    graderSetsByConfig: Object.freeze(graderSetsByConfig),
    marks: Object.freeze(marks),
    anyDegraded: assignments.some((assignment) => assignment.degraded) || panelsVary,
    disclosures: Object.freeze(assignments.filter((a) => a.degraded).map((a) => a.disclosure)),
    comparability
  });
}

export const SPEND_CEILING_UNVERIFIED_MARK = "SPEND-CEILING-UNVERIFIED" as const;

export interface SpendCeilingBound {
  readonly maxAttempts: number;
  readonly tokenCeiling: number;
}

/**
 * N5 / F-S11-2: the harness states its own per-call bound, and the deployment seals one for its
 * own organs. Nothing kept them in agreement, so a later change to the sealed bound would leave
 * the eval printing and enforcing a stale ceiling while claiming it matched. The eval may be
 * TIGHTER than the deployment; it may never be looser, and an unread sealed bound is marked
 * rather than assumed.
 */
export function assertSpendCeilingWithinSealedBound(input: {
  readonly stated: SpendCeilingBound;
  readonly sealed: SpendCeilingBound | null;
}): { readonly marks: readonly string[]; readonly disclosure: string } {
  if (input.sealed === null) {
    return Object.freeze({
      marks: Object.freeze([SPEND_CEILING_UNVERIFIED_MARK]),
      disclosure: "the deployment's sealed organ bound was not read, so the harness's stated "
        + "per-call ceiling is unverified against it"
    });
  }
  for (const [label, stated, sealed] of [
    ["maxAttempts", input.stated.maxAttempts, input.sealed.maxAttempts],
    ["tokenCeiling", input.stated.tokenCeiling, input.sealed.tokenCeiling]
  ] as const) {
    if (stated > sealed) {
      throw new TypedDomainError(
        "EVAL_SPEND_CEILING_EXCEEDS_SEALED_BOUND",
        `The harness states ${label} ${String(stated)}, above the deployment's sealed organ bound `
        + `${String(sealed)}; an eval never spends more per call than the shipped organs may`
      );
    }
  }
  return Object.freeze({
    marks: Object.freeze([]),
    disclosure: "the harness's stated per-call ceiling is at or below the deployment's sealed bound"
  });
}

/**
 * The named artifacts a BLIND grader request may contain, and no others. The
 * key set IS the blindness assertion, checked in both directions the way T9
 * checks its own fresh-context requests: an extra key can leak the authoring
 * config, a missing key starves the grader. Blindness survives the V-S11-1
 * degradation unchanged — a grader may BE a candidate identity now, but it is
 * still never TOLD which config it is grading.
 */
export const GRADER_REQUEST_KEYS: readonly string[] =
  Object.freeze(["graderRoleRef", "debateRef", "candidateStatement", "criteriaKeys"]);

export interface GraderRequest {
  readonly graderRoleRef: string;
  readonly debateRef: string;
  readonly candidateStatement: string;
  readonly criteriaKeys: readonly string[];
}

export function buildGraderRequest(input: GraderRequest): GraderRequest {
  const request: GraderRequest = Object.freeze({
    graderRoleRef: input.graderRoleRef,
    debateRef: input.debateRef,
    candidateStatement: input.candidateStatement,
    criteriaKeys: Object.freeze([...input.criteriaKeys])
  });
  const actual = Object.keys(request).sort();
  const wanted = [...GRADER_REQUEST_KEYS].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) {
    throw new TypedDomainError(
      "EVAL_GRADER_REQUEST_NOT_BLIND",
      `Grader request keys ${actual.join(",")} are not exactly ${wanted.join(",")}`
    );
  }
  return request;
}

/* ------------------------------------------------------------------- ports */

/**
 * A debate the deployment ALREADY RECORDED. Every field is a column verified
 * present in `serve.answer` (migrations/0000_s00.sql:258-273) — the harness
 * reuses recorded runs and generates no debate, so a field it cannot read from
 * a recorded row has no business in this shape.
 */
export interface RecordedDebate {
  readonly runId: string;
  readonly answerId: string;
  /** `serve.answer.sealed_at_seq`, carried as text: it is a bigint. */
  readonly sealedAtSeq: string;
}

/** What the harness hands T9's synthesizer. T9 builds the real request. */
export interface HarnessSynthesizerCall {
  readonly roleRef: string;
  readonly round: number;
  readonly debateRef: string;
  readonly priorObjection: string | null;
}

export interface HarnessEvaluatorCall {
  readonly roleRef: string;
  readonly round: number;
  readonly debateRef: string;
  readonly candidateStatement: string;
}

/**
 * The narrow port onto T9's synthesis surface. `resolveSynthesisSurface`
 * returns null when that surface is not present in the checkout — the harness
 * then refuses instead of grading a stand-in.
 */
export interface SynthesisSurface {
  readonly synthesize: (call: HarnessSynthesizerCall) => Promise<{ readonly statement: string }>;
  readonly evaluate: (call: HarnessEvaluatorCall) => Promise<{
    readonly satisfied: boolean;
    readonly objection: string | null;
  }>;
}

export interface EvalHarnessDependencies {
  readonly emit: (line: string) => void;
  readonly readSynthesisRoleControls: () => Promise<SealedSynthesisRoleControls>;
  readonly readConfiguredProviders: () => Promise<readonly ConfiguredProviderIdentity[]>;
  readonly readRecordedDebates: () => Promise<readonly RecordedDebate[]>;
  readonly resolveSynthesisSurface: () => SynthesisSurface | null;
  readonly grade: (request: GraderRequest) => Promise<{ readonly score: number; readonly notes: string }>;
}

export interface GradedCell {
  readonly configId: string;
  readonly debateRef: string;
  readonly graderRoleRef: string;
  readonly score: number;
}

export type EvalHarnessDecision =
  | "PROCEEDED"
  | "REFUSED_AWAITING_APPROVAL"
  | "REFUSED_MATRIX_UNSATISFIABLE";

export interface EvalHarnessOutcome {
  readonly decision: EvalHarnessDecision;
  readonly refusalCode: string | null;
  readonly providerCallsMade: number;
  readonly configs: readonly CandidateRoleConfig[];
  readonly candidateSet: CandidateSet;
  /** The goal-matrix projection actually PRINTED and approved — the spend ceiling. */
  readonly projection: CallProjection;
  /** Recomputed from the arms the deployment can express; never larger than `projection`. */
  readonly effectiveProjection: CallProjection;
  readonly assignments: readonly BlindGradingAssignment[];
  readonly gradingProvenance: GradingProvenanceSummary;
  readonly cells: readonly GradedCell[];
  readonly table: readonly string[];
}

export interface EvalHarnessOptions {
  /** Explicit V approval of the printed projection. Nothing else unlocks spend. */
  readonly approved: boolean;
}

/** The criteria a blind grader scores. Named here so the request is closed. */
export const EVAL_GRADER_CRITERIA_KEYS: readonly string[] = Object.freeze([
  "fairnessToLosers",
  "statementLabelAgreement",
  "noOverstatement",
  "citationTracing"
]);

const EMPTY_CANDIDATE_SET: CandidateSet = Object.freeze({
  configs: Object.freeze([]),
  requestedCount: EVAL_HARNESS_MATRIX.candidateConfigCount,
  reduced: true,
  marks: Object.freeze([]),
  disclosure: "no candidate arm was derived"
});

function refusal(
  dependencies: EvalHarnessDependencies,
  decision: EvalHarnessDecision,
  code: string,
  message: string,
  projection: CallProjection,
  effectiveProjection: CallProjection,
  candidateSet: CandidateSet,
  assignments: readonly BlindGradingAssignment[]
): EvalHarnessOutcome {
  dependencies.emit(`REFUSED ${code}: ${message}`);
  return Object.freeze({
    decision,
    refusalCode: code,
    projection,
    effectiveProjection,
    providerCallsMade: 0,
    configs: candidateSet.configs,
    candidateSet,
    assignments,
    gradingProvenance: summariseGradingProvenance(assignments),
    cells: Object.freeze([]),
    table: renderComparisonTable({ configs: candidateSet.configs, assignments, cells: [] })
  });
}

function codeOf(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof TypedDomainError) return { code: error.code, message: error.message };
  return { code: "EVAL_HARNESS_PREFLIGHT_FAILED", message: String(error) };
}

/**
 * The one-command harness (goal DoD: "one-command harness"). Order is the whole
 * safety argument:
 *   1. print the projection — before any read, any check, any call;
 *   2. run every check that can refuse, all of them free;
 *   3. the approval gate, LAST, immediately before the first provider call.
 * Every path that returns before step 4 returns `providerCallsMade: 0`, and the
 * tests assert that with an exact empty call log rather than a comparison any
 * state would satisfy.
 */
export async function runEvalHarness(
  options: EvalHarnessOptions,
  dependencies: EvalHarnessDependencies
): Promise<EvalHarnessOutcome> {
  const projection = projectCallCount({
    recordedDebateCount: EVAL_HARNESS_MATRIX.recordedDebateCount,
    candidateConfigCount: EVAL_HARNESS_MATRIX.candidateConfigCount,
    evaluatorRoundCap: EVAL_HARNESS_MATRIX.evaluatorRoundCap,
    gradersPerCell: EVAL_HARNESS_MATRIX.gradersPerCell,
    maxAttemptsPerCall: EVAL_HARNESS_SPEND.maxAttemptsPerCall,
    tokenCeilingPerCall: EVAL_HARNESS_SPEND.tokenCeilingPerCall
  });
  for (const line of renderProjection(projection)) dependencies.emit(line);

  let sealed: SealedSynthesisRoleControls;
  let candidateSet: CandidateSet = EMPTY_CANDIDATE_SET;
  let assignments: readonly BlindGradingAssignment[] = Object.freeze([]);
  let effectiveProjection = projection;
  let debates: readonly RecordedDebate[];
  try {
    sealed = await dependencies.readSynthesisRoleControls();
    const configuredProviders = await dependencies.readConfiguredProviders();
    candidateSet = deriveCandidateSet({
      sealed,
      configuredProviderRefs: configuredProviders.map((identity) => identity.providerRef),
      candidateConfigCount: EVAL_HARNESS_MATRIX.candidateConfigCount
    });
    assignments = Object.freeze(candidateSet.configs.map((candidate) => assignBlindGraders({
      candidate,
      graderPool: configuredProviders,
      gradersPerCell: EVAL_HARNESS_MATRIX.gradersPerCell
    })));
    debates = await dependencies.readRecordedDebates();
    if (debates.length < EVAL_HARNESS_MATRIX.recordedDebateCount) {
      throw new TypedDomainError(
        "EVAL_RECORDED_DEBATES_INSUFFICIENT",
        `${String(debates.length)} recorded debates are available; the goal's matrix reuses `
        + `${String(EVAL_HARNESS_MATRIX.recordedDebateCount)} and generates none`
      );
    }
  } catch (error: unknown) {
    const { code, message } = codeOf(error);
    return refusal(dependencies, "REFUSED_MATRIX_UNSATISFIABLE", code, message,
      projection, effectiveProjection, candidateSet, assignments);
  }

  // The matrix is QUALIFIED, never silently reduced. The ceiling above is what V approves; the
  // revised figure below is what the deployment can actually express, and it can only be
  // smaller — so approving the ceiling is always safe (codex r2 B1).
  if (candidateSet.configs.length !== projection.candidateConfigCount) {
    effectiveProjection = projectCallCount({
      ...projection,
      candidateConfigCount: candidateSet.configs.length
    });
    dependencies.emit(`REVISED matrix: ${candidateSet.disclosure}`);
    dependencies.emit(`REVISED projected provider calls (nominal): ${String(effectiveProjection.nominalCalls)}`);
    dependencies.emit(`REVISED projected provider calls (worst case): ${String(effectiveProjection.worstCaseCalls)}`);
  }

  // Goal line 26: every degradation emits a VISIBLE mark. Emitted here, during the free
  // preflight and BEFORE the approval gate, so V reads what was compromised alongside the count
  // it is asked to approve. A disclosure that arrives after approval has disclosed nothing.
  const provenance = summariseGradingProvenance(assignments);
  for (const mark of candidateSet.marks) {
    dependencies.emit(`CONDITION MARK ${mark} · ${candidateSet.disclosure}`);
  }
  for (const assignment of assignments) {
    for (const mark of assignment.marks) {
      if (mark === BLIND_GRADING_DEGRADED_MARK) dependencies.emit(`CONDITION MARK ${mark} · ${assignment.disclosure}`);
      else dependencies.emit(`CONDITION MARK ${mark} · ${assignment.configId}`);
    }
  }
  if (provenance.marks.includes(MODEL_IDENTITY_UNKNOWN_MARK)) {
    dependencies.emit(
      `CONDITION MARK ${MODEL_IDENTITY_UNKNOWN_MARK} · no adapter reported the model behind a `
      + "provider ref, so exact model identity between grader and candidate is not observed"
    );
  }
  if (provenance.marks.includes(INSTANCE_FRESHNESS_UNVERIFIED_MARK)) {
    dependencies.emit(
      `CONDITION MARK ${INSTANCE_FRESHNESS_UNVERIFIED_MARK} · no per-call instance reference is `
      + "recorded, so a fresh session per seat is not established"
    );
  }
  if (provenance.marks.includes(GRADER_SET_VARIES_BY_CONFIG_MARK)) {
    dependencies.emit(
      `CONDITION MARK ${GRADER_SET_VARIES_BY_CONFIG_MARK} · the arms are not graded by the same `
      + "panel"
    );
  }
  if (provenance.marks.includes(CROSS_ARM_COMPARISON_UNAVAILABLE_MARK)) {
    dependencies.emit(
      `CONDITION MARK ${CROSS_ARM_COMPARISON_UNAVAILABLE_MARK} · ${provenance.comparability.reason}`
    );
  }

  const surface = dependencies.resolveSynthesisSurface();
  if (surface === null) {
    return refusal(
      dependencies,
      "REFUSED_MATRIX_UNSATISFIABLE",
      "EVAL_SYNTHESIS_SURFACE_UNAVAILABLE",
      "T9's synthesizer/evaluator surface is not present in this checkout; the harness grades the "
      + "shipped roles or it grades nothing",
      projection,
      effectiveProjection,
      candidateSet,
      assignments
    );
  }

  if (!options.approved) {
    return refusal(
      dependencies,
      "REFUSED_AWAITING_APPROVAL",
      "EVAL_HARNESS_NOT_APPROVED",
      "the projected call count above has not been approved; re-run with the explicit approval flag",
      projection,
      effectiveProjection,
      candidateSet,
      assignments
    );
  }

  const roundCap = resolveRoundCap(sealed.evaluatorLoopMaxRounds);
  const selected = debates.slice(0, EVAL_HARNESS_MATRIX.recordedDebateCount);
  const configs = candidateSet.configs;
  const cells: GradedCell[] = [];
  let providerCallsMade = 0;
  for (const debate of selected) {
    for (const config of configs) {
      let statement = "";
      let priorObjection: string | null = null;
      for (let round = 1; round <= roundCap; round += 1) {
        const synthesized = await surface.synthesize({
          roleRef: config.synthesizerRoleRef,
          round,
          debateRef: debate.runId,
          priorObjection
        });
        providerCallsMade += 1;
        statement = synthesized.statement;
        const verdict = await surface.evaluate({
          roleRef: config.evaluatorRoleRef,
          round,
          debateRef: debate.runId,
          candidateStatement: statement
        });
        providerCallsMade += 1;
        if (verdict.satisfied) break;
        priorObjection = verdict.objection;
      }
      const seats = assignments.find((entry) => entry.configId === config.configId)?.seats ?? [];
      for (const seat of seats) {
        const graderRoleRef = seat.graderRoleRef;
        const graded = await dependencies.grade(buildGraderRequest({
          graderRoleRef,
          debateRef: debate.runId,
          candidateStatement: statement,
          criteriaKeys: EVAL_GRADER_CRITERIA_KEYS
        }));
        providerCallsMade += 1;
        cells.push(Object.freeze({
          configId: config.configId,
          debateRef: debate.runId,
          graderRoleRef,
          score: graded.score
        }));
      }
    }
  }
  const frozenCells = Object.freeze([...cells]);
  return Object.freeze({
    decision: "PROCEEDED",
    refusalCode: null,
    projection,
    effectiveProjection,
    providerCallsMade,
    configs,
    candidateSet,
    assignments,
    gradingProvenance: provenance,
    cells: frozenCells,
    table: renderComparisonTable({ configs, assignments, cells: frozenCells })
  });
}

/* ------------------------------------------------------- T15b · the table */

const factWord = (fact: ProvenanceFact): string => fact;

/**
 * The comparison table T15b routes to V.
 *
 * TWO SHAPES, chosen by whether the arms are comparable at all (codex r2 B2). A warning
 * discloses invalid comparability; it does not restore it, so when the arms faced different
 * panels this renders NO pooled mean and NO ranking — only per-grader observation counts, under
 * a statement that no role choice can be inferred. Numbers appear only when they mean something.
 *
 * The PROVENANCE half is always rendered: it says who produced and who graded each arm, and it
 * states provider identity, model identity and maker family as three SEPARATE facts, because
 * they are three separate facts and only the first and third are observable here (B3).
 */
export function renderComparisonTable(input: {
  readonly configs: readonly CandidateRoleConfig[];
  readonly assignments: readonly BlindGradingAssignment[];
  readonly cells: readonly GradedCell[];
}): readonly string[] {
  const provenance = summariseGradingProvenance(input.assignments);
  const comparable = provenance.comparability.comparable;
  const lines: string[] = [];

  if (!comparable) {
    lines.push(
      `NO CROSS-ARM COMPARISON IS POSSIBLE FROM THIS RUN — ${provenance.comparability.reason}. `
      + "No role choice can be inferred from this artifact."
    );
    lines.push("");
    lines.push("| config | synthesizer role ref | evaluator role ref | arm | grader | observations |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const config of input.configs) {
      const assignment = input.assignments.find((entry) => entry.configId === config.configId);
      const graders = [...new Set((assignment?.seats ?? []).map((seat) => seat.graderRoleRef))];
      const arm = config.baseline ? "baseline (currently sealed)" : "candidate";
      for (const grader of graders.length === 0 ? ["UNASSIGNED"] : graders) {
        const observations = input.cells.filter((cell) =>
          cell.configId === config.configId && cell.graderRoleRef === grader).length;
        lines.push(
          `| ${config.configId} | ${config.synthesizerRoleRef} | ${config.evaluatorRoleRef} `
          + `| ${arm} | ${grader} `
          + `| ${observations === 0 ? "UNGRADED" : `${String(observations)} observation${observations === 1 ? "" : "s"}`} |`
        );
      }
    }
  } else {
    lines.push("| config | synthesizer role ref | evaluator role ref | arm | mean blind score | observations |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const config of input.configs) {
      const scores = input.cells
        .filter((cell) => cell.configId === config.configId)
        .map((cell) => cell.score);
      const distinct = new Set(input.cells
        .filter((cell) => cell.configId === config.configId)
        .map((cell) => cell.graderRoleRef)).size;
      const arm = config.baseline ? "baseline (currently sealed)" : "candidate";
      const mean = scores.length === 0
        ? "UNGRADED"
        : (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(2);
      const observations = scores.length === 0
        ? "UNGRADED"
        : `${String(scores.length)} from ${String(distinct)} distinct graders`;
      lines.push(
        `| ${config.configId} | ${config.synthesizerRoleRef} | ${config.evaluatorRoleRef} `
        + `| ${arm} | ${mean} | ${observations} |`
      );
    }
  }
  lines.push("");
  lines.push("UNGRADED: no V-approved run has produced a grade for this cell");
  lines.push("");
  lines.push(
    "| provenance | synthesizer | evaluator | graders | same provider identity | same model | same maker |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const config of input.configs) {
    const assignment = input.assignments.find((entry) => entry.configId === config.configId);
    const graders = assignment === undefined
      ? "UNASSIGNED"
      : assignment.seats
        .map((seat) => `${seat.graderRoleRef} (${seat.relations.join("+")}${seat.repeatOfEarlierSeat ? ", repeat" : ""})`)
        .join(", ");
    lines.push(
      `| prov ${config.configId} | synthesizer ${config.synthesizerRoleRef} `
      + `| evaluator ${config.evaluatorRoleRef} | graders ${graders} `
      + `| same provider identity ${assignment === undefined ? "UNKNOWN" : assignment.sameProviderIdentityAsCandidate ? "yes" : "no"} `
      + `| same model ${assignment === undefined ? "UNKNOWN" : factWord(assignment.sameModelAsCandidate)} `
      + `| same maker ${assignment === undefined ? "UNKNOWN" : factWord(assignment.sameMakerAsCandidate)} |`
    );
  }
  lines.push("");
  lines.push(EVAL_PROVENANCE_UNSETTLED_NOTICE);
  lines.push("");
  lines.push(provenance.marks.length === 0
    ? "CONDITION MARKS: none — every cell was graded by two independent identities"
    : `CONDITION MARKS: ${provenance.marks.join(", ")}`);
  for (const disclosure of provenance.disclosures) lines.push(`  ${disclosure}`);
  lines.push("");
  lines.push(
    "T15b: V's choice (or V's recorded delegation rule) becomes a register row edit on "
    + "synthesizerRoleRef / evaluatorRoleRef. Until then the roles run on T16's dev-provisional "
    + "defaults and no role ref is shipped (S6-1)."
  );
  return Object.freeze(lines);
}
