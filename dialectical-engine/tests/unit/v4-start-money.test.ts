import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StartStepRoomSchema, type StartStepRoom } from "../../packages/contract/src/index.js";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { shareChangeText } from "../../apps/ui/lib/v4/digQuota.js";
import {
  SHARE_DELTA_SHOW_MS, shareDeltaLine, startPathsShare, startPathsShareLine, startShareChange, startShareLine
} from "../../apps/ui/lib/v4/money.js";
import { pathPlanFromMenu } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 69: the live share per path count, in "quota" words, on both steps (choose-f14, choose-f7, r2-2,
 * read-d5 / journey-f8, chat-quota-word-on-choosing-card). One share line in one unit on step 1 and step 2: "about 11% of
 * today", on Free "about 16% of this month"; a change shows as a grey "+4%" / "−2%" for 2 seconds; the shares beside
 * combine and look wider name no period; no line says what would be left, and none says "allowance".
 * Every share here is made up: Plus [6, 9, 12, 15, 18, 21, 24] for 1..7 paths, Free [8, 12, 16] for 1..3.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const word = (key: string, values: Readonly<Record<string, string | number>> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);

const PLUS: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] });
const FREE: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [8, 12, 16] });
const NO_SHARE: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 } });

function room(extra: Partial<AskRoom> & Record<string, unknown> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}

/** The keys this task adds, with their English (draft wording until the click-test). */
const TASK_69_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.start.share.day": "about {percent}% of today",
  "v4.start.share.month": "about {percent}% of this month",
  "v4.start.shareUp": "+{percent}%",
  "v4.start.shareDown": "−{percent}%",
  "v4.start.combineFrees.one": "Combining frees {count} path (about {percent}%, −{delta}%)",
  "v4.start.combineFrees.other": "Combining frees {count} paths (about {percent}%, −{delta}%)",
  "v4.start.lookWider": "Look wider: {wider} paths (about {percent}%, +{delta}%)"
});

describe("Task 69: the share change's time", () => {
  it("is 2 seconds, in one place", () => {
    expect(SHARE_DELTA_SHOW_MS).toBe(2_000);
  });
});

describe("Task 69: the share of a debate of n paths (the room's share_by_paths)", () => {
  it("reads the entry for the path count", () => {
    expect(startPathsShare(PLUS, 5)).toBe(18);
    expect(startPathsShare(PLUS, 1)).toBe(6);
    expect(startPathsShare(FREE, 3)).toBe(16);
  });

  it("is null without the room's start step or without its shares (an internal grant, billing off)", () => {
    expect(startPathsShare(null, 5)).toBeNull();
    expect(startPathsShare(NO_SHARE, 5)).toBeNull();
    expect(startPathsShare(PLUS, Number.NaN)).toBeNull();
  });

  it("clamps a count outside 1..widest to the nearest entry", () => {
    expect(startPathsShare(PLUS, 9)).toBe(24);
    expect(startPathsShare(PLUS, 0)).toBe(6);
    expect(startPathsShare(FREE, 5)).toBe(16);
  });

  it("the fixture's plan at How wide 5 is about 18% of today; on Free its 3 paths are about 16% of this month", () => {
    const plus = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const free = pathPlanFromMenu(NUCLEAR_MENU, 3, true);
    expect(word(startPathsShareLine(startPathsShare(PLUS, plus.paths.length), false)!.key, { percent: startPathsShare(PLUS, plus.paths.length)! }))
      .toBe("about 18% of today");
    expect(word(startPathsShareLine(startPathsShare(FREE, free.paths.length), true)!.key, { percent: startPathsShare(FREE, free.paths.length)! }))
      .toBe("about 16% of this month");
  });
});

describe("Task 69: the one share line (choose-f14, journey-f8)", () => {
  it("says today, and on Free this month", () => {
    expect(startPathsShareLine(18, false)).toEqual({ key: "v4.start.share.day", values: { percent: 18 } });
    expect(startPathsShareLine(16, true)).toEqual({ key: "v4.start.share.month", values: { percent: 16 } });
    expect(word("v4.start.share.day", { percent: 11 })).toBe("about 11% of today");
    expect(word("v4.start.share.month", { percent: 16 })).toBe("about 16% of this month");
  });

  it("is null without a share or at 0", () => {
    expect(startPathsShareLine(null, false)).toBeNull();
    expect(startPathsShareLine(0, false)).toBeNull();
    expect(startPathsShareLine(0, true)).toBeNull();
  });
});

describe("Task 69: the grey change (journey-f8)", () => {
  it("+4% and −2% (the real minus sign), written as the dig's change is; nothing at 0", () => {
    expect(shareDeltaLine(4)).toEqual({ key: "v4.start.shareUp", values: { percent: 4 } });
    expect(shareDeltaLine(-2)).toEqual({ key: "v4.start.shareDown", values: { percent: 2 } });
    expect(shareDeltaLine(0)).toBeNull();
    expect(word("v4.start.shareUp", shareDeltaLine(4)!.values)).toBe("+4%");
    expect(word("v4.start.shareDown", shareDeltaLine(-2)!.values)).toBe("−2%");
    expect(word("v4.start.shareUp", shareDeltaLine(4)!.values)).toBe(shareChangeText(18, 22));
    expect(word("v4.start.shareDown", shareDeltaLine(-2)!.values)).toBe(shareChangeText(18, 16));
  });
});

