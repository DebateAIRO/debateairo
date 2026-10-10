// tests/architecture/ci-known-red-gate.test.ts
// B31 — the CI verify job fails only on NEW failures. The recorded known-red allowlist
// (tests/ci-known-red.txt) and the gate that reads it (tools/ci-known-red.mjs) are pinned here.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const productRoot = resolve(import.meta.dirname, "../..");
const allowlistPath = resolve(productRoot, "tests/ci-known-red.txt");

type Decision = { newFailures: string[]; knownFailures: string[]; flakyFailures?: string[]; stale: string[]; exitCode: number };
type GateModule = {
  decide: (input: { failed: string[]; allowlist: string[]; ran?: string[]; flaky?: string[] }) => Decision;
  parseAllowlist: (text: string) => { entries: string[]; invalid: string[] };
  failedNamesFromReport: (report: unknown, rootDir: string) => { failed: string[]; passed: string[]; ran: string[]; messages: Record<string, string> };
  summary: (decision: Pick<Decision, "newFailures" | "knownFailures" | "stale">) => string;
  rerunTargets: (stale: string[]) => string[];
  expandTargets: (args: string[], readText?: (path: string) => string, exists?: (path: string) => boolean, listDirectory?: (path: string) => string[]) => {
    targets: string[]; invalid: string[]; excluded: { path: string; list: string }[];
  };
  exclusionReport: (excluded: { path: string; list: string }[]) => string[];
  missingTargets: (targets: string[], report: unknown, rootDir: string) => string[];
  confirmStale: (input: { stale: string[]; rerunPasses: string[][] }) => { confirmed: string[]; cleared: string[] };
  gateExitCode: (input: { newFailures: string[]; confirmedStale: string[] }) => number;
  STALE_CONFIRMATION_RERUNS: number;
};
// Dynamic import by URL: the gate is plain Node ESM with no type declarations, and a literal
// specifier would make `tsc --noEmit` demand one.
const gate = (await import(pathToFileURL(resolve(productRoot, "tools/ci-known-red.mjs")).href)) as GateModule;

