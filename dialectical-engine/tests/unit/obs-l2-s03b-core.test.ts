import { execFileSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  BoundedReferenceQueue,
  CAPTURE_GAP_AUTHORITY_CONTRACT,
  CAPTURE_HEALTH_CODES,
  captureHandled,
  createCaptureEmitter,
  createCaptureFlusher,
  createCaptureGapCounter,
  createCaptureHealth,
  createPreopenedSpool,
  createSharedRedactor,
  emit,
  getObsContext,
  isPostRedactionEnvelope,
  runWithObsContext,
  type CaptureGapCounter,
  type CaptureGapRow,
  type CaptureQueueEntry,
  type PostRedactionEnvelope,
} from "@debateai/obs-capture";

const ROOT = process.cwd();
const REDACTOR_CONFIG = Object.freeze({
  environment: "test",
  build_ref: "UNTRACKED-DEV:29f370e:test",
  build_dirty: true,
  runtime: "runner" as const,
  component: Object.freeze({ process: "runner", package: "@debateai/runner" }),
  writer_identity: "runner-test",
  redaction_policy_version: "g0",
  allowlist_set_id: "g0-empty-parameters",
  now: () => new Date("2026-08-26T00:00:00.000Z"),
  sourceEventRef: () => "00000000-0000-4000-8000-000000000001",
});

function entry(
  payloadRef: unknown,
  ambientContextRef: CaptureQueueEntry["ambient_context_ref"] = undefined,
): CaptureQueueEntry {
  return Object.freeze({
    kind: "envelope",
    payload_ref: payloadRef,
    ambient_context_ref: ambientContextRef,
  });
}

describe("S03b deployment surface", () => {
  it("loads both root aliases through real workspace linkage", () => {
    const probe = `
      const root = await import("@debateai/obs-capture");
      const core = await import("@debateai/obs-capture/core");
      if (typeof root.emit !== "function" || typeof core.emit !== "function") {
        throw new Error("EMIT_EXPORT_MISSING");
      }
      if (root.emit !== core.emit || root.runWithObsContext !== core.runWithObsContext) {
        throw new Error("ROOT_CORE_ALIAS_DIVERGED");
      }
      process.stdout.write("ROOT_CORE_LOAD_OK");
    `;

    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", probe],
      { cwd: ROOT, encoding: "utf8" },
    );

    expect(output).toBe("ROOT_CORE_LOAD_OK");
  });

  it("keeps the root barrel source-thin and excludes registry and zone", () => {
    const barrelPath = resolve(ROOT, "packages/obs-capture/src/index.ts");
    const sourceText = readFileSync(barrelPath, "utf8");
    const exportTargets = [
      ...sourceText.matchAll(
        /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["'];?\s*$/gmu,
      ),
    ].flatMap((match) => match[1] === undefined ? [] : [match[1]]);

    expect(exportTargets).toEqual([
      "./context.js",
      "./emit.js",
      "./flusher.js",
      "./health.js",
      "./queue.js",
      "./redactor.js",
      "./spool.js",
    ]);
    expect(exportTargets.some((target) => /(?:^|\/)registry(?:\/|$)/u.test(target))).toBe(
      false,
    );
    expect(exportTargets.some((target) => /(?:^|\/)zone(?:\/|$)/u.test(target))).toBe(
      false,
    );
    expect(sourceText).not.toMatch(
      /\bfrom\s+["'][^"']*(?:^|\/)(?:registry|zone)(?:\/|\.|["'])/mu,
    );

    for (const callingPathFile of ["emit.ts", "context.ts", "queue.ts"]) {
      const callingPathSource = readFileSync(
        resolve(ROOT, "packages/obs-capture/src", callingPathFile),
        "utf8",
      );
      expect(callingPathSource).not.toMatch(/(?:node:fs|JSON\.stringify|\.stack\b|Buffer\.)/u);
    }
  });
});

