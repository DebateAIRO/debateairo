import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-journal-"));
  scratchDirectories.push(path);
  return path;
}

function openSignal(seq = 1): Record<string, unknown> {
  return {
    seq,
    signal_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    state: "OPEN",
    class: "INFRA_DOWN",
    component: "hatchet",
    severity: "FATAL",
    impact_code: "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: "2026-09-03T07:00:00.000Z",
    detected_at: "2026-09-03T07:00:05.000Z",
    evidence: {
      probe: "http_get",
      target: "http://127.0.0.1:8888/api/live",
      consecutive_failures: 2,
      threshold: 2,
      last_status: 0,
      container_status: "exited",
      restart_policy: "no",
      exit_code: 0
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: null,
    recorded_at: "2026-09-03T07:00:05.000Z"
  };
}

describe("OBS-01 typed durable journal", () => {
  it("accepts the exact signal shape and rejects hostile evidence or extra fields", async () => {
    const { signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    expect(signalSchema.parse(openSignal())).toEqual(openSignal());
    expect(() => signalSchema.parse({
      ...openSignal(),
      evidence: { ...openSignal().evidence as object, message: "private debate text" }
    })).toThrow();
    expect(() => signalSchema.parse({ ...openSignal(), free_text: "private debate text" })).toThrow();
  });

  it("accepts each frozen Q2 evidence family and rejects wrong class/impact evidence", async () => {
    const { renderImpact, signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const timestamp = "2026-09-03T07:00:00.000Z";
    const fixtures: ReadonlyArray<Readonly<{
      class: string;
      impact_code: string;
      evidence: Readonly<Record<string, unknown>>;
    }>> = [
      {
        class: "INFRA_DOWN", impact_code: "IMPACT_DEV_STACK_EXITED",
        evidence: {
          probe: "expected_set", members: ["api", "ui", "tls_front_door", "runner"],
          consecutive_failures: 2, threshold: 2, last_status: "FAILED"
        }
      },
      {
        class: "RESTART_WITNESSED", impact_code: "IMPACT_RESTART",
        evidence: { old_started_at: timestamp, new_started_at: "2026-09-03T07:01:00.000Z" }
      },
      {
        class: "EXPECTED_ABSENT", impact_code: "IMPACT_EXPECTED_ABSENT",
        evidence: { expected: "always", absent_for_s: 60 }
      },
      {
        class: "THROUGHPUT_ANOMALY", impact_code: "IMPACT_SLOW",
        evidence: { p95_ms: 501, threshold_ms: 500 }
      },
      {
        class: "SCHEDULE_MISSED", impact_code: "IMPACT_SCHEDULE_MISSED",
        evidence: { job: "replay-self-test", cadence_s: 3_600, grace_s: 60 }
      },
      {
        class: "WORKER_LOST", impact_code: "IMPACT_WORKER_LOST",
        evidence: {
          worker_ref: "debateai-dev-runner", heartbeat_age_s: 31,
          heartbeat_threshold_s: 30, health: "STALE"
        }
      },
      {
        class: "STALL", impact_code: "IMPACT_STALL",
        evidence: {
          count: 1, state: "CLAIMED", claim_deadline: timestamp, grace_s: 15,
          health: "HEALTHY"
        }
      },
      {
        class: "QUEUE_NOT_DRAINING", impact_code: "IMPACT_QUEUE",
        evidence: {
          state: "READY", ready_age_s: 121, ready_threshold_s: 120,
          health: "HEALTHY"
        }
      },
      {
        class: "NO_PROGRESS", impact_code: "IMPACT_NO_PROGRESS",
        evidence: {
          count: 1, last_progress_seq: 42, silence_s: 301,
          silence_threshold_s: 300, health: "HEALTHY"
        }
      },
      {
        class: "SUSPICIOUS_SUCCESS", impact_code: "IMPACT_SUSPICIOUS_SUCCESS",
        evidence: { count: 1, state: "DONE", artifact_present: false, health: "HEALTHY" }
      },
      {
        class: "BLIND_PERIOD", impact_code: "IMPACT_BLIND",
        evidence: {
          runtime: "runner", last_flush_ok_at: timestamp, silence_s: 121,
          threshold_s: 120, health: "WIRED_SILENT"
        }
      },
      {
        class: "CAPTURE_GAP", impact_code: "IMPACT_CAPTURE_GAP",
        evidence: {
          source: "runner", gap_class: "QUEUE_FULL", lost_count: 7,
          opened_at: timestamp, closed_at: null
        }
      },
      {
        class: "CAPTURE_NOT_WIRED", impact_code: "IMPACT_CAPTURE_NOT_WIRED",
        evidence: { runtime: "runner", flush_ok_count: 0, health: "NOT_WIRED" }
      },
      {
        class: "SPOOL_STRANDED", impact_code: "IMPACT_SPOOL_STRANDED",
        evidence: {
          runtime: "runner", spool_ref: "runner-42-20000000-0000-4000-8000-000000000042.spool",
          spool_age_s: 601, threshold_s: 600, receipt_present: false
        }
      },
      {
        class: "CAPACITY", impact_code: "IMPACT_PG_CAPACITY",
        evidence: { used: 81, max: 100, percent: 81, threshold_percent: 80, unit: "connections" }
      },
      {
        class: "CAPACITY", impact_code: "IMPACT_PG_LOCKS",
        evidence: { count: 1, duration_seconds: 61, threshold_seconds: 60, unit: "sessions" }
      },
      {
        class: "CAPACITY", impact_code: "IMPACT_PG_LONG_XACT",
        evidence: { duration_seconds: 301, threshold_seconds: 300, unit: "seconds" }
      },
      {
        class: "CAPACITY", impact_code: "IMPACT_DISK",
        evidence: { percent: 14.5, threshold_percent: 15, free_bytes: 1_000, total_bytes: 10_000, unit: "bytes" }
      },
      {
        class: "CAPACITY", impact_code: "IMPACT_MEMORY",
        evidence: { percent: 9.5, threshold_percent: 10, available_bytes: 1_000, total_bytes: 10_000, unit: "bytes" }
      },
      {
        class: "THROUGHPUT_ANOMALY", impact_code: "IMPACT_HATCHET_QUEUE",
        evidence: { count: 10, duration_seconds: 300 }
      },
      {
        class: "THROUGHPUT_ANOMALY", impact_code: "IMPACT_HATCHET_FAILED_TASKS",
        evidence: { failed: 3, window_minutes: 15 }
      },
      {
        class: "THROUGHPUT_ANOMALY", impact_code: "IMPACT_HATCHET_DISPATCH_SLOW",
        evidence: { p95_seconds: 31, window_minutes: 5 }
      },
      {
        class: "THROUGHPUT_ANOMALY", impact_code: "IMPACT_RUN_FAILURE",
        evidence: { failed: 3, total: 4, ratio: 0.75, threshold_ratio: 0.5, window_minutes: 60 }
      },
      {
        class: "PROVIDER_DEGRADED", impact_code: "IMPACT_PROVIDER",
        evidence: {
          provider_ref: "openai", failed: 5, total: 10, ratio: 0.5, window_started_at: timestamp,
          window_ended_at: "2026-09-03T07:05:00.000Z"
        }
      },
      {
        class: "CERT_EXPIRY", impact_code: "IMPACT_CERT",
        evidence: { days: 3, threshold_days: 3, not_after: timestamp, unit: "days" }
      }
    ];

    for (const [index, fixture] of fixtures.entries()) {
      expect(() => signalSchema.parse({
        ...openSignal(index + 100),
        class: fixture.class,
        impact_code: fixture.impact_code,
        component: fixture.class === "CERT_EXPIRY" ? "tls_front_door" : "hatchet",
        evidence: fixture.evidence,
        suspected_defect: ["STALL", "QUEUE_NOT_DRAINING", "NO_PROGRESS", "SUSPICIOUS_SUCCESS"]
          .includes(fixture.class),
        defect_kind: fixture.class === "NO_PROGRESS" ? "SILENT_NOOP"
          : fixture.class === "SUSPICIOUS_SUCCESS" ? "SUSPICIOUS_SUCCESS"
            : ["STALL", "QUEUE_NOT_DRAINING"].includes(fixture.class) ? "STALL_DETECTED" : null
      })).not.toThrow();
    }

    expect(renderImpact({
      ...openSignal(199),
      class: "PROVIDER_DEGRADED",
      impact_code: "IMPACT_PROVIDER",
      evidence: {
        provider_ref: "openai", failed: 5, total: 10, ratio: 0.5,
        window_started_at: timestamp, window_ended_at: "2026-09-03T07:05:00.000Z"
      }
    })).toBe("Provider openai failed 50% of its last 10 calls: debates stall or die on it.");

    expect(() => signalSchema.parse({
      ...openSignal(200),
      class: "CAPACITY",
      impact_code: "IMPACT_PROVIDER",
      evidence: fixtures.at(-1)?.evidence
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...openSignal(201),
      class: "THROUGHPUT_ANOMALY",
      impact_code: "IMPACT_SLOW",
      evidence: {
        metric_key: "probe.api.latency_ms", p95_ms: Number.NaN, threshold_ms: 500,
        window_minutes: 5, observed_at: timestamp
      }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...openSignal(202),
      class: "THROUGHPUT_ANOMALY",
      impact_code: "IMPACT_SLOW",
      evidence: {
        metric_key: "probe.api.latency_ms", p95_ms: 501, threshold_ms: 500,
        window_minutes: 5, observed_at: timestamp, product_text: "private debate text"
      }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
  });

  it("accepts only measured used/max Postgres connection evidence and renders those values", async () => {
    const { renderImpact, signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const measured = {
      ...openSignal(203),
      class: "CAPACITY",
      component: "postgres",
      severity: "SEVERE",
      impact_code: "IMPACT_PG_CAPACITY",
      evidence: {
        used: 31,
        max: 100,
        percent: 31,
        threshold_percent: 20,
        unit: "connections"
      }
    };
    expect(() => signalSchema.parse(measured)).not.toThrow();
    expect(renderImpact(measured)).toBe(
      "Postgres is at 31/100 connections: new requests fail when the limit is reached."
    );
    expect(() => signalSchema.parse({
      ...measured,
      evidence: {
        count: 31,
        limit: 100,
        percent: 31,
        threshold_percent: 20,
        unit: "connections"
      }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...measured,
      evidence: {
        used: 31,
        max: 100,
        count: 31,
        limit: 100,
        percent: 31,
        threshold_percent: 20,
        unit: "connections"
      }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...measured,
      state: "CLEARED",
      impact_code: "IMPACT_CLEARED",
      evidence: { duration_seconds: 30 },
      clears_signal_id: "00000000-0000-4000-8000-000000000203"
    })).not.toThrow();
    expect(() => signalSchema.parse({
      ...measured,
      state: "CLEARED",
      impact_code: "IMPACT_CLEARED",
      evidence: {
        count: 31,
        limit: 100,
        percent: 31,
        threshold_percent: 20,
        unit: "connections",
        duration_seconds: 30
      },
      clears_signal_id: "00000000-0000-4000-8000-000000000203"
    })).not.toThrow();
  });

  it("accepts only non-defect AGENT_SELF delivery failures and renders fixed channel copy", async () => {
    const { renderImpact, signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const deliveryFailure = (channel: "osascript" | "sendmail" | "kanban") => ({
      ...openSignal(204),
      class: "AGENT_SELF",
      component: "observation_agent",
      severity: "DEGRADED",
      impact_code: "IMPACT_AGENT_DELIVERY",
      first_failed_probe_at: null,
      evidence: { reason: "DELIVERY_FAILURE", channel }
    });

    for (const channel of ["osascript", "sendmail", "kanban"] as const) {
      const signal = deliveryFailure(channel);
      expect(() => signalSchema.parse(signal)).not.toThrow();
      expect(renderImpact(signal)).toBe(
        `ObservationAgent could not deliver through ${channel}: the signal remains stored and other channels continue.`
      );
    }

    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      evidence: { reason: "DELIVERY_FAILURE", channel: "webhook" }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      evidence: {
        reason: "DELIVERY_FAILURE", channel: "sendmail",
        error: "raw failure", message: "raw failure", payload: { private: true }
      }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      suspected_defect: true,
      defect_kind: "STALL_DETECTED"
    })).toThrow("OBSERVATION_DEFECT_KIND_INVALID");
    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      class: "INFRA_DOWN"
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      evidence: { reason: "JOURNAL_FAILURE", channel: "sendmail" }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
    expect(() => signalSchema.parse({
      ...deliveryFailure("sendmail"),
      evidence: { reason: "DELIVERY_FAILURE" }
    })).toThrow("OBSERVATION_EVIDENCE_INVALID");
  });

  it("fsyncs one JSON line before a mirror can observe the signal", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { persistSignal } = await import(
      "../../apps/observation-agent/src/store/pipeline.js"
    );
    const journal = new ObservationJournal(stateDir);
    const signal = openSignal();
    let mirrorSawDurableLine = false;
    const result = await persistSignal({
      signal,
      journal,
      mirror: {
        async mirrorSignal() {
          const source = await readFile(
            join(stateDir, "journal", "signals-2026-09-03.jsonl"), "utf8"
          );
          mirrorSawDurableLine = source === `${JSON.stringify(signal)}\n`;
          if (!mirrorSawDurableLine) throw new Error("MIRROR_BEFORE_JOURNAL");
        }
      }
    });
    expect(result).toEqual({ mirrored: true });
    expect(mirrorSawDurableLine).toBe(true);
  });

  it("keeps the durable line when the Postgres mirror is unavailable", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { persistSignal } = await import(
      "../../apps/observation-agent/src/store/pipeline.js"
    );
    const result = await persistSignal({
      signal: openSignal(),
      journal: new ObservationJournal(stateDir),
      mirror: { async mirrorSignal() { throw new Error("postgres down"); } }
    });
    expect(result).toEqual({ mirrored: false });
    expect((await readFile(
      join(stateDir, "journal", "signals-2026-09-03.jsonl"), "utf8"
    )).trim()).toBe(JSON.stringify(openSignal()));
  });

  it("derives the previous run exit reason from durable lifecycle signals", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { makeSelfSignal } = await import(
      "../../apps/observation-agent/src/modules/self/signals.js"
    );
    const journal = new ObservationJournal(stateDir);
    expect(await journal.previousRunExitReason()).toBe("UNKNOWN");
    await journal.appendSignal(makeSelfSignal({
      seq: 10,
      signalId: "10000000-0000-4000-8000-000000000010",
      now: new Date("2026-09-03T09:00:00.000Z"),
      thresholdVersion: 1,
      event: "START"
    }));
    await journal.appendSignal(openSignal(11));
    expect(await journal.previousRunExitReason()).toBe("UNCLEAN");
    await journal.appendSignal(makeSelfSignal({
      seq: 12,
      signalId: "10000000-0000-4000-8000-000000000012",
      now: new Date("2026-09-03T09:01:00.000Z"),
      thresholdVersion: 1,
      event: "STOP"
    }));
    expect(await journal.previousRunExitReason()).toBe("CLEAN");
  });

  it("writes the exact digest line and atomically replaces status.json", async () => {
    const stateDir = await scratch();
    const { appendDigest } = await import(
      "../../apps/observation-agent/src/notify/digest.js"
    );
    const { writeStatusSnapshot } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    await appendDigest(stateDir, openSignal());
    expect(await readFile(join(stateDir, "digest", "2026-09-03.md"), "utf8")).toBe(
      "07:00:05Z · FATAL · hatchet · INFRA_DOWN · Hatchet is down: asks are accepted but no debate work is dispatched or run. · 00000000-0000-4000-8000-000000000001\n"
    );
    const snapshot = {
      pid: 4321,
      version: "0.1.0",
      thresholds_version: 1,
      mute: null,
      components: {
        hatchet: {
          state: "DOWN",
          last_probe_at: "2026-09-03T07:00:05.000Z",
          last_ok_at: null,
          open_signal_ids: ["00000000-0000-4000-8000-000000000001"]
        }
      }
    } as const;
    await writeStatusSnapshot(stateDir, snapshot);
    expect(JSON.parse(await readFile(join(stateDir, "status.json"), "utf8"))).toEqual(snapshot);
    expect((await readdir(stateDir)).filter((name) => name.includes("status.json."))).toEqual([]);
  });

  it("stores bounded module status projections without weakening component status", async () => {
    const stateDir = await scratch();
    const { writeStatusSnapshot } = await import(
      "../../apps/observation-agent/src/store/status.js"
    );
    const snapshot = {
      pid: 4321,
      version: "0.1.0",
      thresholds_version: 2,
      mute: null,
      components: {
        dev_stack: {
          state: "NOT_RUNNING",
          last_probe_at: "2026-09-03T07:00:05.000Z",
          last_ok_at: null,
          open_signal_ids: []
        }
      },
      modules: {
        "product-liveness": [
          {
            kind: "template",
            key: "evaluator_worker",
            template: "EVALUATOR_UNBOUND_BY_REGISTER"
          },
          {
            kind: "metric",
            key: "probe.api.latency_ms",
            value: 501,
            unit: "MILLISECONDS",
            observed_at: "2026-09-03T07:00:05.000Z"
          }
        ]
      }
    } as const;
    await writeStatusSnapshot(stateDir, snapshot);
    expect(JSON.parse(await readFile(join(stateDir, "status.json"), "utf8"))).toEqual(snapshot);

    await expect(writeStatusSnapshot(stateDir, {
      ...snapshot,
      modules: {
        "product-liveness": [{
          kind: "metric", key: "probe.api.latency_ms", value: Number.NaN,
          unit: "MILLISECONDS", observed_at: null
        }]
      }
    })).rejects.toThrow();
    await expect(writeStatusSnapshot(stateDir, {
      ...snapshot,
      modules: {
        "product-liveness": [{
          kind: "template", key: "evaluator_worker",
          template: "EVALUATOR_UNBOUND_BY_REGISTER", text: "private debate text"
        }]
      }
    })).rejects.toThrow();
  });
});
