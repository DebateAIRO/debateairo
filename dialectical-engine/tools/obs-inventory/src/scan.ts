import type { Dirent } from "node:fs";
import { readFile as nodeReadFile, readdir as nodeReaddir } from "node:fs/promises";
import { extname, join } from "node:path";
import * as ts from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API, SignatureKind, SymbolFlags, TypeFlags, type Checker, type Type } from "typescript/unstable/sync";
import { findZoneImports, isClassifiedZonePath, normalizeRepositoryPath } from "./zone-check.js";

export type InventoryClass =
  | "throw_without_code"
  | "bare_catch"
  | "void_promise"
  | "wrapper_without_cause"
  | "zone_import";

export type InventoryFinding = {
  readonly path: string;
  readonly line: number;
  readonly class: InventoryClass;
};

export type ScanLimits = {
  readonly maxFileBytes: number;
  readonly maxNodeCount: number;
  readonly maxCandidateCount: number;
  readonly maxFileCount: number;
};

export type ScanFileSystem = {
  readonly readFile: (path: string) => Promise<string>;
  readonly readdir: (path: string) => Promise<readonly Dirent[]>;
};

export type ScanOptions = {
  readonly limits?: Partial<ScanLimits>;
  readonly fileSystem?: ScanFileSystem;
};

export const DEFAULT_SCAN_LIMITS: ScanLimits = Object.freeze({
  maxFileBytes: 1_048_576,
  maxNodeCount: 2_000_000,
  maxCandidateCount: 20_000,
  maxFileCount: 20_000,
});

export class InventoryScanError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "InventoryScanError";
  }
}

type Budget = {
  nodes: number;
  candidates: number;
  files: number;
};

type SourceScanOptions = {
  readonly limits?: Partial<ScanLimits>;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const PRODUCTION_ROOTS = new Set(["apps", "packages", "tools", "acceptance"]);
const IGNORED_DIRECTORIES = new Set([".git", ".worktrees", "node_modules", "dist", ".next"]);

function limitsFrom(partial: Partial<ScanLimits> | undefined): ScanLimits {
  const limits = { ...DEFAULT_SCAN_LIMITS, ...partial };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new InventoryScanError("OBS_INVENTORY_LIMIT_INVALID", `${name} must be a positive safe integer`);
    }
  }
  return limits;
}

function bumpBudget(budget: Budget, key: "nodes" | "candidates" | "files", maximum: number, code: string): void {
  budget[key] += 1;
  if (budget[key] > maximum) throw new InventoryScanError(code, `${key} exceeded ${maximum}`);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
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

function isCodeToken(value: string): boolean {
  const token = value.includes(":") ? value.slice(0, value.indexOf(":")) : value;
  if (token.length < 3 || !token.includes("_")) return false;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    const upper = code >= 65 && code <= 90;
    const digit = code >= 48 && code <= 57;
    if (!upper && !digit && code !== 95) return false;
  }
  return token.charCodeAt(0) >= 65 && token.charCodeAt(0) <= 90;
}

function symbolId(checker: Checker, node: ts.Node): number | null {
  return checker.getSymbolAtLocation(node)?.id ?? null;
}

function collectInitializers(sourceFile: ts.SourceFile, checker: Checker): ReadonlyMap<number, ts.Expression> {
  const initializers = new Map<number, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) initializers.set(binding, node.initializer);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return initializers;
}

