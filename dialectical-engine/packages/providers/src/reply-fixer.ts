/**
 * LG-A (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md, L31-L34; INTERFACE §2.3) — THE REPLY FIXER.
 *
 * Plain words: an AI's answer may be right in content and wrong in form: an extra note field, a part one level too deep,
 * a list where one paragraph is asked. The owner's rule is "repair, do not re-ask": code repairs the form, the answer's
 * words stay exactly as the AI wrote them, and the repaired answer must then pass the step's full schema and content
 * checks. Every repair is named (`ReplyFixerRepair`) so the practice report counts it, as information, never as a slip.
 *
 * What the fixer never does: change a word of a text, invent a number, an id, an enum value or a verdict, drop a key an
 * ancestor's schema declares (it moves it to the nearest declaring ancestor whose slot is absent or null; with no free
 * slot the key stays where it is, so the schema still refuses, the fixer returns null and the structure-repair call keeps
 * the words; pre-flight PF-A12, ruling R3), drop a key the schema uses elsewhere unless its value carries nothing of the
 * AI's (contract deviation 8, widened at the Task 4 review and narrowed at the Task 5 review: only a plain text under a
 * name the schema declares somewhere as a text and never as an enum, an empty object, an empty list or null is dropped;
 * a number, true/false, an enum value, a text under a name declared only as a number, true/false or an enum (a score
 * written as text, `fidelity: "0.4"`), or a non-empty object or list such as `evidence.fatalFlags: [{…}]` may be a
 * misplaced score, verdict or block of words, so it is kept and the reply refused; pre-flight PF-A13; at the root as well
 * as inside members, e.g. a root `fidelity` beside `steelman.fidelity`),
 * join paragraphs when one entry's reference list is not a list (its references would be lost), or touch `__proto__`,
 * `prototype` or `constructor`. A repair kind is named only when its member was really written back (L34).
 *
 * The failure classes (`replyFailureClassOf`) decide what follows a reply the fixer could not repair (L32, L33):
 *  · STRUCTURE: a reply that ended normally, has visible text and holds no readable JSON (prose with no object
 *    included: pre-flight PF-A14, ruling R4, INTERFACE §2.3), or a schema refusal whose every readable issue is about form
 *    (an unknown key; a member there in another container, a text where an object or list is asked, or a container
 *    where a scalar is asked that holds a value of that scalar's kind, `fidelity: {value: 0.7}`; and, when the caller
 *    hands over the step's schema or fix guide, an absent member it admits exactly one value for, the writer's
 *    `served_number_refs` pinned to [] — LG-A Task 7b review, I-1);
 *  · CONTENT: a refusal that needs words or values only the AI can give (a missing score or text, an empty or
 *    scalar-less container where a scalar is asked, an enum, an out-of-range number, a content check: language, ids,
 *    coverage, wording), a cut judge list with no whole entry, and a PATCH_ refusal;
 *  · CUT_OFF: the reply ended at its token limit;
 *  · EMPTY: no visible answer text.
 */
import { z } from "zod";
import { MODEL_JSON_STRUCTURE_REPAIRS, decodeModelJson, type ModelJsonStructureRepair, type ModelReplyFacts } from "./model-json.js";
import type { RejectedProviderContent } from "./index.js";

export const REPLY_FAILURE_CLASSES = Object.freeze(["STRUCTURE", "CONTENT", "CUT_OFF", "EMPTY"] as const);
export type ReplyFailureClass = typeof REPLY_FAILURE_CLASSES[number];

