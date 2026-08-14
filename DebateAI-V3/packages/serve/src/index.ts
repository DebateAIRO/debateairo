import { randomUUID } from "node:crypto";
import type { WayOfKnowing } from "@debateai/kernel";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";
import { allocateSequence, RunRepository, withWriteTransaction } from "@debateai/db";
import { AnswerIndexSchema, ConditionMarkSchema, ExecutionLedgerDigestSchema, type Answer, type AnswerIndex, type ConditionMark, type Edge, type ExecutionLedgerDigest, type Inspection, type InvestigationAccepted, type Node } from "@debateai/contract";
import { LivenessRepository } from "@debateai/liveness";
import {
  MemoryRepository,
  canonicalizeQuestionText,
  type MemoryDisclosure,
  type MemoryPullPolicy
} from "@debateai/memory";

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
  readonly maxRecompose: number;
  readonly compositionBudget: CompositionBudgetResolution;
  readonly strangerSampleRate: number;
  readonly candidateConfidenceBand: string;
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
  if (total === 0) throw new TypedDomainError("BAND_CEILING_BASIS_EMPTY", "No load-bearing node contributes to the ceiling");

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
  readonly measureCompositionBundle: (facts: FactBundle) => number;
  readonly compose: (facts: FactBundle, attempt: number) => Promise<readonly ComposedSegment[]>;
  readonly selectSample: (segment: ComposedSegment, sampleRate: number) => boolean;
  readonly conform: (
    segment: ComposedSegment,
    state: "JUDGED" | "SAMPLED_PASSED"
  ) => Promise<ConformanceJudgement>;
  readonly postComposeR9: (segments: readonly ComposedSegment[]) => Promise<boolean>;
  readonly applyBandCeiling: (input: {
    readonly basis: Readonly<Record<WayOfKnowing, number>>;
    readonly candidateConfidenceBand: string;
  }) => BandCeilingDecision;
}

export type GateTrace =
  | "GATE1_R9_PASS"
  | "GATE1_R9_BLOCK"
  | "GATE2_Q53_PASS_VACUOUS"
  | "GATE2_Q53_BLOCK"
  | "COMPOSITION_BUDGET_PASS"
  | "COMPOSITION_BUDGET_EXCEEDED"
  | "COMPOSED"
  | "GATE3_CONFORMANCE_PASS_EXHAUSTIVE"
  | "GATE3_CONFORMANCE_PASS_SAMPLED"
  | "GATE3_CONFORMANCE_FAIL"
  | "RECOMPOSED_ONCE"
  | "GATE4_Q51_PASS"
  | "GATE4_Q51_LOCATOR_BLOCK"
  | "GATE4_Q51_DOWNGRADE"
  | "POST_COMPOSE_R9_PASS"
  | "POST_COMPOSE_R9_FAIL"
  | "BAND_CEILING_PASS"
  | "BAND_CEILING_CAPPED"
  | "ENVELOPE_ENRICHMENT_SKIPPED"
  | "PROTECTED_CORE_REFUSED_SKIP"
  | "ENVELOPE_EXHAUSTED"
  | "COMPONENTS_ONLY_ENVELOPE"
  | "COMPONENTS_ONLY_DEFECT"
  | "SERVE";

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

