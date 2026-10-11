import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";

const mocks = vi.hoisted(() => ({
  locale: "en",
  getBillingPlans: vi.fn()
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ getBillingPlans: mocks.getBillingPlans })
}));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({ get: (name: string) => (name === LOCALE_COOKIE ? { value: mocks.locale } : undefined) }),
    headers: async () => new Headers({ "user-agent": "billing-pricing-test" })
  };
});

import PricingPage from "../../apps/ui/app/pricing/page.js";
import { formatMoney } from "../../apps/ui/lib/billing/format.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import billingRomanian from "../../apps/ui/messages/ro/billing.json" with { type: "json" };

const PLANS = Object.freeze({
  currency: "USD" as const,
  plans: [
    { plan_id: "FREE" as const, net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, allowance_vs_plus: "0.04" },
    { plan_id: "PLUS" as const, net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" },
    { plan_id: "PRO" as const, net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, allowance_vs_plus: "4" },
    { plan_id: "MAX" as const, net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, allowance_vs_plus: "30" }
  ]
});
/** Spec 2026-10-05 §2.16.5: the sentence under the cards (it names no currency). */
const CURRENCY_NOTE = billingEnglish["billing.pricing.currencyNote"];

async function renderPricing(): Promise<Document> {
  return new JSDOM(renderToStaticMarkup(await PricingPage())).window.document;
}

describe("P18 /pricing", () => {
  beforeEach(() => {
    mocks.locale = "en";
    mocks.getBillingPlans.mockReset();
  });

  it("shows the four plans in price order with prices, the allowance as a multiple, and the right next step", async () => {
    mocks.getBillingPlans.mockResolvedValue(PLANS);
    const document = await renderPricing();
    const cards = [...document.querySelectorAll("[data-plan]")];
    expect(cards.map((card) => card.getAttribute("data-plan"))).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain("$20.00 a month");
    expect(plus.textContent).toContain("plus tax where it applies");
    expect(plus.textContent).toContain("The Plus allowance");
    expect(plus.querySelector("a")?.getAttribute("href")).toBe("/checkout?plan=PLUS");
    expect(plus.querySelector("a")?.textContent).toBe("Choose Plus");
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain("4× the Plus allowance");
    expect(document.querySelector('[data-plan="MAX"]')?.textContent).toContain("30× the Plus allowance");
    const free = document.querySelector('[data-plan="FREE"]')!;
    expect(free.textContent).toContain("A small monthly allowance");
    expect(free.querySelector("a")?.getAttribute("href")).toBe("/sign-up");
    expect(document.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(document.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(document.body.textContent).toContain(CURRENCY_NOTE);
  });

  it("shows the prices in the currency the visitor's connection pays in, with the note under the cards (spec 2026-10-05 §2.16.1)", async () => {
    mocks.getBillingPlans.mockResolvedValue({ ...PLANS, currency: "RON" });
    const document = await renderPricing();
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain(`${formatMoney("en", "100.00", "RON")} a month`);
    expect(plus.textContent).not.toContain("$");
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain(formatMoney("en", "250.00", "RON"));
    expect(document.body.textContent).toContain(CURRENCY_NOTE);
    // The note follows the cards.
    const cards = document.querySelector("[data-pricing-cards]")!;
    expect(cards.nextElementSibling?.textContent).toBe(CURRENCY_NOTE);
  });

  it("never shows a dollar amount of AI credit", async () => {
    mocks.getBillingPlans.mockResolvedValue(PLANS);
    const text = (await renderPricing()).body.textContent ?? "";
    for (const credit of ["$0.20", "$5.00", "$150.00", "0.04"]) expect(text).not.toContain(credit);
  });

  it("is not found when billing is off, and says so plainly when the plans cannot be read", async () => {
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "Not found"));
    await expect(PricingPage()).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "Unavailable"));
    const document = await renderPricing();
    expect(document.body.textContent).toContain("The plans can't be shown right now. Please try again in a minute.");
    expect(document.querySelector("[data-plan]")).toBeNull();
    // No cards, no note about their currency.
    expect(document.body.textContent).not.toContain(CURRENCY_NOTE);
  });

  it("speaks the reader's locale", async () => {
    mocks.getBillingPlans.mockResolvedValue(PLANS);
    mocks.locale = "ro";
    const document = await renderPricing();
    expect(document.querySelector("h1")?.textContent).not.toBe("Choose how much you debate");
    expect(document.body.textContent).toContain(billingRomanian["billing.pricing.currencyNote"]);
  });
});
