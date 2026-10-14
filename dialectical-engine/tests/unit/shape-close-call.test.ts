import { describe, expect, it } from "vitest";
import {
  applyCorrelatedErrorDiscount, Judge, measureDispersion, runJudgePanel, selectReducedJudgement, type JudgementSelectionRule
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderCallFailedError, type ProviderCallResult, type ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat } from "@debateai/scorecard";
import { buildAssignedRunSeatBook, createSeatCaller, type ConfiguredSeatMaker, type RouteHealth, type SeatMember } from "@debateai/runner";
import { panelSpendStop } from "../../apps/runner/src/index.js";
import {
  shapeCloseCallExtraSeats, shapeCloseCallFires, shapeCloseCallFold, shapeDistinctMakerOptions
} from "../../apps/runner/src/shape-select.js";

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

  // Final review M-4: the FULL product, not a seeded pick (whose extras were always 0.9 and 0.1): every base panel of
  // three voices (each tau, each family, in every order) × one or two extras (each tau, each family, in every order),
  // the extras heard after the base as the fold adds them.
  it("extra voices only RAISE the selected score or WIDEN the spread, never lower either (every order, every family mix)", () => {
    const taus = [0.1, 0.35, 0.6, 0.9];
    const families = [null, "f1", "f2"];
    const voices = taus.flatMap((tau) => families.map((family) => ({ tau, family })));
    const tuples = (length: number): (typeof voices)[] => length === 0 ? [[]]
      : tuples(length - 1).flatMap((head) => voices.map((voice) => [...head, voice]));
    const named = (from: number, list: typeof voices): Voice[] => list.map((voice, at) => ({ ref: `j${String(from + at)}`, ...voice }));
    const extraSets = [...tuples(1), ...tuples(2)];
    expect(extraSets).toHaveLength(12 + 144);
    const lowered: string[] = [];
    let compared = 0;
    for (const baseVoices of tuples(3)) {
      const base = named(0, baseVoices);
      const before = reduce(base);
      for (const extraVoices of extraSets) {
        const after = reduce([...base, ...named(3, extraVoices)]);
        compared += 1;
        if (after.score < before.score || after.spread < before.spread) {
          lowered.push(JSON.stringify({ base: baseVoices, extras: extraVoices, before, after }));
        }
      }
    }
    expect(compared).toBe(12 ** 3 * (12 + 144));
    expect(lowered.slice(0, 5)).toEqual([]);
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
    // Every other node's panel (TRAVEL): `runNodePanel` asks its extension to RETHROW (the mapping below is the
    // runner's), so the money stop leaves the extension's own panel run and travels to the phase catch, exactly as the
    // base panel's does — nothing is folded.
    const extensionRule = (onSpendStop: "AUTHOR_ONLY" | "TRAVEL") => onSpendStop === "TRAVEL" ? "RETHROW" as const : "RETURN_HEARD" as const;
    await expect(runJudgePanel({ artifactProducerRef: "actor:author", primary: author, members: [refused],
      onRunLevelSpendStop: extensionRule("TRAVEL") })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(extensionRule("AUTHOR_ONLY")).toBe("RETURN_HEARD");
    // And a returned stop the panel's rule does not classify (TRAVEL classifies none) is rethrown by the fold, as the
    // base panel rethrows one.
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

/**
 * Task 11 fix round 1 (the owner's ruling: graders from makers other than the author's; controller ruling T11-M). Two
 * JUDGE seats: seat 0's main is maker c with maker b as its backup only (share 0); seat 1's main is maker b. The
 * author is maker a. Real seat books and a real seat caller; only the provider calls are scripted.
 */
describe("a shaped panel seat's backup never repeats a maker already on the node", () => {
  const transportFailure = (): ProviderCallFailedError =>
    new ProviderCallFailedError(new Error("socket hang up"), 3, "FAILED", "ledger:failed");
  const gateway = (label: string): ProviderGateway => ({
    call: async (): Promise<ProviderCallResult> => ({ rawArtifactRef: `artifact:${label}`, ledgerEntryRef: `ledger:${label}`, content: "{}",
      provider: "openai-compatible-http", model: `model:${label}`, maker: `maker:${label}`, modelVersion: `model:${label}` })
  });
  const configured = (label: string): ConfiguredSeatMaker => {
    const provider = gateway(label);
    return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
  };
  const candidate = (label: string) => ({ candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`,
    modelId: `model:${label}`, thinkingLevel: "DEFAULT_ONLY" });
  const pinned = (seatIndex: number, main: string, runnerUp: string | null): RoleSeat =>
    ({ seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp), diversityShare: 0, source: "SCORECARD" });
  const judgeSeats = () => {
    const assignment: RoleAssignment = { scorecardVersion: 7, strength: "BALANCED", roles: {
      POSITION: [pinned(0, "a", null)], SUPPORT_ATTACK: [], CROSS_EXCHANGE: [],
      JUDGE: [pinned(0, "c", "b"), pinned(1, "b", null)], REVIEWER: [],
      ANSWER_WRITER: [pinned(0, "a", null)], ANSWER_CHECKER: [pinned(0, "b", null)] } };
    const routeHealth = new Map<string, RouteHealth>(["a", "b", "c"].map((label) => [`provider:${label}`, { state: "HEALTHY" }]));
    return buildAssignedRunSeatBook({ assignment, routeHealth,
      configured: new Map(["a", "b", "c"].map((label) => [`provider:${label}`, configured(label)])) }).book.judge;
  };
  // The runner's own panel options: only the author's maker is barred today.
  const panelOptions = Object.freeze({ eligible: (member: SeatMember) => member.maker !== "maker:a",
    fair: (member: { readonly maker: string }) => member.maker !== "maker:a" });
  const callSeat0 = async (options: typeof panelOptions) => {
    const calls: string[] = [];
    const seat = judgeSeats()[0]!;
    const answer = createSeatCaller({ assigned: true }).callSeat({ seat, callSiteKey: "PANEL:JUDGE:root0:r1:p1", ...options,
      keyFor: (member) => `PANEL:JUDGE:root0:r1:p1:${member.providerRef}`,
      call: async (member) => {
        calls.push(member.providerRef);
        if (member.maker === "maker:c") throw transportFailure();
        return `judged-by-${member.maker}`;
      } });
    return { answer: answer.then((value) => value.member.maker, (error: unknown) => error), calls };
  };

  it("an extra close-call seat whose main fails is NOT answered by a runner-up whose maker was already heard", async () => {
    // The extension's taken set: the author's maker, every maker heard or called (b), every other extra's (none here).
    const shaped = shapeDistinctMakerOptions(panelOptions, { ownMaker: "maker:c", taken: new Set(["maker:a", "maker:b"]) });
    const { answer, calls } = await callSeat0(shaped);
    expect(await answer).toBeInstanceOf(ProviderCallFailedError);
    expect(calls).toEqual(["provider:c"]);
  });

  it("a shaped BASE panel's J seat whose main fails is NOT answered by a runner-up whose maker another called seat holds", async () => {
    // Both seats are called (J = 2); seat 0's taken set is the author's maker and the called seats' makers (c, b).
    const calledMakers = judgeSeats().map((seat) => seat.main.maker);
    const shaped = shapeDistinctMakerOptions(panelOptions, { ownMaker: "maker:c", taken: new Set(["maker:a", ...calledMakers]) });
    const { answer, calls } = await callSeat0(shaped);
    expect(await answer).toBeInstanceOf(ProviderCallFailedError);
    expect(calls).toEqual(["provider:c"]);
    // A seat's OWN maker is never barred, even when another called seat holds the same maker.
    expect(shaped.eligible(judgeSeats()[0]!.main)).toBe(true);
  });

  it("today's (unshaped) panel is unchanged: the same options object, and the runner-up still answers", async () => {
    expect(shapeDistinctMakerOptions(panelOptions, null)).toBe(panelOptions);
    const { answer, calls } = await callSeat0(shapeDistinctMakerOptions(panelOptions, null));
    expect(await answer).toBe("maker:b");
    expect(calls).toEqual(["provider:c", "provider:b"]);
  });
});
