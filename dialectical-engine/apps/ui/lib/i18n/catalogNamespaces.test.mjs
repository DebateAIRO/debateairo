import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

// Guard (FIX-DEBATE-CATALOGS follow-up 4, review F3b): handing a component the
// WRONG namespace is the same bug as handing it none. t(catalog, "home.aiLink")
// with a debateChrome catalogue misses the key and answers from t()'s English
// backstop, so a Hebrew page shows English. catalogThreading.test.mjs proves a
// catalogue is passed; this proves the catalogue passed CARRIES the keys read.
//
// Static and conservative:
//  - REQUIRED: for every top-level function/component, the namespaces of the
//    literal keys it reads through each catalogue parameter/prop (`t(p, "ns.…")`,
//    `tPlural(p, "ns.…")`, both arms of a `?:`, a template's literal head), plus
//    whatever it forwards that catalogue to (fixpoint over calls and JSX props).
//  - PROVIDED: what an expression at a call site carries, traced to its source —
//    `loadNamespace(locale, "ns")` (also through `Promise.all` destructuring),
//    `useChromeI18n()` (the layout's chrome + debateViews + support), a prop's
//    `<ns>English` default, `{ ...a, ...b }` unions, `useConsentCatalog()`, and,
//    last, a `<ns>Catalog` name. An untraceable source is skipped, never guessed.
//  - Every call, JSX prop and direct t() read whose provided set is known must
//    cover the required namespaces.
//  - Follow-up 5 (re-check R1): an English-DEFAULTED slot (`catalog =
//    miscEnglish`, `this.props.catalog ?? miscEnglish`, `input.catalog ??
//    composeEnglish`) is required like any other slot, so handing it the wrong
//    namespace is RED; its English default is checked separately (the English
//    path). Class components are indexed through `this.props.<catalog>`. In a
//    `{ ...known, ...slot }` spread, a missing namespace is owed by the slot
//    whose default (or `<ns>Catalog` name) owns it.
//  - Keys built at run time (`t(catalog, key)` with `key` from a table) name no
//    namespace and are not traced.

const root = process.cwd();
const scannedDirs = ["app", "components", "lib"];
const namespaces = new Set(
  readdirSync(join(root, "messages/en"))
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => name.replace(/\.json$/, ""))
);
const LAYOUT_SHARED = ["chrome", "debateViews", "support"];
const catalogName = /^(catalog|[a-z][A-Za-z]*Catalog)$/;

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

const parsed = new Map(
  scannedDirs.flatMap(sourceFiles).map((file) => [
    file,
    ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  ])
);
const rel = (file) => relative(root, file);
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

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

// ---------------------------------------------------------------------------
// Index: every top-level function and class component, with its catalogue slots.
// A slot is a positional parameter (key `#<index>`), a destructured prop of the
// first parameter (key `.<prop>`), a `<first parameter>.<prop>` read when that
// parameter is not destructured, or a class component's `this.props.<prop>`
// (key `.<prop>`), whose name looks like a catalogue. `defaultNs` is the
// namespace of its English fallback: `= xEnglish` or `?? xEnglish`.
//
// Follow-up 5 (re-check R1): a DEFAULTED slot is a slot like any other. What its
// owner reads or forwards through it is a requirement on every hand-off into it;
// the English default is checked separately, as the English path.
// ---------------------------------------------------------------------------

const functions = new Map(); // id -> { id, name, file, sf, fn, slots: Map<accessText, { key, defaultNs|null }>, isClass }
const byFile = new Map(); // file -> Map<exportKey|local:name, id>

function englishNamespace(identifier) {
  const match = /^([a-zA-Z]+)English$/.exec(identifier);
  return match !== null && namespaces.has(match[1]) ? match[1] : null;
}

