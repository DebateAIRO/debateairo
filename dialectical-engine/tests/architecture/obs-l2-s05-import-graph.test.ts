import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PACKAGE_ROOT = resolve(ROOT, "packages/obs-capture");
const INSTALL_ROOT = resolve(PACKAGE_ROOT, "install");
const INSTALL_ENTRIES = Object.freeze([
  "api.ts",
  "evaluator-lib.ts",
  "runner.ts",
  "scheduler.ts",
  "ui-client.ts",
]);

type ImportKind = "dynamic" | "require" | "static" | "type";

interface ImportReference {
  readonly kind: ImportKind;
  readonly specifier: string;
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/u.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[\w$]/u.test(char);
}

function skipTrivia(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length) {
    if (/\s/u.test(source[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    if (source.startsWith("//", cursor)) {
      const end = source.indexOf("\n", cursor + 2);
      return end < 0 ? source.length : skipTrivia(source, end + 1);
    }
    if (source.startsWith("/*", cursor)) {
      const end = source.indexOf("*/", cursor + 2);
      return end < 0 ? source.length : skipTrivia(source, end + 2);
    }
    break;
  }
  return cursor;
}

function readIdentifier(source: string, start: number): { readonly end: number; readonly value: string } | null {
  if (!isIdentifierStart(source[start])) return null;
  let end = start + 1;
  while (isIdentifierPart(source[end])) end += 1;
  return { end, value: source.slice(start, end) };
}

function readString(source: string, start: number): { readonly end: number; readonly value: string } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let cursor = start + 1;
  let value = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === quote) return { end: cursor + 1, value };
    if (char === "\\") {
      cursor += 1;
      if (cursor >= source.length) return null;
      value += source[cursor] ?? "";
      cursor += 1;
      continue;
    }
    value += char ?? "";
    cursor += 1;
  }
  return null;
}

function scanDeclarationSpecifier(source: string, start: number): { readonly end: number; readonly value: string } | null {
  let cursor = start;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    const literal = readString(source, cursor);
    if (literal !== null) return literal;
    if (source[cursor] === ";") return null;
    cursor += 1;
  }
  return null;
}

function scanReexportSpecifier(source: string, start: number): { readonly end: number; readonly value: string } | null {
  let cursor = start;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    const literal = readString(source, cursor);
    if (literal !== null) {
      cursor = literal.end;
      continue;
    }
    if (source[cursor] === ";") return null;
    const identifier = readIdentifier(source, cursor);
    if (identifier?.value === "from") {
      return readString(source, skipTrivia(source, identifier.end));
    }
    cursor = identifier?.end ?? cursor + 1;
  }
  return null;
}

function findTemplateExpressionEnd(source: string, start: number): number {
  let cursor = start;
  let depth = 1;
  while (cursor < source.length) {
    const next = skipTrivia(source, cursor);
    if (next !== cursor) {
      cursor = next;
      continue;
    }
    const literal = readString(source, cursor);
    if (literal !== null) {
      cursor = literal.end;
      continue;
    }
    if (source[cursor] === "{") depth += 1;
    if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return source.length;
}

function collectTemplateExpressionImports(source: string, start: number): {
  readonly end: number;
  readonly references: readonly ImportReference[];
} {
  const references: ImportReference[] = [];
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === "`") return { end: cursor + 1, references };
    if (source.startsWith("${", cursor)) {
      const expressionEnd = findTemplateExpressionEnd(source, cursor + 2);
      references.push(...collectImportReferences(source.slice(cursor + 2, expressionEnd)));
      cursor = expressionEnd + 1;
      continue;
    }
    cursor += 1;
  }
  return { end: source.length, references };
}

/** Lexes imports without treating comments or ordinary string contents as code. */
function collectImportReferences(source: string): readonly ImportReference[] {
  const references: ImportReference[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    const literal = readString(source, cursor);
    if (literal !== null) {
      cursor = literal.end;
      continue;
    }
    if (source[cursor] === "`") {
      const template = collectTemplateExpressionImports(source, cursor);
      references.push(...template.references);
      cursor = template.end;
      continue;
    }
    const identifier = readIdentifier(source, cursor);
    if (identifier === null) {
      cursor += 1;
      continue;
    }
    cursor = identifier.end;

    if (identifier.value === "import") {
      const next = skipTrivia(source, cursor);
      if (source[next] === ".") continue;
      if (source[next] === "(") {
        const argument = readString(source, skipTrivia(source, next + 1));
        if (argument !== null) references.push({ kind: "dynamic", specifier: argument.value });
        continue;
      }
      const maybeType = readIdentifier(source, next);
      const kind: ImportKind = maybeType?.value === "type" ? "type" : "static";
      const specifier = scanDeclarationSpecifier(
        source,
        maybeType?.value === "type" ? maybeType.end : next,
      );
      if (specifier !== null) {
        references.push({ kind, specifier: specifier.value });
        cursor = specifier.end;
      }
      continue;
    }

    if (identifier.value === "export") {
      const next = skipTrivia(source, cursor);
      const maybeType = readIdentifier(source, next);
      const kind: ImportKind = maybeType?.value === "type" ? "type" : "static";
      const declarationStart = maybeType?.value === "type" ? maybeType.end : next;
      const specifier = scanReexportSpecifier(source, declarationStart);
      if (specifier !== null) {
        references.push({ kind, specifier: specifier.value });
        cursor = specifier.end;
      }
      continue;
    }

    if (identifier.value === "require") {
      const open = skipTrivia(source, cursor);
      if (source[open] === "(") {
        const argument = readString(source, skipTrivia(source, open + 1));
        if (argument !== null) references.push({ kind: "require", specifier: argument.value });
      }
    }
  }
  return Object.freeze(references);
}

