#!/usr/bin/env node
/**
 * Generates the two legal-document data modules the sign-up modals render from the drafts kept
 * under `apps/ui/legal/<locale>/`:
 *
 *   apps/ui/legal/en/privacy-policy.md   →  apps/ui/lib/privacyPolicy.ts
 *   apps/ui/legal/en/terms-of-service.md →  apps/ui/lib/termsOfService.ts
 *   apps/ui/legal/ja/privacy-policy.md   →  apps/ui/lib/legal/ja/privacyPolicy.ts
 *
 * Usage, from the repository root:
 *   node apps/ui/scripts/generate-legal-data.mjs --locale en
 *   node apps/ui/scripts/generate-legal-data.mjs --check --locale en --document privacy
 * With no locale flag, the command walks every supported locale and exits 1 for missing drafts.
 *
 * The converter is deliberately small and specific to how the drafts are written: `##` sections
 * numbered `1.`–`N.`, one `## Annex X — …` section whose parts are `### X.1 …`, paragraphs,
 * markdown tables (rendered as lists, cells joined with an em dash) and `- ` bullet lists.
 * Emphasis, links and autolinks are reduced to their visible text; escaped and HTML-entity
 * brackets become plain brackets, because the drafts use square brackets to mark what counsel
 * still has to fill in and the product renders those marks verbatim.
 *
 * `tests/unit/legal-documents-data.test.ts` pins that the committed modules equal this script's
 * output, so edit the draft and regenerate — never the module.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCALES } from "../lib/i18n/locales.ts";
import { buildConsentManifestEntries } from "./legal-consent-manifest.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The section accents, cycled in this order — the six tokens the design's policy modal uses. */
const ACCENT_CYCLE = ["--ok-dot", "--gold", "--reasoning", "--con", "--ink", "--muted"];

/**
 * Per-document structural invariants. Reader-visible chrome is locale-owned and parsed from
 * each draft's `legal-chrome` comment.
 */
const DOCUMENTS = {
  privacy: {
    key: "privacy",
    manifestKind: "PRIVACY",
    reacceptanceFrom: null,
    draft: "privacy-policy.md",
    module: "privacyPolicy.ts",
    englishOutput: "apps/ui/lib/privacyPolicy.ts",
    legacySourceLabel: "apps/ui/legal/privacy-policy.md",
    versionAnchor: "Version 3.0",
    numberedSections: 14,
    annexLetter: "B",
    annexParts: 11,
    contact: { constant: "privacy@dezbatere.ro" },
    sectionIdPrefix: "policy-section-",
    titleId: "policy-modal-title",
    gateHintId: "policy-modal-gate-hint",
    exports: { jumps: "POLICY_JUMP", sections: "POLICY_SECTIONS", document: "PRIVACY_POLICY" }
  },
  terms: {
    key: "terms",
    manifestKind: "TERMS",
    reacceptanceFrom: null,
    draft: "terms-of-service.md",
    module: "termsOfService.ts",
    englishOutput: "apps/ui/lib/termsOfService.ts",
    legacySourceLabel: "apps/ui/legal/terms-of-service.md",
    versionAnchor: "Version 2.0",
    numberedSections: 19,
    annexLetter: "A",
    annexParts: 11,
    // This frozen token is found in the table without depending on the translated row label.
    contact: { tableToken: "[legal@dezbatere.ro]" },
    sectionIdPrefix: "terms-section-",
    titleId: "terms-modal-title",
    gateHintId: "terms-modal-gate-hint",
    exports: { jumps: "TERMS_JUMP", sections: "TERMS_SECTIONS", document: "TERMS_OF_SERVICE" }
  }
};

/** The source→output pairs, in a fixed order, for the CLI and for the freshness test. */
export const LEGAL_DOCUMENT_SOURCES = Object.freeze(
  ["privacy", "terms"].map((key) =>
    Object.freeze({
      key,
      source: `apps/ui/legal/en/${DOCUMENTS[key].draft}`,
      output: DOCUMENTS[key].englishOutput
    })
  )
);

