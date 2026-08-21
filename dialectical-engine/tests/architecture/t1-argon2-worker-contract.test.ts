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

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cryptoSrc = join(repoRoot, "packages/crypto/src");
const workerPath = join(cryptoSrc, "argon2-worker.ts");
const poolPath = join(cryptoSrc, "argon2-worker-pool.ts");
const auditKdf = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).auditSourceIpKdf;
const passwordKdf = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.argon2id;

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
        memoryCostKiB: ${passwordKdf.memoryCostKiB}, timeCost: ${passwordKdf.timeCost},
        parallelism: ${passwordKdf.parallelism}, hashLength: ${passwordKdf.hashLength}
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
        passwordKdf
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
        { memoryCostKiB: ${auditKdf.memoryCostKiB}, iterations: ${auditKdf.iterations},
          parallelism: ${auditKdf.parallelism}, hashLength: ${auditKdf.hashLength} }
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
        { memoryCostKiB: ${passwordKdf.memoryCostKiB}, timeCost: ${passwordKdf.timeCost},
          parallelism: ${passwordKdf.parallelism}, hashLength: ${passwordKdf.hashLength} }
      );
      await singlePending;
      const singleInFlight = { ticks: ticks - singleBefore.ticks, immediates: immediates - singleBefore.immediates };

      // A single audit KDF likewise.
      const auditBefore = { ticks, immediates };
      await pool.hashAuditContext(
        new TextEncoder().encode("debateai:audit-source-ip:v1\\u0000203.0.113.5"),
        new Uint8Array(32).fill(3),
        { memoryCostKiB: ${auditKdf.memoryCostKiB}, iterations: ${auditKdf.iterations},
          parallelism: ${auditKdf.parallelism}, hashLength: ${auditKdf.hashLength} }
      );
      const auditInFlight = { ticks: ticks - auditBefore.ticks, immediates: immediates - auditBefore.immediates };

      // The eight-password pool run.
      const batchGapMark = gaps.length;
      const batchBefore = { ticks, immediates };
      const batchStart = performance.now();
      await Promise.all(Array.from({ length: 8 }, (_, i) => pool.hashPassword(
        new TextEncoder().encode("batch-" + i), new Uint8Array(16).fill(i + 1),
        { memoryCostKiB: ${passwordKdf.memoryCostKiB}, timeCost: ${passwordKdf.timeCost},
          parallelism: ${passwordKdf.parallelism}, hashLength: ${passwordKdf.hashLength} }
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
        { memoryCostKiB: ${passwordKdf.memoryCostKiB}, timeCost: ${passwordKdf.timeCost},
          parallelism: ${passwordKdf.parallelism}, hashLength: ${passwordKdf.hashLength} }
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
        { memoryCostKiB: ${passwordKdf.memoryCostKiB}, timeCost: ${passwordKdf.timeCost},
          parallelism: ${passwordKdf.parallelism}, hashLength: ${passwordKdf.hashLength} }
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
      barrierExecutor, Buffer.alloc(32, 0x6e), auditKdf
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
