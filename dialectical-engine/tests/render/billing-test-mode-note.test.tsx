// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * While this server's card payments run on NETOPIA's sandbox, the pricing page, the checkout's card step, the card
 * change in Settings and the landing's price line say that payments are test-only and which test card to use. The
 * pages learn it from GET /v1/billing/plans at every request (its `environment`), never from a build-time value, so
 * the note goes away by itself when the server is switched to live payments. Only the API is answered here.
 */
const mocks = vi.hoisted(() => ({
  locale: "en",
  session: null as string | null,
  getBillingPlans: vi.fn()
}));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("../../apps/ui/lib/i18n/locales.js");
  return {
    cookies: async () => ({
      get: (name: string) => name === "__Host-debateai-session" && mocks.session !== null
        ? { value: mocks.session }
        : name === LOCALE_COOKIE ? { value: mocks.locale } : undefined
    }),
    headers: async () => new Headers({ "user-agent": "billing-test-mode-note-test" })
  };
});
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({
    getBillingPlans: mocks.getBillingPlans,
    readSession: async () => ({ user: { id: "u" } }),
    readAgeConfirmation: async () => ({ status: "confirmed" })
  })
}));

import CheckoutPage from "../../apps/ui/app/checkout/page.js";
import PricingPage from "../../apps/ui/app/pricing/page.js";
import CardChangePage from "../../apps/ui/app/settings/card/page.js";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import { CheckoutFlow, type CheckoutClient } from "../../apps/ui/components/billing/CheckoutFlow.js";
import { LandingPricing } from "../../apps/ui/components/landing/LandingPricing.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import billingRomanian from "../../apps/ui/messages/ro/billing.json" with { type: "json" };
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };

const EN = billingEnglish as Readonly<Record<string, string>>;
const NOTE = EN["billing.testMode.notice"]!;
const NOTE_RO = (billingRomanian as Readonly<Record<string, string>>)["billing.testMode.notice"]!;
const SESSION = "t".repeat(43);
const CONSENT = Object.freeze({ version: "consent-renewal-1", sha256: "a".repeat(64) });
const CONSENTS = Object.freeze({ renewal: CONSENT, immediateStart: { version: "consent-immediate-1", sha256: "b".repeat(64) } });

/** GET /v1/billing/plans for a visitor whose place is not priced yet, naming the payment system as asked. */
function plans(environment?: "sandbox" | "live") {
  return Object.freeze({
    currency: "USD", place: { country: null, postal_code: null, status: "COUNTRY_NEEDED" }, tax: null,
    plans: [
      { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: null, allowance_vs_plus: "0.05" },
      { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: null, allowance_vs_plus: "1" }
    ],
    ...(environment === undefined ? {} : { environment })
  });
}
const ENVIRONMENTS: ReadonlyArray<readonly [string, "sandbox" | "live" | undefined, boolean]> = [
  ["sandbox", "sandbox", true], ["live", "live", false], ["no environment named", undefined, false]
];

const documentOf = (node: ReactNode): Document => new JSDOM(renderToStaticMarkup(node)).window.document;
const notes = (root: ParentNode): string[] => [...root.querySelectorAll('[role="note"]')].map((note) => note.textContent ?? "");

/** The props a server page hands one of its components, read from the element tree it returns (nothing is rendered). */
function propsOf(node: unknown, type: unknown): Record<string, unknown> | undefined {
  if (node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf(child, type);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) return element.props;
  return propsOf(element.props?.children, type);
}

beforeEach(() => {
  mocks.locale = "en";
  mocks.session = null;
  mocks.getBillingPlans.mockReset();
});

describe("the test-mode note's words", () => {
  it("says the payments are not real and quotes the sandbox test card exactly as the deployment guide documents it", () => {
    expect(NOTE).toBe("Test mode: payments on this site are not real and no money is taken. On the payment page, use the test "
      + "card 9900 0048 1022 5098 (any future expiry, CVV 111), never your own card.");
    expect(readFileSync("deploy/vps/README.md", "utf8")).toContain("9900 0048 1022 5098 (any future expiry, CVV 111)");
    // Romanian: the formal address, the same card details, and ș/ț with a comma below.
    expect(NOTE_RO).toContain("9900 0048 1022 5098");
    expect(NOTE_RO).toContain("CVV 111");
    expect(NOTE_RO).toMatch(/folosiți/u);
    expect(NOTE_RO).not.toMatch(/[şţŞŢ]/u);
  });
});

describe("/pricing", () => {
  for (const [label, environment, shown] of ENVIRONMENTS) {
    it(`${shown ? "shows a" : "shows no"} test-mode note under the lede when the plans list names ${label}`, async () => {
      mocks.getBillingPlans.mockResolvedValue(plans(environment));
      const document = documentOf(await PricingPage({}));
      expect(notes(document)).toEqual(shown ? [NOTE] : []);
      if (shown) {
        const note = document.querySelector('p.pricingNote[role="note"]');
        expect(note?.previousElementSibling?.className).toBe("setLede");
      }
    });
  }

  it("says it in the reader's language", async () => {
    mocks.locale = "ro";
    mocks.getBillingPlans.mockResolvedValue(plans("sandbox"));
    expect(notes(documentOf(await PricingPage({})))).toEqual([NOTE_RO]);
  });
});