function expressionCarriesCode(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<number, ts.Expression>,
  checker: Checker,
  seen: ReadonlySet<number> = new Set(),
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isStringLiteralLikeNode(expression)) return isCodeToken(expression.text);
  if (ts.isTemplateExpression(expression)) return isCodeToken(expression.head.text);
  if (ts.isIdentifier(expression)) {
    if (isCodeToken(expression.text)) return true;
    const binding = symbolId(checker, expression);
    if (binding === null || seen.has(binding)) return false;
    const initializer = initializers.get(binding);
    if (initializer === undefined) return false;
    return expressionCarriesCode(initializer, initializers, checker, new Set([...seen, binding]));
  }
  if (ts.isPropertyAccessExpression(expression)) return isCodeToken(expression.name.text);
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLikeNode(expression.argumentExpression)) {
    return isCodeToken(expression.argumentExpression.text);
  }
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    const firstArgument = expression.arguments?.[0];
    return firstArgument !== undefined && expressionCarriesCode(firstArgument, initializers, checker, seen);
  }
  if (ts.isConditionalExpression(expression)) {
    return expressionCarriesCode(expression.whenTrue, initializers, checker, seen)
      && expressionCarriesCode(expression.whenFalse, initializers, checker, seen);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (
        ts.isPropertyAssignment(property)
        && ((ts.isIdentifier(property.name) && property.name.text === "code")
          || (ts.isStringLiteralLikeNode(property.name) && property.name.text === "code"))
      ) {
        return expressionCarriesCode(property.initializer, initializers, checker, seen);
      }
    }
  }
  return false;
}

function thrownExpressionCarriesCode(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<number, ts.Expression>,
  checker: Checker,
  caughtBindings: ReadonlySet<number>,
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) {
    const binding = symbolId(checker, expression);
    if (binding !== null && caughtBindings.has(binding)) return true;
  }
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    const firstArgument = expression.arguments?.[0];
    return firstArgument !== undefined && expressionCarriesCode(firstArgument, initializers, checker);
  }
  return expressionCarriesCode(expression, initializers, checker);
}

type TypedDomainErrorBindings = {
  readonly constructors: ReadonlySet<number>;
  readonly namespaces: ReadonlySet<number>;
};

function collectTypedDomainErrorAliases(sourceFile: ts.SourceFile, checker: Checker): TypedDomainErrorBindings {
  const aliases = new Set<number>();
  const namespaces = new Set<number>();
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) {
      const imported = node.propertyName?.text ?? node.name.text;
      const binding = symbolId(checker, node.name);
      if (imported === "TypedDomainError" && binding !== null) aliases.add(binding);
    }
    if (ts.isNamespaceImport(node)) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) namespaces.add(binding);
    }
    if (ts.isVariableDeclaration(node)) declarations.push(node);
    node.forEachChild(visit);
  };
  visit(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.initializer !== undefined
        && ts.isIdentifier(unwrapExpression(declaration.initializer))
      ) {
        const initializer = unwrapExpression(declaration.initializer) as ts.Identifier;
        const initializerBinding = symbolId(checker, initializer);
        const declaredBinding = symbolId(checker, declaration.name);
        if (
          initializerBinding !== null
          && declaredBinding !== null
          && aliases.has(initializerBinding)
          && !aliases.has(declaredBinding)
        ) {
          aliases.add(declaredBinding);
          changed = true;
        }
        if (
          initializerBinding !== null
          && declaredBinding !== null
          && namespaces.has(initializerBinding)
          && !namespaces.has(declaredBinding)
        ) {
          namespaces.add(declaredBinding);
          changed = true;
        }
      }
      if (
        ts.isObjectBindingPattern(declaration.name)
        && declaration.initializer !== undefined
        && ts.isIdentifier(unwrapExpression(declaration.initializer))
      ) {
        const initializer = unwrapExpression(declaration.initializer) as ts.Identifier;
        const initializerBinding = symbolId(checker, initializer);
        if (initializerBinding === null || !namespaces.has(initializerBinding)) continue;
        for (const element of declaration.name.elements) {
          const localName = element.name;
          const imported = element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : localName !== undefined && ts.isIdentifier(localName) ? localName.text : "";
          if (imported !== "TypedDomainError" || localName === undefined || !ts.isIdentifier(localName)) continue;
          const declaredBinding = symbolId(checker, localName);
          if (declaredBinding !== null && !aliases.has(declaredBinding)) {
            aliases.add(declaredBinding);
            changed = true;
          }
        }
      }
    }
  }
  return { constructors: aliases, namespaces };
}

