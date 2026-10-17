import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { decryptContentForRun } from "@debateai/db";
import {
  LENGTH_GUIDANCE_START,
  STORY_WORD_TARGET_FIELDS,
  proseWordCount,
  type CharactersPerWord,
  type StoryWordTargetField
} from "@debateai/kernel";
import { PREVIEW_PROVIDER_REF_MODELS, decodeModelJson, structureRepairOriginalKey } from "@debateai/providers";
import {
  engineSettingsOf,
  engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues,
  resolveLengthGuidance,
  type EngineSettings,
  type LengthGuidance
} from "@debateai/register";
import { replyContentOf } from "./practice-lanes.js";
import { PracticeRefusal } from "./practice-settings.js";

/**
 * LENGTH GUIDANCE, THE STORY IN THE PRACTICE REPORT (spec 2026-10-15 §3.7; OVERVIEW §2 LG-D; engine redesign R1d).
 *
 * - `storyLengthByField`: per AI and per short field (plus the long version), the words each accepted storyteller reply
 *   wrote, counted as the guidance counts them (`proseWordCount`), beside the target it was given (null when the story
 *   was not told with targets, and always null for the long version: it has no target). Only engine 2's story (v4) is
 *   told with targets (R1d): a run admitted with the length row alone tells today's story v3, with none.
 * - `storyJsonBreaks`: per AI, its storyteller replies and those that were not readable JSON, by where the break came:
 *   after the long version began, before it, or unknown. The v4 form puts long last so a late break loses only it.
 *
 * Counts and codes only; never a reply's text. A patch try (recorded form PATCH: only the asked members) is not a whole
 * story nor a storyteller reply of its own, and is skipped in both tables.
 */

export type PracticeStoryField = StoryWordTargetField | "long";
export const PRACTICE_STORY_FIELDS: readonly PracticeStoryField[] = Object.freeze([...STORY_WORD_TARGET_FIELDS, "long"]);
export type PracticeStoryFieldSample = Readonly<{ field: PracticeStoryField; words: number; guided: number | null }>;
export type PracticeStoryLengthRow = Readonly<{
  model: string; field: PracticeStoryField; guidedWords: number | null; texts: number;
  actualWords: Readonly<{ median: number; max: number }>;
}>;
export type PracticeStoryJsonBreak = "AFTER_LONG_STARTED" | "BEFORE_LONG" | "POSITION_UNKNOWN";
export type PracticeStoryJsonBreakRow = Readonly<{
  model: string; replies: number; parseFailed: number; afterLongStarted: number; beforeLong: number; positionUnknown: number;
}>;
export type PracticeStoryLengthBlock = Readonly<{
  storyLengthByField: readonly PracticeStoryLengthRow[];
  storyJsonBreaks: readonly PracticeStoryJsonBreakRow[];
}>;
type StoryTargets = Readonly<{ story: Readonly<Record<StoryWordTargetField, number>>; charactersPerWord: CharactersPerWord }>;

/** A member of a decoded value, or undefined; never throws on a value of the wrong type. */
function member(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}
function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The words of one accepted storyteller reply, field by field; null when it is not a whole story (no short object). */
export function practiceStoryFieldSamples(content: string, targets: StoryTargets | null): readonly PracticeStoryFieldSample[] | null {
  const decoded = decodeModelJson(content);
  if (!decoded.ok) return null;
  const short = member(decoded.value, "short");
  if (typeof short !== "object" || short === null || Array.isArray(short)) return null;
  const charactersPerWord = targets?.charactersPerWord ?? LENGTH_GUIDANCE_START.charactersPerWord;
  const words = (value: unknown): number => proseWordCount(value ?? null, charactersPerWord);
  const sample = (field: StoryWordTargetField, value: unknown): PracticeStoryFieldSample =>
    Object.freeze({ field, words: words(value), guided: targets === null ? null : targets.story[field] });
  const samples: PracticeStoryFieldSample[] = [
    sample("headline", member(short, "headline")),
    sample("summary", member(short, "summary")),
    sample("confidence", member(short, "confidence")),
    ...list(member(short, "paths")).map((path) => sample("positionLine", member(path, "line"))),
    sample("change", member(member(short, "change"), "text")),
    ...list(member(member(decoded.value, "why"), "reasons")).map((reason) => sample("whyReason", member(reason, "text"))),
    Object.freeze({ field: "long" as const, words: words(member(decoded.value, "long")), guided: null })
  ];
  return Object.freeze(samples);
}

