import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { z } from "zod";
import {
  CLAIM_TYPES,
  OPERATOR_SUPPLYING_LEVELS,
  RISK_TIERS,
  SCORING_OPERATORS,
  TypedDomainError,
  type ClaimType,
  type OperatorSupplyingLevel,
  type RiskTier,
  type ScoringOperator
} from "@debateai/kernel";
import { AUTH_POLICY_REGISTER_ROWS } from "./auth-policy.js";
import { MFA_POLICY_REGISTER_ROW } from "./mfa-policy.js";
import { PRODUCT_ROLE_POLICY_REGISTER_ROW } from "./product-role-policy.js";
import { RECOVERY_POLICY_REGISTER_ROW } from "./recovery-policy.js";
import { SESSION_POLICY_REGISTER_ROW } from "./session-policy.js";
import {
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  parseRegisterVersionText,
  type CanonicalJsonAst,
  type RegisterPublicationRow
} from "./register-publication.js";

export const CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY = "claimTypeCompositionMap" as const;
export {
  ENGINE_BAND_ORDER,
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE
} from "./engine-shape.js";

const unitIntervalSchema = z.number().finite().min(0).max(1);
const compositionMetricSchema = z.enum([
  "steelman_fidelity", "counter_resilience", "evidence_quality", "evidence_relevance",
  "context_fit", "clarity", "fallacy_resilience"
]);

export const claimTypeCompositionMemberSchema = z.object({
  branch: z.enum(["EVIDENCE_AWARE", "EVIDENCE_FREE"]),
  clarityDecayPerAmbiguity: unitIntervalSchema,
  terms: z.array(z.object({
    metric: compositionMetricSchema,
    coefficient: unitIntervalSchema
  }).strict()),
  caps: z.array(z.object({
    whenFatalType: z.string().trim().min(1),
    to: unitIntervalSchema,
    why: z.string().trim().min(1),
    by: z.string().trim().min(1)
  }).strict()),
  uncertaintyLadder: z.array(z.object({
    atMost: unitIntervalSchema,
    label: z.string().trim().min(1)
  }).strict())
}).strict();

export type ClaimTypeCompositionMember = z.infer<typeof claimTypeCompositionMemberSchema>;

export const claimTypeCompositionMapValueSchema = z.object({
  kind: z.literal("CLAIM_TYPE_COMPOSITION_MAP"),
  entries: z.partialRecord(z.enum(CLAIM_TYPES), claimTypeCompositionMemberSchema)
}).strict();

export type ClaimTypeCompositionMapValue = z.infer<typeof claimTypeCompositionMapValueSchema>;

export interface CompositionMapRegisterRow {
  readonly rowKey: typeof CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: {
    readonly kind: "CLAIM_TYPE_COMPOSITION_MAP";
    readonly entries: Partial<Readonly<Record<ClaimType, ClaimTypeCompositionMember>>>;
  };
}

export async function readClaimTypeCompositionMap(
  pool: Pool,
  registerVersion: number
): Promise<CompositionMapRegisterRow> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for the claim-type composition map");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = $2`,
    [registerVersion, CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
      `No V-ratified ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} value exists in register version ${registerVersion}`
    );
  }
  const parsed = claimTypeCompositionMapValueSchema.safeParse(row.value_json);
  if (!parsed.success) {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_INVALID",
      `The ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} row violates its DR-128 declared member type`
    );
  }
  if (row.source_ref.trim() === "") {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING",
      `The ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} row has no source_ref`
    );
  }
  return Object.freeze({
    rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: parsed.data
  });
}

export const DEPLOYMENT_RISK_TIER_ROW_KEY = "riskTier" as const;
export const CONVERGENCE_EPSILON_ROW_KEY = "convergenceEpsilon" as const;
export const CONVERGENCE_STOP_DEFAULTS_ROW_KEY = "convergenceStopDefaults" as const;
export const LIVENESS_POLICY_ROW_KEY = "livenessPolicy" as const;

const livenessPolicySchema = z.object({
  kind: z.literal("LIVENESS_POLICY"),
  classes: z.record(z.string().trim().min(1), z.object({
    review_after_ms: z.number().int().positive(),
    retire_after_ms: z.number().int().positive()
  }).strict())
}).strict();

export async function readLivenessPolicy(pool: Pool, registerVersion: number, questionClass: string): Promise<{
  readonly rowKey: typeof LIVENESS_POLICY_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly questionClass: string;
  readonly reviewAfterMs: number;
  readonly retireAfterMs: number;
}> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1 || questionClass.trim() === "") {
    throw new TypeError("A positive register version and nonempty question class are required for liveness");
  }
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, LIVENESS_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) throw new TypedDomainError("LIVENESS_POLICY_UNRESOLVED", `${LIVENESS_POLICY_ROW_KEY}@${registerVersion}`);
  const parsed = livenessPolicySchema.safeParse(row.value_json);
  const member = parsed.success ? parsed.data.classes[questionClass] : undefined;
  if (!parsed.success || member === undefined) {
    throw new TypedDomainError("LIVENESS_POLICY_INVALID", `${LIVENESS_POLICY_ROW_KEY}:${questionClass}`);
  }
  if (row.source_ref.trim() === "") throw new TypedDomainError("LIVENESS_POLICY_PROVENANCE_MISSING", questionClass);
  return Object.freeze({
    rowKey: LIVENESS_POLICY_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    questionClass,
    reviewAfterMs: member.review_after_ms,
    retireAfterMs: member.retire_after_ms
  });
}

