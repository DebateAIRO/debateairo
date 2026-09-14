import { describe, expect, it } from "vitest";
import {
  linkHatchetOccurrence,
  type CorrelatedOccurrence,
  type HatchetLinkStore,
  type IncidentAuthorityInput,
  type SourceLinkInput
} from "../../tools/obs-listener/src/ingest-hatchet/link.js";
import { measureSplitClock } from "../../tools/obs-listener/src/ingest-hatchet/skew.js";

const RUN = "10000000-0000-4000-8000-00000000abcd";
const WORK = "20000000-0000-4000-8000-00000000cdef";

function occurrence(overrides: Partial<CorrelatedOccurrence> = {}): CorrelatedOccurrence {
  return {
    occurrenceId: "30000000-0000-4000-8000-000000000001",
    incidentId: "40000000-0000-4000-8000-000000000001",
    source: "first_party",
    runRef: RUN,
    workItemRef: WORK,
    occurredAt: new Date("2026-09-08T10:00:00.000Z"),
    capturedAt: new Date("2026-09-08T10:00:00.100Z"),
    taxonomyClass: "PROCESS_DEATH",
    severity: "SEVERE",
    fingerprint: "first-party:fingerprint",
    fingerprintVersion: 3,
    ...overrides
  };
}

class MemoryLinkStore implements HatchetLinkStore {
  readonly links = new Map<string, SourceLinkInput>();
  readonly authorities = new Map<string, IncidentAuthorityInput>();

  async upsertSourceLink(input: SourceLinkInput): Promise<"INSERTED" | "DUPLICATE"> {
    const key = `${input.leftOccurrenceId}:${input.rightOccurrenceId}`;
    if (this.links.has(key)) return "DUPLICATE";
    this.links.set(key, input);
    return "INSERTED";
  }

  async applyFirstPartyAuthority(input: IncidentAuthorityInput): Promise<void> {
    this.authorities.set(input.hatchetIncidentId, input);
  }
}

