import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  decryptContentForRun,
  encryptAttestedContentForRun,
  type CryptoEnvelope
} from "@debateai/db";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

// Model scorecard, migration 0072 (spec 2026-09-26 §2.1–§2.4, ruling R8): the
// per-call facts are real columns; the prompt of every attempt is a content
// carrier in 0063's mechanism — sealed and attested for an encrypted run,
// unreadable once the run key is shredded, refused once the run's private
// content is erased — and the role assignment pinned on a run is insert-once.

let fixture: ContentRunFixture;
const db = () => fixture.database.pool;

const ENVELOPE_KEYS = ["ct", "keyId", "nonce", "tag", "v"];
const FINGERPRINT = "0123456789abcdef".repeat(4);
const DEBATE_ROLE_VALUES = [
  "POSITION", "SUPPORT_ATTACK", "CROSS_EXCHANGE", "JUDGE",
  "REVIEWER", "ANSWER_WRITER", "ANSWER_CHECKER"
] as const;

beforeAll(async () => {
  fixture = await startContentRunFixture("model-scorecard-0072");
}, 180_000);

afterAll(async () => {
  await fixture?.stop();
});

type LedgerFacts = Readonly<{
  model_role?: string;
  candidate_id?: string;
  scorecard_version?: number;
  thinking_level?: string;
}>;

function insertLedgerRow(runId: string, facts: LedgerFacts, actionKind = "MODEL_CALL") {
  const at = new Date("2026-09-26T08:00:00.000Z");
  return db().query(
    `INSERT INTO ledger.ledger_entry (
       sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
       stance_at_action, outcome, actor_ref, input_hash, contract_hash, started_at, finished_at,
       model_role, candidate_id, scorecard_version, thinking_level
     ) VALUES (
       ledger.allocate_sequence(),$1,$2,$3,'JUDGE','subject:0072','UNASSIGNED','OK',
       'provider:0072','input:0072','contract:0072',$4,$4,$5,$6,$7,$8
     )`,
    [runId, randomUUID(), actionKind, at, facts.model_role ?? null, facts.candidate_id ?? null,
      facts.scorecard_version ?? null, facts.thinking_level ?? null]
  );
}

type SealedPrompt = Readonly<{ attemptId: string; envelope: string; attestation: Buffer }>;

async function sealPrompt(runId: string, promptText: string, attemptId = randomUUID()): Promise<SealedPrompt> {
  const sealed = await encryptAttestedContentForRun(
    db(), runId, "ledger.call_prompt", attemptId, { promptText, promptFingerprint: FINGERPRINT }
  );
  if (sealed === null) throw new Error("an encrypted run produced no envelope");
  return { attemptId, envelope: JSON.stringify(sealed.envelope), attestation: sealed.attestation };
}

