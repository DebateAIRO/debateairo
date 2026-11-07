import { describe, expect, it } from "vitest";
import {
  SERVED_ROOT_SELECTION_RULE_JUDGES,
  TypedDomainError,
  comparingJudgeCallSiteKey,
  debateRoleFromCallSiteKey,
  engineMaterialOf,
  type EngineDebateMaterial,
  type EngineMaterialSource
} from "@debateai/kernel";
import { engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import type { ComparingJudgeReply, ComparingJudgeSeat } from "@debateai/judgement";
import type { Pool } from "@debateai/db";
import type { EvaluationSnapshot } from "@debateai/propagation";
import {
  ServeRepository,
  buildFactBundle,
  verdictDerivationOfJudges,
  type PersistServeInput,
  type ServeGateResult
} from "@debateai/serve";
import {
  comparingJudgeCodeDefect,
  comparingJudgeVoteLettersStand,
  comparingJudgesSourceOf,
  runComparingJudges,
  storedVoteOnConflict,
  type ComparingJudgeAsked,
  type ComparingJudgeVoteRecord,
  type ComparingJudgesStepInput,
  type RecordedComparingJudgeVote
} from "../../apps/runner/src/engine-judging.js";
import { namedCodeDefect } from "../../apps/runner/src/engine-investigations.js";
import {
  bodyCallMayMove,
  catchUpFloorWouldMove,
  decideMakerPositionServe,
  floorDecidedByJudges,
  pointInvestigationFailureOutcome,
  providerCallCostEnvelopePhase,
  rederiveCatchUpFloor,
  runnerTerminalFailureReason
} from "../../apps/runner/src/index.js";

/**
 * Engine redesign R2b, Task B5 (spec 2026-10-15 §4.3, §4.7): the judging step asks the seated judges at once, counts their
 * votes, records each vote once, discloses a missing, unavailable or ignored judge, and never fails the debate; a vote an
 * earlier copy of the run recorded is reused, never asked again (reclaim resume, PR #171).
 */
const ROOT = Object.freeze({ A: "00000000-0000-4000-8000-0000000000a1", B: "00000000-0000-4000-8000-0000000000b1",
  C: "00000000-0000-4000-8000-0000000000c1" });
const answer = (letter: "A" | "B" | "C", rootNodeId: string) => Object.freeze({
  letter, rootNodeId, words: `Answer ${letter}.`, caseText: null, supports: Object.freeze([]), objections: Object.freeze([]),
  assumptions: Object.freeze([])
});
const MATERIAL: EngineDebateMaterial = Object.freeze({
  question: "Should the city build a new tram line?",
  answers: Object.freeze([answer("A", ROOT.A), answer("B", ROOT.B), answer("C", ROOT.C)]),
  disputed: Object.freeze([])
});
const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 4, mapOpening: false });
const CANDIDATES = Object.freeze([
  { maker: "anthropic", providerRef: "haiku", modelId: "claude-haiku-5-5" },
  { maker: "xiaomi", providerRef: "mimo", modelId: "mimo-v3" },
  { maker: "deepseek", providerRef: "ds", modelId: "deepseek-v4.1" },
  { maker: "zhipu", providerRef: "glm", modelId: "glm-5.1" }
]);
const reply = (best: "A" | "B" | "C", conditional = false): ComparingJudgeReply => Object.freeze({
  best, conditional, sameAs: Object.freeze([]), reasons: `Because ${best} held up best.`, questionKind: "general"
});
const asked = (seat: ComparingJudgeSeat, best: "A" | "B" | "C", conditional = false): ComparingJudgeAsked => Object.freeze({
  reply: reply(best, conditional), rawArtifactRef: `artifact-${String(seat.seat)}`, maker: seat.maker,
  providerRef: seat.providerRef,
  modelId: CANDIDATES.find((candidate) => candidate.providerRef === seat.providerRef)?.modelId ?? `${seat.providerRef}-model`
});

function step(over: Partial<ComparingJudgesStepInput> & Readonly<{ answers?: Readonly<Record<string, "A" | "B" | "C" | Error>> }> = {}) {
  const records: ComparingJudgeVoteRecord[] = [];
  const asks: ComparingJudgeSeat[] = [];
  const answers = over.answers ?? { haiku: "A", mimo: "A", ds: "A" };
  const input: ComparingJudgesStepInput = {
    engine: ENGINE,
    material: MATERIAL,
    arguedByMaker: new Map([[ROOT.A, "deepseek"], [ROOT.B, "zhipu"], [ROOT.C, "moonshot"]]),
    honestFinalStrength: new Map([[ROOT.A, 0.5], [ROOT.B, 0.6], [ROOT.C, 0.4]]),
    candidates: CANDIDATES,
    rotationOffset: 0,
    moneyStopped: false,
    recorded: [],
    ask: async (seat) => {
      asks.push(seat);
      const scripted = answers[seat.providerRef];
      if (scripted === undefined) throw new TypedDomainError("TEST_SEAT_UNSCRIPTED", seat.providerRef);
      if (scripted instanceof Error) throw scripted;
      return asked(seat, scripted);
    },
    record: async (vote) => { records.push(vote); },
    ...over
  };
  return { run: () => runComparingJudges(input), records, asks };
}

