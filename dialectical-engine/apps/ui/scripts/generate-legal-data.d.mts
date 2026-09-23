import type { LegalBlock, LegalDocument, LegalDocumentKey } from "../lib/legalDocument.js";

export type LegalDocumentSource = Readonly<{
  key: LegalDocumentKey;
  source: string;
  output: string;
}>;

export const LEGAL_DOCUMENT_SOURCES: readonly LegalDocumentSource[];
export function inlineText(raw: string): string;
export function parseBlocks(lines: readonly string[]): LegalBlock[];
export function buildLegalDocument(markdown: string, key: LegalDocumentKey): LegalDocument;
export function renderLegalModule(markdown: string, key: LegalDocumentKey): string;
