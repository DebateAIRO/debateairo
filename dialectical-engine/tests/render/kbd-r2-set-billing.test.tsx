// @vitest-environment jsdom
// Keyboard audit 2026-11-12, wave 2 (SET-6, SET-7, SET-8, SET-9, SET-11): the subscription card, the checkout, /cancel,
// /settings/card and the updated-Terms gate, followed by a keyboard user with the site's focus guard running.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { SubscriptionControls, type SubscriptionClient } from "../../apps/ui/components/billing/SubscriptionControls.js";
import { CheckoutFlow, type CheckoutClient } from "../../apps/ui/components/billing/CheckoutFlow.js";
import { CancelFlow, type CancelClient } from "../../apps/ui/components/billing/CancelFlow.js";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import { LegalAcceptGate } from "../../apps/ui/components/billing/LegalAcceptGate.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import newDebateEnglish from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };
import { button, expectFocusOn, expectParkedOn, mountPage, nextTabStop, press, settle, typeInto, unmountPage } from "./kbd-r2-set-harness.js";

const EN = billingEnglish as Readonly<Record<string, string>>;
afterEach(unmountPage);

// ---------------------------------------------------------------------------------------------------------------- SET-6
const NOW = new Date("2026-10-03T12:00:00.000Z");
const CONSENT = Object.freeze({ version: "consent-renewal-1", sha256: "a".repeat(64) });
function subscription(overrides: Record<string, unknown> = {}) {
  return {
    plan_id: "PLUS", status: "ACTIVE", cancel_requested: false, current_period_end: "2026-10-29T10:00:00.000Z",
    renews_on: "2026-10-29T10:00:00.000Z", renewal_total: "24.20", currency: "USD", scheduled_downgrade_plan_id: null,
    withdrawal_open_until: "2026-10-13T21:00:00.000Z", withdrawal_last_day: "2026-10-13",
    can_upgrade: true, can_change_card: true, can_revoke_cancel: false, ...overrides
  };
}
const PLANS = {
  currency: "USD",
  plans: [
    { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, allowance_vs_plus: "0.04" },
    { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" },
    { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, allowance_vs_plus: "4" },
    { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, allowance_vs_plus: "30" }
  ]
};
const UPGRADE_QUOTE = {
  quote_ref: "22222222-2222-4222-8222-222222222222", plan_id: "PRO", net: "30.00", tax: "6.30", total: "36.30", currency: "USD",
  tax_name: "TVA", tax_rate_basis_points: 2100, tax_country: "RO", recurring_total: "60.50",
  renews_on: "2026-10-29T10:00:00.000Z", expires_at: "2026-10-03T12:30:00.000Z"
};
let plan: { [K in keyof SubscriptionClient]: ReturnType<typeof vi.fn> };
beforeEach(() => {
  plan = {
    getBillingSubscription: vi.fn(async () => ({ subscription: subscription() })),
    getBillingInvoices: vi.fn(async () => ({ invoices: [] })),
    quoteSubscriptionUpgrade: vi.fn(async () => UPGRADE_QUOTE), upgradeSubscription: vi.fn(),
    downgradeSubscription: vi.fn(async () => undefined), cancelSubscription: vi.fn(async () => undefined),
    revokeSubscriptionCancel: vi.fn(async () => undefined), withdrawSubscription: vi.fn(async () => ({ refund: "18.00", currency: "USD" })),
    getBillingCharge: vi.fn(), getBillingPlans: vi.fn(async () => PLANS)
  };
});
const card = () => document.querySelector<HTMLElement>("section[aria-labelledby=subscription-heading]")!;
async function mountPlan() {
  await mountPage(<SubscriptionControls catalog={billingEnglish} locale="en" client={plan as unknown as SubscriptionClient} now={() => NOW}
    renewalConsent={CONSENT} goToPayment={vi.fn()} />);
}

describe("SET-6 the subscription card (guard)", () => {
  it("Cancel opens its confirm with focus kept on Cancel; Yes, cancel parks focus on the card, before its actions", async () => {
    await mountPlan();
    await press(button(EN["billing.subscription.cancel"]!));
    expectFocusOn(button(EN["billing.subscription.cancel"]!));
    expect(nextTabStop()).toBe(button(EN["billing.subscription.withdraw"]!));
    plan.getBillingSubscription.mockResolvedValue({ subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null, can_revoke_cancel: true }) });
    await press(button(EN["billing.subscription.cancelYes"]!));
    expect(plan.cancelSubscription).toHaveBeenCalledOnce();
    expectParkedOn(card());
    expect(nextTabStop()).toBe(card().querySelector('a[href="/settings/card"]'));
  });

  it("Keep my plan parks focus on the card, and the next Tab is Change plan", async () => {
    await mountPlan();
    await press(button(EN["billing.subscription.cancel"]!));
    await press(button(EN["billing.subscription.keep"]!));
    expectParkedOn(card());
    expect(nextTabStop()).toBe(button(EN["billing.subscription.changePlan"]!));
  });

  it("Undo cancellation: focus stays on the same button, which now reads Cancel", async () => {
    plan.getBillingSubscription.mockResolvedValue({ subscription: subscription({ cancel_requested: true, renews_on: null, renewal_total: null, can_revoke_cancel: true }) });
    await mountPlan();
    plan.getBillingSubscription.mockResolvedValue({ subscription: subscription() });
    await press(button(EN["billing.subscription.revoke"]!));
    expect(plan.revokeSubscriptionCancel).toHaveBeenCalledOnce();
    expectFocusOn(button(EN["billing.subscription.cancel"]!));
  });

  it("Upgrade to Pro: focus comes back to it, and the quote with its agreement follows it", async () => {
    plan.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "PLUS" }) });
    await mountPlan();
    await press(button(EN["billing.subscription.changePlan"]!));
    await press(button("Upgrade to Pro"));
    const upgrade = button("Upgrade to Pro");
    expectFocusOn(upgrade);
    const agreement = document.querySelector("#upgrade-agreement")!;
    expect(upgrade.compareDocumentPosition(agreement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a failed payment start parks focus on the card, with the reason in it", async () => {
    plan.upgradeSubscription.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "x", "PAYMENT_PROVIDER_UNAVAILABLE"));
    await mountPlan();
    await press(button(EN["billing.subscription.changePlan"]!));
    await press(button("Upgrade to Pro"));
    await press(document.querySelector<HTMLInputElement>("#upgrade-agreement")!, " ");
    await press(button("Upgrade and pay $36.30"));
    expect(card().querySelector("[role=status]")?.textContent).toBe(EN["billing.checkout.formUnavailable"]);
    expectParkedOn(card());
  });

  it("Move to Plus: focus comes back to it, and the next Tab is its Yes", async () => {
    plan.getBillingSubscription.mockResolvedValue({ subscription: subscription({ plan_id: "PRO" }) });
    await mountPlan();
    await press(button(EN["billing.subscription.changePlan"]!));
    await press(button("Move to Plus at renewal"));
    expectFocusOn(button("Move to Plus at renewal"));
    expect(nextTabStop()).toBe(button("Yes, move to Plus"));
    await press(button("Yes, move to Plus"));
    expect(plan.downgradeSubscription).toHaveBeenCalledWith("PLUS");
    expectParkedOn(card());
  });

  it("Confirm withdrawal parks focus on the card, with what was refunded in it", async () => {
    await mountPlan();
    await press(button(EN["billing.subscription.withdraw"]!));
    expectFocusOn(button(EN["billing.subscription.withdraw"]!));
    await press(button(EN["billing.subscription.withdrawConfirm"]!));
    expect(plan.withdrawSubscription).toHaveBeenCalledOnce();
    expect(card().querySelector("[role=status]")).not.toBeNull();
    expectParkedOn(card());
  });
});

