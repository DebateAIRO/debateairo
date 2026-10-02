import assert from "node:assert/strict";

// A COPY of apps/ui/lib/i18n/catalogContractAssertions.mjs (spec 2026-09-29 §2.5.10: "the same parity rules as
// the UI, checked by a copy"). tests/unit/mail-templates-catalogue.test.ts pins the original's sha256, so the two
// cannot drift silently: change the original, then this copy, then the pin.
const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;
const PLURAL_SUFFIX = new RegExp(`\\.(${PLURAL_CATEGORIES.join("|")})$`);

export const TRANSLATION_SAMPLE_LOCALES = Object.freeze(["ar", "de", "es", "fr", "ja"] as const);

type Catalogue = Readonly<Record<string, unknown>>;

const placeholders = (message: string): string[] => [...new Set(
  [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!)
)].sort();

const pluralRootsIn = (english: Readonly<Record<string, string>>): Set<string> => new Set(
  Object.keys(english)
    .filter((key) => key.endsWith(".one") && Object.hasOwn(english, `${key.slice(0, -4)}.other`))
    .map((key) => key.slice(0, -4))
);

const pluralRootFor = (key: string, pluralRoots: ReadonlySet<string>): string | null => {
  const match = key.match(PLURAL_SUFFIX);
  if (!match) return null;
  const root = key.slice(0, -match[0].length);
  return pluralRoots.has(root) ? root : null;
};

export function assertLocalizedCatalog(input: Readonly<{
  english: Readonly<Record<string, string>>;
  localized: Catalogue;
  locale: string;
  namespace: string;
}>): void {
  const { english, localized, locale, namespace } = input;
  const pluralRoots = pluralRootsIn(english);
  const nonPluralEnglishKeys = Object.keys(english).filter((key) => !pluralRootFor(key, pluralRoots));
  const requiredCategories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const expectedKeys = [
    ...nonPluralEnglishKeys,
    ...[...pluralRoots].flatMap((root) => requiredCategories.map((category) => `${root}.${category}`))
  ].sort();
  assert.deepEqual(Object.keys(localized).sort(), expectedKeys, `${locale}/${namespace} keys`);
  for (const [key, value] of Object.entries(localized)) {
    assert.equal(typeof value, "string", `${locale}/${namespace}:${key} value`);
    const text = value as string;
    assert.notEqual(text.trim(), "", `${locale}/${namespace}:${key} value`);
    const pluralRoot = pluralRootFor(key, pluralRoots);
    const reference = Object.hasOwn(english, key)
      ? english[key]!
      : String(localized[`${pluralRoot}.other`]);
    assert.deepEqual(placeholders(text), placeholders(reference), `${locale}/${namespace}:${key} placeholders`);
  }
}

export function assertTranslationSample(input: Readonly<{
  catalogs: ReadonlyMap<string, Catalogue>;
  english: Readonly<Record<string, string>>;
  namespace: string;
}>): void {
  for (const locale of TRANSLATION_SAMPLE_LOCALES) {
    assert.ok(input.catalogs.has(locale), `${locale}/${input.namespace} sample exists`);
    assert.notDeepEqual(
      input.catalogs.get(locale),
      input.english,
      `${locale}/${input.namespace} must not remain byte-equivalent to English values`
    );
  }
}
