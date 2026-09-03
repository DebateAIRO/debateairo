import { readFileSync } from "node:fs";

import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  startCaptureRuntime,
  stopCaptureRuntime,
  type CaptureRuntimeStartOptions,
  type CaptureRuntimeName,
  type FatalExitSink,
  type RuntimeCaptureModule,
} from "@debateai/obs-capture/runtime";
import { readObsBounds } from "../../packages/obs-capture/src/runtime/config.js";

const installerModule: RuntimeCaptureModule = {
  startCaptureRuntime,
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
    expect(installerModule.startCaptureRuntime).toBe(startCaptureRuntime);
    expectTypeOf<CaptureRuntimeStartOptions>().toEqualTypeOf<{
      readonly runtime: CaptureRuntimeName;
      readonly spoolFd: number | undefined;
      readonly installExitSink: (nextExitSink: FatalExitSink) => void;
    }>();
    expectTypeOf<Parameters<typeof startCaptureRuntime>>().toEqualTypeOf<[
      CaptureRuntimeStartOptions,
    ]>();
    expectTypeOf<ReturnType<typeof startCaptureRuntime>>().toEqualTypeOf<
      Promise<void>
    >();
    expectTypeOf<Parameters<typeof stopCaptureRuntime>>().toEqualTypeOf<[
      { readonly deadlineMs: number },
    ]>();

    const installers = ["api", "runner", "scheduler"] as const;
    for (const name of installers) {
      const source = readFileSync(
        new URL(`../../packages/obs-capture/install/${name}.ts`, import.meta.url),
        "utf8",
      );
      expect(source).toMatch(/readonly runtime: typeof RUNTIME/);
      expect(source).toMatch(/readonly spoolFd: number \| undefined/);
      expect(source).toMatch(/readonly installExitSink:/);
      expect(source).toMatch(/\}\) => void \| Promise<void>/);

      const privateStartContract = source.match(
        /interface RuntimeCaptureModule\s*\{\s*readonly startCaptureRuntime: \(options: \{(?<options>[\s\S]*?)\}\) => void \| Promise<void>;\s*\}/,
      );
      expect(privateStartContract).not.toBeNull();
      expect(
        Array.from(
          privateStartContract?.groups?.options?.matchAll(
            /readonly\s+([A-Za-z_$][\w$]*)\s*:/g,
          ) ?? [],
          (match) => match[1],
        ),
      ).toEqual(["runtime", "spoolFd", "installExitSink"]);
    }
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
