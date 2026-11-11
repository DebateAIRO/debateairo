// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateAndTime } from "../../apps/ui/lib/i18n/translate.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { rebuildDigTarget } from "../../apps/ui/lib/v4/digRetry.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { whenText } from "../../apps/ui/lib/v4/stateWords.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  InvestigationReportsSchema, type DigLinks, type InvestigationReports, type InvestigationReportVersion, type RunProjection
} from "../../packages/contract/src/index.js";
import { CATALOG, click, harness, mountMap, page, resetHarness, seededAnswer, seededStory, settle, unmountMap } from "./v4-debate-harness.js";

/*
 * V4 start step, Task 76j: the map page's own wiring of the owner's 5 Nov answers, on the real page with the REAL header
 * (its account menu and quota circle; only the server's reads are stand-ins). The review session's wiring list
 * (docs/research/2026-11-03-v4-ux-review/FOR-START-STEP-2026-11-06-wiring.md):
 *  - question 12 B (items 4 and 5): "Open in the classic view" is in the account menu only, on every screen of the map's
 *    step: waiting, paused and failed too; no body screen draws one.
 *  - question 18 A (item 6): on a phone the top bar shows "Write my report" only while the bottom bar does not: at a good
 *    moment, and with the strip grown from the bar, one on screen; with a text box focused (the stack aside), the top bar's.
 *  - question 23 A (item 7): the map's report wait line names the one READ dig the report waits for; two, or a dig the
 *    map could not read, name none; the dig's words carry the debate's language.
 *  - the third round (item 10): a wait that ends on another day says its day in the long form with the year.
 *  - item 12: a dig's own failed page says "You can try this dig again from the map." only when the parent map offers it.
 *  - item 17: the old header level and allowance rules are gone from v4-ask.css.
 * Made-up words and figures only.
 */

const reports = vi.hoisted(() => ({
  load: (async () => null) as (runId: string) => Promise<unknown>,
  /** The debate's language as the served read carries it (report-f14); null: not known. */
  language: null as string | null,
  /** The dig records by run id (the harness answers one set for every run). */
  records: {} as Record<string, unknown>
}));

// The real header reads the session, the account's address and the usage; every other server call fails at once here
// (the page's own reads are the harness's stand-ins below), so nothing reaches a network.
vi.mock("@/lib/api", async (original) => {
  const real = await original<typeof import("../../apps/ui/lib/api.js")>();
  const stood: Record<string, unknown> = {
    readSession: async () => ({ session_id: "synthetic" }),
    readAccountEmail: async () => ({ email: "maria@example.com", recovery_email: null, pending: null }),
    getBillingUsage: async () => ({ plan_id: "PLUS", windows: [] })
  };
  const client = new Proxy({}, {
    get: (_target, property) => (typeof property === "string" && property in stood
      ? stood[property]
      : async () => { throw new Error("not in this test"); })
  });
  return { ...real, contractClient: client };
});
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => {
  const mocked = (await import("./v4-debate-harness.js")).loadMock(await original());
  return {
    ...mocked,
    loadV4: async (id: string) => {
      const read = await mocked.loadV4(id);
      return read.kind === "SERVED" && reports.language !== null ? { ...read, language: reports.language } : read;
    },
    loadInvestigation: (runId: string) => reports.load(runId)
  };
});
vi.mock("@/lib/v4/reportWriting", async (original) => ({ ...(await original()), loadRunPublished: async () => false }));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => {
  const mocked = (await import("./v4-debate-harness.js")).accountMemoryMock(await original());
  return {
    ...mocked,
    readDigRecords: async (runId: string) => {
      const records = reports.records[runId];
      if (records === undefined) return (await import("./v4-debate-harness.js")).harness.records;
      if (records === "UNREADABLE") throw new Error("not readable");
      return records;
    }
  };
});
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

const flat = (node: Element | null): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
const UNAVAILABLE = "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM";

