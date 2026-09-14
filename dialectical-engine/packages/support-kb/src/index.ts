import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TextDecoder } from "node:util";

import { TypedDomainError } from "@debateai/kernel";
import { SUPPORT_CATALOG_CANONICAL } from "./catalog.js";

export type HelpCorpusLanguage = "en" | "ro";
export type HelpCorpusStatus = "shipped" | "intended";

export type HelpCorpusEntry = Readonly<{
  id: string;
  lang: HelpCorpusLanguage;
  title: string;
  status: HelpCorpusStatus;
  sources: readonly string[];
  verifiedAgainst: string;
  ratifiedBy: "V" | "";
  ratifiedOn: string;
  body: string;
}>;

export type SupportReviewDetails = Readonly<{
  reviewedBy: "SOL";
  reviewerSession: string;
  reviewedOn: string;
  evidence: string;
}>;

export type SupportArticleReview = SupportReviewDetails & Readonly<{
  id: string;
  lang: HelpCorpusLanguage;
  sha256: string;
}>;

export type SupportReviewManifest = Readonly<{
  schemaVersion: 1;
  catalog: SupportReviewDetails & Readonly<{ sha256: string }>;
  articles: readonly SupportArticleReview[];
}>;

export type LoadedHelpCorpus = Readonly<{
  entries: readonly HelpCorpusEntry[];
  shippedCount: number;
  ignoredCount: number;
  previewReviewedCount: number;
  ownerRatifiedCount: number;
  catalogDigest: string;
  reviewManifest: SupportReviewManifest;
  /**
   * Canonical form: ids sorted by code point; within each id, `en` then `ro`;
   * each line is `<id>.<lang>.md:<sha256 of exact file bytes>`, joined by LF
   * with no trailing LF.
   */
  manifest: string;
  kbVersion: string;
}>;

export type HelpCorpusSnapshotLookup = Readonly<{
  currentVersion: string;
  get(version: string): LoadedHelpCorpus | undefined;
}>;

export class SupportKbError extends TypedDomainError {}

const FRONT_MATTER_KEYS = [
  "id",
  "lang",
  "title",
  "status",
  "sources",
  "verified_against",
  "ratified_by",
  "ratified_on",
] as const;

const FRONT_MATTER_KEY_SET = new Set<string>(FRONT_MATTER_KEYS);
const LANGUAGES = ["en", "ro"] as const;
const ENTRY_FILENAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(en|ro)\.md$/u;
const ENTRY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RATIFIED_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const INSTRUCTION_LIKE_PATTERNS = [
  /\bignore\s+(?:(?:all|any)\s+)?(?:(?:of\s+)?(?:your|the)\s+)?previous\b/iu,
  /\bsystem\s*:/iu,
  /\byou\s+are\s+now\b/iu,
] as const;
const UNSAFE_VISITOR_CONTROL = /[\p{Cc}\p{Cf}]/u;
const CYRILLIC_VISITOR_TEXT = /\p{Script=Cyrillic}/u;

type ParsedFile = Readonly<{
  filename: string;
  filenameId: string;
  filenameLang: HelpCorpusLanguage;
  bytes: Buffer;
  entry: HelpCorpusEntry;
}>;

function fail(code: string, filename: string, detail: string): never {
  throw new SupportKbError(code, `${filename}: ${detail}`);
}

function isIsoDate(value: string): boolean {
  if (!RATIFIED_DATE.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function decodeUtf8(bytes: Buffer, filename: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("SUPPORT_KB_UTF8_INVALID", filename, "file must contain valid UTF-8");
  }
}

function lintVisitorText(visitorText: string, filename: string): void {
  for (const codePoint of visitorText) {
    if (
      codePoint !== "\t"
      && codePoint !== "\n"
      && codePoint !== "\r"
      && UNSAFE_VISITOR_CONTROL.test(codePoint)
    ) {
      fail("SUPPORT_KB_INSTRUCTION_LIKE_TEXT", filename, "instruction-like text is forbidden");
    }
  }

  const lintText = visitorText.normalize("NFKC");
  if (
    CYRILLIC_VISITOR_TEXT.test(lintText)
    || INSTRUCTION_LIKE_PATTERNS.some((pattern) => pattern.test(lintText))
  ) {
    fail("SUPPORT_KB_INSTRUCTION_LIKE_TEXT", filename, "instruction-like text is forbidden");
  }
}

function parseScalar(rawValue: string, filename: string, key: string): string {
  const value = rawValue.trim();
  if (value === "") return "";
  if (value.startsWith('"')) {
    if (!value.endsWith('"')) fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `${key} has an unterminated quoted value`);
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "string") fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `${key} must be a string`);
      return parsed;
    } catch (error) {
      if (error instanceof TypedDomainError) throw error;
      fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `${key} has an invalid quoted value`);
    }
  }
  if (value.startsWith("'") || value.endsWith("'")) {
    if (!(value.startsWith("'") && value.endsWith("'"))) {
      fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `${key} has an unterminated quoted value`);
    }
    return value.slice(1, -1).replace(/''/gu, "'");
  }
  return value;
}

