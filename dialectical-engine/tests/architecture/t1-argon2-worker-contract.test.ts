import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Argon2WorkerPool,
  AuditContextHasher
} from "../../packages/crypto/src/index.js";
import { PostgresIdentityRepository } from "../../packages/db/src/identity.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  AuthFlowError,
  InProcessAuthRateLimiter,
  RegistrationService
} from "../../apps/api/src/registration.js";

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cryptoSrc = join(repoRoot, "packages/crypto/src");
const workerPath = join(cryptoSrc, "argon2-worker.ts");
const poolPath = join(cryptoSrc, "argon2-worker-pool.ts");
/**
 * The auth policy, parsed on FIRST USE rather than at module scope.
 *
 * A ruled row that violates its own derivation must fail the assertion that
 * OWNS it. Parsing here at import time would instead collapse the entire file
 * before a single test was defined, which hides which contract actually broke.
 */
let parsedAuthPolicy: ReturnType<typeof authPolicyFromRegisterRows> | undefined;
function authPolicy(): ReturnType<typeof authPolicyFromRegisterRows> {
  parsedAuthPolicy ??= authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  return parsedAuthPolicy;
}
const auditKdf = (): ReturnType<typeof authPolicyFromRegisterRows>["auditSourceIpKdf"] =>
  authPolicy().auditSourceIpKdf;
const passwordKdf = (): ReturnType<typeof authPolicyFromRegisterRows>["password"]["argon2id"] =>
  authPolicy().password.argon2id;

let scratch: string;
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "t1-argon2-contract-"));
});
afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
});

function productionSources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : productionSources(path);
    return entry.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

