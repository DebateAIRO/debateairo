import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const ownedFiles = [
  "app/settings/page.tsx",
  "components/AccountErasureControls.tsx",
  "components/SessionControls.tsx",
  "components/LegacyRunClaimControls.tsx",
  "app/ai-transparency/page.tsx",
  "app/admin/workers/page.tsx",
  "components/SettingsPageClient.tsx",
  "components/EvaluatorDevMenu.tsx"
];
const source = (path) => readFileSync(join(root, path), "utf8");
const sources = new Map(ownedFiles.map((path) => [path, source(path)]));
const englishPath = join(root, "messages/en/settings.json");
const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const allowedVisibleLiterals = new Set([
  "AI",
  "DebateAI",
  "data-ai-generated=\"true\"",
  "data-content-origin=\"automated\""
]);

function hardCodedVisibleEnglish(path, fileSource) {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    fileSource,
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
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

const formerCopy = [
  "Your asker scope",
  "Unable to load deployment",
  "Account deletion status is unavailable.",
  "Account deletion scheduled.",
  "Session operation failed",
  "Active sessions",
  "Fresh authentication",
  "Legacy debates could not be claimed.",
  "Claim legacy debates",
  "How we label AI content",
  "Generated content may be inaccurate or incomplete",
  "Operator-only view",
  "Unable to load evaluator status",
  "Evaluator dev menu",
  "No runs are circuit-broken."
];

test("every settings translation key used by owned source exists in English", () => {
  assert.ok(existsSync(englishPath), "messages/en/settings.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const used = new Set();
  for (const fileSource of sources.values()) {
    for (const match of fileSource.matchAll(/\bt\(\s*catalog\s*,\s*"(settings\.[A-Za-z0-9.]+)"/g)) {
      used.add(match[1]);
    }
    for (const match of fileSource.matchAll(/\btPlural\(\s*catalog\s*,\s*"(settings\.[A-Za-z0-9.]+)"/g)) {
      used.add(`${match[1]}.one`);
      used.add(`${match[1]}.other`);
    }
  }
  assert.ok(used.size > 0, "expected settings source files to use translation keys");
  assert.deepEqual([...used].sort(), Object.keys(english).sort());
});

test("all 35 locales expose the exact settings contract and translated sample", () => {
  assert.ok(existsSync(englishPath), "messages/en/settings.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const localeDirectories = readdirSync(join(root, "messages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  const catalogs = new Map();
  for (const locale of localeDirectories) {
    const catalog = JSON.parse(source(`messages/${locale}/settings.json`));
    catalogs.set(locale, catalog);
    assertLocalizedCatalog({ english, localized: catalog, locale, namespace: "settings" });
  }
  assertTranslationSample({ catalogs, english, namespace: "settings" });
});

test("protected product names stay out of translatable settings copy", () => {
  assert.ok(existsSync(englishPath), "messages/en/settings.json must exist");
  const english = JSON.parse(readFileSync(englishPath, "utf8"));
  const joined = Object.values(english).join("\n");
  for (const protectedName of ["DebateAI", "Dialectical Engine", "vLLM"]) {
    assert.equal(joined.includes(protectedName), false, `${protectedName} must be interpolated from source`);
  }
});

test("S2-settings source has no hard-coded user-visible English", () => {
  const failures = [...sources].flatMap(([path, fileSource]) =>
    hardCodedVisibleEnglish(path, fileSource).map((text) => `${path}: ${text}`)
  );
  assert.deepEqual(failures, []);

  const joined = [...sources.values()].join("\n");
  for (const copy of formerCopy) {
    assert.equal(joined.includes(copy), false, `hard-coded copy remains: ${copy}`);
  }
});

test("server settings routes load settings while client controls receive their catalog", () => {
  const page = sources.get("app/settings/page.tsx");
  assert.doesNotMatch(page, /^"use client";/);
  assert.match(page, /loadNamespace\(locale, "settings"\)/);
  // Review F2 (REV-FIX-CATALOGS): the page also serves the newDebate catalogue
  // so the AuthGate's "Checking session…" paints in the reader's language.
  assert.match(page, /loadNamespace\(locale, "newDebate"\)/);
  assert.match(page, /<SettingsPageClient catalog=\{catalog\} locale=\{locale\} newDebateCatalog=\{newDebateCatalog\} \/>/);

  for (const path of ["app/ai-transparency/page.tsx", "app/admin/workers/page.tsx"]) {
    assert.match(sources.get(path), /loadNamespace\(locale, "settings"\)/, path);
  }
  const client = sources.get("components/SettingsPageClient.tsx");
  for (const component of ["SessionControls", "LegacyRunClaimControls", "AccountErasureControls"]) {
    assert.match(client, new RegExp(`<${component} catalog=\\{catalog\\}`), component);
  }
});

test("security and transparency behavior survives the copy migration", () => {
  const settingsClient = sources.get("components/SettingsPageClient.tsx");
  const erasure = sources.get("components/AccountErasureControls.tsx");
  assert.match(settingsClient, /<AccountErasureControls catalog=\{catalog\}/);
  // V 2026-09-26 ("Translate it"): the phrase the reader types comes from the
  // reader's catalogue; English keeps the exact phrase and exact matching. The
  // API wire literal stays in packages/contract and is not the UI's to change.
  assert.match(erasure, /t\(catalog, "settings\.erasure\.confirmationPhrase"\)/);
  assert.doesNotMatch(erasure, /const CONFIRMATION = "DELETE MY ACCOUNT"/);
  assert.match(erasure, /if \(locale === "en"\) return typed === phrase;/);
  assert.equal(JSON.parse(readFileSync(englishPath, "utf8"))["settings.erasure.confirmationPhrase"], "DELETE MY ACCOUNT");
  assert.match(erasure, /action: "DELETE_ACCOUNT"/);
  assert.doesNotMatch(erasure, /target_run_id/);
  assert.match(erasure, /scheduleAccountErasure\(grant\.token\)/);
  assert.match(erasure, /readAccountErasure\(\)/);
  assert.match(erasure, /cancelAccountErasure\(current\.cancellation_ref\)/);
  assert.match(erasure, /scheduled\.status === "PROCESSING"/);
  assert.doesNotMatch(erasure, /admin|operator|DSAR/i);
  assert.match(erasure, /window\.setInterval\(\(\)=>\{ void refresh\(\); \},5_000\)/);

  const sessions = sources.get("components/SessionControls.tsx");
  assert.match(sessions, /autoComplete="current-password"/);
  assert.match(sessions, /autoComplete="one-time-code"/);
  assert.match(sessions, /revokeAllSessions\(\)/);

  const transparency = sources.get("app/ai-transparency/page.tsx");
  assert.match(transparency, /data-ai-generated/);
  assert.match(transparency, /data-content-origin/);

  const workers = sources.get("app/admin/workers/page.tsx");
  assert.doesNotMatch(workers, /@\/lib\/(?:api|serverApi)/);
  assert.doesNotMatch(workers, /backendStatus|readDeployment|contractClient|setInterval/);

  assert.match(settingsClient, /process\.env\.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"/);
  assert.match(settingsClient, /process\.env\.NODE_ENV !== "production"/);
  assert.match(settingsClient, /<EvaluatorDevMenu/);
  assert.doesNotMatch(source("app/new/page.tsx"), /EvaluatorDevMenu/);

  const operatorStart = settingsClient.indexOf("function OperatorSettingsScreen");
  assert.ok(operatorStart >= 0, "the operator settings screen is present");
  const operatorSettings = settingsClient.slice(operatorStart);
  assert.match(operatorSettings, /getSettingsView/);
  assert.doesNotMatch(operatorSettings, /apiFetch|saveSettings|method:\s*"PUT"/);

  assert.match(settingsClient, /<LegacyRunClaimControls catalog=\{catalog\}/);
  const legacy = sources.get("components/LegacyRunClaimControls.tsx");
  assert.match(legacy, /client\.claimLegacyRuns\(submittedToken\)/);
  assert.ok(
    legacy.indexOf('setLegacyToken("")') < legacy.indexOf("client.claimLegacyRuns(submittedToken)"),
    "legacy token must clear before the claim request"
  );
  assert.doesNotMatch(legacy, /localStorage|sessionStorage|console\./);
});

test("the English allowlist no longer exempts S2-settings files", () => {
  const allowlist = source("lib/i18n/english-allowlist.txt");
  for (const path of ownedFiles) {
    assert.doesNotMatch(allowlist, new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});
