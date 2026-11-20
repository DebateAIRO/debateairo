import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { currentDocument, parseLegalManifest } from "@debateai/legal-manifest";
import {
  buildLegalDocument,
  buildLegalManifest,
  LEGAL_MANIFEST_OUTPUT,
  LEGAL_TRANSLATIONS_PATH,
  legalArchivePath,
  legalTranslationFollows,
  parseLegalTranslations,
  recordLegalTranslation,
  RELEASE_LEGAL_LOCALES,
  renderLegalManifest,
  type LegalArchiveIndex,
  type LegalManifest,
  type LegalTranslations
} from "../../apps/ui/scripts/generate-legal-data.mjs";
import { legalReleaseProblems } from "../../apps/ui/scripts/legal-release-check.mjs";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { PRIVACY_315_SWAPS } from "../support/legalPrivacy315.js";
import { PRIVACY_316_SWAPS } from "../support/legalPrivacy316.js";
import { TERMS_11_SWAPS } from "../support/legalTerms11.js";

/**
 * English first: a change to the legal wording is made in English only while work goes on. The languages a release
 * offers (RELEASE_LEGAL_LOCALES) and their archive copies are brought up to date once, before the release, and the
 * release check refuses a release until they are. These cases pin both halves: an English-only edit builds, parses and
 * archives nothing; the release check names every offered language that lags the English text and every current text
 * of those languages the archive does not hold yet.
 */

type Kind = "TERMS" | "PRIVACY";
const DRAFTS = { TERMS: "terms-of-service.md", PRIVACY: "privacy-policy.md" } as const;
const KEYS = { TERMS: "terms", PRIVACY: "privacy" } as const;
const CODES = LOCALES.map(({ code }) => code).sort();
const TRANSLATED = CODES.filter((code) => code !== "en");
const repoDraft = (locale: string, kind: Kind): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, DRAFTS[kind]), "utf8");
const committedArchive = (): LegalArchiveIndex =>
  (JSON.parse(readFileSync(resolve(process.cwd(), LEGAL_MANIFEST_OUTPUT), "utf8")) as { archive: LegalArchiveIndex }).archive;
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * The repository's drafts, as the release check's cases below read them. They need every translation to have the
 * English structure. The Privacy Policy's section 4 row gained in 3.15 a second legal basis, for taking payment (one
 * more "Art. " reference, which the locale check counts), that the translations which lag do not have yet: that row
 * reads as 3.14 wrote its last cell in English and in each translation that follows it
 * (tests/support/legalPrivacy315.ts). Privacy 3.16 and Terms 1.1 added paragraphs the lagging translations do not have
 * either (the one on Amazon in each document, and the Terms' first history entry, which left again when launch
 * renumbered both texts 1.0, tests/support/legalReset10.ts): English and each translation that follows it read without
 * them (tests/support/legalPrivacy316.ts, legalTerms11.ts).
 */
const TRANSLATIONS_RECORD = parseLegalTranslations(JSON.parse(readFileSync(resolve(process.cwd(), LEGAL_TRANSLATIONS_PATH), "utf8")));
const ADDED_PARAGRAPHS = { PRIVACY: [PRIVACY_316_SWAPS, 1], TERMS: [TERMS_11_SWAPS, 1] } as const;
const releaseDraft = (locale: string, kind: Kind): string => {
  if (locale !== "en" && !legalTranslationFollows(TRANSLATIONS_RECORD, kind, locale, sha(repoDraft("en", kind)))) return repoDraft(locale, kind);
  const [swaps, count] = ADDED_PARAGRAPHS[kind];
  // The Terms' 1.1 history entry is one of 1.1's added paragraphs, but the 1.0 text no longer carries it.
  const added = swaps[locale]!.swaps.filter(([before, after]) => before === "" && after.startsWith("\n") && !/^\n[^\n]*1\.1[^\n]*1\.0/u.test(after));
  expect(added, `${locale}: the paragraphs ${kind} gained`).toHaveLength(count);
  const text = added.reduce((current, [, after]) => {
    expect(current.split(after), `${locale}: ${after.slice(0, 40)}, once`).toHaveLength(2);
    return current.replace(after, () => "");
  }, repoDraft(locale, kind));
  if (kind !== "PRIVACY") return text;
  const basis = PRIVACY_315_SWAPS[locale]!.swaps.filter(([, after]) => after.includes("Art. 6(1)(b)"));
  expect(basis, `${locale}: the 3.15 legal basis for taking payment`).toHaveLength(1);
  const [before, after] = basis[0]!;
  expect(text.split(after), `${locale}: the 3.15 basis, once`).toHaveLength(2);
  return text.replace(after, () => before);
};

