import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  insertCallPrompt,
  insertRunRoleAssignment,
  readCallPrompt,
  readRunRoleAssignment
} from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

// Model scorecard §2.3/§2.4: the repository half of migration 0090. The prompt
// helper seals an encrypted run's text AND fingerprint inside the run's
// envelope, keeps a legacy run's in the clear, and inherits the erasure rules;
// the assignment helper pins once; the ledger repository writes the four call
// facts and the thinking tokens.

let fixture: ContentRunFixture;
const db = () => fixture.database.pool;
const ENVELOPE_KEYS = ["ct", "keyId", "nonce", "tag", "v"];
const fingerprintOf = (text: string) => createHash("sha256").update(text).digest("hex");

beforeAll(async () => {
  fixture = await startContentRunFixture("model-scorecard-db-records");
}, 180_000);

afterAll(async () => {
  await fixture?.stop();
});

async function promptRowText(attemptId: string): Promise<string> {
  const result = await db().query<{ body: string }>(
    "SELECT to_jsonb(row)::text AS body FROM ledger.call_prompt AS row WHERE attempt_id=$1",
    [attemptId]
  );
  return result.rows[0]?.body ?? "";
}

describe("insertCallPrompt / readCallPrompt", () => {
  it("seals an encrypted run's prompt and fingerprint inside the attested envelope and opens them for the owner", async () => {
    const marker = randomUUID();
    const runId = await fixture.createEncryptedRun(`db records encrypted ${marker}`);
    const attemptId = randomUUID();
    const promptText = JSON.stringify([{ role: "user", content: `private prompt ${marker}` }]);
    const promptFingerprint = fingerprintOf(promptText);
    await insertCallPrompt(db(), { runId, attemptId, promptText, promptFingerprint });
    const stored = (await db().query<{
      prompt_text: string; prompt_fingerprint: string | null;
      content_ciphertext: Record<string, unknown>; attestation_length: number;
    }>(
      `SELECT prompt_text, prompt_fingerprint, content_ciphertext,
              octet_length(content_attestation) AS attestation_length
       FROM ledger.call_prompt WHERE attempt_id=$1`, [attemptId]
    )).rows[0]!;
    expect(stored.prompt_text).toBe(CONTENT_CIPHERTEXT_SENTINEL);
    expect(stored.prompt_fingerprint).toBeNull();
    expect(Object.keys(stored.content_ciphertext).sort()).toEqual(ENVELOPE_KEYS);
    expect(stored.attestation_length).toBe(32);
    expect(await promptRowText(attemptId)).not.toContain(marker);
    expect(await promptRowText(attemptId)).not.toContain(promptFingerprint);
    await expect(readCallPrompt(db(), attemptId))
      .resolves.toEqual({ runId, attemptId, promptText, promptFingerprint });
  }, 180_000);

  it("keeps a legacy run's prompt and fingerprint in the clear", async () => {
    const runId = await fixture.createLegacyRun(`db records legacy ${randomUUID()}`);
    const attemptId = randomUUID();
    const promptText = JSON.stringify([{ role: "user", content: "legacy prompt" }]);
    const promptFingerprint = fingerprintOf(promptText);
    await insertCallPrompt(db(), { runId, attemptId, promptText, promptFingerprint });
    expect((await db().query(
      "SELECT prompt_text, prompt_fingerprint, content_ciphertext FROM ledger.call_prompt WHERE attempt_id=$1",
      [attemptId]
    )).rows).toEqual([{ prompt_text: promptText, prompt_fingerprint: promptFingerprint, content_ciphertext: null }]);
    await expect(readCallPrompt(db(), attemptId))
      .resolves.toEqual({ runId, attemptId, promptText, promptFingerprint });
    await expect(readCallPrompt(db(), randomUUID())).resolves.toBeNull();
  });

  it("refuses a malformed input before touching the database", async () => {
    const runId = await fixture.createLegacyRun(`db records invalid ${randomUUID()}`);
    const valid = { runId, attemptId: randomUUID(), promptText: "[]", promptFingerprint: fingerprintOf("[]") };
    for (const invalid of [
      { ...valid, attemptId: valid.attemptId.toUpperCase() },
      { ...valid, promptFingerprint: valid.promptFingerprint.slice(1) },
      { ...valid, promptText: "" }
    ]) {
      await expect(insertCallPrompt(db(), invalid)).rejects.toThrow("CALL_PROMPT_INPUT_INVALID");
    }
    await expect(readCallPrompt(db(), "not-an-attempt")).rejects.toThrow("CALL_PROMPT_INPUT_INVALID");
  });

  it("is destroyed with the debate: unreadable once the key is shredded, refused once the run is erased", async () => {
    const marker = randomUUID();
    const runId = await fixture.createEncryptedRun(`db records shred ${marker}`);
    const attemptId = randomUUID();
    const promptText = JSON.stringify([{ role: "user", content: `shredded ${marker}` }]);
    await insertCallPrompt(db(), { runId, attemptId, promptText, promptFingerprint: fingerprintOf(promptText) });
    await fixture.cipher.destroyRunKey(runId);
    await expect(readCallPrompt(db(), attemptId)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    expect((await db().query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ledger.call_prompt WHERE attempt_id=$1", [attemptId]
    )).rows[0]!.count).toBe("1");
    expect(await promptRowText(attemptId)).not.toContain(marker);

    const erasedRunId = await fixture.createEncryptedRun(`db records erased ${marker}`);
    await fixture.eraseRunContent(erasedRunId);
    await expect(insertCallPrompt(db(), {
      runId: erasedRunId, attemptId: randomUUID(), promptText, promptFingerprint: fingerprintOf(promptText)
    })).rejects.toMatchObject({ code: "PRIVATE_CONTENT_ERASED" });
  }, 180_000);
});

