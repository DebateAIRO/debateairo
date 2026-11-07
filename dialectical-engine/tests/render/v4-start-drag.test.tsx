// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartStepRoomSchema, warmCrisisCheck, type AskClarifyResponse, type StartStepRoom } from "@debateai/contract";

/*
 * V4 start step, Task 77 (choose-d3, choose-f6, choose-f17, read-f9 / choose-f16, read-f16; spec 2026-11-03 §2 item 5 and
 * "Right to left"): drag is a mouse shortcut. Only a mouse drags, a path from its row's grip (⋮⋮, never on a phone) and a
 * chip from itself; touch and pen never drag. While dragging, the drop spot says what will happen: "Drop to add · no extra
 * path" (a chip onto another path), "Drop to combine · frees 1 path" (a path onto another path), "Drop to make its own path"
 * (a chip onto a gap); a path onto a gap only shows the gap's line. The card fits a 375 px phone and follows the writing
 * direction: logical properties only in v4-ask.css, long words wrap in every V4 chip and in the ask page's labels, and the
 * Back arrow is the plain "‹", which the browser itself mirrors on a right-to-left page (no turn of our own).
 * The rows and the path plan model are the real ones; only the hook around them is stood in by a small holder, and, for the
 * page, the session, the consent, the header and the server. Every figure and text is made up.
 */
const server = vi.hoisted(() => ({ roomAnswer: (): Promise<unknown> => Promise.resolve(null) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    getAskRoom: async () => server.roomAnswer(),
    clarifyAsk: async () => ({ source: "NONE" }),
    startPathLists: () => new Promise<void>(() => undefined),
    startPathMerge: () => new Promise(() => undefined),
    startPathCombine: () => new Promise(() => undefined),
    startPathFit: () => new Promise(() => undefined)
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { V4AskQuestions } from "../../apps/ui/components/v4/V4AskQuestions.js";
import { V4StartCombineBar } from "../../apps/ui/components/v4/V4StartCombineBar.js";
import { dropLabelOf, dropTargetOf, V4StartList, type StartPlanProps } from "../../apps/ui/components/v4/V4StartRow.js";
import { clarifyingQuestions } from "../../apps/ui/lib/v4/askText.js";
import { startShareChange } from "../../apps/ui/lib/v4/money.js";
import {
  pathPlanFromMenu, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanRefusal
} from "../../apps/ui/lib/v4/pathPlan.js";
import { boxOf, boxPlace } from "../../apps/ui/lib/v4/questionBox.js";
import type { V4StartKept } from "../../apps/ui/lib/v4/startKept.js";
import { EMPTY_GOAL } from "../../apps/ui/lib/v4/types.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
warmCrisisCheck();

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const ASK_CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const BASE_CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-base.css"), "utf8");
const PLUS: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] });

const ADD = "Drop to add · no extra path";
const COMBINE = "Drop to combine · frees 1 path";
const OWN_PATH = "Drop to make its own path";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every action the rows sent, in order. */
let actions: PathPlanAction[] = [];
const onRefusal = vi.fn((_refusal: PathPlanRefusal, _action: PathPlanAction) => undefined);
/** The plan as the holder has it now. */
let latest: PathPlan | null = null;

/** The hook's part, stood in: the plan in state, dispatch through the real model, the combine share from Task 69. */
function Holder({ initial, narrow }: Readonly<{ initial: PathPlan; narrow: boolean }>) {
  const [plan, setPlan] = useState(initial);
  const now = useRef(initial);
  const dispatch = (action: PathPlanAction): PathPlanRefusal | null => {
    actions.push(action);
    const result = pathPlanReduce(now.current, action);
    now.current = result.plan;
    latest = result.plan;
    setPlan(result.plan);
    return result.refusal;
  };
  const props: StartPlanProps = {
    plan, catalog: CATALOG, locale: "en", dispatch, onRefusal,
    share: startShareChange(PLUS, plan.paths.length, plan.paths.length - 1), narrow
  };
  return (
    <>
      <V4StartList {...props} />
      <V4StartCombineBar {...props} />
    </>
  );
}