describe("Task 69: the share after a change, and the change", () => {
  it("one path fewer and two more", () => {
    expect(startShareChange(PLUS, 5, 4)).toEqual({ percent: 15, delta: -3 });
    expect(startShareChange(PLUS, 5, 7)).toEqual({ percent: 24, delta: 6 });
  });

  it("clamps counts outside 1..widest", () => {
    expect(startShareChange(PLUS, 5, 9)).toEqual({ percent: 24, delta: 6 });
    expect(startShareChange(PLUS, 9, 4)).toEqual({ percent: 15, delta: -9 });
    expect(startShareChange(FREE, 3, 5)).toEqual({ percent: 16, delta: 0 });
  });

  it("is null without the start step or its shares", () => {
    expect(startShareChange(null, 5, 4)).toBeNull();
    expect(startShareChange(NO_SHARE, 5, 4)).toBeNull();
  });

  it("the shares beside combine and look wider name no period (journey-f8; owner answer Q7)", () => {
    const combine = startShareChange(PLUS, 5, 4)!;
    const wider = startShareChange(PLUS, 5, 7)!;
    expect(word("v4.start.combineFrees.one", { count: 1, percent: combine.percent, delta: -combine.delta }))
      .toBe("Combining frees 1 path (about 15%, −3%)");
    expect(word("v4.start.combineFrees.other", { count: 2, percent: startShareChange(PLUS, 5, 3)!.percent, delta: -startShareChange(PLUS, 5, 3)!.delta }))
      .toBe("Combining frees 2 paths (about 12%, −6%)");
    expect(word("v4.start.lookWider", { wider: 7, percent: wider.percent, delta: wider.delta })).toBe("Look wider: 7 paths (about 24%, +6%)");
    for (const key of ["v4.start.combineFrees.one", "v4.start.combineFrees.other", "v4.start.lookWider"]) {
      expect(CATALOG[key], key).not.toMatch(/today|week|month/iu);
    }
  });
});

describe("Task 69: step 1's share line, in step 2's unit", () => {
  it("Free says this month; every other plan today", () => {
    expect(startShareLine(room({ plan_id: "FREE", start_share_percent: 6 }), true)).toEqual({ key: "v4.room.startShare.PERSON_MONTH", values: { percent: 6 } });
    expect(startShareLine(room({ start_share_percent: 6 }), false)).toEqual({ key: "v4.room.startShare", values: { percent: 6 } });
    expect(word("v4.room.startShare.PERSON_MONTH", { percent: 16 })).toBe("This question uses about 16% of this month.");
    expect(word("v4.room.startShare", { percent: 11 })).toBe("This question uses about 11% of today.");
  });

  it("the plan's own Free mark decides the unit, as on step 2: a FREE row with a grant is not Free, and no other window is named", () => {
    expect(startShareLine(room({ plan_id: "FREE", start_share_percent: 6 }), false)?.key).toBe("v4.room.startShare");
    expect(startShareLine(room({ start_share_percent: 6, share_scope: "PERSON_WEEK" }), false)?.key).toBe("v4.room.startShare");
    expect(startShareLine(room({ start_share_percent: 6, share_scope: "PERSON_WEEK" }), true)?.key).toBe("v4.room.startShare.PERSON_MONTH");
  });

  it("is null without a share, as before", () => {
    expect(startShareLine(room(), true)).toBeNull();
    expect(startShareLine(room({ start_share_percent: 0 }), false)).toBeNull();
    expect(startShareLine(null, false)).toBeNull();
  });

  it("without the plan's mark (today's callers) the room read's window stands, unchanged", () => {
    expect(startShareLine(room({ plan_id: "FREE", start_share_percent: 15 }))).toEqual({ key: "v4.room.startShare.PERSON_MONTH", values: { percent: 15 } });
    expect(startShareLine(room({ start_share_percent: 15, share_scope: "PERSON_WEEK" }))?.key).toBe("v4.room.startShare.PERSON_WEEK");
    expect(startShareLine(room({ start_share_percent: 15 }))).toEqual({ key: "v4.room.startShare", values: { percent: 15 } });
  });
});

describe("Task 69: the words (chat-quota-word-on-choosing-card, r2-2)", () => {
  it("are the brief's, word for word", () => {
    expect(Object.fromEntries(Object.keys(TASK_69_LINES).map((key) => [key, CATALOG[key]]))).toEqual(TASK_69_LINES);
  });

  it("say neither 'allowance' nor what would be left", () => {
    const lines = [...Object.keys(TASK_69_LINES), "v4.room.startShare", "v4.room.startShare.PERSON_MONTH"].map((key) => [key, CATALOG[key]!] as const);
    expect(lines.filter(([, value]) => /allowance/iu.test(value))).toEqual([]);
    expect(lines.filter(([, value]) => /left after|\bleft\b|remain/iu.test(value))).toEqual([]);
    expect(Object.entries(CATALOG).filter(([key, value]) => key.startsWith("v4.start.") && /allowance|left after/iu.test(value))).toEqual([]);
  });
});
