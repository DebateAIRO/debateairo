import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Terms 2.12 and Privacy 3.11, R22 decisions 35 and 36: the Report button, a report's six months, and the sealed originals' six months.
 * English is pinned word for word; every language must have the same rows at the same places, and the old "control" and the old "link" are gone from the live text.
 * Privacy 3.12 (plan Task 83c) adds a row after section 2's "Page settings and visits" and another after section 7's, so
 * the privacy indexes from 44 on moved by one, and those from 153 on by two (0-based, as below). Privacy 3.11's moderation notices row (V4,
 * 0157, amended in place) moves those from 48 on by one more, and its two section 7 rows those from 161 on by two more.
 */
const read = (locale: string, name: string): string => readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, name), "utf8");
const privacy = (locale: string): string[] => read(locale, "privacy-policy.md").split("\n");
const terms = (locale: string): string[] => read(locale, "terms-of-service.md").split("\n");
const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

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
    expect(privacy("en")[97]).toContain("If you use the Report button on a public debate, we send the words of your report and the public text of the debate to an AI, which checks the report; we add nothing that identifies you or your account.");
  });

  it("nothing in the English live text still calls it a control, and only the 3.10 history still calls it a link", () => {
    expect(read("en", "terms-of-service.md")).not.toMatch(/Report\*\* control/u);
    const policy = read("en", "privacy-policy.md");
    expect(policy).not.toMatch(/Report\*\* control/u);
    expect(policy.split("Report link").length - 1).toBe(1);
    expect(policy.indexOf("Report link")).toBeGreaterThan(policy.indexOf("Version 3.10 replaced version 3.9"));
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the same rows at the same places, the versions and the addresses", (code) => {
    const policy = privacy(code);
    const contract = terms(code);
    // 0157 (Privacy 3.11, amended in place) under this branch's 3.12 (one row more in section 2 before it, one in section 7): section 2's moderation
    // notices row follows the reports row; section 7's two rows follow decision 36's.
    for (const at of [47, 48]) expect(cells(policy[at]!), `${code}: section 2's row at ${at}`).toHaveLength(3);
    expect(policy[48]!.startsWith("| **"), `${code}: the moderation notices row`).toBe(true);
    expect(policy[49]!.startsWith("| **"), `${code}: section 2 goes on after it`).toBe(true);
    for (const at of [159, 160, 161, 162, 163]) expect(cells(policy[at]!), `${code}: section 7 row at ${at}`).toHaveLength(3);
    for (const at of [159, 160, 161, 162]) expect(policy[at]!).not.toContain("Anthropic");
    expect(policy[163]!, `${code}: the new rows sit before the support chat's`).toContain("Anthropic");
    expect(cells(policy[160]!).join(" "), `${code}: decision 36's six months`).toContain("6");
    expect(cells(policy[161]!).join(" "), `${code}: the notices' twelve months`).toContain("12");
    expect(policy[91]!, `${code}: section 4 points at section 5`).toMatch(/5/u);
    // The paragraph still names the model for the two other checks, so the marker is the count: the report sentence, which comes last, adds no third mention.
    const section5 = policy[97]!;
    const mentions = [...section5.matchAll(/Claude Haiku 5\.5/gu)].map((match) => match.index);
    expect(mentions, `${code}: section 5 names the model for the synthesis and the question checks only`).toHaveLength(2);
    expect(section5.match(/Haiku/gu), `${code}: no other spelling of the model`).toHaveLength(2);
    // ...and the report sentence is still there after the last mention: what follows it is longer than the stretch between the two mentions. Without the sentence it is at most 0.7 of that in every language, with it at least 1.36.
    expect(section5.length - mentions[1]!, `${code}: the report sentence follows the question check's`).toBeGreaterThan(mentions[1]! - mentions[0]!);
    const log = policy.find((line) => line.includes("3.11") && line.includes("3.10") && line.includes("3.9"));
    expect(log, `${code}: the change log`).toBeDefined();
    expect(log!.indexOf("3.11"), `${code}: newest first`).toBeLessThan(log!.indexOf("3.9"));
    const terms212 = contract.findIndex((line) => line.includes("2.12") && line.includes("2.11"));
    expect(contract[terms212 + 2]!, `${code}: the old log follows`).toMatch(/2\.11[^]*2\.10/u);
    expect(contract.filter((line) => line.includes("support@dezbatere.ro")).length).toBeGreaterThan(0);
    expect(read(code, "privacy-policy.md")).toContain("**privacy@dezbatere.ro**");
    expect(contract.slice(0, 25).join("\n")).not.toMatch(/2\.11/u);
    expect(policy.slice(0, 24).join("\n")).not.toMatch(/3\.10/u);
  });
});
