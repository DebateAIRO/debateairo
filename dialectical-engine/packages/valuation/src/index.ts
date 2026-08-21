import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import {
  TypedDomainError,
  exhaustive,
  type RunPhase,
  type WeightSourceKind
} from "@debateai/kernel";
import {
  evaluate,
  type EvaluationSnapshot,
  type NodeStrengthRecord
} from "@debateai/propagation";

export type WeightSource =
  | { readonly source: "owner_elicited"; readonly owner: string; readonly vector: Readonly<Record<string, number>> }
  | {
      readonly source: "org_policy";
      readonly owner: string;
      readonly vector: Readonly<Record<string, number>>;
      readonly profileRef: string;
      readonly profileVersion: string;
      readonly signatureRef: string;
    }
  | { readonly source: "none" };

type WeightSourceInput =
  | { readonly source: "owner_elicited"; readonly owner: string; readonly vector: Readonly<Record<string, number>> }
  | {
      readonly source: "org_policy";
      readonly owner: string;
      readonly vector: Readonly<Record<string, number>>;
      readonly profileRef: string;
      readonly profileVersion: string;
      readonly signatureRef: string;
    }
  | { readonly source: "none" };

export interface CriterionCandidate {
  readonly criterionId: string;
  readonly label: string;
  readonly source: "MODEL_PROPOSED" | "ASKER_STEERED";
  readonly evidenceRefs: readonly string[];
}

export interface OptionVector {
  readonly optionId: string;
  readonly label: string;
  readonly criteria: Readonly<Record<string, number>>;
}

export interface ReversalBoundary {
  readonly coefficients: Readonly<Record<string, number>>;
  readonly constant: 0;
}

export interface ValueHinge {
  readonly leftOptionId: string;
  readonly rightOptionId: string;
  readonly leftAdvantageCriterionIds: readonly string[];
  readonly rightAdvantageCriterionIds: readonly string[];
  readonly reversalBoundary: ReversalBoundary;
}

export interface ValueOverlayResult {
  readonly weightSource: WeightSource;
  readonly acceptedCriteria: readonly CriterionCandidate[];
  readonly rejectedCriteria: readonly {
    readonly criterionId: string;
    readonly label: string;
    readonly reason: "EVIDENCE_LINK_MISSING" | "EVIDENCE_LINK_NOT_FOUND";
    readonly evidenceRefs: readonly string[];
  }[];
  readonly paretoOptionIds: readonly string[];
  readonly valueHinges: readonly ValueHinge[];
  readonly detachmentProof: {
    readonly recordedArrowOrder: readonly string[];
    readonly recordedStrengths: readonly NodeStrengthRecord[];
    readonly detachedStrengths: readonly NodeStrengthRecord[];
    readonly byteIdentical: true;
  };
  readonly flows: {
    readonly flowA:
      | { readonly kind: "UNCONDITIONAL"; readonly dominantOptionId: string }
      | { readonly kind: "CONDITIONAL"; readonly reversalPoints: readonly ValueHinge[] };
    readonly flowB: {
      readonly swingQuestions: readonly {
        readonly hingeOrdinal: number;
        readonly leftOptionId: string;
        readonly rightOptionId: string;
        readonly leftCriterionIds: readonly string[];
        readonly rightCriterionIds: readonly string[];
        readonly prompt: string;
      }[];
    };
    readonly flowC:
      | { readonly kind: "NOT_OPTED_IN" }
      | {
          readonly kind: "OPTED_IN";
          readonly profileRef: string;
          readonly profileVersion: string;
          readonly signatureRef: string;
        };
  };
  readonly recommendation: null | {
    readonly optionId: string;
    readonly optionLabel: string;
    readonly weightMarker: { readonly source: Exclude<WeightSourceKind, "none">; readonly owner: string };
  };
}

function requireNonBlank(value: string, code: string, message: string): string {
  if (value.trim().length === 0) throw new TypedDomainError(code, message);
  return value;
}

