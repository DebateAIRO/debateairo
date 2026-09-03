import { randomUUID } from "node:crypto";
// UNION of both lanes: S06 needs the served-root rule vocabularies and the
// retired-rule predicate; T6 needs PoolClient for its writer-resolved FK path.
import type { ServedRootRule, ServedRootRuleHistory, WayOfKnowing } from "@debateai/kernel";
import { isRetiredServedRootRule, TypedDomainError } from "@debateai/kernel";
import type { Pool, PoolClient } from "pg";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  MAX_OWNER_PRIVATE_HISTORY_SCAN,
  allocateSequence,
  decryptContentForRun,
  encryptAttestedContentForRun,
  normalizeRunOwnership,
  RunRepository,
  withRunContentLease,
  type CryptoEnvelope,
  withWriteTransaction,
  type RunOwnershipInput
} from "@debateai/db";
import { AnswerIndexSchema, ConditionMarkSchema, ExecutionLedgerDigestSchema, type Answer, type AnswerIndex, type ConditionMark, type Edge, type ExecutionLedgerDigest, type Inspection, type InvestigationAccepted, type Node } from "@debateai/contract";
import { LivenessRepository } from "@debateai/liveness";
import {
  MemoryRepository,
  canonicalizeQuestionText,
  type MemoryDisclosure,
  type MemoryPullPolicy
} from "@debateai/memory";
import {
  DIGEST_CANNOT_EXIST_MARK,
  PROTECTED_CORE_GUARD_RETIRED_MARK,
  DIGEST_COMPRESSED_MARK,
  SYNTHESIS_OBJECTION_STANDING_MARK,
  buildSynthesisDigest,
  runSynthesisLoop,
  synthesisCallSiteKey,
  type DigestSourceNode,
  type SynthesisCodeLabel,
  type SynthesisDigest,
  type SynthesisLoopRound,
  type SynthesisLoopControls,
  type SynthesisLoopOutcome,
  type EvaluatorRequest,
  type EvaluatedCandidate,
  type EvaluatorVerdict,
  type SynthesizedCandidate,
  type SynthesizerRequest
} from "./synthesis.js";

// T9's digest, roles and loop live in `./synthesis.ts`; the package publishes a
// single entry point, so they are re-exported here.
export * from "./synthesis.js";

/**
 * T6 r4 / codex r2 B1 — the value `ledger.node_review.outcome` can hold.
 *
 * SOURCE OF TRUTH: the ledger's own CHECK,
 * `migrations/0019_xrev01_node_review.sql:8`, which admits
 * `agree | dispute | cannot-assess` and which no round of T6 has changed.
 * `agree` and `dispute` are ordinary, LIVE states of a normally judged node.
 *
 * Named and exported so the invariant has somewhere to be asserted, because
 * this column and `serve.condition_mark.review_outcome` are HOMONYMS: they
 * share the words "review" and "outcome" and mean different things. The
 * condition-mark column holds the single outcome that can be a REASON A NODE
 * IS UNJUDGED, and J14's addendum narrowed it to `cannot-assess`. This one
 * holds what a reviewer actually said. r3 retyped this column as if it were
 * that one — the trap the do-not-tidy guard exists for — so the two now differ
 * by name and not only by literal, and `tests/unit/t06-review-teeth.test.ts`
 * pins that exactly one narrowed review-outcome read exists in this file.
 */
export type StoredNodeReviewOutcome = "agree" | "dispute" | "cannot-assess";

export interface ServeNode {
  readonly nodeId: string;
  readonly text: string;
  wayOfKnowing: WayOfKnowing;
  readonly provenanceRef: string;
  locator: string | null;
  restatementStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
  readonly loadBearing: boolean;
}

export interface FactBundle {
  readonly facts: readonly string[];
  readonly residualObjections: readonly string[];
  readonly badges: readonly string[];
  readonly conditionMarks: readonly string[];
  readonly reversalPoint: string;
  readonly buildsOnPrevious: {
    readonly value: boolean;
    readonly answerRef: string | null;
  };
  readonly memoryDisclosure: MemoryDisclosure | null;
}

export function buildFactBundle(input: FactBundle): FactBundle {
  if (input.reversalPoint.trim().length === 0) {
    throw new TypedDomainError("HONESTY_FIELD_MISSING", "A reversal-point projection is required");
  }
  return Object.freeze({
    facts: Object.freeze([...input.facts]),
    residualObjections: Object.freeze([...input.residualObjections]),
    badges: Object.freeze([...input.badges]),
    conditionMarks: Object.freeze([...input.conditionMarks]),
    reversalPoint: input.reversalPoint,
    buildsOnPrevious: Object.freeze({ ...input.buildsOnPrevious }),
    memoryDisclosure: input.memoryDisclosure
  });
}

export interface ComposedSegment {
  readonly segmentId: string;
  readonly text: string;
  readonly loadBearing: boolean;
  readonly assertedNodeRefs: readonly string[];
  readonly servedNumberRefs: readonly string[];
}

export interface CompositionBudgetResolution {
  readonly tier: "low" | "medium" | "high";
  readonly bound: number;
  readonly registerRowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
}

export interface ServeGateInput {
  readonly nodes: readonly ServeNode[];
  factBundle: FactBundle;
  /**
   * T9 retired `maxRecompose` from this input. DR-049's `max_recompose = 2`
   * bounded COMPOSITION RETRIES, and composition retries are gone: the loop's
   * bound is `synthesisRoleControls.evaluatorLoopMaxRounds`, a sealed T16 row
   * (goal 39-40 — no code constant may stand in for a register value). The
   * runner setting itself is untouched; T17's envelope formula still reads it.
   */
  readonly compositionBudget: CompositionBudgetResolution;
  readonly candidateConfidenceBand: string;
  /**
   * T9 — every materialized node, for the digest. Membership here is
   * membership in the digest: the byte budget shortens summaries, never this
   * list. The served root must be a member.
   */
  readonly digestNodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
  /** T10/T11's numbers, computed BEFORE synthesis and handed to both roles. */
  readonly codeLabel: SynthesisCodeLabel;
  /** T16's sealed synthesis-role rows. Never a code constant (J8). */
  readonly synthesisRoleControls: SynthesisLoopControls;
}

export interface ConformanceJudgement {
  readonly segmentId: string;
  readonly state: "JUDGED" | "SAMPLED_PASSED" | "NOT_SAMPLED";
  readonly conforms: boolean;
}

export function deriveConformanceOutcome(
  coverageMode: "EXHAUSTIVE" | "SAMPLED" | "NOT_RUN",
  judgements: readonly Pick<ConformanceJudgement, "conforms">[]
): "PASS" | "FAIL" | "NOT_RUN" {
  if (coverageMode === "NOT_RUN") return "NOT_RUN";
  return judgements.every((judgement) => judgement.conforms) ? "PASS" : "FAIL";
}

export function projectConditionMarksByNode(
  nodeIds: readonly string[],
  links: readonly { readonly nodeId: string; readonly mark: string }[]
): ReadonlyMap<string, readonly ConditionMark[]> {
  const current = new Set(nodeIds);
  const projected = new Map<string, ConditionMark[]>(nodeIds.map((nodeId) => [nodeId, []]));
  for (const link of links) {
    if (!current.has(link.nodeId) || link.mark.trim().length === 0) continue;
    const marks = projected.get(link.nodeId)!;
    const mark = ConditionMarkSchema.parse(link.mark);
    if (!marks.includes(mark)) marks.push(mark);
  }
  return projected;
}

export function projectNodeMakerLineage(recorded: {
  readonly maker: string | null;
  readonly model_id: string | null;
  readonly model_version: string | null;
  readonly provider: string | null;
  readonly provider_ref: string | null;
}): Node["maker_lineage"] {
  if (
    recorded.maker === null ||
    recorded.model_id === null ||
    recorded.provider === null ||
    recorded.provider_ref === null
  ) return null;
  return {
    maker: recorded.maker,
    model_id: recorded.model_id,
    transport: recorded.provider,
    provider_ref: recorded.provider_ref
  };
}

export function projectServeEdge(row: {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly sourceChildKind: string | null;
  readonly targetKind: "NODE" | "EDGE";
  readonly targetRef: string;
  readonly polarity: "support" | "attack";
  readonly strength: number | null;
  readonly magnitudeStatus: "MEASURED" | "UNKNOWN";
  readonly strengthSource: string;
  readonly provenanceRef: string;
}): Edge {
  const relation = row.sourceChildKind === "shared-crux sub-claim"
    ? "shared-crux"
    : row.targetKind === "EDGE" ? "defeat" : row.polarity;
  if (row.magnitudeStatus === "MEASURED" && row.strength === null) {
    throw new TypedDomainError("EDGE_MEASURED_MAGNITUDE_MISSING", row.edgeId);
  }
  return {
    edge_id: row.edgeId,
    from_node_ref: row.sourceNodeId,
    target_kind: row.targetKind,
    target_ref: row.targetRef,
    relation,
    strength: row.magnitudeStatus === "UNKNOWN"
      ? { status: "UNKNOWN", reason: "NO_JUDGEMENT_OR_MAGNITUDE" }
      : {
          status: "PRESENT",
          number: {
            value: row.strength!,
            kind: "edge-strength",
            source: row.strengthSource,
            producer: "graph",
            provenance_ref: row.provenanceRef,
            replay_handle: row.provenanceRef
          }
        },
    provenance_ref: row.provenanceRef,
    placeholder: row.magnitudeStatus === "UNKNOWN"
  };
}

export interface BandCeiling {
  readonly label: string;
  readonly basis: Readonly<Record<WayOfKnowing, number>>;
  readonly registerRowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly liftPath: string;
}

export interface BandCeilingDecision {
  readonly kind: "CAPPED" | "NOT_CAPPED";
  readonly confidenceBand: string;
  readonly ceiling: BandCeiling;
}

export interface BandCeilingRegisterRow {
  readonly rowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: {
    readonly bandOrder: readonly string[];
    readonly ceilingLabels: readonly string[];
    readonly defaultCeiling: {
      readonly label: string;
      readonly ceilingBand: string;
      readonly liftPath: string;
    };
    readonly cuts: readonly {
      readonly minimumShares: Partial<Readonly<Record<WayOfKnowing, number>>>;
      readonly label: string;
      readonly ceilingBand: string;
      readonly liftPath: string;
    }[];
  };
}

const WAYS_OF_KNOWING = ["LOOKED_UP", "RAN", "REASONING"] as const;

function requiredText(value: string, code: string): string {
  if (value.trim().length === 0) throw new TypedDomainError(code, "A register-supplied label or reference is blank");
  return value;
}

export function deriveBandCeiling(input: {
  readonly candidateConfidenceBand: string;
  readonly basis: Readonly<Record<WayOfKnowing, number>>;
  readonly row: BandCeilingRegisterRow;
}): BandCeilingDecision {
  const bandOrder = input.row.value.bandOrder.map((band) => requiredText(band, "BAND_LABEL_INVALID"));
  const labels = input.row.value.ceilingLabels.map((label) => requiredText(label, "BAND_CEILING_LABEL_INVALID"));
  if (bandOrder.length === 0 || new Set(bandOrder).size !== bandOrder.length) {
    throw new TypedDomainError("BAND_ORDER_INVALID", "The ordered band vocabulary must be nonempty and unique");
  }
  if (labels.length === 0 || new Set(labels).size !== labels.length) {
    throw new TypedDomainError("BAND_CEILING_LABELS_INVALID", "The ceiling-label vocabulary must be nonempty and unique");
  }
  const candidateIndex = bandOrder.indexOf(input.candidateConfidenceBand);
  if (candidateIndex < 0) throw new TypedDomainError("BAND_LABEL_UNKNOWN", input.candidateConfidenceBand);
  const total = WAYS_OF_KNOWING.reduce((sum, way) => {
    const count = input.basis[way];
    if (!Number.isInteger(count) || count < 0) throw new TypedDomainError("BAND_CEILING_BASIS_INVALID", way);
    return sum + count;
  }, 0);
  if (total === 0) {
    /**
     * NO VERIFIED EVIDENCE -> THE ROW'S FLOOR BAND (V ruling 2026-09-03).
     *
     * Reached when the served statement's cited set is empty because the
     * evaluator's citation-tracing criterion failed. V ruled a consumer must see
     * a VALUE rather than an absence: the floor is the band you are entitled to
     * on no verified evidence.
     *
     * THE RECORD MUST NAME THE DECISION THAT PRODUCED THE BAND (codex r3). A
     * first pass took the band from `bandOrder[0]` but copied `defaultCeiling`'s
     * label and lift path, which on the shipped row describe a DIFFERENT
     * decision — `DEFAULT_CEILING`, band `FULL`, lift `retain-band` — so a
     * floored answer carried a record claiming its band had been retained. It
     * had not: it went from the candidate down to the floor.
     *
     * So the entry is SELECTED from the row by the band it actually names, cuts
     * first and `defaultCeiling` last, and the record is built from THAT entry.
     * ROW MEMBERSHIP IS ENFORCED ON THIS ROUTE, both halves. The label is
     * checked against `ceilingLabels` explicitly, as the ordinary derivation
     * does; skipping it here alone would accept an inconsistent sealed row that
     * every other route rejects, since the deployment schema checks only that
     * these strings are non-empty. The band half needs no separate check and
     * deliberately has none: the entry is SELECTED by `ceilingBand === bandOrder[0]`,
     * so its membership in `bandOrder` is a property of how it was found. An
     * `includes` call after that could never fail, and a check that cannot fail
     * for the reason it exists is not a check (D56).
     *
     * FAILS CLOSED. A row with no entry naming its own floor band cannot
     * describe this decision, and this refuses rather than inventing a label.
     *
     * KNOWN RESIDUE, filed as F-T9B-3 and NOT fixed here: on the shipped row the
     * only entry naming the floor is `REASONING_CEILING`, whose band and lift
     * path are both right for this case but whose NAME describes a
     * reasoning-share trigger that did not fire — the basis is empty, not
     * reasoning-heavy. The row conflates an entry's trigger with its outcome, so
     * no selection over the existing entries can be truthful about the reason.
     * Curing that needs an explicit empty-basis entry in the sealed row, and the
     * mission's slice map makes S01/T16 the sole owner of every new sealed row
     * and schema. It is not T9's to take.
     */
    const floorBand = bandOrder[0]!;
    const floorEntry = [...input.row.value.cuts, input.row.value.defaultCeiling]
      .find((entry) => entry.ceilingBand === floorBand);
    if (floorEntry === undefined) {
      throw new TypedDomainError(
        "BAND_CEILING_FLOOR_UNDESCRIBED",
        `No ceiling entry names the floor band ${floorBand}, so an empty basis cannot be described`
      );
    }
    const floorLabel = requiredText(floorEntry.label, "BAND_CEILING_LABEL_INVALID");
    if (!labels.includes(floorLabel)) throw new TypedDomainError("BAND_CEILING_LABEL_UNKNOWN", floorLabel);
    return Object.freeze({
      // Follows validateBandCeilingDecision's invariant rather than asserting a
      // kind: a candidate already at the floor is NOT_CAPPED and stays there.
      kind: floorBand === input.candidateConfidenceBand ? "NOT_CAPPED" as const : "CAPPED" as const,
      confidenceBand: floorBand,
      ceiling: Object.freeze({
        label: floorLabel,
        basis: input.basis,
        registerRowKey: input.row.rowKey,
        registerVersion: input.row.registerVersion,
        sourceRef: input.row.sourceRef,
        liftPath: requiredText(floorEntry.liftPath, "BAND_CEILING_LIFT_PATH_INVALID")
      })
    });
  }

  const selected = input.row.value.cuts.find((cut) => {
    const entries = Object.entries(cut.minimumShares) as Array<[WayOfKnowing, number]>;
    if (entries.length === 0) throw new TypedDomainError("BAND_CEILING_CUT_EMPTY", cut.label);
    return entries.every(([way, minimum]) => {
      if (!WAYS_OF_KNOWING.includes(way) || !Number.isFinite(minimum) || minimum < 0 || minimum > 1) {
        throw new TypedDomainError("BAND_CEILING_CUT_INVALID", `${cut.label}:${way}`);
      }
      return input.basis[way] / total >= minimum;
    });
  }) ?? input.row.value.defaultCeiling;
  if (!labels.includes(selected.label)) throw new TypedDomainError("BAND_CEILING_LABEL_UNKNOWN", selected.label);
  const ceilingIndex = bandOrder.indexOf(selected.ceilingBand);
  if (ceilingIndex < 0) throw new TypedDomainError("BAND_CEILING_BAND_UNKNOWN", selected.ceilingBand);
  const capped = candidateIndex > ceilingIndex;
  return {
    kind: capped ? "CAPPED" : "NOT_CAPPED",
    confidenceBand: capped ? selected.ceilingBand : input.candidateConfidenceBand,
    ceiling: {
      label: selected.label,
      basis: input.basis,
      registerRowKey: requiredText(input.row.rowKey, "BAND_CEILING_ROW_INVALID"),
      registerVersion: input.row.registerVersion,
      sourceRef: requiredText(input.row.sourceRef, "BAND_CEILING_SOURCE_INVALID"),
      liftPath: requiredText(selected.liftPath, "BAND_CEILING_LIFT_PATH_INVALID")
    }
  };
}

function validateBandCeilingDecision(
  decision: BandCeilingDecision,
  candidateConfidenceBand: string,
  basis: Readonly<Record<WayOfKnowing, number>>
): void {
  requiredText(decision.confidenceBand, "BAND_LABEL_INVALID");
  requiredText(decision.ceiling.label, "BAND_CEILING_LABEL_INVALID");
  requiredText(decision.ceiling.registerRowKey, "BAND_CEILING_ROW_INVALID");
  requiredText(decision.ceiling.sourceRef, "BAND_CEILING_SOURCE_INVALID");
  requiredText(decision.ceiling.liftPath, "BAND_CEILING_LIFT_PATH_INVALID");
  if (!Number.isInteger(decision.ceiling.registerVersion) || decision.ceiling.registerVersion < 1) {
    throw new TypedDomainError("BAND_CEILING_VERSION_INVALID", String(decision.ceiling.registerVersion));
  }
  if (WAYS_OF_KNOWING.some((way) => decision.ceiling.basis[way] !== basis[way])) {
    throw new TypedDomainError("BAND_CEILING_BASIS_MISMATCH", "The decision must print the derived load-bearing basis");
  }
  if ((decision.kind === "CAPPED") === (decision.confidenceBand === candidateConfidenceBand)) {
    throw new TypedDomainError("BAND_CEILING_DECISION_INVALID", decision.kind);
  }
}

