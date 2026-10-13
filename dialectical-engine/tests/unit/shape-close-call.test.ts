import { describe, expect, it } from "vitest";
import {
  applyCorrelatedErrorDiscount, measureDispersion, runJudgePanel, selectReducedJudgement, type JudgementSelectionRule
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { panelSpendStop } from "../../apps/runner/src/index.js";
import { shapeCloseCallExtraSeats, shapeCloseCallFires, shapeCloseCallFold } from "../../apps/runner/src/shape-select.js";

const ROW = { rowKey: "test", registerVersion: 1, sourceRef: "test" };
const RULE = { kind: "MAXIMIZE_WEIGHTED_TAU", ...ROW } as JudgementSelectionRule;
type Voice = { ref: string; tau: number; family: string | null };
const reduce = (voices: readonly Voice[]) => {
  const weighted = applyCorrelatedErrorDiscount(voices.map((voice) => ({ memberRole: voice.ref, earnedWeight: 1,
    family: voice.family === null ? { kind: "UNKNOWN" as const, reason: "test" } : { kind: "KNOWN" as const, familyRef: voice.family } })),
  { repeatedFamilyMultiplier: 0.5, ...ROW });
  const selected = selectReducedJudgement(voices.map((voice, index) => ({ judgementRef: voice.ref, tau: voice.tau, effectiveWeight: weighted[index]!.effectiveWeight })), RULE);
  const spread = measureDispersion(voices.map((voice) => ({ judgementRef: voice.ref, tau: voice.tau })), { scale: 1, ...ROW });
  if (selected.kind !== "SELECTED") throw new Error("test");
  return { score: selected.selectionScore, spread: spread.kind === "MEASURED" ? spread.value : 0 };
};

describe("the close-call extension (spec §3.3 step 6; §6: the highest-voice rule is unchanged)", () => {
  it("fires only on a measured spread at or above the threshold, with extras allowed", () => {
    expect(shapeCloseCallFires(0.25, 0.25, 2)).toBe(true);
    expect(shapeCloseCallFires(0.24, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(null, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(0.9, 0.25, 0)).toBe(false);
  });

  it("calls up to E seats not yet called, of makers not on the panel and not the author's, rotating", () => {
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b", "c", "d", "e", "c"], called: [false, true, true, false, false, false],
      authorMaker: "a", onPanelMakers: ["b", "c"], extra: 2, offset: 4 })).toEqual([4, 3]);
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b"], called: [false, true], authorMaker: "a", onPanelMakers: ["b"], extra: 2, offset: 0 })).toEqual([]);
  });

  it("extra voices only RAISE the selected score or WIDEN the spread, never lower either (every order, every family mix)", () => {
    const taus = [0.1, 0.35, 0.6, 0.9];
    const families = [null, "f1", "f2"];
    for (let seed = 0; seed < 500; seed += 1) {
      const pick = <T,>(list: readonly T[], at: number): T => list[(seed * 7 + at * 13) % list.length]!;
      const base: Voice[] = [0, 1, 2].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at), family: pick(families, at + seed) }));
      const extras: Voice[] = [3, 4].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at + seed), family: pick(families, at) }));
      const before = reduce(base);
      const after = reduce([...base, ...extras]);
      expect(after.score, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.score);
      expect(after.spread, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.spread);
    }
  });

  // Pre-flight PF-B32 (law: always an answer). The extension is a SECOND panel run on the same node; on root 0 it must
  // treat a run-level spend stop exactly as root 0's base panel does (M2): keep every voice heard, hand the stop back,
  // so `rootZeroChain` records it and SAVES root 0. The runner-level proof (root 0 saved, the run answered) needs a
  // shaped run, which the runner refuses until Task 13; it is Task 15's case (Step 4 names it). Here: the extension's
  // outcome through the real panel, folded with the same helper and the same stop rule `runNodePanel` uses.
  it("a money stop on root 0's extension still saves root 0: the stop comes back with every voice already heard", async () => {
    const author = { judgementRef: "j0", assessment: {} as never, memberRole: "author" };
    const base = await runJudgePanel({ artifactProducerRef: "actor:author", primary: author, members: [
      { memberRole: "maker-b", actorRef: "actor:b", contractHash: "cb", judge: async () => ({ judgementRef: "j1", assessment: {} as never }) }] });
    const refused = { memberRole: "maker-c", actorRef: "actor:c", contractHash: "cc",
      judge: async (): Promise<never> => { throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "test: refused before sending"); } };
    // Root 0's panel (onSpendStop AUTHOR_ONLY) asks its extension to RETURN what it heard, as its base panel does.
    const extension = await runJudgePanel({ artifactProducerRef: "actor:author", primary: author, members: [refused],
      onRunLevelSpendStop: "RETURN_HEARD" });
    const folded = shapeCloseCallFold({ heard: base.judgements, notes: base.notes, extension,
      stopOf: (error) => panelSpendStop(error, "AUTHOR_ONLY") });
    expect(folded.spendStop).toBe("MONEY");
    expect(folded.added).toBe(0);
    expect(folded.heard.map((entry) => entry.judgementRef)).toEqual(["j0", "j1"]);
    // Every other node's panel (TRAVEL): the stop travels to the phase catch, exactly as the base panel's does.
    expect(() => shapeCloseCallFold({ heard: base.judgements, notes: base.notes, extension,
      stopOf: (error) => panelSpendStop(error, "TRAVEL") })).toThrow(TypedDomainError);
  });

  it("an extension that answered adds its voices AFTER every voice already heard, the author kept once", () => {
    const voice = (judgementRef: string) => ({ judgementRef });
    const folded = shapeCloseCallFold({ heard: [voice("j0"), voice("j1")], notes: ["n1"],
      extension: { judgements: [voice("j0"), voice("j2"), voice("j3")], notes: ["n2"] }, stopOf: () => "MONEY" as const });
    expect(folded).toEqual({ heard: [voice("j0"), voice("j1"), voice("j2"), voice("j3")], notes: ["n1", "n2"], added: 2, spendStop: null });
  });
});
