import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek
} from "../../packages/crypto/src/index.js";
import { PostgresAskApplication } from "@debateai/api";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  RunRepository,
  configureContentEncryption,
  encryptAttestedContentForRun,
  migrate
} from "@debateai/db";
import { WorkItemRepository } from "@debateai/battery";
import { reconcileEvaluatorMetering } from "../../packages/evaluator/src/index.js";
import { GraphRepository } from "@debateai/graph";
import { LedgerRepository } from "@debateai/ledger";
import { LivenessRepository } from "@debateai/liveness";
import { MemoryRepository, canonicalizeQuestionText } from "@debateai/memory";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ServeRepository,
  buildFactBundle,
  type ConformanceJudgement,
  type GateTrace,
  type ServeGateResult
} from "@debateai/serve";
import {
  ValuationRepository,
  buildValueOverlay,
  createWeightSource
} from "@debateai/valuation";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createTestAskAdmissionPoolFacades,
  startTestDatabase,
  type TestDatabase
} from "../support/testDatabase.js";

// V-6 (owner ruling 2026-09-22, scope ruled 2026-09-25): the remaining places
// where debate text sat readable become AEAD carriers by 0063's mechanism —
// sentinel + attested envelope on the stored row, decrypted only for the run's
// owner, unrecoverable once the run key is shredded — and the two readable
// neighbours (code-only progress kinds, raw_artifact.metadata_json) may hold
// only their code / number shape for an encrypted run.

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let authSessionId: string;
let cipher: ContentCipher;

const ENVELOPE_KEYS = ["ct", "keyId", "nonce", "tag", "v"];
const CONFORMANCE_SENTINEL = [{ segmentId: CONTENT_CIPHERTEXT_SENTINEL, state: "NOT_SAMPLED", conforms: false }];

/** A run-row copy with a fresh primary key: the envelope must not follow it. */
async function copyWithNewId(table: string, idColumn: string, id: string, extra: Record<string, string> = {}) {
  const overrides = Object.entries({ [idColumn]: "gen_random_uuid()", at_seq: "ledger.allocate_sequence()", ...extra })
    .map(([column, expression]) => `'${column}', ${expression}`).join(", ");
  return database.pool.query(
    `INSERT INTO ${table}
     SELECT (jsonb_populate_record(NULL::${table}, to_jsonb(source) || jsonb_build_object(${overrides}))).*
     FROM ${table} AS source WHERE source.${idColumn}=$1`,
    [id]
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-v6-carriers-"));
  userId = randomUUID();
  ownerRef = randomUUID();
  authSessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x36), `v6-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [authSessionId, userId, `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  cipher = new ContentCipher(new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  }));
  configureContentEncryption(database.pool, cipher);
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

function runInput(
  questionLine: string,
  principal: Parameters<RunRepository["startRun"]>[0]["principal"],
  sessionId: string
): Parameters<RunRepository["startRun"]>[0] {
  return {
    questionLine,
    askContract: { audience: "v6-test" },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-01T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "v6:integration",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "v6:integration" },
    registerVersion: 1,
    batteryVersion: "v6:integration",
    batteryRows: []
  };
}

const createEncryptedRun = (questionLine: string): Promise<string> =>
  new RunRepository(database.pool).startRun(
    runInput(questionLine, { kind: "server", userId, ownerRef }, authSessionId)
  );

const createLegacyRun = (questionLine: string, legacyAskerId: string): Promise<string> =>
  new RunRepository(database.pool).startRun(
    runInput(questionLine, { kind: "legacy", legacyAskerId }, randomUUID())
  );

async function rowText(table: string, where: string, value: string): Promise<string> {
  const result = await database.pool.query<{ body: string | null }>(
    `SELECT string_agg(to_jsonb(row)::text, E'\\n') AS body FROM ${table} AS row WHERE ${where}=$1`,
    [value]
  );
  return result.rows[0]?.body ?? "";
}

/** One SERVED verdict through the production serve write path. */
async function persistVerdict(
  runId: string,
  segmentId: string,
  conforms: boolean
): Promise<string> {
  const work = new WorkItemRepository(database.pool);
  const workItemId = await work.enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `v6:verdict:${runId}`
  });
  const compositionArtifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId: compositionArtifactId,
    attemptId: randomUUID(),
    runId,
    providerRef: "provider:v6-composer",
    provider: "test",
    model: "model/v6-composer",
    maker: "maker:v6-composer",
    modelVersion: "v1",
    rawText: `v6-composition-${runId}`,
    metadata: {},
    parseStatus: "PARSED",
    inputHash: "1".repeat(64),
    contractHash: "2".repeat(64),
    contentHash: "3".repeat(64)
  });
  const factBundle = buildFactBundle({
    facts: [`v6-fact-${runId}`],
    residualObjections: [],
    badges: [],
    conditionMarks: [],
    reversalPoint: `v6-reversal-${runId}`,
    buildsOnPrevious: { value: false, answerRef: null },
    memoryDisclosure: null
  });
  const segments = Object.freeze([{
    segmentId, text: `v6-segment-text-${runId}`, loadBearing: true,
    assertedNodeRefs: [], servedNumberRefs: []
  }]);
  const gateTrace: readonly GateTrace[] = Object.freeze(["GATE4_Q51_PASS", "POST_COMPOSE_R9_PASS", "SERVE"]);
  const conformance: readonly ConformanceJudgement[] = Object.freeze([
    { segmentId, state: "JUDGED", conforms }
  ]);
  const result: ServeGateResult = Object.freeze({
    terminal: "SERVED",
    answerForm: { kind: "VERDICT" as const, text: `v6-verdict-${runId}` },
    factBundle,
    gateTrace,
    conditionMarks: Object.freeze([]),
    conformance,
    coverageMode: "EXHAUSTIVE",
    segments,
    compositionBudget: Object.freeze({
      tier: "low", bound: 1, registerRowKey: "v6:composition-budget",
      registerVersion: 1, sourceRef: "v6:integration"
    }),
    confidenceBand: null,
    bandCeiling: null,
    digest: null,
    loopRounds: Object.freeze([]),
    standingObjection: null,
    crashClass: null,
    projections: Object.freeze({
      reversalPoint: factBundle.reversalPoint,
      buildsOnPrevious: factBundle.buildsOnPrevious,
      memoryDisclosure: factBundle.memoryDisclosure
    })
  });
  const persisted = await new ServeRepository(database.pool).persist({
    runId,
    workItemId,
    factBundleVersion: 1,
    factBundleContentHash: createHash("sha256").update(JSON.stringify(factBundle)).digest("hex"),
    factBundle,
    result,
    segments,
    compositionRawArtifactRef: compositionArtifactId,
    compositionAttempt: 1,
    conformanceRawArtifactRefs: [compositionArtifactId],
    servedNumber: null
  });
  await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: persisted.answerId });
  return persisted.answerId;
}

