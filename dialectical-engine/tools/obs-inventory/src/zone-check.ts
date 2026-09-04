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

function unwrapZoneExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertion(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isUnshadowedRequire(identifier: ts.Identifier, checker: Checker): boolean {
  return identifier.text === "require" && compilerSymbolId(checker, identifier) === null;
}

function isUnshadowedModuleRequire(expression: ts.Expression, checker: Checker): boolean {
  const callee = unwrapZoneExpression(expression);
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "require") return false;
  const target = unwrapZoneExpression(callee.expression);
  return ts.isIdentifier(target)
    && target.text === "module"
    && compilerSymbolId(checker, target) === null;
}

function expressionIsRequire(
  expression: ts.Expression,
  aliases: ReadonlySet<number>,
  checker: Checker,
): boolean {
  const candidate = unwrapZoneExpression(expression);
  if (ts.isIdentifier(candidate)) {
    if (isUnshadowedRequire(candidate, checker)) return true;
    const binding = compilerSymbolId(checker, candidate);
    return binding !== null && aliases.has(binding);
  }
  return isUnshadowedModuleRequire(candidate, checker);
}

function callSpecifier(
  node: ts.CallExpression,
  requireAliases: ReadonlySet<number>,
  checker: Checker,
): string | null | undefined {
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = expressionIsRequire(node.expression, requireAliases, checker);
  if (!isDynamicImport && !isRequire) return undefined;
  return literalText(node.arguments[0]);
}

function collectExpressionInitializers(
  sourceFile: ts.SourceFile,
  checker: Checker,
): ReadonlyMap<number, ts.Expression> {
  const initializers = new Map<number, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const binding = compilerSymbolId(checker, node.name);
      if (binding !== null) initializers.set(binding, node.initializer);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return initializers;
}

function constantString(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<number, ts.Expression>,
  checker: Checker,
  seen: ReadonlySet<number> = new Set(),
): string | null {
  const expression = unwrapZoneExpression(rawExpression);
  if (ts.isStringLiteralLikeNode(expression)) return expression.text;
  if (!ts.isIdentifier(expression)) return null;
  const binding = compilerSymbolId(checker, expression);
  if (binding === null || seen.has(binding)) return null;
  const initializer = initializers.get(binding);
  return initializer === undefined
    ? null
    : constantString(initializer, initializers, checker, new Set([...seen, binding]));
}

function propertyNameText(
  name: ts.PropertyName,
  initializers: ReadonlyMap<number, ts.Expression>,
  checker: Checker,
): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name)) return name.text;
  return ts.isComputedPropertyName(name)
    ? constantString(name.expression, initializers, checker)
    : null;
}

function classificationLiterals(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<number, ts.Expression>,
  checker: Checker,
  seen: ReadonlySet<number> = new Set(),
): readonly (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[] {
  const expression = unwrapZoneExpression(rawExpression);
  if (ts.isStringLiteralLikeNode(expression)) return [expression];
  if (ts.isIdentifier(expression)) {
    const binding = compilerSymbolId(checker, expression);
    if (binding === null || seen.has(binding)) return [];
    const initializer = initializers.get(binding);
    return initializer === undefined
      ? []
      : classificationLiterals(initializer, initializers, checker, new Set([...seen, binding]));
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const literals: Array<ts.StringLiteral | ts.NoSubstitutionTemplateLiteral> = [];
    for (const element of expression.elements) {
      const value = ts.isSpreadElement(element) ? element.expression : element;
      literals.push(...classificationLiterals(value, initializers, checker, seen));
    }
    return literals;
  }
  if (ts.isCallExpression(expression)) {
    return expression.arguments.flatMap((argument) => classificationLiterals(argument, initializers, checker, seen));
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...classificationLiterals(expression.whenTrue, initializers, checker, seen),
      ...classificationLiterals(expression.whenFalse, initializers, checker, seen),
    ];
  }
  return [];
}

export function findZoneImports(
  sourceFile: ts.SourceFile,
  rawImporterPath: string,
  checker: Checker,
  onCandidate: () => void = () => undefined,
): readonly ZoneImportSite[] {
  const importerPath = normalizeRepositoryPath(rawImporterPath);
  if (importerPath === null || !isGovernedImporter(importerPath)) return [];

  const initializers = collectExpressionInitializers(sourceFile, checker);
  const sites: ZoneImportSite[] = [];
  const recordedPositions = new Set<number>();
  const record = (node: ts.Node, specifier: string | null): void => {
    onCandidate();
    if (specifier === null) return;
    const resolved = resolveSpecifier(importerPath, specifier);
    if (resolved === null || !hasZonePrefix(resolved)) return;
    if (recordedPositions.has(node.pos)) return;
    recordedPositions.add(node.pos);
    sites.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
  };

  const updateRequireAlias = (
    name: ts.Identifier,
    initializer: ts.Expression | undefined,
    aliases: Set<number>,
  ): void => {
    const binding = compilerSymbolId(checker, name);
    if (binding === null) return;
    if (initializer !== undefined && expressionIsRequire(initializer, aliases, checker)) {
      aliases.add(binding);
    } else {
      aliases.delete(binding);
    }
  };

  const visit = (node: ts.Node, requireAliases: Set<number>): void => {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      for (const statement of node.statements) visit(statement, requireAliases);
      return;
    }

    if (ts.isFunctionLikeDeclaration(node) && node.body !== undefined) {
      const functionAliases = new Set(requireAliases);
      node.forEachChild((child) => visit(child, functionAliases));
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer !== undefined) visit(node.initializer, requireAliases);
      updateRequireAlias(node.name, node.initializer, requireAliases);
      return;
    }

    if (ts.isBinaryExpression(node)) {
      visit(node.left, requireAliases);
      visit(node.right, requireAliases);
      if (ts.isIdentifier(unwrapZoneExpression(node.left))) {
        updateRequireAlias(
          unwrapZoneExpression(node.left) as ts.Identifier,
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node.right : undefined,
          requireAliases,
        );
      }
      return;
    }

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
      const property = propertyNameText(node.name, initializers, checker);
      if (property !== null && MANIFEST_LIST_PROPERTIES.has(property)) {
        for (const literal of classificationLiterals(node.initializer, initializers, checker)) {
          record(literal, literal.text);
        }
      }
    } else if (ts.isShorthandPropertyAssignment(node) && importerPath !== MANIFEST_PATH) {
      const property = propertyNameText(node.name, initializers, checker);
      if (property !== null && MANIFEST_LIST_PROPERTIES.has(property)) {
        const binding = checker.getShorthandAssignmentValueSymbol(node)?.id;
        const initializer = binding === undefined ? undefined : initializers.get(binding);
        if (initializer !== undefined) {
          for (const literal of classificationLiterals(initializer, initializers, checker)) {
            record(literal, literal.text);
          }
        }
      }
    }
    node.forEachChild((child) => visit(child, requireAliases));
  };
  visit(sourceFile, new Set());
  return sites;
}

export function isClassifiedZonePath(rawPath: string): boolean {
  const path = normalizeRepositoryPath(rawPath);
  return path !== null && hasZonePrefix(path);
}