describe("S03b calling-thread contract", () => {
  it("stores only payload and context references without inspecting or serializing them", () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(2);
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const scheduled: Array<() => void> = [];
    const emitter = createCaptureEmitter({
      queue,
      health,
      gaps,
      schedule: (task) => scheduled.push(task),
    });
    let stackReads = 0;
    const payload = new Proxy(
      Object.defineProperty({}, "stack", {
        get() {
          stackReads += 1;
          throw new Error("STACK_WALKED_ON_CALLER");
        },
      }),
      {
        get() {
          throw new Error("PAYLOAD_READ_ON_CALLER");
        },
        ownKeys() {
          throw new Error("PAYLOAD_ENUMERATED_ON_CALLER");
        },
      },
    );
    const context = Object.freeze({
      run_ref: { kind: "run", value: "opaque-run-ref" },
      zone_context: true,
    });
    const stringify = vi.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("SERIALIZED_ON_CALLER");
    });
    const byteCopy = vi.spyOn(Buffer, "from").mockImplementation(() => {
      throw new Error("BYTES_COPIED_ON_CALLER");
    });

    try {
      runWithObsContext(context, () => emitter.emit(payload));
    } finally {
      stringify.mockRestore();
      byteCopy.mockRestore();
    }

    const [queued] = queue.drain();
    expect(queued?.payload_ref).toBe(payload);
    expect(queued?.ambient_context_ref).toBe(context);
    expect(stackReads).toBe(0);
    expect(scheduled).toEqual([]);
  });

  it("is total and defers queue-full health and gap accounting until after return", () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const scheduled: Array<() => void> = [];
    const emitter = createCaptureEmitter({
      queue,
      health,
      gaps,
      schedule: (task) => scheduled.push(task),
    });

    expect(() => emitter.emit(Object.freeze({ code: "CALL_BUDGET_EXHAUSTED" }))).not.toThrow();
    expect(() => emitter.emit(new Proxy({}, { get: () => { throw new Error("boom"); } }))).not.toThrow();
    expect(health.snapshot().counts.QUEUE_FULL).toBe(0);
    expect(gaps.pendingLossCount()).toBe(0);
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    expect(health.snapshot().counts.QUEUE_FULL).toBe(1);
    expect(gaps.pendingLossCount()).toBe(1);

    expect(() => emit(new Proxy({}, { ownKeys: () => { throw new Error("boom"); } }))).not.toThrow();
    expect(() => captureHandled(Symbol("handled"), Object.freeze({ boundary: "owned" }))).not.toThrow();
  });

  it("carries AsyncLocalStorage context by pointer across async work", async () => {
    const context = Object.freeze({
      work_item_ref: { kind: "work_item", value: "opaque-work-item-ref" },
      at_seq_watermark: 17n,
    });

    await runWithObsContext(context, async () => {
      await Promise.resolve();
      expect(getObsContext()).toBe(context);
    });
    expect(getObsContext()).toBeUndefined();
  });
});

