// Where the asks lock meets the payments lock: on the hosted preview a checkout or a plan upgrade, the two steps that
// create a charge and open NETOPIA's page, follow the buyer rule. Any signed-in account may buy only with real payments
// and asks open to everyone, or in the friends' test on the sandbox (everyone-with-test-payments). Everywhere else on the
// preview only an account on the team list may: with the team rule while payments are real, and on the sandbox under the
// team rule and under everyone-with-listed-buyers, where anyone may ask but only the listed accounts may buy. Off the
// preview there is no rule. The price requests before the last button carry no rule, and neither does the card change.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import { parsePreviewProviderTestConfig, type PreviewAsksOpenTo } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CheckoutResult } from "../../apps/api/src/billing/checkout.js";
import type { BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
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

function harness(setup: Setup, member: TestHttpIdentity, stranger: TestHttpIdentity) {
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
    ...(setup.preview && setup.asks !== undefined ? { previewAsksOpen: true as const, previewAsksOpenTo: setup.asks } : {})
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
const BOOTS = (setup: Setup): boolean => !setup.preview || setup.asks === undefined
  || (setup.payments === "live" ? setup.asks === "everyone" : setup.asks !== "everyone");
const label = (setup: Setup): string => `${setup.preview ? "preview" : "off the preview"}, ${setup.payments} payments${
  setup.preview ? `, ${setup.asks ?? "team rule"}` : ""}`;
const ALL: readonly Setup[] = [true, false].flatMap((preview) => (["sandbox", "live"] as const)
  .flatMap((payments) => (preview ? VALUES : [undefined]).map((asks) => Object.freeze({ preview, payments, asks }))));
const SETUPS = ALL.filter(BOOTS).map((setup) => [label(setup), setup] as const);
/** A pairing the boot refuses still answers closed if it were ever built: the team list only. */
const REFUSED_AT_BOOT = ALL.filter((setup) => !BOOTS(setup)).map((setup) => [label(setup), setup] as const);

describe("the cases, named", () => {
  it("are the four the owner meets on the sandbox, the two with real payments, and off the preview", () => {
    expect(SETUPS.map(([name]) => name)).toEqual([
      "preview, sandbox payments, team rule", "preview, sandbox payments, everyone-with-test-payments",
      "preview, sandbox payments, everyone-with-listed-buyers",
      "preview, live payments, team rule", "preview, live payments, everyone",
      "off the preview, sandbox payments", "off the preview, live payments"
    ]);
    expect(REFUSED_AT_BOOT.map(([name]) => name)).toEqual([
      "preview, sandbox payments, everyone", "preview, live payments, everyone-with-test-payments",
      "preview, live payments, everyone-with-listed-buyers"
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

  it("decides by previewBuyerAdmits, with the team list, the value and whether payments are real", () => {
    expect(index).toContain("const previewBuyerRule = previewConfig === undefined ? undefined");
    expect(index.replace(/\s+/gu, " ")).toContain("(session: AuthenticatedSession) => previewBuyerAdmits(previewConfig, options.previewTeamUserIds, options.previewAsksOpenTo, options.billing?.paymentEnvironment === \"live\", session.userId);");
    expect(index).toContain("...(previewBuyerRule === undefined ? {} : { buyerAdmits: previewBuyerRule })");
    expect(index.split("buyerAdmits:").length - 1).toBe(1);
  });
});
