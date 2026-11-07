// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnswerSchema, type Answer, type AnswerPathRewrites, type PathRewrite, type PathsChangedSince
} from "../../packages/contract/src/index.js";
import { V4ChangedSince } from "../../apps/ui/components/v4/V4PathRewrite.js";
import { cardLabel } from "../../apps/ui/lib/v4/mapLooks.js";
import type { ReportStage } from "../../apps/ui/lib/v4/reportWriting.js";
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
 * never a count, and "It will wait for your dig in progress." while one runs (the owner's words, fourth round, 6 Nov). A
 * later rewrite brings the line back, read while the page is open. The fourth round also hides the whole box while a new
 * report version waits for digs or is written (it takes those changes in), until the map changes after that version: the
 * box takes the map's report stage (useMapReport's `stage`) for that, and keeps today's behaviour without it.
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

/** A changed path as the line names it: its short label (map-f25 / r2-20 A), never its outcome words. */
const lineOf = (positionRef: string): string => {
  const rewrite = ROOT.paths.find((path) => path.position_ref === positionRef)!.history[0]!;
  return cardLabel((rewrite as Extract<PathRewrite, { state: "READY" }>).text.line);
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
    // Task 76l (owner, 5 Nov: no level from the address on V4 pages): the report page reads the debate's level itself.
    expect(report.getAttribute("href")).toBe(`/v4/debate/${runId}/report`);
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
      text: { line: "Wait for small reactors: set aside. The first ones are years late.", summary: "Still years away.", fate: "SET_ASIDE" },
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
    // map-f25 / r2-20 A: the path is named by its short label, with no outcome words ("set aside").
    expect(named()).toEqual(["Wait for small reactors"]);
    // Nothing is being rewritten any more, so it stops reading.
    const reads = harness.loadAnswer.mock.calls.length;
    await advance(60_000);
    expect(harness.loadAnswer.mock.calls.length).toBe(reads);
  });
});

describe("the owner's fourth round (6 Nov): the box and the report's stage", () => {
  let ownRoot: Root | undefined;
  let ownHost: HTMLDivElement | undefined;
  const SINCE_ONE: PathsChangedSince = { count: 2, since_report_version: 1 };

  async function draw(changedSince: PathsChangedSince, reportStage?: ReportStage, digRunning = false): Promise<void> {
    ownHost ??= document.body.appendChild(document.createElement("div"));
    ownRoot ??= createRoot(ownHost);
    await act(async () => {
      ownRoot!.render(
        <V4ChangedSince changedSince={changedSince} reportHref="/v4/debate/r/report" catalog={CATALOG} locale="en" digRunning={digRunning}
          {...(reportStage === undefined ? {} : { reportStage })} />
      );
    });
  }
  const box = (): HTMLElement | null => ownHost!.querySelector<HTMLElement>(".v4ChangedSince");

  afterEach(async () => {
    await act(async () => { ownRoot?.unmount(); });
    ownRoot = undefined;
    ownHost?.remove();
    ownHost = undefined;
  });

  it("without the stage, the box shows whenever the map moved on since the latest report, as before", async () => {
    await draw(SINCE_ONE, undefined, true);
    expect(box()!.querySelector(".v4ChangedSinceText")!.textContent).toBe(CATALOG["v4.rewrite.reportOlder"]);
    expect(box()!.textContent).toContain("It will wait for your dig in progress.");
  });

  it("is hidden whole while a new version waits for digs, and while it is written", async () => {
    await draw(SINCE_ONE, { kind: "WAITING_DIGS", version: 2, waitingForDigs: 1 }, true);
    expect(box()).toBeNull();
    expect(ownHost!.textContent).toBe("");
    await draw(SINCE_ONE, { kind: "WRITING", version: 2 });
    expect(box()).toBeNull();
  });

  it("comes back when the map changes after that version, and not before", async () => {
    await draw(SINCE_ONE, { kind: "WRITING", version: 2 });
    expect(box()).toBeNull();
    // Version 2 is written; the map is read again after it: nothing changed since.
    await draw({ count: 0, since_report_version: 2 }, { kind: "DONE", version: 2 });
    expect(box()).toBeNull();
    // A read of the map from before version 2 was written still counts against version 1: version 2 has those changes.
    await draw(SINCE_ONE, { kind: "DONE", version: 2 });
    expect(box()).toBeNull();
    // A dig changes a path after version 2: the box is back.
    await draw({ count: 1, since_report_version: 2 }, { kind: "DONE", version: 2 });
    expect(box()!.querySelector(".v4ChangedSinceText")!.textContent).toBe(CATALOG["v4.rewrite.reportOlder"]);
    // The investigation reopened (a dig started): as before.
    await draw({ count: 1, since_report_version: 2 }, { kind: "NONE" });
    expect(box()).not.toBeNull();
  });

  it("a version that did not finish hides nothing: the report that stands is older than the map", async () => {
    await draw(SINCE_ONE, { kind: "FAILED", version: 2 });
    expect(box()).not.toBeNull();
    await draw(SINCE_ONE, { kind: "UNKNOWN" });
    expect(box()).not.toBeNull();
  });
});