/** A fixer repair: one of the structure kinds, or a root key the schema never asked for (the judge's own name). */
export type ReplyFixerRepair = ModelJsonStructureRepair | "UNASKED_KEYS";
/**
 * Which repairs a step allows; absent means allowed. A step turns one off only with a written reason.
 * `innerUnaskedKeys: false` keeps EVERY unknown key, at the root as well as inside members: it also turns off the root
 * UNASKED_KEYS drop (pre-flight PF-A15). `unnest: false` leaves a key an ancestor declares where it is (never dropped).
 * Whatever the switches, the fixer never drops a key an ancestor's schema declares (pre-flight PF-A12), nor, under a name
 * the schema uses somewhere, anything but a plain text (under a name declared somewhere as a text, never as an enum), an
 * empty object, an empty list or null (pre-flight PF-A13; contract deviation 8 as widened at the Task 4 review and
 * narrowed at the Task 5 review).
 * `keepDeclaredTexts: true` (LG-A Task 7 review; default false) KEEPS a plain text under a name the schema declares
 * somewhere as a text instead of dropping it, so the reply stays refused and the structure-repair call keeps its words: a
 * step whose stray texts may be reader-facing prose (the story: a stray `long.sections[0].text`, `short.line`; the
 * writer: a root `text`) turns it on. It keeps EVERY text under such a name, identifier-like texts included (the
 * writer's stray root `segment_id`, declared as a text inside a segment): that reply is refused too and goes to the
 * structure-repair call, an accepted cost of one cheap call (LG-A Task 7b review, M-1). Names the schema never declares
 * (`long.style`) are still dropped, and null, an empty object and an empty list still are too.
 */
export type ReplyFixerOptions = Readonly<{
  innerUnaskedKeys?: boolean; unnest?: boolean; wrap?: boolean; textForms?: boolean; paragraphs?: boolean; onlyValues?: boolean;
  keepDeclaredTexts?: boolean;
}>;
export type ReplyFixed = Readonly<{ value: unknown; repairs: readonly ReplyFixerRepair[] }>;

const REPLY_FIXER_LIMITS = Object.freeze({ maxPasses: 8, maxSchemaNodes: 2048, maxWrappers: 16, maxScalarSearch: 4096 });
const FIXER_ORDER: readonly ReplyFixerRepair[] = Object.freeze(["UNASKED_KEYS", ...MODEL_JSON_STRUCTURE_REPAIRS]);
/** PARAGRAPHS_JOINED's join: one blank line, as a story's own paragraphs read. */
const PARAGRAPH_JOIN = "\n\n";
/** Keys that would reach an object's prototype when set: never moved, never written. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "prototype", "constructor"]);
const NOT_FIXED: unique symbol = Symbol("NOT_FIXED");

type Path = readonly (string | number)[];
type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** The schema under its wrappers: optional, nullable, default, readonly, catch, and a pipe's input side. */
function unwrapped(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (let guard = 0; guard < REPLY_FIXER_LIMITS.maxWrappers; guard += 1) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault
      || current instanceof z.ZodReadonly || current instanceof z.ZodCatch) { current = current.unwrap() as z.ZodType; continue; }
    if (current instanceof z.ZodPipe) { current = current.in as z.ZodType; continue; }
    break;
  }
  return current;
}

/** The schema a value at `path` must pass, or null where a union, a record or anything else hides it. */
function schemaAt(schema: z.ZodType, path: Path): z.ZodType | null {
  let current = unwrapped(schema);
  for (const segment of path) {
    if (current instanceof z.ZodObject && typeof segment === "string") {
      const next = (current.shape as Readonly<Record<string, z.ZodType>>)[segment];
      if (next === undefined) return null;
      current = unwrapped(next);
    } else if (current instanceof z.ZodArray && typeof segment === "number") {
      current = unwrapped(current.element as z.ZodType);
    } else {
      return null;
    }
  }
  return current;
}

/**
 * The names the schema declares: every key any of its objects declares, at any level; those declared (somewhere) as an
 * enum; and those declared (somewhere) as a text, a zod string under its wrappers (Task 5 review, finding 1).
 */
type DeclaredNames = Readonly<{ keys: ReadonlySet<string>; enums: ReadonlySet<string>; strings: ReadonlySet<string> }>;

