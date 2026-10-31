// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import type * as Money from "../../apps/ui/lib/v4/money.js";
import { DIG_LEVEL_MAX, type RunProjection } from "../../packages/contract/src/index.js";
import {
  branch, buttonNamed, CATALOG, click, digPart, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer,
  text, tray, unmountMap
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

describe("before a dig: its share of today", () => {
  it("the approved line, word for word, in the tray and beside the dig button", async () => {
    harness.room = room({ dig_share_percent: 20 });
    await mountMap();
    const line = word("v4.dig.quotaShare", { percent: 20 });
    expect(line).toBe("This dig uses about 20% of today. After it you can still finish your report.");
    await click(branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
    expect(tray()?.textContent).toContain(line);
    await openPath(PATHS.renew);
    expect(panel().querySelector(".v4PanelDig")?.textContent).toContain(line);
    // A share only: never a price (the AIs' own text may name money; the page's money lines never do).
    const lines = [...page().querySelectorAll(".v4MoneyLine")].map((node) => node.textContent ?? "");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(/[$€£¢]|\bcents?\b|\bdollars?\b/iu);
  });

  it("says nothing when the room read names no share", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    expect(text()).not.toContain("This dig uses about");
  });
});

describe("new starts wait for the reset (new_starts: BLOCKED_UNTIL_RESET)", () => {
  it("the day: the line with the reset time; running work goes on, and the report can still be written", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET", dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit" });
    expect(panel().textContent).toContain(word("v4.money.startsWait.PERSON_DAY", { time }));
    expect(reportLinks().length).toBeGreaterThan(0);
  });

  it("the month: its own line, which says the report can still be written", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_MONTH", resets_at: NEXT_MONTH, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap();
    await openPath(PATHS.smr);
    const time = formatDate("en", NEXT_MONTH, { dateStyle: "medium", timeStyle: "short" });
    expect(panel().textContent).toContain(word("v4.money.startsWait.PERSON_MONTH", { time }));
    expect(CATALOG["v4.money.startsWait.PERSON_MONTH"]).toContain("You can still write your report.");
  });
});

describe("the borrowed notice in the usage area", () => {
  it("tells the person that running work used part of tomorrow's and next week's allowance", async () => {
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
  it("says 'paused until {date}', and Continue before the reset is refused with nothing changed", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, false);
    harness.continueRun = vi.fn(async () => ({ kind: "TOO_EARLY" as const, until: NEXT_MONTH }));
    await mountMap(1280, runId);
    const date = formatDate("en", NEXT_MONTH, { dateStyle: "medium" });
    expect(text()).toContain(word("v4.debate.state.PAUSED_MONTH", { date }));
    expect(text()).toContain(word("v4.money.paused", { date }));
    expect(text()).toContain(CATALOG["v4.money.continueNote"]);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(harness.continueRun).toHaveBeenCalledWith(runId);
    expect(text()).toContain(word("v4.money.continueTooEarly", { date }));
    expect(buttonNamed(CATALOG["v4.money.continue"]!).disabled).toBe(false);
  });

  it("once the month has reset, Continue resumes it", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, true);
    await mountMap(1280, runId);
    expect(text()).toContain(CATALOG["v4.money.pausedReady"]);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(buttonNamed(CATALOG["v4.money.continuing"]!).disabled).toBe(true);
  });

  it("a failed Continue says so plainly", async () => {
    const runId = crypto.randomUUID();
    harness.run = paused(runId, true);
    harness.continueRun = vi.fn(async () => ({ kind: "FAILED" as const }));
    await mountMap(1280, runId);
    await click(buttonNamed(CATALOG["v4.money.continue"]!));
    expect(text()).toContain(CATALOG["v4.money.continueFailed"]);
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
    await mountMap(1280, runId);
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
