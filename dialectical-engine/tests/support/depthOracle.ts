import ts from "typescript-classic";

/**
 * F-T1-ORACLE-EVALUATOR — the depth oracle's parser, discovery and addressing stage.
 *
 * ROUND 1 SCOPE: parse, discover candidates, address them. There is NO evaluation
 * here — no abstract domain, no transfer function, no verdict. `EvaluatedCandidate`,
 * consumed spans and DOMAIN emission belong to rounds 2 and 3 (plan §1.12 R4).
 *
 * Authority: plan REVISION 4 — §1.5 R2 (parseModule), §1.9 R3 (signatures),
 * §1.12–§1.14 R4 (records, site union), §2.2 R2 / §2 R3 (addressing), §5.6 R4
 * (the three bare DOMAIN controls stay on the old emitter in rounds 1–2).
 *
 * NAMED FACT (D68 ADDENDUM 2), carried verbatim:
 * Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.
 */

export type DuplicateKind = "DEPTH_BOUND_LITERAL" | "DOMAIN_ENUMERATION";

/** §1.13 R4 — a discriminated union; `path`/`diagnostic` exist only on INCONCLUSIVE. */
export type Site =
  | { readonly kind: DuplicateKind; readonly line: number; readonly text: string }
  | {
      readonly kind: "INCONCLUSIVE";
      readonly line: number;
      readonly text: string;
      readonly path: string;
      readonly diagnostic: string;
    };

/** §1.12 R4 — complete after ROUND 1. Evaluation fields are deliberately absent. */
export interface DiscoveredCandidate {
  readonly start: number;
  readonly end: number;
  readonly elementLine: number;
  readonly statementLine: number;
}

/* ------------------------------------------------------------------------- *
 * ROUND 2 — the evaluator's value domain (plan §3.16 R3, §3.17 R4).
 * Storage and classification are separate: cells KEEP their primitive, and the
 * numeric verdict is a function over cells, never a stored state.
 * ------------------------------------------------------------------------- */

/** §3.17 R4 — a `num` cell is FINITE by construction. */
export type Prim =
  | { readonly t: "num"; readonly v: number }
  | { readonly t: "str"; readonly v: string }
  | { readonly t: "bool"; readonly v: boolean }
  | { readonly t: "null" }
  | { readonly t: "undef" }
  | { readonly t: "jsx" }
  | { readonly t: "unknown" };

/** A cell is a `Prim`, or a nested array whose payload is retained. */
export type Cell = Prim | { readonly t: "arr"; readonly value: Value };

export type Value =
  | { readonly kind: "EXACT"; readonly coll: "array" | "set"; readonly cells: readonly Cell[] }
  | { readonly kind: "NOT_ARRAY" }
  | { readonly kind: "UNKNOWN" };

export type Verdict = "RULED" | "OTHER" | "UNDETERMINED";

/** §1.12 R4 — complete after ROUND 2. Extends the discovery record; no placeholders. */
export interface EvaluatedCandidate extends DiscoveredCandidate {
  readonly consumedStart: number;
  readonly consumedEnd: number;
  readonly value: Value;
  readonly verdict: Verdict;
  readonly reason: string;
}

/** The ruled option domain, as a sorted distinct list. */
const RULED_DOMAIN = [1, 2, 3, 4, 5] as const;

/** §3.17 R4 — numeric classification is a FUNCTION over cells. */
export function numericVerdict(cells: readonly Cell[]): Verdict {
  if (cells.some((c) => c.t === "unknown")) return "UNDETERMINED";
  if (cells.every((c) => c.t === "num")) {
    const distinct = [...new Set(cells.map((c) => (c as { t: "num"; v: number }).v))].sort((a, b) => a - b);
    if (distinct.length === RULED_DOMAIN.length && distinct.every((v, i) => v === RULED_DOMAIN[i])) return "RULED";
    return "OTHER";
  }
  return "OTHER";
}

/** The verdict a whole `Value` carries. */
export function verdictOf(value: Value): Verdict {
  if (value.kind === "UNKNOWN") return "UNDETERMINED";
  if (value.kind === "NOT_ARRAY") return "OTHER";
  return numericVerdict(value.cells);
}

/** §3.2 — rule 1: the candidate's OWN element list is the ruled domain. Checked FIRST. */
function ruleOneFires(cells: readonly Cell[]): boolean {
  return numericVerdict(cells) === "RULED";
}

/**
 * §3.13 R3 — a numeric literal (with optional unary sign) as a `Prim`.
 * A literal whose value is not finite yields `unknown`, so a `num` cell is finite
 * whatever its origin.
 */
function literalPrim(node: ts.Expression): Prim {
  if (ts.isNumericLiteral(node)) {
    const v = Number(node.text);
    return Number.isFinite(v) ? { t: "num", v } : { t: "unknown" };
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    const base = Number(node.operand.text);
    if (!Number.isFinite(base)) return { t: "unknown" };
    if (node.operator === ts.SyntaxKind.MinusToken) return { t: "num", v: -base };
    if (node.operator === ts.SyntaxKind.PlusToken) return { t: "num", v: base };
  }
  return { t: "unknown" };
}

/** The candidate literal's own cells. */
function ownCells(node: ts.ArrayLiteralExpression): Cell[] {
  return node.elements.map((e) => literalPrim(e));
}

export type ParseOk = { readonly ok: true; readonly file: ts.SourceFile };
export type ParseFailed = {
  readonly ok: false;
  readonly diagnostics: readonly { readonly line: number; readonly message: string }[];
};
export type ParseResult = ParseOk | ParseFailed;