export interface StructuralCeilingInput {
  readonly panelSize: number;
  readonly depth: number;
  readonly judgeMaxAttempts: number;
  readonly organMaxAttempts: number;
  readonly maxRecompose: number;
  readonly maxCooldownHoldsPerRun: number;
  readonly finalRetryAttempts: number;
  readonly branchingFactor: number;
  readonly compositionSegmentCap: number;
  readonly fixedOrgansPerComposition: number;
  /**
   * T17 — the sealed `envelopeFormulaInputs` row's terms. Every one of them is
   * READ from the register (`readEnvelopeFormulaInputs`) and passed by the
   * entry point; none is a code constant and none is re-declared here.
   */
  readonly reviewerCallsPerNode: number;
  readonly synthesizerMaxRounds: number;
  readonly evaluatorMaxRounds: number;
  /**
   * T17/B2 — the SEALED maximum depth. Admission refuses ABOVE it rather than
   * minting a ceiling the run head's parser would reject later, after the ask
   * was already admitted.
   */
  readonly maxDepth: number;
}

/**
 * The DECLARED members, checked by name. Iterating `Object.entries(input)`
 * instead — as DR-184-v2 did — validates only the members a caller happened to
 * pass, so an omitted term reached the arithmetic as `undefined` and minted a
 * `NaN` ceiling in silence. A missing term is now as loud as an invalid one.
 */
const STRUCTURAL_CEILING_MEMBERS: readonly (keyof StructuralCeilingInput)[] = Object.freeze([
  "panelSize", "depth", "judgeMaxAttempts", "organMaxAttempts", "maxRecompose",
  "maxCooldownHoldsPerRun", "finalRetryAttempts", "branchingFactor",
  "compositionSegmentCap", "fixedOrgansPerComposition",
  "reviewerCallsPerNode", "synthesizerMaxRounds", "evaluatorMaxRounds", "maxDepth"
]);

/**
 * THE SERVE-LEG RULE — stated ONCE, here, and READ by everything that needs it.
 *
 * Two things used to state it independently and on purpose: this package's
 * `computeStructuralCeilingBasis` (which MINTS a basis) and
 * `parseCostEnvelopeBasis` in @debateai/budget (which RE-READS a persisted one
 * and refused anything the constructor would not have minted). The duplication
 * was deliberate — a receipt is a claim, and a claim deserves an independent
 * check — but it made the rule unchangeable one file at a time: correcting the
 * constructor alone produced bases the parser rejected at the run head
 * (F-T17T9-3, .hermes/reports/2026-09-01-algorithm-live-loop/logs/t17t9-3/04).
 *
 * The independence is KEPT and the restatement is removed: the parser still
 * checks the receipt against the rule, but it now READS the rule from here
 * instead of re-typing it, so the two cannot disagree again.
 */
export const SERVE_LEG = Object.freeze({
  /**
   * The serve chain that ships after T9. The composition chain is retired, so
   * there is no longer an arm to select BETWEEN — the field survives on the
   * receipt as the discriminator that makes a pre-T9 basis fail loudly.
   */
  chain: "SYNTHESIS_LOOP",
  /**
   * One call site per synthesis role per round, at the sealed loop bound. The
   * sealed row carries the bound once per role, so the two must agree: the
   * runner has ONE `evaluatorLoopMaxRounds` and TWO roles, and a row sealing
   * 5 and 1 would describe a runner that does not exist.
   */
  sites(input: { readonly synthesizerMaxRounds: number; readonly evaluatorMaxRounds: number }): number {
    if (input.synthesizerMaxRounds !== input.evaluatorMaxRounds) {
      throw new TypedDomainError(
        "STRUCTURAL_CEILING_SYNTHESIS_ROUNDS_INCOHERENT",
        `synthesizerMaxRounds ${input.synthesizerMaxRounds} and evaluatorMaxRounds `
        + `${input.evaluatorMaxRounds} must be the one sealed loop bound`
      );
    }
    return input.synthesizerMaxRounds + input.evaluatorMaxRounds;
  },
  /** The site count a DISCLOSED leg bills, for a reader of a persisted receipt. */
  billed(leg: { readonly synthesis_loop_sites: number }): number {
    return leg.synthesis_loop_sites;
  }
} as const);

