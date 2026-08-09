import { describe, expect, it } from "vitest";
import {
  applyCriticUnavailableCap,
  assertMakerAdmission,
  buildBlindedCritiquePacket,
  computeIndependenceReceipt,
  computeSymmetryDiff,
  deriveObjectionRecords,
  evaluateMakerAvailability,
  planBlindVerification
} from "../../packages/critique/src/index.js";
import {
  BUILT_IN_PROVIDER_ADAPTERS,
  selectProviderAdapter
} from "@debateai/providers";

describe("S08 / DR-091 — ruled CROSS trigger", () => {
  const snapshot = {
    records: [{ removedNodeId: "node:carrying", leverage: 0.42 }],
    triggerNodeIds: ["node:carrying"],
    snapshotAtSequence: 41,
    engineVersion: "propagation:s08"
  } as const;

  it("records the pure-core basis for casual routing without inventing a threshold", () => {
    expect(planBlindVerification({ riskTier: "casual", nodeId: "node:root", snapshot })).toEqual({
      verify: true,
      reason: "CROSS_ENTRY_LEVERAGE",
      basis: {
        nodeId: "node:root",
        leverageSnapshot: snapshot.records,
        snapshotAtSequence: 41,
        triggered: true,
        engineVersion: "propagation:s08"
      }
    });
    expect(planBlindVerification({
      riskTier: "casual",
      nodeId: "node:root",
      snapshot: { ...snapshot, triggerNodeIds: [] }
    })).toMatchObject({ verify: false, basis: { triggered: false } });
  });

  it.each(["standard", "high-stakes"] as const)("always verifies %s without fabricating a trigger basis", (riskTier) => {
    expect(planBlindVerification({ riskTier, nodeId: "node:root", snapshot })).toEqual({
      verify: true,
      reason: "RISK_TIER_ALWAYS",
      basis: null
    });
  });
});

describe("S08 / DR-092 / FX-S22-02 / FX-LED-04 — item-scoped symmetry", () => {
  const items = [
    { itemId: "item:for", stance: "SUPPORTS" as const },
    { itemId: "item:against", stance: "ATTACKS" as const }
  ];

  it("emits ASYMMETRIC with an exact under-checked work list", () => {
    const result = computeSymmetryDiff({ items, actions: [
      { actionKind: "MODEL_CALL", subjectItemId: "item:for", stanceAtAction: "SUPPORTS", outcome: "OK", accessDepth: "OPENED_FULL" },
      { actionKind: "MODEL_CALL", subjectItemId: "item:against", stanceAtAction: "ATTACKS", outcome: "OK", accessDepth: "PREVIEW_ONLY" }
    ] });
    expect(result.status).toBe("ASYMMETRIC");
    expect(result.remediationTargets).toEqual([{
      side: "ATTACKS",
      itemId: "item:against",
      actionKind: "MODEL_CALL",
      requiredAccessDepth: "OPENED_FULL",
      missingCount: 0
    }]);
    expect(result).not.toHaveProperty("fairnessScore");
  });

  it("excludes PRE_ITEM actions from the census but lets UNCLASSIFIED_ACTION withhold the verdict", () => {
    const shared = [
      { actionKind: "MODEL_CALL" as const, subjectItemId: "item:for", stanceAtAction: "SUPPORTS" as const, outcome: "OK" as const, accessDepth: "OPENED_FULL" as const },
      { actionKind: "MODEL_CALL" as const, subjectItemId: "item:against", stanceAtAction: "ATTACKS" as const, outcome: "OK" as const, accessDepth: "OPENED_FULL" as const }
    ];
    const unknown = computeSymmetryDiff({ items, actions: [
      ...shared,
      { actionKind: "UNCLASSIFIED_ACTION", subjectItemId: "pre:item", stanceAtAction: "UNASSIGNED", outcome: "FAILED" }
    ] });
    expect(unknown).toMatchObject({ status: "UNINSTRUMENTED", fairnessClaimWithheld: true, bandCapRequired: true });
    expect(unknown.census).toHaveLength(2);
    expect(unknown.census.every((row) => row.actionKind === "MODEL_CALL")).toBe(true);

    // UNASSIGNED is not an exclusion rule: on an ITEM_SCOPED kind it is a real missing-stamp signal.
    expect(computeSymmetryDiff({ items, actions: [
      ...shared,
      { actionKind: "MODEL_CALL", subjectItemId: "item:against", stanceAtAction: "UNASSIGNED", outcome: "FAILED" }
    ] })).toMatchObject({ status: "UNINSTRUMENTED", fairnessClaimWithheld: true, bandCapRequired: true });
  });

  it("makes stripped telemetry UNINSTRUMENTED and never silently SYMMETRIC", () => {
    const result = computeSymmetryDiff({ items, actions: [] });
    expect(result.status).toBe("UNINSTRUMENTED");
    expect(result.remediationTargets.map((target) => target.itemId)).toEqual(["item:against", "item:for"]);
  });
});