describe("insertRunRoleAssignment / readRunRoleAssignment", () => {
  it("pins the assignment once and reads it back undecoded", async () => {
    const runId = await fixture.createLegacyRun(`db records assignment ${randomUUID()}`);
    await expect(readRunRoleAssignment(db(), runId)).resolves.toBeNull();
    const assignment = { scorecardVersion: 3, strength: "BALANCED", roles: { POSITION: [] } };
    await insertRunRoleAssignment(db(), { runId, assignment, strength: "BALANCED", steppedDown: true });
    await expect(readRunRoleAssignment(db(), runId)).resolves.toEqual({
      runId, assignment, strength: "BALANCED", steppedDown: true, createdAt: expect.any(Date)
    });
    // strength must still equal assignment.strength ("BALANCED") here: migration
    // 0090's run_role_assignment_strength_matches_assignment CHECK is evaluated
    // before the primary key's unique index, so a mismatched strength on this
    // second row would surface the CHECK violation and never exercise the
    // insert-once guard this assertion targets.
    await expect(insertRunRoleAssignment(db(), { runId, assignment, strength: "BALANCED", steppedDown: false }))
      .rejects.toThrow(/run_role_assignment_pkey/u);
  });

  it("refuses a strength outside the vocabulary or an assignment that is not an object", async () => {
    const runId = await fixture.createLegacyRun(`db records assignment invalid ${randomUUID()}`);
    await expect(insertRunRoleAssignment(db(), {
      runId, assignment: {}, strength: "FAST" as never, steppedDown: false
    })).rejects.toThrow("RUN_ROLE_ASSIGNMENT_INVALID");
    await expect(insertRunRoleAssignment(db(), {
      runId, assignment: [] as never, strength: "BEST", steppedDown: false
    })).rejects.toThrow("RUN_ROLE_ASSIGNMENT_INVALID");
    await expect(readRunRoleAssignment(db(), runId)).resolves.toBeNull();
  });
});

describe("LedgerRepository writes the scorecard call facts", () => {
  it("writes role, candidate, version and level on the ledger row and thinking tokens on the artifact", async () => {
    const runId = await fixture.createLegacyRun(`db records ledger ${randomUUID()}`);
    const ledger = new LedgerRepository(db());
    const artifactId = randomUUID();
    const attemptId = randomUUID();
    await ledger.appendRawArtifact({
      artifactId, attemptId, runId, providerRef: "provider:db-records", provider: "openai-compatible-http",
      model: "model:db-records", maker: "maker:db-records", modelVersion: "v1", rawText: "{}",
      metadata: {}, parseStatus: "PARSED", inputHash: "4".repeat(64), contractHash: "5".repeat(64),
      contentHash: "6".repeat(64), thinkingTokens: 42
    });
    const at = new Date("2026-09-26T09:00:00.000Z");
    const common = {
      runId, actionKind: "MODEL_CALL", callSiteKey: "JUDGE:cross-root:0->1", subjectItemId: "node:db-records",
      stanceAtAction: "UNASSIGNED" as const, outcome: "OK" as const, actorRef: "provider:db-records",
      inputHash: "input", contractHash: "contract", startedAt: at, finishedAt: at
    };
    const withFacts = await ledger.append({
      ...common, attemptId, rawArtifactRef: artifactId,
      modelRole: "CROSS_EXCHANGE", candidateId: "openai/gpt-5.6-sol@high", scorecardVersion: 4, thinkingLevel: "high"
    });
    const withoutFacts = await ledger.append({ ...common, attemptId: randomUUID() });
    const rows = await db().query(
      `SELECT ledger_entry_id::text AS id, model_role, candidate_id, scorecard_version, thinking_level
       FROM ledger.ledger_entry WHERE ledger_entry_id = ANY($1::uuid[]) ORDER BY sequence`,
      [[withFacts.ledgerEntryId, withoutFacts.ledgerEntryId]]
    );
    expect(rows.rows).toEqual([
      { id: withFacts.ledgerEntryId, model_role: "CROSS_EXCHANGE", candidate_id: "openai/gpt-5.6-sol@high",
        scorecard_version: 4, thinking_level: "high" },
      { id: withoutFacts.ledgerEntryId, model_role: null, candidate_id: null, scorecard_version: null, thinking_level: null }
    ]);
    expect((await db().query(
      "SELECT thinking_tokens FROM ledger.raw_artifact WHERE raw_artifact_id=$1", [artifactId]
    )).rows).toEqual([{ thinking_tokens: 42 }]);
  });
});
