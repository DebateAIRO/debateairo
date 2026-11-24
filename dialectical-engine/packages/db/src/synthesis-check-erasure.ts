import type { Pool } from "pg";
import { isRunContentKeyRecordMissing, type PublicationCipher, type RunContentKeyStore } from "@debateai/crypto";
import { finalizeWithPageMemory } from "./erasure-page-memory.js";
import { withPublicationContentLease } from "./publication-lease.js";

const SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES = Object.freeze([
  "PUBLISHED", "LEGACY_PLAINTEXT_RETAINED", "OWNERSHIP_MOVED"
] as const);

export type SynthesisCheckErasureOutcome =
  | "ACCOUNT_CLOSED" | "ERASED" | "OWNERSHIP_MOVED" | "LEGACY_PLAINTEXT_RETAINED"
  | "PUBLISHED" | "CONTENDED" | "PREPARED" | "COMMITTED" | "CLEANED"
  | "NOT_FOUND" | "INVALID_EVIDENCE" | CheckDeletedPublicDebateOutcome;

/**
 * 0190's takedown of a public debate the end-of-debate check deletes, on the requests it can act on now. TAKEN_DOWN: its page
 * went private, every page it had is closed, and its publication's key is queued for the API's key cleanup; 0126's prepare
 * erases it once that key is gone. CONTENDED: busy now; the next pass tries again. FAILED: something else went wrong for that
 * debate alone (`failureCode`, its SQLSTATE); nothing of it was written, and the next pass tries again.
 */
export type CheckDeletedPublicDebateOutcome = "TAKEN_DOWN" | "CONTENDED" | "FAILED";
export type CheckDeletedPublicDebate = Readonly<{ outcome: CheckDeletedPublicDebateOutcome; runId: string; failureCode: string | null }>;
export type CheckDeletedPublicPages = Readonly<{
  takeDown(limit?: number): Promise<readonly CheckDeletedPublicDebate[]>;
}>;
/** A SQLSTATE is five digits or capitals; anything else is logged as unknown, so a log line never carries more. */
const sqlStateOf = (code: string | null): string => code !== null && /^[0-9A-Z]{5}$/u.test(code) ? code : "UNKNOWN";

type PrepareOutcome = Readonly<{ outcome: SynthesisCheckErasureOutcome; erasureId: string | null; runId: string }>;
type CleanupManifest = Readonly<{
  runId: string;
  ownerRef: string;
  cleanupPublicationRefs: readonly string[];
}>;

/** NV-10: the published owner of a run key, or null when its directory holds no published record (nothing usable). */
async function recordedOwnerRef(runs: RunContentKeyStore, runId: string): Promise<string | null> {
  try { return await runs.ownerRef(runId); }
  catch (error) { if (isRunContentKeyRecordMissing(error)) return null; throw error; }
}

/**
 * 0190's core.take_down_check_deleted_debates, on the API's system pool outside any request (the cross-account marker's, as the
 * Free publish's). Never the erasure login's: the API attests at start that it can run exactly the functions it knows.
 */
export class PostgresCheckDeletedPublicPageRepository implements CheckDeletedPublicPages {
  constructor(private readonly pool: Pool) {}

  async takeDown(limit = 100): Promise<readonly CheckDeletedPublicDebate[]> {
    const result = await this.pool.query<{ outcome: CheckDeletedPublicDebateOutcome; run_id: string; failure_code: string | null }>(
      "SELECT outcome,run_id,failure_code FROM core.take_down_check_deleted_debates($1)", [limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({ outcome: row.outcome, runId: row.run_id, failureCode: row.failure_code })));
  }
}

/** The SQL principal has only definer capabilities; it never reads check rows directly. */
export class PostgresSynthesisCheckErasureRepository {
  constructor(private readonly pool: Pool) {}

  async prepareRequested(limit = 100): Promise<readonly PrepareOutcome[]> {
    const result = await this.pool.query<{ outcome: SynthesisCheckErasureOutcome; erasure_id: string | null; run_id: string }>(
      "SELECT * FROM core.prepare_synthesis_check_erasures($1)", [limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      outcome: row.outcome, erasureId: row.erasure_id, runId: row.run_id
    })));
  }

  async pendingCleanup(limit = 100): Promise<readonly string[]> {
    const result = await this.pool.query<{ erasure_id: string }>(
      "SELECT erasure_id FROM core.pending_synthesis_check_erasure_cleanup($1)", [limit]);
    return Object.freeze(result.rows.map((row) => row.erasure_id));
  }

  async manifest(erasureId: string): Promise<CleanupManifest | null> {
    // 0040's manifest inspects the common private-run cleanup intent and its first owner.
    const result = await this.pool.query<{
      run_id: string; owner_ref: string; cleanup_publication_refs: string[];
    }>("SELECT * FROM core.private_run_erasure_manifest($1)", [erasureId]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      runId: row.run_id, ownerRef: row.owner_ref,
      cleanupPublicationRefs: Object.freeze([...row.cleanup_publication_refs])
    });
  }

  withPublicationLease<T>(publicationRef: string, use: () => Promise<T>): Promise<T> {
    return withPublicationContentLease(this.pool, [publicationRef], async () => use());
  }

  async finalize(input: Readonly<{
    erasureId: string;
    keyCleanupCompletedAt: Date;
    occurredAt: Date;
    destroyedKeyCount: 0 | 1;
    alreadyAbsentKeyCount: 0 | 1;
  }>): Promise<SynthesisCheckErasureOutcome> {
    // R22 item 16: a removed debate's page memory (0131) goes in this same transaction (erasure-page-memory.ts).
    const outcome = await finalizeWithPageMemory<SynthesisCheckErasureOutcome>(this.pool, input.erasureId,
      "SELECT core.finalize_synthesis_check_erasure($1,$2,$3,$4,$5) AS outcome",
      [input.erasureId,input.keyCleanupCompletedAt,input.occurredAt,
        input.destroyedKeyCount,input.alreadyAbsentKeyCount]
    );
    return outcome ?? "NOT_FOUND";
  }
}

