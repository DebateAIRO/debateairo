import { z } from "zod";
import { ABSTENTION_KINDS, CLAIM_TYPES, isRunLevelSpendStop, type AbstentionKind, type ClaimType } from "@debateai/kernel";
import type { CompositionMapRegisterRow } from "@debateai/register";
import {
  fixReplyStructure,
  modelJsonFenceBody,
  modelJsonLateRepair,
  modelJsonObjectSpans,
  modelJsonSyntaxRepair,
  parsedWithRepairs,
  type ContentClassification,
  type ModelJsonRepair,
  type ModelReplyFacts,
  type ReplyFixerOptions
} from "@debateai/providers";

export { CLAIM_TYPES };
export type { ClaimType };
export type { CompositionMapRegisterRow } from "@debateai/register";

export function createTypedNonAnswer(input: {
  readonly unknownRef: string;
  readonly modelChoice: unknown;
  readonly provenanceRef: string;
}): {
  readonly kind: "ABSTENTION";
  readonly abstentionKind: AbstentionKind;
  readonly unknownRef: string;
  readonly chosenBy: "MODEL";
  readonly enforcement: "CLOSED_SPEC_12_3_SET";
  readonly provenanceRef: string;
} {
  if (input.unknownRef.trim() === "" || input.provenanceRef.trim() === "") throw new TypeError("A typed non-answer requires unknown and provenance references");
  if (typeof input.modelChoice !== "string" || !(ABSTENTION_KINDS as readonly string[]).includes(input.modelChoice)) {
    throw new TypeError("The model chose a non-answer outside spec §12.3 Home 1");
  }
  return Object.freeze({
    kind: "ABSTENTION",
    abstentionKind: input.modelChoice as AbstentionKind,
    unknownRef: input.unknownRef,
    chosenBy: "MODEL",
    enforcement: "CLOSED_SPEC_12_3_SET",
    provenanceRef: input.provenanceRef
  });
}

export interface NormalizedClaim {
  readonly claimType: ClaimType;
  readonly scope: { readonly timeframe: string | null; readonly geography: string | null; readonly population: string | null };
  readonly ambiguityFlags: readonly string[];
  readonly evidenceLocators: readonly string[];
  readonly substance: "code" | "model";
  readonly enforcement: "closed-claim-type-set";
}

const classificationPatterns: Readonly<Record<Exclude<ClaimType, "mixed" | "unknown">, RegExp>> = Object.freeze({
  empirical: /\b(?:observed|measured|study|data|evidence|rate|percent|increased|decreased)\b/i,
  causal: /\b(?:cause[sd]?|causing|because|leads? to|results? in|due to)\b/i,
  normative: /\b(?:ought|should|must|better to|wrong to|right to)\b/i,
  definitional: /\b(?:define[sd]?|means?|refers? to|is the definition of)\b/i,
  prediction: /\b(?:will|forecast|predict(?:s|ed)?|likely to|expected to)\b/i,
  comparative: /\b(?:more than|less than|better than|worse than|compared with|versus|vs\.?\b)\b/i
});

function extractScope(text: string): NormalizedClaim["scope"] {
  const timeframe = text.match(/\b(?:in|during|since|before|after)\s+(\d{4}(?:[-–]\d{4})?)\b/i)?.[1] ?? null;
  const geography = text.match(/\b(?:in|across)\s+([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+)*)\b/)?.[1] ?? null;
  const population = text.match(/\b(?:among|for)\s+([^,.;]+)/i)?.[1]?.trim() ?? null;
  return Object.freeze({ timeframe, geography, population });
}

export function classifyClaimText(text: string): NormalizedClaim {
  const matches = (Object.entries(classificationPatterns) as [Exclude<ClaimType, "mixed" | "unknown">, RegExp][])
    .filter(([, pattern]) => pattern.test(text)).map(([claimType]) => claimType);
  const claimType: ClaimType = matches.length === 0 ? "unknown" : matches.length === 1 ? matches[0]! : "mixed";
  return Object.freeze({
    claimType,
    scope: extractScope(text),
    ambiguityFlags: Object.freeze([]),
    evidenceLocators: Object.freeze([...text.matchAll(/https?:\/\/[^\s)\]}]+/g)].map((match) => match[0])),
    substance: "code",
    enforcement: "closed-claim-type-set"
  });
}

export async function resolveClaimType(input: { readonly text: string; readonly classifyUnknown: (text: string) => Promise<unknown> }): Promise<NormalizedClaim> {
  const codeResult = classifyClaimText(input.text);
  if (codeResult.claimType !== "unknown") return codeResult;
  const proposed = await input.classifyUnknown(input.text);
  if (proposed === undefined || proposed === null) return codeResult;
  if (typeof proposed !== "string" || !(CLAIM_TYPES as readonly string[]).includes(proposed)) {
    throw new TypeError("The model-proposed claim_type is outside the closed vocabulary");
  }
  return Object.freeze({ ...codeResult, claimType: proposed as ClaimType, substance: "model" });
}

const FATAL_FLAG_TYPE_SHAPE = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const FATAL_FLAG_TYPE_MAX_CHARS = 64;

/**
 * Drops leading and trailing "_"/"-" in one pass from each end (CodeQL js/polynomial-redos: the old edge-trim regex,
 * whose second alternative is an end-anchored `[_-]` run, rescanned a long interior run from every start). Invariant:
 * no regex that is end-anchored but not start-anchored reads more than 64 characters of a fatal-flag type. The
 * folded identifier is ASCII, so code units are characters.
 */
function trimEdgeSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && (text.charCodeAt(start) === 95 || text.charCodeAt(start) === 45)) start += 1;
  while (end > start && (text.charCodeAt(end - 1) === 95 || text.charCodeAt(end - 1) === 45)) end -= 1;
  return text.slice(start, end);
}

/**
 * 2026-10-12 practice finding: judge models write fatal flags in plain words ("false dichotomy",
 * "ad hominem (imputed motive)"), and the old shape check refused the whole billed reply. The type is
 * folded before the check: trim; NFKD with combining marks dropped (ș, ă, î become s, a, i); each run
 * outside [A-Za-z0-9_-] becomes one "_"; edge "_"/"-" removed (by an index loop, never a regex on the uncut
 * text); "flag_" prefixed when no letter starts it; cut to 64. The CASE is kept: caps match whenFatalType
 * exactly. Empty folds to "" and is still refused.
 */
function normaliseFatalFlagType(raw: string): string {
  const folded = raw.trim().normalize("NFKD").replace(/\p{M}/gu, "");
  const identifier = trimEdgeSeparators(folded.replace(/[^A-Za-z0-9_-]+/gu, "_"));
  if (identifier === "") return "";
  const lettered = FATAL_FLAG_TYPE_SHAPE.test(identifier) ? identifier : `flag_${identifier}`;
  return lettered.slice(0, FATAL_FLAG_TYPE_MAX_CHARS).replace(/_+$/u, "");
}

const fatalFlagSchema = z.object({
  type: z.string().transform((raw) => normaliseFatalFlagType(raw)).pipe(z.string().regex(FATAL_FLAG_TYPE_SHAPE)),
  severity: z.number().min(0).max(1), description: z.string().trim().min(1)
}).strict();

