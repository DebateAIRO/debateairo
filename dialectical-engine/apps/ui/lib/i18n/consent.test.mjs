import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { LOCALES } from "./locales.ts";
import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const componentDirectory = join(root, "components/consent");
const componentPaths = readdirSync(componentDirectory)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => `components/consent/${name}`)
  .sort();
const ownedPaths = [...componentPaths, "lib/consent.ts", "lib/privacyPolicy.ts"];
const source = (path) => readFileSync(join(root, path), "utf8");
const sources = new Map(ownedPaths.map((path) => [path, source(path)]));
const english = JSON.parse(source("messages/en/consent.json"));
const placeholders = (message) => [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1])
  .sort();

const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
function visibleEnglish(path, fileSource) {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    fileSource,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const add = (text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(normalized)) failures.push(normalized);
  };
  const inspect = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) add(node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) add(initializer.text);
      if (
        initializer && ts.isJsxExpression(initializer) && initializer.expression &&
        (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
      ) add(initializer.expression.text);
    }
    if (
      ts.isJsxExpression(node) && node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) add(node.expression.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("every consent key used by owned source exists in English", () => {
  const used = new Set();
  for (const fileSource of sources.values()) {
    for (const match of fileSource.matchAll(/["'](consent\.[A-Za-z0-9.]+)["']/g)) {
      used.add(match[1]);
    }
  }
  assert.ok(used.size > 0, "expected consent translation keys in owned source");
  assert.deepEqual([...used].sort(), Object.keys(english).sort(), "catalog has unused or missing keys");
  for (const key of used) {
    assert.equal(typeof english[key], "string", `missing English message: ${key}`);
    assert.notEqual(english[key].trim(), "", `empty English message: ${key}`);
  }
});

test("all 35 locales expose the exact consent contract and translated sample", () => {
  const localeDirectories = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(localeDirectories, LOCALES.map(({ code }) => code).sort());
  const catalogs = new Map();
  for (const locale of localeDirectories) {
    const catalog = JSON.parse(source(`messages/${locale}/consent.json`));
    catalogs.set(locale, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale, namespace: "consent" });
  }
  assertTranslationSample({ catalogs, english, namespace: "consent" });
});

test("consent components contain no hard-coded user-visible English", () => {
  const failures = componentPaths.flatMap((path) =>
    visibleEnglish(path, sources.get(path)).map((copy) => `${path}: ${copy}`)
  );
  assert.deepEqual(failures, []);

  const consentData = sources.get("lib/consent.ts");
  for (const field of ["nameKey", "tagKey", "descriptionKey", "detailKey"]) {
    const values = [...consentData.matchAll(new RegExp(`${field}:\\s*"([^"]+)"`, "g"))]
      .map((match) => match[1]);
    assert.ok(values.length > 0, `${field} values must be present`);
    assert.ok(values.every((value) => value.startsWith("consent.")), `${field} must hold message keys`);
  }

  const policyData = sources.get("lib/privacyPolicy.ts");
  for (const field of ["labelKey", "titleKey", "key"]) {
    const values = [...policyData.matchAll(new RegExp(`${field}:\\s*"([^"]+)"`, "g"))]
      .map((match) => match[1]);
    assert.ok(values.length > 0, `${field} values must be present`);
    assert.ok(values.every((value) => value.startsWith("consent.")), `${field} must hold message keys`);
  }
});

test("protected consent identifiers stay outside translatable messages", () => {
  const messages = Object.values(english).join("\n");
  for (const protectedValue of [
    "privacy@dezbatere.ro",
    "dezbatere.ro/subprocessors",
    "DebateAIRO SRL",
    "ANSPDCP",
    "Art. ",
    "de_session",
    "de_mfa",
    "de_device",
    "de_quality",
    "de_analytics"
  ]) {
    assert.equal(messages.includes(protectedValue), false, `${protectedValue} must be interpolated`);
  }
});

test("the selected consent catalog has one lazy loader per supported locale", () => {
  const loaderSource = sources.get("components/consent/useConsentCatalog.ts");
  const loaderLocales = [...loaderSource.matchAll(/\n\s{2}([a-z]{2}): \(\) => import\("@\/messages\/\1\/consent\.json"\)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(loaderLocales, LOCALES.map(({ code }) => code).sort());
  assert.match(loaderSource, /useChromeI18n\(\)/);
  assert.match(loaderSource, /catalogCache\[locale\] \?\? consentEnglish/);
});

test("the consent state machine and modal behavior survive the copy migration", () => {
  const consent = sources.get("components/consent/CookieConsent.tsx");
  const bar = sources.get("components/consent/CookieBar.tsx");
  const card = sources.get("components/consent/CookiePreferencesCard.tsx");
  const policy = sources.get("components/consent/PrivacyPolicyModal.tsx");

  assert.match(consent, /setSurface\(readConsent\(\) === null \? "bar" : "silent"\)/);
  assert.match(consent, /writeConsent\(decision\)/);
  assert.match(consent, /decisionFor\("accept-all"\)/);
  assert.match(consent, /decisionFor\("essential-only"\)/);
  assert.match(consent, /decisionFor\("save-choices"/);
  assert.ok(
    consent.indexOf("<CookiePreferencesCard") < consent.indexOf("<PrivacyPolicyModal"),
    "the policy remains the card's later sibling"
  );
  assert.doesNotMatch(`${bar}\n${card}\n${policy}`, /\blocalStorage\b/);
  assert.match(bar, /role="region"/);
  assert.doesNotMatch(bar, /role="dialog"|aria-modal/);
  assert.match(card, /useModalSurface\(true/);
  assert.match(card, /role="switch"/);
  assert.match(policy, /useModalSurface\(open/);
  assert.match(policy, /region\.scrollTop \+ region\.clientHeight >= region\.scrollHeight - SCROLL_SLACK/);
  assert.match(policy, /disabled=\{!gateOpen\}/);
});

test("the English allowlist no longer exempts the consent cluster", () => {
  assert.doesNotMatch(source("lib/i18n/english-allowlist.txt"), /^components\/consent\/\*\*$/m);
});