/** Per model and field, in PRACTICE_STORY_FIELDS order: how many texts, the lower median and the max. */
export function practiceStoryLengthRows(
  replies: readonly Readonly<{ model: string; samples: readonly PracticeStoryFieldSample[] }>[]
): readonly PracticeStoryLengthRow[] {
  const groups = new Map<string, { model: string; field: PracticeStoryField; guided: number | null; words: number[] }>();
  for (const reply of replies) {
    for (const entry of reply.samples) {
      const key = `${reply.model}\u0000${entry.field}`;
      const group = groups.get(key) ?? { model: reply.model, field: entry.field, guided: entry.guided, words: [] };
      groups.set(key, group);
      group.words.push(entry.words);
    }
  }
  return Object.freeze([...groups.values()]
    .sort((left, right) => left.model.localeCompare(right.model)
      || PRACTICE_STORY_FIELDS.indexOf(left.field) - PRACTICE_STORY_FIELDS.indexOf(right.field))
    .map((group) => {
      const sorted = [...group.words].sort((left, right) => left - right);
      return Object.freeze({
        model: group.model, field: group.field, guidedWords: group.guided, texts: sorted.length,
        actualWords: Object.freeze({ median: sorted[Math.floor((sorted.length - 1) / 2)]!, max: sorted.at(-1)! })
      });
    }));
}

/**
 * Where an unreadable storyteller reply broke: JSON.parse's own position (from the first "{"), against where the
 * `"long":` member began. "Unexpected end of JSON input" is a break at the very end. No object, no position in the
 * error, or a text that parses after all: unknown.
 */
