/**
 * V4 start step, Task 8 (spec 2026-11-03 §4.3; owner 30 Oct: every web path gets all its searches): web receipt v2, kind
 * PATHS. Every chosen path is a pack of its own, counted as a debate's start counts one path: its own planner call, up
 * to 4 searches on a Quick look (8 Thorough), reader 1's batches, one pick and readers 2 and 3 on its top pages. The
 * debate's searches are paths x 4 (x 8). Results per search: 10 at a debate's start, 5 for a dig. Every path's arguing
 * reads every chosen path's pages (`packReadsPerCall`). v1 receipts (START, DIG) do not change.
 */
import { describe, expect, it } from "vitest";
import {
  WEB_PATHS_KIND_MAX, webModelCalls, webReceipt, webReceiptAnySchema, webReceiptSchema, webReceiptV2Schema, webSearchCapForPaths,
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
      resultsPerSearch: 10, readerOneCalls: 35, pickCalls: 5, topReaderCalls: 10, topCount: 3, packReadsPerCall: 5 });
    expect(webModelCalls(quick)).toBe(55);
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

  it("mints a strict v2 receipt that reads back to the same counts, and keeps START and DIG on v1", () => {
    const quick = webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" });
    expect(webReceipt(quick, 3)).toMatchObject({ version: 2, kind: "PATHS", origin: "START", packs: 5, searches: 20,
      pack_reads_per_call: 5, sites: { planner: 5, added_model_attempts: 165 } });
    expect(webSitesOfReceipt(webReceipt(quick, 3))).toEqual(quick);
    expect(webReceiptSchema.safeParse(webReceipt(quick, 3)).success).toBe(false);
    expect(webReceiptV2Schema.safeParse(webReceipt(quick, 3)).success).toBe(true);
    expect(webReceiptV2Schema.safeParse({ ...webReceipt(quick, 3), pack_reads_per_call: 4 }).success).toBe(false);
    expect(webReceiptV2Schema.safeParse({ ...webReceipt(quick, 3), searches: 16 }).success).toBe(false);
    const start = webReceipt(webSitesOf({ kind: "START", depth: "QUICK", paths: 5 }), 3);
    expect(start.version).toBe(1);
    expect(webReceiptAnySchema.safeParse(start).success).toBe(true);
    expect(webReceiptAnySchema.safeParse(webReceipt(quick, 3)).success).toBe(true);
    expect(webReceiptAnySchema.safeParse({ ...webReceipt(quick, 3), version: 3 }).success).toBe(false);
  });
});
