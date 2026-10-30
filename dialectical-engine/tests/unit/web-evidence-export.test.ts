import { describe, expect, it, vi } from "vitest";
import { RAW_SECTIONS, KEEP_COLUMNS, collectSnapshot, type RunContentItem } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { README_EXCLUSION_LINES, renderReadme } from "../../apps/api/src/data-export/readme.js";
import { readZip } from "../support/zip-reader.js";
import { PostgresDataExportSource } from "../../packages/db/src/data-export.js";

/**
 * The Perplexity plan's stores in the person's data export (migrations 0132 and 0133; owner answers Q4, Q5, Q22, F9 and
 * the approved privacy rows: "search words, links, sites, titles, dates and short quotes are kept with the debate"; "page
 * text is kept for up to 30 days after the last activity"). debates.json carries each debate's web sources, every sealed
 * value opened under its run's key; account.json carries the investigations and the reserve events. The page texts are
 * never opened or exported: third parties' pages, deleted on schedule (README W1).
 */
const RUN = "11111111-1111-4111-8111-111111111111";
const DIG = "22222222-2222-4222-8222-222222222222";
const SEARCH = "33333333-3333-4333-8333-333333333333";
const REFUSED = "44444444-4444-4444-8444-444444444444";
const TOP = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const READ_1 = "77777777-7777-4777-8777-777777777777";
const FAILED_2 = "88888888-8888-4888-8888-888888888888";
const EXTRACT = "99999999-9999-4999-8999-999999999999";
const INVESTIGATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sealedEnvelope = (tag: string) => ({ v: 1, keyId: `run:${RUN}`, nonce: `nonce-${tag}`, tag: "AA", ct: `ct-${tag}` });

function webEvidence() {
  return [{ run_id: RUN, web: {
    searches: [
      { search_id: SEARCH, path_ref: "pos-1", side: "for", language_kind: "local", language: "ro", country: "RO", look_back: "12m",
        outcome: "FOUND", charge_micros: 1000, result_count: 2, searched_at: "2026-10-30T10:00:00.5+02:00", content: sealedEnvelope("search") },
      { search_id: REFUSED, path_ref: "pos-1", side: "against", language_kind: "english", language: "en", country: null, look_back: "none",
        outcome: "REFUSED", charge_micros: 0, result_count: 0, searched_at: "2026-10-30T08:00:01+00:00", content: null }],
    pages: [
      { page_id: TOP, search_id: SEARCH, rank: 1, read_depth: "whole", text_chars: 1200, text_digest: "ab".repeat(32),
        found_at: "2026-10-30T08:00:02+00:00", content: sealedEnvelope("top"), text_state: "STORED" },
      { page_id: OTHER, search_id: SEARCH, rank: 2, read_depth: "preview", text_chars: null, text_digest: null,
        found_at: "2026-10-30T08:00:03+00:00", content: sealedEnvelope("other"), text_state: "WIPED" }],
    readings: [
      { reading_id: READ_1, page_id: TOP, reader: 1, maker: "anthropic", outcome: "READ", grade: 3, read_at: "2026-10-30T08:01:00+00:00",
        content: sealedEnvelope("line") },
      { reading_id: FAILED_2, page_id: TOP, reader: 2, maker: "deepseek", outcome: "FAILED", grade: null, read_at: "2026-10-30T08:01:01+00:00",
        content: null }],
    extracts: [{ extract_id: EXTRACT, page_id: TOP, path_ref: "pos-1", label: "S1-1", found_by: [1, 2],
      created_at: "2026-10-30T08:02:00+00:00", content: sealedEnvelope("quote") }],
    picks: [{ path_ref: "pos-1", rank: 1, page_id: TOP }],
    packs: [{ pack_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", path_ref: "pos-1", extract_labels: ["S1-1"],
      created_at: "2026-10-30T08:03:00+00:00", content: sealedEnvelope("pack") }],
    researched: [{ page_id: OTHER, path_ref: "pos-1", chosen_at: "2026-10-30T09:00:00+00:00", outcome: "ADDS",
      settled_at: "2026-10-30T09:01:00+00:00" }]
  } }];
}

