// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { InvestigationReportsSchema, type InvestigationReports, type InvestigationReportVersion, type RunProjection } from "../../packages/contract/src/index.js";
import type { ReopenResult, WriteReportResult } from "../../apps/ui/lib/v4/load.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { CATALOG, harness, mountMap, page, resetHarness, seededAnswer, seededStory, settle, unmountMap } from "./v4-debate-harness.js";

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  write: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  reopen: (async () => ({ kind: "FAILED" })) as (runId: string) => Promise<unknown>,
  /** report-f14: the question's language the page's read carries (undefined: none). */
  language: undefined as string | undefined,
  /** report-f10: a read of the debate that fails, in place of the harness's. */
  fail: null as Error | null,
  /** Review F5: debates whose own answer is not served yet (still running, or failed), whatever the harness serves. */
  notServed: new Map<string, "RUNNING" | "FAILED">(),
  /** Review F6: each dig's read, in place of the harness's (null: the harness's). */
  digView: null as ((link: DigLink) => Promise<DigView>) | null,
  /** Every id the page read the debate by. */
  reads: [] as string[]
}));
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => {
  const base = (await import("./v4-debate-harness.js")).loadMock(await original());
  return {
    ...base,
    loadV4: async (id: string) => {
      reports.reads.push(id);
      if (reports.fail !== null) throw reports.fail;
      const notServed = reports.notServed.get(id);
      if (notServed !== undefined) {
        return { kind: "RUN", runId: id, run: { run_ref: id, question_line: "Q?", state: notServed,
          terminal_reason: notServed === "FAILED" ? "RUNNER_FAILED" : null, hold_until: null } as RunProjection };
      }
      const served = await base.loadV4(id);
      return reports.language === undefined || served.kind !== "SERVED" ? served : { ...served, language: reports.language };
    },
    loadInvestigation: (runId: string) => reports.load(runId),
    loadDigView: (link: DigLink) => reports.digView === null ? base.loadDigView(link) : reports.digView(link),
    writeReport: (runId: string) => reports.write(runId),
    reopenInvestigation: (runId: string) => reports.reopen(runId)
  };
});
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * R22 W5-1 — THE FINAL REPORT OVER AN INVESTIGATION, on the report page and at the top of the map (owner Q-D11), with the
 * owner's screen review of 3 Nov (OWNER-PICKS-2026-11-03.md, "report"; Round 2 answered A on every question):
 *  - f3: once a report exists the page is the report, the first debate's answer behind a closed row; before any, the card
 *    "Your report isn't written yet" and the first answer under its own heading; each version its own answer and paths;
 *  - f1: the full answer under the short answer; r2-20: each path ONE trust word, never "Held up" / "Partly held" / "Set aside"
 *    / "Fell"; f18: no counts on the bars, unchecked points in grey;
 *  - f2, f6, f7, f8: what the page says when a read or a press fails, while digs run, while it is written and when it is slow;
 *  - f9, f10: a dig's report address moves to the first question's; a report that cannot be found says so;
 *  - f5, f11, f12: one header row with Share (the PDF made inside the page, Print, Copy link), no V3 PDF, no quota share;
 *  - f13, r2-13, f14, f16, f17, f19: paper, Free's paper line, AI text's language, loading and focus, digging on, how sure.
 * Made-up texts only.
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const DIG = "22222222-2222-4222-8222-222222222222";
const date = (iso: string, style: "medium" | "long" = "medium") => new Intl.DateTimeFormat("en", { dateStyle: style }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(new Date(iso));
const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-report.css"), "utf8");

const STORY = {
  short_answer: "A made-up short answer over the whole investigation.",
  what_would_change: "A made-up line on what would change it.",
  how_it_went: [{ dig_run_id: DIG, paragraph: "The made-up dig found the costs were lower than first said." }],
  still_open: ["A made-up open question."]
};
const SOURCE = { site: "grid-costs.example", title: "A made-up report", quote: "A made-up quote from the page.", line: "Reader one says why it matters.",
  link: "https://grid-costs.example/costs" };
/** A version's paths as stored: the current one keeps the points, an earlier one only line, summary, fate and level. */
const PATHS = [
  { line: "A made-up first path.", summary: "Its made-up summary.", fate: "PARTLY_HELD", level: 0,
    points: [{ text: "A sure point.", trust: "SURE", side: "for", sources: [0] }, { text: "An argued point.", trust: "STILL_ARGUED", side: "against", sources: [] }] },
  { line: "A made-up dug path.", summary: null, fate: "HELD_UP", level: 1,
    points: [{ text: "A case point.", trust: "SURE_FOR_CASE", side: "for", sources: [] }, { text: "Not checked.", trust: null, side: null, sources: [] }] },
  { line: "A made-up fallen path.", summary: null, fate: "FELL", level: 0, points: [{ text: "A sure point.", trust: "SURE", side: "for", sources: [] }] }
];
const LIGHT_PATHS = PATHS.map(({ line, summary, fate, level }) => ({ line, summary, fate, level }));

function finished(version: number, written: string, extra: Partial<Record<string, unknown>> = {}): InvestigationReportVersion {
  return { report_version: version, closed_at: "2026-10-30T09:00:00.000Z", state: "READY", written_at: written,
    answer: { segments: [`The made-up answer of version ${version}.`, "What evidence would decide it."] }, story: STORY, sources: [SOURCE],
    shortened: false, ...extra } as InvestigationReportVersion;
}
const WRITING_AT = "2026-10-31T09:00:00.000Z";
const writing = (version: number, waiting: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: WRITING_AT, state: "WRITING", waiting_for_digs: waiting });
const failed = (version: number): InvestigationReportVersion =>
  ({ report_version: version, closed_at: "2026-10-31T09:00:00.000Z", state: "FAILED", written_at: "2026-10-31T09:20:00.000Z" });

