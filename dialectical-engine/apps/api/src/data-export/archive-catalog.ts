import { readFileSync } from "node:fs";

export const ARCHIVE_KEYS = [
  "archive.pageTitle", "archive.generated", "archive.accountHeading", "archive.email", "archive.memberSince",
  "archive.debatesHeading", "archive.question", "archive.verdict", "archive.verdictSupported",
  "archive.verdictContested", "archive.verdictUnsupported", "archive.verdictSplit", "archive.story", "archive.arguments",
  "archive.visibilityPublic", "archive.visibilityPrivate", "archive.unreadable", "archive.noDebates", "archive.filesNote",
  "archive.contentCheck", "archive.verdict.flagged", "archive.verdict.clear", "archive.verdict.noSynthesis",
  "archive.verdict.unavailable", "archive.category.terrorism", "archive.category.hateSpeech",
  "archive.category.suicideOrHarm", "archive.category.weaponsOrDrugs",
  "archive.publicationReview", "archive.reviewAsked", "archive.reviewApproved", "archive.reviewRefused"
] as const;

export type ArchiveCatalog = Readonly<Record<string, string>>;

export function loadArchiveCatalog(locale: string): ArchiveCatalog {
  if (!/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(locale)) throw new Error("ARCHIVE_LOCALE_INVALID");
  const file = new URL(`./archive-messages/${locale}.json`, import.meta.url);
  const values: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("ARCHIVE_CATALOG_INVALID");
  const catalog = values as Record<string, unknown>;
  if (Object.keys(catalog).length !== ARCHIVE_KEYS.length || ARCHIVE_KEYS.some((key) => typeof catalog[key] !== "string" || !catalog[key])) {
    throw new Error("ARCHIVE_CATALOG_INVALID");
  }
  return catalog as ArchiveCatalog;
}

export function formatArchiveTime(at: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(at) + " UTC";
}
