import { describe, expect, it } from "vitest";
import type { MakerLineage, StoryBody } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderCallFailedError, ProviderContentUnacceptedError } from "@debateai/providers";
import {
  runStoryLoop,
  storyCallSiteKey,
  type StoryCallRecord,
  type StoryCheckerVerdict,
  type StoryLoopDependencies
} from "@debateai/story";

/**
 * Verdict story, Task 4 — the write-and-check loop (spec §6), driven by
 * in-memory doubles that record every request the loop really made.
 */

const WRITER_LINEAGE: MakerLineage = Object.freeze({
  maker: "maker:storyteller", model_id: "model:storyteller", transport: "openai-compatible-http", provider_ref: "provider:storyteller"
});
const CHECKER_LINEAGE: MakerLineage = Object.freeze({
  maker: "maker:checker", model_id: "model:checker", transport: "openai-compatible-http", provider_ref: "provider:checker"
});

function storyFor(round: number): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: `Draft ${String(round)}`,
      summary: "Our reading of your question, and the answer.",
      confidence: "Fairly sure, if ridership holds.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "It held up.", node_refs: ["P1"] }],
      change: { text: "A ridership count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "Ridership decided it.", node_refs: [] }] },
    long: {
      sections: [1, 2, 3].map((index) => ({
        title: `Section ${String(index)}`,
        paragraphs: [{ text: `Paragraph ${String(index)}.`, node_refs: [] }]
      }))
    },
    reviewer_note: null
  };
}

const SATISFIED: StoryCheckerVerdict = Object.freeze({
  satisfied: true,
  objection: null,
  criteria: Object.freeze({
    faithful_to_material: true,
    agrees_with_label: true,
    fair_to_losing_paths: true,
    no_overstatement: true,
    citations_correct: true,
    reviewer_note_separate: true,
    goal_marked_as_reading: true,
    speaks_to_the_person: true
  })
});

function unsatisfied(objection: string): StoryCheckerVerdict {
  return Object.freeze({
    satisfied: false,
    objection,
    criteria: Object.freeze({ ...SATISFIED.criteria, agrees_with_label: false })
  });
}

/** A recording double: every request the loop sent, and a script for what each call does. */
function recorder(script: {
  readonly verdicts?: readonly StoryCheckerVerdict[];
  readonly writeFails?: (round: number) => unknown;
  readonly checkFails?: (round: number) => unknown;
}): {
  readonly deps: StoryLoopDependencies;
  readonly writes: { round: number; priorObjection: string | null }[];
  readonly checks: { round: number; candidate: StoryBody }[];
} {
  const writes: { round: number; priorObjection: string | null }[] = [];
  const checks: { round: number; candidate: StoryBody }[] = [];
  const verdicts = script.verdicts ?? [SATISFIED];
  return {
    writes,
    checks,
    deps: {
      writeStory: async (input) => {
        writes.push({ ...input });
        const failure = script.writeFails?.(input.round);
        if (failure !== undefined) throw failure;
        return {
          artifactRef: `artifact:storyteller:${String(input.round)}`,
          callSiteKey: storyCallSiteKey("STORYTELLER", input.round),
          lineage: WRITER_LINEAGE,
          body: storyFor(input.round)
        };
      },
      checkStory: async (input) => {
        checks.push({ ...input });
        const failure = script.checkFails?.(input.round);
        if (failure !== undefined) throw failure;
        return {
          artifactRef: `artifact:checker:${String(input.round)}`,
          callSiteKey: storyCallSiteKey("CHECKER", input.round),
          lineage: CHECKER_LINEAGE,
          verdict: verdicts[Math.min(checks.length - 1, verdicts.length - 1)]!
        };
      }
    }
  };
}

const contentRefused = (): ProviderContentUnacceptedError =>
  new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "[]", "artifact:refused", "ledger:refused");
const transportDied = (): ProviderCallFailedError =>
  new ProviderCallFailedError(new Error("socket hang up"), 2, "TIMED_OUT", "ledger:dead");

