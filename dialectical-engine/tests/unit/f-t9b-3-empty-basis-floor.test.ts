import { describe, it, expect } from "vitest";
import { ENGINE_BAND_ORDER } from "@debateai/register";
import { deriveBandCeiling, type BandCeilingRegisterRow } from "@debateai/serve";
import { buildAcceptanceRegisterRows } from "../../acceptance/seed-register.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { parseAcceptanceRuntimeRows } from "../../acceptance/runtime-policy.js";

const FLOOR_BAND = ENGINE_BAND_ORDER[0]!;   // CAPPED
const TOP_BAND = ENGINE_BAND_ORDER[ENGINE_BAND_ORDER.length - 1]!;   // FULL
const EMPTY = { LOOKED_UP: 0, RAN: 0, REASONING: 0 } as const;

/**
 * F-T9B-3. On an empty basis `deriveBandCeiling` took the floor band from
 * `bandOrder[0]` and then SELECTED the row entry whose `ceilingBand` equalled
 * it. On the shipped row the only such entry is the reasoning-share cut, whose
 * trigger — `minimumShares: { REASONING: 0.5 }` — CANNOT have fired, because
 * the basis is empty and no share of anything reached 0.5. So a floored answer
 * carried a record naming a cause that did not occur.
 *
 * Every entry in `cuts` carries ONE label serving as both trigger and outcome,
 * so no selection over the existing entries can be truthful here. The row needs
 * an entry whose TRIGGER IS THE EMPTY BASIS ITSELF, which is what
 * `emptyBasisFloor` is.
 */
const row = (over: Partial<BandCeilingRegisterRow["value"]> = {}): BandCeilingRegisterRow => ({
  rowKey: "test-layer:wayOfKnowingCeiling",
  registerVersion: 1,
  sourceRef: "test-layer:F-T9B-3",
  value: {
    bandOrder: [...ENGINE_BAND_ORDER],
    ceilingLabels: ["TEST_DEFAULT_CEILING", "TEST_REASONING_CEILING", "TEST_EMPTY_BASIS_FLOOR"],
    defaultCeiling: { label: "TEST_DEFAULT_CEILING", ceilingBand: TOP_BAND, liftPath: "test:retain-band" },
    cuts: [{
      minimumShares: { REASONING: 0.5 },
      label: "TEST_REASONING_CEILING",
      ceilingBand: FLOOR_BAND,
      liftPath: "test:gather-evidence-to-lift"
    }],
    emptyBasisFloor: {
      label: "TEST_EMPTY_BASIS_FLOOR",
      ceilingBand: FLOOR_BAND,
      liftPath: "test:gather-any-evidence-to-lift"
    },
    ...over
  }
});

