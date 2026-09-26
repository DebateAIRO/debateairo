import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const normalized = (path) => path.split(sep).join("/");
const parse = (path, source) => ts.createSourceFile(
  path,
  source,
  ts.ScriptTarget.Latest,
  false,
  path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
);
const isClientModule = (source, path) => parse(path, source).statements.some((statement) =>
  ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client"
);

const collectSourceFiles = (projectRoot) => {
  const files = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const absolute = resolve(directory, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
        files.set(absolute, readFileSync(absolute, "utf8"));
      }
    }
  };
  for (const directory of ["app", "components", "lib"]) visit(resolve(projectRoot, directory));
  return files;
};

const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")];
const resolveModule = (files, projectRoot, importer, specifier) => {
  const base = specifier.startsWith("@/")
    ? resolve(projectRoot, specifier.slice(2))
    : specifier.startsWith(".") ? resolve(dirname(importer), specifier) : null;
  return base === null ? null : candidates(base).find((candidate) => files.has(candidate)) ?? null;
};

const importBindings = (files, projectRoot, modulePath, parsed) => {
  const bindings = new Map();
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveModule(files, projectRoot, modulePath, statement.moduleSpecifier.text);
    if (target === null) continue;
    const clause = statement.importClause;
    if (clause?.name) bindings.set(clause.name.text, { target, exportName: "default" });
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        bindings.set(element.name.text, { target, exportName: element.propertyName?.text ?? element.name.text });
      }
    } else if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, { target, exportName: null });
    }
  }
  return bindings;
};

const clientExport = (files, projectRoot, modulePath, exportName, seen = new Set()) => {
  const visitKey = `${modulePath}:${exportName}`;
  if (seen.has(visitKey)) return false;
  seen.add(visitKey);
  const source = files.get(modulePath);
  if (source === undefined) return false;
  if (isClientModule(source, modulePath)) return true;
  const parsed = parse(modulePath, source);
  const bindings = importBindings(files, projectRoot, modulePath, parsed);

  for (const statement of parsed.statements) {
    if (ts.isExportDeclaration(statement)) {
      const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? resolveModule(files, projectRoot, modulePath, statement.moduleSpecifier.text)
        : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const exported = statement.exportClause.elements.find((element) => element.name.text === exportName);
        if (exported) {
          const sourceName = exported.propertyName?.text ?? exported.name.text;
          if (target !== null && clientExport(files, projectRoot, target, sourceName, seen)) return true;
          const binding = bindings.get(sourceName);
          if (binding?.exportName && clientExport(files, projectRoot, binding.target, binding.exportName, seen)) return true;
        }
      } else if (!statement.exportClause && target !== null) {
        if (clientExport(files, projectRoot, target, exportName, seen)) return true;
      }
    }
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName || !declaration.initializer) continue;
        if (ts.isIdentifier(declaration.initializer)) {
          const binding = bindings.get(declaration.initializer.text);
          if (binding?.exportName && clientExport(files, projectRoot, binding.target, binding.exportName, seen)) return true;
        }
        if (ts.isPropertyAccessExpression(declaration.initializer) && ts.isIdentifier(declaration.initializer.expression)) {
          const binding = bindings.get(declaration.initializer.expression.text);
          if (binding?.exportName === null && clientExport(files, projectRoot, binding.target, declaration.initializer.name.text, seen)) return true;
        }
      }
    }
  }
  return false;
};

const boundaryFailures = (files, projectRoot) => {
  const failures = [];
  for (const [absolute, source] of files) {
    const path = normalized(relative(projectRoot, absolute));
    if (isClientModule(source, path)) continue;
    const parsed = parse(path, source);
    const bindings = importBindings(files, projectRoot, absolute, parsed);
    const clientAliases = new Set();
    const clientNamespaces = new Map();
    for (const [localName, binding] of bindings) {
      if (binding.exportName === null) clientNamespaces.set(localName, binding.target);
      else if (clientExport(files, projectRoot, binding.target, binding.exportName)) clientAliases.add(localName);
    }

    let changed = true;
    while (changed) {
      changed = false;
      const inspectAliases = (node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          const aliasesClient = ts.isIdentifier(node.initializer) && clientAliases.has(node.initializer.text);
          const aliasesNamespaceClient =
            ts.isPropertyAccessExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) &&
            clientNamespaces.has(node.initializer.expression.text) &&
            clientExport(files, projectRoot, clientNamespaces.get(node.initializer.expression.text), node.initializer.name.text);
          if ((aliasesClient || aliasesNamespaceClient) && !clientAliases.has(node.name.text)) {
            clientAliases.add(node.name.text);
            changed = true;
          }
        }
        ts.forEachChild(node, inspectAliases);
      };
      inspectAliases(parsed);
    }

    const inspectCalls = (node) => {
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && clientAliases.has(node.expression.text)) {
          failures.push(`${path}: calls client export ${node.expression.text}`);
        }
        if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
          const target = clientNamespaces.get(node.expression.expression.text);
          if (target && clientExport(files, projectRoot, target, node.expression.name.text)) {
            failures.push(`${path}: calls client export ${node.expression.getText(parsed)}`);
          }
        }
      }
      ts.forEachChild(node, inspectCalls);
    };
    inspectCalls(parsed);
  }
  return failures;
};

test("the boundary analyser follows barrel re-exports and local call aliases", () => {
  const fixtureRoot = resolve(root, ".boundary-fixture");
  const files = new Map([
    [resolve(fixtureRoot, "client.tsx"), '"use client"; export function useClientThing() {}'],
    [resolve(fixtureRoot, "barrel.ts"), 'export { useClientThing as useBarrelThing } from "./client";'],
    [resolve(fixtureRoot, "server.ts"), 'import { useBarrelThing } from "./barrel"; const alias = useBarrelThing; alias();']
  ]);
  assert.deepEqual(boundaryFailures(files, fixtureRoot), ["server.ts: calls client export alias"]);
});

test("server modules never invoke exports imported from client modules", () => {
  assert.deepEqual(boundaryFailures(collectSourceFiles(root), root), []);
});
