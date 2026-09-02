// tests/architecture/ci-known-red-gate.test.ts
// B31 — the CI verify job fails only on NEW failures. The recorded known-red allowlist
// (tests/ci-known-red.txt) and the gate that reads it (tools/ci-known-red.mjs) are pinned here.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const productRoot = resolve(import.meta.dirname, "../..");
const allowlistPath = resolve(productRoot, "tests/ci-known-red.txt");

type Decision = { newFailures: string[]; knownFailures: string[]; stale: string[]; exitCode: number };
type GateModule = {
  decide: (input: { failed: string[]; allowlist: string[]; ran?: string[] }) => Decision;
  parseAllowlist: (text: string) => { entries: string[]; invalid: string[] };
  failedNamesFromReport: (report: unknown, rootDir: string) => { failed: string[]; ran: string[]; messages: Record<string, string> };
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
      expect(file, entry).toMatch(/^tests\/(unit|architecture)\/[\w.-]+\.test\.tsx?$/);
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

  it("warns without failing when an allowlisted test passes, so the list can only shrink", () => {
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

  it("rejects an allowlist line that is not a full test name", () => {
    const { entries, invalid } = gate.parseAllowlist(["# a comment", "", "tests/unit/a.test.ts > suite > fine", "tests/unit/a.test.ts", "not-a-test-path > suite > title"].join("\n"));
    expect(entries).toEqual(["tests/unit/a.test.ts > suite > fine"]);
    expect(invalid).toEqual(["tests/unit/a.test.ts", "not-a-test-path > suite > title"]);
  });
});