function isTypedDomainErrorConstruction(
  node: ts.NewExpression,
  bindings: TypedDomainErrorBindings,
  checker: Checker,
): boolean {
  const constructor = unwrapExpression(node.expression);
  if (ts.isIdentifier(constructor)) {
    const binding = symbolId(checker, constructor);
    return binding !== null && bindings.constructors.has(binding);
  }
  if (
    ts.isPropertyAccessExpression(constructor)
    && constructor.name.text === "TypedDomainError"
    && ts.isIdentifier(unwrapExpression(constructor.expression))
  ) {
    const namespace = unwrapExpression(constructor.expression) as ts.Identifier;
    const binding = symbolId(checker, namespace);
    return binding !== null && bindings.namespaces.has(binding);
  }
  return false;
}

type CauseBindings = Map<number, string>;
type CausePropertyState = "absent" | "preserved" | "lost" | "unknown";

function expressionPreservesCause(
  rawExpression: ts.Expression,
  causes: ReadonlyMap<number, string>,
  checker: Checker,
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (!ts.isIdentifier(expression)) return false;
  const binding = symbolId(checker, expression);
  return binding !== null && causes.has(binding);
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    return ts.isStringLiteralLikeNode(expression) ? expression.text : null;
  }
  return null;
}

function evaluateCauseProperty(
  rawExpression: ts.Expression,
  causes: ReadonlyMap<number, string>,
  objects: ReadonlyMap<number, CausePropertyState>,
  checker: Checker,
  seen: ReadonlySet<number> = new Set(),
): CausePropertyState {
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) {
    const binding = symbolId(checker, expression);
    if (binding === null || seen.has(binding)) return "unknown";
    return objects.get(binding) ?? "unknown";
  }
  if (!ts.isObjectLiteralExpression(expression)) return "unknown";
  let state: CausePropertyState = "absent";
  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === "cause") {
      state = expressionPreservesCause(property.initializer, causes, checker) ? "preserved" : "lost";
    } else if (ts.isShorthandPropertyAssignment(property) && propertyNameText(property.name) === "cause") {
      const binding = checker.getShorthandAssignmentValueSymbol(property)?.id;
      state = binding !== undefined && causes.has(binding) ? "preserved" : "lost";
    } else if (
      ts.isSpreadAssignment(property)
    ) {
      const spreadState = evaluateCauseProperty(property.expression, causes, objects, checker, seen);
      if (spreadState !== "absent") state = spreadState;
    } else if (ts.isPropertyAssignment(property) && ts.isComputedPropertyName(property.name)) {
      state = "unknown";
    }
  }
  return state;
}

function visibleCauseBindings(
  causes: ReadonlyMap<number, string>,
  location: ts.Node,
  checker: Checker,
): CauseBindings {
  const visible: CauseBindings = new Map();
  for (const [binding, name] of causes) {
    if (checker.resolveName(name, SymbolFlags.Value, location)?.id === binding) visible.set(binding, name);
  }
  return visible;
}

function collectRejectionHandlerDefinitions(
  sourceFile: ts.SourceFile,
  checker: Checker,
): ReadonlyMap<number, ts.FunctionLikeDeclaration> {
  const definitions = new Map<number, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) definitions.set(binding, node);
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer !== undefined
      && (ts.isArrowFunction(unwrapExpression(node.initializer))
        || ts.isFunctionExpression(unwrapExpression(node.initializer)))
    ) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) definitions.set(binding, unwrapExpression(node.initializer) as ts.FunctionLikeDeclaration);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return definitions;
}

function functionObservesRejection(callback: ts.FunctionLikeDeclaration, checker: Checker): boolean {
  const parameter = callback.parameters[0];
  if (parameter === undefined || parameter.name === undefined) return false;
  if (!ts.isIdentifier(parameter.name)) return true;
  const parameterBinding = symbolId(checker, parameter.name);
  if (parameterBinding === null || callback.body === undefined) return false;
  let observed = false;
  const visit = (node: ts.Node): void => {
    if (observed) return;
    if (ts.isIdentifier(node) && symbolId(checker, node) === parameterBinding) {
      observed = true;
      return;
    }
    node.forEachChild(visit);
  };
  visit(callback.body);
  return observed;
}

