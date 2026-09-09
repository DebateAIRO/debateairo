import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, {
    recursive: true, force: true
  })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-01-journal-replay-"));
  scratchDirectories.push(path);
  return path;
}

function signal(input: Readonly<{
  seq: number;
  id: string;
  component?: "hatchet" | "postgres" | "docker";
  state?: "OPEN" | "CLEARED";
  clears?: string | null;
  class?: "INFRA_DOWN" | "INFRA_NOT_READY";
}>): Record<string, unknown> {
  const component = input.component ?? "hatchet";
  const state = input.state ?? "OPEN";
  const signalClass = input.class ?? "INFRA_DOWN";
  const impact = component === "postgres" ? "IMPACT_PG_DOWN"
    : component === "docker" ? "IMPACT_DOCKER_DOWN" : "IMPACT_HATCHET_DOWN";
  return {
    seq: input.seq,
    signal_id: input.id,
    state,
    class: signalClass,
    component,
    severity: "FATAL",
    impact_code: state === "CLEARED" ? "IMPACT_CLEARED" : impact,
    first_failed_probe_at: "2026-09-03T07:00:00.000Z",
    detected_at: `2026-09-0${input.seq}T07:00:05.000Z`,
    evidence: state === "CLEARED"
      ? { duration_seconds: 5 }
      : {
          probe: component === "docker" ? "docker_info" : "tcp+select1",
          target: component === "docker" ? "docker" : `${component}:5432`,
          consecutive_failures: 2,
          threshold: 2,
          last_status: 0
        },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: input.clears ?? null,
    recorded_at: `2026-09-0${input.seq}T07:00:05.000Z`
  };
}

function v2(
  row: unknown,
  lifecycle: null | Readonly<{ owner: string; correlation_key: string }>
): Record<string, unknown> {
  return { record_version: 2, kind: "signal", signal: row, lifecycle };
}

async function writeRows(
  stateDir: string,
  name: string,
  rows: readonly (unknown | string)[],
  finalNewline = true
): Promise<void> {
  const directory = join(stateDir, "journal");
  await mkdir(directory, { recursive: true });
  const source = rows.map((row) => typeof row === "string" ? row : JSON.stringify(row)).join("\n")
    + (finalNewline ? "\n" : "");
  await writeFile(join(directory, name), source, "utf8");
}

const LEGACY_ID = "70000000-0000-4000-8000-000000000001";
const V2_ID = "70000000-0000-4000-8000-000000000002";
const CLEAR_ID = "70000000-0000-4000-8000-000000000003";