describe("the judging step", () => {
  it("asks the three seated judges at once, counts, and records each vote once in seat order", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started: string[] = [];
    const { run, records } = step({
      ask: async (seat) => { started.push(seat.providerRef); await gate; return asked(seat, "A"); }
    });
    const pending = run();
    await Promise.resolve();
    expect(started).toEqual(["haiku", "mimo", "ds"]);
    release();
    const result = await pending;
    expect(result.seats.map((seat) => [seat.seat, seat.providerRef, seat.argued])).toEqual([[1, "haiku", false],
      [2, "mimo", false], [3, "ds", true]]);
    expect(result.verdict).toMatchObject({ winnerRootNodeId: ROOT.A, label: "CONTESTED", trigger: "JUDGES_MAJORITY",
      winnerVotes: 2, marks: [] });
    expect(result.records).toEqual([]);
    expect(result).toMatchObject({ unavailable: null, asked: 3, reused: 0 });
    expect(records.map((vote) => [vote.judgeSeat, vote.chosenLetter, vote.chosenRootNodeId, vote.counted, vote.notCountedReason]))
      .toEqual([[1, "A", ROOT.A, true, null], [2, "A", ROOT.A, true, null], [3, "A", ROOT.A, false, "OWN_MAKER"]]);
    expect(records[0]).toMatchObject({ maker: "anthropic", providerRef: "haiku", modelId: "claude-haiku-5-5",
      rawArtifactRef: "artifact-1", conditional: false, questionKind: "general", sameAs: [], reasons: "Because A held up best." });
    expect(result.ballots).toEqual([{ seat: 1, letter: "A", counted: true }, { seat: 2, letter: "A", counted: true },
      { seat: 3, letter: "A", counted: false }]);
  });

  it("hands the writer's verdict block on: label, winner, conditional, and only the counted judges' reasons", async () => {
    const { run } = step({ ask: async (seat) => asked(seat, "A", seat.seat === 2) });
    const { verdictMaterial } = await run();
    expect(verdictMaterial.verdict).toEqual({ label: "CONTESTED", winner: "A", conditional: true, judgesReasons: [
      { chose: "A", reasons: "Because A held up best." }, { chose: "A", reasons: "Because A held up best." }] });
    expect(JSON.stringify(verdictMaterial.verdict)).not.toMatch(/anthropic|xiaomi|deepseek|haiku|mimo/u);
  });

  it("records a failed judge with no letter, counts it as missing, and goes on (VERDICT-JUDGE-MISSING)", async () => {
    const { run, records } = step({ answers: { haiku: "A", mimo: new TypedDomainError("COMPARING_JUDGE_REPLY_REFUSED", "x"), ds: "B" } });
    const result = await run();
    expect(records[1]).toEqual({ judgeSeat: 2, maker: "xiaomi", providerRef: "mimo", modelId: "mimo-v3", rawArtifactRef: null,
      chosenLetter: null, chosenRootNodeId: null, conditional: null, counted: false, notCountedReason: "JUDGE_FAILED",
      questionKind: null, sameAs: [], reasons: null });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
    expect(result.records).toEqual([{ mark: "VERDICT-JUDGE-MISSING", scope: "answer", subjectRef: result.verdict.winnerRootNodeId,
      reason: "VERDICT_JUDGE_MISSING:1", liftPath: null, servedRootRule: null, affectedNodeIds: [result.verdict.winnerRootNodeId] }]);
  });

  // pre-flight PF-R2b3.8: a reply B1's reader accepted but the count refused (here an invalid `same_as` group) is a
  // failed judge on the row too: 0121's verdict_vote_reply_whole and A10's write check refuse a letter beside JUDGE_FAILED.
  it("records a reply the count refused as a failure: no letter, no root, no groups (0121 verdict_vote_reply_whole)", async () => {
    const { run, records } = step({ ask: async (seat) => seat.seat !== 2 ? asked(seat, "A") : Object.freeze({ ...asked(seat, "A"),
      reply: Object.freeze({ ...reply("A"), sameAs: Object.freeze([Object.freeze(["A", "A"] as const)]) }) }) });
    const result = await run();
    expect(records[1]).toMatchObject({ judgeSeat: 2, rawArtifactRef: "artifact-2", chosenLetter: null, chosenRootNodeId: null,
      conditional: null, questionKind: null, sameAs: [], reasons: null, counted: false, notCountedReason: "JUDGE_FAILED" });
    expect(result.ballots[1]).toEqual({ seat: 2, letter: null, counted: false });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
  });

  // pre-flight PF-R2b3.9: a stopped call lane ends this copy as A14's investigations treat it, never a JUDGE_FAILED row.
  it.each(["RUNNER_CLAIM_LOST", "CALL_LANE_STOPPED"] as const)("lets %s leave as it came, recording nothing", async (code) => {
    const { run, records } = step({ answers: { haiku: "A", mimo: new TypedDomainError(code, "x"), ds: "A" } });
    await expect(run()).rejects.toMatchObject({ code });
    expect(records).toEqual([]);
  });

  it.each([
    ["a money stop before judging", { moneyStopped: true }, "MONEY_STOP"],
    ["a single servable answer", { material: { ...MATERIAL, answers: MATERIAL.answers.slice(0, 1) } }, "ONE_ANSWER"],
    ["one maker argued every answer", { arguedByMaker: new Map([[ROOT.A, "zhipu"], [ROOT.B, "zhipu"], [ROOT.C, "zhipu"]]),
      candidates: [{ maker: "zhipu", providerRef: "glm", modelId: "glm-5.1" }] }, "NO_JUDGE_SEAT"]
  ] as const)("asks no judge on %s: winner by honest strength, at most Close call", async (_, over, cause) => {
    const { run, asks, records } = step(over as Partial<ComparingJudgesStepInput>);
    const result = await run();
    expect(asks).toEqual([]);
    expect(records).toEqual([]);
    expect(result.unavailable).toBe(cause);
    expect(result.verdict).toMatchObject({ label: "CONTESTED", trigger: "JUDGES_UNAVAILABLE", judgesSeated: 0 });
    expect(result.records).toEqual([expect.objectContaining({ mark: "VERDICT-JUDGES-UNAVAILABLE",
      reason: `VERDICT_JUDGES_UNAVAILABLE:${cause}` })]);
  });

  // pre-flight PF-R2b2.5, pre-flight consistency R2b: with one servable answer B2 counts no vote, so recorded seats from
  // an earlier copy never turn ONE_ANSWER into ALL_JUDGES_FAILED.
  it("names ONE_ANSWER for a single servable answer even when an earlier copy recorded seats", async () => {
    const recordedRow: RecordedComparingJudgeVote = Object.freeze({ judgeSeat: 1, maker: "anthropic", providerRef: "haiku",
      modelId: "m", rawArtifactRef: "artifact-1", chosenLetter: "A", conditional: false, sameAs: Object.freeze([]),
      questionKind: "general", reasons: "Because A held up best." });
    const { run, asks, records } = step({ material: { ...MATERIAL, answers: MATERIAL.answers.slice(0, 1) },
      recorded: [recordedRow] });
    const result = await run();
    expect(asks).toEqual([]);
    expect(records).toEqual([]);
    expect(result.unavailable).toBe("ONE_ANSWER");
    expect(result.verdict).toMatchObject({ trigger: "JUDGES_UNAVAILABLE", winnerVotes: 0, marks: ["VERDICT-JUDGES-UNAVAILABLE"] });
    // never recorded: 0121 verdict_vote_counted_or_why
    expect(result.verdict.counted).toEqual([{ seat: 1, counted: false, notCountedReason: null }]);
    expect(result.records).toEqual([expect.objectContaining({ mark: "VERDICT-JUDGES-UNAVAILABLE",
      reason: "VERDICT_JUDGES_UNAVAILABLE:ONE_ANSWER" })]);
  });

  it("names every judge failing ALL_JUDGES_FAILED, with each failure recorded", async () => {
    const failure = new TypedDomainError("PROVIDER_CALL_FAILED", "x");
    const { run, records } = step({ answers: { haiku: failure, mimo: failure, ds: failure } });
    const result = await run();
    expect(result.unavailable).toBe("ALL_JUDGES_FAILED");
    expect(result.verdict).toMatchObject({ winnerRootNodeId: ROOT.B, trigger: "JUDGES_UNAVAILABLE", judgesSeated: 3 });
    expect(records.map((vote) => vote.notCountedReason)).toEqual(["JUDGE_FAILED", "JUDGE_FAILED", "JUDGE_FAILED"]);
  });

  it("discloses votes all cast for the judge's own maker (VERDICT-VOTES-IGNORED)", async () => {
    const { run } = step({
      candidates: [{ maker: "deepseek", providerRef: "ds", modelId: "deepseek-v4.1" },
        { maker: "zhipu", providerRef: "glm", modelId: "glm-5.1" }],
      answers: { ds: "A", glm: "B" }
    });
    const result = await run();
    expect(result.verdict).toMatchObject({ label: "SPLIT", trigger: "JUDGES_VOTES_IGNORED", winnerRootNodeId: ROOT.B });
    expect(result.records).toEqual([expect.objectContaining({ mark: "VERDICT-VOTES-IGNORED", reason: "VERDICT_VOTES_IGNORED:2" })]);
  });

  // Owner ruling 2026-10-29 (MORNING-2026-10-17 item 6, "prefer neutral judges"): a judge seat whose planned member argued
  // an answer is judged by its other member when that member's maker argued none; the vote then counts, and Clear answer
  // is reachable. Same three judges, same three calls.
  it("asks a seat's other member when its maker argued no answer, so all three votes count (Clear answer)", async () => {
    const { run, asks, records } = step({
      candidates: [CANDIDATES[0]!, CANDIDATES[1]!,
        { ...CANDIDATES[2]!, alternate: { maker: "qwen", providerRef: "qw", modelId: "qwen-4" } }],
      answers: { haiku: "A", mimo: "A", qw: "A" }
    });
    const result = await run();
    expect(asks.map((seat) => [seat.seat, seat.providerRef, seat.argued])).toEqual([[1, "haiku", false], [2, "mimo", false],
      [3, "qw", false]]);
    expect(result.verdict).toMatchObject({ winnerRootNodeId: ROOT.A, label: "SUPPORTED", trigger: "JUDGES_UNANIMOUS", winnerVotes: 3 });
    expect(records.map((vote) => [vote.judgeSeat, vote.maker, vote.providerRef, vote.counted]))
      .toEqual([[1, "anthropic", "haiku", true], [2, "xiaomi", "mimo", true], [3, "qwen", "qw", true]]);
  });

  it("names a failed other member's model from its own candidate entry", async () => {
    const { run, records } = step({
      candidates: [CANDIDATES[0]!, CANDIDATES[1]!,
        { ...CANDIDATES[2]!, alternate: { maker: "qwen", providerRef: "qw", modelId: "qwen-4" } }],
      answers: { haiku: "A", mimo: "A", qw: new TypedDomainError("PROVIDER_CALL_FAILED", "x") }
    });
    await run();
    expect(records[2]).toMatchObject({ judgeSeat: 3, maker: "qwen", providerRef: "qw", modelId: "qwen-4", notCountedReason: "JUDGE_FAILED" });
  });
});

