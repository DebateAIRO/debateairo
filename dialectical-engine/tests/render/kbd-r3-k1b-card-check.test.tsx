// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 (2026-11-12), SET-10: on /settings/card "Check my new card" was natively disabled
 * while a field was empty or the agreement unticked, so Tab skipped it and nothing said what was missing. It now
 * follows the checkout: it stays focusable (aria-disabled), says why while it is locked, and a press marks each
 * missing field with its reason and puts focus in the first one (or on the agreement).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import { button, expectFocusOn, mountPage, press, unmountPage } from "./kbd-r2-set-harness.js";

const EN = billingEnglish as Readonly<Record<string, string>>;
const CONSENT = Object.freeze({ version: "consent-renewal-1", sha256: "a".repeat(64) });
const DETAILS = {
  country: "RO", region: "Cluj", first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1",
  city: "Cluj-Napoca", postal_code: "400001"
};
afterEach(unmountPage);

async function mount(details: Partial<typeof DETAILS>) {
  const client = {
    getBillingCardDetails: vi.fn(async () => ({ ...DETAILS, ...details })),
    getBillingSubscription: vi.fn(async () => ({ subscription: { renewal_total: "24.20", currency: "USD" } })),
    startCardChange: vi.fn(),
    getBillingCharge: vi.fn()
  };
  await mountPage(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
    client={client as unknown as CardChangeClient} goToPayment={vi.fn()} />);
  return client;
}
const checkCard = () => button(EN["billing.card.checkCard"]!);
const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;
const description = (element: Element): string => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
  .map((id) => document.getElementById(id)?.textContent ?? "").join(" ");

describe("SET-10: Check my new card says what is missing", () => {
  it("the English reasons exist", () => {
    expect(EN["billing.card.fieldRequired"]).toBeTruthy();
    expect(EN["billing.card.detailsRequired"]).toBeTruthy();
    expect(EN["billing.card.agreementRequired"]).toBeTruthy();
  });

  it("an empty street: the button stays in the Tab order, and a press marks the street and puts focus in it", async () => {
    const client = await mount({ street: "" });
    await press(field("card-agreement"), " ");
    const locked = checkCard();
    expect(locked.matches(":disabled")).toBe(false);
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(description(locked)).toBe(EN["billing.card.detailsRequired"]);
    // Nothing is marked before a press.
    expect(field("card-street").getAttribute("aria-invalid")).toBe("false");
    await press(locked);
    expect(client.startCardChange).not.toHaveBeenCalled();
    expectFocusOn(field("card-street"));
    expect(field("card-street").getAttribute("aria-invalid")).toBe("true");
    expect(description(field("card-street"))).toBe(EN["billing.card.fieldRequired"]);
  });

  it("a stored phone that is only a calling code is marked with the checkout's phone reason, and the city too when empty", async () => {
    await mount({ phone: "+40", city: "" });
    await press(field("card-agreement"), " ");
    await press(checkCard());
    expectFocusOn(field("card-phone"));
    expect(description(field("card-phone"))).toBe(EN["billing.checkout.phoneInvalid"]);
    expect(field("card-city").getAttribute("aria-invalid")).toBe("true");
    expect(description(field("card-city"))).toBe(EN["billing.card.fieldRequired"]);
  });

  it("every field filled but the agreement unticked: the button says so, and a press puts focus on the agreement", async () => {
    const client = await mount({});
    const locked = checkCard();
    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(description(locked)).toBe(EN["billing.card.agreementRequired"]);
    await press(locked);
    expect(client.startCardChange).not.toHaveBeenCalled();
    expectFocusOn(field("card-agreement"));
  });

  it("once the field is filled and the agreement ticked, the button is plain again and checks the card", async () => {
    const client = await mount({});
    await press(field("card-agreement"), " ");
    expect(checkCard().hasAttribute("aria-disabled")).toBe(false);
    expect(checkCard().hasAttribute("aria-describedby")).toBe(false);
    client.startCardChange.mockResolvedValue({ redirect_url: "https://example.test/pay", charge_ref: "c".repeat(32), hold_amount: "0.00" });
    await press(checkCard());
    expect(client.startCardChange).toHaveBeenCalledOnce();
  });
});
