import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import {
  signalSchema,
  type DeliveryResultEnvelope,
  type ObservationSignal
} from "../../apps/observation-agent/src/core/signals.js";
import type { RestoredOpenSignal, SignalIntent } from "../../apps/observation-agent/src/core/types.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { replayObservationJournals } from "../../apps/observation-agent/src/journal/records.js";
import { DeliveryCoordinator } from "../../apps/observation-agent/src/notify/delivery.js";
import {
  createDeliveryHealthTracker,
  type RoutedChannelResult
} from "../../apps/observation-agent/src/modules/routing/delivery-health.js";
import { createRoutingModule } from "../../apps/observation-agent/src/modules/routing/module.js";
import { createObservationSignalRouter, type RoutedChannel } from "../../apps/observation-agent/src/modules/routing/router.js";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-delivery-health-"));
  scratchDirectories.push(path);
  return path;
}

const CHANNELS = ["osascript", "sendmail", "kanban"] as const;
const BASE = Date.parse("2026-09-06T08:00:00.000Z");
const ROUTING_CONFIGURATION = Object.freeze({ notify: {
  sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
  dev_capture_dir: "dev-mail-capture",
  from: "observation-agent@localhost",
  to: "ops@localhost"
} });

function envelope(
  channel: RoutedChannel,
  outcome: RoutedChannelResult["outcome"],
  offsetSeconds: number
): DeliveryResultEnvelope {
  const attemptedAt = new Date(BASE + offsetSeconds * 1_000).toISOString();
  return Object.freeze({
    kind: "RESULT",
    delivery: {
      delivery_id: `77000000-0000-4000-8000-${String(offsetSeconds + 1).padStart(12, "0")}`,
      signal_id: "77000000-0000-4000-8000-000000000700",
      channel,
      attempted_at: attemptedAt,
      delivered_at: outcome === "DELIVERED"
        ? new Date(BASE + offsetSeconds * 1_000 + 250).toISOString()
        : null,
      outcome,
      external_ref: null
    }
  });
}

function materialize(intent: SignalIntent, channel: RoutedChannel): RestoredOpenSignal {
  const suffix = CHANNELS.indexOf(channel) + 1;
  const signal = signalSchema.parse({
    seq: suffix,
    signal_id: `77000000-0000-4000-8000-${String(100 + suffix).padStart(12, "0")}`,
    state: "OPEN",
    class: intent.class,
    component: intent.component,
    severity: intent.severity,
    impact_code: intent.impactCode,
    first_failed_probe_at: intent.firstFailedProbeAt?.toISOString() ?? null,
    detected_at: intent.detectedAt.toISOString(),
    evidence: intent.evidence,
    suspected_defect: intent.suspectedDefect,
    defect_kind: intent.defectKind,
    run_ref: intent.runRef,
    work_item_ref: intent.workItemRef,
    threshold_version: 7,
    clears_signal_id: null,
    recorded_at: intent.detectedAt.toISOString()
  });
  return Object.freeze({ correlationKey: `delivery:${channel}`, signal });
}

async function initializeRoutingModule(
  module: ReturnType<typeof createRoutingModule>,
  stateDir: string,
  deliveryResults: readonly DeliveryResultEnvelope[]
): Promise<void> {
  await module.router!.create({
    stateDir,
    repoRoot: process.cwd(),
    delivery: { async attempt() { throw new Error("not called"); } } as never,
    osascript: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
    moduleName: "routing",
    targetFragment: Object.freeze({
      basename: "OBS-07.json", targets: Object.freeze([]),
      configuration: ROUTING_CONFIGURATION
    }),
    configuration: ROUTING_CONFIGURATION,
    thresholds: Object.freeze({}),
    thresholdVersion: 7,
    deliveryResults
  });
}

function runtimeInput(module: ReturnType<typeof createRoutingModule>, stateDir: string, now: Date) {
  return Object.freeze({
    modules: Object.freeze([module]), now, timeoutMs: 2_000,
    database: {} as never, stateDir, repoRoot: process.cwd(), targets: Object.freeze([]),
    targetFragments: Object.freeze([Object.freeze({
      basename: "OBS-07.json", targets: Object.freeze([]),
      configuration: ROUTING_CONFIGURATION
    })]),
    thresholdVersion: 7
  });
}

