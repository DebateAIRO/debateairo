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
  type DigestSourceNode,
  type EvaluatorVerdict,
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

/**
 * T9B PORT — the chain this file drives is T9's synthesis chain now. The serve
 * input lost `maxRecompose` and `strangerSampleRate` (the composition retry and
 * the conformance SAMPLE are both retired) and gained the digest inputs, the
 * served root, the code label and the sealed role controls. Every T12/T13
 * property below is unchanged; only the way the candidate reaches the chain is.
 */
const ROLE_CONTROLS = Object.freeze({
  synthesizerRoleRef: "test-layer:synthesizer",
  evaluatorRoleRef: "test-layer:evaluator",
  evaluatorLoopMaxRounds: 3
});

const CODE_LABEL = Object.freeze({
  verdictLabel: "CONTESTED",
  servedNodeId: "node:served-root",
  servedStrength: 0.7,
  margin: 0.1,
  registerVersion: 1
});

/** The digest source mirrors the serve set, so the served root always exists. */
const digestNodesFor = (nodes: readonly ServeNode[]): readonly DigestSourceNode[] =>
  nodes.map((entry, index) => Object.freeze({
    nodeId: entry.nodeId,
    statement: entry.text,
    finalStrength: 0.7 - index * 0.05,
    wayOfKnowing: entry.wayOfKnowing,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze([]),
    isPosition: index === 0,
    isSurvivingObjection: false
  }));

const gateInput = (nodes: readonly ServeNode[]): ServeGateInput => ({
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
  compositionBudget: {
    tier: "low",
    bound: 200_000,
    registerRowKey: "test-layer:composition-budget",
    registerVersion: 1,
    sourceRef: "test-layer:DR-078"
  },
  candidateConfidenceBand: TOP_BAND,
  digestNodes: digestNodesFor(nodes),
  servedRootNodeId: nodes[0]!.nodeId,
  codeLabel: CODE_LABEL,
  synthesisRoleControls: ROLE_CONTROLS
});

/** A test-layer ceiling row over the SEALED band vocabulary. */
const ceilingRow = (): BandCeilingRegisterRow => ({
  rowKey: "test-layer:wayOfKnowingCeiling",
  registerVersion: 1,
  sourceRef: "test-layer:DR-082-086",
  value: {
    bandOrder: [...ENGINE_BAND_ORDER],
    ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_REASONING_CEILING", "TEST_EMPTY_BASIS_FLOOR"],
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
    }],
    // F-T9B-3: the entry whose trigger is the EMPTY BASIS itself. Before it
    // existed the floored record was selected from `cuts` by band, which on
    // this row means TEST_REASONING_CEILING — the right band under a name
    // describing a reasoning share that cannot fire on an empty basis.
    emptyBasisFloor: {
      label: "TEST_EMPTY_BASIS_FLOOR",
      ceilingBand: CEILING_BAND,
      liftPath: "test-layer:gather-any-verified-evidence-to-lift"
    }
  }
});

interface Recorded {
  readonly bases: Basis[];
}

/** An evaluator that is satisfied on every criterion — the T12/T13 happy path. */
const SATISFIED: EvaluatorVerdict = Object.freeze({
  satisfied: true,
  objection: null,
  criteria: Object.freeze({
    fairnessToLosers: true,
    statementLabelAgreement: true,
    noOverstatement: true,
    restatement: true,
    citationTracing: true
  })
});

/** The evaluator that FAILED citation tracing and is still objecting at the last round. */
const CITATION_TRACING_FAILED: EvaluatorVerdict = Object.freeze({
  satisfied: false,
  objection: "Claim 2 traces to no digest node.",
  criteria: Object.freeze({ ...SATISFIED.criteria, citationTracing: false })
});

/**
 * T9B PORT: `compose`/`selectSample`/`conform`/`postComposeR9` are gone; the
 * candidate arrives from the SYNTHESIZER and the criteria from the EVALUATOR.
 * Each arm supplies its segments through `segments`, exactly as it previously
 * supplied them through `compose`.
 */
