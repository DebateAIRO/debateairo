import { describe, expect, it } from "vitest";
import { ENGINE_BAND_ORDER, buildOneStepDownBands } from "@debateai/register";
import {
  PANEL_DEGRADED_SINGLE_VOICE_MARK,
  applyPanelDegradedBandStepDown,
  applySingleLineageBandCap
} from "@debateai/runner";
import { auditSurfaceReachability } from "../../tools/orphan-audit/src/index.js";
import {
  buildFactBundle,
  deriveBandCeiling,
  runServeGateChain,
  type BandCeilingRegisterRow,
  type ComposedSegment,
  type ConformanceJudgement,
  type ServeGateDependencies,
  type ServeGateInput,
  type ServeNode
} from "@debateai/serve";

/**
 * T12 + T13 (S08) — the band basis and the honest downgrade both read the
 * nodes the SERVED STATEMENT CITES, verified by conformance.
 *
 * Band names are read from T16's sealed engine vocabulary
 * (`ENGINE_BAND_ORDER`, weakest-first), never re-declared here — DECISIONS J1
 * forbids a consumer carrying a band value of its own. Everything else below
 * is a test-layer fixture and is named so.
 */
const CEILING_BAND = ENGINE_BAND_ORDER[0]!;
const TOP_BAND = ENGINE_BAND_ORDER[ENGINE_BAND_ORDER.length - 1]!;

type Basis = Readonly<Record<"LOOKED_UP" | "RAN" | "REASONING", number>>;

const node = (
  nodeId: string,
  wayOfKnowing: ServeNode["wayOfKnowing"],
  loadBearing: boolean,
  locator: string | null = null
): ServeNode => ({
  nodeId,
  text: `A test-layer fact carried by ${nodeId}.`,
  wayOfKnowing,
  provenanceRef: `artifact:${nodeId}`,
  locator,
  restatementStatus: "PASS",
  loadBearing
});

const segment = (
  segmentId: string,
  text: string,
  assertedNodeRefs: readonly string[],
  servedNumberRefs: readonly string[] = []
): ComposedSegment => ({ segmentId, text, loadBearing: false, assertedNodeRefs, servedNumberRefs });

const gateInput = (nodes: readonly ServeNode[], strangerSampleRate = 1): ServeGateInput => ({
  nodes,
  factBundle: buildFactBundle({
    facts: nodes.map((entry) => entry.text),
    residualObjections: [],
    badges: [],
    conditionMarks: [],
    reversalPoint: "An independent contrary source would reverse this test-layer answer.",
    buildsOnPrevious: { value: false, answerRef: null },
    memoryDisclosure: null
  }),
  maxRecompose: 2,
  compositionBudget: {
    tier: "low",
    bound: 10,
    registerRowKey: "test-layer:composition-budget",
    registerVersion: 1,
    sourceRef: "test-layer:DR-078"
  },
  strangerSampleRate,
  candidateConfidenceBand: TOP_BAND
});

/** A test-layer ceiling row over the SEALED band vocabulary. */
const ceilingRow = (): BandCeilingRegisterRow => ({
  rowKey: "test-layer:wayOfKnowingCeiling",
  registerVersion: 1,
  sourceRef: "test-layer:DR-082-086",
  value: {
    bandOrder: [...ENGINE_BAND_ORDER],
    ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_REASONING_CEILING"],
    defaultCeiling: {
      label: "TEST_DEFAULT_CEILING",
      ceilingBand: TOP_BAND,
      liftPath: "test-layer:retain-band"
    },
    cuts: [{
      minimumShares: { REASONING: 0.5 },
      label: "TEST_REASONING_CEILING",
      ceilingBand: CEILING_BAND,
      liftPath: "test-layer:gather-evidence-to-lift"
    }]
  }
});

interface Recorded {
  readonly bases: Basis[];
  readonly judgements: ConformanceJudgement[];
}

function dependencies(
  recorded: Recorded,
  overrides: Partial<ServeGateDependencies> = {}
): ServeGateDependencies {
  return {
    measureCompositionBundle: () => 1,
    compose: async () => [segment("segment:1", "A test-layer statement.", [])],
    selectSample: () => true,
    conform: async (candidate, state) => {
      const judgement = { segmentId: candidate.segmentId, state, conforms: true } as const;
      recorded.judgements.push(judgement);
      return judgement;
    },
    postComposeR9: async () => true,
    applyBandCeiling: ({ basis, candidateConfidenceBand }) => {
      recorded.bases.push(basis);
      return {
        kind: "NOT_CAPPED",
        confidenceBand: candidateConfidenceBand,
        ceiling: {
          label: "TEST_DEFAULT_CEILING",
          basis,
          registerRowKey: "test-layer:wayOfKnowingCeiling",
          registerVersion: 1,
          sourceRef: "test-layer:DR-086",
          liftPath: "test-layer:gather-evidence-to-lift"
        }
      };
    },
    ...overrides
  };
}

