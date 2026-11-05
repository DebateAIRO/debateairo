// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartStepRoomSchema, type StartStepRoom } from "../../packages/contract/src/index.js";

import { V4StartCombineBar } from "../../apps/ui/components/v4/V4StartCombineBar.js";
import { V4StartList, type StartPlanProps } from "../../apps/ui/components/v4/V4StartRow.js";
import { startShareChange } from "../../apps/ui/lib/v4/money.js";
import {
  pathPlanFromMenu, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanRefusal
} from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 72 (choose-d3, choose-f6, choose-f7, choose-d4, chat-quota-word-on-choosing-card; spec 2026-11-03 §2
 * item 5 and its keyboard paragraph): the path rows the person shapes before Start. Clean rows with no tick box: a number,
 * the title and question (the AIs' words marked as AI text), the viewpoint chips, the tag, Rewrite and ⋯. One tab stop per
 * row; the arrows move between rows and into the chips; Enter opens ⋯ and Escape brings focus back. "Combine with…" in ⋯
 * picks the path, the combine line says what combining frees (the true share after it, owner answer Q7), and the next row
 * pressed is combined with it. A path holds any number of viewpoints and at most four of the person's own points (owner
 * answer "Four per path" A, 5 Nov; Task 92c). On a phone the title takes the whole row and Rewrite lives only in ⋯.
 * The plan is the real path plan model; only the hook around it is stood in by a small holder. Shares are made up: Plus
 * [6, 9, 12, 15, 18, 21, 24] for 1..7 paths, as Task 69's test has them.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const PLUS: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] });

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let reducedMotion = false;
/** Every action the rows sent, in order, and every refusal they reported. */
let actions: PathPlanAction[] = [];
const onRefusal = vi.fn((_refusal: PathPlanRefusal, _action: PathPlanAction) => undefined);
/** The plan as the holder has it now, and a way to change it from outside (the hook's own COMBINE_WRITTEN). */
let latest: PathPlan | null = null;
let fromOutside: ((action: PathPlanAction) => void) | null = null;

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
  fromOutside = (action) => {
    const result = pathPlanReduce(now.current, action);
    now.current = result.plan;
    latest = result.plan;
    setPlan(result.plan);
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

function stubMotion(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })
  });
}

async function mount(initial: PathPlan = pathPlanFromMenu(NUCLEAR_MENU, 5, false), narrow = false): Promise<HTMLDivElement> {
  stubMotion();
  latest = initial;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Holder initial={initial} narrow={narrow} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reducedMotion = false;
  actions = [];
  latest = null;
  fromOutside = null;
  onRefusal.mockClear();
  vi.useRealTimers();
});

/** The plan after some actions, through the real model (each must change it). */
function planAfter(start: PathPlan, ...steps: ReadonlyArray<PathPlanAction | ((plan: PathPlan) => PathPlanAction)>): PathPlan {
  return steps.reduce<PathPlan>((plan, step) => {
    const result = pathPlanReduce(plan, typeof step === "function" ? step(plan) : step);
    expect(result.refusal).toBeNull();
    expect(result.plan).not.toBe(plan);
    return result.plan;
  }, start);
}

const text = (): string => host!.textContent ?? "";
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartRow")];
const row = (n: number): HTMLElement => rows()[n - 1]!;
const rowButton = (n: number): HTMLButtonElement => row(n).querySelector<HTMLButtonElement>(".v4StartRowButton")!;
const chips = (n: number): HTMLButtonElement[] => [...row(n).querySelectorAll<HTMLButtonElement>(".v4StartChip")];
const chipNamed = (n: number, name: string): HTMLButtonElement => chips(n).find((chip) => chip.textContent?.trim() === name)!;
const menu = (): HTMLElement | null => host!.querySelector<HTMLElement>('[role="menu"]');
const menuItems = (): string[] => [...(menu()?.querySelectorAll('[role="menuitem"]') ?? [])].map((item) => item.textContent?.trim() ?? "");
const menuItem = (name: string): HTMLButtonElement =>
  [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent?.trim() === name)!;