describe("OBS-07 three-channel delivery health", () => {
  it.each(CHANNELS)("opens exact non-defect self-health for a durable %s failure", (channel) => {
    const failed = envelope(channel, "FAILED", CHANNELS.indexOf(channel));
    const tracker = createDeliveryHealthTracker([failed]);
    tracker.restore([]);

    expect(tracker.drain()).toEqual([expect.objectContaining({
      correlationKey: `delivery:${channel}`,
      component: "observation_agent",
      class: "AGENT_SELF",
      state: "OPEN",
      severity: "DEGRADED",
      impactCode: "IMPACT_AGENT_DELIVERY",
      firstFailedProbeAt: new Date(failed.delivery.attempted_at),
      detectedAt: new Date(failed.delivery.attempted_at),
      evidence: { reason: "DELIVERY_FAILURE", channel },
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    })]);
    expect(tracker.drain()).toEqual([]);
  });

  it.each(CHANNELS)("restores %s and clears its original UUID after durable recovery", async (channel) => {
    const failed = envelope(channel, "FAILED", CHANNELS.indexOf(channel));
    const opening = createDeliveryHealthTracker([failed]);
    opening.restore([]);
    const restored = materialize(opening.drain()[0]!, channel);
    const delivered = envelope(channel, "DELIVERED", 20 + CHANNELS.indexOf(channel));

    const restarted = createDeliveryHealthTracker([failed, delivered]);
    restarted.restore([restored]);
    expect(restarted.drain()).toEqual([expect.objectContaining({
      correlationKey: `delivery:${channel}`,
      state: "CLEARED",
      impactCode: "IMPACT_CLEARED",
      firstFailedProbeAt: new Date(failed.delivery.attempted_at),
      detectedAt: new Date(delivered.delivery.delivered_at!),
      suspectedDefect: false,
      defectKind: null
    })]);

    const module = createRoutingModule();
    const emitted: ObservationSignal[] = [];
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      replayedOpenSignals: [Object.freeze({
        signal: restored.signal,
        lifecycle: Object.freeze({ owner: "routing", correlationKey: `delivery:${channel}` })
      })],
      nextSequence: () => 100,
      nextSignalId: () => "77000000-0000-4000-8000-000000000900",
      sampleStore: { async write() {} },
      async emitSignal(signal) { emitted.push(signal); }
    });
    const stateDir = await scratch();
    const configuration = Object.freeze({ notify: {
      sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
      dev_capture_dir: "dev-mail-capture",
      from: "observation-agent@localhost",
      to: "ops@localhost"
    } });
    await module.router!.create({
      stateDir,
      repoRoot: process.cwd(),
      delivery: { async attempt() { throw new Error("not called"); } } as never,
      osascript: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
      moduleName: "routing",
      targetFragment: Object.freeze({
        basename: "OBS-07.json", targets: Object.freeze([]), configuration
      }),
      configuration,
      thresholds: Object.freeze({}),
      thresholdVersion: 7,
      deliveryResults: Object.freeze([failed, delivered])
    });
    await runtime.run({
      modules: [module], now: new Date(BASE + 30_000), timeoutMs: 2_000,
      database: {} as never, stateDir, repoRoot: process.cwd(), targets: [],
      targetFragments: [Object.freeze({
        basename: "OBS-07.json", targets: Object.freeze([]), configuration
      })],
      thresholdVersion: 7
    });
    expect(emitted).toEqual([expect.objectContaining({
      state: "CLEARED",
      clears_signal_id: restored.signal.signal_id
    })]);
  });

  it("treats MUTED and RATE_LIMITED as policy outcomes with no health transition", () => {
    const tracker = createDeliveryHealthTracker([
      envelope("osascript", "MUTED", 1),
      envelope("sendmail", "RATE_LIMITED", 2)
    ]);
    tracker.restore([]);
    expect(tracker.drain()).toEqual([]);
    tracker.record({ channel: "kanban", outcome: "MUTED", at: new Date(BASE + 3_000) });
    tracker.record({ channel: "kanban", outcome: "RATE_LIMITED", at: new Date(BASE + 4_000) });
    expect(tracker.drain()).toEqual([]);
  });

  it("keeps channel failures and recoveries independent", () => {
    const tracker = createDeliveryHealthTracker([]);
    tracker.restore([]);
    tracker.record({ channel: "osascript", outcome: "FAILED", at: new Date(BASE) });
    tracker.record({ channel: "kanban", outcome: "FAILED", at: new Date(BASE + 1_000) });
    const opened = tracker.drain();
    expect(opened.map((intent) => intent.correlationKey)).toEqual([
      "delivery:osascript", "delivery:kanban"
    ]);
    const restored = [
      materialize(opened[0]!, "osascript"),
      materialize(opened[1]!, "kanban")
    ];
    const restarted = createDeliveryHealthTracker([]);
    restarted.restore(restored);
    restarted.record({ channel: "osascript", outcome: "DELIVERED", at: new Date(BASE + 2_000) });
    expect(restarted.drain()).toEqual([
      expect.objectContaining({ correlationKey: "delivery:osascript", state: "CLEARED" })
    ]);
    restarted.record({ channel: "sendmail", outcome: "FAILED", at: new Date(BASE + 3_000) });
    expect(restarted.drain()).toEqual([
      expect.objectContaining({ correlationKey: "delivery:sendmail", state: "OPEN" })
    ]);
  });

  it("threads Task 3 RESULT replay through routing bootstrap before the next signals cycle", async () => {
    const failed = envelope("kanban", "FAILED", 4);
    const module = createRoutingModule();
    module.lifecycle!.restore([]);
    await module.router!.create({
      stateDir: await scratch(),
      repoRoot: process.cwd(),
      delivery: { async attempt() { throw new Error("not called"); } } as never,
      osascript: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
      moduleName: "routing",
      targetFragment: Object.freeze({
        basename: "OBS-07.json", targets: Object.freeze([]),
        configuration: Object.freeze({ notify: {
          sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
          dev_capture_dir: "dev-mail-capture",
          from: "observation-agent@localhost",
          to: "ops@localhost"
        } })
      }),
      configuration: Object.freeze({ notify: {
        sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
        dev_capture_dir: "dev-mail-capture",
        from: "observation-agent@localhost",
        to: "ops@localhost"
      } }),
      thresholds: Object.freeze({}),
      thresholdVersion: 7,
      deliveryResults: Object.freeze([failed])
    });
    expect(module.signals([], {
      now: new Date(BASE + 5_000), thresholdVersion: 7,
      targetFragment: null, configuration: {}, thresholds: {}
    })).toEqual([expect.objectContaining({
      correlationKey: "delivery:kanban", state: "OPEN", suspectedDefect: false
    })]);
  });

  it("calls the result hook only after each channel RESULT is durable and never self-routes DEGRADED", async () => {
    const stateDir = await scratch();
    const journal = new ObservationJournal(stateDir);
    const callbacks: string[] = [];
    const router = await createObservationSignalRouter({
      stateDir,
      delivery: new DeliveryCoordinator({
        journal,
        mirror: { async mirrorDelivery() {} }
      }),
      executors: Object.fromEntries(CHANNELS.map((channel) => [channel,
        async (_signal: unknown, now: Date) => ({ deliveredAt: now, externalRef: null })
      ])) as never,
      configuration: {}, thresholds: {}, thresholdVersion: 7,
      async onChannelResult(channel, outcome, at) {
        const rows = (await readFile(
          join(stateDir, "journal", `deliveries-${at.toISOString().slice(0, 10)}.jsonl`), "utf8"
        )).trim().split("\n").map((line) => JSON.parse(line));
        expect(rows.some((row) => row.kind === "RESULT"
          && row.delivery.channel === channel
          && row.delivery.outcome === outcome)).toBe(true);
        expect(rows.findLast((row) => row.kind === "RESULT"
          && row.delivery.channel === channel)).toMatchObject({
          kind: "RESULT", delivery: { channel, outcome }
        });
        callbacks.push(`${channel}:${outcome}`);
      }
    });
    const fatal = signalSchema.parse({
      seq: 1, signal_id: "77000000-0000-4000-8000-000000000798", state: "OPEN",
      class: "INFRA_DOWN", component: "hatchet", severity: "FATAL",
      impact_code: "IMPACT_HATCHET_DOWN", first_failed_probe_at: new Date(BASE).toISOString(),
      detected_at: new Date(BASE).toISOString(),
      evidence: { probe: "http_get", last_status: "FAILED" },
      suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
      threshold_version: 7, clears_signal_id: null, recorded_at: new Date(BASE).toISOString()
    });
    const context = {
      now: new Date(BASE), mute: null,
      policy: { rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 },
      module: { thresholdVersion: 7, thresholds: {} }
    } as const;
    await router.onSignal({ signal: fatal, ...context });
    expect(callbacks).toEqual(expect.arrayContaining([
      "osascript:DELIVERED", "sendmail:DELIVERED", "kanban:DELIVERED"
    ]));
    expect(callbacks).toHaveLength(3);

    const deliveryHealth = signalSchema.parse({
      seq: 2, signal_id: "77000000-0000-4000-8000-000000000799", state: "OPEN",
      class: "AGENT_SELF", component: "observation_agent", severity: "DEGRADED",
      impact_code: "IMPACT_AGENT_DELIVERY", first_failed_probe_at: new Date(BASE).toISOString(),
      detected_at: new Date(BASE).toISOString(),
      evidence: { reason: "DELIVERY_FAILURE", channel: "kanban" },
      suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
      threshold_version: 7, clears_signal_id: null, recorded_at: new Date(BASE).toISOString()
    });
    await router.onSignal({ signal: deliveryHealth, ...context });
    expect(callbacks).toHaveLength(3);
  });

  it("migrates the exact pre-upgrade sendmail owner and clears its UUID across a second replay", async () => {
    const stateDir = await scratch();
    const journal = new ObservationJournal(stateDir);
    const failed = envelope("sendmail", "FAILED", 1);
    const opening = createDeliveryHealthTracker([failed]);
    opening.restore([]);
    const restored = materialize(opening.drain()[0]!, "sendmail");
    await journal.appendSignal(restored.signal, Object.freeze({
      owner: "channels-sendmail", correlationKey: "sendmail-failure"
    }));
    await journal.appendDeliveryResult(failed);
    const signalJournalPath = join(stateDir, "journal", "signals-2026-09-06.jsonl");
    const historicalBytes = await readFile(signalJournalPath);

    const validOwners = new Set(["routing", "channels-sendmail"]);
    const failedReplay = await replayObservationJournals(stateDir, validOwners);
    expect(await readFile(signalJournalPath)).toEqual(historicalBytes);
    expect(failedReplay.openSignals).toEqual([expect.objectContaining({
      signal: expect.objectContaining({ signal_id: restored.signal.signal_id }),
      lifecycle: { owner: "routing", correlationKey: "delivery:sendmail" }
    })]);
    const failedModule = createRoutingModule();
    const failedEmitted: ObservationSignal[] = [];
    const failedRuntime = new ObservationModuleRuntime({
      modules: [failedModule], replayedOpenSignals: failedReplay.openSignals,
      nextSequence: () => 100,
      nextSignalId: () => "77000000-0000-4000-8000-000000000910",
      sampleStore: { async write() {} },
      async emitSignal(signal) { failedEmitted.push(signal); }
    });
    await initializeRoutingModule(failedModule, stateDir, failedReplay.deliveryResults);
    await failedRuntime.run(runtimeInput(failedModule, stateDir, new Date(BASE + 10_000)));
    expect(failedEmitted).toEqual([]);

    const delivered = envelope("sendmail", "DELIVERED", 20);
    await journal.appendDeliveryResult(delivered);
    const deliveredReplay = await replayObservationJournals(stateDir, validOwners);
    const deliveredModule = createRoutingModule();
    const deliveredEmitted: Array<Readonly<{
      signal: ObservationSignal;
      lifecycle: Readonly<{ owner: string; correlationKey: string }>;
    }>> = [];
    const deliveredRuntime = new ObservationModuleRuntime({
      modules: [deliveredModule], replayedOpenSignals: deliveredReplay.openSignals,
      nextSequence: () => 101,
      nextSignalId: () => "77000000-0000-4000-8000-000000000911",
      sampleStore: { async write() {} },
      async emitSignal(signal, _now, lifecycle) {
        deliveredEmitted.push({ signal, lifecycle });
        await journal.appendSignal(signal, lifecycle);
      }
    });
    await initializeRoutingModule(deliveredModule, stateDir, deliveredReplay.deliveryResults);
    await deliveredRuntime.run(runtimeInput(
      deliveredModule,
      stateDir,
      new Date(delivered.delivery.delivered_at!)
    ));
    expect(deliveredEmitted).toEqual([expect.objectContaining({
      signal: expect.objectContaining({
        state: "CLEARED", clears_signal_id: restored.signal.signal_id
      }),
      lifecycle: { owner: "routing", correlationKey: "delivery:sendmail" }
    })]);

    const secondReplay = await replayObservationJournals(stateDir, validOwners);
    expect(secondReplay.openSignals).toEqual([]);
  });

  it.each(["wrong-owner", "wrong-key", "wrong-shape", "ambiguous"] as const)(
    "rejects malformed pre-upgrade sendmail ownership: %s",
    async (variant) => {
      const stateDir = await scratch();
      const journal = new ObservationJournal(stateDir);
      const failed = envelope("sendmail", "FAILED", 30);
      const opening = createDeliveryHealthTracker([failed]);
      opening.restore([]);
      const restored = materialize(opening.drain()[0]!, "sendmail");
      const legacySignal = variant === "wrong-shape"
        ? signalSchema.parse({ ...restored.signal, evidence: {
            reason: "DELIVERY_FAILURE", channel: "kanban"
          } })
        : restored.signal;
      await journal.appendSignal(legacySignal, Object.freeze({
        owner: variant === "wrong-owner" ? "channels-sendmai" : "channels-sendmail",
        correlationKey: variant === "wrong-key" ? "delivery:sendmail" : "sendmail-failure"
      }));
      if (variant === "ambiguous") {
        await journal.appendSignal(signalSchema.parse({
          ...restored.signal,
          seq: restored.signal.seq + 100,
          signal_id: "77000000-0000-4000-8000-000000000912"
        }), Object.freeze({ owner: "routing", correlationKey: "delivery:sendmail" }));
      }
      await expect(replayObservationJournals(
        stateDir,
        new Set(["routing", "channels-sendmail"])
      )).rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
    }
  );

  it("normalizes an exact historical linked clear and rejects a legacy cross-link", async () => {
    const writePair = async (crossLink: boolean): Promise<string> => {
      const stateDir = await scratch();
      const journal = new ObservationJournal(stateDir);
      const failed = envelope("sendmail", "FAILED", crossLink ? 40 : 50);
      const opening = createDeliveryHealthTracker([failed]);
      opening.restore([]);
      const restored = materialize(opening.drain()[0]!, "sendmail");
      await journal.appendSignal(restored.signal, Object.freeze({
        owner: crossLink ? "routing" : "channels-sendmail",
        correlationKey: crossLink ? "delivery:sendmail" : "sendmail-failure"
      }));
      const clearedAt = new Date(Date.parse(restored.signal.detected_at) + 5_000);
      await journal.appendSignal(signalSchema.parse({
        ...restored.signal,
        seq: restored.signal.seq + 1,
        signal_id: crossLink
          ? "77000000-0000-4000-8000-000000000913"
          : "77000000-0000-4000-8000-000000000914",
        state: "CLEARED",
        impact_code: "IMPACT_CLEARED",
        detected_at: clearedAt.toISOString(),
        evidence: { duration_seconds: 5 },
        clears_signal_id: restored.signal.signal_id,
        recorded_at: clearedAt.toISOString()
      }), Object.freeze({ owner: "channels-sendmail", correlationKey: "sendmail-failure" }));
      return stateDir;
    };

    const historical = await writePair(false);
    await expect(replayObservationJournals(
      historical,
      new Set(["routing", "channels-sendmail"])
    )).resolves.toMatchObject({ openSignals: [] });

    const crossLinked = await writePair(true);
    await expect(replayObservationJournals(
      crossLinked,
      new Set(["routing", "channels-sendmail"])
    )).rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });
});
