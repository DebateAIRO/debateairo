import { describe, expect, it } from "vitest";
import { RAW_SECTIONS, KEEP_COLUMNS, collectSnapshot } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderReadme } from "../../apps/api/src/data-export/readme.js";
import { readZip } from "../support/zip-reader.js";
import { assertDataExportDatabaseRoles, PostgresDataExportSource } from "../../packages/db/src/data-export.js";

/**
 * V4 account memory (owner rulings N7 and N11, migration 0130): the person's data export carries the reading level, the
 * debate visits and the dig links in account.json, under the archive's own names (a debate is a "reference", as in
 * debates.json; never a raw run_id key), with only the columns listed here.
 */
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";

function rawRows() {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map(section => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null,
    phone_source: null, phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z",
    adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map(key => [key, []]));
  raw.page_reading_level = { reading_level: "expert", updated_at: "2026-10-29T10:00:00.123456+02:00", owner_ref: "secret-owner" };
  raw.debate_visits = [{ run_id: PARENT, seen_at: "2026-10-29T08:00:00+00:00", owner_ref: "secret-owner",
    items: [{ item: `dig:${CHILD}`, word: "DONE" }, { item: "point:n-1", word: "SURE" }] }];
  raw.dig_links = [{ parent_run_id: PARENT, child_run_id: CHILD, places: ["w"], mode: "thorough", created_at: "2026-10-29T08:30:00+00:00", owner_ref: "secret-owner" }];
  return raw;
}

async function collect(raw: Record<string, unknown>) {
  return collectSnapshot({
    claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session",
      locale: "en", requestedAt: new Date("2026-10-29T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: {} as never,
    decrypt: { openUserField: async () => "ada@example.test", openRecord: () => "", openSupport: async () => "" },
    now: () => new Date("2026-10-29T11:00:00.000Z")
  });
}

describe("V4 account memory in the data export", () => {
  it("puts the level, the visits and the dig links in account.json, with archive names and UTC times only", async () => {
    const snapshot = await collect(rawRows());
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const account = JSON.parse(archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8"));
    // UTC, keeping PostgreSQL's microseconds as the archive does for every time.
    expect(account.reading_level).toEqual({ reading_level: "expert", updated_at: "2026-10-29T08:00:00.123456Z" });
    expect(account.debate_visits).toEqual([{ debate_reference: PARENT, seen_at: "2026-10-29T08:00:00.000Z",
      items: [{ item: `dig:${CHILD}`, word: "DONE" }, { item: "point:n-1", word: "SURE" }] }]);
    expect(account.dig_links).toEqual([{ debate_reference: CHILD, dug_from_reference: PARENT, places: ["w"], mode: "thorough",
      created_at: "2026-10-29T08:30:00.000Z" }]);
    const text = archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8");
    expect(text).not.toContain("secret-owner");
    expect(text).not.toContain('"run_id"');
  });

  it("reads an account with nothing saved as no level and empty lists", async () => {
    const raw = rawRows();
    raw.page_reading_level = null;
    raw.debate_visits = [];
    raw.dig_links = [];
    const snapshot = await collect(raw);
    expect(snapshot.account.reading_level).toBeNull();
    expect(snapshot.account.debate_visits).toEqual([]);
    expect(snapshot.account.dig_links).toEqual([]);
  });

  it("refuses a raw source that lacks one of the three sections", async () => {
    const raw = rawRows();
    delete raw.dig_links;
    await expect(collect(raw)).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
  });

  it("reads the three sections through 0130's reader, beside the snapshot and the kept questions", async () => {
    const seen: string[] = [];
    const pool = { query: async (sql: string) => {
      seen.push(sql);
      return { rows: [{ snapshot: { user: {} }, threat_reports: [], page_memory: { page_reading_level: null, debate_visits: [], dig_links: [] } }] };
    } };
    const raw = await new PostgresDataExportSource(pool as never).readRaw("export", "worker");
    expect(seen[0]).toContain("identity.read_data_export_page_memory($1,$2) page_memory");
    expect(raw).toMatchObject({ threat_reports: [], page_reading_level: null, debate_visits: [], dig_links: [] });
  });

  it("requires the page memory reader in the worker role witness (ten functions)", async () => {
    const seen: unknown[][] = [];
    const principal = (name: string, workerCount: number) => ({
      principal: name, authorization_member: name === "request", worker_member: name === "worker",
      request_count: name === "request" ? 4 : 0, worker_count: workerCount, privileged: false });
    const pool = (name: string, workerCount: number) => ({ query: async (_sql: string, params: unknown[]) => {
      seen.push(params); return { rows: [principal(name, workerCount)] }; } });
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 10) as never)).resolves.toBeUndefined();
    expect(seen[1]?.[1]).toContain("identity.read_data_export_page_memory(uuid,uuid)");
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 9) as never)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  });

  it("names the new account records in the README", () => {
    expect(renderReadme()).toContain(
      "account.json — account, channels, region, age checks, erasure requests, kept questions, reading level, debate visits and dig links.");
  });
});
