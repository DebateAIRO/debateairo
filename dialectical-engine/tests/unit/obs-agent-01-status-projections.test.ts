import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { observationRepoRoot } from "../../apps/observation-agent/src/core/paths.js";

const scratchDirectories: string[] = [];
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-status-projections-"));
  scratchDirectories.push(path);
  return path;
}

const COMPOSITE_PROJECTIONS = Object.freeze([
  Object.freeze({
    kind: "template", key: "queue.threshold", template: "COUNT_WINDOW_THRESHOLD",
    count: 10, windowMinutes: 5, view: "throughput"
  }),
  Object.freeze({
    kind: "template", key: "provider.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
    percent: 50, minimum: 10, view: "throughput"
  }),
  Object.freeze({
    kind: "template", key: "run.failure.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
    percent: 50, minimum: 4, view: "throughput"
  }),
  Object.freeze({
    kind: "template", key: "run.failure", template: "RATIO_WINDOW_STATE",
    numerator: 3, denominator: 4, windowMinutes: 60, state: "SEVERE", view: "throughput"
  }),
  Object.freeze({
    kind: "template", key: "dispatch.p95", template: "DURATION_WINDOW_STATE",
    valueSeconds: 31, windowMinutes: 5, state: "DEGRADED", view: "throughput"
  })
]);

const STORED_COMPOSITE_PROJECTIONS = [
  {
    kind: "template", key: "queue.threshold", template: "COUNT_WINDOW_THRESHOLD",
    count: 10, window_minutes: 5, view: "throughput"
  },
  {
    kind: "template", key: "provider.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
    percent: 50, minimum: 10, view: "throughput"
  },
  {
    kind: "template", key: "run.failure.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
    percent: 50, minimum: 4, view: "throughput"
  },
  {
    kind: "template", key: "run.failure", template: "RATIO_WINDOW_STATE",
    numerator: 3, denominator: 4, window_minutes: 60, state: "SEVERE", view: "throughput"
  },
  {
    kind: "template", key: "dispatch.p95", template: "DURATION_WINDOW_STATE",
    value_seconds: 31, window_minutes: 5, state: "DEGRADED", view: "throughput"
  }
] as const;

const ESTABLISHED_TEMPLATE_PROJECTIONS = Object.freeze([
  Object.freeze({
    kind: "template", key: "evaluator_worker", template: "EVALUATOR_UNBOUND_BY_REGISTER"
  }),
  Object.freeze({ kind: "template", key: "schedule", template: "NO_SCHEDULE_RULED" }),
  Object.freeze({
    kind: "template", key: "capture", template: "CAPTURE_NOT_WIRED", count: 0
  }),
  Object.freeze({
    kind: "template", key: "slow_queries", template: "SLOW_QUERIES_NOT_OBSERVABLE"
  }),
  Object.freeze({
    kind: "template", key: "provider_latency", template: "PROVIDER_LATENCY_NOT_OBSERVABLE"
  })
] as const);

