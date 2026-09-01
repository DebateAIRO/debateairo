import {
  TypedDomainError,
  exhaustive,
  type EdgeKind,
  type EdgePolarity,
  type EdgeTargetKind,
  type GenerationStatus,
  type MagnitudeStatus,
  type OperatorSupplyingLevel,
  type ScoringOperator,
  type StrengthSource
} from "@debateai/kernel";
import { agg, σ } from "@debateai/published-arithmetic";

export type { OperatorSupplyingLevel, ScoringOperator } from "@debateai/kernel";

export interface ProvenanceClusterKey {
  readonly evidenceProvenanceRef: string;
  readonly producingRunId: string;
  readonly modelFamily: string;
}

export interface SnapshotNode {
  readonly nodeId: string;
  readonly baseStrength: number | null;
  readonly parentNodeId?: string | null;
  readonly generationStatus?: GenerationStatus;
  readonly wayOfKnowing?: "LOOKED_UP" | "RAN" | "REASONING";
  readonly provenanceRef?: string | null;
  readonly judgedBy?: string | null;
  readonly abstained?: boolean;
  readonly isFolder?: boolean;
  readonly positionLabel?: string | null;
}

export interface SnapshotArrow {
  readonly arrowId: string;
  readonly sourceNodeId: string;
  readonly targetKind: EdgeTargetKind;
  readonly targetNodeId: string | null;
  readonly targetEdgeId: string | null;
  readonly polarity: EdgePolarity;
  readonly kind: EdgeKind | null;
  readonly strength: number | null;
  readonly magnitudeStatus: MagnitudeStatus;
  readonly strengthSource: StrengthSource;
  readonly clusterKey?: ProvenanceClusterKey | null;
}

export interface OperatorResolution {
  readonly parentNodeId: string;
  readonly operator: ScoringOperator;
  readonly suppliedBy: OperatorSupplyingLevel;
}

export interface EvaluationSnapshot {
  readonly nodes: readonly SnapshotNode[];
  readonly arrows: readonly SnapshotArrow[];
  readonly arrowOrder: readonly string[];
  readonly operatorResolutions: readonly OperatorResolution[];
  readonly clusterRecords: readonly unknown[];
}

export interface TransmissionReduction {
  readonly targetEdgeId: string;
  readonly undercutEdgeId: string;
  readonly reduction: number | null;
  readonly magnitudeStatus: MagnitudeStatus;
}

export interface LiftRecord {
  readonly nodeId: string;
  readonly liftKind: "FOLDER" | "JUDGED_ANCESTOR";
  readonly liftTargetNodeId: string;
  readonly markerAtSource: true;
  readonly markerAtTarget: true;
  readonly appliedOrdinal: number;
}

export interface ClusterCollapseRecord {
  readonly clusterId: string;
  readonly key: string | null;
  readonly keyBasis: ProvenanceClusterKey | null;
  readonly polarity: EdgePolarity;
  readonly absorbedEdgeIds: readonly string[];
  readonly survivingMember: string;
}

export interface NodeStrengthRecord {
  readonly nodeId: string;
  readonly strength: number;
  readonly tauSource: string | null;
  readonly wayOfKnowing: "LOOKED_UP" | "RAN" | "REASONING" | null;
  readonly judgedBy: string | null;
  readonly abstained: boolean;
  readonly supportedBy: readonly string[];
  readonly attackedBy: readonly string[];
  readonly operatorUsed: ScoringOperator | null;
  readonly operatorLevel: OperatorSupplyingLevel | null;
  readonly positionLabel: string | null;
  readonly liftMarker: readonly LiftRecord[];
}

export interface PropagationOutcome {
  readonly strengths: readonly NodeStrengthRecord[];
  readonly unjudgedNodeIds: readonly string[];
  readonly arrowOrder: readonly string[];
  readonly transmissionReductions: readonly TransmissionReduction[];
  readonly liftRecords: readonly LiftRecord[];
  readonly clusterRecords: readonly ClusterCollapseRecord[];
  readonly operatorResolutions: readonly OperatorResolution[];
  readonly graphFingerprintMaterial: string;
  readonly sensitivityRecords: readonly SensitivityRecord[];
}

export interface SensitivityRecord {
  readonly removedNodeId: string;
  readonly leverage: number;
  readonly fragility: readonly {
    readonly nodeId: string;
    readonly before: number;
    readonly after: number | null;
    readonly difference: number | null;
  }[];
}

interface ScoringStrategy {
  readonly id: ScoringOperator;
  aggregateSupport(values: readonly number[]): number;
}

const ACCUMULATE_STRATEGY: ScoringStrategy = Object.freeze({
  id: "accumulate",
  aggregateSupport: agg
});

// S5-2 (goal 119-128): `accumulate` is THE operator. The kernel vocabulary is a
// one-member closed set, so this switch is a single arm plus the exhaustive
// guard, which fails the build loudly if that set ever grows again.
function scoringStrategy(operator: ScoringOperator): ScoringStrategy {
  switch (operator) {
    case "accumulate": return ACCUMULATE_STRATEGY;
    default: return exhaustive(operator);
  }
}

interface EffectiveArrow extends SnapshotArrow {
  readonly targetNodeId: string;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypedDomainError("PROPAGATION_MAGNITUDE_INVALID", `${field} must be a finite number in [0,1]`);
  }
}

