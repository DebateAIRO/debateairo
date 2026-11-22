import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { currentDocument, documentVersionAtLeast, reacceptanceFloor } from "@debateai/legal-manifest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { TERMS_VERSIONS } from "../../apps/ui/lib/legal/pages.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { RELEASE_LEGAL_LOCALES } from "../../apps/ui/scripts/generate-legal-data.mjs";
import { LEGAL_FILES as FILES, legalText, type LegalKind as ResetKind } from "../support/legalText.js";

/**
 * Launch starts both legal texts at 1.0 (owner's decision of 20 November 2026): every language's Terms of Service and
 * Privacy Policy say 1.0 in their eyebrow, end marker and version line and carry no change history; both
 * re-acceptance floors are 1.0, which every acceptance of a draft written before launch clears; the archive holds only
 * the 1.0 texts of the languages the release offers; /terms/versions lists 1.0 alone.
 */

const root = process.cwd();
const KINDS = ["PRIVACY", "TERMS"] as const;
const CODES = LOCALES.map(({ code }) => code).sort();
const draft = (kind: ResetKind, code: string): string => legalText(kind, code);
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const section14 = (text: string): string[] =>
  text.split(/^## 14\./mu)[1]!.split(/^## /mu)[0]!.trim().split("\n\n");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));

describe("launch starts the Terms of Service and the Privacy Policy at 1.0", () => {
  it.each(KINDS.flatMap((kind) => CODES.map((code) => [kind, code] as const)))("%s %s: the draft says 1.0, and the manifest holds it", (kind, code) => {
    const text = draft(kind, code);
    const lines = text.split("\n");
    expect(lines.find((line) => line.startsWith("eyebrow: ")), "the eyebrow").toMatch(/ · v1\.0 · /u);
    expect(lines.find((line) => line.startsWith("endMarker: ")), "the end marker").toMatch(/ · v1\.0$/u);
    expect(lines.find((line) => line.startsWith("**Version ")), "the version line").toMatch(/^\*\*Version 1\.0 · Effective /u);
    expect(text, "no line names a pre-launch number as current").not.toMatch(/ v(3\.1[0-9]|3\.[0-9]|2\.\d+|1\.[1-9])( ·|$)|\*\*Version (3|2)\.\d+ · |\*\*Version 1\.[1-9]/mu);
    expect(manifest().documents[kind]![code]).toEqual({ version: "1.0", sha256: sha(text) });
    expect(currentDocument(kind, code)).toEqual({ version: "1.0", sha256: sha(text) });
  });

  it.each(CODES.map((code) => [code]))("%s: neither text carries a change history", (code) => {
    // The Terms' section 14: its heading's three paragraphs on changes, the last pointing to the versions page.
    const terms = section14(draft("TERMS", code));
    expect(terms, "the Terms' section 14").toHaveLength(4);
    expect(terms[3], "the Terms point to their versions page").toContain("dezbatere.ro/terms/versions");
    // The Privacy Policy's section 14: the paragraph on changes, then the one "last updated" sentence and nothing after it.
    const privacy = section14(draft("PRIVACY", code));
    expect(privacy, "the Privacy Policy's section 14").toHaveLength(3);
    expect(privacy[1], "the paragraph on changes points to the versions page").toContain("dezbatere.ro/privacy/versions");
    expect(privacy[2], "the last-updated sentence names the year").toContain("2026");
    expect(privacy[2], "and no version").not.toMatch(/(?<![\d.])\d\.\d+(?![\d])/u);
    // One sentence that ends on its date (or the date's own closing words), not a history after it.
    expect(privacy[2]!.length, "one short sentence").toBeLessThan(120);
    expect(privacy[2], "it ends its sentence").toMatch(/[.。।]$/u);
  });

  it("the English pages say 1.0", () => {
    expect([TERMS_OF_SERVICE.version, PRIVACY_POLICY.version]).toEqual(["1.0", "1.0"]);
    expect(TERMS_OF_SERVICE.eyebrow).toBe("TERMS OF SERVICE · v1.0 · EFFECTIVE 22 NOVEMBER 2026");
    expect(PRIVACY_POLICY.eyebrow).toBe("PRIVACY POLICY · v1.0 · EFFECTIVE 22 NOVEMBER 2026");
    expect(TERMS_OF_SERVICE.endMarker).toBe("END OF TERMS · v1.0");
    expect(PRIVACY_POLICY.endMarker).toBe("END OF POLICY · GDPR (EU) 2016/679 · v1.0");
  });

  it("sets both re-acceptance floors at 1.0, which every pre-launch acceptance clears", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "1.0", TERMS: "1.0" });
    expect([reacceptanceFloor("TERMS"), reacceptanceFloor("PRIVACY")]).toEqual(["1.0", "1.0"]);
    for (const accepted of ["1.0", "1.1", "2.0", "2.19", "3.2", "3.16"]) {
      expect(documentVersionAtLeast(accepted, "1.0"), accepted).toBe(true);
    }
  });

  it("the archive holds exactly the 1.0 texts of the languages the release offers, and nothing else", () => {
    const { archive } = manifest();
    const files = readdirSync(resolve(root, "apps/ui/legal/archive"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(resolve(root).length + 1))
      .sort();
    const listed: string[] = [];
    for (const kind of KINDS) {
      expect(Object.keys(archive[kind]!).sort(), kind).toEqual([...RELEASE_LEGAL_LOCALES].sort());
      for (const code of RELEASE_LEGAL_LOCALES) {
        const text = draft(kind, code);
        expect(archive[kind]![code], `${kind} ${code}`).toEqual({
          [sha(text)]: { version: "1.0", path: `apps/ui/legal/archive/${code}/${sha(text)}.md` }
        });
        expect(readFileSync(resolve(root, "apps/ui/legal/archive", code, `${sha(text)}.md`), "utf8"), `${kind} ${code}`).toBe(text);
        listed.push(`apps/ui/legal/archive/${code}/${sha(text)}.md`);
      }
    }
    expect(files).toEqual(listed.sort());
  });

  it("records French and Romanian as translated from the 1.0 English texts", () => {
    const record = JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8")) as Record<string, Record<string, { version: string; sha256: string }>>;
    for (const kind of KINDS) {
      for (const code of ["fr", "ro"]) {
        expect(record[kind]![code], `${kind} ${code}`).toEqual({ version: "1.0", sha256: sha(draft(kind, "en")) });
      }
    }
  });

  it("lists the Terms' 1.0 alone, in force", () => {
    expect(TERMS_VERSIONS).toEqual([{ version: "1.0", noteKey: "legal.versions.v2.note", current: true, href: "/terms" }]);
  });
});
