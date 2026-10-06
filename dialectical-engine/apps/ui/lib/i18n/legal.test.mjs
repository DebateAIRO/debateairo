import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

// Turn 15 — the legal pages and the site footer. The page bodies read the `legal` namespace;
// the footer and the side navigation read `chrome.legal*` / `chrome.footer.*`, which ride the
// chrome catalogue every page already has.

const root = process.cwd();
const namespace = "legal";
const ownedFiles = [
  "components/SiteFooter.tsx",
  "components/legal/CookiePreferencesButton.tsx",
  "components/legal/LegalBodies.tsx",
  "components/legal/LegalPageLayout.tsx",
  "lib/legal/pages.ts",
  "lib/legal/pageCatalogs.ts",
  "app/terms/page.tsx",
  "app/terms/versions/page.tsx",
  "app/privacy/page.tsx",
  "app/privacy/us-health-data/page.tsx",
  "app/cookies/page.tsx",
  "app/providers/page.tsx",
  "app/legal/page.tsx",
  // Paid plans (P21, R3-4): the Privacy Policy's previous versions and one page per archived text.
  "components/legal/LegalArchiveBodies.tsx",
  "lib/legal/archive.ts",
  "app/privacy/versions/page.tsx",
  "app/terms/versions/[sha256]/page.tsx",
  "app/privacy/versions/[sha256]/page.tsx"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const english = JSON.parse(source(`messages/en/${namespace}.json`));
const chromeEnglish = JSON.parse(source("messages/en/chrome.json"));
const locales = readdirSync(join(root, "messages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Literal keys, plus the health sections the body builds as `legal.health.s${no}.…`. */
function legalKeysInSource() {
  const keys = new Set();
  for (const path of ownedFiles) {
    for (const match of source(path).matchAll(/"(legal\.[A-Za-z0-9.]+)"/g)) keys.add(match[1]);
  }
  const bodies = source("components/legal/LegalBodies.tsx");
  const sections = bodies.match(/HEALTH_SECTIONS = \[([^\]]+)\]/)?.[1].match(/"(\d+)"/g) ?? [];
  for (const quoted of sections) {
    const no = quoted.replaceAll('"', "");
    keys.add(`legal.health.s${no}.title`);
    keys.add(`legal.health.s${no}.body`);
  }
  // The page routes compose `legal.<page>.{eyebrow,title,meta}` for the four non-document pages.
  for (const page of ["versions", "cookies", "providers", "health"]) {
    for (const part of ["eyebrow", "title", "meta"]) keys.add(`legal.${page}.${part}`);
  }
  return keys;
}

test("every legal key the pages read exists in English, and English has no unused key", () => {
  assert.deepEqual([...legalKeysInSource()].sort(), Object.keys(english).sort());
});

test("every chrome key the footer and navigation read exists in English", () => {
  const read = new Set();
  for (const path of ownedFiles) {
    for (const match of source(path).matchAll(/"(chrome\.[A-Za-z0-9.]+)"/g)) read.add(match[1]);
  }
  assert.ok(read.size >= 13);
  for (const key of read) assert.ok(Object.hasOwn(chromeEnglish, key), key);
});

test("all 35 locales carry the exact legal contract and a translated sample", () => {
  assert.equal(locales.length, 35);
  const catalogs = new Map();
  for (const locale of locales) {
    const localized = JSON.parse(source(`messages/${locale}/${namespace}.json`));
    catalogs.set(locale, localized);
    assertLocalizedCatalog({ english, localized, locale, namespace });
  }
  assertTranslationSample({ catalogs, english, namespace });
});

test("every locale translates the footer and navigation labels", () => {
  const added = Object.keys(chromeEnglish).filter((key) => key.startsWith("chrome.legal") || key.startsWith("chrome.footer."));
  // 13 -> 20: the paid-plans footer (P21, R3-4): pricing, cancel, withdraw, the card marks' group and names, DB-IP.
  assert.equal(added.length, 20);
  for (const locale of locales.filter((code) => code !== "en")) {
    const chrome = JSON.parse(source(`messages/${locale}/chrome.json`));
    for (const key of added) {
      assert.equal(typeof chrome[key], "string", `${locale}/chrome:${key}`);
      assert.notEqual(chrome[key].trim(), "", `${locale}/chrome:${key}`);
    }
    // The long labels are prose; a locale that left them English was not translated.
    for (const key of ["chrome.legal.terms", "chrome.legal.privacy", "chrome.footer.cookiePreferences"]) {
      assert.notEqual(chrome[key], chromeEnglish[key], `${locale}/chrome:${key} is still English`);
    }
  }
});

test("the legal components contain no hard-coded user-visible English", () => {
  const failures = [];
  for (const path of ownedFiles.filter((file) => file.endsWith(".tsx"))) {
    const parsed = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
    const inspect = (node) => {
      const text = ts.isJsxText(node) ? node.getText(parsed).replace(/\s+/g, " ").trim() : "";
      if (/[A-Za-z]{3,}/.test(text)) {
        failures.push(`${path}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}: ${text}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(parsed);
  }
  assert.deepEqual(failures, []);
});