/** Every key any object of the schema declares, at any level, with its enum and text names (pre-flight PF-A13). */
function declaredNames(schema: z.ZodType): DeclaredNames {
  const keys = new Set<string>();
  const enums = new Set<string>();
  const strings = new Set<string>();
  const seen = new Set<z.ZodType>();
  const visit = (node: z.ZodType): void => {
    const inner = unwrapped(node);
    if (seen.has(inner) || seen.size >= REPLY_FIXER_LIMITS.maxSchemaNodes) return;
    seen.add(inner);
    if (inner instanceof z.ZodObject) {
      for (const [key, member] of Object.entries(inner.shape as Readonly<Record<string, z.ZodType>>)) {
        keys.add(key);
        if (unwrapped(member) instanceof z.ZodEnum) enums.add(key);
        if (unwrapped(member) instanceof z.ZodString) strings.add(key);
        visit(member);
      }
    } else if (inner instanceof z.ZodArray) {
      visit(inner.element as z.ZodType);
    } else if (inner instanceof z.ZodUnion) {
      for (const option of inner.options as readonly z.ZodType[]) visit(option);
    }
  };
  visit(schema);
  return Object.freeze({ keys, enums, strings });
}

/**
 * Pre-flight PF-A12 (ruling R3): where an unknown key found in the object at `path` belongs, when an ANCESTOR's schema
 * declares it. Walks from the holder's parent up to the root, across list indices (`long.sections.1` → `long.sections`
 * → `long` → the root): the nearest declaring ancestor whose slot is absent or null; "NO_FREE_SLOT" when every declaring
 * ancestor's slot already holds a value (or is not an object to write into); null when no ancestor declares the key.
 */
function declaringAncestor(root: unknown, schema: z.ZodType, path: Path, key: string): Json | "NO_FREE_SLOT" | null {
  let declared = false;
  for (let level = path.length - 1; level >= 0; level -= 1) {
    const at = path.slice(0, level);
    const ancestorSchema = schemaAt(schema, at);
    if (!(ancestorSchema instanceof z.ZodObject) || !Object.hasOwn(ancestorSchema.shape as object, key)) continue;
    declared = true;
    const ancestor = valueAt(root, at);
    if (isRecord(ancestor) && (!Object.hasOwn(ancestor, key) || ancestor[key] === null)) return ancestor;
  }
  return declared ? "NO_FREE_SLOT" : null;
}

function valueAt(root: unknown, path: Path): unknown {
  let node = root;
  for (const segment of path) {
    if (typeof segment === "number" ? !Array.isArray(node) : !isRecord(node)) return undefined;
    node = (node as Record<string | number, unknown>)[segment];
  }
  return node;
}

function setAt(root: unknown, path: Path, value: unknown): boolean {
  const last = path.at(-1);
  if (last === undefined || (typeof last === "string" && FORBIDDEN_KEYS.has(last))) return false;
  const parent = valueAt(root, path.slice(0, -1));
  if (typeof last === "number" ? !Array.isArray(parent) : !isRecord(parent)) return false;
  (parent as Record<string | number, unknown>)[last] = value;
  return true;
}

/** An empty registry: no schema carries an `id` in it, so `z.toJSONSchema` keeps the list itself at the root (no `$ref`). */
const NO_SCHEMA_IDS = z.registry();

/**
 * Whether a schema admits exactly one value, the empty list: a list (`z.array`) whose size limit is 0 (`.max(0)` or
 * `.length(0)`) and that accepts []. A list that may hold an entry is never "only empty": what it would hold is not known.
 *
 * The limit is read through zod's public JSON Schema output (`maxItems`), not through zod's internals: zod 4.6 stopped
 * copying a list's limit into the internal `_zod.bag` this used to read, so `.max(0)` silently stopped counting as pinned.
 * `tests/unit/only-empty-list.test.ts` pins this answer for each form, so a future zod change fails loudly there.
 */
export function admitsOnlyTheEmptyList(schema: z.ZodType): boolean {
  if (!(schema instanceof z.ZodArray) || !schema.safeParse([]).success) return false;
  // Only the list's own limit is read; an element zod cannot write as JSON Schema (a date, a transform) is written as {}.
  return z.toJSONSchema(schema, { metadata: NO_SCHEMA_IDS, unrepresentable: "any" }).maxItems === 0;
}