/**
 * DR-181/182 + T17 (DR-184-v4): an invisible bug tripwire derived from the
 * engine's exported facts and T16's sealed envelope row.
 *
 * The ceiling counts CALL SITES and multiplies each by the attempts that site
 * can spend. Four legs, each one measured off the shipped runner:
 *
 *  · AUTHOR — one call per materialized node, wrapped in `withCooldownRetry`
 *    (apps/runner/src/index.ts:250). That helper runs TWO provider sequences,
 *    but they do NOT each get a fresh allowance: the shipped gateway counts
 *    attempts CUMULATIVELY per call-site key off the ledger and passes
 *    `remaining = bound.maxAttempts - consumed` (apps/runner/src/index.ts
 *    :3565-3577, `remainingProviderAttempts`). So sequence 1 spends
 *    `judgeMaxAttempts` and sequence 2 spends only the `finalRetryAttempts`
 *    that remain: `judgeMaxAttempts + finalRetryAttempts` for the SITE.
 *    (An earlier draft of this formula read the second sequence as a fresh
 *    allowance and provisioned `2*judge + final`. The maximum-path ledger test
 *    in tests/integration/t17-envelope-ledger.test.ts measured 4 attempts at a
 *    site it had modelled as 7 and refuted it — the reason that test reads a
 *    real ledger instead of a second in-memory model of this same file.)
 *  · PANEL — the sealed row's `panelCallsPerNodeBasis` NAMES this leg's basis
 *    (`PANEL_SIZE_MINUS_ONE`) and its own zod literal is the loud stop for any
 *    other basis, so the derivation below is the row's, never this file's.
 *    `runNodePanel` hands every configured maker to `runJudgePanel`,
 *    which skips the author (PRODUCER_GRADING_FORBIDDEN) and calls the rest:
 *    `panelSize - 1` calls per materialized node, at every node, not just the
 *    roots. Not cooldown-wrapped, so `judgeMaxAttempts` each. DR-184-v2
 *    counted this leg at ZERO — the defect F36 exists to close.
 *  · REVIEWER — `reviewerCallsPerNode` cross-maker reviews per materialized
 *    node, deduped by node and cooldown-wrapped like the author leg.
 *  · SERVE — the SYNTHESIS LOOP, and only it. T9 retired the composer,
 *    per-segment conformance and post-compose R9 organs into the
 *    synthesizer/evaluator pair, and the shipped runner wires none of them
 *    (apps/runner/src/index.ts:1083 `conformance: []`; it mints no `COMPOSER:`
 *    or `CONFORMANCE:` call-site key at all). The runner opens ONE site per
 *    synthesis role per round — `synthesize` at :4076 and `evaluate` at :4154,
 *    each keyed by `request.round` — so the leg is `roles x rounds`, which is
 *    what `SERVE_LEG.sites` states. The runner says so itself at :1162-1172:
 *    "the real count is `rounds x 2 roles`… Refitting that formula is T17's."
 *    (F-T17T9-3. Until then the leg was `max(compositionSites, synthesisLoop)`,
 *    which billed the retired chain's SEVEN sites and sealed a ceiling of 109
 *    against a true maximum of 106 — measured from a real ledger in
 *    tests/integration/t17-envelope-ledger.test.ts. V ruled on 2026-09-05 to
 *    seal the true number rather than keep the difference as padding.)
 *    `maxRecompose` and `fixedOrgansPerComposition` remain on the sealed row
 *    because the deployment still declares them and `apps/api/src/main.ts`
 *    still passes them; they are CHECKED for coherence below and BILLED
 *    nowhere. `compositionSegmentCap` is NOT retired — it still caps the
 *    synthesizer's segment array (apps/runner/src/index.ts:135).
 *
 * Repair attempts are NOT a separate term: `buildRepairPacket` is consumed
 * inside the per-site attempt loop (packages/providers/src/index.ts:326-427),
 * so a repair is one of the `maxAttempts` the site already provisions.
 */
