import { createHash } from "node:crypto";
import {
  AnswerDigSchema, AnswerPathRewritesSchema, PathRewriteSchema, PathRewritesSchema, StoryBodySchema, WEB_CONTRACT_LIMITS,
  type AnswerDig, type AnswerPathRewrites, type PathRewrite, type PathRewrites
} from "@debateai/contract";
import type { DigPickAuthor, DigPickKind, PathRewriteEntry } from "@debateai/db";

/**
 * SERVE: THE PATH REWRITES TO THE ANSWER (dig-model revision 2026-10-30, task W4-5; owner answers Q-D2 to Q-D13). Plain
 * words: what 0134 keeps of each dig's rewrite (identity.path_rewrite, the codes in clear and the text sealed under the
 * DIG's run key, opened by the repository in ./index.ts) becomes
 *  - on a debate's answer, `path_rewrites`: each path a dig rewrote, its rewrites newest last (in the order the digs
 *    finished), its current text (the newest READY or READY_WITH_RESERVATION; a turn still WRITING or one that FAILED
 *    leaves the text as it was, with its state), `changed_below` when a dig further down changed a path inside this path's
 *    dig (Q-D5: marked, never rewritten), and "paths changed since the answer was written" (Q-D11);
 *  - on a dig's own answer, `dig`: what it dug (its parent, the path, the places, its level, its picks and who wrote each)
 *    and its rewrite of that path, whose `dig_paths` are the dig's own paths with the lines and fates the rewrite call
 *    wrote (Q-D2). Its points and its answer text are served as usual (Q-D13): nothing here touches them.
 *
 * Worked out by code, never by an AI (Q-D3): the rewritten path's fate is 0134's clear `fate_after` column (a sealed text
 * naming another fate is not served); `changed` compares the new text with the one the rewrite was written on (the newest
 * checked rewrite before it, else the debate's story line); the verdict "Your point of view" is shown only when a pick
 * carries the person's own words (Q-D4), its outcome and scope as 0134's codes (the page turns them into the approved
 * lines of draft 5.3), its own words quoted from the picks; no trust word is served: each point keeps its own review and
 * the server's checked flag (W3-3), so the page's words follow the same rules after a rewrite, "Sure" included.
 *
 * Rules this file keeps:
 *  - never a number of the engine: no lineage, round count, artifact, failure code or score reaches the answer;
 *  - an answer whose debate no dig touched serves exactly as before: no `path_rewrites`, no `dig`;
 *  - a stored value that does not make a valid shape is left out (that path, that dig), never failing the answer, as
 *    A21's projection does.
 * Pure: the repository reads and opens the rows; this file only shapes them.
 */

/* ----------------------------------------------------------------- what the rewrite seals (W3-5 writes it) */

/** identity.path_rewrite's sealed value (apps/runner/src/path-rewrite.ts `PathRewriteContent`), refs already ids. */
export type StoredPathRewriteText = Readonly<{
  text: Readonly<{ line: string; summary: string; fate: string }>;
  what_changed: readonly string[];
  view_reason: string | null;
  dig_paths: readonly Readonly<{ position_ref: string; line: string; fate: string }>[];
}>;

/* ----------------------------------------------------------------- the input */

/** One turn on a path as 0134 lists it, its sealed text opened (null: still writing, FAILED, or not opened). */
export type RewriteTurn = Readonly<{
  entry: PathRewriteEntry;
  opened: unknown;
  /** The person's own words among the dig's picks, in their order (their own view, their edit of a suggestion); null: unread. */
  ownWords: readonly string[] | null;
}>;

/** A dig's picks as 0135 keeps them, each text opened under the dig's key. */
export type StoredDigPick = Readonly<{ kind: DigPickKind; place: string; author: DigPickAuthor; text: string }>;

/**
 * The newest report written for the investigation (0133's closings): its version and when its report was stored. W5-1:
 * `covered` is the newest rewrite that version read (0136's covered_rewrite_recorded_at): null when it read none;
 * absent when unknown, and then the written time stands in.
 */
export type WrittenReport = Readonly<{ version: number; writtenAt: string; covered?: Readonly<{ recordedAt: string }> | null }>;

/* ----------------------------------------------------------------- reading the stored values */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const lower = (id: string): string => id.toLowerCase();
const isFinishedState = (state: string): state is "READY" | "READY_WITH_RESERVATION" =>
  state === "READY" || state === "READY_WITH_RESERVATION";