function parseEntry(bytes: string, filename: string): HelpCorpusEntry {
  const documentMatch = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(bytes);
  if (documentMatch === null) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "expected a complete front-matter block");
  }
  const frontMatter = documentMatch[1];
  const bodySection = documentMatch[2];
  if (frontMatter === undefined || bodySection === undefined) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "could not read front matter and body");
  }

  const values = new Map<string, string | string[]>();
  const lines = frontMatter.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const keyMatch = /^([a-z_]+):[ \t]*(.*)$/u.exec(line);
    if (keyMatch === null || keyMatch[1] === undefined || keyMatch[2] === undefined) {
      fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `invalid line ${index + 1}`);
    }
    const key = keyMatch[1];
    if (!FRONT_MATTER_KEY_SET.has(key)) {
      fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `unexpected key ${key}`);
    }
    if (values.has(key)) {
      fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, `duplicate key ${key}`);
    }

    if (key === "sources") {
      if (keyMatch[2].trim() !== "") {
        fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "sources must be a block list");
      }
      const sources: string[] = [];
      while (index + 1 < lines.length) {
        const candidate = lines[index + 1];
        const sourceMatch = candidate === undefined ? null : /^  -[ \t]+(.+)$/u.exec(candidate);
        if (sourceMatch === null || sourceMatch[1] === undefined) break;
        sources.push(parseScalar(sourceMatch[1], filename, "sources"));
        index += 1;
      }
      if (sources.length === 0 || sources.some((source) => source.trim() === "")) {
        fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "sources must contain at least one nonblank source");
      }
      values.set(key, sources);
      continue;
    }

    values.set(key, parseScalar(keyMatch[2], filename, key));
  }

  if (values.size !== FRONT_MATTER_KEYS.length || FRONT_MATTER_KEYS.some((key) => !values.has(key))) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "front matter must contain exactly the eight required keys");
  }

  const id = values.get("id");
  const lang = values.get("lang");
  const title = values.get("title");
  const status = values.get("status");
  const sources = values.get("sources");
  const verifiedAgainst = values.get("verified_against");
  const ratifiedBy = values.get("ratified_by");
  const ratifiedOn = values.get("ratified_on");
  if (
    typeof id !== "string"
    || typeof lang !== "string"
    || typeof title !== "string"
    || typeof status !== "string"
    || !Array.isArray(sources)
    || typeof verifiedAgainst !== "string"
    || typeof ratifiedBy !== "string"
    || typeof ratifiedOn !== "string"
  ) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "front-matter value types are invalid");
  }
  if (!ENTRY_ID.test(id)) fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "id must be a lowercase slug");
  if (lang !== "en" && lang !== "ro") fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "lang must be en or ro");
  if (status !== "shipped" && status !== "intended") {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "status must be shipped or intended");
  }
  if (title.trim() === "" || verifiedAgainst.trim() === "") {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "title and verified_against must be nonblank");
  }
  if (ratifiedBy !== "" && ratifiedBy !== "V") {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "ratified_by must be V or blank");
  }
  if (ratifiedOn !== "" && !isIsoDate(ratifiedOn)) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "ratified_on must be an ISO date or blank");
  }
  if ((ratifiedBy === "V") !== (ratifiedOn !== "")) {
    fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "ratified_by and ratified_on must be populated together");
  }

  const body = bodySection.replace(/^\r?\n/u, "").replace(/\r?\n$/u, "");
  if (body.trim() === "") fail("SUPPORT_KB_FRONT_MATTER_INVALID", filename, "body must be nonblank");
  const visitorText = `${title}\n${body}`;
  lintVisitorText(visitorText, filename);

  return Object.freeze({
    id,
    lang,
    title,
    status,
    sources: Object.freeze([...sources]),
    verifiedAgainst,
    ratifiedBy,
    ratifiedOn,
    body,
  });
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const EMPTY_REVIEW_MANIFEST: SupportReviewManifest = Object.freeze({
  schemaVersion: 1,
  catalog: Object.freeze({
    sha256: "",
    reviewedBy: "SOL",
    reviewerSession: "",
    reviewedOn: "",
    evidence: "",
  }),
  articles: Object.freeze([]),
});

function reviewManifestError(detail: string): never {
  throw new SupportKbError("SUPPORT_KB_REVIEW_MANIFEST_INVALID", detail);
}

