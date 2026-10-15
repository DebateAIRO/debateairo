import { describe, expect, it } from "vitest";
import { shapeRankScrutiny, shapeSelectChains, type ScrutinyCandidate } from "../../apps/runner/src/shape-select.js";

describe("adaptive chains (spec §3.3 step 5)", () => {
  it("keeps the X chains per position with the highest root leverage; frozen and unscored chains never", () => {
    const leverage = new Map([[10, 0.2], [11, 0.4], [12, 0.1], [13, null], [20, 0.05], [21, 0.3]]);
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11, 12, 13]], [1, [20, 21]]]),
      leverageOf: (position) => leverage.get(position) ?? null, frozen: new Set([11]), perRoot: 2 });
    expect([...selected].sort()).toEqual([10, 12, 20, 21]);
  });
  it("breaks leverage ties by plan order", () => {
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [12, 10, 11]]]), leverageOf: () => 0.3, frozen: new Set(), perRoot: 1 });
    expect([...selected]).toEqual([10]);
  });
  // Amendment 2026-10-13 (final review note 5): the row allows deeperTopPoints (X) above the points a position has (K);
  // the choice is capped at the chains that exist, never padded (the ceiling then over-counts, the safe side).
  it("keeps at most the chains that exist when X is larger than K", () => {
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11]], [1, [20]]]), leverageOf: () => 0.2, frozen: new Set(), perRoot: 6 });
    expect([...selected].sort()).toEqual([10, 11, 20]);
  });
  // Controller note: adaptive mode stays inside the money ceiling only if each position keeps AT MOST perRoot chains.
  it("never keeps more than perRoot per root, when ties and frozen or unscored chains take the top places", () => {
    const leverage = new Map([[10, 0.9], [11, 0.3], [12, 0.3], [13, null], [14, 0.3], [20, 0.3], [21, 0.3], [22, 0.3]]);
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11, 12, 13, 14]], [1, [20, 21, 22]]]),
      leverageOf: (position) => leverage.get(position) ?? null, frozen: new Set([10]), perRoot: 2 });
    expect([...selected].sort()).toEqual([11, 12, 20, 21]);
  });
  it("keeps no chain for a root when perRoot is zero or negative", () => {
    for (const perRoot of [0, -1]) {
      const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11]]]), leverageOf: () => 0.3, frozen: new Set(), perRoot });
      expect([...selected]).toEqual([]);
    }
  });
});

describe("scrutiny needs (spec §3.3 step 7)", () => {
  const node = (position: number, extra: Partial<ScrutinyCandidate>): ScrutinyCandidate =>
    ({ position, rootIndex: 0, dispersion: 0.1, disputed: false, rootLeverage: 0.01, baseTau: 0.8, ...extra });
  it("ranks by number of needs, then leverage, then plan order; drops the needless; caps at the budget", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 3, candidates: [
      node(5, {}),                                                         // no need
      node(6, { dispersion: 0.3 }),                                         // 1 need
      node(7, { disputed: true, dispersion: 0.4 }),                         // 2 needs
      node(8, { rootLeverage: 0.2, baseTau: 0.3 }),                         // 1 need (weak and carrying), leverage 0.2
      node(9, { disputed: true }),                                          // 1 need, leverage 0.01
      node(10, { dispersion: 0.25, disputed: true, rootLeverage: 0.06, baseTau: 0.1 }) // 3 needs
    ] });
    expect(ranked.map((entry) => entry.position)).toEqual([10, 7, 8]);
  });
  it("a node without leverage can still be needy by spread or dispute", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 6,
      candidates: [node(3, { rootLeverage: null, dispersion: 0.5 }), node(4, { rootLeverage: null, baseTau: 0.1 })] });
    expect(ranked.map((entry) => entry.position)).toEqual([3]);
  });
  it("selects nothing when the budget is zero or negative", () => {
    for (const pointsPerDebate of [0, -1]) {
      const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate,
        candidates: [node(3, { dispersion: 0.5 }), node(4, { dispersion: 0.5 })] });
      expect(ranked).toEqual([]);
    }
  });
});
