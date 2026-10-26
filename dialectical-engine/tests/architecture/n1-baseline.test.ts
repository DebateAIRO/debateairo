import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The N-1 compatibility job (side-by-side spec 2026-10-21 §5; plan A, task A10). CI checks out the release that is live
 * (`tests/n1-baseline.json`'s `commit`) beside HEAD, migrates a fresh database with HEAD's migrate-cli
 * (★DEBATEAI_TEST_SCHEMA_FROM, tests/support/testDatabase.ts) and runs the OLD commit's database suites on it, judged by
 * the old commit's own known-red list. Until a release is fenced the commit is null and the job stops green with
 * N1_BASELINE_NONE. These rows hold the baseline file, its reader and the workflow to that shape.
 */
const productRoot = resolve(import.meta.dirname, "../..");
const gitRoot = resolve(productRoot, "..");
const BASELINE_PATH = "tests/n1-baseline.json";
const WORKFLOW_PATH = ".github/workflows/n1-compatibility.yml";
/** Suites that test the migration chain itself (or the preview's auth layout) cannot run on a database migrated ahead. */
const EXCLUDED_SUITE = /migration|lineage|forward|upgrade|preview-auth/u;
const INITIAL_SUITES = Object.freeze([
  "b3-holds-waiting-line", "b7b-waiting-line", "v28-model-spend", "story-budget", "reclaim-resume-database",
  "run-setup-failure", "runner-preview-team-gate", "live-run-events", "identity-database", "session-database",
  "staff-access-database", "internal-allowance-database"
].map((name) => `tests/integration/${name}.test.ts`));

type Entry = Readonly<{ name: string; reason: string }>;
type Baseline = Readonly<{
  schema: string; commit: string | null; reason: string; suites: readonly string[];
  setAside: readonly Entry[]; knownRed: readonly Entry[];
}>;
const { parseN1Baseline, knownRedLines } = await import(pathToFileURL(resolve(productRoot, "tools/n1-baseline.mjs")).href) as {
  parseN1Baseline: (text: string) => Baseline;
  knownRedLines: (baseline: Baseline) => readonly string[];
};
const { parseAllowlist } = await import(pathToFileURL(resolve(productRoot, "tools/ci-known-red.mjs")).href) as {
  parseAllowlist: (text: string) => { entries: string[]; invalid: string[] };
};
const baselineText = (): string => readFileSync(resolve(productRoot, BASELINE_PATH), "utf8");
const tool = (...args: string[]): string => execFileSync(process.execPath, ["tools/n1-baseline.mjs", ...args], {
  cwd: productRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
});
const workflow = (): string => readFileSync(resolve(gitRoot, WORKFLOW_PATH), "utf8");

describe("side-by-side §5: the N-1 baseline file", () => {
  it("has exactly schema, commit, reason and suites (and optionally setAside, knownRed); a null commit carries its reason", () => {
    const raw = JSON.parse(baselineText()) as Record<string, unknown>;
    expect(Object.keys(raw).filter((key) => !["knownRed", "setAside"].includes(key)).sort())
      .toEqual(["commit", "reason", "schema", "suites"]);
    expect(raw.schema).toBe("debateai-n1-baseline-v1");
    expect(raw.commit === null || (typeof raw.commit === "string" && /^[0-9a-f]{40}$/u.test(raw.commit))).toBe(true);
    if (raw.commit === null) expect(typeof raw.reason === "string" && raw.reason.trim() !== "").toBe(true);
    expect(parseN1Baseline(baselineText()).commit).toBe(raw.commit);
  });

  it("names existing database suites, none of which tests the migration chain itself", () => {
    const { suites } = parseN1Baseline(baselineText());
    expect(suites.length).toBeGreaterThan(0);
    expect(new Set(suites).size).toBe(suites.length);
    for (const suite of suites) {
      expect(suite, suite).toMatch(/^tests\/integration\/[\w.-]+\.test\.ts$/u);
      expect(existsSync(resolve(productRoot, suite)), suite).toBe(true);
      expect(EXCLUDED_SUITE.test(suite), suite).toBe(false);
    }
    // The first twelve stay on the list: the list may grow, never shrink in silence. A suite leaves it only into
    // `setAside`, with its reason (r20: staff-access-database builds a historical migration lineage itself).
    const setAsideSuites = parseN1Baseline(baselineText()).setAside.map((entry) => entry.name);
    for (const suite of INITIAL_SUITES) expect([...suites, ...setAsideSuites], suite).toContain(suite);
  });

  it("names each set-aside or known-red test once, in a listed suite, with a one-line reason the old gate can read", () => {
    const baseline = parseN1Baseline(baselineText());
    const names = [...baseline.setAside, ...baseline.knownRed].map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of [...baseline.setAside, ...baseline.knownRed]) {
      expect(entry.reason.trim(), entry.name).not.toBe("");
      if (/^tests\/integration\/[\w.-]+\.test\.ts$/u.test(entry.name)) {
        expect(baseline.setAside, entry.name).toContain(entry);
        expect(baseline.suites, entry.name).not.toContain(entry.name);
        expect(existsSync(resolve(productRoot, entry.name)), entry.name).toBe(true);
      } else {
        expect(baseline.suites, entry.name).toContain(entry.name.split(" > ")[0]);
      }
    }
    // The lines the job appends parse as the old tools/ci-known-red.mjs reads its list: test names only, each once.
    const lines = knownRedLines(baseline);
    const parsed = parseAllowlist(`${lines.join("\n")}\n`);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.entries).toEqual(names.filter((name) => name.includes(" > ")));
    for (const line of lines) expect(line === "" || line.startsWith("#") || parsed.entries.includes(line), line).toBe(true);
  });

  it("refuses N1_BASELINE_INVALID on any shape error", () => {
    const good = JSON.parse(baselineText()) as Record<string, unknown>;
    const suite0 = (good.suites as string[])[0]!;
    const variants: readonly unknown[] = [
      "not json",
      [],
      { ...good, extra: true },
      (({ reason: _reason, ...rest }) => rest)(good),
      { ...good, schema: "debateai-n1-baseline-v2" },
      { ...good, commit: null, reason: " " },
      { ...good, commit: "ABCDEF" },
      { ...good, commit: "a".repeat(39) },
      { ...good, reason: 7 },
      { ...good, suites: [] },
      { ...good, suites: "tests/integration/b7b-waiting-line.test.ts" },
      { ...good, suites: ["tests/integration/b7b-waiting-line.test.ts", "tests/integration/b7b-waiting-line.test.ts"] },
      { ...good, suites: ["tests/unit/test-schema-from.test.ts"] },
      { ...good, suites: ["tests/integration/../unit/x.test.ts"] },
      { ...good, suites: ["tests/integration/migration-per-step.test.ts"] },
      { ...good, suites: ["tests/integration/side-by-side-releases-forward0123.test.ts"] },
      { ...good, suites: ["tests/integration/preview-auth-stack.test.ts"] },
      { ...good, setAside: "x" },
      { ...good, knownRed: {} },
      { ...good, knownRed: [null] },
      { ...good, knownRed: [{ name: `${suite0} > d > t` }] },
      { ...good, knownRed: [{ name: `${suite0} > d > t`, reason: "r", extra: 1 }] },
      { ...good, knownRed: [{ name: `${suite0} > d > t`, reason: " " }] },
      { ...good, knownRed: [{ name: `${suite0} > d > t`, reason: "two\nlines" }] },
      { ...good, knownRed: [{ name: `${suite0} > d > t\nx`, reason: "r" }] },
      { ...good, knownRed: [{ name: `${suite0} > t`, reason: "r" }] },
      { ...good, knownRed: [{ name: `${suite0} >  > t`, reason: "r" }] },
      { ...good, knownRed: [{ name: suite0, reason: "a whole suite is set aside, never known red" }] },
      { ...good, knownRed: [{ name: "tests/integration/not-listed.test.ts > d > t", reason: "r" }] },
      { ...good, knownRed: [{ name: `# ${suite0} > d > t`, reason: "r" }] },
      { ...good, setAside: [{ name: suite0, reason: "a listed suite cannot be set aside" }] },
      { ...good, setAside: [{ name: `${suite0} > d > t`, reason: "r" }], knownRed: [{ name: `${suite0} > d > t`, reason: "r" }] }
    ];
    for (const variant of variants) {
      const text = typeof variant === "string" ? variant : JSON.stringify(variant);
      expect(() => parseN1Baseline(text), text).toThrow("N1_BASELINE_INVALID");
    }
    expect(parseN1Baseline(JSON.stringify({ ...good, commit: "0123456789abcdef0123456789abcdef01234567", reason: "" })).commit)
      .toBe("0123456789abcdef0123456789abcdef01234567");
    // Both lists are optional (the release guide empties knownRed when it moves the commit on).
    const bare = (({ setAside: _s, knownRed: _k, ...rest }) => rest)(good);
    expect(parseN1Baseline(JSON.stringify(bare)).knownRed).toEqual([]);
    expect(parseN1Baseline(JSON.stringify({ ...good, knownRed: [] })).knownRed).toEqual([]);
  });

  it("the reader prints the commit (or none) and the suites one per line, and refuses anything else", () => {
    const baseline = parseN1Baseline(baselineText());
    expect(tool("commit")).toBe(`${baseline.commit ?? "none"}\n`);
    expect(tool("suites")).toBe(`${baseline.suites.join("\n")}\n`);
    expect(tool("known-red")).toBe(`${knownRedLines(baseline).join("\n")}\n`);
    for (const args of [[], ["release"], ["commit", "extra"], ["known-red", "extra"]]) {
      expect(() => tool(...args), args.join(" ")).toThrow(/N1_BASELINE_INVALID/u);
    }
  });
});