describe("OBS-01 signal and delivery journal replay", () => {
  it("keeps producer one-shots out of live indexes while retaining a real lifecycle open", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const { makeSelfSignal, makeThresholdChangedSignal } = await import(
      "../../apps/observation-agent/src/modules/self/signals.js"
    );
    const journal = new ObservationJournal(stateDir);
    const statefulOpen = {
      seq: 2,
      signal_id: V2_ID,
      state: "OPEN",
      class: "AGENT_SELF",
      component: "observation_agent",
      severity: "DEGRADED",
      impact_code: "IMPACT_AGENT_DELIVERY",
      first_failed_probe_at: "2026-09-02T07:00:05.000Z",
      detected_at: "2026-09-02T07:00:05.000Z",
      evidence: { reason: "DELIVERY_FAILURE", channel: "sendmail" },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null,
      recorded_at: "2026-09-02T07:00:05.000Z"
    };
    await journal.appendSignal(statefulOpen, {
      owner: "channels-sendmail", correlationKey: "sendmail-failure"
    });
    await journal.appendSignal(makeSelfSignal({
      seq: 10,
      signalId: "72000000-0000-4000-8000-000000000010",
      now: new Date("2026-09-03T07:00:00.000Z"),
      thresholdVersion: 1,
      event: "START",
      previousExitReason: "CLEAN"
    }));
    await journal.appendSignal(makeSelfSignal({
      seq: 11,
      signalId: "72000000-0000-4000-8000-000000000011",
      now: new Date("2026-09-03T07:01:00.000Z"),
      thresholdVersion: 1,
      event: "JOURNAL_FAILURE"
    }));
    await journal.appendSignal(makeSelfSignal({
      seq: 12,
      signalId: "72000000-0000-4000-8000-000000000012",
      now: new Date("2026-09-03T07:02:00.000Z"),
      thresholdVersion: 1,
      event: "STOP"
    }));
    await journal.appendSignal(makeSelfSignal({
      seq: 13,
      signalId: "72000000-0000-4000-8000-000000000013",
      now: new Date("2026-09-03T07:03:00.000Z"),
      thresholdVersion: 1,
      event: "START",
      previousExitReason: "CLEAN"
    }));
    await journal.appendSignal(makeThresholdChangedSignal({
      seq: 14,
      signalId: "72000000-0000-4000-8000-000000000014",
      now: new Date("2026-09-03T07:04:00.000Z"),
      thresholdVersion: 2,
      previousVersion: 1,
      currentVersion: 2
    }));

    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(
      stateDir,
      new Set(["core-liveness", "routing"])
    ))
      .resolves.toEqual({
        openSignals: [{
          signal: statefulOpen,
          lifecycle: { owner: "routing", correlationKey: "delivery:sendmail" }
        }],
        deliveryResults: []
      });
  });

  it("rejects a versioned row owned by a discovered module without lifecycle authority", async () => {
    const stateDir = await scratch();
    const { ObservationJournal } = await import(
      "../../apps/observation-agent/src/journal/journal.js"
    );
    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(signal({ seq: 2, id: V2_ID }), {
      owner: "routing",
      correlationKey: "discovered-but-stateless"
    });
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );

    await expect(replayObservationJournals(
      stateDir,
      new Set(["core-liveness", "channels-sendmail"])
    )).rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("rejects a stateful version-2 lifecycle-null row while preserving raw legacy adoption", async () => {
    const stateDir = await scratch();
    const stateful = signal({ seq: 2, id: V2_ID, component: "docker" });
    const { createSignalJournalRecordV2, replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );

    expect(() => createSignalJournalRecordV2(stateful, null))
      .toThrow("OBSERVATION_JOURNAL_INVALID");
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [v2(stateful, null)]);
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");

    const legacyStateDir = await scratch();
    await writeRows(legacyStateDir, "signals-2026-09-03.jsonl", [stateful]);
    await expect(replayObservationJournals(legacyStateDir, new Set(["core-liveness"])))
      .resolves.toEqual({
        openSignals: [{ signal: stateful, lifecycle: null }], deliveryResults: []
      });
  });

  it("rejects a v2 one-shot carrying lifecycle identity", async () => {
    const stateDir = await scratch();
    const { makeSelfSignal } = await import(
      "../../apps/observation-agent/src/modules/self/signals.js"
    );
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [v2(makeSelfSignal({
      seq: 15,
      signalId: "72000000-0000-4000-8000-000000000015",
      now: new Date("2026-09-03T07:05:00.000Z"),
      thresholdVersion: 2,
      event: "START",
      previousExitReason: "CLEAN"
    }), {
      owner: "core-liveness", correlation_key: "observation-agent-start"
    })]);

    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("replays legacy and v2 rows chronologically, preserves UUIDs, clears by exact ID, and collects only delivery results", async () => {
    const stateDir = await scratch();
    const legacyOpen = signal({ seq: 1, id: LEGACY_ID, component: "hatchet" });
    const versionedOpen = signal({ seq: 2, id: V2_ID, component: "postgres" });
    const clearLegacy = signal({
      seq: 3, id: CLEAR_ID, component: "hatchet", state: "CLEARED", clears: LEGACY_ID
    });
    await writeRows(stateDir, "signals-2026-09-05.jsonl", [
      v2(clearLegacy, { owner: "core-liveness", correlation_key: "hatchet" })
    ]);
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [legacyOpen]);
    await writeRows(stateDir, "signals-2026-09-04.jsonl", [
      v2(versionedOpen, { owner: "core-liveness", correlation_key: "postgres" })
    ]);

    const attempt = {
      kind: "ATTEMPT",
      delivery_id: "71000000-0000-4000-8000-000000000001",
      signal_id: V2_ID,
      channel: "sendmail",
      attempted_at: "2026-09-04T08:00:00.000Z"
    };
    const firstResult = {
      kind: "RESULT",
      delivery: {
        delivery_id: attempt.delivery_id,
        signal_id: V2_ID,
        channel: "sendmail",
        attempted_at: attempt.attempted_at,
        delivered_at: null,
        outcome: "FAILED",
        external_ref: null
      }
    };
    const secondResult = {
      kind: "RESULT",
      delivery: {
        delivery_id: "71000000-0000-4000-8000-000000000002",
        signal_id: V2_ID,
        channel: "sendmail",
        attempted_at: "2026-09-05T08:00:00.000Z",
        delivered_at: "2026-09-05T08:00:01.000Z",
        outcome: "DELIVERED",
        external_ref: null
      }
    };
    await writeRows(stateDir, "deliveries-2026-09-05.jsonl", [secondResult]);
    await writeRows(stateDir, "deliveries-2026-09-04.jsonl", [attempt, firstResult]);
    const before = await readFile(join(stateDir, "journal", "signals-2026-09-03.jsonl"), "utf8");

    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    const replayed = await replayObservationJournals(
      stateDir, new Set(["core-liveness", "routing"])
    );

    expect(replayed.openSignals).toEqual([{
      signal: versionedOpen,
      lifecycle: { owner: "core-liveness", correlationKey: "postgres" }
    }]);
    expect(replayed.openSignals[0]?.signal.signal_id).toBe(V2_ID);
    expect(replayed.deliveryResults).toEqual([firstResult, secondResult]);
    expect(await readFile(join(stateDir, "journal", "signals-2026-09-03.jsonl"), "utf8"))
      .toBe(before);
  });

  it("returns empty replay state when no journal directory exists", async () => {
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(await scratch(), new Set(["core-liveness"])))
      .resolves.toEqual({ openSignals: [], deliveryResults: [] });
  });

  it.each([
    ["unknown version", { ...v2(signal({ seq: 1, id: LEGACY_ID }), null), record_version: 3 }],
    ["unknown envelope field", { ...v2(signal({ seq: 1, id: LEGACY_ID }), null), extra: true }],
    ["unknown owner", v2(signal({ seq: 1, id: LEGACY_ID }), {
      owner: "not-discovered", correlation_key: "hatchet"
    })],
    ["invalid correlation", v2(signal({ seq: 1, id: LEGACY_ID }), {
      owner: "core-liveness", correlation_key: "hatchet/unsafe"
    })]
  ])("rejects %s", async (_name, row) => {
    const stateDir = await scratch();
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [row]);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("rejects duplicate native lifecycle identity and permits distinct same-class correlations", async () => {
    const stateDir = await scratch();
    const first = v2(signal({ seq: 1, id: LEGACY_ID, component: "hatchet" }), {
      owner: "core-liveness", correlation_key: "shared"
    });
    const duplicateLifecycle = v2(signal({ seq: 2, id: V2_ID, component: "postgres" }), {
      owner: "core-liveness", correlation_key: "shared"
    });
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [first, duplicateLifecycle]);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");

    const otherStateDir = await scratch();
    const duplicateOpenIdentity = v2(signal({ seq: 2, id: V2_ID, component: "hatchet" }), {
      owner: "core-liveness", correlation_key: "other"
    });
    await writeRows(otherStateDir, "signals-2026-09-03.jsonl", [first, duplicateOpenIdentity]);
    await expect(replayObservationJournals(otherStateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({ openSignals: [
        { lifecycle: { owner: "core-liveness", correlationKey: "shared" } },
        { lifecycle: { owner: "core-liveness", correlationKey: "other" } }
      ] });
  });

  it("rejects a clear that names a different UUID even when component and class match", async () => {
    const stateDir = await scratch();
    const open = v2(signal({ seq: 1, id: LEGACY_ID }), {
      owner: "core-liveness", correlation_key: "hatchet"
    });
    const wrongIdClear = v2(signal({
      seq: 2, id: CLEAR_ID, state: "CLEARED",
      clears: "70000000-0000-4000-8000-000000000099"
    }), { owner: "core-liveness", correlation_key: "hatchet" });
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [open, wrongIdClear]);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("rejects a clear whose class or lifecycle is incompatible with its current open", async () => {
    const stateDir = await scratch();
    const open = v2(signal({ seq: 1, id: LEGACY_ID }), {
      owner: "core-liveness", correlation_key: "hatchet"
    });
    const wrongClass = v2(signal({
      seq: 2, id: CLEAR_ID, state: "CLEARED", clears: LEGACY_ID, class: "INFRA_NOT_READY"
    }), { owner: "core-liveness", correlation_key: "hatchet" });
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [open, wrongClass]);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");

    const otherStateDir = await scratch();
    const wrongLifecycle = v2(signal({
      seq: 2, id: CLEAR_ID, state: "CLEARED", clears: LEGACY_ID
    }), { owner: "core-liveness", correlation_key: "postgres" });
    await writeRows(otherStateDir, "signals-2026-09-03.jsonl", [open, wrongLifecycle]);
    await expect(replayObservationJournals(otherStateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("ignores only one malformed final non-newline partial row", async () => {
    const stateDir = await scratch();
    const open = signal({ seq: 1, id: LEGACY_ID });
    await writeRows(stateDir, "signals-2026-09-03.jsonl", [open, "{\"record_version\":"], false);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toEqual({ openSignals: [{ signal: open, lifecycle: null }], deliveryResults: [] });

    const middleStateDir = await scratch();
    await writeRows(middleStateDir, "signals-2026-09-03.jsonl", [
      open, "{\"record_version\":", signal({ seq: 2, id: V2_ID, component: "postgres" })
    ]);
    await expect(replayObservationJournals(middleStateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");

    const completeStateDir = await scratch();
    await writeRows(completeStateDir, "signals-2026-09-03.jsonl", [
      open, "{\"record_version\":"
    ]);
    await expect(replayObservationJournals(completeStateDir, new Set(["core-liveness"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });

  it("rejects unknown delivery RESULT fields", async () => {
    const stateDir = await scratch();
    await writeRows(stateDir, "deliveries-2026-09-03.jsonl", [{
      kind: "RESULT",
      delivery: {
        delivery_id: "71000000-0000-4000-8000-000000000003",
        signal_id: V2_ID,
        channel: "kanban",
        attempted_at: "2026-09-03T08:00:00.000Z",
        delivered_at: null,
        outcome: "FAILED",
        external_ref: null
      },
      extra: true
    }]);
    const { replayObservationJournals } = await import(
      "../../apps/observation-agent/src/journal/records.js"
    );
    await expect(replayObservationJournals(stateDir, new Set(["routing"])))
      .rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
  });
});