// ---------------------------------------------------------------------------------------------------------------- SET-7
const CONSENTS = Object.freeze({
  renewal: { version: "consent-renewal-1", sha256: "a".repeat(64) },
  immediateStart: { version: "consent-immediate-1", sha256: "b".repeat(64) }
});
function quote(overrides: Record<string, unknown> = {}) {
  return {
    quote_ref: "11111111-1111-4111-8111-111111111111", plan_id: "PLUS", net: "20.00", tax: "3.80", total: "23.80",
    currency: "EUR", tax_name: "MwSt.", tax_rate_bp: 1900, tax_country: "DE", tax_region: null, tax_status: "TAXABLE",
    country: "DE", ip_country: "DE", country_confirm_needed: false, address_required: false,
    renews_on: "2026-10-29T10:00:00.000Z", withdrawal_days: 14, expires_at: "2026-09-29T10:30:00.000Z", ...overrides
  };
}
async function priced() {
  const client = { createBillingQuote: vi.fn(), startBillingCheckout: vi.fn(), getBillingCharge: vi.fn() };
  client.createBillingQuote.mockResolvedValueOnce(quote({ address_required: true })).mockResolvedValue(quote());
  await mountPage(<CheckoutFlow planId="PLUS" locale="en" catalog={billingEnglish} consents={CONSENTS}
    client={client as unknown as CheckoutClient} navigate={vi.fn()} goToPayment={vi.fn()} />);
  const field = (id: string) => document.querySelector<HTMLInputElement>(`#checkout-${id}`)!;
  await typeInto(field("firstName"), "Anna");
  await typeInto(field("lastName"), "Schmidt");
  await typeInto(field("phone"), "+49 151 1234 5678");
  await typeInto(field("street"), "Invalidenstrasse 1");
  await typeInto(field("city"), "Berlin");
  await typeInto(field("postalCode"), "10115");
  await press(button(EN["billing.checkout.showPrice"]!));
  await press(field("renewal"), " ");
  await press(field("immediate"), " ");
  return client;
}