function assertTotalArrowOrder(snapshot: EvaluationSnapshot): void {
  const arrowIds = new Set(snapshot.arrows.map((arrow) => arrow.arrowId));
  if (arrowIds.size !== snapshot.arrows.length || snapshot.arrowOrder.length !== snapshot.arrows.length) {
    throw new TypedDomainError("MALFORMED_ARROW_ORDER", "The recorded order must cover every arrow exactly once");
  }
  const ordered = new Set(snapshot.arrowOrder);
  if (ordered.size !== snapshot.arrowOrder.length || snapshot.arrowOrder.some((arrowId) => !arrowIds.has(arrowId))) {
    throw new TypedDomainError("MALFORMED_ARROW_ORDER", "The recorded order contains duplicates or foreign arrows");
  }
}

function assertAcyclic(snapshot: EvaluationSnapshot): void {
  const outgoing = new Map<string, string[]>();
  for (const arrow of snapshot.arrows) {
    if (arrow.targetKind !== "NODE" || arrow.targetNodeId === null) continue;
    const targets = outgoing.get(arrow.sourceNodeId) ?? [];
    targets.push(arrow.targetNodeId);
    outgoing.set(arrow.sourceNodeId, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      throw new TypedDomainError("GRAPH_CYCLE_DETECTED", "A cycle reached the pure propagation core");
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) visit(target);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of outgoing.keys()) visit(nodeId);
}

function assertSnapshot(snapshot: EvaluationSnapshot): void {
  assertTotalArrowOrder(snapshot);
  assertAcyclic(snapshot);
  const nodeIds = new Set(snapshot.nodes.map((node) => node.nodeId));
  if (nodeIds.size !== snapshot.nodes.length) {
    throw new TypedDomainError("DUPLICATE_SNAPSHOT_NODE", "A snapshot node identity may occur only once");
  }
  for (const node of snapshot.nodes) {
    if (node.baseStrength !== null) assertUnitInterval(node.baseStrength, `tau for ${node.nodeId}`);
  }
  const edgeIds = new Set(snapshot.arrows.map((arrow) => arrow.arrowId));
  for (const arrow of snapshot.arrows) {
    if (!nodeIds.has(arrow.sourceNodeId)) {
      throw new TypedDomainError("ARROW_ENDPOINT_ABSENT", `Arrow ${arrow.arrowId} has a foreign source`);
    }
    if (arrow.targetKind === "NODE" && (arrow.targetNodeId === null || !nodeIds.has(arrow.targetNodeId))) {
      throw new TypedDomainError("ARROW_ENDPOINT_ABSENT", `Arrow ${arrow.arrowId} has a foreign target`);
    }
    if (arrow.targetKind === "EDGE" && (arrow.targetEdgeId === null || !edgeIds.has(arrow.targetEdgeId))) {
      throw new TypedDomainError("ARROW_ENDPOINT_ABSENT", `Undercut ${arrow.arrowId} has a foreign target`);
    }
    if (arrow.strength !== null) assertUnitInterval(arrow.strength, `strength for ${arrow.arrowId}`);
  }
}

export function provenanceClusterKey(key: ProvenanceClusterKey): string {
  return JSON.stringify([
    key.evidenceProvenanceRef,
    key.producingRunId,
    key.modelFamily
  ]);
}

export function deriveTransmissionReductions(snapshot: EvaluationSnapshot): readonly TransmissionReduction[] {
  assertSnapshot(snapshot);
  const byId = new Map(snapshot.arrows.map((arrow) => [arrow.arrowId, arrow]));
  const reductions: TransmissionReduction[] = [];
  for (const arrowId of snapshot.arrowOrder) {
    const undercut = byId.get(arrowId)!;
    if (undercut.kind !== "undercutting") continue;
    const target = undercut.targetEdgeId === null ? undefined : byId.get(undercut.targetEdgeId);
    if (target === undefined || target.polarity !== "support") {
      throw new TypedDomainError("UNDERCUT_TARGET_INVALID", "An undercut must resolve to a support edge in the snapshot");
    }
    reductions.push(Object.freeze({
      targetEdgeId: target.arrowId,
      undercutEdgeId: undercut.arrowId,
      reduction: undercut.strength,
      magnitudeStatus: undercut.magnitudeStatus
    }));
  }
  return Object.freeze(reductions);
}