describe("reclaim resume: a recorded vote is never asked again", () => {
  const row = (judgeSeat: number, maker: string, providerRef: string, chosenLetter: "A" | null): RecordedComparingJudgeVote =>
    Object.freeze({ judgeSeat, maker, providerRef, modelId: "m", rawArtifactRef: chosenLetter === null ? null : `artifact-${String(judgeSeat)}`,
      chosenLetter, conditional: chosenLetter === null ? null : false, sameAs: Object.freeze([]),
      questionKind: chosenLetter === null ? null : "general", reasons: chosenLetter === null ? null : "Because A held up best." });

  it("reuses every recorded seat, asks none and records none, and reaches the same verdict", async () => {
    const fresh = await step().run();
    const { run, asks, records } = step({ recorded: [row(1, "anthropic", "haiku", "A"), row(2, "xiaomi", "mimo", "A"),
      row(3, "deepseek", "ds", "A")] });
    const resumed = await run();
    expect(asks).toEqual([]);
    expect(records).toEqual([]);
    expect(resumed.verdict).toEqual(fresh.verdict);
    expect(resumed).toMatchObject({ asked: 0, reused: 3 });
  });

  // Ruling W2 (R2b whole-branch review M1, spec §4.3): never two judges of one maker. The earlier copy's pick order
  // differed (it seated DeepSeek at seat 1); this pass's pick gives DeepSeek seat 3 again.
  describe("never two judges of one maker (ruling W2)", () => {
    it("gives the clashing seat to the next eligible maker no seat holds", async () => {
      const { run, asks, records } = step({ recorded: [row(1, "deepseek", "ds", "A")], answers: { mimo: "A", haiku: "A" } });
      const result = await run();
      expect(asks.map((seat) => [seat.seat, seat.maker])).toEqual([[2, "xiaomi"], [3, "anthropic"]]);
      expect(result.seats.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "deepseek"], [2, "xiaomi"], [3, "anthropic"]]);
      expect(records.map((vote) => [vote.judgeSeat, vote.maker])).toEqual([[2, "xiaomi"], [3, "anthropic"]]);
      expect(result).toMatchObject({ asked: 2, reused: 1 });
    });

    // Owner ruling 2026-10-29: a seat's other member already holding a recorded seat never sits twice; the clashing seat
    // goes to the next neutral maker no seat holds.
    it("never seats a seat's other member twice when an earlier copy recorded its maker", async () => {
      const { run, asks } = step({
        candidates: [CANDIDATES[0]!, CANDIDATES[1]!,
          { ...CANDIDATES[2]!, alternate: { maker: "qwen", providerRef: "qw", modelId: "qwen-4" } }],
        recorded: [row(1, "qwen", "qw", "A")],
        answers: { mimo: "A", haiku: "A" }
      });
      const result = await run();
      expect(result.seats.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "qwen"], [2, "xiaomi"], [3, "anthropic"]]);
      expect(asks.map((seat) => [seat.seat, seat.providerRef])).toEqual([[2, "mimo"], [3, "haiku"]]);
    });

    it("prefers a maker the recorded seat displaced, then leaves the seat unfilled when no maker is left", async () => {
      const two = [CANDIDATES[1]!, CANDIDATES[2]!];
      // Seat 2 recorded for xiaomi; this pass would seat xiaomi at 1 and deepseek at 2: deepseek takes seat 1.
      const displaced = step({ candidates: two, recorded: [row(2, "xiaomi", "mimo", "A")], answers: { ds: "A" } });
      expect((await displaced.run()).seats.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "deepseek"], [2, "xiaomi"]]);
      expect(displaced.asks.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "deepseek"]]);
      // Only xiaomi is a candidate, and it already holds seat 2: seat 1 stays unfilled, nobody is asked.
      const none = step({ candidates: [CANDIDATES[1]!], recorded: [row(2, "xiaomi", "mimo", "A")] });
      const result = await none.run();
      expect(none.asks).toEqual([]);
      expect(result.seats.map((seat) => [seat.seat, seat.maker])).toEqual([[2, "xiaomi"]]);
      expect(result.verdict.judgesSeated).toBe(1);
    });

    it("neither counts nor writes a seat whose maker another copy's row took at another seat meanwhile", async () => {
      // Another copy stored seat 4 for xiaomi while this copy asked xiaomi at seat 2.
      const theirs = Object.freeze({ ...row(4, "xiaomi", "mimo", "A"), modelId: "mimo-v3" });
      const { run, records } = step({ readRecorded: async () => [theirs] });
      const result = await run();
      expect(records.map((vote) => [vote.judgeSeat, vote.maker])).toEqual([[1, "anthropic"], [3, "deepseek"]]);
      expect(result.seats.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "anthropic"], [3, "deepseek"], [4, "xiaomi"]]);
      expect(new Set(result.seats.map((seat) => seat.maker)).size).toBe(3);
      expect(result).toMatchObject({ asked: 3, reused: 1 });
    });

    /*
     * R3 final wave O2 (R2b review N2, ruling index b): two copies after a mid-judging reclaim can each STORE a vote by one
     * maker at different seats. The earliest stored seat of a maker is its vote; a later one is not counted
     * (MAKER_SEATED_EARLIER), so the count never refuses the resumed debate and never counts one maker twice.
     */
    it("counts only the earliest stored seat of a maker; a later stored seat of it is not counted, and the verdict derives", async () => {
      const { run, asks, records } = step({ recorded: [row(1, "anthropic", "haiku", "A"), row(2, "xiaomi", "mimo", "A"),
        row(3, "anthropic", "haiku", "A")] });
      const result = await run();
      expect(asks).toEqual([]);
      expect(records).toEqual([]);
      expect(result.verdict).toMatchObject({ winnerRootNodeId: ROOT.A, judgesSeated: 2, judgesAnswered: 2, winnerVotes: 2 });
      expect(result.verdict.counted.map((entry) => entry.seat)).toEqual([1, 2]);
      expect(result.setAside).toEqual([{ seat: 3, maker: "anthropic", reason: "MAKER_SEATED_EARLIER" }]);
      expect(result.ballots).toEqual([{ seat: 1, letter: "A", counted: true }, { seat: 2, letter: "A", counted: true },
        { seat: 3, letter: "A", counted: false }]);
      expect(result).toMatchObject({ asked: 0, reused: 3 });
    });

    it("sets aside a later seat of a maker another copy stored meanwhile, and writes only this copy's other seats", async () => {
      // This copy reuses seat 1 (anthropic); another copy stored seat 3 for anthropic too while this copy asked 2 and 3.
      const theirs = Object.freeze({ ...row(3, "anthropic", "haiku", "A"), modelId: "claude-haiku-5-5" });
      const { run, records } = step({ recorded: [row(1, "anthropic", "haiku", "A")],
        readRecorded: async () => [row(1, "anthropic", "haiku", "A"), theirs] });
      const result = await run();
      expect(records.map((vote) => [vote.judgeSeat, vote.maker, vote.counted])).toEqual([[2, "xiaomi", true]]);
      expect(result.verdict.counted.map((entry) => entry.seat)).toEqual([1, 2]);
      expect(result.setAside).toEqual([{ seat: 3, maker: "anthropic", reason: "MAKER_SEATED_EARLIER" }]);
      // A first pass sets nothing aside.
      expect((await step().run()).setAside).toEqual([]);
    });
  });

  it("asks only the seats with no recorded vote, and reuses a recorded failure as a failure", async () => {
    const { run, asks, records } = step({ recorded: [row(1, "anthropic", "haiku", null)] });
    const result = await run();
    expect(asks.map((seat) => seat.seat)).toEqual([2, 3]);
    expect(records.map((vote) => vote.judgeSeat)).toEqual([2, 3]);
    expect(result.verdict.counted[0]).toEqual({ seat: 1, counted: false, notCountedReason: "JUDGE_FAILED" });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
  });
});

