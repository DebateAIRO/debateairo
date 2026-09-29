import type { LegalBlock, LegalDocument, LegalDocumentKey } from "../lib/legalDocument.js";

export type LegalDocumentSource = Readonly<{
  key: LegalDocumentKey;
  source: string;
  output: string;
}>;

export const LEGAL_DOCUMENT_SOURCES: readonly LegalDocumentSource[];
export function inlineText(raw: string): string;
export function parseLegalChrome(markdown: string): Readonly<{
  chrome: Readonly<Record<string, unknown>>;
  markdown: string;
}>;
export function parseBlocks(lines: readonly string[]): LegalBlock[];
export function buildLegalDocument(markdown: string, key: LegalDocumentKey): LegalDocument;
export function renderLegalModule(markdown: string, key: LegalDocumentKey, locale?: string): string;
export type LegalManifestKind = "TERMS" | "PRIVACY";
export type LegalManifestConsentKind = "CONSENT_RENEWAL" | "CONSENT_IMMEDIATE_START";
type Pair = Readonly<{ version: string; sha256: string }>;
/** Ruling Q-3: kind -> locale -> sha256 -> { version, path }; `path` is `legalArchivePath(locale, sha256)`. */
type ArchiveEntries = Readonly<Record<string, Readonly<{ version: string; path: string }>>>;
export type LegalArchiveIndex = Readonly<Partial<Record<LegalManifestKind, Readonly<Record<string, ArchiveEntries>>>>>;
export type LegalManifest = Readonly<{
  format: "debateai.legal-manifest.v1";
  reacceptance: Readonly<Record<LegalManifestKind, string | null>>;
  documents: Readonly<Record<LegalManifestKind, Readonly<Record<string, Pair>>>>
    & Readonly<Partial<Record<LegalManifestConsentKind, Readonly<Record<string, Pair>>>>>;
  archive: Readonly<Record<LegalManifestKind, Readonly<Record<string, ArchiveEntries>>>>;
}>;
export const LEGAL_MANIFEST_OUTPUT: string;
export const LEGAL_ARCHIVE_ROOT: string;
export function legalDraftSha256(markdown: string): string;
export function legalArchivePath(locale: string, sha256: string): string;
export function legalArchiveProblems(repoRoot: string, archive: LegalArchiveIndex): string[];
export function buildLegalManifest(
  readDraft: (locale: string, kind: LegalManifestKind) => string,
  consentEntries?: Readonly<Record<string, Readonly<Partial<Record<LegalManifestConsentKind, Pair>>>>>,
  archiveHistory?: LegalArchiveIndex
): LegalManifest;
export function renderLegalManifest(manifest: LegalManifest): string;
