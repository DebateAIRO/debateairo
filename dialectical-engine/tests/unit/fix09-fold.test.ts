import { describe, expect, it } from "vitest";
import {
  decodeOccurrence,
  type OccurrenceRecord,
  type PoisonReason,
  type SkipReason
} from "../../tools/obs-listener/src/daemon/intake.js";
import {
  fixEligibility,
  foldIncident,
  isLegalTransition,
  workUnitKey,
  type IncidentState
} from "../../tools/obs-listener/src/daemon/fold.js";

const RUN = "10000000-0000-4000-8000-00000000abcd";
const WORK = "20000000-0000-4000-8000-00000000cdef";

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    occurrence_id: "30000000-0000-4000-8000-000000000003",
    occ_seq: "1",
    occurred_at: new Date("2026-09-04T10:00:00.000Z"),
    captured_at: new Date("2026-09-04T10:00:01.000Z"),
    component: { package: "@debateai/test", call_site_key: "test:1" },
    frames: [{ kind: "SAFE", ordinal: 0 }],
    source: "first_party",
    severity: "INFO",
    fingerprint: "fp:test",
    fingerprint_version: 1,
    source_event_ref: "source-event:1",
    taxonomy_class: "JOB_FAILURE",
    code: "OBS_SCHEDULER_JOB_FAILED",
    capture_point: "job",
    run_ref: RUN,
    work_item_ref: WORK,
    ...overrides
  };
}

function accepted(overrides: Record<string, unknown> = {}): OccurrenceRecord {
  const result = decodeOccurrence(raw(overrides));
  if (result.kind !== "ACCEPT") throw new Error(`EXPECTED_ACCEPT:${result.kind}`);
  return result.occurrence;
}

describe("FIX-09 C2 deterministic intake", () => {
  it("accepts scheduler failures and returns the exact skip cases", () => {
    expect(decodeOccurrence(raw())).toMatchObject({ kind: "ACCEPT" });
    for (const code of ["STARTED", "SUCCEEDED", "NOOP"]) {
      expect(decodeOccurrence(raw({ taxonomy_class: "JOB_LIFECYCLE", code }))).toEqual({
        kind: "SKIP", reason: "SKIP_NON_DEFECT_JOB_LIFECYCLE"
      });
    }
    expect(decodeOccurrence(raw({
      capture_point: "detector", component: { package: "@debateai/test" }
    }))).toEqual({ kind: "SKIP", reason: "SKIP_DETECTOR_LOCATION_MISSING" });
    expect(decodeOccurrence(raw({
      capture_point: "detector", component: { package: " ", call_site_key: "test:1" }
    }))).toEqual({ kind: "SKIP", reason: "SKIP_DETECTOR_LOCATION_MISSING" });
    expect(decodeOccurrence(raw({ capture_point: "detector" }))).toMatchObject({ kind: "ACCEPT" });
  });

  it("maps every invalid boundary to one closed poison reason", () => {
    const cases: readonly [Record<string, unknown>, PoisonReason][] = [
      [{ occ_seq: "9007199254740992" }, "POISON_UNSAFE_OCC_SEQ"],
      [{ occurred_at: "not-a-time" }, "POISON_INVALID_TIMESTAMP"],
      [{ component: [] }, "POISON_INVALID_COMPONENT"],
      [{ frames: [7] }, "POISON_INVALID_FRAMES"],
      [{ source: "external" }, "POISON_INVALID_SOURCE"],
      [{ severity: "CRITICAL" }, "POISON_INVALID_SEVERITY"],
      [{ fingerprint: "" }, "POISON_INVALID_IDENTITY"]
    ];
    expect(cases.map(([overrides, reason]) => decodeOccurrence(raw(overrides))))
      .toEqual(cases.map(([, reason]) => ({ kind: "POISON", reason })));

    const observed = new Set<string>();
    observed.add(decodeOccurrence(raw()).kind);
    for (const taxonomyClass of ["JOB_LIFECYCLE"]) {
      const result = decodeOccurrence(raw({ taxonomy_class: taxonomyClass }));
      if (result.kind !== "ACCEPT") observed.add(result.reason);
    }
    const detector = decodeOccurrence(raw({ capture_point: "detector", component: {} }));
    if (detector.kind !== "ACCEPT") observed.add(detector.reason);
    for (const [overrides] of cases) {
      const result = decodeOccurrence(raw(overrides));
      if (result.kind !== "ACCEPT") observed.add(result.reason);
    }
    const expected: readonly ("ACCEPT" | SkipReason | PoisonReason)[] = [
      "ACCEPT", "SKIP_NON_DEFECT_JOB_LIFECYCLE", "SKIP_DETECTOR_LOCATION_MISSING",
      "POISON_UNSAFE_OCC_SEQ", "POISON_INVALID_TIMESTAMP", "POISON_INVALID_COMPONENT",
      "POISON_INVALID_FRAMES", "POISON_INVALID_SOURCE", "POISON_INVALID_SEVERITY",
      "POISON_INVALID_IDENTITY"
    ];
    expect([...observed].sort()).toEqual([...expected].sort());
  });
});

