import type { Dirent } from "node:fs";
import { readFile as nodeReadFile, readdir as nodeReaddir } from "node:fs/promises";
import { extname, join } from "node:path";
import * as ts from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";
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

function collectInitializers(sourceFile: ts.SourceFile): ReadonlyMap<string, ts.Expression> {
  const initializers = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      initializers.set(node.name.text, node.initializer);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return initializers;
}

function expressionCarriesCode(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<string, ts.Expression>,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isStringLiteralLikeNode(expression)) return isCodeToken(expression.text);
  if (ts.isTemplateExpression(expression)) return isCodeToken(expression.head.text);
  if (ts.isIdentifier(expression)) {
    if (isCodeToken(expression.text)) return true;
    if (seen.has(expression.text)) return false;
    const initializer = initializers.get(expression.text);
    if (initializer === undefined) return false;
    return expressionCarriesCode(initializer, initializers, new Set([...seen, expression.text]));
  }
  if (ts.isPropertyAccessExpression(expression)) return isCodeToken(expression.name.text);
  if (ts.isConditionalExpression(expression)) {
    return expressionCarriesCode(expression.whenTrue, initializers, seen)
      && expressionCarriesCode(expression.whenFalse, initializers, seen);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (
        ts.isPropertyAssignment(property)
        && ((ts.isIdentifier(property.name) && property.name.text === "code")
          || (ts.isStringLiteralLikeNode(property.name) && property.name.text === "code"))
      ) {
        return expressionCarriesCode(property.initializer, initializers, seen);
      }
    }
  }
  return false;
}

function thrownExpressionCarriesCode(
  rawExpression: ts.Expression,
  initializers: ReadonlyMap<string, ts.Expression>,
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return true;
  }
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    const firstArgument = expression.arguments?.[0];
    return firstArgument !== undefined && expressionCarriesCode(firstArgument, initializers);
  }
  return expressionCarriesCode(expression, initializers);
}

function collectTypedDomainErrorAliases(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const aliases = new Set(["TypedDomainError"]);
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) {
      const imported = node.propertyName?.text ?? node.name.text;
      if (imported === "TypedDomainError") aliases.add(node.name.text);
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
        if (aliases.has(initializer.text) && !aliases.has(declaration.name.text)) {
          aliases.add(declaration.name.text);
          changed = true;
        }
      }
      if (ts.isObjectBindingPattern(declaration.name) && declaration.initializer !== undefined) {
        for (const element of declaration.name.elements) {
          if (element.name === undefined) continue;
          const imported = element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name) ? element.name.text : "";
          if (imported === "TypedDomainError" && ts.isIdentifier(element.name)) aliases.add(element.name.text);
        }
      }
    }
  }
  return aliases;
}

function isTypedDomainErrorConstruction(node: ts.NewExpression, aliases: ReadonlySet<string>): boolean {
  const constructor = unwrapExpression(node.expression);
  if (ts.isIdentifier(constructor)) return aliases.has(constructor.text);
  return ts.isPropertyAccessExpression(constructor) && constructor.name.text === "TypedDomainError";
}

function expressionReferencesCause(rawExpression: ts.Expression, causes: ReadonlySet<string>): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) return causes.has(expression.text);
  if (ts.isFunctionExpression(expression) || ts.isArrowFunction(expression) || ts.isClassExpression(expression)) return false;
  let found = false;
  expression.forEachChild((child) => {
    if (!found && ts.isExpression(child) && expressionReferencesCause(child, causes)) found = true;
  });
  return found;
}

function propertyNameText(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) || ts.isNumericLiteral(name) ? name.text : null;
}

