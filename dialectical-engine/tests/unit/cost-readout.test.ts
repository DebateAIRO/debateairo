import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  COST_JOB_NONE,
  COST_JOB_WORDS,
  COST_READOUT_MAX_DAYS,
  COST_STEP_RUN_WITHOUT_CALL,
  COST_STEP_WEB_SEARCH,
  COST_STEP_WORDS,
  WEB_SEARCH_PROVIDER_REF,
  buildCostReadout,
  callSiteFamily,
  costJobCode,
  costReadoutDollars,
  costReadoutLastDays,
  costReadoutSpan,
  costStepCode,
  renderCostReadout,
  type CostReadout,
  type CostReadoutGroup
} from "@debateai/budget";
import { DEBATE_ROLES, TypedDomainError } from "@debateai/kernel";
import { parseCostReadoutEnvironment } from "@debateai/register";
import {
  COST_READOUT_DEFAULT_DAYS,
  assertCostReadoutConnection,
  parseCostReadoutArgs,
  runCostReadoutCli,
  type OpenCostReadoutReader
} from "../../apps/runner/src/cost-readout-cli.js";

/**
 * The owner's cost read-out, `pnpm ops:cost-readout`: where the money for AI calls went, by step, by job, by model and
 * by run. These tests cover every decision without a database. The read over a real database, and the read-only
 * connection, are in tests/integration/cost-readout-database.test.ts.
 */

const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";

/** Every call-site shape the engine builds today, with the step it belongs to. */
const SITES: readonly { readonly key: string; readonly family: string }[] = [
  { key: "JUDGE", family: "JUDGE" },
  { key: "JUDGE:seat:main", family: "JUDGE" },
  { key: "JUDGE:root:secondary", family: "JUDGE:root" },
  { key: "JUDGE:root:2", family: "JUDGE:root" },
  { key: "JUDGE:root:secondary:seat:runnerUp", family: "JUDGE:root" },
  { key: "JUDGE:defender:root0:r0:p0", family: "JUDGE:defender" },
  { key: "JUDGE:critic:root1:r2:p3", family: "JUDGE:critic" },
  { key: "JUDGE:cross-root:0->1", family: "JUDGE:cross-root" },
  { key: "JUDGE:cross-root:1->0:seat:runnerUp", family: "JUDGE:cross-root" },
  { key: "PANEL:root:provider:test-layer", family: "PANEL" },
  { key: "PANEL:JUDGE:critic:root0:r1:p0:provider:x", family: "PANEL" },
  { key: "PANEL:JUDGE:seat:runnerUp:provider:x", family: "PANEL" },
  { key: "JUDGE:review:11111111-1111-4111-8111-111111111111", family: "JUDGE:review" },
  { key: "JUDGE:review:#", family: "JUDGE:review" },
  { key: "JUDGE:review:catch-up:invocation-1:#", family: "JUDGE:review" },
  { key: "VERDICT:judge:3", family: "VERDICT:judge" },
  { key: "VERDICT:investigate:2", family: "VERDICT:investigate" },
  { key: "STOPPING:round:1", family: "STOPPING:round" },
  { key: "MAP:gap:1", family: "MAP:gap" },
  { key: "MAP:gap-paths:1", family: "MAP:gap-paths" },
  { key: "WEB:plan", family: "WEB:plan" },
  { key: "WEB:read1:0:3", family: "WEB:read1" },
  { key: "WEB:pick:0", family: "WEB:pick" },
  { key: "WEB:read-top:0:2", family: "WEB:read-top" },
  { key: "WEB_RESEARCHED:read1", family: "WEB_RESEARCHED:read1" },
  { key: "WEB_RESEARCHED:read-top:3", family: "WEB_RESEARCHED:read-top" },
  { key: "PATH_OUTCOME:WRITER:1:1", family: "PATH_OUTCOME:WRITER" },
  { key: "PATH_OUTCOME:CHECKER:8:2", family: "PATH_OUTCOME:CHECKER" },
  { key: "COMPOSER:SYNTHESIZER:INITIAL:1", family: "COMPOSER:SYNTHESIZER" },
  { key: "COMPOSER:SYNTHESIZER:RETRY:2:seat:runnerUp", family: "COMPOSER:SYNTHESIZER" },
  { key: "POST_COMPOSE_R9:EVALUATOR:1", family: "POST_COMPOSE_R9:EVALUATOR" },
  { key: "POST_COMPOSE_R9:EVALUATOR:1:BACKUP", family: "POST_COMPOSE_R9:EVALUATOR" },
  { key: "REPAIR:STRUCTURE:JUDGE:root:0", family: "REPAIR:STRUCTURE" },
  { key: "WEB:plan:seat:runnerUp", family: "WEB:plan" },
  { key: "STORY:STORYTELLER:8", family: "STORY:STORYTELLER" },
  { key: "STORY:CHECKER:1", family: "STORY:CHECKER" },
  { key: "STORY:CHARTS:1", family: "STORY:CHARTS" },
  { key: "PATH_REWRITE:WRITER:1", family: "PATH_REWRITE:WRITER" },
  { key: "PATH_REWRITE:CHECKER:4", family: "PATH_REWRITE:CHECKER" },
  { key: "PATH_REWRITE:SUGGEST:12", family: "PATH_REWRITE:SUGGEST" },
  { key: "PATH_CLIMB:WRITER:1", family: "PATH_CLIMB:WRITER" },
  { key: "PATH_CLIMB:CHECKER:2", family: "PATH_CLIMB:CHECKER" },
  { key: "CONTRIBUTION_CHECK:CHECKER:2", family: "CONTRIBUTION_CHECK:CHECKER" },
  ...["INVESTIGATION_REPORT", "PUBLIC_REPORT"].flatMap((source) => ["ANSWER", "ANSWER_ASKED", "ANSWER_CHECK", "STORY", "STORY_CHECK"]
    .map((site) => ({ key: `${source}:${site}:1`, family: `${source}:${site}` }))),
  ...["ANSWER", "ANSWER_ASKED", "ANSWER_CHECK"].map((site) => ({ key: `ANSWER_UPDATE:${site}:4`, family: `ANSWER_UPDATE:${site}` }))
];