async function mount(narrow = false, dir: "ltr" | "rtl" | null = null): Promise<HTMLDivElement> {
  latest = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
  host = document.createElement("div");
  if (dir !== null) host.setAttribute("dir", dir);
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Holder initial={latest!} narrow={narrow} />));
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  actions = [];
  latest = null;
  onRefusal.mockClear();
  server.roomAnswer = () => Promise.resolve(null);
  vi.useRealTimers();
});

const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartRow")];
const row = (n: number): HTMLElement => rows()[n - 1]!;
const rowKeys = (): string[] => rows().map((one) => one.dataset.pathKey ?? "");
const grip = (n: number): HTMLElement | null => row(n).querySelector<HTMLElement>(".v4StartRowGrip");
const title = (n: number): HTMLElement => row(n).querySelector<HTMLElement>(".v4StartRowTitle")!;
const chips = (n: number): HTMLButtonElement[] => [...row(n).querySelectorAll<HTMLButtonElement>(".v4StartChip")];
const gaps = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>("[data-drop-gap]")];
const gap = (index: number): HTMLElement => gaps().find((one) => one.dataset.dropGap === String(index))!;
const labels = (): string[] => [...host!.querySelectorAll(".v4StartDropLabel")].map((one) => one.textContent ?? "");
const dragging = (): boolean => host!.querySelector(".v4StartList--dragging") !== null;

/** One pointer event of the given kind on an element (a mouse by default), at a place on the screen. */
async function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", target: Element, at: Readonly<{ x: number; y: number }>,
  pointerType = "mouse"
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType,
      button: type === "pointermove" ? -1 : 0, buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
      clientX: at.x, clientY: at.y
    }));
  });
}

/**
 * A mouse presses on `from`, moves past the start of a drag over `first`, then over `to` (read once the drag has started,
 * since the gaps show only then); the drop is left to the case.
 */
async function dragTo(from: Element, first: Element, to: () => Element): Promise<void> {
  await pointer("pointerdown", from, { x: 10, y: 10 });
  await pointer("pointermove", first, { x: 10, y: 30 });
  await pointer("pointermove", to(), { x: 10, y: 60 });
}

