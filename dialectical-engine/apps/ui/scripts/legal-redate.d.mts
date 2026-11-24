import type { LegalManifest, LegalManifestKind, LegalTranslations } from "./generate-legal-data.mjs";

export type LegalDay = Readonly<{ year: number; month: number; day: number }>;
export const LEGAL_REDATE_DOCUMENTS: ReadonlyArray<Readonly<{ kind: LegalManifestKind; key: "privacy" | "terms"; name: string; draft: string }>>;
export function parseLegalDay(text: unknown): LegalDay;
export function legalDayIso(day: LegalDay): string;
/** The day in the words `code`'s drafts use: `line` for the version line and the text, `eyebrow` for the eyebrow. */
export function legalDayText(code: string, day: LegalDay, form: "line" | "eyebrow"): string;
export function englishVersionAndDay(markdown: string): Readonly<{ version: string; day: LegalDay }>;
export function romanianToday(now?: Date): LegalDay;
export type LegalRedatePlan = Readonly<{
  to: LegalDay;
  from: Readonly<Record<LegalManifestKind, LegalDay>>;
  /** The documents left as they are because their current version is in the release the site runs. */
  kept: ReadonlyArray<Readonly<{ kind: LegalManifestKind; name: string; version: string; path: string }>>;
  drafts: ReadonlyArray<Readonly<{ path: string; after: string; lines: ReadonlyArray<Readonly<{ before: string; after: string }>> }>>;
  archiveRemovals: ReadonlyArray<Readonly<{ kind: LegalManifestKind; code: string; sha256: string; path: string }>>;
  retranslate: Readonly<Record<LegalManifestKind, readonly string[]>>;
}>;
export function planLegalRedate(input: Readonly<{
  to: LegalDay;
  today: LegalDay;
  readDraft: (code: string, kind: LegalManifestKind) => string;
  manifest: LegalManifest;
  translations: LegalTranslations;
  readArchived: (path: string) => string;
  isReleased: (path: string) => boolean;
  locales?: readonly string[];
}>): LegalRedatePlan;
export function releasedByLiveRelease(root: string): (path: string) => boolean;
export function main(argv: readonly string[], now?: Date): number;
