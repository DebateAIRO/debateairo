import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import {
  TypedDomainError,
  createLabeledNumber,
  type AccessDepth,
  type CitationRoute,
  type ClaimType,
  type CompareUnavailableReason,
  type LedgerOutcome
} from "@debateai/kernel";

const nonBlank = (value: string, code: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new TypedDomainError(code, "A required evidence-domain label is blank");
  return trimmed;
};

export type QueryPolarity = "SUPPORTING" | "DISCONFIRMING";
export interface QuerySeed {
  readonly text: string;
  readonly polarity: QueryPolarity;
  readonly derivedFromQuestion: boolean;
}

export function freezeQuerySet(seeds: readonly QuerySeed[]): {
  readonly queries: readonly Readonly<{ text: string; polarity: QueryPolarity }>[];
  readonly contentHash: string;
} {
  if (seeds.some((seed) => !seed.derivedFromQuestion)) {
    throw new TypedDomainError("OFF_PLAN_QUERY_REFUSED", "Retrieval queries must be derived from the frozen question");
  }
  const deduplicated = new Map<string, Readonly<{ text: string; polarity: QueryPolarity }>>();
  for (const seed of seeds) {
    const text = nonBlank(seed.text, "BLANK_QUERY_REFUSED");
    deduplicated.set(`${seed.polarity}\0${text}`, Object.freeze({ text, polarity: seed.polarity }));
  }
  const queries = Object.freeze([...deduplicated.values()]);
  if (queries.length === 0 || !queries.some((query) => query.polarity === "DISCONFIRMING")) {
    throw new TypedDomainError("OPPOSITION_QUERY_REQUIRED", "A frozen query set must include disconfirming terms");
  }
  const contentHash = createHash("sha256").update(JSON.stringify(queries)).digest("hex");
  return Object.freeze({ queries, contentHash });
}

export type QueryAmendmentKind = "MECHANICAL_REPAIR" | "SEMANTIC_REAIM";
export function createQueryAmendment(input: {
  readonly querySetRef: string;
  readonly kind: QueryAmendmentKind;
  readonly amendedQuery: string;
  readonly reason: string;
}): Readonly<typeof input & { confirmationPower: "FULL" | "EXPLORATION_ONLY" }> {
  const result = {
    querySetRef: nonBlank(input.querySetRef, "QUERY_SET_REF_REQUIRED"),
    kind: input.kind,
    amendedQuery: nonBlank(input.amendedQuery, "AMENDED_QUERY_REQUIRED"),
    reason: nonBlank(input.reason, "AMENDMENT_REASON_REQUIRED"),
    confirmationPower: input.kind === "MECHANICAL_REPAIR" ? "FULL" as const : "EXPLORATION_ONLY" as const
  };
  return Object.freeze(result);
}

export type SubjectRelevance = "ON_SUBJECT" | "PARTLY_RELEVANT" | "OFF_SUBJECT";
export function assessAdmissibility(input: { readonly relevance: SubjectRelevance; readonly offSubjectShare?: string }): {
  readonly outcome: "ADMITTED" | "ADMITTED_DOWNGRADED" | "REJECTED";
  readonly scoreAllowed: boolean;
  readonly visibleDowngrade: string | null;
} {
  if (input.relevance === "ON_SUBJECT") return Object.freeze({ outcome: "ADMITTED", scoreAllowed: true, visibleDowngrade: null });
  const reason = nonBlank(input.offSubjectShare ?? "", "OFF_SUBJECT_SHARE_REQUIRED");
  return input.relevance === "PARTLY_RELEVANT"
    ? Object.freeze({ outcome: "ADMITTED_DOWNGRADED", scoreAllowed: true, visibleDowngrade: reason })
    : Object.freeze({ outcome: "REJECTED", scoreAllowed: false, visibleDowngrade: reason });
}