export const judgeAssessmentSchema = z.object({
  steelman: z.object({ summary: z.string().trim().min(1), fidelity: z.number().min(0).max(1) }).strict(),
  critic: z.object({
    summary: z.string().trim().min(1), counterargumentStrength: z.number().min(0).max(1),
    basis: z.enum(["REAL_ATTACK", "PLAUSIBLE_COUNTER"])
  }).strict(),
  evidence: z.object({ quality: z.number().min(0).max(1), relevance: z.number().min(0).max(1) }).strict(),
  context: z.object({ fit: z.number().min(0).max(1), ambiguityFlags: z.array(z.string().trim().min(1)) }).strict(),
  fallacy: z.object({ severity: z.number().min(0).max(1), fatalFlags: z.array(fatalFlagSchema) }).strict()
}).strict();
export type JudgeAssessment = z.infer<typeof judgeAssessmentSchema>;

/**
 * How a structured reply was read. All-steps format robustness (2026-10-12): after the judge's own three, the late
 * repairs the story's tolerant decode makes (`modelJsonLateRepair`): INNER_QUOTE (a straight double quote inside a text
 * that cannot end it, read as escaped), STRAY_QUOTE (one stray straight quote before the final closing brackets,
 * dropped; MiMo salvage, 2026-10-12) and, only for a reply that finished normally, CLOSING_BRACKETS. Then the shape
 * repairs a step may ask for (`StructuredReadingOptions`).
 */
export type StructuredParseStrategy = "RAW" | "ONE_FENCE" | "BRACE_BALANCED" | "INNER_QUOTE" | "STRAY_QUOTE" | "CLOSING_BRACKETS"
  | "NESTED_FIELDS" | "RENAMED_MEMBER" | "UNASKED_KEYS" | "EMPTY_LIST"
  // LG-A: the syntax pass (decode) and the schema-guided fixer (Task 5); their repairs travel in `repairs`.
  | "SYNTAX_REPAIRED" | "STRUCTURE_FIXED";

const STRUCTURED_PARSE_REPAIRS: Readonly<Record<StructuredParseStrategy, ModelJsonRepair | null>> = Object.freeze({
  RAW: null, ONE_FENCE: "CODE_FENCE", BRACE_BALANCED: "OUTERMOST_OBJECT", INNER_QUOTE: "INNER_QUOTE", STRAY_QUOTE: "STRAY_QUOTE",
  CLOSING_BRACKETS: "CLOSING_BRACKETS", NESTED_FIELDS: "NESTED_FIELDS", RENAMED_MEMBER: "RENAMED_MEMBER", UNASKED_KEYS: "UNASKED_KEYS",
  EMPTY_LIST: "EMPTY_LIST", SYNTAX_REPAIRED: null, STRUCTURE_FIXED: null
});

/** The repair code a strategy is counted under (`ContentClassification.jsonRepair`); RAW needed none. */
export function structuredParseRepair(strategy: StructuredParseStrategy): ModelJsonRepair | null {
  return STRUCTURED_PARSE_REPAIRS[strategy];
}

export type ParseStructuredArtifactResult<T> =
  | { readonly kind: "PARSED"; readonly strategy: StructuredParseStrategy; readonly value: T;
      /**
       * LG-A: every repair, present only on the new paths (SYNTAX_REPAIRED, STRUCTURE_FIXED, and a shape repair made after
       * SYNTAX_REPAIRED, pre-flight PF-A8); read with parsedStructuredRepairs.
       */
      readonly repairs?: readonly ModelJsonRepair[] }
  | { readonly kind: "PARSE_FAILURE"; readonly message: string }
  | { readonly kind: "SCHEMA_FAILURE"; readonly message: string };

/** LG-A: every repair a PARSED reading made, in order (none for RAW). */
export function parsedStructuredRepairs(result: Extract<ParseStructuredArtifactResult<unknown>, { kind: "PARSED" }>): readonly ModelJsonRepair[] {
  if (result.repairs !== undefined) return result.repairs;
  const repair = STRUCTURED_PARSE_REPAIRS[result.strategy];
  return repair === null ? Object.freeze([]) : Object.freeze([repair]);
}

export type ParseJudgeAssessmentResult =
  | { readonly kind: "PARSED"; readonly strategy: StructuredParseStrategy; readonly assessment: JudgeAssessment }
  | { readonly kind: "PARSE_FAILURE"; readonly message: string }
  | { readonly kind: "SCHEMA_FAILURE"; readonly message: string };

/** The first balanced object in the text (the shared scanner, `modelJsonObjectSpans`), or null. */
function firstBalancedObject(text: string): string | null {
  const first = modelJsonObjectSpans(text).next();
  return first.done === true ? null : first.value;
}

/**
 * DL4-F1: a schema failure names the issue CODES and PATHS only. zod's own message embeds
 * the received values and the unrecognised keys - the model's text - and that message used
 * to travel into ledger parse_error columns, Hatchet failure payloads and stderr, outside
 * the AEAD boundary. Paths are the schema's names (and array indices); nothing the model
 * wrote is copied. Bounded so a pathological issue list cannot grow the message either.
 */
const MAX_SCHEMA_FAILURE_MESSAGE_CHARS = 512;

function schemaFailureMessage(error: z.ZodError): string {
  const rendered = error.issues
    .map((issue) => `${issue.code}@${issue.path.length === 0 ? "$" : issue.path.map(String).join(".")}`)
    .join(",");
  return rendered.length > MAX_SCHEMA_FAILURE_MESSAGE_CHARS
    ? `${rendered.slice(0, MAX_SCHEMA_FAILURE_MESSAGE_CHARS - 1)}…`
    : rendered;
}

/**
 * How a step asks its reply to be read: which SHAPE repairs it allows. Each is tried only after a decoded object failed
 * the step's schema, each alone on the decoded object (one repair at most, in this order), and each is accepted only
 * when the repaired object passes the full schema. LG-A: when none applies, a step with `fixer` then tries the
 * schema-guided fixer (`fixReplyStructure`), which may make several repairs at once (STRUCTURE_FIXED); otherwise the
 * original refusal stands.
 *  - `nestedFields`: NESTED_FIELDS (`nestedFieldsPlan`), the judge's author legs and panel;
 *  - `renamedMembers`: RENAMED_MEMBER (`renameMisnamedMember`), the judge's author legs and panel;
 *  - `unaskedKeys`: UNASKED_KEYS (`dropUnaskedKeys`), the judge's author legs, panel and review;
 *  - `emptyLists`: EMPTY_LIST (`fillPinnedEmptyLists`), the review only.
 * MiMo salvage (owner ruling 2026-10-12, "Salvage in code"): a reply that is right except for a harmless form slip is
 * repaired in code instead of re-asked. None of these invents content, changes a value or reads a cut reply: a repair
 * only moves, drops or fills what the schema itself fixes.
 */
export interface StructuredReadingOptions {
  readonly nestedFields?: boolean;
  readonly renamedMembers?: boolean;
  readonly unaskedKeys?: boolean;
  readonly emptyLists?: boolean;
  /**
   * LG-A (spec 2026-10-15, L31; INTERFACE §2.3): the schema-guided fixer (`fixReplyStructure`), tried after the shape
   * repairs above; its repairs ride in the result's `repairs` (strategy STRUCTURE_FIXED), after the decode's.
   */
  readonly fixer?: ReplyFixerOptions;
}

/**
 * One member the NESTED_FIELDS repair may rebuild, read off the schema: `member` is a root member whose schema is an
 * object; `text` is that object's ONLY string member; `lifted` are its other members, none of which is a root member.
 */
export interface NestedFieldsPlanEntry {
  readonly member: string;
  readonly text: string;
  readonly lifted: readonly string[];
}

const nestedFieldsPlans = new WeakMap<z.ZodType, readonly NestedFieldsPlanEntry[]>();

