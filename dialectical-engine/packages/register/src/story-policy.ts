import type { Pool } from "pg";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { AlgorithmRegisterRow, SealedCallBound } from "./algorithm-policy.js";

/**
 * VERDICT STORY — the story's OWN register rows
 * (docs/superpowers/specs/2026-09-26-verdict-story-design.md §8-§9).
 *
 * OPTIONAL, and that is the whole design. No `register.required_row` entry
 * names them and no boot refuses without them. A register version that never
 * sealed them reads as `null` here, and the story is then written as
 * FAILED/STORY_NOT_CONFIGURED while the debate is untouched. That is what keeps
 * `tests/support/fixtures/register-development-v4.json`, acceptance register v3
 * and every existing publication valid without editing any of them.
 *
 * PARTIAL is not ABSENT. A version that seals SOME of the six required rows is
 * refused by name (STORY_POLICY_INCOMPLETE): a half-sealed family is a
 * deployment mistake, not a choice.
 *
 * `storyCostEnvelopePolicy` is the one row a deployment may omit on purpose.
 * Local mode spends no money and has no money envelope. The hosted writer
 * refuses to run without it (STORY_ENVELOPE_MISSING), so omitting it in hosted
 * mode switches the story off. It can never let the story spend unbounded.
 *
 * Every number below is PROVISIONAL (spec §8, owner 2026-09-26: "we will adjust
 * based on real costs") and module-private: a number leaves this file only
 * inside a row, as `algorithm-policy.ts` does for the same reason.
 */
export const STORY_ROW_KEYS = Object.freeze([
  "storytellerRoleRef",
  "storyCheckerRoleRef",
  "storyLoopMaxRounds",
  "storytellerCallBound",
  "storyCheckerCallBound",
  "storyMaterialBudget",
  "storyCostEnvelopePolicy"
] as const);

type StoryRowKey = typeof STORY_ROW_KEYS[number];

const REQUIRED_STORY_ROW_KEYS: readonly StoryRowKey[] = Object.freeze(
  STORY_ROW_KEYS.filter((rowKey) => rowKey !== "storyCostEnvelopePolicy")
);

/** The spec sections that chose the values; appended to the deployment's source ref. */
export const STORY_SPEC_RULING_REF = "verdict-story-design-2026-09-26#8-9" as const;
/** The owner's spec-review ruling on the hosted cap (spec §13.2). */
export const STORY_COST_RULING_REF = "verdict-story-design-2026-09-26#13.2" as const;

/** The builder row type the algorithm rows already use. */
export type StoryRegisterRow = AlgorithmRegisterRow;

export interface StoryRegisterRowsInput {
  /** The sealed synthesizer's provider: the storyteller's default. */
  readonly synthesizerRoleRef: string;
  /** The sealed evaluator's provider: the checker's default (a different maker by default). */
  readonly evaluatorRoleRef: string;
  /** Deployment-scoped provenance prefix, as `AlgorithmRegisterRowsInput.deploymentSourceRef`. */
  readonly sourceRef: string;
  /** Hosted deployments also seal the story's money ceiling. */
  readonly hosted: boolean;
}

export interface StoryPolicy {
  readonly storytellerRoleRef: string;
  readonly storyCheckerRoleRef: string;
  readonly loopMaxRounds: number;
  readonly storytellerBound: SealedCallBound;
  readonly checkerBound: SealedCallBound;
  readonly materialBudget: Readonly<Record<"low" | "medium" | "high", number>>;
  /** Null when the version sealed no `storyCostEnvelopePolicy` (local mode). */
  readonly perStoryCeilingMicros: number | null;
  readonly registerVersion: number;
}

const nonemptyText = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
/** Below the 256 KiB packet cap with room for the at most 48 KB instruction (spec §5.1-§5.2). */
const materialBytes = positiveInteger.max(200_000);

