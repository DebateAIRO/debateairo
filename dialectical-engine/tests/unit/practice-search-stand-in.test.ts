// tests/unit/practice-search-stand-in.test.ts
// W5-2 (Perplexity plan 2026-10-30): the Perplexity stand-in's self-test on made-up pages. A whole web step runs on it
// through the runner's OWN search settings (runnerWebSearchSettings, as main.ts and the practice compose it), with the
// stand-in in the search gate's place behind the real adapter and the real guarded fetch; the web table comes out of what
// the step stored; and no fee is recorded for a search. Plus the saved-replies source and the "never in main.ts" guard.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPreviewGuardedFetch, PERPLEXITY_SEARCH_CHARGE_MICROS, type PreviewGateSettings } from "@debateai/providers";
import { runnerWebSearchSettings } from "../../apps/runner/src/run-settings.js";
import { runRunnerWebStep } from "../../apps/runner/src/web-step.js";
import type { PracticeDebateResult } from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { replyContentOf } from "../../tools/preview-practice/practice-lanes.js";
import { debateReport, reportMarkdown, usd } from "../../tools/preview-practice/practice-report.js";
import type { PracticeRunnerSettings } from "../../tools/preview-practice/practice-runner-composition.js";
import {
  PRACTICE_STAND_IN_SEARCH_SOCKET, practiceMadeUpSearchReplies, practiceSavedSearchReplies, practiceSearchStandIn,
  practiceStandInSearchPort, practiceWithSearchStandIn
} from "../../tools/preview-practice/practice-search-stand-in.js";
import {
  practiceCallCostNanoUsd, practicePlaceWebCalls, practiceProposedExtracts, practiceWebBlock, practiceWebLines,
  type PracticeWebFacts
} from "../../tools/preview-practice/practice-web.js";
import { PATHS, membersOf, memoryStore, stepInput, team, type Vendor } from "../support/web-step-world.js";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const ENGINE_ROOT = new URL("../../", import.meta.url).pathname;
/** The preview's gate part with no search socket, as the practice's settings name it today. */
const GATE = Object.freeze({ budget_socket: "/run/debateai-v3-preview/budget-v2.sock", scope_id: "preview" }) as unknown as PreviewGateSettings;

/** The web table's facts from the in-memory 0132 store and the scripted AIs' records, as readPracticeWeb reads 0132. */
async function factsOf(store: ReturnType<typeof memoryStore>, vendors: readonly Vendor[],
  points: PracticeWebFacts["points"], plan: PracticeWebFacts["plan"]): Promise<PracticeWebFacts> {
  const searches = [...store.searches.values()].map((row) => ({ searchId: row.searchId as string, pathRef: row.pathRef as string,
    outcome: row.outcome as string, chargeMicros: row.chargeMicros as number, searchedAt: null }));
  const pathOfSearch = new Map(searches.map((row) => [row.searchId, row.pathRef]));
  const pages = [...store.pages.values()].map((row) => ({ pageId: row.pageId as string, searchId: row.searchId as string }));
  const pathOfPage = new Map(pages.map((page) => [page.pageId, pathOfSearch.get(page.searchId)!]));
  // As the ledger holds them: every call in the order it started.
  const ledger = vendors.flatMap((vendor) => vendor.ledger.map((entry) => ({ vendor, entry })))
    .sort((a, b) => a.entry.startedAt.getTime() - b.entry.startedAt.getTime());
  const placed = await practicePlaceWebCalls(ledger.map(({ vendor, entry }) => ({ callSiteKey: entry.callSiteKey, vendor, entry })),
    pathOfPage, async ({ vendor, entry }) => vendor.prompts.find((candidate) => candidate.attemptId === entry.attemptId)?.promptText ?? null);
  const calls = ledger.map(({ vendor, entry }, at) => {
    const artifact = vendor.artifacts.find((candidate) => candidate.artifactId === entry.rawArtifactRef) ?? null;
    const reads = entry.callSiteKey.startsWith("WEB:read1:") || entry.callSiteKey.startsWith("WEB:read-top:");
    return { callSiteKey: entry.callSiteKey, pathRef: placed[at]!,
      costNanoUsd: practiceCallCostNanoUsd(artifact?.model ?? "", artifact?.metadata ?? null), startedAt: entry.startedAt, finishedAt: entry.finishedAt,
      proposedExtracts: reads && artifact !== null ? practiceProposedExtracts(replyContentOf(artifact.rawText)) : 0 };
  });
  return {
    search: "STAND_IN", plan, searches, pages,
    readings: [...store.readings.values()].map((row) => ({ pageId: row.pageId as string, reader: row.reader as number,
      outcome: row.outcome as string, grade: row.grade as number | null })),
    extracts: [...store.extracts.values()].map((row) => ({ pathRef: pathOfPage.get(row.pageId as string)!, label: row.label as string,
      foundBy: row.foundBy as number[] })),
    picks: [...store.picks.entries()].flatMap(([pathRef, pageIds]) => pageIds.map((pageId, index) => ({ pathRef, rank: index + 1, pageId }))),
    packs: [...store.packs.values()].map((row) => ({ pathRef: row.pathRef as string, extractLabels: row.extractLabels as string[] })),
    calls, points
  };
}