/** A stored time as the contract's ISO form (0134's jsonb gives `+00:00` and microseconds), or null. */
function isoOf(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/** The same words, whatever the spacing. */
const sameWords = (left: string, right: string): boolean =>
  left.trim().replace(/\s+/gu, " ") === right.trim().replace(/\s+/gu, " ");

function storedText(value: unknown): StoredPathRewriteText | null {
  if (!isRecord(value) || !isRecord(value.text) || !Array.isArray(value.what_changed) || !Array.isArray(value.dig_paths)) return null;
  const { line, summary, fate } = value.text;
  if (typeof line !== "string" || typeof summary !== "string" || typeof fate !== "string") return null;
  if (!value.what_changed.every((sentence): sentence is string => typeof sentence === "string")) return null;
  if (!(value.view_reason === null || typeof value.view_reason === "string")) return null;
  const digPaths = value.dig_paths.flatMap((path: unknown) => isRecord(path) && typeof path.position_ref === "string"
    && typeof path.line === "string" && typeof path.fate === "string"
    ? [{ position_ref: path.position_ref, line: path.line, fate: path.fate }] : [null]);
  if (digPaths.some((path) => path === null)) return null;
  return { text: { line, summary, fate }, what_changed: value.what_changed, view_reason: value.view_reason,
    dig_paths: digPaths as StoredPathRewriteText["dig_paths"] };
}

/**
 * The rewrite's id while its turn is still writing: the runner's own, one per dig (apps/runner/src/path-rewrite.ts
 * `pathRewriteIdOf`), so a rewrite keeps one id from WRITING to its stored row. Pinned equal by the unit test.
 */
export function pathRewriteIdOfDig(digRunId: string): string {
  const hex = createHash("sha256").update(`debateai.path-rewrite.v1:${lower(digRunId)}`, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The person's own words among a dig's picks, in order: their own view and their edit of a suggestion (Q-D4). */
export function ownWordsOf(picks: readonly Pick<StoredDigPick, "author" | "text">[]): readonly string[] {
  return picks.filter((pick) => pick.author !== "AI_SUGGESTION").map((pick) => pick.text);
}

/**
 * Each path of a story by the id the map and 0134 name it with: the story path's position_ref, `<ref>#2` for a position
 * argued twice (apps/api/src/dig-admission.ts `digPathIndexOf`, the runner's `storyPathOf`), to its line. None when the
 * stored body is not a story's.
 */
export function storyPathLinesOf(body: unknown): ReadonlyMap<string, string> {
  const parsed = StoryBodySchema.nullable().safeParse(body);
  const lines = new Map<string, string>();
  if (!parsed.success || parsed.data === null) return lines;
  const seen = new Map<string, number>();
  for (const path of parsed.data.short.paths) {
    const times = (seen.get(path.position_ref) ?? 0) + 1;
    seen.set(path.position_ref, times);
    lines.set(times === 1 ? path.position_ref : `${path.position_ref}#${String(times)}`, path.line);
  }
  return lines;
}

/* ----------------------------------------------------------------- the investigation's tree */

type Member = Readonly<{ run_id: string; parent_run_id: string | null }>;

/** Each debate's dig level in its investigation (0133's members): the first debate 0, a dig its parent's level + 1. */
export function digLevelsOf(members: readonly Member[]): ReadonlyMap<string, number> {
  const parentOf = new Map(members.map((member) => [lower(member.run_id), member.parent_run_id === null ? null : lower(member.parent_run_id)]));
  const levels = new Map<string, number>();
  for (const runId of parentOf.keys()) {
    let level = 0;
    let at: string | null | undefined = parentOf.get(runId);
    // A level past the deepest one, or a loop, is no level: the tree is read, never trusted to end.
    while (at !== null && at !== undefined && level <= WEB_CONTRACT_LIMITS.investigationDigsMax) {
      level += 1;
      at = parentOf.get(at);
    }
    if (at === null) levels.set(runId, level);
  }
  return levels;
}

/** Every dig below each of `digRunIds` in the investigation (its digs, theirs, and so on), each once. */
export function digsBelowOf(members: readonly Member[], digRunIds: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const children = new Map<string, string[]>();
  for (const member of members) {
    if (member.parent_run_id === null) continue;
    const parent = lower(member.parent_run_id);
    children.set(parent, [...(children.get(parent) ?? []), lower(member.run_id)]);
  }
  const below = new Map<string, readonly string[]>();
  for (const digRunId of digRunIds.map(lower)) {
    const found = new Set<string>();
    const queue = [...(children.get(digRunId) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (found.has(next) || next === digRunId) continue;
      found.add(next);
      queue.push(...(children.get(next) ?? []));
    }
    below.set(digRunId, [...found]);
  }
  return below;
}

/**
 * The paths of a debate a dig further down changed (Q-D5): a path is marked when a dig below the dig that took a turn on
 * it has a finished rewrite (READY or READY_WITH_RESERVATION) of its own. `finished` holds those digs' run ids.
 */
export function changedBelowPathsOf(turns: readonly Pick<PathRewriteEntry, "run_id" | "position_ref">[],
  below: ReadonlyMap<string, readonly string[]>, finished: ReadonlySet<string>): ReadonlySet<string> {
  const marked = new Set<string>();
  for (const turn of turns) {
    if ((below.get(lower(turn.run_id)) ?? []).some((runId) => finished.has(lower(runId)))) marked.add(turn.position_ref);
  }
  return marked;
}

/** The investigation's newest written report (0133: a closing whose report the runner stored), or null before any. */
export function latestWrittenReportOf(closings: readonly Readonly<{ report_version: number; report_written_at: string | null }>[],
  covered?: ReadonlyMap<number, string | null>): WrittenReport | null {
  let latest: WrittenReport | null = null;
  for (const closing of closings) {
    const writtenAt = isoOf(closing.report_written_at);
    if (writtenAt === null || (latest !== null && closing.report_version <= latest.version)) continue;
    const known = covered?.has(closing.report_version) === true;
    const recordedAt = known ? isoOf(covered!.get(closing.report_version)) : null;
    latest = { version: closing.report_version, writtenAt, ...(known ? { covered: recordedAt === null ? null : { recordedAt } } : {}) };
  }
  return latest;
}

/* ----------------------------------------------------------------- one path's rewrites */

type BaseText = Readonly<{ line: string; summary: string | null }>;

/** One turn as the contract's rewrite, or null when its stored value makes none. `base` undefined: the earlier text is unknown. */
function rewriteOf(turn: RewriteTurn, level: number | null, base: BaseText | undefined): PathRewrite | null {
  const entry = turn.entry;
  const digFinishedAt = isoOf(entry.taken_at);
  const rewriteId = entry.rewrite_id ?? pathRewriteIdOfDig(entry.run_id);
  if (level === null || digFinishedAt === null) return null;
  const common = { rewrite_id: rewriteId, dig_run_id: entry.run_id, dig_level: level, dig_finished_at: digFinishedAt };
  let shaped: unknown;
  if (entry.state === "WRITING") {
    shaped = { ...common, state: "WRITING" };
  } else if (entry.state === "FAILED") {
    shaped = { ...common, state: "FAILED", failed_at: isoOf(entry.recorded_at) };
  } else {
    const stored = storedText(turn.opened);
    // The fate is code's (Q-D3): 0134's clear column; a sealed text that names another one is not served.
    if (stored === null || entry.fate_after === null || entry.fate_before === null || stored.text.fate !== entry.fate_after) return null;
    const changed = entry.fate_after !== entry.fate_before || base === undefined || !sameWords(base.line, stored.text.line)
      || (base.summary !== null && !sameWords(base.summary, stored.text.summary));
    const ownWords = turn.ownWords ?? [];
    const view = entry.verdict_outcome !== null && entry.verdict_scope !== null && stored.view_reason !== null && ownWords.length > 0
      ? { outcome: entry.verdict_outcome, scope: entry.verdict_scope, reason: stored.view_reason, own_words: [...ownWords] } : null;
    shaped = {
      ...common, state: entry.state, rewritten_at: isoOf(entry.recorded_at), changed,
      text: { line: stored.text.line, summary: stored.text.summary, fate: entry.fate_after },
      what_changed: [...stored.what_changed], fate_before: entry.fate_before, view,
      dig_paths: stored.dig_paths.map((path) => ({ position_ref: path.position_ref, line: path.line, fate: path.fate }))
    };
  }
  const parsed = PathRewriteSchema.safeParse(shaped);
  return parsed.success ? parsed.data : null;
}

/**
 * One path's rewrites in the order their digs finished (0134's turns, by path_seq), each its turn's (null where the
 * stored value makes no rewrite). `storyLine` is the debate's story line for the path: the text the first rewrite was
 * written on.
 */
export function pathHistoryOf(input: Readonly<{
  turns: readonly RewriteTurn[];
  levelOf: (digRunId: string) => number | null;
  storyLine: string | null;
}>): readonly Readonly<{ turn: RewriteTurn; rewrite: PathRewrite | null }>[] {
  const texts = new Map<string, BaseText>();
  return [...input.turns].sort((left, right) => left.entry.path_seq - right.entry.path_seq).map((turn) => {
    const entry = turn.entry;
    const base: BaseText | undefined = entry.based_on_rewrite_id === null
      ? (input.storyLine === null ? undefined : { line: input.storyLine, summary: null })
      : texts.get(lower(entry.based_on_rewrite_id));
    const rewrite = rewriteOf(turn, input.levelOf(entry.run_id), base);
    if (rewrite !== null && isFinishedState(rewrite.state) && "text" in rewrite) {
      texts.set(lower(rewrite.rewrite_id), { line: rewrite.text.line, summary: rewrite.text.summary });
    }
    return { turn, rewrite };
  });
}

/* ----------------------------------------------------------------- the answer's rewrites */

/**
 * A debate's `path_rewrites`, or null when no dig took a turn on any of its paths (the answer then serves as before).
 * `turns` are 0134's turns on the debate's paths in its order; `storyLines` the debate's story lines by path id;
 * `changedBelow` the paths a dig further down changed; `report` the investigation's newest written report.
 * "Paths changed since the answer was written": every path with a finished rewrite (a dig always follows the answer it
 * digs), or, once a report is written, every path with a finished rewrite stored after it.
 */
export function servePathRewrites(input: Readonly<{
  turns: readonly RewriteTurn[];
  levelOf: (digRunId: string) => number | null;
  storyLines: ReadonlyMap<string, string>;
  changedBelow: ReadonlySet<string>;
  report: WrittenReport | null;
}>): AnswerPathRewrites | null {
  const byPath = new Map<string, RewriteTurn[]>();
  for (const turn of input.turns) byPath.set(turn.entry.position_ref, [...(byPath.get(turn.entry.position_ref) ?? []), turn]);
  const paths: PathRewrites[] = [];
  for (const [positionRef, turns] of byPath) {
    if (paths.length >= WEB_CONTRACT_LIMITS.pathsMax) break;
    const history = pathHistoryOf({ turns, levelOf: input.levelOf, storyLine: input.storyLines.get(positionRef) ?? null });
    // One rewrite that makes no shape leaves the whole path out: its history would not follow on.
    if (history.some((step) => step.rewrite === null)) continue;
    const rewrites = history.map((step) => step.rewrite!);
    const newest = rewrites.filter((rewrite) => isFinishedState(rewrite.state)).at(-1);
    const parsed = PathRewritesSchema.safeParse({
      position_ref: positionRef,
      current: newest !== undefined && "text" in newest ? newest.text : null,
      history: rewrites,
      ...(input.changedBelow.has(positionRef) ? { changed_below: true } : {})
    });
    if (parsed.success) paths.push(parsed.data);
  }
  if (paths.length === 0) return null;
  // W5-1: a report counts the rewrites it covered (the newest one it read, 0136), not those stored before it was written:
  // 0 right after a report, 1 after the next rewrite. A report that read none counts every rewrite; unknown: its time.
  const report = input.report;
  const since = report === null ? null
    : report.covered === undefined ? Date.parse(report.writtenAt)
      : report.covered === null ? Number.NEGATIVE_INFINITY : Date.parse(report.covered.recordedAt);
  const count = paths.filter((path) => path.history.some((rewrite) => "rewritten_at" in rewrite
    && (since === null || Date.parse(rewrite.rewritten_at) > since))).length;
  const parsed = AnswerPathRewritesSchema.safeParse({
    paths, changed_since: { count, since_report_version: input.report?.version ?? null }
  });
  return parsed.success ? parsed.data : null;
}

/* ----------------------------------------------------------------- a dig's own answer */

/**
 * A dig's `dig`: its parent, the path its picks are on (null: they hang under the main question, which no rewrite
 * changes), the places it was dug at, its level, its picks with who wrote each, and its rewrite as the parent's path
 * history serves it (null before its turn). Null when it is no dig of the new model (no picks kept) or makes no shape.
 */
export function serveDig(input: Readonly<{
  parentRunId: string;
  positionRef: string | null;
  places: readonly string[];
  level: number | null;
  picks: readonly StoredDigPick[];
  rewrite: PathRewrite | null;
}>): AnswerDig | null {
  if (input.level === null) return null;
  const parsed = AnswerDigSchema.safeParse({
    parent_run_id: input.parentRunId,
    position_ref: input.positionRef,
    places: [...input.places],
    level: input.level,
    picks: input.picks.map((pick) => ({ kind: pick.kind, place: pick.place, text: pick.text, by: pick.author })),
    rewrite: input.rewrite
  });
  return parsed.success ? parsed.data : null;
}
