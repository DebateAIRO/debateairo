import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  archivedDocument,
  currentDocument,
  documentVersionAtLeast,
  isCurrentDocument,
  LEGAL_DOCUMENT_KINDS,
  legalArchive,
  legalManifestLocales,
  parseLegalManifest,
  reacceptanceFloor
} from "@debateai/legal-manifest";
import {
  buildLegalManifest,
  LEGAL_ARCHIVE_ROOT,
  LEGAL_MANIFEST_OUTPUT,
  legalArchivePath,
  legalArchiveProblems,
  legalDraftSha256,
  renderLegalManifest,
  type LegalArchiveIndex
} from "../../apps/ui/scripts/generate-legal-data.mjs";
import {
  buildConsentManifestEntries,
  CONSENT_KEYS,
  consentDocument
} from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
// R3-4: PR #42's hand-kept TERMS_VERSIONS (apps/ui/lib/legal/pages.ts) is loaded at run time in the
// "archive agree" describe below, never imported here — see the comment there.

const DRAFTS = { TERMS: "terms-of-service.md", PRIVACY: "privacy-policy.md" } as const;
const CODES = LOCALES.map(({ code }) => code);
const readDraft = (locale: string, kind: "TERMS" | "PRIVACY"): string =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, DRAFTS[kind]), "utf8");
const draftBytes = (locale: string, kind: "TERMS" | "PRIVACY"): Buffer =>
  readFileSync(resolve(process.cwd(), "apps/ui/legal", locale, DRAFTS[kind]));
/** What `pnpm generate:legal` reads: the real catalogues (no billing.json before B10c/P18 → no consent entries). */
const repositoryConsents = () =>
  buildConsentManifestEntries({ messagesRoot: resolve(process.cwd(), "apps/ui/messages"), locales: CODES });
/** The committed manifest's archive index: the history the generator carries forward (ruling Q-3). */
const committedArchive = (): LegalArchiveIndex =>
  (JSON.parse(readFileSync(resolve(process.cwd(), LEGAL_MANIFEST_OUTPUT), "utf8")) as { archive: LegalArchiveIndex }).archive;

const RENEWAL = "I agree that my subscription renews automatically every month at the price shown, until I cancel.";
const START = "Start my plan now. I understand that if I withdraw within {days} days, I pay for the part already used.";
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway messages root: `<root>/<locale>/billing.json` for each entry. */
function messages(files: Readonly<Record<string, Readonly<Record<string, string>>>>): string {
  const root = mkdtempSync(join(tmpdir(), "legal-consents-"));
  roots.push(root);
  for (const [locale, catalogue] of Object.entries(files)) {
    mkdirSync(join(root, locale), { recursive: true });
    writeFileSync(join(root, locale, "billing.json"), JSON.stringify(catalogue, null, 2));
  }
  return root;
}

