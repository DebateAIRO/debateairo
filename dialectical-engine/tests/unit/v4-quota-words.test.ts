import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { clock24, CLOCK_24H } from "../../apps/ui/lib/v4/clock.js";
import {
  digButtonLabel, digPeriodLine, digWaitLine, digWaitOf, digWords, shareChangeText, shareOfTarget, waitWords
} from "../../apps/ui/lib/v4/digQuota.js";
import {
  limitLine, limitWindowOf, questionShareOf, resetText, sharePeriodOf, startShareLine, startsWaitLine, usedUpLine
} from "../../apps/ui/lib/v4/money.js";
import { quotaMomentBetween } from "../../apps/ui/lib/v4/useQuotaMoments.js";
import type { DigTarget, DigView, V4DigPick, V4OpenQuestion, V4Path } from "../../apps/ui/lib/v4/types.js";

/*
 * The owner's screen review (OWNER-PICKS-2026-11-03.md), the quota track's rules, without a page:
 *  - journey-f15: one 24-hour clock form; a day's reset "after 08:00", a week's "after Monday 09:00", a month's "on 1 December".
 *  - read-f19 / public-f14 / map-f33: a share names its own window (the room read's optional share_scope; Free's month).
 *  - public-f24: one set of limit lines, whichever server switch is in force.
 *  - journey-f13 / dig-f5: "Dig here · up to 3%", "Dig into your pick(s) · …", the tray's "Dig into these · …"; each with
 *    its own share; dig-f11: the reset time on a button that waits; journey-f8: "+4%" / "−2%".
 *  - wait-f22 / map-f9: which changes on the map are quota moments.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const DAY_RESET = "2026-11-05T08:00:00.000Z";
const WEEK_RESET = "2026-11-09T09:00:00.000Z";
const MONTH_RESET = "2026-12-01T00:00:00.000Z";

function room(extra: Partial<AskRoom> & Record<string, unknown> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}
const path = { id: "n-renew", line: "Mostly renewables.", open: [] } as unknown as V4Path;
const question = { id: "p:x", text: "Is storage cheap enough?", pathId: "n-renew" } as unknown as V4OpenQuestion;
const pick = (key: string) => ({ key, kind: "OPEN", question }) as unknown as V4DigPick;
const whole: DigTarget = { kind: "path", path };
const one: DigTarget = { kind: "picks", path, picks: [pick("a")] };
const two: DigTarget = { kind: "picks", path, picks: [pick("a"), pick("b")] };

describe("journey-f15: one clock and one way to write a reset", () => {
  it("writes clock times on the 24-hour clock, never AM or PM", () => {
    expect(CLOCK_24H.hourCycle).toBe("h23");
    expect(clock24("2026-11-04T14:31:00.000Z", "en")).toBe(new Intl.DateTimeFormat("en", CLOCK_24H).format(new Date("2026-11-04T14:31:00.000Z")));
    expect(clock24("2026-11-04T14:31:00.000Z", "en")).toMatch(/^\d{2}:\d{2}$/u);
    expect(clock24("nope", "en")).toBeNull();
    expect(clock24(null, "en")).toBeNull();
    expect(resetText(DAY_RESET, "PERSON_DAY", "en")).toMatch(/^\d{2}:\d{2}$/u);
    expect(resetText(WEEK_RESET, "PERSON_WEEK", "en")).toMatch(/^[A-Z][a-z]+day,? \d{2}:\d{2}$/u);
    expect(resetText(MONTH_RESET, "PERSON_MONTH", "en")).toMatch(/^[A-Z][a-z]+ \d{1,2}$/u);
    // journey-f22 / journey-f15 (the wave-2 checks): a month pause is written the same way as the month's reset.
    expect(resetText(MONTH_RESET, "MONTH_PAUSE", "en")).toBe(resetText(MONTH_RESET, "PERSON_MONTH", "en"));
  });

  it("a day and a week wait 'after' a time, a month 'on' its date, on the line and on the button", () => {
    const day = room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    const month = room({ room: "FULL", scope: "PERSON_MONTH", resets_at: MONTH_RESET, new_starts: "BLOCKED_UNTIL_RESET", plan_id: "FREE" });
    const time = resetText(DAY_RESET, "PERSON_DAY", "en");
    const date = resetText(MONTH_RESET, "PERSON_MONTH", "en");
    expect(startsWaitLine(day, "en")).toEqual({ key: "v4.money.startsWait.PERSON_DAY", values: { time } });
    expect(startsWaitLine(month, "en")).toEqual({ key: "v4.money.startsWait.PERSON_MONTH", values: { date } });
    expect(waitWords(digWaitOf(day)!, CATALOG, "en")).toBe(`after ${time}`);
    expect(waitWords(digWaitOf(month)!, CATALOG, "en")).toBe(`on ${date}`);
  });
});

describe("read-f19 / public-f14 / map-f33: the window a share is of", () => {
  it("is the room read's share_scope when it names one, else Free's month and today for every other plan", () => {
    expect(sharePeriodOf(room({ dig_share_percent: 5 }))).toBe("PERSON_DAY");
    expect(sharePeriodOf(room({ plan_id: "FREE", dig_share_percent: 5 }))).toBe("PERSON_MONTH");
    expect(sharePeriodOf(room({ dig_share_percent: 5, share_scope: "PERSON_WEEK" }))).toBe("PERSON_WEEK");
    // A word it does not know (a team's window) is not trusted: the plan's rule stands.
    expect(sharePeriodOf(room({ dig_share_percent: 5, share_scope: "TEAM_MONTH" }))).toBe("PERSON_DAY");
    expect(sharePeriodOf(null)).toBe("PERSON_DAY");
  });

  it("the new question's line and the dig's period name that window", () => {
    expect(startShareLine(room({ start_share_percent: 15 }))).toEqual({ key: "v4.room.startShare", values: { percent: 15 } });
    expect(startShareLine(room({ plan_id: "FREE", start_share_percent: 15 }))).toEqual({ key: "v4.room.startShare.PERSON_MONTH", values: { percent: 15 } });
    expect(startShareLine(room({ start_share_percent: 15, share_scope: "PERSON_WEEK" }))?.key).toBe("v4.room.startShare.PERSON_WEEK");
    expect(word("v4.room.startShare.PERSON_MONTH", { percent: 15 })).toBe("This question uses about 15% of this month.");
    expect(digPeriodLine(room({ plan_id: "FREE" }), CATALOG)).toBe("of this month · you can still finish your report");
    expect(digPeriodLine(room(), CATALOG)).toBe("of today · you can still finish your report");
    expect(digPeriodLine(room({ share_scope: "PERSON_WEEK" }), CATALOG)).toBe("of this week · you can still finish your report");
  });

  it("map-f9: this question's share from the run read's optional field, checked", () => {
    expect(questionShareOf({ question_share: { scope: "PERSON_DAY", percent: 11 } })).toEqual({ scope: "PERSON_DAY", percent: 11 });
    expect(questionShareOf({ question_share: { scope: "PERSON_GRANT", percent: 11 } })).toBeNull();
    expect(questionShareOf({ question_share: { scope: "PERSON_DAY", percent: 1.5 } })).toBeNull();
    expect(questionShareOf({ question_share: { scope: "PERSON_DAY", percent: -1 } })).toBeNull();
    expect(questionShareOf({ run_ref: "r" })).toBeNull();
    expect(questionShareOf(null)).toBeNull();
    expect(word("v4.debate.questionShare.PERSON_DAY", { percent: 11 })).toBe("This question: 11% of today");
  });
});

describe("public-f24: one set of limit lines whichever server switch is in force", () => {
  const older = room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET });
  const newer = room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET, new_starts: "BLOCKED_UNTIL_RESET" });

  it("a full person window holds new starts under either switch, with the same line", () => {
    expect(limitWindowOf(older)).toEqual({ scope: "PERSON_DAY", at: DAY_RESET, free: false });
    expect(limitLine(older, "en")).toEqual(limitLine(newer, "en"));
    expect(usedUpLine(older, "en")).toEqual(usedUpLine(newer, "en"));
    expect(digWaitLine(older, CATALOG, "en")).toBe(word("v4.dig.quotaDayUsed", { time: resetText(DAY_RESET, "PERSON_DAY", "en") }));
  });

  it("holds nothing for a room that fits, is only close, waits for the person's own debates, or is the site's or a team's", () => {
    expect(limitWindowOf(room())).toBeNull();
    expect(limitWindowOf(room({ room: "CLOSE", scope: "PERSON_DAY" }))).toBeNull();
    expect(limitWindowOf(room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET, waits_for: "OWN_DEBATES" }))).toBeNull();
    expect(limitWindowOf(room({ room: "FULL", scope: "SITE_DAY", resets_at: DAY_RESET }))).toBeNull();
    const team = { ...older, plan_id: null, funding: { kind: "INTERNAL", expires_at: MONTH_RESET } } as unknown as AskRoom;
    expect(limitWindowOf(team)).toBeNull();
    // A team window the server itself says holds new starts is held, as before.
    expect(limitWindowOf({ ...team, new_starts: "BLOCKED_UNTIL_RESET" } as AskRoom)?.scope).toBe("PERSON_DAY");
    expect(digWaitLine(room(), CATALOG, "en")).toBeNull();
  });

  it("the week's and the month's waits read their own V4 line beside a dig button", () => {
    const week = room({ room: "FULL", scope: "PERSON_WEEK", resets_at: WEEK_RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    expect(digWaitLine(week, CATALOG, "en")).toBe(word("v4.money.startsWait.PERSON_WEEK", { time: resetText(WEEK_RESET, "PERSON_WEEK", "en") }));
    const month = room({ room: "FULL", scope: "PERSON_MONTH", resets_at: MONTH_RESET, new_starts: "BLOCKED_UNTIL_RESET" });
    expect(digWaitLine(month, CATALOG, "en")).toBe(word("v4.money.startsWait.PERSON_MONTH", { date: resetText(MONTH_RESET, "PERSON_MONTH", "en") }));
  });
});

describe("journey-f13 / dig-f5 / dig-f11: the dig buttons' words", () => {
  it("one button word, the picks' words, the tray's, each with its own share", () => {
    expect(digWords(whole, CATALOG, "en")).toBe("Dig here");
    expect(digWords(one, CATALOG, "en")).toBe("Dig into your pick");
    expect(digWords(two, CATALOG, "en")).toBe("Dig into your picks");
    expect(digWords(two, CATALOG, "en", true)).toBe("Dig into these");
    expect(digWords(one, CATALOG, "en", true)).toBe("Dig into your pick");
    const shares = { whole: 4, picks: 6 };
    expect(shareOfTarget(whole, shares)).toBe(4);
    expect(shareOfTarget({ kind: "open", questions: [question] }, shares)).toBe(4);
    expect(shareOfTarget({ kind: "open", questions: [question, question] }, shares)).toBeNull();
    expect(shareOfTarget(two, shares)).toBe(6);
    expect(digButtonLabel({ target: whole, share: 4, wait: null, catalog: CATALOG, locale: "en" })).toBe("Dig here · up to 4%");
    expect(digButtonLabel({ target: two, share: 5, wait: null, catalog: CATALOG, locale: "en", tray: true })).toBe("Dig into these · up to 5%");
    expect(digButtonLabel({ target: whole, share: null, wait: null, catalog: CATALOG, locale: "en" })).toBe("Dig here");
  });

  it("a button that waits for a reset carries the reset time, never a share", () => {
    const wait = digWaitOf(room({ room: "FULL", scope: "PERSON_DAY", resets_at: DAY_RESET, new_starts: "BLOCKED_UNTIL_RESET" }))!;
    expect(digButtonLabel({ target: one, share: 3, wait, catalog: CATALOG, locale: "en" }))
      .toBe(`Dig into your pick · after ${resetText(DAY_RESET, "PERSON_DAY", "en")}`);
  });

  it("journey-f8: a change is a grey '+4%' or '−2%' (the real minus sign), and no change says nothing", () => {
    expect(shareChangeText(3, 7)).toBe("+4%");
    expect(shareChangeText(7, 5)).toBe("−2%");
    expect(shareChangeText(5, 5)).toBeNull();
  });
});

describe("wait-f22 / map-f9: the map's quota moments", () => {
  const view = (id: string, state: DigView["state"]) => ({ link: { childRunId: id }, state }) as unknown as DigView;
  it("a dig that starts, or that finishes or fails, is a moment; digs already done when the page opened are not", () => {
    const before = new Map<string, DigView["state"]>([["a", "RUNNING"], ["b", "DONE"]]);
    expect(quotaMomentBetween(before, [view("a", "RUNNING"), view("b", "DONE")])).toBe(false);
    expect(quotaMomentBetween(before, [view("a", "DONE"), view("b", "DONE")])).toBe(true);
    expect(quotaMomentBetween(before, [view("a", "FAILED"), view("b", "DONE")])).toBe(true);
    expect(quotaMomentBetween(before, [view("a", "RUNNING"), view("b", "DONE"), view("c", "WAITING")])).toBe(true);
    expect(quotaMomentBetween(before, [view("a", "RUNNING"), view("b", "DONE"), view("d", "DONE")])).toBe(false);
  });
});
