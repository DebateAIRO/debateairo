import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * Open sign-up mail, PR 3 (owner decision G2, 2026-10-09): THE DAILY ACCOUNT-MAIL BUDGET, as a register row.
 *
 * - `daily_cap`: account mail handed to the mail program per UTC day. The code-owned value is the PREVIEW's,
 *   2 000; the live site's operator file supersedes it with 10 000 (deploy/vps/register/README.md). SES allows
 *   50 000 a day, so either value leaves room.
 * - `reserved_for_security_pct`: the share of the cap only security mail (password reset, recovery, security
 *   notices) may use, so a flood of sign-ups can never starve a password reset. 20.
 * - `alert_at_pct`: the owner is alerted once a day when the day's count reaches this share of the cap. 50.
 * At the cap sign-up and resend answer MAIL_DAILY_LIMIT ("try again later") and the owner is alerted.
 *
 * Code-owned: every development and hosted publication seals this row, and a hosted operator file may supersede it
 * with its own `outboundMailPolicy` member. The API reads it at start-up and refuses a register version without
 * it (OUTBOUND_MAIL_POLICY_UNRESOLVED): a mail cap nobody sealed is not a cap.
 */
export const OUTBOUND_MAIL_POLICY_ROW_KEY = "outboundMailPolicy" as const;

export type OutboundMailPolicy = Readonly<{ dailyCap: number; reservedForSecurityPct: number; alertAtPct: number }>;

const outboundMailPolicyValueSchema = z.object({
  kind: z.literal("OUTBOUND_MAIL_POLICY"),
  daily_cap: z.number().int().min(1).max(1_000_000),
  reserved_for_security_pct: z.number().int().min(0).max(90),
  alert_at_pct: z.number().int().min(1).max(100)
}).strict().refine(
  // A cap whose security reserve leaves no room for one sign-up mail would refuse every sign-up.
  (value) => Math.floor(value.daily_cap * (100 - value.reserved_for_security_pct) / 100) >= 1
);

export type OutboundMailPolicyValue = z.infer<typeof outboundMailPolicyValueSchema>;

export function outboundMailPolicyFromValue(value: unknown, sourceRef: string): OutboundMailPolicy {
  const parsed = outboundMailPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("OUTBOUND_MAIL_POLICY_INVALID", "The sealed outbound mail policy row is malformed");
  }
  return Object.freeze({
    dailyCap: parsed.data.daily_cap,
    reservedForSecurityPct: parsed.data.reserved_for_security_pct,
    alertAtPct: parsed.data.alert_at_pct
  });
}

/** The row at a register version. A version without it refuses by name. */
export async function readOutboundMailPolicy(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<OutboundMailPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, OUTBOUND_MAIL_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "OUTBOUND_MAIL_POLICY_UNRESOLVED",
      `No ${OUTBOUND_MAIL_POLICY_ROW_KEY}@${registerVersion} exists`
    );
  }
  return outboundMailPolicyFromValue(row.value_json, row.source_ref);
}

export const OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: OUTBOUND_MAIL_POLICY_ROW_KEY,
  sourceRef: "open sign-up mail design 2026-10-09 §3(a) A3, owner decision G2 (2 000/day preview, 10 000/day live"
    + " by hosted override, 20% reserved for security mail, alert at 50%)",
  value: Object.freeze({
    kind: "OUTBOUND_MAIL_POLICY" as const,
    daily_cap: 2_000,
    reserved_for_security_pct: 20,
    alert_at_pct: 50
  })
});
