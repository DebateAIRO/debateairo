// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteReportResult } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";
import {
  advance, buttonNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, seededStory, settle,
  unmountMap
} from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  /** Every run id "Write it" was sent for. */
  written: [] as string[],
  /** report-f15: what the question's visibility read says (null: it cannot be read). */
  published: false as boolean | null,
  visibilityReads: [] as string[]
}));

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => ({
  ...(await import("./v4-debate-harness.js")).loadMock(await original()),
  loadInvestigation: (runId: string) => reports.load(runId),
  writeReport: (runId: string) => {
    reports.written.push(runId);
    return reports.write(runId);
  }
}));
vi.mock("@/lib/v4/reportWriting", async (original) => ({
  ...(await original()),
  loadRunPublished: async (runId: string) => {
    reports.visibilityReads.push(runId);
    return reports.published;
  }
}));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 screen review (owner picks 3 Nov 2026, OWNER-PICKS-2026-11-03.md "report"; Round 2 answered A on every question), on
 * the map page (V4DebateClient):
 *  - report-d1 A: "Write my report" turns into a small strip in the same spot: what the report covers, its share of today
 *    once the server says it, that no dig can start while it is written, Write it and Not yet (Esc too); Write it sends
 *    at once (after a dig still in its 10 seconds); a press that cannot be confirmed says so and checks the versions; with
 *    the start step's "carry on to the report" box there is no strip; on the phone the strip grows from the pinned bar.
 *  - report-d2 A: the person stays on the map, which shows the report waiting for digs or being written in the shared
 *    waiting card ("Being written", "Started 14:02" only when this visit knows it), the rail step says so with the working
 *    dot, dig buttons rest with "Digging opens again when your report is written.", 15 minutes on the report page's
 *    "taking longer" line; when it is ready, the map's ready moment; a version that failed reads "Didn't finish" and the
 *    button "Write it again".
 *  - report-f15: on Free, "This question is public, so your report will be public too." before writing (only when the
 *    question is public: its check may have kept it private), and no share of today.
 * Made-up texts only.
 */

const INVESTIGATION_ID = "4e000000-0000-4000-8000-0000000000aa";
const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
// journey-f15 / f16 (owner's screen review): one 24-hour clock on every V4 page ("14:31", never "02:31 PM").
const clock = (ms: number) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 0,
  extra: Record<string, unknown> = {}): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY").at(-1)?.report_version ?? null;
  const parsed = InvestigationReportsSchema.parse({
    investigation_id: versions.length === 0 && digs === 0 && state === "OPEN" ? null : INVESTIGATION_ID, root_run_id: runId, state, digs, versions, current
  });
  // A field the server does not send yet rides along as the page would receive it once the contract names it.
  return { ...parsed, ...extra } as InvestigationReports;
}
const writing = (version: number, closedAt: string, waiting = 0): InvestigationReportVersion =>
  ({ report_version: version, closed_at: closedAt, state: "WRITING", waiting_for_digs: waiting });