/** Every source a charge can carry (the ledger's own list). Each is a step by itself when a charge names no call. */
const SOURCES = ["SUPPORT", "STORY", "LANGUAGE_CHECK", "SYNTHESIS_CHECK", "QUESTION_CHECK", "PATH_REWRITE", "INVESTIGATION_REPORT",
  "PATH_CLIMB", "ANSWER_UPDATE", "CONTRIBUTION_CHECK", "PUBLIC_REPORT", "ASK_CLARIFY", "PRE_START"] as const;

function group(overrides: Partial<CostReadoutGroup> = {}): CostReadoutGroup {
  return Object.freeze({
    spendSource: "RUN", modelRole: null, callSiteKey: null, providerRef: "provider:a", maker: "Maker A", modelId: "maker-a/model-1",
    charges: 1, chargeMicros: 1_000, inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, cachedReportedCharges: 0,
    ...overrides
  });
}

/** A small week: the panel is the dearest step, one call is a web search, one charge has no call on record. */
const GROUPS: readonly CostReadoutGroup[] = Object.freeze([
  group({ modelRole: "JUDGE", callSiteKey: "PANEL:root:provider:a", charges: 40, chargeMicros: 6_000_000, inputTokens: 900_000, outputTokens: 20_000, cachedInputTokens: 300_000, cachedReportedCharges: 30 }),
  group({ modelRole: "JUDGE", callSiteKey: "PANEL:JUDGE:critic:root0:r1:p0:provider:c", providerRef: "provider:c", maker: "Maker C", modelId: "maker-c/model-2", charges: 20, chargeMicros: 2_500_000, inputTokens: 400_000, outputTokens: 9_000 }),
  group({ modelRole: "REVIEWER", callSiteKey: "JUDGE:review:#", providerRef: "provider:c", maker: "Maker C", modelId: "maker-c/model-2", charges: 30, chargeMicros: 1_500_000, inputTokens: 200_000, outputTokens: 6_000 }),
  group({ modelRole: "POSITION", callSiteKey: "JUDGE:root:0", charges: 4, chargeMicros: 800_000, inputTokens: 50_000, outputTokens: 12_000, cachedInputTokens: 10_000, cachedReportedCharges: 4 }),
  group({ callSiteKey: "WEB:read1:0:0", charges: 9, chargeMicros: 450_000, inputTokens: 300_000, outputTokens: 3_000 }),
  group({ callSiteKey: null, providerRef: WEB_SEARCH_PROVIDER_REF, maker: null, modelId: null, charges: 12, chargeMicros: 12_000, inputTokens: 0, outputTokens: 0 }),
  group({ spendSource: "STORY", callSiteKey: "STORY:STORYTELLER:1", charges: 2, chargeMicros: 700_000, inputTokens: 80_000, outputTokens: 8_000 }),
  group({ spendSource: "PRE_START", callSiteKey: null, maker: null, modelId: null, providerRef: "provider:small", charges: 5, chargeMicros: 38_000, inputTokens: 9_000, outputTokens: 900 }),
  group({ callSiteKey: null, maker: null, modelId: null, providerRef: "provider:a", charges: 1, chargeMicros: 500, inputTokens: 40, outputTokens: 4 })
]);

