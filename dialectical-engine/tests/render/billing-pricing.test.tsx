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

const NETS = Object.freeze({
  FREE: { USD: "0.00", EUR: "0.00", RON: "0.00" }, PLUS: { USD: "20.00", EUR: "20.00", RON: "100.00" },
  PRO: { USD: "50.00", EUR: "50.00", RON: "250.00" }, MAX: { USD: "200.00", EUR: "200.00", RON: "1000.00" }
});
const ALLOWANCE = Object.freeze({ FREE: "0.05", PLUS: "1", PRO: "5", MAX: "33" });
type PlanId = keyof typeof NETS;
const PLAN_IDS: readonly PlanId[] = ["FREE", "PLUS", "PRO", "MAX"];
type Place = Readonly<{ country: string | null; postal_code: string | null; status: string }>;
type Tax = Readonly<{ country: string; tax_name: string; tax_rate_bp: number; tax_status: string }>;

/** A plans answer for one place: priced (its tax and totals) or not (no tax, no totals). */
function answer(currency: "USD" | "EUR" | "RON", place: Place, tax: Tax | null, totals?: Readonly<Record<PlanId, string>>) {
  return Object.freeze({
    currency, place, tax,
    plans: PLAN_IDS.map((plan_id) => ({
      plan_id, net_prices: NETS[plan_id], total_price: totals?.[plan_id] ?? null, allowance_vs_plus: ALLOWANCE[plan_id]
    }))
  });
}
/** Terms §12: Texas, by its ZIP code, adds its 6.25 % sales tax to every paid price. */
const TEXAS = answer("USD", { country: "US", postal_code: "75201", status: "PRICED" },
  { country: "US", tax_name: "Sales tax", tax_rate_bp: 625, tax_status: "TAXABLE" },
  { FREE: "0.00", PLUS: "21.25", PRO: "53.13", MAX: "212.50" });
/** A visitor from Germany sees Germany's 19 % in every paid price. */
const GERMANY = answer("EUR", { country: "DE", postal_code: null, status: "PRICED" },
  { country: "DE", tax_name: "MwSt.", tax_rate_bp: 1_900, tax_status: "TAXABLE" },
  { FREE: "0.00", PLUS: "23.80", PRO: "59.50", MAX: "238.00" });
const ROMANIA = answer("RON", { country: "RO", postal_code: null, status: "PRICED" },
  { country: "RO", tax_name: "VAT", tax_rate_bp: 2_100, tax_status: "TAXABLE" },
  { FREE: "0.00", PLUS: "121.00", PRO: "302.50", MAX: "1210.00" });
const SWITZERLAND = answer("USD", { country: "CH", postal_code: null, status: "PRICED" },
  { country: "CH", tax_name: "VAT", tax_rate_bp: 0, tax_status: "NOT_REGISTERED" },
  { FREE: "0.00", PLUS: "20.00", PRO: "50.00", MAX: "200.00" });
const NO_COUNTRY = answer("USD", { country: null, postal_code: null, status: "COUNTRY_NEEDED" }, null);
/** Spec 2026-10-05 §2.16.5: the sentence under the cards (it names no currency). */
const CURRENCY_NOTE = billingEnglish["billing.pricing.currencyNote"];

async function renderPricing(searchParams?: Record<string, string | string[]>): Promise<Document> {
  const page = await PricingPage(searchParams === undefined ? undefined : { searchParams: Promise.resolve(searchParams) });
  return new JSDOM(renderToStaticMarkup(page)).window.document;
}
const paidCards = (document: Document) => ["PLUS", "PRO", "MAX"].map((id) => document.querySelector(`[data-plan="${id}"]`)!);

