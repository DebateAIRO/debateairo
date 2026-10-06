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

const PLANS = Object.freeze({
  currency: "USD" as const,
  plans: [
    { plan_id: "FREE" as const, net_price: "0.00", allowance_vs_plus: "0.04" },
    { plan_id: "PLUS" as const, net_price: "20.00", allowance_vs_plus: "1" },
    { plan_id: "PRO" as const, net_price: "50.00", allowance_vs_plus: "4" },
    { plan_id: "MAX" as const, net_price: "200.00", allowance_vs_plus: "30" }
  ]
});

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
  });

  it("speaks the reader's locale", async () => {
    mocks.getBillingPlans.mockResolvedValue(PLANS);
    mocks.locale = "ro";
    const document = await renderPricing();
    expect(document.querySelector("h1")?.textContent).not.toBe("Choose how much you debate");
  });
});
