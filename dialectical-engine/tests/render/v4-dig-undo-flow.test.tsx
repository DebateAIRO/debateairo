// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskRoom } from "../../apps/ui/lib/billing/room.js";
import { addDig, readDigUndo, type DigUndoResult } from "../../apps/ui/lib/v4/digUndo.js";
import type { V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { DigLink, DigView, V4Path } from "../../apps/ui/lib/v4/types.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, expandBranch, harness, mountMap, openPath, page, panel, PATHS,
  resetHarness, seededAnswer, seededStory, settle, typeInto, unmountMap
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
 * V4 UX fixes (owner picks 3 Nov 2026) on the map page, clicked through in jsdom: the shared Undo note on the dig side
 * (journey-f21), several digs each with its own Undo and the note travelling to other pages (dig-d3 A), the dashed seed
 * on the map (dig-d3 B), focus and Esc (dig-f7), the note's words (dig-f8), staying where the person is (dig-f10), and on
 * a phone the one bottom stack with its pinned bar (journey-d3, dig-f16, dig-f17).
 */

const word = (key: string, values: Record<string, string | number> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replaceAll(`{${name}}`, String(value)), CATALOG[key]!);
const notes = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4Undo")];
const noteUndos = (): HTMLButtonElement[] => [...page().querySelectorAll<HTMLButtonElement>(".v4Undo .v4UndoBtn")];
const stack = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4Stack");

function room(extra: Partial<AskRoom> = {}): AskRoom {
  return { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", ...extra } as AskRoom;
}

/** Presses a button the way a person does: it gets focus, then the click. */
async function press(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.focus();
    button.click();
  });
  await settle();
}

async function escape(): Promise<void> {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.useRealTimers();
});

describe("several digs, each with its own Undo (dig-d3 A)", () => {
  it("other dig buttons stay active; undoing one never touches the other; only the other is sent", async () => {
    const runId = await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(2_000);
    await openPath(PATHS.nuclear);
    const second = buttonNamed(CATALOG["v4.panel.dig"]!, panel());
    expect(second.disabled).toBe(false);
    expect(second.getAttribute("aria-disabled")).toBeNull();
    await press(second);
    expect(notes()).toHaveLength(2);
    expect(noteUndos()).toHaveLength(2);
    await click(noteUndos()[0]!);
    expect(notes()[0]!.textContent).toContain(CATALOG["v4.undo.cancelled"]);
    await advance(10_100);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]![3]).toEqual({ parent_run_id: runId, places: ["path:n-nuclear"], mode: "quick" });
  });

  it("the place being dug says it is starting, with its Undo; pressing it again starts nothing more", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    const dig = buttonNamed(CATALOG["v4.panel.dig"]!, panel());
    await press(dig);
    expect(panel().textContent).toContain(CATALOG["v4.panel.digStarting"]);
    expect(panel().textContent).not.toContain(CATALOG["v4.panel.digBusy"]);
    expect(dig.getAttribute("aria-disabled")).toBe("true");
    await click(dig);
    expect(readDigUndo()).toHaveLength(1);
    await click(panel().querySelector<HTMLButtonElement>(".v4DigStartingUndo")!);
    expect(panel().textContent).not.toContain(CATALOG["v4.panel.digStarting"]);
    await advance(20_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });
});