export function computeStructuralCeilingBasis(input: StructuralCeilingInput): Readonly<Record<string, unknown>> & {
  readonly max_model_attempts: number;
} {
  for (const name of STRUCTURAL_CEILING_MEMBERS) {
    const value = input[name];
    if (!Number.isInteger(value) || value < 1) {
      throw new TypedDomainError(
        `STRUCTURAL_CEILING_${name.toUpperCase()}_INVALID`,
        `The structural ceiling input ${name} must be a positive integer`
      );
    }
  }
  if (input.depth > input.maxDepth) {
    // B2: the refusal belongs HERE, at admission. `evaluateAskAdmission` wraps
    // this call and `markAskRefusal` turns a TypedDomainError into an
    // AskRefusal, so an over-bound ask is refused on the 422 face before any
    // provider spend — instead of minting a positive ceiling that only stops
    // later when the runner resolves the depth or parses the stored basis.
    throw new TypedDomainError(
      "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM",
      `Requested depth ${input.depth} exceeds the sealed maximum depth ${input.maxDepth}`
    );
  }
  const nodesPerRoot = input.panelSize === 1
    ? 1
    : (input.branchingFactor ** (input.depth + 1) - 1) / (input.branchingFactor - 1);
  if (!Number.isInteger(nodesPerRoot)) {
    throw new TypedDomainError("STRUCTURAL_CEILING_TREE_INVALID", "The expansion tree is not integral");
  }
  // S2-2: the walking-skeleton literal is reachable at M=1 only — one node, no
  // panel, no cross-maker review.
  const materializedNodes = input.panelSize === 1
    ? 1
    : input.panelSize * nodesPerRoot + input.panelSize * (input.panelSize - 1);
  const cooldownSiteAttempts = input.judgeMaxAttempts + input.finalRetryAttempts;
  const authorSites = materializedNodes;
  const panelSites = input.panelSize === 1 ? 0 : (input.panelSize - 1) * materializedNodes;
  const reviewerSites = input.panelSize === 1 ? 0 : input.reviewerCallsPerNode * materializedNodes;
  // THE RETIRED COMPOSITION TOPOLOGY — declared, checked, and BILLED NOWHERE.
  // The sealed row still carries `fixedOrgansPerComposition`, `maxRecompose`
  // and `compositionSegmentCap`, and `apps/api/src/main.ts` still passes all
  // three, so a deployment that declares an incoherent shape must still be
  // refused. What changed in F-T17T9-3 is that the shape no longer produces a
  // competing serve arm: `maxRecompose * (1 + segmentCap) + 1` used to bind the
  // leg at seven sites, and the leg is now the synthesis loop unconditionally.
  // (`compositionSegmentCap` is NOT retired either way — it still caps the
  // synthesizer's segment array at apps/runner/src/index.ts:135.)
  const compositionSitesPerRound = 1 + input.compositionSegmentCap;
  const postComposeSitesPerRun = 1;
  if (input.fixedOrgansPerComposition !== compositionSitesPerRound + postComposeSitesPerRun) {
    throw new TypedDomainError(
      "STRUCTURAL_CEILING_COMPOSITION_SHAPE_INCOHERENT",
      `fixedOrgansPerComposition ${input.fixedOrgansPerComposition} does not equal `
      + `1 composer + ${input.compositionSegmentCap} conformance + 1 post-compose organ`
    );
  }
  // F-T17T9-3: the serve leg is the SHIPPED chain, read from the one rule.
  const synthesisLoopSites = SERVE_LEG.sites(input);
  const serveSites = synthesisLoopSites;
  const maxModelAttempts = (authorSites + reviewerSites) * cooldownSiteAttempts
    + panelSites * input.judgeMaxAttempts
    + serveSites * input.organMaxAttempts;
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING",
    max_model_attempts: maxModelAttempts,
    panel_size: input.panelSize,
    depth: input.depth,
    per_site_attempts: Object.freeze({
      judge: input.judgeMaxAttempts,
      organ: input.organMaxAttempts,
      panel_member: input.judgeMaxAttempts,
      cooldown_site: cooldownSiteAttempts
    }),
    call_sites: Object.freeze({
      author: authorSites,
      panel: panelSites,
      reviewer: reviewerSites,
      serve: serveSites
    }),
    /**
     * Which serve chain bound the leg, so a reader of a stored receipt can see
     * WHICH topology the run was admitted under. A basis that reports
     * COMPOSITION is a basis minted against the chain T9 retired, and both the
     * literal here and the parser's accepted value come from `SERVE_LEG.chain`
     * — one constant, so a stale receipt fails loudly instead of parsing.
     */
    serve_leg: Object.freeze({
      synthesis_loop_sites: synthesisLoopSites,
      selected: SERVE_LEG.chain
    }),
    hold_cap: input.maxCooldownHoldsPerRun,
    final_retry_attempts: input.finalRetryAttempts,
    formula_version: "DR-184-v4",
    bounds_source_ref: "engine-exports+register"
  });
}

const structuralBoundSchema = z.object({
  kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
  organs: z.object({
    JUDGE: z.object({ maxAttempts: z.number().int().positive() }).passthrough(),
    COMPOSER: z.object({ maxAttempts: z.number().int().positive() }).passthrough(),
    CONFORMANCE: z.object({ maxAttempts: z.number().int().positive() }).passthrough()
  }).passthrough()
}).passthrough();

const structuralDeathSchema = z.object({
  kind: z.literal("RUN_DEATH_POLICY"),
  final_retry_attempts: z.number().int().positive(),
  max_cooldown_holds_per_run: z.number().int().positive()
}).passthrough();