describe("W5-2 the Perplexity stand-in: a whole web step on made-up pages", () => {
  it("plugs in at the search gate's place: the runner's own search settings send every search through the real adapter to it", async () => {
    const standIn = practiceSearchStandIn(practiceMadeUpSearchReplies());
    const plugged = practiceWithSearchStandIn({ PREVIEW_GATE_SETTINGS: GATE } as unknown as PracticeRunnerSettings, {}, standIn);
    expect(plugged.environment.PREVIEW_GATE_SETTINGS.perplexity_budget_socket).toBe(PRACTICE_STAND_IN_SEARCH_SOCKET);
    expect(plugged.budgetPorts.perplexity).toBe(standIn.gate);
    // The very call main.ts and the practice's composition make (local mode: no money guard, so no search seam).
    const settings = runnerWebSearchSettings({ pool: { query: async () => ({ rows: [{ plan_id: "PLUS" }] }) } as never,
      previewGate: plugged.environment.PREVIEW_GATE_SETTINGS, fetch: createPreviewGuardedFetch(plugged.budgetPorts), guardOf: null });
    expect(settings.switchedOn).toBe(true);
    expect(settings.searchSeamOf).toBeNull();

    const ais = team();
    const store = memoryStore();
    const base = stepInput({ members: membersOf(ais.all), search: settings.search!, prepare: store.prepare });
    const result = await runRunnerWebStep({ ...base, pool: {} as never, settings, lane: null,
      readers: { siteLanguage: async () => null, dig: async () => null },
      stepPorts: { prepare: store.prepare, recordPlanPathStatuses: base.recordPlanPathStatuses } });

    expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual([["a1", "SEARCHED"], ["a2", "SEARCHED"]]);
    // Every search was answered by the stand-in, with made-up pages, and nothing was spent.
    expect(standIn.counts()).toEqual({ source: "MADE_UP", searches: 4, byKind: { MADE_UP: 4 }, results: 12, spentNanoUsd: "0" });
    expect([...store.searches.values()].map((row) => row.outcome)).toEqual(["FOUND", "FOUND", "FOUND", "FOUND"]);

    // The web table, from what the step stored: per path its searches, pages, top 3 with each reader's grade, the extracts.
    const extractLabel = [...store.extracts.values()].map((row) => row.label as string).find((label) => label.startsWith("S1-"))!;
    const block = practiceWebBlock(await factsOf(store, ais.all, [
      { wayOfKnowing: "LOOKED_UP", locator: extractLabel, reviewOutcome: "agree" },
      { wayOfKnowing: "LOOKED_UP", locator: "an old report, remembered", reviewOutcome: "agree" },
      { wayOfKnowing: "REASONING", locator: null, reviewOutcome: "agree" },
      { wayOfKnowing: "LOOKED_UP", locator: extractLabel, reviewOutcome: "dispute" }
    ], base.planStatuses[0]!.map((entry) => ({ pathRef: entry.pathId, status: entry.status }))));
    const [a1, a2] = block.paths;
    expect(a1).toMatchObject({ pathRef: "a1", plan: "PLANNED", searches: 2, searchesAnswered: 2, searchesFailed: 0, pagesFound: 6,
      // Reader 1's extracts on the 3 pages that were not top pages are not kept (only the top pages' extracts are).
      pagesRead: 6, extractsDropped: 3, sure: 1, searchFeeMicros: 0, searchFeeNotPaidMicros: 2 * PERPLEXITY_SEARCH_CHARGE_MICROS });
    expect(a1!.top).toEqual([{ rank: 1, grades: [2, 3, 3], spread: 1 }, { rank: 2, grades: [2, 3, 3], spread: 1 },
      { rank: 3, grades: [2, 3, 3], spread: 1 }]);
    expect(a1!.extractsKept).toBe([...store.extracts.values()].filter((row) => (row.label as string).startsWith("S1-")).length);
    expect(a1!.extractsInPack).toBeGreaterThan(0);
    expect(a2).toMatchObject({ pathRef: "a2", searches: 2, pagesRead: 6, sure: 0, searchFeeMicros: 0 });
    // Every reader and pick call was placed on its path; only the planner is apart.
    expect(block.unplacedCalls).toBe(0);
    expect(block.planner.calls).toBe(1);
    expect(block.sureForCaseNamed).toBe(2);
    // No fee is recorded for a search: none paid, the price list's figure shown apart as not paid.
    expect(block.totals).toMatchObject({ searches: 4, pagesRead: 12, sure: 1, searchFeeMicros: 0, searchFeeNotPaidMicros: 4 * PERPLEXITY_SEARCH_CHARGE_MICROS });

    const lines = practiceWebLines(block, usd).join("\n");
    expect(lines).toContain("searches answered by the practice's stand-in: no search was paid");
    expect(lines).toContain("| a1 | PLANNED | 2 (2 / 0) | 6 / 6 | 1: 2/3/3, 2: 2/3/3, 3: 2/3/3 | 1, 1, 1 |");
    expect(lines).toContain("search fee $0 (not paid $0.004000000)");
    // Counts only: no page text, title, address or search words reach the table.
    for (const query of ["harbour ferry pier queue times", "made-up page", "madeup-", ".example"]) expect(lines).not.toContain(query);

    // The table joins report.json and report.md.
    const none = { before: null, after: null };
    const report = debateReport({ result: { register: null, questionId: "ro", depth: 1,
      admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
      run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null, answer: null, story: null },
      byModelAndSite: [], probes: [], failures: [], formatFailures: 0, failedCalls: 0, refusedCalls: 0,
      remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 }, web: block } as unknown as PracticeDebateResult,
    observer: new PracticeGateObserver(), startedAt: new Date(0), finishedAt: new Date(1000) });
    expect(report.web).toEqual(block);
    expect(reportMarkdown(report)).toContain("Web search per path (W5-2;");
  });

  it("the search port helper is the same chain: a step handed it directly searches on the stand-in, paying nothing", async () => {
    const standIn = practiceSearchStandIn(practiceMadeUpSearchReplies(2));
    const ais = team();
    const store = memoryStore();
    const result = await runRunnerWebStep({ ...stepInput({ members: membersOf(ais.all), search: practiceStandInSearchPort(standIn), prepare: store.prepare }),
      pool: {} as never, lane: null,
      settings: { switchedOn: true, search: practiceStandInSearchPort(standIn), searchSubject: {} as never, searchSeamOf: null, readRunPlan: async () => "PLUS" },
      readers: { siteLanguage: async () => null, dig: async () => null },
      stepPorts: { prepare: store.prepare, recordPlanPathStatuses: async () => undefined } });
    expect(result.paths.map((path) => path.status)).toEqual(["SEARCHED", "SEARCHED"]);
    expect(result.paths.map((path) => path.pageIds.length)).toEqual([4, 4]);
    expect(standIn.counts().spentNanoUsd).toBe("0");
  });

  it("without a stand-in the practice's runner inputs are exactly as given", () => {
    const environment = { PREVIEW_GATE_SETTINGS: GATE } as unknown as PracticeRunnerSettings;
    const ports = {};
    const plugged = practiceWithSearchStandIn(environment, ports, undefined);
    expect(plugged.environment).toBe(environment);
    expect(plugged.budgetPorts).toBe(ports);
  });

  it("is only the practice's: main.ts and the runner's settings never import it", () => {
    for (const file of ["apps/runner/src/main.ts", "apps/runner/src/run-settings.ts", "apps/runner/src/web-step.ts",
      "tools/preview-practice/practice-runner-composition.ts"]) {
      const source = read(file);
      expect(source).not.toContain("practice-search-stand-in");
      expect(source).not.toMatch(/practiceSearchStandIn|practiceStandInSearchPort|practiceWithSearchStandIn/u);
    }
  });
});

