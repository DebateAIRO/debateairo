import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

/**
 * FW-B / B-I1 + D-I3 — THE SUPPORT CHAT IS A HAND-OFF, SO IT HOLDS THE SAME
 * DOOR.
 *
 * The owner's V-11 addendum is "one frame at every hand-off". Every debate
 * hand-off has held it since RUN1, because the provider gateway calls
 * `assertFramedPrompt` before the first byte leaves and refuses anything the
 * frame builder did not make. The support chat was the one poster outside that
 * structure: `SupportChatCompletionsAdapter.complete` assembled
 * `[{ role: "system", content: input.system }, ...input.messages]` and posted it
 * to a vendor, so a visitor's text reached a paid model as a bare `user` turn —
 * no fence, no canary, no locked answer form, and none of it in the 210-case
 * injection corpus.
 *
 * Three hand-offs sat behind that one transport: the visitor's turn on the wire
 * (`support/model.ts`), the KB-grounded answer (`support/answer.ts`) and the
 * advisory case summary (`support/cases.ts`).
 *
 * This row is the structural guarantee, written the way the gateway's own is: a
 * LIST derived from the tree rather than a list someone remembers to update. It
 * finds every vendor post under `apps/api/src/support/**` and requires the door
 * in the same function; and it forbids a system turn being written anywhere in
 * that tree at all, because the instruction compartment is the frame builder's
 * and no support module may assemble one.
 *
 * Scanned as an AST, not as text, so a comment naming either shape — this
 * docblock included — does not trip it.
 *
 * FIX ROUND 1, MINOR 2 — ONE FALSE POSITIVE, KEPT ON PURPOSE. The door is
 * required in the SAME function as the post, so moving the `fetch` into a
 * private helper (`#post(...)`) while the door stays in `complete` reads as an
 * offence even though the call is still framed. That is the fail-closed
 * direction and it is the right trade: the alternative is following the call
 * graph, and a scanner that reasons about which function called which is a
 * scanner that can be talked out of an offence. The repair is to move the door
 * with the post, which is where it belongs anyway, and this paragraph is here
 * so the next person reads a deliberate rule rather than a bug.
 */

const SUPPORT_ROOT = "apps/api/src/support";

/** The one URL suffix a vendor chat completion is posted to. */
const VENDOR_POST = /chat\/completions/u;

/** The door, and the reader that IS the door (`readPromptFrame` calls it). */
const DOOR_NAMES = new Set(["assertFramedPrompt", "readPromptFrame"]);

export interface SupportPostOffence {
  readonly file: string;
  readonly line: number;
  readonly rule: "VENDOR_POST_WITHOUT_THE_DOOR" | "SYSTEM_TURN_OUTSIDE_THE_FRAME";
}

export interface SupportPostScan {
  readonly offences: readonly SupportPostOffence[];
  /** How many vendor posts were seen at all — the vacuity guard's input. */
  readonly posts: number;
}

function enclosingFunction(node: ts.Node): ts.Node {
  for (let cursor: ts.Node | undefined = node; cursor !== undefined; cursor = cursor.parent) {
    if (ts.isFunctionDeclaration(cursor) || ts.isFunctionExpression(cursor)
      || ts.isArrowFunction(cursor) || ts.isMethodDeclaration(cursor)
      || ts.isConstructorDeclaration(cursor) || ts.isSourceFile(cursor)) {
      return cursor;
    }
  }
  return node;
}

function callsTheDoor(scope: ts.Node, root: ts.SourceFile): boolean {
  let found = false;
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : node.expression.getText(root);
      if (DOOR_NAMES.has(callee)) found = true;
    }
    ts.forEachChild(node, walk);
  };
  walk(scope);
  return found;
}