export async function readStructuralCeilingPolicyInputs(pool: Pool, registerVersion: number): Promise<{
  readonly judgeMaxAttempts: number;
  readonly organMaxAttempts: number;
  readonly finalRetryAttempts: number;
  readonly maxCooldownHoldsPerRun: number;
}> {
  const result = await pool.query<{ row_key: string; value_json: unknown }>(
    `SELECT row_key, value_json FROM register.register_row
     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
    [registerVersion, ["acceptanceOrganCostBounds", "runDeathPolicy"]]
  );
  const byKey = new Map(result.rows.map((row) => [row.row_key, row.value_json]));
  const bounds = structuralBoundSchema.safeParse(byKey.get("acceptanceOrganCostBounds"));
  const death = structuralDeathSchema.safeParse(byKey.get("runDeathPolicy"));
  if (!bounds.success || !death.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_INPUTS_UNRESOLVED", "The engine attempt bounds or death policy are absent");
  }
  return Object.freeze({
    judgeMaxAttempts: bounds.data.organs.JUDGE.maxAttempts,
    organMaxAttempts: Math.max(bounds.data.organs.COMPOSER.maxAttempts, bounds.data.organs.CONFORMANCE.maxAttempts),
    finalRetryAttempts: death.data.final_retry_attempts,
    maxCooldownHoldsPerRun: death.data.max_cooldown_holds_per_run
  });
}

export async function readPanelDiscoveryPolicy(pool: Pool, registerVersion: number): Promise<{
  readonly probeFreshnessMs: number;
  readonly probeMaxAttempts: 1;
  readonly sourceRef: string;
}> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key='panelDiscoveryPolicy'`,
    [registerVersion]
  );
  const row = result.rows[0];
  const parsed = z.object({
    kind: z.literal("PANEL_DISCOVERY_POLICY"),
    probe_freshness_ms: z.number().int().positive(),
    probe_max_attempts: z.literal(1)
  }).strict().safeParse(row?.value_json);
  if (row === undefined || !parsed.success || row.source_ref.trim() === "") {
    throw new TypedDomainError("PANEL_DISCOVERY_POLICY_UNRESOLVED", "No ruled discovery policy is available");
  }
  return Object.freeze({
    probeFreshnessMs: parsed.data.probe_freshness_ms,
    probeMaxAttempts: parsed.data.probe_max_attempts,
    sourceRef: row.source_ref
  });
}

export interface DeploymentRiskTierRow {
  readonly rowKey: typeof DEPLOYMENT_RISK_TIER_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: RiskTier;
}

/** One deployment-floor source for every composition root and UI projection. */
export async function readDeploymentRiskTier(
  pool: Pool,
  registerVersion: number
): Promise<DeploymentRiskTierRow> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for the deployment risk tier");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = $2`,
    [registerVersion, DEPLOYMENT_RISK_TIER_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "RISK_TIER_POLICY_UNRESOLVED",
      `No V-ratified ${DEPLOYMENT_RISK_TIER_ROW_KEY} exists in register version ${registerVersion}`
    );
  }
  const parsed = z.enum(RISK_TIERS).safeParse(row.value_json);
  if (!parsed.success) {
    throw new TypedDomainError("RISK_TIER_POLICY_INVALID", `${DEPLOYMENT_RISK_TIER_ROW_KEY} is not a ruled risk tier`);
  }
  if (row.source_ref.trim() === "") {
    throw new TypedDomainError("RISK_TIER_POLICY_PROVENANCE_MISSING", `${DEPLOYMENT_RISK_TIER_ROW_KEY} has no source_ref`);
  }
  return Object.freeze({
    rowKey: DEPLOYMENT_RISK_TIER_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: parsed.data
  });
}

const convergenceEpsilonSchema = z.object({
  kind: z.literal("CONVERGENCE_EPSILON"),
  epsilon: z.number().finite().nonnegative()
}).strict();

const convergenceStopDefaultsSchema = z.object({
  kind: z.literal("CONVERGENCE_STOP_DEFAULTS"),
  members: z.record(z.string().trim().min(1), z.unknown())
    .refine((members) => Object.keys(members).length > 0)
}).strict();

export async function readConvergenceControls(pool: Pool, registerVersion: number): Promise<{
  readonly registerVersion: number;
  readonly epsilon: number;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly epsilonSourceRef: string;
  readonly defaultsSourceRef: string;
}> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for convergence controls");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])`,
    [registerVersion, [CONVERGENCE_EPSILON_ROW_KEY, CONVERGENCE_STOP_DEFAULTS_ROW_KEY]]
  );
  const epsilonRow = result.rows.find((row) => row.row_key === CONVERGENCE_EPSILON_ROW_KEY);
  const defaultsRow = result.rows.find((row) => row.row_key === CONVERGENCE_STOP_DEFAULTS_ROW_KEY);
  if (epsilonRow === undefined || defaultsRow === undefined) {
    throw new TypedDomainError(
      "CONVERGENCE_CONTROLS_UNRESOLVED",
      `Both ${CONVERGENCE_EPSILON_ROW_KEY} and ${CONVERGENCE_STOP_DEFAULTS_ROW_KEY} are mandatory`
    );
  }
  const epsilon = convergenceEpsilonSchema.safeParse(epsilonRow.value_json);
  const defaults = convergenceStopDefaultsSchema.safeParse(defaultsRow.value_json);
  if (!epsilon.success || !defaults.success) {
    throw new TypedDomainError("CONVERGENCE_CONTROLS_INVALID", "H8 convergence controls violate their ruled member types");
  }
  if (epsilonRow.source_ref.trim() === "" || defaultsRow.source_ref.trim() === "") {
    throw new TypedDomainError("CONVERGENCE_CONTROLS_PROVENANCE_MISSING", "H8 convergence controls require source_ref");
  }
  return Object.freeze({
    registerVersion,
    epsilon: epsilon.data.epsilon,
    defaults: Object.freeze({ ...defaults.data.members }),
    epsilonSourceRef: epsilonRow.source_ref,
    defaultsSourceRef: defaultsRow.source_ref
  });
}

