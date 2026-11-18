import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import {
  PRIVACY_313_ENTRY,
  PRIVACY_RELEASE_SWAPS,
  TERMS_218_ENTRY,
  TERMS_219_ENTRY,
  TERMS_RELEASE_SWAPS
} from "../support/legalRelease.js";

/**
 * Terms of Service 2.19 and Privacy Policy 3.13, effective 19 November 2026 (tests/support/legalRelease.ts). Every
 * language's drafts carry the new numbers and the new date in their own date words; English's change histories name
 * what changed since the archived 2.18 and 3.12, whose own entries read again as those texts wrote them; nobody has to
 * accept again; and the Terms versions page lists 2.18 as a past version.
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

describe("Terms 2.19 and Privacy Policy 3.13", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: both drafts name the new version and 19 November 2026 in their own words", (code) => {
    for (const [name, version] of [["privacy-policy.md", "3.13"], ["terms-of-service.md", "2.19"]] as const) {
      const lines = draft(code, name).split("\n");
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

  it("English carries the new numbers and the date", () => {
    for (const [name, swaps] of [["privacy-policy.md", PRIVACY_RELEASE_SWAPS], ["terms-of-service.md", TERMS_RELEASE_SWAPS]] as const) {
      const text = draft("en", name);
      for (const [before, after] of swaps) {
        expect(text.split(after), `${name}: ${after.slice(0, 50)}`).toHaveLength(2);
        expect(text, `${name}: ${before.slice(0, 50)}`).not.toContain(before);
      }
    }
  });

  it("the Terms' history opens with the 2.19 entry, and the 2.18 entry reads as the archived 2.18 wrote it", () => {
    const terms = draft("en", "terms-of-service.md");
    expect(terms).toContain(`Prior versions stay available at dezbatere.ro/terms/versions.\n\n${TERMS_219_ENTRY}\n\n${TERMS_218_ENTRY}\n\nVersion 2.17 replaced`);
    expect(entry(terms, "2.19", "2.18")).toBe(`${TERMS_219_ENTRY}\n\n`);
    expect(entry(terms, "2.18", "2.17")).toBe(entry(archivedEnglish("TERMS", "2.18").text, "2.18", "2.17"));
    expect(terms).not.toMatch(/Version 2\.18 also/u);
  });

  it("the Privacy Policy's history opens with the 3.13 entry, and the 3.12 entry reads as the archived 3.12 wrote it", () => {
    const privacy = draft("en", "privacy-policy.md");
    expect(privacy).toContain(`\nThis policy was last updated on 19 November 2026. ${PRIVACY_313_ENTRY} Version 3.12 replaced version 3.11:`);
    expect(entry(privacy, "3.12", "3.11")).toBe(entry(archivedEnglish("PRIVACY", "3.12").text, "3.12", "3.11"));
    expect(privacy).not.toMatch(/Version 3\.12 also (names DeepInfra|says how you can sign in)/u);
  });

  it("asks nobody to accept again: the re-acceptance floors stay where they were", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "2.1" });
  });

  it("lists 2.19 as the Terms in force and 2.18 as the archived English text", () => {
    expect(TERMS_VERSIONS[0]).toEqual({ version: "2.19", noteKey: "legal.versions.v2.note", current: true, href: "/terms" });
    expect(TERMS_VERSIONS[1]).toEqual({
      version: "2.18",
      noteKey: "legal.archive.meta",
      current: false,
      href: `/terms/versions/${archivedEnglish("TERMS", "2.18").sha256}`
    });
  });
});