function insertPromptRow(row: Readonly<{
  attemptId: string;
  runId: string;
  fingerprint: string | null;
  text: string;
  envelope: string | null;
  attestation: Buffer | null;
}>) {
  return db().query(
    `INSERT INTO ledger.call_prompt (
       attempt_id, run_id, prompt_fingerprint, prompt_text, content_ciphertext, content_attestation
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [row.attemptId, row.runId, row.fingerprint, row.text, row.envelope, row.attestation]
  );
}

async function promptRowText(attemptId: string): Promise<string> {
  const result = await db().query<{ body: string }>(
    "SELECT to_jsonb(row)::text AS body FROM ledger.call_prompt AS row WHERE attempt_id=$1",
    [attemptId]
  );
  return result.rows[0]?.body ?? "";
}

describe("0072 — the per-call facts are real, nullable columns", () => {
  it("adds model_role, candidate_id, scorecard_version, thinking_level, thinking_tokens and attempt_id", async () => {
    const columns = await db().query<{
      table_name: string; column_name: string; data_type: string; is_nullable: string;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema='ledger' AND (table_name || '.' || column_name) = ANY($1::text[])
       ORDER BY table_name, column_name`,
      [[
        "ledger_entry.model_role", "ledger_entry.candidate_id", "ledger_entry.scorecard_version",
        "ledger_entry.thinking_level", "raw_artifact.thinking_tokens", "model_spend.attempt_id"
      ]]
    );
    expect(columns.rows).toEqual([
      { table_name: "ledger_entry", column_name: "candidate_id", data_type: "text", is_nullable: "YES" },
      { table_name: "ledger_entry", column_name: "model_role", data_type: "text", is_nullable: "YES" },
      { table_name: "ledger_entry", column_name: "scorecard_version", data_type: "integer", is_nullable: "YES" },
      { table_name: "ledger_entry", column_name: "thinking_level", data_type: "text", is_nullable: "YES" },
      { table_name: "model_spend", column_name: "attempt_id", data_type: "uuid", is_nullable: "YES" },
      { table_name: "raw_artifact", column_name: "thinking_tokens", data_type: "integer", is_nullable: "YES" }
    ]);
  });

  it("accepts each of the seven debate roles on a MODEL_CALL row and refuses every other shape", async () => {
    const runId = await fixture.createLegacyRun(`0072 roles ${randomUUID()}`);
    for (const role of DEBATE_ROLE_VALUES) {
      await expect(insertLedgerRow(runId, {
        model_role: role, candidate_id: "google/gemini-3.1-pro@high", scorecard_version: 3, thinking_level: "high"
      }), role).resolves.toBeDefined();
    }
    await expect(insertLedgerRow(runId, { thinking_level: "DEFAULT_ONLY" })).resolves.toBeDefined();
    await expect(insertLedgerRow(runId, {})).resolves.toBeDefined();
    await expect(insertLedgerRow(runId, { model_role: "COMPOSER" }))
      .rejects.toThrow(/ledger_entry_model_role_vocabulary/u);
    await expect(insertLedgerRow(runId, { candidate_id: "two words" }))
      .rejects.toThrow(/ledger_entry_candidate_id_token/u);
    await expect(insertLedgerRow(runId, { scorecard_version: 0 }))
      .rejects.toThrow(/ledger_entry_scorecard_version_positive/u);
    await expect(insertLedgerRow(runId, { thinking_level: "High effort" }))
      .rejects.toThrow(/ledger_entry_thinking_level_token/u);
    // The four facts describe a model call; no other ledger action carries them.
    await expect(insertLedgerRow(runId, { model_role: "JUDGE" }, "PROPAGATION"))
      .rejects.toThrow(/ledger_entry_model_call_facts_scope/u);
    await expect(insertLedgerRow(runId, {}, "PROPAGATION")).resolves.toBeDefined();
  });

  it("accepts exactly the scorecard's thinking-level tokens, no more and no fewer (Task A2 review)", async () => {
    const runId = await fixture.createLegacyRun(`0072 levels ${randomUUID()}`);
    // packages/scorecard/src/schema.ts's rule; the contract suite pins the two texts equal.
    const scorecardRule = /^(?:[a-z][a-z0-9_-]{0,31}|DEFAULT_ONLY)$/u;
    for (const level of [
      "a", "high", "x-high", "low_1", "default_only", `a${"b".repeat(31)}`, "DEFAULT_ONLY",
      "", "High", "1high", "-high", "_high", `a${"b".repeat(32)}`, "DEFAULT_ONLY ", " high",
      "high\n", "DEFAULT", "DEFAULT_ONLYx", "hi gh", "hé", "high.1"
    ]) {
      const stored = insertLedgerRow(runId, { thinking_level: level });
      if (scorecardRule.test(level)) await expect(stored, JSON.stringify(level)).resolves.toBeDefined();
      else await expect(stored, JSON.stringify(level)).rejects.toThrow(/ledger_entry_thinking_level_token/u);
    }
  });

  it("stores thinking tokens on the artifact and the attempt link on the charge", async () => {
    const runId = await fixture.createLegacyRun(`0072 counters ${randomUUID()}`);
    const artifact = (thinkingTokens: number) => db().query(
      `INSERT INTO ledger.raw_artifact (
         raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id, maker,
         model_version, raw_text, metadata_json, parse_status, parse_error, input_hash,
         contract_hash, content_hash, at_seq, input_hash_version, content_hash_version, thinking_tokens
       ) VALUES ($1,$2,$3,'provider:0072','openai-compatible-http','model:0072','maker:0072','v1',
         'raw 0072','{}'::jsonb,'PARSED',NULL,$4,$5,$6,ledger.allocate_sequence(),1,1,$7)
       RETURNING thinking_tokens`,
      [randomUUID(), randomUUID(), runId, "1".repeat(64), "2".repeat(64), "3".repeat(64), thinkingTokens]
    );
    expect((await artifact(1_234)).rows).toEqual([{ thinking_tokens: 1_234 }]);
    await expect(artifact(-1)).rejects.toThrow(/raw_artifact_thinking_tokens_non_negative/u);

    const attemptId = randomUUID();
    const spend = await db().query<{ attempt_id: string }>(
      `INSERT INTO ledger.model_spend (
         spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros,
         input_tokens, output_tokens, attempt_id
       ) VALUES ($1,'RUN',$2,'provider:0072',current_date,1,1,1,$3)
       RETURNING attempt_id::text`,
      [randomUUID(), runId, attemptId]
    );
    expect(spend.rows).toEqual([{ attempt_id: attemptId }]);
  });
});

