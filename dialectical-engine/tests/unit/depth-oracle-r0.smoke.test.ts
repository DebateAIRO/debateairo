import { describe, expect, it } from "vitest";
import ts from "typescript-classic";

/**
 * F-T1-ORACLE-EVALUATOR — round 0 dependency and resolution gate.
 *
 * This file proves ONE thing: the pinned classic parser is reachable from the root
 * test context by PACKAGE NAME, and the exact parser behaviours the evaluator's
 * design depends on hold under it. It is deliberately separate from the
 * `S1-1 · the depth bound has a single source` describe — its five instances are
 * not part of that selected group and do not change its count.
 *
 * Authority: D68 ADDENDUM (the alias grant); plan REVISION 4 §8.8 R3, §9.12 R3,
 * §9.15 R4; codex plan-r4 verdict "## F2".
 *
 * NAMED FACT, carried per D68 ADDENDUM 2:
 *   Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and
 *   imported under Node 25.7.0 only.
 *
 * NO evaluator code lives here. Round 1 creates `tests/support/depthOracle.ts`.
 */

/**
 * The ONE test-local diagnostic accessor.
 *
 * `parseDiagnostics` is populated by `createSourceFile` but is NOT part of
 * TypeScript's documented public surface, so it is read HERE and nowhere else.
 *
 * ROUND 1 MOVE (plan §1.5 R2 / §1.9 R3): this accessor moves into
 * `tests/support/depthOracle.ts`, behind `parseModule`, which returns
 * `{ ok:false, diagnostics }` from it. After that move this file's copy is
 * deleted — the property is read behind exactly one accessor in the lane, so a
 * future TypeScript bump touches one line.
 */
function parseDiagnosticsOf(file: ts.SourceFile): readonly ts.Diagnostic[] {
  return (file as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
}

/** Parse exactly as plan §1.5 R2 specifies: Latest, setParentNodes true, explicit ScriptKind. */
function parse(path: string, source: string, kind: ts.ScriptKind): ts.SourceFile {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, /* setParentNodes */ true, kind);
}

/** First node in the tree satisfying `predicate`, in source order. */
function findFirst(node: ts.Node, predicate: (candidate: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(node)) return node;
  let found: ts.Node | undefined;
  ts.forEachChild(node, (child) => {
    if (found) return;
    found = findFirst(child, predicate);
    return undefined;
  });
  return found;
}

/** Every numeric literal in the tree, in source order. */
function numericLiterals(node: ts.Node): ts.NumericLiteral[] {
  const out: ts.NumericLiteral[] = [];
  const walk = (current: ts.Node): void => {
    if (ts.isNumericLiteral(current)) out.push(current);
    ts.forEachChild(current, walk);
  };
  walk(node);
  return out;
}