describe("SET-7 the checkout", () => {
  it("a refused start puts focus on Show the full price, the way on", async () => {
    const client = await priced();
    client.startBillingCheckout.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "x", "PAYMENT_PROVIDER_UNAVAILABLE"));
    await press(button(EN["billing.checkout.continueToCard"]!));
    expect(document.querySelector("#checkout-total")).toBeNull();
    expect(document.querySelector(".billingError[role=alert]")).not.toBeNull();
    expectFocusOn(button(EN["billing.checkout.showPrice"]!));
  });

  it("a payment already on its way: focus waits on the status screen, which its title names (guard)", async () => {
    const client = await priced();
    client.startBillingCheckout.mockResolvedValue({ state: "PENDING", charge_ref: "0123456789abcdef0123456789abcdef" });
    client.getBillingCharge.mockResolvedValue({ state: "NEEDS_ACTION", reason_code: "PAYMENT_DECLINED", kind: "INITIAL" });
    await press(button(EN["billing.checkout.continueToCard"]!));
    const screen = document.querySelector<HTMLElement>("section[aria-labelledby=checkout-status-title]");
    expectParkedOn(screen);
    // Try again goes back to the form: focus waits at the top of the checkout, which the same section still is.
    await press(button(EN["billing.checkout.tryAgain"]!));
    expect(document.querySelector("#checkout-country")).not.toBeNull();
    expectParkedOn(document.querySelector<HTMLElement>("section[aria-labelledby=checkout-title]"));
  });
});

// ---------------------------------------------------------------------------------------------------------------- SET-8
describe("SET-8 /cancel (guard)", () => {
  const section = () => document.querySelector<HTMLElement>("section[aria-labelledby=cancel-title]");
  it("Send the link: focus waits on the page's section, whose message says it was sent", async () => {
    const client = { requestCancelLink: vi.fn().mockResolvedValue(undefined), cancelByToken: vi.fn() };
    await mountPage(<CancelFlow catalog={billingEnglish} client={client as unknown as CancelClient} />);
    await typeInto(document.querySelector<HTMLInputElement>("#cancel-email")!, "ana@example.com");
    await press(button(EN["billing.cancelPage.send"]!));
    expect(section()!.querySelector("[role=status]")?.textContent).toBe(EN["billing.cancelPage.sent"]);
    expectParkedOn(section());
  });

  it("Cancel my plan: done, or a used link (the form again, next Tab in it), focus waits on the section", async () => {
    for (const outcome of ["done", "invalid"] as const) {
      window.history.replaceState(null, "", `/cancel#token=${"a".repeat(43)}`);
      const client = {
        requestCancelLink: vi.fn(),
        cancelByToken: outcome === "done" ? vi.fn().mockResolvedValue(undefined)
          : vi.fn().mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 409, "x", "CANCEL_LINK_INVALID"))
      };
      await mountPage(<CancelFlow catalog={billingEnglish} client={client as unknown as CancelClient} />);
      await press(button(EN["billing.cancelPage.confirm"]!));
      expectParkedOn(section());
      if (outcome === "invalid") expect(nextTabStop()).toBe(document.querySelector("#cancel-email"));
      await unmountPage();
    }
  });

  it("a failure that spends nothing gives focus back to Cancel my plan", async () => {
    window.history.replaceState(null, "", `/cancel#token=${"a".repeat(43)}`);
    const client = { requestCancelLink: vi.fn(), cancelByToken: vi.fn().mockRejectedValue(new Error("offline")) };
    await mountPage(<CancelFlow catalog={billingEnglish} client={client as unknown as CancelClient} />);
    await press(button(EN["billing.cancelPage.confirm"]!));
    expectFocusOn(button(EN["billing.cancelPage.confirm"]!));
  });
});

