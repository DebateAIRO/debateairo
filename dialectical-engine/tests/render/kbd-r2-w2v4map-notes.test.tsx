// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V4BottomStack } from "../../apps/ui/components/v4/V4BottomStack.js";
import { V4UndoNotes } from "../../apps/ui/components/v4/V4UndoNote.js";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import type { DigLink, DigView } from "../../apps/ui/lib/v4/types.js";
import { AnswerSchema, type Answer, type AnswerPathRewrites, type PathRewrite } from "../../packages/contract/src/index.js";
import { DIG_ANSWERS, DIG_RUNS } from "../../tools/v4-mock-api/rewrite-seed.js";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness.js";
import {
  advance, buttonNamed, CATALOG, harness, mountMap, openPath, page, panel, PATHS, resetHarness, seededAnswer, settle, unmountMap
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
 * Keyboard audit 2026-11-12, wave 2 (W2-V4MAP): the map page's notes that take themselves away under focus, with the site's
 * focus guard running (tests/render/kbd-guard-harness.ts). The page is the real one, with the stand-ins of
 * v4-debate-harness.tsx; the host stands for the layout's main area.
 *   V4B-F1  "Hide this" on "What your digs did"     V4B-F2 / V4A-13  the ready note's ✕
 *   V4B-F3  the phone's "Good time" ×               V4C-4  the dig note's Close
 *   (outside the list) "+N more starting" in the shared Undo note.
 */

let stopGuard: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
  stopGuard = startFocusGuard();
});

afterEach(async () => {
  stopGuard();
  await unmountMap();
  vi.useRealTimers();
});

const heading = (): HTMLElement | null => panel()?.querySelector<HTMLElement>(".v4PanelH2") ?? null;

/** A keyboard press, then the page's reads and the guard's wait. */
async function press(button: HTMLElement): Promise<void> {
  pressByKeyboard(button);
  await settle();
  await advance(FOCUS_GUARD_SETTLE_MS + 20);
  await settle();
}

/** Tab (or Shift+Tab) pressed where focus is; the guard carries on from where the lost control was. */
function tab(shift = false): Element | null {
  act(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true })); });
  return document.activeElement;
}

async function mountAsMain(...args: Parameters<typeof mountMap>): Promise<string> {
  const runId = await mountMap(...args);
  // The layout's main area (the guard's last resort) is around the page.
  page().id = "main-content";
  return runId;
}

// The fixture of kbd-r2-v4map-page.test.tsx (V4B-F2): two digs finish while the map is open.
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
  await mountAsMain(1600, runId);
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

describe("V4B-F1: \"Hide this\" on \"What your digs did\"", () => {
  it("the news line goes; focus is held in the section, right above its results", async () => {
    await twoDigsFinish();
    const section = page().querySelector<HTMLElement>(".v4DigsDid")!;
    await press(buttonNamed(CATALOG["v4.changes.dismiss"]!, section));
    expect(page().querySelector(".v4DigsDidNews")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(page().querySelector(".v4DigsDid"));
  });

  it("with no results under it the whole section goes; focus goes to the map's question card, right after it", async () => {
    const runId = crypto.randomUUID();
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: DIG_A, places: ["path:n-renew"], mode: "quick", created_at: "2026-10-29T10:05:00.000Z" }]
    };
    harness.digView = (link) => ({ link, state: "RUNNING", headline: null, counts: null });
    await mountAsMain(1600, runId);
    harness.digView = (link) => doneDig(link, null as unknown as PathRewrite);
    await advance(15_100);
    await settle(200);
    const section = page().querySelector<HTMLElement>(".v4DigsDid")!;
    expect(section.querySelector(".v4DigsDidList")).toBeNull();
    await press(buttonNamed(CATALOG["v4.changes.dismiss"]!, section));
    expect(page().querySelector(".v4DigsDid")).toBeNull();
    expect(document.activeElement).toBe(page().querySelector(".v4DebMapCol .v4MapRoot"));
  });
});

describe("V4B-F2 / V4A-13: the ready note's ✕", () => {
  it("the note goes; focus goes to the panel heading, not the empty bottom stack", async () => {
    await twoDigsFinish();
    const note = page().querySelector<HTMLElement>(".v4ReadyNote")!;
    await press(note.querySelector<HTMLElement>(".v4ReadyNoteClose")!);
    expect(page().querySelector(".v4ReadyNote")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(heading());
  });
});

describe("V4C-4: the dig note's Close", () => {
  it("the note goes; focus goes back to the panel heading, not the empty bottom stack", async () => {
    let answer: (outcome: V4AskOutcome) => void = () => undefined;
    harness.submit = vi.fn(() => new Promise<V4AskOutcome>((resolve) => { answer = resolve; }));
    await mountAsMain();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(DIG_UNDO_MS + 100);
    await act(async () => answer({ kind: "STARTED", runId: crypto.randomUUID() }));
    await settle();
    const note = page().querySelector<HTMLElement>(".v4Undo")!;
    await press(buttonNamed(CATALOG["v4.dig.close"]!, note));
    expect(page().querySelector(".v4Undo")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(heading());
  });
});

// ── The parts on their own ───────────────────────────────────────────────────────────────────────────────────────
let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement("main");
  host.id = "main-content";
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("V4B-F3: the phone's \"Good time to write your report\" ×", () => {
  it("the line goes; focus is held in the stack's top, and Tab goes on to the bar's Map button", async () => {
    const view = mount(
      <V4BottomStack phone notes={null} tray={null} goodTime reportHref="/v4/debate/x/report" job={{ kind: "none" }} catalog={CATALOG} />
    );
    await press(view.querySelector<HTMLElement>(".v4StackGoodClose")!);
    expect(view.querySelector(".v4StackGoodTime")).toBeNull();
    expect(document.activeElement).toBe(view.querySelector(".v4StackTop"));
    // Tab goes on from where × was: the bar's Map button.
    expect(tab()).toBe(view.querySelector(".v4DebPhoneMap"));
  });
});

describe("outside the list: \"+N more starting\" opens the older lines", () => {
  it("the button goes; focus is held in the note, and Tab goes on to the first line it opened", async () => {
    const items = Array.from({ length: 4 }, (_, at) => ({
      key: at, render: () => <p className="line"><button type="button">Undo {at + 1}</button></p>
    }));
    const view = mount(<V4UndoNotes items={items} max={3} moreLabel={(count) => `+${count} more`} />);
    await press(view.querySelector<HTMLElement>(".v4UndoMore")!);
    expect(view.querySelectorAll(".line")).toHaveLength(4);
    expect(document.activeElement).toBe(view.querySelector(".v4UndoNotes"));
    // Tab goes on from where the button was: to the first of the lines it opened.
    expect(tab()!.textContent).toBe("Undo 1");
  });
});