function isRejectionObserver(
  rawExpression: ts.Expression | undefined,
  checker: Checker,
  definitions: ReadonlyMap<number, ts.FunctionLikeDeclaration>,
  initializers: ReadonlyMap<number, ts.Expression>,
  seen: ReadonlySet<number> = new Set(),
): boolean {
  if (rawExpression === undefined) return false;
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) {
    if (expression.text === "undefined") return false;
    const binding = symbolId(checker, expression);
    const definition = binding === null ? undefined : definitions.get(binding);
    if (definition !== undefined) return functionObservesRejection(definition, checker);
    if (binding === null || seen.has(binding)) return true;
    const initializer = initializers.get(binding);
    return initializer === undefined
      ? true
      : isRejectionObserver(initializer, checker, definitions, initializers, new Set([...seen, binding]));
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return functionObservesRejection(expression, checker);
  }
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression);
}

function isObservedPromise(
  rawExpression: ts.Expression,
  checker: Checker,
  definitions: ReadonlyMap<number, ts.FunctionLikeDeclaration>,
  initializers: ReadonlyMap<number, ts.Expression>,
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isAwaitExpression(expression)) return true;
  if (!ts.isCallExpression(expression)) return false;
  const callee = unwrapExpression(expression.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text === "catch") {
    return isRejectionObserver(expression.arguments[0], checker, definitions, initializers);
  }
  if (callee.name.text === "then") {
    return isRejectionObserver(expression.arguments[1], checker, definitions, initializers);
  }
  if (callee.name.text === "finally") {
    return isObservedPromise(callee.expression, checker, definitions, initializers);
  }
  return false;
}

function typeIsPromiseLike(type: Type, checker: Checker, location: ts.Node): boolean {
  if (type.isUnionType() || type.isIntersectionType()) {
    return type.getTypes().some((part) => typeIsPromiseLike(part, checker, location));
  }
  const thenProperty = checker.getPropertyOfType(type, "then");
  if (thenProperty === undefined) return false;
  const thenType = checker.getTypeOfSymbolAtLocation(thenProperty, location);
  return checker.getSignaturesOfType(thenType, SignatureKind.Call).length > 0;
}

