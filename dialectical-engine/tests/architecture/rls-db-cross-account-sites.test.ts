/**
 * Row-level security S01, cluster C3, step S3.6 (PLAN.md S3.5, S3.6; SPEC-v4 R19, R44; DECISIONS D36, D68): every
 * cross-account read site in packages/*, by reader id. A `crossAccount("<id>", …)` call sends the statements it runs to
 * the pool's cross-account target (api-system); outside such a frame a request's statements run as its T1 login with
 * only its own rows visible. So the set of methods that open a frame IS the set of readers that see more than one
 * account from inside a request — a site unrouted, routed under the wrong id, or one added without a SPEC row changes
 * this map. Parsed with the TypeScript AST (typescript-classic), so a comment or a string naming a call does not count.
 * Each call SITE is one entry (F-C4-4, Ruling R-14): a second `crossAccount("<id>", …)` inside a method the map already
 * lists adds a second copy of that entry, so a new site under an id the map already holds changes the map too.
 * FIX-S01-p1b (SEC-N4): the same routing sends migrate()'s checkout to a pool's target outside a scope, so its
 * precondition — the migrator's pool has none — is swept here over every product caller.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * PLAN S3.6, verbatim as a map: reader id → `<file>#<method or function>` that opens its frame, one entry per call site
 * (17 sites: X10 3, X23 3, every other id 1; measured at b6a70bc0c, plus X23's site-holds reader from the merge of the
 * security fixes of audit run 3).
 */
const EXPECTED: Readonly<Record<string, readonly string[]>> = Object.freeze({
  X10: [
    "packages/db/src/publication.ts#listPublicRefs",
    "packages/db/src/publication.ts#readPublic",
    "packages/db/src/publication.ts#revalidatePublic"
  ],
  X18a: ["packages/db/src/sessions.ts#readRecoveryCodeForLogin"],
  X18b: ["packages/db/src/identity.ts#findAuditIdentityByBlindIndex"],
  X18c: ["packages/db/src/identity.ts#ownerRefByEmailBlindIndex"],
  X18d: ["packages/db/src/identity.ts#readMfaEnrollmentIdentity"],
  X18e: ["packages/db/src/identity.ts#readTotpEnrollment"],
  X18f: ["packages/db/src/identity.ts#readRecoveryCodeForConfirmation"],
  X18g: ["packages/db/src/identity.ts#readRecoveryCodeForUse"],
  X18j: ["packages/db/src/publication.ts#readAuthorPseudonym"],
  X20: ["packages/budget/src/estimate.ts#readRecentRunUsage"],
  X22: ["packages/db/src/run-wait.ts#siteLineBlocking"],
  X23: [
    "packages/budget/src/model-spend.ts#admitNewRun",
    "packages/budget/src/model-spend.ts#readDaySpentMicros",
    // Merge of dev into the security fixes of audit run 3: the site's counted holds are every account's too (the
    // room's SITE_DAY measure, and NV-47's language-check room inside the ask's request).
    "packages/budget/src/model-spend.ts#readSiteCountedHoldsMicros"
  ],
  X24: ["packages/db/src/index.ts#readRoleRotationCounts"]
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(?:ts|tsx|mts|cts)$/u.test(entry.name) && !/\.(?:test|spec)\.[cm]?tsx?$/u.test(entry.name)
      && !entry.name.endsWith(".d.ts") ? [path] : [];
  }));
  return nested.flat();
}

function enclosingName(node: ts.Node): string | null {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if ((ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current) || ts.isGetAccessorDeclaration(current))
      && current.name !== undefined) return current.name.getText();
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && current.parent !== undefined && ts.isVariableDeclaration(current.parent)) return current.parent.name.getText();
  }
  return null;
}

type Sites = Readonly<{ map: Record<string, string[]>; unpinnable: string[] }>;

