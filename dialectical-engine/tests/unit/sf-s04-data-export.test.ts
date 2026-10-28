import { describe, expect, it } from "vitest";
import { RAW_SECTIONS, KEEP_COLUMNS, collectSnapshot, DataExportBuildError } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { readZip } from "../support/zip-reader.js";
import { assertDataExportDatabaseRoles } from "../../packages/db/src/data-export.js";

function rawRows() {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map(section => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null,
    phone_source: null, phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z",
    adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map(key => [key, []]));
  raw.threat_reports = [{ question: "Should I hurt my neighbour?", kept_at: "2026-10-20T09:00:00.000Z",
    decision: "REPORTED", decided_by_staff_id: "staff-secret" }];
  return raw;
}

async function collect(raw: Record<string, unknown>) {
  return collectSnapshot({
    claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session",
      locale: "en", requestedAt: new Date("2026-10-20T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: {} as never,
    decrypt: { openUserField: async () => "ada@example.test", openRecord: () => "", openSupport: async () => "" },
    now: () => new Date("2026-10-20T11:00:00.000Z")
  });
}

describe("S04 data export", () => {
  it("puts kept question text and time only in account.json", async () => {
    // Property: the asker gets their kept question, without the staff decision or staff member.
    // Mutant: project decision into kept_questions; a README wording change is a neighbour.
    const snapshot = await collect(rawRows());
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const account = JSON.parse(archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8"));
    expect(account.kept_questions).toEqual([{ question: "Should I hurt my neighbour?", kept_at: "2026-10-20T09:00:00.000Z" }]);
  });

  it("rejects an extra raw snapshot section", async () => {
    // Property: an unlisted raw section never flows into the archive.
    // Mutant: omit the exact-key check; a kept-question timestamp change is a neighbour.
    await expect(collect({ ...rawRows(), surprise: [{ secret: "x" }] })).rejects.toMatchObject({
      code: "DATA_EXPORT_SOURCE_FAILED" } satisfies Partial<DataExportBuildError>);
  });

  it("requires the threat-report reader in the worker role witness", async () => {
    // Property: a worker lacking the new SQL reader cannot pass the export boot check.
    // Mutant: retain worker_count 8; an archive README change is a neighbour.
    const seen: unknown[][] = [];
    const principal = (name: string, workerCount: number) => ({
      principal: name, authorization_member: name === "request", worker_member: name === "worker",
      request_count: name === "request" ? 4 : 0, worker_count: workerCount, privileged: false });
    const pool = (name: string, workerCount: number) => ({ query: async (_sql: string, params: unknown[]) => {
      seen.push(params); return { rows: [principal(name, workerCount)] }; } });
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 9) as never)).resolves.toBeUndefined();
    expect(seen[1]?.[1]).toContain("identity.read_data_export_threat_reports(uuid,uuid)");
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 8) as never)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
    await expect(assertDataExportDatabaseRoles(pool("request", 1) as never, pool("worker", 9) as never)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  });
});
