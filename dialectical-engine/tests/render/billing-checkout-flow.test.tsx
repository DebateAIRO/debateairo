// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUCHAREST_SECTORS, ContractHttpError, ROMANIA_COUNTIES } from "@debateai/contract";
import { CheckoutFlow, type CheckoutClient } from "../../apps/ui/components/billing/CheckoutFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every English sentence is read from the catalogue, so N20's rewording changes no expectation here. */
const EN = billingEnglish as Readonly<Record<string, string>>;
const CONSENTS = Object.freeze({
  renewal: { version: "consent-renewal-1", sha256: "a".repeat(64) },
  immediateStart: { version: "consent-immediate-1", sha256: "b".repeat(64) }
});
const PAGE = "https://secure-sandbox.netopia-payments.com/ui/card?p=0123456789ab";
const STARTED = Object.freeze({ redirect_url: PAGE, charge_ref: "0123456789abcdef0123456789abcdef", environment: "sandbox" as const });
/** N18's BillingQuoteResponse, field for field (a connection in Germany, priced for Germany). */
function quote(overrides: Record<string, unknown> = {}) {
  return {
    quote_ref: "11111111-1111-4111-8111-111111111111", plan_id: "PLUS", net: "20.00", tax: "3.80", total: "23.80",
    currency: "USD", tax_name: "MwSt.", tax_rate_bp: 1900, tax_country: "DE", tax_region: null, tax_status: "TAXABLE",
    country: "DE", ip_country: "DE", country_confirm_needed: false, address_required: false,
    renews_on: "2026-10-29T10:00:00.000Z", withdrawal_days: 14, expires_at: "2026-09-29T10:30:00.000Z", ...overrides
  };
}