describe("T1 runtime architecture — hash-wasm containment", () => {
  it("lets exactly one production module import hash-wasm", () => {
    const importers = ["apps", "packages", "tools", "acceptance"]
      .flatMap((root) => {
        try {
          return productionSources(join(repoRoot, root));
        } catch {
          return [];
        }
      })
      .filter((path) => /from\s+["']hash-wasm["']|require\(\s*["']hash-wasm["']\s*\)|import\(\s*["']hash-wasm["']\s*\)/
        .test(readFileSync(path, "utf8")));

    expect(importers).toEqual([workerPath]);
  });

  it("keeps the request-path crypto surface free of any Argon2 call", () => {
    const hashWasmImport =
      /from\s+["']hash-wasm["']|require\(\s*["']hash-wasm["']\s*\)|import\(\s*["']hash-wasm["']\s*\)/;
    const index = readFileSync(join(cryptoSrc, "index.ts"), "utf8");
    // Prose may name hash-wasm; an import or a call may not.
    expect(index).not.toMatch(hashWasmImport);
    expect(index).not.toMatch(/\bargon2id\s*\(/);
    expect(index).not.toMatch(/\bargon2Verify\s*\(/);
    const pool = readFileSync(poolPath, "utf8");
    expect(pool).not.toMatch(hashWasmImport);
    expect(pool).not.toMatch(/\bargon2id\s*\(/);
    expect(pool).not.toMatch(/\bargon2Verify\s*\(/);
  });

  it("spawns the worker from its own URL with an explicitly empty execArgv", () => {
    const pool = readFileSync(poolPath, "utf8");
    expect(pool).toMatch(/new URL\(\s*["']\.\/argon2-worker\.ts["']\s*,\s*import\.meta\.url\s*\)/);
    expect(pool).toMatch(/execArgv:\s*\[\]/);
    // Never inherit the parent loader flags.
    expect(pool).not.toMatch(/execArgv:\s*process\.execArgv/);
  });

  it("keeps the worker entry strip-only and free of the main crypto surface", () => {
    const worker = readFileSync(workerPath, "utf8");
    // No construct Node's type stripper refuses.
    expect(worker).not.toMatch(/^\s*(?:export\s+)?enum\s/m);
    expect(worker).not.toMatch(/^\s*(?:export\s+)?namespace\s/m);
    expect(worker).not.toMatch(/^\s*@[A-Za-z]/m);
    expect(worker).not.toMatch(/constructor\s*\([^)]*\b(?:private|public|protected|readonly)\b/);
    // Never pulls index.ts (which would drag the main-thread surface along).
    expect(worker).not.toMatch(/from\s+["']\.\/index/);
  });
});

describe("T1 runtime matrix — the actual worker boots on every runtime", () => {
  const bootScript = (): string => `
    import { Worker } from "node:worker_threads";
    const worker = new Worker(new URL(${JSON.stringify(`file://${workerPath}`)}), {
      execArgv: [], name: "argon2-matrix"
    });
    const ready = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => reject(new Error("early exit " + code)));
    });
    if (ready?.kind !== "ready") throw new Error("no ready handshake");
    const password = new TextEncoder().encode("runtime-matrix");
    const salt = new Uint8Array(16).fill(5);
    const digest = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage({
        id: "matrix-1", op: "hash-password", password, salt,
        memoryCostKiB: ${passwordKdf().memoryCostKiB}, timeCost: ${passwordKdf().timeCost},
        parallelism: ${passwordKdf().parallelism}, hashLength: ${passwordKdf().hashLength}
      }, [password.buffer, salt.buffer]);
    });
    if (digest?.kind !== "result" || !digest.digest.startsWith("$argon2id$")) {
      throw new Error("bad digest " + JSON.stringify(digest));
    }
    // The worker must not have inherited the parent's loader flags.
    console.log(JSON.stringify({
      ok: true, threadId: worker.threadId, parentExecArgv: process.execArgv
    }));
    await worker.terminate();
  `;

  it("boots under plain node", async () => {
    const script = join(scratch, "matrix-plain.mjs");
    await writeFile(script, bootScript(), "utf8");
    const { stdout } = await run(process.execPath, [script], { cwd: repoRoot });
    const result = JSON.parse(stdout.trim().split("\n").pop()!);
    expect(result.ok).toBe(true);
  }, 120_000);

  it("boots under node --import tsx, without depending on that loader", async () => {
    const script = join(scratch, "matrix-tsx.mjs");
    await writeFile(script, bootScript(), "utf8");
    const { stdout } = await run(
      process.execPath, ["--import", "tsx", script], { cwd: repoRoot }
    );
    const result = JSON.parse(stdout.trim().split("\n").pop()!);
    expect(result.ok).toBe(true);
    // The parent really did carry loader flags the worker did NOT inherit.
    expect(result.parentExecArgv.join(" ")).toContain("tsx");
  }, 120_000);

  it("boots under Vitest, in this very process", async () => {
    const pool = new Argon2WorkerPool({ workers: 1 });
    try {
      await pool.ready();
      const digest = await pool.hashPassword(
        new TextEncoder().encode("vitest-runtime"),
        new Uint8Array(16).fill(4),
        passwordKdf()
      );
      expect(digest).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    } finally {
      await pool.close();
    }
  }, 120_000);
});

describe("T1 responsiveness — the request thread stays live during real Argon2", () => {
  it("keeps the event loop turning through eight real password KDFs", async () => {
    const script = join(scratch, "responsiveness.mjs");
    await writeFile(script, `
      const { Argon2WorkerPool } = await import(${JSON.stringify(`file://${poolPath}`)});
      const pool = new Argon2WorkerPool({ workers: 2 });
      await pool.ready();

      // Warm both real workers so WASM compile cost is not measured as latency.
      await Promise.all([0, 1].map(() => pool.hashAuditContext(
        new TextEncoder().encode("warm"), new Uint8Array(32).fill(1),
        { memoryCostKiB: ${auditKdf().memoryCostKiB}, iterations: ${auditKdf().iterations},
          parallelism: ${auditKdf().parallelism}, hashLength: ${auditKdf().hashLength} }
      )));

      let ticks = 0, immediates = 0, lastAt = performance.now(), maxGap = 0;
      const gaps = [];
      const interval = setInterval(() => {
        const now = performance.now();
        gaps.push(now - lastAt); maxGap = Math.max(maxGap, now - lastAt);
        lastAt = now; ticks += 1;
      }, 1);
      let stop = false;
      const pump = () => { if (stop) return; immediates += 1; setImmediate(pump); };
      setImmediate(pump);

      // A single password KDF must allow MULTIPLE heartbeats while pending.
      const singleBefore = { ticks, immediates };
      const singlePending = pool.hashPassword(
        new TextEncoder().encode("single"), new Uint8Array(16).fill(2),
        { memoryCostKiB: ${passwordKdf().memoryCostKiB}, timeCost: ${passwordKdf().timeCost},
          parallelism: ${passwordKdf().parallelism}, hashLength: ${passwordKdf().hashLength} }
      );
      await singlePending;
      const singleInFlight = { ticks: ticks - singleBefore.ticks, immediates: immediates - singleBefore.immediates };

      // A single audit KDF likewise.
      const auditBefore = { ticks, immediates };
      await pool.hashAuditContext(
        new TextEncoder().encode("debateai:audit-source-ip:v1\\u0000203.0.113.5"),
        new Uint8Array(32).fill(3),
        { memoryCostKiB: ${auditKdf().memoryCostKiB}, iterations: ${auditKdf().iterations},
          parallelism: ${auditKdf().parallelism}, hashLength: ${auditKdf().hashLength} }
      );
      const auditInFlight = { ticks: ticks - auditBefore.ticks, immediates: immediates - auditBefore.immediates };

      // The eight-password pool run.
      const batchGapMark = gaps.length;
      const batchBefore = { ticks, immediates };
      const batchStart = performance.now();
      await Promise.all(Array.from({ length: 8 }, (_, i) => pool.hashPassword(
        new TextEncoder().encode("batch-" + i), new Uint8Array(16).fill(i + 1),
        { memoryCostKiB: ${passwordKdf().memoryCostKiB}, timeCost: ${passwordKdf().timeCost},
          parallelism: ${passwordKdf().parallelism}, hashLength: ${passwordKdf().hashLength} }
      )));
      const batchMs = performance.now() - batchStart;
      const batchTicks = ticks - batchBefore.ticks;
      const batchImmediates = immediates - batchBefore.immediates;
      const batchGaps = gaps.slice(batchGapMark).sort((a, b) => a - b);
      const p99 = batchGaps[Math.max(0, Math.ceil(0.99 * batchGaps.length) - 1)] ?? 0;

      stop = true; clearInterval(interval);
      await pool.close();
      console.log(JSON.stringify({
        singleInFlight, auditInFlight, batchMs, batchTicks, batchImmediates,
        p99EventLoopGapMs: p99, maxEventLoopGapMs: maxGap
      }));
    `, "utf8");

    const { stdout } = await run(process.execPath, [script], { cwd: repoRoot });
    const report = JSON.parse(stdout.trim().split("\n").pop()!);

    // Multiple heartbeats on BOTH probes while each promise was still pending.
    expect(report.singleInFlight.ticks).toBeGreaterThan(1);
    expect(report.singleInFlight.immediates).toBeGreaterThan(1);
    expect(report.auditInFlight.ticks).toBeGreaterThan(1);
    expect(report.auditInFlight.immediates).toBeGreaterThan(1);
    // Real Argon work still happened: eight 64 MiB/t=3 jobs on two workers.
    expect(report.batchMs).toBeGreaterThan(100);
    expect(report.batchTicks).toBeGreaterThan(50);
    expect(report.p99EventLoopGapMs).toBeLessThanOrEqual(50);
  }, 180_000);
});

describe("T1 real resource bound", () => {
  it("measures peak RSS and queue occupancy WHILE real maximum-cost jobs are in flight", async () => {
    const script = join(scratch, "resource.mjs");
    await writeFile(script, `
      const { Argon2WorkerPool } = await import(${JSON.stringify(`file://${poolPath}`)});
      const { threadId } = await import("node:worker_threads");
      const seen = new Set();
      const pool = new Argon2WorkerPool({ workers: 2 });
      // Observe the real thread ids through the pool's own slots.
      await pool.ready();
      for (const slot of pool.slots) seen.add(slot.handle.threadId);

      // Deterministic warm-up: both WASM arenas are compiled and mapped BEFORE
      // the baseline, so first-touch cost is never read as in-flight growth.
      await Promise.all([0, 1].map((index) => pool.hashPassword(
        new TextEncoder().encode("warm-" + index), new Uint8Array(16).fill(index + 1),
        { memoryCostKiB: ${passwordKdf().memoryCostKiB}, timeCost: ${passwordKdf().timeCost},
          parallelism: ${passwordKdf().parallelism}, hashLength: ${passwordKdf().hashLength} }
      )));
      const before = process.memoryUsage().rss;

      // Sample the process WHILE the jobs run. The event loop is free — that is
      // the property under test — so a 5 ms sampler really does fire.
      let samples = 0;
      let peakRss = before;
      let maxQueued = 0;
      let maxActive = 0;
      let maxOutstanding = 0;
      const sampler = setInterval(() => {
        samples += 1;
        const stats = pool.stats();
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        maxQueued = Math.max(maxQueued, stats.queuedTotal);
        maxActive = Math.max(maxActive, stats.active);
        maxOutstanding = Math.max(maxOutstanding, stats.outstandingTotal);
      }, 5);

      // Saturate BOTH workers with maximum-cost 64 MiB jobs, deeper than the
      // worker count so a queue provably forms.
      const started = performance.now();
      await Promise.all(Array.from({ length: 8 }, (_, i) => pool.hashPassword(
        new TextEncoder().encode("rss-" + i), new Uint8Array(16).fill(i + 1),
        { memoryCostKiB: ${passwordKdf().memoryCostKiB}, timeCost: ${passwordKdf().timeCost},
          parallelism: ${passwordKdf().parallelism}, hashLength: ${passwordKdf().hashLength} }
      )));
      const inFlightMs = performance.now() - started;
      clearInterval(sampler);
      const settledRss = process.memoryUsage().rss;
      const statsAtSettle = pool.stats();

      const closeStart = performance.now();
      await pool.close();
      const closeMs = performance.now() - closeStart;
      const closed = pool.stats();
      console.log(JSON.stringify({
        mainThreadId: threadId,
        workerThreadIds: [...seen],
        workerCount: statsAtSettle.workers,
        liveHandlesAtSettle: statsAtSettle.liveHandles,
        inFlightSamples: samples,
        inFlightMs: +inFlightMs.toFixed(1),
        rssBeforeMiB: +(before / 1048576).toFixed(1),
        rssInFlightPeakMiB: +(peakRss / 1048576).toFixed(1),
        rssAfterSettleMiB: +(settledRss / 1048576).toFixed(1),
        maxQueuedInFlight: maxQueued,
        maxActiveInFlight: maxActive,
        maxOutstandingInFlight: maxOutstanding,
        queuedAtSettle: statsAtSettle.queuedTotal,
        closeMs: +closeMs.toFixed(1),
        state: closed.state,
        liveHandlesAfterClose: closed.liveHandles,
        outstandingAfterClose: closed.outstandingTotal
      }));
    `, "utf8");

    const { stdout } = await run(process.execPath, [script], { cwd: repoRoot });
    const report = JSON.parse(stdout.trim().split("\n").pop()!);

    // Exact worker count and distinct non-main threads.
    expect(report.workerCount).toBe(2);
    expect(report.liveHandlesAtSettle).toBe(2);
    expect(report.workerThreadIds).toHaveLength(2);
    expect(new Set(report.workerThreadIds).size).toBe(2);
    expect(report.workerThreadIds).not.toContain(report.mainThreadId);

    // The measurement really was taken during flight, not after it.
    expect(report.inFlightSamples).toBeGreaterThan(1);
    expect(report.maxActiveInFlight).toBe(2);
    expect(report.maxQueuedInFlight).toBeGreaterThanOrEqual(1);
    expect(report.maxOutstandingInFlight).toBeGreaterThanOrEqual(3);
    expect(report.queuedAtSettle).toBe(0);
    // A peak sampled in flight can never be below the settled reading; if it
    // were, the sampler had not observed the working set at all.
    expect(report.rssInFlightPeakMiB).toBeGreaterThanOrEqual(report.rssAfterSettleMiB - 1);

    expect(report.state).toBe("CLOSED");
    expect(report.liveHandlesAfterClose).toBe(0);
    expect(report.outstandingAfterClose).toBe(0);
    expect(report.closeMs).toBeLessThan(5_000);
    // Published for V ratification; asserted only as a sanity ceiling so the
    // measurement cannot silently drift into a multi-GiB allocation.
    expect(report.rssInFlightPeakMiB).toBeLessThan(1_024);
    console.info(`[T1 REWORK1 IN-FLIGHT RESOURCE] ${JSON.stringify(report)}`);
  }, 180_000);

  it("does not keep an otherwise-idle process alive", async () => {
    const script = join(scratch, "exit.mjs");
    await writeFile(script, `
      const { Argon2WorkerPool } = await import(${JSON.stringify(`file://${poolPath}`)});
      const pool = new Argon2WorkerPool({ workers: 2 });
      await pool.ready();
      console.log("READY");
      // Deliberately no close(): idle workers are unref'd, so the process must
      // still exit on its own.
    `, "utf8");
    const started = Date.now();
    const { stdout } = await run(process.execPath, [script], { cwd: repoRoot, timeout: 30_000 });
    expect(stdout).toContain("READY");
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});

describe("T1 database ordering — no KDF after connect/BEGIN", () => {
  it("finishes both audit derivations before pool.connect() and BEGIN", async () => {
    const events: string[] = [];
    let releaseKdf!: () => void;
    const gate = new Promise<void>((resolve) => { releaseKdf = resolve; });

    const barrierExecutor = {
      async hashPassword(): Promise<string> { throw new Error("unused"); },
      async verifyPassword(): Promise<boolean> { throw new Error("unused"); },
      async hashAuditContext(value: Uint8Array): Promise<string> {
        const decoded = new TextDecoder().decode(value);
        const label = decoded.includes("audit-source-ip") ? "kdf:ip" : "kdf:ua";
        events.push(`${label}:start`);
        await gate;
        events.push(`${label}:end`);
        return "a".repeat(64);
      }
    };

    const client = {
      async query(text: string) {
        const sql = String(text).trim().split("\n")[0]!.trim().slice(0, 24);
        events.push(`query:${sql}`);
        return { rows: [], rowCount: 0 };
      },
      release() { events.push("release"); }
    };
    const fakePool = {
      async connect() {
        events.push("connect");
        return client;
      }
    };

    const hasher = new AuditContextHasher(
      barrierExecutor, Buffer.alloc(32, 0x6e), auditKdf()
    );
    const repository = new PostgresIdentityRepository(
      fakePool as never, hasher
    );

    const pending = repository.recordRegistrationFailure({
      correlationId: "11111111-1111-4111-8111-111111111111",
      occurredAt: new Date("2026-08-21T12:00:00.000Z"),
      source: { ip: "203.0.113.7", userAgent: "T1", requestId: "r-1" }
    });

    // While both KDFs are still outstanding, NO connection may have been taken.
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toContain("kdf:ip:start");
    expect(events).not.toContain("connect");
    expect(events.some((event) => event.startsWith("query:"))).toBe(false);

    releaseKdf();
    await pending;

    const connectAt = events.indexOf("connect");
    const beginAt = events.findIndex((event) => event.startsWith("query:BEGIN"));
    const lastKdfAt = events.map((event, index) => ({ event, index }))
      .filter(({ event }) => event.endsWith(":end"))
      .map(({ index }) => index)
      .pop()!;

    expect(connectAt).toBeGreaterThan(-1);
    expect(beginAt).toBeGreaterThan(-1);
    // Both derivations finished strictly before the connection and BEGIN.
    expect(lastKdfAt).toBeLessThan(connectAt);
    expect(connectAt).toBeLessThan(beginAt);
    // And no KDF ever started after the transaction opened.
    expect(events.slice(connectAt).some((event) => event.startsWith("kdf:"))).toBe(false);
    hasher.close();
  }, 60_000);

  it("performs equivalent audit KDF work for both registration branches", () => {
    const identity = readFileSync(join(repoRoot, "packages/db/src/identity.ts"), "utf8");
    // The single preparation sits above the transaction, so the duplicate and
    // created branches consume the same digests.
    const prepareIndex = identity.indexOf("const prepared = await this.prepareAuditContext(input.source);");
    const transactionIndex = identity.indexOf("return this.transaction(async (client) => {");
    expect(prepareIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeLessThan(transactionIndex);
    // appendAudit can no longer derive anything: it only takes prepared digests.
    expect(identity).not.toMatch(/hashAuditSourceIp|hashAuditUserAgent/);
    expect(identity).toMatch(/private async appendAudit\(\s*client: PoolClient,\s*prepared: PreparedAuditContext,/);
  });

  it("creates exactly one process-owned pool, ready before listen", () => {
    const main = readFileSync(join(repoRoot, "apps/api/src/main.ts"), "utf8");
    expect(main.match(/new Argon2WorkerPool\(/g) ?? []).toHaveLength(1);
    const poolAt = main.indexOf("new Argon2WorkerPool(");
    const readyAt = main.indexOf("await argon2Pool.ready()");
    const repositoryAt = main.indexOf("new PostgresIdentityRepository(");
    const listenAt = main.indexOf("api.listen(");
    expect(poolAt).toBeLessThan(readyAt);
    expect(readyAt).toBeLessThan(repositoryAt);
    expect(readyAt).toBeLessThan(listenAt);
    // The same instance reaches both consumers.
    expect(main).toMatch(/new AuditContextHasher\(\s*argon2Pool,/);
    expect(main).toMatch(/argon2:\s*argon2Pool/);
    // Close is wired to Fastify's onClose, with no signal orchestration here.
    expect(main).toMatch(/addHook\(\s*["']onClose["']/);
    expect(main).not.toMatch(/process\.on\(\s*["']SIG/);
  });
});

// ==========================================================================
// REWORK 2 R4 — the T1 close primitive must drain post-response work BEFORE
// it tears down the Argon2 surface that work depends on.
//
// These tests execute the ACTUAL bytes of the `onClose` hook in
// apps/api/src/main.ts. main.ts is a boot script with top-level side effects
// (environment, KEK, Postgres pool, policy read) so it cannot be imported; the
// hook body is therefore lifted verbatim out of the shipped source and run
// against instrumented doubles for its three free identifiers. Reversing the
// order in main.ts turns these RED, and the HARNESS CONTROL below proves the
// probe itself can fail.
// ==========================================================================

const AsyncFunction = Object.getPrototypeOf(async function noop() { /* probe */ }).constructor;

/** Lifts the exact body of `api.addHook("onClose", async () => { ... })`. */
function extractOnCloseBody(source: string): string {
  const opener = `api.addHook("onClose", async () => {`;
  const start = source.indexOf(opener);
  if (start < 0) throw new Error("T1_CLOSE_PRIMITIVE_HOOK_NOT_FOUND");
  let depth = 1;
  let index = start + opener.length;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    index += 1;
  }
  if (depth !== 0) throw new Error("T1_CLOSE_PRIMITIVE_HOOK_UNBALANCED");
  return source.slice(start + opener.length, index - 1);
}

interface CloseHarness {
  readonly events: string[];
  readonly registration: unknown;
  readonly auditContextHasher: unknown;
  readonly argon2Pool: unknown;
  releasePostwork(): void;
  releaseAdmissions(): void;
}

/**
 * Doubles whose ONLY behaviour is to record when they were reached. The mail
 * drain is deliberately blocked on a gate, and the audit-context hash it
 * performs is recorded when it finally runs, so "the pool closed before a
 * blocked postwork audit finished" is directly observable.
 */
function closeHarness(): CloseHarness {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let releaseAdmission!: () => void;
  const admissionGate = new Promise<void>((resolve) => { releaseAdmission = resolve; });
  return {
    events,
    releasePostwork: () => release(),
    releaseAdmissions: () => releaseAdmission(),
    registration: {
      // The admission drain is the FIRST thing shutdown does. Until it returns,
      // a registration is still in flight and can still enqueue mail and audit
      // work — which is exactly why the mail and refusal-audit drains below
      // cannot be trusted to be complete if they run before it.
      async drainRegistrationAdmissions(): Promise<void> {
        events.push("drainRegistrationAdmissions:start");
        await admissionGate;
        events.push("lateRegistrationEnqueuesMailWork");
        events.push("drainRegistrationAdmissions:end");
      },
      async drainMailDispatches(): Promise<void> {
        events.push("drainMailDispatches:start");
        await gate;
        // What the blocked postwork actually does: an audit-context KDF that
        // runs through the very pool this hook is about to close.
        events.push("postworkAuditContextHash");
        events.push("drainMailDispatches:end");
      },
      async drainRateLimitAuditFlushes(): Promise<void> {
        events.push("drainRefusalAudits:start");
        await new Promise<void>((resolve) => setImmediate(resolve));
        events.push("refusalAuditContextHash");
        events.push("drainRefusalAudits:end");
      },
      drainMailCapacitySignals(): void { events.push("drainMailCapacitySignals"); }
    },
    auditContextHasher: {
      close(): void { events.push("auditContextHasher.close"); }
    },
    argon2Pool: {
      async close(): Promise<void> { events.push("argon2Pool.close"); }
    }
  };
}

describe("T1 rework2 R4 — shutdown drains post-response work before closing Argon", () => {
  const mainPath = join(repoRoot, "apps/api/src/main.ts");

  it("awaits mail dispatch and refusal-audit work before the hasher and the pool close", async () => {
    const body = extractOnCloseBody(readFileSync(mainPath, "utf8"));
    const run = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", body
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const harness = closeHarness();

    const closing = run(harness.registration, harness.auditContextHasher, harness.argon2Pool);
    // NON-VACUITY: the admission drain really is blocking here, and nothing
    // downstream of it has started. If it were not, the ordering assertions
    // below would hold for free.
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(harness.events).toContain("drainRegistrationAdmissions:start");
    expect(harness.events).not.toContain("drainMailDispatches:start");
    expect(harness.events).not.toContain("argon2Pool.close");

    harness.releaseAdmissions();
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(harness.events).toContain("drainMailDispatches:start");
    expect(harness.events).not.toContain("postworkAuditContextHash");
    expect(harness.events).not.toContain("auditContextHasher.close");
    expect(harness.events).not.toContain("argon2Pool.close");

    harness.releasePostwork();
    await closing;

    const at = (event: string): number => {
      const index = harness.events.indexOf(event);
      expect(index, `${event} never happened: ${harness.events.join(" -> ")}`)
        .toBeGreaterThan(-1);
      return index;
    };
    // The blocked postwork audit completed BEFORE the Argon2 surface went away.
    expect(at("postworkAuditContextHash")).toBeLessThan(at("auditContextHasher.close"));
    expect(at("postworkAuditContextHash")).toBeLessThan(at("argon2Pool.close"));
    // So did the deferred refusal-audit work.
    expect(at("refusalAuditContextHash")).toBeLessThan(at("auditContextHasher.close"));
    expect(at("refusalAuditContextHash")).toBeLessThan(at("argon2Pool.close"));
    // The last registration to enqueue mail work did so BEFORE the mail drain
    // began, which is the whole reason the admission drain runs first.
    expect(at("lateRegistrationEnqueuesMailWork"))
      .toBeLessThan(at("drainMailDispatches:start"));
    // Exact order: admissions, mail, refusal audits, then the hasher, then the
    // pool all three borrow.
    expect(at("drainRegistrationAdmissions:end"))
      .toBeLessThan(at("drainMailDispatches:start"));
    expect(at("drainMailDispatches:end")).toBeLessThan(at("drainRefusalAudits:start"));
    expect(at("drainRefusalAudits:end")).toBeLessThan(at("auditContextHasher.close"));
    expect(at("auditContextHasher.close")).toBeLessThan(at("argon2Pool.close"));
  }, 60_000);

  it("HARNESS CONTROL: the same probe goes RED when the mail drain precedes the admission drain", async () => {
    // Byte-for-byte the same extraction, execution and doubles - only the body
    // differs. If this did not fail, the test above would prove nothing.
    const reordered = `
      await registration.drainMailDispatches();
      await registration.drainRegistrationAdmissions();
      await registration.drainRateLimitAuditFlushes();
      auditContextHasher.close();
      await argon2Pool.close();
    `;
    const run = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", reordered
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const harness = closeHarness();
    const closing = run(harness.registration, harness.auditContextHasher, harness.argon2Pool);
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    harness.releasePostwork();
    harness.releaseAdmissions();
    await closing;
    // The registration that enqueued mail work did so AFTER the mail drain had
    // already returned, so the drain reported work done that it never awaited.
    expect(harness.events.indexOf("drainMailDispatches:end"))
      .toBeLessThan(harness.events.indexOf("lateRegistrationEnqueuesMailWork"));
  }, 60_000);

  it("HARNESS CONTROL: the same probe goes RED on the reversed order", async () => {
    // Byte-for-byte the same extraction, execution and doubles - only the body
    // differs. If this did not fail, the test above would prove nothing.
    const reversed = `
      auditContextHasher.close();
      await argon2Pool.close();
      await registration.drainRegistrationAdmissions();
      await registration.drainMailDispatches();
      await registration.drainRateLimitAuditFlushes();
    `;
    const run = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", reversed
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const harness = closeHarness();
    const closing = run(harness.registration, harness.auditContextHasher, harness.argon2Pool);
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    harness.releaseAdmissions();
    harness.releasePostwork();
    await closing;
    expect(harness.events.indexOf("argon2Pool.close"))
      .toBeLessThan(harness.events.indexOf("postworkAuditContextHash"));
    expect(harness.events.indexOf("auditContextHasher.close"))
      .toBeLessThan(harness.events.indexOf("postworkAuditContextHash"));
  }, 60_000);

  it("keeps signal orchestration out of the close primitive (T3 scope)", () => {
    const main = readFileSync(mainPath, "utf8");
    expect(main).toMatch(/addHook\(\s*["']onClose["']/);
    expect(main).not.toMatch(/process\.on\(\s*["']SIG/);
    expect(main).not.toMatch(/process\.once\(\s*["']SIG/);
  });
});

describe("T1 rework2 R4 — the refusal-audit drain is bounded, not a 60 s wait", () => {
  /** A window boundary, so the scheduled delay is the FULL ruled interval. */
  const windowBase = (): number => 1_800_000_000_000
    - (1_800_000_000_000 % authPolicy().rateLimitRefusalAuditIntervalMs);

  function serviceWithOnePendingRefusalWindow(): {
    readonly service: RegistrationService;
    readonly recorded: unknown[];
    readonly scheduledDelayMs: number;
  } {
    const policy = authPolicy();
    const recorded: unknown[] = [];
    const limiter = new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const service = new RegistrationService({
      repository: {
        async recordRateLimitRefusal(input: unknown): Promise<void> { recorded.push(input); }
      } as never,
      mail: {} as never,
      dekStore: {} as never,
      blindIndexKey: new Uint8Array(32).fill(1),
      policy,
      limiter,
      argon2: {} as never
    });
    const now = new Date(windowBase());
    const aggregate = limiter.aggregateRefusal({
      route: "register",
      scope: "ip",
      actorToken: "00000000-0000-4000-8000-000000000001",
      now,
      source: { ip: "203.0.113.9", userAgent: "t1-rework2-drain", requestId: "r-1" }
    });
    expect(aggregate.startedWindow).toBe(true);
    expect(aggregate.windowStartedAt).toBe(windowBase());
    (service as unknown as {
      scheduleRefusalAuditFlush(route: string, windowStartedAt: number, now: Date): void;
    }).scheduleRefusalAuditFlush("register", aggregate.windowStartedAt, now);
    return {
      service,
      recorded,
      scheduledDelayMs: windowBase() + policy.rateLimitRefusalAuditIntervalMs - now.getTime()
    };
  }

  it("returns promptly and still writes the durable refusal row", async () => {
    const { service, recorded, scheduledDelayMs } = serviceWithOnePendingRefusalWindow();
    const policy = authPolicy();
    // The REAL ruled deadline this drain must not wait out: the aggregation
    // interval itself, 60 s. This is why main.ts cannot simply await the
    // pre-rework2 drain during shutdown.
    expect(scheduledDelayMs).toBe(policy.rateLimitRefusalAuditIntervalMs);
    expect(scheduledDelayMs).toBe(60_000);

    const budgetMs = 1_000;
    const startedAt = performance.now();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      service.drainRateLimitAuditFlushes().then(() => "drained" as const),
      new Promise<"still-waiting-on-the-60s-window">((resolve) => {
        watchdog = setTimeout(() => resolve("still-waiting-on-the-60s-window"), budgetMs);
      })
    ]);
    clearTimeout(watchdog);
    expect(outcome).toBe("drained");
    expect(performance.now() - startedAt).toBeLessThan(budgetMs);
    // Bounded does not mean skipped: the aggregate is still durably recorded.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ route: "register", scope: "ip", count: 1 });
  }, 60_000);

  it("is idempotent and leaves nothing pending", async () => {
    const { service, recorded } = serviceWithOnePendingRefusalWindow();
    await service.drainRateLimitAuditFlushes();
    await service.drainRateLimitAuditFlushes();
    expect(recorded).toHaveLength(1);
  }, 60_000);
});

// ==========================================================================
// REWORK 2 — the clamp-absorption decision that decision_version 3 superseded.
//
// decision_version 2 published N*=3 at the UNCHANGED 45 ms registration
// cadence, BESIDE the sealed decision_version 1 (N*=2) rather than on top of
// it. The sealed row is history, retained unaltered, and is explicitly not a
// monotone lower bound. N*=4 was deliberately not claimed.
//
// Rework7 demotes decision_version 2 to CONTRADICTED history: unchanged-code
// RED evidence measured an n=3 hash-and-provisioning maximum of 973.0 ms
// against its ruled 430 ms, and its "measured exact 103" capacity re-measured
// at 98 and then 96. Every measurement below is therefore still asserted, and
// still retained byte-for-byte — as HISTORY. What changed is its status, not
// its numbers. The current decision is v3, asserted in its own block further
// down, and it publishes NO positive N*.
//
// The perturbation table at the end is a permanent in-repo mutation guard: it
// changes one ruled field at a time and requires the parser to refuse the row.
// ==========================================================================

type ClampAbsorptionRow = Readonly<Record<string, unknown>>;

interface ChannelDispatchRow {
  readonly sizing_derivation: string;
  readonly retained_payload: string;
  readonly registration_activation_spacing_ms: number;
  readonly registration_clamp_absorption: ClampAbsorptionRow;
  readonly current_registration_clamp_absorption: ClampAbsorptionRow & {
    readonly evidence: Readonly<Record<string, unknown>>;
  };
  readonly registration_admission: ClampAbsorptionRow & {
    readonly scope: Readonly<Record<string, unknown>>;
    readonly evidence: Readonly<Record<string, unknown>>;
    readonly retention_disclosure: Readonly<Record<string, unknown>>;
  };
}

function channelDispatchRow(): ChannelDispatchRow {
  const row = AUTH_POLICY_REGISTER_ROWS.find((candidate) => candidate.rowKey === "channelPolicy")!;
  return (row.value as { verification_dispatch: ChannelDispatchRow }).verification_dispatch;
}

/** The register rows with ONE field of the current decision perturbed. */
function rowsWithCurrentAbsorption(
  override: Readonly<Record<string, unknown>>,
  evidenceOverride: Readonly<Record<string, unknown>> = {}
): readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][] {
  return AUTH_POLICY_REGISTER_ROWS.map((row) => {
    if (row.rowKey !== "channelPolicy") return row;
    const value = row.value as { verification_dispatch: ChannelDispatchRow };
    const dispatch = value.verification_dispatch;
    const current = dispatch.current_registration_clamp_absorption;
    return {
      ...row,
      value: {
        ...value,
        verification_dispatch: {
          ...dispatch,
          current_registration_clamp_absorption: {
            ...current,
            ...override,
            evidence: { ...current.evidence, ...evidenceOverride }
          }
        }
      }
    };
  }) as readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][];
}

/** The register rows with ONE field of the decision_version 3 row perturbed. */
function rowsWithRegistrationAdmission(
  override: Readonly<Record<string, unknown>>
): readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][] {
  return AUTH_POLICY_REGISTER_ROWS.map((row) => {
    if (row.rowKey !== "channelPolicy") return row;
    const value = row.value as { verification_dispatch: ChannelDispatchRow };
    const dispatch = value.verification_dispatch;
    return {
      ...row,
      value: {
        ...value,
        verification_dispatch: {
          ...dispatch,
          registration_admission: { ...dispatch.registration_admission, ...override }
        }
      }
    };
  }) as readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][];
}

describe("T1 rework2 — the versioned N*=3 clamp-absorption decision", () => {
  // Parsed inside each test, never in the describe body: a broken ruled value
  // must fail the assertion that owns it, not collapse the whole suite before
  // any test is even defined.
  const parse = (): ReturnType<typeof authPolicyFromRegisterRows> =>
    authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);

  it("retains N*=3 at 430 ms and 35 ms headroom, on the unchanged 45 ms cadence, as history", () => {
    expect(parse().channel.supersededClampAbsorptionDecisionVersion).toBe(2);
    expect(parse().channel.supersededMaximumClampAbsorbedRegistrationConcurrency).toBe(3);
    expect(parse().channel.supersededRegistrationHashAndProvisioningUpperBoundMs).toBe(430);
    expect(parse().channel.supersededRegistrationClampHeadroomMs).toBe(35);
    // The derivation, not just the numbers: 389.6 * 110% rounded up to the next
    // 10 ms is 430, and 600 - (430 + 3 * 45) is 35.
    const current = channelDispatchRow().current_registration_clamp_absorption;
    expect(current.measured_hash_and_provisioning_max_ms).toBe(389.6);
    expect(Math.ceil(389.6 * 110 / 100 / 10) * 10).toBe(430);
    expect(600 - (430 + 3 * 45)).toBe(35);
    // Cadence UNCHANGED by this decision.
    expect(current.registration_activation_spacing_ms).toBe(45);
    expect(parse().channel.registrationMailDispatchActivationSpacingMs).toBe(45);
    expect(channelDispatchRow().registration_activation_spacing_ms).toBe(45);
  });

  it("retains the sealed N*=2 decision unaltered, and not as a lower bound", () => {
    expect(parse().channel.maximumClampAbsorbedRegistrationConcurrency).toBe(2);
    expect(parse().channel.registrationHashAndProvisioningUpperBoundMs).toBe(480);
    expect(parse().channel.registrationClampHeadroomMs).toBe(30);
    expect(channelDispatchRow().registration_clamp_absorption).toMatchObject({
      maximum_unsaturated_concurrency: 2,
      measured_hash_and_provisioning_max_ms: 436,
      measurement_safety_percent: 110,
      ruled_hash_and_provisioning_upper_bound_ms: 480,
      response_clamp_ms: 600,
      binding_headroom_ms: 30,
      first_measured_unabsorbed_concurrency: 3
    });
    const current = channelDispatchRow().current_registration_clamp_absorption;
    expect(current.supersedes_decision_version).toBe(1);
    expect(String(current.supersession)).toMatch(/NOT_A_MONOTONE_LOWER_BOUND/);
  });

  it("discloses the three-repeat evidence and does NOT claim N*=4", () => {
    const evidence = channelDispatchRow().current_registration_clamp_absorption.evidence;
    expect(evidence.repeats).toBe(3);
    // +113.1, +111.2, +75.4 ms: positive in every repeat, which is the basis.
    expect(evidence.n3_clamp_headroom_tenths_ms).toEqual([1_131, 1_112, 754]);
    // +7.0, +9.2, -6.5 ms: straddles zero, which is why N*=4 is refused.
    expect(evidence.n4_clamp_headroom_tenths_ms).toEqual([70, 92, -65]);
    expect((evidence.n4_clamp_headroom_tenths_ms as readonly number[]).some((v) => v <= 0))
      .toBe(true);
    expect(evidence.raw_maximum_absorbed_concurrency_per_repeat).toEqual([4, 4, 3]);
    expect(evidence.first_unabsorbed_concurrency_per_repeat).toEqual([8, 8, 4]);
    expect(parse().channel.supersededMaximumClampAbsorbedRegistrationConcurrency).toBeLessThan(4);
    expect(String(evidence.n4_characterization)).toMatch(/NOT_A_RATIFIABLE_ABSORPTION_LIMIT/);
    expect(String(evidence.conclusion)).toMatch(/N4_DELIBERATELY_NOT_CLAIMED/);
  });

  it("preserves the once-measured 103 accepted-request capacity as contradicted history", () => {
    const current = channelDispatchRow().current_registration_clamp_absorption;
    const evidence = current.evidence;
    // The arrays are retained EXACTLY. Rework7 rewrote none of them.
    expect(parse().channel.supersededMeasuredAcceptedRequestCapacity).toBe(103);
    expect(evidence.burst_100_accepted_per_repeat).toEqual([100, 100, 100]);
    expect(evidence.burst_128_accepted_per_repeat).toEqual([103, 103, 103]);
    expect(evidence.burst_160_accepted_per_repeat).toEqual([103, 103, 103]);
    // What changed is the STATUS. 103 is no longer published as a measured
    // completion rate; the same burst later accepted 98 and then 96 on
    // unchanged code, and 103 survives only as the structural admission cap.
    expect(String(current.status)).toMatch(/SUPERSEDED/);
    expect(String(current.status)).toMatch(/CONTRADICTED/);
    expect(current.superseded_by_decision_version).toBe(3);
    expect(String(current.capacity_status))
      .toMatch(/NOT_A_MEASURED_COMPLETION_RATE/);
    expect(current.contradicting_observations).toMatchObject({
      burst_100_accepted_on_unchanged_code: [98, 96],
      n3_hash_and_provisioning_maximum_ms_on_unchanged_code: [1_264.7, 973.0],
      ruled_hash_and_provisioning_upper_bound_ms: 430
    });
  });

  it("publishes no 256, 320 or 1024 MiB operator RSS ceiling in this decision", () => {
    const serialized = JSON.stringify(channelDispatchRow());
    for (const invented of ["256", "320", "1024"]) {
      expect(serialized).not.toContain(`_rss_mib":${invented}`);
      expect(serialized).not.toContain(`ceiling_mib":${invented}`);
    }
  });

  it("discloses the derivation in prose, not just the conclusion", () => {
    const derivation = channelDispatchRow().sizing_derivation;
    for (const disclosure of [
      "decision_version 2", "N*=3", "unchanged 45 ms", "Three fresh isolated repeats",
      "389.6 ms", "110 percent", "430 ms", "3 * 45 ms", "565 ms", "35 ms ruled headroom",
      "+113.1, +111.2 and +75.4 ms", "N=4 is deliberately NOT claimed",
      "+7.0, +9.2 and -6.5 ms", "[4,4,3]", "[8,8,4]",
      "retained unaltered as history", "not a monotone lower bound",
      "exactly 103", "103/103/103", "100/100/100"
    ]) {
      expect(derivation).toContain(disclosure);
    }
    // The sealed derivation text survives alongside it.
    expect(derivation).toContain("N*=2");
    expect(derivation).toContain("480 ms");
    expect(derivation).toContain("30 ms ruled headroom");
  });

  const perturbations: readonly {
    readonly label: string;
    readonly override?: Readonly<Record<string, unknown>>;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }[] = [
    { label: "claiming N*=4 above the worst repeat's raw absorbed maximum",
      override: { maximum_unsaturated_concurrency: 4, first_measured_unabsorbed_concurrency: 5 } },
    { label: "a ruled upper bound that is not the 110% safety factor",
      override: { ruled_hash_and_provisioning_upper_bound_ms: 420 } },
    { label: "a headroom that is not the derived clamp remainder",
      override: { binding_headroom_ms: 40 } },
    { label: "a response clamp that contradicts the verification policy",
      override: { response_clamp_ms: 700 } },
    { label: "a cadence the decision claims to leave unchanged",
      override: { registration_activation_spacing_ms: 60 } },
    { label: "a first-unabsorbed value that is not N*+1",
      override: { first_measured_unabsorbed_concurrency: 5 } },
    { label: "a safety factor that differs from the sealed decision's",
      override: { measurement_safety_percent: 120 } },
    { label: "a capacity that contradicts the measured bursts",
      override: { measured_accepted_request_capacity: 104 } },
    { label: "an N=3 headroom that was not positive in every repeat",
      evidence: { n3_clamp_headroom_tenths_ms: Object.freeze([1_131, 1_112, 0]) } },
    { label: "a burst-128 repeat that did not accept the published capacity",
      evidence: { burst_128_accepted_per_repeat: Object.freeze([103, 103, 101]) } },
    { label: "a burst-160 repeat that did not accept the published capacity",
      evidence: { burst_160_accepted_per_repeat: Object.freeze([103, 100, 103]) } },
    { label: "a raw absorbed maximum lowered below the ratified N*",
      evidence: { raw_maximum_absorbed_concurrency_per_repeat: Object.freeze([4, 4, 2]) } }
  ];

  for (const perturbation of perturbations) {
    it(`refuses the row for ${perturbation.label}`, () => {
      expect(() => authPolicyFromRegisterRows(
        rowsWithCurrentAbsorption(perturbation.override ?? {}, perturbation.evidence ?? {})
      )).toThrowError(/Current clamp-absorption decision contradicts/);
    });
  }

  it("POSITIVE CONTROL: the unperturbed row is accepted, so the table is not vacuous", () => {
    expect(() => authPolicyFromRegisterRows(rowsWithCurrentAbsorption({}))).not.toThrow();
    expect(authPolicyFromRegisterRows(rowsWithCurrentAbsorption({}))
      .channel.supersededMaximumClampAbsorbedRegistrationConcurrency).toBe(3);
  });

  it("refuses any alteration of the sealed historical decision", () => {
    const tampered = AUTH_POLICY_REGISTER_ROWS.map((row) => {
      if (row.rowKey !== "channelPolicy") return row;
      const value = row.value as { verification_dispatch: ChannelDispatchRow };
      const dispatch = value.verification_dispatch;
      return {
        ...row,
        value: {
          ...value,
          verification_dispatch: {
            ...dispatch,
            registration_clamp_absorption: {
              ...dispatch.registration_clamp_absorption,
              maximum_unsaturated_concurrency: 3,
              first_measured_unabsorbed_concurrency: 4
            }
          }
        }
      };
    }) as readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][];
    expect(() => authPolicyFromRegisterRows(tampered)).toThrowError(/contradicts/);
  });
});

