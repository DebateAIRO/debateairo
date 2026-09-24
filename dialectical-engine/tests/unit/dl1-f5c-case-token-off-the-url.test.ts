import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import {
  SUPPORT_ROUTE_PATHS, type SupportRoutePath
} from "../../apps/api/src/support/index.js";
import type { SupportCaseAccessPort } from "../../apps/api/src/support/cases.js";
import { supportHarness } from "../support/supportHarness.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * DL1-F5 (its S2 half) with DL3-F4. A case token is the sole capability to read
 * a whole support case — the reporter's own words, V's replies, the
 * model-written summary — and to reply as the reporter. It travelled in the
 * URL: in the API path `/v1/support/cases/<token>`, which lands in any access
 * log or proxy log, and in the `/help?case=<token>` link the API wrote into its
 * own acknowledgement sentence, which lands in the address bar, in browser
 * history and in every shared screenshot.
 *
 * The browser half was closed in `70002eb5`: the UI normalises every case link
 * to the fragment, which a browser never sends anywhere. This is the API half.
 * The token now travels in `x-support-case-token`, the two routes that took it
 * in the path are gone, and the acknowledgement sentence mints the fragment
 * form the UI was already rewriting it to.
 */
const TOKEN = "A".repeat(43);
const OTHER_TOKEN = "B".repeat(43);
const SOURCE = "203.0.113.5";

function fixtureAskApplication(): AskApplication {
  return {
    withContentLease: async (_runId: string, use: () => unknown) => use(),
    submit: async () => ({ run_ref: "00000000-0000-4000-8000-000000000000", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session: unknown, limit: number, offset: number) =>
      ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () =>
      ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () { return; }
  } as unknown as AskApplication;
}

function harness() {
  const support = supportHarness();
  const readByToken = vi.fn(async (tokenSha256: string) => tokenSha256 === "keyed:known"
    ? null
    : Object.freeze({
      kind: "READABLE" as const,
      caseId: "44444444-4444-4444-8444-444444444444",
      state: "NEW" as const, language: "en" as const, slaHours: 48, summary: null,
      messages: [], nextCursor: null
    }));
  const replyByToken = vi.fn(async () => "WAITING_ON_V" as const);
  const caseAccess = Object.freeze({
    listOwn: async () => [], readByToken, replyByToken
  }) as unknown as SupportCaseAccessPort;
  const api = buildApi({
    application: fixtureAskApplication(),
    support: { ...support.application, caseAccess },
    allowedOrigin: TEST_APP_ORIGIN
  });
  return Object.freeze({
    api, readByToken, replyByToken, close: async () => api.close()
  });
}

describe("DL1-F5c/DL3-F4 the case bearer never travels in a URL", () => {
  it("names no route whose path carries the token", () => {
    for (const route of SUPPORT_ROUTE_PATHS) {
      expect(route, route).not.toMatch(/\{token\}/u);
    }
    expect(SUPPORT_ROUTE_PATHS).toContain("GET /v1/support/case");
    expect(SUPPORT_ROUTE_PATHS).toContain("POST /v1/support/case/messages");
    // The authorization matrix governs exactly the routes that exist.
    const governed = authorizationPolicyInventory
      .map((row) => row.route)
      .filter((route) => route.includes("/v1/support/"));
    expect([...governed].sort())
      .toEqual([...SUPPORT_ROUTE_PATHS as readonly SupportRoutePath[]].sort());
  });

  it("reads a case from the header and answers the retired path with a 404", async () => {
    const h = harness();
    try {
      const read = await h.api.inject({
        method: "GET", url: "/v1/support/case", remoteAddress: SOURCE,
        headers: { "x-support-case-token": TOKEN }
      });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ kind: "READABLE" });
      expect(h.readByToken).toHaveBeenCalledTimes(1);

      // The retired shape is not a route any more: nothing can log the token.
      const retired = await h.api.inject({
        method: "GET", url: `/v1/support/cases/${TOKEN}`, remoteAddress: SOURCE
      });
      expect(retired.statusCode).toBe(404);
      expect(h.readByToken).toHaveBeenCalledTimes(1);
    } finally {
      await h.close();
    }
  });

  it("refuses a missing or malformed header with the unknown-token answer", async () => {
    const h = harness();
    try {
      for (const headers of [
        {}, { "x-support-case-token": "" }, { "x-support-case-token": "too-short" },
        { "x-support-case-token": `${TOKEN}a` }, { "x-support-case-token": `${TOKEN} ${OTHER_TOKEN}` }
      ]) {
        const read = await h.api.inject({
          method: "GET", url: "/v1/support/case", remoteAddress: SOURCE, headers
        });
        expect(read.statusCode, JSON.stringify(headers)).toBe(404);
      }
      expect(h.readByToken).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it("replies to a case from the header and answers the retired path with a 404", async () => {
    const h = harness();
    try {
      const replied = await h.api.inject({
        method: "POST", url: "/v1/support/case/messages", remoteAddress: SOURCE,
        headers: { origin: TEST_APP_ORIGIN, "x-support-case-token": TOKEN },
        payload: { text: "any news?" }
      });
      expect(replied.statusCode).toBe(200);
      expect(h.replyByToken).toHaveBeenCalledTimes(1);

      const retired = await h.api.inject({
        method: "POST", url: `/v1/support/cases/${TOKEN}/messages`, remoteAddress: SOURCE,
        headers: { origin: TEST_APP_ORIGIN }, payload: { text: "any news?" }
      });
      expect(retired.statusCode).toBe(404);
      expect(h.replyByToken).toHaveBeenCalledTimes(1);
    } finally {
      await h.close();
    }
  });

  it("mints the fragment form in every acknowledgement the API writes", async () => {
    const source = await readFile("apps/api/src/support/index.ts", "utf8");
    // No expression anywhere builds the retired query form (the string survives
    // in one comment, which is where the history belongs).
    expect(source).not.toMatch(/`\/help\?case=/u);
    // One builder, and all three acknowledgement sites go through it.
    expect(source.match(/\/help#case=/gu) ?? []).toHaveLength(1);
    expect(source.match(/supportCaseLink\(opened\.token\)/gu) ?? []).toHaveLength(3);
  });

  it("requires an admission bridge rather than defaulting to permissive", async () => {
    // Review round, item 7. `installSupportRoutes` defaulted `admit` to
    // `{ gate: () => true, charge: () => true }`. A security control whose
    // default is "allow" is one forgotten argument away from being absent, and
    // nothing would have failed to say so.
    const source = await readFile("apps/api/src/support/index.ts", "utf8");
    expect(source).not.toContain("admit: SupportAdmission = Object.freeze({");
    expect(source).toContain("  admit: SupportAdmission");
  });

  it("drops the tolerance for a link shape the server can no longer mint", async () => {
    // Review round, item 8. The widget accepted `body.link === "/help?case=…"`
    // from the API. The API mints only the fragment form now, so that branch
    // can never be taken: dead tolerance around a bearer is exactly the kind
    // that outlives the reason it was written.
    const source = await readFile("apps/ui/components/support/Assistant.tsx", "utf8");
    expect(source).not.toContain("body.link !== `/help?case=${body.case_token}`");
    // The browser-side read of a saved `?case=` link stays for one release.
    const reader = await readFile("apps/ui/components/support/caseLink.ts", "utf8");
    expect(reader).toContain('searchParams.get("case")');
  });

  it("carries the case bearer through the UI proxy's allowlist", async () => {
    const proxy = await readFile("apps/ui/app/api/[...path]/route.ts", "utf8");
    expect(proxy).toContain("x-support-case-token");
  });
});
