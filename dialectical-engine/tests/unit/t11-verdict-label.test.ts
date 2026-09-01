import { describe, expect, it } from "vitest";

/**
 * T11 (goal 196-221; rulings S7-1, S6-1, confirm-items 3/4/6) — the three-state
 * verdict label is DERIVED FROM CODE, from the propagated numbers, before
 * synthesis.
 *
 * The baseline derivation at packages/serve deriveHonestVerdict was binary:
 * a usable basis printed SUPPORTED and nothing else could ever be printed. The
 * first test below is the RED the DoD names — a constructed NEAR-TIE must print
 * CONTESTED — and it fails on the baseline with SUPPORTED.
 *
 * The ladder is ORDERED, TOTAL and DISJOINT over the RUNTIME domain, absent
 * inputs included (ABSENT is a runtime value, never NaN):
 *   0. margin ABSENT or disagreement ABSENT -> CONTESTED + LABEL-BASIS-INCOMPLETE
 *   1. winner < low cut                     -> UNSUPPORTED
 *   2. margin <= gamma or disagreement >= threshold -> CONTESTED
 *   3. winner >= high cut                   -> SUPPORTED
 *   4. otherwise (mid band)                 -> CONTESTED
 */

/**
 * Fixture controls. Deliberately NOT the seeded register values: the production
 * path reads gamma / cuts / threshold from T16's sealed rows, so a test that
 * restated the seeded numbers would pass even if the reader were bypassed. The
 * shape is what is under test; the values are the caller's.
 */
const controls = { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 } as const;