const recorder = (): Recorded => ({ bases: [], judgements: [] });

const share = (basis: Basis, way: keyof Basis): number =>
  basis[way] / (basis.LOOKED_UP + basis.RAN + basis.REASONING);

describe("T12 — the confidence band's basis counts the nodes the statement CITES", () => {
  it("counts a cited node the serve set never marked load-bearing, so mixed ways yield FRACTIONAL shares", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:looked-up", "LOOKED_UP", false, "https://example.invalid/test-fixture")
    ];
    const result = await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "A statement resting on both facts.", ["node:reasoned", "node:looked-up"])
      ]
    }));

    expect(result.terminal).toBe("SERVED");
    expect(recorded.bases).toEqual([{ LOOKED_UP: 1, RAN: 0, REASONING: 1 }]);
    // The DoD's own quantity: the shares are no longer structurally 0 or 1.
    expect(share(recorded.bases[0]!, "REASONING")).toBe(0.5);
    expect(share(recorded.bases[0]!, "LOOKED_UP")).toBe(0.5);
  });

  it("does not count a load-bearing node the statement never cites", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:uncited", "LOOKED_UP", true, "https://example.invalid/test-fixture")
    ];
    await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "A hypothesis resting on the reasoned node alone.", ["node:reasoned"]),
        segment("segment:2", "The research plan that would lift it.", ["node:reasoned"])
      ]
    }));

    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 1 }]);
  });

  it("keeps 0/1 shares for a HOMOGENEOUS multi-node citation", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned-a", "REASONING", true),
      node("node:reasoned-b", "REASONING", true)
    ];
    await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "A hypothesis resting on two reasoned nodes.", ["node:reasoned-a", "node:reasoned-b"]),
        segment("segment:2", "The research plan that would lift it.", ["node:reasoned-a"])
      ]
    }));

    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 2 }]);
    expect(share(recorded.bases[0]!, "REASONING")).toBe(1);
    expect(share(recorded.bases[0]!, "LOOKED_UP")).toBe(0);
    expect(share(recorded.bases[0]!, "RAN")).toBe(0);
  });

  it("excludes the citations of a segment conformance never verified", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:unverified", "LOOKED_UP", false, "https://example.invalid/test-fixture")
    ];
    await runServeGateChain(gateInput(nodes, 0), dependencies(recorded, {
      selectSample: () => false,
      compose: async () => [
        segment("segment:load", "A hypothesis the panel judged.", ["node:reasoned"], ["number:final-strength"]),
        segment("segment:unsampled", "A detail nobody checked.", ["node:unverified"])
      ]
    }));

    // The discrimination only exists while that segment really went unverified.
    expect(recorded.judgements.map((judgement) => judgement.segmentId)).toEqual(["segment:load"]);
    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 1 }]);
  });

  it("lets the register cut read the fractional share, so the ceiling stops firing on evidence-backed statements", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:looked-up-a", "LOOKED_UP", false, "https://example.invalid/a"),
      node("node:looked-up-b", "LOOKED_UP", false, "https://example.invalid/b")
    ];
    const result = await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "A statement resting on one reasoned and two looked-up facts.", [
          "node:reasoned", "node:looked-up-a", "node:looked-up-b"
        ])
      ],
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => {
        recorded.bases.push(basis);
        return deriveBandCeiling({ basis, candidateConfidenceBand, row: ceilingRow() });
      }
    }));

    expect(recorded.bases).toEqual([{ LOOKED_UP: 2, RAN: 0, REASONING: 1 }]);
    expect(share(recorded.bases[0]!, "REASONING")).toBeCloseTo(1 / 3, 12);
    expect(result.confidenceBand).toBe(TOP_BAND);
    expect(result.gateTrace).toContain("BAND_CEILING_PASS");
    expect(result.gateTrace).not.toContain("BAND_CEILING_CAPPED");
  });

  it("keeps the RAN bucket in the basis vocabulary (F5 do-not-tidy)", async () => {
    const recorded = recorder();
    const nodes = [node("node:ran", "RAN", true)];
    await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [segment("segment:1", "A statement resting on a run.", ["node:ran"])]
    }));

    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 1, REASONING: 0 }]);
  });
});

