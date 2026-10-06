import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * hate-speech S02 — THE PRE-PUBLISH CHECK'S DEADLINE D, as a sealed register row (owner's ruling 2026-10-04).
 *
 * Every judge call of one publish attempt shares ONE `AbortSignal.timeout(D)` (apps/api/src/publication-check/
 * check.ts). SPEC-v2 R7 caps D at 60 s and ruling R-D2 (FIX-HS2-p2 ui-B2) set it to that cap: at 50 s the §4 eval
 * against the dev judge still failed one run in three (one call past 50 s); what stays slower than 60 s is the dev
 * judge's own tail (V-15). The judge transport's backstop is D + 10 s, and the UI proxy's publish ceiling (85 s,
 * apps/ui/app/api/[...path]/route.ts) is sized for the cap, so the schema refuses anything above 60 000 ms; below
 * 1 000 ms it refuses a deadline written in seconds. A check that cannot finish refuses the publish (fail closed).
 *
 * Code-owned: every development and hosted publication seals this row, and a hosted operator file may supersede it
 * with its own `publicationCheckPolicy` member (deploy/vps/register/README.md). The API reads it at start-up and
 * refuses a register version without it. Until 2026-10-04 D was the exported constant PUBLICATION_CHECK_DEADLINE_MS,
 * which the source-purity law (tools/orphan-audit) refuses once it sees digit separators.
 */
export const PUBLICATION_CHECK_POLICY_ROW_KEY = "publicationCheckPolicy" as const;

export type PublicationCheckPolicy = Readonly<{ deadlineMs: number }>;

const publicationCheckPolicyValueSchema = z.object({
  kind: z.literal("PUBLICATION_CHECK_POLICY"),
  deadline_ms: z.number().int().min(1_000).max(60_000)
}).strict();

export type PublicationCheckPolicyValue = z.infer<typeof publicationCheckPolicyValueSchema>;

export function publicationCheckPolicyFromValue(value: unknown, sourceRef: string): PublicationCheckPolicy {
  const parsed = publicationCheckPolicyValueSchema.safeParse(value);
  if (!parsed.success || sourceRef.trim() === "") {
    throw new TypedDomainError("PUBLICATION_CHECK_POLICY_INVALID", "The sealed publication-check policy row is malformed");
  }
  return Object.freeze({ deadlineMs: parsed.data.deadline_ms });
}

/** The row at a register version. A version without it refuses by name: the check has no deadline of its own. */
export async function readPublicationCheckPolicy(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<PublicationCheckPolicy> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, PUBLICATION_CHECK_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "PUBLICATION_CHECK_POLICY_UNRESOLVED",
      `No ${PUBLICATION_CHECK_POLICY_ROW_KEY}@${registerVersion} exists`
    );
  }
  return publicationCheckPolicyFromValue(row.value_json, row.source_ref);
}

export const PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: PUBLICATION_CHECK_POLICY_ROW_KEY,
  sourceRef: "hate-speech S02: SPEC-v2 R7 (D <= 60 s) and ruling R-D2 (FIX-HS2-p2 ui-B2, D = 60 000 ms), recorded in"
    + " apps/api/src/publication-check/check.ts at eb7269e1a (PR #56); sealed as a register row by the owner's"
    + " ruling of 2026-10-04",
  value: Object.freeze({
    kind: "PUBLICATION_CHECK_POLICY" as const,
    deadline_ms: 60_000
  })
});
