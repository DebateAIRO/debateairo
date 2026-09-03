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
});
