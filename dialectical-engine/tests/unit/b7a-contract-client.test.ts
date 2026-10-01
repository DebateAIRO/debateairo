import { describe, expect, it } from "vitest";
import { createContractClient } from "@debateai/contract";

describe("B7a contract client: the room read and the usage read", () => {
  it("asks for the room with the ask's settings as query parameters, and parses the word", async () => {
    const calls: Array<{ path: string; search: string; method: string }> = [];
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push({ path: url.pathname, search: url.search, method: init?.method ?? "GET" });
      return url.pathname === "/v1/asks/room"
        ? Response.json({ room: "CLOSE", scope: "SITE_DAY", resets_at: "2026-10-01T00:00:00.000Z", waiting_run_ref: null, plan_id: null })
        : Response.json({ plan_id: "PLUS", windows: [{ scope: "PERSON_DAY", percent: 40, resets_at: "2026-10-01T09:00:00.000Z" }] });
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", fetchImplementation);
    await expect(client.getAskRoom({ plan_tier: "premium", composition_budget_tier: "medium", depth: 2 }))
      .resolves.toMatchObject({ room: "CLOSE", scope: "SITE_DAY" });
    await expect(client.getBillingUsage()).resolves.toMatchObject({ plan_id: "PLUS" });
    expect(calls).toEqual([
      { path: "/v1/asks/room", search: "?plan_tier=premium&composition_budget_tier=medium&depth=2", method: "GET" },
      { path: "/v1/billing/usage", search: "", method: "GET" }
    ]);
  });

  it("refuses an answer that carries a figure", async () => {
    const fetchImplementation = (async () => Response.json({
      room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, estimate_micros: 123
    })) as unknown as typeof fetch;
    const client = createContractClient("https://api.debateai.test", fetchImplementation);
    await expect(client.getAskRoom({ plan_tier: "free", composition_budget_tier: "low", depth: 1 }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
