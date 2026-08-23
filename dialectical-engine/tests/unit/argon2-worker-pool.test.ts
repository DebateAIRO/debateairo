import { createHash } from "node:crypto";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  ARGON2_PROVISIONAL_BOUNDS,
  ARGON2ID_ENCODING_BOUNDS,
  Argon2InfrastructureError,
  Argon2WorkerPool,
  AuditContextHasher,
  hashPassword,
  parseEncodedArgon2id,
  verifyPassword,
  type Argon2Executor,
  type Argon2WorkerHandle
} from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";

const auditKdf = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).auditSourceIpKdf;
const SALT = Buffer.alloc(32, 0x6e);

/**
 * A stored hash that is well formed AND inside the accepted cost envelope.
 * `verifyPassword` now refuses anything else before a worker is ever occupied,
 * so a bare "$argon2id$" placeholder would never reach the pool at all.
 */
const ENCODED_HASH = `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`;
/** The lawful `hash-audit` reply shape: lowercase hex of exactly hashLength bytes. */
const AUDIT_DIGEST = "ab".repeat(32);

/** Unpadded base64 character count for `bytes` bytes, exactly as Argon2 encodes. */
function encodedChars(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

/**
 * The encoding a lawful worker would return for THIS request: the request's own
 * memory cost, time cost, parallelism, salt and digest length. Built from the
 * recorded dispatch rather than from a constant, because a constant encoding is
 * exactly the weaker-but-in-envelope answer rework2 RED 3 exists to refuse.
 */
function lawfulPasswordEncoding(job: DispatchedJob): string {
  return `$argon2id$v=19$m=${job.memoryCostKiB!},t=${job.timeCost!},p=${job.parallelism!}`
    + `$${job.saltBase64!}$${"A".repeat(encodedChars(job.hashLength!))}`;
}

/**
 * One dispatched request, as the parent handed it over. Every field a response
 * must be bound to is captured BEFORE the structured-clone transfer detaches
 * the payload, so the fake can answer lawfully — or deliberately not.
 */
interface DispatchedJob {
  readonly id: string;
  readonly op: string;
  readonly memoryCostKiB?: number | undefined;
  readonly timeCost?: number | undefined;
  readonly iterations?: number | undefined;
  readonly parallelism?: number | undefined;
  readonly hashLength?: number | undefined;
  readonly saltBase64?: string | undefined;
}

/**
 * How this fake answers a termination REQUEST.
 *
 * - `resolve`  — the ordinary case: `terminate()` settles and the thread dies.
 * - `hang`     — termination is in flight until the test releases it.
 * - `reject`   — the request is REFUSED and the thread KEEPS RUNNING. A real
 *                worker looks like this when the handle is torn down under it
 *                or the thread is wedged; the parent learns nothing about death
 *                from the rejection, which is rework2 RED 1.
 */
type TerminationMode = "resolve" | "hang" | "reject";

// --------------------------------------------------------------------------
// Barrier fake worker. Never computes Argon2: it holds each job open until the
// test releases it, so capacity, fairness, fault and close behaviour are proven
// deterministically rather than by racing real KDFs.
// --------------------------------------------------------------------------
interface FakeWorker extends Argon2WorkerHandle {
  readonly received: DispatchedJob[];
  emitReady(): void;
  /** Replies with the lawful result shape for the operation this id carried. */
  settle(id: string): void;
  /** Replies with an arbitrary frame, for protocol-fault coverage. */
  raw(frame: unknown): void;
  verified(id: string, matches: boolean): void;
  fail(id: string): void;
  crash(): void;
  releaseTermination(): void;
  /** The explicit thread-death signal a real Worker emits when it is gone. */
  emitExit(code?: number): void;
  readonly terminated: () => number;
  readonly refCount: () => number;
  readonly isAlive: () => boolean;
}

function createFakeWorker(
  index: number,
  autoReady = true,
  hangTermination = false,
  terminationMode: TerminationMode = hangTermination ? "hang" : "resolve"
): FakeWorker {
  const listeners = new Map<string, ((value: never) => void)[]>();
  const received: DispatchedJob[] = [];
  let terminateCalls = 0;
  let refs = 0;
  let alive = true;
  let pendingTermination: Promise<unknown> | undefined;
  let releaseTermination: (() => void) | undefined;
  const emit = (event: string, value: unknown): void => {
    for (const listener of listeners.get(event) ?? []) (listener as (v: unknown) => void)(value);
  };
  const worker: FakeWorker = {
    threadId: 100 + index,
    received,
    postMessage(message: unknown, transfer?: readonly ArrayBuffer[]) {
      const request = message as {
        id: string; op: string; salt?: Uint8Array;
        memoryCostKiB?: number; timeCost?: number; iterations?: number;
        parallelism?: number; hashLength?: number;
      };
      // Read the binding parameters BEFORE the transfer below detaches them.
      received.push(Object.freeze({
        id: request.id,
        op: request.op,
        memoryCostKiB: request.memoryCostKiB,
        timeCost: request.timeCost,
        iterations: request.iterations,
        parallelism: request.parallelism,
        hashLength: request.hashLength,
        saltBase64: request.salt === undefined
          ? undefined
          : Buffer.from(request.salt).toString("base64").replace(/=+$/, "")
      }));
      // Mirror real structured-clone transfer: the parent's buffers are
      // DETACHED at handoff. Without this the fake silently leaves dispatched
      // plaintext readable in the parent, which is the one thing the ownership
      // contract exists to prevent.
      if (transfer !== undefined && transfer.length > 0) {
        structuredClone(message, { transfer: [...transfer] });
      }
    },
    on(event: string, listener: (value: never) => void) {
      const bucket = listeners.get(event) ?? [];
      bucket.push(listener);
      listeners.set(event, bucket);
    },
    terminate(): Promise<unknown> {
      terminateCalls += 1;
      if (terminationMode === "reject") {
        // Deliberately NOT idempotent-cached: a refused request leaves nothing
        // in flight. The thread stays alive and emits no exit.
        return Promise.reject(new Error("ERR_WORKER_TERMINATE_REFUSED"));
      }
      // Idempotent, like a real Worker: a second terminate() observes the SAME
      // in-flight termination instead of starting another one.
      pendingTermination ??= terminationMode === "hang"
        ? new Promise((resolve) => {
          releaseTermination = () => { alive = false; resolve(0); };
        })
        : Promise.resolve().then(() => { alive = false; return 0; });
      return pendingTermination;
    },
    ref() { refs += 1; },
    unref() { refs -= 1; },
    emitReady() { emit("message", { kind: "ready" }); },
    settle(id: string) {
      const job = received.find((candidate) => candidate.id === id);
      const op = job?.op ?? "hash-password";
      if (op === "verify-password") {
        emit("message", { kind: "verified", id, matches: false });
        return;
      }
      if (op === "hash-audit") {
        emit("message", {
          kind: "result", id, digest: "ab".repeat(job?.hashLength ?? 32)
        });
        return;
      }
      emit("message", {
        kind: "result", id,
        digest: job === undefined ? ENCODED_HASH : lawfulPasswordEncoding(job)
      });
    },
    raw(frame: unknown) { emit("message", frame); },
    verified(id: string, matches: boolean) { emit("message", { kind: "verified", id, matches }); },
    fail(id: string) {
      emit("message", { kind: "failed", id, code: "ARGON2_WORKER_JOB_FAILED" });
    },
    crash() { emit("error", new Error("worker died")); },
    releaseTermination() { releaseTermination?.(); },
    emitExit(code = 1) { alive = false; emit("exit", code); },
    terminated: () => terminateCalls,
    refCount: () => refs,
    isAlive: () => alive
  } as FakeWorker;
  if (autoReady) queueMicrotask(() => worker.emitReady());
  return worker;
}

function bytes(length: number): Uint8Array {
  return new Uint8Array(length).fill(1);
}

async function settled<T>(promise: Promise<T>): Promise<"pending" | "resolved" | "rejected"> {
  let state: "pending" | "resolved" | "rejected" = "pending";
  promise.then(() => { state = "resolved"; }, () => { state = "rejected"; });
  await new Promise((resolve) => setImmediate(resolve));
  return state;
}

/** Lets queued microtasks and the pool's internal pumping settle. */
async function flush(times = 4): Promise<void> {
  for (let index = 0; index < times; index += 1) await new Promise((r) => setImmediate(r));
}

function makePool(options: Partial<{
  workers: number;
  credentialLaneCap: number;
  auditLaneCap: number;
  totalCap: number;
  jobTimeoutMs: number;
  restartBudget: number;
  restartWindowMs: number;
  closeDrainMs: number;
  autoReady: boolean;
  terminationMode: TerminationMode;
  terminationConfirmTimeoutMs: number;
}> = {}): { pool: Argon2WorkerPool; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const pool = new Argon2WorkerPool({
    workers: options.workers ?? 2,
    credentialLaneCap: options.credentialLaneCap ?? 32,
    auditLaneCap: options.auditLaneCap ?? 96,
    totalCap: options.totalCap ?? 128,
    jobTimeoutMs: options.jobTimeoutMs ?? 10_000,
    restartBudget: options.restartBudget ?? 3,
    restartWindowMs: options.restartWindowMs ?? 60_000,
    closeDrainMs: options.closeDrainMs ?? 50,
    terminationConfirmTimeoutMs: options.terminationConfirmTimeoutMs ?? 200,
    spawn: (index) => {
      const worker = createFakeWorker(
        index, options.autoReady ?? true, false, options.terminationMode ?? "resolve"
      );
      workers.push(worker);
      return worker;
    }
  });
  return { pool, workers };
}

describe("T1 Argon2 worker pool — deterministic capacity and fairness", () => {
  it("runs exactly two jobs at once and queues the rest", async () => {
    const { pool, workers } = makePool();
    await pool.ready();

    const jobs = Array.from({ length: 5 }, () =>
      pool.hashPassword(bytes(8), bytes(16), {
        memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32
      }));
    await flush();

    // One in-flight job per worker: exactly two active, three queued.
    expect(pool.stats().active).toBe(2);
    expect(pool.stats().queuedCredential).toBe(3);
    expect(workers[0]!.received).toHaveLength(1);
    expect(workers[1]!.received).toHaveLength(1);

    // Snapshot before settling: settling pumps the queue, which appends the
    // newly dispatched job to this same array.
    const firstWave = workers.map((worker) => [...worker.received]);
    workers.forEach((worker, index) => {
      for (const job of firstWave[index]!) worker.settle(job.id);
    });
    await flush();

    // Two of the three queued jobs took the freed slots; one still waits.
    expect(pool.stats().active).toBe(2);
    expect(pool.stats().queuedCredential).toBe(1);

    const settledIds = new Set(firstWave.flat().map((job) => job.id));
    for (let round = 0; round < 3; round += 1) {
      for (const worker of workers) {
        for (const job of [...worker.received]) {
          if (settledIds.has(job.id)) continue;
          settledIds.add(job.id);
          worker.settle(job.id);
        }
      }
      await flush();
    }

    const dispatched = workers.flatMap((w) => w.received).filter((j) => j.op === "hash-password");
    expect(dispatched).toHaveLength(5);
    await expect(Promise.all(jobs)).resolves.toHaveLength(5);
    expect(pool.stats().active).toBe(0);
    expect(pool.stats().queuedTotal).toBe(0);
    await pool.close();
  });

  it("enforces the exact credential lane cap and rejects the next job as typed retryable", async () => {
    const { pool } = makePool({ credentialLaneCap: 4, auditLaneCap: 96, totalCap: 128 });
    await pool.ready();

    const accepted = Array.from({ length: 4 }, () =>
      pool.verifyPassword(bytes(8), ENCODED_HASH).catch(() => "rejected"));
    await flush();
    expect(pool.stats().outstandingCredential).toBe(4);

    const overflow = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await expect(overflow).rejects.toBeInstanceOf(Argon2InfrastructureError);
    await expect(overflow).rejects.toMatchObject({
      code: "ARGON2_POOL_CAPACITY_EXHAUSTED",
      retryable: true
    });
    // The audit lane still has room: caps are independent, not shared.
    expect(pool.stats().outstandingAudit).toBe(0);
    await pool.close();
    await Promise.allSettled(accepted);
  });

  it("enforces the exact audit lane cap independently of the credential lane", async () => {
    const { pool } = makePool({ credentialLaneCap: 32, auditLaneCap: 3, totalCap: 128 });
    await pool.ready();
    const accepted = Array.from({ length: 3 }, () =>
      pool.hashAuditContext(bytes(8), bytes(32), {
        memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
      }).catch(() => "rejected"));
    await flush();
    await expect(pool.hashAuditContext(bytes(8), bytes(32), {
      memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
    })).rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });
    await pool.close();
    await Promise.allSettled(accepted);
  });

  it("enforces the total cap even when neither lane cap is reached", async () => {
    const { pool } = makePool({ credentialLaneCap: 32, auditLaneCap: 96, totalCap: 6 });
    await pool.ready();
    const credential = Array.from({ length: 3 }, () =>
      pool.verifyPassword(bytes(8), ENCODED_HASH).catch(() => "rejected"));
    const audit = Array.from({ length: 3 }, () =>
      pool.hashAuditContext(bytes(8), bytes(32), {
        memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
      }).catch(() => "rejected"));
    await flush();
    expect(pool.stats().outstandingTotal).toBe(6);
    expect(pool.stats().outstandingCredential).toBeLessThan(32);
    expect(pool.stats().outstandingAudit).toBeLessThan(96);

    await expect(pool.verifyPassword(bytes(8), ENCODED_HASH))
      .rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });
    await pool.close();
    await Promise.allSettled([...credential, ...audit]);
  });

  it("does not let a credential burst starve the audit lane", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();

    // 6 credential jobs enqueued first, then a single audit job behind them.
    const credential = Array.from({ length: 6 }, () =>
      pool.verifyPassword(bytes(8), ENCODED_HASH).catch(() => "x"));
    const audit = pool.hashAuditContext(bytes(8), bytes(32), {
      memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
    }).catch(() => "x");
    await flush();

    const worker = workers[0]!;
    const dispatchOrder: string[] = [];
    for (let step = 0; step < 7; step += 1) {
      const job = worker.received[step];
      if (job === undefined) break;
      dispatchOrder.push(job.op);
      worker.settle(job.id);
      await flush();
    }

    // Strict alternation: the audit job is dispatched second, not seventh.
    expect(dispatchOrder[0]).toBe("verify-password");
    expect(dispatchOrder[1]).toBe("hash-audit");
    expect(dispatchOrder.indexOf("hash-audit")).toBeLessThan(2);
    await pool.close();
    await Promise.allSettled([...credential, audit]);
  });

  it("does not let audit traffic starve credentials either", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const audit = Array.from({ length: 6 }, () =>
      pool.hashAuditContext(bytes(8), bytes(32), {
        memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
      }).catch(() => "x"));
    const credential = pool.verifyPassword(bytes(8), ENCODED_HASH).catch(() => "x");
    await flush();
    const worker = workers[0]!;
    const order: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      const job = worker.received[step];
      if (job === undefined) break;
      order.push(job.op);
      worker.settle(job.id);
      await flush();
    }
    expect(order.indexOf("verify-password")).toBeLessThan(3);
    expect(order.indexOf("verify-password")).toBeGreaterThanOrEqual(0);
    await pool.close();
    await Promise.allSettled([...audit, credential]);
  });

  it("settles each job exactly once and never resolves a failure as false", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const job = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    const worker = workers[0]!;
    const id = worker.received[0]!.id;

    worker.fail(id);
    await expect(job).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });
    // A duplicate/late frame for the same id must not double-settle.
    worker.settle(id);
    await flush();
    await expect(job).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });
    await pool.close();
  });

  it("uses unpredictable, non-sequential job ids", async () => {
    const { pool, workers } = makePool({ workers: 2 });
    await pool.ready();
    const jobs = Array.from({ length: 4 }, () => pool.verifyPassword(bytes(8), ENCODED_HASH).catch(() => "x"));
    await flush();
    const ids = workers.flatMap((w) => w.received.map((j) => j.id));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set(ids).size).toBe(ids.length);
    await pool.close();
    await Promise.allSettled(jobs);
  });
});

