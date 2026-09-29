import type { Pool } from "pg";

/** Content-free facts for one publication check attempt (SPEC-v2 R10). */
export type PublicationCheckRecordRow = Readonly<{
  run_id: string;
  attempted_at: Date | string;
  outcome: "ALLOW" | "BLOCK" | "UNSURE" | "UNAVAILABLE";
  failure_cause:
    | "JUDGE_TRANSPORT_FAILED"
    | "JUDGE_HTTP_STATUS"
    | "JUDGE_DEADLINE"
    | "JUDGE_ANSWER_NOT_JSON"
    | "JUDGE_ANSWER_SCHEMA"
    | "JUDGE_ANSWER_UNKNOWN_PART"
    | "JUDGE_DOOR_REFUSED"
    | "JUDGE_NOT_CONFIGURED"
    | null;
  rules: readonly (1 | 2)[];
  part_kinds: readonly ("QUESTION" | "SUMMARY" | "ARGUMENTS" | "REVIEWS" | "STORY")[];
  ground: "TERMS" | "TERMS_AND_POSSIBLY_ILLEGAL" | null;
  judge_provider_ref: string | null;
  judge_model_id: string | null;
  policy_version: string;
  judge_call_count: number;
}>;

export class PostgresPublicationCheckRecordRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async record(row: PublicationCheckRecordRow): Promise<void> {
    await this.pool.query(`
      INSERT INTO serve.publication_check_record (
        run_id, attempted_at, outcome, failure_cause, rules, part_kinds, ground,
        judge_provider_ref, judge_model_id, policy_version, judge_call_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      row.run_id, row.attempted_at, row.outcome, row.failure_cause, row.rules,
      row.part_kinds, row.ground, row.judge_provider_ref, row.judge_model_id,
      row.policy_version, row.judge_call_count
    ]);
  }
}