const WEEK: CostReadout = buildCostReadout({
  scope: { kind: "DAYS", from: "2026-11-06", to: "2026-11-12" },
  groups: GROUPS,
  runs: { count: 3, medianMicros: 4_000_000, ninetiethMicros: 7_600_000, dearest: [
    { runId: RUN_A, chargeMicros: 8_000_000, charges: 80 },
    { runId: RUN_B, chargeMicros: 4_000_000, charges: 43 }
  ] }
});

describe("the cost read-out names a step from what the ledger records about a call", () => {
  it.each(SITES)("reads the family of '$key' as $family", ({ key, family }) => {
    expect(callSiteFamily(key)).toBe(family);
  });

  it("has words for every step the engine's call sites produce today, and for every source of a charge", () => {
    for (const { key } of SITES) {
      const code = costStepCode({ spendSource: "RUN", callSiteKey: key, providerRef: "provider:a" });
      expect(COST_STEP_WORDS[code], code).toEqual(expect.any(String));
    }
    for (const source of SOURCES) {
      expect(COST_STEP_WORDS[costStepCode({ spendSource: source, callSiteKey: null, providerRef: "provider:a" })], source).toEqual(expect.any(String));
    }
  });

  it("the sources it has words for are the ledger's own list, as its newest migration states it", async () => {
    const folder = new URL("../../migrations/", import.meta.url);
    const lists: string[] = [];
    for (const file of (await readdir(folder)).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(file, folder), "utf8");
      lists.push(...[...sql.matchAll(/model_spend_spend_source_check\s+CHECK \(spend_source IN \(([^)]*)\)/gu)].map((match) => match[1]!));
    }
    const newest = lists.at(-1)!.split(",").map((name) => name.trim().replace(/'/gu, ""));
    expect([...newest].sort()).toEqual(["RUN", ...SOURCES].sort());
  });

  it("inside a debate the step is the call site's family, a web search has its own step, and a charge with no call is not dropped", () => {
    expect(costStepCode({ spendSource: "RUN", callSiteKey: "JUDGE:defender:root0:r0:p0", providerRef: "provider:a" })).toBe("JUDGE:defender");
    expect(costStepCode({ spendSource: "RUN", callSiteKey: null, providerRef: WEB_SEARCH_PROVIDER_REF })).toBe(COST_STEP_WEB_SEARCH);
    expect(costStepCode({ spendSource: "RUN", callSiteKey: null, providerRef: "provider:a" })).toBe(COST_STEP_RUN_WITHOUT_CALL);
    expect(costStepCode({ spendSource: "RUN", callSiteKey: "", providerRef: "provider:a" })).toBe(COST_STEP_RUN_WITHOUT_CALL);
  });

  it("outside a debate the source is the step, and the call site adds which part of it was paid for", () => {
    expect(costStepCode({ spendSource: "PRE_START", callSiteKey: null, providerRef: "provider:a" })).toBe("PRE_START");
    expect(costStepCode({ spendSource: "STORY", callSiteKey: "STORY:CHECKER:2", providerRef: "provider:a" })).toBe("STORY:CHECKER");
    expect(costStepCode({ spendSource: "CONTRIBUTION_CHECK", callSiteKey: "CONTRIBUTION_CHECK:CHECKER:1", providerRef: "provider:a" })).toBe("CONTRIBUTION_CHECK:CHECKER");
    // A call site of another family is printed after the source: neither name is lost.
    expect(costStepCode({ spendSource: "PATH_CLIMB", callSiteKey: "PATH_REWRITE:WRITER:2", providerRef: "provider:a" })).toBe("PATH_CLIMB/PATH_REWRITE:WRITER");
  });

  it("a step this file has no words for still gets its own line, under its code", () => {
    const readout = buildCostReadout({ scope: { kind: "RUN", runId: RUN_A }, runs: null, groups: [
      group({ callSiteKey: "NEW_STEP:something:4", chargeMicros: 9_000 }),
      group({ spendSource: "NEW_SOURCE", callSiteKey: null, chargeMicros: 4_000 })
    ] });
    expect(readout.steps.map((line) => [line.code, line.words])).toEqual([["NEW_STEP:something", null], ["NEW_SOURCE", null]]);
    expect(renderCostReadout(readout)).toContain("\nNEW_STEP:something  ");
  });

  it("reads the job the ledger recorded, else the one the call site names, else none of the seven", () => {
    expect(costJobCode({ modelRole: "REVIEWER", callSiteKey: "JUDGE:root:0" })).toBe("REVIEWER");
    expect(costJobCode({ modelRole: null, callSiteKey: "JUDGE:review:#" })).toBe("REVIEWER");
    expect(costJobCode({ modelRole: null, callSiteKey: "WEB:read1:0:0" })).toBe(COST_JOB_NONE);
    expect(costJobCode({ modelRole: "NOT_A_JOB", callSiteKey: null })).toBe(COST_JOB_NONE);
    expect(Object.keys(COST_JOB_WORDS).sort()).toEqual([...DEBATE_ROLES, COST_JOB_NONE].sort());
  });
});

describe("the cost read-out adds the groups up", () => {
  it("every table's lines add up to the total, and the dearest line comes first", () => {
    expect(WEEK.total).toEqual({
      charges: 123, chargeMicros: 12_000_500, inputTokens: 1_939_040, outputTokens: 58_904,
      cachedInputTokens: 310_000, cachedReportedCharges: 34
    });
    for (const lines of [WEEK.steps, WEEK.jobs, WEEK.models]) {
      expect(lines.reduce((sum, line) => sum + line.chargeMicros, 0)).toBe(WEEK.total.chargeMicros);
      expect(lines.reduce((sum, line) => sum + line.charges, 0)).toBe(WEEK.total.charges);
      expect(lines.map((line) => line.chargeMicros)).toEqual([...lines.map((line) => line.chargeMicros)].sort((a, b) => b - a));
    }
    expect(WEEK.steps.map((line) => [line.code, line.chargeMicros])).toEqual([
      ["PANEL", 8_500_000], ["JUDGE:review", 1_500_000], ["JUDGE:root", 800_000], ["STORY:STORYTELLER", 700_000],
      ["WEB:read1", 450_000], ["PRE_START", 38_000], [COST_STEP_WEB_SEARCH, 12_000], [COST_STEP_RUN_WITHOUT_CALL, 500]
    ]);
    expect(WEEK.jobs.map((line) => [line.code, line.chargeMicros])).toEqual([
      ["JUDGE", 8_500_000], ["REVIEWER", 1_500_000], [COST_JOB_NONE, 1_200_500], ["POSITION", 800_000]
    ]);
    expect(WEEK.models.map((line) => [line.code, line.words, line.chargeMicros])).toEqual([
      ["maker-a/model-1", "Maker A", 7_950_000], ["maker-c/model-2", "Maker C", 4_000_000],
      ["provider:small", null, 38_000], [WEB_SEARCH_PROVIDER_REF, null, 12_000], ["provider:a", null, 500]
    ]);
  });

  it("lines of the same cost keep one order, by code", () => {
    const readout = buildCostReadout({ scope: { kind: "RUN", runId: RUN_A }, runs: null, groups: [
      group({ callSiteKey: "WEB:pick:0" }), group({ callSiteKey: "JUDGE:root:0" }), group({ callSiteKey: "PANEL:root:provider:a" })
    ] });
    expect(readout.steps.map((line) => line.code)).toEqual(["JUDGE:root", "PANEL", "WEB:pick"]);
  });

  it("refuses a row that is not a count, and one that reports more cached charges than it has charges", () => {
    for (const bad of [{ chargeMicros: -1 }, { charges: 1.5 }, { inputTokens: Number.NaN }, { cachedReportedCharges: 2 }]) {
      expect(() => buildCostReadout({ scope: { kind: "RUN", runId: RUN_A }, runs: null, groups: [group(bad)] }))
        .toThrowError(expect.objectContaining({ code: "COST_READOUT_ROW_INVALID" }));
    }
  });
});

describe("the cost read-out prints numbers, codes and model names", () => {
  it("prints a span: the total, what the vendor had seen before, the runs, then the four tables", () => {
    expect(renderCostReadout(WEEK)).toBe([
      "cost read-out: 2026-11-06 to 2026-11-12, by the UTC day of each charge",
      "total: $12.00 in 123 charges",
      "input tokens: 1,939,040",
      "  seen before by the vendor, and billed at its cheaper rate: at least 310,000 (16.0%)",
      "  reported for 34 of the 123 charges; for the rest it is unknown, which is not zero",
      "output tokens: 58,904",
      "runs with a charge: 3 (a run is one debate or one dig)",
      "  half of them cost $4.00 or less; one in ten cost more than $7.60",
      "",
      "by step                                             charges     cost  share      input  seen before  output",
      "grading the points (the panel) [PANEL]                   60    $8.50  70.8%  1,300,000      300,000  29,000",
      "the second AI's check of each point [JUDGE:review]       30    $1.50  12.5%    200,000      unknown   6,000",
      "writing the positions [JUDGE:root]                        4  $0.8000   6.7%     50,000       10,000  12,000",
      "writing the story [STORY:STORYTELLER]                     2  $0.7000   5.8%     80,000      unknown   8,000",
      "reading the pages found (reader 1) [WEB:read1]            9  $0.4500   3.7%    300,000      unknown   3,000",
      "suggesting paths before Start [PRE_START]                 5  $0.0380   0.3%      9,000      unknown     900",
      "web searches, a flat price each [WEB_SEARCH]             12  $0.0120   0.1%          0      unknown       0",
      "inside a debate, with no call on record [RUN]             1  $0.0005   0.0%         40      unknown       4",
      "",
      "by job (the seven the model picker chooses for)  charges     cost  share      input  seen before  output",
      "grading a point [JUDGE]                               60    $8.50  70.8%  1,300,000      300,000  29,000",
      "checking a point as the second AI [REVIEWER]          30    $1.50  12.5%    200,000      unknown   6,000",
      "none of the seven jobs [NO_JOB]                       29    $1.20  10.0%    389,040      unknown  11,904",
      "writing a position [POSITION]                          4  $0.8000   6.7%     50,000       10,000  12,000",
      "",
      "by model                       charges     cost  share      input  seen before  output",
      "Maker A [maker-a/model-1]           55    $7.95  66.2%  1,330,000      310,000  43,000",
      "Maker C [maker-c/model-2]           50    $4.00  33.3%    600,000      unknown  15,000",
      "provider:small                       5  $0.0380   0.3%      9,000      unknown     900",
      "search:perplexity-search-fast       12  $0.0120   0.1%          0      unknown       0",
      "provider:a                           1  $0.0005   0.0%         40      unknown       4",
      "",
      "the 2 dearest runs",
      `  ${RUN_A}  $8.00  80 charges`,
      `  ${RUN_B}  $4.00  43 charges`,
      ""
    ].join("\n"));
  });

  it("prints one run without the runs part, and says so when nothing reported what the vendor had seen", () => {
    const text = renderCostReadout(buildCostReadout({ scope: { kind: "RUN", runId: RUN_A }, runs: null, groups: [
      group({ modelRole: "ANSWER_WRITER", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", chargeMicros: 2_340_000 })
    ] }));
    expect(text.split("\n").slice(0, 5)).toEqual([
      `cost read-out: run ${RUN_A}, everything charged to it`,
      "total: $2.34 in 1 charge",
      "input tokens: 100",
      "  seen before by the vendor: unknown, no call reported it",
      "output tokens: 10"
    ]);
    expect(text).not.toContain("runs with a charge");
    expect(text).not.toContain("dearest");
    expect(text).toContain("writing the main answer [COMPOSER:SYNTHESIZER]");
  });

  it("says so when nothing was charged", () => {
    expect(renderCostReadout(buildCostReadout({ scope: { kind: "DAYS", from: "2026-11-06", to: "2026-11-06" }, groups: [],
      runs: { count: 0, medianMicros: null, ninetiethMicros: null, dearest: [] } })))
      .toBe("cost read-out: 2026-11-06 to 2026-11-06, by the UTC day of each charge\nno charge on record\n");
  });

  it("prints dollars with two decimals from a dollar up and four below it", () => {
    expect([0, 500, 999_999, 1_000_000, 1_234_567_890].map(costReadoutDollars))
      .toEqual(["$0.00", "$0.0005", "$1.0000", "$1.00", "$1,234.57"]);
  });
});

describe("the cost read-out's span is whole UTC days, both ends counted", () => {
  it("counts back from today, across a month's end", () => {
    expect(costReadoutLastDays(7, new Date("2026-11-03T23:59:59.000Z"))).toEqual({ kind: "DAYS", from: "2026-10-28", to: "2026-11-03" });
    expect(costReadoutLastDays(1, new Date("2028-03-01T00:00:00.000Z"))).toEqual({ kind: "DAYS", from: "2028-03-01", to: "2028-03-01" });
    expect(costReadoutLastDays(2, new Date("2028-03-01T00:00:00.000Z")).from).toBe("2028-02-29");
  });

  it("refuses a day that does not exist, an end before its start, and a span longer than a year and a day", () => {
    expect(costReadoutSpan("2026-11-01", "2026-11-01")).toEqual({ kind: "DAYS", from: "2026-11-01", to: "2026-11-01" });
    expect(costReadoutSpan("2026-01-01", "2027-01-01").from).toBe("2026-01-01");
    for (const [from, to] of [["2026-02-30", "2026-03-01"], ["2026-11-02", "2026-11-01"], ["2026-1-01", "2026-01-02"],
      ["2026-01-01", "2027-01-02"], ["yesterday", "2026-01-02"]] as const) {
      expect(() => costReadoutSpan(from, to), `${from}..${to}`).toThrowError(expect.objectContaining({ code: "COST_READOUT_SPAN_INVALID" }));
    }
    for (const days of [0, -1, 1.5, COST_READOUT_MAX_DAYS + 1]) {
      expect(() => costReadoutLastDays(days, new Date("2026-11-13T00:00:00.000Z"))).toThrowError(expect.objectContaining({ code: "COST_READOUT_SPAN_INVALID" }));
    }
  });
});

function recorder(): { stdout: string[]; stderr: string[]; output: { stdout(text: string): void; stderr(text: string): void } } {
  const stdout: string[] = [], stderr: string[] = [];
  return { stdout, stderr, output: { stdout: (text) => { stdout.push(text); }, stderr: (text) => { stderr.push(text); } } };
}

function reader(overrides: Partial<Awaited<ReturnType<OpenCostReadoutReader>>> = {}): { open: OpenCostReadoutReader; calls: string[] } {
  const calls: string[] = [];
  return { calls, open: async () => {
    calls.push("open");
    return {
      readDays: async (span) => { calls.push(`days:${span.from}..${span.to}`); return WEEK; },
      readRun: async (runId) => { calls.push(`run:${runId}`); return null; },
      close: async () => { calls.push("close"); },
      ...overrides
    };
  } };
}

const NOW = (): Date => new Date("2026-11-13T09:00:00.000Z");

describe("the cost read-out command", () => {
  it("reads the arguments as one request, or none", () => {
    expect(parseCostReadoutArgs([])).toEqual({ kind: "LAST_DAYS", days: COST_READOUT_DEFAULT_DAYS, json: false });
    expect(parseCostReadoutArgs(["--json"])).toEqual({ kind: "LAST_DAYS", days: 7, json: true });
    expect(parseCostReadoutArgs(["--days", "30"])).toEqual({ kind: "LAST_DAYS", days: 30, json: false });
    expect(parseCostReadoutArgs(["--to", "2026-11-07", "--json", "--from", "2026-11-01"])).toEqual({ kind: "SPAN", from: "2026-11-01", to: "2026-11-07", json: true });
    expect(parseCostReadoutArgs(["--run", RUN_A])).toEqual({ kind: "RUN", runId: RUN_A, json: false });
    for (const bad of [["--days"], ["--days", "0"], ["--days", "7.5"], ["--days", "7", "--days", "8"], ["--from", "2026-11-01"],
      ["--days", "7", "--run", RUN_A], ["--from", "2026-11-01", "--to", "2026-11-07", "--days", "3"], ["--run", "not-an-id"],
      ["--json", "--json"], ["--week"], ["7"]]) {
      expect(parseCostReadoutArgs(bad), bad.join(" ")).toBeNull();
    }
  });

  it("with no arguments reads the last seven days up to today, prints the read-out and closes the connection", async () => {
    const { output, stdout, stderr } = recorder(), { open, calls } = reader();
    expect(await runCostReadoutCli([], output, open, NOW)).toBe(0);
    expect(calls).toEqual(["open", "days:2026-11-07..2026-11-13", "close"]);
    expect(stdout.join("")).toBe(renderCostReadout(WEEK));
    expect(stderr).toEqual([]);
  });

  it("prints the same numbers as one JSON object when asked", async () => {
    const { output, stdout } = recorder(), { open, calls } = reader();
    expect(await runCostReadoutCli(["--from", "2026-11-06", "--to", "2026-11-12", "--json"], output, open, NOW)).toBe(0);
    expect(calls).toEqual(["open", "days:2026-11-06..2026-11-12", "close"]);
    expect(JSON.parse(stdout.join(""))).toEqual(JSON.parse(JSON.stringify(WEEK)));
  });

  it("refuses arguments it cannot read, and a span that does not exist, before the database is opened", async () => {
    for (const args of [["--week"], ["--from", "2026-02-30", "--to", "2026-03-01"], ["--from", "2026-11-07", "--to", "2026-11-01"]]) {
      const { output, stdout, stderr } = recorder(), { open, calls } = reader();
      expect(await runCostReadoutCli(args, output, open, NOW), args.join(" ")).toBe(2);
      expect(stderr).toEqual(["COST_READOUT_USAGE\n"]);
      expect(stdout).toEqual([]);
      expect(calls).toEqual([]);
    }
  });

  it("says so, by one code, when nothing was charged to the run", async () => {
    const { output, stdout, stderr } = recorder(), { open, calls } = reader();
    expect(await runCostReadoutCli(["--run", RUN_A], output, open, NOW)).toBe(1);
    expect(calls).toEqual(["open", `run:${RUN_A}`, "close"]);
    expect(stderr).toEqual(["COST_READOUT_RUN_NOT_FOUND\n"]);
    expect(stdout).toEqual([]);
  });

  it("prints a failure as one code and never its message, and still closes the connection", async () => {
    const cases: readonly [unknown, string][] = [
      [new TypedDomainError("COST_READOUT_ROW_INVALID", "charges is not a whole number"), "COST_READOUT_ROW_INVALID"],
      [new TypeError("COST_READOUT_PRINCIPAL_INVALID"), "COST_READOUT_PRINCIPAL_INVALID"],
      [new TypeError("DATABASE_URL_TLS_REQUIRED:DATABASE_URL"), "DATABASE_URL_TLS_REQUIRED:DATABASE_URL"],
      [Object.assign(new Error("invalid"), { name: "ZodError" }), "COST_READOUT_ENVIRONMENT_INVALID"],
      [new Error("connect ECONNREFUSED 10.0.0.1:5432 password=secret"), "COST_READOUT_FAILED"]
    ];
    for (const [error, code] of cases) {
      const { output, stdout, stderr } = recorder(), { open, calls } = reader({ readDays: async () => { throw error; } });
      expect(await runCostReadoutCli([], output, open, NOW)).toBe(1);
      expect(stderr).toEqual([`${code}\n`]);
      expect(stdout).toEqual([]);
      expect(calls).toEqual(["open", "close"]);
    }
    const { output, stderr } = recorder();
    expect(await runCostReadoutCli([], output, async () => { throw new TypeError("COST_READOUT_CONNECTION_NOT_READ_ONLY"); }, NOW)).toBe(1);
    expect(stderr).toEqual(["COST_READOUT_CONNECTION_NOT_READ_ONLY\n"]);
  });

  it("reads only through a read-only connection, and in production only as the runner's own principal", async () => {
    const pool = (role: string, readOnly: string) => ({ query: async () => ({ rows: [{ role, read_only: readOnly }] }) }) as never;
    await expect(assertCostReadoutConnection(pool("debateai_prod_runner_runtime", "on"), true)).resolves.toBeUndefined();
    await expect(assertCostReadoutConnection(pool("anyone", "on"), false)).resolves.toBeUndefined();
    await expect(assertCostReadoutConnection(pool("debateai_prod_runner_runtime", "off"), true)).rejects.toThrowError(/^COST_READOUT_CONNECTION_NOT_READ_ONLY$/u);
    await expect(assertCostReadoutConnection(pool("debateai_prod_api_system", "on"), true)).rejects.toThrowError(/^COST_READOUT_PRINCIPAL_INVALID$/u);
  });

  it("takes the runner's DATABASE_URL through its own loader, with the production floors", () => {
    expect(parseCostReadoutEnvironment({
      DATABASE_URL: "postgresql://runner@localhost/debateai?host=/var/run/postgresql", NODE_ENV: "production", OTHER: "x"
    })).toEqual({ DATABASE_URL: "postgresql://runner@localhost/debateai?host=/var/run/postgresql", NODE_ENV: "production" });
    expect(() => parseCostReadoutEnvironment({
      DATABASE_URL: "postgresql://runner:pw@db.example.test/debateai", NODE_ENV: "production"
    })).toThrowError(/^DATABASE_URL_TLS_REQUIRED:DATABASE_URL$/u);
    expect(() => parseCostReadoutEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("is a package script, reads no process.env itself, and is documented in the money runbook", async () => {
    const [manifest, cli, readme] = await Promise.all([
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../apps/runner/src/cost-readout-cli.ts", import.meta.url), "utf8"),
      readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8")
    ]);
    const scripts = (JSON.parse(manifest) as { scripts: Record<string, string> }).scripts;
    expect(scripts["ops:cost-readout"]).toBe("tsx apps/runner/src/cost-readout-cli.ts");
    expect(cli).not.toContain(["process", "env"].join("."));
    expect(cli).toContain("loadCostReadoutEnvironment()");
    const money = readme.slice(readme.indexOf("### The cost envelopes (V-28)"), readme.indexOf("### Publishing the settings register on this host"));
    expect(money).toContain("#### Where the money went: the cost read-out");
    expect(money).toContain("pnpm ops:cost-readout");
    expect(money).toContain("--property=EnvironmentFile=/etc/debateai/runner.env");
  });
});