/** `digs`: how many digs the investigation holds (review F1: with none, writing starts when the version closes). */
function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 1): InvestigationReports {
  const current = versions.filter((version) => version.state === "READY" || version.state === "READY_WITH_RESERVATION").at(-1)?.report_version ?? null;
  return InvestigationReportsSchema.parse({ investigation_id: "55555555-5555-4555-8555-555555555555", root_run_id: runId, state, digs, versions, current });
}
const noInvestigation = (runId: string): InvestigationReports =>
  InvestigationReportsSchema.parse({ investigation_id: null, root_run_id: runId, state: "OPEN", digs: 0, versions: [], current: null });

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function mountReport(runId: string, level: "plain" | "background" | "expert" = "background"): Promise<HTMLDivElement> {
  const { V4ReportClient } = await import("../../apps/ui/components/v4/V4ReportClient.js");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<V4ReportClient id={runId} locale="en" initialLevel={level} catalog={CATALOG} newDebateCatalog={{}} />));
  await settle();
  return host;
}
async function press(button: HTMLElement): Promise<void> {
  await act(async () => button.click());
  await settle();
}
const buttonOf = (node: ParentNode, name: string) =>
  [...node.querySelectorAll("button")].find((button) => button.textContent?.trim() === name) ?? null;
const versionSection = (node: ParentNode) => node.querySelector<HTMLElement>(".v4RepInvestigation");
const text = (node: ParentNode | null) => (node?.textContent ?? "").replace(/\s+/gu, " ");
/** Opens the header's Share menu; its choices by their ids. */
async function shareMenu(node: ParentNode): Promise<Record<string, HTMLButtonElement>> {
  const button = node.querySelector<HTMLButtonElement>(`.v4RepShare button[aria-label="${CATALOG["v4.report.shareButton"]}"]`)!;
  if (button.getAttribute("aria-expanded") !== "true") await press(button);
  return Object.fromEntries([...node.querySelectorAll<HTMLButtonElement>(".v4RepShare .v4RepMenuItem")].map((item) => [item.dataset.share!, item]));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.language = undefined;
  reports.fail = null;
  reports.reads = [];
  reports.notServed = new Map();
  reports.digView = null;
  reports.load = async () => null;
  reports.write = async () => ({ kind: "FAILED" });
  reports.reopen = async () => ({ kind: "FAILED" });
  window.history.replaceState(null, "", "/");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  await unmountMap().catch(() => undefined);
  vi.useRealTimers();
});

