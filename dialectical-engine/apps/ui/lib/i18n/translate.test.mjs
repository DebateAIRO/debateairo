import assert from "node:assert/strict";
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

test("date and number helpers honor the requested locale", () => {
  const instant = new Date("2026-09-22T12:00:00.000Z");
  const dateOptions = { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" };
  assert.equal(formatDate("ro", instant, dateOptions), new Intl.DateTimeFormat("ro", dateOptions).format(instant));
  assert.equal(formatNumber("de", 12345.6), new Intl.NumberFormat("de").format(12345.6));
});
