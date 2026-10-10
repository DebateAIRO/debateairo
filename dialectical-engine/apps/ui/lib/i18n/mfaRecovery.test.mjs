import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LOCALES } from "./locales.ts";
import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

// Owner requirement (2026-10-09): the authenticator-recovery screens, the 24-hour wait and the
// finish link among them, are "clear plain screens in all 35 locales". Until then the catalogue
// existed in English and Romanian only, and every other locale read English.
const root = process.cwd();
const namespace = "mfa-recovery";
const source = (path) => readFileSync(join(root, path), "utf8");
const catalogPath = (locale) => join(root, "messages", locale, `${namespace}.json`);
const english = JSON.parse(readFileSync(catalogPath("en"), "utf8"));
const translatedLocales = LOCALES.map(({ code }) => code).filter((code) => code !== "en");

test("all 35 locales expose the exact mfa-recovery contract and a translated sample", () => {
  assert.equal(LOCALES.length, 35);
  const catalogs = new Map();
  for (const { code } of LOCALES) {
    assert.ok(existsSync(catalogPath(code)), `messages/${code}/${namespace}.json must exist`);
    const catalog = JSON.parse(readFileSync(catalogPath(code), "utf8"));
    catalogs.set(code, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale: code, namespace });
    assert.deepEqual(Object.keys(catalog), Object.keys(english), `${code}/${namespace} keeps the English key order`);
  }
  assertTranslationSample({ catalogs, english, namespace });
});

test("no translated mfa-recovery sentence is left in English", () => {
  const untranslated = translatedLocales.flatMap((code) => {
    if (!existsSync(catalogPath(code))) return [`${code}: missing`];
    const catalog = JSON.parse(readFileSync(catalogPath(code), "utf8"));
    return Object.entries(english).filter(([key, value]) => catalog[key] === value).map(([key]) => `${code}:${key}`);
  });
  assert.deepEqual(untranslated, []);
});

test("each locale's loader serves that locale's own mfa-recovery catalogue", () => {
  const server = source("lib/i18n/server.ts");
  const served = new Map(
    [...server.matchAll(/^ {4}([a-z]{2}): \{([\s\S]*?)^ {4}\}/gm)].map(([, code, block]) => [
      code,
      /"mfa-recovery": \(\) => import\("\.\.\/\.\.\/messages\/([a-z]{2})\/mfa-recovery\.json"\)/.exec(block)?.[1] ?? null
    ])
  );
  assert.deepEqual([...served.keys()].sort(), LOCALES.map(({ code }) => code).sort());
  for (const [code, file] of served) assert.equal(file, code, `${code} loads messages/${file}/mfa-recovery.json`);
});

test("the recovery routes load the reader's catalogue instead of picking English or Romanian", () => {
  for (const path of ["app/recover-authenticator/page.tsx", "app/verify-backup-email/page.tsx", "app/recover/layout.tsx", "app/settings/security/page.tsx"]) {
    const page = source(path);
    assert.ok(/loadNamespace\(locale, ["']mfa-recovery["']\)/.test(page), `${path} loads the mfa-recovery namespace`);
    assert.ok(!/messages\/(?:en|ro)\/mfa-recovery\.json/.test(page), `${path} imports no fixed catalogue`);
  }
});

test("the recovery components take the catalogue they are served", () => {
  for (const path of ["components/MfaRecoveryFlow.tsx", "components/BackupEmailVerification.tsx", "components/KnownPasswordRecoveryLink.tsx"]) {
    const component = source(path);
    assert.ok(!/messages\/ro\/mfa-recovery\.json/.test(component), `${path} imports no Romanian catalogue`);
    assert.ok(!/"en" \| "ro"/.test(component), `${path} accepts every locale`);
  }
});
