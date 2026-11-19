import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, OFFERED_LOCALE_CODES } from "../../apps/ui/lib/i18n/locales.js";
import { RELEASE_LEGAL_LOCALES } from "../../apps/ui/scripts/generate-legal-data.mjs";
import { isLegalTextLocale, LEGAL_TEXT_LOCALE_CODES } from "../../apps/ui/lib/legal/legalTextLocales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { PRIVACY_313_ENTRY, PRIVACY_RELEASE_SWAPS } from "../support/legalRelease.js";
import {
  PRIVACY_314_ENTRY,
  PRIVACY_314_MARKETING_SWAPS,
  PRIVACY_314_RELEASE_SWAPS,
  withoutPrivacy314,
  withoutPrivacy314Number
} from "../support/legalPrivacy314.js";

/**
 * Terms of Service 1.0 and Privacy Policy 3.13, effective 19 November 2026. The Terms start again at 1.0 (owner's
 * decision of 19 November 2026): the pre-launch drafts numbered 2.0–2.19 were never offered to the public, so 1.0 is
 * the first published text, carries no change history, and the archive keeps no 2.x text. Every language's drafts
 * carry the numbers and the date in their own date words; the Privacy Policy's history names what changed since the
 * archived 3.12, whose own entry reads again as that text wrote it (tests/support/legalRelease.ts). Privacy 3.14
 * followed on the same day (tests/support/legalPrivacy314.ts); the 3.13 checks below read it with 3.14 undone.
 */

const root = process.cwd();
const draft = (code: string, name: string): string => readFileSync(resolve(root, "apps/ui/legal", code, name), "utf8");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));

/** The one archived English text of `version`. */
const archivedEnglish = (kind: "TERMS" | "PRIVACY", version: string): { sha256: string; text: string } => {
  const entries = Object.entries(manifest().archive[kind]!.en!).filter(([, entry]) => entry.version === version);
  expect(entries, `${kind} ${version}`).toHaveLength(1);
  const [sha256, entry] = entries[0]!;
  return { sha256, text: readFileSync(resolve(root, entry.path), "utf8") };
};

/** From the entry of `version` up to the entry of the version before it. */
const entry = (text: string, version: string, previous: string): string => {
  const start = text.indexOf(`Version ${version} replaced version ${previous}:`);
  expect(start, version).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf(`Version ${previous} replaced`, start));
};

