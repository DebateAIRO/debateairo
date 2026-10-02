import { describe, expect, it } from "vitest";
import {
  AGE_RULE_VERSION,
  checkDob,
  dobFromIso,
  dobOrderForLocale,
  dobToIso,
  meetsMinimumAge,
  MIN_AGE,
  parseDobPaste,
  DOB_ORDER_DMY,
  DOB_ORDER_MDY,
  DOB_ORDER_YMD
} from "@debateai/kernel";

/* Age gate — the shared date-of-birth rules (Turn 8 · 8d/8f/8g). */

describe("minimum age", () => {
  it("is a single 18 for every country, with a versioned rule", () => {
    expect(MIN_AGE).toBe(18);
    expect(AGE_RULE_VERSION).toMatch(/v2/);
  });
});

describe("field order per locale", () => {
  it.each([
    ["en-GB", DOB_ORDER_DMY],
    ["en", DOB_ORDER_DMY],
    ["en-US", DOB_ORDER_MDY],
    ["ja", DOB_ORDER_YMD],
    ["zh", DOB_ORDER_YMD],
    ["ko", DOB_ORDER_YMD],
    ["hu", DOB_ORDER_YMD],
    ["ar", DOB_ORDER_DMY],
    ["he", DOB_ORDER_DMY],
    ["de", DOB_ORDER_DMY],
    ["fr", DOB_ORDER_DMY]
  ])("%s", (locale, order) => {
    expect(dobOrderForLocale(locale)).toEqual(order);
  });
});

describe("paste of a full date", () => {
  const march14 = { d: "14", m: "03", y: "1998" };
  it.each(["14/03/1998", "14.03.1998", "1998-03-14", "14031998", "19980314", " 14 / 03 / 1998 "])(
    "reads %j in a day-first locale",
    (text) => expect(parseDobPaste(text, DOB_ORDER_DMY)).toEqual(march14)
  );
  it.each(["1998-03-14", "19980314", "14/03/1998", "14031998"])(
    "reads %j in a year-first locale",
    (text) => expect(parseDobPaste(text, DOB_ORDER_YMD)).toEqual(march14)
  );
  it("reads a year-last date month-first in en-US", () => {
    expect(parseDobPaste("03/14/1998", DOB_ORDER_MDY)).toEqual(march14);
    expect(parseDobPaste("03141998", DOB_ORDER_MDY)).toEqual(march14);
    expect(parseDobPaste("1998-03-14", DOB_ORDER_MDY)).toEqual(march14);
  });
  it("reads an ambiguous year-last date in the locale's order", () => {
    expect(parseDobPaste("03/04/1998", DOB_ORDER_DMY)).toEqual({ d: "03", m: "04", y: "1998" });
    expect(parseDobPaste("03/04/1998", DOB_ORDER_MDY)).toEqual({ d: "04", m: "03", y: "1998" });
    expect(parseDobPaste("03/04/1998", DOB_ORDER_YMD)).toEqual({ d: "04", m: "03", y: "1998" });
  });
  it("pads single-digit day and month", () => {
    expect(parseDobPaste("4/3/1998", DOB_ORDER_DMY)).toEqual({ d: "04", m: "03", y: "1998" });
  });
  it.each(["14/03", "1998", "14", "abc", "14/03/98", "1/2/3/4", ""])("refuses the partial %j", (text) => {
    expect(parseDobPaste(text, DOB_ORDER_DMY)).toBeNull();
  });
});

describe("validation, first failing rule wins", () => {
  const now = new Date(Date.UTC(2026, 8, 28, 12));
  it("incomplete", () => {
    expect(checkDob({ d: "", m: "03", y: "1998" }, now).code).toBe("incomplete");
    expect(checkDob({ d: "14", m: "03", y: "199" }, now).code).toBe("incomplete");
    expect(checkDob({ d: "14", m: "", y: "" }, now).code).toBe("incomplete");
  });
  it("before 1900", () => {
    expect(checkDob({ d: "14", m: "03", y: "1890" }, now).code).toBe("before");
    expect(checkDob({ d: "31", m: "02", y: "1899" }, now).code).toBe("before");
  });
  it("impossible", () => {
    expect(checkDob({ d: "31", m: "02", y: "2001" }, now).code).toBe("impossible");
    expect(checkDob({ d: "31", m: "04", y: "2001" }, now).code).toBe("impossible");
    expect(checkDob({ d: "14", m: "13", y: "2001" }, now).code).toBe("impossible");
    expect(checkDob({ d: "00", m: "03", y: "2001" }, now).code).toBe("impossible");
  });
  it("29/02 is valid in a leap year and impossible otherwise", () => {
    expect(checkDob({ d: "29", m: "02", y: "2000" }, now).code).toBe("ok");
    expect(checkDob({ d: "29", m: "02", y: "2004" }, now).code).toBe("ok");
    expect(checkDob({ d: "29", m: "02", y: "2001" }, now).code).toBe("impossible");
    expect(checkDob({ d: "29", m: "02", y: "1900" }, now).code).toBe("impossible");
  });
  it("future", () => {
    expect(checkDob({ d: "14", m: "03", y: "2031" }, now).code).toBe("future");
    expect(checkDob({ d: "29", m: "09", y: "2026" }, now).code).toBe("future");
    expect(checkDob({ d: "28", m: "09", y: "2026" }, now).code).toBe("ok");
  });
  it("valid dates carry their age", () => {
    expect(checkDob({ d: "14", m: "03", y: "1998" }, now)).toEqual({ code: "ok", age: 28 });
  });
});

describe("the minimum-age boundary is a UTC calendar date", () => {
  const now = new Date(Date.UTC(2026, 8, 28, 0, 30));
  it("exactly 18 today passes", () => {
    expect(meetsMinimumAge({ d: "28", m: "09", y: "2008" }, now)).toBe(true);
  });
  it("18 tomorrow is refused", () => {
    expect(meetsMinimumAge({ d: "29", m: "09", y: "2008" }, now)).toBe(false);
  });
  it("a 29 February birthday turns 18 on 1 March in a non-leap year", () => {
    expect(meetsMinimumAge({ d: "29", m: "02", y: "2008" }, new Date(Date.UTC(2026, 1, 28)))).toBe(false);
    expect(meetsMinimumAge({ d: "29", m: "02", y: "2008" }, new Date(Date.UTC(2026, 2, 1)))).toBe(true);
  });
  it("an invalid date never meets the minimum age", () => {
    expect(meetsMinimumAge({ d: "31", m: "02", y: "1990" }, now)).toBe(false);
  });
});

describe("ISO wire form", () => {
  it("round-trips", () => {
    expect(dobToIso({ d: "4", m: "3", y: "1998" })).toBe("1998-03-04");
    expect(dobFromIso("1998-03-04")).toEqual({ y: "1998", m: "03", d: "04" });
    expect(dobFromIso("1998-3-4")).toBeNull();
  });
});