describe("drop targets and their labels", () => {
  it("dropTargetOf reads a row as a PATH, a chip as a CHIP of its path, a gap as a GAP by its place; anything else is null", async () => {
    await mount();
    expect(dropTargetOf(null)).toBeNull();
    expect(dropTargetOf(document.body)).toBeNull();
    expect(dropTargetOf(host)).toBeNull();
    expect(dropTargetOf(title(2))).toEqual({ kind: "PATH", key: "kp02" });
    expect(dropTargetOf(row(4))).toEqual({ kind: "PATH", key: "kp04" });
    const chip = chips(3)[1]!;
    expect(dropTargetOf(chip)).toEqual({ kind: "CHIP", key: chip.dataset.chipKey, pathKey: "kp03" });
    // The gaps show only while something is dragged: one before each row and one after the last.
    expect(gaps()).toEqual([]);
    await pointer("pointerdown", grip(4)!, { x: 10, y: 10 });
    await pointer("pointermove", row(4), { x: 10, y: 30 });
    expect(gaps().map((one) => one.dataset.dropGap)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(dropTargetOf(gap(0))).toEqual({ kind: "GAP", index: 0 });
    expect(dropTargetOf(gap(5))).toEqual({ kind: "GAP", index: 5 });
    expect(gaps().every((one) => one.getAttribute("aria-hidden") === "true")).toBe(true);
    await pointer("pointerup", row(4), { x: 10, y: 30 });
    expect(gaps()).toEqual([]);
  });

  it("dropLabelOf names the catalogue line of each drop, and null for a path onto a gap", () => {
    const path = { kind: "PATH", key: "kp01" } as const;
    const chip = { kind: "CHIP", key: "pt14", pathKey: "kp03" } as const;
    const between = { kind: "GAP", index: 0 } as const;
    expect(dropLabelOf("CHIP", path)).toBe("v4.start.drop.add");
    expect(dropLabelOf("CHIP", chip)).toBe("v4.start.drop.add");
    expect(dropLabelOf("CHIP", between)).toBe("v4.start.drop.ownPath");
    expect(dropLabelOf("PATH", path)).toBe("v4.start.drop.combine");
    expect(dropLabelOf("PATH", chip)).toBe("v4.start.drop.combine");
    expect(dropLabelOf("PATH", between)).toBeNull();
    expect(dropLabelOf("PATH", null)).toBeNull();
    expect(dropLabelOf("CHIP", null)).toBeNull();
    expect({
      add: CATALOG["v4.start.drop.add"], combine: CATALOG["v4.start.drop.combine"], ownPath: CATALOG["v4.start.drop.ownPath"]
    }).toEqual({ add: ADD, combine: COMBINE, ownPath: OWN_PATH });
  });
});

describe("drag with a mouse (choose-d3, choose-f6)", () => {
  it("row 4 onto row 1's gap: the gap's line only, no label, then MOVE to 0", async () => {
    await mount();
    await dragTo(grip(4)!, row(4), () => gap(0));
    expect(dragging()).toBe(true);
    expect(row(4).classList.contains("v4StartRow--dragged")).toBe(true);
    expect(gap(0).classList.contains("v4StartGap--over")).toBe(true);
    expect(labels()).toEqual([]);
    expect(actions).toEqual([]);
    await pointer("pointerup", gap(0), { x: 10, y: 60 });
    expect(actions).toEqual([{ type: "MOVE", key: "kp04", to: 0 }]);
    expect(rowKeys()).toEqual(["kp04", "kp01", "kp02", "kp03", "kp05"]);
    expect(dragging()).toBe(false);
    expect(gaps()).toEqual([]);
  });

  it("a path moved down lands right above the row whose gap it was dropped on; its own gaps move nothing", async () => {
    await mount();
    await dragTo(grip(1)!, row(1), () => gap(4));
    await pointer("pointerup", gap(4), { x: 10, y: 60 });
    expect(actions).toEqual([{ type: "MOVE", key: "kp01", to: 3 }]);
    expect(rowKeys()).toEqual(["kp02", "kp03", "kp04", "kp01", "kp05"]);
    actions = [];
    // Right above and right below itself: no line, nothing sent.
    for (const index of [1, 2]) {
      await dragTo(grip(2)!, row(2), () => gap(index));
      expect(gap(index).classList.contains("v4StartGap--over")).toBe(false);
      await pointer("pointerup", gap(index), { x: 10, y: 60 });
    }
    expect(actions).toEqual([]);
  });

  it("a chip onto path 1: 'Drop to add · no extra path' while over it, gone when it leaves, then MOVE_CHIP", async () => {
    await mount();
    const chip = chips(3)[1]!;
    const chipKey = chip.dataset.chipKey!;
    await dragTo(chip, row(3), () => title(1));
    expect(row(1).classList.contains("v4StartRow--drop")).toBe(true);
    expect(labels()).toEqual([ADD]);
    expect(row(1).querySelector(".v4StartDropLabel")?.textContent).toBe(ADD);
    expect(chip.classList.contains("v4StartChip--dragged")).toBe(true);
    // Over its own path, nothing would happen: no label.
    await pointer("pointermove", row(3), { x: 10, y: 40 });
    expect(labels()).toEqual([]);
    await pointer("pointermove", title(1), { x: 10, y: 60 });
    expect(labels()).toEqual([ADD]);
    await pointer("pointerup", title(1), { x: 10, y: 60 });
    expect(actions).toEqual([{ type: "MOVE_CHIP", chipKey, toPathKey: "kp01" }]);
    expect(latest!.paths[0]!.viewpoints.map((viewpoint) => viewpoint.key)).toContain(chipKey);
    expect(labels()).toEqual([]);
  });

  it("a chip onto a gap: 'Drop to make its own path', then MOVE_CHIP to NEW and MOVE to that place", async () => {
    await mount();
    const chip = chips(3)[0]!;
    const chipKey = chip.dataset.chipKey!;
    await dragTo(chip, row(3), () => gap(0));
    expect(gap(0).classList.contains("v4StartGap--over")).toBe(true);
    expect(labels()).toEqual([OWN_PATH]);
    expect(gap(0).querySelector(".v4StartDropLabel")?.textContent).toBe(OWN_PATH);
    await pointer("pointerup", gap(0), { x: 10, y: 60 });
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ type: "MOVE_CHIP", chipKey, toPathKey: "NEW" });
    const made = latest!.paths[0]!;
    expect(made.viewpoints.map((viewpoint) => viewpoint.key)).toEqual([chipKey]);
    expect(actions[1]).toEqual({ type: "MOVE", key: made.key, to: 0 });
    expect(latest!.paths).toHaveLength(5);
  });

  it("a chip dropped right under its own path is made its own path there, with no MOVE", async () => {
    await mount();
    const chip = chips(3)[0]!;
    await dragTo(chip, row(3), () => gap(3));
    expect(labels()).toEqual([OWN_PATH]);
    await pointer("pointerup", gap(3), { x: 10, y: 60 });
    expect(actions).toEqual([{ type: "MOVE_CHIP", chipKey: chip.dataset.chipKey, toPathKey: "NEW" }]);
    expect(latest!.paths[3]!.viewpoints.map((viewpoint) => viewpoint.key)).toEqual([chip.dataset.chipKey]);
  });

  it("a path onto path 2's title: 'Drop to combine · frees 1 path', then one SELECT each and one COMBINE_SELECTED", async () => {
    await mount();
    await dragTo(grip(4)!, row(4), () => title(2));
    expect(labels()).toEqual([COMBINE]);
    expect(row(2).querySelector(".v4StartDropLabel")?.textContent).toBe(COMBINE);
    await pointer("pointerup", title(2), { x: 10, y: 60 });
    expect(actions).toEqual([{ type: "SELECT", key: "kp04" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" }]);
    expect(latest!.paths).toHaveLength(4);
    expect(latest!.paths.filter((path) => path.wording === "WRITING")).toHaveLength(1);
    expect(latest!.selected).toEqual([]);
    expect(host!.textContent).toContain("Writing one question that covers them…");
  });

  it("Escape, or a pointer the browser takes back, ends a drag with nothing sent", async () => {
    await mount();
    await dragTo(grip(4)!, row(4), () => title(2));
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(dragging()).toBe(false);
    expect(labels()).toEqual([]);
    await pointer("pointerup", title(2), { x: 10, y: 60 });
    await dragTo(grip(1)!, row(1), () => gap(4));
    await pointer("pointercancel", gap(4), { x: 10, y: 60 });
    expect(dragging()).toBe(false);
    expect(gaps()).toEqual([]);
    await pointer("pointerup", row(4), { x: 10, y: 60 });
    expect(actions).toEqual([]);
  });

  it("a press without a move is no drag: the chip's ⋯ still opens on its click", async () => {
    await mount();
    const chip = chips(3)[0]!;
    await pointer("pointerdown", chip, { x: 10, y: 10 });
    await pointer("pointermove", chip, { x: 12, y: 11 });
    expect(dragging()).toBe(false);
    await pointer("pointerup", chip, { x: 12, y: 11 });
    await act(async () => { chip.click(); });
    expect(host!.querySelector('[role="menu"]')).not.toBeNull();
    expect(actions).toEqual([]);
  });

  it("a touch pointer pressed 800 ms on a row starts no drag and sends nothing; nor does a pen", async () => {
    vi.useFakeTimers();
    await mount();
    for (const kind of ["touch", "pen"]) {
      for (const start of [grip(4)!, row(4).querySelector(".v4StartRowButton")!, chips(3)[0]!]) {
        await pointer("pointerdown", start, { x: 10, y: 10 }, kind);
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        await pointer("pointermove", title(1), { x: 10, y: 200 }, kind);
        await pointer("pointermove", title(2), { x: 10, y: 260 }, kind);
        expect(dragging()).toBe(false);
        expect(gaps()).toEqual([]);
        expect(labels()).toEqual([]);
        await pointer("pointerup", title(2), { x: 10, y: 260 }, kind);
      }
    }
    expect(actions).toEqual([]);
    expect(rowKeys()).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
  });
});

describe("the grip: a computer's, never a phone's (choose-d3)", () => {
  it("on a computer each row has one ⋮⋮ grip, hidden from screen readers and no tab stop", async () => {
    await mount();
    for (const one of rows()) {
      const grips = one.querySelectorAll<HTMLElement>(".v4StartRowGrip");
      expect(grips).toHaveLength(1);
      expect(grips[0]!.textContent).toBe("⋮⋮");
      expect(grips[0]!.getAttribute("aria-hidden")).toBe("true");
      expect(grips[0]!.tabIndex).toBe(-1);
      expect(grips[0]!.matches("button, a, input, [tabindex]")).toBe(false);
    }
  });

  it("narrow: no grip element at all, and a mouse on a chip drags nothing", async () => {
    await mount(true);
    expect(host!.querySelector(".v4StartRowGrip")).toBeNull();
    expect(host!.textContent).not.toContain("⋮⋮");
    await dragTo(chips(3)[0]!, row(3), () => title(1));
    expect(dragging()).toBe(false);
    expect(labels()).toEqual([]);
    await pointer("pointerup", title(1), { x: 10, y: 60 });
    expect(actions).toEqual([]);
  });
});

/** The CSS text with its comments taken out. */
const uncommented = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, "");
/** The declarations of the first rule whose selector list is exactly `selector` (outside comments). */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const found = new RegExp(`(?:^|[}\\n])[ \\t]*${escaped} \\{`, "u").exec(css);
  expect(found, selector).not.toBeNull();
  const at = found!.index + found![0].length;
  return css.slice(at, css.indexOf("}", at));
}
/** Physical left / right placing: insets, margins, paddings and text alignment (logical properties only). */
const PHYSICAL = /(?:^|[\s;{])(left|right|margin-left|margin-right|padding-left|padding-right)\s*:|text-align:\s*(?:left|right)/gmu;

describe("the card at 375 px and right to left: the CSS (choose-f6, choose-f17, read-f9, choose-f16, read-f16)", () => {
  const start = ASK_CSS.indexOf("/* ---- V4 start step");
  const block = uncommented(ASK_CSS.slice(start));
  /** The block without its @media conditions (a 600 px query is a condition, not a size). */
  const sized = block.replace(/@media[^{]*\{/gu, "{");

  it("the start-step block: text wraps anywhere, 44 px targets, the 600 px rule, the bar steps aside, small px only", () => {
    expect(start).toBeGreaterThan(-1);
    for (const selector of [".v4StartRowTitle", ".v4StartChip", ".v4StartBarLineText", ".v4StartDropLabel", ".v4StartBarCombine"]) {
      expect(rule(block, selector), selector).toContain("min-width: 0");
    }
    for (const selector of [".v4StartRowTitle", ".v4StartChip", ".v4StartBarLineText", ".v4StartDropLabel"]) {
      expect(rule(block, selector), selector).toContain("overflow-wrap: anywhere");
    }
    for (const selector of [".v4StartRowGrip", ".v4StartRowRewrite, .v4StartRowMore", ".v4StartBarStart", ".v4StartBarOptions"]) {
      expect(rule(block, selector), selector).toMatch(/min-(?:height|block-size): 44px/u);
    }
    expect(block).toMatch(/@media \(max-width: 600px\) \{[^}]*\.v4StartRowGrip \{ display: none; \}/u);
    expect(rule(block, ".v4StartBar--aside")).toContain("position: static");
    // No fixed width of 100 px or more, and no px value above a 44 px target, so the card fits a 320 px phone.
    expect([...sized.matchAll(/(?:^|[\s;{])(?:min-|max-)?(?:width|inline-size)\s*:\s*(\d+(?:\.\d+)?)px/gmu)]
      .map((match) => Number(match[1])).filter((value) => value >= 100)).toEqual([]);
    expect([...sized.matchAll(/(\d+(?:\.\d+)?)px/gu)].map((match) => Number(match[1])).filter((value) => value > 44)).toEqual([]);
    expect([...block.matchAll(PHYSICAL)].map((match) => match[0].trim())).toEqual([]);
  });

  it("the drag's looks: the grip, the gaps and the drop line take logical places, and nothing sizes past 44 px", () => {
    expect(rule(block, ".v4StartRowGrip")).toContain("cursor: grab");
    expect(rule(block, ".v4StartList--dragging")).toContain("user-select: none");
    expect(rule(block, ".v4StartGap")).toMatch(/position: absolute;[\s\S]*inset-inline: 0;/u);
    expect(rule(block, ".v4StartGap--over::before")).toContain("var(--accent)");
    expect(rule(block, ".v4StartRow--drop")).toContain("var(--accent)");
    expect(rule(block, ".v4StartDropLabel")).toContain("pointer-events: none");
  });

  it("the whole of v4-ask.css is placed by start and end; no scaleX and no Back-arrow rule anywhere (read-f16)", () => {
    const all = uncommented(ASK_CSS);
    expect([...all.matchAll(PHYSICAL)].map((match) => match[0].trim())).toEqual([]);
    expect(ASK_CSS).not.toMatch(/scaleX/u);
    expect(ASK_CSS).not.toMatch(/\.v4AskBackArrow/u);
    // Nothing draws .v4AskStart since the bottom bar (Task 75), so its rule went with its margin-left.
    expect(all).not.toMatch(/\.v4AskStart\b/u);
  });

  it("every V4 chip (v4-base.css) and the ask page's labels wrap a long word", () => {
    const chip = rule(uncommented(BASE_CSS), ".v4Chip");
    expect(chip).toContain("min-width: 0");
    expect(chip).toContain("max-width: 100%");
    expect(chip).toContain("overflow-wrap: anywhere");
    const label = rule(uncommented(ASK_CSS), ".v4AskLabel");
    expect(label).toContain("min-width: 0");
    expect(label).toContain("overflow-wrap: anywhere");
  });
});

const LONG_TITLE = "Energieversorgungssicherheitsbewertungen";
const LONG_ANSWER = "Energieversorgungsunternehmen";

describe("a 320 px screen: long words sit in the classes that wrap them (read-f16)", () => {
  it("each answer chip, each viewpoint chip, the question's title and the path's title carry the wrapping classes", async () => {
    expect(LONG_TITLE).toHaveLength(40);
    expect(LONG_TITLE).not.toMatch(/\s/u);
    const reply: AskClarifyResponse = { source: "AI", questions: [{ text: LONG_TITLE, answers: [LONG_ANSWER, "Haushalte"] }] };
    const plan = pathPlanReduce(pathPlanFromMenu(NUCLEAR_MENU, 5, false), {
      type: "REWRITE", key: "kp03", title: LONG_TITLE, question: `${LONG_ANSWER}?`
    }).plan;
    host = document.createElement("div");
    host.style.inlineSize = "320px";
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(
      <div className="v4Root">
        <div className="v4AskCard">
          <V4AskQuestions clarify={{ reply, waiting: false, startedAt: null, retry: () => undefined }}
            questions={clarifyingQuestions(reply)} goal={EMPTY_GOAL} planIsFree={false} seeded
            onAnswer={() => undefined} catalog={CATALOG} newDebateCatalog={messages("newDebate")} locale="en" />
          <V4StartList plan={plan} catalog={CATALOG} locale="en" dispatch={() => null} onRefusal={() => undefined} share={null} narrow />
        </div>
      </div>
    ));
    const answers = [...host.querySelectorAll<HTMLButtonElement>(".v4AskChips button")];
    expect(answers.map((one) => one.textContent)).toEqual([LONG_ANSWER, "Haushalte", "Other…"]);
    expect(answers.every((one) => one.classList.contains("v4Chip"))).toBe(true);
    const label = [...host.querySelectorAll<HTMLElement>(".v4AskLabel")].find((one) => one.textContent === LONG_TITLE);
    expect(label).toBeDefined();
    const pathTitle = [...host.querySelectorAll<HTMLElement>(".v4StartRowTitle")].find((one) => one.textContent === LONG_TITLE);
    expect(pathTitle?.classList.contains("v4StartRowTitle--full")).toBe(true);
    const viewpointChips = [...host.querySelectorAll<HTMLElement>(".v4StartChip")];
    expect(viewpointChips.length).toBeGreaterThan(0);
    expect(viewpointChips.every((one) => one.classList.contains("v4Chip"))).toBe(true);
  });
});

describe("right to left (choose-f17, read-f16)", () => {
  it("the rows stay in the list's order in the page, numbered 1 to 5 (the browser mirrors the layout, not the order)", async () => {
    await mount(false, "rtl");
    expect(rowKeys()).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(rows().map((one) => one.querySelector(".v4StartRowNumber")?.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("the page's Back is the plain '‹ ' in a hidden span with no dir and no turn of its own, so the page's direction mirrors it", async () => {
    const box = boxPlace(boxOf(START_FIXTURE_QUESTION), { key: "Which region?", text: "Which region? The north." }, ["Which region?"]);
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const kept: V4StartKept = {
      v: 1, readLine: START_FIXTURE_QUESTION, box, sentGoal: { answers: [{ question: "Which region?", answer: "The north.", other: false }], matters: "" },
      clarify: { source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] }, check: { ref: "chk.sig" },
      menu: signedMenu(NUCLEAR_MENU), lists: [], lateLists: [signedList(3)], end: "READY", plan, width: plan.width, mode: "thorough", carryOn: false
    };
    server.roomAnswer = () => Promise.resolve({
      room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS",
      start_step: { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] }
    });
    host = document.createElement("div");
    host.setAttribute("dir", "rtl");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(
      <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={messages("newDebate")} billingCatalog={messages("billing")}
        locale="en" crisisCountryHint={null} initialQuestion={START_FIXTURE_QUESTION} initialLevel="plain" kept={kept} />
    ));
    for (let round = 0; round < 4; round += 1) {
      await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
    }
    expect(host.querySelector(".v4AskReadTitle")).not.toBeNull();
    expect(rowKeys()).toEqual(plan.paths.map((path) => path.key));
    const back = host.querySelector<HTMLButtonElement>(".v4AskBack")!;
    const arrow = back.firstElementChild as HTMLElement;
    expect(arrow.tagName).toBe("SPAN");
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
    expect(arrow.textContent).toBe("‹ ");
    expect(arrow.hasAttribute("dir")).toBe(false);
    expect(arrow.getAttribute("style")).toBeNull();
    expect(arrow.getAttribute("class")).toBeNull();
    expect(back.hasAttribute("dir")).toBe(false);
  });
});
