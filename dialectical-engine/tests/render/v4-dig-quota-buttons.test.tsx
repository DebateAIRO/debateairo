// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import { quotaChanged } from "../../apps/ui/lib/v4/quotaPulse.js";
import { digRoomQuery } from "../../apps/ui/lib/v4/useDigQuota.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, expandBranch, harness, mountMap, openPath, page, panel, PATHS,
  resetHarness, settle, text, tray, unmountMap
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
 * The owner's screen review (OWNER-PICKS-2026-11-03.md), the quota track on the map page:
 *  - dig-f5: each dig button's share comes from its own check: the picks' button the picks' share, another place's
 *    "Dig here" the whole dig's share (a second room read); "Your picks are waiting on “…”. [Go to them] [Clear them]".
 *  - journey-f8: a changed share shows its grey "+N%" for 2 seconds.
 *  - dig-f11 / map-f9: after a quota moment the dig's room read is asked again, so the buttons grey with the reset time.
 *  - dig-f31: the phone's pinned bar never digs a whole path before its choices were shown; an open question digs at once.
 *  - map-f9: "This question: 11% of today" in the top line (the question on one line), on the phone's question screen
 *    and in its bar elsewhere; the borrow notices on the phone's other screens too.
 *  - public-f14: the Undo note's share names Free's month.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const RESET = "2026-11-05T08:00:00.000Z";
const share = (percent: number): string => word("v4.undo.barShare", { percent });
const stack = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4Stack");
const phoneJob = (): HTMLButtonElement => stack()!.querySelector<HTMLButtonElement>(".v4DebPhoneDig")!;

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}