describe("T13 — the honest downgrade reads the same cited set the band reads", () => {
  it("yields DOWNGRADED, a synthesizer-written hypothesis and plan, and still shows the band", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:uncited", "LOOKED_UP", true, "https://example.invalid/test-fixture")
    ];
    const result = await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:hypothesis", "The provisional answer, as composed.", ["node:reasoned"]),
        segment("segment:plan", "The research plan that would lift it, as composed.", ["node:reasoned"])
      ]
    }));

    expect(result.terminal).toBe("DOWNGRADED");
    expect(result.gateTrace).toContain("GATE4_Q51_DOWNGRADE");
    expect(result.answerForm).toEqual({
      kind: "HYPOTHESIS_WITH_RESEARCH_PLAN",
      hypothesis: "The provisional answer, as composed.",
      researchPlan: "The research plan that would lift it, as composed."
    });
    // Both segments are the synthesizer's own text, not engine boilerplate.
    expect(result.segments.map((entry) => entry.text)).toEqual([
      "The provisional answer, as composed.",
      "The research plan that would lift it, as composed."
    ]);
    // The label and band are still shown on a downgraded answer.
    expect(result.confidenceBand).toBe(TOP_BAND);
    expect(result.bandCeiling).toMatchObject({
      label: "TEST_DEFAULT_CEILING",
      basis: { LOOKED_UP: 0, RAN: 0, REASONING: 1 }
    });
  });

  it("keeps the verdict form when the statement cites a looked-up node", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:looked-up", "LOOKED_UP", false, "https://example.invalid/test-fixture")
    ];
    const result = await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "An evidence-backed verdict.", ["node:reasoned", "node:looked-up"])
      ]
    }));

    expect(result.terminal).toBe("SERVED");
    expect(result.answerForm).toEqual({ kind: "VERDICT", text: "An evidence-backed verdict." });
    expect(result.gateTrace).toContain("GATE4_Q51_PASS");
  });

  it("stops loudly when the served statement cites no conformance-verified node", async () => {
    const recorded = recorder();
    const nodes = [node("node:reasoned", "REASONING", true)];
    await expect(runServeGateChain(gateInput(nodes), dependencies(recorded, {
      compose: async () => [
        segment("segment:1", "A hypothesis citing nothing.", [], ["number:final-strength"]),
        segment("segment:2", "A plan citing nothing.", [], ["number:final-strength"])
      ]
    }))).rejects.toMatchObject({ code: "SERVED_STATEMENT_CITES_NO_VERIFIED_NODE" });
  });
});

describe("T12 — the mono-maker one-step-down is preserved", () => {
  it("steps a mono-lineage candidate band down exactly one place in the sealed vocabulary", () => {
    expect(applySingleLineageBandCap(TOP_BAND, ceilingRow())).toBe(CEILING_BAND);
  });

  it("stops loudly when no ruled band exists below the candidate", () => {
    expect(() => applySingleLineageBandCap(CEILING_BAND, ceilingRow()))
      .toThrowError(expect.objectContaining({ code: "CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED" }));
  });
});

/**
 * Board F30 (packet AMENDMENT 2026-09-02) — T3 RECORDS the degraded-panel
 * step-down on `ledger.reduced_judgement.disagreement`; until this change
 * nothing CONSUMED it, so a served answer shipped the full band while its own
 * receipt said DOWNGRADED. The band lane is where the enforcement belongs.
 *
 * The mapping is T16's sealed `downgradeBands` row, built here by the register's
 * own builder over the sealed vocabulary — never a band literal (J1).
 */
const SEALED_ONE_STEP_DOWN = buildOneStepDownBands(ENGINE_BAND_ORDER);
const PANEL_PREDICATE_REF = "test-layer:T16#downgradeBands";

const degradation = (subjectRef: string, mark: string) => ({ subjectRef, mark });

describe("F30 — the served band consumes T3's recorded degraded-panel step-down", () => {
  it("steps the served root's band down one place through T16's sealed row", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: TOP_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.certaintyBand).toBe(SEALED_ONE_STEP_DOWN[TOP_BAND]);
    expect(decision.certaintyBand).toBe(CEILING_BAND);
    // A real move, not the identity - the same guard T3's own receipt test uses.
    expect(decision.certaintyBand).not.toBe(TOP_BAND);
    expect(decision.certaintyEffect).toBe("DOWNGRADED");
  });

  it("names WHAT decided: the sealed row as predicate, the served root's own mark as observation", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: TOP_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.predicateRef).toBe(PANEL_PREDICATE_REF);
    expect(decision.observationRef).toContain(PANEL_DEGRADED_SINGLE_VOICE_MARK);
    expect(decision.observationRef).toContain("node:served-root");
  });

  it("leaves the band alone when no panel degraded", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: TOP_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.certaintyBand).toBe(TOP_BAND);
    expect(decision.certaintyEffect).toBe("UNCHANGED");
    expect(decision.observationRef).toBeNull();
  });

  it("leaves the band alone when the degraded panel belongs to a node that is not the served root", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: TOP_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:other-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.certaintyBand).toBe(TOP_BAND);
    expect(decision.certaintyEffect).toBe("UNCHANGED");
  });

  it("does not fire on a PANEL-PARTIAL mark - only the single-voice collapse steps the band", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: TOP_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", "PANEL-PARTIAL")],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.certaintyBand).toBe(TOP_BAND);
    expect(decision.certaintyEffect).toBe("UNCHANGED");
  });

  it("is idempotent at the floor: a band with no ruled band below it stays put", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: CEILING_BAND,
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: SEALED_ONE_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    // T16 seals the weakest band as its own one-step-down target, so the floor
    // is a fixed point rather than a throw - the disclosure has already fired.
    expect(decision.certaintyBand).toBe(CEILING_BAND);
  });
});

