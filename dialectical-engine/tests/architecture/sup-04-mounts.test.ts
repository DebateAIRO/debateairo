import { readFile,readdir } from "node:fs/promises";
import { extname,join } from "node:path";
import ts from "typescript-classic";
import { describe,expect,it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory,{ withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /[.]tsx$/u.test(entry.name) ? [path] : [];
  }))).flat();
}

function importedSpecifiers(file: string,source: string): readonly string[] {
  const root = ts.createSourceFile(
    file,source,ts.ScriptTarget.Latest,true,
    extname(file) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    ts.forEachChild(node,visit);
  };
  visit(root);
  return specifiers;
}

describe("SUP-04 widget mount boundary", () => {
  it("admits exactly the four product-route importers", async () => {
    const files = await sourceFiles("apps/ui");
    const importers = (await Promise.all(files.map(async (file) => ({
      file,imports: importedSpecifiers(file,await readFile(file,"utf8"))
    })))).filter(({ imports }) => imports.includes("@/components/support/SupportWidget"))
      .map(({ file }) => file).sort();
    expect(importers).toEqual([
      "apps/ui/app/debate/[id]/DebatePageGate.tsx",
      "apps/ui/app/new/page.tsx",
      "apps/ui/app/page.tsx",
      "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx"
    ]);
  });

  it("keeps the root layout and every zone route structurally support-free", async () => {
    const guarded = [
      "apps/ui/app/layout.tsx",
      ...(await Promise.all([
        "login","sign-up","verify-email","enroll-mfa","settings"
      ].map((directory) => sourceFiles(`apps/ui/app/${directory}`)))).flat()
    ];
    for (const file of guarded) {
      const imports = importedSpecifiers(file,await readFile(file,"utf8"));
      expect(imports).not.toContain("@/components/support/SupportWidget");
      expect(imports).not.toContain("@/components/support/Assistant");
    }
  });
});
