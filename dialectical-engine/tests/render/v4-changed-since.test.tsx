// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSchema, type Answer, type AnswerPathRewrites, type PathRewrite } from "../../packages/contract/src/index.js";
import { DIG_RUNS, PATH_REWRITES } from "../../tools/v4-mock-api/rewrite-seed.js";
import { advance, CATALOG, harness, mountMap, page, resetHarness, seededAnswer, settle, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * Dig model revision W4-6 (draft 5.5, "The top of the map"; owner Q-D11) counted the paths digs changed since the answer
 * was written. V4 screen review (owner picks 3 Nov 2026), dig-f19 / map-f17: since the 31 Oct ruling the main answer
 * updates itself after each change, so the top of the map says something only once a report exists and the map has
 * moved on since it: "Your report is older than the map." with [Update my report], the changed paths named under it and
 * never a count, and "It will wait for your running dig." while one runs. A later rewrite brings the line back, read
 * while the page is open.
 */

const ROOT = PATH_REWRITES[DIG_RUNS.root]!;
/** The first debate's rewritten paths but n-smr, which these tests rewrite themselves. */
const OTHERS = ROOT.paths.filter((path) => path.position_ref !== "n-smr");
const strip = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ChangedSince");
const named = (): string[] => [...(strip()?.querySelectorAll(".v4ChangedSinceList li") ?? [])].map((item) => item.textContent ?? "");

/** The seed also holds a page still being read (W4-4), which reads the answer every 5 s of its own; these debates have none, so only a rewrite reads it. */
function answerWith(runId: string, rewrites: AnswerPathRewrites): Answer {
  const answer = AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
  if (answer.web === undefined) return answer;
  return { ...answer, web: { ...answer.web, paths: answer.web.paths.map((path) => ({ ...path,
    other_pages: path.other_pages.filter((page) => page.researched?.state !== "READING") })) } };
}

const lineOf = (positionRef: string): string => {
  const rewrite = ROOT.paths.find((path) => path.position_ref === positionRef)!.history[0]!;
  return (rewrite as Extract<PathRewrite, { state: "READY" }>).text.line;
};

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("before any report", () => {
  it("says nothing, however many paths changed: the main answer already took the changes in", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { ...ROOT, changed_since: { count: 2, since_report_version: null } });
    await mountMap(1600, runId);
    expect(strip()).toBeNull();
    expect(page().textContent).not.toContain(CATALOG["v4.rewrite.reportOlder"]);
  });

  it("an answer no dig changed says nothing", async () => {
    await mountMap();
    expect(strip()).toBeNull();
  });
});

describe("after a report", () => {
  it("says the report is older than the map, names the changed paths without a count, and offers \"Update my report\"", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(1600, runId);
    expect(strip()!.querySelector(".v4ChangedSinceText")!.textContent).toBe(CATALOG["v4.rewrite.reportOlder"]);
    expect(strip()!.textContent).toContain(CATALOG["v4.rewrite.changedSinceYourReport"]);
    // The two paths a dig changed (not the one it only confirmed, nor the one whose rewrite failed), in the map's order.
    expect(named()).toEqual([lineOf("n-mix"), lineOf("n-renew")]);
    expect(strip()!.querySelector(".v4ChangedSinceList li")!.getAttribute("data-ai-generated")).toBe("true");
    expect(strip()!.textContent).not.toMatch(/\b2\b/u);
    const report = strip()!.querySelector<HTMLAnchorElement>("a")!;
    expect(report.textContent).toBe(CATALOG["v4.rewrite.updateReport"]);
    expect(report.getAttribute("href")).toBe(`/v4/debate/${runId}/report?level=background`);
    // map-f15: the one "Write my report" button is in the top bar; this line carries a plain link.
    expect(report.className).not.toContain("v4Btn");
    expect(strip()!.textContent).not.toContain(CATALOG["v4.rewrite.waitsForDig"]);
  });

  it("says the report will wait while a dig still runs (ruling F7)", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    harness.records = { parent: null, children: [{ parent_run_id: runId, child_run_id: "d9000000-0000-4000-8000-000000000031", places: ["path:n-smr"], mode: "quick", created_at: "2026-10-31T10:00:00.000Z" }] };
    harness.digView = (link) => ({ link, state: "RUNNING", headline: null, counts: null });
    await mountMap(1600, runId);
    expect(strip()!.textContent).toContain(CATALOG["v4.rewrite.waitsForDig"]);
  });

  it("is gone when nothing changed since the report", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { ...ROOT, changed_since: { count: 0, since_report_version: 1 } });
    await mountMap(1600, runId);
    expect(strip()).toBeNull();
    expect(page().textContent).not.toContain(CATALOG["v4.rewrite.reportOlder"]);
  });

  it("comes back when a later rewrite finishes while the page is open", async () => {
    const runId = crypto.randomUUID();
    const writing: PathRewrite = {
      rewrite_id: "rw-later", dig_run_id: "d9000000-0000-4000-8000-000000000005", dig_level: 1,
      dig_finished_at: "2026-10-31T10:00:00.000Z", state: "WRITING"
    };
    harness.answer = answerWith(runId, {
      paths: [...OTHERS, { position_ref: "n-smr", current: null, history: [writing] }],
      changed_since: { count: 0, since_report_version: 2 }
    });
    await mountMap(1600, runId);
    expect(strip()).toBeNull();
    const done: PathRewrite = {
      ...writing, state: "READY", rewritten_at: "2026-10-31T10:02:00.000Z", changed: true,
      text: { line: "Wait for small reactors: set aside, and the first ones are years late.", summary: "Still years away.", fate: "SET_ASIDE" },
      what_changed: ["The dig found that the first small reactors are years behind plan."], fate_before: "SET_ASIDE", view: null, dig_paths: []
    };
    harness.fresh = answerWith(runId, {
      paths: [...OTHERS, { position_ref: "n-smr", current: (done as Extract<PathRewrite, { state: "READY" }>).text, history: [done] }],
      changed_since: { count: 1, since_report_version: 2 }
    });
    // The page reads the answer again while a path is being rewritten (every 15 s), and only then.
    await advance(14_000);
    expect(strip()).toBeNull();
    await advance(1_100);
    await settle();
    expect(strip()!.querySelector(".v4ChangedSinceText")!.textContent).toBe(CATALOG["v4.rewrite.reportOlder"]);
    expect(named()).toEqual(["Wait for small reactors: set aside, and the first ones are years late."]);
    // Nothing is being rewritten any more, so it stops reading.
    const reads = harness.loadAnswer.mock.calls.length;
    await advance(60_000);
    expect(harness.loadAnswer.mock.calls.length).toBe(reads);
  });
});
