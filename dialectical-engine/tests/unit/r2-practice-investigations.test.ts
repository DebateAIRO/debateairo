// tests/unit/r2-practice-investigations.test.ts
// R2 (E12, E13; INTERFACE §15.4): the practice report counts the "cannot assess" reviews and what was done about them
// (investigations run, capped, skipped, failed; each outcome; standings moved; money and time), and names the two new
// engine-2 calls (the investigator and the comparing judge) in its per-AI table.
import { describe, expect, it } from "vitest";
import { comparingJudgeCallSiteKey, pointInvestigationCallSiteKey } from "@debateai/kernel";
import { ROSTER_ORDER, type PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { practiceInvestigationBlock, practiceInvestigationLines } from "../../tools/preview-practice/practice-investigations.js";
import { callFamilyOf, practiceStepOf } from "../../tools/preview-practice/practice-lanes.js";
import { debateReport, reportMarkdown, usd } from "../../tools/preview-practice/practice-report.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 16, 10, 0, 0) + seconds * 1000);
const BLOCK_INPUT = {
  reviewOutcomes: ["agree", "cannot-assess", "dispute", "cannot-assess", "cannot-assess", "cannot-assess", "cannot-assess"],
  rows: [
    { result: "HOLDS", standingsMoved: true }, { result: "DEAD_END", standingsMoved: false },
    { result: "INVESTIGATION_CAPPED", standingsMoved: null }, { result: "INVESTIGATION_SKIPPED", standingsMoved: null },
    { result: "INVESTIGATION_UNAVAILABLE", standingsMoved: null }
  ],
  calls: [{ startedAt: at(0), finishedAt: at(20) }, { startedAt: at(5), finishedAt: at(41.4) }, { startedAt: at(6), finishedAt: at(9) }],
  costNanoUsd: 3000000n
};

describe("R2 practice: the engine-2 call families", () => {
  it.each([
    [pointInvestigationCallSiteKey(1), "INVESTIGATOR"], [pointInvestigationCallSiteKey(2), "INVESTIGATOR"],
    [comparingJudgeCallSiteKey(1), "VERDICT_JUDGE"], [comparingJudgeCallSiteKey(3), "VERDICT_JUDGE"],
    ["JUDGE:review:abc", "REVIEW"], ["JUDGE", "JUDGE"], ["PANEL:root:preview:m1", "PANEL"]
  ] as const)("reads %s as %s", (key, family) => {
    expect(callFamilyOf(key)).toBe(family);
  });

  it("reads their steps as the length row and the thinking table do", () => {
    expect(practiceStepOf(pointInvestigationCallSiteKey(1))).toBe("investigator");
    expect(practiceStepOf(comparingJudgeCallSiteKey(2))).toBe("comparing_judge");
  });

  it("orders the per-AI table: reviews, investigations, the comparing judges, then the writers", () => {
    expect(ROSTER_ORDER).toEqual(["MAP", "JUDGE", "PANEL", "REVIEW", "INVESTIGATOR", "VERDICT_JUDGE", "SYNTHESIZER", "EVALUATOR",
      "STORYTELLER", "STORY_CHECKER", "STRUCTURE_REPAIR", "UNMAPPED"]);
  });
});

describe("R2 practice: the investigations block (E12, E13)", () => {
  it("counts each result, the calls made, the standings moved, the money and the step's time", () => {
    const block = practiceInvestigationBlock(BLOCK_INPUT);
    expect(block).toEqual({ cannotAssessReviews: 5, run: 3, capped: 1, skipped: 1, unavailable: 1, holds: 1, fails: 0, deadEnd: 1,
      standingsMoved: 1, costNanoUsd: "3000000", seconds: 41 });
    expect(Object.keys(block)).toEqual(["cannotAssessReviews", "run", "capped", "skipped", "unavailable", "holds", "fails", "deadEnd",
      "standingsMoved", "costNanoUsd", "seconds"]);
    expect(Object.isFrozen(block)).toBe(true);
  });

  it("is all zero but the cannot-assess count on a debate that ran no investigation (engine 1)", () => {
    expect(practiceInvestigationBlock({ reviewOutcomes: ["cannot-assess", "agree"], rows: [], calls: [], costNanoUsd: 0n })).toEqual({
      cannotAssessReviews: 1, run: 0, capped: 0, skipped: 0, unavailable: 0, holds: 0, fails: 0, deadEnd: 0, standingsMoved: 0,
      costNanoUsd: "0", seconds: 0 });
  });

  it("shows one table row of counts, never a text", () => {
    const lines = practiceInvestigationLines(practiceInvestigationBlock(BLOCK_INPUT), usd);
    expect(lines).toContain("| cannot-assess reviews | investigated | holds | fails | dead end | call failed | no other maker | over the cap | standings moved | cost $ | time s |");
    expect(lines).toContain("| 5 | 3 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 0.003000000 | 41 |");
  });

  it("joins report.json and report.md when the debate has it, and only then", () => {
    const none = { before: null, after: null };
    const base = {
      register: null, questionId: "ro", depth: 1,
      admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
      run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null,
        answer: { served: true, terminal: "SERVED", serveState: null, verdictState: null, conditionMarks: [] },
        story: { outcome: "READY", failureCode: null } },
      byModelAndSite: [], probes: [], failures: [], formatFailures: 0, callsByModel: {}, answersByModel: {}, jsonRepairs: [],
      failedCalls: 0, refusedCalls: 0, remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 }
    };
    const block = practiceInvestigationBlock(BLOCK_INPUT);
    const report = debateReport({ result: { ...base, investigations: block } as unknown as PracticeDebateResult,
      observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1000) });
    expect(report.investigations).toEqual(block);
    expect(reportMarkdown(report)).toContain("| 5 | 3 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 0.003000000 | 41 |");
    const without = debateReport({ result: base as unknown as PracticeDebateResult, observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1000) });
    expect(Object.keys(without)).not.toContain("investigations");
    expect(reportMarkdown(without)).not.toContain("cannot-assess reviews");
  });
});
