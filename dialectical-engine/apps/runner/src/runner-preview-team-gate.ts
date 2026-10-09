import type { Pool } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { PREVIEW_TEAM_ONLY, PREVIEW_TEAM_RUNS_SQL } from "@debateai/providers";

/**
 * Step 1 (GAP-RUNNER, 2026-10-09) — THE TEAM RULE AT THE RUNNER'S START.
 *
 * On the private preview only the team may start debates. The API refuses everyone else at
 * the route (403 PREVIEW_TEAM_ONLY) and its waker records an outsider's existing run FAILED
 * (RUN_SETUP_FAILED:PREVIEW_TEAM_ONLY). The runner's own start-up re-dispatches every READY or
 * lapsed-CLAIMED job without asking the API, and the job system may still hold an older
 * dispatch for any open job. So, BEFORE this process registers its worker, every open job
 * (READY or CLAIMED: the only two open states) whose run no team member owns is recorded
 * FAILED with that same reason, through the runner's existing terminal-failure write. A FAILED
 * job is never claimable (`claimById` takes READY or a lapsed claim only), so no later dispatch
 * can run it.
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

export type OpenRunWork = Readonly<{ runId: string; workItemId: string }>;

export type RunnerPreviewTeamGateInput = Readonly<{
  previewConfigured: boolean;
  teamUserIds: readonly string[] | undefined;
  work: Readonly<{
    listOpenRunWork(limit: number): Promise<readonly OpenRunWork[]>;
    recordTerminalFailure(input: Readonly<{ runId: string; workItemId: string; reason: string }>): Promise<boolean>;
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
  let refused = 0;
  for (const item of open) {
    if (owned.has(item.runId)) continue;
    const recorded = await input.work.recordTerminalFailure({
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
  const work = new WorkItemRepository(pool);
  return Object.freeze({
    work: Object.freeze({
      async listOpenRunWork(limit: number): Promise<readonly OpenRunWork[]> {
        const result = await pool.query<{ work_item_id: string; run_id: string }>(
          `SELECT work_item_id, run_id
           FROM core.work_item
           WHERE run_id IS NOT NULL AND state IN ('READY', 'CLAIMED')
           ORDER BY created_at_seq, work_item_id
           LIMIT $1`,
          [limit]
        );
        return Object.freeze(result.rows.map((row) => Object.freeze({ runId: row.run_id, workItemId: row.work_item_id })));
      },
      recordTerminalFailure: (failure: Readonly<{ runId: string; workItemId: string; reason: string }>) =>
        work.recordTerminalFailure(failure)
    }),
    async teamRuns(runIds: readonly string[], teamUserIds: readonly string[]): Promise<ReadonlySet<string>> {
      const result = await pool.query<{ run_id: string }>(PREVIEW_TEAM_RUNS_SQL, [[...runIds], [...teamUserIds]]);
      return new Set(result.rows.map((row) => row.run_id));
    }
  });
}
