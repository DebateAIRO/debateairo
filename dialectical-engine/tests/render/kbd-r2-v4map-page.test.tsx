// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIG_STARTED_SHOWN_MS, DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import {
  AnswerSchema, RunProjectionSchema, type Answer, type AnswerBranch, type AnswerPathRewrites, type PathRewrite, type RunProjection
} from "../../packages/contract/src/index.js";
import { DIG_ANSWERS, DIG_RUNS } from "../../tools/v4-mock-api/rewrite-seed.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer,
  settle, unmountMap
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
 * Keyboard audit round 2 (2026-11-12) on the map page (V4DebateClient), clicked through in jsdom with the keyboard's
 * presses (a click with no pointer detail):
 *   V4B-F5: during the run, "Your question" in the panel's crumbs takes the panel away: focus goes to the question's card.
 *   V4B-F2: a "Show me" with several stops (the ready note, the changes bar) leaves focus on the tour's Next.
 *   V4C-5: "See it" on the map's dig note opens the dig with focus on the panel heading.
 *   V4B-M2: "Choose what to dig ›" on the map opens the path with focus on its choices.
 *   V4C-13: the started note does not go while focus is in it, and goes as usual once focus has left.
 */

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

const heading = (): HTMLElement | null => panel()?.querySelector<HTMLElement>(".v4PanelH2") ?? null;
const notes = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4Undo")];

/** Presses a button the way a keyboard does: it has focus, then the click (no pointer detail). */
async function press(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.focus();
    button.click();
  });
  await settle();
}

function branchOf(n: number): AnswerBranch {
  const title = `Path ${n}`;
  return {
    path_id: `b${n}`, order: n, title, question: `What about path ${n}?`, author: "AI_SUGGESTION",
    viewpoints: [{ title, question: `What about path ${n}?`, own: false }], state: "LOOKING", root_node_id: null, outcome: null
  };
}

function runRead(runId: string): RunProjection {
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: "Should Romania build new nuclear plants?", state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: {
      source: "MENU", width: 2, paths: [branchOf(1), branchOf(2)], more: [], also_raised: [], main_trust: null, carry_on_to_report: false
    },
    path_progress: [1, 2].map((n) => ({ path_id: `b${n}`, step: "ARGUING", points: ["PUT_FORWARD"], findings: [] }))
  });
}

describe("V4B-F5: the run's \"Your question\" crumb takes the panel away", () => {
  it("focus goes to the question's card on the map, never to the page", async () => {
    const runId = crypto.randomUUID();
    harness.run = runRead(runId);
    await mountMap(1600, runId);
    await press(page().querySelector<HTMLElement>("[data-path-card='b1'] .v4PathCardMain")!);
    expect(document.activeElement).toBe(heading());
    await press(buttonNamed(CATALOG["v4.panel.crumbRoot"]!, panel()));
    expect(page().querySelector(".v4DebPanelCol")).toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });
});

describe("V4B-F2: a \"Show me\" with several stops", () => {
  const DIG_A = "d9000000-0000-4000-8000-000000000006";
  const DIG_B = "d9000000-0000-4000-8000-000000000016";
  const LATER = "2026-10-31T09:00:00.000Z";
  const writingBy = (digRunId: string, id: string): PathRewrite => ({ rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "WRITING" });
  const readyBy = (digRunId: string, id: string, line: string): PathRewrite => ({
    rewrite_id: id, dig_run_id: digRunId, dig_level: 1, dig_finished_at: LATER, state: "READY", rewritten_at: "2026-10-31T09:06:00.000Z",
    changed: true, text: { line, summary: "In short.", fate: "PARTLY_HELD" }, what_changed: ["What the dig found."], fate_before: "PARTLY_HELD",
    view: null, dig_paths: []
  });
  const answerWith = (runId: string, rewrites: AnswerPathRewrites): Answer => {
    const answer = AnswerSchema.parse(seededAnswer(runId, { path_rewrites: rewrites }));
    if (answer.web === undefined) return answer;
    return { ...answer, web: { ...answer.web, paths: answer.web.paths.map((path) => ({ ...path,
      other_pages: path.other_pages.filter((other) => other.researched?.state !== "READING") })) } };
  };
  const doneDig = (link: DigLink, rewrite: PathRewrite): DigView => {
    const own = buildV4Map({ runId: link.childRunId, answer: seededAnswer(link.childRunId, { dig: DIG_ANSWERS[DIG_RUNS.ownView] }), story: null });
    return { link, state: "DONE", headline: null, counts: own.counts, rewrite, points: own.points };
  };
  async function twoDigsFinish(): Promise<void> {
    const runId = crypto.randomUUID();
    const [writingA, writingB] = [writingBy(DIG_A, "rw-a"), writingBy(DIG_B, "rw-b")];
    harness.answer = answerWith(runId, {
      paths: [{ position_ref: "n-renew", current: null, history: [writingA] }, { position_ref: "n-smr", current: null, history: [writingB] }],
      changed_since: { count: 0, since_report_version: null }
    });
    harness.records = {
      parent: null,
      children: [DIG_A, DIG_B].map((child, at) => ({
        parent_run_id: runId, child_run_id: child, places: [at === 0 ? "path:n-renew" : "path:n-smr"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z"
      }))
    };
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? writingA : writingB);
    await mountMap(1600, runId);
    const [readyA, readyB] = [readyBy(DIG_A, "rw-a", "Renewables: partly held."), readyBy(DIG_B, "rw-b", "Small reactors: partly held.")];
    const text = (rewrite: PathRewrite) => (rewrite as Extract<PathRewrite, { state: "READY" }>).text;
    harness.fresh = answerWith(runId, {
      paths: [
        { position_ref: "n-renew", current: text(readyA), history: [readyA] },
        { position_ref: "n-smr", current: text(readyB), history: [readyB] }
      ],
      changed_since: { count: 2, since_report_version: null }
    });
    harness.digView = (link) => doneDig(link, link.childRunId === DIG_A ? readyA : readyB);
    await advance(15_100);
    await settle(200);
  }

  it("from the ready note: the note goes and focus is on the tour's Next", async () => {
    await twoDigsFinish();
    const note = page().querySelector<HTMLElement>(".v4ReadyNote")!;
    await press(buttonNamed(CATALOG["v4.ready.showMe"]!, note));
    expect(page().querySelector(".v4ReadyNote")).toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4TourBar .v4TourNext"));
  });

  it("from the changes bar: focus is on the tour's Next", async () => {
    await twoDigsFinish();
    await press(buttonNamed(CATALOG["v4.ready.showMe"]!, page().querySelector<HTMLElement>(".v4DigsDidNews")!));
    expect(document.activeElement).toBe(page().querySelector(".v4TourBar .v4TourNext"));
  });
});

