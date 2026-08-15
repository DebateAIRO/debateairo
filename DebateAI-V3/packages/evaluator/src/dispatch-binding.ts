import type { Pool } from "pg";
import { z } from "zod";

export const EVALUATOR_DISPATCH_BINDING_ROW_KEY = "evaluatorDispatchBinding" as const;

export interface EvaluatorDispatchBinding {
  readonly state: "UNBOUND";
  readonly reason: "ROW_ABSENT" | "ROW_INVALID" | "EXPLICIT_UNBOUND";
  readonly registerVersion: number;
  readonly sourceRef: string | null;
}

export async function readEvaluatorDispatchBinding(
  pool: Pool,
  registerVersion: number
): Promise<EvaluatorDispatchBinding> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("EVALUATOR_REGISTER_VERSION_INVALID");
  }
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, EVALUATOR_DISPATCH_BINDING_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    return Object.freeze({ state: "UNBOUND", reason: "ROW_ABSENT", registerVersion, sourceRef: null });
  }
  const parsed = z.object({
    kind: z.literal("EVALUATOR_DISPATCH_BINDING"),
    state: z.literal("UNBOUND")
  }).strict().safeParse(row.value_json);
  return parsed.success && row.source_ref.trim() !== ""
    ? Object.freeze({
        state: "UNBOUND" as const,
        reason: "EXPLICIT_UNBOUND" as const,
        registerVersion,
        sourceRef: row.source_ref
      })
    : Object.freeze({
        state: "UNBOUND" as const,
        reason: "ROW_INVALID" as const,
        registerVersion,
        sourceRef: row.source_ref.trim() === "" ? null : row.source_ref
      });
}
