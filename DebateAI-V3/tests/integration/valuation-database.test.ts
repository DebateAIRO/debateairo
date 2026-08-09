import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ValuationRepository,
  buildValueOverlay,
  createWeightSource
} from "@debateai/valuation";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => database?.stop());

describe("S10 / P17 / DR-053 — real PostgreSQL value-overlay carriers", () => {
  it("persists phase, hinge, reversal, detachment, and post-propagation sensitivity receipts", async () => {
    const runId = await new RunRepository(database.pool).startRun({
      questionLine: "Test-layer mixed travel choice",
      askerId: "asker:s10-test-layer",
      sessionId: "session:s10-test-layer",
      callerScope: "ASKER",
      asOf: new Date("2026-08-08T00:00:00Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "asker-declaration:s10-test-layer",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      agentCount: 1,
      strangerSampleRate: 1,
      envelopeBasis: { source: "test-layer" },
      registerVersion: 1,
      batteryVersion: "s10-test-layer",
      batteryRows: []
    });
    const graph = new GraphRepository(database.pool);
    const nodeIds = await graph.withGraphWrite(runId, async (writer) => {
      const trainNodeId = await writer.addNode({
        runId,
        statementText: "Test-layer train fact",
        claimType: "comparative",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        provenanceRef: null,
        wayOfKnowing: "REASONING",
        locator: null,
        valueLaden: true
      });
      const busNodeId = await writer.addNode({
        runId,
        statementText: "Test-layer bus fact",
        claimType: "comparative",
        parentNodeId: trainNodeId,
        childKind: "support",
        siblingOrdinal: 1,
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        provenanceRef: null,
        wayOfKnowing: "REASONING",
        locator: null,
        valueLaden: true
      });
      return Object.freeze([trainNodeId, busNodeId]);
    });
    const snapshot: EvaluationSnapshot = Object.freeze({
      nodes: Object.freeze([
        Object.freeze({ nodeId: nodeIds[0]!, baseStrength: 0.7, wayOfKnowing: "REASONING" }),
        Object.freeze({ nodeId: nodeIds[1]!, baseStrength: 0.6, wayOfKnowing: "REASONING" })
      ]),
      arrows: Object.freeze([]),
      arrowOrder: Object.freeze([]),
      operatorResolutions: Object.freeze([]),
      clusterRecords: Object.freeze([])
    });
    const propagation = evaluate(snapshot);
    const propagationRunId = await new LedgerRepository(database.pool).recordPropagation({
      runId,
      inputHash: "test-layer:s10-input",
      contractHash: "test-layer:s10-contract",
      graphFingerprint: "test-layer:s10-graph",
      arrowOrder: propagation.arrowOrder,
      clusterRecords: propagation.clusterRecords,
      operatorResolutions: propagation.operatorResolutions,
      transmissionReductions: propagation.transmissionReductions,
      liftRecords: propagation.liftRecords,
      judgementSelectionRule: { kind: "TEST_LAYER_NO_PANEL" },
      sensitivityRecords: propagation.sensitivityRecords,
      strengths: propagation.strengths.map((strength) => ({
        ...strength,
        numberKind: "test-layer-strength",
        sourceRef: "test-layer:s10-source",
        producer: "test-layer:propagation",
        replayHandle: "test-layer:s10-replay",
        wayOfKnowing: "REASONING"
      }))
    });
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: propagation.strengths,
      criterionCandidates: [
        { criterionId: "speed", label: "Travel speed", source: "MODEL_PROPOSED", evidenceRefs: ["evidence:speed"] },
        { criterionId: "cost", label: "Travel cost", source: "MODEL_PROPOSED", evidenceRefs: ["evidence:cost"] }
      ],
      actualEvidenceRefs: ["evidence:speed", "evidence:cost"],
      options: [
        { optionId: "train", label: "Train", criteria: { speed: 0.9, cost: 0.2 } },
        { optionId: "bus", label: "Bus", criteria: { speed: 0.4, cost: 0.8 } }
      ],
      weightSource: createWeightSource({ source: "none" })
    });
    const valuation = new ValuationRepository(database.pool);
    const persisted = await valuation.recordOverlay({ runId, propagationRunId, overlay });
    expect(persisted.valueHingeIds).toHaveLength(1);
    const frozen = await valuation.readFrozenPropagation(propagationRunId);
    expect(frozen.strengths).toEqual(propagation.strengths);

    const rows = await database.pool.query<{
      phase: string;
      hinge_count: string;
      reversal_count: string;
      overlay_count: string;
      sensitivity_after: boolean;
      detachment_byte_identical: boolean;
    }>(`
      SELECT
        (SELECT value_json #>> '{}' FROM core.run_progress_event
         WHERE run_id=$1 AND kind='PHASE' ORDER BY at_seq DESC LIMIT 1) AS phase,
        (SELECT count(*)::text FROM core.value_hinge WHERE run_id=$1) AS hinge_count,
        (SELECT count(*)::text FROM core.reversal_point WHERE run_id=$1) AS reversal_count,
        (SELECT count(*)::text FROM ledger.overlay_run WHERE run_id=$1) AS overlay_count,
        (SELECT bool_and(sensitivity.at_seq > propagation.at_seq)
         FROM ledger.sensitivity_record AS sensitivity
         JOIN ledger.propagation_run AS propagation USING (propagation_run_id)
         WHERE propagation.propagation_run_id=$2) AS sensitivity_after,
        (SELECT detachment_byte_identical FROM ledger.overlay_run WHERE overlay_run_id=$3)
          AS detachment_byte_identical
    `, [runId, propagationRunId, persisted.overlayRunId]);
    expect(rows.rows[0]).toEqual({
      phase: "VALUE",
      hinge_count: "1",
      reversal_count: "1",
      overlay_count: "1",
      sensitivity_after: true,
      detachment_byte_identical: true
    });

    await expect(database.pool.query(
      "UPDATE ledger.overlay_run SET detachment_byte_identical=false WHERE overlay_run_id=$1",
      [persisted.overlayRunId]
    )).rejects.toThrow(/rejects UPDATE/);
    await expect(database.pool.query(`
      INSERT INTO core.value_hinge (
        run_id, left_option_id, right_option_id, criterion_ids, reversal_boundary,
        weight_source, weight_owner, weight_vector, at_seq
      ) VALUES ($1,'a','b','[]','{}','none','invented-owner',NULL,ledger.allocate_sequence())
    `, [runId])).rejects.toThrow();
  });
});
