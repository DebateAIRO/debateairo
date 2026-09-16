import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
import {
  CONTENT_JSON_SENTINEL,
  RunRepository,
  configureContentEncryption,
  migrate
} from "@debateai/db";
import { WorkItemRepository } from "@debateai/battery";
import { LedgerRepository } from "@debateai/ledger";
import {
  ServeRepository,
  buildFactBundle,
  type AnswerForm,
  type ConformanceJudgement,
  type GateTrace,
  type ServeGateResult
} from "@debateai/serve";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// L5-F2 (security hardening, B21): an encrypted run's final verdict text lives
// in serve.answer.answer_form. This proves it is an AEAD carrier like
// serve.fact_bundle / serve.composed_text: sentinel + envelope on the stored
// row, decrypted only through the projection, unrecoverable after the run key
// is shredded, while legacy plaintext rows keep reading exactly as before.

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let authSessionId: string;
let cipher: ContentCipher;

async function createActiveUser(): Promise<void> {
  userId = randomUUID();
  ownerRef = randomUUID();
  authSessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x73), `b21-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [authSessionId,userId,`sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
}

function runInput(
  questionLine: string,
  principal: Parameters<RunRepository["startRun"]>[0]["principal"],
  sessionId: string
): Parameters<RunRepository["startRun"]>[0] {
  return {
    questionLine,
    askContract: { audience: "b21-test" },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-01T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "b21:integration",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "b21:integration" },
    registerVersion: 1,
    batteryVersion: "b21:integration",
    batteryRows: []
  };
}

async function createEncryptedRun(questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun(
    runInput(questionLine, { kind: "server", userId, ownerRef }, authSessionId)
  );
}

async function createLegacyRun(questionLine: string, legacyAskerId: string): Promise<string> {
  return new RunRepository(database.pool).startRun(
    runInput(questionLine, { kind: "legacy", legacyAskerId }, randomUUID())
  );
}

