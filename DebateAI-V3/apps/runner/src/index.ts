import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import {
  RunRepository,
  assertNoOpenWriteTransaction,
  type CompletionActivationResolution
} from "@debateai/db";
import {
  WorkItemRepository,
  assertClaimCoversCall,
  type TerminalCompletionDeclaration
} from "@debateai/battery";
import { GraphRepository } from "@debateai/graph";
import {
  Judge,
  JudgementRepository,
  createUnmeasuredDisagreement,
  reduceAssessment,
  selectReducedJudgement,
  type CompositionMapRegisterRow,
  type JudgementSelectionRule
} from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { resolveScoringOperator } from "@debateai/register";
import {
  BudgetRepository,
  BATTERY_BUDGET_CONTRACTS,
  parseCostEnvelopeBasis,
  type BudgetPressureDecision
} from "@debateai/budget";
import { evaluate, type EvaluationSnapshot } from "@debateai/propagation";
import {
  ValuationRepository,
  buildValueOverlay,
  serveMixedAnswer,
  type CriterionCandidate,
  type MixedValueAnswer,
  type OptionVector,
  type WeightSource
} from "@debateai/valuation";
import {
  OpenAICompatibleProviderGateway,
  type CallBound,
  type OpenAICompatibleGatewayOptions,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  buildFactBundle,
  compositionEvidenceRequired,
  createEnvelopeExhaustedResult,
  deriveBandCeiling,
  runServeGateChain,
  ServeRepository,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type CompositionBudgetResolution,
  type ConditionMarkRecord,
  type FactBundle
} from "@debateai/serve";
import { TypedDomainError, type CompositionBudgetTier, type WayOfKnowing } from "@debateai/kernel";
import { MemoryRepository, renderMemorySentence, validateMemorySentence } from "@debateai/memory";
import type { Hatchet, TaskWorkflowDeclaration } from "@hatchet-dev/typescript-sdk";

const compositionSchema = z.object({
  segments: z.array(z.object({
    segment_id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    node_refs: z.array(z.string().trim().min(1)),
    served_number_refs: z.array(z.string().trim().min(1))
  }).strict()).min(1)
}).strict();
const conformanceSchema = z.object({ conforms: z.boolean(), findings: z.array(z.string()) }).strict();
const r9Schema = z.object({ pass: z.boolean() }).strict();

/**
 * FAIR-01 (DR-140(b)): the SECOND real maker's leg. When configured, the
 * critic maker judges the strongest genuine counter-position through the same
 * ruled JUDGE organ, and the counter joins the answer graph as a first-class
 * defeater node with an attack edge — a rival judgement whose independence is
 * carried by recorded per-artifact maker lineage. Deliberately NOT the S08
 * CROSS critique-packet instrument: DR-141(4) rules that a run carrying
 * critique packets REFUSES at terminal (Q42 `critic_agrees` has no recorded
 * shape) until V rules the recording migration. When absent, the runner stays
 * honestly single-node (DR-137 mono-model runs remain lawful; DR-143 clause 1
 * keeps the >1-maker law run-level, enforced on the acceptance debate).
 */
export interface RunnerCritiqueSettings {
  readonly provider: ProviderGateway;
  readonly providerRef: string;
}

/**
 * P8/DR-074: the raw deployment `scoringOperator` register row, resolved
 * through the SHIPPED chain (resolveScoringOperator) at the point of use. The
 * VALUE is V's at DR-023 — a missing row is a typed loud stop, never a
 * literal (AC-76/DR-039).
 */
export interface ScoringOperatorRegisterInput {
  readonly deploymentRowValue: unknown;
  readonly registerRef: string;
}

export interface WalkingSkeletonSettings {
  readonly workerId: string;
  readonly claimMs: number;
  readonly claimMarginMs: number;
  readonly judgeBound: CallBound;
  readonly composerBound: CallBound;
  readonly conformanceBound: CallBound;
  readonly providerRef: string;
  readonly judgeContractHash: string;
  readonly composerContractHash: string;
  readonly conformanceContractHash: string;
  readonly propagationContractHash: string;
  readonly serveContractHash: string;
  readonly maxRecompose: number;
  readonly factBundleVersion: number;
  readonly judgementNumberKind: string;
  readonly judgementProducer: string;
  readonly propagationNumberKind: string;
  readonly propagationProducer: string;
  readonly compositionRow?: CompositionMapRegisterRow;
  readonly servePolicy?: {
    readonly compositionBudgets: Readonly<Record<CompositionBudgetTier, CompositionBudgetResolution>>;
    readonly candidateConfidenceBand: string;
    readonly bandCeiling: BandCeilingRegisterRow;
  };
  readonly judgementPolicy?: {
    readonly selectionRule: JudgementSelectionRule;
    readonly earnedWeight: number;
    readonly judgeWeightVersion: string;
    readonly reducerVersion: string;
  };
  readonly critique?: RunnerCritiqueSettings;
  readonly scoringOperator?: ScoringOperatorRegisterInput;
  readonly resolveTerminalActivations?: (input: {
    readonly runId: string;
    readonly waitingRows: readonly string[];
    /** The runner's own declaration of the terminal boundary being drained
     * (TERM-01/DR-139): this completion persists an answer record in the same
     * sequence. It is the same authority that supplies runId and waitingRows. */
    readonly completion: TerminalCompletionDeclaration;
  }) => Promise<readonly (CompletionActivationResolution & {
    /** Recorded execution of the row's scoped check, when one exists.
     * ACTIVE with no recorded execution is the DR-139(4) owed-check case. */
    readonly executedCheckRef?: string | null;
    /** DR-141(2): the row's evaluation consulted the DR-021 knob-10
     * question-type fallback; the travelling label rides the answer. */
    readonly typeFallbackConsulted?: boolean;
  })[]>;
}

