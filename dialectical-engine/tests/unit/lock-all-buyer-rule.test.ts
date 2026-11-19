// Where the asks lock meets the payments lock: on the hosted preview while payments are real, buying or upgrading a plan
// follows the rule for who may ask. Without it an account outside the team could pay real money and then be refused
// every question. On the sandbox (today's preview) and off the preview, any signed-in account may still buy, as before.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
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
const CHECKOUT_BODY = { quote_ref: "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2c4d", locale: "en", consents: { renewal_terms: PAIR, immediate_start: PAIR } };
const RESULT: CheckoutResult = { chargeId: "0123456789abcdef0123456789abcdef", redirectUrl: "https://secure.netopia-payments.com/ui/card?p=abc", environment: "live", reused: false };
const REFUSED = Object.freeze({ error: "PREVIEW_TEAM_ONLY", message: "PREVIEW_TEAM_ONLY" });

type Setup = Readonly<{ preview: boolean; payments: "sandbox" | "live"; asksOpen: boolean }>;

function harness(setup: Setup, member: TestHttpIdentity, stranger: TestHttpIdentity) {
  const checkout = { start: vi.fn(async () => RESULT) };
  const decide = vi.fn(() => ({ allowed: true as const }));
  const billing: BillingRouteOptions = {
    plans: testBillingPlans, clock: () => NOW, legal: { requiresReacceptance: async () => false }, checkout,
    charges: { read: async () => null }, quotes: { create: async () => { throw new Error("NOT_REACHED"); } },
    paymentEnvironment: setup.payments,
    // Only the gate is under test: a body the upgrade refuses as malformed shows the request got past it.
    subscription: {} as SubscriptionRouteDeps
  };
  const sessions = {
    ...testSessionApplication([member, stranger]),
    readAgeConfirmation(_session: AuthenticatedSession): Promise<"required" | "confirmed"> { return Promise.resolve("confirmed"); }
  };
  const api = buildApi({
    application: unusedAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, billing,
    admission: { configured: () => true, decide } as unknown as AdmissionLimiter,
    ...(setup.preview ? { previewProviderTestConfig: PREVIEW } : {}),
    // The parser never lets a team list and an open setting meet in one file; the routes see one or the other.
    ...(setup.preview && !setup.asksOpen ? { previewTeamUserIds: [member.authenticated.userId] } : {}),
    ...(setup.preview && setup.asksOpen ? { previewTeamUserIds: [] as readonly string[], previewAsksOpen: true as const } : {})
  });
  return { api, checkout, decide };
}

const post = (api: ReturnType<typeof buildApi>, who: TestHttpIdentity, url: string, payload: unknown) => api.inject({
  method: "POST", url, headers: { ...testSessionHeaders(who, true), "content-type": "application/json" }, payload: JSON.stringify(payload)
});

/** Whether the buyer rule applies, written out: only the preview while payments are real, and then only to whom asks refuse. */
const refusesStranger = (setup: Setup) => setup.preview && setup.payments === "live" && !setup.asksOpen;

const SETUPS: ReadonlyArray<readonly [string, Setup]> = [true, false].flatMap((preview) => (["sandbox", "live"] as const)
  .flatMap((payments) => [true, false].flatMap((asksOpen) => preview || !asksOpen
    ? [[`${preview ? "preview" : "off the preview"}, ${payments} payments${preview ? (asksOpen ? ", asks open" : ", team rule") : ""}`,
      { preview, payments, asksOpen }] as const]
    : [])));

describe("POST /v1/billing/checkout follows who may ask, only on the preview while payments are real", () => {
  it.each(SETUPS)("%s", async (_label, setup) => {
    const member = testHttpIdentity("buyer-rule-member"), stranger = testHttpIdentity("buyer-rule-stranger");
    const { api, checkout, decide } = harness(setup, member, stranger);
    try {
      const fromStranger = await post(api, stranger, "/v1/billing/checkout", CHECKOUT_BODY);
      if (refusesStranger(setup)) {
        expect([fromStranger.statusCode, fromStranger.json()]).toEqual([403, REFUSED]);
        // Refused before the checkout budget, the age and legal checks and the payment page: nothing spent or written.
        expect(decide).not.toHaveBeenCalled();
        expect(checkout.start).not.toHaveBeenCalled();
      } else {
        expect(fromStranger.statusCode).toBe(200);
        expect(checkout.start).toHaveBeenCalledTimes(1);
      }
      // A team member may always buy.
      expect((await post(api, member, "/v1/billing/checkout", CHECKOUT_BODY)).statusCode).toBe(200);
    } finally {
      await api.close();
    }
  });
});

describe("POST /v1/billing/subscription/upgrade follows the same rule", () => {
  it.each(SETUPS)("%s", async (_label, setup) => {
    const member = testHttpIdentity("upgrade-rule-member"), stranger = testHttpIdentity("upgrade-rule-stranger");
    const { api } = harness(setup, member, stranger);
    try {
      const fromStranger = await post(api, stranger, "/v1/billing/subscription/upgrade", { malformed: true });
      if (refusesStranger(setup)) expect([fromStranger.statusCode, fromStranger.json()]).toEqual([403, REFUSED]);
      else expect(fromStranger.statusCode).toBe(400);
      expect((await post(api, member, "/v1/billing/subscription/upgrade", { malformed: true })).statusCode).toBe(400);
    } finally {
      await api.close();
    }
  });
});

describe("apps/api/src/index.ts hands the rule over only on the preview while payments are real", () => {
  const index = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");

  it("uses the asks rule itself, and passes it as a new member of the billing routes' options only", () => {
    expect(index).toContain('const previewBuyerAdmits = previewConfig === undefined || options.billing?.paymentEnvironment !== "live" ? undefined');
    expect(index).toContain("(session: AuthenticatedSession) => previewAskAdmits(previewConfig, options.previewTeamUserIds, options.previewAsksOpen, session.userId);");
    expect(index).toContain("...(previewBuyerAdmits === undefined ? {} : { buyerAdmits: previewBuyerAdmits })");
    expect(index.split("buyerAdmits:").length - 1).toBe(1);
  });
});
