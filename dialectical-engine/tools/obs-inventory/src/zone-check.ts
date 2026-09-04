import { posix } from "node:path";
import * as ts from "typescript/unstable/ast";
import type { Checker } from "typescript/unstable/sync";
import { ZONE_MANIFEST } from "../../../packages/obs-capture/src/zone/manifest.js";

export type ZoneImportSite = {
  readonly line: number;
};

const GOVERNED_IMPORTER_PREFIXES = [
  "packages/obs-capture/",
  "tools/obs-listener/",
  "acceptance/obs/",
] as const;

const MANIFEST_PATH = "packages/obs-capture/src/zone/manifest.ts";
const MANIFEST_LIST_PROPERTIES = new Set(["zone_path_prefixes", "compiled_alternate_prefixes"]);

const ZONE_PREFIXES = [
  ...ZONE_MANIFEST.zone_path_prefixes,
  ...ZONE_MANIFEST.compiled_alternate_prefixes,
].map((path) => normalizeRepositoryPath(path)).filter((path): path is string => path !== null);

function withoutQueryOrFragment(value: string): string {
  const query = value.indexOf("?");
  const fragment = value.indexOf("#");
  const end = query < 0 ? fragment : fragment < 0 ? query : Math.min(query, fragment);
  return end < 0 ? value : value.slice(0, end);
}

export function normalizeRepositoryPath(value: string): string | null {
  let slashed = value.replaceAll("\\", "/");
  while (slashed.startsWith("/")) slashed = slashed.slice(1);
  const normalized = posix.normalize(slashed);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function isGovernedImporter(importerPath: string): boolean {
  return GOVERNED_IMPORTER_PREFIXES.some((prefix) => importerPath.startsWith(prefix));
}

function workspaceSpecifierPath(specifier: string): string | null {
  const marker = "@debateai/";
  if (!specifier.startsWith(marker)) return null;
  const remainder = specifier.slice(marker.length);
  const slash = remainder.indexOf("/");
  const workspace = slash < 0 ? remainder : remainder.slice(0, slash);
  const subpath = slash < 0 ? "" : remainder.slice(slash + 1);
  if (workspace.length === 0) return null;
  const base = workspace === "api" || workspace === "runner" || workspace === "scheduler"
    ? `apps/${workspace}`
    : `packages/${workspace}`;
  return subpath.length === 0 ? base : `${base}/${subpath}`;
}

function resolveSpecifier(importerPath: string, rawSpecifier: string): string | null {
  const specifier = withoutQueryOrFragment(rawSpecifier).replaceAll("\\", "/");
  if (specifier.startsWith("@debateai/")) {
    const workspacePath = workspaceSpecifierPath(specifier);
    return workspacePath === null ? null : normalizeRepositoryPath(workspacePath);
  }
  if (specifier.startsWith("@/")) return normalizeRepositoryPath(specifier.slice(2));
  if (specifier.startsWith("#root/")) return normalizeRepositoryPath(specifier.slice("#root/".length));
  if (specifier.startsWith(".")) {
    return normalizeRepositoryPath(posix.join(posix.dirname(importerPath), specifier));
  }
  if (
    specifier.startsWith("apps/")
    || specifier.startsWith("packages/")
    || specifier.startsWith("tools/")
    || specifier.startsWith("acceptance/")
    || specifier.startsWith("migrations/")
  ) {
    return normalizeRepositoryPath(specifier);
  }
  return null;
}

function sourceEquivalent(path: string): string {
  if (path.endsWith(".mjs")) return `${path.slice(0, -4)}.mts`;
  if (path.endsWith(".cjs")) return `${path.slice(0, -4)}.cts`;
  if (path.endsWith(".js")) return `${path.slice(0, -3)}.ts`;
  if (path.endsWith(".jsx")) return `${path.slice(0, -4)}.tsx`;
  return path;
}

function withoutTypeScriptExtension(path: string): string {
  for (const extension of [".tsx", ".mts", ".cts", ".ts"] as const) {
    if (path.endsWith(extension)) return path.slice(0, -extension.length);
  }
  return path;
}

function hasZonePrefix(resolvedPath: string): boolean {
  const candidates = new Set([
    resolvedPath,
    sourceEquivalent(resolvedPath),
    withoutTypeScriptExtension(resolvedPath),
  ]);
  return ZONE_PREFIXES.some((prefix) => {
    const comparablePrefixes = new Set([prefix, sourceEquivalent(prefix), withoutTypeScriptExtension(prefix)]);
    for (const candidate of candidates) {
      for (const comparablePrefix of comparablePrefixes) {
        if (candidate === comparablePrefix || candidate.startsWith(`${comparablePrefix}/`)) return true;
      }
    }
    return false;
  });
}

function literalText(node: ts.Expression | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLikeNode(node) ? node.text : null;
}

function compilerSymbolId(checker: Checker, node: ts.Node): number | null {
  return checker.getSymbolAtLocation(node)?.id ?? null;
}

function isUnshadowedRequire(identifier: ts.Identifier, checker: Checker): boolean {
  return identifier.text === "require" && compilerSymbolId(checker, identifier) === null;
}

function collectRequireAliases(sourceFile: ts.SourceFile, checker: Checker): ReadonlySet<number> {
  const aliases = new Set<number>();
  const declarations: ts.VariableDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    node.forEachChild(collect);
  };
  collect(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.initializer !== undefined
        && ts.isIdentifier(declaration.initializer)
      ) {
        const initializer = declaration.initializer;
        const initializerBinding = compilerSymbolId(checker, initializer);
        const declaredBinding = compilerSymbolId(checker, declaration.name);
        const aliasesRequire = isUnshadowedRequire(initializer, checker)
          || (initializerBinding !== null && aliases.has(initializerBinding));
        if (aliasesRequire && declaredBinding !== null && !aliases.has(declaredBinding)) {
          aliases.add(declaredBinding);
          changed = true;
        }
      }
    }
  }
  return aliases;
}