async function pickFirstSuggestion(index: number): Promise<void> {
  await expandBranch(index);
  await click(branch(index).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("dig-f5: each dig button carries its own share", () => {
  it("the picks' button shows the picks' share; another path's 'Dig here' the whole dig's, from its own read", async () => {
    harness.room = room({ dig_share_percent: 6 });
    harness.wholeShare = 4;
    await mountMap();
    await pickFirstSuggestion(PATHS.renew);
    await settle();
    // The second read asks a whole dig: the main read's question without its picks.
    const asked = harness.digShareReads.at(-1) as Record<string, unknown>;
    expect(asked).toMatchObject({ dig_mode: "quick" });
    expect(asked).not.toHaveProperty("dig_picks");
    await openPath(PATHS.renew);
    expect(buttonsNamed(`${CATALOG["v4.dig.yourPicks.one"]} · ${share(6)}`, panel())).toHaveLength(1);
    await openPath(PATHS.smr);
    expect(buttonsNamed(`${CATALOG["v4.panel.dig"]} · ${share(4)}`, panel())).toHaveLength(1);
    // The tray's button is the picks' too.
    expect(buttonsNamed(`${CATALOG["v4.dig.yourPicks.one"]} · ${share(6)}`, tray()!)).toHaveLength(1);
  });

  it("with picks on another path: 'Your picks are waiting on “…”', and [Go to them] opens that path, [Clear them] clears", async () => {
    await mountMap();
    await pickFirstSuggestion(PATHS.renew);
    await openPath(PATHS.smr);
    const waiting = panel().querySelector<HTMLElement>(".v4SugElsewhere")!;
    expect(waiting.textContent).toContain(word("v4.suggest.waitingOn", { path: "" }).split("“")[0]!);
    expect(waiting.querySelector("[data-ai-generated=\"true\"]")?.textContent?.length).toBeGreaterThan(0);
    expect(waiting.textContent).not.toContain(CATALOG["v4.suggest.otherPath"]);
    await click(buttonNamed(CATALOG["v4.suggest.goToPicks"]!, waiting));
    expect(panel().querySelector(".v4SugElsewhere")).toBeNull();
    expect(panel().querySelector(".v4SugPicked")).not.toBeNull();
    await openPath(PATHS.smr);
    await click(buttonNamed(CATALOG["v4.suggest.clearPicks"]!, panel()));
    expect(tray()).toBeNull();
  });

  it("dig-f5: the second read asks the main read's own question without picks; the main one names its picks", () => {
    const read = room({ plan_id: "PLUS", length_settings: true, dig_share_percent: 6 });
    const main = digRoomQuery(read, "11111111-1111-4111-8111-111111111111", "thorough", "background", 2);
    const wholeQuery = digRoomQuery(read, "11111111-1111-4111-8111-111111111111", "thorough", "background", 0);
    expect(main).toMatchObject({ plan_tier: "premium", dig_parent: "11111111-1111-4111-8111-111111111111", dig_mode: "thorough", dig_picks: 2 });
    expect(wholeQuery).not.toHaveProperty("dig_picks");
    expect({ ...wholeQuery, dig_picks: 2 }).toEqual(main);
    // Free digs are quick looks: the read asks for one whatever the switch says.
    expect(digRoomQuery(room({ plan_id: "FREE" }), "11111111-1111-4111-8111-111111111111", "thorough", "plain", 0)).toMatchObject({
      plan_tier: "free", dig_mode: "quick"
    });
  });
});

describe("journey-f8: a changed share in grey for 2 seconds", () => {
  it("shows '+15%' beside the button when Thorough's read says more, and takes it away after 2 seconds", async () => {
    harness.room = room({ dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    expect(panel().querySelector(".v4ShareChange")).toBeNull();
    harness.room = room({ dig_share_percent: 35 });
    await click(buttonNamed(CATALOG["v4.digMode.thorough"]!, panel()));
    expect(buttonsNamed(`${CATALOG["v4.panel.dig"]} · ${share(35)}`, panel())).toHaveLength(1);
    const mark = panel().querySelector<HTMLElement>(".v4ShareChange")!;
    expect(mark.textContent).toBe("+15%");
    expect(mark.classList.contains("v4Highlight")).toBe(true);
    await advance(2_100);
    expect(panel().querySelector(".v4ShareChange")).toBeNull();
  });

  it("read-f20: one short hint under each choice, whichever is chosen", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    const hints = [...panel().querySelectorAll(".v4PanelMode .v4PanelModeHint")].map((hint) => hint.textContent);
    expect(hints).toEqual([CATALOG["v4.panel.modeHint.quick"], CATALOG["v4.panel.modeHint.thorough"]]);
  });
});

describe("dig-f11 / map-f9: the room read again after a quota moment", () => {
  it("greys the buttons with the reset time as soon as new digs wait, without a refused press", async () => {
    harness.room = room({ dig_share_percent: 20 });
    harness.roomAgain = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap();
    await openPath(PATHS.smr);
    expect(panel().querySelector(".v4PanelDigBtn")?.getAttribute("aria-disabled")).toBeNull();
    await act(async () => quotaChanged());
    await settle();
    expect(harness.roomAgainReads).toBeGreaterThan(0);
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const button = panel().querySelector<HTMLButtonElement>(".v4PanelDigBtn")!;
    expect(button.textContent).toBe(`${CATALOG["v4.panel.dig"]} · ${word("v4.dig.after", { time })}`);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(panel().querySelector(".v4DigWaitLine")?.textContent).toBe(word("v4.dig.quotaDayUsed", { time }));
    // Pressing it explains the wait again (the line takes the highlight) and starts nothing.
    await click(button);
    expect(panel().querySelector(".v4DigWaitLine")?.classList.contains("v4Highlight")).toBe(true);
    await advance(11_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("wait-f22: a dig sent is a quota moment: the figures read again", async () => {
    harness.room = room({ dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    const before = harness.roomAgainReads;
    await click(buttonNamed(`${CATALOG["v4.panel.dig"]} · ${share(20)}`, panel()));
    await advance(10_100);
    await settle(16_000);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.roomAgainReads).toBeGreaterThan(before);
  });

  it("public-f14: on Free the Undo note's share is of this month, and no mode word shows", async () => {
    harness.planTier = "free";
    harness.room = room({ plan_id: "FREE", dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    await click(buttonNamed(`${CATALOG["v4.panel.dig"]} · ${share(20)}`, panel()));
    expect(text()).toContain(word("v4.undo.digShare.PERSON_MONTH", { percent: 20 }));
    expect(text()).not.toContain(word("v4.undo.digShare", { percent: 20 }));
  });
});

describe("dig-f31: the phone's pinned bar", () => {
  it("an open question's own screen digs it at once, with its share", async () => {
    harness.room = room({ dig_share_percent: 3 });
    await mountMap(375, crypto.randomUUID(), "n-renew");
    const open = panel().querySelector<HTMLButtonElement>(".v4PanelRowBtn");
    expect(open).not.toBeNull();
    await click(open!);
    expect(panel().classList.contains("v4Panel-open")).toBe(true);
    expect(phoneJob().textContent).toBe(`${CATALOG["v4.panel.dig"]} · ${share(3)}`);
  });

  it("while new digs wait, the bar's button stays greyed with the reset time and digs nothing", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap(375, crypto.randomUUID(), "n-renew");
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    const time = formatDate("en", RESET, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(phoneJob().textContent).toBe(`${CATALOG["v4.dig.yourPicks.one"]} · ${word("v4.dig.after", { time })}`);
    expect(phoneJob().getAttribute("aria-disabled")).toBe("true");
    await click(phoneJob());
    await advance(11_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });
});

describe("map-f9: 'This question: N% of today'", () => {
  it("the top line holds the question on one line and this question's share, read again after a quota moment", async () => {
    harness.questionShare = { scope: "PERSON_DAY", percent: 11 };
    await mountMap();
    const line = page().querySelector<HTMLElement>(".v4TopLine")!;
    expect(line.querySelector(".v4TopLineQuestion")?.textContent?.length).toBeGreaterThan(0);
    expect(line.querySelector(".v4QuestionShare")?.textContent).toBe(word("v4.debate.questionShare.PERSON_DAY", { percent: 11 }));
    harness.questionShare = { scope: "PERSON_DAY", percent: 14 };
    await act(async () => quotaChanged());
    await settle();
    expect(line.querySelector(".v4QuestionShare")?.textContent).toBe(word("v4.debate.questionShare.PERSON_DAY", { percent: 14 }));
  });

  it("without the server's figure only the question shows", async () => {
    await mountMap();
    expect(page().querySelector(".v4TopLine .v4QuestionShare")).toBeNull();
    expect(page().querySelector(".v4TopLine .v4TopLineQuestion")).not.toBeNull();
  });

  it("on the phone: on the question's own screen, in the pinned bar elsewhere, and the borrow notices there too", async () => {
    harness.questionShare = { scope: "PERSON_MONTH", percent: 30 };
    harness.borrowed = [{ scope: "PERSON_DAY", run_ref: "run-a", percent: 4, next_window_starts_at: RESET }];
    await mountMap(375);
    const words = word("v4.debate.questionShare.PERSON_MONTH", { percent: 30 });
    expect(page().querySelector(".v4TopLine")).toBeNull();
    expect(page().querySelector(".v4DebMain .v4QuestionShare")?.textContent).toBe(words);
    expect(page().querySelector(".v4DebPhoneUsage")).toBeNull();
    await unmountMap();
    await mountMap(375, crypto.randomUUID(), "n-smr");
    expect(page().querySelector(".v4DebMain .v4QuestionShare")).toBeNull();
    expect(stack()!.querySelector(".v4QuestionShare")?.textContent).toBe(words);
    expect(page().querySelector(".v4DebPhoneUsage")?.textContent).toBe(word("v4.money.borrowed.PERSON_DAY", { percent: 4 }));
  });
});
