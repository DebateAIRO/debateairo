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

test("all 35 locales have exactly the English namespace key sets and placeholders", () => {
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
      assert.deepEqual(Object.keys(catalog).sort(), englishKeys, `${code}/${namespace} keys`);
      for (const key of englishKeys) {
        assert.deepEqual(placeholders(catalog[key]), placeholders(english[key]), `${code}/${namespace}:${key} placeholders`);
      }
    }
  }
});
