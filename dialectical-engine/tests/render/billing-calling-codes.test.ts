import { describe, expect, it } from "vitest";
import { callingCodeOf, phonePrefill, phoneTyped } from "../../apps/ui/lib/billing/callingCodes.js";
import { COUNTRY_CODES } from "../../apps/ui/lib/billing/countries.js";

describe("N19 the phone field offers the country's calling code (spec §2.6.1)", () => {
  it("knows a calling code for every country the page lists", () => {
    expect(COUNTRY_CODES.filter((code) => callingCodeOf(code) === null)).toEqual([]);
    expect([callingCodeOf("RO"), callingCodeOf("DE"), callingCodeOf("US"), callingCodeOf("IE"), callingCodeOf("JM")])
      .toEqual(["40", "49", "1", "353", "1876"]);
    expect(callingCodeOf("ZZ")).toBeNull();
  });

  it("fills an empty or untouched field with the code, and never replaces what the person typed", () => {
    expect(phonePrefill("RO", "")).toBe("+40 ");
    expect(phonePrefill("DE", "+40 ")).toBe("+49 ");
    expect(phonePrefill("DE", "+40 712 345 678")).toBe("+40 712 345 678");
    expect(phonePrefill("ZZ", "")).toBe("");
  });

  it("counts a phone as typed only past its calling code (the quote's schema refuses fewer than four characters)", () => {
    for (const value of ["", "  ", "+49 ", "+353", "+", "+1 ", "+40", "123"]) expect(phoneTyped(value), value).toBe(false);
    for (const value of ["+49 151 1234 5678", "+40712345678", "0712 345 678"]) expect(phoneTyped(value), value).toBe(true);
  });
});
