import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

/**
 * Paid plans P8c. A read made while a transaction holds the owner lock must run on that transaction's own
 * connection: P1b's reads take a trailing executor for exactly this. A read on the pool there waits for a SECOND
 * connection while the first is held, and the API's pool (ten connections, pg's unbounded wait) then hangs every
 * route once ten such transactions wait on each other.
 *
 * Scanned as an AST over apps/api/src/billing, so a comment naming a read does not trip it. In any function that
 * holds a transaction's client — a `withTransaction` callback (its first parameter, whatever its name), a function
 * with a parameter named `client`, or one that takes `client` out of a settlement context — every BillingRepository
 * read passes that client (or `context.client`), and the reads that have no executor form (L3a's
 * `acceptances.latest`, B5's `entitlements.current`, the erasure port, P11a's `freshQuote`) are not made there at
 * all. A nested function inherits the scope: it runs inside the transaction too. Calls into other functions are not
 * followed, on purpose: a helper that takes the client is a scope of its own, so the rule reaches it there.
 */

const BILLING_ROOT = "apps/api/src/billing";
const READS: ReadonlySet<string> = new Set([
  "subscriptionForOwner", "subscriptionsForOwner", "subscriptionEvents", "chargesForSubscription", "charge", "quote",
  "customerByOwner", "latestProfile"
]);
/** A BillingRepository, under the names billing code gives it (`this.deps.repository`, `deps.billing`, …). */
const REPOSITORY = /(^|\.)(repository|billing)$/;
/** Reads with no executor form, as [receiver pattern, method]: never made inside a transaction. */
const NO_EXECUTOR_FORM: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)acceptances$/, "latest"],
  [/(^|\.)entitlements$/, "current"],
  [/.*/, "erasureBlocks"],
  [/.*/, "erasurePending"],
  [/.*/, "freshQuote"]
];

export type TransactionReadOffence = Readonly<{
  file: string; line: number; call: string; rule: "READ_OFF_THE_TRANSACTION" | "READ_WITHOUT_EXECUTOR_FORM";
}>;

type TransactionReadScan = Readonly<{ offences: ReadonlyArray<TransactionReadOffence>; reads: number }>;

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
}

/** The name under which `fn` holds a transaction's client, or null when it holds none. */
function clientName(fn: ts.FunctionLikeDeclaration): string | null {
  const parent = fn.parent;
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
    && parent.expression.name.text === "withTransaction" && parent.arguments[0] === fn) {
    const first = fn.parameters[0];
    if (first !== undefined && ts.isIdentifier(first.name)) return first.name.text;
  }
  if (fn.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "client")) return "client";
  let declared = false;
  const walk = (node: ts.Node): void => {
    if (declared || isFunctionLike(node)) return;
    if ((ts.isBindingElement(node) || ts.isVariableDeclaration(node)) && ts.isIdentifier(node.name)
      && node.name.text === "client") {
      declared = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  if (fn.body !== undefined) ts.forEachChild(fn.body, walk);
  return declared ? "client" : null;
}

function passesClient(call: ts.CallExpression, name: string): boolean {
  return call.arguments.some((argument) => (ts.isIdentifier(argument) && argument.text === name)
    || (ts.isPropertyAccessExpression(argument) && argument.name.text === "client"));
}

export function scanTransactionReads(file: string, text: string): TransactionReadScan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const offences: TransactionReadOffence[] = [];
  let reads = 0;
  const visit = (node: ts.Node, scope: string | null): void => {
    const inner = isFunctionLike(node) ? clientName(node) ?? scope : scope;
    if (inner !== null && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText(source);
      const at = { file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, call: `${receiver}.${method}` };
      if (READS.has(method) && REPOSITORY.test(receiver)) {
        reads += 1;
        if (!passesClient(node, inner)) offences.push(Object.freeze({ ...at, rule: "READ_OFF_THE_TRANSACTION" as const }));
      }
      if (NO_EXECUTOR_FORM.some(([pattern, name]) => name === method && pattern.test(receiver))) {
        offences.push(Object.freeze({ ...at, rule: "READ_WITHOUT_EXECUTOR_FORM" as const }));
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(source, null);
  return Object.freeze({ offences, reads });
}

async function billingSources(): Promise<Array<Readonly<{ file: string; text: string }>>> {
  const names = (await readdir(BILLING_ROOT, { recursive: true }))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts")).sort();
  return Promise.all(names.map(async (name) => ({ file: join(BILLING_ROOT, name), text: await readFile(join(BILLING_ROOT, name), "utf8") })));
}

describe("P8c billing reads under the owner lock go through the transaction's client", () => {
  it("flags a read on the pool and a read with no executor form inside a transaction, and nothing outside one", () => {
    const fixture = [
      "class Service {",
      "  async run(): Promise<void> {",
      "    await this.deps.repository.subscriptionEvents('s');",
      "    await this.deps.repository.withTransaction(async (c) => {",
      "      await this.deps.jobs.lockOwner(c, 'o');",
      "      await this.deps.repository.subscriptionEvents('s');",
      "      await Promise.all(['a'].map((id) => this.deps.repository.charge(id)));",
      "      await this.deps.acceptances.latest('o', 'TERMS');",
      "      await this.deps.repository.subscriptionEvents('s', c);",
      "    });",
      "  }",
      "  async settle(context: { client: unknown }): Promise<void> {",
      "    const { client } = context;",
      "    await deps.billing.customerByOwner('o', client);",
      "    await deps.billing.quote('q', 'o');",
      "  }",
      "}"
    ].join("\n");
    const scan = scanTransactionReads("fixture.ts", fixture);
    expect(scan.offences.map((offence) => [offence.line, offence.call, offence.rule])).toEqual([
      [6, "this.deps.repository.subscriptionEvents", "READ_OFF_THE_TRANSACTION"],
      [7, "this.deps.repository.charge", "READ_OFF_THE_TRANSACTION"],
      [8, "this.deps.acceptances.latest", "READ_WITHOUT_EXECUTOR_FORM"],
      [15, "deps.billing.quote", "READ_OFF_THE_TRANSACTION"]
    ]);
    // The line-3 read runs before any transaction and is not counted; the five inside one are.
    expect(scan.reads).toBe(5);
  });

  it("finds no such read in apps/api/src/billing, and is not vacuous", async () => {
    const sources = await billingSources();
    expect(sources.map((source) => source.file)).toContain(join(BILLING_ROOT, "checkout.ts"));
    const scans = sources.map((source) => scanTransactionReads(source.file, source.text));
    expect(scans.flatMap((scan) => scan.offences)).toEqual([]);
    // P8c's checkout alone makes seven reads under its lock; a scanner that sees none is not scanning.
    expect(scans.reduce((total, scan) => total + scan.reads, 0)).toBeGreaterThanOrEqual(7);
  });
});
