import type { Pool, PoolClient } from "pg";
import { OWNER_CONCURRENT_DEBATES, SITE_CONCURRENT_DEBATES, readCurrentRelease, readReleaseState, type ReleaseLifecycleState } from "@debateai/db";
import { readActiveSettingsVersionOn } from "./active-settings-version.js";
import { activeVersionAlarm, type ActiveVersionAlarm } from "./admission-alarm.js";
import type { AskAdmissionGate } from "./ask-room.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, §6 (plan C task C3) — THE API'S RELEASE WATCHER.
 *
 * Two releases can run side by side; only the CURRENT one (migration 0123's release table) takes the site's traffic and
 * runs the background loops. One watcher per API process reads `core.read_current_release()` every second and answers,
 * from its last read and never from a query of its own:
 *
 * - `ownIsCurrent()` — strict: the last read is fresh (at most `staleMs` old) AND it named this release, or it named no
 *   release and the deployment is not hosted. "No row, not hosted" is today's single-release world (dev, every existing
 *   test); "no row, hosted" is not current (fail closed). A stale read is never current: a process that cannot reach
 *   the database cannot know it still is.
 * - `draining()` — SIGTERM began the drain (sticky), or the last SUCCESSFUL read says another release is current. An
 *   unreachable database keeps the last known value rather than guessing.
 * - `readiness()` — the reasons /readyz carries (spec §6), in the fixed order of ReadinessReason. DRAINING is SIGTERM's
 *   alone: a staged release that is not yet current reads exactly ["NOT_CURRENT"] (plan D's switch preconditions).
 * - `onBecameCurrent(listener)` — fired on every false→true of ownIsCurrent() as seen at a poll, the first poll in
 *   start() included; a listener registered while the release already is current fires once at once (controller ruling,
 *   C3 fix round 1), so work registered after start() — the post-listen one-shots — still runs on a current release.
 *
 * Polls chain with setTimeout (unref'd), so they never overlap and never hold the process open. A read that has not
 * answered within `staleMs` counts as a failed read (RELEASE_READ_TIMEOUT) and is aborted: the Postgres reader then
 * gives its own client back DESTROYED (release with an error), so a read hung on a lock or a dead socket never keeps the
 * one connection of its own pool (`api:release-watch`, final fix wave P1: never the runtime pool, where a burst of page
 * reads could hold it past the stale bound), and the database stops the statement itself (a transaction-local
 * statement_timeout of the same bound). Every log line is content-free: an event code and at most a driver code, never
 * an error's text, a key or a value; a read that fails after stop() prints nothing. A wall clock stepped back
 * makes the last read stale (fail closed until a new read) without forgetting it: draining() and NOT_CURRENT keep the
 * last successful answer, as they do for an unreachable database (plan C6, from C3's review).
 */
export type { ReleaseLifecycleState };
/**
 * One release's state as the per-send lookup reads it from 0123's `core.read_release_state`: the lifecycle word, the
 * two flags, and `stillDraining` (final review A4: a DRAINING event with no later RETIRED one, so a draining release
 * staged again for a rollback reads STAGED and true while its drained debates may still run).
 */
export type ReleaseState = Readonly<{
  state: ReleaseLifecycleState; frontPairStopped: boolean; retireRequested: boolean; stillDraining: boolean;
}>;
export type ReadinessReason = "BOOTING" | "DATABASE_UNREACHABLE" | "DRAINING" | "NOT_CURRENT" | "BEFORE_TAKE_TRAFFIC_FROM";
export type ReleaseReadiness = Readonly<{ ready: boolean; releaseKey: string; reasons: readonly ReadinessReason[] }>;

/**
 * The watcher's two timings (spec §6: read every second, a read older than five seconds is "unreachable"), carried as one
 * frozen object like RUN_EVENT_TAIL_TIMING (the source-purity law refuses a bare exported number), and named singly.
 */
export const RELEASE_WATCH_TIMING: Readonly<{ pollMs: number; staleMs: number }> = Object.freeze({ pollMs: 1_000, staleMs: 5_000 });
export const RELEASE_WATCH_POLL_MS: number = RELEASE_WATCH_TIMING.pollMs;
export const RELEASE_WATCH_STALE_MS: number = RELEASE_WATCH_TIMING.staleMs;

/**
 * `signal` aborts a read the caller gave up on: the reader then frees whatever the read holds. `readState` answers
 * packages/db readReleaseState's three fields (no `stillDraining`: only the per-send lookup needs it).
 */
export interface ReleaseStateReader {
  readCurrent(signal?: AbortSignal): Promise<Readonly<{ releaseKey: string; takeTrafficFrom: Date | null }> | null>;
  readState(releaseKey: string, signal?: AbortSignal): Promise<Omit<ReleaseState, "stillDraining"> | null>;
}

const readTimeout = (): Error => Object.assign(new Error("RELEASE_READ_TIMEOUT"), { code: "RELEASE_READ_TIMEOUT" });

/**
 * The reader over 0123's two definer functions (EXECUTE for debateai_runtime). Each read checks out its own client and
 * runs in a short transaction whose statement_timeout is `statementTimeoutMs` (SET LOCAL semantics via set_config, so the
 * pooled client keeps no setting). Success gives the client back; a failure or an abort gives it back with the error, so
 * pg destroys it and the slot is free at once — the hung query is never waited for or reused.
 */
export class PostgresReleaseStateReader implements ReleaseStateReader {
  readonly #statementTimeoutMs: number;

  constructor(private readonly pool: Pick<Pool, "connect">, options: Readonly<{ statementTimeoutMs?: number }> = {}) {
    const bound = options.statementTimeoutMs ?? RELEASE_WATCH_STALE_MS;
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > 600_000) throw new TypeError("RELEASE_READ_TIMEOUT_INVALID");
    this.#statementTimeoutMs = bound;
  }

  readCurrent(signal?: AbortSignal): Promise<Readonly<{ releaseKey: string; takeTrafficFrom: Date | null }> | null> {
    return this.#withClient(signal, (client) => readCurrentRelease(client));
  }

  readState(releaseKey: string, signal?: AbortSignal): Promise<Omit<ReleaseState, "stillDraining"> | null> {
    return this.#withClient(signal, (client) => readReleaseState(client, releaseKey));
  }

  async #withClient<T>(signal: AbortSignal | undefined, read: (client: PoolClient) => Promise<T>): Promise<T> {
    // A function, not a narrowed property: the abort can land while connect() is awaited.
    const aborted = (): boolean => signal?.aborted === true;
    if (aborted()) throw readTimeout();
    const client = await this.pool.connect();
    let released = false;
    const release = (error?: Error): void => {
      if (released) return;
      released = true;
      client.release(error);
    };
    const onAbort = (): void => release(readTimeout());
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (aborted()) throw readTimeout();
      await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout', $1, true)", [String(this.#statementTimeoutMs)]);
      const result = await read(client);
      await client.query("COMMIT");
      release();
      return result;
    } catch (error) {
      release(error instanceof Error ? error : readTimeout());
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** The one journal line the watcher prints: `DEBATEAI_RELEASE_WATCH {"event":…[,"code":…]}`. */
type WatchEvent = "READ_FAILED" | "READ_RECOVERED" | "BECAME_CURRENT" | "STOPPED_BEING_CURRENT" | "LISTENER_FAILED";

/** A driver or SQL code (`ECONNREFUSED`, `57P01`, `RELEASE_STATE_ROW_INVALID`) is content-free; anything else is dropped. */
function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code ?? (error instanceof TypeError ? error.message : undefined);
  return typeof code === "string" && /^[0-9A-Z_]{1,64}$/u.test(code) ? code : undefined;
}

type LastRead = Readonly<{ current: string | null; takeTrafficFrom: Date | null; readAt: number }>;

export class ReleaseWatcher {
  readonly #releaseKey: string;
  readonly #hosted: boolean;
  readonly #reader: ReleaseStateReader;
  readonly #clock: () => number;
  readonly #pollMs: number;
  readonly #staleMs: number;
  readonly #log: (line: string) => void;
  /** Each listener and whether it already fired in the current period (reset when a poll sees not current). */
  readonly #listeners = new Map<() => void, { fired: boolean }>();
  #last: LastRead | null = null;
  /** The latest clock reading: a reading below it is a backward step, which makes the last read stale. */
  #clockHigh = Number.NEGATIVE_INFINITY;
  #failing = false;
  #wasCurrent = false;
  #booted = false;
  #drainBegun = false;
  #started = false;
  #stopped = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: Readonly<{
    releaseKey: string; hosted: boolean; reader: ReleaseStateReader;
    clock?: () => number; pollMs?: number; staleMs?: number; log?: (line: string) => void;
  }>) {
    this.#releaseKey = options.releaseKey;
    this.#hosted = options.hosted;
    this.#reader = options.reader;
    this.#clock = options.clock ?? Date.now;
    this.#pollMs = options.pollMs ?? RELEASE_WATCH_POLL_MS;
    this.#staleMs = options.staleMs ?? RELEASE_WATCH_STALE_MS;
    this.#log = options.log ?? ((line) => console.error(line));
  }

  /** The first read is awaited (a failure is recorded, never thrown), then the unref'd poll chain starts. Once only. */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#poll();
    this.#schedule();
  }

  /** Clears the pending poll; a poll in flight finishes but schedules no other. */
  stop(): void {
    this.#stopped = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** The post-listen block ran: BOOTING is no longer a reason. */
  markBooted(): void {
    this.#booted = true;
  }

  /** SIGTERM: this process drains from now on, whatever the release table later says (sticky). */
  beginDrain(): void {
    this.#drainBegun = true;
  }

  ownIsCurrent(): boolean {
    return this.#fresh() && this.#lastSaysOwn();
  }

  draining(): boolean {
    return this.#drainBegun || (this.#last !== null && !this.#lastSaysOwn());
  }

  /**
   * BEFORE_TAKE_TRAFFIC_FROM compares the database's instant with this process's clock: it assumes the API and the
   * database share one host clock (the preview's layout), and spec §6's margin between the switch and the take-traffic-from
   * instant absorbs the small skew a second host would add.
   */
  readiness(): ReleaseReadiness {
    const reasons: ReadinessReason[] = [];
    if (!this.#booted) reasons.push("BOOTING");
    if (!this.#fresh()) reasons.push("DATABASE_UNREACHABLE");
    if (this.#drainBegun) reasons.push("DRAINING");
    if (this.#last !== null && !this.#lastSaysOwn()) reasons.push("NOT_CURRENT");
    const takeTrafficFrom = this.#last?.takeTrafficFrom ?? null;
    if (this.#last !== null && this.#lastSaysOwn() && takeTrafficFrom !== null && this.#now() < takeTrafficFrom.getTime()) {
      reasons.push("BEFORE_TAKE_TRAFFIC_FROM");
    }
    return Object.freeze({ ready: reasons.length === 0, releaseKey: this.#releaseKey, reasons: Object.freeze(reasons) });
  }

  /**
   * Returns the unsubscribe. Each listener fires once per current period: at once when registered while the release is
   * current (never after stop()), otherwise at the first poll that sees it current — including a fresh read after a
   * stale one in the same period. A listener that throws is logged by code and never stops the others or the watcher.
   */
  onBecameCurrent(listener: () => void): () => void {
    const own = (): void => listener();
    const entry = { fired: false };
    this.#listeners.set(own, entry);
    if (!this.#stopped && this.#wasCurrent && this.ownIsCurrent()) {
      entry.fired = true;
      this.#fire(own);
    }
    return () => { this.#listeners.delete(own); };
  }

  /**
   * The clock, checked: a backward step marks the last read stale (its answer kept for draining() and NOT_CURRENT,
   * never fresh again until a new read) and becomes the new baseline.
   */
  #now(): number {
    const now = this.#clock();
    if (now < this.#clockHigh && this.#last !== null) {
      this.#last = Object.freeze({ ...this.#last, readAt: Number.NEGATIVE_INFINITY });
    }
    this.#clockHigh = now;
    return now;
  }

  #fresh(): boolean {
    const now = this.#now();
    if (this.#last === null) return false;
    const age = now - this.#last.readAt;
    return age >= 0 && age <= this.#staleMs;
  }

  #fire(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      this.#line("LISTENER_FAILED", codeOf(error));
    }
  }

  /**
   * readCurrent() raced against `staleMs`: a read that never answers is a failed read, so the chain goes on. The read is
   * aborted first, so the reader frees its client before the next poll can start another read; the pending promise is
   * never reused (a dead socket would stall it forever).
   */
  async #readWithin(): Promise<Awaited<ReturnType<ReleaseStateReader["readCurrent"]>>> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(readTimeout());
      }, this.#staleMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([this.#reader.readCurrent(abort.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  #lastSaysOwn(): boolean {
    const last = this.#last;
    if (last === null) return false;
    return last.current === null ? !this.#hosted : last.current === this.#releaseKey;
  }

  #schedule(): void {
    if (this.#stopped) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#poll().finally(() => this.#schedule());
    }, this.#pollMs);
    this.#timer.unref?.();
  }

  async #poll(): Promise<void> {
    try {
      const current = await this.#readWithin();
      this.#last = Object.freeze({
        current: current?.releaseKey ?? null, takeTrafficFrom: current?.takeTrafficFrom ?? null, readAt: this.#now()
      });
      if (this.#failing) this.#line("READ_RECOVERED");
      this.#failing = false;
    } catch (error) {
      if (this.#stopped) return; // a normal shutdown ends the pool under a read: no false READ_FAILED
      if (!this.#failing) this.#line("READ_FAILED", codeOf(error));
      this.#failing = true;
    }
    if (this.#stopped) return;
    const isCurrent = this.ownIsCurrent();
    const became = isCurrent && !this.#wasCurrent;
    if (!isCurrent && this.#wasCurrent) this.#line("STOPPED_BEING_CURRENT");
    this.#wasCurrent = isCurrent;
    if (became) this.#line("BECAME_CURRENT");
    for (const [listener, entry] of [...this.#listeners]) {
      if (!isCurrent) {
        entry.fired = false;
      } else if (!entry.fired) {
        entry.fired = true;
        this.#fire(listener);
      }
    }
  }

  #line(event: WatchEvent, code?: string): void {
    this.#log(`DEBATEAI_RELEASE_WATCH ${JSON.stringify(code === undefined ? { event } : { event, code })}`);
  }
}

/**
 * Side-by-side final fix wave P7 — the boot line of a hosted API that composed no ask room (no costEnvelopePolicy row in
 * force, or one without the band). The site's cap of debates across releases (SITE_CONCURRENT_DEBATES) and the SWITCHING
 * hold are read inside the room's spend decision (PostgresAskAdmissionGate below), so without the room neither holds and
 * asks start as they did before it. Not a refusal: one content-free line for the operator's journal. A local API runs
 * one release, so it has no cap to lose and prints nothing.
 */
export function siteCapBootLine(input: Readonly<{ hosted: boolean; roomComposed: boolean }>): string | null {
  return input.hosted && !input.roomComposed ? JSON.stringify({ event: "api.release.no_site_cap" }) : null;
}

/**
 * Side-by-side uploads spec 2026-10-21 §9, §13 (plan C task C8) — THE ASK ROOM'S GATE, read on the spend decision's own
 * transaction (inside its day lock), never from the watcher's last poll: an ask admitted the instant a switch moves the
 * traffic away must see the switch.
 *
 * - `ownReleaseIsCurrent` is the watcher's rule (`#lastSaysOwn`) over a fresh `core.read_current_release()`: this
 *   release is current when the row names it, or when there is no row and the deployment is not hosted (today's
 *   single-release world); hosted with no row is not current (fail closed).
 *   Side-by-side spec §13 "The API re-checks at admission" (Task S11): given the settings version the decision would
 *   start on, a current release must also have passed it — one query, after the release read and on the same
 *   transaction (`settingsVersionPassed`); not passed is not current (the decision waits, SWITCHING). This covers an
 *   ask in flight across an activation or a switch and the 1 s pointer cache; the current release's waker starts it
 *   within a tick, re-admitted under O3 (S13). Without a version, the release alone, as in Phase 1. Ruling R77 (final
 *   fix wave F2b): a CURRENT release that has not passed the version says the once-a-minute alarm (NOT_PASSED,
 *   ./admission-alarm.ts) — the asks and the waiting debates it holds would otherwise wait silently; a staged release
 *   (not current) says nothing, its SWITCHING is a switch under way.
 * - `activeDebates` counts the runs with a READY or CLAIMED job across every release (0083's partial index
 *   work_item_live_run_idx answers it without reading history).
 * - `ownerActiveDebates` (NV-48, security audit run 3) counts the same runs of ONE person, by the run's owner as
 *   core.run_waiting_v reads it (the latest core.run_ownership_event, else an `owner:<uuid>` asker id, compared as
 *   text so no stored value is cast), against `ownerConcurrentDebates` (`OWNER_CONCURRENT_DEBATES`, at most the site's
 *   cap). It reads core.work_item, core.run and core.run_ownership_event, all SELECT-granted to debateai_runtime, on the
 *   room decision's own transaction: since row security (0130, X19) that pool is api-system (API_SYSTEM_DATABASE_URL),
 *   which sees the person's runs whoever's request or waker tick decides.
 * - `activeSettingsVersion` (side-by-side spec §13, C14, Task S13; only when built with `siteVersion`, as main.ts and
 *   the practice build it): the activation pointer read on the decision's own transaction
 *   (`readActiveSettingsVersionOn`, the one SQL constant of ./active-settings-version.ts; NULL = `siteVersion`). A
 *   waiting debate's START compares it with the run's stamp and re-checks the version it will start on with it.
 *
 * Every read but the pointer is debateai_runtime's (EXECUTE on 0123's reader and on 0124's
 * `register.settings_version_passed`, SELECT on core.work_item); the pointer is debateai_billing_runtime's (D8). The
 * room decision pool's login is the API's runtime login (DATABASE_URL, as the main pool), which holds both
 * (debateai_billing_runtime inherits debateai_runtime: P3 membershipGrants).
 */
export class PostgresAskAdmissionGate implements AskAdmissionGate {
  readonly releaseKey: string;
  readonly siteConcurrentDebates: number;
  readonly ownerConcurrentDebates: number;
  readonly #hosted: boolean;
  readonly activeSettingsVersion?: (tx: Pick<PoolClient, "query">) => Promise<number>;
  readonly #alarm: ActiveVersionAlarm;

  constructor(options: Readonly<{
    releaseKey: string; hosted: boolean; siteConcurrentDebates?: number; siteVersion?: number;
    /** NV-48: the person's share of the site's places (absent: `OWNER_CONCURRENT_DEBATES`, at most the cap). */
    ownerConcurrentDebates?: number;
    /** Ruling R77: the alarm a current release's unpassed version says (absent: the process's own). */
    alarm?: ActiveVersionAlarm;
  }>) {
    const cap = options.siteConcurrentDebates ?? SITE_CONCURRENT_DEBATES;
    if (!Number.isSafeInteger(cap) || cap < 1) throw new TypeError("ASK_ADMISSION_GATE_INVALID");
    const share = options.ownerConcurrentDebates ?? Math.min(OWNER_CONCURRENT_DEBATES, cap);
    if (!Number.isSafeInteger(share) || share < 1 || share > cap) throw new TypeError("ASK_ADMISSION_GATE_INVALID");
    this.releaseKey = options.releaseKey;
    this.siteConcurrentDebates = cap;
    this.ownerConcurrentDebates = share;
    this.#hosted = options.hosted;
    this.#alarm = options.alarm ?? activeVersionAlarm;
    const siteVersion = options.siteVersion;
    if (siteVersion !== undefined) {
      if (!Number.isSafeInteger(siteVersion) || siteVersion < 1) throw new TypeError("ASK_ADMISSION_GATE_INVALID");
      this.activeSettingsVersion = (tx) => readActiveSettingsVersionOn(tx, siteVersion);
    }
  }

  async ownReleaseIsCurrent(tx: Pick<PoolClient, "query">, registerVersion?: number): Promise<boolean> {
    const current = await readCurrentRelease(tx as Pick<Pool, "query">);
    const own = current === null ? !this.#hosted : current.releaseKey === this.releaseKey;
    if (!own || registerVersion === undefined) return own;
    const passed = await settingsVersionPassed(tx, this.releaseKey, registerVersion);
    if (!passed) this.#alarm(registerVersion, "NOT_PASSED");
    return passed;
  }

  async activeDebates(tx: Pick<PoolClient, "query">): Promise<number> {
    const result = await tx.query<{ active: number }>(
      `SELECT count(DISTINCT run_id)::integer AS active FROM core.work_item
       WHERE state IN ('READY','CLAIMED') AND run_id IS NOT NULL`
    );
    const active = result.rows[0]?.active;
    if (!Number.isSafeInteger(active) || (active as number) < 0) throw new TypeError("ASK_ADMISSION_GATE_COUNT_INVALID");
    return active as number;
  }

  async ownerActiveDebates(tx: Pick<PoolClient, "query">, ownerRef: string): Promise<number> {
    const result = await tx.query<{ active: number }>(
      `SELECT count(DISTINCT work.run_id)::integer AS active
       FROM core.work_item AS work
       JOIN core.run AS run ON run.run_id = work.run_id
       LEFT JOIN LATERAL (
         SELECT event.owner_ref FROM core.run_ownership_event AS event
         WHERE event.run_id = work.run_id
         ORDER BY event.at_seq DESC
         LIMIT 1
       ) AS latest ON true
       WHERE work.state IN ('READY','CLAIMED') AND work.run_id IS NOT NULL
         AND (latest.owner_ref = $1::uuid
           OR (latest.owner_ref IS NULL AND run.asker_id = 'owner:' || $1::uuid::text))`,
      [ownerRef]
    );
    const active = result.rows[0]?.active;
    if (!Number.isSafeInteger(active) || (active as number) < 0) throw new TypeError("ASK_ADMISSION_GATE_COUNT_INVALID");
    return active as number;
  }
}

/** The re-check's one query (0124; the plan's exact text). */
const SETTINGS_VERSION_PASSED_SQL = "SELECT register.settings_version_passed($1::text, $2::bigint) AS passed";

/**
 * Side-by-side spec §13 "The API re-checks at admission", plan D1 (Task S11) — HAS THIS RELEASE PASSED THIS SETTINGS
 * VERSION? Migration 0124's one rule (`register.settings_version_passed`): the version is the release key's own site
 * version, or the release's latest verdict for it is PASS; `legacy` passes nothing. Asked on the executor it is given
 * (the decision's own transaction in the room; the API's runtime pool on the direct path), once per decision. EXECUTE is
 * debateai_runtime's, which the API's runtime login holds through debateai_billing_runtime (P3 membershipGrants). An
 * answer that is not a boolean is never guessed (ASK_ADMISSION_GATE_SETTINGS_INVALID).
 */
export async function settingsVersionPassed(
  executor: Pick<PoolClient, "query">, releaseKey: string, registerVersion: number
): Promise<boolean> {
  const result = await executor.query<{ passed: unknown }>(SETTINGS_VERSION_PASSED_SQL, [releaseKey, registerVersion]);
  const passed = result.rows[0]?.passed;
  if (typeof passed !== "boolean") throw new TypeError("ASK_ADMISSION_GATE_SETTINGS_INVALID");
  return passed;
}
