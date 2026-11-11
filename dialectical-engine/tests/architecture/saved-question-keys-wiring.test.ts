/**
 * V4 start step, Task 39e (saved questions spec 2026-11-04 §3.1, §3.8, §3.9; owner answer S4 A): THE QUESTION KEYS, AS apps/api/src/main.ts
 * WIRES THEM. One question-key store, made at boot over the user-key store's own root (USER_DEK_STORE_PATH) and that store, with no owner
 * look-up in it (it opens a key with the caller's own { userId, ownerRef }, so no new cross-account site: rls-cross-account-sites pins
 * the run-key store's X18h as the only one). The SAME store is the one the account closing destroys every question key with, the one
 * the saved-question service seals and opens with, and the one the data export opens each question with. The store of rows is 0162's,
 * on the API's own pool, as the account memory is. tests/support/r22-world.ts composes a question-key store for its service too.
 * Parsed with the TypeScript AST (typescript-classic), as rls-cross-account-sites does, so a comment naming a call does not count.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

async function parse(path: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(path, await readFile(join(PRODUCT_ROOT, path), "utf8"), ts.ScriptTarget.Latest, true);
}

function descendants(root: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => { found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}

const callsOf = (root: ts.Node, name: string): ts.CallExpression[] => descendants(root).filter((node): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name);
const newsOf = (root: ts.Node, name: string): ts.NewExpression[] => descendants(root).filter((node): node is ts.NewExpression =>
  ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name);

/** The `boot.run("<name>", …)` / `boot.runSync("<name>", …)` calls named `name`. */
function bootCalls(source: ts.SourceFile, name: string): ts.CallExpression[] {
  return descendants(source).filter((node): node is ts.CallExpression => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "boot" && ["run", "runSync"].includes(node.expression.name.text)
    && node.arguments[0] !== undefined && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === name);
}

const enclosedBy = (node: ts.Node, outer: ts.Node): boolean => node.getStart() >= outer.getStart() && node.getEnd() <= outer.getEnd();

/** The value an object literal gives `name` (a shorthand `name` reads as `name`), in every object literal under `root`. */
function propertyValues(root: ts.Node, name: string): string[] {
  return descendants(root).flatMap((node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === name) return [node.initializer.getText()];
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === name) return [name];
    return [];
  });
}

/** The name of the const whose initializer is `call`. */
function declaredAs(call: ts.Node): string | null {
  const declaration = call.parent;
  return declaration !== undefined && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
}

describe("apps/api/src/main.ts: one question-key store, the same one everywhere", () => {
  it("exactly one new FileSavedQuestionKeyStore(, inside boot.runSync(\"saved-question-key-store\", …), over USER_DEK_STORE_PATH and the user-key store, with no crossAccount( in it", async () => {
    const main = await parse("apps/api/src/main.ts");
    const stores = newsOf(main, "FileSavedQuestionKeyStore");
    expect(stores).toHaveLength(1);
    const boots = bootCalls(main, "saved-question-key-store");
    expect(boots).toHaveLength(1);
    expect((boots[0]!.expression as ts.PropertyAccessExpression).name.text).toBe("runSync");
    expect(enclosedBy(stores[0]!, boots[0]!)).toBe(true);
    expect((stores[0]!.arguments ?? []).map((argument) => argument.getText())).toEqual(["environment.USER_DEK_STORE_PATH", "dekStore"]);
    expect(callsOf(boots[0]!, "crossAccount")).toEqual([]);
    expect(boots[0]!.getText()).not.toMatch(/pool|query|owner_ref/u);
    expect(declaredAs(boots[0]!)).toBe("savedQuestionKeys");
    // The user-key store it wraps under is the one the run-key store and the account closing use.
    expect((newsOf(main, "FileRunContentKeyStore")[0]!.arguments ?? []).slice(0, 2).map((argument) => argument.getText()))
      .toEqual(["environment.USER_DEK_STORE_PATH", "dekStore"]);
  });

  it("the same store goes to the account closing (savedQuestionKeys), the service (keys) and the export's openSavedQuestion", async () => {
    const main = await parse("apps/api/src/main.ts");
    const closings = newsOf(main, "AccountErasureCoordinator");
    expect(closings).toHaveLength(1);
    expect(closings[0]!.arguments?.[1]?.getText()).toBe("dekStore");
    expect(propertyValues(closings[0]!, "savedQuestionKeys")).toEqual(["savedQuestionKeys"]);
    const services = callsOf(main, "createSavedQuestionService");
    expect(services).toHaveLength(1);
    expect(propertyValues(services[0]!, "keys")).toEqual(["savedQuestionKeys"]);
    expect(propertyValues(services[0]!, "key")).toEqual(["startStepKey"]);
    expect(propertyValues(services[0]!, "store")).toEqual(["savedQuestionStore"]);
    expect(propertyValues(main, "openSavedQuestion")).toEqual(["savedQuestionOpener(savedQuestionKeys)"]);
    // The export's opener sits with the others it is collected with.
    const collected = callsOf(main, "collectSnapshot");
    expect(collected).toHaveLength(1);
    expect(propertyValues(collected[0]!, "openSavedQuestion")).toEqual(["savedQuestionOpener(savedQuestionKeys)"]);
    expect(propertyValues(collected[0]!, "openUserField")).toHaveLength(1);
  });

  it("one store of rows, 0162's, on the API's own pool beside the account memory, and buildApi gets the service", async () => {
    const main = await parse("apps/api/src/main.ts");
    const rows = callsOf(main, "savedQuestionStoreFrom");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.arguments.map((argument) => argument.getText())).toEqual(["(text, values) => pool.query(text, values)"]);
    expect(declaredAs(rows[0]!)).toBe("savedQuestionStore");
    expect(callsOf(main, "accountMemoryStoreFrom")[0]!.arguments.map((argument) => argument.getText()))
      .toEqual(["(text, values) => pool.query(text, values)"]);
    const api = callsOf(main, "buildApi");
    expect(api).toHaveLength(1);
    expect(propertyValues(api[0]!, "savedQuestions")).toEqual(["savedQuestions"]);
    expect(declaredAs(callsOf(main, "createSavedQuestionService")[0]!)).toBe("savedQuestions");
  });
});

describe("tests/support/r22-world.ts composes the service with a question-key store too", () => {
  it("a MemorySavedQuestionKeyStore over its user-key store, handed to the service, which buildApi gets", async () => {
    const world = await parse("tests/support/r22-world.ts");
    const stores = newsOf(world, "MemorySavedQuestionKeyStore");
    expect(stores).toHaveLength(1);
    expect((stores[0]!.arguments ?? []).map((argument) => argument.getText())).toEqual(["userDeks"]);
    const store = declaredAs(stores[0]!);
    expect(store).not.toBeNull();
    const services = callsOf(world, "createSavedQuestionService");
    expect(services).toHaveLength(1);
    expect(propertyValues(services[0]!, "keys")).toEqual([store]);
    expect(propertyValues(services[0]!, "key")).toEqual(["startStepKey"]);
    expect(callsOf(services[0]!, "savedQuestionStoreFrom")).toHaveLength(1);
    expect(propertyValues(callsOf(world, "buildApi")[0]!, "savedQuestions")).toHaveLength(1);
  });
});