describe("depth oracle round 0 · the pinned classic parser is reachable and behaves", () => {
  it("resolves typescript-classic by package name at version 5.9.3 and exposes the API surface the evaluator uses", () => {
    expect(ts.version).toBe("5.9.3");

    // The surface plan §1.5 R2 / §2 R2 / §3.13 R3 actually call. A missing member
    // here is a dependency defect, not a design change.
    expect(typeof ts.createSourceFile).toBe("function");
    expect(typeof ts.forEachChild).toBe("function");
    expect(typeof ts.getLineAndCharacterOfPosition).toBe("function");
    expect(typeof ts.isArrayLiteralExpression).toBe("function");
    expect(typeof ts.isNumericLiteral).toBe("function");
    expect(typeof ts.isPrefixUnaryExpression).toBe("function");
    expect(ts.ScriptTarget.Latest).toBeTypeOf("number");
    expect(ts.ScriptKind.TS).toBeTypeOf("number");
    expect(ts.ScriptKind.TSX).toBeTypeOf("number");
    expect(ts.SyntaxKind.ArrayLiteralExpression).toBeTypeOf("number");
  });

  it("parses TypeScript with zero parse diagnostics, sets parent links, and reports the array literal's source position", () => {
    const source = ["const header = 1;", "const allowed = [1, 2, 3, 4, 5];", ""].join("\n");
    const file = parse("planted.ts", source, ts.ScriptKind.TS);

    expect(parseDiagnosticsOf(file)).toHaveLength(0);

    const array = findFirst(file, ts.isArrayLiteralExpression);
    expect(array).toBeDefined();
    if (!array) throw new Error("unreachable: array literal not found");

    // parent links are set (setParentNodes true) and climb to the declaration.
    expect(array.parent).toBeDefined();
    expect(array.parent.kind).toBe(ts.SyntaxKind.VariableDeclaration);
    expect(array.parent.parent.kind).toBe(ts.SyntaxKind.VariableDeclarationList);

    // Source position: the literal starts on line 2 (0-based 1), at the column of '['.
    const position = ts.getLineAndCharacterOfPosition(file, array.getStart(file));
    expect(position.line).toBe(1);
    expect(position.character).toBe(source.split("\n")[1]!.indexOf("["));
  });

  it("parses TSX with zero parse diagnostics and sets parent links through the JSX container", () => {
    const source = ["export const view = () => <p>{[1, 2, 3, 4, 5].length}</p>;", ""].join("\n");
    const file = parse("planted.tsx", source, ts.ScriptKind.TSX);

    expect(parseDiagnosticsOf(file)).toHaveLength(0);

    const array = findFirst(file, ts.isArrayLiteralExpression);
    expect(array).toBeDefined();
    if (!array) throw new Error("unreachable: array literal not found in TSX");

    // The array sits inside JSX; its parent chain must be walkable.
    expect(array.parent).toBeDefined();
    expect(array.parent.kind).toBe(ts.SyntaxKind.PropertyAccessExpression);
    expect(findFirst(file, (node) => node.kind === ts.SyntaxKind.JsxExpression)).toBeDefined();
  });

  it("normalises numeric literal text and carries the sign as a separate prefix node (plan M14)", () => {
    const file = parse("numbers.ts", "const values = [1_0, 0x10, 0o10, 0b10, 1.5];\n", ts.ScriptKind.TS);
    expect(parseDiagnosticsOf(file)).toHaveLength(0);

    // M14: the parser normalises the written form to a decimal string.
    expect(numericLiterals(file).map((literal) => literal.text)).toEqual(["10", "16", "8", "2", "1.5"]);

    // M14: the sign is NOT part of the literal — it is a separate prefix node.
    const signed = parse("signed.ts", "const value = -1;\n", ts.ScriptKind.TS);
    expect(parseDiagnosticsOf(signed)).toHaveLength(0);

    const prefix = findFirst(signed, ts.isPrefixUnaryExpression);
    expect(prefix).toBeDefined();
    if (!prefix || !ts.isPrefixUnaryExpression(prefix)) throw new Error("unreachable: prefix node not found");
    expect(prefix.operator).toBe(ts.SyntaxKind.MinusToken);
    expect(ts.isNumericLiteral(prefix.operand)).toBe(true);
    expect((prefix.operand as ts.NumericLiteral).text).toBe("1");
  });

  it("detects a deliberately malformed input through the single test-local diagnostic accessor", () => {
    const file = parse("malformed.ts", "const broken = [1, 2, ;\n", ts.ScriptKind.TS);

    const diagnostics = parseDiagnosticsOf(file);
    expect(diagnostics.length).toBeGreaterThan(0);

    // The record carries a usable line and message — what plan §1.10 R3's
    // INCONCLUSIVE site is built from in round 1.
    const first = diagnostics[0]!;
    expect(first.file).toBeDefined();
    expect(typeof first.start).toBe("number");
    expect(ts.flattenDiagnosticMessageText(first.messageText, " ")).not.toBe("");
  });
});
