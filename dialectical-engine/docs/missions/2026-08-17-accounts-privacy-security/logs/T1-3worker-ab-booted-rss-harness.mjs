// T1 three-worker A/B — standalone booted-stack RSS harness.
//
// AUTHORING STATUS: this file is design evidence for the packet
// `T1-claude-3worker-ab-draft-packet.md`, corrected under
// `T1-claude-3worker-ab-artifact-correction1-packet.md` after two independent
// GPT-5.6 Sol xHigh reviews returned CHANGES REQUESTED. Corrections in this
// file: every RSS read is routed through the safety observer and asserted
// immediately, no work starts after the first breach, a breach exits exactly 3,
// `console.error` is captured like every other channel, and a cleanup failure
// can no longer coexist with `COMPLETE` or status 0.
// It has never been executed. It may not
// be executed until two Sol xHigh reviewers approve this exact source AND V
// approves the run. The SHA embedded below is the design-stage packet hash; the
// run wrapper must still compare the on-disk packet against the hash V approved
// externally before it exports `T1_N3_AB_PACKET_SHA256`.
//
// WHY THIS FILE EXISTS
// The policy's 368.7 MiB figure came from a Vitest-worker provenance class: a
// process that also holds Vitest's own runner, module graph and reporters. It is
// not comparable to a genuine booted product process, and it cannot be used to
// derive an operator memory bound. This harness is the other provenance class —
// one plain Node process that boots the same components `apps/api/src/main.ts`
// boots, in the same order, with no test runner resident. Prior standalone
// booted observations of 315.3/327.1 MiB belong to this class; the number this
// harness produces is comparable to those and to nothing else.
//
// WHAT IT MEASURES, AND WHAT IT DOES NOT
// It measures whole-process RSS for one selected Argon2 worker count across a
// fixed script: boot, ten real registrations, an exact limiter-occupancy sweep,
// and eight concurrent maximum-cost credential jobs. Its output is a DESCRIPTIVE
// resource observation. It is not a statistical cell: it contributes no paired
// value to the integration sign tests and no causal conclusion. Any RSS bound
// derived from it is an UNRATIFIED CANDIDATE until V rules on it separately.
//
// INVOCATION (by the wrapper only, never by hand):
//   node --expose-gc --import tsx <this file>
// with `T1_N3_AB_PACKET_SHA256`, `T1_N3_AB_WORKERS` and `T1_N3_AB_CELL_ID` set.
// There is deliberately no output-path argument: the process writes exactly one
// marker line to stdout and nothing else to stdout, so the wrapper owns custody
// of where that line lands.

import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import os from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Module-evaluation authorization gate.
//
// Everything in this block runs BEFORE a database, a worker thread or a secret
// directory exists. A missing or wrong token must cost nothing and leave
// nothing behind, so the gate is deliberately the first executable statement
// after the import list and constructs no product object at all.
// ---------------------------------------------------------------------------

/**
 * SHA-256 of `T1-claude-3worker-ab-draft-packet.md` at design-stage approval.
 * The packet cannot contain its own hash, so the literal lives here and in the
 * adjudicator, and the wrapper is what binds both to V's externally recorded
 * approval.
 */
const EXPECTED_PACKET_SHA256 =
  "a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503";

/** The only lawful worker counts for this diagnostic. */
const LAWFUL_WORKER_COUNTS = Object.freeze(["2", "3"]);

/**
 * Secret-free cell identifier. Lowercase alphanumerics, dot, dash, underscore.
 * The wrapper supplies something like `standalone-pair03-a-w3`; the pattern
 * exists so a cell label can never smuggle an address, a path or a token into
 * the one line this process prints.
 */
const CELL_ID_SHAPE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Whole-process RSS diagnostic safety stop ruled by V. Not an operator bound. */
const RSS_SAFETY_LIMIT_BYTES = 512 * 1024 * 1024;

/** Stable stdout marker. The wrapper locates the report by this prefix. */
const REPORT_MARKER = "[T1_N3_AB_STANDALONE_REPORT]";

/**
 * The exact limiter geometry this harness asserts against. `bucket_capacity` is
 * 524,288 per route across the three auth routes, so a fully occupied limiter is
 * 1,572,864 of 1,572,864 slots. A different geometry means the governed policy
 * moved under the experiment, which is a custody question, not a measurement.
 */
const EXPECTED_PER_ROUTE_SLOT_CAPACITY = 524_288;
const EXPECTED_TOTAL_SLOT_CAPACITY = 1_572_864;
const AUTH_ROUTE_NAMES = Object.freeze(["register", "verify", "resend"]);

/** Exact occupancy fractions sampled, in the order they are applied. */
const OCCUPANCY_STEPS = Object.freeze([
  Object.freeze({ label: "0", numerator: 0, denominator: 4 }),
  Object.freeze({ label: "25", numerator: 1, denominator: 4 }),
  Object.freeze({ label: "50", numerator: 2, denominator: 4 }),
  Object.freeze({ label: "100", numerator: 4, denominator: 4 })
]);

/**
 * Fixed far-future epoch written into occupied slots, 2100-01-01T00:00:00Z.
 * A wall-clock-derived value would make the touched state depend on when the
 * cell ran; this constant makes the occupancy sweep byte-deterministic.
 */
const OCCUPANCY_SENTINEL_MS = 4_102_444_800_000;

/** Registrations the booted script performs, and the exact durable row count. */
const REGISTRATION_COUNT = 10;

/** Concurrent maximum-cost credential jobs, identical for both worker counts. */
const MAX_COST_JOB_COUNT = 8;

/** Whole-process sampling cadence while credential work is pending. */
const SAMPLE_INTERVAL_MS = 5;

/** Bounded waits, so no failure mode of this harness is an unbounded hang. */
const QUIESCE_TIMEOUT_MS = 180_000;
const WARM_UP_OBSERVE_TIMEOUT_MS = 180_000;

class HarnessError extends Error {
  constructor(code) {
    super(code);
    this.name = "HarnessError";
    this.code = code;
  }
}

/**
 * Fails the process before any resource exists.
 *
 * Thrown at module evaluation on purpose: `node --check` still parses this file,
 * but an unauthorized invocation dies here rather than after booting PostgreSQL.
 */