function investigation(runId: string, state: "OPEN" | "CLOSED", versions: InvestigationReportVersion[], digs = 0): InvestigationReports {
  return InvestigationReportsSchema.parse({
    investigation_id: versions.length === 0 && digs === 0 && state === "OPEN" ? null : "4e000000-0000-4000-8000-0000000000bb",
    root_run_id: runId, state, digs, versions,
    current: versions.filter((version) => version.state === "READY").at(-1)?.report_version ?? null
  });
}
const writing = (waiting: number): InvestigationReportVersion =>
  ({ report_version: 1, closed_at: "2026-11-04T10:00:00.000Z", state: "WRITING", waiting_for_digs: waiting });

const running = (runId: string, extra: Partial<RunProjection> = {}): RunProjection => ({
  run_ref: runId, question_line: "Should the city fund the tram line?", state: "RUNNING", terminal_reason: null, hold_until: null, ...extra
} as RunProjection);

/** The seeded answer's map, and every open question on it (the places a dig is started from). */
function openQuestionsOf(runId: string) {
  const map = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() });
  return { map, open: [...map.open, ...map.paths.flatMap((path) => path.open)] };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  reports.load = async () => null;
  reports.language = null;
  reports.records = {};
});
afterEach(async () => {
  await unmountMap();
  document.body.replaceChildren();
  vi.useRealTimers();
});

// ── Question 12 B: the classic view in the account menu only ─────────────────────────────────────────────────────
describe("question 12 B: \"Open in the classic view\" is in the account menu only, on every screen of the map", () => {
  /** Opens the real header's account menu; the classic items it holds (their addresses). */
  async function classicInMenu(): Promise<string[]> {
    const account = page().querySelector<HTMLButtonElement>(".v4Hdr .v4HdrAccountButton");
    expect(account).not.toBeNull();
    await click(account!);
    return [...document.querySelectorAll<HTMLAnchorElement>("[data-v4-menu=classic]")].map((link) => link.getAttribute("href")!);
  }
  /** Classic links anywhere else on the page (a body screen's own link). */
  const classicInBody = (): Element[] => [...document.querySelectorAll("a")]
    .filter((link) => link.textContent === CATALOG["v4.common.classicView"] && !link.matches("[data-v4-menu=classic]"));

  const screens: ReadonlyArray<readonly [string, (runId: string) => RunProjection]> = [
    ["waiting", (runId) => running(runId)],
    ["paused at the month wall", (runId) => running(runId, { month_pause: { until: "2026-12-01T00:00:00.000Z", can_continue: false } })],
    ["failed", (runId) => running(runId, { state: "FAILED", terminal_reason: UNAVAILABLE })]
  ];
  for (const [name, run] of screens) {
    it(`${name}: exactly one, in the menu, with this debate's classic address, and none in the body`, async () => {
      const runId = crypto.randomUUID();
      harness.run = run(runId);
      await mountMap(1600, runId);
      expect(classicInBody()).toEqual([]);
      expect(await classicInMenu()).toEqual([`/debate/${runId}`]);
      expect(classicInBody()).toEqual([]);
    });
  }

  it("the served map keeps it in the menu, once", async () => {
    const runId = await mountMap(1600);
    expect(await classicInMenu()).toEqual([`/debate/${runId}`]);
    expect(classicInBody()).toEqual([]);
  });
});

