// tools/ci-fast-path.mjs — which tests a text-only pull request runs.
//
// A pull request that changes only the legal texts (with the copies generated from them and their tests) or only
// documentation cannot change what the code does. For such a change the known-red gate (tools/ci-known-red.mjs) runs
// the tests that can notice it and leaves the rest to the run that follows the merge, on dev, where every test runs.
//
// The tests that can notice a text change are the ones that
//   - were changed themselves,
//   - name a changed file by its file name,
//   - name the legal texts, when a legal text changed (LEGAL_NEEDLES),
//   - walk folders or start other programs, since such a test may read files it never names (SCANS).
// Everything else stays out. Any other kind of file in the change (code, configuration, a workflow, a test helper
// that is not a legal one, a Markdown file that is product data) turns the fast path off and the whole suite runs.
//
// Plain Node ESM, no dependencies.

const PRODUCT = "dialectical-engine/";

/** A test file the gate can run, as a repository path. */
const TEST_FILE = /^dialectical-engine\/tests\/[\w.-]+\/[\w.-]+\.test\.tsx?$/;

/** The legal texts and what is generated from them. */
const LEGAL_FILES = [
  /^dialectical-engine\/apps\/ui\/legal\//,
  /^dialectical-engine\/apps\/ui\/lib\/legal\/[a-z-]+\/(privacyPolicy|termsOfService)\.ts$/,
  /^dialectical-engine\/apps\/ui\/lib\/(privacyPolicy|termsOfService)\.ts$/,
  /^dialectical-engine\/apps\/ui\/messages\/[a-z-]+\/legal\.json$/,
  /^dialectical-engine\/packages\/legal-manifest\/src\/manifest\.json$/
];

/** The helpers of the legal tests. They may change with a legal text, never as a text-only change of their own. */
const LEGAL_TEST_HELPERS = /^dialectical-engine\/tests\/support\/legal[\w.-]*\.(ts|json)$/;

/**
 * Documentation: the docs folder, the operator runbooks under deploy, and README and SECURITY files. Markdown
 * elsewhere is not listed on purpose: the support knowledge base, the story shapes and the prompt files are read by
 * the product, so a change to one of them is a change to what the product does.
 */
const DOCUMENT_FILES = [
  /^dialectical-engine\/docs\/.+\.md$/,
  /^dialectical-engine\/deploy\/.+\.md$/,
  /(^|\/)README\.md$/,
  /^SECURITY\.md$/
];

/** What a test that reads the legal texts has in its source. */
export const LEGAL_NEEDLES = Object.freeze([
  "apps/ui/legal", "lib/legal", "legal-manifest", "privacyPolicy", "termsOfService", "privacy-policy",
  "terms-of-service", "support/legal", "legal.json", "generate-legal", "legal-release-check"
]);

/** A test that lists folders or starts another program may read any file, named in it or not. */
const SCANS = /child_process|readdirSync|readdir\(|opendir|ls-files|\bglob/;

const matchesAny = (patterns, path) => patterns.some((pattern) => pattern.test(path));
const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);

/**
 * Decide whether `changed` (repository paths, as `git diff --name-only` prints them) is a text-only change.
 * Returns `{ fast: false, reason }`, or `{ fast: true, legal, names, tests }`: whether a legal file is in it, the file
 * names of what changed, and the changed test files as product-relative paths.
 * A change of test files and legal test helpers alone is not text-only: it must hold at least one legal text or
 * document.
 */
export function classifyChange(changed) {
  const files = [...new Set(changed.map((path) => path.trim()).filter((path) => path !== ""))];
  if (files.length === 0) return { fast: false, reason: "the change names no file" };
  let legal = false;
  let text = false;
  const tests = [];
  for (const path of files) {
    if (matchesAny(LEGAL_FILES, path)) { legal = true; text = true; continue; }
    if (matchesAny(DOCUMENT_FILES, path)) { text = true; continue; }
    if (LEGAL_TEST_HELPERS.test(path)) { legal = true; continue; }
    if (TEST_FILE.test(path)) { tests.push(path.slice(PRODUCT.length)); continue; }
    return { fast: false, reason: `${path} is not a legal text, a document or a test` };
  }
  if (!text) return { fast: false, reason: "only test files and test helpers changed" };
  return { fast: true, legal, names: [...new Set(files.map(baseName))].sort(), tests: tests.sort() };
}

/**
 * The test files of `files` (product-relative paths) that can notice the change `change` describes.
 * `readText` returns a test file's source.
 */
export function selectTests(files, change, readText) {
  const changedTests = new Set(change.tests);
  const needles = [...change.names, ...(change.legal ? LEGAL_NEEDLES : [])];
  return files.filter((file) => {
    if (changedTests.has(file)) return true;
    const source = readText(file);
    return SCANS.test(source) || needles.some((needle) => source.includes(needle));
  });
}
