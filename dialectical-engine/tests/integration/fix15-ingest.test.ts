import { describe, expect, it } from "vitest";
import {
  pollHatchetFailures,
  type CaptureGapInput,
  type HatchetIngestSink,
  type HatchetOccurrenceInput,
  type HatchetRunsClient,
  type HatchetRunsQuery
} from "../../tools/obs-listener/src/ingest-hatchet/poll.js";
import { mapHatchetFailure } from "../../tools/obs-listener/src/ingest-hatchet/map.js";

const RUN = "10000000-0000-4000-8000-00000000abcd";
const WORK = "20000000-0000-4000-8000-00000000cdef";
const HATCHET_RUN = "30000000-0000-4000-8000-000000000123";
const OBSERVED_AT = new Date("2026-09-08T10:10:00.000Z");

const RECORDED_RUN_LIST_ROW = Object.freeze({
  metadata: {
    id: HATCHET_RUN,
    createdAt: "2026-09-08T10:04:00.000Z",
    updatedAt: "2026-09-08T10:05:00.000Z"
  },
  status: "FAILED",
  kind: "FUNCTION",
  attempt: 2,
  counts: {
    jobCount: 1,
    failedJobCount: 1,
    cancelledJobCount: 0,
    stepCount: 1,
    failedStepCount: 1,
    cancelledStepCount: 0
  },
  additionalMetadata: { v3RunId: RUN, v3WorkItemId: WORK },
  finishedAt: "2026-09-08T10:05:00.000Z",
  error: "traceback PRIVATE-CONTENT",
  logs: [{ message: "stack SECRET" }],
  input: { prompt: "PRIVATE-CONTENT" }
});

class MemorySink implements HatchetIngestSink {
  readonly occurrences = new Map<string, HatchetOccurrenceInput>();
  readonly gaps = new Map<string, CaptureGapInput>();

  async insertOccurrence(input: HatchetOccurrenceInput): Promise<"INSERTED" | "DUPLICATE"> {
    const key = `${input.source}:${input.sourceEventRef}`;
    if (this.occurrences.has(key)) return "DUPLICATE";
    this.occurrences.set(key, input);
    return "INSERTED";
  }

  async upsertCaptureGap(input: CaptureGapInput): Promise<"INSERTED" | "DUPLICATE"> {
    const key = `${input.source}:${input.gapClass}:${input.openedAt.toISOString()}:${input.closedAt.toISOString()}`;
    if (this.gaps.has(key)) return "DUPLICATE";
    this.gaps.set(key, input);
    return "INSERTED";
  }
}

class FixtureClient implements HatchetRunsClient {
  readonly queries: HatchetRunsQuery[] = [];

  async listRuns(query: HatchetRunsQuery) {
    this.queries.push(query);
    if (query.offset === 0) {
      return {
        rows: [RECORDED_RUN_LIST_ROW],
        pagination: { current_page: 1, next_page: 2, num_pages: 2 },
        retentionFloorAt: "2026-09-08T09:58:00.000Z"
      };
    }
    return {
      rows: [],
      pagination: { current_page: 2, num_pages: 2 },
      retentionFloorAt: "2026-09-08T09:58:00.000Z"
    };
  }
}

