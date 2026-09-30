import type { JudgeFailureCause } from "./check.js";

export type JudgeAnswer = Readonly<{
  verdict: "ALLOW" | "BLOCK" | "UNSURE";
  rules: readonly (1 | 2)[];
  parts: readonly string[];
  possibly_illegal: boolean;
}>;
export type JudgeCallResult = { ok: true; answer: JudgeAnswer } | { ok: false; cause: JudgeFailureCause };

const VERDICTS: readonly JudgeAnswer["verdict"][] = ["ALLOW", "BLOCK", "UNSURE"];
const JSON_ESCAPES: Readonly<Record<string, string>> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const NAMED_ENTITIES: Readonly<Record<string, string>> = { quot: '"', apos: "'", amp: "&", colon: ":", lbrace: "{", rbrace: "}", lcub: "{", rcub: "}" };
const codePoint = (value: number, fallback: string) => value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
/** One layer of the encodings a judge can undo while copying: JSON/JS escapes and HTML character references. */
function decodeOnce(text: string): string {
  return text
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/gu, (match, braced?: string, four?: string, two?: string) =>
      codePoint(parseInt((braced ?? four ?? two)!, 16), match))
    .replace(/\\(["\\/bfnrt])/gu, (_match, escaped: string) => JSON_ESCAPES[escaped]!)
    .replace(/&#x([0-9a-fA-F]{1,6});?|&#([0-9]{1,7});?/gu, (match, hex?: string, decimal?: string) =>
      codePoint(hex === undefined ? Number(decimal) : parseInt(hex, 16), match))
    .replace(/&([a-zA-Z]+);/gu, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}
/**
 * The text a judge can hand back from `text` without writing anything of its own: every escape layer undone
 * (at most four), compatibility forms folded (NFKC: fullwidth, ligatures), format characters, separators and
 * whitespace removed, and typographic quotes read as ASCII quotes.
 */
function canonicalText(text: string): string {
  let decoded = text;
  for (let layer = 0; layer < 4; layer++) {
    const next = decodeOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded.normalize("NFKC")
    .replace(/[\p{Cf}\p{Z}\s]/gu, "")
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035`\u00b4]/gu, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036\u00ab\u00bb]/gu, '"');
}
/** A JSON key named `verdict` (any case), in the shape the answer form requires: quoted, then a colon. */
const VERDICT_KEY = /["']verdict["']:/iu;
/**
 * FIX-HS2-p2 api-B1: true when the call's material can supply a verdict object — a quoted `verdict` key followed by
 * a colon in any single field, or across the fields read in the order they were sent, once every copying
 * transformation of canonicalText is undone. The judge can only return such an object by copying it or by writing
 * it itself; a copy must never decide publication, so no answer of that call is taken.
 */
export function materialCarriesVerdict(sentMaterial: readonly string[]): boolean {
  return [...sentMaterial, sentMaterial.join("")].some(text => VERDICT_KEY.test(canonicalText(text)));
}

/**
 * FIX-HS2-p1 sd-B2, widened by FIX-HS2-p2 api-B1: `sentMaterial` is the content of every material field of THIS
 * call. When that material itself carries a verdict key (materialCarriesVerdict), any answer — literal copy,
 * decoded copy, reordered copy, a copy joined from pieces in several fields — may be a copy of the owner's text,
 * not the judge's verdict: it is refused as JUDGE_ANSWER_SCHEMA (fail closed, SPEC-v2 R7), whatever verdict it names.
 */
export function parseJudgeAnswer(text: string, sentFieldNames: readonly string[], sentMaterial: readonly string[] = []): JudgeCallResult {
  let source = text.trim();
  if (source.startsWith("```")) {
    const match = /^```(?:json)?\r?\n([^]*?)\r?\n```$/.exec(source);
    if (!match || match[1]!.includes("```")) return { ok: false, cause: "JUDGE_ANSWER_NOT_JSON" };
    source = match[1]!;
  }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return { ok: false, cause: "JUDGE_ANSWER_NOT_JSON" }; }
  const schemaFailure = { ok: false, cause: "JUDGE_ANSWER_SCHEMA" } as const;
  if (!value || typeof value !== "object" || Array.isArray(value)) return schemaFailure;
  const row = value as Record<string, unknown>;
  const keys = ["verdict", "rules", "parts", "possibly_illegal"];
  if (Object.keys(row).length !== 4 || !keys.every(key => Object.hasOwn(row, key))) return schemaFailure;
  const { verdict, rules, parts, possibly_illegal } = row;
  if (typeof verdict !== "string" || !(VERDICTS as readonly string[]).includes(verdict)
    || !Array.isArray(rules) || !rules.every(rule => rule === 1 || rule === 2) || new Set(rules).size !== rules.length
    || !Array.isArray(parts) || !parts.every(part => typeof part === "string") || new Set(parts).size !== parts.length
    || typeof possibly_illegal !== "boolean") return schemaFailure;
  if (verdict === "ALLOW" && (rules.length !== 0 || parts.length !== 0 || possibly_illegal)) return schemaFailure;
  if (verdict === "BLOCK" && (rules.length === 0 || parts.length === 0)) return schemaFailure;
  if (verdict === "UNSURE" && rules.length !== 0) return schemaFailure;
  if (parts.some(part => !sentFieldNames.includes(part))) return { ok: false, cause: "JUDGE_ANSWER_UNKNOWN_PART" };
  if (materialCarriesVerdict(sentMaterial)) return schemaFailure;
  return { ok: true, answer: { verdict: verdict as JudgeAnswer["verdict"], rules, parts, possibly_illegal } };
}

export type CombinedJudgeCalls = Readonly<{
  outcome: JudgeAnswer["verdict"] | "UNAVAILABLE";
  rules: readonly (1 | 2)[];
  parts: readonly string[];
  possibly_illegal: boolean;
  cause?: JudgeFailureCause;
}>;

/**
 * SPEC-v2 R6 order BLOCK > UNSURE > UNAVAILABLE > ALLOW. FIX-HS2-p1 ct-B3 / sd-N2: ALLOW is EARNED — every call
 * answered, every answer is exactly "ALLOW". No calls at all, or an answer outside the closed verdict set that
 * reached this point, is UNAVAILABLE JUDGE_ANSWER_SCHEMA, never a fall-through ALLOW.
 */
export function combineJudgeCalls(results: readonly JudgeCallResult[]): CombinedJudgeCalls {
  const unknown = results.length === 0
    || results.some(result => result.ok && !VERDICTS.includes(result.answer.verdict));
  for (const outcome of ["BLOCK", "UNSURE", "UNAVAILABLE", "ALLOW"] as const) {
    if (outcome === "ALLOW" && unknown) {
      return { outcome: "UNAVAILABLE", cause: "JUDGE_ANSWER_SCHEMA", rules: [], parts: [], possibly_illegal: false };
    }
    if (outcome === "UNAVAILABLE") {
      const failed = results.find(result => !result.ok);
      if (failed && !failed.ok) return { outcome, cause: failed.cause, rules: [], parts: [], possibly_illegal: false };
      continue;
    }
    const answers = results.flatMap(result => result.ok && result.answer.verdict === outcome ? [result.answer] : []);
    if (answers.length || outcome === "ALLOW") return {
      outcome,
      rules: [...new Set(answers.flatMap(answer => answer.rules))].sort((a, b) => a - b),
      parts: [...new Set(answers.flatMap(answer => answer.parts))],
      possibly_illegal: outcome === "BLOCK" && answers.some(answer => answer.possibly_illegal)
    };
  }
  throw new Error("Unreachable judge outcome");
}
