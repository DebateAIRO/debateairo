import { createHash } from "node:crypto";
import type { Pool } from "@debateai/db";
import {
  ServeRepository,
  type ConditionMarkRecord,
  type PreservedConditionMarkRecord
} from "@debateai/serve";

/**
 * Engine money rule, M5 review (I1) test support: a DR-184 review catch-up
 * VERSION of a run's answer, written exactly the way `prepareVersion(...).persist()`
 * writes one — a superseding persist that carries the answer's verdict, marks
 * and served number forward and runs no answer-writing step, so it gets no
 * story and no disclosure record of its own. Returns the new version.
 */
export async function persistCatchUpVersion(pool: Pool, runId: string): Promise<number> {
  const serve = new ServeRepository(pool);
  const source = await serve.readReviewCatchUpSource(runId);
  const records = source.answer.condition_mark_records.map((record): PreservedConditionMarkRecord => ({
    mark: record.mark as ConditionMarkRecord["mark"], scope: record.scope, subjectRef: record.subject_ref,
    reason: record.reason, liftPath: record.lift_path, servedRootRule: record.served_root_rule,
    affectedNodeIds: record.affected_node_ids, callSiteKey: record.call_site_key,
    plannedLegCount: record.planned_leg_count,
    terminalTransportOutcome: record.terminal_transport_outcome,
    reviewOutcome: record.review_outcome,
    hiddenStrength: record.hidden_strength, hiddenScoreThreshold: record.hidden_score_threshold,
    hiddenScoreThresholdSourceRef: record.hidden_score_threshold_source_ref,
    excludedFromServedNumber: record.excluded_from_served_number,
    judgedBasisCount: record.judged_basis_count
  }));
  const persisted = await serve.persist({
    runId, workItemId: source.workItemId, factBundleVersion: source.factBundleVersion,
    factBundleContentHash: createHash("sha256").update(JSON.stringify(source.factBundle)).digest("hex"),
    factBundle: source.factBundle,
    result: {
      terminal: source.answer.terminal, answerForm: source.answer.answer_form,
      factBundle: source.factBundle, gateTrace: [], conditionMarks: source.answer.condition_marks,
      conformance: [], coverageMode: "NOT_RUN", segments: [],
      compositionBudget: { tier: "low", bound: 1, registerRowKey: "test", registerVersion: 1, sourceRef: "test" },
      confidenceBand: source.answer.confidence_band,
      bandCeiling: source.answer.band_ceiling === null ? null : {
        label: source.answer.band_ceiling.label, basis: source.answer.band_ceiling.basis,
        registerRowKey: source.answer.band_ceiling.register_row_key,
        registerVersion: source.answer.band_ceiling.register_version,
        sourceRef: source.answer.band_ceiling.source_ref,
        liftPath: source.answer.band_ceiling.lift_path
      },
      digest: null, loopRounds: [], standingObjection: null, crashClass: null,
      projections: {
        reversalPoint: source.answer.reversal_point,
        buildsOnPrevious: source.factBundle.buildsOnPrevious,
        memoryDisclosure: source.factBundle.memoryDisclosure
      }
    } as never,
    segments: source.answer.composed_text.map((segment) => ({
      segmentId: segment.segment_id, text: segment.text, loadBearing: segment.load_bearing,
      assertedNodeRefs: [], servedNumberRefs: segment.served_number_refs
    })),
    compositionRawArtifactRef: null, compositionAttempt: 0, conformanceRawArtifactRefs: [],
    conditionMarkRecords: records,
    servedNumber: source.servedNumber === null ? null : {
      numberRef: source.servedNumber.numberRef, value: source.servedNumber.value,
      numberKind: source.servedNumber.numberKind, sourceRef: source.servedNumber.sourceRef,
      producer: source.servedNumber.producer, replayHandle: source.servedNumber.replayHandle,
      propagationRunId: source.servedNumber.propagationRunId
    },
    supersedes: { answerId: source.answerId }
  });
  return persisted.answerVersion;
}
