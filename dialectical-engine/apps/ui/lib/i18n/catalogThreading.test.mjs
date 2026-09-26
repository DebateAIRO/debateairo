import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

// Guard (FIX-DEBATE-CATALOGS): a component whose props default a catalogue to
// English — `catalog = <ns>English`, a threaded `<ns>Catalog = <ns>English`, or a
// class component's `this.props.catalog ?? <ns>English` — renders English unless
// its caller hands it the interface locale's catalogue. Every production JSX
// usage of such a component must therefore pass that prop explicitly (or spread
// an object that provably carries it). A usage that silently falls back to
// English is the bug V saw: a Hebrew debate whose Synthesis panel read
// "Synthesis" in English.

const root = process.cwd();
const scannedDirs = ["app", "components", "lib"];

function sourceFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.(tsx|ts)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(join(root, dir));
  return out;
}

const files = scannedDirs.flatMap(sourceFiles);
const parsed = new Map(
  files.map((file) => [
    file,
    ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  ])
);
const rel = (file) => relative(root, file);

function isExported(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}
function isDefaultExport(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Default) !== 0;
}

const catalogProp = /^(catalog|[a-z][A-Za-z]*Catalog)$/;

/** The property signatures a props type annotation declares, following local aliases, interfaces and `A & B`. */
function propsMembers(typeNode, sf, seen = new Set()) {
  if (typeNode === undefined) return [];
  if (ts.isTypeLiteralNode(typeNode)) return [...typeNode.members];
  if (ts.isIntersectionTypeNode(typeNode) || ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.flatMap((part) => propsMembers(part, sf, seen));
  }
  if (ts.isParenthesizedTypeNode(typeNode)) return propsMembers(typeNode.type, sf, seen);
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const name = typeNode.typeName.text;
    if (name === "Readonly" || name === "Required" || name === "Partial") {
      return (typeNode.typeArguments ?? []).flatMap((argument) => propsMembers(argument, sf, seen));
    }
    if (seen.has(name)) return [];
    seen.add(name);
    for (const statement of sf.statements) {
      if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return propsMembers(statement.type, sf, seen);
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) return [...statement.members];
    }
  }
  return [];
}

/**
 * Props the first parameter destructures with an `…English` catalogue default,
 * or declares OPTIONAL and destructures with no default at all (`catalog?:
 * MessageCatalog` read bare: omitted, t() answers from its English backstop).
 * [{ prop, english }].
 */
function englishCatalogDefaults(fn) {
  const first = fn.parameters?.[0];
  if (first === undefined || !ts.isObjectBindingPattern(first.name)) return [];
  const sf = fn.getSourceFile();
  const optional = new Set(
    propsMembers(first.type, sf)
      .filter((member) => ts.isPropertySignature(member) && member.questionToken !== undefined && member.name !== undefined)
      .map((member) => member.name.getText())
  );
  const defaults = [];
  for (const element of first.name.elements) {
    const prop = (element.propertyName ?? element.name).getText();
    if (!catalogProp.test(prop)) continue;
    if (element.initializer !== undefined && ts.isIdentifier(element.initializer) && /English$/.test(element.initializer.text)) {
      defaults.push({ prop, english: element.initializer.text });
    } else if (element.initializer === undefined && optional.has(prop)) {
      defaults.push({ prop, english: "t()'s English backstop" });
    }
  }
  return defaults;
}

/** A class component's `this.props.<catalog> ?? <ns>English` fallbacks: [{ prop, english }]. */
function classEnglishFallbacks(cls) {
  const defaults = [];
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.getText() === "this.props" &&
      catalogProp.test(node.left.name.text) &&
      ts.isIdentifier(node.right) &&
      /English$/.test(node.right.text)
    ) {
      defaults.push({ prop: node.left.name.text, english: node.right.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(cls);
  return defaults;
}

// file -> Map<exportName | "default" | localName, { name, file, english }>
const componentsByFile = new Map();
for (const [file, sf] of parsed) {
  const found = new Map();
  const record = (localName, defaults, node) => {
    if (!/^[A-Z]/.test(localName) || defaults.length === 0) return;
    const component = { name: localName, file, defaults };
    found.set(`local:${localName}`, component);
    if (isExported(node)) found.set(isDefaultExport(node) ? "default" : localName, component);
  };
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      record(statement.name.text, englishCatalogDefaults(statement), statement);
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      record(statement.name.text, classEnglishFallbacks(statement), statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          record(declaration.name.text, englishCatalogDefaults(init), statement);
        }
      }
    }
  }
  // `export default Name;` after a local definition.
  for (const statement of sf.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      const local = found.get(`local:${statement.expression.text}`);
      if (local !== undefined) found.set("default", local);
    }
  }
  if (found.size > 0) componentsByFile.set(file, found);
}