const bootstrapKeys = [
  "nodeRuntimeVersion",
  "pnpmVersion",
  "postgresMajorVersion",
  "typescriptVersion",
  "vllmImageDigest"
] as const;

export type BootstrapKey = typeof bootstrapKeys[number];

const bootstrapSchema = z.object({
  registerVersion: z.literal(1),
  values: z.object({
    nodeRuntimeVersion: z.string().min(1),
    pnpmVersion: z.string().min(1),
    postgresMajorVersion: z.string().regex(/^\d+$/),
    typescriptVersion: z.string().min(1),
    vllmImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  }).strict(),
  resolution: z.record(z.enum(bootstrapKeys), z.string().min(1))
});

export type BootstrapRegister = z.infer<typeof bootstrapSchema>;

export async function loadBootstrapRegister(
  location = new URL("../../../register.bootstrap.json", import.meta.url)
): Promise<BootstrapRegister> {
  const raw = await readFile(location, "utf8");
  return bootstrapSchema.parse(JSON.parse(raw));
}

export type RegisterLevel = OperatorSupplyingLevel;

export function resolveRegisterValue<T>(
  key: string,
  levels: Readonly<Record<RegisterLevel, Readonly<Record<string, T>>>>
): { readonly value: T; readonly suppliedBy: RegisterLevel } {
  for (const suppliedBy of OPERATOR_SUPPLYING_LEVELS) {
    if (Object.hasOwn(levels[suppliedBy], key)) {
      return { value: levels[suppliedBy][key]!, suppliedBy };
    }
  }
  throw new Error(`Unresolved register key: ${key}`);
}

export interface EffectiveRiskTierResolution {
  readonly effectiveRiskTier: RiskTier;
  readonly tierSource: "ASKER" | "DEPLOYMENT_POLICY";
  readonly tierProvenanceRef: string;
  readonly policySuppliedBy: RegisterLevel | null;
}

export function resolveEffectiveRiskTier(input: {
  readonly askerTier: RiskTier;
  readonly askerProvenanceRef: string;
  readonly policyLevels: Readonly<Record<RegisterLevel, Readonly<Partial<Record<"riskTier", RiskTier>>>>>;
}): EffectiveRiskTierResolution {
  if (input.askerProvenanceRef.trim() === "") {
    throw new TypedDomainError("TIER_PROVENANCE_MISSING", "The asker declaration must carry provenance");
  }
  let policy: { readonly value: RiskTier; readonly suppliedBy: RegisterLevel } | null = null;
  try {
    policy = resolveRegisterValue("riskTier", input.policyLevels);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Unresolved register key: riskTier") throw error;
  }
  if (policy !== null && !(RISK_TIERS as readonly string[]).includes(policy.value)) {
    throw new TypedDomainError("RISK_TIER_POLICY_INVALID", `Invalid risk tier at ${policy.suppliedBy}`);
  }
  const askerRank = RISK_TIERS.indexOf(input.askerTier);
  const policyRank = policy === null ? -1 : RISK_TIERS.indexOf(policy.value);
  if (policy !== null && policyRank > askerRank) {
    return Object.freeze({
      effectiveRiskTier: policy.value,
      tierSource: "DEPLOYMENT_POLICY",
      tierProvenanceRef: input.askerProvenanceRef,
      policySuppliedBy: policy.suppliedBy
    });
  }
  return Object.freeze({
    effectiveRiskTier: input.askerTier,
    tierSource: "ASKER",
    tierProvenanceRef: input.askerProvenanceRef,
    policySuppliedBy: null
  });
}

export function resolveScoringOperator(
  levels: Readonly<Record<RegisterLevel, Readonly<Record<string, unknown>>>>
): { readonly value: ScoringOperator; readonly suppliedBy: RegisterLevel } {
  if (!Object.hasOwn(levels.deployment, "scoringOperator")) {
    throw new Error("Mandatory deployment register row is missing: scoringOperator");
  }
  for (const suppliedBy of OPERATOR_SUPPLYING_LEVELS) {
    if (!Object.hasOwn(levels[suppliedBy], "scoringOperator")) continue;
    const value = levels[suppliedBy].scoringOperator;
    if (!(SCORING_OPERATORS as readonly unknown[]).includes(value)) {
      throw new Error(`Invalid scoringOperator register value at ${suppliedBy}`);
    }
    return Object.freeze({ value: value as ScoringOperator, suppliedBy });
  }
  throw new Error("Mandatory deployment register row is missing: scoringOperator");
}