/** The manifest the API and the UI both read (packages/legal-manifest). */
export const LEGAL_MANIFEST_OUTPUT = "packages/legal-manifest/src/manifest.json";
const LEGAL_MANIFEST_FORMAT = "debateai.legal-manifest.v1";

/**
 * The sha256 of the draft's EXACT bytes. `markdown` is the draft decoded as UTF-8; re-encoding a
 * valid UTF-8 string reproduces its bytes exactly (a BOM included), and `main` refuses a draft that
 * is not valid UTF-8, so this is the hash of the file on disk.
 */
export function legalDraftSha256(markdown) {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

/**
 * Ruling Q-3: every Terms and Privacy text that was ever current is kept here, byte for byte, named by
 * the sha256 of its bytes. The Terms promise "Previous versions at dezbatere.ro/terms/versions", and
 * M1 attaches the version a person ACCEPTED, which may no longer be the current draft. A file is
 * written once (`wx`) and never overwritten or deleted by this script.
 */
export const LEGAL_ARCHIVE_ROOT = "apps/ui/legal/archive";

export function legalArchivePath(locale, sha256) {
  return `${LEGAL_ARCHIVE_ROOT}/${locale}/${sha256}.md`;
}

/**
 * The archive against its index: every listed file present and hashing to its own name, and no file
 * the index does not list (dotfiles such as a Finder `.DS_Store` are not texts and are skipped).
 * Returns the problems, sorted; an empty list means the two agree.
 */
export function legalArchiveProblems(repoRoot, archive) {
  const problems = [];
  const listed = new Set();
  for (const byLocale of Object.values(archive)) {
    for (const entries of Object.values(byLocale)) {
      for (const [sha256, entry] of Object.entries(entries)) {
        listed.add(entry.path);
        let bytes;
        try {
          bytes = readFileSync(resolve(repoRoot, entry.path));
        } catch {
          problems.push(`${entry.path}: MISSING`);
          continue;
        }
        if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
          problems.push(`${entry.path}: HASH MISMATCH`);
        }
      }
    }
  }
  const root = resolve(repoRoot, LEGAL_ARCHIVE_ROOT);
  const locales = existsSync(root) ? readdirSync(root, { withFileTypes: true }) : [];
  for (const locale of locales) {
    if (locale.name.startsWith(".")) continue;
    if (!locale.isDirectory()) {
      problems.push(`${LEGAL_ARCHIVE_ROOT}/${locale.name}: NOT IN THE MANIFEST`);
      continue;
    }
    for (const file of readdirSync(join(root, locale.name))) {
      if (file.startsWith(".")) continue;
      const path = `${LEGAL_ARCHIVE_ROOT}/${locale.name}/${file}`;
      if (!listed.has(path)) problems.push(`${path}: NOT IN THE MANIFEST`);
    }
  }
  return problems.sort();
}

/* ------------------------------------------------------------------------------------------ */
/* Inline markdown → plain text                                                                 */
/* ------------------------------------------------------------------------------------------ */

const ENTITIES = { "&#91;": "[", "&#93;": "]", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };

