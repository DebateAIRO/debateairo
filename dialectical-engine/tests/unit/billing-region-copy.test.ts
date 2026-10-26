import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { checkoutFailureKey } from "../../apps/ui/lib/billing/checkoutFailure.js";

// Payment region blocks (2026-10-20), Task 4: the website words the two refusals Task 3's API answers. Payment is
// refused in a closed region (never sign-up), and a postal code that does not fit its country is sent back to fix.
const MESSAGES = "apps/ui/messages";
const catalogue = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`${MESSAGES}/${locale}/billing.json`, "utf8")) as Record<string, unknown>;
const locales = readdirSync(MESSAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

const REGION_KEY = "billing.checkout.regionUnavailable";
const POSTCODE_KEY = "billing.checkout.postalCodeInvalid";

describe("the closed-region and postal-code refusals have their own plain sentences", () => {
  it("maps REGION_PAYMENT_UNAVAILABLE (403) and BILLING_POSTCODE_INVALID (422) to their sentences", () => {
    expect(checkoutFailureKey(new ContractHttpError("FORBIDDEN", 403, "x", "REGION_PAYMENT_UNAVAILABLE"))).toBe(REGION_KEY);
    expect(checkoutFailureKey(new ContractHttpError("UNPROCESSABLE", 422, "x", "BILLING_POSTCODE_INVALID"))).toBe(POSTCODE_KEY);
    // The country refusal keeps its own sentence: a region is not a country.
    expect(checkoutFailureKey(new ContractHttpError("FORBIDDEN", 403, "x", "COUNTRY_PAYMENT_UNAVAILABLE")))
      .toBe("billing.checkout.countryUnavailable");
  });

  it("reads exactly as the owner approved in English", () => {
    const english = catalogue("en");
    expect(english[REGION_KEY]).toBe("Paid plans aren't available in your region yet. You can keep using the Free plan.");
    expect(english[POSTCODE_KEY]).toBe("Please check your postal code.");
  });

  it("is present, non-empty and translated in all 35 locales", () => {
    expect(locales).toHaveLength(35);
    const english = catalogue("en");
    for (const locale of locales) {
      const billing = catalogue(locale);
      for (const key of [REGION_KEY, POSTCODE_KEY]) {
        const value = billing[key];
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect((value as string).trim(), `${locale}: ${key}`).not.toBe("");
        expect(value as string, `${locale}: ${key} shows no placeholder`).not.toMatch(/\{[A-Za-z]/u);
        if (locale !== "en") expect(value, `${locale}: ${key} is translated`).not.toBe(english[key]);
      }
    }
  });
});
