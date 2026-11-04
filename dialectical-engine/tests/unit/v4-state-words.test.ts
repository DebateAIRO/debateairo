import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RunProjectionSchema, type RunProjection } from "../../packages/contract/src/index.js";
import {
  clockText,
  dayText,
  isWorking,
  keepsGoing,
  stateWordOf,
  stateWordText,
  WAIT_STATE_KINDS,
  waitDotOf,
  waitStateOfDig,
  waitStateOfRun,
  whenText,
  type WaitState
} from "../../apps/ui/lib/v4/stateWords.js";

/*
 * Owner's screen review, 3 Nov 2026 (journey-f22): one short list of state words for every wait, card, rail, "Your
 * questions", email and the report. "Paused" is only the month's quota; the short hold and a wait for the person's own
 * other question have their own words (wait-f20, wait-f6); times are clock times from the server (journey-f16).
 */
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const NOW = Date.parse("2026-11-04T10:00:00.000Z");
// journey-f15 (owner's screen review): one 24-hour clock on every V4 page ("14:31", never "02:31 PM").
const clock = (iso: string): string => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const run = (fields: Partial<RunProjection>): RunProjection => RunProjectionSchema.parse({
  run_ref: "r-1", question_line: "Should my town close the old centre to cars?", state: "RUNNING", terminal_reason: null, hold_until: null, ...fields
});
const ALL: readonly WaitState[] = [
  { kind: "LOOKING" },
  { kind: "WAITING", startsAfter: "2026-11-04T10:30:00.000Z" },
  { kind: "WAITING", startsAfter: null },
  { kind: "WAITING_OWN" },
  { kind: "SHORT_BREAK", continuesAbout: "2026-11-04T10:35:00.000Z" },
  { kind: "SHORT_BREAK", continuesAbout: null },
  { kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: false },
  { kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: true },
  { kind: "READY" },
  { kind: "DIDNT_FINISH" },
  { kind: "BEING_WRITTEN" }
];

describe("the shared state words (journey-f22)", () => {
  it("are the owner's words, word for word", () => {
    expect(CATALOG["v4.state.LOOKING"]).toBe("Looking into it");
    expect(CATALOG["v4.state.WAITING"]).toBe("Waiting · starts after {time}");
    expect(CATALOG["v4.state.PAUSED"]).toBe("Paused until {date}");
    expect(CATALOG["v4.state.READY"]).toBe("Ready");
    expect(CATALOG["v4.state.DIDNT_FINISH"]).toBe("Didn't finish");
    expect(CATALOG["v4.state.BEING_WRITTEN"]).toBe("Being written");
    // wait-f6 and wait-f20: the two waits that are not the month's pause.
    expect(CATALOG["v4.state.WAITING_OWN"]).toBe("Waiting for your other question to finish first");
    expect(CATALOG["v4.state.SHORT_BREAK"]).toBe("Taking a short break · continues about {time}");
  });

  it("every state has its word in the catalogue, and only the month's pause says \"Paused\"", () => {
    for (const state of ALL) {
      const word = stateWordOf(state, "en", NOW);
      expect(CATALOG[word.key], word.key).toBeDefined();
      const text = stateWordText(state, CATALOG, "en", NOW);
      expect(text, word.key).not.toMatch(/\{|\}/u);
      expect(/\bPaused\b/u.test(text), word.key).toBe(state.kind === "PAUSED" && !state.canContinue);
    }
    expect(new Set(ALL.map((state) => state.kind))).toEqual(new Set(WAIT_STATE_KINDS));
  });

  it("no state word names a price, a model, a score, an engine word, a quota word other than \"quota\", or a duration", () => {
    const words = Object.entries(CATALOG).filter(([key]) => key.startsWith("v4.state.") || key.startsWith("v4.wait."));
    expect(words.length).toBeGreaterThanOrEqual(18);
    for (const [key, line] of words) {
      const plain = line.replace(/\{[A-Za-z]+\}/gu, "");
      expect(plain, key).not.toMatch(/\d|[$€£¢]|\b(?:score|threshold|strength|allowance|limit|usually|minutes?|seconds?|hours?|GLM|Haiku|Opus|model)\b/iu);
      expect(plain, key).not.toMatch(/\b[A-Z_]{4,}\b/u);
    }
  });

  it("no V4 line promises an unmeasured time (journey-f16, wait-f3): no \"usually\", no \"about N\" or \"N to M minutes\"", () => {
    const lines = Object.entries(CATALOG);
    expect(lines.filter(([, line]) => /\busually\b|\babout \d|\d+\s*(?:to|-|–)\s*\d+\s*(?:minutes?|hours?)/iu.test(line)).map(([key]) => key)).toEqual([]);
    // wait-f3's words, naming the list by its new heading (ask-d5 B, the step-1 track: "Your maps").
    expect(CATALOG["v4.debate.usually"]).toBe("This takes a while. You can leave this page. Your question will be under “Your maps”.");
    // The report page's own line (t4 report track, report-f7) names when it started and promises no length.
    expect(CATALOG["v4.investigation.writingSince"]).toBe("Your report is being written. Started {time}. This takes a while. You can leave this page and come back later.");
  });

  it("a wait names a clock time from the server, with its day only when it is not today", () => {
    // Half an hour after NOW: the same day wherever the test runs.
    expect(stateWordText({ kind: "WAITING", startsAfter: "2026-11-04T10:30:00.000Z" }, CATALOG, "en", NOW))
      .toBe(`Waiting · starts after ${clock("2026-11-04T10:30:00.000Z")}`);
    expect(stateWordText({ kind: "WAITING", startsAfter: null }, CATALOG, "en", NOW)).toBe("Waiting");
    const later = stateWordText({ kind: "WAITING", startsAfter: "2026-11-06T12:00:00.000Z" }, CATALOG, "en", NOW);
    expect(later).toMatch(/^Waiting · starts after Nov [5-7], /u);
    expect(stateWordText({ kind: "SHORT_BREAK", continuesAbout: null }, CATALOG, "en", NOW)).toBe("Taking a short break");
    expect(stateWordText({ kind: "PAUSED", until: "2026-12-01T12:00:00.000Z", canContinue: false }, CATALOG, "en", NOW))
      .toBe(`Paused until ${dayText("2026-12-01T12:00:00.000Z", "en")!}`);
    expect(stateWordText({ kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: true }, CATALOG, "en", NOW)).toBe("Ready to continue");
    expect(stateWordText({ kind: "PAUSED", until: "not a date", canContinue: false }, CATALOG, "en", NOW)).toBe("Paused until your new month starts");
  });

  it("clock and day texts are the page's language, and unreadable times give null", () => {
    expect(clockText("2026-11-04T14:31:00.000Z", "en")).toBe(clock("2026-11-04T14:31:00.000Z"));
    expect(clockText("2026-11-04T14:31:00.000Z", "en")).toMatch(/^\d{2}:\d{2}$/u);
    expect(clockText("nope", "en")).toBeNull();
    expect(whenText("nope", "en", NOW)).toBeNull();
    expect(dayText("nope", "en")).toBeNull();
    expect(dayText("2026-12-01T12:00:00.000Z", "en")).toBe("December 1");
    expect(dayText("2026-12-01T12:00:00.000Z", "ro")).toBe("1 decembrie");
  });

  it("the dot pulses only while the AIs work, is hollow while it waits or is paused, solid when ready, absent when it stopped", () => {
    expect(ALL.map((state) => [state.kind, waitDotOf(state)])).toEqual([
      ["LOOKING", "PULSE"], ["WAITING", "HOLLOW"], ["WAITING", "HOLLOW"], ["WAITING_OWN", "HOLLOW"], ["SHORT_BREAK", "HOLLOW"],
      ["SHORT_BREAK", "HOLLOW"], ["PAUSED", "HOLLOW"], ["PAUSED", "HOLLOW"], ["READY", "SOLID"], ["DIDNT_FINISH", "NONE"],
      ["BEING_WRITTEN", "PULSE"]
    ]);
    expect(ALL.filter(isWorking).map((state) => state.kind)).toEqual(["LOOKING", "BEING_WRITTEN"]);
    // "You can leave this page. It keeps going." only while it goes on or starts by itself; never while it is paused.
    expect(ALL.filter(keepsGoing).map((state) => state.kind))
      .toEqual(["LOOKING", "WAITING", "WAITING", "WAITING_OWN", "SHORT_BREAK", "SHORT_BREAK", "BEING_WRITTEN"]);
  });
});