function authorize() {
  if (process.env.T1_N3_AB_PACKET_SHA256 !== EXPECTED_PACKET_SHA256) {
    throw new HarnessError("T1_N3_AB_PACKET_TOKEN_MISMATCH");
  }
  const workersRaw = process.env.T1_N3_AB_WORKERS;
  if (!LAWFUL_WORKER_COUNTS.includes(workersRaw)) {
    throw new HarnessError("T1_N3_AB_WORKER_COUNT_INVALID");
  }
  const cellId = process.env.T1_N3_AB_CELL_ID;
  if (typeof cellId !== "string" || !CELL_ID_SHAPE.test(cellId)) {
    throw new HarnessError("T1_N3_AB_CELL_ID_INVALID");
  }
  // No arbitrary output path, and no positional arguments of any kind. The only
  // durable artifact of a run is the wrapper-captured stdout of this process.
  if (process.argv.length > 2) {
    throw new HarnessError("T1_N3_AB_UNEXPECTED_ARGUMENT");
  }
  // The occupancy and settled-RSS readings are only interpretable after a real
  // major collection. Inferring gc from a flag string would let a mis-invoked
  // cell report unquiesced numbers as if they were quiesced.
  if (typeof globalThis.gc !== "function") {
    throw new HarnessError("T1_N3_AB_EXPOSE_GC_REQUIRED");
  }
  // This run's commitment. It binds this report to the run directory that
  // requested it, so a receipt from an earlier run cannot be replayed forward.
  const runCommitment = process.env.T1_N3_AB_RUN_COMMITMENT;
  if (typeof runCommitment !== "string" || !/^[0-9a-f]{64}$/.test(runCommitment)) {
    throw new HarnessError("T1_N3_AB_RUN_COMMITMENT_INVALID");
  }
  // The supervisor's verified identity, inherited rather than self-declared.
  const supervisedPid = Number(process.env.T1_N3_AB_SUPERVISED_PID);
  const supervisedPgid = Number(process.env.T1_N3_AB_SUPERVISED_PGID);
  const supervisedSid = Number(process.env.T1_N3_AB_SUPERVISED_SID);
  if (!Number.isInteger(supervisedPid) || !Number.isInteger(supervisedPgid)
    || !Number.isInteger(supervisedSid) || supervisedPid <= 0
    || supervisedPgid !== supervisedPid || supervisedSid !== supervisedPid) {
    throw new HarnessError("T1_N3_AB_SUPERVISED_IDENTITY_INVALID");
  }
  return Object.freeze({
    cellId,
    workerCount: Number(workersRaw),
    runCommitment,
    supervisedPid,
    supervisedPgid,
    supervisedSid
  });
}

const AUTHORIZATION = authorize();

// ---------------------------------------------------------------------------
// Opacity helpers.
//
// This process holds addresses, passwords, source IPs, verification tokens,
// blind-index keys, a KEK, salts, hashes and a secret directory path. None of
// them may reach stdout or stderr. Every value that leaves this process passes
// through one of the two functions below.
// ---------------------------------------------------------------------------

/** Our own codes are secret-free by construction and may be reported verbatim. */
const OWN_CODE_SHAPE = /^T1_N3_AB_[A-Z0-9_]{1,64}$/;
/** Product/infrastructure codes are screaming-snake constants, never payloads. */
const GENERIC_CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,63}$/;

/**
 * Reduces any thrown value to a code that cannot carry a secret.
 *
 * Error messages are the classic leak: `EMBEDDED_POSTGRES_PROVISIONING_FAILED`
 * is safe, but a `pg` error, a filesystem error or a validation error routinely
 * embeds a path, an address or a connection string. So a message is reported
 * only when it is itself a recognized code, and anything else collapses to a
 * single opaque label plus the constructor name.
 */
function errorCode(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (OWN_CODE_SHAPE.test(message)) return message;
  const code = typeof error?.code === "string" ? error.code : "";
  if (GENERIC_CODE_SHAPE.test(code)) return code;
  if (GENERIC_CODE_SHAPE.test(message)) return message;
  return "T1_N3_AB_UNCLASSIFIED_ERROR";
}

/** The non-secret shape of a failure: a code and the error class name only. */
function describeError(error) {
  const name = typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
    ? error.name
    : "Error";
  return Object.freeze({ code: errorCode(error), errorClass: name });
}

/**
 * Ordinal-free summary of a numeric sample series.
 *
 * Raw per-sample arrays are deliberately NOT reported: an index into a sample
 * array is an ordinal that can be correlated back to a specific request or job,
 * which is exactly what the packet forbids. Percentiles carry the measurement
 * without carrying the correlation.
 */
function summarize(samples) {
  if (samples.length === 0) {
    return Object.freeze({ count: 0, min: null, max: null, mean: null, p50: null, p95: null, p99: null });
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: total / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99)
  });
}

// ---------------------------------------------------------------------------
// stdout discipline.
//
// `startTestDatabase` forwards embedded-PostgreSQL server logs through
// `console.info`, and `console.info` writes to stdout. The packet requires that
// stdout carry exactly one final JSON object preceded only by a stable marker,
// so every console channel is redirected to stderr for the whole run. Nothing is
// discarded: the wrapper captures stdout and stderr together and the adjudicator
// scans both, so this only moves the noise, it never hides it.
// ---------------------------------------------------------------------------

// `error` is in this list deliberately. The prior draft omitted it, which left
// the single channel a failing product path is most likely to use writing
// straight to stderr without the identifier-safe prefix — and, worse, made the
// harness's own claim to redirect "every console channel" untrue.
const CONSOLE_CHANNELS = Object.freeze(["log", "info", "debug", "warn", "error", "trace"]);
const originalConsole = new Map();

/**
 * Identifier-safe capture. It FORWARDS NOTHING.
 *
 * The previous version wrote `args.map(String)` to stderr, which is not a
 * capture at all: `startTestDatabase` forwards embedded-PostgreSQL server logs
 * containing socket paths, data directories and connection strings, and every
 * one of them would have reached a durable receipt verbatim. This version keeps
 * counts per channel and a bounded histogram of recognized SCREAMING_SNAKE
 * codes, and drops the arguments entirely.
 */
const consoleCapture = {
  byChannel: Object.create(null),
  codes: new Map(),
  total: 0
};

function installIdentifierSafeCapture() {
  for (const channel of CONSOLE_CHANNELS) {
    consoleCapture.byChannel[channel] = 0;
    originalConsole.set(channel, console[channel]);
    console[channel] = (...args) => {
      consoleCapture.byChannel[channel] += 1;
      consoleCapture.total += 1;
      // Only a bracketed code is ever retained, and only if it is already a
      // secret-free constant. Everything else collapses to `UNCODED`.
      let code = "UNCODED";
      const first = args.length > 0 && typeof args[0] === "string" ? args[0] : "";
      const match = /\[([A-Z][A-Z0-9_]{2,63})\]/.exec(first);
      if (match !== null) code = match[1];
      if (consoleCapture.codes.size < 64 || consoleCapture.codes.has(code)) {
        consoleCapture.codes.set(code, (consoleCapture.codes.get(code) ?? 0) + 1);
      }
    };
  }
}

function restoreConsole() {
  for (const [channel, original] of originalConsole) console[channel] = original;
  originalConsole.clear();
}

function captureMetrics() {
  return Object.freeze({
    capturedLines: consoleCapture.total,
    byChannel: Object.freeze({ ...consoleCapture.byChannel }),
    codes: Object.freeze(Object.fromEntries([...consoleCapture.codes.entries()].sort()))
  });
}

// ---------------------------------------------------------------------------
// Product module loading.
//
// Imported dynamically, after the gate, from the repository root four levels
// above this mission-log directory. `--import tsx` is what makes the TypeScript
// sources loadable; this file itself is plain ESM so `node --check` can parse it
// without a loader.
// ---------------------------------------------------------------------------

const REPOSITORY_ROOT = new URL("../../../../", import.meta.url);

function moduleHref(relativePath) {
  return new URL(relativePath, REPOSITORY_ROOT).href;
}

async function loadProductModules() {
  const [crypto, db, register, registration, mailChannel, testDatabase] = await Promise.all([
    import(moduleHref("packages/crypto/src/index.ts")),
    import(moduleHref("packages/db/src/index.ts")),
    import(moduleHref("packages/register/src/auth-policy.ts")),
    import(moduleHref("apps/api/src/registration.ts")),
    import(moduleHref("apps/api/src/mail-channel.ts")),
    import(moduleHref("tests/support/testDatabase.ts"))
  ]);
  return Object.freeze({
    Argon2WorkerPool: crypto.Argon2WorkerPool,
    AuditContextHasher: crypto.AuditContextHasher,
    FileUserDekStore: crypto.FileUserDekStore,
    loadKek: crypto.loadKek,
    migrate: db.migrate,
    PostgresIdentityRepository: db.PostgresIdentityRepository,
    AUTH_POLICY_REGISTER_ROWS: register.AUTH_POLICY_REGISTER_ROWS,
    authPolicyFromRegisterRows: register.authPolicyFromRegisterRows,
    InProcessAuthRateLimiter: registration.InProcessAuthRateLimiter,
    RegistrationService: registration.RegistrationService,
    MemoryMailSender: mailChannel.MemoryMailSender,
    startTestDatabase: testDatabase.startTestDatabase
  });
}