/**
 * Judge nested fields (2026-10-12): which members the NESTED_FIELDS repair may rebuild, derived from the schema
 * itself (nothing is named in code). For the judge artifact that is exactly steelman {summary, fidelity} and critic
 * {summary, counterargumentStrength, basis}; evidence, context and fallacy hold no string member and never qualify.
 * A schema that is not an object has no plan.
 */
export function nestedFieldsPlan(schema: z.ZodType): readonly NestedFieldsPlanEntry[] {
  const known = nestedFieldsPlans.get(schema);
  if (known !== undefined) return known;
  const entries: NestedFieldsPlanEntry[] = [];
  if (schema instanceof z.ZodObject) {
    const root = schema.shape as Record<string, z.ZodType>;
    for (const [member, memberSchema] of Object.entries(root)) {
      if (!(memberSchema instanceof z.ZodObject)) continue;
      const inner = Object.entries(memberSchema.shape as Record<string, z.ZodType>);
      const texts = inner.filter(([, innerSchema]) => innerSchema instanceof z.ZodString).map(([name]) => name);
      const lifted = inner.map(([name]) => name).filter((name) => !texts.includes(name));
      if (texts.length !== 1 || lifted.length === 0 || lifted.some((name) => Object.hasOwn(root, name))) continue;
      entries.push(Object.freeze({ member, text: texts[0]!, lifted: Object.freeze(lifted) }));
    }
  }
  const plan = Object.freeze(entries);
  nestedFieldsPlans.set(schema, plan);
  return plan;
}

/**
 * Judge nested fields (2026-10-12): MiMo-V2.6-Pro in JSON mode wrote `"steelman": "<summary>"` with `"fidelity"` at
 * the root, and `"critic": "<summary>"` with `"counterargumentStrength"` and `"basis"` at the root. For each plan entry
 * whose member is a string while EVERY lifted member stands at the root, the member becomes {text: the string, each
 * lifted member: its root value} and only those root keys are removed. Nothing is invented, nothing else moves; null
 * when no entry applied. The caller runs the full schema on the result.
 */
function nestFlattenedMembers(decoded: unknown, plan: readonly NestedFieldsPlanEntry[]): Record<string, unknown> | null {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return null;
  const source = decoded as Record<string, unknown>;
  let repaired: Record<string, unknown> | null = null;
  for (const entry of plan) {
    const current = repaired ?? source;
    if (typeof current[entry.member] !== "string" || !entry.lifted.every((name) => Object.hasOwn(current, name))) continue;
    const next: Record<string, unknown> = { ...current };
    const nested: Record<string, unknown> = { [entry.text]: current[entry.member] };
    for (const name of entry.lifted) {
      nested[name] = current[name];
      delete next[name];
    }
    next[entry.member] = nested;
    repaired = next;
  }
  return repaired;
}

type RootShape = Readonly<Record<string, z.ZodType>>;

/** The root members a schema asks for, or null when the schema is not an object (no shape repair then applies). */
function rootShapeOf(schema: z.ZodType): RootShape | null {
  return schema instanceof z.ZodObject ? schema.shape as RootShape : null;
}

function plainObject(decoded: unknown): Record<string, unknown> | null {
  return typeof decoded === "object" && decoded !== null && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
}

/** The members the schema requires (an optional member accepts undefined) that the decoded object lacks. */
function missingRequiredMembers(source: Record<string, unknown>, shape: RootShape): readonly string[] {
  return Object.keys(shape).filter((member) => !Object.hasOwn(source, member) && !shape[member]!.safeParse(undefined).success);
}

/**
 * MiMo salvage (2026-10-12, debate 3 seq 178): MiMo-V2.6-Pro wrote its panel critic under `"critique"`, with exactly the
 * critic's own fields. RENAMED_MEMBER: when exactly ONE required member is missing, that member's schema is an object
 * (a scalar fits too many things to be recognised by its value), and exactly ONE key the schema never asked for holds a
 * value that passes that member's own schema in full, the value moves to the member's name. Nothing else moves and the
 * value is not changed. Null when that form is not there.
 */
function renameMisnamedMember(decoded: unknown, shape: RootShape): Record<string, unknown> | null {
  const source = plainObject(decoded);
  if (source === null) return null;
  const missing = missingRequiredMembers(source, shape);
  if (missing.length !== 1) return null;
  const member = missing[0]!;
  const memberSchema = shape[member]!;
  if (!(memberSchema instanceof z.ZodObject)) return null;
  const fitting = Object.keys(source).filter((key) => !Object.hasOwn(shape, key) && memberSchema.safeParse(source[key]).success);
  if (fitting.length !== 1) return null;
  const from = fitting[0]!;
  const renamed: Record<string, unknown> = { ...source, [member]: source[from] };
  delete renamed[from];
  return renamed;
}

/**
 * MiMo salvage (2026-10-12, debate 3 seq 239): beside a valid `"way_of_knowing"` MiMo-V2.6-Pro also wrote a
 * `"way_of_kooking"` the schema never asked for. UNASKED_KEYS: the root keys the schema does not name are dropped
 * (their names are the model's own text, so they are not copied into any message: DL4-F1); the caller accepts the
 * result only if every asked member is then present and valid. Root keys only. A root key named like a field asked for
 * INSIDE a member (a root `"fidelity"` beside `steelman.fidelity`) is never dropped here: it may be a second, different
 * value for something that is scored, and which one the model meant is not known. Null when there is no droppable key.
 * LG-A: the fixer behind this repair (`StructuredReadingOptions.fixer`) drops such a key only when its value is a plain
 * text under a name the schema declares as a text (never as a number, true/false or an enum), or an empty object, an
 * empty list or null; a root `"fidelity"`, as a number or as text, stays refused.
 */
function dropUnaskedKeys(decoded: unknown, shape: RootShape): Record<string, unknown> | null {
  const source = plainObject(decoded);
  if (source === null) return null;
  const unasked = Object.keys(source).filter((key) => !Object.hasOwn(shape, key));
  if (unasked.length === 0) return null;
  const innerNames = new Set(Object.values(shape).flatMap((memberSchema) =>
    memberSchema instanceof z.ZodObject ? Object.keys(memberSchema.shape as RootShape) : []));
  if (unasked.some((key) => innerNames.has(key))) return null;
  const kept: Record<string, unknown> = { ...source };
  for (const key of unasked) delete kept[key];
  return kept;
}

/** Whether a member's schema admits exactly one value, the empty list: a list pinned to at most 0 entries. */
function pinnedEmptyList(memberSchema: z.ZodType): boolean {
  if (!(memberSchema instanceof z.ZodArray) || !memberSchema.safeParse([]).success) return false;
  const bag = (memberSchema as unknown as { _zod?: { bag?: { maximum?: unknown } } })._zod?.bag;
  return bag?.maximum === 0;
}

/**
 * MiMo salvage (2026-10-12, debate 3 seq 160): reviewing a node that sources no edges, MiMo-V2.6-Pro left out
 * `edge_bearings`, which the prompt said "has exactly 0 entries" and the schema pins to length 0: the one value it
 * admits is []. EMPTY_LIST: every missing required member must be such a pinned-empty list, and each is filled with [].
 * A list that may hold an entry is never filled: what it would hold is not known. Null when that form is not there.
 */
