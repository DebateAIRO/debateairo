import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ContractHttpError, createContractClient, InvestigationReportsSchema, PublicDebateSchema, type ContractClient, type PublicDebate
} from "@debateai/contract";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { writeReport } from "../../apps/ui/lib/v4/load.js";
import { limitLine, limitLineWhileReportWaits, reportWaitLine } from "../../apps/ui/lib/v4/money.js";
import { pressPublicReport, publicReportWaitLine } from "../../apps/ui/lib/v4/publicPage.js";
import { firstReportLeftOf } from "../../apps/ui/lib/v4/reportWriting.js";
import { seedPublicDebates } from "../../tools/v4-mock-api/public-seed.js";

/*
 * V4 start step, Task 56c (item public-f25, the page half; owner answer Q20 B: only a debate's very first report uses the kept reserve). A further
 * report on a public debate (after a visitor's report, or a second one) uses the quota and waits for the reset like digs, "and their button says when
 * they can run". The line shows before a press only when the page is sure: on the owner's pages when the server says the press would not be the debate's
 * first report (`first_closing_left: false`, Task 56b), and on the public page once a report already shows. The words say when, never what is left, and
 * never a price. Made-up times only.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

// Local times, so the clock reads the same on any machine: 08:00 today-ish, a Monday at 09:00, and the first of December.
const DAY_RESET = new Date(2026, 10, 8, 8, 0, 0).toISOString();
const WEEK_RESET = new Date(2026, 10, 9, 9, 0, 0).toISOString();
const MONTH_RESET = new Date(2026, 11, 1, 0, 0, 0).toISOString();

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}
const usedUp = (scope: "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH", at: string, plan: AskRoom["plan_id"] = "PLUS"): AskRoom =>
  room({ room: "FULL", scope, resets_at: at, new_starts: "BLOCKED_UNTIL_RESET", plan_id: plan });
const words = (line: { key: string; values: Readonly<Record<string, string | number>> } | null): string | null => line === null ? null
  : Object.entries(line.values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), CATALOG[line.key]!);

describe("reportWaitLine: a further report on a public debate says when it can start", () => {
  it("public, not the first report, a used-up day: 'This report can start after 08:00.'", () => {
    const line = reportWaitLine({ room: usedUp("PERSON_DAY", DAY_RESET), isPublic: true, firstReportLeft: false, locale: "en" });
    expect(line).toEqual({ key: "v4.report.waits.PERSON_DAY", values: { time: "08:00" } });
    expect(words(line)).toBe("This report can start after 08:00.");
  });

  it("a week names its day and clock, a month its date ('on')", () => {
    expect(words(reportWaitLine({ room: usedUp("PERSON_WEEK", WEEK_RESET), isPublic: true, firstReportLeft: false, locale: "en" })))
      .toBe("This report can start after Monday 09:00.");
    expect(words(reportWaitLine({ room: usedUp("PERSON_MONTH", MONTH_RESET, "FREE"), isPublic: true, firstReportLeft: false, locale: "en" })))
      .toBe("This report can start on 1 December.");
  });

  it("the debate's first report never waits: firstReportLeft true, or not said (null)", () => {
    expect(reportWaitLine({ room: usedUp("PERSON_DAY", DAY_RESET), isPublic: true, firstReportLeft: true, locale: "en" })).toBeNull();
    expect(reportWaitLine({ room: usedUp("PERSON_DAY", DAY_RESET), isPublic: true, firstReportLeft: null, locale: "en" })).toBeNull();
  });

  it("a private debate never waits", () => {
    expect(reportWaitLine({ room: usedUp("PERSON_DAY", DAY_RESET), isPublic: false, firstReportLeft: false, locale: "en" })).toBeNull();
  });

  it("no window holds new starts: nothing to say (a room that fits, a team's window, no room read)", () => {
    expect(reportWaitLine({ room: room(), isPublic: true, firstReportLeft: false, locale: "en" })).toBeNull();
    expect(reportWaitLine({ room: room({ room: "CLOSE", scope: "PERSON_DAY", resets_at: DAY_RESET }), isPublic: true, firstReportLeft: false, locale: "en" }))
      .toBeNull();
    expect(reportWaitLine({ room: null, isPublic: true, firstReportLeft: false, locale: "en" })).toBeNull();
  });

  it("the words say when, never what is left and never a price", () => {
    for (const key of ["v4.report.waits.PERSON_DAY", "v4.report.waits.PERSON_WEEK", "v4.report.waits.PERSON_MONTH",
      "v4.money.startsWait.PERSON_MONTH_NO_REPORT"]) {
      expect(CATALOG[key], key).toBeTruthy();
      expect(CATALOG[key], key).not.toMatch(/[$€£¢%]|\bleft\b|\bremain|\d/iu);
    }
    expect(CATALOG["v4.report.waits.PERSON_DAY"]).toBe("This report can start after {time}.");
    expect(CATALOG["v4.report.waits.PERSON_WEEK"]).toBe("This report can start after {time}.");
    expect(CATALOG["v4.report.waits.PERSON_MONTH"]).toBe("This report can start on {date}.");
    expect(CATALOG["v4.money.startsWait.PERSON_MONTH_NO_REPORT"]).toBe("You've used this month's quota. New questions and digs can start on {date}.");
  });
});

describe("limitLineWhileReportWaits: the month line drops 'You can still write your report.' while this debate's report waits", () => {
  it("the month line, with its date, without the report sentence", () => {
    const month = limitLine(usedUp("PERSON_MONTH", MONTH_RESET, "FREE"), "en")!;
    expect(words(month)).toContain("You can still write your report.");
    const swapped = limitLineWhileReportWaits(month, true);
    expect(swapped).toEqual({ key: "v4.money.startsWait.PERSON_MONTH_NO_REPORT", values: month.values });
    expect(words(swapped)).toBe("You've used this month's quota. New questions and digs can start on 1 December.");
  });

  it("unchanged when nothing waits, and for a day's or a week's line (they say nothing of the report)", () => {
    const month = limitLine(usedUp("PERSON_MONTH", MONTH_RESET, "FREE"), "en")!;
    expect(limitLineWhileReportWaits(month, false)).toBe(month);
    const day = limitLine(usedUp("PERSON_DAY", DAY_RESET), "en")!;
    expect(limitLineWhileReportWaits(day, true)).toBe(day);
  });
});

describe("publicReportWaitLine: the public page says it only once a report already shows", () => {
  const withReport = (): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[0]);
  const withoutReport = (): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[1]);

  it("one report shown and a used-up day: the line (any further report waits, the owner's too)", () => {
    expect(withReport().reports?.length).toBe(1);
    expect(words(publicReportWaitLine(usedUp("PERSON_DAY", DAY_RESET), withReport(), "en"))).toBe("This report can start after 08:00.");
  });

  it("no report shown: null (the press may be the owner's first report, which goes ahead)", () => {
    expect(withoutReport().reports ?? []).toEqual([]);
    expect(publicReportWaitLine(usedUp("PERSON_DAY", DAY_RESET), withoutReport(), "en")).toBeNull();
  });

  it("a report shown but new starts can go: null", () => {
    expect(publicReportWaitLine(room(), withReport(), "en")).toBeNull();
    expect(publicReportWaitLine(null, withReport(), "en")).toBeNull();
  });
});

describe("pressPublicReport: a report press refused until the reset says when, never 'You can still write your report.'", () => {
  // Review of Task 56c: the refusal is about this very report, so the month line goes without its last sentence, as on the map.
  const refusing = {
    writePublicReport: async () => ({ error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" })
  } as unknown as Pick<ContractClient, "writePublicReport">;
  const REF = "f1000000-0000-4000-8000-0000000000d6";

  it("a used-up month (Free's only window): the month line with its date, without the report sentence", async () => {
    const answer = await pressPublicReport(REF, { catalog: CATALOG, room: usedUp("PERSON_MONTH", MONTH_RESET, "FREE"), locale: "en" }, refusing);
    expect(answer).toEqual({ kind: "REFUSED", message: "You've used this month's quota. New questions and digs can start on 1 December." });
  });

  it("a used-up day: today's line as before; no room read: the site's plain reset line", async () => {
    expect(await pressPublicReport(REF, { catalog: CATALOG, room: usedUp("PERSON_DAY", DAY_RESET), locale: "en" }, refusing)).toEqual({
      kind: "REFUSED", message: "You've used what today allows. New questions and digs can start after 08:00. Anything already running will finish."
    });
    expect(await pressPublicReport(REF, { catalog: CATALOG, room: null, locale: "en" }, refusing))
      .toEqual({ kind: "REFUSED", message: CATALOG["v4.public.refusal.waitsForReset"] });
  });
});

describe("firstReportLeftOf: the owner's investigation read says whether the next report is the debate's first", () => {
  const read = (extra: Record<string, unknown>) => InvestigationReportsSchema.parse({
    investigation_id: null, root_run_id: "4e000000-0000-4000-8000-000000000001", state: "OPEN", digs: 0, versions: [], current: null, ...extra
  });
  it("true, false, or null when the read does not say it (or is not there)", () => {
    expect(firstReportLeftOf(read({ first_closing_left: true }))).toBe(true);
    expect(firstReportLeftOf(read({ first_closing_left: false }))).toBe(false);
    expect(firstReportLeftOf(read({}))).toBeNull();
    expect(firstReportLeftOf(null)).toBeNull();
  });
});

describe("writeReport: a further report refused until the reset is its own answer, never a failure to confirm", () => {
  const RUN = "4e000000-0000-4000-8000-000000000002";
  /** The real contract client over a made-up answer of the report route. */
  const clientAnswering = (status: number, body: unknown): Pick<ContractClient, "writeReport"> =>
    createContractClient("http://localhost", (async () => new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" }
    })) as typeof fetch);

  it("409 PUBLIC_DEBATE_WAITS_FOR_RESET → WAITS_FOR_RESET", async () => {
    const answer = await writeReport(RUN, clientAnswering(409, { error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" }));
    expect(answer).toEqual({ kind: "WAITS_FOR_RESET" });
    // The same refusal thrown by any client reads the same.
    expect(await writeReport(RUN, { writeReport: async () => { throw new ContractHttpError("SERVER_FAILURE", 409, "x", "PUBLIC_DEBATE_WAITS_FOR_RESET"); } }))
      .toEqual({ kind: "WAITS_FOR_RESET" });
  });

  it("a 500, another 409 or a lost connection stays FAILED, as today", async () => {
    expect(await writeReport(RUN, clientAnswering(500, { error: "INTERNAL", message: "INTERNAL" }))).toEqual({ kind: "FAILED" });
    expect(await writeReport(RUN, clientAnswering(409, { error: "PUBLIC_DEBATE_ONGOING", message: "PUBLIC_DEBATE_ONGOING" }))).toEqual({ kind: "FAILED" });
    expect(await writeReport(RUN, { writeReport: async () => { throw new Error("offline"); } })).toEqual({ kind: "FAILED" });
  });

  it("a 202 and a finished report read as before", async () => {
    expect(await writeReport(RUN, clientAnswering(202, { state: "WRITING", report_version: 2, waiting_for_digs: 0 })))
      .toEqual({ kind: "WRITING", reportVersion: 2, waitingForDigs: 0 });
    expect(await writeReport(RUN, clientAnswering(409, { error: "INVESTIGATION_CLOSED", message: "INVESTIGATION_CLOSED" }))).toEqual({ kind: "CLOSED" });
  });
});