/** Reduces one run of inline markdown to the text a reader sees. */
export function inlineText(raw) {
  let text = raw;
  // Links first, while escaped brackets are still escaped: `\[` never starts a link.
  text = text.replace(/(?<!\\)\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  text = text.replace(/<([^<>\s]+@[^<>\s]+)>/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/(?<![\\*\w])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1");
  text = text.replace(/\\([\[\]_*.])/g, "$1");
  text = text.replace(/&#91;|&#93;|&amp;|&lt;|&gt;|&nbsp;/g, (entity) => ENTITIES[entity]);
  return text.replace(/\s+/g, " ").trim();
}

const CHROME_FIELDS = Object.freeze([
  "summaryTitle",
  "eyebrow",
  "title",
  "lede",
  "endMarker",
  "bodyLabel",
  "annexTitle"
]);

/** Parses and removes the one locale-owned chrome comment before markdown block parsing. */
export function parseLegalChrome(markdown) {
  const matches = [...markdown.matchAll(/<!-- legal-chrome\r?\n([\s\S]*?)\r?\n-->/g)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one \`<!-- legal-chrome … -->\` comment, found ${matches.length}`);
  }
  const fields = {};
  const jumps = [];
  let readingJumps = false;
  for (const rawLine of matches[0][1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === "jumps:") {
      readingJumps = true;
      continue;
    }
    if (readingJumps) {
      const jump = /^(\d{2})\s+(.+)$/.exec(line);
      if (jump === null) throw new Error(`Unrecognised legal-chrome jump: ${rawLine}`);
      jumps.push({ no: jump[1], label: jump[2] });
      continue;
    }
    const field = /^([A-Za-z]+):\s+(.+)$/.exec(line);
    if (field === null || !CHROME_FIELDS.includes(field[1])) {
      throw new Error(`Unrecognised legal-chrome field: ${rawLine}`);
    }
    if (fields[field[1]] !== undefined) throw new Error(`Duplicate legal-chrome field: ${field[1]}`);
    fields[field[1]] = field[2];
  }
  for (const field of CHROME_FIELDS) {
    if (fields[field] === undefined) throw new Error(`Missing legal-chrome field: ${field}`);
  }
  if (jumps.length === 0) throw new Error("Missing legal-chrome jumps");
  return {
    chrome: Object.freeze({ ...fields, jumps: Object.freeze(jumps) }),
    markdown: markdown.slice(0, matches[0].index) + markdown.slice(matches[0].index + matches[0][0].length)
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Block structure                                                                             */
/* ------------------------------------------------------------------------------------------ */

const isTableLine = (line) => line.trimStart().startsWith("|");
const isListLine = (line) => /^\s*-\s+/.test(line);
const isHeadingLine = (line) => /^#{1,3}\s/.test(line);
const isSeparatorRow = (cells) => cells.every((cell) => /^:?-{3,}:?$/.test(cell));

function tableCells(line) {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

/**
 * Splits the lines of one section (or the preamble) into blocks in document order. A table
 * becomes ONE list block: its header row and separator are dropped and every other row is its
 * non-empty cells joined with an em dash.
 */
export function parseBlocks(lines) {
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (isTableLine(line)) {
      const rows = [];
      let header = true;
      while (index < lines.length && isTableLine(lines[index])) {
        const cells = tableCells(lines[index]);
        index += 1;
        if (isSeparatorRow(cells)) continue;
        if (header) {
          header = false;
          continue;
        }
        const item = cells.map(inlineText).filter((cell) => cell.length > 0).join(" — ");
        if (item.length > 0) rows.push(item);
      }
      blocks.push({ kind: "list", items: rows });
      continue;
    }
    if (isListLine(line)) {
      const items = [];
      while (index < lines.length && isListLine(lines[index])) {
        items.push(inlineText(lines[index].replace(/^\s*-\s+/, "")));
        index += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !isTableLine(lines[index]) &&
      !isListLine(lines[index]) &&
      !isHeadingLine(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length === 0) {
      // A heading line inside a section body cannot happen (headings split sections), but a
      // stray one must not loop forever.
      index += 1;
      continue;
    }
    blocks.push({ kind: "p", text: inlineText(paragraph.join(" ")) });
  }
  return blocks;
}

/**
 * Splits the draft into its preamble lines and its sections. `## N. Title` → `no: "0N"`,
 * `## Annex X — Title` → `no: "X"`, `### X.N Title` → `no: "X.N"`.
 */
export function parseSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const preamble = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      const heading = inlineText(h3[1]);
      const part = /^([A-Z]\.\d+)\s+(.*)$/.exec(heading);
      if (part === null) throw new Error(`Unrecognised annex part heading: ${line}`);
      current = { no: part[1], title: part[2], lines: [] };
      sections.push(current);
      continue;
    }
    if (h2) {
      const heading = inlineText(h2[1]);
      const numbered = /^(\d+)\.\s+(.*)$/.exec(heading);
      const annex = /^Annex\s+([A-Z])\s+—\s+.*$/.exec(heading);
      if (numbered) {
        current = { no: numbered[1].padStart(2, "0"), title: numbered[2], lines: [] };
      } else if (annex) {
        current = { no: annex[1], title: heading, lines: [] };
      } else {
        throw new Error(`Unrecognised section heading: ${line}`);
      }
      sections.push(current);
      continue;
    }
    if (line.startsWith("# ")) continue;
    if (current === null) preamble.push(line);
    else current.lines.push(line);
  }
  return { preamble, sections };
}

/**
 * The preamble carries the version line and the summary. Both are bold single-paragraph lines in
 * the drafts: `**Version 2.0 · Effective [date] · …**` and `**In short.** …`.
 */
export function parsePreamble(preambleLines) {
  const paragraphs = parseBlocks(preambleLines)
    .filter((block) => block.kind === "p")
    .map((block) => block.text);
  const versionLine = paragraphs.find((text) => text.startsWith("Version "));
  const summary = paragraphs.find((text) => text.startsWith("In short."));
  if (versionLine === undefined) throw new Error("No `Version …` line in the preamble");
  if (summary === undefined) throw new Error("No `In short.` paragraph in the preamble");
  const version = /^Version\s+(\d+\.\d+)/.exec(versionLine)?.[1];
  const effective = /Effective\s+([^·]+?)\s*(?:·|$)/.exec(versionLine)?.[1];
  if (version === undefined || effective === undefined) {
    throw new Error(`Unparseable version line: ${versionLine}`);
  }
  return { version, effective, summary: summary.replace(/^In short\.\s*/, "") };
}

/* ------------------------------------------------------------------------------------------ */
/* Document assembly                                                                           */
/* ------------------------------------------------------------------------------------------ */

function contactFor(config, sections) {
  if (config.contact.constant !== undefined) return config.contact.constant;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind !== "list") continue;
      if (block.items.some((item) => item.includes(config.contact.tableToken))) {
        return config.contact.tableToken;
      }
    }
  }
  throw new Error(`No table row contains ${JSON.stringify(config.contact.tableToken)}`);
}

