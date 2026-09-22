import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

/**
 * V-11 addendum (RUN1), fix round 4 — A PACKET IS READ THROUGH THE FRAME, NEVER
 * PARSED BARE.
 *
 * RUN1 moved every model hand-off onto one frame: the system message opens with
 * the owners' editable instruction, every user message is one fenced
 * `debateai.framed-material.v1` block. Three rounds of string sweeps over the
 * SHIPPED code then missed four kinds of shape assumption sitting inside test
 * doubles and helpers — in suites this host cannot run (Docker, relays), so
 * they rotted without a test going red:
 *
 *   1. `JSON.parse(message.content)` on a packet message — the content is a
 *      fenced block now, so the parse threw into a `catch` and returned `[]`
 *      SILENTLY; ~40 review fixtures then answered with zero edge bearings.
 *   2. `system.startsWith("Return only JSON …")` — routing on the opening words
 *      of the system message, which is the owners' slot and opens with their
 *      instruction; the composer double routed nothing.
 *   3. `packet: { messages: [{ role: "user", content: "fixture" }] }` handed to
 *      the real gateway — the door refuses it `PROMPT_FRAME_ABSENT` before any
 *      fetch, so seven cases measured the door instead of what they meant to.
 *   4. A hand-rolled frame reader (a regex for the fence, a split, a parse) —
 *      a private copy of the block layout that drifts the moment it moves.
 *
 * `tests/support/framed-packet.ts` now carries the ONE reader (`readFramedMaterial`,
 * over `readPromptFrame`, the exact code the door runs) and the ONE fixture
 * builder. This row forbids the four shapes under `tests/integration/` and
 * `acceptance/` — the two trees that do not run in the unit gate — and under
 * `tests/support/`, because the SECOND copy of shape 1 lived there
 * (`reviewBearings.ts`, feeding the acceptance ceremony) where neither tree's
 * sweep would have found it. So the next prompt change cannot break a suite
 * silently.
 *
 * Scanned as an AST, not as text: a comment that mentions the old shape, a
 * string that spells it, or a provider RESPONSE (`choices[0].message.content`,
 * which is model output and not a packet) must not trip it.
 */

const SCANNED_ROOTS = ["tests/integration", "tests/support", "acceptance"] as const;

const ITERATION_METHODS = new Set([
  "find", "findLast", "findIndex", "map", "filter", "some", "every", "forEach", "flatMap"
]);

/** The fence prefix and the envelope format the frame builder owns (prompt-frame.ts). */
const FRAME_LITERALS = [/DEBATEAI-FENCE/u, /debateai\.framed-material/u] as const;

export interface PacketShapeOffence {
  readonly file: string;
  readonly line: number;
  readonly rule: "PARSE_PACKET_CONTENT_BARE" | "ROUTE_ON_SYSTEM_PREFIX" | "HAND_BUILT_GATEWAY_PACKET" | "HAND_ROLLED_FRAME_READER";
}

/**
 * The expression under its wrappers: parentheses, `!`, `as`, `satisfies`, and
 * the LEFT side of a `?? fallback` / `|| fallback` — `find(…)?.content ?? ""`
 * is still a parse of a packet message's content.
 */
