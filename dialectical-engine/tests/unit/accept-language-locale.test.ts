import { describe, expect, it } from "vitest";
import { firstVisitLocale, preferredOfferedLocale } from "../../apps/ui/lib/i18n/acceptLanguage.js";

/**
 * A visitor who has not picked a language sees the offered language (English or Romanian) their browser ranks highest:
 * Romanian for a browser that prefers Romanian, English for every other browser and for a crawler that sends nothing.
 */
describe("the offered language a browser's Accept-Language ranks highest", () => {
  it("reads Romanian from a Romanian browser, whatever region it names", () => {
    for (const header of ["ro", "ro-RO", "ro-MD", "RO-ro", "ro-RO,ro;q=0.9,en;q=0.8", "ro-MD,ru;q=0.9", " ro-RO ; q=1 , en ; q=0.5"]) {
      expect(preferredOfferedLocale(header), header).toBe("ro");
    }
  });

  it("keeps English for a browser that ranks English above Romanian", () => {
    expect(preferredOfferedLocale("en-US,en;q=0.9,ro;q=0.8")).toBe("en");
    expect(preferredOfferedLocale("en-GB,ro;q=0.9")).toBe("en");
    expect(preferredOfferedLocale("ro;q=0.5,en;q=0.9")).toBe("en");
  });

  it("lets the weights decide, not the order, and gives a tie to the earlier entry", () => {
    expect(preferredOfferedLocale("en;q=0.7,ro;q=0.8")).toBe("ro");
    expect(preferredOfferedLocale("de-DE,de;q=0.9,en;q=0.8,ro;q=0.7")).toBe("en");
    expect(preferredOfferedLocale("de-DE,de;q=0.9,ro;q=0.8,en;q=0.7")).toBe("ro");
    expect(preferredOfferedLocale("en,ro")).toBe("en");
    expect(preferredOfferedLocale("ro,en")).toBe("ro");
    expect(preferredOfferedLocale("ro;q=0.8,en;q=0.800")).toBe("ro");
    expect(preferredOfferedLocale("en-US;q=0.2,ro;q=0.5,en;q=0.9")).toBe("en");
  });

  it("reads Romanian when it is the only offered language a German browser accepts", () => {
    expect(preferredOfferedLocale("de-DE,de;q=0.9,ro;q=0.8")).toBe("ro");
  });

  it("answers null when the header names no offered language, or refuses them", () => {
    for (const header of [null, undefined, "", "de-DE,de", "fr;q=1", "ro;q=0", "ro;q=0.000,de", "mo", "rom", "rum", ","]) {
      expect(preferredOfferedLocale(header), String(header)).toBeNull();
    }
  });

  it("reads * as every offered language the header does not name, English first", () => {
    expect(preferredOfferedLocale("*")).toBe("en");
    expect(preferredOfferedLocale("*;q=0")).toBeNull();
    expect(preferredOfferedLocale("ro;q=0.5,*;q=0.8")).toBe("en");
    expect(preferredOfferedLocale("ro,*;q=0.8")).toBe("ro");
    expect(preferredOfferedLocale("ro;q=0,*")).toBe("en");
    expect(preferredOfferedLocale("en;q=0.4,*")).toBe("ro");
    expect(preferredOfferedLocale("fr-FR,fr;q=0.9,*;q=0.5")).toBe("en");
  });

  it("skips an unreadable entry and still reads the others", () => {
    for (const header of [
      "ro;q=abc,en;q=0.5",
      "ro;q=2,en;q=0.5",
      "ro;q=-1,en;q=0.5",
      "ro;q=0.5555,en;q=0.5",
      "ro;q=.9,en;q=0.5",
      "ro;q=0x1,en;q=0.5",
      "ro;q=1e0,en;q=0.5",
      "ro;q=Infinity,en;q=0.5",
      "ro;q=0.9;q=0.1,en;q=0.5",
      "ro;level=1,en;q=0.5",
      "ro_RO,en;q=0.5",
      "ro--RO,en;q=0.5",
      "ro-ROMANIANS,en;q=0.5",
      "rö,en;q=0.5",
      "ro\u0000,en;q=0.5"
    ]) {
      expect(preferredOfferedLocale(header), header).toBe("en");
    }
    expect(preferredOfferedLocale("en;q=bad,ro;q=0.1")).toBe("ro");
    expect(preferredOfferedLocale(";;;,;q=1,=,ro")).toBe("ro");
  });

  it("reads only the first kilobyte of a huge header, in whole entries, and never throws", () => {
    const filler = "de;q=0.1,".repeat(200);
    expect(filler.length).toBeGreaterThan(1024);
    expect(preferredOfferedLocale(`ro,${filler}en`)).toBe("ro");
    // 111 entries of 9 characters fill 999; Romanian ends inside the first kilobyte and English stands far past it, so
    // English is never read and Romanian, the one offered language read, decides.
    expect(preferredOfferedLocale(`${"de;q=0.1,".repeat(111)}ro;q=0.5,${filler}en`)).toBe("ro");
    // An entry the limit cuts is not read at all: "rom" (Romani) never turns into "ro".
    expect(preferredOfferedLocale(`${"x".repeat(1022)},rom`)).toBeNull();
    expect(preferredOfferedLocale(`${"de,".repeat(340)}ro`)).toBe("ro");
    expect(preferredOfferedLocale(`${"de,".repeat(342)}ro`)).toBeNull();
    // One giant entry with no comma inside the limit reads as nothing.
    expect(preferredOfferedLocale(`ro${"-a".repeat(100_000)}`)).toBeNull();
    expect(preferredOfferedLocale("ro;q=1".padEnd(1_000_000, " "))).toBeNull();
    const huge = filler.repeat(50);
    const started = performance.now();
    for (let round = 0; round < 1_000; round += 1) preferredOfferedLocale(huge);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("the language a visitor who has not picked one sees", () => {
  it("is Romanian only for a browser that prefers Romanian; null means the site's English", () => {
    expect(firstVisitLocale("ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("ro");
    expect(firstVisitLocale("ro-MD")).toBe("ro");
    expect(firstVisitLocale("en-US,en;q=0.9,ro;q=0.8")).toBeNull();
    expect(firstVisitLocale("en")).toBeNull();
    expect(firstVisitLocale("de-DE,de")).toBeNull();
    expect(firstVisitLocale("*")).toBeNull();
    expect(firstVisitLocale(null)).toBeNull();
    expect(firstVisitLocale("")).toBeNull();
  });
});