function hasCaughtCauseOption(
  rawExpression: ts.Expression,
  causes: ReadonlySet<string>,
  initializers: ReadonlyMap<string, ts.Expression>,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return false;
    const initializer = initializers.get(expression.text);
    if (initializer === undefined) return false;
    return hasCaughtCauseOption(initializer, causes, initializers, new Set([...seen, expression.text]));
  }
  if (!ts.isObjectLiteralExpression(expression)) return false;
  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === "cause") {
      return expressionReferencesCause(property.initializer, causes);
    }
    if (ts.isShorthandPropertyAssignment(property) && propertyNameText(property.name) === "cause") {
      return causes.has("cause");
    }
    if (ts.isSpreadAssignment(property) && hasCaughtCauseOption(property.expression, causes, initializers, seen)) {
      return true;
    }
  }
  return false;
}

function isObservedPromise(rawExpression: ts.Expression): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isAwaitExpression(expression)) return true;
  if (!ts.isCallExpression(expression)) return false;
  const callee = unwrapExpression(expression.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text === "catch") return true;
  if (callee.name.text === "then" && expression.arguments.length >= 2) return true;
  if (callee.name.text === "finally") return isObservedPromise(callee.expression);
  return false;
}

function isPromiseCandidate(rawExpression: ts.Expression): boolean {
  const expression = unwrapExpression(rawExpression);
  return ts.isCallExpression(expression) || expression.kind === ts.SyntaxKind.ImportKeyword;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function scanParsedSource(
  sourceFile: ts.SourceFile,
  path: string,
  limits: ScanLimits,
  budget: Budget,
): InventoryFinding[] {
  const countNodes = (node: ts.Node): void => {
    bumpBudget(budget, "nodes", limits.maxNodeCount, "OBS_INVENTORY_NODE_LIMIT");
    node.forEachChild(countNodes);
  };
  countNodes(sourceFile);

  const findings: InventoryFinding[] = [];
  const initializers = collectInitializers(sourceFile);
  const wrapperAliases = collectTypedDomainErrorAliases(sourceFile);
  const bumpCandidate = (): void => {
    bumpBudget(budget, "candidates", limits.maxCandidateCount, "OBS_INVENTORY_CANDIDATE_LIMIT");
  };

  const visit = (node: ts.Node, inheritedCauses: Set<string>): void => {
    if (ts.isCatchClause(node)) {
      bumpCandidate();
      if (node.variableDeclaration === undefined) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "bare_catch" });
      }
      const catchCauses = new Set(inheritedCauses);
      if (node.variableDeclaration !== undefined && ts.isIdentifier(node.variableDeclaration.name)) {
        catchCauses.add(node.variableDeclaration.name.text);
      }
      visit(node.block, catchCauses);
      return;
    }

    if (ts.isBlock(node)) {
      const blockCauses = new Set(inheritedCauses);
      for (const statement of node.statements) visit(statement, blockCauses);
      return;
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer !== undefined
      && expressionReferencesCause(node.initializer, inheritedCauses)
    ) {
      inheritedCauses.add(node.name.text);
    }

    if (ts.isThrowStatement(node)) {
      bumpCandidate();
      if (node.expression === undefined || !thrownExpressionCarriesCode(node.expression, initializers)) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "throw_without_code" });
      }
    }

    if (node.kind === ts.SyntaxKind.VoidExpression) {
      bumpCandidate();
      const expression = (node as ts.VoidExpression).expression;
      if (isPromiseCandidate(expression) && !isObservedPromise(expression)) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "void_promise" });
      }
    }

    if (ts.isNewExpression(node) && isTypedDomainErrorConstruction(node, wrapperAliases)) {
      bumpCandidate();
      if (inheritedCauses.size > 0) {
        const options = node.arguments?.[2];
        if (options === undefined || !hasCaughtCauseOption(options, inheritedCauses, initializers)) {
          findings.push({ path, line: lineOf(sourceFile, node), class: "wrapper_without_cause" });
        }
      }
    }

    node.forEachChild((child) => visit(child, inheritedCauses));
  };
  visit(sourceFile, new Set());

  for (const site of findZoneImports(sourceFile, path, bumpCandidate)) {
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
    return scanParsedSource(sourceFile, path, limits, budget);
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
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolutePath, relativePath, false);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      if (isClassifiedZonePath(relativePath)) continue;
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
