// Where the asks lock meets the payments lock: on the hosted preview a checkout or a plan upgrade, the two steps that
// create a charge and open NETOPIA's page, follow the buyer rule. Any signed-in account may buy only with real payments
// and asks open to everyone, or in the friends' test on the sandbox (everyone-with-test-payments). Everywhere else on the
// preview only an account on the team list may: under the team rule, and under everyone-with-listed-buyers, on the
// sandbox or with real payments, where anyone may ask but only the listed accounts may buy. Off the preview there is no
// rule. The price requests before the last button carry no rule, and neither does the card change. Under
// everyone-with-listed-buyers, with either payment system, an account not on the team list may also buy when the Owner's
// list of approved buyers (migration 0186) says so; the list is read for nobody else, and when it cannot be read the
// purchase is refused (503 PREVIEW_BUYERS_UNAVAILABLE) with nothing written.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import { parsePreviewProviderTestConfig, type PreviewAsksOpenTo } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CheckoutResult } from "../../apps/api/src/billing/checkout.js";
import type { BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { previewBuyerVerdict, PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE, type PreviewApprovedBuyers } from "../../apps/api/src/preview-approved-buyers.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const NOW = new Date("2026-11-19T10:00:00.000Z");
const PAIR = { version: "sha256-aaaaaaaaaaaa", sha256: "a".repeat(64) };
const QUOTE_BODY = { plan_id: "PLUS" };
const CHECKOUT_BODY = { quote_ref: "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2c4d", locale: "en", consents: { renewal_terms: PAIR, immediate_start: PAIR } };
const RESULT: CheckoutResult = { chargeId: "0123456789abcdef0123456789abcdef", redirectUrl: "https://secure.netopia-payments.com/ui/card?p=abc", environment: "live", reused: false };
const REFUSED = Object.freeze({ error: "PREVIEW_TEAM_ONLY", message: "PREVIEW_TEAM_ONLY" });
const UNAVAILABLE = Object.freeze({ error: "PREVIEW_BUYERS_UNAVAILABLE", message: "PREVIEW_BUYERS_UNAVAILABLE" });
/** What the quote service answers when a price request reaches it (QuoteResult, the fields the route reads). */
const QUOTE_REF = "11111111-1111-4111-8111-111111111111";
const QUOTED = Object.freeze({
  quote: {
    quoteId: QUOTE_REF, planId: "PLUS", netMicros: 20_000_000, taxMicros: 3_800_000, totalMicros: 23_800_000, currency: "EUR",
    taxName: "MwSt.", taxRateBasisPoints: 1900, taxCountry: "DE", taxRegion: null, taxStatus: "TAXABLE",
    expiresAt: new Date("2026-11-19T10:30:00.000Z")
  },
  declaredCountry: "DE", ipCountry: "DE", countryConfirmNeeded: false, addressRequired: false,
  renewsOn: new Date("2026-12-19T10:00:00.000Z"), withdrawalDays: 14
});

/** asks: the PREVIEW_ASKS_OPEN_TO value main.ts read, or undefined for the team rule. */
type Setup = Readonly<{ preview: boolean; payments: "sandbox" | "live"; asks: PreviewAsksOpenTo | undefined }>;
/** Whether the file can hold a team line, which lists the member: the parser refuses one beside these two values. */
const teamListed = (setup: Setup): boolean => setup.asks !== "everyone" && setup.asks !== "everyone-with-test-payments";

/** The Owner's list as main.ts hands it on the preview; by default it lists nobody. `null`: no list handed at all. */
function approvedList(answer: (userId: string) => Promise<boolean> = async () => false) {
  const listed = vi.fn(answer);
  return { listed } satisfies PreviewApprovedBuyers;
}
function harness(setup: Setup, member: TestHttpIdentity, stranger: TestHttpIdentity, approved: PreviewApprovedBuyers | null = approvedList()) {
  const checkout = { start: vi.fn(async () => RESULT) };
  const quotes = { create: vi.fn(async () => { throw new Error("QUOTE_SERVICE_REACHED"); }) };
  const decide = vi.fn(() => ({ allowed: true as const }));
  const billing: BillingRouteOptions = {
    plans: testBillingPlans, clock: () => NOW, legal: { requiresReacceptance: async () => false }, checkout,
    charges: { read: async () => null }, quotes,
    paymentEnvironment: setup.payments,
    // Only the gate is under test: a body the upgrade and the card change refuse as malformed shows the request got past it.
    subscription: {} as SubscriptionRouteDeps
  };
  const sessions = {
    ...testSessionApplication([member, stranger]),
    readAgeConfirmation(_session: AuthenticatedSession): Promise<"required" | "confirmed"> { return Promise.resolve("confirmed"); }
  };
  // As main.ts hands them: the team line as parsed (empty where the file cannot hold one), and with a value, the open flag
  // and the value itself.
  const team = teamListed(setup) ? [member.authenticated.userId] : [];
  const api = buildApi({
    application: unusedAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, billing,
    admission: { configured: () => true, decide } as unknown as AdmissionLimiter,
    ...(setup.preview ? { previewProviderTestConfig: PREVIEW, previewTeamUserIds: team } : {}),
    ...(setup.preview && setup.asks !== undefined ? { previewAsksOpen: true as const, previewAsksOpenTo: setup.asks } : {}),
    ...(setup.preview && approved !== null ? { previewApprovedBuyers: approved } : {})
  });
  return { api, checkout, quotes, decide };
}

const post = (api: ReturnType<typeof buildApi>, who: TestHttpIdentity, url: string, payload: unknown) => api.inject({
  method: "POST", url, headers: { ...testSessionHeaders(who, true), "content-type": "application/json" }, payload: JSON.stringify(payload)
});

/**
 * Whether the buyer rule refuses an account not on the team list, written out: only on the preview, and there unless
 * payments are real with asks open to everyone, or payments are the sandbox's in the friends' test.
 */
function refusesStranger(setup: Setup): boolean {
  if (!setup.preview) return false;
  if (setup.payments === "live" && setup.asks === "everyone") return false;
  if (setup.payments === "sandbox" && setup.asks === "everyone-with-test-payments") return false;
  return true;
}

const memberMayBuy = (setup: Setup): boolean => !refusesStranger(setup) || teamListed(setup);

const VALUES = [undefined, "everyone", "everyone-with-test-payments", "everyone-with-listed-buyers"] as const;
/** The pairings the API's boot admits on the preview; the others are refused at start (lock-asks-boot.test.ts). */
const BOOTS = (setup: Setup): boolean => !setup.preview || setup.asks === undefined || setup.asks === "everyone-with-listed-buyers"
  || (setup.payments === "live" ? setup.asks === "everyone" : setup.asks !== "everyone");
const label = (setup: Setup): string => `${setup.preview ? "preview" : "off the preview"}, ${setup.payments} payments${
  setup.preview ? `, ${setup.asks ?? "team rule"}` : ""}`;
const ALL: readonly Setup[] = [true, false].flatMap((preview) => (["sandbox", "live"] as const)
  .flatMap((payments) => (preview ? VALUES : [undefined]).map((asks) => Object.freeze({ preview, payments, asks }))));
const SETUPS = ALL.filter(BOOTS).map((setup) => [label(setup), setup] as const);
/** A pairing the boot refuses still answers closed if it were ever built: the team list only. */
const REFUSED_AT_BOOT = ALL.filter((setup) => !BOOTS(setup)).map((setup) => [label(setup), setup] as const);

describe("the cases, named", () => {
  it("are the three the owner meets on the sandbox, the three with real payments, and off the preview", () => {
    expect(SETUPS.map(([name]) => name)).toEqual([
      "preview, sandbox payments, team rule", "preview, sandbox payments, everyone-with-test-payments",
      "preview, sandbox payments, everyone-with-listed-buyers",
      "preview, live payments, team rule", "preview, live payments, everyone", "preview, live payments, everyone-with-listed-buyers",
      "off the preview, sandbox payments", "off the preview, live payments"
    ]);
    expect(REFUSED_AT_BOOT.map(([name]) => name)).toEqual([
      "preview, sandbox payments, everyone", "preview, live payments, everyone-with-test-payments"
    ]);
  });
});

describe("POST /v1/billing/checkout follows the buyer rule", () => {
  it.each([...SETUPS, ...REFUSED_AT_BOOT])("%s", async (_label, setup) => {
    const member = testHttpIdentity("buyer-rule-member"), stranger = testHttpIdentity("buyer-rule-stranger");
    const { api, checkout, decide } = harness(setup, member, stranger);
    try {
      const fromStranger = await post(api, stranger, "/v1/billing/checkout", CHECKOUT_BODY);
      if (refusesStranger(setup)) {
        expect([fromStranger.statusCode, fromStranger.json()]).toEqual([403, REFUSED]);
        // Refused before the checkout budget, the age and legal checks and the payment page: the checkout service, the
        // only writer of a charge row, is never called.
        expect(decide).not.toHaveBeenCalled();
        expect(checkout.start).not.toHaveBeenCalled();
      } else {
        expect(fromStranger.statusCode).toBe(200);
        expect(checkout.start).toHaveBeenCalledTimes(1);
      }
      // An account on the team list may always buy. Where the file can hold no team line and the rule still refuses (a
      // pairing the boot refuses), nobody may.
      expect((await post(api, member, "/v1/billing/checkout", CHECKOUT_BODY)).statusCode).toBe(memberMayBuy(setup) ? 200 : 403);
    } finally {
      await api.close();
    }
  });
});

describe("POST /v1/billing/subscription/upgrade follows the same rule", () => {
  it.each([...SETUPS, ...REFUSED_AT_BOOT])("%s", async (_label, setup) => {
    const member = testHttpIdentity("upgrade-rule-member"), stranger = testHttpIdentity("upgrade-rule-stranger");
    const { api } = harness(setup, member, stranger);
    try {
      // Refused before the body is read, so before startUpgrade, the only writer of an upgrade's charge row.
      const fromStranger = await post(api, stranger, "/v1/billing/subscription/upgrade", { malformed: true });
      if (refusesStranger(setup)) expect([fromStranger.statusCode, fromStranger.json()]).toEqual([403, REFUSED]);
      else expect(fromStranger.statusCode).toBe(400);
      expect((await post(api, member, "/v1/billing/subscription/upgrade", { malformed: true })).statusCode).toBe(memberMayBuy(setup) ? 400 : 403);
    } finally {
      await api.close();
    }
  });
});

describe("the price requests and the card change carry no buyer rule", () => {
  it.each(SETUPS)("%s: an account not on the team list gets its price and reaches the card change", async (_label, setup) => {
    const member = testHttpIdentity("price-rule-member"), stranger = testHttpIdentity("price-rule-stranger");
    const { api, quotes, decide } = harness(setup, member, stranger);
    quotes.create.mockResolvedValue(QUOTED as never);
    try {
      // The checkout's price: past the session, the quote budget and the legal check, to the quote service.
      const quote = await post(api, stranger, "/v1/billing/quote", QUOTE_BODY);
      expect(quote.statusCode).toBe(200);
      expect(quote.json().quote_ref).toBe(QUOTE_REF);
      expect(quotes.create).toHaveBeenCalledTimes(1);
      expect(decide).toHaveBeenCalledWith("billingQuote", stranger.authenticated.ownerRef, expect.any(Date));
      // The upgrade's price and the card change: past the session to the body check, as for a team member.
      for (const url of ["/v1/billing/subscription/upgrade-quote", "/v1/billing/subscription/card"]) {
        expect((await post(api, stranger, url, { malformed: true })).statusCode, url).toBe(400);
      }
    } finally {
      await api.close();
    }
  });
});

describe("apps/api/src/index.ts hands the rule over on the preview only, as one new member of the billing routes' options", () => {
  const index = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");

  it("decides by previewBuyerVerdict, with the team list, the value, whether payments are real and the Owner's list", () => {
    expect(index).toContain("const previewBuyerRule = previewConfig === undefined ? undefined");
    expect(index.replace(/\s+/gu, " ")).toContain("(session: AuthenticatedSession) => previewBuyerVerdict({ config: previewConfig, teamUserIds: options.previewTeamUserIds, asksOpenTo: options.previewAsksOpenTo, livePayments: options.billing?.paymentEnvironment === \"live\", userId: session.userId, approved: options.previewApprovedBuyers, log: (line) => console.error(line) });");
    expect(index).toContain("...(previewBuyerRule === undefined ? {} : { buyerAdmits: previewBuyerRule })");
    expect(index.split("buyerAdmits:").length - 1).toBe(1);
  });
});

/**
 * The Owner's list of approved buyers (0186), the whole matrix: each asks value and payment system (the pairings the boot
 * refuses too), an account on the team list or not, and the list's answer for it (listed, not listed, a throw, or no list
 * handed at all). Written out: the list is asked only under everyone-with-listed-buyers, with either payment system,
 * only for an account not on the team list; listed buys, not listed is refused 403, and a list that cannot be read is
 * refused 503;
 * every refusal comes before the checkout budget and the checkout service (the only writer of a charge row), and before
 * the upgrade's body is read.
 */
type ListAnswer = "listed" | "not listed" | "throws" | "no list";
const ANSWERS: readonly ListAnswer[] = ["listed", "not listed", "throws", "no list"];
const listCounts = (setup: Setup): boolean => setup.preview && setup.asks === "everyone-with-listed-buyers";
function expected(setup: Setup, onTeam: boolean, answer: ListAnswer): "BUYS" | "REFUSED" | "UNAVAILABLE" {
  if (!refusesStranger(setup)) return "BUYS";
  if (onTeam && teamListed(setup)) return "BUYS";
  if (!listCounts(setup)) return "REFUSED";
  return answer === "listed" ? "BUYS" : answer === "not listed" ? "REFUSED" : "UNAVAILABLE";
}
const MATRIX = [...SETUPS, ...REFUSED_AT_BOOT].flatMap(([name, setup]) => [true, false].flatMap((onTeam) => ANSWERS.map((answer) =>
  [`${name}, ${onTeam ? "on the team list" : "not on it"}, ${answer}`, setup, onTeam, answer] as const)));

describe("the Owner's list of approved buyers decides only where it counts", () => {
  it("covers every asks value, both payment systems, the team list and the four answers", () => {
    expect(MATRIX).toHaveLength(10 * 2 * 4);
    expect(MATRIX.filter(([, setup, onTeam]) => listCounts(setup) && !onTeam)).toHaveLength(8);
    expect(MATRIX.filter(([, setup, onTeam]) => listCounts(setup) && !onTeam && setup.payments === "live")).toHaveLength(4);
  });
  it.each(MATRIX)("%s", async (_label, setup, onTeam, answer) => {
    const member = testHttpIdentity("approved-member"), stranger = testHttpIdentity("approved-stranger");
    const who = onTeam ? member : stranger;
    const list = answer === "no list" ? null : approvedList(async (userId) => {
      if (answer === "throws") throw new Error("database down");
      return answer === "listed" && userId === stranger.authenticated.userId;
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { api, checkout, decide } = harness(setup, member, stranger, list);
    try {
      const bought = await post(api, who, "/v1/billing/checkout", CHECKOUT_BODY);
      const upgraded = await post(api, who, "/v1/billing/subscription/upgrade", { malformed: true });
      const outcome = expected(setup, onTeam, answer);
      if (outcome === "BUYS") {
        expect(bought.statusCode).toBe(200);
        expect(checkout.start).toHaveBeenCalledTimes(1);
        expect(upgraded.statusCode).toBe(400);
      } else {
        const body = outcome === "REFUSED" ? REFUSED : UNAVAILABLE, status = outcome === "REFUSED" ? 403 : 503;
        expect([bought.statusCode, bought.json()]).toEqual([status, body]);
        expect([upgraded.statusCode, upgraded.json()]).toEqual([status, body]);
        expect(decide).not.toHaveBeenCalled();
        expect(checkout.start).not.toHaveBeenCalled();
      }
      // The list is read only where it counts, and only for an account not on the team list: never under "everyone" with
      // real payments, never with asks closed, never in the friends' test, never off the preview, never for a team member.
      const asked = listCounts(setup) && !(onTeam && teamListed(setup));
      if (list !== null) expect(list.listed).toHaveBeenCalledTimes(asked ? 2 : 0);
      // Each unreadable answer leaves one content-free line; nothing else is logged.
      const lines = errors.mock.calls.map((call) => String(call[0]));
      expect(lines).toEqual(outcome === "UNAVAILABLE" ? [PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE, PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE] : []);
    } finally {
      errors.mockRestore();
      await api.close();
    }
  });
});

describe("previewBuyerVerdict with real payments under everyone-with-listed-buyers", () => {
  const TEAM = "22222222-2222-4222-8222-222222222222", OTHER = "11111111-1111-4111-8111-111111111111";
  const live = { config: PREVIEW, teamUserIds: [TEAM], asksOpenTo: "everyone-with-listed-buyers" as const, livePayments: true };
  it("admits a team account without reading the list, a listed account, and refuses one the list does not name or cannot read", async () => {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const list = approvedList(async (userId) => userId === OTHER);
    await expect(previewBuyerVerdict({ ...live, userId: TEAM, approved: list, log })).resolves.toBe("ADMIT");
    expect(list.listed).not.toHaveBeenCalled();
    await expect(previewBuyerVerdict({ ...live, userId: OTHER, approved: list, log })).resolves.toBe("ADMIT");
    await expect(previewBuyerVerdict({ ...live, userId: OTHER, approved: approvedList(), log })).resolves.toBe("REFUSE");
    await expect(previewBuyerVerdict({ ...live, userId: OTHER, approved: approvedList(async () => { throw new Error("database down"); }), log })).resolves.toBe("UNAVAILABLE");
    await expect(previewBuyerVerdict({ ...live, userId: OTHER, approved: undefined, log })).resolves.toBe("UNAVAILABLE");
    expect(lines).toEqual([PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE, PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE]);
  });
  it("under everyone any signed-in account buys, and the list is never read", async () => {
    const list = approvedList();
    await expect(previewBuyerVerdict({ ...live, asksOpenTo: "everyone", teamUserIds: [], userId: OTHER, approved: list, log: () => undefined })).resolves.toBe("ADMIT");
    expect(list.listed).not.toHaveBeenCalled();
  });
});

describe("previewBuyerVerdict fails closed", () => {
  const listed = { config: PREVIEW, teamUserIds: [] as string[], asksOpenTo: "everyone-with-listed-buyers" as const, livePayments: false, userId: "11111111-1111-4111-8111-111111111111" };
  it("an answer that never comes is refused after its time, and the late answer is never read", async () => {
    const lines: string[] = [];
    let release: (value: boolean) => void = () => undefined;
    const late = new Promise<boolean>((resolve) => { release = resolve; });
    const verdict = previewBuyerVerdict({ ...listed, approved: { listed: () => late }, log: (line) => lines.push(line), timeoutMs: 20 });
    await expect(verdict).resolves.toBe("UNAVAILABLE");
    release(true);
    await late;
    expect(lines).toEqual([PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE]);
  });
  it("an answer that is not a plain yes or no is refused", async () => {
    for (const odd of [null, undefined, "true", 1, {}]) {
      const lines: string[] = [];
      await expect(previewBuyerVerdict({ ...listed, approved: { listed: async () => odd as unknown as boolean }, log: (line) => lines.push(line) }), String(odd)).resolves.toBe("UNAVAILABLE");
      expect(lines).toHaveLength(1);
    }
  });
  it("its one line names no account and no address", () => {
    expect(JSON.parse(PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE)).toEqual({ event: "api.preview.buyer_check_unavailable" });
  });
});
