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

const CALLBACK_OBSERVES = 1;
const CALLBACK_IGNORES = 2;
const CAUSE_CAUGHT = 1;
const CAUSE_OTHER = 2;
const PROPERTY_ABSENT = 1;
const PROPERTY_CAUGHT = 2;
const PROPERTY_OTHER = 4;
const KEY_CAUSE = 1;
const KEY_OTHER = 2;
const MAX_FLOW_ALTERNATIVES = 32;

type StringPossibilities = {
  readonly values: Set<string>;
  readonly unknown: boolean;
};

type ObjectReferences = {
  readonly ids: Set<number>;
  readonly unknown: boolean;
};

type ScanFlowState = {
  callbacks: Map<number, number>;
  causes: Map<number, number>;
  causeNames: Map<number, string>;
  catchContexts: Map<number, string>;
  strings: Map<number, StringPossibilities>;
  objectReferences: Map<number, ObjectReferences>;
  objectProperties: Map<number, number>;
};

function cloneStrings(value: StringPossibilities): StringPossibilities {
  return { values: new Set(value.values), unknown: value.unknown };
}

function cloneReferences(value: ObjectReferences): ObjectReferences {
  return { ids: new Set(value.ids), unknown: value.unknown };
}

function cloneScanFlow(state: ScanFlowState): ScanFlowState {
  return {
    callbacks: new Map(state.callbacks),
    causes: new Map(state.causes),
    causeNames: new Map(state.causeNames),
    catchContexts: new Map(state.catchContexts),
    strings: new Map([...state.strings].map(([binding, value]) => [binding, cloneStrings(value)])),
    objectReferences: new Map(
      [...state.objectReferences].map(([binding, value]) => [binding, cloneReferences(value)]),
    ),
    objectProperties: new Map(state.objectProperties),
  };
}

function unionStrings(left: StringPossibilities, right: StringPossibilities): StringPossibilities {
  const values = new Set([...left.values, ...right.values]);
  return values.size > MAX_FLOW_ALTERNATIVES
    ? { values: new Set(), unknown: true }
    : { values, unknown: left.unknown || right.unknown };
}

function unionReferences(left: ObjectReferences, right: ObjectReferences): ObjectReferences {
  const ids = new Set([...left.ids, ...right.ids]);
  return ids.size > MAX_FLOW_ALTERNATIVES
    ? { ids: new Set(), unknown: true }
    : { ids, unknown: left.unknown || right.unknown };
}

function joinNumberMaps(
  left: ReadonlyMap<number, number>,
  right: ReadonlyMap<number, number>,
  missing: number,
): Map<number, number> {
  const joined = new Map<number, number>();
  for (const binding of new Set([...left.keys(), ...right.keys()])) {
    joined.set(binding, (left.get(binding) ?? missing) | (right.get(binding) ?? missing));
  }
  return joined;
}

function joinScanFlows(target: ScanFlowState, left: ScanFlowState, right: ScanFlowState): void {
  target.callbacks = joinNumberMaps(left.callbacks, right.callbacks, CALLBACK_IGNORES);
  target.causes = joinNumberMaps(left.causes, right.causes, CAUSE_OTHER);
  target.catchContexts = new Map([...left.catchContexts, ...right.catchContexts]);
  target.objectProperties = joinNumberMaps(
    left.objectProperties,
    right.objectProperties,
    0,
  );
  target.causeNames = new Map();
  for (const binding of target.causes.keys()) {
    if ((target.causes.get(binding) ?? CAUSE_OTHER) & CAUSE_CAUGHT) {
      const name = left.causeNames.get(binding) ?? right.causeNames.get(binding);
      if (name !== undefined) target.causeNames.set(binding, name);
    }
  }
  target.strings = new Map();
  for (const binding of new Set([...left.strings.keys(), ...right.strings.keys()])) {
    target.strings.set(binding, unionStrings(
      left.strings.get(binding) ?? { values: new Set(), unknown: true },
      right.strings.get(binding) ?? { values: new Set(), unknown: true },
    ));
  }
  target.objectReferences = new Map();
  for (const binding of new Set([...left.objectReferences.keys(), ...right.objectReferences.keys()])) {
    target.objectReferences.set(binding, unionReferences(
      left.objectReferences.get(binding) ?? { ids: new Set(), unknown: true },
      right.objectReferences.get(binding) ?? { ids: new Set(), unknown: true },
    ));
  }
}