describe("T1 Argon2 worker pool — faults, breaker and close", () => {
  it("rejects the active job once on crash, does not retry it, and replaces the worker", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const active = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    const first = workers[0]!;
    const activeId = first.received[0]!.id;

    first.crash();
    await expect(active).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });
    await flush();

    // A replacement worker exists, and the secret-bearing job was NOT resent.
    expect(workers.length).toBe(2);
    const replacement = workers[1]!;
    replacement.emitReady();
    await flush();
    expect(replacement.received.map((j) => j.id)).not.toContain(activeId);

    // Later queued work still runs on the replacement.
    const later = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    expect(replacement.received).toHaveLength(1);
    replacement.verified(replacement.received[0]!.id, false);
    await expect(later).resolves.toBe(false);
    await pool.close();
  });

  it("trips the rolling restart breaker and fails closed with a generic typed error", async () => {
    let clock = 0;
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 1,
      restartBudget: 3,
      restartWindowMs: 60_000,
      closeDrainMs: 20,
      now: () => clock,
      spawn: (index) => {
        const worker = createFakeWorker(index, true);
        workers.push(worker);
        return worker;
      }
    });
    await pool.ready();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      clock += 1_000;
      const current = workers[workers.length - 1]!;
      current.crash();
      await flush();
      workers[workers.length - 1]?.emitReady();
      await flush();
    }

    expect(pool.stats().breakerTripped).toBe(true);
    const afterTrip = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await expect(afterTrip).rejects.toBeInstanceOf(Argon2InfrastructureError);
    await expect(afterTrip).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    await pool.close();
  });

  it("does not trip the breaker when failures fall outside the rolling window", async () => {
    let clock = 0;
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 3, restartWindowMs: 60_000, closeDrainMs: 20,
      now: () => clock,
      spawn: (index) => { const w = createFakeWorker(index, true); workers.push(w); return w; }
    });
    await pool.ready();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      clock += 61_000;
      workers[workers.length - 1]!.crash();
      await flush();
      workers[workers.length - 1]?.emitReady();
      await flush();
    }
    expect(pool.stats().breakerTripped).toBe(false);
    await pool.close();
  });

  it("times out from dispatch, settles once, and does not retry the secret-bearing job", async () => {
    const { pool, workers } = makePool({ workers: 1, jobTimeoutMs: 20 });
    await pool.ready();
    const job = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    const id = workers[0]!.received[0]!.id;
    await expect(job).rejects.toMatchObject({ code: "ARGON2_JOB_TIMEOUT" });
    await flush();
    const resent = workers.flatMap((w) => w.received).filter((j) => j.id === id);
    expect(resent).toHaveLength(1);
    await pool.close();
  });

  it("closes idempotently through OPEN -> CLOSING -> CLOSED and leaves no hung promise", async () => {
    const { pool, workers } = makePool({ workers: 2, closeDrainMs: 20 });
    await pool.ready();
    expect(pool.stats().state).toBe("OPEN");

    const active = Array.from({ length: 2 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    const queued = Array.from({ length: 3 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    expect(pool.stats().queuedTotal).toBe(3);

    const first = pool.close();
    const second = pool.close();
    expect(first).toBe(second);
    await first;

    expect(pool.stats().state).toBe("CLOSED");
    for (const promise of [...active, ...queued]) {
      expect(await settled(promise)).toBe("rejected");
      await expect(promise).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    }
    for (const worker of workers) expect(worker.terminated()).toBeGreaterThanOrEqual(1);

    // New work after close is refused, not silently accepted.
    await expect(pool.verifyPassword(bytes(8), ENCODED_HASH))
      .rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
  });

  it("never emits secrets in an error message or a dispatched frame", async () => {
    const secret = "s3cr3t-password-value";
    const { pool, workers } = makePool({ workers: 1, jobTimeoutMs: 20 });
    await pool.ready();
    const job = pool.verifyPassword(new TextEncoder().encode(secret), ENCODED_HASH);
    await flush();
    const error = await job.catch((cause: unknown) => cause);
    const serialized = `${String((error as Error).message)}${JSON.stringify(workers[0]!.received)}`;
    expect(serialized).not.toContain(secret);
    expect((error as Error).message).toBe("ARGON2_JOB_TIMEOUT");
    await pool.close();
  });
});

// --------------------------------------------------------------------------
// Per-IP audit cache: privacy, bounds, coalescing and rotation.
// --------------------------------------------------------------------------
function countingExecutor(): Argon2Executor & {
  readonly calls: { domainAndValue: string }[];
  release(): void;
  failNext(): void;
} {
  const calls: { domainAndValue: string }[] = [];
  let gate: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  let shouldFail = false;
  return {
    calls,
    release() { gate?.(); gate = undefined; pending = undefined; },
    failNext() { shouldFail = true; },
    async hashPassword() { throw new Error("unused"); },
    async verifyPassword() { throw new Error("unused"); },
    async hashAuditContext(value: Uint8Array): Promise<string> {
      const decoded = new TextDecoder().decode(value);
      calls.push({ domainAndValue: decoded });
      if (pending !== undefined) await pending;
      if (shouldFail) {
        shouldFail = false;
        throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED");
      }
      // Deterministic and unique per (domain+value) so equality proves identity.
      return Buffer.from(decoded).toString("hex").padEnd(64, "0").slice(0, 64);
    }
  } as Argon2Executor & { calls: { domainAndValue: string }[]; release(): void; failNext(): void };
}

describe("T1 per-IP audit KDF cache", () => {
  it("returns a byte-identical hit without recomputing", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    const first = await hasher.hashSourceIp("203.0.113.7");
    const second = await hasher.hashSourceIp("203.0.113.7");
    expect(second).toBe(first);
    expect(executor.calls).toHaveLength(1);
    hasher.close();
  });

  it("never caches the user agent, even for a repeated value", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    await hasher.hashUserAgent("Mozilla/5.0");
    await hasher.hashUserAgent("Mozilla/5.0");
    expect(executor.calls).toHaveLength(2);
    expect(hasher.cacheSize()).toBe(0);
    hasher.close();
  });

  it("separates the IP and user-agent domains for an identical value", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    const asIp = await hasher.hashSourceIp("same-value");
    const asUserAgent = await hasher.hashUserAgent("same-value");
    expect(asIp).not.toBe(asUserAgent);
    expect(executor.calls[0]!.domainAndValue).toContain("audit-source-ip");
    expect(executor.calls[1]!.domainAndValue).toContain("audit-user-agent");
    hasher.close();
  });

  it("expires on an absolute TTL that a hit never extends", async () => {
    let clock = 1_000;
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      ttlMs: 60_000, now: () => clock
    });
    await hasher.hashSourceIp("198.51.100.9");
    clock += 59_000;
    await hasher.hashSourceIp("198.51.100.9");
    expect(executor.calls).toHaveLength(1);
    // The hit at t+59s must NOT push expiry out to t+119s.
    clock += 1_500;
    await hasher.hashSourceIp("198.51.100.9");
    expect(executor.calls).toHaveLength(2);
    hasher.close();
  });

  it("evicts true LRU and never exceeds the exact capacity", async () => {
    let clock = 0;
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      capacity: 3, ttlMs: 10_000_000, now: () => { clock += 1; return clock; }
    });
    await hasher.hashSourceIp("ip-a");
    await hasher.hashSourceIp("ip-b");
    await hasher.hashSourceIp("ip-c");
    expect(hasher.cacheSize()).toBeLessThanOrEqual(3);
    // Touch a so that b becomes least-recently-used.
    await hasher.hashSourceIp("ip-a");
    const before = executor.calls.length;
    await hasher.hashSourceIp("ip-d");
    expect(hasher.cacheSize()).toBeLessThanOrEqual(3);
    // a was refreshed, so it must still be a hit; b was the LRU victim.
    await hasher.hashSourceIp("ip-a");
    expect(executor.calls.length).toBe(before + 1);
    hasher.close();
  });

  it("coalesces identical in-flight misses into one derivation", async () => {
    const executor = countingExecutor();
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    const slow: Argon2Executor = {
      hashPassword: executor.hashPassword.bind(executor),
      verifyPassword: executor.verifyPassword.bind(executor),
      async hashAuditContext(value, salt, parameters) {
        await gate;
        return executor.hashAuditContext(value, salt, parameters);
      }
    };
    const hasher = new AuditContextHasher(slow, SALT, auditKdf);
    const a = hasher.hashSourceIp("203.0.113.42");
    const b = hasher.hashSourceIp("203.0.113.42");
    const c = hasher.hashSourceIp("203.0.113.42");
    unblock();
    const results = await Promise.all([a, b, c]);
    expect(new Set(results).size).toBe(1);
    expect(executor.calls).toHaveLength(1);
    hasher.close();
  });

  it("never caches an error and does not leave a rejected in-flight entry", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    executor.failNext();
    await expect(hasher.hashSourceIp("203.0.113.99")).rejects.toBeInstanceOf(Argon2InfrastructureError);
    expect(hasher.cacheSize()).toBe(0);
    // The next attempt recomputes rather than replaying the failure.
    await expect(hasher.hashSourceIp("203.0.113.99")).resolves.toMatch(/^[0-9a-f]{64}$/);
    hasher.close();
  });

  it("misses after a salt rotation and after a parameter change", async () => {
    const executor = countingExecutor();
    const first = new AuditContextHasher(executor, SALT, auditKdf);
    const original = await first.hashSourceIp("203.0.113.7");

    const rotated = new AuditContextHasher(executor, Buffer.alloc(32, 0x11), auditKdf);
    await rotated.hashSourceIp("203.0.113.7");
    expect(executor.calls).toHaveLength(2);

    const reparameterized = new AuditContextHasher(
      executor, SALT, { ...auditKdf, iterations: 3 }
    );
    await reparameterized.hashSourceIp("203.0.113.7");
    expect(executor.calls).toHaveLength(3);
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    first.close();
    rotated.close();
    reparameterized.close();
  });

  it("binds the salt fingerprint and every KDF parameter into the cache key", async () => {
    // The behavioural rotation test above uses two hashers, so it would "miss"
    // even if the key ignored the salt entirely — each instance starts with an
    // empty cache and its own random HMAC key. This test isolates the KEY
    // COMPOSITION by holding the HMAC key constant and varying one input at a
    // time, so omitting the fingerprint or a parameter is directly detectable.
    const executor = countingExecutor();
    const reference = new AuditContextHasher(executor, SALT, auditKdf);
    const sharedKey = (reference as unknown as { cacheKey: Buffer }).cacheKey;
    const locatorOf = (hasher: AuditContextHasher, ip: string): string => {
      (hasher as unknown as { cacheKey: Buffer }).cacheKey = sharedKey;
      return (hasher as unknown as { locator(value: string): string }).locator(ip);
    };

    const ip = "203.0.113.7";
    const base = locatorOf(reference, ip);

    // Same everything => same locator (so the comparisons below are meaningful).
    expect(locatorOf(new AuditContextHasher(executor, SALT, auditKdf), ip)).toBe(base);

    // A different salt must change the locator.
    expect(locatorOf(new AuditContextHasher(executor, Buffer.alloc(32, 0x11), auditKdf), ip))
      .not.toBe(base);

    // Every KDF parameter must change the locator.
    for (const override of [
      { memoryCostKiB: 32_768 },
      { iterations: 3 },
      { parallelism: 2 },
      { hashLength: 32 as const }
    ]) {
      const changed = { ...auditKdf, ...override };
      const locator = locatorOf(new AuditContextHasher(executor, SALT, changed), ip);
      if (JSON.stringify(changed) === JSON.stringify(auditKdf)) continue;
      expect(locator).not.toBe(base);
    }

    // A different IP must change the locator.
    expect(locatorOf(reference, "203.0.113.8")).not.toBe(base);
    reference.close();
  });

  it("keys the map opaquely: never plaintext IP and never an unkeyed digest", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    const ip = "203.0.113.77";
    await hasher.hashSourceIp(ip);

    const internals = hasher as unknown as { entries: Map<string, unknown> };
    const keys = [...internals.entries.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(ip);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);

    // Not an unkeyed digest of any obvious canonical input.
    const { createHash } = await import("node:crypto");
    for (const candidate of [ip, `debateai:audit-source-ip:v1\0${ip}`]) {
      expect(keys[0]).not.toBe(createHash("sha256").update(candidate).digest("hex"));
    }
    // The locator is not the persisted digest either.
    const digest = await hasher.hashSourceIp(ip);
    expect(keys[0]).not.toBe(digest);
    hasher.close();
  });

  it("uses an independent random key per hasher, so a locator is process-local", async () => {
    const executor = countingExecutor();
    const a = new AuditContextHasher(executor, SALT, auditKdf);
    const b = new AuditContextHasher(executor, SALT, auditKdf);
    await a.hashSourceIp("203.0.113.7");
    await b.hashSourceIp("203.0.113.7");
    const keyOf = (h: AuditContextHasher): string =>
      [...(h as unknown as { entries: Map<string, unknown> }).entries.keys()][0]!;
    expect(keyOf(a)).not.toBe(keyOf(b));
    a.close();
    b.close();
  });

  it("clears entries on close and refuses further use", async () => {
    const executor = countingExecutor();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf);
    await hasher.hashSourceIp("203.0.113.7");
    expect(hasher.cacheSize()).toBe(1);
    hasher.close();
    expect(hasher.cacheSize()).toBe(0);
    hasher.close();
    await expect(hasher.hashSourceIp("203.0.113.7")).rejects.toBeTruthy();
  });

  it("bypasses insertion rather than exceeding the cap when capacity is all in-flight", async () => {
    const executor = countingExecutor();
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    const slow: Argon2Executor = {
      hashPassword: executor.hashPassword.bind(executor),
      verifyPassword: executor.verifyPassword.bind(executor),
      async hashAuditContext(value, salt, parameters) {
        await gate;
        return executor.hashAuditContext(value, salt, parameters);
      }
    };
    const hasher = new AuditContextHasher(slow, SALT, auditKdf, { capacity: 2 });
    const pending = [
      hasher.hashSourceIp("ip-1"),
      hasher.hashSourceIp("ip-2"),
      hasher.hashSourceIp("ip-3"),
      hasher.hashSourceIp("ip-4")
    ];
    expect(hasher.cacheSize()).toBeLessThanOrEqual(2);
    unblock();
    const results = await Promise.all(pending);
    expect(results.every((digest) => /^[0-9a-f]{64}$/.test(digest))).toBe(true);
    expect(hasher.cacheSize()).toBeLessThanOrEqual(2);
    hasher.close();
  });
});