function isPromiseCandidate(rawExpression: ts.Expression, checker: Checker): boolean {
  const expression = unwrapExpression(rawExpression);
  const type = checker.getTypeAtLocation(expression);
  if (type !== undefined && (type.flags & TypeFlags.Any) !== 0) return true;
  if (type !== undefined && !type.isErrorType() && typeIsPromiseLike(type, checker, expression)) return true;
  if (type !== undefined && !type.isErrorType()) return false;
  return true;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function scanParsedSource(
  sourceFile: ts.SourceFile,
  path: string,
  checker: Checker,
  limits: ScanLimits,
  budget: Budget,
): InventoryFinding[] {
  const countNodes = (node: ts.Node): void => {
    bumpBudget(budget, "nodes", limits.maxNodeCount, "OBS_INVENTORY_NODE_LIMIT");
    node.forEachChild(countNodes);
  };
  countNodes(sourceFile);

  const findings: InventoryFinding[] = [];
  const initializers = collectInitializers(sourceFile, checker);
  const wrapperAliases = collectTypedDomainErrorAliases(sourceFile, checker);
  const rejectionHandlers = collectRejectionHandlerDefinitions(sourceFile, checker);
  const objectCauses = new Map<number, CausePropertyState>();
  const bumpCandidate = (): void => {
    bumpBudget(budget, "candidates", limits.maxCandidateCount, "OBS_INVENTORY_CANDIDATE_LIMIT");
  };

  const updateVariableState = (
    name: ts.Identifier,
    initializer: ts.Expression | undefined,
    causes: CauseBindings,
  ): void => {
    const binding = symbolId(checker, name);
    if (binding === null) return;
    if (initializer !== undefined && expressionPreservesCause(initializer, causes, checker)) {
      causes.set(binding, name.text);
    } else {
      causes.delete(binding);
    }
    if (initializer === undefined) {
      objectCauses.set(binding, "unknown");
    } else {
      objectCauses.set(binding, evaluateCauseProperty(initializer, causes, objectCauses, checker));
    }
  };

  const updateAssignedState = (
    node: ts.BinaryExpression,
    causes: CauseBindings,
  ): void => {
    const assigned = unwrapExpression(node.left);
    const simpleAssignment = node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (ts.isIdentifier(assigned)) {
      updateVariableState(assigned, simpleAssignment ? node.right : undefined, causes);
      return;
    }
    if (
      (ts.isPropertyAccessExpression(assigned) || ts.isElementAccessExpression(assigned))
      && ts.isIdentifier(unwrapExpression(assigned.expression))
    ) {
      const target = unwrapExpression(assigned.expression) as ts.Identifier;
      const binding = symbolId(checker, target);
      const name = ts.isPropertyAccessExpression(assigned)
        ? assigned.name.text
        : assigned.argumentExpression !== undefined && ts.isStringLiteralLikeNode(unwrapExpression(assigned.argumentExpression))
          ? (unwrapExpression(assigned.argumentExpression) as ts.StringLiteral).text
          : null;
      if (binding !== null && name === "cause") {
        objectCauses.set(binding, simpleAssignment && expressionPreservesCause(node.right, causes, checker)
          ? "preserved"
          : "lost");
      }
    }
  };

  const visit = (node: ts.Node, inheritedCauses: CauseBindings): void => {
    if (ts.isCatchClause(node)) {
      bumpCandidate();
      if (node.variableDeclaration === undefined) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "bare_catch" });
      }
      const catchCauses = new Map(inheritedCauses);
      if (node.variableDeclaration !== undefined && ts.isIdentifier(node.variableDeclaration.name)) {
        const binding = symbolId(checker, node.variableDeclaration.name);
        if (binding !== null) catchCauses.set(binding, node.variableDeclaration.name.text);
      }
      visit(node.block, catchCauses);
      return;
    }

    if (ts.isBlock(node)) {
      for (const statement of node.statements) visit(statement, inheritedCauses);
      return;
    }

    if (ts.isFunctionLikeDeclaration(node) && node.body !== undefined) {
      const functionCauses = new Map(inheritedCauses);
      node.forEachChild((child) => visit(child, functionCauses));
      return;
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer !== undefined) visit(node.initializer, inheritedCauses);
      updateVariableState(node.name, node.initializer, inheritedCauses);
      return;
    }

    if (ts.isBinaryExpression(node)) {
      visit(node.left, inheritedCauses);
      visit(node.right, inheritedCauses);
      updateAssignedState(node, inheritedCauses);
      return;
    }

    if (ts.isThrowStatement(node)) {
      bumpCandidate();
      if (
        node.expression === undefined
        || !thrownExpressionCarriesCode(
          node.expression,
          initializers,
          checker,
          new Set(inheritedCauses.keys()),
        )
      ) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "throw_without_code" });
      }
    }

    if (node.kind === ts.SyntaxKind.VoidExpression) {
      bumpCandidate();
      const expression = (node as ts.VoidExpression).expression;
      if (
        isPromiseCandidate(expression, checker)
        && !isObservedPromise(expression, checker, rejectionHandlers, initializers)
      ) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "void_promise" });
      }
    }

    if (ts.isNewExpression(node) && isTypedDomainErrorConstruction(node, wrapperAliases, checker)) {
      bumpCandidate();
      const visibleCauses = visibleCauseBindings(inheritedCauses, node, checker);
      if (visibleCauses.size > 0) {
        const options = node.arguments?.[2];
        if (
          options === undefined
          || evaluateCauseProperty(options, visibleCauses, objectCauses, checker) !== "preserved"
        ) {
          findings.push({ path, line: lineOf(sourceFile, node), class: "wrapper_without_cause" });
        }
      }
    }

    node.forEachChild((child) => visit(child, inheritedCauses));
  };
  visit(sourceFile, new Map());

  for (const site of findZoneImports(sourceFile, path, checker, bumpCandidate)) {
    findings.push({ path, line: site.line, class: "zone_import" });
  }
  return findings;
}