function collectHoistedRejectionHandlers(
  sourceFile: ts.SourceFile,
  checker: Checker,
): ReadonlyMap<number, ts.FunctionLikeDeclaration> {
  const definitions = new Map<number, ts.FunctionLikeDeclaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) definitions.set(binding, node);
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return definitions;
}

function functionObservesRejection(callback: ts.FunctionLikeDeclaration, checker: Checker): boolean {
  const parameter = callback.parameters[0];
  if (parameter === undefined || parameter.name === undefined) return false;
  if (!ts.isIdentifier(parameter.name)) {
    let bindingCount = 0;
    const countBindings = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        bindingCount += 1;
        return;
      }
      for (const element of name.elements) {
        if (!ts.isOmittedExpression(element) && element.name !== undefined) countBindings(element.name);
      }
    };
    countBindings(parameter.name);
    return bindingCount > 0;
  }
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

function callbackPossibilities(
  rawExpression: ts.Expression | undefined,
  state: ScanFlowState,
  checker: Checker,
  definitions: ReadonlyMap<number, ts.FunctionLikeDeclaration>,
): number {
  if (rawExpression === undefined) return CALLBACK_IGNORES;
  const expression = unwrapExpression(rawExpression);
  if (ts.isIdentifier(expression)) {
    if (expression.text === "undefined") return CALLBACK_IGNORES;
    const binding = symbolId(checker, expression);
    if (binding !== null && state.callbacks.has(binding)) return state.callbacks.get(binding) ?? CALLBACK_IGNORES;
    const definition = binding === null ? undefined : definitions.get(binding);
    return definition === undefined || functionObservesRejection(definition, checker)
      ? CALLBACK_OBSERVES
      : CALLBACK_IGNORES;
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return functionObservesRejection(expression, checker) ? CALLBACK_OBSERVES : CALLBACK_IGNORES;
  }
  if (ts.isConditionalExpression(expression)) {
    return callbackPossibilities(expression.whenTrue, state, checker, definitions)
      | callbackPossibilities(expression.whenFalse, state, checker, definitions);
  }
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
    ? CALLBACK_OBSERVES
    : CALLBACK_IGNORES;
}