/** A frozen empirical propagation plus a value overlay, through the production repositories. */
async function recordOverlay(runId: string, owner: string | null): Promise<{
  readonly overlayRunId: string;
  readonly valueHingeIds: readonly string[];
}> {
  const graph = new GraphRepository(database.pool);
  const nodeIds = await graph.withGraphWrite(runId, async (writer) => {
    const common = {
      runId, claimType: "comparative" as const, generationStatus: "complete" as const,
      pathStatus: "active" as const, explorationDecision: "continue" as const,
      provenanceRef: null, wayOfKnowing: "REASONING" as const, locator: null, valueLaden: true
    };
    const first = await writer.addNode({
      ...common, statementText: "v6 train fact", parentNodeId: null, childKind: null, siblingOrdinal: 0
    });
    const second = await writer.addNode({
      ...common, statementText: "v6 bus fact", parentNodeId: first, childKind: "support", siblingOrdinal: 1
    });
    return Object.freeze([first, second]);
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
    inputHash: "v6:input",
    contractHash: "v6:contract",
    graphFingerprint: "v6:graph",
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
      sourceRef: "v6:source",
      producer: "v6:propagation",
      replayHandle: "v6:replay",
      wayOfKnowing: "REASONING" as const
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
    weightSource: owner === null
      ? createWeightSource({ source: "none" })
      : createWeightSource({ source: "owner_elicited", owner, vector: { speed: 0.3, cost: 0.7 } })
  });
  return new ValuationRepository(database.pool).recordOverlay({ runId, propagationRunId, overlay });
}