const finished = (version: number): InvestigationReportVersion => ({
  report_version: version, closed_at: "2026-11-04T10:00:00.000Z", state: "READY", written_at: "2026-11-04T10:08:00.000Z",
  answer: { segments: ["The report's made-up answer."] }, story: null, sources: [], shortened: false
} as InvestigationReportVersion);
const failedVersion = (version: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-11-04T10:00:00.000Z", state: "FAILED", written_at: "2026-11-04T10:20:00.000Z" });

const header = (): HTMLElement => page().querySelector<HTMLElement>(".v4StandInHeader")!;
const topButton = (): HTMLButtonElement | null => header().querySelector<HTMLButtonElement>("button.v4DebReportLink");
const strip = (): HTMLElement | null => page().querySelector<HTMLElement>("[data-report-strip]");
const waitCard = (): HTMLElement | null => page().querySelector<HTMLElement>("[data-report-wait]");
const railStep = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4DebRail-column [data-report-state]");
const note = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4ReadyNote");
const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();

/** dig-f29's good time (the map-layouts recipe): one dig covers every open question and comes back sure. */
function digEverythingOpen(runId: string): void {
  const map = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() });
  const places = [...new Set([...map.open, ...map.paths.flatMap((path) => path.open)].map((question) => question.id))];
  harness.records = {
    parent: null,
    children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places, mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
  };
  harness.digView = (link: DigLink): DigView => ({
    link, state: "DONE", headline: null, counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, rewrite: null,
    points: [{ id: "d1", text: "Checked.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }]
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.written = [];
  reports.visibilityReads = [];
  reports.published = false;
  reports.load = async () => null;
  reports.write = async () => ({ kind: "FAILED" });
});
afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("report-d1: \"Write my report\" turns into a short strip in the same spot", () => {
  it("shows what the report covers and that no dig can start while it is written, with Write it and Not yet; Not yet and Esc bring the button back", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "OPEN", [], 0);
    await mountMap(1600, runId);
    expect(topButton()!.textContent).toContain(CATALOG["v4.rail.writeReport"]);
    // Before the press nothing waits: no card, no rail line, the dig buttons work.
    expect(waitCard()).toBeNull();
    expect(railStep()).toBeNull();

    await click(topButton()!);
    const opened = strip()!;
    expect(opened.closest(".v4StandInHeader")).not.toBeNull();
    expect(topButton()).toBeNull();
    // No dig yet: the report will mostly restate the first answer. No share line until the server says one.
    expect(flat(opened)).toContain(CATALOG["v4.reportStrip.coversNoDigs"]);
    expect(flat(opened)).toContain(CATALOG["v4.reportStrip.digsWait"]);
    expect(opened.querySelector("[data-report-share]")).toBeNull();
    expect(opened.querySelector("[data-report-public]")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(CATALOG["v4.reportStrip.write"]!, opened));
    // A screen reader hears the lines with the group.
    for (const id of (opened.getAttribute("aria-describedby") ?? "").split(" ")) expect(document.getElementById(id)).not.toBeNull();
    // No unmeasured time, no price, and the share word is quota.
    expect(flat(opened)).not.toMatch(/minute|usually|allowance|\$|€/iu);

    await click(buttonNamed(CATALOG["v4.reportStrip.notYet"]!, opened));
    expect(strip()).toBeNull();
    expect(document.activeElement).toBe(topButton());
    expect(reports.written).toEqual([]);

    await click(topButton()!);
    await act(async () => {
      strip()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(strip()).toBeNull();
    expect(document.activeElement).toBe(topButton());
    expect(reports.written).toEqual([]);
  });

  it("says what the digs found when there are digs, and the report's share of today once the server says it", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "OPEN", [], 2, { report_share_percent: 5 });
    await mountMap(1600, runId);
    await click(topButton()!);
    expect(flat(strip())).toContain(CATALOG["v4.reportStrip.covers"]);
    expect(flat(strip()!.querySelector("[data-report-share]"))).toBe(word("v4.reportStrip.share", { percent: 5 }));
    // A Free person never sees a share (the report comes from the small reserve).
    await unmountMap();
    harness.planTier = "free";
    const free = crypto.randomUUID();
    reports.load = async () => investigation(free, "OPEN", [], 2, { report_share_percent: 5 });
    await mountMap(1600, free);
    await click(topButton()!);
    expect(strip()!.querySelector("[data-report-share]")).toBeNull();
  });

  it("Write it sends at once; the map shows the report being written, since the press, and dig buttons rest; then its ready moment", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    let closedAt = "";
    reports.write = async () => {
      closedAt = new Date().toISOString();
      reports.load = async () => investigation(runId, "CLOSED", [writing(1, closedAt)], 1);
      return { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 } satisfies WriteReportResult;
    };
    await mountMap(1600, runId);
    await click(topButton()!);
    await click(buttonNamed(CATALOG["v4.reportStrip.write"]!, strip()!));
    expect(reports.written).toEqual([runId]);
    expect(strip()).toBeNull();

    // The shared waiting card: "Being written", the start this visit knows (its own press), the quiet reason, focus on it.
    const card = waitCard()!;
    expect(card.dataset.reportWait).toBe("WRITING");
    expect(flat(card.querySelector("[data-wait-word]"))).toBe(CATALOG["v4.state.BEING_WRITTEN"]);
    expect(flat(card.querySelector("[data-wait-started]"))).toBe(word("v4.wait.started", { time: clock(Date.parse(closedAt)) }));
    expect(flat(card)).toContain(CATALOG["v4.reportWait.digsRest"]);
    expect(flat(card)).toContain(CATALOG["v4.wait.leave"]);
    expect(document.activeElement).toBe(card);
    // The rail's step says so with the working dot; the button leads to the report page while it is written.
    expect(flat(railStep())).toBe(`${CATALOG["v4.state.BEING_WRITTEN"]} · ${word("v4.wait.started", { time: clock(Date.parse(closedAt)) })}`);
    expect(railStep()!.querySelector(".v4WaitDot-PULSE")).not.toBeNull();
    expect(topButton()).toBeNull();
    expect(header().querySelector("a.v4DebReportLink")!.getAttribute("href")).toBe(`/v4/debate/${runId}/report?level=background`);
    // Dig buttons rest, with the reason under them.
    await openPath(PATHS.renew);
    const dig = panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!;
    expect(dig.disabled).toBe(true);
    expect(flat(panel().querySelector("[data-dig-rest]"))).toBe(CATALOG["v4.reportWait.digsRest"]);
    expect(harness.submit).not.toHaveBeenCalled();

    // Ready: the map's one ready moment, and digging opens again.
    reports.load = async () => investigation(runId, "CLOSED", [finished(1)], 1);
    await advance(15_100);
    await settle(200);
    expect(note()!.textContent).toContain(CATALOG["v4.ready.report"]);
    expect(waitCard()).toBeNull();
    expect(panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!.disabled).toBe(false);
  });

  it("a press that cannot be confirmed says so and checks the versions: writing found shows the wait, else Try again", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    reports.write = async () => ({ kind: "FAILED" });
    await mountMap(1600, runId);
    await click(topButton()!);
    await click(buttonNamed(CATALOG["v4.reportStrip.write"]!, strip()!));
    // Nothing started as far as the page can tell: the line stays, never "Nothing was used", and Write it reads Try again.
    expect(flat(strip())).toContain(CATALOG["v4.investigation.startUnconfirmed"]);
    expect(flat(strip())).not.toMatch(/Nothing was used/u);
    const again = buttonNamed(CATALOG["v4.common.retry"]!, strip()!);
    expect(document.activeElement).toBe(again);

    // The reply was lost after the server started: the check finds it being written.
    reports.write = async () => {
      reports.load = async () => investigation(runId, "CLOSED", [writing(1, new Date().toISOString())], 1);
      return { kind: "FAILED" };
    };
    await click(again);
    expect(strip()).toBeNull();
    expect(waitCard()!.dataset.reportWait).toBe("WRITING");
  });

  it("with the start step's \"carry on to the report\" box there is no strip: the press asks for the report at once", async () => {
    const runId = crypto.randomUUID();
    harness.answer = { ...seededAnswer(runId), branches: { carry_on_to_report: true } } as unknown as typeof harness.answer;
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    reports.write = async () => {
      reports.load = async () => investigation(runId, "CLOSED", [writing(1, new Date().toISOString())], 1);
      return { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 };
    };
    await mountMap(1600, runId);
    await click(topButton()!);
    expect(strip()).toBeNull();
    expect(reports.written).toEqual([runId]);
    expect(waitCard()!.dataset.reportWait).toBe("WRITING");
  });

  it("with the carry-on box, the map keeps watching while nothing is written: the report the AIs start shows being written", async () => {
    const runId = crypto.randomUUID();
    harness.answer = { ...seededAnswer(runId), branches: { carry_on_to_report: true } } as unknown as typeof harness.answer;
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    await mountMap(1600, runId);
    expect(waitCard()).toBeNull();
    // The server presses "Write my report" by itself once the carry-on's digs are done.
    reports.load = async () => investigation(runId, "CLOSED", [writing(1, new Date().toISOString())], 1);
    await advance(15_100);
    await settle(200);
    expect(waitCard()!.dataset.reportWait).toBe("WRITING");
    expect(reports.written).toEqual([]);
  });

  it("without the box, nothing is read again while nothing is written", async () => {
    const runId = crypto.randomUUID();
    let reads = 0;
    reports.load = async () => {
      reads += 1;
      return investigation(runId, "OPEN", [], 1);
    };
    await mountMap(1600, runId);
    const before = reads;
    await advance(60_000);
    await settle(200);
    expect(reads).toBe(before);
  });

  it("on the phone, \"Write my report\" in the pinned bar grows into the strip there; while it is written the bar says so", async () => {
    const runId = crypto.randomUUID();
    // Nothing open is left without a dig: dig-f29's good time, so the bar's job is "Write my report".
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    reports.write = async () => {
      reports.load = async () => investigation(runId, "CLOSED", [writing(1, new Date().toISOString())], 1);
      return { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 };
    };
    await mountMap(375, runId);
    const bar = (): HTMLElement => page().querySelector<HTMLElement>(".v4DebPhoneBar")!;
    const barReport = bar().querySelector<HTMLButtonElement>("button.v4DebPhoneReport")!;
    expect(barReport.textContent).toBe(CATALOG["v4.rail.writeReport"]);
    await click(barReport);
    expect(strip()!.closest(".v4Stack")).not.toBeNull();
    expect(strip()!.dataset.reportStrip).toBe("bottom");
    // The bar's own report button steps back while the strip is open; Not yet brings it back, with focus.
    expect(bar().querySelector(".v4DebPhoneReport")).toBeNull();
    await click(buttonNamed(CATALOG["v4.reportStrip.notYet"]!, strip()!));
    expect(document.activeElement).toBe(bar().querySelector(".v4DebPhoneReport"));

    await click(bar().querySelector<HTMLButtonElement>("button.v4DebPhoneReport")!);
    await click(buttonNamed(CATALOG["v4.reportStrip.write"]!, strip()!));
    expect(reports.written).toEqual([runId]);
    const status = bar().querySelector("[data-bar-status]")!;
    expect(flat(status)).toBe(`${CATALOG["v4.rail.stepReport"]} · ${CATALOG["v4.state.BEING_WRITTEN"]} · ${word("v4.wait.started", {
      time: clock(Date.parse((await reports.load(runId) as InvestigationReports).versions[0]!.closed_at))
    })}`);
    expect(status.querySelector(".v4WaitDot-PULSE")).not.toBeNull();
    expect(bar().querySelector(".v4DebPhoneDig")).toBeNull();
    // No "Good time to write your report" while it is written.
    expect(page().querySelector(".v4StackGoodTime")).toBeNull();
  });
});

