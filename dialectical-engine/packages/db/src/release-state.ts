import type { Pool, PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * Side-by-side uploads spec 2026-10-21 §4, §6 (migration 0123 §3) — WHICH RELEASE TAKES THE TRAFFIC.
 *
 * `core.release_event` is the append-only record of each release's life (STAGED, CURRENT, DRAINING, FRONT_PAIR_STOPPED,
 * RETIRE_REQUESTED, RETIRED); `core.release_state_v` reads one row per release from it. These are thin calls of 0123's
 * four definer functions, nothing more: the two readers (EXECUTE for debateai_runtime: the API's /readyz and background
 * loops, the runner's retirement check) and the two writers (EXECUTE for debateai_release_operator: root's switch and
 * units, plan D), which take ONE advisory lock and need READ COMMITTED. Pass a transaction's client to read or write
 * inside that transaction. Refusals surface as TypedDomainError with the SQL code as `code`; results are frozen.
 */
export type ReleaseLifecycleState = "STAGED" | "CURRENT" | "DRAINING" | "RETIRED";
/**
 * DRAINING here is only "abandon the re-stage" (controller ruling 2026-10-21): a draining release staged again for a
 * rollback that never switched goes back to finishing its own debates. Every other DRAINING comes from the switch.
 */
export type ReleaseEventKind = "STAGED" | "DRAINING" | "FRONT_PAIR_STOPPED" | "RETIRE_REQUESTED" | "RETIRED";
export type ReleaseQueryable = Pick<Pool, "query"> | PoolClient;

/** The codes 0123's writers refuse with (RAISE … MESSAGE = code), and Phase 2's settings hook's (plan S). */
const RELEASE_REFUSALS: ReadonlySet<string> = new Set(["RELEASE_SWITCH_CONFLICT", "RELEASE_EVENT_INVALID", "SETTINGS_ACTIVATION_CONFLICT"]);
/** The four lifecycle words 0123's state readers answer with; the API's per-send lookup checks the same set (C4 review). */
export const RELEASE_LIFECYCLE_STATES: ReadonlySet<string> = new Set<ReleaseLifecycleState>(["STAGED", "CURRENT", "DRAINING", "RETIRED"]);

async function query<Row>(db: ReleaseQueryable, text: string, values: readonly unknown[]): Promise<readonly Row[]> {
  try {
    return (await (db as Pick<Pool, "query">).query(text, [...values])).rows as Row[];
  } catch (error) {
    const code = error instanceof Error ? error.message : undefined;
    if (code !== undefined && RELEASE_REFUSALS.has(code)) throw new TypedDomainError(code, code);
    throw error;
  }
}

const asDate = (value: unknown): Date => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new TypeError("RELEASE_STATE_ROW_INVALID");
  return date;
};
const asEventSeq = (value: unknown): number => {
  const seq = Number(value);
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new TypeError("RELEASE_STATE_ROW_INVALID");
  return seq;
};

/** The current release and the instant its front takes the traffic from, or null before the first switch. */
export async function readCurrentRelease(db: ReleaseQueryable): Promise<Readonly<{ releaseKey: string; takeTrafficFrom: Date }> | null> {
  const rows = await query<{ release_key: string; take_traffic_from: unknown }>(db,
    "SELECT release_key, take_traffic_from FROM core.read_current_release()", []);
  if (rows.length > 1) throw new TypeError("RELEASE_STATE_ROW_INVALID"); // the switch keeps at most one release current
  const row = rows[0];
  return row === undefined ? null : Object.freeze({ releaseKey: row.release_key, takeTrafficFrom: asDate(row.take_traffic_from) });
}

/**
 * One release's state, or null for a release never recorded (and for `legacy`). The two flags count only events after
 * the release's latest STAGED, CURRENT or DRAINING event, so a release staged again starts clean. 0123's reader also
 * answers `still_draining` (final review A4: a DRAINING event with no later RETIRED one, so a draining release staged
 * again for a rollback reads true); this reader leaves it out, as its callers need the three fields only.
 */
export async function readReleaseState(db: ReleaseQueryable, releaseKey: string): Promise<Readonly<{
  state: ReleaseLifecycleState; frontPairStopped: boolean; retireRequested: boolean;
}> | null> {
  const rows = await query<{ state: string; front_pair_stopped: boolean; retire_requested: boolean }>(db,
    "SELECT state, front_pair_stopped, retire_requested FROM core.read_release_state($1)", [releaseKey]);
  const row = rows[0];
  if (row === undefined) return null;
  if (rows.length > 1 || !RELEASE_LIFECYCLE_STATES.has(row.state)) throw new TypeError("RELEASE_STATE_ROW_INVALID");
  return Object.freeze({
    state: row.state as ReleaseLifecycleState, frontPairStopped: row.front_pair_stopped === true, retireRequested: row.retire_requested === true
  });
}

/**
 * The release switch, spec §6: `newReleaseKey` (latest state STAGED) becomes CURRENT from `takeTrafficFrom`, and the release that
 * was current, which must be `expectedCurrent` (null = none yet), starts DRAINING, in one transaction. Refuses
 * RELEASE_SWITCH_CONFLICT when the current release moved or a third release still drains, RELEASE_EVENT_INVALID for an
 * input or state the switch does not take. Returns the CURRENT row's event_seq.
 */
export async function recordReleaseSwitch(db: ReleaseQueryable, input: Readonly<{
  newReleaseKey: string; expectedCurrent: string | null; takeTrafficFrom: Date; recordedBy: string;
}>): Promise<Readonly<{ eventSeq: number }>> {
  const rows = await query<{ event_seq: string }>(db,
    "SELECT core.record_release_switch($1, $2, $3, $4)::text AS event_seq",
    [input.newReleaseKey, input.expectedCurrent, input.takeTrafficFrom, input.recordedBy]);
  return Object.freeze({ eventSeq: asEventSeq(rows[0]?.event_seq) });
}

/**
 * STAGED, DRAINING (abandoning a re-stage only), FRONT_PAIR_STOPPED, RETIRE_REQUESTED or RETIRED for one release;
 * RELEASE_EVENT_INVALID for a disallowed transition.
 */
export async function recordReleaseEvent(db: ReleaseQueryable, input: Readonly<{
  releaseKey: string; kind: ReleaseEventKind; recordedBy: string; reason?: string;
}>): Promise<Readonly<{ eventSeq: number }>> {
  const rows = await query<{ event_seq: string }>(db,
    "SELECT core.record_release_event($1, $2, $3, $4)::text AS event_seq",
    [input.releaseKey, input.kind, input.recordedBy, input.reason ?? null]);
  return Object.freeze({ eventSeq: asEventSeq(rows[0]?.event_seq) });
}
