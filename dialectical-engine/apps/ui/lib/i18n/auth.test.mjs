import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const ownedFiles = [
  "components/LoginFlow.tsx",
  "components/SignUpFlow.tsx",
  "components/AuthShell.tsx",
  "app/login/page.tsx",
  "app/sign-up/page.tsx",
  "app/verify-email/page.tsx",
  "app/enroll-mfa/page.tsx",
  "app/error.tsx",
  "app/global-error.tsx"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const englishPath = join(root, "messages/en/auth.json");
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const allowedVisibleLiterals = new Set([
  "Dialectical Engine",
  "you@institution.edu",
  "XXXX-XXXX-XXXX-XXXX",
  "000000"
]);
const placeholders = (message) => [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1])
  .sort();

function hardCodedVisibleEnglish(path) {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    source(path),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );
  const add = (text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(normalized) && !allowedVisibleLiterals.has(normalized)) {
      failures.push(normalized);
    }
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
    if (
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      /^(?:setError|setMessage)$/.test(node.expression.text) &&
      node.arguments[0] &&
      (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) add(node.arguments[0].text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("every auth translation key used by the owned source exists in English", () => {
  assert.ok(existsSync(englishPath), "messages/en/auth.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const used = new Set();
  for (const path of ownedFiles) {
    for (const match of source(path).matchAll(/t\(\s*catalog\s*,\s*"(auth\.[A-Za-z0-9.]+)"/g)) {
      used.add(match[1]);
    }
  }
  assert.ok(used.size > 0, "expected auth source files to use translation keys");
  assert.deepEqual([...used].sort(), Object.keys(english).sort());
});

test("all 35 locales expose the final auth key set and interpolation contract", () => {
  assert.ok(existsSync(englishPath), "messages/en/auth.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const localeDirectories = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  for (const locale of localeDirectories) {
    const catalog = JSON.parse(source(`messages/${locale}/auth.json`));
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(english).sort(), `${locale}/auth keys`);
    for (const [key, englishMessage] of Object.entries(english)) {
      assert.equal(typeof catalog[key], "string", `${locale}/${key} must be a string`);
      assert.ok(catalog[key].trim().length > 0, `${locale}/${key} must not be empty`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(englishMessage), `${locale}/${key} placeholders`);
    }
  }
});

test("S2-auth source has no hard-coded user-visible English", () => {
  const failures = ownedFiles.flatMap((path) =>
    hardCodedVisibleEnglish(path).map((text) => `${path}: ${text}`)
  );
  assert.deepEqual(failures, []);
});

test("auth server routes load the auth namespace and pass it to client flows", () => {
  assert.match(source("app/login/page.tsx"), /loadNamespace\(locale, "auth"\)/);
  assert.match(source("app/login/page.tsx"), /<LoginFlow catalog=\{catalog\} \/>/);
  assert.match(source("app/sign-up/page.tsx"), /loadNamespace\(locale, "auth"\)/);
  assert.match(source("app/sign-up/page.tsx"), /<SignUpFlow catalog=\{catalog\} \/>/);
});

test("client-only auth and error surfaces resolve the selected auth catalogue", () => {
  const enrollment = source("app/enroll-mfa/page.tsx");
  const segmentError = source("app/error.tsx");
  const globalError = source("app/global-error.tsx");
  for (const clientSource of [enrollment, segmentError, globalError]) {
    assert.doesNotMatch(clientSource, /messages\/en\/auth\.json/);
    assert.match(clientSource, /useSelectedAuthCatalog/);
  }
  assert.match(enrollment, /useChromeI18n\(\)/);
  assert.match(segmentError, /useChromeI18n\(\)/);
  assert.match(globalError, /LOCALE_COOKIE/);
  assert.match(globalError, /<html lang=\{locale\} dir=\{localeDefinition\.dir\}>/);
});

test("sign-up localizes successful registration and resend responses", () => {
  const signUp = source("components/SignUpFlow.tsx");
  assert.doesNotMatch(signUp, /result\.message/);
  assert.match(signUp, /auth\.signUp\.registrationSent/);
  assert.match(signUp, /auth\.signUp\.resendSent/);
});

test("the canonical verification route still delegates to MFA enrollment", () => {
  assert.match(source("app/verify-email/page.tsx"), /export \{ default \} from "\.\.\/enroll-mfa\/page"/);
});