// ── Question 18 A: one "Write my report" on a phone's screen ─────────────────────────────────────────────────────
describe("question 18 A: on a phone the top bar shows \"Write my report\" only when the bottom bar does not (375 px)", () => {
  /** dig-f29's good time: every open question was dug, and the dig is done. */
  function digEverythingOpen(runId: string): void {
    const { open } = openQuestionsOf(runId);
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: [...new Set(open.map((question) => question.id))], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
    };
    harness.digView = (link: DigLink): DigView => ({
      link, state: "DONE", headline: null, counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, rewrite: null,
      points: [{ id: "d1", text: "Checked.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }]
    });
  }
  /**
   * Every "Write my report" a person sees: below 768 px the top bar's steps aside when it carries .v4DebReportAtBottom
   * (v4-debate.css; tests/render/v4-map-report-answers.test.tsx pins that rule), and the stack's bar is out of view while the
   * stack is aside for the keyboard.
   */
  const shownWriteReport = (): Element[] => [...page().querySelectorAll("a, button")]
    .filter((element) => label(element) === CATALOG["v4.rail.writeReport"])
    .filter((element) => !element.classList.contains("v4DebReportAtBottom") && element.closest(".v4StackAside") === null);
  const inHeader = (elements: Element[]): Element[] => elements.filter((element) => element.closest(".v4Hdr") !== null);
  /** The words a button shows (dig-f29's "Good time" words are for screen readers only). */
  function label(element: Element): string {
    const copy = element.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll(".v4SrOnly")) hidden.remove();
    return flat(copy);
  }

  it("at a good moment: exactly one on screen, and none in the top bar", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    await mountMap(375, runId);
    await settle(50);
    // The top bar still holds its button (a computer shows it); on a phone it steps aside.
    expect(page().querySelector(".v4Hdr .v4DebReportLink")).not.toBeNull();
    expect(shownWriteReport()).toHaveLength(1);
    expect(inHeader(shownWriteReport())).toEqual([]);
  });

  it("with the strip grown from the bottom bar: none in the top bar", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    await mountMap(375, runId);
    await settle(50);
    const bottom = shownWriteReport().find((element) => element.closest(".v4Hdr") === null) as HTMLElement;
    await click(bottom);
    expect(page().querySelector(".v4StackPhone [data-report-strip]")).not.toBeNull();
    expect(inHeader(shownWriteReport())).toEqual([]);
  });

  it("with a text box focused (the keyboard is open, the stack steps aside): the top bar shows its own", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    await mountMap(375, runId);
    await settle(50);
    const box = document.body.appendChild(document.createElement("textarea"));
    await act(async () => box.focus());
    await settle();
    expect(page().querySelector(".v4StackAside")).not.toBeNull();
    expect(inHeader(shownWriteReport())).toHaveLength(1);
    expect(shownWriteReport()).toHaveLength(1);
  });

  it("a computer keeps the top bar's button beside the bar's line", async () => {
    const runId = crypto.randomUUID();
    digEverythingOpen(runId);
    reports.load = async () => investigation(runId, "OPEN", [], 1);
    await mountMap(1600, runId);
    await settle(50);
    expect(inHeader(shownWriteReport())).toHaveLength(1);
  });
});