describe("0072 — ledger.call_prompt is a content carrier", () => {
  it("an encrypted run stores the sentinel and an attested envelope; the owner's key opens it; the clear is refused", async () => {
    const marker = randomUUID();
    const runId = await fixture.createEncryptedRun(`0072 prompt ${marker}`);
    const sealed = await sealPrompt(runId, `private prompt ${marker}`);
    await insertPromptRow({
      attemptId: sealed.attemptId, runId, fingerprint: null, text: CONTENT_CIPHERTEXT_SENTINEL,
      envelope: sealed.envelope, attestation: sealed.attestation
    });
    const stored = (await db().query<{
      prompt_text: string; prompt_fingerprint: string | null;
      content_ciphertext: CryptoEnvelope; attestation_length: number;
    }>(
      `SELECT prompt_text, prompt_fingerprint, content_ciphertext,
              octet_length(content_attestation) AS attestation_length
       FROM ledger.call_prompt WHERE attempt_id=$1`, [sealed.attemptId]
    )).rows[0]!;
    expect(stored.prompt_text).toBe(CONTENT_CIPHERTEXT_SENTINEL);
    expect(stored.prompt_fingerprint).toBeNull();
    expect(Object.keys(stored.content_ciphertext).sort()).toEqual(ENVELOPE_KEYS);
    expect(stored.attestation_length).toBe(32);
    expect(await promptRowText(sealed.attemptId)).not.toContain(marker);
    expect(await promptRowText(sealed.attemptId)).not.toContain(FINGERPRINT);
    await expect(decryptContentForRun<Readonly<{ promptText: string; promptFingerprint: string }>>(
      db(), runId, "ledger.call_prompt", sealed.attemptId, stored.content_ciphertext,
      { promptText: "", promptFingerprint: "" }
    )).resolves.toEqual({ promptText: `private prompt ${marker}`, promptFingerprint: FINGERPRINT });

    // The clear, for an encrypted run, is refused by the database.
    await expect(insertPromptRow({
      attemptId: randomUUID(), runId, fingerprint: FINGERPRINT, text: `plaintext ${marker}`,
      envelope: null, attestation: null
    })).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.call_prompt");
    // A readable fingerprint beside a valid envelope is refused too: it is a
    // digest of private content (the locator 0040 removed from input_hash).
    const second = await sealPrompt(runId, `second ${marker}`);
    await expect(insertPromptRow({
      attemptId: second.attemptId, runId, fingerprint: FINGERPRINT, text: CONTENT_CIPHERTEXT_SENTINEL,
      envelope: second.envelope, attestation: second.attestation
    })).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.call_prompt");
    // An envelope is bound to its own attempt id.
    await expect(insertPromptRow({
      attemptId: randomUUID(), runId, fingerprint: null, text: CONTENT_CIPHERTEXT_SENTINEL,
      envelope: sealed.envelope, attestation: sealed.attestation
    })).rejects.toThrow("CONTENT_ATTESTATION_INVALID");
    // Append-only.
    await expect(db().query("UPDATE ledger.call_prompt SET prompt_text=prompt_text WHERE attempt_id=$1", [sealed.attemptId]))
      .rejects.toThrow(/rejects UPDATE/u);
    await expect(db().query("DELETE FROM ledger.call_prompt WHERE attempt_id=$1", [sealed.attemptId]))
      .rejects.toThrow(/rejects DELETE/u);
    await expect(db().query("TRUNCATE ledger.call_prompt")).rejects.toThrow(/TRUNCATE_REJECTED/u);
  }, 180_000);

  it("a legacy run keeps its prompt and fingerprint in the clear and may carry no envelope", async () => {
    const runId = await fixture.createLegacyRun(`0072 legacy prompt ${randomUUID()}`);
    const attemptId = randomUUID();
    await insertPromptRow({
      attemptId, runId, fingerprint: FINGERPRINT, text: "legacy prompt", envelope: null, attestation: null
    });
    expect((await db().query(
      "SELECT prompt_text, prompt_fingerprint, content_ciphertext FROM ledger.call_prompt WHERE attempt_id=$1",
      [attemptId]
    )).rows).toEqual([{ prompt_text: "legacy prompt", prompt_fingerprint: FINGERPRINT, content_ciphertext: null }]);
    for (const invalid of [
      { fingerprint: null, text: "no fingerprint", envelope: null },
      { fingerprint: FINGERPRINT, text: CONTENT_CIPHERTEXT_SENTINEL, envelope: null },
      { fingerprint: FINGERPRINT, text: "with an envelope", envelope: JSON.stringify({ v: 1, keyId: "k", nonce: "n", ct: "c", tag: "t" }) }
    ]) {
      await expect(insertPromptRow({ attemptId: randomUUID(), runId, attestation: null, ...invalid }))
        .rejects.toThrow("CONTENT_ENCRYPTION_STATE_INVALID: ledger.call_prompt");
    }
    await expect(insertPromptRow({
      attemptId: randomUUID(), runId, fingerprint: "not-hex", text: "bad fingerprint", envelope: null, attestation: null
    })).rejects.toThrow(/call_prompt_fingerprint_shape/u);
    await expect(insertPromptRow({
      attemptId: randomUUID(), runId, fingerprint: FINGERPRINT, text: "", envelope: null, attestation: null
    })).rejects.toThrow(/call_prompt_text_present/u);
  });

  it("is destroyed with the debate: a shredded key leaves only ciphertext, and an erased run takes no new prompt", async () => {
    const marker = randomUUID();
    const runId = await fixture.createEncryptedRun(`0072 shred ${marker}`);
    const sealed = await sealPrompt(runId, `shredded prompt ${marker}`);
    await insertPromptRow({
      attemptId: sealed.attemptId, runId, fingerprint: null, text: CONTENT_CIPHERTEXT_SENTINEL,
      envelope: sealed.envelope, attestation: sealed.attestation
    });
    await fixture.cipher.destroyRunKey(runId);
    const stored = (await db().query<{ content_ciphertext: CryptoEnvelope }>(
      "SELECT content_ciphertext FROM ledger.call_prompt WHERE attempt_id=$1", [sealed.attemptId]
    )).rows[0]!;
    await expect(decryptContentForRun(
      db(), runId, "ledger.call_prompt", sealed.attemptId, stored.content_ciphertext, null
    )).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    expect(await promptRowText(sealed.attemptId)).not.toContain(marker);

    // The erasure barrier (0040's, attached by 0072) refuses a sealed write
    // once the run's private content is erased.
    const erasedRunId = await fixture.createEncryptedRun(`0072 erased ${marker}`);
    const late = await sealPrompt(erasedRunId, `late prompt ${marker}`);
    await fixture.eraseRunContent(erasedRunId);
    await expect(insertPromptRow({
      attemptId: late.attemptId, runId: erasedRunId, fingerprint: null, text: CONTENT_CIPHERTEXT_SENTINEL,
      envelope: late.envelope, attestation: late.attestation
    })).rejects.toThrow("PRIVATE_CONTENT_ERASED");
  }, 180_000);
});