const ROUTER_STATUS_PROJECTIONS = Object.freeze([
  Object.freeze({
    kind: "channels", key: "route.fatal",
    channels: Object.freeze(["digest", "status", "osascript", "sendmail", "kanban"])
  }),
  Object.freeze({ kind: "component", key: "storm.root", component: "postgres" }),
  Object.freeze({
    kind: "uuid", key: "ack.signal", value: "70000000-0000-4000-8000-000000000001"
  }),
  Object.freeze({
    kind: "identifier", key: "board", identifierType: "board", value: "ops-alerts"
  }),
  Object.freeze({
    kind: "identifier", key: "ticket", identifierType: "external_ref", value: "t_70000001"
  }),
  Object.freeze({ kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" }),
  Object.freeze({
    kind: "state_child_path", key: "capture.dir",
    segments: Object.freeze(["dev-mail-capture"])
  }),
  Object.freeze({
    kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
    count: 5, windowSeconds: 60
  })
] as const);

const STORED_ROUTER_STATUS_PROJECTIONS = [
  {
    kind: "channels", key: "route.fatal",
    channels: ["digest", "status", "osascript", "sendmail", "kanban"]
  },
  { kind: "component", key: "storm.root", component: "postgres" },
  { kind: "uuid", key: "ack.signal", value: "70000000-0000-4000-8000-000000000001" },
  { kind: "identifier", key: "board", identifier_type: "board", value: "ops-alerts" },
  {
    kind: "identifier", key: "ticket", identifier_type: "external_ref", value: "t_70000001"
  },
  { kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" },
  { kind: "state_child_path", key: "capture.dir", segments: ["dev-mail-capture"] },
  {
    kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
    count: 5, window_seconds: 60
  }
] as const;

async function runProjection(projection: unknown): Promise<unknown> {
  const { ObservationModuleRuntime } = await import(
    "../../apps/observation-agent/src/core/runtime.js"
  );
  let captured: unknown;
  const runtime = new ObservationModuleRuntime({
    nextSequence: () => 1,
    nextSignalId: () => "60000000-0000-4000-8000-000000000001",
    sampleStore: { async write() { return undefined; } },
    emitSignal: async () => undefined,
    updateModuleStatus(_moduleName, update) { captured = update; }
  });
  await runtime.run({
    modules: [{
      name: "throughput-fixture",
      cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
      async probe() {
        return [{
          component: "hatchet", ok: true, class: "THROUGHPUT_ANOMALY",
          probe: "throughput", lastStatus: "READY", management: "module",
          status: [projection]
        }] as never;
      },
      samples() { return []; },
      signals() { return []; }
    }],
    now: new Date("2026-09-04T08:00:00.000Z"),
    timeoutMs: 2_000,
    database,
    stateDir: "/tmp/observation-state",
    repoRoot: observationRepoRoot(),
    targets: [],
    thresholdVersion: 1
  });
  return captured;
}

describe("OBS-01 closed composite status projections", () => {
  it("preserves every established template payload through runtime and storage", async () => {
    const { toStoredModuleStatusProjection } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    for (const projection of ESTABLISHED_TEMPLATE_PROJECTIONS) {
      await expect(runProjection(projection)).resolves.toMatchObject({ projections: [projection] });
      expect(toStoredModuleStatusProjection(projection)).toEqual(projection);
    }
  });

  it("parses every module-side form into immutable typed projections", async () => {
    const captured = await runProjection(COMPOSITE_PROJECTIONS[0]);
    expect(captured).toEqual({
      observations: [{
        component: "hatchet", ok: true, class: "THROUGHPUT_ANOMALY",
        probe: "throughput", lastStatus: "READY", management: "module",
        status: [COMPOSITE_PROJECTIONS[0]]
      }],
      projections: [COMPOSITE_PROJECTIONS[0]]
    });
    const update = captured as Readonly<{
      observations: readonly Readonly<{ status?: readonly unknown[] }>[];
      projections: readonly unknown[];
    }>;
    expect(Object.isFrozen(update.projections)).toBe(true);
    expect(Object.isFrozen(update.projections[0])).toBe(true);
    expect(Object.isFrozen(update.observations[0]?.status)).toBe(true);

    for (const projection of COMPOSITE_PROJECTIONS.slice(1)) {
      await expect(runProjection(projection)).resolves.toMatchObject({ projections: [projection] });
    }
  });

  it("maps every module-side field to the exact stored snake-case contract", async () => {
    const statusModule = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    const mapper = (statusModule as unknown as Readonly<{
      toStoredModuleStatusProjection?: (projection: never) => unknown;
    }>).toStoredModuleStatusProjection;
    expect(typeof mapper).toBe("function");
    if (mapper === undefined) return;

    expect(COMPOSITE_PROJECTIONS.map((projection) => mapper(projection as never)))
      .toEqual(STORED_COMPOSITE_PROJECTIONS);
  });

  it("rejects free text, arbitrary fields, unknown templates, and invalid numeric bounds", async () => {
    const invalid = [
      { ...COMPOSITE_PROJECTIONS[0], label: "private caller text" },
      { ...COMPOSITE_PROJECTIONS[0], text: "private caller text" },
      { ...COMPOSITE_PROJECTIONS[0], format: "%s" },
      { ...COMPOSITE_PROJECTIONS[0], evidence: { arbitrary: 1 } },
      { ...COMPOSITE_PROJECTIONS[0], arbitrary: 1 },
      { kind: "template", key: "queue.threshold", template: "CALLER_TEXT", text: "private" },
      { ...COMPOSITE_PROJECTIONS[0], count: 0 },
      { ...COMPOSITE_PROJECTIONS[0], windowMinutes: 0 },
      { ...COMPOSITE_PROJECTIONS[1], percent: -1 },
      { ...COMPOSITE_PROJECTIONS[1], percent: 101 },
      { ...COMPOSITE_PROJECTIONS[1], minimum: 0 },
      { ...COMPOSITE_PROJECTIONS[3], numerator: -1 },
      { ...COMPOSITE_PROJECTIONS[3], denominator: 0 },
      { ...COMPOSITE_PROJECTIONS[3], numerator: 5 },
      { ...COMPOSITE_PROJECTIONS[4], valueSeconds: -1 },
      { ...COMPOSITE_PROJECTIONS[4], windowMinutes: Number.POSITIVE_INFINITY },
      { ...COMPOSITE_PROJECTIONS[4], state: "CRITICAL" }
    ];
    for (const projection of invalid) {
      await expect(runProjection(projection)).rejects.toThrow("OBSERVATION_MODULE_PROBE_INVALID");
    }
  });

  it("validates stored forms before writing and rejects their malformed variants", async () => {
    const { storedModuleStatusProjectionSchema, writeStatusSnapshot } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    for (const projection of STORED_COMPOSITE_PROJECTIONS) {
      expect(storedModuleStatusProjectionSchema.parse(projection)).toEqual(projection);
    }

    const stateDir = await scratch();
    const invalid = [
      { ...STORED_COMPOSITE_PROJECTIONS[0], label: "private caller text" },
      { ...STORED_COMPOSITE_PROJECTIONS[0], text: "private caller text" },
      { ...STORED_COMPOSITE_PROJECTIONS[0], format: "%s" },
      { ...STORED_COMPOSITE_PROJECTIONS[0], evidence: { arbitrary: 1 } },
      { ...STORED_COMPOSITE_PROJECTIONS[0], arbitrary: 1 },
      { ...STORED_COMPOSITE_PROJECTIONS[0], template: "CALLER_TEXT" },
      { ...STORED_COMPOSITE_PROJECTIONS[0], window_minutes: 0 },
      { ...STORED_COMPOSITE_PROJECTIONS[1], percent: 101 },
      { ...STORED_COMPOSITE_PROJECTIONS[3], denominator: 0 },
      { ...STORED_COMPOSITE_PROJECTIONS[3], numerator: 5 },
      { ...STORED_COMPOSITE_PROJECTIONS[4], value_seconds: -1 },
      { ...STORED_COMPOSITE_PROJECTIONS[4], state: "CRITICAL" }
    ];
    for (const projection of invalid) {
      expect(() => storedModuleStatusProjectionSchema.parse(projection)).toThrow();
      await expect(writeStatusSnapshot(stateDir, {
        pid: 1,
        version: "0.1.0",
        thresholds_version: 1,
        mute: null,
        components: {},
        modules: { "throughput-fixture": [projection] }
      })).rejects.toThrow();
      await expect(access(join(stateDir, "status.json"))).rejects.toThrow();
    }
  });

  it("round-trips every closed router-status projection into exact stored shapes", async () => {
    const { storedModuleStatusProjectionSchema, toStoredModuleStatusProjection } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    const mapper = toStoredModuleStatusProjection as (projection: never) => unknown;

    for (const [index, projection] of ROUTER_STATUS_PROJECTIONS.entries()) {
      await expect(runProjection(projection)).resolves.toMatchObject({ projections: [projection] });
      const stored = mapper(projection as never);
      expect(stored).toEqual(STORED_ROUTER_STATUS_PROJECTIONS[index]);
      expect(storedModuleStatusProjectionSchema.parse(stored))
        .toEqual(STORED_ROUTER_STATUS_PROJECTIONS[index]);

      await expect(runProjection({ ...projection, unexpected: true }))
        .rejects.toThrow("OBSERVATION_MODULE_PROBE_INVALID");
      expect(() => storedModuleStatusProjectionSchema.parse({
        ...STORED_ROUTER_STATUS_PROJECTIONS[index], unexpected: true
      })).toThrow();
    }
  });

  it("rejects unsafe router-status values without a free-text escape hatch", async () => {
    const invalid = [
      { kind: "string", key: "message", value: "raw product error" },
      { kind: "identifier", key: "board", identifierType: "board", value: "ops alerts" },
      {
        kind: "identifier", key: "ticket", identifierType: "external_ref", value: "<script>"
      },
      {
        kind: "loopback_endpoint", key: "status", port: 9797,
        path: "http://0.0.0.0/status"
      },
      { kind: "loopback_endpoint", key: "status", port: 80, path: "/status" },
      { kind: "state_child_path", key: "capture.dir", segments: ["..", "secret"] },
      { kind: "channels", key: "route.fatal", channels: ["kanban", "kanban"] },
      { kind: "channels", key: "route.fatal", channels: ["webhook"] },
      {
        kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
        count: 5, windowSeconds: 0
      }
    ];
    for (const projection of invalid) {
      await expect(runProjection(projection)).rejects.toThrow("OBSERVATION_MODULE_PROBE_INVALID");
    }

    const { storedModuleStatusProjectionSchema } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    for (const projection of [
      { kind: "string", key: "message", value: "raw product error" },
      { kind: "identifier", key: "board", identifier_type: "board", value: "ops alerts" },
      { kind: "identifier", key: "ticket", identifier_type: "external_ref", value: "<script>" },
      { kind: "loopback_endpoint", key: "status", port: 9797, path: "http://0.0.0.0/status" },
      { kind: "loopback_endpoint", key: "status", port: 80, path: "/status" },
      { kind: "state_child_path", key: "capture.dir", segments: ["..", "secret"] },
      { kind: "channels", key: "route.fatal", channels: ["kanban", "kanban"] },
      { kind: "channels", key: "route.fatal", channels: ["webhook"] },
      {
        kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
        count: 5, window_seconds: 0
      }
    ]) {
      expect(() => storedModuleStatusProjectionSchema.parse(projection)).toThrow();
    }
  });

  it("allows a key in distinct views but rejects a duplicate view-and-key pair", async () => {
    const { writeStatusSnapshot } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    const stateDir = await scratch();
    const snapshot = (projections: readonly unknown[]) => ({
      pid: 1,
      version: "0.1.0",
      thresholds_version: 1,
      mute: null,
      components: {},
      modules: { routing: projections }
    });
    const capacity = {
      kind: "state", key: "shared.health", state: "UP", view: "capacity"
    } as const;
    const throughput = {
      kind: "state", key: "shared.health", state: "UP", view: "throughput"
    } as const;

    await expect(writeStatusSnapshot(stateDir, snapshot([capacity, throughput])))
      .resolves.toBeUndefined();
    await expect(writeStatusSnapshot(stateDir, snapshot([capacity, { ...capacity, state: "DOWN" }])))
      .rejects.toThrow("OBSERVATION_STATUS_DUPLICATE_KEY");
  });
});
