import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_MEMORY_LIMITS, ACCOUNT_READING_LEVELS, DigLinkRecordRequestSchema, DigLinksSchema, LastVisitRecordRequestSchema,
  LastVisitSchema, ReadingLevelStateSchema, VisitItemsSchema, contractInventory, visitItemsStoredBytes
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";
import { READING_LEVELS, DIG_MODES } from "../../apps/ui/lib/v4/types.js";

/**
 * V4 account memory (owner rulings N7 and N11): the contract's shapes, its limits held equal to 0131's own, and the six
 * client methods' requests.
 */
const sql = readFileSync(new URL("../../migrations/0131_v4_account_memory.sql", import.meta.url), "utf8");
const RUN = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";

describe("V4 account memory contract", () => {
  it("holds its limits and word lists equal to 0131's and to the V4 pages'", () => {
    expect(sql).toContain(`(SELECT count(*) FROM jsonb_each(p_items)) > ${ACCOUNT_MEMORY_LIMITS.visitItemsMax}`);
    expect(sql).toContain(`octet_length(p_items::text) > ${ACCOUNT_MEMORY_LIMITS.visitBodyMaxBytes}`);
    expect(sql).toContain(`octet_length(items::text) <= ${ACCOUNT_MEMORY_LIMITS.visitBodyMaxBytes}`);
    expect(sql).toContain(`cardinality(p_places) > ${ACCOUNT_MEMORY_LIMITS.digPlacesMax}`);
    expect(sql).toContain(`LIMIT ${ACCOUNT_MEMORY_LIMITS.digChildrenMax}) AS child`);
    expect(sql).toContain("'^(dig|path|open|point):[\\x21\\x23-\\x5b\\x5d-\\x7e]{1,150}$'");
    expect(sql).toContain("'^[A-Za-z_]{1,32}$'");
    expect(sql).toContain("'^[\\x21\\x23-\\x5b\\x5d-\\x7e]{1,160}$'");
    expect([...ACCOUNT_READING_LEVELS]).toEqual([...READING_LEVELS]);
    expect(sql).toContain(`reading_level IN (${READING_LEVELS.map((level) => `'${level}'`).join(",")})`);
    expect(sql).toContain(`mode IN (${DIG_MODES.map((mode) => `'${mode}'`).join(",")})`);
  });

  it("computes the size PostgreSQL stores a snapshot at", () => {
    expect(visitItemsStoredBytes({})).toBe("{}".length);
    expect(visitItemsStoredBytes({ "point:n-1": "SURE" })).toBe('{"point:n-1": "SURE"}'.length);
    expect(visitItemsStoredBytes({ "point:n-1": "SURE", "path:p": "FELL" })).toBe('{"point:n-1": "SURE", "path:p": "FELL"}'.length);
  });

  it("accepts map ids and state words only, within the limits", () => {
    expect(VisitItemsSchema.safeParse({ "dig:22222222-2222-4222-8222-222222222222": "DONE", "path:pos#2": "HELD_UP", "open:p:n-1": "dug", "point:n-1": "SURE_FOR_CASE" }).success).toBe(true);
    for (const items of [{ "line:n-1": "SURE" }, { "point:": "SURE" }, { "point:a b": "SURE" }, { 'point:a"b': "SURE" }, { "point:a\\b": "SURE" },
      { "point:café": "SURE" }, { "point:n-1": "two words" }, { "point:n-1": "" }]) {
      expect(VisitItemsSchema.safeParse(items).success, JSON.stringify(items)).toBe(false);
    }
    expect(VisitItemsSchema.safeParse(Object.fromEntries(Array.from({ length: 512 }, (_, at) => [`point:${at}`, "SURE"]))).success).toBe(true);
    expect(VisitItemsSchema.safeParse(Object.fromEntries(Array.from({ length: 513 }, (_, at) => [`point:${at}`, "SURE"]))).success).toBe(false);
    expect(LastVisitSchema.safeParse({ seen_at: null, items: null }).success).toBe(true);
    expect(LastVisitSchema.safeParse({ seen_at: null, items: {} }).success).toBe(false);
    expect(LastVisitSchema.safeParse({ seen_at: "2026-10-29T08:00:00.000Z", items: {} }).success).toBe(true);
    expect(LastVisitRecordRequestSchema.safeParse({ items: {}, run_id: RUN }).success).toBe(false);
    expect(ReadingLevelStateSchema.safeParse({ reading_level: null }).success).toBe(true);
    expect(ReadingLevelStateSchema.safeParse({ reading_level: "loud" }).success).toBe(false);
    expect(DigLinkRecordRequestSchema.safeParse({ child_run_id: CHILD, places: ["p:n-1", "w", "path:pos#2"], mode: "quick" }).success).toBe(true);
    expect(DigLinkRecordRequestSchema.safeParse({ child_run_id: CHILD, places: [], mode: "quick", question_line: "text" }).success).toBe(false);
    expect(DigLinksSchema.safeParse({ parent: null, children: [] }).success).toBe(true);
  });

  it("lists its six routes in the contract inventory", () => {
    for (const route of ["GET /v1/account/reading-level", "POST /v1/account/reading-level", "GET /v1/runs/{id}/last-visit",
      "POST /v1/runs/{id}/last-visit", "GET /v1/runs/{id}/dig-links", "POST /v1/runs/{id}/dig-links"]) {
      expect(contractInventory.routes, route).toContain(route);
    }
    for (const name of ["ReadingLevelStateSchema", "ReadingLevelSaveRequestSchema", "LastVisitSchema", "LastVisitRecordRequestSchema",
      "LastVisitRecordedSchema", "DigLinkRecordSchema", "DigLinksSchema", "DigLinkRecordRequestSchema", "DigLinkRecordedSchema"]) {
      expect(Object.keys(contractInventory.resources), name).toContain(name);
    }
  });

  it("sends each client method to its route, with the CSRF header on writes", async () => {
    const seen: Array<{ url: string; method: string; body: unknown; csrf: string | null }> = [];
    const answers: Record<string, unknown> = {
      "GET /v1/account/reading-level": { reading_level: null },
      "POST /v1/account/reading-level": { reading_level: "plain" },
      [`GET /v1/runs/${RUN}/last-visit`]: { seen_at: null, items: null },
      [`POST /v1/runs/${RUN}/last-visit`]: { seen_at: "2026-10-29T08:00:00.000Z" },
      [`GET /v1/runs/${RUN}/dig-links`]: { parent: null, children: [] },
      [`POST /v1/runs/${RUN}/dig-links`]: { recorded: true }
    };
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      seen.push({ url: url.pathname, method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)), csrf: headers.get("x-csrf-token") });
      return new Response(JSON.stringify(answers[`${method} ${url.pathname}`]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const client = createContractClient("https://contract.example", fetchMock, { mode: "cookie", csrfToken: () => "csrf-1" });
    expect(await client.readReadingLevel()).toEqual({ reading_level: null });
    expect(await client.saveReadingLevel("plain")).toEqual({ reading_level: "plain" });
    expect(await client.readLastVisit(RUN)).toEqual({ seen_at: null, items: null });
    expect(await client.recordLastVisit(RUN, { "point:n-1": "SURE" })).toEqual({ seen_at: "2026-10-29T08:00:00.000Z" });
    expect(await client.readDigLinks(RUN)).toEqual({ parent: null, children: [] });
    expect(await client.recordDigLink(RUN, { child_run_id: CHILD, places: ["w"], mode: "thorough" })).toEqual({ recorded: true });
    expect(seen).toEqual([
      { url: "/v1/account/reading-level", method: "GET", body: undefined, csrf: null },
      { url: "/v1/account/reading-level", method: "POST", body: { reading_level: "plain" }, csrf: "csrf-1" },
      { url: `/v1/runs/${RUN}/last-visit`, method: "GET", body: undefined, csrf: null },
      { url: `/v1/runs/${RUN}/last-visit`, method: "POST", body: { items: { "point:n-1": "SURE" } }, csrf: "csrf-1" },
      { url: `/v1/runs/${RUN}/dig-links`, method: "GET", body: undefined, csrf: null },
      { url: `/v1/runs/${RUN}/dig-links`, method: "POST", body: { child_run_id: CHILD, places: ["w"], mode: "thorough" }, csrf: "csrf-1" }
    ]);
    // A body outside the contract is refused in the client, before anything is sent (it parses as it builds the request).
    expect(() => client.recordLastVisit(RUN, { "line:n-1": "SURE" })).toThrow();
    expect(seen).toHaveLength(6);
  });
});