async function crossAccountSites(): Promise<Sites> {
  const packages = (await readdir(join(PRODUCT_ROOT, "packages"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => join(PRODUCT_ROOT, "packages", entry.name, "src"));
  const files = (await Promise.all(packages.map((root) => sourceFiles(root).catch(() => [] as string[])))).flat().sort();
  const map: Record<string, string[]> = {};
  const unpinnable: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const path = relative(PRODUCT_ROOT, file);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "crossAccount") {
        const [reader] = node.arguments;
        const site = enclosingName(node);
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (reader === undefined || !ts.isStringLiteralLike(reader) || site === null) {
          unpinnable.push(`${path}:${line}`);
        } else {
          // One entry per call site, never de-duplicated (F-C4-4): a de-duplicated entry hides a second site.
          (map[reader.text] ??= []).push(`${path}#${site}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const list of Object.values(map)) list.sort();
  return { map, unpinnable };
}

async function productFiles(): Promise<string[]> {
  const roots = ["apps", "packages", "tools", "acceptance"].map((root) => join(PRODUCT_ROOT, root));
  return (await Promise.all(roots.map((root) => sourceFiles(root).catch(() => [] as string[])))).flat()
    .filter((file) => !/[\\/]tests?[\\/]/u.test(relative(PRODUCT_ROOT, file))).sort();
}

/**
 * FIX-S01-p1b, SEC-N4 (t_3787804c): every product call `migrate(<pool>)`, with how its pool is built. migrate() checks out
 * through `pool.connect()`, and outside a request scope a pool with a cross-account target sends that checkout to its
 * target (account-context.ts, accountContextRoute): on such a pool migrate() runs as the system login
 * (REV-S01-p1-security P4: `current_user=debateai_dev_api_system`, refused `permission denied for schema public`). The
 * pool argument is followed to what is assigned to it in the call's own function (its declaration and every `x = …`):
 * each `createPool(…)` reads `<- createPool no target`, or UNSAFE with a `crossAccount` option (or a spread) or a setCrossAccountTarget
 * call on that name in the file; anything else — a parameter, a harness's property — reads UNRESOLVED (<what it is>).
 */
async function migrateCallers(): Promise<string[]> {
  const found: string[] = [];
  const unwrap = (expression: ts.Expression): ts.Expression =>
    ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)
      ? unwrap(expression.expression) : expression;
  const isCreatePool = (expression: ts.Expression): expression is ts.CallExpression =>
    ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "createPool";
  const all = (root: ts.Node): ts.Node[] => {
    const nodes: ts.Node[] = [];
    const visit = (node: ts.Node): void => { nodes.push(node); ts.forEachChild(node, visit); };
    visit(root);
    return nodes;
  };
  for (const file of await productFiles()) {
    const text = await readFile(file, "utf8");
    if (!text.includes("migrate(")) continue;
    const path = relative(PRODUCT_ROOT, file);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const nodes = all(source);
    for (const call of nodes.filter((node): node is ts.CallExpression => ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === "migrate")) {
      const argument = call.arguments[0] === undefined ? undefined : unwrap(call.arguments[0]);
      const name = argument !== undefined && ts.isIdentifier(argument) ? argument.text : null;
      let scope: ts.Node = call;
      while (scope.parent !== undefined && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
      const assigned = name === null ? [] : all(scope).flatMap((node): ts.Expression[] => {
        if (ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer !== undefined) return [unwrap(node.initializer)];
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
          && ts.isIdentifier(node.left) && node.left.text === name) return [unwrap(node.right)];
        return [];
      }).filter((expression) => expression.kind !== ts.SyntaxKind.NullKeyword);
      const other = assigned.filter((expression) => !isCreatePool(expression));
      if (name === null || assigned.length === 0 || other.length > 0) {
        const what = name === null ? "not a name" : assigned.length === 0 ? `parameter ${name}` : other.map((expression) => expression.getText()).join(", ");
        found.push(`${path} ${call.getText()} UNRESOLVED (${what})`);
        continue;
      }
      for (const creation of assigned.filter(isCreatePool)) {
        const options = creation.arguments[1];
        const targeted = (options !== undefined && (!ts.isObjectLiteralExpression(options)
          || options.properties.some((property) => property.name?.getText() === "crossAccount" || ts.isSpreadAssignment(property))))
          || nodes.some((node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
            && node.expression.text === "setCrossAccountTarget" && node.arguments[0]?.getText() === name);
        found.push(`${path} ${call.getText()} <- createPool ${targeted ? "UNSAFE" : "no target"}`);
      }
    }
  }
  return found;
}

describe("row-level security S01 FIX p1b: migrate()'s pool has no cross-account target (SEC-N4)", () => {
  /**
   * Seven callers (measured at fce5c2d4c). The two UNRESOLVED ones take a harness's pool, traced by hand: runPesS01-
   * PublishSetAcceptance hands `seedVersion4` the pool of `startTestDatabase` (tests/support/testDatabase.ts:71,
   * `createPool(connectionString)`), and `startPracticeDatabase` builds its pools as `createPool(url)`
   * (tools/preview-practice/practice-throwaway-db.ts:61) — neither with a target. A new caller, or a caller whose pool
   * changes shape, changes this list.
   */
  it("SEC-N4 every product call of migrate(<pool>) in apps, packages, tools and acceptance receives a pool built by createPool with no crossAccount option and never given a target — 7 callers, 2 through a harness pool", async () => {
    expect(await migrateCallers()).toEqual([
      "acceptance/pes-accept-publish-set.ts migrate(pool as Pool) UNRESOLVED (parameter pool)",
      "acceptance/standing-db.ts migrate(existingPool) <- createPool no target",
      "acceptance/standing-db.ts migrate(pool) <- createPool no target",
      "apps/runner/src/migrate-cli.ts migrate(pool) <- createPool no target",
      "tools/preview-practice/practice-debate.ts migrate(pool) UNRESOLVED (database.pool)",
      "tools/rls/proof.ts migrate(adminPool) <- createPool no target",
      "tools/rls/proof.ts migrate(superuser) <- createPool no target"
    ]);
  });
});

describe("row-level security S01 C3: the packages/* cross-account read sites", () => {
  it("S3.6 every crossAccount(\"<id>\") site in packages/*/src is exactly the reader map of PLAN S3.6, each id a literal inside a named method or function", async () => {
    const { map, unpinnable } = await crossAccountSites();
    expect(unpinnable).toEqual([]);
    expect(map).toEqual(EXPECTED);
  });
});
