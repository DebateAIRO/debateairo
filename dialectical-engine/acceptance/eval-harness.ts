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
    `blind graders per cell: ${String(projection.gradersPerCell)} (never the candidate)`,
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
 * "graded blind by 2 graders that are NEVER THE CANDIDATE". Both of a config's
 * refs are excluded, not just the synthesizer: across an evaluator loop the
 * evaluator's objections shape the statement that is being graded, so an
 * evaluator grading its own cell is the author-judges-itself shape the goal
 * repeals. A pool that cannot supply the full count REFUSES — it never grades
 * with one grader and it never borrows the candidate back.
 */
export function assignBlindGraders(input: {
  readonly candidate: CandidateRoleConfig;
  readonly graderPoolRefs: readonly string[];
  readonly gradersPerCell: number;
}): readonly string[] {
  const excluded = new Set([input.candidate.synthesizerRoleRef, input.candidate.evaluatorRoleRef]);
  const eligible = [...new Set(input.graderPoolRefs)].filter((ref) => !excluded.has(ref)).sort();
  if (eligible.length < input.gradersPerCell) {
    throw new TypedDomainError(
      "EVAL_BLIND_GRADER_POOL_INSUFFICIENT",
      `Config ${input.candidate.configId} leaves ${String(eligible.length)} eligible grader `
      + `${eligible.length === 1 ? "identity" : "identities"}; the goal's matrix needs `
      + `${String(input.gradersPerCell)} that are never the candidate. This deployment configures `
      + `${String(new Set(input.graderPoolRefs).size)} provider identities in total`
    );
  }
  return Object.freeze(eligible.slice(0, input.gradersPerCell));
}

/**
 * The named artifacts a BLIND grader request may contain, and no others. The
 * key set IS the blindness assertion, checked in both directions the way T9
 * checks its own fresh-context requests: an extra key can leak the authoring
 * config, a missing key starves the grader.
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
  readonly readConfiguredProviderRefs: () => Promise<readonly string[]>;
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
  configs: readonly CandidateRoleConfig[]
): EvalHarnessOutcome {
  dependencies.emit(`REFUSED ${code}: ${message}`);
  return Object.freeze({
    decision,
    refusalCode: code,
    projection,
    providerCallsMade: 0,
    configs,
    cells: Object.freeze([]),
    table: renderComparisonTable({ configs, cells: [] })
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
  let debates: readonly RecordedDebate[];
  let graderAssignment: ReadonlyMap<string, readonly string[]>;
  try {
    sealed = await dependencies.readSynthesisRoleControls();
    const configuredProviderRefs = await dependencies.readConfiguredProviderRefs();
    configs = deriveCandidateConfigs({
      sealed,
      configuredProviderRefs,
      candidateConfigCount: EVAL_HARNESS_MATRIX.candidateConfigCount
    });
    debates = await dependencies.readRecordedDebates();
    if (debates.length < EVAL_HARNESS_MATRIX.recordedDebateCount) {
      throw new TypedDomainError(
        "EVAL_RECORDED_DEBATES_INSUFFICIENT",
        `${String(debates.length)} recorded debates are available; the goal's matrix reuses `
        + `${String(EVAL_HARNESS_MATRIX.recordedDebateCount)} and generates none`
      );
    }
    graderAssignment = new Map(configs.map((candidate) => [
      candidate.configId,
      assignBlindGraders({
        candidate,
        graderPoolRefs: configuredProviderRefs,
        gradersPerCell: EVAL_HARNESS_MATRIX.gradersPerCell
      })
    ]));
  } catch (error: unknown) {
    const { code, message } = codeOf(error);
    return refusal(dependencies, "REFUSED_MATRIX_UNSATISFIABLE", code, message, projection, configs);
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
      configs
    );
  }

  if (!options.approved) {
    return refusal(
      dependencies,
      "REFUSED_AWAITING_APPROVAL",
      "EVAL_HARNESS_NOT_APPROVED",
      "the projected call count above has not been approved; re-run with the explicit approval flag",
      projection,
      configs
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
      for (const graderRoleRef of graderAssignment.get(config.configId) ?? []) {
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
    cells: frozenCells,
    table: renderComparisonTable({ configs, cells: frozenCells })
  });
}

/* ------------------------------------------------------- T15b · the table */

/**
 * The comparison table T15b routes to V. An ungraded cell prints UNGRADED, not
 * a zero and not a blank: a table that renders a missing grade as a number is
 * the silent-degradation shape the goal repeals, and V's role decision is made
 * on this table.
 */
export function renderComparisonTable(input: {
  readonly configs: readonly CandidateRoleConfig[];
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
  lines.push(
    "T15b: V's choice (or V's recorded delegation rule) becomes a register row edit on "
    + "synthesizerRoleRef / evaluatorRoleRef. Until then the roles run on T16's dev-provisional "
    + "defaults and no role ref is shipped (S6-1)."
  );
  return Object.freeze(lines);
}
