import { describe, expect, it } from "vitest";
import { RAW_SECTIONS, KEEP_COLUMNS, collectSnapshot, DataExportBuildError } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { readZip } from "../support/zip-reader.js";
import { assertDataExportDatabaseRoles, PostgresDataExportSource } from "../../packages/db/src/data-export.js";
import { renderReadme } from "../../apps/api/src/data-export/readme.js";

function rawRows() {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map(section => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null,
    phone_source: null, phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z",
    adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  // 0131's reading level is one row or null, like the region.
  raw.page_reading_level = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map(key => [key, []]));
  return raw;
}

async function collect(raw: Record<string, unknown>) {
  return collectSnapshot({
    claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session",
      locale: "en", requestedAt: new Date("2026-10-20T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: {} as never,
    decrypt: { openPublicFlag: async () => { throw new Error("no report in this fixture"); }, openUserField: async () => "ada@example.test", openRecord: () => "", openSupport: async () => "", openRunContent: async () => [] },
    now: () => new Date("2026-10-20T11:00:00.000Z")
  });
}

// 2026-11-19: the dormant threat reports were removed. The export reads no kept question, account.json has no
// kept_questions and the README promises none; the raw source no longer has a threat_reports section.
describe("S04 data export", () => {
  it("exports no kept questions", async () => {
    // Property: account.json carries no kept_questions key and no other entry names one.
    // Mutant: put kept_questions back into the account section.
    expect(RAW_SECTIONS).not.toContain("threat_reports");
    expect(Object.keys(KEEP_COLUMNS)).not.toContain("threat_reports");
    const snapshot = await collect(rawRows());
    expect(snapshot.account).not.toHaveProperty("kept_questions");
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const account = JSON.parse(archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8"));
    expect(Object.keys(account)).not.toContain("kept_questions");
    for (const entry of archive) expect(entry.bytes.toString("utf8"), entry.name).not.toMatch(/kept[ _]questions?|threat[ _-]?reports?/iu);
  });

  it("README promises no kept questions", () => {
    expect(renderReadme()).not.toMatch(/kept[ _]questions?|staff review/iu);
  });

  it("refuses a stray threat_reports raw section rather than exporting it", async () => {
    // Property: the exact-section check still holds; a threat_reports section is now unlisted and never flows into the archive.
    await expect(collect({ ...rawRows(), threat_reports: [{ question: "x", kept_at: "2026-11-01T00:00:00.000Z" }] }))
      .rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" } satisfies Partial<DataExportBuildError>);
  });

  it("reads no threat-report reader in the worker's raw query", async () => {
    const seen: string[] = [];
    const pool = { query: async (sql: string) => { seen.push(sql); return { rows: [{ snapshot: { user: {} }, page_memory: null }] }; } };
    const raw = await new PostgresDataExportSource(pool as never).readRaw("export", "worker");
    expect(seen.join("\n")).not.toMatch(/threat_report/u);
    expect(raw).not.toHaveProperty("threat_reports");
  });

  it("rejects an extra raw snapshot section", async () => {
    // Property: an unlisted raw section never flows into the archive.
    // Mutant: omit the exact-key check; a kept-question timestamp change is a neighbour.
    await expect(collect({ ...rawRows(), surprise: [{ secret: "x" }] })).rejects.toMatchObject({
      code: "DATA_EXPORT_SOURCE_FAILED" } satisfies Partial<DataExportBuildError>);
  });

  it("requires every export reader, and no longer the threat-report reader, in the worker role witness", async () => {
    // Property: a worker lacking an export SQL reader cannot pass the export boot check.
    const seen: unknown[][] = [];
    const principal = (name: string, workerCount: number) => ({
      principal: name, authorization_member: name === "request", worker_member: name === "worker",
      request_count: name === "request" ? 4 : 0, worker_count: workerCount, privileged: false });
    const pool = (name: string, workerCount: number) => ({ query: async (_sql: string, params: unknown[]) => {
      seen.push(params); return { rows: [principal(name, workerCount)] }; } });
    // 0131 (the V4 account memory) adds a tenth worker function, its page-memory reader; 0132 and 0133 (the web evidence
    // store and the investigations) an eleventh and a twelfth; 0134 (the dig model) a thirteenth; 0135 (the dig picks) a
    // fourteenth; 0136 (the investigation reports) a fifteenth; 0137 to 0139 (the public debates, the tree updates and the passage retention) the sixteenth to the eighteenth; 0141 (the path suggestions) a nineteenth; 0144 (the small AI's charges) a twentieth; 0147 (the public tree) a twenty-first; 0152 (a reporter's own reports) a twenty-second; 0157 (the moderation notices and the answers to reports) a twenty-third; 0158 (the small AIs before Start) a twenty-fourth; 0162 (the questions not started yet, Task 39e) a twenty-fifth. 0128's threat-report reader left the list with the threat reports
    // (2026-11-19), so twenty-four.
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 24) as never)).resolves.toBeUndefined();
    expect(seen[1]?.[1]).not.toContain("identity.read_data_export_threat_reports(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_web_evidence(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_investigations(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_dig_model(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_dig_picks(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_investigation_reports(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_public_debates(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_tree_updates(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_passage_retention(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_path_suggestions(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_public_tree(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_public_flags(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_moderation(uuid,uuid)");
    expect(seen[1]?.[1]).toContain("identity.read_data_export_saved_questions(uuid,uuid)");
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 23) as never)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
    await expect(assertDataExportDatabaseRoles(pool("request", 1) as never, pool("worker", 24) as never)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  });
});