// ---------------------------------------------------------------------------------------------------------------- SET-9
describe("SET-9 /settings/card", () => {
  const DETAILS = { country: "RO", region: "Cluj", first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1", city: "Cluj-Napoca", postal_code: "400001" };
  async function refused(code: string) {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS),
      getBillingSubscription: vi.fn(async () => ({ subscription: { renewal_total: "24.20", currency: "USD" } })),
      startCardChange: vi.fn().mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "x", code)),
      getBillingCharge: vi.fn()
    };
    await mountPage(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
      client={client as unknown as CardChangeClient} goToPayment={vi.fn()} />);
    await press(document.querySelector<HTMLInputElement>("#card-agreement")!, " ");
    await press(button(EN["billing.card.checkCard"]!));
    expect(client.startCardChange).toHaveBeenCalledOnce();
  }

  it("a refused phone puts focus in the phone field, the one to fix", async () => {
    await refused("BILLING_PHONE_INVALID");
    expect(document.querySelector(".billingError[role=alert]")?.textContent).toBe(EN["billing.checkout.phoneInvalid"]);
    expectFocusOn(document.querySelector("#card-phone"));
  });

  it("any other refusal gives focus back to Check my new card, with the reason right after it (guard)", async () => {
    await refused("CARD_CHANGE_NOT_AVAILABLE_NOW");
    expectFocusOn(button(EN["billing.card.checkCard"]!));
  });
});

// --------------------------------------------------------------------------------------------------------------- SET-11
describe("SET-11 the updated-Terms gate", () => {
  const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
  const metrics: Record<(typeof METRIC_KEYS)[number], number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
  beforeEach(() => {
    metrics.scrollTop = 0;
    for (const key of METRIC_KEYS) {
      Object.defineProperty(HTMLElement.prototype, key, {
        configurable: true,
        get(this: HTMLElement): number { return this.classList.contains("policyBody") ? metrics[key] : 0; }
      });
    }
  });
  afterEach(() => { for (const key of METRIC_KEYS) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]; });
  const OWED_TERMS = { must_accept: [{ kind: "TERMS", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }] };
  async function readTerms(acceptLegal: ReturnType<typeof vi.fn>, logout = vi.fn()) {
    const client = { getLegalStatus: vi.fn().mockResolvedValueOnce(OWED_TERMS).mockResolvedValue({ must_accept: [] }), acceptLegal, logout };
    await mountPage(<LegalAcceptGate catalog={newDebateEnglish} client={client} reloadPage={vi.fn()} onSignedOut={vi.fn()}><h1 id="inside">inside</h1></LegalAcceptGate>);
    await press(button("Read the Terms of Service"));
    metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
    await act(async () => { document.querySelector(".policyBody")!.dispatchEvent(new Event("scroll")); });
    await settle();
    await press(button("I have read it"));
    expectFocusOn(button("Read the Terms of Service"));
  }

  it("an accepted pair lets the page through, with focus waiting on the main area (guard)", async () => {
    await readTerms(vi.fn().mockResolvedValue(undefined));
    await press(button("Accept and continue"));
    expect(document.querySelector("#inside")).not.toBeNull();
    expectParkedOn(document.getElementById("main-content"));
  });

  it("a failed accept gives focus back to Accept and continue (guard)", async () => {
    await readTerms(vi.fn().mockRejectedValue(new Error("offline")));
    await press(button("Accept and continue"));
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expectFocusOn(button("Accept and continue"));
  });

  it("a stale pair puts focus on Reload the page, the only way on (Accept stays off)", async () => {
    await readTerms(vi.fn().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 409, "LEGAL_DOCUMENT_STALE", "LEGAL_DOCUMENT_STALE")));
    await press(button("Accept and continue"));
    expect(button("Accept and continue").disabled).toBe(true);
    expectFocusOn(button("Reload the page"));
  });

  it("a failed sign-out gives focus back to Sign out (guard)", async () => {
    await readTerms(vi.fn(), vi.fn().mockRejectedValue(new Error("offline")));
    await press(button("Sign out"));
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expectFocusOn(button("Sign out"));
  });
});
