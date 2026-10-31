import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import type { WebSealed } from "./web-evidence.js";

/**
 * A path's suggestions (migration 0141; plan 2026-10-31-r22-owner-changes decision 9), through 0141's definers only, on the runner's
 * and serve's pool (debateai_runtime).
 *
 * - `setId` is the caller's, worked out by code, so a second copy of the runner writes ALREADY.
 * - Sealed under `runId`, the run that paid: the debate itself for a first debate's suggestions; the dig that rewrote the path for a
 *   refresh. Carrier `PATH_SUGGESTIONS_CARRIER`, the set's id as its key.
 * - `readOfRun` gives the newest set per path; open each row's envelope under its own `run_id`, which may be a dig's. Null when the
 *   debate is not live.
 */
export const PATH_SUGGESTIONS_CARRIER = "identity.path_suggestions" as const;
export const READ_DATA_EXPORT_PATH_SUGGESTIONS = "identity.read_data_export_path_suggestions(uuid,uuid)" as const;

export type PathSuggestionsRow = Readonly<{ set_id: string; run_id: string; position_ref: string; recorded_at: string; content: CryptoEnvelope }>;

export class PostgresPathSuggestionsRepository {
  constructor(private readonly pool: Pool, private readonly executor: Pick<Pool, "query"> = pool) {}

  async record(input: Readonly<{ setId: string; runId: string; debateRunId: string; positionRef: string; sealed: WebSealed }>):
    Promise<"RECORDED" | "ALREADY" | "NOT_LIVE"> {
    return (await this.executor.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" }>(
      "SELECT identity.record_path_suggestions($1,$2,$3,$4,$5::jsonb,$6) AS outcome",
      [input.setId, input.runId, input.debateRunId, input.positionRef, JSON.stringify(input.sealed.envelope), input.sealed.attestation])).rows[0]!.outcome;
  }

  async readOfRun(debateRunId: string): Promise<readonly PathSuggestionsRow[] | null> {
    return (await this.executor.query<{ sets: PathSuggestionsRow[] | null }>(
      "SELECT identity.read_path_suggestions_of_run($1) AS sets", [debateRunId])).rows[0]?.sets ?? null;
  }
}
