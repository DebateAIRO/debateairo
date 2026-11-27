import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { cells, legalText, sectionBody, type LegalKind } from "../support/legalText.js";

/**
 * Upvotes on public debates, in the Privacy Policy (sections 2, 4, 7, 10 and 14) and the Terms of Service (sections 9
 * and 14). English is pinned word for word, as the owner approved it. Every language has the same rows and the same
 * paragraph at the same places, names the data the same way in sections 2, 4 and 7, and says it in its own words:
 * recording a translation (generate-legal-data.mjs --translated) compares structure only, so a pasted English row
 * would pass it.
 */
const ENGLISH = {
  collect: "| **Upvotes on public debates** | When you upvote a public debate: which debate, and when. Your upvote is tied to your account, so that it counts once and so that pressing the button again takes it back while the debate is on the list of public debates. The list of public debates shows only how many upvotes each debate has. No page shows who gave them, to other people or to our team | You, when you press the upvote button on the list of public debates |",
  purpose: "| Recording your upvotes on public debates, so that each account counts once for a debate and can take its upvote back, and showing how many upvotes each public debate has | Upvotes on public debates | **Contract** — Art. 6(1)(b) |",
  retain: "| Upvotes on public debates | Until you take the upvote back, which the button does while the debate is on the list of public debates, or until the account is deleted after the closure grace period. A debate we hide while we review it keeps its upvotes, and they count again if it comes back | Deleted at once when you take it back, and the debate's count goes down by one. Deleted with the account. Also deleted, by an automatic clean-up that runs every hour, when the debate's public page is gone for good, as when our check deletes the debate (section 6) |",
  access: "It also holds each question you have not started yet, with your answers and paths. It also holds the public debates you upvoted, and when. |",
  policySummary: "Version 1.3 replaced version 1.2: sections 2, 4 and 7 now say that we keep which public debates you upvote and when, that the list of public debates shows only how many upvotes each debate has, and how long we keep an upvote. Section 10 now says that your export holds them. Version 1.2 replaced version 1.1: ",
  terms: "**Upvotes.** When you are signed in, you can upvote a debate on the list of public debates, your own included, to show other readers that you found it worth reading. Each account has one upvote for each debate, and pressing the button again takes yours back while the debate is on the list. The list shows how many upvotes each debate has and never who gave them. Your upvotes are deleted when the closure of your account takes effect (section 6), and a debate's upvotes are deleted when its public page is gone for good (Privacy Policy, section 7). Do not use more than one account, or any automated means, to change a count: section 6 allows you one account, and section 7 does not allow automated access.",
  termsSummary: "Version 1.2 replaced version 1.1: section 9 now says what an upvote on a public debate is, that each account has one for each debate and can take it back, that the list shows how many upvotes a debate has and never who gave them, and that a count must not be changed with more than one account or by automated means. Version 1.1 replaced version 1.0: "
} as const;

const CODES = LOCALES.map(({ code }) => code);
/** The body rows of a section's one table, without the header and the separator. */
const rows = (kind: LegalKind, code: string, section: number): string[] =>
  sectionBody(legalText(kind, code), section).split("\n").filter((line) => line.startsWith("| ")).slice(1)
    .filter((line) => !/^\|\s*-{3}/u.test(line));
const paragraphs = (kind: LegalKind, code: string, section: number): string[] =>
  sectionBody(legalText(kind, code), section).split("\n").filter((line) => line.trim() !== "");
/** Where each English passage stands in its section; every language has the same lines in the same order. */
const AT = {
  collect: rows("PRIVACY", "en", 2).indexOf(ENGLISH.collect),
  purpose: rows("PRIVACY", "en", 4).indexOf(ENGLISH.purpose),
  support: rows("PRIVACY", "en", 4).findIndex((row) => row.startsWith("| Answering support requests |")),
  retain: rows("PRIVACY", "en", 7).indexOf(ENGLISH.retain),
  terms: paragraphs("TERMS", "en", 9).indexOf(ENGLISH.terms)
};