describe("CI known-red gate (B31)", () => {
  it("ships the allowlist and the gate", () => {
    expect(existsSync(allowlistPath), "tests/ci-known-red.txt").toBe(true);
    expect(existsSync(resolve(productRoot, "tools/ci-known-red.mjs")), "tools/ci-known-red.mjs").toBe(true);
  });

  it("parses every allowlist entry as a file > describe > it triple whose file exists", () => {
    const text = readFileSync(allowlistPath, "utf8");
    const { entries, invalid } = gate.parseAllowlist(text);
    expect(invalid, "unparseable allowlist lines").toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries).size, "duplicate allowlist entries").toBe(entries.length);
    for (const entry of entries) {
      const parts = entry.split(" > ");
      expect(parts.length, entry).toBeGreaterThanOrEqual(3);
      const file = parts[0] ?? "";
      // tests/integration joined 2026-10-09 with `pnpm run test:integration-all` (tests/ci-integration-all.txt).
      expect(file, entry).toMatch(/^tests\/(unit|architecture|integration)\/[\w.-]+\.test\.tsx?$/);
      expect(existsSync(resolve(productRoot, file)), `${file} (from ${entry})`).toBe(true);
      expect((parts.at(-1) ?? "").length, entry).toBeGreaterThan(0);
    }
  });

  it("records a source comment under every active entry", () => {
    const lines = readFileSync(allowlistPath, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = (lines[i] ?? "").trim();
      if (line === "" || line.startsWith("#")) continue;
      const next = (lines[i + 1] ?? "").trim();
      expect(next.startsWith("#") && next.includes("source:"), `no source comment under: ${line}`).toBe(true);
    }
  });

  it("passes when every failure is allowlisted, and names the known ones", () => {
    const allowlist = ["tests/unit/a.test.ts > suite > known one", "tests/unit/b.test.ts > suite > known two"];
    const decision = gate.decide({ failed: [...allowlist], allowlist });
    expect(decision.newFailures).toEqual([]);
    expect(decision.knownFailures).toEqual(allowlist);
    expect(decision.stale).toEqual([]);
    expect(decision.exitCode).toBe(0);
  });

  it("fails on a failure that is not on the allowlist", () => {
    const allowlist = ["tests/unit/a.test.ts > suite > known one"];
    const decision = gate.decide({ failed: ["tests/unit/a.test.ts > suite > known one", "tests/unit/c.test.ts > suite > brand new"], allowlist });
    expect(decision.newFailures).toEqual(["tests/unit/c.test.ts > suite > brand new"]);
    expect(decision.knownFailures).toEqual(["tests/unit/a.test.ts > suite > known one"]);
    expect(decision.exitCode).toBe(1);
  });

  it("reports an allowlisted test that passed as stale, without settling the gate on one run", () => {
    const allowlist = ["tests/unit/a.test.ts > suite > known one", "tests/unit/b.test.ts > suite > fixed since"];
    const decision = gate.decide({ failed: ["tests/unit/a.test.ts > suite > known one"], allowlist });
    expect(decision.stale).toEqual(["tests/unit/b.test.ts > suite > fixed since"]);
    expect(decision.newFailures).toEqual([]);
    expect(decision.exitCode).toBe(0);
  });

  it("does not call an allowlisted entry stale when its test never ran", () => {
    const allowlist = ["tests/unit/a.test.ts > suite > known one", "tests/unit/b.test.ts > suite > not collected"];
    const decision = gate.decide({ failed: ["tests/unit/a.test.ts > suite > known one"], allowlist, ran: ["tests/unit/a.test.ts > suite > known one"] });
    expect(decision.stale).toEqual([]);
    expect(decision.exitCode).toBe(0);
  });

  it("builds vitest's printed full name from a report and keeps a file-level failure nameable", () => {
    const report = {
      success: false,
      testResults: [
        {
          name: `${productRoot}/tests/unit/a.test.ts`,
          status: "failed",
          assertionResults: [
            { ancestorTitles: ["suite", "nested"], title: "red one", status: "failed", failureMessages: ["AssertionError: nope"] },
            { ancestorTitles: ["suite"], title: "green one", status: "passed", failureMessages: [] }
          ]
        },
        { name: `${productRoot}/tests/unit/b.test.ts`, status: "failed", assertionResults: [] }
      ]
    };
    const { failed, ran, messages } = gate.failedNamesFromReport(report, productRoot);
    expect(failed).toEqual(["tests/unit/a.test.ts > suite > nested > red one", "tests/unit/b.test.ts"]);
    expect(ran).toEqual(["tests/unit/a.test.ts > suite > nested > red one", "tests/unit/a.test.ts > suite > green one"]);
    expect(messages["tests/unit/a.test.ts > suite > nested > red one"]).toContain("AssertionError: nope");
  });

  it("names a file's own error (a file-level hook that threw) beside its failed tests, so it cannot hide behind them", () => {
    const report = {
      success: false,
      testResults: [
        {
          name: `${productRoot}/tests/integration/a.test.ts`,
          status: "failed",
          message: "afterAll hook threw",
          assertionResults: [{ ancestorTitles: ["suite"], title: "listed red", status: "failed", failureMessages: ["AssertionError: known"] }]
        },
        {
          name: `${productRoot}/tests/integration/b.test.ts`,
          status: "failed",
          message: "",
          assertionResults: [{ ancestorTitles: ["suite"], title: "listed red", status: "failed", failureMessages: ["AssertionError: known"] }]
        }
      ]
    };
    const { failed, messages } = gate.failedNamesFromReport(report, productRoot);
    expect(failed).toEqual(["tests/integration/a.test.ts > suite > listed red", "tests/integration/a.test.ts", "tests/integration/b.test.ts > suite > listed red"]);
    expect(messages["tests/integration/a.test.ts"]).toBe("afterAll hook threw");
    const decision = gate.decide({ failed, allowlist: ["tests/integration/a.test.ts > suite > listed red", "tests/integration/b.test.ts > suite > listed red"] });
    expect(decision.newFailures).toEqual(["tests/integration/a.test.ts"]);
  });

  it("names the tests that passed, beside the ones that failed", () => {
    const report = {
      success: false,
      testResults: [{
        name: `${productRoot}/tests/unit/a.test.ts`,
        status: "failed",
        assertionResults: [
          { ancestorTitles: ["suite"], title: "red one", status: "failed", failureMessages: ["AssertionError: nope"] },
          { ancestorTitles: ["suite"], title: "green one", status: "passed", failureMessages: [] },
          { ancestorTitles: ["suite"], title: "skipped one", status: "skipped", failureMessages: [] }
        ]
      }]
    };
    const { passed } = gate.failedNamesFromReport(report, productRoot);
    expect(passed).toEqual(["tests/unit/a.test.ts > suite > green one"]);
  });

  it("keeps the recorded report line byte for byte — other records quote it", () => {
    expect(gate.summary({ newFailures: ["one"], knownFailures: ["two", "three"], stale: [] }))
      .toBe("CI_KNOWN_RED_GATE new=1 known=2 stale=0");
  });

  it("rejects an allowlist line that is not a full test name", () => {
    const { entries, invalid } = gate.parseAllowlist(["# a comment", "", "tests/unit/a.test.ts > suite > fine", "tests/unit/a.test.ts", "not-a-test-path > suite > title"].join("\n"));
    expect(entries).toEqual(["tests/unit/a.test.ts > suite > fine"]);
    expect(invalid).toEqual(["tests/unit/a.test.ts", "not-a-test-path > suite > title"]);
  });
});

