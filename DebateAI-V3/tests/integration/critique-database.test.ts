import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInitialBatteryRows } from "@debateai/battery";
import { RunRepository, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import {
  CritiqueRepository,
  buildBlindedCritiquePacket,
  computeIndependenceReceipt,
  computeSymmetryDiff,
  deriveObjectionRecords,
  planBlindVerification,
  readDeploymentMakerCapability
} from "../../packages/critique/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

async function createRunAndNode(label: string): Promise<{ runId: string; nodeId: string }> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: label, askerId: `asker:${label}`, sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-08-08T00:00:00Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, agentCount: 1, strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "s08",
    batteryRows: createInitialBatteryRows({ settlementWatchHandle: `watch:${label}` })
  });
  const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, (writer) => writer.addNode({
    runId, statementText: "CROSS test claim", claimType: "empirical", parentNodeId: null,
    childKind: null, siblingOrdinal: 0, generationStatus: "complete", pathStatus: "active",
    explorationDecision: "continue", provenanceRef: null, wayOfKnowing: "LOOKED_UP",
    locator: "https://test.invalid/cross", valueLaden: false
  }));
  return { runId, nodeId };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});

afterAll(async () => database?.stop());

describe("S08 A-06 raw PostgreSQL carriers", () => {
  it("records the casual trigger basis, blinded packet, receipt, symmetry diff, and objection ledger", async () => {
    const { runId, nodeId } = await createRunAndNode("s08-carriers");
    await database.pool.query(`
      INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
      VALUES (1, 'configuredProviderSet', $1::jsonb, 'fixture:s08-provider-register')
      ON CONFLICT (register_version, row_key) DO UPDATE SET value_json=EXCLUDED.value_json, source_ref=EXCLUDED.source_ref
    `, [JSON.stringify({
      kind: "CONFIGURED_PROVIDER_SET", requiredDistinctMakers: 2,
      providers: [
        { providerRef: "provider:a", adapterKind: "openai-compatible-http", maker: "maker:a" },
        { providerRef: "provider:b", adapterKind: "vllm-openai-compatible-http", maker: "maker:b" }
      ]
    })]);
    await expect(readDeploymentMakerCapability(database.pool, 1)).resolves.toMatchObject({
      deploymentMakerCapability: true,
      configuredMakers: ["maker:a", "maker:b"]
    });

    const sequence = await database.pool.query<{ snapshot_at_seq: string }>(
      "SELECT (next_sequence - 1)::text AS snapshot_at_seq FROM ledger.sequence_allocator WHERE singleton=true"
    );
    const plan = planBlindVerification({
      riskTier: "casual",
      nodeId,
      snapshot: {
        records: [{ removedNodeId: nodeId, leverage: 0.42 }],
        triggerNodeIds: [nodeId],
        snapshotAtSequence: Number(sequence.rows[0]!.snapshot_at_seq),
        engineVersion: "propagation:s08-test"
      }
    });
    const critique = new CritiqueRepository(database.pool);
    await critique.recordVerificationTriggerBasis({ runId, basis: plan.basis! });

    const ledger = new LedgerRepository(database.pool);
    for (const action of [
      { subjectItemId: "item:for", stanceAtAction: "SUPPORTS" as const },
      { subjectItemId: "item:against", stanceAtAction: "ATTACKS" as const }
    ]) {
      await ledger.append({
        runId, actionKind: "MODEL_CALL", callSiteKey: "critique.fixture", ...action,
        outcome: "OK", actorRef: "gateway:test-layer", inputHash: `input:${action.subjectItemId}`,
        contractHash: "contract:s08", startedAt: new Date("2026-08-08T00:00:00Z"),
        finishedAt: new Date("2026-08-08T00:00:01Z")
      });
    }
    await ledger.append({
      runId, actionKind: "UNKNOWN_PRE_ITEM_FIXTURE", callSiteKey: "pre-item:fixture",
      subjectItemId: "pre:item", stanceAtAction: "UNASSIGNED", outcome: "FAILED",
      actorRef: "machine:test-layer", inputHash: "input:pre-item", contractHash: "contract:s08",
      startedAt: new Date("2026-08-08T00:00:00Z"), finishedAt: new Date("2026-08-08T00:00:01Z")
    });
    const actions = await critique.readSymmetryActions(runId);
    const diff = computeSymmetryDiff({
      items: [
        { itemId: "item:for", stance: "SUPPORTS" },
        { itemId: "item:against", stance: "ATTACKS" }
      ],
      actions
    });
    expect(diff).toMatchObject({
      status: "UNINSTRUMENTED",
      fairnessClaimWithheld: true,
      bandCapRequired: true
    });
    expect(diff.census.every((row) => row.actionKind === "MODEL_CALL")).toBe(true);
    await critique.recordSymmetryDiff({ runId, diff });

    const packet = buildBlindedCritiquePacket({
      runId, sourceArtifactRef: randomUUID(), sourceContent: "Test-layer source content.",
      producerIdentity: "agent:must-not-persist", producerMaker: "maker:a", criticMaker: "maker:b",
      researchContextHash: "research-context:s08", critiqueContextHash: "critique-context:s08"
    });
    const critiquePacketRef = await critique.recordCritiquePacket(packet);
    const packetRow = await database.pool.query<{ at_seq: string }>(
      "SELECT at_seq::text FROM core.critique_packet WHERE critique_packet_id=$1", [critiquePacketRef]
    );
    const criticEntry = await ledger.append({
      runId, actionKind: "MODEL_CALL", callSiteKey: "critique.independent", subjectItemId: nodeId,
      stanceAtAction: "NEUTRAL", outcome: "OK", actorRef: "provider:b", inputHash: packet.packetFingerprint,
      contractHash: "contract:critic", startedAt: new Date("2026-08-08T00:00:02Z"),
      finishedAt: new Date("2026-08-08T00:00:03Z")
    });
    const receipt = computeIndependenceReceipt({
      producerMaker: "maker:a", criticMaker: "maker:b",
      researchContextHash: packet.researchContextHash, critiqueContextHash: packet.critiqueContextHash,
      packetFingerprint: packet.packetFingerprint, packetAtSequence: Number(packetRow.rows[0]!.at_seq),
      criticLedgerEntryRef: criticEntry.ledgerEntryId, criticAtSequence: criticEntry.sequence
    });
    await critique.recordIndependenceReceipt({
      runId, critiquePacketRef, producerMaker: "maker:a", criticMaker: "maker:b", receipt
    });
    const objections = deriveObjectionRecords({
      existing: [{ objectionRef: "objection:standing", status: "OPEN" }], criticObjections: []
    });
    await critique.recordObjections({ runId, records: objections.records });
    await expect(critique.readResidualObjections(runId)).resolves.toEqual(["objection:standing"]);

    const carriers = await database.pool.query<{ table_name: string; rows: string }>(`
      SELECT 'critique_packet' AS table_name, count(*)::text AS rows FROM core.critique_packet WHERE run_id=$1
      UNION ALL SELECT 'independence_receipt', count(*)::text FROM core.independence_receipt WHERE run_id=$1
      UNION ALL SELECT 'objection_record', count(*)::text FROM core.objection_record WHERE run_id=$1
      UNION ALL SELECT 'symmetry_diff', count(*)::text FROM core.symmetry_diff WHERE run_id=$1
      UNION ALL SELECT 'verification_trigger_basis', count(*)::text FROM core.verification_trigger_basis WHERE run_id=$1
      ORDER BY table_name
    `, [runId]);
    expect(carriers.rows).toEqual([
      { table_name: "critique_packet", rows: "1" },
      { table_name: "independence_receipt", rows: "1" },
      { table_name: "objection_record", rows: "1" },
      { table_name: "symmetry_diff", rows: "1" },
      { table_name: "verification_trigger_basis", rows: "1" }
    ]);
    const basis = await database.pool.query(
      "SELECT triggered, leverage_snapshot, snapshot_at_seq::text FROM core.verification_trigger_basis WHERE run_id=$1",
      [runId]
    );
    expect(basis.rows[0]).toMatchObject({ triggered: true, leverage_snapshot: [{ removedNodeId: nodeId, leverage: 0.42 }] });
  });

  it("rejects shared contexts, dishonest symmetry rows, and mutation through raw SQL", async () => {
    const { runId } = await createRunAndNode("s08-raw-ddl");
    await expect(database.pool.query(`
      INSERT INTO core.critique_packet (
        run_id, source_artifact_ref, packet_fingerprint, critic_maker, blinding_applied,
        research_context_hash, critique_context_hash, at_seq
      ) VALUES ($1,'artifact:test',$2,'maker:b','IDENTITY_STRIPPED','same','same',ledger.allocate_sequence())
    `, [runId, "f".repeat(64)])).rejects.toThrow();
    await expect(database.pool.query(`
      INSERT INTO core.symmetry_diff (
        run_id, status, missing_kinds, remediation_targets, blocked_not_lazy, census,
        fairness_claim_withheld, band_cap_required, at_seq
      ) VALUES ($1,'SYMMETRIC','[]','[{"itemId":"hidden-gap"}]','[]','[]',false,false,ledger.allocate_sequence())
    `, [runId])).rejects.toThrow();
    const critique = new CritiqueRepository(database.pool);
    const diffRef = await critique.recordSymmetryDiff({ runId, diff: computeSymmetryDiff({ items: [], actions: [] }) });
    await expect(database.pool.query(
      "UPDATE core.symmetry_diff SET status='SYMMETRIC' WHERE symmetry_diff_id=$1", [diffRef]
    )).rejects.toThrow();
  });
});
