import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  startCaptureRuntime,
  stopCaptureRuntime,
  type CaptureRuntimeHandle,
  type CaptureRuntimeName,
} from "@debateai/obs-capture/runtime";
import { readObsBounds } from "../../packages/obs-capture/src/runtime/config.js";

type FatalExitSink = () => void;

interface FrozenRuntimeCaptureModuleContract {
  readonly startCaptureRuntime: (options: {
    readonly runtime: CaptureRuntimeName;
    readonly spoolFd: number | undefined;
    readonly installExitSink: (nextExitSink: FatalExitSink) => void;
  }) => Promise<CaptureRuntimeHandle>;
  readonly stopCaptureRuntime: (
    handle: CaptureRuntimeHandle,
    options: { readonly deadlineMs: number },
  ) => Promise<void>;
}

const runtimeModule: FrozenRuntimeCaptureModuleContract = {
  startCaptureRuntime,
  stopCaptureRuntime,
};

const OBS_KEYS = [
  "OBS_FLUSH_DEADLINE_MS",
  "OBS_QUEUE_CAPACITY",
  "OBS_SPOOL_DIR",
  "OBS_WRITER_DATABASE_URL",
] as const;
const savedEnvironment = Object.fromEntries(
  OBS_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof OBS_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of OBS_KEYS) {
    const value = savedEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("FIX-01 runtime module contract", () => {
  it("keeps the named installer arguments and explicit stop deadline", () => {
    expect(runtimeModule.startCaptureRuntime).toBe(startCaptureRuntime);
    expect(runtimeModule.stopCaptureRuntime).toBe(stopCaptureRuntime);
    expectTypeOf<Parameters<typeof startCaptureRuntime>>().toEqualTypeOf<[
      {
        readonly runtime: CaptureRuntimeName;
        readonly spoolFd: number | undefined;
        readonly installExitSink: (nextExitSink: FatalExitSink) => void;
      },
    ]>();
    expectTypeOf<Parameters<typeof stopCaptureRuntime>>().toEqualTypeOf<[
      CaptureRuntimeHandle,
      { readonly deadlineMs: number },
    ]>();
  });

  it("uses disclosed defaults when OBS bounds are absent", () => {
    for (const key of OBS_KEYS) delete process.env[key];

    expect(readObsBounds()).toEqual({
      flushDeadlineMs: 5_000,
      queueCapacity: 1_024,
      spoolDir: undefined,
      writerDatabaseUrl: undefined,
    });
  });

  it("reads positive numeric bounds and explicit sink locations", () => {
    process.env.OBS_FLUSH_DEADLINE_MS = "7250";
    process.env.OBS_QUEUE_CAPACITY = "31";
    process.env.OBS_SPOOL_DIR = "/tmp/fix01-spool";
    process.env.OBS_WRITER_DATABASE_URL = "postgres://writer:secret@127.0.0.1:5432/db";

    expect(readObsBounds()).toEqual({
      flushDeadlineMs: 7_250,
      queueCapacity: 31,
      spoolDir: "/tmp/fix01-spool",
      writerDatabaseUrl: "postgres://writer:secret@127.0.0.1:5432/db",
    });
  });
});
