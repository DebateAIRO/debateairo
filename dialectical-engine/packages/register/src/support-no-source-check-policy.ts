import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalRegisterJson } from "./register-publication.js";

/** Absent from the register means the code's start value; each published value is immutable. */
export const SUPPORT_NO_SOURCE_CHECK_POLICY_ROW_KEY = "supportNoSourceCheckPolicy" as const;

export type SupportNoSourceCheckPolicy = Readonly<{
  kind: "SUPPORT_NO_SOURCE_CHECK_POLICY";
  version: 1;
  timeoutMs: number;
}>;

const schema = z.object({
  kind: z.literal("SUPPORT_NO_SOURCE_CHECK_POLICY"),
  version: z.literal(1),
  timeoutMs: z.number().int().min(1000).max(15000)
}).strict();

const invalid = (path: string): never => { throw new TypeError(`SUPPORT_NO_SOURCE_CHECK_POLICY_INVALID:${path}`); };

export function parseSupportNoSourceCheckPolicy(value: unknown): SupportNoSourceCheckPolicy {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.code === "unrecognized_keys" ? issue.keys[0] : issue?.path.map(String).join(".");
    return invalid(path || "$" );
  }
  return Object.freeze(parsed.data);
}

export async function readSupportNoSourceCheckPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<SupportNoSourceCheckPolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2",
    [registerVersion, SUPPORT_NO_SOURCE_CHECK_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseSupportNoSourceCheckPolicy(row.value_json);
}

export function supportNoSourceCheckPolicyStartValues(): SupportNoSourceCheckPolicy {
  return parseSupportNoSourceCheckPolicy({ kind: "SUPPORT_NO_SOURCE_CHECK_POLICY", version: 1, timeoutMs: 15000 });
}

export function supportNoSourceCheckPolicyRow(policy: SupportNoSourceCheckPolicy, sourceRef: string): Readonly<{
  rowKey: typeof SUPPORT_NO_SOURCE_CHECK_POLICY_ROW_KEY;
  valueJsonText: CanonicalRegisterJson;
  sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseSupportNoSourceCheckPolicy(policy);
  const valueJsonText = canonicalRegisterJson(Object.freeze({
    kind: checked.kind,
    version: canonicalDecimal(String(checked.version)),
    timeoutMs: canonicalDecimal(String(checked.timeoutMs))
  }));
  return Object.freeze({ rowKey: SUPPORT_NO_SOURCE_CHECK_POLICY_ROW_KEY, valueJsonText, sourceRef });
}
