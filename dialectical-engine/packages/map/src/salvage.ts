import type { MapReplySalvageRepair } from "@debateai/providers";
import type { MapChooseReply } from "./replies.js";
import { MAP_LEANS, MAP_LIMITS } from "./types.js";

/**
 * The map's code salvage (ruling MAP-SALVAGE, 2026-10-14; the owners' slip recovery order: salvage in code, then the
 * smallest follow-up, then the full re-ask). Plain words: a few slips are harmless and code can fix them without asking
 * the model again: an internal text a little too long, a point with no lean, a choose answer that names one key point
 * twice. Each fix is named (`MapReplySalvageRepair`) so it is counted as information, never as a slip, and the fixed reply
 * still passes the step's full schema and content check, or it is refused exactly as before.
 *
 * What is NEVER salvaged: any text that can reach a reader of the debate page or the story. A point's claim (list,
 * snowball or gap) can stand as a key point unmerged (the code merge, an item the merger left out, the snowball's one
 * point per key point, a new gap point), and a key point's claim is shown under "also raised"; a candidate answer can
 * stand as a chosen answer (the choose fallback, a filled answer); merged claims and answers and chosen statements are
 * shown as they are. Those keep their strict limits, and a slip there goes to the follow-up.
 *
 * Paths: no salvage moves a member, so every refusal a salvaged reply still earns names the member at the same path as
 * in the reply the model wrote (the patch follow-up merges at those paths). The id drop is made only after the schema,
 * and only on an answer it leaves with no refused id.
 */
export type MapSalvaged<V> = Readonly<{ value: V; repairs: readonly MapReplySalvageRepair[] }>;

/** One step's salvage: `decoded` runs before the schema, on the decoded JSON; `parsed` after it, before the content check. */
export type MapReplySalvage<T> = Readonly<{
  decoded?: (value: unknown) => MapSalvaged<unknown>;
  parsed?: (value: T) => MapSalvaged<T>;
}>;

/** The salvage's own bounds (a policy number is never a bare exported constant). */
const MAP_SALVAGE_LIMITS = Object.freeze({
  /** A trim keeps at least this share of the field's limit, or the text is not salvaged (one long word, no spaces). */
  trimKeepMinShare: 0.5
});