function fillPinnedEmptyLists(decoded: unknown, shape: RootShape): Record<string, unknown> | null {
  const source = plainObject(decoded);
  if (source === null) return null;
  const missing = missingRequiredMembers(source, shape);
  if (missing.length === 0 || !missing.every((member) => pinnedEmptyList(shape[member]!))) return null;
  const filled: Record<string, unknown> = { ...source };
  for (const member of missing) filled[member] = [];
  return filled;
}

type ShapeRepair = readonly [allowed: boolean | undefined, repair: StructuredParseStrategy, build: () => Record<string, unknown> | null];

function schemaResult<T>(decoded: unknown, strategy: StructuredParseStrategy, schema: z.ZodType<T>, options?: StructuredReadingOptions,
  decodeRepairs: readonly ModelJsonRepair[] = []): ParseStructuredArtifactResult<T> {
  const parsed = schema.safeParse(decoded);
  if (parsed.success) {
    return Object.freeze(strategy === "SYNTAX_REPAIRED"
      ? { kind: "PARSED", strategy, value: parsed.data, repairs: Object.freeze([...decodeRepairs]) }
      : { kind: "PARSED", strategy, value: parsed.data });
  }
  const refused: ParseStructuredArtifactResult<T> = Object.freeze({ kind: "SCHEMA_FAILURE", message: schemaFailureMessage(parsed.error) });
  if (options === undefined) return refused;
  const shape = rootShapeOf(schema);
  if (shape !== null) {
    const repairs: readonly ShapeRepair[] = [
      [options.nestedFields, "NESTED_FIELDS", () => nestFlattenedMembers(decoded, nestedFieldsPlan(schema))],
      [options.renamedMembers, "RENAMED_MEMBER", () => renameMisnamedMember(decoded, shape)],
      [options.unaskedKeys, "UNASKED_KEYS", () => dropUnaskedKeys(decoded, shape)],
      [options.emptyLists, "EMPTY_LIST", () => fillPinnedEmptyLists(decoded, shape)]
    ];
    for (const [allowed, repair, build] of repairs) {
      if (allowed !== true) continue;
      const candidate = build();
      if (candidate === null) continue;
      const repaired = schema.safeParse(candidate);
      if (!repaired.success) continue;
      // Pre-flight PF-A8 (as Task 3, L34): after the syntax pass, the decode's repairs first, then the shape repair, so
      // TRAILING_COMMA + UNASKED_KEYS is logged as both.
      return Object.freeze(strategy === "SYNTAX_REPAIRED"
        ? { kind: "PARSED", strategy: repair, value: repaired.data,
            repairs: Object.freeze([...decodeRepairs, STRUCTURED_PARSE_REPAIRS[repair]!]) }
        : { kind: "PARSED", strategy: repair, value: repaired.data });
    }
  }
  // LG-A: the fixer, last; the decode's own repairs first in the list.
  if (options.fixer !== undefined) {
    const fixed = fixReplyStructure(decoded, schema, options.fixer);
    if (fixed !== null) {
      const repaired = schema.safeParse(fixed.value);
      if (repaired.success) {
        const decodeRepair = STRUCTURED_PARSE_REPAIRS[strategy];
        const before = strategy === "SYNTAX_REPAIRED" ? decodeRepairs : decodeRepair === null ? [] : [decodeRepair];
        return Object.freeze({ kind: "PARSED", strategy: "STRUCTURE_FIXED", value: repaired.data,
          repairs: Object.freeze([...before, ...fixed.repairs]) });
      }
    }
  }
  return refused;
}

/**
 * The ONE_FENCE strategy reads the body with the shared linear fence reader
 * (`modelJsonFenceBody`, packages/providers/src/model-json.ts), which carries
 * CI-1b's account of why it is not a regular expression (CodeQL
 * js/polynomial-redos, PR #8). The story's tolerant decode reads fences with it too.
 *
 * All-steps format robustness (2026-10-12): when none of the three decodes, the
 * story's two late repairs are tried, from the same shared code
 * (`modelJsonLateRepair`): straight quotes inside a text that cannot end it, read
 * as escaped (a Romanian „…" closed with a straight quote), and, only when `reply`
 * says the reply finished normally, the brackets still open at the very end
 * closed. A reply cut off at its token ceiling is never repaired. Whatever decodes
 * still passes the full schema; the stored artifact stays the vendor's bytes.
 * Without `reply` the ending is unknown and the last repair is not made.
 *
 * Judge nested fields (2026-10-12): with `options.nestedFields` (the judge's author legs and panel), an object that decoded but
 * failed the schema is tried once more with its flattened members nested (`nestFlattenedMembers`, the plan read off
 * the schema by `nestedFieldsPlan`); it is accepted only if the result passes the full schema, as NESTED_FIELDS, and
 * otherwise the original refusal stands. MiMo salvage (2026-10-12) adds RENAMED_MEMBER, UNASKED_KEYS and EMPTY_LIST the
 * same way (`StructuredReadingOptions`). The step re-reads its accepted content with the same options, so every
 * reader gets the repaired object.
 */
export function parseStructuredArtifact<T>(
  content: string, schema: z.ZodType<T>, reply?: ModelReplyFacts, options?: StructuredReadingOptions
): ParseStructuredArtifactResult<T> {
  try { return schemaResult(JSON.parse(content), "RAW", schema, options); } catch { /* advance only on parse failure */ }
  const fenced = modelJsonFenceBody(content);
  if (fenced !== null) {
    try { return schemaResult(JSON.parse(fenced), "ONE_FENCE", schema, options); } catch { /* next strategy */ }
  }
  const balanced = firstBalancedObject(content);
  if (balanced !== null) {
    try { return schemaResult(JSON.parse(balanced), "BRACE_BALANCED", schema, options); } catch { /* next strategy */ }
  }
  const late = modelJsonLateRepair(content, reply);
  if (late !== null) return schemaResult(late.value, late.repair, schema, options);
  // LG-A: the syntax pass, last (packages/providers/src/model-json.ts modelJsonSyntaxRepair; after prose, its one rule).
  const syntax = modelJsonSyntaxRepair(content, reply);
  if (syntax !== null) return schemaResult(syntax.value, "SYNTAX_REPAIRED", schema, options, syntax.repairs);
  return Object.freeze({ kind: "PARSE_FAILURE", message: "No parsing strategy produced a JSON object" });
}

/**
 * The content classifier every judge-family call hands the gateway (author legs, review, panel): the same reading as
 * `parseStructuredArtifact`, with the repair it needed as `jsonRepair` (all-steps format robustness, 2026-10-12).
 * Reply language (2026-10-12): `check` reads the accepted object (the step's language check, `replyLanguageCheck`);
 * its issues refuse the reply as SCHEMA_FAILED, a JSON array of issues at machine paths, so the call's own repair asks
 * again.
 */
export function classifyStructuredArtifact<T>(
  content: string, schema: z.ZodType<T>, reply?: ModelReplyFacts, options?: StructuredReadingOptions,
  check?: (value: T) => readonly unknown[]
): ContentClassification {
  const outcome = parseStructuredArtifact(content, schema, reply, options);
  if (outcome.kind === "PARSED") {
    const issues = check?.(outcome.value) ?? [];
    if (issues.length > 0) return { parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify(issues) };
    return parsedWithRepairs(parsedStructuredRepairs(outcome));
  }
  return { parseStatus: outcome.kind === "PARSE_FAILURE" ? "PARSE_FAILED" : "SCHEMA_FAILED", parseError: outcome.message };
}

export function parseJudgeAssessment(content: string, reply?: ModelReplyFacts): ParseJudgeAssessmentResult {
  const result = parseStructuredArtifact(content, judgeAssessmentSchema, reply);
  return result.kind === "PARSED"
    ? Object.freeze({ kind: "PARSED", strategy: result.strategy, assessment: Object.freeze(result.value) })
    : result;
}