describe("a question's status read as a state word", () => {
  it("starting, running and writing up are all \"Looking into it\"", () => {
    for (const state of ["QUEUED", "CLAIMED", "RUNNING", "SETTLED"] as const) expect(waitStateOfRun(run({ state }))).toEqual({ kind: "LOOKING" });
  });

  it("a wait for the quota names its reset; a wait for the person's own question names no time", () => {
    expect(waitStateOfRun(run({ state: "WAITING", waits_until: "2026-11-05T08:00:00.000Z" })))
      .toEqual({ kind: "WAITING", startsAfter: "2026-11-05T08:00:00.000Z" });
    expect(waitStateOfRun(run({ state: "WAITING", waits_until: "2026-11-04T10:01:00.000Z", waits_for: "OWN_DEBATES" })))
      .toEqual({ kind: "WAITING_OWN" });
  });

  it("the server's hold is a short break, the month's pause wins, and a failure didn't finish", () => {
    expect(waitStateOfRun(run({ state: "HOLDING", hold_until: "2026-11-04T10:35:00.000Z" })))
      .toEqual({ kind: "SHORT_BREAK", continuesAbout: "2026-11-04T10:35:00.000Z" });
    expect(waitStateOfRun(run({ state: "RUNNING", month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: false } })))
      .toEqual({ kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: false });
    expect(waitStateOfRun(run({ state: "HOLDING", hold_until: "2026-11-04T10:35:00.000Z", month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: true } })))
      .toEqual({ kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: true });
    expect(waitStateOfRun(run({ state: "FAILED", terminal_reason: "PROVIDER_DOWN" }))).toEqual({ kind: "DIDNT_FINISH" });
  });

  it("a dig reads the same words", () => {
    expect(waitStateOfDig({ state: "WAITING" })).toEqual({ kind: "WAITING", startsAfter: null });
    expect(waitStateOfDig({ state: "RUNNING" })).toEqual({ kind: "LOOKING" });
    expect(waitStateOfDig({ state: "DONE" })).toEqual({ kind: "READY" });
    expect(waitStateOfDig({ state: "FAILED" })).toEqual({ kind: "DIDNT_FINISH" });
    expect(waitStateOfDig({ state: "RUNNING", pausedUntil: "2026-12-01T00:00:00.000Z" }))
      .toEqual({ kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: false });
    expect(waitStateOfDig({ state: "RUNNING", pausedUntil: "2026-12-01T00:00:00.000Z", canContinue: true }))
      .toEqual({ kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: true });
    // A dig that finished is ready, even if an old pause date is still on its view.
    expect(waitStateOfDig({ state: "DONE", pausedUntil: "2026-12-01T00:00:00.000Z" })).toEqual({ kind: "READY" });
  });
});