describe("verdict story — the call-site keys", () => {
  it("names the storyteller and the checker under the STORY: prefix, per round", () => {
    expect(storyCallSiteKey("STORYTELLER", 1)).toBe("STORY:STORYTELLER:1");
    expect(storyCallSiteKey("CHECKER", 2)).toBe("STORY:CHECKER:2");
  });
});

describe("verdict story — the loop's outcomes", () => {
  it("is READY when the checker is satisfied with the first draft", async () => {
    const double = recorder({});
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({
      outcome: "READY",
      body: storyFor(1),
      reservation: null,
      servedRound: 1,
      laterFailure: null,
      rounds: [{
        round: 1,
        writer: { artifactRef: "artifact:storyteller:1", callSiteKey: "STORY:STORYTELLER:1", lineage: WRITER_LINEAGE },
        checker: { artifactRef: "artifact:checker:1", callSiteKey: "STORY:CHECKER:1", lineage: CHECKER_LINEAGE },
        satisfied: true,
        objection: null
      }]
    });
    expect(double.writes).toEqual([{ round: 1, priorObjection: null }]);
    expect(double.checks).toEqual([{ round: 1, candidate: storyFor(1) }]);
  });

  it("repairs on a second draft carrying the checker's objection verbatim, then is READY", async () => {
    const objection = "The summary calls the answer settled; the label says it is not.";
    const double = recorder({ verdicts: [unsatisfied(objection), SATISFIED] });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(double.writes).toEqual([{ round: 1, priorObjection: null }, { round: 2, priorObjection: objection }]);
    expect(double.checks.map((check) => check.candidate)).toEqual([storyFor(1), storyFor(2)]);
    expect(outcome).toMatchObject({ outcome: "READY", body: storyFor(2), reservation: null, servedRound: 2, laterFailure: null });
    expect(outcome.rounds.map((round) => [round.round, round.satisfied, round.objection])).toEqual([
      [1, false, objection], [2, true, null]
    ]);
  });

  it("is READY_WITH_RESERVATION with the last draft and the last objection when the rounds run out", async () => {
    const double = recorder({ verdicts: [unsatisfied("First objection."), unsatisfied("Second objection.")] });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toMatchObject({
      outcome: "READY_WITH_RESERVATION",
      body: storyFor(2),
      reservation: "Second objection.",
      // The rounds ran out: the last draft is served, and nothing failed.
      servedRound: 2,
      laterFailure: null
    });
    expect(outcome.rounds.map((round) => [round.round, round.satisfied, round.objection])).toEqual([
      [1, false, "First objection."], [2, false, "Second objection."]
    ]);
    expect(outcome.rounds.map((round) => round.checker)).toEqual([
      { artifactRef: "artifact:checker:1", callSiteKey: "STORY:CHECKER:1", lineage: CHECKER_LINEAGE },
      { artifactRef: "artifact:checker:2", callSiteKey: "STORY:CHECKER:2", lineage: CHECKER_LINEAGE }
    ]);
    expect(double.writes).toEqual([{ round: 1, priorObjection: null }, { round: 2, priorObjection: "First objection." }]);
  });

  it("stops after one round when one round is all it has", async () => {
    const double = recorder({ verdicts: [unsatisfied("Only objection.")] });
    const outcome = await runStoryLoop({ maxRounds: 1 }, double.deps);
    expect(outcome).toMatchObject({
      outcome: "READY_WITH_RESERVATION", body: storyFor(1), reservation: "Only objection.", servedRound: 1, laterFailure: null
    });
    expect(double.writes).toHaveLength(1);
  });

  it.each([0, Number.NaN, 1.5])("refuses %s rounds as a programming error, before any call", async (maxRounds) => {
    const double = recorder({});
    await expect(runStoryLoop({ maxRounds }, double.deps))
      .rejects.toMatchObject({ code: "STORY_LOOP_ROUNDS_INVALID" });
    expect(double.writes).toEqual([]);
  });
});