describe("T1 password derivation is never cached", () => {
  const passwordKdf = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.argon2id;

  it("draws a fresh salt for every hash of the same password", async () => {
    const salts: string[] = [];
    const executor: Argon2Executor = {
      async hashPassword(_password, salt) {
        const hex = Buffer.from(salt).toString("hex");
        salts.push(hex);
        return `$argon2id$v=19$m=65536,t=3,p=1$${hex}`;
      },
      async verifyPassword() { return false; },
      async hashAuditContext() { return "0".repeat(64); }
    };

    const first = await hashPassword(executor, "same-password", passwordKdf);
    const second = await hashPassword(executor, "same-password", passwordKdf);

    // A cached password hash would reuse the salt and return an identical
    // encoding; a fresh 16-byte salt per call is what makes that detectable.
    expect(salts).toHaveLength(2);
    expect(salts[0]).not.toBe(salts[1]);
    expect(first).not.toBe(second);
    expect(salts[0]).toHaveLength(32);
  });

  it("reaches the executor on every verification, with no memoised answer", async () => {
    let calls = 0;
    const executor: Argon2Executor = {
      async hashPassword() { return ENCODED_HASH; },
      async verifyPassword() { calls += 1; return true; },
      async hashAuditContext() { return "0".repeat(64); }
    };
    await verifyPassword(executor, ENCODED_HASH, "pw");
    await verifyPassword(executor, ENCODED_HASH, "pw");
    expect(calls).toBe(2);
  });
});

// ==========================================================================
// REWORK 1 — binding Sol xHigh findings.
// Every block below was written against a reproduction of the defect it pins.
// ==========================================================================

