// tests/unit/practice-web-tables.test.ts
// W5-2 (Perplexity plan and dig-model revision, 2026-10-30): the practice report's web table (per path: searches, pages
// read, the top pages with each reader's grade and the reader spread, extracts kept and dropped, "Sure" counts, money and
// time) and its rewrite table (per dig: level, picks by who wrote them, rounds, checker objections, the verdict outcome,
// fate before and after, money and time). Counts and codes only; each joins report.json and report.md only when present.
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import type { PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { debateReport, reportMarkdown, usd } from "../../tools/preview-practice/practice-report.js";
import {
  practiceRewriteBlock, practiceRewriteLines, readPracticeRewrites, type PracticeRewriteFacts
} from "../../tools/preview-practice/practice-rewrites.js";
import {
  practicePathNamedBy, practicePlaceWebCalls, practiceProposedExtracts, practiceWebBlock, practiceWebCallIndex, practiceWebLines, readPracticeWeb,
  type PracticeWebFacts
} from "../../tools/preview-practice/practice-web.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 1, 9, 0, 0) + seconds * 1000);
const P = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Two paths: p1 searched (one search failed), p2 with no search planned; one path the planner never decided (p3). */
const FACTS: PracticeWebFacts = Object.freeze({
  search: "PERPLEXITY",
  plan: [{ pathRef: "p1", status: "PLANNED" }, { pathRef: "p2", status: "NO_SEARCH_PLANNED" }],
  searches: [
    { searchId: "s1", pathRef: "p1", outcome: "FOUND", chargeMicros: 1000, searchedAt: at(0) },
    { searchId: "s2", pathRef: "p1", outcome: "FAILED", chargeMicros: 0, searchedAt: at(1) },
    { searchId: "s3", pathRef: "p3", outcome: "EMPTY", chargeMicros: 1000, searchedAt: at(2) }
  ],
  pages: [{ pageId: P(1), searchId: "s1" }, { pageId: P(2), searchId: "s1" }, { pageId: P(3), searchId: "s1" }, { pageId: P(4), searchId: "s1" }],
  readings: [
    { pageId: P(1), reader: 1, outcome: "READ", grade: 3 }, { pageId: P(1), reader: 2, outcome: "READ", grade: 1 },
    { pageId: P(1), reader: 3, outcome: "READ", grade: 2 },
    { pageId: P(2), reader: 1, outcome: "READ", grade: 2 }, { pageId: P(2), reader: 2, outcome: "FAILED", grade: null },
    { pageId: P(3), reader: 1, outcome: "READ", grade: 1 },
    { pageId: P(4), reader: 1, outcome: "FAILED", grade: null }
  ],
  extracts: [{ pathRef: "p1", label: "S1-1", foundBy: [1, 2, 3] }, { pathRef: "p1", label: "S1-2", foundBy: [1] }],
  picks: [{ pathRef: "p1", rank: 2, pageId: P(2) }, { pathRef: "p1", rank: 1, pageId: P(1) }],
  packs: [{ pathRef: "p1", extractLabels: ["S1-1"] }],
  calls: [
    { callSiteKey: "WEB:plan", pathRef: null, costNanoUsd: 7n, startedAt: at(0), finishedAt: at(1), proposedExtracts: 0 },
    { callSiteKey: "WEB:read1:0:0", pathRef: "p1", costNanoUsd: 100n, startedAt: at(3), finishedAt: at(10), proposedExtracts: 5 },
    { callSiteKey: "WEB:pick:0", pathRef: "p1", costNanoUsd: 20n, startedAt: at(10), finishedAt: at(12), proposedExtracts: 0 },
    { callSiteKey: "WEB:read-top:0:2", pathRef: "p1", costNanoUsd: 30n, startedAt: at(12), finishedAt: at(20), proposedExtracts: 2 },
    { callSiteKey: "WEB:read-top:0:3", pathRef: null, costNanoUsd: 40n, startedAt: at(12), finishedAt: at(25), proposedExtracts: 1 }
  ],
  points: [
    { wayOfKnowing: "LOOKED_UP", locator: "S1-1", reviewOutcome: "agree" },
    { wayOfKnowing: "LOOKED_UP", locator: "S1-2", reviewOutcome: "agree" },
    { wayOfKnowing: "LOOKED_UP", locator: "S1-1 and a remembered report", reviewOutcome: "agree" },
    { wayOfKnowing: "LOOKED_UP", locator: "S1-1", reviewOutcome: "dispute" },
    { wayOfKnowing: "REASONING", locator: null, reviewOutcome: "agree" },
    { wayOfKnowing: "LOOKED_UP", locator: "S1-1", reviewOutcome: null }
  ]
});

describe("W5-2 the web table", () => {
  it("counts each path: plan, searches, pages, the top pages' grades and spread, extracts kept and dropped, Sure, money and time", () => {
    const block = practiceWebBlock(FACTS);
    expect(block.paths.map((row) => row.pathRef)).toEqual(["p1", "p2", "p3"]);
    expect(block.paths[0]).toEqual({
      pathRef: "p1", plan: "PLANNED", searches: 2, searchesAnswered: 1, searchesFailed: 1, pagesFound: 4, pagesRead: 3,
      top: [{ rank: 1, grades: [3, 1, 2], spread: 2 }, { rank: 2, grades: [2, null, null], spread: null }],
      // 7 proposed by the path's readers, 4 kept (S1-1 by three readers, S1-2 by one): 3 dropped. The unplaced call is not the path's.
      extractsKept: 2, extractsDropped: 3, extractsInPack: 1,
      // Serve's rule: the whole locator is one of this debate's extracts and the reviewer agreed.
      sure: 2, aiCostNanoUsd: "150", searchFeeMicros: 1000, searchFeeNotPaidMicros: 0, seconds: 20
    });
    expect(block.paths[1]).toMatchObject({ pathRef: "p2", plan: "NO_SEARCH_PLANNED", searches: 0, pagesFound: 0, top: [], sure: 0,
      aiCostNanoUsd: "0", seconds: null });
    expect(block.paths[2]).toMatchObject({ pathRef: "p3", plan: null, searches: 1, searchesAnswered: 1, searchFeeMicros: 1000 });
    expect(block.planner).toEqual({ calls: 1, costNanoUsd: "7" });
    expect(block.unplacedCalls).toBe(1);
    // Agreed but not on a checked extract: the remembered mixed locator and the reasoned point.
    expect(block.sureForCaseNamed).toBe(2);
    expect(block.totals).toEqual({ searches: 3, pagesRead: 3, extractsKept: 2, extractsDropped: 3, sure: 2, aiCostNanoUsd: "197",
      searchFeeMicros: 2000, searchFeeNotPaidMicros: 0, seconds: 25 });
    expect(Object.isFrozen(block.paths[0])).toBe(true);
  });

  it("on the stand-in no search fee is paid: the price list's figure moves to 'not paid'", () => {
    const block = practiceWebBlock({ ...FACTS, search: "STAND_IN" });
    expect(block.paths[0]).toMatchObject({ searchFeeMicros: 0, searchFeeNotPaidMicros: 1000 });
    expect(block.totals).toMatchObject({ searchFeeMicros: 0, searchFeeNotPaidMicros: 2000 });
    expect(practiceWebLines(block, usd).join("\n")).toContain("search fee $0 (not paid $0.002000000)");
  });

  it("shows one table row per path, counts and codes only", () => {
    const lines = practiceWebLines(practiceWebBlock(FACTS), usd);
    expect(lines).toContain("| path | plan | searches (answered / failed) | pages read / found | top pages (rank: grades 1/2/3) | reader spread | "
      + "extracts kept | extracts dropped | in pack | Sure | AI cost $ | search fee $ | time s |");
    expect(lines).toContain("| p1 | PLANNED | 2 (1 / 1) | 3 / 4 | 1: 3/1/2, 2: 2/-/- | 2, - | 2 | 3 | 1 | 2 | 0.000000150 | 0.001000000 | 20 |");
    expect(lines).toContain("| p2 | NO_SEARCH_PLANNED | 0 (0 / 0) | 0 / 0 | - | - | 0 | 0 | 0 | 0 | 0.000000000 | 0.000000000 | - |");
    expect(lines).toContain("- \"Sure, for the case named\" at most (agreed, but not on a checked extract of this debate): 2");
  });

  // CodeQL js/incomplete-sanitization (PR #224): a backslash is escaped before a pipe, so the text's own backslash can
  // never turn the escaped pipe back into a column break.
  it("escapes a backslash before a pipe in a path's cell", () => {
    const odd = "p\\|x";
    const facts: PracticeWebFacts = Object.freeze({ ...FACTS, plan: [{ pathRef: odd, status: "NO_SEARCH_PLANNED" as const }] });
    const row = practiceWebLines(practiceWebBlock(facts), usd).find((line) => line.startsWith("| p\\\\"));
    expect(row?.startsWith("| p\\\\\\|x | NO_SEARCH_PLANNED |")).toBe(true);
  });

  it("reads the call's answer index, its path from the pages its prompt names, and a reader's proposed extracts", async () => {
    expect(practiceWebCallIndex("WEB:read1:3:1")).toBe(3);
    expect(practiceWebCallIndex("WEB:pick:0")).toBe(0);
    expect(practiceWebCallIndex("WEB:read-top:2:3")).toBe(2);
    expect(practiceWebCallIndex("WEB:plan")).toBeNull();
    const pathOfPage = new Map([[P(2), "p1"]]);
    expect(practicePathNamedBy(`{"pages":[{"page_id":"web-page-text:${P(9)}@ab"},{"page_id":"web-page-text:${P(2)}@cd"}]}`, pathOfPage)).toBe("p1");
    expect(practicePathNamedBy("no page here", pathOfPage)).toBeNull();
    // A pick names its pages by short prompt ids: it takes the path its index was first placed on by a reader.
    const prompts: Record<string, string> = { "WEB:read1:0:0": `web-page-text:${P(2)}@ab`, "WEB:pick:0": "{\"pages\":[\"p1\"]}",
      "WEB:pick:1": "{}" };
    expect(await practicePlaceWebCalls(["WEB:plan", "WEB:read1:0:0", "WEB:pick:0", "WEB:pick:1"].map((callSiteKey) => ({ callSiteKey })),
      pathOfPage, async (call) => prompts[call.callSiteKey] ?? null)).toEqual([null, "p1", "p1", null]);
    expect(practiceProposedExtracts(JSON.stringify({ pages: [{ extracts: ["a", "b"] }, { extracts: [] }, { grade: 1 }] }))).toBe(2);
    expect(practiceProposedExtracts("```json\n{\"pages\":[{\"extracts\":[\"a\"]}]}\n```")).toBe(1);
    expect(practiceProposedExtracts("not json")).toBe(0);
    expect(practiceProposedExtracts(null)).toBe(0);
  });

  it("is absent (today's keys) when the run's web step left no row", async () => {
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
    expect(await readPracticeWeb(pool, "r", "PERPLEXITY")).toBeNull();
  });
});

const DIG = (overrides: Partial<PracticeRewriteFacts> = {}): PracticeRewriteFacts => ({
  digRunId: "aaaaaaaa-1111-4111-8111-111111111111", level: 2,
  pickAuthors: ["AI_SUGGESTION", "PERSON_EDITED", "PERSON_OWN_VIEW", "AI_SUGGESTION"],
  rewrite: { outcome: "READY_WITH_RESERVATION", failureCode: null, fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD",
    verdictOutcome: "HELPED", verdictScope: "PATH", rounds: 2 },
  calls: [
    { callSiteKey: "PATH_REWRITE:WRITER:1", costNanoUsd: 300n, startedAt: at(0), finishedAt: at(9), objected: null },
    { callSiteKey: "PATH_REWRITE:CHECKER:1", costNanoUsd: 50n, startedAt: at(9), finishedAt: at(12), objected: true },
    { callSiteKey: "PATH_REWRITE:WRITER:2", costNanoUsd: 310n, startedAt: at(12), finishedAt: at(20), objected: null },
    { callSiteKey: "PATH_REWRITE:CHECKER:2", costNanoUsd: 55n, startedAt: at(20), finishedAt: at(24), objected: false }
  ],
  ...overrides
});

describe("W5-2 the rewrite table", () => {
  it("counts each dig: level, picks by author, rounds, checker objections, outcome, verdict, fates, money and time", () => {
    const block = practiceRewriteBlock([DIG(), DIG({ digRunId: "bbbbbbbb-2222-4222-8222-222222222222", level: 3,
      pickAuthors: ["PERSON_OWN_VIEW"], calls: [],
      rewrite: { outcome: "FAILED", failureCode: "PATH_REWRITE_ALL_WRITERS_FAILED", fateBefore: "FELL", fateAfter: null,
        verdictOutcome: null, verdictScope: null, rounds: 0 } }), DIG({ digRunId: "cccccccc", level: null, rewrite: null, calls: [] })]);
    expect(block.digs[0]).toEqual({ digRunId: "aaaaaaaa-1111-4111-8111-111111111111", level: 2,
      picks: { aiSuggestion: 2, personEdited: 1, personOwnView: 1 }, rounds: 2, checkerCalls: 2, checkerObjections: 1,
      outcome: "READY_WITH_RESERVATION", failureCode: null, verdict: "HELPED / PATH", fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD",
      costNanoUsd: "715", seconds: 24 });
    expect(block.digs[1]).toMatchObject({ level: 3, picks: { aiSuggestion: 0, personEdited: 0, personOwnView: 1 }, outcome: "FAILED",
      failureCode: "PATH_REWRITE_ALL_WRITERS_FAILED", verdict: null, fateBefore: "FELL", fateAfter: null, seconds: null });
    expect(block.digs[2]).toMatchObject({ level: null, outcome: "NONE", rounds: 0, fateBefore: null });
  });

  it("shows one row per dig, codes and counts only", () => {
    const lines = practiceRewriteLines(practiceRewriteBlock([DIG()]), usd);
    expect(lines).toContain("| dig | level | picks (AI / edited / own view) | rounds | checker objections | outcome | verdict | fate before → after | cost $ | time s |");
    expect(lines).toContain("| aaaaaaaa | 2 | 2 / 1 / 1 | 2 | 1 of 2 | READY_WITH_RESERVATION | HELPED / PATH | HELD_UP → PARTLY_HELD | 0.000000715 | 24 |");
    expect(practiceRewriteLines(practiceRewriteBlock([]), usd)).toContain("| - | - | - | - | - | - | - | - | - | - |");
  });

  it("is absent (today's keys) when the run has no dig", async () => {
    const queries: string[] = [];
    const pool = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } } as unknown as Pool;
    expect(await readPracticeRewrites(pool, "r")).toBeNull();
    expect(queries[0]).toContain("WITH RECURSIVE");
  });
});

describe("W5-2 both tables in the report", () => {
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
  const report = (extra: object) => debateReport({ result: { ...base, ...extra } as unknown as PracticeDebateResult,
    observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1000) });

  it("joins report.json and report.md when the debate has them, and only then", () => {
    const web = practiceWebBlock(FACTS);
    const rewrites = practiceRewriteBlock([DIG()]);
    const withBoth = report({ web, rewrites });
    expect(withBoth.web).toEqual(web);
    expect(withBoth.rewrites).toEqual(rewrites);
    const markdown = reportMarkdown(withBoth);
    expect(markdown).toContain("| p1 | PLANNED | 2 (1 / 1) |");
    expect(markdown).toContain("| aaaaaaaa | 2 | 2 / 1 / 1 |");
    const without = report({});
    expect(Object.keys(without)).not.toContain("web");
    expect(Object.keys(without)).not.toContain("rewrites");
    expect(reportMarkdown(without)).not.toContain("Web search per path");
    expect(reportMarkdown(without)).not.toContain("Path rewrites per dig");
  });
});