/**
 * THE SINGLE DIAGNOSTIC ACCESSOR for this lane.
 *
 * `parseDiagnostics` is populated by `createSourceFile` but is NOT part of
 * TypeScript's documented public surface. It is read HERE and nowhere else — the
 * round-0 smoke's local copy was deleted when this module took the property over,
 * and the smoke now observes malformed input through `parseModule`, this same path.
 * A future TypeScript bump touches this one function.
 */
function parseDiagnosticsOf(file: ts.SourceFile): readonly ts.Diagnostic[] {
  return (file as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
}

/**
 * §1.5 R2 — the extension mapping is LOAD-BEARING: a `.tsx` file parsed as `TS`
 * mis-parses its JSX. Mutation K23 is exactly this mapping made wrong.
 */
export function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".mjs") || path.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * §1.5 R2 — `setParentNodes` is true because addressing (§2.2 R2) climbs the
 * parent chain. A parse without it is not usable by this design.
 */
export function parseModule(path: string, source: string): ParseResult {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(path)
  );
  const raw = parseDiagnosticsOf(file);
  if (raw.length === 0) return { ok: true, file };
  const diagnostics = raw.map((diagnostic) => ({
    line:
      typeof diagnostic.start === "number"
        ? file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
  }));
  return { ok: false, diagnostics };
}

/** Every numeric-only, non-empty array literal is a round-1 candidate. */
function isNumericElement(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return true;
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
  ) {
    return ts.isNumericLiteral(node.operand);
  }
  return false;
}

/**
 * §2.2 R2 — the owning statement is a PARSER fact: climb `parent` until a
 * statement. Where no statement encloses the node, the owning container is the
 * nearest node whose parent is the SourceFile.
 */
function owningStatementStart(node: ts.Node, file: ts.SourceFile): number {
  let current: ts.Node = node;
  while (current.parent !== undefined) {
    if (ts.isStatement(current)) return current.getStart(file);
    if (current.parent.kind === ts.SyntaxKind.SourceFile) return current.getStart(file);
    current = current.parent;
  }
  return current.getStart(file);
}

/**
 * §1.12 R4 / §2.2 R2 — discovery and addressing. Identity is the offset pair
 * `(start, end)`; `statementLine` is DISPLAY and never shares a field with it.
 * Returns `[]` when the parse fails.
 */
export function candidatesOf(path: string, source: string): DiscoveredCandidate[] {
  const parsed = parseModule(path, source);
  if (!parsed.ok) return [];
  const file = parsed.file;
  const found: DiscoveredCandidate[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length > 0 &&
      node.elements.every(isNumericElement)
    ) {
      const start = node.getStart(file);
      found.push({
        start,
        end: node.getEnd(),
        elementLine: file.getLineAndCharacterOfPosition(start).line + 1,
        statementLine: file.getLineAndCharacterOfPosition(owningStatementStart(node, file)).line + 1
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  return found.sort((left, right) => left.start - right.start);
}

/* ========================================================================== *
 * ROUND 2 — THE COMPLETE DECLARED EVALUATOR
 *
 * plan §3.9 R2 (purity gate) · §3.10 R2 (callback grammar and per-operation
 * results) · §3.13 R3 (primitive contract) · §3.15 R3 (operations by return
 * contract) · §3.16 R3 (ownership walk) · §3.17 R4 (cells ARE primitives) ·
 * §3.18 R4 (a modelled member invocation requires the member to be the CALLEE).
 *
 * The evaluator NEVER executes source. It evaluates the syntax tree over the
 * finite known cells, with the two recorded work limits below.
 * ========================================================================== */

/** The two work limits, recorded here as the plan requires the worker to do. */
export const NODE_BUDGET = 64;
export const DEPTH_LIMIT = 32;

const UNKNOWN_VALUE: Value = { kind: "UNKNOWN" };
const NOT_ARRAY_VALUE: Value = { kind: "NOT_ARRAY" };
const exact = (cells: readonly Cell[], coll: "array" | "set" = "array"): Value =>
  ({ kind: "EXACT", coll, cells });

/**
 * Counter semantics, as recorded in the manifest: every node reachable from the
 * callback BODY INCLUSIVE via `ts.forEachChild`; depth counts the body as 0 and
 * adds 1 per `forEachChild` level.
 */
function measureBody(body: ts.Node): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  const walk = (node: ts.Node, d: number): void => {
    nodes += 1;
    if (d > depth) depth = d;
    ts.forEachChild(node, (child) => walk(child, d + 1));
  };
  walk(body, 0);
  return { nodes, depth };
}

/** §3.13 R3's expression grammar. Returns the first violation, or null. */
function outOfGrammarReason(node: ts.Node): string | null {
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found !== null) return;
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsToken ||
          (op >= ts.SyntaxKind.PlusEqualsToken && op <= ts.SyntaxKind.CaretEqualsToken)) {
        found = "assignment"; return;
      }
    }
    if (ts.isCallExpression(n)) { found = "call"; return; }
    if (ts.isPropertyAccessExpression(n)) { found = "member access"; return; }
    if (ts.isElementAccessExpression(n)) { found = "member access"; return; }
    if (n.kind === ts.SyntaxKind.ThisKeyword) { found = "this"; return; }
    if (ts.isAwaitExpression(n)) { found = "await"; return; }
    if (ts.isYieldExpression(n)) { found = "yield"; return; }
    if (ts.isTaggedTemplateExpression(n)) { found = "tagged template"; return; }
    if (ts.isObjectLiteralExpression(n)) { found = "object literal"; return; }
    if (ts.isArrayLiteralExpression(n)) { found = "array literal"; return; }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) { found = "nested function"; return; }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return; // a jsx cell
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

