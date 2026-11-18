import type { LegalManifest, LegalManifestKind, LegalTranslations } from "./generate-legal-data.mjs";

export function legalReleaseProblems(
  repoRoot: string,
  input: Readonly<{
    readDraft: (locale: string, kind: LegalManifestKind) => string;
    manifest: LegalManifest;
    translations: LegalTranslations;
    /** The languages to hold to the current English text (English is always checked); every language when left out. */
    locales?: readonly string[];
  }>
): string[];