/** An English-only edit that also changes the structure: one new paragraph at the end of section 6. */
const NEW_PARAGRAPH = "A paragraph that exists only in English so far.";
const editedEnglish = (): string => {
  const english = repoDraft("en", "PRIVACY");
  expect(english.split("\n## 7. ")).toHaveLength(2);
  return english.replace("\n## 7. ", `\n${NEW_PARAGRAPH}\n\n## 7. `);
};
/** The repository's drafts, with the English Privacy Policy edited. */
const withEnglishEdit = (locale: string, kind: Kind): string =>
  locale === "en" && kind === "PRIVACY" ? editedEnglish() : repoDraft(locale, kind);

/** Every translation recorded as following the English text `readDraft` gives now. */
function followingEnglish(readDraft: (locale: string, kind: Kind) => string): LegalTranslations {
  const ledger = { PRIVACY: {}, TERMS: {} } as Record<Kind, Record<string, { version: string; sha256: string }>>;
  for (const kind of ["PRIVACY", "TERMS"] as const) {
    const english = buildLegalDocument(readDraft("en", kind), KEYS[kind]);
    for (const code of TRANSLATED) ledger[kind][code] = { version: english.version, sha256: english.sha256 };
  }
  return parseLegalTranslations(ledger);
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway repository root whose archive holds exactly `texts` (each listed under its locale and kind). */
function archiveRoot(texts: ReadonlyArray<Readonly<{ kind: Kind; locale: string; markdown: string }>>): { root: string; archive: LegalArchiveIndex } {
  const root = mkdtempSync(join(tmpdir(), "legal-release-"));
  roots.push(root);
  const archive: Record<string, Record<string, Record<string, { version: string; path: string }>>> = {};
  for (const { kind, locale, markdown } of texts) {
    const hash = sha(markdown);
    const path = legalArchivePath(locale, hash);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), markdown, "utf8");
    const version = buildLegalDocument(markdown, KEYS[kind]).version;
    archive[kind] = { ...archive[kind], [locale]: { ...archive[kind]?.[locale], [hash]: { version, path } } };
  }
  return { root, archive: archive as LegalArchiveIndex };
}

/** Every current text of `readDraft`, archived. */
const everyCurrentText = (readDraft: (locale: string, kind: Kind) => string) =>
  (["PRIVACY", "TERMS"] as const).flatMap((kind) => CODES.map((locale) => ({ kind, locale, markdown: readDraft(locale, kind) })));

