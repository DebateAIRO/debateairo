import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { trimTrailingSlashes as smartbillTrim } from "../../packages/invoice-smartbill/src/index.js";
import { quadernoAmountMicros, trimTrailingSlashes as quadernoTrim } from "../../packages/tax-quaderno/src/index.js";

/**
 * The three vendor clients trimmed their base URL with `/\/+$/u` and Quaderno's amount reader trimmed a fraction with
 * `/0+$/u`. CodeQL flagged both (js/polynomial-redos, PR #64): on many "/" or "0" that are not at the end, every start
 * position rescans the run, so the time is quadratic. The one-pass trims must give the old patterns' results.
 */
const TRIMS = [["SmartBill", smartbillTrim], ["Quaderno", quadernoTrim]] as const;

describe("the vendor clients trim a base URL's trailing slashes in one pass", () => {
  it.each(TRIMS)("%s matches the old pattern on any mix of slashes and other characters", (_name, trim) => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("/", "a", ":", "."), { maxLength: 40 }), (units) => {
        const text = units.join("");
        expect(trim(text)).toBe(text.replace(/\/+$/u, ""));
      }),
      { numRuns: 1000 }
    );
  });

  it.each(TRIMS)("%s handles 200,000 slashes at once", (_name, trim) => {
    // A quadratic scan of these would run for minutes and fail on the test's time limit.
    expect(trim(`${"/".repeat(200_000)}a`)).toBe(`${"/".repeat(200_000)}a`);
    expect(trim(`https://vendor.test${"/".repeat(200_000)}`)).toBe("https://vendor.test");
  });
});

describe("Quaderno's amount reader trims a fraction's trailing zeros in one pass", () => {
  it("reads the same amounts as before", () => {
    expect(quadernoAmountMicros("24.20")).toBe(quadernoAmountMicros("24.2"));
    expect(quadernoAmountMicros("24.2000")).toBe(quadernoAmountMicros("24.2"));
    expect(quadernoAmountMicros("7.00")).toBe(quadernoAmountMicros("7"));
    expect(() => quadernoAmountMicros("1.005")).toThrow(/AMOUNT_NOT_CENTS/u);
  });

  it("refuses a long fraction with a late digit at once", () => {
    expect(quadernoAmountMicros(`1.${"0".repeat(200_000)}`)).toBe(quadernoAmountMicros("1"));
    expect(() => quadernoAmountMicros(`1.${"0".repeat(200_000)}5`)).toThrow(/AMOUNT_NOT_CENTS/u);
  });
});
