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
 * No plaintext key material is RETAINED here and none reaches a printed line.
 * The stores re-wrap and verify their own records behind their own seams and
 * return counts; the support port returns wrapped bytes and verifies in place.
 * Nothing in a RotationStoreReport can carry key bytes — counts, record ids and
 * typed codes only.
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

/** One record the pass could not settle, with WHY — the codes mean different things. */
export type RotationRefusal = Readonly<{ ref: string;code: string }>;

export type RotationCounts = Readonly<{
  rewrapped: number;
  alreadyCurrent: number;
  tombstonesSkipped: number;
  /**
   * A re-wrap the store accepted but the repository declined, because the row
   * changed underneath — a concurrent shred, almost always. Not a failure: the
   * other actor won, correctly. Counted so the five counts sum to the records
   * seen, which is how a silently dropped record would show.
   */
  declined: number;
  unreadable: number;
}>;

export type RotationStoreReport = Readonly<{
  store: string;
  /** The non-secret label of the key this pass rotated TO. */
  kekId: string;
  counts: RotationCounts;
  /** How many records opened under the CURRENT KEK alone, after the re-wrap. */
  verified: number;
  /**
   * Records the pass could not settle, each with the typed code that refused it.
   * "Unreadable" covers three different faults — a custody refusal, a label
   * naming a key this process does not hold, and an authentication failure —
   * and an operator told to investigate these needs to know which. Ids and
   * codes only, never key material.
   */
  unreadableRefs: readonly RotationRefusal[];
}>;

/** The typed code of a thrown refusal, or a marker when it carried none. */
function refusalCode(error: unknown): string {
  const code = (error as { readonly code?: unknown } | null)?.code;
  return typeof code === "string" && code !== "" ? code : "UNTYPED_REFUSAL";
}

/**
 * A store the command could not cover, and the typed reason. `fatal` separates
 * "this deployment does not have that store" — a host that never enabled
 * publication, which must still be able to finish cleanly and retire its old
 * key — from "that store exists and I could not cover it", which must not be
 * able to produce an OK.
 */
export type DeclinedStore = Readonly<{ store: string;code: string;fatal: boolean }>;

/**
 * A rotation is clean only when nothing was left unreadable AND every store was
 * actually covered. The runbook keys key-retirement to this answer, so a store
 * the command never opened must never be able to produce an OK.
 */
export function rotationFailed(
  reports: readonly RotationStoreReport[],
  declined: readonly DeclinedStore[] = []
): boolean {
  return declined.some((entry) => entry.fatal)
    || reports.some((report) => report.counts.unreadable > 0);
}

/**
 * Re-wraps every record of one file store, then verifies each one under the
 * current KEK alone. An unreadable record is counted and named rather than
 * thrown, so one bad record cannot hide how many others are fine — and the run
 * still fails, because `rotationFailed` looks at the count.
 */
export async function rotateFileStore(
  store: string,
  keys: RotatableKeyStore,
  kekId: string
): Promise<RotationStoreReport> {
  let rewrapped = 0;
  let alreadyCurrent = 0;
  let verified = 0;
  const unreadableRefs: RotationRefusal[] = [];
  for (const ref of await keys.listKeyRefs()) {
    let outcome: KeyRotationOutcome;
    try {
      outcome = await keys.rewrapUnderCurrentKek(ref);
    } catch (error) {
      // A re-wrap that fails BEFORE the rename leaves the record untouched; one
      // that fails after it has already landed, and the next pass reports that
      // record ALREADY_CURRENT. Either way nothing is half-written.
      unreadableRefs.push(Object.freeze({ ref, code: refusalCode(error) }));
      continue;
    }
    if (outcome === "REWRAPPED") rewrapped += 1; else alreadyCurrent += 1;
    try {
      await keys.verifyUnderCurrentKek(ref);
      verified += 1;
    } catch (error) {
      unreadableRefs.push(Object.freeze({ ref, code: refusalCode(error) }));
    }
  }
  return Object.freeze({
    store,
    kekId,
    counts: Object.freeze({
      rewrapped,
      alreadyCurrent,
      tombstonesSkipped: 0,
      declined: 0,
      unreadable: unreadableRefs.length
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
  let declined = 0;
  const unreadableRefs: RotationRefusal[] = [];
  let batch: SupportKeyReplacement[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const changed = await repository.replaceWrappedKeys(batch);
    rewrapped += changed;
    // A row the optimistic UPDATE declined changed underneath — a concurrent
    // shred, almost always. The other actor won, correctly. Counted rather than
    // dropped, so the counts still sum to the records seen.
    declined += batch.length - changed;
    batch = [];
  };

  for (const row of await repository.listWrappedKeys()) {
    if (row.destroyed) {
      tombstonesSkipped += 1;
      continue;
    }
    let outcome;
    try {
      outcome = await keys.rewrapDataKey(supportHandle(row), row.wrappedKey);
    } catch (error) {
      unreadableRefs.push(Object.freeze({
        ref: supportLabel(row), code: refusalCode(error)
      }));
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
  // believes it wrote — and through verifyUnderCurrentKek, which ignores the
  // previous key. unwrapDataKey would NOT do: it is current-then-previous by
  // construction, so a row written under the old key between the re-wrap and
  // this loop would verify clean, the run would print OK, and the operator
  // would then retire a key those rows still need.
  let verified = 0;
  const alreadyRefused = new Set(unreadableRefs.map((refusal) => refusal.ref));
  for (const row of await repository.listWrappedKeys()) {
    if (row.destroyed) continue;
    const label = supportLabel(row);
    if (alreadyRefused.has(label)) continue;
    try {
      await keys.verifyUnderCurrentKek(supportHandle(row), row.wrappedKey);
      verified += 1;
    } catch (error) {
      unreadableRefs.push(Object.freeze({ ref: label, code: refusalCode(error) }));
    }
  }

  return Object.freeze({
    store: "support",
    kekId: keys.currentKekId(),
    counts: Object.freeze({
      rewrapped, alreadyCurrent, tombstonesSkipped, declined, unreadable: unreadableRefs.length
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
export function renderRotationReport(
  reports: readonly RotationStoreReport[],
  declined: readonly DeclinedStore[] = []
): string {
  const lines = reports.map((report) => [
    `${report.store} (kek ${report.kekId}):`,
    `${report.counts.rewrapped} re-wrapped,`,
    `${report.counts.alreadyCurrent} already current,`,
    `${report.counts.tombstonesSkipped} tombstones skipped,`,
    `${report.counts.declined} declined by a concurrent change,`,
    `${report.counts.unreadable} unreadable,`,
    `${report.verified} verified under the current KEK`
  ].join(" "));
  const refusals = reports.flatMap((report) =>
    report.unreadableRefs.map((refusal) =>
      `  unreadable ${report.store} ${refusal.ref} ${refusal.code}`));
  // A store the command did not cover is named either way: the difference
  // between "nothing to do" and "I never looked" belongs in the output, not in
  // the exit code alone.
  const notCovered = declined.map((entry) => entry.fatal
    ? `  NOT COVERED ${entry.store} ${entry.code}`
    : `  declined by configuration ${entry.store} ${entry.code}`);
  const failed = rotationFailed(reports, declined);
  return [
    ...lines,
    ...refusals,
    ...notCovered,
    failed
      ? "KEYS_ROTATE_KEK_FAILED — the previous KEK must NOT be retired"
      : "KEYS_ROTATE_KEK_OK"
  ].join("\n");
}