/*
 * Controller carries for B5 (the R2b controller's dispatch): the stored row decides on ALREADY_PRESENT (6), every letter
 * is the debate's own before a write (5), a code defect fails the debate while a failed reply or a money refusal never
 * does (10, 11), and the judges' calls are JUDGE calls on the arguing's (BODY) money that never move maker (4, 11).
 */
describe("the controller's carries on the judging step", () => {
  it("lets the STORED row decide when another write recorded the seat first (ALREADY_PRESENT)", async () => {
    // This copy's judges say A, A, A; the rows stored first for seats 1 and 2 say B (makers that argued nothing).
    const storedB = (judgeSeat: number, maker: string, providerRef: string): RecordedComparingJudgeVote => Object.freeze({
      judgeSeat, maker, providerRef, modelId: "stored-model", rawArtifactRef: `stored-${String(judgeSeat)}`, chosenLetter: "B",
      conditional: false, sameAs: Object.freeze([]), questionKind: "factual", reasons: "Because B held up best." });
    const records: ComparingJudgeVoteRecord[] = [];
    const { run } = step({
      record: async (vote) => {
        records.push(vote);
        return vote.judgeSeat === 1 ? storedB(1, "anthropic", "haiku") : vote.judgeSeat === 2 ? storedB(2, "xiaomi", "mimo") : null;
      }
    });
    const result = await run();
    // Every fresh vote was offered once; the count, the ballots and the writer's block read the stored rows.
    expect(records.map((vote) => [vote.judgeSeat, vote.chosenLetter])).toEqual([[1, "A"], [2, "A"], [3, "A"]]);
    expect(result.verdict).toMatchObject({ winnerRootNodeId: ROOT.B, winnerVotes: 2, label: "CONTESTED", trigger: "JUDGES_MAJORITY" });
    expect(result.verdict.questionKinds).toEqual(["factual", "factual", "general"]);
    expect(result.ballots).toEqual([{ seat: 1, letter: "B", counted: true }, { seat: 2, letter: "B", counted: true },
      { seat: 3, letter: "A", counted: false }]);
    expect(result.verdictMaterial.verdict).toMatchObject({ winner: "B", judgesReasons: [
      { chose: "B", reasons: "Because B held up best." }, { chose: "B", reasons: "Because B held up best." }] });
    expect(result).toMatchObject({ asked: 3, reused: 0 });
  });

  it("refuses a stored row handed back for another seat as a code defect", async () => {
    const { run } = step({ record: async (vote) => Object.freeze({ ...vote, judgeSeat: vote.judgeSeat + 1 }) });
    await expect(run()).rejects.toThrowError(new TypeError("COMPARING_JUDGE_STORED_SEAT_MISMATCH"));
  });

  // Controller ruling R2b-B5.1 (B5 fix 1, Important 2): one seat's `counted` depends on the other seats' groups, so a fresh
  // row is written from the FINAL tally, the stored rows of the other seats included.
  describe("a fresh row's counted is the final tally's", () => {
    const grouped = (seat: ComparingJudgeSeat, best: "A" | "B"): ComparingJudgeAsked => Object.freeze({ ...asked(seat, best),
      reply: Object.freeze({ ...reply(best), sameAs: Object.freeze([Object.freeze(["A", "B"] as const)]) }) });
    // Seat 1 groups A with B; seat 3 (DeepSeek, which argued A) votes B. Alone, nobody else names the pair, so seat 3 counts.
    const ask = async (seat: ComparingJudgeSeat): Promise<ComparingJudgeAsked> =>
      seat.seat === 1 ? grouped(seat, "A") : seat.seat === 2 ? asked(seat, "A") : asked(seat, "B");
    // Another copy stored seat 2 meanwhile: A, with the same pair, so a majority names {A, B} and seat 3's B is its own maker's.
    const storedSeat2: RecordedComparingJudgeVote = Object.freeze({ judgeSeat: 2, maker: "xiaomi", providerRef: "mimo",
      modelId: "mimo-v3", rawArtifactRef: "stored-2", chosenLetter: "A", conditional: false,
      sameAs: Object.freeze([Object.freeze(["A", "B"] as const)]), questionKind: "general", reasons: "Because A held up best." });
    const seat3Of = (records: readonly ComparingJudgeVoteRecord[]) => records.find((vote) => vote.judgeSeat === 3);

    it("counts seat 3 when no other row names the pair (the control)", async () => {
      const { run, records } = step({ ask });
      await run();
      expect(seat3Of(records)).toMatchObject({ chosenLetter: "B", counted: true, notCountedReason: null });
    });

    it("reads the rows again before writing, and writes seat 3 as its own maker's vote", async () => {
      const { run, records } = step({ ask, readRecorded: async () => [storedSeat2] });
      const result = await run();
      expect(records.map((vote) => vote.judgeSeat)).toEqual([1, 3]);
      expect(seat3Of(records)).toMatchObject({ chosenLetter: "B", counted: false, notCountedReason: "OWN_MAKER" });
      expect(result.verdict.counted[2]).toEqual({ seat: 3, counted: false, notCountedReason: "OWN_MAKER" });
      expect(result.verdict.groups).toEqual([["A", "B"]]);
    });

    it("recounts after an ALREADY_PRESENT, so the seats written after it carry the final tally", async () => {
      const records: ComparingJudgeVoteRecord[] = [];
      const { run } = step({ ask, record: async (vote) => { records.push(vote); return vote.judgeSeat === 2 ? storedSeat2 : null; } });
      const result = await run();
      expect(records.map((vote) => vote.judgeSeat)).toEqual([1, 2, 3]);
      expect(seat3Of(records)).toMatchObject({ counted: false, notCountedReason: "OWN_MAKER" });
      expect(result.verdict.counted[2]).toEqual({ seat: 3, counted: false, notCountedReason: "OWN_MAKER" });
    });

    // Rows are immutable: a row an earlier copy wrote keeps ITS counted value. The step never reads that column (the
    // recorded vote type has none); readers recount through deriveJudgesVerdict from the letters, groups and makers.
    // R2b final wave P5 (B5 re-review Minor 2): a re-read row for a seat this copy did not pick is the seat's vote: it is
    // counted and reused, never written again, and this copy's own seats are still asked and written.
    it("counts a re-read row for a seat this copy did not pick, as reused", async () => {
      const theirs: RecordedComparingJudgeVote = Object.freeze({ judgeSeat: 4, maker: "zhipu", providerRef: "glm",
        modelId: "glm-5.1", rawArtifactRef: "stored-4", chosenLetter: "C", conditional: false, sameAs: Object.freeze([]),
        questionKind: "general", reasons: "Because C held up best." });
      const { run, records, asks } = step({ readRecorded: async () => [theirs] });
      const result = await run();
      expect(asks.map((seat) => seat.seat)).toEqual([1, 2, 3]);
      expect(records.map((vote) => vote.judgeSeat)).toEqual([1, 2, 3]);
      expect(result.seats.map((seat) => [seat.seat, seat.maker])).toEqual([[1, "anthropic"], [2, "xiaomi"], [3, "deepseek"], [4, "zhipu"]]);
      expect(result.verdict).toMatchObject({ judgesSeated: 4, winnerRootNodeId: ROOT.A, winnerVotes: 2 });
      expect(result.ballots.at(-1)).toEqual({ seat: 4, letter: "C", counted: true });
      expect(result).toMatchObject({ asked: 3, reused: 1 });
    });

    it("never reads a reused row's stored counted value: the verdict recounts it", async () => {
      const staleRow = Object.freeze({ judgeSeat: 3, maker: "deepseek", providerRef: "ds", modelId: "deepseek-v4.1",
        rawArtifactRef: "earlier-3", chosenLetter: "A" as const, conditional: false, sameAs: Object.freeze([]),
        questionKind: "general" as const, reasons: "Because A held up best.", counted: true, notCountedReason: null });
      const { run } = step({ recorded: [staleRow] });
      const result = await run();
      expect(result.verdict.counted[2]).toEqual({ seat: 3, counted: false, notCountedReason: "OWN_MAKER" });
    });
  });

  it.each([
    ["INSERTED", null],
    ["RUN_ERASED", null]
  ] as const)("hands nothing back after %s", async (outcome, expected) => {
    expect(await storedVoteOnConflict(outcome, 2, async () => { throw new Error("never read"); })).toBe(expected);
  });

  it("hands back the STORED row on ALREADY_PRESENT, and refuses one that cannot be read back (a code defect)", async () => {
    const stored: RecordedComparingJudgeVote = Object.freeze({ judgeSeat: 2, maker: "xiaomi", providerRef: "mimo", modelId: "m",
      rawArtifactRef: null, chosenLetter: null, conditional: null, sameAs: Object.freeze([]), questionKind: null, reasons: null });
    expect(await storedVoteOnConflict("ALREADY_PRESENT", 2, async () => [stored])).toBe(stored);
    await expect(storedVoteOnConflict("ALREADY_PRESENT", 3, async () => [stored]))
      .rejects.toThrowError(new TypeError("COMPARING_JUDGE_STORED_ROW_MISSING"));
  });

  it("checks every letter of a vote against the debate's own answers before it is written", () => {
    const roots = new Map([["A", ROOT.A], ["B", ROOT.B]] as const);
    const vote = (over: Partial<ComparingJudgeVoteRecord>) => ({ chosenLetter: "A" as const, chosenRootNodeId: ROOT.A,
      sameAs: [] as readonly (readonly ("A" | "B" | "C" | "D")[])[], ...over });
    expect(comparingJudgeVoteLettersStand(vote({}), roots)).toBe(true);
    expect(comparingJudgeVoteLettersStand(vote({ sameAs: [["A", "B"]] }), roots)).toBe(true);
    // A letter past this debate's answers (A10 admits A to H), as `best` or inside a group.
    expect(comparingJudgeVoteLettersStand(vote({ chosenLetter: "C", chosenRootNodeId: ROOT.C }), roots)).toBe(false);
    expect(comparingJudgeVoteLettersStand(vote({ sameAs: [["A", "D"]] }), roots)).toBe(false);
    // A root that is not the letter's root in this copy, or a failed vote that names anything.
    expect(comparingJudgeVoteLettersStand(vote({ chosenRootNodeId: ROOT.B }), roots)).toBe(false);
    expect(comparingJudgeVoteLettersStand(vote({ chosenLetter: null, chosenRootNodeId: null }), roots)).toBe(true);
    expect(comparingJudgeVoteLettersStand(vote({ chosenLetter: null, chosenRootNodeId: ROOT.A }), roots)).toBe(false);
  });

  it("writes a reply naming a letter this debate does not have as a failed judge, never with that letter", async () => {
    const two = { ...MATERIAL, answers: MATERIAL.answers.slice(0, 2) };
    const { run, records } = step({ material: two, ask: async (seat) => seat.seat === 1 ? Object.freeze({ ...asked(seat, "A"),
      reply: Object.freeze({ ...reply("A"), sameAs: Object.freeze([Object.freeze(["A", "C"] as const)]) }) })
      : seat.seat === 2 ? asked(seat, "C") : asked(seat, "A") });
    await run();
    expect(records.slice(0, 2).map((vote) => [vote.chosenLetter, vote.chosenRootNodeId, vote.sameAs, vote.notCountedReason]))
      .toEqual([[null, null, [], "JUDGE_FAILED"], [null, null, [], "JUDGE_FAILED"]]);
    for (const vote of records) expect(comparingJudgeVoteLettersStand(vote, new Map([["A", ROOT.A], ["B", ROOT.B]]))).toBe(true);
  });

  it("fails the debate on a code defect inside a judge's call, recording nothing", async () => {
    const { run, records } = step({ answers: { haiku: "A", mimo: new TypeError("LENGTH_FIELD_INVALID"), ds: "A" } });
    await expect(run()).rejects.toThrowError(new TypeError("LENGTH_FIELD_INVALID"));
    expect(records).toEqual([]);
  });

  it.each([
    ["a network failure", new TypeError("fetch failed")],
    ["a refused reply", new TypedDomainError("COMPARING_JUDGE_REPLY_REFUSED", "best")],
    ["a money refusal", new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "the run's ceiling for arguing is reached")],
    ["an unplanned seat", new TypedDomainError("COMPARING_JUDGE_SEAT_UNRESOLVED", "mimo")],
    // R3 final wave P14 (Task 14 Minor 4): thrown while the judge's material is built, inside the seat's call.
    ["a material order refused", new TypedDomainError("COMPARING_JUDGE_ORDER_INVALID", "order of 3 answers")]
  ] as const)("records %s as a failed judge and the debate goes on", async (_, failure) => {
    const { run, records } = step({ answers: { haiku: "A", mimo: failure, ds: "A" } });
    const result = await run();
    expect(records[1]).toMatchObject({ judgeSeat: 2, notCountedReason: "JUDGE_FAILED", chosenLetter: null });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
  });

  // R3 final wave P14 (Task 14 Minor 4): the seat pick runs outside any seat's call, so a refused pick leaves the step and
  // reaches the runner's catch; it is a declared code there, never UNRECOGNIZED_DOMAIN_ERROR.
  it("lets a refused seat pick leave the step, named at the runner's boundary (COMPARING_JUDGE_SEATS_INVALID)", async () => {
    const { run, asks, records } = step({ rotationOffset: -1 });
    await expect(run()).rejects.toMatchObject({ code: "COMPARING_JUDGE_SEATS_INVALID" });
    expect([asks, records]).toEqual([[], []]);
    expect(runnerTerminalFailureReason(new TypedDomainError("COMPARING_JUDGE_SEATS_INVALID", "count 3, rotation -1")))
      .toBe("RUNNER_EXECUTION_FAILED:COMPARING_JUDGE_SEATS_INVALID");
  });

  it("names a code defect by the one rule the investigation step reads too", () => {
    for (const error of [new TypeError("LENGTH_FIELD_INVALID"), new TypeError("ENGINE_MATERIAL_INVALID:answers.0.words"),
      new TypeError("fetch failed"), new TypeError("terminated"), new TypedDomainError("PROVIDER_CALL_FAILED", "x"),
      new Error("LENGTH_FIELD_INVALID")]) {
      expect([error.message, comparingJudgeCodeDefect(error)])
        .toEqual([error.message, pointInvestigationFailureOutcome(error) === "RETHROW"]);
      expect(comparingJudgeCodeDefect(error)).toBe(namedCodeDefect(error));
    }
    // The one intended difference: a seat with no eligible member is a failed judge, disclosed as VERDICT-JUDGE-MISSING,
    // while the investigation step (no such disclosure) rethrows it.
    const noMember = new TypedDomainError("DEBATE_MAKER_UNRESOLVED", "JUDGE seat 1 has no member eligible to answer VERDICT:judge:1");
    expect([comparingJudgeCodeDefect(noMember), pointInvestigationFailureOutcome(noMember)]).toEqual([false, "RETHROW"]);
  });

  it("records a seat with no eligible member as a failed judge (VERDICT-JUDGE-MISSING)", async () => {
    const { run, records } = step({ answers: { haiku: "A", mimo: new TypedDomainError("DEBATE_MAKER_UNRESOLVED", "x"), ds: "A" } });
    const result = await run();
    expect(records[1]).toMatchObject({ judgeSeat: 2, notCountedReason: "JUDGE_FAILED", chosenLetter: null });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
  });

  it("calls every judge as a JUDGE on the arguing's money, never moved to another maker", () => {
    for (const seat of [1, 2, 3, 4, 5]) {
      const key = comparingJudgeCallSiteKey(seat);
      for (const sent of [key, `${key}:seat:main`, `${key}:seat:runnerUp`]) {
        expect([sent, debateRoleFromCallSiteKey(sent)]).toEqual([sent, "JUDGE"]);
        expect(bodyCallMayMove({ role: "JUDGE", lane: "served", callSiteKey: sent })).toBe(false);
      }
    }
    expect(providerCallCostEnvelopePhase({ role: "JUDGE", lane: "served" })).toBe("BODY");
  });
});