describe("S08 / FX-PRV-01a/01b/02 / FX-C52-04 — maker predicates", () => {
  const policy = {
    requiredDistinctMakers: 2,
    standingMisconfigurationLimit: 3,
    registerRef: "configuredProviderSet@fixture"
  } as const;

  it("refuses standard+ for standing one-maker capability failure", () => {
    const availability = evaluateMakerAvailability({
      configuredProviders: [{ providerRef: "p1", maker: "maker:a" }],
      reachedProviderRefs: ["p1"],
      standingMisconfigurationCount: 0,
      policy
    });
    expect(availability).toMatchObject({ deploymentMakerCapability: false, classification: "STANDING_MISCONFIGURATION" });
    expect(() => assertMakerAdmission("standard", availability)).toThrowError(expect.objectContaining({
      code: "MAKER_INVENTORY_UNSATISFIED"
    }));
    expect(() => assertMakerAdmission("high-stakes", availability)).toThrow();
    expect(() => assertMakerAdmission("casual", availability)).not.toThrow();
  });

  it("keeps a one-run outage transient on a capable two-maker deployment", () => {
    const availability = evaluateMakerAvailability({
      configuredProviders: [
        { providerRef: "p1", maker: "maker:a" },
        { providerRef: "p2", maker: "maker:b" }
      ],
      reachedProviderRefs: ["p1"],
      standingMisconfigurationCount: 0,
      policy
    });
    expect(availability).toMatchObject({
      deploymentMakerCapability: true,
      runMakerReachability: false,
      classification: "TRANSIENT_OUTAGE"
    });
    expect(applyCriticUnavailableCap(availability)).toEqual({
      serves: true,
      conditionMarks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"],
      confidenceBandCapRequired: true,
      liftCondition: "RUN_DIFFERENT_MAKER_CRITIQUE"
    });
  });

  it("flips capability false when the ledger-derived standing counter trips", () => {
    expect(evaluateMakerAvailability({
      configuredProviders: [
        { providerRef: "p1", maker: "maker:a" },
        { providerRef: "p2", maker: "maker:b" }
      ],
      reachedProviderRefs: ["p1"],
      standingMisconfigurationCount: 3,
      policy
    })).toMatchObject({ deploymentMakerCapability: false, classification: "STANDING_MISCONFIGURATION" });
  });
});

describe("S08 / FX-HR-H2a/H2b/H6 / P18 — isolation and receipts", () => {
  it("ships two adapters selected by configuration and accepts a provider-local plugin", () => {
    expect(BUILT_IN_PROVIDER_ADAPTERS.map((row) => row.adapterKind)).toEqual([
      "openai-compatible-http", "vllm-openai-compatible-http"
    ]);
    expect(selectProviderAdapter("provider:vllm", [
      { providerRef: "provider:remote", adapterKind: "openai-compatible-http", maker: "maker:remote" },
      { providerRef: "provider:vllm", adapterKind: "vllm-openai-compatible-http", maker: "maker:local" }
    ])).toMatchObject({ maker: "maker:local" });
    expect(selectProviderAdapter("provider:plugin", [
      { providerRef: "provider:plugin", adapterKind: "provider-plugin", maker: "maker:third" }
    ])).toMatchObject({ adapterKind: "provider-plugin" });
  });

  it("strips producer identity before the isolated critic reads the packet", () => {
    const packet = buildBlindedCritiquePacket({
      runId: "run:1",
      sourceArtifactRef: "artifact:1",
      sourceContent: "The evidence-backed answer.",
      producerIdentity: "agent:author-secret",
      producerMaker: "maker:a",
      criticMaker: "maker:b",
      researchContextHash: "research-context-hash",
      critiqueContextHash: "critique-context-hash"
    });
    expect(JSON.stringify(packet)).not.toContain("agent:author-secret");
    expect(packet).toMatchObject({ blindingApplied: "IDENTITY_STRIPPED", criticMaker: "maker:b" });
    expect(packet.researchContextHash).not.toBe(packet.critiqueContextHash);
  });

  it("records typed absence when there is no critic and proves real independence from hashes", () => {
    expect(computeIndependenceReceipt({
      producerMaker: "maker:a", criticMaker: null,
      researchContextHash: "research", critiqueContextHash: null,
      packetFingerprint: null, packetAtSequence: null,
      criticLedgerEntryRef: null, criticAtSequence: null
    })).toMatchObject({ status: "UNKNOWN", absenceReason: "NO_CRITIC", differentMaker: false, contextIsolated: false, blindedBeforeCritic: false });
    expect(computeIndependenceReceipt({
      producerMaker: "maker:a", criticMaker: "maker:b",
      researchContextHash: "research", critiqueContextHash: "critique",
      packetFingerprint: "f".repeat(64), packetAtSequence: 10,
      criticLedgerEntryRef: "ledger:critic", criticAtSequence: 11
    })).toMatchObject({ status: "INDEPENDENT", absenceReason: null, differentMaker: true, contextIsolated: true, blindedBeforeCritic: true });
    expect(computeIndependenceReceipt({
      producerMaker: "maker:a", criticMaker: "maker:b",
      researchContextHash: "research", critiqueContextHash: "critique",
      packetFingerprint: "f".repeat(64), packetAtSequence: 12,
      criticLedgerEntryRef: "ledger:critic", criticAtSequence: 11
    })).toMatchObject({ status: "NOT_INDEPENDENT", absenceReason: "CRITIC_SAW_UNBLINDED_ORDER", blindedBeforeCritic: false });
  });

  it("keeps residual objections first-class even with no critic", () => {
    expect(deriveObjectionRecords({ existing: [
      { objectionRef: "objection:open", status: "OPEN" },
      { objectionRef: "objection:closed", status: "CLOSED", closedByRef: "evidence:1" }
    ], criticObjections: [] })).toEqual({
      records: [
        { objectionRef: "objection:closed", status: "CLOSED", closedByRef: "evidence:1" },
        { objectionRef: "objection:open", status: "OPEN", closedByRef: null }
      ],
      residualObjectionRefs: ["objection:open"]
    });
  });
});
