import { MAP_REPLY_SALVAGE_REPAIRS, type MapReplySalvageRepair } from "@debateai/providers";
import type { MapChooseReply, MapChooseReplyV2 } from "./replies.js";
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

/**
 * Records the repairs of one salvage pass, each once. `repairs` reads them in the fixed order of the providers' list
 * (`MAP_REPLY_SALVAGE_REPAIRS`), so a kind added to that list is reported without a second list here.
 */
export class MapSalvageLog {
  readonly #made = new Set<MapReplySalvageRepair>();
  note(repair: MapReplySalvageRepair): void { this.#made.add(repair); }
  get repairs(): readonly MapReplySalvageRepair[] {
    return Object.freeze(MAP_REPLY_SALVAGE_REPAIRS.filter((repair) => this.#made.has(repair)));
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

/** A point's lean read as "context" when unusable (kept with the length row: it is not about length). */
function defaultLean(point: Record<string, unknown>, log: MapSalvageLog): Record<string, unknown> {
  if ((MAP_LEANS as readonly unknown[]).includes(point.leans)) return point;
  log.note("MAP_LEANS_DEFAULTED");
  return { ...point, leans: "context" };
}

/** A point: its why_it_matters trimmed (internal: only the merge reads it), its lean read as "context" when unusable. */
function salvagePoint(point: Record<string, unknown>, log: MapSalvageLog): Record<string, unknown> {
  return defaultLean(trimMember(point, "why_it_matters", MAP_LIMITS.whyMaxChars, log), log);
}

function decodedSalvage(fix: (record: Record<string, unknown>, log: MapSalvageLog) => Record<string, unknown>): (value: unknown) => MapSalvaged<unknown> {
  return (value) => {
    if (!isRecord(value)) return Object.freeze({ value, repairs: Object.freeze([]) });
    const log = new MapSalvageLog();
    const fixed = fix(value, log);
    return Object.freeze({ value: log.repairs.length === 0 ? value : fixed, repairs: log.repairs });
  };
}

/** LG-A: the keys whose string values are ids the reply defines, and the keys whose values (a string or a list) name ids. */
const MAP_ID_DEFINING_KEYS: ReadonlySet<string> = new Set(["angle_id", "key_point_id", "answer_id"]);
const MAP_ID_NAMING_KEYS: ReadonlySet<string> = new Set(["member_item_ids", "for", "against", "strongest_rival"]);
/** Ruling W2: the answer check's own naming keys (engine 2 only); every other salvage keeps the set above, as at BASE. */
const MAP_CHECK_ID_NAMING_KEYS: ReadonlySet<string> = new Set([...MAP_ID_NAMING_KEYS, "check_id"]);

/** Drops leading and trailing "-" in one pass from each end (CodeQL js/polynomial-redos: an edge-anchored global "-"
 *  run regex is quadratic on a long interior run). The folded id is ASCII, so code units are characters. */
function trimEdgeHyphens(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) === 45) start += 1;
  while (end > start && text.charCodeAt(end - 1) === 45) end -= 1;
  return text.slice(start, end);
}

/**
 * An id as the map's schema writes ids (`mapId` in replies.ts: `^[a-z0-9][a-z0-9-]{0,23}$`), pre-flight PF-A31 (ruling
 * R6): compatibility-decomposed (NFKD), combining marks dropped (ț → t, ă → a), lower-cased, every run of other
 * characters (an underscore, a space, a dot, ß, …) one "-", leading and trailing "-" trimmed (an index loop, never
 * a regex on the uncut id), then cut to `MAP_LIMITS.idMaxChars` (24). A "-" left last by the cut is kept: the id
 * pattern admits it, so a non-empty result always passes it. An id with nothing left (only signs, like "???") is kept
 * as written, so the schema refuses it as before and the follow-up asks for it.
 */
function normalisedMapId(id: string): string {
  const folded = id.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9-]+/gu, "-");
  const normalised = trimEdgeHyphens(folded).slice(0, MAP_LIMITS.idMaxChars);
  return normalised === "" ? id : normalised;
}

/**
 * LG-A (structured-outputs-findings §3, "Id in the wrong shape": Qwen's `specific-CEE-comparatie`; ids over 24
 * characters; engine §5.2 rule 4): MAP_IDS_NORMALISED. Every id the reply defines and every id it names is normalised
 * (`normalisedMapId`), the same way, so every reference still names its id. Made only when it changes something and no
 * two defined ids become one (the collision guard: `KP-1` beside `kp-1`, or `kp_1` beside `kp-1`, leaves the reply as
 * written); the schema then checks every id's shape as before.
 */
function normaliseMapIds(reply: Record<string, unknown>, log: MapSalvageLog,
  namingKeys: ReadonlySet<string> = MAP_ID_NAMING_KEYS): Record<string, unknown> {
  const defined: string[] = [];
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (MAP_ID_DEFINING_KEYS.has(key) && typeof value === "string") defined.push(value);
      collect(value);
    }
  };
  collect(reply);
  if (new Set(defined.map(normalisedMapId)).size !== new Set(defined).size) return reply;
  let changed = false;
  const rewrite = (node: unknown, key: string | null): unknown => {
    if (Array.isArray(node)) return node.map((entry) => rewrite(entry, key !== null && namingKeys.has(key) ? key : null));
    if (isRecord(node)) return Object.fromEntries(Object.entries(node).map(([inner, value]) => [inner, rewrite(value, inner)]));
    if (typeof node === "string" && key !== null && (MAP_ID_DEFINING_KEYS.has(key) || namingKeys.has(key))) {
      const next = normalisedMapId(node);
      if (next !== node) changed = true;
      return next;
    }
    return node;
  };
  const out = rewrite(reply, null) as Record<string, unknown>;
  if (!changed) return reply;
  log.note("MAP_IDS_NORMALISED");
  return out;
}