describe("FIX-15 C2 evidenced cross-source merge", () => {
  it("links exact join keys in tolerance and retains first-party classification authority", async () => {
    const store = new MemoryLinkStore();
    const firstParty = occurrence();
    const hatchet = occurrence({
      occurrenceId: "30000000-0000-4000-8000-000000000002",
      incidentId: "40000000-0000-4000-8000-000000000002",
      source: "hatchet",
      occurredAt: new Date("2026-09-08T10:00:00.450Z"),
      capturedAt: new Date("2026-09-08T10:00:00.900Z"),
      taxonomyClass: "JOB_FAILURE",
      severity: "DEGRADED",
      fingerprint: "hatchet:JOB_FAILURE:FUNCTION",
      fingerprintVersion: 1
    });

    expect(await linkHatchetOccurrence({
      hatchet,
      firstPartyCandidates: [
        occurrence({
          occurrenceId: "30000000-0000-4000-8000-000000000009",
          runRef: RUN.toUpperCase()
        }),
        firstParty
      ],
      skewToleranceMs: 500,
      store
    })).toEqual({
      kind: "LINKED",
      firstPartyOccurrenceId: firstParty.occurrenceId,
      link: "INSERTED",
      skewMs: 450,
      tripEligible: false
    });
    expect([...store.links.values()]).toEqual([{
      leftOccurrenceId: firstParty.occurrenceId,
      rightOccurrenceId: hatchet.occurrenceId,
      evidence: {
        match: "EXACT_RUN_WORK_ITEM",
        compatibleClasses: "PROCESS_DEATH:JOB_FAILURE",
        runRef: RUN,
        workItemRef: WORK,
        firstPartyOccurredAt: "2026-09-08T10:00:00.000Z",
        hatchetOccurredAt: "2026-09-08T10:00:00.450Z",
        ingestObservedAt: "2026-09-08T10:00:00.900Z",
        skewMs: 450,
        ingestLagMs: 450,
        toleranceMs: 500,
        tripEligible: false
      }
    }]);
    expect([...store.authorities.values()]).toEqual([{
      firstPartyIncidentId: firstParty.incidentId,
      hatchetIncidentId: hatchet.incidentId,
      fingerprint: "first-party:fingerprint",
      fingerprintVersion: 3,
      taxonomyClass: "PROCESS_DEATH",
      severity: "SEVERE",
      sourceSet: ["first_party", "hatchet"]
    }]);
  });

  it("is idempotent when the same evidenced pair is linked again", async () => {
    const store = new MemoryLinkStore();
    const hatchet = occurrence({
      occurrenceId: "30000000-0000-4000-8000-000000000002",
      incidentId: "40000000-0000-4000-8000-000000000002",
      source: "hatchet",
      taxonomyClass: "JOB_FAILURE"
    });
    const input = {
      hatchet,
      firstPartyCandidates: [occurrence()],
      skewToleranceMs: 1_000,
      store
    } as const;
    expect(await linkHatchetOccurrence(input)).toMatchObject({ link: "INSERTED" });
    expect(await linkHatchetOccurrence(input)).toMatchObject({ link: "DUPLICATE" });
    expect(store.links.size).toBe(1);
    expect(store.authorities.size).toBe(1);
  });

  it("keeps unmatched keys, incompatible classes, and out-of-tolerance clocks as two incidents", async () => {
    const cases = [
      occurrence({ workItemRef: "20000000-0000-4000-8000-00000000aaaa" }),
      occurrence({ taxonomyClass: "HTTP_FAILURE" }),
      occurrence({ occurredAt: new Date("2026-09-08T10:00:02.001Z") })
    ];
    for (const candidate of cases) {
      const store = new MemoryLinkStore();
      const result = await linkHatchetOccurrence({
        hatchet: occurrence({
          occurrenceId: "30000000-0000-4000-8000-000000000002",
          incidentId: "40000000-0000-4000-8000-000000000002",
          source: "hatchet",
          taxonomyClass: "JOB_FAILURE"
        }),
        firstPartyCandidates: [candidate],
        skewToleranceMs: 2_000,
        store
      });
      expect(result).toEqual({ kind: "UNMATCHED" });
      expect(store.links.size).toBe(0);
      expect(store.authorities.size).toBe(0);
    }
  });

  it("selects the nearest lawful twin deterministically", async () => {
    const store = new MemoryLinkStore();
    const farther = occurrence({
      occurrenceId: "30000000-0000-4000-8000-000000000003",
      occurredAt: new Date("2026-09-08T10:00:00.700Z")
    });
    const nearer = occurrence({
      occurrenceId: "30000000-0000-4000-8000-000000000004",
      occurredAt: new Date("2026-09-08T10:00:00.100Z")
    });
    const result = await linkHatchetOccurrence({
      hatchet: occurrence({
        occurrenceId: "30000000-0000-4000-8000-000000000002",
        incidentId: "40000000-0000-4000-8000-000000000002",
        source: "hatchet",
        taxonomyClass: "JOB_FAILURE"
      }),
      firstPartyCandidates: [farther, nearer],
      skewToleranceMs: 1_000,
      store
    });
    expect(result).toMatchObject({
      kind: "LINKED",
      firstPartyOccurrenceId: nearer.occurrenceId,
      skewMs: 100
    });
  });
});

describe("FIX-15 split-clock skew measurement", () => {
  it("stamps both source clocks and marks drift beyond tolerance trip-eligible", () => {
    expect(measureSplitClock({
      firstPartyAt: new Date("2026-09-08T10:00:00.000Z"),
      hatchetAt: new Date("2026-09-08T10:00:00.801Z"),
      ingestObservedAt: new Date("2026-09-08T10:00:01.101Z"),
      toleranceMs: 800
    })).toEqual({
      firstPartyOccurredAt: "2026-09-08T10:00:00.000Z",
      hatchetOccurredAt: "2026-09-08T10:00:00.801Z",
      ingestObservedAt: "2026-09-08T10:00:01.101Z",
      skewMs: 801,
      ingestLagMs: 300,
      toleranceMs: 800,
      withinTolerance: false,
      tripEligible: true
    });
  });

  it("rejects an unratified or invalid tolerance", () => {
    expect(() => measureSplitClock({
      firstPartyAt: new Date(),
      hatchetAt: new Date(),
      ingestObservedAt: new Date(),
      toleranceMs: 0
    })).toThrow("HATCHET_SKEW_TOLERANCE_UNRATIFIED");
  });
});