type Admitted =
  | { ok: true; body: ts.Expression; parameter: string }
  | { ok: false; reason: string };

/** §3.9 R2 — the four purity clauses, each independently reported. */
function admitCallback(node: ts.Expression): Admitted {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    return { ok: false, reason: "callback is not a function expression" };
  }
  const fn = node;
  const modifiers = ts.canHaveModifiers(fn) ? (ts.getModifiers(fn) ?? []) : [];
  if (modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
    return { ok: false, reason: "purity clause 4: the callback is async" };
  }
  if (ts.isFunctionExpression(fn) && fn.asteriskToken !== undefined) {
    return { ok: false, reason: "purity clause 4: the callback is a generator" };
  }
  if (fn.parameters.length !== 1) {
    return { ok: false, reason: `purity clause 1: ${fn.parameters.length} parameters, expected exactly one` };
  }
  const first = fn.parameters[0]!;
  if (!ts.isIdentifier(first.name)) {
    return { ok: false, reason: "purity clause 1: the parameter is not a plain identifier" };
  }
  let body: ts.Expression;
  if (ts.isBlock(fn.body)) {
    const statements = fn.body.statements;
    const only = statements[0];
    if (statements.length !== 1 || only === undefined || !ts.isReturnStatement(only) || only.expression === undefined) {
      return { ok: false, reason: "purity clause 2: the body is neither a single expression nor exactly { return e; }" };
    }
    body = only.expression;
  } else {
    body = fn.body;
  }
  const violation = outOfGrammarReason(body);
  if (violation !== null) {
    return { ok: false, reason: `purity clause 3: the body contains ${violation}` };
  }
  const { nodes, depth } = measureBody(body);
  if (nodes > NODE_BUDGET) {
    return { ok: false, reason: `work limit: ${nodes} counted nodes exceeds the node budget ${NODE_BUDGET}` };
  }
  if (depth > DEPTH_LIMIT) {
    return { ok: false, reason: `work limit: depth ${depth} exceeds the depth limit ${DEPTH_LIMIT}` };
  }
  return { ok: true, body, parameter: first.name.text };
}

const UNKNOWN_PRIM: Prim = { t: "unknown" };

/** §3.10 R2 — truthiness is DEFINED: `{n}` falsy iff n === 0; str/bool/null/undef decided; unknown propagates. */
function truthiness(p: Prim): boolean | "unknown" {
  switch (p.t) {
    case "num": return p.v !== 0;
    case "str": return p.v.length > 0;
    case "bool": return p.v;
    case "null": case "undef": return false;
    default: return "unknown";
  }
}

/** A `Cell` lifted to the `Prim` a callback parameter receives (§3.17 R4: total, identity on the six). */
function cellToPrim(cell: Cell): Prim {
  return cell.t === "arr" ? UNKNOWN_PRIM : cell;
}

function numeric(p: Prim): number | null {
  return p.t === "num" ? p.v : null;
}