function callSpecifier(
  node: ts.CallExpression,
  requireAliases: ReadonlySet<number>,
  checker: Checker,
): string | null | undefined {
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && (
    isUnshadowedRequire(node.expression, checker)
    || (() => {
      const binding = compilerSymbolId(checker, node.expression);
      return binding !== null && requireAliases.has(binding);
    })()
  );
  if (!isDynamicImport && !isRequire) return undefined;
  return literalText(node.arguments[0]);
}

function propertyNameText(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) ? name.text : null;
}

function classificationLiterals(
  node: ts.PropertyAssignment,
): readonly (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[] {
  const property = propertyNameText(node.name);
  if (property === null || !MANIFEST_LIST_PROPERTIES.has(property)) return [];
  let initializer = node.initializer;
  while (
    ts.isParenthesizedExpression(initializer)
    || ts.isAsExpression(initializer)
    || ts.isTypeAssertion(initializer)
    || ts.isSatisfiesExpression(initializer)
  ) {
    initializer = initializer.expression;
  }
  if (ts.isCallExpression(initializer) && initializer.arguments.length === 1) {
    initializer = initializer.arguments[0] as ts.Expression;
    while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) {
      initializer = initializer.expression;
    }
  }
  if (!ts.isArrayLiteralExpression(initializer)) return [];
  return initializer.elements.filter(ts.isStringLiteralLikeNode);
}

export function findZoneImports(
  sourceFile: ts.SourceFile,
  rawImporterPath: string,
  checker: Checker,
  onCandidate: () => void = () => undefined,
): readonly ZoneImportSite[] {
  const importerPath = normalizeRepositoryPath(rawImporterPath);
  if (importerPath === null || !isGovernedImporter(importerPath)) return [];

  const requireAliases = collectRequireAliases(sourceFile, checker);
  const sites: ZoneImportSite[] = [];
  const record = (node: ts.Node, specifier: string | null): void => {
    onCandidate();
    if (specifier === null) return;
    const resolved = resolveSpecifier(importerPath, specifier);
    if (resolved === null || !hasZonePrefix(resolved)) return;
    sites.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      record(node, literalText(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      record(node, literalText(node.moduleSpecifier));
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      record(node, literalText(node.moduleReference.expression));
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      record(node, ts.isLiteralTypeNode(argument) && ts.isStringLiteralLikeNode(argument.literal)
        ? argument.literal.text
        : null);
    } else if (ts.isCallExpression(node)) {
      const specifier = callSpecifier(node, requireAliases, checker);
      if (specifier !== undefined) record(node, specifier);
    } else if (ts.isPropertyAssignment(node) && importerPath !== MANIFEST_PATH) {
      for (const literal of classificationLiterals(node)) record(literal, literal.text);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return sites;
}

export function isClassifiedZonePath(rawPath: string): boolean {
  const path = normalizeRepositoryPath(rawPath);
  return path !== null && hasZonePrefix(path);
}
