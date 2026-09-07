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
 * ROUND 2 — THE COMPLETE DECLARED EVALUATOR  (rework after codex r2 B1–B11)
 *
 * plan §3.9 R2 (purity gate) · §3.10 R2 (callback grammar, per-operation
 * results) · §3.13 R3 (primitive contract) · §3.15 R3 (operations by return
 * contract) · §3.16 R3 (ownership walk) · §3.17 R4 (cells ARE primitives) ·
 * §3.18 R4 (a modelled member invocation requires the member to be the CALLEE).
 *
 * The evaluator NEVER executes source. It evaluates the syntax tree over the
 * finite known cells, under the two recorded work limits below.
 * ========================================================================== */

/** The two work limits, recorded here as the plan requires the worker to do. */
export const NODE_BUDGET = 64;
export const DEPTH_LIMIT = 32;

const UNKNOWN_VALUE: Value = { kind: "UNKNOWN" };
const NOT_ARRAY_VALUE: Value = { kind: "NOT_ARRAY" };
const exact = (cells: readonly Cell[], coll: "array" | "set" = "array"): Value =>
  ({ kind: "EXACT", coll, cells });

/**
 * B4 — the work limits are measured on the ORIGINAL callback body node, before
 * any return expression is extracted: the body is depth 0 and each
 * `ts.forEachChild` level adds one. A return-only block therefore counts its
 * Block and ReturnStatement, as the recorded semantics require.
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

/** The binary operators §3.10 R2 declares. */
const DECLARED_BINARY = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken
]);

/** The unary operators §3.10 R2 declares. */
const DECLARED_UNARY = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.ExclamationToken
]);

function isJsxAtom(node: ts.Node): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

/**
 * B3 — POSITIVE admission of the declared expression grammar. Every node must be
 * one of the declared forms; anything else names itself and rejects the WHOLE
 * operation, including inside an untaken conditional branch. JSX is ATOMIC: it
 * is a `jsx` cell and its children are not descended into.
 *
 * `arrayShape` admits flatMap's narrowly declared exception at the positions
 * where flatMap allows it (the body, or a conditional branch of the body).
 */
function admitExpression(node: ts.Expression, arrayShape: boolean): string | null {
  if (isJsxAtom(node)) return null;                       // atomic, not descended
  if (ts.isParenthesizedExpression(node)) return admitExpression(node.expression, arrayShape);
  if (ts.isNumericLiteral(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) return null;                 // the parameter, or `undefined`
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      const bad = admitExpression(span.expression, false);
      if (bad !== null) return bad;
    }
    return null;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    if (!DECLARED_UNARY.has(node.operator)) return `the unary operator ${ts.SyntaxKind[node.operator]}`;
    return admitExpression(node.operand, false);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsToken ||
        (op >= ts.SyntaxKind.PlusEqualsToken && op <= ts.SyntaxKind.CaretEqualsToken)) return "assignment";
    if (!DECLARED_BINARY.has(op)) return `the binary operator ${ts.SyntaxKind[op]}`;
    return admitExpression(node.left, false) ?? admitExpression(node.right, false);
  }
  if (ts.isConditionalExpression(node)) {
    return admitExpression(node.condition, false)
      ?? admitExpression(node.whenTrue, arrayShape)
      ?? admitExpression(node.whenFalse, arrayShape);
  }
  if (arrayShape && ts.isArrayLiteralExpression(node)) {
    // flatMap's declared shapes: `[]` or `[e]`.
    if (node.elements.length === 0) return null;
    if (node.elements.length !== 1) return "a flatMap array literal with more than one element";
    const only = node.elements[0]!;
    if (ts.isSpreadElement(only)) return "a spread inside a flatMap array literal";
    return admitExpression(only, false);
  }
  if (ts.isCallExpression(node)) return "a call";
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return "member access";
  if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isAwaitExpression(node)) return "await";
  if (ts.isYieldExpression(node)) return "yield";
  if (ts.isTaggedTemplateExpression(node)) return "a tagged template";
  if (ts.isObjectLiteralExpression(node)) return "an object literal";
  if (ts.isArrayLiteralExpression(node)) return "an array literal";
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "a nested function";
  if (ts.isPostfixUnaryExpression(node)) return `the postfix operator ${ts.SyntaxKind[node.operator]}`;
  if (ts.isVoidExpression(node)) return "void";
  if (ts.isTypeOfExpression(node)) return "typeof";
  if (ts.isSpreadElement(node)) return "a spread";
  return `the unsupported syntax ${ts.SyntaxKind[node.kind]}`;
}