function validateFrozenAnchors(markdown, config) {
  const lines = markdown.split(/\r?\n/);
  const { preamble } = parseSections(markdown);
  const paragraphs = parseBlocks(preamble)
    .filter((block) => block.kind === "p")
    .map((block) => block.text);
  const versionLine = paragraphs.find((text) => text.startsWith(config.versionAnchor));
  if (versionLine === undefined || !versionLine.includes("Effective [date]")) {
    throw new Error(`Frozen version anchor must start \`${config.versionAnchor}\` and contain \`Effective [date]\``);
  }
  if (!paragraphs.some((text) => text.startsWith("In short."))) {
    throw new Error("Frozen summary anchor must start `In short.`");
  }

  const numbered = lines.flatMap((line) => {
    const match = /^##\s+(\d+)\.\s+/.exec(line);
    return match === null ? [] : [match[1]];
  });
  const expectedNumbered = Array.from(
    { length: config.numberedSections },
    (_, index) => String(index + 1)
  );
  if (JSON.stringify(numbered) !== JSON.stringify(expectedNumbered)) {
    throw new Error(`Frozen numbered headings must be 1–${config.numberedSections} in order`);
  }

  const annexPrefix = `## Annex ${config.annexLetter} —`;
  if (lines.filter((line) => line.startsWith(annexPrefix)).length !== 1) {
    throw new Error(`Frozen annex heading must start \`${annexPrefix}\``);
  }
  const annexParts = lines.flatMap((line) => {
    const match = new RegExp(`^###\\s+(${config.annexLetter}\\.\\d+)\\s+`).exec(line);
    return match === null ? [] : [match[1]];
  });
  const expectedParts = Array.from({ length: config.annexParts }, (_, index) => `${config.annexLetter}.${index + 1}`);
  if (JSON.stringify(annexParts) !== JSON.stringify(expectedParts)) {
    throw new Error(`Frozen annex parts must be ${config.annexLetter}.1–${config.annexLetter}.${config.annexParts} in order`);
  }
}