describe("report-d2: waiting for the report on the map", () => {
  it("while it waits for a dig: \"Waiting\", the report page's line, the quiet reason, and no time", async () => {
    const runId = crypto.randomUUID();
    // Every open question was dug (dig-f29's good time), so only the wait keeps the good-time note away.
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "CLOSED", [writing(1, "2026-11-04T10:00:00.000Z", 1)], 1);
    await mountMap(1600, runId);
    const card = waitCard()!;
    expect(card.dataset.reportWait).toBe("WAITING_DIGS");
    expect(flat(card.querySelector("[data-wait-word]"))).toBe(CATALOG["v4.state.WAITING.noTime"]);
    expect(flat(card)).toContain(CATALOG["v4.investigation.waitingDigs.one"]);
    expect(flat(card)).toContain(CATALOG["v4.reportWait.digsRest"]);
    expect(card.querySelector("[data-wait-started]")).toBeNull();
    // No "Good time to write your report" while it waits, and no mark on the button.
    expect(page().querySelector(".v4DebRailGoodTime")).toBeNull();
    expect(header().querySelector(".v4DebReportGood")).toBeNull();
  });

  it("opened on a version already being written, with digs and no press here: no start time; 15 minutes on, the report page's line", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "CLOSED", [writing(1, "2026-11-04T08:00:00.000Z")], 2);
    await mountMap(1600, runId);
    const card = waitCard()!;
    expect(card.dataset.reportWait).toBe("WRITING");
    expect(card.querySelector("[data-wait-started]")).toBeNull();
    expect(flat(railStep())).toBe(CATALOG["v4.state.BEING_WRITTEN"]);
    expect(card.querySelector("[data-report-slow]")).toBeNull();
    await advance(15 * 60_000 + 100);
    await settle(200);
    const slow = waitCard()!.querySelector("[data-report-slow]")!;
    expect(flat(slow)).toContain(CATALOG["v4.investigation.slow"]);
    expect(buttonNamed(CATALOG["v4.investigation.checkAgain"]!, slow)).toBeTruthy();
  });

  it("a version that could not be written reads \"Didn't finish\", and the button reads \"Write it again\"", async () => {
    const runId = crypto.randomUUID();
    reports.load = async () => investigation(runId, "CLOSED", [failedVersion(1)], 1);
    await mountMap(1600, runId);
    expect(waitCard()!.dataset.reportWait).toBe("FAILED");
    expect(flat(waitCard())).toContain(CATALOG["v4.investigation.failed"]);
    expect(flat(railStep())).toBe(CATALOG["v4.state.DIDNT_FINISH"]);
    expect(flat(topButton())).toBe(CATALOG["v4.investigation.writeAgain"]);
    // Digging is open: only a report being written makes it rest.
    await openPath(PATHS.renew);
    expect(panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!.disabled).toBe(false);
  });

  it("a report that stands with nothing reopened: no strip and no good-time note; the button leads to the report", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "CLOSED", [finished(1)], 1);
    await mountMap(1600, runId);
    expect(topButton()).toBeNull();
    expect(header().querySelector("a.v4DebReportLink")).not.toBeNull();
    expect(page().querySelector(".v4DebRailGoodTime")).toBeNull();
    expect(waitCard()).toBeNull();
  });
});

