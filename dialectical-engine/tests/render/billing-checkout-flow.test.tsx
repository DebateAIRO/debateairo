// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { CheckoutFlow, type CheckoutClient } from "../../apps/ui/components/billing/CheckoutFlow.js";
import type { XMoneyGlobal, XMoneyPaymentFormOptions } from "../../apps/ui/lib/billing/xmoneySdk.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONSENTS = Object.freeze({
  renewal: { version: "consent-renewal-1", sha256: "a".repeat(64) },
  immediateStart: { version: "consent-immediate-1", sha256: "b".repeat(64) }
});
const CHECKOUT = Object.freeze({
  public_key: "pk_test_x", order_payload: "cGF5bG9hZA==", order_checksum: "c2lnbg==",
  charge_ref: "0123456789abcdef0123456789abcdef", sdk_environment: "stage" as const
});
/** P8b's BillingQuoteResponse, field for field (a connection in Germany, priced for Germany). */
function quote(overrides: Record<string, unknown> = {}) {
  return {
    quote_ref: "11111111-1111-4111-8111-111111111111", plan_id: "PLUS", net: "20.00", tax: "3.80", total: "23.80",
    tax_name: "MwSt.", tax_rate_bp: 1900, tax_country: "DE", tax_region: null, tax_status: "TAXABLE",
    country: "DE", ip_country: "DE", country_confirm_needed: false, address_required: false,
    renews_on: "2026-10-29T10:00:00.000Z", withdrawal_days: 14, expires_at: "2026-09-29T10:30:00.000Z", ...overrides
  };
}

let container: HTMLDivElement;
let root: Root;
let mounted: XMoneyPaymentFormOptions[];
let submit: ReturnType<typeof vi.fn>;
let client: { [K in keyof CheckoutClient]: ReturnType<typeof vi.fn> };

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = [];
  submit = vi.fn();
  client = { createBillingQuote: vi.fn(), startBillingCheckout: vi.fn(), getBillingCharge: vi.fn() };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const loadSdk = async (): Promise<XMoneyGlobal> => ({
  paymentForm: (options) => { mounted.push(options); return { submit, destroy: () => undefined }; }
});