describe("the report page's versions", () => {
  it("lists two versions newest first, marks the current one, and shows it with the F13 and N14 lines when it says so", async () => {
    const runId = crypto.randomUUID();
    const read = investigation(runId, "CLOSED", [
      finished(1, "2026-10-29T10:00:00.000Z"),
      finished(2, "2026-10-31T10:00:00.000Z", { story: null, shortened: true })
    ]);
    reports.load = vi.fn(async () => read);
    const node = versionSection(await mountReport(runId))!;
    expect(node.querySelector("h2")!.textContent).toBe("Report versions");
    expect([...node.querySelectorAll(".v4RepVersion")].map((button) => button.textContent)).toEqual([
      word("v4.investigation.versionCurrent", { n: 2, date: date("2026-10-31T10:00:00.000Z") }),
      word("v4.investigation.version", { n: 1, date: date("2026-10-29T10:00:00.000Z") })
    ]);
    expect(node.querySelector(".v4RepVersion")!.textContent).toBe(`Version 2 · ${date("2026-10-31T10:00:00.000Z")} (current)`);
    expect(node.querySelector(".v4RepVersion")!.getAttribute("aria-pressed")).toBe("true");
    // Version 2: shortened, and no story (the approved lines, word for word); its answer stands in.
    expect(node.textContent).toContain("The investigation was very large, so the report was written from a shortened version of it.");
    expect(node.textContent).toContain("We couldn't write a short answer this time. The parts below show everything the AIs found.");
    expect(node.textContent).toContain("The made-up answer of version 2.");
    expect(node.textContent).not.toContain("How the investigation went");
    // A finished version stands: "Keep digging" is offered, not "Write my report".
    expect(buttonOf(node, "Keep digging")).not.toBeNull();
    expect(buttonOf(node, "Write my report")).toBeNull();
  });

  it("f1: a written report shows its whole answer under its short answer, as the PDF does", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const body = versionSection(await mountReport(runId))!.querySelector(".v4RepVersionBody")!;
    const answer = body.querySelector(".v4RepAnswer")!;
    expect(answer.querySelector(".v4RepHeadline")!.textContent).toBe(STORY.short_answer);
    expect([...answer.querySelectorAll(".v4RepAnswerText p")].map((part) => part.textContent))
      .toEqual(["The made-up answer of version 1.", "What evidence would decide it."]);
  });

  it("shows an earlier version under the approved section headings, with its sources", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"),
      finished(2, "2026-10-31T10:00:00.000Z", { story: null, shortened: true })]));
    const node = versionSection(await mountReport(runId))!;
    await press(node.querySelectorAll<HTMLButtonElement>(".v4RepVersion")[1]!);
    expect(node.querySelectorAll(".v4RepVersion")[1]!.getAttribute("aria-pressed")).toBe("true");
    const body = node.querySelector(".v4RepVersionBody")!;
    expect([...body.querySelectorAll("h3")].map((heading) => heading.textContent))
      .toEqual(["The answer", "What would change it", "How the investigation went", "What is still open", "Sources"]);
    expect(body.textContent).toContain(STORY.short_answer);
    expect(body.textContent).toContain(STORY.how_it_went[0]!.paragraph);
    expect(body.textContent).not.toContain("shortened version");
    expect(body.textContent).not.toContain("We couldn't write a short answer");
    const source = body.querySelector(".v4RepSource")!;
    expect(source.querySelector(".v4RepSourceSite")!.textContent).toBe(`${SOURCE.site} ${CATALOG["v4.common.newTab"]}`);
    expect(source.querySelector(".v4RepSourceTitle")!.textContent).toBe(SOURCE.title);
    expect(source.querySelector(".v4RepSourceLine")!.textContent).toBe(SOURCE.line);
    expect(source.querySelector("blockquote")!.textContent).toBe(SOURCE.quote);
    // report-f13: "Version 1 · written <its own date>", printed above its body.
    expect(node.querySelector(".v4RepVersionLine")!.textContent).toBe(`Version 1 · written ${date("2026-10-29T10:00:00.000Z", "long")}`);
  });

  it("f3 + r2-20: each version shows its OWN paths, each with one trust word and no outcome tag; a pre-R22 earlier version says it keeps only its answer", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [
      finished(1, "2026-10-28T10:00:00.000Z"),
      finished(2, "2026-10-29T10:00:00.000Z", { paths: LIGHT_PATHS }),
      finished(3, "2026-10-31T10:00:00.000Z", { paths: PATHS })
    ]));
    const node = versionSection(await mountReport(runId))!;
    const rows = () => [...node.querySelectorAll<HTMLElement>(".v4RepVersionBody .v4RepPath")];
    // The current version keeps its points: one trust word each by the evidence rule, and a bar without counts.
    expect(rows().map((row) => row.querySelector(".v4RepPathWord")?.textContent ?? null)).toEqual(["Still argued", "Sure, for the case named", "Didn't hold"]);
    expect(rows().map((row) => row.dataset.level)).toEqual(["0", "1", "0"]);
    expect(rows()[0]!.querySelector(".v4RepPathLine")!.textContent).toBe(PATHS[0]!.line);
    expect(rows()[0]!.querySelectorAll(".v4Bar")).toHaveLength(1);
    expect(node.querySelector(".v4BarCounts")).toBeNull();
    for (const tag of ["Held up", "Partly held", "Set aside", "Fell"]) expect(text(node), tag).not.toContain(tag);
    // Version 2 kept only line, summary, fate and level: its own paths, a fallen one marked, no bars.
    await press(buttonOf(node, word("v4.investigation.version", { n: 2, date: date("2026-10-29T10:00:00.000Z") }))!);
    expect(rows().map((row) => row.querySelector(".v4RepPathWord")?.textContent ?? null)).toEqual([null, null, "Didn't hold"]);
    expect(node.querySelector(".v4RepVersionBody .v4Bar")).toBeNull();
    // Version 1 was written before R22.
    await press(buttonOf(node, word("v4.investigation.version", { n: 1, date: date("2026-10-28T10:00:00.000Z") }))!);
    expect(rows()).toHaveLength(0);
    expect(node.textContent).toContain(word("v4.investigation.onlyAnswer"));
  });

  it("f3: once a report exists the page is the report; the first debate's answer waits behind a closed row at the bottom", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const node = await mountReport(runId);
    const first = node.querySelector<HTMLDetailsElement>("details.v4RepFirst")!;
    expect(first.open).toBe(false);
    expect(first.querySelector("summary")!.textContent).toBe(word("v4.investigation.firstAnswer"));
    expect(first.textContent).toContain("Our answer: put most new money into renewables and storage");
    expect(node.querySelector(".v4RepDoc")!.lastElementChild).toBe(first);
    // Nothing of the first answer sits outside the row, and the report is not headed like it.
    expect(text(node.querySelector(".v4RepDoc")).split("Our answer: put most new money").length).toBe(2);
    expect(node.textContent).not.toContain(word("v4.report.firstAnswerNotReport"));
  });

  it("f3: before any report, the card says it isn't written yet, with Write my report, and the first answer under its own heading", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId);
    expect(versionSection(node)).toBeNull();
    const card = node.querySelector(".v4RepCard")!;
    expect(card.textContent).toContain(word("v4.report.notWrittenYet"));
    expect(buttonOf(card, "Write my report")).not.toBeNull();
    const open = node.querySelector(".v4RepFirstOpen")!;
    expect(open.querySelector("h2")!.textContent).toBe(word("v4.report.firstAnswerNotReport"));
    expect(open.textContent).toContain(CATALOG["v4.report.answerHeading"]);
    expect(node.querySelector("details.v4RepFirst")).toBeNull();
  });

  it("f7: while the newest is being written: 'Version 2 · being written', when it started (no minutes), read again until it is written", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:04:00.000Z"));
    const runId = crypto.randomUUID();
    // No digs to wait for: writing started when the version closed.
    const before = investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"), writing(2, 0)], 0);
    const after = investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"), finished(2, "2026-10-31T10:05:00.000Z")], 0);
    const load = vi.fn(async () => before);
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    expect(node.querySelector(".v4RepVersion")!.textContent).toBe("Version 2 · being written");
    expect(node.querySelectorAll(".v4RepVersion")[1]!.textContent).toContain("(current)");
    expect(text(node)).toContain(`Your report is being written. Started ${clock(WRITING_AT)}.`);
    expect(text(node)).not.toMatch(/minutes|usually/u);
    // Version 1 stays readable beside it.
    expect(node.textContent).toContain(STORY.short_answer);
    expect(buttonOf(node, "Write my report")).toBeNull();
    expect(buttonOf(node, "Keep digging")).toBeNull();
    const reads = load.mock.calls.length;
    load.mockImplementation(async () => after);
    await settle(10_000);
    expect(load.mock.calls.length).toBe(reads + 1);
    expect(node.textContent).not.toContain("Your report is being written.");
    expect(node.querySelector(".v4RepVersion")!.textContent).toContain("(current)");
  });

  it("f7: while a dig runs, ONLY the line that names it; with several, the line that says how many", async () => {
    const runId = crypto.randomUUID();
    const child = crypto.randomUUID();
    harness.records = { parent: null, children: [{ parent_run_id: runId, child_run_id: child, places: ["path:n-mix"], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }] };
    harness.digView = (link) => ({ link, state: "RUNNING", headline: null, counts: null });
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 1)]));
    const node = versionSection(await mountReport(runId))!;
    const mixLine = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() }).paths.find((path) => path.id === "n-mix")!.line;
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe(`Your report starts when your dig on “${mixLine}” finishes.`);
    expect(node.textContent).not.toContain("Your report is being written");
    expect(node.querySelector(".v4RepVersion")!.textContent).toBe("Version 1 · being written");

    await act(async () => root?.unmount());
    host?.remove();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 2)]));
    const several = versionSection(await mountReport(runId))!;
    expect(text(several.querySelector(".v4RepStatusBox"))).toBe("Your report starts when the 2 digs in progress finish.");
  });

  it("f8: after 15 minutes it says it is taking longer and keeps checking; Check again, the tab coming back and the network returning read at once", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:16:00.000Z"));
    const runId = crypto.randomUUID();
    // No digs to wait for, so writing started when the version closed, 16 minutes ago.
    const load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 0)], 0));
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    expect(text(node.querySelector(".v4RepStatusBox"))).toContain(word("v4.investigation.slow"));
    expect(node.textContent).not.toContain("Your report is being written");
    const reads = load.mock.calls.length;
    await press(buttonOf(node, "Check again")!);
    expect(load.mock.calls.length).toBe(reads + 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(load.mock.calls.length).toBe(reads + 2);
    await act(async () => window.dispatchEvent(new Event("online")));
    await settle();
    expect(load.mock.calls.length).toBe(reads + 3);
    // It never stops checking: hours later it still reads again.
    await settle(3 * 60 * 60_000);
    expect(load.mock.calls.length).toBeGreaterThan(reads + 3);
    // The server says the report failed: the failure, with "Write it again".
    load.mockImplementation(async () => investigation(runId, "CLOSED", [failed(1)], 0));
    await press(buttonOf(node, "Check again")!);
    expect(node.textContent).toContain(word("v4.investigation.failed"));
    expect(buttonOf(node, "Write it again")).not.toBeNull();
  });

  it("review F1: a version that waited for a dig, opened later, says it is being written with no time, and 'taking longer' only 15 minutes into this visit", async () => {
    // The button was pressed at 08:20; a dig ran until about 09:10; this visit begins at 09:16, after the dig finished.
    vi.setSystemTime(new Date("2026-10-31T09:16:00.000Z"));
    const runId = crypto.randomUUID();
    const pressedEarly = { ...writing(1, 0), closed_at: "2026-10-31T08:20:00.000Z" } as InvestigationReportVersion;
    const load = vi.fn(async () => investigation(runId, "CLOSED", [pressedEarly]));
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    const status = () => text(node.querySelector(".v4RepStatusBox"));
    expect(status()).toBe(word("v4.investigation.writing"));
    expect(status()).not.toContain("Started");
    expect(status()).not.toContain(word("v4.investigation.slow"));
    await settle(14 * 60_000);
    expect(status()).toBe(word("v4.investigation.writing"));
    await settle(60_000);
    expect(status()).toContain(word("v4.investigation.slow"));
  });

  it("review F1: a version this visit saw waiting for a dig started when the dig finished, not when the button was pressed", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:30:00.000Z"));
    const runId = crypto.randomUUID();
    const waitingEarly = (left: number) => ({ ...writing(1, left), closed_at: "2026-10-31T08:20:00.000Z" }) as InvestigationReportVersion;
    const load = vi.fn(async () => investigation(runId, "CLOSED", [waitingEarly(1)]));
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe("Your report starts when the dig in progress finishes.");
    // The dig finishes; the next check (10 s later) sees no dig left to wait for.
    load.mockImplementation(async () => investigation(runId, "CLOSED", [waitingEarly(0)]));
    await settle(10_000);
    const seen = new Date(Date.now()).toISOString();
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe(word("v4.investigation.writingSince", { time: clock(seen) }));
    expect(text(node.querySelector(".v4RepStatusBox"))).not.toContain(clock("2026-10-31T08:20:00.000Z"));
  });

  it("review F1: this page's own press, with digs in the investigation: started when the version closed", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:01:00.000Z"));
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => noInvestigation(runId));
    reports.load = load;
    reports.write = vi.fn(async (): Promise<WriteReportResult> => ({ kind: "WRITING", reportVersion: 1, waitingForDigs: 0 }));
    const node = await mountReport(runId);
    load.mockImplementation(async () => investigation(runId, "CLOSED", [writing(1, 0)]));
    await press(buttonOf(node, "Write my report")!);
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe(word("v4.investigation.writingSince", { time: clock(WRITING_AT) }));
  });

  it("a FAILED version says so and offers \"Write it again\", which posts and reads the versions again", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:02:00.000Z"));
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => investigation(runId, "CLOSED", [failed(1)]));
    const write = vi.fn(async (): Promise<WriteReportResult> => ({ kind: "WRITING", reportVersion: 2, waitingForDigs: 0 }));
    reports.load = load;
    reports.write = write;
    const node = versionSection(await mountReport(runId))!;
    expect(node.textContent).toContain("This report could not be written. You can write it again.");
    load.mockImplementation(async () => investigation(runId, "CLOSED", [failed(1), writing(2, 0)]));
    await press(buttonOf(node, "Write it again")!);
    expect(write).toHaveBeenCalledWith(runId);
    expect(text(node)).toContain(`Your report is being written. Started ${clock(WRITING_AT)}.`);
    expect(node.textContent).not.toContain("Your report starts when");
    // report-f16: focus moved to the status line.
    expect(document.activeElement).toBe(node.querySelector(".v4RepStatusBox"));
  });

  it("browser check: a newer version that failed offers \"Write it again\" with its line, above the earlier version shown", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:30:00.000Z"));
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-30T09:20:00.000Z"), failed(2)]));
    const node = versionSection(await mountReport(runId))!;
    const status = node.querySelector(".v4RepStatusBox")!;
    expect(status.textContent).toContain(word("v4.investigation.failed"));
    const again = buttonOf(node, "Write it again");
    expect(again).not.toBeNull();
    expect(status.contains(again)).toBe(true);
    // Only once, and before the earlier version's body.
    expect([...node.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Write it again")).toHaveLength(1);
    const body = node.querySelector(".v4RepVersionBody")!;
    expect(again!.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("f6: a press whose answer is lost says it could not confirm, reads again, and shows the waiting state if it did start", async () => {
    vi.setSystemTime(new Date("2026-10-31T09:02:00.000Z"));
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => noInvestigation(runId));
    reports.load = load;
    reports.write = vi.fn(async (): Promise<WriteReportResult> => ({ kind: "FAILED" }));
    const node = await mountReport(runId);
    // The server had started it after all.
    load.mockImplementation(async () => investigation(runId, "CLOSED", [writing(1, 0)]));
    await press(buttonOf(node, "Write my report")!);
    expect(node.textContent).not.toContain(word("v4.investigation.startUnconfirmed"));
    expect(text(node)).toContain(`Your report is being written. Started ${clock(WRITING_AT)}.`);
  });

  it("f6: when nothing started, the could-not-confirm line stays with Try again, and never says nothing was used", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const write = vi.fn(async (): Promise<WriteReportResult> => ({ kind: "FAILED" }));
    reports.write = write;
    const node = await mountReport(runId);
    await press(buttonOf(node, "Write my report")!);
    const card = node.querySelector(".v4RepCard")!;
    expect(card.textContent).toContain(word("v4.investigation.startUnconfirmed"));
    expect(card.textContent).not.toMatch(/Nothing was used/u);
    expect(document.activeElement).toBe(card);
    await press(buttonOf(card, "Try again")!);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("\"Keep digging\" reopens the investigation; then \"Write my report\" is offered again", async () => {
    const runId = crypto.randomUUID();
    const load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const reopen = vi.fn(async (): Promise<ReopenResult> => ({ kind: "OPEN" }));
    reports.load = load;
    reports.reopen = reopen;
    const node = versionSection(await mountReport(runId))!;
    // report-f17: how digging goes on, with the way back to the map.
    const more = node.querySelector(".v4RepDigMore")!;
    expect(more.textContent).toContain("You can dig more from the map. This report stays as it is, and your next one becomes version 2.");
    expect(more.querySelector("a")!.getAttribute("href")).toMatch(new RegExp(`^/v4/debate/${runId}(?:\\?|$)`, "u"));
    load.mockImplementation(async () => investigation(runId, "OPEN", [finished(1, "2026-10-29T10:00:00.000Z")]));
    await press(buttonOf(node, "Keep digging")!);
    expect(reopen).toHaveBeenCalledWith(runId);
    expect(buttonOf(node, "Write my report")).not.toBeNull();
    expect(buttonOf(node, "Keep digging")).toBeNull();
  });

  it("f6: Keep digging whose answer is lost says it could not confirm digging is open", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    reports.reopen = vi.fn(async (): Promise<ReopenResult> => ({ kind: "FAILED" }));
    const node = versionSection(await mountReport(runId))!;
    await press(buttonOf(node, "Keep digging")!);
    expect(node.textContent).toContain(word("v4.investigation.reopenUnconfirmed"));
    expect(buttonOf(node, "Try again")).not.toBeNull();
  });

  it("f2: a read that fails says so in the report's place, with Try again, and keeps Write my report", async () => {
    const runId = crypto.randomUUID();
    const load = vi.fn(async (): Promise<InvestigationReports | null> => null);
    reports.load = load;
    const node = await mountReport(runId);
    expect(versionSection(node)).toBeNull();
    const card = node.querySelector(".v4RepCard")!;
    expect(card.textContent).toContain(word("v4.investigation.loadFailed"));
    expect(buttonOf(card, "Write my report")).not.toBeNull();
    // The first answer stays one click away (whether a report exists is not known).
    expect(node.querySelector("details.v4RepFirst")).not.toBeNull();
    load.mockImplementation(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    await press(buttonOf(card, "Try again")!);
    expect(versionSection(node)).not.toBeNull();
    expect(node.querySelector(".v4RepCard")).toBeNull();
  });

  it("f16: while the report part is read, one grey placeholder holds its place", async () => {
    const runId = crypto.randomUUID();
    let answer: (read: InvestigationReports) => void = () => undefined;
    reports.load = vi.fn(() => new Promise<InvestigationReports>((resolveRead) => { answer = resolveRead; }));
    const node = await mountReport(runId);
    expect(node.querySelector(".v4RepLoading")!.textContent).toBe(word("v4.report.loadingReport"));
    expect(node.querySelector(".v4RepDoc h1")).toBeNull();
    await act(async () => answer(noInvestigation(runId)));
    await settle();
    expect(node.querySelector(".v4RepLoading")).toBeNull();
    expect(node.querySelector(".v4RepDoc h1")).not.toBeNull();
  });
});

describe("the report page's address and states", () => {
  it("f9: a report opened with a dig's id moves to the first question's report", async () => {
    const rootRun = crypto.randomUUID();
    const dig = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(rootRun, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const node = await mountReport(dig);
    await settle();
    expect(reports.reads).toEqual([dig, rootRun]);
    expect(window.location.pathname).toBe(`/v4/debate/${rootRun}/report`);
    expect(node.querySelector(".v4RepHdrBack")!.getAttribute("href")).toMatch(new RegExp(`^/v4/debate/${rootRun}(?:\\?|$)`, "u"));
    expect(versionSection(node)).not.toBeNull();
  });

  it("review F5: a dig still running, or one that failed, moves to the first question's report too", async () => {
    for (const state of ["RUNNING", "FAILED"] as const) {
      if (state === "FAILED") {
        await act(async () => root?.unmount());
        host?.remove();
      }
      window.history.replaceState(null, "", "/");
      const rootRun = crypto.randomUUID();
      const dig = crypto.randomUUID();
      reports.reads = [];
      reports.notServed = new Map([[dig, state]]);
      reports.load = vi.fn(async () => investigation(rootRun, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
      const node = await mountReport(dig);
      await settle();
      expect(reports.reads, state).toEqual([dig, rootRun]);
      expect(window.location.pathname, state).toBe(`/v4/debate/${rootRun}/report`);
      expect(node.textContent, state).not.toContain(word("v4.report.notReady"));
      expect(node.textContent, state).not.toContain(word("v4.report.failed"));
      expect(versionSection(node), state).not.toBeNull();
    }
  });

  it("review F5: a first question still running keeps its own line, shown once the check has answered", async () => {
    const runId = crypto.randomUUID();
    reports.notServed = new Map([[runId, "RUNNING"]]);
    let answer: (read: InvestigationReports | null) => void = () => undefined;
    reports.load = vi.fn(() => new Promise<InvestigationReports | null>((resolveRead) => { answer = resolveRead; }));
    const node = await mountReport(runId);
    expect(node.textContent).not.toContain(word("v4.report.notReady"));
    expect(node.querySelector(".v4RepState [role=status]")!.textContent).toBe(CATALOG["v4.common.loading"]);
    await act(async () => answer(noInvestigation(runId)));
    await settle();
    expect(node.textContent).toContain(word("v4.report.notReady"));
    expect(reports.reads).toEqual([runId]);
    expect(window.location.pathname).toBe("/");
  });

  it("f10: a report that does not exist, or is someone else's, says so with Ask a new question", async () => {
    reports.fail = new ContractHttpError("NOT_FOUND", 404, "not found");
    const node = await mountReport(crypto.randomUUID());
    expect(node.textContent).toContain(word("v4.report.notFound"));
    expect(node.textContent).not.toContain(word("v4.report.loadFailed"));
    const ask = [...node.querySelectorAll("a")].find((link) => link.textContent === CATALOG["v4.debate.askNew"])!;
    expect(ask.getAttribute("href")).toMatch(/^\/v4(?:\?|$)/u);
    expect(node.querySelector(".v4RepHdrBack")).toBeNull();
  });

  it("f10: a passing fault still offers Try again", async () => {
    reports.fail = new ContractHttpError("SERVER_FAILURE", 500, "boom");
    const node = await mountReport(crypto.randomUUID());
    expect(node.textContent).toContain(word("v4.report.loadFailed"));
    expect(buttonOf(node, "Try again")).not.toBeNull();
  });

  it("f10: a failed debate offers Ask a new question, with the classic view small under it", async () => {
    const runId = crypto.randomUUID();
    harness.run = { run_ref: runId, question_line: "Q?", state: "FAILED", terminal_reason: "RUNNER_FAILED", hold_until: null } as RunProjection;
    const node = await mountReport(runId);
    const state = node.querySelector(".v4RepState")!;
    expect(state.textContent).toContain(word("v4.report.failed"));
    const links = [...state.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([CATALOG["v4.debate.askNew"], CATALOG["v4.common.classicView"]]);
    expect(links[0]!.className).toContain("v4BtnPrimary");
    expect(links[1]!.getAttribute("href")).toBe(`/debate/${runId}`);
  });
});

describe("the report's own header (f12) and its PDF (f5, f11)", () => {
  const fetches: Array<[string, string | undefined]> = [];
  const answerFetch = (head: number, get: () => Response = () => new Response(null, { status: 200 })) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push([String(url), init?.method]);
      return init?.method === "HEAD" ? new Response(null, { status: head }) : get();
    }));
  afterEach(() => { vi.unstubAllGlobals(); fetches.length = 0; });

  it("is one row: Back to the map, the reading level and Share; no quota share, and the classic view moves to the page foot", async () => {
    answerFetch(200);
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId);
    const row = node.querySelector(".v4RepHdr")!;
    expect([...row.children].map((child) => child.className)).toEqual(["v4RepHdrBack", "v4RepMenu v4RepLevel", "v4RepMenu v4RepShare"]);
    // Browser check (4 Nov): the full words, and the short word a phone shows instead; the name is the full sentence.
    expect(text(row.querySelector(".v4RepHdrBack"))).toBe(`←${CATALOG["v4.report.backToMap"]}${CATALOG["v4.report.backToMapShort"]}`);
    expect(row.querySelector(".v4RepHdrBack")!.getAttribute("aria-label")).toBe(CATALOG["v4.report.backToMap"]);
    expect(row.querySelector(".v4RepHdrBackShort")!.getAttribute("aria-hidden")).toBe("true");
    expect(text(row.querySelector(".v4RepLevel .v4RepMenuButton"))).toBe(`${CATALOG["v4.readingLevel.background"]}▾`);
    expect(node.textContent).not.toMatch(/allowance|quota|% used/u);
    expect(row.querySelector(`a[href="/debate/${runId}"]`)).toBeNull();
    expect(node.querySelector(".v4RepFoot a")!.getAttribute("href")).toBe(`/debate/${runId}`);
    // report-f5: before a report, Share offers Print and Copy link, never the old V3 PDF.
    const items = await shareMenu(node);
    expect(Object.keys(items)).toEqual(["print", "copy"]);
    expect(node.querySelector(`a[href="/debate/${runId}/report"]`)).toBeNull();
    expect(items.copy!.textContent).toBe("Copy link (only you can open it)");
  });

  it("Print prints, and Copy link copies the owner-only address and says so", async () => {
    answerFetch(200);
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const node = await mountReport(runId);
    await press((await shareMenu(node)).print!);
    expect(print).toHaveBeenCalledTimes(1);
    await press((await shareMenu(node)).copy!);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/v4/debate/${runId}/report`);
    expect(node.querySelector(".v4RepHdrStatus")!.textContent).toBe(word("v4.report.linkCopied"));
    await settle(5_000);
    expect(node.querySelector(".v4RepHdrStatus")!.textContent).toBe("");
    print.mockRestore();
  });

  it("f11: once a report stands, Share offers that version's PDF, made inside the page with 'Making your PDF…'", async () => {
    let finish: (response: Response) => void = () => undefined;
    answerFetch(200);
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      fetches.push([String(url), init?.method]);
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200 }));
      return new Promise<Response>((resolveFetch) => { finish = resolveFetch; });
    }));
    const created = vi.fn(() => "blob:made-up");
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z"), finished(2, "2026-10-31T10:00:00.000Z")]));
    const node = await mountReport(runId);
    expect(fetches).toContainEqual([`/v4/debate/${runId}/report/pdf`, "HEAD"]);
    const items = await shareMenu(node);
    expect(Object.keys(items)).toEqual(["pdf", "print", "copy"]);
    expect(items.pdf!.textContent).toBe("Download version 2 (PDF)");
    await press(items.pdf!);
    expect(node.querySelector(".v4RepHdrStatus")!.textContent).toBe(word("v4.report.pdfMaking"));
    await act(async () => finish(new Response("%PDF-", { status: 200, headers: {
      "content-type": "application/pdf", "content-disposition": "attachment; filename=\"report.pdf\"; filename*=UTF-8''raport-%C8%99coli.pdf" } })));
    await settle();
    expect(created).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual(["raport-școli.pdf"]);
    expect(node.querySelector(".v4RepHdrStatus")!.textContent).toBe("");
    // The address stayed on the page.
    expect(window.location.pathname).toBe("/");
    click.mockRestore();
  });

  it("f11: a PDF that cannot be made says so in one sentence, with Try again, and the page stays", async () => {
    answerFetch(200, () => new Response("busy", { status: 429, headers: { "content-type": "text/plain" } }));
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const node = await mountReport(runId);
    await press((await shareMenu(node)).pdf!);
    const status = node.querySelector(".v4RepHdrStatus")!;
    expect(status.textContent).toContain(word("v4.report.pdfFailed"));
    await press(buttonOf(status, "Try again")!);
    expect(fetches.filter(([, method]) => method === undefined)).toHaveLength(2);
  });

  it("f11: says plainly when the PDF cannot be made in this language, and offers none; nothing is offered before the check answers", async () => {
    let head: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolveHead) => { head = resolveHead; })));
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-31T10:00:00.000Z")]));
    const node = await mountReport(runId);
    expect(Object.keys(await shareMenu(node))).toEqual(["print", "copy"]);
    await act(async () => head(new Response(null, { status: 404 })));
    await settle();
    expect(Object.keys(await shareMenu(node))).toEqual(["print", "copy"]);
    expect(node.textContent).toContain(word("v4.investigation.pdfUnavailable"));
  });
});

describe("the report on paper and in other languages", () => {
  it("f13: on paper each source prints its address, and a closed row prints nothing", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/\.v4RepDoc a\.v4RepSourceSite::after \{ content: " " attr\(href\)/u);
    expect(print).toMatch(/\.v4RepFirst:not\(\[open\]\) \{ display: none; \}/u);
    expect(print).toMatch(/\.v4RepNoPrint \{ display: none !important; \}/u);
  });

  it("r2-13: on Free the screen keeps the full line and paper gets 'Not checked on the web.'", async () => {
    const runId = crypto.randomUUID();
    const free = seededAnswer(runId);
    harness.answer = { ...free, web: { ...free.web!, paths: free.web!.paths.map((path) => ({ ...path, search: { status: "NOT_ON_PLAN" }, other_pages: [] })) } } as typeof free;
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z")]));
    const node = await mountReport(runId);
    for (const note of node.querySelectorAll(".v4WebNote")) {
      expect(note.querySelector(".v4RepScreenOnly")!.textContent).toBe(CATALOG["v4.web.free"]);
      expect(note.querySelector(".v4RepPrintOnly")!.textContent).toBe("Not checked on the web.");
    }
    // Shown with the report version too, not only with the first answer.
    expect(versionSection(node)!.querySelector(".v4WebNote")).not.toBeNull();
    expect(css).toMatch(/\.v4RepPrintOnly \{ display: none; \}/u);
    expect(css.slice(css.indexOf("@media print"))).toMatch(/\.v4RepScreenOnly \{ display: none !important; \}/u);
  });

  it("f14: AI text carries the debate's language and follows its own direction; lists of it too", async () => {
    reports.language = "ar";
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [finished(1, "2026-10-29T10:00:00.000Z", { paths: PATHS })]));
    const node = await mountReport(runId);
    // The shared web notes and source lists carry their own language (reader 1's) and are not the report's.
    const marked = [...node.querySelectorAll<HTMLElement>("[data-ai-generated]")].filter((element) => element.closest(".v4WebNote, .v4Sources, .v4OtherPages") === null);
    expect(marked.length).toBeGreaterThan(10);
    expect(marked.filter((element) => element.lang !== "ar" || element.dir !== "auto")).toEqual([]);
    expect(node.querySelector(".v4RepVersionBody .v4RepList")!.getAttribute("dir")).toBe("auto");
    // Padding and rule lines sit on the reading side.
    expect(css).not.toMatch(/padding-left|border-left|margin-left/u);
  });
});

describe("the first debate's answer on the report", () => {
  it("r2-20 + f18: each path shows one trust word and a bar without counts; the checking sentence counts nothing", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId);
    const paths = [...node.querySelectorAll<HTMLElement>(".v4RepFirstOpen .v4RepPath")];
    expect(paths).toHaveLength(4);
    // The fallen answer (nuclear) reads "Didn't hold"; every path's word is one of the four trust words, never an outcome tag.
    expect(paths[2]!.querySelector(".v4RepPathWord")!.textContent).toBe("Didn't hold");
    const trustWords = ["SURE", "SURE_FOR_CASE", "STILL_ARGUED", "DIDNT_HOLD"].map((key) => CATALOG[`v4.trust.${key}`]);
    expect([...node.querySelectorAll(".v4RepPathWord")].filter((tag) => !trustWords.includes(tag.textContent ?? ""))).toEqual([]);
    expect(node.querySelector(".v4RepFate")).toBeNull();
    expect(node.querySelector(".v4BarCounts")).toBeNull();
    expect(node.textContent).toContain("A second AI checked each point. Points it did not check are shown in grey.");
  });

  it("f18: at the expert level every point is listed, an unchecked one in grey, and nothing is counted", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId, "expert");
    const unchecked = [...node.querySelectorAll<HTMLElement>(".v4RepPoint[data-trust=\"UNCHECKED\"]")];
    expect(unchecked.length).toBeGreaterThan(0);
    expect(unchecked[0]!.querySelector(".v4RepPointWord")!.textContent).toBe(CATALOG["v4.trust.unchecked"]);
    expect(node.textContent).not.toMatch(/points? here (?:was|were) not checked/u);
  });

  it("f19: 'How sure we are' shows at every reading level", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId, "plain");
    expect(node.querySelector(".v4RepConfidence")!.textContent).toContain("fairly sure about the direction");
  });

  it("f16: the digs are listed together once every one is read", async () => {
    const runId = crypto.randomUUID();
    harness.records = { parent: null, children: [
      { parent_run_id: runId, child_run_id: crypto.randomUUID(), places: ["path:n-mix"], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" },
      { parent_run_id: runId, child_run_id: crypto.randomUUID(), places: ["path:n-renew"], mode: "thorough", created_at: "2026-10-30T10:01:00.000Z" }
    ] };
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId);
    const digs = node.querySelector(".v4RepDigs")!;
    expect(digs.querySelectorAll(".v4RepDig")).toHaveLength(2);
    expect(digs.textContent).not.toContain(CATALOG["v4.common.loading"]);
  });
});

describe("the report's digs (review F6, F7)", () => {
  const link = (runId: string, child: string, path: string, minute: number) =>
    ({ parent_run_id: runId, child_run_id: child, places: [`path:${path}`], mode: "quick", created_at: `2026-10-30T10:0${minute}:00.000Z` });

  it("F6: the page is drawn once the digs are read, so 'Your digs' is there from the first draw, never popping in", async () => {
    const runId = crypto.randomUUID();
    harness.records = { parent: null, children: [link(runId, crypto.randomUUID(), "n-mix", 0)] };
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
    reports.digView = async (dig) => {
      await held;
      return { link: dig, state: "DONE", headline: "The dig's short answer.", counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 } };
    };
    reports.load = vi.fn(async () => noInvestigation(runId));
    const node = await mountReport(runId);
    expect(node.querySelector(".v4RepLoading")!.textContent).toBe(word("v4.report.loadingReport"));
    expect(node.querySelector(".v4RepDoc h1")).toBeNull();
    await act(async () => release());
    await settle();
    expect(node.querySelector(".v4RepLoading")).toBeNull();
    const digs = node.querySelector(".v4RepDigs")!;
    expect(digs.querySelectorAll(".v4RepDig")).toHaveLength(1);
    expect(node.textContent).not.toContain(CATALOG["v4.common.loading"]);
  });

  it("F7: while the report waits, each dig is read again with the versions, so the line names the dig really still going", async () => {
    const runId = crypto.randomUUID();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    harness.records = { parent: null, children: [link(runId, first, "n-mix", 0), link(runId, second, "n-renew", 1)] };
    // The first dig runs; the second has finished but still rewrites its path.
    const now = new Map<string, Pick<DigView, "state" | "rewrite">>([
      [first, { state: "RUNNING" }],
      [second, { state: "DONE", rewrite: { state: "WRITING" } as DigView["rewrite"] }]
    ]);
    const reads: string[] = [];
    reports.digView = async (dig) => {
      reads.push(dig.childRunId);
      return { link: dig, headline: null, counts: null, ...now.get(dig.childRunId)! };
    };
    const load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 2)]));
    reports.load = load;
    const node = versionSection(await mountReport(runId))!;
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe("Your report starts when the 2 digs in progress finish.");
    // The first dig finishes; the report now waits only for the second one's rewrite.
    now.set(first, { state: "DONE", rewrite: null });
    load.mockImplementation(async () => investigation(runId, "CLOSED", [writing(1, 1)]));
    await settle(10_000);
    await settle();
    const lines = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() }).paths;
    const renew = lines.find((path) => path.id === "n-renew")!.line;
    expect(text(node.querySelector(".v4RepStatusBox"))).toBe(`Your report starts when your dig on “${renew}” finishes.`);
    expect(reads.filter((id) => id === first).length).toBeGreaterThan(1);
  });
});

describe("the map's answer (owner Q-D11)", () => {
  it("shows the current version's answer, labelled with its version, and the first debate's answer one click away", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "OPEN", [finished(1, "2026-10-29T10:00:00.000Z"), finished(2, "2026-10-31T10:00:00.000Z")]));
    await mountMap(1280, runId);
    const section = page().querySelector<HTMLElement>(".v4PanelReportAnswer")!;
    expect(section.querySelector("h3")!.textContent).toBe("From your report, version 2");
    expect(section.textContent).toContain("The made-up answer of version 2.");
    const first = section.querySelector<HTMLDetailsElement>("details.v4PanelFirstAnswer")!;
    expect(first.open).toBe(false);
    expect(first.querySelector("summary")!.textContent).toBe("See the first debate's answer");
    expect(first.textContent).toContain("Our answer: put most new money into renewables and storage");
  });

  it("before any finished version the map shows the first debate's answer as before", async () => {
    const runId = crypto.randomUUID();
    reports.load = vi.fn(async () => investigation(runId, "CLOSED", [writing(1, 0)]));
    await mountMap(1280, runId);
    expect(page().querySelector(".v4PanelReportAnswer")).toBeNull();
    expect(page().textContent).toContain(CATALOG["v4.panel.answerRoot"]);
  });
});