function applyLifts(snapshot: EvaluationSnapshot): {
  readonly arrows: readonly EffectiveArrow[];
  readonly records: readonly LiftRecord[];
} {
  const byNode = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const records: LiftRecord[] = [];
  const arrows: EffectiveArrow[] = [];
  let ordinal = 0;
  for (const arrowId of snapshot.arrowOrder) {
    const arrow = snapshot.arrows.find((candidate) => candidate.arrowId === arrowId)!;
    if (arrow.targetKind !== "NODE" || arrow.targetNodeId === null) continue;
    let target = byNode.get(arrow.targetNodeId)!;
    if (target.isFolder === true) {
      const folderTarget = target.parentNodeId === undefined || target.parentNodeId === null
        ? undefined
        : byNode.get(target.parentNodeId);
      if (folderTarget === undefined) {
        throw new TypedDomainError("LIFT_TARGET_ABSENT", `Folder ${target.nodeId} has no structural parent`);
      }
      records.push(Object.freeze({
        nodeId: arrow.sourceNodeId,
        liftKind: "FOLDER",
        liftTargetNodeId: folderTarget.nodeId,
        markerAtSource: true,
        markerAtTarget: true,
        appliedOrdinal: ++ordinal
      }));
      target = folderTarget;
    }
    const visited = new Set<string>();
    while (target.baseStrength === null || target.abstained === true) {
      if (visited.has(target.nodeId)) {
        throw new TypedDomainError("GRAPH_CYCLE_DETECTED", "The structural ancestor chain is cyclic");
      }
      visited.add(target.nodeId);
      const ancestor = target.parentNodeId === undefined || target.parentNodeId === null
        ? undefined
        : byNode.get(target.parentNodeId);
      if (ancestor === undefined) break;
      records.push(Object.freeze({
        nodeId: arrow.sourceNodeId,
        liftKind: "JUDGED_ANCESTOR",
        liftTargetNodeId: ancestor.nodeId,
        markerAtSource: true,
        markerAtTarget: true,
        appliedOrdinal: ++ordinal
      }));
      target = ancestor;
    }
    if (target.baseStrength !== null && target.abstained !== true) {
      arrows.push(Object.freeze({ ...arrow, targetNodeId: target.nodeId }));
    }
  }
  return Object.freeze({ arrows: Object.freeze(arrows), records: Object.freeze(records) });
}

interface ComputedGraph {
  readonly values: ReadonlyMap<string, number>;
  readonly clusterRecords: readonly ClusterCollapseRecord[];
  readonly survivingArrows: readonly EffectiveArrow[];
}

function computeGraph(input: {
  readonly snapshot: EvaluationSnapshot;
  readonly arrows: readonly EffectiveArrow[];
  readonly reductions: readonly TransmissionReduction[];
}): ComputedGraph {
  const nodes = new Map(input.snapshot.nodes.map((node) => [node.nodeId, node]));
  const recordedOrderIndex = new Map(
    input.snapshot.arrowOrder.map((arrowId, index) => [arrowId, index] as const)
  );
  const incoming = new Map<string, EffectiveArrow[]>();
  for (const arrow of input.arrows) {
    const current = incoming.get(arrow.targetNodeId) ?? [];
    current.push(arrow);
    incoming.set(arrow.targetNodeId, current);
  }
  const reductionsByEdge = new Map<string, number>();
  for (const reduction of input.reductions) {
    if (reduction.reduction === null) continue;
    reductionsByEdge.set(
      reduction.targetEdgeId,
      (reductionsByEdge.get(reduction.targetEdgeId) ?? 0) + reduction.reduction
    );
  }
  const resolutions = new Map(input.snapshot.operatorResolutions.map((resolution) => [resolution.parentNodeId, resolution]));
  const values = new Map<string, number>();
  const visiting = new Set<string>();
  const clusterRecords = new Map<string, ClusterCollapseRecord>();
  const survivingArrows = new Map<string, EffectiveArrow>();
  const valueOf = (nodeId: string): number | null => {
    if (values.has(nodeId)) return values.get(nodeId)!;
    const node = nodes.get(nodeId)!;
    if (node.baseStrength === null || node.abstained === true) return null;
    if (visiting.has(nodeId)) throw new TypedDomainError("GRAPH_CYCLE_DETECTED", "A cycle reached scoring");
    visiting.add(nodeId);
    const nodeArrows = incoming.get(nodeId) ?? [];
    const resolution = resolutions.get(nodeId);
    if (nodeArrows.length > 0 && resolution === undefined) {
      throw new TypedDomainError("OPERATOR_RESOLUTION_MISSING", `No register-backed operator resolved for ${nodeId}`);
    }
    const operator = resolution?.operator;
    const strategy = operator === undefined ? undefined : scoringStrategy(operator);
    const support: number[] = [];
    const attack: number[] = [];
    const groups = new Map<string, EffectiveArrow[]>();
    const selectedGroups: {
      readonly arrow: EffectiveArrow;
      readonly sourceValue: number | null;
      readonly contribution: number | null;
      readonly recordedOrderIndex: number;
    }[] = [];
    for (const arrow of nodeArrows) {
      const resolvedKey = arrow.clusterKey === undefined || arrow.clusterKey === null
        ? null
        : provenanceClusterKey(arrow.clusterKey);
      const clusterPart = resolvedKey ?? `singleton:${arrow.arrowId}`;
      const groupKey = JSON.stringify([arrow.targetNodeId, arrow.polarity, clusterPart]);
      const group = groups.get(groupKey) ?? [];
      group.push(arrow);
      groups.set(groupKey, group);
    }
    for (const [groupKey, members] of groups.entries()) {
      const evaluatedMembers = members.map((arrow) => {
        const sourceValue = valueOf(arrow.sourceNodeId);
        const rawContribution = sourceValue === null || arrow.strength === null || arrow.magnitudeStatus === "UNKNOWN"
          ? null
          : arrow.strength * sourceValue;
        const contribution = rawContribution === null || arrow.polarity === "attack"
          ? rawContribution
          // DR-127: undercut reduction is subtractive with a zero clamp.
          : Math.max(0, rawContribution - (reductionsByEdge.get(arrow.arrowId) ?? 0));
        return { arrow, sourceValue, contribution };
      });
      const selectedMember = evaluatedMembers.reduce((strongest, candidate) =>
        (candidate.contribution ?? -1) > (strongest.contribution ?? -1) ? candidate : strongest
      );
      const arrow = selectedMember.arrow;
      const sourceValue = selectedMember.sourceValue;
      const keyBasis = arrow.clusterKey ?? null;
      clusterRecords.set(groupKey, Object.freeze({
        clusterId: `cluster:${groupKey}`,
        key: keyBasis === null ? null : provenanceClusterKey(keyBasis),
        keyBasis,
        polarity: arrow.polarity,
        absorbedEdgeIds: Object.freeze(evaluatedMembers
          .filter((member) => member.arrow.arrowId !== arrow.arrowId)
          .map((member) => member.arrow.arrowId)),
        survivingMember: arrow.arrowId
      }));
      survivingArrows.set(arrow.arrowId, arrow);
      selectedGroups.push({
        arrow,
        sourceValue,
        contribution: selectedMember.contribution,
        recordedOrderIndex: recordedOrderIndex.get(arrow.arrowId)!
      });
    }
    selectedGroups.sort((left, right) => left.recordedOrderIndex - right.recordedOrderIndex);
    for (const selectedGroup of selectedGroups) {
      const { arrow, sourceValue, contribution } = selectedGroup;
      if (sourceValue === null || arrow.strength === null || arrow.magnitudeStatus === "UNKNOWN") {
        continue;
      }
      if (arrow.polarity === "support") {
        support.push(contribution!);
      } else {
        attack.push(contribution!);
      }
    }
    const aggregateSupport = strategy?.aggregateSupport(support) ?? agg(support);
    const result = σ(node.baseStrength, agg(attack), aggregateSupport);
    assertUnitInterval(result, `result for ${nodeId}`);
    visiting.delete(nodeId);
    values.set(nodeId, result);
    return result;
  };
  for (const node of input.snapshot.nodes) valueOf(node.nodeId);
  return Object.freeze({
    values,
    clusterRecords: Object.freeze([...clusterRecords.values()]),
    survivingArrows: Object.freeze([...survivingArrows.values()])
  });
}

