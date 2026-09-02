import type { Pool } from "pg";
import { z } from "zod";
import {
  readClaimTypeCompositionMap,
  readPanelWeightingControls,
  readVerdictLabelControls,
  type CompositionMapRegisterRow
} from "@debateai/register";
import type { JudgementSelectionRule } from "@debateai/judgement";
import type { BandCeilingRegisterRow, CompositionBudgetResolution } from "@debateai/serve";
import type {
  RunDeathPolicy,
  RunnerPanelPolicy,
  RunnerVerdictLabelPolicy,
  ScoringOperatorRegisterInput
} from "./index.js";
import {
  DEVELOPMENT_ALGORITHM_SOURCE_REF,
  DEVELOPMENT_RUNNER_SOURCE_REF,
  DEVELOPMENT_SOURCE_REF
} from "./dev-deployment-register.js";

const costBoundSchema = z.object({
  maxAttempts: z.number().int().positive(),
  tokenCeiling: z.number().int().positive(),
  deadlineMs: z.number().int().positive()
}).strict();

const runnerRowsSchema = z.object({
  acceptanceOrganCostBounds: z.object({
    kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
    organs: z.object({
      JUDGE: costBoundSchema,
      COMPOSER: costBoundSchema,
      CONFORMANCE: costBoundSchema
    }).strict()
  }).strict(),
  runDeathPolicy: z.object({
    kind: z.literal("RUN_DEATH_POLICY"),
    cooldown_ms: z.number().int().positive(),
    final_retry_attempts: z.number().int().positive(),
    max_cooldown_holds_per_run: z.number().int().positive(),
    applies_to: z.literal("TRANSPORT_EXHAUSTION")
  }).strict(),
  hiddenNodeScoreThreshold: z.number().min(0).max(1),
  compositionBundleBudget: z.object({
    low: z.number().int().positive(),
    medium: z.number().int().positive(),
    high: z.number().int().positive()
  }).strict(),
  candidateConfidenceBand: z.string().trim().min(1),
  wayOfKnowingCeiling: z.object({
    bandOrder: z.array(z.string().trim().min(1)).min(1),
    ceilingLabels: z.array(z.string().trim().min(1)).min(1),
    defaultCeiling: z.object({
      label: z.string().trim().min(1),
      ceilingBand: z.string().trim().min(1),
      liftPath: z.string().trim().min(1)
    }).strict(),
    cuts: z.array(z.object({
      minimumShares: z.partialRecord(
        z.enum(["LOOKED_UP", "RAN", "REASONING"]),
        z.number().min(0).max(1)
      ),
      label: z.string().trim().min(1),
      ceilingBand: z.string().trim().min(1),
      liftPath: z.string().trim().min(1)
    }).strict())
  }).strict(),
  judgementSelectionPolicy: z.object({
    kind: z.literal("MAXIMIZE_WEIGHTED_TAU"),
    earnedWeight: z.number().positive(),
    judgeWeightVersion: z.string().trim().min(1),
    reducerVersion: z.string().trim().min(1)
  }).strict(),
  scoringOperator: z.literal("accumulate"),
  judgeContractHash: z.string().regex(/^[a-f0-9]{64}$/u),
  composerContractHash: z.string().regex(/^[a-f0-9]{64}$/u),
  conformanceContractHash: z.string().regex(/^[a-f0-9]{64}$/u),
  propagationContractHash: z.string().regex(/^[a-f0-9]{64}$/u),
  serveContractHash: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export interface DevelopmentRunnerPolicy {
  readonly compositionRow: CompositionMapRegisterRow;
  readonly bounds: z.infer<typeof runnerRowsSchema>["acceptanceOrganCostBounds"]["organs"];
  readonly compositionBudgets: Readonly<Record<"low" | "medium" | "high", CompositionBudgetResolution>>;
  readonly candidateConfidenceBand: string;
  readonly bandCeiling: BandCeilingRegisterRow;
  readonly judgementPolicy: {
    readonly selectionRule: JudgementSelectionRule;
    readonly earnedWeight: number;
    readonly judgeWeightVersion: string;
    readonly reducerVersion: string;
  };
  readonly scoringOperator: ScoringOperatorRegisterInput;
  readonly runDeathPolicy: RunDeathPolicy;
  readonly hiddenNodeScoreThreshold: { readonly value: number; readonly sourceRef: string };
  /**
   * S6-1 / T11: the sealed T16 verdict-label family. Read through T16's OWN
   * reader (`readVerdictLabelControls`), which fails loudly and names the
   * missing rows — this file restates neither a value nor a schema. Every
   * served answer carries a code-derived label, so this member is mandatory:
   * a deployment that seals the family but never hands it to the runner is the
   * defect codex r1 B1 names, and it is indistinguishable at the serve seam
   * from a deployment that never sealed it at all.
   */
  readonly verdictLabelPolicy: RunnerVerdictLabelPolicy;
  /**
   * S2-2 / T3 (F33): the sealed T16 PANEL family, read through T16's own readers.
   * J12 gates every multi-maker run on this at claim time, so a deployment that
   * seals the rows and never hands them to the runner cannot run a panel at all —
   * it refuses each multi-maker work item on a register that is, in fact, correct.
   * The disagreement threshold lives in the VERDICT-LABEL family and is paired in
   * here exactly as the acceptance composition pairs it; nothing is restated.
   */
  readonly panelPolicy: RunnerPanelPolicy;
  readonly hashes: Readonly<Record<"judge" | "composer" | "conformance" | "propagation" | "serve", string>>;
}

export async function readDevelopmentRunnerPolicy(
  pool: Pool,
  registerVersion: number
): Promise<DevelopmentRunnerPolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("DEV_RUNNER_REGISTER_VERSION_INVALID");
  }
  const keys = Object.keys(runnerRowsSchema.shape);
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key,value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
    [registerVersion, keys]
  );
  if (result.rows.length !== keys.length) throw new TypeError("DEV_RUNNER_POLICY_UNRESOLVED");
  if (result.rows.some((row) => row.source_ref !== (
    row.row_key === "acceptanceOrganCostBounds" || row.row_key === "runDeathPolicy"
      ? DEVELOPMENT_SOURCE_REF
      : DEVELOPMENT_RUNNER_SOURCE_REF
  ))) {
    throw new TypeError("DEV_RUNNER_POLICY_PROVENANCE_INVALID");
  }
  const parsed = runnerRowsSchema.parse(Object.fromEntries(
    result.rows.map((row) => [row.row_key, row.value_json])
  ));
  const compositionRow = await readClaimTypeCompositionMap(pool, registerVersion);
  if (compositionRow.sourceRef !== DEVELOPMENT_RUNNER_SOURCE_REF) {
    throw new TypeError("DEV_RUNNER_POLICY_PROVENANCE_INVALID");
  }
  // T16's reader owns the schema, the loud missing-row failure and the version;
  // this caller only pins the deployment the rows must have been sealed BY, so
  // a row seeded by another deployment cannot drift in under the same version.
  const verdictLabels = await readVerdictLabelControls(pool, registerVersion);
  const panelWeighting = await readPanelWeightingControls(pool, registerVersion);
  if ([...Object.values(verdictLabels.sourceRefs), ...Object.values(panelWeighting.sourceRefs)].some(
    (sourceRef) => !sourceRef.startsWith(DEVELOPMENT_ALGORITHM_SOURCE_REF)
  )) {
    throw new TypeError("DEV_RUNNER_POLICY_PROVENANCE_INVALID");
  }
  const compositionBudgets = Object.freeze(Object.fromEntries(
    Object.entries(parsed.compositionBundleBudget).map(([tier, bound]) => [tier, Object.freeze({
      tier: tier as "low" | "medium" | "high",
      bound,
      registerRowKey: "compositionBundleBudget",
      registerVersion,
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    })])
  ) as Record<"low" | "medium" | "high", CompositionBudgetResolution>);
  return Object.freeze({
    compositionRow,
    bounds: parsed.acceptanceOrganCostBounds.organs,
    compositionBudgets,
    candidateConfidenceBand: parsed.candidateConfidenceBand,
    bandCeiling: Object.freeze({
      rowKey: "wayOfKnowingCeiling",
      registerVersion,
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF,
      value: parsed.wayOfKnowingCeiling
    }),
    judgementPolicy: Object.freeze({
      selectionRule: Object.freeze({
        kind: parsed.judgementSelectionPolicy.kind,
        rowKey: "judgementSelectionPolicy",
        registerVersion,
        sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
      }),
      earnedWeight: parsed.judgementSelectionPolicy.earnedWeight,
      judgeWeightVersion: parsed.judgementSelectionPolicy.judgeWeightVersion,
      reducerVersion: parsed.judgementSelectionPolicy.reducerVersion
    }),
    scoringOperator: Object.freeze({
      deploymentRowValue: parsed.scoringOperator,
      registerRef: `scoringOperator@${registerVersion}:${DEVELOPMENT_RUNNER_SOURCE_REF}`
    }),
    runDeathPolicy: Object.freeze({
      cooldownMs: parsed.runDeathPolicy.cooldown_ms,
      finalRetryAttempts: parsed.runDeathPolicy.final_retry_attempts,
      maxCooldownHoldsPerRun: parsed.runDeathPolicy.max_cooldown_holds_per_run
    }),
    hiddenNodeScoreThreshold: Object.freeze({
      value: parsed.hiddenNodeScoreThreshold,
      sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF
    }),
    panelPolicy: Object.freeze({
      registerVersion: panelWeighting.registerVersion,
      dispersionScale: panelWeighting.dispersionScale,
      repeatedFamilyMultiplier: panelWeighting.repeatedFamilyMultiplier,
      // The threshold is the verdict-label family's row, paired here the same way
      // the acceptance composition pairs it — one identifier, never a restatement.
      disagreementThreshold: verdictLabels.disagreementThreshold,
      oneStepDown: panelWeighting.oneStepDown,
      providerFamilies: panelWeighting.providerFamilies,
      unmappedReason: panelWeighting.unmappedReason,
      sourceRefs: Object.freeze({ ...verdictLabels.sourceRefs, ...panelWeighting.sourceRefs })
    }),
    verdictLabelPolicy: Object.freeze({
      registerVersion: verdictLabels.registerVersion,
      gamma: verdictLabels.gamma,
      highCut: verdictLabels.highCut,
      lowCut: verdictLabels.lowCut,
      disagreementThreshold: verdictLabels.disagreementThreshold,
      sourceRefs: verdictLabels.sourceRefs
    }),
    hashes: Object.freeze({
      judge: parsed.judgeContractHash,
      composer: parsed.composerContractHash,
      conformance: parsed.conformanceContractHash,
      propagation: parsed.propagationContractHash,
      serve: parsed.serveContractHash
    })
  });
}
