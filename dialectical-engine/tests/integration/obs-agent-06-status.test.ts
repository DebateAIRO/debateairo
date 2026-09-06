import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHatchetThroughputModule } from "../../apps/observation-agent/src/modules/hatchet-throughput/module.js";
import {
  createProviderHealthModule,
  type ProviderCall
} from "../../apps/observation-agent/src/modules/provider-health/module.js";
import { createThroughputModule } from "../../apps/observation-agent/src/modules/throughput/module.js";
import { renderStatus } from "../../apps/observation-agent/src/oactl/core/status.js";
import {
  toStoredModuleStatusProjection,
  writeStatusSnapshot
} from "../../apps/observation-agent/src/store/status.js";
import type {
  Module,
  ModuleConfigurationObject,
  ModuleStatusProjection
} from "../../apps/observation-agent/src/core/types.js";

const scratchDirectories: string[] = [];
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

const now = new Date("2026-09-04T11:00:00.000Z");
const target = Object.freeze({
  component: "hatchet" as const,
  kind: "hatchet_metrics" as const,
  rest_url: "http://127.0.0.1:8888/api/v1/tenants/main/queue-metrics"
});

async function projections(
  module: Module,
  thresholds: ModuleConfigurationObject,
  targets: readonly unknown[] = Object.freeze([])
): Promise<readonly ModuleStatusProjection[]> {
  return Object.freeze((await module.probe({
    now,
    timeoutMs: 2_000,
    database,
    stateDir: "/tmp/obs-06-status-fixture",
    targets,
    targetFragment: null,
    configuration: Object.freeze({}),
    thresholds
  })).flatMap((observation) => observation.status ?? []));
}

