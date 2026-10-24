/**
 * Row-level security S01, cluster C3, step S3.6 (PLAN.md S3.5, S3.6; SPEC-v4 R19, R44; DECISIONS D36, D68): every
 * cross-account read site in packages/*, by reader id. A `crossAccount("<id>", …)` call sends the statements it runs to
 * the pool's cross-account target (api-system); outside such a frame a request's statements run as its T1 login with
 * only its own rows visible. So the set of methods that open a frame IS the set of readers that see more than one
 * account from inside a request — a site unrouted, routed under the wrong id, or one added without a SPEC row changes
 * this map. Parsed with the TypeScript AST (typescript-classic), so a comment or a string naming a call does not count.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** PLAN S3.6, verbatim as a map: reader id → `<file>#<method or function>` that opens its frame. */
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
    "packages/budget/src/model-spend.ts#readDaySpentMicros"
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
          const entry = `${path}#${site}`;
          const list = (map[reader.text] ??= []);
          if (!list.includes(entry)) list.push(entry);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const list of Object.values(map)) list.sort();
  return { map, unpinnable };
}

describe("row-level security S01 C3: the packages/* cross-account read sites", () => {
  it("S3.6 every crossAccount(\"<id>\") site in packages/*/src is exactly the reader map of PLAN S3.6, each id a literal inside a named method or function", async () => {
    const { map, unpinnable } = await crossAccountSites();
    expect(unpinnable).toEqual([]);
    expect(map).toEqual(EXPECTED);
  });
});