function isObservedPromise(
  rawExpression: ts.Expression,
  state: ScanFlowState,
  checker: Checker,
  definitions: ReadonlyMap<number, ts.FunctionLikeDeclaration>,
): boolean {
  const expression = unwrapExpression(rawExpression);
  if (ts.isAwaitExpression(expression)) return true;
  if (!ts.isCallExpression(expression)) return false;
  const callee = unwrapExpression(expression.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text === "catch") {
    return callbackPossibilities(expression.arguments[0], state, checker, definitions) === CALLBACK_OBSERVES;
  }
  if (callee.name.text === "then") {
    return callbackPossibilities(expression.arguments[1], state, checker, definitions) === CALLBACK_OBSERVES;
  }
  if (callee.name.text === "finally") {
    return isObservedPromise(callee.expression, state, checker, definitions);
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
  const rejectionHandlers = collectHoistedRejectionHandlers(sourceFile, checker);
  let nextObjectIdentity = 1;
  const bumpCandidate = (): void => {
    bumpBudget(budget, "candidates", limits.maxCandidateCount, "OBS_INVENTORY_CANDIDATE_LIMIT");
  };

  const stringPossibilities = (rawExpression: ts.Expression, state: ScanFlowState): StringPossibilities => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isStringLiteralLikeNode(expression)) return { values: new Set([expression.text]), unknown: false };
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { values: new Set(), unknown: true }
        : cloneStrings(state.strings.get(binding) ?? { values: new Set(), unknown: true });
    }
    if (ts.isConditionalExpression(expression)) {
      return unionStrings(
        stringPossibilities(expression.whenTrue, state),
        stringPossibilities(expression.whenFalse, state),
      );
    }
    return { values: new Set(), unknown: true };
  };

  const keyPossibilities = (name: ts.PropertyName, state: ScanFlowState): number => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) || ts.isNumericLiteral(name)) {
      return name.text === "cause" ? KEY_CAUSE : KEY_OTHER;
    }
    if (!ts.isComputedPropertyName(name)) return KEY_OTHER;
    const strings = stringPossibilities(name.expression, state);
    let possibilities = strings.unknown ? KEY_CAUSE | KEY_OTHER : 0;
    for (const value of strings.values) possibilities |= value === "cause" ? KEY_CAUSE : KEY_OTHER;
    return possibilities === 0 ? KEY_CAUSE | KEY_OTHER : possibilities;
  };

  const causePossibilities = (rawExpression: ts.Expression, state: ScanFlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null ? CAUSE_OTHER : state.causes.get(binding) ?? CAUSE_OTHER;
    }
    if (ts.isConditionalExpression(expression)) {
      return causePossibilities(expression.whenTrue, state) | causePossibilities(expression.whenFalse, state);
    }
    return CAUSE_OTHER;
  };

  const causeProperty = (cause: number): number => {
    let property = 0;
    if (cause & CAUSE_CAUGHT) property |= PROPERTY_CAUGHT;
    if (cause & CAUSE_OTHER) property |= PROPERTY_OTHER;
    return property === 0 ? PROPERTY_OTHER : property;
  };

  const spreadProperty = (current: number, spread: number): number => {
    let next = 0;
    if (spread & PROPERTY_ABSENT) next |= current;
    if (spread & PROPERTY_CAUGHT) next |= PROPERTY_CAUGHT;
    if (spread & PROPERTY_OTHER) next |= PROPERTY_OTHER;
    return next === 0 ? PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER : next;
  };

  const propertyForReferences = (references: ObjectReferences, state: ScanFlowState): number => {
    let property = references.unknown ? PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER : 0;
    for (const identity of references.ids) {
      property |= state.objectProperties.get(identity) ?? PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER;
    }
    return property === 0 ? PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER : property;
  };

  const objectReferences = (rawExpression: ts.Expression, state: ScanFlowState): ObjectReferences => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { ids: new Set(), unknown: true }
        : cloneReferences(state.objectReferences.get(binding) ?? { ids: new Set(), unknown: true });
    }
    if (ts.isConditionalExpression(expression)) {
      return unionReferences(
        objectReferences(expression.whenTrue, state),
        objectReferences(expression.whenFalse, state),
      );
    }
    if (!ts.isObjectLiteralExpression(expression)) return { ids: new Set(), unknown: true };

    let property = PROPERTY_ABSENT;
    for (const member of expression.properties) {
      if (ts.isSpreadAssignment(member)) {
        property = spreadProperty(property, propertyForReferences(objectReferences(member.expression, state), state));
        continue;
      }
      if (ts.isPropertyAssignment(member)) {
        const keys = keyPossibilities(member.name, state);
        const assigned = causeProperty(causePossibilities(member.initializer, state));
        property = (keys & KEY_CAUSE ? assigned : 0) | (keys & KEY_OTHER ? property : 0);
        continue;
      }
      if (ts.isShorthandPropertyAssignment(member)) {
        const keys = keyPossibilities(member.name, state);
        const binding = checker.getShorthandAssignmentValueSymbol(member)?.id;
        const assigned = causeProperty(binding === undefined ? CAUSE_OTHER : state.causes.get(binding) ?? CAUSE_OTHER);
        property = (keys & KEY_CAUSE ? assigned : 0) | (keys & KEY_OTHER ? property : 0);
        continue;
      }
      if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        const keys = keyPossibilities(member.name, state);
        property = (keys & KEY_CAUSE ? PROPERTY_OTHER : 0) | (keys & KEY_OTHER ? property : 0);
      }
    }
    const identity = nextObjectIdentity;
    nextObjectIdentity += 1;
    state.objectProperties.set(identity, property);
    return { ids: new Set([identity]), unknown: false };
  };

  const updateBinding = (
    name: ts.Identifier,
    initializer: ts.Expression | undefined,
    state: ScanFlowState,
  ): void => {
    const binding = symbolId(checker, name);
    if (binding === null) return;
    const callbacks = initializer === undefined
      ? CALLBACK_IGNORES
      : callbackPossibilities(initializer, state, checker, rejectionHandlers);
    const causes = initializer === undefined ? CAUSE_OTHER : causePossibilities(initializer, state);
    const strings = initializer === undefined
      ? { values: new Set<string>(), unknown: true }
      : stringPossibilities(initializer, state);
    const references = initializer === undefined
      ? { ids: new Set<number>(), unknown: true }
      : objectReferences(initializer, state);
    state.callbacks.set(binding, callbacks);
    state.causes.set(binding, causes);
    state.strings.set(binding, strings);
    state.objectReferences.set(binding, references);
    if (causes & CAUSE_CAUGHT) state.causeNames.set(binding, name.text);
    else state.causeNames.delete(binding);
  };

  const assignmentKeyPossibilities = (assigned: ts.PropertyAccessExpression | ts.ElementAccessExpression, state: ScanFlowState): number => {
    if (ts.isPropertyAccessExpression(assigned)) return assigned.name.text === "cause" ? KEY_CAUSE : KEY_OTHER;
    if (assigned.argumentExpression === undefined) return KEY_CAUSE | KEY_OTHER;
    const strings = stringPossibilities(assigned.argumentExpression, state);
    let possibilities = strings.unknown ? KEY_CAUSE | KEY_OTHER : 0;
    for (const value of strings.values) possibilities |= value === "cause" ? KEY_CAUSE : KEY_OTHER;
    return possibilities === 0 ? KEY_CAUSE | KEY_OTHER : possibilities;
  };

  const updateAssignment = (node: ts.BinaryExpression, state: ScanFlowState): void => {
    const assigned = unwrapExpression(node.left);
    const simple = node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (ts.isIdentifier(assigned)) {
      updateBinding(assigned, simple ? node.right : undefined, state);
      return;
    }
    if (!ts.isPropertyAccessExpression(assigned) && !ts.isElementAccessExpression(assigned)) return;
    const references = objectReferences(assigned.expression, state);
    const keys = assignmentKeyPossibilities(assigned, state);
    if ((keys & KEY_CAUSE) === 0) return;
    const assignedProperty = simple ? causeProperty(causePossibilities(node.right, state)) : PROPERTY_OTHER;
    const uncertainTarget = references.unknown || references.ids.size !== 1;
    for (const identity of references.ids) {
      const current = state.objectProperties.get(identity) ?? PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER;
      const next = (keys & KEY_OTHER ? current : 0) | assignedProperty;
      state.objectProperties.set(identity, uncertainTarget ? current | next : next);
    }
  };

  const guaranteedCaughtBindings = (state: ScanFlowState, location: ts.Node): ReadonlySet<number> => {
    const bindings = new Set<number>();
    for (const [binding, name] of state.causeNames) {
      if (
        state.causes.get(binding) === CAUSE_CAUGHT
        && checker.resolveName(name, SymbolFlags.Value, location)?.id === binding
      ) {
        bindings.add(binding);
      }
    }
    return bindings;
  };

  const hasVisibleCatchContext = (state: ScanFlowState, location: ts.Node): boolean => {
    for (const [binding, name] of state.catchContexts) {
      if (
        checker.resolveName(name, SymbolFlags.Value, location)?.id === binding
      ) {
        return true;
      }
    }
    return false;
  };

  const isAssignment = (node: ts.BinaryExpression): boolean => (
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );

  const initialState: ScanFlowState = {
    callbacks: new Map(),
    causes: new Map(),
    causeNames: new Map(),
    catchContexts: new Map(),
    strings: new Map(),
    objectReferences: new Map(),
    objectProperties: new Map(),
  };

  const visit = (node: ts.Node, state: ScanFlowState): void => {
    if (ts.isCatchClause(node)) {
      bumpCandidate();
      if (node.variableDeclaration === undefined) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "bare_catch" });
      }
      const catchState = cloneScanFlow(state);
      if (node.variableDeclaration !== undefined && ts.isIdentifier(node.variableDeclaration.name)) {
        const binding = symbolId(checker, node.variableDeclaration.name);
        if (binding !== null) {
          catchState.callbacks.set(binding, CALLBACK_IGNORES);
          catchState.causes.set(binding, CAUSE_CAUGHT);
          catchState.causeNames.set(binding, node.variableDeclaration.name.text);
          catchState.catchContexts.set(binding, node.variableDeclaration.name.text);
          catchState.strings.set(binding, { values: new Set(), unknown: true });
          catchState.objectReferences.set(binding, { ids: new Set(), unknown: true });
        }
      }
      visit(node.block, catchState);
      return;
    }

    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      for (const statement of node.statements) visit(statement, state);
      return;
    }

    if (ts.isIfStatement(node)) {
      visit(node.expression, state);
      const whenTrue = cloneScanFlow(state);
      const whenFalse = cloneScanFlow(state);
      visit(node.thenStatement, whenTrue);
      if (node.elseStatement !== undefined) visit(node.elseStatement, whenFalse);
      joinScanFlows(state, whenTrue, whenFalse);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      visit(node.condition, state);
      const whenTrue = cloneScanFlow(state);
      const whenFalse = cloneScanFlow(state);
      visit(node.whenTrue, whenTrue);
      visit(node.whenFalse, whenFalse);
      joinScanFlows(state, whenTrue, whenFalse);
      return;
    }

    if (ts.isWhileStatement(node)) {
      visit(node.expression, state);
      const zeroIterations = cloneScanFlow(state);
      const oneOrMoreIterations = cloneScanFlow(state);
      visit(node.statement, oneOrMoreIterations);
      joinScanFlows(state, zeroIterations, oneOrMoreIterations);
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
      const zeroIterations = cloneScanFlow(state);
      const oneOrMoreIterations = cloneScanFlow(state);
      visit(node.statement, oneOrMoreIterations);
      if (node.incrementor !== undefined) visit(node.incrementor, oneOrMoreIterations);
      joinScanFlows(state, zeroIterations, oneOrMoreIterations);
      return;
    }

    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      visit(node.expression, state);
      visit(node.initializer, state);
      const zeroIterations = cloneScanFlow(state);
      const oneOrMoreIterations = cloneScanFlow(state);
      visit(node.statement, oneOrMoreIterations);
      joinScanFlows(state, zeroIterations, oneOrMoreIterations);
      return;
    }

    if (ts.isSwitchStatement(node)) {
      visit(node.expression, state);
      const entry = cloneScanFlow(state);
      const exits: ScanFlowState[] = [];
      let hasDefault = false;
      for (const clause of node.caseBlock.clauses) {
        const branch = cloneScanFlow(entry);
        if (ts.isCaseClause(clause)) visit(clause.expression, branch);
        else hasDefault = true;
        for (const statement of clause.statements) visit(statement, branch);
        exits.push(branch);
      }
      if (!hasDefault || exits.length === 0) exits.push(entry);
      let joined = exits[0] as ScanFlowState;
      for (const exit of exits.slice(1)) {
        const next = cloneScanFlow(joined);
        joinScanFlows(next, joined, exit);
        joined = next;
      }
      joinScanFlows(state, joined, joined);
      return;
    }

    if (ts.isFunctionLikeDeclaration(node) && node.body !== undefined) {
      const functionState = cloneScanFlow(state);
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
        const skipped = cloneScanFlow(state);
        const evaluated = cloneScanFlow(state);
        visit(node.right, evaluated);
        joinScanFlows(state, skipped, evaluated);
        return;
      }
      visit(node.right, state);
      if (isAssignment(node)) updateAssignment(node, state);
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
          guaranteedCaughtBindings(state, node),
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
        && !isObservedPromise(expression, state, checker, rejectionHandlers)
      ) {
        findings.push({ path, line: lineOf(sourceFile, node), class: "void_promise" });
      }
    }

    if (ts.isNewExpression(node) && isTypedDomainErrorConstruction(node, wrapperAliases, checker)) {
      bumpCandidate();
      if (hasVisibleCatchContext(state, node)) {
        const options = node.arguments?.[2];
        if (
          options === undefined
          || propertyForReferences(objectReferences(options, state), state) !== PROPERTY_CAUGHT
        ) {
          findings.push({ path, line: lineOf(sourceFile, node), class: "wrapper_without_cause" });
        }
      }
    }

    node.forEachChild((child) => visit(child, state));
  };
  visit(sourceFile, initialState);

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