describe("T1 rework1 P1-A — verification distinguishes a bad password from a broken verifier", () => {
  const IN_ENVELOPE = ENCODED_HASH;

  function recordingExecutor(answer: () => Promise<boolean>): Argon2Executor & { calls: number } {
    const executor = {
      calls: 0,
      async hashPassword() { return IN_ENVELOPE; },
      async verifyPassword() { executor.calls += 1; return answer(); },
      async hashAuditContext() { return AUDIT_DIGEST; }
    };
    return executor as Argon2Executor & { calls: number };
  }

  it("refuses a malformed, wrong-algorithm or wrong-version encoding before any compute", async () => {
    const executor = recordingExecutor(async () => true);
    for (const stored of [
      "", "$argon2id$", "$argon2id$not-an-encoding", "not-a-hash",
      IN_ENVELOPE.replace("$argon2id$", "$argon2d$"),
      IN_ENVELOPE.replace("$argon2id$", "$argon2i$"),
      IN_ENVELOPE.replace("v=19", "v=16"),
      IN_ENVELOPE + "$extra"
    ]) {
      await expect(verifyPassword(executor, stored, "pw")).resolves.toBe(false);
    }
    // Not one of them reached a memory-hard compute.
    expect(executor.calls).toBe(0);
  });

  it("refuses embedded costs outside the accepted policy envelope, at every edge", async () => {
    const executor = recordingExecutor(async () => true);
    const bounds = ARGON2ID_ENCODING_BOUNDS;
    const outside = [
      IN_ENVELOPE.replace(/m=\d+/, `m=${bounds.minMemoryCostKiB - 1}`),
      IN_ENVELOPE.replace(/m=\d+/, `m=${bounds.maxMemoryCostKiB + 1}`),
      IN_ENVELOPE.replace(/m=\d+/, "m=2097152"),
      IN_ENVELOPE.replace(/m=\d+/, "m=999999999"),
      IN_ENVELOPE.replace(/t=\d+/, `t=${bounds.minTimeCost - 1}`),
      IN_ENVELOPE.replace(/t=\d+/, `t=${bounds.maxTimeCost + 1}`),
      IN_ENVELOPE.replace(/p=\d+/, `p=${bounds.minParallelism - 1}`),
      IN_ENVELOPE.replace(/p=\d+/, `p=${bounds.maxParallelism + 1}`),
      // Salt and output length are bounded too: a 1 KiB "salt" or a 1 KiB
      // output is not something the accepted policy can have produced.
      IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/, `$${"A".repeat(20)}$${"A".repeat(43)}`),
      IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(43 * 3)}`),
      IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(4)}`)
    ];
    for (const stored of outside) {
      expect(parseEncodedArgon2id(stored)).toBeUndefined();
      await expect(verifyPassword(executor, stored, "pw")).resolves.toBe(false);
    }
    expect(executor.calls).toBe(0);
    // And the in-envelope edges are still accepted, so the bound is not vacuous.
    for (const inside of [
      IN_ENVELOPE.replace(/m=\d+/, `m=${bounds.minMemoryCostKiB}`),
      IN_ENVELOPE.replace(/m=\d+/, `m=${bounds.maxMemoryCostKiB}`),
      IN_ENVELOPE.replace(/t=\d+/, `t=${bounds.minTimeCost}`),
      IN_ENVELOPE.replace(/t=\d+/, `t=${bounds.maxTimeCost}`),
      IN_ENVELOPE.replace(/p=\d+/, `p=${bounds.minParallelism}`),
      IN_ENVELOPE.replace(/p=\d+/, `p=${bounds.maxParallelism}`)
    ]) {
      expect(parseEncodedArgon2id(inside)).toBeDefined();
    }
    expect(executor.calls).toBe(0);
  });

  it("returns false for a genuine password mismatch", async () => {
    const executor = recordingExecutor(async () => false);
    await expect(verifyPassword(executor, IN_ENVELOPE, "wrong")).resolves.toBe(false);
    expect(executor.calls).toBe(1);
  });

  it("never turns a verifier infrastructure failure into false", async () => {
    for (const code of [
      "ARGON2_POOL_CAPACITY_EXHAUSTED", "ARGON2_POOL_UNAVAILABLE",
      "ARGON2_WORKER_FAILED", "ARGON2_JOB_TIMEOUT"
    ] as const) {
      const executor = recordingExecutor(async () => { throw new Argon2InfrastructureError(code); });
      const outcome = await verifyPassword(executor, IN_ENVELOPE, "correct")
        .then((value) => ({ resolved: value }), (error: unknown) => ({ error }));
      // A `false` here would become a 401 for a user whose password is right.
      expect(outcome).not.toMatchObject({ resolved: false });
      expect((outcome as { error: unknown }).error).toBeInstanceOf(Argon2InfrastructureError);
      expect((outcome as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it("refuses an out-of-envelope stored hash without occupying a worker slot", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const password = new TextEncoder().encode("correct horse battery staple");
    await expect(pool.verifyPassword(password, IN_ENVELOPE.replace(/m=\d+/, "m=2097152")))
      .resolves.toBe(false);
    await flush();
    expect(workers[0]!.received).toHaveLength(0);
    expect(pool.stats().outstandingTotal).toBe(0);
    // The caller's plaintext is zeroed on the refusal path too.
    expect([...password].every((byte) => byte === 0)).toBe(true);
    await pool.close();
  });
});

describe("T1 rework1 P1-B — replacement never exceeds the physical worker bound", () => {
  function barrierPool(hangFirst = true): {
    pool: Argon2WorkerPool;
    workers: FakeWorker[];
  } {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 2, closeDrainMs: 50,
      spawn: (index) => {
        const worker = createFakeWorker(index, true, hangFirst && workers.length === 0);
        workers.push(worker);
        return worker;
      }
    });
    return { pool, workers };
  }

  it("constructs no replacement until the dead worker's termination is confirmed", async () => {
    const { pool, workers } = barrierPool();
    await pool.ready();
    expect(pool.stats().liveHandles).toBe(2);

    workers[0]!.crash();
    await flush(12);

    // The 64 MiB arena of the dead worker is still mapped: a replacement here
    // would put three physical workers behind a two-worker bound.
    expect(workers[0]!.isAlive()).toBe(true);
    expect(workers).toHaveLength(2);
    expect(pool.stats().liveHandles).toBe(2);
    expect(pool.stats().retiringHandles).toBe(1);

    workers[0]!.releaseTermination();
    await flush(12);
    expect(workers[0]!.isAlive()).toBe(false);
    expect(workers).toHaveLength(3);
    expect(pool.stats().liveHandles).toBe(2);
    expect(pool.stats().retiringHandles).toBe(0);
    await pool.close();
  });

  it("collapses racing loss events into exactly one retirement and one replacement", async () => {
    const { pool, workers } = barrierPool();
    await pool.ready();
    // error, exit and a second error all racing on the same generation.
    workers[0]!.crash();
    workers[0]!.crash();
    workers[0]!.crash();
    await flush(12);
    expect(workers[0]!.terminated()).toBe(1);
    expect(workers).toHaveLength(2);
    expect(pool.stats().restartsInWindow).toBe(1);
    workers[0]!.releaseTermination();
    await flush(12);
    expect(workers).toHaveLength(3);
    expect(pool.stats().restartsInWindow).toBe(1);
    await pool.close();
  });

  it("close() waits for a retiring handle and then leaves zero workers and zero jobs", async () => {
    const { pool, workers } = barrierPool();
    await pool.ready();
    workers[0]!.crash();
    await flush(12);

    let closed = false;
    const closing = pool.close().then(() => { closed = true; });
    await flush(20);
    // The retiring handle is still alive, so close is NOT done.
    expect(closed).toBe(false);
    expect(workers[0]!.isAlive()).toBe(true);
    // ...and close forced one more terminate on it rather than just waiting.
    expect(workers[0]!.terminated()).toBeGreaterThanOrEqual(2);

    workers[0]!.releaseTermination();
    await closing;
    expect(closed).toBe(true);
    expect(pool.stats().state).toBe("CLOSED");
    expect(pool.stats().liveHandles).toBe(0);
    expect(pool.stats().retiringHandles).toBe(0);
    expect(pool.stats().outstandingTotal).toBe(0);
    expect(workers.every((worker) => !worker.isAlive())).toBe(true);
  });

  it("settles every active and queued job when a retiring handle blocks close", async () => {
    const { pool, workers } = barrierPool();
    await pool.ready();
    workers[0]!.crash();
    await flush(12);
    const jobs = Array.from({ length: 4 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    const closing = pool.close();
    await flush(20);
    workers[0]!.releaseTermination();
    await closing;
    for (const job of jobs) {
      await expect(job).rejects.toBeInstanceOf(Argon2InfrastructureError);
    }
    expect(pool.stats().outstandingTotal).toBe(0);
  });
});

describe("T1 rework1 P1-C — construction and startup failure fail closed without hangs", () => {
  it("retries a synchronous constructor throw under the restart budget", async () => {
    let attempts = 0;
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 3, closeDrainMs: 20,
      spawn: (index) => {
        attempts += 1;
        if (attempts === 1) throw new Error("EAGAIN: cannot create thread");
        return createFakeWorker(index, true);
      }
    });
    await expect(pool.ready()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(pool.stats().readyWorkers).toBe(1);
    await pool.close();
  });

  it("rejects readiness and queued work exactly once when the constructor keeps throwing", async () => {
    let attempts = 0;
    const pool = new Argon2WorkerPool({
      workers: 2, restartBudget: 3, closeDrainMs: 20,
      spawn: () => { attempts += 1; throw new Error("EAGAIN: cannot create thread"); }
    });
    // Bounded by the restart budget, not unbounded, and not abandoned.
    expect(attempts).toBe(4);
    expect(pool.stats().breakerTripped).toBe(true);

    const ready = pool.ready();
    await expect(ready).rejects.toBeInstanceOf(Argon2InfrastructureError);
    await expect(ready).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    // Repeated awaits observe the same single settlement.
    await expect(pool.ready()).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });

    for (const job of [
      pool.hashPassword(bytes(8), bytes(16), {
        memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32
      }),
      pool.verifyPassword(bytes(8), ENCODED_HASH),
      pool.hashAuditContext(bytes(8), bytes(32), {
        memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32
      })
    ]) {
      await expect(job).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    }
    await pool.close();
  });

  it("bounds the ready handshake and routes expiry through terminate-before-replace", async () => {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 3, readyHandshakeTimeoutMs: 25, closeDrainMs: 20,
      spawn: (index) => {
        // The first worker never handshakes; its replacement does.
        const worker = createFakeWorker(index, workers.length >= 1);
        workers.push(worker);
        return worker;
      }
    });
    await expect(pool.ready()).resolves.toBeUndefined();
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated()).toBe(1);
    expect(workers[0]!.isAlive()).toBe(false);
    expect(pool.stats().readyWorkers).toBe(1);
    await pool.close();
  });

  it("fails readiness closed when no worker ever handshakes", async () => {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 2, readyHandshakeTimeoutMs: 20, closeDrainMs: 20,
      spawn: (index) => {
        const worker = createFakeWorker(index, false);
        workers.push(worker);
        return worker;
      }
    });
    // The real budget here is three handshake attempts at the ruled 20 ms, so
    // correct code must settle readiness in well under a second. This watchdog
    // is the failure detector for the ONE defect this test exists to catch - a
    // readiness promise that never settles - and it names that mechanism in the
    // output instead of leaning on vitest's generic 120 s backstop, which is
    // ~24x slower and indistinguishable from any other hang. The timer is
    // cleared in `finally` so a correct run leaves no unhandled rejection.
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const hang = new Promise<never>((_resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error("READY_HANDSHAKE_HANG")), 5_000);
    });
    try {
      // `ready()` is folded into a value so that a wrong RESOLVE fails the
      // assertion below just as loudly as a wrong rejection code does.
      const settled = await Promise.race([
        pool.ready().then(() => undefined, (error: unknown) => error),
        hang
      ]);
      expect(settled).toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    } finally {
      clearTimeout(watchdog);
    }
    expect(workers.length).toBeGreaterThan(1);
    expect(workers.every((worker) => worker.terminated() >= 1)).toBe(true);
    await pool.close();
  });

  it("crashes before ready, and after ready with an active job, without hanging anything", async () => {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 5, readyHandshakeTimeoutMs: 5_000, closeDrainMs: 20,
      spawn: (index) => {
        const worker = createFakeWorker(index, workers.length !== 0);
        workers.push(worker);
        return worker;
      }
    });
    // Crash BEFORE the handshake: the slot must recover, not stall.
    workers[0]!.crash();
    await expect(pool.ready()).resolves.toBeUndefined();
    expect(workers).toHaveLength(2);

    // Crash WITH an active job: rejected once, never retried.
    const active = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    const activeId = workers[1]!.received[0]!.id;
    workers[1]!.crash();
    await expect(active).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });
    await flush(8);
    expect(workers.flatMap((worker) => worker.received).filter((job) => job.id === activeId))
      .toHaveLength(1);

    // A job queued behind the crash still runs on the replacement.
    const later = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush(8);
    const replacement = workers[workers.length - 1]!;
    expect(replacement.received).toHaveLength(1);
    replacement.verified(replacement.received[0]!.id, false);
    await expect(later).resolves.toBe(false);
    await pool.close();
  });

  it("rejects queued work exactly once when the breaker opens mid-queue", async () => {
    const workers: FakeWorker[] = [];
    let clock = 0;
    const pool = new Argon2WorkerPool({
      workers: 1, restartBudget: 2, restartWindowMs: 60_000, closeDrainMs: 20,
      now: () => clock,
      spawn: (index) => {
        const worker = createFakeWorker(index, true);
        workers.push(worker);
        return worker;
      }
    });
    await pool.ready();
    const settlements: string[] = [];
    const queued = Array.from({ length: 5 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.then(() => settlements.push("resolved"),
        (error: unknown) => settlements.push((error as { code: string }).code));
      return promise;
    });
    await flush();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      clock += 1_000;
      workers[workers.length - 1]!.crash();
      await flush(8);
    }
    await flush(8);
    expect(pool.stats().breakerTripped).toBe(true);
    await Promise.allSettled(queued);
    // Five jobs, five settlements: no double-settle, no hang.
    expect(settlements).toHaveLength(5);
    expect(settlements.every((code) => code.startsWith("ARGON2_"))).toBe(true);
    expect(pool.stats().outstandingTotal).toBe(0);
    await pool.close();
  });
});

