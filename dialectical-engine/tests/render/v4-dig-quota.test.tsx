// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type * as Money from "../../apps/ui/lib/v4/money.js";
import { DIG_LEVEL_MAX, type RunProjection } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, digPart, expandBranch, harness, mountMap, openPath, page, panel, PATHS,
  resetHarness, seededAnswer, text, tray, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * The money rule (owner, 31 Oct 2026) on the V4 map (Perplexity plan W3-4): before a dig, its share of today (the
 * approved line); when new starts wait for the day, week or month reset, that line with the reset time; the borrow
 * notice in the usage area; a debate paused at the month wall, with Continue (refused before the reset, nothing
 * changed); and "Write my report" always there. Users see shares of their quota, never prices.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const RESET = "2026-11-01T00:00:00.000Z";
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}

function reportLinks(): HTMLAnchorElement[] {
  return [...page().querySelectorAll<HTMLAnchorElement>("a")].filter((link) => link.textContent?.trim() === CATALOG["v4.rail.writeReport"]);
}

function paused(runId: string, canContinue: boolean): RunProjection {
  return {
    run_ref: runId, question_line: "Should countries build new nuclear power?", state: "RUNNING", terminal_reason: null,
    hold_until: null, month_pause: { until: NEXT_MONTH, can_continue: canContinue }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("before a dig: its share, on its own button (owner's screen review, 3 Nov: journey-f13, public-d3 A, dig-f5)", () => {
  it("the share is on the tray's and the panel's dig button, the period once by the switch, and in no other line", async () => {
    harness.room = room({ dig_share_percent: 20 });
    await mountMap();
    // map-f22: the path's suggestions show once its leaves are unfolded (about 12 cards at once).
    await expandBranch(PATHS.renew);
    await click(branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
    const picked = `${CATALOG["v4.dig.yourPicks.one"]} · ${word("v4.undo.barShare", { percent: 20 })}`;
    expect(buttonsNamed(picked, tray()!)).toHaveLength(1);
    await openPath(PATHS.renew);
    const block = panel().querySelector<HTMLElement>(".v4PanelDig")!;
    expect(buttonsNamed(picked, block)).toHaveLength(1);
    // public-d3 A: "of today · you can still finish your report", once, by the Quick look / Thorough switch.
    expect(block.querySelector(".v4DigPeriod")?.textContent).toBe(CATALOG["v4.dig.period.PERSON_DAY"]);
    expect(page().querySelectorAll(".v4DigPeriod")).toHaveLength(1);
    // dig-f5: the share is said once, on the button; the old sentence under it is gone.
    expect(text()).not.toContain("This dig uses about");
    // A share only: never a price (the AIs' own text may name money; the dig buttons never do).
    for (const button of page().querySelectorAll(".v4PanelDigBtn, .v4DebTray button")) {
      expect(button.textContent ?? "").not.toMatch(/[$€£¢]|\bcents?\b|\bdollars?\b/iu);
    }
  });

  it("says nothing of a share when the room read names none: the button's words alone, and no period", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    expect(text()).not.toContain("This dig uses about");
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, panel())).toHaveLength(1);
    expect(panel().querySelector(".v4DigPeriod")).toBeNull();
  });

  it("public-f14: on Free the period is the month's", async () => {
    harness.planTier = "free";
    harness.room = room({ plan_id: "FREE", dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    expect(panel().querySelector(".v4DigPeriod")?.textContent).toBe(CATALOG["v4.dig.period.PERSON_MONTH"]);
    expect(buttonsNamed(`${CATALOG["v4.panel.dig"]} · ${word("v4.undo.barShare", { percent: 20 })}`, panel())).toHaveLength(1);
  });
});

describe("new starts wait for the reset (new_starts: BLOCKED_UNTIL_RESET)", () => {
  // dig-f11 / journey-f14 / journey-f15 (owner's screen review, 3 Nov): the button stays, greyed, with the reset time on
  // it in one 24-hour form; the approved line beside it says why and from when; pressing it starts nothing.
  it("the day: a greyed 'Dig here · after 00:00' with the approved line; nothing starts; the report can still be written", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET", dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(time).toMatch(/^\d{2}:\d{2}$/u);
    const button = panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!;
    expect(button.textContent).toBe(`${CATALOG["v4.panel.dig"]} · ${word("v4.dig.after", { time })}`);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const reason = panel().querySelector<HTMLElement>(".v4DigWaitLine")!;
    expect(reason.textContent).toBe(word("v4.dig.quotaDayUsed", { time }));
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
    // The same reset is not said twice beside the button, and no share or period shows while digs wait.
    expect(panel().textContent).not.toContain(word("v4.money.startsWait.PERSON_DAY", { time }));
    expect(panel().querySelector(".v4DigPeriod")).toBeNull();
    await click(button);
    await advance(11_000);
    expect(harness.submit).not.toHaveBeenCalled();
    expect(page().querySelectorAll(".v4Undo")).toHaveLength(0);
    expect(reportLinks().length).toBeGreaterThan(0);
  });

  it("journey-f14: an open question that cannot be dug now can still be kept: 'Add to tray' picks it", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap();
    await expandBranch(PATHS.renew);
    await click(branch(PATHS.renew).querySelector<HTMLButtonElement>(".v4MapLeafOpen .v4MapOpenMain")!);
    expect(panel().classList.contains("v4Panel-open")).toBe(true);
    const add = buttonNamed(CATALOG["v4.dig.addToTray"]!, panel());
    await click(add);
    expect(tray()).not.toBeNull();
    expect(buttonsNamed(CATALOG["v4.dig.addToTray"]!, panel())).toHaveLength(0);
    // The tray's one button waits too, with the reset time on it.
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(buttonsNamed(`${CATALOG["v4.dig.yourPicks.one"]} · ${word("v4.dig.after", { time })}`, tray()!)).toHaveLength(1);
    expect(tray()!.textContent).toContain(word("v4.dig.quotaDayUsed", { time }));
  });

  it("the month: its own line, which says the report can still be written, and 'on {date}' on the button", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_MONTH", resets_at: NEXT_MONTH, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap();
    await openPath(PATHS.smr);
    const date = formatDate("en", NEXT_MONTH, { day: "numeric", month: "long" });
    expect(panel().textContent).toContain(word("v4.money.startsWait.PERSON_MONTH", { date }));
    expect(CATALOG["v4.money.startsWait.PERSON_MONTH"]).toContain("You can still write your report.");
    expect(panel().querySelector(".v4PanelDigBtn")?.textContent).toBe(`${CATALOG["v4.panel.dig"]} · ${word("v4.dig.on", { date })}`);
  });

  it("public-f24: a full person window reads the same V4 line under the older server switch (no new_starts)", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET });
    await mountMap();
    await openPath(PATHS.smr);
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(panel().querySelector(".v4DigWaitLine")?.textContent).toBe(word("v4.dig.quotaDayUsed", { time }));
    expect(panel().querySelector(".v4PanelDigBtn")?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("the borrowed notice in the usage area", () => {
  it("tells the person that running work used part of tomorrow's and next week's quota", async () => {
    harness.borrowed = [
      { scope: "PERSON_WEEK", run_ref: "run-b", percent: 2, next_window_starts_at: "2026-11-02T00:00:00.000Z" },
      { scope: "PERSON_DAY", run_ref: "run-a", percent: 4, next_window_starts_at: RESET },
      { scope: "PERSON_DAY", run_ref: "run-c", percent: 3, next_window_starts_at: RESET }
    ];
    await mountMap();
    const notes = [...page().querySelectorAll(".v4DebRailUsageNote")].map((note) => note.textContent);
    expect(notes).toEqual([
      word("v4.money.borrowed.PERSON_DAY", { percent: 7 }),
      word("v4.money.borrowed.PERSON_WEEK", { percent: 2 })
    ]);
  });

  it("shows nothing when nothing was borrowed", async () => {
    await mountMap();
    expect(page().querySelector(".v4DebRailUsage")).toBeNull();
  });
});

describe("a debate paused at the month wall", () => {
  // Owner review 3 Nov (wait-f5, map-f31, public-f17): the pause is said once, with a still mark; before the reset nothing
  // looks pressable ("Continues on …" is a plain label); after it, Continue.
  it("says it once, with a still mark and no Continue button before the reset", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, false);
    await mountMap(1600, runId);
    const date = formatDate("en", NEXT_MONTH, { dateStyle: "medium" });
    const day = formatDate("en", NEXT_MONTH, { day: "numeric", month: "short" });
    expect(text()).toContain(word("v4.money.paused", { date }));
    expect(text()).not.toContain(word("v4.debate.state.PAUSED_MONTH", { date }));
    expect(text()).toContain(word("v4.pause.continuesOn", { date: day }));
    expect(text()).toContain(CATALOG["v4.money.continueNote"]);
    expect(text()).not.toContain(CATALOG["v4.debate.usually"]);
    expect(buttonsNamed(CATALOG["v4.money.continue"]!)).toEqual([]);
    expect(page().querySelector(".v4DebPulse")).toBeNull();
    expect(page().querySelector(".v4PauseDot")).not.toBeNull();
  });

  it("once the month has reset, Continue resumes it", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, true);
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.money.pausedReady"]);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(harness.continueRun).toHaveBeenCalledWith(runId);
    expect(buttonNamed(CATALOG["v4.money.continuing"]!).disabled).toBe(true);
  });

  it("a Continue the server still refuses as too early says from when, and nothing changed", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, true);
    harness.continueRun = vi.fn(async () => ({ kind: "TOO_EARLY" as const, until: NEXT_MONTH }));
    await mountMap(1600, runId);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(text()).toContain(word("v4.money.continueTooEarly", { date: formatDate("en", NEXT_MONTH, { dateStyle: "medium" }) }));
    expect(buttonNamed(CATALOG["v4.money.continue"]!).disabled).toBe(false);
  });

  it("a failed Continue says so plainly", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, true);
    harness.continueRun = vi.fn(async () => ({ kind: "FAILED" as const }));
    await mountMap(1600, runId);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(text()).toContain(CATALOG["v4.money.continueFailed"]);
  });

  it("when the new month starts while the page is open, the block changes at once with the 1-second highlight", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, false);
    await mountMap(1600, runId);
    expect(page().querySelector(".v4Pause.v4Highlight")).toBeNull();
    harness.run = paused(runId, true);
    await advance(5_000);
    expect(text()).toContain(CATALOG["v4.money.pausedReady"]);
    expect(page().querySelector(".v4Pause.v4Highlight")).not.toBeNull();
    await advance(1_000);
    expect(page().querySelector(".v4Pause.v4Highlight")).toBeNull();
  });
});

