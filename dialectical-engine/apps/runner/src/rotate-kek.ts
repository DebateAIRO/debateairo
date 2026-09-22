/**
 * V-3 — master-key (KEK) rotation. The decision logic of `pnpm keys:rotate-kek`,
 * kept free of process wiring so every property an operator relies on is a unit
 * test: the counts, the ordering, the batching, the idempotence, the resumption
 * and the failure exit. `rotate-kek-cli.ts` is the only thing that opens a key
 * file or a database connection.
 *
 * Content is never re-encrypted. A KEK wraps data keys, nothing else; run
 * content keys are wrapped by the user DEK rather than by a KEK, so re-wrapping
 * a user-DEK record leaves every run that depends on it readable without a
 * single byte of content being touched.
 *
 * Plaintext key material never reaches this module. The stores re-wrap and
 * verify their own records and return counts; the support port returns wrapped
 * bytes only.
 */
import type { KeyRotationOutcome, RotatableKeyStore } from "@debateai/crypto";
import type { SupportKeyHandle, SupportKeyPort } from "../../api/src/support/keys.js";

export type SupportKeyKind = "session" | "case";

export type SupportWrappedKeyRow = Readonly<{
  kind: SupportKeyKind;
  /** `session_id` or `case_id`. */
  ref: string;
  wrappedKey: Uint8Array;
  /** `destroyed_at IS NOT NULL` — a SUP-07 tombstone. */
  destroyed: boolean;
}>;

export type SupportKeyReplacement = Readonly<{
  kind: SupportKeyKind;
  ref: string;
  /**
   * The bytes this rotation read. The repository replaces the row only if they
   * are still there, so a shred landing mid-rotation is never clobbered.
   */
  previous: Uint8Array;
  next: Uint8Array;
}>;

/**
 * The seam over `support.session_key.wrapped_key` and `support.case_key.wrapped_key`.
 * The transaction boundary belongs to the implementation: `replaceWrappedKeys`
 * applies a whole batch atomically or not at all.
 */
export interface SupportKeyRotationRepository {
  listWrappedKeys(): Promise<readonly SupportWrappedKeyRow[]>;
  replaceWrappedKeys(replacements: readonly SupportKeyReplacement[]): Promise<number>;
}

/**
 * How many rows go into one transaction.
 *
 * Every UPDATE on either key table fires `support.mark_shred_integrity_dirty()`,
 * and a deferred constraint trigger then runs `support.assert_shred_integrity()`
 * at COMMIT — a full consistency scan of both key tables against their parents,
 * serialised on a `FOR UPDATE` of a singleton guard row. So the cost of a
 * rotation is one full scan per TRANSACTION, not per row: a row at a time would
 * be O(rows x table). Batching trades that against how long the guard row is
 * held, which blocks concurrent support writes, and against how much work an
 * interrupted batch repeats — nothing is half-written, because a batch is one
 * transaction, and the re-done rows are already-current no-ops on resume.
 */
const SUPPORT_ROTATION_BATCH_SIZE = 100;

export type RotationCounts = Readonly<{
  rewrapped: number;
  alreadyCurrent: number;
  tombstonesSkipped: number;
  unreadable: number;
}>;

export type RotationStoreReport = Readonly<{
  store: string;
  counts: RotationCounts;
  /** How many records opened under the CURRENT KEK alone, after the re-wrap. */
  verified: number;
  /** Record ids that opened under no held key. Ids only, never key material. */
  unreadableRefs: readonly string[];
}>;

/** A rotation is only clean when nothing was left unreadable. */
export function rotationFailed(reports: readonly RotationStoreReport[]): boolean {
  return reports.some((report) => report.counts.unreadable > 0);
}

/**
 * Re-wraps every record of one file store, then verifies each one under the
 * current KEK alone. An unreadable record is counted and named rather than
 * thrown, so one bad record cannot hide how many others are fine — and the run
 * still fails, because `rotationFailed` looks at the count.
 */