describe("0072 — core.run_role_assignment is pinned once", () => {
  it("takes ONE insert per run and refuses every update, delete, truncate and malformed row", async () => {
    const runId = await fixture.createLegacyRun(`0072 assignment ${randomUUID()}`);
    const assignment = { scorecardVersion: null, strength: "BALANCED", roles: {} };
    const insert = (target: string, strength: string, value: string) => db().query(
      `INSERT INTO core.run_role_assignment (run_id, assignment, strength, stepped_down)
       VALUES ($1,$2::jsonb,$3,false)`,
      [target, value, strength]
    );
    await insert(runId, "BALANCED", JSON.stringify(assignment));
    expect((await db().query(
      "SELECT assignment, strength, stepped_down FROM core.run_role_assignment WHERE run_id=$1", [runId]
    )).rows).toEqual([{ assignment, strength: "BALANCED", stepped_down: false }]);
    await expect(insert(runId, "BEST", "{}")).rejects.toThrow(/run_role_assignment_pkey/u);
    await expect(db().query("UPDATE core.run_role_assignment SET stepped_down=true WHERE run_id=$1", [runId]))
      .rejects.toThrow(/rejects UPDATE/u);
    await expect(db().query("DELETE FROM core.run_role_assignment WHERE run_id=$1", [runId]))
      .rejects.toThrow(/rejects DELETE/u);
    await expect(db().query("TRUNCATE core.run_role_assignment")).rejects.toThrow(/TRUNCATE_REJECTED/u);
    const other = await fixture.createLegacyRun(`0072 assignment other ${randomUUID()}`);
    await expect(insert(other, "FAST", "{}")).rejects.toThrow(/run_role_assignment_strength_vocabulary/u);
    await expect(insert(other, "BEST", "[]")).rejects.toThrow(/run_role_assignment_is_object/u);
    await expect(insert(randomUUID(), "BEST", "{}")).rejects.toThrow(/run_role_assignment_run_id_fkey/u);
  });
});

