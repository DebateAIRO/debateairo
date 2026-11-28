import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { legalEnglishTranslatedFrom } from "../support/legalText.js";

/**
 * Privacy Policy 3.8, R22 item 15 (owner-approved 2026-10-29): the V4 debate pages keep three things in the account
 * (migration 0131: identity.page_reading_level, identity.debate_last_visit, identity.dig_link), so the policy says so.
 * Section 2 gains the row "Page settings and visits" after "Debate content"; section 4's first row lists it among its
 * data; section 7 gains its retention row after "Provider return records and retrieval references": kept while the
 * account exists, deleted with the account, and (R22 item 16) a debate's last visit and its links are also deleted with
 * that debate. Section 14's 3.8 entry said so until launch renumbered the text 1.0 and section 14 lost its history
 * (tests/unit/legal-reset-10.test.ts). 3.8 was never published (V-80 deploy-day marker), so the version stayed.
 *
 * Every locale: the same rows at the same places, the section 7 row named as the section 2 row, section 4's first row
 * naming it, and the deletion with the debate pointing at section 6. English and Romanian, the texts counsel reviews,
 * are pinned word for word.
 *
 * Privacy 3.12 (plan Task 83c, saved questions): sections 2 and 7 gain the row "Questions not started yet" right after
 * this one, and section 4's first row lists it after this one.
 */

const markdown = (locale: string): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, "privacy-policy.md"), "utf8");

const sectionOf = (text: string, from: number): string => {
  const body = new RegExp(`^## ${from}\\.[^\\n]*\\n([\\s\\S]*?)^## `, "mu").exec(text)?.[1];
  if (body === undefined) throw new Error(`no section ${from}`);
  return body;
};

/** The body rows of the section's one table, without the header and the separator. */
const rowsOf = (text: string, from: number): string[] =>
  sectionOf(text, from).split("\n").filter((line) => line.startsWith("| ")).slice(1)
    .filter((line) => !/^\|\s*-{3}/u.test(line));
const tableRows = (locale: string, from: number): string[] => rowsOf(markdown(locale), from);

const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

/**
 * Where the section 2 row sits: right after "Debate content", at the place it has in the English text the language
 * follows (legalEnglishTranslatedFrom: a translation can still follow the English text before a change that added rows
 * above it). The section 7 row is found by what it is, its name (later versions add rows before it).
 */
const englishFor = (locale: string): string => (locale === "en" ? markdown("en") : legalEnglishTranslatedFrom("PRIVACY"));
const collectAt = (locale: string): number =>
  rowsOf(englishFor(locale), 2).findIndex((row) => cells(row)[0] === "**Page settings and visits**");
const retainRowNamed = (locale: string, label: string): string | undefined => tableRows(locale, 7).find((row) => cells(row)[0] === label);

const PINNED = {
  en: {
    collect: "| **Page settings and visits** | The reading level you choose on the debate pages; for each of your debates, when you last opened its map and a short list of what the map showed then (the ids of its points, paths, open questions and follow-up debates, each with one state word, no text); for each follow-up debate you start from a map, which debate and which place on its map it came from, and whether it was a quick look or a thorough one | You, as you use the debate pages |",
    purpose: "Account, sessions, debate content, page settings and visits, questions not started yet",
    retain: "| Page settings and visits | While the account exists | Deleted with the account. A debate's last visit, and its links to the debate it was started from and to the follow-up debates started from it, are also deleted when that debate is deleted, by you or by our check (section 6) |"
  },
  ro: {
    collect: "| **Setările paginilor și vizitele** | Nivelul de lectură pe care îl alegeți în paginile dezbaterilor; pentru fiecare dezbatere a dumneavoastră, când i-ați deschis ultima dată harta și o listă scurtă cu ce arăta atunci harta (identificatorii punctelor, căilor, întrebărilor deschise și dezbaterilor ulterioare, fiecare cu un singur cuvânt pentru starea sa, fără text); pentru fiecare dezbatere ulterioară pe care o porniți de pe o hartă, din ce dezbatere și din ce loc al hărții ei provine și dacă a fost o privire rapidă sau una amănunțită | Dumneavoastră, pe măsură ce folosiți paginile dezbaterilor |",
    purpose: "Cont, sesiuni, conținutul dezbaterilor, setările paginilor și vizitele, întrebările încă nepornite",
    retain: "| Setările paginilor și vizitele | Cât timp există contul | Șterse odată cu contul. Ultima vizită a unei dezbateri și legăturile ei cu dezbaterea din care a pornit și cu dezbaterile ulterioare pornite din ea sunt șterse și atunci când este ștearsă acea dezbatere, de dumneavoastră sau de verificarea noastră (secțiunea 6) |"
  }
} as const;

describe("Privacy Policy 3.8 says what the debate pages keep in the account (R22 item 15)", () => {
  it("English has the new rows where the owner placed them", () => {
    // 0157: the moderation notices row in section 2, and its two rows in section 7; Privacy 3.12: the questions not started yet,
    // one row in each. Privacy 3.15: section 7 gains the unfinished sign-up row, and its acceptance row becomes two.
    // Privacy 1.2: the requests for help getting back into an account, one row in each.
    // Privacy 1.3: upvotes on public debates, one row in each.
    expect(tableRows("en", 2)).toHaveLength(19);
    expect(cells(tableRows("en", 2)[collectAt("en") - 1]!)[0]).toBe("**Debate content**");
    expect(tableRows("en", 7)).toHaveLength(34);
    const names = tableRows("en", 7).map((row) => cells(row)[0]);
    expect(names.indexOf("Page settings and visits")).toBeGreaterThan(names.indexOf("Provider return records and retrieval references"));
    expect(names.indexOf("Provider return records and retrieval references")).toBeGreaterThanOrEqual(0);
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the same three changes at the same places", (code) => {
    const collect = tableRows(code, 2);
    expect(collect, `${code}: section 2 rows`).toHaveLength(rowsOf(englishFor(code), 2).length);
    const row = cells(collect[collectAt(code)]!);
    expect(row, `${code}: section 2 row shape`).toHaveLength(3);
    expect(row[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    const label = row[0]!.slice(2, -2);
    const retain = tableRows(code, 7);
    expect(retain, `${code}: section 7 rows`).toHaveLength(rowsOf(englishFor(code), 7).length);
    const found = retainRowNamed(code, label);
    expect(found, `${code}: section 7 names the section 2 row`).toBeDefined();
    const kept = cells(found!);
    expect(kept, `${code}: section 7 row shape`).toHaveLength(3);
    expect(kept[2], `${code}: deletion with the debate points at section 6`).toMatch(/6/u);
    const purpose = cells(tableRows(code, 4)[0]!)[1]!;
    expect(purpose.toLocaleLowerCase(code), `${code}: section 4's first row lists it`).toContain(label.toLocaleLowerCase(code));
    expect(markdown(code), `${code}: now version 1.4`).toMatch(/v1\.4 /u);
  });

  it.each(Object.entries(PINNED))("%s: the rows read exactly as approved", (code, pinned) => {
    expect(tableRows(code, 2)[collectAt(code)]).toBe(pinned.collect);
    expect(cells(tableRows(code, 4)[0]!)[1]).toBe(pinned.purpose);
    expect(retainRowNamed(code, cells(pinned.retain)[0]!)).toBe(pinned.retain);
  });
});