const label = (element: Element): string => element.getAttribute("aria-label") ?? "";
/** Buttons on the page outside any ⋯ menu, by their visible words. */
const pageButtons = (name: string, within: ParentNode = host!): HTMLButtonElement[] =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].filter((one) => one.closest('[role="menu"]') === null && one.textContent?.trim() === name);
const combineBar = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4StartCombineBar");
const keyDown = async (element: Element, key: string): Promise<void> => {
  await act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
};
const focus = async (element: HTMLElement): Promise<void> => {
  await act(async () => { element.focus(); });
};
const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => { element.click(); });
};
const typeInto = async (element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
/** Opens a row's ⋯ from the keyboard: the row button focused, then Enter. */
const openMenu = async (n: number): Promise<void> => {
  await focus(rowButton(n));
  await keyDown(rowButton(n), "Enter");
};
/** The elements a Tab press can reach inside an element. */
const tabStops = (within: Element): HTMLElement[] =>
  [...within.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex]")]
    .filter((one) => one.tabIndex >= 0 && !one.hasAttribute("disabled"));

describe("clean rows: number, words, chips and tag; no tick box", () => {
  it("five rows; path 3 holds its two chips and 'put together by us · Split'; the AIs' words are marked; no 'raised by'", async () => {
    await mount();
    expect(rows()).toHaveLength(5);
    expect(rows().map((one) => one.querySelector(".v4StartRowNumber")?.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    const third = row(3);
    expect(third.querySelector(".v4StartRowTitle")?.textContent).toBe("Security and weapons risks");
    expect(third.querySelector(".v4StartRowQuestion")?.textContent).toBe("Do imports and weapons risks make new plants less safe for Romania?");
    expect(third.textContent).toContain("2 viewpoints together:");
    expect(chips(3).map((chip) => chip.textContent?.trim())).toEqual(["Imports of fuel and minerals", "Weapons spread and sabotage"]);
    expect(third.querySelector(".v4StartRowTag")?.textContent).toBe("put together by us · Split");
    expect(pageButtons("Split", third)).toHaveLength(1);
    // The AIs' words carry the AI text mark: the title, the question and each chip.
    for (const one of [third.querySelector(".v4StartRowTitle")!, third.querySelector(".v4StartRowQuestion")!, ...chips(3)]) {
      expect(one.getAttribute("data-ai-generated"), one.textContent ?? "").toBe("true");
    }
    // A path of one viewpoint is that viewpoint: no chip line; a path of the AIs' with no tag shows no tag line.
    expect(chips(1)).toEqual([]);
    expect(row(1).textContent).not.toContain("together");
    expect(row(1).querySelector(".v4StartRowTag")).toBeNull();
    expect(text()).not.toMatch(/raised by/iu);
    expect(host!.querySelectorAll('[role="checkbox"], input[type="checkbox"]')).toHaveLength(0);
    expect(text()).not.toMatch(/allowance/iu);
  });

  it("the tags: combined by you, added by you, Added when you widened, new", async () => {
    let plan = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 3, false),
      { type: "SET_WIDTH", width: 5 },
      { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" },
      { type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null });
    plan = { ...plan, paths: plan.paths.map((one) => one.key === "kp05" ? { ...one, isNew: true } : one) };
    await mount(plan);
    expect(rows().map((one) => one.querySelector(".v4StartRowTag")?.textContent ?? null)).toEqual([
      "combined by you · Split", "put together by us · Split", "Added when you widened", "Added when you widened · new", "added by you"
    ]);
    // The person's own words carry no AI text mark.
    expect(row(5).querySelector(".v4StartRowTitle")?.hasAttribute("data-ai-generated")).toBe(false);
    expect(row(5).querySelector(".v4StartRowQuestion")?.hasAttribute("data-ai-generated")).toBe(false);
  });
});

describe("keyboard and screen reader", () => {
  it("each row's button says 'Path 3 of 5, Security and weapons risks, 2 viewpoints, not selected'; each chip its place", async () => {
    await mount();
    expect(label(rowButton(3))).toBe("Path 3 of 5, Security and weapons risks, 2 viewpoints, not selected");
    expect(label(rowButton(1))).toBe("Path 1 of 5, Whole-system costs, 1 viewpoint, not selected");
    expect(chips(3).map(label)).toEqual([
      "Viewpoint 1 of 2 in path 3, Imports of fuel and minerals, not selected",
      "Viewpoint 2 of 2 in path 3, Weapons spread and sabotage, not selected"
    ]);
    expect(label(row(3).querySelector(".v4StartRowMore")!)).toBe("More for path 3");
  });

  it("one tab stop per path, the row's button; the arrows move between rows and into and out of the chips", async () => {
    await mount();
    for (const [at, one] of rows().entries()) expect(tabStops(one), `row ${at + 1}`).toEqual([rowButton(at + 1)]);
    await focus(rowButton(1));
    await keyDown(rowButton(1), "ArrowDown");
    expect(document.activeElement).toBe(rowButton(2));
    await keyDown(rowButton(2), "ArrowDown");
    expect(document.activeElement).toBe(rowButton(3));
    await keyDown(rowButton(3), "ArrowUp");
    expect(document.activeElement).toBe(rowButton(2));
    await keyDown(rowButton(2), "ArrowDown");
    await keyDown(rowButton(3), "ArrowRight");
    expect(document.activeElement).toBe(chips(3)[0]);
    await keyDown(chips(3)[0]!, "ArrowRight");
    expect(document.activeElement).toBe(chips(3)[1]);
    await keyDown(chips(3)[1]!, "ArrowLeft");
    expect(document.activeElement).toBe(chips(3)[0]);
    await keyDown(chips(3)[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(rowButton(3));
    // The first row's ArrowUp and the last row's ArrowDown stay put.
    await focus(rowButton(5));
    await keyDown(rowButton(5), "ArrowDown");
    expect(document.activeElement).toBe(rowButton(5));
  });

  it("right to left, ArrowLeft goes into the chips and ArrowRight back out (a chip's own dir=auto does not count)", async () => {
    await mount();
    host!.setAttribute("dir", "rtl");
    await focus(rowButton(3));
    await keyDown(rowButton(3), "ArrowLeft");
    expect(document.activeElement).toBe(chips(3)[0]);
    await keyDown(chips(3)[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(chips(3)[1]);
    await keyDown(chips(3)[1]!, "ArrowRight");
    await keyDown(chips(3)[0]!, "ArrowRight");
    expect(document.activeElement).toBe(rowButton(3));
  });

  it("Enter opens ⋯ with Rewrite · Combine with… · Split apart · Move up · Move down · Remove; Escape brings focus back", async () => {
    await mount();
    await openMenu(3);
    expect(menuItems()).toEqual(["Rewrite", "Combine with…", "Split apart", "Move up", "Move down", "Remove"]);
    expect(label(menu()!)).toBe("More for path 3");
    expect(rowButton(3).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(menuItem("Rewrite"));
    await keyDown(menuItem("Rewrite"), "ArrowDown");
    expect(document.activeElement).toBe(menuItem("Combine with…"));
    await keyDown(menuItem("Combine with…"), "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(rowButton(3));
    expect(actions).toEqual([]);
    // One viewpoint: no Split apart. The first path cannot move up.
    await openMenu(1);
    expect(menuItems()).toEqual(["Rewrite", "Combine with…", "Move up", "Move down", "Remove"]);
    expect(menuItem("Move up").getAttribute("aria-disabled")).toBe("true");
    await keyDown(menu()!, "Escape");
    expect(document.activeElement).toBe(rowButton(1));
    // The ⋯ button opens the same menu.
    await press(row(2).querySelector<HTMLButtonElement>(".v4StartRowMore")!);
    expect(label(menu()!)).toBe("More for path 2");
    // A second press shuts it; a tap on the row's button opens and shuts it the same way.
    await press(row(2).querySelector<HTMLButtonElement>(".v4StartRowMore")!);
    expect(menu()).toBeNull();
    await press(rowButton(2));
    expect(label(menu()!)).toBe("More for path 2");
    await press(rowButton(2));
    expect(menu()).toBeNull();
  });

  it("Move down, Move up, Remove and Split apart from ⋯; focus follows the path", async () => {
    await mount();
    await openMenu(2);
    await press(menuItem("Move down"));
    expect(actions).toEqual([{ type: "MOVE", key: "kp02", to: 2 }]);
    expect(latest!.paths.map((one) => one.key)).toEqual(["kp01", "kp03", "kp02", "kp04", "kp05"]);
    expect(document.activeElement).toBe(rowButton(3));
    await openMenu(2);
    await press(menuItem("Split apart"));
    expect(actions.at(-1)).toEqual({ type: "SPLIT", key: "kp03" });
    expect(rows().map((one) => one.querySelector(".v4StartRowTitle")?.textContent)).toEqual([
      "Whole-system costs", "Imports of fuel and minerals", "Weapons spread and sabotage", "Keeping the lights on in a calm winter week",
      "Using less power first"
    ]);
    expect(document.activeElement).toBe(rowButton(2));
    await openMenu(5);
    await press(menuItem("Remove"));
    expect(actions.at(-1)).toEqual({ type: "REMOVE", key: "kp04" });
    expect(rows()).toHaveLength(4);
    expect(document.activeElement).toBe(rowButton(4));
  });

  it("a refused change is reported with its action, and nothing changes", async () => {
    await mount(planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), ...["kp02", "kp03", "kp04", "kp05"].map((key) => ({ type: "REMOVE", key }) as const)));
    expect(rows()).toHaveLength(1);
    await openMenu(1);
    expect(menuItems()).toEqual(["Rewrite", "Move up", "Move down", "Remove"]);
    await press(menuItem("Remove"));
    expect(onRefusal).toHaveBeenCalledWith("LAST_PATH", { type: "REMOVE", key: "kp01" });
    expect(rows()).toHaveLength(1);
    expect(document.activeElement).toBe(rowButton(1));
  });
});

describe("Combine with… (choose-d3, choose-f7, owner answer Q7)", () => {
  it("picks the path, says what combining frees, and the next row pressed is combined with it", async () => {
    await mount();
    expect(combineBar()).toBeNull();
    await openMenu(1);
    await press(menuItem("Combine with…"));
    expect(actions).toEqual([{ type: "SELECT", key: "kp01" }]);
    expect(label(rowButton(1))).toMatch(/picked to combine$/u);
    expect(label(rowButton(1))).toBe("Path 1 of 5, Whole-system costs, 1 viewpoint, picked to combine");
    expect(label(rowButton(2))).toBe("Path 2 of 5, Keeping the lights on in a calm winter week, 1 viewpoint, not selected, press to combine with it");
    expect(document.activeElement).toBe(rowButton(1));
    expect(combineBar()!.textContent).toContain("Combine “Whole-system costs” with… Pick a path.");
    // Task 69's made-up Plus shares: five paths about 18%, four about 15%; the change in grey.
    expect(combineBar()!.textContent).toContain("Combining frees 1 path (about 15%, −3%)");
    expect(combineBar()!.querySelector(".v4ShareChange")?.textContent).toBe("−3%");
    expect(text()).not.toMatch(/stays/iu);
    expect(text()).not.toMatch(/allowance/iu);
    expect(host!.querySelectorAll('[role="checkbox"], input[type="checkbox"]')).toHaveLength(0);
    actions = [];
    await focus(rowButton(2));
    await keyDown(rowButton(2), "Enter");
    expect(actions).toEqual([{ type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" }]);
    expect(latest!.selected).toEqual([]);
    expect(latest!.paths[0]!.wording).toBe("WRITING");
    expect(rows()).toHaveLength(4);
    expect(row(1).textContent).toContain("Writing one question that covers them…");
    expect(row(1).textContent).toContain("2 viewpoints together:");
    expect(combineBar()).toBeNull();
    expect(document.activeElement).toBe(rowButton(1));
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it("a tap anywhere on another row combines too", async () => {
    await mount();
    await openMenu(4);
    await press(menuItem("Combine with…"));
    actions = [];
    await press(row(5).querySelector<HTMLElement>(".v4StartRowQuestion")!);
    expect(actions).toEqual([{ type: "SELECT", key: "kp05" }, { type: "COMBINE_SELECTED" }]);
    expect(latest!.paths.map((one) => one.wording)).toEqual(["AI", "AI", "AI", "WRITING"]);
  });

  it("Escape in that mode combines nothing, empties the selection and puts focus on the first row", async () => {
    await mount();
    await openMenu(3);
    await press(menuItem("Combine with…"));
    expect(latest!.selected).toEqual(["kp03"]);
    actions = [];
    await keyDown(rowButton(3), "Escape");
    expect(actions).toEqual([{ type: "CLEAR_SELECTION" }]);
    expect(latest!.selected).toEqual([]);
    expect(latest!.paths.map((one) => one.key)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(combineBar()).toBeNull();
    expect(label(rowButton(3))).toBe("Path 3 of 5, Security and weapons risks, 2 viewpoints, not selected");
    expect(document.activeElement).toBe(rowButton(1));
  });

  it("Cancel on the combine line does the same", async () => {
    await mount();
    await openMenu(3);
    await press(menuItem("Combine with…"));
    actions = [];
    await press(pageButtons("Cancel", combineBar()!)[0]!);
    expect(actions).toEqual([{ type: "CLEAR_SELECTION" }]);
    expect(latest!.selected).toEqual([]);
    expect(combineBar()).toBeNull();
    expect(document.activeElement).toBe(rowButton(1));
  });

  it("the combined path snaps together when its question is written; with reduced motion it takes the highlight instead", async () => {
    await mount();
    await openMenu(1);
    await press(menuItem("Combine with…"));
    await press(rowButton(2));
    const key = latest!.paths[0]!.key;
    expect(row(1).classList.contains("v4StartRow--snap")).toBe(false);
    await act(async () => fromOutside!({ type: "COMBINE_WRITTEN", key, title: "Costs and calm winters", question: "What would it cost to keep the lights on?", combineRef: "cmb.sig" }));
    expect(row(1).querySelector(".v4StartRowTitle")?.textContent).toBe("Costs and calm winters");
    expect(row(1).textContent).not.toContain("Writing one question that covers them…");
    expect(row(1).classList.contains("v4StartRow--snap")).toBe(true);
    act(() => root?.unmount());
    host?.remove();
    reducedMotion = true;
    await mount();
    await openMenu(3);
    await press(menuItem("Split apart"));
    expect(row(3).classList.contains("v4StartRow--snap")).toBe(false);
    expect(row(3).classList.contains("v4Highlight")).toBe(true);
    expect(row(4).classList.contains("v4Highlight")).toBe(true);
  });

  it("the split pieces snap apart", async () => {
    await mount();
    await press(pageButtons("Split", row(3))[0]!);
    expect(actions).toEqual([{ type: "SPLIT", key: "kp03" }]);
    expect(row(3).classList.contains("v4StartRow--snap")).toBe(true);
    expect(row(4).classList.contains("v4StartRow--snap")).toBe(true);
    expect(row(2).classList.contains("v4StartRow--snap")).toBe(false);
  });
});

describe("a chip's ⋯", () => {
  it("Move to path N · Its own path · Remove; Enter opens it, Escape brings focus back to the chip", async () => {
    await mount();
    const chip = chipNamed(3, "Weapons spread and sabotage");
    await focus(chip);
    await keyDown(chip, "Enter");
    expect(menuItems()).toEqual(["Move to path 1", "Move to path 2", "Move to path 4", "Move to path 5", "Its own path", "Remove"]);
    expect(label(menu()!)).toBe("More for “Weapons spread and sabotage”");
    await keyDown(menu()!, "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip);
    await keyDown(chip, "Enter");
    await press(menuItem("Move to path 1"));
    expect(actions).toEqual([{ type: "MOVE_CHIP", chipKey: "pt15", toPathKey: "kp01" }]);
    expect(chips(1).map((one) => one.textContent?.trim())).toEqual(["Whole-system costs", "Weapons spread and sabotage"]);
    expect(row(1).textContent).toContain("Writing one question that covers them…");
    expect(chips(3)).toEqual([]);
    expect(document.activeElement).toBe(rowButton(1));
  });

  it("Its own path puts it right under its path; Remove sends it to more", async () => {
    await mount();
    await focus(chipNamed(3, "Imports of fuel and minerals"));
    await keyDown(chipNamed(3, "Imports of fuel and minerals"), "Enter");
    await press(menuItem("Its own path"));
    expect(actions).toEqual([{ type: "MOVE_CHIP", chipKey: "pt14", toPathKey: "NEW" }]);
    expect(latest!.paths.map((one) => one.title)).toEqual([
      "Whole-system costs", "Keeping the lights on in a calm winter week", "Weapons spread and sabotage", "Imports of fuel and minerals",
      "Using less power first"
    ]);
    expect(document.activeElement).toBe(rowButton(4));
  });
});

describe("a path may hold more than four viewpoints; at most four of the person's own points (owner answer A, 5 Nov)", () => {
  it("a fifth viewpoint goes in", async () => {
    const fourTogether = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false),
      { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "SELECT", key: "kp03" }, { type: "COMBINE_SELECTED" },
      (plan) => ({ type: "COMBINE_WRITTEN", key: plan.paths[0]!.key, title: "Costs, winters and security", question: "What would it cost, and how safe?", combineRef: "cmb.sig" }));
    await mount(fourTogether);
    expect(label(rowButton(1))).toBe("Path 1 of 3, Costs, winters and security, 4 viewpoints, not selected");
    await openMenu(2);
    await press(menuItem("Combine with…"));
    await press(rowButton(1));
    expect(onRefusal).not.toHaveBeenCalled();
    expect(latest!.paths[0]!.viewpoints).toHaveLength(5);
    expect(label(rowButton(1))).toMatch(/, 5 viewpoints, not selected$/u);
    expect(row(1).textContent).toContain("5 viewpoints together:");
    expect(chips(1)).toHaveLength(5);
  });

  it("a fifth of the person's own points gives OWN_WORDS_FULL and changes nothing; a fifth from the AIs goes in", async () => {
    const own = (text: string, into: (plan: PathPlan) => string) => (plan: PathPlan): PathPlanAction =>
      ({ type: "ADD_OWN", text, intoPathKey: into(plan) });
    const first = (plan: PathPlan): string => plan.paths[0]!.key;
    const fourOwn = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false),
      own("Own point one", first), own("Own point two", first), own("Own point three", first), own("Own point four", first),
      own("Own point five", () => "kp03"));
    await mount(fourOwn);
    const before = latest;
    const fifth = chipNamed(3, "Own point five");
    expect(fifth.hasAttribute("data-ai-generated")).toBe(false);
    await focus(fifth);
    await keyDown(fifth, "Enter");
    await press(menuItem("Move to path 1"));
    const tried: PathPlanAction = { type: "MOVE_CHIP", chipKey: fifth.dataset.chipKey!, toPathKey: before!.paths[0]!.key };
    expect(onRefusal).toHaveBeenCalledWith("OWN_WORDS_FULL", tried);
    expect(latest).toBe(before);
    expect(document.activeElement).toBe(chipNamed(3, "Own point five"));
    // A viewpoint from the AIs still goes in: the path then holds six.
    await focus(chipNamed(3, "Weapons spread and sabotage"));
    await keyDown(chipNamed(3, "Weapons spread and sabotage"), "Enter");
    await press(menuItem("Move to path 1"));
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(latest!.paths[0]!.viewpoints).toHaveLength(6);
  });

  it("combining past four of the person's own points is refused, and the picked path stays picked", async () => {
    const own = (text: string) => (plan: PathPlan): PathPlanAction => ({ type: "ADD_OWN", text, intoPathKey: plan.paths[0]!.key });
    const plan = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false),
      own("Own point one"), own("Own point two"), own("Own point three"), own("Own point four"),
      { type: "ADD_OWN", text: "Own point five", intoPathKey: "kp02" });
    await mount(plan);
    await openMenu(2);
    await press(menuItem("Combine with…"));
    actions = [];
    await press(rowButton(1));
    expect(onRefusal).toHaveBeenCalledWith("OWN_WORDS_FULL", { type: "COMBINE_SELECTED" });
    expect(actions.map((one) => one.type)).toEqual(["SELECT", "COMBINE_SELECTED", "UNSELECT"]);
    expect(latest!.selected).toEqual(["kp02"]);
    expect(latest!.paths).toBe(plan.paths);
    expect(combineBar()).not.toBeNull();
  });
});

describe("Rewrite, then 'Rewrite it for me / Keep my wording'", () => {
  it("the inline editor saves the person's words; when the viewpoints change the row asks, and Keep my wording keeps them", async () => {
    await mount();
    await press(pageButtons("Rewrite", row(1))[0]!);
    const editor = row(1).querySelector<HTMLFormElement>(".v4StartRewrite")!;
    expect([...editor.querySelectorAll("label")].map((one) => one.textContent)).toEqual(["Title", "Your wording for path 1"]);
    const title = editor.querySelector<HTMLInputElement>("input")!;
    const wording = editor.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(title.value).toBe("Whole-system costs");
    expect(document.activeElement).toBe(title);
    await typeInto(title, "My family's costs");
    await typeInto(wording, "What would new plants cost my family each month?");
    await press(pageButtons("Save", editor)[0]!);
    expect(actions).toEqual([{ type: "REWRITE", key: "kp01", title: "My family's costs", question: "What would new plants cost my family each month?" }]);
    expect(row(1).querySelector(".v4StartRewrite")).toBeNull();
    expect(row(1).querySelector(".v4StartRowTitle")?.textContent).toBe("My family's costs");
    expect(row(1).querySelector(".v4StartRowTitle")?.hasAttribute("data-ai-generated")).toBe(false);
    expect(row(1).querySelector(".v4StartRowQuestion")?.hasAttribute("data-ai-generated")).toBe(false);
    expect(document.activeElement).toBe(rowButton(1));
    // A viewpoint moves in: the person's words stay, and the row asks.
    await focus(chipNamed(3, "Weapons spread and sabotage"));
    await keyDown(chipNamed(3, "Weapons spread and sabotage"), "Enter");
    await press(menuItem("Move to path 1"));
    expect(row(1).textContent).toContain("The viewpoints of this path changed.");
    expect(pageButtons("Rewrite it for me", row(1))).toHaveLength(1);
    expect(row(1).querySelector(".v4StartRowTitle")?.textContent).toBe("My family's costs");
    actions = [];
    await press(pageButtons("Keep my wording", row(1))[0]!);
    expect(actions).toEqual([{ type: "KEEP_WORDING", key: "kp01" }]);
    expect(row(1).textContent).not.toContain("The viewpoints of this path changed.");
    expect(row(1).querySelector(".v4StartRowTitle")?.textContent).toBe("My family's costs");
    expect(label(rowButton(1))).toBe("Path 1 of 5, My family's costs, 2 viewpoints, not selected");
  });

  it("Rewrite it for me writes them again; an empty Save is refused and the editor stays; Cancel and Escape close it", async () => {
    const asking = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false),
      { type: "REWRITE", key: "kp01", question: "Mine?" }, { type: "MOVE_CHIP", chipKey: "pt15", toPathKey: "kp01" });
    await mount(asking);
    await press(pageButtons("Rewrite it for me", row(1))[0]!);
    expect(actions).toEqual([{ type: "REWORD", key: "kp01" }]);
    expect(row(1).textContent).toContain("Writing one question that covers them…");
    await openMenu(2);
    await press(menuItem("Rewrite"));
    const editor = row(2).querySelector<HTMLFormElement>(".v4StartRewrite")!;
    expect(editor.querySelectorAll("label")[1]?.textContent).toBe("Your wording for path 2");
    await typeInto(editor.querySelector("textarea")!, "   ");
    await press(pageButtons("Save", editor)[0]!);
    expect(onRefusal).toHaveBeenCalledWith("EMPTY", {
      type: "REWRITE", key: "kp02", title: "Keeping the lights on in a calm winter week", question: "   "
    });
    expect(row(2).querySelector(".v4StartRewrite")).not.toBeNull();
    await press(pageButtons("Cancel", row(2))[0]!);
    expect(row(2).querySelector(".v4StartRewrite")).toBeNull();
    expect(document.activeElement).toBe(rowButton(2));
    await press(pageButtons("Rewrite", row(3))[0]!);
    await keyDown(row(3).querySelector("input")!, "Escape");
    expect(row(3).querySelector(".v4StartRewrite")).toBeNull();
    expect(document.activeElement).toBe(rowButton(3));
  });
});

describe("on a phone (choose-f6)", () => {
  it("no visible Rewrite button; Rewrite is first in ⋯; the title spans the row", async () => {
    await mount(pathPlanFromMenu(NUCLEAR_MENU, 5, false), true);
    expect(pageButtons("Rewrite")).toEqual([]);
    for (const one of rows()) expect(one.querySelector(".v4StartRowTitle")?.classList.contains("v4StartRowTitle--full")).toBe(true);
    await openMenu(1);
    expect(menuItems()[0]).toBe("Rewrite");
    // No drag grip on a phone, and none here at all (Task 77 adds the mouse's drag).
    expect(host!.querySelector('[draggable="true"]')).toBeNull();
  });

  it("on a computer each row has its Rewrite button and the title does not take the class", async () => {
    await mount();
    expect(pageButtons("Rewrite")).toHaveLength(5);
    expect(host!.querySelector(".v4StartRowTitle--full")).toBeNull();
  });
});

describe("words and styles", () => {
  it("the drafted English of the rows, word for word", () => {
    const words: Readonly<Record<string, string>> = {
      "v4.start.row.a11y": "Path {n} of {count}, {title}, {viewpoints}, {state}",
      "v4.start.row.notSelected": "not selected",
      "v4.start.row.picked": "picked to combine",
      "v4.start.row.more": "More for path {n}",
      "v4.start.chip.a11y": "Viewpoint {n} of {count} in path {path}, {title}, {state}",
      "v4.start.tag.PUT_TOGETHER_BY_US": "put together by us",
      "v4.start.tag.COMBINED_BY_YOU": "combined by you",
      "v4.start.tag.ADDED_BY_YOU": "added by you",
      "v4.start.tag.ADDED_WHEN_WIDENED": "Added when you widened",
      "v4.start.tag.new": "new",
      "v4.start.writing": "Writing one question that covers them…",
      "v4.start.reword.changed": "The viewpoints of this path changed.",
      "v4.start.reword.rewrite": "Rewrite it for me",
      "v4.start.reword.keep": "Keep my wording",
      "v4.start.rewrite.title": "Title",
      "v4.start.rewrite.wording": "Your wording for path {n}",
      "v4.start.combineWith.pick": "Combine “{title}” with… Pick a path."
    };
    expect(Object.fromEntries(Object.keys(words).map((key) => [key, CATALOG[key]]))).toEqual(words);
    const rowKeys = Object.keys(CATALOG).filter((key) => /^v4\.start\.(?:row|tag|menu|chip|chipMenu|rewrite|reword|combineWith)\.|^v4\.start\.writing$/u.test(key));
    expect(rowKeys.filter((key) => /allowance|left after|raised by/iu.test(CATALOG[key]!))).toEqual([]);
  });

  it("the choosing card's CSS: text may wrap anywhere, 44 px targets, logical properties only, the snap on its token", () => {
    const start = CSS.indexOf("/* ---- V4 start step — P3: the choosing card");
    expect(start).toBeGreaterThan(-1);
    const next = CSS.indexOf("/* ---- ", start + 1);
    const block = CSS.slice(start, next < 0 ? undefined : next);
    expect(block).toContain("min-width: 0");
    expect(block).toContain("overflow-wrap: anywhere");
    expect(block).toContain("min-height: 44px");
    expect(block).toMatch(/\.v4StartRow--snap\s*\{[^}]*var\(--v4-move-snap\)/u);
    expect(block).toMatch(/\.v4StartChips\s*\{[^}]*flex-wrap: wrap/u);
    expect(block).not.toMatch(/(?:^|[\s;{])(?:left|right)\s*:|-(?:left|right)\b|text-align:\s*(?:left|right)|float:|dashed/mu);
    // Nothing is sized past a 44 px target in pixels, so the card fits a 320 px phone (Task 77's check, ahead of it).
    expect([...block.matchAll(/(\d+(?:\.\d+)?)px/gu)].map((match) => Number(match[1])).filter((value) => value > 44)).toEqual([]);
  });
});