/** Persists one SERVED verdict through the production serve write path. */
async function persistVerdict(runId: string, answerForm: AnswerForm, segmentText: string): Promise<string> {
  const work = new WorkItemRepository(database.pool);
  const workItemId = await work.enqueue({
    runId,
    batteryRowId: "Q1",
    nodeSet: [],
    commandKey: `b21:verdict:${runId}`
  });
  const compositionArtifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId: compositionArtifactId,
    attemptId: randomUUID(),
    runId,
    providerRef: "provider:b21-composer",
    provider: "test",
    model: "model/b21-composer",
    maker: "maker:b21-composer",
    modelVersion: "v1",
    rawText: `b21-composition-${runId}`,
    metadata: {},
    parseStatus: "PARSED",
    inputHash: "1".repeat(64),
    contractHash: "2".repeat(64),
    contentHash: "3".repeat(64)
  });
  const factBundle = buildFactBundle({
    facts: [`b21-fact-${runId}`],
    residualObjections: [],
    badges: [],
    conditionMarks: [],
    reversalPoint: `b21-reversal-${runId}`,
    buildsOnPrevious: { value: false, answerRef: null },
    memoryDisclosure: null
  });
  const segments = Object.freeze([{
    segmentId: `segment-${runId}`,
    text: segmentText,
    loadBearing: true,
    assertedNodeRefs: [],
    servedNumberRefs: []
  }]);
  const gateTrace: readonly GateTrace[] = Object.freeze(["GATE4_Q51_PASS", "POST_COMPOSE_R9_PASS", "SERVE"]);
  const conformance: readonly ConformanceJudgement[] = Object.freeze([
    { segmentId: segments[0]!.segmentId, state: "JUDGED", conforms: true }
  ]);
  const result: ServeGateResult = Object.freeze({
    terminal: "SERVED",
    answerForm,
    factBundle,
    gateTrace,
    conditionMarks: Object.freeze([]),
    conformance,
    coverageMode: "EXHAUSTIVE",
    segments,
    compositionBudget: Object.freeze({
      tier: "low",
      bound: 1,
      registerRowKey: "b21:composition-budget",
      registerVersion: 1,
      sourceRef: "b21:integration"
    }),
    confidenceBand: null,
    bandCeiling: null,
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

interface StoredAnswerRow {
  readonly row_text: string;
  readonly answer_form: unknown;
}

async function readStoredAnswer(answerId: string): Promise<StoredAnswerRow> {
  const stored = await database.pool.query<StoredAnswerRow>(
    `SELECT to_jsonb(answer)::text AS row_text, answer.answer_form
     FROM serve.answer AS answer
     WHERE answer.answer_id=$1
     ORDER BY answer.answer_version DESC LIMIT 1`,
    [answerId]
  );
  expect(stored.rows).toHaveLength(1);
  return stored.rows[0]!;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-b21-serve-answer-"));
  await createActiveUser();
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const keys = new FileRunContentKeyStore(
    secretRoot,
    users,
    async (candidate) => {
      const result = await database.pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
        [candidate]
      );
      const resolved = result.rows[0]?.user_id;
      if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return resolved;
    }
  );
  cipher = new ContentCipher(keys);
  configureContentEncryption(database.pool, cipher);
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("serve.answer verdict text is an encrypted content carrier (L5-F2)", () => {
  it("applies the (provisionally numbered) serve.answer carrier migration replay-safely", async () => {
    const directory = new URL("../../migrations/", import.meta.url);
    const names = (await readdir(directory))
      .filter((name) => /^\d+_serve_answer_content_carrier\.sql$/.test(name));
    expect(names).toHaveLength(1);
    const migration = await readFile(new URL(names[0]!, directory), "utf8");
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    const triggers = await database.pool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid='serve.answer'::regclass AND NOT tgisinternal ORDER BY tgname`
    );
    // Other guards may already sit on serve.answer; the three carrier triggers must.
    expect(triggers.rows.map((row) => row.tgname)).toEqual(expect.arrayContaining([
      "aaa_enforce_content_attestation_v2", "enforce_content_ciphertext", "enforce_erasure_barrier"
    ]));
  });

  it("stores only sentinel + envelope for an encrypted run, decrypts through the projection, and shreds with the run key while a legacy row stays readable", async () => {
    const marker = randomUUID();
    const verdictText = `B21_DISTINCTIVE_VERDICT_${marker} the private conclusion`;
    const segmentText = `b21-segment-${marker}`;
    const runId = await createEncryptedRun(`b21 encrypted question ${marker}`);
    const answerId = await persistVerdict(runId, { kind: "VERDICT", text: verdictText }, segmentText);

    // 1. The stored row never carries the verdict in plaintext.
    const storedRow = await readStoredAnswer(answerId);
    expect(storedRow.row_text).not.toContain(verdictText);
    expect(storedRow.row_text).not.toContain("B21_DISTINCTIVE_VERDICT");
    expect(storedRow.answer_form).toEqual(CONTENT_JSON_SENTINEL);

    // 2. The row carries the 0038/0040-shaped envelope and attestation.
    const carrier = await database.pool.query<{
      content_ciphertext: Record<string, unknown> | null;
      attestation_length: number | null;
    }>(
      `SELECT content_ciphertext, octet_length(content_attestation) AS attestation_length
       FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`,
      [answerId]
    );
    const envelope = carrier.rows[0]!.content_ciphertext;
    expect(envelope).toMatchObject({ v: 1 });
    expect(Object.keys(envelope ?? {}).sort()).toEqual(["ct", "keyId", "nonce", "tag", "v"]);
    expect(JSON.stringify(envelope)).not.toContain(verdictText);
    expect(carrier.rows[0]!.attestation_length).toBe(32);

    // 3. The projection is the only reader and returns the decrypted form.
    const serve = new ServeRepository(database.pool);
    const projection = await serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null });
    expect(projection).toMatchObject({
      answer_id: answerId,
      run_ref: runId,
      terminal: "SERVED",
      answer_form: { kind: "VERDICT", text: verdictText }
    });
    // The runner's supersede path reads through the same projection.
    await expect(serve.readReviewCatchUpSource(runId)).resolves.toMatchObject({
      answerId,
      answer: { answer_form: { kind: "VERDICT", text: verdictText } }
    });

    // 4. A direct plaintext write for an encrypted run is refused by the DB guard.
    await expect(database.pool.query(
      `INSERT INTO serve.answer
       SELECT (jsonb_populate_record(NULL::serve.answer, to_jsonb(source)
         || jsonb_build_object(
              'answer_version', source.answer_version + 1,
              'answer_form', $2::jsonb,
              'sealed_at_seq', ledger.allocate_sequence()
            ))).*
       FROM serve.answer AS source
       WHERE source.answer_id=$1
       ORDER BY source.answer_version DESC LIMIT 1`,
      [answerId, JSON.stringify({ kind: "VERDICT", text: `b21-plaintext-mutation-${marker}` })]
    )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer");

    // 5. Legacy (default-off) runs keep the explicit plaintext contract: the
    //    verdict is stored as before and the carrier columns stay NULL.
    const legacyMarker = randomUUID();
    const legacyVerdict = `B21_LEGACY_VERDICT_${legacyMarker}`;
    const legacyAskerId = `legacy-b21-${randomUUID()}`;
    const legacyRunId = await createLegacyRun(`b21 legacy question ${legacyMarker}`, legacyAskerId);
    const legacyAnswerId = await persistVerdict(
      legacyRunId, { kind: "VERDICT", text: legacyVerdict }, `b21-legacy-segment-${legacyMarker}`
    );
    const legacyRow = await readStoredAnswer(legacyAnswerId);
    expect(legacyRow.answer_form).toEqual({ kind: "VERDICT", text: legacyVerdict });
    const legacyCarrier = await database.pool.query<{
      content_ciphertext: unknown;
      content_attestation: Buffer | null;
    }>(
      `SELECT content_ciphertext, content_attestation
       FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`,
      [legacyAnswerId]
    );
    expect(legacyCarrier.rows[0]).toEqual({ content_ciphertext: null, content_attestation: null });
    await expect(serve.readAnswerProjection(legacyAnswerId, { ownerRef: null, legacyAskerId }))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: legacyVerdict } });

    // 6. Shred the run key: the stored envelope is unrecoverable and the
    //    projection fails closed, while the legacy row is still readable.
    await cipher.destroyRunKey(runId);
    await expect(cipher.decrypt(runId, "serve.answer", answerId, envelope as never))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    const afterShred = await readStoredAnswer(answerId);
    expect(afterShred.row_text).not.toContain(verdictText);
    expect(afterShred.answer_form).toEqual(CONTENT_JSON_SENTINEL);
    await expect(serve.readAnswerProjection(legacyAnswerId, { ownerRef: null, legacyAskerId }))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: legacyVerdict } });
  }, 120_000);
});