// ── Question 23 A: the map's report wait line names its one waiting dig ──────────────────────────────────────────
describe("question 23 A: the map's report wait line names the one dig it waits for", () => {
  const waitLine = (): HTMLElement | null => page().querySelector<HTMLElement>("[data-report-wait] .v4DebReportWaitLine");
  /** Digs of this map at open questions, one per given state (null: its read fails). */
  function digsAt(runId: string, states: ReadonlyArray<DigView["state"] | null>): string[] {
    const { open } = openQuestionsOf(runId);
    const children = states.map((_, index) => ({
      parent_run_id: runId, child_run_id: crypto.randomUUID(), places: [open[index]!.id], mode: "quick" as const, created_at: "2026-10-30T10:00:00.000Z"
    }));
    harness.records = { parent: null, children };
    const byChild = new Map(children.map((child, index) => [child.child_run_id, states[index]!]));
    harness.digView = (link: DigLink): DigView => {
      const state = byChild.get(link.childRunId) ?? null;
      if (state === null) throw new Error("not readable");
      return { link, state, headline: null, counts: null };
    };
    return states.map((_, index) => open[index]!.text);
  }

  it("one read dig still running: \"Your report starts when your dig on “…” finishes.\", its words marked as AI text", async () => {
    const runId = crypto.randomUUID();
    const [question] = digsAt(runId, ["RUNNING"]);
    reports.load = async () => investigation(runId, "CLOSED", [writing(1)], 1);
    await mountMap(1600, runId);
    await settle(50);
    expect(flat(waitLine())).toBe(`Your report starts when your dig on “${question!}” finishes.`);
    const words = waitLine()!.querySelector<HTMLElement>("[data-ai-generated]")!;
    expect(words.textContent).toBe(question);
    expect(words.getAttribute("dir")).toBe("auto");
  });

  it("the dig's words carry the debate's language (report-f14): the run's, else its story's, as on the report page; none known, none", async () => {
    const runId = crypto.randomUUID();
    digsAt(runId, ["RUNNING"]);
    reports.language = "ro";
    reports.load = async () => investigation(runId, "CLOSED", [writing(1)], 1);
    await mountMap(1600, runId);
    await settle(50);
    expect(waitLine()!.querySelector("[data-ai-generated]")!.getAttribute("lang")).toBe("ro");
    await unmountMap();
    // The seeded story says "en".
    const storyOnly = crypto.randomUUID();
    digsAt(storyOnly, ["RUNNING"]);
    reports.language = null;
    reports.load = async () => investigation(storyOnly, "CLOSED", [writing(1)], 1);
    await mountMap(1600, storyOnly);
    await settle(50);
    expect(waitLine()!.querySelector("[data-ai-generated]")!.getAttribute("lang")).toBe("en");
    await unmountMap();
    const none = crypto.randomUUID();
    digsAt(none, ["RUNNING"]);
    harness.story = { ...seededStory(), language: null } as typeof harness.story;
    reports.load = async () => investigation(none, "CLOSED", [writing(1)], 1);
    await mountMap(1600, none);
    await settle(50);
    expect(waitLine()!.querySelector("[data-ai-generated]")!.hasAttribute("lang")).toBe(false);
  });

  it("two read digs still running: the map names neither", async () => {
    const runId = crypto.randomUUID();
    digsAt(runId, ["RUNNING", "WAITING"]);
    reports.load = async () => investigation(runId, "CLOSED", [writing(1)], 2);
    await mountMap(1600, runId);
    await settle(50);
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
    expect(waitLine()!.querySelector("[data-ai-generated]")).toBeNull();
  });

  it("a dig the map could not read (its stand-in) is never named", async () => {
    const runId = crypto.randomUUID();
    digsAt(runId, [null]);
    reports.load = async () => investigation(runId, "CLOSED", [writing(1)], 1);
    await mountMap(1600, runId);
    await settle(50);
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
  });

  it("a dig's own map names none, though one of its own digs runs: the report it waits on is the first question's", async () => {
    const runId = crypto.randomUUID();
    digsAt(runId, ["RUNNING"]);
    harness.answer = seededAnswer(runId, { dig: { parent_run_id: crypto.randomUUID(), position_ref: "n-mix", places: ["path:n-mix"], level: 1, picks: [], rewrite: null } });
    reports.load = async () => investigation(runId, "CLOSED", [writing(1)], 1);
    await mountMap(1600, runId);
    await settle(50);
    expect(waitLine()).not.toBeNull();
    expect(flat(waitLine())).toBe(CATALOG["v4.investigation.waitingDigs.one"]);
    expect(waitLine()!.querySelector("[data-ai-generated]")).toBeNull();
  });
});