/** §3.13 R3 + §3.10 R2 — the callback mini-evaluator. No source is executed. */
function evalPrim(node: ts.Expression, parameter: string, argument: Prim): Prim {
  if (ts.isParenthesizedExpression(node)) return evalPrim(node.expression, parameter, argument);
  if (ts.isNumericLiteral(node)) {
    const v = Number(node.text);
    return Number.isFinite(v) ? { t: "num", v } : UNKNOWN_PRIM;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { t: "str", v: node.text };
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { t: "bool", v: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { t: "bool", v: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { t: "null" };
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return { t: "jsx" };                       // §5.2 R2 — the JSX model, in this round
  }
  if (ts.isIdentifier(node)) {
    if (node.text === parameter) return argument;
    if (node.text === "undefined") return { t: "undef" };
    return UNKNOWN_PRIM;
  }
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const part = evalPrim(span.expression, parameter, argument);
      if (part.t === "num") out += String(part.v);
      else if (part.t === "str") out += part.v;
      else if (part.t === "bool") out += String(part.v);
      else if (part.t === "null") out += "null";
      else if (part.t === "undef") out += "undefined";
      else return UNKNOWN_PRIM;
      out += span.literal.text;
    }
    return { t: "str", v: out };
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evalPrim(node.operand, parameter, argument);
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      const t = truthiness(operand);
      return t === "unknown" ? UNKNOWN_PRIM : { t: "bool", v: !t };
    }
    if (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) {
      // §3.17 R4: unary conversion READS the retained payload, so `+"3"` is exact.
      let v: number | null = null;
      if (operand.t === "num") v = operand.v;
      else if (operand.t === "str") { const n = Number(operand.v); v = Number.isFinite(n) ? n : null; }
      else if (operand.t === "bool") v = operand.v ? 1 : 0;
      else if (operand.t === "null") v = 0;
      if (v === null) return UNKNOWN_PRIM;
      const signed = node.operator === ts.SyntaxKind.MinusToken ? -v : v;
      return Number.isFinite(signed) ? { t: "num", v: signed } : UNKNOWN_PRIM;
    }
    return UNKNOWN_PRIM;
  }
  if (ts.isConditionalExpression(node)) {
    const t = truthiness(evalPrim(node.condition, parameter, argument));
    if (t === "unknown") return UNKNOWN_PRIM;
    return evalPrim(t ? node.whenTrue : node.whenFalse, parameter, argument);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      const left = evalPrim(node.left, parameter, argument);
      const t = truthiness(left);
      if (t === "unknown") return UNKNOWN_PRIM;
      const takeLeft = op === ts.SyntaxKind.AmpersandAmpersandToken ? !t : t;
      // §3.10 R2: `&&`/`||` return the OPERAND VALUE, not a boolean.
      return takeLeft ? left : evalPrim(node.right, parameter, argument);
    }
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      const left = evalPrim(node.left, parameter, argument);
      if (left.t === "unknown") return UNKNOWN_PRIM;
      return left.t === "null" || left.t === "undef" ? evalPrim(node.right, parameter, argument) : left;
    }
    const left = evalPrim(node.left, parameter, argument);
    const right = evalPrim(node.right, parameter, argument);
    if (left.t === "unknown" || right.t === "unknown") return UNKNOWN_PRIM;
    const arithmetic = op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.MinusToken ||
      op === ts.SyntaxKind.AsteriskToken || op === ts.SyntaxKind.SlashToken || op === ts.SyntaxKind.PercentToken;
    if (arithmetic) {
      if (op === ts.SyntaxKind.PlusToken && (left.t === "str" || right.t === "str")) {
        const render = (p: Prim): string | null =>
          p.t === "str" ? p.v : p.t === "num" ? String(p.v) : p.t === "bool" ? String(p.v) : null;
        const l = render(left); const r = render(right);
        return l === null || r === null ? UNKNOWN_PRIM : { t: "str", v: l + r };
      }
      const l = numeric(left); const r = numeric(right);
      // §3.10 R2's B2 fix: a non-numeric operand under arithmetic is UNKNOWN, never NONNUMBER.
      if (l === null || r === null) return UNKNOWN_PRIM;
      const v = op === ts.SyntaxKind.PlusToken ? l + r
        : op === ts.SyntaxKind.MinusToken ? l - r
        : op === ts.SyntaxKind.AsteriskToken ? l * r
        : op === ts.SyntaxKind.SlashToken ? l / r : l % r;
      // §3.17 R4: any non-finite numeric result is `unknown`.
      return Number.isFinite(v) ? { t: "num", v } : UNKNOWN_PRIM;
    }
    const comparison =
      op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
    if (comparison) {
      const bothNum = left.t === "num" && right.t === "num";
      const bothStr = left.t === "str" && right.t === "str";
      if (!bothNum && !bothStr) return UNKNOWN_PRIM;
      const l = left.t === "num" ? left.v : (left as { t: "str"; v: string }).v;
      const r = right.t === "num" ? right.v : (right as { t: "str"; v: string }).v;
      const v = op === ts.SyntaxKind.LessThanToken ? l < r
        : op === ts.SyntaxKind.LessThanEqualsToken ? l <= r
        : op === ts.SyntaxKind.GreaterThanToken ? l > r
        : op === ts.SyntaxKind.GreaterThanEqualsToken ? l >= r
        : op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken ? l === r
        : l !== r;
      return { t: "bool", v };
    }
    return UNKNOWN_PRIM;
  }
  return UNKNOWN_PRIM;
}

/** An integer-literal argument (with optional unary sign), or null. */
function integerArg(node: ts.Expression): number | null {
  if (ts.isNumericLiteral(node)) { const v = Number(node.text); return Number.isInteger(v) ? v : null; }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    const base = Number(node.operand.text);
    if (!Number.isInteger(base)) return null;
    if (node.operator === ts.SyntaxKind.MinusToken) return -base;
    if (node.operator === ts.SyntaxKind.PlusToken) return base;
  }
  return null;
}

/** §3.17 R4 — SameValueZero over cells; decidable only when every cell is a primitive value. */
function dedupeSameValueZero(cells: readonly Cell[]): readonly Cell[] | null {
  const keys: string[] = [];
  const out: Cell[] = [];
  for (const cell of cells) {
    let key: string;
    switch (cell.t) {
      case "num": key = `n:${cell.v === 0 ? 0 : cell.v}`; break;   // +0 and -0 are one element
      case "str": key = `s:${cell.v}`; break;
      case "bool": key = `b:${cell.v}`; break;
      case "null": key = "null"; break;
      case "undef": key = "undef"; break;
      default: return null;                                        // jsx / arr / unknown: identity unavailable
    }
    if (!keys.includes(key)) { keys.push(key); out.push(cell); }
  }
  return out;
}

const ELEMENT_RETURNING = ["find", "findLast", "at", "pop", "shift"];
const BOOLEAN_RETURNING = ["includes", "some", "every"];
const NUMBER_RETURNING = ["indexOf", "lastIndexOf", "findIndex"];
const UNSUPPORTED_ARRAY = ["concat", "flat", "fill", "with", "toSorted", "toReversed", "copyWithin"];

/** §3.15 R3's element-returning rule: NOT_ARRAY only if every cell is a known number. */
function elementReturn(cells: readonly Cell[]): Value {
  return cells.every((c) => c.t === "num") ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;
}

/** Evaluate one admitted callback over one cell. The result is always a `Prim`. */
function mapCell(admitted: { body: ts.Expression; parameter: string }, cell: Cell): Prim {
  return evalPrim(admitted.body, admitted.parameter, cellToPrim(cell));
}