// V-4 (ruled 2026-09-21, follow-up included): a listed test that has started passing must FAIL the
// gate until its entry is deleted — the list can only shrink. The owner's wording was "three
// consecutive default-branch runs", which would need cross-run state; the coordinator ruled the
// same intent WITHOUT it: when a listed test passes, the gate re-runs just that test's file twice
// more in the same job, and an entry that passed all three executions is confirmed and fails the
// gate. A flake has to pass three times running to be named; a test that was genuinely fixed is
// named in the very change that fixed it.
describe("CI known-red gate — a confirmed stale entry fails (V-4)", () => {
  it("re-runs exactly twice, so a confirmed entry has passed three times running", () => {
    expect(gate.STALE_CONFIRMATION_RERUNS).toBe(2);
  });

  it("re-runs only the files the stale entries live in, each once", () => {
    expect(gate.rerunTargets([
      "tests/unit/a.test.ts > suite > one",
      "tests/architecture/b.test.ts > suite > two",
      "tests/unit/a.test.ts > suite > three"
    ])).toEqual(["tests/unit/a.test.ts", "tests/architecture/b.test.ts"]);
  });

  it("confirms an entry only when it passed in every re-run", () => {
    const fixed = "tests/unit/a.test.ts > suite > fixed since";
    const flaky = "tests/unit/b.test.ts > suite > flaky";
    const { confirmed, cleared } = gate.confirmStale({
      stale: [fixed, flaky],
      rerunPasses: [[fixed, flaky], [fixed]]
    });
    expect(confirmed).toEqual([fixed]);
    expect(cleared).toEqual([flaky]);
  });

  it("confirms nothing when a re-run reported no pass for the entry", () => {
    const fixed = "tests/unit/a.test.ts > suite > fixed since";
    expect(gate.confirmStale({ stale: [fixed], rerunPasses: [[], []] })).toEqual({ confirmed: [], cleared: [fixed] });
  });

  it("confirms nothing when there were no re-runs at all, so a missing run can never fail the gate", () => {
    const fixed = "tests/unit/a.test.ts > suite > fixed since";
    expect(gate.confirmStale({ stale: [fixed], rerunPasses: [] }).confirmed).toEqual([]);
  });

  it("fails the gate on a confirmed stale entry, and on a new failure, and on nothing else", () => {
    const fixed = "tests/unit/a.test.ts > suite > fixed since";
    const brandNew = "tests/unit/c.test.ts > suite > brand new";
    expect(gate.gateExitCode({ newFailures: [], confirmedStale: [] })).toBe(0);
    expect(gate.gateExitCode({ newFailures: [], confirmedStale: [fixed] })).toBe(1);
    expect(gate.gateExitCode({ newFailures: [brandNew], confirmedStale: [] })).toBe(1);
    expect(gate.gateExitCode({ newFailures: [brandNew], confirmedStale: [fixed] })).toBe(1);
  });
});