export type CompositionMetric = "steelman_fidelity" | "counter_resilience" | "evidence_quality" | "evidence_relevance" | "context_fit" | "clarity" | "fallacy_resilience";

/**
 * The seven measures of one grader's assessment, each 0..1, in the composition row's order. Engine 1's composition
 * (`reduceAssessment`) and engine 2's honest grade (honest-score.ts; spec 2026-10-15 §4.2 item 1) read these same
 * numbers. Clarity loses `clarityDecayPerAmbiguity` per ambiguity flag and never goes below 0.
 */
export function compositionMetricsOf(assessment: JudgeAssessment, clarityDecayPerAmbiguity: number): Readonly<Record<CompositionMetric, number>> {
  return Object.freeze({
    steelman_fidelity: assessment.steelman.fidelity,
    counter_resilience: 1 - assessment.critic.counterargumentStrength,
    evidence_quality: assessment.evidence.quality,
    evidence_relevance: assessment.evidence.relevance,
    context_fit: assessment.context.fit,
    clarity: Math.max(0, 1 - clarityDecayPerAmbiguity * assessment.context.ambiguityFlags.length),
    fallacy_resilience: 1 - assessment.fallacy.severity
  });
}

interface Provenance { readonly rowKey: string; readonly registerVersion: number; readonly sourceRef: string }
function assertUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be in [0,1]`);
}
function provenance(row: Provenance): Provenance {
  if (row.rowKey.trim() === "" || row.sourceRef.trim() === "" || !Number.isInteger(row.registerVersion) || row.registerVersion < 1) throw new TypeError("Register-row provenance is incomplete");
  return Object.freeze({ rowKey: row.rowKey, registerVersion: row.registerVersion, sourceRef: row.sourceRef });
}

export function reduceAssessment(input: { readonly claimType: ClaimType; readonly assessment: JudgeAssessment; readonly compositionRow: CompositionMapRegisterRow; readonly reducerVersion: string }):
  | { readonly kind: "UNAVAILABLE"; readonly reason: "COMPOSITION_UNRESOLVED"; readonly claimType: ClaimType; readonly compositionProvenance: Provenance }
  | { readonly kind: "REDUCED"; readonly tau: number; readonly branch: "EVIDENCE_AWARE" | "EVIDENCE_FREE"; readonly caps: readonly { readonly what: "tau"; readonly toWhat: number; readonly why: string; readonly byWhat: string }[]; readonly uncertaintyLadderPosition: string; readonly drivers: readonly { readonly kind: "FATAL_FLAG" | "AMBIGUITY"; readonly detail: string }[]; readonly holes: readonly { readonly kind: "FATAL_ASSESSMENT_HOLE"; readonly fatalType: string; readonly description: string }[]; readonly rationale: { readonly supports: string; readonly challenges: string; readonly weakestLink: string }; readonly reducerVersion: string; readonly compositionProvenance: Provenance } {
  const compositionProvenance = provenance(input.compositionRow);
  const composition = input.compositionRow.value.entries[input.claimType];
  if (composition === undefined) return Object.freeze({ kind: "UNAVAILABLE", reason: "COMPOSITION_UNRESOLVED", claimType: input.claimType, compositionProvenance });
  assertUnitInterval(composition.clarityDecayPerAmbiguity, "clarity decay");
  const metrics = compositionMetricsOf(input.assessment, composition.clarityDecayPerAmbiguity);
  let tau = 0;
  for (const term of composition.terms) {
    assertUnitInterval(term.coefficient, `coefficient ${term.metric}`);
    tau += metrics[term.metric] * term.coefficient;
  }
  tau = Math.max(0, Math.min(1, tau));
  const appliedCaps: { what: "tau"; toWhat: number; why: string; byWhat: string }[] = [];
  for (const cap of composition.caps) {
    assertUnitInterval(cap.to, `cap ${cap.whenFatalType}`);
    if (!input.assessment.fallacy.fatalFlags.some((flag) => flag.type === cap.whenFatalType) || tau <= cap.to) continue;
    tau = cap.to;
    appliedCaps.push(Object.freeze({ what: "tau", toWhat: cap.to, why: cap.why, byWhat: cap.by }));
  }
  const uncertainty = Math.max(0, Math.min(1, input.assessment.fallacy.severity + composition.clarityDecayPerAmbiguity * input.assessment.context.ambiguityFlags.length));
  const ladder = composition.uncertaintyLadder.find((entry) => uncertainty <= entry.atMost);
  if (ladder === undefined) throw new TypeError("Uncertainty ladder does not cover the computed uncertainty");
  const drivers = Object.freeze([
    ...input.assessment.fallacy.fatalFlags.map((flag) => Object.freeze({ kind: "FATAL_FLAG" as const, detail: flag.type })),
    ...input.assessment.context.ambiguityFlags.map((flag) => Object.freeze({ kind: "AMBIGUITY" as const, detail: flag }))
  ]);
  const holes = Object.freeze(input.assessment.fallacy.fatalFlags.map((flag) => Object.freeze({ kind: "FATAL_ASSESSMENT_HOLE" as const, fatalType: flag.type, description: flag.description })));
  let weakestMetric = composition.terms[0]?.metric;
  let weakestValue = weakestMetric === undefined ? 1 : metrics[weakestMetric];
  for (const term of composition.terms.slice(1)) {
    if (metrics[term.metric] < weakestValue) { weakestMetric = term.metric; weakestValue = metrics[term.metric]; }
  }
  const strongestMetric = composition.terms.reduce((best, term) => metrics[term.metric] > metrics[best.metric] ? term : best).metric;
  return Object.freeze({
    kind: "REDUCED", tau, branch: composition.branch, caps: Object.freeze(appliedCaps), uncertaintyLadderPosition: ladder.label,
    drivers, holes,
    rationale: Object.freeze({ supports: `Strongest declared component: ${strongestMetric}.`, challenges: `Weakest declared component: ${weakestMetric ?? "none"}.`, weakestLink: weakestMetric ?? "none" }),
    reducerVersion: input.reducerVersion, compositionProvenance
  });
}

/**
 * F-DIAG-S04-PANEL-NOTE — the bounded alphabet a panel note's `reason` is drawn from.
 *
 * The note is not a debug string. `apps/runner/src/index.ts:2695-2699` copies
 * `reason` verbatim into `disagreement.panel.notes[]`, which is persisted and
 * read back off a database row (`tests/integration/database.test.ts:3845`). The
 * previous form forwarded `error.message` from the member's catch, so any text a
 * provider, a driver or a parser put in a message reached storage — the same
 * class as F-RISK-IDENTITY-LOG.
 *
 * What is bounded here is the OUTPUT ALPHABET, following the landed pattern in
 * `apps/api/src/risk-signal-identity.ts`: every string this can return is either
 * a member of the closed `PANEL_MEMBER_FAILURE_KINDS` list below or a literal
 * declared right here. Nothing is derived from the caught value — no substring,
 * no regex capture, no case transform. The caught value is only ever a LOOKUP
 * KEY, and a key that misses becomes the fallback.
 *
 * Why the map is this small. `runJudgePanel` takes a caller-supplied
 * `judge: () => Promise<...>`, so the type of what the catch receives is open
 * (`unknown`), and the router's shape rule for an open key set is to redact
 * wholesale rather than to enumerate. The one TYPED producer on the path is
 * `PanelMemberFailure` (`packages/judgement/src/index.ts:499,505,510,513,514`),
 * and its kind becomes the reason — but only after a RUNTIME membership check
 * against a vocabulary this module OWNS.
 * `instanceof` establishes ancestry, not membership: `PanelMemberFailureKind` is
 * a compile-time union and `readonly` is erased, so a subclass or a mutated
 * instance can carry any string in `failureKind` (codex r1 F1).
 * And the membership store must not be the EXPORTED array: `PANEL_MEMBER_FAILURE_KINDS`
 * is exported and never frozen — `as const` is a type-level assertion and
 * `readonly string[]` aliases rather than copies — so checking through it closes the
 * alphabet over that array's CURRENT CONTENTS, and a caller who pushes into the export
 * widens the reason alphabet (codex r1b F1 remainder). `CANONICAL_MEMBER_FAILURE_KINDS`
 * below is this helper's own copy, built from its own object literal, unreachable from
 * any exported binding. The eight public spellings (B9 added SPEND_REFUSED) are unchanged, and drift between the
 * two is a COMPILE error rather than a silent divergence: the literal carries
 * `satisfies Record<PanelMemberFailureKind, 0>`, which errors in BOTH directions —
 * TS2741 when a kind is missing, TS2353 when one is not in the union. (Measured on
 * this repo's tsc 7.0.2; a plain `as` assertion silences the missing-key error and
 * would NOT have given this guarantee.) The two codes below are the only other constants with a producer that
 * can reach this catch un-converted: `ProviderCallFailedError` and
 * `ProviderContentUnacceptedError` (`packages/providers/src/index.ts:53,69`),
 * both `TypedDomainError`s whose `code` is a fixed literal. `assess()` converts
 * both today, so they are listed for a caller that wires a judge closure
 * straight to `provider.call` — enumerating a subset of a typed vocabulary is
 * how a re-routed rejection silently degrades to the fallback.
 */
const UNCLASSIFIED_MEMBER_ERROR = "UNCLASSIFIED_MEMBER_ERROR";

/**
 * This helper's PRIVATE membership storage. Exhaustive against the declared union in
 * both directions at compile time; independent of the exported array at runtime.
 */
const CANONICAL_MEMBER_FAILURE_KINDS: ReadonlySet<string> = new Set(Object.keys({
  CONSTRUCTION_ERROR: 0,
  TIMEOUT: 0,
  PROVIDER_ERROR: 0,
  PARSE_FAILURE: 0,
  SCHEMA_FAILURE: 0,
  UNCONFIGURED_FAMILY: 0,
  PRODUCER_GRADING_FORBIDDEN: 0,
  SPEND_REFUSED: 0
} satisfies Record<PanelMemberFailureKind, 0>));

const MEMBER_FAILURE_CODES: ReadonlyMap<string, string> = new Map([
  ["PROVIDER_CALL_FAILED", "PROVIDER_CALL_FAILED"],
  ["PROVIDER_CONTENT_UNACCEPTED", "PROVIDER_CONTENT_UNACCEPTED"]
]);

function boundedMemberFailureReason(error: unknown): string {
  if (error instanceof PanelMemberFailure) {
    // ONE read. A getter or a mutated property that answers differently on a
    // second read would defeat a check performed on a different read, so the
    // value that is validated is the value that is returned — never a re-read.
    const failureKind: unknown = error.failureKind;
    return typeof failureKind === "string" && CANONICAL_MEMBER_FAILURE_KINDS.has(failureKind)
      ? failureKind
      : UNCLASSIFIED_MEMBER_ERROR;
  }
  if (!(error instanceof Error)) return UNCLASSIFIED_MEMBER_ERROR;
  // Same discipline: `code` is read once, and the value RETURNED is this
  // module's own map literal, never the string that was read.
  const code: unknown = (error as { readonly code?: unknown }).code;
  if (typeof code !== "string") return UNCLASSIFIED_MEMBER_ERROR;
  return MEMBER_FAILURE_CODES.get(code) ?? UNCLASSIFIED_MEMBER_ERROR;
}

/**
 * B9 (budget spec §2.9) — the codes of a seat left out for money, and the
 * reason its note carries. Like MEMBER_FAILURE_CODES above, the value RETURNED
 * is this module's own literal, never the string that was read.
 */
const LEFT_OUT_SEAT_SPEND_CODES: ReadonlyMap<string, string> = new Map([
  ["RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_MONEY_REACHED"],
  ["DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"],
  ["PERSON_ALLOWANCE_REACHED", "PERSON_ALLOWANCE_REACHED"]
]);

/**
 * Engine money rule (spec §14.4.1), Task M2 — what the panel does when a
 * run-level spend stop arrives.
 *
 * Two ways of asking (ruling R32), chosen by `askTogether`:
 *
 *  · One at a time (the default; the runner's serial path, when the debate's
 *    lane admits one call — hosted and local today): today's loop, each member
 *    awaited before the next is asked. No further member is asked after a
 *    stop: every further member is another call for a run that has just been
 *    told it cannot make one.
 *  · Together (`askTogether: true`; parallel calls, spec 2026-10-12 §2.2/§2.3,
 *    owner ruling O6): every member that is not the author's own seat has its
 *    call started at once, in member order, and their results are read
 *    afterwards IN MEMBER ORDER, with the per-member rules below, so the
 *    panel's outcome is the same whatever order the answers arrive in. A stop
 *    cannot un-send a call already sent, and per O6 calls already sent finish
 *    and are kept; the panel waits for every member to settle, and the FIRST
 *    stop in member order is the panel's stop.
 *
 * Either way:
 *
 *  · "RETHROW" (the default): the stop leaves the panel exactly as it arrived,
 *    and whatever the panel had gathered is dropped with it — the caller's
 *    phase discards the node anyway.
 *  · "RETURN_HEARD": the panel RETURNS what it gathered — the author, every
 *    member voice already heard (paid for) and every note — with the stop as
 *    `stoppedBy`, so the caller can keep those voices. A stop is the run's,
 *    never a member's note. The runner asks for it on the first root's panel
 *    only.
 *
 * B9 (budget spec §2.9, the Panel seats row): `leaveOutMoneyRefusedSeats`
 * changes this for MONEY alone — the run's ceiling for arguing, the site's day
 * and a person's window. Such a seat is noted (MEMBER_FAILED, SPEND_REFUSED,
 * the stop's code as the reason), exactly as a failed member is, and is not a
 * stop. The attempt ceiling and a vendor with no usage still follow the rule
 * above. The runner asks for it only with cheaper models on.
 */
export type PanelRunLevelSpendStopRule = "RETHROW" | "RETURN_HEARD";

/**
 * One panel note. `MEMBER_FAILED` is a member that fell over; the two FX-HR-H6
 * kinds are the author's own maker or route: `PRODUCER_GRADING_FORBIDDEN` is
 * the expected skip BEFORE any call, and `PRODUCER_GRADING_REFUSED_AFTER_CALL`
 * is a seat whose answer came back from the author (a backup) — a billed call
 * and a lost voice — naming the seat (`memberRole`) and who answered.
 */
type PanelNote =
  | { readonly memberRole: string; readonly contractHash: string; readonly kind: "MEMBER_FAILED" | "PRODUCER_GRADING_FORBIDDEN"; readonly failureKind: PanelMemberFailureKind; readonly reason: string }
  | { readonly memberRole: string; readonly answeringMemberRole: string; readonly contractHash: string; readonly kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL"; readonly failureKind: "PRODUCER_GRADING_FORBIDDEN"; readonly reason: string };

export async function runJudgePanel(input: {
  readonly artifactProducerRef: string;
  readonly primary: { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string };
  readonly members: readonly {
    readonly memberRole: string;
    readonly actorRef: string;
    readonly contractHash: string;
    /**
     * Model scorecard A15 (R5): a member may be answered by its seat's backup,
     * so its judge reports WHO answered — the route (`actorRef`) and its maker
     * (`memberRole`). Absent, the member's own values stand. The family
     * discount keys on this route, never on a maker name looked up in a list.
     */
    readonly judge: () => Promise<{
      readonly judgementRef: string;
      readonly assessment: JudgeAssessment;
      readonly actorRef?: string;
      readonly memberRole?: string;
    }>;
  }[];
  readonly onRunLevelSpendStop?: PanelRunLevelSpendStopRule;
  readonly leaveOutMoneyRefusedSeats?: boolean;
  /**
   * Ruling R32: true asks every member at once (the runner passes it only when
   * the debate's lane admits more than one call); absent or false is today's
   * loop, one member at a time, byte for byte.
   */
  readonly askTogether?: boolean;
}): Promise<{
  readonly judgements: readonly { readonly judgementRef: string; readonly assessment: JudgeAssessment; readonly memberRole: string; readonly actorRef: string; readonly contractHash: string | null }[];
  readonly notes: readonly PanelNote[];
  readonly stoppedBy?: unknown;
}> {
  const judgements: { judgementRef: string; assessment: JudgeAssessment; memberRole: string; actorRef: string; contractHash: string | null }[] = [
    { ...input.primary, actorRef: input.artifactProducerRef, contractHash: null }
  ];
  const notes: PanelNote[] = [];
  // FX-HR-H6 is "no MAKER grades its own artifact" — the law the database
  // enforces by maker (migrations 0019/0023/0026) and the evaluator checks by
  // maker. `memberRole` is the maker here, so the author's maker is
  // `input.primary.memberRole`; the author's route is `artifactProducerRef`.
  // A seat is refused on EITHER: the author's maker on another route (a second
  // endpoint a deployment configured, or a picker's runner-up of that maker)
  // is still the author's maker, and the author's route is the author.
  const isTheAuthor = (actorRef: string, memberRole: string): boolean =>
    actorRef === input.artifactProducerRef || memberRole === input.primary.memberRole;
  type Member = (typeof input.members)[number];
  const forbidden = (member: Member): void => {
    notes.push({ memberRole: member.memberRole, contractHash: member.contractHash, kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6" });
  };
  /** One member's answer, read with the per-member rules (inside the member's try, as it always was). */
  const heard = (member: Member, judged: Awaited<ReturnType<Member["judge"]>>): void => {
    const actorRef = judged.actorRef ?? member.actorRef;
    const memberRole = judged.memberRole ?? member.memberRole;
    // FX-HR-H6 holds for WHOEVER answered: a backup on the author's route or
    // of the author's maker is refused as the author's own seat is. It is not
    // the expected skip above — a call was made and a voice was lost — so it
    // has its own kind, naming the seat AND the maker that answered.
    if (isTheAuthor(actorRef, memberRole)) {
      notes.push({
        memberRole: member.memberRole,
        answeringMemberRole: memberRole,
        contractHash: member.contractHash,
        kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL",
        failureKind: "PRODUCER_GRADING_FORBIDDEN",
        reason: "FX-HR-H6"
      });
      return;
    }
    judgements.push({
      judgementRef: judged.judgementRef,
      assessment: judged.assessment,
      memberRole,
      actorRef,
      contractHash: member.contractHash
    });
  };
  /**
   * One member's failure, read with the per-member rules. "STOP" is a run-level
   * spend stop: the run's, not this member's.
   *
   * V-28: a RUN-LEVEL spend stop is not this member's failure, it is the run's:
   * it is never noted as a member failure (a money ceiling is not a transport
   * fault), and it leaves untouched, keeping the code that says which control
   * spoke. Asked one at a time, nobody is asked after it; asked together, the
   * FIRST stop in member order is kept and acted on once every member has been
   * read. Either way it is rethrown, or — Task M2, when the caller asks —
   * returned beside every voice already heard.
   */
  const failed = (member: Member, error: unknown): "STOP" | "NOTED" => {
    if (isRunLevelSpendStop(error)) {
      // B9: with the setting, a seat refused for MONEY is left out, as a failed
      // seat is, and the panel carries on. `code` is read once; the reason is
      // this module's own literal.
      const code: unknown = (error as { readonly code?: unknown }).code;
      const leftOut = input.leaveOutMoneyRefusedSeats === true && typeof code === "string"
        ? LEFT_OUT_SEAT_SPEND_CODES.get(code)
        : undefined;
      if (leftOut !== undefined) {
        notes.push({
          memberRole: member.memberRole,
          contractHash: member.contractHash,
          kind: "MEMBER_FAILED",
          failureKind: "SPEND_REFUSED",
          reason: leftOut
        });
        return "NOTED";
      }
      return "STOP";
    }
    notes.push({
      memberRole: member.memberRole,
      contractHash: member.contractHash,
      kind: "MEMBER_FAILED",
      failureKind: error instanceof PanelMemberFailure ? error.failureKind : "PROVIDER_ERROR",
      reason: boundedMemberFailureReason(error)
    });
    return "NOTED";
  };
  let firstStop: { readonly error: unknown } | null = null;
  if (input.askTogether === true) {
    // Parallel calls (spec 2026-10-12 §2.2): every member that is not refused
    // before its call is STARTED here, synchronously and in member order — so a
    // scheduler sees them queued in member order — and only then awaited
    // together. A judge that throws synchronously becomes that member's rejected
    // call, as it was a caught member failure when each was awaited in turn.
    // `Promise.allSettled` observes every call, so none can reject unhandled.
    const asked = input.members.map((member) => ({
      member,
      call: isTheAuthor(member.actorRef, member.memberRole) ? null : startMemberCall(member.judge)
    }));
    const settled = await Promise.allSettled(asked.map((entry) => entry.call ?? NOT_CALLED));
    // Read in MEMBER order, with exactly the per-member rules of the serial panel.
    for (const [index, { member, call }] of asked.entries()) {
      if (call === null) {
        forbidden(member);
        continue;
      }
      const outcome = settled[index]!;
      try {
        if (outcome.status === "rejected") throw outcome.reason;
        heard(member, outcome.value as Awaited<ReturnType<Member["judge"]>>);
      } catch (error) {
        if (failed(member, error) === "STOP" && firstStop === null) firstStop = { error };
      }
    }
  } else {
    // Today's loop (ruling R32): one member at a time, nobody after a stop.
    for (const member of input.members) {
      if (isTheAuthor(member.actorRef, member.memberRole)) {
        forbidden(member);
        continue;
      }
      try {
        heard(member, await member.judge());
      } catch (error) {
        if (failed(member, error) === "STOP") {
          firstStop = { error };
          break;
        }
      }
    }
  }
  if (firstStop !== null && input.onRunLevelSpendStop !== "RETURN_HEARD") throw firstStop.error;
  return Object.freeze({
    judgements: Object.freeze(judgements.map((entry) => Object.freeze(entry))),
    notes: Object.freeze(notes.map((note) => Object.freeze(note))),
    ...(firstStop === null ? {} : { stoppedBy: firstStop.error })
  });
}

/** What `Promise.allSettled` is handed for a seat refused before its call. */
const NOT_CALLED: Promise<null> = Promise.resolve(null);

/**
 * Starts one member's call NOW. A judge that throws before it returns its
 * promise becomes a rejected call, read later as that member's failure.
 */
function startMemberCall<T>(judge: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(judge());
  } catch (error) {
    return Promise.reject(error);
  }
}

export const PANEL_MEMBER_FAILURE_KINDS = [
  "CONSTRUCTION_ERROR", "TIMEOUT", "PROVIDER_ERROR", "PARSE_FAILURE",
  "SCHEMA_FAILURE", "UNCONFIGURED_FAMILY", "PRODUCER_GRADING_FORBIDDEN",
  // B9 (budget spec §2.9): a seat the run could not pay for, left out as a
  // failed seat is. Never PROVIDER_ERROR, which would bring back V-28's
  // misattribution of a money ceiling as a transport fault.
  "SPEND_REFUSED"
] as const;
export type PanelMemberFailureKind = typeof PANEL_MEMBER_FAILURE_KINDS[number];

export class PanelMemberFailure extends Error {
  /**
   * Model scorecard A16: the provider failure this wraps travels as `cause`,
   * so a seat can tell a dead transport or a usage cap (R4: switch to the
   * runner-up) from a refused answer (never switch). The reason text the panel
   * records is unchanged: it is still read from `failureKind` alone.
   */
  constructor(
    readonly failureKind: Exclude<PanelMemberFailureKind, "PRODUCER_GRADING_FORBIDDEN" | "SPEND_REFUSED">,
    message: string,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options);
    this.name = "PanelMemberFailure";
  }
}

export function measureDispersion(judgements: readonly { readonly judgementRef: string; readonly tau: number }[], row: Provenance & { readonly scale: number }):
  | { readonly kind: "ABSENT"; readonly reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" }
  | { readonly kind: "MEASURED"; readonly value: number; readonly driver: { readonly kind: "DISPERSION"; readonly source: Provenance } } {
  if (new Set(judgements.map((entry) => entry.judgementRef)).size < 2) return Object.freeze({ kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" });
  assertUnitInterval(row.scale, "dispersion scale");
  let minimum = 1;
  let maximum = 0;
  for (const judgement of judgements) {
    assertUnitInterval(judgement.tau, `tau ${judgement.judgementRef}`);
    minimum = Math.min(minimum, judgement.tau); maximum = Math.max(maximum, judgement.tau);
  }
  return Object.freeze({ kind: "MEASURED", value: Math.max(0, Math.min(1, (maximum - minimum) * row.scale)), driver: Object.freeze({ kind: "DISPERSION", source: provenance(row) }) });
}

export type JudgeFamily = { readonly kind: "KNOWN"; readonly familyRef: string } | { readonly kind: "UNKNOWN"; readonly reason: string };
export function applyCorrelatedErrorDiscount(judgements: readonly { readonly memberRole: string; readonly earnedWeight: number; readonly family: JudgeFamily }[], row: Provenance & { readonly repeatedFamilyMultiplier: number }): readonly { readonly memberRole: string; readonly effectiveWeight: number; readonly family: JudgeFamily; readonly familyOrdinal: number | null; readonly weightProvenance: Provenance }[] {
  assertUnitInterval(row.repeatedFamilyMultiplier, "repeated-family multiplier");
  const seen = new Map<string, number>();
  const weightProvenance = provenance(row);
  return Object.freeze(judgements.map((judgement) => {
    assertUnitInterval(judgement.earnedWeight, `earned weight ${judgement.memberRole}`);
    if (judgement.family.kind === "UNKNOWN") return Object.freeze({ ...judgement, effectiveWeight: judgement.earnedWeight, familyOrdinal: null, weightProvenance });
    const familyOrdinal = (seen.get(judgement.family.familyRef) ?? 0) + 1;
    seen.set(judgement.family.familyRef, familyOrdinal);
    return Object.freeze({ ...judgement, effectiveWeight: familyOrdinal === 1 ? judgement.earnedWeight : judgement.earnedWeight * row.repeatedFamilyMultiplier, familyOrdinal, weightProvenance });
  }));
}

export interface JudgementSelectionRule extends Provenance { readonly kind: "MAXIMIZE_WEIGHTED_TAU" }
export function selectReducedJudgement(candidates: readonly { readonly judgementRef: string; readonly tau: number; readonly effectiveWeight: number }[], rule: JudgementSelectionRule):
  | { readonly kind: "UNAVAILABLE"; readonly reason: "NO_USABLE_JUDGEMENTS" }
  | { readonly kind: "SELECTED"; readonly selectedJudgementRef: string; readonly tau: number; readonly selectionScore: number; readonly rule: JudgementSelectionRule } {
  if (candidates.length === 0) return Object.freeze({ kind: "UNAVAILABLE", reason: "NO_USABLE_JUDGEMENTS" });
  const recordedRule = Object.freeze({ ...rule, ...provenance(rule) });
  let selected = candidates[0]!;
  assertUnitInterval(selected.tau, `tau ${selected.judgementRef}`); assertUnitInterval(selected.effectiveWeight, `weight ${selected.judgementRef}`);
  // DR-077: earned weight multiplies the selection arithmetic; the selected tau itself is never averaged or rescaled.
  let selectionScore = selected.tau * selected.effectiveWeight;
  for (const candidate of candidates.slice(1)) {
    assertUnitInterval(candidate.tau, `tau ${candidate.judgementRef}`); assertUnitInterval(candidate.effectiveWeight, `weight ${candidate.judgementRef}`);
    const candidateScore = candidate.tau * candidate.effectiveWeight;
    if (candidateScore > selectionScore) { selected = candidate; selectionScore = candidateScore; }
  }
  return Object.freeze({ kind: "SELECTED", selectedJudgementRef: selected.judgementRef, tau: selected.tau, selectionScore, rule: recordedRule });
}

export function applyDeclaredDisagreement(input: { readonly fires: boolean; readonly predicateRef: string; readonly observationRef: string; readonly certaintyBand: string | null; readonly downgradedBand: string | null }): { readonly flag: "DISAGREEMENT" | "NO_DISAGREEMENT"; readonly certaintyBand: string | null; readonly certaintyEffect: "DOWNGRADED" | "UNCHANGED"; readonly predicateRef: string; readonly observationRef: string; readonly abstention: false } {
  if (input.predicateRef.trim() === "" || input.observationRef.trim() === "") throw new TypeError("A disagreement decision requires declared predicate and observation provenance");
  if (input.fires && (input.certaintyBand === null || input.downgradedBand === null)) throw new TypeError("A firing disagreement requires a declared certainty downgrade");
  return Object.freeze({ flag: input.fires ? "DISAGREEMENT" : "NO_DISAGREEMENT", certaintyBand: input.fires ? input.downgradedBand : input.certaintyBand, certaintyEffect: input.fires ? "DOWNGRADED" : "UNCHANGED", predicateRef: input.predicateRef, observationRef: input.observationRef, abstention: false });
}

export function createUnmeasuredDisagreement(): {
  readonly kind: "NOT_MEASURED";
  readonly reason: "SINGLE_JUDGE_WALKING_SKELETON";
  readonly predicateRef: null;
  readonly observationRef: null;
  readonly certaintyEffect: "UNCHANGED";
  readonly abstention: false;
} {
  return Object.freeze({
    kind: "NOT_MEASURED",
    reason: "SINGLE_JUDGE_WALKING_SKELETON",
    predicateRef: null,
    observationRef: null,
    certaintyEffect: "UNCHANGED",
    abstention: false
  });
}
