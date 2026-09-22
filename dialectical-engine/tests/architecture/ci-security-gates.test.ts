// tests/architecture/ci-security-gates.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const gitRoot = resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(resolve(gitRoot, p), "utf8");
describe("CI security gates (F-03)", () => {
  it("ships the workflow, dependabot and gitleaks config", () => {
    for (const p of [".github/workflows/security.yml", ".github/dependabot.yml", ".gitleaks.toml"]) expect(existsSync(resolve(gitRoot, p)), p).toBe(true);
  });
  it("pins the ruled Node and runs every gate", () => {
    const wf = read(".github/workflows/security.yml");
    for (const needle of ["node-version: 22.23.1", "pnpm audit --audit-level=moderate", "gitleaks", "pnpm run typecheck", "pnpm run test:ci-gate", "github/codeql-action/analyze"]) expect(wf).toContain(needle);
  });
  it("runs the recorded known-red gate, not a raw vitest sweep (B31)", () => {
    const wf = read(".github/workflows/security.yml");
    expect(wf).toContain("pnpm run test:ci-gate");
    expect(wf).not.toContain("vitest run tests/unit tests/architecture");
    const scripts = JSON.parse(read("dialectical-engine/package.json")).scripts as Record<string, string>;
    expect(scripts["test:ci-gate"]).toBe("node tools/ci-known-red.mjs tests/unit tests/architecture");
    expect(existsSync(resolve(gitRoot, "dialectical-engine/tests/ci-known-red.txt"))).toBe(true);
  });
  it("dependabot watches npm and actions weekly", () => {
    const db = read(".github/dependabot.yml");
    expect(db).toContain('package-ecosystem: "npm"'); expect(db).toContain('directory: "/dialectical-engine"');
    expect(db).toContain('package-ecosystem: "github-actions"'); expect(db.match(/interval: "weekly"/g)?.length).toBe(2);
  });
  // V-2 item 3 (ruled 2026-09-22): the update bot waits out this repository's OWN release-age
  // cooldown. Without it Dependabot would open pull requests for versions `pnpm install` then
  // refuses to resolve — and a version hours old is exactly what a registry hijack ships. The two
  // numbers live in two files, so they are read from both and compared here and can never drift:
  // pnpm's `minimumReleaseAge` is in MINUTES, Dependabot's `cooldown.default-days` in DAYS.
  // Syntax verified against docs.github.com, two pages, both read 2026-09-22. "Dependabot options
  // reference" (/en/code-security/reference/supply-chain-security/dependabot-options-reference)
  // gives the shape: `cooldown` is a mapping under an `updates` entry, `default-days` is its key,
  // and both the npm and the github-actions ecosystems support it. That page does NOT state a day
  // range; "The number of cooldown days must be between 1 and 90" is from the tutorial
  // /en/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates,
  // heading "Setting up a cooldown period for dependency updates" — which is the only claim the
  // 1-90 assertion below rests on. An invalid file stops the bot in silence, so the shape is
  // pinned exactly as documented.
  it("makes the update bot wait out the workspace's own cooldown (V-2.3)", () => {
    const minutes = Number(read("dialectical-engine/pnpm-workspace.yaml").match(/^minimumReleaseAge: (\d+)$/m)?.[1]);
    expect(Number.isInteger(minutes) && minutes > 0, "minimumReleaseAge (minutes) in pnpm-workspace.yaml").toBe(true);
    const days = minutes / 1440;
    expect(Number.isInteger(days), `minimumReleaseAge ${minutes} min is not a whole number of days`).toBe(true);
    const cited = "docs.github.com, optimizing-pr-creation-version-updates: \"The number of cooldown days must be between 1 and 90\"";
    expect(days, cited).toBeGreaterThanOrEqual(1);
    expect(days, cited).toBeLessThanOrEqual(90);
    const entries = read(".github/dependabot.yml").split(/^updates:$/m)[1]?.split(/^ {2}- /m).slice(1) ?? [];
    expect(entries.length, "updates entries parsed from .github/dependabot.yml").toBeGreaterThanOrEqual(2);
    for (const entry of entries) {
      const ecosystem = entry.match(/package-ecosystem: "([^"]+)"/)?.[1] ?? "(unnamed entry)";
      expect(entry, `${ecosystem}: no cooldown mapping`).toMatch(/^ {4}cooldown:$/m);
      expect(entry.match(/^ {6}default-days: (\d+)$/m)?.[1], `${ecosystem}: cooldown.default-days`).toBe(String(days));
    }
  });
  it("ships SECURITY.md with a disclosure route", () => {
    expect(existsSync(resolve(gitRoot, "SECURITY.md"))).toBe(true);
    expect(read("SECURITY.md")).toContain("Report a vulnerability");
  });
  it("dependabot targets dev, the live integration branch (L6-F4)", () => {
    // main is the GitHub default branch but is 285 commits stale and has no /dialectical-engine tree.
    const db = read(".github/dependabot.yml");
    expect(db.match(/target-branch: "dev"/g)?.length).toBe(2);
  });
  // DL6-F3 (delta audit 2026-09-18): the secret gate must SEE the directories where agent
  // seats paste command output. Whole-tree exemptions for tests/, docs/ and .hermes/ made it
  // blind to 88 % of the delta's new files; exemptions are per named fixture file instead.
  it("never exempts a whole tree from the secret scan (DL6-F3)", () => {
    const config = read(".gitleaks.toml");
    const paths = config.slice(config.indexOf("paths = ["), config.indexOf("]", config.indexOf("paths = [")));
    expect(paths).not.toMatch(/tests\/\.\*/);
    expect(paths).not.toMatch(/docs\/\.\*/);
    expect(paths).not.toMatch(/hermes\/\.\*/);
    for (const entry of paths.split("\n").filter((line) => line.trim().startsWith("'''"))) {
      expect(entry, entry).toMatch(/\\\.(ts|mjs|json|md)''',?$/);
    }
  });

  it("runs gitleaks as a pinned, sha256-verified binary, not the licensed action (B7b)", () => {
    const wf = read(".github/workflows/security.yml");
    expect(wf).not.toContain("gitleaks-action");
    expect(wf).not.toContain("GITLEAKS_LICENSE");
    expect(wf).toMatch(/GITLEAKS_VERSION: \d+\.\d+\.\d+/);
    expect(wf).toMatch(/GITLEAKS_SHA256: [0-9a-f]{64}/);
    expect(wf).toMatch(/curl -sSfL[^\n]*gitleaks_\$\{GITLEAKS_VERSION\}_linux_x64\.tar\.gz/);
    expect(wf).toMatch(/sha256sum (--check|-c)/);
    expect(wf).toMatch(/gitleaks" git [^\n]*--redact[^\n]*--config \.gitleaks\.toml[^\n]*--log-opts="--all"/);
    expect(wf).toContain("fetch-depth: 0");
  });
  it("pins one Node version for humans, CI and the register (L6-F13)", () => {
    const engines = JSON.parse(read("dialectical-engine/package.json")).engines.node as string;
    expect(engines).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(resolve(gitRoot, ".nvmrc")), ".nvmrc at the git root").toBe(true);
    expect(read(".nvmrc").trim()).toBe(engines);
    expect(read(".github/workflows/security.yml")).toContain(`node-version: ${engines}`);
    expect(JSON.parse(read("dialectical-engine/register.bootstrap.json")).values.nodeRuntimeVersion).toBe(`v${engines}`);
  });
  it("pins every action to a full commit SHA with its release tag as a comment (L6-F7)", () => {
    const uses = read(".github/workflows/security.yml").split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });
});
