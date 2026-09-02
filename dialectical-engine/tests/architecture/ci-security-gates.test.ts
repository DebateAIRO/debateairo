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
    for (const needle of ["node-version: 22.23.1", "pnpm audit --audit-level=moderate", "gitleaks", "pnpm run typecheck", "vitest run tests/unit tests/architecture", "github/codeql-action/analyze"]) expect(wf).toContain(needle);
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
});
