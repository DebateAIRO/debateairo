/**
 * V4 start step, Task 8 (spec 2026-11-03 §4.3; owner 30 Oct: every web path gets all its searches): web receipt v2, kind
 * PATHS. Every chosen path is a pack of its own, counted as a debate's start counts one path: its own planner call, up
 * to 4 searches on a Quick look (8 Thorough), reader 1's batches, one pick and readers 2 and 3 on its top pages. The
 * debate's searches are paths x 4 (x 8). Results per search: 10 at a debate's start, 5 for a dig. Every path's arguing
 * reads every chosen path's pages (`packReadsPerCall`). v1 receipts (START, DIG) do not change.
 */
import { describe, expect, it } from "vitest";
import {
  WEB_PATHS_KIND_MAX, webModelCalls, webReceipt, webReceiptAnySchema, webReceiptSchema, webReceiptV2Schema, webReceiptV3Schema, webSearchCapForPaths,
  webSitesOf, webSitesOfReceipt, type WebSiteInput
} from "@debateai/register";

describe("web receipt v2: every chosen path its own pack and searches", () => {
  it("caps a path debate's searches at paths x 4 (Quick) or x 8 (Thorough), for 1 to 8 paths", () => {
    expect(WEB_PATHS_KIND_MAX).toBe(8);
    expect([webSearchCapForPaths(5, "QUICK"), webSearchCapForPaths(7, "THOROUGH"), webSearchCapForPaths(8, "THOROUGH")]).toEqual([20, 56, 64]);
    for (const bad of [0, 9, 2.5]) expect(() => webSearchCapForPaths(bad, "QUICK")).toThrow(expect.objectContaining({ code: "WEB_SITES_INVALID" }));
  });

  it("counts each path as a debate's start counts one path", () => {
    const quick = webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" });
    expect(quick).toMatchObject({ kind: "PATHS", origin: "START", packs: 5, plannerCalls: 5, searchesPerPack: 4, searches: 20,
      resultsPerSearch: 10, readerOneCalls: 45, pickCalls: 5, topReaderCalls: 10, topCount: 3, packReadsPerCall: 5 });
    // Task 91k: 9 reader-1 calls a path (7 batches and 2 re-sends).
    expect(webModelCalls(quick)).toBe(65);
    expect(webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 3, origin: "DIG" }).resultsPerSearch).toBe(5);
    expect(webSitesOf({ kind: "PATHS", depth: "THOROUGH", paths: 7, origin: "START" })).toMatchObject({ searchesPerPack: 8, searches: 56, topCount: 5 });
  });

  it("refuses a path part without its origin, more than 8 paths, dig picks, and an origin on START or DIG", () => {
    for (const input of [
      { kind: "PATHS", depth: "QUICK", paths: 5 },
      { kind: "PATHS", depth: "QUICK", paths: 9, origin: "START" },
      { kind: "PATHS", depth: "QUICK", paths: 3, digPicks: 3, origin: "DIG" },
      { kind: "START", depth: "QUICK", paths: 5, origin: "START" },
      { kind: "DIG", depth: "QUICK", digPicks: 2, origin: "DIG" }
    ] as unknown as readonly WebSiteInput[]) {
      expect(() => webSitesOf(input), JSON.stringify(input)).toThrow(expect.objectContaining({ code: "WEB_SITES_INVALID" }));
    }
  });

  // Task 91k: a path debate now mints version 3 (below); a version-2 receipt minted before is still read, at its own counts.
  it("reads a strict v2 receipt back to the same counts, and keeps START and DIG on v1", () => {
    const quick = webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START", readerOneResendCallsPerPack: 0 });
    const v2 = Object.fromEntries(Object.entries({ ...webReceipt(quick, 3), version: 2 }).filter(([key]) => key !== "reader_one_resend_per_pack"));
    expect(v2).toMatchObject({ version: 2, kind: "PATHS", origin: "START", packs: 5, searches: 20,
      pack_reads_per_call: 5, sites: { planner: 5, reader_one: 35, added_model_attempts: 165 } });
    expect(webSitesOfReceipt(webReceiptV2Schema.parse(v2))).toEqual(quick);
    expect(webReceiptSchema.safeParse(v2).success).toBe(false);
    expect(webReceiptV2Schema.safeParse(v2).success).toBe(true);
    expect(webReceiptV2Schema.safeParse({ ...v2, pack_reads_per_call: 4 }).success).toBe(false);
    expect(webReceiptV2Schema.safeParse({ ...v2, searches: 16 }).success).toBe(false);
    expect(webReceiptAnySchema.safeParse(v2).success).toBe(true);
    expect(webReceiptAnySchema.safeParse({ ...v2, version: 4 }).success).toBe(false);
  });
});

