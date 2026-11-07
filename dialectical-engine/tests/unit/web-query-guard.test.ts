import { describe, expect, it } from "vitest";
import { findPersonalData, personalDataKinds, type PersonalDataKind } from "@debateai/kernel";
import { cleanSearchText, firstPersonWords, guardSearch } from "../../packages/evidence/src/query-guard.js";

// W1-2 (plan 2026-10-30, design §3.1): every search the planner writes is cleaned and checked by code before it can
// leave us. "I'm a nurse from Cluj" never leaves; "nurse net salary Germany 2026" may (without the year: the look-back
// window replaces dates). All examples are made up.

const REFUSED: ReadonlyArray<readonly [PersonalDataKind, string]> = [
  ["EMAIL", "salariu asistentă ion.popescu@yahoo.ro"],
  ["EMAIL", "nurse jobs contact nurse.jobs+de@example.com"],
  ["PHONE", "+40 722 123 456 agenție asistente"],
  ["PHONE", "asistentă Cluj 0722 123 456"],
  ["PHONE", "clinică 0722.123.456 program"],
  ["PHONE", "(+49) 30 1234 5678 clinic Berlin"],
  ["PHONE", "nurse agency call 555-123-4567"],
  ["IBAN", "RO49 AAAA 1B31 0075 9384 0000 transfer salariu"],
  ["IBAN", "plată RO49AAAA1B31007593840000"],
  ["IBAN", "salary account DE89 3704 0044 0532 0130 00"],
  ["CARD", "card 4111 1111 1111 1111 fees"],
  ["CARD", "5500-0000-0000-0004 refund"],
  ["NATIONAL_ID", "CNP 1960523460016 pensie"],
  ["NATIONAL_ID", "asigurare 2801012211232"],
  ["ID_NUMBER", "social security 123-45-6789 benefits"],
  ["ID_NUMBER", "national insurance QQ 12 34 56 C refund"],
  ["ID_NUMBER", "buletin RX 123456 reînnoire"],
  ["ID_NUMBER", "passport AB1234567 renewal"],
  ["ID_NUMBER", "tax number 1234567890 Germany"],
  ["URL_QUERY", "report https://example.com/report?user=ion"],
  ["URL_QUERY", "pagina www.example.ro/pagina?id=7"]
];

const CLEAN: readonly string[] = [
  "nurse net salary Germany 2026",
  "arXiv 2310.12345 attention study",
  "doi 10.1056/NEJMoa2034577 vaccine trial",
  "population Romania 19 053 815",
  "1,500,000 jobs EU",
  "inflation Romania 2020-2026",
  "ISO 27001 certification cost",
  "COVID-19 vaccine GPT-4 H5N1",
  "official report https://example.com/report",
  "salariul minim pe economie România"
];

describe("personal data in a search (kernel scanner)", () => {
  it.each(REFUSED)("finds %s in %j", (kind, text) => {
    expect(personalDataKinds(text)).toContain(kind);
    expect(guardSearch(text)).toMatchObject({ outcome: "HOLD", reasons: ["PERSONAL_DATA"], text: null });
  });

  it.each(CLEAN)("finds nothing personal in %j", (text) => {
    expect(findPersonalData(text)).toEqual([]);
  });

  it("names the kind and place of a finding, never the value", () => {
    const text = "write to ion@example.ro today";
    const findings = findPersonalData(text);
    expect(findings).toEqual([{ kind: "EMAIL", start: 9, end: 23 }]);
    expect(JSON.stringify(guardSearch(text))).not.toContain("ion@example.ro");
  });

  it("checks a plain IBAN and card number by their check digits", () => {
    expect(personalDataKinds("RO49AAAA1B31007593840000")).toEqual(["IBAN"]);
    // Same shape, wrong check digits: still refused, as a long number, so a near-miss never leaves either.
    expect(personalDataKinds("RO48AAAA1B31007593840000")).toEqual(["ID_NUMBER"]);
    expect(personalDataKinds("4111 1111 1111 1111")).toEqual(["CARD"]);
    expect(personalDataKinds("4111 1111 1111 1112")).toEqual(["ID_NUMBER"]);
    expect(personalDataKinds("1960523460016")).toEqual(["NATIONAL_ID"]);
    expect(personalDataKinds("1960523460017")).toEqual(["ID_NUMBER"]);
  });
});

describe("first-person words are flagged, and a flagged search never leaves", () => {
  it("holds the design's example", () => {
    expect(firstPersonWords("I'm a nurse from Cluj")).toEqual(["I'm"]);
    expect(guardSearch("I'm a nurse from Cluj")).toEqual({
      outcome: "HOLD", reasons: ["FIRST_PERSON"], text: null, personalData: [], firstPerson: true, removed: []
    });
    expect(guardSearch("I’m a nurse from Cluj")).toMatchObject({ outcome: "HOLD", reasons: ["FIRST_PERSON"] });
  });

  it.each([
    ["my salary Germany nurse", ["my"]],
    ["our company tax Romania", ["our"]],
    ["we moved to Spain cost", ["we"]],
    ["I earn too little nurse", ["I"]],
    ["salariul meu Germania asistentă", ["meu"]],
    ["firma noastră impozit", ["noastră"]],
    ["eu lucrez în Germania", ["eu"]]
  ] as const)("flags %j", (text, words) => {
    expect(firstPersonWords(text)).toEqual(words);
    expect(guardSearch(text)).toMatchObject({ outcome: "HOLD", reasons: ["FIRST_PERSON"], text: null });
  });

  it("reads first-person words after the orders are taken out, so \"show me\" alone holds nothing", () => {
    expect(guardSearch("Show me: nurse pay Cluj")).toMatchObject({ outcome: "SEND", text: "nurse pay Cluj", removed: ["INSTRUCTION"] });
    expect(guardSearch("find me my nurse pay Cluj")).toMatchObject({ outcome: "HOLD", reasons: ["FIRST_PERSON"] });
  });

  it.each([
    "World War I casualties",
    "Phase I trial results",
    "type I diabetes treatment",
    "US nurse salary",
    "EU nurse salary rules",
    "Portland ME housing prices",
    "MY ringgit exchange rate",
    "mine safety regulations Romania",
    "legi noi salariu minim"
  ])("does not flag %j", (text) => {
    expect(firstPersonWords(text)).toEqual([]);
    expect(guardSearch(text).outcome).toBe("SEND");
  });
});