describe("English first: an English-only edit moves nothing else", () => {
  it("builds the manifest from an English-only edit, changes only the English pair, and archives nothing", () => {
    const history = committedArchive();
    const manifest = buildLegalManifest(withEnglishEdit, {}, history);
    expect(manifest.documents.PRIVACY.en).toEqual({ version: "1.0", sha256: sha(editedEnglish()) });
    for (const code of TRANSLATED) expect(manifest.documents.PRIVACY[code], code).toEqual(currentDocument("PRIVACY", code));
    for (const code of CODES) expect(manifest.documents.TERMS[code], code).toEqual(currentDocument("TERMS", code));
    // No archive copy is listed for the edited text: the archive is written at release.
    expect(manifest.archive).toEqual(history);
    expect(manifest.archive.PRIVACY?.en?.[sha(editedEnglish())]).toBeUndefined();
  });

  it("is read by the package although the archive does not hold the English text yet", () => {
    const manifest = JSON.parse(renderLegalManifest(buildLegalManifest(withEnglishEdit, {}, committedArchive()))) as LegalManifest;
    const parsed = parseLegalManifest(manifest);
    expect(parsed.documents.PRIVACY.get("en")).toEqual({ version: "1.0", sha256: sha(editedEnglish()) });
    expect(parsed.archive.PRIVACY.get("en")?.get(sha(editedEnglish()))).toBeUndefined();
  });

  it("still refuses an archived text listed under another version than the current one", () => {
    const manifest = JSON.parse(renderLegalManifest(buildLegalManifest(repoDraft, {}, {}, undefined, { archiveCurrent: true }))) as {
      documents: Record<string, Record<string, { version: string; sha256: string }>>;
      archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
    };
    const current = manifest.documents.PRIVACY!.en!.sha256;
    manifest.archive.PRIVACY!.en![current]!.version = "3.11";
    expect(() => parseLegalManifest(manifest)).toThrow("LEGAL_MANIFEST_INVALID");
  });

  it("lists the current texts in the archive only when the release step asks for it", () => {
    const manifest = buildLegalManifest(withEnglishEdit, {}, {}, undefined, { archiveCurrent: true });
    expect(manifest.archive.PRIVACY.en?.[sha(editedEnglish())]).toEqual({
      version: "1.0", path: legalArchivePath("en", sha(editedEnglish()))
    });
  });

  it("refuses to archive a changed text under a version the archive already holds for another text", () => {
    // Once the release step has archived the current texts, the archive holds the English text this edit changes, under
    // the same number; nothing is ever removed from it.
    const released = buildLegalManifest(repoDraft, {}, committedArchive(), undefined, { archiveCurrent: true }).archive;
    expect(released.PRIVACY.en?.[sha(repoDraft("en", "PRIVACY"))]?.version).toBe(currentDocument("PRIVACY", "en")!.version);
    expect(() => buildLegalManifest(withEnglishEdit, {}, released, undefined, { archiveCurrent: true }))
      .toThrow("LEGAL_MANIFEST_ARCHIVE_VERSION_REUSED");
  });

  it("archives the current texts of the languages it is given, and of every language when it is given none", () => {
    const offered = buildLegalManifest(repoDraft, {}, {}, undefined, { archiveCurrent: true, archiveLocales: RELEASE_LEGAL_LOCALES });
    for (const kind of ["PRIVACY", "TERMS"] as const) {
      expect(Object.keys(offered.archive[kind]).sort(), kind).toEqual([...RELEASE_LEGAL_LOCALES].sort());
      for (const locale of RELEASE_LEGAL_LOCALES) {
        expect(offered.archive[kind][locale], `${locale}/${kind}`).toEqual({
          [sha(repoDraft(locale, kind))]: { version: currentDocument(kind, locale)!.version, path: legalArchivePath(locale, sha(repoDraft(locale, kind))) }
        });
      }
      // Every language still gets its current pair in the manifest; only the archive leaves the others out.
      expect(Object.keys(offered.documents[kind]).sort(), kind).toEqual(CODES);
    }
    const every = buildLegalManifest(repoDraft, {}, {}, undefined, { archiveCurrent: true });
    for (const kind of ["PRIVACY", "TERMS"] as const) expect(Object.keys(every.archive[kind]).sort(), kind).toEqual(CODES);
  });

  it("the release step archives, and the release check holds to the English text, English, French and Romanian", () => {
    // English and Romanian are the languages offered; Canada reads and accepts the French texts at sign-up.
    expect(RELEASE_LEGAL_LOCALES).toEqual(["en", "fr", "ro"]);
    for (const locale of RELEASE_LEGAL_LOCALES) expect(CODES, locale).toContain(locale);
    const generator = readFileSync(resolve(process.cwd(), "apps/ui/scripts/generate-legal-data.mjs"), "utf8");
    expect(generator).toContain("archiveLocales: RELEASE_LEGAL_LOCALES");
    expect(generator).toContain("for (const code of RELEASE_LEGAL_LOCALES) {");
    const check = readFileSync(resolve(process.cwd(), "apps/ui/scripts/legal-release-check.mjs"), "utf8");
    expect(check).toContain("locales: RELEASE_LEGAL_LOCALES");
    expect(check).toContain("Every language this release offers");
  });
});