async function persistAcceptedTerminal(runId: string, marker: string): Promise<void> {
  const terminal = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`v6-accepted-fact-${marker}`], residualObjections: [], badges: [],
      conditionMarks: ["DEFECT"], reversalPoint: `v6-accepted-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null
    }
  });
  await database.pool.query(
    `INSERT INTO scorecard.answer_outcome (
       outcome_attempt_id,answer_id,answer_version,as_of,run_id,model_id,
       model_version,provider,task_class,prior,posterior,basis,resolver_ref,
       resolver_is_external,resolved_outcome,resolved_at,provenance_ref,
       scoreability,accepted,superseded_by_answer_outcome_id,at_seq
     ) VALUES ($1,$2,1,now(),$3,'model:v6-memory','v1','provider:v6-memory',
       'task:v6-memory',0.5,0.7,'v6:memory','resolver:v6-memory',true,true,
       now(),'artifact:v6-memory','PERMANENTLY_UNSCOREABLE',true,NULL,
       ledger.allocate_sequence())`,
    [randomUUID(), terminal.answerId, runId]
  );
}

function memoryKey(runId: string, question: string) {
  return Object.freeze({
    runId,
    canonicalQuestionText: canonicalizeQuestionText(question),
    callerScope: "ASKER" as const,
    askerScope: `owner:${ownerRef}`,
    settlementAct: null,
    questionType: null,
    declaredField: null,
    normalizedBinding: Object.freeze({}),
    frozenTerms: Object.freeze([]),
    frozenQuerySetHash: null,
    asOf: "2026-09-01T00:00:00.000Z",
    policyVersion: 1,
    keyVersion: 1
  });
}

function askApplication(): PostgresAskApplication {
  return new PostgresAskApplication(
    database.pool, {} as never, {} as never, undefined, database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
  );
}

async function drainEvents(runId: string, access: { ownerRef: string | null; legacyAskerId: string | null }) {
  const events: Array<{ event_type: string; payload: Record<string, unknown> }> = [];
  for await (const event of askApplication().events(runId, {} as never, access)) {
    events.push(event as { event_type: string; payload: Record<string, unknown> });
  }
  return events;
}

describe("V-6 — the remaining readable debate text is encrypted for encrypted runs", () => {
  it("serve.conformance_record.segment_results: sentinel + attested envelope, decrypted for the owner, refused in the clear", async () => {
    const marker = randomUUID();
    const segmentId = `V6_CONFORMANCE_SEGMENT_${marker}`;
    const runId = await createEncryptedRun(`v6 conformance ${marker}`);
    const answerId = await persistVerdict(runId, segmentId, false);
    const conformanceRecordId = (await database.pool.query<{ conformance_record_id: string }>(
      "SELECT conformance_record_id FROM serve.answer WHERE answer_id=$1", [answerId]
    )).rows[0]!.conformance_record_id;

    // RED: the encrypted run's conformance row must not carry the segment in the clear.
    expect(await rowText("serve.conformance_record", "conformance_record_id", conformanceRecordId))
      .not.toContain(marker);
    const stored = (await database.pool.query<{
      segment_results: unknown; content_ciphertext: Record<string, unknown> | null; attestation_length: number | null;
    }>(
      `SELECT segment_results, content_ciphertext, octet_length(content_attestation) AS attestation_length
       FROM serve.conformance_record WHERE conformance_record_id=$1`, [conformanceRecordId]
    )).rows[0]!;
    // Fix round 1 / 5a: a sentinel no legitimate plaintext value can equal
    // ('[]' was what an empty judgement list looks like). It satisfies the
    // 0006 shape CHECK, and its one segment conforms=false, so a reader that
    // ever skipped decryption would report FAIL, never PASS.
    expect(stored.segment_results).toEqual(CONFORMANCE_SENTINEL);
    expect(Object.keys(stored.content_ciphertext ?? {}).sort()).toEqual(ENVELOPE_KEYS);
    expect(stored.attestation_length).toBe(32);

    // The owner reads it decrypted: FAIL (an empty sentinel would read as PASS).
    const serve = new ServeRepository(database.pool);
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }))
      .resolves.toMatchObject({ conformance_outcome: "FAIL" });
    await expect(serve.readInspectionProjection(answerId, { ownerRef, legacyAskerId: null }))
      .resolves.toMatchObject({
        conformance: {
          outcome: "FAIL",
          coverage_mode: "EXHAUSTIVE",
          segment_results: [{ segment_id: segmentId, state: "JUDGED", conforms: false }]
        }
      });

    // A direct plaintext write for the encrypted run is refused by the database.
    const composedTextId = (await database.pool.query<{ composed_text_id: string }>(
      "SELECT composed_text_id FROM serve.answer WHERE answer_id=$1", [answerId]
    )).rows[0]!.composed_text_id;
    await expect(database.pool.query(
      `INSERT INTO serve.conformance_record (
         composed_text_id,segment_results,coverage_mode,raw_artifact_refs,sealed_at_seq
       ) VALUES ($1,$2::jsonb,'EXHAUSTIVE','[]'::jsonb,ledger.allocate_sequence())`,
      [composedTextId, JSON.stringify([{ segmentId: `plaintext-${marker}`, state: "JUDGED", conforms: true }])]
    )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.conformance_record");
    // A copied envelope is bound to its own row id.
    await expect(database.pool.query(
      `INSERT INTO serve.conformance_record
       SELECT (jsonb_populate_record(NULL::serve.conformance_record, to_jsonb(source)
         || jsonb_build_object('conformance_record_id', gen_random_uuid(),
              'sealed_at_seq', ledger.allocate_sequence()))).*
       FROM serve.conformance_record AS source WHERE source.conformance_record_id=$1`,
      [conformanceRecordId]
    )).rejects.toThrow("CONTENT_ATTESTATION_INVALID");

    // Legacy runs keep the plaintext contract and NULL carrier columns.
    const legacyAskerId = `legacy-v6-${randomUUID()}`;
    const legacyRunId = await createLegacyRun(`v6 legacy conformance ${marker}`, legacyAskerId);
    const legacyAnswerId = await persistVerdict(legacyRunId, `legacy-${segmentId}`, true);
    const legacy = (await database.pool.query<{ segment_results: unknown; content_ciphertext: unknown }>(
      `SELECT record.segment_results, record.content_ciphertext
       FROM serve.answer AS answer JOIN serve.conformance_record AS record USING (conformance_record_id)
       WHERE answer.answer_id=$1`, [legacyAnswerId]
    )).rows[0]!;
    expect(legacy).toEqual({
      segment_results: [{ segmentId: `legacy-${segmentId}`, state: "JUDGED", conforms: true }],
      content_ciphertext: null
    });
    await expect(serve.readInspectionProjection(legacyAnswerId, { ownerRef: null, legacyAskerId }))
      .resolves.toMatchObject({ conformance: { outcome: "PASS" } });

    // Shredding the run key makes the stored envelope unrecoverable.
    await cipher.destroyRunKey(runId);
    await expect(serve.readInspectionProjection(answerId, { ownerRef, legacyAskerId: null }))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
  }, 180_000);

  it("core.value_hinge / ledger.overlay_run weight_owner: sentinel + attested envelope, decrypted for the owner, refused in the clear", async () => {
    const marker = randomUUID();
    const owner = `V6_WEIGHT_OWNER_${marker}`;
    const runId = await createEncryptedRun(`v6 overlay ${marker}`);
    const persisted = await recordOverlay(runId, owner);
    expect(persisted.valueHingeIds).toHaveLength(1);

    // RED: neither row may carry the owner's name in the clear.
    expect(await rowText("core.value_hinge", "run_id", runId)).not.toContain(marker);
    expect(await rowText("ledger.overlay_run", "run_id", runId)).not.toContain(marker);
    for (const table of ["core.value_hinge", "ledger.overlay_run"]) {
      const stored = (await database.pool.query<{
        weight_owner: string; content_ciphertext: Record<string, unknown> | null; attestation_length: number;
      }>(
        `SELECT weight_owner, content_ciphertext, octet_length(content_attestation) AS attestation_length
         FROM ${table} WHERE run_id=$1`, [runId]
      )).rows[0]!;
      expect(stored.weight_owner).toBe(CONTENT_CIPHERTEXT_SENTINEL);
      expect(Object.keys(stored.content_ciphertext ?? {}).sort()).toEqual(ENVELOPE_KEYS);
      expect(stored.attestation_length).toBe(32);
    }
    const overlayEnvelope = (await database.pool.query<{ content_ciphertext: never }>(
      "SELECT content_ciphertext FROM ledger.overlay_run WHERE overlay_run_id=$1", [persisted.overlayRunId]
    )).rows[0]!.content_ciphertext;
    await expect(cipher.decrypt(runId, "ledger.overlay_run", persisted.overlayRunId, overlayEnvelope))
      .resolves.toEqual({ weightOwner: owner });

    // The owner's answer projection names the weight owner in the clear.
    const answerId = await persistVerdict(runId, `v6-overlay-segment-${marker}`, true);
    await expect(new ServeRepository(database.pool).readAnswerProjection(
      answerId, { ownerRef, legacyAskerId: null }
    )).resolves.toMatchObject({
      value_hinges: [{ weight_source: "owner_elicited", weight_owner: owner }]
    });

    // A direct plaintext write is refused.
    await expect(database.pool.query(
      `INSERT INTO core.value_hinge (
         run_id, left_option_id, right_option_id, criterion_ids, reversal_boundary,
         weight_source, weight_owner, weight_vector, at_seq
       ) VALUES ($1,'train','bus','[]','{}','owner_elicited',$2,'{"speed":1}',ledger.allocate_sequence())`,
      [runId, `plaintext-owner-${marker}`]
    )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.value_hinge");

    // Fix round 1 / 5b: a copied envelope is bound to its own row id.
    await expect(copyWithNewId("core.value_hinge", "value_hinge_id", persisted.valueHingeIds[0]!))
      .rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    await expect(copyWithNewId("ledger.overlay_run", "overlay_run_id", persisted.overlayRunId))
      .rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    // A legacy-style row may not carry the sentinel either.
    const legacySentinelRunId = await createLegacyRun(`v6 sentinel ${marker}`, `legacy-v6-${randomUUID()}`);
    await expect(database.pool.query(
      `INSERT INTO core.value_hinge (
         run_id, left_option_id, right_option_id, criterion_ids, reversal_boundary,
         weight_source, weight_owner, weight_vector, at_seq
       ) VALUES ($1,'train','bus','[]','{}','owner_elicited',$2,'{"speed":1}',ledger.allocate_sequence())`,
      [legacySentinelRunId, CONTENT_CIPHERTEXT_SENTINEL]
    )).rejects.toThrow("CONTENT_ENCRYPTION_STATE_INVALID: core.value_hinge");

    // weight_source 'none' carries no owner and no envelope, encrypted run or not.
    const unownedRunId = await createEncryptedRun(`v6 overlay none ${marker}`);
    await recordOverlay(unownedRunId, null);
    expect((await database.pool.query(
      "SELECT weight_owner, content_ciphertext FROM ledger.overlay_run WHERE run_id=$1", [unownedRunId]
    )).rows).toEqual([{ weight_owner: null, content_ciphertext: null }]);

    // A legacy run keeps the owner in the clear, with NULL carrier columns.
    const legacyRunId = await createLegacyRun(`v6 legacy overlay ${marker}`, `legacy-v6-${randomUUID()}`);
    await recordOverlay(legacyRunId, `legacy-${owner}`);
    expect((await database.pool.query(
      "SELECT weight_owner, content_ciphertext FROM core.value_hinge WHERE run_id=$1", [legacyRunId]
    )).rows).toEqual([{ weight_owner: `legacy-${owner}`, content_ciphertext: null }]);
  }, 180_000);

  it("core.run_progress_event: the investigation gap is encrypted with a readable gap_ref, streams decrypted, and no other kind can carry prose", async () => {
    const marker = randomUUID();
    const runId = await createEncryptedRun(`v6 progress ${marker}`);
    const gap = {
      gap_ref: `gap:v6:${marker}`,
      gap: `V6_GAP_PROSE_${marker} the private gap`,
      verdict: "UNDER-EXPLORED",
      why: `V6_WHY_${marker} because it was left open`,
      effort_grade: "bounded",
      constructed_prompt: `V6_PROMPT_${marker} investigate the private gap`,
      accepts_user_input: true,
      model_authored: true
    };

    // RED: a plaintext gap event for an encrypted run is refused.
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
       VALUES ($1,ledger.allocate_sequence(),'honesty.investigation_gap_opened',$2::jsonb)`,
      [runId, JSON.stringify(gap)]
    )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.run_progress_event");

    // The production writer stores sentinel + envelope, and gap_ref stays readable.
    const runs = new RunRepository(database.pool);
    await runs.recordInvestigationGapOpened({ runId, gap });
    const progressRows = await rowText("core.run_progress_event", "run_id", runId);
    for (const forbidden of ["V6_GAP_PROSE_", "V6_WHY_", "V6_PROMPT_"]) {
      expect(progressRows).not.toContain(forbidden);
    }
    const stored = (await database.pool.query<{
      event_id: string; value_json: unknown; gap_ref: string; content_ciphertext: Record<string, unknown>; attestation_length: number;
    }>(
      `SELECT event_id, value_json, value_json->>'gap_ref' AS gap_ref, content_ciphertext,
              octet_length(content_attestation) AS attestation_length
       FROM core.run_progress_event WHERE run_id=$1 AND kind='honesty.investigation_gap_opened'`, [runId]
    )).rows[0]!;
    expect(stored.value_json).toEqual({ gap_ref: gap.gap_ref, ciphertext: true, v: 1 });
    expect(stored.gap_ref).toBe(gap.gap_ref);
    expect(Object.keys(stored.content_ciphertext).sort()).toEqual(ENVELOPE_KEYS);
    expect(stored.attestation_length).toBe(32);
    for (const forbidden of [gap.gap, gap.why, gap.constructed_prompt]) {
      expect(JSON.stringify(stored)).not.toContain(forbidden);
    }

    // The live stream the UI reads shows the decrypted gap, and the code-only
    // events the in-database run start wrote still display.
    const events = await drainEvents(runId, { ownerRef, legacyAskerId: null });
    expect(events.find((event) => event.event_type === "honesty.investigation_gap_opened"))
      .toMatchObject({ payload: gap });
    expect(events.find((event) => event.event_type === "run.running")).toMatchObject({
      payload: { phase: "EMPIRICAL" }
    });
    await expect(runs.readCurrentState(runId)).resolves.toBeDefined();

    // No other kind may carry prose for an encrypted run.
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
       VALUES ($1,ledger.allocate_sequence(),'PHASE',$2::jsonb)`,
      [runId, JSON.stringify(`the private conclusion ${marker}`)]
    )).rejects.toThrow("PROGRESS_EVENT_VALUE_NOT_CODE_SHAPED: PHASE");
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
       VALUES ($1,ledger.allocate_sequence(),'ENVELOPE_CONSUMED','"seven"'::jsonb)`,
      [runId]
    )).rejects.toThrow("PROGRESS_EVENT_VALUE_NOT_CODE_SHAPED: ENVELOPE_CONSUMED");
    await expect(runs.recordRunLifecycleEvent({
      runId,
      kind: "node.retrying",
      value: {
        state: "COOLDOWN_HOLD", call_site_key: "JUDGE:review:node:1", parent_node_ref: null,
        hold_ms: 10, hold_until: null, attempts_spent: 1, transport_outcome: "TIMED_OUT",
        planned_leg_count: 1, note: "a sentence the model wrote"
      } as never
    })).rejects.toThrow("PROGRESS_EVENT_VALUE_NOT_CODE_SHAPED: node.retrying");
    // A copied gap envelope is bound to its own event id.
    await expect(database.pool.query(
      `INSERT INTO core.run_progress_event
       SELECT (jsonb_populate_record(NULL::core.run_progress_event, to_jsonb(source)
         || jsonb_build_object('event_id', gen_random_uuid(), 'at_seq', ledger.allocate_sequence()))).*
       FROM core.run_progress_event AS source WHERE source.event_id=$1`,
      [stored.event_id]
    )).rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    // The code-shaped writers keep working.
    await runs.recordRunLifecycleEvent({
      runId,
      kind: "node.retrying",
      value: {
        state: "COOLDOWN_HOLD", call_site_key: "JUDGE", parent_node_ref: null,
        hold_ms: 10, hold_until: new Date("2026-09-01T00:00:00.000Z").toISOString(), attempts_spent: 1,
        transport_outcome: "TIMED_OUT", planned_leg_count: 1
      }
    });
    await expect(runs.countCooldownHolds(runId)).resolves.toBe(1);

    // Legacy runs keep the plaintext contract.
    const legacyAskerId = `legacy-v6-${randomUUID()}`;
    const legacyRunId = await createLegacyRun(`v6 legacy progress ${marker}`, legacyAskerId);
    await runs.recordInvestigationGapOpened({ runId: legacyRunId, gap });
    expect((await database.pool.query(
      `SELECT value_json, content_ciphertext FROM core.run_progress_event
       WHERE run_id=$1 AND kind='honesty.investigation_gap_opened'`, [legacyRunId]
    )).rows).toEqual([{ value_json: gap, content_ciphertext: null }]);
    expect((await drainEvents(legacyRunId, { ownerRef: null, legacyAskerId }))
      .find((event) => event.event_type === "honesty.investigation_gap_opened"))
      .toMatchObject({ payload: gap });
  }, 180_000);

  it("memory.alias_row surface/canonical: encrypted under the SOURCE run's key, refused in the clear", async () => {
    const marker = randomUUID();
    const question = `Should the v6 city build a tram ${marker}?`;
    const memory = new MemoryRepository(database.pool);
    const priorRunId = await createEncryptedRun(question);
    await memory.recordQuestionAndMatch({
      key: memoryKey(priorRunId, question), decidedBy: "v6:matcher",
      ownership: { ownerRef, legacyAskerId: null }
    });
    await persistAcceptedTerminal(priorRunId, `v6-alias-prior-${marker}`);
    const sourceRunId = await createEncryptedRun(question);
    const alias = { surface: `V6_SURFACE_${marker}`, canonical: `V6_CANONICAL_${marker}`, confirmedBy: "owner:v6" };
    const disclosure = await memory.recordQuestionAndMatch({
      key: memoryKey(sourceRunId, question), decidedBy: "v6:matcher",
      confirmedAliases: [alias],
      ownership: { ownerRef, legacyAskerId: null }
    });
    expect(disclosure).toMatchObject({ matched: true });

    // RED: the alias row must not carry the surface or canonical form in the clear.
    expect(await rowText("memory.alias_row", "source_run_id", sourceRunId)).not.toContain(marker);
    const stored = (await database.pool.query<{
      alias_row_id: string; surface: string; canonical: string; content_ciphertext: never; attestation_length: number;
    }>(
      `SELECT alias_row_id, surface, canonical, content_ciphertext,
              octet_length(content_attestation) AS attestation_length
       FROM memory.alias_row WHERE source_run_id=$1`, [sourceRunId]
    )).rows[0]!;
    expect(stored.surface).toBe(CONTENT_CIPHERTEXT_SENTINEL);
    expect(stored.canonical).toBe(CONTENT_CIPHERTEXT_SENTINEL);
    expect(stored.attestation_length).toBe(32);
    await expect(cipher.decrypt(sourceRunId, "memory.alias_row", stored.alias_row_id, stored.content_ciphertext))
      .resolves.toEqual({ surface: alias.surface, canonical: alias.canonical });

    await expect(database.pool.query(
      `INSERT INTO memory.alias_row (
         surface, canonical, confirmed_by, confirmed_at, source_run_id, prior_run_id, key_version, at_seq
       ) VALUES ($1,$2,'owner:v6',clock_timestamp(),$3,$4,1,ledger.allocate_sequence())`,
      [`plaintext-surface-${marker}`, `plaintext-canonical-${marker}`, sourceRunId, priorRunId]
    )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory.alias_row");
    // Fix round 1 / 5b: a copied envelope is bound to its own row id.
    await expect(copyWithNewId("memory.alias_row", "alias_row_id", stored.alias_row_id))
      .rejects.toThrow("CONTENT_ATTESTATION_INVALID");

    // The SOURCE run's key protects it: shredding it makes the alias unreadable.
    await cipher.destroyRunKey(sourceRunId);
    await expect(cipher.decrypt(sourceRunId, "memory.alias_row", stored.alias_row_id, stored.content_ciphertext))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
  }, 180_000);

  it("ledger.raw_artifact.metadata_json stays readable for metering but holds only its code / number shape for an encrypted run", async () => {
    const marker = randomUUID();
    const runId = await createEncryptedRun(`v6 metadata ${marker}`);
    const ledger = new LedgerRepository(database.pool);
    const artifact = (metadata: Record<string, unknown>) => ({
      artifactId: randomUUID(),
      attemptId: randomUUID(),
      runId,
      providerRef: "provider:v6-metadata",
      provider: "openai-compatible-http",
      model: "model:v6-metadata",
      maker: "maker:v6-metadata",
      modelVersion: "v1",
      rawText: `v6 raw ${marker}`,
      metadata,
      parseStatus: "PARSED" as const,
      inputHash: "4".repeat(64),
      contractHash: "5".repeat(64),
      contentHash: "6".repeat(64)
    });

    // RED: prose in the metadata of an encrypted run is refused.
    await expect(ledger.appendRawArtifact(artifact({
      status: 200, attempt: 1, usage: null, finish_reason: "stop", token_ceiling: 100,
      note: `the private conclusion ${marker}`
    }))).rejects.toThrow("RAW_ARTIFACT_METADATA_NOT_CODE_SHAPED");
    await expect(ledger.appendRawArtifact(artifact({
      status: 200, attempt: 1, usage: null, finish_reason: `the private conclusion ${marker}`, token_ceiling: 100
    }))).rejects.toThrow("RAW_ARTIFACT_METADATA_NOT_CODE_SHAPED");

    // The provider gateway's real shape is accepted, and metering still reads it.
    const real = artifact({
      status: 200,
      attempt: 1,
      prompt_tripwires: [{ signal: "PROMPT_FENCE_ECHOED", contractId: "runner.author.v1", field: null, hits: 1 }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      finish_reason: "stop",
      token_ceiling: 1024
    });
    await ledger.appendRawArtifact(real);
    await database.pool.query(
      `INSERT INTO ledger.ledger_entry (
         sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
         stance_at_action, outcome, actor_ref, input_hash, contract_hash,
         raw_artifact_ref, started_at, finished_at
       ) VALUES (
         ledger.allocate_sequence(),$1,$2,'MODEL_CALL','runner.v6-metadata.v1','subject:v6',
         'UNASSIGNED','OK','provider:v6-metadata','input','contract',$3,$4,$5
       )`,
      [runId, real.attemptId, real.artifactId,
        new Date("2026-09-01T08:00:00.000Z"), new Date("2026-09-01T08:00:01.000Z")]
    );
    await reconcileEvaluatorMetering(database.pool, {
      windowStart: new Date("2026-09-01T00:00:00.000Z"),
      windowEnd: new Date("2026-09-02T00:00:00.000Z"),
      asOf: new Date("2026-09-02T00:00:01.000Z")
    });
    expect((await database.pool.query(
      `SELECT prompt_tokens::integer, completion_tokens::integer, total_tokens::integer
       FROM evaluator.model_call_usage WHERE raw_artifact_id=$1`, [real.artifactId]
    )).rows).toEqual([{ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }]);

    // A legacy run is not constrained.
    const legacyRunId = await createLegacyRun(`v6 legacy metadata ${marker}`, `legacy-v6-${randomUUID()}`);
    await expect(ledger.appendRawArtifact({ ...artifact({ fixture: "legacy free text" }), runId: legacyRunId }))
      .resolves.toBeDefined();
  }, 180_000);

  it("refuses object- and array-smuggled prose in every code-only progress kind and in artifact metadata (closed allow-lists)", async () => {
    const runId = await createEncryptedRun(`v6 smuggling ${randomUUID()}`);
    // Real subjects of THIS run: the pinned refs must name them.
    await recordOverlay(runId, null);
    const nodeId = (await database.pool.query<{ node_id: string }>(
      "SELECT node_id::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq LIMIT 1", [runId]
    )).rows[0]!.node_id;
    const answerId = await persistVerdict(runId, `v6-smuggling-segment-${randomUUID()}`, true);
    const objectProse = { w1: "The", w2: "verdict", w3: "is", w4: "guilty" };
    const arrayProse = ["the", "defendant", "lied"];
    const cooldown = {
      state: "COOLDOWN_HOLD", call_site_key: `JUDGE:review:${nodeId}`, parent_node_ref: nodeId,
      hold_ms: 10, hold_until: new Date("2026-09-01T00:00:10.000Z").toISOString(), attempts_spent: 1,
      transport_outcome: "TIMED_OUT", planned_leg_count: 1
    };
    const refusal = {
      state: "SYNTHESIS_ROLE_PROVIDER_ABSENT", call_site_key: "SYNTHESIZER:provider:x",
      role_ref: "provider:x", role: "SYNTHESIZER", absent_failure_code: "PROVIDER_PROBE_FAILED"
    };
    const staleness = {
      trigger_key: "test-layer:q58",
      affected_subjects: [{ kind: "NODE", ref: nodeId }, { kind: "ANSWER", ref: answerId }]
    };
    const smuggled: Array<readonly [string, unknown]> = [
      ["PHASE", objectProse], ["PHASE", arrayProse], ["PHASE", "UNDECLARED_PHASE"],
      ["ENVELOPE_STATE", objectProse], ["ENVELOPE_STATE", arrayProse],
      ["TERMINAL", objectProse], ["TERMINAL", arrayProse], ["TERMINAL", { state: "SETTLED" }],
      ["ENVELOPE_CONSUMED", objectProse], ["ENVELOPE_CONSUMED", arrayProse],
      ["node.retrying", { ...cooldown, state: arrayProse }],
      ["node.retrying", { ...cooldown, call_site_key: objectProse }],
      ["node.retrying", { ...cooldown, hold_ms: objectProse }],
      ["node.retrying", { ...cooldown, extra: "x" }],
      ["node.retrying", refusal],
      ["ledger.could_not_do", { ...refusal, role: arrayProse }],
      ["ledger.could_not_do", { ...refusal, absent_failure_code: objectProse }],
      ["ledger.could_not_do", { ...cooldown, transport_outcome: "the defendant" }],
      ["honesty.staleness_trigger_fired", { ...staleness, trigger_key: objectProse }],
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [{ kind: arrayProse, ref: "x" }] }],
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [{ kind: "NODE", ref: "x", ...objectProse }] }],
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [] }],
      ["honesty.staleness_trigger_fired", { ...staleness, w1: "The" }],
      // Final round: one word per element / per field is refused too. Every
      // free-looking field is pinned to the exact format its writer emits.
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [
        { kind: "NODE", ref: "The" }, { kind: "NODE", ref: "verdict" }, { kind: "NODE", ref: "is" }
      ] }],
      ["node.retrying", { ...cooldown, parent_node_ref: "defendant" }],
      ["node.retrying", { ...cooldown, hold_until: "the-defendant-lied" }],
      ["node.retrying", { ...cooldown, hold_until: "2026-09-01" }],
      ["node.retrying", { ...cooldown, call_site_key: "JUDGE:the:defendant:lied" }],
      ["node.retrying", { ...cooldown, call_site_key: "verdict" }],
      ["node.retrying", { ...cooldown, call_site_key: "JUDGE:review:guilty" }],
      ["ledger.could_not_do", { ...refusal, call_site_key: "SYNTHESIZER:the-defendant" }],
      ["ledger.could_not_do", { ...refusal, absent_failure_code: "the-defendant-lied" }]
    ];
    for (const [kind, value] of smuggled) {
      await expect(database.pool.query(
        `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
         VALUES ($1,ledger.allocate_sequence(),$2,$3::jsonb)`,
        [runId, kind, JSON.stringify(value)]
      ), `${kind} ${JSON.stringify(value)}`).rejects.toThrow(`PROGRESS_EVENT_VALUE_NOT_CODE_SHAPED: ${kind}`);
    }
    // A well-formed id that is not a subject of this run is refused as well.
    for (const [kind, value] of [
      ["node.retrying", { ...cooldown, parent_node_ref: randomUUID() }],
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [{ kind: "NODE", ref: randomUUID() }] }],
      ["honesty.staleness_trigger_fired", { ...staleness, affected_subjects: [{ kind: "ANSWER", ref: nodeId }] }]
    ] as const) {
      await expect(database.pool.query(
        `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
         VALUES ($1,ledger.allocate_sequence(),$2,$3::jsonb)`,
        [runId, kind, JSON.stringify(value)]
      ), `${kind} ${JSON.stringify(value)}`).rejects.toThrow(`PROGRESS_EVENT_SUBJECT_UNRESOLVED: ${kind}`);
    }
    // Every legitimate shape still lands — every call-site family the runner's
    // hold path emits (apps/runner/src/index.ts: JUDGE primary, the root and
    // expansion legs, cross-root, the review and the catch-up review).
    const families = [
      "JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:critic:root0:r1:p0",
      "JUDGE:defender:root1:r2:p3", "JUDGE:cross-root:0->1", `JUDGE:review:${nodeId}`,
      `JUDGE:review:catch-up:${randomUUID()}:${nodeId}`
    ];
    for (const [kind, value] of [
      ["PHASE", "VALUE"], ["ENVELOPE_STATE", "EXHAUSTED"], ["ENVELOPE_STATE", "ENRICHMENT_SKIPPED"],
      ["ENVELOPE_CONSUMED", 7], ["node.retrying", cooldown], ["ledger.could_not_do", cooldown],
      ["ledger.could_not_do", { ...cooldown, parent_node_ref: null, hold_until: null }],
      ["ledger.could_not_do", refusal], ["ledger.could_not_do", { ...refusal, absent_failure_code: null }],
      // TERMINAL "SERVED" already landed through ServeRepository.persist above
      // (one TERMINAL per run is a unique index).
      ["honesty.staleness_trigger_fired", staleness],
      ...families.map((callSiteKey) => ["node.retrying", { ...cooldown, call_site_key: callSiteKey }] as const)
    ] as const) {
      await database.pool.query(
        `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
         VALUES ($1,ledger.allocate_sequence(),$2,$3::jsonb)`,
        [runId, kind, JSON.stringify(value)]
      );
    }

    const ledger = new LedgerRepository(database.pool);
    const base = {
      status: 200, attempt: 1, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      finish_reason: "stop", token_ceiling: 64
    };
    const tripwire = { signal: "PROMPT_FENCE_ECHOED", contractId: "runner.author.v1", field: null, hits: 1 };
    for (const metadata of [
      { ...base, status: arrayProse },
      { ...base, attempt: objectProse },
      { ...base, usage: objectProse },
      { ...base, usage: { prompt_tokens: 1, w1: 2 } },
      { ...base, finish_reason: objectProse },
      { ...base, token_ceiling: arrayProse },
      { ...base, prompt_tripwires: [{ ...tripwire, ...objectProse }] },
      { ...base, prompt_tripwires: [{ ...tripwire, signal: "THE_DEFENDANT" }] },
      { ...base, prompt_tripwires: [{ ...tripwire, field: arrayProse }] },
      { ...base, prompt_tripwires: objectProse }
    ]) {
      await expect(ledger.appendRawArtifact({
        artifactId: randomUUID(), attemptId: randomUUID(), runId, providerRef: "provider:v6",
        provider: "openai-compatible-http", model: "model:v6", maker: "maker:v6", modelVersion: "v1",
        rawText: "v6 raw", metadata, parseStatus: "PARSED",
        inputHash: "4".repeat(64), contractHash: "5".repeat(64), contentHash: "6".repeat(64)
      }), JSON.stringify(metadata)).rejects.toThrow("RAW_ARTIFACT_METADATA_NOT_CODE_SHAPED");
    }
  }, 180_000);

  it("the erasure barrier refuses every carrier's sealed write once the run's private content is erased; code-only progress keeps flowing", async () => {
    const marker = randomUUID();
    const runId = await createEncryptedRun(`v6 erasure ${marker}`);
    const priorRunId = await createEncryptedRun(`v6 erasure prior ${marker}`);
    const overlay = await recordOverlay(runId, `V6_ERASURE_OWNER_${marker}`);
    const answerId = await persistVerdict(runId, `V6_ERASURE_SEGMENT_${marker}`, true);
    const { composed_text_id: composedTextId } = (await database.pool.query<{ composed_text_id: string }>(
      "SELECT composed_text_id FROM serve.answer WHERE answer_id=$1", [answerId]
    )).rows[0]!;
    const { propagation_run_id: propagationRunId } = (await database.pool.query<{ propagation_run_id: string }>(
      "SELECT propagation_run_id FROM ledger.overlay_run WHERE overlay_run_id=$1", [overlay.overlayRunId]
    )).rows[0]!;
    // Every envelope is sealed while the run is still live, to a fresh row id.
    const seal = async (carrier: Parameters<typeof encryptAttestedContentForRun>[2], value: unknown) => {
      const id = randomUUID();
      const sealed = (await encryptAttestedContentForRun(database.pool, runId, carrier, id, value))!;
      return { id, envelope: JSON.stringify(sealed.envelope), attestation: sealed.attestation };
    };
    const conformance = await seal("serve.conformance_record", { segmentResults: [] });
    const hinge = await seal("core.value_hinge", { weightOwner: "x" });
    const overlayRow = await seal("ledger.overlay_run", { weightOwner: "x" });
    const gap = await seal("core.run_progress_event", { value: { gap_ref: `gap:${marker}` } });
    const alias = await seal("memory.alias_row", { surface: "s", canonical: "c" });

    // Erase: the run's key cleanup intent makes core.run_private_content_is_live false.
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (
         request_ref,user_id,run_id,requested_at,cleanup_publication_refs
       ) VALUES ($1,$2,$3,now(),'{}')`,
      [randomUUID(), userId, runId]
    );
    const attempts: Array<readonly [string, () => Promise<unknown>]> = [
      ["serve.conformance_record", () => database.pool.query(
        `INSERT INTO serve.conformance_record (
           conformance_record_id,composed_text_id,segment_results,coverage_mode,raw_artifact_refs,
           sealed_at_seq,content_ciphertext,content_attestation
         ) VALUES ($1,$2,$3::jsonb,'EXHAUSTIVE','[]',ledger.allocate_sequence(),$4::jsonb,$5)`,
        [conformance.id, composedTextId, JSON.stringify(CONFORMANCE_SENTINEL), conformance.envelope, conformance.attestation]
      )],
      ["core.value_hinge", () => database.pool.query(
        `INSERT INTO core.value_hinge (
           value_hinge_id,run_id,left_option_id,right_option_id,criterion_ids,reversal_boundary,
           weight_source,weight_owner,weight_vector,at_seq,content_ciphertext,content_attestation
         ) VALUES ($1,$2,'train','bus','[]','{}','owner_elicited',$3,'{"speed":1}',
           ledger.allocate_sequence(),$4::jsonb,$5)`,
        [hinge.id, runId, CONTENT_CIPHERTEXT_SENTINEL, hinge.envelope, hinge.attestation]
      )],
      ["ledger.overlay_run", () => database.pool.query(
        `INSERT INTO ledger.overlay_run (
           overlay_run_id,run_id,propagation_run_id,weight_source,weight_owner,weight_vector,
           accepted_criteria,rejected_criteria,pareto_option_ids,recorded_arrow_order,
           recorded_strengths,detached_strengths,detachment_byte_identical,at_seq,
           content_ciphertext,content_attestation
         ) SELECT $1,run_id,propagation_run_id,weight_source,$2,weight_vector,accepted_criteria,
           rejected_criteria,pareto_option_ids,recorded_arrow_order,recorded_strengths,
           detached_strengths,true,ledger.allocate_sequence(),$3::jsonb,$4
         FROM ledger.overlay_run WHERE overlay_run_id=$5`,
        [overlayRow.id, CONTENT_CIPHERTEXT_SENTINEL, overlayRow.envelope, overlayRow.attestation, overlay.overlayRunId]
      )],
      ["core.run_progress_event", () => database.pool.query(
        `INSERT INTO core.run_progress_event (
           event_id,run_id,at_seq,kind,value_json,content_ciphertext,content_attestation
         ) VALUES ($1,$2,ledger.allocate_sequence(),'honesty.investigation_gap_opened',$3::jsonb,$4::jsonb,$5)`,
        [gap.id, runId, JSON.stringify({ gap_ref: `gap:${marker}`, ciphertext: true, v: 1 }), gap.envelope, gap.attestation]
      )],
      ["memory.alias_row", () => database.pool.query(
        `INSERT INTO memory.alias_row (
           alias_row_id,surface,canonical,confirmed_by,confirmed_at,source_run_id,prior_run_id,
           key_version,at_seq,content_ciphertext,content_attestation
         ) VALUES ($1,$2,$2,'owner:v6',clock_timestamp(),$3,$4,1,ledger.allocate_sequence(),$5::jsonb,$6)`,
        [alias.id, CONTENT_CIPHERTEXT_SENTINEL, runId, priorRunId, alias.envelope, alias.attestation]
      )]
    ];
    expect(propagationRunId).toBeDefined();
    for (const [carrier, attempt] of attempts) {
      await expect(attempt(), carrier).rejects.toThrow("PRIVATE_CONTENT_ERASED");
    }
    // Bookkeeping is not private content: a code-only event still lands.
    await database.pool.query(
      `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
       VALUES ($1,ledger.allocate_sequence(),'ENVELOPE_CONSUMED','5'::jsonb)`,
      [runId]
    );
  }, 180_000);

  it("maps an odd vendor model version to one deterministic token before the liveness sweep writes it", async () => {
    const marker = randomUUID();
    const runId = await createEncryptedRun(`v6 liveness ${marker}`);
    await persistVerdict(runId, `v6-liveness-segment-${marker}`, true);
    const ledger = new LedgerRepository(database.pool);
    for (const modelVersion of ["2026-09-01", "gpt 5 (preview build, see notes)"]) {
      await ledger.appendRawArtifact({
        artifactId: randomUUID(), attemptId: randomUUID(), runId, providerRef: "provider:v6-liveness",
        provider: "openai-compatible-http", model: "model:v6", maker: "maker:v6", modelVersion,
        rawText: "v6 raw", metadata: {}, parseStatus: "PARSED",
        inputHash: "4".repeat(64), contractHash: "5".repeat(64), contentHash: "6".repeat(64)
      });
    }
    const liveness = new LivenessRepository(database.pool);
    await liveness.detectProviderModelVersionTriggers();
    await liveness.detectProviderModelVersionTriggers();
    const fired = (await database.pool.query<{ trigger_key: string }>(
      `SELECT DISTINCT trigger_key FROM core.revision_trigger WHERE run_id=$1`, [runId]
    )).rows.map((row) => row.trigger_key);
    expect(fired).toEqual([
      `provider-model-version:provider:v6-liveness:sha256:${createHash("sha256")
        .update("gpt 5 (preview build, see notes)").digest("hex")}`
    ]);
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM core.run_progress_event
       WHERE run_id=$1 AND kind='honesty.staleness_trigger_fired'`, [runId]
    )).rows[0]!.count).toBe("1");
  }, 180_000);

  it("stays guarded after 0038, 0040, 0063 or 0069 itself is replayed over the applied chain", async () => {
    const directory = new URL("../../migrations/", import.meta.url);
    for (const replayed of [
      "0038_content_encryption.sql",
      "0040_account_erasure.sql",
      "0063_serve_answer_content_carrier.sql",
      "0069_remaining_content_carriers.sql"
    ]) {
      await expect(database.pool.query(await readFile(new URL(replayed, directory), "utf8")))
        .resolves.toBeDefined();
      const marker = randomUUID();
      const runId = await createEncryptedRun(`v6 replay ${replayed} ${marker}`);
      await expect(database.pool.query(
        `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
         VALUES ($1,ledger.allocate_sequence(),'honesty.investigation_gap_opened',$2::jsonb)`,
        [runId, JSON.stringify({ gap_ref: `gap:${marker}`, gap: "prose" })]
      )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.run_progress_event");
      const answerId = await persistVerdict(runId, `V6_REPLAY_${marker}`, true);
      expect(await rowText(
        "serve.conformance_record", "composed_text_id",
        (await database.pool.query<{ composed_text_id: string }>(
          "SELECT composed_text_id FROM serve.answer WHERE answer_id=$1", [answerId]
        )).rows[0]!.composed_text_id
      )).not.toContain(marker);
    }
    for (const table of [
      "serve.conformance_record", "core.value_hinge", "ledger.overlay_run",
      "core.run_progress_event", "memory.alias_row"
    ]) {
      const triggers = await database.pool.query<{ tgname: string; function_name: string }>(
        `SELECT trigger.tgname, trigger.tgfoid::regproc::text AS function_name
         FROM pg_trigger AS trigger
         WHERE trigger.tgrelid=$1::regclass AND NOT trigger.tgisinternal
           AND trigger.tgname IN ('aaa_enforce_content_attestation_v2','enforce_content_ciphertext','enforce_erasure_barrier')
         ORDER BY trigger.tgname`,
        [table]
      );
      expect(triggers.rows).toEqual([
        { tgname: "aaa_enforce_content_attestation_v2", function_name: "core.enforce_content_attestation_v2_remaining_carriers" },
        { tgname: "enforce_content_ciphertext", function_name: "core.enforce_content_ciphertext_remaining_carriers" },
        { tgname: "enforce_erasure_barrier", function_name: "core.enforce_erasure_barrier_remaining_carriers" }
      ]);
    }
  }, 240_000);
});
