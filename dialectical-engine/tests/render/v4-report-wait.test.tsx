// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type { WriteReportResult } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  AnswerSchema, InvestigationReportsSchema, PublicDebateSchema, type Answer, type InvestigationReports, type PublicDebate
} from "../../packages/contract/src/index.js";
import { seedPublicDebates } from "../../tools/v4-mock-api/public-seed.js";
import {
  buttonNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, seededStory, settle, unmountMap
} from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  /** Every run id a report was asked for. */
  written: [] as string[]
}));
/** The reads the pages make through the site's one contract client: the debate's visibility, the report page's room, the public page's press. */
const api = vi.hoisted(() => ({
  visibility: { state: "PRIVATE", public_ref: null } as Record<string, unknown>,
  room: null as unknown,
  roomReads: 0,
  writePublicReport: (async () => ({ state: "WRITING", report_version: 2 })) as (ref: string) => Promise<unknown>,
  publicPresses: [] as string[]
}));

vi.mock("@/lib/api", async (original) => {
  const real = await original<Record<string, unknown> & { contractClient: Record<string, unknown> }>();
  return {
    ...real,
    validateSession: async () => undefined,
    contractClient: {
      ...real.contractClient,
      readRunVisibility: async () => api.visibility,
      getAskRoom: async () => {
        api.roomReads += 1;
        if (api.room === null) throw new Error("no room read");
        return api.room;
      },
      writePublicReport: (ref: string) => {
        api.publicPresses.push(ref);
        return api.writePublicReport(ref);
      }
    }
  };
});
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
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
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 start step, Task 56c (item public-f25, the page half; owner answer Q20 B: only a debate's very first report uses the kept reserve). A further
 * report on a public debate uses the quota and waits for the reset like digs, "and their button says when they can run":
 *  - the owner's map (the top bar's "Write my report", the phone bar's report job, the rail) and the report page's write button: the button stays where
 *    it is, greyed (aria-disabled, still focusable), with "This report can start after 08:00." beside it; a press shows the same line and sends nothing;
 *  - a press refused anyway (409 PUBLIC_DEBATE_WAITS_FOR_RESET: the room changed since it was read) shows the same line, never "We couldn't confirm your
 *    report started." and never "Try again";
 *  - nothing waits on a private debate, or on a public one whose next report is its first (Task 56b's `first_closing_left`);
 *  - while this debate's report waits, the month line says "You've used this month's quota. New questions and digs can start on 1 December." without
 *    "You can still write your report.";
 *  - the public page greys its button only once a report already shows; with none shown a refused press names the time as today's line does.
 * Made-up times and texts only.
 */

const PUBLIC_REF = "f1000000-0000-4000-8000-0000000000c5";
const INVESTIGATION_ID = "4e000000-0000-4000-8000-0000000000c5";
// Local times, so the line reads the same on any machine.
const DAY_RESET = new Date(2026, 10, 8, 8, 0, 0).toISOString();
const MONTH_RESET = new Date(2026, 11, 1, 0, 0, 0).toISOString();
const WAITS_DAY = "This report can start after 08:00.";

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}
const usedUpDay = (): AskRoom => room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET, new_starts: "BLOCKED_UNTIL_RESET" });
const usedUpMonth = (): AskRoom => room({ room: "FULL", scope: "PERSON_MONTH", resets_at: MONTH_RESET, new_starts: "BLOCKED_UNTIL_RESET", plan_id: "FREE" });

/** The owner's investigation read: open, no version yet, and whether the next report is the debate's first (absent: not said). */
function investigation(runId: string, firstClosingLeft: boolean | undefined, digs = 0): InvestigationReports {
  return InvestigationReportsSchema.parse({
    investigation_id: digs === 0 ? null : INVESTIGATION_ID, root_run_id: runId, state: "OPEN", digs, versions: [], current: null,
    ...(firstClosingLeft === undefined ? {} : { first_closing_left: firstClosingLeft })
  });
}
const writing = (runId: string): InvestigationReports => InvestigationReportsSchema.parse({
  investigation_id: INVESTIGATION_ID, root_run_id: runId, state: "CLOSED", digs: 0, current: null,
  versions: [{ report_version: 1, closed_at: new Date().toISOString(), state: "WRITING", waiting_for_digs: 0 }]
});