describe("curated test lists (@file targets, 2026-10-09)", () => {
  const lists: Record<string, string> = {
    "tests/list.txt": "# comment\n\ntests/integration/a.test.ts\n  tests/integration/b.test.ts  \ntests/integration/a.test.ts\n",
    "tests/bad.txt": "tests/integration/missing.test.ts\nnot-a-test.md\ntests/integration/a.test.ts\n"
  };
  const present = new Set(["tests/integration/a.test.ts", "tests/integration/b.test.ts"]);
  const expand = (args: string[]) => gate.expandTargets(args, (path) => lists[path]!, (path) => present.has(path));

  it("expands a list file into its test files, ignoring comments and duplicates, and keeps plain directories", () => {
    expect(expand(["@tests/list.txt", "tests/unit"])).toEqual({
      targets: ["tests/integration/a.test.ts", "tests/integration/b.test.ts", "tests/unit"], invalid: [], excluded: []
    });
  });

  it("reports a listed path that is missing or not a test file instead of dropping it", () => {
    expect(expand(["@tests/bad.txt"])).toEqual({
      targets: ["tests/integration/a.test.ts"], invalid: ["tests/integration/missing.test.ts", "not-a-test.md"], excluded: []
    });
  });
});

// 2026-10-09: `pnpm run test:integration-all` runs every integration suite in ONE vitest process. Its list
// (tests/ci-integration-all.txt) names the directory by a one-directory glob, so a new suite joins without an edit, and
// names each file it leaves out on a `!` line, so an exclusion is written down, printed on every run, and never silent.
describe("directory globs and named exclusions in a list file (2026-10-09)", () => {
  const lists: Record<string, string> = {
    "tests/all.txt": "# every suite but the long one\ntests/integration/*.test.ts\n!tests/integration/long.test.ts\n",
    "tests/glob-only.txt": "tests/integration/*.test.ts\n",
    "tests/long.txt": "tests/integration/long.test.ts\n",
    "tests/stale-exclusion.txt": "tests/integration/a.test.ts\n!tests/integration/b.test.ts\n",
    "tests/empty-glob.txt": "tests/nothing/*.test.ts\n",
    "tests/bad-glob.txt": "tests/integration/*.ts\ntests/*/a.test.ts\ntests/integration/a*.test.ts\n"
  };
  const present = new Set(["tests/integration/a.test.ts", "tests/integration/b.test.ts", "tests/integration/long.test.ts"]);
  const directories: Record<string, string[]> = {
    "tests/integration": ["long.test.ts", "b.test.ts", "helper.ts", "a.test.ts", "s5-smoke.mjs"],
    "tests/nothing": ["README.md"]
  };
  const expand = (args: string[]) => gate.expandTargets(args, (path) => lists[path]!, (path) => present.has(path),
    (directory) => directories[directory] ?? []);

  it("expands a glob into that directory's test files, sorted, minus the files named on `!` lines", () => {
    expect(expand(["@tests/all.txt"])).toEqual({
      targets: ["tests/integration/a.test.ts", "tests/integration/b.test.ts"], invalid: [],
      excluded: [{ path: "tests/integration/long.test.ts", list: "tests/all.txt" }]
    });
  });

  it("runs an excluded file again when another list names it, and then no longer reports it as excluded", () => {
    expect(expand(["@tests/all.txt", "@tests/long.txt"])).toEqual({
      targets: ["tests/integration/a.test.ts", "tests/integration/b.test.ts", "tests/integration/long.test.ts"], invalid: [], excluded: []
    });
  });

  it("refuses an exclusion that names no file of its own list, so a stale `!` line cannot linger", () => {
    expect(expand(["@tests/stale-exclusion.txt"]).invalid).toEqual(["!tests/integration/b.test.ts"]);
  });

  it("refuses a glob that matches no test file, so a moved directory cannot shrink the run to nothing", () => {
    expect(expand(["@tests/empty-glob.txt"]).invalid).toEqual(["tests/nothing/*.test.ts"]);
  });

  it("accepts only the whole-file glob of one directory", () => {
    expect(expand(["@tests/bad-glob.txt"]).invalid).toEqual(["tests/integration/*.ts", "tests/*/a.test.ts", "tests/integration/a*.test.ts"]);
  });

  it("refuses a glob that would skip a test file vitest runs in that directory", () => {
    const skipping = (entries: string[]) => gate.expandTargets(["@tests/glob-only.txt"], (path) => lists[path]!, (path) => present.has(path),
      () => entries).invalid;
    expect(skipping(["a.test.ts", "b.test.tsx"])).toEqual(["tests/integration/*.test.ts (would skip tests/integration/b.test.tsx)"]);
    expect(skipping(["a.test.ts", "sub", "sub/c.test.ts"])).toEqual(["tests/integration/*.test.ts (would skip tests/integration/sub/c.test.ts)"]);
    expect(skipping(["a.test.ts", "odd name.test.ts"])).toEqual(["tests/integration/*.test.ts (would skip tests/integration/odd name.test.ts)"]);
    expect(skipping(["a.test.ts", "long.test.ts", "helper.ts", "sub/fixture.json"])).toEqual([]);
  });

  it("does not call a file left out when a plain directory argument still runs it", () => {
    expect(expand(["tests/integration", "@tests/all.txt"]).excluded).toEqual([]);
    expect(expand(["tests/unit", "@tests/all.txt"]).excluded).toEqual([{ path: "tests/integration/long.test.ts", list: "tests/all.txt" }]);
  });

  it("names every listed test file the report has no entry for, and checks no directory target", () => {
    const report = { testResults: [{ name: `${productRoot}/tests/integration/a.test.ts`, status: "passed", assertionResults: [] }] };
    expect(gate.missingTargets(["tests/integration/a.test.ts", "tests/integration/b.test.ts", "tests/unit"], report, productRoot))
      .toEqual(["tests/integration/b.test.ts"]);
    expect(gate.missingTargets(["tests/integration/a.test.ts"], {}, productRoot)).toEqual(["tests/integration/a.test.ts"]);
  });

  it("prints every left-out file beside the list that left it out, and prints nothing when none was", () => {
    expect(gate.exclusionReport(expand(["@tests/all.txt"]).excluded)).toEqual([
      'NOT RUN on purpose (1) — left out by a "!" line of the list named beside it:',
      "  tests/integration/long.test.ts  (tests/all.txt)"
    ]);
    expect(gate.exclusionReport([])).toEqual([]);
  });
});

