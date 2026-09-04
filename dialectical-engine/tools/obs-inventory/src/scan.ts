import type { Dirent } from "node:fs";
import { readFile as nodeReadFile, readdir as nodeReaddir } from "node:fs/promises";
import { extname, join } from "node:path";
import * as ts from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API, SignatureKind, SymbolFlags, TypeFlags, type Checker, type Type } from "typescript/unstable/sync";
import {
  createZonePathClassifier,
  isClassifiedZonePath,
  normalizeRepositoryPath,
  type ZonePathClassifier,
} from "./zone-check.js";

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

const CALLBACK_OBSERVES = 1;
const CALLBACK_IGNORES = 2;
const CAUSE_CAUGHT = 1;
const CAUSE_OTHER = 2;
const PROPERTY_ABSENT = 1;
const PROPERTY_CAUGHT = 2;
const PROPERTY_OTHER = 4;
const PROPERTY_UNKNOWN = PROPERTY_ABSENT | PROPERTY_CAUGHT | PROPERTY_OTHER;
const KEY_CAUSE = 1;
const KEY_OTHER = 2;
const THROW_SAFE = 1;
const THROW_UNSAFE = 2;
const CONSTRUCTOR_DOMAIN = 1;
const CONSTRUCTOR_LOCAL = 2;
const NAMESPACE_DOMAIN = 1;
const NAMESPACE_LOCAL = 2;
const REQUIRE_GLOBAL = 1;
const REQUIRE_LOCAL = 2;
const REQUIRE_NULLISH = 4;
const MANIFEST_KEY = 1;
const OTHER_KEY = 2;
const VALUE_PRESENT = 1;
const VALUE_NULLISH = 2;
const MAX_FLOW_ALTERNATIVES = 32;
const MAX_FLOW_ITERATIONS = 64;
const MANIFEST_LIST_PROPERTIES = new Set(["zone_path_prefixes", "compiled_alternate_prefixes"]);

type ClassificationLiteral = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;

type StringPossibilities = {
  readonly values: Set<string>;
  readonly unknown: boolean;
};

type ObjectReferences = {
  readonly ids: Set<number>;
  readonly unknown: boolean;
};

type DataPossibilities = {
  readonly literals: Map<number, ClassificationLiteral>;
  readonly unknown: boolean;
};

type FlowState = {
  callbacks: Map<number, number>;
  causes: Map<number, number>;
  causeNames: Map<number, string>;
  catchContexts: Map<number, string>;
  strings: Map<number, StringPossibilities>;
  objectReferences: Map<number, ObjectReferences>;
  objectProperties: Map<number, number>;
  throwValues: Map<number, number>;
  constructors: Map<number, number>;
  namespaces: Map<number, number>;
  requires: Map<number, number>;
  data: Map<number, DataPossibilities>;
  nullish: Map<number, number>;
};

type CompletionKind = "normal" | "return" | "throw" | "break" | "continue";

type Completion = {
  readonly kind: CompletionKind;
  readonly state: FlowState;
  readonly label: string | null;
};

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
    || ts.isPartiallyEmittedExpression(current)
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

function cloneStrings(value: StringPossibilities): StringPossibilities {
  return { values: new Set(value.values), unknown: value.unknown };
}

function cloneReferences(value: ObjectReferences): ObjectReferences {
  return { ids: new Set(value.ids), unknown: value.unknown };
}

function cloneData(value: DataPossibilities): DataPossibilities {
  return { literals: new Map(value.literals), unknown: value.unknown };
}

function cloneState(state: FlowState): FlowState {
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
    throwValues: new Map(state.throwValues),
    constructors: new Map(state.constructors),
    namespaces: new Map(state.namespaces),
    requires: new Map(state.requires),
    data: new Map([...state.data].map(([binding, value]) => [binding, cloneData(value)])),
    nullish: new Map(state.nullish),
  };
}