function unwrap(node: ts.Expression): ts.Expression {
  let cursor = node;
  for (;;) {
    if (ts.isParenthesizedExpression(cursor) || ts.isNonNullExpression(cursor)
      || ts.isAsExpression(cursor) || ts.isSatisfiesExpression(cursor)
      || ts.isTypeAssertionExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    if (ts.isBinaryExpression(cursor)
      && (cursor.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        || cursor.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      cursor = cursor.left;
      continue;
    }
    return cursor;
  }
}

const NAMES_MESSAGES = /\bmessages\b/u;

export function scanPacketShapes(file: string, source: string): readonly PacketShapeOffence[] {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const offences: PacketShapeOffence[] = [];
  const lineOf = (node: ts.Node): number => root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1;

  // Pass 1: identifiers bound by iterating a `messages` collection —
  // `for (const message of request.messages)` and `packet.messages.find((message) => …)`.
  const boundOverMessages = new Set<string>();
  const bind = (node: ts.Node): void => {
    if (ts.isForOfStatement(node) && NAMES_MESSAGES.test(node.expression.getText(root))
      && ts.isVariableDeclarationList(node.initializer)) {
      for (const declaration of node.initializer.declarations) {
        if (ts.isIdentifier(declaration.name)) boundOverMessages.add(declaration.name.text);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ITERATION_METHODS.has(node.expression.name.text)
      && NAMES_MESSAGES.test(node.expression.expression.getText(root))) {
      const callback = node.arguments[0];
      if (callback !== undefined && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const first = callback.parameters[0];
        if (first !== undefined && ts.isIdentifier(first.name)) boundOverMessages.add(first.name.text);
      }
    }
    ts.forEachChild(node, bind);
  };
  bind(root);

  const visit = (node: ts.Node): void => {
    // Shape 1: JSON.parse(<packet message>.content)
    if (ts.isCallExpression(node) && node.expression.getText(root) === "JSON.parse") {
      const argument = node.arguments[0] === undefined ? undefined : unwrap(node.arguments[0]);
      if (argument !== undefined && ts.isPropertyAccessExpression(argument) && argument.name.text === "content") {
        const receiver = unwrap(argument.expression);
        const receiverText = receiver.getText(root);
        const isPacketMessage = NAMES_MESSAGES.test(receiverText)
          || (ts.isIdentifier(receiver) && boundOverMessages.has(receiver.text));
        if (isPacketMessage) offences.push({ file, line: lineOf(node), rule: "PARSE_PACKET_CONTENT_BARE" });
      }
    }
    // Shape 2: <system…>.startsWith(…)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "startsWith"
      && /system/iu.test(node.expression.expression.getText(root))) {
      offences.push({ file, line: lineOf(node), rule: "ROUTE_ON_SYSTEM_PREFIX" });
    }
    // Shape 3: packet: { messages: … }
    if (ts.isPropertyAssignment(node) && node.name.getText(root) === "packet") {
      const value = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(value)
        && value.properties.some((property) => property.name?.getText(root) === "messages")) {
        offences.push({ file, line: lineOf(node), rule: "HAND_BUILT_GATEWAY_PACKET" });
      }
    }
    // Shape 4: the fence or the envelope format spelled in a literal
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.getText(root);
      if (FRAME_LITERALS.some((literal) => literal.test(text))) {
        offences.push({ file, line: lineOf(node), rule: "HAND_ROLLED_FRAME_READER" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return offences;
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : typescriptFiles(path);
    return /\.ts$/u.test(entry.name) ? [path] : [];
  }))).flat();
}

describe("a model packet is read through the frame, never parsed bare (V-11 addendum, RUN1 round 4)", () => {
  it("recognises each of the four shapes, and only those", () => {
    const offend = (source: string): readonly string[] =>
      scanPacketShapes("fixture.ts", source).map((offence) => `${offence.line}:${offence.rule}`);

    // Shape 1 — every spelling the three rounds missed.
    expect(offend("const p = JSON.parse(onWire.messages[1]!.content);")).toEqual(["1:PARSE_PACKET_CONTENT_BARE"]);
    expect(offend("const p = JSON.parse(request.messages.find((m) => m.role === 'user')?.content ?? '');"))
      .toEqual(["1:PARSE_PACKET_CONTENT_BARE"]);
    expect(offend([
      "for (const message of request.messages ?? []) {",
      "  const envelope = JSON.parse(message.content);",
      "}"
    ].join("\n"))).toEqual(["2:PARSE_PACKET_CONTENT_BARE"]);
    expect(offend("const user = packet.messages.find((turn) => turn.role === 'user'); JSON.parse(turn.content);"))
      .toEqual(["1:PARSE_PACKET_CONTENT_BARE"]);
    // A provider RESPONSE is model output, not a packet: allowed.
    expect(offend("const relayed = JSON.parse(completion.choices[0]!.message.content);")).toEqual([]);
    // A material FIELD's content is a value the engine stringified: allowed.
    expect(offend("const edges = JSON.parse(field.content);")).toEqual([]);
    // Shape 2.
    expect(offend("if (system.startsWith('Return only JSON')) {}")).toEqual(["1:ROUTE_ON_SYSTEM_PREFIX"]);
    expect(offend("if (systemPrompt.startsWith('Return only JSON')) {}")).toEqual(["1:ROUTE_ON_SYSTEM_PREFIX"]);
    expect(offend("if (line.startsWith('[AUTH_REGISTRATION')) {}")).toEqual([]);
    // Shape 3.
    expect(offend("gateway.call({ packet: { messages: [{ role: 'user', content: 'fixture' }] } });"))
      .toEqual(["1:HAND_BUILT_GATEWAY_PACKET"]);
    expect(offend("gateway.call({ packet: framedFixturePacket('fixture') });")).toEqual([]);
    expect(offend("gateway.call({ packet: buildFramedPrompt({ contract, material }).packet });")).toEqual([]);
    // A relay probe posts messages to the relay's own HTTP surface: allowed.
    expect(offend("postMessages(relay.handle, [{ role: 'user', content }]);")).toEqual([]);
    // Shape 4.
    expect(offend("const fence = /#\\|DEBATEAI-FENCE-[0-9a-f]{32}\\|#/u.exec(system)?.[0];"))
      .toEqual(["1:HAND_ROLLED_FRAME_READER"]);
    expect(offend("expect(envelope.format).toBe('debateai.framed-material.v1');")).toEqual(["1:HAND_ROLLED_FRAME_READER"]);
    // Prose is not a shape: a comment may name any of them.
    expect(offend([
      "// neither `JSON.parse(message.content)` nor `system.startsWith(` nor",
      "// `packet: { messages: [] }` nor the DEBATEAI-FENCE token routes anything now",
      "const x = 1;"
    ].join("\n"))).toEqual([]);
  });

  it("finds none of them under tests/integration/, tests/support/ or acceptance/", async () => {
    const files = (await Promise.all(SCANNED_ROOTS.map((rootDirectory) => typescriptFiles(rootDirectory)))).flat().sort();
    // Vacuity guard: the trees are large; an empty scan is a broken scan.
    expect(files.length).toBeGreaterThan(80);
    for (const rootDirectory of SCANNED_ROOTS) {
      expect(files.some((file) => file.startsWith(`${rootDirectory}/`)), rootDirectory).toBe(true);
    }

    const offenders: string[] = [];
    for (const file of files) {
      for (const offence of scanPacketShapes(file, await readFile(file, "utf8"))) {
        offenders.push(`${offence.file}:${offence.line} ${offence.rule}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
