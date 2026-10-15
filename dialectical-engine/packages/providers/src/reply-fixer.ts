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
 * the words; pre-flight PF-A12, ruling R3), drop a key the schema uses elsewhere when it holds a number or true/false or
 * is declared there as an enum (it may be a misplaced score, verdict or category; pre-flight PF-A13; at the root as well
 * as inside members, e.g. a root `fidelity` beside `steelman.fidelity`), or touch `__proto__`, `prototype` or
 * `constructor`.
 *
 * The failure classes (`replyFailureClassOf`) decide what follows a reply the fixer could not repair (L32, L33):
 *  · STRUCTURE: a reply that ended normally, has visible text and holds no readable JSON (prose with no object
 *    included: pre-flight PF-A14, ruling R4, INTERFACE §2.3), or a schema refusal whose every readable issue is about form
 *    (an unknown key; a member there in another container, or a text where an object or list is asked);
 *  · CONTENT: a refusal that needs words or values only the AI can give (a missing score or text, an enum, an out-of-range
 *    number, a content check: language, ids, coverage, wording), and a PATCH_ refusal;
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
 * the schema uses somewhere, a number, true/false, or any value whose declared schema there is an enum (pre-flight PF-A13).
 */
export type ReplyFixerOptions = Readonly<{
  innerUnaskedKeys?: boolean; unnest?: boolean; wrap?: boolean; textForms?: boolean; paragraphs?: boolean; onlyValues?: boolean;
}>;
export type ReplyFixed = Readonly<{ value: unknown; repairs: readonly ReplyFixerRepair[] }>;

const REPLY_FIXER_LIMITS = Object.freeze({ maxPasses: 8, maxSchemaNodes: 2048, maxWrappers: 16 });
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

/** The names the schema declares: every key any of its objects declares, at any level, and those declared as an enum. */
type DeclaredNames = Readonly<{ keys: ReadonlySet<string>; enums: ReadonlySet<string> }>;

/** Every key any object of the schema declares, at any level; `enums`: the keys declared (somewhere) as an enum (pre-flight PF-A13). */
function declaredNames(schema: z.ZodType): DeclaredNames {
  const keys = new Set<string>();
  const enums = new Set<string>();
  const seen = new Set<z.ZodType>();
  const visit = (node: z.ZodType): void => {
    const inner = unwrapped(node);
    if (seen.has(inner) || seen.size >= REPLY_FIXER_LIMITS.maxSchemaNodes) return;
    seen.add(inner);
    if (inner instanceof z.ZodObject) {
      for (const [key, member] of Object.entries(inner.shape as Readonly<Record<string, z.ZodType>>)) {
        keys.add(key);
        if (unwrapped(member) instanceof z.ZodEnum) enums.add(key);
        visit(member);
      }
    } else if (inner instanceof z.ZodArray) {
      visit(inner.element as z.ZodType);
    } else if (inner instanceof z.ZodUnion) {
      for (const option of inner.options as readonly z.ZodType[]) visit(option);
    }
  };
  visit(schema);
  return Object.freeze({ keys, enums });
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

/** The one value a schema admits, when it admits exactly one: a list pinned to 0 entries, a one-value literal or enum, null. */
function onlyValueOf(schema: z.ZodType): { readonly value: unknown } | null {
  if (schema instanceof z.ZodArray) {
    const bag = (schema as unknown as { _zod?: { bag?: { maximum?: unknown } } })._zod?.bag;
    return bag?.maximum === 0 && schema.safeParse([]).success ? { value: [] } : null;
  }
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

/** A member that is there in the wrong form (or missing with one possible value), repaired; NOT_FIXED otherwise. */
function fixedValue(found: unknown, expected: z.ZodType, options: ReplyFixerOptions, made: Set<ReplyFixerRepair>): unknown {
  if (found === undefined) {
    const only = options.onlyValues === false ? null : onlyValueOf(expected);
    if (only === null) return NOT_FIXED;
    made.add("ONLY_VALUE_FILLED");
    return only.value;
  }
  const lists = paragraphLists(expected);
  if (lists !== null && options.paragraphs !== false && Array.isArray(found) && found.length > 0
    && found.every((entry) => typeof entry === "string"
      || (isRecord(entry) && typeof entry.text === "string" && Object.keys(entry).every((key) => key === "text" || lists.includes(key))))) {
    const joined: Json = { text: found.map((entry) => (typeof entry === "string" ? entry : (entry as Json).text as string)).join(PARAGRAPH_JOIN) };
    for (const list of lists) {
      const merged: unknown[] = [];
      for (const entry of found) {
        const items = isRecord(entry) && Array.isArray(entry[list]) ? entry[list] as unknown[] : [];
        for (const item of items) if (!merged.some((kept) => JSON.stringify(kept) === JSON.stringify(item))) merged.push(item);
      }
      joined[list] = merged;
    }
    made.add("PARAGRAPHS_JOINED");
    return joined;
  }
  if (lists !== null && options.textForms !== false && typeof found === "string") {
    const converted: Json = { text: found };
    for (const list of lists) converted[list] = [];
    made.add("TEXT_FORM_CONVERTED");
    return converted;
  }
  if (expected instanceof z.ZodString && options.textForms !== false && isRecord(found)
    && Object.keys(found).length === 1 && typeof found.text === "string") {
    made.add("TEXT_FORM_CONVERTED");
    return found.text;
  }
  if (expected instanceof z.ZodObject && options.wrap !== false && Array.isArray(found)) {
    const shape = expected.shape as Readonly<Record<string, z.ZodType>>;
    const listMembers = Object.keys(shape).filter((key) => unwrapped(shape[key]!) instanceof z.ZodArray);
    const others = Object.keys(shape).filter((key) => !listMembers.includes(key));
    if (listMembers.length === 1 && others.every((key) => shape[key]!.safeParse(undefined).success)) {
      made.add("MEMBER_WRAPPED");
      return { [listMembers[0]!]: found };
    }
  }
  return NOT_FIXED;
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
        // A possibly misplaced score, verdict or category under a name the schema uses elsewhere: a number, true/false,
        // or any value under a name declared as an enum (pre-flight PF-A13). Kept, so the reply stays refused.
        const found = holder[key];
        const guarded = typeof found === "number" || typeof found === "boolean" || named.enums.has(key);
        if ((named.keys.has(key) && guarded) || options.innerUnaskedKeys === false) continue;
        delete holder[key];
        made.add(path.length === 0 ? "UNASKED_KEYS" : "INNER_UNASKED_KEYS");
        changed = true;
      }
      continue;
    }
    if (issue.code !== "invalid_type" || path.length === 0) continue;
    const expected = schemaAt(schema, path);
    if (expected === null) continue;
    const fixed = fixedValue(valueAt(next, path), expected, options, made);
    if (fixed !== NOT_FIXED && setAt(next, path, fixed)) changed = true;
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
    if (cut && text === "") return Object.freeze([]);
    if (!/^[A-Za-z_]+@[A-Za-z0-9_.$]{1,200}(?:,[A-Za-z_]+@[A-Za-z0-9_.$]{1,200})*$/u.test(text)) return null;
    return text.split(",").map((entry): RefusalIssue => {
      const at = entry.indexOf("@");
      const where = entry.slice(at + 1);
      return Object.freeze({ code: entry.slice(0, at),
        path: where === "$" ? [] : where.split(".").map((segment) => (/^(?:0|[1-9][0-9]*)$/u.test(segment) ? Number(segment) : segment)) });
    });
  }
}

