import assert from "node:assert/strict";
import test from "node:test";

import { filterLocales, LOCALES } from "../lib/i18n/locales.ts";
import {
  handleLanguageSwitcherKey,
  languageSwitcherCaret
} from "./languageSwitcherState.ts";

test("closed and open states use the ruled carets", () => {
  assert.equal(languageSwitcherCaret(false), "▾");
  assert.equal(languageSwitcherCaret(true), "▴");
});

test("language search matches native names and ISO codes case-insensitively", () => {
  assert.deepEqual(filterLocales("中").map(({ code }) => code), ["zh"]);
  assert.deepEqual(filterLocales("RO").map(({ code }) => code), ["ro"]);
  assert.deepEqual(filterLocales("português").map(({ code }) => code), ["pt"]);
});

test("keyboard navigation wraps arrows and supports Home, End, Enter, and Escape", () => {
  assert.equal(handleLanguageSwitcherKey("ArrowDown", 2, 3).highlightedIndex, 0);
  assert.equal(handleLanguageSwitcherKey("ArrowUp", 0, 3).highlightedIndex, 2);
  assert.equal(handleLanguageSwitcherKey("Home", 2, 3).highlightedIndex, 0);
  assert.equal(handleLanguageSwitcherKey("End", 0, 3).highlightedIndex, 2);
  assert.equal(handleLanguageSwitcherKey("Enter", 1, 3).selectIndex, 1);
  assert.equal(handleLanguageSwitcherKey("Escape", 1, 3).close, true);
});

test("the registry has exactly the ruled 26/6/3 tiers and only Arabic and Hebrew are RTL", () => {
  const counts = Object.fromEntries(["EUROPE", "ASIA", "MIDDLE EAST"].map((tier) => [
    tier,
    LOCALES.filter((locale) => locale.tier === tier).length
  ]));
  assert.equal(LOCALES.length, 35);
  assert.deepEqual(counts, { EUROPE: 26, ASIA: 6, "MIDDLE EAST": 3 });
  assert.deepEqual(LOCALES.filter(({ dir }) => dir === "rtl").map(({ code }) => code), ["ar", "he"]);
});
