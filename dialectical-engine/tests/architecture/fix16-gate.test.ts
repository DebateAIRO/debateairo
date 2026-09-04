import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

  it("distinguishes discarded PromiseLike values from synchronous void calls", () => {
    const source = [
      "function synchronous(): void {}",
      "async function pendingCall(): Promise<void> {}",
      "declare const pendingValue: Promise<void>;",
      "declare const pendingLike: PromiseLike<void>;",
      "declare const fakeThen: { readonly then: string };",
      "declare function observe(error: unknown): void;",
      "void synchronous();",
      "void pendingCall();",
      "void pendingValue;",
      "void pendingLike;",
      "void fakeThen;",
      "void pendingCall().catch(observe);",
    ].join("\n");

    expect(scanSource(source, "apps/example/src/promises.ts")).toEqual([
      { path: "apps/example/src/promises.ts", line: 8, class: "void_promise" },
      { path: "apps/example/src/promises.ts", line: 9, class: "void_promise" },
      { path: "apps/example/src/promises.ts", line: 10, class: "void_promise" },
    ]);
  });

  it("flags arbitrary identifier and property throws while preserving coded throws and caught rethrows", () => {
    const source = [
      'const message = "ordinary text";',
      "const holder = { message };",
      'const DECLARED_CODE = "DECLARED_CODE";',
      "declare const registry: { readonly DOMAIN_FAILED: unknown };",
      "const codedError = new Error(DECLARED_CODE);",
      "try { task(); } catch (caught) { throw caught; }",
      "throw message;",
      "throw holder.message;",
      "throw new Error(DECLARED_CODE);",
      "throw registry.DOMAIN_FAILED;",
      "throw codedError;",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/throws.ts")).toEqual([
      { path: "packages/example/src/throws.ts", line: 7, class: "throw_without_code" },
      { path: "packages/example/src/throws.ts", line: 8, class: "throw_without_code" },
    ]);
  });

  it("does not treat transformed caught values or shadowed aliases as preserved causes", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "const Wrapper = DomainError;",
      "try { task(); } catch (caught) {",
      "  const root = caught;",
      "  const booleanOnly = Boolean(caught);",
      '  new Wrapper("WRAP_FAILED", "fixed", { cause: root });',
      '  new Wrapper("WRAP_FAILED", "fixed", { cause: booleanOnly });',
      "  {",
      "    const root = unrelated;",
      '    new Wrapper("WRAP_FAILED", "fixed", { cause: root });',
      "  }",
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/cause-lineage.ts")).toEqual([
      { path: "packages/example/src/cause-lineage.ts", line: 7, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-lineage.ts", line: 10, class: "wrapper_without_cause" },
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

  it("classifies TypeScript import-type nodes without reading the target", () => {
    const source = 'type Registration = import("apps/api/src/registration.ts").Registration;';

    expect(scanSource(source, "packages/obs-capture/src/types.ts")).toEqual([
      { path: "packages/obs-capture/src/types.ts", line: 1, class: "zone_import" },
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

  it("limits the classification-literal exemption to the exact manifest source", () => {
    const lookalike = [
      "export const ZONE_MANIFEST = {",
      '  zone_path_prefixes: ["apps/api/src/registration.ts"],',
      '  compiled_alternate_prefixes: ["apps/api/dist/registration.js"],',
      "} as const;",
    ].join("\n");

    expect(scanSource(lookalike, "packages/obs-capture/src/not-manifest.ts")).toEqual([
      { path: "packages/obs-capture/src/not-manifest.ts", line: 2, class: "zone_import" },
      { path: "packages/obs-capture/src/not-manifest.ts", line: 3, class: "zone_import" },
    ]);
  });

  it("fails closed on source symlinks without reading the linked zone target", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "fix16-symlink-"));
    const project = join(temporaryRoot, "project");
    const zoneSource = join(temporaryRoot, "zone-source.ts");
    const target = join(project, "apps/api/src/registration.ts");
    const link = join(project, "apps/linked.ts");
    const reads: string[] = [];

    try {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(zoneSource, 'throw new Error("ordinary text");\n', "utf8");
      await symlink("../../../../zone-source.ts", target);
      await symlink("api/src/registration.ts", link);
      const fileSystem: ScanFileSystem = {
        async readFile(path) {
          reads.push(path);
          return readFile(path, "utf8");
        },
        readdir: (path) => readdir(path, { withFileTypes: true }),
      };

      await expect(scan(project, { fileSystem })).rejects.toMatchObject({
        code: "OBS_INVENTORY_SYMLINK",
      });
      expect(reads).not.toContain(target);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("resolves TypedDomainError and require aliases by lexical binding", () => {
    const wrapperSource = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      'import * as Kernel from "@debateai/kernel";',
      "const Wrapper = DomainError;",
      "const { TypedDomainError: NamespacedAlias } = Kernel;",
      "const LocalKernel = { TypedDomainError: class {} };",
      "try { task(); } catch (caught) {",
      '  new Wrapper("WRAP_FAILED", "fixed");',
      '  new Kernel.TypedDomainError("WRAP_FAILED", "fixed");',
      '  new NamespacedAlias("WRAP_FAILED", "fixed");',
      '  new LocalKernel.TypedDomainError("LOCAL_PROPERTY");',
      "  {",
      "    class DomainError {}",
      '    new DomainError("LOCAL_ONLY");',
      "    const Wrapper = class {};",
      '    new Wrapper("LOCAL_ALIAS");',
      "  }",
      "}",
    ].join("\n");
    const requireSource = [
      "const load = require;",
      "function local(require: (path: string) => unknown) {",
      '  return require("apps/api/src/registration.ts");',
      "}",
      "function localAlias() {",
      "  const load = (path: string) => path;",
      '  return load("apps/api/src/registration.ts");',
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");

    expect(scanSource(wrapperSource, "packages/example/src/wrapper-shadow.ts")).toEqual([
      { path: "packages/example/src/wrapper-shadow.ts", line: 7, class: "wrapper_without_cause" },
      { path: "packages/example/src/wrapper-shadow.ts", line: 8, class: "wrapper_without_cause" },
      { path: "packages/example/src/wrapper-shadow.ts", line: 9, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(requireSource, "packages/obs-capture/src/require-shadow.ts")).toEqual([
      { path: "packages/obs-capture/src/require-shadow.ts", line: 9, class: "zone_import" },
    ]);
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