describe("T1 rework1 P1-D — the exact production capacity contract", () => {
  const PASSWORD_KDF = { memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 };
  const AUDIT_KDF = { memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32 };

  /** The real shipped bounds, with only the worker construction faked. */
  function productionPool(): { pool: Argon2WorkerPool; workers: FakeWorker[] } {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      closeDrainMs: 50,
      spawn: (index) => {
        const worker = createFakeWorker(index, true);
        workers.push(worker);
        return worker;
      }
    });
    return { pool, workers };
  }

  it("runs exactly 2 concurrently and rejects the credential lane's N+Q+1'th job", async () => {
    const bounds = ARGON2_PROVISIONAL_BOUNDS;
    expect([bounds.workers, bounds.credentialLaneCap, bounds.auditLaneCap, bounds.totalCap])
      .toEqual([2, 32, 96, 128]);
    // The two lane caps partition the total exactly; nothing is double-counted.
    expect(bounds.credentialLaneCap + bounds.auditLaneCap).toBe(bounds.totalCap);

    const { pool, workers } = productionPool();
    await pool.ready();
    expect(pool.stats().workers).toBe(2);
    expect(pool.stats().liveHandles).toBe(2);

    const accepted = Array.from({ length: bounds.credentialLaneCap }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    expect(pool.stats().active).toBe(bounds.workers);
    expect(pool.stats().outstandingCredential).toBe(bounds.credentialLaneCap);
    expect(pool.stats().queuedCredential).toBe(bounds.credentialLaneCap - bounds.workers);
    expect(workers.every((worker) => worker.received.length === 1)).toBe(true);

    const overflow = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await expect(overflow).rejects.toBeInstanceOf(Argon2InfrastructureError);
    await expect(overflow).rejects.toMatchObject({
      code: "ARGON2_POOL_CAPACITY_EXHAUSTED", retryable: true
    });
    // Refusal did not disturb the accepted set.
    expect(pool.stats().outstandingCredential).toBe(bounds.credentialLaneCap);
    await pool.close();
    await Promise.allSettled(accepted);
  });

  it("rejects the audit lane's N+Q+1'th job, and the total cap's, at the exact shipped numbers", async () => {
    const bounds = ARGON2_PROVISIONAL_BOUNDS;
    const { pool } = productionPool();
    await pool.ready();

    const audit = Array.from({ length: bounds.auditLaneCap }, () => {
      const promise = pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    expect(pool.stats().outstandingAudit).toBe(bounds.auditLaneCap);
    await expect(pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF))
      .rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });

    // The credential lane is untouched by a saturated audit lane...
    const credential = Array.from({ length: bounds.credentialLaneCap }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    expect(pool.stats().outstandingCredential).toBe(bounds.credentialLaneCap);
    // ...and together they sit exactly on the total cap, so job 129 is refused.
    expect(pool.stats().outstandingTotal).toBe(bounds.totalCap);
    await expect(pool.verifyPassword(bytes(8), ENCODED_HASH))
      .rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });
    await expect(pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF))
      .rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });

    await pool.close();
    await Promise.allSettled([...audit, ...credential]);
  });

  it("zeroes the payload of a capacity-refused job before it is ever retained", async () => {
    const { pool } = productionPool();
    await pool.ready();
    const accepted = Array.from({ length: ARGON2_PROVISIONAL_BOUNDS.credentialLaneCap }, () => {
      const promise = pool.hashPassword(bytes(8), bytes(16), PASSWORD_KDF);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    const password = new TextEncoder().encode("correct horse battery staple");
    const salt = new Uint8Array(16).fill(9);
    await expect(pool.hashPassword(password, salt, PASSWORD_KDF))
      .rejects.toMatchObject({ code: "ARGON2_POOL_CAPACITY_EXHAUSTED" });
    expect([...password].every((byte) => byte === 0)).toBe(true);
    expect([...salt].every((byte) => byte === 0)).toBe(true);
    await pool.close();
    await Promise.allSettled(accepted);
  });

  it("removes and zeroes every still-queued payload when the pool closes", async () => {
    const { pool } = productionPool();
    await pool.ready();
    const payloads = Array.from({ length: 6 }, () => ({
      password: new TextEncoder().encode("correct horse battery staple"),
      salt: new Uint8Array(16).fill(3)
    }));
    const jobs = payloads.map((payload) => {
      const promise = pool.hashPassword(payload.password, payload.salt, PASSWORD_KDF);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    // Two dispatched (their buffers are detached by transfer), four queued.
    expect(pool.stats().queuedCredential).toBe(4);

    await pool.close();
    for (const job of jobs) {
      await expect(job).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    }
    expect(pool.stats().queuedTotal).toBe(0);
    expect(pool.stats().outstandingTotal).toBe(0);
    // No queue node still points at a payload, and no payload survives with a
    // readable byte in it: a dispatched buffer is detached by transfer, a
    // queued one is zeroed in place when its job is settled.
    const unreadable = (view: Uint8Array): boolean =>
      view.byteLength === 0 || view.every((byte) => byte === 0);
    let detached = 0;
    let zeroed = 0;
    for (const payload of payloads) {
      expect(unreadable(payload.password)).toBe(true);
      expect(unreadable(payload.salt)).toBe(true);
      if (payload.password.byteLength === 0) detached += 1; else zeroed += 1;
    }
    expect(detached).toBe(2);
    expect(zeroed).toBe(4);
  });
});

describe("T1 rework1 P1-D — operation-bound protocol validation", () => {
  const PASSWORD_KDF = { memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 };
  const AUDIT_KDF = { memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32 };

  async function submitAndReply(
    op: "hash-password" | "hash-audit" | "verify-password",
    frameFor: (id: string) => unknown
  ): Promise<{ outcome: unknown; workers: FakeWorker[]; pool: Argon2WorkerPool }> {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const job = op === "hash-password"
      ? pool.hashPassword(bytes(8), bytes(16), PASSWORD_KDF)
      : op === "hash-audit"
        ? pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF)
        : pool.verifyPassword(bytes(8), ENCODED_HASH);
    const settlement = job.then(
      (value) => ({ settled: "resolved" as const, value }),
      (error: unknown) => ({ settled: "rejected" as const, code: (error as { code: string }).code })
    );
    await flush();
    workers[0]!.raw(frameFor(workers[0]!.received[0]!.id));
    return { outcome: await settlement, workers, pool };
  }

  const mutants: readonly {
    label: string;
    op: "hash-password" | "hash-audit" | "verify-password";
    frame: (id: string) => unknown;
  }[] = [
    { label: "an arbitrary string as a password hash", op: "hash-password",
      frame: (id) => ({ kind: "result", id, digest: "pwned" }) },
    { label: "an empty password digest", op: "hash-password",
      frame: (id) => ({ kind: "result", id, digest: "" }) },
    { label: "an encoded hash outside the accepted envelope", op: "hash-password",
      frame: (id) => ({ kind: "result", id, digest: ENCODED_HASH.replace(/m=\d+/, "m=2097152") }) },
    { label: "a non-string password digest", op: "hash-password",
      frame: (id) => ({ kind: "result", id, digest: 42 }) },
    { label: "a verified frame answering a hash job", op: "hash-password",
      frame: (id) => ({ kind: "verified", id, matches: true }) },
    { label: "a non-hex audit digest", op: "hash-audit",
      frame: (id) => ({ kind: "result", id, digest: "not-a-digest" }) },
    { label: "an audit digest of the wrong length", op: "hash-audit",
      frame: (id) => ({ kind: "result", id, digest: "ab".repeat(16) }) },
    { label: "an uppercase-hex audit digest", op: "hash-audit",
      frame: (id) => ({ kind: "result", id, digest: "AB".repeat(32) }) },
    { label: "a result frame answering a verify job", op: "verify-password",
      frame: (id) => ({ kind: "result", id, digest: ENCODED_HASH }) },
    { label: "a non-boolean matches value", op: "verify-password",
      frame: (id) => ({ kind: "verified", id, matches: "true" }) },
    { label: "a frame with no id at all", op: "verify-password",
      frame: () => ({ kind: "verified", matches: true }) },
    { label: "an unsolicited frame for an id never dispatched", op: "hash-password",
      frame: () => ({ kind: "result", id: "deadbeef", digest: ENCODED_HASH }) },
    { label: "a non-object frame", op: "hash-password", frame: () => "surprise" }
  ];

  for (const mutant of mutants) {
    it(`treats ${mutant.label} as a protocol fault, not a settlement`, async () => {
      const { outcome, workers, pool } = await submitAndReply(mutant.op, mutant.frame);
      expect(outcome).toMatchObject({ settled: "rejected", code: "ARGON2_WORKER_FAILED" });
      // The worker is no longer trusted: it is retired and replaced.
      await flush(12);
      expect(workers[0]!.terminated()).toBe(1);
      expect(workers.length).toBeGreaterThan(1);
      await pool.close();
    });
  }

  it("accepts the lawful response shape for each operation, and replaces nothing", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const worker = workers[0]!;

    const hash = pool.hashPassword(bytes(8), bytes(16), PASSWORD_KDF);
    await flush();
    // The lawful reply is the one bound to THIS request's costs and salt, not
    // merely some in-envelope encoding (see rework2 RED 3).
    const lawful = lawfulPasswordEncoding(worker.received[0]!);
    worker.raw({ kind: "result", id: worker.received[0]!.id, digest: lawful });
    await expect(hash).resolves.toBe(lawful);

    const audit = pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF);
    await flush();
    worker.raw({ kind: "result", id: worker.received[1]!.id, digest: AUDIT_DIGEST });
    await expect(audit).resolves.toBe(AUDIT_DIGEST);

    const verify = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    worker.raw({ kind: "verified", id: worker.received[2]!.id, matches: true });
    await expect(verify).resolves.toBe(true);

    const failed = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    worker.raw({ kind: "failed", id: worker.received[3]!.id, code: "ARGON2_WORKER_JOB_FAILED" });
    await expect(failed).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });

    await flush(12);
    expect(workers).toHaveLength(1);
    expect(worker.terminated()).toBe(0);
    await pool.close();
  });

  it("ignores a duplicate late frame for the job it just settled", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const job = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    const id = workers[0]!.received[0]!.id;
    workers[0]!.verified(id, false);
    await expect(job).resolves.toBe(false);
    workers[0]!.verified(id, true);
    await flush(12);
    // A benign duplicate is neither a second settlement nor a protocol fault.
    await expect(job).resolves.toBe(false);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated()).toBe(0);
    await pool.close();
  });
});

describe("T1 rework1 P2 — TTL is a duration, and LRU is deterministic", () => {
  function counting(): Argon2Executor & { calls: number } {
    const executor = {
      calls: 0,
      async hashPassword() { return ENCODED_HASH; },
      async verifyPassword() { return false; },
      async hashAuditContext(value: Uint8Array) {
        executor.calls += 1;
        return createHash("sha256").update(value).digest("hex");
      }
    };
    return executor as Argon2Executor & { calls: number };
  }

  it("measures TTL on a monotonic clock, not the wall clock", () => {
    const hasher = new AuditContextHasher(counting(), SALT, auditKdf);
    const clock = (hasher as unknown as { now: () => number }).now;
    // The distinguishing property: it is NOT Date.now, and its origin is
    // process start rather than the epoch, so an NTP step cannot move it.
    expect(clock).not.toBe(Date.now);
    expect(clock()).toBeLessThan(Date.now() - 1_000_000_000);
    const first = clock();
    const second = clock();
    expect(second).toBeGreaterThanOrEqual(first);
    hasher.close();
  });

  it("keeps a fresh entry across a forward wall-clock step and expires it on elapsed time", async () => {
    // `elapsed` is the monotonic reading the hasher sees; `wall` is what
    // Date.now would have reported. They diverge exactly as an NTP step does.
    let elapsed = 0;
    const executor = counting();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      ttlMs: 60_000, now: () => elapsed
    });
    await hasher.hashSourceIp("198.51.100.1");
    expect(executor.calls).toBe(1);

    // One hour of wall clock passes in an instant; no real time elapsed.
    elapsed += 10;
    await hasher.hashSourceIp("198.51.100.1");
    expect(executor.calls).toBe(1);

    // Still inside the ruled duration, whatever the wall clock now says.
    elapsed += 59_980;
    await hasher.hashSourceIp("198.51.100.1");
    expect(executor.calls).toBe(1);

    // And it expires on elapsed time, exactly at the TTL.
    elapsed += 10;
    await hasher.hashSourceIp("198.51.100.1");
    expect(executor.calls).toBe(2);
    hasher.close();
  });

  it("evicts the true LRU entry even when every access lands in one millisecond", async () => {
    const executor = counting();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      // A frozen clock: millisecond timestamps cannot order these accesses.
      capacity: 3, ttlMs: 10_000_000, now: () => 5_000
    });
    await hasher.hashSourceIp("ip-a");
    await hasher.hashSourceIp("ip-b");
    await hasher.hashSourceIp("ip-c");
    await hasher.hashSourceIp("ip-a");
    expect(executor.calls).toBe(3);
    expect(hasher.cacheSize()).toBe(3);

    // ip-b is now the least recently used; inserting ip-d must evict IT.
    await hasher.hashSourceIp("ip-d");
    expect(executor.calls).toBe(4);
    expect(hasher.cacheSize()).toBeLessThanOrEqual(3);

    // ip-a was touched last, so it is still a hit...
    await hasher.hashSourceIp("ip-a");
    expect(executor.calls).toBe(4);
    // ...and ip-b is the one that had to be recomputed.
    await hasher.hashSourceIp("ip-b");
    expect(executor.calls).toBe(5);
    hasher.close();
  });

  it("orders eviction by use, not by insertion, over a longer same-tick sequence", async () => {
    const executor = counting();
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      capacity: 4, ttlMs: 10_000_000, now: () => 1
    });
    for (const address of ["ip-1", "ip-2", "ip-3", "ip-4"]) await hasher.hashSourceIp(address);
    // Touch in reverse order, so insertion order and use order fully disagree.
    for (const address of ["ip-4", "ip-3", "ip-2"]) await hasher.hashSourceIp(address);
    expect(executor.calls).toBe(4);
    await hasher.hashSourceIp("ip-5");
    // ip-1 is the only entry never re-used since insertion.
    const before = executor.calls;
    for (const address of ["ip-2", "ip-3", "ip-4"]) await hasher.hashSourceIp(address);
    expect(executor.calls).toBe(before);
    await hasher.hashSourceIp("ip-1");
    expect(executor.calls).toBe(before + 1);
    hasher.close();
  });
});