/** flatMap's admitted body shapes: `[e]`, `[]`, `c ? [e] : []` (either branch order). */
function flatMapCells(callback: ts.Expression, cells: readonly Cell[]): Value {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return UNKNOWN_VALUE;
  const fn = callback;
  if (fn.parameters.length !== 1) return UNKNOWN_VALUE;
  const nameNode = fn.parameters[0]!.name;
  if (!ts.isIdentifier(nameNode)) return UNKNOWN_VALUE;
  const parameter = nameNode.text;
  const body = ts.isBlock(fn.body) ? undefined : fn.body;
  if (body === undefined) return UNKNOWN_VALUE;
  const branchCells = (expr: ts.Expression, cell: Cell): Cell[] | null => {
    if (!ts.isArrayLiteralExpression(expr)) return null;
    if (expr.elements.length === 0) return [];
    if (expr.elements.length !== 1) return null;
    const inner = expr.elements[0]!;
    if (outOfGrammarReason(inner) !== null) return null;
    return [evalPrim(inner, parameter, cellToPrim(cell))];
  };
  const out: Cell[] = [];
  for (const cell of cells) {
    let produced: Cell[] | null;
    if (ts.isConditionalExpression(body)) {
      const t = truthiness(evalPrim(body.condition, parameter, cellToPrim(cell)));
      if (t === "unknown") return UNKNOWN_VALUE;
      produced = branchCells(t ? body.whenTrue : body.whenFalse, cell);
    } else {
      produced = branchCells(body, cell);
    }
    if (produced === null) return UNKNOWN_VALUE;
    out.push(...produced);
  }
  return exact(out);
}

/**
 * Apply a named member to a value. `call` is the enclosing CallExpression when
 * the member is the CALLEE (§3.18 R4); undefined for a bare member read.
 */
function applyMember(receiver: Value, name: string, call: ts.CallExpression | undefined): Value {
  // §3.15 R3 continuation: any operation applied to NOT_ARRAY or UNKNOWN is UNKNOWN.
  if (receiver.kind !== "EXACT") return UNKNOWN_VALUE;
  const cells = receiver.cells;

  if (receiver.coll === "set") {
    if (name === "has") return call === undefined ? UNKNOWN_VALUE : NOT_ARRAY_VALUE;
    if (name === "size") return call === undefined ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;
    return UNKNOWN_VALUE;                       // array methods over a Set are not modelled
  }

  if (call === undefined) {
    // A non-call member read: only `length` is modelled.
    return name === "length" ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;
  }

  const args = call.arguments;
  if (BOOLEAN_RETURNING.includes(name) || NUMBER_RETURNING.includes(name) || name === "join" || name === "forEach") {
    return NOT_ARRAY_VALUE;
  }
  if (ELEMENT_RETURNING.includes(name)) return elementReturn(cells);
  if (name === "reduce" || name === "reduceRight") return UNKNOWN_VALUE;
  if (UNSUPPORTED_ARRAY.includes(name)) return UNKNOWN_VALUE;

  if (name === "slice" || name === "splice") {
    if (args.length > 2) return UNKNOWN_VALUE;
    const parsed: number[] = [];
    for (const a of args) { const v = integerArg(a); if (v === null) return UNKNOWN_VALUE; parsed.push(v); }
    const copy = [...cells];
    if (name === "slice") return exact(copy.slice(...(parsed as [number?, number?])));
    // splice returns the REMOVED cells
    const start = parsed.length > 0 ? parsed[0]! : 0;
    const count = parsed.length > 1 ? parsed[1]! : copy.length;
    const from = start < 0 ? Math.max(copy.length + start, 0) : Math.min(start, copy.length);
    return exact(copy.slice(from, from + Math.max(count, 0)));
  }
  if (name === "reverse") return args.length === 0 ? exact([...cells].reverse()) : UNKNOWN_VALUE;
  if (name === "sort") {
    if (args.length !== 0) return UNKNOWN_VALUE;
    if (!cells.every((c) => c.t === "num")) return UNKNOWN_VALUE;
    return exact([...cells].sort((a, b) =>
      String((a as { v: number }).v) < String((b as { v: number }).v) ? -1
      : String((a as { v: number }).v) > String((b as { v: number }).v) ? 1 : 0));
  }
  if (name === "map" || name === "filter" || name === "flatMap") {
    if (args.length !== 1) return UNKNOWN_VALUE;
    const callback = args[0]!;
    if (name === "flatMap") return flatMapCells(callback, cells);
    const admitted = admitCallback(callback);
    if (!admitted.ok) return UNKNOWN_VALUE;
    if (name === "map") return exact(cells.map((c) => mapCell(admitted, c)));
    const kept: Cell[] = [];
    for (const cell of cells) {
      const t = truthiness(mapCell(admitted, cell));
      if (t === "unknown") return UNKNOWN_VALUE;
      if (t) kept.push(cell);
    }
    return exact(kept);
  }
  return UNKNOWN_VALUE;
}

/** Why an admitted-callback operation was rejected, for the `reason` field. */
function callbackRejection(call: ts.CallExpression | undefined, name: string): string | null {
  if (call === undefined) return null;
  if (name !== "map" && name !== "filter") return null;
  if (call.arguments.length !== 1) return null;
  const admitted = admitCallback(call.arguments[0]!);
  return admitted.ok ? null : admitted.reason;
}