// ==========================================================================
// REWORK 7 — decision_version 3: a STRUCTURAL admission cap and a
// route-specific registration wait deadline.
//
// v2 called 103 a measured accepted-request capacity. Unchanged-code evidence
// then measured 98, and then 96, for the same burst — so that reading was
// wrong, and the honest statement is structural: at most 103 registrations may
// hold the admission budget at once, and the 104th is refused before it does
// any work. The number is unchanged; the claim behind it is not.
//
// The deadline moved for the opposite reason. Three fresh diagnostic processes
// committed and sent all 103 registrations with zero refusals once the wait
// ceiling was widened, at a worst reservation wait of 21,902.2 ms — so the
// shipped 18,000 ms bound was censoring admissions the system could serve.
//
// v3 also publishes what it does NOT know: the cadence stays 45 ms but is
// provisional, and there is no positive current N* at all. An absent N* is a
// disclosure; silently falling back to the historical N*=2 would not be.
// ==========================================================================

describe("T1 rework7 A4 — decision_version 3 publishes the structural cap and the 28 s deadline", () => {
  const parse = (): ReturnType<typeof authPolicyFromRegisterRows> =>
    authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const admissionRow = (): ChannelDispatchRow["registration_admission"] =>
    channelDispatchRow().registration_admission;

  it("publishes the structural maximum of 103 and both wait deadlines", () => {
    const row = admissionRow();
    expect(row.decision_version).toBe(3);
    expect(row.status).toBe("CURRENT");
    expect(row.supersedes_decision_version).toBe(2);
    expect(row.structural_maximum_concurrent_registrations).toBe(103);
    expect(row.registration_mail_permit_wait_deadline_ms).toBe(28_000);
    expect(row.shared_mail_permit_wait_deadline_ms).toBe(18_000);
    expect(String(row.admission_semantics)).toMatch(/STRUCTURAL/);
    expect(String(row.admission_semantics)).toMatch(/NOT_A_MEASURED_COMPLETION_RATE/);

    expect(parse().channel.structuralMaximumConcurrentRegistrations).toBe(103);
    expect(parse().channel.registrationMailDispatchQueueWaitTimeoutMs).toBe(28_000);
    expect(parse().channel.mailDispatchQueueWaitTimeoutMs).toBe(18_000);
    expect(parse().channel.registrationAdmissionDecisionVersion).toBe(3);
  });

  it("keeps the 45 ms cadence but marks it provisional, and publishes NO positive N*", () => {
    const row = admissionRow();
    expect(row.registration_cadence_ms).toBe(45);
    expect(parse().channel.registrationMailDispatchActivationSpacingMs).toBe(45);
    expect(String(row.registration_cadence_status)).toMatch(/PROVISIONAL/);
    expect(String(row.registration_cadence_status)).toMatch(/RECALIBRATION_PENDING/);

    // Absent, not zero and not a silent fallback to the historical N*=2.
    expect(row.current_positive_clamp_absorption_n_star).toBeNull();
    expect(parse().channel.currentPositiveClampAbsorptionNStar).toBeNull();
    expect(row.historical_n_star_2_is_a_fallback).toBe(false);
    expect(parse().channel.supersededMaximumClampAbsorbedRegistrationConcurrency).toBe(3);
    expect(parse().channel.maximumClampAbsorbedRegistrationConcurrency).toBe(2);
  });

  it("bounds the decision to its measured scope and guarantees nothing about mixed routes", () => {
    const scope = admissionRow().scope;
    expect(scope).toMatchObject({
      mail_transport: "HEALTHY_MTA",
      host: "TARGET_HOST",
      shared_dispatcher_at_entry: "INITIALLY_EMPTY",
      burst: "REGISTER_ONLY_SIMULTANEOUS",
      hard_availability_requests: 100,
      mixed_register_and_resend_availability_guaranteed: false,
      route_partitioning: "NOT_AUTHORIZED_IN_REWORK7"
    });
    // The shared FIFO is explicitly unchanged and explicitly unpartitioned.
    expect(parse().channel.maxConcurrentVerificationDispatches).toBe(32);
    expect(parse().channel.maxQueuedVerificationDispatches).toBe(96);
  });

  it("discloses the three diagnostic repeats and the exact deadline derivation", () => {
    const evidence = admissionRow().evidence;
    expect(evidence.repeats).toBe(3);
    expect(evidence.successes_per_repeat).toEqual([103, 103, 103]);
    expect(evidence.commits_per_repeat).toEqual([103, 103, 103]);
    expect(evidence.sends_per_repeat).toEqual([103, 103, 103]);
    expect(evidence.busy_per_repeat).toEqual([0, 0, 0]);
    expect(evidence.unexpected_per_repeat).toEqual([0, 0, 0]);
    // Tenths of a millisecond, so 20,922.9 / 21,902.2 / 20,942.1 stay exact.
    expect(evidence.reservation_wait_maximum_tenths_ms)
      .toEqual([209_229, 219_022, 209_421]);
    expect(evidence.deadline_derivation)
      .toBe("ceil_to_whole_second(1.25 * 21902.2 ms) = 28000 ms");
    expect(Math.ceil(1.25 * 21_902.2 / 1_000) * 1_000).toBe(28_000);
    // Hundredths of a percent: 25.28%, 21.78%, 25.21%.
    expect(evidence.margin_hundredths_percent_per_repeat).toEqual([2_528, 2_178, 2_521]);
    expect((evidence.margin_hundredths_percent_per_repeat as readonly number[])
      .every((margin) => margin >= 2_000)).toBe(true);
    expect(String(evidence.measurement)).toMatch(/DIAGNOSTIC_60000MS/);
  });

  it("discloses what a queued registration frame retains, and for how long", () => {
    const retention = admissionRow().retention_disclosure;
    expect(retention).toMatchObject({
      maximum_admitted_registration_frames: 103,
      maximum_shared_mail_queue_waiters: 96,
      queued_registration_frame_retention_ms: 28_000,
      raw_verification_token_minted_before_mail_grant: false
    });
    expect(String(retention.queued_registration_frame_contents))
      .toMatch(/VALIDATED_EMAIL.*RECOVERY_EMAIL.*PASSWORD.*SOURCE_CONTEXT/);
    // The shipped retained_payload string must agree with the new deadline
    // rather than still promising an 18-second registration bound.
    expect(String(channelDispatchRow().retained_payload)).toContain("28S");
  });

  it("discloses the derivation in prose, not just the conclusion", () => {
    const derivation = channelDispatchRow().sizing_derivation;
    for (const disclosure of [
      "decision_version 3", "structural admission budget", "103",
      "104th", "28,000 ms", "18,000 ms", "21,902.2 ms",
      "1.25", "21.78 percent", "no positive current N*",
      "45 ms cadence is provisional", "not a measured accepted-request capacity",
      "98", "96", "973.0 ms"
    ]) {
      expect(derivation).toContain(disclosure);
    }
    // v1 and v2 prose both survive.
    expect(derivation).toContain("N*=2");
    expect(derivation).toContain("decision_version 2");
  });

  const admissionPerturbations: readonly {
    readonly label: string;
    readonly override: Readonly<Record<string, unknown>>;
  }[] = [
    { label: "a structural cap that is not the 103 the request path enforces",
      override: { structural_maximum_concurrent_registrations: 104 } },
    { label: "a registration deadline below its own 1.25x derivation",
      override: { registration_mail_permit_wait_deadline_ms: 18_000 } },
    { label: "a shared deadline that drifted off the ruled 18 seconds",
      override: { shared_mail_permit_wait_deadline_ms: 28_000 } },
    { label: "a cadence that contradicts the shipped registration spacing",
      override: { registration_cadence_ms: 60 } },
    { label: "a cadence published as settled rather than provisional",
      override: { registration_cadence_status: "RATIFIED" } },
    { label: "a positive current N* that no repeat supports",
      override: { current_positive_clamp_absorption_n_star: 3 } },
    { label: "the historical N*=2 re-armed as a fallback",
      override: { historical_n_star_2_is_a_fallback: true } },
    { label: "a decision that claims mixed-route availability",
      override: { scope: Object.freeze({
        mail_transport: "HEALTHY_MTA", host: "TARGET_HOST",
        shared_dispatcher_at_entry: "INITIALLY_EMPTY",
        burst: "REGISTER_ONLY_SIMULTANEOUS", hard_availability_requests: 100,
        mixed_register_and_resend_availability_guaranteed: true,
        route_partitioning: "NOT_AUTHORIZED_IN_REWORK7"
      }) } },
    { label: "a status that still calls decision_version 2 current",
      override: { supersedes_decision_version: 1 } }
  ];

  for (const perturbation of admissionPerturbations) {
    it(`refuses the row for ${perturbation.label}`, () => {
      expect(() => authPolicyFromRegisterRows(
        rowsWithRegistrationAdmission(perturbation.override)
      )).toThrowError(/Registration admission decision contradicts/);
    });
  }

  it("POSITIVE CONTROL: the unperturbed admission row is accepted", () => {
    expect(() => authPolicyFromRegisterRows(rowsWithRegistrationAdmission({}))).not.toThrow();
    expect(authPolicyFromRegisterRows(rowsWithRegistrationAdmission({}))
      .channel.structuralMaximumConcurrentRegistrations).toBe(103);
  });

  it("refuses a v2 row that still claims to be CURRENT", () => {
    const tampered = AUTH_POLICY_REGISTER_ROWS.map((row) => {
      if (row.rowKey !== "channelPolicy") return row;
      const value = row.value as { verification_dispatch: ChannelDispatchRow };
      const dispatch = value.verification_dispatch;
      return {
        ...row,
        value: {
          ...value,
          verification_dispatch: {
            ...dispatch,
            current_registration_clamp_absorption: {
              ...dispatch.current_registration_clamp_absorption,
              status: "CURRENT"
            }
          }
        }
      };
    }) as readonly (typeof AUTH_POLICY_REGISTER_ROWS)[number][];
    expect(() => authPolicyFromRegisterRows(tampered)).toThrowError(/contradicts/);
  });
});