describe("which English text each translation follows", () => {
  it("records every translation of both documents, and nothing for English", () => {
    const ledger = parseLegalTranslations(JSON.parse(readFileSync(resolve(process.cwd(), LEGAL_TRANSLATIONS_PATH), "utf8")));
    for (const kind of ["PRIVACY", "TERMS"] as const) {
      expect(Object.keys(ledger[kind]).sort(), kind).toEqual(TRANSLATED);
      for (const entry of Object.values(ledger[kind])) {
        expect(entry.version).toMatch(/^[0-9]+\.[0-9]+$/u);
        expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/u);
      }
    }
  });

  it("refuses a record that leaves a language out, names English, or is malformed", () => {
    const good = followingEnglish(repoDraft);
    const without = structuredClone(good) as Record<Kind, Record<string, unknown>>;
    delete without.PRIVACY.fr;
    const english = structuredClone(good) as Record<Kind, Record<string, unknown>>;
    english.TERMS.en = english.TERMS.fr;
    const malformed = structuredClone(good) as Record<Kind, Record<string, { version: string; sha256: string }>>;
    malformed.TERMS.fr!.sha256 = "not a hash";
    for (const refused of [without, english, malformed, { PRIVACY: good.PRIVACY }, null]) {
      expect(() => parseLegalTranslations(refused)).toThrow("LEGAL_TRANSLATIONS_INVALID");
    }
  });

  it("says a translation follows English until the English text moves on", () => {
    const ledger = followingEnglish(repoDraft);
    expect(legalTranslationFollows(ledger, "PRIVACY", "fr", currentDocument("PRIVACY", "en")!.sha256)).toBe(true);
    expect(legalTranslationFollows(ledger, "PRIVACY", "fr", sha(editedEnglish()))).toBe(false);
  });

  it("records a translation only when it carries English's version and English's structure", () => {
    const ledger = followingEnglish(repoDraft);
    const english = buildLegalDocument(editedEnglish(), "privacy");
    const french = buildLegalDocument(repoDraft("fr", "PRIVACY"), "privacy");
    // French has not been translated from the edited English yet: its section 6 lacks the new paragraph.
    expect(() => recordLegalTranslation(ledger, "PRIVACY", "fr", english, french)).toThrow(/fr\/privacy/u);
    const current = buildLegalDocument(repoDraft("en", "PRIVACY"), "privacy");
    const recorded = recordLegalTranslation({ ...ledger, PRIVACY: { ...ledger.PRIVACY, fr: { version: "3.11", sha256: "0".repeat(64) } } }, "PRIVACY", "fr", current, french);
    expect(recorded.PRIVACY.fr).toEqual({ version: current.version, sha256: current.sha256 });
    expect(() => recordLegalTranslation(ledger, "PRIVACY", "en", current, current)).toThrow("LEGAL_TRANSLATIONS_INVALID");
  });
});

