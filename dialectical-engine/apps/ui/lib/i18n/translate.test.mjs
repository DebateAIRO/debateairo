import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatDate, formatNumber, t, tPlural } from "./translate.ts";

test("t falls back to English, interpolates known variables, and leaves unknown variables", () => {
  assert.equal(t({}, "home.title"), "What should we debate?");
  assert.equal(t({ greeting: "Hello, {name}; {unknown}" }, "greeting", { name: "Ada" }), "Hello, Ada; {unknown}");
  assert.equal(t({}, "missing.key"), "missing.key");
});

test("Arabic plural selection covers zero, one, two, few, many, and other", () => {
  const catalog = Object.fromEntries(
    ["zero", "one", "two", "few", "many", "other"].map((category) => [`items.${category}`, category])
  );
  assert.equal(tPlural(catalog, "items", 0, "ar"), "zero");
  assert.equal(tPlural(catalog, "items", 1, "ar"), "one");
  assert.equal(tPlural(catalog, "items", 2, "ar"), "two");
  assert.equal(tPlural(catalog, "items", 3, "ar"), "few");
  assert.equal(tPlural(catalog, "items", 11, "ar"), "many");
  assert.equal(tPlural(catalog, "items", 100, "ar"), "other");
});

test("real time catalogues select the CLDR form for representative locales", () => {
  const counts = [0, 1, 2, 5, 11, 101];
  const expected = {
    pl: ["0 godzin temu", "1 godzinę temu", "2 godziny temu", "5 godzin temu", "11 godzin temu", "101 godzin temu"],
    ar: ["قبل 0 ساعة", "قبل 1 ساعة", "قبل ساعتين", "قبل 5 ساعات", "قبل 11 ساعة", "قبل 101 ساعة"],
    ru: ["0 часов назад", "1 час назад", "2 часа назад", "5 часов назад", "11 часов назад", "101 час назад"],
    ro: ["acum 0 ore", "acum 1 oră", "acum 2 ore", "acum 5 ore", "acum 11 ore", "acum 101 ore"],
    ja: ["0時間前", "1時間前", "2時間前", "5時間前", "11時間前", "101時間前"]
  };
  for (const [locale, outputs] of Object.entries(expected)) {
    const catalog = JSON.parse(readFileSync(join(process.cwd(), "messages", locale, "time.json"), "utf8"));
    assert.deepEqual(counts.map((count) => tPlural(catalog, "time.hours", count, locale)), outputs, locale);
  }
});

test("Croatian catalogues use the numeral forms for minutes and model counts", () => {
  const timeCatalog = JSON.parse(readFileSync(join(process.cwd(), "messages/hr/time.json"), "utf8"));
  const homeCatalog = JSON.parse(readFileSync(join(process.cwd(), "messages/hr/home.json"), "utf8"));
  const numbers = (...values) => values;
  assert.deepEqual(
    numbers(1, 2, 5).map((count) => tPlural(timeCatalog, "time.minutes", count, "hr")),
    ["prije 1 minutu", "prije 2 minute", "prije 5 minuta"]
  );
  assert.deepEqual(
    numbers(1, 2, 5).map((count) => tPlural(homeCatalog, "home.models", count, "hr")),
    ["1 model", "2 modela", "5 modela"]
  );
});

test("count catalogues render the numeral in the grammatical position and form", () => {
  const catalog = (locale, namespace) => JSON.parse(
    readFileSync(join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8")
  );
  const rendered = (locale, namespace, key, counts) => {
    const messages = catalog(locale, namespace);
    return counts.map((count) => tPlural(messages, key, count, locale));
  };
  const numbers = (...values) => values;

  assert.deepEqual(rendered("cs", "home", "home.models", numbers(1, 2, 1.5, 5)), [
    "1 model", "2 modely", "1.5 modelu", "5 modelů"
  ]);
  assert.deepEqual(rendered("ro", "home", "home.models", numbers(1, 2, 20)), [
    "1 model", "2 modele", "20 de modele"
  ]);
  assert.deepEqual(rendered("sk", "home", "home.models", numbers(1, 2, 1.5, 5)), [
    "1 model", "2 modely", "1.5 modelu", "5 modelov"
  ]);
  assert.deepEqual(rendered("sl", "home", "home.models", numbers(1, 2, 3, 5)), [
    "1 model", "2 modela", "3 modeli", "5 modelov"
  ]);
  for (const [key, expected] of Object.entries({
    "time.minutes": ["преди 1 минута", "преди 5 минути"],
    "time.hours": ["преди 1 час", "преди 5 часа"],
    "time.days": ["преди 1 ден", "преди 5 дни"],
    "time.weeks": ["преди 1 седмица", "преди 5 седмици"]
  })) {
    assert.deepEqual(rendered("bg", "time", key, numbers(1, 5)), expected, `bg ${key}`);
  }
  assert.deepEqual(rendered("bg", "home", "home.models", numbers(1, 5)), ["1 модел", "5 модела"]);
  assert.deepEqual(rendered("ar", "home", "home.models", numbers(100)), ["100 نموذج"]);
  assert.deepEqual(rendered("ar", "time", "time.minutes", numbers(100)), ["قبل 100 دقيقة"]);
});

test("date and number helpers honor the requested locale", () => {
  const instant = new Date("2026-09-22T12:00:00.000Z");
  const dateOptions = { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" };
  assert.equal(formatDate("ro", instant, dateOptions), new Intl.DateTimeFormat("ro", dateOptions).format(instant));
  assert.equal(formatNumber("de", 12345.6), new Intl.NumberFormat("de").format(12345.6));
});