export interface ServeGateDependencies {
  /**
   * T9: the SYNTHESIZER role call. It receives the recorded request — digest,
   * code label/numbers and, on a retry, the prior objection verbatim — and
   * returns the candidate as composed segments. It replaces `compose`, whose
   * fact-bundle argument carried no digest and could not distinguish a retry.
   */
  readonly synthesize: (
    request: SynthesizerRequest
  ) => Promise<SynthesizedCandidate<readonly ComposedSegment[]>>;
  /**
   * T9: the EVALUATOR role call. It replaces BOTH retired provider limbs —
   * per-segment conformance and post-compose R9 — because both are now
   * evaluator objection criteria rather than terminals.
   */
  readonly evaluate: (request: EvaluatorRequest) => Promise<EvaluatedCandidate>;
  readonly applyBandCeiling: (input: {
    readonly basis: Readonly<Record<WayOfKnowing, number>>;
    readonly candidateConfidenceBand: string;
  }) => BandCeilingDecision;
}

/**
 * T9 — the gate-trace vocabulary a FRESH serve may write.
 *
 * The five former COMPONENTS_ONLY quality gates are gone: R9 (pre- and
 * post-compose), residual-objections-empty, the composition byte budget, the
 * conformance limb and the Q51 locator block. Their tokens survive only in
 * `RETIRED_GATE_TRACE` below, which is a READ vocabulary — the same shape J17
 * ruled lawful for `served_root_rule`: the kernel declares the history, the
 * reader accepts it, and no fresh selection may write it. `runServeGateChain`
 * builds a `LiveGateTrace[]`, so the compiler is what enforces that.
 */
export type LiveGateTrace =
  | "DIGEST_BUILT"
  | "DIGEST_COMPRESSED"
  | "DIGEST_CANNOT_EXIST"
  | "SYNTHESIS_LOOP_SATISFIED"
  | "SYNTHESIS_LOOP_EXHAUSTED"
  | "SYNTHESIS_OBJECTION_STANDING"
  | "COMPOSED"
  | "RECOMPOSED_ONCE"
  | "GATE4_Q51_PASS"
  | "GATE4_Q51_DOWNGRADE"
  | "BAND_CEILING_PASS"
  | "BAND_CEILING_CAPPED"
  | "ENVELOPE_ENRICHMENT_SKIPPED"
  | "PROTECTED_CORE_REFUSED_SKIP"
  | "PROTECTED_CORE_GUARD_RETIRED"
  | "ENVELOPE_EXHAUSTED"
  | "COMPONENTS_ONLY_ENVELOPE"
  | "COMPONENTS_ONLY_DIGEST"
  | "COMPONENTS_ONLY_DEFECT"
  | "SERVE";

/**
 * Retired by T9 (goal 248-266). Readable — sealed answers from before the
 * synthesis chain carry these in `serve-gate:` reason refs — never writable.
 */
export const RETIRED_GATE_TRACE = Object.freeze([
  "GATE1_R9_PASS",
  "GATE1_R9_BLOCK",
  "GATE2_Q53_PASS_VACUOUS",
  "GATE2_Q53_BLOCK",
  "COMPOSITION_BUDGET_PASS",
  "COMPOSITION_BUDGET_EXCEEDED",
  "GATE3_CONFORMANCE_PASS_EXHAUSTIVE",
  "GATE3_CONFORMANCE_PASS_SAMPLED",
  "GATE3_CONFORMANCE_FAIL",
  "GATE4_Q51_LOCATOR_BLOCK",
  "POST_COMPOSE_R9_PASS",
  "POST_COMPOSE_R9_FAIL"
] as const);
export type RetiredGateTrace = typeof RETIRED_GATE_TRACE[number];

/** True for a token a fresh serve may READ but never WRITE. */
export function isRetiredGateTrace(value: string): value is RetiredGateTrace {
  return (RETIRED_GATE_TRACE as readonly string[]).includes(value);
}

/** The READ union: live tokens plus the retired history. */
export type GateTrace = LiveGateTrace | RetiredGateTrace;

/**
 * T9 — the ONLY reasons a COMPONENTS_ONLY terminal may exist (goal 263-266).
 * Every entry names its terminal, its trace token and its condition mark, so
 * "terminal + mark named per path" is a table a stranger can read, not a claim.
 */
export const SERVE_CRASH_CLASSES = Object.freeze({
  TRANSPORT_DEATH: Object.freeze({
    terminal: "COMPONENTS_ONLY" as const,
    gateTrace: "COMPONENTS_ONLY_DEFECT" as const,
    conditionMark: "DEFECT" as const
  }),
  NO_ARTIFACT: Object.freeze({
    terminal: "COMPONENTS_ONLY" as const,
    gateTrace: "COMPONENTS_ONLY_DEFECT" as const,
    conditionMark: "DEFECT" as const
  }),
  DIGEST_CANNOT_EXIST: Object.freeze({
    terminal: "COMPONENTS_ONLY" as const,
    gateTrace: "COMPONENTS_ONLY_DIGEST" as const,
    conditionMark: DIGEST_CANNOT_EXIST_MARK
  }),
  ENVELOPE_EXHAUSTED: Object.freeze({
    terminal: "COMPONENTS_ONLY" as const,
    gateTrace: "COMPONENTS_ONLY_ENVELOPE" as const,
    conditionMark: "ENVELOPE_EXHAUSTED" as const
  })
});
export type ServeCrashClass = keyof typeof SERVE_CRASH_CLASSES;

export type AnswerForm =
  | { readonly kind: "VERDICT"; readonly text: string }
  | {
      readonly kind: "HYPOTHESIS_WITH_RESEARCH_PLAN";
      readonly hypothesis: string;
      readonly researchPlan: string;
    };

export interface ServeGateResult {
  readonly terminal: "SERVED" | "DOWNGRADED" | "BLOCKED" | "COMPONENTS_ONLY";
  readonly answerForm: AnswerForm | null;
  readonly factBundle: FactBundle;
  readonly gateTrace: readonly GateTrace[];
  readonly conditionMarks: readonly string[];
  readonly conformance: readonly ConformanceJudgement[];
  readonly coverageMode: "EXHAUSTIVE" | "SAMPLED" | "NOT_RUN";
  readonly segments: readonly ComposedSegment[];
  readonly compositionBudget: CompositionBudgetResolution;
  readonly confidenceBand: string | null;
  readonly bandCeiling: BandCeiling | null;
  /** T9: the digest handed to both roles, or null on a pre-digest crash. */
  readonly digest: SynthesisDigest | null;
  /** T9: one record per evaluator loop round, in order. Empty on a crash class. */
  readonly loopRounds: readonly SynthesisLoopRound[];
  /** T9: the objection still standing when the loop ended, or null. */
  readonly standingObjection: string | null;
  /** T9: the crash class, when and only when the terminal is COMPONENTS_ONLY. */
  readonly crashClass: ServeCrashClass | null;
  readonly projections: {
    readonly reversalPoint: string;
    readonly buildsOnPrevious: FactBundle["buildsOnPrevious"];
    readonly memoryDisclosure: MemoryDisclosure | null;
  };
}

export function compositionEvidenceRequired(
  result: Pick<ServeGateResult, "terminal" | "coverageMode">
): boolean {
  return !(result.terminal === "COMPONENTS_ONLY" && result.coverageMode === "NOT_RUN");
}

/**
 * The ENVELOPE_EXHAUSTED crash class — a RESOURCE death, not a quality
 * judgement (goal 263-266). T17 owns keeping the ceiling big enough; T9 owns
 * what happens when it is hit anyway.
 *
 * F4 / goal 248-251: the `protectedCoreVerified` guard that used to throw here
 * was keyed on R9's GATE-HOOD, and R9 is no longer a gate — it is an evaluator
 * objection criterion. The guard is therefore KNOWINGLY RETIRED with it: an
 * exhausted envelope with no served statement takes this terminal even when
 * restatement failed, and never serves over budget. The restatement status is
 * still OBSERVED and DISCLOSED — it rides the trace as
 * `PROTECTED_CORE_GUARD_RETIRED` — it simply no longer decides.
 *
 * `PROTECTED_CORE_REFUSED_SKIP` stays and means what it always meant: the
 * protected-core battery rows refuse to be SKIPPED BY BUDGET. That is a
 * different proposition from R9's gate-hood and T9 does not touch it.
 */
export function createEnvelopeExhaustedResult(input: {
  readonly factBundle: FactBundle;
  readonly compositionBudget: CompositionBudgetResolution;
  readonly verifiedNodeIds: readonly string[];
  readonly skippedEnrichmentRows: readonly string[];
  readonly protectedCoreRestatement: ServeNode["restatementStatus"];
  readonly servedStatementExists: boolean;
}): ServeGateResult {
  if (input.verifiedNodeIds.length === 0) {
    throw new TypedDomainError("ENVELOPE_VERIFIED_NODE_SET_EMPTY", "Envelope hard stop requires inspected verified nodes");
  }
  if (input.servedStatementExists) {
    throw new TypedDomainError(
      "ENVELOPE_TERMINAL_OVER_SERVED_STATEMENT",
      "The envelope terminal replaces an UNSERVED statement; a served answer is never retracted into components-only"
    );
  }
  if (input.factBundle.conditionMarks.includes("DEFECT")) {
    throw new TypedDomainError("INDEPENDENT_BUDGET_MARKS_CONFLATED", "DEFECT and ENVELOPE_EXHAUSTED are independent terminals");
  }
  const conditionMarks = [...input.factBundle.conditionMarks];
  if (input.skippedEnrichmentRows.length > 0 && !conditionMarks.includes("SKIPPED-BY-BUDGET")) {
    conditionMarks.push("SKIPPED-BY-BUDGET");
  }
  if (!conditionMarks.includes("ENVELOPE_EXHAUSTED")) conditionMarks.push("ENVELOPE_EXHAUSTED");
  // J25: the gate trace does not survive to a reader — persistence keeps only
  // its LAST token in `verdict_unavailable.reason_ref`. So the retired guard's
  // disclosure is a MARK, which persists on the answer and both label switches
  // render. The trace token stays as well, for a reader of the whole path.
  const guardRetired = input.protectedCoreRestatement !== "PASS";
  if (guardRetired && !conditionMarks.includes(PROTECTED_CORE_GUARD_RETIRED_MARK)) {
    conditionMarks.push(PROTECTED_CORE_GUARD_RETIRED_MARK);
  }
  const gateTrace: LiveGateTrace[] = [];
  if (input.skippedEnrichmentRows.length > 0) gateTrace.push("ENVELOPE_ENRICHMENT_SKIPPED");
  gateTrace.push("PROTECTED_CORE_REFUSED_SKIP");
  if (guardRetired) gateTrace.push("PROTECTED_CORE_GUARD_RETIRED");
  gateTrace.push("ENVELOPE_EXHAUSTED", SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.gateTrace);
  return Object.freeze({
    terminal: SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal,
    answerForm: null,
    factBundle: input.factBundle,
    gateTrace: Object.freeze(gateTrace),
    conditionMarks: Object.freeze(conditionMarks),
    conformance: Object.freeze([]),
    coverageMode: "NOT_RUN",
    segments: Object.freeze([]),
    compositionBudget: input.compositionBudget,
    confidenceBand: null,
    bandCeiling: null,
    digest: null,
    loopRounds: Object.freeze([]),
    standingObjection: null,
    crashClass: "ENVELOPE_EXHAUSTED",
    projections: Object.freeze({
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    })
  });
}

/**
 * The COMPONENTS_ONLY constructor. It takes a CRASH CLASS, not a trace: after
 * T9 there is no other way to reach this terminal, so the enumerated set is
 * the only thing that can name it (goal 263-266, DoD "no non-crash path
 * returns COMPONENTS_ONLY").
 */
function componentsOnly(
  input: ServeGateInput,
  crashClass: Exclude<ServeCrashClass, "ENVELOPE_EXHAUSTED">,
  trace: readonly LiveGateTrace[],
  digest: SynthesisDigest | null
): ServeGateResult {
  const wiring = SERVE_CRASH_CLASSES[crashClass];
  return Object.freeze({
    terminal: wiring.terminal,
    answerForm: null,
    factBundle: input.factBundle,
    gateTrace: Object.freeze([...trace, wiring.gateTrace]),
    conditionMarks: Object.freeze(input.factBundle.conditionMarks.includes(wiring.conditionMark)
      ? [...input.factBundle.conditionMarks]
      : [...input.factBundle.conditionMarks, wiring.conditionMark]),
    conformance: Object.freeze([]),
    coverageMode: "NOT_RUN",
    segments: Object.freeze([]),
    compositionBudget: input.compositionBudget,
    confidenceBand: null,
    bandCeiling: null,
    digest,
    loopRounds: Object.freeze([]),
    standingObjection: null,
    crashClass,
    projections: Object.freeze({
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    })
  });
}

/**
 * T9 — the SYNTHESIS serve chain (goal-v4 222-270).
 *
 * What this used to be: five quality gates, each of which could end the run in
 * COMPONENTS_ONLY with a DEFECT mark — pre-compose R9, residual-objections-
 * empty, the composition byte budget, conformance, the Q51 locator block and
 * post-compose R9. What it is now: a digest, a synthesizer/evaluator loop, and
 * a serve. Their disposition, one by one (goal 248-262):
 *
 * - pre-compose R9 restatement → an EVALUATOR objection criterion. Its
 *   companion, the envelope terminal's `protectedCoreVerified` guard, was
 *   keyed on R9's gate-hood and is KNOWINGLY RETIRED with it (F4;
 *   `createEnvelopeExhaustedResult` above).
 * - residual-objections-empty → DELETED. Objections are now REQUIRED input to
 *   the digest's emphasis fields, so a gate demanding their absence is
 *   obsolete, not merely unused.
 * - composition byte budget → a code PRECONDITION inside the digest builder:
 *   tighten the per-node summaries and retry, then serve WITH the compression
 *   mark. It reaches a crash class only when the digest cannot exist at all.
 * - conformance ≤2 → an EVALUATOR objection criterion (citation tracing:
 *   every load-bearing claim traces to a digest node).
 * - the Q51 LOCATOR block → DELETED, unreachable by construction: it fired
 *   when a load-bearing LOOKED_UP node had no locator, and T4 now normalizes
 *   exactly that node to REASONING with a WAY-OF-KNOWING-DOWNGRADED mark
 *   before serve ever sees it, so no input can satisfy the old predicate. The
 *   Q51 DOWNGRADE limb is untouched — it is the answer FORM, which T13 owns.
 * - post-compose R9 → an EVALUATOR objection criterion.
 *
 * After this, COMPONENTS_ONLY has exactly four causes, all of them deaths
 * rather than quality judgements: `SERVE_CRASH_CLASSES`.
 */