function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  const stem = base.replace(/\.(m?js|jsx)$/, "");
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${stem}.tsx`, `${stem}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** localName -> component, for the components visible in `file`. */
function visibleComponents(file, sf) {
  const visible = new Map();
  const own = componentsByFile.get(file);
  if (own !== undefined) {
    for (const [key, component] of own) if (key.startsWith("local:")) visible.set(key.slice(6), component);
  }
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const exports = target === null ? undefined : componentsByFile.get(target);
    if (exports === undefined) continue;
    const clause = statement.importClause;
    if (clause.name !== undefined && exports.has("default")) visible.set(clause.name.text, exports.get("default"));
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        const imported = (specifier.propertyName ?? specifier.name).text;
        if (exports.has(imported)) visible.set(specifier.name.text, exports.get(imported));
      }
    }
  }
  return visible;
}

/** An object literal (or an identifier bound to one in this file) that has a `<prop>` property. */
function spreadCarries(expression, sf, prop) {
  const literalHasCatalog = (node) =>
    node !== undefined &&
    ts.isObjectLiteralExpression(node) &&
    node.properties.some((property) => property.name !== undefined && property.name.getText() === prop);
  if (literalHasCatalog(expression)) return true;
  if (!ts.isIdentifier(expression)) return false;
  let carries = false;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expression.text && literalHasCatalog(node.initializer)) carries = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return carries;
}

function usages() {
  const all = [];
  for (const [file, sf] of parsed) {
    if (!file.endsWith(".tsx")) continue;
    const visible = visibleComponents(file, sf);
    if (visible.size === 0) continue;
    const visit = (node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
        const component = visible.get(node.tagName.text);
        if (component !== undefined) {
          const attributes = node.attributes.properties;
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const missing = component.defaults.filter(({ prop }) => {
            const explicit = attributes.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === prop);
            const spread = attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute) && spreadCarries(attribute.expression, sf, prop));
            return !explicit && !spread;
          });
          all.push({ where: `${rel(file)}:${line}`, tag: node.tagName.text, component, missing });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return all;
}

const found = usages();

test("the guard sees the English-defaulted components the debate page renders", () => {
  const names = new Set([...componentsByFile.values()].flatMap((map) => [...map.values()].map((component) => component.name)));
  for (const name of [
    "SynthesisPanel",
    "VerdictBanner",
    "RecommendedInvestigations",
    "NodeDetailDrawer",
    "ChallengePopover",
    "InvestigationDrawer",
    "DebateWorkspaceDrawer",
    "GuideModal",
    "AnswerHonestyDrawer",
    "PublicationControl",
    "ModelMetaLine",
    "ModelBadge",
    "ScoringErrorBoundary"
  ]) {
    assert.ok(names.has(name), `${name} should be recognised as an English-defaulted component`);
  }
  const tags = new Set(found.map((usage) => usage.tag));
  for (const name of ["SynthesisPanel", "ModelMetaLine", "ModelBadge"]) {
    assert.ok(tags.has(name), `the guard should find at least one production usage of <${name}>`);
  }
});