/** §3.16 R3 — the ownership walk, first match wins, each row advancing the consumed span. */
function ownershipWalk(
  literal: ts.ArrayLiteralExpression,
  file: ts.SourceFile
): { value: Value; consumedEnd: number; reason: string } {
  let value: Value = exact(ownCells(literal));
  let node: ts.Node = literal;
  let consumedEnd = literal.getEnd();
  let reason = "literal bound directly; no operation applied";
  let guard = 0;

  for (;;) {
    if ((guard += 1) > 256) return { value: UNKNOWN_VALUE, consumedEnd, reason: "walk guard exceeded" };
    const parent: ts.Node | undefined = node.parent;
    if (parent === undefined || isTerminalOwner(parent)) {
      if (parent !== undefined && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ||
          ts.isReturnStatement(parent) || ts.isJsxExpression(parent))) {
        consumedEnd = parent.getEnd();
      }
      return { value, consumedEnd, reason };
    }

    // transparent wrappers
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
      node = parent; consumedEnd = parent.getEnd();
      reason = "transparent wrapper"; continue;
    }

    // the comma operator: right operand transparent, left operand discarded
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      consumedEnd = parent.getEnd();
      if (parent.right === node) { node = parent; reason = "comma operator: candidate is the right operand"; continue; }
      return { value: NOT_ARRAY_VALUE, consumedEnd, reason: "comma operator: the candidate's value is discarded" };
    }

    // a member whose RECEIVER is the candidate
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) {
      const name = ts.isPropertyAccessExpression(parent)
        ? parent.name.text
        : (ts.isStringLiteral(parent.argumentExpression) ? parent.argumentExpression.text : null);
      const grand: ts.Node | undefined = parent.parent;
      // §3.18 R4: a modelled invocation requires the MEMBER to be the CALLEE.
      const call = grand !== undefined && ts.isCallExpression(grand) && grand.expression === parent ? grand : undefined;
      if (name === null) {
        // computed numeric index access: element-returning
        const numericIndex = ts.isElementAccessExpression(parent) && integerArg(parent.argumentExpression) !== null;
        value = numericIndex && value.kind === "EXACT" ? elementReturn(value.cells) : UNKNOWN_VALUE;
        consumedEnd = (call ?? parent).getEnd();
        node = call ?? parent;
        reason = numericIndex ? "numeric index access" : "computed member is not a string literal";
        continue;
      }
      const rejection = callbackRejection(call, name);
      value = applyMember(value, name, call);
      consumedEnd = (call ?? parent).getEnd();
      node = call ?? parent;
      reason = rejection !== null ? `${name}: ${rejection}` : `applied ${name}`;
      continue;
    }

    // new Set(x) / new Map(x), sole argument
    if (ts.isNewExpression(parent) && parent.arguments !== undefined && parent.arguments.length === 1 &&
        parent.arguments[0] === node && ts.isIdentifier(parent.expression)) {
      consumedEnd = parent.getEnd();
      if (parent.expression.text === "Set") {
        if (value.kind !== "EXACT") { value = UNKNOWN_VALUE; reason = "new Set over a non-exact value"; }
        else {
          const deduped = dedupeSameValueZero(value.cells);
          value = deduped === null ? UNKNOWN_VALUE : exact(deduped, "set");
          reason = deduped === null ? "new Set: object identity is unavailable for a jsx/arr/unknown cell"
                                    : "new Set: SameValueZero dedupe";
        }
      } else { value = UNKNOWN_VALUE; reason = `new ${parent.expression.text} is not modelled`; }
      node = parent; continue;
    }

    // Array.from(x) / Object.freeze(x), sole argument
    if (ts.isCallExpression(parent) && parent.arguments.length === 1 && parent.arguments[0] === node &&
        ts.isPropertyAccessExpression(parent.expression) && ts.isIdentifier(parent.expression.expression)) {
      const owner = parent.expression.expression.text;
      const member = parent.expression.name.text;
      if (owner === "Array" && member === "from") {
        value = value.kind === "EXACT" ? exact(value.cells, "array") : UNKNOWN_VALUE;
        consumedEnd = parent.getEnd(); node = parent; reason = "Array.from: converted to an array"; continue;
      }
      if (owner === "Object" && member === "freeze") {
        consumedEnd = parent.getEnd(); node = parent; reason = "Object.freeze: identity"; continue;
      }
    }

    // a spread element inside an enclosing array literal
    if (ts.isSpreadElement(parent) && parent.parent !== undefined && ts.isArrayLiteralExpression(parent.parent)) {
      const enclosing = parent.parent;
      const folded: Cell[] = [];
      let ok = true;
      for (const element of enclosing.elements) {
        if (element === parent) {
          if (value.kind !== "EXACT") { ok = false; break; }
          folded.push(...value.cells);
        } else if (ts.isSpreadElement(element)) { ok = false; break; }
        else {
          const prim = literalPrim(element);
          if (prim.t === "unknown") { ok = false; break; }
          folded.push(prim);
        }
      }
      value = ok ? exact(folded) : UNKNOWN_VALUE;
      consumedEnd = enclosing.getEnd(); node = enclosing;
      reason = ok ? "spread folded into the enclosing array" : "spread: a sibling is not foldable";
      continue;
    }

    // the candidate is a plain element of an enclosing array literal -> an { arr } cell
    if (ts.isArrayLiteralExpression(parent) && parent.elements.some((e) => e === node)) {
      const cells: Cell[] = parent.elements.map((e) => (e === node ? { t: "arr", value } : literalPrim(e)));
      value = exact(cells); consumedEnd = parent.getEnd(); node = parent;
      reason = "nested as an { arr } cell of the enclosing array"; continue;
    }

    // a destructuring declaration
    if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isArrayBindingPattern(parent.name)) {
      consumedEnd = parent.getEnd();
      return { value: bindingValue(parent.name, value), consumedEnd, reason: "array binding pattern" };
    }

    // any other CallExpression where the candidate is an ARGUMENT: the call result is not the argument
    if (ts.isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
      return { value: UNKNOWN_VALUE, consumedEnd: parent.getEnd(),
               reason: "the candidate is an argument to an unmodelled call" };
    }

    return { value: UNKNOWN_VALUE, consumedEnd: parent.getEnd(), reason: "unmodelled owner" };
  }
}