// ── The third round (item 10): a wait that ends on another day names its day ─────────────────────────────────────
describe("the third round: a wait that ends on another day says its day in the long form with the year", () => {
  it("late in the evening, a free spot tomorrow reads with its day; one later today, with its clock alone", async () => {
    const now = new Date(2026, 10, 5, 23, 10);
    vi.setSystemTime(now);
    const tomorrow = new Date(2026, 10, 6, 0, 40);
    const runId = crypto.randomUUID();
    harness.run = running(runId, { state: "WAITING", waits_until: tomorrow.toISOString() });
    await mountMap(1600, runId);
    const long = whenText(tomorrow, "en", now.getTime())!;
    expect(long).toBe(formatDateAndTime("en", tomorrow));
    expect(long).toContain("November 2026");
    expect(flat(page().querySelector("[data-wait-word]"))).toContain(long);
    await unmountMap();
    const later = new Date(2026, 10, 5, 23, 50);
    const sameDay = crypto.randomUUID();
    harness.run = running(sameDay, { state: "WAITING", waits_until: later.toISOString() });
    await mountMap(1600, sameDay);
    expect(flat(page().querySelector("[data-wait-word]"))).toContain(whenText(later, "en", now.getTime())!);
    expect(flat(page().querySelector("[data-wait-word]"))).not.toContain("November");
  });
});