describe("T1 rework1 — the per-IP cache retains nothing across dynamic addresses", () => {
  const CAPACITY = 8;
  const ADDRESSES = 192;

  /**
   * A WeakRef target created during a job stays alive until that job ends, so a
   * single in-turn collection would report every sentinel as surviving no
   * matter what. The probe therefore crosses a real macrotask boundary between
   * two major collections. The positive control below is what proves this is
   * not simply over-collecting.
   */
  async function forceGarbageCollection(): Promise<void> {
    setFlagsFromString("--expose_gc");
    const collect = runInNewContext("gc") as (options?: Readonly<{
      type: "major"; execution: "sync"; flavor: "last-resort";
    }>) => void;
    const options = Object.freeze({
      type: "major" as const, execution: "sync" as const, flavor: "last-resort" as const
    });
    for (let round = 0; round < 3; round += 1) {
      collect(options);
      collect(options);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => { setTimeout(resolve, 1); });
    }
  }

  /**
   * Drives `ADDRESSES` distinct addresses through a `CAPACITY`-bounded cache,
   * attaching one sentinel object per derivation. Only weak references and a
   * survivor COUNT ever leave this function: the sentinel is never persisted,
   * never logged, and never derived from an address.
   */
  async function measureSurvivingSentinels(retainDeliberately: boolean): Promise<Readonly<{
    surviving: number;
    cacheSize: number;
  }>> {
    const deliberatelyRetained: object[] = [];
    const witnesses: WeakRef<object>[] = [];
    const executor: Argon2Executor = {
      async hashPassword() { return ENCODED_HASH; },
      async verifyPassword() { return false; },
      async hashAuditContext(value: Uint8Array) {
        // 64 KiB per sentinel, so retention is unmistakable rather than noise.
        const sentinel = { ballast: new Uint8Array(64 * 1024).fill(0xa5) };
        witnesses.push(new WeakRef(sentinel));
        if (retainDeliberately) deliberatelyRetained.push(sentinel);
        return createHash("sha256").update(value).digest("hex");
      }
    };
    const hasher = new AuditContextHasher(executor, SALT, auditKdf, {
      capacity: CAPACITY, ttlMs: 10_000_000
    });
    for (let index = 0; index < ADDRESSES; index += 1) {
      await hasher.hashSourceIp(`2001:db8:cafe::${index.toString(16)}`);
    }
    const cacheSize = hasher.cacheSize();
    hasher.close();
    await forceGarbageCollection();
    const surviving = witnesses.filter((witness) => witness.deref() !== undefined).length;
    // Keep the control array observably alive to the very end.
    expect(deliberatelyRetained.length).toBe(retainDeliberately ? ADDRESSES : 0);
    return Object.freeze({ surviving, cacheSize });
  }

  it("collects the sentinels of evicted addresses, and the same probe catches a retained one", async () => {
    const observed = await measureSurvivingSentinels(false);
    // The cache never exceeded its capacity...
    expect(observed.cacheSize).toBeLessThanOrEqual(CAPACITY);
    // ...and nothing per-derivation outlived it. The bound is the cache
    // capacity, not the number of addresses seen.
    expect(observed.surviving).toBeLessThanOrEqual(CAPACITY);

    // POSITIVE CONTROL. Same probe, same forced GC, one deliberate retention:
    // if it does not go RED here, a green result above proves nothing.
    const control = await measureSurvivingSentinels(true);
    expect(control.surviving).toBe(ADDRESSES);
    expect(control.surviving).toBeGreaterThan(CAPACITY);
  }, 120_000);
});

