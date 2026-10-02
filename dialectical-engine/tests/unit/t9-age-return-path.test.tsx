import { describe, expect, it } from "vitest";
import { ageConfirmationHref } from "../../apps/ui/lib/ageConfirmation.js";

describe("P19 the age gate's interstitial returns to the plan (rulings R3-2, R3-5)", () => {
  it.each([
    ["/checkout?plan=PRO", `/?next=${encodeURIComponent("/checkout?plan=PRO")}`],
    ["/checkout/return?charge=0123456789abcdef0123456789abcdef", `/?next=${encodeURIComponent("/checkout/return?charge=0123456789abcdef0123456789abcdef")}`],
    ["/settings/card?charge=fedcba9876543210fedcba9876543210", `/?next=${encodeURIComponent("/settings/card?charge=fedcba9876543210fedcba9876543210")}`]
  ])("keeps the paid-plans path %s", (next, expected) => {
    expect(ageConfirmationHref(next)).toBe(expected);
  });

  it.each([["/checkoutx?plan=PRO"], ["//evil.example/checkout"], ["/checkout/other"]])("drops the unsafe path %s", (next) => {
    expect(ageConfirmationHref(next)).toBe("/");
  });
});