describe("the note's words and keys (dig-f7, dig-f8, journey-f21)", () => {
  it("moves focus to Undo, says one line, and Esc undoes with 'Cancelled. Nothing was used.'; focus goes back", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    const dig = buttonNamed(CATALOG["v4.panel.dig"]!, panel());
    await press(dig);
    expect(document.activeElement).toBe(noteUndos()[0]);
    expect(page().querySelector(".v4Undo [role=status]")?.textContent).toBe(CATALOG["v4.undo.announceDig"]);
    await escape();
    expect(notes()[0]!.textContent).toContain(CATALOG["v4.undo.cancelled"]);
    expect(document.activeElement).toBe(dig);
    await advance(4_100);
    expect(notes()).toHaveLength(0);
    await advance(20_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("names the share of today, and on Free leaves the mode word out of the note and the tray", async () => {
    harness.planTier = "free";
    harness.room = room({ dig_share_percent: 4 });
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    const note = notes()[0]!.textContent ?? "";
    expect(note).toContain(word("v4.undo.digShare", { percent: 4 }));
    expect(note).not.toContain(CATALOG["v4.digMode.quick"]);
    // No ticking number: the countdown is the line.
    expect(note).not.toMatch(/\(\d+\)/u);
    expect(page().querySelector(".v4UndoLineFill")).not.toBeNull();
    await click(noteUndos()[0]!);
    // map-f22 (the map track): a path that is not open keeps its suggestions behind "+N more".
    await expandBranch(PATHS.renew);
    await click(branch(PATHS.renew).querySelector<HTMLInputElement>(".v4MapLeafSuggestion input[type=checkbox]")!);
    expect(page().querySelector(".v4DebTray")?.textContent).not.toContain(CATALOG["v4.digMode.quick"]);
  });

  it("after the 10 seconds says 'Starting your dig…' until the answer, stays where the person is, then offers [See it]", async () => {
    let answer: (outcome: V4AskOutcome) => void = () => undefined;
    harness.submit = vi.fn(() => new Promise<V4AskOutcome>((resolve) => { answer = resolve; }));
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(10_100);
    expect(notes()[0]!.textContent).toContain(CATALOG["v4.undo.sendingDig"]);
    expect(noteUndos()).toHaveLength(0);
    const childRunId = crypto.randomUUID();
    await act(async () => answer({ kind: "STARTED", runId: childRunId }));
    await settle();
    expect(notes()[0]!.textContent).toMatch(/Started \d{2}:\d{2}/u);
    // dig-f10: the panel stays on the path the person was reading.
    expect(panel().classList.contains("v4Panel-path")).toBe(true);
    await click(buttonNamed(CATALOG["v4.dig.seeIt"]!, notes()[0]!));
    expect(panel().classList.contains("v4Panel-dig")).toBe(true);
    // Already on the dig: its note no longer offers [See it].
    expect(buttonsNamed(CATALOG["v4.dig.seeIt"]!)).toHaveLength(0);
  });
});

describe("the seed on the map (dig-d3 B)", () => {
  it("a dashed 'Your dig · … · starting' card grows under the path at the click; Undo pulls it back", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    const seed = branch(PATHS.smr).querySelector<HTMLElement>(".v4DigSeed");
    expect(seed?.textContent).toContain(CATALOG["v4.seed.yourDig"]);
    expect(seed?.textContent).toContain(CATALOG["v4.seed.starting"]);
    expect(branch(PATHS.nuclear).querySelector(".v4DigSeed")).toBeNull();
    await click(noteUndos()[0]!);
    expect(branch(PATHS.smr).querySelector(".v4DigSeedLeaving")).not.toBeNull();
    await advance(4_100);
    expect(branch(PATHS.smr).querySelector(".v4DigSeed")).toBeNull();
  });

  it("once the dig is sent, the real dig card takes the seed's place", async () => {
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    await advance(10_100);
    await settle();
    expect(branch(PATHS.smr).querySelector(".v4DigSeed")).toBeNull();
    expect(branch(PATHS.smr).querySelector(".v4MapDig")).not.toBeNull();
  });
});

describe("the note travels with the person (dig-d3 A)", () => {
  let hostRoot: Root | null = null;
  let hostEl: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => hostRoot?.unmount());
    hostEl?.remove();
    hostRoot = null;
    hostEl = null;
  });

  async function mountHost(): Promise<HTMLDivElement> {
    const { V4DigUndoHost } = await import("../../apps/ui/components/v4/V4DigUndo.js");
    hostEl = document.createElement("div");
    document.body.append(hostEl);
    hostRoot = createRoot(hostEl);
    await act(async () => hostRoot?.render(<V4DigUndoHost catalog={CATALOG} locale="en" />));
    return hostEl;
  }

  it("the site-wide holder steps back while the map draws the note, and shows it with its Undo once the map is gone", async () => {
    const holder = await mountHost();
    await mountMap();
    await openPath(PATHS.smr);
    await press(buttonNamed(CATALOG["v4.panel.dig"]!, panel()));
    expect(holder.querySelector(".v4Undo")).toBeNull();
    await unmountMap();
    await settle();
    expect(holder.querySelector(".v4Undo")?.textContent).toContain(CATALOG["v4.dig.undo"]);
    await act(async () => holder.querySelector<HTMLButtonElement>(".v4UndoBtn")!.click());
    expect(holder.querySelector(".v4Undo")?.textContent).toContain(CATALOG["v4.undo.cancelled"]);
    await advance(20_000);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("the report page says it will wait for a dig still in its 10 seconds", async () => {
    const { V4ReportDigWait } = await import("../../apps/ui/components/v4/V4DigUndo.js");
    const path = { id: "n-smr", line: "Small modular reactors could be ready in time." } as unknown as V4Path;
    addDig({
      parentRunId: "run-1", runIds: ["root-run"], dig: { target: { kind: "path", path }, mode: "quick", sendsAt: Date.now() + 10_000 },
      sharePercent: null, showMode: true, send: async (): Promise<DigUndoResult> => ({ kind: "STOPPED" }), failedLine: "Not started."
    });
    hostEl = document.createElement("div");
    document.body.append(hostEl);
    hostRoot = createRoot(hostEl);
    await act(async () => hostRoot?.render(<V4ReportDigWait runId="root-run" catalog={CATALOG} />));
    expect(hostEl.textContent).toBe(word("v4.report.digWait", { question: "Small modular reactors could be ready in time." }));
    await advance(10_100);
    expect(hostEl.textContent).toBe("");
  });
});

