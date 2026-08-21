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
import { agg, product, σ } from "@debateai/published-arithmetic";

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
  readonly rivalOperator: ScoringOperator | null;
  readonly rivalStrength: number | null;
}

export interface PropagationOutcome {
  readonly strengths: readonly NodeStrengthRecord[];
  readonly withheld: readonly { readonly nodeId: string; readonly reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED" }[];
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
  readonly requiresEverySupportConjunct: boolean;
  aggregateSupport(values: readonly number[]): number;
}

const ACCUMULATE_STRATEGY: ScoringStrategy = Object.freeze({
  id: "accumulate",
  requiresEverySupportConjunct: false,
  aggregateSupport: agg
});

const STRICT_AND_STRATEGY: ScoringStrategy = Object.freeze({
  id: "strict-and",
  requiresEverySupportConjunct: true,
  aggregateSupport: (values: readonly number[]) => values.length === 0 ? agg(values) : product(values)
});

function scoringStrategy(operator: ScoringOperator): ScoringStrategy {
  switch (operator) {
    case "accumulate": return ACCUMULATE_STRATEGY;
    case "strict-and": return STRICT_AND_STRATEGY;
    default: return exhaustive(operator);
  }
}

function rivalOperator(operator: ScoringOperator): ScoringOperator {
  switch (operator) {
    case "accumulate": return "strict-and";
    case "strict-and": return "accumulate";
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
  readonly withheld: ReadonlySet<string>;
  readonly clusterRecords: readonly ClusterCollapseRecord[];
  readonly survivingArrows: readonly EffectiveArrow[];
}

function computeGraph(input: {
  readonly snapshot: EvaluationSnapshot;
  readonly arrows: readonly EffectiveArrow[];
  readonly reductions: readonly TransmissionReduction[];
  readonly rival: boolean;
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
  const withheld = new Set<string>();
  const visiting = new Set<string>();
  const clusterRecords = new Map<string, ClusterCollapseRecord>();
  const survivingArrows = new Map<string, EffectiveArrow>();
  const valueOf = (nodeId: string): number | null => {
    if (values.has(nodeId)) return values.get(nodeId)!;
    if (withheld.has(nodeId)) return null;
    const node = nodes.get(nodeId)!;
    if (node.baseStrength === null || node.abstained === true) return null;
    if (visiting.has(nodeId)) throw new TypedDomainError("GRAPH_CYCLE_DETECTED", "A cycle reached scoring");
    visiting.add(nodeId);
    const nodeArrows = incoming.get(nodeId) ?? [];
    const resolution = resolutions.get(nodeId);
    if (nodeArrows.length > 0 && resolution === undefined) {
      throw new TypedDomainError("OPERATOR_RESOLUTION_MISSING", `No register-backed operator resolved for ${nodeId}`);
    }
    const selected = resolution?.operator;
    const operator = input.rival && selected !== undefined
      ? rivalOperator(selected)
      : selected;
    const strategy = operator === undefined ? undefined : scoringStrategy(operator);
    const support: number[] = [];
    const attack: number[] = [];
    let missingStrictConjunct = false;
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
        if (strategy?.requiresEverySupportConjunct === true && arrow.polarity === "support") missingStrictConjunct = true;
        continue;
      }
      if (arrow.polarity === "support") {
        support.push(contribution!);
      } else {
        attack.push(contribution!);
      }
    }
    if (strategy?.requiresEverySupportConjunct === true && missingStrictConjunct) {
      visiting.delete(nodeId);
      withheld.add(nodeId);
      return null;
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
    withheld,
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
  const primary = computeGraph({ snapshot, arrows: lifted.arrows, reductions: transmissionReductions, rival: false });
  const rival = computeGraph({ snapshot, arrows: lifted.arrows, reductions: transmissionReductions, rival: true });
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
    const rivalStrength = resolution === undefined ? null : rival.values.get(node.nodeId) ?? null;
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
      liftMarker: Object.freeze(markers.get(node.nodeId) ?? []),
      // The ledger owns this as an all-or-nothing pair. A strict-and rival can
      // be withheld by an honestly UNKNOWN support magnitude; recording only
      // its operator would claim a rival result that does not exist.
      rivalOperator: rivalStrength === null ? null : rivalOperator(resolution!.operator),
      rivalStrength
    })];
  });
  const withheld = snapshot.nodes
    .filter((node) => primary.withheld.has(node.nodeId))
    .map((node) => Object.freeze({
      nodeId: node.nodeId,
      reason: "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED" as const
    }));
  const unjudgedNodeIds = snapshot.nodes
    .filter((node) => node.baseStrength === null || node.abstained === true)
    .map((node) => node.nodeId);
  const partial = {
    strengths: Object.freeze(strengths),
    withheld: Object.freeze(withheld),
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

export function resolveLeverage(input: {
  readonly completedRounds: number;
  readonly carryingNodeId: string;
}): { readonly kind: "LEVERAGE_UNRESOLVED"; readonly carryingNodeId: string } {
  if (input.completedRounds < 1) {
    throw new TypedDomainError("LEVERAGE_ROUND_INCOMPLETE", "K=1 must complete before leverage can be unresolved");
  }
  return Object.freeze({ kind: "LEVERAGE_UNRESOLVED", carryingNodeId: input.carryingNodeId });
}