export function createEnvelopeExhaustedResult(input: {
  readonly factBundle: FactBundle;
  readonly compositionBudget: CompositionBudgetResolution;
  readonly verifiedNodeIds: readonly string[];
  readonly skippedEnrichmentRows: readonly string[];
  readonly protectedCoreVerified: boolean;
}): ServeGateResult {
  if (input.verifiedNodeIds.length === 0) {
    throw new TypedDomainError("ENVELOPE_VERIFIED_NODE_SET_EMPTY", "Envelope hard stop requires inspected verified nodes");
  }
  if (!input.protectedCoreVerified) {
    throw new TypedDomainError("PROTECTED_CORE_NOT_VERIFIED", "R9 must pass; it cannot be skipped by the envelope");
  }
  if (input.factBundle.conditionMarks.includes("DEFECT")) {
    throw new TypedDomainError("INDEPENDENT_BUDGET_MARKS_CONFLATED", "DEFECT and ENVELOPE_EXHAUSTED are independent terminals");
  }
  const conditionMarks = [...input.factBundle.conditionMarks];
  if (input.skippedEnrichmentRows.length > 0 && !conditionMarks.includes("SKIPPED-BY-BUDGET")) {
    conditionMarks.push("SKIPPED-BY-BUDGET");
  }
  if (!conditionMarks.includes("ENVELOPE_EXHAUSTED")) conditionMarks.push("ENVELOPE_EXHAUSTED");
  const gateTrace: GateTrace[] = [];
  if (input.skippedEnrichmentRows.length > 0) gateTrace.push("ENVELOPE_ENRICHMENT_SKIPPED");
  gateTrace.push("PROTECTED_CORE_REFUSED_SKIP", "ENVELOPE_EXHAUSTED", "COMPONENTS_ONLY_ENVELOPE");
  return Object.freeze({
    terminal: "COMPONENTS_ONLY",
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
    projections: Object.freeze({
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    })
  });
}

function componentsOnly(
  input: ServeGateInput,
  gateTrace: readonly GateTrace[],
  segments: readonly ComposedSegment[],
  conformance: readonly ConformanceJudgement[],
  coverageMode: ServeGateResult["coverageMode"]
): ServeGateResult {
  return {
    terminal: "COMPONENTS_ONLY",
    answerForm: null,
    factBundle: input.factBundle,
    gateTrace,
    conditionMarks: input.factBundle.conditionMarks.includes("DEFECT")
      ? input.factBundle.conditionMarks
      : [...input.factBundle.conditionMarks, "DEFECT"],
    conformance,
    coverageMode,
    segments,
    compositionBudget: input.compositionBudget,
    confidenceBand: null,
    bandCeiling: null,
    projections: {
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    }
  };
}