describe("T1 rework3 RED 2 — a failed shutdown refusal-audit write is never reported drained", () => {
  const mainPath = join(repoRoot, "apps/api/src/main.ts");

  /** A window boundary, so the scheduled delay is the FULL ruled interval. */
  const windowBase = (): number => 1_800_000_000_000
    - (1_800_000_000_000 % authPolicy().rateLimitRefusalAuditIntervalMs);

  const SOURCE = Object.freeze({
    ip: "203.0.113.31", userAgent: "t1-rework3-drain", requestId: "r3-1"
  });
  const ACTOR = "00000000-0000-4000-8000-000000000031";

  /**
   * A REAL `RegistrationService` over a REAL `InProcessAuthRateLimiter`, with
   * exactly one seam: the repository write that persists a refusal aggregate.
   * Nothing else is doubled, so the refusal path, the aggregation window, the
   * scheduled flush and the drain are all the shipped code.
   */
  function refusalAuditSeam(): {
    readonly service: RegistrationService;
    readonly recorded: unknown[];
    readonly attempts: () => number;
    readonly recover: () => void;
    readonly refuse: (now: Date) => Promise<unknown>;
  } {
    const policy = authPolicy();
    const recorded: unknown[] = [];
    let attempts = 0;
    let failing = true;
    const limiter = new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const service = new RegistrationService({
      repository: {
        async recordRateLimitRefusal(input: unknown): Promise<void> {
          attempts += 1;
          // What a real Postgres write looks like when it cannot commit.
          if (failing) throw new Error("PG_RATE_LIMIT_REFUSAL_WRITE_FAILED");
          recorded.push(input);
        }
      } as never,
      mail: {} as never,
      dekStore: {} as never,
      blindIndexKey: new Uint8Array(32).fill(1),
      policy,
      limiter,
      argon2: {} as never
    });
    return {
      service,
      recorded,
      attempts: () => attempts,
      recover: () => { failing = false; },
      // The service's own refusal path: it aggregates, schedules the audit
      // flush, and throws the public rate-limit outcome.
      refuse: (now: Date) => (service as unknown as {
        refuseRateLimit(input: {
          route: string; scope: string; actorToken: string; now: Date;
          source: { ip: string; userAgent: string; requestId: string };
        }): Promise<never>;
      }).refuseRateLimit({
        route: "register", scope: "ip", actorToken: ACTOR, now, source: SOURCE
      })
    };
  }

  /**
   * Runs the ACTUAL shipped `onClose` body against this service's real drain,
   * so "teardown after the drain would not run" is observed rather than argued.
   */
  async function runShippedTeardown(service: RegistrationService): Promise<{
    readonly outcome: "torn-down" | "threw";
    readonly events: string[];
  }> {
    const body = extractOnCloseBody(readFileSync(mainPath, "utf8"));
    const hook = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", body
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const events: string[] = [];
    const outcome = await hook(
      {
        async drainRegistrationAdmissions(): Promise<void> {
          events.push("drainRegistrationAdmissions");
        },
        async drainMailDispatches(): Promise<void> { events.push("drainMailDispatches"); },
        drainRateLimitAuditFlushes: async (): Promise<void> => {
          events.push("drainRefusalAudits:start");
          await service.drainRateLimitAuditFlushes();
          events.push("drainRefusalAudits:end");
        },
        drainMailCapacitySignals(): void { events.push("drainMailCapacitySignals"); }
      },
      { close(): void { events.push("auditContextHasher.close"); } },
      { async close(): Promise<void> { events.push("argon2Pool.close"); } }
    ).then(() => "torn-down" as const, () => "threw" as const);
    return { outcome, events };
  }

  /** Resolves the drain outcome, or reports that it out-waited a real budget. */
  async function drainWithin(service: RegistrationService, budgetMs: number): Promise<{
    readonly outcome: "resolved" | "rejected" | "still-waiting-on-the-60s-window";
    readonly elapsedMs: number;
  }> {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    const outcome = await Promise.race([
      service.drainRateLimitAuditFlushes().then(
        () => "resolved" as const, () => "rejected" as const
      ),
      new Promise<"still-waiting-on-the-60s-window">((resolve) => {
        watchdog = setTimeout(() => resolve("still-waiting-on-the-60s-window"), budgetMs);
      })
    ]);
    clearTimeout(watchdog);
    return { outcome, elapsedMs: performance.now() - startedAt };
  }

  it("keeps the refused request's 429 opaque while the background write fails", async () => {
    const seam = refusalAuditSeam();
    const refused = await seam.refuse(new Date(windowBase()))
      .then(() => undefined, (error: unknown) => error);

    // The public outcome is the ruled typed 429 and nothing else: a repository
    // failure behind it must never rewrite or leak into the response.
    expect(refused).toBeInstanceOf(AuthFlowError);
    expect(refused).toMatchObject({ code: "AUTH_RATE_LIMITED", statusCode: 429 });
    expect((refused as Error).message).toBe("AUTH_RATE_LIMITED");
    expect((refused as Error).message).not.toContain("PG_");
    expect(JSON.stringify((refused as Error).cause ?? null)).not.toContain("PG_");

    await drainWithin(seam.service, 1_000);
  }, 60_000);

  it("propagates the shutdown persistence failure instead of claiming a drained shutdown", async () => {
    const seam = refusalAuditSeam();
    const policy = authPolicy();
    await seam.refuse(new Date(windowBase())).catch(() => undefined);

    // NON-VACUITY: the pending flush really is parked on the ruled aggregation
    // deadline, so a drain that returns promptly did fire it early.
    expect(policy.rateLimitRefusalAuditIntervalMs).toBe(60_000);

    const budgetMs = 1_000;
    const first = await drainWithin(seam.service, budgetMs);
    expect(first.outcome).toBe("rejected");
    expect(first.elapsedMs).toBeLessThan(budgetMs);
    // The failure is real: the write was attempted and did not land.
    expect(seam.attempts()).toBeGreaterThanOrEqual(1);
    expect(seam.recorded).toHaveLength(0);
  }, 60_000);

  it("stops the shipped teardown from closing the Argon2 surface after a failed drain", async () => {
    const seam = refusalAuditSeam();
    await seam.refuse(new Date(windowBase())).catch(() => undefined);

    const { outcome, events } = await runShippedTeardown(seam.service);

    expect(outcome).toBe("threw");
    expect(events).toContain("drainRefusalAudits:start");
    expect(events).not.toContain("drainRefusalAudits:end");
    // The durable refusal row does not exist, so the surfaces the audit work
    // still needs must not be torn down behind it.
    expect(events).not.toContain("auditContextHasher.close");
    expect(events).not.toContain("argon2Pool.close");
    expect(seam.recorded).toHaveLength(0);
  }, 60_000);

  it("retains the aggregate so a recovered drain writes it exactly once", async () => {
    const seam = refusalAuditSeam();
    await seam.refuse(new Date(windowBase())).catch(() => undefined);

    const failed = await drainWithin(seam.service, 1_000);
    expect(failed.outcome).toBe("rejected");
    expect(seam.recorded).toHaveLength(0);
    const attemptsWhileFailing = seam.attempts();

    // The repository comes back. The retained aggregate must still be there.
    seam.recover();
    const recovered = await drainWithin(seam.service, 1_000);
    expect(recovered.outcome).toBe("resolved");
    expect(recovered.elapsedMs).toBeLessThan(1_000);
    // NON-VACUITY: the recovered drain really did attempt a fresh write.
    expect(seam.attempts()).toBeGreaterThan(attemptsWhileFailing);

    // Exactly one durable row, with the aggregate content/window/count the
    // refusal actually produced — not a re-derived or emptied one.
    expect(seam.recorded).toHaveLength(1);
    expect(seam.recorded[0]).toMatchObject({
      route: "register",
      scope: "ip",
      count: 1,
      ipCount: 1,
      addressCount: 0,
      actorToken: ACTOR,
      aggregateWindowStartedAt: new Date(windowBase())
    });

    // Repeated drain is prompt and idempotent: pending work is cleared, and the
    // recovered row is not written a second time.
    const again = await drainWithin(seam.service, 1_000);
    expect(again.outcome).toBe("resolved");
    expect(again.elapsedMs).toBeLessThan(1_000);
    expect(seam.recorded).toHaveLength(1);

    // And the shipped teardown now runs to completion.
    const { outcome, events } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(events).toContain("auditContextHasher.close");
    expect(events).toContain("argon2Pool.close");
    expect(seam.recorded).toHaveLength(1);
  }, 60_000);

  it("writes one row, not two, when two drains observe the same retained aggregate", async () => {
    const seam = refusalAuditSeam();
    await seam.refuse(new Date(windowBase())).catch(() => undefined);
    expect((await drainWithin(seam.service, 1_000)).outcome).toBe("rejected");
    seam.recover();

    // Both drains reach the SAME retained aggregate while the first write is
    // still in flight — the retained copy is only released once its own write
    // lands, so an uncoalesced second attempt would write the row twice.
    const first = seam.service.drainRateLimitAuditFlushes();
    const second = seam.service.drainRateLimitAuditFlushes();
    await Promise.all([first, second]);

    expect(seam.recorded).toHaveLength(1);
    expect(seam.recorded[0]).toMatchObject({
      route: "register", scope: "ip", count: 1,
      aggregateWindowStartedAt: new Date(windowBase())
    });
  }, 60_000);
});

