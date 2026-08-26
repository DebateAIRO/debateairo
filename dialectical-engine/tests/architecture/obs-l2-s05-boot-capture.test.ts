import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function bootFailureProbe(runtime: "api" | "runner" | "scheduler"): ReturnType<typeof spawnSync> {
  const throwingDb = 'data:text/javascript,throw new Error("DB_IMPORT_FIXTURE")';
  const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@debateai/db") {
    return { url: ${JSON.stringify(throwingDb)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
  const loaderUrl = `data:text/javascript,${encodeURIComponent(loaderSource)}`;
  const program = `
const beforeUnhandled = process.listenerCount("unhandledRejection");
const beforeUncaught = process.listenerCount("uncaughtExceptionMonitor");
await import("@debateai/obs-capture/install/${runtime}");
const afterUnhandled = process.listenerCount("unhandledRejection");
const afterUncaught = process.listenerCount("uncaughtExceptionMonitor");
if (afterUnhandled <= beforeUnhandled || afterUncaught <= beforeUncaught) {
  throw new Error("INSTALL_HANDLERS_MISSING");
}
const core = await import("@debateai/obs-capture");
const health = core.createCaptureHealth();
const gaps = core.createCaptureGapCounter({ health });
const queue = new core.BoundedReferenceQueue(4);
core.installCaptureEmitter(core.createCaptureEmitter({
  queue,
  health,
  gaps,
}));
void import("@debateai/db");
await new Promise((resolve) => setTimeout(resolve, 100));
const spool = core.createPreopenedSpool({ fd: 3, envelopeMaxBytes: 16_384 });
const flusher = core.createCaptureFlusher({
  queue,
  redactor: core.createSharedRedactor({
    environment: "test",
    build_ref: "UNTRACKED-DEV:s05-fixture",
    build_dirty: true,
    runtime: ${JSON.stringify(runtime)},
    component: { process: ${JSON.stringify(runtime)}, package: "@debateai/${runtime}" },
    writer_identity: "${runtime}-boot-fixture",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    now: () => new Date("2026-08-26T00:00:00.000Z"),
    sourceEventRef: () => "00000000-0000-4000-8000-000000000005",
  }),
  databaseSink: {
    async writeOccurrences() { throw new Error("DATABASE_SINK_FIXTURE"); },
    async writeCaptureGap() {},
  },
  spool,
  health,
  gaps,
});
const flush = await flusher.flushOnce();
console.log(JSON.stringify({
  beforeUnhandled,
  afterUnhandled,
  beforeUncaught,
  afterUncaught,
  flush,
}));
`;

  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      program,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
}

describe("S05 install-first boot failure capture", () => {
  it.each(["api", "runner", "scheduler"] as const)(
    "installs %s handlers before @debateai/db evaluates and writes the rejection to the pre-opened spool fd",
    (runtime) => {
      const result = bootFailureProbe(runtime);
      const spool = result.output[3]?.toString() ?? "";

      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}\nspool=${spool}`).toBe(0);
      expect(result.stdout).toMatch(/"afterUnhandled":\d+/u);
      expect(result.stdout).toMatch(/"afterUncaught":\d+/u);
      expect(result.stdout).toContain('"flush":{"dequeued":1,"persisted":0,"spooled":1,"lost":0}');
      const lines = spool.trim().split("\n");
      expect(lines).toHaveLength(1);
      const envelope = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
      expect(envelope.code).toBe("OBS_CAPTURE_SELF");
      expect(envelope.fallback_minimized).toBe(true);
      expect(spool).not.toContain("DB_IMPORT_FIXTURE");
      expect(spool).not.toContain("DATABASE_SINK_FIXTURE");
    },
  );
});
