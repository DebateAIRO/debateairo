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
const numeralFreePluralForms = new Set([
  "ar/home:home.models.zero",
  "ar/home:home.models.two",
  "ar/time:time.minutes.two",
  "ar/time:time.hours.two",
  "ar/time:time.days.two",
  "ar/time:time.weeks.two",
  "he/home:home.models.two",
  "he/time:time.minutes.two",
  "he/time:time.hours.two",
  "he/time:time.days.two",
  "he/time:time.weeks.two",
  "mt/time:time.hours.two",
  "mt/time:time.days.two",
  "mt/time:time.weeks.two"
]);

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
    for (const { code } of LOCALES) {
      const catalog = readCatalog(code, namespace);
      assert.deepEqual(Object.keys(catalog).sort(), expectedKeysForLocale(english, code), `${code}/${namespace} keys`);
      for (const [key, value] of Object.entries(catalog)) {
        assert.equal(typeof value, "string", `${code}/${namespace}:${key} value`);
        assert.notEqual(value.trim(), "", `${code}/${namespace}:${key} value`);
        const pluralMatch = key.match(pluralSuffix);
        if (pluralMatch) {
          if (numeralFreePluralForms.has(`${code}/${namespace}:${key}`)) {
            assert.deepEqual(placeholders(value), [], `${code}/${namespace}:${key} placeholders`);
            continue;
          }
          const root = key.replace(pluralSuffix, "");
          const referenceKey = Object.hasOwn(catalog, `${root}.other`) ? `${root}.other` : `${root}.one`;
          assert.deepEqual(placeholders(value), placeholders(catalog[referenceKey]), `${code}/${namespace}:${key} placeholders`);
        } else {
          assert.deepEqual(placeholders(value), placeholders(english[key]), `${code}/${namespace}:${key} placeholders`);
        }
      }
    }
  }
});

test("the Finnish model budget names LLM tokens rather than identifiers", () => {
  const finnish = readCatalog("fi", "newDebate");
  assert.equal(finnish["newDebate.maxTokens"], "Tokenien enimmäismäärä");
});