function storyCallBoundSchema<K extends string>(kind: K) {
  return z.object({
    kind: z.literal(kind),
    maxAttempts: positiveInteger.max(5),
    tokenCeiling: positiveInteger.max(65_536),
    deadlineMs: positiveInteger.min(1_000).max(900_000)
  }).strict();
}

const storyFamilySchema = z.object({
  storytellerRoleRef: z.object({
    kind: z.literal("STORYTELLER_ROLE_REF"),
    providerRef: nonemptyText,
    provisional: z.boolean()
  }).strict(),
  storyCheckerRoleRef: z.object({
    kind: z.literal("STORY_CHECKER_ROLE_REF"),
    providerRef: nonemptyText,
    provisional: z.boolean()
  }).strict(),
  storyLoopMaxRounds: z.object({
    kind: z.literal("STORY_LOOP_MAX_ROUNDS"),
    maxRounds: positiveInteger.max(8)
  }).strict(),
  storytellerCallBound: storyCallBoundSchema("STORYTELLER_CALL_BOUND"),
  storyCheckerCallBound: storyCallBoundSchema("STORY_CHECKER_CALL_BOUND"),
  storyMaterialBudget: z.object({
    kind: z.literal("STORY_MATERIAL_BUDGET"),
    low: materialBytes,
    medium: materialBytes,
    high: materialBytes
  }).strict().refine(
    (value) => value.low <= value.medium && value.medium <= value.high,
    { message: "a larger tier never gets a smaller material budget" }
  ),
  storyCostEnvelopePolicy: z.object({
    kind: z.literal("STORY_COST_ENVELOPE_POLICY"),
    currency: z.literal("USD"),
    minor_units_per_unit: z.literal(1_000_000),
    per_story_ceiling_micros: positiveInteger.max(Number.MAX_SAFE_INTEGER),
    provisional: z.boolean(),
    provisional_reason: nonemptyText
  }).strict().optional()
}).strict();

function requireStoryRef(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypedDomainError("STORY_REGISTER_ROWS_INVALID", `${label} must be a nonempty ref`);
  }
  return value;
}

/**
 * Every story row with its provisional value. Deployment facts (provenance
 * prefix, the two role identities, hosted or local) arrive as input, so no
 * deployment name is invented here.
 */
