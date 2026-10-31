import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Privacy Policy 3.8, R22 item 15 (owner-approved 2026-10-29): the V4 debate pages keep three things in the account
 * (migration 0131: identity.page_reading_level, identity.debate_last_visit, identity.dig_link), so the policy says so.
 * Section 2 gains the row "Page settings and visits" after "Debate content"; section 4's first row lists it among its
 * data; section 7 gains its retention row after "Provider return records and retrieval references": kept while the
 * account exists, deleted with the account, and (R22 item 16) a debate's last visit and its links are also deleted with
 * that debate. Section 14's 3.8 entry says so. 3.8 was never published (V-80 deploy-day marker), so the version stays.
 *
 * Every locale: the same rows at the same places, the section 7 row named as the section 2 row, section 4's first row
 * naming it, and the deletion with the debate pointing at section 6. English and Romanian, the texts counsel reviews,
 * are pinned word for word.
 */

const markdown = (locale: string): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "privacy-policy.md"), "utf8");

const section = (locale: string, from: number): string => {
  const body = new RegExp(`^## ${from}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(markdown(locale))?.[1];
  if (body === undefined) throw new Error(`${locale}: no section ${from}`);
  return body;
};

/** The body rows of the section's one table, without the header and the separator. */
const tableRows = (locale: string, from: number): string[] =>
  section(locale, from).split("\n").filter((line) => line.startsWith("| ")).slice(1)
    .filter((line) => !/^\|\s*-{3}/u.test(line));

const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

/** Where the new rows sit: section 2's ninth row (after "Debate content"), section 7's thirteenth. */
const COLLECT_AT = 8;
const RETAIN_AT = 12;

const PINNED = {
  en: {
    collect: "| **Page settings and visits** | The reading level you choose on the debate pages; for each of your debates, when you last opened its map and a short list of what the map showed then (the ids of its points, paths, open questions and follow-up debates, each with one state word, no text); for each follow-up debate you start from a map, which debate and which place on its map it came from, and whether it was a quick look or a thorough one | You, as you use the debate pages |",
    purpose: "Account, sessions, debate content, page settings and visits",
    retain: "| Page settings and visits | While the account exists | Deleted with the account. A debate's last visit, and its links to the debate it was started from and to the follow-up debates started from it, are also deleted when that debate is deleted, by you or by our check (section 6) |",
    log: "Version 3.8 also says what the debate pages keep in your account, and for how long: the reading level you choose, when you last opened each debate's map and what it showed, and where each follow-up debate came from (sections 2, 4 and 7)."
  },
  ro: {
    collect: "| **Setările paginilor și vizitele** | Nivelul de lectură pe care îl alegeți în paginile dezbaterilor; pentru fiecare dezbatere a dumneavoastră, când i-ați deschis ultima dată harta și o listă scurtă cu ce arăta atunci harta (identificatorii punctelor, căilor, întrebărilor deschise și dezbaterilor ulterioare, fiecare cu un singur cuvânt pentru starea sa, fără text); pentru fiecare dezbatere ulterioară pe care o porniți de pe o hartă, din ce dezbatere și din ce loc al hărții ei provine și dacă a fost o privire rapidă sau una amănunțită | Dumneavoastră, pe măsură ce folosiți paginile dezbaterilor |",
    purpose: "Cont, sesiuni, conținutul dezbaterilor, setările paginilor și vizitele",
    retain: "| Setările paginilor și vizitele | Cât timp există contul | Șterse odată cu contul. Ultima vizită a unei dezbateri și legăturile ei cu dezbaterea din care a pornit și cu dezbaterile ulterioare pornite din ea sunt șterse și atunci când este ștearsă acea dezbatere, de dumneavoastră sau de verificarea noastră (secțiunea 6) |",
    log: "Versiunea 3.8 spune și ce păstrează paginile dezbaterilor în contul dumneavoastră și cât timp: nivelul de lectură ales, când ați deschis ultima dată harta fiecărei dezbateri și ce arăta ea, și de unde provine fiecare dezbatere ulterioară (secțiunile 2, 4 și 7)."
  }
} as const;

describe("Privacy Policy 3.8 says what the debate pages keep in the account (R22 item 15)", () => {
  const englishCollect = tableRows("en", 2).length;
  const englishRetain = tableRows("en", 7).length;

  it("English has the new rows where the owner placed them", () => {
    expect(englishCollect).toBe(14);
    expect(cells(tableRows("en", 2)[COLLECT_AT - 1]!)[0]).toBe("**Debate content**");
    expect(englishRetain).toBe(23);
    expect(cells(tableRows("en", 7)[RETAIN_AT - 1]!)[0]).toBe("Provider return records and retrieval references");
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the same three changes at the same places", (code) => {
    const collect = tableRows(code, 2);
    expect(collect, `${code}: section 2 rows`).toHaveLength(englishCollect);
    const row = cells(collect[COLLECT_AT]!);
    expect(row, `${code}: section 2 row shape`).toHaveLength(3);
    expect(row[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    const label = row[0]!.slice(2, -2);
    const retain = tableRows(code, 7);
    expect(retain, `${code}: section 7 rows`).toHaveLength(englishRetain);
    const kept = cells(retain[RETAIN_AT]!);
    expect(kept, `${code}: section 7 row shape`).toHaveLength(3);
    expect(kept[0], `${code}: section 7 names the section 2 row`).toBe(label);
    expect(kept[2], `${code}: deletion with the debate points at section 6`).toMatch(/6/u);
    const purpose = cells(tableRows(code, 4)[0]!)[1]!;
    expect(purpose.toLocaleLowerCase(code), `${code}: section 4's first row lists it`).toContain(label.toLocaleLowerCase(code));
    expect(markdown(code), `${code}: still version 3.8`).toMatch(/v3\.8 /u);
  });

  it.each(Object.entries(PINNED))("%s: the rows and the change-log sentence read exactly as approved", (code, pinned) => {
    expect(tableRows(code, 2)[COLLECT_AT]).toBe(pinned.collect);
    expect(cells(tableRows(code, 4)[0]!)[1]).toBe(pinned.purpose);
    expect(tableRows(code, 7)[RETAIN_AT]).toBe(pinned.retain);
    expect(section(code, 14)).toContain(pinned.log);
  });
});
