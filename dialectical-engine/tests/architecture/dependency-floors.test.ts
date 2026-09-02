// tests/architecture/dependency-floors.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

function resolvedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(`^  ${escaped}@(\\d+\\.\\d+\\.\\d+)`, "gm");
  return [...new Set([...lock.matchAll(pattern)].map((match) => match[1]!))];
}

function compare(left: string, right: string): number {
  const l = left.split(".").map(Number);
  const r = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (l[i]! !== r[i]!) return l[i]! - r[i]!;
  return 0;
}

// Floors from GHSA-7fh5-64p2-3v2j (postcss XSS), GHSA-… postcss sourceMappingURL family,
// sharp/libvips CVE-2026-33327/33328/35590/35591, nanoid GHSA (size 0 loop),
// esbuild GHSA-67mh-4wv8-2f99 (<=0.24.2) and GHSA-g7r4-m6w7-qqqr (>=0.27.3 <0.28.1).
const VULNERABLE: Record<string, (version: string) => boolean> = {
  postcss: (v) => compare(v, "8.5.23") < 0,
  sharp: (v) => compare(v, "0.35.4") < 0,
  nanoid: (v) => v.startsWith("3.") && compare(v, "3.3.18") < 0,
  esbuild: (v) => compare(v, "0.24.3") < 0 || (compare(v, "0.27.3") >= 0 && compare(v, "0.28.1") < 0)
};

describe("dependency floors (F-02)", () => {
  for (const [name, isVulnerable] of Object.entries(VULNERABLE)) {
    it(`${name}: every resolved version is patched`, () => {
      const versions = resolvedVersions(name);
      expect(versions.length, `${name} must resolve somewhere in the lockfile`).toBeGreaterThan(0);
      expect(versions.filter(isVulnerable)).toEqual([]);
    });
  }
  it("has no stale `web` importer (the workspace member was removed)", () => {
    expect(/^  web:$/m.test(lock)).toBe(false);
  });
  it("has no nested lockfile inside apps/ui", () => {
    expect(existsSync(resolve(root, "apps/ui/pnpm-lock.yaml"))).toBe(false);
  });
});

// L6-F3 / L6-F12 (2026-09-01 security hardening, task B24a): the install policy lives in
// pnpm-workspace.yaml (pnpm 11 reads settings there, not from .npmrc). A registry hijack is
// worthless if a freshly published version cannot be resolved for a week, and a new lifecycle
// script must stop the install instead of being skipped silently.
const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");

function topLevelScalar(key: string): string | undefined {
  return workspace.match(new RegExp(`^${key}:[ \\t]*(\\S+)[ \\t]*$`, "m"))?.[1];
}

describe("supply-chain install policy (L6-F3, L6-F12)", () => {
  it("enforces a release-age cooldown of at least 7 days", () => {
    const minutes = Number(topLevelScalar("minimumReleaseAge"));
    expect(Number.isInteger(minutes), "minimumReleaseAge must be set in pnpm-workspace.yaml").toBe(true);
    expect(minutes).toBeGreaterThanOrEqual(10080);
  });
  it("fails the install loudly on an unlisted build script", () => {
    expect(topLevelScalar("strictDepBuilds")).toBe("true");
  });
  it("only excludes exact name@version pins from the cooldown, never a range", () => {
    const block = workspace.match(/^minimumReleaseAgeExclude:\n((?:  (?:- |#)[^\n]*\n?)+)/m)?.[1] ?? "";
    const entries = block.split("\n").filter((line) => line.startsWith("  - ")).map((line) => line.replace(/^  - /, "").replace(/^'|'$/g, ""));
    expect(entries.length).toBeGreaterThanOrEqual(5); // the three pre-existing pins plus next and sharp
    for (const entry of entries) expect(entry).toMatch(/^(@[a-z0-9-]+\/)?[a-z0-9.-]+@\d+\.\d+\.\d+$/);
  });
});