function normalizedOutputPath(rawPath: string): string {
  const normalized = normalizeRepositoryPath(rawPath);
  if (normalized === null) {
    throw new InventoryScanError("OBS_INVENTORY_PATH_ESCAPE", "source path escapes the scan root");
  }
  return normalized;
}

function scanSourceWithBudget(
  source: string,
  rawPath: string,
  limits: ScanLimits,
  budget: Budget,
): InventoryFinding[] {
  const path = normalizedOutputPath(rawPath);
  if (Buffer.byteLength(source, "utf8") > limits.maxFileBytes) {
    throw new InventoryScanError("OBS_INVENTORY_FILE_SIZE_LIMIT", `${path} exceeds ${limits.maxFileBytes} bytes`);
  }
  const virtualRoot = "/__obs_inventory__";
  const virtualPath = `${virtualRoot}/${path}`;
  const api = new API({
    cwd: virtualRoot,
    fs: createVirtualFileSystem({ [virtualPath]: source }),
  });
  try {
    const snapshot = api.updateSnapshot({ openFiles: [virtualPath] });
    const project = snapshot.getDefaultProjectForFile(virtualPath);
    if (project === undefined) {
      throw new InventoryScanError("OBS_INVENTORY_PARSE_FAILED", `${path}: project unresolved`);
    }
    const diagnostics = project.program.getSyntacticDiagnostics(virtualPath);
    if (diagnostics.length > 0) {
      throw new InventoryScanError("OBS_INVENTORY_PARSE_FAILED", `${path}:${diagnostics[0]?.pos ?? 0}`);
    }
    const sourceFile = project.program.getSourceFile(virtualPath);
    if (sourceFile === undefined) {
      throw new InventoryScanError("OBS_INVENTORY_PARSE_FAILED", `${path}: source unresolved`);
    }
    return scanParsedSource(sourceFile, path, project.checker, limits, budget);
  } finally {
    api.close();
  }
}

export function scanSource(source: string, path: string, options: SourceScanOptions = {}): readonly InventoryFinding[] {
  const limits = limitsFrom(options.limits);
  return scanSourceWithBudget(source, path, limits, { nodes: 0, candidates: 0, files: 1 });
}

function compareFindings(left: InventoryFinding, right: InventoryFinding): number {
  return left.path.localeCompare(right.path) || left.line - right.line || left.class.localeCompare(right.class);
}

function defaultFileSystem(): ScanFileSystem {
  return {
    readFile: (path) => nodeReadFile(path, "utf8"),
    readdir: (path) => nodeReaddir(path, { withFileTypes: true }),
  };
}

export async function scan(rootDirectory: string, options: ScanOptions = {}): Promise<readonly InventoryFinding[]> {
  const limits = limitsFrom(options.limits);
  const fileSystem = options.fileSystem ?? defaultFileSystem();
  const budget: Budget = { nodes: 0, candidates: 0, files: 0 };
  const findings: InventoryFinding[] = [];

  const walk = async (absoluteDirectory: string, relativeDirectory: string, productionRoot: boolean): Promise<void> => {
    const entries = [...await fileSystem.readdir(absoluteDirectory)].sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (productionRoot && relativeDirectory.length === 0 && !PRODUCTION_ROOTS.has(entry.name)) continue;
      const relativePath = relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = join(absoluteDirectory, entry.name);
      if (isClassifiedZonePath(relativePath)) continue;
      if (entry.isSymbolicLink()) {
        throw new InventoryScanError("OBS_INVENTORY_SYMLINK", `${relativePath} is a symbolic link`);
      }
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolutePath, relativePath, false);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      bumpBudget(budget, "files", limits.maxFileCount, "OBS_INVENTORY_FILE_LIMIT");
      const source = await fileSystem.readFile(absolutePath);
      findings.push(...scanSourceWithBudget(source, relativePath, limits, budget));
    }
  };

  const rootEntries = await fileSystem.readdir(rootDirectory);
  const productionRoot = rootEntries.some((entry) => entry.isDirectory() && PRODUCTION_ROOTS.has(entry.name));
  await walk(rootDirectory, "", productionRoot);
  return findings.sort(compareFindings);
}