function canonicalFingerprintMaterial(input: {
  readonly snapshot: EvaluationSnapshot;
  readonly reductions: readonly TransmissionReduction[];
  readonly lifts: readonly LiftRecord[];
  readonly clusters: readonly ClusterCollapseRecord[];
}): string {
  const byJson = (left: unknown, right: unknown): number => {
    const leftJson = JSON.stringify(left);
    const rightJson = JSON.stringify(right);
    return compareCodeUnits(leftJson, rightJson);
  };
  return JSON.stringify({
    nodes: [...input.snapshot.nodes].map((node) => ({
      nodeId: node.nodeId,
      tau: node.baseStrength,
      parentNodeId: node.parentNodeId ?? null,
      abstained: node.abstained ?? false,
      positionLabel: node.positionLabel ?? null
    })).sort(byJson),
    arrows: [...input.snapshot.arrows].map((arrow) => ({
      arrowId: arrow.arrowId,
      sourceNodeId: arrow.sourceNodeId,
      targetKind: arrow.targetKind,
      targetNodeId: arrow.targetNodeId,
      targetEdgeId: arrow.targetEdgeId,
      polarity: arrow.polarity,
      kind: arrow.kind,
      strength: arrow.strength,
      magnitudeStatus: arrow.magnitudeStatus,
      strengthSource: arrow.strengthSource,
      clusterKey: arrow.clusterKey ?? null
    })).sort(byJson),
    operatorResolutions: [...input.snapshot.operatorResolutions].sort(byJson),
    arrowOrder: [...input.snapshot.arrowOrder],
    reductions: [...input.reductions].sort(byJson),
    lifts: [...input.lifts].sort(byJson),
    clusters: [...input.clusters].sort(byJson)
  });
}

function snapshotWithoutNode(snapshot: EvaluationSnapshot, removedNodeId: string): EvaluationSnapshot {
  const removedParentId = snapshot.nodes.find((node) => node.nodeId === removedNodeId)?.parentNodeId ?? null;
  const retainedNodes = snapshot.nodes
    .filter((node) => node.nodeId !== removedNodeId)
    .map((node) => node.parentNodeId === removedNodeId
      ? Object.freeze({ ...node, parentNodeId: removedParentId })
      : node);
  const retainedNodeIds = new Set(retainedNodes.map((node) => node.nodeId));
  const firstPass = snapshot.arrows.filter((arrow) => {
    if (arrow.sourceNodeId === removedNodeId) return false;
    if (arrow.targetKind === "NODE") return arrow.targetNodeId !== removedNodeId;
    return true;
  });
  const retainedEdgeIds = new Set(firstPass.map((arrow) => arrow.arrowId));
  const arrows = firstPass.filter((arrow) => arrow.targetKind !== "EDGE" || (
    arrow.targetEdgeId !== null && retainedEdgeIds.has(arrow.targetEdgeId)
  ));
  const arrowIds = new Set(arrows.map((arrow) => arrow.arrowId));
  return Object.freeze({
    nodes: Object.freeze(retainedNodes),
    arrows: Object.freeze(arrows),
    arrowOrder: Object.freeze(snapshot.arrowOrder.filter((arrowId) => arrowIds.has(arrowId))),
    operatorResolutions: Object.freeze(snapshot.operatorResolutions.filter((item) => item.parentNodeId !== removedNodeId)),
    clusterRecords: snapshot.clusterRecords
  });
}

