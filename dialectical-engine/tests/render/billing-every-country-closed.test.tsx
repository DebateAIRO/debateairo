import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * NETOPIA's check of the public main site, with purchases off (the owner's choice of 24 October 2026): billing ON and
 * every country closed for payment. The website never reads the country policy: billing is on when the plans route
 * answers (P19's billingIsOn()), and the plans route answers whatever the countries (the integration suite
 * billing-every-country-closed.test.ts proves it). So with billing on and PAYMENT_MARKS_AVAILABLE=visa,mastercard,
 * the pages NETOPIA reads render with their footer, the card marks and the links to pricing, cancel and withdraw. The
 * footer facts are the real ones (footerBilling.ts and paymentMarks.ts read the setting); only the API is answered here.
 */
const mocks = vi.hoisted(() => ({ getBillingPlans: vi.fn() }));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({ get: (name: string) => (name === LOCALE_COOKIE ? { value: "en" } : undefined) }),
    headers: async () => new Headers({ "user-agent": "billing-every-country-closed-test" })
  };
});
// P19's one plans read: the plans route answered, so billing is on (what /cancel, /withdraw and the footer ask).
vi.mock("@/lib/billing/serverBilling", () => ({ billingIsOn: async () => true }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ getBillingPlans: mocks.getBillingPlans })
}));

import CancelPage from "../../apps/ui/app/cancel/page.js";
import PricingPage from "../../apps/ui/app/pricing/page.js";
import TermsPage from "../../apps/ui/app/terms/page.js";
import WithdrawPage from "../../apps/ui/app/withdraw/page.js";

/** GET /v1/billing/plans as the API answers it with every country closed (the integration suite's answer). */
const PLANS = Object.freeze({
  currency: "USD" as const,
  plans: [
    { plan_id: "FREE" as const, net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, allowance_vs_plus: "0.04" },
    { plan_id: "PLUS" as const, net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, allowance_vs_plus: "1" },
    { plan_id: "PRO" as const, net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, allowance_vs_plus: "4" },
    { plan_id: "MAX" as const, net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, allowance_vs_plus: "30" }
  ]
});
const BILLING_LINKS = ["/pricing", "/cancel", "/withdraw"];
const page = async (render: () => Promise<JSX.Element>): Promise<Document> =>
  new JSDOM(renderToStaticMarkup(await render())).window.document;

let marksBefore: string | undefined;
beforeAll(() => {
  marksBefore = process.env.PAYMENT_MARKS_AVAILABLE;
  process.env.PAYMENT_MARKS_AVAILABLE = "visa,mastercard";
  mocks.getBillingPlans.mockResolvedValue(PLANS);
});
afterAll(() => {
  if (marksBefore === undefined) delete process.env.PAYMENT_MARKS_AVAILABLE;
  else process.env.PAYMENT_MARKS_AVAILABLE = marksBefore;
});

describe("NETOPIA's check: billing on with every country closed for payment, on the website", () => {
  const PAGES: ReadonlyArray<readonly [string, () => Promise<JSX.Element>]> = [
    ["/pricing", PricingPage], ["/withdraw", WithdrawPage], ["/cancel", CancelPage], ["/terms", () => TermsPage({})]
  ];

  for (const [path, render] of PAGES) {
    it(`billing on with every country closed: ${path} renders, and its footer shows the Visa and Mastercard marks and the billing links`, async () => {
      const document = await page(render);
      const footer = document.querySelector("footer.siteFooterFull");
      expect(footer, path).not.toBeNull();
      const marks = [...footer!.querySelectorAll('.siteFooterMarks[role="group"] img')];
      expect(marks.map((image) => [image.getAttribute("src"), image.getAttribute("alt")]), path).toEqual([
        ["/payment-marks/visa.svg", "Visa"], ["/payment-marks/mastercard.svg", "Mastercard"]
      ]);
      for (const href of BILLING_LINKS) expect(footer!.querySelector(`a[href="${href}"]`), `${path} ${href}`).not.toBeNull();
    });
  }

  it("billing on with every country closed: /pricing shows the four plans with their prices and the way to each", async () => {
    const document = await page(PricingPage);
    expect([...document.querySelectorAll("[data-plan]")].map((card) => card.getAttribute("data-plan"))).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    const plus = document.querySelector('[data-plan="PLUS"]')!;
    expect(plus.textContent).toContain("$20.00 a month");
    expect(plus.querySelector("a")?.getAttribute("href")).toBe("/checkout?plan=PLUS");
    expect(document.querySelector('[data-plan="PRO"]')?.textContent).toContain("$50.00 a month");
    expect(document.querySelector('[data-plan="MAX"]')?.textContent).toContain("$200.00 a month");
    expect(document.body.textContent).not.toContain("The plans can't be shown right now.");
  });

  it("billing on with every country closed: /withdraw and /cancel keep their own content", async () => {
    expect((await page(WithdrawPage)).body.textContent).toContain("within 14 days of subscribing");
    const cancel = await page(CancelPage);
    expect(cancel.querySelector("h1#cancel-title")?.textContent).toBe("Cancel your plan");
    expect(cancel.querySelector("input#cancel-email")).not.toBeNull();
  });
});
