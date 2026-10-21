import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt, generateDek } from "@debateai/crypto";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

/**
 * The release stamp (side-by-side uploads spec 2026-10-21 §1; migration 0123 §1-§2): every core.run row carries the
 * release key of the release that runs it, written once with the row by startRun (plaintext INSERT) or by
 * core.create_encrypted_run (encrypted path). A run written without a key reads `legacy`, which no runner serves, so a
 * forgotten admission path fails loudly downstream instead of running on the wrong release (O1).
 */
const KEY = ["r17", "d50e33165a1b"].join("-");
let fixture: ContentRunFixture;

const releaseKeyOf = async (runId: string): Promise<string | undefined> =>
  (await fixture.database.pool.query<{ release_key: string }>("SELECT release_key FROM core.run WHERE run_id=$1", [runId]))
    .rows[0]?.release_key;
const runCount = async (): Promise<number> =>
  (await fixture.database.pool.query<{ n: number }>("SELECT count(*)::int n FROM core.run")).rows[0]!.n;
const intentCount = async (): Promise<number> =>
  (await fixture.database.pool.query<{ n: number }>("SELECT count(*)::int n FROM core.run_key_provision_intent")).rows[0]!.n;

/**
 * A valid encrypted-run document for core.create_encrypted_run, built as tests/support/staffPrivateObjectFixture.ts
 * builds one (intent prepared, envelope attested with the run's own secret), so only `releaseKey` can make it refuse.
 */
async function encryptedRunDocument(releaseKey: string): Promise<Record<string, unknown>> {
  const pool = fixture.database.pool;
  const runId = randomUUID(), dek = generateDek(), secret = randomBytes(32);
  const aad = ["core", "run.content_ciphertext", runId, runId, fixture.ownerRef, "release-stamp:v1", "1"] as const;
  const envelope = encrypt(dek, Buffer.from(JSON.stringify({ questionLine: "release stamp" })), aad);
  const executionRef = (await pool.query("SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS value",
    [runId, fixture.userId, fixture.ownerRef, fixture.authSessionId])).rows[0].value as string;
  const attestation = (await pool.query(`SELECT audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb),$3,'sha256') AS value`,
    [runId, envelope, secret])).rows[0].value as Buffer;
  const document = {
    runId, questionLine: "⟦DEBATEAI:CIPHERTEXT:V1⟧", askerId: `owner:${fixture.ownerRef}`, executionRef, callerScope: "ASKER",
    asOf: new Date().toISOString(), askerRiskTier: "casual", riskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "release-stamp", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: [{ agentId: "release-stamp" }], strangerSampleRate: 1, envelopeBasis: { source: "release-stamp" },
    registerVersion: 1, batteryVersion: "release-stamp", askContract: { ciphertext: true, v: 1 }, contentCiphertext: envelope,
    contentAttestation: attestation.toString("base64"), contentAttestationSecret: secret.toString("base64"), releaseKey
  };
  secret.fill(0); dek.fill(0);
  return document;
}
const createEncryptedRunDirectly = async (document: Record<string, unknown>): Promise<boolean> =>
  (await fixture.database.pool.query<{ created: boolean }>("SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document), fixture.userId, fixture.ownerRef, JSON.stringify([])])).rows[0]!.created;

beforeAll(async () => { fixture = await startContentRunFixture("release-stamp"); }, 240_000);
afterAll(async () => { await fixture?.stop(); });

describe("0123: every run carries its release key", () => {
  it("a run written without a key reads legacy", async () => {
    expect(await releaseKeyOf(await fixture.createLegacyRun("no key, plaintext"))).toBe("legacy");
    // The encrypted path too: no `releaseKey` in the document, so the function's COALESCE writes the default.
    expect(await releaseKeyOf(await fixture.createEncryptedRun("no key, encrypted"))).toBe("legacy");
  });

  it("startRun stamps the key on the plaintext path", async () => {
    expect(await releaseKeyOf(await fixture.createLegacyRun("plaintext stamp", { releaseKey: KEY }))).toBe(KEY);
  });

  it("startRun stamps the key on the encrypted path", async () => {
    expect(await releaseKeyOf(await fixture.createEncryptedRun("encrypted stamp", { releaseKey: KEY }))).toBe(KEY);
  });

  it("startRun refuses legacy and malformed keys before writing", async () => {
    const runs = await runCount(), intents = await intentCount();
    for (const releaseKey of ["legacy", "r17-D50E33165A1B", "r0-d50e33165a1b"]) {
      await expect(fixture.createLegacyRun("refused plaintext", { releaseKey }), releaseKey)
        .rejects.toMatchObject({ code: "RELEASE_KEY_INVALID" });
      await expect(fixture.createEncryptedRun("refused encrypted", { releaseKey }), releaseKey)
        .rejects.toMatchObject({ code: "RELEASE_KEY_INVALID" });
    }
    // Nothing was written: no run, and not even the encrypted path's key-provision intent (the check precedes all SQL).
    expect(await runCount()).toBe(runs);
    expect(await intentCount()).toBe(intents);
  });

  it("the column refuses a malformed key even past the TS check", async () => {
    const constraint = (await fixture.database.pool.query<{ validated: boolean; definition: string }>(
      `SELECT convalidated validated,pg_get_constraintdef(oid) definition FROM pg_constraint
       WHERE conrelid='core.run'::regclass AND conname='run_release_key_shape'`)).rows;
    expect(constraint).toHaveLength(1);
    expect(constraint[0]!.validated).toBe(true);
    expect(constraint[0]!.definition).toContain("^r[1-9][0-9]*-[0-9a-f]{12}$");
    const document = await encryptedRunDocument("bad");
    const runs = await runCount();
    // The CHECK refuses inside the function, whose handler answers false and rolls its own block back.
    expect(await createEncryptedRunDirectly(document)).toBe(false);
    expect(await runCount()).toBe(runs);
    // The same document with a well-formed key is accepted, and the row carries it.
    expect(await createEncryptedRunDirectly({ ...document, releaseKey: KEY })).toBe(true);
    expect(await releaseKeyOf(document.runId as string)).toBe(KEY);
  });

  it("core.run stays insert-only", async () => {
    const runId = await fixture.createLegacyRun("insert only");
    await expect(fixture.database.pool.query("UPDATE core.run SET release_key=$2 WHERE run_id=$1", [runId, KEY]))
      .rejects.toThrow(/append-only or immutable table/u);
    expect(await releaseKeyOf(runId)).toBe("legacy");
  });
});
