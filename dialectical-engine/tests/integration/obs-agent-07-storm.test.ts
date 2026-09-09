import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { createObservationSignalRouter } from "../../apps/observation-agent/src/modules/routing/router.js";
import { appendStormDigest } from "../../apps/observation-agent/src/modules/routing/storm-digest.js";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-storm-"));
  scratchDirectories.push(path);
  return path;
}

const components = ["ui", "api", "hatchet", "postgres", "tls_front_door"] as const;
type FixtureComponent = typeof components[number] | "docker";

function opened(component: FixtureComponent, index: number): ObservationSignal {
  const detected = new Date(Date.parse("2026-09-05T12:00:00.000Z") + index * 10_000).toISOString();
  const impact = component === "docker" ? "IMPACT_DOCKER_DOWN"
    : component === "postgres" ? "IMPACT_PG_DOWN"
    : component === "api" ? "IMPACT_API_DOWN"
      : component === "ui" ? "IMPACT_UI_DOWN"
        : component === "tls_front_door" ? "IMPACT_TLS_DOWN" : "IMPACT_HATCHET_DOWN";
  return signalSchema.parse({
    seq: 7_500 + index,
    signal_id: `70000000-0000-4000-8000-${String(7_500 + index).padStart(12, "0")}`,
    state: "OPEN", class: "INFRA_DOWN", component, severity: "FATAL", impact_code: impact,
    first_failed_probe_at: detected, detected_at: detected,
    evidence: { probe: "http_get", last_status: "FAILED" }, suspected_defect: false,
    defect_kind: null, run_ref: null, work_item_ref: null, threshold_version: 7,
    clears_signal_id: null, recorded_at: detected
  });
}

function cleared(open: ObservationSignal, index: number): ObservationSignal {
  const detected = new Date(Date.parse("2026-09-05T12:01:01.000Z") + index * 1_000).toISOString();
  return signalSchema.parse({
    seq: 7_600 + index,
    signal_id: `70000000-0000-4000-8000-${String(7_600 + index).padStart(12, "0")}`,
    state: "CLEARED", class: open.class, component: open.component, severity: open.severity,
    impact_code: "IMPACT_CLEARED", first_failed_probe_at: open.first_failed_probe_at,
    detected_at: detected, evidence: { duration_seconds: 61 + index }, suspected_defect: false,
    defect_kind: null, run_ref: null, work_item_ref: null, threshold_version: 7,
    clears_signal_id: open.signal_id, recorded_at: detected
  });
}

const policy = Object.freeze({ rateLimitMs: 600_000, degradedAfterMs: 900_000, timeoutMs: 2_000 });
const moduleContext = Object.freeze({ thresholdVersion: 7, thresholds: Object.freeze({
  storm_count: 5, storm_window_s: 60, escalation_interval_ms: 1_800_000, fatal_resend_max: 3
}) });

async function fixtureRouter(stateDir: string, records: {
  actions: Array<Readonly<{ signalId: string; channel: string; disposition: string }>>;
  normalBanners: string[];
  summaries: Array<Readonly<{ root: string; count: number; deliveredAt: Date }>>;
}) {
  return createObservationSignalRouter({
    stateDir,
    delivery: { async attempt(action) {
      records.actions.push({
        signalId: action.signal.signal_id, channel: action.channel, disposition: action.disposition
      });
      const result = action.disposition === "EXECUTE" ? await action.execute!() : null;
      return Object.freeze({
        delivery_id: crypto.randomUUID(), signal_id: action.signal.signal_id,
        channel: action.channel, attempted_at: action.now.toISOString(),
        delivered_at: result?.deliveredAt.toISOString() ?? null,
        outcome: action.disposition === "EXECUTE" ? "DELIVERED" : action.disposition,
        external_ref: result?.externalRef ?? null
      });
    } },
    executors: {
      osascript: async (signal, now) => {
        records.normalBanners.push(signal.signal_id);
        return { deliveredAt: now, externalRef: null };
      },
      sendmail: async (_signal, now) => ({ deliveredAt: now, externalRef: null }),
      kanban: async (signal, now) => ({ deliveredAt: now, externalRef: `ticket-${signal.seq}` })
    },
    stormSummary: async (root, count, now) => {
      const deliveredAt = new Date(now.getTime() + 14_000);
      records.summaries.push({ root, count, deliveredAt });
      return { deliveredAt, externalRef: null };
    },
    configuration: Object.freeze({ notify: Object.freeze({ dev_capture_dir: "dev-mail-capture" }) }),
    thresholds: moduleContext.thresholds,
    thresholdVersion: 7
  });
}