// ==========================================================================
// REWORK 4 — one route-owned persistence coordinator across window rollover.
//
// A refusal window that ROLLS OVER is the hard case: W0 stops accumulating the
// instant W1 opens, and from that moment exactly one owner must carry W0 to a
// durable row. Two independent traces gave it two owners, or none.
//
// A. The rollover snapshot is awaited on the PUBLIC 429 path and its failure is
//    caught and discarded. An ordinary refusal waits out a database write, and
//    the only remaining copy of W0 is dropped on the floor — after which a
//    later drain happily reports a drained shutdown having written only W1.
//
// B. W0's write is already IN FLIGHT when W1 opens. The new window shallow-
//    copies W0's retained aggregate into a private array with a private writer,
//    joining neither the predecessor's promise nor its queue. A drain over the
//    copy starts a SECOND W0 write and can return while the orphaned first one
//    is still unresolved.
//
// The assertions below are written against the mechanism, not the symptom: one
// ordered queue per route, one shared writer per route, an active window that
// advances without replacing either, and a drain that joins that exact writer.
// ==========================================================================

describe("T1 rework4 — rollover has exactly one persistence owner per route", () => {
  const mainPath = join(repoRoot, "apps/api/src/main.ts");
  const intervalMs = (): number => authPolicy().rateLimitRefusalAuditIntervalMs;
  /** A window boundary, so W1 is the very next window and nothing else. */
  const windowBase = (): number => 1_800_000_000_000 - (1_800_000_000_000 % intervalMs());
  const W0 = (): number => windowBase();
  const W1 = (): number => windowBase() + intervalMs();

  const SOURCE = Object.freeze({
    ip: "203.0.113.44", userAgent: "t1-rework4-rollover", requestId: "r4-1"
  });
  const ACTOR = "00000000-0000-4000-8000-000000000044";
  const PG_FAILURE = (): Error => new Error("PG_RATE_LIMIT_REFUSAL_WRITE_FAILED");

  /**
   * One observed `recordRateLimitRefusal` call. `settled` is what makes "a
   * writer is still in flight" an observation rather than an inference.
   */
  interface WriteAttempt {
    readonly window: number;
    readonly input: Readonly<Record<string, unknown>>;
    settled: boolean;
    readonly resolve: () => void;
    readonly reject: (error: Error) => void;
  }

  /**
   * A REAL `RegistrationService` over a REAL `InProcessAuthRateLimiter`, seamed
   * at exactly one place: the repository write. The seam does not fake timing —
   * it hands back a promise the test decides the fate of, so "held in flight",
   * "rejected" and "landed" are the actual states the shipped code sees.
   */
  function rolloverSeam(): {
    readonly service: RegistrationService;
    readonly attempts: readonly WriteAttempt[];
    readonly recorded: readonly Readonly<Record<string, unknown>>[];
    readonly writesFor: (window: number) => number;
    readonly hold: () => void;
    readonly succeedFrom: () => void;
    readonly failFrom: () => void;
    readonly releaseAll: () => void;
    readonly failAll: () => void;
    readonly refuse: (now: Date) => Promise<never>;
  } {
    const policy = authPolicy();
    const attempts: WriteAttempt[] = [];
    const recorded: Readonly<Record<string, unknown>>[] = [];
    let mode: "hold" | "succeed" | "fail" = "hold";
    const limiter = new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const service = new RegistrationService({
      repository: {
        recordRateLimitRefusal(input: Readonly<Record<string, unknown>>): Promise<void> {
          let settle!: (outcome: Error | null) => void;
          const promise = new Promise<void>((resolve, reject) => {
            settle = (outcome) => {
              if (attempt.settled) return;
              attempt.settled = true;
              if (outcome === null) {
                recorded.push(input);
                resolve();
              } else {
                reject(outcome);
              }
            };
          });
          const attempt: WriteAttempt = {
            window: (input.aggregateWindowStartedAt as Date).getTime(),
            input,
            settled: false,
            resolve: () => settle(null),
            reject: (error) => settle(error)
          };
          attempts.push(attempt);
          if (mode === "succeed") attempt.resolve();
          else if (mode === "fail") attempt.reject(PG_FAILURE());
          return promise;
        }
      } as never,
      mail: {} as never,
      dekStore: {} as never,
      blindIndexKey: new Uint8Array(32).fill(1),
      policy,
      limiter,
      argon2: {} as never
    });
    return {
      service,
      attempts,
      recorded,
      writesFor: (window) => attempts.filter((attempt) => attempt.window === window).length,
      hold: () => { mode = "hold"; },
      succeedFrom: () => { mode = "succeed"; },
      failFrom: () => { mode = "fail"; },
      releaseAll: () => {
        mode = "succeed";
        for (const attempt of [...attempts]) attempt.resolve();
      },
      failAll: () => {
        mode = "fail";
        for (const attempt of [...attempts]) attempt.reject(PG_FAILURE());
      },
      // The service's own refusal path — aggregation, rollover, window
      // scheduling and the public outcome are all shipped code.
      refuse: (now: Date) => (service as unknown as {
        refuseRateLimit(input: {
          route: string; scope: string; actorToken: string; now: Date;
          source: { ip: string; userAgent: string; requestId: string };
        }): Promise<never>;
      }).refuseRateLimit({
        route: "register", scope: "ip", actorToken: ACTOR, now, source: SOURCE
      })
    };
  }

  /**
   * Macrotask turns rather than wall-clock: a promise that is genuinely settled
   * cannot hide behind them, and a promise that is genuinely blocked on a held
   * write cannot escape them however fast the machine is. This is why the
   * "pending" verdicts below are falsifiable and not a sleep that always wins.
   */
  async function turns(count = 8): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
    }
  }

  type Settlement = "pending" | "resolved" | "rejected";

  /** Observes a promise WITHOUT consuming it, so the same promise is joined later. */
  function watch<T>(promise: Promise<T>): { readonly state: () => Settlement; readonly error: () => unknown } {
    let state: Settlement = "pending";
    let error: unknown;
    void promise.then(() => { state = "resolved"; }, (reason: unknown) => {
      state = "rejected";
      error = reason;
    });
    return { state: () => state, error: () => error };
  }

  /** Runs the ACTUAL shipped `onClose` body, so teardown is observed, not argued. */
  async function runShippedTeardown(service: RegistrationService): Promise<{
    readonly outcome: "torn-down" | "threw";
    readonly events: string[];
  }> {
    const body = extractOnCloseBody(readFileSync(mainPath, "utf8"));
    const hook = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", body
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const events: string[] = [];
    const outcome = await hook(
      {
        async drainRegistrationAdmissions(): Promise<void> {
          events.push("drainRegistrationAdmissions");
        },
        async drainMailDispatches(): Promise<void> { events.push("drainMailDispatches"); },
        drainRateLimitAuditFlushes: async (): Promise<void> => {
          events.push("drainRefusalAudits:start");
          await service.drainRateLimitAuditFlushes();
          events.push("drainRefusalAudits:end");
        },
        drainMailCapacitySignals(): void { events.push("drainMailCapacitySignals"); }
      },
      { close(): void { events.push("auditContextHasher.close"); } },
      { async close(): Promise<void> { events.push("argon2Pool.close"); } }
    ).then(() => "torn-down" as const, () => "threw" as const);
    return { outcome, events };
  }

  /** The exact durable shape one refusal in `window` must produce, once. */
  const rowFor = (window: number): Readonly<Record<string, unknown>> => Object.freeze({
    route: "register",
    scope: "ip",
    count: 1,
    ipCount: 1,
    addressCount: 0,
    actorToken: ACTOR,
    aggregateWindowStartedAt: new Date(window),
    source: SOURCE
  });

  // ------------------------------------------------------------------
  // TRACE A — W0 rolls to W1 before W0's timer ever finalizes it.
  // ------------------------------------------------------------------
  it("does not make the public 429 wait on the rollover snapshot's write", async () => {
    const seam = rolloverSeam();
    seam.hold();
    await seam.refuse(new Date(W0())).catch(() => undefined);
    // PRE-TIMER: W0 is open and nothing has been persisted for it yet, so the
    // snapshot the next refusal returns really is the only copy.
    expect(seam.attempts).toHaveLength(0);

    // NON-VACUITY: the deferred write is parked against the REAL ruled 60 s
    // aggregation interval, so "prompt" is a claim with something to beat.
    expect(intervalMs()).toBe(60_000);

    const startedAt = performance.now();
    const refusal = seam.refuse(new Date(W1()));
    const observed = watch(refusal);
    await turns();
    const elapsedMs = performance.now() - startedAt;

    // The W0 write really was started and really is still in flight...
    expect(seam.attempts).toHaveLength(1);
    expect(seam.attempts[0]!.window).toBe(W0());
    expect(seam.attempts[0]!.settled).toBe(false);
    // ...and the ordinary opaque 429 came back anyway. A rate-limit refusal is
    // a public path: it must never be gated on database persistence.
    expect(observed.state()).toBe("rejected");
    expect(elapsedMs).toBeLessThan(1_000);
    const error = observed.error();
    expect(error).toBeInstanceOf(AuthFlowError);
    expect(error).toMatchObject({ code: "AUTH_RATE_LIMITED", statusCode: 429 });
    expect((error as Error).message).toBe("AUTH_RATE_LIMITED");
    expect(JSON.stringify((error as Error).cause ?? null)).not.toContain("PG_");

    await refusal.catch(() => undefined);
  }, 60_000);

  it("keeps the rollover snapshot owned when its write fails, and writes W0 and W1 exactly once on recovery", async () => {
    const seam = rolloverSeam();
    seam.hold();
    await seam.refuse(new Date(W0())).catch(() => undefined);
    expect(seam.attempts).toHaveLength(0);

    // W1 opens. The snapshot it hands back is the LAST copy of W0: the limiter
    // has already released it.
    const rollover = watch(seam.refuse(new Date(W1())));
    await turns();
    expect(seam.attempts).toHaveLength(1);
    expect(seam.attempts[0]!.window).toBe(W0());

    // That one write fails. Nothing may quietly absorb the failure and drop the
    // only copy — while the public 429 still comes back unchanged.
    seam.attempts[0]!.reject(PG_FAILURE());
    seam.failFrom();
    await turns();
    expect(rollover.state()).toBe("rejected");
    expect(rollover.error()).toMatchObject({ code: "AUTH_RATE_LIMITED" });
    expect(seam.recorded).toHaveLength(0);

    // A shutdown drain must REJECT rather than report a drained shutdown over
    // a window that was never durably written.
    const failed = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(failed.state()).toBe("rejected");
    expect(seam.recorded).toHaveLength(0);

    // The repository comes back. BOTH windows must still be owned, and each
    // must produce exactly one row, in window order, with its own counts.
    seam.succeedFrom();
    const recovered = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(recovered.state()).toBe("resolved");
    expect(seam.writesFor(W0())).toBeGreaterThanOrEqual(1);
    expect(seam.recorded).toHaveLength(2);
    expect(seam.recorded[0]).toMatchObject(rowFor(W0()));
    expect(seam.recorded[1]).toMatchObject(rowFor(W1()));

    // Idempotent afterwards: nothing pending, nothing rewritten.
    const again = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(again.state()).toBe("resolved");
    expect(seam.recorded).toHaveLength(2);
    const { outcome, events } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(events).toContain("argon2Pool.close");
  }, 60_000);

  // ------------------------------------------------------------------
  // TRACE B — W0's write is in flight while W1 rolls over.
  // ------------------------------------------------------------------
  it("starts no second W0 write and resolves no drain while the W0 writer is held", async () => {
    const seam = rolloverSeam();
    seam.hold();
    await seam.refuse(new Date(W0())).catch(() => undefined);

    // Put W0's write genuinely IN FLIGHT behind a real promise barrier.
    const early = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(seam.attempts).toHaveLength(1);
    expect(seam.attempts[0]!.window).toBe(W0());
    expect(seam.attempts[0]!.settled).toBe(false);

    // W1 opens while that writer is still unresolved.
    await seam.refuse(new Date(W1())).catch(() => undefined);
    // Later writes would land instantly — only the held W0 writer is blocking.
    seam.succeedFrom();
    const second = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();

    // W0 has exactly ONE writer. A window whose write is already in flight must
    // not be copied into a new queue that a second drain writes again.
    expect(seam.writesFor(W0())).toBe(1);
    expect(seam.recorded.filter((row) =>
      (row.aggregateWindowStartedAt as Date).getTime() === W0())).toHaveLength(0);
    // And no drain may report completion over a route writer still in flight.
    expect(seam.attempts[0]!.settled).toBe(false);
    expect(early.state()).toBe("pending");
    expect(second.state()).toBe("pending");

    // Release the barrier: both windows land exactly once and teardown finishes.
    seam.releaseAll();
    await turns();
    expect(early.state()).toBe("resolved");
    expect(second.state()).toBe("resolved");
    expect(seam.writesFor(W0())).toBe(1);
    expect(seam.writesFor(W1())).toBe(1);
    expect(seam.recorded).toHaveLength(2);
    expect(seam.recorded[0]).toMatchObject(rowFor(W0()));
    expect(seam.recorded[1]).toMatchObject(rowFor(W1()));

    const { outcome, events } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(events).toContain("argon2Pool.close");
    expect(seam.recorded).toHaveLength(2);
  }, 60_000);

  it("leaves no orphan writer when the in-flight W0 write fails after rollover", async () => {
    const seam = rolloverSeam();
    seam.hold();
    await seam.refuse(new Date(W0())).catch(() => undefined);

    const early = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(seam.attempts).toHaveLength(1);
    expect(seam.attempts[0]!.settled).toBe(false);

    await seam.refuse(new Date(W1())).catch(() => undefined);
    // Everything EXCEPT the held W0 writer would succeed instantly. A drain that
    // resolves here has stopped tracking the writer that actually owns W0.
    seam.succeedFrom();
    const second = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(second.state()).toBe("pending");
    expect(seam.writesFor(W0())).toBe(1);

    // The owning write now fails. Every drain that claimed this route must see
    // it; none may have already returned success.
    seam.attempts[0]!.reject(PG_FAILURE());
    seam.failFrom();
    await turns();
    expect(early.state()).toBe("rejected");
    expect(second.state()).toBe("rejected");
    expect(seam.recorded).toHaveLength(0);

    // Recovery writes each retained window exactly once, in window order.
    seam.succeedFrom();
    const recovered = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(recovered.state()).toBe("resolved");
    expect(seam.recorded).toHaveLength(2);
    expect(seam.recorded[0]).toMatchObject(rowFor(W0()));
    expect(seam.recorded[1]).toMatchObject(rowFor(W1()));

    const { outcome } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(seam.recorded).toHaveLength(2);
  }, 60_000);

  // ------------------------------------------------------------------
  // The superseded-window rule, exercised directly.
  //
  // W0's aggregation timer is cancelled when W1 opens, so in the shipped call
  // graph a stale timer is not supposed to arrive at all. That makes the guard
  // that refuses it invisible to the traces above — and an invisible guard is
  // one nobody notices being deleted. So the arrival is driven here, at the
  // seam the timer itself uses, exactly as the rework2 R4 battery drives the
  // window scheduler.
  // ------------------------------------------------------------------
  it("finalizes nothing and disarms nothing when a superseded window arrives late", async () => {
    const seam = rolloverSeam();
    seam.hold();
    await seam.refuse(new Date(W0())).catch(() => undefined);
    await seam.refuse(new Date(W1())).catch(() => undefined);
    // W0 left the limiter as the rollover snapshot and is queued behind a held
    // write; W1 is the active, still-accumulating window.
    expect(seam.attempts).toHaveLength(1);
    expect(seam.attempts[0]!.window).toBe(W0());

    // W0's cancelled timer arrives anyway. It owns nothing now: finalizing here
    // would enqueue a SECOND copy of a window the snapshot already owns, and
    // would clear the successor's deadline on the way out.
    (seam.service as unknown as {
      finalizeRefusalWindow(route: string, windowStartedAt: number): void;
    }).finalizeRefusalWindow("register", W0());

    seam.releaseAll();
    await turns();
    expect(seam.writesFor(W0())).toBe(1);

    // W1 is still tracked and still finalizable, so the drain finds it.
    const drained = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(drained.state()).toBe("resolved");
    expect(seam.recorded).toHaveLength(2);
    expect(seam.recorded[0]).toMatchObject(rowFor(W0()));
    expect(seam.recorded[1]).toMatchObject(rowFor(W1()));
  }, 60_000);
});