export async function persistBootstrapRegister(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
  const rows = [
    ...bootstrapKeys.map((rowKey) => Object.freeze({
      rowKey,
      value: bootstrap.values[rowKey],
      sourceRef: bootstrap.resolution[rowKey]
    })),
    ...AUTH_POLICY_REGISTER_ROWS,
    MFA_POLICY_REGISTER_ROW,
    SESSION_POLICY_REGISTER_ROW,
    RECOVERY_POLICY_REGISTER_ROW,
    PRODUCT_ROLE_POLICY_REGISTER_ROW
  ];
  const publicationRows = buildBootstrapRegisterPublicationRowsFromRows(rows);
  try {
    await createPostgresRegisterPublicationPort(pool).importHistorical({
      registerVersion: parseRegisterVersionText(String(bootstrap.registerVersion)),
      rows: publicationRows
    });
  } catch (error) {
    if (error instanceof Error && /REGISTER_PUBLICATION_SEAL_INVALID/u.test(error.message)) {
      throw new TypeError("FX-REG-SEALED_VERSION_MISMATCH", { cause: error });
    }
    throw error;
  }
}

function buildBootstrapRegisterPublicationRowsFromRows(
  rows: readonly Readonly<{ rowKey: string; value: unknown; sourceRef: string; valueAst?: CanonicalJsonAst }>[]
): readonly RegisterPublicationRow[] {
  return Object.freeze(rows.map((row) =>
    Object.freeze({
      rowKey: row.rowKey,
      valueJsonText: canonicalRegisterJson(
        ("valueAst" in row ? row.valueAst : row.value) as CanonicalJsonAst
      ),
      sourceRef: row.sourceRef
    })
  ));
}

export function buildBootstrapRegisterPublicationRows(
  bootstrap: BootstrapRegister
): readonly RegisterPublicationRow[] {
  return buildBootstrapRegisterPublicationRowsFromRows([
    ...bootstrapKeys.map((rowKey) => Object.freeze({
      rowKey,
      value: bootstrap.values[rowKey],
      sourceRef: bootstrap.resolution[rowKey]
    })),
    ...AUTH_POLICY_REGISTER_ROWS,
    MFA_POLICY_REGISTER_ROW,
    SESSION_POLICY_REGISTER_ROW,
    RECOVERY_POLICY_REGISTER_ROW,
    PRODUCT_ROLE_POLICY_REGISTER_ROW
  ]);
}

export async function assertBootstrapEquality(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
  const result = await pool.query<{ row_key: BootstrapKey; value_json: unknown }>(
    `SELECT row_key, value_json FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])
     ORDER BY row_key`,
    [bootstrap.registerVersion, bootstrapKeys]
  );
  if (result.rows.length !== bootstrapKeys.length) {
    throw new Error(`FX-REG-01 bootstrap row count mismatch: expected ${bootstrapKeys.length}, received ${result.rows.length}`);
  }
  for (const row of result.rows) {
    if (row.value_json !== bootstrap.values[row.row_key]) {
      throw new Error(`FX-REG-01 bootstrap mismatch at ${row.row_key}`);
    }
  }
}

export {
  ADAPTIVE_STOPPING_ROW_KEYS,
  ALGORITHM_REGISTER_ROW_FAMILIES,
  ALGORITHM_REGISTER_ROW_KEYS,
  ENVELOPE_FORMULA_ROW_KEYS,
  PANEL_WEIGHTING_ROW_KEYS,
  SYNTHESIS_ROLE_ROW_KEYS,
  SYNTHESIS_ROLE_REFS_IDENTICAL_WARNING,
  T16_ROLE_RULING_REF,
  VERDICT_LABEL_ROW_KEYS,
  buildAlgorithmRegisterRows,
  buildOneStepDownBands,
  warnOnIdenticalSynthesisRoleRefs,
  readAdaptiveStoppingControls,
  readEnvelopeFormulaInputs,
  readPanelWeightingControls,
  readSynthesisRoleControls,
  readVerdictLabelControls,
  type AdaptiveStoppingControls,
  type AlgorithmRegisterRow,
  type AlgorithmRegisterRowFamily,
  type AlgorithmRegisterRowsInput,
  type EnvelopeFormulaInputs,
  type PanelWeightingControls,
  type ProviderFamilyEntry,
  type SynthesisRoleControls,
  type VerdictLabelControls
} from "./algorithm-policy.js";

