import type { Pool } from "pg";
import { withWriteTransaction } from "@debateai/db";
import { PREVIEW_TEAM_ONLY, PREVIEW_TEAM_RUNS_SQL } from "@debateai/providers";

/**
 * Step 1 (GAP-RUNNER, 2026-10-09) — THE TEAM RULE AT THE RUNNER'S START.
 *
 * On the private preview only the team may start debates. The API refuses everyone else at
 * the route (403 PREVIEW_TEAM_ONLY) and its waker records an outsider's existing run FAILED
 * (RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY). The runner's own start-up re-dispatches every READY or
 * lapsed-CLAIMED job without asking the API, and the job system may still hold an older
 * dispatch for any open job. So, BEFORE this process registers its worker, every claimable job
 * (READY, or CLAIMED with a lapsed claim: exactly what `claimById` takes) whose run no team
 * member owns is recorded FAILED with that same reason. A FAILED job is never claimable, so no
 * later dispatch can run it. The write is guarded on the same claimable condition, so it never
 * overwrites a job that went DONE or FAILED (and the reason the API wrote) in between.
 *
 * An outsider's job with a LIVE claim refuses the start instead of being failed: a live claim
 * means some runner is executing that job right now, and failing it underneath would race that
 * runner's own settle or failure write. The operator finds that runner first; once the claim
 * lapses the next start fails the job here. A team member's live claim is left alone.
 *
 * Off the preview nothing is read and nothing changes. On the preview with no team listed the
 * runner refuses to start: the API then starts nothing for anyone, so the runner has no work it
 * may do, and refusing fails nothing (the API's own rule for an empty team). A refusal it
 * cannot record also refuses the start. Ids and codes only in every line.
 */
export const PREVIEW_TEAM_ONLY_REASON = `RUN_SETUP_FAILED:${PREVIEW_TEAM_ONLY}` as const;
/** The same bound as the start-up re-dispatch (`runner-startup-reconciliation.ts`). */
const OPEN_RUN_WORK_LIMIT = 100;

export class RunnerPreviewTeamGateError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RunnerPreviewTeamGateError";
  }
}

export type OpenRunWork = Readonly<{ runId: string; workItemId: string; claimLive: boolean }>;

export type RunnerPreviewTeamGateInput = Readonly<{
  previewConfigured: boolean;
  teamUserIds: readonly string[] | undefined;
  work: Readonly<{
    listOpenRunWork(limit: number): Promise<readonly OpenRunWork[]>;
    /** True only when the job was still claimable (READY or lapsed claim) and is now FAILED. */
    failClaimable(input: Readonly<{ runId: string; workItemId: string; reason: string }>): Promise<boolean>;
  }>;
  teamRuns(runIds: readonly string[], teamUserIds: readonly string[]): Promise<ReadonlySet<string>>;
  log(line: Readonly<Record<string, string | number>>): void;
}>;

export async function refusePreviewOutsiderWork(
  input: RunnerPreviewTeamGateInput
): Promise<Readonly<{ checked: number; refused: number }>> {
  if (!input.previewConfigured) return Object.freeze({ checked: 0, refused: 0 });
  const refuse = (code: string): never => {
    input.log(Object.freeze({ kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_GATE_REFUSED", code }));
    throw new RunnerPreviewTeamGateError(code);
  };
  const team = input.teamUserIds ?? [];
  if (team.length === 0) return refuse("RUNNER_PREVIEW_TEAM_UNSET");
  const open = await input.work.listOpenRunWork(OPEN_RUN_WORK_LIMIT + 1);
  if (open.length > OPEN_RUN_WORK_LIMIT) return refuse("RUNNER_STARTUP_BACKLOG_SATURATED");
  if (open.length === 0) return Object.freeze({ checked: 0, refused: 0 });
  const owned = await input.teamRuns([...new Set(open.map((item) => item.runId))], team);
  const outsiders = open.filter((item) => !owned.has(item.runId));
  // Checked before any write, so a refused start changes nothing.
  if (outsiders.some((item) => item.claimLive)) return refuse("RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE");
  let refused = 0;
  for (const item of outsiders) {
    const recorded = await input.work.failClaimable({
      runId: item.runId, workItemId: item.workItemId, reason: PREVIEW_TEAM_ONLY_REASON
    });
    if (!recorded) return refuse("RUNNER_PREVIEW_TEAM_REFUSAL_UNRECORDED");
    refused += 1;
    input.log(Object.freeze({ kind: "DEBATEAI_RUNNER_STARTUP", event: "PREVIEW_TEAM_ONLY", runId: item.runId }));
  }
  return Object.freeze({ checked: open.length, refused });
}

/** The gate's two reads and one write on the runner's own pool. */
export function postgresRunnerPreviewTeamGateStore(pool: Pool): Pick<RunnerPreviewTeamGateInput, "work" | "teamRuns"> {
  return Object.freeze({
    work: Object.freeze({
      async listOpenRunWork(limit: number): Promise<readonly OpenRunWork[]> {
        const result = await pool.query<{ work_item_id: string; run_id: string; claim_live: boolean }>(
          `SELECT work_item_id, run_id,
                  (state = 'CLAIMED' AND claim_deadline > clock_timestamp()) AS claim_live
           FROM core.work_item
           WHERE run_id IS NOT NULL AND state IN ('READY', 'CLAIMED')
           ORDER BY created_at_seq, work_item_id
           LIMIT $1`,
          [limit]
        );
        return Object.freeze(result.rows.map((row) => Object.freeze({
          runId: row.run_id, workItemId: row.work_item_id, claimLive: row.claim_live === true
        })));
      },
      async failClaimable(failure: Readonly<{ runId: string; workItemId: string; reason: string }>): Promise<boolean> {
        // `recordTerminalFailure`'s write, narrowed to exactly what `claimById` could still take.
        const result = await withWriteTransaction(pool, (client) => client.query(
          `UPDATE core.work_item
           SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL, terminal_reason = $3
           WHERE work_item_id = $1 AND run_id = $2 AND settled_attempt_id IS NULL
             AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))`,
          [failure.workItemId, failure.runId, failure.reason]
        ));
        return result.rowCount === 1;
      }
    }),
    async teamRuns(runIds: readonly string[], teamUserIds: readonly string[]): Promise<ReadonlySet<string>> {
      const result = await pool.query<{ run_id: string }>(PREVIEW_TEAM_RUNS_SQL, [[...runIds], [...teamUserIds]]);
      return new Set(result.rows.map((row) => row.run_id));
    }
  });
}
