// tests/architecture/ci-security-gates.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const gitRoot = resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(resolve(gitRoot, p), "utf8");

/**
 * The single Node version humans and CI install. Since dev's 932ed6b5 `engines.node` is a
 * RANGE, not an exact version — an exact single-patch pin names one host's Homebrew bottle,
 * which V's 2026-09-17 rule forbids — so the version to install is the range's FLOOR, and
 * that is the one number `.nvmrc` and the workflow may carry.
 */
function declaredNodeFloor(): string {
  const engines = JSON.parse(read("dialectical-engine/package.json")).engines.node as string;
  const match = /^>=(\d+\.\d+\.\d+) <\d+$/.exec(engines);
  expect(match, `engines.node must be a ">=x.y.z <major" range, got ${engines}`).not.toBeNull();
  return match![1]!;
}

describe("CI security gates (F-03)", () => {
  it("ships the workflow, dependabot and gitleaks config", () => {
    for (const p of [".github/workflows/security.yml", ".github/dependabot.yml", ".gitleaks.toml"]) expect(existsSync(resolve(gitRoot, p)), p).toBe(true);
  });
  it("pins the ruled Node and runs every gate", () => {
    const wf = read(".github/workflows/security.yml");
    for (const needle of [`node-version: ${declaredNodeFloor()}`, "pnpm audit --audit-level=moderate", "gitleaks", "pnpm run typecheck", "pnpm run test:ci-gate", "github/codeql-action/analyze"]) expect(wf).toContain(needle);
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
  // L6-F13, AMENDED 2026-09-22 (DEV-SYNC). Humans and CI must still install exactly one
  // Node version and it must be the one the project declares — now the floor of the
  // engines range rather than an exact engines string.
  //
  // The rule's third leg is STRUCK, mirroring dev's 53a09658: it used to demand that
  // register.bootstrap.json's nodeRuntimeVersion equal the declared runtime. That file is
  // the description of SEALED register version 1. Its nodeRuntimeVersion is a DATED
  // measurement ("node --version on 2026-08-07"), not a declaration of today's runtime,
  // and editing it moves the v1 snapshot hash that the production runbook tells the
  // operator to confirm against the deployed database — dev tried it in 7e9a85a0 and
  // reverted it for exactly that reason. A new runtime pin is a NEW register version
  // (dev's open ticket F-BOOTSTRAP-REGISTER-V2-RUNTIME-PINS), never an edit to a sealed
  // one. What the project DECLARES is engines. So the sealed row is pinned UNCHANGED
  // below, which turns this leg from a demand to edit a seal into a guard on it.
  it("pins one Node version for humans, CI and the register (L6-F13)", () => {
    const floor = declaredNodeFloor();
    expect(existsSync(resolve(gitRoot, ".nvmrc")), ".nvmrc at the git root").toBe(true);
    expect(read(".nvmrc").trim()).toBe(floor);
    expect(read(".github/workflows/security.yml")).toContain(`node-version: ${floor}`);
    expect(JSON.parse(read("dialectical-engine/register.bootstrap.json")).values.nodeRuntimeVersion).toBe("v22.23.1");
  });
  it("pins every action to a full commit SHA with its release tag as a comment (L6-F7)", () => {
    const uses = read(".github/workflows/security.yml").split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/uses: [\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });
});