describe("side-by-side §5: the N-1 compatibility workflow", () => {
  it("checks out the released commit beside HEAD and runs its suites on HEAD's schema through its own known-red gate", () => {
    const text = workflow();
    for (const needle of ["DEBATEAI_TEST_SCHEMA_FROM", "tools/n1-baseline.mjs commit", "worktree add", "ci-known-red.mjs"]) {
      expect(text, needle).toContain(needle);
    }
    expect(text).toMatch(/^  old-code-on-new-schema:$/mu);
    expect(text).toMatch(/^    timeout-minutes: 60$/mu);
    expect(text).toMatch(/^  workflow_dispatch:$/mu);
    expect(text).not.toMatch(/^  (push|schedule):/mu);
    expect(text).toContain("N1_BASELINE_NONE");
    expect(text).toContain("DEBATEAI_TEST_SCHEMA_FROM: ${{ github.workspace }}/head/dialectical-engine");
    expect(text).toContain("node tools/ci-known-red.mjs $(node \"$GITHUB_WORKSPACE/head/dialectical-engine/tools/n1-baseline.mjs\" suites)");
    // HEAD's set-aside and known-red test names join the OLD checkout's list, before that old gate runs.
    const append = "{ echo; node \"$GITHUB_WORKSPACE/head/dialectical-engine/tools/n1-baseline.mjs\" known-red; } >> tests/ci-known-red.txt";
    expect(text).toContain(append);
    expect(text.indexOf(append)).toBeLessThan(text.indexOf("node tools/ci-known-red.mjs $("));
    // An old checkout's source-map-hotfix allow-list cannot learn a new label, so pnpm and node are called directly.
    expect(text).not.toContain("node tools/source-map-hotfix.mjs");
    for (const folder of ["head", "old"]) {
      expect(text).toContain(`working-directory: ${folder}/dialectical-engine`);
    }
    expect(text.match(/pnpm install --frozen-lockfile/gu)?.length).toBe(2);
    expect(text.match(/pnpm run generate:contract/gu)?.length).toBe(2);
    const pullRequest = text.slice(text.indexOf("\n  pull_request:\n"), text.indexOf("\n  workflow_dispatch:"));
    expect(pullRequest).toContain("branches: [main, dev]");
    const paths = [...pullRequest.matchAll(/^      - "([^"]+)"$/gmu)].map((match) => match[1]);
    expect(paths).toEqual([
      "dialectical-engine/migrations/**", "dialectical-engine/packages/db/**", "dialectical-engine/packages/budget/**",
      "dialectical-engine/tests/n1-baseline.json", WORKFLOW_PATH
    ]);
    for (const path of paths) expect(existsSync(resolve(gitRoot, path!.replace(/\/\*\*$/u, ""))), path).toBe(true);
  });

  it("uses exactly security.yml's pinned actions and pnpm/node versions", () => {
    const security = readFileSync(resolve(gitRoot, ".github/workflows/security.yml"), "utf8");
    const pins = (text: string): readonly string[] =>
      [...new Set([...text.matchAll(/uses: ([\w./-]+@[0-9a-f]{40} # v[\d.]+)/gu)].map((match) => match[1]!))].sort();
    const securityPins = pins(security);
    const ours = pins(workflow());
    expect(ours.length).toBeGreaterThan(0);
    for (const pin of ours) expect(securityPins, pin).toContain(pin);
    for (const pattern of [/version: (\d+\.\d+\.\d+) \}/u, /node-version: (\d+\.\d+\.\d+)/u]) {
      expect(workflow().match(pattern)?.[1], String(pattern)).toBe(security.match(pattern)?.[1]);
    }
  });
});