describe("the map's dig note", () => {
  async function startedDig(): Promise<string> {
    let answer: (outcome: V4AskOutcome) => void = () => undefined;
    harness.submit = vi.fn(() => new Promise<V4AskOutcome>((resolve) => { answer = resolve; }));
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(DIG_UNDO_MS + 100);
    const childRunId = crypto.randomUUID();
    await act(async () => answer({ kind: "STARTED", runId: childRunId }));
    await settle();
    expect(notes()[0]!.textContent).toMatch(/Started \d{2}:\d{2}/u);
    return childRunId;
  }

  it("V4C-5: \"See it\" opens the dig with focus on the panel heading", async () => {
    await startedDig();
    await press(buttonNamed(CATALOG["v4.dig.seeIt"]!, notes()[0]!));
    expect(panel().classList.contains("v4Panel-dig")).toBe(true);
    expect(document.activeElement).toBe(heading());
  });

  it("V4C-13: the started note stays while focus is in it, and goes as usual once focus has left", async () => {
    await startedDig();
    const close = buttonNamed(CATALOG["v4.dig.close"]!, notes()[0]!);
    await act(async () => close.focus());
    await advance(DIG_STARTED_SHOWN_MS * 2);
    await settle();
    expect(notes()).toHaveLength(1);
    expect(document.activeElement).toBe(close);
    await act(async () => heading()!.focus());
    await advance(DIG_STARTED_SHOWN_MS - 100);
    expect(notes()).toHaveLength(1);
    await advance(200);
    await settle();
    expect(notes()).toHaveLength(0);
  });

  it("V4C-13: a started note nobody focused still goes after its time", async () => {
    await startedDig();
    await act(async () => heading()!.focus());
    await advance(DIG_STARTED_SHOWN_MS + 100);
    await settle();
    expect(notes()).toHaveLength(0);
  });
});

describe("V4B-M2: \"Choose what to dig ›\" on the map", () => {
  it("opens the path with focus on its choices", async () => {
    const runId = crypto.randomUUID();
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places: ["path:n-mix"], mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
    };
    await mountMap(1600, runId);
    const more = branch(PATHS.mix).querySelector<HTMLButtonElement>(":scope > .v4MapLeaves > .v4MapLeafMore > .v4MapMore[aria-expanded=\"false\"]");
    if (more !== null) await click(more);
    expect(buttonsNamed(CATALOG["v4.dig.chooseWhat"]!, branch(PATHS.mix))).toHaveLength(1);
    await press(buttonNamed(CATALOG["v4.dig.chooseWhat"]!, branch(PATHS.mix)));
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    expect(document.activeElement).toBe(panel().querySelector(".v4Sugs"));
  });
});

describe("V4B-V1: the phone's pinned where-bar says its height to the window's scroll padding", () => {
  it("sets --v4-where-room on the page root while it is drawn, and takes it away after", async () => {
    const measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains("v4WhereBar") ? 71.2 : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    await mountMap(375, crypto.randomUUID(), "n-smr");
    expect(document.documentElement.style.getPropertyValue("--v4-where-room")).toBe("72px");
    await unmountMap();
    expect(document.documentElement.style.getPropertyValue("--v4-where-room")).toBe("");
    measured.mockRestore();
  });
});
