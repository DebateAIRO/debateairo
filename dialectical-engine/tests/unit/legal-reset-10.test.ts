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
 * first change after launch is 1.1 of both (DeepInfra runs on its own servers every model a debate is given through
 * it); the second is the Privacy Policy's 1.2 (what the publication check receives, and the four decisions the site's
 * checks take with no person involved), and the Terms stay at 1.1. Every language's draft of a document says that
 * document's current version in its eyebrow, end marker and version line, and that document's effective day (the
 * number and the day change for all languages together, the day with legal-redate.mjs). Since 24 November 2026 the
 * release offers all 35 catalogue languages, each recorded as following the current English text, and each carries the
 * change summaries in its own words, newest first ("Version 1.2 replaced version 1.1", then "Version 1.1 replaced
 * version 1.0" in the Privacy Policy, "Version 1.1 replaced version 1.0" in the Terms; English, French and Romanian
 * word for word as pinned below); the floors stay 1.0, so nobody who accepted 1.0 is asked again; the archive holds
 * exactly the released texts (1.0 of English, French and Romanian only, since the other 32 languages were first
 * released at 1.1; the Privacy Policy 1.1 of all 35) and the current ones of all 35; /terms/versions lists 1.1, in
 * force, and 1.0, linked to its archived English text.
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
/** The 1.0 texts the launch archived, by kind and language: their hashes, which a released text keeps for good. Only
 * English, French and Romanian were released at 1.0. */
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
/** Each document's current version. */
const CURRENT: Readonly<Record<ResetKind, string>> = { PRIVACY: "1.2", TERMS: "1.1" };
/** The Privacy Policy 1.1 texts the site released, by language: their hashes, which a released text keeps for good. */
const PRIVACY_1_1: Readonly<Record<string, string>> = {
  ar: "a1336dd4b004a5704f8b1e93499a3773f66bc3fdba03274cb885fbb880effe74",
  bg: "97aa03a78ef9135f79359699cddb71c080051610aa687a7f6f43d5f27bf36dad",
  cs: "3845c353275be71b983efbef9698784ff9fd4774048e5e4fee71c3f3bb1e56cc",
  da: "1f41c282f6f38158860c666f07b2ef66aaac182ac36334f4262cf39fd5c0b22b",
  de: "13ff7b0d6bbc8c6b345604c4c31a6ac7018f75b2a117a6dbfd4ba533296de78e",
  el: "eae45bd764fdd68236d68180c8e42c8a25716fc15416caa98f6b4a3153f56287",
  en: "df5db9a4008f978be02b4245fad90e779178c8c2daf32136eb57ef5ccf287515",
  es: "4c5ff1fa6f21ee0dcd2ed8af4f8458ef34e8a0c150427e040c5fc7e1bc397fbd",
  et: "858143c6b7073b5b1d24a87d8596088de70a28dfac61c79d9a36624b6cc8d5cf",
  fi: "61be4887b2c47f2b4cc71e76cb7f1474e75fbb95ec9ecf4190bb0b35f26a6631",
  fr: "2c639718616db98b874948e323503ddb1f5ff23e2cd1edf12f22fe42b9f741a0",
  ga: "c9cd3a9d33b69dab85ce3e47b98f0f741fefcf7b26695999efb5f0fbd7bb54ba",
  he: "f60939ac15909ad97baa542f35f6f3d412e140ef0852591fbade7b63e30fab37",
  hi: "46ff8446dc882a0bbd879b91ae11d9e702bedcd11ef91e0552256098bf82381c",
  hr: "c4310db19b07101ae486db8f32b27c99146b204feb73b07155c4ddeef873848e",
  hu: "0671cb2199fec9a62b2080580db708197f877cf246e0b4f22b7ad171540d3d93",
  id: "0c287649f41f387aedd10e20779fa2f885ea5b23c501e772fd8df3a572e9b67b",
  it: "4e4bcc1d310774bd9469c14dac1e51f65cbf50d07508eb407a03f5c677ddb29b",
  ja: "d8e4e97af65815662b10433513c5b61ac965380c2621d9804922ae845e013c16",
  ko: "0586afcf28fd94a158c84874fa300cd3c238985b0b5ff151967b4a0412689f7c",
  lt: "3e3ffa6d9bfe39049ed909a21d1017cd2225c3c86c95b27338a1104b15c7e558",
  lv: "65f413df27cda2bc13a3ed6afdb8eb29983619da4c24f00462fcf1ee6d7d0e51",
  mt: "588a94e273b393698b747a886661cc6742a4c3660e25a01c925b91ad6c0eebb0",
  nl: "e2f3ac64624d0feba193add40b92ab21c68c160aca698803c91a0bf86c7d6c8e",
  pl: "25da988e5d94d621a431cf2449fdd25805274a0e11428fc33269ce2a26b9693d",
  pt: "7d9b57dc048761fb02383f609cfcf83d2a25f25c17e2c7a83a67de3d6216a9c1",
  ro: "e23b9600b4afff3ed81bba87c655cdcefd4f61f3f28bbbdd2a86d605e3ff6fe5",
  ru: "2fedfc3c250694bd5ab123fdd4694944e9ad2c0579425b43e45f1173de1255f3",
  sk: "bb44a24f0e657d9853a90d06136e1609f6c907343b562b5ff46a67a23cd85e08",
  sl: "8544532051e31852ea2a8c5cbecc416828e02aa4ade33bcc89ec13425e9ead11",
  sv: "c3de77e801e56d440d7e77c3030e538402bc3f1706538097be1613dde1819efb",
  tr: "62087afdeb0955ca023c23e27cda7280140757fd5cd0db949e5e700d6cd1f9d6",
  uk: "09c0022313a23c43ddd6c3c0a5c6880a6ac1efc280914284b7a3e518d5fcbae9",
  vi: "823434a8cfe3807e2e70725f9bab388fe79e004f6a0ee99e2a14fd455ee06c06",
  zh: "7f98315e0d062e40b987a41ab44f8cb782b87a43a16ceb7aae213de809402e50"
};
/** Whether both of a language's texts are recorded as translated from the current English text (apps/ui/legal/translated-from.json). */
const TRANSLATED_FROM = JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8")) as Record<ResetKind, Record<string, { sha256: string }>>;
const FOLLOWS_ENGLISH = (code: string): boolean => KINDS.every((kind) => TRANSLATED_FROM[kind][code]?.sha256 === sha(draft(kind, "en")));
/** The launch languages' Privacy Policy 1.2 summary opens with these words. */
const REPLACED_1_1: Readonly<Record<string, string>> = {
  en: "Version 1.2 replaced version 1.1: ",
  fr: "La version 1.2 a remplacé la version 1.1 : ",
  ro: "Versiunea 1.2 a înlocuit versiunea 1.1: "
};
/** The launch languages' change summary of 1.1 opens with these words: version 1.1 replaced version 1.0. */
const REPLACED: Readonly<Record<string, string>> = {
  en: "Version 1.1 replaced version 1.0: ",
  fr: "La version 1.1 a remplacé la version 1.0 : ",
  ro: "Versiunea 1.1 a înlocuit versiunea 1.0: "
};