describe("OBS-07 storm routing", () => {
  it("stores five-member root/clock, emits one summary, and preserves ticket/email routing", async () => {
    const stateDir = await scratch();
    const records = { actions: [] as Array<Readonly<{ signalId: string; channel: string; disposition: string }>>,
      normalBanners: [] as string[],
      summaries: [] as Array<Readonly<{ root: string; count: number; deliveredAt: Date }>> };
    const router = await fixtureRouter(stateDir, records);
    const signals = components.map(opened);
    for (const signal of signals) {
      await router.onSignal({ signal, now: new Date(signal.detected_at), policy, mute: null, module: moduleContext });
    }
    await router.onSignal({
      signal: signals[4]!, now: new Date(signals[4]!.detected_at), policy, mute: null, module: moduleContext
    });

    expect(records.normalBanners).toEqual(signals.slice(0, 4).map(({ signal_id }) => signal_id));
    expect(records.summaries).toEqual([{
      root: "postgres", count: 5, deliveredAt: new Date("2026-09-05T12:00:54.000Z")
    }]);
    expect(records.actions.filter(({ channel, disposition }) =>
      channel === "sendmail" && disposition === "EXECUTE")).toHaveLength(5);
    expect(records.actions.filter(({ channel, disposition }) =>
      channel === "kanban" && disposition === "EXECUTE")).toHaveLength(5);
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "state", key: "storm.state", state: "STORM_SUMMARY_SENT" }),
      expect.objectContaining({ kind: "component", key: "storm.root", component: "postgres" }),
      expect.objectContaining({ kind: "metric", key: "storm.members", value: 5, unit: "COUNT" }),
      expect.objectContaining({ kind: "timestamp", key: "storm.fifth_detected_at",
        value: new Date("2026-09-05T12:00:40.000Z") }),
      expect.objectContaining({ kind: "metric", key: "storm.summary_delay", value: 14, unit: "SECONDS" })
    ]));
    await appendStormDigest(stateDir, {
      root: "postgres", count: 5, fifthDetectedAt: signals[4]!.detected_at,
      summarySignalId: signals[4]!.signal_id
    });
    const digest = await readFile(join(stateDir, "digest", "2026-09-05.md"), "utf8");
    expect(digest.match(/storm root postgres · storm members 5/gu)).toHaveLength(1);
  });

  it("keeps four QUIET, suppresses fifth/later individual banners, and returns QUIET after recovery", async () => {
    const stateDir = await scratch();
    const records = { actions: [] as Array<Readonly<{ signalId: string; channel: string; disposition: string }>>,
      normalBanners: [] as string[],
      summaries: [] as Array<Readonly<{ root: string; count: number; deliveredAt: Date }>> };
    const router = await fixtureRouter(stateDir, records);
    const signals = components.map(opened);
    for (const signal of signals.slice(0, 4)) {
      await router.onSignal({ signal, now: new Date(signal.detected_at), policy, mute: null, module: moduleContext });
    }
    expect(records.summaries).toEqual([]);
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "state", key: "storm.state", state: "QUIET" })
    ]));
    await router.onSignal({
      signal: signals[4]!, now: new Date(signals[4]!.detected_at), policy, mute: null, module: moduleContext
    });
    const later = opened("docker", 5);
    await router.onSignal({ signal: later, now: new Date("2026-09-05T12:00:50.000Z"),
      policy, mute: null, module: moduleContext });
    expect(records.normalBanners).toHaveLength(4);
    for (const [index, signal] of [...signals, later].entries()) {
      const clear = cleared(signal, index);
      await router.onSignal({ signal: clear, now: new Date(clear.detected_at),
        policy, mute: null, module: moduleContext });
    }
    await router.onTick({ now: new Date("2026-09-05T12:02:00.000Z"), policy, mute: null, module: moduleContext });
    expect(router.status()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "state", key: "storm.state", state: "QUIET" })
    ]));
  });
});