function dependencies(
  recorded: Recorded,
  script: {
    readonly segments?: () => readonly ComposedSegment[];
    readonly verdict?: EvaluatorVerdict;
    readonly applyBandCeiling?: ServeGateDependencies["applyBandCeiling"];
  } = {}
): ServeGateDependencies {
  return {
    synthesize: async (request) => ({
      candidate: script.segments !== undefined
        ? script.segments()
        : [segment("segment:1", "A test-layer statement.", [])],
      // A RECORDED reference and its call site, the way the runner supplies
      // them from a provider response — never a label invented by the loop.
      candidateRef: `artifact:candidate:${request.round}`,
      candidateCallSiteKey: `COMPOSER:SYNTHESIZER:${request.stage}:${request.round}`
    }),
    evaluate: async (request) => ({
      verdict: script.verdict ?? SATISFIED,
      verdictRef: `artifact:evaluator:${request.round}`,
      verdictCallSiteKey: `POST_COMPOSE_R9:EVALUATOR:${request.round}`
    }),
    applyBandCeiling: script.applyBandCeiling ?? (({ basis, candidateConfidenceBand }) => {
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
    })
  };
}

const recorder = (): Recorded => ({ bases: [] });

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
      segments: () => [
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
      segments: () => [
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
      segments: () => [
        segment("segment:1", "A hypothesis resting on two reasoned nodes.", ["node:reasoned-a", "node:reasoned-b"]),
        segment("segment:2", "The research plan that would lift it.", ["node:reasoned-a"])
      ]
    }));

    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 2 }]);
    expect(share(recorded.bases[0]!, "REASONING")).toBe(1);
    expect(share(recorded.bases[0]!, "LOOKED_UP")).toBe(0);
    expect(share(recorded.bases[0]!, "RAN")).toBe(0);
  });

  /**
   * RETIRED ON THE RECORD — V ruling, 2026-09-03 (T9B lane, finding F-T9B-1).
   *
   * The assertion that stood here was S08's
   *   it("excludes the citations of a segment conformance never verified")
   * It drove `selectSample: () => false` so one segment landed
   * `state: "NOT_SAMPLED"`, then asserted that segment's citations stayed out
   * of the band basis.
   *
   * WHY IT IS GONE, and it is not because it failed. T9 retired the three-state
   * sampled conformance gate into a single EVALUATOR criterion, so the chain no
   * longer has a sample: `runServeGateChain` mints `state: "JUDGED"` for every
   * segment and hard-sets `coverageMode = "EXHAUSTIVE"`. `NOT_SAMPLED` has no
   * producer on this path, so the state this assertion pins cannot be reached
   * by any input — it would pass vacuously rather than discriminate.
   *
   * WHAT REPLACED THE SAFETY PROPERTY, so nothing was merely dropped: the
   * citation-tracing guard in `runServeGateChain` returns COMPONENTS_ONLY when
   * the evaluator's `citationTracing` criterion is false. That reaches the same
   * outcome S08's `!conformance.every((j) => j.conforms)` guard reached, through
   * T9's one criterion instead of three sampled states. It is pinned by
   * `it("refuses to band a statement whose citation tracing FAILED")` below.
   *
   * S08's cited-set filter itself STAYS in the product code and is deliberately
   * not tidied away as dead: under this chain its state check is always true,
   * it costs nothing, and it remains correct if a sampling path ever returns.
   *
   * This retires ONE named assertion for ONE stated reason. It is not licence
   * to retire another.
   */

  it("lets the register cut read the fractional share, so the ceiling stops firing on evidence-backed statements", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:looked-up-a", "LOOKED_UP", false, "https://example.invalid/a"),
      node("node:looked-up-b", "LOOKED_UP", false, "https://example.invalid/b")
    ];
    const result = await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      segments: () => [
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

  /**
   * V ruling 2026-09-03 (F-T9B-1), THIRD mechanism — the ruled one.
   *
   * The first two both invented a way to END the answer: a fifth COMPONENTS_ONLY
   * crash class, then a hard refusal through S08's empty-basis guard. Both broke
   * goal-v4, which says a run that reaches its round bound with the evaluator
   * still objecting SERVES REGARDLESS, carrying the objection as a visible mark.
   * This one uses the ladder the engine already has: the run serves, the mark is
   * emitted, and the terminal is DOWNGRADED — the floor of the terminal ladder.
   * It does NOT route through T13's REASONING-only limb: that limb is for a
   * VERIFIED reasoning-only cited set and requires a hypothesis and a research
   * plan, and collapsing the two causes onto it is what made a one-segment
   * tracing-failed run crash. The two are separated, and the arm below pins
   * that this one serves at any segment count.
   *
   * What the band does. `conforms` is a live axis of the cited-set filter, so a
   * failed citation-tracing criterion leaves NO verified segment and the basis
   * is empty. The band is then reported at its FLOOR — a VALUE, which V chose
   * over the absence an earlier pass reported — derived from the register row's
   * own `bandOrder`, and the ceiling record is built from the row entry that
   * NAMES that floor band. Nothing is banded on rejected evidence: the basis the
   * record prints is empty.
   *
   * The verdict LABEL is untouched. Confirm-item 3 and the frozen S06 spec rule
   * that a standing round-3 objection does not move it, and it is code-derived
   * from the propagated numbers before synthesis runs, acyclically.
   *
   * The pair below is deliberate. Asserting "the basis contains no untraced
   * citation" against a basis holding nothing proves little on its own, so the
   * SAME nodes and the SAME segments are run with the evaluator satisfied, and
   * that run's basis is asserted to contain both citations. One arm shows the
   * exclusion, the other shows there was something to exclude.
   */
  /**
   * V ruling 2026-09-03, RATIFIED OUTCOME. When the evaluator's citation-tracing
   * criterion fails: the run SERVES, emits its standing-objection mark, reports
   * the confidence band at its FLOOR, and takes the DOWNGRADED terminal. The
   * verdict LABEL is untouched — confirm-item 3 and the frozen S06 spec forbid a
   * post-synthesis objection reaching back into a label that is code-derived
   * from the propagated numbers before synthesis runs.
   *
   * A FLOOR, NOT AN ABSENCE. An earlier pass reported no band at all; V declined
   * that, because a consumer should see a value rather than a hole. The floor is
   * read from the REGISTER ROW's own `bandOrder`, never from a literal in this
   * package (DECISIONS J1: a consumer carries no band value of its own), so
   * `deriveBandCeiling` returns the row's weakest band with the row's own
   * provenance and the empty basis it was derived from.
   *
   * The band is empty because `conforms` is a live axis of the cited-set filter:
   * no untraced citation reaches the basis. That is what makes the floor honest
   * rather than arbitrary — it is the band you get from no verified evidence.
   */
  it("serves an exhausted citation-tracing objection DOWNGRADED, marked, at the band FLOOR", async () => {
    const recorded = recorder();
    const nodes = [
      node("node:reasoned", "REASONING", true),
      node("node:looked-up", "LOOKED_UP", false, "https://example.invalid/test-fixture")
    ];
    const segments = () => [
      segment("segment:hypothesis", "The provisional answer, as composed.", ["node:reasoned", "node:looked-up"], ["number:final-strength"]),
      segment("segment:plan", "The research plan that would lift it, as composed.", ["node:reasoned"])
    ];
    // The REAL derivation, not a permissive double: a double returning NOT_CAPPED
    // would invent a band for an empty basis instead of deriving the floor.
    const realCeiling: ServeGateDependencies["applyBandCeiling"] = ({ basis, candidateConfidenceBand }) => {
      recorded.bases.push(basis);
      return deriveBandCeiling({ basis, candidateConfidenceBand, row: ceilingRow() });
    };

    // `.resolves` rather than `await` then assert (D43): the property is that
    // this run does NOT end the answer, so a regression makes the chain THROW.
    // Awaiting first would surface that as an unhandled rejection with no
    // assertion frame, and the mutant would die of the system being loud rather
    // than of the assertion that owns the invariant.
    await expect(runServeGateChain(gateInput(nodes), dependencies(recorded, {
      verdict: CITATION_TRACING_FAILED, segments, applyBandCeiling: realCeiling
    }))).resolves.toMatchObject({
      terminal: "DOWNGRADED",
      standingObjection: "Claim 2 traces to no digest node.",
      crashClass: null,
      // A VALUE at the floor, and the WHOLE ceiling record behind it — not just
      // the band. codex r3: pinning the band alone let a record through that
      // named a DIFFERENT decision (label DEFAULT_CEILING, liftPath
      // "retain-band") beside a band that had been LOWERED. Every field is
      // pinned here, so a record that misdescribes its own decision fails.
      confidenceBand: CEILING_BAND,
      bandCeiling: {
        // F-T9B-3: the row's EMPTY-BASIS entry — never the default entry, whose
        // band is the TOP one and whose lift path claims the band was retained,
        // and never the reasoning cut, whose share trigger cannot fire on an
        // empty basis. The record names the decision that actually produced it.
        label: "TEST_EMPTY_BASIS_FLOOR",
        liftPath: "test-layer:gather-any-verified-evidence-to-lift",
        basis: { LOOKED_UP: 0, RAN: 0, REASONING: 0 },
        registerRowKey: "test-layer:wayOfKnowingCeiling",
        registerVersion: 1,
        sourceRef: "test-layer:DR-082-086"
      }
    });
    // The ceiling WAS derived, over a basis holding no untraced citation.
    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 0 }]);

    const marked = recorder();
    const markedResult = await runServeGateChain(gateInput(nodes), dependencies(marked, {
      verdict: CITATION_TRACING_FAILED, segments, applyBandCeiling: realCeiling
    }));
    expect(markedResult.conditionMarks).toContain("SYNTHESIS-OBJECTION-STANDING");

    // ...and the contrast that stops "no untraced citation" from being vacuous:
    // the same citations DO reach the basis when the evaluator traced them.
    const traced = recorder();
    const servedResult = await runServeGateChain(gateInput(nodes), dependencies(traced, {
      segments, applyBandCeiling: ({ basis, candidateConfidenceBand }) => {
        traced.bases.push(basis);
        return deriveBandCeiling({ basis, candidateConfidenceBand, row: ceilingRow() });
      }
    }));
    expect(servedResult.terminal).toBe("SERVED");
    expect(traced.bases).toEqual([{ LOOKED_UP: 1, RAN: 0, REASONING: 1 }]);
  });

  /**
   * SERVING AFTER THE ROUND BOUND MUST NOT DEPEND ON SEGMENT COUNT (V ruling,
   * 2026-09-03). The previous pass routed the tracing-failed case through T13's
   * REASONING-only limb, which is right about the terminal and wrong about the
   * form: that limb requires a hypothesis AND a research plan, so a one-segment
   * candidate crashed with COMPOSITION_CONTRACT_ERROR before any served result
   * carrying the mark existed. One segment is squarely within the production
   * contract — the synthesizer is asked for two only when the cited nodes rest
   * on reasoning alone, and this fixture cites a LOOKED_UP node.
   *
   * The two causes are separated now: "no verified cited node because tracing
   * failed" and "every cited node is reasoning" no longer collapse onto one
   * path through `[].every(...)`, which is the vacuous-empty-set shape S08's
   * empty-basis stop already guards against elsewhere.
   */
  it("serves a tracing-failed run at ANY segment count — one segment is enough", async () => {
    const recorded = recorder();
    const nodes = [node("node:looked-up", "LOOKED_UP", true, "https://example.invalid/test-fixture")];
    await expect(runServeGateChain(gateInput(nodes), dependencies(recorded, {
      verdict: CITATION_TRACING_FAILED,
      segments: () => [
        segment("segment:only", "A single composed statement.", ["node:looked-up"], ["number:final-strength"])
      ],
      applyBandCeiling: ({ basis, candidateConfidenceBand }) => {
        recorded.bases.push(basis);
        return deriveBandCeiling({ basis, candidateConfidenceBand, row: ceilingRow() });
      }
    }))).resolves.toMatchObject({
      terminal: "DOWNGRADED",
      crashClass: null,
      confidenceBand: CEILING_BAND,
      answerForm: { kind: "VERDICT", text: "A single composed statement." }
    });
    expect(recorded.bases).toEqual([{ LOOKED_UP: 0, RAN: 0, REASONING: 0 }]);
  });

  /**
   * THE REGRESSION for the case that legitimately needs two segments. Separating
   * the tracing-failed cause must not weaken T13's own contract: a statement
   * whose VERIFIED cited set really is reasoning-only is served as a hypothesis
   * plus the research plan that would lift it, and a one-segment candidate for
   * that form is still a composition-contract error.
   */
  /**
   * THE TWO REFUSALS ON THE FLOOR ROUTE, exercised (D56 — a check nobody has
   * seen refuse is not known to be a check). codex r3 found that the floor route
   * skipped the label-membership validation the ordinary derivation performs,
   * and that the deployment schema only checks these strings are non-empty, so
   * an inconsistent sealed row would have been accepted on this route alone.
   */
  it("refuses a floor entry whose label is not in the row's ceilingLabels", () => {
    const row = ceilingRow();
    const broken: BandCeilingRegisterRow = {
      ...row,
      value: {
        ...row.value,
        emptyBasisFloor: { ...row.value.emptyBasisFloor!, label: "TEST_LABEL_NOT_IN_THE_VOCABULARY" }
      }
    };
    expect(() => deriveBandCeiling({
      basis: { LOOKED_UP: 0, RAN: 0, REASONING: 0 },
      candidateConfidenceBand: TOP_BAND,
      row: broken
    })).toThrowError(expect.objectContaining({ code: "BAND_CEILING_LABEL_UNKNOWN" }));
  });

  it("refuses when the row carries NO empty-basis entry to describe its floor", () => {
    const row = ceilingRow();
    // F-T9B-3: the floor is described by `emptyBasisFloor` alone, so removing
    // it is what leaves the floor undescribed. Mutating `cuts` no longer
    // reaches this guard — before the entry existed this test passed whether or
    // not its mutation mattered, because the fixture described no floor either
    // way.
    const { emptyBasisFloor: _removed, ...withoutFloor } = row.value;
    const broken: BandCeilingRegisterRow = { ...row, value: withoutFloor };
    expect(() => deriveBandCeiling({
      basis: { LOOKED_UP: 0, RAN: 0, REASONING: 0 },
      candidateConfidenceBand: TOP_BAND,
      row: broken
    })).toThrowError(expect.objectContaining({ code: "BAND_CEILING_FLOOR_UNDESCRIBED" }));
  });

  it("still refuses a one-segment candidate when the VERIFIED cited set is reasoning-only", async () => {
    const recorded = recorder();
    const nodes = [node("node:reasoned", "REASONING", true)];
    await expect(runServeGateChain(gateInput(nodes), dependencies(recorded, {
      segments: () => [segment("segment:only", "A reasoned statement.", ["node:reasoned"])]
    }))).rejects.toMatchObject({ code: "COMPOSITION_CONTRACT_ERROR" });
  });

  it("keeps the RAN bucket in the basis vocabulary (F5 do-not-tidy)", async () => {
    const recorded = recorder();
    const nodes = [node("node:ran", "RAN", true)];
    await runServeGateChain(gateInput(nodes), dependencies(recorded, {
      segments: () => [segment("segment:1", "A statement resting on a run.", ["node:ran"])]
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
      segments: () => [
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
      segments: () => [
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
      segments: () => [
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
