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
  assert.deepEqual(
    [1, 2, 5].map((count) => tPlural(timeCatalog, "time.minutes", count, "hr")),
    ["prije 1 minutu", "prije 2 minute", "prije 5 minuta"]
  );
  assert.deepEqual(
    [1, 2, 5].map((count) => tPlural(homeCatalog, "home.models", count, "hr")),
    ["1 model", "2 modela", "5 modela"]
  );
});

test("date and number helpers honor the requested locale", () => {
  const instant = new Date("2026-09-22T12:00:00.000Z");
  const dateOptions = { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" };
  assert.equal(formatDate("ro", instant, dateOptions), new Intl.DateTimeFormat("ro", dateOptions).format(instant));
  assert.equal(formatNumber("de", 12345.6), new Intl.NumberFormat("de").format(12345.6));
});