describe("P18 /pricing", () => {
  beforeEach(() => {
    mocks.locale = "en";
    mocks.getBillingPlans.mockReset();
  });

  it("shows the four plans in price order with prices, the allowance as a multiple, and the right next step", async () => {
    mocks.getBillingPlans.mockResolvedValue(TEXAS);
    const document = await renderPricing();
    const cards = [...document.querySelectorAll("[data-plan]")];
    expect(cards.map((card) => card.getAttribute("data-plan"))).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain("$21.25 a month");
    expect(plus.textContent).toContain("Tax included (6.25%, United States)");
    expect(plus.textContent).toContain("The Plus allowance");
    expect(plus.querySelector("a")?.getAttribute("href")).toBe("/checkout?plan=PLUS");
    expect(plus.querySelector("a")?.textContent).toBe("Choose Plus");
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain("5× the Plus allowance");
    expect(document.querySelector('[data-plan="MAX"]')?.textContent).toContain("33× the Plus allowance");
    const free = document.querySelector('[data-plan="FREE"]')!;
    expect(free.textContent).toContain("A small monthly allowance");
    expect(free.querySelector("a")?.getAttribute("href")).toBe("/sign-up");
    expect(document.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(document.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(document.body.textContent).toContain(CURRENCY_NOTE);
  });

  it("shows the prices in the currency the place pays in, with the note under the cards (spec 2026-10-05 §2.16.1)", async () => {
    mocks.getBillingPlans.mockResolvedValue(ROMANIA);
    const document = await renderPricing();
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain(`${formatMoney("en", "121.00", "RON")} a month`);
    expect(plus.textContent).not.toContain("$");
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain(formatMoney("en", "302.50", "RON"));
    expect(document.body.textContent).toContain(CURRENCY_NOTE);
    // The note follows the cards.
    const cards = document.querySelector("[data-pricing-cards]")!;
    expect(cards.nextElementSibling?.textContent).toBe(CURRENCY_NOTE);
  });

  it("shows every paid price with the place's tax in it, and says so (Terms §12)", async () => {
    mocks.getBillingPlans.mockResolvedValue(GERMANY);
    const document = await renderPricing();
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain(`${formatMoney("en", "23.80", "EUR")} a month`);
    expect(plus.textContent).toContain("Tax included (19%, Germany)");
    expect(plus.textContent).not.toContain(formatMoney("en", "20.00", "EUR"));
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain(formatMoney("en", "59.50", "EUR"));
    expect(document.querySelector('[data-plan="MAX"]')?.textContent).toContain(formatMoney("en", "238.00", "EUR"));
    // The free plan has no tax line at all.
    expect(document.querySelector('[data-plan="FREE"]')?.textContent).not.toMatch(/Tax included|No tax added/u);
    expect(document.body.textContent).toContain(billingEnglish["billing.pricing.faqTaxQuestionIncluded"]);
    expect(document.body.textContent).toContain(billingEnglish["billing.pricing.faqTaxAnswerIncluded"]);
    // The place form (sign-up's region picker) shows the country the cards are priced for, and asks no postal code
    // outside the US and Canada.
    expect(document.querySelector("#pricing-region-value")?.textContent).toBe("Germany");
    expect((document.querySelector('input[type="hidden"][name="country"]') as HTMLInputElement).value).toBe("DE");
    expect(document.querySelector("#pricing-postal-code")).toBeNull();
    expect(document.querySelector("[data-pricing-place]")?.getAttribute("action")).toBe("/pricing");
    // A fractional rate keeps its decimals, as the checkout's tax label does.
    mocks.getBillingPlans.mockResolvedValue({ ...GERMANY, tax: { ...GERMANY.tax!, tax_rate_bp: 887.5 } });
    expect((await renderPricing()).querySelector('[data-plan="PLUS"]')?.textContent).toContain("Tax included (8.875%, Germany)");
  });

  it("says no tax is added where the place adds none", async () => {
    mocks.getBillingPlans.mockResolvedValue(SWITZERLAND);
    const document = await renderPricing();
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain("$20.00 a month");
    expect(plus.textContent).toContain("No tax added (Switzerland)");
    expect(document.body.textContent).toContain(billingEnglish["billing.pricing.faqTaxAnswerNoTax"]);
    expect(document.body.textContent).not.toContain(billingEnglish["billing.pricing.faqTaxAnswerIncluded"]);
  });

  it("never shows a paid price before tax: it asks for the country, the postal code, or a moment instead", async () => {
    const cases: Array<[unknown, string]> = [
      [NO_COUNTRY, billingEnglish["billing.pricing.chooseCountry"]],
      [answer("USD", { country: "US", postal_code: null, status: "POSTAL_CODE_NEEDED" }, null), billingEnglish["billing.pricing.enterPostalCode"]],
      [answer("USD", { country: "US", postal_code: null, status: "POSTAL_CODE_INVALID" }, null), billingEnglish["billing.checkout.postalCodeInvalid"]],
      [answer("EUR", { country: "DE", postal_code: null, status: "TAX_UNAVAILABLE" }, null), billingEnglish["billing.pricing.unavailable"]],
      // A hand-made answer without the fields (the contract client always parses them in) is no price either.
      [{ currency: "USD", plans: PLAN_IDS.map((plan_id) => ({ plan_id, net_prices: NETS[plan_id], allowance_vs_plus: ALLOWANCE[plan_id] })) },
        billingEnglish["billing.pricing.unavailable"]]
    ];
    for (const [plans, prompt] of cases) {
      mocks.getBillingPlans.mockResolvedValue(plans);
      const document = await renderPricing();
      for (const card of paidCards(document)) {
        expect(card.textContent, prompt).toContain(prompt);
        expect(card.textContent, prompt).not.toMatch(/\$|€|RON|a month|Tax included|No tax added/u);
        // The way to each plan stays.
        expect(card.querySelector("a")?.getAttribute("href")).toMatch(/^\/checkout\?plan=/u);
      }
      // Free costs nothing anywhere, so it keeps its price.
      expect(document.querySelector('[data-plan="FREE"]')?.textContent).toContain("0.00 a month");
      expect(document.body.textContent, prompt).toContain(billingEnglish["billing.pricing.faqTaxAnswerChoose"]);
    }
    const english = Object.values(billingEnglish).join(" ");
    expect(english).not.toMatch(/plus tax|before tax/u);
  });

  it("asks a US or Canadian visitor for the postal code, and says when it does not fit", async () => {
    mocks.getBillingPlans.mockResolvedValue(answer("USD", { country: "US", postal_code: null, status: "POSTAL_CODE_NEEDED" }, null));
    const needed = await renderPricing();
    const postal = needed.querySelector("#pricing-postal-code") as HTMLInputElement;
    // Not required: a visitor priced for the US who picks another country is not held back by it.
    expect([postal.name, postal.required, postal.getAttribute("aria-invalid")]).toEqual(["postal_code", false, "false"]);
    expect(needed.querySelector('label[for="pricing-postal-code"]')?.textContent).toBe(billingEnglish["billing.checkout.postalCode"]);
    mocks.getBillingPlans.mockResolvedValue(answer("USD", { country: "US", postal_code: null, status: "POSTAL_CODE_INVALID" }, null));
    const invalid = await renderPricing({ country: "US", postal_code: "ABCDE" });
    expect(invalid.querySelector("#pricing-postal-code")?.getAttribute("aria-invalid")).toBe("true");
    expect(invalid.querySelector("#pricing-postal-code-error")?.textContent).toBe(billingEnglish["billing.checkout.postalCodeInvalid"]);
    // The code that did not fit is given back to correct, not cleared.
    expect((invalid.querySelector("#pricing-postal-code") as HTMLInputElement).value).toBe("ABCDE");
    mocks.getBillingPlans.mockResolvedValue(TEXAS);
    expect(((await renderPricing({ country: "US", postal_code: "75201" })).querySelector("#pricing-postal-code") as HTMLInputElement).value)
      .toBe("75201");
  });

  it("asks the plans for the place the visitor chose, and for the connection's when none was chosen", async () => {
    mocks.getBillingPlans.mockResolvedValue(TEXAS);
    await renderPricing({ country: "US", postal_code: "75201" });
    expect(mocks.getBillingPlans).toHaveBeenLastCalledWith({ country: "US", postalCode: "75201" });
    await renderPricing();
    expect(mocks.getBillingPlans).toHaveBeenLastCalledWith({});
    // A repeated or empty parameter is no choice.
    await renderPricing({ country: ["US", "DE"], postal_code: " " });
    expect(mocks.getBillingPlans).toHaveBeenLastCalledWith({});
    // With no place yet, the picker is empty and there is nothing to send.
    mocks.getBillingPlans.mockResolvedValue(NO_COUNTRY);
    const empty = await renderPricing();
    expect(empty.querySelector("#pricing-region-value")?.textContent).toBe(billingEnglish["billing.checkout.country"]);
    expect(empty.querySelector('input[name="country"]')).toBeNull();
    expect((empty.querySelector('[data-pricing-place] button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("never shows a dollar amount of AI credit", async () => {
    mocks.getBillingPlans.mockResolvedValue(TEXAS);
    const text = (await renderPricing()).body.textContent ?? "";
    for (const credit of ["$0.33", "$6.60", "$220.00", "0.05"]) expect(text).not.toContain(credit);
  });

  it("is not found when billing is off, and says so plainly when the plans cannot be read", async () => {
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "Not found"));
    await expect(PricingPage()).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.getBillingPlans.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "Unavailable"));
    const document = await renderPricing();
    expect(document.body.textContent).toContain("The plans can't be shown right now. Please try again in a minute.");
    expect(document.querySelector("[data-plan]")).toBeNull();
    expect(document.querySelector("[data-pricing-place]")).toBeNull();
    // No cards, no note about their currency.
    expect(document.body.textContent).not.toContain(CURRENCY_NOTE);
  });

  it("speaks the reader's locale", async () => {
    mocks.getBillingPlans.mockResolvedValue(ROMANIA);
    mocks.locale = "ro";
    const document = await renderPricing();
    expect(document.querySelector("h1")?.textContent).not.toBe("Choose how much you debate");
    expect(document.body.textContent).toContain(billingRomanian["billing.pricing.currencyNote"]);
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain(formatMoney("ro", "121.00", "RON"));
    expect(plus.textContent).toContain("Taxe incluse (21%, România)");
    expect(document.body.textContent).toContain(billingRomanian["billing.pricing.faqTaxAnswerIncluded"]);
    expect(document.querySelector('label[for="pricing-region-trigger"]')?.textContent).toBe(billingRomanian["billing.checkout.country"]);
  });
});
