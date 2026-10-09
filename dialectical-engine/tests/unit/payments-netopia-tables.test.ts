// tests/unit/payments-netopia-tables.test.ts
// N2 (spec 2026-10-05 §2.4.1–2.4.5, §2.4.7, §2.20.2): bases, POS pattern, payment-URL hosts, the pinned facts, the status,
// decline and country tables, the money codec, the time rule and the JSON reader.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW } from "@debateai/register";
import {
  NETOPIA_BASES, NETOPIA_FACTS, bankDeclined, declineSideOf, iso2ToNetopiaCountry, isNetopiaPaymentUrl,
  isNetopiaPosSignature, microsToNetopiaAmount, netopiaAmountToMicros, netopiaCountryToIso2, netopiaEnvironmentOf,
  netopiaLanguageOf, parseJsonKeepingNumberText, parseOccurredAt, statusToState
} from "@debateai/payments-netopia";
import { netopiaCountryCodes } from "../../packages/payments-netopia/src/countries.js";
import { valueAtPath } from "../../packages/payments-netopia/src/json.js";

const codeOf = (run: () => unknown): string => {
  try { run(); } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
  throw new Error("expected a refusal");
};

describe("N2 — hosts and the POS signature (spec §2.4.1)", () => {
  it("knows exactly the four bases and their environments, by exact match", () => {
    expect(NETOPIA_BASES).toEqual([
      { base: "https://secure.netopia-payments.com/api", environment: "live" },
      { base: "https://secure.mobilpay.ro/pay", environment: "live" },
      { base: "https://secure-sandbox.netopia-payments.com", environment: "sandbox" },
      { base: "https://secure.sandbox.netopia-payments.com", environment: "sandbox" }
    ]);
    expect(Object.isFrozen(NETOPIA_BASES) && NETOPIA_BASES.every((entry) => Object.isFrozen(entry))).toBe(true);
    for (const { base, environment } of NETOPIA_BASES) expect(netopiaEnvironmentOf(base)).toBe(environment);
    for (const base of [
      "https://secure.netopia-payments.com/api/", "https://secure.netopia-payments.com", "http://secure.mobilpay.ro/pay",
      "https://SECURE.MOBILPAY.RO/pay", "https://secure.mobilpay.ro/pay?x=1", "https://secure.mobilpay.ro.evil.test/pay",
      "http://127.0.0.1:8802", ""
    ]) expect(netopiaEnvironmentOf(base), base).toBeNull();
  });

  it("accepts NETOPIA's five groups of four, nothing else", () => {
    const good = ["AB12", "CD34", "EF56", "GH78", "IJ90"].join("-");
    expect(isNetopiaPosSignature(good)).toBe(true);
    for (const value of [good.toLowerCase(), good.replaceAll("-", ""), `${good}-ZZZZ`, `${good} `, good.slice(0, -1), ""]) {
      expect(isNetopiaPosSignature(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("stores a payment URL only when it is https on a NETOPIA host (spec §2.2 rule 10)", () => {
    for (const url of ["https://secure-sandbox.netopia-payments.com/ui/card?p=ABC", "https://secure.mobilpay.ro/pay/ui/card?p=1",
      "https://a.b.netopia-payments.com/x"]) expect(isNetopiaPaymentUrl(url), url).toBe(true);
    for (const url of ["http://secure.netopia-payments.com/ui/card", "https://netopia-payments.com/ui/card",
      "https://secure.netopia-payments.com.evil.test/x", "https://evilnetopia-payments.com/x",
      "https://user:pass@secure.netopia-payments.com/x", "https://secure.netopia-payments.com:8443/x",
      "https://secure.netopia-payments.com./x", "javascript:alert(1)", "not a url", ""]) expect(isNetopiaPaymentUrl(url), url).toBe(false);
  });
});

describe("N2 — the pinned facts (spec §2.4.7)", () => {
  it("holds every uncertain fact in one frozen object", () => {
    expect(NETOPIA_FACTS).toEqual({
      clientIdLocation: "order", tokenPaths: ["payment.binding.token", "payment.instrument.token", "payment.token"],
      paidStatuses: [3, 5], cardDeclineCodes: ["16", "17", "18", "19", "20", "21", "22", "26", "34", "35", "36", "37", "39"],
      bankDeclineCodes: ["17", "18", "19", "20", "21", "22", "26", "34", "35", "37"], installments: 0,
      pageLanguages: ["ro", "en", "bg", "es", "hu", "it", "nl", "de", "fr"], notFoundCodes: ["404"]
    });
    expect(Object.isFrozen(NETOPIA_FACTS)).toBe(true);
    for (const member of Object.values(NETOPIA_FACTS)) if (typeof member === "object") expect(Object.isFrozen(member)).toBe(true);
    expect(NETOPIA_FACTS.bankDeclineCodes.filter((code) => !NETOPIA_FACTS.cardDeclineCodes.includes(code))).toEqual([]);
  });

  it("speaks NETOPIA's page language when the buyer's locale is one, else English", () => {
    for (const [locale, language] of [["ro", "ro"], ["ro-RO", "ro"], ["DE", "de"], ["fr_CA", "fr"], ["pt-BR", "en"], ["ja", "en"], ["", "en"]] as const) {
      expect(netopiaLanguageOf(locale), locale).toBe(language);
    }
  });
});

describe("N2 — the status and decline tables (spec §2.4.4, §2.4.5)", () => {
  it("maps every status of the table, and every other status to UNCLEAR", () => {
    const table: ReadonlyArray<readonly [number, string]> = [
      [1, "PENDING"], [2, "AUTHORIZED"], [3, "PAID"], [4, "VOIDED"], [5, "PAID"], [6, "PENDING"], [8, "REFUNDED"],
      [9, "CHARGEBACK_OPENED"], [10, "CHARGEBACK_LOST"], [11, "FAILED"], [12, "DECLINED"], [13, "PENDING"], [14, "PENDING"],
      [15, "ACTION_REQUIRED"], [16, "CHARGEBACK_REPRESENTED"], [17, "UNCLEAR"], [18, "PENDING"], [23, "EXPIRED"]
    ];
    for (const [status, state] of table) expect(statusToState(status), String(status)).toBe(state);
    for (const status of [0, 7, 19, 20, 21, 22, 24, 99, -1, 3.5, Number.NaN]) expect(statusToState(status), String(status)).toBe("UNCLEAR");
    const paid = Array.from({ length: 30 }, (_, index) => index).filter((status) => statusToState(status) === "PAID");
    expect(paid).toEqual([...NETOPIA_FACTS.paidStatuses]);
  });

  it("puts card declines on the card, merchant refusals on us, and outcomes nowhere", () => {
    for (const code of NETOPIA_FACTS.cardDeclineCodes) {
      expect(declineSideOf(code, 12), code).toBe("CARD");
      expect(declineSideOf(code, null), code).toBe("CARD");
    }
    for (const code of [null, "", "00"]) expect(declineSideOf(code, 12), String(code)).toBe("CARD");
    for (const code of ["32", "33", "99", "777", "400"]) expect(declineSideOf(code, 12), code).toBe("MERCHANT");
    for (const code of ["00", "0", "100", "101", "102", "56"]) expect(declineSideOf(code, 3), code).toBeNull();
    expect(declineSideOf(null, 11)).toBeNull();
    expect(declineSideOf(null, null)).toBeNull();
  });

  it("says 'your bank refused' only where NETOPIA's own page names the card or the bank", () => {
    for (const code of ["17", "18", "19", "20", "21", "22", "26", "34", "35", "37"]) expect(bankDeclined(code), code).toBe(true);
    for (const code of ["16", "36", "39", "32", "99", "00", "", null]) expect(bankDeclined(code), String(code)).toBe(false);
  });
});

describe("N2 — the country table (spec §2.4.2, §2.4.3)", () => {
  it("holds all 249 ISO 3166-1 codes, each and each numeric once, both ways", () => {
    const codes = netopiaCountryCodes();
    expect(codes).toHaveLength(249);
    expect(new Set(codes).size).toBe(249);
    expect(new Set(codes.map((code) => iso2ToNetopiaCountry(code)!.numeric)).size).toBe(249);
    for (const code of codes) {
      expect(netopiaCountryToIso2(iso2ToNetopiaCountry(code)!.numeric), code).toBe(code);
      expect(iso2ToNetopiaCountry(code)!.name.length, code).toBeGreaterThan(2);
    }
  });

  it("covers every country the register's countryPolicy names, in the code and in the example file", () => {
    const example = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../deploy/vps/register/country-policy.example.json"), "utf8")) as {
      countryPolicy: { countries: Record<string, unknown> };
    };
    const named = [...Object.keys(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value.countries), ...Object.keys(example.countryPolicy.countries)];
    expect(named.length).toBeGreaterThan(120);
    for (const code of named) expect(iso2ToNetopiaCountry(code), code).not.toBeNull();
  });

  it("writes NETOPIA's numeric code and English name, and reads a card's country in any of its forms", () => {
    expect(iso2ToNetopiaCountry("RO")).toEqual({ numeric: 642, name: "Romania" });
    expect(iso2ToNetopiaCountry("ro")).toEqual({ numeric: 642, name: "Romania" });
    expect(iso2ToNetopiaCountry("US")).toEqual({ numeric: 840, name: "United States of America" });
    expect([iso2ToNetopiaCountry("DE")?.numeric, iso2ToNetopiaCountry("GB")?.numeric, iso2ToNetopiaCountry("MD")?.numeric,
      iso2ToNetopiaCountry("AT")?.numeric]).toEqual([276, 826, 498, 40]);
    expect(iso2ToNetopiaCountry("XX")).toBeNull();
    expect(iso2ToNetopiaCountry("ROU")).toBeNull();
    for (const [value, iso2] of [[642, "RO"], ["642", "RO"], ["040", "AT"], ["RO", "RO"], ["de", "DE"], ["643", "RU"]] as const) {
      expect(netopiaCountryToIso2(value), String(value)).toBe(iso2);
    }
    for (const value of [0, "0", "000", 999, "999", "ROU", "XX", "", " ", 642.5, -642, null, undefined, "6420"]) {
      expect(netopiaCountryToIso2(value), String(value)).toBeNull();
    }
  });

  it("pins Romania and every always-blocked country of countryPolicy by its numeric code, both ways (ruling PR-23)", () => {
    for (const [iso2, numeric] of [["RO", 642], ["RU", 643], ["BY", 112], ["CN", 156], ["HK", 344], ["MO", 446], ["IR", 364],
      ["KP", 408], ["CU", 192], ["SY", 760], ["VE", 862], ["VN", 704]] as const) {
      expect(iso2ToNetopiaCountry(iso2)?.numeric, iso2).toBe(numeric);
      expect(netopiaCountryToIso2(numeric), iso2).toBe(iso2);
      expect(netopiaCountryToIso2(String(numeric)), iso2).toBe(iso2);
    }
  });
});

describe("N2 — exact money both ways (spec §2.2 rule 7, §2.4.2)", () => {
  it("writes micros as decimal text with at most two places, and refuses what is not a cent amount", () => {
    for (const [micros, text] of [[24_200_000, "24.2"], [24_000_000, "24"], [1_000_000, "1"], [0, "0"], [10_000, "0.01"],
      [100_050_000, "100.05"], [999_990_000, "999.99"], [300_000, "0.3"], [123_456_780_000, "123456.78"]] as const) {
      expect(microsToNetopiaAmount(micros), String(micros)).toBe(text);
    }
    for (const micros of [-10_000, 24_200_001, 5_000, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(codeOf(() => microsToNetopiaAmount(micros)), String(micros)).toBe("PAYMENT_CONFIGURATION_REFUSED:amount");
    }
  });

  it("reads NETOPIA's decimal text exactly, and refuses anything finer than a cent, signed, exponential or padded", () => {
    for (const [text, micros] of [["24.2", 24_200_000], ["24.20", 24_200_000], ["24.200", 24_200_000], ["24", 24_000_000],
      ["0.1", 100_000], ["0.01", 10_000], ["0", 0], ["159.90", 159_900_000], ["100000", 100_000_000_000],
      ["0.30000000000", 300_000]] as const) {
      expect(netopiaAmountToMicros(text), text).toBe(micros);
    }
    for (const text of ["24.205", "24.199999", "-1", "+1", "1e2", "024.2", "24.", ".5", "", " 24", "24,20", "NaN", "1234567890"]) {
      expect(codeOf(() => netopiaAmountToMicros(text)), text).toBe("PAYMENT_RESPONSE_INVALID:amount");
    }
    for (const micros of [0, 10_000, 990_000, 24_200_000, 200_000_000, 123_456_780_000]) {
      expect(netopiaAmountToMicros(microsToNetopiaAmount(micros))).toBe(micros);
    }
  });
});

describe("N2 — the payment time (spec §2.4.3)", () => {
  const NOW = new Date("2026-10-06T10:00:00.000Z");

  it("takes an ISO date-time with Z or an offset", () => {
    for (const [text, iso] of [["2026-10-06T09:58:00Z", "2026-10-06T09:58:00.000Z"], ["2026-10-06T12:58:00+03:00", "2026-10-06T09:58:00.000Z"],
      ["2026-10-06T05:28:00-04:30", "2026-10-06T09:58:00.000Z"], ["2026-10-06T09:58:00.123456Z", "2026-10-06T09:58:00.123Z"],
      ["2026-10-06T09:58:00.5Z", "2026-10-06T09:58:00.500Z"], ["2020-01-01T00:00:01Z", "2020-01-01T00:00:01.000Z"],
      ["2026-10-06T10:05:00Z", "2026-10-06T10:05:00.000Z"]] as const) {
      expect(parseOccurredAt(text, NOW)?.toISOString(), text).toBe(iso);
    }
  });

  it("refuses the placeholder, a time without a zone, malformed text, 2019 and anything over five minutes ahead", () => {
    for (const text of [
      "0001-01-01T00:00:00", "0001-01-01T00:00:00Z", "2026-10-06T09:58:00", "2026-10-06 09:58:00Z", "2026-10-06",
      "2026-02-30T10:00:00Z", "2026-13-01T10:00:00Z", "2026-10-06T24:00:00Z", "2026-10-06T09:60:00Z", "2026-10-06T09:58:00+15:00",
      "2026-10-06T09:58:00+0300", "2019-12-31T23:59:59Z", "2020-01-01T00:00:00Z", "2026-10-06T10:05:01Z", "", null, undefined
    ]) expect(parseOccurredAt(text, NOW), String(text)).toBeNull();
  });
});

describe("N2 — JSON with every number kept as its source text", () => {
  it("keeps decimals, big ids and codes as written, and walks dot paths from the root", () => {
    const parsed = parseJsonKeepingNumberText('{"payment":{"amount":24.20,"ntpID":12345678901234567890,"code":"00","binding":{"token":"t1"},"list":[1.50]}}');
    expect(parsed).toEqual({ payment: { amount: "24.20", ntpID: "12345678901234567890", code: "00", binding: { token: "t1" }, list: ["1.50"] } });
    expect(valueAtPath(parsed, "payment.binding.token")).toBe("t1");
    for (const path of ["payment.instrument.token", "payment.code.length", "payment.list.0"]) expect(valueAtPath(parsed, path), path).toBeUndefined();
    expect(valueAtPath(null, "payment")).toBeUndefined();
    expect(() => parseJsonKeepingNumberText("{not json")).toThrow(SyntaxError);
  });
});