export async function rotateFileStore(
  store: string,
  keys: RotatableKeyStore
): Promise<RotationStoreReport> {
  let rewrapped = 0;
  let alreadyCurrent = 0;
  let verified = 0;
  const unreadableRefs: string[] = [];
  for (const ref of await keys.listKeyRefs()) {
    let outcome: KeyRotationOutcome;
    try {
      outcome = await keys.rewrapUnderCurrentKek(ref);
    } catch {
      // The record's own bytes are untouched: the re-wrap republishes through an
      // atomic rename or not at all.
      unreadableRefs.push(ref);
      continue;
    }
    if (outcome === "REWRAPPED") rewrapped += 1; else alreadyCurrent += 1;
    try {
      await keys.verifyUnderCurrentKek(ref);
      verified += 1;
    } catch {
      unreadableRefs.push(ref);
    }
  }
  return Object.freeze({
    store,
    counts: Object.freeze({
      rewrapped, alreadyCurrent, tombstonesSkipped: 0, unreadable: unreadableRefs.length
    }),
    verified,
    unreadableRefs: Object.freeze([...unreadableRefs])
  });
}

function supportHandle(row: SupportWrappedKeyRow): SupportKeyHandle {
  return Object.freeze({ kind: row.kind, ref: row.ref });
}

function supportLabel(row: Readonly<{ kind: SupportKeyKind;ref: string }>): string {
  return `${row.kind}:${row.ref}`;
}

/**
 * Re-wraps the two support key columns. The rows are processed in the order the
 * repository returns them and written in batches; the verification pass then
 * re-reads what the repository now holds and opens every live row under the
 * current KEK alone.
 */
export async function rotateSupportKeys(
  repository: SupportKeyRotationRepository,
  keys: SupportKeyPort,
  batchSize: number = SUPPORT_ROTATION_BATCH_SIZE
): Promise<RotationStoreReport> {
  let rewrapped = 0;
  let alreadyCurrent = 0;
  let tombstonesSkipped = 0;
  const unreadableRefs: string[] = [];
  let batch: SupportKeyReplacement[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    rewrapped += await repository.replaceWrappedKeys(batch);
    batch = [];
  };

  for (const row of await repository.listWrappedKeys()) {
    // A destroyed row is a tombstone whatever its bytes say; the port also
    // recognises the 61 zero bytes on its own.
    if (row.destroyed) {
      tombstonesSkipped += 1;
      continue;
    }
    let outcome;
    try {
      outcome = await keys.rewrapDataKey(supportHandle(row), row.wrappedKey);
    } catch {
      unreadableRefs.push(supportLabel(row));
      continue;
    }
    if (outcome.outcome === "TOMBSTONE") {
      tombstonesSkipped += 1;
      continue;
    }
    if (outcome.outcome === "ALREADY_CURRENT") {
      alreadyCurrent += 1;
      continue;
    }
    batch.push(Object.freeze({
      kind: row.kind,
      ref: row.ref,
      previous: row.wrappedKey,
      next: outcome.wrapped.bytes
    }));
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  // Verify against what the repository now holds, not against what this pass
  // believes it wrote.
  let verified = 0;
  for (const row of await repository.listWrappedKeys()) {
    if (row.destroyed) continue;
    if (unreadableRefs.includes(supportLabel(row))) continue;
    try {
      const dataKey = await keys.unwrapDataKey(supportHandle(row), row.wrappedKey);
      dataKey.fill(0);
      verified += 1;
    } catch {
      unreadableRefs.push(supportLabel(row));
    }
  }

  return Object.freeze({
    store: "support",
    counts: Object.freeze({
      rewrapped, alreadyCurrent, tombstonesSkipped, unreadable: unreadableRefs.length
    }),
    verified,
    unreadableRefs: Object.freeze([...unreadableRefs])
  });
}

/**
 * The operator-facing report. Counts and record ids only — there is nothing in
 * a `RotationStoreReport` that could carry key material, and a test asserts no
 * long base64-shaped run ever appears in the text.
 */
export function renderRotationReport(reports: readonly RotationStoreReport[]): string {
  const lines = reports.map((report) => [
    `${report.store}:`,
    `${report.counts.rewrapped} re-wrapped,`,
    `${report.counts.alreadyCurrent} already current,`,
    `${report.counts.tombstonesSkipped} tombstones skipped,`,
    `${report.counts.unreadable} unreadable,`,
    `${report.verified} verified under the current KEK`
  ].join(" "));
  const unreadable = reports.flatMap((report) =>
    report.unreadableRefs.map((ref) => `  unreadable ${report.store} ${ref}`));
  const failed = rotationFailed(reports);
  return [
    ...lines,
    ...unreadable,
    failed
      ? "KEYS_ROTATE_KEK_FAILED — the previous KEK must NOT be retired"
      : "KEYS_ROTATE_KEK_OK"
  ].join("\n");
}
