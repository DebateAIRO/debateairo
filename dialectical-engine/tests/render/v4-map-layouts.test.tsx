// @vitest-environment jsdom

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4Rail, type V4DigCounts } from "../../apps/ui/components/v4/V4Rail.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import type { ReportMoment } from "../../apps/ui/lib/v4/mapLooks.js";
import { CATALOG, click, harness, mountMap, page, panel, resetHarness, seededAnswer, seededStory, settle, unmountMap } from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 screen review (owner picks of 3 Nov, OWNER-PICKS-2026-11-03.md), the debate page at each width:
 *   map-d3: laptops (1100-1439 px) keep the steps as a 56 px strip of marks, put the one count above the map and unfold only
 *           the opened path; tablets (768-1099 px) show the outline beside the panel; the wide desktop keeps the rail.
 *   map-f7 / map-d3 B / map-f23: on the phone, where you are stays pinned under the header; "Your question" lists the paths
 *           right under the answer; the map sheet opens at the outline with the steps on one line at its foot; a sideways
 *           swipe moves to the next path and says "1 of 4" for a moment.
 *   map-f10: a skip link goes past the map to the panel's heading.
 *   dig-f29 / map-f15: the report moment is a small mark on the one "Write my report" button, with the words in the rail.
 */

beforeEach(() => { vi.useFakeTimers(); resetHarness(); });
afterEach(async () => { await unmountMap(); vi.useRealTimers(); });

describe("map-d3: the map at each width", () => {
  it("laptop: the steps as marks, the count above the map, a skip link, and only the opened path unfolded", async () => {
    await mountMap(1280);
    expect(page().querySelector(".v4DebLayout-laptop")).not.toBeNull();
    expect(page().querySelector(".v4DebRail-column")).toBeNull();
    const marks = page().querySelector(".v4DebRailMarksCol .v4DebRail-marks")!;
    // The report step is a link around its mark, named for a screen reader.
    const reportStep = marks.querySelector("a.v4DebRailMarkLink")!;
    expect(reportStep.querySelector(".v4DebRailMark")!.getAttribute("aria-hidden")).toBe("true");
    expect(reportStep.querySelector(".v4SrOnly")!.textContent).toBe(CATALOG["v4.rail.stepReport"]);
    const mapCol = page().querySelector(".v4DebMapCol")!;
    expect(mapCol.querySelector(".v4DebRail-notes .v4DebRailOpen")).not.toBeNull();
    expect(mapCol.querySelector(".v4Map.v4MapFold")).not.toBeNull();
    const expandedOf = () => [...page().querySelectorAll(".v4MapPath")].map((card) => card.getAttribute("aria-expanded"));
    expect(expandedOf()).toEqual(["false", "false", "false", "false"]);
    await click(page().querySelectorAll<HTMLButtonElement>(".v4MapPath")[1]!);
    expect(expandedOf()).toEqual(["false", "true", "false", "false"]);
    // map-f10: past the map in one step, to the heading of what the panel shows.
    const skip = mapCol.querySelector<HTMLAnchorElement>("a.v4SkipLink")!;
    expect(skip.textContent).toBe(CATALOG["v4.map.skipToAnswer"]);
    expect(skip.getAttribute("href")).toBe("#v4-deb-panel");
    await act(async () => skip.click());
    expect(document.activeElement).toBe(panel().querySelector("h2"));
  });

  it("tablet: the outline stands beside the panel, the steps on one strip", async () => {
    await mountMap(800);
    expect(page().querySelector(".v4DebLayout-mid")).not.toBeNull();
    expect(page().querySelector(".v4DebMapCol .v4Out")).not.toBeNull();
    expect(page().querySelector(".v4Map")).toBeNull();
    expect(page().querySelector(".v4DebRail-strip")).not.toBeNull();
  });

  it("wide desktop: the rail column and the whole tree, nothing folded", async () => {
    await mountMap(1600);
    expect(page().querySelector(".v4DebRail-column")).not.toBeNull();
    expect(page().querySelector(".v4Map.v4MapFold")).toBeNull();
    expect([...page().querySelectorAll(".v4MapPath")].every((card) => !card.hasAttribute("aria-expanded"))).toBe(true);
  });
});