export function deriveProvenanceClusterKey(input: {
  readonly studyOrDatasetIdentity: string | null;
  readonly sourceDomain: string | null;
  readonly publisher: string | null;
  readonly producingRunId: string;
  readonly modelFamily: string;
  readonly nodeId: string;
}): string {
  const identity = input.studyOrDatasetIdentity?.trim()
    || [input.sourceDomain?.trim(), input.publisher?.trim()].filter(Boolean).join("|");
  if (!identity) return `singleton:${nonBlank(input.nodeId, "NODE_ID_REQUIRED")}`;
  return `${identity}|${nonBlank(input.producingRunId, "PRODUCING_RUN_REQUIRED")}|${nonBlank(input.modelFamily, "MODEL_FAMILY_REQUIRED")}`;
}

export function evaluateFreshness(input: {
  readonly newestRetrievedAt: Date;
  readonly asOf: Date;
  readonly maxAgeMs: number;
  readonly registerRowRef: string;
  readonly pace: "FAST_MOVING" | "SLOW_OR_STATIC";
}): {
  readonly state: "CURRENT" | "STALE";
  readonly consequence: "SERVE" | "REFUSE" | "SERVE_WITH_STALENESS";
  readonly registerRowRef: string;
} {
  if (!Number.isFinite(input.maxAgeMs) || input.maxAgeMs < 0) throw new TypedDomainError("FRESHNESS_BOUND_INVALID", "Freshness requires a non-negative register bound");
  const registerRowRef = nonBlank(input.registerRowRef, "FRESHNESS_REGISTER_ROW_REQUIRED");
  const stale = input.asOf.getTime() - input.newestRetrievedAt.getTime() > input.maxAgeMs;
  return Object.freeze({
    state: stale ? "STALE" : "CURRENT",
    consequence: stale ? (input.pace === "FAST_MOVING" ? "REFUSE" : "SERVE_WITH_STALENESS") : "SERVE",
    registerRowRef
  });
}

export function createEvidenceBaseScore(input: {
  readonly value: number;
  readonly producer: "EVIDENCE_PIPELINE" | "MODEL_ASSERTION";
  readonly sourceRef: string;
  readonly evidenceItemRef: string;
  readonly replayHandle: string;
}) {
  if (input.producer !== "EVIDENCE_PIPELINE") {
    throw new TypedDomainError("MODEL_ASSERTED_EVIDENCE_SCORE_REFUSED", "A cited leaf base score must come from the evidence pipeline");
  }
  return createLabeledNumber({
    value: input.value,
    kind: "base-probability",
    source: nonBlank(input.sourceRef, "SOURCE_REF_REQUIRED"),
    producer: "evidence:pipeline",
    provenanceRef: nonBlank(input.evidenceItemRef, "EVIDENCE_ITEM_REF_REQUIRED"),
    replayHandle: nonBlank(input.replayHandle, "EVIDENCE_REPLAY_HANDLE_REQUIRED")
  });
}

export interface CitationAttemptFacts {
  readonly citationNamesSource: boolean;
  readonly completeRetrievalRecord: boolean;
  readonly absenceRowRef: string | null;
  readonly attemptAccessDepth: AccessDepth | null;
  readonly sourceCurrent: boolean;
  readonly spanCited: boolean;
  readonly comparisonSupported: boolean;
  readonly comparisonExecuted: boolean;
  readonly comparisonOutcome: LedgerOutcome | null;
  readonly comparisonResult: Readonly<{ present: boolean; exact: boolean }> | null;
}

export type CitationDisposition = Readonly<{
  outcome: "VERIFIED" | "ROUTED";
  route: CitationRoute | null;
  compareUnavailableReason: CompareUnavailableReason | null;
}>;

const routed = (route: CitationRoute, compareUnavailableReason: CompareUnavailableReason | null = null): CitationDisposition =>
  Object.freeze({ outcome: "ROUTED", route, compareUnavailableReason });