/** The flow chains several awaited calls (quote → checkout → SDK load → mount); let each hop settle. */
async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
}
async function render(navigate?: (href: string) => void): Promise<void> {
  await act(async () => {
    root.render(<CheckoutFlow planId="PLUS" locale="en" catalog={billingEnglish} consents={CONSENTS}
      sdkOrigin="https://secure-stage.xmoney.com" nonce="AAAAAAAAAAAAAAAAAAAAAA=="
      client={client as unknown as CheckoutClient} loadSdk={loadSdk} navigate={navigate} />);
  });
  await settle();
}
const countrySelect = (): HTMLSelectElement => container.querySelector<HTMLSelectElement>("#checkout-country")!;
async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const text = (): string => container.textContent ?? "";
const button = (label: string): HTMLButtonElement =>
  [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!;
const checkbox = (index: number): HTMLInputElement => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]!;
async function click(element: HTMLElement): Promise<void> {
  await act(async () => { element.click(); });
  await settle();
}
async function fill(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("P19 CheckoutFlow", () => {
  it("prices the connection's country at once, takes both consents with their manifest pairs, and pays through xMoney", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockResolvedValue(CHECKOUT);
    client.getBillingCharge.mockResolvedValue({ state: "SUCCEEDED", reason_code: null });
    await render();
    // P8b's pre-fill: no country on the first quote; the answer's `country` is the connection's, and it is selected.
    expect(client.createBillingQuote).toHaveBeenCalledTimes(1);
    expect(client.createBillingQuote).toHaveBeenCalledWith({ plan_id: "PLUS" });
    expect(text()).toContain(
      "Plus — $20.00 + $3.80 MwSt. (19%, Germany) = $23.80 per month. Renews on the 29th of each month until you cancel."
    );
    expect(countrySelect().value).toBe("DE");
    const next = button("Continue to card details");
    expect(next.disabled).toBe(true);
    await click(checkbox(0));
    expect(next.disabled).toBe(true);
    await click(checkbox(1));
    expect(next.disabled).toBe(false);
    await click(next);
    expect(client.startBillingCheckout).toHaveBeenCalledWith({
      quote_ref: "11111111-1111-4111-8111-111111111111",
      locale: "en",
      consents: { renewal_terms: CONSENTS.renewal, immediate_start: CONSENTS.immediateStart }
    });
    expect(mounted).toHaveLength(1);
    await act(async () => { mounted[0]!.onReady(); });
    await click(button("Subscribe and pay"));
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { mounted[0]!.onPaymentComplete({}); });
    await settle();
    expect(client.getBillingCharge).toHaveBeenCalledWith(CHECKOUT.charge_ref);
    expect(text()).toContain("Your Plus plan is active. A confirmation email is on its way.");
    expect(document.querySelectorAll('script[src*="xmoney"]')).toHaveLength(0);
  });

  it("says G2 plainly when the country cannot pay, and offers no way forward to a card", async () => {
    client.createBillingQuote.mockRejectedValue(new ContractHttpError("FORBIDDEN", 403, "x", "COUNTRY_PAYMENT_UNAVAILABLE"));
    await render();
    expect(text()).toContain("Paid plans aren't available in your country yet. You can keep using the Free plan.");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Continue to card details")).toBe(false);
    // An unknown address or Tor reads the same (P8b's COUNTRY_UNKNOWN / TOR_REFUSED for a quote without a country).
    client.createBillingQuote.mockRejectedValue(new ContractHttpError("FORBIDDEN", 403, "x", "COUNTRY_UNKNOWN"));
    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(text()).toContain("Paid plans aren't available in your country yet. You can keep using the Free plan.");
    expect(countrySelect().value).toBe("");
  });

  it("asks G3 when the person picks a country other than the connection's, and says the person confirmed it", async () => {
    client.createBillingQuote
      .mockResolvedValueOnce(quote({ country: "IT", ip_country: "IT", tax_name: "IVA", tax_rate_bp: 2200, tax_country: "IT" }))
      .mockResolvedValueOnce(quote({ ip_country: "IT", country_confirm_needed: true }));
    client.startBillingCheckout.mockResolvedValue(CHECKOUT);
    await render();
    expect(countrySelect().value).toBe("IT");
    await choose(countrySelect(), "DE");
    await click(button("Show the full price"));
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({ plan_id: "PLUS", country: "DE" });
    expect(text()).toContain("Your connection looks like it's from Italy. Do you live in Germany?");
    await click(checkbox(0));
    await click(checkbox(1));
    expect(button("Continue to card details").disabled).toBe(true);
    await click(button("Yes, I live there"));
    await click(button("Continue to card details"));
    expect(client.startBillingCheckout).toHaveBeenCalledWith(expect.objectContaining({ locale: "en", country_confirmed: true }));
  });

  it("prices Romania from the connection, then asks for the name, city and county a SmartBill invoice needs (R-15)", async () => {
    const romania = {
      net: "20.00", tax: "4.20", total: "24.20", tax_name: "TVA", tax_rate_bp: 2100, tax_country: "RO",
      country: "RO", ip_country: "RO"
    };
    client.createBillingQuote
      .mockResolvedValueOnce(quote({ ...romania, address_required: true }))
      .mockResolvedValueOnce(quote(romania));
    client.startBillingCheckout.mockResolvedValue(CHECKOUT);
    await render();
    expect(client.createBillingQuote).toHaveBeenCalledWith({ plan_id: "PLUS" });
    expect(text()).toContain("Plus — $20.00 + $4.20 TVA (21%, Romania) = $24.20 per month.");
    expect(text()).toContain("A Romanian invoice needs your name, city and county.");
    // P8c would refuse BILLING_ADDRESS_REQUIRED for this quote, so the page never offers the card step for it.
    await click(checkbox(0));
    await click(checkbox(1));
    expect(button("Continue to card details").disabled).toBe(true);
    const showPrice = button("Show the full price");
    expect(showPrice.disabled).toBe(true);
    await fill(container.querySelector<HTMLInputElement>("#checkout-name")!, " Ana Pop ");
    await fill(container.querySelector<HTMLInputElement>("#checkout-city")!, "Cluj-Napoca");
    expect(showPrice.disabled).toBe(true);
    await fill(container.querySelector<HTMLInputElement>("#checkout-region")!, "Cluj");
    expect(showPrice.disabled).toBe(false);
    await click(showPrice);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({
      plan_id: "PLUS", country: "RO", region: "Cluj", city: "Cluj-Napoca", name: "Ana Pop"
    });
    await click(checkbox(0));
    await click(checkbox(1));
    expect(button("Continue to card details").disabled).toBe(false);
    await click(button("Continue to card details"));
    expect(client.startBillingCheckout).toHaveBeenCalledTimes(1);
  });

  it("lets the person pick another country, and asks the US and Canada for a postal code", async () => {
    client.createBillingQuote.mockResolvedValueOnce(quote());
    await render();
    await choose(countrySelect(), "US");
    const showPrice = button("Show the full price");
    expect(showPrice.disabled).toBe(true);
    await fill(container.querySelector<HTMLInputElement>("#checkout-postal")!, "10001");
    await click(button("Buying as a company?"));
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-name")!, "Acme Inc");
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-vat")!, "US123");
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-address")!, "1 Main St, New York");
    client.createBillingQuote.mockRejectedValueOnce(new ContractHttpError("UNPROCESSABLE", 422, "x", "TAX_ID_INVALID"));
    await click(showPrice);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({
      plan_id: "PLUS", country: "US", postal_code: "10001",
      company: { name: "Acme Inc", vat_id: "US123", address: "1 Main St, New York" }
    });
    expect(text()).toContain("That VAT number couldn't be confirmed. Check it, or buy without a company.");
  });

  it("asks for a fresh price when the quote expired between pricing and payment", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 409, "x", "QUOTE_EXPIRED"));
    await render();
    await click(checkbox(0));
    await click(checkbox(1));
    await click(button("Continue to card details"));
    expect(text()).toContain("This price has expired. Show the full price again to continue.");
    expect(mounted).toHaveLength(0);
  });

  it("after a bank decline offers Try again, which prices afresh", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockResolvedValue(CHECKOUT);
    client.getBillingCharge.mockResolvedValue({ state: "NEEDS_ACTION", reason_code: "PAYMENT_DECLINED" });
    await render();
    await click(checkbox(0));
    await click(checkbox(1));
    await click(button("Continue to card details"));
    await act(async () => { mounted[0]!.onReady(); });
    await click(button("Subscribe and pay"));
    await act(async () => { mounted[0]!.onPaymentComplete({}); });
    await settle();
    expect(text()).toContain("The payment didn't go through, and no money was taken. You can try again or use another card.");
    await click(button("Try again"));
    expect(client.createBillingQuote).toHaveBeenCalledTimes(2);
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({ plan_id: "PLUS", country: "DE" });
  });

  it("a checkout whose payment is already in flight shows that charge's waiting screen, never a second card form", async () => {
    // P8c answers CHECKOUT_PENDING when the open charge already has a notice, a VERIFY_PAYMENT job or an xMoney
    // transaction: signing the same charge again would let the person pay twice.
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockResolvedValue({ state: "PENDING", charge_ref: CHECKOUT.charge_ref });
    client.getBillingCharge.mockResolvedValue({ state: "PENDING", reason_code: null });
    await render();
    await click(checkbox(0));
    await click(checkbox(1));
    await click(button("Continue to card details"));
    expect(mounted).toHaveLength(0);
    expect(client.getBillingCharge).toHaveBeenCalledWith(CHECKOUT.charge_ref);
    expect(text()).toContain("Waiting for your bank to confirm…");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Subscribe and pay")).toBe(false);
  });

  it("after two minutes of waiting, says not to pay again and leads to Settings instead of a new payment", async () => {
    vi.useFakeTimers();
    try {
      client.createBillingQuote.mockResolvedValue(quote());
      client.startBillingCheckout.mockResolvedValue(CHECKOUT);
      client.getBillingCharge.mockResolvedValue({ state: "PENDING", reason_code: null });
      await render();
      await click(checkbox(0));
      await click(checkbox(1));
      await click(button("Continue to card details"));
      await act(async () => { mounted[0]!.onReady(); });
      await click(button("Subscribe and pay"));
      await act(async () => { mounted[0]!.onPaymentComplete({}); });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(text()).toContain("We'll email you as soon as your bank confirms.");
      expect(text()).toContain("Please don't pay again. Your plan appears in Settings once your bank confirms.");
      expect(container.querySelector('a[href="/settings"]')?.textContent).toBe("Go to Settings");
      expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Try again")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for the invoice address whenever the quote says so, not only for Romania (the issuer is the register's)", async () => {
    client.createBillingQuote
      .mockResolvedValueOnce(quote({ address_required: true }))
      .mockResolvedValueOnce(quote());
    await render();
    expect(countrySelect().value).toBe("DE");
    expect(text()).toContain("A Romanian invoice needs your name, city and county.");
    expect(button("Show the full price").disabled).toBe(true);
    await fill(container.querySelector<HTMLInputElement>("#checkout-name")!, "Anna Schmidt");
    await fill(container.querySelector<HTMLInputElement>("#checkout-city")!, "Berlin");
    await fill(container.querySelector<HTMLInputElement>("#checkout-region")!, "Berlin");
    await click(button("Show the full price"));
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({
      plan_id: "PLUS", country: "DE", region: "Berlin", city: "Berlin", name: "Anna Schmidt"
    });
    // The fields stay for this country after the answer, so the next quote carries them again.
    expect(container.querySelector("#checkout-name")).not.toBeNull();
    await choose(countrySelect(), "FR");
    expect(container.querySelector("#checkout-name")).toBeNull();
  });

  it("refuses to price a half-filled company block, so a business buyer is never quoted as a consumer", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    await render();
    await click(button("Buying as a company?"));
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-name")!, "Acme GmbH");
    expect(button("Show the full price").disabled).toBe(true);
    expect(text()).toContain("Fill in all three company fields, or close the company section.");
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-vat")!, "DE123456789");
    await fill(container.querySelector<HTMLInputElement>("#checkout-company-address")!, "1 Hauptstraße, Berlin");
    expect(button("Show the full price").disabled).toBe(false);
    expect(text()).not.toContain("Fill in all three company fields");
    await click(button("Show the full price"));
    expect(client.createBillingQuote).toHaveBeenLastCalledWith({
      plan_id: "PLUS", country: "DE", company: { name: "Acme GmbH", vat_id: "DE123456789", address: "1 Hauptstraße, Berlin" }
    });
  });

  it("words the checkout's other refusals plainly: a stale page, a country to confirm, a pending deletion, a missing invoice address", async () => {
    client.createBillingQuote.mockResolvedValue(quote());
    for (const [code, status, sentence] of [
      ["LEGAL_DOCUMENT_STALE", 409, "This page is out of date. Please reload it."],
      ["COUNTRY_CONFIRMATION_REQUIRED", 422, "Please confirm the country where you live, then continue."],
      ["ACCOUNT_ERASURE_PENDING", 409, "Your account is scheduled for deletion. Cancel the deletion in Settings to subscribe or change your plan."],
      ["BILLING_ADDRESS_REQUIRED", 422, "A Romanian invoice needs your name, city and county."]
    ] as const) {
      client.startBillingCheckout.mockRejectedValueOnce(
        new ContractHttpError(status === 409 ? "SERVER_FAILURE" : "UNPROCESSABLE", status, "x", code)
      );
      act(() => root.unmount());
      root = createRoot(container);
      await render();
      await click(checkbox(0));
      await click(checkbox(1));
      await click(button("Continue to card details"));
      expect(text(), code).toContain(sentence);
      expect(text(), code).not.toContain("Something went wrong");
    }
    // After BILLING_ADDRESS_REQUIRED the page shows the three fields at once.
    expect(container.querySelector("#checkout-name")).not.toBeNull();
  });

  it("sends an account the server says still owes its age check to the age gate, and says 'try again' when the check cannot be read (P8c, R3-2)", async () => {
    // The page's own read fails open; P8c's checkout guard fails closed and has the last word.
    client.createBillingQuote.mockResolvedValue(quote());
    client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("FORBIDDEN", 403, "x", "AGE_CONFIRMATION_REQUIRED"));
    const navigate = vi.fn();
    await render(navigate);
    await click(checkbox(0));
    await click(checkbox(1));
    await click(button("Continue to card details"));
    // The age gate's own interstitial and return path, exactly the redirect the page makes (ageConfirmationHref).
    expect(navigate.mock.calls).toEqual([["/?next=%2Fcheckout%3Fplan%3DPLUS"]]);
    expect(mounted).toHaveLength(0);
    expect(text()).not.toContain("Something went wrong");

    client.startBillingCheckout.mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 503, "x", "AGE_CHECK_UNAVAILABLE"));
    const stay = vi.fn();
    act(() => root.unmount());
    root = createRoot(container);
    await render(stay);
    await click(checkbox(0));
    await click(checkbox(1));
    await click(button("Continue to card details"));
    expect(text()).toContain("Something went wrong. Please try again.");
    expect(stay).not.toHaveBeenCalled();
    expect(mounted).toHaveLength(0);
  });
});
