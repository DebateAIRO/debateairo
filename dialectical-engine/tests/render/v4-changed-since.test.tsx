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
 * Dig model revision W4-6 (draft 5.5, "The top of the map"; owner Q-D11): a dig never rewrites the main answer, so the top
 * of the map says how many paths digs changed since the answer was written, with "Write my report"; after a report, how
 * many changed since that report (its version), and nothing when none did. A later rewrite brings the line back, read
 * while the page is open.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);

const ROOT = PATH_REWRITES[DIG_RUNS.root]!;
/** The first debate's rewritten paths but n-smr, which these tests rewrite themselves. */
const OTHERS = ROOT.paths.filter((path) => path.position_ref !== "n-smr");
const strip = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ChangedSince");

function answerWith(runId: string, rewrites: AnswerPathRewrites): Answer {
  return AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("Paths changed since the answer was written", () => {
  it("says the count and offers \"Write my report\"", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { ...ROOT, changed_since: { count: 2, since_report_version: null } });
    await mountMap(1280, runId);
    expect(strip()!.textContent).toContain(word("v4.rewrite.changedSince.other", { count: 2 }));
    const report = strip()!.querySelector<HTMLAnchorElement>("a")!;
    expect(report.textContent).toBe(CATALOG["v4.rail.writeReport"]);
    expect(report.getAttribute("href")).toBe(`/v4/debate/${runId}/report?level=background`);
  });

  it("one path: its own sentence", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { ...ROOT, changed_since: { count: 1, since_report_version: null } });
    await mountMap(1280, runId);
    expect(strip()!.textContent).toContain(word("v4.rewrite.changedSince.one", { count: 1 }));
  });

  it("an answer no dig changed says nothing", async () => {
    await mountMap();
    expect(strip()).toBeNull();
  });
});

describe("after a report", () => {
  it("counts since that report's version", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, ROOT);
    await mountMap(1280, runId);
    expect(strip()!.textContent).toContain(word("v4.rewrite.changedSinceReport", { n: 1, count: 2 }));
    expect(strip()!.querySelector("a")!.textContent).toBe(CATALOG["v4.rail.writeReport"]);
  });

  it("is gone when nothing changed since the report", async () => {
    const runId = crypto.randomUUID();
    harness.answer = answerWith(runId, { ...ROOT, changed_since: { count: 0, since_report_version: 1 } });
    await mountMap(1280, runId);
    expect(strip()).toBeNull();
    expect(page().textContent).not.toContain(word("v4.rewrite.changedSinceReport", { n: 1, count: 0 }));
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
    await mountMap(1280, runId);
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
    expect(strip()!.textContent).toContain(word("v4.rewrite.changedSinceReport", { n: 2, count: 1 }));
    // Nothing is being rewritten any more, so it stops reading.
    const reads = harness.loadAnswer.mock.calls.length;
    await advance(60_000);
    expect(harness.loadAnswer.mock.calls.length).toBe(reads);
  });
});