let container: HTMLDivElement;
let root: Root;
let client: { [K in keyof CheckoutClient]: ReturnType<typeof vi.fn> };
let goToPayment: ReturnType<typeof vi.fn>;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = { createBillingQuote: vi.fn(), startBillingCheckout: vi.fn(), getBillingCharge: vi.fn() };
  goToPayment = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
}
async function render(navigate?: (href: string) => void): Promise<void> {
  await act(async () => {
    root.render(<CheckoutFlow planId="PLUS" locale="en" catalog={billingEnglish} consents={CONSENTS}
      client={client as unknown as CheckoutClient} navigate={navigate} goToPayment={goToPayment} />);
  });
  await settle();
}
async function remount(navigate?: (href: string) => void): Promise<void> {
  act(() => root.unmount());
  root = createRoot(container);
  await render(navigate);
}
const text = (): string => container.textContent ?? "";
const input = (id: string): HTMLInputElement => container.querySelector<HTMLInputElement>(`input#${id}`)!;
const select = (id: string): HTMLSelectElement => container.querySelector<HTMLSelectElement>(`select#${id}`)!;
const button = (key: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === EN[key]);
const checkbox = (index: number): HTMLInputElement => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]!;
async function click(element: HTMLElement): Promise<void> {
  await act(async () => { element.click(); });
  await settle();
}
async function fill(element: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(element: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
/** The billing block NETOPIA needs, for a German buyer (no region asked). */
async function fillDetails(): Promise<void> {
  await fill(input("checkout-firstName"), " Anna ");
  await fill(input("checkout-lastName"), "Schmidt");
  await fill(input("checkout-phone"), "+49 151 1234 5678");
  await fill(input("checkout-street"), "Invalidenstrasse 1");
  await fill(input("checkout-city"), "Berlin");
  await fill(input("checkout-postalCode"), "10115");
}
async function consentAndContinue(): Promise<void> {
  await click(checkbox(0));
  await click(checkbox(1));
  await click(button("billing.checkout.continueToCard")!);
}

describe("N19 CheckoutFlow on NETOPIA's page", () => {
  it("shows the billing block at once, prices it, takes both consents with the total, and leaves for NETOPIA's page", async () => {
    client.createBillingQuote.mockResolvedValueOnce(quote({ address_required: true })).mockResolvedValueOnce(quote());
    client.startBillingCheckout.mockResolvedValue(STARTED);
    await render();
    expect(client.createBillingQuote).toHaveBeenCalledWith({ plan_id: "PLUS" });
    expect(select("checkout-country").value).toBe("DE");
    expect(text()).toContain(EN["billing.checkout.billingNote"]);
    // The phone field offers the connection country's calling code.
    expect(input("checkout-phone").value).toBe("+49 ");
    expect(button("billing.checkout.continueToCard")!.disabled).toBe(true);
    expect(button("billing.checkout.showPrice")!.disabled).toBe(true);
    await fillDetails();
    expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({
      plan_id: "PLUS", country: "DE", first_name: "Anna", last_name: "Schmidt", phone: "+49 151 1234 5678",
      street: "Invalidenstrasse 1", city: "Berlin", postal_code: "10115"
    });
    expect(text()).toContain("Plus — $20.00 + $3.80 MwSt. (19%, Germany) = $23.80 per month.");
    // Spec §2.18: the card-saving agreement names the monthly total (live once N20 adds {total} to the sentence).
    expect(text()).toContain(EN["billing.consent.renewal"]!.replace("{total}", "$23.80"));
    expect(text()).toContain(EN["billing.checkout.cardNote"]);
    const next = button("billing.checkout.continueToCard")!;
    await click(checkbox(0));
    expect(next.disabled).toBe(true);
    await click(checkbox(1));
    expect(next.disabled).toBe(false);
    await click(next);
    expect(client.startBillingCheckout).toHaveBeenCalledWith({
      quote_ref: "11111111-1111-4111-8111-111111111111", locale: "en",
      consents: { renewal_terms: CONSENTS.renewal, immediate_start: CONSENTS.immediateStart }
    });
    // Spec §2.6.2 step 7: a top-level navigation to the page the server answered; no frame, no script of NETOPIA's.
    expect(goToPayment.mock.calls).toEqual([[PAGE]]);
    expect(container.querySelectorAll("iframe, script")).toHaveLength(0);
  });

  it("asks Romania for the county from SmartBill's list and, in Bucharest, a sector as the city (R-15, P2-M15)", async () => {
    client.createBillingQuote.mockResolvedValue(quote({ country: "RO", ip_country: "RO", tax_country: "RO", address_required: true }));
    await render();
    expect(input("checkout-phone").value).toBe("+40 ");
    const county = select("checkout-region");
    expect([...county.options].map((option) => option.value)).toEqual(["", ...ROMANIA_COUNTIES]);
    await fill(input("checkout-firstName"), "Ana");
    await fill(input("checkout-lastName"), "Pop");
    await fill(input("checkout-phone"), "+40 712 345 678");
    await fill(input("checkout-street"), "Strada Lipscani 1");
    await fill(input("checkout-postalCode"), "030031");
    await choose(county, "Bucuresti");
    const sector = select("checkout-city");
    expect([...sector.options].map((option) => option.value)).toEqual(["", ...BUCHAREST_SECTORS]);
    expect(button("billing.checkout.showPrice")!.disabled).toBe(true);
    await choose(sector, "Sector 3");
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith(expect.objectContaining({
      country: "RO", region: "Bucuresti", city: "Sector 3", postal_code: "030031", first_name: "Ana"
    }));
    // Moving the county away from Bucharest clears the sector, so "Sector 3" never names a city elsewhere.
    await choose(select("checkout-region"), "Ilfov");
    expect(input("checkout-city").value).toBe("");
  });

  it("asks the US and Canada for the state, and lets Ireland go without a postal code", async () => {
    client.createBillingQuote.mockResolvedValue(quote({ address_required: true }));
    await render();
    await fillDetails();
    await choose(select("checkout-country"), "US");
    expect(input("checkout-phone").value).toBe("+49 151 1234 5678");
    expect(button("billing.checkout.showPrice")!.disabled).toBe(true);
    await fill(input("checkout-region"), "NY");
    expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
    await choose(select("checkout-country"), "IE");
    expect(container.querySelector("#checkout-region")).toBeNull();
    await fill(input("checkout-postalCode"), "");
    expect(container.querySelector("label[for='checkout-postalCode']")?.textContent).toBe(EN["billing.checkout.postalCodeOptional"]);
    expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote.mock.calls.at(-1)![0]).not.toHaveProperty("postal_code");
  });

  it("asks G3 when the person picks a country other than the connection's", async () => {
    client.createBillingQuote
      .mockResolvedValueOnce(quote({ country: "IT", ip_country: "IT", tax_name: "IVA", tax_rate_bp: 2200, tax_country: "IT" }))
      .mockResolvedValueOnce(quote({ ip_country: "IT", country_confirm_needed: true }));
    client.startBillingCheckout.mockResolvedValue(STARTED);
    await render();
    await choose(select("checkout-country"), "DE");
    await fillDetails();
    await click(button("billing.checkout.showPrice")!);
    expect(text()).toContain("Your connection looks like it's from Italy. Do you live in Germany?");
    await click(checkbox(0));
    await click(checkbox(1));
    expect(button("billing.checkout.continueToCard")!.disabled).toBe(true);
    await click(button("billing.checkout.confirmCountryYes")!);
    await click(button("billing.checkout.continueToCard")!);
    expect(client.startBillingCheckout).toHaveBeenCalledWith(expect.objectContaining({ country_confirmed: true }));
  });

  it("keeps the price disabled while the phone holds only its calling code", async () => {
    client.createBillingQuote.mockResolvedValue(quote({ address_required: true }));
    await render();
    await fill(input("checkout-firstName"), "Anna");
    await fill(input("checkout-lastName"), "Schmidt");
    await fill(input("checkout-street"), "Invalidenstrasse 1");
    await fill(input("checkout-city"), "Berlin");
    await fill(input("checkout-postalCode"), "10115");
    // The quote's schema refuses "+49" before any request leaves, so the page never asks with it.
    expect(input("checkout-phone").value).toBe("+49 ");
    expect(button("billing.checkout.showPrice")!.disabled).toBe(true);
    await fill(input("checkout-phone"), "+49 151 1234 5678");
    expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
  });

  it("takes the price away after any edit, so the next price carries the corrected details", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    await render();
    await fillDetails();
    const priced = async (): Promise<void> => {
      await click(button("billing.checkout.showPrice")!);
      expect(button("billing.checkout.continueToCard")).toBeDefined();
    };
    await priced();
    await fill(input("checkout-street"), "Unter den Linden 5");
    expect(button("billing.checkout.continueToCard")).toBeUndefined();
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith(expect.objectContaining({ street: "Unter den Linden 5" }));
    expect(button("billing.checkout.continueToCard")).toBeDefined();
    await fill(input("checkout-city"), "Potsdam");
    expect(button("billing.checkout.continueToCard")).toBeUndefined();
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith(expect.objectContaining({ city: "Potsdam" }));
    await click(button("billing.checkout.companyToggle")!);
    expect(button("billing.checkout.continueToCard")).toBeUndefined();
    await fill(input("checkout-company-name"), "Acme GmbH");
    await fill(input("checkout-company-vat"), "DE123456789");
    await fill(input("checkout-company-address"), "1 Hauptstraße, Berlin");
    await priced();
    await fill(input("checkout-company-name"), "Acme Berlin GmbH");
    expect(button("billing.checkout.continueToCard")).toBeUndefined();
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith(expect.objectContaining({
      street: "Unter den Linden 5", city: "Potsdam",
      company: { name: "Acme Berlin GmbH", vat_id: "DE123456789", address: "1 Hauptstraße, Berlin" }
    }));
    expect(button("billing.checkout.continueToCard")).toBeDefined();
  });

  it("drops a price that answers after an edit made while it was asked", async () => {
    let answer: (value: ReturnType<typeof quote>) => void = () => undefined;
    client.createBillingQuote.mockResolvedValueOnce(quote())
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    await render();
    await fillDetails();
    await click(button("billing.checkout.showPrice")!);
    await fill(input("checkout-street"), "Unter den Linden 5");
    await act(async () => { answer(quote()); });
    await settle();
    expect(button("billing.checkout.continueToCard")).toBeUndefined();
    expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
  });

  it("refuses to price a half-filled company block", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    await render();
    await fillDetails();
    await click(button("billing.checkout.companyToggle")!);
    await fill(input("checkout-company-name"), "Acme GmbH");
    expect(button("billing.checkout.showPrice")!.disabled).toBe(true);
    expect(text()).toContain(EN["billing.checkout.companyIncomplete"]);
    await fill(input("checkout-company-vat"), "DE123456789");
    await fill(input("checkout-company-address"), "1 Hauptstraße, Berlin");
    await click(button("billing.checkout.showPrice")!);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith(expect.objectContaining({
      company: { name: "Acme GmbH", vat_id: "DE123456789", address: "1 Hauptstraße, Berlin" }
    }));
  });

  it("words every refusal plainly and never leaves for a page it did not get", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    for (const [code, status, key] of [
      ["PAYMENT_PROVIDER_UNAVAILABLE", 503, "billing.checkout.formUnavailable"],
      ["BILLING_ADDRESS_REQUIRED", 422, "billing.checkout.detailsRequired"],
      ["QUOTE_EXPIRED", 409, "billing.checkout.quoteExpired"],
      ["LEGAL_DOCUMENT_STALE", 409, "billing.checkout.pageOutdated"],
      ["COUNTRY_CONFIRMATION_REQUIRED", 422, "billing.checkout.confirmCountryRequired"],
      ["ACCOUNT_ERASURE_PENDING", 409, "billing.checkout.erasurePending"],
      ["ADMISSION_RATE_LIMITED", 429, "billing.checkout.rateLimited"],
      ["AGE_CHECK_UNAVAILABLE", 503, "billing.checkout.genericError"]
    ] as const) {
      client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", status, "x", code));
      await remount();
      await consentAndContinue();
      expect(text(), code).toContain(EN[key]);
    }
    client.createBillingQuote.mockRejectedValueOnce(new ContractHttpError("UNPROCESSABLE", 422, "x", "BILLING_PHONE_INVALID"));
    await remount();
    expect(text()).toContain(EN["billing.checkout.phoneInvalid"]);
    expect(goToPayment).not.toHaveBeenCalled();
  });

  // N19b (A3 (a)): a failed start leaves a FAILED charge holding the quote's one use, so the next try needs a new price.
  for (const [code, status, key] of [
    ["PAYMENT_PROVIDER_UNAVAILABLE", 503, "billing.checkout.formUnavailable"],
    ["BILLING_ADDRESS_REQUIRED", 422, "billing.checkout.detailsRequired"]
  ] as const) {
    it(`a failed start (${status} ${code}) asks for a fresh price and never resends the used one`, async () => {
      const used = "22222222-2222-4222-8222-222222222222";
      const fresh = "33333333-3333-4333-8333-333333333333";
      client.createBillingQuote.mockResolvedValueOnce(quote())
        .mockResolvedValueOnce(quote({ quote_ref: used })).mockResolvedValueOnce(quote({ quote_ref: fresh }));
      client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", status, "x", code))
        .mockResolvedValueOnce(STARTED);
      await render();
      await fillDetails();
      await click(button("billing.checkout.showPrice")!);
      await consentAndContinue();
      expect(client.startBillingCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ quote_ref: used }));
      expect(text()).toContain(EN[key]);
      // The used price is gone: nothing to continue with until the price is asked again.
      expect(button("billing.checkout.continueToCard")).toBeUndefined();
      expect(button("billing.checkout.showPrice")!.disabled).toBe(false);
      const asked = client.createBillingQuote.mock.calls.length;
      await click(button("billing.checkout.showPrice")!);
      expect(client.createBillingQuote).toHaveBeenCalledTimes(asked + 1);
      // The fresh price is accepted afresh: both confirmations start unticked.
      expect(checkbox(0).checked).toBe(false);
      expect(checkbox(1).checked).toBe(false);
      expect(button("billing.checkout.continueToCard")!.disabled).toBe(true);
      await consentAndContinue();
      expect(client.startBillingCheckout).toHaveBeenCalledTimes(2);
      expect(client.startBillingCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ quote_ref: fresh }));
      expect(client.startBillingCheckout.mock.calls.filter(([body]) => body.quote_ref === used)).toHaveLength(1);
      expect(goToPayment.mock.calls).toEqual([[PAGE]]);
    });
  }

  it("links the updated-Terms sentence to the accept screen, and sends the age gate and a lost session where they belong", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("FORBIDDEN", 403, "x", "LEGAL_REACCEPTANCE_REQUIRED"));
    await render();
    await consentAndContinue();
    const link = [...container.querySelectorAll("a")].find((candidate) => candidate.textContent === EN["billing.checkout.reacceptRequired"]);
    expect(link?.getAttribute("href")).toBe("/");
    const navigate = vi.fn();
    client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("FORBIDDEN", 403, "x", "AGE_CONFIRMATION_REQUIRED"));
    await remount(navigate);
    await consentAndContinue();
    client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("SESSION_REQUIRED", 401, "Session required"));
    await remount(navigate);
    await consentAndContinue();
    expect(navigate.mock.calls).toEqual([["/?next=%2Fcheckout%3Fplan%3DPLUS"], ["/login?next=%2Fcheckout%3Fplan%3DPLUS"]]);
    expect(goToPayment).not.toHaveBeenCalled();
  });

  it("waits on the open checkout's charge when the server says its payment is on its way, and offers Try again after a decline", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockResolvedValue({ state: "PENDING", charge_ref: STARTED.charge_ref });
    client.getBillingCharge.mockResolvedValue({ state: "NEEDS_ACTION", reason_code: "PAYMENT_DECLINED", kind: "INITIAL" });
    await render();
    await consentAndContinue();
    expect(goToPayment).not.toHaveBeenCalled();
    expect(client.getBillingCharge).toHaveBeenCalledWith(STARTED.charge_ref);
    expect(text()).toContain(EN["billing.checkout.failed"]);
    await click(button("billing.checkout.tryAgain")!);
    expect(client.createBillingQuote).toHaveBeenCalledTimes(2);
  });

  it("after two minutes of waiting says not to pay again and leads to Settings", async () => {
    vi.useFakeTimers();
    try {
      client.createBillingQuote.mockResolvedValue(quote());
      client.startBillingCheckout.mockResolvedValue({ state: "PENDING", charge_ref: STARTED.charge_ref });
      client.getBillingCharge.mockResolvedValue({ state: "PENDING", reason_code: null, kind: "INITIAL" });
      await render();
      await consentAndContinue();
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(text()).toContain(EN["billing.checkout.doNotPayAgain"]);
      expect(button("billing.checkout.tryAgain")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("N25b the payment marks under Continue (spec §2.18)", () => {
  const marksImages = (): string[][] => [...container.querySelectorAll('[role="group"] img')]
    .map((image) => [image.getAttribute("src") ?? "", image.getAttribute("alt") ?? ""]);
  async function renderWithMarks(paymentMarks?: Readonly<{ netopia: boolean; visa: boolean; mastercard: boolean }>): Promise<void> {
    await act(async () => {
      root.render(<CheckoutFlow planId="PLUS" locale="en" catalog={billingEnglish} consents={CONSENTS}
        client={client as unknown as CheckoutClient} goToPayment={goToPayment} paymentMarks={paymentMarks} />);
    });
    await settle();
  }

  it("shows the marks it is given, NETOPIA's first, in the footer's words, right under the Continue button", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    await renderWithMarks({ netopia: true, visa: true, mastercard: true });
    expect(marksImages()).toEqual([
      ["/payment-marks/netopia.svg", "NETOPIA Payments"],
      ["/payment-marks/visa.svg", "Visa"],
      ["/payment-marks/mastercard.svg", "Mastercard"]
    ]);
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Cards we accept");
    expect(group.previousElementSibling?.contains(button("billing.checkout.continueToCard")!)).toBe(true);
  });

  it("shows only the marks whose files are there, and no group when none is given or none is there", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    await renderWithMarks({ netopia: true, visa: false, mastercard: false });
    expect(marksImages()).toEqual([["/payment-marks/netopia.svg", "NETOPIA Payments"]]);
    await renderWithMarks({ netopia: false, visa: false, mastercard: false });
    expect(button("billing.checkout.continueToCard")).toBeDefined();
    expect(container.querySelector('[role="group"]')).toBeNull();
    await renderWithMarks();
    expect(button("billing.checkout.continueToCard")).toBeDefined();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
