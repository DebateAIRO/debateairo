// tests/unit/path-climb.test.ts
// R22 decisions 2 and 3: what decides that a rewrite "really changed" a path, the ids that make a climb resumable, the gateway's scope for
// the climb's and the answer update's call sites, their thinking steps, and their money seams, never walled. The climb itself runs on real
// PostgreSQL in tests/integration/r22-tree-database.test.ts. Every figure and text here is made up.
import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, isMonthWallReached, type ModelSpendEntry, type ModelSpendStore, type PersonAllowanceSource } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { previewThinkingStepOf } from "@debateai/providers";
import {
  ANSWER_UPDATE_CALL_SITE, PATH_CLIMB_CALL_SITE, answerUpdateCallSiteRole, pathClimbCallSiteRole, pathRewriteCallSiteKey
} from "@debateai/story";
import { storyCallScopeAgrees } from "../../apps/runner/src/index.js";
import { mainAnswerUpdateIdOf, pathReallyChanged, pathUpdateIdOf } from "../../apps/runner/src/path-climb.js";

const LINE = "Partly: a second pier helps at rush hour, not in winter, and costs more than a new bus line would.";
const SUMMARY = "The dig found winter ridership falls by half, so the pier helps only in the busy months of the year.";
const before = { line: LINE, summary: SUMMARY, fate: "PARTLY_HELD" as const };
const after = (change: Partial<typeof before> = {}) => ({ ...before, ...change });

describe("really changed, decided by code", () => {
  it("the same text, whatever the spacing, case or closing mark, is no change", () => {
    expect(pathReallyChanged(before, after())).toBe(false);
    expect(pathReallyChanged(before, after({ line: `  ${LINE.toUpperCase().replace(/\.$/u, "")}!  ` }))).toBe(false);
  });
  it("a word or two reworded is no change: the climb stops there", () => {
    expect(pathReallyChanged(before, after({ line: LINE.replace("helps", "assists") }))).toBe(false);
    expect(pathReallyChanged(before, after({ summary: SUMMARY.replace("found", "showed") }))).toBe(false);
  });
  it("a moved fate is a change, even in the same words", () => {
    expect(pathReallyChanged(before, after({ fate: "FELL" as never }))).toBe(true);
  });
  it("a figure that appears, goes or moves is a change, even in otherwise the same words", () => {
    expect(pathReallyChanged(before, after({ summary: SUMMARY.replace("by half", "by 40 percent") }))).toBe(true);
    const counted = { ...before, line: "It costs 40 more than a bus line would, for the same riders." };
    expect(pathReallyChanged(counted, after({ line: "It costs 45 more than a bus line would, for the same riders." }))).toBe(true);
  });
  it("new words in the line or the summary are a change", () => {
    expect(pathReallyChanged(before, after({ line: "No: winter ridership decides it, and the pier fails that test." }))).toBe(true);
    expect(pathReallyChanged(before, after({ summary: "A later count shows the winter crowds stayed, which undoes the earlier case." }))).toBe(true);
  });
  it("a path with no summary yet is compared on its line and fate: a first summary alone is no change", () => {
    const story = { line: LINE, summary: null, fate: "PARTLY_HELD" as const };
    expect(pathReallyChanged(story, after({ summary: "Any first summary at all." }))).toBe(false);
    expect(pathReallyChanged(story, after({ line: "Yes: the pier pays for itself every single winter." }))).toBe(true);
  });
  it("a language written without spaces is read word by word, not as one long word", () => {
    const zh = { line: "第二个码头在高峰时段有帮助但冬天没有帮助而且成本更高", summary: null, fate: "PARTLY_HELD" as const };
    expect(pathReallyChanged(zh, after({ line: `${zh.line}。` }))).toBe(false);
    expect(pathReallyChanged(zh, after({ line: "冬季客流减半所以这个项目不值得继续投入资金" }))).toBe(true);
  });
});