/**
 * SCOPE OF THIS PROOF (codex r2 B1) — this is a STATIC CALL-GRAPH audit, and
 * nothing more. It proves the arm is not orphaned: that a path of textual call
 * references runs from a declared production entry point to
 * `applyPanelDegradedBandStepDown`, so an arm that were exported and never
 * wired (the F30 defect one level up, and mutant f4) fails it.
 *
 * It does NOT prove the arm EXECUTES in production. At this lane's base
 * `e040b1ee`, `apps/runner/src/main.ts` and `apps/runner/src/dev-runner-policy.ts`
 * do not load or pass `panelPolicy` — board F33, owned by lane T3C under
 * J20/J22 and NOT merged into this base — so a real M>=2 run stops at
 * `PANEL_WEIGHTING_UNRESOLVED` (runner index.ts, the claim-time gate) before
 * this arm is ever reached. Executable F30 proof is therefore CONDITIONAL on
 * T3C landing, and is demonstrated by the integration pairing and the closing
 * W12 run, not by this test. Wiring main.ts here would be taking another lane's
 * charge.
 */
describe("F30 — static call-graph reachability from the production entry points (NOT executable proof)", () => {
  it("reaches applyPanelDegradedBandStepDown by call reference from apps/runner/src/main.ts", async () => {
    const reachability = await auditSurfaceReachability();

    expect(reachability.blocking).toEqual([]);
    expect(reachability.declaredEntryPointFiles).toContain("apps/runner/src/main.ts");
    // Declared-but-uncalled is NOT reachable: this fails if the arm is exported
    // and never wired, which is exactly the F30 defect one level up.
    expect(reachability.reachableCallables).toContain("applyPanelDegradedBandStepDown");
  });
});

/**
 * codex r2 N4 — closing F-S08-5.
 *
 * The SEALED production vocabulary has two members, so "one step down" and
 * "collapse to the floor" land on the same band and no assertion over the
 * sealed order can tell them apart. The helper takes a generic
 * `Record<string, string>`, so a TEST-LAYER three-band map makes the
 * distinction observable WITHOUT touching the production vocabulary: a
 * double-step implementation returns the floor where one step returns the
 * middle band.
 */
const TEST_LAYER_THREE_BAND_STEP_DOWN = Object.freeze({
  "test-layer:TOP": "test-layer:MID",
  "test-layer:MID": "test-layer:FLOOR",
  "test-layer:FLOOR": "test-layer:FLOOR"
});

describe("F30 — the step is exactly ONE place (three-band test-layer fixture)", () => {
  it("steps TOP to MID and stops there, never collapsing to the floor", () => {
    const decision = applyPanelDegradedBandStepDown({
      certaintyBand: "test-layer:TOP",
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: TEST_LAYER_THREE_BAND_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(decision.certaintyBand).toBe("test-layer:MID");
    expect(decision.certaintyBand).not.toBe("test-layer:FLOOR");
    expect(decision.certaintyEffect).toBe("DOWNGRADED");
  });

  it("steps MID to FLOOR and stays there at the floor", () => {
    const fromMid = applyPanelDegradedBandStepDown({
      certaintyBand: "test-layer:MID",
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: TEST_LAYER_THREE_BAND_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });
    const fromFloor = applyPanelDegradedBandStepDown({
      certaintyBand: "test-layer:FLOOR",
      servedRootNodeId: "node:served-root",
      panelDegradations: [degradation("node:served-root", PANEL_DEGRADED_SINGLE_VOICE_MARK)],
      oneStepDown: TEST_LAYER_THREE_BAND_STEP_DOWN,
      predicateRef: PANEL_PREDICATE_REF
    });

    expect(fromMid.certaintyBand).toBe("test-layer:FLOOR");
    expect(fromFloor.certaintyBand).toBe("test-layer:FLOOR");
  });
});