export function classifyCitationAttempt(facts: CitationAttemptFacts): CitationDisposition {
  if (!facts.citationNamesSource) return facts.absenceRowRef === null ? routed("CITATION_UNBACKED") : routed("NO_SOURCE_FOUND");
  if (!facts.completeRetrievalRecord) return routed("CITATION_UNBACKED");
  if (facts.attemptAccessDepth === null) throw new TypedDomainError("ATTEMPT_ACCESS_DEPTH_MISSING", "An opening attempt must record its own access depth");
  if (facts.attemptAccessDepth === "ACCESS_BLOCKED") return routed("SOURCE_UNREACHABLE");
  if (facts.attemptAccessDepth === "PREVIEW_ONLY") return routed("PREVIEW_DEPTH_ONLY");
  if (!facts.sourceCurrent) return routed("SOURCE_SUPERSEDED");
  if (!facts.spanCited) return routed("EXACT_COMPARE_UNAVAILABLE", "NO_SPAN_CITED");
  if (!facts.comparisonSupported) return routed("EXACT_COMPARE_UNAVAILABLE", "MEDIUM_UNSUPPORTED");
  if (!facts.comparisonExecuted) return routed("EXACT_COMPARE_UNAVAILABLE", "COMPARE_NOT_EXECUTED");
  if (facts.comparisonOutcome === "SKIPPED_BY_BUDGET") {
    throw new TypedDomainError("PROTECTED_CITATION_COMPARE_SKIPPED", "Citation comparison is protected core and cannot be skipped for budget");
  }
  if (facts.comparisonOutcome !== "OK") return routed("EXACT_COMPARE_UNAVAILABLE", "COMPARE_EXECUTION_NOT_OK");
  if (facts.comparisonResult === null) return routed("EXACT_COMPARE_UNAVAILABLE", "COMPARE_RESULT_MISSING");
  if (!facts.comparisonResult.present) return routed("SPAN_NOT_FOUND");
  if (!facts.comparisonResult.exact) return routed("SPAN_MISMATCH");
  return Object.freeze({ outcome: "VERIFIED", route: null, compareUnavailableReason: null });
}

const evidenceFree = (claimType: ClaimType, valueLaden: boolean): boolean =>
  valueLaden || claimType === "normative" || claimType === "definitional";

export function evaluateEvidenceGate(input: {
  readonly claimType: ClaimType;
  readonly valueLaden: boolean;
  readonly evidenceSatisfied: boolean;
  readonly unsuppressedBand: string;
  readonly subjectRef: string;
  readonly unlockCondition: string;
}): {
  readonly publication: "UNSUPPRESSED" | "UNSUPPRESSED_WITH_SHADOW";
  readonly publishedBand: string;
  readonly shadowSuppression: null | Readonly<{
    gate: "EVIDENCE_GATE";
    subjectRef: string;
    wouldHaveSuppressed: "VERDICT";
    unlockCondition: string;
  }>;
} {
  const publishedBand = nonBlank(input.unsuppressedBand, "UNSUPPRESSED_BAND_REQUIRED");
  if (evidenceFree(input.claimType, input.valueLaden) || input.evidenceSatisfied) {
    return Object.freeze({ publication: "UNSUPPRESSED", publishedBand, shadowSuppression: null });
  }
  return Object.freeze({
    publication: "UNSUPPRESSED_WITH_SHADOW",
    publishedBand,
    shadowSuppression: Object.freeze({
      gate: "EVIDENCE_GATE",
      subjectRef: nonBlank(input.subjectRef, "SHADOW_SUBJECT_REQUIRED"),
      wouldHaveSuppressed: "VERDICT",
      unlockCondition: nonBlank(input.unlockCondition, "SHADOW_UNLOCK_REQUIRED")
    })
  });
}

export interface ProbeReceipt {
  readonly captureRef: string;
  readonly expected: "POSITIVE" | "NEGATIVE";
  readonly observed: "POSITIVE" | "NEGATIVE" | "INCONCLUSIVE";
}

