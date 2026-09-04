import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCAN_LIMITS,
  scan,
  scanSource,
  type ScanFileSystem,
} from "../../tools/obs-inventory/src/scan.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = join(projectRoot, "tests/fixtures/fix16");

describe("FIX-16 C1 inventory scanner", () => {
  it("classifies each harmful source construct and leaves safe neighbours out", async () => {
    const findings = await scan(join(fixtureRoot, "classes"));

    expect(findings).toEqual([
      { path: "bare-catch-positive.ts", line: 5, class: "bare_catch" },
      { path: "throw-positive.ts", line: 3, class: "throw_without_code" },
      { path: "void-promise-positive.ts", line: 7, class: "void_promise" },
      { path: "wrapper-positive.ts", line: 9, class: "wrapper_without_cause" },
    ]);
  });

  it("uses AST bindings for wrapper aliases and accepts only a cause rooted in the caught error", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "const Wrapper = DomainError;",
      "try { task(); } catch (caught) {",
      "  const root = caught;",
      '  const missing = new Wrapper("WRAP_FAILED", "fixed");',
      '  const unrelated = new Wrapper("WRAP_FAILED", "fixed", { cause: other });',
      '  const kept = new Wrapper("WRAP_FAILED", "fixed", { cause: root });',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/wrapper.ts")).toEqual([
      { path: "packages/example/src/wrapper.ts", line: 5, class: "wrapper_without_cause" },
      { path: "packages/example/src/wrapper.ts", line: 6, class: "wrapper_without_cause" },
    ]);
  });

  it("recognises static imports, re-exports, dynamic imports, require aliases and normalized paths", async () => {
    const findings = await scan(join(fixtureRoot, "zone"));

    expect(findings).toEqual([
      { path: "packages/obs-capture/src/module-forms.ts", line: 2, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 3, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 4, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 6, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 8, class: "zone_import" },
      { path: "packages/obs-capture/src/module-forms.ts", line: 9, class: "zone_import" },
    ]);
  });

  it("normalizes importer separators and target traversal without letting either bypass the zone", () => {
    const source = 'import "../../../obs-capture/../db/src/identity.js";';

    expect(scanSource(source, "packages\\obs-capture\\src\\deeper\\importer.ts")).toEqual([
      { path: "packages/obs-capture/src/deeper/importer.ts", line: 1, class: "zone_import" },
    ]);
  });

  it("enforces the same importer-only rule in all three governed trees", () => {
    const source = 'import "apps/api/src/registration.ts";';

    expect([
      "packages/obs-capture/src/importer.ts",
      "tools/obs-listener/src/importer.ts",
      "acceptance/obs/importer.ts",
    ].map((path) => scanSource(source, path))).toEqual([
      [{ path: "packages/obs-capture/src/importer.ts", line: 1, class: "zone_import" }],
      [{ path: "tools/obs-listener/src/importer.ts", line: 1, class: "zone_import" }],
      [{ path: "acceptance/obs/importer.ts", line: 1, class: "zone_import" }],
    ]);
  });

  it("ignores import-shaped strings, comments, regex literals, nonliteral imports and out-of-scope importers", async () => {
    const findings = await scan(join(fixtureRoot, "zone"));

    expect(findings.filter(({ path }) => path.endsWith("safe.ts") || path.endsWith("ignored.ts"))).toEqual([]);
  });

  it("does not open, stat, or address a classified target and reports only the importer", async () => {
    const accesses: Array<{ readonly operation: string; readonly path: string }> = [];
    const fileSystem: ScanFileSystem = {
      async readFile(path) {
        accesses.push({ operation: "readFile", path });
        return readFile(path, "utf8");
      },
      async readdir(path) {
        accesses.push({ operation: "readdir", path });
        return readdir(path, { withFileTypes: true });
      },
    };

    const findings = await scan(join(fixtureRoot, "zone"), { fileSystem });
    const fixtureZoneRoot = join(fixtureRoot, "zone");
    const addressed = accesses.map(({ operation, path }) => ({
      operation,
      path: relative(fixtureZoneRoot, path).replaceAll("\\", "/"),
    }));

    expect(addressed).not.toContainEqual({ operation: "readFile", path: "apps/api/src/registration.ts" });
    expect(addressed).not.toContainEqual({ operation: "readdir", path: "apps/api/src/registration.ts" });
    expect(findings.every(({ path }) => path === "packages/obs-capture/src/module-forms.ts")).toBe(true);
  });

  it("keeps the real manifest classification literals exempt", async () => {
    const manifestPath = join(projectRoot, "packages/obs-capture/src/zone/manifest.ts");
    const manifestSource = await readFile(manifestPath, "utf8");

    expect(scanSource(manifestSource, "packages/obs-capture/src/zone/manifest.ts")).toEqual([]);
  });

  it("fails closed when file bytes, AST nodes, candidates, or syntax exceed the scanner contract", () => {
    expect(() => scanSource("const payload = 'too large';", "apps/example/src/large.ts", {
      limits: { ...DEFAULT_SCAN_LIMITS, maxFileBytes: 4 },
    })).toThrowError(expect.objectContaining({ code: "OBS_INVENTORY_FILE_SIZE_LIMIT" }));

    expect(() => scanSource("function nested() { return 1; }", "apps/example/src/nodes.ts", {
      limits: { ...DEFAULT_SCAN_LIMITS, maxNodeCount: 2 },
    })).toThrowError(expect.objectContaining({ code: "OBS_INVENTORY_NODE_LIMIT" }));

    expect(() => scanSource("throw first;\nthrow second;", "apps/example/src/candidates.ts", {
      limits: { ...DEFAULT_SCAN_LIMITS, maxCandidateCount: 1 },
    })).toThrowError(expect.objectContaining({ code: "OBS_INVENTORY_CANDIDATE_LIMIT" }));

    expect(() => scanSource("export const = ;", "apps/example/src/invalid.ts")).toThrowError(
      expect.objectContaining({ code: "OBS_INVENTORY_PARSE_FAILED" }),
    );
  });

  it("publishes finite positive defaults for every bounded dimension", () => {
    expect(Object.values(DEFAULT_SCAN_LIMITS).every((value) => Number.isSafeInteger(value) && value > 0)).toBe(true);
    expect(DEFAULT_SCAN_LIMITS.maxFileBytes).toBeLessThanOrEqual(8 * 1_048_576);
    expect(DEFAULT_SCAN_LIMITS.maxNodeCount).toBeLessThanOrEqual(5_000_000);
    expect(DEFAULT_SCAN_LIMITS.maxCandidateCount).toBeLessThanOrEqual(100_000);
    expect(DEFAULT_SCAN_LIMITS.maxFileCount).toBeLessThanOrEqual(50_000);
  });
});
