import { describe, expect, it } from "vitest";
import {
  projectEvaluatorObservations,
  type EvaluatorHarvestSnapshot
} from "../../packages/evaluator/src/index.js";

const snapshot: EvaluatorHarvestSnapshot = {
  runId: "run:harvest",
  domainId: null,
  observedAt: new Date("2026-08-15T10:00:00.000Z"),
  rawArtifacts: [
    {
      rawArtifactId: "artifact:author",
      attemptId: "attempt:author",
      provider: "openai-compatible-http",
      modelId: "author-model",
      modelVersion: "v1"
    },
    {
      rawArtifactId: "artifact:reviewer",
      attemptId: "attempt:reviewer",
      provider: "openai-compatible-http",
      modelId: "reviewer-model",
      modelVersion: "v2"
    },
    {
      rawArtifactId: "artifact:evaluator",
      attemptId: "attempt:evaluator",
      provider: "openai-compatible-http",
      modelId: "evaluator-model",
      modelVersion: "v3"
    }
  ],
  modelCalls: [
    { rawArtifactRef:"artifact:author",attemptId:"attempt:author",callSiteKey:"runner.author.v1",authenticatedEvaluatorScope:false },
    { rawArtifactRef:"artifact:reviewer",attemptId:"attempt:reviewer",callSiteKey:"runner.review.v1",authenticatedEvaluatorScope:false },
    { rawArtifactRef:"artifact:evaluator",attemptId:"attempt:evaluator",callSiteKey:"evaluator.tag-question.v1",authenticatedEvaluatorScope:true }
  ],
  authoredNodes: [
    {
      nodeId: "node:author",
      rawArtifactRef: "artifact:author",
      generationStatus: "GENERATED",
      pathStatus: "ACTIVE",
      claimType: "CLAIM"
    },
    {
      nodeId: "node:evaluator",
      rawArtifactRef: "artifact:evaluator",
      generationStatus: "GENERATED",
      pathStatus: "ACTIVE",
      claimType: "CLAIM"
    }
  ],
  reviews: [{
    nodeReviewId: "review:1",
    authorRawArtifactRef: "artifact:author",
    reviewRawArtifactRef: "artifact:reviewer",
    outcome: "PASS",
    reasons: ["sound"]
  }],
  judgements: [{
    reducedJudgementId: "judgement:1",
    rawArtifactRef: "artifact:reviewer",
    tau: 0.75,
    numberKind: "PROBABILITY",
    producer: "judge"
  }],
  strengths: [{
    propagationRunId: "propagation:1",
    nodeId: "node:author",
    strength: 0.8,
    numberKind: "PROBABILITY",
    producer: "propagator"
  }],
  settlements: [],
  priorConsensusOutcomes: []
};

describe("deterministic evaluator harvest projector", () => {
  it("projects authoring, judging, and reviewing observations with nullable authoritative domain", () => {
    const rows = projectEvaluatorObservations(snapshot);

    expect(rows.map((row) => row.step).sort()).toEqual([
      "AUTHORING", "AUTHORING", "JUDGING", "REVIEWING"
    ]);
    expect(rows.every((row) => row.domainId === null)).toBe(true);
    expect(rows.every((row) => row.truthBasis === "CONSENSUS")).toBe(true);
  });

  it("excludes only the exact DB-authenticated evaluator artifact reference", () => {
    const rows = projectEvaluatorObservations(snapshot);

    expect(rows.some((row) => row.modelId === "evaluator-model")).toBe(false);
    expect(rows.some((row) => row.sourceRawArtifactRef === "artifact:evaluator")).toBe(false);
  });

  it("preserves a product artifact that collides with an evaluator attempt id", () => {
    const rows = projectEvaluatorObservations({
      ...snapshot,
      rawArtifacts: snapshot.rawArtifacts.map((artifact) => artifact.rawArtifactId === "artifact:author"
        ? { ...artifact, attemptId: "attempt:evaluator" } : artifact)
    });
    expect(rows.some((row) => row.sourceRawArtifactRef === "artifact:author")).toBe(true);
    expect(rows.some((row) => row.sourceRawArtifactRef === "artifact:evaluator")).toBe(false);
  });

  it("uses question_domain input as authoritative instead of pipeline receipts", () => {
    const rows = projectEvaluatorObservations({ ...snapshot, domainId: "domain:authoritative" });

    expect(rows.every((row) => row.domainId === "domain:authoritative")).toBe(true);
  });

  it("marks accepted external outcomes as settlement-fed without manufacturing Q59 rows", () => {
    const rows = projectEvaluatorObservations({
      ...snapshot,
      settlements: [{
        answerOutcomeId: "outcome:1",
        provider: "openai-compatible-http",
        modelId: "author-model",
        modelVersion: "v1",
        resolvedOutcome: true,
        resolvedAt: new Date("2026-08-15T11:00:00.000Z")
      }],
      priorConsensusOutcomes: [{
        observationId: "observation:consensus",
        provider: "openai-compatible-http",
        modelId: "author-model",
        modelVersion: "v1",
        domainId: null,
        metric: "prowess.outcome.v1",
        observedAt: new Date("2026-08-15T09:00:00.000Z")
      }]
    });
    const settlement = rows.find((row) => row.sourceKind === "EXTERNAL_ANSWER_OUTCOME");

    expect(settlement).toMatchObject({
      truthBasis: "SETTLEMENT",
      answerOutcomeId: "outcome:1",
      step: "AUTHORING",
      value: 1,
      supersedesObservationId: "observation:consensus"
    });
  });

  it("uses one consensus row once when multiple settlements target the same model", () => {
    const rows = projectEvaluatorObservations({
      ...snapshot,
      settlements: [
        {
          answerOutcomeId: "outcome:1",
          provider: "openai-compatible-http",
          modelId: "author-model",
          modelVersion: "v1",
          resolvedOutcome: true,
          resolvedAt: new Date("2026-08-15T07:00:00.000Z")
        },
        {
          answerOutcomeId: "outcome:2",
          provider: "openai-compatible-http",
          modelId: "author-model",
          modelVersion: "v1",
          resolvedOutcome: false,
          resolvedAt: new Date("2026-08-15T08:00:00.000Z")
        }
      ],
      priorConsensusOutcomes: [{
        observationId: "observation:consensus",
        provider: "openai-compatible-http",
        modelId: "author-model",
        modelVersion: "v1",
        domainId: null,
        metric: "prowess.outcome.v1",
        observedAt: new Date("2026-08-15T09:00:00.000Z")
      }]
    }).filter((row) => row.truthBasis === "SETTLEMENT");

    expect(rows.map((row) => row.supersedesObservationId)).toEqual([
      "observation:consensus",
      null
    ]);
    expect(rows.every((row) => row.observedAt.toISOString() === "2026-08-15T10:00:00.000Z"))
      .toBe(true);
  });

  it("is byte-for-byte deterministic for the same snapshot", () => {
    expect(projectEvaluatorObservations(snapshot)).toEqual(projectEvaluatorObservations(snapshot));
  });
});