describe("F-T9B-3 · a floored band states its OWN reason", () => {
  it("describes an empty basis with the empty-basis entry, not with a share cut that never fired", () => {
    const decision = deriveBandCeiling({ candidateConfidenceBand: TOP_BAND, basis: EMPTY, row: row() });
    expect(decision.confidenceBand).toBe(FLOOR_BAND);
    expect(decision.kind).toBe("CAPPED");
    // The whole record, not just the band: the label and the lift path are the
    // half that was lying.
    expect(decision.ceiling.label).toBe("TEST_EMPTY_BASIS_FLOOR");
    expect(decision.ceiling.liftPath).toBe("test:gather-any-evidence-to-lift");
    expect(decision.ceiling.basis).toEqual(EMPTY);
    // The reasoning cut's trigger did not fire, so its name must not appear.
    expect(decision.ceiling.label).not.toBe("TEST_REASONING_CEILING");
  });

  it("FAILS CLOSED when the row describes no floor at all", () => {
    const undescribed = row();
    delete (undescribed.value as { emptyBasisFloor?: unknown }).emptyBasisFloor;
    expect(() => deriveBandCeiling({ candidateConfidenceBand: TOP_BAND, basis: EMPTY, row: undescribed }))
      .toThrowError(expect.objectContaining({ code: "BAND_CEILING_FLOOR_UNDESCRIBED" }));
  });

  it("REFUSES an empty-basis entry whose band is not the floor band", () => {
    expect(() => deriveBandCeiling({
      candidateConfidenceBand: TOP_BAND, basis: EMPTY,
      row: row({ emptyBasisFloor: { label: "TEST_EMPTY_BASIS_FLOOR", ceilingBand: TOP_BAND, liftPath: "test:x" } })
    })).toThrowError(expect.objectContaining({ code: "BAND_CEILING_FLOOR_BAND_INVALID" }));
  });

  it("REFUSES an empty-basis entry whose label is outside the sealed label vocabulary", () => {
    expect(() => deriveBandCeiling({
      candidateConfidenceBand: TOP_BAND, basis: EMPTY,
      row: row({ emptyBasisFloor: { label: "NOT_IN_VOCABULARY", ceilingBand: FLOOR_BAND, liftPath: "test:x" } })
    })).toThrowError(expect.objectContaining({ code: "BAND_CEILING_LABEL_UNKNOWN" }));
  });

  it("REFUSES an empty-basis entry with a blank lift path", () => {
    expect(() => deriveBandCeiling({
      candidateConfidenceBand: TOP_BAND, basis: EMPTY,
      row: row({ emptyBasisFloor: { label: "TEST_EMPTY_BASIS_FLOOR", ceilingBand: FLOOR_BAND, liftPath: "   " } })
    })).toThrowError(expect.objectContaining({ code: "BAND_CEILING_LIFT_PATH_INVALID" }));
  });

  it("is NOT_CAPPED when the candidate already sits at the floor", () => {
    const decision = deriveBandCeiling({ candidateConfidenceBand: FLOOR_BAND, basis: EMPTY, row: row() });
    expect(decision.kind).toBe("NOT_CAPPED");
    expect(decision.confidenceBand).toBe(FLOOR_BAND);
    expect(decision.ceiling.label).toBe("TEST_EMPTY_BASIS_FLOOR");
  });

  /**
   * The neighbouring behaviour this change must NOT disturb: with a NON-empty
   * basis the share cuts and `defaultCeiling` still govern, and the empty-basis
   * entry is ignored entirely.
   */
  describe("the non-empty path is untouched", () => {
    it("still takes the reasoning cut when the reasoning share fires", () => {
      const decision = deriveBandCeiling({
        candidateConfidenceBand: TOP_BAND, basis: { LOOKED_UP: 0, RAN: 0, REASONING: 4 }, row: row()
      });
      expect(decision.ceiling.label).toBe("TEST_REASONING_CEILING");
      expect(decision.confidenceBand).toBe(FLOOR_BAND);
    });

    it("still takes the default ceiling when no cut fires", () => {
      const decision = deriveBandCeiling({
        candidateConfidenceBand: TOP_BAND, basis: { LOOKED_UP: 4, RAN: 0, REASONING: 0 }, row: row()
      });
      expect(decision.ceiling.label).toBe("TEST_DEFAULT_CEILING");
      expect(decision.confidenceBand).toBe(TOP_BAND);
      expect(decision.kind).toBe("NOT_CAPPED");
    });
  });

  /** Both deployments carry the entry, and both schemas admit it. */
  describe("both sealed rows carry the entry", () => {
    const floorOf = (rows: ReadonlyArray<{ rowKey: string; value: unknown }>) => {
      const value = rows.find((r) => r.rowKey === "wayOfKnowingCeiling")?.value as {
        ceilingLabels: readonly string[];
        defaultCeiling: { label: string };
        cuts: readonly { label: string }[];
        emptyBasisFloor?: { label: string; ceilingBand: string; liftPath: string };
      };
      return value;
    };

    /**
     * THE PROPERTY, stated once and asserted for both deployments: the
     * empty-basis entry describes a decision whose TRIGGER IS THE EMPTY BASIS,
     * so it must not reuse the name of any SHARE-triggered cut, nor the
     * default's. Reusing one puts the ticket's defect straight back — a floored
     * record naming a trigger that did not fire — while every membership check
     * still passes, because the reused name IS in the vocabulary.
     *
     * Derived from the property, not from a mutant: an earlier version of this
     * block asserted `not.toBe("REASONING_CEILING")` on the acceptance row and
     * checked only vocabulary membership on the development one, and a mutant
     * relabelling the DEVELOPMENT entry `REASONING_CEILING` SURVIVED.
     */
    const pinTruthfulFloor = (value: ReturnType<typeof floorOf>): void => {
      expect(value.emptyBasisFloor).toBeDefined();
      expect(value.emptyBasisFloor!.ceilingBand).toBe(FLOOR_BAND);
      expect(value.ceilingLabels).toContain(value.emptyBasisFloor!.label);
      expect(value.cuts.map((cut) => cut.label)).not.toContain(value.emptyBasisFloor!.label);
      expect(value.emptyBasisFloor!.label).not.toBe(value.defaultCeiling.label);
      expect(value.emptyBasisFloor!.liftPath.trim()).not.toBe("");
    };

    it("the ACCEPTANCE row carries a truthful empty-basis floor", async () => {
      pinTruthfulFloor(floorOf(await buildAcceptanceRegisterRows()));
    });

    it("the DEVELOPMENT row carries a truthful empty-basis floor", async () => {
      pinTruthfulFloor(floorOf(await buildDevelopmentRunnerRegisterRows()));
    });

    it("the two deployments describe the floor the SAME way", async () => {
      const acceptance = floorOf(await buildAcceptanceRegisterRows());
      const development = floorOf(await buildDevelopmentRunnerRegisterRows());
      expect(development.emptyBasisFloor).toEqual(acceptance.emptyBasisFloor);
    });

    it("the ACCEPTANCE schema ADMITS the entry rather than rejecting it as unknown", async () => {
      const rows = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
      const parsed = parseAcceptanceRuntimeRows({
        riskTier: rows.riskTier,
        acceptanceOrganCostBounds: rows.acceptanceOrganCostBounds,
        panelDiscoveryPolicy: rows.panelDiscoveryPolicy,
        runDeathPolicy: rows.runDeathPolicy,
        hiddenNodeScoreThreshold: rows.hiddenNodeScoreThreshold,
        compositionBundleBudget: rows.compositionBundleBudget,
        wayOfKnowingCeiling: rows.wayOfKnowingCeiling,
        configuredProviderSet: rows.configuredProviderSet,
        judgeContractHash: rows.judgeContractHash,
        composerContractHash: rows.composerContractHash,
        conformanceContractHash: rows.conformanceContractHash,
        propagationContractHash: rows.propagationContractHash,
        serveContractHash: rows.serveContractHash
      });
      expect(parsed.wayOfKnowingCeiling.emptyBasisFloor?.ceilingBand).toBe(FLOOR_BAND);
    });

    it("the sealed row DERIVES a truthful floored record end to end", async () => {
      const rows = await buildAcceptanceRegisterRows();
      const value = rows.find((r) => r.rowKey === "wayOfKnowingCeiling")!.value as BandCeilingRegisterRow["value"];
      const decision = deriveBandCeiling({
        candidateConfidenceBand: TOP_BAND, basis: EMPTY,
        row: { rowKey: "wayOfKnowingCeiling", registerVersion: 2, sourceRef: "acceptance", value }
      });
      expect(decision.confidenceBand).toBe(FLOOR_BAND);
      expect(decision.ceiling.label).toBe(value.emptyBasisFloor!.label);
      expect(decision.ceiling.label).not.toBe("REASONING_CEILING");
    });
  });
});