describe("\"Write my report\" is always there", () => {
  const cases: ReadonlyArray<readonly [string, () => void, 375 | 1280]> = [
    ["room fits", () => { harness.room = room(); }, 1280],
    ["new starts wait", () => { harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" }); }, 1280],
    ["borrowed", () => { harness.borrowed = [{ scope: "PERSON_DAY", run_ref: "r", percent: 4, next_window_starts_at: RESET }]; }, 1280],
    ["Free", () => { harness.planTier = "free"; }, 1280],
    ["phone", () => undefined, 375]
  ];
  for (const [name, arrange, width] of cases) {
    it(`when ${name}`, async () => {
      arrange();
      const runId = await mountMap(width);
      const links = reportLinks();
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]!.getAttribute("href")).toMatch(new RegExp(`^/v4/debate/${runId}/report`, "u"));
    });
  }

  it("at the deepest level too (where nothing more can be dug)", async () => {
    const runId = crypto.randomUUID();
    harness.answer = seededAnswer(runId, { dig: digPart(crypto.randomUUID(), DIG_LEVEL_MAX) });
    await mountMap(1600, runId);
    expect(reportLinks().length).toBeGreaterThan(0);
  });
});

describe("the money lines' own rules (lib/v4/money.ts)", () => {
  it("before a new question: its share of today; a dig's share only on a dig's read; shares only", async () => {
    const money = await vi.importActual<typeof Money>("../../apps/ui/lib/v4/money.js");
    expect(money.startShareLine(room({ start_share_percent: 15 }))).toEqual({ key: "v4.room.startShare", values: { percent: 15 } });
    expect(word("v4.room.startShare", { percent: 15 })).toBe("This question uses about 15% of today.");
    expect(money.startShareLine(room())).toBeNull();
    expect(money.digShareLine(room({ dig_share_percent: 0 }))).toBeNull();
    expect(money.startsWaitLine(room({ room: "FULL", scope: "SITE_DAY", resets_at: RESET }), "en")).toBeNull();
    expect(money.startsWaitLine(room({ room: "FULL", scope: "PERSON_WEEK", resets_at: RESET }), "en")).toBeNull();
    expect(money.startsWaitLine(room({ room: "FULL", scope: "PERSON_WEEK", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" }), "en")?.key)
      .toBe("v4.money.startsWait.PERSON_WEEK");
  });

  // R22 W3-8: the route is registered and the page calls it through the typed client (`continueRun`), over the same
  // same-origin proxy (/api) the browser client uses.
  it("Continue posts to the run's continue route through the typed client and reads its three answers", async () => {
    const money = await vi.importActual<typeof Money>("../../apps/ui/lib/v4/money.js");
    const { createBrowserContractClient } = await vi.importActual<typeof import("../../apps/ui/lib/api.js")>("../../apps/ui/lib/api.js");
    const calls: Array<[string, RequestInit | undefined]> = [];
    const answer = (status: number, body: unknown) => createBrowserContractClient((async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch);
    expect(await money.continueRun("run-1", answer(200, { state: "CONTINUING" }))).toEqual({ kind: "CONTINUING" });
    expect(new URL(calls[0]![0], "http://localhost").pathname).toBe("/api/v1/runs/run-1/continue");
    expect(calls[0]![1]?.method).toBe("POST");
    expect(await money.continueRun("run-1", answer(409, { error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until: NEXT_MONTH })))
      .toEqual({ kind: "TOO_EARLY", until: NEXT_MONTH });
    expect(await money.continueRun("run-1", answer(500, { error: "SERVER_FAILURE" }))).toEqual({ kind: "FAILED" });
    expect(await money.continueRun("run-1", { continueRun: async () => { throw new Error("offline"); } })).toEqual({ kind: "FAILED" });
  });
});