// ---------------------------------------------------------------------------
// Limiter occupancy: structural page-touch, not a counter bump.
//
// The limiter holds four preallocated typed arrays. `occupiedSlotsByRoute` is a
// bookkeeping counter over them. Setting that counter to 1,572,864 would produce
// a report that CLAIMS full occupancy while every expiry page stayed untouched
// and unresident — which is precisely the measurement fraud the packet names.
// So the sweep writes real values into the count, head, saturation and expiry
// arrays, and then re-derives occupancy by SCANNING those arrays rather than
// trusting the counter it just wrote.
// ---------------------------------------------------------------------------

const LIMITER_STRUCTURAL_FIELDS = Object.freeze([
  "slotCounts", "slotHeads", "slotSaturatedUntil", "slotExpiries",
  "slotOffsetByRoute", "expiryOffsetByRoute", "occupiedSlotsByRoute"
]);

/**
 * A read/write view of the limiter's preallocated state.
 *
 * This is a test-only structural view of an existing instance, exactly like the
 * `limiterMemoryOccupancy` probe in the governed integration test. It adds no
 * product API and mutates no product source. If the shape ever stops matching,
 * the harness fails closed rather than measuring something it does not
 * understand.
 */
function limiterStructuralView(limiter) {
  for (const field of LIMITER_STRUCTURAL_FIELDS) {
    if (limiter[field] === undefined) throw new HarnessError("T1_N3_AB_LIMITER_SHAPE_UNRECOGNISED");
  }
  return limiter;
}

/**
 * Clears the limiter to an exact, provable 0% occupancy.
 *
 * Scope is deliberate. `slotCounts`, `slotHeads` and `slotSaturatedUntil` are
 * zeroed in FULL, because a single stale saturation timestamp anywhere would
 * keep a slot occupied and make the 0% label a lie. `slotExpiries` is left
 * exactly as the ten registrations left it: `activeCount` never reads an expiry
 * for a slot whose count is zero, so the reset is logically complete without
 * it — and bulk-filling 17,301,504 doubles here would make every later page a
 * pre-touched page and quietly flatten the whole sweep to nothing.
 */
function resetLimiterOccupancy(limiter) {
  const view = limiterStructuralView(limiter);
  view.slotCounts.fill(0);
  view.slotHeads.fill(0);
  view.slotSaturatedUntil.fill(0);
  for (const route of AUTH_ROUTE_NAMES) view.occupiedSlotsByRoute[route] = 0;
  return Object.freeze({
    zeroedSlotElements: view.slotCounts.length + view.slotHeads.length
      + view.slotSaturatedUntil.length,
    expiryElementsLeftAsRegistered: view.slotExpiries.length
  });
}

/**
 * Occupies the first `fraction` of every route's slot row and touches every
 * expiry page those slots address.
 *
 * Each occupied slot is given a full admission ring: `admissionPerSource`
 * entries at the far-future sentinel. That is what makes the expiry array
 * resident rather than reserved, and it is why the 100% step writes all
 * 17,301,504 expiry doubles instead of 1,572,864 of them.
 */
function applyLimiterOccupancy(limiter, policy, numerator, denominator, rss) {
  const view = limiterStructuralView(limiter);
  // The 1,572,864-slot sweep is SYNCHRONOUS: it never yields, so the 5 ms timer
  // cannot fire during it and the ceiling could otherwise be crossed unseen.
  // Direct reads at bounded page chunks close that window.
  const CHUNK = 4096;
  let sinceObservation = 0;
  const observeChunk = () => {
    sinceObservation += 1;
    if (sinceObservation < CHUNK) return;
    sinceObservation = 0;
    rss.observe();
    rss.assertWithinSafety();
  };
  const perRoute = policy.rateLimitBucketCapacity;
  const target = Math.floor((perRoute * numerator) / denominator);
  let touchedSlotElements = 0;
  let touchedExpiryElements = 0;
  for (const route of AUTH_ROUTE_NAMES) {
    const limit = policy.rateLimits[route].admissionPerSource;
    const slotOffset = view.slotOffsetByRoute[route];
    const expiryOffset = view.expiryOffsetByRoute[route];
    for (let slot = 0; slot < target; slot += 1) {
      const index = slotOffset + slot;
      view.slotCounts[index] = limit;
      view.slotHeads[index] = 0;
      view.slotSaturatedUntil[index] = OCCUPANCY_SENTINEL_MS;
      touchedSlotElements += 3;
      const expiryBase = expiryOffset + slot * limit;
      for (let entry = 0; entry < limit; entry += 1) {
        view.slotExpiries[expiryBase + entry] = OCCUPANCY_SENTINEL_MS;
        touchedExpiryElements += 1;
        observeChunk();
      }
    }
    view.occupiedSlotsByRoute[route] = target;
  }
  return Object.freeze({ targetPerRoute: target, touchedSlotElements, touchedExpiryElements });
}

/**
 * Re-derives occupancy from the arrays themselves.
 *
 * The counter the sweep just wrote is not evidence. This scan is: it counts
 * slots that are genuinely non-empty and expiry entries that genuinely hold the
 * sentinel, so a counter-only mutation of the sweep is visible as a mismatch
 * between `reportedOccupiedSlots` and `scannedOccupiedSlots`.
 */
function scanLimiterOccupancy(limiter, policy) {
  const view = limiterStructuralView(limiter);
  let scannedOccupiedSlots = 0;
  let scannedSentinelExpiries = 0;
  for (const route of AUTH_ROUTE_NAMES) {
    const limit = policy.rateLimits[route].admissionPerSource;
    const slotOffset = view.slotOffsetByRoute[route];
    const expiryOffset = view.expiryOffsetByRoute[route];
    for (let slot = 0; slot < policy.rateLimitBucketCapacity; slot += 1) {
      const index = slotOffset + slot;
      if (view.slotCounts[index] > 0 || view.slotSaturatedUntil[index] > 0) scannedOccupiedSlots += 1;
      const expiryBase = expiryOffset + slot * limit;
      for (let entry = 0; entry < limit; entry += 1) {
        if (view.slotExpiries[expiryBase + entry] === OCCUPANCY_SENTINEL_MS) scannedSentinelExpiries += 1;
      }
    }
  }
  const reported = limiter.memoryOccupancy();
  return Object.freeze({
    scannedOccupiedSlots,
    scannedSentinelExpiries,
    reportedOccupiedSlots: reported.occupiedSlots,
    reportedSlotCapacity: reported.slotCapacity,
    reportedPerRouteSlotCapacity: reported.perRouteSlotCapacity,
    reportedAllocatedBytes: reported.allocatedBytes
  });
}

// ---------------------------------------------------------------------------
// Whole-process observation.
// ---------------------------------------------------------------------------