describe("the all-integration list tests/ci-integration-all.txt (2026-10-09)", () => {
  // Every file vitest would run under tests/integration (any depth, .ts or .tsx), not the glob's own filter.
  const integrationFiles = () => readdirSync(resolve(productRoot, "tests/integration"), { recursive: true }).map(String)
    .filter((name) => /\.test\.tsx?$/.test(name)).sort().map((name) => `tests/integration/${name}`);
  const scripts = JSON.parse(readFileSync(resolve(productRoot, "package.json"), "utf8")).scripts as Record<string, string>;
  const registration = "tests/integration/registration-database.test.ts";
  const stageRehearsal = "tests/integration/preview-auth-dev-startup.test.ts";
  const list = "tests/ci-integration-all.txt";

  it("runs every integration suite except the two it names as excluded, each with its reason above it", () => {
    expect(scripts["test:integration-all"]).toBe(`node tools/ci-known-red.mjs @${list}`);
    const { targets, invalid, excluded } = gate.expandTargets([`@${list}`]);
    expect(invalid).toEqual([]);
    expect(excluded).toEqual([{ path: registration, list }, { path: stageRehearsal, list }]);
    expect(targets).toEqual(integrationFiles().filter((file) => file !== registration && file !== stageRehearsal));
    const lines = readFileSync(resolve(productRoot, list), "utf8").split("\n");
    for (const { path } of excluded) {
      const at = lines.indexOf(`!${path}`);
      expect(lines[at - 1], `no comment above !${path}`).toMatch(/^# /);
      expect(lines.slice(0, at).reverse().find((line) => line.startsWith("# EXCLUDED: ")), path).toContain(path.split("/").at(-1));
    }
  });

  it("offers the same run with registration-database included", () => {
    expect(scripts["test:integration-all:with-registration"])
      .toBe(`node tools/ci-known-red.mjs @${list} @tests/ci-integration-registration.txt`);
    const { targets, invalid, excluded } = gate.expandTargets([`@${list}`, "@tests/ci-integration-registration.txt"]);
    expect(invalid).toEqual([]);
    expect(excluded).toEqual([{ path: stageRehearsal, list }]);
    expect([...targets].sort()).toEqual(integrationFiles().filter((file) => file !== stageRehearsal));
  });

  it("covers both curated CI lists, so the all-run is never narrower than a CI job", () => {
    const { targets } = gate.expandTargets([`@${list}`, "@tests/ci-integration-registration.txt"]);
    const curated = gate.expandTargets(["@tests/ci-integration-auth.txt", "@tests/ci-integration-registration.txt"]).targets;
    for (const file of curated) expect(targets, file).toContain(file);
  });
});

describe("host-sensitive list tests/ci-flaky.txt (2026-10-09)", () => {
  const flakyPath = resolve(productRoot, "tests/ci-flaky.txt");

  it("reports a flaky failure without failing the gate, and never calls a flaky pass stale", () => {
    const flaky = ["tests/integration/r.test.ts > suite > rss tripwire"];
    const failing = gate.decide({ failed: [...flaky, "tests/unit/c.test.ts > suite > brand new"], allowlist: [], flaky });
    expect(failing.flakyFailures).toEqual(flaky);
    expect(failing.newFailures).toEqual(["tests/unit/c.test.ts > suite > brand new"]);
    const only = gate.decide({ failed: [...flaky], allowlist: [], flaky });
    expect(only.newFailures).toEqual([]);
    expect(only.exitCode).toBe(0);
    const passing = gate.decide({ failed: [], allowlist: [], flaky, ran: flaky });
    expect(passing.stale).toEqual([]);
    expect(passing.exitCode).toBe(0);
  });

  it("names real tests, each with a source comment, none also on the known-red list", () => {
    const text = readFileSync(flakyPath, "utf8");
    const { entries, invalid } = gate.parseAllowlist(text);
    expect(invalid).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    const known = gate.parseAllowlist(readFileSync(allowlistPath, "utf8")).entries;
    for (const entry of entries) {
      const file = entry.split(" > ")[0] ?? "";
      expect(existsSync(resolve(productRoot, file)), entry).toBe(true);
      expect(readFileSync(resolve(productRoot, file), "utf8"), entry).toContain(entry.split(" > ").at(-1)!);
      expect(known, entry).not.toContain(entry);
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = (lines[i] ?? "").trim();
      if (line === "" || line.startsWith("#")) continue;
      expect((lines[i + 1] ?? "").trim(), `no source comment under: ${line}`).toMatch(/^#\s+source:/);
    }
  });
});