/*
 * Controller carry 7 (B5) and B5 fix 1 (Important 1): the judges' material is built from this pass's servable answers. A
 * point that did not propagate (hidden by the projection, a null base: no reduced judgement, or abstained) sorts last at
 * the bottom of the scale; only a point that should have propagated and has no strength is a code defect.
 */
describe("the judges' servable source", () => {
  const point = (nodeId: string, answerLetter: "A" | "B" | "C", targetRef: string, fromRivalReply: "A" | "B" | "C" | null) =>
    Object.freeze({ nodeId, answerLetter, fromRivalReply, text: nodeId, relation: "ATTACKS" as const, targetRef, restsOn: null,
      status: "NONE" as const, reviewerReasons: Object.freeze([]), honestFinalStrength: 9, investigation: null });
  const source: EngineMaterialSource = Object.freeze({
    question: "Q?",
    answers: Object.freeze([
      Object.freeze({ letter: "A" as const, rootNodeId: ROOT.A, words: "A.", caseText: null, assumptions: Object.freeze([]) }),
      Object.freeze({ letter: "B" as const, rootNodeId: ROOT.B, words: "B.", caseText: null, assumptions: Object.freeze([]) }),
      Object.freeze({ letter: "C" as const, rootNodeId: ROOT.C, words: "C.", caseText: null, assumptions: Object.freeze([]) })
    ]),
    points: Object.freeze([
      point("p-a", "A", ROOT.A, "C"), point("p-b", "B", ROOT.B, "A"), point("p-c", "C", ROOT.C, null),
      point("p-hidden", "A", ROOT.A, null), point("p-null-base", "A", ROOT.A, null)
    ])
  });
  const strengths = new Map([["p-a", 0.2], ["p-b", 0.3], ["p-c", 0.4]]);
  // The standing snapshot's nodes with a base that did not abstain: neither the hidden point nor the null-base one.
  const propagatable = new Set([ROOT.A, ROOT.B, ROOT.C, "p-a", "p-b", "p-c"]);
  // P5 (B5 re-review Minor 1): the standing snapshot holds the null-base point; the projection hid "p-hidden".
  const snapshotIds = { standingNodeIds: new Set([...propagatable, "p-null-base"]), hiddenNodeIds: new Set(["p-hidden"]) };

  it("keeps the servable answers only, this pass's strengths, and a rival reply only from a servable answer", () => {
    const built = comparingJudgesSourceOf({ ...snapshotIds, source, servableRootIds: new Set([ROOT.A, ROOT.B]), honestFinalStrength: strengths,
      propagatableNodeIds: propagatable });
    expect(built.answers.map((entry) => entry.letter)).toEqual(["A", "B"]);
    expect(built.points.map((entry) => [entry.nodeId, entry.honestFinalStrength, entry.fromRivalReply])).toEqual([
      ["p-a", 0.2, null], ["p-b", 0.3, "A"], ["p-hidden", 0, null], ["p-null-base", 0, null]]);
  });

  it("builds the material when a point that is not hidden never propagated (a null base): it sorts last", () => {
    const built = comparingJudgesSourceOf({ ...snapshotIds, source, servableRootIds: new Set([ROOT.A, ROOT.B, ROOT.C]),
      honestFinalStrength: new Map([...strengths, ["p-hidden", 0.1]]), propagatableNodeIds: new Set([...propagatable, "p-hidden"]) });
    const material = engineMaterialOf(built);
    expect(material.answers[0]!.objections.map((entry) => entry.pointRef)).toEqual(["p-a", "p-hidden", "p-null-base"]);
  });

  it("refuses a kept point that is neither in the standing snapshot nor hidden (a source/snapshot mismatch defect)", () => {
    const stranger = { ...source, points: Object.freeze([...source.points, point("p-other-graph", "B", ROOT.B, null)]) };
    const build = () => comparingJudgesSourceOf({ ...snapshotIds, source: stranger, servableRootIds: new Set([ROOT.A, ROOT.B]),
      honestFinalStrength: strengths, propagatableNodeIds: propagatable });
    expect(build).toThrowError(new TypeError("ENGINE_MATERIAL_INVALID:sourceSnapshot"));
    expect(comparingJudgeCodeDefect(new TypeError("ENGINE_MATERIAL_INVALID:sourceSnapshot"))).toBe(true);
    // A hidden point and a standing point that never propagated stay allowed (the cases above).
  });

  it("refuses a point that should have propagated and has no strength (a code defect)", () => {
    expect(() => comparingJudgesSourceOf({ ...snapshotIds, source, servableRootIds: new Set([ROOT.A, ROOT.B]), honestFinalStrength: strengths,
      propagatableNodeIds: new Set([...propagatable, "p-null-base"]) }))
      .toThrowError(new TypeError("ENGINE_MATERIAL_INVALID:honestFinalStrength"));
  });
});