test("every usage of an English-defaulted component passes the locale's catalogue", () => {
  const missing = found.flatMap((usage) =>
    usage.missing.map(({ prop, english }) => `${usage.where}: <${usage.tag}> passes no ${prop}= (falls back to ${english}, ${rel(usage.component.file)})`)
  );
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------
// One level down (FIX-DEBATE-CATALOGS follow-up 2, V: "This needs to be done in
// all languages"): plain functions and module constants.
//
//  - A function whose parameter defaults a catalogue to English
//    (`catalog: MessageCatalog = <ns>English`), or that reads
//    `<param>.catalog ?? <ns>English`, renders English whenever a caller omits
//    the catalogue. Every production CALL must pass it.
//  - A module-level constant built from an English catalogue (an English-
//    defaulting function called at module load, or an `…English` import read
//    outside any function) is English forever: it cannot follow the locale.
//    It must become a catalogue-taking function used at render time.
// ---------------------------------------------------------------------------

function isEnglishImport(identifier) {
  return /English$/.test(identifier);
}

function functionLikeOf(node) {
  if (ts.isFunctionDeclaration(node)) return node;
  if (ts.isVariableDeclaration(node) && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
    return node.initializer;
  }
  return null;
}

/** [{ index, kind: "positional" | "field", english }] for an English-defaulting function. */
function englishParameterDefaults(fn) {
  const found = [];
  fn.parameters.forEach((parameter, index) => {
    if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        const prop = (element.propertyName ?? element.name).getText();
        if (catalogProp.test(prop) && element.initializer !== undefined && ts.isIdentifier(element.initializer) && isEnglishImport(element.initializer.text)) {
          found.push({ index, kind: "field", field: prop, english: element.initializer.text });
        }
      }
    }
    if (ts.isIdentifier(parameter.name) && parameter.initializer !== undefined && ts.isIdentifier(parameter.initializer) && isEnglishImport(parameter.initializer.text)) {
      found.push({ index, kind: "positional", english: parameter.initializer.text });
    }
    // An OPTIONAL catalogue (`catalog?: MessageCatalog`) is the same fallback in
    // another spelling: omitted, t() answers from its English backstop.
    if (
      ts.isIdentifier(parameter.name) &&
      catalogProp.test(parameter.name.text) &&
      parameter.questionToken !== undefined &&
      parameter.initializer === undefined &&
      parameter.type !== undefined &&
      /\bMessageCatalog\b/.test(parameter.type.getText())
    ) {
      found.push({ index, kind: "positional", english: "t()'s English backstop" });
    }
    if (ts.isIdentifier(parameter.name) && fn.body !== undefined) {
      const name = parameter.name.text;
      const visit = (node) => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
          ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === name &&
          catalogProp.test(node.left.name.text) &&
          ts.isIdentifier(node.right) &&
          isEnglishImport(node.right.text) &&
          !found.some((entry) => entry.index === index)
        ) {
          found.push({ index, kind: "field", field: node.left.name.text, english: node.right.text });
        }
        ts.forEachChild(node, visit);
      };
      visit(fn.body);
    }
  });
  return found;
}

// file -> Map<key, fn record>; key is `local:<name>` or the export name / "default".
const functionsByFile = new Map();
for (const [file, sf] of parsed) {
  const found = new Map();
  const visitTop = (statement) => {
    const candidates = ts.isVariableStatement(statement) ? statement.declarationList.declarations : [statement];
    for (const candidate of candidates) {
      const fn = functionLikeOf(candidate);
      if (fn === null || candidate.name === undefined || !ts.isIdentifier(candidate.name)) continue;
      if (/^[A-Z]/.test(candidate.name.text)) continue;
      // Components are the JSX guard's business (their props are one object).
      const defaults = englishParameterDefaults(fn);
      if (defaults.length === 0) continue;
      const record = { name: candidate.name.text, file, defaults };
      found.set(`local:${record.name}`, record);
      if (isExported(statement)) found.set(isDefaultExport(statement) ? "default" : record.name, record);
    }
  };
  sf.statements.forEach(visitTop);
  if (found.size > 0) functionsByFile.set(file, found);
}

function visibleFunctions(file, sf) {
  const visible = new Map();
  const own = functionsByFile.get(file);
  if (own !== undefined) for (const [key, fn] of own) if (key.startsWith("local:")) visible.set(key.slice(6), fn);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const exports = target === null ? undefined : functionsByFile.get(target);
    if (exports === undefined) continue;
    const clause = statement.importClause;
    if (clause.name !== undefined && exports.has("default")) visible.set(clause.name.text, exports.get("default"));
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        const imported = (specifier.propertyName ?? specifier.name).text;
        if (exports.has(imported)) visible.set(specifier.name.text, exports.get(imported));
      }
    }
  }
  return visible;
}

