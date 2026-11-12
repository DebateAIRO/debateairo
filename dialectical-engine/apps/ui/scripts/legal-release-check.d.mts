import type { LegalManifest, LegalManifestKind, LegalTranslations } from "./generate-legal-data.mjs";

export function legalReleaseProblems(
  repoRoot: string,
  input: Readonly<{
    readDraft: (locale: string, kind: LegalManifestKind) => string;
    manifest: LegalManifest;
    translations: LegalTranslations;
  }>
): string[];