function parseReviewDetails(value: unknown, subject: string): SupportReviewDetails {
  if (typeof value !== "object" || value === null) reviewManifestError(`${subject} must be an object`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const allowed = subject === "catalog"
    ? ["evidence", "reviewedBy", "reviewedOn", "reviewerSession", "sha256"]
    : ["evidence", "id", "lang", "reviewedBy", "reviewedOn", "reviewerSession", "sha256"];
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    reviewManifestError(`${subject} has unexpected or missing keys`);
  }
  if (record.reviewedBy !== "SOL") reviewManifestError(`${subject}.reviewedBy must identify the Sol editorial role`);
  if (typeof record.reviewerSession !== "string" || record.reviewerSession.trim() === "") {
    reviewManifestError(`${subject}.reviewerSession must identify the actual review session`);
  }
  if (typeof record.reviewedOn !== "string" || !isIsoDate(record.reviewedOn)) {
    reviewManifestError(`${subject}.reviewedOn must be an ISO date`);
  }
  if (typeof record.evidence !== "string" || record.evidence.trim() === "") {
    reviewManifestError(`${subject}.evidence must locate durable review evidence`);
  }
  return Object.freeze({
    reviewedBy: "SOL",
    reviewerSession: record.reviewerSession,
    reviewedOn: record.reviewedOn,
    evidence: record.evidence,
  });
}