/** `x ?? fooEnglish` anywhere under `node`, keyed by the text of `x`. */
function nullishEnglishDefaults(node) {
  const found = new Map();
  const visit = (current) => {
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && ts.isIdentifier(current.right)) {
      const ns = englishNamespace(current.right.text);
      if (ns !== null) found.set(current.left.getText(), ns);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/** Property reads `<base>.<catalogName>` under `node`: prop -> access text. */
function catalogPropertyReads(node, baseText) {
  const found = new Map();
  const visit = (current) => {
    if (ts.isPropertyAccessExpression(current) && current.expression.getText() === baseText && catalogName.test(current.name.text)) {
      found.set(current.name.text, current.getText());
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

for (const [file, sf] of parsed) {
  const local = new Map();
  const record = (name, fn, statement, slots, isClass) => {
    const id = `${rel(file)}#${name}`;
    functions.set(id, { id, name, file, sf, fn, slots, isClass });
    local.set(`local:${name}`, id);
    const flags = ts.getCombinedModifierFlags(statement);
    if (flags & ts.ModifierFlags.Export) local.set(flags & ts.ModifierFlags.Default ? "default" : name, id);
  };
  const register = (name, fn, statement) => {
    const slots = new Map();
    const fallbacks = nullishEnglishDefaults(fn.body ?? fn);
    const initNs = (init) => (init && ts.isIdentifier(init) ? englishNamespace(init.text) : null);
    fn.parameters.forEach((parameter, index) => {
      if (ts.isIdentifier(parameter.name) && catalogName.test(parameter.name.text)) {
        const text = parameter.name.text;
        slots.set(text, { key: `#${index}`, defaultNs: initNs(parameter.initializer) ?? fallbacks.get(text) ?? null });
      } else if (index === 0 && ts.isObjectBindingPattern(parameter.name)) {
        for (const element of parameter.name.elements) {
          const prop = (element.propertyName ?? element.name).getText();
          if (!catalogName.test(prop) || !ts.isIdentifier(element.name)) continue;
          const text = element.name.text;
          slots.set(text, { key: `.${prop}`, defaultNs: initNs(element.initializer) ?? fallbacks.get(text) ?? null });
        }
      } else if (index === 0 && ts.isIdentifier(parameter.name) && fn.body !== undefined) {
        // `function f(input) { … input.composeCatalog ?? composeEnglish … }`
        for (const [prop, access] of catalogPropertyReads(fn.body, parameter.name.text)) {
          slots.set(access, { key: `.${prop}`, defaultNs: fallbacks.get(access) ?? null });
        }
      }
    });
    record(name, fn, statement, slots, false);
  };
  const registerClass = (statement) => {
    // `class X extends React.Component<Props>`: its catalogue props are read as
    // `this.props.<prop>`, usually `this.props.catalog ?? miscEnglish`.
    const slots = new Map();
    const fallbacks = nullishEnglishDefaults(statement);
    for (const [prop, access] of catalogPropertyReads(statement, "this.props")) {
      slots.set(access, { key: `.${prop}`, defaultNs: fallbacks.get(access) ?? null });
    }
    record(statement.name.text, statement, statement, slots, true);
  };
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && statement.body !== undefined) {
      register(statement.name.text, statement, statement);
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      registerClass(statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          register(declaration.name.text, init, statement);
        }
      }
    }
  }
  for (const statement of sf.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression) && local.has(`local:${statement.expression.text}`)) {
      local.set("default", local.get(`local:${statement.expression.text}`));
    }
  }
  byFile.set(file, local);
}

function visibleFunctions(file, sf) {
  const visible = new Map();
  for (const [key, id] of byFile.get(file) ?? []) if (key.startsWith("local:")) visible.set(key.slice(6), id);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const target = resolveModule(file, statement.moduleSpecifier.text);
    const exports = target === null ? undefined : byFile.get(target);
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

// ---------------------------------------------------------------------------
// Keys: the namespaces a key expression can name.
// ---------------------------------------------------------------------------

function keyNamespaces(expression) {
  if (expression === undefined) return [];
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    const ns = expression.text.split(".")[0];
    return expression.text.includes(".") && namespaces.has(ns) ? [ns] : [];
  }
  if (ts.isTemplateExpression(expression)) {
    const head = expression.head.text;
    const ns = head.split(".")[0];
    return head.includes(".") && namespaces.has(ns) ? [ns] : [];
  }
  if (ts.isConditionalExpression(expression)) return [...keyNamespaces(expression.whenTrue), ...keyNamespaces(expression.whenFalse)];
  if (ts.isParenthesizedExpression(expression)) return keyNamespaces(expression.expression);
  return [];
}

