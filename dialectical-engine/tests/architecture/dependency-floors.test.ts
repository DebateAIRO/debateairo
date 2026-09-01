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