/** A form issue: an unknown key, or a member that is there as a list or an object, or as a text where an object or list is asked. */
function formIssue(issue: RefusalIssue, decoded: unknown): boolean {
  if (issue.code === "unrecognized_keys") return true;
  if (issue.code !== "invalid_type") return false;
  const found = valueAt(decoded, issue.path);
  if (Array.isArray(found) || isRecord(found)) return true;
  return typeof found === "string" && (issue.expected === "object" || issue.expected === "array");
}

/** THE CLASS of a reply the fixer could not repair (see the file's head). Pure; reads the reply's own text, never sends anything. */
export function replyFailureClassOf(rejected: Pick<RejectedProviderContent, "rawText" | "parseStatus" | "parseError">,
  reply: ModelReplyFacts | undefined): ReplyFailureClass {
  if (rejected.parseStatus === "LENGTH_EXCEEDED" || reply?.finishReason === "length") return "CUT_OFF";
  if (rejected.rawText.trim() === "") return "EMPTY";
  if (rejected.parseError.startsWith("PATCH_")) return "CONTENT";
  // Pre-flight PF-A14 (ruling R4, INTERFACE §2.3): a reply that ended normally, has visible text and holds no readable
  // JSON is STRUCTURE, prose with no object included. The structure-repair call keeps the words; if content is missing,
  // the schema check after the repair fails and the content follow-up follows.
  if (rejected.parseStatus === "PARSE_FAILED") return "STRUCTURE";
  const issues = refusalIssues(rejected.parseError);
  if (issues === null) return "CONTENT";
  // Read the reply as its step may have (a story's "prose, then the object" included); the class only looks, it accepts nothing.
  const decoded = decodeModelJson(rejected.rawText, reply, { trailingObjectAccepted: () => true });
  // No readable JSON to look into (pre-flight PF-A14): an issue whose code is about form counts as form.
  if (!decoded.ok) return issues.every((issue) => issue.code === "unrecognized_keys" || issue.code === "invalid_type") ? "STRUCTURE" : "CONTENT";
  return issues.every((issue) => formIssue(issue, decoded.value)) ? "STRUCTURE" : "CONTENT";
}
