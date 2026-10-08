import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { collectSnapshot, RAW_SECTIONS, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";

const rawFixture = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8"));

const claim = {
  exportId: "export-1", userId: "user-1", ownerRef: "owner-1", sessionId: "session-1",
  locale: "en", requestedAt: new Date("2026-10-05T00:00:00.000Z"), attempt: 1,
};

function harness() {
  const raw = structuredClone(rawFixture) as Record<string, any>;
  const ownerView = {
    runKeyPresent: vi.fn(async () => true),
    readRun: vi.fn(async (_owner: string, _run: string) => ({ question: "My question", state: "DONE" })),
    readRunAnswer: vi.fn(async (_owner: string, _run: string) => ({ answer_id: "answer-1", version: 2 })),
    readAnswer: vi.fn(async (_owner: string, _answer: string, version: number) => ({ version, verdict_state: "SUPPORTED" })),
    readInspection: vi.fn(async (_owner: string, _answer: string, _version: number) => ({ nodes: [{ node_id: "node-1" }] })),
    readLedgerDigest: vi.fn(async () => ({ digest: "ledger" })),
    readStory: vi.fn(async () => ({ text: "story" })),
    readDisclosure: vi.fn(async () => ({ text: "disclosure" })),
    readNode: vi.fn(async (_owner: string, _answer: string, _node: string) => ({ text: "node" })),
  };
  const decrypt = {
    openUserField: vi.fn(async (_user: string, field: string) => `PLAIN:${field}`),
    openRecord: vi.fn((_aad: unknown, _bytes: Buffer) => "PLAIN:record"),
    openSupport: vi.fn(async (_key: unknown, _wrapped: Buffer, _context: unknown, _bytes: Buffer) => "PLAIN:support"),
  };
  const source = { readRaw: vi.fn(async (): Promise<RawExportRows> => raw as unknown as RawExportRows) };
  const input = { claim, workerId: "worker-1", source, ownerView, decrypt, now: () => new Date("2026-10-06T00:00:00.000Z") };
  const collect = () => collectSnapshot(input);
  return { raw, ownerView, decrypt, source, collect };
}

describe("data-export snapshot", () => {
  it("S-1 decrypts A1, A2 and B6 user fields with the sealed field identity", async () => {
    const h = harness();
    const snapshot = await h.collect();
    expect(snapshot.account.account.email).toBe("PLAIN:user.email_ciphertext");
    expect(snapshot.account.channels[0]?.address).toBe("PLAIN:user.email_ciphertext");
    expect(snapshot.account.channels[1]?.address).toBe("PLAIN:user.recovery_email_ciphertext");
    expect(snapshot.security.email_changes[0]?.new_email).toBe("PLAIN:user.email_ciphertext");
    expect(snapshot.security.recovery_email_changes[0]?.candidate).toBe("PLAIN:user.recovery_email_ciphertext");
    expect(h.decrypt.openUserField.mock.calls.map(([userId, field]) => [userId, field])).toEqual([
      ["user-1", "user.email_ciphertext"], ["user-1", "user.recovery_email_ciphertext"],
      ["user-1", "user.phone_ciphertext"], ["user-1", "user.email_ciphertext"],
      ["user-1", "user.recovery_email_ciphertext"], ["user-1", "user.email_ciphertext"],
      ["user-1", "user.recovery_email_ciphertext"],
    ]);
  });

  it("S-2 decrypts records and support content with their row AAD and key context", async () => {
    const h = harness();
    const snapshot = await h.collect();
    expect(h.decrypt.openRecord.mock.calls.map(([aad]) => aad)).toEqual([
      { table: "legal.acceptance", column: "evidence_ciphertext", rowId: "acceptance-1" },
      { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: "customer-1" },
      { table: "billing.quote", column: "location_ciphertext", rowId: "quote-1" },
      { table: "billing.location_evidence", column: "ip_ciphertext", rowId: "charge-1" },
    ]);
    expect(h.decrypt.openSupport.mock.calls.map(([key, _wrapped, context]) => [key, context])).toContainEqual([
      { kind: "session", ref: "support-1" },
      { kind: "session-message", sessionId: "support-1", messageId: "message-1", role: "USER", outcome: "COMPLETE", purpose: "content" },
    ]);
    expect(h.decrypt.openSupport.mock.calls.map(([key, _wrapped, context]) => [key, context])).toContainEqual([
      { kind: "case", ref: "case-1" },
      { kind: "case-message", caseId: "case-1", messageId: "case-message-1", role: "USER", purpose: "content" },
    ]);
    expect(snapshot.consents.legal_acceptances[0]?.evidence).toBe("PLAIN:record");
    expect(snapshot.support.sessions[0]?.messages[0]?.content).toBe("PLAIN:support");
  });

  it("S-3 collects every owner read and every answer version under its answer", async () => {
    const h = harness();
    const snapshot = await h.collect();
    expect(h.ownerView.readRun).toHaveBeenCalledWith("owner-1", "run-1");
    expect(h.ownerView.readRunAnswer).toHaveBeenCalledWith("owner-1", "run-1");
    expect(h.ownerView.readAnswer.mock.calls.map((call) => call[2])).toEqual([1, 2]);
    expect(h.ownerView.readInspection.mock.calls.map((call) => call[2])).toEqual([1, 2]);
    expect(h.ownerView.readLedgerDigest).toHaveBeenCalledTimes(1);
    expect(h.ownerView.readStory).toHaveBeenCalledTimes(1);
    expect(h.ownerView.readDisclosure).toHaveBeenCalledTimes(1);
    expect(h.ownerView.readNode).toHaveBeenCalledTimes(2);
    expect(snapshot.debates.debates[0]?.answers?.[0]?.versions).toHaveLength(2);
    expect(snapshot.debates.debates[0]?.answers?.[0]?.versions[0]?.nodes).toEqual({ "node-1": { text: "node" } });
  });

  it("S-4 exports a tombstoned run as UNRECOVERABLE without owner reads", async () => {
    const h = harness();
    h.raw.erasure_tombstones = [{ run_id: "run-1", completed_at: "2026-10-04T00:00:00.000Z" }];
    const entry = (await h.collect()).debates.debates[0];
    expect(entry).toEqual({ reference: "run-1", content_status: "UNRECOVERABLE", created_at: "2026-10-03T00:00:00.000Z", deleted_at: "2026-10-04T00:00:00.000Z", tier: "STANDARD", depth: { depth: 2 }, plan_tier: "BASIC", state: null, visibility_history: [{ state: "PRIVATE", at: "2026-10-03T00:00:00.000Z" }] });
    expect(h.ownerView.readRun).not.toHaveBeenCalled();
  });

  it("S-5 exports a missing run key as UNRECOVERABLE", async () => {
    const h = harness();
    h.ownerView.runKeyPresent.mockResolvedValue(false);
    expect((await h.collect()).debates.debates[0]?.content_status).toBe("UNRECOVERABLE");
    expect(h.ownerView.readRun).not.toHaveBeenCalled();
  });

  it("S-6 omits messages for destroyed support session and case keys", async () => {
    const h = harness();
    h.raw.support_key_states.forEach((key: any) => { key.destroyed_at = "2026-10-05T00:00:00.000Z"; });
    const support = (await h.collect()).support;
    expect(support.sessions[0]?.content_status).toBe("UNRECOVERABLE");
    expect(support.sessions[0]?.messages).toEqual([]);
    expect(support.cases[0]?.content_status).toBe("UNRECOVERABLE");
    expect(support.cases[0]?.messages).toEqual([]);
    expect(h.decrypt.openSupport).not.toHaveBeenCalled();
  });

  it("S-7 rejects an unavailable user DEK instead of omitting account data", async () => {
    const h = harness();
    h.decrypt.openUserField.mockRejectedValue(new Error("key store unavailable"));
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });

  it("S-8 rejects owner-read failures when the run key exists", async () => {
    const h = harness();
    h.ownerView.readRun.mockRejectedValue(new Error("read failed"));
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
    h.ownerView.readRun.mockResolvedValue(null as never);
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });

  it("S-9 retains all 130 runs without a limit", async () => {
    const h = harness();
    h.raw.runs = Array.from({ length: 130 }, (_, n) => ({ ...h.raw.runs[0], run_id: `run-${n}` }));
    expect((await h.collect()).debates.debates).toHaveLength(130);
  });

  it("S-10 projects only archive columns even when raw rows carry secret columns", async () => {
    const h = harness();
    const secrets = ["password_hash", "email_blind_index", "audit_token", "owner_ref", "totp_secret", "public_key", "credential_id", "token_hash", "code_hash", "cancellation_ref", "source_ip_hash"];
    function poison(row: Record<string, unknown>) {
      for (const name of secrets) row[name] = `SECRET-${name}`;
    }
    for (const [section, value] of Object.entries(h.raw)) {
      if (section === "billing") for (const rows of Object.values(value as Record<string, any[]>)) rows.forEach(poison);
      else if (Array.isArray(value)) value.forEach(poison);
      else if (value !== null) poison(value as Record<string, unknown>);
    }
    const encoded = JSON.stringify(await h.collect());
    for (const secret of secrets) expect(encoded).not.toContain(`SECRET-${secret}`);
    for (const internal of ["run_id", "acceptance_id", "session_id", "case_id", "message_id", "case_message_id", "wrapped_key", "email_ciphertext", "evidence_ciphertext"]) expect(encoded).not.toContain(`"${internal}"`);
    expect(Object.keys(h.raw)).toEqual([...RAW_SECTIONS]);

    const absentEnvelope = harness();
    absentEnvelope.raw.support_cases[0].summary_ciphertext = null;
    const absentEncoded = JSON.stringify(await absentEnvelope.collect());
    expect(absentEncoded).not.toContain('"summary_ciphertext"');

    const missing = harness();
    delete missing.raw.audit_events;
    await expect(missing.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    const extra = harness();
    extra.raw.unlisted_section = [];
    await expect(extra.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
  });

  it("S-11 rejects a records-key failure without a destruction record", async () => {
    const h = harness();
    h.decrypt.openRecord.mockImplementation(() => { throw new Error("records key unavailable"); });
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });
});
