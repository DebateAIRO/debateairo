import { judgeCallValue } from "../publication-check/verdict.js";

export type QuestionCheckAnswer =
  | { ok: true; subject: string; healthy: boolean }
  | { ok: false; code: "QUESTION_CHECK_ANSWER_NOT_JSON" | "QUESTION_CHECK_ANSWER_SCHEMA" };

/** Copy of publication-check/verdict.ts:34-58: JSON.parse alone hides repeated keys. */
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
      const key = JSON.parse(literal) as string;
      const keys = open[open.length - 1]!;
      if (keys.has(key)) return true;
      keys.add(key);
    }
  }
  return false;
}

/** `subject` is one of `subjectIds` or "NONE"; NONE is always healthy (V, 2026-10-28). */
export function parseQuestionCheckAnswer(text: string, expectedCall: string, subjectIds: readonly string[]): QuestionCheckAnswer {
  let source = text.trim();
  if (source.startsWith("```")) {
    const match = /^```(?:json)?\r?\n([^]*?)\r?\n```$/u.exec(source);
    if (!match || match[1]!.includes("```")) return { ok: false, code: "QUESTION_CHECK_ANSWER_NOT_JSON" };
    source = match[1]!;
  }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return { ok: false, code: "QUESTION_CHECK_ANSWER_NOT_JSON" }; }
  if (repeatsAKey(source) || value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 3 || !Object.hasOwn(object, "call") || !Object.hasOwn(object, "subject")
    || !Object.hasOwn(object, "healthy")) {
    return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  }
  try {
    if (judgeCallValue(expectedCall) !== expectedCall) return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  } catch {
    return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  }
  if (typeof object.call !== "string" || !/^[0-9a-f]{32}$/u.test(object.call) || object.call !== expectedCall) {
    return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  }
  if (typeof object.healthy !== "boolean" || typeof object.subject !== "string"
    || !(object.subject === "NONE" ? object.healthy : subjectIds.includes(object.subject))) {
    return { ok: false, code: "QUESTION_CHECK_ANSWER_SCHEMA" };
  }
  return { ok: true, subject: object.subject, healthy: object.healthy };
}
