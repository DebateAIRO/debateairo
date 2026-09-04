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

const REQUIRE_GLOBAL = 1;
const REQUIRE_LOCAL = 2;
const MANIFEST_KEY = 1;
const OTHER_KEY = 2;
const MAX_DATA_ALTERNATIVES = 32;

type ClassificationLiteral = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;

type DataPossibilities = {
  readonly literals: Map<number, ClassificationLiteral>;
  readonly unknown: boolean;
};

type ZoneFlowState = {
  requires: Map<number, number>;
  data: Map<number, DataPossibilities>;
};

function cloneData(value: DataPossibilities): DataPossibilities {
  return { literals: new Map(value.literals), unknown: value.unknown };
}

function unionData(left: DataPossibilities, right: DataPossibilities): DataPossibilities {
  const literals = new Map([...left.literals, ...right.literals]);
  if (literals.size <= MAX_DATA_ALTERNATIVES) {
    return { literals, unknown: left.unknown || right.unknown };
  }
  return {
    literals: new Map([...literals.entries()].sort(([leftPosition], [rightPosition]) => leftPosition - rightPosition)
      .slice(0, MAX_DATA_ALTERNATIVES)),
    unknown: true,
  };
}

function cloneZoneFlow(state: ZoneFlowState): ZoneFlowState {
  return {
    requires: new Map(state.requires),
    data: new Map([...state.data].map(([binding, value]) => [binding, cloneData(value)])),
  };
}

function joinZoneFlows(target: ZoneFlowState, left: ZoneFlowState, right: ZoneFlowState): void {
  target.requires = new Map();
  for (const binding of new Set([...left.requires.keys(), ...right.requires.keys()])) {
    target.requires.set(
      binding,
      (left.requires.get(binding) ?? REQUIRE_LOCAL) | (right.requires.get(binding) ?? REQUIRE_LOCAL),
    );
  }
  target.data = new Map();
  for (const binding of new Set([...left.data.keys(), ...right.data.keys()])) {
    target.data.set(binding, unionData(
      left.data.get(binding) ?? { literals: new Map(), unknown: true },
      right.data.get(binding) ?? { literals: new Map(), unknown: true },
    ));
  }
}

function dataPossibilities(
  rawExpression: ts.Expression,
  state: ZoneFlowState,
  checker: Checker,
): DataPossibilities {
  const expression = unwrapZoneExpression(rawExpression);
  if (ts.isStringLiteralLikeNode(expression)) {
    return { literals: new Map([[expression.pos, expression]]), unknown: false };
  }
  if (ts.isIdentifier(expression)) {
    const binding = compilerSymbolId(checker, expression);
    return binding === null
      ? { literals: new Map(), unknown: true }
      : cloneData(state.data.get(binding) ?? { literals: new Map(), unknown: true });
  }
  if (ts.isArrayLiteralExpression(expression)) {
    let result: DataPossibilities = { literals: new Map(), unknown: false };
    for (const element of expression.elements) {
      const value = ts.isSpreadElement(element) ? element.expression : element;
      result = unionData(result, dataPossibilities(value, state, checker));
    }
    return result;
  }
  if (ts.isCallExpression(expression)) {
    let result: DataPossibilities = { literals: new Map(), unknown: false };
    for (const argument of expression.arguments) {
      result = unionData(result, dataPossibilities(argument, state, checker));
    }
    return result;
  }
  if (ts.isConditionalExpression(expression)) {
    return unionData(
      dataPossibilities(expression.whenTrue, state, checker),
      dataPossibilities(expression.whenFalse, state, checker),
    );
  }
  return { literals: new Map(), unknown: true };
}

function moduleRequirePossibilities(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  state: ZoneFlowState,
  checker: Checker,
): number {
  const target = unwrapZoneExpression(expression.expression);
  if (!ts.isIdentifier(target) || target.text !== "module" || compilerSymbolId(checker, target) !== null) {
    return REQUIRE_LOCAL;
  }
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "require" ? REQUIRE_GLOBAL : REQUIRE_LOCAL;
  if (expression.argumentExpression === undefined) return REQUIRE_GLOBAL | REQUIRE_LOCAL;
  const properties = dataPossibilities(expression.argumentExpression, state, checker);
  let possibilities = properties.unknown ? REQUIRE_GLOBAL | REQUIRE_LOCAL : 0;
  for (const literal of properties.literals.values()) {
    possibilities |= literal.text === "require" ? REQUIRE_GLOBAL : REQUIRE_LOCAL;
  }
  return possibilities === 0 ? REQUIRE_LOCAL : possibilities;
}

