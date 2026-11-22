// tests/architecture/ci-fast-path.test.ts
// The text-only fast path (tools/ci-fast-path.mjs): which changes may run fewer tests, and which tests they run.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const productRoot = resolve(import.meta.dirname, "../..");

type Verdict =
  | { fast: false; reason: string }
  | { fast: true; legal: boolean; names: string[]; tests: string[] };
type FastPathModule = {
  classifyChange: (changed: string[]) => Verdict;
  selectTests: (files: string[], change: { legal: boolean; names: string[]; tests: string[] }, readText: (file: string) => string) => string[];
  LEGAL_NEEDLES: readonly string[];
};
// Dynamic import by URL: the tool is plain Node ESM with no type declarations.
const fastPath = (await import(pathToFileURL(resolve(productRoot, "tools/ci-fast-path.mjs")).href)) as FastPathModule;

const P = "dialectical-engine/";
const LEGAL_CHANGE = [
  `${P}apps/ui/legal/en/privacy-policy.md`,
  `${P}apps/ui/legal/archive/en/9468dd719a8948323ac8cb5723e881d00d54f52b85fa1101f4177e84431baae9.md`,
  `${P}apps/ui/legal/translated-from.json`,
  `${P}apps/ui/lib/legal/ro/privacyPolicy.ts`,
  `${P}apps/ui/lib/termsOfService.ts`,
  `${P}apps/ui/messages/ro/legal.json`,
  `${P}packages/legal-manifest/src/manifest.json`,
  `${P}tests/support/legalPrivacy316.ts`,
  `${P}tests/support/legalPrivacy316.json`,
  `${P}tests/unit/legal-privacy-316.test.ts`,
  `${P}tests/render/terms-modal-render.test.tsx`
];

describe("a text-only change", () => {
  it("is a change of legal texts, what is generated from them, their test helpers and test files", () => {
    expect(fastPath.classifyChange(LEGAL_CHANGE)).toEqual({
      fast: true,
      legal: true,
      names: [
        "9468dd719a8948323ac8cb5723e881d00d54f52b85fa1101f4177e84431baae9.md", "legal-privacy-316.test.ts", "legal.json",
        "legalPrivacy316.json", "legalPrivacy316.ts", "manifest.json", "privacy-policy.md", "privacyPolicy.ts",
        "terms-modal-render.test.tsx", "termsOfService.ts", "translated-from.json"
      ],
      tests: ["tests/render/terms-modal-render.test.tsx", "tests/unit/legal-privacy-316.test.ts"]
    });
  });
  it("is a change of documents: the docs folder, the runbooks under deploy, README and SECURITY files", () => {
    const verdict = fastPath.classifyChange([
      `${P}docs/operations/runbook.md`, `${P}deploy/preview-auth-dev/v1/MAIN-SITE.md`, `${P}README.md`, "README.md", "SECURITY.md",
      `${P}tests/unit/main-site-runbook.test.ts`
    ]);
    expect(verdict).toMatchObject({ fast: true, legal: false, tests: ["tests/unit/main-site-runbook.test.ts"] });
  });
  it("is never a change that holds anything else, and the refusal names the file", () => {
    for (const other of [
      `${P}apps/ui/lib/legal/pages.ts`, `${P}apps/ui/scripts/generate-legal-data.mjs`, `${P}apps/api/src/index.ts`,
      `${P}apps/ui/messages/ro/settings.json`, `${P}package.json`, `${P}pnpm-lock.yaml`, `${P}vitest.config.ts`,
      `${P}tools/ci-fast-path.mjs`, `${P}tools/ci-known-red.mjs`, ".github/workflows/security.yml",
      `${P}tests/support/testDatabase.ts`, `${P}tests/ci-known-red.txt`, `${P}tests/ci-integration-auth.txt`,
      `${P}migrations/0001_init.sql`, `${P}deploy/preview-auth-dev/v1/environment.mjs`, `${P}docs/missions/x/fix.patch`,
      `${P}tests/unit/fixtures/sample.md`
    ]) {
      expect(fastPath.classifyChange([...LEGAL_CHANGE, other]), other).toEqual({
        fast: false,
        reason: `${other} is not a legal text, a document or a test`
      });
    }
  });
  // These Markdown files are read by the product: the support answers, the story shapes and the prompts.
  it("does not take Markdown that the product reads for documentation", () => {
    for (const data of [
      `${P}packages/support-kb/articles/billing.md`, `${P}story-shapes/shapes/classic.md`, `${P}.hermes/prompts/judge.md`,
      `${P}packages/evaluator/rubric.md`, `${P}.claude/skills/x/SKILL.md`
    ]) {
      expect(fastPath.classifyChange([data]), data).toMatchObject({ fast: false });
    }
    for (const folder of ["packages/support-kb", "story-shapes", "docs", "deploy"]) expect(existsSync(resolve(productRoot, folder)), folder).toBe(true);
  });
  it("is never a change of test files and test helpers alone, nor an empty change", () => {
    expect(fastPath.classifyChange([`${P}tests/unit/legal-privacy-316.test.ts`, `${P}tests/support/legalPrivacy316.ts`]))
      .toEqual({ fast: false, reason: "only test files and test helpers changed" });
    expect(fastPath.classifyChange([])).toEqual({ fast: false, reason: "the change names no file" });
    expect(fastPath.classifyChange(["", "  "])).toEqual({ fast: false, reason: "the change names no file" });
  });
});