// ---------------------------------------------------------------------------
// Provided: what an expression inside `fn` carries.
//   { kind: "set", ns }                    fully known namespaces
//   { kind: "slot", slotKey, defaultNs }   the owner's own catalogue slot
//   { kind: "mix", ns, slots: [slot…] }    `{ ...known, ...slot }`
//   { kind: "unknown" }                    untraceable: skipped, never guessed
// ---------------------------------------------------------------------------

function declarationsIn(fnNode) {
  const found = new Map(); // name -> { init, bindingIndex?, property? }
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      if (ts.isIdentifier(node.name)) found.set(node.name.text, { init: node.initializer });
      else if (ts.isArrayBindingPattern(node.name)) {
        node.name.elements.forEach((element, index) => {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) found.set(element.name.text, { init: node.initializer, bindingIndex: index });
        });
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) {
            found.set(element.name.text, { init: node.initializer, property: (element.propertyName ?? element.name).getText() });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fnNode);
  return found;
}

const unwrapAwait = (node) => {
  let current = node;
  while (current && (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current))) current = current.expression;
  return current;
};

function loadNamespaceArgument(call) {
  if (!ts.isCallExpression(call) || call.expression.getText() !== "loadNamespace") return null;
  const ns = call.arguments[1];
  return ns && ts.isStringLiteral(ns) && namespaces.has(ns.text) ? ns.text : null;
}

/** Spreads/aliases followed before a hand-off is called unknown (a trace bound, not a tree depth). */
const MAX_TRACE_HOPS = 6;
const UNKNOWN = Object.freeze({ kind: "unknown" });
const setOf = (...ns) => ({ kind: "set", ns: new Set(ns) });

function slotValue(slot) {
  return { kind: "slot", slotKey: slot.key, defaultNs: slot.defaultNs };
}

function provided(expression, fnRecord, hops = 0) {
  if (expression === undefined || hops > MAX_TRACE_HOPS) return UNKNOWN;
  const node = unwrapAwait(expression);
  const accessSlot = fnRecord.slots.get(node.getText());
  if (accessSlot !== undefined && (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node))) return slotValue(accessSlot);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    // `x ?? fooEnglish`: x when the caller supplied it, the English default otherwise.
    const left = provided(node.left, fnRecord, hops + 1);
    if (left.kind === "slot") {
      const right = ts.isIdentifier(node.right) ? englishNamespace(node.right.text) : null;
      return { ...left, defaultNs: left.defaultNs ?? right };
    }
    return left;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const ns = new Set();
    const slots = [];
    for (const property of node.properties) {
      if (!ts.isSpreadAssignment(property)) continue;
      const part = provided(property.expression, fnRecord, hops + 1);
      if (part.kind === "unknown") return UNKNOWN;
      if (part.kind === "slot") slots.push(part);
      else {
        for (const value of part.ns) ns.add(value);
        if (part.kind === "mix") slots.push(...part.slots);
      }
    }
    if (slots.length === 0) return ns.size > 0 ? { kind: "set", ns } : UNKNOWN;
    if (slots.length === 1 && ns.size === 0) return slots[0];
    return { kind: "mix", ns, slots };
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText();
    if (callee === "Object.freeze" && node.arguments[0]) return provided(node.arguments[0], fnRecord, hops + 1);
    if (callee === "useConsentCatalog") return setOf("consent");
    const ns = loadNamespaceArgument(node);
    return ns === null ? UNKNOWN : setOf(ns);
  }
  if (!ts.isIdentifier(node)) return UNKNOWN;
  const name = node.text;
  const english = englishNamespace(name);
  if (english !== null) return setOf(english);
  const declaration = fnRecord.declarations.get(name);
  if (declaration !== undefined) {
    const init = unwrapAwait(declaration.init);
    if (declaration.property !== undefined) {
      if (ts.isCallExpression(init) && init.expression.getText() === "useChromeI18n" && declaration.property === "catalog") {
        return setOf(...LAYOUT_SHARED);
      }
      // `const { catalog } = this.props` in a class component.
      const propSlot = fnRecord.slots.get(`${init.getText()}.${declaration.property}`);
      if (propSlot !== undefined) return slotValue(propSlot);
      return UNKNOWN;
    }
    if (declaration.bindingIndex !== undefined) {
      if (ts.isCallExpression(init) && init.expression.getText() === "Promise.all" && init.arguments[0] && ts.isArrayLiteralExpression(init.arguments[0])) {
        const element = init.arguments[0].elements[declaration.bindingIndex];
        const ns = element === undefined ? null : loadNamespaceArgument(unwrapAwait(element));
        return ns === null ? UNKNOWN : setOf(ns);
      }
      return UNKNOWN;
    }
    const traced = provided(init, fnRecord, hops + 1);
    if (traced.kind !== "unknown") return traced;
  }
  const nameMatch = /^([a-z][A-Za-z]*)Catalog$/.exec(name);
  if (nameMatch !== null && namespaces.has(nameMatch[1])) return setOf(nameMatch[1]);
  return UNKNOWN;
}

