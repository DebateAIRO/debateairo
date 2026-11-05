import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAskForReport, carryOnOf, digsRestFor, loadRunPublished, mayBeWaitedFor, newWritingClock, noteWritingRead, PRESS_MATCH_MS,
  reportMomentAllowed, reportSeenFor, reportSharePercentOf, reportStageOf, reportWaitLineOf, slowFromOf, waitingDigQuestionOf,
  writingStartOf, type WaitedDig
} from "../../apps/ui/lib/v4/reportWriting.js";
import { InvestigationReportsSchema, type Answer, type InvestigationReports, type InvestigationReportVersion } from "../../packages/contract/src/index.js";

/*
 * V4 screen review (owner picks 3 Nov 2026), report-d1 A / report-d2 A / report-f15: what the map knows of the report from
 * the investigation read alone, when it says writing started (the report page's rule, Phase A review F1), and the three
 * things it reads that the server does not send yet or sends elsewhere (the report's share of today, the start step's
 * "carry on to the report" box, whether the question is public). Made-up ids and times only.
 */

const ROOT = "55555555-5555-4555-8555-555555555555";
const CLOSED_AT = "2026-11-04T10:00:00.000Z";
const closedMs = Date.parse(CLOSED_AT);

function read(state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 1): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY" || version.state === "READY_WITH_RESERVATION").at(-1)?.report_version ?? null;
  return InvestigationReportsSchema.parse({
    investigation_id: versions.length === 0 && state === "OPEN" && digs === 0 ? null : "1a1a1a1a-5555-4555-8555-555555555555",
    root_run_id: ROOT, state, digs, versions, current
  });
}
const writing = (version: number, waiting: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: CLOSED_AT, state: "WRITING", waiting_for_digs: waiting });
const failed = (version: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: CLOSED_AT, state: "FAILED", written_at: "2026-11-04T10:20:00.000Z" });
const ready = (version: number): InvestigationReportVersion => ({
  report_version: version, closed_at: CLOSED_AT, state: "READY", written_at: "2026-11-04T10:08:00.000Z",
  answer: { segments: ["A made-up answer."] }, story: null, sources: [], shortened: false
} as InvestigationReportVersion);

describe("where the report stands on the map (report-d1, report-d2)", () => {
  it("reads every stage from the versions, and a dig that reopened the investigation asks again", () => {
    expect(reportStageOf(null)).toEqual({ kind: "UNKNOWN" });
    expect(reportStageOf(read("OPEN", [], 0))).toEqual({ kind: "NONE" });
    expect(reportStageOf(read("CLOSED", [writing(1, 2)]))).toEqual({ kind: "WAITING_DIGS", version: 1, waitingForDigs: 2 });
    expect(reportStageOf(read("CLOSED", [writing(1, 0)]))).toEqual({ kind: "WRITING", version: 1 });
    expect(reportStageOf(read("CLOSED", [failed(1)]))).toEqual({ kind: "FAILED", version: 1 });
    expect(reportStageOf(read("CLOSED", [ready(1)]))).toEqual({ kind: "DONE", version: 1 });
    // A dig after the report reopens the investigation: the next version is simply asked for.
    expect(reportStageOf(read("OPEN", [ready(1)]))).toEqual({ kind: "NONE" });
    expect(reportStageOf(read("OPEN", [ready(1), failed(2)]))).toEqual({ kind: "NONE" });
  });

  it("the strip opens only while a report can be asked for; digs rest and the good-time note goes while it waits or is written", () => {
    const stages = [null, read("OPEN", [], 0), read("CLOSED", [writing(1, 1)]), read("CLOSED", [writing(1, 0)]), read("CLOSED", [failed(1)]),
      read("CLOSED", [ready(1)])].map(reportStageOf);
    expect(stages.map(canAskForReport)).toEqual([false, true, false, false, true, false]);
    expect(stages.map(digsRestFor)).toEqual([false, false, true, true, false, false]);
    expect(stages.map(reportMomentAllowed)).toEqual([true, true, false, false, true, false]);
  });
});

