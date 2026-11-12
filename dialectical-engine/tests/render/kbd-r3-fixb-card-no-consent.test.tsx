// @vitest-environment jsdom
/*
 * Keyboard audit round 2, wave 3 fix round (2026-11-12), B6: on /settings/card, with every field filled and the
 * agreement ticked but the renewal terms not loaded (`renewalConsent` null), there is nothing the person can do, so
 * "Check my new card" is natively disabled as before wave 3, not a focusable button that says nothing when pressed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import { button, mountPage, press, unmountPage } from "./kbd-r2-set-harness.js";

const EN = billingEnglish as Readonly<Record<string, string>>;
const DETAILS = {
  country: "RO", region: "Cluj", first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1",
  city: "Cluj-Napoca", postal_code: "400001"
};
afterEach(unmountPage);

describe("B6: no renewal terms loaded: the button is switched off, with nothing to explain", () => {
  it("every field and the agreement done, renewalConsent null: natively disabled, no aria-disabled, no description", async () => {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS),
      getBillingSubscription: vi.fn(async () => ({ subscription: { renewal_total: "24.20", currency: "USD" } })),
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn()
    };
    await mountPage(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={null}
      client={client as unknown as CardChangeClient} goToPayment={vi.fn()} />);
    await press(document.querySelector<HTMLInputElement>("#card-agreement")!, " ");
    const check = button(EN["billing.card.checkCard"]!);
    expect(check.disabled).toBe(true);
    expect(check.hasAttribute("aria-disabled")).toBe(false);
    expect(check.hasAttribute("aria-describedby")).toBe(false);
    expect(client.startCardChange).not.toHaveBeenCalled();
  });
});