export async function runServeGateChain(
  input: ServeGateInput,
  dependencies: ServeGateDependencies
): Promise<ServeGateResult> {
  const trace: GateTrace[] = [];

  if (input.nodes.length === 0) {
    throw new TypedDomainError("SERVE_NODE_SET_EMPTY", "A serve chain requires at least one node");
  }
  if (input.nodes.some((node) => node.loadBearing && node.restatementStatus !== "PASS")) {
    trace.push("GATE1_R9_BLOCK", "COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, [], [], "NOT_RUN");
  }
  trace.push("GATE1_R9_PASS");

  if (input.factBundle.residualObjections.length > 0) {
    trace.push("GATE2_Q53_BLOCK", "COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, [], [], "NOT_RUN");
  }
  trace.push("GATE2_Q53_PASS_VACUOUS");

  if (input.maxRecompose !== 2) {
    throw new TypedDomainError("MAX_RECOMPOSE_INVALID", "DR-049 requires max_recompose = 2");
  }
  if (!Number.isFinite(input.compositionBudget.bound) || input.compositionBudget.bound < 0) {
    throw new TypedDomainError("COMPOSITION_BUDGET_UNRESOLVED", "A V-ratified composition budget is required");
  }
  const measuredBundle = dependencies.measureCompositionBundle(input.factBundle);
  if (!Number.isFinite(measuredBundle) || measuredBundle < 0) {
    throw new TypedDomainError("COMPOSITION_MEASUREMENT_INVALID", "The composition-bundle measurement must be finite");
  }
  if (measuredBundle > input.compositionBudget.bound) {
    trace.push("COMPOSITION_BUDGET_EXCEEDED", "COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, [], [], "NOT_RUN");
  }
  trace.push("COMPOSITION_BUDGET_PASS");

  let segments: readonly ComposedSegment[] = [];
  let conformance: readonly ConformanceJudgement[] = [];
  let coverageMode: ServeGateResult["coverageMode"] = "NOT_RUN";
  for (let attempt = 1; attempt <= input.maxRecompose; attempt += 1) {
    const composed = await dependencies.compose(input.factBundle, attempt);
    const nodeIds = new Set(input.nodes.map((node) => node.nodeId));
    const loadBearingNodeIds = new Set(input.nodes.filter((node) => node.loadBearing).map((node) => node.nodeId));
    if (composed.some((segment) => segment.assertedNodeRefs.some((nodeRef) => !nodeIds.has(nodeRef)))) {
      throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "A composed segment references a node outside the serve set");
    }
    segments = composed.map((segment) => Object.freeze({
      ...segment,
      loadBearing: segment.servedNumberRefs.length > 0
        || segment.assertedNodeRefs.some((nodeRef) => loadBearingNodeIds.has(nodeRef))
    }));
    if (segments.length === 0 || segments.some((segment) =>
      segment.segmentId.trim().length === 0 || segment.text.trim().length === 0
    )) {
      throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composition returned no segments");
    }
    if (new Set(segments.map((segment) => segment.segmentId)).size !== segments.length) {
      throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composed segment ids must be stable and unique");
    }
    trace.push(attempt === 1 ? "COMPOSED" : "RECOMPOSED_ONCE");
    coverageMode = input.strangerSampleRate >= 1 ? "EXHAUSTIVE" : "SAMPLED";
    conformance = await Promise.all(segments.map(async (segment) => {
      if (segment.loadBearing) return dependencies.conform(segment, "JUDGED");
      if (input.strangerSampleRate >= 1 || dependencies.selectSample(segment, input.strangerSampleRate)) {
        return dependencies.conform(segment, "SAMPLED_PASSED");
      }
      return { segmentId: segment.segmentId, state: "NOT_SAMPLED", conforms: true } as const;
    }));
    if (conformance.every((judgement) => judgement.conforms)) {
      trace.push(coverageMode === "EXHAUSTIVE"
        ? "GATE3_CONFORMANCE_PASS_EXHAUSTIVE"
        : "GATE3_CONFORMANCE_PASS_SAMPLED");
      break;
    }
    trace.push("GATE3_CONFORMANCE_FAIL");
  }

  if (!conformance.every((judgement) => judgement.conforms)) {
    trace.push("COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, segments, conformance, coverageMode);
  }

  let terminal: ServeGateResult["terminal"];
  let answerForm: AnswerForm;
  const loadBearingNodes = input.nodes.filter((node) => node.loadBearing);
  if (loadBearingNodes.some((node) => node.wayOfKnowing === "LOOKED_UP" && node.locator === null)) {
    trace.push("GATE4_Q51_LOCATOR_BLOCK", "COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, segments, conformance, coverageMode);
  }
  if (loadBearingNodes.every((node) => node.wayOfKnowing === "REASONING")) {
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

  // DR-129 ratifies Q51 before the post-compose verdict-R9 limb; keep this citation at the chain.
  if (!await dependencies.postComposeR9(segments)) {
    trace.push("POST_COMPOSE_R9_FAIL", "COMPONENTS_ONLY_DEFECT");
    return componentsOnly(input, trace, segments, conformance, coverageMode);
  }
  trace.push("POST_COMPOSE_R9_PASS");
  const loadBearing = input.nodes.filter((node) => node.loadBearing);
  const basis = {
    LOOKED_UP: loadBearing.filter((node) => node.wayOfKnowing === "LOOKED_UP").length,
    RAN: loadBearing.filter((node) => node.wayOfKnowing === "RAN").length,
    REASONING: loadBearing.filter((node) => node.wayOfKnowing === "REASONING").length
  };
  const ceilingDecision = dependencies.applyBandCeiling({
    basis,
    candidateConfidenceBand: input.candidateConfidenceBand
  });
  validateBandCeilingDecision(ceilingDecision, input.candidateConfidenceBand, basis);
  trace.push(ceilingDecision.kind === "CAPPED" ? "BAND_CEILING_CAPPED" : "BAND_CEILING_PASS", "SERVE");
  return {
    terminal,
    answerForm,
    factBundle: input.factBundle,
    gateTrace: trace,
    conditionMarks: input.factBundle.conditionMarks,
    conformance,
    coverageMode,
    segments,
    compositionBudget: input.compositionBudget,
    confidenceBand: ceilingDecision.confidenceBand,
    bandCeiling: ceilingDecision.ceiling,
    projections: {
      reversalPoint: input.factBundle.reversalPoint,
      buildsOnPrevious: input.factBundle.buildsOnPrevious,
      memoryDisclosure: input.factBundle.memoryDisclosure
    }
  };
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

export function deriveHonestVerdict(input: { readonly usableBasis: boolean; readonly reasonRef: string }):
  | { readonly verdictState: "SUPPORTED"; readonly confidenceBand: null; readonly unavailable: null }
  | { readonly verdictState: null; readonly confidenceBand: null; readonly unavailable: { readonly reasonRef: string } } {
  return input.usableBasis
    ? { verdictState: "SUPPORTED", confidenceBand: null, unavailable: null }
    : { verdictState: null, confidenceBand: null, unavailable: { reasonRef: input.reasonRef } };
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
  readonly status: "PRESENT" | "EVICTED" | "WITHHELD";
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
  readonly conditionMarkRecords?: readonly ConditionMarkRecord[];
  readonly servedNumber: {
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
  readonly mark: "SKIPPED-BY-BUDGET" | "ENVELOPE_EXHAUSTED" | "OWED-CHECK-UNEXECUTED" | "UNRESOLVED-TYPE-FALLBACK" | "UNSERVED-MAKER-POSITION" | "SINGLE-LINEAGE" | "CRITIQUE-UNAVAILABLE";
  readonly scope: "answer" | "node";
  readonly subjectRef: string;
  readonly reason: string;
  readonly liftPath: string | null;
  readonly servedRootRule: "first-configured-provider" | null;
  readonly affectedNodeIds: readonly string[];
}

const REQUIRED_CONDITION_MARK_RECORDS = Object.freeze([
  "SKIPPED-BY-BUDGET",
  "ENVELOPE_EXHAUSTED",
  "OWED-CHECK-UNEXECUTED",
  "UNRESOLVED-TYPE-FALLBACK",
  "UNSERVED-MAKER-POSITION",
  "SINGLE-LINEAGE",
  "CRITIQUE-UNAVAILABLE"
] as const);

/** DR-161: required typed records and answer marks are a two-way contract. */
export function assertRequiredConditionMarkRecords(
  conditionMarks: readonly string[],
  records: readonly ConditionMarkRecord[]
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
}

export class ServeRepository {
  readonly #liveness: LivenessRepository;
  readonly #memory: MemoryRepository;

  constructor(private readonly pool: Pool) {
    this.#liveness = new LivenessRepository(pool);
    this.#memory = new MemoryRepository(pool);
  }

  async recordMemoryQuestion(input: MemoryQuestionRegistration): Promise<void> {
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
      ...(input.pullPolicy === undefined ? {} : { pullPolicy: input.pullPolicy })
    });
  }

  unlinkMemoryForAnswer(answerId: string, askerScope: string, actorRef: string): Promise<{ readonly memoryLinkId: string }> {
    return this.#memory.unlinkForAnswer(answerId, askerScope, actorRef);
  }

  async recordReplayEviction(servedNumberId: string): Promise<void> {
    await withWriteTransaction(this.pool, async (client) => {
      const number = await client.query<{
        answer_id: string;
        answer_version: number;
        number_ref: string;
        segments: Array<{ segment_id: string; served_number_refs: string[] }> | null;
      }>(
        `SELECT number.answer_id, number.answer_version, number.number_ref, composed.segments
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
      await client.query(
        `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
         VALUES ($1,'EVICTED','MISSING-NUMBER',$2)`,
        [servedNumberId, await allocateSequence(client)]
      );
      for (const segment of owner.segments ?? []) {
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
  }

  async persist(input: PersistServeInput): Promise<{ readonly answerId: string; readonly servedNumberId: string | null }> {
    if (input.result.terminal === "BLOCKED") {
      throw new TypedDomainError(
        "BLOCKED_TERMINAL_RETIRED",
        "DR-130 routes pre-compose blocking gates to COMPONENTS_ONLY with DEFECT"
      );
    }
    if (input.compositionRawArtifactRef === null && compositionEvidenceRequired(input.result)) {
      throw new TypedDomainError(
        "MISSING_COMPOSITION_ARTIFACT",
        "Only a pre-composition terminal may omit composition evidence"
      );
    }
    if (input.compositionRawArtifactRef === null && (
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
    if (conditionMarkRecords.some((record) =>
      record.subjectRef.trim() === "" || record.reason.trim() === "" || record.affectedNodeIds.length === 0
    )) {
      throw new TypedDomainError("CONDITION_MARK_AFFECTED_NODES_REQUIRED", "Every S09 mark must inspect affected nodes");
    }
    const verdict = deriveHonestVerdict({
      usableBasis: input.servedNumber !== null
        && (input.result.terminal === "SERVED" || input.result.terminal === "DOWNGRADED"),
      reasonRef: `serve-gate:${input.result.gateTrace.at(-1) ?? input.result.terminal}`
    });
    return withWriteTransaction(this.pool, async (client) => {
      const facts = await client.query<{ fact_bundle_id: string }>(
        `INSERT INTO serve.fact_bundle (
          run_id, facts, residual_objections, content_hash, version
        ) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5) RETURNING fact_bundle_id`,
        [
          input.runId,
          JSON.stringify(input.factBundle.facts),
          JSON.stringify(input.factBundle.residualObjections),
          input.factBundleContentHash,
          input.factBundleVersion
        ]
      );
      const factBundleId = facts.rows[0]!.fact_bundle_id;
      const composed = input.compositionRawArtifactRef === null ? null : await client.query<{ composed_text_id: string }>(
        `INSERT INTO serve.composed_text (
          fact_bundle_id, segments, raw_artifact_ref, attempt
        ) VALUES ($1,$2::jsonb,$3,$4) RETURNING composed_text_id`,
        [factBundleId, JSON.stringify(input.segments.map((segment) => ({
          segment_id: segment.segmentId,
          text: segment.text,
          load_bearing: segment.loadBearing,
          served_number_refs: segment.servedNumberRefs
        }))), input.compositionRawArtifactRef, input.compositionAttempt]
      );
      const composedTextId = composed?.rows[0]!.composed_text_id ?? null;
      const conformance = composedTextId === null ? null : await client.query<{ conformance_record_id: string }>(
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
      const serveState = input.result.terminal === "COMPONENTS_ONLY"
        ? "COMPONENTS_ONLY"
        : input.compositionAttempt > 1 ? "RECOMPOSED_ONCE" : "COMPOSED";
      const servedNumberEventAtSeq = input.servedNumber === null ? null : await allocateSequence(client);
      const answerSealedAtSeq = await allocateSequence(client);
      const answer = await client.query<{ answer_id: string }>(
        `INSERT INTO serve.answer (
          answer_version, run_id, work_item_id, terminal, serve_state, verdict_state,
          answer_form, condition_marks, fact_bundle_id, composed_text_id,
          conformance_record_id, sealed_at_seq, confidence_band, band_ceiling,
          reversal_point, builds_on_previous, badges, verdict_unavailable, memory_disclosure
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb)
        RETURNING answer_id`,
        [
          input.factBundleVersion,
          input.runId,
          input.workItemId,
          input.result.terminal,
          serveState,
          verdict.verdictState,
          JSON.stringify(input.result.answerForm),
          JSON.stringify(input.result.conditionMarks),
          factBundleId,
          composedTextId,
          conformance?.rows[0]!.conformance_record_id ?? null,
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
          verdict.unavailable === null
            ? null
            : JSON.stringify({ reason_ref: verdict.unavailable.reasonRef }),
          input.result.projections.memoryDisclosure === null
            ? null
            : JSON.stringify(input.result.projections.memoryDisclosure)
        ]
      );
      for (const record of conditionMarkRecords) {
        const mark = await client.query<{ condition_mark_id: string }>(
          `INSERT INTO serve.condition_mark (
             answer_id, answer_version, mark, scope, subject_ref, reason, lift_path, served_root_rule, at_seq
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING condition_mark_id`,
          [
            answer.rows[0]!.answer_id,
            input.factBundleVersion,
            record.mark,
            record.scope,
            record.subjectRef,
            record.reason,
            record.liftPath,
            record.servedRootRule,
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
          input.factBundleVersion,
          input.servedNumber.numberRef
        ]
      );
      if (servedNumber !== null) await client.query(
        `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
         VALUES ($1,'PRESENT',NULL,$2)`,
        [servedNumber.rows[0]!.served_number_id, servedNumberEventAtSeq]
      );
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,'TERMINAL',$3::jsonb)`,
        [input.runId, await allocateSequence(client), JSON.stringify(input.result.terminal)]
      );
      return {
        answerId: answer.rows[0]!.answer_id,
        servedNumberId: servedNumber?.rows[0]!.served_number_id ?? null
      };
    });
  }

  async readAnswerProjection(answerId: string, askerId: string, version?: number): Promise<Answer | null> {
    const answer = await this.pool.query<{
      answer_id: string;
      answer_version: number;
      run_id: string;
      question_line: string;
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
      `SELECT answer.answer_id, answer.answer_version, answer.run_id, run.question_line, answer.terminal,
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
       WHERE answer.answer_id = $1 AND run.asker_id = $2
         AND ($3::integer IS NULL OR answer.answer_version = $3)
       ORDER BY answer.answer_version DESC LIMIT 1`,
      [answerId, askerId, version ?? null]
    );
    const row = answer.rows[0];
    if (row === undefined) return null;
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
        status: "PRESENT" | "EVICTED" | "WITHHELD";
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
      if (status === "WITHHELD") {
        return { status, reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED", components: [] };
      }
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
      served_root_rule: "first-configured-provider" | null;
    }>(
      `SELECT mark, scope, subject_ref, reason, lift_path, served_root_rule
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
      question_line: row.question_line,
      terminal: hasEviction ? "COMPONENTS_ONLY" : row.terminal,
      verdict_state: hasEviction ? null : row.verdict_state,
      verdict_unavailable: hasEviction
        ? { reason_ref: "served-number:MISSING-NUMBER" }
        : row.verdict_unavailable,
      confidence_band: hasEviction ? null : row.confidence_band,
      band_ceiling: hasEviction ? null : row.band_ceiling,
      answer_form: hasEviction ? null : row.answer_form,
      serve_state: answerServeState.serveState,
      composed_text: hasEviction ? [] : row.segments ?? [],
      number_slots: numberSlots,
      abstention: abstention.rows[0] ?? null,
      shadow_suppressions: shadowSuppressions.rows,
      nodes,
      edges,
      badges: staleness.badge === null || row.badges.includes(staleness.badge)
        ? row.badges
        : [...row.badges, staleness.badge],
      residual_objections: row.residual_objections,
      value_hinges: valueHinges.rows,
      condition_marks: conditionMarks,
      condition_mark_records: conditionMarkRecords.rows.map((record) => ({
        mark: ConditionMarkSchema.parse(record.mark),
        scope: record.scope,
        subject_ref: record.subject_ref,
        reason: record.reason,
        lift_path: record.lift_path,
        served_root_rule: record.served_root_rule
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
  }

  async readAnswerIndex(askerId: string, limit: number, offset: number): Promise<AnswerIndex> {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
      throw new TypedDomainError("ANSWER_INDEX_PAGE_INVALID", "An explicit positive limit and nonnegative offset are required");
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
           WHERE run.asker_id = $1
           ORDER BY run.run_id, answer.sealed_at_seq DESC
         ), open_run AS (
           SELECT
             'OPEN_RUN'::text AS kind,
             NULL::uuid AS answer_id,
             run.run_id AS run_ref,
             run.question_line,
             run.created_at_seq AS created_at_sequence
           FROM core.run AS run
           WHERE run.asker_id = $1
             AND NOT EXISTS (SELECT 1 FROM serve.answer AS answer WHERE answer.run_id = run.run_id)
         )
         SELECT kind, answer_id, run_ref, question_line, created_at_sequence
         FROM (SELECT * FROM served UNION ALL SELECT * FROM open_run) AS debate
         ORDER BY created_at_sequence DESC
         LIMIT $2 OFFSET $3`, [askerId, limit, offset]
      ),
      this.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM core.run WHERE asker_id=$1`, [askerId]
      )
    ]);
    const answerRows = page.rows.filter((row): row is typeof row & { answer_id: string } => row.kind === "ANSWER" && row.answer_id !== null);
    const answers = await Promise.all(answerRows.map(async (row) => ({
      row,
      answer: await this.readAnswerProjection(row.answer_id, askerId)
    })));
    const runRepository = new RunRepository(this.pool);
    const openRows = page.rows.filter((row) => row.kind === "OPEN_RUN");
    const openRuns = await Promise.all(openRows.map(async (row) => ({
      row,
      projection: await runRepository.readLoadingProjection(row.run_ref, askerId)
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

  async readRunAnswerProjection(runId: string, askerId: string): Promise<Answer | null> {
    const result = await this.pool.query<{ answer_id: string }>(
      `SELECT answer.answer_id FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id=answer.run_id
       WHERE answer.run_id=$1 AND run.asker_id=$2
       ORDER BY answer.answer_version DESC LIMIT 1`, [runId, askerId]
    );
    const answerId = result.rows[0]?.answer_id;
    return answerId === undefined ? null : this.readAnswerProjection(answerId, askerId);
  }

  async recordInvestigationRequest(input: {
    readonly answerId: string;
    readonly gapRef: string;
    readonly askerId: string;
    readonly userInput: string | null;
  }): Promise<InvestigationAccepted | null> {
    return withWriteTransaction(this.pool, async (client) => {
      const owned = await client.query<{ answer_version: number; run_id: string }>(
        `SELECT answer.answer_version, answer.run_id
         FROM serve.answer AS answer JOIN core.run AS run ON run.run_id=answer.run_id
         WHERE answer.answer_id=$1 AND run.asker_id=$2
           AND EXISTS (
             SELECT 1 FROM core.run_progress_event AS event
             WHERE event.run_id=answer.run_id AND event.kind='honesty.investigation_gap_opened'
               AND event.value_json->>'gap_ref'=$3
           )
         ORDER BY answer.answer_version DESC LIMIT 1`, [input.answerId, input.askerId, input.gapRef]
      );
      const answer = owned.rows[0];
      if (answer === undefined) return null;
      const requestRef = randomUUID();
      const replayHandle = `investigation-request:${requestRef}`;
      await client.query(
        `INSERT INTO core.investigation_request (
           investigation_request_id, run_id, answer_id, answer_version, gap_ref,
           user_input, input_kind, status, replay_handle, at_seq
         ) VALUES ($1,$2,$3,$4,$5,$6,'HUMAN_STEER','RECORDED',$7,$8)`,
        [requestRef, answer.run_id, input.answerId, answer.answer_version, input.gapRef,
          input.userInput, replayHandle, await allocateSequence(client)]
      );
      return Object.freeze({ request_ref: requestRef, status: "RECORDED" as const, replay_handle: replayHandle });
    });
  }

  async readExecutionLedgerDigest(answerId: string, askerId: string): Promise<ExecutionLedgerDigest | null> {
    const owner = await this.pool.query<{ run_id: string }>(
      `SELECT answer.run_id FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id=answer.run_id
       WHERE answer.answer_id=$1 AND run.asker_id=$2 LIMIT 1`, [answerId, askerId]
    );
    const runId = owner.rows[0]?.run_id;
    if (runId === undefined) return null;
    const [entries, nodes, work] = await Promise.all([this.pool.query<{
      entry_ref: string; action_kind: string; subject_ref: string; outcome: string;
      actor_ref: string; started_at: Date; finished_at: Date;
    }>(
      `SELECT ledger_entry_id::text AS entry_ref, action_kind, subject_item_id AS subject_ref,
              outcome, actor_ref, started_at, finished_at
       FROM ledger.ledger_entry WHERE run_id=$1 ORDER BY sequence`, [runId]
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

  async readInspectionProjection(answerId: string, askerId: string, version?: number): Promise<Inspection | null> {
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
       WHERE answer.answer_id = $1 AND run.asker_id = $2
         AND ($3::integer IS NULL OR answer.answer_version = $3)
       ORDER BY answer.answer_version DESC LIMIT 1`,
      [answerId, askerId, version ?? null]
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

  async readNodeProjection(answerId: string, nodeId: string, askerId: string): Promise<Node | null> {
    const owner = await this.pool.query<{ run_id: string; answer_version: number }>(
      `SELECT answer.run_id, answer.answer_version FROM serve.answer AS answer
       JOIN core.run AS run ON run.run_id = answer.run_id
       JOIN core.work_item AS work ON work.settled_artifact_ref = answer.answer_id
       WHERE answer.answer_id = $1 AND run.asker_id = $2 LIMIT 1`,
      [answerId, askerId]
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
    const result = await this.pool.query<{
      node_id: string;
      claim_text: string;
      way_of_knowing: Node["way_of_knowing"];
      provenance_ref: string;
      maker: string | null;
      model_id: string | null;
      model_version: string | null;
      provider: string | null;
      provider_ref: string | null;
      review_outcome: "agree" | "dispute" | "cannot-assess" | null;
      review_reasons: string[] | null;
      review_provenance_ref: string | null;
      reviewer_maker: string | null;
      reviewer_model_id: string | null;
      reviewer_model_version: string | null;
      reviewer_provider: string | null;
      reviewer_provider_ref: string | null;
      locator: string | null;
      tau: number;
      strength: number;
      base_number_kind: string;
      base_source_ref: string;
      base_producer: string;
      base_replay_handle: string;
      base_provenance_ref: string;
      final_number_kind: string;
      final_source_ref: string;
      final_producer: string;
      final_replay_handle: string;
      final_provenance_ref: string;
      disagreement: Readonly<Record<string, unknown>> | null;
      defeater_refs: string[];
      check_status: "PASS" | "FAIL" | "NOT_SAMPLED";
      relevant_as_of: Date;
    }>(
      `SELECT node.node_id, node.claim_text, node.way_of_knowing,
              node.provenance_ref::text, artifact.maker, artifact.model_id,
              artifact.model_version, artifact.provider, artifact.provider_ref,
              review.outcome AS review_outcome, review.reasons AS review_reasons,
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
         SELECT outcome, reasons, review_raw_artifact_ref FROM ledger.node_review
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS review ON true
       LEFT JOIN ledger.raw_artifact AS review_artifact
         ON review_artifact.raw_artifact_id = review.review_raw_artifact_ref
       JOIN LATERAL (
         SELECT reduced_judgement_id, tau, number_kind, source_ref, producer, replay_handle, disagreement FROM ledger.reduced_judgement
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS judgement ON true
       JOIN LATERAL (
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
      const staleness = await this.#liveness.readSubjectStaleness({
        runId,
        subjectKind: "NODE",
        subjectRef: row.node_id,
        relevantAsOf: row.relevant_as_of
      });
      return {
      node_id: row.node_id,
      claim: row.claim_text,
      way_of_knowing: row.way_of_knowing,
      base_score: {
        value: Number(row.tau),
        kind: row.base_number_kind,
        source: row.base_source_ref,
        producer: row.base_producer,
        provenance_ref: row.base_provenance_ref,
        replay_handle: row.base_replay_handle
      },
      final_strength: {
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
            reasons: row.review_reasons,
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
  }
}