/** A served path debate whose "carry on to the report" box was ticked (one made-up path on the seeded answer's first position). */
function carryOnAnswer(runId: string): Answer {
  return AnswerSchema.parse({
    ...seededAnswer(runId),
    branches: {
      source: "MENU", width: 1,
      paths: [{
        path_id: "b1", order: 1, title: "A made-up path", question: "A made-up question about the mix?", author: "AI_SUGGESTION",
        viewpoints: [{ title: "A made-up path", question: "A made-up question about the mix?", own: false }], state: "ARGUED",
        root_node_id: "n-mix",
        outcome: { state: "READY", text: { line: "A made-up line.", summary: "A made-up summary.", fate: "HELD_UP" }, what_changed: [],
          view: null, trust: "SURE", rests_on: [] }
      }],
      more: [], also_raised: [], main_trust: "SURE", carry_on_to_report: true
    }
  });
}

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

const header = (): HTMLElement => page().querySelector<HTMLElement>(".v4StandInHeader")!;
const topButton = (): HTMLButtonElement | null => header().querySelector<HTMLButtonElement>("button.v4DebReportLink");
const strip = (): HTMLElement | null => page().querySelector<HTMLElement>("[data-report-strip]");
const railStep = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4DebRail-column [data-report-state]");
/** The line a greyed button points at (aria-describedby). */
const describedBy = (button: Element): HTMLElement | null => {
  const id = button.getAttribute("aria-describedby");
  return id === null ? null : document.getElementById(id);
};

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.written = [];
  reports.load = async () => null;
  reports.write = async () => ({ kind: "FAILED" });
  api.visibility = { state: "PUBLISHED", public_ref: PUBLIC_REF };
  api.room = null;
  api.roomReads = 0;
  api.publicPresses = [];
  api.writePublicReport = async () => ({ state: "WRITING", report_version: 2 });
});
afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("the owner's map: a further report on a public debate says when it can start", () => {
  it("first_closing_left false and a used-up day: 'Write my report' greyed with the line beside it; a press sends nothing; the rail says it too", async () => {
    const runId = crypto.randomUUID();
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, false);
    await mountMap(1600, runId);
    const button = topButton()!;
    expect(flat(button)).toContain(CATALOG["v4.rail.writeReport"]);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    const line = describedBy(button)!;
    expect(flat(line)).toBe(WAITS_DAY);
    // Beside it, in the top bar.
    expect(button.nextElementSibling).toBe(line);
    expect(header().contains(line)).toBe(true);
    // The rail's "Your report" step says when, with no working dot.
    expect(flat(railStep())).toBe(WAITS_DAY);
    expect(railStep()!.querySelector(".v4WaitDot-PULSE")).toBeNull();
    // A press shows the same line again and sends nothing: no strip, no report asked for, focus stays.
    button.focus();
    await click(button);
    expect(strip()).toBeNull();
    expect(reports.written).toEqual([]);
    expect(document.activeElement).toBe(button);
    expect(describedBy(button)!.classList.contains("v4Highlight")).toBe(true);
    // Never a price, never what is left.
    expect(flat(line)).not.toMatch(/[$€£%]|left/iu);
  });

  it("first_closing_left true with the same room: the debate's first report goes ahead, and one press asks for it once", async () => {
    const runId = crypto.randomUUID();
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, true);
    reports.write = async () => {
      reports.load = async () => writing(runId);
      return { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 } satisfies WriteReportResult;
    };
    await mountMap(1600, runId);
    expect(topButton()!.getAttribute("aria-disabled")).toBeNull();
    expect(page().textContent).not.toContain(WAITS_DAY);
    await click(topButton()!);
    await click(buttonNamed(CATALOG["v4.reportStrip.write"]!, strip()!));
    expect(reports.written).toEqual([runId]);
  });

  it("a private debate never waits, even when the read says the next report is not the first", async () => {
    const runId = crypto.randomUUID();
    api.visibility = { state: "PRIVATE", public_ref: null };
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, false);
    await mountMap(1600, runId);
    expect(topButton()!.getAttribute("aria-disabled")).toBeNull();
    expect(page().textContent).not.toContain(WAITS_DAY);
  });

  it("a press refused anyway (409: the room changed since it was read) shows the same line, never 'couldn't confirm', never Try again", async () => {
    const runId = crypto.randomUUID();
    // The page read a room that still fitted, and a read that said nothing of the first report.
    harness.room = room();
    reports.load = async () => investigation(runId, undefined);
    reports.write = async () => {
      // Meanwhile a visitor's report was written and the day was used up: the server refuses, and the next reads say so.
      reports.load = async () => investigation(runId, false);
      harness.roomAgain = usedUpDay();
      return { kind: "WAITS_FOR_RESET" } satisfies WriteReportResult;
    };
    await mountMap(1600, runId);
    expect(topButton()!.getAttribute("aria-disabled")).toBeNull();
    await click(topButton()!);
    await click(buttonNamed(CATALOG["v4.reportStrip.write"]!, strip()!));
    await settle(200);
    expect(reports.written).toEqual([runId]);
    const opened = strip()!;
    expect(flat(opened)).toContain(WAITS_DAY);
    expect(flat(page())).not.toContain(CATALOG["v4.investigation.startUnconfirmed"]);
    expect(opened.querySelectorAll("button").length).toBeGreaterThan(0);
    expect([...opened.querySelectorAll("button")].map((button) => flat(button))).not.toContain(CATALOG["v4.common.retry"]);
    // Write it waits too: a second press sends nothing more.
    const write = buttonNamed(CATALOG["v4.reportStrip.write"]!, opened);
    expect(write.getAttribute("aria-disabled")).toBe("true");
    await click(write);
    expect(reports.written).toEqual([runId]);
    // Not yet: the top button is back, greyed now, with the line beside it.
    await click(buttonNamed(CATALOG["v4.reportStrip.notYet"]!, opened));
    expect(strip()).toBeNull();
    expect(topButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(flat(describedBy(topButton()!))).toBe(WAITS_DAY);
  });

  it("with the start step's carry-on box (no strip, a press asks at once): a refused press opens the strip with the line, not 'couldn't confirm'", async () => {
    const runId = crypto.randomUUID();
    harness.answer = carryOnAnswer(runId);
    harness.room = room();
    reports.load = async () => investigation(runId, true);
    reports.write = async () => {
      reports.load = async () => investigation(runId, false);
      harness.roomAgain = usedUpDay();
      return { kind: "WAITS_FOR_RESET" } satisfies WriteReportResult;
    };
    await mountMap(1600, runId);
    await click(topButton()!);
    await settle(200);
    expect(reports.written).toEqual([runId]);
    expect(flat(strip())).toContain(WAITS_DAY);
    expect(flat(page())).not.toContain(CATALOG["v4.investigation.startUnconfirmed"]);
    // Sure now: closed, the top button waits with the line, and a press asks nothing more.
    await click(buttonNamed(CATALOG["v4.reportStrip.notYet"]!, strip()!));
    await click(topButton()!);
    expect(strip()).toBeNull();
    expect(reports.written).toEqual([runId]);
  });

  it("a Free public debate in a used-up month while its report waits: the month line without 'You can still write your report.'", async () => {
    const runId = crypto.randomUUID();
    harness.planTier = "free";
    harness.answer = seededAnswer(runId, {}, "FREE");
    harness.room = usedUpMonth();
    reports.load = async () => investigation(runId, false);
    await mountMap(1600, runId);
    await openPath(PATHS.smr);
    expect(flat(panel())).toContain("You've used this month's quota. New questions and digs can start on 1 December.");
    // The dig button's own wait line is that month line too.
    expect(flat(panel().querySelector(".v4DigWaitLine"))).toBe("You've used this month's quota. New questions and digs can start on 1 December.");
    expect(flat(page())).not.toContain("You can still write your report.");
    expect(flat(describedBy(topButton()!))).toBe("This report can start on 1 December.");
  });

  it("the month line keeps its last sentence where the report does not wait (its first report)", async () => {
    const runId = crypto.randomUUID();
    harness.planTier = "free";
    harness.answer = seededAnswer(runId, {}, "FREE");
    harness.room = usedUpMonth();
    reports.load = async () => investigation(runId, true);
    await mountMap(1600, runId);
    await openPath(PATHS.smr);
    expect(flat(panel())).toContain(word("v4.money.startsWait.PERSON_MONTH", { date: "1 December" }));
  });

  it("on the phone, at a good time, the pinned bar's 'Write my report' is greyed with the line right above the bar; a press sends nothing", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, false, 1);
    await mountMap(375, runId);
    const bar = page().querySelector<HTMLElement>(".v4DebPhoneBar")!;
    const job = bar.querySelector<HTMLButtonElement>("button.v4DebPhoneReport")!;
    expect(flat(job)).toBe(CATALOG["v4.rail.writeReport"]);
    expect(job.getAttribute("aria-disabled")).toBe("true");
    const why = describedBy(job)!;
    expect(flat(why)).toBe(WAITS_DAY);
    expect(why.hasAttribute("data-bar-why")).toBe(true);
    await click(job);
    expect(strip()).toBeNull();
    expect(reports.written).toEqual([]);
    expect(describedBy(job)!.classList.contains("v4Highlight")).toBe(true);
    // One "Write my report" with its line on screen: no "Good time" line offers another.
    expect(page().querySelector(".v4StackGoodTime")).toBeNull();
  });

  it("on a computer at a good time with the debate's first report left, the rail says it is a good time (the moment the next test needs)", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, true, 1);
    await mountMap(1600, runId);
    expect(topButton()!.getAttribute("aria-disabled")).toBeNull();
    expect(flat(page().querySelector(".v4DebRail-column"))).toContain(CATALOG["v4.rail.goodTimeTitle"]);
  });

  it("on a computer at a good time, the rail never says it is a good time to write the report while it waits (review of Task 56c)", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    harness.room = usedUpDay();
    reports.load = async () => investigation(runId, false, 1);
    await mountMap(1600, runId);
    expect(topButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(flat(railStep())).toBe(WAITS_DAY);
    // Nothing beside the greyed button says now is a good time, or points at it ("Use 'Write my report' at the top.").
    expect(flat(page())).not.toContain(CATALOG["v4.rail.goodTimeTitle"]);
    expect(flat(page())).not.toContain(CATALOG["v4.rail.goodTimeHint"]);
  });
});