/** Builds the document object for one draft. */
export function buildLegalDocument(markdown, key) {
  const config = DOCUMENTS[key];
  if (config === undefined) throw new Error(`Unknown legal document key: ${key}`);
  const parsedChrome = parseLegalChrome(markdown);
  validateFrozenAnchors(parsedChrome.markdown, config);
  const { preamble, sections: rawSections } = parseSections(parsedChrome.markdown);
  const { summary, version } = parsePreamble(preamble);
  const chrome = parsedChrome.chrome;

  const withSummary = [
    { no: "00", title: chrome.summaryTitle, blocks: [{ kind: "p", text: summary }] },
    ...rawSections.map((section) => ({
      no: section.no,
      title: section.no === config.annexLetter ? chrome.annexTitle : section.title,
      blocks: parseBlocks(section.lines)
    }))
  ];
  const sections = withSummary.map((section, index) => ({
    no: section.no,
    title: section.title,
    accent: ACCENT_CYCLE[index % ACCENT_CYCLE.length],
    blocks: section.blocks
  }));

  const jumps = chrome.jumps.map(({ label, no }) => {
    if (!sections.some((section) => section.no === no)) {
      throw new Error(`Jump ${label} points at a section ${no} that does not exist`);
    }
    return { label, target: `${config.sectionIdPrefix}${no}` };
  });

  return {
    key: config.key,
    version,
    sha256: legalDraftSha256(markdown),
    eyebrow: chrome.eyebrow,
    title: chrome.title,
    lede: chrome.lede,
    endMarker: chrome.endMarker,
    contact: contactFor(config, sections),
    bodyLabel: chrome.bodyLabel,
    sectionIdPrefix: config.sectionIdPrefix,
    titleId: config.titleId,
    gateHintId: config.gateHintId,
    jumps,
    sections
  };
}

/* ------------------------------------------------------------------------------------------ */
/* TypeScript emission                                                                         */
/* ------------------------------------------------------------------------------------------ */

const str = (value) => JSON.stringify(value);

function renderBlock(block) {
  if (block.kind === "p") return `      { kind: "p", text: ${str(block.text)} }`;
  const items = block.items.map((item) => `        ${str(item)}`).join(",\n");
  return `      {\n        kind: "list",\n        items: [\n${items}\n        ]\n      }`;
}

function renderSection(section) {
  const blocks = section.blocks.map(renderBlock).join(",\n");
  return [
    "  {",
    `    no: ${str(section.no)},`,
    `    title: ${str(section.title)},`,
    `    accent: ${str(section.accent)},`,
    "    blocks: [",
    blocks,
    "    ]",
    "  }"
  ].join("\n");
}

function sourceFor(locale, config) {
  return `apps/ui/legal/${locale}/${config.draft}`;
}

function outputFor(locale, config) {
  return locale === "en"
    ? config.englishOutput
    : `apps/ui/lib/legal/${locale}/${config.module}`;
}

/** Renders the TypeScript module for one draft. Deterministic: same draft, locale and key, same bytes. */
export function renderLegalModule(markdown, key, locale = "en") {
  const config = DOCUMENTS[key];
  if (config === undefined) throw new Error(`Unknown legal document key: ${key}`);
  const document = buildLegalDocument(markdown, key);
  const { jumps, sections, document: documentName } = config.exports;
  const sourceLabel = locale === "en" ? config.legacySourceLabel : sourceFor(locale, config);
  const legalDocumentImport = locale === "en" ? "./legalDocument.js" : "../../legalDocument.js";
  const jumpLines = document.jumps
    .map((jump) => `  { label: ${str(jump.label)}, target: ${str(jump.target)} }`)
    .join(",\n");
  const sectionLines = document.sections.map(renderSection).join(",\n");
  return [
    "/**",
    ` * GENERATED by \`apps/ui/scripts/generate-legal-data.mjs\` from \`${sourceLabel}\`.`,
    " * Do not edit by hand: edit the draft and run `pnpm generate:legal`.",
    " *",
    " * The document as DATA. The modal that shows it renders from this module and holds no legal",
    " * prose of its own. Square brackets are the draft's own marks for what counsel still has to",
    " * fill in; they are rendered verbatim so the product never claims a fact the draft does not.",
    " */",
    "",
    `import type { LegalDocument, LegalJump, LegalSection } from ${str(legalDocumentImport)};`,
    "",
    `export const ${jumps}: readonly LegalJump[] = [`,
    jumpLines,
    "];",
    "",
    `export const ${sections}: readonly LegalSection[] = [`,
    sectionLines,
    "];",
    "",
    `export const ${documentName}: LegalDocument = {`,
    `  key: ${str(document.key)},`,
    `  version: ${str(document.version)},`,
    `  sha256: ${str(document.sha256)},`,
    `  eyebrow: ${str(document.eyebrow)},`,
    `  title: ${str(document.title)},`,
    `  lede: ${str(document.lede)},`,
    `  endMarker: ${str(document.endMarker)},`,
    `  contact: ${str(document.contact)},`,
    `  bodyLabel: ${str(document.bodyLabel)},`,
    `  sectionIdPrefix: ${str(document.sectionIdPrefix)},`,
    `  titleId: ${str(document.titleId)},`,
    `  gateHintId: ${str(document.gateHintId)},`,
    `  jumps: ${jumps},`,
    `  sections: ${sections}`,
    "};",
    ""
  ].join("\n");
}

