import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { shelfStateText } from "../../apps/ui/components/v4/V4MapShelf.js";
import { stateWordText } from "../../apps/ui/lib/v4/stateWords.js";

/*
 * WHOLE-12 (the wave-2 checks, 4 Nov; honesty check P7): the "All my maps" shelf says each state in the shared state words
 * (lib/v4/stateWords.ts, journey-f22), the same as the waiting card, so the two can never drift apart. Every branch is
 * pinned here, the month pause (before and after the reset, and with no date) and the wait included.
 */
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const NEXT_MONTH = "2026-12-01T00:00:00.000Z";

describe("the shelf's state words are the waiting card's (WHOLE-12)", () => {
  it("a month pause: 'Paused until 1 December' before the reset, 'Ready to continue' after it, and a calm line with no date", () => {
    const before = shelfStateText("PAUSED", null, CATALOG, "en", { until: NEXT_MONTH, canContinue: false });
    expect(before).toBe(stateWordText({ kind: "PAUSED", until: NEXT_MONTH, canContinue: false }, CATALOG, "en"));
    // journey-f22: a day and a month, no year ("Paused until 1 December", day first on English pages: question 5).
    expect(before).toMatch(/^Paused until \S+ \S+$/u);
    expect(before).not.toMatch(/\b\d{4}\b/u);
    const after = shelfStateText("PAUSED", null, CATALOG, "en", { until: NEXT_MONTH, canContinue: true });
    expect(after).toBe(stateWordText({ kind: "PAUSED", until: NEXT_MONTH, canContinue: true }, CATALOG, "en"));
    expect(after).toBe(CATALOG["v4.state.PAUSED.canContinue"]);
    expect(shelfStateText("PAUSED", null, CATALOG, "en", null)).toBe(CATALOG["v4.state.PAUSED.noDate"]);
  });

  it("a wait with no time from the server: 'Waiting', the shared word", () => {
    const waiting = shelfStateText("WAITING", null, CATALOG, "en");
    expect(waiting).toBe(stateWordText({ kind: "WAITING", startsAfter: null }, CATALOG, "en"));
    expect(waiting).toBe(CATALOG["v4.state.WAITING.noTime"]);
  });

  it("third round (owner, 5 Nov): a question started on an earlier day names it in the long form with the year; today, the clock alone", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 5, 9, 0));
      const earlier = new Date(2026, 10, 4, 14, 2).toISOString();
      expect(shelfStateText("WORKING", earlier, CATALOG, "en")).toBe(`${CATALOG["v4.state.LOOKING"]} · Started 4 November 2026, 14:02`);
      const today = new Date(2026, 10, 5, 8, 15).toISOString();
      expect(shelfStateText("WORKING", today, CATALOG, "en")).toBe(`${CATALOG["v4.state.LOOKING"]} · Started 08:15`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ready and didn't finish: the shared words", () => {
    expect(shelfStateText("READY", null, CATALOG, "en")).toBe(stateWordText({ kind: "READY" }, CATALOG, "en"));
    expect(shelfStateText("FAILED", null, CATALOG, "en")).toBe(stateWordText({ kind: "DIDNT_FINISH" }, CATALOG, "en"));
  });
});