export {
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF,
  CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION,
  CONFIGURED_PROVIDER_SET_ROW_KEY,
  CONFIGURED_PROVIDER_SET_SEALED_VERSION,
  buildConfiguredProviderSetDeploymentRow,
  buildConfiguredProviderSetSealedRow,
  type ConfiguredProvider,
  type ConfiguredProviderSetRow,
  type ConfiguredProviderVetting,
  type VettedConfiguredProvider
} from "./configured-provider-set.js";

export {
  DEPLOYMENT_MODES,
  assertHostedCostEnvelopesSealed,
  assertHostedSupportAdmissionSealed,
  assertProductionFloors,
  readOperatorCommandEnvironment,
  readSealedCostEnvelopeStatus,
  resolveDeploymentMode,
  CostEnvelopesNotSealedError,
  DeploymentModeInvalidError,
  DeploymentModeUnresolvedError,
  SupportAdmissionScopesNotSealedError,
  type DeploymentMode,
  type SealedCostEnvelopeStatus,
  loadApiEnvironment,
  loadDevelopmentCommandEnvironment,
  loadKeyRotationEnvironment,
  loadLivenessEnvironment,
  loadMigrationEnvironment,
  loadReplaySelfTestEnvironment,
  loadRunnerEnvironment,
  loadSettlementEnvironment,
  parseApiEnvironment,
  parseKeyRotationEnvironment,
  parseLivenessEnvironment,
  parseMigrationEnvironment,
  parseReplaySelfTestEnvironment,
  parseRunnerEnvironment,
  parseSettlementEnvironment
} from "./runtime-environment.js";

export {
  AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,
  AUTH_POLICY_REGISTER_ROWS,
  AUTH_POLICY_ROW_KEYS,
  authPolicyFromRegisterRows,
  readAuthPolicy,
  type AuthPolicy,
  type AuthPolicyRegisterRow,
  type AuthRouteLimit
} from "./auth-policy.js";
// V-28 (DL4-F2): the per-run and daily spending ceilings, in money.
export {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  COST_ENVELOPE_POLICY_ROW_KEY,
  costEnvelopePolicyFromValue,
  readCostEnvelopePolicy,
  type CostEnvelopePolicy,
  type CostEnvelopePolicyValue
} from "./cost-envelope-policy.js";
export {
  MFA_POLICY_REGISTER_ROW,
  MFA_POLICY_ROW_KEY,
  mfaPolicyFromValue,
  readMfaPolicy,
  type MfaPolicy,
  type MfaPolicyValue
} from "./mfa-policy.js";
export {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  ADMISSION_POLICY_ROW_KEY,
  SESSION_POLICY_REGISTER_ROW,
  SESSION_POLICY_ROW_KEY,
  admissionPolicyFromValue,
  readAdmissionPolicy,
  readSessionPolicy,
  sessionPolicyFromValue,
  type AdmissionPolicy,
  type AdmissionPolicyValue,
  type AdmissionScopePolicy,
  type SessionPolicy,
  type SessionPolicyValue
} from "./session-policy.js";
export {
  RECOVERY_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_ROW_KEY,
  readRecoveryPolicy,
  recoveryPolicyFromRegisterRows,
  type RecoveryPolicy,
  type RecoveryPolicyRegisterRow,
  type RecoveryPolicyValue
} from "./recovery-policy.js";
export {
  PRODUCT_ROLE_IDS,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_ROW_KEY,
  productRolePolicyFromRegisterRows,
  readProductRolePolicy,
  type ProductRole,
  type ProductRoleId,
  type ProductRolePolicy,
  type ProductRolePolicyRegisterRow
} from "./product-role-policy.js";

export {
  SUPPORT_CONFIGURATION_KEYS,
  canonicalDecimal,
  canonicalRegisterJson,
  computeGeneralPublicationRequestSha256,
  computeRegisterSnapshotSha256,
  computeSupportPublicationRequestSha256,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber,
  validateSupportConfigurationValue,
  type CanonicalDecimalText,
  type CanonicalJsonAst,
  type CanonicalRegisterJson,
  type GeneralRegisterPublication,
  type GeneralRegisterPublicationRequest,
  type HistoricalRegisterImport,
  type HistoricalRegisterImportReceipt,
  type RegisterPublicationDeployment,
  type RegisterPublicationPort,
  type RegisterPublicationReceipt,
  type RegisterPublicationRow,
  type RegisterVersionText,
  type SupportConfigurationKey,
  type SupportConfigurationPatchRow,
  type SupportConfigurationPublication,
  type SupportConfigurationStatus,
  type SupportPublicationReceipt
} from "./register-publication.js";

export {
  SUPPORT_CONFIG_CACHE_MAX_AGE_MS,
  SUPPORT_CONFIG_REFRESH_DEADLINE_MS,
  createSupportConfigurationPort,
  type SupportConfigurationPort,
  type SupportConfigurationPortOptions,
  type SupportConfigurationSnapshot,
  type SupportConfigurationState,
  type SupportConfigurationValues
} from "./support-config.js";