/**
 * §3.16 R3 — positions counted over ALL elements including elisions; `...rest`
 * binds from its index; a non-rest binding binds that cell, opening `{ arr }`.
 * One candidate, one verdict: RULED if ANY bound output is ruled, else
 * UNDETERMINED if any is unknown, else OTHER.
 */
function bindingValue(pattern: ts.ArrayBindingPattern, value: Value): Value {
  if (value.kind !== "EXACT") return UNKNOWN_VALUE;
  const cells = value.cells;
  const outputs: Value[] = [];
  pattern.elements.forEach((element, index) => {
    if (ts.isOmittedExpression(element)) return;
    if (element.dotDotDotToken !== undefined) { outputs.push(exact(cells.slice(index))); return; }
    const cell = cells[index];
    if (cell === undefined) { outputs.push(UNKNOWN_VALUE); return; }
    outputs.push(cell.t === "arr" ? cell.value : exact([cell]));
  });
  if (outputs.length === 0) return UNKNOWN_VALUE;
  if (outputs.some((o) => verdictOf(o) === "RULED")) {
    return outputs.find((o) => verdictOf(o) === "RULED")!;
  }
  const unknown = outputs.find((o) => verdictOf(o) === "UNDETERMINED");
  return unknown ?? outputs[0]!;
}

/**
 * Owners at which evaluation STOPS and the computed value is the bound value
 * (plan §3.16 R3's terminal rows).
 */
function isTerminalOwner(parent: ts.Node | undefined): boolean {
  if (parent === undefined) return true;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return true;
  if (ts.isPropertyAssignment(parent)) return true;
  if (ts.isReturnStatement(parent)) return true;
  if (ts.isJsxExpression(parent)) return true;
  if (ts.isExpressionStatement(parent)) return true;
  if (parent.kind === ts.SyntaxKind.SourceFile) return true;
  return false;
}

/**
 * The ownership walk from a candidate literal (plan §3.16 R3).
 *
 * ROUND-2 HISTORY: this function previously held the declared semantic stub
 * ("every operation and wrapper yields UNKNOWN, rule-1 precedence retained"),
 * whose RED frame is recorded in logs/t1-oracle-evaluator/r2/05-stub-RED.log.
 * It now delegates to the real walk.
 */
function evaluateFrom(
  node: ts.ArrayLiteralExpression,
  file: ts.SourceFile
): { value: Value; consumedEnd: number; reason: string } {
  return ownershipWalk(node, file);
}

/**
 * §1.12 R4 — the evaluated record. `candidatesOf` stays discovery-only; this
 * function adds the consumed span, the value, the verdict and the reason.
 * Returns `[]` when the parse fails.
 */
export function evaluatedCandidatesOf(path: string, source: string): EvaluatedCandidate[] {
  const parsed = parseModule(path, source);
  if (!parsed.ok) return [];
  const file = parsed.file;
  const discovered = candidatesOf(path, source);
  const byStart = new Map<number, ts.ArrayLiteralExpression>();
  const collect = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node)) byStart.set(node.getStart(file), node);
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(file, collect);

  return discovered.map((candidate) => {
    const node = byStart.get(candidate.start);
    if (node === undefined) {
      return { ...candidate, consumedStart: candidate.start, consumedEnd: candidate.end,
               value: { kind: "UNKNOWN" }, verdict: "UNDETERMINED", reason: "node not recovered" };
    }
    const cells = ownCells(node);
    // §3.2 — RULE 1 FIRST: the literal IS the domain; the chain is never consulted.
    if (ruleOneFires(cells)) {
      return { ...candidate, consumedStart: candidate.start, consumedEnd: candidate.end,
               value: { kind: "EXACT", coll: "array", cells }, verdict: "RULED",
               reason: "rule 1: the candidate's own distinct set is the ruled domain" };
    }
    const { value, consumedEnd, reason } = evaluateFrom(node, file);
    return { ...candidate, consumedStart: candidate.start, consumedEnd, value,
             verdict: verdictOf(value), reason };
  });
}

/**
 * §1.10 R3 — PARSER ONLY. On a failed parse it returns EXACTLY ONE conservative
 * `INCONCLUSIVE` record; it never fabricates a `DOMAIN_ENUMERATION`.
 *
 * ROUND 1: a successful parse yields `[]`. DOMAIN emission needs evaluation
 * (round 2) and the rule-1 discriminator (round 3); until then the three bare
 * DOMAIN controls stay on the old emitter's `WHOLE_DOMAIN` fallback (§5.6 R4).
 */
export function domainSites(path: string, source: string): Site[] {
  const parsed = parseModule(path, source);
  if (parsed.ok) return [];
  return inconclusiveFor(path, parsed.diagnostics);
}

/** The one conservative record a rejected parse produces. Mutation K27 empties this. */
function inconclusiveFor(
  path: string,
  diagnostics: readonly { readonly line: number; readonly message: string }[]
): Site[] {
  const first = diagnostics[0];
  const message = first ? first.message : "unparsed";
  return [{ kind: "INCONCLUSIVE", line: first ? first.line : 1, text: message, path, diagnostic: message }];
}

/* ------------------------------------------------------------------------- *
 * The CEILING arms — TEXT ONLY, extracted unchanged from the oracle test.
 * These NEVER parse. Their inherited regex limitation (F1) is deliberately
 * preserved, not repaired, in this round.
 * ------------------------------------------------------------------------- */