/** Angles: each angle's label and focus are read only by the list prompts, never shown; LG-A: its id normalised. */
export const mapAnglesSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => normaliseMapIds(eachRecord(reply, "angles", (angle) =>
    trimMember(trimMember(angle, "label", MAP_LIMITS.angleLabelMaxChars, log), "focus", MAP_LIMITS.angleFocusMaxChars, log)), log))
});

/** LG-A: the merge's own salvage: its key point and answer ids, and the item ids it names, normalised. */
export const mapMergeSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => normaliseMapIds(reply, log))
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
 * Length guidance (spec 2026-10-15 §3.9, ruling L19): with the length row nothing is trimmed (MAP_TEXT_TRIMMED is never
 * made): the limits are runaway guards, and a text over one is the AI gone wrong, refused like any slip. The lean
 * default stays; the angles keep only the id normalisation (LG-A, MAP_IDS_NORMALISED), and the merge and the choose keep
 * their own salvages unchanged (they trim nothing).
 */
/** Angles with the length row: no trim (L19), the ids still normalised (LG-A, MAP_IDS_NORMALISED; ruling PF-C5.1). */
export const mapAnglesSalvageLengthed = Object.freeze({
  decoded: decodedSalvage((reply, log) => normaliseMapIds(reply, log))
});
export const mapListSalvageLengthed = Object.freeze({
  decoded: decodedSalvage((reply, log) => eachRecord(reply, "points", (point) => defaultLean(point, log)))
});
export const mapGapSalvageLengthed = Object.freeze({
  decoded: decodedSalvage((reply, log) => eachRecord(reply, "new_points", (point) => defaultLean(point, log)))
});

/**
 * Choose: in each answer, the key point ids the run does not hold (`keyPointIds`; null when not known, as in the practice
 * tool's format re-check), an id repeated within one list (the first is kept), and an id named on both sides (dropped
 * from both: it cannot count for and against one answer) are dropped. An answer that named points and would be left with
 * none is left as written, so the check refuses it where it did and the follow-up asks for it. LG-A: before the schema,
 * every answer id, key point id and rival id is normalised (MAP_IDS_NORMALISED, `normaliseMapIds`).
 */
export function mapChooseSalvage(keyPointIds: ReadonlySet<string> | null): MapReplySalvage<MapChooseReply> {
  return Object.freeze({
    decoded: decodedSalvage((reply, log) => normaliseMapIds(reply, log)),
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

/**
 * ENGINE 2: angles with no trims (LG-C's rule with the row), ids normalised (LG-A, ruling R6): exactly LG-C's
 * `mapAnglesSalvageLengthed` (`salvage.ts:203-205`), since v2's angles schema IS LG-C's lengthed one. One behaviour in
 * one place; Tasks 6 and 17 keep this name (pre-flight PF-R3-2.11).
 */
export const mapAnglesSalvageEngine = mapAnglesSalvageLengthed;

/** ENGINE 2: the check's ids normalised in code ("A1" → "a1"); anything else is the schema's to refuse. Its own object (not an alias). */
export const mapCheckSalvage = Object.freeze({
  decoded: decodedSalvage((reply, log) => normaliseMapIds(reply, log, MAP_CHECK_ID_NAMING_KEYS))
});

/** ENGINE 2: today's choose salvage (ids normalised; unknown, repeated and two-sided ids dropped), over answers AND reserves. */
export function mapChooseSalvageV2(keyPointIds: ReadonlySet<string> | null): MapReplySalvage<MapChooseReplyV2> {
  const sides = <T extends Readonly<{ for: readonly string[]; against: readonly string[] }>>(entry: T, log: MapSalvageLog): T => {
    const bothSides = new Set(entry.for.filter((id) => entry.against.includes(id)));
    const keep = (ids: readonly string[]) => ids.filter((id, at) => ids.indexOf(id) === at && !bothSides.has(id)
      && (keyPointIds === null || keyPointIds.has(id)));
    const kept = { for: keep(entry.for), against: keep(entry.against) };
    const dropped = kept.for.length !== entry.for.length || kept.against.length !== entry.against.length;
    if (!dropped || kept.for.length + kept.against.length === 0) return entry;
    log.note("MAP_IDS_DROPPED");
    return { ...entry, ...kept };
  };
  return Object.freeze({
    decoded: decodedSalvage((reply, log) => normaliseMapIds(reply, log)),
    parsed: (value: MapChooseReplyV2): MapSalvaged<MapChooseReplyV2> => {
      const log = new MapSalvageLog();
      const answers = value.answers.map((answer) => sides(answer, log));
      const reserves = value.reserve_answers?.map((reserve) => sides(reserve, log));
      if (log.repairs.length === 0) return Object.freeze({ value, repairs: log.repairs });
      return Object.freeze({ value: { ...value, answers, ...(reserves === undefined ? {} : { reserve_answers: reserves }) }, repairs: log.repairs });
    }
  });
}