describe("upvotes on public debates, in the Privacy Policy and the Terms of Service", () => {
  it("English says it in the approved words, at the approved places", () => {
    const collect = rows("PRIVACY", "en", 2);
    expect(collect).toHaveLength(19);
    expect([AT.collect - 1, AT.collect + 1].map((index) => cells(collect[index]!)[0])).toEqual(["**Support**", "**Reports you make**"]);
    const purpose = rows("PRIVACY", "en", 4);
    expect(purpose).toHaveLength(18);
    expect(purpose[AT.purpose - 1]!.startsWith("| Making a debate public")).toBe(true);
    expect(purpose[AT.purpose + 1]!.startsWith("| Checking the synthesis of each finished debate")).toBe(true);
    const retain = rows("PRIVACY", "en", 7);
    expect(retain).toHaveLength(34);
    expect([AT.retain - 1, AT.retain + 1].map((index) => cells(retain[index]!)[0]))
      .toEqual(["A debate our check deletes (section 6)", "A report you make with the Report button"]);
    expect(rows("PRIVACY", "en", 10)[0]!.endsWith(ENGLISH.access)).toBe(true);
    expect(paragraphs("PRIVACY", "en", 14).at(-1)!.split(ENGLISH.policySummary)).toHaveLength(2);
    const publishing = paragraphs("TERMS", "en", 9);
    expect(publishing[AT.terms - 1]!.startsWith("**Reports by anyone.**")).toBe(true);
    expect(publishing[AT.terms + 1]!.startsWith("**After the author leaves.**")).toBe(true);
    expect(paragraphs("TERMS", "en", 14).at(-1)!.startsWith(ENGLISH.termsSummary)).toBe(true);
  });

  it.each(CODES.map((code) => [code]))("%s: the same rows and the same paragraph at the same places, named the same way", (code) => {
    for (const section of [2, 4, 7]) expect(rows("PRIVACY", code, section), `${code}: section ${section} rows`).toHaveLength(rows("PRIVACY", "en", section).length);
    const collect = cells(rows("PRIVACY", code, 2)[AT.collect]!);
    expect(collect, `${code}: section 2 row shape`).toHaveLength(3);
    expect(collect[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    const label = collect[0]!.slice(2, -2);
    const purpose = cells(rows("PRIVACY", code, 4)[AT.purpose]!);
    expect(purpose, `${code}: section 4 row shape`).toHaveLength(3);
    expect(purpose[1], `${code}: section 4 names the section 2 row`).toBe(label);
    expect(purpose[2], `${code}: the basis reads as in the support row`).toBe(cells(rows("PRIVACY", code, 4)[AT.support]!)[2]);
    expect(purpose[2], `${code}: the basis`).toContain("Art. 6(1)(b)");
    const retain = cells(rows("PRIVACY", code, 7)[AT.retain]!);
    expect(retain, `${code}: section 7 row shape`).toHaveLength(3);
    expect(retain[0], `${code}: section 7 names the section 2 row`).toBe(label);
    expect(retain[2], `${code}: a deleted debate points at section 6`).toMatch(/(?<![\d.])6(?!\d)/u);
    const publishing = paragraphs("TERMS", code, 9);
    expect(publishing, `${code}: section 9 paragraphs`).toHaveLength(paragraphs("TERMS", "en", 9).length);
    expect(publishing[AT.terms], `${code}: a paragraph with a bold lead`).toMatch(/^\*\*[^*]+\*\* \S/u);
    expect(publishing[AT.terms], `${code}: it points at sections 6 and 7`).toMatch(/(?<![\d.])6(?!\d)[\s\S]*(?<![\d.])7(?!\d)/u);
  });

  it.each(CODES.filter((code) => code !== "en").map((code) => [code]))("%s: in its own words, never the English ones", (code) => {
    expect(rows("PRIVACY", code, 2)[AT.collect], `${code}: section 2`).not.toBe(ENGLISH.collect);
    expect(cells(rows("PRIVACY", code, 2)[AT.collect]!)[1], `${code}: section 2, what is kept`).not.toBe(cells(ENGLISH.collect)[1]);
    expect(cells(rows("PRIVACY", code, 4)[AT.purpose]!)[0], `${code}: section 4, the purpose`).not.toBe(cells(ENGLISH.purpose)[0]);
    expect(cells(rows("PRIVACY", code, 7)[AT.retain]!).slice(1), `${code}: section 7`).not.toEqual(cells(ENGLISH.retain).slice(1));
    const policy = legalText("PRIVACY", code);
    expect(policy, `${code}: the export sentence`).not.toContain("It also holds the public debates you upvoted, and when.");
    expect(policy, `${code}: the Privacy Policy's summary`).not.toContain("sections 2, 4 and 7 now say that we keep which public debates you upvote");
    const terms = legalText("TERMS", code);
    expect(paragraphs("TERMS", code, 9)[AT.terms], `${code}: the Terms' paragraph`).not.toBe(ENGLISH.terms);
    expect(terms, `${code}: the Terms' paragraph`).not.toContain("When you are signed in, you can upvote a debate");
    expect(terms, `${code}: the Terms' summary`).not.toContain("section 9 now says what an upvote on a public debate is");
  });
});
