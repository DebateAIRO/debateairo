import { describe, expect, it } from "vitest";

import {
  BoundedReferenceQueue,
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  installCaptureEmitter,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";
import {
  runJobWithLifecycle,
  type LivenessSweepReport,
  type ReplaySelfTestReport,
  type SettlementWatchReport,
} from "../../apps/scheduler/src/index.js";

const NOT_APPLICABLE = "NOT_APPLICABLE";
const LIFECYCLE_CONTEXT = Object.freeze({
  run_ref: Object.freeze({ kind: "run", not_applicable: true }),
  work_item_ref: Object.freeze({ kind: "work_item", not_applicable: true }),
  node_ref: Object.freeze({ kind: "node", not_applicable: true }),
  attempt_ref: Object.freeze({ kind: "attempt", not_applicable: true }),
  ledger_ref: Object.freeze({ kind: "ledger_entry", not_applicable: true }),
});
const REDACTOR_CONFIG = Object.freeze({
  environment: "test",
  build_ref: "UNTRACKED-DEV:fix01-c5:test",
  build_dirty: true,
  runtime: "scheduler" as const,
  component: Object.freeze({
    process: "scheduler",
    package: "@debateai/scheduler",
  }),
  writer_identity: "scheduler-test",
  redaction_policy_version: "g0",
  allowlist_set_id: "g0-lifecycle",
  now: () => new Date("2026-09-04T00:00:00.000Z"),
  sourceEventRef: () => "00000000-0000-4000-8000-000000000001",
});

function captureLifecycleEntries(): BoundedReferenceQueue<CaptureQueueEntry> {
  const queue = new BoundedReferenceQueue<CaptureQueueEntry>(8);
  const health = createCaptureHealth();
  const gaps = createCaptureGapCounter({ health });
  installCaptureEmitter(createCaptureEmitter({ queue, health, gaps }));
  return queue;
}

function payloads(queue: BoundedReferenceQueue<CaptureQueueEntry>): readonly unknown[] {
  return queue.drain().map((entry) => entry.payload_ref);
}

describe("FIX-01 C5 scheduler lifecycle wrapper", () => {
  it.each([
    [
      "replay-self-test",
      Object.freeze({ checked: 3, evicted: Object.freeze([]) }) as ReplaySelfTestReport,
    ],
    [
      "liveness-sweep",
      Object.freeze({ checked: 3, archived: Object.freeze([]) }) as LivenessSweepReport,
    ],
    [
      "settlement-watch",
      Object.freeze({
        checked: 3,
        settled: 0,
        superseded: 0,
        incomplete: 3,
        results: Object.freeze([]),
      }) as SettlementWatchReport,
    ],
  ] as const)("emits STARTED then an authoritative NOOP for %s", async (job, report) => {
    const queue = captureLifecycleEntries();

    await expect(runJobWithLifecycle(job, async () => report)).resolves.toBe(report);

    const entries = queue.drain();
    expect(entries.map((entry) => entry.payload_ref)).toEqual([
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job },
      },
      {
        code: "OBS_SCHEDULER_JOB_NOOP",
        template_parameters: { job, count: 3 },
      },
    ]);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.ambient_context_ref).toEqual(LIFECYCLE_CONTEXT);
      expect(entry.ambient_context_ref).not.toHaveProperty("at_seq_watermark");
    }
  });

  it.each([
    [
      "replay-self-test",
      Object.freeze({ checked: 3, evicted: Object.freeze(["served:1"]) }),
    ],
    [
      "liveness-sweep",
      Object.freeze({ checked: 3, archived: Object.freeze(["run:1"]) }),
    ],
    [
      "settlement-watch",
      Object.freeze({
        checked: 3,
        settled: 1,
        superseded: 0,
        incomplete: 0,
        results: Object.freeze([]),
      }),
    ],
  ] as const)("emits STARTED then SUCCEEDED for positive %s output", async (job, report) => {
    const queue = captureLifecycleEntries();

    await expect(runJobWithLifecycle(job, async () => report)).resolves.toBe(report);

    expect(payloads(queue)).toEqual([
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job },
      },
      {
        code: "OBS_SCHEDULER_JOB_SUCCEEDED",
        template_parameters: { job },
      },
    ]);
  });

  it("emits exactly STARTED then FAILED and rethrows the same error object", async () => {
    const queue = captureLifecycleEntries();
    const planted = Object.freeze({ secret: "PLANTED-C5-ERROR", code: "JOB_BROKE" });

    let caught: unknown;
    try {
      await runJobWithLifecycle("replay-self-test", async () => {
        throw planted;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(planted);
    expect(payloads(queue)).toEqual([
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job: "replay-self-test" },
      },
      {
        code: "OBS_SCHEDULER_JOB_FAILED",
        template_parameters: { job: "replay-self-test" },
        error: planted,
      },
    ]);
  });

  it("projects all five lifecycle correlation declarations as positive absence", async () => {
    const queue = captureLifecycleEntries();
    await runJobWithLifecycle("replay-self-test", async () => ({
      checked: 0,
      evicted: Object.freeze([]),
    }));

    for (const entry of queue.drain()) {
      expect(entry.ambient_context_ref).toEqual(LIFECYCLE_CONTEXT);
      const context = entry.ambient_context_ref as typeof LIFECYCLE_CONTEXT;
      expect(Object.values(context).every((declaration) =>
        declaration.not_applicable === true)).toBe(true);
      expect(Object.keys(context)).toHaveLength(5);
      expect(NOT_APPLICABLE).toBe("NOT_APPLICABLE");
    }
  });
});

