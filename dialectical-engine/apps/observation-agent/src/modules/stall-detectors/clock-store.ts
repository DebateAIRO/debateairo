import type {
  ObservationDatabasePort,
  ObservationQueryClient
} from "../../core/database.js";
import type { InFlightRunProgress, ReadyWorkItem } from "./detectors.js";

export const DETECTOR_CLOCK_KEYS = Object.freeze({
  readyIdentity: "runner.ready_identity",
  progressIdentity: "runner.progress_identity",
  progressSequence: "runner.progress_sequence"
} as const);

const DEFAULT_CAPACITY = 8_640;
const DETECTOR_CLOCK_LOCK = Object.freeze([1_326_651_139, 1_129_073_475] as const);
const MAX_UUID_VALUE = (1n << 128n) - 1n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

type DetectorFamily = "READY" | "PROGRESS";

export type DetectorClocks = Readonly<{
  readyFirstObserved: ReadonlyMap<string, Date>;
  progressLastChanged: ReadonlyMap<string, Readonly<{ sequence: number; at: Date }>>;
  exhausted: ReadonlySet<DetectorFamily>;
}>;

type StoredClockRow = Readonly<{
  metric_key: string;
  bucket: number;
  observed_at: Date;
  value: string;
}>;

type ClockEntry = Readonly<{
  identity: string;
  bucket: number;
  observedAt: Date;
}>;

type ProgressEntry = ClockEntry & Readonly<{ sequence: number }>;

const CLOCK_SELECT = `SELECT metric_key,bucket,observed_at,value::text AS value
FROM observation.sample_ring
WHERE metric_key IN (
  'runner.ready_identity',
  'runner.progress_identity',
  'runner.progress_sequence'
)
ORDER BY metric_key,bucket
FOR UPDATE`;

const CLOCK_LOCK = "SELECT pg_advisory_xact_lock($1::integer,$2::integer)";

const READY_UPSERT = `INSERT INTO observation.sample_ring(
  metric_key,bucket,observed_at,value
)
SELECT 'runner.ready_identity',incoming.bucket,incoming.observed_at,incoming.value
FROM unnest($1::integer[],$2::timestamptz[],$3::numeric[])
  AS incoming(bucket,observed_at,value)
ON CONFLICT (metric_key,bucket) DO UPDATE SET
  observed_at=EXCLUDED.observed_at,
  value=EXCLUDED.value`;

const PROGRESS_IDENTITY_UPSERT = `INSERT INTO observation.sample_ring(
  metric_key,bucket,observed_at,value
)
SELECT 'runner.progress_identity',incoming.bucket,incoming.observed_at,incoming.value
FROM unnest($1::integer[],$2::timestamptz[],$3::numeric[])
  AS incoming(bucket,observed_at,value)
ON CONFLICT (metric_key,bucket) DO UPDATE SET
  observed_at=EXCLUDED.observed_at,
  value=EXCLUDED.value`;

const PROGRESS_SEQUENCE_UPSERT = `INSERT INTO observation.sample_ring(
  metric_key,bucket,observed_at,value
)
SELECT 'runner.progress_sequence',incoming.bucket,incoming.observed_at,incoming.value
FROM unnest($1::integer[],$2::timestamptz[],$3::numeric[])
  AS incoming(bucket,observed_at,value)
ON CONFLICT (metric_key,bucket) DO UPDATE SET
  observed_at=EXCLUDED.observed_at,
  value=EXCLUDED.value`;

function encodeUuid(uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_UUID");
  return BigInt(`0x${uuid.replaceAll("-", "")}`).toString(10);
}

function decodeUuid(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_IDENTITY");
  }
  const numeric = BigInt(value);
  if (numeric > MAX_UUID_VALUE) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_IDENTITY");
  }
  const hex = numeric.toString(16).padStart(32, "0");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!UUID_PATTERN.test(uuid)) throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_IDENTITY");
  return uuid;
}

function parseSequence(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_SEQUENCE");
  }
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence)) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_SEQUENCE");
  }
  return sequence;
}

function assertBucket(bucket: number, capacity: number): void {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= capacity) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_BUCKET");
  }
}

function assertDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_TIME");
  }
}

function uniqueReady(rows: readonly ReadyWorkItem[]): readonly ReadyWorkItem[] {
  const byIdentity = new Map<string, ReadyWorkItem>();
  for (const row of rows) {
    encodeUuid(row.workItemId);
    if (!byIdentity.has(row.workItemId)) byIdentity.set(row.workItemId, row);
  }
  return Object.freeze([...byIdentity.values()]);
}

