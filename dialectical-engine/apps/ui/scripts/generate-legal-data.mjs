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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCALES } from "../lib/i18n/locales.ts";

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
    draft: "privacy-policy.md",
    module: "privacyPolicy.ts",
    englishOutput: "apps/ui/lib/privacyPolicy.ts",
    legacySourceLabel: "apps/ui/legal/privacy-policy.md",
    versionAnchor: "Version 3.0",
    numberedSections: 14,
    annexLetter: "B",
    contact: { constant: "privacy@dezbatere.ro" },
    sectionIdPrefix: "policy-section-",
    titleId: "policy-modal-title",
    gateHintId: "policy-modal-gate-hint",
    exports: { jumps: "POLICY_JUMP", sections: "POLICY_SECTIONS", document: "PRIVACY_POLICY" }
  },
  terms: {
    key: "terms",
    draft: "terms-of-service.md",
    module: "termsOfService.ts",
    englishOutput: "apps/ui/lib/termsOfService.ts",
    legacySourceLabel: "apps/ui/legal/terms-of-service.md",
    versionAnchor: "Version 2.0",
    numberedSections: 19,
    annexLetter: "A",
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
  const expectedParts = Array.from({ length: 9 }, (_, index) => `${config.annexLetter}.${index + 1}`);
  if (JSON.stringify(annexParts) !== JSON.stringify(expectedParts)) {
    throw new Error(`Frozen annex parts must be ${config.annexLetter}.1–${config.annexLetter}.9 in order`);
  }
}

/** Builds the document object for one draft. */
export function buildLegalDocument(markdown, key) {
  const config = DOCUMENTS[key];
  if (config === undefined) throw new Error(`Unknown legal document key: ${key}`);
  const parsedChrome = parseLegalChrome(markdown);
  validateFrozenAnchors(parsedChrome.markdown, config);
  const { preamble, sections: rawSections } = parseSections(parsedChrome.markdown);
  const { summary } = parsePreamble(preamble);
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
        markdown = readFileSync(resolve(REPO_ROOT, source), "utf8");
      } catch {
        stale += 1;
        process.stderr.write(`${source}: MISSING\n`);
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
  process.exitCode = stale > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
