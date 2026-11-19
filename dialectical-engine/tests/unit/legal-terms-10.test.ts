import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { firstTerms10Sha256, TERMS_10_SWAPS, withoutTerms10Corrections } from "../support/legalTerms10.js";

/**
 * Terms of Service 1.0 as corrected before launch (tests/support/legalTerms10.ts): section 11 no longer says that
 * closing an account makes the data "permanently unreadable" (the backups keep copies, and the sensitive-data consent
 * record goes with the account), and section 9 says a deleted debate comes back only if the whole service is restored
 * from a backup. Every language is its first 1.0 draft plus the recorded swaps and nothing else; English is pinned word
 * for word; the Terms still carry no change history.
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

describe("Terms of Service 1.0: closure and backups, and a deleted debate", () => {
  it.each(LOCALES.map(({ code }) => [code]))("%s: the draft is its first 1.0 text with only the recorded corrections", (code) => {
    const text = draft(code);
    const lines = text.split("\n");
    expect(lines[4], `${code}: the eyebrow`).toContain(" v1.0 · ");
    expect(lines[7], `${code}: the end marker`).toMatch(/ v1\.0$/u);
    expect(lines[23]!.startsWith("**Version 1.0 · Effective "), `${code}: the version line`).toBe(true);
    expect(sha(withoutTerms10Corrections(code, text)), `${code}: undoing the corrections gives back the first 1.0 draft byte for byte`)
      .toBe(firstTerms10Sha256(code));
    expect(manifest().documents.TERMS![code], `${code}: the manifest`).toEqual({ version: "1.0", sha256: sha(text) });
    // Sections 9 and 11 changed in every language, and no language gains a change history: section 14 is still its
    // heading and its three paragraphs on changes.
    expect(TERMS_10_SWAPS[code]!.swaps.length, `${code}: sections 9 and 11 changed`).toBeGreaterThanOrEqual(2);
    const section14 = text.split(/^## 14\./mu)[1]!.split(/^## 15\./mu)[0]!;
    expect(section14.trim().split("\n\n"), `${code}: section 14 has no history entry`).toHaveLength(4);
  });

  it("English says it in the words of the corrected 1.0 text", () => {
    const text = draft("en");
    for (const sentence of [DELETED_DEBATE, CLOSURE, SURVIVES]) expect(text.split(sentence), sentence.slice(0, 60)).toHaveLength(2);
    expect(text).not.toContain("permanently unreadable");
  });

  it("lists 1.0 alone as the Terms, the archive holds the corrected English, Romanian and French 1.0 texts, and nobody is asked to accept again", () => {
    expect(TERMS_VERSIONS).toEqual([{ version: "1.0", noteKey: "legal.versions.v2.note", current: true, href: "/terms" }]);
    const archive = manifest().archive.TERMS!;
    for (const code of ["en", "ro", "fr"]) {
      const current = Object.entries(archive[code]!).filter(([, entry]) => entry.version === "1.0");
      expect(current, code).toHaveLength(1);
      expect(readFileSync(resolve(root, current[0]![1].path), "utf8"), code).toBe(draft(code));
      expect(archive[code]![firstTerms10Sha256(code)], `${code}: the first 1.0 text is not archived`).toBeUndefined();
    }
    expect(Object.keys(TERMS_10_SWAPS).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(manifest().reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "1.0" });
  });
});
