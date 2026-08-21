// The ONE production module allowed to import hash-wasm.
//
// It runs only inside a worker thread, so every Argon2 compute happens off the
// request/event-loop thread. It is deliberately written in strip-only
// TypeScript — type annotations and interfaces only, no enums, namespaces,
// decorators or parameter properties — so Node 22.23.1 can execute it directly
// with `execArgv: []`. It must never import ./index.ts, or the main-thread
// crypto surface would be pulled into the worker and hash-wasm would become
// reachable from the request path again.
//
// Secrets: request payloads carry passwords and audit source values as
// transferred byte arrays. Every copy this module can reach is zeroed in a
// `finally`, and no failure path ever puts an input byte into a message,
// an Error, or a log line.

import { parentPort } from "node:worker_threads";
import { argon2Verify, argon2id } from "hash-wasm";

export type Argon2WorkerRequest =
  | {
    readonly id: string;
    readonly op: "hash-password";
    readonly password: Uint8Array;
    readonly salt: Uint8Array;
    readonly memoryCostKiB: number;
    readonly timeCost: number;
    readonly parallelism: number;
    readonly hashLength: number;
  }
  | {
    readonly id: string;
    readonly op: "verify-password";
    readonly password: Uint8Array;
    readonly encodedHash: string;
  }
  | {
    readonly id: string;
    readonly op: "hash-audit";
    readonly value: Uint8Array;
    readonly salt: Uint8Array;
    readonly memoryCostKiB: number;
    readonly iterations: number;
    readonly parallelism: number;
    readonly hashLength: number;
  };

export type Argon2WorkerResponse =
  | { readonly kind: "ready" }
  | { readonly kind: "result"; readonly id: string; readonly digest: string }
  | { readonly kind: "verified"; readonly id: string; readonly matches: boolean }
  | { readonly kind: "failed"; readonly id: string; readonly code: string };

// Generic, constant and secret-free. The parent maps this onto its own typed
// infrastructure error; it must never be turned into `false` or a weaker hash.
export const ARGON2_WORKER_JOB_FAILED = "ARGON2_WORKER_JOB_FAILED";

/**
 * DELIBERATE MIRROR of `ARGON2ID_ENCODING_BOUNDS` and `parseEncodedArgon2id` in
 * ./argon2-worker-pool.ts.
 *
 * It cannot be a shared import: this module is loaded by plain `node` with
 * `execArgv: []`, where a `./x.js` specifier does not resolve to `x.ts` and a
 * `./x.ts` specifier does not typecheck under the repo's NodeNext settings. So
 * the check is duplicated rather than dropped — the worker must never hand an
 * unvalidated encoding to argon2Verify even if the pool is bypassed.
 *
 * tests/unit/argon2-worker-pool.test.ts pins the two copies to identical
 * behaviour over a shared corpus, so drift is a test failure, not a silent hole.
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
 * Parses an encoded Argon2id string and enforces the accepted policy/pool
 * resource envelope. Returns `undefined` for anything malformed, for a
 * different algorithm or version, and for embedded costs outside the envelope —
 * so hostile or corrupted stored data can never reach a memory-hard compute.
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

function zero(bytes: Uint8Array | undefined): void {
  if (bytes !== undefined) bytes.fill(0);
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isBytes(value: unknown): boolean {
  return value instanceof Uint8Array;
}

/**
 * Structural validation of an untrusted message. The parent is the only sender,
 * but the worker still refuses anything it cannot interpret exactly rather than
 * coercing it into an Argon2 call with attacker-influenced parameters.
 */
export function isArgon2WorkerRequest(value: unknown): value is Argon2WorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (candidate.op === "hash-password") {
    return isBytes(candidate.password) && isBytes(candidate.salt)
      && isPositiveInteger(candidate.memoryCostKiB) && isPositiveInteger(candidate.timeCost)
      && isPositiveInteger(candidate.parallelism) && isPositiveInteger(candidate.hashLength);
  }
  if (candidate.op === "verify-password") {
    return isBytes(candidate.password) && typeof candidate.encodedHash === "string";
  }
  if (candidate.op === "hash-audit") {
    return isBytes(candidate.value) && isBytes(candidate.salt)
      && isPositiveInteger(candidate.memoryCostKiB) && isPositiveInteger(candidate.iterations)
      && isPositiveInteger(candidate.parallelism) && isPositiveInteger(candidate.hashLength);
  }
  return false;
}

export type Argon2Verifier = (input: {
  readonly password: Uint8Array;
  readonly hash: string;
}) => Promise<boolean>;

/**
 * Executes one validated request. Exported for direct unit testing without a
 * live thread; the message handler below is a thin adapter over it.
 *
 * `verify` is injectable for one reason only: proving that a well-formed,
 * in-envelope encoding whose compute path throws becomes a `failed` frame
 * rather than `false`. Production always uses hash-wasm's `argon2Verify`.
 */
export async function executeArgon2WorkerRequest(
  request: Argon2WorkerRequest,
  verify: Argon2Verifier = argon2Verify
): Promise<Argon2WorkerResponse> {
  try {
    if (request.op === "hash-password") {
      try {
        const digest = await argon2id({
          password: request.password,
          salt: request.salt,
          memorySize: request.memoryCostKiB,
          iterations: request.timeCost,
          parallelism: request.parallelism,
          hashLength: request.hashLength,
          outputType: "encoded"
        });
        return { kind: "result", id: request.id, digest };
      } finally {
        zero(request.password);
        zero(request.salt);
      }
    }
    if (request.op === "verify-password") {
      try {
        // Malformed, wrong-algorithm, wrong-version and out-of-envelope
        // encodings are decided HERE, before any memory-hard work, and are the
        // only encodings that become `false` without a compute.
        if (parseEncodedArgon2id(request.encodedHash) === undefined) {
          return { kind: "verified", id: request.id, matches: false };
        }
        // Past pre-validation the encoding is well-formed and inside the ruled
        // envelope, so a throw here is a computation/runtime failure (WASM,
        // OOM, allocation refusal) — never a wrong password. It propagates to
        // the generic `failed` frame below and becomes the caller's typed
        // retryable infrastructure error, never `false` and never a 401.
        const matches = await verify({
          password: request.password,
          hash: request.encodedHash
        });
        return { kind: "verified", id: request.id, matches };
      } finally {
        zero(request.password);
      }
    }
    try {
      const digest = await argon2id({
        password: request.value,
        salt: request.salt,
        memorySize: request.memoryCostKiB,
        iterations: request.iterations,
        parallelism: request.parallelism,
        hashLength: request.hashLength,
        outputType: "hex"
      });
      return { kind: "result", id: request.id, digest };
    } finally {
      zero(request.value);
      zero(request.salt);
    }
  } catch {
    // Deliberately discards the caught value: hash-wasm error text can echo
    // input-derived detail, and this message crosses a thread boundary.
    return { kind: "failed", id: request.id, code: ARGON2_WORKER_JOB_FAILED };
  }
}

if (parentPort !== null) {
  const port = parentPort;
  port.on("message", (message: unknown) => {
    if (!isArgon2WorkerRequest(message)) {
      const id = typeof (message as { id?: unknown })?.id === "string"
        ? (message as { id: string }).id
        : "";
      port.postMessage({ kind: "failed", id, code: ARGON2_WORKER_JOB_FAILED });
      return;
    }
    void executeArgon2WorkerRequest(message).then((response) => {
      port.postMessage(response);
    }, () => {
      port.postMessage({ kind: "failed", id: message.id, code: ARGON2_WORKER_JOB_FAILED });
    });
  });
  port.postMessage({ kind: "ready" });
}
