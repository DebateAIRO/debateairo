import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Privacy Policy 3.8, R22 (owner ruling 2026-10-30, "Add a clarifying clause"): since 3.8 lists what the debate pages
 * keep in the account (the "Page settings and visits" row, tests/unit/legal-privacy-page-memory-row.test.ts), section
 * 2's "We do not collect analytics or telemetry about how you use the product" gains the owner's clause: we keep only
 * what the pages need to work for you, listed in this table (such as when you last opened a debate's map). The
 * sentence's own "and we set no cookies for that purpose" stays where it was, before the clause. 3.8 was never
 * published (V-80 deploy-day marker), so the version stays.
 *
 * English and Romanian, the texts counsel reviews, are pinned word for word. Every locale: the paragraph changed (the
 * old one gave no example in brackets; the clause's example is the only one), and the website's generated data
 * carries the same paragraph as the draft.
 */

const markdown = (locale: string): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "privacy-policy.md"), "utf8");

/** Section 2's paragraph on analytics and telemetry: its last paragraph, after the collection table. */
const analyticsParagraph = (locale: string): string => {
  const body = /^## 2\.[^\n]*\n([\s\S]*?)^## 3\./mu.exec(markdown(locale))?.[1];
  if (body === undefined) throw new Error(`${locale}: no section 2`);
  return body.split("\n").filter((line) => line.trim() !== "" && !line.startsWith("|")).at(-1)!;
};

/** The same paragraph in the website's generated data (`pnpm run generate:legal`), which drops the draft's bold marks. */
const generatedParagraph = async (locale: string): Promise<string> => {
  const module = (locale === "en"
    ? await import("../../apps/ui/lib/privacyPolicy.js")
    : await import(`../../apps/ui/lib/legal/${locale}/privacyPolicy.ts`)) as { PRIVACY_POLICY: LegalDocument };
  const blocks = module.PRIVACY_POLICY.sections.find((section) => section.no === "02")!.blocks;
  const last = blocks.at(-1)!;
  if (last.kind !== "p") throw new Error(`${locale}: section 2 ends with a ${last.kind}`);
  return last.text;
};

const PINNED = {
  en: "We do **not** collect analytics or telemetry about how you use the product, and we set no cookies for that purpose; we keep only what the pages need to work for you, listed in this table (such as when you last opened a debate's map). If that changes, this policy and the Cookie Policy change first, and you will be asked.",
  ro: "**Nu** colectăm date analitice sau de telemetrie despre modul în care utilizați produsul și nu setăm module cookie în acest scop; păstrăm doar ceea ce le este necesar paginilor pentru a funcționa pentru dumneavoastră, după cum arată acest tabel (de exemplu, când ați deschis ultima dată harta unei dezbateri). Dacă acest lucru se schimbă, prezenta politică și Politica privind modulele cookie vor fi modificate mai întâi, iar dumneavoastră veți fi întrebat."
} as const;

describe("Privacy Policy 3.8 says what it keeps beside the analytics it does not collect (R22, owner 2026-10-30)", () => {
  it.each(Object.entries(PINNED))("%s: the paragraph reads exactly as approved", (code, pinned) => {
    expect(analyticsParagraph(code)).toBe(pinned);
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the clause is there, the website carries it, and the version is still 3.8", async (code) => {
    const paragraph = analyticsParagraph(code);
    // The old paragraph held no bracket at all; the clause's example is the only one.
    expect(paragraph.match(/[(（]/gu), `${code}: one bracketed example`).toHaveLength(1);
    expect(paragraph, `${code}: still the paragraph on analytics, bold mark included`).toMatch(/\*\*[^*]+\*\*/u);
    expect(await generatedParagraph(code), `${code}: the generated data`).toBe(paragraph.replaceAll("**", ""));
    expect(markdown(code), `${code}: still version 3.8`).toMatch(/v3\.8 /u);
  });

  it("every one of the 35 languages", () => {
    expect(LOCALES).toHaveLength(35);
  });
});