/** The one value a schema admits, when it admits exactly one: a list pinned to 0 entries, a one-value literal or enum, null. */
function onlyValueOf(schema: z.ZodType): { readonly value: unknown } | null {
  if (schema instanceof z.ZodArray) return admitsOnlyTheEmptyList(schema) ? { value: [] } : null;
  if (schema instanceof z.ZodLiteral) {
    const values = [...schema.values];
    return values.length === 1 ? { value: values[0] } : null;
  }
  if (schema instanceof z.ZodEnum) return schema.options.length === 1 ? { value: schema.options[0] } : null;
  if (schema instanceof z.ZodNull) return { value: null };
  return null;
}

/** A paragraph's shape: an object with a string `text` and every other member a list (a story paragraph's `node_refs`). */
function paragraphLists(schema: z.ZodType): readonly string[] | null {
  if (!(schema instanceof z.ZodObject)) return null;
  const shape = schema.shape as Readonly<Record<string, z.ZodType>>;
  if (shape.text === undefined || !(unwrapped(shape.text) instanceof z.ZodString)) return null;
  const others = Object.keys(shape).filter((key) => key !== "text");
  return others.every((key) => unwrapped(shape[key]!) instanceof z.ZodArray) ? Object.freeze(others) : null;
}

/** A repaired member and the kind of its repair; the kind is recorded only once the member is written back. */
type FixedMember = Readonly<{ value: unknown; repair: ReplyFixerRepair }>;

/**
 * A paragraph entry that may be joined: a string, or an object with a string `text` whose every other key is one of the
 * paragraph's lists and holds a list (absent is fine). An entry whose list member is not a list is not joined: its
 * references would be lost (`node_refs: "P1"`), so the fixer leaves it and the structure-repair call keeps it.
 */
function joinableParagraph(entry: unknown, lists: readonly string[]): boolean {
  if (typeof entry === "string") return true;
  return isRecord(entry) && typeof entry.text === "string"
    && Object.keys(entry).every((key) => key === "text" || (lists.includes(key) && Array.isArray(entry[key])));
}

/** A member that is there in the wrong form (or missing with one possible value), repaired; NOT_FIXED otherwise. */
function fixedValue(found: unknown, expected: z.ZodType, options: ReplyFixerOptions): FixedMember | typeof NOT_FIXED {
  if (found === undefined) {
    const only = options.onlyValues === false ? null : onlyValueOf(expected);
    return only === null ? NOT_FIXED : { value: only.value, repair: "ONLY_VALUE_FILLED" };
  }
  const lists = paragraphLists(expected);
  if (lists !== null && options.paragraphs !== false && Array.isArray(found) && found.length > 0
    && found.every((entry) => joinableParagraph(entry, lists))) {
    const joined: Json = { text: found.map((entry) => (typeof entry === "string" ? entry : (entry as Json).text as string)).join(PARAGRAPH_JOIN) };
    for (const list of lists) {
      const merged: unknown[] = [];
      const seen = new Set<string>();
      for (const entry of found) {
        const items = isRecord(entry) && Array.isArray(entry[list]) ? entry[list] as unknown[] : [];
        for (const item of items) {
          const serialised = JSON.stringify(item);
          if (seen.has(serialised)) continue;
          seen.add(serialised);
          merged.push(item);
        }
      }
      joined[list] = merged;
    }
    return { value: joined, repair: "PARAGRAPHS_JOINED" };
  }
  if (lists !== null && options.textForms !== false && typeof found === "string") {
    const converted: Json = { text: found };
    for (const list of lists) converted[list] = [];
    return { value: converted, repair: "TEXT_FORM_CONVERTED" };
  }
  if (expected instanceof z.ZodString && options.textForms !== false && isRecord(found)
    && Object.keys(found).length === 1 && typeof found.text === "string") {
    return { value: found.text, repair: "TEXT_FORM_CONVERTED" };
  }
  if (expected instanceof z.ZodObject && options.wrap !== false && Array.isArray(found)) {
    const shape = expected.shape as Readonly<Record<string, z.ZodType>>;
    const listMembers = Object.keys(shape).filter((key) => unwrapped(shape[key]!) instanceof z.ZodArray);
    const others = Object.keys(shape).filter((key) => !listMembers.includes(key));
    if (listMembers.length === 1 && others.every((key) => shape[key]!.safeParse(undefined).success)) {
      return { value: { [listMembers[0]!]: found }, repair: "MEMBER_WRAPPED" };
    }
  }
  return NOT_FIXED;
}

