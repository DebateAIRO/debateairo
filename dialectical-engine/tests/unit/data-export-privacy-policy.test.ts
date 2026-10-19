import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";

const root = process.cwd();
const suffixes = JSON.parse(
  readFileSync(join(root, "tests/fixtures/data-export/portability-suffix.json"), "utf8"),
) as Record<string, string>;
const locales = Object.keys(suffixes).sort();

function policy(locale: string): string {
  return readFileSync(join(root, "apps/ui/legal", locale, "privacy-policy.md"), "utf8");
}

function message(locale: string, catalog: string, key: string): string {
  const entries = JSON.parse(
    readFileSync(join(root, "apps/ui/messages", locale, `${catalog}.json`), "utf8"),
  ) as Record<string, string>;
  const value = entries[key];
  if (!value) throw new Error(`Missing ${catalog}.${key} in ${locale}`);
  return value;
}

function rightsRows(markdown: string): { access: string; portability: string } {
  const rows = markdown.split("\n").filter((line) => line.startsWith("| **"));
  const access = rows.find((line) => /Art\. 15\b/.test(line));
  const portability = rows.find((line) => /Art\. 20\b/.test(line));
  if (!access || !portability) throw new Error("Access or Portability row missing");
  return { access, portability };
}

function baseRows(locale: string): { access: string; portability: string } {
  const markdown = execFileSync(
    "git",
    ["show", `dedbb2d50:dialectical-engine/apps/ui/legal/${locale}/privacy-policy.md`],
    { encoding: "utf8", cwd: root },
  );
  return rightsRows(markdown);
}

describe("data export privacy policy", () => {
  it("names the displayed export button in both rights rows in every locale", () => {
    const mismatches: string[] = [];
    for (const locale of locales) {
      const label = message(locale, "settings", "settings.export.request");
      const { access, portability } = rightsRows(policy(locale));
      if (!access.includes(label)) mismatches.push(`${locale}:Access`);
      if (!portability.includes(label)) mismatches.push(`${locale}:Portability`);
    }
    expect(mismatches).toEqual([]);
  });

  it("quotes the displayed Settings to Privacy route in every locale", () => {
    const mismatches: string[] = [];
    for (const locale of locales) {
      const expected = [
        message(locale, "chrome", "chrome.settings"),
        message(locale, "consent", "consent.settings.title"),
      ];
      const routes = [...policy(locale).matchAll(/\*\*([^*\n]*[→←][^*\n]*)\*\*/g)];
      const labels = routes[0]?.[1]?.split(/[→←]/).map((part) => part.trim());
      if (routes.length !== 1 || labels?.length !== 2 || labels.some((part, i) => part !== expected[i])) {
        mismatches.push(locale);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("removes both Pending export promises in all 35 locales", () => {
    expect(locales).toHaveLength(35);
    for (const locale of locales) {
      const markdown = policy(locale);
      expect(markdown, locale).not.toContain("Pending: a JSON export");
      expect(markdown, locale).not.toContain("Pending: same export as Access");
    }
  });

  it("states the exact Access and Portability promises in English", () => {
    const { access, portability } = rightsRows(policy("en"));
    expect(access).toContain(
      "In Settings, choose Export data: we prepare a ZIP file of JSON files plus one page you can open in any browser, and email you a download link that works for 24 hours and only while you are signed in to your account.",
    );
    expect(portability).toContain(
      "Use Export data in Settings: the ZIP holds your data as machine-readable JSON files plus one readable page, sent as an emailed link that works for 24 hours and only while you are signed in.",
    );
  });

  it("replaces both rows with localized text in every non-English policy", () => {
    const englishAccess =
      "In Settings, choose Export data: we prepare a ZIP file of JSON files plus one page you can open in any browser, and email you a download link that works for 24 hours and only while you are signed in to your account.";
    const englishPortability =
      "Use Export data in Settings: the ZIP holds your data as machine-readable JSON files plus one readable page, sent as an emailed link that works for 24 hours and only while you are signed in.";
    for (const locale of locales.filter((value) => value !== "en")) {
      const markdown = policy(locale);
      const current = rightsRows(markdown);
      const original = baseRows(locale);
      expect(markdown, locale).not.toContain(englishAccess);
      expect(markdown, locale).not.toContain(englishPortability);
      expect(current.access, locale).not.toContain("[Pending");
      expect(current.portability, locale).not.toContain("[Pending");
      expect(current.access, locale).not.toBe(original.access);
      expect(current.portability, locale).not.toBe(original.portability);
    }
  });

  it("preserves each locale's original Portability tail", () => {
    for (const locale of locales) {
      expect(rightsRows(policy(locale)).portability.endsWith(suffixes[locale]!), locale).toBe(true);
    }
  });

  // SPEC-v6 R40 (V-6, no bump) kept the base's version; synthesis-flag S03 raises it to 3.5 (the base, ae95dc8d0, has 3.4).
  // No one re-accepts it (synthesis-flag S03-R5, V-24/V-70), so the reacceptance floor stays "3.2".
  it("pins the current Privacy version (3.5, raised from the base's 3.4) and the reacceptance floor (3.2)", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "packages/legal-manifest/src/manifest.json"), "utf8"),
    ) as { reacceptance: { PRIVACY: string } };
    expect(PRIVACY_POLICY.version).toBe("3.5");
    expect(manifest.reacceptance.PRIVACY).toBe("3.2");
  });
});