describe("cleaning: dates and instruction words are removed by code", () => {
  it("lets the design's example leave without its year", () => {
    expect(guardSearch("nurse net salary Germany 2026")).toEqual({
      outcome: "SEND", reasons: [], text: "nurse net salary Germany", personalData: [], firstPerson: false, removed: ["DATE"]
    });
  });

  it.each([
    ["search for nurse salary Germany 2026", "nurse salary Germany", ["DATE", "INSTRUCTION"]],
    ["Please find minimum wage law Romania", "minimum wage law Romania", ["INSTRUCTION"]],
    ["inflation Romania in 2025", "inflation Romania", ["DATE"]],
    ["inflation Romania since 2020-01-01", "inflation Romania", ["DATE"]],
    ["unemployment 30/10/2026 Spain", "unemployment Spain", ["DATE"]],
    ["rent prices Cluj this year", "rent prices Cluj", ["DATE"]],
    ["GDP Romania October 2026", "GDP Romania", ["DATE"]],
    ["GDP Romania 30 October", "GDP Romania", ["DATE"]],
    ["Q3 2026 GDP Romania", "GDP Romania", ["DATE"]],
    ["inflation Romania 2020-2026", "inflation Romania", ["DATE"]],
    ["site:gov.ro \"minimum wage\" OR salary", "minimum wage salary", ["INSTRUCTION"]],
    ["caută salariul minim România 2026", "salariul minim România", ["DATE", "INSTRUCTION"]],
    ["inflația în România în octombrie 2025", "inflația în România", ["DATE"]],
    ["October revolution causes", "October revolution causes", []],
    ["latest study vaping harm", "latest study vaping harm", []]
  ] as const)("cleans %j", (raw, text, removed) => {
    expect(cleanSearchText(raw)).toEqual({ text, removed });
  });

  it("holds a search that is empty once cleaned, or far too long", () => {
    expect(guardSearch("search 2026")).toMatchObject({ outcome: "HOLD", reasons: ["EMPTY_AFTER_CLEANING"], text: null });
    expect(guardSearch("salary ".repeat(60))).toMatchObject({ outcome: "HOLD", reasons: ["TOO_LONG"], text: null });
  });

  it("checks the cleaned words too, so removing a date can never join a number into one that leaves", () => {
    expect(guardSearch("asistentă 0722 2026 123 456").outcome).toBe("HOLD");
  });
});

describe("long runs stay fast (CodeQL js/polynomial-redos, PR #224)", () => {
  it("scans 100,000 '%' with no @ in linear time, and still finds an email after them", () => {
    const run = "%".repeat(100_000);
    const started = performance.now();
    expect(findPersonalData(run)).toEqual([]);
    const found = findPersonalData(`${run} write to ana.pop@example.ro please`);
    expect(found.map((finding) => finding.kind)).toEqual(["EMAIL"]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("finds the email right after a long local-looking run, as its last 64 characters", () => {
    const text = `${"a".repeat(500)}@example.com`;
    const [finding] = findPersonalData(text);
    expect(finding?.kind).toBe("EMAIL");
    expect(finding?.end).toBe(text.length);
  });

  it("reads a domain of 100,000 '-' and many '@'-dash runs in linear time, and still finds a real email", () => {
    const started = performance.now();
    expect(findPersonalData(`x@${"-".repeat(100_000)}`)).toEqual([]);
    expect(findPersonalData(`a@${"-".repeat(1_000)} `.repeat(200))).toEqual([]);
    expect(findPersonalData(`${"-".repeat(50_000)} ion@exemplu-mare.ro`).map((finding) => finding.kind)).toEqual(["EMAIL"]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("finds an email whose parts use letters beyond the basic range, and leaves out a trailing dot", () => {
    const text = "scrie lui 𝒜na.ştefan@şcoală.ro. mulţumesc";
    const [finding] = findPersonalData(text);
    expect(finding?.kind).toBe("EMAIL");
    expect(text.slice(finding!.start, finding!.end)).toBe("𝒜na.ştefan@şcoală.ro");
  });

  it("reads 100,000 apostrophes as no first-person word, in linear time", () => {
    const started = performance.now();
    expect(firstPersonWords("'".repeat(100_000))).toEqual([]);
    expect(firstPersonWords(`${"'".repeat(50_000)}my${"'".repeat(50_000)} salary`)).toEqual(["my"]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