function uniqueProgress(rows: readonly InFlightRunProgress[]): readonly InFlightRunProgress[] {
  const byIdentity = new Map<string, InFlightRunProgress>();
  for (const row of rows) {
    encodeUuid(row.runId);
    if (!Number.isSafeInteger(row.latestProgressSeq) || row.latestProgressSeq < 0) {
      throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_SEQUENCE");
    }
    const prior = byIdentity.get(row.runId);
    if (prior !== undefined && prior.latestProgressSeq !== row.latestProgressSeq) {
      throw new Error("OBSERVATION_DETECTOR_CLOCK_CONFLICTING_SEQUENCE");
    }
    byIdentity.set(row.runId, row);
  }
  return Object.freeze([...byIdentity.values()]);
}

function freeBuckets(capacity: number, occupied: ReadonlySet<number>): number[] {
  const free: number[] = [];
  for (let bucket = 0; bucket < capacity; bucket += 1) {
    if (!occupied.has(bucket)) free.push(bucket);
  }
  return free;
}

function parseReady(rows: readonly StoredClockRow[], capacity: number): Map<string, ClockEntry> {
  const entries = new Map<string, ClockEntry>();
  for (const row of rows) {
    assertBucket(row.bucket, capacity);
    assertDate(row.observed_at);
    const identity = decodeUuid(row.value);
    if (entries.has(identity)) throw new Error("OBSERVATION_DETECTOR_CLOCK_DUPLICATE_IDENTITY");
    entries.set(identity, Object.freeze({
      identity, bucket: row.bucket, observedAt: row.observed_at
    }));
  }
  return entries;
}

function parseProgress(
  identityRows: readonly StoredClockRow[],
  sequenceRows: readonly StoredClockRow[],
  capacity: number
): Map<string, ProgressEntry> {
  const identityByBucket = new Map<number, StoredClockRow>();
  const sequenceByBucket = new Map<number, StoredClockRow>();
  for (const row of identityRows) {
    assertBucket(row.bucket, capacity);
    assertDate(row.observed_at);
    identityByBucket.set(row.bucket, row);
  }
  for (const row of sequenceRows) {
    assertBucket(row.bucket, capacity);
    assertDate(row.observed_at);
    sequenceByBucket.set(row.bucket, row);
  }
  if (identityByBucket.size !== sequenceByBucket.size) {
    throw new Error("OBSERVATION_DETECTOR_CLOCK_UNPAIRED_PROGRESS");
  }
  const entries = new Map<string, ProgressEntry>();
  for (const [bucket, identityRow] of identityByBucket) {
    const sequenceRow = sequenceByBucket.get(bucket);
    if (sequenceRow === undefined
      || sequenceRow.observed_at.getTime() !== identityRow.observed_at.getTime()) {
      throw new Error("OBSERVATION_DETECTOR_CLOCK_UNPAIRED_PROGRESS");
    }
    const identity = decodeUuid(identityRow.value);
    if (entries.has(identity)) throw new Error("OBSERVATION_DETECTOR_CLOCK_DUPLICATE_IDENTITY");
    entries.set(identity, Object.freeze({
      identity,
      bucket,
      observedAt: identityRow.observed_at,
      sequence: parseSequence(sequenceRow.value)
    }));
  }
  return entries;
}

function planReady(
  currentRows: readonly ReadyWorkItem[],
  stored: ReadonlyMap<string, ClockEntry>,
  capacity: number,
  now: Date
): Readonly<{ clocks: Map<string, Date>; writes: readonly ClockEntry[]; exhausted: boolean }> {
  const current = uniqueReady(currentRows);
  const retained = current.flatMap((row) => {
    const entry = stored.get(row.workItemId);
    return entry === undefined ? [] : [entry];
  });
  const occupied = new Set(retained.map((entry) => entry.bucket));
  const newRows = current.filter((row) => !stored.has(row.workItemId));
  const free = freeBuckets(capacity, occupied);
  if (newRows.length > free.length) {
    return Object.freeze({
      clocks: new Map(retained.map((entry) => [entry.identity, entry.observedAt])),
      writes: Object.freeze([]),
      exhausted: true
    });
  }
  const writes = newRows.map((row, index) => Object.freeze({
    identity: row.workItemId, bucket: free[index]!, observedAt: now
  }));
  const entries = [...retained, ...writes];
  return Object.freeze({
    clocks: new Map(entries.map((entry) => [entry.identity, entry.observedAt])),
    writes: Object.freeze(writes),
    exhausted: false
  });
}