/**
 * Contract deviation 8 (widened at the Task 4 review, narrowed at the Task 5 review): an unknown key whose name the
 * schema declares somewhere (not on an ancestor) may be dropped only when its value carries nothing that could be the
 * AI's score, verdict or words in the wrong place: a plain text under a name the schema declares somewhere AS A TEXT and
 * never as an enum (GLM's `fallacy.description`, a fatal flag's text), an empty object, an empty list, or null. Anything
 * else is kept, so the reply stays refused and the structure-repair call keeps it: a number, true/false, a text under a
 * name declared only as a number, true/false or an enum (a root `fidelity: "0.4"` beside `steelman.fidelity`, an
 * `evidence.fit: "0.2"`: a score written as text), a non-empty object or list such as `evidence.fatalFlags: [{…}]` or
 * `why.paths: [{…}]`. With `keepDeclaredTexts`, a text is never dropped here (it may be the AI's prose in the wrong place).
 */
function droppableNamedValue(key: string, found: unknown, named: DeclaredNames, options: ReplyFixerOptions): boolean {
  if (found === null) return true;
  if (typeof found === "string") return options.keepDeclaredTexts !== true && named.strings.has(key) && !named.enums.has(key);
  if (Array.isArray(found)) return found.length === 0;
  if (isRecord(found)) return Object.keys(found).length === 0;
  return false;
}

/** One pass over the current issues; the repaired copy, or null when nothing applied. */
function onePass(root: unknown, schema: z.ZodType, options: ReplyFixerOptions, named: DeclaredNames,
  made: Set<ReplyFixerRepair>): unknown {
  const checked = schema.safeParse(root);
  if (checked.success) return null;
  const next: unknown = JSON.parse(JSON.stringify(root));
  let changed = false;
  for (const issue of checked.error.issues) {
    if (issue.path.some((segment) => typeof segment === "symbol" || (typeof segment === "string" && FORBIDDEN_KEYS.has(segment)))) continue;
    const path = issue.path as readonly (string | number)[];
    if (issue.code === "unrecognized_keys") {
      const holder = valueAt(next, path);
      if (!isRecord(holder)) continue;
      for (const key of issue.keys) {
        if (!Object.hasOwn(holder, key) || FORBIDDEN_KEYS.has(key)) continue;
        // Pre-flight PF-A12 (ruling R3): a key an ancestor declares is moved to the nearest declaring ancestor whose slot
        // is absent or null, and is never dropped; with no free slot (or `unnest: false`) it stays where it is, so the
        // schema still refuses, the fixer returns null and the structure-repair call keeps the words.
        const home = declaringAncestor(next, schema, path, key);
        if (home !== null) {
          if (home === "NO_FREE_SLOT" || options.unnest === false) continue;
          home[key] = holder[key];
          delete holder[key];
          made.add("MEMBER_UNNESTED");
          changed = true;
          continue;
        }
        // A possibly misplaced score, verdict, category or block of words under a name the schema uses elsewhere (pre-flight
        // PF-A13; contract deviation 8 as widened at the Task 4 review): kept unless `droppableNamedValue`, so the reply
        // stays refused. A name the schema never declares is dropped whatever it holds (`notes`).
        if ((named.keys.has(key) && !droppableNamedValue(key, holder[key], named, options)) || options.innerUnaskedKeys === false) continue;
        delete holder[key];
        made.add(path.length === 0 ? "UNASKED_KEYS" : "INNER_UNASKED_KEYS");
        changed = true;
      }
      continue;
    }
    if (issue.code !== "invalid_type" || path.length === 0) continue;
    const expected = schemaAt(schema, path);
    if (expected === null) continue;
    const fixed = fixedValue(valueAt(next, path), expected, options);
    // The kind is logged only when the member was really written back (L34: the log never names a repair not made).
    if (fixed !== NOT_FIXED && setAt(next, path, fixed.value)) {
      made.add(fixed.repair);
      changed = true;
    }
  }
  return changed ? next : null;
}