describe("the owner's answers of 5 Nov 2026 (questions 2 A and 23 A)", () => {
  const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;

  it("question 2 A: \"See my report\" while the report waits for a dig, is written, or stands; never while one can be asked for", () => {
    const stages = [null, read("OPEN", [], 0), read("CLOSED", [writing(1, 1)]), read("CLOSED", [writing(1, 0)]), read("CLOSED", [failed(1)]),
      read("CLOSED", [ready(1)]), read("OPEN", [ready(1)])].map(reportStageOf);
    expect(stages.map(reportSeenFor)).toEqual([false, false, true, true, false, true, false]);
    // Every stage either asks (Write my report / Write it again), leads to the report (See my report), or is not known.
    for (const stage of stages) expect([canAskForReport(stage), reportSeenFor(stage)].filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("question 23 A: report-f7's rule names the one READ dig the report may wait for; a dig not read is never counted", () => {
    const dig = (question: string, view: WaitedDig["view"]): WaitedDig => ({ link: { questions: [question] }, view });
    expect(mayBeWaitedFor({ state: "RUNNING" })).toBe(true);
    expect(mayBeWaitedFor({ state: "WAITING" })).toBe(true);
    expect(mayBeWaitedFor({ state: "DONE", rewrite: { state: "WRITING" } as never })).toBe(true);
    expect(mayBeWaitedFor({ state: "DONE", rewrite: null })).toBe(false);
    expect(mayBeWaitedFor({ state: "FAILED" })).toBe(false);
    expect(waitingDigQuestionOf([dig("Mostly renewables", { state: "RUNNING" }), dig("Old", { state: "DONE", rewrite: null })]))
      .toBe("Mostly renewables");
    // Two that may be waited for: no name. Not read (a stand-in, or a read that failed just now): not counted either way.
    expect(waitingDigQuestionOf([dig("A", { state: "RUNNING" }), dig("B", { state: "WAITING" })])).toBeNull();
    expect(waitingDigQuestionOf([dig("A", { state: "RUNNING" }), dig("B", undefined), dig("C", null)])).toBe("A");
    expect(waitingDigQuestionOf([dig("B", undefined)])).toBeNull();
    expect(waitingDigQuestionOf([])).toBeNull();
  });

  it("question 23 A: one wait line for the map and the report page: the dig by name, else no number at all", () => {
    expect(reportWaitLineOf(1, "Mostly renewables", CATALOG, "en")).toEqual({
      kind: "NAMED", before: "Your report starts when your dig on “", dig: "Mostly renewables", after: "” finishes."
    });
    expect(reportWaitLineOf(1, null, CATALOG, "en")).toEqual({ kind: "PLAIN", text: "Your report starts when the dig in progress finishes." });
    expect(reportWaitLineOf(1, "  ", CATALOG, "en")).toEqual({ kind: "PLAIN", text: "Your report starts when the dig in progress finishes." });
    // Several: the follow-up's words, with no number (a count that can only go down steers nothing).
    for (const waiting of [2, 3, 7]) {
      const line = reportWaitLineOf(waiting, "Mostly renewables", CATALOG, "en");
      expect(line).toEqual({ kind: "PLAIN", text: "Your report starts when the digs in progress finish." });
    }
    expect(CATALOG["v4.investigation.waitingDigs.other"]).not.toMatch(/\{n\}|\d/u);
  });
});

describe("when writing started is said only when this visit knows it (the report page's rule)", () => {
  it("no digs: it started when the version closed", () => {
    const clock = newWritingClock();
    const now = read("CLOSED", [writing(1, 0)], 0);
    noteWritingRead(clock, now, closedMs + 60_000);
    expect(writingStartOf(clock, reportStageOf(now))).toBe(closedMs);
  });

  it("this page's own press began it (closed within the match of the press); an old press says no time", () => {
    const pressed = newWritingClock();
    pressed.pressedAt = closedMs + 2_000;
    const now = read("CLOSED", [writing(1, 0)]);
    noteWritingRead(pressed, now, closedMs + 10_000);
    expect(writingStartOf(pressed, reportStageOf(now))).toBe(closedMs);

    const old = newWritingClock();
    old.pressedAt = closedMs - PRESS_MATCH_MS - 1;
    noteWritingRead(old, now, closedMs + 10_000);
    expect(writingStartOf(old, reportStageOf(now))).toBeNull();
    // The 15 minutes of "taking longer" then count from this visit's first sight, never from the press.
    expect(slowFromOf(old, reportStageOf(now))).toBe(closedMs + 10_000);
  });

  it("seen waiting for digs, then not: it started when this visit saw it stop waiting", () => {
    const clock = newWritingClock();
    noteWritingRead(clock, read("CLOSED", [writing(1, 1)]), closedMs + 1_000);
    const waiting = reportStageOf(read("CLOSED", [writing(1, 1)]));
    expect(writingStartOf(clock, waiting)).toBeNull();
    expect(slowFromOf(clock, waiting)).toBeNull();
    const now = read("CLOSED", [writing(1, 0)]);
    noteWritingRead(clock, now, closedMs + 20 * 60_000);
    expect(writingStartOf(clock, reportStageOf(now))).toBe(closedMs + 20 * 60_000);
  });

  it("a visit that opens on a version already being written, with digs and no press of its own, says no time", () => {
    const clock = newWritingClock();
    const now = read("CLOSED", [ready(1), writing(2, 0)]);
    noteWritingRead(clock, now, closedMs + 40 * 60_000);
    expect(writingStartOf(clock, reportStageOf(now))).toBeNull();
    expect(slowFromOf(clock, reportStageOf(now))).toBe(closedMs + 40 * 60_000);
  });
});

describe("what the page reads that the server does not send yet, or sends elsewhere", () => {
  it("report-d1: the report's share of today only when the read says a whole percent above 0, never guessed", () => {
    const base = read("OPEN", [], 0);
    expect(reportSharePercentOf(null)).toBeNull();
    expect(reportSharePercentOf(base)).toBeNull();
    expect(reportSharePercentOf({ ...base, report_share_percent: 5 } as InvestigationReports)).toBe(5);
    for (const share of [0, -5, 12.5, "5", 101]) {
      expect(reportSharePercentOf({ ...base, report_share_percent: share } as unknown as InvestigationReports), String(share)).toBeNull();
    }
  });

  it("report-d1: the start step's \"carry on to the report\" box, from the answer's branches once the server sends them", () => {
    expect(carryOnOf(null)).toBe(false);
    expect(carryOnOf({} as Answer)).toBe(false);
    expect(carryOnOf({ branches: { carry_on_to_report: false } } as unknown as Answer)).toBe(false);
    expect(carryOnOf({ branches: { carry_on_to_report: "yes" } } as unknown as Answer)).toBe(false);
    expect(carryOnOf({ branches: { carry_on_to_report: true } } as unknown as Answer)).toBe(true);
  });

  it("report-f15: the question is public when its visibility read says PUBLISHED; a failed read is not known", async () => {
    const answering = (state: "PRIVATE" | "PUBLISHED") => ({ readRunVisibility: async () => ({ state, public_ref: null }) });
    expect(await loadRunPublished(ROOT, answering("PUBLISHED"))).toBe(true);
    expect(await loadRunPublished(ROOT, answering("PRIVATE"))).toBe(false);
    expect(await loadRunPublished(ROOT, { readRunVisibility: async () => { throw new Error("offline"); } })).toBeNull();
    expect(await loadRunPublished(ROOT, { readRunVisibility: () => { throw new Error("thrown at once"); } })).toBeNull();
  });
});
