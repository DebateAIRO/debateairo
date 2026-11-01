import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * Terms 2.12 and Privacy 3.11, R22 decisions 35 and 36: the Report button, a report's six months, and the sealed originals' six months.
 * English is pinned word for word; every language must have the same rows at the same places, and the old "control" and the old "link" are gone from the live text.
 */
const read = (locale: string, name: string): string => readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, name), "utf8");
const privacy = (locale: string): string[] => read(locale, "privacy-policy.md").split("\n");
const terms = (locale: string): string[] => read(locale, "terms-of-service.md").split("\n");
const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

describe("the Report button and the six months in the legal texts", () => {
  it("English says it in the words drafted for the owner", () => {
    const body = read("en", "terms-of-service.md");
    expect(body).toContain("**Anyone can report content.** You do not need an account. Write to support@dezbatere.ro. If you are signed in, you can also use the **Report** button on any public debate. An AI reads a report made with the button beside the public text. If it agrees, the debate is hidden at once and a person reviews it. If it does not, you can report again with more details, and a person will read it. So that we can act, tell us:");
    expect(read("en", "privacy-policy.md")).toContain("Write to **privacy@dezbatere.ro**, or use the **Report** button on any public debate if you have an account. A public debate stays public, but if its text contains personal details about you or breaks our Terms, write to us, or use the Report button if you have an account: we can hide it");
    const decision36 = privacy("en").find((line) => line.startsWith("| The original of a corrected or removed passage |"));
    expect(cells(decision36!).join(" ").toLowerCase()).toContain("the original of a corrected or removed passage stays sealed, readable only by the two people who review, for 6 months then it is deleted.");
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
    expect(cells(policy[46]!), `${code}: section 2's new row`).toHaveLength(3);
    expect(policy[47]!.startsWith("| **"), `${code}: section 2 goes on after it`).toBe(true);
    for (const at of [156, 157, 158]) expect(cells(policy[at]!), `${code}: section 7 row at ${at}`).toHaveLength(3);
    expect(policy[156]!).not.toContain("Anthropic");
    expect(policy[157]!).not.toContain("Anthropic");
    expect(policy[158]!, `${code}: the new rows sit before the support chat's`).toContain("Anthropic");
    expect(cells(policy[157]!).join(" "), `${code}: decision 36's six months`).toContain("6");
    expect(policy[89]!, `${code}: section 4 points at section 5`).toMatch(/5/u);
    expect(policy[95]!, `${code}: section 5 names the model twice or more`).toMatch(/Claude Haiku 5\.5[^]*Claude Haiku 5\.5[^]*Claude Haiku 5\.5/u);
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