export async function runServeGateChain(
  input: ServeGateInput,
  dependencies: ServeGateDependencies
): Promise<ServeGateResult> {
  const trace: LiveGateTrace[] = [];

  if (input.nodes.length === 0) {
    throw new TypedDomainError("SERVE_NODE_SET_EMPTY", "A serve chain requires at least one node");
  }
  if (!Number.isFinite(input.compositionBudget.bound) || input.compositionBudget.bound < 0) {
    throw new TypedDomainError("COMPOSITION_BUDGET_UNRESOLVED", "A V-ratified composition budget is required");
  }

  // ---- DIGEST (goal 223-231) -------------------------------------------
  const digestOutcome = buildSynthesisDigest({
    nodes: input.digestNodes,
    servedRootNodeId: input.servedRootNodeId,
    budgetBound: input.compositionBudget.bound
  });
  if (digestOutcome.kind === "DIGEST_CANNOT_EXIST") {
    // LOUD, never a silent subset: the enumerated crash class and its mark.
    trace.push("DIGEST_CANNOT_EXIST");
    return componentsOnly(input, "DIGEST_CANNOT_EXIST", trace, null);
  }
  const digest = digestOutcome.digest;
  trace.push("DIGEST_BUILT");
  if (digestOutcome.marks.length > 0) trace.push("DIGEST_COMPRESSED");

  // ---- LOOP (goal 232-247) ---------------------------------------------
  const nodeIds = new Set(input.nodes.map((node) => node.nodeId));
  const loadBearingNodeIds = new Set(
    input.nodes.filter((node) => node.loadBearing).map((node) => node.nodeId)
  );
  let loop: SynthesisLoopOutcome<readonly ComposedSegment[]>;
  try {
    loop = await runSynthesisLoop<readonly ComposedSegment[]>({
      controls: input.synthesisRoleControls,
      digest,
      codeLabel: input.codeLabel
    }, {
      synthesize: async (request) => {
        const produced = await dependencies.synthesize(request);
        const composed = produced.candidate;
        if (composed.length === 0) {
          // NO_ARTIFACT: the role answered with nothing to serve. A crash
          // class, not a quality judgement — hence a typed escape rather than
          // a terminal invented inside the loop.
          throw new TypedDomainError("SYNTHESIS_NO_ARTIFACT", "The synthesizer returned no segment to serve");
        }
        if (composed.some((segment) => segment.assertedNodeRefs.some((nodeRef) => !nodeIds.has(nodeRef)))) {
          throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "A composed segment references a node outside the serve set");
        }
        if (composed.some((segment) =>
          segment.segmentId.trim().length === 0 || segment.text.trim().length === 0
        )) {
          throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "A composed segment carries no id or no text");
        }
        if (new Set(composed.map((segment) => segment.segmentId)).size !== composed.length) {
          throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composed segment ids must be stable and unique");
        }
        return {
          candidate: composed.map((segment) => Object.freeze({
            ...segment,
            loadBearing: segment.servedNumberRefs.length > 0
              || segment.assertedNodeRefs.some((nodeRef) => loadBearingNodeIds.has(nodeRef))
          })),
          // The adapter's OWN recorded reference and producer identity travel
          // through unchanged.
          candidateRef: produced.candidateRef,
          candidateCallSiteKey: produced.candidateCallSiteKey
        };
      },
      evaluate: (request) => dependencies.evaluate(request),
      readCandidateStatement: (candidate) => candidate.map((segment) => segment.text).join("\n")
    });
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "SYNTHESIS_NO_ARTIFACT") {
      return componentsOnly(input, "NO_ARTIFACT", trace, digest);
    }
    if (error instanceof TypedDomainError && error.code === "SYNTHESIS_TRANSPORT_DEATH") {
      return componentsOnly(input, "TRANSPORT_DEATH", trace, digest);
    }
    throw error;
  }

  const segments = loop.candidate;
  // `serve_state` reads this pair (COMPOSED vs RECOMPOSED_ONCE); a loop that
  // needed a second round recomposed exactly once, by the same definition the
  // retired composition retry used.
  trace.push(loop.rounds.length > 1 ? "RECOMPOSED_ONCE" : "COMPOSED");
  trace.push(loop.standingObjection === null ? "SYNTHESIS_LOOP_SATISFIED" : "SYNTHESIS_LOOP_EXHAUSTED");
  if (loop.standingObjection !== null) trace.push("SYNTHESIS_OBJECTION_STANDING");

  // The retired conformance record now holds the evaluator's CITATION TRACING
  // criterion, per segment. The evaluator traces every load-bearing claim, so
  // the coverage is exhaustive by construction — there is no sample any more.
  const finalCriteria = loop.rounds.at(-1)!.verdict.criteria;
  const conformance: readonly ConformanceJudgement[] = Object.freeze(segments.map((segment) => Object.freeze({
    segmentId: segment.segmentId,
    state: "JUDGED" as const,
    conforms: finalCriteria.citationTracing
  })));
  const coverageMode: ServeGateResult["coverageMode"] = "EXHAUSTIVE";

  /**
   * T12 + T13 (S08) — the CITED set: what the served statement actually rests on.
   *
   * One set answers both questions the goal asks here: what FORM the answer may
   * take (T13's honest downgrade) and how CONFIDENT it may claim to be (T12's
   * band basis). That set is the nodes the composed statement CITES, restricted
   * to the segments conformance actually verified.
   *
   * Two exclusions, each for its own reason:
   *  · a served node the statement never mentions did not carry the answer, so
   *    it may not lift the band or hold off a downgrade;
   *  · a citation inside a segment conformance never sampled was checked by
   *    nobody, so it is not evidence either (the goal's own parenthesis:
   *    "conformance-verified set").
   *
   * Before this, both read `input.nodes.filter(loadBearing)` — the serve set,
   * which `buildFixedSingleRootServeNodes` fixes at exactly one root. That
   * one-node basis is the STRUCTURAL origin of the forced 0/1 way-of-knowing
   * shares the goal names; T10 replaced the SELECTION of that root, not the set,
   * so the basis had to stop reading the set.
   */
  /**
   * THE COUPLING, RESTATED AT THE T9B MERGE — do not read the pre-merge version
   * of this comment, which described a mechanism this chain no longer has.
   *
   * S08 wrote here that testing `state` alone is safe because a
   * `!conformance.every((judgement) => judgement.conforms)` guard upstream
   * returns componentsOnly before control arrives, and warned in the same
   * breath: "whoever moves either piece must move both". T9 moved one piece —
   * it retired the three-state sampled conformance gate into a single EVALUATOR
   * criterion, and the synthesis loop SERVES a standing objection rather than
   * withholding the answer. The guard went with it.
   *
   * So `conforms` is tested HERE now (V ruling, 2026-09-03, finding F-T9B-1):
   * a run whose citation tracing failed must not have its citations counted
   * into the confidence band. Both of S08's axes are live again, reached
   * through T9's one criterion instead of three sampled states:
   *   · `state !== "NOT_SAMPLED"` — vacuous at this tree, because every
   *     judgement is minted JUDGED and `coverageMode` is EXHAUSTIVE. Kept
   *     deliberately, not tidied: it costs nothing and is correct again the
   *     moment a sampling path returns.
   *   · `conforms` — the live one. Under this chain every judgement carries the
   *     same `finalCriteria.citationTracing`, so a failed tracing criterion
   *     empties the cited set and the empty-basis guard below refuses loudly.
   *
   * This is deliberately NOT a fifth COMPONENTS_ONLY crash class. goal-v4
   * re-routes the conformance gate to an objection criterion and closes the
   * terminal at four ("no non-crash path returns COMPONENTS_ONLY"); adding one
   * would need a goal override. The purpose V ruled is satisfied without one.
   */
  const verifiedSegmentIds = new Set(
    conformance
      .filter((judgement) => judgement.state !== "NOT_SAMPLED" && judgement.conforms)
      .map((judgement) => judgement.segmentId)
  );
  const citedNodeIds = new Set(
    segments
      .filter((segment) => verifiedSegmentIds.has(segment.segmentId))
      .flatMap((segment) => [...segment.assertedNodeRefs])
  );
  const citedNodes = input.nodes.filter((node) => citedNodeIds.has(node.nodeId));
  /**
   * V ruling 2026-09-03 (F-T9B-1): an exhausted CITATION-TRACING objection does
   * not end the answer — goal-v4 says a run that reaches its round bound with
   * the evaluator still objecting SERVES REGARDLESS, with the objection riding
   * it as a visible mark. So this case is separated from S08's empty-basis
   * guard below, which exists for a different input: a statement that cites
   * nothing at all, where `[].every(...)` would otherwise downgrade on a
   * vacuous truth. Here the cited set is empty for a KNOWN reason and the
   * downgrade is the honest answer rather than an accident.
   */
  const citationTracingFailed = !finalCriteria.citationTracing;
  if (citedNodes.length === 0 && !citationTracingFailed) {
    // Banding on an empty basis is the silent degradation this gate exists to
    // refuse: `deriveBandCeiling` would reject it downstream anyway, but the
    // FORM decision happens first, and `[].every(...)` is `true` — an uncited
    // statement would otherwise downgrade itself on a vacuous truth.
    throw new TypedDomainError(
      "SERVED_STATEMENT_CITES_NO_VERIFIED_NODE",
      "A served statement must cite at least one conformance-verified node: its form and its confidence band are both read from what it cites"
    );
  }

  // ---- SERVE ------------------------------------------------------------
  let terminal: ServeGateResult["terminal"];
  let answerForm: AnswerForm;
  // The Q51 LOCATOR block that stood here on integration is NOT reinstated: T9
  // deleted it as unreachable by construction (see this function's header —
  // T4 normalizes a locator-less load-bearing LOOKED_UP node to REASONING with
  // a WAY-OF-KNOWING-DOWNGRADED mark before serve is entered). The Q51
  // DOWNGRADE limb below is untouched and now reads S08's CITED set, which is
  // what T9's header already assigned to T13.
  /**
   * THE TWO CAUSES OF AN EMPTY CITED SET ARE SEPARATED HERE (V ruling
   * 2026-09-03). Before this they collapsed onto one path, because
   * `[].every(...)` is `true`: "no verified cited node, because tracing failed"
   * fell into T13's REASONING-only limb, which is right about the terminal and
   * wrong about the FORM. That limb requires a hypothesis AND a research plan,
   * so a one-segment candidate crashed with COMPOSITION_CONTRACT_ERROR before
   * any served result carrying the mark existed — and one segment is squarely
   * within the production contract, since the synthesizer is asked for two only
   * when the cited nodes rest on reasoning alone.
   *
   * Serving after the round bound must not depend on how many segments the
   * synthesizer produced, so this arm serves WHATEVER WAS COMPOSED, at any
   * count. It is DOWNGRADED and carries the standing-objection mark and the
   * floor band; those three together say the answer is weak and why. Splitting
   * one segment into a hypothesis and a plan it does not contain would be
   * fabrication, so the form is the composed statement itself.
   */
  if (citationTracingFailed) {
    trace.push("GATE4_Q51_DOWNGRADE");
    terminal = "DOWNGRADED";
    answerForm = { kind: "VERDICT", text: segments.map((segment) => segment.text).join("\n") };
  } else if (citedNodes.every((node) => node.wayOfKnowing === "REASONING")) {
    if (segments.length < 2 || segments[0] === undefined || segments[1] === undefined) {
      throw new TypedDomainError(
        "COMPOSITION_CONTRACT_ERROR",
        "A reasoning answer requires both a hypothesis and a research-plan segment"
      );
    }
    trace.push("GATE4_Q51_DOWNGRADE");
    terminal = "DOWNGRADED";
    answerForm = {
      kind: "HYPOTHESIS_WITH_RESEARCH_PLAN",
      hypothesis: segments[0].text,
      researchPlan: segments[1].text
    };
  } else {
    trace.push("GATE4_Q51_PASS");
    terminal = "SERVED";
    answerForm = { kind: "VERDICT", text: segments.map((segment) => segment.text).join("\n") };
  }

  // The POST_COMPOSE_R9 call that stood here on integration is NOT reinstated:
  // T9 retired post-compose R9 into an evaluator objection criterion (this
  // function's header, goal 248-262), and `dependencies.postComposeR9` no
  // longer exists on ServeGateDependencies.
  // T12: counted over the CITED set derived above — the same set T13's form
  // decision read, so an answer's shape and its confidence can never describe
  // different evidence.
  const basis = {
    LOOKED_UP: citedNodes.filter((node) => node.wayOfKnowing === "LOOKED_UP").length,
    // F5 / DECISIONS J4 do-not-tidy: T4 removed RAN from the judge schema, so
    // this bucket can only be 0 today. It stays. The register's cut matrix and
    // the persisted `band_ceiling.basis` both still name RAN, and the goal
    // parks enum-reachability lint out of scope — deleting it is a TICKET.
    RAN: citedNodes.filter((node) => node.wayOfKnowing === "RAN").length,
    REASONING: citedNodes.filter((node) => node.wayOfKnowing === "REASONING").length
  };
  /**
   * The ceiling is ALWAYS derived. When citation tracing failed the basis above
   * is empty, and `deriveBandCeiling` answers that with the register row's FLOOR
   * band — a value, which V chose over an absence — built from the row entry
   * that names that band.
   *
   * This does NOT touch the LABEL. Confirm-item 3 and the frozen S06 spec rule
   * that a standing round-3 objection does not move the served label, which is
   * code-derived from the propagated numbers BEFORE synthesis runs; an
   * objection reaching back into it is exactly the cycle that clause forbids.
   */
  const ceilingDecision = dependencies.applyBandCeiling({
    basis,
    candidateConfidenceBand: input.candidateConfidenceBand
  });
  validateBandCeilingDecision(ceilingDecision, input.candidateConfidenceBand, basis);
  trace.push(ceilingDecision.kind === "CAPPED" ? "BAND_CEILING_CAPPED" : "BAND_CEILING_PASS", "SERVE");

  const conditionMarks = [...input.factBundle.conditionMarks];
  for (const mark of [...digestOutcome.marks, ...loop.marks]) {
    if (!conditionMarks.includes(mark)) conditionMarks.push(mark);
  }
  return Object.freeze({
    terminal,
    answerForm,
    factBundle: input.factBundle,
    gateTrace: Object.freeze(trace),
    conditionMarks: Object.freeze(conditionMarks),
    conformance,
    coverageMode,
    segments,
    compositionBudget: input.compositionBudget,
    confidenceBand: ceilingDecision.confidenceBand,
    bandCeiling: ceilingDecision.ceiling,
    digest,
    loopRounds: loop.rounds,
    standingObjection: loop.standingObjection,
    crashClass: null,
    projections: Object.freeze({
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    })
  });
}

const SERVE_ITEM_STATUSES = ["READY", "PENDING", "ERROR"] as const;
type ServeItemStatus = typeof SERVE_ITEM_STATUSES[number];

export interface ServeItem {
  readonly nodeId: string;
  readonly status: ServeItemStatus;
  readonly reason?: string | null;
}

export function validateServeItems(input: {
  readonly ledgerProduced: boolean;
  readonly items: unknown;
  readonly currentNodeIds: readonly string[];
}): readonly ServeItem[] {
  if (!input.ledgerProduced) {
    throw new TypedDomainError("SERVE_OUTPUT_NOT_FROM_LEDGER", "Serve output must be ledger-produced");
  }
  if (!Array.isArray(input.items)) {
    throw new TypedDomainError("SERVE_ITEMS_NOT_A_LIST", "Serve items must be a list");
  }
  for (const item of input.items) {
    if (typeof item !== "object" || item === null || !("nodeId" in item) || !("status" in item)
      || typeof item.nodeId !== "string" || typeof item.status !== "string") {
      throw new TypedDomainError("SERVE_ITEM_INVALID", "Every serve item must validate");
    }
    if (!(SERVE_ITEM_STATUSES as readonly string[]).includes(item.status)) {
      throw new TypedDomainError("SERVE_STATUS_UNKNOWN", `Unknown serve status: ${item.status}`);
    }
    if (!input.currentNodeIds.includes(item.nodeId)) {
      throw new TypedDomainError("SERVE_ITEM_OUT_OF_NODE_SET", `Node ${item.nodeId} is not current`);
    }
  }
  return input.items as readonly ServeItem[];
}

const SECRET_MARKER = /(?:authorization|bearer|api[_-]?key|token|secret)/i;

export function sanitizeServeItem(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const debug = typeof input.debug === "object" && input.debug !== null && "contractVersion" in input.debug
    && typeof input.debug.contractVersion === "string"
    ? { contractVersion: input.debug.contractVersion }
    : undefined;
  const reason = typeof input.reason === "string" && !SECRET_MARKER.test(input.reason) ? input.reason : null;
  return Object.freeze({
    nodeId: input.nodeId,
    status: input.status,
    ...(debug === undefined ? {} : { debug }),
    ...(Object.hasOwn(input, "reason") ? { reason } : {})
  });
}

export function reconcileServeItems(input: {
  readonly currentNodes: readonly { readonly nodeId: string; readonly workActive: boolean }[];
  readonly items: readonly ServeItem[];
}): readonly ServeItem[] {
  const byNode = new Map(input.items.map((item) => [item.nodeId, item]));
  return input.currentNodes.map((node) => byNode.get(node.nodeId) ?? (node.workActive
    ? { nodeId: node.nodeId, status: "PENDING" as const }
    : { nodeId: node.nodeId, status: "ERROR" as const, reason: "MISSING_COMPLETED_ITEM" }));
}

export function deriveWorkReadState(input: {
  readonly storedState: "ACTIVE" | "DONE" | "FAILED";
  readonly deadline: Date | null;
  readonly readAt: Date;
}): { readonly state: "ACTIVE" | "DONE" | "FAILED"; readonly reason?: "DEADLINE_EXPIRED" } {
  return input.storedState === "ACTIVE" && input.deadline !== null && input.readAt > input.deadline
    ? { state: "FAILED", reason: "DEADLINE_EXPIRED" }
    : { state: input.storedState };
}

/**
 * T11 (goal 196-221) — the three-state verdict label.
 *
 * A label input is either MEASURED or ABSENT. ABSENT is a RUNTIME value with a
 * reason, never NaN and never a silent zero: a single servable root has no
 * runner-up to measure a margin against, and a panel that produced fewer than
 * two parseable judgements has no dispersion to compare (s04 `measureDispersion`
 * returns exactly that shape).
 */
export type VerdictLabelQuantity =
  | { readonly kind: "MEASURED"; readonly value: number }
  | { readonly kind: "ABSENT"; readonly reason: string };

/**
 * gamma, the two cuts and the disagreement threshold, as the caller read them
 * from T16's sealed register rows (`readVerdictLabelControls`). This module
 * carries NO default for any of them — a label derived from a value this file
 * invented would be uncalibratable and untunable, which is what the sealed rows
 * exist to prevent (goal 39-40).
 */
export interface VerdictLabelControls {
  readonly gamma: number;
  readonly highCut: number;
  readonly lowCut: number;
  readonly disagreementThreshold: number;
}

export interface VerdictLabelBasis {
  /** The served root's propagated strength. */
  readonly winner: number;
  /** The served root's margin over the runner-up root. */
  readonly margin: VerdictLabelQuantity;
  /**
   * The recorded panel dispersion of the WINNING root's reduced judgement
   * (T3's `dispersion` field), on T16's seeded scale.
   */
  readonly disagreement: VerdictLabelQuantity;
  readonly controls: VerdictLabelControls;
}

export const LABEL_BASIS_INCOMPLETE_MARK = "LABEL-BASIS-INCOMPLETE" as const;

export type VerdictLabelTrigger =
  | "BASIS_INCOMPLETE"
  | "BELOW_LOW_CUT"
  | "MARGIN_WITHIN_GAMMA"
  | "DISAGREEMENT_AT_THRESHOLD"
  | "AT_OR_ABOVE_HIGH_CUT"
  | "MID_BAND";

export interface VerdictLabelDerivation {
  readonly label: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
  /** The ladder rung that decided, 0-4 as goal lines 199-207 number them. */
  readonly rung: 0 | 1 | 2 | 3 | 4;
  readonly trigger: VerdictLabelTrigger;
  /** Which basis limbs were ABSENT; empty unless rung 0 fired. */
  readonly basisAbsence: readonly ("MARGIN" | "DISAGREEMENT")[];
  readonly marks: readonly (typeof LABEL_BASIS_INCOMPLETE_MARK)[];
}

function assertLabelNumber(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypedDomainError(
      "VERDICT_LABEL_INPUT_INVALID",
      `${label} must be a finite number; an unmeasurable input is ABSENT with a reason, never NaN`
    );
  }
  return value;
}

/**
 * The ORDERED, TOTAL, DISJOINT ladder, defined over the runtime domain with
 * absent inputs included (goal 197-207). Exactly one rung fires at every point:
 * the FIRST whose guard holds. Nothing here consults the round-3 evaluator
 * objection — the derivation is acyclic and runs BEFORE synthesis, from the
 * propagated numbers only (confirm-item 3, default NO).
 */