export function certifyInstrument(input: { readonly instrumentRef: string; readonly positive: ProbeReceipt; readonly negative: ProbeReceipt }) {
  const positiveCaptureRef = nonBlank(input.positive.captureRef, "POSITIVE_CAPTURE_REQUIRED");
  const negativeCaptureRef = nonBlank(input.negative.captureRef, "NEGATIVE_CAPTURE_REQUIRED");
  if (positiveCaptureRef === negativeCaptureRef) throw new TypedDomainError("DISTINCT_CERTIFICATION_CAPTURES_REQUIRED", "Known-positive and known-negative receipts must be distinct");
  const outcome = input.positive.expected === "POSITIVE" && input.positive.observed === "POSITIVE"
    && input.negative.expected === "NEGATIVE" && input.negative.observed === "NEGATIVE"
    ? "CERTIFIED" as const : "UNINSTRUMENTED" as const;
  return Object.freeze({ instrumentRef: nonBlank(input.instrumentRef, "INSTRUMENT_REF_REQUIRED"), outcome, positiveCaptureRef, negativeCaptureRef });
}

export class EvidenceRepository {
  constructor(private readonly pool: Pool) {}

  async recordFrozenQuerySet(input: { readonly runId: string; readonly version: number; readonly seeds: readonly QuerySeed[] }): Promise<string> {
    const frozen = freezeQuerySet(input.seeds);
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ query_set_id: string }>(
        `INSERT INTO evidence.query_set (run_id, version, queries, content_hash, frozen_at_seq)
         VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING query_set_id`,
        [input.runId, input.version, JSON.stringify(frozen.queries), frozen.contentHash, atSeq]
      );
      return row.rows[0]!.query_set_id;
    });
  }

  async recordQueryAmendment(input: {
    readonly runId: string;
    readonly querySetRef: string;
    readonly kind: QueryAmendmentKind;
    readonly amendedQuery: string;
    readonly reason: string;
  }): Promise<string> {
    const amendment = createQueryAmendment(input);
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ query_amendment_id: string }>(
        `INSERT INTO evidence.query_amendment (
          run_id, query_set_ref, kind, amended_query, reason, confirmation_power, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING query_amendment_id`,
        [input.runId, amendment.querySetRef, amendment.kind, amendment.amendedQuery, amendment.reason, amendment.confirmationPower, atSeq]
      );
      return row.rows[0]!.query_amendment_id;
    });
  }

  async recordSource(input: {
    readonly runId: string;
    readonly querySetRef: string;
    readonly locator: string;
    readonly archivedVersion: string;
    readonly retrievedAt: Date;
    readonly accessDepth: AccessDepth;
    readonly sourceRole: "PRIMARY" | "SECONDARY";
    readonly suppliedNumberRef?: string | null;
    readonly suppliedQuoteRef?: string | null;
    readonly contentHash?: string | null;
  }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ source_record_id: string }>(
        `INSERT INTO evidence.source_record (
          run_id, query_set_ref, locator, archived_version, retrieved_at, access_depth,
          source_role, supplied_number_ref, supplied_quote_ref, content_hash, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING source_record_id`,
        [
          input.runId, input.querySetRef, input.locator, input.archivedVersion, input.retrievedAt,
          input.accessDepth, input.sourceRole, input.suppliedNumberRef ?? null,
          input.suppliedQuoteRef ?? null, input.contentHash ?? null, atSeq
        ]
      );
      return row.rows[0]!.source_record_id;
    });
  }

  async recordEvidenceItem(input: {
    readonly runId: string;
    readonly nodeId: string;
    readonly sourceRef: string;
    readonly excerpt: string | null;
    readonly excerptTruncated: boolean;
    readonly truncationAtWordBoundary: boolean;
    readonly relevance: SubjectRelevance;
    readonly offSubjectShare?: string;
    readonly score?: number;
    readonly scoreProducer?: "EVIDENCE_PIPELINE" | "MODEL_ASSERTION";
    readonly replayHandle?: string;
    readonly studyOrDatasetIdentity: string | null;
    readonly sourceDomain: string | null;
    readonly publisher: string | null;
    readonly producingRunId: string;
    readonly modelFamily: string;
    readonly archivedSourceVersion: string;
    readonly retrievedAt: Date;
  }): Promise<string> {
    const admissibility = assessAdmissibility(input);
    if (!admissibility.scoreAllowed && input.score !== undefined) {
      throw new TypedDomainError(
        "SCORED_REJECTED_EVIDENCE_REFUSED",
        "Wholly off-subject evidence must be rejected before scoring"
      );
    }
    const clusterKey = deriveProvenanceClusterKey(input);
    const evidenceItemId = randomUUID();
    const score = input.score === undefined ? null : createEvidenceBaseScore({
      value: input.score,
      producer: input.scoreProducer ?? "MODEL_ASSERTION",
      sourceRef: input.sourceRef,
      evidenceItemRef: evidenceItemId,
      replayHandle: input.replayHandle ?? ""
    });
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ evidence_item_id: string }>(
        `INSERT INTO evidence.evidence_item (
          evidence_item_id, run_id, node_id, source_ref, excerpt, excerpt_truncated, truncation_at_word_boundary,
          admissibility, off_subject_share, base_score, score_producer, provenance_cluster_key,
          archived_source_version, retrieved_at, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING evidence_item_id`,
        [
          evidenceItemId, input.runId, input.nodeId, input.sourceRef, input.excerpt, input.excerptTruncated,
          input.truncationAtWordBoundary, admissibility.outcome, admissibility.visibleDowngrade,
          score?.value ?? null, score === null ? null : "EVIDENCE_PIPELINE", clusterKey,
          input.archivedSourceVersion, input.retrievedAt, atSeq
        ]
      );
      return row.rows[0]!.evidence_item_id;
    });
  }

  async recordAbsence(input: { readonly runId: string; readonly querySetRef: string; readonly queryText: string; readonly scope: string; readonly observedAt: Date; readonly reason: string }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ absence_row_id: string }>(
        `INSERT INTO evidence.absence_row (run_id, query_set_ref, query_text, scope, observed_at, reason, at_seq)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING absence_row_id`,
        [input.runId, input.querySetRef, input.queryText, input.scope, input.observedAt, input.reason, atSeq]
      );
      return row.rows[0]!.absence_row_id;
    });
  }

  async recordProbeCapture(input: {
    readonly runId: string;
    readonly nodeId: string;
    readonly gatewayLedgerEntryRef: string;
    readonly rawArtifactRef: string;
    readonly instrumentRef: string;
    readonly expectedPolarity: "POSITIVE" | "NEGATIVE";
    readonly observedOutcome: "POSITIVE" | "NEGATIVE" | "INCONCLUSIVE";
    readonly observation: Readonly<Record<string, unknown>>;
  }): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ probe_capture_id: string }>(
        `INSERT INTO evidence.probe_capture (
          run_id, node_id, gateway_ledger_entry_ref, raw_artifact_ref, instrument_ref,
          expected_polarity, observed_outcome, observation, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING probe_capture_id`,
        [input.runId, input.nodeId, input.gatewayLedgerEntryRef, input.rawArtifactRef, input.instrumentRef, input.expectedPolarity, input.observedOutcome, JSON.stringify(input.observation), atSeq]
      );
      return row.rows[0]!.probe_capture_id;
    });
  }

  async recordInstrumentCertification(input: { readonly runId: string; readonly instrumentRef: string; readonly positive: ProbeReceipt; readonly negative: ProbeReceipt }): Promise<string> {
    const certification = certifyInstrument(input);
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ instrument_certification_id: string }>(
        `INSERT INTO evidence.instrument_certification (
          run_id, instrument_ref, positive_probe_capture_ref, negative_probe_capture_ref, outcome, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING instrument_certification_id`,
        [input.runId, certification.instrumentRef, certification.positiveCaptureRef, certification.negativeCaptureRef, certification.outcome, atSeq]
      );
      return row.rows[0]!.instrument_certification_id;
    });
  }

  async recordCitationAttempt(input: CitationAttemptFacts & {
    readonly runId: string;
    readonly nodeId: string;
    readonly assertionRef: string;
    readonly rowId: "Q16" | "Q40" | "Q51";
    readonly sourceRef: string | null;
    readonly evidenceItemRef: string | null;
    readonly ledgerEntryRef: string | null;
    readonly openingActionRef: string | null;
    readonly claimedSourceText?: string | null;
    readonly previewLimb?: "COMPLIANT" | "PROHIBITED_EXTRACTION" | null;
    readonly observedVersion?: string | null;
    readonly observedAt?: Date | null;
    readonly mismatchLocus?: Readonly<Record<string, unknown>> | null;
    readonly engineVersion: string;
  }): Promise<string> {
    const disposition = classifyCitationAttempt(input);
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ citation_route_record_id: string }>(
        `INSERT INTO evidence.citation_route_record (
          run_id, node_id, assertion_ref, row_id, at_seq, outcome, route, source_ref,
          evidence_item_ref, absence_row_ref, ledger_entry_ref, opening_action_ref,
          attempt_access_depth, claimed_source_text, preview_limb, compare_unavailable_reason,
          observed_version, observed_at, mismatch_locus, engine_version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
        RETURNING citation_route_record_id`,
        [
          input.runId, input.nodeId, input.assertionRef, input.rowId, atSeq,
          disposition.outcome, disposition.route, input.sourceRef, input.evidenceItemRef,
          input.absenceRowRef, input.ledgerEntryRef, input.openingActionRef,
          input.attemptAccessDepth, input.claimedSourceText ?? null, input.previewLimb ?? null,
          disposition.compareUnavailableReason, input.observedVersion ?? null, input.observedAt ?? null,
          input.mismatchLocus === undefined || input.mismatchLocus === null ? null : JSON.stringify(input.mismatchLocus),
          input.engineVersion
        ]
      );
      return row.rows[0]!.citation_route_record_id;
    });
  }

  async readFreshness(input: { readonly runId: string; readonly maxAgeMs: number; readonly registerRowRef: string; readonly pace: "FAST_MOVING" | "SLOW_OR_STATIC" }) {
    const row = await this.pool.query<{ as_of: Date; newest_retrieved_at: Date | null }>(
      `SELECT run.as_of, max(source.retrieved_at) AS newest_retrieved_at
       FROM core.run AS run
       LEFT JOIN evidence.source_record AS source ON source.run_id = run.run_id
       WHERE run.run_id=$1 GROUP BY run.as_of`, [input.runId]
    );
    const current = row.rows[0];
    if (current === undefined || current.newest_retrieved_at === null) {
      throw new TypedDomainError("FRESHNESS_SOURCE_MISSING", "Freshness cannot be computed without a source record");
    }
    return evaluateFreshness({ newestRetrievedAt: current.newest_retrieved_at, asOf: current.as_of, maxAgeMs: input.maxAgeMs, registerRowRef: input.registerRowRef, pace: input.pace });
  }

  async recordShadowSuppression(input: { readonly answerId: string; readonly answerVersion: number; readonly subjectRef: string; readonly unsuppressedBand: string; readonly unlockCondition: string; readonly claimType: ClaimType; readonly valueLaden: boolean }): Promise<string | null> {
    const result = evaluateEvidenceGate({ ...input, evidenceSatisfied: false });
    if (result.shadowSuppression === null) return null;
    return withWriteTransaction(this.pool, async (client) => {
      const atSeq = await allocateSequence(client);
      const row = await client.query<{ shadow_suppression_id: string }>(
        `INSERT INTO serve.shadow_suppression (
          answer_id, answer_version, gate, subject_ref, would_have_suppressed, unlock_condition, at_seq
        ) VALUES ($1,$2,'EVIDENCE_GATE',$3,$4::jsonb,$5,$6) RETURNING shadow_suppression_id`,
        [input.answerId, input.answerVersion, input.subjectRef, JSON.stringify({ verdict: true, unsuppressedBand: input.unsuppressedBand }), input.unlockCondition, atSeq]
      );
      return row.rows[0]!.shadow_suppression_id;
    });
  }
}
