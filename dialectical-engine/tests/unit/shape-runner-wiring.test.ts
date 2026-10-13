// Debate shape, plan Task 13 fix round 1: the runner's shape rules that are not whole-debate behaviour — the writer
// rule's maker bar (a backup or a moved call never writes as the maker a leg must avoid), a halted leg's planned count
// (only legs that can run), the re-claim exhausted-site check reading the shape's own root order, and a cross-reply
// with no recorded writer failing typed. Pure helpers are tested as functions; their wiring is pinned in the source.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildShapePlan, shapeLegCanRun, shapePositionsForTodaysOpening } from "../../apps/runner/src/shape-plan.js";
import { shapeMakerBar } from "../../apps/runner/src/shape-seats.js";

const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
const slice = (from: string, to: string): string => {
  const at = RUNNER.indexOf(from);
  expect(at, from).toBeGreaterThanOrEqual(0);
  const end = RUNNER.indexOf(to, at);
  expect(end, to).toBeGreaterThan(at);
  return RUNNER.slice(at, end);
};

describe("the writer rule bars the avoided maker for every member and every moved call (spec §3.3 step 3)", () => {
  it("bars exactly the named makers; with none named there is no rule (today's call)", () => {
    const bar = shapeMakerBar(["maker-a", undefined, ""]);
    expect(bar).toBeDefined();
    expect(bar!({ maker: "maker-a" })).toBe(false);
    expect(bar!({ maker: "maker-b" })).toBe(true);
    expect(shapeMakerBar([undefined, ""])).toBeUndefined();
    expect(shapeMakerBar([])).toBeUndefined();
  });

  it("is wired: the leg passes it, the seat plan reads it for main and backup, and a cheaper-maker move honours it", () => {
    const leg = slice("const argueLeg = async (", "const legChain = (");
    expect(leg).toContain("const makerBar = shapeLeg === null ? undefined : shapeMakerBar([answeredMakers[leg.parentIndex]]);");
    expect(leg).toContain("...(makerBar === undefined ? {} : { makerBar }),");
    const author = slice("const authorAndPanel = async (", "const childReduced = reduceAssessment({");
    expect(author).toContain("input.seat.role === \"POSITION\" ? positionRule(input.seat) : input.makerBar");
    expect(author).toContain("if (input.makerBar !== undefined) movedCallBars.set(seatBaseCallSiteKey(input.callSiteKey), input.makerBar);");
    const fallback = slice("const bodyGatewayFor = (", "onServed:");
    expect(fallback).toContain("const bar = movedCallBars.get(seatBaseCallSiteKey(request.callSiteKey));");
    expect(fallback).toContain("candidate.maker !== author && (bar === undefined || bar(candidate))");
  });
});

describe("a halted leg's planned count counts only the legs that can run", () => {
  const plan = buildShapePlan({ positions: shapePositionsForTodaysOpening({ answers: 2, pointsPerAnswer: 2 }), depth: 2,
    scrutiny: { roundsPerPoint: 1, pointsPerDebate: 1 } });
  const point = plan.legs.find((leg) => leg.kind === "POINT")!;
  const reply = plan.legs.find((leg) => leg.kind === "REPLY")!;
  const base = { deselected: false, adaptive: true, chosen: true, depth: 2 };

  it("a root or today's leg always counts; a deselected leg never does", () => {
    expect(shapeLegCanRun(null, { ...base, deselected: true })).toBe(true);
    expect(shapeLegCanRun(point, base)).toBe(true);
    expect(shapeLegCanRun(reply, { ...base, deselected: true })).toBe(false);
  });

  it("adaptive: a deeper leg counts only once the round-1 choice was made (and kept its chain)", () => {
    expect(shapeLegCanRun(reply, { ...base, chosen: false })).toBe(false);
    expect(shapeLegCanRun(reply, base)).toBe(true);
    // Fixed mode runs every chain; a scrutiny leg (round past the depth) is priced on its own.
    expect(shapeLegCanRun(reply, { ...base, adaptive: false, chosen: false })).toBe(true);
    expect(shapeLegCanRun({ ...reply, round: 3 }, { ...base, chosen: false })).toBe(true);
  });

  it("is wired into the leg's planned count and its halt record", () => {
    const leg = slice("const argueLeg = async (", "const legChain = (");
    expect(leg).toContain("const plannedLegCount = plannedSubtreeIndices.filter(legCanRun).length;");
    expect(leg).toContain("plannedLegCount,\n");
    expect(leg).toContain("const halted = { ...authored.record, plannedLegCount };");
  });
});

describe("re-claim and cross-reply checks read the shape's own roots", () => {
  it("the exhausted-site check at claim reads root 1's seat in the shape's root order", () => {
    const check = slice("const spentSites: { readonly row: SeatKeyRow }[] = [];", "for (const synthesis of [");
    expect(check).toContain("const seat = claimRootSeats[rootIndex];");
    expect(RUNNER).toContain("const claimRootSeats: readonly RunSeat[] = shapeRun === null ? seatBook.position : shapeSeatOrder(seatBook.position);");
  });

  it("a cross-reply with no recorded writer fails typed, as today's cross-exchange does", () => {
    const cross = slice("const argueShapeCross = async (", "const recorded = recordedSlotBySite.get(shapeLeg.callSiteKey);");
    expect(cross).toContain("throw new TypedDomainError(\"DEBATE_ROOT_MISSING\"");
    expect(cross).not.toContain("if (writer === undefined) return;");
  });
});
