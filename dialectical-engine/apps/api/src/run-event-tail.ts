/**
 * Live run events (2026-10-11): one `GET /v1/runs/:id/events` request is one
 * long-lived stream. It replays the stored events, then follows the run:
 * every poll it reads a cheap change mark (one owner-gated SQL statement), and
 * only when the mark moved does it read the event snapshot again and send the
 * events it has not sent yet. While nothing is sent it emits a heartbeat at
 * least every `heartbeatMs`, so no proxy cuts an idle stream.
 *
 * It ends when a `run.terminal` event was sent; when the run is settled (every
 * work item DONE or FAILED) and nothing new arrived for `settledGraceMs` — a
 * run already settled when the stream opens ends right after its replay; when
 * the run is no longer the caller's (the mark reads null); when the client went
 * away (the abort signal: no further query); when this process drains (below);
 * or after `maxLifeMs` (the page reconnects). No connection is held between polls.
 *
 * Drain (side-by-side spec §6, plan C6): once `draining()` answers true — SIGTERM,
 * or another release took the traffic — the stream ends with a clean close: right
 * after the replay, or at its next poll, before that poll's mark read. No new event
 * type is sent (an old page refuses unknown events); the page treats the clean
 * close as "reconnect after 5 s and replay" (apps/ui/lib/v3/liveEvents.ts), and
 * every stream ends within about one `pollMs`, well inside Fastify's 20 s close deadline.
 *
 * Before 2026-10-11 the reply ended after the replay and the page reconnected
 * about once a second, spending the whole `publicReads` admission budget of its
 * address in about two minutes (design: docs/superpowers/specs/2026-10-11-live-run-events-design.md).
 */

export type RunEventTailTiming = Readonly<{
  /** How long the tail waits between two change-mark reads. */
  pollMs: number;
  /** The longest an open stream stays silent: a `: keep-alive` comment is sent by then. */
  heartbeatMs: number;
  /** One stream's whole life; the page reconnects after it. */
  maxLifeMs: number;
  /** How long a run that settled while watched is followed for its closing events. */
  settledGraceMs: number;
}>;

export const RUN_EVENT_TAIL_TIMING: RunEventTailTiming = Object.freeze({
  pollMs: 1_500,
  heartbeatMs: 15_000,
  maxLifeMs: 30 * 60_000,
  settledGraceMs: 60_000
});

export type RunEventTailClock = Readonly<{
  now(): number;
  /** Resolves after `ms`, or as soon as `signal` aborts (never rejects). */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}>;

export const SYSTEM_RUN_EVENT_TAIL_CLOCK: RunEventTailClock = Object.freeze({
  now: () => Date.now(),
  sleep: (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  })
});

/** What one change-mark read says: an opaque mark that moves with any new event, and whether all work is finished. */
export type RunEventMark = Readonly<{ mark: string; settled: boolean }>;

export type RunEventTailItem =
  | Readonly<{ kind: "event"; event: unknown }>
  | Readonly<{ kind: "heartbeat" }>;

export const RUN_EVENT_HEARTBEAT: RunEventTailItem = Object.freeze({ kind: "heartbeat" as const });

/** The SSE comment line a heartbeat writes: ignored by every SSE reader, enough to keep proxies from cutting the stream. */
export const RUN_EVENT_HEARTBEAT_FRAME = ": keep-alive\n\n";

function eventKey(event: unknown): string {
  if (typeof event === "object" && event !== null) {
    const id = (event as { event_id?: unknown }).event_id;
    if (typeof id === "string") return id;
  }
  return JSON.stringify(event);
}

function isTerminal(event: unknown): boolean {
  return typeof event === "object" && event !== null
    && (event as { event_type?: unknown }).event_type === "run.terminal";
}

export async function* tailRunEvents(input: Readonly<{
  /** The stored events of the run, in sequence order (the application's `events`). */
  snapshot: (signal: AbortSignal) => AsyncIterable<unknown>;
  /** One cheap owner-gated read; null when the run is gone or no longer the caller's. */
  mark: (signal: AbortSignal) => Promise<RunEventMark | null>;
  signal: AbortSignal;
  timing?: Partial<RunEventTailTiming>;
  clock?: RunEventTailClock;
  /** True once this process drains (side-by-side spec §6); read after the replay and after every sleep. */
  draining?: () => boolean;
}>): AsyncGenerator<RunEventTailItem, void, undefined> {
  const timing = { ...RUN_EVENT_TAIL_TIMING, ...input.timing };
  const clock = input.clock ?? SYSTEM_RUN_EVENT_TAIL_CLOCK;
  const { signal } = input;
  const draining = (): boolean => input.draining?.() === true;
  const sent = new Set<string>();
  let terminal = false;
  const started = clock.now();
  let lastWrite = started;

  async function* fresh(): AsyncGenerator<RunEventTailItem, void, undefined> {
    // Ordering: a re-read may emit an event whose at_sequence is LOWER than one already sent. events() reads
    // the progress and failed-work rows and the lifecycle rows in separate snapshots, so a row can commit
    // between them. The page applies each event per node (applyRunEvent in apps/ui/lib/v3/liveEvents.ts) and
    // tolerates that order; this loop only guarantees that each event is sent once.
    for await (const event of input.snapshot(signal)) {
      if (signal.aborted) return;
      const key = eventKey(event);
      if (sent.has(key)) continue;
      sent.add(key);
      if (isTerminal(event)) terminal = true;
      lastWrite = clock.now();
      yield { kind: "event", event };
    }
  }

  if (signal.aborted) return;
  // The mark is read BEFORE the snapshot: an event written in between moves
  // the next mark, so it is read again and sent once — never lost.
  let last = await input.mark(signal);
  yield* fresh();
  if (last === null || terminal || last.settled || signal.aborted || draining()) return;
  let lastChange = clock.now();

  while (!signal.aborted) {
    const now = clock.now();
    const remaining = started + timing.maxLifeMs - now;
    if (remaining <= 0) return;
    const untilHeartbeat = lastWrite + timing.heartbeatMs - now;
    if (untilHeartbeat <= 0) {
      lastWrite = now;
      yield RUN_EVENT_HEARTBEAT;
      continue;
    }
    await clock.sleep(Math.min(timing.pollMs, remaining, untilHeartbeat), signal);
    if (signal.aborted || draining()) return;
    const current = await input.mark(signal);
    if (signal.aborted || current === null) return;
    if (current.mark !== last.mark) {
      last = current;
      lastChange = clock.now();
      yield* fresh();
      if (terminal || signal.aborted) return;
    } else if (current.settled && clock.now() - lastChange >= timing.settledGraceMs) {
      return;
    }
  }
}

/** An application without a change mark answers the snapshot alone, as before 2026-10-11. */
export async function* snapshotRunEventItems(events: AsyncIterable<unknown>): AsyncGenerator<RunEventTailItem, void, undefined> {
  for await (const event of events) yield { kind: "event", event };
}