describe("the release check", () => {
  /** releaseDraft, with the English Privacy Policy edited. */
  const releaseWithEnglishEdit = (locale: string, kind: Kind): string =>
    locale === "en" && kind === "PRIVACY" ? editedEnglish() : releaseDraft(locale, kind);

  it("is satisfied when every language follows the current English text and the archive holds every current text", () => {
    const { root, archive } = archiveRoot(everyCurrentText(releaseDraft));
    const manifest = buildLegalManifest(releaseDraft, {}, archive);
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: followingEnglish(releaseDraft) })).toEqual([]);
  });

  it("names the languages that lag the English text, the current texts the archive lacks, and a version that names two texts", () => {
    // The archive and the record of translations as they stood at the last release; then English moved on.
    const { root, archive } = archiveRoot(everyCurrentText(releaseDraft));
    const manifest = buildLegalManifest(releaseWithEnglishEdit, {}, archive);
    const problems = legalReleaseProblems(root, { readDraft: releaseWithEnglishEdit, manifest, translations: followingEnglish(releaseDraft) });
    expect(problems).toEqual([
      `Privacy Policy: these 34 languages lag the English text (version 1.0, sha256 ${sha(editedEnglish()).slice(0, 12)}): ${TRANSLATED.join(", ")}. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document privacy`,
      "Privacy Policy: the archive does not hold the current text of en. Run pnpm run generate:legal:archive and commit what it writes.",
      "Privacy Policy: in en the archive already holds a different text as version 1.0. A changed text needs a new version number."
    ]);
  });

  it("names one lagging language and leaves the others alone", () => {
    const { root, archive } = archiveRoot(everyCurrentText(releaseDraft));
    const manifest = buildLegalManifest(releaseDraft, {}, archive);
    const ledger = followingEnglish(releaseDraft);
    const lagging = parseLegalTranslations({ ...ledger, TERMS: { ...ledger.TERMS, de: { version: "0.9", sha256: "1".repeat(64) } } });
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: lagging })).toEqual([
      `Terms of Service: this language lags the English text (version 1.0, sha256 ${sha(releaseDraft("en", "TERMS")).slice(0, 12)}): de. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document terms`
    ]);
  });

  it("checks only the languages it is given: a lagging language outside them is not reported, one inside is", () => {
    const { root, archive } = archiveRoot(everyCurrentText(releaseDraft));
    const manifest = buildLegalManifest(releaseDraft, {}, archive);
    const ledger = followingEnglish(releaseDraft);
    const old = { version: "0.9", sha256: "1".repeat(64) };
    const lagging = parseLegalTranslations({ ...ledger, TERMS: { ...ledger.TERMS, de: old, ro: old } });
    const terms = sha(releaseDraft("en", "TERMS")).slice(0, 12);
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: lagging, locales: RELEASE_LEGAL_LOCALES })).toEqual([
      `Terms of Service: this language lags the English text (version 1.0, sha256 ${terms}): ro. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document terms`
    ]);
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: lagging, locales: ["de", "en"] })).toEqual([
      `Terms of Service: this language lags the English text (version 1.0, sha256 ${terms}): de. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document terms`
    ]);
    // Every language when none is named: both lag.
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: lagging })).toEqual([
      `Terms of Service: these 2 languages lag the English text (version 1.0, sha256 ${terms}): de, ro. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document terms`
    ]);
  });

  it("asks the archive for the current texts of the languages it is given only, and always for English's", () => {
    const offered = (["PRIVACY", "TERMS"] as const).flatMap((kind) =>
      RELEASE_LEGAL_LOCALES.map((locale) => ({ kind, locale, markdown: releaseDraft(locale, kind) })));
    const { root, archive } = archiveRoot(offered);
    const manifest = buildLegalManifest(releaseDraft, {}, archive);
    const translations = followingEnglish(releaseDraft);
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations, locales: RELEASE_LEGAL_LOCALES })).toEqual([]);
    const others = CODES.filter((code) => !RELEASE_LEGAL_LOCALES.includes(code));
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations })).toEqual([
      `Privacy Policy: the archive does not hold the current text of ${others.join(", ")}. Run pnpm run generate:legal:archive and commit what it writes.`,
      `Terms of Service: the archive does not hold the current text of ${others.join(", ")}. Run pnpm run generate:legal:archive and commit what it writes.`
    ]);
    // English is the text every other follows: it is checked even when the list leaves it out.
    const { root: bare, archive: none } = archiveRoot([]);
    expect(legalReleaseProblems(bare, { readDraft: releaseDraft, manifest: buildLegalManifest(releaseDraft, {}, none), translations, locales: ["ro"] })).toEqual([
      "Privacy Policy: the archive does not hold the current text of en, ro. Run pnpm run generate:legal:archive and commit what it writes.",
      "Terms of Service: the archive does not hold the current text of en, ro. Run pnpm run generate:legal:archive and commit what it writes."
    ]);
  });

  it("is what the release step runs before it builds, and the archive copies have their own command", () => {
    const scripts = (JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["legal:release-check"]).toBe("node apps/ui/scripts/legal-release-check.mjs");
    expect(scripts["generate:legal:archive"]).toBe("node apps/ui/scripts/generate-legal-data.mjs --archive");
    // An ordinary run writes no archive copy.
    expect(scripts["generate:legal"]).toBe("node apps/ui/scripts/generate-legal-data.mjs");
    const builds = readFileSync(resolve(process.cwd(), "deploy/vps/README.md"), "utf8").split("\n").filter((line) => line.includes(" run build"));
    expect(builds).toHaveLength(1);
    const line = builds[0]!;
    expect(line.indexOf(" run legal:release-check && ")).toBeGreaterThan(-1);
    expect(line.indexOf(" run legal:release-check && ")).toBeLessThan(line.indexOf(" run build"));
  });

  it("reports an archive file that is missing or altered", () => {
    const { root, archive } = archiveRoot(everyCurrentText(releaseDraft));
    const french = sha(releaseDraft("fr", "TERMS"));
    writeFileSync(join(root, legalArchivePath("fr", french)), "not the archived text", "utf8");
    const manifest = buildLegalManifest(releaseDraft, {}, archive);
    expect(legalReleaseProblems(root, { readDraft: releaseDraft, manifest, translations: followingEnglish(releaseDraft) })).toEqual([
      `The archive and its index disagree: ${legalArchivePath("fr", french)}: HASH MISMATCH`
    ]);
  });
});