/*
 * Ruling PF-R2b7.2 option (a): a judges' floor stands as stored, and the catch-up reads NO label controls for it (its
 * label never came from them, and the register version it names may carry none, as in B12's harness). The run body's
 * short-circuit sits before `readVerdictLabelControls` (pinned in r2-judging-wiring); `rederiveCatchUpFloor` is today's,
 * byte for byte (pre-flight PF-R2b7.2).
 */
describe("the review catch-up keeps the judges' floor (spec §4.7)", () => {
  const ROOT_A = "00000000-0000-4000-8000-0000000000aa";
  const ROOT_B = "00000000-0000-4000-8000-0000000000bb";
  const CONTROLS = Object.freeze({ gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 });
  const MEASURED = Object.freeze({ kind: "MEASURED" as const, value: 0.1 });
  const nodes = [{ nodeId: ROOT_A, parentNodeId: null }, { nodeId: ROOT_B, parentNodeId: null }];

  it("leaves engine 1's re-derivation as today, and a floor kept as stored never reads as moved", () => {
    const after = rederiveCatchUpFloor({ nodes, strengths: [{ nodeId: ROOT_A, strength: 0.2 }, { nodeId: ROOT_B, strength: 0.9 }],
      leadingNodeId: ROOT_A, disagreement: MEASURED, controls: CONTROLS });
    expect(after).toEqual({ leadingNodeId: ROOT_B, verdictState: null });
    expect(catchUpFloorWouldMove({ leadingNodeId: ROOT_A, verdictState: "CONTESTED" }, after)).toBe(true);
    const kept = Object.freeze({ leadingNodeId: ROOT_A, verdictState: "SPLIT" as const });
    expect(catchUpFloorWouldMove(kept, Object.freeze({ ...kept }))).toBe(false);
  });

  // The catch-up's short-circuit itself is pinned on the source here (r2-judging-wiring) and driven end to end by B12's
  // split-floor case on a database.
  it("knows a judges' floor by the rule its label receipt recorded", () => {
    expect(floorDecidedByJudges("comparing-judges-votes-honest-strength-tiebreak")).toBe(true);
    expect(floorDecidedByJudges("max-propagated-strength-lexicographic-tiebreak")).toBe(false);
    expect(floorDecidedByJudges("first-configured-provider")).toBe(false);
    expect(floorDecidedByJudges(null)).toBe(false);
  });

  // Controller carry 14 (B5): the rule is read where it was recorded, the propagation receipt's served-root selection.
  // A money-stopped engine-2 debate with one servable answer records the judges' rule there, while its maker-position
  // records (SINGLE-LINEAGE) carry no rule at all: keying on those records would read the floor as engine 1's.
  it("finds the judges' rule on a money-stopped single-answer debate's receipt, where its records carry none", async () => {
    const ONLY = Object.freeze({ nodeId: ROOT_A, maker: "maker-a" });
    const snapshot: EvaluationSnapshot = { nodes: [{ nodeId: ROOT_A, baseStrength: 0.6, parentNodeId: null }],
      arrows: [], arrowOrder: [], operatorResolutions: [], clusterRecords: [] };
    const judged = await runComparingJudges({ engine: ENGINE, material: { ...MATERIAL, answers: [answer("A", ROOT_A)] },
      arguedByMaker: new Map([[ROOT_A, "maker-a"]]), honestFinalStrength: new Map([[ROOT_A, 0.6]]), candidates: CANDIDATES,
      rotationOffset: 0, moneyStopped: true, recorded: [], ask: async () => { throw new Error("never asked"); },
      record: async () => { throw new Error("never recorded"); } });
    const singleLineage = Object.freeze({ mark: "SINGLE-LINEAGE" as const, scope: "answer" as const, subjectRef: ROOT_A,
      reason: "RUN_COST_ENVELOPE_MONEY_REACHED", liftPath: "RUN_DIFFERENT_MAKER_CRITIQUE", servedRootRule: null,
      affectedNodeIds: Object.freeze([ROOT_A]) });
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 1, runBodyBudgetStop: "MONEY", authoredMakerPositions: [ONLY], snapshot,
      materialisedNodeIds: [ROOT_A], reviewedNodeIds: [], unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: ["SINGLE-LINEAGE"], monoMakerRecords: () => [singleLineage], judgesVerdict: judged.verdict
    });
    expect(decision.disclosure.records.map((record) => record.servedRootRule)).toEqual([null]);
    expect(decision.servedRootSelection.rule).toBe(SERVED_ROOT_SELECTION_RULE_JUDGES);
    expect(floorDecidedByJudges(decision.servedRootSelection.rule)).toBe(true);
    expect(decision.disclosure.records.some((record) => floorDecidedByJudges(record.servedRootRule))).toBe(false);
  });
});