function emptyState(): FlowState {
  return {
    callbacks: new Map(),
    causes: new Map(),
    causeNames: new Map(),
    catchContexts: new Map(),
    strings: new Map(),
    objectReferences: new Map(),
    objectProperties: new Map(),
    throwValues: new Map(),
    constructors: new Map(),
    namespaces: new Map(),
    requires: new Map(),
    data: new Map(),
    nullish: new Map(),
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

function unionData(left: DataPossibilities, right: DataPossibilities): DataPossibilities {
  const literals = new Map([...left.literals, ...right.literals]);
  if (literals.size <= MAX_FLOW_ALTERNATIVES) {
    return { literals, unknown: left.unknown || right.unknown };
  }
  return {
    literals: new Map(
      [...literals.entries()]
        .sort(([leftPosition], [rightPosition]) => leftPosition - rightPosition)
        .slice(0, MAX_FLOW_ALTERNATIVES),
    ),
    unknown: true,
  };
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

function joinStates(left: FlowState, right: FlowState): FlowState {
  const joined = emptyState();
  joined.callbacks = joinNumberMaps(left.callbacks, right.callbacks, CALLBACK_IGNORES);
  joined.causes = joinNumberMaps(left.causes, right.causes, CAUSE_OTHER);
  joined.objectProperties = joinNumberMaps(left.objectProperties, right.objectProperties, PROPERTY_UNKNOWN);
  joined.throwValues = joinNumberMaps(left.throwValues, right.throwValues, THROW_UNSAFE);
  joined.constructors = joinNumberMaps(left.constructors, right.constructors, CONSTRUCTOR_LOCAL);
  joined.namespaces = joinNumberMaps(left.namespaces, right.namespaces, NAMESPACE_LOCAL);
  joined.requires = joinNumberMaps(left.requires, right.requires, REQUIRE_LOCAL);
  joined.nullish = joinNumberMaps(left.nullish, right.nullish, VALUE_PRESENT | VALUE_NULLISH);
  joined.catchContexts = new Map([...left.catchContexts, ...right.catchContexts]);
  for (const binding of joined.causes.keys()) {
    if (((joined.causes.get(binding) ?? CAUSE_OTHER) & CAUSE_CAUGHT) !== 0) {
      const name = left.causeNames.get(binding) ?? right.causeNames.get(binding);
      if (name !== undefined) joined.causeNames.set(binding, name);
    }
  }
  for (const binding of new Set([...left.strings.keys(), ...right.strings.keys()])) {
    joined.strings.set(binding, unionStrings(
      left.strings.get(binding) ?? { values: new Set(), unknown: true },
      right.strings.get(binding) ?? { values: new Set(), unknown: true },
    ));
  }
  for (const binding of new Set([...left.objectReferences.keys(), ...right.objectReferences.keys()])) {
    joined.objectReferences.set(binding, unionReferences(
      left.objectReferences.get(binding) ?? { ids: new Set(), unknown: true },
      right.objectReferences.get(binding) ?? { ids: new Set(), unknown: true },
    ));
  }
  for (const binding of new Set([...left.data.keys(), ...right.data.keys()])) {
    joined.data.set(binding, unionData(
      left.data.get(binding) ?? { literals: new Map(), unknown: true },
      right.data.get(binding) ?? { literals: new Map(), unknown: true },
    ));
  }
  return joined;
}

function replaceState(target: FlowState, source: FlowState): void {
  const replacement = cloneState(source);
  target.callbacks = replacement.callbacks;
  target.causes = replacement.causes;
  target.causeNames = replacement.causeNames;
  target.catchContexts = replacement.catchContexts;
  target.strings = replacement.strings;
  target.objectReferences = replacement.objectReferences;
  target.objectProperties = replacement.objectProperties;
  target.throwValues = replacement.throwValues;
  target.constructors = replacement.constructors;
  target.namespaces = replacement.namespaces;
  target.requires = replacement.requires;
  target.data = replacement.data;
  target.nullish = replacement.nullish;
}

function setEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function numberMapEqual(left: ReadonlyMap<number, number>, right: ReadonlyMap<number, number>): boolean {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function nameMapEqual(left: ReadonlyMap<number, string>, right: ReadonlyMap<number, string>): boolean {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function stringMapEqual(
  left: ReadonlyMap<number, StringPossibilities>,
  right: ReadonlyMap<number, StringPossibilities>,
): boolean {
  return left.size === right.size && [...left].every(([key, value]) => {
    const other = right.get(key);
    return other !== undefined && value.unknown === other.unknown && setEqual(value.values, other.values);
  });
}

function referenceMapEqual(
  left: ReadonlyMap<number, ObjectReferences>,
  right: ReadonlyMap<number, ObjectReferences>,
): boolean {
  return left.size === right.size && [...left].every(([key, value]) => {
    const other = right.get(key);
    return other !== undefined && value.unknown === other.unknown && setEqual(value.ids, other.ids);
  });
}

function dataMapEqual(
  left: ReadonlyMap<number, DataPossibilities>,
  right: ReadonlyMap<number, DataPossibilities>,
): boolean {
  return left.size === right.size && [...left].every(([key, value]) => {
    const other = right.get(key);
    return other !== undefined
      && value.unknown === other.unknown
      && setEqual(new Set(value.literals.keys()), new Set(other.literals.keys()));
  });
}

function statesEqual(left: FlowState, right: FlowState): boolean {
  return numberMapEqual(left.callbacks, right.callbacks)
    && numberMapEqual(left.causes, right.causes)
    && numberMapEqual(left.objectProperties, right.objectProperties)
    && numberMapEqual(left.throwValues, right.throwValues)
    && numberMapEqual(left.constructors, right.constructors)
    && numberMapEqual(left.namespaces, right.namespaces)
    && numberMapEqual(left.requires, right.requires)
    && numberMapEqual(left.nullish, right.nullish)
    && nameMapEqual(left.causeNames, right.causeNames)
    && nameMapEqual(left.catchContexts, right.catchContexts)
    && stringMapEqual(left.strings, right.strings)
    && referenceMapEqual(left.objectReferences, right.objectReferences)
    && dataMapEqual(left.data, right.data);
}

function widenState(state: FlowState): FlowState {
  const widened = cloneState(state);
  for (const binding of widened.callbacks.keys()) widened.callbacks.set(binding, CALLBACK_OBSERVES | CALLBACK_IGNORES);
  for (const binding of widened.causes.keys()) widened.causes.set(binding, CAUSE_CAUGHT | CAUSE_OTHER);
  for (const identity of widened.objectProperties.keys()) widened.objectProperties.set(identity, PROPERTY_UNKNOWN);
  for (const binding of widened.throwValues.keys()) widened.throwValues.set(binding, THROW_SAFE | THROW_UNSAFE);
  for (const binding of widened.constructors.keys()) {
    widened.constructors.set(binding, CONSTRUCTOR_DOMAIN | CONSTRUCTOR_LOCAL);
  }
  for (const binding of widened.namespaces.keys()) widened.namespaces.set(binding, NAMESPACE_DOMAIN | NAMESPACE_LOCAL);
  for (const binding of widened.requires.keys()) {
    widened.requires.set(binding, REQUIRE_GLOBAL | REQUIRE_LOCAL | REQUIRE_NULLISH);
  }
  for (const binding of widened.nullish.keys()) widened.nullish.set(binding, VALUE_PRESENT | VALUE_NULLISH);
  for (const [binding, value] of widened.strings) {
    widened.strings.set(binding, { values: new Set(value.values), unknown: true });
  }
  for (const [binding, value] of widened.objectReferences) {
    widened.objectReferences.set(binding, { ids: new Set(value.ids), unknown: true });
  }
  for (const [binding, value] of widened.data) {
    widened.data.set(binding, { literals: new Map(value.literals), unknown: true });
  }
  return widened;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function literalText(node: ts.Expression | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLikeNode(node) ? node.text : null;
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

function typeNullishPossibilities(type: Type | undefined): number {
  if (type === undefined || type.isErrorType()) return VALUE_PRESENT | VALUE_NULLISH;
  if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) return VALUE_PRESENT | VALUE_NULLISH;
  if (type.isUnionType() || type.isIntersectionType()) {
    return type.getTypes().reduce((result, part) => result | typeNullishPossibilities(part), 0);
  }
  return (type.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0 ? VALUE_NULLISH : VALUE_PRESENT;
}

function completion(kind: CompletionKind, state: FlowState, label: string | null = null): Completion {
  return { kind, state, label };
}

function coalesceCompletions(completions: readonly Completion[]): Completion[] {
  const grouped = new Map<string, Completion>();
  for (const item of completions) {
    const key = `${item.kind}:${item.label ?? ""}`;
    const previous = grouped.get(key);
    grouped.set(key, previous === undefined
      ? completion(item.kind, cloneState(item.state), item.label)
      : completion(item.kind, joinStates(previous.state, item.state), item.label));
  }
  return [...grouped.values()];
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

  const zone = createZonePathClassifier(path);
  const findings: InventoryFinding[] = [];
  const findingKeys = new Set<string>();
  const candidateKeys = new Set<string>();

  const bumpCandidate = (node: ts.Node, kind: string): void => {
    const key = `${kind}:${node.pos}`;
    if (candidateKeys.has(key)) return;
    candidateKeys.add(key);
    bumpBudget(budget, "candidates", limits.maxCandidateCount, "OBS_INVENTORY_CANDIDATE_LIMIT");
  };

  const recordFinding = (node: ts.Node, kind: InventoryClass): void => {
    const key = `${kind}:${node.pos}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ path, line: lineOf(sourceFile, node), class: kind });
  };

  const recordZoneSpecifier = (node: ts.Node, specifier: string | null, kind: string): void => {
    if (!zone.governed) return;
    bumpCandidate(node, kind);
    if (specifier !== null && zone.matches(specifier)) recordFinding(node, "zone_import");
  };

  const isGlobalIdentifier = (node: ts.Identifier, text: string): boolean => {
    if (node.text !== text) return false;
    const symbol = checker.getSymbolAtLocation(node);
    return symbol === undefined || !(symbol.declarations ?? []).some(
      (declaration) => String(declaration.path) === sourceFile.fileName,
    );
  };

  const functionObservesRejection = (callback: ts.FunctionLikeDeclaration): boolean => {
    const parameter = callback.parameters[0];
    if (parameter === undefined || callback.body === undefined) return false;
    const bindings = new Set<number>();
    const collect = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        const binding = symbolId(checker, name);
        if (binding !== null) bindings.add(binding);
        return;
      }
      for (const element of name.elements) {
        if (!ts.isOmittedExpression(element) && element.name !== undefined) collect(element.name);
      }
    };
    collect(parameter.name);
    if (bindings.size === 0) return false;
    const usesBinding = (root: ts.Node): boolean => {
      let observed = false;
      const visit = (node: ts.Node): void => {
        if (observed) return;
        if (node !== root && ts.isFunctionLikeDeclaration(node)) return;
        if (
          ts.isBinaryExpression(node)
          && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          && ts.isIdentifier(unwrapExpression(node.left))
        ) {
          visit(node.right);
          return;
        }
        if (ts.isIdentifier(node)) {
          const binding = symbolId(checker, node);
          if (binding !== null && bindings.has(binding)) {
            observed = true;
            return;
          }
        }
        node.forEachChild(visit);
      };
      visit(root);
      return observed;
    };

    type ObservationCompletion = {
      readonly kind: CompletionKind;
      readonly observed: boolean;
      readonly label: string | null;
    };
    const observation = (
      kind: CompletionKind,
      observed: boolean,
      label: string | null = null,
    ): ObservationCompletion => ({ kind, observed, label });
    const observeExpression = (node: ts.Expression | undefined, observed: boolean): ObservationCompletion[] => {
      if (node === undefined) return [observation("normal", observed)];
      const next = observed || usesBinding(node);
      return ts.isCallExpression(unwrapExpression(node)) || ts.isNewExpression(unwrapExpression(node))
        ? [observation("normal", next), observation("throw", next)]
        : [observation("normal", next)];
    };
    let observeStatement: (node: ts.Statement, observed: boolean) => ObservationCompletion[];
    const observeSequence = (
      statements: readonly ts.Statement[],
      initiallyObserved: boolean,
    ): ObservationCompletion[] => {
      let active = [observation("normal", initiallyObserved)];
      const abrupt: ObservationCompletion[] = [];
      for (const statement of statements) {
        const next: ObservationCompletion[] = [];
        for (const current of active) {
          if (current.kind !== "normal") {
            abrupt.push(current);
            continue;
          }
          next.push(...observeStatement(statement, current.observed));
        }
        abrupt.push(...next.filter((item) => item.kind !== "normal"));
        active = next.filter((item) => item.kind === "normal");
        if (active.length === 0) break;
      }
      return [...active, ...abrupt];
    };
    observeStatement = (node: ts.Statement, observed: boolean): ObservationCompletion[] => {
      if (ts.isBlock(node)) return observeSequence(node.statements, observed);
      if (ts.isExpressionStatement(node)) return observeExpression(node.expression, observed);
      if (ts.isVariableStatement(node)) {
        let results = [observation("normal", observed)];
        for (const declaration of node.declarationList.declarations) {
          results = results.flatMap((item) => item.kind === "normal"
            ? observeExpression(declaration.initializer, item.observed)
            : [item]);
        }
        return results;
      }
      if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
        const kind: CompletionKind = ts.isReturnStatement(node) ? "return" : "throw";
        return observeExpression(node.expression, observed).map((item) => observation(kind, item.observed));
      }
      if (ts.isBreakStatement(node)) return [observation("break", observed, node.label?.text ?? null)];
      if (ts.isContinueStatement(node)) return [observation("continue", observed, node.label?.text ?? null)];
      if (ts.isIfStatement(node)) {
        const condition = observed || usesBinding(node.expression);
        return [
          ...observeStatement(node.thenStatement, condition),
          ...(node.elseStatement === undefined
            ? [observation("normal", condition)]
            : observeStatement(node.elseStatement, condition)),
        ];
      }
      if (ts.isDoStatement(node)) {
        return observeStatement(node.statement, observed).map((item) => (
          item.kind === "normal" || (item.kind === "continue" && item.label === null)
            ? observation("normal", item.observed || usesBinding(node.expression))
            : item
        ));
      }
      if (ts.isWhileStatement(node) || ts.isForStatement(node)) {
        let condition = observed;
        if (ts.isWhileStatement(node)) condition ||= usesBinding(node.expression);
        else if (node.condition !== undefined) condition ||= usesBinding(node.condition);
        const zeroIteration = observation("normal", condition);
        const body = observeStatement(node.statement, condition).map((item) => (
          item.kind === "break" && item.label === null ? observation("normal", item.observed) : item
        ));
        return [zeroIteration, ...body];
      }
      if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
        const iterable = observed || usesBinding(node.expression);
        const body = observeStatement(node.statement, iterable).map((item) => (
          item.kind === "break" && item.label === null ? observation("normal", item.observed) : item
        ));
        return [observation("normal", iterable), ...body];
      }
      if (ts.isSwitchStatement(node)) {
        const discriminant = observed || usesBinding(node.expression);
        const clauses = node.caseBlock.clauses;
        const results: ObservationCompletion[] = [];
        if (!clauses.some((clause) => ts.isDefaultClause(clause))) {
          results.push(observation("normal", discriminant));
        }
        for (let start = 0; start < clauses.length; start += 1) {
          let branch = [observation("normal", discriminant)];
          for (let index = start; index < clauses.length; index += 1) {
            const clause = clauses[index];
            if (clause === undefined) break;
            const next: ObservationCompletion[] = [];
            for (const current of branch) {
              if (current.kind !== "normal") next.push(current);
              else next.push(...observeSequence(clause.statements, current.observed));
            }
            branch = next;
            if (!branch.some((item) => item.kind === "normal")) break;
          }
          results.push(...branch.map((item) => item.kind === "break" && item.label === null
            ? observation("normal", item.observed)
            : item));
        }
        return results;
      }
      if (ts.isTryStatement(node)) {
        const tried = observeSequence(node.tryBlock.statements, observed);
        const paths = node.catchClause === undefined
          ? tried
          : [
            ...tried.filter((item) => item.kind !== "throw"),
            ...observeSequence(node.catchClause.block.statements, observed),
          ];
        if (node.finallyBlock === undefined) return paths;
        return paths.flatMap((incoming) => observeSequence(
          node.finallyBlock?.statements ?? [],
          incoming.observed,
        ).map((outgoing) => outgoing.kind === "normal"
          ? observation(incoming.kind, outgoing.observed, incoming.label)
          : outgoing));
      }
      return usesBinding(node)
        ? [observation("normal", true)]
        : [observation("normal", observed)];
    };

    const results = ts.isBlock(callback.body)
      ? observeSequence(callback.body.statements, false)
      : observeExpression(callback.body, false);
    return results.length > 0 && results.every((item) => item.observed);
  };

  const stringsOf = (rawExpression: ts.Expression, state: FlowState): StringPossibilities => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isStringLiteralLikeNode(expression)) return { values: new Set([expression.text]), unknown: false };
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { values: new Set(), unknown: true }
        : cloneStrings(state.strings.get(binding) ?? { values: new Set(), unknown: true });
    }
    if (ts.isConditionalExpression(expression)) {
      return unionStrings(stringsOf(expression.whenTrue, state), stringsOf(expression.whenFalse, state));
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return stringsOf(expression.right, state);
    }
    return { values: new Set(), unknown: true };
  };

  const propertyKey = (name: ts.PropertyName, state: FlowState): number => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) || ts.isNumericLiteral(name)) {
      return name.text === "cause" ? KEY_CAUSE : KEY_OTHER;
    }
    if (!ts.isComputedPropertyName(name)) return KEY_OTHER;
    const strings = stringsOf(name.expression, state);
    let result = strings.unknown ? KEY_CAUSE | KEY_OTHER : 0;
    for (const value of strings.values) result |= value === "cause" ? KEY_CAUSE : KEY_OTHER;
    return result === 0 ? KEY_CAUSE | KEY_OTHER : result;
  };

  const manifestKey = (name: ts.PropertyName, state: FlowState): number => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name)) {
      return MANIFEST_LIST_PROPERTIES.has(name.text) ? MANIFEST_KEY : OTHER_KEY;
    }
    if (!ts.isComputedPropertyName(name)) return OTHER_KEY;
    const strings = stringsOf(name.expression, state);
    let result = strings.unknown ? MANIFEST_KEY | OTHER_KEY : 0;
    for (const value of strings.values) {
      result |= MANIFEST_LIST_PROPERTIES.has(value) ? MANIFEST_KEY : OTHER_KEY;
    }
    return result === 0 ? MANIFEST_KEY | OTHER_KEY : result;
  };

  const dataOf = (rawExpression: ts.Expression, state: FlowState): DataPossibilities => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isStringLiteralLikeNode(expression)) {
      return { literals: new Map([[expression.pos, expression]]), unknown: false };
    }
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { literals: new Map(), unknown: true }
        : cloneData(state.data.get(binding) ?? { literals: new Map(), unknown: true });
    }
    if (ts.isArrayLiteralExpression(expression)) {
      let result: DataPossibilities = { literals: new Map(), unknown: false };
      for (const element of expression.elements) {
        if (ts.isOmittedExpression(element)) continue;
        result = unionData(result, dataOf(ts.isSpreadElement(element) ? element.expression : element, state));
      }
      return result;
    }
    if (ts.isCallExpression(expression)) {
      let result: DataPossibilities = { literals: new Map(), unknown: false };
      for (const argument of expression.arguments) result = unionData(result, dataOf(argument, state));
      return result;
    }
    if (ts.isConditionalExpression(expression)) {
      return unionData(dataOf(expression.whenTrue, state), dataOf(expression.whenFalse, state));
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return dataOf(expression.right, state);
    }
    return { literals: new Map(), unknown: true };
  };

  const recordManifestData = (
    node: ts.Node,
    keys: number,
    data: DataPossibilities,
  ): void => {
    if (!zone.governed || zone.manifestExempt || (keys & MANIFEST_KEY) === 0) return;
    bumpCandidate(node, "manifest");
    for (const literal of data.literals.values()) {
      if (zone.matches(literal.text)) recordFinding(literal, "zone_import");
    }
    if (data.unknown) recordFinding(node, "zone_import");
  };

  const causeOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null ? CAUSE_OTHER : state.causes.get(binding) ?? CAUSE_OTHER;
    }
    if (ts.isConditionalExpression(expression)) {
      return causeOf(expression.whenTrue, state) | causeOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return causeOf(expression.right, state);
    }
    return CAUSE_OTHER;
  };

  const causeProperty = (cause: number): number => {
    let property = 0;
    if ((cause & CAUSE_CAUGHT) !== 0) property |= PROPERTY_CAUGHT;
    if ((cause & CAUSE_OTHER) !== 0) property |= PROPERTY_OTHER;
    return property === 0 ? PROPERTY_OTHER : property;
  };

  const spreadProperty = (current: number, spread: number): number => {
    let result = 0;
    if ((spread & PROPERTY_ABSENT) !== 0) result |= current;
    if ((spread & PROPERTY_CAUGHT) !== 0) result |= PROPERTY_CAUGHT;
    if ((spread & PROPERTY_OTHER) !== 0) result |= PROPERTY_OTHER;
    return result === 0 ? PROPERTY_UNKNOWN : result;
  };

  const propertyForReferences = (references: ObjectReferences, state: FlowState): number => {
    let result = references.unknown ? PROPERTY_UNKNOWN : 0;
    for (const identity of references.ids) {
      result |= state.objectProperties.get(identity) ?? PROPERTY_UNKNOWN;
    }
    return result === 0 ? PROPERTY_UNKNOWN : result;
  };

  const objectReferencesOf = (rawExpression: ts.Expression, state: FlowState): ObjectReferences => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { ids: new Set(), unknown: true }
        : cloneReferences(state.objectReferences.get(binding) ?? { ids: new Set(), unknown: true });
    }
    if (ts.isConditionalExpression(expression)) {
      return unionReferences(
        objectReferencesOf(expression.whenTrue, state),
        objectReferencesOf(expression.whenFalse, state),
      );
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return objectReferencesOf(expression.right, state);
    }
    if (!ts.isObjectLiteralExpression(expression)) return { ids: new Set(), unknown: true };
    let property = PROPERTY_ABSENT;
    for (const member of expression.properties) {
      if (ts.isSpreadAssignment(member)) {
        property = spreadProperty(property, propertyForReferences(objectReferencesOf(member.expression, state), state));
      } else if (ts.isPropertyAssignment(member)) {
        const keys = propertyKey(member.name, state);
        const assigned = causeProperty(causeOf(member.initializer, state));
        property = ((keys & KEY_CAUSE) !== 0 ? assigned : 0) | ((keys & KEY_OTHER) !== 0 ? property : 0);
      } else if (ts.isShorthandPropertyAssignment(member)) {
        const keys = propertyKey(member.name, state);
        const binding = checker.getShorthandAssignmentValueSymbol(member)?.id;
        const assigned = causeProperty(binding === undefined ? CAUSE_OTHER : state.causes.get(binding) ?? CAUSE_OTHER);
        property = ((keys & KEY_CAUSE) !== 0 ? assigned : 0) | ((keys & KEY_OTHER) !== 0 ? property : 0);
      } else if (
        ts.isMethodDeclaration(member)
        || ts.isGetAccessorDeclaration(member)
        || ts.isSetAccessorDeclaration(member)
      ) {
        const keys = propertyKey(member.name, state);
        property = ((keys & KEY_CAUSE) !== 0 ? PROPERTY_OTHER : 0)
          | ((keys & KEY_OTHER) !== 0 ? property : 0);
      }
    }
    const identity = expression.pos;
    state.objectProperties.set(identity, property);
    return { ids: new Set([identity]), unknown: false };
  };

  const callbackOf = (rawExpression: ts.Expression | undefined, state: FlowState): number => {
    if (rawExpression === undefined) return CALLBACK_IGNORES;
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      if (expression.text === "undefined") return CALLBACK_IGNORES;
      const binding = symbolId(checker, expression);
      return binding === null ? CALLBACK_IGNORES : state.callbacks.get(binding) ?? CALLBACK_IGNORES;
    }
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
      return functionObservesRejection(expression) ? CALLBACK_OBSERVES : CALLBACK_IGNORES;
    }
    if (ts.isConditionalExpression(expression)) {
      return callbackOf(expression.whenTrue, state) | callbackOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return callbackOf(expression.right, state);
    }
    return CALLBACK_IGNORES;
  };

  const throwValueOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isStringLiteralLikeNode(expression)) return isCodeToken(expression.text) ? THROW_SAFE : THROW_UNSAFE;
    if (ts.isTemplateExpression(expression)) return isCodeToken(expression.head.text) ? THROW_SAFE : THROW_UNSAFE;
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      if (binding !== null && state.throwValues.has(binding)) return state.throwValues.get(binding) ?? THROW_UNSAFE;
      return isCodeToken(expression.text) ? THROW_SAFE : THROW_UNSAFE;
    }
    if (ts.isPropertyAccessExpression(expression)) {
      return isCodeToken(expression.name.text) ? THROW_SAFE : THROW_UNSAFE;
    }
    if (ts.isElementAccessExpression(expression) && expression.argumentExpression !== undefined) {
      const keys = stringsOf(expression.argumentExpression, state);
      let result = keys.unknown ? THROW_SAFE | THROW_UNSAFE : 0;
      for (const key of keys.values) result |= isCodeToken(key) ? THROW_SAFE : THROW_UNSAFE;
      return result === 0 ? THROW_UNSAFE : result;
    }
    if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
      const first = expression.arguments?.[0];
      return first === undefined ? THROW_UNSAFE : throwValueOf(first, state);
    }
    if (ts.isConditionalExpression(expression)) {
      return throwValueOf(expression.whenTrue, state) | throwValueOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return throwValueOf(expression.right, state);
    }
    if (ts.isObjectLiteralExpression(expression)) {
      let result = THROW_UNSAFE;
      for (const property of expression.properties) {
        if (
          ts.isPropertyAssignment(property)
          && ((ts.isIdentifier(property.name) && property.name.text === "code")
            || (ts.isStringLiteralLikeNode(property.name) && property.name.text === "code"))
        ) {
          result = throwValueOf(property.initializer, state);
        }
      }
      return result;
    }
    return THROW_UNSAFE;
  };

  const namespaceOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null ? NAMESPACE_LOCAL : state.namespaces.get(binding) ?? NAMESPACE_LOCAL;
    }
    if (ts.isConditionalExpression(expression)) {
      return namespaceOf(expression.whenTrue, state) | namespaceOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return namespaceOf(expression.right, state);
    }
    return NAMESPACE_LOCAL;
  };

  const constructorOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null ? CONSTRUCTOR_LOCAL : state.constructors.get(binding) ?? CONSTRUCTOR_LOCAL;
    }
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === "TypedDomainError") {
      return (namespaceOf(expression.expression, state) & NAMESPACE_DOMAIN) !== 0
        ? CONSTRUCTOR_DOMAIN
          | ((namespaceOf(expression.expression, state) & NAMESPACE_LOCAL) !== 0 ? CONSTRUCTOR_LOCAL : 0)
        : CONSTRUCTOR_LOCAL;
    }
    if (ts.isElementAccessExpression(expression) && expression.argumentExpression !== undefined) {
      const keys = stringsOf(expression.argumentExpression, state);
      const namespaces = namespaceOf(expression.expression, state);
      let result = 0;
      if (keys.unknown) result |= CONSTRUCTOR_DOMAIN | CONSTRUCTOR_LOCAL;
      for (const key of keys.values) {
        result |= key === "TypedDomainError" && (namespaces & NAMESPACE_DOMAIN) !== 0
          ? CONSTRUCTOR_DOMAIN
          : CONSTRUCTOR_LOCAL;
      }
      if ((namespaces & NAMESPACE_LOCAL) !== 0) result |= CONSTRUCTOR_LOCAL;
      return result === 0 ? CONSTRUCTOR_LOCAL : result;
    }
    if (ts.isConditionalExpression(expression)) {
      return constructorOf(expression.whenTrue, state) | constructorOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return constructorOf(expression.right, state);
    }
    return CONSTRUCTOR_LOCAL;
  };

  const requireOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      if (isGlobalIdentifier(expression, "require")) return REQUIRE_GLOBAL;
      const binding = symbolId(checker, expression);
      return binding === null ? REQUIRE_LOCAL : state.requires.get(binding) ?? REQUIRE_LOCAL;
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const target = unwrapExpression(expression.expression);
      if (!ts.isIdentifier(target) || !isGlobalIdentifier(target, "module")) return REQUIRE_LOCAL;
      if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text === "require" ? REQUIRE_GLOBAL : REQUIRE_LOCAL;
      }
      if (expression.argumentExpression === undefined) return REQUIRE_GLOBAL | REQUIRE_LOCAL;
      const keys = stringsOf(expression.argumentExpression, state);
      let result = keys.unknown ? REQUIRE_GLOBAL | REQUIRE_LOCAL : 0;
      for (const key of keys.values) result |= key === "require" ? REQUIRE_GLOBAL : REQUIRE_LOCAL;
      return result === 0 ? REQUIRE_LOCAL : result;
    }
    if (ts.isConditionalExpression(expression)) {
      return requireOf(expression.whenTrue, state) | requireOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return requireOf(expression.right, state);
      if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        return requireOf(expression.left, state) | requireOf(expression.right, state);
      }
    }
    return REQUIRE_LOCAL;
  };

  const nullishOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      if (expression.text === "undefined") return VALUE_NULLISH;
      if (isGlobalIdentifier(expression, "require")) return VALUE_PRESENT;
      const binding = symbolId(checker, expression);
      return binding === null
        ? VALUE_PRESENT | VALUE_NULLISH
        : state.nullish.get(binding) ?? VALUE_PRESENT | VALUE_NULLISH;
    }
    if (expression.kind === ts.SyntaxKind.NullKeyword) return VALUE_NULLISH;
    if (
      ts.isStringLiteralLikeNode(expression)
      || ts.isNumericLiteral(expression)
      || ts.isObjectLiteralExpression(expression)
      || ts.isArrayLiteralExpression(expression)
      || ts.isArrowFunction(expression)
      || ts.isFunctionExpression(expression)
      || ts.isClassExpression(expression)
      || ts.isNewExpression(expression)
    ) {
      return VALUE_PRESENT;
    }
    if (ts.isConditionalExpression(expression)) {
      return nullishOf(expression.whenTrue, state) | nullishOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return nullishOf(expression.right, state);
      if (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        const left = nullishOf(expression.left, state);
        return (left & VALUE_PRESENT) | ((left & VALUE_NULLISH) !== 0 ? nullishOf(expression.right, state) : 0);
      }
    }
    return VALUE_PRESENT | VALUE_NULLISH;
  };

  const hasVisibleCaughtRoot = (state: FlowState, location: ts.Node): boolean => {
    for (const [binding, name] of state.catchContexts) {
      if (checker.resolveName(name, SymbolFlags.Value, location)?.id === binding) return true;
    }
    for (const [binding, name] of state.causeNames) {
      if (
        ((state.causes.get(binding) ?? CAUSE_OTHER) & CAUSE_CAUGHT) !== 0
        && checker.resolveName(name, SymbolFlags.Value, location)?.id === binding
      ) {
        return true;
      }
    }
    return false;
  };

  const updateIdentifier = (
    name: ts.Identifier,
    initializer: ts.Expression | undefined,
    state: FlowState,
    absentNullish: number = VALUE_NULLISH,
  ): void => {
    const binding = symbolId(checker, name);
    if (binding === null) return;
    state.callbacks.set(binding, initializer === undefined ? CALLBACK_IGNORES : callbackOf(initializer, state));
    state.causes.set(binding, initializer === undefined ? CAUSE_OTHER : causeOf(initializer, state));
    state.strings.set(binding, initializer === undefined
      ? { values: new Set(), unknown: true }
      : stringsOf(initializer, state));
    state.objectReferences.set(binding, initializer === undefined
      ? { ids: new Set(), unknown: true }
      : objectReferencesOf(initializer, state));
    state.throwValues.set(binding, initializer === undefined ? THROW_UNSAFE : throwValueOf(initializer, state));
    state.constructors.set(binding, initializer === undefined
      ? CONSTRUCTOR_LOCAL
      : constructorOf(initializer, state));
    state.namespaces.set(binding, initializer === undefined ? NAMESPACE_LOCAL : namespaceOf(initializer, state));
    state.requires.set(binding, initializer === undefined ? REQUIRE_NULLISH : requireOf(initializer, state));
    state.data.set(binding, initializer === undefined
      ? { literals: new Map(), unknown: true }
      : dataOf(initializer, state));
    state.nullish.set(binding, initializer === undefined ? absentNullish : nullishOf(initializer, state));
    if (((state.causes.get(binding) ?? CAUSE_OTHER) & CAUSE_CAUGHT) !== 0) state.causeNames.set(binding, name.text);
    else state.causeNames.delete(binding);
  };

  const bindUnknown = (name: ts.BindingName, state: FlowState, absentNullish: number): void => {
    if (ts.isIdentifier(name)) {
      updateIdentifier(name, undefined, state, absentNullish);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element) && element.name !== undefined) {
        bindUnknown(element.name, state, absentNullish);
      }
    }
  };

  const updatePattern = (
    name: ts.BindingName,
    initializer: ts.Expression | undefined,
    state: FlowState,
    absentNullish: number,
  ): void => {
    if (ts.isIdentifier(name)) {
      updateIdentifier(name, initializer, state, absentNullish);
      return;
    }
    bindUnknown(name, state, absentNullish);
    if (
      ts.isObjectBindingPattern(name)
      && initializer !== undefined
      && (namespaceOf(initializer, state) & NAMESPACE_DOMAIN) !== 0
    ) {
      for (const element of name.elements) {
        if (element.name === undefined || !ts.isIdentifier(element.name)) continue;
        const imported = element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : element.name.text;
        if (imported !== "TypedDomainError") continue;
        const binding = symbolId(checker, element.name);
        if (binding !== null) state.constructors.set(binding, CONSTRUCTOR_DOMAIN);
      }
    }
  };

  const assignmentKeys = (
    assigned: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    state: FlowState,
  ): number => {
    if (ts.isPropertyAccessExpression(assigned)) return assigned.name.text === "cause" ? KEY_CAUSE : KEY_OTHER;
    if (assigned.argumentExpression === undefined) return KEY_CAUSE | KEY_OTHER;
    const strings = stringsOf(assigned.argumentExpression, state);
    let result = strings.unknown ? KEY_CAUSE | KEY_OTHER : 0;
    for (const value of strings.values) result |= value === "cause" ? KEY_CAUSE : KEY_OTHER;
    return result === 0 ? KEY_CAUSE | KEY_OTHER : result;
  };

  const manifestAssignmentKeys = (
    assigned: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    state: FlowState,
  ): number => {
    if (ts.isPropertyAccessExpression(assigned)) {
      return MANIFEST_LIST_PROPERTIES.has(assigned.name.text) ? MANIFEST_KEY : OTHER_KEY;
    }
    if (assigned.argumentExpression === undefined) return MANIFEST_KEY | OTHER_KEY;
    const strings = stringsOf(assigned.argumentExpression, state);
    let result = strings.unknown ? MANIFEST_KEY | OTHER_KEY : 0;
    for (const value of strings.values) {
      result |= MANIFEST_LIST_PROPERTIES.has(value) ? MANIFEST_KEY : OTHER_KEY;
    }
    return result === 0 ? MANIFEST_KEY | OTHER_KEY : result;
  };

  const updateCauseProperty = (
    assigned: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    value: number,
    state: FlowState,
  ): void => {
    const references = objectReferencesOf(assigned.expression, state);
    const keys = assignmentKeys(assigned, state);
    if ((keys & KEY_CAUSE) === 0) return;
    const uncertain = references.unknown || references.ids.size !== 1;
    for (const identity of references.ids) {
      const current = state.objectProperties.get(identity) ?? PROPERTY_UNKNOWN;
      const next = ((keys & KEY_OTHER) !== 0 ? current : 0) | value;
      state.objectProperties.set(identity, uncertain ? current | next : next);
    }
  };

  const methodNames = (
    expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    state: FlowState,
  ): StringPossibilities => {
    if (ts.isPropertyAccessExpression(expression)) {
      return { values: new Set([expression.name.text]), unknown: false };
    }
    return expression.argumentExpression === undefined
      ? { values: new Set(), unknown: true }
      : stringsOf(expression.argumentExpression, state);
  };

  const isObservedPromise = (rawExpression: ts.Expression, state: FlowState): boolean => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isAwaitExpression(expression)) return true;
    if (!ts.isCallExpression(expression)) return false;
    const callee = unwrapExpression(expression.expression);
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return false;
    const names = methodNames(callee, state);
    if (names.unknown || names.values.size !== 1) return false;
    const name = [...names.values][0];
    if (name === "catch") return callbackOf(expression.arguments[0], state) === CALLBACK_OBSERVES;
    if (name === "then") return callbackOf(expression.arguments[1], state) === CALLBACK_OBSERVES;
    if (name === "finally") return isObservedPromise(callee.expression, state);
    return false;
  };

  let executeStatement: (node: ts.Statement, state: FlowState) => Completion[];
  let executeSequence: (
    statements: readonly ts.Statement[],
    state: FlowState,
    inspectUnreachable?: boolean,
  ) => Completion[];
  let scanExpression: (node: ts.Expression, state: FlowState) => FlowState[];
  let analyzeFunction: (node: ts.FunctionLikeDeclaration, state: FlowState) => void;

  const scanAssignmentTarget = (
    rawTarget: ts.Expression,
    state: FlowState,
  ): FlowState[] => {
    const target = unwrapExpression(rawTarget);
    if (ts.isIdentifier(target)) return [];
    if (ts.isPropertyAccessExpression(target)) return scanExpression(target.expression, state);
    if (ts.isElementAccessExpression(target)) {
      const throws = scanExpression(target.expression, state);
      if (target.argumentExpression !== undefined) throws.push(...scanExpression(target.argumentExpression, state));
      return throws;
    }
    return scanExpression(target, state);
  };

  const assignBinary = (node: ts.BinaryExpression, state: FlowState): void => {
    const target = unwrapExpression(node.left);
    const simple = node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (ts.isIdentifier(target)) {
      updateIdentifier(target, simple ? node.right : undefined, state, VALUE_PRESENT | VALUE_NULLISH);
      return;
    }
    if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return;
    updateCauseProperty(target, simple ? causeProperty(causeOf(node.right, state)) : PROPERTY_OTHER, state);
    recordManifestData(node, manifestAssignmentKeys(target, state), simple
      ? dataOf(node.right, state)
      : { literals: new Map(), unknown: true });
  };

  const applyObjectAssign = (node: ts.CallExpression, state: FlowState): void => {
    const callee = unwrapExpression(node.expression);
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "assign") return;
    const targetName = unwrapExpression(callee.expression);
    if (!ts.isIdentifier(targetName) || !isGlobalIdentifier(targetName, "Object")) return;
    const target = node.arguments[0];
    if (target === undefined) return;
    const references = objectReferencesOf(target, state);
    const uncertain = references.unknown || references.ids.size !== 1;
    for (const source of node.arguments.slice(1)) {
      const property = propertyForReferences(objectReferencesOf(source, state), state);
      for (const identity of references.ids) {
        const current = state.objectProperties.get(identity) ?? PROPERTY_UNKNOWN;
        const next = spreadProperty(current, property);
        state.objectProperties.set(identity, uncertain ? current | next : next);
      }
    }
  };

  const scanObjectLiteral = (node: ts.ObjectLiteralExpression, state: FlowState): FlowState[] => {
    const throws: FlowState[] = [];
    for (const member of node.properties) {
      if (ts.isSpreadAssignment(member)) {
        throws.push(...scanExpression(member.expression, state));
      } else if (ts.isPropertyAssignment(member)) {
        if (ts.isComputedPropertyName(member.name)) throws.push(...scanExpression(member.name.expression, state));
        throws.push(...scanExpression(member.initializer, state));
        recordManifestData(member, manifestKey(member.name, state), dataOf(member.initializer, state));
      } else if (ts.isShorthandPropertyAssignment(member)) {
        const binding = checker.getShorthandAssignmentValueSymbol(member)?.id;
        const data = binding === undefined
          ? { literals: new Map<number, ClassificationLiteral>(), unknown: true }
          : cloneData(state.data.get(binding) ?? { literals: new Map(), unknown: true });
        recordManifestData(member, manifestKey(member.name, state), data);
      } else if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        analyzeFunction(member, state);
      }
    }
    return throws;
  };

  scanExpression = (rawNode: ts.Expression, state: FlowState): FlowState[] => {
    const node = unwrapExpression(rawNode);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      analyzeFunction(node, state);
      return [];
    }
    if (ts.isClassExpression(node)) {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)
          || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          analyzeFunction(member, state);
        }
      }
      return [];
    }
    if (ts.isConditionalExpression(node)) {
      const throws = scanExpression(node.condition, state);
      const whenTrue = cloneState(state);
      const whenFalse = cloneState(state);
      throws.push(...scanExpression(node.whenTrue, whenTrue), ...scanExpression(node.whenFalse, whenFalse));
      replaceState(state, joinStates(whenTrue, whenFalse));
      return throws;
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.CommaToken) {
        const throws = scanExpression(node.left, state);
        throws.push(...scanExpression(node.right, state));
        return throws;
      }
      if (
        operator === ts.SyntaxKind.AmpersandAmpersandToken
        || operator === ts.SyntaxKind.BarBarToken
        || operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const throws = scanExpression(node.left, state);
        const skipped = cloneState(state);
        const evaluated = cloneState(state);
        throws.push(...scanExpression(node.right, evaluated));
        replaceState(state, joinStates(skipped, evaluated));
        return throws;
      }
      const isAssignment = operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
      if (isAssignment) {
        const throws = scanAssignmentTarget(node.left, state);
        if (operator === ts.SyntaxKind.QuestionQuestionEqualsToken) {
          const target = unwrapExpression(node.left);
          if (ts.isIdentifier(target)) {
            const binding = symbolId(checker, target);
            const nullish = binding === null
              ? VALUE_PRESENT | VALUE_NULLISH
              : state.nullish.get(binding) ?? VALUE_PRESENT | VALUE_NULLISH;
            const branches: FlowState[] = [];
            if ((nullish & VALUE_PRESENT) !== 0) branches.push(cloneState(state));
            if ((nullish & VALUE_NULLISH) !== 0) {
              const assigned = cloneState(state);
              throws.push(...scanExpression(node.right, assigned));
              updateIdentifier(target, node.right, assigned, VALUE_PRESENT | VALUE_NULLISH);
              branches.push(assigned);
            }
            if (branches.length > 0) replaceState(state, branches.reduce(joinStates));
            return throws;
          }
        }
        throws.push(...scanExpression(node.right, state));
        assignBinary(node, state);
        return throws;
      }
      const throws = scanExpression(node.left, state);
      throws.push(...scanExpression(node.right, state));
      return throws;
    }
    if (ts.isDeleteExpression(node)) {
      const throws = scanAssignmentTarget(node.expression, state);
      const target = unwrapExpression(node.expression);
      if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
        updateCauseProperty(target, PROPERTY_ABSENT, state);
      }
      return throws;
    }
    if (node.kind === ts.SyntaxKind.VoidExpression) {
      const expression = (node as ts.VoidExpression).expression;
      const throws = scanExpression(expression, state);
      bumpCandidate(node, "void");
      if (isPromiseCandidate(expression, checker) && !isObservedPromise(expression, state)) {
        recordFinding(node, "void_promise");
      }
      return throws;
    }
    if (ts.isAwaitExpression(node)) {
      const throws = scanExpression(node.expression, state);
      throws.push(cloneState(state));
      return throws;
    }
    if (ts.isCallExpression(node)) {
      const throws = scanExpression(node.expression, state);
      for (const argument of node.arguments) throws.push(...scanExpression(argument, state));
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const possibleRequire = (requireOf(node.expression, state) & REQUIRE_GLOBAL) !== 0;
      if (dynamicImport || possibleRequire) {
        recordZoneSpecifier(node, literalText(node.arguments[0]), dynamicImport ? "dynamic-import" : "require");
      }
      applyObjectAssign(node, state);
      throws.push(cloneState(state));
      return throws;
    }
    if (ts.isNewExpression(node)) {
      const throws = scanExpression(node.expression, state);
      for (const argument of node.arguments ?? []) throws.push(...scanExpression(argument, state));
      const constructors = constructorOf(node.expression, state);
      if ((constructors & CONSTRUCTOR_DOMAIN) !== 0) {
        bumpCandidate(node, "wrapper");
        if (hasVisibleCaughtRoot(state, node)) {
          const options = node.arguments?.[2];
          if (
            options === undefined
            || propertyForReferences(objectReferencesOf(options, state), state) !== PROPERTY_CAUGHT
          ) {
            recordFinding(node, "wrapper_without_cause");
          }
        }
      }
      throws.push(cloneState(state));
      return throws;
    }
    if (ts.isObjectLiteralExpression(node)) return scanObjectLiteral(node, state);
    if (ts.isArrayLiteralExpression(node)) {
      const throws: FlowState[] = [];
      for (const element of node.elements) {
        if (!ts.isOmittedExpression(element)) {
          throws.push(...scanExpression(ts.isSpreadElement(element) ? element.expression : element, state));
        }
      }
      return throws;
    }
    if (ts.isPropertyAccessExpression(node)) return scanExpression(node.expression, state);
    if (ts.isElementAccessExpression(node)) {
      const throws = scanExpression(node.expression, state);
      if (node.argumentExpression !== undefined) throws.push(...scanExpression(node.argumentExpression, state));
      return throws;
    }
    if (ts.isTemplateExpression(node)) {
      const throws: FlowState[] = [];
      for (const span of node.templateSpans) throws.push(...scanExpression(span.expression, state));
      return throws;
    }
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
      return scanExpression(node.operand, state);
    }
    if (ts.isTypeOfExpression(node)) return scanExpression(node.expression, state);
    const throws: FlowState[] = [];
    node.forEachChild((child) => {
      if (ts.isExpression(child)) throws.push(...scanExpression(child, state));
      else if (ts.isFunctionLikeDeclaration(child)) analyzeFunction(child, state);
    });
    return throws;
  };

  const seedImport = (node: ts.ImportDeclaration, state: FlowState): void => {
    const clause = node.importClause;
    if (clause === undefined) return;
    if (clause.name !== undefined) updateIdentifier(clause.name, undefined, state, VALUE_PRESENT);
    const bindings = clause.namedBindings;
    if (bindings === undefined) return;
    if (ts.isNamespaceImport(bindings)) {
      updateIdentifier(bindings.name, undefined, state, VALUE_PRESENT);
      const binding = symbolId(checker, bindings.name);
      if (binding !== null && ts.isStringLiteralLikeNode(node.moduleSpecifier)
        && node.moduleSpecifier.text === "@debateai/kernel") {
        state.namespaces.set(binding, NAMESPACE_DOMAIN);
      }
      return;
    }
    for (const specifier of bindings.elements) {
      updateIdentifier(specifier.name, undefined, state, VALUE_PRESENT);
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      const binding = symbolId(checker, specifier.name);
      if (
        binding !== null
        && imported === "TypedDomainError"
        && ts.isStringLiteralLikeNode(node.moduleSpecifier)
        && node.moduleSpecifier.text === "@debateai/kernel"
      ) {
        state.constructors.set(binding, CONSTRUCTOR_DOMAIN);
      }
    }
  };

  const seedHoisted = (statements: readonly ts.Statement[], state: FlowState): void => {
    for (const statement of statements) {
      if (ts.isImportDeclaration(statement)) seedImport(statement, state);
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        updateIdentifier(statement.name, undefined, state, VALUE_PRESENT);
        const binding = symbolId(checker, statement.name);
        if (binding !== null) {
          state.callbacks.set(binding, statement.body !== undefined && functionObservesRejection(statement)
            ? CALLBACK_OBSERVES
            : CALLBACK_IGNORES);
          state.constructors.set(binding, CONSTRUCTOR_LOCAL);
          state.nullish.set(binding, VALUE_PRESENT);
        }
      }
    }
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) analyzeFunction(statement, state);
    }
  };

  const executeVariableDeclaration = (node: ts.VariableDeclaration, state: FlowState): Completion[] => {
    const throws: Completion[] = [];
    if (node.initializer !== undefined) {
      for (const thrown of scanExpression(node.initializer, state)) throws.push(completion("throw", thrown));
    }
    let absentNullish = VALUE_NULLISH;
    if (node.initializer === undefined) {
      const variableStatement = node.parent.parent;
      const ambient = ts.isVariableStatement(variableStatement)
        && (variableStatement.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
      if (ambient) absentNullish = typeNullishPossibilities(checker.getTypeAtLocation(node.name));
    }
    updatePattern(node.name, node.initializer, state, absentNullish);
    throws.push(completion("normal", state));
    return coalesceCompletions(throws);
  };

  const executeVariableList = (node: ts.VariableDeclarationList, state: FlowState): Completion[] => {
    let results = [completion("normal", state)];
    for (const declaration of node.declarations) {
      const next: Completion[] = [];
      for (const result of results) {
        if (result.kind !== "normal") {
          next.push(result);
          continue;
        }
        next.push(...executeVariableDeclaration(declaration, result.state));
      }
      results = coalesceCompletions(next);
    }
    return results;
  };

  analyzeFunction = (node: ts.FunctionLikeDeclaration, state: FlowState): void => {
    if (node.body === undefined) return;
    const functionState = cloneState(state);
    for (const parameter of node.parameters) {
      if (parameter.initializer !== undefined) scanExpression(parameter.initializer, functionState);
      bindUnknown(parameter.name, functionState, VALUE_PRESENT | VALUE_NULLISH);
    }
    if (ts.isBlock(node.body)) executeSequence(node.body.statements, functionState);
    else scanExpression(node.body, functionState);
  };

  const executeLoop = (
    entry: FlowState,
    body: ts.Statement,
    incrementor: ts.Expression | undefined,
    condition: ts.Expression | undefined,
    conditionAfterBody: boolean,
    hasNaturalExit: boolean,
  ): Completion[] => {
    let header = cloneState(entry);
    let iteration = 0;
    const abrupt: Completion[] = [];
    const breaks: FlowState[] = [];
    let exitState: FlowState | null = null;
    let firstBack: FlowState | null = null;
    while (iteration < MAX_FLOW_ITERATIONS) {
      iteration += 1;
      const bodyEntry = cloneState(header);
      if (!conditionAfterBody && condition !== undefined) {
        for (const thrown of scanExpression(condition, bodyEntry)) abrupt.push(completion("throw", thrown));
      }
      if (!conditionAfterBody && hasNaturalExit) {
        exitState = exitState === null ? cloneState(bodyEntry) : joinStates(exitState, bodyEntry);
      }
      const bodyResults = executeStatement(body, bodyEntry);
      const backStates: FlowState[] = [];
      for (const result of bodyResults) {
        if (result.kind === "normal" || (result.kind === "continue" && result.label === null)) {
          const back = cloneState(result.state);
          if (incrementor !== undefined) {
            for (const thrown of scanExpression(incrementor, back)) abrupt.push(completion("throw", thrown));
          }
          if (conditionAfterBody && condition !== undefined) {
            for (const thrown of scanExpression(condition, back)) abrupt.push(completion("throw", thrown));
          }
          if (conditionAfterBody && hasNaturalExit) {
            exitState = exitState === null ? cloneState(back) : joinStates(exitState, back);
          }
          backStates.push(back);
        } else if (result.kind === "break" && result.label === null) {
          breaks.push(result.state);
        } else {
          abrupt.push(result);
        }
      }
      if (backStates.length === 0) {
        firstBack = null;
        break;
      }
      const back = backStates.reduce(joinStates);
      if (firstBack === null) firstBack = cloneState(back);
      const seed = conditionAfterBody ? firstBack : entry;
      const next = joinStates(seed, back);
      if (statesEqual(next, header)) {
        header = next;
        break;
      }
      header = next;
    }
    if (iteration >= MAX_FLOW_ITERATIONS) header = widenState(header);
    const exits: FlowState[] = [];
    if (exitState !== null) exits.push(exitState);
    exits.push(...breaks);
    const normal = exits.length === 0 ? [] : [completion("normal", exits.reduce(joinStates))];
    return coalesceCompletions([...normal, ...abrupt]);
  };

  const executeSwitch = (node: ts.SwitchStatement, state: FlowState): Completion[] => {
    const results: Completion[] = scanExpression(node.expression, state).map((item) => completion("throw", item));
    const clauses = node.caseBlock.clauses;
    const hasDefault = clauses.some((clause) => ts.isDefaultClause(clause));
    const evaluateCaseTests = (target: number | null): FlowState => {
      const tested = cloneState(state);
      for (let index = 0; index < clauses.length; index += 1) {
        const clause = clauses[index];
        if (clause === undefined) break;
        if (ts.isCaseClause(clause)) {
          for (const thrown of scanExpression(clause.expression, tested)) {
            results.push(completion("throw", thrown));
          }
        }
        if (target !== null && index === target) break;
      }
      return tested;
    };
    if (!hasDefault) results.push(completion("normal", evaluateCaseTests(null)));
    for (let start = 0; start < clauses.length; start += 1) {
      const startingClause = clauses[start];
      if (startingClause === undefined) continue;
      let branch: Completion[] = [completion(
        "normal",
        evaluateCaseTests(ts.isDefaultClause(startingClause) ? null : start),
      )];
      for (let index = start; index < clauses.length; index += 1) {
        const clause = clauses[index];
        if (clause === undefined) break;
        const next: Completion[] = [];
        for (const current of branch) {
          if (current.kind !== "normal") {
            next.push(current);
            continue;
          }
          next.push(...executeSequence(clause.statements, current.state));
        }
        branch = coalesceCompletions(next);
        if (!branch.some((item) => item.kind === "normal")) break;
      }
      for (const item of branch) {
        results.push(item.kind === "break" && item.label === null
          ? completion("normal", item.state)
          : item);
      }
    }
    return coalesceCompletions(results);
  };

  const executeTry = (node: ts.TryStatement, state: FlowState): Completion[] => {
    const tried = executeSequence(node.tryBlock.statements, cloneState(state));
    const beforeFinally: Completion[] = [];
    const thrown = tried.filter((item) => item.kind === "throw");
    beforeFinally.push(...tried.filter((item) => item.kind !== "throw"));
    if (node.catchClause === undefined) {
      beforeFinally.push(...thrown);
    } else if (thrown.length > 0) {
      for (const item of thrown) {
        const catchState = cloneState(item.state);
        const declaration = node.catchClause.variableDeclaration;
        if (declaration !== undefined && ts.isIdentifier(declaration.name)) {
          updateIdentifier(declaration.name, undefined, catchState, VALUE_PRESENT);
          const binding = symbolId(checker, declaration.name);
          if (binding !== null) {
            catchState.causes.set(binding, CAUSE_CAUGHT);
            catchState.causeNames.set(binding, declaration.name.text);
            catchState.catchContexts.set(binding, declaration.name.text);
            catchState.throwValues.set(binding, THROW_SAFE);
            catchState.nullish.set(binding, VALUE_PRESENT);
          }
        }
        beforeFinally.push(...executeSequence(node.catchClause.block.statements, catchState));
      }
    }
    if (node.finallyBlock === undefined) return coalesceCompletions(beforeFinally);
    const finalResults: Completion[] = [];
    for (const incoming of coalesceCompletions(beforeFinally)) {
      const executed = executeSequence(node.finallyBlock.statements, cloneState(incoming.state));
      for (const outgoing of executed) {
        finalResults.push(outgoing.kind === "normal"
          ? completion(incoming.kind, outgoing.state, incoming.label)
          : outgoing);
      }
    }
    return coalesceCompletions(finalResults);
  };

  executeSequence = (
    statements: readonly ts.Statement[],
    state: FlowState,
    inspectUnreachable = false,
  ): Completion[] => {
    seedHoisted(statements, state);
    let active: Completion[] = [completion("normal", state)];
    const abrupt: Completion[] = [];
    let unreachableState: FlowState | null = null;
    for (const statement of statements) {
      if (active.length === 0) {
        if (!inspectUnreachable) continue;
        if (unreachableState !== null) {
          const unreachable = executeStatement(statement, cloneState(unreachableState));
          const continuation = unreachable.find((item) => item.kind === "normal") ?? unreachable[0];
          if (continuation !== undefined) unreachableState = continuation.state;
        }
        continue;
      }
      const next: Completion[] = [];
      for (const current of active) {
        if (current.kind !== "normal") {
          abrupt.push(current);
          continue;
        }
        next.push(...executeStatement(statement, current.state));
      }
      const joined = coalesceCompletions(next);
      active = joined.filter((item) => item.kind === "normal");
      abrupt.push(...joined.filter((item) => item.kind !== "normal"));
      if (active.length === 0) unreachableState = joined[0]?.state ?? cloneState(state);
    }
    return coalesceCompletions([...active, ...abrupt]);
  };

  executeStatement = (node: ts.Statement, state: FlowState): Completion[] => {
    if (ts.isBlock(node)) return executeSequence(node.statements, state);
    if (ts.isVariableStatement(node)) return executeVariableList(node.declarationList, state);
    if (ts.isExpressionStatement(node)) {
      const throws = scanExpression(node.expression, state).map((item) => completion("throw", item));
      return coalesceCompletions([completion("normal", state), ...throws]);
    }
    if (ts.isReturnStatement(node)) {
      const throws = node.expression === undefined
        ? []
        : scanExpression(node.expression, state).map((item) => completion("throw", item));
      return coalesceCompletions([completion("return", state), ...throws]);
    }
    if (ts.isThrowStatement(node)) {
      bumpCandidate(node, "throw");
      const throws = node.expression === undefined
        ? []
        : scanExpression(node.expression, state).map((item) => completion("throw", item));
      if (node.expression === undefined || throwValueOf(node.expression, state) !== THROW_SAFE) {
        recordFinding(node, "throw_without_code");
      }
      return coalesceCompletions([...throws, completion("throw", state)]);
    }
    if (ts.isBreakStatement(node)) {
      return [completion("break", state, node.label?.text ?? null)];
    }
    if (ts.isContinueStatement(node)) {
      return [completion("continue", state, node.label?.text ?? null)];
    }
    if (ts.isIfStatement(node)) {
      const results = scanExpression(node.expression, state).map((item) => completion("throw", item));
      results.push(...executeStatement(node.thenStatement, cloneState(state)));
      results.push(...(node.elseStatement === undefined
        ? [completion("normal", cloneState(state))]
        : executeStatement(node.elseStatement, cloneState(state))));
      return coalesceCompletions(results);
    }
    if (ts.isWhileStatement(node)) {
      return executeLoop(state, node.statement, undefined, node.expression, false, true);
    }
    if (ts.isDoStatement(node)) {
      return executeLoop(state, node.statement, undefined, node.expression, true, true);
    }
    if (ts.isForStatement(node)) {
      let initialized: Completion[] = [completion("normal", state)];
      if (node.initializer !== undefined) {
        initialized = ts.isVariableDeclarationList(node.initializer)
          ? executeVariableList(node.initializer, state)
          : ts.isExpression(node.initializer) ? coalesceCompletions([
            completion("normal", state),
            ...scanExpression(node.initializer, state).map((item) => completion("throw", item)),
          ]) : [completion("normal", state)];
      }
      const results: Completion[] = initialized.filter((item) => item.kind !== "normal");
      for (const item of initialized.filter((candidate) => candidate.kind === "normal")) {
        results.push(...executeLoop(
          item.state,
          node.statement,
          node.incrementor,
          node.condition,
          false,
          node.condition !== undefined,
        ));
      }
      return coalesceCompletions(results);
    }
    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const results = scanExpression(node.expression, state).map((item) => completion("throw", item));
      let loopState = state;
      if (ts.isVariableDeclarationList(node.initializer)) {
        const initialized = executeVariableList(node.initializer, loopState);
        results.push(...initialized.filter((item) => item.kind !== "normal"));
        const normal = initialized.find((item) => item.kind === "normal");
        if (normal !== undefined) loopState = normal.state;
      } else {
        if (ts.isExpression(node.initializer)) scanAssignmentTarget(node.initializer, loopState);
      }
      results.push(...executeLoop(loopState, node.statement, undefined, undefined, false, true));
      return coalesceCompletions(results);
    }
    if (ts.isSwitchStatement(node)) return executeSwitch(node, state);
    if (ts.isTryStatement(node)) return executeTry(node, state);
    if (ts.isLabeledStatement(node)) {
      return executeStatement(node.statement, state).map((item) => (
        item.kind === "break" && item.label === node.label.text
          ? completion("normal", item.state)
          : item
      ));
    }
    if (ts.isFunctionDeclaration(node)) return [completion("normal", state)];
    if (ts.isClassDeclaration(node)) {
      if (node.name !== undefined) updateIdentifier(node.name, undefined, state, VALUE_PRESENT);
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)
          || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          analyzeFunction(member, state);
        }
      }
      return [completion("normal", state)];
    }
    if (ts.isImportDeclaration(node)) {
      seedImport(node, state);
      return [completion("normal", state)];
    }
    if (ts.isImportEqualsDeclaration(node)) {
      updateIdentifier(node.name, undefined, state, VALUE_PRESENT);
      return [completion("normal", state)];
    }
    if (ts.isExportAssignment(node)) {
      const throws = scanExpression(node.expression, state).map((item) => completion("throw", item));
      return coalesceCompletions([completion("normal", state), ...throws]);
    }
    const results: Completion[] = [completion("normal", state)];
    node.forEachChild((child) => {
      if (ts.isExpression(child)) {
        for (const thrown of scanExpression(child, state)) results.push(completion("throw", thrown));
      } else if (ts.isStatement(child)) {
        results.push(...executeStatement(child, cloneState(state)));
      }
    });
    return coalesceCompletions(results);
  };

  const staticVisit = (node: ts.Node): void => {
    if (ts.isCatchClause(node) && node.variableDeclaration === undefined) {
      bumpCandidate(node, "bare-catch");
      recordFinding(node, "bare_catch");
    }
    if (ts.isImportDeclaration(node)) {
      recordZoneSpecifier(node, literalText(node.moduleSpecifier), "static-import");
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      recordZoneSpecifier(node, literalText(node.moduleSpecifier), "export-from");
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      recordZoneSpecifier(node, literalText(node.moduleReference.expression), "import-equals");
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      recordZoneSpecifier(
        node,
        ts.isLiteralTypeNode(argument) && ts.isStringLiteralLikeNode(argument.literal)
          ? argument.literal.text
          : null,
        "import-type",
      );
    }
    node.forEachChild(staticVisit);
  };

  staticVisit(sourceFile);
  executeSequence(sourceFile.statements, emptyState(), true);
  return findings.sort((left, right) => left.line - right.line || left.class.localeCompare(right.class));
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
    const entries = [...await fileSystem.readdir(absoluteDirectory)]
      .sort((left, right) => left.name.localeCompare(right.name));
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