const writerRecord = (round: number): StoryCallRecord => ({
  artifactRef: `artifact:storyteller:${String(round)}`, callSiteKey: `STORY:STORYTELLER:${String(round)}`, lineage: WRITER_LINEAGE
});
const checkerRecord = (round: number): StoryCallRecord => ({
  artifactRef: `artifact:checker:${String(round)}`, callSiteKey: `STORY:CHECKER:${String(round)}`, lineage: CHECKER_LINEAGE
});

describe("verdict story — every failure is a FAILED outcome with a code and a cause, never a throw", () => {
  it.each([
    ["the storyteller's content is refused after its repairs", contentRefused,
      "STORY_WRITE_REJECTED", "PROVIDER_CONTENT_UNACCEPTED"],
    ["the storyteller's transport dies", transportDied, "STORY_TRANSPORT_DEATH", "PROVIDER_CALL_FAILED"],
    ["the story money envelope refuses the call",
      (): unknown => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED", "STORY_COST_ENVELOPE_REACHED"],
    ["the run money envelope's code arrives instead",
      (): unknown => new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "The run has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED", "RUN_COST_ENVELOPE_MONEY_REACHED"],
    ["the story attempt allowance is spent",
      (): unknown => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "subject"), "STORY_ENVELOPE_EXHAUSTED", "CALL_BUDGET_EXHAUSTED"],
    // The day's money (the private preview's team pot answers with it mid-story) and an
    // owner's allowance window are money stops of the same kind: the envelope, not a bug.
    ["the day's money envelope refuses the call",
      (): unknown => new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "The day is spent"),
      "STORY_ENVELOPE_EXHAUSTED", "DAILY_COST_ENVELOPE_REACHED"],
    ["the owner's allowance refuses the call",
      (): unknown => new TypedDomainError("PERSON_ALLOWANCE_REACHED", "The allowance is spent"),
      "STORY_ENVELOPE_EXHAUSTED", "PERSON_ALLOWANCE_REACHED"],
    ["another typed refusal arrives",
      (): unknown => new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "no usage"), "STORY_UNEXPECTED_ERROR",
      "PROVIDER_USAGE_UNREPORTED"],
    ["a plain error arrives", (): unknown => new Error("bug"), "STORY_UNEXPECTED_ERROR", "Error"],
    ["a TypeError arrives", (): unknown => new TypeError("x is undefined"), "STORY_UNEXPECTED_ERROR", "TypeError"],
    ["something that is not an error is thrown", (): unknown => "a string", "STORY_UNEXPECTED_ERROR", "UNKNOWN"]
  ])("round 1: %s", async (_name, failure, code, cause) => {
    const double = recorder({ writeFails: (round) => (round === 1 ? failure() : undefined) });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({ outcome: "FAILED", failureCode: code, cause, rounds: [] });
    expect(double.checks).toEqual([]);
  });

  it.each([
    ["the checker's content is refused after its repairs", contentRefused,
      "STORY_CHECK_UNAVAILABLE", "PROVIDER_CONTENT_UNACCEPTED"],
    ["the checker's transport dies", transportDied, "STORY_TRANSPORT_DEATH", "PROVIDER_CALL_FAILED"],
    ["the story money envelope refuses the check",
      (): unknown => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED", "STORY_COST_ENVELOPE_REACHED"],
    ["the story attempt allowance is spent before the check",
      (): unknown => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "subject"), "STORY_ENVELOPE_EXHAUSTED", "CALL_BUDGET_EXHAUSTED"],
    ["the day's money envelope refuses the check",
      (): unknown => new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "The day is spent"),
      "STORY_ENVELOPE_EXHAUSTED", "DAILY_COST_ENVELOPE_REACHED"],
    ["the owner's allowance refuses the check",
      (): unknown => new TypedDomainError("PERSON_ALLOWANCE_REACHED", "The allowance is spent"),
      "STORY_ENVELOPE_EXHAUSTED", "PERSON_ALLOWANCE_REACHED"],
    ["a plain error arrives", (): unknown => new Error("bug"), "STORY_UNEXPECTED_ERROR", "Error"]
  ])("the checker: %s", async (_name, failure, code, cause) => {
    const double = recorder({ checkFails: () => failure() });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({
      outcome: "FAILED",
      failureCode: code,
      cause,
      rounds: [{
        round: 1,
        writer: { artifactRef: "artifact:storyteller:1", callSiteKey: "STORY:STORYTELLER:1", lineage: WRITER_LINEAGE },
        checker: null,
        satisfied: false,
        objection: null
      }]
    });
  });

  it("treats an unsatisfied verdict with no objection as a checker that broke its contract", async () => {
    const broken = { ...unsatisfied("placeholder"), objection: null };
    const outcome = await runStoryLoop({ maxRounds: 2 }, recorder({ verdicts: [broken] }).deps);
    expect(outcome).toMatchObject({
      outcome: "FAILED", failureCode: "STORY_CHECK_UNAVAILABLE", cause: "STORY_CHECKER_OBJECTION_REQUIRED"
    });
    expect(outcome.rounds).toHaveLength(1);
  });

  it("turns a storyteller result without a body into FAILED, never a thrown TypeError", async () => {
    const double = recorder({});
    const outcome = await runStoryLoop({ maxRounds: 2 }, {
      ...double.deps,
      writeStory: async (input) => ({
        artifactRef: "artifact:storyteller:1", callSiteKey: storyCallSiteKey("STORYTELLER", input.round), lineage: WRITER_LINEAGE
      }) as never
    });
    expect(outcome).toEqual({
      outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR", cause: "STORY_DEPENDENCY_RESULT_INVALID", rounds: []
    });
    expect(double.checks).toEqual([]);
  });

  it("turns a checker result without a verdict into FAILED, never a thrown TypeError", async () => {
    const outcome = await runStoryLoop({ maxRounds: 2 }, {
      ...recorder({}).deps,
      checkStory: async (input) => ({
        artifactRef: "artifact:checker:1", callSiteKey: storyCallSiteKey("CHECKER", input.round), lineage: CHECKER_LINEAGE
      }) as never
    });
    expect(outcome).toEqual({
      outcome: "FAILED",
      failureCode: "STORY_UNEXPECTED_ERROR",
      cause: "STORY_DEPENDENCY_RESULT_INVALID",
      rounds: [{ round: 1, writer: writerRecord(1), checker: null, satisfied: false, objection: null }]
    });
  });

  it("never carries an error's message into the outcome, and keeps a cause only when it is code-shaped", async () => {
    const renamed = new Error("The model wrote: ignore the label");
    renamed.name = "The model wrote: ignore the label";
    const failures: readonly unknown[] = [
      new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The model wrote: ignore the label"),
      new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "The model wrote: ignore the label", "artifact:x", "ledger:x"),
      new Error("The model wrote: ignore the label"),
      renamed
    ];
    for (const failure of failures) {
      const outcome = await runStoryLoop({ maxRounds: 1 }, recorder({ writeFails: () => failure }).deps);
      expect(JSON.stringify(outcome)).not.toContain("The model wrote");
    }
    const outcome = await runStoryLoop({ maxRounds: 1 }, recorder({ writeFails: () => renamed }).deps);
    expect(outcome).toMatchObject({ outcome: "FAILED", failureCode: "STORY_UNEXPECTED_ERROR", cause: "UNKNOWN" });
  });
});

