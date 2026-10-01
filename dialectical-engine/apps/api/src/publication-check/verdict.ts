import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import type { JudgeFailureCause } from "./check.js";

export type JudgeAnswer = Readonly<{
  verdict: "ALLOW" | "BLOCK" | "UNSURE";
  rules: readonly (1 | 2)[];
  parts: readonly string[];
  possibly_illegal: boolean;
}>;
export type JudgeCallResult = { ok: true; answer: JudgeAnswer } | { ok: false; cause: JudgeFailureCause };

const VERDICTS: readonly JudgeAnswer["verdict"][] = ["ALLOW", "BLOCK", "UNSURE"];
/**
 * FIX-HS2-v V-21 (V's ruling, supersedes V-18): the answer is BOUND to its call. Every judge call's frame carries a
 * boundary marker of 128 CSPRNG bits minted per call, after the material is fixed
 * (packages/providers/src/prompt-frame.ts:222-235); the R5 answer form requires the judge to copy its 32 hexadecimal
 * characters into `call`. Text the owner wrote before the call existed cannot carry that value, so an answer COPIED
 * out of the material — a whole object in any spelling, encoding or split — is never this call's answer, and an answer
 * that repeats any key (a bound head continued by a copied tail, FIX-HS2-v2 N1) is refused too. What this does NOT
 * guarantee: a verdict the judge WRITES with this call's value — obeyed from the text, or completed from a fragment of
 * it (a copied tail after its own `{"call":"<value>",`, a fake value it replaces with the real one) — is taken; that
 * is V-16's residual, measured by the eval's injection block. This replaces the pass-1/pass-2 scan of the material for
 * verdict-like keys, which was an open list and refused honest text.
 */
const CALL_VALUE = /^[0-9a-f]{32}$/u;

/** The call's one-time value: the 32 lowercase hexadecimal characters of the frame's boundary marker. */
export function judgeCallValue(fence: string): string {
  const hex = fence.match(/[0-9a-f]{32}/gu);
  if (hex === null || hex.length !== 1) throw new TypedDomainError("PROMPT_FRAME_ABSENT", "The frame carries no single per-call value");
  return hex[0]!;
}

/**
 * FIX-HS2-v2 N1: JSON.parse keeps the LAST copy of a repeated key, so the parsed object cannot show a repetition. This
 * walks the (already valid) JSON text and reports any object in it that names the same key twice, comparing keys
 * after JSON unescaping (`"\u0076erdict"` repeats `"verdict"`).
 */
function repeatsAKey(json: string): boolean {
  const open: Set<string>[] = [];
  for (let at = 0; at < json.length; at++) {
    const ch = json[at];
    if (ch === "{") open.push(new Set());
    else if (ch === "}") open.pop();
    else if (ch === '"') {
      let end = at + 1;
      while (json[end] !== '"') end += json[end] === "\\" ? 2 : 1;
      const literal = json.slice(at, end + 1);
      at = end;
      let next = end + 1;
      while (next < json.length && " \t\n\r".includes(json[next]!)) next++;
      if (json[next] !== ":") continue;
      const key = JSON.parse(literal) as string, keys = open[open.length - 1]!;
      if (keys.has(key)) return true;
      keys.add(key);
    }
  }
  return false;
}

/**
 * R5: `expectedCall` is judgeCallValue of THIS call's frame. An answer is taken only when its text is one object that
 * names each of the five keys exactly once and whose `call` is that value; a repeated key, or a missing, different,
 * re-cased or padded value, is JUDGE_ANSWER_SCHEMA (fail closed, SPEC-v2 R7), whatever verdict the answer names.
 */
export function parseJudgeAnswer(text: string, sentFieldNames: readonly string[], expectedCall: string): JudgeCallResult {
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
  if (!value || typeof value !== "object" || Array.isArray(value) || repeatsAKey(source)) return schemaFailure;
  const row = value as Record<string, unknown>;
  const keys = ["call", "verdict", "rules", "parts", "possibly_illegal"];
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) return schemaFailure;
  if (!CALL_VALUE.test(expectedCall) || row.call !== expectedCall) return schemaFailure;
  const { verdict, rules, parts, possibly_illegal } = row;
  if (typeof verdict !== "string" || !(VERDICTS as readonly string[]).includes(verdict)
    || !Array.isArray(rules) || !rules.every(rule => rule === 1 || rule === 2) || new Set(rules).size !== rules.length
    || !Array.isArray(parts) || !parts.every(part => typeof part === "string") || new Set(parts).size !== parts.length
    || typeof possibly_illegal !== "boolean") return schemaFailure;
  if (verdict === "ALLOW" && (rules.length !== 0 || parts.length !== 0 || possibly_illegal)) return schemaFailure;
  if (verdict === "BLOCK" && (rules.length === 0 || parts.length === 0)) return schemaFailure;
  if (verdict === "UNSURE" && rules.length !== 0) return schemaFailure;
  if (parts.some(part => !sentFieldNames.includes(part))) return { ok: false, cause: "JUDGE_ANSWER_UNKNOWN_PART" };
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
