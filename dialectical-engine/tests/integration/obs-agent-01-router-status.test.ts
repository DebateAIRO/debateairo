import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-router-status-"));
  scratchDirectories.push(path);
  return path;
}

function snapshot(modules: Readonly<Record<string, readonly unknown[]>>) {
  return {
    pid: 7001,
    version: "0.1.0",
    thresholds_version: 7,
    mute: null,
    components: {},
    modules
  };
}

describe("OBS-01 module-owned router status", () => {
  it("merges router status only into its owner and preserves other module projections", async () => {
    const {
      mergeModuleStatus, toStoredModuleStatusProjection, writeStatusSnapshot
    } = await import("../../apps/observation-agent/src/store/status.js");
    const stateDir = await scratch();
    const routing = Object.freeze([
      toStoredModuleStatusProjection({
        kind: "state", view: "delivery", key: "last_outcome", state: "DELIVERED"
      })
    ]);
    const other = Object.freeze([
      toStoredModuleStatusProjection({
        kind: "metric", key: "attempts", value: 2, unit: "COUNT"
      })
    ]);
    const routerStatus = Object.freeze([
      toStoredModuleStatusProjection({
        kind: "channels", view: "route", key: "fatal",
        channels: ["digest", "status", "osascript", "sendmail", "kanban"]
      })
    ]);
    const input = new Map([
      ["routing", routing],
      ["self", other]
    ]);
    const merged = mergeModuleStatus(input, "routing", routerStatus);
    expect(merged).toEqual({ routing: [...routing, ...routerStatus], self: other });
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.routing)).toBe(true);
    expect(input.get("routing")).toBe(routing);
    expect(input.get("self")).toBe(other);

    await writeStatusSnapshot(stateDir, snapshot(merged));
    const stored = JSON.parse(await readFile(join(stateDir, "status.json"), "utf8"));
    expect(stored.modules.routing).toEqual([...routing, ...routerStatus]);
    expect(stored.modules.self).toEqual(other);
    expect(stored).not.toHaveProperty("router");
  });

  it("rejects a router collision and preserves the prior atomic snapshot bytes", async () => {
    const {
      mergeModuleStatus, toStoredModuleStatusProjection, writeStatusSnapshot
    } = await import("../../apps/observation-agent/src/store/status.js");
    const stateDir = await scratch();
    const ordinary = Object.freeze([toStoredModuleStatusProjection({
      kind: "state", view: "delivery", key: "last_outcome", state: "DELIVERED"
    })]);
    await writeStatusSnapshot(stateDir, snapshot({ routing: ordinary }));
    const before = await readFile(join(stateDir, "status.json"));
    const duplicate = Object.freeze([toStoredModuleStatusProjection({
      kind: "state", view: "delivery", key: "last_outcome", state: "FAILED"
    })]);
    expect(() => mergeModuleStatus(
      new Map([["routing", ordinary]]), "routing", duplicate
    )).toThrow("OBSERVATION_STATUS_DUPLICATE_KEY");
    expect(await readFile(join(stateDir, "status.json"))).toEqual(before);
  });

  it("rejects invalid router status before it can reach the status file", async () => {
    const {
      mergeModuleStatus, toStoredModuleStatusProjection, writeStatusSnapshot
    } = await import("../../apps/observation-agent/src/store/status.js");
    const stateDir = await scratch();
    const ordinary = Object.freeze([toStoredModuleStatusProjection({
      kind: "state", key: "health", state: "UP"
    })]);
    await writeStatusSnapshot(stateDir, snapshot({ routing: ordinary }));
    const before = await readFile(join(stateDir, "status.json"));
    expect(() => mergeModuleStatus(new Map([["routing", ordinary]]), "routing", [{
      kind: "string", key: "secret", value: "raw status text"
    } as never])).toThrow();
    expect(() => mergeModuleStatus(
      new Map([["routing", ordinary]]), null, ordinary
    )).toThrow("OBSERVATION_STATUS_INVALID");
    expect(await readFile(join(stateDir, "status.json"))).toEqual(before);
  });

  it("collects pure status only after the tick and before the one atomic write", async () => {
    const {
      mergeModuleStatus, toStoredModuleStatusProjection, writeStatusSnapshot
    } = await import("../../apps/observation-agent/src/store/status.js");
    const events: string[] = [];
    const router = Object.freeze({
      async onSignal() { events.push("signal"); },
      async onTick() { events.push("tick"); },
      status() {
        events.push("status");
        return Object.freeze([{ kind: "uuid" as const, key: "ack_signal", value: null }]);
      }
    });
    await router.onSignal();
    expect(events).toEqual(["signal"]);
    await router.onTick();
    const modules = mergeModuleStatus(new Map(), "routing",
      router.status().map(toStoredModuleStatusProjection));
    const stateDir = await scratch();
    events.push("write");
    await writeStatusSnapshot(stateDir, snapshot(modules));
    expect(events).toEqual(["signal", "tick", "status", "write"]);
    expect(JSON.parse(await readFile(join(stateDir, "status.json"), "utf8")))
      .toMatchObject({ modules: { routing: [{ kind: "uuid", key: "ack_signal", value: null }] } });
  });
});
