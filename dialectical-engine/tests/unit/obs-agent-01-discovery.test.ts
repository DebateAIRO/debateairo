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