describe("S03b single redaction boundary", () => {
  it("degrades unknown fields and secret-bearing errors to the fixed minimal form", () => {
    const secret = "Bearer test-only-secret-value";
    const cause = new Error(`provider response ${secret}`);
    const error = new Error(`request failed ${secret}`, { cause });
    Object.defineProperty(error, "stack", {
      value: `Error: ${secret}\n at /Users/private/app.ts:1:1`,
      enumerable: false,
    });
    const redactor = createSharedRedactor(REDACTOR_CONFIG);
    const raw = {
      code: "CALL_BUDGET_EXHAUSTED",
      error,
      authorization: secret,
      request_url: `https://example.invalid/?token=${secret}`,
    };

    const redacted = redactor.redact(entry(raw));
    const durableBytes = JSON.stringify(redacted);

    expect(isPostRedactionEnvelope(redacted)).toBe(true);
    expect(redacted.code).toBe("OBS_CAPTURE_SELF");
    expect(redacted.safe_template_id).toBe("tpl.OBS_CAPTURE_SELF");
    expect(redacted.template_parameters).toEqual({});
    expect(redacted.frames).toEqual([]);
    expect(redacted.fallback_minimized).toBe(true);
    expect(durableBytes).not.toContain(secret);
    expect(durableBytes).not.toContain("/Users/private");
    expect(durableBytes).not.toContain("authorization");
    expect(durableBytes).not.toContain("request_url");
  });

  it("does not treat shape matching as identifier provenance", () => {
    const redactor = createSharedRedactor(REDACTOR_CONFIG);
    const context = Object.freeze({
      run_ref: "550e8400-e29b-41d4-a716-446655440000",
      node_ref: "run_550e8400-e29b-41d4-a716-446655440000",
      zone_context: true,
    });

    const redacted = redactor.redact(
      entry(
        Object.freeze({
          code: "CALL_BUDGET_EXHAUSTED",
          taxonomy_class: "PROVIDER_EXHAUSTED",
          capture_point: "provider",
          disposition: "THROWN",
          source: "first_party",
        }),
        context,
      ),
    );

    expect(redacted.run_ref).toBe("UNKNOWN:DECLARED_KIND_REQUIRED");
    expect(redacted.node_ref).toBe("UNKNOWN:DECLARED_KIND_REQUIRED");
    expect(redacted.zone_context).toBe(true);
    expect(redacted.fallback_minimized).toBe(false);
  });

  it("drops message, stack, cause, URL, and provider bytes even on an otherwise valid input", () => {
    const canary = "test-only-private-provider-token";
    const cause = new Error(`cause ${canary}`);
    const error = new Error(`message ${canary}`, { cause });
    Object.defineProperty(error, "stack", {
      value: `Error: ${canary}\n at /private/${canary}.ts:1:1`,
      enumerable: false,
    });
    Object.assign(error, {
      provider_output: canary,
      request_url: `https://example.invalid/?secret=${canary}`,
    });
    const redacted = createSharedRedactor(REDACTOR_CONFIG).redact(
      entry({
        code: "CALL_BUDGET_EXHAUSTED",
        error,
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        disposition: "THROWN",
        source: "first_party",
      }),
    );
    const bytes = JSON.stringify(redacted);

    expect(redacted.fallback_minimized).toBe(false);
    expect(bytes).not.toContain(canary);
    expect(bytes).not.toContain("provider_output");
    expect(bytes).not.toContain("request_url");
    expect(bytes).not.toContain("/private/");
  });

  it("redacts once, then sends only the same branded envelope to DB and spool", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(2);
    queue.offer(
      entry({
        code: "CALL_BUDGET_EXHAUSTED",
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        disposition: "THROWN",
        source: "first_party",
      }),
    );
    const shared = createSharedRedactor(REDACTOR_CONFIG);
    let redactionCalls = 0;
    let databaseEnvelope: PostRedactionEnvelope | undefined;
    let spoolEnvelope: PostRedactionEnvelope | undefined;
    const order: string[] = [];
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const flusher = createCaptureFlusher({
      queue,
      redactor: {
        redact(value) {
          redactionCalls += 1;
          order.push("redact");
          return shared.redact(value);
        },
      },
      databaseSink: {
        async writeOccurrences(envelopes) {
          order.push("postgres");
          [databaseEnvelope] = envelopes;
          throw new Error("database unavailable");
        },
        async writeCaptureGap(_row) {},
      },
      spool: {
        append(envelope) {
          order.push("spool");
          spoolEnvelope = envelope;
        },
      },
      health,
      gaps,
    });

    const result = await flusher.flushOnce();

    expect(redactionCalls).toBe(1);
    expect(order).toEqual(["redact", "postgres", "spool"]);
    expect(databaseEnvelope).toBeDefined();
    expect(spoolEnvelope).toBe(databaseEnvelope);
    expect(isPostRedactionEnvelope(spoolEnvelope)).toBe(true);
    expect(result).toEqual({ dequeued: 1, persisted: 0, spooled: 1, lost: 0 });
  });

  it("bypasses the DB sink for DATABASE-class capture and spools post-redaction", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    queue.offer(entry({ code: "DATABASE_POOL_FAILED" }));
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    let databaseCalls = 0;
    const spooled: PostRedactionEnvelope[] = [];
    const flusher = createCaptureFlusher({
      queue,
      redactor: createSharedRedactor(REDACTOR_CONFIG),
      databaseSink: {
        async writeOccurrences(_envelopes) {
          databaseCalls += 1;
        },
        async writeCaptureGap(_row) {},
      },
      spool: {
        append(envelope) {
          spooled.push(envelope);
        },
      },
      health,
      gaps,
    });

    expect(await flusher.flushOnce()).toEqual({
      dequeued: 1,
      persisted: 0,
      spooled: 1,
      lost: 0,
    });
    expect(databaseCalls).toBe(0);
    expect(spooled).toHaveLength(1);
    expect(isPostRedactionEnvelope(spooled[0])).toBe(true);
  });

  it("flushes one pending gap after a DATABASE-class spool sink returns", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    queue.offer(entry({ code: "DATABASE_POOL_FAILED" }));
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    gaps.recordLoss("first_party", "QUEUE_FULL", 3);
    const gapRows: CaptureGapRow[] = [];
    const flusher = createCaptureFlusher({
      queue,
      redactor: createSharedRedactor(REDACTOR_CONFIG),
      databaseSink: {
        async writeOccurrences(_envelopes) {
          throw new Error("DATABASE_CLASS_REACHED_POSTGRES");
        },
        async writeCaptureGap(row) {
          gapRows.push(row);
        },
      },
      spool: {
        append(_envelope) {},
      },
      health,
      gaps,
    });

    expect(await flusher.flushOnce()).toEqual({
      dequeued: 1,
      persisted: 0,
      spooled: 1,
      lost: 0,
    });
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0]).toMatchObject({
      source: "first_party",
      gap_class: "QUEUE_FULL",
      lost_count: 3,
    });
    expect(gaps.pendingLossCount()).toBe(0);
  });

  it("flushes one pending gap after a Postgres-fallback spool sink returns", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    queue.offer(entry({ code: "CALL_BUDGET_EXHAUSTED" }));
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    gaps.recordLoss("unclassified", "EMIT_FAILURE", 9);
    const gapRows: CaptureGapRow[] = [];
    const flusher = createCaptureFlusher({
      queue,
      redactor: createSharedRedactor(REDACTOR_CONFIG),
      databaseSink: {
        async writeOccurrences(_envelopes) {
          throw new Error("postgres unavailable");
        },
        async writeCaptureGap(row) {
          gapRows.push(row);
        },
      },
      spool: {
        append(_envelope) {},
      },
      health,
      gaps,
    });

    expect(await flusher.flushOnce()).toEqual({
      dequeued: 1,
      persisted: 0,
      spooled: 1,
      lost: 0,
    });
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0]).toMatchObject({
      source: "unclassified",
      gap_class: "EMIT_FAILURE",
      lost_count: 9,
    });
    expect(gaps.pendingLossCount()).toBe(0);
  });

  it("flushes one aggregated gap row after the Postgres sink returns", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    queue.offer(entry({ code: "CALL_BUDGET_EXHAUSTED" }));
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    gaps.recordLoss("first_party", "QUEUE_FULL", 7);
    const gapRows: CaptureGapRow[] = [];
    const flusher = createCaptureFlusher({
      queue,
      redactor: createSharedRedactor(REDACTOR_CONFIG),
      databaseSink: {
        async writeOccurrences(_envelopes) {},
        async writeCaptureGap(row) {
          gapRows.push(row);
        },
      },
      spool: {
        append(_envelope) {},
      },
      health,
      gaps,
    });

    expect(await flusher.flushOnce()).toMatchObject({ persisted: 1, lost: 0 });
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0]).toMatchObject({ lost_count: 7, gap_class: "QUEUE_FULL" });
  });

  it("does not spool a persisted batch when later gap accounting faults", async () => {
    const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
    queue.offer(entry({ code: "CALL_BUDGET_EXHAUSTED" }));
    const health = createCaptureHealth();
    const gaps: CaptureGapCounter = {
      recordLoss() {},
      pendingLossCount() {
        return 1;
      },
      async flushOne() {
        throw new Error("gap counter fault");
      },
    };
    let spoolCalls = 0;
    const flusher = createCaptureFlusher({
      queue,
      redactor: createSharedRedactor(REDACTOR_CONFIG),
      databaseSink: {
        async writeOccurrences(_envelopes) {},
        async writeCaptureGap(_row) {},
      },
      spool: {
        append(_envelope) {
          spoolCalls += 1;
        },
      },
      health,
      gaps,
    });

    expect(await flusher.flushOnce()).toEqual({
      dequeued: 1,
      persisted: 1,
      spooled: 0,
      lost: 0,
    });
    expect(spoolCalls).toBe(0);
  });
});