export function buildStoryRegisterRows(input: StoryRegisterRowsInput): readonly StoryRegisterRow[] {
  const deployment = requireStoryRef(input.sourceRef, "sourceRef");
  const storytellerRoleRef = requireStoryRef(input.synthesizerRoleRef, "synthesizerRoleRef");
  const storyCheckerRoleRef = requireStoryRef(input.evaluatorRoleRef, "evaluatorRoleRef");
  const ref = (ruling: string): string => `${deployment}+${ruling}`;
  const rows: StoryRegisterRow[] = [
    {
      rowKey: "storytellerRoleRef",
      value: { kind: "STORYTELLER_ROLE_REF", providerRef: storytellerRoleRef, provisional: true },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    {
      rowKey: "storyCheckerRoleRef",
      value: { kind: "STORY_CHECKER_ROLE_REF", providerRef: storyCheckerRoleRef, provisional: true },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    {
      rowKey: "storyLoopMaxRounds",
      value: { kind: "STORY_LOOP_MAX_ROUNDS", maxRounds: 2 },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    {
      rowKey: "storytellerCallBound",
      value: { kind: "STORYTELLER_CALL_BOUND", maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    {
      rowKey: "storyCheckerCallBound",
      value: { kind: "STORY_CHECKER_CALL_BOUND", maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    {
      rowKey: "storyMaterialBudget",
      value: { kind: "STORY_MATERIAL_BUDGET", low: 40_000, medium: 80_000, high: 120_000 },
      sourceRef: ref(STORY_SPEC_RULING_REF)
    },
    ...(input.hosted ? [{
      rowKey: "storyCostEnvelopePolicy",
      value: {
        kind: "STORY_COST_ENVELOPE_POLICY",
        currency: "USD",
        minor_units_per_unit: 1_000_000,
        per_story_ceiling_micros: 50_000,
        provisional: true,
        provisional_reason: "TEMPORARY story cap under the verdict-story spec: the owner seals the real value"
          + " as a NEW version of this row after the first measured hosted stories"
      },
      sourceRef: ref(STORY_COST_RULING_REF)
    }] : [])
  ];
  // The builder is held to its own reader: a row this file cannot read back is
  // refused here, at the seeding entrypoint, not at the first story.
  readStoryPolicy(rows, 1);
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/**
 * The story family in one register version, or `null` when the version sealed
 * none of it. Pure over the rows so boot, publication plans and tests share one
 * definition of what a valid family is.
 */
export function readStoryPolicy(
  rows: readonly StoryRegisterRow[],
  registerVersion: number
): StoryPolicy | null {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("STORY_POLICY_REGISTER_VERSION_INVALID");
  }
  const storyKeys: readonly string[] = STORY_ROW_KEYS;
  const present = rows.filter((row) => storyKeys.includes(row.rowKey));
  if (present.length === 0) return null;
  const values: Record<string, unknown> = {};
  for (const row of present) {
    if (Object.hasOwn(values, row.rowKey)) {
      throw new TypedDomainError(
        "STORY_POLICY_INVALID",
        `The ${row.rowKey} row appears twice in register version ${String(registerVersion)}`
      );
    }
    if (typeof row.sourceRef !== "string" || row.sourceRef.trim() === "") {
      throw new TypedDomainError("STORY_POLICY_PROVENANCE_MISSING", `The ${row.rowKey} row has no source_ref`);
    }
    values[row.rowKey] = row.value;
  }
  const missing = REQUIRED_STORY_ROW_KEYS.filter((rowKey) => !Object.hasOwn(values, rowKey));
  if (missing.length > 0) {
    throw new TypedDomainError(
      "STORY_POLICY_INCOMPLETE",
      `Register version ${String(registerVersion)} seals only part of the story family; missing: ${missing.join(",")}`
    );
  }
  const parsed = storyFamilySchema.safeParse(values);
  if (!parsed.success) {
    const rowKey = parsed.error.issues[0]?.path[0];
    throw new TypedDomainError(
      "STORY_POLICY_INVALID",
      `The ${typeof rowKey === "string" ? rowKey : "story"} row violates its declared member type`
    );
  }
  const family = parsed.data;
  const sealedBound = (value: {
    readonly maxAttempts: number;
    readonly tokenCeiling: number;
    readonly deadlineMs: number;
  }): SealedCallBound => Object.freeze({
    maxAttempts: value.maxAttempts,
    tokenCeiling: value.tokenCeiling,
    deadlineMs: value.deadlineMs
  });
  return Object.freeze({
    storytellerRoleRef: family.storytellerRoleRef.providerRef,
    storyCheckerRoleRef: family.storyCheckerRoleRef.providerRef,
    loopMaxRounds: family.storyLoopMaxRounds.maxRounds,
    storytellerBound: sealedBound(family.storytellerCallBound),
    checkerBound: sealedBound(family.storyCheckerCallBound),
    materialBudget: Object.freeze({
      low: family.storyMaterialBudget.low,
      medium: family.storyMaterialBudget.medium,
      high: family.storyMaterialBudget.high
    }),
    perStoryCeilingMicros: family.storyCostEnvelopePolicy?.per_story_ceiling_micros ?? null,
    registerVersion
  });
}

/** The boot reader: the rows of ONE pinned version, then `readStoryPolicy`. */
export async function readStoryPolicyFromRegister(
  pool: Pool,
  registerVersion: number
): Promise<StoryPolicy | null> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("STORY_POLICY_REGISTER_VERSION_INVALID");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])`,
    [registerVersion, [...STORY_ROW_KEYS]]
  );
  return readStoryPolicy(result.rows.map((row) => Object.freeze({
    rowKey: row.row_key,
    value: row.value_json,
    sourceRef: row.source_ref
  })), registerVersion);
}
