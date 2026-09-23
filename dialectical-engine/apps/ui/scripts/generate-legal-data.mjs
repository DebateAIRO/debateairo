#!/usr/bin/env node
/**
 * Generates the two legal-document data modules the sign-up modals render from the drafts kept
 * under `apps/ui/legal/`:
 *
 *   apps/ui/legal/privacy-policy.md   →  apps/ui/lib/privacyPolicy.ts
 *   apps/ui/legal/terms-of-service.md →  apps/ui/lib/termsOfService.ts
 *
 * Usage, from the repository root:
 *   node apps/ui/scripts/generate-legal-data.mjs          # rewrite both modules
 *   node apps/ui/scripts/generate-legal-data.mjs --check  # exit 1 if either module is stale
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

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The section accents, cycled in this order — the six tokens the design's policy modal uses. */
const ACCENT_CYCLE = ["--ok-dot", "--gold", "--reasoning", "--con", "--ink", "--muted"];

const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
  "Nineteen", "Twenty", "Twenty-one", "Twenty-two", "Twenty-three", "Twenty-four",
  "Twenty-five", "Twenty-six", "Twenty-seven", "Twenty-eight", "Twenty-nine", "Thirty"
];

/**
 * Per-document configuration: everything that is chrome or naming rather than draft content.
 * The eyebrow, the section count in the lede and the end marker are derived from the draft's
 * own version line, so a new draft version needs no edit here.
 */
const DOCUMENTS = {
  privacy: {
    key: "privacy",
    source: "apps/ui/legal/privacy-policy.md",
    output: "apps/ui/lib/privacyPolicy.ts",
    eyebrowPrefix: "PRIVACY POLICY",
    title: "What we store, and why",
    ledeLead: "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language.",
    endMarker: (version) => `END OF POLICY · GDPR (EU) 2016/679 · v${version}`,
    contact: { constant: "privacy@dezbatere.ro" },
    bodyLabel: "Privacy Policy text",
    sectionIdPrefix: "policy-section-",
    titleId: "policy-modal-title",
    gateHintId: "policy-modal-gate-hint",
    exports: { jumps: "POLICY_JUMP", sections: "POLICY_SECTIONS", document: "PRIVACY_POLICY" },
    jumps: [
      ["CONTROLLER", "01"],
      ["WHAT WE COLLECT", "02"],
      ["LAWFUL BASIS", "04"],
      ["MODELS & TRANSFERS", "05"],
      ["PUBLISHING", "06"],
      ["RETENTION", "07"],
      ["YOUR GDPR RIGHTS", "10"],
      ["COOKIES", "13"]
    ]
  },
  terms: {
    key: "terms",
    source: "apps/ui/legal/terms-of-service.md",
    output: "apps/ui/lib/termsOfService.ts",
    eyebrowPrefix: "TERMS OF SERVICE",
    title: "What you agree to",
    ledeLead: "The contract between you and DebateAIRO S.R.L., in plain language.",
    endMarker: (version) => `END OF TERMS · v${version}`,
    // Read off the draft's own contact table, so the footer follows the draft when counsel
    // fills the bracket in.
    contact: { fromTableRow: "Legal notices" },
    bodyLabel: "Terms of Service text",
    sectionIdPrefix: "terms-section-",
    titleId: "terms-modal-title",
    gateHintId: "terms-modal-gate-hint",
    exports: { jumps: "TERMS_JUMP", sections: "TERMS_SECTIONS", document: "TERMS_OF_SERVICE" },
    jumps: [
      ["WHO WE ARE", "01"],
      ["ACCEPTING", "03"],
      ["WHAT IT IS", "05"],
      ["YOUR ACCOUNT", "06"],
      ["ACCEPTABLE USE", "07"],
      ["YOUR CONTENT", "08"],
      ["PUBLISHING", "09"],
      ["REPORTING", "10"],
      ["LIABILITY", "15"],
      ["GOVERNING LAW", "18"]
    ]
  }
};

/** The source→output pairs, in a fixed order, for the CLI and for the freshness test. */
export const LEGAL_DOCUMENT_SOURCES = Object.freeze(
  ["privacy", "terms"].map((key) =>
    Object.freeze({ key, source: DOCUMENTS[key].source, output: DOCUMENTS[key].output })
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
  const label = `${config.contact.fromTableRow} — `;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind !== "list") continue;
      const row = block.items.find((item) => item.startsWith(label));
      if (row !== undefined) return row.slice(label.length);
    }
  }
  throw new Error(`No table row labelled ${JSON.stringify(config.contact.fromTableRow)}`);
}

