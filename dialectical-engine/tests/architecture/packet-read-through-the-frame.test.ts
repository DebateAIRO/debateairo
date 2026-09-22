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

/**
 * INT1 (2026-09-22), T9 x T10. `tests/unit` joined the scan after the two
 * packages clashed there: task 10c's "reaches the new vendor with the header
 * built from its key file" posted `packet: { messages: [...] }` to the real
 * `OpenAICompatibleProviderGateway`, task 9's door refused it
 * `PROMPT_FRAME_ABSENT`, and neither review saw it coming because shape 3 was
 * not looked for in this tree. It is now.
 */
const SCANNED_ROOTS = ["tests/integration", "tests/support", "acceptance", "tests/unit"] as const;

/**
 * Shape 4 — the frame's own spelling written out in a literal — is looked for
 * in the three trees the UNIT GATE DOES NOT RUN, which is the whole reason this
 * row exists: a private copy of the block layout rots there unseen, for months.
 *
 * `tests/unit` is deliberately not among them. This narrows the RULE; it is not
 * a hole in the directory, because shapes 1–3 still apply there. Four unit
 * suites have the frame's spelling as their SUBJECT and cannot express what
 * they measure without writing it out:
 *
 *   - `prompt-frame.test.ts` — the builder's own tests: the minted fence's
 *     pattern, a forced collision, a tampered boundary marker;
 *   - `prompt-injection-corpus.test.ts` — layer 4's attack payloads, which forge
 *     the fence and the envelope on purpose, and the mask that strips both
 *     before the clean and attacked renders are compared;
 *   - `judgement-prompt-source.test.ts` — contracts carrying a reserved frame
 *     token, which `buildFramedPrompt` must refuse at build time;
 *   - `judgement.test.ts` — the exact envelope a hand-off emits, pinned.
 *
 * Every one of those runs in `pnpm run test:ci-gate` on every commit, so a
 * spelling that drifts from `prompt-frame.ts` goes red within seconds — the
 * opposite of the silent rot shape 4 was written for. A hand-rolled READER that
 * matters is caught by shapes 1–3 wherever it lives.
 */
const FRAME_LITERAL_ROOTS = ["tests/integration", "tests/support", "acceptance"] as const;

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

/**
 * THE ONE ALLOWANCE for shape 3, and the reason it cannot be abused: a packet
 * built by hand is permitted only where the statement around it asserts one of
 * the DOOR'S OWN refusals. Such a call is proving that `assertFramedPrompt`
 * REFUSES the packet, so by construction it never leaves the process and can
 * never be a hand-off that skipped the frame. A case that expects the call to
 * SUCCEED cannot satisfy this and must use the builder.
 *
 * It needs no annotation in the test: the assertion already says what the case
 * is for, which is one fewer marker to keep honest.
 */
const ASSERTS_DOOR_REFUSAL = /\bPROMPT_FRAME_[A-Z_]+\b/u;

/**
 * The smallest complete statement around a node: walk up until the parent is a
 * statement container. Scoped this tightly so the allowance reads ONE `expect`,
 * never a whole `describe` block that happens to mention a frame code elsewhere.
 */
function enclosingStatement(node: ts.Node): ts.Node {
  let cursor = node;
  while (cursor.parent !== undefined && !ts.isBlock(cursor.parent) && !ts.isSourceFile(cursor.parent)
    && !ts.isModuleBlock(cursor.parent) && !ts.isCaseClause(cursor.parent)
    && !ts.isDefaultClause(cursor.parent)) {
    cursor = cursor.parent;
  }
  return cursor;
}

export interface PacketShapeScanOptions {
  /** Shape 4. False under `tests/unit` — see `FRAME_LITERAL_ROOTS`. */
  readonly frameLiterals?: boolean;
}

