#!/usr/bin/env node
/**
 * The legal release check: `pnpm run legal:release-check`. The release step runs it before it builds
 * (deploy/vps/README.md, "Side-by-side upgrades", step 2), and a release does not go out while it
 * reports anything.
 *
 * While work goes on, a change to the Terms of Service or the Privacy Policy is made in English only
 * (generate-legal-data.mjs, "English first"). Before a release, every language must be brought up to
 * date. This check says, in plain sentences, what is still missing:
 *   - which languages lag the English text of which document: their entry in
 *     apps/ui/legal/translated-from.json names another English text than the current one;
 *   - which up-to-date languages no longer match the English structure (legal-locale-check.mjs);
 *   - which current texts the archive does not hold yet (`pnpm run generate:legal:archive` adds them),
 *     and any archive file that is missing, altered or not listed;
 *   - a language whose archive already holds a different text under the current version number: a
 *     changed text needs a new number, or one number would name two texts;
 *   - a manifest that is not what the generator makes of the drafts (`pnpm run generate:legal`).
 * It reads only; it writes nothing. Exit 0: ready for release. Exit 1: not ready.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCALES } from "../lib/i18n/locales.ts";
import { buildConsentManifestEntries } from "./legal-consent-manifest.mjs";
import {
  buildLegalDocument,
  buildLegalManifest,
  LEGAL_MANIFEST_OUTPUT,
  LEGAL_TRANSLATIONS_PATH,
  legalArchiveProblems,
  legalTranslationFollows,
  parseLegalTranslations,
  renderLegalManifest
} from "./generate-legal-data.mjs";
import { assertLegalLocale } from "./legal-locale-check.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const DOCUMENTS = Object.freeze([
  Object.freeze({ kind: "PRIVACY", key: "privacy", name: "Privacy Policy", draft: "privacy-policy.md" }),
  Object.freeze({ kind: "TERMS", key: "terms", name: "Terms of Service", draft: "terms-of-service.md" })
]);

const message = (error) => (error instanceof Error ? error.message : String(error)).split("\n")[0];

/** "this language lags" / "these 3 languages lag". */
function languages(codes, verb) {
  return codes.length === 1
    ? `this language ${verb}s`
    : `these ${codes.length} languages ${verb}`;
}

/**
 * Every reason the repository is not ready for a release, as plain sentences, or [] when it is.
 * `readDraft(locale, kind)` gives a draft's text; `manifest` is the committed manifest (its `archive`
 * is the archive index); `translations` is the parsed record of translations; archive files are
 * read under `repoRoot`.
 */
export function legalReleaseProblems(repoRoot, { readDraft, manifest, translations }) {
  const problems = [];
  const codes = LOCALES.map(({ code }) => code).sort();
  for (const { kind, key, name } of DOCUMENTS) {
    let english;
    try {
      english = buildLegalDocument(readDraft("en", kind), key);
    } catch (error) {
      problems.push(`${name}: the English draft does not build: ${message(error)}`);
      continue;
    }
    const lagging = [];
    const structure = [];
    const unarchived = [];
    const renumbered = [];
    for (const locale of codes) {
      let document = english;
      if (locale !== "en") {
        try {
          document = buildLegalDocument(readDraft(locale, kind), key);
        } catch (error) {
          structure.push(`${name}: the ${locale} draft does not build: ${message(error)}`);
          continue;
        }
        if (!legalTranslationFollows(translations, kind, locale, english.sha256)) {
          lagging.push(locale);
        } else {
          try {
            assertLegalLocale({ english, localized: document, locale, key });
          } catch (error) {
            structure.push(`${name}: ${locale} is recorded as translated from the current English text but does not match it: ${message(error)}`);
          }
        }
      }
      const archived = manifest.archive?.[kind]?.[locale] ?? {};
      if (archived[document.sha256]?.version !== document.version) unarchived.push(locale);
      const sameNumber = Object.entries(archived)
        .filter(([sha256, entry]) => entry.version === document.version && sha256 !== document.sha256);
      if (sameNumber.length > 0) renumbered.push({ locale, version: document.version });
    }
    if (lagging.length > 0) {
      problems.push(`${name}: ${languages(lagging, "lag")} the English text (version ${english.version}, sha256 ${english.sha256.slice(0, 12)}): ${lagging.join(", ")}. Translate each from the current English text, then record it with: node apps/ui/scripts/generate-legal-data.mjs --translated --locale <code> --document ${key}`);
    }
    problems.push(...structure);
    if (unarchived.length > 0) {
      problems.push(`${name}: the archive does not hold the current text of ${unarchived.join(", ")}. Run pnpm run generate:legal:archive and commit what it writes.`);
    }
    for (const { locale, version } of renumbered) {
      problems.push(`${name}: in ${locale} the archive already holds a different text as version ${version}. A changed text needs a new version number.`);
    }
  }
  for (const problem of legalArchiveProblems(repoRoot, manifest.archive ?? {})) {
    problems.push(`The archive and its index disagree: ${problem}`);
  }
  return problems;
}

function readDraftFile(locale, kind) {
  const { draft } = DOCUMENTS.find((document) => document.kind === kind);
  const bytes = readFileSync(resolve(REPO_ROOT, "apps/ui/legal", locale, draft));
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function main() {
  const problems = [];
  let manifestText = null;
  let manifest = null;
  let translations = null;
  try {
    manifestText = readFileSync(resolve(REPO_ROOT, LEGAL_MANIFEST_OUTPUT), "utf8");
    manifest = JSON.parse(manifestText);
  } catch (error) {
    problems.push(`${LEGAL_MANIFEST_OUTPUT} cannot be read: ${message(error)}`);
  }
  try {
    translations = parseLegalTranslations(JSON.parse(readFileSync(resolve(REPO_ROOT, LEGAL_TRANSLATIONS_PATH), "utf8")));
  } catch (error) {
    problems.push(`${LEGAL_TRANSLATIONS_PATH} cannot be read: ${message(error)}`);
  }
  if (manifest !== null && translations !== null) {
    try {
      problems.push(...legalReleaseProblems(REPO_ROOT, { readDraft: readDraftFile, manifest, translations }));
      const consentEntries = buildConsentManifestEntries({
        messagesRoot: resolve(REPO_ROOT, "apps/ui/messages"),
        locales: LOCALES.map(({ code }) => code)
      });
      const expected = renderLegalManifest(buildLegalManifest(readDraftFile, consentEntries, manifest.archive));
      if (expected !== manifestText) problems.push(`${LEGAL_MANIFEST_OUTPUT} is stale: run pnpm run generate:legal and commit it.`);
    } catch (error) {
      problems.push(`The legal texts cannot be checked: ${message(error)}`);
    }
  }
  if (problems.length === 0) {
    process.stdout.write("Legal texts: ready for release. Every language follows the current English text, and the archive holds every current text.\n");
    return;
  }
  process.stdout.write(`Legal texts: NOT ready for release (${problems.length} problem${problems.length === 1 ? "" : "s"}).\n`);
  for (const problem of problems) process.stdout.write(`- ${problem}\n`);
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