function freezeVector(vector: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const entries = Object.entries(vector);
  if (entries.length === 0) {
    throw new TypedDomainError("WEIGHT_VECTOR_EMPTY", "A supplied weight vector cannot be empty");
  }
  for (const [criterionId, weight] of entries) {
    requireNonBlank(criterionId, "WEIGHT_CRITERION_INVALID", "A weight criterion id cannot be blank");
    if (!Number.isFinite(weight) || weight < 0) {
      throw new TypedDomainError("WEIGHT_VALUE_INVALID", "Every supplied weight must be finite and non-negative");
    }
  }
  if (!entries.some(([, weight]) => weight > 0)) {
    throw new TypedDomainError("WEIGHT_VECTOR_ZERO", "A supplied weight vector must contain a positive weight");
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function createWeightSource(input: WeightSourceInput): WeightSource {
  switch (input.source) {
    case "none":
      return Object.freeze({ source: "none" });
    case "owner_elicited":
      return Object.freeze({
        source: input.source,
        owner: requireNonBlank(
          input.owner,
          "EMPTY_OVERLAY_OWNER",
          "An owner-elicited overlay must name its owner"
        ),
        vector: freezeVector(input.vector)
      });
    case "org_policy":
      requireNonBlank(input.owner, "EMPTY_OVERLAY_OWNER", "An organization overlay must name its owner");
      for (const value of [input.profileRef, input.profileVersion, input.signatureRef]) {
        requireNonBlank(
          value,
          "ORG_POLICY_PROFILE_INVALID",
          "An organization policy profile must be signed, versioned, and explicitly referenced"
        );
      }
      return Object.freeze({
        source: input.source,
        owner: input.owner,
        vector: freezeVector(input.vector),
        profileRef: input.profileRef,
        profileVersion: input.profileVersion,
        signatureRef: input.signatureRef
      });
    default:
      return exhaustive(input);
  }
}

function criteriaGuards(
  candidates: readonly CriterionCandidate[],
  actualEvidenceRefs: readonly string[]
): Pick<ValueOverlayResult, "acceptedCriteria" | "rejectedCriteria"> {
  const evidence = new Set(actualEvidenceRefs);
  const ids = new Set<string>();
  const accepted: CriterionCandidate[] = [];
  const rejected: ValueOverlayResult["rejectedCriteria"][number][] = [];
  for (const candidate of candidates) {
    requireNonBlank(candidate.criterionId, "CRITERION_ID_INVALID", "A criterion id cannot be blank");
    requireNonBlank(candidate.label, "CRITERION_LABEL_INVALID", "A criterion label cannot be blank");
    if (ids.has(candidate.criterionId)) {
      throw new TypedDomainError("CRITERION_ID_DUPLICATE", `Criterion ${candidate.criterionId} is duplicated`);
    }
    ids.add(candidate.criterionId);
    if (candidate.source === "MODEL_PROPOSED" && candidate.evidenceRefs.length === 0) {
      rejected.push(Object.freeze({
        criterionId: candidate.criterionId,
        label: candidate.label,
        reason: "EVIDENCE_LINK_MISSING",
        evidenceRefs: Object.freeze([])
      }));
      continue;
    }
    if (candidate.source === "MODEL_PROPOSED" && candidate.evidenceRefs.some((ref) => !evidence.has(ref))) {
      rejected.push(Object.freeze({
        criterionId: candidate.criterionId,
        label: candidate.label,
        reason: "EVIDENCE_LINK_NOT_FOUND",
        evidenceRefs: Object.freeze([...candidate.evidenceRefs])
      }));
      continue;
    }
    accepted.push(Object.freeze({ ...candidate, evidenceRefs: Object.freeze([...candidate.evidenceRefs]) }));
  }
  if (accepted.length === 0) {
    throw new TypedDomainError("VALUE_CRITERIA_EMPTY", "No evidence-linked or asker-supplied criteria remain");
  }
  return Object.freeze({
    acceptedCriteria: Object.freeze(accepted),
    rejectedCriteria: Object.freeze(rejected)
  });
}

function projectOptions(options: readonly OptionVector[], criterionIds: readonly string[]): readonly OptionVector[] {
  if (options.length < 2) {
    throw new TypedDomainError("VALUE_OPTIONS_INSUFFICIENT", "A value comparison requires at least two options");
  }
  const optionIds = new Set<string>();
  return Object.freeze(options.map((option) => {
    requireNonBlank(option.optionId, "OPTION_ID_INVALID", "An option id cannot be blank");
    requireNonBlank(option.label, "OPTION_LABEL_INVALID", "An option label cannot be blank");
    if (optionIds.has(option.optionId)) {
      throw new TypedDomainError("OPTION_ID_DUPLICATE", `Option ${option.optionId} is duplicated`);
    }
    optionIds.add(option.optionId);
    const projected: Record<string, number> = {};
    for (const criterionId of criterionIds) {
      const value = option.criteria[criterionId];
      if (value === undefined || !Number.isFinite(value)) {
        throw new TypedDomainError(
          "OPTION_CRITERION_UNRESOLVED",
          `Option ${option.optionId} has no finite value for criterion ${criterionId}`
        );
      }
      projected[criterionId] = value;
    }
    return Object.freeze({ optionId: option.optionId, label: option.label, criteria: Object.freeze(projected) });
  }));
}

function dominates(left: OptionVector, right: OptionVector, criterionIds: readonly string[]): boolean {
  return criterionIds.every((criterionId) => left.criteria[criterionId]! >= right.criteria[criterionId]!)
    && criterionIds.some((criterionId) => left.criteria[criterionId]! > right.criteria[criterionId]!);
}

function paretoSet(options: readonly OptionVector[], criterionIds: readonly string[]): readonly OptionVector[] {
  return Object.freeze(options.filter((candidate) =>
    !options.some((other) => other.optionId !== candidate.optionId && dominates(other, candidate, criterionIds))
  ));
}

function hinges(options: readonly OptionVector[], criterionIds: readonly string[]): readonly ValueHinge[] {
  const output: ValueHinge[] = [];
  for (let leftIndex = 0; leftIndex < options.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < options.length; rightIndex += 1) {
      const left = options[leftIndex]!;
      const right = options[rightIndex]!;
      const leftAdvantages = criterionIds.filter((criterionId) => left.criteria[criterionId]! > right.criteria[criterionId]!);
      const rightAdvantages = criterionIds.filter((criterionId) => right.criteria[criterionId]! > left.criteria[criterionId]!);
      if (leftAdvantages.length === 0 || rightAdvantages.length === 0) continue;
      output.push(Object.freeze({
        leftOptionId: left.optionId,
        rightOptionId: right.optionId,
        leftAdvantageCriterionIds: Object.freeze(leftAdvantages),
        rightAdvantageCriterionIds: Object.freeze(rightAdvantages),
        reversalBoundary: Object.freeze({
          coefficients: Object.freeze(Object.fromEntries(
            criterionIds.map((criterionId) => [criterionId, left.criteria[criterionId]! - right.criteria[criterionId]!])
          )),
          constant: 0
        })
      }));
    }
  }
  return Object.freeze(output);
}

function assertWeightCoverage(weightSource: WeightSource, criterionIds: readonly string[]): void {
  if (weightSource.source === "none") return;
  const supplied = Object.keys(weightSource.vector).sort();
  const required = [...criterionIds].sort();
  if (JSON.stringify(supplied) !== JSON.stringify(required)) {
    throw new TypedDomainError(
      "WEIGHT_VECTOR_CRITERIA_MISMATCH",
      "A supplied weight vector must cover exactly the accepted criterion set"
    );
  }
}

function recommendation(
  options: readonly OptionVector[],
  criterionIds: readonly string[],
  weightSource: WeightSource
): ValueOverlayResult["recommendation"] {
  if (weightSource.source === "none") return null;
  const scored = options.map((option) => ({
    option,
    score: criterionIds.reduce(
      (sum, criterionId) => sum + option.criteria[criterionId]! * weightSource.vector[criterionId]!,
      0
    )
  })).sort((left, right) => right.score - left.score || left.option.optionId.localeCompare(right.option.optionId));
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null;
  const winner = scored[0]!.option;
  return Object.freeze({
    optionId: winner.optionId,
    optionLabel: winner.label,
    weightMarker: Object.freeze({ source: weightSource.source, owner: weightSource.owner })
  });
}

export function buildValueOverlay(input: {
  readonly snapshot: EvaluationSnapshot;
  readonly recordedStrengths: readonly NodeStrengthRecord[];
  readonly criterionCandidates: readonly CriterionCandidate[];
  readonly actualEvidenceRefs: readonly string[];
  readonly options: readonly OptionVector[];
  readonly weightSource: WeightSource;
}): ValueOverlayResult {
  const detachedStrengths = evaluate(input.snapshot).strengths;
  if (JSON.stringify(input.recordedStrengths) !== JSON.stringify(detachedStrengths)) {
    throw new TypedDomainError(
      "OVERLAY_DETACHMENT_VIOLATION",
      "FX-LG-07 requires every detached strength to remain byte-identical"
    );
  }
  const guarded = criteriaGuards(input.criterionCandidates, input.actualEvidenceRefs);
  const criterionIds = guarded.acceptedCriteria.map((criterion) => criterion.criterionId);
  const options = projectOptions(input.options, criterionIds);
  assertWeightCoverage(input.weightSource, criterionIds);
  const pareto = paretoSet(options, criterionIds);
  const valueHinges = hinges(pareto, criterionIds);
  const dominant = pareto.length === 1 ? pareto[0] : undefined;
  const swingQuestions = valueHinges.map((hinge, index) => Object.freeze({
    hingeOrdinal: index + 1,
    leftOptionId: hinge.leftOptionId,
    rightOptionId: hinge.rightOptionId,
    leftCriterionIds: hinge.leftAdvantageCriterionIds,
    rightCriterionIds: hinge.rightAdvantageCriterionIds,
    prompt: `Is moving ${hinge.leftAdvantageCriterionIds.join(", ")} from worst to best worth more or less than moving ${hinge.rightAdvantageCriterionIds.join(", ")} from worst to best?`
  }));
  return Object.freeze({
    weightSource: input.weightSource,
    ...guarded,
    paretoOptionIds: Object.freeze(pareto.map((option) => option.optionId)),
    valueHinges,
    detachmentProof: Object.freeze({
      recordedArrowOrder: Object.freeze([...input.snapshot.arrowOrder]),
      recordedStrengths: Object.freeze([...input.recordedStrengths]),
      detachedStrengths: Object.freeze([...detachedStrengths]),
      byteIdentical: true
    }),
    flows: Object.freeze({
      flowA: dominant === undefined
        ? Object.freeze({ kind: "CONDITIONAL", reversalPoints: valueHinges })
        : Object.freeze({ kind: "UNCONDITIONAL", dominantOptionId: dominant.optionId }),
      flowB: Object.freeze({ swingQuestions: Object.freeze(swingQuestions) }),
      flowC: input.weightSource.source === "org_policy"
        ? Object.freeze({
            kind: "OPTED_IN",
            profileRef: input.weightSource.profileRef,
            profileVersion: input.weightSource.profileVersion,
            signatureRef: input.weightSource.signatureRef
          })
        : Object.freeze({ kind: "NOT_OPTED_IN" })
    }),
    recommendation: recommendation(options, criterionIds, input.weightSource)
  });
}

export interface MixedValueAnswer {
  readonly settlementAct: "DUAL_ACT";
  readonly empiricalSettlementRef: string;
  readonly sections: readonly [
    {
      readonly label: "what is true";
      readonly projection: { readonly findingFacts: readonly string[] };
    },
    {
      readonly label: "what follows given your values";
      readonly projection: {
        readonly weightSource: WeightSource;
        readonly recommendation: ValueOverlayResult["recommendation"];
        readonly reversalPoints: readonly ValueHinge[];
        readonly rejectedCriteria: ValueOverlayResult["rejectedCriteria"];
        readonly swingQuestions: ValueOverlayResult["flows"]["flowB"]["swingQuestions"];
      };
    }
  ];
}

export function serveMixedAnswer(input: {
  readonly phase: RunPhase;
  readonly empiricalSettlementRef: string | null;
  readonly findingFacts: readonly string[];
  readonly overlay: ValueOverlayResult;
}): MixedValueAnswer {
  if (input.phase !== "VALUE" || input.empiricalSettlementRef === null || input.empiricalSettlementRef.trim().length === 0) {
    throw new TypedDomainError(
      "VALUE_PHASE_NOT_READY",
      "DR-053 forbids value projection before the empirical phase has a settled propagation receipt"
    );
  }
  if (input.findingFacts.length === 0 || input.findingFacts.some((fact) => fact.trim().length === 0)) {
    throw new TypedDomainError("EMPIRICAL_FINDINGS_MISSING", "The empirical section requires frozen finding facts");
  }
  if (input.overlay.recommendation !== null && input.overlay.recommendation.weightMarker.owner.trim().length === 0) {
    throw new TypedDomainError("EMPTY_OVERLAY_OWNER", "A recommendation cannot be served without a named value owner");
  }
  const empiricalSection: MixedValueAnswer["sections"][0] = Object.freeze({
    label: "what is true",
    projection: Object.freeze({ findingFacts: Object.freeze([...input.findingFacts]) })
  });
  const valueSection: MixedValueAnswer["sections"][1] = Object.freeze({
    label: "what follows given your values",
    projection: Object.freeze({
      weightSource: input.overlay.weightSource,
      recommendation: input.overlay.recommendation,
      reversalPoints: input.overlay.valueHinges,
      rejectedCriteria: input.overlay.rejectedCriteria,
      swingQuestions: input.overlay.flows.flowB.swingQuestions
    })
  });
  return Object.freeze({
    settlementAct: "DUAL_ACT",
    empiricalSettlementRef: input.empiricalSettlementRef,
    sections: Object.freeze([empiricalSection, valueSection]) as MixedValueAnswer["sections"]
  });
}

export interface FrozenPropagationReceipt {
  readonly runId: string;
  readonly arrowOrder: readonly string[];
  readonly operatorResolutions: readonly unknown[];
  readonly clusterRecords: readonly unknown[];
  readonly strengths: readonly NodeStrengthRecord[];
}

export class ValuationRepository {
  constructor(private readonly pool: Pool) {}

  async readFrozenPropagation(propagationRunId: string): Promise<FrozenPropagationReceipt> {
    const propagation = await this.pool.query<{
      run_id: string;
      arrow_order: unknown;
      operator_by_parent: unknown;
      cluster_records: unknown;
    }>(`
      SELECT run_id, arrow_order, operator_by_parent, cluster_records
      FROM ledger.propagation_run WHERE propagation_run_id=$1
    `, [propagationRunId]);
    const row = propagation.rows[0];
    if (row === undefined) {
      throw new TypedDomainError("PROPAGATION_RECEIPT_MISSING", `No frozen propagation receipt ${propagationRunId}`);
    }
    if (!Array.isArray(row.arrow_order) || !Array.isArray(row.operator_by_parent) || !Array.isArray(row.cluster_records)) {
      throw new TypedDomainError("PROPAGATION_RECEIPT_INVALID", "The frozen propagation receipt is not replay-grade");
    }
    const strengths = await this.pool.query<{
      node_id: string;
      strength: number;
      tau_source: string | null;
      way_of_knowing: "LOOKED_UP" | "RAN" | "REASONING";
      judged_by: string | null;
      abstained: boolean;
      supported_by: unknown;
      attacked_by: unknown;
      operator_used: NodeStrengthRecord["operatorUsed"];
      operator_level: NodeStrengthRecord["operatorLevel"];
      position_label: string | null;
      lift_marker: unknown;
      rival_operator: NodeStrengthRecord["rivalOperator"];
      rival_strength: number | null;
    }>(`
      SELECT strength.node_id, strength.strength, strength.tau_source,
             strength.way_of_knowing, strength.judged_by, strength.abstained,
             strength.supported_by, strength.attacked_by, strength.operator_used,
             strength.operator_level, strength.position_label, strength.lift_marker,
             strength.rival_operator, strength.rival_strength
      FROM ledger.node_strength_record AS strength
      JOIN core.node AS node ON node.node_id = strength.node_id
      WHERE strength.propagation_run_id=$1 ORDER BY node.created_at_seq
    `, [propagationRunId]);
    const mapped = strengths.rows.map((strength): NodeStrengthRecord => {
      if (!Array.isArray(strength.supported_by) || !Array.isArray(strength.attacked_by) || !Array.isArray(strength.lift_marker)) {
        throw new TypedDomainError("PROPAGATION_STRENGTH_INVALID", `Stored strength ${strength.node_id} is not replay-grade`);
      }
      return Object.freeze({
        nodeId: strength.node_id,
        strength: Number(strength.strength),
        tauSource: strength.tau_source,
        wayOfKnowing: strength.way_of_knowing,
        judgedBy: strength.judged_by,
        abstained: strength.abstained,
        supportedBy: Object.freeze(strength.supported_by as string[]),
        attackedBy: Object.freeze(strength.attacked_by as string[]),
        operatorUsed: strength.operator_used,
        operatorLevel: strength.operator_level,
        positionLabel: strength.position_label,
        liftMarker: Object.freeze(strength.lift_marker as NodeStrengthRecord["liftMarker"]),
        rivalOperator: strength.rival_operator,
        rivalStrength: strength.rival_strength === null ? null : Number(strength.rival_strength)
      });
    });
    return Object.freeze({
      runId: row.run_id,
      arrowOrder: Object.freeze(row.arrow_order as string[]),
      operatorResolutions: Object.freeze(row.operator_by_parent),
      clusterRecords: Object.freeze(row.cluster_records),
      strengths: Object.freeze(mapped)
    });
  }

  async recordOverlay(input: {
    readonly runId: string;
    readonly propagationRunId: string;
    readonly overlay: ValueOverlayResult;
  }): Promise<{ readonly overlayRunId: string; readonly valueHingeIds: readonly string[] }> {
    return withWriteTransaction(this.pool, async (client) => {
      const propagation = await client.query<{ at_seq: string }>(`
        SELECT at_seq::text FROM ledger.propagation_run
        WHERE propagation_run_id=$1 AND run_id=$2
      `, [input.propagationRunId, input.runId]);
      if (propagation.rows[0] === undefined) {
        throw new TypedDomainError(
          "EMPIRICAL_SETTLEMENT_MISSING",
          "DR-053 requires a frozen empirical propagation receipt on the same run"
        );
      }
      const badSensitivity = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM ledger.sensitivity_record
        WHERE propagation_run_id=$1 AND at_seq <= $2
      `, [input.propagationRunId, Number(propagation.rows[0].at_seq)]);
      if (Number(badSensitivity.rows[0]!.count) !== 0) {
        throw new TypedDomainError(
          "SENSITIVITY_FEEDBACK_ORDER_INVALID",
          "AC-29 requires sensitivity records to be written after their propagation run"
        );
      }
      const phase = await client.query<{ phase: string }>(`
        SELECT value_json #>> '{}' AS phase FROM core.run_progress_event
        WHERE run_id=$1 AND kind='PHASE' ORDER BY at_seq DESC LIMIT 1
      `, [input.runId]);
      const currentPhase = phase.rows[0]?.phase;
      if (currentPhase === "EMPIRICAL") {
        await client.query(`
          INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
          VALUES ($1,$2,'PHASE','"VALUE"'::jsonb)
        `, [input.runId, await allocateSequence(client)]);
      } else if (currentPhase !== "VALUE") {
        throw new TypedDomainError("VALUE_PHASE_NOT_READY", "The run has no legal empirical-to-value phase transition");
      }

      const valueHingeIds: string[] = [];
      for (const hinge of input.overlay.valueHinges) {
        const atSequence = await allocateSequence(client);
        const created = await client.query<{ value_hinge_id: string }>(`
          INSERT INTO core.value_hinge (
            run_id, left_option_id, right_option_id, criterion_ids,
            reversal_boundary, weight_source, weight_owner, weight_vector, at_seq
          ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9)
          RETURNING value_hinge_id
        `, [
          input.runId,
          hinge.leftOptionId,
          hinge.rightOptionId,
          JSON.stringify([...hinge.leftAdvantageCriterionIds, ...hinge.rightAdvantageCriterionIds]),
          JSON.stringify(hinge.reversalBoundary),
          input.overlay.weightSource.source,
          input.overlay.weightSource.source === "none" ? null : input.overlay.weightSource.owner,
          input.overlay.weightSource.source === "none" ? null : JSON.stringify(input.overlay.weightSource.vector),
          atSequence
        ]);
        const valueHingeId = created.rows[0]!.value_hinge_id;
        valueHingeIds.push(valueHingeId);
        await client.query(`
          INSERT INTO core.reversal_point (
            run_id, value_hinge_id, left_option_id, right_option_id,
            boundary, rejected_criteria, at_seq
          ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
        `, [
          input.runId,
          valueHingeId,
          hinge.leftOptionId,
          hinge.rightOptionId,
          JSON.stringify(hinge.reversalBoundary),
          JSON.stringify(input.overlay.rejectedCriteria),
          await allocateSequence(client)
        ]);
      }
      const overlayRun = await client.query<{ overlay_run_id: string }>(`
        INSERT INTO ledger.overlay_run (
          run_id, propagation_run_id, weight_source, weight_owner, weight_vector,
          profile_ref, profile_version, signature_ref, accepted_criteria,
          rejected_criteria, pareto_option_ids, recorded_arrow_order,
          recorded_strengths, detached_strengths, detachment_byte_identical, at_seq
        ) VALUES (
          $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,
          $12::jsonb,$13::jsonb,$14::jsonb,true,$15
        ) RETURNING overlay_run_id
      `, [
        input.runId,
        input.propagationRunId,
        input.overlay.weightSource.source,
        input.overlay.weightSource.source === "none" ? null : input.overlay.weightSource.owner,
        input.overlay.weightSource.source === "none" ? null : JSON.stringify(input.overlay.weightSource.vector),
        input.overlay.weightSource.source === "org_policy" ? input.overlay.weightSource.profileRef : null,
        input.overlay.weightSource.source === "org_policy" ? input.overlay.weightSource.profileVersion : null,
        input.overlay.weightSource.source === "org_policy" ? input.overlay.weightSource.signatureRef : null,
        JSON.stringify(input.overlay.acceptedCriteria),
        JSON.stringify(input.overlay.rejectedCriteria),
        JSON.stringify(input.overlay.paretoOptionIds),
        JSON.stringify(input.overlay.detachmentProof.recordedArrowOrder),
        JSON.stringify(input.overlay.detachmentProof.recordedStrengths),
        JSON.stringify(input.overlay.detachmentProof.detachedStrengths),
        await allocateSequence(client)
      ]);
      return Object.freeze({
        overlayRunId: overlayRun.rows[0]!.overlay_run_id,
        valueHingeIds: Object.freeze(valueHingeIds)
      });
    });
  }
}

export type DeepeningResolution =
  | {
      readonly kind: "REEXECUTE";
      readonly round: 1;
      readonly nodeSet: readonly [string];
    }
  | {
      readonly kind: "HALT";
      readonly conditionMark: "LEVERAGE_UNRESOLVED";
      readonly carryingPieceRef: string;
    };

export function resolveDeepeningReentry(input: {
  readonly parentNodeId: string;
  readonly roundsCompletedForParentInRun: number;
  readonly carryingPieceRef: string;
}): DeepeningResolution {
  if (input.parentNodeId.trim().length === 0 || input.carryingPieceRef.trim().length === 0) {
    throw new TypedDomainError("DEEPENING_IDENTITY_MISSING", "The parent and carrying piece are required");
  }
  if (!Number.isInteger(input.roundsCompletedForParentInRun) || input.roundsCompletedForParentInRun < 0) {
    throw new TypedDomainError("DEEPENING_ROUND_INVALID", "The run-scoped deepening count must be a non-negative integer");
  }
  if (input.roundsCompletedForParentInRun === 0) {
    return Object.freeze({ kind: "REEXECUTE", round: 1, nodeSet: Object.freeze([input.parentNodeId]) as readonly [string] });
  }
  return Object.freeze({
    kind: "HALT",
    conditionMark: "LEVERAGE_UNRESOLVED",
    carryingPieceRef: input.carryingPieceRef
  });
}
