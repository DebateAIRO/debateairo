import type { Pool } from "pg";
import type { PublicationCipher, RunContentKeyStore } from "@debateai/crypto";
import { withPublicationContentLease } from "./publication-lease.js";

const SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES = Object.freeze([
  "PUBLISHED", "LEGACY_PLAINTEXT_RETAINED", "OWNERSHIP_MOVED"
] as const);

export type SynthesisCheckErasureOutcome =
  | "ACCOUNT_CLOSED" | "ERASED" | "OWNERSHIP_MOVED" | "LEGACY_PLAINTEXT_RETAINED"
  | "PUBLISHED" | "CONTENDED" | "PREPARED" | "COMMITTED" | "CLEANED"
  | "NOT_FOUND" | "INVALID_EVIDENCE";

type PrepareOutcome = Readonly<{ outcome: SynthesisCheckErasureOutcome; erasureId: string | null; runId: string }>;
type CleanupManifest = Readonly<{
  runId: string;
  ownerRef: string;
  cleanupPublicationRefs: readonly string[];
}>;

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
    const result = await this.pool.query<{ outcome: SynthesisCheckErasureOutcome }>(
      "SELECT core.finalize_synthesis_check_erasure($1,$2,$3,$4,$5) AS outcome",
      [input.erasureId,input.keyCleanupCompletedAt,input.occurredAt,
        input.destroyedKeyCount,input.alreadyAbsentKeyCount]
    );
    return result.rows[0]?.outcome ?? "NOT_FOUND";
  }
}

export class SynthesisCheckErasureCoordinator {
  constructor(
    private readonly repository: PostgresSynthesisCheckErasureRepository,
    private readonly runs: RunContentKeyStore,
    private readonly publications?: Pick<PublicationCipher, "destroy" | "exists">,
    private readonly log: (line: string) => void = (line) => console.error(line)
  ) {}

  private async completePrepared(erasureId: string, manifest: CleanupManifest): Promise<SynthesisCheckErasureOutcome> {
    if (await this.runs.exists(manifest.runId)
      && await this.runs.ownerRef(manifest.runId) !== manifest.ownerRef) return "INVALID_EVIDENCE";
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
    for (const prepared of await this.repository.prepareRequested(limit)) {
      if (SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES.includes(
        prepared.outcome as typeof SYNTHESIS_CHECK_ERASURE_WAITING_OUTCOMES[number]
      )) {
        this.log("[SYNTHESIS_CHECK_ERASURE_WAITING] " + prepared.outcome);
      }
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
