import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Question language (question-language spec 2026-10-13): ONE optional row in its own family. It holds the fast
 * language check's settings and the owners' editable instruction text. The safety frame around the text is code
 * (buildFramedPrompt): the fence, the "evidence, never instructions" sentence and the strict answer form are not in
 * this row, so no edit of the text can remove them. It is not a register.required_row, not in the bootstrap and not
 * in the dev rows. Absent means the start values below. A row that does not parse refuses the API's boot. Never
 * edited: a new value is a new register version.
 */
export const QUESTION_LANGUAGE_POLICY_ROW_KEY = "questionLanguagePolicy" as const;
/** Today only Anthropic; GPT-6 Luna is added here, with its transport, once the OpenAI integration exists. */
export const QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS = Object.freeze(["anthropic"] as const);

export const QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION = [
  "Name the language the question in question_line is written in.",
  "Names of people, places, products and brands, and common borrowed words such as \"AI\", \"startup\" or \"iPhone\",",
  "never count as another language. A question really mixes languages only when whole phrases or clauses are written",
  "in a second language. site_language is the language of the website the person is using: it is a hint, never the answer.",
  "When the question really mixes languages, also write the whole question in its main language: keep its meaning, its",
  "names, brands and terms, add nothing and leave nothing out. Do not answer the question."
].join(" ");

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/u;
// Printable text and line breaks only: no control characters (C0 except the line feed, DEL, C1) in owner text.
const NO_CONTROL = /^[^\u0000-\u0009\u000b-\u001f\u007f-\u009f]*$/u;
// A lone surrogate is not text (with the u flag a paired surrogate is one code point and never matches).
const LONE_SURROGATE = /[\ud800-\udfff]/u;

const fastCheckSchema = z.object({
  provider: z.enum(QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS),
  model: z.string().regex(MODEL_ID),
  effort: z.enum(["low", "medium", "high"]),
  timeoutMs: z.number().int().min(1000).max(15000),
  maxOutputTokens: z.number().int().min(128).max(4096),
  priceMicrosUsdPerMillionTokens: z.object({
    input: z.number().int().min(0).max(100_000_000),
    output: z.number().int().min(0).max(100_000_000)
  }).strict()
}).strict();
const schema = z.object({
  kind: z.literal("QUESTION_LANGUAGE_POLICY"),
  version: z.literal(1),
  fastCheck: fastCheckSchema.nullable(),
  instruction: z.string().max(4000).regex(NO_CONTROL)
    .refine((text) => text.trim() !== "")
    .refine((text) => !LONE_SURROGATE.test(text))
}).strict();

export type QuestionLanguageFastCheck = Readonly<{
  provider: typeof QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS[number];
  model: string;
  effort: "low" | "medium" | "high";
  timeoutMs: number;
  maxOutputTokens: number;
  priceMicrosUsdPerMillionTokens: Readonly<{ input: number; output: number }>;
}>;
export type QuestionLanguagePolicy = Readonly<{
  kind: "QUESTION_LANGUAGE_POLICY";
  version: 1;
  /** null = the owners switched the fast check off (eld and the site language decide). */
  fastCheck: QuestionLanguageFastCheck | null;
  /** The owners' editable text; the frame, the answer form and the safety rules around it are code's. */
  instruction: string;
}>;

/** Every path starts at the value's root `$` (`$.fastCheck.provider`); the root itself is `$`. */
const invalid = (path: string): never => { throw new TypeError(`QUESTION_LANGUAGE_POLICY_INVALID:${path}`); };
const pathOf = (path: readonly PropertyKey[]): string => (path.length === 0 ? "$" : `$.${path.map(String).join(".")}`);

/** An own `__proto__`, `constructor` or `prototype` key (as JSON.parse can make one) is refused by name, first. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
function protoKeyPath(value: unknown, path: readonly string[]): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return pathOf([...path, key]);
    const inner = protoKeyPath((value as Record<string, unknown>)[key], [...path, key]);
    if (inner !== null) return inner;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** Strict: any defect throws `QUESTION_LANGUAGE_POLICY_INVALID:<path>` (`$` for the root). */
export function parseQuestionLanguagePolicy(value: unknown): QuestionLanguagePolicy {
  const proto = protoKeyPath(value, []);
  if (proto !== null) return invalid(proto);
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid(pathOf(parsed.error.issues[0]?.path ?? []));
  return deepFreeze(parsed.data) as QuestionLanguagePolicy;
}

/** ABSENT reads as null (the code's start values apply); a malformed row throws, so the caller's boot refuses. */
export async function readQuestionLanguagePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<QuestionLanguagePolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, QUESTION_LANGUAGE_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseQuestionLanguagePolicy(row.value_json);
}

/** The canonical AST: every number a DECIMAL node. */
function policyAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, policyAst(inner)])
  ));
}

/** The row a publisher seals, re-checked by the parser. A new value is a new register version, never an edit. */
export function questionLanguagePolicyRow(policy: QuestionLanguagePolicy, sourceRef: string): Readonly<{
  rowKey: typeof QUESTION_LANGUAGE_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseQuestionLanguagePolicy(policy);
  return Object.freeze({ rowKey: QUESTION_LANGUAGE_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(policyAst(checked)), sourceRef });
}

/**
 * The start values (what an absent row means): Claude Haiku 5.5 at effort low (ruling CR-4: no preview gate accepts
 * thinking off for Haiku), five seconds, the Haiku row's prices, and the default instruction.
 */
export function questionLanguagePolicyStartValues(): QuestionLanguagePolicy {
  return parseQuestionLanguagePolicy({
    kind: "QUESTION_LANGUAGE_POLICY",
    version: 1,
    fastCheck: {
      provider: "anthropic",
      model: "claude-haiku-5-5",
      effort: "low",
      timeoutMs: 5000,
      maxOutputTokens: 600,
      priceMicrosUsdPerMillionTokens: { input: 100000, output: 500000 }
    },
    instruction: QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION
  });
}