describe("T1 rework1 — the worker's encoding validator cannot drift from the pool's", () => {
  const IN_ENVELOPE = ENCODED_HASH;
  const corpus: readonly string[] = Object.freeze([
    IN_ENVELOPE, "", "$", "$argon2id$", "$argon2id$not-an-encoding", "not-a-hash",
    IN_ENVELOPE.replace("$argon2id$", "$argon2d$"),
    IN_ENVELOPE.replace("$argon2id$", "$argon2i$"),
    IN_ENVELOPE.replace("$argon2id$", "$Argon2id$"),
    IN_ENVELOPE.replace("v=19", "v=16"),
    IN_ENVELOPE.replace("v=19", "v=190"),
    IN_ENVELOPE.replace("v=19", "v="),
    IN_ENVELOPE.replace(/m=\d+/, "m=19455"),
    IN_ENVELOPE.replace(/m=\d+/, "m=19456"),
    IN_ENVELOPE.replace(/m=\d+/, "m=262144"),
    IN_ENVELOPE.replace(/m=\d+/, "m=262145"),
    IN_ENVELOPE.replace(/m=\d+/, "m=2097152"),
    IN_ENVELOPE.replace(/m=\d+/, "m=999999999"),
    IN_ENVELOPE.replace(/m=\d+/, "m=9999999999"),
    IN_ENVELOPE.replace(/t=\d+/, "t=1"),
    IN_ENVELOPE.replace(/t=\d+/, "t=2"),
    IN_ENVELOPE.replace(/t=\d+/, "t=10"),
    IN_ENVELOPE.replace(/t=\d+/, "t=11"),
    IN_ENVELOPE.replace(/p=\d+/, "p=0"),
    IN_ENVELOPE.replace(/p=\d+/, "p=1"),
    IN_ENVELOPE.replace(/p=\d+/, "p=4"),
    IN_ENVELOPE.replace(/p=\d+/, "p=5"),
    IN_ENVELOPE + "$extra",
    IN_ENVELOPE.slice(0, -4),
    IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(4)}`),
    IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(43)}`),
    IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(88)}`),
    IN_ENVELOPE.replace(/\$[A-Za-z0-9+/]+$/, `$${"A".repeat(89)}`),
    `$argon2id$v=19$m=65536,t=3,p=1$AAAA$${"A".repeat(43)}`,
    `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(44)}`,
    `$argon2id$v=19$m=65536,t=3,p=1$${"A/+".repeat(8)}$${"A".repeat(43)}`,
    `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(42)}=`,
    "$argon2id$v=19$m=65536,t=3,p=1$" + "A".repeat(300) + "$" + "A".repeat(43)
  ]);

  it("agrees with the pool's parser on every case, and the corpus is not one-sided", async () => {
    const worker = await import("../../packages/crypto/src/argon2-worker.js");
    const disagreements = corpus.filter((candidate) =>
      JSON.stringify(worker.parseEncodedArgon2id(candidate) ?? null)
      !== JSON.stringify(parseEncodedArgon2id(candidate) ?? null));
    expect(disagreements).toEqual([]);
    const accepted = corpus.filter((candidate) => parseEncodedArgon2id(candidate) !== undefined);
    // Non-vacuous in both directions.
    expect(accepted.length).toBeGreaterThan(3);
    expect(corpus.length - accepted.length).toBeGreaterThan(20);
    // And the two bound tables are the same numbers, not merely the same shape.
    expect(worker.ARGON2ID_ENCODING_BOUNDS).toEqual(ARGON2ID_ENCODING_BOUNDS);
  });

  it("classifies verification inside the worker: false only for encoding or mismatch", async () => {
    const worker = await import("../../packages/crypto/src/argon2-worker.js");
    const password = () => new TextEncoder().encode("correct horse battery staple");
    const neverCalled = async (): Promise<boolean> => {
      throw new Error("PRE_VALIDATION_SHOULD_HAVE_REFUSED_THIS");
    };

    // Malformed and out-of-envelope: false, and the verifier is never reached.
    for (const stored of [
      "$argon2id$not-an-encoding",
      IN_ENVELOPE.replace(/m=\d+/, "m=2097152"),
      IN_ENVELOPE.replace("$argon2id$", "$argon2d$")
    ]) {
      await expect(worker.executeArgon2WorkerRequest(
        { id: "x", op: "verify-password", password: password(), encodedHash: stored }, neverCalled
      )).resolves.toEqual({ kind: "verified", id: "x", matches: false });
    }

    // A genuine mismatch is false.
    await expect(worker.executeArgon2WorkerRequest(
      { id: "y", op: "verify-password", password: password(), encodedHash: IN_ENVELOPE },
      async () => false
    )).resolves.toEqual({ kind: "verified", id: "y", matches: false });

    // A valid, in-envelope encoding whose compute path throws is NOT false.
    const thrown = await worker.executeArgon2WorkerRequest(
      { id: "z", op: "verify-password", password: password(), encodedHash: IN_ENVELOPE },
      async () => { throw new Error("wasm abort: cannot grow memory 0xfeedface"); }
    );
    expect(thrown).toEqual({
      kind: "failed", id: "z", code: worker.ARGON2_WORKER_JOB_FAILED
    });
    // And no raw verifier text or input byte crossed the boundary.
    expect(JSON.stringify(thrown)).not.toContain("0xfeedface");
    expect(JSON.stringify(thrown)).not.toContain("wasm");
    expect(JSON.stringify(thrown)).not.toContain("correct horse");
  });

  it("zeroes the password on every verification outcome, including the refused ones", async () => {
    const worker = await import("../../packages/crypto/src/argon2-worker.js");
    for (const [stored, verifier] of [
      ["$argon2id$not-an-encoding", async () => true],
      [IN_ENVELOPE, async () => true],
      [IN_ENVELOPE, async () => { throw new Error("boom"); }]
    ] as const) {
      const password = new TextEncoder().encode("correct horse battery staple");
      await worker.executeArgon2WorkerRequest(
        { id: "w", op: "verify-password", password, encodedHash: stored }, verifier
      );
      expect(password.every((byte) => byte === 0)).toBe(true);
    }
  });
});

// ==========================================================================
// REWORK 2 — binding Sol xHigh findings from the final review round.
// Every block below was written against a reproduction of the defect it pins,
// and every assertion here was proved RED against the pre-rework2 pool bytes
// (packages/crypto/src/argon2-worker-pool.ts sha256
//  af84e900a611f9719397fcf905a66cc157a8a06b47e24cea79dbace305563124).
// ==========================================================================

/** Collects unhandled rejections for the duration of one assertion. */
async function withoutUnhandledRejections<T>(body: () => Promise<T>): Promise<T> {
  const seen: unknown[] = [];
  const listener = (reason: unknown): void => { seen.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    const result = await body();
    // Give any orphaned rejection a full turn to be reported.
    await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    expect(seen.map((reason) => String(reason))).toEqual([]);
    return result;
  } finally {
    process.off("unhandledRejection", listener);
  }
}

describe("T1 rework2 R1 — a refused termination is not a confirmed death", () => {
  const CONFIRM_MS = 60;

  /**
   * Two workers whose `terminate()` REJECTS while the thread keeps running and
   * emits no exit. This is the only fixture that can tell "the request failed"
   * apart from "the 64 MiB worker is gone", which is the whole finding.
   */
  function refusingPool(options: { readonly restartBudget?: number } = {}): {
    pool: Argon2WorkerPool;
    workers: FakeWorker[];
  } {
    const workers: FakeWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 2,
      restartBudget: options.restartBudget ?? 5,
      jobTimeoutMs: 200,
      closeDrainMs: 20,
      terminationConfirmTimeoutMs: CONFIRM_MS,
      spawn: (index) => {
        const worker = createFakeWorker(index, true, false, "reject");
        workers.push(worker);
        return worker;
      }
    });
    return { pool, workers };
  }

  it("builds no replacement while a refused termination leaves the old worker alive", async () => {
    const { pool, workers } = refusingPool();
    await pool.ready();
    expect(pool.stats().liveHandles).toBe(2);

    workers[0]!.crash();
    await flush(16);

    // The rejection told the pool NOTHING about the thread. Its 64 MiB arena is
    // still mapped, so a replacement here would put three physical workers
    // behind a two-worker bound.
    expect(workers[0]!.isAlive()).toBe(true);
    expect(workers).toHaveLength(2);
    expect(pool.stats().liveHandles).toBe(2);
    expect(pool.stats().retiringHandles).toBe(1);

    // ...and it stays that way past the confirmation deadline: an unconfirmed
    // worker is never silently forgotten, and no third thread is ever built.
    await new Promise<void>((resolve) => { setTimeout(resolve, CONFIRM_MS * 3); });
    expect(workers).toHaveLength(2);
    expect(pool.stats().retiringHandles).toBeGreaterThanOrEqual(1);
    expect(pool.stats().liveHandles).toBe(2);
    await pool.close().catch(() => undefined);
  });

  it("fails the pool closed once death cannot be confirmed within the ruled deadline", async () => {
    const { pool, workers } = refusingPool();
    await pool.ready();
    workers[0]!.crash();

    // A REAL ruled deadline elapses here: CONFIRM_MS is the injected
    // terminationConfirmTimeoutMs, and nothing else can settle this.
    await new Promise<void>((resolve) => { setTimeout(resolve, CONFIRM_MS * 3); });

    expect(pool.stats().breakerTripped).toBe(true);
    const refused = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await expect(refused).rejects.toBeInstanceOf(Argon2InfrastructureError);
    await expect(refused).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    // Failing closed never invents a replacement for the slot it lost.
    expect(workers).toHaveLength(2);
    await pool.close().catch(() => undefined);
  });

  it("close() refuses to claim zero handles for an unconfirmed worker, and fails typed not hung", async () => {
    await withoutUnhandledRejections(async () => {
      const { pool, workers } = refusingPool();
      await pool.ready();
      workers[0]!.crash();
      await flush(16);

      // A named watchdog, so a HANG is reported as a hang rather than as
      // vitest's generic 120 s backstop. Correct code settles in ~CONFIRM_MS.
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const hang = new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => reject(new Error("CLOSE_UNCONFIRMED_HANG")), 5_000);
      });
      const startedAt = performance.now();
      let outcome: unknown;
      try {
        outcome = await Promise.race([
          pool.close().then(() => ({ settled: "resolved" as const }),
            (error: unknown) => ({ settled: "rejected" as const, error })),
          hang
        ]);
      } finally {
        clearTimeout(watchdog);
      }
      expect(performance.now() - startedAt).toBeLessThan(5_000);

      // Bounded and TYPED, never a silent success.
      expect(outcome).toMatchObject({ settled: "rejected" });
      const error = (outcome as { error: unknown }).error;
      expect(error).toBeInstanceOf(Argon2InfrastructureError);
      expect(error).toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });

      // And the books are honest: an unconfirmed 64 MiB worker is still counted.
      expect(workers[0]!.isAlive()).toBe(true);
      expect(pool.stats().retiringHandles).toBeGreaterThanOrEqual(1);
      expect(pool.stats().liveHandles).toBeGreaterThanOrEqual(1);
      expect(pool.stats().state).not.toBe("CLOSED");

      // Idempotent: a second close observes the SAME typed settlement.
      await expect(pool.close()).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    });
  }, 30_000);

  it("POSITIVE CONTROL: an explicit exit after the refused request does confirm death", async () => {
    const { pool, workers } = refusingPool();
    await pool.ready();
    workers[0]!.crash();
    await flush(16);
    // Custody is held: no replacement yet, so this control is not vacuous.
    expect(workers).toHaveLength(2);
    expect(pool.stats().retiringHandles).toBe(1);

    // The one signal that DOES prove the thread is gone.
    workers[0]!.emitExit(1);
    await flush(16);

    expect(workers[0]!.isAlive()).toBe(false);
    expect(workers).toHaveLength(3);
    expect(pool.stats().retiringHandles).toBe(0);
    expect(pool.stats().liveHandles).toBe(2);
    expect(pool.stats().breakerTripped).toBe(false);
    expect(pool.stats().state).toBe("OPEN");

    // The replacement is a working worker, and close now completes cleanly.
    const later = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush(8);
    const replacement = workers[2]!;
    expect(replacement.received).toHaveLength(1);
    replacement.verified(replacement.received[0]!.id, false);
    await expect(later).resolves.toBe(false);
    const closing = pool.close();
    await flush(4);
    for (const worker of workers) worker.emitExit(0);
    await closing;
    expect(pool.stats().state).toBe("CLOSED");
    expect(pool.stats().liveHandles).toBe(0);
  });

  it("settles every promise exactly once and raises no unhandled rejection", async () => {
    await withoutUnhandledRejections(async () => {
      const { pool, workers } = refusingPool();
      await pool.ready();
      const settlements: string[] = [];
      const jobs = Array.from({ length: 6 }, () => {
        const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
        promise.then(() => settlements.push("resolved"),
          (error: unknown) => settlements.push((error as { code: string }).code));
        return promise;
      });
      await flush();
      workers[0]!.crash();
      workers[1]!.crash();
      await new Promise<void>((resolve) => { setTimeout(resolve, CONFIRM_MS * 3); });
      await Promise.allSettled(jobs);
      await pool.close().catch(() => undefined);
      await Promise.allSettled(jobs);
      // Six jobs, six settlements: no double-settle, no hang, no stray reject.
      expect(settlements).toHaveLength(6);
      expect(settlements.every((code) => code.startsWith("ARGON2_"))).toBe(true);
      expect(pool.stats().outstandingTotal).toBe(0);
    });
  }, 30_000);
});

describe("T1 rework2 R2 — closing never pumps queued secrets", () => {
  const PASSWORD_KDF = { memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 };
  const AUDIT_KDF = { memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32 };

  it("dispatches nothing once CLOSING begins, and cancels/zeroes every queued payload", async () => {
    const { pool, workers } = makePool({ workers: 1, closeDrainMs: 400 });
    await pool.ready();
    const worker = workers[0]!;

    // One ACTIVE secret-bearing job holds the only worker.
    const activePassword = new TextEncoder().encode("active-correct-horse-battery");
    const activeSalt = new Uint8Array(16).fill(7);
    const active = pool.hashPassword(activePassword, activeSalt, PASSWORD_KDF);
    active.catch(() => undefined);
    await flush();
    expect(worker.received).toHaveLength(1);

    // ...and three QUEUED secret-bearing jobs sit behind it, in both lanes.
    const queuedPayloads = Array.from({ length: 2 }, () => ({
      secret: new TextEncoder().encode("queued-correct-horse-battery"),
      salt: new Uint8Array(16).fill(9)
    }));
    const auditPayload = {
      secret: new TextEncoder().encode("queued-audit-source-value"),
      salt: new Uint8Array(32).fill(4)
    };
    const settlements: string[] = [];
    const queued = [
      ...queuedPayloads.map((payload) =>
        pool.hashPassword(payload.secret, payload.salt, PASSWORD_KDF)),
      pool.hashAuditContext(auditPayload.secret, auditPayload.salt, AUDIT_KDF)
    ];
    for (const promise of queued) {
      promise.then(() => settlements.push("resolved"),
        (error: unknown) => settlements.push((error as { code: string }).code));
    }
    await flush();
    expect(pool.stats().queuedTotal).toBe(3);

    // Close BEGINS. The contract: refuse new work, let the active job drain,
    // cancel queued work. It must not hand a queued password to a worker.
    const closing = pool.close();
    await flush();
    expect(pool.stats().state).toBe("CLOSING");
    const dispatchedAtCloseStart = worker.received.length;
    expect(dispatchedAtCloseStart).toBe(1);

    // The active job answers. THIS is the trigger: a result calls pump(), and a
    // pump that stops only for CLOSED dispatches a queued secret after close.
    worker.settle(worker.received[0]!.id);
    await new Promise<void>((resolve) => { setTimeout(resolve, 40); });
    expect(worker.received).toHaveLength(dispatchedAtCloseStart);
    expect(worker.received.map((job) => job.id))
      .toEqual([worker.received[0]!.id]);

    await closing;
    // The already-active job drained to a real result rather than being killed.
    await expect(active).resolves.toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);

    // Every queued promise rejected EXACTLY once, with the typed error.
    expect(settlements).toEqual([
      "ARGON2_POOL_UNAVAILABLE", "ARGON2_POOL_UNAVAILABLE", "ARGON2_POOL_UNAVAILABLE"
    ]);
    for (const promise of queued) {
      await expect(promise).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    }

    // A queued payload was never dispatched, so it must be ZEROED in place -
    // not detached, which is what a dispatch would have done to it instead.
    for (const payload of [...queuedPayloads, auditPayload]) {
      expect(payload.secret.byteLength).toBeGreaterThan(0);
      expect([...payload.secret].every((byte) => byte === 0)).toBe(true);
      expect(payload.salt.byteLength).toBeGreaterThan(0);
      expect([...payload.salt].every((byte) => byte === 0)).toBe(true);
    }
    expect(pool.stats().queuedTotal).toBe(0);
    expect(pool.stats().outstandingTotal).toBe(0);
    expect(pool.stats().state).toBe("CLOSED");
  }, 30_000);

  it("never grows a worker's received-job count after CLOSING, over repeated pumps", async () => {
    const { pool, workers } = makePool({ workers: 2, closeDrainMs: 400 });
    await pool.ready();
    const activeJobs = Array.from({ length: 2 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    const queuedJobs = Array.from({ length: 6 }, () => {
      const promise = pool.verifyPassword(bytes(8), ENCODED_HASH);
      promise.catch(() => undefined);
      return promise;
    });
    await flush();
    const before = workers.map((worker) => worker.received.length);
    expect(before).toEqual([1, 1]);

    const closing = pool.close();
    await flush();
    expect(pool.stats().state).toBe("CLOSING");
    // Settle both actives, then poke every remaining pump entry point.
    for (const worker of workers) worker.settle(worker.received[0]!.id);
    for (const worker of workers) worker.emitReady();
    await new Promise<void>((resolve) => { setTimeout(resolve, 40); });
    expect(workers.map((worker) => worker.received.length)).toEqual(before);

    await closing;
    expect(workers.map((worker) => worker.received.length)).toEqual(before);
    for (const promise of queuedJobs) {
      await expect(promise).rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });
    }
    await Promise.allSettled(activeJobs);
    expect(pool.stats().outstandingTotal).toBe(0);
  }, 30_000);
});

describe("T1 rework2 R3 — a response must answer the EXACT request", () => {
  const PASSWORD_KDF = { memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32 };
  const AUDIT_KDF = { memoryCostKiB: 19_456, iterations: 2, parallelism: 1, hashLength: 32 };
  const OTHER_SALT_BASE64 = Buffer.from(new Uint8Array(16).fill(0xbe))
    .toString("base64").replace(/=+$/, "");

  async function answerPasswordWith(
    digestFor: (job: DispatchedJob) => unknown
  ): Promise<{ outcome: unknown; workers: FakeWorker[]; pool: Argon2WorkerPool }> {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const job = pool.hashPassword(bytes(8), bytes(16), PASSWORD_KDF);
    const settlement = job.then(
      (value) => ({ settled: "resolved" as const, value }),
      (error: unknown) => ({ settled: "rejected" as const, code: (error as { code: string }).code })
    );
    await flush();
    const dispatched = workers[0]!.received[0]!;
    workers[0]!.raw({ kind: "result", id: dispatched.id, digest: digestFor(dispatched) });
    return { outcome: await settlement, workers, pool };
  }

  /**
   * Every one of these is a well-formed, in-ENVELOPE Argon2id encoding that the
   * pre-rework2 parser accepted and the repository would have persisted as this
   * user's password hash - while being a different, and mostly weaker, KDF than
   * the 64 MiB / t=3 / p=1 job that was actually requested.
   */
  const responseMutants: readonly {
    readonly label: string;
    readonly dimension: string;
    readonly digest: (job: DispatchedJob) => string;
  }[] = [
    {
      label: "a weaker 19 MiB memory cost", dimension: "memoryCostKiB",
      digest: (job) => lawfulPasswordEncoding({ ...job, memoryCostKiB: 19_456 })
    },
    {
      label: "a weaker t=2 time cost", dimension: "timeCost",
      digest: (job) => lawfulPasswordEncoding({ ...job, timeCost: 2 })
    },
    {
      label: "a different p=4 parallelism", dimension: "parallelism",
      digest: (job) => lawfulPasswordEncoding({ ...job, parallelism: 4 })
    },
    {
      label: "a different 64-byte digest length", dimension: "hashLength",
      digest: (job) => lawfulPasswordEncoding({ ...job, hashLength: 64 })
    },
    {
      label: "a salt the request never supplied", dimension: "salt",
      digest: (job) => lawfulPasswordEncoding({ ...job, saltBase64: OTHER_SALT_BASE64 })
    },
    {
      label: "every cost lowered to the envelope floor", dimension: "all",
      digest: (job) => lawfulPasswordEncoding({
        ...job, memoryCostKiB: 19_456, timeCost: 2, saltBase64: OTHER_SALT_BASE64
      })
    }
  ];

  for (const mutant of responseMutants) {
    it(`refuses ${mutant.label} as a protocol fault, not a stored hash`, async () => {
      const { outcome, workers, pool } = await answerPasswordWith(mutant.digest);
      // Proof the mutant really is in-envelope: the old envelope check passes it.
      const digest = mutant.digest(workers[0]!.received[0]!);
      expect(parseEncodedArgon2id(digest)).toBeDefined();
      // ...and it is still refused, on the `${mutant.dimension}` dimension.
      expect(outcome).toMatchObject({ settled: "rejected", code: "ARGON2_WORKER_FAILED" });
      expect(outcome).not.toMatchObject({ settled: "resolved" });
      // A worker that answers a different question is no longer trustworthy.
      await flush(12);
      expect(workers[0]!.terminated()).toBe(1);
      expect(workers.length).toBeGreaterThan(1);
      await pool.close();
    });
  }

  it("POSITIVE CONTROL: accepts the encoding bound to this exact request", async () => {
    const { outcome, workers, pool } = await answerPasswordWith(
      (job) => lawfulPasswordEncoding(job)
    );
    expect(outcome).toMatchObject({ settled: "resolved" });
    expect((outcome as { value: string }).value)
      .toBe(lawfulPasswordEncoding(workers[0]!.received[0]!));
    await flush(12);
    // The lawful answer neither retires nor replaces the worker.
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated()).toBe(0);
    await pool.close();
  });

  it("POSITIVE CONTROL: every dimension is checked independently, one at a time", async () => {
    // Each mutant above changes exactly one dimension away from a digest that
    // IS accepted, so none of them can be passing for an unrelated reason.
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const first = pool.hashPassword(bytes(8), bytes(16), PASSWORD_KDF);
    await flush();
    const dispatched = workers[0]!.received[0]!;
    expect(dispatched.memoryCostKiB).toBe(65_536);
    expect(dispatched.timeCost).toBe(3);
    expect(dispatched.parallelism).toBe(1);
    expect(dispatched.hashLength).toBe(32);
    expect(dispatched.saltBase64).toBe(
      Buffer.from(bytes(16)).toString("base64").replace(/=+$/, "")
    );
    workers[0]!.raw({
      kind: "result", id: dispatched.id, digest: lawfulPasswordEncoding(dispatched)
    });
    await expect(first).resolves.toBe(lawfulPasswordEncoding(dispatched));
    await pool.close();
  });

  it("preserves the exact audit digest length and operation binding", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const audit = pool.hashAuditContext(bytes(8), bytes(32), AUDIT_KDF);
    const settlement = audit.then(
      (value) => ({ settled: "resolved" as const, value }),
      (error: unknown) => ({ settled: "rejected" as const, code: (error as { code: string }).code })
    );
    await flush();
    // A 16-byte hex digest for a 32-byte audit request is still refused.
    workers[0]!.raw({ kind: "result", id: workers[0]!.received[0]!.id, digest: "ab".repeat(16) });
    expect(await settlement).toMatchObject({
      settled: "rejected", code: "ARGON2_WORKER_FAILED"
    });
    await pool.close();
  });

  const failureCodeMutants: readonly string[] = [
    "", "argon2_worker_job_failed", "ARGON2_WORKER_JOB_FAILED ",
    "ARGON2_POOL_UNAVAILABLE", "OK", "ARGON2_WORKER_JOB_FAILED_BUT_HERE_IS_A_HASH"
  ];

  for (const code of failureCodeMutants) {
    it(`treats the failure code ${JSON.stringify(code)} as a protocol fault`, async () => {
      const { pool, workers } = makePool({ workers: 1 });
      await pool.ready();
      const job = pool.verifyPassword(bytes(8), ENCODED_HASH);
      const settlement = job.then(
        (value) => ({ settled: "resolved" as const, value }),
        (error: unknown) => ({ settled: "rejected" as const, code: (error as { code: string }).code })
      );
      await flush();
      workers[0]!.raw({ kind: "failed", id: workers[0]!.received[0]!.id, code });
      expect(await settlement).toMatchObject({
        settled: "rejected", code: "ARGON2_WORKER_FAILED"
      });
      // An unlawful code is a protocol fault: the worker is retired, not believed.
      await flush(12);
      expect(workers[0]!.terminated()).toBe(1);
      expect(workers.length).toBeGreaterThan(1);
      await pool.close();
    });
  }

  it("POSITIVE CONTROL: the one lawful failure code settles without retiring the worker", async () => {
    const { pool, workers } = makePool({ workers: 1 });
    await pool.ready();
    const job = pool.verifyPassword(bytes(8), ENCODED_HASH);
    await flush();
    workers[0]!.raw({
      kind: "failed", id: workers[0]!.received[0]!.id, code: "ARGON2_WORKER_JOB_FAILED"
    });
    await expect(job).rejects.toMatchObject({ code: "ARGON2_WORKER_FAILED" });
    await flush(12);
    expect(workers).toHaveLength(1);
    expect(workers[0]!.terminated()).toBe(0);
    await pool.close();
  });

  it("pins the pool's lawful failure code to the worker module's own constant", async () => {
    // The pool cannot import the value from the worker module: that module
    // imports hash-wasm at its top level, so a value import would drag the WASM
    // Argon2 surface back onto the request thread. The constant is therefore a
    // deliberate mirror, and this is what makes drift a test failure.
    const worker = await import("../../packages/crypto/src/argon2-worker.js");
    const pool = await import("../../packages/crypto/src/argon2-worker-pool.js");
    expect(pool.ARGON2_LAWFUL_WORKER_FAILURE_CODE).toBe(worker.ARGON2_WORKER_JOB_FAILED);
    expect(pool.ARGON2_LAWFUL_WORKER_FAILURE_CODE).toBe("ARGON2_WORKER_JOB_FAILED");
  });
});

describe("T1 rework3 RED 1 — a bounded observation never disables a later death confirmation", () => {
  /**
   * The REAL ruled deadline exercised below: it is injected verbatim as
   * `terminationConfirmTimeoutMs`, and nothing in these tests can settle a
   * retirement before it elapses. There is no fake clock and no early escape,
   * so a harness that could not fail is not possible here.
   */
  const CONFIRM_MS = 60;

  /**
   * A worker whose `terminate()` is REFUSED — the thread keeps running and emits
   * no exit — until the test explicitly makes it terminable again.
   *
   * This is the only fixture that can separate the two authoritative death
   * signals from each other and from the bounded observation: a LATE explicit
   * `exit` (limb 1) and a LATER termination attempt that actually FULFILS
   * (limb 2), each arriving strictly after the confirmation deadline has already
   * handed its caller a bounded `unconfirmed` answer.
   */
  interface RetryableWorker extends FakeWorker {
    /** From now on `terminate()` fulfils and the thread really stops. */
    allowTermination(): void;
  }

  function createRetryableWorker(index: number): RetryableWorker {
    const base = createFakeWorker(index, true, false, "reject");
    let permitted = false;
    let killed = false;
    // Counted HERE rather than in the base fake, so that every termination
    // REQUEST is counted on both sides of `allowTermination()`. That is what
    // makes "close issued a fresh attempt" a real observation.
    let attempts = 0;
    return {
      ...base,
      terminate(): Promise<unknown> {
        attempts += 1;
        // Refused: tells the pool NOTHING about the thread.
        if (!permitted) return base.terminate();
        // Fulfilled: the thread really stopped. Deliberately emits no `exit`,
        // so limb 2 is proven by the fulfilled attempt alone.
        return Promise.resolve().then(() => { killed = true; return 0; });
      },
      terminated: () => attempts,
      isAlive: () => base.isAlive() && !killed,
      allowTermination() { permitted = true; }
    } as RetryableWorker;
  }

  function retryablePool(): { pool: Argon2WorkerPool; workers: RetryableWorker[] } {
    const workers: RetryableWorker[] = [];
    const pool = new Argon2WorkerPool({
      workers: 2,
      restartBudget: 5,
      jobTimeoutMs: 200,
      closeDrainMs: 20,
      terminationConfirmTimeoutMs: CONFIRM_MS,
      spawn: (index) => {
        const worker = createRetryableWorker(index);
        workers.push(worker);
        return worker;
      }
    });
    return { pool, workers };
  }

  it("accepts an explicit exit that lands AFTER the confirmation deadline", async () => {
    await withoutUnhandledRejections(async () => {
      const { pool, workers } = retryablePool();
      await pool.ready();
      expect(pool.stats().liveHandles).toBe(2);

      workers[0]!.crash();
      await flush(16);
      // The refused request proved nothing: custody is held and no replacement
      // is built, so the deadline below is reached non-vacuously.
      expect(workers).toHaveLength(2);
      expect(workers[0]!.isAlive()).toBe(true);
      expect(pool.stats().retiringHandles).toBe(1);

      // The ruled deadline actually elapses. Nothing else can settle it.
      await new Promise<void>((resolve) => { setTimeout(resolve, CONFIRM_MS * 3); });
      expect(pool.stats().breakerTripped).toBe(true);
      expect(workers).toHaveLength(2);
      expect(pool.stats().retiringHandles).toBeGreaterThanOrEqual(1);
      await expect(pool.verifyPassword(bytes(8), ENCODED_HASH))
        .rejects.toMatchObject({ code: "ARGON2_POOL_UNAVAILABLE" });

      // THE FINDING. The bounded observation expired, but physical death is a
      // separate, permanent fact. An explicit exit after that deadline is still
      // authoritative and must reconcile custody truthfully.
      for (const worker of workers) worker.emitExit(0);
      await flush(16);
      expect(pool.stats().retiringHandles).toBe(0);
      expect(pool.stats().liveHandles).toBe(0);
      // A late confirmation reconciles the books; it does not reopen the
      // fail-closed breaker and never spawns a replacement.
      expect(workers).toHaveLength(2);
      expect(pool.stats().breakerTripped).toBe(true);

      // And once every handle is confirmed, close can truthfully reach CLOSED.
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const hang = new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => reject(new Error("CLOSE_AFTER_LATE_EXIT_HANG")), 5_000);
      });
      try {
        await Promise.race([pool.close(), hang]);
      } finally {
        clearTimeout(watchdog);
      }
      expect(pool.stats().state).toBe("CLOSED");
      expect(pool.stats().liveHandles).toBe(0);
      expect(pool.stats().retiringHandles).toBe(0);
    });
  }, 30_000);

  it("lets a fulfilled close-time retry confirm death instead of reusing a stale verdict", async () => {
    await withoutUnhandledRejections(async () => {
      const { pool, workers } = retryablePool();
      await pool.ready();
      workers[0]!.crash();

      // Again the REAL ruled deadline expires with no exit and no fulfilled
      // termination, so every retirement already holds a bounded `unconfirmed`.
      await new Promise<void>((resolve) => { setTimeout(resolve, CONFIRM_MS * 3); });
      expect(pool.stats().breakerTripped).toBe(true);
      expect(pool.stats().retiringHandles).toBeGreaterThanOrEqual(1);
      expect(workers.every((worker) => worker.isAlive())).toBe(true);
      const terminationsBeforeClose = workers.map((worker) => worker.terminated());

      // The threads become terminable. No exit is ever emitted: the fulfilled
      // close-time retry is the ONLY confirmation available from here on.
      for (const worker of workers) worker.allowTermination();

      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const hang = new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => reject(new Error("CLOSE_RETRY_HANG")), 5_000);
      });
      const startedAt = performance.now();
      try {
        await Promise.race([pool.close(), hang]);
      } finally {
        clearTimeout(watchdog);
      }
      expect(performance.now() - startedAt).toBeLessThan(5_000);

      // NON-VACUITY: close really did issue a fresh termination request rather
      // than settling on the stale verdict it already had.
      expect(workers.map((worker) => worker.terminated()))
        .not.toEqual(terminationsBeforeClose);
      expect(workers.every((worker) => !worker.isAlive())).toBe(true);
      expect(pool.stats().state).toBe("CLOSED");
      expect(pool.stats().liveHandles).toBe(0);
      expect(pool.stats().retiringHandles).toBe(0);
      // One physical handle per slot throughout: no replacement overlap.
      expect(workers).toHaveLength(2);
    });
  }, 30_000);
});
