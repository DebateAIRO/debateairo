import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { TERMS_219_ENTRY } from "../support/legalRelease.js";
import { TERMS_220_ENTRY, TERMS_220_SWAPS, terms219Sha256, withoutTerms220 } from "../support/legalTerms220.js";

/**
 * Terms of Service 2.20 (tests/support/legalTerms220.ts): section 11 no longer says that closing an account makes the
 * data "permanently unreadable" (the off-host backups do not expire, and the sensitive-data consent record goes with the
 * account), and section 9 says a deleted debate comes back only if the whole service is restored from a backup.
 * Every language is its 2.19 draft plus the recorded swaps and nothing else; English is pinned word for word.
 */

const root = process.cwd();
const draft = (code: string): string => readFileSync(resolve(root, "apps/ui/legal", code, "terms-of-service.md"), "utf8");
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));

const DELETED_DEBATE =
  "No person reads the debate first, and it cannot be restored, unless we restore the whole service from a backup that still holds it (Privacy Policy, section 7).";
const CLOSURE =
  "When an account is closed we destroy, on our server, the encryption keys for your account data and your private debates, which makes them unreadable there, delete your account record,";
const SURVIVES =
  "records we are required by law to keep, including acceptance and consent records, except the record of the consent you give before your first debate (section 7), which is deleted with your account; the encrypted copies on our separate backup storage, which are not deleted automatically, so your account and your private debates can be restored from them until those copies are removed;";

describe("Terms of Service 2.20: closure and backups, and a deleted debate", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its 2.19 text with only the recorded 2.20 changes", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v2.20 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v2\.20$/u);
    expect(lines[23]!.startsWith("**Version 2.20 · Effective "), `${code}: the version line`).toBe(true);
    expect(text, `${code}: no line names 2.19 as the current version`).not.toMatch(/ v2\.19( ·|$)|\*\*Version 2\.19 · /mu);
    expect(sha(withoutTerms220(code, text)), `${code}: undoing 2.20 gives back the 2.19 draft byte for byte`).toBe(terms219Sha256(code));
    expect(manifest().documents.TERMS![code], `${code}: the manifest`).toEqual({ version: "2.20", sha256: sha(text) });
    // The two body lines changed in every language; only en, ro and fr gain the history entry.
    const body = TERMS_220_SWAPS[code]!.swaps.filter(([, after]) => !after.includes("2.20"));
    expect(body.length, `${code}: sections 9 and 11 changed`).toBeGreaterThanOrEqual(2);
    expect(text.split("\n").some((line) => /\b2\.20\b/u.test(line) && !line.startsWith("eyebrow:") && !line.startsWith("endMarker:") && !line.startsWith("**Version")),
      `${code}: a history entry for 2.20`).toBe(["en", "ro", "fr"].includes(code));
  });

  it("English says it in the words of 2.20, and the history opens with the 2.20 entry", () => {
    const text = draft("en");
    for (const sentence of [DELETED_DEBATE, CLOSURE, SURVIVES]) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    expect(text).not.toContain("permanently unreadable");
    expect(text).toContain(`\n\n${TERMS_220_ENTRY}\n\n${TERMS_219_ENTRY}\n\n`);
  });

  it("lists 2.20 as the Terms in force and 2.19 as the archived English text", () => {
    const archived = Object.entries(manifest().archive.TERMS!.en!).filter(([, entry]) => entry.version === "2.19");
    expect(archived).toHaveLength(1);
    expect(TERMS_VERSIONS[0]).toEqual({ version: "2.20", noteKey: "legal.versions.v2.note", current: true, href: "/terms" });
    expect(TERMS_VERSIONS[1]).toEqual({ version: "2.19", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${archived[0]![0]}` });
  });

  it("the archive holds the English, Romanian and French 2.20 texts and their 2.19 texts, and asks nobody to accept again", () => {
    const archive = manifest().archive.TERMS!;
    for (const code of ["en", "ro", "fr"]) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "2.20");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      expect(archive[code]![terms219Sha256(code)]?.version, `${code}: the 2.19 text the swaps undo to`).toBe("2.19");
    }
    expect(Object.keys(TERMS_220_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "2.1" });
  });
});