describe("W5-2 the Perplexity stand-in: saved replies from a local folder", () => {
  const saved = (query: string, urls: readonly string[]) => JSON.stringify({ pid: "C3P1", query,
    body: { query, max_results: 5 }, seconds: 1.2,
    response: { id: "saved", results: urls.map((url, index) => ({ title: `T${String(index)}`, url, snippet: `Saved text ${String(index)}.`,
      date: "2025-01-01", last_updated: "2025-02-01", extra: "left out" })) } });

  it("answers a matching search with its own reply, any other with the next unused one, then with no results", () => {
    const folder = mkdtempSync(join(tmpdir(), "practice-stand-in-"));
    writeFileSync(join(folder, "a.json"), saved("ferry riders 2025", ["https://a.example/1", "https://b.example/2"]));
    writeFileSync(join(folder, "b.json"), saved("bus lanes", ["https://c.example/3"]));
    writeFileSync(join(folder, "c.json"), "not a reply");
    mkdirSync(join(folder, "pc"));
    const replies = practiceSavedSearchReplies(folder, ENGINE_ROOT);
    expect(replies.files).toBe(2);
    expect(replies.skipped).toBe(1);
    const asked = replies.answer("bus lanes", 5);
    expect(asked.kind).toBe("SAVED_MATCH");
    expect(asked.results).toEqual([{ title: "T0", url: "https://c.example/3", snippet: "Saved text 0.", date: "2025-01-01", last_updated: "2025-02-01" }]);
    const other = replies.answer("words the planner wrote today", 1);
    expect(other.kind).toBe("SAVED_IN_ORDER");
    expect(other.results.map((result) => result.url)).toEqual(["https://a.example/1"]);
    expect(replies.answer("one more", 5)).toEqual({ kind: "NONE_LEFT", results: [] });
  });

  it("refuses a folder inside the repository (saved replies are never committed)", () => {
    expect(() => practiceSavedSearchReplies(join(ENGINE_ROOT, "tests"), ENGINE_ROOT)).toThrow("PRACTICE_REPORT_INSIDE_REPOSITORY");
  });
});