/**
 * One RSS reading, plus the safety verdict for it.
 *
 * Every RSS read in this file goes through here, so the 512 MiB stop cannot be
 * bypassed by a code path that happens to read `process.memoryUsage()` directly.
 */
function makeRssObserver() {
  const state = {
    // The PID this observer measures is recorded explicitly: a peak attributed
    // to "the process" is worthless if a reader cannot tell WHICH process, and
    // a Vitest parent's RSS is not a booted-stack measurement.
    measuredPid: process.pid,
    peakBytes: 0,
    peakSampleBytes: [],
    backgroundSamples: 0,
    exceeded: false,
    exceededAtBytes: null,
    admitWork: true
  };
  const observer = Object.freeze({
    state,
    observe() {
      const rss = process.memoryUsage.rss();
      if (rss > state.peakBytes) {
        state.peakBytes = rss;
        // The peak trajectory is preserved, bounded, so the structured report
        // shows how the ceiling was approached rather than only that it was.
        state.peakSampleBytes.push(rss);
        if (state.peakSampleBytes.length > 256) state.peakSampleBytes.shift();
      }
      if (rss > RSS_SAFETY_LIMIT_BYTES && !state.exceeded) {
        state.exceeded = true;
        state.exceededAtBytes = rss;
        // Admission stops at the instant of the breach, before any assertion
        // is thrown, so no further work can be started even by a caller that
        // does not assert.
        state.admitWork = false;
      }
      return rss;
    },
    admits() {
      return state.admitWork;
    },
    assertWithinSafety() {
      if (state.exceeded) throw new HarnessError("T1_N3_AB_RSS_SAFETY_EXCEEDED");
    }
  });
  return observer;
}

/**
 * A 5 ms whole-process observer that runs for the ENTIRE life of the cell.
 *
 * The previous version only sampled inside the two measured phases, so a breach
 * during boot, migrations, registrations or teardown was invisible. The ruled
 * 512 MiB ceiling covers the whole Node process, so the observer must too.
 */