type Admitted =
  | { ok: true; body: ts.Expression; parameter: string }
  | { ok: false; reason: string };

/**
 * §3.9 R2 — the four purity clauses, each reported independently, PLUS the two
 * recorded work limits measured on the original body (B4).
 *
 * B1: clause 1 rejects an initialiser, a rest token, an optional marker and any
 * binding pattern — only a plain identifier is a parameter this grammar models.
 * B2: `arrayShape` routes flatMap through this same gate.
 */
function admitCallback(node: ts.Expression, arrayShape = false): Admitted {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    return { ok: false, reason: "the callback is not a function expression" };
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
  if (first.dotDotDotToken !== undefined) {
    return { ok: false, reason: "purity clause 1: the parameter is a rest parameter" };
  }
  if (first.initializer !== undefined) {
    return { ok: false, reason: "purity clause 1: the parameter has a default initialiser" };
  }
  if (first.questionToken !== undefined) {
    return { ok: false, reason: "purity clause 1: the parameter is optional" };
  }
  if (!ts.isIdentifier(first.name)) {
    return { ok: false, reason: "purity clause 1: the parameter is a binding pattern, not a plain identifier" };
  }
  // B4: measure the ORIGINAL body, before extracting any return expression.
  const { nodes, depth } = measureBody(fn.body);
  if (nodes > NODE_BUDGET) {
    return { ok: false, reason: `work limit: ${nodes} counted nodes exceeds the node budget ${NODE_BUDGET}` };
  }
  if (depth > DEPTH_LIMIT) {
    return { ok: false, reason: `work limit: depth ${depth} exceeds the depth limit ${DEPTH_LIMIT}` };
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
  const violation = admitExpression(body, arrayShape);
  if (violation !== null) {
    return { ok: false, reason: `purity clause 3: the body contains ${violation}` };
  }
  return { ok: true, body, parameter: first.name.text };
}

const UNKNOWN_PRIM: Prim = { t: "unknown" };

/**
 * §3.10 R2 — truthiness is DEFINED.
 * B5: `ToBoolean(jsx)` is **true** — a JSX element is an object.
 */
function truthiness(p: Prim): boolean | "unknown" {
  switch (p.t) {
    case "num": return p.v !== 0;
    case "str": return p.v.length > 0;
    case "bool": return p.v;
    case "null": case "undef": return false;
    case "jsx": return true;
    default: return "unknown";
  }
}

/** §3.17 R4 — total, and the identity on the six primitive constructors. */
function cellToPrim(cell: Cell): Prim {
  return cell.t === "arr" ? UNKNOWN_PRIM : cell;
}

function numeric(p: Prim): number | null {
  return p.t === "num" ? p.v : null;
}

/**
 * B5 — exact string rendering for concatenation and template substitution.
 * `null` and `undefined` render; `jsx` and `unknown` do not (object coercion is
 * not available to this abstraction, and guessing is what produces a silent miss).
 */
function renderString(p: Prim): string | null {
  switch (p.t) {
    case "str": return p.v;
    case "num": return String(p.v);
    case "bool": return String(p.v);
    case "null": return "null";
    case "undef": return "undefined";
    default: return null;
  }
}

/** §3.13 R3 + §3.10 R2 — the callback mini-evaluator. No source is executed. */
function evalPrim(node: ts.Expression, parameter: string, argument: Prim): Prim {
  if (ts.isParenthesizedExpression(node)) return evalPrim(node.expression, parameter, argument);
  if (isJsxAtom(node)) return { t: "jsx" };
  if (ts.isNumericLiteral(node)) {
    const v = Number(node.text);
    return Number.isFinite(v) ? { t: "num", v } : UNKNOWN_PRIM;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { t: "str", v: node.text };
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { t: "bool", v: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { t: "bool", v: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { t: "null" };
  if (ts.isIdentifier(node)) {
    if (node.text === parameter) return argument;
    if (node.text === "undefined") return { t: "undef" };
    return UNKNOWN_PRIM;
  }
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const part = renderString(evalPrim(span.expression, parameter, argument));
      if (part === null) return UNKNOWN_PRIM;
      out += part + span.literal.text;
    }
    return { t: "str", v: out };
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evalPrim(node.operand, parameter, argument);
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      const t = truthiness(operand);
      return t === "unknown" ? UNKNOWN_PRIM : { t: "bool", v: !t };
    }
    let v: number | null = null;
    if (operand.t === "num") v = operand.v;
    else if (operand.t === "str") { const n = Number(operand.v); v = Number.isFinite(n) ? n : null; }
    else if (operand.t === "bool") v = operand.v ? 1 : 0;
    else if (operand.t === "null") v = 0;
    if (v === null) return UNKNOWN_PRIM;
    const signed = node.operator === ts.SyntaxKind.MinusToken ? -v : v;
    return Number.isFinite(signed) ? { t: "num", v: signed } : UNKNOWN_PRIM;
  }
  if (ts.isConditionalExpression(node)) {
    const t = truthiness(evalPrim(node.condition, parameter, argument));
    if (t === "unknown") return UNKNOWN_PRIM;
    // Only the SELECTED branch is evaluated; admission already examined both.
    return evalPrim(t ? node.whenTrue : node.whenFalse, parameter, argument);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      const left = evalPrim(node.left, parameter, argument);
      const t = truthiness(left);
      if (t === "unknown") return UNKNOWN_PRIM;
      const takeLeft = op === ts.SyntaxKind.AmpersandAmpersandToken ? !t : t;
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
        const l = renderString(left); const r = renderString(right);
        return l === null || r === null ? UNKNOWN_PRIM : { t: "str", v: l + r };
      }
      const l = numeric(left); const r = numeric(right);
      if (l === null || r === null) return UNKNOWN_PRIM;   // §3.10 R2's B2 fix
      const v = op === ts.SyntaxKind.PlusToken ? l + r
        : op === ts.SyntaxKind.MinusToken ? l - r
        : op === ts.SyntaxKind.AsteriskToken ? l * r
        : op === ts.SyntaxKind.SlashToken ? l / r : l % r;
      return Number.isFinite(v) ? { t: "num", v } : UNKNOWN_PRIM;
    }
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

/** §3.17 R4 — SameValueZero; decidable only when every cell is a primitive value. */
function dedupeSameValueZero(cells: readonly Cell[]): readonly Cell[] | null {
  const keys: string[] = [];
  const out: Cell[] = [];
  for (const cell of cells) {
    let key: string;
    switch (cell.t) {
      case "num": key = `n:${cell.v === 0 ? 0 : cell.v}`; break;
      case "str": key = `s:${cell.v}`; break;
      case "bool": key = `b:${cell.v}`; break;
      case "null": key = "null"; break;
      case "undef": key = "undef"; break;
      default: return null;
    }
    if (!keys.includes(key)) { keys.push(key); out.push(cell); }
  }
  return out;
}

const ELEMENT_RETURNING = ["find", "findLast", "at", "pop", "shift"];
const BOOLEAN_RETURNING = ["includes", "some", "every"];
const NUMBER_RETURNING = ["indexOf", "lastIndexOf", "findIndex"];
const UNSUPPORTED_ARRAY = ["concat", "flat", "fill", "with", "toSorted", "toReversed", "copyWithin"];

function elementReturn(cells: readonly Cell[]): Value {
  return cells.every((c) => c.t === "num") ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;
}

function mapCell(admitted: { body: ts.Expression; parameter: string }, cell: Cell): Prim {
  return evalPrim(admitted.body, admitted.parameter, cellToPrim(cell));
}

/**
 * B2 — flatMap runs through the SAME purity gate as map/filter, with the
 * narrowly declared array-shape exception. Admission has already examined the
 * whole syntax; here only the selected branch is visited.
 */
function flatMapCells(callback: ts.Expression, cells: readonly Cell[]): Value {
  const admitted = admitCallback(callback, /* arrayShape */ true);
  if (!admitted.ok) return UNKNOWN_VALUE;
  const { body, parameter } = admitted;
  const unwrap = (e: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(e) ? unwrap(e.expression) : e;
  const branchCells = (expr: ts.Expression, cell: Cell): Cell[] | null => {
    const target = unwrap(expr);
    if (!ts.isArrayLiteralExpression(target)) return null;
    if (target.elements.length === 0) return [];
    const inner = target.elements[0]!;
    return [evalPrim(inner, parameter, cellToPrim(cell))];
  };
  const out: Cell[] = [];
  for (const cell of cells) {
    const target = unwrap(body);
    let produced: Cell[] | null;
    if (ts.isConditionalExpression(target)) {
      const t = truthiness(evalPrim(target.condition, parameter, cellToPrim(cell)));
      if (t === "unknown") return UNKNOWN_VALUE;
      produced = branchCells(t ? target.whenTrue : target.whenFalse, cell);
    } else {
      produced = branchCells(target, cell);
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
  if (receiver.kind !== "EXACT") return UNKNOWN_VALUE;      // §3.15 continuation
  const cells = receiver.cells;

  if (receiver.coll === "set") {
    if (name === "has") return call === undefined ? UNKNOWN_VALUE : NOT_ARRAY_VALUE;
    if (name === "size") return call === undefined ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;
    return UNKNOWN_VALUE;
  }
  if (call === undefined) return name === "length" ? NOT_ARRAY_VALUE : UNKNOWN_VALUE;

  const args = call.arguments;
  if (BOOLEAN_RETURNING.includes(name) || NUMBER_RETURNING.includes(name) || name === "join" || name === "forEach") {
    return NOT_ARRAY_VALUE;
  }
  if (ELEMENT_RETURNING.includes(name)) return elementReturn(cells);
  if (name === "reduce" || name === "reduceRight") return UNKNOWN_VALUE;
  if (UNSUPPORTED_ARRAY.includes(name)) return UNKNOWN_VALUE;

  if (name === "slice") {
    if (args.length > 2) return UNKNOWN_VALUE;
    const parsed: number[] = [];
    for (const a of args) { const v = integerArg(a); if (v === null) return UNKNOWN_VALUE; parsed.push(v); }
    return exact([...cells].slice(...(parsed as [number?, number?])));
  }
  if (name === "splice") {
    // B6 — zero, one and two arguments are three different contracts.
    if (args.length > 2) return UNKNOWN_VALUE;
    const parsed: number[] = [];
    for (const a of args) { const v = integerArg(a); if (v === null) return UNKNOWN_VALUE; parsed.push(v); }
    if (parsed.length === 0) return exact([]);             // splice() removes NOTHING
    const copy = [...cells];
    const raw = parsed[0]!;
    const from = raw < 0 ? Math.max(copy.length + raw, 0) : Math.min(raw, copy.length);
    const count = parsed.length === 1 ? copy.length - from : Math.max(parsed[1]!, 0);
    return exact(copy.slice(from, from + count));          // the REMOVED cells
  }
  if (name === "reverse") return args.length === 0 ? exact([...cells].reverse()) : UNKNOWN_VALUE;
  if (name === "sort") {
    if (args.length !== 0) return UNKNOWN_VALUE;
    if (!cells.every((c) => c.t === "num")) return UNKNOWN_VALUE;
    return exact([...cells].sort((a, b) => {
      const x = String((a as { v: number }).v); const y = String((b as { v: number }).v);
      return x < y ? -1 : x > y ? 1 : 0;
    }));
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

/** The rejection reason for a callback operation, for the `reason` field. */
function callbackRejection(call: ts.CallExpression | undefined, name: string): string | null {
  if (call === undefined) return null;
  if (name !== "map" && name !== "filter" && name !== "flatMap") return null;
  if (call.arguments.length !== 1) return null;
  const admitted = admitCallback(call.arguments[0]!, name === "flatMap");
  return admitted.ok ? null : admitted.reason;
}

/**
 * CONTRACT AMENDMENT A1 — TERMINAL CONSUMPTION IN A PROVED CONDITION CONTEXT.
 *
 * REVISED after codex r2b R1. The first version terminated whenever a decided
 * scalar was an operand of `&&`/`||`/`??` or of `!`. That was UNSOUND:
 * `NOT_ARRAY` decides the OPERAND's type, never the OPERATOR's result. In
 * `a.join("") || ""` the `||` yields the right operand; in
 * `[...].includes(7) || Array.from(...)` it yields an array; and `!x` produces a
 * boolean that still flows into whatever owns it. Each of those must continue,
 * and continuation over a decided scalar is `UNKNOWN` (§3.15 R3).
 *
 * The sound rule keeps only the case where the value is PROVABLY DISCARDED —
 * a CONDITION whose enclosing construct's result never derives from it:
 *
 *   (a) the condition of an `if` / `while` / `do` / `for` statement; or
 *   (b) the condition operand of a conditional expression `c ? a : b`.
 *
 * The candidate need not be the condition node itself: logical operators,
 * unary `!` and parentheses are traversed UPWARD to find the outermost such
 * expression, and A1 fires only if THAT node sits in a condition slot. If the
 * outermost node instead flows into a declaration, a call, a member access or
 * any other owner, its value is used and A1 does NOT fire.
 */
function conditionContextOwner(node: ts.Node): ts.Node | undefined {
  let current: ts.Node = node;
  for (;;) {
    const parent: ts.Node | undefined = current.parent;
    if (parent === undefined) return undefined;
    if (ts.isParenthesizedExpression(parent) ||
        (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) ||
        (ts.isBinaryExpression(parent) &&
          (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
           parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
           parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken))) {
      current = parent;                       // still inside the boolean/logical envelope
      continue;
    }
    // `current` is the outermost node of that envelope. Is IT a condition?
    if (ts.isIfStatement(parent) && parent.expression === current) return parent;
    if ((ts.isWhileStatement(parent) || ts.isDoStatement(parent)) && parent.expression === current) return parent;
    if (ts.isForStatement(parent) && parent.condition === current) return parent;
    if (ts.isConditionalExpression(parent) && parent.condition === current) return parent;
    return undefined;                          // the envelope's value is USED, not discarded
  }
}

/**
 * R2 — evaluate an expression's VALUE under the bounded admitted grammar,
 * stopping at that expression. This is the downward counterpart of the ownership
 * walk and is what a sibling spread operand needs: the earlier version pattern-
 * matched a bare `ArrayLiteralExpression`, so `...([1,2,3])`, `...new Set(x)`,
 * `...(x as const)`, `...Object.freeze(x)`, `...Array.from(x)` and `...x.slice(1)`
 * were all rejected despite having exact values.
 *
 * Anything outside the admitted compositions yields UNKNOWN.
 */
type Member = ts.PropertyAccessExpression | ts.ElementAccessExpression;

/** Shared by upward ownership and downward operand evaluation (§3.18 R4). */
function memberName(member: Member): string | null {
  return ts.isPropertyAccessExpression(member) ? member.name.text
    : ts.isStringLiteral(member.argumentExpression) ? member.argumentExpression.text : null;
}

function memberInvocation(member: Member, owner: ts.Node): ts.CallExpression | undefined {
  const call = member.parent;
  return member.expression === owner && call !== undefined && ts.isCallExpression(call) && call.expression === member
    ? call : undefined;
}

function valueOfExpression(node: ts.Expression, depth = 0): Value {
  if (depth > 32) return UNKNOWN_VALUE;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return valueOfExpression(node.expression, depth + 1);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return valueOfExpression(node.right, depth + 1);
  }
  if (ts.isArrayLiteralExpression(node)) {
    const cells: Cell[] = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const inner = valueOfExpression(element.expression, depth + 1);
        if (inner.kind !== "EXACT") return UNKNOWN_VALUE;
        cells.push(...inner.cells);
        continue;
      }
      const prim = literalPrim(element);
      if (prim.t === "unknown") return UNKNOWN_VALUE;
      cells.push(prim);
    }
    return exact(cells);
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Set" &&
      node.arguments !== undefined && node.arguments.length === 1) {
    const inner = valueOfExpression(node.arguments[0]!, depth + 1);
    if (inner.kind !== "EXACT") return UNKNOWN_VALUE;
    const deduped = dedupeSameValueZero(inner.cells);
    return deduped === null ? UNKNOWN_VALUE : exact(deduped, "set");
  }
  if (ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
    const member = node.expression;
    const owner = member.expression;
    const call = memberInvocation(member, owner);
    const name = memberName(member);
    if (call !== node || name === null) return UNKNOWN_VALUE;
    if (ts.isPropertyAccessExpression(member) && ts.isIdentifier(owner) && owner.text === "Array" && name === "from" && node.arguments.length === 1) {
      const inner = valueOfExpression(node.arguments[0]!, depth + 1);
      return inner.kind === "EXACT" ? exact(inner.cells, "array") : UNKNOWN_VALUE;
    }
    if (ts.isPropertyAccessExpression(member) && ts.isIdentifier(owner) && owner.text === "Object" && name === "freeze" && node.arguments.length === 1) {
      const inner = valueOfExpression(node.arguments[0]!, depth + 1);
      return inner.kind === "EXACT" ? inner : UNKNOWN_VALUE;
    }
    // a modelled member invocation on an evaluable receiver
    return applyMember(valueOfExpression(owner, depth + 1), name, call);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const receiver = valueOfExpression(node.expression, depth + 1);
    const name = memberName(node);
    if (name !== null) return applyMember(receiver, name, undefined);
    return ts.isElementAccessExpression(node) && integerArg(node.argumentExpression) !== null && receiver.kind === "EXACT"
      ? elementReturn(receiver.cells) : UNKNOWN_VALUE;
  }
  return UNKNOWN_VALUE;
}

/** §3.16 R3 — the ownership walk. B8: BOTH consumed boundaries move with the owner. */
function ownershipWalk(
  literal: ts.ArrayLiteralExpression,
  file: ts.SourceFile
): { value: Value; consumedStart: number; consumedEnd: number; reason: string } {
  let value: Value = exact(ownCells(literal));
  let node: ts.Node = literal;
  let consumedStart = literal.getStart(file);
  let consumedEnd = literal.getEnd();
  let reason = "literal bound directly; no operation applied";
  let guard = 0;
  const take = (owner: ts.Node): void => {
    consumedStart = owner.getStart(file);
    consumedEnd = owner.getEnd();
  };

  for (;;) {
    if ((guard += 1) > 256) {
      return { value: UNKNOWN_VALUE, consumedStart, consumedEnd, reason: "walk guard exceeded" };
    }
    const parent: ts.Node | undefined = node.parent;
    if (parent === undefined || isTerminalOwner(parent)) {
      if (parent !== undefined && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ||
          ts.isReturnStatement(parent) || ts.isJsxExpression(parent))) {
        take(parent);
      }
      return { value, consumedStart, consumedEnd, reason };
    }

    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
      node = parent; take(parent); reason = "transparent wrapper"; continue;
    }

    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      take(parent);
      if (parent.right === node) { node = parent; reason = "comma operator: candidate is the right operand"; continue; }
      return { value: NOT_ARRAY_VALUE, consumedStart, consumedEnd,
               reason: "comma operator: the candidate's value is discarded" };
    }

    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) {
      const name = memberName(parent);
      const call = memberInvocation(parent, node);
      if (name === null) {
        const numericIndex = ts.isElementAccessExpression(parent) && integerArg(parent.argumentExpression) !== null;
        value = numericIndex && value.kind === "EXACT" ? elementReturn(value.cells) : UNKNOWN_VALUE;
        const owner = call ?? parent; take(owner); node = owner;
        reason = numericIndex ? "numeric index access" : "computed member is not a string literal";
        continue;
      }
      const rejection = callbackRejection(call, name);
      value = applyMember(value, name, call);
      const owner = call ?? parent; take(owner); node = owner;
      reason = rejection !== null ? `${name}: ${rejection}` : `applied ${name}`;
      continue;
    }

    if (ts.isNewExpression(parent) && parent.arguments !== undefined && parent.arguments.length === 1 &&
        parent.arguments[0] === node && ts.isIdentifier(parent.expression)) {
      take(parent);
      if (parent.expression.text === "Set") {
        if (value.kind !== "EXACT") { value = UNKNOWN_VALUE; reason = "new Set over a non-exact value"; }
        else {
          const deduped = dedupeSameValueZero(value.cells);
          value = deduped === null ? UNKNOWN_VALUE : exact(deduped, "set");
          reason = deduped === null
            ? "new Set: object identity is unavailable for a jsx/arr/unknown cell"
            : "new Set: SameValueZero dedupe";
        }
      } else { value = UNKNOWN_VALUE; reason = `new ${parent.expression.text} is not modelled`; }
      node = parent; continue;
    }

    if (ts.isCallExpression(parent) && parent.arguments.length === 1 && parent.arguments[0] === node &&
        ts.isPropertyAccessExpression(parent.expression) && ts.isIdentifier(parent.expression.expression)) {
      const owner = parent.expression.expression.text;
      const member = parent.expression.name.text;
      if (owner === "Array" && member === "from") {
        value = value.kind === "EXACT" ? exact(value.cells, "array") : UNKNOWN_VALUE;
        take(parent); node = parent; reason = "Array.from: converted to an array"; continue;
      }
      if (owner === "Object" && member === "freeze") {
        // B10 — the receiver-state continuation rule comes BEFORE freeze identity.
        if (value.kind !== "EXACT") {
          value = UNKNOWN_VALUE;
          take(parent);
          return { value, consumedStart, consumedEnd,
                   reason: "Object.freeze over a non-exact receiver: continuation yields UNKNOWN" };
        }
        take(parent); node = parent; reason = "Object.freeze: identity over an exact value"; continue;
      }
    }

    if (ts.isSpreadElement(parent) && parent.parent !== undefined && ts.isArrayLiteralExpression(parent.parent)) {
      const enclosing = parent.parent;
      const folded: Cell[] = [];
      let ok = true;
      for (const element of enclosing.elements) {
        if (element === parent) {
          if (value.kind !== "EXACT") { ok = false; break; }
          folded.push(...value.cells);
        } else if (ts.isSpreadElement(element)) {
          // R2 — the sibling's VALUE under the admitted grammar, not a literal shape.
          const sibling = valueOfExpression(element.expression);
          if (sibling.kind !== "EXACT") { ok = false; break; }
          folded.push(...sibling.cells);                    // array OR set cells, in order
        } else {
          const prim = literalPrim(element);
          if (prim.t === "unknown") { ok = false; break; }
          folded.push(prim);
        }
      }
      value = ok ? exact(folded) : UNKNOWN_VALUE;
      take(enclosing); node = enclosing;
      reason = ok ? "spread folded into the enclosing array, in order"
                  : "spread: a sibling is not exact under the admitted grammar";
      continue;
    }

    if (ts.isArrayLiteralExpression(parent) && parent.elements.some((e) => e === node)) {
      const cells: Cell[] = parent.elements.map((e) => (e === node ? { t: "arr", value } : literalPrim(e)));
      value = exact(cells); take(parent); node = parent;
      reason = "nested as an { arr } cell of the enclosing array"; continue;
    }

    if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isArrayBindingPattern(parent.name)) {
      take(parent);
      const bound = bindingValue(parent.name, value);
      return { value: bound.value, consumedStart, consumedEnd, reason: bound.reason };
    }

    // AMENDMENT A1 — a decided scalar PROVABLY DISCARDED in a condition context.
    // Logical operators alone never terminate: only a condition slot does.
    if (value.kind === "NOT_ARRAY") {
      const conditionOwner = conditionContextOwner(node);
      if (conditionOwner !== undefined) {
        take(conditionOwner);
        return { value, consumedStart, consumedEnd,
                 reason: "terminal consumption: a decided scalar discarded in a condition context (amendment A1)" };
      }
    }

    if (ts.isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
      take(parent);
      return { value: UNKNOWN_VALUE, consumedStart, consumedEnd,
               reason: "the candidate is an argument to an unmodelled call" };
    }

    take(parent);
    return { value: UNKNOWN_VALUE, consumedStart, consumedEnd, reason: "unmodelled owner" };
  }
}

