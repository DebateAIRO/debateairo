// tests/unit/r2-practice-investigations.test.ts
// R2 (E12, E13; INTERFACE §15.4): the practice report counts the "cannot assess" reviews and what was done about them
// (investigations run, capped, skipped, failed; each outcome; standings moved; money and time), and names the two new
// engine-2 calls (the investigator and the comparing judge) in its per-AI table.
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { comparingJudgeCallSiteKey, pointInvestigationCallSiteKey } from "@debateai/kernel";
import { ROSTER_ORDER, type PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { practiceInvestigationBlock, practiceInvestigationLines, readPracticeInvestigations } from "../../tools/preview-practice/practice-investigations.js";
import { callFamilyOf, practiceStepOf } from "../../tools/preview-practice/practice-lanes.js";
import { debateReport, reportMarkdown, usd } from "../../tools/preview-practice/practice-report.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 16, 10, 0, 0) + seconds * 1000);
const times = <T>(count: number, row: T): T[] => Array.from({ length: count }, () => row);
// Fix round 1 (Minor 2): every counter has its own value (fails 1, holds 2, standings moved 3, dead end 4, unavailable 5,
// skipped 6, capped 8; asked 12; cannot assess 30), so two swapped columns in the table turn the test red.
const BLOCK_INPUT = {
  reviewOutcomes: ["agree", ...times(30, "cannot-assess"), "dispute"],
  rows: [
    ...times(2, { result: "HOLDS", standingsMoved: true }), { result: "FAILS", standingsMoved: true },
    { result: "DEAD_END", standingsMoved: false }, ...times(3, { result: "DEAD_END", standingsMoved: null }),
    ...times(8, { result: "INVESTIGATION_CAPPED", standingsMoved: null }), ...times(6, { result: "INVESTIGATION_SKIPPED", standingsMoved: null }),
    ...times(5, { result: "INVESTIGATION_UNAVAILABLE", standingsMoved: null })
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
    expect(block).toEqual({ cannotAssessReviews: 30, run: 12, capped: 8, skipped: 6, unavailable: 5, holds: 2, fails: 1, deadEnd: 4,
      standingsMoved: 3, costNanoUsd: "3000000", seconds: 41 });
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
    expect(lines).toContain("| cannot-assess reviews | asked | holds | fails | dead end | unavailable (call failed or money) | no other maker | over the cap | standings moved | cost $ | time s |");
    expect(lines).toContain("| 30 | 12 | 2 | 1 | 4 | 5 | 6 | 8 | 3 | 0.003000000 | 41 |");
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
    expect(reportMarkdown(report)).toContain("| 30 | 12 | 2 | 1 | 4 | 5 | 6 | 8 | 3 | 0.003000000 | 41 |");
    const without = debateReport({ result: base as unknown as PracticeDebateResult, observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1000) });
    expect(Object.keys(without)).not.toContain("investigations");
    expect(reportMarkdown(without)).not.toContain("cannot-assess reviews");
  });
});

/**
 * Fix round 1 (Important 1): a later copy that took the run over after a crash (migration 0119) writes its own tree; the
 * dead copy's nodes are set aside ('stale') and A10's reader skips them. The practice's readers skip them too.
 */
describe("R2 practice: a set-aside (stale) node is never counted", () => {
  const STALE_FILTER = "node.generation_status IS DISTINCT FROM 'stale'";
  type Row = Readonly<Record<string, unknown>> & { stale: boolean };
  /** A stand-in database: each table's rows, live and stale; the stale ones drop out only when the query filters them. */
  const fakePool = (tables: Readonly<Record<"node_review" | "point_investigation" | "ledger_entry", readonly Row[]>>) => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        const table = sql.includes("ledger.node_review") ? "node_review" : sql.includes("ledger.point_investigation") ? "point_investigation"
          : "ledger_entry";
        const filtered = sql.includes("JOIN core.node AS node") && sql.includes(STALE_FILTER);
        return { rows: tables[table].filter((row) => !(filtered && row.stale)) };
      }
    } as unknown as Pool;
    return { pool, queries };
  };

  it("counts only the live copy's reviews and investigations", async () => {
    const { pool, queries } = fakePool({
      node_review: [{ outcome: "cannot-assess", stale: false }, { outcome: "cannot-assess", stale: true }, { outcome: "agree", stale: false }],
      point_investigation: [{ result: "HOLDS", standings_moved: true, stale: false },
        { result: "FAILS", standings_moved: true, stale: true }],
      // No node column: a dead copy's calls are counted on purpose (that money was really spent).
      ledger_entry: [{ started_at: at(0), finished_at: at(7), stale: false }]
    });
    const block = await readPracticeInvestigations(pool, "r", [{ site: "INVESTIGATOR", costNanoUsd: "5" }, { site: "REVIEW", costNanoUsd: "9" }]);
    expect(block).toEqual({ cannotAssessReviews: 1, run: 1, capped: 0, skipped: 0, unavailable: 0, holds: 1, fails: 0, deadEnd: 0,
      standingsMoved: 1, costNanoUsd: "5", seconds: 7 });
    expect(queries.find((sql) => sql.includes("ledger.point_investigation"))).toContain("ORDER BY investigation.investigation_order, investigation.node_id");
  });

  it("every practice read of the reviews and the investigations skips the set-aside nodes (report and transcript graph agree)", () => {
    for (const file of ["practice-investigations.ts", "practice-engine-graph.ts"]) {
      const source = readFileSync(new URL(`../../tools/preview-practice/${file}`, import.meta.url), "utf8");
      const reads = [...source.matchAll(/FROM ledger\.(node_review|point_investigation)\b[\s\S]*?(?:`|"), \[/g)].map((match) => match[0]);
      expect(reads.length, file).toBe(2);
      for (const read of reads) {
        expect(read, file).toContain("JOIN core.node AS node ON node.run_id = ");
        expect(read, file).toContain(STALE_FILTER);
      }
    }
  });
});