const MENTIONS_A_DEPTH = /depth/i;
const BARE_FIVE = /(?<![\w.$])5(?![\w.$])/;
const SIX_AS_EXCLUSIVE_BOUND = /(?:[<>]=?\s*6(?![\w.$])|\.(?:lt|gte)\(\s*6\s*\))/;
const WHOLE_DOMAIN = /\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b/;

/** The two predicates applied to one candidate text. Unchanged by this extraction. */
export function kindOf(candidate: string): DuplicateKind | null {
  if (MENTIONS_A_DEPTH.test(candidate) && (BARE_FIVE.test(candidate) || SIX_AS_EXCLUSIVE_BOUND.test(candidate))) {
    return "DEPTH_BOUND_LITERAL";
  }
  return WHOLE_DOMAIN.test(candidate) ? "DOMAIN_ENUMERATION" : null;
}

/** The ceiling-literal arm; its WHOLE_DOMAIN fallback is removed in ROUND 3, not here. */
export function kindOfCeilingLiteral(candidate: string): DuplicateKind | null {
  if (MENTIONS_A_DEPTH.test(candidate) && BARE_FIVE.test(candidate)) return "DEPTH_BOUND_LITERAL";
  return WHOLE_DOMAIN.test(candidate) ? "DOMAIN_ENUMERATION" : null;
}

/** The exclusive-bound arm, applied to conjunct units. */
export function kindOfExclusiveBound(candidate: string): DuplicateKind | null {
  return MENTIONS_A_DEPTH.test(candidate) && SIX_AS_EXCLUSIVE_BOUND.test(candidate)
    ? "DEPTH_BOUND_LITERAL"
    : null;
}

/** DECLARATION UNITS — the layout-independent half of the oracle. Extracted unchanged. */
export function declarationUnits(
  source: string,
  splitConjuncts = false
): { readonly line: number; readonly text: string }[] {
  const units: { line: number; text: string }[] = [];
  let buffer = "";
  let bracketDepth = 0;
  let startDepth = 0;
  let line = 1;
  let startLine = 0;
  const flush = (): void => {
    const text = buffer.replace(/\s+/g, " ").trim();
    if (text) units.push({ line: startLine || 1, text });
    buffer = "";
    startLine = 0;
  };
  const begin = (): void => { flush(); startDepth = bracketDepth; };
  const mark = (): void => { if (startLine === 0) startLine = line; };
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "\n") { line += 1; buffer += " "; index += 1; continue; }
    if (char === "/" && next === "/") {
      let end = index;
      while (end < source.length && source[end] !== "\n") end += 1;
      buffer += " "; index = end; continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close < 0 ? source.length : close + 2;
      line += (source.slice(index, end).match(/\n/g) ?? []).length;
      buffer += " "; index = end; continue;
    }
    if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") { end += 2; continue; }
        if (source[end] === char) { end += 1; break; }
        if (source[end] === "\n") break;
        end += 1;
      }
      mark(); buffer += source.slice(index, end); index = end; continue;
    }
    if (char === "`") {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") { end += 2; continue; }
        if (source[end] === "`") { end += 1; break; }
        if (source[end] === "$" && source[end + 1] === "{") {
          let nested = 1; let scan = end + 2;
          while (scan < source.length && nested > 0) {
            if (source[scan] === "{") nested += 1;
            else if (source[scan] === "}") nested -= 1;
            scan += 1;
          }
          end = scan; continue;
        }
        if (source[end] === "\n") line += 1;
        end += 1;
      }
      mark(); buffer += source.slice(index, end).replace(/\s+/g, " "); index = end; continue;
    }
    if (char === "{") { bracketDepth += 1; buffer += " "; begin(); index += 1; continue; }
    if (char === "}") { bracketDepth -= 1; buffer += " "; begin(); index += 1; continue; }
    if (char === "(" || char === "[") { mark(); bracketDepth += 1; buffer += char; index += 1; continue; }
    if (char === ")" || char === "]") {
      bracketDepth -= 1;
      if (bracketDepth < startDepth) { begin(); index += 1; continue; }
      mark(); buffer += char; index += 1; continue;
    }
    if ((char === ";" || char === ",") && bracketDepth === startDepth) { begin(); index += 1; continue; }
    if (splitConjuncts && next !== undefined && char === next
      && (char === "&" || char === "|" || char === "?")) { begin(); index += 2; continue; }
    mark(); buffer += char; index += 1;
  }
  flush();
  return units;
}

/**
 * §1.9 R3 — the fragment harness. TEXT ONLY; never parses; never yields
 * INCONCLUSIVE. Behaviour is identical to the oracle's inherited emitter.
 */
export function ceilingSites(source: string): Site[] {
  const byAddress = new Map<string, Site>();
  const record = (kind: DuplicateKind | null, line: number, text: string): void => {
    if (kind === null) return;
    const address = `${line}:${kind}`;
    if (!byAddress.has(address)) byAddress.set(address, { kind, line, text });
  };
  source.split("\n").forEach((raw, index) => record(kindOfCeilingLiteral(raw), index + 1, raw.trim()));
  for (const unit of declarationUnits(source)) record(kindOfCeilingLiteral(unit.text), unit.line, unit.text);
  for (const unit of declarationUnits(source, true)) record(kindOfExclusiveBound(unit.text), unit.line, unit.text);
  return [...byAddress.values()].sort((left, right) => left.line - right.line);
}

/** §1.9 R3 — `ceilingSites` ∪ `domainSites`, sorted. In round 1 the union adds nothing on a clean parse. */
export function duplicateBoundSites(path: string, source: string): Site[] {
  return [...ceilingSites(source), ...domainSites(path, source)].sort((left, right) => left.line - right.line);
}