function isForbiddenOutboundImport(specifier: string): boolean {
  const normalized = specifier.replaceAll("\\", "/").replace(/\.(?:js|ts)$/u, "");
  return normalized === "@debateai/db"
    || normalized.startsWith("@debateai/db/")
    || normalized.includes("apps/api/src/registration")
    || normalized.includes("apps/api/src/mail-channel")
    || normalized.includes("packages/db/src/identity");
}

function assertOutboundImportFence(path: string, source: string): void {
  const forbidden = collectImportReferences(source).find(({ specifier }) =>
    isForbiddenOutboundImport(specifier));
  if (forbidden !== undefined) {
    throw new Error(
      `OBS_CAPTURE_OUTBOUND_IMPORT_FORBIDDEN: ${path} ${forbidden.kind} ${forbidden.specifier}`,
    );
  }
}

async function listTypeScriptFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return Object.freeze(files.sort());
}

async function listImportSourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listImportSourceFiles(path));
    } else if (entry.isFile() && /\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return Object.freeze(files.sort());
}

function importLightProbe(entry: string): ReturnType<typeof spawnSync> {
  const specifier = `@debateai/obs-capture/install/${entry.replace(/\.ts$/u, "")}`;
  const exportAssertion = entry === "evaluator-lib.ts"
    ? 'if (typeof loaded.captureEvaluatorLibraryFailure !== "function") throw new Error("EVALUATOR_SEAM_MISSING");'
    : entry === "ui-client.ts"
      ? 'if (typeof loaded.captureUiClientFailure !== "function") throw new Error("UI_CLIENT_SEAM_MISSING");'
      : 'if (loaded.PROCESS_HANDLERS_INSTALLED !== true) throw new Error("PROCESS_INSTALLER_EXPORT_MISSING");';
  const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/packages/obs-capture/install/") && !specifier.startsWith("node:")) {
    throw new Error("IC1_MODULE_EVAL_IMPORT_FORBIDDEN:" + specifier);
  }
  return nextResolve(specifier, context);
}`;
  const loaderUrl = `data:text/javascript,${encodeURIComponent(loaderSource)}`;
  const program = `const loaded = await import(${JSON.stringify(specifier)}); ${exportAssertion} console.log("IC1_IMPORT_OK:${entry}");`;
  return spawnSync(
    process.execPath,
    ["--experimental-loader", loaderUrl, "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
}

describe("S05 import-light installer graph", () => {
  it("loads every public installer through the real resolver with only built-ins evaluation-reachable", async () => {
    const installFiles = (await listTypeScriptFiles(INSTALL_ROOT))
      .map((path) => relative(INSTALL_ROOT, path).split(sep).join("/"));

    // The package wildcard is syntactically recursive; S05 deliberately permits no nested module.
    expect(installFiles).toEqual(INSTALL_ENTRIES);
    expect(installFiles.every((path) => !path.includes("/"))).toBe(true);

    for (const entry of INSTALL_ENTRIES) {
      const result = importLightProbe(entry);
      expect(result.status, `${entry}\nstdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`IC1_IMPORT_OK:${entry}`);
    }
  });

  it("fences every obs-capture TypeScript source from the four hoisted outbound targets", async () => {
    const packageFiles = await listImportSourceFiles(PACKAGE_ROOT);
    expect(packageFiles.length).toBeGreaterThan(INSTALL_ENTRIES.length);
    for (const path of packageFiles) {
      assertOutboundImportFence(relative(PACKAGE_ROOT, path), await readFile(path, "utf8"));
    }
  });

  it("proves the hoisted DB package is resolver-reachable while the source fence still denies it", () => {
    const requireFromObsCapture = createRequire(resolve(PACKAGE_ROOT, "src/import-graph-probe.cjs"));
    const resolvedDb = requireFromObsCapture.resolve("@debateai/db").replaceAll("\\", "/");

    expect(resolvedDb).toMatch(/\/packages\/db\/src\/index\.ts$/u);
    expect(() => assertOutboundImportFence(
      "resolver-reachable-mutant.ts",
      'import "@debateai/db";',
    )).toThrow("OBS_CAPTURE_OUTBOUND_IMPORT_FORBIDDEN");
  });

  it("has controls that fail on static, dynamic, require, and re-export attack forms", () => {
    const mutations = [
      'import "@debateai/db";',
      'void import("../../../apps/api/src/registration.js");',
      'require("../../../apps/api/src/mail-channel.ts");',
      'export { identity } from "../../../packages/db/src/identity.js";',
      'import type { Pool } from "@debateai/db";',
      'const deferred = `${import("@debateai/db/identity")}`;',
      'void import(/* split trivia */ "../../../packages/db/src/identity.js");',
    ];
    for (const source of mutations) {
      expect(() => assertOutboundImportFence("mutant.ts", source)).toThrow(
        "OBS_CAPTURE_OUTBOUND_IMPORT_FORBIDDEN",
      );
    }
    expect(() => assertOutboundImportFence(
      "lazy-core.ts",
      'void import("@debateai/obs-capture");',
    )).not.toThrow();
    expect(() => assertOutboundImportFence(
      "non-code.ts",
      '// import "@debateai/db"\nconst note = "require(\\"packages/db/src/identity\\")";',
    )).not.toThrow();
  });
});