// ---------------------------------------------------------------------------
// Walk every function: each use of a catalogue (a direct t() read, or a
// hand-off into a callee slot) pairs a NEED with a SOURCE.
// ---------------------------------------------------------------------------

const required = new Map(); // `${id}${slotKey}` -> Set<ns>
const uses = []; // { where, need: { keys: ns[] } | { calleeKey, callee, calleeSlot }, source, ownerId }
const omissions = []; // JSX mounts that leave out an undefaulted catalogue prop: { where, callee, calleeSlot, calleeKey }

const add = (map, key, values) => {
  if (!map.has(key)) map.set(key, new Set());
  const target = map.get(key);
  const before = target.size;
  for (const value of values) target.add(value);
  return target.size !== before;
};

for (const record of functions.values()) {
  record.declarations = declarationsIn(record.fn);
}

for (const record of functions.values()) {
  const { sf, file } = record;
  const visible = visibleFunctions(file, sf);
  const handOff = (node, calleeId, calleeSlotKey, argument) => {
    if (argument === undefined) return;
    const callee = functions.get(calleeId);
    if (callee === undefined || ![...callee.slots.values()].some((slot) => slot.key === calleeSlotKey)) return;
    const source = provided(argument, record);
    if (source.kind === "unknown") return;
    uses.push({
      where: `${rel(file)}:${lineOf(sf, node)}`,
      need: { calleeKey: `${calleeId}${calleeSlotKey}`, callee: callee.name, calleeSlot: calleeSlotKey },
      source,
      ownerId: record.id
    });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      if ((callee === "t" || callee === "tPlural") && node.arguments.length >= 2) {
        const keyNs = keyNamespaces(node.arguments[1]);
        if (keyNs.length > 0) {
          const source = provided(node.arguments[0], record);
          if (source.kind !== "unknown") uses.push({ where: `${rel(file)}:${lineOf(sf, node)}`, need: { keys: keyNs }, source, ownerId: record.id });
        }
      } else if (ts.isIdentifier(node.expression) && visible.has(node.expression.text)) {
        const calleeId = visible.get(node.expression.text);
        const calleeRecord = functions.get(calleeId);
        for (const slot of calleeRecord.slots.values()) {
          if (slot.key.startsWith("#")) handOff(node, calleeId, slot.key, node.arguments[Number(slot.key.slice(1))]);
          else if (node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
            const property = node.arguments[0].properties.find((candidate) => candidate.name?.getText() === slot.key.slice(1));
            if (property && ts.isPropertyAssignment(property)) handOff(node, calleeId, slot.key, property.initializer);
            else if (property && ts.isShorthandPropertyAssignment(property)) handOff(node, calleeId, slot.key, property.name);
          }
        }
      }
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && visible.has(node.tagName.text)) {
      const calleeId = visible.get(node.tagName.text);
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attribute.initializer === undefined || !ts.isJsxExpression(attribute.initializer)) continue;
        handOff(node, calleeId, `.${attribute.name.getText()}`, attribute.initializer.expression);
      }
      // Follow-up 6: a catalogue prop with no English default that is simply not
      // passed hands over nothing, and t() then answers from its English backstop.
      const passed = new Set(node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText()));
      const spread = node.attributes.properties.some(ts.isJsxSpreadAttribute);
      const calleeRecord = functions.get(calleeId);
      if (!spread && calleeRecord !== undefined) {
        for (const slot of calleeRecord.slots.values()) {
          if (!slot.key.startsWith(".") || slot.defaultNs !== null || passed.has(slot.key.slice(1))) continue;
          omissions.push({ where: `${rel(file)}:${lineOf(sf, node)}`, callee: calleeRecord.name, calleeSlot: slot.key, calleeKey: `${calleeId}${slot.key}` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(record.fn);
}

const needOf = (use) => ("keys" in use.need ? use.need.keys : [...(required.get(use.need.calleeKey) ?? [])]);

/** A mix's missing namespaces go to the slot whose English default owns them, or to its only slot. */
function assign(source, missing) {
  const owners = new Map();
  const orphans = [];
  for (const ns of missing) {
    const owner = source.slots.find((slot) => slot.defaultNs === ns)
      ?? source.slots.find((slot) => slot.slotKey.replace(/^[.#]/, "") === `${ns}Catalog`)
      ?? (source.slots.length === 1 ? source.slots[0] : undefined);
    if (owner === undefined) orphans.push(ns);
    else add(owners, owner.slotKey, [ns]);
  }
  return { owners, orphans };
}

// Fixpoint: what a slot's owner reads or forwards through it is required of the slot.
let changed = true;
while (changed) {
  changed = false;
  for (const use of uses) {
    const need = needOf(use);
    if (need.length === 0) continue;
    if (use.source.kind === "slot") {
      if (add(required, `${use.ownerId}${use.source.slotKey}`, need)) changed = true;
    } else if (use.source.kind === "mix") {
      const { owners } = assign(use.source, need.filter((ns) => !use.source.ns.has(ns)));
      for (const [slotKey, ns] of owners) if (add(required, `${use.ownerId}${slotKey}`, ns)) changed = true;
    }
  }
}

const describe = (use, need) => ("keys" in use.need
  ? `t() reads ${need.join("+")} keys`
  : `${use.need.callee} ${use.need.calleeSlot} reads ${[...need].sort().join("+")}`);

const mismatches = [];
let checkedHandoffs = 0;
let directReads = 0;
for (const use of uses) {
  const need = needOf(use);
  if ("keys" in use.need) directReads += 1;
  if (need.length === 0) continue;
  const { source } = use;
  if (!("keys" in use.need)) checkedHandoffs += 1;
  if (source.kind === "set") {
    const missing = need.filter((ns) => !source.ns.has(ns));
    if (missing.length > 0) mismatches.push(`${use.where}: ${describe(use, need)} but is handed ${[...source.ns].sort().join("+")} (missing ${missing.sort().join(", ")})`);
  } else if (source.kind === "slot") {
    // The requirement travels up to every hand-off into the slot (fixpoint above);
    // here only the English path: the default must carry what is read through it.
    if (source.defaultNs !== null) {
      const missing = need.filter((ns) => ns !== source.defaultNs);
      if (missing.length > 0) mismatches.push(`${use.where}: ${describe(use, need)} through a slot whose English default is ${source.defaultNs}English (missing ${missing.sort().join(", ")})`);
    }
  } else if (source.kind === "mix") {
    const missing = need.filter((ns) => !source.ns.has(ns));
    const { orphans } = assign(source, missing);
    if (orphans.length > 0) mismatches.push(`${use.where}: ${describe(use, need)} but no part of the spread carries ${orphans.sort().join(", ")}`);
    const englishPath = new Set([...source.ns, ...source.slots.map((slot) => slot.defaultNs).filter((ns) => ns !== null)]);
    const englishMissing = missing.filter((ns) => !englishPath.has(ns) && !orphans.includes(ns));
    if (englishMissing.length > 0 && source.slots.every((slot) => slot.defaultNs !== null)) {
      mismatches.push(`${use.where}: ${describe(use, need)} but the spread's English defaults lack ${englishMissing.sort().join(", ")}`);
    }
  }
}

for (const omission of omissions) {
  const need = [...(required.get(omission.calleeKey) ?? [])];
  if (need.length > 0) mismatches.push(`${omission.where}: ${omission.callee} ${omission.calleeSlot} reads ${need.sort().join("+")} but is not passed (no English default)`);
}

// Flow-insensitive reads the guard cannot rule out on its own. Each entry names
// the site, the namespace and why it is never read there; an entry that no
// longer matches a finding fails the guard (it must be deleted, not kept).
// Empty since follow-up 6: /new now serves chrome, so its AiNotice is covered in
// every variant (re-check 2, R2: a file|namespace key could not see a variant
// change). Keep the mechanism; add an entry only with a site-specific reason.
const ALLOWED = new Map([]);
const allowedHits = new Set();
const filtered = mismatches.filter((finding) => {
  const match = /^([^:]+):\d+: .*(?:missing|carries|lack) ([a-zA-Z, ]+)\)?$/.exec(finding);
  if (match === null) return true;
  const missing = match[2].split(", ");
  const key = `${match[1]}|${missing.join(",")}`;
  if (ALLOWED.has(key)) { allowedHits.add(key); return false; }
  return true;
});

const defaultedSlots = [...functions.values()].flatMap((record) =>
  [...record.slots.values()].filter((slot) => slot.defaultNs !== null).map((slot) => `${record.id}${slot.key}`)
);
const defaultedWithRequirements = defaultedSlots.filter((key) => (required.get(key)?.size ?? 0) > 0);

test("the namespace guard traces real hand-offs", () => {
  // Not vacuous: it must see the known seams and resolve their sources.
  assert.ok(checkedHandoffs > 200, `only ${checkedHandoffs} checked hand-offs`);
  assert.ok(directReads > 100, `only ${directReads} traced direct reads`);
  const requires = (suffix, ns) => {
    const entry = [...required.entries()].find(([key]) => key.endsWith(suffix));
    assert.ok(entry !== undefined && entry[1].has(ns), `${suffix} is known to need ${ns} keys`);
  };
  requires("components/AiNotice.tsx#AiNotice.catalog", "home");
  // Re-check R1: a defaulted slot carries what its owner reads through it …
  requires("components/PublicationControl.tsx#PublicationControl.catalog", "public");
  // … and a class component's `this.props.catalog ?? miscEnglish` is indexed.
  requires("components/ScoringErrorBoundary.tsx#ScoringErrorBoundary.catalog", "misc");
  assert.ok(
    defaultedWithRequirements.length * 10 >= defaultedSlots.length * 9,
    `only ${defaultedWithRequirements.length} of ${defaultedSlots.length} English-defaulted slots carry a requirement`
  );
});

test("every catalogue handed over carries the namespaces its reader reads", () => {
  assert.deepEqual([...new Set(filtered)].sort(), []);
  assert.deepEqual([...ALLOWED.keys()].filter((key) => !allowedHits.has(key)), [], "stale ALLOWED entries");
});
