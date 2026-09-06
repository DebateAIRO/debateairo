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
  const first = parsed.diagnostics[0];
  const message = first ? first.message : "unparsed";
  return [
    {
      kind: "INCONCLUSIVE",
      line: first ? first.line : 1,
      text: message,
      path,
      diagnostic: message
    }
  ];
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