export function scanSupportPosts(file: string, source: string): SupportPostScan {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const offences: SupportPostOffence[] = [];
  const lineOf = (node: ts.Node): number => root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1;
  let posts = 0;

  const visit = (node: ts.Node): void => {
    // A vendor post: any call whose FIRST argument names the completions path.
    // The receiver is deliberately not constrained — `fetch`, `this.#fetch` and
    // an injected implementation are all the same hand-off.
    if (ts.isCallExpression(node)) {
      const target = node.arguments[0];
      if (target !== undefined && VENDOR_POST.test(target.getText(root))) {
        posts += 1;
        if (!callsTheDoor(enclosingFunction(node), root)) {
          offences.push({ file, line: lineOf(node), rule: "VENDOR_POST_WITHOUT_THE_DOOR" });
        }
      }
    }
    // A system turn written in this tree at all. The instruction compartment is
    // built by `buildFramedPrompt` and by nothing else; a support module that
    // spells one is assembling a prompt beside the frame.
    if (ts.isPropertyAssignment(node) && node.name.getText(root) === "role"
      && ts.isStringLiteralLike(node.initializer) && node.initializer.text === "system") {
      offences.push({ file, line: lineOf(node), rule: "SYSTEM_TURN_OUTSIDE_THE_FRAME" });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return { offences: Object.freeze(offences), posts };
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : typescriptFiles(path);
    return /\.ts$/u.test(entry.name) ? [path] : [];
  }))).flat();
}

describe("every support-chat hand-off posts through the frame door (V-11 addendum)", () => {
  it("recognises the two shapes, and only those", () => {
    const rules = (source: string): readonly string[] =>
      scanSupportPosts("fixture.ts", source).offences.map((offence) => `${offence.line}:${offence.rule}`);

    // The shape as it shipped: a hand-assembled packet posted with no door.
    expect(rules([
      "async function complete(input) {",
      "  return await fetch(`${base}/chat/completions`, {",
      "    body: JSON.stringify({ messages: [{ role: 'system', content: input.system }] })",
      "  });",
      "}"
    ].join("\n"))).toEqual(["2:VENDOR_POST_WITHOUT_THE_DOOR", "3:SYSTEM_TURN_OUTSIDE_THE_FRAME"]);

    // The shape it must have: the door first, then the packet's own messages.
    expect(rules([
      "async function complete(input) {",
      "  const frame = assertFramedPrompt(input.packet);",
      "  return await this.fetch(`${base}/chat/completions`, {",
      "    body: JSON.stringify({ messages: input.packet.messages })",
      "  });",
      "}"
    ].join("\n"))).toEqual([]);

    // The door in a NEIGHBOURING function does not vouch for this one.
    expect(rules([
      "function elsewhere(packet) { return readPromptFrame(packet); }",
      "async function complete(input) {",
      "  return await fetch(`${base}/chat/completions`, { body: '{}' });",
      "}"
    ].join("\n"))).toEqual(["3:VENDOR_POST_WITHOUT_THE_DOOR"]);

    // Prose is not a shape: a comment may name either of them.
    expect(rules([
      "// posts to /chat/completions with { role: 'system' } and no assertFramedPrompt",
      "const x = 1;"
    ].join("\n"))).toEqual([]);

    // A user or assistant turn is not the instruction compartment; only the
    // system one is forbidden, and only as a written literal.
    expect(rules("const turn = { role: 'user', content: safeText };")).toEqual([]);
    expect(rules("if (message.role === 'system') { return null; }")).toEqual([]);
  });

  it("finds neither of them under apps/api/src/support/", async () => {
    const files = (await typescriptFiles(SUPPORT_ROOT)).sort();
    // Vacuity guards: an empty scan, or a scan that finds no poster at all, is a
    // broken scan and not a clean tree.
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    let posts = 0;
    for (const file of files) {
      const scan = scanSupportPosts(file, await readFile(file, "utf8"));
      posts += scan.posts;
      for (const offence of scan.offences) {
        offenders.push(`${offence.file}:${offence.line} ${offence.rule}`);
      }
    }
    expect(posts).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
