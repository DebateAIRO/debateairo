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

/**
 * Persists one SERVED verdict through the production serve write path. With
 * `supersedes`, it takes DR-184's append path instead: the SAME answer id and
 * work item, one version higher.
 */
async function persistVerdict(
  runId: string,
  answerForm: AnswerForm,
  segmentText: string,
  supersedes?: { readonly answerId: string; readonly workItemId: string }
): Promise<string> {
  const work = new WorkItemRepository(database.pool);
  const workItemId = supersedes?.workItemId ?? await work.enqueue({
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
    // FOLD RECONCILE (FL-1, 2026-09-16). This literal was written on
    // 2026-09-02 against b5a6b6eb, before T9 added `digest`, `loopRounds`,
    // `standingObjection` and `crashClass` to ServeGateResult; without them the
    // merged tree gains one TS2739 here (vitest transpiles without checking, so
    // only `pnpm run typecheck` sees it). The four take the same shape the
    // repo's own pre-T9 fixture uses (tests/support/settledRun.ts:100-107):
    // this answer never ran the synthesis loop, so all four are ABSENT rather
    // than back-filled with a digest or a crash class it never had.
    // `loopRounds: []` is also what keeps the persist path's producer-binding
    // proof out of this test — the carrier, not the loop, is what is on trial.
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
    servedNumber: null,
    ...(supersedes === undefined ? {} : { supersedes: { answerId: supersedes.answerId } })
  });
  // The work item is settled once, on the answer id both versions share.
  if (supersedes === undefined) {
    await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: persisted.answerId });
  }
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
    //    The copy drops the carrier columns so this probe is on the PLAINTEXT
    //    guard alone: since F3 the envelope is sealed under
    //    (answer_id, answer_version), so a copy that keeps them and bumps the
    //    version is refused one trigger earlier, by the attestation guard
    //    (CONTENT_ATTESTATION_INVALID) — that arm is proved in its own case.
    await expect(database.pool.query(
      `INSERT INTO serve.answer
       SELECT (jsonb_populate_record(NULL::serve.answer, to_jsonb(source)
         || jsonb_build_object(
              'answer_version', source.answer_version + 1,
              'answer_form', $2::jsonb,
              'sealed_at_seq', ledger.allocate_sequence(),
              'content_ciphertext', NULL,
              'content_attestation', NULL
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
    // F3: the owner ref carries the version. Here the key is already gone, so
    // the refusal is about the key, not the ref — the ref is written the real
    // way so this line does not become the one place that still says otherwise.
    await expect(cipher.decrypt(runId, "serve.answer", `${answerId}:1`, envelope as never))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }))
      .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    const afterShred = await readStoredAnswer(answerId);
    expect(afterShred.row_text).not.toContain(verdictText);
    expect(afterShred.answer_form).toEqual(CONTENT_JSON_SENTINEL);
    await expect(serve.readAnswerProjection(legacyAnswerId, { ownerRef: null, legacyAskerId }))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: legacyVerdict } });
  }, 120_000);

  // FIX ROUND 1 / F3 (D26 open point (2)). serve.answer is the only VERSIONED
  // carrier — its key is (answer_id, answer_version) and DR-184 appends new
  // versions under the same id. Binding the envelope to the id alone therefore
  // binds it to a SET of rows, not to a row: version n's envelope, copied into
  // version m's row, verifies and is served as version m. Every other carrier
  // is keyed by the id the envelope is bound to, so this table is the whole
  // class. The property: an envelope written for (answer_id, version n) is not
  // readable as any other version of the same answer.
  it("does not serve one version's envelope as another version of the same answer", async () => {
    const marker = randomUUID();
    const firstText = `B21_VERSION_ONE_VERDICT_${marker}`;
    const secondText = `B21_VERSION_TWO_VERDICT_${marker}`;
    const runId = await createEncryptedRun(`b21 versioned question ${marker}`);
    const serve = new ServeRepository(database.pool);

    const answerId = await persistVerdict(
      runId, { kind: "VERDICT", text: firstText }, `b21-v1-segment-${marker}`
    );
    const owner = await database.pool.query<{ work_item_id: string }>(
      `SELECT work_item_id FROM serve.answer WHERE answer_id=$1
       ORDER BY answer_version DESC LIMIT 1`,
      [answerId]
    );
    const superseded = await persistVerdict(
      runId, { kind: "VERDICT", text: secondText }, `b21-v2-segment-${marker}`,
      { answerId, workItemId: owner.rows[0]!.work_item_id }
    );
    expect(superseded).toBe(answerId);
    const versions = await database.pool.query<{ answer_version: number }>(
      "SELECT answer_version FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version",
      [answerId]
    );
    expect(versions.rows.map((row) => Number(row.answer_version))).toEqual([1, 2]);

    // Both versions read back as themselves before anything is tampered with.
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, 1))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: firstText } });
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, 2))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: secondText } });

    // MEASURED, and it is not what the review's recipe assumed: serve.answer
    // cannot be UPDATEd at all. migrations/0000_s00.sql:310 revokes UPDATE and
    // DELETE on it from PUBLIC and debateai_runtime, and :314-332 puts a
    // `reject_mutation` BEFORE UPDATE OR DELETE trigger on it, so an in-place
    // swap of one version's carrier columns for another's raises
    // `append-only or immutable table answer rejects UPDATE` before any guard
    // of ours is consulted. The reachable attack on a versioned carrier is
    // therefore the forged PROMOTION: append a NEW version row that carries an
    // OLDER version's envelope and attestation. That is what must be refused.
    await expect(database.pool.query(
      `UPDATE serve.answer SET content_ciphertext=NULL WHERE answer_id=$1`,
      [answerId]
    )).rejects.toThrow("append-only or immutable table answer rejects UPDATE");

    const promoted = database.pool.query(
      `INSERT INTO serve.answer
       SELECT (jsonb_populate_record(NULL::serve.answer, to_jsonb(source)
         || jsonb_build_object(
              'answer_version', 3,
              'sealed_at_seq', ledger.allocate_sequence()
            ))).*
       FROM serve.answer AS source
       WHERE source.answer_id=$1 AND source.answer_version=1`,
      [answerId]
    );
    await expect(promoted).rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    const stillTwo = await database.pool.query<{ answer_version: number }>(
      "SELECT answer_version FROM serve.answer WHERE answer_id=$1 ORDER BY answer_version",
      [answerId]
    );
    expect(stillTwo.rows.map((row) => Number(row.answer_version))).toEqual([1, 2]);

    // The same binding, one layer lower: the AEAD itself refuses version 1's
    // envelope under any other version's owner ref. The `${id}:${version}`
    // shape is the mechanism — 0063's attestation guard derives the identical
    // string in SQL, so this line and that arm move together or every INSERT
    // fails with CONTENT_ATTESTATION_INVALID.
    const firstEnvelope = (await database.pool.query<{ content_ciphertext: unknown }>(
      "SELECT content_ciphertext FROM serve.answer WHERE answer_id=$1 AND answer_version=1",
      [answerId]
    )).rows[0]!.content_ciphertext;
    await expect(cipher.decrypt(runId, "serve.answer", `${answerId}:1`, firstEnvelope as never))
      .resolves.toMatchObject({ answerForm: { kind: "VERDICT", text: firstText } });
    for (const wrongVersion of [2, 3]) {
      await expect(cipher.decrypt(
        runId, "serve.answer", `${answerId}:${wrongVersion}`, firstEnvelope as never
      )).rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");
    }

    // Both versions still read back as themselves.
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, 1))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: firstText } });
    await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }, 2))
      .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: secondText } });
  }, 120_000);

  // FIX ROUND 1 / F1. This migration must not OWN any function an earlier
  // migration owns: `migrate()` is not the only way these files reach a
  // database — 0038 and 0040 are replayed on their own (the S6 suite of record
  // replays 0040 at tests/integration/s6-content-encryption-database.test.ts:780,
  // and the same replay is legal in production). A `CREATE OR REPLACE` of a
  // function 0038 or 0040 defines is therefore reverted by that migration's own
  // replay, while the triggers this migration created on serve.answer keep
  // firing — the guards vanish and the write path breaks, with no diff to see.
  // The property under test is the one the replay attacks: after ANY earlier
  // owner replays, serve.answer is still BOTH writable through the production
  // path AND guarded at the three layers this migration installed.
  it("keeps serve.answer writable and guarded after 0038 or 0040 is replayed over the applied chain", async () => {
    const directory = new URL("../../migrations/", import.meta.url);
    const serve = new ServeRepository(database.pool);
    for (const earlier of ["0038_content_encryption.sql", "0040_account_erasure.sql"]) {
      const migration = await readFile(new URL(earlier, directory), "utf8");
      // Replayed exactly the way the S6 suite of record replays 0040: the file's
      // own bytes, on the pool that already carries the whole chain.
      await expect(database.pool.query(migration)).resolves.toBeDefined();

      const marker = randomUUID();
      const verdictText = `B21_REPLAY_${earlier.slice(0, 4)}_VERDICT_${marker}`;
      const runId = await createEncryptedRun(`b21 replay ${earlier} ${marker}`);

      // (a) WRITABLE — the production serve write path still lands the row.
      const answerId = await persistVerdict(
        runId, { kind: "VERDICT", text: verdictText }, `b21-replay-segment-${marker}`
      );
      const storedRow = await readStoredAnswer(answerId);
      expect(storedRow.answer_form).toEqual(CONTENT_JSON_SENTINEL);
      expect(storedRow.row_text).not.toContain(verdictText);
      await expect(serve.readAnswerProjection(answerId, { ownerRef, legacyAskerId: null }))
        .resolves.toMatchObject({ answer_form: { kind: "VERDICT", text: verdictText } });

      // (b) GUARDED, plaintext layer — a plaintext answer_form row for an
      //     encrypted run is still refused, and by serve.answer's OWN message.
      await expect(database.pool.query(
        `INSERT INTO serve.answer
         SELECT (jsonb_populate_record(NULL::serve.answer, to_jsonb(source)
           || jsonb_build_object(
                'answer_version', source.answer_version + 1,
                'answer_form', $2::jsonb,
                'sealed_at_seq', ledger.allocate_sequence(),
                'content_ciphertext', NULL,
                'content_attestation', NULL
              ))).*
         FROM serve.answer AS source
         WHERE source.answer_id=$1
         ORDER BY source.answer_version DESC LIMIT 1`,
        [answerId, JSON.stringify({ kind: "VERDICT", text: `b21-replay-plaintext-${marker}` })]
      )).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer");

      // (c) GUARDED, attestation layer — the envelope is still authenticated
      //     against the run secret, so a forged attestation is still refused.
      await expect(database.pool.query(
        `INSERT INTO serve.answer
         SELECT (jsonb_populate_record(NULL::serve.answer, to_jsonb(source)
           || jsonb_build_object(
                'answer_version', source.answer_version + 1,
                'sealed_at_seq', ledger.allocate_sequence(),
                'content_attestation', '\\x' || repeat('5a', 32)
              ))).*
         FROM serve.answer AS source
         WHERE source.answer_id=$1
         ORDER BY source.answer_version DESC LIMIT 1`,
        [answerId]
      )).rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    }
  }, 180_000);
});