describe("the checkout and the card change pages read the switch from the plans list", () => {
  for (const [label, environment, shown] of ENVIRONMENTS) {
    it(`hands the flows testMode ${String(shown)} when the plans list names ${label}`, async () => {
      mocks.session = SESSION;
      mocks.getBillingPlans.mockResolvedValue(plans(environment));
      const checkout = propsOf(await CheckoutPage({ searchParams: Promise.resolve({ plan: "PLUS" }) }), CheckoutFlow);
      expect(checkout?.testMode).toBe(shown);
      const card = propsOf(await CardChangePage({}), CardChangeFlow);
      expect(card?.testMode).toBe(shown);
    });
  }
});

describe("the flows that leave for NETOPIA's page", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  async function settle(): Promise<void> {
    for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
  }
  const quote = Object.freeze({
    quote_ref: "11111111-1111-4111-8111-111111111111", plan_id: "PLUS", net: "20.00", tax: "3.80", total: "23.80",
    currency: "EUR", tax_name: "MwSt.", tax_rate_bp: 1900, tax_country: "DE", tax_region: null, tax_status: "TAXABLE",
    country: "DE", ip_country: "DE", country_confirm_needed: false, address_required: false,
    renews_on: "2026-10-29T10:00:00.000Z", withdrawal_days: 14, expires_at: "2026-09-29T10:30:00.000Z"
  });
  async function renderCheckout(testMode?: boolean): Promise<void> {
    const client = { createBillingQuote: vi.fn(async () => quote), startBillingCheckout: vi.fn(), getBillingCharge: vi.fn() };
    await act(async () => {
      root.render(<CheckoutFlow planId="PLUS" locale="en" catalog={billingEnglish} consents={CONSENTS}
        client={client as unknown as CheckoutClient} {...(testMode === undefined ? {} : { testMode })} />);
    });
    await settle();
  }

  it("checkout: shows the note between the card sentence and 'Subscribe and pay' in test mode", async () => {
    await renderCheckout(true);
    const note = container.querySelector<HTMLElement>('p.billingNote[role="note"]');
    expect(note?.textContent).toBe(NOTE);
    expect(note?.previousElementSibling?.textContent).toBe(EN["billing.checkout.cardNote"]);
    expect(note?.nextElementSibling?.querySelector("button")?.textContent).toBe(EN["billing.checkout.continueToCard"]);
  });

  it("checkout: shows no note with live payments, nor when the page says nothing", async () => {
    await renderCheckout(false);
    expect(container.textContent).toContain(EN["billing.checkout.cardNote"]);
    expect(notes(container)).toEqual([]);
    act(() => root.unmount());
    root = createRoot(container);
    await renderCheckout();
    expect(container.textContent).toContain(EN["billing.checkout.cardNote"]);
    expect(notes(container)).toEqual([]);
  });

  async function renderCardChange(testMode?: boolean): Promise<void> {
    const client = {
      getBillingCardDetails: vi.fn(async () => ({
        country: "RO", region: "Cluj", first_name: "Ana", last_name: "Pop", phone: "+40712345678",
        street: "Strada Memorandumului 1", city: "Cluj-Napoca", postal_code: "400001"
      })),
      getBillingSubscription: vi.fn(async () => ({ subscription: { renewal_total: "24.20", currency: "USD" } })),
      startCardChange: vi.fn(), getBillingCharge: vi.fn()
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        client={client as unknown as CardChangeClient} {...(testMode === undefined ? {} : { testMode })} />);
    });
    await settle();
  }

  it("card change: shows the note under the 'nothing is charged' sentence in test mode, before the check", async () => {
    await renderCardChange(true);
    const note = container.querySelector<HTMLElement>('p.billingNote[role="note"]');
    expect(note?.textContent).toBe(NOTE);
    expect(note?.previousElementSibling?.textContent).toBe(EN["billing.card.noHoldNote"]);
    expect(container.textContent).toContain(EN["billing.card.checkCard"]);
  });

  it("card change: shows no note with live payments, nor when the page says nothing", async () => {
    await renderCardChange(false);
    expect(container.textContent).toContain(EN["billing.card.noHoldNote"]);
    expect(notes(container)).toEqual([]);
    act(() => root.unmount());
    root = createRoot(container);
    await renderCardChange();
    expect(container.textContent).toContain(EN["billing.card.noHoldNote"]);
    expect(notes(container)).toEqual([]);
  });
});

describe("the landing's price line", () => {
  const catalog = { ...homeEnglish, ...chromeEnglish };
  const section = (node: ReactNode): Element => documentOf(node).querySelector('[data-landing-section="pricing"]')!;

  it("carries the note the page hands it while billing is on", () => {
    const pricing = section(<LandingPricing catalog={catalog} lowestPaidPrice="$20.00" tax="NONE" billingOn testModeNote={NOTE} />);
    expect(notes(pricing)).toEqual([NOTE]);
    expect(pricing.querySelector('p.lpPricing[role="note"]')?.previousElementSibling?.id).toBe("pricing");
  });

  it("carries none without a note, and none while billing is off", () => {
    expect(notes(section(<LandingPricing catalog={catalog} lowestPaidPrice="$20.00" tax="NONE" billingOn />))).toEqual([]);
    expect(notes(section(<LandingPricing catalog={catalog} lowestPaidPrice={null} billingOn={false} testModeNote={NOTE} />)))
      .toEqual([]);
  });
});