describe("a phone's one bottom stack (journey-d3, dig-f16, dig-f17)", () => {
  it("the pinned bar digs here with its share; the note takes its place inside the same stack; Undo gives it back", async () => {
    harness.room = room({ dig_share_percent: 3 });
    await mountMap(375, crypto.randomUUID(), "n-smr");
    const bar = page().querySelector<HTMLElement>(".v4StackPhone .v4DebPhoneBar")!;
    const job = bar.querySelector<HTMLButtonElement>(".v4DebPhoneDig")!;
    expect(job.textContent).toBe(`${CATALOG["v4.debate.digHere"]} · ${word("v4.undo.barShare", { percent: 3 })}`);
    await press(job);
    // The note sits inside the stack, above the bar; the bar's dig button steps back for the note's Undo.
    const note = stack()!.querySelector(".v4StackTop .v4Undo");
    expect(note).not.toBeNull();
    expect(page().querySelectorAll(".v4Undo")).toHaveLength(1);
    expect(stack()!.querySelector(".v4DebPhoneDig")).toBeNull();
    expect(document.activeElement).toBe(noteUndos()[0]);
    // dig-d3 B: on the question's own screen, under the path text, "Your dig starts in a few seconds … Undo".
    const first = panel().querySelector(".v4PanelSection")!;
    expect(first.querySelector(".v4DigStarting")?.textContent).toContain(CATALOG["v4.panel.digStarting"]);
    expect(panel().querySelector(".v4PanelDig .v4DigStarting")).toBeNull();
    await click(noteUndos()[0]!);
    const back = stack()!.querySelector<HTMLButtonElement>(".v4DebPhoneDig");
    expect(back).not.toBeNull();
    expect(document.activeElement).toBe(back);
  });

  it("picks fold into 'Your picks ▸', which opens them; the bar digs them, so the folded tray has no second button", async () => {
    await mountMap(375, crypto.randomUUID(), "n-renew");
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    const toggle = stack()!.querySelector<HTMLButtonElement>(".v4StackPicksToggle")!;
    expect(toggle.textContent).toContain(CATALOG["v4.bar.yourPicks"]);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(stack()!.querySelector(".v4DebTray")).toBeNull();
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const tray = stack()!.querySelector<HTMLElement>(".v4DebTray")!;
    // journey-f23 (the wait-card track): the picks show as chips, never as "1 picked".
    expect(tray.querySelectorAll(".v4ChoiceChip")).toHaveLength(1);
    expect(buttonsNamed(CATALOG["v4.panel.dig"]!, tray)).toHaveLength(0);
    expect(buttonsNamed(CATALOG["v4.dig.trayClear"]!, tray)).toHaveLength(1);
    expect(stack()!.querySelector(".v4DebPhoneDig")?.textContent).toBe(CATALOG["v4.debate.digHere"]);
  });

  it("after a single dig of a path the slim line does not claim a good time (dig-f29, the map track's report rule)", async () => {
    await mountMap(375, crypto.randomUUID(), "n-smr");
    expect(stack()!.querySelector(".v4StackGoodTime")).toBeNull();
    await press(stack()!.querySelector<HTMLButtonElement>(".v4DebPhoneDig")!);
    await advance(10_100);
    await settle(16_000);
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(stack()!.querySelector(".v4StackGoodTime")).toBeNull();
  });

  it("shows the slim 'Good time to write your report' line above the bar when the rule fires, and × hides it", async () => {
    // dig-f29: every open question was looked into and held, so nothing open is left.
    const runId = crypto.randomUUID();
    const map = buildV4Map({ runId, answer: seededAnswer(runId), story: seededStory() });
    const places = [...new Set([...map.open, ...map.paths.flatMap((path) => path.open)].map((question) => question.id))];
    harness.records = {
      parent: null,
      children: [{ parent_run_id: runId, child_run_id: crypto.randomUUID(), places, mode: "quick", created_at: "2026-10-30T10:00:00.000Z" }]
    };
    harness.digView = (link: DigLink): DigView => ({
      link, state: "DONE", headline: null, counts: { SURE: 1, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, rewrite: null,
      points: [{ id: "d1", text: "Checked.", trust: "SURE", basis: null, reasons: [], answeredBy: null, asOf: null }]
    });
    await mountMap(375, runId, "n-smr");
    const line = stack()!.querySelector<HTMLElement>(".v4StackGoodTime");
    expect(line?.textContent).toContain(CATALOG["v4.bar.goodTime"]);
    expect(line?.querySelector("a")?.textContent).toBe(CATALOG["v4.rail.writeReport"]);
    await click(line!.querySelector<HTMLButtonElement>(".v4StackGoodClose")!);
    expect(stack()!.querySelector(".v4StackGoodTime")).toBeNull();
  });

  it("steps aside while a text box has the keyboard", async () => {
    await mountMap(375, crypto.randomUUID(), "n-renew");
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    const box = panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!;
    await act(async () => box.focus());
    expect(stack()!.classList.contains("v4StackAside")).toBe(true);
    await typeInto(box, "Pumped hydro could carry a windless week.");
    await act(async () => box.blur());
    await advance(10);
    expect(stack()!.classList.contains("v4StackAside")).toBe(false);
  });

  it("the page's bottom room is the stack's real height, never a guessed one", async () => {
    const measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains("v4Stack") ? 132.4 : 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    await mountMap(375, crypto.randomUUID(), "n-smr");
    expect(document.documentElement.style.getPropertyValue("--v4-stack-room")).toBe("133px");
    await unmountMap();
    expect(document.documentElement.style.getPropertyValue("--v4-stack-room")).toBe("");
    measured.mockRestore();
    const debateCss = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-debate.css"), "utf8");
    const undoCss = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-undo.css"), "utf8");
    expect(debateCss).not.toMatch(/150px|v4DebToastLifted|\.v4DebDock\b/u);
    expect(undoCss).toMatch(/\.appShell:has\(\.v4Stack\) \{ padding-bottom: var\(--v4-stack-room, 0px\); \}/u);
    // At most about a quarter of the screen, and in the page while the cookie bar shows.
    expect(undoCss).toMatch(/max-height: 25dvh/u);
    expect(undoCss).toMatch(/\.appShell:has\(\.consentBar\) \.v4StackPhone \{ position: static;/u);
  });
});