// ── Item 12: a dig's own failed page and what its map offers ─────────────────────────────────────────────────────
describe("item 12: a dig's own failed page says the map offers a try only when it does", () => {
  const PARENT_LINE = (parent: string): string => seededAnswer(parent).question_line;
  /**
   * A failed dig `dig` of `parent`, at its first open question; `siblings`: the parent's other digs of the same pick, after
   * it, by state. `asked`: the question the failed dig's run was asked (else exactly what the map would ask again).
   * `wholePath`: a dig of the map's first path instead (a place only the parent's story puts on an R22 map).
   */
  function failedDigOf(parent: string, dig: string, siblings: ReadonlyArray<DigView["state"]>, asked?: string, wholePath = false): void {
    const { map, open } = openQuestionsOf(parent);
    const place = wholePath ? { id: `path:${map.paths[0]!.id}`, text: map.paths[0]!.line } : open[0]!;
    const record = (child: string) => ({ parent_run_id: parent, child_run_id: child, places: [place.id], mode: "quick" as const, created_at: "2026-10-30T10:00:00.000Z" });
    const later = siblings.map(() => crypto.randomUUID());
    reports.records[dig] = { parent: record(dig), children: [] } satisfies DigLinks;
    reports.records[parent] = { parent: null, children: [record(dig), ...later.map(record)] } satisfies DigLinks;
    const link: DigLink = { parentRunId: parent, childRunId: dig, openQuestionIds: [place.id], questions: [place.text], mode: "quick", startedAt: null };
    const line = asked ?? digQuestion(rebuildDigTarget(link, map)!, PARENT_LINE(parent), CATALOG, "en");
    const states = new Map<string, DigView["state"]>([[dig, "FAILED"], ...later.map((child, index) => [child, siblings[index]!] as const)]);
    harness.digView = (each: DigLink): DigView => {
      const state = states.get(each.childRunId) ?? "DONE";
      return state === "FAILED"
        ? { link: each, state, headline: null, counts: null, terminalReason: UNAVAILABLE, questionLine: line }
        : { link: each, state, headline: null, counts: null };
    };
    harness.run = running(dig, { question_line: line, state: "FAILED", terminal_reason: UNAVAILABLE });
  }
  async function mountFailedDig(parent: string, dig: string): Promise<string> {
    await mountMap(1600, dig);
    await settle(50);
    // The way back to the map it was dug from (with the debate's level, as before).
    expect(page().querySelector(`.v4DebFailed a[href^="/v4/debate/${parent}"]`)).not.toBeNull();
    return flat(page().querySelector(".v4DebFailed"));
  }

  it("the map offers \"Try this dig again\": the page says so", async () => {
    const parent = crypto.randomUUID();
    const dig = crypto.randomUUID();
    failedDigOf(parent, dig, []);
    const text = await mountFailedDig(parent, dig);
    expect(text).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
    expect(text).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  it("the same dig failed twice (the map says it keeps failing): no note, and no promise of a later try", async () => {
    const parent = crypto.randomUUID();
    const dig = crypto.randomUUID();
    failedDigOf(parent, dig, ["FAILED"]);
    const text = await mountFailedDig(parent, dig);
    expect(text).toContain(CATALOG["v4.digFailed.unavailableKeepsFailing"]!);
    expect(text).not.toContain("You can try it again in a while.");
    expect(text).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  it("a later try already runs, or the map cannot offer one (it would ask something else): no note", async () => {
    const parent = crypto.randomUUID();
    const dig = crypto.randomUUID();
    failedDigOf(parent, dig, ["RUNNING"]);
    expect(await mountFailedDig(parent, dig)).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
    await unmountMap();
    const other = crypto.randomUUID();
    const otherDig = crypto.randomUUID();
    failedDigOf(other, otherDig, [], "Dig: a made-up question the map would not ask again");
    expect(await mountFailedDig(other, otherDig)).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  it("when the parent map's digs cannot be read, the page is as it was: the reason in full and the note", async () => {
    const parent = crypto.randomUUID();
    const dig = crypto.randomUUID();
    failedDigOf(parent, dig, ["FAILED"]);
    reports.records[parent] = "UNREADABLE";
    const text = await mountFailedDig(parent, dig);
    expect(text).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
    expect(text).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  // Independent review (Task 76j): the parent's story is a read too. When it failed for a moment, or is still being written,
  // the parent map has no paths yet (it reads the story again), so what it offers is not known: the page as it was.
  it("when the parent's story could not be read just now, or is still being written, the page is as it was", async () => {
    // With the story read, a dig of a whole path is offered again (so the note's absence below is the story's doing).
    const parent = crypto.randomUUID();
    const dig = crypto.randomUUID();
    failedDigOf(parent, dig, [], undefined, true);
    expect(await mountFailedDig(parent, dig)).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
    await unmountMap();
    const unread = { ...seededStory(), status: "UNAVAILABLE", unavailable_reason: "STORY_READ_FAILED", story: null };
    const writing = { ...seededStory(), status: "WRITING", story: null };
    for (const story of [unread, writing]) {
      const other = crypto.randomUUID();
      const otherDig = crypto.randomUUID();
      failedDigOf(other, otherDig, [], undefined, true);
      harness.loadStory = vi.fn(async () => story);
      const text = await mountFailedDig(other, otherDig);
      expect(harness.loadStory).toHaveBeenCalled();
      expect(text, story.status).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
      expect(text, story.status).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
      await unmountMap();
    }
  });
});

// ── Items 2 and 4: no level handed to a header or a shelf ────────────────────────────────────────────────────────
describe("items 2 and 4: the ask page and the map hand no level to the header or the shelf", () => {
  // The header and the shelf accept the level props and ignore them (the 5 Nov ruling), so no screen can show the
  // difference: the pages' own source is read. Each element is taken from its "<Name" up to its closing "/>" or ">".
  const elements = (file: string, name: string): string[] => {
    const source = readFileSync(resolve(import.meta.dirname, `../../apps/ui/components/v4/${file}`), "utf8");
    return [...source.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?(?:/>|\\n\\s*>)`, "gu"))].map((match) => match[0]);
  };
  it("V4AskClient's header and shelf, and V4DebateClient's header, carry no readingLevel, linkLevel, onReadingLevel or level", () => {
    const handed = [
      ...elements("V4AskClient.tsx", "V4Header"), ...elements("V4AskClient.tsx", "V4MapShelf"), ...elements("V4DebateClient.tsx", "V4Header")
    ];
    expect(handed.length).toBe(3);
    for (const element of handed) expect(element).not.toMatch(/\b(?:readingLevel|linkLevel|onReadingLevel|level)=/u);
  });
});

// ── Item 17: the old header level and allowance rules are gone ───────────────────────────────────────────────────
describe("item 17: v4-ask.css carries no rule for the header's old level menu or allowance pill", () => {
  it("no .v4HdrAllowance, .v4HdrLevelStatic or .v4HdrLevel* selector is left", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(css).not.toMatch(/\.v4HdrAllowance|\.v4HdrLevel/u);
  });
});