// ====================================================================
// T1 rework5 — the aggregate a write removes must be the aggregate that
// write persisted.
//
// The route queue is ordered by `windowStartedAt`, so a window finalized
// while an earlier-started write is in flight is placed by TIME, not by
// arrival. A wall clock that steps backwards — NTP correction, manual
// adjustment, VM restore — therefore produces a real refusal whose window
// sorts BEFORE the window currently being written, and the queue is
// mutated at index 0 across the write's await.
//
// A pump that reads `queue[0]` before that await and then removes
// `queue[0]` again afterwards is removing whatever sorted to the front in
// the meantime. `recordRateLimitRefusal()` has no deduplication key, so
// the consequence is a permanently lost refusal window and a duplicated
// durable row — and a drain that reports success over both.
// ====================================================================
describe("T1 rework5 — a retrograde window never displaces the in-flight write", () => {
  const mainPath = join(repoRoot, "apps/api/src/main.ts");
  const intervalMs = (): number => authPolicy().rateLimitRefusalAuditIntervalMs;
  const windowBase = (): number => 1_800_000_000_000 - (1_800_000_000_000 % intervalMs());
  /** The window whose write is put in flight and held. */
  const W1 = (): number => windowBase();
  /** The RETROGRADE window: a real later refusal after the clock steps back. */
  const W0 = (): number => windowBase() - intervalMs();
  /** A forward window, queued BEHIND the in-flight write before W0 arrives. */
  const W2 = (): number => windowBase() + intervalMs();

  const SOURCE = Object.freeze({
    ip: "203.0.113.55", userAgent: "t1-rework5-retrograde", requestId: "r5-1"
  });
  const ACTOR = "00000000-0000-4000-8000-000000000055";

  /** One observed `recordRateLimitRefusal` call, with its exact input identity. */
  interface WriteAttempt {
    readonly window: number;
    readonly input: Readonly<Record<string, unknown>>;
    settled: boolean;
    readonly resolve: () => void;
  }

  /**
   * The rework4 seam, unchanged in kind: a REAL `RegistrationService` over a
   * REAL `InProcessAuthRateLimiter`, doubled at exactly one place — the
   * repository write — whose promise the test decides the fate of. Every
   * window boundary, sorted insertion, finalization and drain below is
   * shipped code reacting to real inputs.
   */
  function retrogradeSeam(): {
    readonly service: RegistrationService;
    readonly attempts: readonly WriteAttempt[];
    readonly recorded: readonly Readonly<Record<string, unknown>>[];
    readonly windows: () => readonly number[];
    readonly writesFor: (window: number) => number;
    readonly landsImmediately: () => void;
    readonly refuse: (now: Date) => Promise<never>;
  } {
    const policy = authPolicy();
    const attempts: WriteAttempt[] = [];
    const recorded: Readonly<Record<string, unknown>>[] = [];
    let mode: "hold" | "land" = "hold";
    const limiter = new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const service = new RegistrationService({
      repository: {
        recordRateLimitRefusal(input: Readonly<Record<string, unknown>>): Promise<void> {
          let land!: () => void;
          const promise = new Promise<void>((resolve) => {
            land = () => {
              if (attempt.settled) return;
              attempt.settled = true;
              recorded.push(input);
              resolve();
            };
          });
          const attempt: WriteAttempt = {
            window: (input.aggregateWindowStartedAt as Date).getTime(),
            input,
            settled: false,
            resolve: () => { land(); }
          };
          attempts.push(attempt);
          // Writes are HELD by default and released by hand, so the queue state
          // each write observes is chosen rather than raced for. `land` mode is
          // for the traces where the write is not the thing under test.
          if (mode === "land") attempt.resolve();
          return promise;
        }
      } as never,
      mail: {} as never,
      dekStore: {} as never,
      blindIndexKey: new Uint8Array(32).fill(1),
      policy,
      limiter,
      argon2: {} as never
    });
    return {
      service,
      attempts,
      recorded,
      windows: () => attempts.map((attempt) => attempt.window),
      writesFor: (window) => attempts.filter((attempt) => attempt.window === window).length,
      landsImmediately: () => { mode = "land"; },
      refuse: (now: Date) => (service as unknown as {
        refuseRateLimit(input: {
          route: string; scope: string; actorToken: string; now: Date;
          source: { ip: string; userAgent: string; requestId: string };
        }): Promise<never>;
      }).refuseRateLimit({
        route: "register", scope: "ip", actorToken: ACTOR, now, source: SOURCE
      })
    };
  }

  /** Macrotask turns: a settled promise cannot hide behind them, a held one cannot escape. */
  async function turns(count = 8): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
    }
  }

  type Settlement = "pending" | "resolved" | "rejected";

  /** Observes a promise WITHOUT consuming it, so the same promise is joined later. */
  function watch<T>(promise: Promise<T>): { readonly state: () => Settlement } {
    let state: Settlement = "pending";
    void promise.then(() => { state = "resolved"; }, () => { state = "rejected"; });
    return { state: () => state };
  }

  /** Runs the ACTUAL shipped `onClose` body, so teardown is observed, not argued. */
  async function runShippedTeardown(service: RegistrationService): Promise<{
    readonly outcome: "torn-down" | "threw";
    readonly events: string[];
  }> {
    const body = extractOnCloseBody(readFileSync(mainPath, "utf8"));
    const hook = new AsyncFunction(
      "registration", "auditContextHasher", "argon2Pool", body
    ) as (r: unknown, a: unknown, p: unknown) => Promise<void>;
    const events: string[] = [];
    const outcome = await hook(
      {
        async drainRegistrationAdmissions(): Promise<void> {
          events.push("drainRegistrationAdmissions");
        },
        async drainMailDispatches(): Promise<void> { events.push("drainMailDispatches"); },
        drainRateLimitAuditFlushes: async (): Promise<void> => {
          await service.drainRateLimitAuditFlushes();
        },
        drainMailCapacitySignals(): void { events.push("drainMailCapacitySignals"); }
      },
      { close(): void { events.push("auditContextHasher.close"); } },
      { async close(): Promise<void> { events.push("argon2Pool.close"); } }
    ).then(() => "torn-down" as const, () => "threw" as const);
    return { outcome, events };
  }

  /** The exact durable shape one refusal in `window` must produce, once. */
  const rowFor = (window: number): Readonly<Record<string, unknown>> => Object.freeze({
    route: "register",
    scope: "ip",
    count: 1,
    ipCount: 1,
    addressCount: 0,
    actorToken: ACTOR,
    aggregateWindowStartedAt: new Date(window),
    source: SOURCE
  });

  it("writes the retrograde window exactly once and never re-writes the landed one", async () => {
    const seam = retrogradeSeam();

    // NON-VACUITY: these are three DISTINCT ruled windows, and W0 really is
    // retrograde — strictly earlier than the window already being written.
    expect(intervalMs()).toBe(60_000);
    expect(W0()).toBeLessThan(W1());
    expect(W1()).toBeLessThan(W2());

    // --- 1. W1's write is put genuinely in flight, and held there. ---
    await seam.refuse(new Date(W1())).catch(() => undefined);
    const w1Drain = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(seam.attempts).toHaveLength(1);
    const inFlight = seam.attempts[0]!;
    expect(inFlight.window).toBe(W1());
    // The write is unsettled, so THIS aggregate is the one the shipped pump is
    // parked on — not an inference about timing.
    expect(inFlight.settled).toBe(false);
    expect(w1Drain.state()).toBe("pending");

    // --- 2. A forward window is queued BEHIND that in-flight write. ---
    await seam.refuse(new Date(W2())).catch(() => undefined);
    const w2Drain = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    // One shared writer, so nothing new was started: W2 is queued, not written.
    expect(seam.attempts).toHaveLength(1);
    expect(inFlight.settled).toBe(false);

    // --- 3. The wall clock steps BACKWARD and a real later refusal arrives. ---
    // Same route, same shipped `refuseRateLimit`, only the clock moved. This
    // opens W0, a window older than the one currently being persisted.
    await seam.refuse(new Date(W0())).catch(() => undefined);
    // Finalized through the shipped drain path while the W1 write is still held.
    const w0Drain = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(seam.attempts).toHaveLength(1);
    expect(inFlight.settled).toBe(false);

    // --- 4. Release the original writer. ---
    inFlight.resolve();
    await turns();
    expect(inFlight.settled).toBe(true);

    // THE IDENTITY ASSERTION. The write that just landed persisted W1, so the
    // aggregate the pump removes must be W1 — not whatever the retrograde
    // window sorted in front of it. Under a positional `shift()` the removed
    // object is the never-written W0 and the pump immediately re-attempts the
    // already-durable W1.
    expect(
      seam.attempts[1]?.window,
      "AUDIT_IDENTITY: after W1's write lands the pump must dequeue W1 and move on to the "
      + "retrograde W0 — a positional shift() drops unwritten W0 and re-attempts durable W1"
    ).toBe(W0());
    expect(seam.writesFor(W1())).toBe(1);

    // --- 5. Drain to completion; every window lands exactly once. ---
    seam.attempts[1]!.resolve();
    await turns();
    seam.attempts[2]?.resolve();
    await turns();

    // ORDER: W0 is written BEFORE W2 even though W2 was queued first. That is
    // the externally visible proof that finalizing W0 moved it forward past
    // work already queued behind the in-flight write — i.e. to the very front,
    // ahead of the aggregate being persisted.
    expect(
      seam.windows(),
      "AUDIT_ORDER: exactly three writes — the held W1, then the retrograde W0 ahead of the "
      + "already-queued W2"
    ).toEqual([W1(), W0(), W2()]);
    expect(seam.writesFor(W0())).toBe(1);
    expect(seam.writesFor(W1())).toBe(1);
    expect(seam.writesFor(W2())).toBe(1);

    // No drain may report success over a window it never durably recorded.
    expect(w1Drain.state()).toBe("resolved");
    expect(w2Drain.state()).toBe("resolved");
    expect(w0Drain.state()).toBe("resolved");
    expect(seam.recorded).toHaveLength(3);
    expect(seam.recorded[0]).toMatchObject(rowFor(W1()));
    expect(seam.recorded[1]).toMatchObject(rowFor(W0()));
    expect(seam.recorded[2]).toMatchObject(rowFor(W2()));

    // Nothing retained, nothing rewritten, and teardown completes.
    const again = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(again.state()).toBe("resolved");
    expect(seam.recorded).toHaveLength(3);
    const { outcome, events } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(events).toContain("argon2Pool.close");
    expect(seam.recorded).toHaveLength(3);
  }, 60_000);

  // ------------------------------------------------------------------
  // The predecessor deadline, fired for real.
  //
  // Rollover protects the successor's window TWICE: it cancels the
  // predecessor's `setTimeout`, and `finalizeRefusalWindow` refuses any
  // window that is not the active one. Neither defence is observable
  // alone — cancelling means the callback never arrives, and the guard
  // only matters to a callback that does. Removing BOTH is what strands a
  // window, so that is what this drives, with the shipped timer running on
  // a real, short, shipped-arithmetic deadline rather than a fake clock.
  // ------------------------------------------------------------------
  it("records the successor window after a predecessor deadline is left to fire for real", async () => {
    const seam = retrogradeSeam();
    seam.landsImmediately();
    const interval = intervalMs();
    /** How much of the predecessor's window is left when its refusal arrives. */
    const leadMs = 60;
    const predecessor = windowBase();
    const successor = predecessor + interval;

    // NON-VACUITY: the shipped delay is `windowStartedAt + interval - now`, so a
    // refusal this close to the boundary arms a REAL timer of exactly `leadMs`
    // — a small fraction of the ruled interval, and short enough to actually
    // elapse inside this test rather than being argued about.
    expect(interval).toBe(60_000);
    expect(leadMs).toBeLessThan(interval);

    await seam.refuse(new Date(successor - leadMs)).catch(() => undefined);
    // The window rolls over while the predecessor's deadline is still armed.
    await seam.refuse(new Date(successor)).catch(() => undefined);

    // Let that deadline's real wall-clock moment pass, several times over.
    const startedAt = performance.now();
    await new Promise<void>((resolve) => { setTimeout(resolve, leadMs * 5); });
    const waitedMs = performance.now() - startedAt;
    await turns();
    // The wait genuinely outlasted the armed deadline, so a timer that was
    // going to fire has had its chance.
    expect(waitedMs).toBeGreaterThan(leadMs);

    const drained = watch(seam.service.drainRateLimitAuditFlushes());
    await turns();
    expect(drained.state()).toBe("resolved");

    // Both windows are durable. A late predecessor callback that finalized
    // anything would have disarmed the successor's deadline and stranded its
    // aggregate inside the limiter, where no drain can reach it.
    expect(
      seam.windows(),
      "AUDIT_SUCCESSOR: a predecessor deadline left to fire must neither finalize a window it no "
      + "longer owns nor disarm the successor — both windows stay reachable and land exactly once"
    ).toEqual([predecessor, successor]);
    expect(seam.recorded).toHaveLength(2);
    expect(seam.recorded[0]).toMatchObject(rowFor(predecessor));
    expect(seam.recorded[1]).toMatchObject(rowFor(successor));

    const { outcome } = await runShippedTeardown(seam.service);
    expect(outcome).toBe("torn-down");
    expect(seam.recorded).toHaveLength(2);
  }, 60_000);
});