describe("the tests a text-only change runs", () => {
  const sources: Record<string, string> = {
    "tests/unit/changed.test.ts": "expect(1).toBe(1);",
    "tests/unit/names-the-file.test.ts": 'readFileSync(resolve(root, "deploy/preview-auth-dev/v1/MAIN-SITE.md"), "utf8")',
    "tests/unit/reads-legal.test.ts": 'readFileSync(resolve(root, "apps/ui/legal", code, "terms.md"), "utf8")',
    "tests/unit/walks.test.ts": "for (const name of readdirSync(root)) check(name);",
    "tests/unit/starts-a-program.test.ts": 'import { spawnSync } from "node:child_process"; spawnSync(process.execPath, ["tools/x.mjs"]);',
    "tests/unit/unrelated.test.ts": 'import { add } from "../../packages/kernel/src/add.js"; expect(add(1, 1)).toBe(2);'
  };
  const files = Object.keys(sources);
  const select = (change: { legal: boolean; names: string[]; tests: string[] }) =>
    fastPath.selectTests(files, change, (file) => sources[file]!);

  it("runs the changed tests, the tests that name a changed file, and the tests that walk folders or start programs", () => {
    expect(select({ legal: false, names: ["MAIN-SITE.md"], tests: ["tests/unit/changed.test.ts"] })).toEqual([
      "tests/unit/changed.test.ts", "tests/unit/names-the-file.test.ts", "tests/unit/walks.test.ts",
      "tests/unit/starts-a-program.test.ts"
    ]);
  });
  it("adds the tests that read the legal texts when a legal file changed, and only then", () => {
    expect(select({ legal: true, names: ["privacy-policy.md"], tests: [] })).toEqual([
      "tests/unit/reads-legal.test.ts", "tests/unit/walks.test.ts", "tests/unit/starts-a-program.test.ts"
    ]);
    expect(select({ legal: false, names: ["notes.md"], tests: [] })).not.toContain("tests/unit/reads-legal.test.ts");
  });
  it("leaves out a test that neither names the change nor reads beyond its imports", () => {
    expect(select({ legal: true, names: ["privacy-policy.md", "MAIN-SITE.md"], tests: [] })).not.toContain("tests/unit/unrelated.test.ts");
  });
});

// On the real tree: a legal change must reach every legal test, and the rule must stay a fast path.
describe("the fast path on this repository's own tests", () => {
  const gateFiles = ["unit", "architecture", "render"].flatMap((folder) =>
    readdirSync(resolve(productRoot, "tests", folder)).filter((name) => /\.test\.tsx?$/.test(name)).map((name) => `tests/${folder}/${name}`));
  const read = (file: string): string => readFileSync(resolve(productRoot, file), "utf8");

  it("runs every legal test, and every test that imports a legal test helper, for a legal change", () => {
    const verdict = fastPath.classifyChange([`${P}apps/ui/legal/en/privacy-policy.md`, `${P}packages/legal-manifest/src/manifest.json`]);
    expect(verdict.fast).toBe(true);
    if (!verdict.fast) return;
    const selected = new Set(fastPath.selectTests(gateFiles, verdict, read));
    const legalTests = gateFiles.filter((file) => /^tests\/(unit|render)\/legal-/.test(file) || /support\/legal/.test(read(file)));
    expect(legalTests.length).toBeGreaterThan(20);
    for (const file of legalTests) expect(selected.has(file), file).toBe(true);
    expect(selected.size).toBeLessThan(gateFiles.length / 2);
  });
  it("keeps the path fast for a single document", () => {
    const verdict = fastPath.classifyChange([`${P}docs/operations/a-new-note.md`]);
    expect(verdict.fast).toBe(true);
    if (!verdict.fast) return;
    expect(fastPath.selectTests(gateFiles, verdict, read).length).toBeLessThan(gateFiles.length / 2);
  });
});