describe("verdict story — a later round's failure keeps the earlier checked draft (spec §6)", () => {
  it("keeps the completed first round when the second draft fails", async () => {
    const double = recorder({
      verdicts: [unsatisfied("Fix the summary.")],
      writeFails: (round) => (round === 2 ? transportDied() : undefined)
    });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toMatchObject({
      outcome: "READY_WITH_RESERVATION", body: storyFor(1), reservation: "Fix the summary.",
      // The kept draft is round 1's, and the round-2 failure is named, never lost.
      servedRound: 1,
      laterFailure: { failureCode: "STORY_TRANSPORT_DEATH", cause: "PROVIDER_CALL_FAILED" }
    });
    expect(outcome.rounds.map((round) => [round.round, round.satisfied, round.objection])).toEqual([
      [1, false, "Fix the summary."]
    ]);
  });

  it("keeps the first draft and its objection when the money envelope refuses the second draft", async () => {
    const double = recorder({
      verdicts: [unsatisfied("Fix the summary.")],
      writeFails: (round) => (round === 2
        ? new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope")
        : undefined)
    });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({
      outcome: "READY_WITH_RESERVATION",
      body: storyFor(1),
      reservation: "Fix the summary.",
      servedRound: 1,
      laterFailure: { failureCode: "STORY_ENVELOPE_EXHAUSTED", cause: "STORY_COST_ENVELOPE_REACHED" },
      rounds: [{ round: 1, writer: writerRecord(1), checker: checkerRecord(1), satisfied: false, objection: "Fix the summary." }]
    });
    expect(double.writes).toEqual([{ round: 1, priorObjection: null }, { round: 2, priorObjection: "Fix the summary." }]);
    expect(double.checks).toHaveLength(1);
  });

  it.each([
    ["the checker's content is refused", contentRefused, "STORY_CHECK_UNAVAILABLE", "PROVIDER_CONTENT_UNACCEPTED"],
    ["the checker's transport dies", transportDied, "STORY_TRANSPORT_DEATH", "PROVIDER_CALL_FAILED"],
    ["the story money envelope refuses the check",
      (): unknown => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED", "STORY_COST_ENVELOPE_REACHED"],
    ["a plain error arrives", (): unknown => new Error("bug"), "STORY_UNEXPECTED_ERROR", "Error"]
  ])("keeps the first draft when round 2's check fails: %s", async (_name, failure, failureCode, cause) => {
    const double = recorder({
      verdicts: [unsatisfied("Fix the summary.")],
      checkFails: (round) => (round === 2 ? failure() : undefined)
    });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({
      outcome: "READY_WITH_RESERVATION",
      body: storyFor(1),
      reservation: "Fix the summary.",
      // Round 1's draft AND round 1's checker are what is served; round 2 only failed.
      servedRound: 1,
      laterFailure: { failureCode, cause },
      rounds: [
        { round: 1, writer: writerRecord(1), checker: checkerRecord(1), satisfied: false, objection: "Fix the summary." },
        { round: 2, writer: writerRecord(2), checker: null, satisfied: false, objection: null }
      ]
    });
    expect(double.checks.map((check) => check.candidate)).toEqual([storyFor(1), storyFor(2)]);
  });

  it("keeps the first draft when round 2's checker breaks its contract", async () => {
    const broken = { ...unsatisfied("placeholder"), objection: null };
    const outcome = await runStoryLoop(
      { maxRounds: 2 }, recorder({ verdicts: [unsatisfied("Fix the summary."), broken] }).deps
    );
    expect(outcome).toMatchObject({
      outcome: "READY_WITH_RESERVATION", body: storyFor(1), reservation: "Fix the summary.", servedRound: 1,
      laterFailure: { failureCode: "STORY_CHECK_UNAVAILABLE", cause: "STORY_CHECKER_OBJECTION_REQUIRED" }
    });
    expect(outcome.rounds.map((round) => [round.round, round.checker, round.satisfied, round.objection])).toEqual([
      [1, checkerRecord(1), false, "Fix the summary."], [2, checkerRecord(2), false, null]
    ]);
  });

  it("keeps the latest checked draft when a third round fails", async () => {
    const double = recorder({
      verdicts: [unsatisfied("First objection."), unsatisfied("Second objection.")],
      writeFails: (round) => (round === 3 ? transportDied() : undefined)
    });
    const outcome = await runStoryLoop({ maxRounds: 3 }, double.deps);
    expect(outcome).toMatchObject({
      outcome: "READY_WITH_RESERVATION", body: storyFor(2), reservation: "Second objection.", servedRound: 2,
      laterFailure: { failureCode: "STORY_TRANSPORT_DEATH", cause: "PROVIDER_CALL_FAILED" }
    });
    expect(outcome.rounds.map((round) => round.round)).toEqual([1, 2]);
  });
});