const measured = (value: number) => ({ kind: "MEASURED", value }) as const;
const absentMargin = { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" } as const;
const absentDispersion = { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" } as const;

async function serve(): Promise<typeof import("@debateai/serve")> {
  return import("@debateai/serve");
}

describe("T11 · the three-state label ladder", () => {
  /**
   * THE RED (goal 214-215). A near-tie: the winner is strong, but the runner-up
   * is 0.02 behind, inside gamma. The served label is CONTESTED. On the
   * baseline the binary derivation prints SUPPORTED.
   */
  it("prints CONTESTED for a constructed near-tie, through the production verdict derivation", async () => {
    const { deriveHonestVerdict } = await serve();

    const verdict = deriveHonestVerdict({
      usableBasis: true,
      reasonRef: "serve-gate:SERVED",
      labelBasis: {
        winner: 0.9,
        margin: measured(0.02),
        disagreement: measured(0.01),
        controls
      }
    });

    expect(verdict.verdictState).toBe("CONTESTED");
    expect(verdict.unavailable).toBeNull();
  });

  it("keeps the unavailable projection when the basis is not usable at all", async () => {
    const { deriveHonestVerdict } = await serve();

    const verdict = deriveHonestVerdict({
      usableBasis: false,
      reasonRef: "condition:test",
      labelBasis: null
    });

    expect(verdict).toEqual({
      verdictState: null,
      confidenceBand: null,
      unavailable: { reasonRef: "condition:test" },
      derivation: null
    });
  });

  it("refuses to invent a label when the basis is usable but was never supplied", async () => {
    const { deriveHonestVerdict } = await serve();

    expect(() => deriveHonestVerdict({
      usableBasis: true,
      reasonRef: "serve-gate:SERVED",
      labelBasis: null
    })).toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_BASIS_UNRESOLVED" }));
  });

  describe("rungs, each trigger tested", () => {
    it("rung 0 · an ABSENT margin is CONTESTED and carries LABEL-BASIS-INCOMPLETE", async () => {
      const { deriveVerdictLabel, LABEL_BASIS_INCOMPLETE_MARK } = await serve();

      // A solo voice at maximal strength: confidence never buys SUPPORTED.
      const derivation = deriveVerdictLabel({
        winner: 1, margin: absentMargin, disagreement: measured(0), controls
      });

      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.rung).toBe(0);
      expect(derivation.marks).toEqual([LABEL_BASIS_INCOMPLETE_MARK]);
      expect(LABEL_BASIS_INCOMPLETE_MARK).toBe("LABEL-BASIS-INCOMPLETE");
    });

    it("rung 0 · an ABSENT dispersion is CONTESTED and carries LABEL-BASIS-INCOMPLETE", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 1, margin: measured(0.9), disagreement: absentDispersion, controls
      });

      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.rung).toBe(0);
      expect(derivation.marks).toEqual(["LABEL-BASIS-INCOMPLETE"]);
      expect(derivation.basisAbsence).toEqual(["DISAGREEMENT"]);
    });

    it("rung 0 · takes precedence over a below-low-cut winner", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.01, margin: absentMargin, disagreement: absentDispersion, controls
      });

      expect(derivation.rung).toBe(0);
      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.basisAbsence).toEqual(["MARGIN", "DISAGREEMENT"]);
    });

    it("rung 1 · a winner below the low cut is UNSUPPORTED", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.34, margin: measured(0.3), disagreement: measured(0), controls
      });

      expect(derivation.label).toBe("UNSUPPORTED");
      expect(derivation.rung).toBe(1);
      expect(derivation.marks).toEqual([]);
    });

    it("rung 1 · the low cut itself is NOT below the cut", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.35, margin: measured(0.3), disagreement: measured(0), controls
      });

      expect(derivation.rung).not.toBe(1);
      expect(derivation.label).toBe("CONTESTED");
    });

    it("rung 2 · a margin at gamma is CONTESTED", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.95, margin: measured(0.05), disagreement: measured(0), controls
      });

      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.rung).toBe(2);
      expect(derivation.trigger).toBe("MARGIN_WITHIN_GAMMA");
    });

    it("rung 2 · a dispersion at the disagreement threshold is CONTESTED", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.95, margin: measured(0.4), disagreement: measured(0.25), controls
      });

      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.rung).toBe(2);
      expect(derivation.trigger).toBe("DISAGREEMENT_AT_THRESHOLD");
    });

    it("rung 2 · when BOTH conditions hold, the disclosed trigger is the margin", async () => {
      const { deriveVerdictLabel } = await serve();

      // Both limbs fire. The rung and label are the same either way, but the
      // trigger is DISCLOSED on the receipt, so its precedence is documented
      // and pinned rather than left to the order the disjuncts happen to have.
      const derivation = deriveVerdictLabel({
        winner: 0.95, margin: measured(0.01), disagreement: measured(0.9), controls
      });

      expect(derivation.rung).toBe(2);
      expect(derivation.trigger).toBe("MARGIN_WITHIN_GAMMA");
    });

    it("rung 3 · a clear winner at or above the high cut is SUPPORTED", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.7, margin: measured(0.4), disagreement: measured(0.1), controls
      });

      expect(derivation.label).toBe("SUPPORTED");
      expect(derivation.rung).toBe(3);
      expect(derivation.marks).toEqual([]);
    });

    it("rung 4 · the mid band is CONTESTED even with a clear margin and low disagreement", async () => {
      const { deriveVerdictLabel } = await serve();

      const derivation = deriveVerdictLabel({
        winner: 0.5, margin: measured(0.4), disagreement: measured(0.1), controls
      });

      expect(derivation.label).toBe("CONTESTED");
      expect(derivation.rung).toBe(4);
      expect(derivation.trigger).toBe("MID_BAND");
    });
  });

  /**
   * The PROPERTY test the DoD names: over the (winner, margin, disagreement)
   * cube PLUS the absent-margin and absent-dispersion arms, EXACTLY ONE label
   * is produced at every point of the runtime domain.
   *
   * "Exactly one" is proved three ways at every point:
   *   (a) the returned label is one of the three states;
   *   (b) the rung the implementation reports is the FIRST rung whose guard is
   *       true under an oracle written from the SPEC text, not from the code;
   *   (c) every EARLIER rung's guard is false — the ladder is disjoint, not
   *       merely ordered.
   */
  describe("property · exactly one label per point of the runtime domain", () => {
    const grid = [0, 0.01, 0.05, 0.1, 0.25, 0.34, 0.35, 0.36, 0.5, 0.69, 0.7, 0.71, 0.9, 1];
    const quantities = [
      absentMargin,
      ...grid.map((value) => measured(value))
    ] as const;
    const dispersions = [
      absentDispersion,
      ...grid.map((value) => measured(value))
    ] as const;

    /** The ladder, restated from goal lines 199-207. Independent of the code. */
    const oracleGuards = (point: {
      winner: number;
      margin: typeof quantities[number];
      disagreement: typeof dispersions[number];
    }): readonly boolean[] => [
      point.margin.kind === "ABSENT" || point.disagreement.kind === "ABSENT",
      point.winner < controls.lowCut,
      (point.margin.kind === "MEASURED" && point.margin.value <= controls.gamma)
        || (point.disagreement.kind === "MEASURED" && point.disagreement.value >= controls.disagreementThreshold),
      point.winner >= controls.highCut,
      true
    ];

    it("assigns exactly one label, at the first rung whose guard holds, everywhere", async () => {
      const { deriveVerdictLabel } = await serve();
      const seenLabels = new Set<string>();
      const seenRungs = new Set<number>();
      let points = 0;

      for (const winner of grid) {
        for (const margin of quantities) {
          for (const disagreement of dispersions) {
            const derivation = deriveVerdictLabel({ winner, margin, disagreement, controls });
            const guards = oracleGuards({ winner, margin, disagreement });
            const expectedRung = guards.findIndex(Boolean);

            expect(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).toContain(derivation.label);
            expect({ winner, margin, disagreement, rung: derivation.rung })
              .toEqual({ winner, margin, disagreement, rung: expectedRung });
            // Disjointness: no earlier rung could also have claimed this point.
            expect(guards.slice(0, expectedRung).some(Boolean)).toBe(false);
            // The mark rides rung 0 and only rung 0.
            expect(derivation.marks.length === 1).toBe(expectedRung === 0);

            seenLabels.add(derivation.label);
            seenRungs.add(derivation.rung);
            points += 1;
          }
        }
      }

      // The sweep is not vacuous: every rung and all three states are reached.
      expect(points).toBe(grid.length * quantities.length * dispersions.length);
      expect([...seenRungs].sort()).toEqual([0, 1, 2, 3, 4]);
      expect([...seenLabels].sort()).toEqual(["CONTESTED", "SUPPORTED", "UNSUPPORTED"]);
    });

    it("treats NaN as an invalid input, never as an absent one", async () => {
      const { deriveVerdictLabel } = await serve();

      expect(() => deriveVerdictLabel({
        winner: Number.NaN, margin: measured(0.4), disagreement: measured(0.1), controls
      })).toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_INPUT_INVALID" }));

      expect(() => deriveVerdictLabel({
        winner: 0.8, margin: measured(Number.NaN), disagreement: measured(0.1), controls
      })).toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_INPUT_INVALID" }));

      expect(() => deriveVerdictLabel({
        winner: 0.8, margin: measured(0.4), disagreement: measured(Number.NaN), controls
      })).toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_INPUT_INVALID" }));
    });

    it("refuses controls whose cuts are not ordered, instead of silently labelling", async () => {
      const { deriveVerdictLabel } = await serve();

      expect(() => deriveVerdictLabel({
        winner: 0.8,
        margin: measured(0.4),
        disagreement: measured(0.1),
        controls: { ...controls, lowCut: 0.8, highCut: 0.7 }
      })).toThrowError(expect.objectContaining({ code: "VERDICT_LABEL_CONTROLS_INVALID" }));
    });
  });

  describe("the mark is a canonical member of the ONE condition vocabulary", () => {
    it("mints LABEL-BASIS-INCOMPLETE in kernel and contract without disturbing the DR-176 tail", async () => {
      const [kernel, contract] = await Promise.all([
        import("@debateai/kernel"),
        import("@debateai/contract")
      ]);

      expect(kernel.CONDITION_MARKS).toContain("LABEL-BASIS-INCOMPLETE");
      expect(contract.ConditionMarkSchema.parse("LABEL-BASIS-INCOMPLETE")).toBe("LABEL-BASIS-INCOMPLETE");
      expect(kernel.CONDITION_MARKS.slice(-4)).toEqual([
        "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
      ]);
    });

    it("requires a typed persistence record whenever the answer carries the mark", async () => {
      const { assertRequiredConditionMarkRecords } = await serve();

      expect(() => assertRequiredConditionMarkRecords(["LABEL-BASIS-INCOMPLETE"], [])).toThrowError(
        expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" })
      );
    });
  });

  describe("live-UI vocabulary wiring (confirm-item 4)", () => {
    it("maps each engine label to the banner's own vocabulary", async () => {
      const { liveVerdictState } = await import("../../apps/ui/lib/v3/labels.js");

      expect(liveVerdictState("SUPPORTED")).toBe("endorsed");
      expect(liveVerdictState("CONTESTED")).toBe("endorsed_with_caveat");
      expect(liveVerdictState("UNSUPPORTED")).toBe("suppressed_no_evidence");
    });
  });
});