function rawRows() {
  const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map(section => [section, []]));
  raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null,
    phone_source: null, phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z",
    adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
  raw.registration_region = null;
  raw.recovery_codes = null;
  raw.page_reading_level = null;
  raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map(key => [key, []]));
  raw.web_evidence = webEvidence();
  raw.investigations = [{ investigation_id: INVESTIGATION, root_run_id: RUN, state: "closed", opened_at: "2026-10-30T07:00:00+00:00",
    last_activity_at: "2026-10-30T09:30:00+00:00", closed_at: "2026-10-30T09:30:00+00:00", report_version: 1, owner_ref: "secret-owner",
    members: [
      { run_id: RUN, parent_run_id: null, places: [], mode: null, joined_at: "2026-10-30T07:00:00+00:00" },
      { run_id: DIG, parent_run_id: RUN, places: ["pos-1"], mode: "quick", joined_at: "2026-10-30T07:30:00+00:00" }],
    closings: [{ report_version: 1, closed_at: "2026-10-30T09:30:00+00:00", reopened_at: null, report_ref: REPORT,
      report_written_at: "2026-10-30T09:35:00+00:00" }] }];
  raw.reserve_events = [
    { event_no: 1, kind: "HELD", amount_micros: 200000, investigation_id: null, report_version: null, blocked_window: null,
      blocked_until: null, recorded_at: "2026-10-30T07:00:00+00:00" },
    { event_no: 2, kind: "USED", amount_micros: 200000, investigation_id: INVESTIGATION, report_version: 1, blocked_window: null,
      blocked_until: null, recorded_at: "2026-10-30T09:30:00+00:00" },
    { event_no: 3, kind: "BLOCKED", amount_micros: null, investigation_id: null, report_version: null, blocked_window: "month",
      blocked_until: "2026-11-01T02:00:00+02:00", recorded_at: "2026-10-30T09:30:01+00:00" }];
  return raw;
}

