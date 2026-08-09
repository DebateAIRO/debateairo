import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialBatteryRows } from "@debateai/battery";
import { RunRepository, migrate } from "@debateai/db";
import { EvidenceRepository } from "../../packages/evidence/src/index.js";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

async function createRunAndNode(label: string): Promise<{ runId: string; nodeId: string }> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: label, askerId: `asker:${label}`, sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-08-08T00:00:00Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, agentCount: 1, strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "s06",
    batteryRows: createInitialBatteryRows({ settlementWatchHandle: `watch:${label}` })
  });
  const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, (writer) => writer.addNode({
    runId, statementText: "Evidence-backed test claim", claimType: "empirical", parentNodeId: null,
    childKind: null, siblingOrdinal: 0, generationStatus: "complete", pathStatus: "active",
    explorationDecision: "seek_evidence", provenanceRef: null, wayOfKnowing: "LOOKED_UP",
    locator: "https://test.invalid/source", valueLaden: false
  }));
  return { runId, nodeId };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => database?.stop());

describe("S06 A-06 raw PostgreSQL carriers", () => {
  it("writes all eight evidence tables through the production repository seams", async () => {
    const { runId, nodeId } = await createRunAndNode("s06-eight-tables");
    const evidence = new EvidenceRepository(database.pool);
    const querySetRef = await evidence.recordFrozenQuerySet({ runId, version: 1, seeds: [
      { text: "supporting source", polarity: "SUPPORTING", derivedFromQuestion: true },
      { text: "disconfirming source", polarity: "DISCONFIRMING", derivedFromQuestion: true }
    ] });
    await evidence.recordQueryAmendment({ runId, querySetRef, kind: "MECHANICAL_REPAIR", amendedQuery: "canonical source", reason: "canonical alias" });
    const sourceRef = await evidence.recordSource({
      runId, querySetRef, locator: "https://test.invalid/source", archivedVersion: "version:test-layer",
      retrievedAt: new Date("2026-08-07T00:00:00Z"), accessDepth: "OPENED_FULL", sourceRole: "PRIMARY",
      suppliedQuoteRef: "quote:test-layer", contentHash: "a".repeat(64)
    });
    const evidenceItemRef = await evidence.recordEvidenceItem({
      runId, nodeId, sourceRef, excerpt: "A test-layer excerpt.", excerptTruncated: false,
      truncationAtWordBoundary: false, relevance: "ON_SUBJECT", score: 0.7,
      scoreProducer: "EVIDENCE_PIPELINE", replayHandle: "evidence:test-layer",
      studyOrDatasetIdentity: "dataset:test-layer", sourceDomain: null, publisher: null,
      producingRunId: runId, modelFamily: "maker:test-layer", archivedSourceVersion: "version:test-layer",
      retrievedAt: new Date("2026-08-07T00:00:00Z")
    });
    const absenceRowRef = await evidence.recordAbsence({
      runId, querySetRef, queryText: "missing counter-source", scope: "test-layer scope",
      observedAt: new Date("2026-08-07T00:00:00Z"), reason: "zero retrieval results"
    });

    const artifactId = randomUUID();
    const ledger = new LedgerRepository(database.pool);
    await ledger.appendRawArtifact({
      artifactId, attemptId: randomUUID(), runId, providerRef: "provider:test-layer", provider: "http",
      model: "instrument:test-layer", maker: "maker:test-layer", modelVersion: null,
      rawText: "typed probe capture", metadata: { fixture: "test-layer" }, parseStatus: "PARSED",
      inputHash: "input:test-layer", contractHash: "contract:test-layer", contentHash: "b".repeat(64)
    });
    const entry = await ledger.append({
      runId, actionKind: "MODEL_CALL", callSiteKey: "evidence.probe", subjectItemId: nodeId,
      stanceAtAction: "NEUTRAL", outcome: "OK", actorRef: "gateway:test-layer",
      inputHash: "input:test-layer", contractHash: "contract:test-layer", rawArtifactRef: artifactId,
      startedAt: new Date("2026-08-07T00:00:00Z"), finishedAt: new Date("2026-08-07T00:00:01Z")
    });
    const positiveRef = await evidence.recordProbeCapture({
      runId, nodeId, gatewayLedgerEntryRef: entry.ledgerEntryId, rawArtifactRef: artifactId,
      instrumentRef: "instrument:test-layer", expectedPolarity: "POSITIVE", observedOutcome: "POSITIVE",
      observation: { fixture: "known-positive" }
    });
    const negativeRef = await evidence.recordProbeCapture({
      runId, nodeId, gatewayLedgerEntryRef: entry.ledgerEntryId, rawArtifactRef: artifactId,
      instrumentRef: "instrument:test-layer", expectedPolarity: "NEGATIVE", observedOutcome: "NEGATIVE",
      observation: { fixture: "known-negative" }
    });
    await evidence.recordInstrumentCertification({
      runId, instrumentRef: "instrument:test-layer",
      positive: { captureRef: positiveRef, expected: "POSITIVE", observed: "POSITIVE" },
      negative: { captureRef: negativeRef, expected: "NEGATIVE", observed: "NEGATIVE" }
    });
    await evidence.recordCitationAttempt({
      runId, nodeId, assertionRef: "assertion:test-layer", rowId: "Q16", engineVersion: "s06-test",
      citationNamesSource: false, completeRetrievalRecord: false, absenceRowRef,
      attemptAccessDepth: null, sourceCurrent: true, spanCited: false, comparisonSupported: false,
      comparisonExecuted: false, comparisonOutcome: null, comparisonResult: null,
      sourceRef: null, evidenceItemRef: null, ledgerEntryRef: null, openingActionRef: null
    });
    await evidence.recordCitationAttempt({
      runId, nodeId, assertionRef: "assertion:r6-test-layer", rowId: "Q16", engineVersion: "s06-test",
      citationNamesSource: true, completeRetrievalRecord: true, absenceRowRef: null,
      attemptAccessDepth: "OPENED_FULL", sourceCurrent: true, spanCited: false,
      comparisonSupported: true, comparisonExecuted: true, comparisonOutcome: "OK", comparisonResult: null,
      sourceRef, evidenceItemRef, ledgerEntryRef: entry.ledgerEntryId, openingActionRef: entry.ledgerEntryId
    });

    const persistedRoutes = await database.pool.query<{ route: string; compare_unavailable_reason: string | null }>(
      "SELECT route, compare_unavailable_reason FROM evidence.citation_route_record WHERE run_id=$1 ORDER BY at_seq",
      [runId]
    );
    expect(persistedRoutes.rows).toEqual([
      { route: "NO_SOURCE_FOUND", compare_unavailable_reason: null },
      { route: "EXACT_COMPARE_UNAVAILABLE", compare_unavailable_reason: "NO_SPAN_CITED" }
    ]);

    const counts = await database.pool.query<{ table_name: string; rows: string }>(`
      SELECT 'absence_row' AS table_name, count(*)::text AS rows FROM evidence.absence_row
      UNION ALL SELECT 'citation_route_record', count(*)::text FROM evidence.citation_route_record
      UNION ALL SELECT 'evidence_item', count(*)::text FROM evidence.evidence_item
      UNION ALL SELECT 'instrument_certification', count(*)::text FROM evidence.instrument_certification
      UNION ALL SELECT 'probe_capture', count(*)::text FROM evidence.probe_capture
      UNION ALL SELECT 'query_amendment', count(*)::text FROM evidence.query_amendment
      UNION ALL SELECT 'query_set', count(*)::text FROM evidence.query_set
      UNION ALL SELECT 'source_record', count(*)::text FROM evidence.source_record
      ORDER BY table_name
    `);
    expect(counts.rows.map((row) => row.table_name)).toEqual([
      "absence_row", "citation_route_record", "evidence_item", "instrument_certification",
      "probe_capture", "query_amendment", "query_set", "source_record"
    ]);
    expect(counts.rows.every((row) => Number(row.rows) > 0)).toBe(true);
  });

  it("rejects preview-only content and mutation through raw SQL", async () => {
    const { runId } = await createRunAndNode("s06-ddl-gates");
    const evidence = new EvidenceRepository(database.pool);
    const querySetRef = await evidence.recordFrozenQuerySet({ runId, version: 1, seeds: [
      { text: "support", polarity: "SUPPORTING", derivedFromQuestion: true },
      { text: "oppose", polarity: "DISCONFIRMING", derivedFromQuestion: true }
    ] });
    await expect(evidence.recordSource({
      runId, querySetRef, locator: "https://test.invalid/preview", archivedVersion: "v1",
      retrievedAt: new Date(), accessDepth: "PREVIEW_ONLY", sourceRole: "SECONDARY",
      suppliedQuoteRef: "forbidden:quote"
    })).rejects.toThrow();
    await expect(database.pool.query("UPDATE evidence.query_set SET version=2 WHERE query_set_id=$1", [querySetRef])).rejects.toThrow();
  });

  it("rejects a scored REJECTED item in both the domain and raw PostgreSQL", async () => {
    const { runId, nodeId } = await createRunAndNode("s06-rejected-cannot-score");
    const evidence = new EvidenceRepository(database.pool);
    const querySetRef = await evidence.recordFrozenQuerySet({ runId, version: 1, seeds: [
      { text: "support", polarity: "SUPPORTING", derivedFromQuestion: true },
      { text: "oppose", polarity: "DISCONFIRMING", derivedFromQuestion: true }
    ] });
    const sourceRef = await evidence.recordSource({
      runId, querySetRef, locator: "https://test.invalid/off-subject", archivedVersion: "version:test-layer",
      retrievedAt: new Date("2026-08-07T00:00:00Z"), accessDepth: "OPENED_FULL", sourceRole: "PRIMARY"
    });
    const scoredRejected = {
      runId, nodeId, sourceRef, excerpt: "Wholly off-subject test-layer excerpt",
      excerptTruncated: false, truncationAtWordBoundary: false, relevance: "OFF_SUBJECT" as const,
      offSubjectShare: "the cited population is wholly unrelated", score: 0.7,
      scoreProducer: "EVIDENCE_PIPELINE" as const, replayHandle: "evidence:test-layer",
      studyOrDatasetIdentity: "dataset:test-layer", sourceDomain: null, publisher: null,
      producingRunId: runId, modelFamily: "maker:test-layer", archivedSourceVersion: "version:test-layer",
      retrievedAt: new Date("2026-08-07T00:00:00Z")
    };
    await expect(evidence.recordEvidenceItem(scoredRejected)).rejects.toMatchObject({
      code: "SCORED_REJECTED_EVIDENCE_REFUSED"
    });

    await expect(database.pool.query(`
      INSERT INTO evidence.evidence_item (
        evidence_item_id, run_id, node_id, source_ref, excerpt, excerpt_truncated,
        truncation_at_word_boundary, admissibility, off_subject_share, base_score,
        score_producer, provenance_cluster_key, archived_source_version, retrieved_at, at_seq
      ) VALUES ($1,$2,$3,$4,$5,false,false,'REJECTED',$6,0.7,'EVIDENCE_PIPELINE',$7,$8,$9,ledger.allocate_sequence())
    `, [
      randomUUID(), runId, nodeId, sourceRef, scoredRejected.excerpt, scoredRejected.offSubjectShare,
      "dataset:test-layer|run:test-layer|maker:test-layer", scoredRejected.archivedSourceVersion,
      scoredRejected.retrievedAt
    ])).rejects.toThrow();
  });
});
