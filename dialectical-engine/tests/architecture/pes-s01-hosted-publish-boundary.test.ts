import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const entry = "apps/runner/src/hosted-provider-set-publish-cli.ts";
const library = "apps/runner/src/hosted-provider-set.ts";

async function runtimeGraph(start: string): Promise<string[]> {
  const seen = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const source = ts.createSourceFile(path, await readFile(join(root, path), "utf8"), ts.ScriptTarget.Latest, true);
    const specifiers: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly
        && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifiers.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        pending.push(relative(root, resolve(root, dirname(path), specifier.replace(/\.js$/u, ".ts"))));
      } else if (specifier.startsWith("@debateai/")) {
        pending.push(`packages/${specifier.slice("@debateai/".length)}/src/index.ts`);
      }
    }
  }
  return [...seen].sort();
}

function filesNamingRoster(pathspecs: string[]): string[] {
  try {
    const output = execFileSync("git", ["grep", "-l", "--untracked", "PROVIDER_HOSTED_ROSTER_PATH", "--", ...pathspecs],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return output.trim().split("\n").filter(Boolean).sort();
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return [];
    throw error;
  }
}

describe("PES S01 hosted publish boundary", () => {
  // H1 property: every publication on this path declares hosted, without a development publisher.
  it('R1.4: the command\'s one publishGeneral literal declares deployment "hosted"', async () => {
    const literals: string[] = [];
    for (const file of [library, entry]) {
      const source = await readFile(join(root, file), "utf8");
      expect(source).not.toContain("publishDevelopmentDeploymentRegisterProviderSet");
      for (let at = source.indexOf("publishGeneral({"); at !== -1; at = source.indexOf("publishGeneral({", at + 1)) {
        const open = source.indexOf("{", at);
        let depth = 0;
        let end = open;
        for (; end < source.length; end += 1) {
          if (source[end] === "{") depth += 1;
          if (source[end] === "}") depth -= 1;
          if (depth === 0) break;
        }
        literals.push(source.slice(open, end + 1));
      }
    }
    expect(literals).toHaveLength(1);
    expect(literals[0]).toMatch(/\bdeployment: "hosted"/u);
  });

  // H2 property: value imports cannot pull development modules or files outside the runtime roots.
  it("R1.6: the command's runtime module graph holds no dev- module", async () => {
    const graph = await runtimeGraph(entry);
    expect(graph).toEqual(expect.arrayContaining([library,
      "packages/register/src/configured-provider-set.ts", "packages/providers/src/index.ts"]));
    expect(graph).not.toContain("apps/runner/src/dev-provider-panel.ts");
    for (const path of graph) {
      expect(path.split("/").some(segment => segment.startsWith("dev-")), path).toBe(false);
      expect(path.startsWith("apps/runner/src/") || path.startsWith("packages/"), path).toBe(true);
    }
  });

  // H3 property: the roster key belongs only to this operator, never to a boot loader or env example.
  it("R1.13: PROVIDER_HOSTED_ROSTER_PATH is named in one file under apps and packages", () => {
    expect(filesNamingRoster(["apps", "packages"])).toEqual([entry]);
    expect(filesNamingRoster(["*.env.example"])).toEqual([]);
  });

  // H4 property: the public package script must invoke this command, not another entry point.
  it("the operator runs the command as pnpm hosted:publish-provider-set", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(manifest.scripts["hosted:publish-provider-set"]).toBe("tsx apps/runner/src/hosted-provider-set-publish-cli.ts");
  });
});