describe("Terms 1.0 and Privacy Policy 3.13", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: both drafts name the new version and 19 November 2026 in their own words", (code) => {
    for (const [name, version] of [["privacy-policy.md", "3.13"], ["terms-of-service.md", "1.0"]] as const) {
      const text = draft(code, name);
      const lines = (name === "privacy-policy.md" ? withoutPrivacy314Number(text) : text).split("\n");
      const eyebrow = lines.find((line) => line.startsWith("eyebrow: "))!;
      const end = lines.find((line) => line.startsWith("endMarker: "))!;
      const versionLine = lines.find((line) => line.startsWith("**Version "))!;
      expect(eyebrow, `${code}/${name}: the eyebrow`).toContain(` v${version} · `);
      expect(end, `${code}/${name}: the end marker`).toMatch(new RegExp(` v${version.replace(".", "\\.")}$`, "u"));
      expect(versionLine.startsWith(`**Version ${version} · Effective `), `${code}/${name}: the version line`).toBe(true);
      const date = versionLine.slice(`**Version ${version} · Effective `.length).split(" · ")[0]!;
      for (const [label, text] of [["eyebrow", eyebrow.split(` v${version} · `)[1]!], ["version line", date]] as const) {
        expect(text, `${code}/${name}: the ${label}'s day`).toMatch(/(^|\D)19(\D|$)/u);
        expect(text, `${code}/${name}: the ${label}'s year`).toContain("2026");
      }
    }
  });

  it("English carries the Privacy Policy's new number and the date", () => {
    const text = withoutPrivacy314(draft("en", "privacy-policy.md"));
    for (const [before, after] of PRIVACY_RELEASE_SWAPS) {
      expect(text.split(after), `privacy-policy.md: ${after.slice(0, 50)}`).toHaveLength(2);
      expect(text, `privacy-policy.md: ${before.slice(0, 50)}`).not.toContain(before);
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the Terms carry no change history, and section 14 ends where the history began", (code) => {
    const terms = draft(code, "terms-of-service.md");
    expect(terms, code).not.toMatch(/(^|\D)2\.(1?\d)(\D|$)/u);
    const section14 = terms.split(/^## 14\./mu)[1]!.split(/^## 15\./mu)[0]!;
    // The heading line and the three paragraphs on changes; the last still points to dezbatere.ro/terms/versions.
    const parts = section14.trim().split("\n\n");
    expect(parts, code).toHaveLength(4);
    expect(parts[3], code).toContain("dezbatere.ro/terms/versions");
  });

  it("the Privacy Policy's history opens with the 3.13 entry, and the 3.12 entry reads as the archived 3.12 wrote it", () => {
    const privacy = withoutPrivacy314(draft("en", "privacy-policy.md"));
    expect(privacy).toContain(`\nThis policy was last updated on 19 November 2026. ${PRIVACY_313_ENTRY} Version 3.12 replaced version 3.11:`);
    expect(entry(privacy, "3.12", "3.11")).toBe(entry(archivedEnglish("PRIVACY", "3.12").text, "3.12", "3.11"));
    expect(privacy).not.toMatch(/Version 3\.12 also (names DeepInfra|says how you can sign in)/u);
  });

  it("sets the Terms floor at 1.0, the first published text, and keeps the Privacy Policy's at 3.2", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });

  it("lists 1.0 alone as the Terms, and the archive holds the English, Romanian and French 1.0 texts and no other", () => {
    expect(TERMS_VERSIONS).toEqual([{ version: "1.0", noteKey: "legal.versions.v2.note", current: true, href: "/terms" }]);
    const archive = manifest().archive.TERMS!;
    expect(Object.keys(archive).sort()).toEqual(["en", "fr", "ro"]);
    for (const code of ["en", "ro", "fr"]) {
      const entries = Object.values(archive[code]!);
      expect(entries.map((item) => item.version), code).toEqual(["1.0"]);
      expect(readFileSync(resolve(root, entries[0]!.path), "utf8"), code).toBe(draft(code, "terms-of-service.md"));
    }
  });

  it("checks and archives the legal texts of every interface language the site offers, and French for Canada", () => {
    // A person can only be shown and accept a legal text in an offered interface language, or in French when they pick
    // Canada at sign-up. Each of those must be in the release check, or a text nobody checked or archived could be accepted.
    for (const code of OFFERED_LOCALE_CODES) expect(RELEASE_LEGAL_LOCALES).toContain(code);
    expect(RELEASE_LEGAL_LOCALES).toContain("fr");
  });

  it("the site shows legal texts in exactly the languages the release checks and archives", () => {
    // LEGAL_TEXT_LOCALE_CODES is the site's copy (a page cannot load the release script): the offered interface
    // languages and the Canada rule's languages. An explicit /terms?lang= or /privacy?lang= counts only for these.
    expect([...LEGAL_TEXT_LOCALE_CODES].sort()).toEqual([...RELEASE_LEGAL_LOCALES].sort());
    for (const code of ["en", "en-GB", "en-US", "ro", "fr"]) expect(isLegalTextLocale(code), code).toBe(true);
    for (const value of ["de", "pl", "es", "zh", "RO", "fr-CA", "xx", "", null, undefined]) {
      expect(isLegalTextLocale(value), String(value)).toBe(false);
    }
  });
});

describe("Privacy Policy 3.14: the marketing promises leave", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft names 3.14 where it named 3.13, and nothing else in those lines changes", (code) => {
    const text = draft(code, "privacy-policy.md");
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v3.14 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v3\.14$/u);
    expect(lines[21]!.startsWith("**Version 3.14 · Effective "), `${code}: the version line`).toBe(true);
    expect(text, `${code}: no line names 3.13 as the current version`).not.toMatch(/ v3\.13( ·|$)|\*\*Version 3\.13 · /mu);
  });

  it("English is the archived 3.13 text with the number, the 3.14 entry and the four marketing promises changed, and nothing else", () => {
    const now = draft("en", "privacy-policy.md");
    for (const [before, after] of [...PRIVACY_314_RELEASE_SWAPS, ...PRIVACY_314_MARKETING_SWAPS]) {
      expect(now.split(after), after.slice(0, 50)).toHaveLength(2);
      expect(now, before.slice(0, 50)).not.toContain(before);
    }
    expect(withoutPrivacy314(now)).toBe(archivedEnglish("PRIVACY", "3.13").text);
    expect(now).toContain(`\nThis policy was last updated on 19 November 2026. ${PRIVACY_314_ENTRY} ${PRIVACY_313_ENTRY} Version 3.12 replaced`);
    expect(now).not.toMatch(/product news \|/u);
    expect(now).not.toMatch(/\bCASL\b/u);
  });

  it("the archive holds the English, Romanian and French 3.14 texts, and asks nobody to accept again", () => {
    const archive = manifest().archive.PRIVACY!;
    for (const code of ["en", "ro", "fr"]) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "3.14");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code, "privacy-policy.md"));
    }
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