function argumentCarries(argument, entry, sf) {
  if (argument === undefined) return false;
  if (ts.isIdentifier(argument) && argument.text === "undefined") return false;
  if (entry.kind === "positional") return true;
  // A field default: an object literal must name the field (a non-literal is opaque; accept it
  // only when it is an identifier bound to a literal that names the field).
  if (ts.isObjectLiteralExpression(argument)) {
    return argument.properties.some((property) => property.name !== undefined && property.name.getText() === entry.field);
  }
  return spreadCarries(argument, sf, entry.field);
}

function insideFunction(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isFunctionLike(current) || ts.isClassElement(current)) return true;
  }
  return false;
}

function insideType(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isStatement(current)) return false;
  }
  return false;
}

// The only module-level English reads that are not copy. Each is named by file
// and identifier, with the reason; anything else built from an English
// catalogue at module load fails.
const moduleLevelAllowlist = new Map([
  // t()'s missing-KEY backstop, consulted only when the catalogue handed in lacks
  // the key. catalog.test.mjs asserts every one of the 35 locales carries exactly
  // the English key set, and catalogNamespaces.test.mjs asserts every catalogue
  // handed over carries the namespaces its reader reads, so a threaded catalogue
  // never reaches it.
  ["lib/i18n/translate.ts:chromeEnglish", "t() missing-key backstop"],
  ["lib/i18n/translate.ts:homeEnglish", "t() missing-key backstop"],
  ["lib/i18n/translate.ts:newDebateEnglish", "t() missing-key backstop"],
  ["lib/i18n/translate.ts:supportEnglish", "t() missing-key backstop"],
  ["lib/i18n/translate.ts:timeEnglish", "t() missing-key backstop"],
  // The answer export's machine-readable disclosure record (a downloaded file's
  // metadata, fixed-language like its field names), not interface copy.
  ["lib/aiDisclosure.ts:homeEnglish", "export file disclosure record"]
]);

const callFindings = [];
const moduleFindings = [];
for (const [file, sf] of parsed) {
  const visible = visibleFunctions(file, sf);
  const englishImports = new Set();
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && /\/messages\/en\/[^/]+\.json$/.test(statement.moduleSpecifier.text) && statement.importClause?.name !== undefined) {
      englishImports.add(statement.importClause.name.text);
    }
  }
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = visible.get(node.expression.text);
      if (fn !== undefined) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        let fallsBack = false;
        for (const entry of fn.defaults) {
          if (!argumentCarries(node.arguments[entry.index], entry, sf)) {
            fallsBack = true;
            callFindings.push(`${rel(file)}:${line}: ${node.expression.text}(…) passes no catalogue (falls back to ${entry.english}, ${rel(fn.file)})`);
          }
        }
        // A module-level call that does pass a catalogue can only pass an English
        // import (nothing else exists at module load); that read is caught below.
        if (fallsBack && !insideFunction(node)) {
          moduleFindings.push(`${rel(file)}:${line}: module-level ${node.expression.text}(…) is built once, in English`);
        }
      }
    }
    if (
      ts.isIdentifier(node) &&
      englishImports.has(node.text) &&
      !insideFunction(node) &&
      !insideType(node) &&
      !ts.isImportClause(node.parent) &&
      !moduleLevelAllowlist.has(`${rel(file)}:${node.text}`)
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      moduleFindings.push(`${rel(file)}:${line}: module-level read of ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

test("the guard sees the English-defaulting helpers the debate surfaces call", () => {
  const names = new Set([...functionsByFile.values()].flatMap((map) => [...map.values()].map((fn) => fn.name)));
  for (const name of ["roleLabel", "scrutinyStatus", "challengeActions", "modelMeta", "formatScorePercent"]) {
    assert.ok(names.has(name), `${name} should be recognised as an English-defaulting function`);
  }
});

test("every call to an English-defaulting function passes the locale's catalogue", () => {
  assert.deepEqual(callFindings, []);
});

test("no module-level constant is built from an English catalogue", () => {
  assert.deepEqual(moduleFindings, []);
});