function harness(raw = rawRows()) {
  const ownerView = { runKeyPresent: vi.fn(async () => true), runRemovedByCheck: vi.fn(async () => false) };
  const openRunContent = vi.fn(async (_run: string, items: readonly RunContentItem[]): Promise<readonly unknown[] | null> =>
    items.map(item => ({ opened: `${item.carrier}:${item.primaryKey}` })));
  const collect = () => collectSnapshot({
    claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session",
      locale: "en", requestedAt: new Date("2026-10-30T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
    source: { readRaw: async () => raw as never }, ownerView: ownerView as never,
    decrypt: { openUserField: async () => "ada@example.test", openRecord: () => "", openSupport: async () => "", openRunContent },
    now: () => new Date("2026-10-30T11:00:00.000Z")
  });
  return { raw, ownerView, openRunContent, collect };
}

const opened = (carrier: string, id: string) => ({ opened: `${carrier}:${id}` });

describe("web sources, investigations and the reserve in the data export", () => {
  it("opens the search words, each page's about, the readers' lines and the quotes under the run's key; never a page text", async () => {
    const h = harness();
    await h.collect();
    expect(h.openRunContent).toHaveBeenCalledTimes(1);
    expect(h.openRunContent.mock.calls[0]![0]).toBe(RUN);
    expect(h.openRunContent.mock.calls[0]![1].map(item => [item.carrier, item.primaryKey])).toEqual([
      ["identity.web_search", SEARCH], ["identity.web_page", TOP], ["identity.web_page", OTHER],
      ["identity.web_reading", READ_1], ["identity.web_extract", EXTRACT]]);
    expect(h.openRunContent.mock.calls[0]![1][0]!.envelope).toEqual(sealedEnvelope("search"));
    expect(JSON.stringify(h.openRunContent.mock.calls)).not.toContain("web_page_text");
    expect(JSON.stringify(h.openRunContent.mock.calls)).not.toContain("ct-pack");
  });

  it("puts each debate's web sources in debates.json under archive names, with UTC times and no internal value", async () => {
    const snapshot = await harness().collect();
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const text = archive.find(entry => entry.name === "debates.json")!.bytes.toString("utf8");
    const debates = JSON.parse(text);
    expect(debates.web_sources).toEqual([{
      debate_reference: RUN, content_status: "READABLE",
      searches: [
        { search_id: SEARCH, path_ref: "pos-1", side: "for", language_kind: "local", language: "ro", country: "RO", look_back: "12m",
          outcome: "FOUND", result_count: 2, searched_at: "2026-10-30T08:00:00.500Z", words: opened("identity.web_search", SEARCH) },
        { search_id: REFUSED, path_ref: "pos-1", side: "against", language_kind: "english", language: "en", country: null, look_back: "none",
          outcome: "REFUSED", result_count: 0, searched_at: "2026-10-30T08:00:01.000Z", words: null }],
      pages: [
        { page_id: TOP, search_id: SEARCH, path_ref: "pos-1", rank: 1, top_rank: 1, read_depth: "whole", text_state: "STORED",
          found_at: "2026-10-30T08:00:02.000Z", about: opened("identity.web_page", TOP) },
        { page_id: OTHER, search_id: SEARCH, path_ref: "pos-1", rank: 2, top_rank: null, read_depth: "preview", text_state: "WIPED",
          found_at: "2026-10-30T08:00:03.000Z", about: opened("identity.web_page", OTHER) }],
      readings: [
        { reading_id: READ_1, page_id: TOP, reader: 1, maker: "anthropic", outcome: "READ", grade: 3, read_at: "2026-10-30T08:01:00.000Z",
          line: opened("identity.web_reading", READ_1) },
        { reading_id: FAILED_2, page_id: TOP, reader: 2, maker: "deepseek", outcome: "FAILED", grade: null, read_at: "2026-10-30T08:01:01.000Z",
          line: null }],
      quotes: [{ extract_id: EXTRACT, page_id: TOP, path_ref: "pos-1", label: "S1-1", found_by: [1, 2],
        created_at: "2026-10-30T08:02:00.000Z", quote: opened("identity.web_extract", EXTRACT) }],
      added_to_researched: [{ page_id: OTHER, path_ref: "pos-1", chosen_at: "2026-10-30T09:00:00.000Z", outcome: "ADDS",
        settled_at: "2026-10-30T09:01:00.000Z" }]
    }]);
    // The search charge (C5), the keyed text digest, the pack and every envelope stay out (README W2).
    for (const internal of ["charge_micros", "text_digest", "text_chars", "pack", "ct-", "nonce", '"run_id"', '"content"'])
      expect(text, internal).not.toContain(internal);
  });

  it("exports a debate whose key is gone, or whose content a check removed, as UNRECOVERABLE without opening anything", async () => {
    for (const fault of ["key", "removed", "tombstone"] as const) {
      const h = harness();
      if (fault === "key") h.ownerView.runKeyPresent.mockResolvedValue(false);
      if (fault === "removed") h.ownerView.runRemovedByCheck.mockResolvedValue(true);
      if (fault === "tombstone") h.raw.erasure_tombstones = [{ run_id: RUN, completed_at: "2026-10-30T10:00:00.000Z" }];
      const [entry] = (await h.collect()).debates.web_sources;
      expect(h.openRunContent, fault).not.toHaveBeenCalled();
      expect(entry, fault).toMatchObject({ debate_reference: RUN, content_status: "UNRECOVERABLE" });
      expect([...entry!.searches.map(item => item.words), ...entry!.pages.map(item => item.about),
        ...entry!.readings.map(item => item.line), ...entry!.quotes.map(item => item.quote)], fault).toEqual([null, null, null, null, null, null, null]);
      expect(entry!.pages.map(item => item.page_id), fault).toEqual([TOP, OTHER]);
    }
  });

  it("exports a debate erased while its envelopes were opened as UNRECOVERABLE, and refuses an opener that answers short", async () => {
    const erased = harness();
    erased.openRunContent.mockResolvedValue(null);
    expect((await erased.collect()).debates.web_sources[0]).toMatchObject({ content_status: "UNRECOVERABLE" });
    const short = harness();
    short.openRunContent.mockResolvedValue([{}]);
    await expect(short.collect()).rejects.toMatchObject({ code: "DATA_EXPORT_DECRYPT_FAILED" });
  });

  it("puts the investigations (members, report versions) and the reserve events in account.json under archive names", async () => {
    const snapshot = await harness().collect();
    const archive = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip);
    const text = archive.find(entry => entry.name === "account.json")!.bytes.toString("utf8");
    const account = JSON.parse(text);
    expect(account.investigations).toEqual([{ investigation_id: INVESTIGATION, root_debate_reference: RUN, state: "closed",
      opened_at: "2026-10-30T07:00:00.000Z", last_activity_at: "2026-10-30T09:30:00.000Z", closed_at: "2026-10-30T09:30:00.000Z",
      report_version: 1,
      members: [
        { debate_reference: RUN, dug_from_reference: null, places: [], mode: null, joined_at: "2026-10-30T07:00:00.000Z" },
        { debate_reference: DIG, dug_from_reference: RUN, places: ["pos-1"], mode: "quick", joined_at: "2026-10-30T07:30:00.000Z" }],
      report_versions: [{ report_version: 1, closed_at: "2026-10-30T09:30:00.000Z", reopened_at: null, report_reference: REPORT,
        report_written_at: "2026-10-30T09:35:00.000Z" }] }]);
    expect(account.reserve_events).toEqual([
      { event_no: 1, kind: "HELD", amount_micros: 200000, investigation_id: null, report_version: null, blocked_window: null,
        blocked_until: null, recorded_at: "2026-10-30T07:00:00.000Z" },
      { event_no: 2, kind: "USED", amount_micros: 200000, investigation_id: INVESTIGATION, report_version: 1, blocked_window: null,
        blocked_until: null, recorded_at: "2026-10-30T09:30:00.000Z" },
      { event_no: 3, kind: "BLOCKED", amount_micros: null, investigation_id: null, report_version: null, blocked_window: "month",
        blocked_until: "2026-11-01T00:00:00.000Z", recorded_at: "2026-10-30T09:30:01.000Z" }]);
    expect(text).not.toContain("secret-owner");
    expect(text).not.toContain('"run_id"');
  });

  it("reads an account with no web step and no investigation as empty lists, opening nothing", async () => {
    const raw = rawRows();
    raw.web_evidence = [];
    raw.investigations = [];
    raw.reserve_events = [];
    const h = harness(raw);
    const snapshot = await h.collect();
    expect([snapshot.debates.web_sources, snapshot.account.investigations, snapshot.account.reserve_events]).toEqual([[], [], []]);
    expect(h.openRunContent).not.toHaveBeenCalled();
  });

  it("refuses a raw source that lacks one of the three sections, or a web step missing one of its lists", async () => {
    for (const section of ["web_evidence", "investigations", "reserve_events"]) {
      const raw = rawRows();
      delete raw[section];
      await expect(harness(raw).collect(), section).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    }
    const raw = rawRows();
    delete (raw.web_evidence as { web: Record<string, unknown> }[])[0]!.web.researched;
    await expect(harness(raw).collect()).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
  });

  it("reads the three sections through 0132's and 0133's readers, beside the snapshot, the kept questions and the page memory", async () => {
    const seen: string[] = [];
    const pool = { query: async (sql: string) => {
      seen.push(sql);
      return { rows: [{ snapshot: { user: {} }, threat_reports: [], page_memory: { page_reading_level: null, debate_visits: [], dig_links: [] },
        web_evidence: [{ run_id: RUN, web: {} }], investigations: { investigations: [{ investigation_id: INVESTIGATION }], reserve_events: [] } }] };
    } };
    const raw = await new PostgresDataExportSource(pool as never).readRaw("export", "worker");
    expect(seen[0]).toContain("identity.read_data_export_web_evidence($1,$2) web_evidence");
    expect(seen[0]).toContain("identity.read_data_export_investigations($1,$2) investigations");
    expect(raw).toMatchObject({ web_evidence: [{ run_id: RUN, web: {} }], investigations: [{ investigation_id: INVESTIGATION }], reserve_events: [] });
    // A reader answering without a member leaves the section missing, so the snapshot refuses the export.
    const bare = { query: async () => ({ rows: [{ snapshot: {}, threat_reports: [], page_memory: {}, web_evidence: [], investigations: {} }] }) };
    const partial = await new PostgresDataExportSource(bare as never).readRaw("export", "worker");
    expect(Object.hasOwn(partial, "investigations")).toBe(false);
    expect(Object.hasOwn(partial, "reserve_events")).toBe(false);
  });

  it("names the new records and the page-text choice in the README", () => {
    const readme = renderReadme();
    expect(readme).toContain("account.json — account, channels, region, age checks, erasure requests, kept questions, reading level, "
      + "debate visits, dig links, investigations and reserve events.");
    expect(readme).toContain("debates.json — owned debates, their content status, answer versions, each debate's model rotation record "
      + "and its web sources: searches, pages found, readers' lines, short quotes and pages added to researched.");
    expect(README_EXCLUSION_LINES.filter(line => /^W\d:/.test(line))).toEqual([
      "W1: Web page texts are excluded because they are other people's published pages, kept only for the AIs to read and "
        + "deleted at the latest 30 days after the last activity; each page's link, site, title, date and read depth, its short "
        + "quotes and the readers' lines appear in debates.json, and its text_state says whether the text is still kept.",
      "W2: Search charges, keyed page-text digests and each path's quote pack are excluded: a charge is an internal cost record "
        + "(C5), a digest only checks a replay, and a pack repeats quotes that appear once in debates.json."]);
  });
});
