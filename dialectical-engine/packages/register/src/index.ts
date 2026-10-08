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
  /**
   * A14 · DR-184-v5 (model scorecard; pre-flight ruling F17) — whether each
   * seat call is provisioned ONE backup sequence: 1 only when the run's pinned
   * role assignment gives at least one seat a runner-up, else 0. Admission
   * decides it (`evaluateAskAdmission`). Absent means 0 — DR-184-v4 exactly,
   * the number V sealed on 2026-09-05 without padding — which is the right
   * value for every caller that predates the scorecard: no runner-up can exist
   * without a pinned assignment. Checked below: exactly 0 or 1, never a count;
   * only `undefined` counts as absent (`null` is refused like any other value).
   */
  readonly backupSequencesProvisioned?: 0 | 1;
}

/**
 * The DECLARED members, checked by name. Iterating `Object.entries(input)`
 * instead — as DR-184-v2 did — validates only the members a caller happened to
 * pass, so an omitted term reached the arithmetic as `undefined` and minted a
 * `NaN` ceiling in silence. A missing term is now as loud as an invalid one.
 */
const STRUCTURAL_CEILING_MEMBERS: readonly Exclude<keyof StructuralCeilingInput, "backupSequencesProvisioned">[] = Object.freeze([
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
 *
 * A14 · DR-184-v5 (model scorecard; owner ruling R4, 2026-09-26; pre-flight
 * ruling F17; A14 fix round 1) — ONE BACKUP SEQUENCE PER SWITCHABLE SEAT
 * CALL, ONLY WHEN PROVISIONED. A seat whose main candidate fails its call
 * (transport exhausted after the normal retries, or a subscription usage cap)
 * is answered by its runner-up, under the runner-up's OWN call-site key
 * (`…:seat:runnerUp`), so the gateway's cumulative per-key count gives it a
 * fresh allowance that v4 never provisioned. What v5 seals is the per-site
 * maximum across restarts; cross-exchange sites have no backup and keep v4's
 * allowance:
 *  · a run pass keeps its "down" marks in memory only, so a resumed run can
 *    switch a seat again. What holds across restarts is the ledger's per-key
 *    count: each candidate key is capped at the `maxAttempts` its caller
 *    passes, and a key at its cap is refused before any spend
 *    (`CALL_BUDGET_EXHAUSTED`, which is never a reason to switch). So every
 *    bound below is a bound per SITE across restarts, not a story about one call;
 *  · AUTHOR/REVIEWER (cooldown-wrapped): sequence 1 passes `judge` to each of
 *    the seat's two keys; the post-cooldown sequence passes `judge + final` to
 *    ONE key and so adds only that key's remainder, the final retry; a resumed
 *    pass meets a spent key's refusal, not a second post-cooldown sequence —
 *    `2 * judge + final`, the number the earlier draft reached for a single key
 *    and the ledger refuted; it is reachable now only through TWO keys;
 *  · CROSS-EXCHANGE AUTHOR: written by its root's own answerer on a seat built
 *    with no runner-up, so ONE key and v4's `judge + final` in every run,
 *    disclosed as `per_site_attempts.cross_exchange_site`. They are the
 *    `panelSize * (panelSize - 1)` exchange nodes among the author sites; their
 *    panel and review sites are ordinary judge seats and keep the backup;
 *  · PANEL: two keys, never cooldown-wrapped — `2 * judge`;
 *  · SERVE: two keys at the synthesis bound — `2 * organ`;
 *  · the 80-20 split MOVES a call between a seat's two keys, never adds one;
 *  · the runner calls at most `panelSize - 1` judges per node and refuses an
 *    assignment that seats more than `panelSize` debaters, so the four site
 *    counts are v4's.
 * PRECONDITION (controller ruling A14; A16c, controller carries 11 and 14a):
 * these bounds are exact provided every run pass derives a site's eligible
 * members, their order and — for a cross-exchange — the root's writer from the
 * site's identity and the ledger alone, never from in-memory visit order: the
 * pinned assignment, the site-pure 80-20 ordinal (`seatSiteOrdinal`), and the
 * ledger's per-key history (A15d's restoration, A16a's preference and
 * hand-off), so a resumed pass meets the same members in the same order at
 * every site it re-authors. A15d and A16a guarantee this; the per-key gateway
 * caps plus A15d's final-retry check (carry 3) are what bound the site across
 * any number of passes. Caveat (carry 14a): a cross-exchange site keeps the ONE
 * key the ledger already holds for it, so after a resumed root is written by
 * its other slot the key's `:seat:` marker no longer names the member that
 * answers — the bound still holds, because it counts per KEY, but the marker is
 * never a record of who answered; read the ledger row's actor and candidate.
 * A run with no runner-up can never spend a backup sequence, so admission
 * passes `backupSequencesProvisioned: 0` (or nothing) for it and the ceiling
 * stays DR-184-v4, the TRUE maximum V ruled on 2026-09-05 to seal without
 * padding. The receipt names its formula, and its per-site values are read
 * WITH that name: `per_site_attempts.judge` is always the sequence bound;
 * `organ` is the per-round serve limit in v4 and the serve site's total,
 * backup included, in v5; `panel_member` and `cooldown_site` are per site; and
 * `cross_exchange_site` exists on v5 receipts only, so a v4 receipt is
 * byte-identical to the one minted before A14.
 */
export function computeStructuralCeilingBasis(input: StructuralCeilingInput): Readonly<Record<string, unknown>> & {
  readonly max_model_attempts: number;
  readonly serve_reserve_attempts: number;
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
  // A14 (pre-flight ruling F17): the backup provision is a switch, never a count.
  // Only a MISSING value means 0: `null`, `"1"`, `true` or `NaN` is a caller's
  // defect, refused rather than read as DR-184-v4 in silence.
  const provision: unknown = input.backupSequencesProvisioned;
  if (provision !== undefined && provision !== 0 && provision !== 1) {
    throw new TypedDomainError(
      "STRUCTURAL_CEILING_BACKUPSEQUENCESPROVISIONED_INVALID",
      "The structural ceiling input backupSequencesProvisioned must be 0 or 1"
    );
  }
  const backupSequences = provision === 1 ? 1 : 0;
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
  // The M(M-1) cross-root exchange nodes (`buildCrossRootExchangePlan`).
  const crossExchangeNodes = input.panelSize === 1 ? 0 : input.panelSize * (input.panelSize - 1);
  // S2-2: the walking-skeleton literal is reachable at M=1 only — one node, no
  // panel, no cross-maker review.
  const materializedNodes = input.panelSize === 1
    ? 1
    : input.panelSize * nodesPerRoot + crossExchangeNodes;
  // A14 (DR-184-v5 when provisioned): one backup sequence per switchable seat call — see the doc comment.
  const backupJudgeSequence = input.judgeMaxAttempts * backupSequences;
  const backupOrganSequence = input.organMaxAttempts * backupSequences;
  const cooldownSiteAttempts = input.judgeMaxAttempts + input.finalRetryAttempts + backupJudgeSequence;
  // A14 fix round 1: a cross-exchange author seat has no runner-up, so v4's allowance in every run.
  const crossExchangeSiteAttempts = input.judgeMaxAttempts + input.finalRetryAttempts;
  const panelMemberAttempts = input.judgeMaxAttempts + backupJudgeSequence;
  const serveSiteAttempts = input.organMaxAttempts + backupOrganSequence;
  const authorSites = materializedNodes;
  const crossExchangeAuthorSites = crossExchangeNodes;
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
  // In v4 the cross-exchange term equals the cooldown term, so this is v4's sum exactly.
  const maxModelAttempts = (authorSites - crossExchangeAuthorSites + reviewerSites) * cooldownSiteAttempts
    + crossExchangeAuthorSites * crossExchangeSiteAttempts
    + panelSites * panelMemberAttempts
    + serveSites * serveSiteAttempts;
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING",
    max_model_attempts: maxModelAttempts,
    panel_size: input.panelSize,
    depth: input.depth,
    /**
     * Read WITH `formula_version`. `judge` is the per-sequence bound in both
     * formulas. `organ` is the per-round serve limit in DR-184-v4 and the serve
     * site's total, main plus backup, in DR-184-v5. `panel_member` and
     * `cooldown_site` are per site. `cross_exchange_site` exists on DR-184-v5
     * only (A14 fix round 1), so a DR-184-v4 receipt keeps its sealed bytes.
     */
    per_site_attempts: Object.freeze({
      judge: input.judgeMaxAttempts,
      organ: serveSiteAttempts,
      panel_member: panelMemberAttempts,
      cooldown_site: cooldownSiteAttempts,
      ...(backupSequences === 1 ? { cross_exchange_site: crossExchangeSiteAttempts } : {})
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
    /**
     * Engine money rule, Task M1 (spec 2026-09-26 §14.4.1) — THE ANSWER'S
     * CALLS, HELD BACK: the serve leg priced in attempts exactly as it is
     * billed into `max_model_attempts` above (`serveSites x serveSiteAttempts`).
     * In DR-184-v4 that is the per-round organ limit; in DR-184-v5 (paid plans
     * S1a) it is the serve site's total, main plus backup, so the body can never
     * spend the answer's backup allowance. `parseCostEnvelopeBasis` checks the
     * same product against `per_site_attempts.organ`. A call made while the
     * debate is argued sees `max_model_attempts` less this; an answer-writing
     * call sees the whole ceiling. So a debate that uses up its own calls still
     * leaves the answer its calls.
     *
     * Carried on the receipt rather than re-derived by the reader, so the rule
     * is the one the run was ADMITTED under: a receipt minted before this
     * member existed has no reserve (`parseCostEnvelopeBasis` reads it as 0).
     */
    serve_reserve_attempts: serveSites * serveSiteAttempts,
    hold_cap: input.maxCooldownHoldsPerRun,
    final_retry_attempts: input.finalRetryAttempts,
    formula_version: backupSequences === 1 ? "DR-184-v5" : "DR-184-v4",
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

/**
 * B9 (budget spec §2.10) — the judge bound's `max_tokens`, for the boot check
 * that prices the first position's own call. The runner reads the same member
 * through its own policy reader (`policy.bounds.JUDGE.tokenCeiling`); the API
 * reads only this. A register without it cannot boot the runner either.
 */
export async function readJudgeTokenCeiling(pool: Pool, registerVersion: number): Promise<number> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row
     WHERE register_version=$1 AND row_key='acceptanceOrganCostBounds'`,
    [registerVersion]
  );
  return judgeTokenCeilingFromValue(result.rows[0]?.value_json);
}

/**
 * The same member read from an `acceptanceOrganCostBounds` value already in
 * hand: the hosted publish command's plan asks the boot check of the rows it is
 * about to seal (final review Part 1b, Important 3). `undefined` (no row) and a
 * malformed value both refuse STRUCTURAL_CEILING_INPUTS_UNRESOLVED.
 */
export function judgeTokenCeilingFromValue(value: unknown): number {
  const parsed = z.object({
    kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
    organs: z.object({
      JUDGE: z.object({ tokenCeiling: z.number().int().positive() }).passthrough()
    }).passthrough()
  }).passthrough().safeParse(value);
  if (!parsed.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_INPUTS_UNRESOLVED", "The judge bound's token ceiling is absent");
  }
  return parsed.data.organs.JUDGE.tokenCeiling;
}

/**
 * Final review I3 — THE SEALED PER-CALL ANSWER BOUNDS the debate jobs' calls use,
 * read once at boot for the model picker. The gateway's window wall is the
 * prompt (UTF-8 bytes / 2) PLUS the attempt's `tokenCeiling`, so the picker needs
 * each role's own bound to seat only candidates the gateway will not refuse:
 *  - `judge`: `acceptanceOrganCostBounds.organs.JUDGE` — every debate call
 *    (positions, arguments, exchanges, the panel, reviews) runs under it;
 *  - `synthesizer` / `evaluator`: the synthesis-role rows `synthesizerCallBound`
 *    and `evaluatorCallBound` (W10/3) — the answer writer's and checker's calls.
 * Rows absent at this register version, or without a positive whole bound,
 * refuse by one fixed code. Nothing here restates a sealed value.
 */
const callTokenCeilingSchema = z.object({ tokenCeiling: z.number().int().positive() }).passthrough();
const organTokenCeilingsSchema = z.object({
  kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
  organs: z.object({ JUDGE: callTokenCeilingSchema }).passthrough()
}).passthrough();

export async function readCallTokenCeilings(pool: Pool, registerVersion: number): Promise<{
  readonly judge: number;
  readonly synthesizer: number;
  readonly evaluator: number;
}> {
  const result = await pool.query<{ row_key: string; value_json: unknown }>(
    `SELECT row_key, value_json FROM register.register_row
     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
    [registerVersion, ["acceptanceOrganCostBounds", "synthesizerCallBound", "evaluatorCallBound"]]
  );
  const byKey = new Map(result.rows.map((row) => [row.row_key, row.value_json]));
  return callTokenCeilingsFromValues((rowKey) => byKey.get(rowKey));
}

/**
 * The same three bounds read from row values already in hand (`valueOf(rowKey)`, undefined for no
 * row): the hosted publish command's plan asks them of the rows it is about to seal (paid plans
 * P4-E), as it asks the judge bound (`judgeTokenCeilingFromValue`). Refuses by the same code.
 */
export function callTokenCeilingsFromValues(valueOf: (rowKey: string) => unknown): {
  readonly judge: number;
  readonly synthesizer: number;
  readonly evaluator: number;
} {
  const organs = organTokenCeilingsSchema.safeParse(valueOf("acceptanceOrganCostBounds"));
  const synthesizer = callTokenCeilingSchema.safeParse(valueOf("synthesizerCallBound"));
  const evaluator = callTokenCeilingSchema.safeParse(valueOf("evaluatorCallBound"));
  if (!organs.success || !synthesizer.success || !evaluator.success) {
    throw new TypeError("CALL_TOKEN_CEILINGS_UNRESOLVED");
  }
  return Object.freeze({
    judge: organs.data.organs.JUDGE.tokenCeiling,
    synthesizer: synthesizer.data.tokenCeiling,
    evaluator: evaluator.data.tokenCeiling
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
  loadBillingInvoiceEnvironment,
  loadBillingOperatorEnvironment,
  loadBillingRefundDoneEnvironment,
  loadBillingWithdrawEnvironment,
  loadDeploymentModeSource,
  loadDevelopmentCommandEnvironment,
  loadKeyRotationEnvironment,
  loadLivenessEnvironment,
  loadMigrationEnvironment,
  loadReplaySelfTestEnvironment,
  loadRunnerEnvironment,
  loadServeDisclosureReportEnvironment,
  loadSettlementEnvironment,
  parseApiEnvironment,
  parseBillingInvoiceEnvironment,
  parseBillingOperatorEnvironment,
  parseBillingRefundDoneEnvironment,
  parseBillingWithdrawEnvironment,
  parseKeyRotationEnvironment,
  parseLivenessEnvironment,
  parseMigrationEnvironment,
  parseReplaySelfTestEnvironment,
  parseRunnerEnvironment,
  parseServeDisclosureReportEnvironment,
  parseSettlementEnvironment,
  // P6a (paid plans): the billing group of the API environment, validated late (A22); N8: NETOPIA's group.
  BILLING_ENVIRONMENT_KEYS,
  NETOPIA_ENVIRONMENT_KEYS,
  XMONEY_ENVIRONMENT_KEYS,
  readBillingEnvironmentGroup,
  readNetopiaEnvironmentGroup,
  readXMoneyEnvironmentGroup,
  type BillingEnvironmentGroup,
  type BillingEnvironmentKey,
  type NetopiaEnvironmentGroup,
  type NetopiaEnvironmentKey,
  type XMoneyEnvironmentGroup,
  type XMoneyEnvironmentKey,
  // N21: the check command's reading of the same settings.
  BILLING_CHECK_ENVIRONMENT_KEYS,
  loadBillingCheckEnvironment,
  readBillingCheckEnvironment,
  type BillingCheckEnvironment,
  type BillingCheckEnvironmentKey
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
  costEnvelopeCeilings,
  costEnvelopeBand,
  costEnvelopePolicyFromValue,
  readCostEnvelopePolicy,
  storyEnvelopeCeilings,
  type CostEnvelopeCeilings,
  type CostEnvelopeBand,
  type CostEnvelopeCeilingTerms,
  type CostEnvelopePolicy,
  type CostEnvelopePolicyValue,
  type StoryEnvelopeCeilings,
  type StoryEnvelopeCeilingTerms
} from "./cost-envelope-policy.js";
// Paid plans G2: which countries may sign up and pay (optional row: absent = no country gate).
export {
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  COUNTRY_POLICY_ROW_KEY,
  countryPolicyFromValue,
  countryRule,
  readCountryPolicy,
  type CountryPolicy,
  type CountryPolicyValue,
  type CountryReason,
  type CountryRule
} from "./country-policy.js";
// Paid plans (spec 2026-09-29 §2.5.1): the plans row and the billing switch.
export {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  BILLING_PLANS_ROW_KEY,
  PLAN_IDS,
  billingPlansFromValue,
  planById,
  planCapMicros,
  readBillingPlans,
  type BillingPlan,
  type BillingPlans,
  type FreeFixedGauges,
  type PlanId
} from "./billing-plans.js";
export {
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW,
  BILLING_POLICY_ROW_KEY,
  assertBillingReady,
  billingPolicyFromValue,
  readBillingPolicy,
  type BillingPolicy,
  type BillingReadinessEnvelope
} from "./billing-policy.js";
// Paid plans P16a: where and when each tax is paid, as data (spec 2026-09-29 §2.5.9).
export {
  TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW,
  TAX_AUTHORITIES_ROW_KEY,
  readTaxAuthorities,
  taxAuthoritiesFromValue,
  taxAuthorityFor,
  type TaxAuthorities,
  type TaxAuthoritiesValue,
  type TaxAuthorityEntry,
  type TaxAuthorityRegistration,
  type TaxAuthorityStatus,
  type TaxDueRule
} from "./tax-authorities.js";
// hate-speech S02: the pre-publish check's deadline, a code-owned row a hosted file may supersede (owner, 2026-10-04).
export {
  PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW,
  PUBLICATION_CHECK_POLICY_ROW_KEY,
  publicationCheckPolicyFromValue,
  readPublicationCheckPolicy,
  type PublicationCheckPolicy,
  type PublicationCheckPolicyValue
} from "./publication-check-policy.js";
// Verdict story (spec 2026-09-26 §9): the OPTIONAL story rows and their readers.
export {
  STORY_COST_RULING_REF,
  STORY_ROW_KEYS,
  STORY_SPEC_RULING_REF,
  buildStoryRegisterRows,
  readStoryPolicy,
  readStoryPolicyFromRegister,
  type StoryPolicy,
  type StoryRegisterRow,
  type StoryRegisterRowsInput
} from "./story-policy.js";
// A19: the optional model scorecard (absent -> the plan rosters choose the models).
export {
  BUNDLED_MODEL_SCORECARD_SOURCE_REF,
  BUNDLED_MODEL_SCORECARD_URL,
  MODEL_SCORECARD_MAX_BYTES,
  MODEL_SCORECARD_ROW_KEY,
  modelScorecardFromValue,
  readBundledModelScorecard,
  readEngineVersion,
  readModelScorecard,
  type ModelScorecardReadResult,
  type ModelScorecardRefusalReason
} from "./model-scorecard-policy.js";
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
  assertAskRoomAdmissionSealed,
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
