// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigProgressRead } from "../../apps/ui/lib/v4/digProgress.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import type { Answer, DigLinkRecord, DigLinks, PathRewrite } from "../../packages/contract/src/index.js";
import { advance, branch, CATALOG, click, harness, mountMap, page, panel, PATHS, resetHarness, seededAnswer, unmountMap } from "./v4-debate-harness.js";

/*
 * The owner's screen review (3 Nov, OWNER-PICKS-2026-11-03.md), on the real map page (V4DebateClient in jsdom, its reads
 * stood in by the harness):
 *  - dig-f2: while a dig further down (level 2 or 3) works or its change is still climbing up, the map reads its own answer
 *    again every 15 s, so the change shows without a reload; once nothing below moves, those reads stop;
 *  - dig-d1 B: the open dig's steps and checked findings come from its progress read while it works; with none (today's API)
 *    the panel shows the one calm line and the page stops asking for that dig.
 */

const records = vi.hoisted(() => ({ byRun: new Map<string, DigLinks>() }));

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
// Each debate's own dig records (the harness gives every debate the same ones).
vi.mock("@/lib/v4/accountMemory", async (original) => ({
  ...(await import("./v4-debate-harness.js")).accountMemoryMock(await original()),
  readDigRecords: async (runId: string) => records.byRun.get(runId) ?? { parent: null, children: [] }
}));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

const record = (child: string, parent: string): DigLinkRecord =>
  ({ parent_run_id: parent, child_run_id: child, places: ["path:n-mix"], mode: "quick", created_at: new Date().toISOString() });
function recordDigs(parent: string, ...children: string[]): void {
  records.byRun.set(parent, { parent: null, children: children.map((child) => record(child, parent)) });
}

const base = (dig: string, level: number) => ({ rewrite_id: `rw-${dig}`, dig_run_id: dig, dig_level: level, dig_finished_at: new Date().toISOString() });
const finished = (dig: string, level: number, line: string, cause?: "CHILD_PATH"): PathRewrite => ({
  ...base(dig, level), ...(cause === undefined ? {} : { cause }), state: "READY", rewritten_at: new Date().toISOString(), changed: true,
  text: { line, summary: "A new summary.", fate: "HELD_UP" }, what_changed: ["A dig further down changed this."], fate_before: "HELD_UP",
  view: null, dig_paths: []
});

/**
 * The seeded answer with no page still being "added to researched" (the page reads such an answer every 5 s on its own,
 * W4-4), so the only reads left are the ones these tests are about.
 */
function quiet(runId: string, extra: Partial<Answer> = {}): Answer {
  const answer = seededAnswer(runId, extra);
  if (answer.web === undefined) return answer;
  const paths = answer.web.paths.map((path) => ({ ...path, other_pages: path.other_pages.map(({ researched: _researched, ...page }) => page) }));
  return { ...answer, web: { ...answer.web, paths } };
}

/** The map's answer with one climbed row on its path n-mix. */
function withClimbedRow(runId: string, row: PathRewrite): Answer {
  return quiet(runId, {
    path_rewrites: {
      paths: [{ position_ref: "n-mix", current: row.state === "READY" ? row.text : null, history: [row] }],
      changed_since: { count: row.state === "READY" ? 1 : 0, since_report_version: null }
    }
  });
}

