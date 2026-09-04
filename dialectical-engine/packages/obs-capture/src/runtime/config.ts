import {
  parseSpoolAdmissionSeal,
  type SpoolAdmissionSeal,
} from "../spool-index.js";

const FLUSH_DEADLINE_MS_SEED = 5_000; // seed — V ratifies at FIX-01 acceptance
const QUEUE_CAPACITY_SEED = 1_024; // seed — V ratifies at FIX-01 acceptance
const SPOOL_DIR_SEED = undefined; // seed — V ratifies at FIX-01 acceptance
const WRITER_DATABASE_URL_SEED = undefined; // seed — V ratifies at FIX-01 acceptance

export interface ObsBounds {
  readonly flushDeadlineMs: number;
  readonly queueCapacity: number;
  readonly spoolDir: string | undefined;
  readonly spoolAdmissionSeal: SpoolAdmissionSeal | undefined;
  readonly writerDatabaseUrl: string | undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

export function readObsBounds(): ObsBounds {
  return Object.freeze({
    flushDeadlineMs: positiveInteger(
      process.env.OBS_FLUSH_DEADLINE_MS,
      FLUSH_DEADLINE_MS_SEED,
    ),
    queueCapacity: positiveInteger(
      process.env.OBS_QUEUE_CAPACITY,
      QUEUE_CAPACITY_SEED,
    ),
    spoolDir: nonEmpty(process.env.OBS_SPOOL_DIR) ?? SPOOL_DIR_SEED,
    spoolAdmissionSeal: parseSpoolAdmissionSeal(
      process.env.OBS_SPOOL_ADMISSION_SEAL_V1,
    ),
    writerDatabaseUrl:
      nonEmpty(process.env.OBS_WRITER_DATABASE_URL) ?? WRITER_DATABASE_URL_SEED,
  });
}