/** The two consent kinds the checkout records (R-27); their pairs come from legal-consent-manifest.mjs. */
const CONSENT_MANIFEST_KINDS = Object.freeze(["CONSENT_IMMEDIATE_START", "CONSENT_RENEWAL"]);

const ARCHIVE_VERSION = /^[0-9]{1,4}\.[0-9]{1,4}$/;
const ARCHIVE_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Ruling Q-3: the committed archive index (`archiveHistory`, the `archive` member of the manifest
 * already on disk; `{}` on the very first run) plus every current draft. An entry is never dropped.
 * A history entry of an unknown kind or locale, a malformed hash or version, a path that is not its
 * own, or a hash that the current draft carries with another version refuses the whole run
 * (LEGAL_MANIFEST_ARCHIVE_INVALID), so a damaged index is never silently rewritten.
 */
function mergeArchive(archiveHistory, currentByKind) {
  if (archiveHistory === null || typeof archiveHistory !== "object" || Array.isArray(archiveHistory)) {
    throw new Error("LEGAL_MANIFEST_ARCHIVE_INVALID");
  }
  const localeCodes = new Set(LOCALES.map(({ code }) => code));
  const archive = { PRIVACY: {}, TERMS: {} };
  for (const [kind, byLocale] of Object.entries(archiveHistory)) {
    if (!Object.hasOwn(archive, kind) || byLocale === null || typeof byLocale !== "object") {
      throw new Error("LEGAL_MANIFEST_ARCHIVE_INVALID");
    }
    for (const [locale, entries] of Object.entries(byLocale)) {
      if (!localeCodes.has(locale) || entries === null || typeof entries !== "object") {
        throw new Error("LEGAL_MANIFEST_ARCHIVE_INVALID");
      }
      for (const [sha256, entry] of Object.entries(entries)) {
        if (!ARCHIVE_SHA256.test(sha256) || typeof entry?.version !== "string" || !ARCHIVE_VERSION.test(entry.version)
          || entry.path !== legalArchivePath(locale, sha256)) {
          throw new Error("LEGAL_MANIFEST_ARCHIVE_INVALID");
        }
        archive[kind][locale] = { ...(archive[kind][locale] ?? {}), [sha256]: { version: entry.version, path: entry.path } };
      }
    }
  }
  for (const [kind, byLocale] of Object.entries(currentByKind)) {
    for (const [locale, pair] of Object.entries(byLocale)) {
      const known = archive[kind][locale]?.[pair.sha256];
      if (known !== undefined && known.version !== pair.version) throw new Error("LEGAL_MANIFEST_ARCHIVE_INVALID");
      archive[kind][locale] = {
        ...(archive[kind][locale] ?? {}),
        [pair.sha256]: { version: pair.version, path: legalArchivePath(locale, pair.sha256) }
      };
    }
  }
  return archive;
}