const readsOf = (runId: string): number => harness.loadAnswer.mock.calls.filter(([read]) => read === runId).length;
const doneOld = (link: DigLink): DigView => ({ link, state: "DONE", headline: "The dig's short answer.", counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 } });

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  records.byRun.clear();
  harness.loadAnswer = vi.fn(async (runId: string) => harness.fresh ?? quiet(runId));
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("dig-f2: the map follows the digs below its own", () => {
  it("reads nothing more when nothing below it moves", async () => {
    const root = crypto.randomUUID();
    const one = crypto.randomUUID();
    recordDigs(root, one);
    harness.digView = doneOld;
    harness.answer = quiet(root);
    await mountMap(1600, root);
    const before = readsOf(root);
    await advance(60_000);
    expect(readsOf(root)).toBe(before);
  });

  it("while a dig two levels down runs, reads its own answer again every 15 s, and stops once that dig is quiet", async () => {
    const root = crypto.randomUUID();
    const one = crypto.randomUUID();
    const two = crypto.randomUUID();
    recordDigs(root, one);
    recordDigs(one, two);
    let twoState: DigView["state"] = "RUNNING";
    harness.digView = (link) => (link.childRunId === two ? { link, state: twoState, headline: null, counts: null } : doneOld(link));
    harness.answer = quiet(root);
    await mountMap(1600, root);
    const start = readsOf(root);
    await advance(15_000);
    await advance(15_000);
    expect(readsOf(root)).toBeGreaterThanOrEqual(start + 2);
    // The deeper dig finished with nothing that climbs (it failed): one more check, then no more reads.
    twoState = "FAILED";
    await advance(15_000);
    await advance(15_000);
    const settled = readsOf(root);
    await advance(60_000);
    expect(readsOf(root)).toBe(settled);
  });

  it("while a change three levels down climbs, keeps reading until it reaches this map, then shows it without a reload", async () => {
    const root = crypto.randomUUID();
    const one = crypto.randomUUID();
    const two = crypto.randomUUID();
    const three = crypto.randomUUID();
    recordDigs(root, one);
    recordDigs(one, two);
    recordDigs(two, three);
    // The level-3 dig is done and changed the path it dug; the climb has passed the debate in between (level 1).
    harness.digView = (link) => (link.childRunId === three
      ? { link, state: "DONE", headline: null, counts: null, rewrite: finished(three, 3, "Its own new line.") }
      : doneOld(link));
    const climbed = finished(three, 3, "Mostly renewables, as a dig three levels down left it.", "CHILD_PATH");
    harness.loadAnswer = vi.fn(async (runId: string) => (runId === one ? withClimbedRow(one, climbed) : harness.fresh ?? quiet(runId)));
    harness.answer = quiet(root);
    await mountMap(1600, root);
    const start = readsOf(root);
    await advance(15_000);
    await advance(15_000);
    expect(readsOf(root)).toBeGreaterThanOrEqual(start + 2);
    // The level in between was read for the climb.
    expect(readsOf(one)).toBeGreaterThan(0);
    // The climb reaches this map: its path n-mix reads the climbed line, with no reload.
    harness.fresh = withClimbedRow(root, climbed);
    await advance(15_000);
    await advance(15_000);
    expect(branch(PATHS.mix).textContent).toContain("Mostly renewables, as a dig three levels down left it.");
    const settled = readsOf(root);
    await advance(60_000);
    expect(readsOf(root)).toBe(settled);
  });
});

describe("dig-d1 B: the open dig's steps and findings on the map page", () => {
  const progress = (runId: string, findings: number): DigProgressRead => ({
    kind: "SHOWN",
    progress: {
      steps: ["FINDING_SOURCES", "READING", "CHECKING", "WRITING"],
      now: findings === 0 ? "READING" : "CHECKING",
      findings: [
        { id: `${runId}-1`, text: "Pumped storage covers days, not weeks.", trust: "SURE" as const },
        { id: `${runId}-2`, text: "Week-long storage costs are still argued.", trust: "STILL_ARGUED" as const }
      ].slice(0, findings)
    }
  });

  it("shows them as the server reports them, a new finding arriving while the panel is open", async () => {
    const root = crypto.randomUUID();
    const one = crypto.randomUUID();
    recordDigs(root, one);
    harness.digView = (link) => ({ link, state: "RUNNING", headline: null, counts: null });
    let found = 1;
    const read = vi.fn((runId: string) => progress(runId, found));
    harness.digProgress = read;
    await mountMap(1600, root);
    await click(branch(PATHS.mix).querySelector<HTMLButtonElement>(".v4MapDig")!);
    expect(read).toHaveBeenCalledWith(one);
    expect(panel().querySelector("[data-step=CHECKING]")?.getAttribute("data-step-state")).toBe("NOW");
    expect(panel().querySelectorAll("[data-dig-found] li")).toHaveLength(1);
    found = 2;
    await advance(10_000);
    expect(panel().querySelectorAll("[data-dig-found] li")).toHaveLength(2);
    expect(panel().querySelector(`[data-finding="${one}-2"]`)?.classList.contains("v4DigFindingNew")).toBe(true);
    expect(panel().querySelector(`[data-finding="${one}-1"]`)?.classList.contains("v4DigFindingNew")).toBe(false);
  });

  it("with no progress read (today's API) shows the one calm line and asks no more for that dig", async () => {
    const root = crypto.randomUUID();
    const one = crypto.randomUUID();
    recordDigs(root, one);
    harness.digView = (link) => ({ link, state: "RUNNING", headline: null, counts: null });
    const read = vi.fn((): DigProgressRead => ({ kind: "ABSENT" }));
    harness.digProgress = read;
    await mountMap(1600, root);
    await click(branch(PATHS.mix).querySelector<HTMLButtonElement>(".v4MapDig")!);
    expect(panel().querySelector(".v4DigLive [data-wait-word]")?.textContent).toBe(CATALOG["v4.state.LOOKING"]);
    expect(panel().querySelector("[data-dig-steps]")).toBeNull();
    const asked = read.mock.calls.length;
    expect(asked).toBe(1);
    await advance(60_000);
    expect(read.mock.calls.length).toBe(asked);
    expect(page().textContent).not.toContain(CATALOG["v4.panel.digState.RUNNING"]);
  });
});
