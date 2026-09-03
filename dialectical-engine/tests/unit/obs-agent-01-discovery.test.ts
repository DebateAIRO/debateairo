import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-discovery-"));
  scratchDirectories.push(path);
  return path;
}

function moduleSource(name: string, targetFragmentBasename?: string): string {
  return `export default {
    name: ${JSON.stringify(name)},
    cadence: { intervalMs: 5000, timeoutMs: 2000 },
    ${targetFragmentBasename === undefined ? "" : `targetFragmentBasename: ${JSON.stringify(targetFragmentBasename)},`}
    async probe() { return []; }, samples() { return []; }, signals() { return []; }
  };\n`;
}

async function writeModule(
  root: string,
  directory: string,
  name: string,
  targetFragmentBasename?: string
): Promise<void> {
  const moduleRoot = join(root, directory);
  await mkdir(moduleRoot, { recursive: true });
  await writeFile(join(moduleRoot, "module.ts"), moduleSource(name, targetFragmentBasename), "utf8");
}

describe("OBS-01 lexical module, verb, and target discovery", () => {
  it("discovers the real modules in lexical order with the frozen manifest shape", async () => {
    const { discoverObservationModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const catalog = await discoverObservationModules(resolve("apps/observation-agent/src/modules"));
    expect(catalog.modules.map((module) => module.name)).toEqual(["core-liveness", "self"]);
    expect(catalog.modules[0]).toMatchObject({
      name: "core-liveness",
      targetFragmentBasename: "OBS-01.json"
    });
    expect(Object.keys(catalog.modules[0]!).sort()).toEqual([
      "cadence", "name", "probe", "samples", "signals", "targetFragmentBasename"
    ]);
    expect(Object.keys(catalog.modules[1]!).sort()).toEqual([
      "cadence", "name", "probe", "samples", "signals"
    ]);
    for (const module of catalog.modules) {
      expect(module.probe).toBeTypeOf("function");
      expect(module.samples).toBeTypeOf("function");
      expect(module.signals).toBeTypeOf("function");
      expect(module.cadence).toEqual({ intervalMs: 5_000, timeoutMs: 2_000 });
    }
  });

  it("fails deterministically on duplicate module names and target basenames", async () => {
    const { discoverObservationModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const duplicateModuleRoot = await scratch();
    await writeModule(duplicateModuleRoot, "a", "same");
    await writeModule(duplicateModuleRoot, "b", "same");
    await expect(discoverObservationModules(duplicateModuleRoot)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_MODULE"
    });

    const duplicateTargetRoot = await scratch();
    await writeModule(duplicateTargetRoot, "a", "a", "OBS-09.json");
    await writeModule(duplicateTargetRoot, "b", "b", "OBS-09.json");
    await expect(discoverObservationModules(duplicateTargetRoot)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_TARGET"
    });
  });

  it("loads module-owned oactl files lexically and rejects a duplicate verb", async () => {
    const { discoverObservationModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const root = await scratch();
    await writeModule(root, "a", "a");
    await writeModule(root, "b", "b");
    for (const directory of ["a", "b"]) {
      await mkdir(join(root, directory, "oactl"), { recursive: true });
      await writeFile(
        join(root, directory, "oactl", "ping.ts"),
        "export default { verb: 'ping', async run() { return 0; } };\n",
        "utf8"
      );
    }
    await expect(discoverObservationModules(root)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_VERB"
    });
  });

  it("merges OBS fragments lexically and rejects duplicate or unknown components", async () => {
    const { loadObservationTargets } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const root = await scratch();
    await writeFile(join(root, "OBS-02.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "api", kind: "http", live_url: "http://127.0.0.1:8790/v1/session" }]
    }));
    await writeFile(join(root, "OBS-01.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "docker", kind: "docker" }]
    }));
    expect((await loadObservationTargets(root)).map((target) => target.component)).toEqual([
      "docker", "api"
    ]);

    await writeFile(join(root, "OBS-03.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "docker", kind: "docker" }]
    }));
    await expect(loadObservationTargets(root)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_TARGET"
    });

    await rm(join(root, "OBS-03.json"));
    await writeFile(join(root, "OBS-03.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "secret_backend", kind: "docker" }]
    }));
    await expect(loadObservationTargets(root)).rejects.toMatchObject({
      code: "OBSERVATION_TARGETS_INVALID"
    });
  });

  it("preserves validated module fragments while core targets stay closed", async () => {
    const { loadObservationTargetCatalog } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const root = await scratch();
    await writeFile(join(root, "OBS-01.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "docker", kind: "docker" }]
    }));
    await writeFile(join(root, "OBS-02.json"), JSON.stringify({
      schema_version: 1,
      targets: [
        {
          component: "api", kind: "http", expected: "when_dev_stack",
          live_url: "http://127.0.0.1:8790/v1/session"
        },
        {
          component: "runner", kind: "process", expected: "when_dev_stack",
          command_contains: "apps/runner/src/main.ts"
        },
        {
          component: "evaluator_worker", kind: "fact", expected: "never",
          fact: "UNBOUND_BY_REGISTER"
        }
      ]
    }));
    await writeFile(join(root, "OBS-07.json"), JSON.stringify({
      schema_version: 1,
      targets: [],
      notify: {
        sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
        dev_capture_dir: "dev-mail-capture",
        from: "observation-agent@localhost",
        to: "operator@localhost"
      }
    }));

    const catalog = await loadObservationTargetCatalog(root);
    expect(catalog.fragments.map((fragment) => fragment.basename)).toEqual([
      "OBS-01.json", "OBS-02.json", "OBS-07.json"
    ]);
    expect(catalog.fragments[1]).toMatchObject({
      basename: "OBS-02.json",
      configuration: {},
      targets: [
        { component: "api", kind: "http", expected: "when_dev_stack" },
        { component: "runner", kind: "process", expected: "when_dev_stack" },
        { component: "evaluator_worker", kind: "fact", expected: "never" }
      ]
    });
    expect(catalog.fragments[2]?.configuration).toEqual({
      notify: {
        sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
        dev_capture_dir: "dev-mail-capture",
        from: "observation-agent@localhost",
        to: "operator@localhost"
      }
    });

    await writeFile(join(root, "OBS-01.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "docker", kind: "docker", expected: "always" }]
    }));
    await expect(loadObservationTargetCatalog(root)).rejects.toMatchObject({
      code: "OBSERVATION_TARGETS_INVALID"
    });
    await writeFile(join(root, "OBS-01.json"), JSON.stringify({
      schema_version: 1,
      targets: [{ component: "docker", kind: "docker" }],
      private_config: { endpoint: "https://private.invalid" }
    }));
    await expect(loadObservationTargetCatalog(root)).rejects.toMatchObject({
      code: "OBSERVATION_TARGETS_INVALID"
    });
  });

  it("rejects duplicate ownership of a validated fragment configuration key", async () => {
    const { loadObservationTargetCatalog } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const root = await scratch();
    const notify = {
      sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
      dev_capture_dir: "dev-mail-capture",
      from: "observation-agent@localhost",
      to: "operator@localhost"
    };
    await writeFile(join(root, "OBS-06.json"), JSON.stringify({
      schema_version: 1, targets: [], notify
    }));
    await writeFile(join(root, "OBS-07.json"), JSON.stringify({
      schema_version: 1, targets: [], notify
    }));
    await expect(loadObservationTargetCatalog(root)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_CONFIG"
    });
  });

  it("scopes fragment configuration and live thresholds to the owning module", async () => {
    const { loadObservationTargetCatalog } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const { ObservationModuleRuntime } = await import(
      "../../apps/observation-agent/src/core/runtime.js"
    );
    const root = await scratch();
    await writeFile(join(root, "OBS-06.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "hatchet", kind: "hatchet_metrics",
        rest_url: "http://127.0.0.1:8888/api/v1/tenants/local/queue-metrics"
      }]
    }));
    await writeFile(join(root, "OBS-07.json"), JSON.stringify({
      schema_version: 1,
      targets: [],
      notify: {
        sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
        dev_capture_dir: "dev-mail-capture",
        from: "observation-agent@localhost",
        to: "operator@localhost"
      }
    }));
    const catalog = await loadObservationTargetCatalog(root);
    const seen: Array<Readonly<{
      module: string;
      hook: "probe" | "signals";
      basename: string | null;
      targetComponents: readonly string[];
      configuration: unknown;
      thresholds: unknown;
    }>> = [];
    const module = (name: string, basename: string) => ({
      name,
      cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
      targetFragmentBasename: basename,
      async probe(ctx: Parameters<import("../../apps/observation-agent/src/core/types.js").Module["probe"]>[0]) {
        seen.push({
          module: name,
          hook: "probe",
          basename: ctx.targetFragment?.basename ?? null,
          targetComponents: ctx.targets.map((target) =>
            (target as Readonly<{ component: string }>).component),
          configuration: ctx.configuration,
          thresholds: ctx.thresholds
        });
        return [];
      },
      samples() { return []; },
      signals(_observations: readonly unknown[], ctx: Parameters<import("../../apps/observation-agent/src/core/types.js").Module["signals"]>[1]) {
        seen.push({
          module: name,
          hook: "signals",
          basename: ctx.targetFragment?.basename ?? null,
          targetComponents: ctx.targetFragment?.targets.map((target) =>
            (target as Readonly<{ component: string }>).component) ?? [],
          configuration: ctx.configuration,
          thresholds: ctx.thresholds
        });
        return [];
      }
    });
    const runtime = new ObservationModuleRuntime({
      nextSequence: () => 1,
      nextSignalId: () => "60000000-0000-4000-8000-000000000001",
      sampleStore: { async write() { return undefined; } },
      emitSignal: async () => undefined
    });
    const run = async (second: number, queueThreshold: number) => runtime.run({
      modules: [module("hatchet-throughput", "OBS-06.json"), module("channels-sendmail", "OBS-07.json")],
      now: new Date(`2026-09-03T07:30:${String(second).padStart(2, "0")}.000Z`),
      timeoutMs: 2_000,
      databaseUrl: "postgresql://agent:test@127.0.0.1:55432/debateai",
      stateDir: "/tmp/observation-state",
      targets: catalog.targets,
      targetFragments: catalog.fragments,
      moduleThresholds: {
        "hatchet-throughput": { queue_threshold: queueThreshold },
        "channels-sendmail": { timeout_ms: 10_000 }
      },
      thresholdVersion: queueThreshold
    });
    await run(0, 10);
    await run(5, 12);

    expect(seen.filter((entry) => entry.module === "hatchet-throughput")).toEqual([
      {
        module: "hatchet-throughput", hook: "probe", basename: "OBS-06.json",
        targetComponents: ["hatchet"], configuration: {}, thresholds: { queue_threshold: 10 }
      },
      {
        module: "hatchet-throughput", hook: "signals", basename: "OBS-06.json",
        targetComponents: ["hatchet"], configuration: {}, thresholds: { queue_threshold: 10 }
      },
      {
        module: "hatchet-throughput", hook: "probe", basename: "OBS-06.json",
        targetComponents: ["hatchet"], configuration: {}, thresholds: { queue_threshold: 12 }
      },
      {
        module: "hatchet-throughput", hook: "signals", basename: "OBS-06.json",
        targetComponents: ["hatchet"], configuration: {}, thresholds: { queue_threshold: 12 }
      }
    ]);
    expect(seen.filter((entry) => entry.module === "channels-sendmail")
      .every((entry) => JSON.stringify(entry).includes("notify")
        && !JSON.stringify(entry).includes("queue_threshold"))).toBe(true);
  });

  it("keeps module-managed observations out of core liveness and projects bounded status", async () => {
    const statusUpdates: unknown[] = [];
    const { ObservationModuleRuntime } = await import(
      "../../apps/observation-agent/src/core/runtime.js"
    );
    const runtime = new ObservationModuleRuntime({
      nextSequence: () => 1,
      nextSignalId: () => "60000000-0000-4000-8000-000000000001",
      sampleStore: { async write() { return undefined; } },
      emitSignal: async () => undefined,
      updateModuleStatus: async (moduleName, update) => {
        statusUpdates.push({ moduleName, update });
      }
    });
    const observations = await runtime.run({
      modules: [{
        name: "product-liveness",
        cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
        async probe() {
          return [{
            component: "dev_stack", ok: false, class: "INFRA_DOWN",
            probe: "expected_set", lastStatus: "NOT_RUNNING",
            management: "module", statusState: "NOT_RUNNING",
            status: [{
              kind: "template", key: "evaluator_worker",
              template: "EVALUATOR_UNBOUND_BY_REGISTER"
            }]
          }] as const;
        },
        samples() { return []; },
        signals() { return []; }
      }],
      now: new Date("2026-09-03T07:30:00.000Z"),
      timeoutMs: 2_000,
      databaseUrl: "postgresql://agent:test@127.0.0.1:55432/debateai",
      stateDir: "/tmp/observation-state",
      targets: [],
      thresholdVersion: 1
    });
    expect(observations).toEqual([]);
    expect(statusUpdates).toEqual([{
      moduleName: "product-liveness",
      update: {
        observations: [{
          component: "dev_stack", ok: false, class: "INFRA_DOWN",
          probe: "expected_set", lastStatus: "NOT_RUNNING",
          management: "module", statusState: "NOT_RUNNING",
          status: [{
            kind: "template", key: "evaluator_worker",
            template: "EVALUATOR_UNBOUND_BY_REGISTER"
          }]
        }],
        projections: [{
          kind: "template", key: "evaluator_worker",
          template: "EVALUATOR_UNBOUND_BY_REGISTER"
        }]
      }
    }]);
  });

  it("fails closed when a module returns a malformed probe, sample, or signal intent", async () => {
    const { ObservationModuleRuntime } = await import(
      "../../apps/observation-agent/src/core/runtime.js"
    );
    const runtime = () => new ObservationModuleRuntime({
      nextSequence: () => 1,
      nextSignalId: () => "60000000-0000-4000-8000-000000000001",
      sampleStore: { async write() { return undefined; } },
      emitSignal: async () => undefined
    });
    const base = {
      cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
      async probe() { return []; },
      signals() { return []; }
    };
    const input = {
      now: new Date("2026-09-03T07:30:00.000Z"),
      timeoutMs: 2_000,
      databaseUrl: "postgresql://agent:test@127.0.0.1:55432/debateai",
      stateDir: "/tmp/observation-state",
      targets: [],
      thresholdVersion: 1
    } as const;
    await expect(runtime().run({
      ...input,
      modules: [{ ...base, name: "bad-probe", async probe() {
        return [{ component: "unknown", ok: "yes" }];
      } }] as never
    })).rejects.toThrow("OBSERVATION_MODULE_PROBE_INVALID");
    await expect(runtime().run({
      ...input,
      modules: [{ ...base, name: "bad-sample", samples() {
        return [{ metricKey: "secret payload", value: Number.NaN, observedAt: input.now }];
      } }]
    })).rejects.toThrow("OBSERVATION_MODULE_SAMPLE_INVALID");
    await expect(runtime().run({
      ...input,
      modules: [{ ...base, name: "bad-signal", samples() { return []; }, signals() {
        return [{ state: "OPEN", component: "unknown" }];
      } }] as never
    })).rejects.toThrow("OBSERVATION_MODULE_SIGNAL_INVALID");
  });
});