/**
 * THE FIXER. Reads the zod issues of `schema.safeParse(value)` and applies only the repairs above, pass after pass (at
 * most 8), on a JSON copy (`value` is never changed). Returns the repaired value and its repairs, in FIXER_ORDER, only
 * when the repaired value passes the whole schema; null when nothing applied or it still fails (contract deviation 5).
 * The caller still runs its step's content checks on the result.
 */
export function fixReplyStructure(value: unknown, schema: z.ZodType, options: ReplyFixerOptions = {}): ReplyFixed | null {
  if (!isRecord(value) && !Array.isArray(value)) return null;
  const named = declaredNames(schema);
  const made = new Set<ReplyFixerRepair>();
  let current: unknown = value;
  for (let pass = 0; pass < REPLY_FIXER_LIMITS.maxPasses; pass += 1) {
    const next = onePass(current, schema, options, named, made);
    if (next === null) break;
    current = next;
  }
  if (made.size === 0 || !schema.safeParse(current).success) return null;
  return Object.freeze({ value: current, repairs: Object.freeze(FIXER_ORDER.filter((repair) => made.has(repair))) });
}

type RefusalIssue = Readonly<{ code: string; path: Path; expected?: string }>;

/** A refusal's issues from any of its three forms (zod's list, the judge's `code@path` list, a step's content list); null otherwise. */
function refusalIssues(parseError: string): readonly RefusalIssue[] | null {
  try {
    const issues = JSON.parse(parseError) as unknown;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    return issues.map((issue): RefusalIssue => {
      const record = isRecord(issue) ? issue : {};
      const code = typeof record.code === "string" ? record.code : typeof record.message === "string" ? record.message : "custom";
      const path = Array.isArray(record.path)
        ? record.path.filter((segment): segment is string | number => typeof segment === "string" || typeof segment === "number") : [];
      return Object.freeze({ code, path, ...(typeof record.expected === "string" ? { expected: record.expected } : {}) });
    });
  } catch {
    // The judge's `code@path` list (s04.ts schemaFailureMessage). A list longer than 512 characters is cut to 511 and ends
    // in "…": it is read up to its last whole entry (pre-flight PF-A14); the entries lost are still seen by the schema
    // check after a structure repair.
    const whole = parseError.trim();
    const cut = whole.endsWith("…");
    const text = cut ? whole.slice(0, Math.max(0, whole.lastIndexOf(","))) : whole;
    // A cut list with no whole entry says nothing readable: not a form refusal (Task 4 review).
    if (cut && text === "") return null;
    if (!/^[A-Za-z_]+@[A-Za-z0-9_.$]{1,200}(?:,[A-Za-z_]+@[A-Za-z0-9_.$]{1,200})*$/u.test(text)) return null;
    return text.split(",").map((entry): RefusalIssue => {
      const at = entry.indexOf("@");
      const where = entry.slice(at + 1);
      return Object.freeze({ code: entry.slice(0, at),
        path: where === "$" ? [] : where.split(".").map((segment) => (/^(?:0|[1-9][0-9]*)$/u.test(segment) ? Number(segment) : segment)) });
    });
  }
}

type ScalarKind = "string" | "number" | "boolean";
/** zod's `expected` for a scalar member, and the JSON kind of value that answers it. */
const SCALAR_OF_EXPECTED: ReadonlyMap<string, ScalarKind> = new Map([
  ["string", "string"], ["number", "number"], ["int", "number"], ["bigint", "number"], ["boolean", "boolean"]
]);
/** zod's `expected` for a member that is itself a container: a container found there is in another form, never empty content. */
const CONTAINER_EXPECTED: ReadonlySet<string> = new Set(["object", "array", "tuple", "record"]);

/**
 * Whether a container holds, anywhere inside it, a value of the asked scalar kind (any text, number or true/false when
 * the refusal does not say the kind: the judge's `code@path` list). A bounded walk; past the bound the answer is no.
 */
function holdsScalar(container: unknown, kind: ScalarKind | null): boolean {
  const pending: unknown[] = [container];
  for (let visited = 0; pending.length > 0 && visited < REPLY_FIXER_LIMITS.maxScalarSearch; visited += 1) {
    const node = pending.pop();
    if (Array.isArray(node)) {
      for (const item of node) pending.push(item);
    } else if (isRecord(node)) {
      for (const item of Object.values(node)) pending.push(item);
    } else if (kind === null ? typeof node === "string" || typeof node === "number" || typeof node === "boolean" : typeof node === kind) {
      return true;
    }
  }
  return false;
}

