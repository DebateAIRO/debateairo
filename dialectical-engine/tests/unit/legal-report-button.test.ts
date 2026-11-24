import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { cells, legalEnglishTranslatedFrom, legalLines, legalText, sectionLine } from "../support/legalText.js";

/**
 * The Report button, a report's six months, and the sealed originals' six months, in the Terms and the Privacy Policy.
 * English is pinned word for word; every language must have the same rows at the same places, and the old "control" and
 * the old "link" are gone from the live text. Rows and paragraphs are named by their section and their place in it
 * (tests/support/legalText.ts).
 */
const read = (locale: string, name: string): string => readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, name), "utf8");
const privacy = (locale: string): string[] => legalLines("PRIVACY", locale);
const terms = (locale: string): string[] => legalLines("TERMS", locale);
/**
 * How many lines below its section's heading an English line stands in the English text `locale` follows: English
 * itself, or the English text the translations were made from (legalEnglishTranslatedFrom), which can lack rows a later
 * English change added above it. A translation has the same line at the same place.
 */
const placeOf = (locale: string, section: number, start: string): number => {
  const lines = (locale === "en" ? legalText("PRIVACY", "en") : legalEnglishTranslatedFrom("PRIVACY")).split("\n");
  const heading = lines.findIndex((line) => line.startsWith(`## ${section}. `));
  const found = lines.findIndex((line, index) => index > heading && line.startsWith(start));
  if (heading === -1 || found === -1) throw new Error(`${locale}: no line starting ${start} in section ${section}`);
  return found - heading;
};

describe("the Report button and the six months in the legal texts", () => {
  it("English says it in the words drafted for the owner", () => {
    const body = read("en", "terms-of-service.md");
    // 0157 (Terms 2.17, D5): when an AI reads a report and when a person does, the good-faith statement, and a refused report's true line.
    expect(body).toContain("If you are signed in, you can also use the **Report** button on any public debate; it asks you to confirm that you believe in good faith that your report is accurate and complete. An AI usually reads a report made with the button beside the public text. If it agrees, and the debate has never been hidden before, the debate is hidden at once, with no person involved, and a person then reviews it.");
    expect(body).toContain("If the AI does not agree, or the report is stopped automatically (for example because you have sent many reports within an hour, or the debate is not public), no person reads it: you can write to support@dezbatere.ro and a person will read it, or complain through the route below.");
    expect(body).not.toContain("If it does not, you can report again with more details, and a person will read it.");
    expect(read("en", "privacy-policy.md")).toContain("Write to **privacy@dezbatere.ro**, or use the **Report** button on any public debate if you have an account. A public debate stays public, but if its text contains personal details about you or breaks our Terms, write to us, or use the Report button if you have an account: we can hide it");
    const decision36 = privacy("en").find((line) => line.startsWith("| The original of a corrected or removed passage |"));
    expect(cells(decision36!).join(" ").toLowerCase()).toContain("the original of a corrected or removed passage stays sealed, readable only by admins who review, for 6 months then it is deleted. a log entry stays, with a digest and no text");
    const reportsRow = privacy("en").find((line) => line.startsWith("| **Reports you make** |"));
    expect(cells(reportsRow!)[1]).toContain("Only admins who review can see your name");
    expect(read("en", "privacy-policy.md")).not.toMatch(/two people/iu);
    expect(sectionLine(privacy("en"), 5, 2)).toContain("If you use the Report button on a public debate, we send the words of your report and the public text of the debate to Claude Haiku 5.5, which checks the report; we add nothing that identifies you or your account.");
  });

  it("nothing in the English live text still calls it a control or a link", () => {
    expect(read("en", "terms-of-service.md")).not.toMatch(/Report\*\* control/u);
    const policy = read("en", "privacy-policy.md");
    expect(policy).not.toMatch(/Report\*\* control/u);
    // The 3.10 history entry was the last place that said "Report link"; the 1.0 text carries no history.
    expect(policy).not.toContain("Report link");
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the same rows at the same places, and the addresses", (code) => {
    const policy = privacy(code);
    const contract = terms(code);
    // Section 2's moderation notices row follows the reports row; section 7's two rows follow the sealed originals' row.
    // Rows are counted from the reports row in section 2, the report's row in section 7 and the legal requests' row in
    // section 4, at their places in the English text this language follows.
    const reports = placeOf(code, 2, "| **Reports you make** |");
    const report = placeOf(code, 7, "| A report you make with the Report button |");
    const collected = (below: number): string => sectionLine(policy, 2, reports + below);
    const kept = (below: number): string => sectionLine(policy, 7, report + below);
    for (const below of [0, 1]) expect(cells(collected(below)), `${code}: section 2's row ${below} below the reports row`).toHaveLength(3);
    expect(collected(1).startsWith("| **"), `${code}: the moderation notices row`).toBe(true);
    expect(collected(2).startsWith("| **"), `${code}: section 2 goes on after it`).toBe(true);
    for (const below of [0, 1, 2, 3, 4]) expect(cells(kept(below)), `${code}: section 7's row ${below} below the report's row`).toHaveLength(3);
    for (const below of [0, 1, 2, 3]) expect(kept(below)).not.toContain("Anthropic");
    expect(kept(4), `${code}: the new rows sit before the support chat's`).toContain("Anthropic");
    expect(cells(kept(1)).join(" "), `${code}: decision 36's six months`).toContain("6");
    expect(cells(kept(2)).join(" "), `${code}: the notices' twelve months`).toContain("12");
    expect(sectionLine(policy, 4, placeOf(code, 4, "| Handling legal requests")), `${code}: section 4 points at section 5`).toMatch(/5/u);
    const section5 = sectionLine(policy, 5, 2);
    const mentions = [...section5.matchAll(/Claude Haiku 5\.5/gu)].map((match) => match.index);
    // The paragraph names the model once for each of its four checks, in this order: the synthesis, the question, the
    // public text before it goes public, and the report, whose sentence comes last.
    expect(mentions, `${code}: section 5 names the model for the synthesis, question, publication and report checks`).toHaveLength(4);
    expect(section5.match(/Haiku/gu), `${code}: no other spelling of the model`).toHaveLength(4);
    // The publication check's description, which names the parts of the public text, is the longest stretch between two mentions.
    expect(mentions[3]! - mentions[2]!, `${code}: the publication check's sentences sit before the report's`)
      .toBeGreaterThan(Math.max(mentions[2]! - mentions[1]!, mentions[1]! - mentions[0]!));
    // ...and the report sentence ends the paragraph: what follows its mention is shorter than the publication check's stretch.
    expect(section5.length - mentions[3]!, `${code}: the report sentence comes last`).toBeLessThan(mentions[3]! - mentions[2]!);
    // Terms 1.0 is the first published text and carries no change log (owner's decision of 19 November 2026).
    expect(contract.join("\n"), `${code}: no Terms change log`).not.toMatch(/replaced (version )?2\.\d+|2\.12/u);
    expect(contract.filter((line) => line.includes("support@dezbatere.ro")).length).toBeGreaterThan(0);
    expect(read(code, "privacy-policy.md")).toContain("**privacy@dezbatere.ro**");
    expect(contract.slice(0, 25).join("\n")).not.toMatch(/2\.11/u);
    expect(policy.slice(0, 24).join("\n")).not.toMatch(/3\.10/u);
  });
});
