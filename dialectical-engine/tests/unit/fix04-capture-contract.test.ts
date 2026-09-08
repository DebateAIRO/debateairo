import { describe, expect, it } from "vitest";

import {
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";

const EVENT_REF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function redactor() {
  return createSharedRedactor({
    environment: "test",
    build_ref: "test-build",
    build_dirty: false,
    runtime: "api",
    component: Object.freeze({ process: "api", package: "@debateai/api" }),
    writer_identity: "api",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    now: () => new Date("2026-09-08T00:00:00.000Z"),
    sourceEventRef: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
}

describe("FIX-04 capture acknowledgement", () => {
  it("reserves the returned source event reference before queue offer and redacts that exact value", () => {
    const entries: CaptureQueueEntry[] = [];
    let offeredRef: string | undefined;
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const emitter = createCaptureEmitter({
      queue: {
        offer(entry) {
          offeredRef = entry.source_event_ref;
          entries.push(entry);
          return true;
        },
      },
      health,
      gaps,
      sourceEventRef: () => EVENT_REF,
    });

    const acknowledged = emitter.captureHandled(
      Object.freeze({ code: "DATABASE_POOL_FAILED" }),
      Object.freeze({
        capture_point: "http",
        route_template: "/v1/answers/:id",
      }),
    );

    expect(acknowledged).toBe(EVENT_REF);
    expect(offeredRef).toBe(EVENT_REF);
    expect(entries).toHaveLength(1);
    const envelope = redactor().redact(entries[0]!);
    expect(envelope.source_event_ref).toBe(EVENT_REF);
    expect(envelope.capture_point).toBe("http");
    expect(envelope.component).toEqual({
      process: "api",
      package: "@debateai/api",
      route_template: "/v1/answers/:id",
    });
  });

  it("omits an invalid route template without admitting arbitrary component data", () => {
    const entries: CaptureQueueEntry[] = [];
    const health = createCaptureHealth();
    const emitter = createCaptureEmitter({
      queue: {
        offer(entry) {
          entries.push(entry);
          return true;
        },
      },
      health,
      gaps: createCaptureGapCounter({ health }),
      sourceEventRef: () => EVENT_REF,
    });

    emitter.captureHandled(
      Object.freeze({ code: "DATABASE_POOL_FAILED" }),
      Object.freeze({
        capture_point: "http",
        route_template: "/v1/answers?user_token=secret",
        component: Object.freeze({ process: "forged", package: "forged" }),
      }),
    );

    const envelope = redactor().redact(entries[0]!);
    expect(envelope.capture_point).toBe("http");
    expect(envelope.component).toEqual({
      process: "api",
      package: "@debateai/api",
    });
  });
});
