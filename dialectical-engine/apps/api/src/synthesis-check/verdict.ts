import { SYNTHESIS_CHECK_CATEGORIES, type SynthesisCheckCategory } from "../../../../packages/contract/src/synthesis-check.js";

const SYNTHESIS_CHECK_REPLY_MAX_BYTES = 192;
const ANSWER_KEYS = ["call", ...SYNTHESIS_CHECK_CATEGORIES];

export type SynthesisCheckAnswer =
  | { ok: true; verdict: "CLEAR" | "FLAGGED"; categories: readonly SynthesisCheckCategory[] }
  | { ok: false; code: "ANSWER_NOT_JSON" | "ANSWER_SCHEMA" };

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

export function parseSynthesisCheckAnswer(text: string, expectedCall: string): SynthesisCheckAnswer {
  if (Buffer.byteLength(text) > SYNTHESIS_CHECK_REPLY_MAX_BYTES) return { ok: false, code: "ANSWER_SCHEMA" };
  let source = text.trim();
  if (source.startsWith("```")) {
    const match = /^```(?:json)?\r?\n([^]*?)\r?\n```$/u.exec(source);
    if (!match || match[1]!.includes("```")) return { ok: false, code: "ANSWER_NOT_JSON" };
    source = match[1]!;
  }
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return { ok: false, code: "ANSWER_NOT_JSON" }; }
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || repeatsAKey(source)) {
    return { ok: false, code: "ANSWER_SCHEMA" };
  }
  const answer = value as Record<string, unknown>;
  if (Object.keys(answer).length !== ANSWER_KEYS.length || ANSWER_KEYS.some(key => !Object.hasOwn(answer, key))
    || answer.call !== expectedCall
    || SYNTHESIS_CHECK_CATEGORIES.some(category => answer[category] !== 0 && answer[category] !== 1)) {
    return { ok: false, code: "ANSWER_SCHEMA" };
  }
  const categories = SYNTHESIS_CHECK_CATEGORIES.filter(category => answer[category] === 1);
  return { ok: true, verdict: categories.length === 0 ? "CLEAR" : "FLAGGED", categories };
}