describe("OBS-06 exact throughput status", () => {
  it("renders all five SPEC phrases from owned module values", async () => {
    const throughput = createThroughputModule({
      read: async () => Object.freeze({
        previous: Object.freeze({
          runSequence: 0, runsStarted: 0, terminalRuns: 0, failedRuns: 0,
          workItemSequence: 0, completedWorkItems: 0, failedWorkItems: 0
        }),
        current: Object.freeze({
          runSequence: 4, runsStarted: 4, terminalRuns: 4, failedRuns: 3,
          workItemSequence: 4, completedWorkItems: 1, failedWorkItems: 3
        })
      })
    });
    const provider = createProviderHealthModule({ readCalls: async () => Object.freeze([]) });
    const hatchet = createHatchetThroughputModule({
      tokenPath: () => "/tmp/fixture-token",
      readRest: async () => Object.freeze({
        queueDepth: 0, dispatchP95Seconds: 31, failedTasksTotal: 0, createdTasksTotal: 0
      }),
      readPrometheus: async () => { throw new Error("disabled"); }
    });
    const modules = {
      throughput: await projections(throughput, Object.freeze({
        window_minutes: 5, run_failure_window_minutes: 60,
        run_failure_minimum: 4, run_failure_ratio: 0.5
      })),
      "provider-health": await projections(provider, Object.freeze({
        window_minutes: 5, minimum_calls: 10, failure_ratio: 0.5
      })),
      "hatchet-throughput": await projections(hatchet, Object.freeze({
        queue_depth: 10, queue_sustained_s: 300, dispatch_p95_s: 30,
        failed_tasks: 3, failed_window_minutes: 15
      }), Object.freeze([target]))
    };
    const stateDir = await mkdtemp(join(tmpdir(), "obs-06-status-"));
    scratchDirectories.push(stateDir);
    await writeStatusSnapshot(stateDir, {
      pid: 606,
      version: "OBS-06-fixture",
      thresholds_version: 6,
      mute: null,
      components: {},
      modules: Object.fromEntries(Object.entries(modules).map(([name, values]) => [
        name,
        values.map(toStoredModuleStatusProjection)
      ]))
    });

    const output = await renderStatus(stateDir, "throughput");
    for (const phrase of [
      "queue threshold 10/5m",
      "provider threshold 50%/10",
      "run failure threshold 50%/4",
      "run failure: 3/4 over 60m (SEVERE)",
      "dispatch p95: 31s over 5m (DEGRADED)"
    ]) expect(output).toContain(phrase);
  });

  it("uses stored five-minute and hourly baselines instead of the last 30-second sample", async () => {
    const module = createThroughputModule({
      read: async () => Object.freeze({
        previous: Object.freeze({
          runSequence: 19, runsStarted: 19, terminalRuns: 9, failedRuns: 4,
          workItemSequence: 19, completedWorkItems: 5, failedWorkItems: 4
        }),
        fiveMinuteBaseline: Object.freeze({
          runSequence: 16, runsStarted: 16, terminalRuns: 8, failedRuns: 4,
          workItemSequence: 16, completedWorkItems: 5, failedWorkItems: 3
        }),
        hourlyBaseline: Object.freeze({
          runSequence: 10, runsStarted: 10, terminalRuns: 6, failedRuns: 2,
          workItemSequence: 10, completedWorkItems: 4, failedWorkItems: 2
        }),
        current: Object.freeze({
          runSequence: 20, runsStarted: 20, terminalRuns: 10, failedRuns: 5,
          workItemSequence: 20, completedWorkItems: 6, failedWorkItems: 4
        })
      })
    });
    const status = await projections(module, Object.freeze({
      window_minutes: 5, run_failure_window_minutes: 60,
      run_failure_minimum: 4, run_failure_ratio: 0.5
    }));

    expect(status).toContainEqual(expect.objectContaining({
      kind: "metric", key: "throughput.runs.started", value: 4
    }));
    expect(status).toContainEqual({
      kind: "template", key: "run.failure", template: "RATIO_WINDOW_STATE",
      numerator: 3, denominator: 4, windowMinutes: 60,
      state: "SEVERE", view: "throughput"
    });
    expect(module.samples([], { now })).toEqual(expect.arrayContaining([
      { metricKey: "throughput.window.runs_started", value: 4, observedAt: now },
      { metricKey: "throughput.window.work_items_drained", value: 2, observedAt: now }
    ]));
  });

  it("starts a provider five-minute window at observation time instead of replaying history", async () => {
    let calls: readonly ProviderCall[] = Array.from({ length: 10 }, (_, index) => Object.freeze({
      providerRef: "provider:alpha", modelId: "model:a",
      parseStatus: "PARSE_FAILED", atSequence: index + 1
    }));
    const module = createProviderHealthModule({ readCalls: async () => Object.freeze(calls) });
    const context = Object.freeze({
      now, timeoutMs: 2_000, database,
      stateDir: "/tmp/obs-06-status-fixture", targets: Object.freeze([]),
      targetFragment: null, configuration: Object.freeze({}),
      thresholds: Object.freeze({ window_minutes: 5, minimum_calls: 10, failure_ratio: 0.5 })
    });
    await module.probe(context);
    expect(module.signals([], { ...context, thresholdVersion: 6 })).toEqual([]);

    calls = Object.freeze([...calls, ...Array.from({ length: 10 }, (_, index) => Object.freeze({
      providerRef: "provider:alpha", modelId: "model:a",
      parseStatus: index < 5 ? "PARSED" : "PARSE_FAILED", atSequence: index + 11
    }))]);
    const second = await module.probe({ ...context, now: new Date(now.getTime() + 30_000) });
    expect(second.flatMap((observation) => observation.status ?? [])).toContainEqual(
      expect.objectContaining({
        kind: "metric", key: "provider.provider-alpha.model.model-a.calls", value: 10
      })
    );
    expect(module.signals([], { ...context, thresholdVersion: 6 })).toEqual([
      expect.objectContaining({ state: "OPEN", impactCode: "IMPACT_PROVIDER" })
    ]);
  });
});