function startBackgroundObserver(rss) {
  const timer = setInterval(() => {
    rss.observe();
    rss.state.backgroundSamples += 1;
  }, SAMPLE_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Forces a real major collection and lets one macrotask turn settle after it. */
async function collectGarbage() {
  const options = Object.freeze({ type: "major", execution: "sync", flavor: "last-resort" });
  globalThis.gc(options);
  globalThis.gc(options);
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Waits until the pool reports no outstanding work, then collects.
 *
 * Worker threads own 64 MiB Argon2 arenas that a main-thread collection can
 * neither see nor quiesce, so an RSS reading taken with jobs in flight measures
 * arena churn rather than retention. Every quiesced sample point in this harness
 * passes through here, which is what makes those readings order-independent.
 */
async function quiesce(pool, rss) {
  const startedAt = performance.now();
  while (pool.stats().outstandingTotal > 0) {
    if (performance.now() - startedAt > QUIESCE_TIMEOUT_MS) {
      throw new HarnessError("T1_N3_AB_QUIESCE_TIMEOUT");
    }
    rss.observe();
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
  }
  await collectGarbage();
  return performance.now() - startedAt;
}

/**
 * Reads the distinct non-main thread identifiers the pool currently owns.
 *
 * The identifiers themselves are never reported — only their count and the
 * main-thread-fallback verdict. A worker thread id is not a secret, but it is an
 * ordinal that correlates cells to each other, and the packet's report surface
 * is thread-count statistics rather than thread identity.
 */
function threadEvidence(pool) {
  const slots = pool.slots;
  if (!Array.isArray(slots)) throw new HarnessError("T1_N3_AB_POOL_SHAPE_UNRECOGNISED");
  const ids = new Set();
  let mainThreadFallback = false;
  let slotsWithoutHandle = 0;
  for (const slot of slots) {
    const handle = slot.handle;
    if (handle === undefined) {
      slotsWithoutHandle += 1;
      continue;
    }
    const threadId = handle.threadId;
    if (typeof threadId !== "number") throw new HarnessError("T1_N3_AB_POOL_SHAPE_UNRECOGNISED");
    // Thread id 0 is the main thread. A pool slot reporting it would mean the
    // KDF ran inline on the event loop, which invalidates every timing here.
    if (threadId === 0) mainThreadFallback = true;
    ids.add(threadId);
  }
  return Object.freeze({
    slotCount: slots.length,
    slotsWithoutHandle,
    distinctNonMainThreadCount: [...ids].filter((id) => id !== 0).length,
    mainThreadFallback
  });
}

/** The pool-state fields this harness reports. Never job or request identity. */
function poolSnapshot(stats) {
  return Object.freeze({
    state: stats.state,
    workers: stats.workers,
    readyWorkers: stats.readyWorkers,
    liveHandles: stats.liveHandles,
    retiringHandles: stats.retiringHandles,
    active: stats.active,
    queuedCredential: stats.queuedCredential,
    queuedTotal: stats.queuedTotal,
    outstandingCredential: stats.outstandingCredential,
    outstandingTotal: stats.outstandingTotal,
    restartsInWindow: stats.restartsInWindow,
    breakerTripped: stats.breakerTripped
  });
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

/**
 * Holder for the partial measurement record of a failed run.
 *
 * A rethrown error cannot reliably carry a property (the thrown value may be
 * frozen, or not an object at all), so the evidence is handed over here instead.
 */
const FAILURE_EVIDENCE = { measurements: null };

async function run() {
  // The observer starts BEFORE the product dynamic imports, so the ceiling sees
  // module-graph and WASM instantiation cost too. A ceiling that only starts
  // watching after the expensive part is not a ceiling.
  const rss = makeRssObserver();
  const stopBackgroundObserver = startBackgroundObserver(rss);
  rss.observe();
  rss.assertWithinSafety();
  const modules = await loadProductModules();
  const policy = modules.authPolicyFromRegisterRows(modules.AUTH_POLICY_REGISTER_ROWS);
  rss.observe();
  rss.assertWithinSafety();

  // Geometry is asserted BEFORE anything expensive, so a policy drift under the
  // experiment is a fast custody failure rather than a ten-minute measurement of
  // the wrong thing.
  if (policy.rateLimitBucketCapacity !== EXPECTED_PER_ROUTE_SLOT_CAPACITY
    || policy.rateLimitBucketCapacity * AUTH_ROUTE_NAMES.length !== EXPECTED_TOTAL_SLOT_CAPACITY) {
    throw new HarnessError("T1_N3_AB_LIMITER_SLOT_CAPACITY_UNEXPECTED");
  }
  if (policy.password.argon2id.memoryCostKiB !== 65_536 || policy.password.argon2id.timeCost !== 3) {
    throw new HarnessError("T1_N3_AB_PASSWORD_KDF_NOT_MAXIMUM_COST");
  }

  // Local secret material. Held in named buffers precisely so the cleanup path
  // can zero them; the values are fixed test constants and are never printed.
  const blindIndexKey = Buffer.alloc(32, 0x3c);
  const sourceIpSalt = Buffer.alloc(32, 0x6e);
  const kekMaterial = Buffer.alloc(32, 0x7d);

  const loadAtStart = os.loadavg();
  const resourceAtStart = process.resourceUsage();
  const eventLoop = monitorEventLoopDelay({ resolution: 1 });
  eventLoop.enable();
  let postgresPort = -1;

  const lifecycle = {
    database: undefined,
    secretRoot: undefined,
    pool: undefined,
    auditHasher: undefined,
    service: undefined
  };
  const cleanup = {
    order: [],
    serviceDrain: null,
    hasherClose: null,
    poolClose: null,
    databaseStop: null,
    secretRootRemoval: null,
    bufferZeroing: null,
    buffersZeroed: false,
    statsBeforeClose: null,
    statsAfterClose: null,
    poolCloseMs: null,
    poolTerminationConfirmed: false,
    failedSteps: null,
    ok: false
  };

  const measurements = {};

  try {
    // 1. One embedded PostgreSQL, then real migrations. Same database mechanism
    //    the governed integration suite uses, so schema provenance is identical.
    const bootStartedAt = performance.now();
    lifecycle.database = await modules.startTestDatabase();
    await modules.migrate(lifecycle.database.pool);
    measurements.databaseBootMs = performance.now() - bootStartedAt;
    measurements.databaseMechanism = lifecycle.database.mechanism;
    measurements.bootRssBytes = rss.observe();
    rss.assertWithinSafety();
    // The port is the adjudicator's proof that this cell owned its OWN embedded
    // PostgreSQL rather than sharing one with an adjacent cell. It is a local
    // ephemeral port, not a credential, and nothing else from the connection
    // string is ever retained or printed.
    postgresPort = Number(/:(\d+)\//.exec(lifecycle.database.connectionString)?.[1] ?? -1);
    rss.observe();

    // 2. One Argon2 pool at the selected count, ready before any consumer.
    //    Every other pool bound stays at its shipped production value; only the
    //    worker count varies, because the worker count IS the experiment.
    const poolStartedAt = performance.now();
    lifecycle.pool = new modules.Argon2WorkerPool({ workers: AUTHORIZATION.workerCount });
    await lifecycle.pool.ready();
    measurements.poolReadyMs = performance.now() - poolStartedAt;
    const readyStats = lifecycle.pool.stats();
    if (readyStats.workers !== AUTHORIZATION.workerCount
      || readyStats.readyWorkers !== AUTHORIZATION.workerCount) {
      throw new HarnessError("T1_N3_AB_WORKER_COUNT_NOT_HONOURED");
    }
    measurements.poolAtReady = poolSnapshot(readyStats);
    measurements.threadsAtReady = threadEvidence(lifecycle.pool);
    if (measurements.threadsAtReady.distinctNonMainThreadCount !== AUTHORIZATION.workerCount
      || measurements.threadsAtReady.mainThreadFallback) {
      throw new HarnessError("T1_N3_AB_DISTINCT_THREAD_EVIDENCE_MISSING");
    }
    measurements.readyRssBytes = rss.observe();
    rss.assertWithinSafety();

    // 3. The booted consumer stack, in main.ts order. The SAME pool object
    //    reaches the repository (through the audit hasher) and the service:
    //    a second pool would silently double the arena count and destroy the
    //    entire comparison, so identity is asserted rather than assumed.
    lifecycle.secretRoot = await mkdtemp(join(os.tmpdir(), "t1-n3-ab-standalone-"));
    lifecycle.auditHasher = new modules.AuditContextHasher(
      lifecycle.pool, sourceIpSalt, policy.auditSourceIpKdf
    );
    const repository = new modules.PostgresIdentityRepository(
      lifecycle.database.pool, lifecycle.auditHasher
    );
    const limiter = new modules.InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    );
    const mail = new modules.MemoryMailSender();
    lifecycle.service = new modules.RegistrationService({
      repository,
      mail,
      dekStore: new modules.FileUserDekStore(lifecycle.secretRoot, modules.loadKek(kekMaterial)),
      blindIndexKey,
      policy,
      limiter,
      argon2: lifecycle.pool,
      clock: () => new Date("2026-08-19T12:00:00.000Z"),
      sleep: async () => undefined
    });
    const repositoryPool = repository.auditContext?.executor;
    const servicePool = lifecycle.service.dependencies?.argon2;
    if (repositoryPool !== lifecycle.pool || servicePool !== lifecycle.pool) {
      throw new HarnessError("T1_N3_AB_SHARED_POOL_IDENTITY_VIOLATED");
    }
    measurements.sharedPoolIdentityProven = true;
    measurements.consumersReadyRssBytes = rss.observe();
    rss.assertWithinSafety();

    // 4. Ten real successful registrations. Sequential and single-source-free:
    //    each uses a distinct address and a distinct source so no admission or
    //    per-address limit converts a registration into a refusal.
    const registrationStartedAt = performance.now();
    for (let index = 0; index < REGISTRATION_COUNT; index += 1) {
      await lifecycle.service.register({
        email: `t1-n3-ab-standalone-${index}@example.test`,
        password: "correct horse battery staple",
        recoveryEmail: `t1-n3-ab-standalone-recovery-${index}@example.test`,
        adultAffirmed: true
      }, {
        ip: `2001:db8:3ab:1::${index + 1}`,
        userAgent: "t1-n3-ab-standalone",
        requestId: `request:t1:n3:ab:standalone:${index}`
      });
      rss.observe();
      rss.assertWithinSafety();
    }
    measurements.registrationsMs = performance.now() - registrationStartedAt;

    // Mail and refusal drains, then the durable-row assertion. Counting rows is
    // what proves these were registrations rather than silently swallowed
    // duplicate-postwork or refusal branches.
    await lifecycle.service.drainMailDispatches();
    lifecycle.service.drainMailCapacitySignals();
    // The REAL shape of `mailDispatchOccupancy()`: `queued`, `inFlight`,
    // `activeSends`, `maximum`, `maximumQueued`. There is no `active` field —
    // the previous check read `undefined !== 0` and therefore passed
    // unconditionally, which is worse than not checking at all.
    const dispatchOccupancy = lifecycle.service.mailDispatchOccupancy();
    if (dispatchOccupancy.queued !== 0
      || dispatchOccupancy.inFlight !== 0
      || dispatchOccupancy.activeSends !== 0) {
      throw new HarnessError("T1_N3_AB_MAIL_DISPATCH_NOT_DRAINED");
    }
    if (mail.messages.length !== REGISTRATION_COUNT) {
      throw new HarnessError("T1_N3_AB_VERIFICATION_MAIL_COUNT_UNEXPECTED");
    }
    const pendingRows = await lifecycle.database.pool.query(
      `SELECT count(*)::text AS pending FROM identity."user" WHERE state='pending_verification'`
    );
    const totalRows = await lifecycle.database.pool.query(
      `SELECT count(*)::text AS total FROM identity."user"`
    );
    if (pendingRows.rows[0].pending !== String(REGISTRATION_COUNT)
      || totalRows.rows[0].total !== String(REGISTRATION_COUNT)) {
      throw new HarnessError("T1_N3_AB_DURABLE_PENDING_USER_COUNT_UNEXPECTED");
    }
    measurements.durablePendingUsers = REGISTRATION_COUNT;
    measurements.verificationMailCount = REGISTRATION_COUNT;
    measurements.mailDispatchOccupancyAfterDrain = Object.freeze({ ...dispatchOccupancy });
    rss.observe();
    rss.assertWithinSafety();

    // 5. Explicit warm-up of EVERY selected worker with real maximum-cost work,
    //    before the 0% baseline. The registrations above already ran real KDF
    //    work, but nothing guarantees they touched all three arenas; an
    //    unwarmed third arena would be charged to occupancy instead of to boot.
    // No work may START after the first breach. The assertion is here, before
    // the warm-up jobs are created, rather than only after them.
    rss.assertWithinSafety();
    const warmUpObserved = { maxActive: 0 };
    const warmUpWatcher = setInterval(() => {
      const stats = lifecycle.pool.stats();
      if (stats.active > warmUpObserved.maxActive) warmUpObserved.maxActive = stats.active;
      rss.observe();
    }, SAMPLE_INTERVAL_MS);
    const warmUpStartedAt = performance.now();
    try {
      const warmUpJobs = Array.from({ length: AUTHORIZATION.workerCount }, (_unused, index) =>
        lifecycle.pool.hashPassword(
          new TextEncoder().encode(`t1-n3-ab-warm-${index}`),
          new Uint8Array(16).fill(index + 1),
          policy.password.argon2id
        )
      );
      const warmUpResults = await Promise.all(warmUpJobs);
      if (warmUpResults.length !== AUTHORIZATION.workerCount) {
        throw new HarnessError("T1_N3_AB_WARM_UP_COUNT_UNEXPECTED");
      }
      measurements.warmUpJobCount = warmUpResults.length;
    } finally {
      clearInterval(warmUpWatcher);
    }
    if (performance.now() - warmUpStartedAt > WARM_UP_OBSERVE_TIMEOUT_MS) {
      throw new HarnessError("T1_N3_AB_WARM_UP_TIMEOUT");
    }
    // Every selected worker must have been simultaneously busy at least once,
    // which is the only in-process proof that each arena was actually touched.
    if (warmUpObserved.maxActive !== AUTHORIZATION.workerCount) {
      throw new HarnessError("T1_N3_AB_WARM_UP_DID_NOT_COVER_EVERY_WORKER");
    }
    measurements.warmUpMaxActive = warmUpObserved.maxActive;
    measurements.warmUpMs = performance.now() - warmUpStartedAt;
    await quiesce(lifecycle.pool, rss);
    rss.assertWithinSafety();

    // 6. Exact limiter occupancy sweep. Reset first, then 0/25/50/100%.
    measurements.occupancyReset = resetLimiterOccupancy(limiter);
    const occupancyPoints = [];
    for (const step of OCCUPANCY_STEPS) {
      const applied = step.numerator === 0
        ? Object.freeze({ targetPerRoute: 0, touchedSlotElements: 0, touchedExpiryElements: 0 })
        : applyLimiterOccupancy(limiter, policy, step.numerator, step.denominator, rss);
      await collectGarbage();
      const scan = scanLimiterOccupancy(limiter, policy);
      // The counter and the scan must agree. A sweep that only bumped counters
      // shows up here as a scan of zero against a reported 1,572,864.
      if (scan.reportedOccupiedSlots !== scan.scannedOccupiedSlots) {
        throw new HarnessError("T1_N3_AB_OCCUPANCY_COUNTER_SCAN_MISMATCH");
      }
      if (scan.reportedSlotCapacity !== EXPECTED_TOTAL_SLOT_CAPACITY) {
        throw new HarnessError("T1_N3_AB_LIMITER_SLOT_CAPACITY_UNEXPECTED");
      }
      await collectGarbage();
      const rssBytes = rss.observe();
      occupancyPoints.push(Object.freeze({
        occupancyPercent: step.label,
        targetSlotsPerRoute: applied.targetPerRoute,
        touchedSlotElements: applied.touchedSlotElements,
        touchedExpiryElements: applied.touchedExpiryElements,
        occupiedSlots: scan.scannedOccupiedSlots,
        slotCapacity: scan.reportedSlotCapacity,
        sentinelExpiryEntries: scan.scannedSentinelExpiries,
        allocatedBytes: scan.reportedAllocatedBytes,
        rssBytes
      }));
      rss.assertWithinSafety();
    }
    const fullOccupancy = occupancyPoints[occupancyPoints.length - 1];
    if (fullOccupancy.occupiedSlots !== EXPECTED_TOTAL_SLOT_CAPACITY
      || fullOccupancy.slotCapacity !== EXPECTED_TOTAL_SLOT_CAPACITY) {
      throw new HarnessError("T1_N3_AB_FULL_OCCUPANCY_NOT_PROVEN");
    }
    measurements.occupancy = Object.freeze(occupancyPoints);
    measurements.occupancyAlgorithm =
      "reset counts/heads/saturation to zero in full; then for each route occupy "
      + "the first floor(524288*n/4) slots with count=admissionPerSource, head=0, "
      + "saturatedUntil=4102444800000, and write that same sentinel into all "
      + "admissionPerSource expiry entries addressed by each occupied slot; "
      + "occupancy is then re-derived by scanning the arrays, never from the counter";

    // 7. The eight concurrent maximum-cost credential jobs. Identical count for
    //    both worker counts on purpose: holding the offered load fixed is what
    //    makes two-worker and three-worker RSS comparable at all.
    // Every RSS reading in this file, including this baseline, goes through the
    // observer: a direct `process.memoryUsage.rss()` here would be a reading the
    // 512 MiB ceiling never saw, and the ceiling is only a stop if it sees all
    // of them. No further work is started once it has been breached.
    rss.assertWithinSafety();
    const baselineRssBytes = rss.observe();
    rss.assertWithinSafety();
    const samples = { rss: [], loopLagMs: [], active: [], queuedCredential: [], outstandingTotal: [] };
    const maxima = { active: 0, queuedCredential: 0, outstandingTotal: 0, liveHandles: 0 };
    let lastSampleAt = performance.now();
    const sampler = setInterval(() => {
      const now = performance.now();
      samples.loopLagMs.push(Math.max(0, now - lastSampleAt - SAMPLE_INTERVAL_MS));
      lastSampleAt = now;
      samples.rss.push(rss.observe());
      const stats = lifecycle.pool.stats();
      samples.active.push(stats.active);
      samples.queuedCredential.push(stats.queuedCredential);
      samples.outstandingTotal.push(stats.outstandingTotal);
      if (stats.active > maxima.active) maxima.active = stats.active;
      if (stats.queuedCredential > maxima.queuedCredential) maxima.queuedCredential = stats.queuedCredential;
      if (stats.outstandingTotal > maxima.outstandingTotal) maxima.outstandingTotal = stats.outstandingTotal;
      if (stats.liveHandles > maxima.liveHandles) maxima.liveHandles = stats.liveHandles;
    }, SAMPLE_INTERVAL_MS);

    const jobsStartedAt = performance.now();
    let jobOutcome;
    try {
      // Admission is consulted BEFORE every submission. The previous version
      // submitted all eight and then `allSettled` them, so a breach at job two
      // still admitted six more 64 MiB computations — the opposite of a stop.
      const jobs = [];
      for (let index = 0; index < MAX_COST_JOB_COUNT; index += 1) {
        rss.observe();
        if (!rss.admits()) break;
        jobs.push(lifecycle.pool.hashPassword(
          new TextEncoder().encode(`t1-n3-ab-load-${index}`),
          new Uint8Array(16).fill(0x40 + index),
          policy.password.argon2id
        ));
      }
      measurements.loadAdmission = Object.freeze({
        requested: MAX_COST_JOB_COUNT,
        submitted: jobs.length,
        refusedAfterBreach: MAX_COST_JOB_COUNT - jobs.length
      });
      // `allSettled`, not `all`: already-active bounded work must SETTLE before
      // drain and close, and a rejected sibling must not abandon live 64 MiB
      // computations. Nothing new is admitted here.
      jobOutcome = await Promise.allSettled(jobs);
    } finally {
      clearInterval(sampler);
    }
    measurements.maxCostJobsMs = performance.now() - jobsStartedAt;
    const jobFailures = jobOutcome.filter((result) => result.status === "rejected");
    measurements.maxCostJobs = Object.freeze({
      requested: MAX_COST_JOB_COUNT,
      fulfilled: jobOutcome.length - jobFailures.length,
      rejected: jobFailures.length,
      failureCodes: Object.freeze([...new Set(jobFailures.map((result) => errorCode(result.reason)))])
    });
    measurements.inFlight = Object.freeze({
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      sampleCount: samples.rss.length,
      rssBytes: summarize(samples.rss),
      loopLagMs: summarize(samples.loopLagMs),
      activeWorkers: summarize(samples.active),
      queuedCredential: summarize(samples.queuedCredential),
      outstandingTotal: summarize(samples.outstandingTotal),
      maxActive: maxima.active,
      maxQueuedCredential: maxima.queuedCredential,
      maxOutstandingTotal: maxima.outstandingTotal,
      maxLiveHandles: maxima.liveHandles
    });
    rss.assertWithinSafety();
    if (jobFailures.length !== 0) throw new HarnessError("T1_N3_AB_MAX_COST_JOB_FAILED");
    // Non-vacuity: eight offered jobs against N workers must show all N busy and
    // 8-N queued. Without this the RSS number could have been taken from a pool
    // that never ran more than one job at a time.
    if (maxima.active !== AUTHORIZATION.workerCount
      || maxima.outstandingTotal !== MAX_COST_JOB_COUNT
      || maxima.queuedCredential < MAX_COST_JOB_COUNT - AUTHORIZATION.workerCount) {
      throw new HarnessError("T1_N3_AB_LOAD_NON_VACUITY_UNPROVEN");
    }

    await quiesce(lifecycle.pool, rss);
    measurements.baselineRssBytes = baselineRssBytes;
    measurements.settledRssBytes = rss.observe();
    measurements.threadsAfterLoad = threadEvidence(lifecycle.pool);
    measurements.poolAfterLoad = poolSnapshot(lifecycle.pool.stats());
    rss.assertWithinSafety();

    measurements.eventLoopDelayAtLoadEndMs = Object.freeze({
      p50: eventLoop.percentile(50) / 1e6,
      p99: eventLoop.percentile(99) / 1e6,
      max: eventLoop.max / 1e6
    });
  } catch (error) {
    // Carry the partial evidence out with the failure. A cell that dies mid-run
    // still has to report what its cleanup path actually achieved — especially
    // whether the pool confirmed termination — because "it failed" is not an
    // answer to "is a 64 MiB arena still resident on this host".
    FAILURE_EVIDENCE.measurements = measurements;
    throw error;
  } finally {
    // -----------------------------------------------------------------------
    // Cleanup, in the one truthful order: the service stops producing work, the
    // hasher stops caching, the pool is closed, the database is stopped, the
    // secret directory is removed, and only then are the local key and salt
    // buffers zeroed. Every step is attempted even if an earlier one failed,
    // because a failed drain must not strand a live PostgreSQL or a live worker.
    // -----------------------------------------------------------------------
    stopBackgroundObserver();
    const eventLoopDelayP99Ms = eventLoop.percentile(99) / 1e6;
    const eventLoopDelayMaxMs = eventLoop.max / 1e6;
    eventLoop.disable();
    // Close initiation is stamped here, before the first teardown step, so the
    // close-to-exit duration below is a real interval rather than the whole
    // workload's elapsed time. It is MEASUREMENT ONLY: no prompt-exit
    // acceptance threshold has been ratified, and this harness invents none.
    const closeInitiatedAt = performance.now();
    // The supervising parent stamps the reap on the SAME monotonic clock
    // domain, so their difference is a real close-to-exit interval rather than
    // workload elapsed time. The marker is run-bound and private.
    const closeMarkerPath = process.env.T1_N3_AB_CLOSE_MARKER_PATH;
    if (typeof closeMarkerPath === "string" && closeMarkerPath.length > 0) {
      try {
        writeFileSync(closeMarkerPath,
          `RUN=${AUTHORIZATION.runCommitment} MONOTONIC_NS=${process.hrtime.bigint()}\n`);
      } catch {
        // A missing marker only costs the measurement, never the cleanup.
      }
    }

    const step = async (name, action) => {
      cleanup.order.push(name);
      try {
        await action();
        return Object.freeze({ ok: true, error: null });
      } catch (error) {
        return Object.freeze({ ok: false, error: describeError(error) });
      }
    };

    if (lifecycle.service !== undefined) {
      cleanup.serviceDrain = await step("service-drain", async () => {
        await lifecycle.service.drainMailDispatches();
        lifecycle.service.drainMailCapacitySignals();
      });
    }
    if (lifecycle.auditHasher !== undefined) {
      cleanup.hasherClose = await step("hasher-close", async () => {
        lifecycle.auditHasher.close();
      });
    }
    if (lifecycle.pool !== undefined) {
      cleanup.statsBeforeClose = poolSnapshot(lifecycle.pool.stats());
      const closeStartedAt = performance.now();
      cleanup.poolClose = await step("pool-close", async () => {
        await lifecycle.pool.close();
      });
      cleanup.poolCloseMs = performance.now() - closeStartedAt;
      // Read AFTER close whether or not close threw. A bounded close that could
      // not confirm a worker's death fails typed and leaves the handle counted;
      // reporting the post-close stats verbatim is what keeps this harness from
      // claiming zero handles for a thread that may still hold a 64 MiB arena.
      cleanup.statsAfterClose = poolSnapshot(lifecycle.pool.stats());
      cleanup.poolTerminationConfirmed = cleanup.poolClose.ok
        && cleanup.statsAfterClose.state === "CLOSED"
        && cleanup.statsAfterClose.liveHandles === 0
        && cleanup.statsAfterClose.retiringHandles === 0
        && cleanup.statsAfterClose.outstandingTotal === 0;
    }
    if (lifecycle.database !== undefined) {
      cleanup.databaseStop = await step("database-stop", async () => {
        await lifecycle.database.stop();
      });
    }
    if (lifecycle.secretRoot !== undefined) {
      cleanup.secretRootRemoval = await step("secret-root-removal", async () => {
        await rm(lifecycle.secretRoot, { recursive: true, force: true });
      });
      lifecycle.secretRoot = undefined;
    }
    // Zeroing last: the DEK store and the hasher hold derived copies of this
    // material until their own teardown above, so zeroing earlier would corrupt
    // a still-running close rather than shorten a secret's life.
    try {
      blindIndexKey.fill(0);
      sourceIpSalt.fill(0);
      kekMaterial.fill(0);
      cleanup.buffersZeroed = true;
      cleanup.bufferZeroing = Object.freeze({ ok: true, error: null });
    } catch (error) {
      cleanup.buffersZeroed = false;
      cleanup.bufferZeroing = Object.freeze({ ok: false, error: describeError(error) });
    }
    cleanup.order.push("buffer-zeroing");

    // Cleanup truthfulness is a REPORTED PROPERTY, not a comment. A failed
    // service drain, hasher close, pool close, database stop, secret-root
    // removal or buffer zeroing leaves a live PostgreSQL, a live 64 MiB arena
    // or live key material on the host; a cell that exits 0 and says COMPLETE
    // after that is lying about custody, so the entry point below reads this
    // flag and refuses both.
    cleanup.failedSteps = Object.freeze([
      ["service-drain", cleanup.serviceDrain],
      ["hasher-close", cleanup.hasherClose],
      ["pool-close", cleanup.poolClose],
      ["database-stop", cleanup.databaseStop],
      ["secret-root-removal", cleanup.secretRootRemoval],
      ["buffer-zeroing", cleanup.bufferZeroing]
    ].filter(([, record]) => record !== null && record !== undefined && record.ok !== true)
      .map(([name]) => name));
    cleanup.ok = cleanup.failedSteps.length === 0
      && (lifecycle.pool === undefined || cleanup.poolTerminationConfirmed === true);

    measurements.postCloseRssBytes = rss.observe();
    measurements.peakRssBytes = rss.state.peakBytes;
    measurements.closeInitiationToTeardownCompleteMs = performance.now() - closeInitiatedAt;
    measurements.closeToExitIsMeasurementOnly = true;
    measurements.consoleCapture = captureMetrics();
    measurements.rssSafety = Object.freeze({
      rssSafetyExceeded: rss.state.exceeded,
      limitBytes: RSS_SAFETY_LIMIT_BYTES,
      exceededAtBytes: rss.state.exceededAtBytes,
      peakBytes: rss.state.peakBytes,
      measuredPid: rss.state.measuredPid,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      backgroundSamples: rss.state.backgroundSamples,
      peakSampleBytes: Object.freeze([...rss.state.peakSampleBytes]),
      admittedWorkAtEnd: rss.state.admitWork
    });
    measurements.cleanup = Object.freeze({ ...cleanup, order: Object.freeze([...cleanup.order]) });

    // The complete cell header the adjudicator requires. Host conditions are
    // part of the evidence, not decoration: a paired comparison is only lawful
    // if both arms ran under comparable load, and page-fault/swap deltas are
    // what distinguish a genuine RSS difference from a host under memory
    // pressure.
    const resourceAtEnd = process.resourceUsage();
    measurements.header = Object.freeze({
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model ?? "UNKNOWN",
      cpuCount: os.cpus().length,
      processPid: process.pid,
      postgresPort,
      totalMemoryBytes: os.totalmem(),
      loadAverageAtStart: Object.freeze(loadAtStart),
      loadAverageAtEnd: Object.freeze(os.loadavg()),
      swapDelta: resourceAtEnd.swappedOut - resourceAtStart.swappedOut,
      majorPageFaultDelta: resourceAtEnd.majorPageFault - resourceAtStart.majorPageFault,
      minorPageFaultDelta: resourceAtEnd.minorPageFault - resourceAtStart.minorPageFault,
      voluntaryContextSwitchDelta:
        resourceAtEnd.voluntaryContextSwitches - resourceAtStart.voluntaryContextSwitches,
      involuntaryContextSwitchDelta:
        resourceAtEnd.involuntaryContextSwitches - resourceAtStart.involuntaryContextSwitches,
      // Platform-defined units: bytes on darwin, kibibytes on Linux. Reported
      // raw and named accordingly, because silently calling it bytes would make
      // two hosts' figures look 1024x apart. The authoritative RSS numbers in
      // this report are the `process.memoryUsage.rss()` readings, always bytes.
      maxRssResourceUsageRaw: resourceAtEnd.maxRSS,
      eventLoopDelayP99Ms,
      eventLoopDelayMaxMs
    });
  }

  return measurements;
}

// ---------------------------------------------------------------------------
// Entry point. Exactly one marker line reaches stdout, on every path.
// ---------------------------------------------------------------------------

// Installed before the first product import, database boot or migration, and
// kept active through the final drain and teardown.
installIdentifierSafeCapture();

let report;
let exitCode = 0;
try {
  const measurements = await run();
  const safetyExceeded = measurements.rssSafety?.rssSafetyExceeded === true;
  // Precedence is deliberate. A breached ceiling is status 3 whatever else
  // happened, because the wrapper maps exactly that status to
  // `CODEX BLOCKED (rss-safety)` and stops every later three-worker cell. A
  // cleanup failure without a breach is an ordinary failure: never COMPLETE,
  // never 0.
  const cleanupOk = measurements.cleanup?.ok === true;
  report = {
    artifact: "T1-3worker-ab-booted-rss-harness",
    schemaVersion: 1,
    provenanceClass: "STANDALONE_BOOTED_PROCESS",
    rssBoundStatus: "UNRATIFIED_CANDIDATE",
    cellId: AUTHORIZATION.cellId,
    workerCount: AUTHORIZATION.workerCount,
    packetSha256: EXPECTED_PACKET_SHA256,
    runCommitment: AUTHORIZATION.runCommitment,
    // Inherited from the session supervisor, not chosen by this process: the
    // wrapper proved these with setsid() and handed them down, so a report
    // cannot claim membership of a group it was never placed in.
    supervisedPid: AUTHORIZATION.supervisedPid,
    supervisedPgid: AUTHORIZATION.supervisedPgid,
    supervisedSid: AUTHORIZATION.supervisedSid,
    outcome: safetyExceeded
      ? "RSS_SAFETY_EXCEEDED"
      : cleanupOk ? "COMPLETE" : "CLEANUP_FAILED",
    rssSafetyExceeded: safetyExceeded,
    cleanupOk,
    error: null,
    ...measurements
  };
  exitCode = safetyExceeded ? 3 : cleanupOk ? 0 : 1;
} catch (error) {
  const partial = FAILURE_EVIDENCE.measurements ?? {};
  const safetyExceeded = errorCode(error) === "T1_N3_AB_RSS_SAFETY_EXCEEDED"
    || partial.rssSafety?.rssSafetyExceeded === true;
  report = {
    artifact: "T1-3worker-ab-booted-rss-harness",
    schemaVersion: 1,
    provenanceClass: "STANDALONE_BOOTED_PROCESS",
    rssBoundStatus: "UNRATIFIED_CANDIDATE",
    cellId: AUTHORIZATION.cellId,
    workerCount: AUTHORIZATION.workerCount,
    packetSha256: EXPECTED_PACKET_SHA256,
    runCommitment: AUTHORIZATION.runCommitment,
    // Inherited from the session supervisor, not chosen by this process: the
    // wrapper proved these with setsid() and handed them down, so a report
    // cannot claim membership of a group it was never placed in.
    supervisedPid: AUTHORIZATION.supervisedPid,
    supervisedPgid: AUTHORIZATION.supervisedPgid,
    supervisedSid: AUTHORIZATION.supervisedSid,
    outcome: safetyExceeded ? "RSS_SAFETY_EXCEEDED" : "FAILED",
    rssSafetyExceeded: safetyExceeded,
    cleanupOk: partial.cleanup?.ok === true,
    error: describeError(error),
    ...partial
  };
  exitCode = safetyExceeded ? 3 : 1;
}

restoreConsole();
// A structured, secret-free safety line the wrapper can recognize without
// parsing the report. Status 3 remains the authoritative signal for this
// standalone process; the line is what lets a Vitest-hosted cell, whose child
// exit code the runner cannot forward, be mapped to rss-safety too.
if (report.rssSafetyExceeded === true) {
  process.stdout.write(`[T1_N3_AB_RSS_SAFETY_EXCEEDED]${JSON.stringify({
    cellId: AUTHORIZATION.cellId,
    workerCount: AUTHORIZATION.workerCount,
    runCommitment: AUTHORIZATION.runCommitment,
    limitBytes: RSS_SAFETY_LIMIT_BYTES,
    measuredPid: process.pid
  })}\n`);
}
process.stdout.write(`${REPORT_MARKER}${JSON.stringify(report)}\n`);
process.exitCode = exitCode;
