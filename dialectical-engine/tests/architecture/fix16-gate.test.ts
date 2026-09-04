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
      "function observe(error: unknown): void { console.error(error); }",
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

  it("requires a rejection observer and treats explicit any values as fail-closed Promise candidates", () => {
    const source = [
      "declare const pending: Promise<void>;",
      "declare const anyPending: any;",
      "declare function anyCall(): any;",
      "function observe(error: unknown): void { console.error(error); }",
      "declare function fulfilled(): void;",
      "function ignore(_error: unknown): void {}",
      "const ignoreAlias = ignore;",
      "void pending.catch();",
      "void pending.catch(() => undefined);",
      "void pending.catch((_error) => undefined);",
      "void pending.then(fulfilled, undefined);",
      "void pending.then(fulfilled, () => undefined);",
      "void anyPending;",
      "void anyCall();",
      "void pending.catch(ignore);",
      "void pending.catch(ignoreAlias);",
      "void pending.catch((error) => observe(error));",
      "void pending.then(fulfilled, (error) => observe(error));",
      "void pending.catch(observe);",
    ].join("\n");

    expect(scanSource(source, "apps/example/src/rejection-observation.ts")).toEqual([
      { path: "apps/example/src/rejection-observation.ts", line: 8, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 9, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 10, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 11, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 12, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 13, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 14, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 15, class: "void_promise" },
      { path: "apps/example/src/rejection-observation.ts", line: 16, class: "void_promise" },
    ]);
  });

  it("uses current callback definitions and requires every joined path to consume rejection", () => {
    const source = [
      "declare const pending: Promise<void>;",
      "declare const flag: boolean;",
      "function consume(error: unknown): void { console.error(error); }",
      "let callback = (error: unknown) => consume(error);",
      "callback = (_error: unknown) => undefined;",
      "void pending.catch(callback);",
      "callback = (error: unknown) => consume(error);",
      "void pending.catch(callback);",
      "callback = (_error: unknown) => undefined;",
      "callback = (error: unknown) => consume(error);",
      "void pending.catch(callback);",
      "let joined = (error: unknown) => consume(error);",
      "if (flag) joined = (_error: unknown) => undefined;",
      "void pending.catch(joined);",
      "if (flag) joined = (error: unknown) => consume(error); else joined = (error: unknown) => consume(error);",
      "void pending.catch(joined);",
      "void pending.catch(({}) => undefined);",
      "void pending.catch(({ message }: { message: unknown }) => consume(message));",
    ].join("\n");

    expect(scanSource(source, "apps/example/src/callback-flow.ts")).toEqual([
      { path: "apps/example/src/callback-flow.ts", line: 6, class: "void_promise" },
      { path: "apps/example/src/callback-flow.ts", line: 14, class: "void_promise" },
      { path: "apps/example/src/callback-flow.ts", line: 17, class: "void_promise" },
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

  it("tracks mutable cause aliases and applies object cause writes in evaluation order", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "try { task(); } catch (caught) {",
      "  let alias = caught;",
      "  alias = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: alias });',
      "  alias = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: alias });',
      "  let options = { cause: caught };",
      "  options = { cause: unrelated };",
      '  new DomainError("WRAP_FAILED", "fixed", options);',
      "  options = { cause: caught };",
      '  new DomainError("WRAP_FAILED", "fixed", options);',
      '  new DomainError("WRAP_FAILED", "fixed", { cause: caught, ...{ cause: unrelated } });',
      '  new DomainError("WRAP_FAILED", "fixed", { ...{ cause: unrelated }, cause: caught });',
      "  const preserved = { cause: caught };",
      '  new DomainError("WRAP_FAILED", "fixed", { ...preserved });',
      "  const overwritten = { cause: caught };",
      "  overwritten.cause = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", overwritten);',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/cause-flow.ts")).toEqual([
      { path: "packages/example/src/cause-flow.ts", line: 5, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-flow.ts", line: 10, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-flow.ts", line: 13, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-flow.ts", line: 19, class: "wrapper_without_cause" },
    ]);
  });

  it("accepts exact computed cause properties and excludes shadowed outer catch bindings", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "try { task(); } catch (caught) {",
      '  new DomainError("WRAP_FAILED", "fixed", { ["cause"]: caught });',
      "  function shadowed(caught: unknown) {",
      '    new DomainError("LOCAL_ONLY", "fixed");',
      "  }",
      "  function closesOver(other: unknown) {",
      '    new DomainError("WRAP_FAILED", "fixed", { ["cause"]: caught });',
      "  }",
      '  new DomainError("WRAP_FAILED", "fixed", { ["not_cause"]: caught });',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/computed-cause.ts")).toEqual([
      { path: "packages/example/src/computed-cause.ts", line: 10, class: "wrapper_without_cause" },
    ]);
  });

  it("retains catch-path context when the catch binding itself is reassigned", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      "  caught = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed");',
      "}",
      "try { task(); } catch (caught) {",
      "  const root = caught;",
      "  caught = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: root });',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/catch-context.ts")).toEqual([
      { path: "packages/example/src/catch-context.ts", line: 5, class: "wrapper_without_cause" },
    ]);
  });

  it("joins cause paths and shares last writes across object aliases", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "declare const flag: boolean;",
      'const CAUSE = "cause" as const;',
      'const NOT_CAUSE = "other" as const;',
      "try { task(); } catch (caught) {",
      "  const options = { cause: caught };",
      "  const alias = options;",
      "  alias.cause = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", options);',
      "  const restored = { cause: unrelated };",
      "  const restoreAlias = restored;",
      "  restoreAlias[CAUSE] = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", restored);',
      "  let maybe = unrelated;",
      "  if (flag) maybe = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: maybe });',
      "  let always = unrelated;",
      "  if (flag) always = caught; else always = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: always });',
      '  new DomainError("WRAP_FAILED", "fixed", { [CAUSE]: caught });',
      "  const uncertain = { cause: caught };",
      "  let key = NOT_CAUSE;",
      "  if (flag) key = CAUSE;",
      "  uncertain[key] = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", uncertain);',
      "  const branchObject = { cause: caught };",
      "  if (flag) branchObject.cause = unrelated;",
      '  new DomainError("WRAP_FAILED", "fixed", branchObject);',
      "  if (flag) branchObject.cause = caught; else branchObject.cause = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", branchObject);',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/cause-joins.ts")).toEqual([
      { path: "packages/example/src/cause-joins.ts", line: 10, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-joins.ts", line: 17, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-joins.ts", line: 26, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-joins.ts", line: 29, class: "wrapper_without_cause" },
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

  it("tracks module.require and assignment aliases without retaining reassigned loaders", () => {
    const source = [
      "declare const local: (path: string) => unknown;",
      'module.require("apps/api/src/registration.ts");',
      "function shadowed(module: { require(path: string): unknown }) {",
      '  return module.require("apps/api/src/registration.ts");',
      "}",
      "let load;",
      "load = require;",
      'load("apps/api/src/registration.ts");',
      "load = local;",
      'load("apps/api/src/registration.ts");',
      "load = require;",
      'load("apps/api/src/registration.ts");',
      "let assigned = require;",
      'assigned("apps/api/src/registration.ts");',
      "assigned = local;",
      'assigned("apps/api/src/registration.ts");',
      "const fakeModule = { require: local };",
      'fakeModule.require("apps/api/src/registration.ts");',
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/require-flow.ts")).toEqual([
      { path: "packages/obs-capture/src/require-flow.ts", line: 2, class: "zone_import" },
      { path: "packages/obs-capture/src/require-flow.ts", line: 8, class: "zone_import" },
      { path: "packages/obs-capture/src/require-flow.ts", line: 12, class: "zone_import" },
      { path: "packages/obs-capture/src/require-flow.ts", line: 14, class: "zone_import" },
    ]);
  });

  it("retains possible global require across joins and supports computed module require", () => {
    const source = [
      "declare const flag: boolean;",
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "if (flag) load = local;",
      'load("apps/api/src/registration.ts");',
      "load = local;",
      'load("apps/api/src/registration.ts");',
      "let maybe = local;",
      "if (flag) maybe = require;",
      'maybe("apps/api/src/mfa.ts");',
      'module["require"]("apps/api/src/mail-channel.ts");',
      "function shadowed(module: { require(path: string): unknown }) {",
      '  return module["require"]("apps/api/src/registration.ts");',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/require-joins.ts")).toEqual([
      { path: "packages/obs-capture/src/require-joins.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/require-joins.ts", line: 10, class: "zone_import" },
      { path: "packages/obs-capture/src/require-joins.ts", line: 11, class: "zone_import" },
    ]);
  });

  it("resolves computed, spread, and aliased manifest classification data", () => {
    const source = [
      'const sourcePrefix = "apps/api/src/registration.ts";',
      'const compiledPrefix = "apps/api/dist/registration.js";',
      'const harmless = ["apps/api/src/mfa.ts"];',
      "const sourcePrefixes = [sourcePrefix];",
      "const compiledPrefixes = [...[compiledPrefix]];",
      'const base = { ["zone_path_prefixes"]: sourcePrefixes };',
      "const alternates = { compiled_alternate_prefixes: compiledPrefixes };",
      "export const ZONE_MANIFEST = { ...base, ...alternates };",
      "function shadowed(require: (path: string) => unknown, module: { require(path: string): unknown }) {",
      '  return [require("apps/api/src/registration.ts"), module.require("apps/api/src/mfa.ts")];',
      "}",
      "void harmless;",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/manifest-lookalike.ts")).toEqual([
      { path: "packages/obs-capture/src/manifest-lookalike.ts", line: 1, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-lookalike.ts", line: 2, class: "zone_import" },
    ]);
  });

  it("uses current and joined manifest key and array alias values", () => {
    const source = [
      "declare const flag: boolean;",
      'let paths = ["apps/api/src/registration.ts"];',
      'paths = ["packages/kernel/src/error.ts"];',
      "export const SAFE_VALUE = { zone_path_prefixes: paths };",
      'paths = ["apps/api/src/mfa.ts"];',
      "export const CURRENT_VALUE = { zone_path_prefixes: paths };",
      'let key = "zone_path_prefixes";',
      'key = "unrelated";',
      'const zoneForSafeKey = ["apps/api/src/mail-channel.ts"];',
      "export const SAFE_KEY = { [key]: zoneForSafeKey };",
      'key = "compiled_alternate_prefixes";',
      'const currentKeyPaths = ["apps/api/dist/registration.js"];',
      "export const CURRENT_KEY = { [key]: currentKeyPaths };",
      'let joinedPaths = ["packages/kernel/src/error.ts"];',
      'if (flag) joinedPaths = ["apps/api/src/registration.ts"];',
      "export const POSSIBLE_VALUE = { zone_path_prefixes: joinedPaths };",
      'let joinedKey = "unrelated";',
      'if (flag) joinedKey = "zone_path_prefixes";',
      'const possibleKeyPaths = ["apps/api/src/mfa.ts"];',
      "export const POSSIBLE_KEY = { [joinedKey]: possibleKeyPaths };",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/manifest-flow.ts")).toEqual([
      { path: "packages/obs-capture/src/manifest-flow.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-flow.ts", line: 12, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-flow.ts", line: 15, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-flow.ts", line: 19, class: "zone_import" },
    ]);
  });

  it("retains zero-iteration loop paths across callback, cause, require, and manifest flow", () => {
    const callbackSource = [
      "declare const pending: Promise<void>;",
      "declare const flag: boolean;",
      "function consume(error: unknown): void { console.error(error); }",
      "let handler = (_error: unknown) => undefined;",
      "while (flag) handler = (error: unknown) => consume(error);",
      "void pending.catch(handler);",
      "do { void pending; } while (flag);",
    ].join("\n");
    const causeSource = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "declare const flag: boolean;",
      "try { task(); } catch (caught) {",
      "  let maybe = unrelated;",
      "  while (flag) maybe = caught;",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: maybe });',
      "}",
    ].join("\n");
    const requireSource = [
      "declare const flag: boolean;",
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "while (flag) load = local;",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const manifestSource = [
      "declare const flag: boolean;",
      'let paths = ["apps/api/src/registration.ts"];',
      'while (flag) paths = ["packages/kernel/src/error.ts"];',
      "export const LOOKALIKE = { zone_path_prefixes: paths };",
    ].join("\n");

    expect([
      scanSource(callbackSource, "apps/example/src/callback-loop.ts"),
      scanSource(causeSource, "packages/example/src/cause-loop.ts"),
      scanSource(requireSource, "packages/obs-capture/src/require-loop.ts"),
      scanSource(manifestSource, "packages/obs-capture/src/manifest-loop.ts"),
    ]).toEqual([
      [
        { path: "apps/example/src/callback-loop.ts", line: 6, class: "void_promise" },
        { path: "apps/example/src/callback-loop.ts", line: 7, class: "void_promise" },
      ],
      [{ path: "packages/example/src/cause-loop.ts", line: 7, class: "wrapper_without_cause" }],
      [{ path: "packages/obs-capture/src/require-loop.ts", line: 5, class: "zone_import" }],
      [{ path: "packages/obs-capture/src/manifest-loop.ts", line: 2, class: "zone_import" }],
    ]);
  });

  it("joins only reachable completions across fixed-point loops, switch fallthrough, exceptions, and abrupt exits", () => {
    const callbackLoop = [
      "declare const pending: Promise<void>;",
      "function consume(error: unknown): void { console.error(error); }",
      "let a = consume;",
      "let b = consume;",
      "let c = (_error: unknown) => undefined;",
      "for (let i = 0; i < 2; i += 1) { a = b; b = c; }",
      "void pending.catch(a);",
    ].join("\n");
    const causeLoop = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      "  let a = caught;",
      "  let b = caught;",
      "  let c = unrelated;",
      "  for (let i = 0; i < 2; i += 1) { a = b; b = c; }",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: a });',
      "}",
    ].join("\n");
    const requireLoop = [
      "declare const local: (path: string) => unknown;",
      "let a = local;",
      "let b = local;",
      "let c = require;",
      "for (let i = 0; i < 2; i += 1) { a = b; b = c; }",
      'a("apps/api/src/registration.ts");',
    ].join("\n");
    const manifestLoop = [
      'const safe = ["packages/kernel/src/error.ts"];',
      "let a = safe;",
      "let b = safe;",
      'let c = ["apps/api/src/registration.ts"];',
      "for (let i = 0; i < 2; i += 1) { a = b; b = c; }",
      "export const LOOKALIKE = { zone_path_prefixes: a };",
    ].join("\n");
    const switchFallthrough = [
      "declare const mode: number;",
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "switch (mode) {",
      "  case 0: load = require;",
      '  case 1: load("apps/api/src/registration.ts"); break;',
      "}",
    ].join("\n");
    const exceptionalJoin = [
      "declare function task(): void;",
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "try { task(); load = local; } catch (caught) { void caught; }",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const returnNeighbour = [
      "declare const flag: boolean;",
      "declare const pending: Promise<void>;",
      "function consume(error: unknown): void { console.error(error); }",
      "function run(): void {",
      "  let callback = consume;",
      "  if (flag) { callback = (_error: unknown) => undefined; return; }",
      "  void pending.catch(callback);",
      "}",
    ].join("\n");
    const breakPath = [
      "declare const mode: number;",
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "switch (mode) {",
      "  case 0: load = require; break; load = local;",
      "  default: break;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const continuePath = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "for (let i = 0; i < 1; i += 1) { load = require; continue; load = local; }",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const finallyNeighbour = [
      "declare const local: (path: string) => unknown;",
      "function run(): void {",
      "  let load = local;",
      "  try { return; } finally { load = require; }",
      '  load("apps/api/src/registration.ts");',
      "}",
    ].join("\n");

    expect([
      scanSource(callbackLoop, "apps/example/src/callback-fixed-point.ts"),
      scanSource(causeLoop, "packages/example/src/cause-fixed-point.ts"),
      scanSource(requireLoop, "packages/obs-capture/src/require-fixed-point.ts"),
      scanSource(manifestLoop, "packages/obs-capture/src/manifest-fixed-point.ts"),
      scanSource(switchFallthrough, "packages/obs-capture/src/require-switch.ts"),
      scanSource(exceptionalJoin, "packages/obs-capture/src/require-exception.ts"),
      scanSource(returnNeighbour, "apps/example/src/callback-return.ts"),
      scanSource(breakPath, "packages/obs-capture/src/require-break.ts"),
      scanSource(continuePath, "packages/obs-capture/src/require-continue.ts"),
      scanSource(finallyNeighbour, "packages/obs-capture/src/require-finally.ts"),
    ]).toEqual([
      [{ path: "apps/example/src/callback-fixed-point.ts", line: 7, class: "void_promise" }],
      [{ path: "packages/example/src/cause-fixed-point.ts", line: 8, class: "wrapper_without_cause" }],
      [{ path: "packages/obs-capture/src/require-fixed-point.ts", line: 6, class: "zone_import" }],
      [{ path: "packages/obs-capture/src/manifest-fixed-point.ts", line: 4, class: "zone_import" }],
      [{ path: "packages/obs-capture/src/require-switch.ts", line: 6, class: "zone_import" }],
      [{ path: "packages/obs-capture/src/require-exception.ts", line: 5, class: "zone_import" }],
      [],
      [{ path: "packages/obs-capture/src/require-break.ts", line: 8, class: "zone_import" }],
      [{ path: "packages/obs-capture/src/require-continue.ts", line: 4, class: "zone_import" }],
      [],
    ]);
  });

  it("proves rejection consumption from callback bodies and accepts computed catch and then", () => {
    const source = [
      'import { importedObserver } from "./handlers.js";',
      "declare const pending: Promise<void>;",
      "declare function fulfilled(): void;",
      "function consume(error: unknown): void { console.error(error); }",
      "void pending.catch(({ message }: { message: unknown }) => undefined);",
      "void pending.catch(({ message }: { message: unknown }) => consume(message));",
      "void pending.catch(importedObserver);",
      'void pending["catch"](consume);',
      'void pending["then"](fulfilled, consume);',
    ].join("\n");

    expect(scanSource(source, "apps/example/src/callback-bodies.ts")).toEqual([
      { path: "apps/example/src/callback-bodies.ts", line: 5, class: "void_promise" },
      { path: "apps/example/src/callback-bodies.ts", line: 7, class: "void_promise" },
    ]);
  });

  it("requires rejection consumption on every reachable callback completion", () => {
    const source = [
      "declare const pending: Promise<void>;",
      "declare const flag: boolean;",
      "void pending.catch((error: unknown) => { if (flag) console.error(error); });",
      "void pending.catch((error: unknown) => { if (flag) return; console.error(error); });",
      "void pending.catch((error: unknown) => { if (flag) console.error(error); else console.warn(error); });",
      "void pending.catch((error: unknown) => { if (flag) return console.error(error); console.warn(error); });",
    ].join("\n");

    expect(scanSource(source, "apps/example/src/callback-all-paths.ts")).toEqual([
      { path: "apps/example/src/callback-all-paths.ts", line: 3, class: "void_promise" },
      { path: "apps/example/src/callback-all-paths.ts", line: 4, class: "void_promise" },
    ]);
  });

  it("keeps switch and zero-iteration callback paths in the rejection proof", () => {
    const source = [
      "declare const pending: Promise<void>;",
      "declare const mode: number;",
      "declare const values: readonly unknown[];",
      "function consume(error: unknown): void { console.error(error); }",
      "void pending.catch((error: unknown) => { switch (mode) { case 0: consume(error); break; default: break; } });",
      "void pending.catch((error: unknown) => { switch (mode) { case 0: consume(error); break; default: consume(error); } });",
      "void pending.catch((error: unknown) => { for (const value of values) { void value; consume(error); } });",
      "void pending.catch((error: unknown) => { do { consume(error); } while (false); });",
    ].join("\n");

    expect(scanSource(source, "apps/example/src/callback-switch-paths.ts")).toEqual([
      { path: "apps/example/src/callback-switch-paths.ts", line: 5, class: "void_promise" },
      { path: "apps/example/src/callback-switch-paths.ts", line: 7, class: "void_promise" },
    ]);
  });

  it("does not evaluate a later case expression along an earlier fallthrough path", () => {
    const source = [
      "declare const mode: number;",
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "switch (mode) {",
      "  case 0: load = require;",
      "  case (load = local, 1):",
      '    load("apps/api/src/registration.ts"); break;',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/require-case-order.ts")).toEqual([
      { path: "packages/obs-capture/src/require-case-order.ts", line: 7, class: "zone_import" },
    ]);
  });

  it("keeps caught-root aliases visible through a shadowed catch name", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      "  const root = caught;",
      "  {",
      "    const caught = unrelated;",
      '    new DomainError("WRAP_FAILED", "fixed");',
      "    void root;",
      "  }",
      "}",
      "try { task(); } catch (caught) {",
      "  {",
      "    const caught = unrelated;",
      '    new DomainError("LOCAL_ONLY", "fixed");',
      "  }",
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/cause-shadow-alias.ts")).toEqual([
      { path: "packages/example/src/cause-shadow-alias.ts", line: 7, class: "wrapper_without_cause" },
    ]);
  });

  it("applies delete and Object.assign writes to shared cause objects", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      "  const deleted = { cause: caught };",
      "  delete deleted.cause;",
      '  new DomainError("WRAP_FAILED", "fixed", deleted);',
      "  const overwritten = { cause: caught };",
      "  Object.assign(overwritten, { cause: unrelated });",
      '  new DomainError("WRAP_FAILED", "fixed", overwritten);',
      "  const restored = { cause: unrelated };",
      "  Object.assign(restored, { cause: caught });",
      '  new DomainError("WRAP_FAILED", "fixed", restored);',
      "  const deleteThenRestore = { cause: caught };",
      "  delete deleteThenRestore.cause;",
      "  Object.assign(deleteThenRestore, { cause: caught });",
      '  new DomainError("WRAP_FAILED", "fixed", deleteThenRestore);',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/cause-mutations.ts")).toEqual([
      { path: "packages/example/src/cause-mutations.ts", line: 6, class: "wrapper_without_cause" },
      { path: "packages/example/src/cause-mutations.ts", line: 9, class: "wrapper_without_cause" },
    ]);
  });

  it("uses current and joined coded-throw and DomainError constructor aliases", () => {
    const source = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "class LocalError { constructor(..._args: unknown[]) {} }",
      'let harmfulThrow = new Error("DECLARED_CODE");',
      'harmfulThrow = new Error("ordinary text");',
      "throw harmfulThrow;",
      'let safeThrow = new Error("ordinary text");',
      'safeThrow = new Error("CURRENT_CODE");',
      "throw safeThrow;",
      "let CurrentWrapper = LocalError;",
      "CurrentWrapper = DomainError;",
      "try { task(); } catch (caught) {",
      '  new CurrentWrapper("WRAP_FAILED", "fixed");',
      "}",
      "let ReplacedWrapper = DomainError;",
      "ReplacedWrapper = LocalError;",
      "try { task(); } catch (caught) {",
      '  new ReplacedWrapper("LOCAL_ONLY", "fixed");',
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/current-aliases.ts")).toEqual([
      { path: "packages/example/src/current-aliases.ts", line: 5, class: "throw_without_code" },
      { path: "packages/example/src/current-aliases.ts", line: 12, class: "wrapper_without_cause" },
    ]);
  });

  it("does not infer a domain wrapper from a same-spelled foreign import", () => {
    const source = [
      'import { TypedDomainError as ForeignError } from "./local.js";',
      "try { task(); } catch (caught) {",
      '  new ForeignError("LOCAL_ONLY", "fixed");',
      "  void caught;",
      "}",
    ].join("\n");

    expect(scanSource(source, "packages/example/src/foreign-wrapper.ts")).toEqual([]);
  });

  it("models nullish require assignment and comma-style indirect calls", () => {
    const source = [
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "load ??= local;",
      'load("apps/api/src/registration.ts");',
      '(0, require)("apps/api/src/mfa.ts");',
      "let maybe: ((path: string) => unknown) | undefined;",
      "maybe ??= require;",
      'maybe("apps/api/src/mail-channel.ts");',
      "function shadowed(require: (path: string) => unknown): void {",
      '  (0, require)("apps/api/src/registration.ts");',
      "}",
      "let definitelyLocal = local;",
      "definitelyLocal ??= require;",
      'definitelyLocal("apps/api/src/registration.ts");',
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/require-expressions.ts")).toEqual([
      { path: "packages/obs-capture/src/require-expressions.ts", line: 4, class: "zone_import" },
      { path: "packages/obs-capture/src/require-expressions.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/require-expressions.ts", line: 8, class: "zone_import" },
    ]);
  });

  it("re-evaluates loop conditions at the back edge before forming the exit state", () => {
    const source = [
      "declare const local: (path: string) => unknown;",
      "let first = local;",
      "let firstIndex = 0;",
      "while ((first = require, firstIndex++ < 1)) first = local;",
      'first("apps/api/src/registration.ts");',
      "let second = local;",
      "let secondIndex = 0;",
      "while ((second = local, secondIndex++ < 1)) second = require;",
      'second("apps/api/src/mfa.ts");',
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/require-loop-condition.ts")).toEqual([
      { path: "packages/obs-capture/src/require-loop-condition.ts", line: 5, class: "zone_import" },
    ]);
  });

  it("tracks manifest-shaped property writes with exact computed keys", () => {
    const source = [
      'const CLASSIFIED = "zone_path_prefixes" as const;',
      'const safe = ["packages/kernel/src/error.ts"];',
      "const direct = { zone_path_prefixes: safe };",
      'direct.zone_path_prefixes = ["apps/api/src/registration.ts"];',
      "export { direct };",
      "const computed = { [CLASSIFIED]: safe };",
      'computed[CLASSIFIED] = ["apps/api/src/mfa.ts"];',
      "export { computed };",
      "const safeNeighbour = { zone_path_prefixes: safe };",
      "safeNeighbour.zone_path_prefixes = safe;",
      "export { safeNeighbour };",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/manifest-property-flow.ts")).toEqual([
      { path: "packages/obs-capture/src/manifest-property-flow.ts", line: 4, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-property-flow.ts", line: 7, class: "zone_import" },
    ]);
    expect(scanSource(source, "packages/obs-capture/src/zone/manifest.ts")).toEqual([]);
  });

  it("routes labelled loop completions and exposes widened cap states at exits", () => {
    const labeledHarmful = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "outer: for (let i = 0; i < 2; i += 1) {",
      "  load = require;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const labeledSafe = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "outer: for (let i = 0; i < 2; i += 1) {",
      "  load = require;",
      "  load = local;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const chain = (prefix: string, first: string, last: string): string[] => Array.from(
      { length: 65 },
      (_, index) => `let ${prefix}${index} = ${index === 64 ? last : first};`,
    );
    const transfers = (prefix: string): string => Array.from(
      { length: 64 },
      (_, index) => `${prefix}${index} = ${prefix}${index + 1};`,
    ).join(" ");
    const requireCap = [
      "declare const flag: boolean;",
      "declare const local: (path: string) => unknown;",
      ...chain("r", "local", "require"),
      `while (flag) { ${transfers("r")} }`,
      'r0("apps/api/src/mfa.ts");',
    ].join("\n");
    const callbackCap = [
      "declare const flag: boolean;",
      "declare const pending: Promise<void>;",
      "function consume(error: unknown): void { console.error(error); }",
      ...chain("c", "consume", "(_error: unknown) => undefined"),
      `while (flag) { ${transfers("c")} }`,
      "void pending.catch(c0);",
    ].join("\n");
    const throwCap = [
      "declare const flag: boolean;",
      ...chain("t", 'new Error("SAFE_CODE")', 'new Error("ordinary text")'),
      `while (flag) { ${transfers("t")} }`,
      "throw t0;",
    ].join("\n");
    const constructorCap = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const flag: boolean;",
      "class LocalError { constructor(..._args: unknown[]) {} }",
      ...chain("w", "LocalError", "DomainError"),
      `while (flag) { ${transfers("w")} }`,
      'try { task(); } catch (caught) { new w0("WRAP_FAILED", "fixed"); void caught; }',
    ].join("\n");
    const causeCap = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const flag: boolean;",
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      ...chain("a", "caught", "unrelated").map((line) => `  ${line}`),
      `  while (flag) { ${transfers("a")} }`,
      '  new DomainError("WRAP_FAILED", "fixed", { cause: a0 });',
      "}",
    ].join("\n");
    const safeCap = [
      "declare const flag: boolean;",
      "declare const local: (path: string) => unknown;",
      ...chain("s", "local", "local"),
      `while (flag) { ${transfers("s")} }`,
      's0("apps/api/src/registration.ts");',
    ].join("\n");

    expect([
      scanSource(labeledHarmful, "packages/obs-capture/src/label-harmful.ts"),
      scanSource(labeledSafe, "packages/obs-capture/src/label-safe.ts"),
      scanSource(requireCap, "packages/obs-capture/src/cap-require.ts"),
      scanSource(callbackCap, "apps/example/src/cap-callback.ts"),
      scanSource(throwCap, "packages/example/src/cap-throw.ts"),
      scanSource(constructorCap, "packages/example/src/cap-constructor.ts"),
      scanSource(causeCap, "packages/example/src/cap-cause.ts"),
      scanSource(safeCap, "packages/obs-capture/src/cap-safe.ts"),
    ]).toEqual([
      [{ path: "packages/obs-capture/src/label-harmful.ts", line: 7, class: "zone_import" }],
      [],
      [{ path: "packages/obs-capture/src/cap-require.ts", line: 69, class: "zone_import" }],
      [{ path: "apps/example/src/cap-callback.ts", line: 70, class: "void_promise" }],
      [{ path: "packages/example/src/cap-throw.ts", line: 68, class: "throw_without_code" }],
      [{ path: "packages/example/src/cap-constructor.ts", line: 70, class: "wrapper_without_cause" }],
      [{ path: "packages/example/src/cap-cause.ts", line: 71, class: "wrapper_without_cause" }],
      [],
    ]);
  });

  it("transfers for-of and array-destructuring values into every tracked domain", () => {
    const requireForOf = [
      "for (const load of [require]) {",
      '  load("apps/api/src/registration.ts");',
      "}",
      "for (const load of [(path: string) => path]) {",
      '  load("apps/api/src/registration.ts");',
      "}",
    ].join("\n");
    const wrapperForOf = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "class LocalError { constructor(..._args: unknown[]) {} }",
      "for (const Wrapper of [DomainError]) {",
      '  try { task(); } catch (caught) { new Wrapper("WRAP_FAILED", "fixed"); void caught; }',
      "}",
      "for (const Wrapper of [LocalError]) {",
      '  try { task(); } catch (caught) { new Wrapper("LOCAL_ONLY", "fixed"); void caught; }',
      "}",
    ].join("\n");
    const safeCauseForOf = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "try { task(); } catch (caught) {",
      "  for (const root of [caught]) {",
      '    new DomainError("WRAP_FAILED", "fixed", { cause: root });',
      "  }",
      "}",
    ].join("\n");
    const destructuring = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "let load; [load] = [require];",
      'load("apps/api/src/mfa.ts");',
      "let Wrapper; [Wrapper] = [DomainError];",
      'try { task(); } catch (caught) { new Wrapper("WRAP_FAILED", "fixed"); void caught; }',
      "try { task(); } catch (caught) {",
      "  const [root] = [caught];",
      '  new DomainError("WRAP_FAILED", "fixed", { cause: root });',
      "}",
    ].join("\n");
    const forInKeys = [
      "for (const code in { SAFE_CODE: true }) { throw code; }",
      "for (const code in { ordinary: true }) { throw code; }",
    ].join("\n");

    expect(scanSource(requireForOf, "packages/obs-capture/src/for-of-require.ts")).toEqual([
      { path: "packages/obs-capture/src/for-of-require.ts", line: 2, class: "zone_import" },
    ]);
    expect(scanSource(wrapperForOf, "packages/example/src/for-of-wrapper.ts")).toEqual([
      { path: "packages/example/src/for-of-wrapper.ts", line: 4, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(safeCauseForOf, "packages/example/src/for-of-cause.ts")).toEqual([]);
    expect(scanSource(destructuring, "packages/obs-capture/src/destructuring.ts")).toEqual([
      { path: "packages/obs-capture/src/destructuring.ts", line: 3, class: "zone_import" },
      { path: "packages/obs-capture/src/destructuring.ts", line: 5, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(forInKeys, "packages/example/src/for-in-keys.ts")).toEqual([
      { path: "packages/example/src/for-in-keys.ts", line: 2, class: "throw_without_code" },
    ]);
  });

  it("uses truthy logical assignment and assignment-expression result values", () => {
    const requires = [
      "declare const local: (path: string) => unknown;",
      "let retained = require; retained ||= local;",
      'retained("apps/api/src/registration.ts");',
      "let installed = local; installed &&= require;",
      'installed("apps/api/src/mfa.ts");',
      "let assigned = local;",
      '(assigned = require)("apps/api/src/mail-channel.ts");',
      "let replaced = require; replaced &&= local;",
      'replaced("apps/api/src/registration.ts");',
      "let fallback: ((path: string) => unknown) | undefined; fallback ||= local;",
      'fallback("apps/api/src/registration.ts");',
    ].join("\n");
    const wrappers = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "class LocalError { constructor(..._args: unknown[]) {} }",
      "let retained = DomainError; retained ||= LocalError;",
      'try { task(); } catch (caught) { new retained("WRAP_FAILED", "fixed"); void caught; }',
      "let installed = LocalError; installed &&= DomainError;",
      'try { task(); } catch (caught) { new installed("WRAP_FAILED", "fixed"); void caught; }',
      "let replaced = DomainError; replaced &&= LocalError;",
      'try { task(); } catch (caught) { new replaced("LOCAL_ONLY", "fixed"); void caught; }',
    ].join("\n");
    const safeOtherDomains = [
      "declare const pending: Promise<void>;",
      "function consume(error: unknown): void { console.error(error); }",
      "function ignore(_error: unknown): void {}",
      "let callback = consume; callback ||= ignore; void pending.catch(callback);",
      "callback = ignore; callback &&= consume; void pending.catch(callback);",
      'let coded = new Error("SAFE_CODE"); coded ||= new Error("ordinary text"); throw coded;',
    ].join("\n");
    const safeManifest = [
      'const safe = ["packages/kernel/src/error.ts"];',
      'let paths = safe; paths ||= ["apps/api/src/registration.ts"];',
      "export const LOOKALIKE = { zone_path_prefixes: paths };",
    ].join("\n");

    expect(scanSource(requires, "packages/obs-capture/src/logical-require.ts")).toEqual([
      { path: "packages/obs-capture/src/logical-require.ts", line: 3, class: "zone_import" },
      { path: "packages/obs-capture/src/logical-require.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/logical-require.ts", line: 7, class: "zone_import" },
    ]);
    expect(scanSource(wrappers, "packages/example/src/logical-wrapper.ts")).toEqual([
      { path: "packages/example/src/logical-wrapper.ts", line: 4, class: "wrapper_without_cause" },
      { path: "packages/example/src/logical-wrapper.ts", line: 6, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(safeOtherDomains, "apps/example/src/logical-safe.ts")).toEqual([]);
    expect(scanSource(safeManifest, "packages/obs-capture/src/logical-manifest.ts")).toEqual([]);
  });

  it("interprets closures and rejection callbacks through the statement CFG", () => {
    const declarationClosure = [
      "const load = require;",
      "function run(): void {",
      '  load("apps/api/src/registration.ts");',
      "}",
      "run();",
    ].join("\n");
    const expressionClosure = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      'const run = () => load("apps/api/src/mfa.ts");',
      "load = require;",
      "run();",
    ].join("\n");
    const constructorClosure = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "class LocalError { constructor(..._args: unknown[]) {} }",
      "let Wrapper = LocalError;",
      'function run(): void { try { task(); } catch (caught) { new Wrapper("WRAP_FAILED", "fixed"); void caught; } }',
      "Wrapper = DomainError;",
      "run();",
    ].join("\n");
    const codedClosure = [
      'let failure = new Error("ordinary text");',
      "function run(): void { throw failure; }",
      'failure = new Error("CURRENT_CODE");',
      "run();",
    ].join("\n");
    const callbacks = [
      "declare const pending: Promise<void>;",
      "void pending.catch((error: unknown) => { done: { break done; console.error(error); } });",
      "void pending.catch((error: unknown) => { try { console.error(error); } catch (caught) { void caught; return; } });",
      "void pending.catch((error: unknown) => { switch (error) { case error: return; default: return; } });",
    ].join("\n");

    expect(scanSource(declarationClosure, "packages/obs-capture/src/declaration-closure.ts")).toEqual([
      { path: "packages/obs-capture/src/declaration-closure.ts", line: 3, class: "zone_import" },
    ]);
    expect(scanSource(expressionClosure, "packages/obs-capture/src/expression-closure.ts")).toEqual([
      { path: "packages/obs-capture/src/expression-closure.ts", line: 3, class: "zone_import" },
    ]);
    expect(scanSource(constructorClosure, "packages/example/src/constructor-closure.ts")).toEqual([
      { path: "packages/example/src/constructor-closure.ts", line: 4, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(codedClosure, "packages/example/src/coded-closure.ts")).toEqual([]);
    expect(scanSource(callbacks, "apps/example/src/callback-shared-cfg.ts")).toEqual([
      { path: "apps/example/src/callback-shared-cfg.ts", line: 2, class: "void_promise" },
    ]);
  });

  it("tracks computed and returned Object.assign identities plus manifest array mutations", () => {
    const causes = [
      'import { TypedDomainError as DomainError } from "@debateai/kernel";',
      "declare const unrelated: unknown;",
      "try { task(); } catch (caught) {",
      "  const overwritten = { cause: caught };",
      '  Object["assign"](overwritten, { cause: unrelated });',
      '  new DomainError("WRAP_FAILED", "fixed", overwritten);',
      "  const preserved = Object.assign({}, { cause: caught });",
      '  new DomainError("WRAP_FAILED", "fixed", preserved);',
      "  const restored = Object[\"assign\"]({}, { cause: unrelated }, { cause: caught });",
      '  new DomainError("WRAP_FAILED", "fixed", restored);',
      "}",
    ].join("\n");
    const manifest = [
      'const paths = ["packages/kernel/src/error.ts"];',
      'paths.push("apps/api/src/registration.ts");',
      "export const FIRST = { zone_path_prefixes: paths };",
      'const SECOND = { zone_path_prefixes: ["packages/kernel/src/error.ts"] };',
      'SECOND.zone_path_prefixes.push("apps/api/src/mfa.ts");',
      "export { SECOND };",
      'const safe = ["packages/kernel/src/error.ts"];',
      'safe.push("packages/kernel/src/error.ts");',
      "export const SAFE = { zone_path_prefixes: safe };",
    ].join("\n");
    const manifestStaticImport = 'import "../../../../apps/api/src/registration.js";';

    expect(scanSource(causes, "packages/example/src/assign-identities.ts")).toEqual([
      { path: "packages/example/src/assign-identities.ts", line: 6, class: "wrapper_without_cause" },
    ]);
    expect(scanSource(manifest, "packages/obs-capture/src/manifest-array-mutation.ts")).toEqual([
      { path: "packages/obs-capture/src/manifest-array-mutation.ts", line: 2, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-array-mutation.ts", line: 5, class: "zone_import" },
    ]);
    expect(scanSource(manifest, "packages/obs-capture/src/zone/manifest.ts")).toEqual([]);
    expect(scanSource(manifestStaticImport, "packages/obs-capture/src/zone/manifest.ts")).toEqual([
      { path: "packages/obs-capture/src/zone/manifest.ts", line: 1, class: "zone_import" },
    ]);
  });

  it("routes continue through every label stacked directly on a loop", () => {
    const harmful = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "outer: inner: for (let i = 0; i < 1; i += 1) {",
      "  load = require;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const safe = [
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "outer: inner: for (let i = 0; i < 1; i += 1) {",
      "  load = local;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const incrementorHarmful = [
      "declare const local: (path: string) => unknown;",
      "let load = require;",
      "outer: inner: for (let i = 0; i < 1; (i += 1, load = require)) {",
      "  load = local;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");
    const incrementorSafe = [
      "declare const local: (path: string) => unknown;",
      "let load = local;",
      "outer: inner: for (let i = 0; i < 1; (i += 1, load = local)) {",
      "  load = require;",
      "  continue outer;",
      "}",
      'load("apps/api/src/registration.ts");',
    ].join("\n");

    expect(scanSource(harmful, "packages/obs-capture/src/stacked-label-harmful.ts")).toEqual([
      { path: "packages/obs-capture/src/stacked-label-harmful.ts", line: 7, class: "zone_import" },
    ]);
    expect(scanSource(safe, "packages/obs-capture/src/stacked-label-safe.ts")).toEqual([]);
    expect(scanSource(
      incrementorHarmful,
      "packages/obs-capture/src/stacked-label-incrementor-harmful.ts",
    )).toEqual([
      { path: "packages/obs-capture/src/stacked-label-incrementor-harmful.ts", line: 7, class: "zone_import" },
    ]);
    expect(scanSource(
      incrementorSafe,
      "packages/obs-capture/src/stacked-label-incrementor-safe.ts",
    )).toEqual([]);
  });

  it("transfers aliased collections, destructuring values, and spread object keys", () => {
    const source = [
      "declare const local: (path: string) => unknown;",
      "const loaders = [require];",
      "for (const load of loaders) {",
      '  load("apps/api/src/registration.ts");',
      "}",
      "const locals = [local];",
      "for (const load of locals) {",
      '  load("apps/api/src/registration.ts");',
      "}",
      "const [load] = loaders;",
      'load("apps/api/src/mfa.ts");',
      "const [localLoad] = locals;",
      'localLoad("apps/api/src/mfa.ts");',
      "const harmfulKeys = { ordinary: true };",
      "for (const code in harmfulKeys) { throw code; }",
      "const safeKeys = { SAFE_CODE: true };",
      "for (const code in safeKeys) { throw code; }",
      "const spreadHarmful = { ...{ ordinary: true } };",
      "for (const code in spreadHarmful) { throw code; }",
      "const spreadSafe = { ...{ SAFE_CODE: true } };",
      "for (const code in spreadSafe) { throw code; }",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/aliased-collections.ts")).toEqual([
      { path: "packages/obs-capture/src/aliased-collections.ts", line: 4, class: "zone_import" },
      { path: "packages/obs-capture/src/aliased-collections.ts", line: 11, class: "zone_import" },
      { path: "packages/obs-capture/src/aliased-collections.ts", line: 15, class: "throw_without_code" },
      { path: "packages/obs-capture/src/aliased-collections.ts", line: 19, class: "throw_without_code" },
    ]);
  });

  it("uses property assignment expression results in require callee position", () => {
    const source = [
      "declare const local: (path: string) => unknown;",
      "const assigned = { load: local };",
      '(assigned.load = require)("apps/api/src/registration.ts");',
      "const retained = { load: require };",
      '(retained.load ||= local)("apps/api/src/mfa.ts");',
      "const installed = { load: local };",
      '(installed.load &&= require)("apps/api/src/mail-channel.ts");',
      "const safe = { load: require };",
      '(safe.load = local)("apps/api/src/registration.ts");',
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/property-assignment-callee.ts")).toEqual([
      { path: "packages/obs-capture/src/property-assignment-callee.ts", line: 3, class: "zone_import" },
      { path: "packages/obs-capture/src/property-assignment-callee.ts", line: 5, class: "zone_import" },
      { path: "packages/obs-capture/src/property-assignment-callee.ts", line: 7, class: "zone_import" },
    ]);
  });

  it("executes nested closures with the state at each nested call", () => {
    const harmful = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  let load = local;",
      '  const inner = () => load("apps/api/src/registration.ts");',
      "  load = require;",
      "  inner();",
      "}",
      "outer();",
    ].join("\n");
    const safe = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  let load = require;",
      '  const inner = () => load("apps/api/src/registration.ts");',
      "  load = local;",
      "  inner();",
      "}",
      "outer();",
    ].join("\n");

    expect(scanSource(harmful, "packages/obs-capture/src/nested-call-harmful.ts")).toEqual([
      { path: "packages/obs-capture/src/nested-call-harmful.ts", line: 4, class: "zone_import" },
    ]);
    expect(scanSource(safe, "packages/obs-capture/src/nested-call-safe.ts")).toEqual([]);
  });

  it("does not drop the first harmful nested closure state at the execution cap", () => {
    const harmful = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  let load = local;",
      '  const inner = () => load("apps/api/src/registration.ts");',
      "  inner();",
      "  inner();",
      "  inner();",
      "  inner();",
      "  load = require;",
      "  inner();",
      "}",
      "outer();",
    ].join("\n");
    const safe = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  let load = local;",
      '  const inner = () => load("apps/api/src/registration.ts");',
      "  inner();",
      "  inner();",
      "  inner();",
      "  inner();",
      "  load = local;",
      "  inner();",
      "}",
      "outer();",
    ].join("\n");

    expect(scanSource(harmful, "packages/obs-capture/src/nested-call-cap-harmful.ts")).toEqual([
      { path: "packages/obs-capture/src/nested-call-cap-harmful.ts", line: 4, class: "zone_import" },
    ]);
    expect(scanSource(safe, "packages/obs-capture/src/nested-call-cap-safe.ts")).toEqual([]);
  });

  it("compares nested closure entry states after binding call arguments", () => {
    const harmful = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  const inner = (load: (path: string) => unknown) =>",
      '    load("apps/api/src/registration.ts");',
      "  inner(local);",
      "  inner(local);",
      "  inner(local);",
      "  inner(local);",
      "  inner(require);",
      "}",
      "outer();",
    ].join("\n");
    const safe = [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  const inner = (load: (path: string) => unknown) =>",
      '    load("apps/api/src/registration.ts");',
      "  inner(local);",
      "  inner(local);",
      "  inner(local);",
      "  inner(local);",
      "  inner(local);",
      "}",
      "outer();",
    ].join("\n");

    expect(scanSource(harmful, "packages/obs-capture/src/nested-argument-cap-harmful.ts")).toEqual([
      { path: "packages/obs-capture/src/nested-argument-cap-harmful.ts", line: 4, class: "zone_import" },
    ]);
    expect(scanSource(safe, "packages/obs-capture/src/nested-argument-cap-safe.ts")).toEqual([]);
  });

  it("saturates changing caller state without inventing a global require callee", () => {
    const source = (lastLoad: "local" | "require") => [
      "declare const local: (path: string) => unknown;",
      "function outer(): void {",
      "  let load = local;",
      '  let marker = "SAFE_A";',
      '  const inner = () => { marker; load("apps/api/src/registration.ts"); };',
      "  inner();",
      '  marker = "SAFE_B"; inner();',
      '  marker = "SAFE_C"; inner();',
      '  marker = "SAFE_D"; inner();',
      `  marker = "SAFE_E"; load = ${lastLoad}; inner();`,
      "}",
      "outer();",
    ].join("\n");

    expect(scanSource(
      source("require"),
      "packages/obs-capture/src/nested-saturation-harmful.ts",
    )).toEqual([
      { path: "packages/obs-capture/src/nested-saturation-harmful.ts", line: 5, class: "zone_import" },
    ]);
    expect(scanSource(
      source("local"),
      "packages/obs-capture/src/nested-saturation-safe.ts",
    )).toEqual([]);
  });

  it("updates exact manifest array indices, fill, and indirect native push", () => {
    const source = [
      'const indexHarmful = ["packages/kernel/src/error.ts"];',
      'indexHarmful["0"] = "apps/api/src/registration.ts";',
      "export const INDEX_HARMFUL = { zone_path_prefixes: indexHarmful };",
      'const indexSafe = ["apps/api/src/registration.ts"];',
      'indexSafe["0"] = "packages/kernel/src/error.ts";',
      "export const INDEX_SAFE = { zone_path_prefixes: indexSafe };",
      'const fillHarmful = ["packages/kernel/src/error.ts"];',
      'fillHarmful.fill("apps/api/src/mfa.ts");',
      "export const FILL_HARMFUL = { zone_path_prefixes: fillHarmful };",
      'const fillSafe = ["apps/api/src/mfa.ts"];',
      'fillSafe.fill("packages/kernel/src/error.ts");',
      "export const FILL_SAFE = { zone_path_prefixes: fillSafe };",
      'const callHarmful = ["packages/kernel/src/error.ts"];',
      'Array.prototype.push.call(callHarmful, "apps/api/src/mail-channel.ts");',
      "export const CALL_HARMFUL = { zone_path_prefixes: callHarmful };",
      'const callSafe = ["packages/kernel/src/error.ts"];',
      'Array.prototype.push.call(callSafe, "packages/kernel/src/error.ts");',
      "export const CALL_SAFE = { zone_path_prefixes: callSafe };",
    ].join("\n");

    expect(scanSource(source, "packages/obs-capture/src/manifest-array-standard-mutations.ts")).toEqual([
      { path: "packages/obs-capture/src/manifest-array-standard-mutations.ts", line: 2, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-array-standard-mutations.ts", line: 8, class: "zone_import" },
      { path: "packages/obs-capture/src/manifest-array-standard-mutations.ts", line: 14, class: "zone_import" },
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
