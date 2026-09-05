import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("OBS-01 launchd custody and runtime bounds", () => {
  it("ships a persistent launchd template and a credential-checking exec shell", async () => {
    const plistPath = resolve(
      root, "deploy/observation-agent/launchd/com.dialectical-engine.observation-agent.plist"
    );
    const launchPath = resolve(root, "apps/observation-agent/bin/launch.sh");
    const [plist, launch] = await Promise.all([
      readFile(plistPath, "utf8"),
      readFile(launchPath, "utf8")
    ]);
    expect(plist).toContain("com.dialectical-engine.observation-agent");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<integer>10</integer>");
    expect(plist).toContain("__OBSERVATION_LAUNCH_SCRIPT__");
    expect(plist).toContain("__OBSERVATION_STATE_DIR__");
    expect(launch).toMatch(/stat -f ['"]%Lp['"]/u);
    expect(launch).toMatch(/stat -f ['"]%u['"]/u);
    expect(launch).toContain("0600");
    expect(launch).toMatch(/\[\[ "\$mode" != "600" \]\]/u);
    expect(launch).toMatch(/\[\[ "\$owner" != "\$\(id -u\)" \]\]/u);
    expect(launch).toContain("exec node --import tsx src/main.ts");
    expect((await stat(launchPath)).mode & 0o111).not.toBe(0);
  });

  it("keeps runtime resource and shutdown constraints explicit and has no sidecar", async () => {
    const [main, heartbeat, thresholds, packageSource, coreModule] = await Promise.all([
      readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/modules/self/heartbeat.ts"), "utf8"),
      readFile(resolve(root, "deploy/observation-agent/thresholds/defaults/OBS-01.json"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/package.json"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/modules/core-liveness/module.ts"), "utf8")
    ]);
    expect(main).toContain("loadObservationAgentEnvironment");
    expect(main).toMatch(/max:\s*policy\.value\.resources\.max_database_sessions/u);
    expect(main).toContain("process.on(\"SIGTERM\"");
    expect(main).toContain("setInterval");
    expect(heartbeat).toContain("SET statement_timeout = 2000");
    const policy = JSON.parse(thresholds) as Record<string, unknown>;
    expect(policy).toMatchObject({
      liveness: { probe_interval_ms: 5_000, probe_timeout_ms: 2_000 },
      resources: {
        cpu_percent_max: 2, rss_mb_max: 150,
        max_database_sessions: 2, statement_timeout_ms: 2_000
      }
    });
    expect(packageSource).not.toContain("observation-agent.state");
    expect(coreModule).toContain("runCoreLivenessProbes");
    expect(coreModule).not.toContain("async probe() { return Object.freeze([]); }");
    await expect(stat(resolve(root, "apps/observation-agent/observation-agent.state")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails configuration through one code path and contains no product lifecycle command", async () => {
    const [main, launchd, commands] = await Promise.all([
      readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/oactl/core/launchd.ts"), "utf8"),
      readFile(resolve(root, "apps/observation-agent/src/oactl/core/commands.ts"), "utf8")
    ]);
    expect(main).toContain("normalizeObservationError");
    expect(main).toContain("exitCode = 2");
    const combined = `${launchd}\n${commands}`;
    expect(combined).not.toMatch(/docker[^\n]*(start|stop|restart|kill|rm|pause|compose)/u);
    expect(combined).not.toMatch(/(apps\/api|apps\/runner|apps\/ui|dev:auth:down)/u);
    expect(combined.match(/com\.dialectical-engine\.observation-agent/gu)?.length).toBeGreaterThan(0);
  });

  it("keeps durable routing and status collection in their required runtime order", async () => {
    const main = await readFile(resolve(root, "apps/observation-agent/src/main.ts"), "utf8");
    const routerInitialization = main.indexOf("router = routerOwner");
    const startSignal = main.indexOf("await emit(makeSelfSignal(");
    expect(routerInitialization).toBeGreaterThanOrEqual(0);
    expect(startSignal).toBeGreaterThan(routerInitialization);
    const emitStart = main.indexOf("async function emit(");
    const emitEnd = main.indexOf("const moduleRuntime", emitStart);
    const emit = main.slice(emitStart, emitEnd);
    expect(emit.indexOf("await persistSignal(")).toBeGreaterThanOrEqual(0);
    expect(emit.indexOf("await router.onSignal(")).toBeGreaterThan(
      emit.indexOf("await persistSignal(")
    );
    expect(main.match(/module: currentRouterModule\(\)/gu)).toHaveLength(2);

    const cycleStart = main.indexOf("async function cycle(");
    const cycleEnd = main.indexOf("async function shutdown(", cycleStart);
    const cycle = main.slice(cycleStart, cycleEnd);
    expect(cycle.indexOf("await router.onTick(")).toBeGreaterThanOrEqual(0);
    expect(cycle.indexOf("router.status()")).toBeGreaterThan(cycle.indexOf("await router.onTick("));
    expect(cycle.indexOf("await writeStatusSnapshot(")).toBeGreaterThan(
      cycle.indexOf("router.status()")
    );
  });
});
