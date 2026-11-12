// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4BottomStack } from "../../apps/ui/components/v4/V4BottomStack.js";
import { V4ShareChange } from "../../apps/ui/components/v4/V4ShareChange.js";
import { phoneBarJob } from "../../apps/ui/components/v4/mapDigHelpers.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { formatDate } from "../../apps/ui/lib/i18n/translate.js";
import { quotaChanged } from "../../apps/ui/lib/v4/quotaPulse.js";
import type { V4DigQuota } from "../../apps/ui/lib/v4/digQuota.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import type { DigTarget } from "../../apps/ui/lib/v4/types.js";
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
    // CODE-4 (the wave-2 checks, P3): the panel's reused button moved from renew's 6% to smr's 4%; another place's share is
    // not a change of this one, so no grey mark shows (the panel passes its place as `subject`).
    expect(panel().querySelector(".v4ShareChange")).toBeNull();
    // dig-f4: one pick has no tray; this other path's panel says where the picks wait, with [Go to them] (dig-f5, below).
    expect(tray()).toBeNull();
    expect(buttonsNamed(`${CATALOG["v4.dig.yourPicks.one"]} · ${share(6)}`, panel())).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.suggest.goToPicks"]!, panel())).toHaveLength(1);
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
    // ACCESS-4: the pressed button went with the other path, so focus moves to the new place's heading, never the body.
    expect(document.activeElement).not.toBe(document.body);
    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.tagName).toMatch(/^H[1-6]$/u);
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
    // ACCESS-14: the sign stays before the number on right-to-left pages too.
    expect(mark.getAttribute("dir")).toBe("ltr");
    await advance(2_100);
    expect(panel().querySelector(".v4ShareChange")).toBeNull();
  });

  it("CODE-4: a share of another place is never shown as a change (path A at 6%, then path B at 4%: no '−2%')", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<V4ShareChange share={6} subject="path:a" />));
    await act(async () => root.render(<V4ShareChange share={4} subject="path:b" />));
    expect(host.querySelector(".v4ShareChange")).toBeNull();
    // On the same place a change shows again.
    await act(async () => root.render(<V4ShareChange share={9} subject="path:b" />));
    expect(host.querySelector(".v4ShareChange")?.textContent).toBe("+5%");
    await act(async () => root.unmount());
    host.remove();
  });

  it("CODE-4 on the phone (RC-3): the pinned bar's mark is of its own place: one place's 6%, then another's 4%, shows no '−2%'", async () => {
    // The bar's job names the place it digs (mapDigHelpers.ts phoneBarJob), an open question's or a path's picks.
    const quota = { label: () => "Dig", share: () => 6, periodLine: null, waitLine: null } as unknown as V4DigQuota;
    const open = { kind: "open", questions: [{ id: "o:1" }, { id: "o:2" }] } as unknown as DigTarget;
    const picks = { kind: "picks", path: { id: "n-mix" }, picks: [] } as unknown as DigTarget;
    const jobOf = (target: DigTarget) => phoneBarJob({ target, again: false }, quota, CATALOG, () => undefined, () => undefined, null);
    expect(jobOf(open)).toMatchObject({ kind: "dig", share: 6, place: "open:o:1,o:2" });
    expect(jobOf(picks)).toMatchObject({ kind: "dig", share: 6, place: "path:n-mix" });
    // The bar passes that place on to its mark, so a share of another place is never shown as a change.
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const bar = (share: number, place: string) => (
      <V4BottomStack phone notes={null} tray={null} goodTime={false} reportHref="/v4/report" catalog={CATALOG}
        job={{ kind: "dig", label: `Dig · ${share}%`, onDig: () => undefined, share, place }} />
    );
    await act(async () => root.render(bar(6, "path:n-mix")));
    await act(async () => root.render(bar(4, "path:n-smr")));
    expect(host.querySelector(".v4ShareChange")).toBeNull();
    await act(async () => root.render(bar(9, "path:n-smr")));
    expect(host.querySelector(".v4DebPhoneBar .v4ShareChange")?.textContent).toBe("+5%");
    await act(async () => root.unmount());
    host.remove();
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
    await advance(DIG_UNDO_MS + 1_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("wait-f22: a dig sent is a quota moment: the figures read again", async () => {
    harness.room = room({ dig_share_percent: 20 });
    await mountMap();
    await openPath(PATHS.smr);
    const before = harness.roomAgainReads;
    await click(buttonNamed(`${CATALOG["v4.panel.dig"]} · ${share(20)}`, panel()));
    await advance(DIG_UNDO_MS + 100);
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
    // journey-f14 (the wave-2 checks): the reason is a visible line right above the bar, and the button names it.
    const why = stack()!.querySelector<HTMLElement>("[data-bar-why]")!;
    expect(why.textContent).toBe(word("v4.dig.quotaDayUsed", { time }));
    expect(why.classList.contains("v4SrOnly")).toBe(false);
    expect(phoneJob().getAttribute("aria-describedby")).toBe(why.id);
    await click(phoneJob());
    await advance(DIG_UNDO_MS + 1_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("while new digs wait on a whole path, the bar still reads 'Choose what to dig ›' and leads to the choices (dig-f31)", async () => {
    harness.room = room({ room: "FULL", scope: "PERSON_DAY", resets_at: RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    await mountMap(375, crypto.randomUUID(), "n-renew");
    expect(phoneJob().textContent).toBe(CATALOG["v4.dig.chooseWhat"]);
    expect(phoneJob().getAttribute("aria-disabled")).toBeNull();
    expect(stack()!.querySelector("[data-bar-why]")).toBeNull();
    // ACCESS-11: the where-bar is pinned at the top, so the choices stop just under it (its height + 8 px), not behind it.
    const where = page().querySelector<HTMLElement>(".v4WhereBar")!;
    where.getBoundingClientRect = () => ({ height: 52, width: 375, top: 0, left: 0, bottom: 52, right: 375, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    await click(phoneJob());
    // The choices take focus; there the greyed button says why and offers nothing that digs at once.
    expect(document.activeElement).toBe(panel().querySelector(".v4Sugs"));
    expect(panel().querySelector<HTMLElement>(".v4Sugs")!.style.scrollMarginTop).toBe("60px");
    await advance(DIG_UNDO_MS + 1_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("journey-f8 on the phone (OWNER-5): the bar's own change mark when the same picks' share changes, gone after 2 seconds", async () => {
    harness.room = room({ dig_share_percent: 3 });
    await mountMap(375, crypto.randomUUID(), "n-renew");
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    expect(phoneJob().textContent).toBe(`${CATALOG["v4.dig.yourPicks.one"]} · ${share(3)}`);
    expect(stack()!.querySelector(".v4ShareChange")).toBeNull();
    // The room is read again after a quota moment and says more for the same picks: the bar shows the change.
    harness.roomAgain = room({ dig_share_percent: 7 });
    await act(async () => quotaChanged());
    await settle();
    expect(phoneJob().textContent).toBe(`${CATALOG["v4.dig.yourPicks.one"]} · ${share(7)}`);
    const mark = stack()!.querySelector<HTMLElement>(".v4DebPhoneBar .v4ShareChange")!;
    expect(mark.textContent).toBe("+4%");
    expect(mark.getAttribute("dir")).toBe("ltr");
    await advance(2_100);
    expect(stack()!.querySelector(".v4ShareChange")).toBeNull();
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

describe("wait-f22 / map-f9: the first digs the page reads are its starting point (the wave-2 review, CODE-3)", () => {
  it("an old dig found while the page still reads its digs is no quota moment; a dig started after is one", async () => {
    const { createRoot } = await import("react-dom/client");
    const { useQuotaMoments } = await import("../../apps/ui/lib/v4/useQuotaMoments.js");
    const { useQuotaBeat } = await import("../../apps/ui/lib/v4/quotaPulse.js");
    type View = import("../../apps/ui/lib/v4/types.js").DigView;
    const view = (id: string, state: View["state"]): View => ({ link: { childRunId: id }, state }) as unknown as View;
    function Probe({ digs, settled }: Readonly<{ digs: readonly View[]; settled: boolean }>) {
      useQuotaMoments({ running: false, served: true, digs, settled });
      return <span data-beat={useQuotaBeat()} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const probe = createRoot(host);
    const beat = (): number => Number(host.querySelector("span")!.getAttribute("data-beat"));
    try {
      await act(async () => probe.render(<Probe digs={[]} settled={false} />));
      const start = beat();
      // The old dig shows as working until its own read answers, then as done: the page was still reading its digs.
      await act(async () => probe.render(<Probe digs={[view("old", "RUNNING")]} settled={false} />));
      await act(async () => probe.render(<Probe digs={[view("old", "DONE")]} settled />));
      expect(beat()).toBe(start);
      // A dig started now is a moment, once.
      await act(async () => probe.render(<Probe digs={[view("old", "DONE"), view("new", "RUNNING")]} settled={false} />));
      expect(beat()).toBe(start + 1);
      await act(async () => probe.render(<Probe digs={[view("old", "DONE"), view("new", "RUNNING")]} settled />));
      expect(beat()).toBe(start + 1);
    } finally {
      await act(async () => probe.unmount());
      host.remove();
    }
  });
});
