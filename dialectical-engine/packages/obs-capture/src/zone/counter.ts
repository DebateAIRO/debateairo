import { createZoneDriftSignal, dayBucket, type ZoneDriftSignal } from "./classifier.js";

const MAX_INTERVAL_MS = 86_400_000;

function safeInterval(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTERVAL_MS) {
    throw new TypeError("ZONE_FLUSH_INTERVAL_INVALID");
  }
  return value;
}

function safeJitter(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("ZONE_FLUSH_JITTER_INVALID");
  }
  return value;
}

function boundedIncrement(current: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, current + 1);
}

function nextDeadline(
  now: Date,
  intervalMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  let draw = 0;
  try {
    const candidate = random();
    draw = Number.isFinite(candidate) ? Math.min(1, Math.max(0, candidate)) : 0;
  } catch {
    draw = 0;
  }
  return now.getTime() + intervalMs + Math.floor(intervalMs * jitterRatio * draw);
}

interface JitterOptions {
  readonly flushIntervalMs: number;
  readonly jitterRatio: number;
  readonly random: () => number;
  readonly now: () => Date;
}

export interface ZoneDailyDelta {
  readonly day: string;
  readonly delta: number;
}

export interface ZoneCounterBuffer {
  record(): void;
  pendingCount(): number;
  nextFlushAt(): Date;
  flushDue(sink: (row: ZoneDailyDelta) => void | Promise<void>): Promise<boolean>;
}

export function createZoneCounterBuffer(options: JitterOptions): ZoneCounterBuffer {
  const intervalMs = safeInterval(options.flushIntervalMs);
  const jitterRatio = safeJitter(options.jitterRatio);
  const pending = new Map<string, number>();
  let deadline = nextDeadline(options.now(), intervalMs, jitterRatio, options.random);

  return Object.freeze({
    record(): void {
      try {
        const day = dayBucket(options.now());
        pending.set(day, boundedIncrement(pending.get(day) ?? 0));
      } catch {
        // Counter loss is covered by the separate positive authority proof.
      }
    },
    pendingCount(): number {
      let total = 0;
      for (const count of pending.values()) total = Math.min(Number.MAX_SAFE_INTEGER, total + count);
      return total;
    },
    nextFlushAt(): Date {
      return new Date(deadline);
    },
    async flushDue(
      sink: (row: ZoneDailyDelta) => void | Promise<void>,
    ): Promise<boolean> {
      const now = options.now();
      if (now.getTime() < deadline || pending.size === 0) return false;
      const batch = [...pending.entries()];
      pending.clear();
      deadline = nextDeadline(now, intervalMs, jitterRatio, options.random);
      for (let index = 0; index < batch.length; index += 1) {
        const item = batch[index];
        if (item === undefined) continue;
        const [day, delta] = item;
        try {
          await sink(Object.freeze({ day, delta }));
        } catch {
          for (const [pendingDay, pendingDelta] of batch.slice(index)) {
            pending.set(
              pendingDay,
              Math.min(
                Number.MAX_SAFE_INTEGER,
                (pending.get(pendingDay) ?? 0) + pendingDelta,
              ),
            );
          }
          return false;
        }
      }
      return true;
    },
  });
}

export interface ZoneDriftBuffer {
  record(manifestHash: string): void;
  pendingCount(): number;
  nextFlushAt(): Date;
  flushDue(sink: (signal: ZoneDriftSignal) => void | Promise<void>): Promise<boolean>;
}

export function createZoneDriftBuffer(options: JitterOptions): ZoneDriftBuffer {
  const intervalMs = safeInterval(options.flushIntervalMs);
  const jitterRatio = safeJitter(options.jitterRatio);
  const pending = new Set<string>();
  let deadline = nextDeadline(options.now(), intervalMs, jitterRatio, options.random);

  return Object.freeze({
    record(manifestHash: string): void {
      try {
        if (/^[0-9a-f]{64}$/u.test(manifestHash)) {
          pending.add(`${manifestHash}\u0000${dayBucket(options.now())}`);
        }
      } catch {
        // Drift accounting is off-path and cannot break product work.
      }
    },
    pendingCount(): number {
      return pending.size;
    },
    nextFlushAt(): Date {
      return new Date(deadline);
    },
    async flushDue(
      sink: (signal: ZoneDriftSignal) => void | Promise<void>,
    ): Promise<boolean> {
      const now = options.now();
      if (now.getTime() < deadline || pending.size === 0) return false;
      const batch = [...pending];
      pending.clear();
      deadline = nextDeadline(now, intervalMs, jitterRatio, options.random);
      for (let index = 0; index < batch.length; index += 1) {
        const key = batch[index];
        if (key === undefined) continue;
        const [manifestHash, day] = key.split("\u0000");
        if (manifestHash === undefined || day === undefined) continue;
        try {
          await sink(createZoneDriftSignal(manifestHash, new Date(`${day}T00:00:00.000Z`)));
        } catch {
          for (const pendingKey of batch.slice(index)) pending.add(pendingKey);
          return false;
        }
      }
      return true;
    },
  });
}
