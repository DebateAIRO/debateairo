import { describe, expect, it } from "vitest";
import { callingCodeOf, phonePrefill } from "../../apps/ui/lib/billing/callingCodes.js";
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
});
