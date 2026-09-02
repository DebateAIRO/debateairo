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
}

/**
 * The candidate set is DERIVED, never listed. C1 is the pair the register
 * currently seals (the control arm the comparison is against); C2..Cn are the
 * remaining ordered distinct pairs drawn from the deployment's OWN configured
 * provider identities, in sorted order so the same deployment always produces
 * the same three candidates. No provider name is invented here: a sealed ref
 * outside the configured set is a loud refusal, not a substitution (J24).
 */
export function deriveCandidateConfigs(input: {
  readonly sealed: SealedSynthesisRoleControls;
  readonly configuredProviderRefs: readonly string[];
  readonly candidateConfigCount: number;
}): readonly CandidateRoleConfig[] {
  const configured = [...new Set(input.configuredProviderRefs)].sort();
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
  const baseline: CandidateRoleConfig = Object.freeze({
    configId: "C1",
    synthesizerRoleRef: input.sealed.synthesizerRoleRef,
    evaluatorRoleRef: input.sealed.evaluatorRoleRef,
    baseline: true
  });
  const configs: CandidateRoleConfig[] = [baseline];
  for (const synthesizerRoleRef of configured) {
    for (const evaluatorRoleRef of configured) {
      if (configs.length >= input.candidateConfigCount) break;
      if (synthesizerRoleRef === evaluatorRoleRef) continue;
      if (
        synthesizerRoleRef === baseline.synthesizerRoleRef
        && evaluatorRoleRef === baseline.evaluatorRoleRef
      ) continue;
      configs.push(Object.freeze({
        configId: `C${String(configs.length + 1)}`,
        synthesizerRoleRef,
        evaluatorRoleRef,
        baseline: false
      }));
    }
  }
  if (configs.length < input.candidateConfigCount) {
    throw new TypedDomainError(
      "EVAL_CANDIDATE_CONFIGS_INSUFFICIENT",
      `${String(configured.length)} configured provider identities yield only `
      + `${String(configs.length)} distinct role configs; the goal's matrix needs `
      + `${String(input.candidateConfigCount)}`
    );
  }
  return Object.freeze(configs);
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

/** A configured provider identity and the maker family it belongs to. */
export interface ConfiguredProviderIdentity {
  readonly providerRef: string;
  readonly maker: string;
}

/** How a seated grader stands to the config whose statement it is grading. */
export type GraderRelation = "INDEPENDENT" | "CANDIDATE_EVALUATOR" | "CANDIDATE_SYNTHESIZER";

export interface GraderSeat {
  readonly graderRoleRef: string;
  readonly relation: GraderRelation;
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
  readonly sameModelAsCandidate: boolean;
  readonly sameFamilyAsCandidate: boolean;
}

/**
 * Seats `gradersPerCell` graders, best available first.
 *
 * The ranking, and the reason it is this ranking:
 *   1. INDEPENDENT identities — neither of the candidate's refs. Exhaust these
 *      FIRST, and keep drawing from them by REPEATING one rather than reaching
 *      for a candidate ref. Two reasons, and the second is specific to an eval.
 *      (a) A repeat still satisfies "graded by another AI" for both seats; a
 *      candidate ref does not. (b) The candidate refs differ BY CONFIG, so
 *      seating them makes each arm's grader correlated with the arm itself and
 *      the comparison the table exists to support stops being a comparison.
 *   2. The candidate's EVALUATOR — it shaped the statement through its
 *      objections but did not author it.
 *   3. The candidate's SYNTHESIZER — the author of the very statement under
 *      grading, so it is last.
 *
 * Only an EMPTY pool refuses: that is an absence, not a degradation, and there
 * is no best-available answer to give.
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
  const relationOf = (ref: string): GraderRelation =>
    ref === input.candidate.synthesizerRoleRef ? "CANDIDATE_SYNTHESIZER"
      : ref === input.candidate.evaluatorRoleRef ? "CANDIDATE_EVALUATOR"
        : "INDEPENDENT";
  const rank: Readonly<Record<GraderRelation, number>> = Object.freeze({
    INDEPENDENT: 0, CANDIDATE_EVALUATOR: 1, CANDIDATE_SYNTHESIZER: 2
  });
  const independent = pool
    .filter((identity) => relationOf(identity.providerRef) === "INDEPENDENT")
    .sort((left, right) => left.providerRef.localeCompare(right.providerRef));
  const ordered = independent.length > 0
    ? independent
    : [...pool].sort((left, right) =>
        rank[relationOf(left.providerRef)] - rank[relationOf(right.providerRef)]
        || left.providerRef.localeCompare(right.providerRef));

  const seats: GraderSeat[] = [];
  const used = new Set<string>();
  for (let seat = 0; seat < input.gradersPerCell; seat += 1) {
    const identity = ordered[seat % ordered.length];
    if (identity === undefined) break;
    seats.push(Object.freeze({
      graderRoleRef: identity.providerRef,
      relation: relationOf(identity.providerRef),
      repeatOfEarlierSeat: used.has(identity.providerRef)
    }));
    used.add(identity.providerRef);
  }

  const makerOf = (ref: string): string | null =>
    pool.find((identity) => identity.providerRef === ref)?.maker ?? null;
  const candidateMakers = new Set(
    [input.candidate.synthesizerRoleRef, input.candidate.evaluatorRoleRef]
      .map(makerOf)
      .filter((maker): maker is string => maker !== null)
  );
  const sameModelAsCandidate = seats.some((seat) => seat.relation !== "INDEPENDENT");
  const sameFamilyAsCandidate = seats.some((seat) => {
    const maker = makerOf(seat.graderRoleRef);
    return maker !== null && candidateMakers.has(maker);
  });

  const marks: string[] = [];
  if (seats.some((seat) => seat.repeatOfEarlierSeat)) marks.push(GRADER_REPEATS_IDENTITY_MARK);
  if (seats.some((seat) => seat.relation === "CANDIDATE_EVALUATOR")) marks.push(GRADER_IS_CANDIDATE_EVALUATOR_MARK);
  if (seats.some((seat) => seat.relation === "CANDIDATE_SYNTHESIZER")) marks.push(GRADER_IS_CANDIDATE_SYNTHESIZER_MARK);
  if (sameFamilyAsCandidate) marks.push(GRADER_SHARES_CANDIDATE_FAMILY_MARK);
  const degraded = marks.length > 0;

  const distinct = new Set(seats.map((seat) => seat.graderRoleRef)).size;
  const disclosure = !degraded
    ? `${input.candidate.configId}: ${String(seats.length)} grader seats filled from `
      + `${String(distinct)} distinct identities, none of them the candidate's`
    : sameModelAsCandidate
      ? `${input.candidate.configId}: the candidate's own identities grade it — `
        + `${seats.map((seat) => `${seat.graderRoleRef} as ${seat.relation}`).join(", ")}; `
        + "each seat is a fresh instance under its own grading prompt, and the grade is not "
        + "independent of the configuration it scores"
      : `${input.candidate.configId}: ${String(seats.length)} grader seats filled from `
        + `${String(distinct)} distinct identity that is not the candidate's; the two grades are `
        + "fresh instances of the same model and are not independent of each other";
  return Object.freeze({
    configId: input.candidate.configId,
    seats: Object.freeze(seats),
    degraded,
    marks: Object.freeze(degraded ? [BLIND_GRADING_DEGRADED_MARK, ...marks] : []),
    disclosure,
    sameModelAsCandidate,
    sameFamilyAsCandidate
  });
}

export interface GradingProvenanceSummary {
  readonly graderSetsByConfig: Readonly<Record<string, readonly string[]>>;
  readonly marks: readonly string[];
  readonly anyDegraded: boolean;
  readonly disclosures: readonly string[];
}

/**
 * Run-level provenance. The comparison is only a comparison if every arm faced
 * the same panel; when the sealed identities force different graders onto
 * different arms, the arms are not commensurable and the table has to say so.
 */
export function summariseGradingProvenance(
  assignments: readonly BlindGradingAssignment[]
): GradingProvenanceSummary {
  const graderSetsByConfig: Record<string, readonly string[]> = {};
  for (const assignment of assignments) {
    graderSetsByConfig[assignment.configId] =
      Object.freeze(assignment.seats.map((seat) => seat.graderRoleRef));
  }
  const signatures = new Set(Object.values(graderSetsByConfig).map((refs) => [...refs].sort().join("|")));
  const marks = [...new Set(assignments.flatMap((assignment) => [...assignment.marks]))];
  if (signatures.size > 1) marks.push(GRADER_SET_VARIES_BY_CONFIG_MARK);
  return Object.freeze({
    graderSetsByConfig: Object.freeze(graderSetsByConfig),
    marks: Object.freeze(marks),
    anyDegraded: assignments.some((assignment) => assignment.degraded),
    disclosures: Object.freeze(assignments.filter((a) => a.degraded).map((a) => a.disclosure))
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
  readonly projection: CallProjection;
  readonly providerCallsMade: number;
  readonly configs: readonly CandidateRoleConfig[];
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

function refusal(
  dependencies: EvalHarnessDependencies,
  decision: EvalHarnessDecision,
  code: string,
  message: string,
  projection: CallProjection,
  configs: readonly CandidateRoleConfig[],
  assignments: readonly BlindGradingAssignment[]
): EvalHarnessOutcome {
  dependencies.emit(`REFUSED ${code}: ${message}`);
  return Object.freeze({
    decision,
    refusalCode: code,
    projection,
    providerCallsMade: 0,
    configs,
    assignments,
    gradingProvenance: summariseGradingProvenance(assignments),
    cells: Object.freeze([]),
    table: renderComparisonTable({ configs, assignments, cells: [] })
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
  let configs: readonly CandidateRoleConfig[] = Object.freeze([]);
  let assignments: readonly BlindGradingAssignment[] = Object.freeze([]);
  let debates: readonly RecordedDebate[];
  try {
    sealed = await dependencies.readSynthesisRoleControls();
    const configuredProviders = await dependencies.readConfiguredProviders();
    configs = deriveCandidateConfigs({
      sealed,
      configuredProviderRefs: configuredProviders.map((identity) => identity.providerRef),
      candidateConfigCount: EVAL_HARNESS_MATRIX.candidateConfigCount
    });
    assignments = Object.freeze(configs.map((candidate) => assignBlindGraders({
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
    return refusal(dependencies, "REFUSED_MATRIX_UNSATISFIABLE", code, message, projection, configs, assignments);
  }

  // Goal line 26: every degradation emits a VISIBLE mark. These are emitted here,
  // during the free preflight and BEFORE the approval gate, so V reads what was
  // compromised alongside the count it is being asked to approve. A disclosure
  // that arrives after approval has disclosed nothing.
  const provenance = summariseGradingProvenance(assignments);
  for (const assignment of assignments) {
    for (const mark of assignment.marks) {
      if (mark === BLIND_GRADING_DEGRADED_MARK) dependencies.emit(`CONDITION MARK ${mark} · ${assignment.disclosure}`);
      else dependencies.emit(`CONDITION MARK ${mark} · ${assignment.configId}`);
    }
  }
  if (provenance.marks.includes(GRADER_SET_VARIES_BY_CONFIG_MARK)) {
    dependencies.emit(
      `CONDITION MARK ${GRADER_SET_VARIES_BY_CONFIG_MARK} · the arms are not graded by the same `
      + "panel, so their scores are not directly commensurable"
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
      configs,
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
      configs,
      assignments
    );
  }

  const roundCap = resolveRoundCap(sealed.evaluatorLoopMaxRounds);
  const selected = debates.slice(0, EVAL_HARNESS_MATRIX.recordedDebateCount);
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
    providerCallsMade,
    configs,
    assignments,
    gradingProvenance: provenance,
    cells: frozenCells,
    table: renderComparisonTable({ configs, assignments, cells: frozenCells })
  });
}

/* ------------------------------------------------------- T15b · the table */

const yesNo = (value: boolean): string => (value ? "yes" : "no");

/**
 * The comparison table T15b routes to V.
 *
 * Two tables, because V's decision needs both halves. The SCORE table answers
 * "which config graded better"; the PROVENANCE table answers "who produced and
 * who graded it", which is what makes a degraded run honest rather than merely
 * permitted (V-S11-1: same-model provenance is RECORDED, never hidden). A score
 * without its provenance cannot support a role decision, because the reader
 * cannot tell an independent grade from a self-grade.
 *
 * An ungraded cell prints UNGRADED, not a zero and not a blank: a table that
 * renders a missing grade as a number is the silent-degradation shape the goal
 * repeals.
 */
export function renderComparisonTable(input: {
  readonly configs: readonly CandidateRoleConfig[];
  readonly assignments: readonly BlindGradingAssignment[];
  readonly cells: readonly GradedCell[];
}): readonly string[] {
  const lines: string[] = [
    "| config | synthesizer role ref | evaluator role ref | arm | mean blind score | grades |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const config of input.configs) {
    const scores = input.cells
      .filter((cell) => cell.configId === config.configId)
      .map((cell) => cell.score);
    const arm = config.baseline ? "baseline (currently sealed)" : "candidate";
    const mean = scores.length === 0
      ? "UNGRADED"
      : (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(2);
    const grades = scores.length === 0 ? "UNGRADED" : `${String(scores.length)} grades`;
    lines.push(
      `| ${config.configId} | ${config.synthesizerRoleRef} | ${config.evaluatorRoleRef} `
      + `| ${arm} | ${mean} | ${grades} |`
    );
  }
  lines.push("");
  lines.push("UNGRADED: no V-approved run has produced a grade for this cell");
  lines.push("");
  lines.push("| provenance | synthesizer | evaluator | graders | same-model | same-family |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const config of input.configs) {
    const assignment = input.assignments.find((entry) => entry.configId === config.configId);
    const graders = assignment === undefined
      ? "UNASSIGNED"
      : assignment.seats
        .map((seat) => `${seat.graderRoleRef} (${seat.relation}${seat.repeatOfEarlierSeat ? ", repeat" : ""})`)
        .join(", ");
    lines.push(
      `| prov ${config.configId} | synthesizer ${config.synthesizerRoleRef} `
      + `| evaluator ${config.evaluatorRoleRef} | graders ${graders} `
      + `| same-model ${assignment === undefined ? "UNKNOWN" : yesNo(assignment.sameModelAsCandidate)} `
      + `| same-family ${assignment === undefined ? "UNKNOWN" : yesNo(assignment.sameFamilyAsCandidate)} |`
    );
  }
  const provenance = summariseGradingProvenance(input.assignments);
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
