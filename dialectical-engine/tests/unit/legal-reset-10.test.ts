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
 * first change after launch was 1.1 of both documents (DeepInfra runs on its own servers every model a debate is given
 * through it), released with French and Romanian. The Privacy Policy is now at 1.2 (help getting back into an account),
 * written in English first: every language's Privacy Policy says 1.2 and its day in the eyebrow, end marker and version
 * line, while French and Romanian keep the body of the English 1.1 until they are translated. Each document's number
 * and day change for all its languages together, the day with legal-redate.mjs; a released version keeps its own day.
 * The English Privacy Policy carries both change summaries, French and Romanian the one of the English text they
 * follow, the Terms the 1.1 summary in the languages the release offers, and the other languages none; the floors stay
 * 1.0, so nobody who accepted 1.0 or 1.1 is asked again; the archive holds exactly the released 1.0 and 1.1 texts of
 * the languages the release offers, and the Privacy Policy's 1.2 once the release step archives it; /terms/versions
 * lists 1.1, in force, and 1.0, linked to its archived English text.
 */

const root = process.cwd();
const KINDS = ["PRIVACY", "TERMS"] as const;
const CODES = LOCALES.map(({ code }) => code).sort();
const OFFERED: readonly string[] = RELEASE_LEGAL_LOCALES;
/** Each document's current version. */
const CURRENT: Readonly<Record<ResetKind, string>> = { PRIVACY: "1.2", TERMS: "1.1" };
const draft = (kind: ResetKind, code: string): string => legalText(kind, code);
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const section14 = (text: string): string[] =>
  text.split(/^## 14\./mu)[1]!.split(/^## /mu)[0]!.trim().split("\n\n");
const manifest = (): {
  reacceptance: Record<string, string | null>;
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
const translations = (): Record<string, Record<string, { version: string; sha256: string }>> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8"));
/** The released texts the archive keeps, by kind, language and version: their hashes, which a released text keeps for good. */
const RELEASED: Readonly<Record<ResetKind, Readonly<Record<string, Readonly<Record<string, string>>>>>> = {
  PRIVACY: {
    en: { "1.0": "d02ca4bac99f4a3a84a0f6e00726717e67f9290f61739d15f4ebd2ef27137bcf", "1.1": "df5db9a4008f978be02b4245fad90e779178c8c2daf32136eb57ef5ccf287515" },
    fr: { "1.0": "404cce26d246f87be9a1f567e6065771f636afe671e1b85a2da75ca6ff4ea9fd", "1.1": "2c639718616db98b874948e323503ddb1f5ff23e2cd1edf12f22fe42b9f741a0" },
    ro: { "1.0": "4eb06805885d1e22aee7e26537c682d15eb3448c0c7a3781389a5aee44988497", "1.1": "e23b9600b4afff3ed81bba87c655cdcefd4f61f3f28bbbdd2a86d605e3ff6fe5" }
  },
  TERMS: {
    en: { "1.0": "737971b09f371ef4c0266610b58c563df067caf3a4ddf52ae55204aa689610d2", "1.1": "49412a20009903fb70679a9fe0451fa27dd92aa2643af4566cee6064575ee8c8" },
    fr: { "1.0": "f0133b6afb710ddd0f7ef14f79c0f1a4315e4481d8c63ecc9394c03dcdb93120", "1.1": "bba229d43d001cce40f2853f4cd13cafa59472f39756d741fb7f4b00b47aa0f3" },
    ro: { "1.0": "f5f5e9aae947daa2d85b6908e4fc96fa769bd642b4d0c557d5db3f99e3da8109", "1.1": "d76a33bb28fb28234e6ec172ce16b1c21bc10fe9033102ecd7aa1dd2eea19141" }
  }
};
const archivedEnglish = (kind: ResetKind, version: string): string =>
  readFileSync(resolve(root, "apps/ui/legal/archive/en", `${RELEASED[kind].en![version]}.md`), "utf8");
/** The English version an offered language's text follows: the current one for English, the recorded one otherwise. */
const follows = (kind: ResetKind, code: string): string => (code === "en" ? CURRENT[kind] : translations()[kind]![code]!.version);
/** How each change summary opens, by the version it introduced, in the languages that carry it. */
const REPLACED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "1.1": {
    en: "Version 1.1 replaced version 1.0: ",
    fr: "La version 1.1 a remplacé la version 1.0 : ",
    ro: "Versiunea 1.1 a înlocuit versiunea 1.0: "
  },
  "1.2": { en: "Version 1.2 replaced version 1.1: " }
};

describe("the Terms of Service and the Privacy Policy: 1.0 at launch, Terms 1.1 and Privacy Policy 1.2 now", () => {
  it.each(KINDS.flatMap((kind) => CODES.map((code) => [kind, code] as const)))("%s %s: the draft says its current version, and the manifest holds it", (kind, code) => {
    const text = draft(kind, code);
    const lines = text.split("\n");
    const version = CURRENT[kind].replace(".", "\\.");
    expect(lines.find((line) => line.startsWith("eyebrow: ")), "the eyebrow").toMatch(new RegExp(` · v${version} · `, "u"));
    expect(lines.find((line) => line.startsWith("endMarker: ")), "the end marker").toMatch(new RegExp(` · v${version}$`, "u"));
    expect(lines.find((line) => line.startsWith("**Version ")), "the version line").toMatch(new RegExp(`^\\*\\*Version ${version} · Effective `, "u"));
    expect(text, "no line names a pre-launch number as current").not.toMatch(/ v(3|2)\.\d+( ·|$)|\*\*Version (3|2)\.\d+ · /mu);
    expect(manifest().documents[kind]![code]).toEqual({ version: CURRENT[kind], sha256: sha(text) });
    expect(currentDocument(kind, code)).toEqual({ version: CURRENT[kind], sha256: sha(text) });
  });

  it.each(CODES.map((code) => [code]))("%s: the change summaries of the English text it follows in the languages the release offers, none in the others", (code) => {
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
      expect(terms[4]!.startsWith(REPLACED["1.1"]![code]!), "the Terms' summary").toBe(true);
      expect(terms[4], "it names the section it changed").toMatch(/ 8 /u);
      // One sentence on the update, then the summary of each version up to the one this text follows, newest first.
      const followed = follows("PRIVACY", code);
      const summaries = Object.keys(REPLACED).filter((version) => documentVersionAtLeast(followed, version)).reverse();
      expect(summaries.length, `${code} follows ${followed}`).toBeGreaterThan(0);
      let rest = privacy[2]!;
      for (const version of summaries) {
        expect(rest.split(REPLACED[version]![code]!), `the Privacy Policy's ${version} summary, once`).toHaveLength(2);
        rest = rest.slice(rest.indexOf(REPLACED[version]![code]!) + REPLACED[version]![code]!.length);
      }
      const eleven = privacy[2]!.slice(privacy[2]!.indexOf(REPLACED["1.1"]![code]!));
      expect(eleven, "1.1's summary names the sections it changed").toMatch(/ 5 .* 4 /u);
      if (summaries.includes("1.2")) {
        const twelve = privacy[2]!.slice(privacy[2]!.indexOf(REPLACED["1.2"]![code]!), privacy[2]!.indexOf(REPLACED["1.1"]![code]!));
        expect(twelve, "1.2's summary names the sections it changed").toContain("sections 2, 4 and 7");
      } else {
        expect(privacy[2], "a text that follows an older English one names no newer version").not.toMatch(/(?<![\d.])1\.2(?!\d)/u);
      }
      expect(privacy[2], "and names no other version").not.toMatch(/(?<![\d.])(?!1\.[012](?!\d))\d\.\d+(?!\d)/u);
    } else {
      expect(terms, "the Terms' section 14").toHaveLength(4);
      expect(privacy[2], "and no version").not.toMatch(/(?<![\d.])\d\.\d+(?![\d])/u);
      expect(privacy[2]!.length, "one short sentence").toBeLessThan(120);
      expect(privacy[2], "it ends its sentence").toMatch(/[.。।]$/u);
    }
  });

  it("the English pages say their current versions, each in force from its own effective day", () => {
    expect([TERMS_OF_SERVICE.version, PRIVACY_POLICY.version]).toEqual([CURRENT.TERMS, CURRENT.PRIVACY]);
    expect(TERMS_OF_SERVICE.eyebrow).toBe(`TERMS OF SERVICE · v1.1 · EFFECTIVE ${legalEffectiveDay("TERMS").toUpperCase()}`);
    expect(PRIVACY_POLICY.eyebrow).toBe(`PRIVACY POLICY · v1.2 · EFFECTIVE ${legalEffectiveDay("PRIVACY").toUpperCase()}`);
    expect(TERMS_OF_SERVICE.endMarker).toBe("END OF TERMS · v1.1");
    expect(PRIVACY_POLICY.endMarker).toBe("END OF POLICY · GDPR (EU) 2016/679 · v1.2");
  });

  it.each(KINDS.map((kind) => [kind]))("%s: every draft takes effect on the same day, in its own words, after each earlier version's day", (kind) => {
    const day = englishVersionAndDay(draft(kind, "en")).day;
    expect(legalDayText("en", day, "line")).toBe(legalEffectiveDay(kind));
    // A later version takes effect after the day each earlier one did (read from its archived English text), never on it or before.
    for (const version of Object.keys(RELEASED[kind].en!).filter((version) => version !== CURRENT[kind])) {
      const earlier = englishVersionAndDay(archivedEnglish(kind, version));
      expect(earlier.version).toBe(version);
      expect(legalDayIso(day) > legalDayIso(earlier.day), `${legalDayIso(day)} after ${version}'s ${legalDayIso(earlier.day)}`).toBe(true);
    }
    for (const code of CODES) {
      const lines = draft(kind, code).split("\n");
      expect(lines.find((line) => line.startsWith("eyebrow: ")), `${kind} ${code}: the eyebrow`).toContain(legalDayText(code, day, "eyebrow"));
      expect(lines.find((line) => line.startsWith("**Version ")), `${kind} ${code}: the version line`)
        .toContain(`**Version ${CURRENT[kind]} · Effective ${legalDayText(code, day, "line")} · `);
    }
    if (kind !== "PRIVACY") return;
    // The offered languages' Privacy Policy says it was last updated on the day of the English text it follows.
    for (const code of OFFERED) {
      const followed = follows(kind, code);
      const followedDay = followed === CURRENT[kind] ? day : englishVersionAndDay(archivedEnglish(kind, followed)).day;
      expect(section14(draft(kind, code))[2], code).toContain(legalDayText(code, followedDay, "line"));
    }
  });

  it("keeps both re-acceptance floors at 1.0: an acceptance of 1.0, 1.1, or of any pre-launch draft, owes nothing", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "1.0", TERMS: "1.0" });
    expect([reacceptanceFloor("TERMS"), reacceptanceFloor("PRIVACY")]).toEqual(["1.0", "1.0"]);
    for (const accepted of ["1.0", "1.1", "1.2", "2.0", "2.19", "3.2", "3.16"]) {
      expect(documentVersionAtLeast(accepted, "1.0"), accepted).toBe(true);
    }
  });

  it("the archive holds exactly the released 1.0 and 1.1 texts of the languages the release offers, and nothing else", () => {
    const { archive } = manifest();
    const files = readdirSync(resolve(root, "apps/ui/legal/archive"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(resolve(root).length + 1))
      .sort();
    const listed: string[] = [];
    for (const kind of KINDS) {
      expect(Object.keys(archive[kind]!).sort(), kind).toEqual([...RELEASE_LEGAL_LOCALES].sort());
      for (const code of RELEASE_LEGAL_LOCALES) {
        const released = RELEASED[kind][code]!;
        expect(archive[kind]![code], `${kind} ${code}`).toEqual(Object.fromEntries(Object.entries(released)
          .map(([version, hash]) => [hash, { version, path: `apps/ui/legal/archive/${code}/${hash}.md` }])));
        for (const [version, hash] of Object.entries(released)) {
          const text = readFileSync(resolve(root, "apps/ui/legal/archive", code, `${hash}.md`), "utf8");
          expect(sha(text), `${kind} ${code} ${version}: byte for byte`).toBe(hash);
          expect(text, `${kind} ${code}: ${version} says ${version}`).toMatch(new RegExp(`^\\*\\*Version ${version.replace(".", "\\.")} · Effective `, "mu"));
          listed.push(`apps/ui/legal/archive/${code}/${hash}.md`);
        }
        // A current version the release has not carried yet is archived by the release step, once its translations follow it.
        const current = sha(draft(kind, code));
        if (released[CURRENT[kind]] !== undefined) expect(current, `${kind} ${code}: the current text is the released one`).toBe(released[CURRENT[kind]]);
        else expect(Object.keys(archive[kind]![code]!), `${kind} ${code}: ${CURRENT[kind]} is not archived yet`).not.toContain(current);
      }
    }
    expect(files).toEqual(listed.sort());
  });

  it("records French and Romanian as translated from the English text each follows: the Terms' current one, the Privacy Policy's 1.1", () => {
    const record = translations();
    for (const code of ["fr", "ro"]) {
      expect(record.TERMS![code], `TERMS ${code}`).toEqual({ version: "1.1", sha256: sha(draft("TERMS", "en")) });
      expect(record.PRIVACY![code], `PRIVACY ${code}`).toEqual({ version: "1.1", sha256: RELEASED.PRIVACY.en!["1.1"] });
    }
  });

  it("lists the Terms' 1.1, in force, and 1.0, linked to its archived English text", () => {
    expect(TERMS_VERSIONS).toEqual([
      { version: "1.1", noteKey: "legal.versions.v2.note", current: true, href: "/terms" },
      { version: "1.0", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${RELEASED.TERMS.en!["1.0"]}` }
    ]);
  });
});
