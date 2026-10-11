import type { Pool } from "pg";
import { z } from "zod";
import { canonicalRegisterJson, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Role rotation (spec 2026-10-11, Part 1): ONE optional row in its own family. It is NOT a
 * register.required_row and NOT in SYNTHESIS_ROLE_CONTROLS (whose reader refuses a version missing
 * any key), so every sealed version without it keeps parsing and reads ABSENT: today's engine.
 * A row that does not parse is loud (the API's boot refuses).
 */
export const ANSWER_ROLE_ROTATION_POLICY_ROW_KEY = "answerRoleRotationPolicy" as const;
const schema = z.object({
  kind: z.literal("ANSWER_ROLE_ROTATION_POLICY"),
  enabled: z.boolean(),
  rule: z.literal("LEAST_SHARE_SEEDED_TIE_V1")
}).strict();
export type AnswerRoleRotationPolicyState =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "OFF" }>
  | Readonly<{ state: "ON"; rule: "LEAST_SHARE_SEEDED_TIE_V1" }>;

const invalid = (): never => { throw new TypeError("ANSWER_ROLE_ROTATION_POLICY_INVALID"); };

export function answerRoleRotationPolicyFromValue(value: unknown): AnswerRoleRotationPolicyState {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  return parsed.data.enabled ? Object.freeze({ state: "ON", rule: parsed.data.rule }) : Object.freeze({ state: "OFF" });
}

export async function readAnswerRoleRotationPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<AnswerRoleRotationPolicyState> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ANSWER_ROLE_ROTATION_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? Object.freeze({ state: "ABSENT" }) : answerRoleRotationPolicyFromValue(row.value_json);
}

/** The row a publisher seals (the preview's v2 kit; the hosted file's optional member). */
export function answerRoleRotationPolicyRow(enabled: boolean, sourceRef: string): Readonly<{
  rowKey: typeof ANSWER_ROLE_ROTATION_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof enabled !== "boolean" || typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid();
  const valueAst = Object.freeze({ kind: "ANSWER_ROLE_ROTATION_POLICY", enabled, rule: "LEAST_SHARE_SEEDED_TIE_V1" });
  return Object.freeze({ rowKey: ANSWER_ROLE_ROTATION_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(valueAst), sourceRef });
}
