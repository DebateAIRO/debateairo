import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { appendDailyNotWiredImpact } from "../../apps/observation-agent/src/modules/capture-health/daily.js";
import { createCaptureHealthModule } from "../../apps/observation-agent/src/modules/capture-health/module.js";

const temporaryDirectories: string[] = [];

function notWiredOpen(signalId: string, runtime = "runner", detectedAt = "2026-09-05T08:00:00.000Z") {
  return Object.freeze({
    lifecycle: Object.freeze({ owner: "capture-health", correlationKey: `not-wired:${runtime}` }),
    signal: signalSchema.parse({
      seq: 1,
      signal_id: signalId,
      state: "OPEN",
      class: "CAPTURE_NOT_WIRED",
      component: "obs_capture",
      severity: "INFO",
      impact_code: "IMPACT_CAPTURE_NOT_WIRED",
      first_failed_probe_at: detectedAt,
      detected_at: detectedAt,
      evidence: { runtime, flush_ok_count: 0, health: "NOT_WIRED" },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null,
      recorded_at: detectedAt
    })
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("OBS-04 truthful daily capture reminder", () => {
  it("projects each journaled post-digest-failure OPEN and original-UUID CLEAR exactly once", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-production-emission-"));
    temporaryDirectories.push(stateDir);
    await writeFile(join(stateDir, "digest"), "blocks digest directory");

    const policy = Object.freeze({
      version: 1,
      sourceRef: "OBS-04-production-boundary",
      ratifiedBy: "V",
      appliedAt: new Date("2026-09-06T00:00:00.000Z"),
      value: Object.freeze({
        schema_version: 1 as const,
        liveness: Object.freeze({
          probe_interval_ms: 5_000,
          probe_timeout_ms: 2_000,
          open_after_failures: 100,
          clear_after_successes: 100
        }),
        notification: Object.freeze({
          rate_limit_ms: 600_000,
          degraded_after_ms: 900_000,
          timeout_ms: 2_000
        }),
        resources: Object.freeze({
          cpu_percent_max: 2,
          rss_mb_max: 150,
          max_database_sessions: 2,
          statement_timeout_ms: 2_000
        }),
        routing: Object.freeze({
          INFRA_DOWN: "FATAL" as const,
          INFRA_NOT_READY: "DEGRADED" as const,
          INFRA_UNKNOWN: "SEVERE" as const,
          AGENT_SELF: "SEVERE" as const
        }),
        modules: Object.freeze({
          "capture-health": Object.freeze({
            expected_runtimes: Object.freeze(["runner"]),
            blind_window_s: 120,
            gap_window_s: 300,
            gap_severe_lost_count: 100
          })
        })
      })
    });
    let wired = false;
    const observedOpenIds: string[][] = [];
    const capture = createCaptureHealthModule({
      readSnapshot: async () => ({
        state: "CURRENT",
        gaps: [],
        health: wired ? [{
          runtime: "runner",
          state: "HEALTHY",
          observedAt: new Date(),
          detailCode: "FLUSH_OK"
        }] : [],
        receipts: [],
        cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
      }),
      readRuntimeLiveness: async () => ({ runner: "UP" }),
      appendDailyNotWiredImpact: async () => "ALREADY_PRESENT"
    });
    const module = Object.freeze({
      ...capture,
      cadence: Object.freeze({ intervalMs: 0, timeoutMs: 2_000 }),
      async probe(ctx: Parameters<typeof capture.probe>[0]) {
        observedOpenIds.push((ctx.openSignals ?? []).map((open) => open.signal.signal_id));
        return capture.probe(ctx);
      }
    });
    const routed: ReturnType<typeof signalSchema.parse>[] = [];
    const router = Object.freeze({
      async onSignal(input: Readonly<{ signal: ReturnType<typeof signalSchema.parse> }>) {
        routed.push(input.signal);
      },
      async onTick() {},
      status() { return Object.freeze([]); }
    });
    const statusModule = await import("../../apps/observation-agent/src/store/status.js");
    let statusWrites = 0;
    const statusWaiters: Array<() => void> = [];
    let intervalCallback: (() => void) | null = null;
    const priorTermListeners = new Set(process.listeners("SIGTERM"));
    const priorInterruptListeners = new Set(process.listeners("SIGINT"));

    vi.stubGlobal("setInterval", (callback: () => void) => {
      intervalCallback = callback;
      return 1;
    });
    vi.stubGlobal("clearInterval", () => undefined);
    vi.doMock("pg", () => ({
      default: { Pool: class { async end() {} } }
    }));
    vi.doMock("../../packages/register/src/runtime-environment.js", () => ({
      loadObservationAgentEnvironment: () => ({
        OBSERVATION_DATABASE_URL: "postgresql://unused",
        OBSERVATION_STATE_DIR: stateDir,
        OBSERVATION_TARGETS_PATH: join(stateDir, "targets")
      })
    }));
    vi.doMock("../../apps/observation-agent/src/core/database.js", () => ({
      createObservationDaemonDatabase: () => ({
        pool: { async end() {} },
        database: { async withClient() { throw new Error("UNEXPECTED_DATABASE"); } }
      })
    }));
    vi.doMock("../../apps/observation-agent/src/core/modules.js", () => ({
      discoverObservationRuntimeModules: async () => ({
        modules: Object.freeze([module]),
        targetFragments: Object.freeze([]),
        routerContribution: null
      }),
      createOwnedSignalRouter: async () => { throw new Error("UNEXPECTED_OWNED_ROUTER"); }
    }));
    vi.doMock("../../apps/observation-agent/src/core/paths.js", () => ({
      observationRepoRoot: () => process.cwd()
    }));
    vi.doMock("../../apps/observation-agent/src/core/routing.js", () => ({
      createLegacyOsaScriptRouter: () => router
    }));
    vi.doMock("../../apps/observation-agent/src/core/targets.js", () => ({
      loadObservationTargetCatalog: async () => ({
        targets: Object.freeze([]),
        fragments: Object.freeze([])
      })
    }));
    vi.doMock("../../apps/observation-agent/src/core/threshold-cache.js", () => ({
      ThresholdPolicyCache: class { async write() {} },
      readBootThresholdPolicy: async () => ({ policy, source: "DATABASE" })
    }));
    const thresholdsModule = await import(
      "../../apps/observation-agent/src/oactl/core/thresholds.js"
    );
    vi.doMock("../../apps/observation-agent/src/oactl/core/thresholds.js", () => ({
      ...thresholdsModule,
      reloadThresholdPolicy: async () => policy
    }));
    vi.doMock("../../apps/observation-agent/src/journal/records.js", async () => {
      const records = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/journal/records.js"
      )>("../../apps/observation-agent/src/journal/records.js");
      return {
        ...records,
        replayObservationJournals: async () => ({
          openSignals: Object.freeze([]),
          deliveryResults: Object.freeze([])
        })
      };
    });
    vi.doMock("../../apps/observation-agent/src/modules/self/direct-notify.js", () => ({
      deliverJournalFailureDirect: async () => undefined
    }));
    vi.doMock("../../apps/observation-agent/src/modules/self/heartbeat.js", () => ({
      HeartbeatWriter: class {},
      writeHeartbeatFailOpen: async () => true
    }));
    vi.doMock("../../apps/observation-agent/src/store/postgres.js", () => ({
      PostgresMirror: class {
        async mirrorSignal() {}
        async catchUp() {}
      }
    }));
    vi.doMock("../../apps/observation-agent/src/store/status.js", () => ({
      ...statusModule,
      async writeStatusSnapshot(...args: Parameters<typeof statusModule.writeStatusSnapshot>) {
        await statusModule.writeStatusSnapshot(...args);
        statusWrites += 1;
        statusWaiters.shift()?.();
      }
    }));

    const nextStatus = () => new Promise<void>((resolve) => { statusWaiters.push(resolve); });
    const tick = async () => {
      const completion = nextStatus();
      intervalCallback?.();
      await completion;
    };
    const openIds = async () => {
      const snapshot = JSON.parse(await readFile(join(stateDir, "status.json"), "utf8")) as {
        components: { obs_capture: { open_signal_ids: string[] } };
      };
      return snapshot.components.obs_capture.open_signal_ids;
    };

    try {
      await import("../../apps/observation-agent/src/main.js");
      await vi.waitFor(() => {
        expect(intervalCallback).not.toBeNull();
        expect(statusWrites).toBe(1);
      });

      const opened = routed.filter((signal) => signal.component === "obs_capture");
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({ state: "OPEN", clears_signal_id: null });
      expect(await openIds()).toEqual([opened[0]!.signal_id]);

      await tick();
      expect(observedOpenIds[1]).toEqual([opened[0]!.signal_id]);
      expect(routed.filter((signal) => signal.component === "obs_capture")).toEqual(opened);

      wired = true;
      await tick();
      const transitions = routed.filter((signal) => signal.component === "obs_capture");
      expect(transitions).toHaveLength(2);
      expect(transitions[1]).toMatchObject({
        state: "CLEARED",
        clears_signal_id: opened[0]!.signal_id
      });
      expect(await openIds()).toEqual([]);

      await tick();
      expect(observedOpenIds[3]).toEqual([]);
      expect(routed.filter((signal) => signal.component === "obs_capture")).toEqual(transitions);
    } finally {
      for (const listener of process.listeners("SIGTERM")) {
        if (!priorTermListeners.has(listener)) process.removeListener("SIGTERM", listener);
      }
      for (const listener of process.listeners("SIGINT")) {
        if (!priorInterruptListeners.has(listener)) process.removeListener("SIGINT", listener);
      }
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("retries a pre-journal OPEN and never writes its rejected UUID", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-open-retry-"));
    temporaryDirectories.push(stateDir);
    const rejectedId = "70000000-0000-4000-8000-000000000413";
    const durableId = "70000000-0000-4000-8000-000000000414";
    const identifiers = [rejectedId, durableId];
    const attempts: ReturnType<typeof signalSchema.parse>[] = [];
    let identifier = 0;
    let sequence = 0;
    const module = createCaptureHealthModule({
      readSnapshot: async () => ({
        state: "CURRENT", gaps: [], health: [], receipts: [],
        cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
      }),
      readRuntimeLiveness: async () => ({ runner: "UP" })
    });
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      sampleStore: { async write() {} },
      emitSignal: async (signal) => {
        attempts.push(signal);
        return { journaled: signal.signal_id === durableId };
      }
    });
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000,
      database: {} as never, stateDir, repoRoot: process.cwd(), targets: [],
      thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    await run(new Date("2026-09-05T08:00:00.000Z"));
    await expect(readFile(join(stateDir, "digest", "2026-09-05.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await run(new Date("2026-09-05T08:00:15.000Z"));
    await run(new Date("2026-09-05T08:00:30.000Z"));

    expect(attempts.map((signal) => signal.signal_id)).toEqual([rejectedId, durableId]);
    const digest = await readFile(join(stateDir, "digest", "2026-09-05.md"), "utf8");
    expect(digest).toContain(durableId);
    expect(digest).not.toContain(rejectedId);
  });

  it("keeps a post-journal OPEN authoritative when its digest step fails", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-journaled-"));
    const pipelineStateDir = await mkdtemp(join(tmpdir(), "obs-04-pipeline-journaled-"));
    temporaryDirectories.push(stateDir, pipelineStateDir);
    await writeFile(join(pipelineStateDir, "digest"), "blocks digest directory");
    const signalId = "70000000-0000-4000-8000-000000000415";
    let sequence = 0;
    const journaledSignals: ReturnType<typeof signalSchema.parse>[] = [];
    const outcomes: boolean[] = [];
    const module = createCaptureHealthModule({
      readSnapshot: async () => ({
        state: "CURRENT", gaps: [], health: [], receipts: [],
        cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
      }),
      readRuntimeLiveness: async () => ({ runner: "UP" })
    });
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      nextSequence: () => ++sequence,
      nextSignalId: () => signalId,
      sampleStore: { async write() {} },
      emitSignal: async (signal, _now, lifecycle) => {
        let journaled = false;
        await persistSignal({
          signal,
          lifecycle,
          journal: {
            stateDir: pipelineStateDir,
            appendSignal: async (written: ReturnType<typeof signalSchema.parse>) => {
              journaledSignals.push(written);
            }
          } as never,
          mirror: { async mirrorSignal() { throw new Error("UNEXPECTED_MIRROR"); } },
          onJournaled() { journaled = true; }
        }).catch(() => undefined);
        outcomes.push(journaled);
        return { journaled };
      }
    });
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000,
      database: {} as never, stateDir, repoRoot: process.cwd(), targets: [],
      thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    await run(new Date("2026-09-05T09:00:00.000Z"));
    await run(new Date("2026-09-05T09:00:15.000Z"));

    expect(outcomes).toEqual([true]);
    expect(journaledSignals).toEqual([expect.objectContaining({ signal_id: signalId })]);
    await expect(readFile(join(stateDir, "digest", "2026-09-05.md"), "utf8"))
      .resolves.toContain(signalId);
  });

  it("uses runtime-assigned same-process OPEN identities and replaces a cleared identity", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-runtime-"));
    temporaryDirectories.push(stateDir);
    const oldId = "70000000-0000-4000-8000-000000000410";
    const clearId = "70000000-0000-4000-8000-000000000411";
    const newId = "70000000-0000-4000-8000-000000000412";
    const identifiers = [oldId, clearId, newId];
    let identifier = 0;
    let sequence = 0;
    let flushAt: Date | undefined;
    const emitted: ReturnType<typeof signalSchema.parse>[] = [];
    const module = createCaptureHealthModule({
      readSnapshot: async () => ({
        state: "CURRENT",
        gaps: [],
        health: flushAt === undefined ? [] : [{
          runtime: "runner", state: "HEALTHY", observedAt: flushAt,
          detailCode: "FLUSH_OK"
        }],
        receipts: [],
        cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
      }),
      readRuntimeLiveness: async () => ({ runner: "UP" })
    });
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      sampleStore: { async write() {} },
      emitSignal: async (signal) => { emitted.push(signal); }
    });
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000,
      database: {} as never, stateDir, repoRoot: process.cwd(), targets: [],
      thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    await run(new Date("2026-09-05T08:00:00.000Z"));
    await run(new Date("2026-09-06T12:34:56.000Z"));
    flushAt = new Date("2026-09-06T12:35:00.000Z");
    await run(new Date("2026-09-06T12:35:15.000Z"));
    flushAt = undefined;
    await run(new Date("2026-09-06T12:35:30.000Z"));
    await run(new Date("2026-09-07T12:34:56.000Z"));

    expect(emitted).toEqual([
      expect.objectContaining({ signal_id: oldId, state: "OPEN", clears_signal_id: null }),
      expect.objectContaining({ signal_id: clearId, state: "CLEARED", clears_signal_id: oldId }),
      expect.objectContaining({ signal_id: newId, state: "OPEN", clears_signal_id: null })
    ]);
    await expect(readFile(join(stateDir, "digest", "2026-09-06.md"), "utf8"))
      .resolves.toContain(`12:34:56Z · INFO · obs_capture · CAPTURE_NOT_WIRED · Error capture is not wired into the product: no failure is recorded anywhere. · ${oldId}`);
    const reopenedDay = await readFile(join(stateDir, "digest", "2026-09-07.md"), "utf8");
    expect(reopenedDay).toContain(`12:34:56Z · INFO · obs_capture · CAPTURE_NOT_WIRED · Error capture is not wired into the product: no failure is recorded anywhere. · ${newId}`);
    expect(reopenedDay).not.toContain(oldId);
  });

  it("uses the actual UTC time and unique still-open signal UUID exactly once per day", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-restart-"));
    temporaryDirectories.push(stateDir);
    const signalId = "70000000-0000-4000-8000-000000000404";
    const input = {
      stateDir,
      runtime: "runner",
      now: new Date("2026-09-06T12:34:56.000Z"),
      openSignals: [notWiredOpen(signalId)]
    } as const;

    await expect(appendDailyNotWiredImpact(input)).resolves.toBe("APPENDED");
    await expect(appendDailyNotWiredImpact(input)).resolves.toBe("ALREADY_PRESENT");
    await expect(readFile(join(stateDir, "digest", "2026-09-06.md"), "utf8"))
      .resolves.toBe(
        "12:34:56Z · INFO · obs_capture · CAPTURE_NOT_WIRED · "
        + "Error capture is not wired into the product: no failure is recorded anywhere. · "
        + `${signalId}\n`
      );
  });

  it("uses the new OPEN UUID on the day after clear and reopen", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-reopen-"));
    temporaryDirectories.push(stateDir);
    const oldId = "70000000-0000-4000-8000-000000000405";
    const newId = "70000000-0000-4000-8000-000000000406";

    await expect(appendDailyNotWiredImpact({
      stateDir, runtime: "runner", now: new Date("2026-09-06T23:59:59.000Z"),
      openSignals: [notWiredOpen(oldId)]
    })).resolves.toBe("APPENDED");
    await expect(appendDailyNotWiredImpact({
      stateDir, runtime: "runner", now: new Date("2026-09-07T00:00:01.000Z"),
      openSignals: [notWiredOpen(newId, "runner", "2026-09-07T00:00:00.000Z")]
    })).resolves.toBe("APPENDED");

    await expect(readFile(join(stateDir, "digest", "2026-09-07.md"), "utf8"))
      .resolves.toContain(`00:00:01Z · INFO · obs_capture · CAPTURE_NOT_WIRED · Error capture is not wired into the product: no failure is recorded anywhere. · ${newId}`);
  });

  it.each([
    ["missing", []],
    ["ambiguous", [
      notWiredOpen("70000000-0000-4000-8000-000000000407"),
      notWiredOpen("70000000-0000-4000-8000-000000000408")
    ]]
  ])("fails closed for %s OPEN identity and writes nothing", async (_case, openSignals) => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-missing-"));
    temporaryDirectories.push(stateDir);

    await expect(appendDailyNotWiredImpact({
      stateDir, runtime: "runner", now: new Date("2026-09-06T12:34:56.000Z"), openSignals
    })).resolves.toBe("OPEN_IDENTITY_MISSING");
    await expect(readFile(join(stateDir, "digest", "2026-09-06.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
