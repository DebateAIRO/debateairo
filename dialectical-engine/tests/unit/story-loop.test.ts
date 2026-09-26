import { describe, expect, it } from "vitest";
import type { MakerLineage, StoryBody } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { ProviderCallFailedError, ProviderContentUnacceptedError } from "@debateai/providers";
import {
  runStoryLoop,
  storyCallSiteKey,
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
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "It held up.", node_refs: ["P1"] }],
      change: { text: "A ridership count would change it.", node_refs: [] }
    },
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
    goal_marked_as_reading: true
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
    expect(outcome).toMatchObject({ outcome: "READY", body: storyFor(2), reservation: null });
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
      reservation: "Second objection."
    });
    expect(outcome.rounds).toHaveLength(2);
    expect(double.writes).toHaveLength(2);
  });

  it("stops after one round when one round is all it has", async () => {
    const double = recorder({ verdicts: [unsatisfied("Only objection.")] });
    const outcome = await runStoryLoop({ maxRounds: 1 }, double.deps);
    expect(outcome).toMatchObject({ outcome: "READY_WITH_RESERVATION", body: storyFor(1), reservation: "Only objection." });
    expect(double.writes).toHaveLength(1);
  });

  it("refuses fewer than one round as a programming error", async () => {
    await expect(runStoryLoop({ maxRounds: 0 }, recorder({}).deps))
      .rejects.toMatchObject({ code: "STORY_LOOP_ROUNDS_INVALID" });
  });
});

describe("verdict story — every failure is a FAILED outcome with a code, never a throw", () => {
  it.each([
    ["the storyteller's content is refused after its repairs", contentRefused, "STORY_WRITE_REJECTED"],
    ["the storyteller's transport dies", transportDied, "STORY_TRANSPORT_DEATH"],
    ["the story money envelope refuses the call",
      (): unknown => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED"],
    ["the run money envelope's code arrives instead",
      (): unknown => new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "The run has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED"],
    ["the story attempt allowance is spent",
      (): unknown => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "subject"), "STORY_ENVELOPE_EXHAUSTED"],
    ["another typed refusal arrives",
      (): unknown => new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "no usage"), "STORY_UNEXPECTED_ERROR"],
    ["a plain error arrives", (): unknown => new Error("bug"), "STORY_UNEXPECTED_ERROR"],
    ["something that is not an error is thrown", (): unknown => "a string", "STORY_UNEXPECTED_ERROR"]
  ])("round 1: %s", async (_name, failure, code) => {
    const double = recorder({ writeFails: (round) => (round === 1 ? failure() : undefined) });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({ outcome: "FAILED", failureCode: code, rounds: [] });
    expect(double.checks).toEqual([]);
  });

  it.each([
    ["the checker's content is refused after its repairs", contentRefused, "STORY_CHECK_UNAVAILABLE"],
    ["the checker's transport dies", transportDied, "STORY_TRANSPORT_DEATH"],
    ["the story money envelope refuses the check",
      (): unknown => new TypedDomainError("STORY_COST_ENVELOPE_REACHED", "The story has spent its envelope"),
      "STORY_ENVELOPE_EXHAUSTED"],
    ["the story attempt allowance is spent before the check",
      (): unknown => new TypedDomainError("CALL_BUDGET_EXHAUSTED", "subject"), "STORY_ENVELOPE_EXHAUSTED"],
    ["a plain error arrives", (): unknown => new Error("bug"), "STORY_UNEXPECTED_ERROR"]
  ])("the checker: %s", async (_name, failure, code) => {
    const double = recorder({ checkFails: () => failure() });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toEqual({
      outcome: "FAILED",
      failureCode: code,
      rounds: [{
        round: 1,
        writer: { artifactRef: "artifact:storyteller:1", callSiteKey: "STORY:STORYTELLER:1", lineage: WRITER_LINEAGE },
        checker: null,
        satisfied: false,
        objection: null
      }]
    });
  });

  it("keeps the completed first round when the second draft fails", async () => {
    const double = recorder({
      verdicts: [unsatisfied("Fix the summary.")],
      writeFails: (round) => (round === 2 ? transportDied() : undefined)
    });
    const outcome = await runStoryLoop({ maxRounds: 2 }, double.deps);
    expect(outcome).toMatchObject({ outcome: "FAILED", failureCode: "STORY_TRANSPORT_DEATH" });
    expect(outcome.rounds.map((round) => [round.round, round.satisfied, round.objection])).toEqual([
      [1, false, "Fix the summary."]
    ]);
  });

  it("treats an unsatisfied verdict with no objection as a checker that broke its contract", async () => {
    const broken = { ...unsatisfied("placeholder"), objection: null };
    const outcome = await runStoryLoop({ maxRounds: 2 }, recorder({ verdicts: [broken] }).deps);
    expect(outcome).toMatchObject({ outcome: "FAILED", failureCode: "STORY_CHECK_UNAVAILABLE" });
    expect(outcome.rounds).toHaveLength(1);
  });
});