export function deriveVerdictLabel(input: VerdictLabelBasis): VerdictLabelDerivation {
  const { gamma, highCut, lowCut, disagreementThreshold } = input.controls;
  for (const [value, label] of [
    [gamma, "gamma"], [highCut, "the high cut"], [lowCut, "the low cut"],
    [disagreementThreshold, "the disagreement threshold"]
  ] as const) assertLabelNumber(value, label);
  if (!(lowCut < highCut)) {
    throw new TypedDomainError(
      "VERDICT_LABEL_CONTROLS_INVALID",
      "The low cut must sit strictly below the high cut"
    );
  }
  const winner = assertLabelNumber(input.winner, "the winning strength");
  const margin = input.margin;
  const disagreement = input.disagreement;
  if (margin.kind === "MEASURED") assertLabelNumber(margin.value, "the margin");
  if (disagreement.kind === "MEASURED") assertLabelNumber(disagreement.value, "the disagreement");

  // Rung 0 — the basis itself is incomplete.
  if (margin.kind === "ABSENT" || disagreement.kind === "ABSENT") {
    return Object.freeze({
      label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
      basisAbsence: Object.freeze([
        ...(margin.kind === "ABSENT" ? ["MARGIN" as const] : []),
        ...(disagreement.kind === "ABSENT" ? ["DISAGREEMENT" as const] : [])
      ]),
      marks: Object.freeze([LABEL_BASIS_INCOMPLETE_MARK])
    });
  }
  const noAbsence = Object.freeze([]) as readonly ("MARGIN" | "DISAGREEMENT")[];
  const noMarks = Object.freeze([]) as readonly (typeof LABEL_BASIS_INCOMPLETE_MARK)[];

  // Rung 1 — below the low cut.
  if (winner < lowCut) {
    return Object.freeze({
      label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT",
      basisAbsence: noAbsence, marks: noMarks
    });
  }
  // Rung 2 — a tie-adjacent margin, or a panel that disagreed at the threshold.
  const marginWithinGamma = margin.value <= gamma;
  if (marginWithinGamma || disagreement.value >= disagreementThreshold) {
    return Object.freeze({
      label: "CONTESTED", rung: 2,
      trigger: marginWithinGamma ? "MARGIN_WITHIN_GAMMA" : "DISAGREEMENT_AT_THRESHOLD",
      basisAbsence: noAbsence, marks: noMarks
    });
  }
  // Rung 3 — at or above the high cut, with a clear margin and low disagreement.
  if (winner >= highCut) {
    return Object.freeze({
      label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT",
      basisAbsence: noAbsence, marks: noMarks
    });
  }
  // Rung 4 — the mid band: low <= winner < high.
  return Object.freeze({
    label: "CONTESTED", rung: 4, trigger: "MID_BAND",
    basisAbsence: noAbsence, marks: noMarks
  });
}

/**
 * The served answer's verdict projection: exactly one of a label or an
 * unavailability reason (the contract refuses both and neither). The label
 * itself is T11's ladder above — never a constant this function chose.
 */
export function deriveHonestVerdict(input: {
  readonly usableBasis: boolean;
  readonly reasonRef: string;
  readonly labelBasis: VerdictLabelBasis | null;
}):
  | {
      readonly verdictState: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
      readonly confidenceBand: null;
      readonly unavailable: null;
      readonly derivation: VerdictLabelDerivation;
    }
  | {
      readonly verdictState: null;
      readonly confidenceBand: null;
      readonly unavailable: { readonly reasonRef: string };
      readonly derivation: null;
    } {
  if (!input.usableBasis) {
    return { verdictState: null, confidenceBand: null, unavailable: { reasonRef: input.reasonRef }, derivation: null };
  }
  if (input.labelBasis === null) {
    throw new TypedDomainError(
      "VERDICT_LABEL_BASIS_UNRESOLVED",
      "A servable answer must carry the propagated label basis (winner, margin, disagreement, sealed controls); no label is invented here"
    );
  }
  const derivation = deriveVerdictLabel(input.labelBasis);
  return { verdictState: derivation.label, confidenceBand: null, unavailable: null, derivation };
}

export function projectProvenance(input: {
  readonly sourceRef: string;
  readonly producer: string;
  readonly replayHandle: string;
  readonly perSide: {
    readonly support: readonly string[];
    readonly attack: readonly string[];
  };
}, flip: {
  readonly layer2Enabled: boolean;
  readonly registerRowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
}): Readonly<Record<string, unknown>> {
  const layering = Object.freeze({
    registerRowKey: flip.registerRowKey,
    registerVersion: flip.registerVersion,
    sourceRef: flip.sourceRef,
    layer: flip.layer2Enabled ? 2 : 1
  });
  return Object.freeze({
    sourceRef: input.sourceRef,
    producer: input.producer,
    replayHandle: input.replayHandle,
    ...(flip.layer2Enabled ? { perSide: input.perSide } : {}),
    layering
  });
}

export interface ServedNumberEvent {
  readonly status: "PRESENT" | "EVICTED";
  readonly reason: string | null;
  readonly atSequence: number;
}

export function foldServedNumberEvents(events: readonly ServedNumberEvent[], throughSequence?: number): {
  readonly status: ServedNumberEvent["status"];
  readonly reason: string | null;
} {
  const latest = events
    .filter((event) => throughSequence === undefined || event.atSequence <= throughSequence)
    .sort((left, right) => left.atSequence - right.atSequence)
    .at(-1);
  if (latest === undefined) {
    throw new TypedDomainError("EMPTY_EVENT_STREAM", "A served number must have at least one status event");
  }
  return { status: latest.status, reason: latest.reason };
}

export function deriveAnswerServeState(input: {
  readonly sealedServeState: "COMPOSED" | "RECOMPOSED_ONCE" | "COMPONENTS_ONLY";
  readonly numberEvents: readonly ServedNumberEvent[];
  readonly readMode: "CURRENT" | "SEALED_VERSION";
}): {
  readonly serveState: "COMPOSED" | "RECOMPOSED_ONCE" | "COMPONENTS_ONLY";
  readonly conditionMarks: readonly "DEFECT"[];
} {
  if (input.readMode === "SEALED_VERSION") {
    return { serveState: input.sealedServeState, conditionMarks: [] };
  }
  const evicted = input.numberEvents.some((event) => event.status === "EVICTED");
  return evicted
    ? { serveState: "COMPONENTS_ONLY", conditionMarks: ["DEFECT"] }
    : { serveState: input.sealedServeState, conditionMarks: [] };
}

export interface ReplaySelfTestInput {
  readonly stored: number;
  readonly recomputed: number;
  readonly servedNumberId: string;
}

export function decideReplayEviction(input: ReplaySelfTestInput):
  | { readonly kind: "UNCHANGED" }
  | { readonly kind: "EVICT"; readonly servedNumberId: string; readonly mark: "MISSING-NUMBER" } {
  return Object.is(input.stored, input.recomputed)
    ? { kind: "UNCHANGED" }
    : { kind: "EVICT", servedNumberId: input.servedNumberId, mark: "MISSING-NUMBER" };
}

/** T9 / J25 — one loop round as a READER gets it back from the database. */
export interface PersistedSynthesisRound {
  readonly round: number;
  readonly synthesizerStage: "INITIAL" | "RETRY";
  /**
   * Typed, PRODUCER-BOUND `ledger.raw_artifact` keys. Each was resolved through
   * the ledger entry that recorded it before the answer committed, so it names
   * the artifact this run produced at that call site — not merely an artifact
   * that happens to share the run.
   */
  readonly candidateArtifactRef: string;
  readonly candidateCallSiteKey: string;
  readonly evaluatorArtifactRef: string;
  readonly evaluatorCallSiteKey: string;
  readonly evaluatorSatisfied: boolean;
}

export interface PersistServeInput {
  readonly runId: string;
  readonly workItemId: string;
  readonly factBundleVersion: number;
  readonly factBundleContentHash: string;
  readonly factBundle: FactBundle;
  readonly result: ServeGateResult;
  readonly segments: readonly ComposedSegment[];
  readonly compositionRawArtifactRef: string | null;
  readonly compositionAttempt: number;
  readonly conformanceRawArtifactRefs: readonly string[];
  readonly conditionMarkRecords?: readonly PersistableConditionMarkRecord[];
  readonly servedNumber: {
    readonly numberRef: string;
    readonly value: number;
    readonly numberKind: string;
    readonly sourceRef: string;
    readonly producer: string;
    readonly replayHandle: string;
    readonly propagationRunId: string;
  } | null;
  /**
   * T11: the propagated numbers this answer's three-state label is derived
   * from, computed BEFORE synthesis. Required whenever the answer will carry a
   * label (a served number on a SERVED/DOWNGRADED terminal); omitted on the
   * DR-184 superseding path, which preserves the prior answer's projection.
   */
  readonly verdictLabelBasis?: VerdictLabelBasis | null;
  /** DR-184: append a new immutable version of an already-served answer. */
  readonly supersedes?: { readonly answerId: string };
}

export interface ReviewCatchUpSource {
  readonly askerId: string;
  readonly answerId: string;
  readonly answerVersion: number;
  readonly workItemId: string;
  readonly answer: Answer;
  readonly factBundle: FactBundle;
  readonly factBundleContentHash: string;
  readonly factBundleVersion: number;
  readonly servedNumber: {
    readonly nodeId: string;
    readonly numberRef: string;
    readonly value: number;
    readonly numberKind: string;
    readonly sourceRef: string;
    readonly producer: string;
    readonly replayHandle: string;
    readonly propagationRunId: string;
  } | null;
}

export interface MemoryQuestionRegistration {
  readonly runId: string;
  readonly questionLine: string;
  readonly callerScope: string;
  readonly askerScope: string;
  readonly asOf: string;
  readonly policyVersion: number;
  readonly pullPolicy?: MemoryPullPolicy;
}

export interface ConditionMarkRecord {
  // J13(b): PANEL-PARTIAL and PANEL-DEGRADED-SINGLE-VOICE are node-scope panel
  // degradation disclosures; the record union must name them or the runner cannot
  // project the mark the kernel now mints.
  // T7 / S3-2: BRANCH-FROZEN-LOW-LEVERAGE is the adaptive-stopping freeze
  // disclosure; S6-1 / T11: LABEL-BASIS-INCOMPLETE is the served label's
  // incomplete-basis disclosure; F4 / T9: PROTECTED-CORE-GUARD-RETIRED is the
  // knowingly-retired R9 guard disclosure. The runner cannot project a mark the
  // kernel mints unless the record union names it, so ALL THREE lanes' mints are
  // named here (T9B merge). Union order is not semantic; it mirrors the kernel's
  // mid-list placement.
  readonly mark: "SKIPPED-BY-BUDGET" | "ENVELOPE_EXHAUSTED" | "PROTECTED-CORE-GUARD-RETIRED" | "OWED-CHECK-UNEXECUTED" | "UNRESOLVED-TYPE-FALLBACK" | "UNSERVED-MAKER-POSITION" | "SINGLE-LINEAGE" | "CRITIQUE-UNAVAILABLE" | "HIDDEN-UNJUDGEABLE" | "DERIVED-STANDING-UNREVIEWED" | "HIDDEN-LOW-SCORE" | "UNAUTHORED-BRANCH-HALTED" | "WAY-OF-KNOWING-DOWNGRADED" | "PANEL-PARTIAL" | "PANEL-DEGRADED-SINGLE-VOICE" | "BRANCH-FROZEN-LOW-LEVERAGE" | "LABEL-BASIS-INCOMPLETE";
  readonly scope: "answer" | "node";
  readonly subjectRef: string;
  readonly reason: string;
  readonly liftPath: string | null;
  /**
   * The rule a FRESH selection recorded. Live vocabulary only: a new selection
   * cannot even express a retired rule (T10 / codex r1 B3). A record carried
   * forward from an older answer version uses `PreservedConditionMarkRecord`.
   */
  readonly servedRootRule: ServedRootRule | null;
  readonly affectedNodeIds: readonly string[];
  readonly callSiteKey?: string | null;
  readonly plannedLegCount?: number | null;
  readonly terminalTransportOutcome?: "TIMED_OUT" | "FAILED" | null;
  /**
   * T6 / S4-2 / J14 (+ ADDENDUM) — the second route into class H/D: the review
   * LANDED and said it could not judge. Exactly one of this and
   * `terminalTransportOutcome` is set on a class-H or class-D record.
   *
   * `cannot-assess` is the ONLY value this arm can take. `agree` and `dispute`
   * both SEED judged standing, so neither can ever be the reason a node is
   * unjudged; admitting them made the disclosure a writable lie (codex r1 B1).
   * The provenance for this arm is not supplied by the caller — it is looked up
   * in the ledger by `resolveTrueUnjudgedReasons` and written under a composite
   * foreign key, so the record cannot name a review it does not have.
   */
  readonly reviewOutcome?: "cannot-assess" | null;
  readonly hiddenStrength?: number | null;
  readonly hiddenScoreThreshold?: number | null;
  readonly hiddenScoreThresholdSourceRef?: string | null;
  readonly excludedFromServedNumber?: boolean | null;
  readonly judgedBasisCount?: number | null;
}

/**
 * A record carried forward onto a NEW VERSION of an existing answer (DR-184
 * catch-up). It may carry a RETIRED rule, because the version it describes was
 * selected under that rule and relabelling it would falsify the record. This is
 * the only shape allowed to hold one, and only on a superseding write — the law
 * is enforced at `persist`, which names it if it is broken.
 */
export type PreservedConditionMarkRecord =
  Omit<ConditionMarkRecord, "servedRootRule">
  & { readonly servedRootRule: ServedRootRuleHistory | null };

/** Either shape; `persist` decides which is lawful from `supersedes`. */
export type PersistableConditionMarkRecord = ConditionMarkRecord | PreservedConditionMarkRecord;

const REQUIRED_CONDITION_MARK_RECORDS = Object.freeze([
  "SKIPPED-BY-BUDGET",
  "ENVELOPE_EXHAUSTED",
  "OWED-CHECK-UNEXECUTED",
  "UNRESOLVED-TYPE-FALLBACK",
  "UNSERVED-MAKER-POSITION",
  "SINGLE-LINEAGE",
  "CRITIQUE-UNAVAILABLE",
  "HIDDEN-UNJUDGEABLE",
  "DERIVED-STANDING-UNREVIEWED",
  "HIDDEN-LOW-SCORE",
  "UNAUTHORED-BRANCH-HALTED",
  // T11: a label derived without a complete basis is disclosed on the answer it
  // labelled, with a typed record naming which limb of the basis was absent.
  "LABEL-BASIS-INCOMPLETE"
] as const);

/** DR-161: required typed records and answer marks are a two-way contract. */
export function assertRequiredConditionMarkRecords(
  conditionMarks: readonly string[],
  records: readonly PersistableConditionMarkRecord[]
): void {
  for (const mark of REQUIRED_CONDITION_MARK_RECORDS) {
    if (conditionMarks.includes(mark) && !records.some((record) => record.mark === mark)) {
      throw new TypedDomainError("CONDITION_MARK_RECORD_REQUIRED", `${mark} has no typed persistence record`);
    }
  }
  const orphan = records.find((record) => !conditionMarks.includes(record.mark));
  if (orphan !== undefined) {
    throw new TypedDomainError(
      "CONDITION_MARK_RECORD_WITHOUT_MARK",
      `${orphan.mark} has a typed persistence record but is absent from the served answer marks`
    );
  }
  for (const record of records) {
    // T6/J14: EXACTLY ONE unjudged reason — a transport outcome (the review
    // never landed) XOR a review outcome (it landed and could not judge).
    // Written as an XOR so the transport route keeps its existing requirement
    // rather than the second route turning it into an optional field.
    //
    // J14 ADDENDUM (1): and the review arm admits only `cannot-assess`. The
    // type already says so; this restates it as a runtime rule because the
    // record also arrives from untyped edges (a projected answer, a stored
    // row), and a reason that reached a judgement is not a reason at all.
    const namesOneUnjudgedReason = (record.terminalTransportOutcome == null)
      !== (record.reviewOutcome == null)
      && (record.reviewOutcome == null || record.reviewOutcome === "cannot-assess");
    if (record.mark === "HIDDEN-UNJUDGEABLE" && (
      record.callSiteKey == null || !namesOneUnjudgedReason
      || record.excludedFromServedNumber !== true
    )) {
      throw new TypedDomainError("HIDDEN_CONDITION_MARK_RECORD_INVALID", "Class H requires call site, exactly one unjudged reason, and served-number exclusion");
    }
    if (record.mark === "HIDDEN-LOW-SCORE" && (
      record.hiddenStrength == null || record.hiddenScoreThreshold == null
      || record.hiddenScoreThresholdSourceRef == null || record.excludedFromServedNumber !== false
    )) {
      throw new TypedDomainError("HIDDEN_CONDITION_MARK_RECORD_INVALID", "Class L requires strength, threshold provenance, and presentation-only status");
    }
    if (record.mark === "DERIVED-STANDING-UNREVIEWED" && (
      record.callSiteKey == null || !namesOneUnjudgedReason
      || record.excludedFromServedNumber !== false
      || record.judgedBasisCount == null || !Number.isInteger(record.judgedBasisCount)
      || record.judgedBasisCount < 1
    )) {
      throw new TypedDomainError(
        "DERIVED_STANDING_RECORD_INVALID",
        "Class D requires unjudged-review provenance, presentation inclusion, and a positive judged basis count"
      );
    }
    if (record.mark === "UNAUTHORED-BRANCH-HALTED" && (
      record.callSiteKey == null || record.plannedLegCount == null || record.terminalTransportOutcome == null
    )) {
      throw new TypedDomainError("HIDDEN_CONDITION_MARK_RECORD_INVALID", "Class N requires call site, planned leg count, and transport outcome");
    }
  }
}

/**
 * The provenance a class-H/class-D row carries for the reason it names. Null on
 * the transport arm, where the truth being reported is the ABSENCE of a review.
 */
export interface UnjudgedReasonProvenance {
  readonly reviewRef: string | null;
  readonly reviewNodeRef: string | null;
}

/**
 * T6 / S4-2 / J14 ADDENDUM — the disclosure reason must be TRUE, not merely
 * singular (codex r1 B1).
 *
 * `assertRequiredConditionMarkRecords` binds CARDINALITY: a class-H/class-D
 * record names exactly one reason, and the review arm names `cannot-assess`.
 * Neither that guard nor any CHECK constraint can see whether the reason is a
 * FACT, because the fact lives in another table. Two lies survived r2:
 *
 *   1. the review arm claiming `cannot-assess` for a node whose review said
 *      something else — or that has no review at all; and
 *   2. the transport arm claiming "the review never landed" for a node whose
 *      review is sitting in `ledger.node_review` (r2's own DDL probe asserted
 *      that row was ACCEPTED).
 *
 * This is the guard that closes both, by consulting the ledger. The caller does
 * not get to say WHICH review row it means: for the review arm the row is
 * looked up by `(runId, subjectRef)` — `ledger.node_review` is `UNIQUE
 * (node_id)`, so that is a function — and the resolved `node_review_id` is what
 * `ServeRepository.persist` stores, under a composite foreign key. A
 * mis-binding is therefore not merely refused, it is unspellable.
 *
 * WHAT ACTUALLY SERIALISES THIS (codex r2 N1): not the transaction. A
 * transaction alone would not stop a concurrent review INSERT landing between
 * this negative SELECT and the condition-mark INSERT — READ COMMITTED simply
 * would not see it. The exclusion comes from the exclusive per-run content
 * lease: `ServeRepository.persist` wraps its whole body in
 * `withRunContentLease(pool, [runId], …)`, and so does
 * `recordReviewWithMeasurements`, the ONLY production writer of
 * `ledger.node_review`. Both take the same `pg_advisory_lock` on that run, so
 * they cannot interleave at all. The transaction supplies ATOMICITY of the
 * marks with the answer; the lease supplies the MUTUAL EXCLUSION this guard
 * depends on. That is the floor J14's addendum (3) accepts in place of a
 * database trigger — and it holds only while the review writer keeps taking
 * the lease, which is why it is named here rather than left implicit.
 *
 * Marks outside class H/D carry no unjudged reason and are passed through
 * untouched — a HIDDEN-LOW-SCORE row names a threshold, not a review, and its
 * subject may perfectly well have a landed review.
 */