/**
 * A form issue: an unknown key; a list or an object where another container is asked; a text where an object or list is
 * asked; or a list or an object where a scalar is asked that holds, at any level, a value of that scalar's kind
 * (`fidelity: {value: 0.7}`). An empty or scalar-less container where a scalar is asked (`fidelity: []`, `headline: {}`)
 * is missing content: CONTENT (Task 4 review). An ABSENT member is missing content too, except one that `schema` (the
 * step's schema or fix guide, when the caller hands it over) admits exactly one value for, which ONLY_VALUE_FILLED would
 * fill (the writer's `served_number_refs`, pinned to [] by its fix guide): the AI owes nothing there (LG-A Task 7b
 * review, I-1).
 */
function formIssue(issue: RefusalIssue, decoded: unknown, schema: z.ZodType | undefined): boolean {
  if (issue.code === "unrecognized_keys") return true;
  if (issue.code !== "invalid_type") return false;
  const found = valueAt(decoded, issue.path);
  if (found === undefined) {
    const expected = schema === undefined ? null : schemaAt(schema, issue.path);
    return expected !== null && onlyValueOf(expected) !== null;
  }
  if (Array.isArray(found) || isRecord(found)) {
    if (issue.expected === undefined) return holdsScalar(found, null);
    if (CONTAINER_EXPECTED.has(issue.expected)) return true;
    const kind = SCALAR_OF_EXPECTED.get(issue.expected);
    return kind !== undefined && holdsScalar(found, kind);
  }
  return typeof found === "string" && (issue.expected === "object" || issue.expected === "array");
}

/**
 * THE CLASS of a reply the fixer could not repair (see the file's head). Pure; reads the reply's own text, never sends
 * anything. `schema` (optional): the schema the step's fixer read the reply against (its fix guide when it has one), so
 * an absent member with exactly one possible value counts as form (LG-A Task 7b review, I-1). The gateway cannot see a
 * step's schema, so a step that has one sets the class on its own refusal (`ContentClassification.failureClass`; the
 * runner's writer and checker readers do), and the gateway's own call (no schema) is used only when it did not.
 */
export function replyFailureClassOf(rejected: Pick<RejectedProviderContent, "rawText" | "parseStatus" | "parseError">,
  reply: ModelReplyFacts | undefined, schema?: z.ZodType): ReplyFailureClass {
  if (rejected.parseStatus === "LENGTH_EXCEEDED" || reply?.finishReason === "length") return "CUT_OFF";
  if (rejected.rawText.trim() === "") return "EMPTY";
  if (rejected.parseError.startsWith("PATCH_")) return "CONTENT";
  // Pre-flight PF-A14 (ruling R4, INTERFACE §2.3): a reply that ended normally, has visible text and holds no readable
  // JSON is STRUCTURE, prose with no object included. The structure-repair call keeps the words; if content is missing,
  // the step's check refuses the repaired reply and the call ends as a content refusal (the repair is the routed call's
  // last try, so no follow-up is sent inside it): only the runner's own final retry may follow (final review M-4).
  if (rejected.parseStatus === "PARSE_FAILED") return "STRUCTURE";
  const issues = refusalIssues(rejected.parseError);
  if (issues === null) return "CONTENT";
  // Read the reply as its step may have (a story's "prose, then the object" included); the class only looks, it accepts nothing.
  const decoded = decodeModelJson(rejected.rawText, reply, { trailingObjectAccepted: () => true });
  // No readable JSON to look into (pre-flight PF-A14): an issue whose code is about form counts as form.
  if (!decoded.ok) return issues.every((issue) => issue.code === "unrecognized_keys" || issue.code === "invalid_type") ? "STRUCTURE" : "CONTENT";
  return issues.every((issue) => formIssue(issue, decoded.value, schema)) ? "STRUCTURE" : "CONTENT";
}