describe("report-f15: on Free, the report will be public too", () => {
  it("says so before writing when the question is public, and not when its check kept it private", async () => {
    harness.planTier = "free";
    const runId = crypto.randomUUID();
    reports.published = true;
    reports.load = async () => investigation(runId, "OPEN", [], 0);
    await mountMap(1600, runId);
    expect(reports.visibilityReads).toEqual([runId]);
    await click(topButton()!);
    expect(flat(strip()!.querySelector("[data-report-public]"))).toBe(CATALOG["v4.report.publicToo"]);
    expect(strip()!.getAttribute("aria-describedby")).toContain("public");

    await unmountMap();
    const kept = crypto.randomUUID();
    reports.published = false;
    reports.load = async () => investigation(kept, "OPEN", [], 0);
    await mountMap(1600, kept);
    await click(topButton()!);
    expect(strip()!.querySelector("[data-report-public]")).toBeNull();
  });

  it("a paid question never reads its visibility for the strip", async () => {
    const runId = crypto.randomUUID();
    reports.published = true;
    reports.load = async () => investigation(runId, "OPEN", [], 0);
    await mountMap(1600, runId);
    await click(topButton()!);
    expect(reports.visibilityReads).toEqual([]);
    expect(strip()!.querySelector("[data-report-public]")).toBeNull();
  });
});