/**
 * Task 91k (owner 9 Nov, "Reserve 9 calls per path"): every web pack reserves two more reader-1 calls, so a batch cut off
 * at its output room is almost always read again in full. Uniform: Quick 7 -> 9, Thorough 14 -> 16, each dig pick and
 * each path-debate pack +2. A debate already started keeps its own reserve: receipts version 1 and 2 read back at 0 re-sends.
 */
describe("Task 91k: two more reader-1 calls per pack, on a receipt of its own (version 3)", () => {
  // Made-up receipts of the two older versions, as a debate started before the rise holds them.
  const V1_START = Object.freeze({ version: 1, kind: "START", depth: "QUICK", packs: 5, searches_per_pack: 4, searches: 20, results_per_search: 10,
    page_token_cap: 21_000, search_token_cap: 100_000, reader_batch_tokens: 80_000, top_count: 3,
    sites: { planner: 1, reader_one: 35, pick: 5, top_readers: 10, added_model_attempts: 153 } });
  const V1_DIG = Object.freeze({ version: 1, kind: "DIG", depth: "THOROUGH", packs: 3, searches_per_pack: 4, searches: 12, results_per_search: 5,
    page_token_cap: 21_000, search_token_cap: 100_000, reader_batch_tokens: 80_000, top_count: 5,
    sites: { planner: 3, reader_one: 21, pick: 3, top_readers: 6, added_model_attempts: 99 } });
  const V2_PATHS = Object.freeze({ version: 2, kind: "PATHS", origin: "START", depth: "QUICK", packs: 5, searches_per_pack: 4, searches: 20,
    results_per_search: 10, page_token_cap: 21_000, search_token_cap: 100_000, reader_batch_tokens: 80_000, top_count: 3, pack_reads_per_call: 5,
    sites: { planner: 5, reader_one: 35, pick: 5, top_readers: 10, added_model_attempts: 165 } });

  it("counts 2 re-sends on top of the batches, per pack, for every kind", () => {
    const quick = webSitesOf({ kind: "START", depth: "QUICK", paths: 5 });
    expect(quick).toMatchObject({ readerOneBatchesPerPack: 7, readerOneResendCallsPerPack: 2, readerOneCallsPerPack: 9, readerOneCalls: 45 });
    expect(webSitesOf({ kind: "START", depth: "THOROUGH", paths: 5 })).toMatchObject({ readerOneBatchesPerPack: 14, readerOneCallsPerPack: 16, readerOneCalls: 80 });
    expect(webSitesOf({ kind: "DIG", depth: "QUICK", digPicks: 3 })).toMatchObject({ readerOneCallsPerPack: 9, readerOneCalls: 27 });
    expect(webSitesOf({ kind: "PATHS", depth: "THOROUGH", paths: 2, origin: "DIG" })).toMatchObject({ readerOneCallsPerPack: 16, readerOneCalls: 32 });
    // Nothing else moves: the same part at 0 re-sends differs only in reader 1's calls.
    for (const input of [{ kind: "START", depth: "QUICK", paths: 5 }, { kind: "DIG", depth: "THOROUGH", digPicks: 16 },
      { kind: "PATHS", depth: "QUICK", paths: 8, origin: "START" }] as const) {
      const now = webSitesOf(input) as Record<string, unknown>;
      const before = webSitesOf({ ...input, readerOneResendCallsPerPack: 0 }) as Record<string, unknown>;
      const { readerOneResendCallsPerPack, readerOneCallsPerPack, readerOneCalls, ...rest } = now;
      const { readerOneResendCallsPerPack: beforeResend, readerOneCallsPerPack: beforePerPack, readerOneCalls: beforeCalls, ...beforeRest } = before;
      expect(rest).toEqual(beforeRest);
      expect([readerOneResendCallsPerPack, beforeResend]).toEqual([2, 0]);
      expect(readerOneCallsPerPack).toBe((beforePerPack as number) + 2);
      expect(readerOneCalls).toBe((beforeCalls as number) + 2 * (now.packs as number));
    }
    for (const bad of [-1, 9, 1.5]) {
      expect(() => webSitesOf({ kind: "START", depth: "QUICK", paths: 5, readerOneResendCallsPerPack: bad }))
        .toThrow(expect.objectContaining({ code: "WEB_SITES_INVALID" }));
    }
  });

  it("a debate already started keeps its own reserve: v1 and v2 receipts read back at 7 a pack, and cannot claim the new count", () => {
    for (const old of [V1_START, V1_DIG, V2_PATHS]) {
      const parsed = webReceiptAnySchema.safeParse(old);
      expect(parsed.success, JSON.stringify(old)).toBe(true);
      expect(webSitesOfReceipt(parsed.data!)).toMatchObject({ readerOneBatchesPerPack: 7, readerOneResendCallsPerPack: 0, readerOneCallsPerPack: 7 });
    }
    expect(webReceiptSchema.safeParse({ ...V1_START, sites: { ...V1_START.sites, reader_one: 45 } }).success).toBe(false);
    expect(webReceiptV2Schema.safeParse({ ...V2_PATHS, sites: { ...V2_PATHS.sites, reader_one: 45 } }).success).toBe(false);
  });

  it("mints version 3 for every kind, naming its re-sends, and reads it back to the same counts", () => {
    const parts = [webSitesOf({ kind: "START", depth: "QUICK", paths: 5 }), webSitesOf({ kind: "DIG", depth: "THOROUGH", digPicks: 3 }),
      webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" })];
    for (const sites of parts) {
      const receipt = webReceipt(sites, 3);
      expect(receipt).toMatchObject({ version: 3, kind: sites.kind, reader_one_resend_per_pack: 2,
        sites: { reader_one: sites.readerOneCalls, added_model_attempts: webModelCalls(sites) * 3 } });
      expect(webReceiptV3Schema.safeParse(receipt).success).toBe(true);
      expect(webReceiptAnySchema.safeParse(receipt).success).toBe(true);
      expect(webReceiptSchema.safeParse(receipt).success).toBe(false);
      expect(webReceiptV2Schema.safeParse(receipt).success).toBe(false);
      expect(webSitesOfReceipt(receipt)).toEqual(sites);
    }
    expect(webReceipt(parts[0]!, 3)).toMatchObject({ packs: 5, sites: { planner: 1, reader_one: 45, pick: 5, top_readers: 10, added_model_attempts: 183 } });
    expect(Object.hasOwn(webReceipt(parts[0]!, 3), "origin")).toBe(false);
    expect(webReceipt(parts[2]!, 3)).toMatchObject({ origin: "START", pack_reads_per_call: 5, sites: { planner: 5, added_model_attempts: 195 } });
    // A version-3 receipt is held to its own re-sends: the count must agree, and only a path debate names an origin and its pack reads.
    const start = webReceipt(parts[0]!, 3) as Record<string, unknown>;
    const paths = webReceipt(parts[2]!, 3) as Record<string, unknown>;
    for (const tampered of [{ ...start, reader_one_resend_per_pack: 3 }, { ...start, reader_one_resend_per_pack: 0 },
      { ...start, origin: "START" }, { ...start, pack_reads_per_call: 5 }, { ...paths, origin: undefined }, { ...start, reader_one_resend_per_pack: 9 }]) {
      expect(webReceiptV3Schema.safeParse(tampered).success, JSON.stringify(tampered)).toBe(false);
    }
    // At 0 re-sends a version-3 receipt is as valid as an old one, and reads back at 7.
    const none = webReceipt(webSitesOf({ kind: "START", depth: "QUICK", paths: 5, readerOneResendCallsPerPack: 0 }), 3);
    expect(none).toMatchObject({ version: 3, reader_one_resend_per_pack: 0, sites: { reader_one: 35 } });
    expect(webSitesOfReceipt(none).readerOneCallsPerPack).toBe(7);
  });
});
