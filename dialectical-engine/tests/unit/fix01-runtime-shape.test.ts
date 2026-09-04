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
  "OBS_SPOOL_ADMISSION_SEAL_V1",
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
      const optionFields: string[] = [];
      let nestingDepth = 0;
      for (const line of privateStartContract?.groups?.options?.split("\n") ?? []) {
        if (nestingDepth === 0) {
          const field = line.match(
            /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/,
          );
          const fieldName = field?.[1];
          if (fieldName !== undefined) optionFields.push(fieldName);
        }
        for (const character of line) {
          if (character === "(" || character === "{" || character === "[") {
            nestingDepth += 1;
          } else if (
            character === ")" ||
            character === "}" ||
            character === "]"
          ) {
            nestingDepth -= 1;
          }
        }
      }
      expect(optionFields).toEqual(["runtime", "spoolFd", "installExitSink"]);
    }
  });

  it("uses disclosed defaults when OBS bounds are absent", () => {
    for (const key of OBS_KEYS) delete process.env[key];

    expect(readObsBounds()).toEqual({
      flushDeadlineMs: 5_000,
      queueCapacity: 1_024,
      spoolDir: undefined,
      spoolAdmissionSeal: undefined,
      writerDatabaseUrl: undefined,
    });
  });

  it("reads positive numeric bounds and explicit sink locations", () => {
    process.env.OBS_FLUSH_DEADLINE_MS = "7250";
    process.env.OBS_QUEUE_CAPACITY = "31";
    process.env.OBS_SPOOL_DIR = "/tmp/fix01-spool";
    process.env.OBS_SPOOL_ADMISSION_SEAL_V1 = [
      "2",
      "a".repeat(64),
      "b".repeat(64),
      "16777234",
      "9007199254740991",
      "8192",
      "16777235",
      "9007199254740990",
      "c".repeat(64),
    ].join(".");
    process.env.OBS_WRITER_DATABASE_URL = "postgres://writer:secret@127.0.0.1:5432/db";

    expect(readObsBounds()).toEqual({
      flushDeadlineMs: 7_250,
      queueCapacity: 31,
      spoolDir: "/tmp/fix01-spool",
      spoolAdmissionSeal: {
        version: 2,
        admissionRef: "a".repeat(64),
        manifestSha256: "b".repeat(64),
        indexDev: "16777234",
        indexIno: "9007199254740991",
        prefixBytes: 8_192,
        lockDev: "16777235",
        lockIno: "9007199254740990",
        lockSha256: "c".repeat(64),
      },
      writerDatabaseUrl: "postgres://writer:secret@127.0.0.1:5432/db",
    });
    const runtimeSource = readFileSync(
      new URL("../../packages/obs-capture/src/runtime/index.ts", import.meta.url),
      "utf8",
    );
    expect(runtimeSource).toMatch(
      /admissionSeal:\s*state\.bounds\.spoolAdmissionSeal/u,
    );
  });

  it.each([
    "",
    "1." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.3.4.5." + "c".repeat(64),
    "2." + "A".repeat(64) + "." + "b".repeat(64) + ".1.2.3.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(63) + ".1.2.3.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".01.2.3.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.02.3.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.0.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.3.04.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.3.4.05." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.3.4.5." + "c".repeat(63),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.9007199254740992.4.5." + "c".repeat(64),
    "2." + "a".repeat(64) + "." + "b".repeat(64) + ".1.2.3.4.5." + "c".repeat(64) + ".extra",
    "x".repeat(513),
  ])("rejects a noncanonical or unbounded admission seal: %s", (seal) => {
    process.env.OBS_SPOOL_ADMISSION_SEAL_V1 = seal;
    expect(readObsBounds().spoolAdmissionSeal).toBeUndefined();
  });
});