describe("the ids make a resume the same turn", () => {
  it("a level's and a version's id are the same on every run and differ per step and trigger", () => {
    const dig = "22222222-2222-4222-8222-222222222222";
    expect(pathUpdateIdOf(dig, 1)).toBe(pathUpdateIdOf(dig.toUpperCase(), 1));
    expect(pathUpdateIdOf(dig, 1)).not.toBe(pathUpdateIdOf(dig, 2));
    expect(pathUpdateIdOf(dig, 1)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(mainAnswerUpdateIdOf(dig, "PATH_REWRITE", dig)).not.toBe(mainAnswerUpdateIdOf(dig, "PATH_UPDATE", dig));
  });
});

describe("the call sites", () => {
  it("each site carries its one role, on the story lane only", () => {
    expect(pathRewriteCallSiteKey("WRITER", 2, "PATH_CLIMB")).toBe("PATH_CLIMB:WRITER:2");
    expect(PATH_CLIMB_CALL_SITE.test("PATH_CLIMB:CHECKER:4")).toBe(true);
    expect(ANSWER_UPDATE_CALL_SITE.test("ANSWER_UPDATE:STORY:1")).toBe(false);
    expect(pathClimbCallSiteRole("PATH_CLIMB:WRITER:1")).toBe("SYNTHESIZER");
    expect(answerUpdateCallSiteRole("ANSWER_UPDATE:ANSWER_CHECK:1")).toBe("EVALUATOR");
    for (const [callSiteKey, role] of [["PATH_CLIMB:WRITER:1", "SYNTHESIZER"], ["PATH_CLIMB:CHECKER:1", "EVALUATOR"],
      ["ANSWER_UPDATE:ANSWER:1", "SYNTHESIZER"], ["ANSWER_UPDATE:ANSWER_CHECK:1", "EVALUATOR"]] as const) {
      expect(storyCallScopeAgrees({ lane: "story", callSiteKey, role })).toBe(true);
      expect(storyCallScopeAgrees({ lane: "story", callSiteKey, role: role === "SYNTHESIZER" ? "EVALUATOR" : "SYNTHESIZER" })).toBe(false);
      expect(storyCallScopeAgrees({ lane: "served", callSiteKey, role })).toBe(false);
    }
  });
  it("run at the steps their prompts are", () => {
    const step = (callSiteKey: string) => previewThinkingStepOf({ lane: "story", callSiteKey, role: "SYNTHESIZER" } as never);
    expect(step("PATH_CLIMB:WRITER:1")).toBe("path_rewrite_writer");
    expect(step("PATH_CLIMB:CHECKER:1")).toBe("path_rewrite_checker");
    expect(step("ANSWER_UPDATE:ANSWER:1")).toBe("answer_writer");
    expect(step("ANSWER_UPDATE:ANSWER_CHECK:1")).toBe("answer_checker");
  });
});

describe("the money: never walled, each under its own source", () => {
  const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
  const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
  const STORY_CEILING = 100_000;
  /** A never-walled seam never asks what a person has left: asking would throw here. */
  const ALLOWANCE: PersonAllowanceSource = { read: async () => { throw new Error("A_NEVER_WALLED_SEAM_ASKED_THE_LIMIT"); } };
  const guardOver = (spent: Readonly<{ climb?: number; answer?: number; recorded?: ModelSpendEntry[] }>) => {
    const store: ModelSpendStore = {
      recordSpend: async (entry) => { spent.recorded?.push(entry); },
      readRunSpentMicros: async () => 0, readRunStorySpentMicros: async () => 0, readRunPathRewriteSpentMicros: async () => 0,
      readRunInvestigationReportSpentMicros: async () => 0,
      readRunPathClimbSpentMicros: async () => spent.climb ?? 0, readRunAnswerUpdateSpentMicros: async () => spent.answer ?? 0,
      readDaySpentMicros: async () => 0,
      admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
    };
    return new CostEnvelopeGuard({ store, policy: { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, perStoryCeilingMicros: STORY_CEILING, closingCeilingMicros: 440_000 },
      clock: () => new Date("2026-10-10T12:00:00.000Z"),
      sharedWall: { finishBasisPoints: null, persons: ALLOWANCE,
        owners: { readRunChargeOwnerRef: async () => "owner", readOwnerSpentMicros: async () => 1_000_000_000 } } });
  };
  const seamInput = { runId: "run-1", price: PRICE, requireReportedUsage: true } as const;
  const outcome = (value: unknown) => Promise.resolve(value).then(() => "ADMITTED",
    (error: unknown) => isMonthWallReached(error) ? "MONTH_WALL" : error instanceof TypedDomainError ? error.code : "UNTYPED");

  it("no limit of the person's is asked: the climb and the answer update are always admitted", async () => {
    expect(await outcome(guardOver({}).pathClimbSeam(seamInput).assertCallAllowed(PROJECTION))).toBe("ADMITTED");
    expect(await outcome(guardOver({}).answerUpdateSeam(seamInput).assertCallAllowed(PROJECTION))).toBe("ADMITTED");
  });
  it("the climb's safety net holds one rewrite per level, past one rewrite's ceiling and refused past all of them", async () => {
    expect(await outcome(guardOver({ climb: STORY_CEILING * 3 }).pathClimbSeam(seamInput).assertCallAllowed(PROJECTION))).toBe("ADMITTED");
    expect(await outcome(guardOver({ climb: STORY_CEILING * 10 }).pathClimbSeam(seamInput).assertCallAllowed(PROJECTION))).toBe("STORY_COST_ENVELOPE_REACHED");
  });
  it("each charge is recorded under its own source", async () => {
    const recorded: ModelSpendEntry[] = [];
    const guard = guardOver({ recorded });
    for (const seam of [guard.pathClimbSeam(seamInput), guard.answerUpdateSeam(seamInput)]) {
      const admission = await seam.assertCallAllowed(PROJECTION);
      await seam.recordCall({ providerRef: "ref-a", usage: { prompt_tokens: 10, completion_tokens: 5 }, projection: PROJECTION,
        ...(admission === undefined ? {} : { admission }) });
    }
    expect(recorded.map((entry) => [entry.spendSource, entry.runId, entry.chargeMicros])).toEqual([["PATH_CLIMB", "run-1", 15], ["ANSWER_UPDATE", "run-1", 15]]);
  });
});
