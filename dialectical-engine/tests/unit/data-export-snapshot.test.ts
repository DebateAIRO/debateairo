import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { collectSnapshot, RAW_SECTIONS, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";

const rawFixture = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8"));
// owner-read.ts:72 passes through answer.answer_version from the owner answer.
const ownerAnswerFixture = { answer_id: "answer-1", answer_version: 2 };

const claim = {
  exportId: "export-1", userId: "user-1", ownerRef: "owner-1", sessionId: "session-1",
  locale: "en", requestedAt: new Date("2026-10-05T00:00:00.000Z"), attempt: 1,
};

function harness() {
  const raw = structuredClone(rawFixture) as Record<string, any>;
  const ownerView = {
    runKeyPresent: vi.fn(async () => true),
    runRemovedByCheck: vi.fn(async () => false),
    readSynthesisChecks: vi.fn(async () => []),
    readPublicationReviews: vi.fn(async () => []),
    // RunProjectionSchema at contract/src/index.ts:552-559 calls the question question_line.
    readRun: vi.fn(async (_owner: string, _run: string) => ({ run_ref: "run-1", question_line: "My question", state: "SETTLED", terminal_reason: null, hold_until: null })),
    readRunAnswer: vi.fn(async (_owner: string, _run: string) => structuredClone(ownerAnswerFixture)),
    // contract/src/index.ts:1239 puts nodes on Answer; :1309-1326 defines Inspection without nodes.
    readAnswer: vi.fn(async (_owner: string, _answer: string, version: number) => ({ answer_id: "answer-1", answer_version: version, verdict_state: "SUPPORTED", nodes: [{ node_id: "node-1" }], relevant_as_of: "2026-10-03T00:00:00.000Z" })),
    readInspection: vi.fn(async (_owner: string, _answer: string, version: number) => ({ answer_id: "answer-1", answer_version: version, conformance: { outcome: "PASS", coverage_mode: "EXHAUSTIVE", segment_results: [] }, segment_suppressions: [], shadow_suppressions: [] })),
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

// SPEC-v11 row C7 (V-42): raw-a.json's run-1 rotation as the archive carries it (no run_id at any depth).
const RAW_ROTATION = { rule: "LEAST_SHARE_SEEDED_TIE_V1", writer: { provider_ref: "p:raw:w", model_id: "raw-writer-model", maker: "Maker A" }, checker: { provider_ref: "p:raw:c", model_id: "raw-checker-model", maker: "Maker B" }, storyteller: { provider_ref: "p:raw:s", model_id: "raw-storyteller-model", maker: "Maker C" }, story_checker: { provider_ref: "p:raw:sc", model_id: "raw-story-checker-model", maker: "Maker D" }, eligible_model_ids: ["raw-writer-model", "raw-checker-model", "raw-storyteller-model", "raw-story-checker-model"], created_at: "2026-10-03T00:00:01.000Z" };

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
    expect(snapshot.debates.debates[0]?.run_answer).toEqual(ownerAnswerFixture);
    expect(snapshot.debates.debates[0]?.question).toBe("My question");
    expect(snapshot.debates.debates[0]?.state).toBe("SETTLED");
    expect(snapshot.debates.debates[0]?.answers?.[0]?.versions).toHaveLength(2);
    expect(snapshot.debates.debates[0]?.answers?.[0]?.versions[0]?.nodes).toEqual({ "node-1": { text: "node" } });
  });

  it("S-4 exports a tombstoned run as UNRECOVERABLE without owner reads", async () => {
    const h = harness();
    h.raw.erasure_tombstones = [{ run_id: "run-1", completed_at: "2026-10-04T00:00:00.000Z" }];
    const entry = (await h.collect()).debates.debates[0];
    expect(entry).toEqual({ reference: "run-1", content_status: "UNRECOVERABLE", created_at: "2026-10-03T00:00:00.000Z", deleted_at: "2026-10-04T00:00:00.000Z", tier: "STANDARD", depth: { depth: 2 }, plan_tier: "BASIC", state: null, visibility_history: [{ state: "PRIVATE", at: "2026-10-03T00:00:00.000Z" }], role_rotation: RAW_ROTATION });
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
    const missingNode = harness();
    missingNode.ownerView.readNode.mockResolvedValue(null as never);
    await expect(missingNode.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
    const missingNodeList = harness();
    missingNodeList.ownerView.readAnswer.mockResolvedValue({ answer_id: "answer-1", answer_version: 2, verdict_state: "SUPPORTED" } as never);
    await expect(missingNodeList.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });

  it("S-9 retains all 130 runs without a limit", async () => {
    const h = harness();
    h.raw.runs = Array.from({ length: 130 }, (_, n) => ({ ...h.raw.runs[0], run_id: `run-${n}` }));
    expect((await h.collect()).debates.debates).toHaveLength(130);
  });

  it("S-10 projects only archive columns and UTC timestamps even when raw rows carry secret columns", async () => {
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

    // migrations/0115_data_export.sql:204 emits execute_at directly into JSON;
    // the database session can serialize its offset as in C12's E-2 frame.
    expect((await h.collect()).account.erasure_requests[0]?.execute_at).toBe("2030-05-04T03:02:01.000Z");

    const offset = harness();
    const shifted = "2030-05-04T06:02:01.029961+03:00";
    offset.raw.user.created_at = shifted;
    offset.raw.billing.quotes[0].expires_at = shifted;
    offset.raw.support_messages[0].received_at = shifted;
    offset.raw.audit_events[0].occurred_at = shifted;
    offset.ownerView.readAnswer.mockImplementation(async (_owner: string, _answer: string, version: number) => ({ answer_id: "answer-1", answer_version: version, verdict_state: "SUPPORTED", nodes: [{ node_id: "node-1" }], relevant_as_of: shifted }));
    const shiftedSnapshot = await offset.collect();
    expect(JSON.stringify(shiftedSnapshot)).not.toContain("+03:00");
    expect(shiftedSnapshot.account.account.created_at).toBe("2030-05-04T03:02:01.029961Z");
    expect(shiftedSnapshot.billing.quotes[0]?.expires_at).toBe("2030-05-04T03:02:01.029961Z");
    expect((shiftedSnapshot.debates.debates[0]?.answers?.[0]?.versions[0]?.answer as Record<string, unknown>).relevant_as_of).toBe("2030-05-04T03:02:01.029961Z");

    const literalText = harness();
    literalText.ownerView.readRun.mockResolvedValue({ run_ref: "run-1", question_line: shifted, state: "SETTLED", terminal_reason: null, hold_until: null });
    literalText.ownerView.readStory.mockResolvedValue({ text: shifted });
    const literalSnapshot = await literalText.collect();
    expect(literalSnapshot.debates.debates[0]?.question).toBe(shifted);
    expect((literalSnapshot.debates.debates[0]?.answers?.[0]?.story as Record<string, unknown>).text).toBe(shifted);

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
    const missingColumn = harness();
    delete missingColumn.raw.billing.quotes[0].expires_at;
    await expect(missingColumn.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
  });

  it("S-12 (V-42) carries each run's role rotation with exactly the C7 keys, null for none, and refuses a malformed one", async () => {
    const h = harness();
    expect((await h.collect()).debates.debates[0]?.role_rotation).toEqual(RAW_ROTATION);
    expect(Object.keys((await h.collect()).debates.debates[0]!.role_rotation!)).toEqual(["rule", "writer", "checker", "storyteller", "story_checker", "eligible_model_ids", "created_at"]);
    h.raw.runs[0].role_rotation = null;
    expect((await h.collect()).debates.debates[0]?.role_rotation).toBeNull();
    delete h.raw.runs[0].role_rotation;
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    h.raw.runs[0].role_rotation = { ...structuredClone(rawFixture.runs[0].role_rotation), checker: { provider_ref: "p", maker: "m" } };
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
  });

  it("S-11 rejects a records-key failure without a destruction record", async () => {
    const h = harness();
    h.decrypt.openRecord.mockImplementation(() => { throw new Error("records key unavailable"); });
    await expect(h.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });
});