function evaluateInternal(snapshot: EvaluationSnapshot, includeSensitivity: boolean): PropagationOutcome {
  assertSnapshot(snapshot);
  const transmissionReductions = deriveTransmissionReductions(snapshot);
  const lifted = applyLifts(snapshot);
  const primary = computeGraph({ snapshot, arrows: lifted.arrows, reductions: transmissionReductions });
  const resolutions = new Map(snapshot.operatorResolutions.map((resolution) => [resolution.parentNodeId, resolution]));
  const incoming = new Map<string, EffectiveArrow[]>();
  for (const arrow of primary.survivingArrows) {
    const current = incoming.get(arrow.targetNodeId) ?? [];
    current.push(arrow);
    incoming.set(arrow.targetNodeId, current);
  }
  const markers = new Map<string, LiftRecord[]>();
  for (const record of lifted.records) {
    for (const nodeId of [record.nodeId, record.liftTargetNodeId]) {
      const current = markers.get(nodeId) ?? [];
      current.push(record);
      markers.set(nodeId, current);
    }
  }
  const strengths = snapshot.nodes.flatMap((node): readonly NodeStrengthRecord[] => {
    const strength = primary.values.get(node.nodeId);
    if (strength === undefined) return [];
    const resolution = resolutions.get(node.nodeId);
    const nodeArrows = incoming.get(node.nodeId) ?? [];
    return [Object.freeze({
      nodeId: node.nodeId,
      strength,
      tauSource: node.provenanceRef ?? null,
      wayOfKnowing: node.wayOfKnowing ?? null,
      judgedBy: node.judgedBy ?? null,
      abstained: node.abstained ?? false,
      supportedBy: Object.freeze(nodeArrows.filter((arrow) => arrow.polarity === "support").map((arrow) => arrow.arrowId)),
      attackedBy: Object.freeze(nodeArrows.filter((arrow) => arrow.polarity === "attack").map((arrow) => arrow.arrowId)),
      operatorUsed: resolution?.operator ?? null,
      operatorLevel: resolution?.suppliedBy ?? null,
      positionLabel: node.positionLabel ?? null,
      liftMarker: Object.freeze(markers.get(node.nodeId) ?? [])
    })];
  });
  const unjudgedNodeIds = snapshot.nodes
    .filter((node) => node.baseStrength === null || node.abstained === true)
    .map((node) => node.nodeId);
  const partial = {
    strengths: Object.freeze(strengths),
    unjudgedNodeIds: Object.freeze(unjudgedNodeIds),
    arrowOrder: Object.freeze([...snapshot.arrowOrder]),
    transmissionReductions,
    liftRecords: lifted.records,
    clusterRecords: primary.clusterRecords,
    operatorResolutions: Object.freeze([...snapshot.operatorResolutions]),
    graphFingerprintMaterial: canonicalFingerprintMaterial({
      snapshot,
      reductions: transmissionReductions,
      lifts: lifted.records,
      clusters: primary.clusterRecords
    })
  };
  const sensitivityRecords: SensitivityRecord[] = includeSensitivity
    ? snapshot.nodes.map((removed) => {
      const counterfactual = evaluateInternal(snapshotWithoutNode(snapshot, removed.nodeId), false);
      const afterByNode = new Map(counterfactual.strengths.map((record) => [record.nodeId, record.strength]));
      const fragility = strengths
        .filter((record) => record.nodeId !== removed.nodeId)
        .map((record) => {
          const after = afterByNode.get(record.nodeId) ?? null;
          return Object.freeze({
            nodeId: record.nodeId,
            before: record.strength,
            after,
            difference: after === null ? null : Math.abs(record.strength - after)
          });
        });
      return Object.freeze({
        removedNodeId: removed.nodeId,
        leverage: fragility.reduce((maximum, row) => Math.max(maximum, row.difference ?? 0), 0),
        fragility: Object.freeze(fragility)
      });
    })
    : [];
  return Object.freeze({
    ...partial,
    sensitivityRecords: Object.freeze(sensitivityRecords)
  });
}

export function evaluate(snapshot: EvaluationSnapshot): PropagationOutcome {
  return evaluateInternal(snapshot, true);
}

export interface RootScopedLeverage {
  readonly kind: "LEVERAGE_RESOLVED";
  /** The branch's subtree-root node — the node whose removal was simulated. */
  readonly carryingNodeId: string;
  readonly leverage: number;
  /** The root scope the maximum was restricted to, recorded for audit. */
  readonly rootNodeIds: readonly string[];
}

/**
 * T7 / S3-2 · mission ruling J3 — LEVERAGE IS ROOT-SCOPED (reading (b)).
 *
 * The freeze quantity for a branch is the ROOT-RESTRICTED maximum |Δstrength|
 * taken over the recorded per-node fragility rows of the branch's subtree-root
 * sensitivity record. Propagation has no root notion, so the CALLER (the
 * runner) supplies the root ids. The recorded all-nodes `leverage` field on
 * `SensitivityRecord` stays recorded and is deliberately left UNCONSUMED here:
 * a branch that cannot move any root cannot change the served answer, which is
 * what the goal's own rationale sentence reasons about.
 *
 * A fragility row with a `null` difference contributes nothing. That is the
 * same rule the goal states for UNKNOWN edges — an unmeasured influence cannot
 * unfreeze a branch — applied to the one other way a difference can be absent.
 */