export interface ValueOverlayExecutionInput {
  readonly runId: string;
  readonly propagationRunId: string;
  readonly criterionCandidates: readonly CriterionCandidate[];
  readonly actualEvidenceRefs: readonly string[];
  readonly options: readonly OptionVector[];
  readonly weightSource: WeightSource;
  readonly findingFacts: readonly string[];
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseContent<T>(content: string, schema: z.ZodType<T>, code: string): T {
  try {
    return schema.parse(JSON.parse(content));
  } catch (error) {
    throw new TypedDomainError(code, error instanceof Error ? error.message : String(error));
  }
}

export class WalkingSkeletonRunner {
  readonly #runs: RunRepository;
  readonly #work: WorkItemRepository;
  readonly #graph: GraphRepository;
  readonly #judge: Judge;
  readonly #judgements: JudgementRepository;
  readonly #ledger: LedgerRepository;
  readonly #budget: BudgetRepository;
  readonly #serve: ServeRepository;
  readonly #valuation: ValuationRepository;
  readonly #memory: MemoryRepository;
  readonly #criticJudge: Judge | null;

  constructor(
    pool: Pool,
    private readonly provider: ProviderGateway,
    private readonly settings: WalkingSkeletonSettings
  ) {
    this.#runs = new RunRepository(pool);
    this.#work = new WorkItemRepository(pool);
    this.#graph = new GraphRepository(pool);
    this.#judge = new Judge(provider);
    this.#judgements = new JudgementRepository(pool);
    this.#ledger = new LedgerRepository(pool);
    this.#budget = new BudgetRepository(pool);
    this.#serve = new ServeRepository(pool);
    this.#valuation = new ValuationRepository(pool);
    this.#memory = new MemoryRepository(pool);
    // FAIR-01: the critic is the SAME shipped Judge organ over the second
    // maker's gateway — genuinely independent lineage, no new organ minted.
    this.#criticJudge = settings.critique === undefined ? null : new Judge(settings.critique.provider);
  }

  async executeNext(): Promise<RunnerExecutionResult> {
    return this.execute();
  }

  async executeWorkItem(workItemId: string): Promise<RunnerExecutionResult> {
    return this.execute(workItemId);
  }

