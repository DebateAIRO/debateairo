import assert from "node:assert/strict";

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];
const PLURAL_SUFFIX = new RegExp(`\\.(${PLURAL_CATEGORIES.join("|")})$`);

export const TRANSLATION_SAMPLE_LOCALES = ["ar", "de", "es", "fr", "ja"];

const placeholders = (message) => [...new Set(
  [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1])
)].sort();

const pluralRootsIn = (english) => new Set(
  Object.keys(english)
    .filter((key) => key.endsWith(".one") && Object.hasOwn(english, `${key.slice(0, -4)}.other`))
    .map((key) => key.slice(0, -4))
);

const pluralRootFor = (key, pluralRoots) => {
  const match = key.match(PLURAL_SUFFIX);
  if (!match) return null;
  const root = key.slice(0, -match[0].length);
  return pluralRoots.has(root) ? root : null;
};

export function assertLocalizedCatalog({ english, localized, locale, namespace }) {
  const pluralRoots = pluralRootsIn(english);
  const nonPluralEnglishKeys = Object.keys(english).filter((key) => !pluralRootFor(key, pluralRoots));
  const requiredCategories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const expectedKeys = [
    ...nonPluralEnglishKeys,
    ...[...pluralRoots].flatMap((root) =>
      requiredCategories.map((category) => `${root}.${category}`)
    )
  ].sort();

  assert.deepEqual(Object.keys(localized).sort(), expectedKeys, `${locale}/${namespace} keys`);
  for (const [key, value] of Object.entries(localized)) {
    assert.equal(typeof value, "string", `${locale}/${namespace}:${key} value`);
    assert.notEqual(value.trim(), "", `${locale}/${namespace}:${key} value`);

    const pluralRoot = pluralRootFor(key, pluralRoots);
    const reference = Object.hasOwn(english, key)
      ? english[key]
      : localized[`${pluralRoot}.other`];
    assert.deepEqual(
      placeholders(value),
      placeholders(reference),
      `${locale}/${namespace}:${key} placeholders`
    );
  }
}

export function assertTranslationSample({ catalogs, english, namespace }) {
  for (const locale of TRANSLATION_SAMPLE_LOCALES) {
    assert.ok(catalogs.has(locale), `${locale}/${namespace} sample exists`);
    assert.notDeepEqual(
      catalogs.get(locale),
      english,
      `${locale}/${namespace} must not remain byte-equivalent to English values`
    );
  }
}