export async function resolveTrueUnjudgedReasons(
  source: Pool | PoolClient,
  runId: string,
  // MERGE (S06 x T6): widened from ConditionMarkRecord to the union `persist`
  // actually holds.
  //
  // CORRECTED in r4b (codex merge N1): an earlier version of this comment said
  // the resolver reads only `mark` and `subjectRef`. It reads FOUR fields —
  // `mark`, `subjectRef`, `reviewOutcome` and `terminalTransportOutcome` — and
  // the last two are exactly what select and validate T6's review-versus-
  // transport truth arm. Calling them irrelevant is the kind of note that lets a
  // later change to either one pass review unexamined.
  //
  // The widening is safe for a stronger reason than "few fields are read".
  // `PreservedConditionMarkRecord` is
  //   Omit<ConditionMarkRecord, "servedRootRule">
  //     & { servedRootRule: ServedRootRuleHistory | null }
  // so EVERY field has the same type and meaning in both arms; the ONLY
  // difference is `servedRootRule`, and this function never reads it. The body
  // is otherwise unchanged from integration 362299d1, so no T6 truth-binding
  // decision is weakened — the widening only stops the S06 catch-up path from
  // being unrepresentable at T6's call site.
  records: readonly PersistableConditionMarkRecord[]
): Promise<readonly UnjudgedReasonProvenance[]> {
  const carriesUnjudgedReason = (record: PersistableConditionMarkRecord): boolean =>
    record.mark === "HIDDEN-UNJUDGEABLE" || record.mark === "DERIVED-STANDING-UNREVIEWED";
  const subjects = [...new Set(records.filter(carriesUnjudgedReason).map((record) => record.subjectRef))];
  const landed = new Map<string, { readonly nodeReviewId: string; readonly outcome: string }>();
  if (subjects.length > 0) {
    const rows = await source.query<{ node_review_id: string; node_id: string; outcome: string }>(
      `SELECT node_review_id::text AS node_review_id, node_id::text AS node_id, outcome
         FROM ledger.node_review
        WHERE run_id = $1 AND node_id::text = ANY($2::text[])`,
      [runId, subjects]
    );
    for (const row of rows.rows) {
      landed.set(row.node_id, { nodeReviewId: row.node_review_id, outcome: row.outcome });
    }
  }
  return Object.freeze(records.map((record): UnjudgedReasonProvenance => {
    if (!carriesUnjudgedReason(record)) return Object.freeze({ reviewRef: null, reviewNodeRef: null });
    const review = landed.get(record.subjectRef);
    if (record.reviewOutcome != null) {
      // The arm says "the review landed and could not judge". The ledger must
      // hold that node's own review, and it must say exactly that.
      if (review === undefined || review.outcome !== record.reviewOutcome) {
        throw new TypedDomainError(
          "CONDITION_MARK_REVIEW_REASON_UNTRUE",
          `${record.mark} names review outcome ${record.reviewOutcome} for ${record.subjectRef}, `
          + `but the run's ledger holds ${review === undefined ? "no review" : review.outcome}`
        );
      }
      return Object.freeze({ reviewRef: review.nodeReviewId, reviewNodeRef: record.subjectRef });
    }
    if (record.terminalTransportOutcome != null && review !== undefined) {
      // The arm says "the review never landed". It did.
      throw new TypedDomainError(
        "CONDITION_MARK_TRANSPORT_REASON_UNTRUE",
        `${record.mark} names transport outcome ${record.terminalTransportOutcome} for ${record.subjectRef}, `
        + `but that node's review landed with outcome ${review.outcome}`
      );
    }
    return Object.freeze({ reviewRef: null, reviewNodeRef: null });
  }));
}

export class ServeRepository {
  readonly #liveness: LivenessRepository;
  readonly #memory: MemoryRepository;

  constructor(private readonly pool: Pool) {
    this.#liveness = new LivenessRepository(pool);
    this.#memory = new MemoryRepository(pool);
  }