function parseReviewManifest(value: unknown): SupportReviewManifest {
  if (value === undefined) return EMPTY_REVIEW_MANIFEST;
  if (typeof value !== "object" || value === null) reviewManifestError("manifest must be an object");
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1
    || !Array.isArray(record.articles)
    || typeof record.catalog !== "object"
    || record.catalog === null
    || Object.keys(record).sort().join(",") !== "articles,catalog,schemaVersion"
  ) {
    reviewManifestError("manifest must contain exactly schemaVersion, catalog and articles");
  }
  const catalogRecord = record.catalog as Record<string, unknown>;
  const catalogDetails = parseReviewDetails(catalogRecord, "catalog");
  if (typeof catalogRecord.sha256 !== "string" || !SHA256.test(catalogRecord.sha256)) {
    reviewManifestError("catalog.sha256 must be lowercase SHA256");
  }
  const seen = new Set<string>();
  const articles = record.articles.map((value, index) => {
    const subject = `articles[${index}]`;
    const details = parseReviewDetails(value, subject);
    const article = value as Record<string, unknown>;
    if (typeof article.id !== "string" || !ENTRY_ID.test(article.id)) {
      reviewManifestError(`${subject}.id must be a lowercase slug`);
    }
    if (article.lang !== "en" && article.lang !== "ro") {
      reviewManifestError(`${subject}.lang must be en or ro`);
    }
    if (typeof article.sha256 !== "string" || !SHA256.test(article.sha256)) {
      reviewManifestError(`${subject}.sha256 must be lowercase SHA256`);
    }
    const key = `${article.id}.${article.lang}`;
    if (seen.has(key)) reviewManifestError(`${subject} duplicates ${key}`);
    seen.add(key);
    return Object.freeze({
      id: article.id,
      lang: article.lang,
      sha256: article.sha256,
      ...details,
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    catalog: Object.freeze({ sha256: catalogRecord.sha256, ...catalogDetails }),
    articles: Object.freeze(articles),
  });
}

export function loadHelpCorpus(
  directory: string,
  options: Readonly<{ reviewManifest?: unknown }> = {},
): LoadedHelpCorpus {
  const reviewManifest = parseReviewManifest(options.reviewManifest);
  const catalogDigest = sha256(SUPPORT_CATALOG_CANONICAL);
  const directoryEntries = (() => {
    try {
      return readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    } catch (error) {
      throw new SupportKbError(
        "SUPPORT_KB_DIRECTORY_UNREADABLE",
        error instanceof Error ? error.message : String(error),
      );
    }
  })();

  const parsedFiles: ParsedFile[] = directoryEntries
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((directoryEntry) => {
      if (!directoryEntry.isFile()) {
        fail("SUPPORT_KB_FRONT_MATTER_INVALID", directoryEntry.name, "corpus entries must be regular files");
      }
      const filenameMatch = ENTRY_FILENAME.exec(directoryEntry.name);
      if (filenameMatch === null || filenameMatch[1] === undefined || filenameMatch[2] === undefined) {
        fail("SUPPORT_KB_FRONT_MATTER_INVALID", directoryEntry.name, "filename must be <id>.<en|ro>.md");
      }
      const bytes = readFileSync(join(directory, directoryEntry.name));
      const text = decodeUtf8(bytes, directoryEntry.name);
      return {
        filename: directoryEntry.name,
        filenameId: filenameMatch[1],
        filenameLang: filenameMatch[2] as HelpCorpusLanguage,
        bytes,
        entry: parseEntry(text, directoryEntry.name),
      };
    });

  const byLogicalKey = new Map<string, ParsedFile>();
  for (const parsedFile of parsedFiles) {
    const logicalKey = `${parsedFile.entry.id}.${parsedFile.entry.lang}`;
    const previous = byLogicalKey.get(logicalKey);
    if (previous !== undefined) {
      fail(
        "SUPPORT_KB_DUPLICATE_ENTRY",
        parsedFile.filename,
        `duplicates ${logicalKey} from ${previous.filename}`,
      );
    }
    byLogicalKey.set(logicalKey, parsedFile);
  }

  for (const parsedFile of parsedFiles) {
    if (
      parsedFile.entry.id !== parsedFile.filenameId
      || parsedFile.entry.lang !== parsedFile.filenameLang
    ) {
      fail(
        "SUPPORT_KB_FILENAME_MISMATCH",
        parsedFile.filename,
        `front matter declares ${parsedFile.entry.id}.${parsedFile.entry.lang}`,
      );
    }
  }

  const byId = new Map<string, Map<HelpCorpusLanguage, ParsedFile>>();
  for (const parsedFile of parsedFiles) {
    const pair = byId.get(parsedFile.entry.id) ?? new Map<HelpCorpusLanguage, ParsedFile>();
    pair.set(parsedFile.entry.lang, parsedFile);
    byId.set(parsedFile.entry.id, pair);
  }

  const shippedFiles: ParsedFile[] = [];
  const selectedReviewLines: string[] = [];
  let previewReviewedCount = 0;
  let ownerRatifiedCount = 0;
  const reviewsByLogicalKey = new Map(
    reviewManifest.articles.map((review) => [`${review.id}.${review.lang}`, review]),
  );
  const catalogReviewed = reviewManifest.catalog.sha256 === catalogDigest;
  for (const id of [...byId.keys()].sort()) {
    const pair = byId.get(id);
    if (pair === undefined) continue;
    const en = pair.get("en");
    const ro = pair.get("ro");
    if (en === undefined || ro === undefined || en.entry.status !== "shipped" || ro.entry.status !== "shipped") continue;
    const ownerRatified = en.entry.ratifiedBy === "V" && ro.entry.ratifiedBy === "V";
    const enReview = reviewsByLogicalKey.get(`${id}.en`);
    const roReview = reviewsByLogicalKey.get(`${id}.ro`);
    const peerReviewed = catalogReviewed
      && enReview?.sha256 === sha256(en.bytes)
      && roReview?.sha256 === sha256(ro.bytes);
    if (!ownerRatified && !peerReviewed) continue;
    shippedFiles.push(en, ro);
    if (ownerRatified) ownerRatifiedCount += 1;
    if (peerReviewed) {
      previewReviewedCount += 1;
      for (const review of [enReview, roReview] as const) {
        if (review === undefined) continue;
        selectedReviewLines.push(
          `review:${review.id}.${review.lang}:${review.sha256}:${review.reviewedBy}:${review.reviewerSession}:${review.reviewedOn}:${review.evidence}`,
        );
      }
    } else {
      selectedReviewLines.push(
        `ratification:${id}.en:V:${en.entry.ratifiedOn}`,
        `ratification:${id}.ro:V:${ro.entry.ratifiedOn}`,
      );
    }
  }

  const manifest = [
    `catalog:${catalogDigest}`,
    ...shippedFiles.map(({ filename, bytes }) => `${filename}:${sha256(bytes)}`),
    ...selectedReviewLines,
  ].join("\n");
  const shippedCount = shippedFiles.length / LANGUAGES.length;

  return Object.freeze({
    entries: Object.freeze(shippedFiles.map(({ entry }) => entry)),
    shippedCount,
    ignoredCount: byId.size - shippedCount,
    previewReviewedCount,
    ownerRatifiedCount,
    catalogDigest,
    reviewManifest,
    manifest,
    kbVersion: sha256(manifest),
  });
}

export function createHelpCorpusSnapshotLookup(
  current: LoadedHelpCorpus,
  retained: readonly LoadedHelpCorpus[] = [],
): HelpCorpusSnapshotLookup {
  const snapshots = new Map<string, LoadedHelpCorpus>();
  for (const snapshot of [...retained, current]) snapshots.set(snapshot.kbVersion, snapshot);
  return Object.freeze({
    currentVersion: current.kbVersion,
    get(version: string): LoadedHelpCorpus | undefined {
      return snapshots.get(version);
    },
  });
}
