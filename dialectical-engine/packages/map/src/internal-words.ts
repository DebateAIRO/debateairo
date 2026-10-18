import { PATCH_REPLY_FORM_SENTENCE } from "@debateai/providers";
import { MAP_ANSWER_FORMS, MAP_CONTRACT_NAMES, MAP_DEFAULT_INSTRUCTIONS, MAP_ENGINE_ANSWER_FORMS, MAP_ENGINE_CONTRACT_NAMES, MAP_ENGINE_INSTRUCTIONS } from "./prompts.js";

/**
 * Engine words in map text (owner rule: no engine internals in anything a person reads; practice 2026-10-15, ro-strainatate:
 * a list AI wrote "… nu e analizată de angle_focus, …", the merge kept it as a key point, and it reached the debate page's
 * "Also raised, not debated" list). Plain words: a claim that talks about the prompt's own input or output fields
 * (angle_focus, key_point_id, why_it_matters …) or about an item's opaque id (pt04, ca01) is about the engine, not the
 * question, so it is SKIPPED wherever a person could read it. Its text is never edited: it is left out whole.
 *
 * The field names are read from the map's own prompts (every step's shipped instruction and answer form, and the frame's
 * patch sentence), so a new field there is covered without a hand-kept list: every name of two or more words joined by
 * underscores. A one-word field (points, answers, claim, focus, leans, statement …) is an ordinary word of prose and is
 * never matched.
 */
const SNAKE_NAME = /[A-Za-z]+(?:_[A-Za-z]+)+/gu;

/** The map's multi-word field names, lower case, sorted: derived from the shipped prompt texts. */
export const MAP_INTERNAL_FIELD_NAMES: readonly string[] = Object.freeze([...new Set(
  [...MAP_CONTRACT_NAMES.flatMap((name) => [MAP_DEFAULT_INSTRUCTIONS[name], MAP_ANSWER_FORMS[name]]), PATCH_REPLY_FORM_SENTENCE]
    .flatMap((text) => text.match(SNAKE_NAME) ?? [])
    .map((name) => name.toLowerCase())
)].sort());

/**
 * Engine 2 (INTERFACE §10.1, deviation 20): the v2 forms' keys and every material field a v2 packet names, beside engine
 * 1's names. Used ONLY under engine 2, so engine 1's skip keeps its behaviour exactly.
 */
const MAP_ENGINE_MATERIAL_FIELD_NAMES = Object.freeze(["question_line", "angle_label", "angle_focus", "points_so_far",
  "candidate_answers", "key_points", "framing_challenges", "question_language", "check_id", "raised_by", "angle_kind",
  "rests_on", "answer_id", "key_point_id", "item_id"]);
export const MAP_ENGINE_INTERNAL_FIELD_NAMES: readonly string[] = Object.freeze([...new Set([
  ...MAP_INTERNAL_FIELD_NAMES,
  ...[...MAP_ENGINE_CONTRACT_NAMES.flatMap((name) => [MAP_ENGINE_INSTRUCTIONS[name], MAP_ENGINE_ANSWER_FORMS[name]]),
    MAP_ENGINE_MATERIAL_FIELD_NAMES.join(" ")]
    .flatMap((text) => text.match(SNAKE_NAME) ?? [])
    .map((name) => name.toLowerCase())
])].sort());

/**
 * A name whose words, written apart ("angle focus", "key point id"), are still not prose: it names an id, or it is one
 * of the map's angle, question or machine fields. Any other name ("key points", "why it matters", "raised by",
 * "candidate answers") is ordinary prose when spaced, so only its underscore or joined form ("why_it_matters",
 * "whyItMatters") counts.
 */
const DISTINCTIVE_FIRST_WORDS: ReadonlySet<string> = new Set(["angle", "question", "machine"]);
const isDistinctive = (words: readonly string[]): boolean =>
  DISTINCTIVE_FIRST_WORDS.has(words[0]!) || words.some((word) => word === "id" || word === "ids");

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function fieldPattern(name: string): string {
  const words = name.split("_");
  // Joined (camelCase, any case) or underscored always; spaced or hyphenated only when distinctive. A trailing "s" is
  // optional, so "member_item_id" and "machine_rejection_path" are caught as well as the plural the prompt names.
  const separator = isDistinctive(words) ? "[_\\s-]*" : "_?";
  const last = words.length - 1;
  return words.map((word, index) => escape(index === last ? word.replace(/s$/u, "") : word)).join(separator) + "s?";
}

const BEFORE = "(?<![\\p{L}\\p{N}_])";
const AFTER = "(?![\\p{L}\\p{N}_])";
/** An empty name list names no field: a pattern that never matches (an empty alternation would match every text). */
const NO_FIELD = /(?!)/u;
const fieldRegex = (names: readonly string[]): RegExp => names.length === 0 ? NO_FIELD
  : new RegExp(`${BEFORE}(?:${names.map(fieldPattern).join("|")})${AFTER}`, "iu");
/**
 * One compiled pattern per name list, built once and keyed by the joined names (R3 final wave P3), so a fresh copy of a
 * list reuses its pattern and a list changed after a first read never reads a stale one. Engine 1's is built up front.
 */
const namesKey = (names: readonly string[]): string => names.join("\n");
const FIELD_PATTERNS = new Map<string, RegExp>([[namesKey(MAP_INTERNAL_FIELD_NAMES), fieldRegex(MAP_INTERNAL_FIELD_NAMES)]]);
function internalFieldPattern(names: readonly string[]): RegExp {
  const key = namesKey(names);
  const known = FIELD_PATTERNS.get(key);
  if (known !== undefined) return known;
  const built = fieldRegex(names);
  FIELD_PATTERNS.set(key, built);
  return built;
}

/** An item's opaque id exactly as mapAssignItemIds mints it (pt01.., ca01..: lower case, so "Ca12" or "PT04" is prose). */
const ITEM_ID = new RegExp(`${BEFORE}(?:pt|ca)\\d{2,}${AFTER}`, "u");

/** True when the text names one of the map's internal fields (engine 1's by default) or an item's opaque id. */
export function mapNamesInternalWord(text: string, names: readonly string[] = MAP_INTERNAL_FIELD_NAMES): boolean {
  const normal = text.normalize("NFKC");
  return internalFieldPattern(names).test(normal) || ITEM_ID.test(normal);
}