/** Builds the document object for one draft. */
export function buildLegalDocument(markdown, key) {
  const config = DOCUMENTS[key];
  if (config === undefined) throw new Error(`Unknown legal document key: ${key}`);
  const { preamble, sections: rawSections } = parseSections(markdown);
  const { version, effective, summary } = parsePreamble(preamble);

  const numbered = rawSections.filter((section) => /^\d+$/.test(section.no)).length;
  const annexLetter = rawSections.find((section) => /^[A-Z]$/.test(section.no))?.no;
  if (annexLetter === undefined) throw new Error("The draft has no `## Annex X — …` section");

  const withSummary = [
    { no: "00", title: "In short", blocks: [{ kind: "p", text: summary }] },
    ...rawSections.map((section) => ({
      no: section.no,
      title: section.title,
      blocks: parseBlocks(section.lines)
    }))
  ];
  const sections = withSummary.map((section, index) => ({
    no: section.no,
    title: section.title,
    accent: ACCENT_CYCLE[index % ACCENT_CYCLE.length],
    blocks: section.blocks
  }));

  const jumps = config.jumps.map(([label, no]) => {
    if (!sections.some((section) => section.no === no)) {
      throw new Error(`Jump ${label} points at a section ${no} that does not exist`);
    }
    return { label, target: `${config.sectionIdPrefix}${no}` };
  });

  const countWord = NUMBER_WORDS[numbered];
  if (countWord === undefined) throw new Error(`No number word for ${numbered} sections`);

  return {
    key: config.key,
    eyebrow: `${config.eyebrowPrefix} · v${version} · EFFECTIVE ${effective.toUpperCase()}`,
    title: config.title,
    lede: `${config.ledeLead} ${countWord} sections and Annex ${annexLetter} — scroll to the end.`,
    endMarker: config.endMarker(version),
    contact: contactFor(config, sections),
    bodyLabel: config.bodyLabel,
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

/** Renders the TypeScript module for one draft. Deterministic: same draft, same bytes. */
export function renderLegalModule(markdown, key) {
  const config = DOCUMENTS[key];
  if (config === undefined) throw new Error(`Unknown legal document key: ${key}`);
  const document = buildLegalDocument(markdown, key);
  const { jumps, sections, document: documentName } = config.exports;
  const jumpLines = document.jumps
    .map((jump) => `  { label: ${str(jump.label)}, target: ${str(jump.target)} }`)
    .join(",\n");
  const sectionLines = document.sections.map(renderSection).join(",\n");
  return [
    "/**",
    ` * GENERATED by \`apps/ui/scripts/generate-legal-data.mjs\` from \`${config.source}\`.`,
    " * Do not edit by hand: edit the draft and run `pnpm generate:legal`.",
    " *",
    " * The document as DATA. The modal that shows it renders from this module and holds no legal",
    " * prose of its own. Square brackets are the draft's own marks for what counsel still has to",
    " * fill in; they are rendered verbatim so the product never claims a fact the draft does not.",
    " */",
    "",
    'import type { LegalDocument, LegalJump, LegalSection } from "./legalDocument.js";',
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

function main(argv) {
  const check = argv.includes("--check");
  let stale = 0;
  for (const entry of LEGAL_DOCUMENT_SOURCES) {
    const markdown = readFileSync(resolve(REPO_ROOT, entry.source), "utf8");
    const rendered = renderLegalModule(markdown, entry.key);
    const outputPath = resolve(REPO_ROOT, entry.output);
    let current = null;
    try {
      current = readFileSync(outputPath, "utf8");
    } catch {
      current = null;
    }
    if (current === rendered) {
      process.stdout.write(`${entry.output}: up to date\n`);
      continue;
    }
    if (check) {
      stale += 1;
      process.stdout.write(`${entry.output}: STALE (regenerate with node apps/ui/scripts/generate-legal-data.mjs)\n`);
      continue;
    }
    writeFileSync(outputPath, rendered);
    process.stdout.write(`${entry.output}: written\n`);
  }
  process.exitCode = stale > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
