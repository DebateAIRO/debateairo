import { describe, expect, it } from "vitest";
import {
  SERVED_ROOT_SELECTION_RULE_JUDGES,
  TypedDomainError,
  comparingJudgeCallSiteKey,
  debateRoleFromCallSiteKey,
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
  type ComparingJudgeAsked,
  type ComparingJudgeVoteRecord,
  type ComparingJudgesStepInput,
  type RecordedComparingJudgeVote
} from "../../apps/runner/src/engine-judging.js";
import {
  bodyCallMayMove,
  catchUpFloorWouldMove,
  decideMakerPositionServe,
  floorDecidedByJudges,
  pointInvestigationFailureOutcome,
  providerCallCostEnvelopePhase,
  rederiveCatchUpFloor
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
  providerRef: seat.providerRef, modelId: CANDIDATES.find((candidate) => candidate.providerRef === seat.providerRef)!.modelId
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
    ["an unplanned seat", new TypedDomainError("COMPARING_JUDGE_SEAT_UNRESOLVED", "mimo")]
  ] as const)("records %s as a failed judge and the debate goes on", async (_, failure) => {
    const { run, records } = step({ answers: { haiku: "A", mimo: failure, ds: "A" } });
    const result = await run();
    expect(records[1]).toMatchObject({ judgeSeat: 2, notCountedReason: "JUDGE_FAILED", chosenLetter: null });
    expect(result.verdict.marks).toEqual(["VERDICT-JUDGE-MISSING"]);
  });

  it("names a code defect by the same rule as the investigation step's", () => {
    for (const error of [new TypeError("LENGTH_FIELD_INVALID"), new TypeError("ENGINE_MATERIAL_INVALID:answers.0.words"),
      new TypeError("fetch failed"), new TypeError("terminated"), new TypedDomainError("PROVIDER_CALL_FAILED", "x"),
      new Error("LENGTH_FIELD_INVALID")]) {
      expect([error.message, comparingJudgeCodeDefect(error)])
        .toEqual([error.message, pointInvestigationFailureOutcome(error) === "RETHROW"]);
    }
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
 * Controller carry 7 (B5): the judges' material is built from this pass's servable answers, a strength for every point
 * (a point the standing projection hid sorts last, by design; any other missing strength is a code defect).
 */
describe("the judges' servable source", () => {
  const source: EngineMaterialSource = Object.freeze({
    question: "Q?",
    answers: Object.freeze([
      Object.freeze({ letter: "A" as const, rootNodeId: ROOT.A, words: "A.", caseText: null, assumptions: Object.freeze([]) }),
      Object.freeze({ letter: "B" as const, rootNodeId: ROOT.B, words: "B.", caseText: null, assumptions: Object.freeze([]) }),
      Object.freeze({ letter: "C" as const, rootNodeId: ROOT.C, words: "C.", caseText: null, assumptions: Object.freeze([]) })
    ]),
    points: Object.freeze([
      { nodeId: "p-a", answerLetter: "A" as const, fromRivalReply: "C" as const },
      { nodeId: "p-b", answerLetter: "B" as const, fromRivalReply: "A" as const },
      { nodeId: "p-c", answerLetter: "C" as const, fromRivalReply: null },
      { nodeId: "p-hidden", answerLetter: "A" as const, fromRivalReply: null }
    ].map((point) => Object.freeze({ ...point, text: point.nodeId, relation: "ATTACKS" as const, targetRef: ROOT.A,
      restsOn: null, status: "NONE" as const, reviewerReasons: Object.freeze([]), honestFinalStrength: 9, investigation: null })))
  });
  const strengths = new Map([["p-a", 0.2], ["p-b", 0.3], ["p-c", 0.4]]);

  it("keeps the servable answers only, this pass's strengths, and a rival reply only from a servable answer", () => {
    const built = comparingJudgesSourceOf({ source, servableRootIds: new Set([ROOT.A, ROOT.B]), honestFinalStrength: strengths,
      hiddenNodeIds: new Set(["p-hidden"]) });
    expect(built.answers.map((entry) => entry.letter)).toEqual(["A", "B"]);
    expect(built.points.map((point) => [point.nodeId, point.honestFinalStrength, point.fromRivalReply])).toEqual([
      ["p-a", 0.2, null], ["p-b", 0.3, "A"], ["p-hidden", 0, null]]);
  });

  it("refuses a point with no strength the projection did not hide (a code defect)", () => {
    expect(() => comparingJudgesSourceOf({ source, servableRootIds: new Set([ROOT.A, ROOT.B]), honestFinalStrength: strengths,
      hiddenNodeIds: new Set() })).toThrowError(new TypeError("ENGINE_MATERIAL_INVALID:honestFinalStrength"));
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
