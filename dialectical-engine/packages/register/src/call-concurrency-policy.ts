import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Parallel calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.1): ONE optional row in its own
 * family, like answerRoleRotationPolicy. It is NOT a register.required_row and NOT in the development rows, so every
 * sealed version without it keeps parsing and reads ABSENT: one call at a time per debate (today's engine).
 * A row that does not parse is loud: the runner's boot refuses. A new value is a new register version, never an edit.
 */
export const CALL_CONCURRENCY_POLICY_ROW_KEY = "callConcurrencyPolicy" as const;
/** The bounds every value must sit inside, and the per-runner limit an ABSENT row runs with. */
export const CALL_CONCURRENCY_LIMITS = Object.freeze({
  perDebateMax: 64, perModelPerDebateMax: 16, perModelPerRunnerMax: 1000, absentPerModelPerRunner: 1000
} as const);

const count = (max: number) => z.number().int().min(1).max(max);
const schema = z.object({
  kind: z.literal("CALL_CONCURRENCY_POLICY"),
  /** Calls at once in one debate. */
  perDebate: count(CALL_CONCURRENCY_LIMITS.perDebateMax),
  /** Calls at once to one model inside one debate. */
  perModelPerDebate: count(CALL_CONCURRENCY_LIMITS.perModelPerDebateMax),
  /** Calls at once to one model across all of a runner's debates, by provider kind (the vendor), with a required default. */
  perModelPerRunner: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/u), count(CALL_CONCURRENCY_LIMITS.perModelPerRunnerMax))
    .refine((value) => Object.hasOwn(value, "default"))
}).strict();

/**
 * Side-by-side spec §13: the row's member names, so the settings classification's member map
 * (`settings-classification.ts`) is proved complete against the schema without exporting the schema.
 */
export const CALL_CONCURRENCY_POLICY_MEMBERS: readonly string[] = Object.freeze(Object.keys(schema.shape));

export type CallConcurrencyPolicy = Readonly<{
  perDebate: number;
  perModelPerDebate: number;
  perModelPerRunner: Readonly<{ default: number } & Record<string, number>>;
}>;
export type CallConcurrencyPolicyState =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "SET"; policy: CallConcurrencyPolicy }>;

const invalid = (): never => { throw new TypeError("CALL_CONCURRENCY_POLICY_INVALID"); };

export function callConcurrencyPolicyFromValue(value: unknown): CallConcurrencyPolicy {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  const { perDebate, perModelPerDebate, perModelPerRunner } = parsed.data;
  // The record schema silently drops a "__proto__" key (an own key, as JSON.parse makes it): every vendor key the value
  // names must survive the parse, so such a key is refused rather than ignored (final review T14).
  const named = (value as { perModelPerRunner: object }).perModelPerRunner;
  if (Object.keys(named).length !== Object.keys(perModelPerRunner).length) return invalid();
  return Object.freeze({
    perDebate,
    perModelPerDebate,
    perModelPerRunner: Object.freeze({ ...perModelPerRunner }) as CallConcurrencyPolicy["perModelPerRunner"]
  });
}

export async function readCallConcurrencyPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<CallConcurrencyPolicyState> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, CALL_CONCURRENCY_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined
    ? Object.freeze({ state: "ABSENT" })
    : Object.freeze({ state: "SET", policy: callConcurrencyPolicyFromValue(row.value_json) });
}

/** What the runner runs with: the row, or one-at-a-time when absent. */
export function effectiveCallConcurrency(state: CallConcurrencyPolicyState): CallConcurrencyPolicy {
  return state.state === "SET" ? state.policy : Object.freeze({
    perDebate: 1,
    perModelPerDebate: 1,
    perModelPerRunner: Object.freeze({ default: CALL_CONCURRENCY_LIMITS.absentPerModelPerRunner })
  });
}

/** The row a publisher seals (the preview's v2 kit; the hosted file's optional member). */
export function callConcurrencyPolicyRow(policy: CallConcurrencyPolicy, sourceRef: string): Readonly<{
  rowKey: typeof CALL_CONCURRENCY_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid();
  // Re-checked by the same schema, so a hand-built policy can never seal a malformed row.
  const checked = callConcurrencyPolicyFromValue({ kind: "CALL_CONCURRENCY_POLICY", ...policy });
  // The canonical AST holds integers as DECIMAL nodes; they serialise as plain JSON integers.
  const integer = (value: number) => canonicalDecimal(String(value));
  const valueAst = Object.freeze({
    kind: "CALL_CONCURRENCY_POLICY",
    perDebate: integer(checked.perDebate),
    perModelPerDebate: integer(checked.perModelPerDebate),
    perModelPerRunner: Object.freeze(Object.fromEntries(
      Object.entries(checked.perModelPerRunner).map(([vendor, limit]) => [vendor, integer(limit)])
    ))
  });
  return Object.freeze({ rowKey: CALL_CONCURRENCY_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(valueAst), sourceRef });
}
