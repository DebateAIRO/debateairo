import {
  mapHatchetFailure,
  mapHatchetSelfOccurrence,
  type HatchetMapContext,
  type HatchetOccurrenceInput
} from "./map.js";

export type { HatchetOccurrenceInput } from "./map.js";

export interface HatchetRunsQuery {
  readonly statuses: readonly ["FAILED", "CANCELLED"];
  readonly createdAfter: string;
  readonly createdBefore: string;
  readonly orderByField: "createdAt";
  readonly orderByDirection: "ASC";
  readonly offset: number;
  readonly limit: number;
}

export interface HatchetRunsPage {
  readonly rows: readonly unknown[];
  readonly pagination: Readonly<{
    readonly current_page?: number;
    readonly next_page?: number;
    readonly num_pages?: number;
  }>;
  readonly retentionFloorAt?: string;
}

export interface HatchetRunsClient {
  listRuns(query: HatchetRunsQuery): Promise<HatchetRunsPage>;
}

export interface CaptureGapInput {
  readonly source: "hatchet";
  readonly gapClass: "HATCHET_RETENTION_WINDOW";
  readonly lostCount: number;
  readonly openedAt: Date;
  readonly closedAt: Date;
}

export interface HatchetIngestSink {
  insertOccurrence(input: HatchetOccurrenceInput): Promise<"INSERTED" | "DUPLICATE">;
  upsertCaptureGap(input: CaptureGapInput): Promise<"INSERTED" | "DUPLICATE">;
}

export interface PollHatchetInput extends HatchetMapContext {
  readonly client: HatchetRunsClient;
  readonly sink: HatchetIngestSink;
  readonly cursorAt: Date;
  readonly overlapMs: number;
  readonly pollIntervalMs: number;
  readonly pageSize: number;
  readonly maxPages: number;
}

export interface PollHatchetResult {
  readonly state: "FOLDED" | "DEGRADED";
  readonly pages: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly invalidRows: number;
  readonly retentionGapWindows: number;
}

class PaginationBoundaryError extends Error {
  constructor() {
    super("HATCHET_INGEST_PAGINATION_UNBOUNDABLE");
    this.name = "PaginationBoundaryError";
  }
}

function safePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function safeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validatedDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function validateInput(input: PollHatchetInput): void {
  if (!Number.isFinite(input.cursorAt.getTime()) || !Number.isFinite(input.observedAt.getTime())
    || input.cursorAt.getTime() > input.observedAt.getTime()
    || !safeNonNegativeInteger(input.overlapMs)
    || !safePositiveInteger(input.pollIntervalMs)
    || !safePositiveInteger(input.pageSize)
    || !safePositiveInteger(input.maxPages)) {
    throw new TypeError("HATCHET_INGEST_POLL_CONFIG_INVALID");
  }
}

async function persistSelf(
  input: PollHatchetInput,
  code: "HATCHET_INGEST_UNREACHABLE" | "HATCHET_INGEST_PAGINATION_UNBOUNDABLE",
  pages: number,
  invalidRows: number
): Promise<PollHatchetResult> {
  const inserted = await input.sink.insertOccurrence(mapHatchetSelfOccurrence(code, input));
  return Object.freeze({
    state: "DEGRADED",
    pages,
    inserted: inserted === "INSERTED" ? 1 : 0,
    duplicates: inserted === "DUPLICATE" ? 1 : 0,
    invalidRows,
    retentionGapWindows: 0
  });
}

export async function pollHatchetFailures(input: PollHatchetInput): Promise<PollHatchetResult> {
  validateInput(input);
  const requestedAfter = new Date(input.cursorAt.getTime() - input.overlapMs);
  const baseQuery = Object.freeze({
    statuses: Object.freeze(["FAILED", "CANCELLED"] as const),
    createdAfter: requestedAfter.toISOString(),
    createdBefore: input.observedAt.toISOString(),
    orderByField: "createdAt" as const,
    orderByDirection: "ASC" as const,
    limit: input.pageSize
  });
  let offset = 0;
  let pages = 0;
  let inserted = 0;
  let duplicates = 0;
  let invalidRows = 0;
  let retentionFloor: Date | undefined;

  try {
    for (;;) {
      const page = await input.client.listRuns(Object.freeze({ ...baseQuery, offset }));
      pages += 1;
      if (pages > input.maxPages || !Array.isArray(page.rows)) throw new PaginationBoundaryError();
      const currentPage = page.pagination.current_page;
      const nextPage = page.pagination.next_page;
      const numPages = page.pagination.num_pages;
      if (!safePositiveInteger(currentPage ?? 0) || !safePositiveInteger(numPages ?? 0)
        || currentPage !== pages || numPages! > input.maxPages || currentPage! > numPages!
        || (nextPage !== undefined
          && (!safePositiveInteger(nextPage) || nextPage !== currentPage! + 1 || nextPage > numPages!))) {
        throw new PaginationBoundaryError();
      }
      const pageRetentionFloor = validatedDate(page.retentionFloorAt);
      if (page.retentionFloorAt !== undefined && pageRetentionFloor === undefined) {
        throw new PaginationBoundaryError();
      }
      if (pageRetentionFloor !== undefined
        && (retentionFloor === undefined || pageRetentionFloor.getTime() > retentionFloor.getTime())) {
        retentionFloor = pageRetentionFloor;
      }
      for (const row of page.rows) {
        const occurrence = mapHatchetFailure(row, input);
        if (occurrence === null) {
          invalidRows += 1;
          continue;
        }
        const result = await input.sink.insertOccurrence(occurrence);
        if (result === "INSERTED") inserted += 1;
        else duplicates += 1;
      }
      if (nextPage === undefined) break;
      offset = (nextPage - 1) * input.pageSize;
    }
  } catch (error) {
    return persistSelf(
      input,
      error instanceof PaginationBoundaryError
        ? "HATCHET_INGEST_PAGINATION_UNBOUNDABLE"
        : "HATCHET_INGEST_UNREACHABLE",
      pages,
      invalidRows
    );
  }

  let retentionGapWindows = 0;
  if (retentionFloor !== undefined && retentionFloor.getTime() > requestedAfter.getTime()) {
    retentionGapWindows = Math.ceil(
      (retentionFloor.getTime() - requestedAfter.getTime()) / input.pollIntervalMs
    );
    await input.sink.upsertCaptureGap(Object.freeze({
      source: "hatchet",
      gapClass: "HATCHET_RETENTION_WINDOW",
      lostCount: retentionGapWindows,
      openedAt: requestedAfter,
      closedAt: retentionFloor
    }));
  }
  return Object.freeze({
    state: "FOLDED",
    pages,
    inserted,
    duplicates,
    invalidRows,
    retentionGapWindows
  });
}