export function resolveLeverage(input: {
  /** The round-1 floor at the leverage door: K=1 must complete first. */
  readonly completedRounds: number;
  readonly carryingNodeId: string;
  readonly sensitivityRecords: readonly SensitivityRecord[];
  readonly rootNodeIds: readonly string[];
}): RootScopedLeverage {
  if (!Number.isInteger(input.completedRounds) || input.completedRounds < 1) {
    throw new TypedDomainError("LEVERAGE_ROUND_INCOMPLETE", "K=1 must complete before leverage can be resolved");
  }
  if (input.rootNodeIds.length === 0) {
    // An empty root scope would read every branch as leverage 0 and freeze the
    // whole debate in silence. J3 puts the root ids on the caller, so their
    // absence is the caller's defect and it stops loudly.
    throw new TypedDomainError(
      "LEVERAGE_ROOT_SCOPE_EMPTY",
      "J3 restricts the freeze quantity to caller-supplied roots; none were supplied"
    );
  }
  const record = input.sensitivityRecords.find((candidate) => candidate.removedNodeId === input.carryingNodeId);
  if (record === undefined) {
    throw new TypedDomainError(
      "LEVERAGE_SUBTREE_ROOT_UNRECORDED",
      `No sensitivity record exists for subtree root ${input.carryingNodeId}`
    );
  }
  const rootScope = new Set(input.rootNodeIds);
  const leverage = record.fragility.reduce(
    (maximum, row) => rootScope.has(row.nodeId) ? Math.max(maximum, row.difference ?? 0) : maximum,
    0
  );
  return Object.freeze({
    kind: "LEVERAGE_RESOLVED",
    carryingNodeId: input.carryingNodeId,
    leverage,
    rootNodeIds: Object.freeze([...input.rootNodeIds])
  });
}

export type BranchFreezeVerdict = "FROZEN" | "CONTINUES";

export interface BranchFreezeDecision {
  readonly carryingNodeId: string;
  readonly leverage: number;
  readonly verdict: BranchFreezeVerdict;
}

/**
 * T7 · branch freeze: leverage < ε ⇒ no expansion beneath the branch.
 *
 * STRICTLY less than. Equality at ε CONTINUES — a branch that moves a root by
 * exactly the threshold is still moving the answer, and the goal's own DoD
 * makes that case one of its four required examples.
 */
export function decideBranchFreezes(input: {
  readonly completedRounds: number;
  readonly sensitivityRecords: readonly SensitivityRecord[];
  readonly branchCarryingNodeIds: readonly string[];
  readonly rootNodeIds: readonly string[];
  readonly epsilon: number;
}): readonly BranchFreezeDecision[] {
  assertUnitInterval(input.epsilon, "branch freeze epsilon");
  return Object.freeze(input.branchCarryingNodeIds.map((carryingNodeId) => {
    const { leverage } = resolveLeverage({
      completedRounds: input.completedRounds,
      carryingNodeId,
      sensitivityRecords: input.sensitivityRecords,
      rootNodeIds: input.rootNodeIds
    });
    return Object.freeze({
      carryingNodeId,
      leverage,
      // STRICT: equality at ε continues.
      verdict: leverage < input.epsilon ? "FROZEN" : "CONTINUES"
    } as BranchFreezeDecision);
  }));
}

export type RoundContinuationReason =
  | "ROUND_1_FLOOR"
  | "NO_PREVIOUS_ROUND"
  | "NO_MEASURED_EDGE"
  | "ROOT_SCOPE_INCOMPLETE"
  | "DEPTH_CEILING"
  | "GLOBAL_DELTA_CONVERGED"
  | "ROOT_MOVED";

export interface RoundContinuationDecision {
  readonly kind: "CONTINUE" | "STOP";
  readonly reason: RoundContinuationReason;
  /** null only when no previous round exists to compare against. */
  readonly maxRootMovement: number | null;
  readonly movedRootNodeIds: readonly string[];
  /**
   * Ruling J15(b): the stop record carries the count of measured edges the
   * decision considered, so an auditor can tell convergence from ignorance.
   */
  readonly measuredEdgeCount: number;
  /**
   * J15 ADDENDUM-2 / codex B1: exactly which of the expected maker roots this
   * decision actually compared. A stop may only ever be claimed when nothing is
   * uncompared — "no root moved > δ" is unproved for a root nobody looked at.
   */
  readonly comparedRootNodeIds: readonly string[];
  readonly uncomparedRootNodeIds: readonly string[];
}

/**
 * Split an AUTHORITATIVE maker-root scope into the roots that can be compared
 * across the two rounds and those that cannot. A root is comparable only when
 * BOTH rounds scored it; an unjudged root (its cross-maker review exhausted,
 * so it never reached judged standing) is uncomparable, not absent.
 */