  async executeValueOverlay(input: ValueOverlayExecutionInput): Promise<MixedValueAnswer> {
    const frozen = await this.#valuation.readFrozenPropagation(input.propagationRunId);
    if (frozen.runId !== input.runId) {
      throw new TypedDomainError(
        "OVERLAY_RUN_MISMATCH",
        "A value overlay may only project over a propagation receipt from the same run"
      );
    }
    const materialised = await this.#graph.materialiseSnapshot(input.runId);
    const snapshot: EvaluationSnapshot = Object.freeze({
      ...materialised,
      // P13: recomputation consumes the recorded order and structural receipts;
      // it never asks graph materialisation to derive an order a second time.
      arrowOrder: frozen.arrowOrder,
      operatorResolutions: frozen.operatorResolutions as EvaluationSnapshot["operatorResolutions"],
      clusterRecords: frozen.clusterRecords
    });
    const overlay = buildValueOverlay({
      snapshot,
      recordedStrengths: frozen.strengths,
      criterionCandidates: input.criterionCandidates,
      actualEvidenceRefs: input.actualEvidenceRefs,
      options: input.options,
      weightSource: input.weightSource
    });
    await this.#valuation.recordOverlay({
      runId: input.runId,
      propagationRunId: input.propagationRunId,
      overlay
    });
    return serveMixedAnswer({
      phase: "VALUE",
      empiricalSettlementRef: input.propagationRunId,
      findingFacts: input.findingFacts,
      overlay
    });
  }

  private async execute(workItemId?: string): Promise<RunnerExecutionResult> {
    const longestDeadline = Math.max(
      this.settings.judgeBound.deadlineMs,
      this.settings.composerBound.deadlineMs,
      this.settings.conformanceBound.deadlineMs
    );
    assertClaimCoversCall({
      claimMs: this.settings.claimMs,
      deadlineMs: longestDeadline,
      marginMs: this.settings.claimMarginMs
    });
    const compositionRow = this.settings.compositionRow;
    if (compositionRow === undefined) {
      throw new TypedDomainError(
        "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
        "S04 requires the V-ratified claim-type composition register row"
      );
    }
    const judgementPolicy = this.settings.judgementPolicy;
    if (judgementPolicy === undefined) {
      throw new TypedDomainError(
        "JUDGEMENT_POLICY_UNRESOLVED",
        "S04 requires V-ratified composition and judgement-selection register rows"
      );
    }
    const servePolicy = this.settings.servePolicy;
    if (servePolicy === undefined) {
      throw new TypedDomainError(
        "SERVE_POLICY_UNRESOLVED",
        "S05 requires V-ratified composition-budget and band-ceiling register rows"
      );
    }
    const critiqueSettings = this.settings.critique;
    if (critiqueSettings !== undefined && this.settings.scoringOperator === undefined) {
      // FAIR-01 × DR-074: the critique leg always yields an attack arrow, and
      // an arrow-bearing graph cannot propagate without the mandatory
      // deployment scoringOperator row. The value is V's at DR-023 — stop
      // loudly BEFORE any claim or model call, never invent it (AC-76/DR-039).
      throw new TypedDomainError(
        "SCORING_OPERATOR_UNRESOLVED",
        "DR-074: the mandatory deployment scoringOperator register row is unruled; its value is V's at DR-023 and is never invented (AC-76/DR-039)"
      );
    }
    const claimInput = { workerId: this.settings.workerId, claimSeconds: this.settings.claimMs / 1_000 };
    const claimed = workItemId === undefined
      ? await this.#work.claimNext(claimInput)
      : await this.#work.claimById({ ...claimInput, workItemId });
    if (claimed === null) return { kind: "NO_WORK" };
    if (claimed.runId === null) throw new TypedDomainError("WORK_ITEM_WITHOUT_RUN", claimed.workItemId);
    const runnerAttemptId = randomUUID();
    const run = await this.#runs.readFrozenHead(claimed.runId);

    const completable = await this.#ledger.findSuccessfulCommandArtifact({
      runId: run.runId,
      workItemId: claimed.workItemId
    });
    if (completable !== null) {
      await this.#work.settle({ workItemId: claimed.workItemId, ...completable });
      return { kind: "COMPLETED", answerId: completable.artifactRef };
    }
    for (const callSite of [
      { contractHash: this.settings.judgeContractHash, maxAttempts: this.settings.judgeBound.maxAttempts },
      { contractHash: this.settings.composerContractHash, maxAttempts: this.settings.composerBound.maxAttempts },
      { contractHash: this.settings.conformanceContractHash, maxAttempts: this.settings.conformanceBound.maxAttempts }
    ]) {
      const exhausted = await this.#ledger.findExhaustedModelAttempt({
        runId: run.runId,
        workItemId: claimed.workItemId,
        ...callSite
      });
      if (exhausted !== null) {
        await this.#work.failFromExhaustedAttempt({ workItemId: claimed.workItemId, ...exhausted });
        return { kind: "TERMINAL_FAILED", artifactRef: exhausted.artifactRef };
      }
    }

    const judgementScheduledAt = new Date();
    await this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "JUDGEMENT_SCHEDULED",
      subjectItemId: claimed.workItemId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: this.settings.workerId,
      inputHash: hash({ questionLine: run.questionLine, workItemId: claimed.workItemId }),
      contractHash: this.settings.judgeContractHash,
      startedAt: judgementScheduledAt,
      finishedAt: new Date()
    });
    const judged = await this.#judge.judge({
      runId: run.runId,
      subjectItemId: claimed.workItemId,
      callSiteKey: "JUDGE",
      questionLine: run.questionLine,
      providerRef: this.settings.providerRef,
      contractHash: this.settings.judgeContractHash,
      bound: this.settings.judgeBound
    });
    const reduced = reduceAssessment({
      claimType: judged.normalizedClaim.claimType,
      assessment: judged.assessment,
      compositionRow,
      reducerVersion: judgementPolicy.reducerVersion
    });
    if (reduced.kind !== "REDUCED") {
      throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${reduced.claimType}`);
    }
    const selection = selectReducedJudgement([{
      judgementRef: judged.provenanceRef,
      tau: reduced.tau,
      effectiveWeight: judgementPolicy.earnedWeight
    }], judgementPolicy.selectionRule);
    if (selection.kind !== "SELECTED") {
      throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no selectable judgement");
    }
    const nodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
      const created = await writer.addNode({
        runId: run.runId,
        statementText: judged.statement,
        claimType: judged.normalizedClaim.claimType,
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        provenanceRef: judged.provenanceRef,
        wayOfKnowing: judged.wayOfKnowing,
        locator: judged.locator,
        valueLaden: judged.valueLaden
      });
      await writer.addStrangerRestatement({
        nodeId: created,
        text: judged.restatementText,
        checkStatus: judged.restatementStatus
      });
      return created;
    });
    const reducedJudgementId = await this.#judgements.recordReduced({
      runId: run.runId,
      nodeId,
      rawArtifactRef: judged.provenanceRef,
      tau: selection.tau,
      numberKind: this.settings.judgementNumberKind,
      producer: this.settings.judgementProducer,
      wayOfKnowing: judged.wayOfKnowing,
      uncertaintyLadderPosition: reduced.uncertaintyLadderPosition,
      uncertaintyDrivers: reduced.drivers,
      scoreCaps: reduced.caps,
      holes: reduced.holes,
      branchIdentifier: reduced.branch,
      reducerVersion: reduced.reducerVersion,
      judgeWeightVersion: judgementPolicy.judgeWeightVersion,
      selectedJudgementRef: selection.selectedJudgementRef,
      dispersion: null,
      panelContractHashes: [this.settings.judgeContractHash],
      disagreement: createUnmeasuredDisagreement()
    });

    // FAIR-01 (DR-140(b)): the SECOND maker's leg. The critic maker judges the
    // strongest genuine counter-position through the SAME ruled JUDGE organ
    // (same contract text, same ruled JUDGE cost bound), and the counter joins
    // the graph as a first-class defeater node with a real attack edge — one
    // maker per artifact, honest lineage, nothing fabricated (DR-115). The
    // counter prompt carries only the position's STATEMENT TEXT — no maker,
    // model or provider identity — so the rival judgement is blind to who
    // produced the position. The S08 critique-packet instrument is
    // deliberately NOT recorded here: DR-141(4) rules that a run carrying
    // critique packets REFUSES at terminal (Q42 `critic_agrees`,
    // packages/battery/src/terminal.ts Q42 evaluator) until V rules the
    // agreement-verdict recording migration.
    let counterLeg: {
      readonly nodeId: string;
      readonly provenanceRef: string;
      readonly reducedJudgementId: string;
      readonly wayOfKnowing: WayOfKnowing;
    } | null = null;
    const criticJudge = this.#criticJudge;
    if (critiqueSettings !== undefined && criticJudge !== null) {
      const counterQuestionLine = [
        "A fair debate requires the strongest genuine counter-position, judged on its own merits.",
        `Question under debate: ${run.questionLine}`,
        `Position under critique: ${judged.statement}`,
        "State and defend the strongest genuine counter-position to that position."
      ].join("\n");
      await this.#ledger.append({
        runId: run.runId,
        attemptId: runnerAttemptId,
        actionKind: "JUDGEMENT_SCHEDULED",
        subjectItemId: claimed.workItemId,
        stanceAtAction: "UNASSIGNED",
        outcome: "OK",
        actorRef: this.settings.workerId,
        inputHash: hash({ questionLine: counterQuestionLine, workItemId: claimed.workItemId }),
        contractHash: this.settings.judgeContractHash,
        startedAt: new Date(),
        finishedAt: new Date()
      });
      const counterJudged = await criticJudge.judge({
        runId: run.runId,
        subjectItemId: claimed.workItemId,
        callSiteKey: "JUDGE:critic",
        questionLine: counterQuestionLine,
        // One debate, one claim frame: the counter is classified on the
        // debate's own question line, not on the position's wording.
        claimClassificationLine: run.questionLine,
        providerRef: critiqueSettings.providerRef,
        contractHash: this.settings.judgeContractHash,
        bound: this.settings.judgeBound
      });
      const counterReduced = reduceAssessment({
        claimType: counterJudged.normalizedClaim.claimType,
        assessment: counterJudged.assessment,
        compositionRow,
        reducerVersion: judgementPolicy.reducerVersion
      });
      if (counterReduced.kind !== "REDUCED") {
        throw new TypedDomainError("COMPOSITION_UNRESOLVED", `No ratified composition for ${counterReduced.claimType}`);
      }
      const counterSelection = selectReducedJudgement([{
        judgementRef: counterJudged.provenanceRef,
        tau: counterReduced.tau,
        effectiveWeight: judgementPolicy.earnedWeight
      }], judgementPolicy.selectionRule);
      if (counterSelection.kind !== "SELECTED") {
        throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The critic produced no selectable judgement");
      }
      const counterNodeId = await this.#graph.withGraphWrite(run.runId, async (writer) => {
        const created = await writer.addNode({
          runId: run.runId,
          statementText: counterJudged.statement,
          claimType: counterJudged.normalizedClaim.claimType,
          parentNodeId: nodeId,
          childKind: "defeater",
          siblingOrdinal: 1,
          generationStatus: "complete",
          pathStatus: "active",
          explorationDecision: "challenge",
          provenanceRef: counterJudged.provenanceRef,
          wayOfKnowing: counterJudged.wayOfKnowing,
          locator: counterJudged.locator,
          valueLaden: counterJudged.valueLaden
        });
        await writer.addStrangerRestatement({
          nodeId: created,
          text: counterJudged.restatementText,
          checkStatus: counterJudged.restatementStatus
        });
        // The S07 defeater edge shape: polarity attack, kind rebutting, and a
        // magnitude honestly UNKNOWN — no evidence verifier measured this
        // edge, so no number rides it (AC-76). Provenance = the critic's REAL
        // artifact.
        await writer.addEdge({
          runId: run.runId,
          sourceNodeId: created,
          targetKind: "NODE",
          targetNodeId: nodeId,
          targetEdgeId: null,
          targetEdgePolarity: null,
          polarity: "attack",
          kind: "rebutting",
          strength: null,
          magnitudeStatus: "UNKNOWN",
          strengthSource: "EVIDENCE_VERIFIER",
          provenanceRef: counterJudged.provenanceRef
        });
        return created;
      });
      const counterReducedJudgementId = await this.#judgements.recordReduced({
        runId: run.runId,
        nodeId: counterNodeId,
        rawArtifactRef: counterJudged.provenanceRef,
        tau: counterSelection.tau,
        numberKind: this.settings.judgementNumberKind,
        producer: this.settings.judgementProducer,
        wayOfKnowing: counterJudged.wayOfKnowing,
        uncertaintyLadderPosition: counterReduced.uncertaintyLadderPosition,
        uncertaintyDrivers: counterReduced.drivers,
        scoreCaps: counterReduced.caps,
        holes: counterReduced.holes,
        branchIdentifier: counterReduced.branch,
        reducerVersion: counterReduced.reducerVersion,
        judgeWeightVersion: judgementPolicy.judgeWeightVersion,
        selectedJudgementRef: counterSelection.selectedJudgementRef,
        dispersion: null,
        panelContractHashes: [this.settings.judgeContractHash],
        disagreement: createUnmeasuredDisagreement()
      });
      counterLeg = Object.freeze({
        nodeId: counterNodeId,
        provenanceRef: counterJudged.provenanceRef,
        reducedJudgementId: counterReducedJudgementId,
        wayOfKnowing: counterJudged.wayOfKnowing
      });
    }

    const materialised = await this.#graph.materialiseSnapshot(run.runId);
    // P8 × DR-074: an arrow-bearing graph propagates only under the ruled
    // deployment scoringOperator row, resolved through the SHIPPED chain with
    // the supplying level RECORDED on the receipt. Unruled ⇒ typed loud stop.
    const arrowTargetNodeIds = [...new Set(materialised.arrows.flatMap((arrow) =>
      arrow.targetKind === "NODE" && arrow.targetNodeId !== null ? [arrow.targetNodeId] : []
    ))];
    let snapshot: EvaluationSnapshot = materialised;
    if (arrowTargetNodeIds.length > 0) {
      const scoringRegisterRow = this.settings.scoringOperator;
      if (scoringRegisterRow === undefined) {
        throw new TypedDomainError(
          "SCORING_OPERATOR_UNRESOLVED",
          "DR-074: the mandatory deployment scoringOperator register row is unruled; its value is V's at DR-023 and is never invented (AC-76/DR-039)"
        );
      }
      const resolvedOperator = resolveScoringOperator({
        parent: {},
        run: {},
        deployment: { scoringOperator: scoringRegisterRow.deploymentRowValue }
      });
      snapshot = Object.freeze({
        ...materialised,
        operatorResolutions: Object.freeze(arrowTargetNodeIds.map((parentNodeId) => Object.freeze({
          parentNodeId,
          operator: resolvedOperator.value,
          suppliedBy: resolvedOperator.suppliedBy
        })))
      });
    }
    const propagationStartedAt = new Date();
    const propagation = evaluate(snapshot);
    const replayHandle = `replay:${run.runId}:${nodeId}`;
    const propagationRunId = await this.#ledger.recordPropagation({
      runId: run.runId,
      inputHash: hash(snapshot),
      contractHash: this.settings.propagationContractHash,
      graphFingerprint: hash(propagation.graphFingerprintMaterial),
      arrowOrder: propagation.arrowOrder,
      clusterRecords: propagation.clusterRecords,
      operatorResolutions: propagation.operatorResolutions,
      transmissionReductions: propagation.transmissionReductions,
      liftRecords: propagation.liftRecords,
      judgementSelectionRule: {
        ...selection.rule,
        selectedJudgementRef: selection.selectedJudgementRef,
        selectionScore: selection.selectionScore
      },
      sensitivityRecords: propagation.sensitivityRecords,
      // FAIR-01/DR-115: every strength record cites ITS OWN node's judgement,
      // artifact and way of knowing — the position's lineage is never stamped
      // onto the counter's number. An unmapped node is a typed loud stop.
      strengths: propagation.strengths.map((strength) => {
        const lineage = strength.nodeId === nodeId
          ? {
              reducedJudgementRef: reducedJudgementId,
              sourceRef: judged.provenanceRef,
              replayHandle,
              wayOfKnowing: judged.wayOfKnowing
            }
          : counterLeg !== null && strength.nodeId === counterLeg.nodeId
            ? {
                reducedJudgementRef: counterLeg.reducedJudgementId,
                sourceRef: counterLeg.provenanceRef,
                replayHandle: `replay:${run.runId}:${counterLeg.nodeId}`,
                wayOfKnowing: counterLeg.wayOfKnowing
              }
            : null;
        if (lineage === null) {
          throw new TypedDomainError("STRENGTH_LINEAGE_UNRESOLVED", strength.nodeId);
        }
        return {
          ...strength,
          reducedJudgementRef: lineage.reducedJudgementRef,
          numberKind: this.settings.propagationNumberKind,
          sourceRef: lineage.sourceRef,
          producer: this.settings.propagationProducer,
          replayHandle: lineage.replayHandle,
          wayOfKnowing: lineage.wayOfKnowing
        };
      })
    });
    await this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "PROPAGATION",
      subjectItemId: nodeId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: this.settings.propagationProducer,
      inputHash: hash(snapshot),
      contractHash: this.settings.propagationContractHash,
      rawArtifactRef: judged.provenanceRef,
      startedAt: propagationStartedAt,
      finishedAt: new Date()
    });
    const memoryDisclosure = await this.#memory.readDisclosure(run.runId);
    const factBundle: FactBundle = buildFactBundle({
      facts: Object.freeze([judged.statement]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: Object.freeze([]),
      reversalPoint: judged.assessment.critic.summary,
      buildsOnPrevious: {
        value: memoryDisclosure?.matched === true,
        answerRef: memoryDisclosure?.prior?.answer_id ?? null
      },
      memoryDisclosure
    });
    let finalSegments: readonly ComposedSegment[] = [];
    let compositionRawArtifactRef: string | null = null;
    let compositionAttempt = 0;
    const conformanceRawArtifactRefs: string[] = [];
    let conditionMarkRecords: readonly ConditionMarkRecord[] = [];
    const serveStartedAt = new Date();
    const envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);
    const evaluateEnvelope = (): Promise<BudgetPressureDecision> => this.#budget.evaluateRunPressure({
      runId: run.runId,
      basis: envelopeBasis,
      pendingRows: BATTERY_BUDGET_CONTRACTS
        .filter((row) => row.budgetClass === "ENRICHMENT" || row.skipPolicy === "PROTECTED_CORE_REFUSES_SKIP")
        .map((row) => ({ batteryRowId: row.batteryRowId, affectedNodeIds: [nodeId] })),
      verifiedNodeIds: [nodeId]
    });
    const recordEnvelope = (decision: BudgetPressureDecision): Promise<void> => this.#budget.recordDecision({
      runId: run.runId,
      workItemId: claimed.workItemId,
      attemptId: runnerAttemptId,
      actorRef: "run-cost-envelope",
      contractHash: this.settings.serveContractHash,
      decision
    });
    const makeEnvelopeTerminal = async (
      decision: Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>
    ) => {
      await recordEnvelope(decision);
      finalSegments = [];
      compositionRawArtifactRef = null;
      compositionAttempt = 0;
      conformanceRawArtifactRefs.length = 0;
      conditionMarkRecords = Object.freeze([
        ...decision.enrichmentSkips.map((row): ConditionMarkRecord => Object.freeze({
          mark: row.conditionMark,
          scope: "node",
          subjectRef: row.batteryRowId,
          reason: "ENRICHMENT_ROW_SKIPPED_BY_BUDGET",
          liftPath: null,
          affectedNodeIds: row.affectedNodeIds
        })),
        Object.freeze({
          mark: decision.terminal.conditionMark,
          scope: "answer",
          subjectRef: run.runId,
          reason: "RUN_COST_ENVELOPE_EXHAUSTED",
          liftPath: null,
          affectedNodeIds: decision.terminal.servedNodeIds
        })
      ]);
      return createEnvelopeExhaustedResult({
        factBundle,
        compositionBudget: servePolicy.compositionBudgets[run.compositionBudgetTier],
        verifiedNodeIds: decision.terminal.servedNodeIds,
        skippedEnrichmentRows: decision.enrichmentSkips.map((row) => row.batteryRowId),
        protectedCoreVerified: judged.restatementStatus === "PASS"
      });
    };
    const initialEnvelopeDecision = await evaluateEnvelope();
    let result;
    if (initialEnvelopeDecision.kind === "HARD_STOP" && judged.restatementStatus === "PASS") {
      result = await makeEnvelopeTerminal(initialEnvelopeDecision);
    } else {
      await recordEnvelope(initialEnvelopeDecision);
      try {
        result = await runServeGateChain({
      nodes: [{
        nodeId,
        text: judged.statement,
        wayOfKnowing: judged.wayOfKnowing,
        provenanceRef: judged.provenanceRef,
        locator: judged.locator,
        restatementStatus: judged.restatementStatus,
        loadBearing: true
      }],
      factBundle,
      maxRecompose: this.settings.maxRecompose,
      compositionBudget: servePolicy.compositionBudgets[run.compositionBudgetTier],
      strangerSampleRate: run.strangerSampleRate,
      candidateConfidenceBand: servePolicy.candidateConfidenceBand
    }, {
      measureCompositionBundle: (facts) => Buffer.byteLength(JSON.stringify(facts), "utf8"),
      compose: async (facts, attempt) => {
        const response = await this.provider.call({
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `COMPOSER:${attempt}`,
          role: "COMPOSER",
          lane: "served",
          bound: this.settings.composerBound,
          contractHash: this.settings.composerContractHash,
          providerRef: this.settings.providerRef,
          packet: { messages: [
            // TERM-01 rework 2 (S04 prompt class, composer organ): the system
            // prompt must declare the ruled serve-gate segment contract —
            // including the reasoning-only two-segment form — because the gate
            // is byte-strict and repairs nothing.
            { role: "system", content: "Return only JSON with a segments array of {segment_id,text,node_refs,served_number_refs}. node_refs must name the supplied nodes whose facts the segment asserts. Preserve the fact bundle and add no facts. When the supplied nodes rest on reasoning alone, with no measured or looked-up evidence behind them, return at least two segments in order: the first segment states the provisional answer as a hypothesis; the second segment states the research plan that would lift it." },
            { role: "user", content: JSON.stringify({
              factBundle: facts,
              availableNodes: [{ ref: "primary", nodeId, fact: judged.statement }],
              availableServedNumberRefs: ["number:final-strength"]
            }) }
          ] }
        });
        const parsed = parseContent(response.content, compositionSchema, "COMPOSITION_CONTRACT_ERROR");
        const composedSegments = parsed.segments.map((segment) => {
          if (segment.segment_id === "memory:disclosure") {
            throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "The memory disclosure segment id is reserved for the typed renderer");
          }
          return Object.freeze({
          segmentId: segment.segment_id,
          text: segment.text,
          loadBearing: false,
          assertedNodeRefs: Object.freeze(segment.node_refs.map((ref) => {
            if (ref !== "primary") {
              throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", `Unknown composition node ref ${ref}`);
            }
            return nodeId;
          })),
          servedNumberRefs: Object.freeze([...segment.served_number_refs])
          });
        });
        const renderedMemory = renderMemorySentence(facts.memoryDisclosure);
        validateMemorySentence(facts.memoryDisclosure, renderedMemory);
        finalSegments = Object.freeze(renderedMemory === null ? composedSegments : [
          ...composedSegments,
          Object.freeze({
            segmentId: "memory:disclosure",
            text: renderedMemory,
            loadBearing: false,
            assertedNodeRefs: Object.freeze([]),
            servedNumberRefs: Object.freeze([])
          })
        ]);
        compositionRawArtifactRef = response.rawArtifactRef;
        compositionAttempt = attempt;
        return finalSegments;
      },
      selectSample: (segment, sampleRate) => {
        if (sampleRate <= 0) return false;
        if (sampleRate >= 1) return true;
        const sample = createHash("sha256").update(segment.segmentId).digest().readUInt32BE(0) / 0xffff_ffff;
        return sample < sampleRate;
      },
      conform: async (segment, state) => {
        const segmentIndex = finalSegments.findIndex((candidate) => candidate.segmentId === segment.segmentId);
        const response = await this.provider.call({
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `CONFORMANCE:${compositionAttempt}:${segmentIndex}`,
          role: "CONFORMANCE",
          lane: "served",
          bound: this.settings.conformanceBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: this.settings.providerRef,
          packet: { messages: [
            { role: "system", content: "Return only JSON {conforms,findings}. Judge this segment against the frozen fact bundle." },
            { role: "user", content: JSON.stringify({ factBundle, segment }) }
          ] }
        });
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        const parsed = parseContent(response.content, conformanceSchema, "CONFORMANCE_CONTRACT_ERROR");
        return { segmentId: segment.segmentId, state, conforms: parsed.conforms };
      },
      postComposeR9: async (segments) => {
        const response = await this.provider.call({
          runId: run.runId,
          subjectItemId: claimed.workItemId,
          callSiteKey: `POST_COMPOSE_R9:${compositionAttempt}`,
          role: "CONFORMANCE",
          lane: "served",
          bound: this.settings.conformanceBound,
          contractHash: this.settings.conformanceContractHash,
          providerRef: this.settings.providerRef,
          packet: { messages: [
            { role: "system", content: "Return only JSON {pass}. Apply the R9 stranger-restatement check to the composed verdict." },
            { role: "user", content: JSON.stringify({ question: run.questionLine, segments }) }
          ] }
        });
        conformanceRawArtifactRefs.push(response.rawArtifactRef);
        return parseContent(response.content, r9Schema, "POST_COMPOSE_R9_CONTRACT_ERROR").pass;
      },
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => deriveBandCeiling({
        basis,
        candidateConfidenceBand,
        row: servePolicy.bandCeiling
      })
        });
      } catch (error) {
        if (!(error instanceof TypedDomainError) || error.code !== "RUN_COST_ENVELOPE_EXHAUSTED") throw error;
        const exhausted = await evaluateEnvelope();
        if (exhausted.kind !== "HARD_STOP" || judged.restatementStatus !== "PASS") throw error;
        result = await makeEnvelopeTerminal(exhausted);
      }
      if (!result.conditionMarks.includes("DEFECT") && !result.conditionMarks.includes("ENVELOPE_EXHAUSTED")) {
        const finalEnvelopeDecision = await evaluateEnvelope();
        if (finalEnvelopeDecision.kind === "HARD_STOP" && judged.restatementStatus === "PASS") {
          result = await makeEnvelopeTerminal(finalEnvelopeDecision);
        } else {
          await recordEnvelope(finalEnvelopeDecision);
        }
      }
    }
    // The served number is the POSITION node's final strength — selected by
    // node identity, never by array position (a multi-node graph reorders).
    const strength = propagation.strengths.find((row) => row.nodeId === nodeId);
    if (strength === undefined) throw new TypedDomainError("EMPTY_PROPAGATION", run.runId);
    const terminalEvaluator = this.settings.resolveTerminalActivations;
    if (terminalEvaluator === undefined) {
      throw new TypedDomainError(
        "TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED",
        "Run completion cannot manufacture activation results for outstanding WAIT rows"
      );
    }
    const current = await this.#runs.readCurrentState(run.runId);
    const resolutions = await terminalEvaluator({
      runId: run.runId,
      waitingRows: current.activations.filter((row) => row.state === "WAIT").map((row) => row.batteryRowId),
      completion: Object.freeze({
        kind: "ANSWER_RECORD_PERSIST",
        servedNodeIds: Object.freeze([nodeId]),
        servedNumberPlanned: compositionEvidenceRequired(result)
      })
    });
    await this.#runs.drainWaitsForCompletion(run.runId, resolutions);
    // DR-139(4): every row ACTIVE at terminal whose owed check has no recorded
    // execution rides the served answer as a typed loud condition mark naming
    // that check. Executing owed checks at terminal is the ruled follow-up,
    // out of TERM-01.
    const owedChecks = resolutions.filter(
      (resolution) => resolution.state === "ACTIVE" && (resolution.executedCheckRef ?? null) === null
    );
    if (owedChecks.length > 0) {
      conditionMarkRecords = Object.freeze([
        ...conditionMarkRecords,
        ...owedChecks.map((resolution): ConditionMarkRecord => Object.freeze({
          mark: "OWED-CHECK-UNEXECUTED",
          scope: "answer",
          subjectRef: resolution.batteryRowId,
          reason: `DR-139(4): ${resolution.batteryRowId} is ACTIVE at run completion and its owed check has no recorded execution`,
          liftPath: null,
          affectedNodeIds: [nodeId]
        }))
      ]);
      if (!result.conditionMarks.includes("OWED-CHECK-UNEXECUTED")) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, "OWED-CHECK-UNEXECUTED"]) };
      }
    }
    // DR-141(2): whenever the terminal evaluation consulted the DR-021
    // knob-10 question-type fallback, its travelling label rides the served
    // answer — one named record per consulting battery row.
    const typeFallbackRows = resolutions.filter((resolution) => resolution.typeFallbackConsulted === true);
    if (typeFallbackRows.length > 0) {
      conditionMarkRecords = Object.freeze([
        ...conditionMarkRecords,
        ...typeFallbackRows.map((resolution): ConditionMarkRecord => Object.freeze({
          mark: "UNRESOLVED-TYPE-FALLBACK",
          scope: "answer",
          subjectRef: resolution.batteryRowId,
          reason: `DR-021 knob 10 · DR-141(2): ${resolution.batteryRowId} was evaluated through the factual question-type fallback because no recorded type resolution exists`,
          liftPath: null,
          affectedNodeIds: [nodeId]
        }))
      ]);
      if (!result.conditionMarks.includes("UNRESOLVED-TYPE-FALLBACK")) {
        result = { ...result, conditionMarks: Object.freeze([...result.conditionMarks, "UNRESOLVED-TYPE-FALLBACK"]) };
      }
    }
    const persisted = await this.#serve.persist({
      runId: run.runId,
      workItemId: claimed.workItemId,
      factBundleVersion: this.settings.factBundleVersion,
      factBundleContentHash: hash(factBundle),
      factBundle,
      result,
      segments: finalSegments,
      compositionRawArtifactRef,
      compositionAttempt,
      conformanceRawArtifactRefs,
      conditionMarkRecords,
      servedNumber: compositionEvidenceRequired(result) ? {
        numberRef: "number:final-strength",
        value: strength.strength,
        numberKind: this.settings.propagationNumberKind,
        sourceRef: judged.provenanceRef,
        producer: this.settings.propagationProducer,
        replayHandle,
        propagationRunId
      } : null
    });
    await this.#memory.observeAnswerContradiction(persisted.answerId, "memory:served-verdict-observer");
    await this.#ledger.append({
      runId: run.runId,
      attemptId: runnerAttemptId,
      actionKind: "SERVE",
      subjectItemId: persisted.answerId,
      stanceAtAction: "UNASSIGNED",
      outcome: "OK",
      actorRef: "serve-gate-chain",
      inputHash: hash({ factBundle, propagationRunId }),
      contractHash: this.settings.serveContractHash,
      startedAt: serveStartedAt,
      finishedAt: new Date()
    });
    const wonSettlement = await this.#work.settle({
      workItemId: claimed.workItemId,
      attemptId: runnerAttemptId,
      artifactRef: persisted.answerId
    });
    if (wonSettlement) return { kind: "COMPLETED", answerId: persisted.answerId };
    const winningArtifact = await this.#work.readSettledArtifact(claimed.workItemId);
    if (winningArtifact === null) {
      throw new TypedDomainError("SETTLEMENT_RACE_WITHOUT_WINNER", claimed.workItemId);
    }
    return { kind: "COMPLETED", answerId: winningArtifact };
  }
}

export type RunnerExecutionResult =
  | { readonly kind: "NO_WORK" }
  | { readonly kind: "COMPLETED"; readonly answerId: string }
  | { readonly kind: "TERMINAL_FAILED"; readonly artifactRef: string | null };

export function declareHatchetWalkingSkeletonTask(input: {
  readonly client: Pick<Hatchet, "task">;
  readonly runner: WalkingSkeletonRunner;
  readonly workflowName: string;
  readonly engineRetries: number;
}): TaskWorkflowDeclaration<{ runId: string; workItemId: string }, { kind: string; answerId?: string }> {
  if (!Number.isInteger(input.engineRetries) || input.engineRetries < 0) {
    throw new TypeError("Hatchet retry count must be a non-negative register value");
  }
  return input.client.task({
    name: input.workflowName,
    retries: input.engineRetries,
    fn: async (dispatch: { runId: string; workItemId: string }) => {
      const result = await input.runner.executeWorkItem(dispatch.workItemId);
      return result.kind === "COMPLETED"
        ? { kind: result.kind, answerId: result.answerId }
        : { kind: result.kind };
    }
  });
}

export function createPostgresProviderGateway(
  pool: Pool,
  options: Omit<OpenAICompatibleGatewayOptions, "persistRawArtifact" | "appendLedgerEntry" | "assertNoOpenWriteTransaction">
): ProviderGateway {
  const ledger = new LedgerRepository(pool);
  const budget = new BudgetRepository(pool);
  const http = new OpenAICompatibleProviderGateway({
    ...options,
    assertNoOpenWriteTransaction,
    persistRawArtifact: (artifact) => ledger.appendRawArtifact(artifact),
    appendLedgerEntry: async (entry) => (await ledger.append(entry)).ledgerEntryId
  });
  return {
    async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
      if (request.runId !== null) await budget.assertModelAttemptAllowed(request.runId);
      const consumed = await ledger.countModelAttempts({
        runId: request.runId,
        workItemId: request.subjectItemId,
        contractHash: request.contractHash,
        callSiteKey: request.callSiteKey
      });
      const remaining = request.bound.maxAttempts - consumed;
      if (remaining <= 0) {
        throw new TypedDomainError("CALL_BUDGET_EXHAUSTED", request.subjectItemId);
      }
      return http.call({
        ...request,
        bound: { ...request.bound, maxAttempts: remaining }
      });
    }
  };
}
