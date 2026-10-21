import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LOCALES } from "./locales.ts";

const namespaces = ["chrome", "home", "newDebate", "public", "time"];
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

// Values that equal their English value in a non-English home/public catalogue, measured at 95d36b737
// (FIX-SF-S01-p1-C): brand and product names, file names, cognates. Any other English value fails.
const SAME_AS_ENGLISH = {
  "home.baseScore": ["it", "pt"],
  "home.crisisSupport.chat": ["cs", "da", "ro", "sk"],
  "home.crisisSupport.website": ["de", "nl"],
  "home.finalScore": ["pt", "ro"],
  "home.models.one": ["cs", "da", "hr", "nl", "pl", "ro", "sk", "sl", "tr"],
  "home.pro": ["cs", "de", "hu", "id", "ro"],
  "public.badges.heading": ["fr"],
  "public.export.filename": ["ar", "bg", "cs", "da", "el", "et", "fi", "fr", "ga", "he", "hi", "hr", "hu", "id", "it", "ja", "ko", "lt", "mt", "nl", "pl", "pt", "sk", "sl", "sv", "tr", "vi", "zh"],
  "public.honesty.verdict": ["fr", "ro"],
  "public.overview.baseAndFinalAria": ["pt"],
  "public.overview.convergence": ["fr"],
  "public.overview.details": ["de", "nl"],
  "public.overview.proLabel": ["cs", "de", "hu", "id", "ro"],
  "public.overview.proSideName": ["cs", "hu", "id", "ro"],
  "public.report.point.position": ["da", "de", "fr"]
};

test("no home or public value is left in English outside the measured allow-list (review N8)", () => {
  for (const namespace of ["home", "public"]) {
    const english = readCatalog("en", namespace);
    for (const { code } of LOCALES.filter(({ code }) => code !== "en")) {
      const catalog = readCatalog(code, namespace);
      for (const [key, value] of Object.entries(catalog)) {
        if ((SAME_AS_ENGLISH[key] ?? []).includes(code)) continue;
        assert.notEqual(value, english[key], `${code}/${namespace}:${key} is the English value`);
      }
    }
  }
});

test("the flagged card label is in capitals in every locale whose script has them (V-110 default)", () => {
  for (const { code } of LOCALES) {
    const label = readCatalog(code, "home")["home.flag.flagged"];
    const cased = [...label].some((character) => character.toLowerCase() !== character.toUpperCase());
    if (cased) assert.equal(label, label.toLocaleUpperCase(code), `${code}/home:home.flag.flagged is not in capitals`);
  }
});

test("no locale keeps the /new keys retired by debate shape P2c", () => {
  const retired = [
    "newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
    "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint",
    "newDebate.scrutinyDeepHint", "newDebate.scrutinyExhaustiveHint"
  ];
  for (const { code } of LOCALES) {
    const catalog = readCatalog(code, "newDebate");
    for (const key of retired) assert.equal(Object.hasOwn(catalog, key), false, `${code}/newDebate still has ${key}`);
  }
});