/**
 * One pass over the end-of-debate check's deletions. A debate that is public comes down first (`publicPages`, 0190): its page
 * goes private and its publication's key goes to the API's key cleanup, which destroys it on its own timer; a later pass then
 * erases the debate through 0126's prepare, as a private one. Without `publicPages` a public debate waits, as before 0190.
 */
export class SynthesisCheckErasureCoordinator {
  constructor(
    private readonly repository: PostgresSynthesisCheckErasureRepository,
    private readonly runs: RunContentKeyStore,
    private readonly publications?: Pick<PublicationCipher, "destroy" | "exists">,
    private readonly log: (line: string) => void = (line) => console.error(line),
    private readonly publicPages?: CheckDeletedPublicPages
  ) {}

  private async completePrepared(erasureId: string, manifest: CleanupManifest): Promise<SynthesisCheckErasureOutcome> {
    // NV-10 (security fixes run 3): a record-less directory the manifest names is this run's half-destroyed key; it is
    // destroyed below, as the account and private-run erasures do (account-erasure.ts, recordedOwnerRef).
    const manifestOwner = await this.runs.exists(manifest.runId) ? await recordedOwnerRef(this.runs, manifest.runId) : null;
    if (manifestOwner !== null && manifestOwner !== manifest.ownerRef) return "INVALID_EVIDENCE";
    if (manifest.cleanupPublicationRefs.length > 0 && this.publications === undefined) {
      return "INVALID_EVIDENCE";
    }
    for (const publicationRef of manifest.cleanupPublicationRefs) {
      const absent = await this.repository.withPublicationLease(publicationRef, async () => {
        await this.publications!.destroy(publicationRef);
        return !await this.publications!.exists(publicationRef);
      });
      if (!absent) return "INVALID_EVIDENCE";
    }
    const destroyResult = await this.runs.destroy(manifest.runId);
    if (await this.runs.exists(manifest.runId)) return "INVALID_EVIDENCE";
    const now = new Date();
    const finalized = await this.repository.finalize({
      erasureId, keyCleanupCompletedAt: now, occurredAt: now,
      destroyedKeyCount: destroyResult === "DESTROYED" ? 1 : 0,
      alreadyAbsentKeyCount: destroyResult === "ALREADY_ABSENT" ? 1 : 0
    });
    return finalized === "COMMITTED" || finalized === "CLEANED" ? "CLEANED" : finalized;
  }

  async reconcile(limit = 100): Promise<readonly Readonly<{
    runId: string;
    outcome: SynthesisCheckErasureOutcome;
  }>[]> {
    const outcomes: Array<{ runId: string; outcome: SynthesisCheckErasureOutcome }> = [];
    const waiting = (outcome: SynthesisCheckErasureOutcome): void => {
      if (SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES.includes(outcome as typeof SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES[number])) {
        this.log("[SYNTHESIS_CHECK_ERASURE_WAITING] " + outcome);
      }
    };
    // The public ones first: 0126's prepare reads them as PUBLISHED, or as CONTENDED until their publication's key is gone,
    // so each is reported once, by what the takedown said. A public one the takedown cannot act on is not on its list, and
    // prepare reports it as before (PUBLISHED for an account with no session row).
    // A takedown that fails as a whole holds back none of the private debates' erasures: it is tried again on the next pass.
    let pages: readonly CheckDeletedPublicDebate[] = [];
    try {
      if (this.publicPages !== undefined) pages = await this.publicPages.takeDown(limit);
    } catch {
      this.log("[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEDOWN_PENDING]");
    }
    const takenDown = new Set<string>();
    for (const page of pages) {
      takenDown.add(page.runId);
      if (page.outcome === "TAKEN_DOWN") this.log("[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEN_DOWN]");
      if (page.outcome === "FAILED") this.log("[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEDOWN_FAILED] " + sqlStateOf(page.failureCode));
      outcomes.push({ runId: page.runId, outcome: page.outcome });
    }
    for (const prepared of await this.repository.prepareRequested(limit)) {
      if (takenDown.has(prepared.runId) && (prepared.outcome === "PUBLISHED" || prepared.outcome === "CONTENDED")) continue;
      waiting(prepared.outcome);
      if (prepared.outcome !== "PREPARED") outcomes.push({ runId: prepared.runId, outcome: prepared.outcome });
    }
    for (const erasureId of await this.repository.pendingCleanup(limit)) {
      let manifest: CleanupManifest | null;
      try {
        manifest = await this.repository.manifest(erasureId);
      } catch {
        outcomes.push({ runId: erasureId, outcome: "INVALID_EVIDENCE" });
        continue;
      }
      if (manifest === null) {
        outcomes.push({ runId: erasureId, outcome: "NOT_FOUND" });
        continue;
      }
      try {
        outcomes.push({ runId: manifest.runId, outcome: await this.completePrepared(erasureId, manifest) });
      } catch {
        outcomes.push({ runId: manifest.runId, outcome: "INVALID_EVIDENCE" });
      }
    }
    return Object.freeze(outcomes.map((outcome) => Object.freeze(outcome)));
  }
}