function planProgress(
  currentRows: readonly InFlightRunProgress[],
  stored: ReadonlyMap<string, ProgressEntry>,
  capacity: number,
  now: Date
): Readonly<{
  clocks: Map<string, Readonly<{ sequence: number; at: Date }>>;
  writes: readonly ProgressEntry[];
  exhausted: boolean;
}> {
  const current = uniqueProgress(currentRows);
  const retained = current.flatMap((row) => {
    const entry = stored.get(row.runId);
    return entry === undefined ? [] : [entry];
  });
  const changed = current.flatMap((row) => {
    const entry = stored.get(row.runId);
    if (entry === undefined) return [];
    if (row.latestProgressSeq < entry.sequence) {
      throw new Error("OBSERVATION_DETECTOR_CLOCK_SEQUENCE_REGRESSION");
    }
    return row.latestProgressSeq === entry.sequence
      ? []
      : [Object.freeze({ ...entry, sequence: row.latestProgressSeq, observedAt: now })];
  });
  const changedByIdentity = new Map(changed.map((entry) => [entry.identity, entry]));
  const currentRetained = retained.map((entry) => changedByIdentity.get(entry.identity) ?? entry);
  const occupied = new Set(retained.map((entry) => entry.bucket));
  const newRows = current.filter((row) => !stored.has(row.runId));
  const free = freeBuckets(capacity, occupied);
  if (newRows.length > free.length) {
    return Object.freeze({
      clocks: new Map(currentRetained.map((entry) => [
        entry.identity, Object.freeze({ sequence: entry.sequence, at: entry.observedAt })
      ])),
      writes: Object.freeze(changed),
      exhausted: true
    });
  }
  const newEntries = newRows.map((row, index) => Object.freeze({
    identity: row.runId,
    bucket: free[index]!,
    observedAt: now,
    sequence: row.latestProgressSeq
  }));
  const entries = current.map((row) => changedByIdentity.get(row.runId)
    ?? stored.get(row.runId)
    ?? newEntries.find((entry) => entry.identity === row.runId)!);
  return Object.freeze({
    clocks: new Map(entries.map((entry) => [
      entry.identity, Object.freeze({ sequence: entry.sequence, at: entry.observedAt })
    ])),
    writes: Object.freeze([...changed, ...newEntries]),
    exhausted: false
  });
}

async function writeReady(client: ObservationQueryClient, writes: readonly ClockEntry[]) {
  if (writes.length === 0) return;
  await client.query(READY_UPSERT, [
    writes.map((entry) => entry.bucket),
    writes.map((entry) => entry.observedAt),
    writes.map((entry) => encodeUuid(entry.identity))
  ]);
}

async function writeProgress(client: ObservationQueryClient, writes: readonly ProgressEntry[]) {
  if (writes.length === 0) return;
  const buckets = writes.map((entry) => entry.bucket);
  const times = writes.map((entry) => entry.observedAt);
  await client.query(PROGRESS_IDENTITY_UPSERT, [
    buckets, times, writes.map((entry) => encodeUuid(entry.identity))
  ]);
  await client.query(PROGRESS_SEQUENCE_UPSERT, [
    buckets, times, writes.map((entry) => entry.sequence.toString(10))
  ]);
}

export class DetectorClockStore {
  private readonly database: ObservationDatabasePort;
  private readonly capacity: number;

  constructor(database: ObservationDatabasePort, capacity = DEFAULT_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > DEFAULT_CAPACITY) {
      throw new Error("OBSERVATION_DETECTOR_CLOCK_INVALID_CAPACITY");
    }
    this.database = database;
    this.capacity = capacity;
  }

  async reconcile(input: Readonly<{
    now: Date;
    ready: readonly ReadyWorkItem[];
    progress: readonly InFlightRunProgress[];
  }>): Promise<DetectorClocks> {
    assertDate(input.now);
    return this.database.withClient(async (client) => {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = 2000");
      await client.query(CLOCK_LOCK, [...DETECTOR_CLOCK_LOCK]);
      const result = await client.query<StoredClockRow>(CLOCK_SELECT);
      const readyStored = parseReady(
        result.rows.filter((row) => row.metric_key === DETECTOR_CLOCK_KEYS.readyIdentity),
        this.capacity
      );
      const progressStored = parseProgress(
        result.rows.filter((row) => row.metric_key === DETECTOR_CLOCK_KEYS.progressIdentity),
        result.rows.filter((row) => row.metric_key === DETECTOR_CLOCK_KEYS.progressSequence),
        this.capacity
      );
      const ready = planReady(input.ready, readyStored, this.capacity, input.now);
      const progress = planProgress(input.progress, progressStored, this.capacity, input.now);
      await writeReady(client, ready.writes);
      await writeProgress(client, progress.writes);
      await client.query("COMMIT");
      const exhausted = new Set<DetectorFamily>();
      if (ready.exhausted) exhausted.add("READY");
      if (progress.exhausted) exhausted.add("PROGRESS");
      return Object.freeze({
        readyFirstObserved: ready.clocks,
        progressLastChanged: progress.clocks,
        exhausted
      });
    });
  }
}