describe("the Terms of Service and the Privacy Policy: 1.0 at launch, Terms 1.1 and Privacy Policy 1.2 now", () => {
  it.each(KINDS.flatMap((kind) => CODES.map((code) => [kind, code] as const)))("%s %s: the draft says its current version, and the manifest holds it", (kind, code) => {
    const text = draft(kind, code);
    const lines = text.split("\n");
    const version = CURRENT[kind];
    expect(lines.find((line) => line.startsWith("eyebrow: ")), "the eyebrow").toContain(` · v${version} · `);
    expect(lines.find((line) => line.startsWith("endMarker: ")), "the end marker").toMatch(new RegExp(` · v${version.replace(".", "\\.")}$`, "u"));
    expect(lines.find((line) => line.startsWith("**Version ")), "the version line").toMatch(new RegExp(`^\\*\\*Version ${version.replace(".", "\\.")} · Effective `, "u"));
    expect([...text.matchAll(/ v(\d+\.\d+)(?: ·|$)|^\*\*Version (\d+\.\d+) · /gmu)].map((match) => match[1] ?? match[2]), "no line names another number as current")
      .toEqual([version, version, version]);
    expect(manifest().documents[kind]![code]).toEqual({ version, sha256: sha(text) });
    expect(currentDocument(kind, code)).toEqual({ version, sha256: sha(text) });
  });

  it("the release offers every catalogue language, and every translation follows the current English text", () => {
    expect([...OFFERED].sort()).toEqual(CODES);
    expect(Object.keys(REPLACED).sort()).toEqual(Object.keys(LAUNCH.TERMS).sort());
    // English is the text every other follows; it is not recorded as a translation.
    for (const code of CODES.filter((code) => code !== "en")) expect(FOLLOWS_ENGLISH(code), code).toBe(true);
  });

  it.each(CODES.map((code) => [code]))("%s: the change summaries, in its own words, word for word in the launch languages", (code) => {
    // The Terms' section 14: its three paragraphs on changes, the last pointing to the versions page, then the summary.
    const terms = section14(draft("TERMS", code));
    expect(terms[3], "the Terms point to their versions page").toContain("dezbatere.ro/terms/versions");
    // The Privacy Policy's section 14: the paragraph on changes, then the "last updated" paragraph.
    const privacy = section14(draft("PRIVACY", code));
    expect(privacy, "the Privacy Policy's section 14").toHaveLength(3);
    expect(privacy[1], "the paragraph on changes points to the versions page").toContain("dezbatere.ro/privacy/versions");
    expect(privacy[2], "the last-updated sentence names the year").toContain("2026");
    // Every language is offered and follows the current English text: the same summaries, in its own words.
    expect(OFFERED, "the release offers it").toContain(code);
    if (code !== "en") expect(FOLLOWS_ENGLISH(code), "it follows the current English text").toBe(true);
    expect(terms, "the Terms' section 14 and its summary").toHaveLength(5);
    // The Terms' one summary names 1.1 and 1.0 once each; no older history.
    const termsSummary = terms[4]!;
    expect(termsSummary.match(/(?<![\d.])1\.1(?!\d)/gu), "the Terms name 1.1 once").toHaveLength(1);
    expect(termsSummary.match(/(?<![\d.])1\.0(?!\d)/gu), "the Terms name 1.0 once").toHaveLength(1);
    expect(termsSummary, "and no other version").not.toMatch(/(?<![\d.])(?!1\.[01](?!\d))\d\.\d+(?!\d)/u);
    expect(termsSummary, "the Terms name the company the change is about").toContain("DeepInfra");
    // The Privacy Policy's two summaries, 1.2's then 1.1's: 1.2 once, 1.1 twice, 1.0 once; the model's name aside, no other number.
    expect(privacy[2], "1.2's names the model that checks the public text").toContain("Claude Haiku 5.5");
    const privacySummary = privacy[2]!.replaceAll("Claude Haiku 5.5", "");
    expect(privacySummary.match(/(?<![\d.])1\.2(?!\d)/gu), "the Privacy Policy names 1.2 once").toHaveLength(1);
    expect(privacySummary.match(/(?<![\d.])1\.1(?!\d)/gu), "the Privacy Policy names 1.1 twice").toHaveLength(2);
    expect(privacySummary.match(/(?<![\d.])1\.0(?!\d)/gu), "the Privacy Policy names 1.0 once").toHaveLength(1);
    expect(privacySummary, "and no other version").not.toMatch(/(?<![\d.])(?!1\.[012](?!\d))\d\.\d+(?!\d)/u);
    expect(privacySummary, "1.1's names the company the change is about").toContain("DeepInfra");
    // A section number, standing alone or as an ordinal ("8." in Croatian, Hungarian, Latvian, Turkish), never part of a version or a date.
    expect(terms[4], "it names the section it changed").toMatch(/(?<![\d.])8(?!\d|\.\d)/u);
    expect(privacy[2], "it names the sections it changed").toMatch(/(?<![\d.])5(?!\d|\.\d).*(?<![\d.])4(?!\d|\.\d)/u);
    if (code in REPLACED) {
      // The launch languages' wording, word for word.
      expect(terms[4]!.startsWith(REPLACED[code]!), "the Terms' summary").toBe(true);
      expect(terms[4], "it names the section it changed").toMatch(/ 8 /u);
      // One sentence on the update, then the summaries, newest first; no history before 1.0.
      const last = privacy[2]!;
      expect(last.split(REPLACED_1_1[code]!), "the Privacy Policy's 1.2 summary, once").toHaveLength(2);
      expect(last.split(REPLACED[code]!), "the Privacy Policy's 1.1 summary, once").toHaveLength(2);
      expect(last.indexOf(REPLACED_1_1[code]!), "newest first").toBeLessThan(last.indexOf(REPLACED[code]!));
      expect(last.slice(last.indexOf(REPLACED_1_1[code]!), last.indexOf(REPLACED[code]!)), "1.2's names the parts it changed").toMatch(/ 5 .* 8 .* B\.4 .* B\.6 /u);
      expect(last.slice(last.indexOf(REPLACED[code]!)), "1.1's names the sections it changed").toMatch(/ 5 .* 4 /u);
    }
  });

  it("the English pages say their current version, in force from its effective day", () => {
    expect([TERMS_OF_SERVICE.version, PRIVACY_POLICY.version]).toEqual(["1.1", "1.2"]);
    expect(TERMS_OF_SERVICE.eyebrow).toBe(`TERMS OF SERVICE · v1.1 · EFFECTIVE ${legalEffectiveDay("TERMS").toUpperCase()}`);
    expect(PRIVACY_POLICY.eyebrow).toBe(`PRIVACY POLICY · v1.2 · EFFECTIVE ${legalEffectiveDay("PRIVACY").toUpperCase()}`);
    expect(TERMS_OF_SERVICE.endMarker).toBe("END OF TERMS · v1.1");
    expect(PRIVACY_POLICY.endMarker).toBe("END OF POLICY · GDPR (EU) 2016/679 · v1.2");
  });

  it.each(KINDS)("every draft of the %s takes effect on one day, in its own words, after its previous version's day", (kind) => {
    const day = englishVersionAndDay(draft(kind, "en")).day;
    expect(legalDayText("en", day, "line")).toBe(legalEffectiveDay(kind));
    // A later version takes effect after the day each earlier one did (read from its archived English text), never on it or before.
    const earlier = Object.values(manifest().archive[kind]!.en!).filter((entry) => entry.version !== CURRENT[kind]);
    expect(earlier.length, "an earlier version is archived").toBeGreaterThan(0);
    for (const entry of earlier) {
      const before = englishVersionAndDay(readFileSync(resolve(root, entry.path), "utf8")).day;
      expect(legalDayIso(day) > legalDayIso(before), `${legalDayIso(day)} after ${entry.version}'s ${legalDayIso(before)}`).toBe(true);
    }
    for (const code of CODES) {
      const lines = draft(kind, code).split("\n");
      expect(lines.find((line) => line.startsWith("eyebrow: ")), `${kind} ${code}: the eyebrow`).toContain(legalDayText(code, day, "eyebrow"));
      expect(lines.find((line) => line.startsWith("**Version ")), `${kind} ${code}: the version line`)
        .toContain(`**Version ${CURRENT[kind]} · Effective ${legalDayText(code, day, "line")} · `);
    }
    // Every language's Privacy Policy (all are offered) says it was last updated that day.
    expect([...OFFERED].sort()).toEqual(CODES);
    for (const code of OFFERED) expect(section14(draft("PRIVACY", code))[2], code).toContain(legalDayText(code, day, "line"));
  });

  it("keeps both re-acceptance floors at 1.0: an acceptance of 1.0, or of any pre-launch draft, owes nothing", () => {
    expect(manifest().reacceptance).toEqual({ PRIVACY: "1.0", TERMS: "1.0" });
    expect([reacceptanceFloor("TERMS"), reacceptanceFloor("PRIVACY")]).toEqual(["1.0", "1.0"]);
    for (const accepted of ["1.0", "1.1", "2.0", "2.19", "3.2", "3.16"]) {
      expect(documentVersionAtLeast(accepted, "1.0"), accepted).toBe(true);
    }
  });

  it("the archive holds exactly the released texts and the current ones of all 35 languages, and nothing else", () => {
    const { archive } = manifest();
    const files = readdirSync(resolve(root, "apps/ui/legal/archive"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(resolve(root).length + 1))
      .sort();
    const listed: string[] = [];
    for (const kind of KINDS) {
      expect(Object.keys(archive[kind]!).sort(), kind).toEqual([...RELEASE_LEGAL_LOCALES].sort());
      expect(Object.keys(archive[kind]!).sort(), kind).toEqual(CODES);
      expect(Object.keys(LAUNCH[kind]).sort(), kind).toEqual(["en", "fr", "ro"]);
      for (const code of CODES) {
        const text = draft(kind, code);
        const launch = LAUNCH[kind][code];
        const released = kind === "PRIVACY" ? { [PRIVACY_1_1[code]!]: { version: "1.1", path: `apps/ui/legal/archive/${code}/${PRIVACY_1_1[code]!}.md` } } : {};
        const current = { [sha(text)]: { version: CURRENT[kind], path: `apps/ui/legal/archive/${code}/${sha(text)}.md` } };
        expect(archive[kind]![code], `${kind} ${code}`).toEqual({
          ...(launch === undefined ? {} : { [launch]: { version: "1.0", path: `apps/ui/legal/archive/${code}/${launch}.md` } }),
          ...released,
          ...current
        });
        for (const path of Object.keys(released)) {
          const oneOne = readFileSync(resolve(root, "apps/ui/legal/archive", code, `${path}.md`), "utf8");
          expect(sha(oneOne), `${kind} ${code}: 1.1 byte for byte`).toBe(path);
          expect(oneOne, `${kind} ${code}: 1.1 says 1.1`).toMatch(/^\*\*Version 1\.1 · Effective /mu);
          listed.push(`apps/ui/legal/archive/${code}/${path}.md`);
        }
        expect(readFileSync(resolve(root, "apps/ui/legal/archive", code, `${sha(text)}.md`), "utf8"), `${kind} ${code}`).toBe(text);
        listed.push(`apps/ui/legal/archive/${code}/${sha(text)}.md`);
        if (launch === undefined) continue;
        const oneZero = readFileSync(resolve(root, "apps/ui/legal/archive", code, `${launch}.md`), "utf8");
        expect(sha(oneZero), `${kind} ${code}: 1.0 byte for byte`).toBe(launch);
        expect(oneZero, `${kind} ${code}: 1.0 says 1.0`).toMatch(/^\*\*Version 1\.0 · Effective /mu);
        listed.push(`apps/ui/legal/archive/${code}/${launch}.md`);
      }
    }
    // Both documents' current texts in 35 languages and 1.0 in three; the Privacy Policy's released 1.1 in 35.
    expect(listed).toHaveLength(2 * (CODES.length + 3) + CODES.length);
    expect(files).toEqual(listed.sort());
  });

  it("records every translation, all 34 languages besides English, as translated from the current English texts", () => {
    const record = JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8")) as Record<string, Record<string, { version: string; sha256: string }>>;
    const translated = CODES.filter((code) => code !== "en");
    expect(translated).toHaveLength(34);
    for (const kind of KINDS) {
      expect(Object.keys(record[kind]!).sort(), kind).toEqual(translated);
      for (const code of translated) {
        expect(record[kind]![code], `${kind} ${code}`).toEqual({ version: CURRENT[kind], sha256: sha(draft(kind, "en")) });
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