function requirePossibilities(expression: ts.Expression, state: ZoneFlowState, checker: Checker): number {
  const candidate = unwrapZoneExpression(expression);
  if (ts.isIdentifier(candidate)) {
    if (isUnshadowedRequire(candidate, checker)) return REQUIRE_GLOBAL;
    const binding = compilerSymbolId(checker, candidate);
    return binding === null ? REQUIRE_LOCAL : state.requires.get(binding) ?? REQUIRE_LOCAL;
  }
  if (ts.isPropertyAccessExpression(candidate) || ts.isElementAccessExpression(candidate)) {
    return moduleRequirePossibilities(candidate, state, checker);
  }
  if (ts.isConditionalExpression(candidate)) {
    return requirePossibilities(candidate.whenTrue, state, checker)
      | requirePossibilities(candidate.whenFalse, state, checker);
  }
  return REQUIRE_LOCAL;
}

function manifestKeyPossibilities(name: ts.PropertyName, state: ZoneFlowState, checker: Checker): number {
  if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name)) {
    return MANIFEST_LIST_PROPERTIES.has(name.text) ? MANIFEST_KEY : OTHER_KEY;
  }
  if (!ts.isComputedPropertyName(name)) return OTHER_KEY;
  const values = dataPossibilities(name.expression, state, checker);
  let possibilities = values.unknown ? MANIFEST_KEY | OTHER_KEY : 0;
  for (const literal of values.literals.values()) {
    possibilities |= MANIFEST_LIST_PROPERTIES.has(literal.text) ? MANIFEST_KEY : OTHER_KEY;
  }
  return possibilities === 0 ? MANIFEST_KEY | OTHER_KEY : possibilities;
}