/**
 * Every locale x both documents -> { version, sha256 }, plus each document's re-acceptance floor,
 * plus the checkout consent pairs of the locales that have them (`consentEntries`, the shape
 * `buildConsentManifestEntries` returns: locale -> { CONSENT_RENEWAL, CONSENT_IMMEDIATE_START }),
 * plus the archive index (`archiveHistory` carried forward, every current draft added — Q-3).
 * `readDraft(locale, kind)` returns the draft's text; a missing or invalid draft throws, so the
 * manifest is either whole or not written. A kind with no entry at all is left out of `documents`
 * (the package reads it as empty). Keys are sorted, so the output is deterministic.
 */
export function buildLegalManifest(readDraft, consentEntries = {}, archiveHistory = {}) {
  const documents = {};
  const reacceptance = {};
  for (const key of ["privacy", "terms"]) {
    const config = DOCUMENTS[key];
    reacceptance[config.manifestKind] = config.reacceptanceFrom;
    const byLocale = {};
    for (const code of LOCALES.map(({ code: locale }) => locale).sort()) {
      const markdown = readDraft(code, config.manifestKind);
      const document = buildLegalDocument(markdown, key);
      byLocale[code] = { version: document.version, sha256: document.sha256 };
    }
    documents[config.manifestKind] = byLocale;
  }
  const archive = mergeArchive(archiveHistory, { PRIVACY: documents.PRIVACY, TERMS: documents.TERMS });
  const localeCodes = new Set(LOCALES.map(({ code }) => code));
  for (const [locale, entries] of Object.entries(consentEntries)) {
    if (!localeCodes.has(locale) || entries === null || typeof entries !== "object") {
      throw new Error("LEGAL_MANIFEST_CONSENT_ENTRY_INVALID");
    }
    for (const [kind, pair] of Object.entries(entries)) {
      if (!CONSENT_MANIFEST_KINDS.includes(kind) || typeof pair?.version !== "string" || typeof pair?.sha256 !== "string") {
        throw new Error("LEGAL_MANIFEST_CONSENT_ENTRY_INVALID");
      }
      documents[kind] = { ...(documents[kind] ?? {}), [locale]: { version: pair.version, sha256: pair.sha256 } };
    }
  }
  const sortedKeys = (value) => Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]]));
  return {
    format: LEGAL_MANIFEST_FORMAT,
    reacceptance: sortedKeys(reacceptance),
    documents: Object.fromEntries(Object.keys(documents).sort().map((kind) => [kind, sortedKeys(documents[kind])])),
    archive: Object.fromEntries(Object.keys(archive).sort().map((kind) => [
      kind,
      Object.fromEntries(Object.keys(archive[kind]).sort().map((locale) => [locale, sortedKeys(archive[kind][locale])]))
    ]))
  };
}

export function renderLegalManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/* ------------------------------------------------------------------------------------------ */
/* CLI                                                                                        */
/* ------------------------------------------------------------------------------------------ */

