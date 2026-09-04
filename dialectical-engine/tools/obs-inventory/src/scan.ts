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
const VALUE_TRUTHY = 1;
const VALUE_FALSY = 2;
const REJECTION_TAINTED = 1;
const REJECTION_UNTAINTED = 2;
const REJECTION_OBSERVED = 1;
const REJECTION_UNOBSERVED = 2;
const MAX_FLOW_ALTERNATIVES = 32;
const MAX_FLOW_ITERATIONS = 64;
const MAX_CALLABLE_EXECUTIONS = 4;
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

type CallablePossibilities = {
  readonly definitions: Map<number, ts.FunctionLikeDeclaration>;
  readonly unknown: boolean;
};

type FlowState = {
  causes: Map<number, number>;
  causeNames: Map<number, string>;
  catchContexts: Map<number, string>;
  strings: Map<number, StringPossibilities>;
  objectReferences: Map<number, ObjectReferences>;
  objectProperties: Map<number, number>;
  arrayData: Map<number, DataPossibilities>;
  manifestArrays: Map<number, ObjectReferences>;
  throwValues: Map<number, number>;
  constructors: Map<number, number>;
  namespaces: Map<number, number>;
  requires: Map<number, number>;
  data: Map<number, DataPossibilities>;
  nullish: Map<number, number>;
  truthiness: Map<number, number>;
  callables: Map<number, CallablePossibilities>;
  rejectionTaint: Map<number, number>;
  rejectionObservation: number;
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

function cloneCallables(value: CallablePossibilities): CallablePossibilities {
  return { definitions: new Map(value.definitions), unknown: value.unknown };
}

function cloneState(state: FlowState): FlowState {
  return {
    causes: new Map(state.causes),
    causeNames: new Map(state.causeNames),
    catchContexts: new Map(state.catchContexts),
    strings: new Map([...state.strings].map(([binding, value]) => [binding, cloneStrings(value)])),
    objectReferences: new Map(
      [...state.objectReferences].map(([binding, value]) => [binding, cloneReferences(value)]),
    ),
    objectProperties: new Map(state.objectProperties),
    arrayData: new Map([...state.arrayData].map(([identity, value]) => [identity, cloneData(value)])),
    manifestArrays: new Map(
      [...state.manifestArrays].map(([identity, value]) => [identity, cloneReferences(value)]),
    ),
    throwValues: new Map(state.throwValues),
    constructors: new Map(state.constructors),
    namespaces: new Map(state.namespaces),
    requires: new Map(state.requires),
    data: new Map([...state.data].map(([binding, value]) => [binding, cloneData(value)])),
    nullish: new Map(state.nullish),
    truthiness: new Map(state.truthiness),
    callables: new Map([...state.callables].map(([binding, value]) => [binding, cloneCallables(value)])),
    rejectionTaint: new Map(state.rejectionTaint),
    rejectionObservation: state.rejectionObservation,
  };
}

function emptyState(): FlowState {
  return {
    causes: new Map(),
    causeNames: new Map(),
    catchContexts: new Map(),
    strings: new Map(),
    objectReferences: new Map(),
    objectProperties: new Map(),
    arrayData: new Map(),
    manifestArrays: new Map(),
    throwValues: new Map(),
    constructors: new Map(),
    namespaces: new Map(),
    requires: new Map(),
    data: new Map(),
    nullish: new Map(),
    truthiness: new Map(),
    callables: new Map(),
    rejectionTaint: new Map(),
    rejectionObservation: REJECTION_UNOBSERVED,
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

function unionCallables(left: CallablePossibilities, right: CallablePossibilities): CallablePossibilities {
  const definitions = new Map([...left.definitions, ...right.definitions]);
  if (definitions.size <= MAX_FLOW_ALTERNATIVES) {
    return { definitions, unknown: left.unknown || right.unknown };
  }
  return {
    definitions: new Map([...definitions].slice(0, MAX_FLOW_ALTERNATIVES)),
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
  joined.causes = joinNumberMaps(left.causes, right.causes, CAUSE_OTHER);
  joined.objectProperties = joinNumberMaps(left.objectProperties, right.objectProperties, PROPERTY_UNKNOWN);
  joined.throwValues = joinNumberMaps(left.throwValues, right.throwValues, THROW_UNSAFE);
  joined.constructors = joinNumberMaps(left.constructors, right.constructors, CONSTRUCTOR_LOCAL);
  joined.namespaces = joinNumberMaps(left.namespaces, right.namespaces, NAMESPACE_LOCAL);
  joined.requires = joinNumberMaps(left.requires, right.requires, REQUIRE_LOCAL);
  joined.nullish = joinNumberMaps(left.nullish, right.nullish, VALUE_PRESENT | VALUE_NULLISH);
  joined.truthiness = joinNumberMaps(left.truthiness, right.truthiness, VALUE_TRUTHY | VALUE_FALSY);
  joined.rejectionTaint = joinNumberMaps(
    left.rejectionTaint,
    right.rejectionTaint,
    REJECTION_UNTAINTED,
  );
  joined.rejectionObservation = left.rejectionObservation | right.rejectionObservation;
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
  for (const identity of new Set([...left.arrayData.keys(), ...right.arrayData.keys()])) {
    const leftData = left.arrayData.get(identity);
    const rightData = right.arrayData.get(identity);
    joined.arrayData.set(identity, leftData === undefined
      ? cloneData(rightData ?? { literals: new Map(), unknown: true })
      : rightData === undefined ? cloneData(leftData) : unionData(leftData, rightData));
  }
  for (const identity of new Set([...left.manifestArrays.keys(), ...right.manifestArrays.keys()])) {
    const leftReferences = left.manifestArrays.get(identity);
    const rightReferences = right.manifestArrays.get(identity);
    joined.manifestArrays.set(identity, leftReferences === undefined
      ? cloneReferences(rightReferences ?? { ids: new Set(), unknown: true })
      : rightReferences === undefined
        ? cloneReferences(leftReferences)
        : unionReferences(leftReferences, rightReferences));
  }
  for (const binding of new Set([...left.data.keys(), ...right.data.keys()])) {
    joined.data.set(binding, unionData(
      left.data.get(binding) ?? { literals: new Map(), unknown: true },
      right.data.get(binding) ?? { literals: new Map(), unknown: true },
    ));
  }
  for (const binding of new Set([...left.callables.keys(), ...right.callables.keys()])) {
    joined.callables.set(binding, unionCallables(
      left.callables.get(binding) ?? { definitions: new Map(), unknown: true },
      right.callables.get(binding) ?? { definitions: new Map(), unknown: true },
    ));
  }
  return joined;
}

function replaceState(target: FlowState, source: FlowState): void {
  const replacement = cloneState(source);
  target.causes = replacement.causes;
  target.causeNames = replacement.causeNames;
  target.catchContexts = replacement.catchContexts;
  target.strings = replacement.strings;
  target.objectReferences = replacement.objectReferences;
  target.objectProperties = replacement.objectProperties;
  target.arrayData = replacement.arrayData;
  target.manifestArrays = replacement.manifestArrays;
  target.throwValues = replacement.throwValues;
  target.constructors = replacement.constructors;
  target.namespaces = replacement.namespaces;
  target.requires = replacement.requires;
  target.data = replacement.data;
  target.nullish = replacement.nullish;
  target.truthiness = replacement.truthiness;
  target.callables = replacement.callables;
  target.rejectionTaint = replacement.rejectionTaint;
  target.rejectionObservation = replacement.rejectionObservation;
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

function callableMapEqual(
  left: ReadonlyMap<number, CallablePossibilities>,
  right: ReadonlyMap<number, CallablePossibilities>,
): boolean {
  return left.size === right.size && [...left].every(([key, value]) => {
    const other = right.get(key);
    return other !== undefined
      && value.unknown === other.unknown
      && setEqual(new Set(value.definitions.keys()), new Set(other.definitions.keys()));
  });
}

function statesEqual(left: FlowState, right: FlowState): boolean {
  return numberMapEqual(left.causes, right.causes)
    && numberMapEqual(left.objectProperties, right.objectProperties)
    && dataMapEqual(left.arrayData, right.arrayData)
    && referenceMapEqual(left.manifestArrays, right.manifestArrays)
    && numberMapEqual(left.throwValues, right.throwValues)
    && numberMapEqual(left.constructors, right.constructors)
    && numberMapEqual(left.namespaces, right.namespaces)
    && numberMapEqual(left.requires, right.requires)
    && numberMapEqual(left.nullish, right.nullish)
    && numberMapEqual(left.truthiness, right.truthiness)
    && nameMapEqual(left.causeNames, right.causeNames)
    && nameMapEqual(left.catchContexts, right.catchContexts)
    && stringMapEqual(left.strings, right.strings)
    && referenceMapEqual(left.objectReferences, right.objectReferences)
    && dataMapEqual(left.data, right.data)
    && callableMapEqual(left.callables, right.callables)
    && numberMapEqual(left.rejectionTaint, right.rejectionTaint)
    && left.rejectionObservation === right.rejectionObservation;
}

function widenState(state: FlowState): FlowState {
  const widened = cloneState(state);
  for (const binding of widened.causes.keys()) widened.causes.set(binding, CAUSE_CAUGHT | CAUSE_OTHER);
  for (const identity of widened.objectProperties.keys()) widened.objectProperties.set(identity, PROPERTY_UNKNOWN);
  for (const [identity, value] of widened.arrayData) {
    widened.arrayData.set(identity, { literals: new Map(value.literals), unknown: true });
  }
  for (const [identity, value] of widened.manifestArrays) {
    widened.manifestArrays.set(identity, { ids: new Set(value.ids), unknown: true });
  }
  for (const binding of widened.throwValues.keys()) widened.throwValues.set(binding, THROW_SAFE | THROW_UNSAFE);
  for (const binding of widened.constructors.keys()) {
    widened.constructors.set(binding, CONSTRUCTOR_DOMAIN | CONSTRUCTOR_LOCAL);
  }
  for (const binding of widened.namespaces.keys()) widened.namespaces.set(binding, NAMESPACE_DOMAIN | NAMESPACE_LOCAL);
  for (const binding of widened.requires.keys()) {
    widened.requires.set(binding, REQUIRE_GLOBAL | REQUIRE_LOCAL | REQUIRE_NULLISH);
  }
  for (const binding of widened.nullish.keys()) widened.nullish.set(binding, VALUE_PRESENT | VALUE_NULLISH);
  for (const binding of widened.truthiness.keys()) widened.truthiness.set(binding, VALUE_TRUTHY | VALUE_FALSY);
  for (const [binding, value] of widened.strings) {
    widened.strings.set(binding, { values: new Set(value.values), unknown: true });
  }
  for (const [binding, value] of widened.objectReferences) {
    widened.objectReferences.set(binding, { ids: new Set(value.ids), unknown: true });
  }
  for (const [binding, value] of widened.data) {
    widened.data.set(binding, { literals: new Map(value.literals), unknown: true });
  }
  for (const [binding, value] of widened.callables) {
    widened.callables.set(binding, { definitions: new Map(value.definitions), unknown: true });
  }
  for (const binding of widened.rejectionTaint.keys()) {
    widened.rejectionTaint.set(binding, REJECTION_TAINTED | REJECTION_UNTAINTED);
  }
  widened.rejectionObservation |= REJECTION_UNOBSERVED;
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

function typeTruthinessPossibilities(type: Type | undefined): number {
  if (type === undefined || type.isErrorType()) return VALUE_TRUTHY | VALUE_FALSY;
  if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.TypeParameter)) !== 0) {
    return VALUE_TRUTHY | VALUE_FALSY;
  }
  if (type.isUnionType() || type.isIntersectionType()) {
    return type.getTypes().reduce((result, part) => result | typeTruthinessPossibilities(part), 0);
  }
  if ((type.flags & (TypeFlags.Null | TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Never)) !== 0) {
    return VALUE_FALSY;
  }
  if ((type.flags & TypeFlags.BooleanLiteral) !== 0) {
    return (type as Type & { intrinsicName?: string }).intrinsicName === "false" ? VALUE_FALSY : VALUE_TRUTHY;
  }
  if ((type.flags & TypeFlags.StringLiteral) !== 0) {
    return (type as Type & { value?: string }).value === "" ? VALUE_FALSY : VALUE_TRUTHY;
  }
  if ((type.flags & TypeFlags.NumberLiteral) !== 0) {
    return (type as Type & { value?: number }).value === 0 ? VALUE_FALSY : VALUE_TRUTHY;
  }
  if ((type.flags & (TypeFlags.Object | TypeFlags.NonPrimitive | TypeFlags.ESSymbolLike)) !== 0) {
    return VALUE_TRUTHY;
  }
  return VALUE_TRUTHY | VALUE_FALSY;
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? stringsOf(target, state) : { values: new Set(), unknown: true };
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
      if (binding === null) return { literals: new Map(), unknown: true };
      let result = cloneData(state.data.get(binding) ?? { literals: new Map(), unknown: true });
      const references = state.objectReferences.get(binding);
      if (references !== undefined && references.ids.size > 0) {
        result = references.unknown ? unionData(result, { literals: new Map(), unknown: true }) : result;
        for (const identity of references.ids) {
          const heap = state.arrayData.get(identity);
          if (heap !== undefined) result = unionData(result, heap);
        }
      }
      return result;
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? dataOf(target, state) : { literals: new Map(), unknown: true };
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? causeOf(target, state) : CAUSE_OTHER;
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

  const objectAssignTarget = (rawExpression: ts.Expression, state: FlowState): ts.Expression | null => {
    const expression = unwrapExpression(rawExpression);
    if (!ts.isCallExpression(expression)) return null;
    const callee = unwrapExpression(expression.expression);
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return null;
    const targetName = unwrapExpression(callee.expression);
    if (!ts.isIdentifier(targetName) || !isGlobalIdentifier(targetName, "Object")) return null;
    const names = ts.isPropertyAccessExpression(callee)
      ? { values: new Set([callee.name.text]), unknown: false }
      : callee.argumentExpression === undefined
        ? { values: new Set<string>(), unknown: true }
        : stringsOf(callee.argumentExpression, state);
    return !names.unknown && names.values.size === 1 && names.values.has("assign")
      ? expression.arguments[0] ?? null
      : null;
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
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const targets = objectReferencesOf(expression.expression, state);
      const keys = ts.isPropertyAccessExpression(expression)
        ? MANIFEST_LIST_PROPERTIES.has(expression.name.text) ? MANIFEST_KEY : OTHER_KEY
        : expression.argumentExpression === undefined
          ? MANIFEST_KEY | OTHER_KEY
          : (() => {
            const names = stringsOf(expression.argumentExpression, state);
            let result = names.unknown ? MANIFEST_KEY | OTHER_KEY : 0;
            for (const name of names.values) {
              result |= MANIFEST_LIST_PROPERTIES.has(name) ? MANIFEST_KEY : OTHER_KEY;
            }
            return result === 0 ? MANIFEST_KEY | OTHER_KEY : result;
          })();
      if ((keys & MANIFEST_KEY) === 0) return { ids: new Set(), unknown: true };
      let result: ObjectReferences = { ids: new Set(), unknown: targets.unknown || (keys & OTHER_KEY) !== 0 };
      for (const identity of targets.ids) {
        result = unionReferences(
          result,
          state.manifestArrays.get(identity) ?? { ids: new Set(), unknown: true },
        );
      }
      return result;
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return objectReferencesOf(expression.right, state);
    }
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target)
        ? objectReferencesOf(target, state)
        : { ids: new Set(), unknown: true };
    }
    const assignedTarget = objectAssignTarget(expression, state);
    if (assignedTarget !== null) return objectReferencesOf(assignedTarget, state);
    if (ts.isArrayLiteralExpression(expression)) {
      const identity = expression.pos;
      if (!state.arrayData.has(identity)) state.arrayData.set(identity, dataOf(expression, state));
      return { ids: new Set([identity]), unknown: false };
    }
    if (!ts.isObjectLiteralExpression(expression)) return { ids: new Set(), unknown: true };
    const identity = expression.pos;
    if (state.objectProperties.has(identity)) return { ids: new Set([identity]), unknown: false };
    let property = PROPERTY_ABSENT;
    let manifestArrays: ObjectReferences = { ids: new Set(), unknown: false };
    for (const member of expression.properties) {
      if (ts.isSpreadAssignment(member)) {
        const spread = objectReferencesOf(member.expression, state);
        property = spreadProperty(property, propertyForReferences(spread, state));
        for (const spreadIdentity of spread.ids) {
          const references = state.manifestArrays.get(spreadIdentity);
          if (references !== undefined) manifestArrays = unionReferences(manifestArrays, references);
        }
        if (spread.unknown) manifestArrays = unionReferences(manifestArrays, { ids: new Set(), unknown: true });
      } else if (ts.isPropertyAssignment(member)) {
        const keys = propertyKey(member.name, state);
        const assigned = causeProperty(causeOf(member.initializer, state));
        property = ((keys & KEY_CAUSE) !== 0 ? assigned : 0) | ((keys & KEY_OTHER) !== 0 ? property : 0);
        const manifestKeys = manifestKey(member.name, state);
        if ((manifestKeys & MANIFEST_KEY) !== 0) {
          const references = objectReferencesOf(member.initializer, state);
          manifestArrays = (manifestKeys & OTHER_KEY) !== 0
            ? unionReferences(manifestArrays, references)
            : references;
        }
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
    state.objectProperties.set(identity, property);
    state.manifestArrays.set(identity, manifestArrays);
    return { ids: new Set([identity]), unknown: false };
  };

  const callablesOf = (rawExpression: ts.Expression, state: FlowState): CallablePossibilities => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
      return { definitions: new Map([[expression.pos, expression]]), unknown: false };
    }
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? { definitions: new Map(), unknown: true }
        : cloneCallables(state.callables.get(binding) ?? { definitions: new Map(), unknown: true });
    }
    if (ts.isConditionalExpression(expression)) {
      return unionCallables(callablesOf(expression.whenTrue, state), callablesOf(expression.whenFalse, state));
    }
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return callablesOf(expression.right, state);
      if (expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const target = unwrapExpression(expression.left);
        return ts.isIdentifier(target)
          ? callablesOf(target, state)
          : { definitions: new Map(), unknown: true };
      }
    }
    return { definitions: new Map(), unknown: true };
  };

  const rejectionTaintOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      const binding = symbolId(checker, expression);
      return binding === null
        ? REJECTION_UNTAINTED
        : state.rejectionTaint.get(binding) ?? REJECTION_UNTAINTED;
    }
    if (ts.isConditionalExpression(expression)) {
      return rejectionTaintOf(expression.whenTrue, state) | rejectionTaintOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return rejectionTaintOf(expression.right, state);
      if (expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const target = unwrapExpression(expression.left);
        return ts.isIdentifier(target) ? rejectionTaintOf(target, state) : REJECTION_UNTAINTED;
      }
    }
    return REJECTION_UNTAINTED;
  };

  let callbackObserves: (callback: ts.Expression | undefined, state: FlowState) => boolean = () => false;

  const callbackOf = (rawExpression: ts.Expression | undefined, state: FlowState): number => {
    if (rawExpression === undefined) return CALLBACK_IGNORES;
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression) && expression.text === "undefined") return CALLBACK_IGNORES;
    return callbackObserves(expression, state) ? CALLBACK_OBSERVES : CALLBACK_IGNORES;
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? throwValueOf(target, state) : THROW_UNSAFE;
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? namespaceOf(target, state) : NAMESPACE_LOCAL;
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
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const target = unwrapExpression(expression.left);
      return ts.isIdentifier(target) ? constructorOf(target, state) : CONSTRUCTOR_LOCAL;
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
      if (expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const target = unwrapExpression(expression.left);
        return ts.isIdentifier(target) ? requireOf(target, state) : REQUIRE_LOCAL;
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
      if (expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const target = unwrapExpression(expression.left);
        return ts.isIdentifier(target) ? nullishOf(target, state) : VALUE_PRESENT | VALUE_NULLISH;
      }
    }
    return VALUE_PRESENT | VALUE_NULLISH;
  };

  const truthinessOf = (rawExpression: ts.Expression, state: FlowState): number => {
    const expression = unwrapExpression(rawExpression);
    if (ts.isIdentifier(expression)) {
      if (expression.text === "undefined") return VALUE_FALSY;
      if (isGlobalIdentifier(expression, "require")) return VALUE_TRUTHY;
      const binding = symbolId(checker, expression);
      return binding === null
        ? typeTruthinessPossibilities(checker.getTypeAtLocation(expression))
        : state.truthiness.get(binding) ?? typeTruthinessPossibilities(checker.getTypeAtLocation(expression));
    }
    if (expression.kind === ts.SyntaxKind.NullKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) {
      return VALUE_FALSY;
    }
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return VALUE_TRUTHY;
    if (ts.isStringLiteralLikeNode(expression)) return expression.text === "" ? VALUE_FALSY : VALUE_TRUTHY;
    if (ts.isNumericLiteral(expression)) return Number(expression.text) === 0 ? VALUE_FALSY : VALUE_TRUTHY;
    if (
      ts.isObjectLiteralExpression(expression)
      || ts.isArrayLiteralExpression(expression)
      || ts.isArrowFunction(expression)
      || ts.isFunctionExpression(expression)
      || ts.isClassExpression(expression)
      || ts.isNewExpression(expression)
    ) {
      return VALUE_TRUTHY;
    }
    if (ts.isConditionalExpression(expression)) {
      return truthinessOf(expression.whenTrue, state) | truthinessOf(expression.whenFalse, state);
    }
    if (ts.isBinaryExpression(expression)) {
      const operator = expression.operatorToken.kind;
      if (operator === ts.SyntaxKind.CommaToken) return truthinessOf(expression.right, state);
      if (operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment) {
        const target = unwrapExpression(expression.left);
        return ts.isIdentifier(target)
          ? truthinessOf(target, state)
          : VALUE_TRUTHY | VALUE_FALSY;
      }
    }
    return typeTruthinessPossibilities(checker.getTypeAtLocation(expression));
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
    state.truthiness.set(binding, initializer === undefined
      ? VALUE_TRUTHY | VALUE_FALSY
      : truthinessOf(initializer, state));
    state.callables.set(binding, initializer === undefined
      ? { definitions: new Map(), unknown: true }
      : callablesOf(initializer, state));
    state.rejectionTaint.set(binding, initializer === undefined
      ? REJECTION_UNTAINTED
      : rejectionTaintOf(initializer, state));
    if (((state.causes.get(binding) ?? CAUSE_OTHER) & CAUSE_CAUGHT) !== 0) state.causeNames.set(binding, name.text);
    else state.causeNames.delete(binding);
  };

  const updateIdentifierWithKnownString = (
    name: ts.Identifier,
    value: string,
    state: FlowState,
  ): void => {
    const binding = symbolId(checker, name);
    if (binding === null) return;
    state.causes.set(binding, CAUSE_OTHER);
    state.causeNames.delete(binding);
    state.strings.set(binding, { values: new Set([value]), unknown: false });
    state.objectReferences.set(binding, { ids: new Set(), unknown: true });
    state.throwValues.set(binding, isCodeToken(value) ? THROW_SAFE : THROW_UNSAFE);
    state.constructors.set(binding, CONSTRUCTOR_LOCAL);
    state.namespaces.set(binding, NAMESPACE_LOCAL);
    state.requires.set(binding, REQUIRE_LOCAL);
    state.data.set(binding, { literals: new Map(), unknown: true });
    state.nullish.set(binding, VALUE_PRESENT);
    state.truthiness.set(binding, value === "" ? VALUE_FALSY : VALUE_TRUTHY);
    state.callables.set(binding, { definitions: new Map(), unknown: false });
    state.rejectionTaint.set(binding, REJECTION_UNTAINTED);
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
    const expression = initializer === undefined ? undefined : unwrapExpression(initializer);
    if (ts.isArrayBindingPattern(name) && expression !== undefined && ts.isArrayLiteralExpression(expression)) {
      for (let index = 0; index < name.elements.length; index += 1) {
        const binding = name.elements[index];
        if (binding === undefined || ts.isOmittedExpression(binding) || binding.name === undefined) continue;
        const value = expression.elements[index];
        updatePattern(
          binding.name,
          value === undefined || ts.isOmittedExpression(value)
            ? undefined
            : ts.isSpreadElement(value) ? value.expression : value,
          state,
          absentNullish,
        );
      }
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

  const assignExpressionPattern = (
    rawTarget: ts.Expression,
    rawValue: ts.Expression,
    state: FlowState,
  ): boolean => {
    const target = unwrapExpression(rawTarget);
    const value = unwrapExpression(rawValue);
    if (!ts.isArrayLiteralExpression(target) || !ts.isArrayLiteralExpression(value)) return false;
    for (let index = 0; index < target.elements.length; index += 1) {
      const assigned = target.elements[index];
      if (assigned === undefined || ts.isOmittedExpression(assigned) || ts.isSpreadElement(assigned)) continue;
      const source = value.elements[index];
      const initializer = source === undefined || ts.isOmittedExpression(source)
        ? undefined
        : ts.isSpreadElement(source) ? source.expression : source;
      const assignmentTarget = ts.isBinaryExpression(assigned)
        && assigned.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ? assigned.left
        : assigned;
      if (ts.isIdentifier(assignmentTarget)) {
        updateIdentifier(assignmentTarget, initializer, state, VALUE_NULLISH);
      } else if (initializer !== undefined && ts.isArrayLiteralExpression(assignmentTarget)) {
        assignExpressionPattern(assignmentTarget, initializer, state);
      }
    }
    return true;
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

  let executeStatement: (node: ts.Statement, state: FlowState, loopLabel?: string) => Completion[];
  let executeSequence: (
    statements: readonly ts.Statement[],
    state: FlowState,
    inspectUnreachable?: boolean,
  ) => Completion[];
  let scanExpression: (node: ts.Expression, state: FlowState) => FlowState[];
  let analyzeFunction: (node: ts.FunctionLikeDeclaration, state: FlowState) => void;
  let executeCallable: (
    node: ts.FunctionLikeDeclaration,
    arguments_: readonly ts.Expression[],
    state: FlowState,
    rejectionCallback?: boolean,
  ) => Completion[];
  const deferredFunctions = new Map<number, ts.FunctionLikeDeclaration>();
  const deferredFunctionStates = new Map<number, FlowState>();
  const activeCallables = new Set<number>();
  const analyzedCallables = new Set<number>();
  const callableExecutionCounts = new Map<number, number>();
  let callableBodyDepth = 0;
  const hasLexicallyNarrowedParent = (node: ts.Node): boolean => {
    let current = node.parent;
    while (current !== undefined && !ts.isSourceFile(current)) {
      if (ts.isCatchClause(current) || ts.isFunctionLikeDeclaration(current)) return true;
      current = current.parent;
    }
    return false;
  };
  const deferFunction = (node: ts.FunctionLikeDeclaration, state: FlowState): void => {
    deferredFunctions.set(node.pos, node);
    if (!hasLexicallyNarrowedParent(node)) return;
    const previous = deferredFunctionStates.get(node.pos);
    deferredFunctionStates.set(node.pos, previous === undefined ? cloneState(state) : joinStates(previous, state));
  };

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
    if (simple && assignExpressionPattern(target, node.right, state)) return;
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
    const target = objectAssignTarget(node, state);
    if (target === null) return;
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

  const applyArrayMutation = (node: ts.CallExpression, state: FlowState): void => {
    const callee = unwrapExpression(node.expression);
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return;
    const names = methodNames(callee, state);
    if (names.unknown || names.values.size !== 1) return;
    const name = [...names.values][0];
    if (name !== "push" && name !== "unshift" && name !== "splice") return;
    const added = name === "splice" ? node.arguments.slice(2) : node.arguments;
    let data: DataPossibilities = { literals: new Map(), unknown: false };
    for (const argument of added) data = unionData(data, dataOf(argument, state));
    const receiver = callee.expression;
    const references = objectReferencesOf(receiver, state);
    for (const identity of references.ids) {
      const current = state.arrayData.get(identity) ?? { literals: new Map(), unknown: true };
      state.arrayData.set(identity, unionData(current, data));
    }
    const target = unwrapExpression(receiver);
    if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
      recordManifestData(node, manifestAssignmentKeys(target, state), data);
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
      deferFunction(node, state);
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
    if (ts.isIdentifier(node)) {
      const binding = symbolId(checker, node);
      const taint = binding === null
        ? REJECTION_UNTAINTED
        : state.rejectionTaint.get(binding) ?? REJECTION_UNTAINTED;
      if ((state.rejectionObservation & REJECTION_UNOBSERVED) !== 0 && (taint & REJECTION_TAINTED) !== 0) {
        state.rejectionObservation = (state.rejectionObservation & REJECTION_OBSERVED)
          | REJECTION_OBSERVED
          | ((taint & REJECTION_UNTAINTED) !== 0 ? REJECTION_UNOBSERVED : 0);
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
        if (
          operator === ts.SyntaxKind.QuestionQuestionEqualsToken
          || operator === ts.SyntaxKind.BarBarEqualsToken
          || operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken
        ) {
          const target = unwrapExpression(node.left);
          if (ts.isIdentifier(target)) {
            const binding = symbolId(checker, target);
            const current = operator === ts.SyntaxKind.QuestionQuestionEqualsToken
              ? binding === null
                ? VALUE_PRESENT | VALUE_NULLISH
                : state.nullish.get(binding) ?? VALUE_PRESENT | VALUE_NULLISH
              : binding === null
                ? VALUE_TRUTHY | VALUE_FALSY
                : state.truthiness.get(binding) ?? VALUE_TRUTHY | VALUE_FALSY;
            const skips = operator === ts.SyntaxKind.QuestionQuestionEqualsToken
              ? VALUE_PRESENT
              : operator === ts.SyntaxKind.BarBarEqualsToken ? VALUE_TRUTHY : VALUE_FALSY;
            const assigns = operator === ts.SyntaxKind.QuestionQuestionEqualsToken
              ? VALUE_NULLISH
              : operator === ts.SyntaxKind.BarBarEqualsToken ? VALUE_FALSY : VALUE_TRUTHY;
            const branches: FlowState[] = [];
            if ((current & skips) !== 0) branches.push(cloneState(state));
            if ((current & assigns) !== 0) {
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
      applyArrayMutation(node, state);
      const callables = callablesOf(node.expression, state);
      const returns: FlowState[] = callables.unknown ? [cloneState(state)] : [];
      if (callableBodyDepth === 0) {
        for (const definition of callables.definitions.values()) {
          for (const result of executeCallable(definition, node.arguments, cloneState(state))) {
            if (result.kind === "normal" || result.kind === "return") returns.push(result.state);
            else if (result.kind === "throw") throws.push(result.state);
          }
        }
      }
      if (returns.length > 0) replaceState(state, returns.reduce(joinStates));
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
    if (clause.name !== undefined) {
      updateIdentifier(clause.name, undefined, state, VALUE_PRESENT);
      const binding = symbolId(checker, clause.name);
      if (binding !== null) state.truthiness.set(binding, VALUE_TRUTHY);
    }
    const bindings = clause.namedBindings;
    if (bindings === undefined) return;
    if (ts.isNamespaceImport(bindings)) {
      updateIdentifier(bindings.name, undefined, state, VALUE_PRESENT);
      const binding = symbolId(checker, bindings.name);
      if (binding !== null) state.truthiness.set(binding, VALUE_TRUTHY);
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
      if (binding !== null) state.truthiness.set(binding, VALUE_TRUTHY);
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
          state.callables.set(binding, statement.body === undefined
            ? { definitions: new Map(), unknown: true }
            : { definitions: new Map([[statement.pos, statement]]), unknown: false });
          state.constructors.set(binding, CONSTRUCTOR_LOCAL);
          state.nullish.set(binding, VALUE_PRESENT);
          state.truthiness.set(binding, VALUE_TRUTHY);
          deferFunction(statement, state);
        }
      }
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
    if (node.initializer === undefined && ts.isIdentifier(node.name)) {
      const binding = symbolId(checker, node.name);
      if (binding !== null) state.truthiness.set(binding, typeTruthinessPossibilities(checker.getTypeAtLocation(node.name)));
    }
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

  const markRejectionBinding = (name: ts.BindingName, state: FlowState): void => {
    if (ts.isIdentifier(name)) {
      const binding = symbolId(checker, name);
      if (binding !== null) state.rejectionTaint.set(binding, REJECTION_TAINTED);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element) && element.name !== undefined) {
        markRejectionBinding(element.name, state);
      }
    }
  };

  executeCallable = (
    node: ts.FunctionLikeDeclaration,
    arguments_: readonly ts.Expression[],
    state: FlowState,
    rejectionCallback = false,
  ): Completion[] => {
    if (node.body === undefined) return [completion("normal", widenState(state))];
    const executions = callableExecutionCounts.get(node.pos) ?? 0;
    if (
      activeCallables.has(node.pos)
      || activeCallables.size >= MAX_FLOW_ALTERNATIVES
      || (!rejectionCallback && executions >= MAX_CALLABLE_EXECUTIONS)
    ) {
      return [completion("normal", widenState(state))];
    }
    if (!rejectionCallback) callableExecutionCounts.set(node.pos, executions + 1);
    analyzedCallables.add(node.pos);
    activeCallables.add(node.pos);
    callableBodyDepth += 1;
    try {
      const functionState = cloneState(state);
      if (rejectionCallback) functionState.rejectionObservation = REJECTION_UNOBSERVED;
      for (let index = 0; index < node.parameters.length; index += 1) {
        const parameter = node.parameters[index];
        if (parameter === undefined) continue;
        const argument = arguments_[index];
        if (argument === undefined && parameter.initializer !== undefined) {
          scanExpression(parameter.initializer, functionState);
        }
        updatePattern(
          parameter.name,
          argument ?? parameter.initializer,
          functionState,
          VALUE_PRESENT | VALUE_NULLISH,
        );
        if (rejectionCallback && index === 0) markRejectionBinding(parameter.name, functionState);
      }
      if (ts.isBlock(node.body)) return executeSequence(node.body.statements, functionState);
      const thrown = scanExpression(node.body, functionState).map((item) => completion("throw", item));
      return coalesceCompletions([completion("return", functionState), ...thrown]);
    } finally {
      callableBodyDepth -= 1;
      activeCallables.delete(node.pos);
    }
  };

  callbackObserves = (rawCallback: ts.Expression | undefined, state: FlowState): boolean => {
    if (rawCallback === undefined) return false;
    const callbacks = callablesOf(rawCallback, state);
    if (callbacks.unknown || callbacks.definitions.size === 0) return false;
    for (const definition of callbacks.definitions.values()) {
      const results = executeCallable(definition, [], cloneState(state), true);
      if (results.length === 0 || results.some(
        (result) => result.state.rejectionObservation !== REJECTION_OBSERVED,
      )) {
        return false;
      }
    }
    return true;
  };

  analyzeFunction = (node: ts.FunctionLikeDeclaration, state: FlowState): void => {
    executeCallable(node, [], cloneState(state));
  };

  const executeLoop = (
    entry: FlowState,
    body: ts.Statement,
    incrementor: ts.Expression | undefined,
    condition: ts.Expression | undefined,
    conditionAfterBody: boolean,
    hasNaturalExit: boolean,
    loopLabel: string | undefined,
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
        const targetsLoop = result.label === null || result.label === loopLabel;
        if (result.kind === "normal" || (result.kind === "continue" && targetsLoop)) {
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
        } else if (result.kind === "break" && targetsLoop) {
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
    if (iteration >= MAX_FLOW_ITERATIONS) {
      header = widenState(header);
      if (hasNaturalExit) exitState = exitState === null ? cloneState(header) : joinStates(exitState, header);
    }
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

  executeStatement = (node: ts.Statement, state: FlowState, loopLabel?: string): Completion[] => {
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
      return executeLoop(state, node.statement, undefined, node.expression, false, true, loopLabel);
    }
    if (ts.isDoStatement(node)) {
      return executeLoop(state, node.statement, undefined, node.expression, true, true, loopLabel);
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
          loopLabel,
        ));
      }
      return coalesceCompletions(results);
    }
    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const results = scanExpression(node.expression, state).map((item) => completion("throw", item));
      const iterable = unwrapExpression(node.expression);
      const knownIterations: readonly (ts.Expression | string)[] | null = ts.isForOfStatement(node)
        && ts.isArrayLiteralExpression(iterable)
        && iterable.elements.every((element) => !ts.isSpreadElement(element))
        ? iterable.elements.filter((element): element is ts.Expression => !ts.isOmittedExpression(element))
        : ts.isForInStatement(node) && ts.isObjectLiteralExpression(iterable)
          ? iterable.properties.flatMap((property): string[] => {
            if (ts.isSpreadAssignment(property)) return [];
            const name = property.name;
            if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name) || ts.isNumericLiteral(name)) {
              return [name.text];
            }
            const keys = ts.isComputedPropertyName(name) ? stringsOf(name.expression, state) : null;
            return keys !== null && !keys.unknown ? [...keys.values] : [];
          })
          : null;
      if (knownIterations !== null) {
        let active: Completion[] = [completion("normal", cloneState(state))];
        const completed: Completion[] = [];
        for (const element of knownIterations) {
          const next: Completion[] = [];
          for (const current of active) {
            const iterationState = cloneState(current.state);
            if (ts.isVariableDeclarationList(node.initializer)) {
              const declaration = node.initializer.declarations[0];
              if (declaration !== undefined) {
                if (typeof element === "string" && ts.isIdentifier(declaration.name)) {
                  updateIdentifierWithKnownString(declaration.name, element, iterationState);
                } else if (typeof element !== "string") {
                  updatePattern(declaration.name, element, iterationState, VALUE_PRESENT);
                } else {
                  bindUnknown(declaration.name, iterationState, VALUE_PRESENT);
                }
              }
            } else if (ts.isExpression(node.initializer)) {
              const target = unwrapExpression(node.initializer);
              if (ts.isIdentifier(target)) {
                if (typeof element === "string") updateIdentifierWithKnownString(target, element, iterationState);
                else updateIdentifier(target, element, iterationState, VALUE_PRESENT);
              } else if (typeof element !== "string") assignExpressionPattern(target, element, iterationState);
            }
            for (const outcome of executeStatement(node.statement, iterationState)) {
              const targetsLoop = outcome.label === null || outcome.label === loopLabel;
              if (outcome.kind === "normal" || (outcome.kind === "continue" && targetsLoop)) {
                next.push(completion("normal", outcome.state));
              } else if (outcome.kind === "break" && targetsLoop) {
                completed.push(completion("normal", outcome.state));
              } else {
                completed.push(outcome);
              }
            }
          }
          active = coalesceCompletions(next);
          if (active.length === 0) break;
        }
        return coalesceCompletions([...results, ...completed, ...active]);
      }
      let loopState = state;
      if (ts.isVariableDeclarationList(node.initializer)) {
        const initialized = executeVariableList(node.initializer, loopState);
        results.push(...initialized.filter((item) => item.kind !== "normal"));
        const normal = initialized.find((item) => item.kind === "normal");
        if (normal !== undefined) loopState = normal.state;
      } else {
        if (ts.isExpression(node.initializer)) scanAssignmentTarget(node.initializer, loopState);
      }
      results.push(...executeLoop(loopState, node.statement, undefined, undefined, false, true, loopLabel));
      return coalesceCompletions(results);
    }
    if (ts.isSwitchStatement(node)) return executeSwitch(node, state);
    if (ts.isTryStatement(node)) return executeTry(node, state);
    if (ts.isLabeledStatement(node)) {
      return executeStatement(node.statement, state, node.label.text).map((item) => (
        item.kind === "break" && item.label === node.label.text
          ? completion("normal", item.state)
          : item
      ));
    }
    if (ts.isFunctionDeclaration(node)) return [completion("normal", state)];
    if (ts.isClassDeclaration(node)) {
      if (node.name !== undefined) {
        updateIdentifier(node.name, undefined, state, VALUE_PRESENT);
        const binding = symbolId(checker, node.name);
        if (binding !== null) state.truthiness.set(binding, VALUE_TRUTHY);
      }
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
  const rootResults = executeSequence(sourceFile.statements, emptyState(), true);
  const normalRootStates = rootResults.filter((result) => result.kind === "normal").map((result) => result.state);
  const rootStates = normalRootStates.length > 0 ? normalRootStates : rootResults.map((result) => result.state);
  const finalState = rootStates.length === 0 ? emptyState() : rootStates.reduce(joinStates);
  const nodeIsInventoryCandidate = (node: ts.Node, state: FlowState): boolean => {
    if (ts.isThrowStatement(node) || node.kind === ts.SyntaxKind.VoidExpression) {
      return true;
    }
    if (ts.isNewExpression(node)) {
      const constructor = unwrapExpression(node.expression);
      const binding = ts.isIdentifier(constructor) ? checker.getSymbolAtLocation(constructor) : undefined;
      const localAlias = (binding?.declarations ?? []).some(
        (declaration) => String(declaration.path) === sourceFile.fileName
          && declaration.kind === ts.SyntaxKind.VariableDeclaration,
      );
      if ((constructorOf(node.expression, state) & CONSTRUCTOR_DOMAIN) !== 0 || localAlias) {
        return true;
      }
    }
    if (zone.governed && (ts.isCallExpression(node) || ts.isObjectLiteralExpression(node))) {
      return true;
    }
    return false;
  };
  const functionHasCandidate = (
    definition: ts.FunctionLikeDeclaration,
    state: FlowState,
    includeNested: boolean,
  ): boolean => {
    if (definition.body === undefined) return false;
    let candidate = false;
    const visit = (node: ts.Node): void => {
      if (candidate) return;
      if (!includeNested && node !== definition.body && ts.isFunctionLikeDeclaration(node)) return;
      if (nodeIsInventoryCandidate(node, state)) {
        candidate = true;
        return;
      }
      node.forEachChild(visit);
    };
    visit(definition.body);
    return candidate;
  };
  const deferDirectNestedFunctions = (definition: ts.FunctionLikeDeclaration): void => {
    if (definition.body === undefined) return;
    const visit = (node: ts.Node): void => {
      if (node !== definition.body && ts.isFunctionLikeDeclaration(node)) {
        if (node.body !== undefined) deferredFunctions.set(node.pos, node);
        return;
      }
      node.forEachChild(visit);
    };
    visit(definition.body);
  };
  for (const definition of deferredFunctions.values()) {
    if (analyzedCallables.has(definition.pos)) continue;
    const state = deferredFunctionStates.get(definition.pos) ?? finalState;
    if (functionHasCandidate(definition, state, false)) {
      analyzeFunction(definition, state);
    } else if (functionHasCandidate(definition, state, true)) {
      if ((definition.body?.getWidth(sourceFile) ?? 0) > 50_000) deferDirectNestedFunctions(definition);
      else analyzeFunction(definition, state);
    }
  }
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
