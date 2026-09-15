import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-discovery-"));
  scratchDirectories.push(path);
  return path;
}

function moduleSource(
  name: string,
  targetFragmentBasename?: string,
  routerSource?: string
): string {
  return `export default {
    name: ${JSON.stringify(name)},
    cadence: { intervalMs: 5000, timeoutMs: 2000 },
    ${targetFragmentBasename === undefined ? "" : `targetFragmentBasename: ${JSON.stringify(targetFragmentBasename)},`}
    ${routerSource === undefined ? "" : `router: ${routerSource},`}
    async probe() { return []; }, samples() { return []; }, signals() { return []; }
  };\n`;
}

async function writeModule(
  root: string,
  directory: string,
  name: string,
  targetFragmentBasename?: string,
  routerSource?: string
): Promise<void> {
  const moduleRoot = join(root, directory);
  await mkdir(moduleRoot, { recursive: true });
  await writeFile(
    join(moduleRoot, "module.ts"),
    moduleSource(name, targetFragmentBasename, routerSource),
    "utf8"
  );
}

describe("OBS-01 lexical module, verb, and target discovery", () => {
  it("discovers real modules lexically while freezing manifest and core contracts", async () => {
    const { discoverObservationModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const catalog = await discoverObservationModules(resolve("apps/observation-agent/src/modules"));
    const moduleNames = catalog.modules.map((module) => module.name);
    expect(moduleNames).toEqual([...moduleNames].sort((left, right) => left.localeCompare(right)));
    expect(new Set(moduleNames).size).toBe(moduleNames.length);

    const requiredMembers = ["cadence", "name", "probe", "samples", "signals"];
    const allowedMembers = new Set([
      ...requiredMembers, "lifecycle", "router", "targetFragmentBasename"
    ]);
    for (const module of catalog.modules) {
      const members = Object.keys(module);
      expect(members.filter((member) => !allowedMembers.has(member))).toEqual([]);
      expect(members).toEqual(expect.arrayContaining(requiredMembers));
      expect(module.probe).toBeTypeOf("function");
      expect(module.samples).toBeTypeOf("function");
      expect(module.signals).toBeTypeOf("function");
      if (module.lifecycle !== undefined) {
        expect(module.lifecycle.legacyCorrelationKey).toBeTypeOf("function");
        expect(module.lifecycle.restore).toBeTypeOf("function");
      }
      expect(Number.isFinite(module.cadence.intervalMs)).toBe(true);
      expect(Number.isFinite(module.cadence.timeoutMs)).toBe(true);
    }

    const coreLiveness = catalog.modules.find((module) => module.name === "core-liveness");
    expect(coreLiveness).toMatchObject({
      name: "core-liveness",
      cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
      targetFragmentBasename: "OBS-01.json"
    });
    expect(Object.keys(coreLiveness!).sort()).toEqual([
      "cadence", "name", "probe", "samples", "signals", "targetFragmentBasename"
    ]);
    const self = catalog.modules.find((module) => module.name === "self");
    expect(self).toMatchObject({
      name: "self",
      cadence: { intervalMs: 5_000, timeoutMs: 2_000 }
    });
    expect(Object.keys(self!).sort()).toEqual([
      "cadence", "name", "probe", "samples", "signals"
    ]);
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

  it("discovers one owned inert router and validates its complete lifecycle before use", async () => {
    const { createOwnedSignalRouter, discoverObservationModules } = await import(
      "../../apps/observation-agent/src/core/modules.js"
    );
    const root = await scratch();
    const routerSource = `{
      create(input) {
        globalThis.__obsRouterCreates = (globalThis.__obsRouterCreates ?? 0) + 1;
        globalThis.__obsRouterCreateInput = input;
        return {
          async onSignal(input) { globalThis.__obsRouterSignals.push(input.signal.severity); },
          async onTick() {},
          status() { return []; }
        };
      }
    }`;
    (globalThis as typeof globalThis & {
      __obsRouterCreates?: number;
      __obsRouterCreateInput?: unknown;
      __obsRouterSignals: string[];
    }).__obsRouterCreates = 0;
    (globalThis as typeof globalThis & { __obsRouterSignals: string[] })
      .__obsRouterSignals = [];
    let osascriptActions = 0;
    await writeModule(root, "routing", "routing", "OBS-07.json", routerSource);
    const catalog = await discoverObservationModules(root);
    expect(catalog.routerContribution).toEqual({
      moduleName: "routing",
      targetFragmentBasename: "OBS-07.json",
      factory: catalog.modules[0]?.router
    });
    expect(Object.isFrozen(catalog.routerContribution)).toBe(true);
    expect((globalThis as typeof globalThis & { __obsRouterCreates: number })
      .__obsRouterCreates).toBe(0);
    const targetFragment = Object.freeze({
      basename: "OBS-07.json",
      targets: Object.freeze([]),
      configuration: Object.freeze({ notify: Object.freeze({ board: "ops-alerts" }) })
    });
    const router = await createOwnedSignalRouter(catalog.routerContribution!, {
      stateDir: await scratch(),
      delivery: {} as never,
      osascript: async () => {
        osascriptActions += 1;
        return { deliveredAt: new Date(), externalRef: null };
      },
      moduleName: "routing",
      targetFragment,
      configuration: targetFragment.configuration,
      thresholds: Object.freeze({ storm_count: 5, storm_window_seconds: 60 }),
      thresholdVersion: 7
    });
    expect((globalThis as typeof globalThis & { __obsRouterCreateInput: Readonly<Record<string, unknown>> })
      .__obsRouterCreateInput).toMatchObject({
        moduleName: "routing",
        targetFragment,
        configuration: targetFragment.configuration,
        thresholds: { storm_count: 5, storm_window_seconds: 60 },
        thresholdVersion: 7
      });
    const { signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const base = {
      first_failed_probe_at: "2026-09-03T12:00:00.000Z",
      evidence: { probe: "http_get", last_status: "FAILED" },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null
    } as const;
    const info = signalSchema.parse({
      ...base, seq: 1, signal_id: "10000000-0000-4000-8000-000000000101",
      state: "OPEN", class: "INFRA_DOWN", component: "hatchet", severity: "INFO",
      impact_code: "IMPACT_HATCHET_DOWN", detected_at: "2026-09-03T12:00:01.000Z",
      recorded_at: "2026-09-03T12:00:01.000Z"
    });
    const degraded = signalSchema.parse({
      ...base, seq: 2, signal_id: "10000000-0000-4000-8000-000000000102",
      state: "OPEN", class: "INFRA_DOWN", component: "hatchet", severity: "DEGRADED",
      impact_code: "IMPACT_HATCHET_DOWN", detected_at: "2026-09-03T12:00:02.000Z",
      recorded_at: "2026-09-03T12:00:02.000Z"
    });
    const cleared = signalSchema.parse({
      ...base, seq: 3, signal_id: "10000000-0000-4000-8000-000000000103",
      state: "CLEARED", class: "INFRA_DOWN", component: "hatchet", severity: "DEGRADED",
      impact_code: "IMPACT_CLEARED", evidence: { duration_seconds: 1 },
      clears_signal_id: degraded.signal_id,
      detected_at: "2026-09-03T12:00:03.000Z", recorded_at: "2026-09-03T12:00:03.000Z"
    });
    const policy = { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 };
    const module = Object.freeze({
      thresholdVersion: 7,
      thresholds: Object.freeze({ storm_count: 5, storm_window_seconds: 60 })
    });
    for (const current of [info, degraded, cleared]) {
      await router.onSignal({
        signal: current, now: new Date(current.detected_at), policy, mute: null, module
      });
    }
    expect((globalThis as typeof globalThis & { __obsRouterSignals: string[] })
      .__obsRouterSignals).toEqual(["INFO", "DEGRADED", "DEGRADED"]);
    expect(osascriptActions).toBe(0);

    const duplicateRoot = await scratch();
    (globalThis as typeof globalThis & { __obsRouterCreates: number })
      .__obsRouterCreates = 0;
    await writeModule(duplicateRoot, "a", "a", "OBS-07.json", routerSource);
    await writeModule(duplicateRoot, "b", "b", "OBS-08.json", routerSource);
    await expect(discoverObservationModules(duplicateRoot)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_ROUTER"
    });
    expect((globalThis as typeof globalThis & { __obsRouterCreates: number })
      .__obsRouterCreates).toBe(0);

    const missingTargetRoot = await scratch();
    await writeModule(missingTargetRoot, "routing", "routing", undefined, routerSource);
    await expect(discoverObservationModules(missingTargetRoot)).rejects.toMatchObject({
      code: "OBSERVATION_MODULE_INVALID"
    });

    const invalidRouterRoot = await scratch();
    await writeModule(invalidRouterRoot, "routing", "routing", "OBS-07.json", `{
      create() { return { async onSignal() {}, async onTick() {} }; }
    }`);
    const invalidCatalog = await discoverObservationModules(invalidRouterRoot);
    await expect(createOwnedSignalRouter(invalidCatalog.routerContribution!, {
      stateDir: await scratch(), delivery: {} as never, osascript: async () => ({
        deliveredAt: new Date(), externalRef: null
      }), moduleName: "routing", targetFragment,
      configuration: targetFragment.configuration, thresholds: Object.freeze({}),
      thresholdVersion: 7
    })).rejects.toMatchObject({ code: "OBSERVATION_MODULE_INVALID" });

    (globalThis as typeof globalThis & { __obsRouterCreates: number }).__obsRouterCreates = 0;
    await expect(createOwnedSignalRouter(catalog.routerContribution!, {
      stateDir: await scratch(), delivery: {} as never, osascript: async () => ({
        deliveredAt: new Date(), externalRef: null
      }), moduleName: "other", targetFragment,
      configuration: targetFragment.configuration, thresholds: Object.freeze({}),
      thresholdVersion: 7
    })).rejects.toMatchObject({ code: "OBSERVATION_MODULE_INVALID" });
    expect((globalThis as typeof globalThis & { __obsRouterCreates: number })
      .__obsRouterCreates).toBe(0);
  });

  it("loads module-owned oactl files lexically and rejects a duplicate verb", async () => {
    const { discoverObservationCommandVerbs } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
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
    await expect(discoverObservationCommandVerbs(root)).rejects.toMatchObject({
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

  it("owns target facets by component and kind while preserving fragment scope", async () => {
    const { loadObservationTargetCatalog } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const root = await scratch();
    await writeFile(join(root, "OBS-01.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "hatchet", kind: "hatchet",
        live_url: "http://127.0.0.1:8888/api/live",
        ready_url: "http://127.0.0.1:8888/api/ready",
        container: "debateai-v3-hatchet-lite-1"
      }]
    }));
    await writeFile(join(root, "OBS-02.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "tls_front_door", kind: "http",
        live_url: "https://localhost:3000/login"
      }]
    }));
    await writeFile(join(root, "OBS-05.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "tls_front_door", kind: "certificate",
        path: ".local/dev-auth/tls/localhost.pem"
      }]
    }));
    await writeFile(join(root, "OBS-06.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "hatchet", kind: "hatchet_metrics",
        rest_url: "http://127.0.0.1:8888/api/v1/tenants/local/queue-metrics"
      }]
    }));

    const catalog = await loadObservationTargetCatalog(root);
    expect(catalog.targets.map((target) => [target.component, target.kind])).toEqual([
      ["hatchet", "hatchet"],
      ["tls_front_door", "http"],
      ["tls_front_door", "certificate"],
      ["hatchet", "hatchet_metrics"]
    ]);
    expect(catalog.fragments.map((fragment) => ({
      basename: fragment.basename,
      facets: fragment.targets.map((target) => {
        const facet = target as Readonly<{ component: string; kind: string }>;
        return [facet.component, facet.kind];
      })
    }))).toEqual([
      { basename: "OBS-01.json", facets: [["hatchet", "hatchet"]] },
      { basename: "OBS-02.json", facets: [["tls_front_door", "http"]] },
      { basename: "OBS-05.json", facets: [["tls_front_door", "certificate"]] },
      { basename: "OBS-06.json", facets: [["hatchet", "hatchet_metrics"]] }
    ]);

    await writeFile(join(root, "OBS-06.json"), JSON.stringify({
      schema_version: 1,
      targets: [{
        component: "tls_front_door", kind: "http",
        live_url: "https://localhost:3000/api/v1/session"
      }]
    }));
    await expect(loadObservationTargetCatalog(root)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_TARGET"
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
      database,
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
              template: "EVALUATOR_UNBOUND_BY_REGISTER", view: "capacity"
            }]
          }] as const;
        },
        samples() { return []; },
        signals() { return []; }
      }],
      now: new Date("2026-09-03T07:30:00.000Z"),
      timeoutMs: 2_000,
      database,
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
            template: "EVALUATOR_UNBOUND_BY_REGISTER", view: "capacity"
          }]
        }],
        projections: [{
          kind: "template", key: "evaluator_worker",
          template: "EVALUATOR_UNBOUND_BY_REGISTER", view: "capacity"
        }]
      }
    }]);
  });

  it("contains a module probe failure and still runs later health modules", async () => {
    const { ObservationModuleRuntime } = await import(
      "../../apps/observation-agent/src/core/runtime.js"
    );
    let laterRuns = 0;
    let sampleAttempts = 0;
    const runtime = new ObservationModuleRuntime({
      nextSequence: () => 1,
      nextSignalId: () => "60000000-0000-4000-8000-000000000001",
      sampleStore: { async write() {
        sampleAttempts += 1;
        throw Object.assign(new Error("POSTGRES_UNAVAILABLE"), { code: "ECONNREFUSED" });
      } },
      emitSignal: async () => undefined
    });
    const observations = await runtime.run({
      modules: [{
        name: "sample-writer",
        cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
        async probe() { return []; },
        samples() {
          return [{ metricKey: "sample.one", value: 1, observedAt: new Date() },
            { metricKey: "sample.two", value: 2, observedAt: new Date() }];
        },
        signals() { return []; }
      }, {
        name: "database-reader",
        cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
        async probe() {
          throw Object.assign(new Error("POSTGRES_UNAVAILABLE"), { code: "ECONNREFUSED" });
        },
        samples() { return []; },
        signals() { return []; }
      }, {
        name: "core-liveness",
        cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
        async probe() {
          laterRuns += 1;
          return [{
            component: "postgres", ok: false, class: "INFRA_DOWN",
            probe: "tcp+select1", lastStatus: "FAILED"
          }] as const;
        },
        samples() { return []; },
        signals() { return []; }
      }],
      now: new Date("2026-09-03T07:30:00.000Z"),
      timeoutMs: 2_000,
      database,
      stateDir: "/tmp/observation-state",
      repoRoot: "/tmp/repository",
      targets: [],
      thresholdVersion: 1
    });
    expect(sampleAttempts).toBe(1);
    expect(laterRuns).toBe(1);
    expect(observations).toEqual([expect.objectContaining({
      component: "postgres", ok: false, class: "INFRA_DOWN"
    })]);

    await expect(new ObservationModuleRuntime({
      nextSequence: () => 1,
      nextSignalId: () => "60000000-0000-4000-8000-000000000001",
      sampleStore: { async write() { return undefined; } },
      emitSignal: async () => undefined
    }).run({
      modules: [{
        name: "broken-module",
        cadence: { intervalMs: 5_000, timeoutMs: 2_000 },
        async probe() { throw new Error("PROGRAMMER_ERROR"); },
        samples() { return []; },
        signals() { return []; }
      }],
      now: new Date("2026-09-03T07:30:00.000Z"),
      timeoutMs: 2_000,
      database,
      stateDir: "/tmp/observation-state",
      repoRoot: "/tmp/repository",
      targets: [],
      thresholdVersion: 1
    })).rejects.toThrow("OBSERVATION_MODULE_PROBE_INVALID");
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
      database,
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
