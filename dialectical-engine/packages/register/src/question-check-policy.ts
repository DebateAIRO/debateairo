import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const QUESTION_CHECK_POLICY_ROW_KEY = "questionCheckPolicy" as const;

export type QuestionCheckPolicy = Readonly<{ deadlineMs: number }>;

const questionCheckPolicyValueSchema = z.object({
  kind: z.literal("QUESTION_CHECK_POLICY"),
  deadline_ms: z.number().int().min(1_000).max(15_000)
}).strict();

export type QuestionCheckPolicyValue = z.infer<typeof questionCheckPolicyValueSchema>;

export function questionCheckPolicyFromValue(value: unknown, sourceRef: string): QuestionCheckPolicy {
  const parsed = questionCheckPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("QUESTION_CHECK_POLICY_INVALID", "The sealed question-check policy row is malformed");
  }
  return Object.freeze({ deadlineMs: parsed.data.deadline_ms });
}

export async function readQuestionCheckPolicy(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<QuestionCheckPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, QUESTION_CHECK_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "QUESTION_CHECK_POLICY_UNRESOLVED",
      `No ${QUESTION_CHECK_POLICY_ROW_KEY}@${registerVersion} exists`
    );
  }
  return questionCheckPolicyFromValue(row.value_json, row.source_ref);
}

export const QUESTION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: QUESTION_CHECK_POLICY_ROW_KEY,
  sourceRef: "synthesis-flag S04-R8: question check deadline is at most 15 000 ms",
  value: Object.freeze({ kind: "QUESTION_CHECK_POLICY" as const, deadline_ms: 15_000 })
});