describe("S03b pre-opened spool, health, and gap accounting", () => {
  it("writes only branded post-redaction bytes through a caller-pre-opened fd", () => {
    const directory = mkdtempSync(join(tmpdir(), "obs-s03b-spool-"));
    const spoolPath = join(directory, "capture.jsonl");
    const fd = openSync(spoolPath, "a+");
    const redacted = createSharedRedactor(REDACTOR_CONFIG).redact(
      entry({ code: "CALL_BUDGET_EXHAUSTED" }),
    );

    try {
      const spool = createPreopenedSpool({ fd, envelopeMaxBytes: 16_384 });
      expect(() => spool.append({ code: "RAW" } as never)).toThrow(
        "SPOOL_REQUIRES_POST_REDACTION_ENVELOPE",
      );
      const preparedForExit = spool.prepare(redacted);
      spool.append(redacted);
      const stringify = vi.spyOn(JSON, "stringify").mockImplementation(() => {
        throw new Error("EXIT_PATH_SERIALIZED");
      });
      try {
        spool.appendOnExit(preparedForExit);
      } finally {
        stringify.mockRestore();
      }
    } finally {
      closeSync(fd);
    }

    const lines = readFileSync(spoolPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.includes("CALL_BUDGET_EXHAUSTED"))).toBe(true);
    const spoolSource = readFileSync(
      resolve(ROOT, "packages/obs-capture/src/spool.ts"),
      "utf8",
    );
    expect(spoolSource).not.toMatch(/\bopenSync\b/u);
    expect(spoolSource).not.toMatch(/\bopen\s*\(/u);
  });

  it("refuses and counts a later record lost after a short write poisons the fd", async () => {
    const directory = mkdtempSync(join(tmpdir(), "obs-s03b-poison-"));
    const spoolPath = join(directory, "capture.jsonl");
    const fd = openSync(spoolPath, "a+");
    let writeCalls = 0;

    try {
      const spool = createPreopenedSpool({
        fd,
        envelopeMaxBytes: 16_384,
        write(writeFd, buffer, offset, length) {
          writeCalls += 1;
          if (writeCalls === 1) {
            return writeSync(writeFd, buffer, offset, Math.min(16, length));
          }
          if (writeCalls === 2) {
            throw new Error("interrupted spool write");
          }
          return writeSync(writeFd, buffer, offset, length);
        },
      });
      const first = createSharedRedactor(REDACTOR_CONFIG).redact(
        entry({ code: "CALL_BUDGET_EXHAUSTED" }),
      );
      expect(() => spool.append(first)).toThrow("interrupted spool write");
      const truncatedBytes = readFileSync(spoolPath);

      const queue = new BoundedReferenceQueue<CaptureQueueEntry>(1);
      queue.offer(entry({ code: "DATABASE_POOL_FAILED" }));
      const health = createCaptureHealth();
      const gaps = createCaptureGapCounter({ health });
      const flusher = createCaptureFlusher({
        queue,
        redactor: createSharedRedactor(REDACTOR_CONFIG),
        databaseSink: {
          async writeOccurrences(_envelopes) {},
          async writeCaptureGap(_row) {},
        },
        spool,
        health,
        gaps,
      });

      expect(await flusher.flushOnce()).toEqual({
        dequeued: 1,
        persisted: 0,
        spooled: 0,
        lost: 1,
      });
      expect(readFileSync(spoolPath)).toEqual(truncatedBytes);
      expect(readFileSync(spoolPath, "utf8")).not.toContain("DATABASE_POOL_FAILED");
      expect(health.snapshot().counts.SPOOL_FAILURE).toBe(1);
      expect(gaps.pendingLossCount()).toBe(1);
    } finally {
      closeSync(fd);
    }
  });

  it("keeps fixed-code health counters circuit-broken", () => {
    let health: ReturnType<typeof createCaptureHealth>;
    health = createCaptureHealth(() => {
      health.record(CAPTURE_HEALTH_CODES.SPOOL_FAILURE);
      throw new Error("health observer failed");
    });

    expect(() => health.record(CAPTURE_HEALTH_CODES.POSTGRES_FAILURE)).not.toThrow();
    const snapshot = health.snapshot();
    expect(snapshot.counts.POSTGRES_FAILURE).toBe(1);
    expect(snapshot.counts.SPOOL_FAILURE).toBe(0);
    expect(snapshot.suppressed_recursive).toBe(1);
  });

  it("flushes one bounded capture-gap row when a sink returns", async () => {
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    gaps.recordLoss("first_party", "QUEUE_FULL", 2);
    gaps.recordLoss("first_party", "QUEUE_FULL", 3);
    const rows: CaptureGapRow[] = [];

    expect(await gaps.flushOne(async (row) => {
      rows.push(row);
    })).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "first_party",
      gap_class: "QUEUE_FULL",
      lost_count: 5,
    });
    expect(gaps.pendingLossCount()).toBe(0);
    expect(CAPTURE_GAP_AUTHORITY_CONTRACT).toEqual({
      storage: "PROCESS_LOCAL_ONLY",
      counter_loss: "AUTHORITY_PROOF_MUST_NOT_REFRESH",
    });
  });

  it("requeues a gap if the returning sink cannot persist it", async () => {
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    gaps.recordLoss("unclassified", "REDACTOR_FAILURE", 4);

    expect(
      await gaps.flushOne(async () => {
        throw new Error("gap sink unavailable");
      }),
    ).toBe(false);
    expect(gaps.pendingLossCount()).toBe(4);
    expect(health.snapshot().counts.GAP_WRITE_FAILURE).toBe(1);
  });

  it("requeues a gap if closing its bounded row cannot be timestamped", async () => {
    const health = createCaptureHealth();
    let clockCalls = 0;
    const gaps = createCaptureGapCounter({
      health,
      now() {
        clockCalls += 1;
        if (clockCalls === 1) {
          return new Date("2026-08-26T00:00:00.000Z");
        }
        throw new Error("clock unavailable");
      },
    });
    gaps.recordLoss("unclassified", "EMIT_FAILURE", 2);

    await expect(gaps.flushOne(async () => {})).resolves.toBe(false);
    expect(gaps.pendingLossCount()).toBe(2);
    expect(health.snapshot().counts.GAP_WRITE_FAILURE).toBe(1);
  });
});