describe("0072 — privileges", () => {
  it("grants the runtime (the API and the runner) SELECT and INSERT, the replay role SELECT, and nothing more", async () => {
    const privileges = (await db().query<Record<string, boolean>>(`
      SELECT
        has_table_privilege('debateai_runtime','ledger.call_prompt','SELECT') AS runtime_prompt_select,
        has_table_privilege('debateai_runtime','ledger.call_prompt','INSERT') AS runtime_prompt_insert,
        has_table_privilege('debateai_runtime','ledger.call_prompt','UPDATE') AS runtime_prompt_update,
        has_table_privilege('debateai_runtime','ledger.call_prompt','DELETE') AS runtime_prompt_delete,
        has_table_privilege('debateai_replay','ledger.call_prompt','SELECT') AS replay_prompt_select,
        has_table_privilege('debateai_replay','ledger.call_prompt','INSERT') AS replay_prompt_insert,
        has_table_privilege('debateai_runtime','core.run_role_assignment','SELECT') AS runtime_assignment_select,
        has_table_privilege('debateai_runtime','core.run_role_assignment','INSERT') AS runtime_assignment_insert,
        has_table_privilege('debateai_runtime','core.run_role_assignment','UPDATE') AS runtime_assignment_update,
        has_table_privilege('debateai_authorization_runtime','core.run_role_assignment','INSERT') AS api_assignment_insert,
        has_table_privilege('debateai_replay','core.run_role_assignment','SELECT') AS replay_assignment_select,
        has_table_privilege('debateai_replay','core.run_role_assignment','INSERT') AS replay_assignment_insert,
        has_function_privilege('public','core.enforce_content_ciphertext_call_prompt()','EXECUTE') AS public_plaintext_guard,
        has_function_privilege('public','core.enforce_content_attestation_v2_call_prompt()','EXECUTE') AS public_attestation_guard,
        has_function_privilege('debateai_content_provision','core.enforce_content_attestation_v2_call_prompt()','EXECUTE') AS provision_attestation_guard
    `)).rows[0];
    expect(privileges).toEqual({
      runtime_prompt_select: true, runtime_prompt_insert: true,
      runtime_prompt_update: false, runtime_prompt_delete: false,
      replay_prompt_select: true, replay_prompt_insert: false,
      runtime_assignment_select: true, runtime_assignment_insert: true, runtime_assignment_update: false,
      api_assignment_insert: true,
      replay_assignment_select: true, replay_assignment_insert: false,
      public_plaintext_guard: false, public_attestation_guard: false, provision_attestation_guard: false
    });
  });
});

