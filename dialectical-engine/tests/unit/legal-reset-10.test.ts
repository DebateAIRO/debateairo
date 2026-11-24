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
import { englishVersionAndDay, legalDayIso, legalDayText } from "../../apps/ui/scripts/legal-redate.mjs";
import { legalEffectiveDay, legalText, type LegalKind as ResetKind } from "../support/legalText.js";

/**
 * Launch started both legal texts at 1.0: the pre-launch drafts were never offered, so neither text carried a change
 * history and both re-acceptance floors are 1.0, which every acceptance of a draft written before launch clears. The
 * first change after launch is 1.1 (DeepInfra runs on its own servers every model a debate is given through it): every
 * language's Terms of Service and Privacy Policy say 1.1 in their eyebrow, end marker and version line, and the same
 * effective day (the number and the day change for all languages together, the day with legal-redate.mjs); the
 * languages the release offers carry one change summary, "Version
 * 1.1 replaced version 1.0", and the others none, since their text still follows an older English one; the floors stay
 * 1.0, so nobody who accepted 1.0 is asked again; the archive holds exactly the 1.0 and 1.1 texts of the languages the
 * release offers; /terms/versions lists 1.1, in force, and 1.0, linked to its archived English text.
 */

const root = process.cwd();
const KINDS = ["PRIVACY", "TERMS"] as const;
const CODES = LOCALES.map(({ code }) => code).sort();
const OFFERED: readonly string[] = RELEASE_LEGAL_LOCALES;
const draft = (kind: ResetKind, code: string): string => legalText(kind, code);
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const section14 = (text: string): string[] =>
  text.split(/^## 14\./mu)[1]!.split(/^## /mu)[0]!.trim().split("\n\n");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
/** The 1.0 texts the launch archived, by kind and language: their hashes, which a released text keeps for good. */
const LAUNCH: Readonly<Record<ResetKind, Readonly<Record<string, string>>>> = {
  PRIVACY: {
    en: "d02ca4bac99f4a3a84a0f6e00726717e67f9290f61739d15f4ebd2ef27137bcf",
    fr: "404cce26d246f87be9a1f567e6065771f636afe671e1b85a2da75ca6ff4ea9fd",
    ro: "4eb06805885d1e22aee7e26537c682d15eb3448c0c7a3781389a5aee44988497"
  },
  TERMS: {
    en: "737971b09f371ef4c0266610b58c563df067caf3a4ddf52ae55204aa689610d2",
    fr: "f0133b6afb710ddd0f7ef14f79c0f1a4315e4481d8c63ecc9394c03dcdb93120",
    ro: "f5f5e9aae947daa2d85b6908e4fc96fa769bd642b4d0c557d5db3f99e3da8109"
  }
};
/** Each offered language's change summary opens with these words: version 1.1 replaced version 1.0. */
const REPLACED: Readonly<Record<string, string>> = {
  en: "Version 1.1 replaced version 1.0: ",
  fr: "La version 1.1 a remplacé la version 1.0 : ",
  ro: "Versiunea 1.1 a înlocuit versiunea 1.0: "
};

describe("the Terms of Service and the Privacy Policy: 1.0 at launch, 1.1 now", () => {
  it.each(KINDS.flatMap((kind) => CODES.map((code) => [kind, code] as const)))("%s %s: the draft says 1.1, and the manifest holds it", (kind, code) => {
    const text = draft(kind, code);
    const lines = text.split("\n");
    expect(lines.find((line) => line.startsWith("eyebrow: ")), "the eyebrow").toMatch(/ · v1\.1 · /u);
    expect(lines.find((line) => line.startsWith("endMarker: ")), "the end marker").toMatch(/ · v1\.1$/u);
    expect(lines.find((line) => line.startsWith("**Version ")), "the version line").toMatch(/^\*\*Version 1\.1 · Effective /u);
    expect(text, "no line names a pre-launch number as current").not.toMatch(/ v(3\.1[0-9]|3\.[0-9]|2\.\d+|1\.[02-9])( ·|$)|\*\*Version (3|2)\.\d+ · |\*\*Version 1\.[02-9]/mu);
    expect(manifest().documents[kind]![code]).toEqual({ version: "1.1", sha256: sha(text) });
    expect(currentDocument(kind, code)).toEqual({ version: "1.1", sha256: sha(text) });
  });

  it.each(CODES.map((code) => [code]))("%s: one change summary in the languages the release offers, none in the others", (code) => {
    // The Terms' section 14: its three paragraphs on changes, the last pointing to the versions page, then the summary.
    const terms = section14(draft("TERMS", code));
    expect(terms[3], "the Terms point to their versions page").toContain("dezbatere.ro/terms/versions");
    // The Privacy Policy's section 14: the paragraph on changes, then the "last updated" paragraph.
    const privacy = section14(draft("PRIVACY", code));
    expect(privacy, "the Privacy Policy's section 14").toHaveLength(3);
    expect(privacy[1], "the paragraph on changes points to the versions page").toContain("dezbatere.ro/privacy/versions");
    expect(privacy[2], "the last-updated sentence names the year").toContain("2026");
    if (OFFERED.includes(code)) {
      expect(terms, "the Terms' section 14 and its summary").toHaveLength(5);
      expect(terms[4]!.startsWith(REPLACED[code]!), "the Terms' summary").toBe(true);
      expect(terms[4], "it names the section it changed").toMatch(/ 8 /u);
      // One sentence on the update, then the summary; no older history.
      expect(privacy[2]!.split(REPLACED[code]!), "the Privacy Policy's summary, once").toHaveLength(2);
      expect(privacy[2], "it names the sections it changed").toMatch(/ 5 .* 4 /u);
      expect(privacy[2], "and names no other version").not.toMatch(/(?<![\d.])(?!1\.[01](?!\d))\d\.\d+(?!\d)/u);
    } else {
      expect(terms, "the Terms' section 14").toHaveLength(4);
      expect(privacy[2], "and no version").not.toMatch(/(?<![\d.])\d\.\d+(?![\d])/u);
      expect(privacy[2]!.length, "one short sentence").toBeLessThan(120);
      expect(privacy[2], "it ends its sentence").toMatch(/[.。।]$/u);
    }
  });

  it("the English pages say 1.1, in force from the effective day", () => {
    expect([TERMS_OF_SERVICE.version, PRIVACY_POLICY.version]).toEqual(["1.1", "1.1"]);
    expect(TERMS_OF_SERVICE.eyebrow).toBe(`TERMS OF SERVICE · v1.1 · EFFECTIVE ${legalEffectiveDay().toUpperCase()}`);
    expect(PRIVACY_POLICY.eyebrow).toBe(`PRIVACY POLICY · v1.1 · EFFECTIVE ${legalEffectiveDay().toUpperCase()}`);
    expect(TERMS_OF_SERVICE.endMarker).toBe("END OF TERMS · v1.1");
    expect(PRIVACY_POLICY.endMarker).toBe("END OF POLICY · GDPR (EU) 2016/679 · v1.1");
  });

  it("every draft of both documents takes effect on the same day, in its own words, after 1.0's day", () => {
    const day = englishVersionAndDay(draft("PRIVACY", "en")).day;
    expect(legalDayText("en", day, "line")).toBe(legalEffectiveDay());
    // A later version takes effect after the day 1.0 did (read from its archived English text), never on it or before.
    const launched = englishVersionAndDay(readFileSync(resolve(root, "apps/ui/legal/archive/en", `${LAUNCH.PRIVACY.en}.md`), "utf8")).day;
    expect(legalDayIso(day) > legalDayIso(launched), `${legalDayIso(day)} after ${legalDayIso(launched)}`).toBe(true);
    for (const kind of KINDS) {
      for (const code of CODES) {
        const lines = draft(kind, code).split("\n");
        expect(lines.find((line) => line.startsWith("eyebrow: ")), `${kind} ${code}: the eyebrow`).toContain(legalDayText(code, day, "eyebrow"));
        expect(lines.find((line) => line.startsWith("**Version ")), `${kind} ${code}: the version line`)
          .toContain(`**Version 1.1 · Effective ${legalDayText(code, day, "line")} · `);
      }
    }
    // The offered languages' Privacy Policy says it was last updated that day.
    for (const code of OFFERED) expect(section14(draft("PRIVACY", code))[2], code).toContain(legalDayText(code, day, "line"));
  });

  it("keeps both re-acceptance floors at 1.0: an acceptance of 1.0, or of any pre-launch draft, owes nothing", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "1.0", TERMS: "1.0" });
    expect([reacceptanceFloor("TERMS"), reacceptanceFloor("PRIVACY")]).toEqual(["1.0", "1.0"]);
    for (const accepted of ["1.0", "1.1", "2.0", "2.19", "3.2", "3.16"]) {
      expect(documentVersionAtLeast(accepted, "1.0"), accepted).toBe(true);
    }
  });

  it("the archive holds exactly the 1.0 and 1.1 texts of the languages the release offers, and nothing else", () => {
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
        const launch = LAUNCH[kind][code]!;
        expect(archive[kind]![code], `${kind} ${code}`).toEqual({
          [launch]: { version: "1.0", path: `apps/ui/legal/archive/${code}/${launch}.md` },
          [sha(text)]: { version: "1.1", path: `apps/ui/legal/archive/${code}/${sha(text)}.md` }
        });
        expect(readFileSync(resolve(root, "apps/ui/legal/archive", code, `${sha(text)}.md`), "utf8"), `${kind} ${code}`).toBe(text);
        const released = readFileSync(resolve(root, "apps/ui/legal/archive", code, `${launch}.md`), "utf8");
        expect(sha(released), `${kind} ${code}: 1.0 byte for byte`).toBe(launch);
        expect(released, `${kind} ${code}: 1.0 says 1.0`).toMatch(/^\*\*Version 1\.0 · Effective /mu);
        listed.push(`apps/ui/legal/archive/${code}/${launch}.md`, `apps/ui/legal/archive/${code}/${sha(text)}.md`);
      }
    }
    expect(files).toEqual(listed.sort());
  });

  it("records French and Romanian as translated from the current English texts", () => {
    const record = JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8")) as Record<string, Record<string, { version: string; sha256: string }>>;
    for (const kind of KINDS) {
      for (const code of ["fr", "ro"]) {
        expect(record[kind]![code], `${kind} ${code}`).toEqual({ version: "1.1", sha256: sha(draft(kind, "en")) });
      }
    }
  });

  it("lists the Terms' 1.1, in force, and 1.0, linked to its archived English text", () => {
    expect(TERMS_VERSIONS).toEqual([
      { version: "1.1", noteKey: "legal.versions.v2.note", current: true, href: "/terms" },
      { version: "1.0", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${LAUNCH.TERMS.en}` }
    ]);
  });
});