/** Where a word may end in a text written without spaces: after this punctuation (Chinese, Japanese). */
const CLAUSE_END = /[、。，；：！？]/u;
const SPACE = /\s/u;
/** Left dangling at the end of a cut: separators and opening marks, never a word's last letter. */
const DANGLING_END = /[\s,;:\-–—(\[{„“"«‚'/]+$/u;

/**
 * `text` trimmed to at most `max` characters, cut at its last word boundary (a space, or after Chinese or Japanese
 * clause punctuation), with the separators left dangling at the end removed: never mid-word, never an ellipsis. Null
 * when the cut would keep less than half of `max` (one long word, a text with no boundary): that text is not salvaged.
 */
export function mapTrimAtWord(text: string, max: number): string | null {
  const whole = text.trim();
  if (whole.length <= max) return whole;
  for (let end = max; end > 0; end -= 1) {
    if (!SPACE.test(whole[end]!) && !CLAUSE_END.test(whole[end - 1]!)) continue;
    const kept = whole.slice(0, end).replace(DANGLING_END, "");
    return kept.length >= Math.ceil(max * MAP_SALVAGE_LIMITS.trimKeepMinShare) ? kept : null;
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Records the repairs of one salvage pass, each once, in the fixed order of `MapReplySalvageRepair`. */
class MapSalvageLog {
  readonly #made = new Set<MapReplySalvageRepair>();
  note(repair: MapReplySalvageRepair): void { this.#made.add(repair); }
  get repairs(): readonly MapReplySalvageRepair[] {
    return Object.freeze((["MAP_TEXT_TRIMMED", "MAP_LEANS_DEFAULTED", "MAP_IDS_DROPPED"] as const).filter((repair) => this.#made.has(repair)));
  }
}

/** The text at `record[key]` trimmed to `max` when it is a string over it and the trim succeeds. */
function trimMember(record: Record<string, unknown>, key: string, max: number, log: MapSalvageLog): Record<string, unknown> {
  const text = record[key];
  if (typeof text !== "string" || text.trim().length <= max) return record;
  const kept = mapTrimAtWord(text, max);
  if (kept === null) return record;
  log.note("MAP_TEXT_TRIMMED");
  return { ...record, [key]: kept };
}

/** A list member of the reply, each entry passed through `fix` (entries that are not objects stay as written). */
function eachRecord(record: Record<string, unknown>, key: string, fix: (entry: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  const list = record[key];
  return Array.isArray(list) ? { ...record, [key]: list.map((entry) => (isRecord(entry) ? fix(entry) : entry)) } : record;
}

/** A point: its why_it_matters trimmed (internal: only the merge reads it), its lean read as "context" when unusable. */
function salvagePoint(point: Record<string, unknown>, log: MapSalvageLog): Record<string, unknown> {
  const trimmed = trimMember(point, "why_it_matters", MAP_LIMITS.whyMaxChars, log);
  if ((MAP_LEANS as readonly unknown[]).includes(trimmed.leans)) return trimmed;
  log.note("MAP_LEANS_DEFAULTED");
  return { ...trimmed, leans: "context" };
}

function decodedSalvage(fix: (record: Record<string, unknown>, log: MapSalvageLog) => Record<string, unknown>): (value: unknown) => MapSalvaged<unknown> {
  return (value) => {
    if (!isRecord(value)) return Object.freeze({ value, repairs: Object.freeze([]) });
    const log = new MapSalvageLog();
    const fixed = fix(value, log);
    return Object.freeze({ value: log.repairs.length === 0 ? value : fixed, repairs: log.repairs });
  };
}

/** Angles: each angle's label and focus are read only by the list prompts, never shown. */
export const mapAnglesSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => eachRecord(reply, "angles", (angle) =>
    trimMember(trimMember(angle, "label", MAP_LIMITS.angleLabelMaxChars, log), "focus", MAP_LIMITS.angleFocusMaxChars, log)))
});

/** Lists and snowball lists: each point's why_it_matters and lean. Claims and candidate answers stay strict. */
export const mapListSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => eachRecord(reply, "points", (point) => salvagePoint(point, log)))
});

/** Gap rounds: each new point as in a list, and the framing challenges (kept in the map's result only, never shown). */
export const mapGapSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => {
    const points = eachRecord(reply, "new_points", (point) => salvagePoint(point, log));
    const challenges = points.framing_challenges;
    if (!Array.isArray(challenges)) return points;
    return { ...points, framing_challenges: challenges.map((challenge) => {
      if (typeof challenge !== "string" || challenge.trim().length <= MAP_LIMITS.claimMaxChars) return challenge;
      const kept = mapTrimAtWord(challenge, MAP_LIMITS.claimMaxChars);
      if (kept === null) return challenge;
      log.note("MAP_TEXT_TRIMMED");
      return kept;
    }) };
  })
});

/**
 * Choose: in each answer, the key point ids the run does not hold (`keyPointIds`; null when not known, as in the practice
 * tool's format re-check), an id repeated within one list (the first is kept), and an id named on both sides (dropped
 * from both: it cannot count for and against one answer) are dropped. An answer that named points and would be left with
 * none is left as written, so the check refuses it where it did and the follow-up asks for it.
 */
export function mapChooseSalvage(keyPointIds: ReadonlySet<string> | null): MapReplySalvage<MapChooseReply> {
  return Object.freeze({
    parsed: (value: MapChooseReply): MapSalvaged<MapChooseReply> => {
      const log = new MapSalvageLog();
      const answers = value.answers.map((answer) => {
        const bothSides = new Set(answer.for.filter((id) => answer.against.includes(id)));
        const keep = (ids: readonly string[]) => ids.filter((id, at) => ids.indexOf(id) === at && !bothSides.has(id)
          && (keyPointIds === null || keyPointIds.has(id)));
        const kept = { for: keep(answer.for), against: keep(answer.against) };
        const dropped = kept.for.length !== answer.for.length || kept.against.length !== answer.against.length;
        if (!dropped || kept.for.length + kept.against.length === 0) return answer;
        log.note("MAP_IDS_DROPPED");
        return { ...answer, ...kept };
      });
      return Object.freeze({ value: log.repairs.length === 0 ? value : { ...value, answers }, repairs: log.repairs });
    }
  });
}