describe("FIX-09 C2 incident projection", () => {
  it("uses structured declared-pair or source-event work keys", () => {
    expect(workUnitKey(accepted())).toEqual(["DECLARED_PAIR", RUN, WORK]);
    for (const overrides of [
      { run_ref: RUN.toUpperCase() },
      { work_item_ref: "NOT_APPLICABLE" },
      { run_ref: "NOT_APPLICABLE", work_item_ref: "NOT_APPLICABLE" },
      { run_ref: RUN, work_item_ref: "UNKNOWN:DECLARED_KIND_REQUIRED" }
    ]) {
      expect(workUnitKey(accepted({ source: "hatchet", source_event_ref: "fallback:1", ...overrides })))
        .toEqual(["SOURCE_EVENT", "hatchet", "fallback:1"]);
    }
  });

  it("recomputes stable aggregates by composite identity, work unit, severity, time, and source", () => {
    const rows = [
      accepted({ occ_seq: "1", occurred_at: new Date("2026-09-04T10:03:00Z"), severity: "INFO" }),
      accepted({ occ_seq: "2", source: "hatchet", source_event_ref: "hatchet:2", severity: "FATAL",
        occurred_at: new Date("2026-09-04T10:01:00Z") }),
      accepted({ occ_seq: "3", source: "ui_client", source_event_ref: "ui:3", severity: "SEVERE",
        occurred_at: new Date("2026-09-04T10:05:00Z"), run_ref: "NOT_APPLICABLE" }),
      accepted({ occ_seq: "4", source_event_ref: "scheduler:4", run_ref: "NOT_APPLICABLE",
        work_item_ref: "NOT_APPLICABLE" }),
      accepted({ occ_seq: "5", source_event_ref: "scheduler:5", run_ref: "NOT_APPLICABLE",
        work_item_ref: "NOT_APPLICABLE" })
    ] as const;
    const aggregate = foldIncident(rows);
    expect(aggregate).toEqual({
      fingerprint: "fp:test",
      fingerprintVersion: 1,
      firstSeenAt: new Date("2026-09-04T10:00:00Z"),
      lastSeenAt: new Date("2026-09-04T10:05:00Z"),
      distinctWorkUnitCount: 4n,
      maxSeverity: "FATAL",
      sourceSet: ["first_party", "hatchet", "ui_client"]
    });
    expect(foldIncident([...rows].reverse())).toEqual(aggregate);
    expect(foldIncident(rows)).toEqual(aggregate);
    expect(() => foldIncident([rows[0], accepted({ fingerprint_version: 2 })])).toThrow("INCIDENT_IDENTITY_MISMATCH");
  });

  it("derives UI-only ineligibility without persisting a parallel state", () => {
    expect(fixEligibility(["ui_client"])).toBe("FIX_INELIGIBLE");
    for (const set of [[], ["first_party"], ["hatchet"], ["first_party", "ui_client"]] as const) {
      expect(fixEligibility(set)).toBe("FIX_ELIGIBLE");
    }
  });

  it("accepts exactly the closed incident transition graph", () => {
    const states = [
      "NEW", "RESEARCHING", "TICKETED", "PROPOSED", "APPROVED", "FIXING",
      "FIXED_UNVALIDATED", "FIXED_VALIDATED", "REGRESSED", "ESCALATED", "PARKED"
    ] as const satisfies readonly IncidentState[];
    const legal = new Set([
      "NEW>RESEARCHING", "RESEARCHING>TICKETED", "RESEARCHING>PROPOSED",
      "RESEARCHING>ESCALATED", "TICKETED>RESEARCHING", "PROPOSED>APPROVED",
      "PROPOSED>TICKETED", "PROPOSED>PARKED", "APPROVED>FIXING",
      "FIXING>FIXED_UNVALIDATED", "FIXING>PARKED", "FIXING>APPROVED",
      "FIXED_UNVALIDATED>FIXED_VALIDATED", "FIXED_UNVALIDATED>REGRESSED",
      "FIXED_VALIDATED>REGRESSED", "REGRESSED>ESCALATED"
    ]);
    for (const from of states) for (const to of states) {
      expect(isLegalTransition(from, to), `${from}>${to}`).toBe(legal.has(`${from}>${to}`));
    }
    expect(states).not.toContain("PR_PRESENTED");
  });
});