function parseArguments(argv) {
  let check = false;
  const locales = [];
  const documents = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--locale") {
      const locale = argv[index + 1];
      if (locale === undefined) throw new Error("--locale requires a code");
      locales.push(locale);
      index += 1;
      continue;
    }
    if (argument === "--document") {
      const document = argv[index + 1];
      if (document === undefined) throw new Error("--document requires privacy or terms");
      documents.push(document);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  const localeCodes = new Set(LOCALES.map(({ code }) => code));
  for (const locale of locales) {
    if (!localeCodes.has(locale)) throw new Error(`Unknown locale: ${locale}`);
  }
  for (const document of documents) {
    if (DOCUMENTS[document] === undefined) throw new Error(`Unknown legal document: ${document}`);
  }
  return {
    check,
    locales: locales.length === 0 ? LOCALES.map(({ code }) => code) : [...new Set(locales)],
    documents: documents.length === 0 ? ["privacy", "terms"] : [...new Set(documents)]
  };
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  let stale = 0;
  for (const locale of options.locales) {
    for (const key of options.documents) {
      const config = DOCUMENTS[key];
      const source = sourceFor(locale, config);
      const output = outputFor(locale, config);
      let markdown;
      try {
        const bytes = readFileSync(resolve(REPO_ROOT, source));
        markdown = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        stale += 1;
        process.stderr.write(`${source}: MISSING OR NOT UTF-8\n`);
        continue;
      }
      let rendered;
      try {
        rendered = renderLegalModule(markdown, key, locale);
      } catch (error) {
        stale += 1;
        process.stderr.write(
          `${source}: INVALID (${error instanceof Error ? error.message : String(error)})\n`
        );
        continue;
      }
      const outputPath = resolve(REPO_ROOT, output);
      let current = null;
      try {
        current = readFileSync(outputPath, "utf8");
      } catch {
        current = null;
      }
      if (current === rendered) {
        process.stdout.write(`${output}: up to date\n`);
        continue;
      }
      if (options.check) {
        stale += 1;
        process.stdout.write(
          `${output}: STALE (regenerate with node apps/ui/scripts/generate-legal-data.mjs --locale ${locale} --document ${key})\n`
        );
        continue;
      }
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, rendered);
      process.stdout.write(`${output}: written\n`);
    }
  }
  const manifestPath = resolve(REPO_ROOT, LEGAL_MANIFEST_OUTPUT);
  let currentManifest = null;
  try {
    currentManifest = readFileSync(manifestPath, "utf8");
  } catch {
    currentManifest = null;
  }
  let manifest = null;
  try {
    // Q-3: the history of every text that was ever current. A manifest that exists but does not parse
    // stops the run (JSON.parse throws), so a damaged file never erases what people accepted.
    const archiveHistory = currentManifest === null ? {} : JSON.parse(currentManifest).archive;
    // R-27: absent billing.json, or billing.json without the two sentences, contributes nothing.
    const consentEntries = buildConsentManifestEntries({
      messagesRoot: resolve(REPO_ROOT, "apps/ui/messages"),
      locales: LOCALES.map(({ code }) => code)
    });
    manifest = buildLegalManifest((locale, kind) => {
      const draft = kind === "TERMS" ? DOCUMENTS.terms.draft : DOCUMENTS.privacy.draft;
      const bytes = readFileSync(resolve(REPO_ROOT, "apps/ui/legal", locale, draft));
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }, consentEntries, archiveHistory);
  } catch (error) {
    stale += 1;
    process.stderr.write(`${LEGAL_MANIFEST_OUTPUT}: INVALID (${error instanceof Error ? error.message : String(error)})\n`);
  }
  let manifestText = null;
  if (manifest !== null) {
    if (!options.check) {
      // Q-3: copy each current draft into the archive under the hash of its bytes. `wx` never
      // overwrites: a file already there is left as it is, and the check below proves its bytes.
      for (const code of LOCALES.map(({ code: locale }) => locale)) {
        for (const key of ["privacy", "terms"]) {
          const bytes = readFileSync(resolve(REPO_ROOT, sourceFor(code, DOCUMENTS[key])));
          const target = legalArchivePath(code, createHash("sha256").update(bytes).digest("hex"));
          if (existsSync(resolve(REPO_ROOT, target))) continue;
          mkdirSync(dirname(resolve(REPO_ROOT, target)), { recursive: true });
          writeFileSync(resolve(REPO_ROOT, target), bytes, { flag: "wx" });
          process.stdout.write(`${target}: archived\n`);
        }
      }
    }
    const problems = legalArchiveProblems(REPO_ROOT, manifest.archive);
    for (const problem of problems) process.stdout.write(`${problem}\n`);
    stale += problems.length;
    if (problems.length === 0) {
      process.stdout.write(`${LEGAL_ARCHIVE_ROOT}: up to date\n`);
      // The index is written only over an archive that matches it.
      manifestText = renderLegalManifest(manifest);
    }
  }
  if (manifestText !== null) {
    if (currentManifest === manifestText) {
      process.stdout.write(`${LEGAL_MANIFEST_OUTPUT}: up to date\n`);
    } else if (options.check) {
      stale += 1;
      process.stdout.write(`${LEGAL_MANIFEST_OUTPUT}: STALE (regenerate with pnpm generate:legal)\n`);
    } else {
      mkdirSync(dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, manifestText);
      process.stdout.write(`${LEGAL_MANIFEST_OUTPUT}: written\n`);
    }
  }
  process.exitCode = stale > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