/*
 * Controller carry 13 (B5): serve's real persist path takes the judges' label record. The pool is a stand-in that
 * answers the lease, the transaction and the sequence, and stops at the answer's INSERT, where the label is read.
 */
describe("serve's persist stores the judges' label", () => {
  const RUN_ID = "00000000-0000-4000-8000-0000000000d1";
  const STOP = new Error("TEST_STOP_AT_ANSWER_INSERT");

  function insertCapturingPool(): { pool: Pool; answerInsert: () => readonly unknown[] | null } {
    let captured: readonly unknown[] | null = null;
    const query = async (sql: string, params: readonly unknown[] = []) => {
      if (sql.includes("INSERT INTO serve.answer")) { captured = params; throw STOP; }
      return { rowCount: 1, rows: [{ acquired: true, unlocked: true, run_id: RUN_ID, live: true, sequence: "7",
        fact_bundle_id: "00000000-0000-4000-8000-0000000000f1", composed_text_id: "00000000-0000-4000-8000-0000000000f2",
        conformance_record_id: "00000000-0000-4000-8000-0000000000f3", lock_timeout: "0" }] };
    };
    const client = { query, release: () => undefined };
    return { pool: { query, connect: async () => client } as unknown as Pool, answerInsert: () => captured };
  }

  function servedInput(over: Partial<PersistServeInput>): PersistServeInput {
    const factBundle = buildFactBundle({ facts: ["fact:judged"], residualObjections: [], badges: [], conditionMarks: [],
      reversalPoint: "reversal:judged", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null });
    const result: ServeGateResult = Object.freeze({
      terminal: "SERVED", answerForm: null, factBundle, gateTrace: Object.freeze([]), conditionMarks: Object.freeze([]),
      conformance: Object.freeze([]), coverageMode: "NOT_RUN", segments: Object.freeze([]),
      compositionBudget: Object.freeze({ tier: "low", bound: 1, registerRowKey: "test-layer:composition-budget",
        registerVersion: 1, sourceRef: "test-layer:judges" }),
      confidenceBand: null, bandCeiling: null, digest: null, loopRounds: Object.freeze([]), standingObjection: null,
      crashClass: null,
      projections: Object.freeze({ reversalPoint: factBundle.reversalPoint, buildsOnPrevious: factBundle.buildsOnPrevious,
        memoryDisclosure: null })
    });
    return {
      runId: RUN_ID, workItemId: "00000000-0000-4000-8000-0000000000e1", factBundleVersion: 1, factBundleContentHash: "hash",
      factBundle, result, segments: [], compositionRawArtifactRef: "00000000-0000-4000-8000-0000000000e2", compositionAttempt: 1,
      conformanceRawArtifactRefs: [],
      servedNumber: { numberRef: "number:final-strength", value: 0.5, numberKind: "kind", sourceRef: "source", producer: "producer",
        replayHandle: "replay", propagationRunId: "00000000-0000-4000-8000-0000000000e3" },
      ...over
    };
  }

  it("writes SPLIT from the judges' derivation, with no ladder basis", async () => {
    const { pool, answerInsert } = insertCapturingPool();
    const judgesDerivation = verdictDerivationOfJudges({ winnerRootNodeId: ROOT.A, label: "SPLIT", trigger: "JUDGES_NO_MAJORITY",
      judgesSeated: 3, judgesAnswered: 3, counted: [], groups: [], winnerVotes: 1, questionKinds: [], marks: [] });
    await expect(new ServeRepository(pool).persist(servedInput({ verdictLabelBasis: null, judgesDerivation })))
      .rejects.toBe(STOP);
    const params = answerInsert();
    expect(params).not.toBeNull();
    // `verdict_state` and `verdict_unavailable` of the INSERT's VALUES list.
    expect([params![6], params![18]]).toEqual(["SPLIT", null]);
  });
});