/**
 * §3.16 R3 — array binding. B7: unsupported nested or defaulted binding forms
 * are REJECTED to UNKNOWN before any output is classified. Elision offsets,
 * nested `{arr}` extraction into a plain name and any-`RULED` aggregation are
 * unchanged.
 */
function bindingValue(pattern: ts.ArrayBindingPattern, value: Value): { value: Value; reason: string } {
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue;
    if (element.initializer !== undefined) {
      return { value: UNKNOWN_VALUE, reason: "array binding: a defaulted binding element is not modelled" };
    }
    if (!ts.isIdentifier(element.name)) {
      return { value: UNKNOWN_VALUE, reason: "array binding: a nested binding pattern is not modelled" };
    }
  }
  if (value.kind !== "EXACT") {
    return { value: UNKNOWN_VALUE, reason: "array binding over a non-exact value" };
  }
  const cells = value.cells;
  const outputs: Value[] = [];
  pattern.elements.forEach((element, index) => {
    if (ts.isOmittedExpression(element)) return;
    if (element.dotDotDotToken !== undefined) { outputs.push(exact(cells.slice(index))); return; }
    const cell = cells[index];
    if (cell === undefined) { outputs.push(UNKNOWN_VALUE); return; }
    outputs.push(cell.t === "arr" ? cell.value : exact([cell]));
  });
  if (outputs.length === 0) return { value: UNKNOWN_VALUE, reason: "array binding with no bound name" };
  const ruled = outputs.find((o) => verdictOf(o) === "RULED");
  if (ruled !== undefined) return { value: ruled, reason: "array binding: a bound output is the ruled domain" };
  const unknown = outputs.find((o) => verdictOf(o) === "UNDETERMINED");
  return { value: unknown ?? outputs[0]!, reason: "array binding: no bound output is the ruled domain" };
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
 */
function evaluateFrom(
  node: ts.ArrayLiteralExpression,
  file: ts.SourceFile
): { value: Value; consumedStart: number; consumedEnd: number; reason: string } {
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
    const { value, consumedStart, consumedEnd, reason } = evaluateFrom(node, file);
    return { ...candidate, consumedStart, consumedEnd, value,
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