export function findZoneImports(
  sourceFile: ts.SourceFile,
  rawImporterPath: string,
  checker: Checker,
  onCandidate: () => void = () => undefined,
): readonly ZoneImportSite[] {
  const importerPath = normalizeRepositoryPath(rawImporterPath);
  if (importerPath === null || !isGovernedImporter(importerPath)) return [];

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
  const recordUnknown = (node: ts.Node): void => {
    onCandidate();
    if (recordedPositions.has(node.pos)) return;
    recordedPositions.add(node.pos);
    sites.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
  };

  const updateBinding = (
    name: ts.Identifier,
    initializer: ts.Expression | undefined,
    state: ZoneFlowState,
  ): void => {
    const binding = compilerSymbolId(checker, name);
    if (binding === null) return;
    state.requires.set(binding, initializer === undefined
      ? REQUIRE_LOCAL
      : requirePossibilities(initializer, state, checker));
    state.data.set(binding, initializer === undefined
      ? { literals: new Map(), unknown: true }
      : dataPossibilities(initializer, state, checker));
  };

  const isAssignment = (node: ts.BinaryExpression): boolean => (
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );

  const visit = (node: ts.Node, state: ZoneFlowState): void => {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      for (const statement of node.statements) visit(statement, state);
      return;
    }

    if (ts.isIfStatement(node)) {
      visit(node.expression, state);
      const whenTrue = cloneZoneFlow(state);
      const whenFalse = cloneZoneFlow(state);
      visit(node.thenStatement, whenTrue);
      if (node.elseStatement !== undefined) visit(node.elseStatement, whenFalse);
      joinZoneFlows(state, whenTrue, whenFalse);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      visit(node.condition, state);
      const whenTrue = cloneZoneFlow(state);
      const whenFalse = cloneZoneFlow(state);
      visit(node.whenTrue, whenTrue);
      visit(node.whenFalse, whenFalse);
      joinZoneFlows(state, whenTrue, whenFalse);
      return;
    }

    if (ts.isWhileStatement(node)) {
      visit(node.expression, state);
      const zeroIterations = cloneZoneFlow(state);
      const oneOrMoreIterations = cloneZoneFlow(state);
      visit(node.statement, oneOrMoreIterations);
      joinZoneFlows(state, zeroIterations, oneOrMoreIterations);
      return;
    }

    if (ts.isDoStatement(node)) {
      visit(node.statement, state);
      visit(node.expression, state);
      return;
    }

    if (ts.isForStatement(node)) {
      if (node.initializer !== undefined) visit(node.initializer, state);
      if (node.condition !== undefined) visit(node.condition, state);
      const zeroIterations = cloneZoneFlow(state);
      const oneOrMoreIterations = cloneZoneFlow(state);
      visit(node.statement, oneOrMoreIterations);
      if (node.incrementor !== undefined) visit(node.incrementor, oneOrMoreIterations);
      joinZoneFlows(state, zeroIterations, oneOrMoreIterations);
      return;
    }

    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      visit(node.expression, state);
      visit(node.initializer, state);
      const zeroIterations = cloneZoneFlow(state);
      const oneOrMoreIterations = cloneZoneFlow(state);
      visit(node.statement, oneOrMoreIterations);
      joinZoneFlows(state, zeroIterations, oneOrMoreIterations);
      return;
    }

    if (ts.isSwitchStatement(node)) {
      visit(node.expression, state);
      const entry = cloneZoneFlow(state);
      const exits: ZoneFlowState[] = [];
      let hasDefault = false;
      for (const clause of node.caseBlock.clauses) {
        const branch = cloneZoneFlow(entry);
        if (ts.isCaseClause(clause)) visit(clause.expression, branch);
        else hasDefault = true;
        for (const statement of clause.statements) visit(statement, branch);
        exits.push(branch);
      }
      if (!hasDefault || exits.length === 0) exits.push(entry);
      let joined = exits[0] as ZoneFlowState;
      for (const exit of exits.slice(1)) {
        const next = cloneZoneFlow(joined);
        joinZoneFlows(next, joined, exit);
        joined = next;
      }
      joinZoneFlows(state, joined, joined);
      return;
    }

    if (ts.isFunctionLikeDeclaration(node) && node.body !== undefined) {
      const functionState = cloneZoneFlow(state);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) updateBinding(parameter.name, undefined, functionState);
      }
      visit(node.body, functionState);
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer !== undefined) visit(node.initializer, state);
      updateBinding(node.name, node.initializer, state);
      return;
    }

    if (ts.isBinaryExpression(node)) {
      visit(node.left, state);
      if (
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || node.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const skipped = cloneZoneFlow(state);
        const evaluated = cloneZoneFlow(state);
        visit(node.right, evaluated);
        joinZoneFlows(state, skipped, evaluated);
        return;
      }
      visit(node.right, state);
      if (isAssignment(node) && ts.isIdentifier(unwrapZoneExpression(node.left))) {
        updateBinding(
          unwrapZoneExpression(node.left) as ts.Identifier,
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? node.right : undefined,
          state,
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
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isPossibleRequire = (requirePossibilities(node.expression, state, checker) & REQUIRE_GLOBAL) !== 0;
      if (isDynamicImport || isPossibleRequire) record(node, literalText(node.arguments[0]));
    } else if (ts.isPropertyAssignment(node) && importerPath !== MANIFEST_PATH) {
      if ((manifestKeyPossibilities(node.name, state, checker) & MANIFEST_KEY) !== 0) {
        const data = dataPossibilities(node.initializer, state, checker);
        for (const literal of data.literals.values()) {
          record(literal, literal.text);
        }
        if (data.unknown) recordUnknown(node);
      }
    } else if (ts.isShorthandPropertyAssignment(node) && importerPath !== MANIFEST_PATH) {
      if ((manifestKeyPossibilities(node.name, state, checker) & MANIFEST_KEY) !== 0) {
        const binding = checker.getShorthandAssignmentValueSymbol(node)?.id;
        const data = binding === undefined
          ? { literals: new Map<number, ClassificationLiteral>(), unknown: true }
          : cloneData(state.data.get(binding) ?? { literals: new Map(), unknown: true });
        for (const literal of data.literals.values()) {
          record(literal, literal.text);
        }
        if (data.unknown) recordUnknown(node);
      }
    }
    node.forEachChild((child) => visit(child, state));
  };
  visit(sourceFile, { requires: new Map(), data: new Map() });
  return sites;
}

export function isClassifiedZonePath(rawPath: string): boolean {
  const path = normalizeRepositoryPath(rawPath);
  return path !== null && hasZonePrefix(path);
}