describe("map-f7 / map-d3 B / map-f23: the phone", () => {
  it("pins where you are, lists the paths under the answer, and opens the sheet at the outline with the steps at its foot", async () => {
    await mountMap(375);
    const where = page().querySelector(".v4WhereBar")!;
    expect(where.querySelector("[role=status]")!.textContent).toContain("level 1 of 3");
    // The live minimap: one tiny bar per path (it opens the map), and the depth dots, the first one lit.
    expect(where.querySelectorAll(".v4Mini .v4MiniBar")).toHaveLength(4);
    expect([...where.querySelectorAll(".v4WhereDot")].map((dot) => dot.classList.contains("v4WhereDotOn"))).toEqual([true, false, false]);
    expect(page().querySelector(".v4DebMapCol")).toBeNull();
    const list = page().querySelector(".v4PathList")!;
    expect(list.textContent).toContain(CATALOG["v4.phone.pathsTitle"]);
    expect(list.querySelectorAll(".v4PathListRow")).toHaveLength(4);
    expect(page().querySelector(".v4DebMain > .v4DebRail-notes")).not.toBeNull();
    await click(page().querySelector<HTMLButtonElement>(".v4DebPhoneMap")!);
    const sheet = page().querySelector<HTMLElement>("[role=dialog]")!;
    const outline = sheet.querySelector(".v4Out")!;
    const steps = sheet.querySelector(".v4DebRail-steps")!;
    expect(outline.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a sideways swipe on the panel moves to the next path and says where it is for a moment", async () => {
    await mountMap(375);
    const panelCol = page().querySelector<HTMLElement>("#v4-deb-panel")!;
    const touch = async (type: "touchstart" | "touchend", x: number, y: number): Promise<void> => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, type === "touchstart" ? "touches" : "changedTouches", { value: [{ clientX: x, clientY: y }] });
      if (type === "touchstart") Object.defineProperty(event, "changedTouches", { value: [{ clientX: x, clientY: y }] });
      else Object.defineProperty(event, "touches", { value: [] });
      await act(async () => {
        panelCol.dispatchEvent(event);
      });
    };
    await touch("touchstart", 200, 300);
    await touch("touchend", 90, 310);
    await settle();
    expect(page().querySelector(".v4Panel-path")).not.toBeNull();
    expect(page().querySelector(".v4WherePosition")!.textContent).toBe("1 of 4");
    // A move from the screen's edge is the phone's own back gesture: nothing changes.
    await touch("touchstart", 10, 300);
    await touch("touchend", 200, 300);
    await settle();
    expect(page().querySelector(".v4Panel-path")).not.toBeNull();
  });
});