export function partitionComparableRoots(input: {
  readonly rootNodeIds: readonly string[];
  readonly previousStrengths: readonly NodeStrengthRecord[];
  readonly currentStrengths: readonly NodeStrengthRecord[];
}): { readonly compared: readonly string[]; readonly uncompared: readonly string[] } {
  const before = new Set(input.previousStrengths.map((record) => record.nodeId));
  const after = new Set(input.currentStrengths.map((record) => record.nodeId));
  const compared: string[] = [];
  const uncompared: string[] = [];
  for (const nodeId of input.rootNodeIds) {
    (before.has(nodeId) && after.has(nodeId) ? compared : uncompared).push(nodeId);
  }
  return Object.freeze({ compared: Object.freeze(compared), uncompared: Object.freeze(uncompared) });
}

/**
 * The edges that can actually move a strength: MEASURED, with a magnitude.
 * `computeGraph` skips every other arrow, so this is exactly the evidence the
 * round's root movement could have been made of.
 */
export function countMeasuredEdges(snapshot: EvaluationSnapshot): number {
  return snapshot.arrows.filter((arrow) =>
    arrow.magnitudeStatus === "MEASURED" && arrow.strength !== null).length;
}

/**
 * T7 · the round loop's three gates, in the order the goal states them.
 *
 * 1. ROUND-1 FLOOR — round 1 always runs; movement is not consulted before it.
 * 2. DEPTH CEILING — the ASK-time depth is a ceiling no convergence can raise.
 *    It is checked before movement, because it never depends on movement.
 * 3. GLOBAL δ STOP — stop once no root moved more than δ against THE PREVIOUS
 *    ROUND. The DoD requires this to be reachable BEFORE the ceiling.
 *
 * The δ stop needs a previous ROUND, and after round 1 there is none: the
 * pre-expansion graph is a baseline, not a round. Comparing round 1 against it
 * would let a run whose first round measured nothing report convergence and
 * stop — measured on a real fixture, roots sat at 0.72 before and after round 1
 * purely because no edge beneath them carried a magnitude. Absence of
 * measurement is not agreement, and this rule refuses to read it as agreement.
 * The goal's own text is read the conservative way here: `NO_PREVIOUS_ROUND`
 * continues, so the rule can only ever run MORE rounds, never fewer. The
 * alternative reading (round 0 as the comparison baseline) is a live question
 * for the judge; it is named in this lane's handoff, not settled here.
 */
export function decideRoundContinuation(input: {
  readonly completedRounds: number;
  readonly depthCeiling: number;
  readonly rootNodeIds: readonly string[];
  readonly previousStrengths: readonly NodeStrengthRecord[] | null;
  readonly currentStrengths: readonly NodeStrengthRecord[];
  /** J15(b): how much measured evidence this decision had. `countMeasuredEdges`. */
  readonly measuredEdgeCount: number;
  readonly delta: number;
}): RoundContinuationDecision {
  assertUnitInterval(input.delta, "global stop delta");
  if (!Number.isInteger(input.measuredEdgeCount) || input.measuredEdgeCount < 0) {
    throw new TypedDomainError(
      "STOPPING_MEASURED_EDGE_COUNT_INVALID",
      "The measured-edge count must be a non-negative integer"
    );
  }
  if (!Number.isInteger(input.completedRounds) || input.completedRounds < 0) {
    throw new TypedDomainError("STOPPING_ROUND_COUNT_INVALID", "Completed rounds must be a non-negative integer");
  }
  if (!Number.isInteger(input.depthCeiling) || input.depthCeiling < 1) {
    throw new TypedDomainError("STOPPING_DEPTH_CEILING_INVALID", "The depth ceiling must be a positive integer");
  }
  if (input.rootNodeIds.length === 0) {
    throw new TypedDomainError("STOPPING_ROOT_SCOPE_EMPTY", "The global stop is measured on roots; none were supplied");
  }
  const movement = input.previousStrengths === null
    ? null
    : rootMovement(input.rootNodeIds, input.previousStrengths, input.currentStrengths);
  const measuredEdgeCount = input.measuredEdgeCount;
  // This entry point is STRICT: it is contracted to compare every root it is
  // given, and `rootMovement` stops loudly if it cannot. Callers holding a live
  // scope that may be incomplete go through `decideRoundBoundary` instead.
  const fullScope = {
    comparedRootNodeIds: Object.freeze([...input.rootNodeIds]),
    uncomparedRootNodeIds: Object.freeze([] as readonly string[])
  };
  if (input.completedRounds < 1) {
    return Object.freeze({
      kind: "CONTINUE",
      reason: "ROUND_1_FLOOR",
      maxRootMovement: movement === null ? null : movement.maximum,
      movedRootNodeIds: Object.freeze([]),
      measuredEdgeCount,
      ...fullScope
    });
  }
  if (input.completedRounds >= input.depthCeiling) {
    return Object.freeze({
      kind: "STOP",
      reason: "DEPTH_CEILING",
      maxRootMovement: movement === null ? null : movement.maximum,
      movedRootNodeIds: movement === null ? Object.freeze([]) : movement.moved(input.delta),
      measuredEdgeCount,
      ...fullScope
    });
  }
  if (movement === null) {
    if (input.completedRounds === 1) {
      return Object.freeze({
        kind: "CONTINUE",
        reason: "NO_PREVIOUS_ROUND",
        maxRootMovement: null,
        movedRootNodeIds: Object.freeze([]),
        measuredEdgeCount,
        ...fullScope
      });
    }
    throw new TypedDomainError(
      "STOPPING_PREVIOUS_ROUND_MISSING",
      "The global δ stop compares against the previous round, which was not supplied"
    );
  }
  if (measuredEdgeCount === 0) {
    // Ruling J15(b): a δ stop taken over zero measured edges is VACUOUS — the
    // roots did not agree, nothing was ever weighed. Absence of evidence is not
    // convergence, and reading it as convergence is the silent degradation this
    // mission repeals. The degenerate all-UNKNOWN debate still terminates, and
    // terminates honestly: every branch has zero leverage, so the ε rule freezes
    // them all WITH marks and expansion ends by exhaustion. No loop-forever
    // risk is created here.
    return Object.freeze({
      kind: "CONTINUE",
      reason: "NO_MEASURED_EDGE",
      maxRootMovement: movement.maximum,
      movedRootNodeIds: Object.freeze([]),
      measuredEdgeCount,
      ...fullScope
    });
  }
  const moved = movement.moved(input.delta);
  return Object.freeze(moved.length === 0
    ? {
        kind: "STOP",
        reason: "GLOBAL_DELTA_CONVERGED",
        maxRootMovement: movement.maximum,
        movedRootNodeIds: Object.freeze([]),
        measuredEdgeCount,
        ...fullScope
      }
    : {
        kind: "CONTINUE",
        reason: "ROOT_MOVED",
        maxRootMovement: movement.maximum,
        movedRootNodeIds: moved,
        measuredEdgeCount,
        ...fullScope
      });
}

