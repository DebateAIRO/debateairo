import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const sourcePaths = [
  "app/public/debate/[id]/PublicDebatePageClient.tsx",
  "app/public/debate/[id]/page.tsx",
  "components/PublicDebateOverview.tsx",
  "components/PublicAnswerDisclosure.tsx",
  "components/PublicHonestyDrawer.tsx",
  "components/PublicationControl.tsx",
  "lib/publicDebatePresentation.ts",
  "lib/v3/publicAnswerExport.ts"
];
const sources = new Map(sourcePaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
const catalogPath = join(root, "messages/en/public.json");

const currentHardCodedCopy = [
  "Export the published snapshot",
  "Exported the published snapshot",
  "Public debate · by",
  "Residual objections",
  "What could reverse this answer?",
  "VERDICT UNAVAILABLE",
  "No published",
  "final strength withheld",
  "Model lineage unavailable",
  "Challenge locked in public view",
  "Composed verdict prose was not included in this published snapshot.",
  "No classified side strength is available",
  "The strongest surviving argument on each side",
  "Viewing publicly — sign in to challenge, regenerate, or flag claims.",
  "Published debates may be indexed by search engines.",
  "Published snapshot",
  "Answer honesty",
  "Risk tier: not included in this public snapshot.",
  "Publication status is unavailable.",
  "Published. Anyone with the link can read it",
  "Publication change was not authorized.",
  "Private debate deletion is pending durable key cleanup.",
  "Publishing makes this debate readable by anyone",
  "Checking visibility…",
  "Account password",
  "Authenticator code",
  "Delete this private debate",
  "Permanently delete private debate",
  "Not measured"
];

function visibleEnglish(path, source) {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
  const add = (value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
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

test("the public namespace exists and covers every public translation call", () => {
  assert.equal(existsSync(catalogPath), true, "messages/en/public.json must exist");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const usedKeys = new Set();
  for (const source of sources.values()) {
    for (const match of source.matchAll(/\bt\(\s*[^,]+,\s*["'](public\.[A-Za-z0-9.]+)["']/g)) {
      usedKeys.add(match[1]);
    }
  }
  assert.ok(usedKeys.size > 0, "S2-public sources must use public namespace keys");
  for (const key of usedKeys) assert.ok(Object.hasOwn(catalog, key), `missing ${key}`);
  assert.deepEqual([...usedKeys].sort(), Object.keys(catalog).sort(), "public catalog has no unused keys");
});

test("all 35 locales carry the final English public catalog", () => {
  const messagesRoot = join(root, "messages");
  const localeDirectories = readdirSync(messagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  const english = JSON.parse(readFileSync(catalogPath, "utf8"));
  for (const locale of localeDirectories) {
    const localized = JSON.parse(readFileSync(join(messagesRoot, locale, "public.json"), "utf8"));
    assert.deepEqual(localized, english, `${locale}/public catalog`);
  }
});

test("S2-public sources contain no hard-coded user-visible English", () => {
  const visibleFailures = [...sources].flatMap(([path, source]) =>
    visibleEnglish(path, source).map((copy) => `${path}: ${copy}`)
  );
  assert.deepEqual(visibleFailures, []);

  const joined = [...sources.values()].join("\n");
  for (const copy of currentHardCodedCopy) {
    assert.equal(joined.includes(copy), false, `hard-coded copy remains: ${copy}`);
  }

  const overview = sources.get("components/PublicDebateOverview.tsx");
  assert.doesNotMatch(overview, /["'](?:PRO|CON)["']/);
});

test("the public overview keeps the guarded verdict-first structure and owner return path", () => {
  const overview = sources.get("components/PublicDebateOverview.tsx");
  const page = sources.get("app/public/debate/[id]/PublicDebatePageClient.tsx");
  const serverPage = sources.get("app/public/debate/[id]/page.tsx");
  assert.match(serverPage, /loadNamespace\(locale, "public"\)/);
  assert.match(serverPage, /publicCatalog=\{publicCatalog\}/);
  assert.match(page, /<PublicDebateOverview/);
  assert.match(overview, /data-design-turn="3b"/);
  assert.match(overview, /className="publicVerdictShell"/);
  assert.match(overview, /className="publicSupportRow"/);
  assert.match(overview, /className="publicArgumentGrid"/);
  assert.match(overview, /next=\$\{encodeURIComponent\(returnPath\)\}/);
});

test("the public route threads debateChrome through the server-client boundary", () => {
  const serverPage = sources.get("app/public/debate/[id]/page.tsx");
  const clientPage = sources.get("app/public/debate/[id]/PublicDebatePageClient.tsx");
  assert.match(serverPage, /loadNamespace\(locale, "debateChrome"\)/);
  assert.match(serverPage, /debateChromeCatalog=\{debateChromeCatalog\}/);
  assert.match(clientPage, /debateChromeCatalog: MessageCatalog/);
  assert.match(
    clientPage,
    /<DebatePageClient[\s\S]*?debateChromeCatalog=\{debateChromeCatalog\}/
  );
});