describe("the report page's write button", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  async function mountReport(runId: string): Promise<HTMLDivElement> {
    const { V4ReportClient } = await import("../../apps/ui/components/v4/V4ReportClient.js");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<V4ReportClient id={runId} locale="en" initialLevel={null} catalog={CATALOG} newDebateCatalog={{}} />));
    await settle(200);
    return host;
  }
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });
  const writeButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>("button.v4RepWrite")!;

  it("first_closing_left false and a used-up day: greyed with the line beside it; a press sends nothing", async () => {
    const runId = crypto.randomUUID();
    api.room = usedUpDay();
    reports.load = async () => investigation(runId, false);
    await mountReport(runId);
    const button = writeButton();
    expect(flat(button)).toBe(CATALOG["v4.rail.writeReport"]);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(flat(describedBy(button))).toBe(WAITS_DAY);
    await click(button);
    await settle(200);
    expect(reports.written).toEqual([]);
    expect(describedBy(button)!.classList.contains("v4Highlight")).toBe(true);
  });

  it("first_closing_left true with the same room: the button works and asks once", async () => {
    const runId = crypto.randomUUID();
    api.room = usedUpDay();
    reports.load = async () => investigation(runId, true);
    reports.write = async () => {
      reports.load = async () => writing(runId);
      return { kind: "WRITING", reportVersion: 1, waitingForDigs: 0 } satisfies WriteReportResult;
    };
    await mountReport(runId);
    expect(writeButton().getAttribute("aria-disabled")).toBeNull();
    expect(host!.textContent).not.toContain(WAITS_DAY);
    // Review of Task 56c: nothing can wait here, so the page reads no room for it.
    expect(api.roomReads).toBe(0);
    await click(writeButton());
    await settle(200);
    expect(reports.written).toEqual([runId]);
  });

  it("a press refused anyway (409) shows the line, never 'couldn't confirm' and never Try again", async () => {
    const runId = crypto.randomUUID();
    api.room = room();
    reports.load = async () => investigation(runId, undefined);
    reports.write = async () => {
      reports.load = async () => investigation(runId, false);
      api.room = usedUpDay();
      return { kind: "WAITS_FOR_RESET" } satisfies WriteReportResult;
    };
    await mountReport(runId);
    expect(writeButton().getAttribute("aria-disabled")).toBeNull();
    await click(writeButton());
    await settle(200);
    expect(reports.written).toEqual([runId]);
    expect(flat(host)).toContain(WAITS_DAY);
    expect(flat(host)).not.toContain(CATALOG["v4.investigation.startUnconfirmed"]);
    expect([...host!.querySelectorAll("button")].map((button) => flat(button))).not.toContain(CATALOG["v4.common.retry"]);
  });

  it("a private debate reads no room for it and never waits", async () => {
    const runId = crypto.randomUUID();
    api.visibility = { state: "PRIVATE", public_ref: null };
    api.room = usedUpDay();
    reports.load = async () => investigation(runId, false);
    await mountReport(runId);
    expect(writeButton().getAttribute("aria-disabled")).toBeNull();
    expect(api.roomReads).toBe(0);
  });
});