describe("FIX-15 C1 fixture-backed failed-run ingest", () => {
  it("polls a bounded overlapped window and stores only structured allowlisted fields", async () => {
    const sink = new MemorySink();
    const client = new FixtureClient();
    const result = await pollHatchetFailures({
      client,
      sink,
      cursorAt: new Date("2026-09-08T10:00:00.000Z"),
      observedAt: OBSERVED_AT,
      overlapMs: 120_000,
      pollIntervalMs: 60_000,
      pageSize: 25,
      maxPages: 3,
      environment: "test",
      buildRef: "build:fixture"
    });

    expect(result).toEqual({
      state: "FOLDED",
      pages: 2,
      inserted: 1,
      duplicates: 0,
      invalidRows: 0,
      retentionGapWindows: 0
    });
    expect(client.queries).toEqual([
      {
        statuses: ["FAILED", "CANCELLED"],
        createdAfter: "2026-09-08T09:58:00.000Z",
        createdBefore: "2026-09-08T10:10:00.000Z",
        orderByField: "createdAt",
        orderByDirection: "ASC",
        offset: 0,
        limit: 25
      },
      {
        statuses: ["FAILED", "CANCELLED"],
        createdAfter: "2026-09-08T09:58:00.000Z",
        createdBefore: "2026-09-08T10:10:00.000Z",
        orderByField: "createdAt",
        orderByDirection: "ASC",
        offset: 25,
        limit: 25
      }
    ]);
    expect([...sink.occurrences.values()]).toEqual([{
      occurredAt: new Date("2026-09-08T10:05:00.000Z"),
      capturedAt: OBSERVED_AT,
      environment: "test",
      buildRef: "build:fixture",
      buildDirty: false,
      runtime: "ingest",
      component: {
        package: "hatchet",
        call_site_key: "runs.list",
        status: "FAILED",
        kind: "FUNCTION",
        attempt: 2,
        job_count: 1,
        failed_job_count: 1,
        cancelled_job_count: 0,
        step_count: 1,
        failed_step_count: 1,
        cancelled_step_count: 0
      },
      capturePoint: "job",
      code: "HATCHET_RUN_FAILED",
      taxonomyClass: "JOB_FAILURE",
      severity: "DEGRADED",
      disposition: "RECORDED",
      fingerprint: "hatchet:JOB_FAILURE:FUNCTION",
      fingerprintVersion: 1,
      redactionPolicyVersion: "hatchet-structured-v1",
      allowlistSetId: "hatchet-failed-run-v1",
      fallbackMinimized: false,
      captureStatus: "PERSISTED",
      runRef: RUN,
      workItemRef: WORK,
      nodeRef: "NOT_APPLICABLE",
      attemptRef: "2",
      ledgerRef: "NOT_APPLICABLE",
      parentOccurrenceRef: "NO_CAUSE",
      atSeqWatermark: "NOT_APPLICABLE",
      frames: [],
      safeTemplateId: "tpl.HATCHET_RUN_FAILED",
      templateParameters: {
        status: "FAILED",
        kind: "FUNCTION",
        attempt: 2,
        job_count: 1,
        failed_job_count: 1,
        cancelled_job_count: 0,
        step_count: 1,
        failed_step_count: 1,
        cancelled_step_count: 0
      },
      source: "hatchet",
      sourceEventRef: `hatchet:${HATCHET_RUN}:2`,
      zoneContext: false,
      attemptIndex: 2,
      writerIdentity: "hatchet-ingest"
    }]);
    const stored = JSON.stringify([...sink.occurrences.values()]).toLowerCase();
    expect(stored).not.toContain("traceback");
    expect(stored).not.toContain("stack");
    expect(stored).not.toContain("private-content");
    expect(stored).not.toContain("secret");
  });

  it("relies on the source identity key for idempotent repeated polling", async () => {
    const sink = new MemorySink();
    const input = {
      sink,
      cursorAt: new Date("2026-09-08T10:00:00.000Z"),
      observedAt: OBSERVED_AT,
      overlapMs: 120_000,
      pollIntervalMs: 60_000,
      pageSize: 25,
      maxPages: 3,
      environment: "test",
      buildRef: "build:fixture"
    } as const;
    expect(await pollHatchetFailures({ ...input, client: new FixtureClient() }))
      .toMatchObject({ inserted: 1, duplicates: 0 });
    expect(await pollHatchetFailures({ ...input, client: new FixtureClient() }))
      .toMatchObject({ inserted: 0, duplicates: 1 });
    expect(sink.occurrences.size).toBe(1);
  });

  it("counts and idempotently records retention loss in poll-window units", async () => {
    const sink = new MemorySink();
    const client: HatchetRunsClient = {
      async listRuns() {
        return {
          rows: [],
          pagination: { current_page: 1, num_pages: 1 },
          retentionFloorAt: "2026-09-08T10:03:01.000Z"
        };
      }
    };
    const input = {
      client,
      sink,
      cursorAt: new Date("2026-09-08T10:00:00.000Z"),
      observedAt: OBSERVED_AT,
      overlapMs: 120_000,
      pollIntervalMs: 60_000,
      pageSize: 25,
      maxPages: 3,
      environment: "test",
      buildRef: "build:fixture"
    } as const;

    expect(await pollHatchetFailures(input)).toMatchObject({ retentionGapWindows: 6 });
    expect(await pollHatchetFailures(input)).toMatchObject({ retentionGapWindows: 6 });
    expect([...sink.gaps.values()]).toEqual([{
      source: "hatchet",
      gapClass: "HATCHET_RETENTION_WINDOW",
      lostCount: 6,
      openedAt: new Date("2026-09-08T09:58:00.000Z"),
      closedAt: new Date("2026-09-08T10:03:01.000Z")
    }]);
  });

  it("degrades to a bounded self occurrence without coupling the first-party path", async () => {
    const sink = new MemorySink();
    const firstPartyReceipts: string[] = [];
    const result = await pollHatchetFailures({
      client: { async listRuns() { throw new Error("token and PRIVATE-CONTENT"); } },
      sink,
      cursorAt: new Date("2026-09-08T10:00:00.000Z"),
      observedAt: OBSERVED_AT,
      overlapMs: 120_000,
      pollIntervalMs: 60_000,
      pageSize: 25,
      maxPages: 3,
      environment: "test",
      buildRef: "build:fixture"
    });
    firstPartyReceipts.push("FIRST_PARTY_CAPTURED");

    expect(result).toEqual({
      state: "DEGRADED",
      pages: 0,
      inserted: 1,
      duplicates: 0,
      invalidRows: 0,
      retentionGapWindows: 0
    });
    expect(firstPartyReceipts).toEqual(["FIRST_PARTY_CAPTURED"]);
    const occurrence = [...sink.occurrences.values()][0];
    expect(occurrence).toMatchObject({
      source: "hatchet",
      runtime: "ingest",
      capturePoint: "self",
      code: "HATCHET_INGEST_UNREACHABLE",
      taxonomyClass: "CAPTURE_SELF",
      runRef: "NOT_APPLICABLE",
      workItemRef: "NOT_APPLICABLE"
    });
    expect(JSON.stringify(occurrence).toLowerCase()).not.toContain("private-content");
    expect(JSON.stringify(occurrence).toLowerCase()).not.toContain("token");
  });

  it("rejects unboundable pagination as a structured self occurrence", async () => {
    const sink = new MemorySink();
    const result = await pollHatchetFailures({
      client: {
        async listRuns() {
          return {
            rows: [],
            pagination: { current_page: 1, next_page: 2, num_pages: 4 }
          };
        }
      },
      sink,
      cursorAt: new Date("2026-09-08T10:00:00.000Z"),
      observedAt: OBSERVED_AT,
      overlapMs: 0,
      pollIntervalMs: 60_000,
      pageSize: 25,
      maxPages: 3,
      environment: "test",
      buildRef: "build:fixture"
    });
    expect(result).toMatchObject({ state: "DEGRADED", pages: 1 });
    expect([...sink.occurrences.values()][0]?.code).toBe("HATCHET_INGEST_PAGINATION_UNBOUNDABLE");
  });

  it("drops malformed and non-failure rows before persistence", () => {
    expect(mapHatchetFailure({ ...RECORDED_RUN_LIST_ROW, status: "SUCCEEDED" }, {
      observedAt: OBSERVED_AT, environment: "test", buildRef: "build:fixture"
    })).toBeNull();
    expect(mapHatchetFailure({ ...RECORDED_RUN_LIST_ROW, attempt: 0 }, {
      observedAt: OBSERVED_AT, environment: "test", buildRef: "build:fixture"
    })).toBeNull();
    expect(mapHatchetFailure({
      ...RECORDED_RUN_LIST_ROW,
      additionalMetadata: { v3RunId: RUN.toUpperCase(), v3WorkItemId: WORK }
    }, {
      observedAt: OBSERVED_AT, environment: "test", buildRef: "build:fixture"
    })).toBeNull();
  });
});
