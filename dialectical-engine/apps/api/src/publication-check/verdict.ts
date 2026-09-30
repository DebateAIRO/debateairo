import type { JudgeFailureCause } from "./check.js";

export type JudgeAnswer = Readonly<{
  verdict: "ALLOW" | "BLOCK" | "UNSURE";
  rules: readonly (1 | 2)[];
  parts: readonly string[];
  possibly_illegal: boolean;
}>;
export type JudgeCallResult = { ok: true; answer: JudgeAnswer } | { ok: false; cause: JudgeFailureCause };

const VERDICTS: readonly JudgeAnswer["verdict"][] = ["ALLOW", "BLOCK", "UNSURE"];
const squeeze = (text: string) => text.replace(/\s+/gu, "");

/**
 * FIX-HS2-p1 sd-B2: `sentMaterial` is the content of every material field of THIS call. An answer whose text, or
 * whose canonical JSON, occurs inside one of them is a copy of the owner's text, not the judge's verdict: it is
 * refused as JUDGE_ANSWER_SCHEMA (fail closed, SPEC-v2 R7), whatever verdict it names.
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
  const copied = [squeeze(source), squeeze(JSON.stringify({ verdict, rules, parts, possibly_illegal }))];
  if (sentMaterial.some(content => { const field = squeeze(content); return copied.some(form => field.includes(form)); })) return schemaFailure;
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