  async recordMemoryQuestion(input: MemoryQuestionRegistration, ownership: RunOwnershipInput): Promise<void> {
    await this.#memory.recordQuestionAndMatch({
      key: {
        runId: input.runId,
        canonicalQuestionText: canonicalizeQuestionText(input.questionLine),
        callerScope: input.callerScope,
        askerScope: input.askerScope,
        settlementAct: null,
        questionType: null,
        declaredField: null,
        normalizedBinding: Object.freeze({}),
        frozenTerms: Object.freeze([]),
        frozenQuerySetHash: null,
        asOf: input.asOf,
        policyVersion: input.policyVersion,
        keyVersion: 1
      },
      decidedBy: "memory:database-predicate",
      ...(input.pullPolicy === undefined ? {} : { pullPolicy: input.pullPolicy }),
      ownership
    });
  }

  unlinkMemoryForAnswer(answerId: string, ownership: RunOwnershipInput, actorRef: string): Promise<{ readonly memoryLinkId: string } | null> {
    return this.#memory.unlinkForAnswer(answerId, ownership, actorRef);
  }

  async recordReplayEviction(servedNumberId: string): Promise<void> {
    const number = await this.pool.query<{
      run_id: string;
      answer_id: string;
      answer_version: number;
      number_ref: string;
      composed_text_id: string | null;
      content_ciphertext: CryptoEnvelope | null;
      segments: Array<{ segment_id: string; served_number_refs: string[] }> | null;
    }>(
      `SELECT answer.run_id, number.answer_id, number.answer_version, number.number_ref,
              composed.composed_text_id, composed.segments, composed.content_ciphertext
       FROM serve.served_number AS number
       JOIN serve.answer AS answer
         ON answer.answer_id = number.answer_id AND answer.answer_version = number.answer_version
       LEFT JOIN serve.composed_text AS composed ON composed.composed_text_id = answer.composed_text_id
       WHERE number.served_number_id = $1`,
      [servedNumberId]
    );
    const owner = number.rows[0];
    if (owner === undefined) {
      throw new TypedDomainError("SERVED_NUMBER_NOT_FOUND", `No served number ${servedNumberId} exists`);
    }
    await withRunContentLease(this.pool,[owner.run_id],async () => {
    const composedContent = owner.composed_text_id === null ? { segments: owner.segments ?? [] }
      : await decryptContentForRun<{ segments: Array<{ segment_id: string; served_number_refs: string[] }> }>(
        this.pool, owner.run_id, "serve.composed_text", owner.composed_text_id,
        owner.content_ciphertext, { segments: owner.segments ?? [] }
      );
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
         VALUES ($1,'EVICTED','MISSING-NUMBER',$2)`,
        [servedNumberId, await allocateSequence(client)]
      );
      for (const segment of composedContent.segments) {
        if (!segment.served_number_refs.includes(owner.number_ref)) continue;
        await client.query(
          `INSERT INTO serve.segment_suppression (
             answer_id, answer_version, segment_id, evicted_number_ref, at_seq
           ) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (answer_id, answer_version, segment_id, evicted_number_ref) DO NOTHING`,
          [owner.answer_id, owner.answer_version, segment.segment_id, owner.number_ref, await allocateSequence(client)]
        );
      }
    });
    });
  }

  async persist(input: PersistServeInput): Promise<{ readonly answerId: string; readonly answerVersion: number; readonly servedNumberId: string | null }> {
    if (input.result.terminal === "BLOCKED") {
      throw new TypedDomainError(
        "BLOCKED_TERMINAL_RETIRED",
        "DR-130 routes pre-compose blocking gates to COMPONENTS_ONLY with DEFECT"
      );
    }
    if (input.supersedes === undefined
      && input.compositionRawArtifactRef === null && compositionEvidenceRequired(input.result)) {
      throw new TypedDomainError(
        "MISSING_COMPOSITION_ARTIFACT",
        "Only a pre-composition terminal may omit composition evidence"
      );
    }
    if (input.supersedes === undefined && input.compositionRawArtifactRef === null && (
      input.compositionAttempt !== 0
      || input.segments.length !== 0
      || input.conformanceRawArtifactRefs.length !== 0
      || input.result.conformance.length !== 0
    )) {
      throw new TypedDomainError(
        "INCONSISTENT_PRE_COMPOSITION_EVIDENCE",
        "A pre-composition terminal cannot carry composition or conformance evidence"
      );
    }
    if (input.compositionRawArtifactRef !== null && input.compositionAttempt < 1) {
      throw new TypedDomainError("INVALID_COMPOSITION_ATTEMPT", "A composition artifact requires a positive attempt number");
    }
    const conditionMarkRecords = input.conditionMarkRecords ?? [];
    assertRequiredConditionMarkRecords(input.result.conditionMarks, conditionMarkRecords);
    // T10 / codex r1 B3 — the read vocabulary is wider than the write one, and
    // this is where the difference is enforced. A SUPERSEDING version may carry
    // a retired rule forward, because the version it describes really was
    // selected under it. A FRESH answer may not: there is no history to carry,
    // so a retired value there could only be a relabelling or a fabrication.
    if (input.supersedes === undefined) {
      const retired = conditionMarkRecords.find((record) => isRetiredServedRootRule(record.servedRootRule));
      if (retired !== undefined) {
        throw new TypedDomainError(
          "RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE",
          `${retired.mark} records the retired served-root rule "${retired.servedRootRule}" on a fresh answer; retired rules are readable history, never a new selection's rule`
        );
      }
    }
    if (conditionMarkRecords.some((record) =>
      record.subjectRef.trim() === "" || record.reason.trim() === "" || record.affectedNodeIds.length === 0
    )) {
      throw new TypedDomainError("CONDITION_MARK_AFFECTED_NODES_REQUIRED", "Every S09 mark must inspect affected nodes");
    }
    return withRunContentLease(this.pool,[input.runId],async () => {
    // DR-184's superseding path never re-derives: the prior answer's verdict
    // projection is carried forward below, so it needs no label basis.
    const verdict = deriveHonestVerdict({
      usableBasis: input.supersedes === undefined
        && input.servedNumber !== null
        && (input.result.terminal === "SERVED" || input.result.terminal === "DOWNGRADED"),
      reasonRef: `serve-gate:${input.result.gateTrace.at(-1) ?? input.result.terminal}`,
      labelBasis: input.verdictLabelBasis ?? null
    });
    // The mark and the label are ONE decision. A derivation that says the basis
    // was incomplete while the answer's marks stay silent is the facsimile shape
    // this record exists to prevent, so it stops loudly instead of persisting.
    if (verdict.derivation !== null) {
      const declared = input.result.conditionMarks.includes(LABEL_BASIS_INCOMPLETE_MARK);
      if (declared !== (verdict.derivation.marks.length > 0)) {
        throw new TypedDomainError(
          "LABEL_BASIS_DISCLOSURE_MISMATCH",
          `The derived label basis ${verdict.derivation.marks.length > 0 ? "IS" : "is NOT"} incomplete, but the answer's condition marks say otherwise`
        );
      }
    }
    const factBundleId = randomUUID();
    const factContent = await encryptAttestedContentForRun(
      this.pool, input.runId, "serve.fact_bundle", factBundleId,
      { facts: input.factBundle.facts, residualObjections: input.factBundle.residualObjections }
    );
    const nextComposedTextId = randomUUID();
    const storedSegments = input.segments.map((segment) => ({
      segment_id: segment.segmentId,
      text: segment.text,
      load_bearing: segment.loadBearing,
      served_number_refs: segment.servedNumberRefs
    }));
    const composedContent = input.supersedes !== undefined || input.compositionRawArtifactRef === null
      ? null
      : await encryptAttestedContentForRun(
        this.pool, input.runId, "serve.composed_text", nextComposedTextId,
        { segments: storedSegments }
      );
    return withWriteTransaction(this.pool, async (client) => {
      const prior = input.supersedes === undefined ? null : await client.query<{
        answer_id: string;
        answer_version: number;
        run_id: string;
        work_item_id: string;
        composed_text_id: string | null;
        conformance_record_id: string | null;
        serve_state: "COMPOSED" | "RECOMPOSED_ONCE" | "COMPONENTS_ONLY";
        verdict_state: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null;
        verdict_unavailable: { readonly reason_ref: string } | null;
      }>(
        `SELECT answer_id, answer_version, run_id, work_item_id,
                composed_text_id, conformance_record_id, serve_state,
                verdict_state, verdict_unavailable
         FROM serve.answer
         WHERE answer_id=$1
         ORDER BY answer_version DESC
         LIMIT 1`,
        [input.supersedes?.answerId]
      );
      const priorAnswer = prior?.rows[0];
      if (input.supersedes !== undefined && priorAnswer === undefined) {
        throw new TypedDomainError("SUPERSEDED_ANSWER_NOT_FOUND", input.supersedes.answerId);
      }
      if (priorAnswer !== undefined && (
        priorAnswer.run_id !== input.runId || priorAnswer.work_item_id !== input.workItemId
      )) {
        throw new TypedDomainError("SUPERSEDED_ANSWER_IDENTITY_MISMATCH", input.supersedes!.answerId);
      }
      const answerVersion = priorAnswer === undefined
        ? input.factBundleVersion
        : priorAnswer.answer_version + 1;
      const facts = await client.query<{ fact_bundle_id: string }>(
        `INSERT INTO serve.fact_bundle (
          fact_bundle_id,run_id,facts,residual_objections,content_hash,
          content_hash_version,version,content_ciphertext,content_attestation
        ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8::jsonb,$9) RETURNING fact_bundle_id`,
        [
          factBundleId, input.runId,
          JSON.stringify(factContent === null ? input.factBundle.facts : []),
          JSON.stringify(factContent === null ? input.factBundle.residualObjections : []),
          factContent === null ? input.factBundleContentHash : null,
          factContent === null ? 1 : 2,
          answerVersion,
          factContent === null ? null : JSON.stringify(factContent.envelope),factContent?.attestation ?? null
        ]
      );
      const storedFactBundleId = facts.rows[0]!.fact_bundle_id;
      const composed = priorAnswer !== undefined || input.compositionRawArtifactRef === null ? null : await client.query<{ composed_text_id: string }>(
        `INSERT INTO serve.composed_text (
          composed_text_id,fact_bundle_id,segments,raw_artifact_ref,attempt,content_ciphertext,content_attestation
        ) VALUES ($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7) RETURNING composed_text_id`,
        [nextComposedTextId, storedFactBundleId,
        JSON.stringify(composedContent === null ? storedSegments : []),
        input.compositionRawArtifactRef, input.compositionAttempt,
        composedContent === null ? null : JSON.stringify(composedContent.envelope),composedContent?.attestation ?? null]
      );
      const composedTextId = priorAnswer?.composed_text_id ?? composed?.rows[0]!.composed_text_id ?? null;
      const conformance = priorAnswer !== undefined || composedTextId === null ? null : await client.query<{ conformance_record_id: string }>(
        `INSERT INTO serve.conformance_record (
          composed_text_id, segment_results, coverage_mode,
          raw_artifact_refs, sealed_at_seq
        ) VALUES ($1,$2::jsonb,$3,$4::jsonb,$5)
        RETURNING conformance_record_id`,
        [
          composedTextId,
          JSON.stringify(input.result.conformance),
          input.result.coverageMode,
          JSON.stringify(input.conformanceRawArtifactRefs),
          await allocateSequence(client)
        ]
      );
      const serveState = priorAnswer?.serve_state ?? (input.result.terminal === "COMPONENTS_ONLY"
        ? "COMPONENTS_ONLY"
        : input.compositionAttempt > 1 ? "RECOMPOSED_ONCE" : "COMPOSED");
      const servedNumberEventAtSeq = input.servedNumber === null ? null : await allocateSequence(client);
      const answerSealedAtSeq = await allocateSequence(client);
      const conformanceRecordId = priorAnswer?.conformance_record_id
        ?? conformance?.rows[0]!.conformance_record_id ?? null;
      const answer = await client.query<{ answer_id: string }>(
        `INSERT INTO serve.answer (
          answer_id, answer_version, run_id, work_item_id, terminal, serve_state, verdict_state,
          answer_form, condition_marks, fact_bundle_id, composed_text_id,
          conformance_record_id, sealed_at_seq, confidence_band, band_ceiling,
          reversal_point, builds_on_previous, badges, verdict_unavailable, memory_disclosure
        ) VALUES (COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb)
        RETURNING answer_id`,
        [
          priorAnswer?.answer_id ?? null,
          answerVersion,
          input.runId,
          input.workItemId,
          input.result.terminal,
          serveState,
          priorAnswer === undefined ? verdict.verdictState : priorAnswer.verdict_state,
          JSON.stringify(input.result.answerForm),
          JSON.stringify(input.result.conditionMarks),
          storedFactBundleId,
          composedTextId,
          conformanceRecordId,
          answerSealedAtSeq,
          input.result.confidenceBand,
          input.result.bandCeiling === null ? null : JSON.stringify({
            label: input.result.bandCeiling.label,
            basis: input.result.bandCeiling.basis,
            register_row_key: input.result.bandCeiling.registerRowKey,
            register_version: input.result.bandCeiling.registerVersion,
            source_ref: input.result.bandCeiling.sourceRef,
            lift_path: input.result.bandCeiling.liftPath
          }),
          input.result.projections.reversalPoint,
          JSON.stringify({
            value: input.result.projections.buildsOnPrevious.value,
            answer_ref: input.result.projections.buildsOnPrevious.answerRef
          }),
          JSON.stringify(input.factBundle.badges),
          priorAnswer !== undefined
            ? priorAnswer.verdict_unavailable === null
              ? null
              : JSON.stringify(priorAnswer.verdict_unavailable)
            : verdict.unavailable === null
            ? null
            : JSON.stringify({ reason_ref: verdict.unavailable.reasonRef }),
          input.result.projections.memoryDisclosure === null
            ? null
            : JSON.stringify(input.result.projections.memoryDisclosure)
        ]
      );
      // T9 / J25 + J29 (+ ADDENDUM) — the loop-round records become DURABLE
      // here, inside the answer's own write transaction.
      //
      // NO REQUEST BODY. The frozen SPEC asks for recorded-request ASSERTIONS
      // and loop-round RECORDS; it never asks for the request to be persisted.
      // The carrier I kept for the verbatim-objection claim could not prove it
      // anyway: the SAME in-memory object feeds the provider packet and the row,
      // so the row showed the object existed, never that it was the request AS
      // SENT. It is gone, and with it the encryption machinery it needed.
      //
      // What remains is structural facts and TYPED PRODUCER-BOUND REFERENCES.
      for (const round of input.result.loopRounds ?? []) {
        // codex r3 B2: "same run" is not a producer binding. Each reference is
        // resolved through the LEDGER ENTRY that recorded it — this run, this
        // work item, a successful MODEL_CALL, at the EXPECTED call site — so an
        // unrelated judge artifact from the same run can no longer stand in.
        // codex r4 B1 — ROLE IS A PREDICATE. Each reference is bound to the
        // call site its ROLE must have occupied, derived HERE from the typed
        // role, the round's own synthesizer stage and its round number through
        // the ONE builder the runner records with. Before this, `role` reached
        // only the error text: the supplied key was checked for a `:<round>`
        // suffix and then handed to the ledger as given, so a real
        // `COMPOSER:SYNTHESIZER:INITIAL:1` artifact offered as the verdict
        // passed both checks and a synthesizer response committed as the
        // evaluator verdict. No stored round column is needed for this — every
        // input is already in the round record.
        for (const bound of [
          {
            ref: round.candidateRef,
            callSiteKey: round.candidateCallSiteKey,
            role: "SYNTHESIZER" as const,
            expected: synthesisCallSiteKey({
              role: "SYNTHESIZER",
              stage: round.synthesizerRequest.stage,
              round: round.round
            })
          },
          {
            ref: round.verdictRef,
            callSiteKey: round.verdictCallSiteKey,
            role: "EVALUATOR" as const,
            expected: synthesisCallSiteKey({ role: "EVALUATOR", round: round.round })
          }
        ]) {
          // EQUALITY, not a suffix. This subsumes the round check it replaces —
          // the round is part of the derived key — and it is what refuses a
          // real artifact recorded under the other role's call site.
          if (bound.callSiteKey !== bound.expected) {
            throw new TypedDomainError(
              "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED",
              `Round ${String(round.round)}'s ${bound.role} call site ${bound.callSiteKey} is not this round's ${bound.role} call site ${bound.expected}`
            );
          }
          const producer = await client.query<{ raw_artifact_ref: string }>(
            `SELECT entry.raw_artifact_ref::text
               FROM ledger.ledger_entry AS entry
               JOIN ledger.raw_artifact AS artifact
                 ON artifact.raw_artifact_id = entry.raw_artifact_ref
                AND artifact.run_id = entry.run_id
              WHERE entry.run_id=$1 AND entry.subject_item_id=$2
                AND entry.action_kind='MODEL_CALL' AND entry.outcome='OK'
                AND entry.call_site_key=$3 AND entry.raw_artifact_ref=$4::uuid`,
            [input.runId, input.workItemId, bound.expected, bound.ref]
          );
          if (producer.rows.length !== 1) {
            throw new TypedDomainError(
              "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED",
              `Round ${String(round.round)}'s ${bound.role} reference ${bound.ref} is not the artifact this run recorded at ${bound.callSiteKey}`
            );
          }
        }
        await client.query(
          `INSERT INTO serve.synthesis_round (
             answer_id, answer_version, run_id, round, synthesizer_stage,
             candidate_artifact_ref, candidate_call_site_key,
             evaluator_artifact_ref, evaluator_call_site_key,
             evaluator_satisfied, sealed_at_seq
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            answer.rows[0]!.answer_id,
            answerVersion,
            input.runId,
            round.round,
            round.synthesizerRequest.stage,
            round.candidateRef,
            round.candidateCallSiteKey,
            round.verdictRef,
            round.verdictCallSiteKey,
            round.verdict.satisfied,
            await allocateSequence(client)
          ]
        );
      }
      // T6 / J14 ADDENDUM — the reason each class-H/class-D record names is
      // checked against the ledger HERE. Two mechanisms do two different jobs,
      // and the transaction is NOT the one that excludes a concurrent review:
      // it makes this check atomic with the answer version, so a later failure
      // rolls the whole version back. What stops a review INSERT landing
      // between the negative SELECT and the condition-mark INSERT is the shared
      // per-run content lease — `ServeRepository.persist` takes it above, and
      // `recordReviewWithMeasurements`, the review writer, takes the same one.
      // The mutual-exclusion note on `resolveTrueUnjudgedReasons` carries the
      // full argument and the condition under which it expires.
      // The review arm's provenance is RESOLVED rather than accepted: what goes
      // into `review_ref` is the row the ledger actually holds.
      const unjudgedProvenance = await resolveTrueUnjudgedReasons(client, input.runId, conditionMarkRecords);
      for (const [recordIndex, record] of conditionMarkRecords.entries()) {
        const provenance = unjudgedProvenance[recordIndex]!;
        const mark = await client.query<{ condition_mark_id: string }>(
          `INSERT INTO serve.condition_mark (
             answer_id, answer_version, mark, scope, subject_ref, reason, lift_path, served_root_rule,
             call_site_key, planned_leg_count, terminal_transport_outcome, review_outcome,
             review_ref, review_node_ref, hidden_strength,
             hidden_score_threshold, hidden_score_threshold_source_ref, excluded_from_served_number,
             judged_basis_count, at_seq
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING condition_mark_id`,
          [
            answer.rows[0]!.answer_id,
            answerVersion,
            record.mark,
            record.scope,
            record.subjectRef,
            record.reason,
            record.liftPath,
            record.servedRootRule,
            record.callSiteKey ?? null,
            record.plannedLegCount ?? null,
            record.terminalTransportOutcome ?? null,
            record.reviewOutcome ?? null,
            provenance.reviewRef,
            provenance.reviewNodeRef,
            record.hiddenStrength ?? null,
            record.hiddenScoreThreshold ?? null,
            record.hiddenScoreThresholdSourceRef ?? null,
            record.excludedFromServedNumber ?? null,
            record.judgedBasisCount ?? null,
            await allocateSequence(client)
          ]
        );
        for (const nodeId of record.affectedNodeIds) {
          await client.query(
            `INSERT INTO serve.condition_mark_node (condition_mark_id, node_id)
             VALUES ($1,$2)`,
            [mark.rows[0]!.condition_mark_id, nodeId]
          );
        }
      }
      const servedNumber = input.servedNumber === null ? null : await client.query<{ served_number_id: string }>(
        `INSERT INTO serve.served_number (
          run_id, value, number_kind, source_ref, producer,
          replay_handle, provenance_ref, answer_id, answer_version, number_ref
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING served_number_id`,
        [
          input.runId,
          input.servedNumber.value,
          input.servedNumber.numberKind,
          input.servedNumber.sourceRef,
          input.servedNumber.producer,
          input.servedNumber.replayHandle,
          input.servedNumber.propagationRunId,
          answer.rows[0]!.answer_id,
          answerVersion,
          input.servedNumber.numberRef
        ]
      );
      if (servedNumber !== null) await client.query(
        `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
         VALUES ($1,'PRESENT',NULL,$2)`,
        [servedNumber.rows[0]!.served_number_id, servedNumberEventAtSeq]
      );
      if (priorAnswer === undefined) {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1,$2,'TERMINAL',$3::jsonb)`,
          [input.runId, await allocateSequence(client), JSON.stringify(input.result.terminal)]
        );
      }
      return {
        answerId: answer.rows[0]!.answer_id,
        answerVersion,
        servedNumberId: servedNumber?.rows[0]!.served_number_id ?? null
      };
    });
    });
  }

  async readReviewCatchUpDisclosedNodeIds(
    answerId: string,
    answerVersion: number
  ): Promise<readonly string[]> {
    const result = await this.pool.query<{ node_id: string }>(
      `SELECT DISTINCT link.node_id::text
       FROM serve.condition_mark AS mark
       JOIN serve.condition_mark_node AS link ON link.condition_mark_id=mark.condition_mark_id
       WHERE mark.answer_id=$1 AND mark.answer_version=$2
         AND mark.mark IN ('HIDDEN-UNJUDGEABLE','DERIVED-STANDING-UNREVIEWED')
       ORDER BY link.node_id::text`,
      [answerId, answerVersion]
    );
    return Object.freeze(result.rows.map((row) => row.node_id));
  }

  /**
   * T9 / J25 — read the persisted loop-round records for one sealed answer
   * version, in round order.
   *
   * This exists so the DoD's round assertions can be made where a READER
   * stands, on the far side of the write. A test that inspects the array
   * `runServeGateChain` just returned proves the function returned it and
   * nothing more; this method is what lets the same claim be made about the
   * record.
   */
  /**
   * T9 / J25 + J29 — read the persisted loop-round records for one sealed answer
   * version, in round order.
   *
   * OWNERSHIP AND LEASE, like every other content reader. codex r2 B1: the first
   * version took only `(answerId, answerVersion)` and returned plaintext, so any
   * caller holding another answer's UUID could pull its whole transcript, and no
   * lease guarded the decrypt. It now normalizes ownership exactly as
   * `readAnswerProjection` does, reads under the run's content lease, and
   * decrypts the one carrier this table holds.
   *
   * The candidate statement, the evaluator request and the verdict are NOT read
   * from here — they are not stored here. Each round hands back the two typed
   * artifact keys so a caller resolves them through `ledger.raw_artifact`.
   */
  async readSynthesisRounds(
    answerId: string,
    ownership: RunOwnershipInput,
    answerVersion: number
  ): Promise<readonly PersistedSynthesisRound[]> {
    const access = normalizeRunOwnership(ownership);
    const rows = await this.pool.query<{
      run_id: string;
      round: number;
      synthesizer_stage: "INITIAL" | "RETRY";
      candidate_artifact_ref: string;
      candidate_call_site_key: string;
      evaluator_artifact_ref: string;
      evaluator_call_site_key: string;
      evaluator_satisfied: boolean;
    }>(
      `SELECT synthesis_round.run_id::text, synthesis_round.round,
              synthesis_round.synthesizer_stage,
              synthesis_round.candidate_artifact_ref::text, synthesis_round.candidate_call_site_key,
              synthesis_round.evaluator_artifact_ref::text, synthesis_round.evaluator_call_site_key,
              synthesis_round.evaluator_satisfied
         FROM serve.synthesis_round AS synthesis_round
         JOIN serve.answer AS answer
           ON answer.answer_id = synthesis_round.answer_id
          AND answer.answer_version = synthesis_round.answer_version
         JOIN core.run AS run ON run.run_id = answer.run_id
        WHERE synthesis_round.answer_id=$1 AND synthesis_round.answer_version=$2
          AND core.run_is_owned_by(run.run_id,$3,$4)
        ORDER BY synthesis_round.round`,
      [answerId, answerVersion, access.ownerRef, access.legacyAskerId]
    );
    if (rows.rows.length === 0) return Object.freeze([]);
    // The lease is kept even though this table now holds no content: the rows
    // point AT content carriers, and a reader that resolves them must not race
    // an erasure that is shredding the run's key underneath it.
    return withRunContentLease(this.pool, [rows.rows[0]!.run_id], async () => Object.freeze(
      rows.rows.map((row) => Object.freeze({
        round: Number(row.round),
        synthesizerStage: row.synthesizer_stage,
        candidateArtifactRef: row.candidate_artifact_ref,
        candidateCallSiteKey: row.candidate_call_site_key,
        evaluatorArtifactRef: row.evaluator_artifact_ref,
        evaluatorCallSiteKey: row.evaluator_call_site_key,
        evaluatorSatisfied: row.evaluator_satisfied
      }))
    ));
  }

  async readReviewCatchUpSource(runId: string): Promise<ReviewCatchUpSource> {
    return this.#memory.withDisclosureContentLease([runId],async () => {
    const head = await this.pool.query<{
      effective_asker_id: string;
      owner_ref: string | null;
      legacy_asker_id: string | null;
      answer_id: string;
      answer_version: number;
      work_item_id: string;
      fact_bundle_id: string;
      facts: string[];
      residual_objections: string[];
      facts_content_ciphertext: CryptoEnvelope | null;
      content_hash: string;
      fact_bundle_version: number;
      badges: string[];
      condition_marks: string[];
      reversal_point: string;
      builds_on_previous: FactBundle["buildsOnPrevious"];
      memory_disclosure: MemoryDisclosure | null;
      node_id: string | null;
      number_ref: string | null;
      value: number | null;
      number_kind: string | null;
      source_ref: string | null;
      producer: string | null;
      replay_handle: string | null;
      propagation_run_id: string | null;
    }>(
      `SELECT CASE WHEN latest_owner.owner_ref IS NULL
                THEN run.asker_id ELSE 'owner:' || latest_owner.owner_ref::text
              END AS effective_asker_id,
              latest_owner.owner_ref,
              CASE WHEN latest_owner.owner_ref IS NULL THEN run.asker_id ELSE NULL END AS legacy_asker_id,
              answer.answer_id::text, answer.answer_version,
              answer.work_item_id::text, facts.fact_bundle_id, facts.facts,
              facts.residual_objections, facts.content_ciphertext AS facts_content_ciphertext,
              facts.content_hash, facts.version AS fact_bundle_version,
              answer.badges, answer.condition_marks, answer.reversal_point,
              answer.builds_on_previous, answer.memory_disclosure,
              node.node_id::text, number.number_ref, number.value,
              number.number_kind, number.source_ref, number.producer, number.replay_handle,
              number.provenance_ref::text AS propagation_run_id
       FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id=answer.run_id
       LEFT JOIN LATERAL (
         SELECT event.owner_ref
         FROM core.run_ownership_event AS event
         WHERE event.run_id=run.run_id
         ORDER BY event.at_seq DESC LIMIT 1
       ) AS latest_owner ON true
       JOIN serve.fact_bundle AS facts ON facts.fact_bundle_id=answer.fact_bundle_id
       LEFT JOIN serve.served_number AS number
         ON number.answer_id=answer.answer_id AND number.answer_version=answer.answer_version
       LEFT JOIN core.node AS node
         ON node.run_id=answer.run_id AND node.provenance_ref::text=number.source_ref
       WHERE answer.run_id=$1
       ORDER BY answer.answer_version DESC
       LIMIT 1`,
      [runId]
    );
    const row = head.rows[0];
    if (row === undefined) throw new TypedDomainError("CATCH_UP_ANSWER_NOT_FOUND", runId);
    const factContent = await decryptContentForRun<{
      facts: string[];
      residualObjections: string[];
    }>(
      this.pool, runId, "serve.fact_bundle", row.fact_bundle_id,
      row.facts_content_ciphertext,
      { facts: row.facts, residualObjections: row.residual_objections }
    );
    const ownership = row.owner_ref === null
      ? Object.freeze({ ownerRef: null, legacyAskerId: row.legacy_asker_id })
      : Object.freeze({ ownerRef: row.owner_ref, legacyAskerId: null });
    const answer = await this.readAnswerProjection(row.answer_id, ownership, Number(row.answer_version));
    if (answer === null) throw new TypedDomainError("CATCH_UP_ANSWER_NOT_FOUND", runId);
    return Object.freeze({
      askerId: row.effective_asker_id,
      answerId: row.answer_id,
      answerVersion: Number(row.answer_version),
      workItemId: row.work_item_id,
      answer,
      factBundle: Object.freeze({
        facts: Object.freeze([...factContent.facts]),
        residualObjections: Object.freeze([...factContent.residualObjections]),
        badges: Object.freeze([...row.badges]),
        conditionMarks: Object.freeze([...row.condition_marks]),
        reversalPoint: row.reversal_point,
        buildsOnPrevious: Object.freeze({ ...row.builds_on_previous }),
        memoryDisclosure: row.memory_disclosure
      }),
      factBundleContentHash: row.content_hash,
      factBundleVersion: Number(row.fact_bundle_version),
      servedNumber: row.value === null || row.node_id === null ? null : Object.freeze({
        nodeId: row.node_id,
        numberRef: row.number_ref!,
        value: Number(row.value),
        numberKind: row.number_kind!,
        sourceRef: row.source_ref!,
        producer: row.producer!,
        replayHandle: row.replay_handle!,
        propagationRunId: row.propagation_run_id!
      })
    });
    });
  }

  async readAnswerProjection(answerId: string, ownership: RunOwnershipInput, version?: number): Promise<Answer | null> {
    const access = normalizeRunOwnership(ownership);
    const answer = await this.pool.query<{
      answer_id: string;
      answer_version: number;
      run_id: string;
      question_line: string;
      run_content_ciphertext: CryptoEnvelope | null;
      fact_bundle_id: string;
      facts: string[];
      facts_content_ciphertext: CryptoEnvelope | null;
      composed_text_id: string | null;
      composed_content_ciphertext: CryptoEnvelope | null;
      terminal: Answer["terminal"];
      serve_state: Answer["serve_state"];
      verdict_state: Answer["verdict_state"];
      verdict_unavailable: Answer["verdict_unavailable"];
      confidence_band: string | null;
      band_ceiling: Answer["band_ceiling"];
      answer_form: unknown;
      segments: Answer["composed_text"] | null;
      residual_objections: string[];
      condition_marks: string[];
      badges: string[];
      reversal_point: string;
       builds_on_previous: Answer["builds_on_previous"];
       memory_disclosure: Answer["memory_disclosure"];
       risk_tier: Answer["risk_tier"];
       tier_source: Answer["tier_source"];
       tier_provenance_ref: string;
       envelope_basis: Readonly<Record<string, unknown>>;
       envelope_state: Answer["cost_envelope"]["state"];
       envelope_consumed: number;
       composition_budget_tier: Answer["composition_budget_tier"];
      conformance_segment_results: ConformanceJudgement[] | null;
      conformance_coverage_mode: ServeGateResult["coverageMode"] | null;
      sealed_at_seq: number | string;
      as_of: Date;
      relevant_as_of: Date;
    }>(
      `SELECT answer.answer_id, answer.answer_version, answer.run_id, run.question_line,
              run.content_ciphertext AS run_content_ciphertext,
              facts.fact_bundle_id, facts.facts,
              facts.content_ciphertext AS facts_content_ciphertext,
              composed.composed_text_id,
              composed.content_ciphertext AS composed_content_ciphertext,
              answer.terminal,
              answer.serve_state, answer.verdict_state, answer.verdict_unavailable,
              answer.confidence_band, answer.band_ceiling,
              answer.answer_form, composed.segments, facts.residual_objections, answer.condition_marks,
               answer.badges, answer.reversal_point, answer.builds_on_previous, answer.memory_disclosure, answer.sealed_at_seq,
               run.risk_tier, run.tier_source, run.tier_provenance_ref, run.envelope_basis,
               (SELECT value_json #>> '{}' FROM core.run_progress_event
                WHERE run_id = run.run_id AND kind = 'ENVELOPE_STATE'
                ORDER BY at_seq DESC LIMIT 1) AS envelope_state,
               (SELECT (value_json #>> '{}')::integer FROM core.run_progress_event
                WHERE run_id = run.run_id AND kind = 'ENVELOPE_CONSUMED'
                ORDER BY at_seq DESC LIMIT 1) AS envelope_consumed,
               run.composition_budget_tier, conformance.segment_results AS conformance_segment_results,
              conformance.coverage_mode AS conformance_coverage_mode,
              run.as_of, answer.relevant_as_of
       FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id = answer.run_id
       JOIN core.work_item AS work ON work.settled_artifact_ref = answer.answer_id
       JOIN serve.fact_bundle AS facts ON facts.fact_bundle_id = answer.fact_bundle_id
       LEFT JOIN serve.composed_text AS composed ON composed.composed_text_id = answer.composed_text_id
       LEFT JOIN serve.conformance_record AS conformance
         ON conformance.conformance_record_id = answer.conformance_record_id
       WHERE answer.answer_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3)
         AND ($4::integer IS NULL OR answer.answer_version = $4)
       ORDER BY answer.answer_version DESC LIMIT 1`,
      [answerId, access.ownerRef, access.legacyAskerId, version ?? null]
    );
    const row = answer.rows[0];
    if (row === undefined) return null;
    return this.#memory.withDisclosureContentLease([row.run_id],async () => {
    const [runContent, factContent, composedContent] = await Promise.all([
      decryptContentForRun<{ questionLine: string }>(
        this.pool, row.run_id, "core.run", row.run_id, row.run_content_ciphertext,
        { questionLine: row.question_line }
      ),
      decryptContentForRun<{ facts: string[]; residualObjections: string[] }>(
        this.pool, row.run_id, "serve.fact_bundle", row.fact_bundle_id,
        row.facts_content_ciphertext,
        { facts: row.facts, residualObjections: row.residual_objections }
      ),
      row.composed_text_id === null
        ? Promise.resolve({ segments: row.segments ?? [] })
        : decryptContentForRun<{ segments: Answer["composed_text"] }>(
          this.pool, row.run_id, "serve.composed_text", row.composed_text_id,
          row.composed_content_ciphertext, { segments: row.segments ?? [] }
        )
    ]);
    const staleness = await this.#liveness.readSubjectStaleness({
      runId: row.run_id,
      subjectKind: "ANSWER",
      subjectRef: row.answer_id,
      relevantAsOf: row.relevant_as_of
    });
    const [nodes, edges] = await Promise.all([
      this.readNodesForRun(row.run_id, row.answer_id, row.answer_version),
      this.readEdgesForRun(row.run_id)
    ]);
    const numbers = await this.pool.query<{
      value: number;
      number_kind: string;
      source_ref: string;
      producer: string;
      replay_handle: string;
      provenance_ref: string;
      events: Array<{
        status: "PRESENT" | "EVICTED";
        reason: string | null;
        atSequence: number | string;
      }>;
    }>(
      `SELECT number.value, number.number_kind, number.source_ref, number.producer,
              number.replay_handle, number.provenance_ref::text,
              jsonb_agg(jsonb_build_object(
                'status', event.status, 'reason', event.reason, 'atSequence', event.at_seq
              ) ORDER BY event.at_seq) AS events
       FROM serve.served_number AS number
       JOIN serve.served_number_event AS event
         ON event.served_number_id = number.served_number_id
       WHERE number.answer_id = $1 AND number.answer_version = $2
       GROUP BY number.served_number_id, number.value, number.number_kind, number.source_ref,
                number.producer, number.replay_handle, number.provenance_ref
       ORDER BY number.served_number_id`,
      [row.answer_id, row.answer_version]
    );
    const currentRead = version === undefined;
    const eventStreams = numbers.rows.map((number) => number.events.map((event) => ({
      status: event.status,
      reason: event.reason,
      atSequence: Number(event.atSequence)
    })));
    const allEvents = eventStreams.flat();
    const answerServeState = deriveAnswerServeState({
      sealedServeState: row.serve_state,
      numberEvents: allEvents,
      readMode: currentRead ? "CURRENT" : "SEALED_VERSION"
    });
    const hasEviction = currentRead && allEvents.some((event) => event.status === "EVICTED");
    const conditionMarks = row.condition_marks.map((mark) => ConditionMarkSchema.parse(mark));
    for (const candidate of answerServeState.conditionMarks) {
      const mark = ConditionMarkSchema.parse(candidate);
      if (!conditionMarks.includes(mark)) conditionMarks.push(mark);
    }
    const numberSlots: Answer["number_slots"] = numbers.rows.map((number, index) => {
      const stream = eventStreams[index]!;
      const status = foldServedNumberEvents(
        stream,
        currentRead ? undefined : Number(row.sealed_at_seq)
      ).status;
      if (status === "EVICTED") return { status, mark: "MISSING-NUMBER" };
      return {
        status: "PRESENT",
        number: {
          value: Number(number.value),
          kind: number.number_kind,
          source: number.source_ref,
          producer: number.producer,
          provenance_ref: number.provenance_ref,
          replay_handle: number.replay_handle
        }
      };
    });
    const shadowSuppressions = await this.pool.query<Answer["shadow_suppressions"][number]>(
      `SELECT gate, subject_ref, would_have_suppressed, unlock_condition
       FROM serve.shadow_suppression
       WHERE answer_id = $1 AND answer_version = $2
       ORDER BY at_seq`,
      [row.answer_id, row.answer_version]
    );
    // DR-139(4): the served answer names each condition-mark record — the
    // owed-but-unexecuted checks ride here, one typed record per battery row.
    const conditionMarkRecords = await this.pool.query<{
      mark: string;
      scope: "answer" | "node";
      subject_ref: string;
      reason: string;
      lift_path: string | null;
      // T10 / codex r1 B3: the READ vocabulary. This row may have been sealed
      // before migration 0055, in which case it carries the retired rule — the
      // migration preserves it deliberately. Typing it live-only here made the
      // projection assert that a value it really returns cannot exist.
      served_root_rule: ServedRootRuleHistory | null;
      call_site_key: string | null;
      planned_leg_count: number | null;
      terminal_transport_outcome: "TIMED_OUT" | "FAILED" | null;
      // T6 / J14 ADDENDUM (1): narrowed at the READ because the column is
      // narrowed at the WRITE — `condition_mark_review_outcome_check` admits
      // only `cannot-assess` in this arm, VALID over the existing rows.
      review_outcome: "cannot-assess" | null;
      hidden_strength: number | null;
      hidden_score_threshold: number | null;
      hidden_score_threshold_source_ref: string | null;
      excluded_from_served_number: boolean | null;
      judged_basis_count: number | null;
      affected_node_ids: string[];
    }>(
      `SELECT mark, scope, subject_ref, reason, lift_path, served_root_rule,
              call_site_key, planned_leg_count, terminal_transport_outcome, review_outcome,
              hidden_strength, hidden_score_threshold, hidden_score_threshold_source_ref,
              excluded_from_served_number, judged_basis_count,
              ARRAY(SELECT link.node_id::text FROM serve.condition_mark_node AS link
                    WHERE link.condition_mark_id=serve.condition_mark.condition_mark_id
                    ORDER BY link.node_id) AS affected_node_ids
       FROM serve.condition_mark
       WHERE answer_id = $1 AND answer_version = $2
       ORDER BY at_seq`,
      [row.answer_id, row.answer_version]
    );
    const abstention = await this.pool.query<Answer["abstention"] extends infer T ? Exclude<T, null> : never>(
      `SELECT kind, question_class, risk_tier, price, register_row_key,
              register_version::integer, register_source_ref, unlock_condition, ledger_unknown_ref
       FROM serve.abstention
       WHERE answer_id = $1 AND answer_version = $2
       ORDER BY at_seq LIMIT 1`,
      [row.answer_id, row.answer_version]
    );
    const memoryDisclosure = await this.#memory.readDisclosure(row.run_id);
    const valueHinges = await this.pool.query<Answer["value_hinges"][number]>(
      `SELECT hinge.value_hinge_id::text AS value_hinge_ref,
              hinge.left_option_id AS left_option_ref, hinge.right_option_id AS right_option_ref,
              hinge.criterion_ids AS criterion_refs, hinge.weight_source, hinge.weight_owner,
              reversal.rejected_criteria
       FROM core.value_hinge AS hinge
       JOIN LATERAL (
         SELECT point.rejected_criteria FROM core.reversal_point AS point
         WHERE point.value_hinge_id=hinge.value_hinge_id ORDER BY point.at_seq DESC LIMIT 1
       ) AS reversal ON true
       WHERE hinge.run_id=$1 ORDER BY hinge.at_seq`, [row.run_id]
    );
    return {
      answer_id: row.answer_id,
      answer_version: row.answer_version,
      run_ref: row.run_id,
      question_line: runContent.questionLine,
      terminal: hasEviction ? "COMPONENTS_ONLY" : row.terminal,
      verdict_state: hasEviction ? null : row.verdict_state,
      verdict_unavailable: hasEviction
        ? { reason_ref: "served-number:MISSING-NUMBER" }
        : row.verdict_unavailable,
      confidence_band: hasEviction ? null : row.confidence_band,
      band_ceiling: hasEviction ? null : row.band_ceiling,
      answer_form: hasEviction ? null : row.answer_form,
      serve_state: answerServeState.serveState,
      composed_text: hasEviction ? [] : composedContent.segments,
      number_slots: numberSlots,
      abstention: abstention.rows[0] ?? null,
      shadow_suppressions: shadowSuppressions.rows,
      nodes,
      edges,
      badges: staleness.badge === null || row.badges.includes(staleness.badge)
        ? row.badges
        : [...row.badges, staleness.badge],
      residual_objections: factContent.residualObjections,
      value_hinges: valueHinges.rows,
      condition_marks: conditionMarks,
      condition_mark_records: conditionMarkRecords.rows.map((record) => ({
        mark: ConditionMarkSchema.parse(record.mark),
        scope: record.scope,
        subject_ref: record.subject_ref,
        reason: record.reason,
        lift_path: record.lift_path,
        served_root_rule: record.served_root_rule,
        call_site_key: record.call_site_key,
        planned_leg_count: record.planned_leg_count,
        terminal_transport_outcome: record.terminal_transport_outcome,
        review_outcome: record.review_outcome,
        hidden_strength: record.hidden_strength === null ? null : Number(record.hidden_strength),
        hidden_score_threshold: record.hidden_score_threshold === null ? null : Number(record.hidden_score_threshold),
        hidden_score_threshold_source_ref: record.hidden_score_threshold_source_ref,
        excluded_from_served_number: record.excluded_from_served_number,
        judged_basis_count: record.judged_basis_count,
        affected_node_ids: record.affected_node_ids
      })),
      reversal_point: row.reversal_point,
      builds_on_previous: {
        value: memoryDisclosure?.matched === true,
        answer_ref: memoryDisclosure?.prior?.answer_id ?? null
      },
      memory_disclosure: memoryDisclosure === null ? null : {
        ...memoryDisclosure,
        prior: memoryDisclosure.prior === null ? null : { ...memoryDisclosure.prior },
        agreed_fields: [...memoryDisclosure.agreed_fields],
        disagreed_fields: [...memoryDisclosure.disagreed_fields],
        not_compared_fields: [...memoryDisclosure.not_compared_fields],
        pulls: memoryDisclosure.pulls.map((pull) => ({ ...pull })),
        candidates_not_linked: memoryDisclosure.candidates_not_linked.map((candidate) => ({ ...candidate })),
        unlink: { ...memoryDisclosure.unlink }
      },
      risk_tier: row.risk_tier,
      tier_source: row.tier_source,
      tier_provenance_ref: row.tier_provenance_ref,
      cost_envelope: {
        basis: row.envelope_basis,
        state: row.envelope_state,
        consumed_model_attempts: Number(row.envelope_consumed),
        protected_core: "NEVER_SKIPPABLE"
      },
      composition_budget_tier: row.composition_budget_tier,
      conformance_outcome: deriveConformanceOutcome(
        row.conformance_coverage_mode ?? "NOT_RUN",
        row.conformance_segment_results ?? []
      ),
      ledger_digest_handle: `ledger:${row.run_id}`,
      inspection_handle: `inspection:${row.answer_id}`,
      as_of: row.as_of.toISOString(),
      staleness_state: staleness.state,
      relevant_as_of: staleness.relevantAsOf
    };
    });
  }

  async readAnswerIndex(ownership: RunOwnershipInput, limit: number, offset: number): Promise<AnswerIndex> {
    const access = normalizeRunOwnership(ownership);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_OWNER_PRIVATE_HISTORY_SCAN
      || !Number.isInteger(offset) || offset < 0) {
      throw new TypedDomainError(
        "ANSWER_INDEX_PAGE_INVALID",
        "An explicit bounded positive limit and nonnegative offset are required"
      );
    }
    const [page, count] = await Promise.all([
      this.pool.query<{
        kind: "ANSWER" | "OPEN_RUN";
        answer_id: string | null;
        run_ref: string;
        question_line: string;
        created_at_sequence: string;
      }>(
        `WITH served AS (
           SELECT DISTINCT ON (run.run_id)
             'ANSWER'::text AS kind,
             answer.answer_id,
             run.run_id AS run_ref,
             run.question_line,
             run.created_at_seq AS created_at_sequence
           FROM core.run AS run
           JOIN serve.answer AS answer ON answer.run_id = run.run_id
           WHERE core.run_is_owned_by(run.run_id,$1,$2)
             AND (run.content_encryption_version IS DISTINCT FROM 1
               OR core.run_private_content_is_live(run.run_id))
           ORDER BY run.run_id, answer.sealed_at_seq DESC
         ), open_run AS (
           SELECT
             'OPEN_RUN'::text AS kind,
             NULL::uuid AS answer_id,
             run.run_id AS run_ref,
             run.question_line,
             run.created_at_seq AS created_at_sequence
           FROM core.run AS run
           WHERE core.run_is_owned_by(run.run_id,$1,$2)
             AND (run.content_encryption_version IS DISTINCT FROM 1
               OR core.run_private_content_is_live(run.run_id))
             AND NOT EXISTS (SELECT 1 FROM serve.answer AS answer WHERE answer.run_id = run.run_id)
         )
         SELECT kind, answer_id, run_ref, question_line, created_at_sequence
         FROM (SELECT * FROM served UNION ALL SELECT * FROM open_run) AS debate
         ORDER BY created_at_sequence DESC
         LIMIT $3 OFFSET $4`, [access.ownerRef, access.legacyAskerId, limit, offset]
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM core.run AS run
         WHERE core.run_is_owned_by(run.run_id,$1,$2)
           AND (run.content_encryption_version IS DISTINCT FROM 1
             OR core.run_private_content_is_live(run.run_id))`,
        [access.ownerRef, access.legacyAskerId]
      )
    ]);
    if (page.rows.length === 0) {
      return AnswerIndexSchema.parse({ items: [], open_runs: [], limit, offset, total: Number(count.rows[0]?.count ?? 0) });
    }
    return this.#memory.withDisclosureContentLease(
      page.rows.map((row) => row.run_ref),
      async () => {
      const answerRows = page.rows.filter((row): row is typeof row & { answer_id: string } => row.kind === "ANSWER" && row.answer_id !== null);
      const answers = await Promise.all(answerRows.map(async (row) => ({
        row,
        answer: await this.readAnswerProjection(row.answer_id, access)
      })));
      const runRepository = new RunRepository(this.pool);
      const openRows = page.rows.filter((row) => row.kind === "OPEN_RUN");
      const openRuns = await Promise.all(openRows.map(async (row) => ({
        row,
        projection: await runRepository.readLoadingProjection(row.run_ref, access)
      })));
      return AnswerIndexSchema.parse({
        items: answers.flatMap(({ answer, row }) => answer === null ? [] : [{
          answer_id: answer.answer_id,
          run_ref: answer.run_ref,
          answer_version: answer.answer_version,
          question_line: answer.question_line,
          verdict_state: answer.verdict_state,
          abstention: answer.abstention,
          serve_state: answer.serve_state,
          staleness_state: answer.staleness_state,
          builds_on_previous: answer.builds_on_previous.value,
          created_at_sequence: Number(row.created_at_sequence)
        }]),
        open_runs: openRuns.flatMap(({ row, projection }) => projection === null ? [] : [{
          run_ref: projection.runRef,
          question_line: projection.questionLine,
          state: projection.state,
          terminal_reason: projection.terminalReason,
          created_at_sequence: Number(row.created_at_sequence)
        }]),
        limit,
        offset,
        total: Number(count.rows[0]?.count ?? 0)
      });
      }
    );
  }

  async readRunAnswerProjection(runId: string, ownership: RunOwnershipInput): Promise<Answer | null> {
    const access = normalizeRunOwnership(ownership);
    const result = await this.pool.query<{ answer_id: string }>(
      `SELECT answer.answer_id FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id=answer.run_id
       WHERE answer.run_id=$1 AND core.run_is_owned_by(run.run_id,$2,$3)
       ORDER BY answer.answer_version DESC LIMIT 1`, [runId, access.ownerRef, access.legacyAskerId]
    );
    const answerId = result.rows[0]?.answer_id;
    return answerId === undefined ? null : this.readAnswerProjection(answerId, access);
  }

  async recordInvestigationRequest(input: {
    readonly answerId: string;
    readonly gapRef: string;
    readonly ownership: RunOwnershipInput;
    readonly userInput: string | null;
  }): Promise<InvestigationAccepted | null> {
    const access = normalizeRunOwnership(input.ownership);
    const candidate = (await this.pool.query<{ answer_version: number; run_id: string }>(
      `SELECT answer.answer_version,answer.run_id
       FROM serve.answer AS answer
       WHERE answer.answer_id=$1
       ORDER BY answer.answer_version DESC LIMIT 1`,
      [input.answerId]
    )).rows[0];
    if (candidate === undefined) return null;
    return withRunContentLease(this.pool,[candidate.run_id],async () => {
    const requestRef = randomUUID();
    const replayHandle = `investigation-request:${requestRef}`;
    const content = input.userInput === null ? null : await encryptAttestedContentForRun(
      this.pool, candidate.run_id, "core.investigation_request", requestRef,
      { userInput: input.userInput }
    );
    return withWriteTransaction(this.pool, async (client) => {
      const locked = await client.query<{ run_id: string }>(
        `SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE`, [candidate.run_id]
      );
      if (locked.rows[0] === undefined) return null;
      // Separate post-lock statement: a concurrent owner-event insert takes the
      // same run lock, so this is the authoritative mutation decision.
      const owned = await client.query<{ owned: boolean }>(
        `SELECT core.run_is_owned_by($1,$2,$3) AS owned`,
        [candidate.run_id, access.ownerRef, access.legacyAskerId]
      );
      if (owned.rows[0]?.owned !== true) return null;
      const answer = (await client.query<{ answer_version: number; run_id: string }>(
        `SELECT answer.answer_version,answer.run_id
         FROM serve.answer AS answer
         WHERE answer.answer_id=$1 AND answer.run_id=$2
           AND EXISTS (
             SELECT 1 FROM core.run_progress_event AS event
             WHERE event.run_id=answer.run_id AND event.kind='honesty.investigation_gap_opened'
               AND event.value_json->>'gap_ref'=$3
           )
         ORDER BY answer.answer_version DESC LIMIT 1`,
        [input.answerId, candidate.run_id, input.gapRef]
      )).rows[0];
      if (answer === undefined) return null;
      if (answer.run_id !== candidate.run_id) return null;
      await client.query(
        `INSERT INTO core.investigation_request (
           investigation_request_id, run_id, answer_id, answer_version, gap_ref,
           user_input, input_kind, status, replay_handle, at_seq, content_ciphertext,content_attestation
         ) VALUES ($1,$2,$3,$4,$5,$6,'HUMAN_STEER','RECORDED',$7,$8,$9::jsonb,$10)`,
        [requestRef, answer.run_id, input.answerId, answer.answer_version, input.gapRef,
          content === null ? input.userInput : CONTENT_CIPHERTEXT_SENTINEL,
          replayHandle, await allocateSequence(client),
          content === null ? null : JSON.stringify(content.envelope),content?.attestation ?? null]
      );
      return Object.freeze({ request_ref: requestRef, status: "RECORDED" as const, replay_handle: replayHandle });
    });
    });
  }

  async readExecutionLedgerDigest(answerId: string, ownership: RunOwnershipInput): Promise<ExecutionLedgerDigest | null> {
    const access = normalizeRunOwnership(ownership);
    const owner = await this.pool.query<{ run_id: string }>(
      `SELECT answer.run_id FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id=answer.run_id
       WHERE answer.answer_id=$1 AND core.run_is_owned_by(run.run_id,$2,$3) LIMIT 1`,
      [answerId, access.ownerRef, access.legacyAskerId]
    );
    const runId = owner.rows[0]?.run_id;
    if (runId === undefined) return null;
    const [entries, nodes, work] = await Promise.all([this.pool.query<{
      entry_ref: string; action_kind: string; subject_ref: string; outcome: string;
      actor_ref: string; started_at: Date; finished_at: Date;
    }>(
      `SELECT ledger_entry_id::text AS entry_ref, action_kind, subject_item_id AS subject_ref,
              outcome, actor_ref, started_at, finished_at
       FROM ledger.ledger_entry
       WHERE run_id=$1
         AND NOT evaluator.ledger_entry_is_authenticated_scope(ledger_entry_id)
       ORDER BY sequence`, [runId]
    ), this.pool.query<{ node_id: string }>(
      `SELECT node_id::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]
    ), this.pool.query<{ node_set: unknown; state: string; claim_deadline: Date | null }>(
      `SELECT node_set, state, claim_deadline FROM core.work_item WHERE run_id=$1`, [runId]
    )]);
    const readAt = new Date();
    const rawItems = nodes.rows.flatMap((node) => {
      const matching = work.rows.filter((item) => Array.isArray(item.node_set) && item.node_set.includes(node.node_id));
      if (matching.length === 0) return [];
      const active = matching.find((item) => item.state === "READY" || item.state === "CLAIMED" || item.state === "WAIT");
      const storedState = matching.some((item) => item.state === "FAILED") ? "FAILED"
        : active !== undefined ? "ACTIVE" : "DONE";
      const derived = deriveWorkReadState({
        storedState,
        deadline: active?.state === "CLAIMED" ? active.claim_deadline : null,
        readAt
      });
      return [sanitizeServeItem({
        nodeId: node.node_id,
        status: derived.state === "DONE" ? "READY" : derived.state === "ACTIVE" ? "PENDING" : "ERROR",
        ...(derived.reason === undefined ? {} : { reason: derived.reason })
      })];
    });
    const validated = validateServeItems({
      ledgerProduced: true,
      items: rawItems,
      currentNodeIds: nodes.rows.map((node) => node.node_id)
    });
    const reconciled = reconcileServeItems({
      currentNodes: nodes.rows.map((node) => ({
        nodeId: node.node_id,
        workActive: work.rows.some((item) => Array.isArray(item.node_set)
          && item.node_set.includes(node.node_id)
          && (item.state === "READY" || item.state === "CLAIMED" || item.state === "WAIT"))
      })),
      items: validated
    });
    return ExecutionLedgerDigestSchema.parse({
      answer_id: answerId,
      run_ref: runId,
      work_items: reconciled.map((item) => ({
        node_ref: item.nodeId,
        status: item.status,
        reason: item.reason ?? null
      })),
      entries: entries.rows.map((row) => ({
        entry_ref: row.entry_ref, action_kind: row.action_kind, subject_ref: row.subject_ref,
        outcome: row.outcome, actor_ref: row.actor_ref,
        started_at: row.started_at.toISOString(), finished_at: row.finished_at.toISOString()
      }))
    });
  }

  async readInspectionProjection(answerId: string, ownership: RunOwnershipInput, version?: number): Promise<Inspection | null> {
    const access = normalizeRunOwnership(ownership);
    const result = await this.pool.query<{
      answer_id: string;
      answer_version: number;
      terminal: Answer["terminal"];
      coverage_mode: Inspection["conformance"]["coverage_mode"] | null;
      segment_results: Array<{ segmentId: string; state: "JUDGED" | "SAMPLED_PASSED" | "NOT_SAMPLED"; conforms: boolean }> | null;
    }>(
      `SELECT answer.answer_id, answer.answer_version, answer.terminal,
              conformance.coverage_mode, conformance.segment_results
       FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id = answer.run_id
       LEFT JOIN serve.conformance_record AS conformance
         ON conformance.conformance_record_id = answer.conformance_record_id
       WHERE answer.answer_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3)
         AND ($4::integer IS NULL OR answer.answer_version = $4)
       ORDER BY answer.answer_version DESC LIMIT 1`,
      [answerId, access.ownerRef, access.legacyAskerId, version ?? null]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const segmentSuppressions = await this.pool.query<Inspection["segment_suppressions"][number]>(
      `SELECT segment_id, evicted_number_ref
       FROM serve.segment_suppression
       WHERE answer_id = $1 AND answer_version = $2
       ORDER BY at_seq`,
      [row.answer_id, row.answer_version]
    );
    const shadowSuppressions = await this.pool.query<Inspection["shadow_suppressions"][number]>(
      `SELECT gate, subject_ref, would_have_suppressed, unlock_condition
       FROM serve.shadow_suppression
       WHERE answer_id = $1 AND answer_version = $2
       ORDER BY at_seq`,
      [row.answer_id, row.answer_version]
    );
    return {
      answer_id: row.answer_id,
      answer_version: row.answer_version,
      conformance: {
        outcome: deriveConformanceOutcome(row.coverage_mode ?? "NOT_RUN", row.segment_results ?? []),
        coverage_mode: row.coverage_mode ?? "NOT_RUN",
        segment_results: (row.segment_results ?? []).map((segment) => ({
          segment_id: segment.segmentId,
          state: segment.state,
          conforms: segment.conforms
        }))
      },
      segment_suppressions: segmentSuppressions.rows,
      shadow_suppressions: shadowSuppressions.rows
    };
  }

  async readNodeProjection(answerId: string, nodeId: string, ownership: RunOwnershipInput): Promise<Node | null> {
    const access = normalizeRunOwnership(ownership);
    const owner = await this.pool.query<{ run_id: string; answer_version: number }>(
      `SELECT answer.run_id, answer.answer_version FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id = answer.run_id
       JOIN core.work_item AS work ON work.settled_artifact_ref = answer.answer_id
       WHERE answer.answer_id = $1 AND core.run_is_owned_by(run.run_id,$2,$3) LIMIT 1`,
      [answerId, access.ownerRef, access.legacyAskerId]
    );
    const runId = owner.rows[0]?.run_id;
    if (runId === undefined) return null;
    return (await this.readNodesForRun(runId, answerId, owner.rows[0]!.answer_version))
      .find((node) => node.node_id === nodeId) ?? null;
  }

  private async readEdgesForRun(runId: string): Promise<Edge[]> {
    const result = await this.pool.query<{
      edge_id: string;
      source_node_id: string;
      source_child_kind: string | null;
      target_kind: "NODE" | "EDGE";
      target_ref: string;
      polarity: "support" | "attack";
      strength: number | null;
      magnitude_status: "MEASURED" | "UNKNOWN";
      strength_source: string;
      provenance_ref: string;
    }>(
      `SELECT edge.edge_id, edge.source_node_id, source.child_kind AS source_child_kind,
              edge.target_kind, coalesce(edge.target_node_id, edge.target_edge_id)::text AS target_ref,
              edge.polarity, edge.strength, edge.magnitude_status, edge.strength_source,
              edge.provenance_ref::text
       FROM core.edge AS edge
       JOIN core.node AS source ON source.node_id = edge.source_node_id AND source.run_id = edge.run_id
       WHERE edge.run_id = $1
       ORDER BY edge.created_at_seq`,
      [runId]
    );
    return result.rows.map((edge) => projectServeEdge({
      edgeId: edge.edge_id,
      sourceNodeId: edge.source_node_id,
      sourceChildKind: edge.source_child_kind,
      targetKind: edge.target_kind,
      targetRef: edge.target_ref,
      polarity: edge.polarity,
      strength: edge.strength === null ? null : Number(edge.strength),
      magnitudeStatus: edge.magnitude_status,
      strengthSource: edge.strength_source,
      provenanceRef: edge.provenance_ref
    }));
  }

  private async readNodesForRun(runId: string, answerId?: string, answerVersion?: number): Promise<Node[]> {
    return withRunContentLease(this.pool,[runId],async () => {
    const result = await this.pool.query<{
      node_id: string;
      claim_text: string;
      node_content_ciphertext: CryptoEnvelope | null;
      way_of_knowing: Node["way_of_knowing"];
      provenance_ref: string;
      maker: string | null;
      model_id: string | null;
      model_version: string | null;
      provider: string | null;
      provider_ref: string | null;
      // T6 r4: `review.outcome` from `ledger.node_review` — the reviewer's own
      // verdict, whose CHECK admits all three outcomes. NOT the condition-mark
      // disclosure column narrowed below; see `StoredNodeReviewOutcome`.
      review_outcome: StoredNodeReviewOutcome | null;
      review_reasons: string[] | null;
      node_review_id: string | null;
      review_content_ciphertext: CryptoEnvelope | null;
      review_provenance_ref: string | null;
      reviewer_maker: string | null;
      reviewer_model_id: string | null;
      reviewer_model_version: string | null;
      reviewer_provider: string | null;
      reviewer_provider_ref: string | null;
      locator: string | null;
      tau: number;
      strength: number | null;
      base_number_kind: string;
      base_source_ref: string;
      base_producer: string;
      base_replay_handle: string;
      base_provenance_ref: string;
      final_number_kind: string | null;
      final_source_ref: string | null;
      final_producer: string | null;
      final_replay_handle: string | null;
      final_provenance_ref: string | null;
      disagreement: Readonly<Record<string, unknown>> | null;
      defeater_refs: string[];
      check_status: "PASS" | "FAIL" | "NOT_SAMPLED";
      relevant_as_of: Date;
    }>(
      `SELECT node.node_id, node.claim_text,
              node.content_ciphertext AS node_content_ciphertext, node.way_of_knowing,
              node.provenance_ref::text, artifact.maker, artifact.model_id,
              artifact.model_version, artifact.provider, artifact.provider_ref,
              review.outcome AS review_outcome, review.reasons AS review_reasons,
              review.node_review_id, review.content_ciphertext AS review_content_ciphertext,
              review.review_raw_artifact_ref::text AS review_provenance_ref,
              review_artifact.maker AS reviewer_maker,
              review_artifact.model_id AS reviewer_model_id,
              review_artifact.model_version AS reviewer_model_version,
              review_artifact.provider AS reviewer_provider,
              review_artifact.provider_ref AS reviewer_provider_ref,
              node.locator, judgement.tau,
              judgement.number_kind AS base_number_kind, judgement.source_ref AS base_source_ref,
              judgement.producer AS base_producer, judgement.replay_handle AS base_replay_handle,
              judgement.reduced_judgement_id::text AS base_provenance_ref,
              judgement.disagreement,
              strength.strength, strength.number_kind AS final_number_kind, strength.source_ref AS final_source_ref,
              strength.producer AS final_producer, strength.replay_handle AS final_replay_handle,
              strength.propagation_run_id::text AS final_provenance_ref, restatement.check_status,
              node.relevant_as_of,
              ARRAY(
                SELECT incoming.source_node_id::text FROM core.edge AS incoming
                JOIN core.node AS defeater ON defeater.node_id=incoming.source_node_id
                WHERE incoming.run_id=node.run_id AND incoming.target_kind='NODE'
                  AND incoming.target_node_id=node.node_id AND incoming.polarity='attack'
                  AND defeater.child_kind='defeater'
                ORDER BY incoming.created_at_seq
              ) AS defeater_refs
       FROM core.node AS node
       LEFT JOIN ledger.raw_artifact AS artifact
         ON artifact.raw_artifact_id = node.provenance_ref
       LEFT JOIN LATERAL (
         SELECT node_review_id,outcome,reasons,review_raw_artifact_ref,content_ciphertext
         FROM ledger.node_review
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS review ON true
       LEFT JOIN ledger.raw_artifact AS review_artifact
         ON review_artifact.raw_artifact_id = review.review_raw_artifact_ref
       JOIN LATERAL (
         SELECT reduced_judgement_id, tau, number_kind, source_ref, producer, replay_handle, disagreement FROM ledger.reduced_judgement
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS judgement ON true
       LEFT JOIN LATERAL (
         SELECT record.* FROM ledger.node_strength_record AS record
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id = record.propagation_run_id
         WHERE record.node_id = node.node_id ORDER BY propagation.at_seq DESC LIMIT 1
       ) AS strength ON true
       JOIN LATERAL (
         SELECT check_status FROM core.stranger_restatement
         WHERE subject_kind = 'node' AND subject_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS restatement ON true
       WHERE node.run_id = $1 ORDER BY node.created_at_seq`,
      [runId]
    );
    const markLinks = answerId === undefined || answerVersion === undefined
      ? []
      : (await this.pool.query<{ node_id: string; mark: string }>(
        `SELECT link.node_id::text, mark.mark
         FROM serve.condition_mark AS mark
         JOIN serve.condition_mark_node AS link
           ON link.condition_mark_id = mark.condition_mark_id
         WHERE mark.answer_id = $1 AND mark.answer_version = $2
         ORDER BY mark.at_seq, link.node_id`,
        [answerId, answerVersion]
      )).rows;
    const marksByNode = projectConditionMarksByNode(
      result.rows.map((row) => row.node_id),
      markLinks.map((link) => ({ nodeId: link.node_id, mark: link.mark }))
    );
    return Promise.all(result.rows.map(async (row) => {
      const [staleness, nodeContent, reviewContent] = await Promise.all([
        this.#liveness.readSubjectStaleness({
          runId,
          subjectKind: "NODE",
          subjectRef: row.node_id,
          relevantAsOf: row.relevant_as_of
        }),
        decryptContentForRun<{ claimText: string }>(
          this.pool, runId, "core.node", row.node_id, row.node_content_ciphertext,
          { claimText: row.claim_text }
        ),
        row.node_review_id === null
          ? Promise.resolve({ reasons: row.review_reasons })
          : decryptContentForRun<{ reasons: string[] }>(
            this.pool, runId, "ledger.node_review", row.node_review_id,
            row.review_content_ciphertext, { reasons: row.review_reasons ?? [] }
          )
      ]);
      return {
      node_id: row.node_id,
      claim: nodeContent.claimText,
      way_of_knowing: row.way_of_knowing,
      base_score: {
        value: Number(row.tau),
        kind: row.base_number_kind,
        source: row.base_source_ref,
        producer: row.base_producer,
        provenance_ref: row.base_provenance_ref,
        replay_handle: row.base_replay_handle
      },
      final_strength: row.strength === null
        || row.final_number_kind === null
        || row.final_source_ref === null
        || row.final_producer === null
        || row.final_provenance_ref === null
        || row.final_replay_handle === null
        ? null
        : {
            value: Number(row.strength),
            kind: row.final_number_kind,
            source: row.final_source_ref,
            producer: row.final_producer,
            provenance_ref: row.final_provenance_ref,
            replay_handle: row.final_replay_handle
          },
      provenance_ref: row.provenance_ref,
      maker_lineage: projectNodeMakerLineage(row),
      review: row.review_outcome === null || row.review_reasons === null || row.review_provenance_ref === null
        ? null
        : {
            outcome: row.review_outcome,
            reasons: reviewContent.reasons ?? [],
            provenance_ref: row.review_provenance_ref,
            reviewer_lineage: projectNodeMakerLineage({
              maker: row.reviewer_maker,
              model_id: row.reviewer_model_id,
              model_version: row.reviewer_model_version,
              provider: row.reviewer_provider,
              provider_ref: row.reviewer_provider_ref
            })!
          },
      locator: row.locator,
      stranger_restatement: { check_status: row.check_status },
      defeater_refs: row.defeater_refs,
      defeater_exhaustion_marked: (marksByNode.get(row.node_id) ?? []).includes("UNFALSIFIED-AFTER-ROTATION"),
      disagreement: row.disagreement,
      condition_marks: [...(marksByNode.get(row.node_id) ?? [])],
      abstention: null,
      staleness_state: staleness.state,
      relevant_as_of: staleness.relevantAsOf
      };
    }));
    });
  }
}