/** Every open question of the seeded map (the places a dig of all of them would record), the star's first. */
function openQuestions(runId: string): ReadonlyArray<Readonly<{ id: string; star: boolean }>> {
  const map = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() });
  const all = [...map.open, ...map.paths.flatMap((path) => path.open)];
  return all.filter((question, index) => all.findIndex((other) => other.id === question.id) === index);
}
function recordDig(runId: string, places: readonly string[]): void {
  harness.records = {
    parent: null,
    children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: [...places], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
  };
}
const sure = (link: DigLink): DigView => ({
  link, state: "DONE", headline: null, counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, rewrite: null,
  points: [{ id: "d1", text: "Checked.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }]
});
const nothingNew = (link: DigLink): DigView => ({ link, state: "DONE", headline: null, counts: null, rewrite: null, points: [] });

describe("dig-f29 / map-f15: the report moment", () => {
  it("is a mark on the one report button, with the words in the rail and no second button, once nothing open is left", async () => {
    const runId = crypto.randomUUID();
    recordDig(runId, openQuestions(runId).map((question) => question.id));
    harness.digView = sure;
    await mountMap(1600, runId);
    const report = page().querySelector<HTMLAnchorElement>("a.v4DebReportLink")!;
    expect(report.classList.contains("v4DebReportGood")).toBe(true);
    expect(report.textContent).toContain(CATALOG["v4.rail.goodTimeTitle"]);
    const note = page().querySelector(".v4DebRail-column .v4DebRailGoodTime")!;
    expect(note.textContent).toContain(CATALOG["v4.rail.goodTimeNoneOpen"]);
    expect(note.textContent).toContain(CATALOG["v4.rail.goodTimeHint"]);
    expect(note.querySelector("a, button")).toBeNull();
    expect(page().querySelector(".v4DebRailOpen")!.textContent).toBe(CATALOG["v4.rail.openLeftLine"]!.replace("{count}", "0"));
  });

  it("after a dig that found nothing new, says so neutrally and leaves the button plain", async () => {
    const runId = crypto.randomUUID();
    // One question that is not the star: the star was not looked into, so this is not yet the good time.
    const notStar = openQuestions(runId).filter((question) => !question.star);
    expect(notStar.length).toBeGreaterThan(0);
    recordDig(runId, [notStar.at(-1)!.id]);
    harness.digView = nothingNew;
    await mountMap(1600, runId);
    expect(page().querySelector("a.v4DebReportLink")!.classList.contains("v4DebReportGood")).toBe(false);
    expect(page().querySelector(".v4DebRail-column .v4DebRailDigDone")!.textContent).toBe(CATALOG["v4.rail.digDoneNeutral"]);
    expect(page().querySelector(".v4DebRailGoodTime")).toBeNull();
  });
});

describe("the rail's words (map-f28, map-f26)", () => {
  const counts = (running: number, done: number, failed: number): V4DigCounts => ({ running, done, failed });
  const rail = (variant: "column" | "notes" | "steps" | "marks", digs: V4DigCounts, moment?: ReportMoment) => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <V4Rail runId="run-1" level={null} showReadStep openLeft={2} digs={digs} variant={variant}
        {...(moment === undefined ? {} : { moment })} catalog={CATALOG} locale="en" />
    );
    return host;
  };
  it("names the rounds' state in words, never a count of digs", () => {
    const running = rail("column", counts(2, 1, 0)).textContent!;
    expect(running).toContain(CATALOG["v4.rail.digsRunning.other"]);
    expect(running).not.toMatch(/\b[0-9]+ digs?\b/u);
    const done = rail("column", counts(0, 3, 1)).textContent!;
    expect(done).toContain(CATALOG["v4.rail.digsDone.other"]);
    expect(done).toContain(CATALOG["v4.rail.digsFailed.one"]);
  });

  it("the notes line carries only the count, the notes and the moment; the steps line only the steps", () => {
    const notes = rail("notes", counts(0, 1, 0), "DIG_DONE");
    expect(notes.querySelector(".v4DebRailOpen")!.textContent).toBe(CATALOG["v4.rail.openLeftLine"]!.replace("{count}", "2"));
    expect(notes.querySelector(".v4DebRailDigDone")).not.toBeNull();
    expect(notes.querySelector(".v4DebRailSteps")).toBeNull();
    const steps = rail("steps", counts(0, 1, 0), "GOOD");
    expect(steps.querySelector(".v4DebRailSteps")).not.toBeNull();
    expect(steps.querySelector(".v4DebRailOpen, .v4DebRailGoodTime")).toBeNull();
    const good = rail("notes", counts(0, 1, 0), "GOOD");
    expect(good.querySelector(".v4DebRailGoodTime")!.textContent).toContain(CATALOG["v4.rail.goodTimeStarDone"]);
  });
});