export function practiceStoryJsonBreakOf(content: string): PracticeStoryJsonBreak {
  const start = content.indexOf("{");
  if (start < 0) return "POSITION_UNKNOWN";
  const body = content.slice(start);
  let message: string;
  try {
    JSON.parse(body);
    return "POSITION_UNKNOWN";
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const at = /at position (\d+)/u.exec(message);
  const position = at !== null ? Number(at[1]) : /Unexpected end of JSON input/u.test(message) ? body.length : null;
  if (position === null) return "POSITION_UNKNOWN";
  const longAt = body.search(/"long"\s*:/u);
  return longAt >= 0 && position > longAt ? "AFTER_LONG_STARTED" : "BEFORE_LONG";
}

/** Per model: every storyteller reply, and the unreadable ones by where they broke (`jsonBreak` null: readable). */
export function practiceStoryJsonBreakRows(
  replies: readonly Readonly<{ model: string; jsonBreak: PracticeStoryJsonBreak | null }>[]
): readonly PracticeStoryJsonBreakRow[] {
  const rows = new Map<string, { model: string; replies: number; parseFailed: number; afterLongStarted: number; beforeLong: number; positionUnknown: number }>();
  for (const reply of replies) {
    const row = rows.get(reply.model) ?? { model: reply.model, replies: 0, parseFailed: 0, afterLongStarted: 0, beforeLong: 0, positionUnknown: 0 };
    rows.set(reply.model, row);
    row.replies += 1;
    if (reply.jsonBreak === null) continue;
    row.parseFailed += 1;
    if (reply.jsonBreak === "AFTER_LONG_STARTED") row.afterLongStarted += 1;
    else if (reply.jsonBreak === "BEFORE_LONG") row.beforeLong += 1;
    else row.positionUnknown += 1;
  }
  return Object.freeze([...rows.values()].sort((left, right) => left.model.localeCompare(right.model)).map((row) => Object.freeze(row)));
}

/** report.md lines: counts and codes only. Nothing when there was no story call. */
export function practiceStoryLengthLines(block: PracticeStoryLengthBlock): readonly string[] {
  if (block.storyLengthByField.length === 0 && block.storyJsonBreaks.length === 0) return [];
  const lines = ["Story length per AI and field (the storyteller's accepted replies, words counted as the guidance counts them; "
    + "the long version has no target; information only):", "",
    "| model | field | guided | texts | median words | max words |", "|---|---|---|---|---|---|"];
  for (const row of block.storyLengthByField) {
    lines.push(`| ${row.model} | ${row.field} | ${row.guidedWords === null ? "-" : String(row.guidedWords)} | ${String(row.texts)} | `
      + `${String(row.actualWords.median)} | ${String(row.actualWords.max)} |`);
  }
  lines.push("", "Storyteller replies that were not readable JSON (information only):", "");
  for (const row of block.storyJsonBreaks) {
    lines.push(`- ${row.model}: ${String(row.replies)} storyteller replies, ${String(row.parseFailed)} not readable `
      + `(after the long version began ${String(row.afterLongStarted)}, before it ${String(row.beforeLong)}, `
      + `position unknown ${String(row.positionUnknown)})`);
  }
  lines.push("");
  return Object.freeze(lines);
}

/**
 * R1d: the story's targets from the run's own receipt. Only engine 2's story (v4) is told with targets, so the
 * receipt's `length` counts only beside its `engine`; with the length row alone the story is today's v3 and has none.
 */
export function practiceStoryTargetsOf(basis: Readonly<{ length?: LengthGuidance; engine?: EngineSettings }> | undefined): StoryTargets | null {
  if (basis === undefined || basis.engine === undefined || basis.length === undefined) return null;
  return Object.freeze({ story: basis.length.story, charactersPerWord: basis.length.charactersPerWord });
}

/** One storyteller ledger row as the tables read it, in ledger order, its reply already decrypted (pure input). */
export type PracticeStoryLengthLedgerRow = Readonly<{
  callSiteKey: string;
  /** The row's own model (a structure-repair row's is the repair model's, never counted). */
  model: string;
  outcome: string; parseStatus: string;
  /** The artifact's recorded form (`ledger.raw_artifact.reply_form`, migration 0120); null for an older row. */
  replyForm: string | null;
  content: string;
}>;

/**
 * The two tables from the storyteller's rows. A storyteller reply Haiku's structure repair rescued stands under
 * `REPAIR:STRUCTURE:STORY:STORYTELLER:<n>` while the original try stays FAILED (LG-A contract deviation 7): its words count
 * under the model of the call it repaired (the latest earlier plain-key row of that key, as LG-B's `wordsModel` does), and
 * it is never a storyteller reply of its own. A PATCH try (the short follow-up, recorded form PATCH) holds only the asked
 * members: it is neither a story nor a storyteller reply, so it counts in neither table (fix round 1).
 */
export function practiceStoryLengthBlockOf(rows: readonly PracticeStoryLengthLedgerRow[], targets: StoryTargets | null): PracticeStoryLengthBlock {
  const accepted: { model: string; samples: readonly PracticeStoryFieldSample[] }[] = [];
  const replies: { model: string; jsonBreak: PracticeStoryJsonBreak | null }[] = [];
  const callModels = new Map<string, string>();
  for (const row of rows) {
    if (row.replyForm === "PATCH") continue;
    const original = structureRepairOriginalKey(row.callSiteKey);
    const repair = original !== row.callSiteKey;
    if (!repair) callModels.set(original, row.model);
    // A repair row with no try of its key before it has no call to count for.
    const model = repair ? callModels.get(original) : row.model;
    if (model === undefined) continue;
    if (!repair) replies.push({ model, jsonBreak: row.parseStatus === "PARSE_FAILED" ? practiceStoryJsonBreakOf(row.content) : null });
    if (row.outcome === "OK" && row.parseStatus === "PARSED") {
      const samples = practiceStoryFieldSamples(row.content, targets);
      if (samples !== null) accepted.push({ model, samples });
    }
  }
  return Object.freeze({ storyLengthByField: practiceStoryLengthRows(accepted), storyJsonBreaks: practiceStoryJsonBreakRows(replies) });
}

/**
 * Debate mode: read before the throwaway database goes. The targets come from the run's own receipt
 * (`envelope_basis.length` beside `envelope_basis.engine`), never from the register; a run admitted without both has none.
 * Null when the run's row is absent: the block is left out, as the practice's other run readers read a missing run
 * (`readPracticeFrozenLength`, `readPracticeShapeFacts`), never thrown (fix round 1).
 */
export async function collectPracticeStoryLength(pool: Pool, runId: string): Promise<PracticeStoryLengthBlock | null> {
  const run = (await pool.query<{ envelope_basis: unknown }>("SELECT envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  if (run === undefined) return null;
  const targets = practiceStoryTargetsOf(parseCostEnvelopeBasis(run.envelope_basis));
  const entries = (await pool.query<{ call_site_key: string; actor_ref: string; outcome: string; raw_artifact_ref: string; parse_status: string;
    reply_form: string | null; raw_text: string; content_ciphertext: unknown }>(
    `SELECT e.call_site_key, e.actor_ref, e.outcome, e.raw_artifact_ref::text AS raw_artifact_ref, a.parse_status, a.reply_form,
            a.raw_text, a.content_ciphertext
       FROM ledger.ledger_entry e JOIN ledger.raw_artifact a ON a.raw_artifact_id = e.raw_artifact_ref
      WHERE e.run_id=$1 AND e.action_kind='MODEL_CALL'
        AND (e.call_site_key LIKE 'STORY:STORYTELLER:%' OR e.call_site_key LIKE 'REPAIR:STRUCTURE:STORY:STORYTELLER:%')
      ORDER BY e.sequence`, [runId])).rows;
  const rows: PracticeStoryLengthLedgerRow[] = [];
  for (const entry of entries) {
    // A PATCH try is skipped by the pure reading; its reply need not be decrypted.
    const stored = entry.reply_form === "PATCH" ? { rawText: "" }
      : await decryptContentForRun<{ rawText: string; parseErrorDetail: string | null }>(pool, runId, "ledger.raw_artifact",
        entry.raw_artifact_ref, (entry.content_ciphertext ?? null) as never, { rawText: entry.raw_text, parseErrorDetail: null });
    rows.push(Object.freeze({
      callSiteKey: entry.call_site_key, model: PREVIEW_PROVIDER_REF_MODELS[entry.actor_ref] ?? `unreviewed:${entry.actor_ref}`,
      outcome: entry.outcome, parseStatus: entry.parse_status, replyForm: entry.reply_form, content: replyContentOf(stored.rawText)
    }));
  }
  return practiceStoryLengthBlockOf(rows, targets);
}

/** One formats story job's story facts: the accepted reply's fields, how many replies, where the unreadable ones broke. */
export type PracticeStorySample = Readonly<{
  fields: readonly PracticeStoryFieldSample[] | null;
  replies: number;
  breaks: readonly PracticeStoryJsonBreak[];
}>;

/**
 * Formats: from the real model's own artifacts of a STORYTELLER job (the stand-in records none). A PATCH try (the short
 * follow-up, its recorded form PATCH: only the asked members) is skipped, as the debate tables skip it (PF-D8.12).
 */
export function practiceStorySampleOf(artifacts: readonly Readonly<{ rawText: string; parseStatus: string; replyForm?: string | null }>[],
  guidance: LengthGuidance | null): PracticeStorySample {
  const targets: StoryTargets | null = guidance === null ? null : { story: guidance.story, charactersPerWord: guidance.charactersPerWord };
  const tries = artifacts.filter((artifact) => artifact.replyForm !== "PATCH");
  const accepted = [...tries].reverse().find((artifact) => artifact.parseStatus === "PARSED");
  return Object.freeze({
    fields: accepted === undefined ? null : practiceStoryFieldSamples(replyContentOf(accepted.rawText), targets),
    replies: tries.length,
    breaks: Object.freeze(tries.filter((artifact) => artifact.parseStatus === "PARSE_FAILED")
      .map((artifact) => practiceStoryJsonBreakOf(replyContentOf(artifact.rawText))))
  });
}

/** Formats: the report's story block from the story jobs' samples; null when the run had no story job. */
export function practiceStoryLengthFromSamples(
  samples: readonly Readonly<{ model: string; story?: PracticeStorySample | undefined }>[]
): PracticeStoryLengthBlock | null {
  const story = samples.flatMap((sample) => sample.story === undefined ? [] : [{ model: sample.model, story: sample.story }]);
  if (story.length === 0) return null;
  return Object.freeze({
    storyLengthByField: practiceStoryLengthRows(story.flatMap((entry) =>
      entry.story.fields === null ? [] : [{ model: entry.model, samples: entry.story.fields }])),
    storyJsonBreaks: practiceStoryJsonBreakRows(story.flatMap((entry) => [
      ...entry.story.breaks.map((jsonBreak) => ({ model: entry.model, jsonBreak })),
      ...Array.from({ length: entry.story.replies - entry.story.breaks.length }, () => ({ model: entry.model, jsonBreak: null }))
    ]))
  });
}

/** Formats `--story-length` (R1d): engine 2's story needs both the length targets and the engine's own settings. */
export type PracticeStoryV4Settings = Readonly<{ lengthGuidance: LengthGuidance; engine: EngineSettings }>;

/** The owners' start values for the premium plan at Standard length. */
export function practiceStoryLengthGuidance(): LengthGuidance {
  return resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
}

/** Both start values a formats story job is told with: the length row's and engine 2's (two makers, no map opening). */
export function practiceStoryV4Settings(): PracticeStoryV4Settings {
  return Object.freeze({
    lengthGuidance: practiceStoryLengthGuidance(),
    engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening: false })
  });
}

/** `--story-length` is formats-only; checked before anything starts. */
export function practiceStoryLengthFromArgs(mode: string, switches: ReadonlySet<string>): PracticeStoryV4Settings | null {
  if (!switches.has("--story-length")) return null;
  if (mode !== "formats") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--story-length (formats mode only)");
  return practiceStoryV4Settings();
}
