import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * R22 decision 18 — THE ABUSE LIMITS, as a register row (owner: "we shouldn't let anybody seeing our GitHub repo know
 * the limits that we have"): how often one person may ask for clarifying questions, how many reports the Report button
 * takes, how many cancel links one account gets, and how many domains this process asks the DNS about.
 *
 * The values below are MADE UP: plainly fake multiples of eleven, sealed only in development. A hosted site's real ones
 * are the required `abuseLimits` member of its operator's file (deploy/vps/register/README.md), which is kept on the
 * server: a hosted publication without it refuses (HOSTED_REGISTER_ROW_MISSING:abuseLimits), and an API whose register
 * version has no such row refuses to start (ABUSE_LIMITS_UNRESOLVED). There is no default anywhere.
 */
export const ABUSE_LIMITS_ROW_KEY = "abuseLimits" as const;

export type AbuseLimits = Readonly<{
  askClarify: Readonly<{ perHour: number; perDay: number }>;
  publicFlag: Readonly<{ personHour: number; debateDay: number; siteDay: number }>;
  cancelLinksPerDay: number;
  mailDomainChecksPerMinute: number;
}>;

/** The schema's bounds catch a typed extra digit, and say nothing about the real values. */
const count = z.number().int().positive().max(1_000_000);

const abuseLimitsValueSchema = z.object({
  kind: z.literal("ABUSE_LIMITS"),
  clarify_per_hour: count,
  clarify_per_day: count,
  flag_per_person_hour: count,
  flag_per_debate_day: count,
  flag_per_site_day: count,
  cancel_links_per_day: count,
  mail_domain_checks_per_minute: count
}).strict().superRefine((value, ctx) => {
  if (value.clarify_per_hour > value.clarify_per_day) ctx.addIssue({ code: "custom", message: "an hour's limit is at most the day's" });
  if (value.flag_per_debate_day > value.flag_per_site_day) ctx.addIssue({ code: "custom", message: "a debate's limit is at most the site's" });
});

export function abuseLimitsFromValue(value: unknown, sourceRef: string): AbuseLimits {
  const parsed = abuseLimitsValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("ABUSE_LIMITS_INVALID", "The sealed abuse limits row is malformed");
  }
  return Object.freeze({
    askClarify: Object.freeze({ perHour: parsed.data.clarify_per_hour, perDay: parsed.data.clarify_per_day }),
    publicFlag: Object.freeze({
      personHour: parsed.data.flag_per_person_hour,
      debateDay: parsed.data.flag_per_debate_day,
      siteDay: parsed.data.flag_per_site_day
    }),
    cancelLinksPerDay: parsed.data.cancel_links_per_day,
    mailDomainChecksPerMinute: parsed.data.mail_domain_checks_per_minute
  });
}

/** The row at a register version. A version without it refuses by name: nothing in the code stands in for it. */
export async function readAbuseLimits(pool: Pick<Pool, "query">, registerVersion: number): Promise<AbuseLimits> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ABUSE_LIMITS_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) throw new TypedDomainError("ABUSE_LIMITS_UNRESOLVED", `No ${ABUSE_LIMITS_ROW_KEY}@${registerVersion} exists`);
  return abuseLimitsFromValue(row.value_json, row.source_ref);
}

export const ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: ABUSE_LIMITS_ROW_KEY,
  sourceRef: "R22 decision 18: MADE-UP development values; a hosted site's real ones are in its operator's file on the server",
  value: Object.freeze({
    kind: "ABUSE_LIMITS" as const,
    clarify_per_hour: 11,
    clarify_per_day: 22,
    flag_per_person_hour: 11,
    flag_per_debate_day: 22,
    flag_per_site_day: 99,
    cancel_links_per_day: 11,
    mail_domain_checks_per_minute: 110
  })
});
