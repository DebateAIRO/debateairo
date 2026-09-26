#!/usr/bin/env node

import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCALES } from "../lib/i18n/locales.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const DOCUMENTS = Object.freeze({
  privacy: Object.freeze({ module: "privacyPolicy.ts", exportName: "PRIVACY_POLICY" }),
  terms: Object.freeze({ module: "termsOfService.ts", exportName: "TERMS_OF_SERVICE" })
});

const FIXED_TOKENS = Object.freeze([
  "ico.org.uk",
  "Art. ",
  "DebateAIRO S.R.L.",
  "ANSPDCP",
  "GDPR (EU) 2016/679",
  "de_session",
  "de_mfa",
  "de_device",
  "de_quality",
  "de_analytics",
  "DebateAIRO SRL",
  "dezbatere.ro/subprocessors"
]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DEZBATERE_PATH = /\bdezbatere\.ro\/[A-Za-z0-9._~/%…-]+/g;

function allStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, strings));
  else if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item) => allStrings(item, strings));
  }
  return strings;
}

function occurrences(text, token) {
  let count = 0;
  let offset = 0;
  while (true) {
    const found = text.indexOf(token, offset);
    if (found === -1) return count;
    count += 1;
    offset = found + token.length;
  }
}

/** Returns top-level balanced bracket spans, retaining any nested brackets inside each span. */
export function bracketSpans(text) {
  const spans = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "[") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (text[index] === "]") {
      depth -= 1;
      if (depth < 0) throw new Error(`Unbalanced closing bracket in ${JSON.stringify(text)}`);
      if (depth === 0) spans.push(text.slice(start, index + 1));
    }
  }
  if (depth !== 0) throw new Error(`Unbalanced opening bracket in ${JSON.stringify(text)}`);
  return spans;
}

function bracketMultiset(document) {
  return allStrings(document).flatMap(bracketSpans).sort();
}

function protectedTokenMultiset(document) {
  const strings = allStrings(document);
  const tokens = [];
  for (const text of strings) {
    tokens.push(...(text.match(EMAIL) ?? []));
    tokens.push(...(text.match(DEZBATERE_PATH) ?? []));
    for (const token of FIXED_TOKENS) {
      for (let count = occurrences(text, token); count > 0; count -= 1) tokens.push(token);
    }
  }
  return tokens.sort();
}

function blockKinds(section) {
  return section.blocks.map((block) => block.kind);
}

function listLengths(section) {
  return section.blocks.map((block) => block.kind === "list" ? block.items.length : null);
}

function sectionText(section) {
  return section.blocks.flatMap((block) => block.kind === "p" ? [block.text] : block.items).join("\n");
}

function removeBracketSpans(text) {
  let result = "";
  let depth = 0;
  for (const character of text) {
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character === "]") {
      depth -= 1;
      continue;
    }
    if (depth === 0) result += character;
  }
  return result;
}

function removeProtectedText(text) {
  let result = removeBracketSpans(text).replace(EMAIL, "").replace(DEZBATERE_PATH, "");
  for (const token of FIXED_TOKENS) result = result.split(token).join("");
  return result;
}

export function assertLegalLocale({ english, localized, locale, key }) {
  assert.equal(localized.key, key, `${locale}/${key}: document key differs`);
  assert.equal(localized.key, english.key, `${locale}/${key}: English document key differs`);
  for (const field of ["titleId", "gateHintId", "sectionIdPrefix"]) {
    assert.equal(localized[field], english[field], `${locale}/${key}: ${field} differs`);
  }
  assert.deepEqual(
    localized.sections.map(({ no }) => no),
    english.sections.map(({ no }) => no),
    `${locale}/${key}: section number sequence differs`
  );
  assert.deepEqual(
    localized.sections.map(({ accent }) => accent),
    english.sections.map(({ accent }) => accent),
    `${locale}/${key}: accent cycle differs`
  );
  assert.deepEqual(
    localized.jumps.map(({ target }) => target),
    english.jumps.map(({ target }) => target),
    `${locale}/${key}: jump targets differ`
  );
  for (const [index, section] of localized.sections.entries()) {
    const englishSection = english.sections[index];
    assert.deepEqual(blockKinds(section), blockKinds(englishSection), `${locale}/${key}/${section.no}: block kinds differ`);
    assert.deepEqual(listLengths(section), listLengths(englishSection), `${locale}/${key}/${section.no}: list lengths differ`);
  }
  assert.deepEqual(bracketMultiset(localized), bracketMultiset(english), `${locale}/${key}: bracket spans differ`);
  assert.deepEqual(
    protectedTokenMultiset(localized),
    protectedTokenMultiset(english),
    `${locale}/${key}: protected-token multiset differs`
  );

  if (locale !== "en") {
    assert.notDeepEqual(
      localized.jumps.map(({ label }) => label),
      english.jumps.map(({ label }) => label),
      `${locale}/${key}: jump labels must be translated from English`
    );
    assert.notDeepEqual(
      localized.sections.map(({ title }) => title),
      english.sections.map(({ title }) => title),
      `${locale}/${key}: section titles must be translated from English`
    );
    for (const [index, section] of localized.sections.entries()) {
      const localizedText = sectionText(section);
      const englishText = sectionText(english.sections[index]);
      if (localizedText === englishText && /[A-Za-z]{4,}/.test(removeProtectedText(englishText))) {
        throw new Error(`${locale}/${key}/${section.no}: section body is unchanged English and must be translated`);
      }
    }
  }
}

function parseArguments(argv) {
  let locale;
  let document;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--locale") {
      locale = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--document") {
      document = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!LOCALES.some(({ code }) => code === locale)) throw new Error(`Unknown or missing locale: ${locale}`);
  if (DOCUMENTS[document] === undefined) throw new Error(`Unknown or missing document: ${document}`);
  return { locale, document };
}

async function loadDocument(locale, key) {
  const config = DOCUMENTS[key];
  const path = locale === "en"
    ? resolve(REPO_ROOT, "apps/ui/lib", config.module)
    : resolve(REPO_ROOT, "apps/ui/lib/legal", locale, config.module);
  const loaded = await import(`${pathToFileURL(path).href}?legal-check=${Date.now()}`);
  return loaded[config.exportName];
}

async function main(argv) {
  try {
    const { locale, document } = parseArguments(argv);
    const [english, localized] = await Promise.all([
      loadDocument("en", document),
      loadDocument(locale, document)
    ]);
    assertLegalLocale({ english, localized, locale, key: document });
    process.stdout.write(`${locale}/${document}: legal locale structure OK\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