export function scanPacketShapes(
  file: string,
  source: string,
  options: PacketShapeScanOptions = {}
): readonly PacketShapeOffence[] {
  const frameLiterals = options.frameLiterals ?? true;
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
        && value.properties.some((property) => property.name?.getText(root) === "messages")
        && !ASSERTS_DOOR_REFUSAL.test(enclosingStatement(node).getText(root))) {
        offences.push({ file, line: lineOf(node), rule: "HAND_BUILT_GATEWAY_PACKET" });
      }
    }
    // Shape 4: the fence or the envelope format spelled in a literal
    if (frameLiterals
      && (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
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
    // Shape 3, THE ONE ALLOWANCE: a case proving the DOOR refuses the packet.
    expect(offend([
      "await expect(provider.classify({",
      "  packet: { messages: [{ role: 'user', content: 'samples' }] }",
      "})).rejects.toMatchObject({ code: 'PROMPT_FRAME_ABSENT' });"
    ].join("\n"))).toEqual([]);
    expect(offend([
      "expect(() => gateway.call({ packet: { messages: [notTheFence] } }))",
      "  .toThrow(expect.objectContaining({ code: 'PROMPT_FRAME_FENCE_MISMATCH' }));"
    ].join("\n"))).toEqual([]);
    // ...and it reaches ONE statement, never a neighbour that merely names a code.
    expect(offend([
      "await expect(a.call({ packet: unframed })).rejects.toMatchObject({ code: 'PROMPT_FRAME_ABSENT' });",
      "await b.call({ packet: { messages: [{ role: 'user', content: 'ping' }] } });"
    ].join("\n"))).toEqual(["2:HAND_BUILT_GATEWAY_PACKET"]);
    // A refusal that is not the door's does not buy a hand-built packet.
    expect(offend([
      "await expect(gateway.call({ packet: { messages: [{ role: 'user', content: 'x' }] } }))",
      "  .rejects.toMatchObject({ code: 'RUN_COST_ENVELOPE_EXHAUSTED' });"
    ].join("\n"))).toEqual(["1:HAND_BUILT_GATEWAY_PACKET"]);
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

  /**
   * Shape 4 off is a narrowing of ONE shape, never of the file: shapes 1–3 keep
   * their full force on the same source. This is what `tests/unit` is scanned
   * with, so the pair below is the whole difference between the two roots.
   */
  it("drops only shape 4 where the frame's spelling is the subject", () => {
    const source = [
      "expect(framed.fence).toMatch(/#\\|DEBATEAI-FENCE-[0-9a-f]{32}\\|#/u);",
      "await gateway.call({ packet: { messages: [{ role: 'user', content: 'ping' }] } });"
    ].join("\n");
    const rules = (options: { readonly frameLiterals?: boolean }): readonly string[] =>
      scanPacketShapes("fixture.ts", source, options).map((offence) => `${offence.line}:${offence.rule}`);
    expect(rules({})).toEqual(["1:HAND_ROLLED_FRAME_READER", "2:HAND_BUILT_GATEWAY_PACKET"]);
    expect(rules({ frameLiterals: false })).toEqual(["2:HAND_BUILT_GATEWAY_PACKET"]);
  });

  it("finds none of them under tests/integration/, tests/support/, acceptance/ or tests/unit/", async () => {
    const files = (await Promise.all(SCANNED_ROOTS.map((rootDirectory) => typescriptFiles(rootDirectory)))).flat().sort();
    // Vacuity guard: the trees are large; an empty scan is a broken scan.
    expect(files.length).toBeGreaterThan(80);
    for (const rootDirectory of SCANNED_ROOTS) {
      expect(files.some((file) => file.startsWith(`${rootDirectory}/`)), rootDirectory).toBe(true);
    }

    const offenders: string[] = [];
    for (const file of files) {
      const frameLiterals = FRAME_LITERAL_ROOTS.some((rootDirectory) => file.startsWith(`${rootDirectory}/`));
      for (const offence of scanPacketShapes(file, await readFile(file, "utf8"), { frameLiterals })) {
        offenders.push(`${offence.file}:${offence.line} ${offence.rule}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
