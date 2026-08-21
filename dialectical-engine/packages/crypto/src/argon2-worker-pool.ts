// Bounded, process-owned Argon2 worker pool.
//
// Owns every off-thread Argon2 compute: worker spawn and readiness, the two
// bounded lanes, protocol validation, job timeouts, crash handling, the restart
// breaker, and the close contract. It never imports hash-wasm — only
// ./argon2-worker.ts does, and only inside the worker thread.
//
// PLAINTEXT OWNERSHIP. A secret-bearing payload has exactly one live owner at
// any moment:
//   1. caller -> `QueuedJob.request` at enqueue (the queue node owns it);
//   2. queue node -> worker thread at dispatch, via structured-clone transfer,
//      which detaches the parent's buffers and `request` is cleared in the same
//      step (the worker owns it, and zeroes it in its own `finally`);
//   3. on cancel/capacity-reject/close before dispatch, the queue node zeroes
//      the bytes and clears the reference (nobody owns it).
// A payload is therefore never reachable from two queue nodes at once, and is
// never retained after settlement.

import { randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { Argon2WorkerRequest, Argon2WorkerResponse } from "./argon2-worker.js";

export type Argon2FailureCode =
  | "ARGON2_POOL_CAPACITY_EXHAUSTED"
  | "ARGON2_POOL_UNAVAILABLE"
  | "ARGON2_WORKER_FAILED"
  | "ARGON2_JOB_TIMEOUT";

/**
 * The only failure type callers see. Constant, secret-free, and never
 * convertible into `false` or a weaker hash by any path in this module.
 */
export class Argon2InfrastructureError extends Error {
  readonly code: Argon2FailureCode;
  readonly retryable: boolean;

  constructor(code: Argon2FailureCode) {
    super(code);
    this.name = "Argon2InfrastructureError";
    this.code = code;
    // Capacity exhaustion is transient back-pressure; a dead or closed pool is
    // not something the same request should hammer.
    this.retryable = code === "ARGON2_POOL_CAPACITY_EXHAUSTED";
  }
}

export type Argon2Lane = "credential" | "audit";

/**
 * The accepted encoded-Argon2id envelope. The numbers are exactly the finite
 * bounds the register schema already accepts for the password KDF
 * (`packages/register/src/auth-policy.ts`), so a stored hash can never demand
 * more than a policy-legal job could.
 *
 * ./argon2-worker.ts carries a deliberate mirror of this table and of
 * `parseEncodedArgon2id`, because it is loaded by plain `node` and cannot
 * import from here. A unit test pins the two copies together.
 */
export const ARGON2ID_ENCODING_BOUNDS = Object.freeze({
  version: 19,
  minMemoryCostKiB: 19_456,
  maxMemoryCostKiB: 262_144,
  minTimeCost: 2,
  maxTimeCost: 10,
  minParallelism: 1,
  maxParallelism: 4,
  minSaltBytes: 16,
  maxSaltBytes: 64,
  minHashBytes: 32,
  maxHashBytes: 64
});

export interface Argon2idEncodingParameters {
  readonly memoryCostKiB: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly saltBytes: number;
  readonly hashBytes: number;
}

const ARGON2ID_ENCODING =
  /^\$argon2id\$v=(\d{1,3})\$m=(\d{1,9}),t=(\d{1,9}),p=(\d{1,9})\$([A-Za-z0-9+/]{1,256})\$([A-Za-z0-9+/]{1,256})$/;

/** Unpadded base64 -> decoded byte length, or -1 for an impossible length. */
function base64Bytes(segment: string): number {
  const remainder = segment.length % 4;
  if (remainder === 1) return -1;
  return Math.floor((segment.length * 3) / 4);
}

/**
 * Parses an encoded Argon2id string and enforces the envelope above. Returns
 * `undefined` for anything malformed, for a different algorithm or version, and
 * for embedded costs outside the envelope, so corrupted or hostile stored data
 * is refused before it can occupy a worker or demand a multi-gibibyte arena.
 */
export function parseEncodedArgon2id(encoded: string): Argon2idEncodingParameters | undefined {
  if (typeof encoded !== "string") return undefined;
  const match = ARGON2ID_ENCODING.exec(encoded);
  if (match === null) return undefined;
  const bounds = ARGON2ID_ENCODING_BOUNDS;
  if (Number(match[1]) !== bounds.version) return undefined;
  const memoryCostKiB = Number(match[2]);
  const timeCost = Number(match[3]);
  const parallelism = Number(match[4]);
  const saltBytes = base64Bytes(match[5]!);
  const hashBytes = base64Bytes(match[6]!);
  if (memoryCostKiB < bounds.minMemoryCostKiB || memoryCostKiB > bounds.maxMemoryCostKiB) return undefined;
  if (timeCost < bounds.minTimeCost || timeCost > bounds.maxTimeCost) return undefined;
  if (parallelism < bounds.minParallelism || parallelism > bounds.maxParallelism) return undefined;
  if (saltBytes < bounds.minSaltBytes || saltBytes > bounds.maxSaltBytes) return undefined;
  if (hashBytes < bounds.minHashBytes || hashBytes > bounds.maxHashBytes) return undefined;
  return { memoryCostKiB, timeCost, parallelism, saltBytes, hashBytes };
}

/**
 * PROVISIONAL engineering bounds — candidate values only.
 *
 * These are NOT ruled auth policy and are deliberately not persisted as a
 * register row: changing an already-sealed deployed register version would
 * require a wider migration/version decision that this ticket does not own.
 * They are named, typed construction bounds adjacent to the pool; tests inject
 * smaller values. Router must obtain V's explicit ratification against measured
 * RSS evidence before final custody.
 *
 * `workers: 2` is deliberate: the frozen logical
 * `maxConcurrentRegistrationHashes = 32` is an admission-policy value, not a
 * thread count. 32 physical workers at 64 MiB would risk an ~2 GiB Argon
 * allocation.
 */
export const ARGON2_PROVISIONAL_BOUNDS = Object.freeze({
  workers: 2,
  credentialLaneCap: 32,
  auditLaneCap: 96,
  totalCap: 128,
  jobTimeoutMs: 10_000,
  restartBudget: 3,
  restartWindowMs: 60_000,
  closeDrainMs: 5_000,
  // NEW in rework 1, and provisional on exactly the same terms as the values
  // above: without it a worker that never completes its handshake leaves
  // `ready()` and every queued job pending forever.
  readyHandshakeTimeoutMs: 10_000
});

/** Minimal surface the pool needs, so tests can inject barrier/fault fixtures. */
export interface Argon2WorkerHandle {
  readonly threadId: number;
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  on(event: "message", listener: (value: unknown) => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
  on(event: "exit", listener: (code: number) => void): void;
  terminate(): Promise<unknown>;
  ref(): void;
  unref(): void;
}

export interface Argon2WorkerPoolOptions {
  readonly workers?: number;
  readonly credentialLaneCap?: number;
  readonly auditLaneCap?: number;
  readonly totalCap?: number;
  readonly jobTimeoutMs?: number;
  readonly restartBudget?: number;
  readonly restartWindowMs?: number;
  readonly closeDrainMs?: number;
  readonly readyHandshakeTimeoutMs?: number;
  readonly spawn?: (index: number) => Argon2WorkerHandle;
  readonly now?: () => number;
}

export interface Argon2PoolStats {
  readonly state: "OPEN" | "CLOSING" | "CLOSED";
  readonly workers: number;
  readonly readyWorkers: number;
  /**
   * Physical worker handles this pool still owns: one per occupied slot plus
   * every handle whose `terminate()` has not yet been confirmed. This is the
   * number the two-worker physical/RSS bound applies to, and it is what a
   * replacement must never transiently inflate.
   */
  readonly liveHandles: number;
  readonly retiringHandles: number;
  readonly active: number;
  readonly queuedCredential: number;
  readonly queuedAudit: number;
  readonly queuedTotal: number;
  readonly outstandingCredential: number;
  readonly outstandingAudit: number;
  readonly outstandingTotal: number;
  readonly restartsInWindow: number;
  readonly breakerTripped: boolean;
}

export interface Argon2PasswordParameters {
  readonly memoryCostKiB: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export interface Argon2AuditParameters {
  readonly memoryCostKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

interface QueuedJob {
  readonly id: string;
  readonly lane: Argon2Lane;
  /** The operation this job's response frame must answer, and nothing else. */
  readonly op: Argon2WorkerRequest["op"];
  /** Expected digest byte length for a hash op; 0 for verification. */
  readonly hashLength: number;
  /** Single live owner of the plaintext until dispatch; cleared at handoff. */
  request: Argon2WorkerRequest | undefined;
  readonly resolve: (value: string | boolean) => void;
  readonly reject: (error: unknown) => void;
  settled: boolean;
}

interface ActiveJob {
  readonly job: QueuedJob;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface Slot {
  readonly index: number;
  handle: Argon2WorkerHandle | undefined;
  ready: boolean;
  active: ActiveJob | undefined;
  /** Bumped on every replacement so late events from a dead worker are ignored. */
  generation: number;
  /**
   * True from the moment this slot's handle is taken for retirement until its
   * `terminate()` is confirmed. It makes replacement one-settlement-only: a
   * crash, an exit, a post failure and a timeout racing on the same slot
   * produce exactly one retirement and exactly one replacement.
   */
  retiring: boolean;
  /** Bounded ready-handshake watchdog for the current generation. */
  readyTimer: ReturnType<typeof setTimeout> | undefined;
  /** Last job id settled on this slot, so a duplicate late frame is benign. */
  lastSettledId: string | undefined;
}

/**
 * The transferable buffers backing a request's secret bytes. Only views that
 * exactly cover their own ArrayBuffer are transferred: `Buffer.from(string)`
 * draws from Node's shared 8 KiB allocation pool, and transferring that shared
 * ArrayBuffer would detach unrelated live Buffers.
 */
function collectTransferables(request: Argon2WorkerRequest): ArrayBuffer[] {
  const views: Uint8Array[] = [];
  if (request.op === "hash-password") views.push(request.password, request.salt);
  else if (request.op === "verify-password") views.push(request.password);
  else views.push(request.value, request.salt);
  const buffers: ArrayBuffer[] = [];
  for (const view of views) {
    if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      && view.buffer instanceof ArrayBuffer && !buffers.includes(view.buffer)) {
      buffers.push(view.buffer);
    }
  }
  return buffers;
}

function zeroRequest(request: Argon2WorkerRequest | undefined): void {
  if (request === undefined) return;
  if (request.op === "hash-password") {
    request.password.fill(0);
    request.salt.fill(0);
  } else if (request.op === "verify-password") {
    request.password.fill(0);
  } else {
    request.value.fill(0);
    request.salt.fill(0);
  }
}

/**
 * What the pool decides a frame is, once it is read against the job that frame
 * claims to answer. Anything the worker could not lawfully have produced for
 * that exact operation is a `fault`, never a settlement.
 */
type FrameVerdict =
  | { readonly kind: "ready" }
  | { readonly kind: "result"; readonly digest: string }
  | { readonly kind: "verified"; readonly matches: boolean }
  | { readonly kind: "failed" }
  | { readonly kind: "stale" }
  | { readonly kind: "fault" };

const ENCODED_HASH_SHAPE = ARGON2ID_ENCODING;
const HEX_DIGEST = /^[0-9a-f]+$/;

/**
 * Operation-bound protocol validation.
 *
 * A frame is only accepted if it answers the in-flight job's own id AND carries
 * the exact response shape that job's operation can produce: an encoded
 * Argon2id string inside the ruled envelope for `hash-password`, a lowercase
 * hex digest of exactly the requested length for `hash-audit`, a boolean for
 * `verify-password`. A wrong-operation frame, an arbitrary string payload, or
 * an unsolicited frame is a protocol fault — the worker is no longer
 * trustworthy, so it is lost and replaced rather than believed.
 */
function readFrame(value: unknown, expected: ActiveJob | undefined,
  lastSettledId: string | undefined): FrameVerdict {
  if (typeof value !== "object" || value === null) return { kind: "fault" };
  const frame = value as Record<string, unknown>;
  if (frame.kind === "ready") return { kind: "ready" };
  if (typeof frame.id !== "string" || frame.id.length === 0) return { kind: "fault" };
  if (expected === undefined || expected.job.id !== frame.id) {
    // A duplicate frame for the job this slot just settled is a benign race;
    // a frame for any other id is not something this worker was ever asked for.
    return frame.id === lastSettledId ? { kind: "stale" } : { kind: "fault" };
  }
  if (frame.kind === "failed") {
    return typeof frame.code === "string" ? { kind: "failed" } : { kind: "fault" };
  }
  const job = expected.job;
  if (job.op === "verify-password") {
    return frame.kind === "verified" && typeof frame.matches === "boolean"
      ? { kind: "verified", matches: frame.matches }
      : { kind: "fault" };
  }
  if (frame.kind !== "result" || typeof frame.digest !== "string") return { kind: "fault" };
  const digest = frame.digest;
  if (job.op === "hash-password") {
    return parseEncodedArgon2id(digest) !== undefined && ENCODED_HASH_SHAPE.test(digest)
      ? { kind: "result", digest }
      : { kind: "fault" };
  }
  return digest.length === job.hashLength * 2 && HEX_DIGEST.test(digest)
    ? { kind: "result", digest }
    : { kind: "fault" };
}

export class Argon2WorkerPool {
  private readonly workerCount: number;
  private readonly credentialLaneCap: number;
  private readonly auditLaneCap: number;
  private readonly totalCap: number;
  private readonly jobTimeoutMs: number;
  private readonly restartBudget: number;
  private readonly restartWindowMs: number;
  private readonly closeDrainMs: number;
  private readonly readyHandshakeTimeoutMs: number;
  private readonly spawnWorker: (index: number) => Argon2WorkerHandle;
  private readonly now: () => number;

  /**
   * Every handle whose `terminate()` has been called but not yet confirmed.
   * A slot's replacement is not constructed until its entry leaves this map,
   * and `close()` awaits every entry, so the physical worker count never
   * transiently exceeds the ruled bound and close leaves nothing behind.
   */
  private readonly retiring = new Map<Argon2WorkerHandle, Promise<void>>();
  private readonly slots: Slot[] = [];
  private readonly queues: Record<Argon2Lane, QueuedJob[]> = { credential: [], audit: [] };
  private nextLane: Argon2Lane = "credential";
  private state: "OPEN" | "CLOSING" | "CLOSED" = "OPEN";
  private breakerTripped = false;
  private restarts: number[] = [];
  private readyPromise: Promise<void> | undefined;
  private readyWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  private closePromise: Promise<void> | undefined;

  constructor(options: Argon2WorkerPoolOptions = {}) {
    this.workerCount = options.workers ?? ARGON2_PROVISIONAL_BOUNDS.workers;
    this.credentialLaneCap = options.credentialLaneCap ?? ARGON2_PROVISIONAL_BOUNDS.credentialLaneCap;
    this.auditLaneCap = options.auditLaneCap ?? ARGON2_PROVISIONAL_BOUNDS.auditLaneCap;
    this.totalCap = options.totalCap ?? ARGON2_PROVISIONAL_BOUNDS.totalCap;
    this.jobTimeoutMs = options.jobTimeoutMs ?? ARGON2_PROVISIONAL_BOUNDS.jobTimeoutMs;
    this.restartBudget = options.restartBudget ?? ARGON2_PROVISIONAL_BOUNDS.restartBudget;
    this.restartWindowMs = options.restartWindowMs ?? ARGON2_PROVISIONAL_BOUNDS.restartWindowMs;
    this.closeDrainMs = options.closeDrainMs ?? ARGON2_PROVISIONAL_BOUNDS.closeDrainMs;
    this.readyHandshakeTimeoutMs = options.readyHandshakeTimeoutMs
      ?? ARGON2_PROVISIONAL_BOUNDS.readyHandshakeTimeoutMs;
    this.now = options.now ?? Date.now;
    this.spawnWorker = options.spawn ?? ((index) => Argon2WorkerPool.spawnRealWorker(index));
    if (!Number.isInteger(this.workerCount) || this.workerCount < 1) {
      throw new TypeError("ARGON2_POOL_WORKER_COUNT_INVALID");
    }
    if (this.credentialLaneCap < 1 || this.auditLaneCap < 1 || this.totalCap < 1) {
      throw new TypeError("ARGON2_POOL_CAPACITY_INVALID");
    }
    for (let index = 0; index < this.workerCount; index += 1) {
      const slot: Slot = {
        index, handle: undefined, ready: false, active: undefined, generation: 0,
        retiring: false, readyTimer: undefined, lastSettledId: undefined
      };
      this.slots.push(slot);
      this.startSlot(slot);
    }
  }

  /**
   * Spawns the real worker from its own module URL with an explicitly empty
   * `execArgv`. The empty array is load-bearing: inheriting the parent's flags
   * would make the worker depend on a tsx/Vitest loader that plain `node` does
   * not have, so the process would boot in tests and fail in production.
   */
  private static spawnRealWorker(index: number): Argon2WorkerHandle {
    return new Worker(new URL("./argon2-worker.ts", import.meta.url), {
      execArgv: [],
      name: `argon2-worker-${index}`
    }) as unknown as Argon2WorkerHandle;
  }

  private startSlot(slot: Slot): void {
    if (this.state !== "OPEN" || this.breakerTripped) return;
    const generation = slot.generation;
    let handle: Argon2WorkerHandle;
    try {
      handle = this.spawnWorker(slot.index);
    } catch {
      // A synchronous construction failure is a lost worker like any other: it
      // must consume the restart budget and be retried through the same
      // terminate-before-replace path, never abandon the slot. There is no
      // handle to retire, so replacement is immediate; the budget and the
      // breaker are what bound the retries.
      this.replaceSlot(slot);
      return;
    }
    slot.handle = handle;
    slot.ready = false;
    slot.lastSettledId = undefined;
    // A worker that never completes its handshake would otherwise leave
    // `ready()` and every queued job pending forever.
    const readyTimer = setTimeout(() => {
      if (slot.generation !== generation || slot.ready) return;
      this.onWorkerLost(slot);
    }, this.readyHandshakeTimeoutMs);
    readyTimer.unref?.();
    slot.readyTimer = readyTimer;
    handle.on("message", (value: unknown) => {
      if (slot.generation !== generation) return;
      this.onMessage(slot, value);
    });
    handle.on("error", () => {
      if (slot.generation !== generation) return;
      this.onWorkerLost(slot);
    });
    handle.on("exit", () => {
      if (slot.generation !== generation) return;
      this.onWorkerLost(slot);
    });
    // Deliberately left ref'd until the ready handshake lands: a booting worker
    // MUST hold the process open, or an otherwise-idle process can exit while
    // `ready()` is still pending. It is unref'd in `onMessage` once ready, and
    // re-ref'd only while it owns an in-flight job.
    //
    // (Order also matters for the unref itself: attaching a "message" listener
    // re-refs the underlying port, so unref'ing before registration is silently
    // undone.)
  }

  /** An idle, ready worker must not hold a terminating process open. */
  private unrefIfIdle(slot: Slot): void {
    if (slot.active === undefined) slot.handle?.unref();
  }

  private clearReadyTimer(slot: Slot): void {
    if (slot.readyTimer !== undefined) clearTimeout(slot.readyTimer);
    slot.readyTimer = undefined;
  }

  /**
   * Takes physical custody of a handle that is going away. The returned promise
   * is what gates this slot's replacement and what `close()` awaits.
   */
  private retire(handle: Argon2WorkerHandle): Promise<void> {
    const existing = this.retiring.get(handle);
    if (existing !== undefined) return existing;
    const confirmed = (async () => {
      try {
        await handle.terminate();
      } catch {
        // A worker that is already gone is a confirmed termination.
      }
    })().finally(() => {
      this.retiring.delete(handle);
    });
    this.retiring.set(handle, confirmed);
    return confirmed;
  }

  /**
   * Resolves once every worker has completed its ready handshake.
   *
   * Event-driven on purpose. A polling loop would have to hold an unref'd timer
   * (a ref'd one would keep an idle process alive), and once the last worker
   * became ready and unref'd itself nothing would remain to keep the loop
   * turning — the poll would never fire and this promise would never settle.
   */
  ready(): Promise<void> {
    if (this.readyPromise === undefined) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyWaiters.push({ resolve, reject });
      });
      this.settleReady();
    }
    return this.readyPromise;
  }

  /**
   * Resolves waiters as soon as every slot is ready. Called BEFORE workers are
   * unref'd, so the continuation is already queued as a microtask and cannot be
   * lost to an early exit.
   */
  private settleReady(): void {
    if (this.readyWaiters.length === 0) return;
    if (this.state !== "OPEN" || this.breakerTripped) {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      for (const waiter of waiters) {
        waiter.reject(new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
      }
      return;
    }
    if (!this.slots.every((slot) => slot.ready)) return;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const waiter of waiters) waiter.resolve();
  }

  stats(): Argon2PoolStats {
    const active = this.slots.filter((slot) => slot.active !== undefined).length;
    const activeCredential = this.slots.filter(
      (slot) => slot.active?.job.lane === "credential"
    ).length;
    const activeAudit = active - activeCredential;
    return Object.freeze({
      state: this.state,
      workers: this.slots.length,
      readyWorkers: this.slots.filter((slot) => slot.ready).length,
      liveHandles: this.slots.filter((slot) => slot.handle !== undefined).length
        + this.retiring.size,
      retiringHandles: this.retiring.size,
      active,
      queuedCredential: this.queues.credential.length,
      queuedAudit: this.queues.audit.length,
      queuedTotal: this.queues.credential.length + this.queues.audit.length,
      outstandingCredential: this.queues.credential.length + activeCredential,
      outstandingAudit: this.queues.audit.length + activeAudit,
      outstandingTotal: this.queues.credential.length + this.queues.audit.length + active,
      restartsInWindow: this.restarts.length,
      breakerTripped: this.breakerTripped
    });
  }

  // ------------------------------------------------------------- public API --

  async hashPassword(
    password: Uint8Array,
    salt: Uint8Array,
    parameters: Argon2PasswordParameters
  ): Promise<string> {
    const id = Argon2WorkerPool.newJobId();
    const result = await this.submit("credential", parameters.hashLength, {
      id,
      op: "hash-password",
      password,
      salt,
      memoryCostKiB: parameters.memoryCostKiB,
      timeCost: parameters.timeCost,
      parallelism: parameters.parallelism,
      hashLength: parameters.hashLength
    });
    if (typeof result !== "string") throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED");
    return result;
  }

  async verifyPassword(password: Uint8Array, encodedHash: string): Promise<boolean> {
    // A malformed, wrong-algorithm or out-of-envelope stored hash is decided
    // here, before the payload is retained or a worker slot is occupied. It is
    // a negative verification, not an infrastructure failure — and it can never
    // reach a memory-hard compute with attacker-chosen costs.
    if (parseEncodedArgon2id(encodedHash) === undefined) {
      password.fill(0);
      return false;
    }
    const id = Argon2WorkerPool.newJobId();
    const result = await this.submit("credential", 0, {
      id,
      op: "verify-password",
      password,
      encodedHash
    });
    if (typeof result !== "boolean") throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED");
    return result;
  }

  async hashAuditContext(
    value: Uint8Array,
    salt: Uint8Array,
    parameters: Argon2AuditParameters
  ): Promise<string> {
    const id = Argon2WorkerPool.newJobId();
    const result = await this.submit("audit", parameters.hashLength, {
      id,
      op: "hash-audit",
      value,
      salt,
      memoryCostKiB: parameters.memoryCostKiB,
      iterations: parameters.iterations,
      parallelism: parameters.parallelism,
      hashLength: parameters.hashLength
    });
    if (typeof result !== "string") throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED");
    return result;
  }

  /** Unpredictable, so a message cannot be forged or correlated by position. */
  private static newJobId(): string {
    return randomBytes(16).toString("hex");
  }

  private laneCap(lane: Argon2Lane): number {
    return lane === "credential" ? this.credentialLaneCap : this.auditLaneCap;
  }

  private outstanding(lane: Argon2Lane): number {
    const stats = this.stats();
    return lane === "credential" ? stats.outstandingCredential : stats.outstandingAudit;
  }

  private submit(
    lane: Argon2Lane,
    hashLength: number,
    request: Argon2WorkerRequest
  ): Promise<string | boolean> {
    // Capacity and liveness are decided BEFORE the payload is retained anywhere.
    // On refusal the caller's bytes are zeroed and never enter a queue node.
    if (this.state !== "OPEN" || this.breakerTripped) {
      zeroRequest(request);
      return Promise.reject(new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
    }
    if (this.outstanding(lane) >= this.laneCap(lane)
      || this.stats().outstandingTotal >= this.totalCap) {
      zeroRequest(request);
      return Promise.reject(new Argon2InfrastructureError("ARGON2_POOL_CAPACITY_EXHAUSTED"));
    }
    return new Promise<string | boolean>((resolve, reject) => {
      const job: QueuedJob = {
        id: request.id, lane, op: request.op, hashLength, request, resolve, reject, settled: false
      };
      this.queues[lane].push(job);
      this.pump();
    });
  }

  // ------------------------------------------------------------- scheduling --

  /**
   * Strict alternation between lanes whenever both are backlogged. This is the
   * starvation bound: a registration burst can delay an audit by at most one
   * dispatch per idle worker, and audit traffic can delay credentials likewise.
   */
  private takeNextJob(): QueuedJob | undefined {
    const order: Argon2Lane[] = this.nextLane === "credential"
      ? ["credential", "audit"]
      : ["audit", "credential"];
    for (const lane of order) {
      const queue = this.queues[lane];
      const job = queue.shift();
      if (job !== undefined) {
        this.nextLane = lane === "credential" ? "audit" : "credential";
        return job;
      }
    }
    return undefined;
  }

  private pump(): void {
    if (this.state === "CLOSED" || this.breakerTripped) return;
    for (const slot of this.slots) {
      // One in-flight job per worker.
      if (slot.active !== undefined || !slot.ready || slot.handle === undefined) continue;
      const job = this.takeNextJob();
      if (job === undefined) return;
      this.dispatch(slot, job);
    }
  }

  private dispatch(slot: Slot, job: QueuedJob): void {
    const request = job.request;
    if (request === undefined) return;
    const handle = slot.handle;
    if (handle === undefined) {
      this.queues[job.lane].unshift(job);
      return;
    }
    const active: ActiveJob = { job, timer: undefined };
    slot.active = active;
    handle.ref();
    try {
      handle.postMessage(request, collectTransferables(request));
    } catch {
      slot.active = undefined;
      handle.unref();
      zeroRequest(request);
      job.request = undefined;
      this.settle(job, new Argon2InfrastructureError("ARGON2_WORKER_FAILED"));
      this.onWorkerLost(slot);
      return;
    }
    // Ownership has moved to the worker thread; the parent's views are now
    // detached. Drop the reference so no queue node still points at the payload.
    job.request = undefined;
    // Timeout is measured from DISPATCH, not enqueue, so queue latency under
    // back-pressure can never manufacture a spurious timeout.
    active.timer = setTimeout(() => {
      if (slot.active !== active) return;
      this.finishActive(slot);
      this.settle(job, new Argon2InfrastructureError("ARGON2_JOB_TIMEOUT"));
      // The job is NOT retried: it carried a secret and has been settled once.
      // The worker is replaced only so later queued work has capacity.
      this.replaceSlot(slot);
    }, this.jobTimeoutMs);
    active.timer.unref?.();
  }

  private finishActive(slot: Slot): void {
    const active = slot.active;
    if (active === undefined) return;
    if (active.timer !== undefined) clearTimeout(active.timer);
    slot.lastSettledId = active.job.id;
    slot.active = undefined;
    slot.handle?.unref();
  }

  private settle(job: QueuedJob, error: unknown, value?: string | boolean): void {
    // Exactly-once settlement for every terminal path: result, protocol failure,
    // timeout, crash, breaker trip and close.
    if (job.settled) return;
    job.settled = true;
    zeroRequest(job.request);
    job.request = undefined;
    if (error !== undefined) job.reject(error);
    else job.resolve(value as string | boolean);
  }

  // ----------------------------------------------------------------- events --

  private onMessage(slot: Slot, value: unknown): void {
    const active = slot.active;
    const frame = readFrame(value, active, slot.lastSettledId);
    if (frame.kind === "fault") {
      // The protocol is no longer trustworthy on this worker: a wrong-operation
      // frame, an arbitrary payload or an unsolicited answer. Lose it rather
      // than believe it.
      this.onWorkerLost(slot);
      return;
    }
    if (frame.kind === "stale") return;
    if (frame.kind === "ready") {
      this.clearReadyTimer(slot);
      slot.ready = true;
      this.settleReady();
      this.pump();
      // If pump() gave this slot a job it is now ref'd and must stay that way.
      this.unrefIfIdle(slot);
      return;
    }
    if (active === undefined) return;
    this.finishActive(slot);
    if (frame.kind === "result") this.settle(active.job, undefined, frame.digest);
    else if (frame.kind === "verified") this.settle(active.job, undefined, frame.matches);
    else this.settle(active.job, new Argon2InfrastructureError("ARGON2_WORKER_FAILED"));
    this.pump();
  }

  private onWorkerLost(slot: Slot): void {
    const active = slot.active;
    if (active !== undefined) {
      this.finishActive(slot);
      // Rejected exactly once, never retried: the payload is gone with the
      // worker and re-running it would need the secret back.
      this.settle(active.job, new Argon2InfrastructureError("ARGON2_WORKER_FAILED"));
    }
    slot.ready = false;
    this.replaceSlot(slot);
  }

  /**
   * Retires this slot's worker and only then constructs its replacement.
   *
   * The old worker owns a 64 MiB Argon arena; starting a replacement while it
   * is still alive would transiently put three physical workers behind a
   * two-worker bound. `slot.retiring` makes concurrent crash/exit/post-failure/
   * timeout races collapse into exactly one retirement and one replacement.
   */
  private replaceSlot(slot: Slot): void {
    if (this.state !== "OPEN") return;
    if (slot.retiring) return;
    slot.generation += 1;
    const dead = slot.handle;
    slot.handle = undefined;
    slot.ready = false;
    this.clearReadyTimer(slot);
    // The budget and the breaker are charged at the moment of failure, not at
    // the moment termination is confirmed, so a worker that is slow (or
    // refuses) to die cannot postpone the breaker.
    const budgetRemains = this.recordFailure();
    if (dead === undefined) {
      if (budgetRemains) {
        this.startSlot(slot);
        this.pump();
      }
      return;
    }
    slot.retiring = true;
    void this.retire(dead).then(() => {
      slot.retiring = false;
      if (!budgetRemains || this.state !== "OPEN" || this.breakerTripped) return;
      this.startSlot(slot);
      this.pump();
    });
  }

  /** Rolling restart budget. Returns false once the breaker has tripped. */
  private recordFailure(): boolean {
    const now = this.now();
    this.restarts = this.restarts.filter((at) => now - at < this.restartWindowMs);
    this.restarts.push(now);
    if (this.restarts.length > this.restartBudget) {
      this.tripBreaker();
      return false;
    }
    return true;
  }

  /**
   * Fails the pool closed. Every queued and future promise settles with the
   * generic typed infrastructure error — never `false`, never a weaker hash.
   */
  private tripBreaker(): void {
    if (this.breakerTripped) return;
    this.breakerTripped = true;
    this.settleReady();
    this.rejectAllQueued(new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
    for (const slot of this.slots) {
      const active = slot.active;
      if (active !== undefined) {
        this.finishActive(slot);
        this.settle(active.job, new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
      }
      const handle = slot.handle;
      slot.handle = undefined;
      slot.ready = false;
      slot.generation += 1;
      this.clearReadyTimer(slot);
      if (handle !== undefined) void this.retire(handle);
    }
  }

  private rejectAllQueued(error: unknown): void {
    for (const lane of ["credential", "audit"] as const) {
      const queue = this.queues[lane];
      while (queue.length > 0) this.settle(queue.shift()!, error);
    }
  }

  // ------------------------------------------------------------------ close --

  /** Idempotent OPEN -> CLOSING -> CLOSED. Returns promptly and bounded. */
  close(): Promise<void> {
    this.closePromise ??= this.runClose();
    return this.closePromise;
  }

  private async runClose(): Promise<void> {
    if (this.state === "CLOSED") return;
    this.state = "CLOSING";
    this.settleReady();
    // 1. New work is refused from this point (submit checks state !== OPEN).
    // 2. Drain in-flight work to a bounded deadline so a live KDF can finish.
    const deadline = this.now() + this.closeDrainMs;
    while (this.slots.some((slot) => slot.active !== undefined) && this.now() < deadline) {
      // Deliberately ref'd: this timer IS the close operation. An unref'd one
      // lets an otherwise-idle process exit mid-close, so close() would never
      // settle and in-flight work would never be accounted for.
      await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
    }
    // 3. Anything still queued or still running is settled, exactly once, within
    //    the ruled drain deadline above.
    this.rejectAllQueued(new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
    for (const slot of this.slots) {
      const active = slot.active;
      if (active !== undefined) {
        this.finishActive(slot);
        this.settle(active.job, new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
      }
    }
    // 4. Take custody of every occupied slot, and force one more terminate on
    //    anything already retiring from an earlier replacement so a lost
    //    termination cannot leave a worker behind.
    for (const slot of this.slots) {
      const handle = slot.handle;
      slot.handle = undefined;
      slot.ready = false;
      slot.generation += 1;
      this.clearReadyTimer(slot);
      if (handle !== undefined) void this.retire(handle);
    }
    for (const handle of [...this.retiring.keys()]) {
      try {
        void Promise.resolve(handle.terminate()).catch(() => undefined);
      } catch {
        // Already gone; the pending retirement below still governs.
      }
    }
    // 5. Await BOTH the just-terminated handles and every still-retiring one,
    //    so close leaves zero workers and zero outstanding jobs.
    await Promise.all([...this.retiring.values()]);
    this.state = "CLOSED";
  }
}