describe("the legal document manifest (paid plans L2, spec §2.3.2)", () => {
  it("commits exactly what the generator emits from the in-repo drafts, catalogues and archive history", () => {
    expect(LEGAL_MANIFEST_OUTPUT).toBe("packages/legal-manifest/src/manifest.json");
    const committed = readFileSync(resolve(process.cwd(), LEGAL_MANIFEST_OUTPUT), "utf8");
    expect(
      renderLegalManifest(buildLegalManifest(readDraft, repositoryConsents(), committedArchive())),
      `${LEGAL_MANIFEST_OUTPUT} is stale`
    ).toBe(committed);
  });

  it("holds, for every locale and both documents, the draft's version and the sha256 of its exact bytes", () => {
    expect(LOCALES).toHaveLength(35);
    for (const { code } of LOCALES) {
      for (const kind of ["TERMS", "PRIVACY"] as const) {
        const entry = currentDocument(kind, code);
        expect(entry, `${code}/${kind}`).not.toBeNull();
        expect(entry!.sha256).toBe(createHash("sha256").update(draftBytes(code, kind)).digest("hex"));
        expect(entry!.version).toBe(kind === "TERMS" ? "2.1" : "3.2");
      }
    }
    expect(legalManifestLocales("TERMS")).toEqual([...CODES].sort());
    expect(reacceptanceFloor("TERMS")).toBe("2.1");
    expect(reacceptanceFloor("PRIVACY")).toBe("3.2");
  });

  // V's ruling: the sensitive-data consent is withdrawn by closing the account, not by email.
  it("withdraws the sensitive-data consent by closing the account in every locale", () => {
    for (const { code } of LOCALES) {
      const privacy = readDraft(code, "PRIVACY");
      const sensitiveSection = privacy.split(/^## 3\..+$/mu)[1]?.split(/^## 4\./mu)[0];
      const withdrawalRow = privacy.split("\n").find((line) => line.startsWith("|") && line.includes("Art. 7(3)"));
      expect(sensitiveSection, `${code} section 3`).toBeDefined();
      expect(withdrawalRow, `${code} withdrawal row`).toBeDefined();
      expect(sensitiveSection, `${code} section 3`).not.toContain("privacy@dezbatere.ro");
      expect(withdrawalRow, `${code} withdrawal row`).not.toContain("privacy@dezbatere.ro");
    }
    const english = readDraft("en", "PRIVACY");
    expect(english).toContain("You can withdraw it at any time by closing your account from Settings.");
    expect(english).toContain("withdraw the sensitive-data consent by closing your account from Settings");
  });

  it("names the actual document language in locales that previously said English", () => {
    const labels = {
      et: "Keel: eesti", ga: "Teanga: Gaeilge", ja: "言語：日本語", ko: "언어: 한국어",
      pl: "Język: polski", uk: "Мова: українська", zh: "语言：中文"
    } as const;
    for (const [code, label] of Object.entries(labels)) {
      expect(readDraft(code, "TERMS").split("\n")[23], code).toContain(label);
    }
  });

  it("answers null for a locale it does not carry, and compares pairs exactly", () => {
    expect(currentDocument("TERMS", "xx")).toBeNull();
    expect(currentDocument("TERMS", "__proto__")).toBeNull();
    const terms = currentDocument("TERMS", "ro")!;
    expect(isCurrentDocument("TERMS", "ro", terms)).toBe(true);
    expect(isCurrentDocument("TERMS", "ro", { ...terms, sha256: "0".repeat(64) })).toBe(false);
    expect(isCurrentDocument("TERMS", "ro", { ...terms, version: "1.9" })).toBe(false);
    expect(isCurrentDocument("TERMS", "de", terms)).toBe(false);
    expect(LEGAL_DOCUMENT_KINDS).toEqual(["TERMS", "PRIVACY", "CONSENT_RENEWAL", "CONSENT_IMMEDIATE_START"]);
  });

  it("requires re-acceptance for the revised documents and orders versions numerically", () => {
    expect(reacceptanceFloor("TERMS")).toBe("2.1");
    expect(reacceptanceFloor("PRIVACY")).toBe("3.2");
    for (const kind of ["CONSENT_RENEWAL", "CONSENT_IMMEDIATE_START"] as const) {
      expect(reacceptanceFloor(kind), kind).toBeNull();
    }
    expect(documentVersionAtLeast("2.0", "2.0")).toBe(true);
    expect(documentVersionAtLeast("2.10", "2.9")).toBe(true);
    expect(documentVersionAtLeast("2.9", "2.10")).toBe(false);
    expect(documentVersionAtLeast("3.0", "2.10")).toBe(true);
    expect(() => documentVersionAtLeast("v2", "2.0")).toThrow("LEGAL_DOCUMENT_VERSION_INVALID");
    expect(() => documentVersionAtLeast("sha256-0123456789ab", "2.0")).toThrow("LEGAL_DOCUMENT_VERSION_INVALID");
  });

  /**
   * Final review I-2. A floor above a current version can never be cleared: the accept screen asks for
   * the current document, records it, and the record is still below the floor — every signed-in person
   * locked out, one more REACCEPT row per click. Both the package (the API's boot) and the generator
   * refuse it; a floor AT the current version (the owner raising both together) is the valid move.
   */
  it("refuses a re-acceptance floor above any locale's current version, in the package and in the generator", () => {
    const terms = currentDocument("TERMS", "en")!.version;
    const privacy = currentDocument("PRIVACY", "en")!.version;
    expect([terms, privacy]).toEqual(["2.1", "3.2"]);
    const manifest = JSON.parse(renderLegalManifest(buildLegalManifest(readDraft, {}, committedArchive()))) as {
      reacceptance: Record<string, unknown>;
      documents: Record<string, Record<string, { version: string; sha256: string }>>;
      archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
    };
    const withFloors = (floors: Record<string, unknown>) => ({
      ...structuredClone(manifest), reacceptance: { ...manifest.reacceptance, ...floors }
    });
    for (const floors of [{ TERMS: "2.2" }, { TERMS: "3.0" }, { PRIVACY: "3.3" }, { TERMS: "2.1", PRIVACY: "4.0" }]) {
      expect(() => parseLegalManifest(withFloors(floors)), JSON.stringify(floors)).toThrow("LEGAL_MANIFEST_INVALID");
    }
    for (const floors of [{ TERMS: "2.1" }, { TERMS: "1.9", PRIVACY: "3.2" }, { PRIVACY: "2.10" }]) {
      expect(parseLegalManifest(withFloors(floors)).reacceptance, JSON.stringify(floors)).toMatchObject(floors);
    }
    // Every locale's current pair must have reached the floor, not only English.
    const lagging = withFloors({ TERMS: "2.1" });
    const deSha = lagging.documents.TERMS!.de!.sha256;
    lagging.documents.TERMS!.de!.version = "1.9";
    lagging.archive.TERMS!.de![deSha]!.version = "1.9";
    expect(() => parseLegalManifest(lagging)).toThrow("LEGAL_MANIFEST_INVALID");
    expect(parseLegalManifest({ ...lagging, reacceptance: { ...lagging.reacceptance, TERMS: "1.9" } })
      .documents.TERMS.get("de")?.version).toBe("1.9");

    // The generator refuses the same configuration before it writes anything, by a code alone.
    for (const floors of [{ TERMS: "2.2", PRIVACY: null }, { TERMS: null, PRIVACY: "3.3" }, { TERMS: "v2", PRIVACY: null }]) {
      expect(() => buildLegalManifest(readDraft, {}, committedArchive(), floors), JSON.stringify(floors))
        .toThrow(/^LEGAL_MANIFEST_REACCEPTANCE_FLOOR_INVALID$/u);
    }
    const raised = buildLegalManifest(readDraft, {}, committedArchive(), { TERMS: "2.1", PRIVACY: "3.2" });
    expect(raised.reacceptance).toEqual({ PRIVACY: "3.2", TERMS: "2.1" });
    expect(parseLegalManifest(JSON.parse(renderLegalManifest(raised))).reacceptance.TERMS).toBe("2.1");
  });

  it("stamps each generated module with the same version and hash as the manifest", () => {
    expect(TERMS_OF_SERVICE.version).toBe(currentDocument("TERMS", "en")!.version);
    expect(TERMS_OF_SERVICE.sha256).toBe(currentDocument("TERMS", "en")!.sha256);
    expect(PRIVACY_POLICY.version).toBe(currentDocument("PRIVACY", "en")!.version);
    expect(PRIVACY_POLICY.sha256).toBe(currentDocument("PRIVACY", "en")!.sha256);
    expect(legalDraftSha256(readDraft("en", "TERMS"))).toBe(currentDocument("TERMS", "en")!.sha256);
  });
});

describe("the checkout consent sentences in the manifest (paid plans L2, R-27)", () => {
  it("hashes the exact catalogue sentence of every locale that has both, with a hash-derived version", () => {
    const root = messages({
      en: { [CONSENT_KEYS.CONSENT_RENEWAL]: RENEWAL, [CONSENT_KEYS.CONSENT_IMMEDIATE_START]: START, "billing.other": "x" }
    });
    expect(buildConsentManifestEntries({ messagesRoot: root, locales: ["en", "ro"] })).toEqual({
      en: {
        CONSENT_RENEWAL: { version: `sha256-${sha(RENEWAL).slice(0, 12)}`, sha256: sha(RENEWAL) },
        CONSENT_IMMEDIATE_START: { version: `sha256-${sha(START).slice(0, 12)}`, sha256: sha(START) }
      }
    });
    expect(consentDocument(RENEWAL).version).not.toBe(consentDocument(`${RENEWAL} `).version);
    expect(CONSENT_KEYS).toEqual({
      CONSENT_RENEWAL: "billing.consent.renewal",
      CONSENT_IMMEDIATE_START: "billing.consent.immediateStart"
    });
  });

  it("tolerates a locale with no billing.json, or a billing.json without the sentences yet, and refuses half", () => {
    expect(buildConsentManifestEntries({ messagesRoot: messages({}), locales: ["en"] })).toEqual({});
    expect(buildConsentManifestEntries({
      messagesRoot: messages({ en: { "billing.usage.line": "Your plan's usage" } }), locales: ["en"]
    })).toEqual({});
    const half = messages({ en: { [CONSENT_KEYS.CONSENT_RENEWAL]: RENEWAL } });
    expect(() => buildConsentManifestEntries({ messagesRoot: half, locales: ["en"] }))
      .toThrow("en/billing.json: billing.consent.immediateStart");
    const blank = messages({ en: { [CONSENT_KEYS.CONSENT_RENEWAL]: RENEWAL, [CONSENT_KEYS.CONSENT_IMMEDIATE_START]: "  " } });
    expect(() => buildConsentManifestEntries({ messagesRoot: blank, locales: ["en"] }))
      .toThrow("en/billing.json: billing.consent.immediateStart");
  });

  it("merges consent entries into the manifest, which the package parses and answers", () => {
    const entries = { en: { CONSENT_RENEWAL: consentDocument(RENEWAL), CONSENT_IMMEDIATE_START: consentDocument(START) } };
    expect(Object.keys(buildLegalManifest(readDraft).documents)).toEqual(["PRIVACY", "TERMS"]);
    const manifest = buildLegalManifest(readDraft, entries);
    expect(Object.keys(manifest.documents)).toEqual(["CONSENT_IMMEDIATE_START", "CONSENT_RENEWAL", "PRIVACY", "TERMS"]);
    const parsed = parseLegalManifest(JSON.parse(renderLegalManifest(manifest)));
    expect(parsed.documents.CONSENT_RENEWAL.get("en")).toEqual(consentDocument(RENEWAL));
    expect(parsed.documents.CONSENT_IMMEDIATE_START.get("ro")).toBeUndefined();
    expect(parsed.documents.TERMS.get("ro")).toEqual(currentDocument("TERMS", "ro"));
    expect(parsed.reacceptance.CONSENT_RENEWAL).toBeNull();
  });

  it("refuses a consent entry whose version is not its hash, a consent floor, and a foreign kind", () => {
    const entries = { en: { CONSENT_RENEWAL: consentDocument(RENEWAL), CONSENT_IMMEDIATE_START: consentDocument(START) } };
    const manifest = JSON.parse(renderLegalManifest(buildLegalManifest(readDraft, entries))) as {
      reacceptance: Record<string, unknown>;
      documents: Record<string, Record<string, { version: string; sha256: string }>>;
    };
    const numbered = structuredClone(manifest);
    numbered.documents.CONSENT_RENEWAL!.en!.version = "2.0";
    expect(() => parseLegalManifest(numbered)).toThrow("LEGAL_MANIFEST_INVALID");
    const otherHash = structuredClone(manifest);
    otherHash.documents.CONSENT_RENEWAL!.en!.version = `sha256-${"0".repeat(12)}`;
    expect(() => parseLegalManifest(otherHash)).toThrow("LEGAL_MANIFEST_INVALID");
    const floor = structuredClone(manifest);
    floor.reacceptance.CONSENT_RENEWAL = "1.0";
    expect(() => parseLegalManifest(floor)).toThrow("LEGAL_MANIFEST_INVALID");
    const foreign = structuredClone(manifest);
    foreign.documents.COOKIES = foreign.documents.TERMS!;
    expect(() => parseLegalManifest(foreign)).toThrow("LEGAL_MANIFEST_INVALID");
    expect(() => buildLegalManifest(readDraft, { en: { TERMS: consentDocument(RENEWAL) } } as never))
      .toThrow("LEGAL_MANIFEST_CONSENT_ENTRY_INVALID");
    expect(() => buildLegalManifest(readDraft, { xx: entries.en } as never))
      .toThrow("LEGAL_MANIFEST_CONSENT_ENTRY_INVALID");
  });
});

describe("the archive of every published Terms and Privacy text (paid plans L2, ruling Q-3)", () => {
  it("keeps each current draft's exact bytes under its sha256, and the manifest maps the hash to that file", () => {
    expect(LEGAL_ARCHIVE_ROOT).toBe("apps/ui/legal/archive");
    for (const { code } of LOCALES) {
      for (const kind of ["TERMS", "PRIVACY"] as const) {
        const current = currentDocument(kind, code)!;
        const entry = archivedDocument(kind, code, current.sha256);
        expect(entry, `${code}/${kind}`).toEqual({
          version: current.version,
          sha256: current.sha256,
          path: `apps/ui/legal/archive/${code}/${current.sha256}.md`
        });
        expect(legalArchivePath(code, current.sha256)).toBe(entry!.path);
        expect(readFileSync(resolve(process.cwd(), entry!.path)).equals(draftBytes(code, kind)), entry!.path).toBe(true);
      }
    }
  });

  it("holds exactly the files the committed manifest lists, each hashing to its own name", () => {
    expect(legalArchiveProblems(process.cwd(), committedArchive())).toEqual([]);
  });

  it("answers nothing for a consent kind, another document, another locale or a hash never archived", () => {
    const terms = currentDocument("TERMS", "ro")!;
    expect(archivedDocument("CONSENT_RENEWAL", "ro", terms.sha256)).toBeNull();
    expect(archivedDocument("PRIVACY", "ro", terms.sha256)).toBeNull();
    expect(archivedDocument("TERMS", "de", terms.sha256)).toBeNull();
    expect(archivedDocument("TERMS", "ro", "0".repeat(64))).toBeNull();
    expect(archivedDocument("TERMS", "../ro", terms.sha256)).toBeNull();
    expect(legalArchive("TERMS", "ro")).toContainEqual(archivedDocument("TERMS", "ro", terms.sha256));
    expect(legalArchive("CONSENT_RENEWAL", "ro")).toEqual([]);
  });

  it("carries an older version forward when the draft moves on, lists it after the current one, and refuses a contradiction", () => {
    const current = currentDocument("TERMS", "en")!;
    const older = "1".repeat(64);
    const history: LegalArchiveIndex = { TERMS: { en: { [older]: { version: "1.9", path: legalArchivePath("en", older) } } } };
    const manifest = buildLegalManifest(readDraft, {}, history);
    expect(manifest.archive.TERMS.en).toEqual({
      [older]: { version: "1.9", path: legalArchivePath("en", older) },
      [current.sha256]: { version: current.version, path: legalArchivePath("en", current.sha256) }
    });
    const parsed = parseLegalManifest(JSON.parse(renderLegalManifest(manifest)));
    expect(legalArchive("TERMS", "en", parsed).map((entry) => entry.version)).toEqual([current.version, "1.9"]);
    expect(legalArchive("TERMS", "de", parsed)).toHaveLength(1);
    for (const refused of [
      { TERMS: { en: { [older]: { version: "1.9", path: legalArchivePath("de", older) } } } },
      { TERMS: { en: { [older]: { version: "v1", path: legalArchivePath("en", older) } } } },
      { TERMS: { en: { ["1".repeat(63)]: { version: "1.9", path: legalArchivePath("en", "1".repeat(63)) } } } },
      { TERMS: { xx: { [older]: { version: "1.9", path: legalArchivePath("xx", older) } } } },
      { CONSENT_RENEWAL: { en: {} } },
      // The current text's hash can only ever carry the current text's version.
      { TERMS: { en: { [current.sha256]: { version: "1.0", path: legalArchivePath("en", current.sha256) } } } }
    ]) {
      expect(() => buildLegalManifest(readDraft, {}, refused as never), JSON.stringify(refused))
        .toThrow("LEGAL_MANIFEST_ARCHIVE_INVALID");
    }
  });

  it("refuses to parse an entry off its path, an archive for a consent kind, or a current text left out of the archive", () => {
    const manifest = JSON.parse(renderLegalManifest(buildLegalManifest(readDraft))) as {
      archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
    };
    const sha = currentDocument("TERMS", "en")!.sha256;
    const moved = structuredClone(manifest);
    moved.archive.TERMS!.en![sha]!.path = "apps/ui/legal/en/terms-of-service.md";
    expect(() => parseLegalManifest(moved)).toThrow("LEGAL_MANIFEST_INVALID");
    const dropped = structuredClone(manifest);
    delete dropped.archive.TERMS!.en![sha];
    expect(() => parseLegalManifest(dropped)).toThrow("LEGAL_MANIFEST_INVALID");
    const consent = structuredClone(manifest);
    consent.archive.CONSENT_RENEWAL = {};
    expect(() => parseLegalManifest(consent)).toThrow("LEGAL_MANIFEST_INVALID");
  });

  it("reports a listed file that is missing or altered, and a file nobody listed", () => {
    const root = mkdtempSync(join(tmpdir(), "legal-archive-"));
    roots.push(root);
    const kept = Buffer.from("# Terms, version 1.9\n", "utf8");
    const keptSha = createHash("sha256").update(kept).digest("hex");
    const altered = "2".repeat(64);
    const gone = "3".repeat(64);
    mkdirSync(join(root, LEGAL_ARCHIVE_ROOT, "en"), { recursive: true });
    writeFileSync(join(root, legalArchivePath("en", keptSha)), kept);
    writeFileSync(join(root, legalArchivePath("en", altered)), "not the listed bytes");
    writeFileSync(join(root, LEGAL_ARCHIVE_ROOT, "en", "stray.md"), "x");
    // Dotfiles (a Finder .DS_Store) are not texts and are not reported.
    writeFileSync(join(root, LEGAL_ARCHIVE_ROOT, "en", ".DS_Store"), "x");
    const archive: LegalArchiveIndex = {
      TERMS: {
        en: {
          [keptSha]: { version: "1.9", path: legalArchivePath("en", keptSha) },
          [altered]: { version: "1.8", path: legalArchivePath("en", altered) },
          [gone]: { version: "1.7", path: legalArchivePath("en", gone) }
        }
      }
    };
    expect(legalArchiveProblems(root, archive)).toEqual([
      `${legalArchivePath("en", altered)}: HASH MISMATCH`,
      `${legalArchivePath("en", gone)}: MISSING`,
      `${LEGAL_ARCHIVE_ROOT}/en/stray.md: NOT IN THE MANIFEST`
    ]);
  });
});

describe("the /terms/versions list and the archive agree (paid plans L2, rulings Q-3 and R3-4)", () => {
  // PR #42's page (apps/ui/app/terms/versions/page.tsx) renders TERMS_VERSIONS; its rows keep their editorial
  // date and note, and the ARCHIVE decides which versions they are, so a published version cannot go missing.
  type TermsVersionRow = Readonly<{ version: string; current: boolean; href: string }>;
  let TERMS_VERSIONS: ReadonlyArray<TermsVersionRow> = [];
  beforeAll(async () => {
    // pages.ts (PR #42) uses extensionless imports that NodeNext rejects (TS2835); load it at run time like t9-mode-tokens does.
    ({ TERMS_VERSIONS } = await vi.importActual<{ TERMS_VERSIONS: ReadonlyArray<TermsVersionRow> }>("../../apps/ui/lib/legal/pages.js"));
  });

  it("lists every archived Terms version exactly once, newest first, and nothing the archive never held", () => {
    const archivedVersions = [...new Set(legalArchive("TERMS", "en").map((entry) => entry.version))];
    expect(archivedVersions.length).toBeGreaterThan(0);
    expect(TERMS_VERSIONS.map((row) => row.version)).toEqual(archivedVersions);
  });

  it("marks exactly the version in force as current, linked to /terms, and links every other to its archived text", () => {
    const current = currentDocument("TERMS", "en")!;
    expect(TERMS_VERSIONS.filter((row) => row.current).map((row) => row.version)).toEqual([current.version]);
    for (const row of TERMS_VERSIONS) {
      if (row.current) {
        expect(row.href, row.version).toBe("/terms");
        continue;
      }
      const texts = legalArchive("TERMS", "en").filter((entry) => entry.version === row.version);
      expect(texts.map((entry) => `/terms/versions/${entry.sha256}`), row.version).toContain(row.href);
    }
  });
});