/**
 * T7 · the LIVE round boundary — ruling J15 ADDENDUM-2 / codex B1.
 *
 * The caller hands the AUTHORITATIVE maker-root scope and never narrows it. A
 * root can legitimately be uncomparable at a live boundary — its cross-maker
 * review exhausted, so it never reached judged standing — and that is a fact
 * about the debate, not a caller defect. r2 filtered such roots out before the
 * decision, which let a run report "no root moved > δ" while one root had never
 * been compared at all; the claimed predicate was simply unproved.
 *
 * So: an uncompared root makes δ-convergence IMPOSSIBLE, and the refusal is
 * recorded with the roots on both sides of it. The floor and the ceiling still
 * apply — neither consults movement — and a complete scope delegates to the
 * strict `decideRoundContinuation`, whose loud guard therefore stays reachable
 * for the case it names: a caller asserting a comparison it cannot make.
 */
export function decideRoundBoundary(input: {
  readonly completedRounds: number;
  readonly depthCeiling: number;
  readonly rootNodeIds: readonly string[];
  readonly previousStrengths: readonly NodeStrengthRecord[] | null;
  readonly currentStrengths: readonly NodeStrengthRecord[];
  readonly measuredEdgeCount: number;
  readonly delta: number;
}): RoundContinuationDecision {
  if (input.previousStrengths === null) return decideRoundContinuation(input);
  const scope = partitionComparableRoots({
    rootNodeIds: input.rootNodeIds,
    previousStrengths: input.previousStrengths,
    currentStrengths: input.currentStrengths
  });
  if (scope.uncompared.length === 0) return decideRoundContinuation(input);
  const recorded = {
    measuredEdgeCount: input.measuredEdgeCount,
    comparedRootNodeIds: scope.compared,
    uncomparedRootNodeIds: scope.uncompared
  };
  if (input.completedRounds < 1) {
    return Object.freeze({
      kind: "CONTINUE", reason: "ROUND_1_FLOOR",
      maxRootMovement: null, movedRootNodeIds: Object.freeze([]), ...recorded
    });
  }
  if (input.completedRounds >= input.depthCeiling) {
    return Object.freeze({
      kind: "STOP", reason: "DEPTH_CEILING",
      maxRootMovement: null, movedRootNodeIds: Object.freeze([]), ...recorded
    });
  }
  return Object.freeze({
    kind: "CONTINUE", reason: "ROOT_SCOPE_INCOMPLETE",
    maxRootMovement: null, movedRootNodeIds: Object.freeze([]), ...recorded
  });
}

function rootMovement(
  rootNodeIds: readonly string[],
  previousStrengths: readonly NodeStrengthRecord[],
  currentStrengths: readonly NodeStrengthRecord[]
): { readonly maximum: number; moved(delta: number): readonly string[] } {
  const before = new Map(previousStrengths.map((record) => [record.nodeId, record.strength]));
  const after = new Map(currentStrengths.map((record) => [record.nodeId, record.strength]));
  const perRoot = rootNodeIds.map((nodeId) => {
    const from = before.get(nodeId);
    const to = after.get(nodeId);
    if (from === undefined || to === undefined) {
      // A root the engine failed to score in one of the two rounds cannot be
      // declared unmoved. Guessing here would let the debate stop on a root
      // nobody measured, so it is a typed loud stop.
      throw new TypedDomainError(
        "STOPPING_ROOT_STRENGTH_UNRESOLVED",
        `Root ${nodeId} has no strength in ${from === undefined ? "the previous" : "the current"} round`
      );
    }
    return { nodeId, movement: Math.abs(to - from) };
  });
  return {
    maximum: perRoot.reduce((maximum, row) => Math.max(maximum, row.movement), 0),
    moved: (delta: number) => Object.freeze(perRoot
      .filter((row) => row.movement > delta)
      .map((row) => row.nodeId))
  };
}