describe("FIX-01 C5 lifecycle redaction", () => {
  function redact(payloadRef: unknown) {
    return createSharedRedactor(REDACTOR_CONFIG).redact(Object.freeze({
      kind: "envelope" as const,
      payload_ref: payloadRef,
      ambient_context_ref: LIFECYCLE_CONTEXT,
    }));
  }

  it.each([
    [
      "OBS_SCHEDULER_JOB_STARTED",
      { job: "replay-self-test" },
      "JOB_LIFECYCLE",
      "INFO",
      "DETECTED",
    ],
    [
      "OBS_SCHEDULER_JOB_SUCCEEDED",
      { job: "liveness-sweep" },
      "JOB_LIFECYCLE",
      "INFO",
      "DETECTED",
    ],
    [
      "OBS_SCHEDULER_JOB_NOOP",
      { job: "settlement-watch", count: Number.MAX_SAFE_INTEGER },
      "JOB_LIFECYCLE",
      "INFO",
      "DETECTED",
    ],
    [
      "OBS_SCHEDULER_JOB_FAILED",
      { job: "replay-self-test" },
      "JOB_FAILURE",
      "SEVERE",
      "THROWN",
    ],
  ] as const)("stamps the exact binding and parameters for %s", (
    code,
    templateParameters,
    taxonomyClass,
    severity,
    disposition,
  ) => {
    const error = Object.freeze({ secret: "PLANTED-C5-ERROR" });
    const redacted = redact({
      code,
      template_parameters: templateParameters,
      ...(code === "OBS_SCHEDULER_JOB_FAILED" ? { error } : {}),
    });

    expect(redacted).toMatchObject({
      code,
      safe_template_id: `tpl.${code}`,
      template_parameters: templateParameters,
      taxonomy_class: taxonomyClass,
      severity,
      capture_point: "job",
      disposition,
      source: "first_party",
      fallback_minimized: false,
      run_ref: NOT_APPLICABLE,
      work_item_ref: NOT_APPLICABLE,
      node_ref: NOT_APPLICABLE,
      attempt_ref: NOT_APPLICABLE,
      ledger_ref: NOT_APPLICABLE,
    });
    expect(JSON.stringify(redacted)).not.toContain("PLANTED-C5-ERROR");
  });

  it.each([
    ["missing parameters", { code: "OBS_SCHEDULER_JOB_STARTED" }],
    [
      "missing job",
      { code: "OBS_SCHEDULER_JOB_STARTED", template_parameters: {} },
    ],
    [
      "extra parameter",
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job: "replay-self-test", secret: "PLANTED-C5-SECRET" },
      },
    ],
    [
      "wrong job type",
      { code: "OBS_SCHEDULER_JOB_STARTED", template_parameters: { job: 1 } },
    ],
    [
      "unknown job",
      { code: "OBS_SCHEDULER_JOB_STARTED", template_parameters: { job: "reaper" } },
    ],
    [
      "missing count",
      {
        code: "OBS_SCHEDULER_JOB_NOOP",
        template_parameters: { job: "replay-self-test" },
      },
    ],
    [
      "count out of range",
      {
        code: "OBS_SCHEDULER_JOB_NOOP",
        template_parameters: { job: "replay-self-test", count: Number.MAX_SAFE_INTEGER + 1 },
      },
    ],
    [
      "binding mismatch",
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job: "replay-self-test" },
        taxonomy_class: "JOB_FAILURE",
      },
    ],
    [
      "error on non-failure",
      {
        code: "OBS_SCHEDULER_JOB_STARTED",
        template_parameters: { job: "replay-self-test" },
        error: { secret: "PLANTED-C5-SECRET" },
      },
    ],
    [
      "failure without error",
      {
        code: "OBS_SCHEDULER_JOB_FAILED",
        template_parameters: { job: "replay-self-test" },
      },
    ],
  ] as const)("minimizes the whole lifecycle event on %s", (_label, payload) => {
    const redacted = redact(payload);

    expect(redacted).toMatchObject({
      code: "OBS_CAPTURE_SELF",
      safe_template_id: "tpl.OBS_CAPTURE_SELF",
      template_parameters: {},
      taxonomy_class: "CAPTURE_SELF",
      severity: "DEGRADED",
      capture_point: "self",
      disposition: "SELF",
      source: "first_party",
      fallback_minimized: true,
    });
    expect(JSON.stringify(redacted)).not.toContain("PLANTED-C5-SECRET");
  });

  it("keeps job, count, and error out of the fingerprint", () => {
    const first = redact({
      code: "OBS_SCHEDULER_JOB_FAILED",
      template_parameters: { job: "replay-self-test" },
      error: { message: "first" },
    });
    const second = redact({
      code: "OBS_SCHEDULER_JOB_FAILED",
      template_parameters: { job: "liveness-sweep" },
      error: { message: "second" },
    });
    const started = redact({
      code: "OBS_SCHEDULER_JOB_STARTED",
      template_parameters: { job: "replay-self-test" },
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(started.fingerprint);
  });
});
