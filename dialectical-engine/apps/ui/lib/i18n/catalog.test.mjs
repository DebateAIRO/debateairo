import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LOCALES } from "./locales.ts";

const namespaces = ["chrome", "home", "newDebate", "time"];
const messagesRoot = join(process.cwd(), "messages");
const readCatalog = (locale, namespace) => JSON.parse(
  readFileSync(join(messagesRoot, locale, `${namespace}.json`), "utf8")
);
const placeholders = (value) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort();
const pluralSuffix = /\.(zero|one|two|few|many|other)$/;

const expectedKeysForLocale = (english, locale) => {
  const englishKeys = Object.keys(english);
  const pluralRoots = new Set(
    englishKeys.filter((key) => pluralSuffix.test(key)).map((key) => key.replace(pluralSuffix, ""))
  );
  const requiredCategories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  return [
    ...englishKeys.filter((key) => !pluralSuffix.test(key)),
    ...[...pluralRoots].flatMap((root) => requiredCategories.map((category) => `${root}.${category}`))
  ].sort();
};

test("all 35 locales have exact CLDR plural categories, non-plural keys, and placeholders", () => {
  assert.equal(LOCALES.length, 35);
  assert.deepEqual(
    readdirSync(messagesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    LOCALES.map(({ code }) => code).sort()
  );

  for (const namespace of namespaces) {
    const english = readCatalog("en", namespace);
    const englishKeys = Object.keys(english).sort();
    for (const { code } of LOCALES) {
      const catalog = readCatalog(code, namespace);
      assert.deepEqual(Object.keys(catalog).sort(), expectedKeysForLocale(english, code), `${code}/${namespace} keys`);
      for (const key of englishKeys.filter((candidate) => Object.hasOwn(catalog, candidate))) {
        assert.deepEqual(placeholders(catalog[key]), placeholders(english[key]), `${code}/${namespace}:${key} placeholders`);
      }
      for (const [key, value] of Object.entries(catalog)) {
        assert.equal(typeof value, "string", `${code}/${namespace}:${key} value`);
        assert.notEqual(value.trim(), "", `${code}/${namespace}:${key} value`);
      }
    }
  }
});

test("the Finnish model budget names LLM tokens rather than identifiers", () => {
  const finnish = readCatalog("fi", "newDebate");
  assert.equal(finnish["newDebate.maxTokens"], "Tokenien enimmäismäärä");
});
