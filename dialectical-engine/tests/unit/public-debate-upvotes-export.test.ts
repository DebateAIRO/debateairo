/**
 * Upvotes on public debates (design 2026-11-26 §7.5, §6): THE DEBATES A PERSON UPVOTED IN THE DATA EXPORT.
 * account.json gains `debates_you_upvoted`, its last section: per upvote, the debate's public reference and the time in UTC, oldest
 * first as 0193's reader gives them, and nothing else. The voter's reference never goes out. A reader that answers nothing fails the
 * export; it does not empty the section. The worker reaches 0193's reader: its function count is one more (twenty-six).
 * Every reference here is made up.
 */
import { describe, expect, it } from "vitest";
import { KEEP_COLUMNS, RAW_SECTIONS, collectSnapshot } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderReadme } from "../../apps/api/src/data-export/readme.js";
import type { ExportSnapshot } from "../../apps/api/src/data-export/types.js";
import { assertDataExportDatabaseRoles, PostgresDataExportSource } from "../../packages/db/src/data-export.js";
import { readZip } from "../support/zip-reader.js";

const DEBATE_A = "0193a000-0000-4000-8000-000000000001";
const DEBATE_B = "0193b000-0000-4000-8000-000000000002";
const READER = "identity.read_data_export_public_debate_upvotes(uuid,uuid)";
const SAVED_READER = "identity.read_data_export_saved_questions(uuid,uuid)";
// As 0193's reader answers: oldest first. The stray owner_ref stands for anything the reader must never pass on.
const TWO = [
  { publication_ref: DEBATE_A, created_at: "2026-11-26T15:00:00.123456+02:00", owner_ref: "secret-owner" },
  { publication_ref: DEBATE_B, created_at: "2026-11-26T13:30:00+00:00" }
];
const TWO_OUT = [
  { debate_reference: DEBATE_A, upvoted_at: "2026-11-26T13:00:00.123456Z" },
  { debate_reference: DEBATE_B, upvoted_at: "2026-11-26T13:30:00.000Z" }
];

function rawRows(upvotes: unknown): Record<string, unknown> {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map((section) => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null, phone_source: null,
    phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z", adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  raw.page_reading_level = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map((key) => [key, []]));
  raw.public_debate_upvotes = upvotes;
  return raw;
}

function collect(raw: Record<string, unknown>): Promise<ExportSnapshot> {
  return collectSnapshot({
    claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session", locale: "en",
      requestedAt: new Date("2026-11-26T14:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: {} as never,
    decrypt: { openPublicFlag: async () => { throw new Error("no report"); }, openUserField: async () => "ada@example.test", openRecord: () => "",
      openSupport: async () => "", openRunContent: async () => [] },
    now: () => new Date("2026-11-26T15:00:00.000Z")
  });
}

// account.json of the built archive: its text, its parsed object, and its `records` figure in manifest.json.
async function accountJson(upvotes: unknown): Promise<{ text: string; account: Record<string, any>; records: number }> {
  const files = readZip(buildArchive(await collect(rawRows(upvotes)), loadArchiveCatalog("en")).zip);
  const text = files.find((entry) => entry.name === "account.json")!.bytes.toString("utf8");
  const manifest = JSON.parse(files.find((entry) => entry.name === "manifest.json")!.bytes.toString("utf8")) as
    { entries: Array<{ name: string; records: number }> };
  return { text, account: JSON.parse(text) as Record<string, any>, records: manifest.entries.find((entry) => entry.name === "account.json")!.records };
}

describe("the public debates the person upvoted in account.json", () => {
  it("holds each upvote as the debate's public reference and the time in UTC, oldest first, and nothing else", async () => {
    const snapshot = await collect(rawRows(TWO));
    expect(snapshot.account.debates_you_upvoted).toEqual(TWO_OUT);
    expect(Object.keys(snapshot.account).slice(-2)).toEqual(["questions_not_started", "debates_you_upvoted"]);
  });

  it("an account with no upvotes has debates_you_upvoted: []", async () => {
    expect((await collect(rawRows([]))).account.debates_you_upvoted).toEqual([]);
  });

  it("refuses the export when the section is missing, is not a list, or a row lacks its debate or its time", async () => {
    const missing = rawRows([]);
    delete missing.public_debate_upvotes;
    await expect(collect(missing)).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    const time = "2026-11-26T13:00:00+00:00";
    for (const bad of [null, undefined, {}, [{ publication_ref: DEBATE_A }], [{ created_at: time }], [{ publication_ref: 7, created_at: time }]]) {
      await expect(collect(rawRows(bad)), String(JSON.stringify(bad))).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    }
  });

  it("account.json carries the section last, two keys per entry, counted in the manifest, and never the voter's reference", async () => {
    const { text, account, records } = await accountJson(TWO);
    expect(account.debates_you_upvoted).toEqual(TWO_OUT);
    expect(Object.keys(account.debates_you_upvoted[0])).toEqual(["debate_reference", "upvoted_at"]);
    expect(Object.keys(account).at(-1)).toBe("debates_you_upvoted");
    expect(account).not.toHaveProperty("public_debate_upvotes");
    for (const absent of ["secret-owner", "owner_ref", "publication_ref"]) expect(text, absent).not.toContain(absent);
    expect(records - (await accountJson([])).records).toBe(2);
  });

  it("the README names them on account.json's line", () => {
    const lines = renderReadme().split("\n").filter((line) => line.includes("upvoted"));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.startsWith("account.json — ")).toBe(true);
    expect(lines[0]!.endsWith("It also holds the questions you have not started yet, with your answers and paths. "
      + "It also holds the public debates you upvoted, and when.")).toBe(true);
  });
});

describe("the worker reads 0193's reader", () => {
  it("as the twenty-sixth function of its role witness, listed directly after 0162's reader", async () => {
    const seen: unknown[][] = [];
    const principal = (name: string, workerCount: number) => ({ principal: name, authorization_member: name === "request",
      worker_member: name === "worker", request_count: name === "request" ? 4 : 0, worker_count: workerCount, privileged: false });
    const pool = (name: string, workerCount: number) => ({ query: async (_sql: string, params: unknown[]) => {
      seen.push(params); return { rows: [principal(name, workerCount)] }; } });
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 26) as never)).resolves.toBeUndefined();
    const listed = seen[1]?.[1] as string[];
    expect(listed).toHaveLength(26);
    expect(listed.indexOf(READER)).toBe(listed.indexOf(SAVED_READER) + 1);
    expect(seen[1]?.[0]).not.toContain(READER);
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 25) as never))
      .rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  });

  it("and in readRaw's one statement, beside the other readers", async () => {
    const sql: string[] = [];
    const reader = { query: async (text: string) => {
      sql.push(text);
      return { rows: [{ snapshot: { user: {} }, threat_reports: [], page_memory: null, public_debate_upvotes: TWO }] };
    } };
    const raw = await new PostgresDataExportSource(reader as never).readRaw("export", "worker");
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("identity.read_data_export_public_debate_upvotes($1,$2) public_debate_upvotes");
    expect(raw.public_debate_upvotes).toEqual(TWO);
    expect(RAW_SECTIONS.at(-1)).toBe("public_debate_upvotes");
    expect(KEEP_COLUMNS.public_debate_upvotes).toEqual(["publication_ref", "created_at"]);
  });
});