describe("the public page's 'Write a report'", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const debate = (at: number): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[at]);
  async function mountPublic(page: PublicDebate): Promise<HTMLDivElement> {
    const { V4PublicLaneProvider, V4PublicReports } = await import("../../apps/ui/components/v4/V4PublicLane.js");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(
      <V4PublicLaneProvider debate={page} lane={{ catalog: CATALOG, homeCatalog: {}, newDebateCatalog: {}, locale: "en", crisisCountryHint: null }}>
        <V4PublicReports debate={page} catalog={CATALOG} locale="en" />
      </V4PublicLaneProvider>
    ));
    await settle(50);
    return host;
  }
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });
  const press = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>("button[data-public-report-press]")!;

  it("signed in, one report shown and a used-up room: the button greyed with the line beside it; a press sends nothing", async () => {
    const page = debate(0);
    expect(page.reports?.length).toBe(1);
    harness.room = usedUpDay();
    await mountPublic(page);
    const button = press();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(flat(describedBy(button))).toBe(WAITS_DAY);
    await click(button);
    expect(api.publicPresses).toEqual([]);
  });

  it("no report shown yet: not greyed (it may be the owner's first), and a refused press names the time as today's line does", async () => {
    const page = debate(1);
    expect(page.reports ?? []).toEqual([]);
    harness.room = usedUpDay();
    api.writePublicReport = async () => ({ error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" });
    await mountPublic(page);
    expect(press().getAttribute("aria-disabled")).toBeNull();
    expect(host!.textContent).not.toContain(WAITS_DAY);
    await click(press());
    expect(api.publicPresses).toEqual([page.public_ref]);
    expect(flat(host!.querySelector("[role=alert]"))).toBe(word("v4.money.startsWait.PERSON_DAY", { time: "08:00" }));
  });

  it("one report shown but new starts can go: the button works", async () => {
    const page = debate(0);
    harness.room = room();
    await mountPublic(page);
    expect(press().getAttribute("aria-disabled")).toBeNull();
    await click(press());
    expect(api.publicPresses).toEqual([page.public_ref]);
  });
});
