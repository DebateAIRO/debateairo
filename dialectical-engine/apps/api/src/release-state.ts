import type { Pool } from "pg";
import { readCurrentRelease, readReleaseState, type ReleaseLifecycleState } from "@debateai/db";

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
 * answered within `staleMs` counts as a failed read (RELEASE_READ_TIMEOUT: the runtime pool has no statement timeout, and
 * a hung read must not stop the chain). Every log line is content-free: an event code and at most a driver code, never an
 * error's text, a key or a value; a read that fails after stop() prints nothing.
 */
export type { ReleaseLifecycleState };
export type ReleaseState = Readonly<{ state: ReleaseLifecycleState; frontPairStopped: boolean; retireRequested: boolean }>;
export type ReadinessReason = "BOOTING" | "DATABASE_UNREACHABLE" | "DRAINING" | "NOT_CURRENT" | "BEFORE_TAKE_TRAFFIC_FROM";
export type ReleaseReadiness = Readonly<{ ready: boolean; releaseKey: string; reasons: readonly ReadinessReason[] }>;

export interface ReleaseStateReader {
  readCurrent(): Promise<Readonly<{ releaseKey: string; takeTrafficFrom: Date | null }> | null>;
  readState(releaseKey: string): Promise<ReleaseState | null>;
}

/** The reader over 0123's two definer functions (EXECUTE for debateai_runtime), one statement per call. */
export class PostgresReleaseStateReader implements ReleaseStateReader {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  readCurrent(): Promise<Readonly<{ releaseKey: string; takeTrafficFrom: Date | null }> | null> {
    return readCurrentRelease(this.pool);
  }

  readState(releaseKey: string): Promise<ReleaseState | null> {
    return readReleaseState(this.pool, releaseKey);
  }
}

/**
 * The watcher's two timings (spec §6: read every second, a read older than five seconds is "unreachable"), carried as one
 * frozen object like RUN_EVENT_TAIL_TIMING (the source-purity law refuses a bare exported number), and named singly.
 */
export const RELEASE_WATCH_TIMING: Readonly<{ pollMs: number; staleMs: number }> = Object.freeze({ pollMs: 1_000, staleMs: 5_000 });
export const RELEASE_WATCH_POLL_MS: number = RELEASE_WATCH_TIMING.pollMs;
export const RELEASE_WATCH_STALE_MS: number = RELEASE_WATCH_TIMING.staleMs;

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
  readonly #listeners = new Set<() => void>();
  #last: LastRead | null = null;
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
    if (this.#last !== null && this.#lastSaysOwn() && takeTrafficFrom !== null && this.#clock() < takeTrafficFrom.getTime()) {
      reasons.push("BEFORE_TAKE_TRAFFIC_FROM");
    }
    return Object.freeze({ ready: reasons.length === 0, releaseKey: this.#releaseKey, reasons: Object.freeze(reasons) });
  }

  /**
   * Returns the unsubscribe. Registered while the release already is current, the listener fires once at once; then on
   * every later false→true. A listener that throws is logged by code and never stops the others or the watcher.
   */
  onBecameCurrent(listener: () => void): () => void {
    const own = (): void => listener();
    this.#listeners.add(own);
    if (this.#wasCurrent && this.ownIsCurrent()) this.#fire(own);
    return () => { this.#listeners.delete(own); };
  }

  /** A clock stepped back before the last read makes that read stale, never fresh (fail closed). */
  #fresh(): boolean {
    if (this.#last === null) return false;
    const age = this.#clock() - this.#last.readAt;
    return age >= 0 && age <= this.#staleMs;
  }

  #fire(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      this.#line("LISTENER_FAILED", codeOf(error));
    }
  }

  /** readCurrent() raced against `staleMs`: a read that never answers is a failed read, so the chain goes on. */
  async #readWithin(): Promise<Awaited<ReturnType<ReleaseStateReader["readCurrent"]>>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("RELEASE_READ_TIMEOUT"), { code: "RELEASE_READ_TIMEOUT" })), this.#staleMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([this.#reader.readCurrent(), timeout]);
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
        current: current?.releaseKey ?? null, takeTrafficFrom: current?.takeTrafficFrom ?? null, readAt: this.#clock()
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
    if (!became) return;
    this.#line("BECAME_CURRENT");
    for (const listener of [...this.#listeners]) this.#fire(listener);
  }

  #line(event: WatchEvent, code?: string): void {
    this.#log(`DEBATEAI_RELEASE_WATCH ${JSON.stringify(code === undefined ? { event } : { event, code })}`);
  }
}