describe("0072 — replay safety", () => {
  it("stays guarded after 0038, 0040, 0063, 0069 or 0072 itself is replayed over the applied chain", async () => {
    const directory = new URL("../../migrations/", import.meta.url);
    for (const replayed of [
      "0038_content_encryption.sql",
      "0040_account_erasure.sql",
      "0063_serve_answer_content_carrier.sql",
      "0069_remaining_content_carriers.sql",
      "0072_model_scorecard.sql"
    ]) {
      await expect(db().query(await readFile(new URL(replayed, directory), "utf8")), replayed)
        .resolves.toBeDefined();
      const marker = randomUUID();
      const runId = await fixture.createEncryptedRun(`0072 replay ${replayed} ${marker}`);
      await expect(insertPromptRow({
        attemptId: randomUUID(), runId, fingerprint: FINGERPRINT, text: `replayed plaintext ${marker}`,
        envelope: null, attestation: null
      }), replayed).rejects.toThrow("CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.call_prompt");
      const sealed = await sealPrompt(runId, `replayed sealed ${marker}`);
      await expect(insertPromptRow({
        attemptId: sealed.attemptId, runId, fingerprint: null, text: CONTENT_CIPHERTEXT_SENTINEL,
        envelope: sealed.envelope, attestation: sealed.attestation
      }), replayed).resolves.toBeDefined();
      await expect(insertLedgerRow(runId, { model_role: "COMPOSER" }), replayed)
        .rejects.toThrow(/ledger_entry_model_role_vocabulary/u);
    }
    const triggers = await db().query<{ tgname: string; function_name: string }>(
      `SELECT trigger.tgname, trigger.tgfoid::regproc::text AS function_name
       FROM pg_trigger AS trigger
       WHERE trigger.tgrelid='ledger.call_prompt'::regclass AND NOT trigger.tgisinternal
         AND trigger.tgname IN ('aaa_enforce_content_attestation_v2','enforce_content_ciphertext','enforce_erasure_barrier')
       ORDER BY trigger.tgname`
    );
    expect(triggers.rows).toEqual([
      { tgname: "aaa_enforce_content_attestation_v2", function_name: "core.enforce_content_attestation_v2_call_prompt" },
      { tgname: "enforce_content_ciphertext", function_name: "core.enforce_content_ciphertext_call_prompt" },
      { tgname: "enforce_erasure_barrier", function_name: "core.enforce_erasure_barrier" }
    ]);
  }, 300_000);
});
