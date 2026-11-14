// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartStepRoomSchema, type StartMenu, type StartStepRoom } from "../../packages/contract/src/index.js";

import { V4StartCard } from "../../apps/ui/components/v4/V4StartCard.js";
import { V4StartMore } from "../../apps/ui/components/v4/V4StartMore.js";
import { V4StartSuggest } from "../../apps/ui/components/v4/V4StartSuggest.js";
import { V4StartWays } from "../../apps/ui/components/v4/V4StartWays.js";
import { startPathsShare, startShareChange } from "../../apps/ui/lib/v4/money.js";
import {
  pathPlanFromMenu, pathPlanReduce, pathPlanWithRevision, type PathPlan, type PathPlanAction
} from "../../apps/ui/lib/v4/pathPlan.js";
import type { V4StartCardState } from "../../apps/ui/lib/v4/useStartPaths.js";
import {
  NUCLEAR_MENU, NUCLEAR_MENU_REV2, SIXTEEN_PATH_MENU, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedMenu
} from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 74 (choose-f18, choose-f6, choose-f7; spec 2026-11-03 §2 items 4 and 5; row D §4 and §5): "+ N more to
 * explore" opens a drawer (a panel at the end side on a computer, a full-screen sheet at 600 px or less) with "Most useful
 * first" (the next ten), "Other directions" and "All, by area"; "Another way to see it" sits above the paths, each card with
 * its kind, its add buttons and "Make this my question"; the one-tap suggestions outline the paths they name. A new path on a
 * full list is never a dead end (the full-list choice, as the own path has it).
 * The card is the real V4StartCard on the real path plan model; only the hook (useStartPaths) is stood in by a small holder,
 * as Task 73's test does. Shares are made up: Plus [6, 9, 12, 15, 18, 21, 24] for 1..7 paths.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const PLUS: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] });

type Stage = Readonly<{ plan: PathPlan; menu?: StartMenu; wider?: Readonly<{ percent: number; delta: number }> | null }>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every action the card sent, in order. */
let actions: PathPlanAction[] = [];
let latest: PathPlan | null = null;
const onMakeMyQuestion = vi.fn((_cardId: string): void => undefined);
let control: { revise(menu: StartMenu): void } | null = null;

/** The hook's part, stood in: the plan in state, dispatch through the real model. */
function Holder({ initial }: Readonly<{ initial: Stage }>) {
  const [plan, setPlan] = useState<PathPlan>(initial.plan);
  const now = useRef<PathPlan>(initial.plan);
  const set = (next: PathPlan): void => {
    now.current = next;
    latest = next;
    setPlan(next);
  };
  const dispatch = (action: PathPlanAction) => {
    actions.push(action);
    const result = pathPlanReduce(now.current, action);
    set(result.plan);
    return result.refusal;
  };
  control = { revise: (menu) => set(pathPlanWithRevision(now.current, menu)) };
  const start: V4StartCardState = {
    phase: "READY",
    progress: null,
    plan,
    menu: signedMenu(initial.menu ?? NUCLEAR_MENU),
    dispatch,
    languageOffer: null,
    chooseLanguage: () => undefined,
    refusal: null,
    sharePercent: startPathsShare(PLUS, plan.paths.length),
    shareDelta: null,
    startReady: true,
    online: true,
    handOver: async () => { throw new Error("NOT_IN_THIS_TEST"); },
    width: plan.width,
    noneReason: null,
    noneLine: null,
    checkedLine: START_FIXTURE_QUESTION,
    fitOwn: async () => null,
    markStale: () => undefined,
    narrowedTo: null,
    lateLists: [],
    lateIdeas: 0,
    justLanded: false,
    keepMyWords: () => null,
    shaped: false
  };
  return (
    <V4StartCard
      start={start}
      widths={PLUS.widths}
      freePlan={plan.freePlan}
      catalog={CATALOG}
      locale="en"
      offerIfCrisis={() => false}
      onMakeMyQuestion={onMakeMyQuestion}
      questionsShown
      quotaLine={null}
      narrow={false}
      share={{ wider: initial.wider === undefined ? startShareChange(PLUS, plan.width, 7) : initial.wider }}
    />
  );
}

/** The page's width for matchMedia (as tests/render/v4-debate-harness.tsx stubs it): a max-width query matches at or under it. */
function stubWidth(width: number): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/u.exec(query)?.[1] ?? "0");
      return { matches: width <= max, media: query, addEventListener: () => undefined, removeEventListener: () => undefined };
    }
  });
}

async function mount(initial: Stage, width = 1280): Promise<HTMLDivElement> {
  stubWidth(width);
  latest = initial.plan;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Holder initial={initial} />));
  return host;
}

/** One part alone (V4StartMore, V4StartWays or V4StartSuggest), for its null cases. */
async function mountPart(node: ReactNode): Promise<HTMLDivElement> {
  stubWidth(1280);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

const ready = (plan: PathPlan = pathPlanFromMenu(NUCLEAR_MENU, 5, false), more: Partial<Stage> = {}): Promise<HTMLDivElement> =>
  mount({ plan, ...more });

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  actions = [];
  latest = null;
  control = null;
  onMakeMyQuestion.mockClear();
});

/** The plan after some actions, through the real model (each must change it). */
function planAfter(start: PathPlan, ...steps: readonly PathPlanAction[]): PathPlan {
  return steps.reduce<PathPlan>((plan, step) => {
    const result = pathPlanReduce(plan, step);
    expect(result.refusal).toBeNull();
    expect(result.plan).not.toBe(plan);
    return result.plan;
  }, start);
}

const card = (): HTMLElement => host!.querySelector<HTMLElement>(".v4StartCard")!;
const rows = (): HTMLElement[] => [...card().querySelectorAll<HTMLElement>(".v4StartRow")];
const row = (key: string): HTMLElement => card().querySelector<HTMLElement>(`.v4StartRow[data-path-key="${key}"]`)!;
const named = (): string[] => rows().filter((one) => one.classList.contains("v4StartRow--named")).map((one) => one.dataset.pathKey ?? "");
const notice = (): string | null => card().querySelector<HTMLElement>(".v4StartNotice p")?.textContent ?? null;
/** The element an element's aria-labelledby names, its words. */
const nameOf = (element: Element): string =>
  (element.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
/** getByRole("dialog", { name }): the one dialog with that name, or null. */
const dialogNamed = (name: string): HTMLElement | null => {
  const found = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((one) => nameOf(one) === name);
  expect(found.length).toBeLessThanOrEqual(1);
  return found[0] ?? null;
};
const drawer = (): HTMLElement | null => dialogNamed("More to explore");
/** Buttons inside `within`, by their visible words. */
const buttonsIn = (within: ParentNode, name: string): HTMLButtonElement[] =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].filter((one) => one.textContent?.trim() === name);
const buttonIn = (within: ParentNode, name: string): HTMLButtonElement => {
  const found = buttonsIn(within, name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};
const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => { element.click(); });
};
const key = async (target: EventTarget, name: string): Promise<void> => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); });
};
const opener = (): HTMLButtonElement => card().querySelector<HTMLButtonElement>(".v4StartMoreOpen")!;
const openDrawer = async (): Promise<HTMLElement> => {
  await press(opener());
  const found = drawer();
  expect(found).not.toBeNull();
  return found!;
};
/** A drawer section by its heading. */
const section = (dialog: HTMLElement, heading: string): HTMLElement | null =>
  [...dialog.querySelectorAll<HTMLElement>(".v4StartMoreSection")].find((one) => one.querySelector(".v4StartMoreSectionTitle")?.textContent === heading) ?? null;
const ideaTitles = (within: ParentNode): string[] =>
  [...within.querySelectorAll<HTMLElement>(".v4StartMoreIdeaTitle")].map((one) => one.textContent ?? "");
/** An idea of a drawer section, by its title. */
const idea = (within: HTMLElement, title: string): HTMLElement =>
  [...within.querySelectorAll<HTMLElement>(".v4StartMoreIdea")].find((one) => one.querySelector(".v4StartMoreIdeaTitle")?.textContent === title)!;
const way = (cardId: string): HTMLElement => card().querySelector<HTMLElement>(`.v4StartWay[data-card-id="${cardId}"]`)!;
const suggestion = (id: string): HTMLElement | null => card().querySelector<HTMLElement>(`.v4StartSuggestion[data-suggestion-id="${id}"]`);
const shownSuggestions = (): string[] => [...card().querySelectorAll<HTMLElement>(".v4StartSuggestion")].map((one) => one.dataset.suggestionId ?? "");
const chipsOf = (element: HTMLElement): string[] => [...element.querySelectorAll<HTMLElement>(".v4StartChip")].map((one) => one.textContent ?? "");
const hover = async (element: Element): Promise<void> => {
  await act(async () => { element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })); });
};
const leave = async (element: Element): Promise<void> => {
  await act(async () => { element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); });
};
const FULL_LINE = "All 5 paths are in use. Add it to a path where it fits, swap it for one of them, or look wider: 7 paths (about 24%, +6%).";

describe("where the parts sit (spec §2 items 4 and 5; row D §4)", () => {
  it("'Another way to see it' and the suggestions come before the first path row; '+ N more to explore' after the list", async () => {
    await ready();
    const ways = [...card().querySelectorAll<HTMLElement>("section")].find((one) => nameOf(one) === "Another way to see it");
    expect(ways).toBeDefined();
    const first = rows()[0]!;
    expect(ways!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(suggestion("sg1")!.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ways!.compareDocumentPosition(suggestion("sg1")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const list = card().querySelector(".v4StartList")!;
    expect(list.compareDocumentPosition(opener()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(opener().textContent).toBe("+ 4 more to explore");
  });

  it("each part is null when it has nothing: no cards, no suggestion, nothing in more", async () => {
    const plan = pathPlanFromMenu(TWO_PATH_MENU, 5, false);
    expect(plan.more).toEqual([]);
    const props = { plan, catalog: CATALOG, locale: "en", dispatch: () => null, onRefusal: () => undefined, share: null, narrow: false };
    await mountPart(
      <>
        <V4StartMore {...props} angles={TWO_PATH_MENU.angles} />
        <V4StartWays {...props} onMakeMyQuestion={() => null} />
        <V4StartSuggest {...props} />
      </>
    );
    expect(host!.innerHTML).toBe("");
  });
});

describe("'+ N more to explore' (spec §2 item 5, choose-f18)", () => {
  it("opens the drawer 'More to explore' with focus inside; Escape closes it and gives focus back to the button", async () => {
    await ready();
    expect(drawer()).toBeNull();
    expect(opener().getAttribute("aria-haspopup")).toBe("dialog");
    expect(opener().getAttribute("aria-expanded")).toBe("false");
    const dialog = await openDrawer();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(opener().getAttribute("aria-expanded")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    // A computer: the panel at the end side, not the sheet.
    expect(dialog.classList.contains("v4StartMore--sheet")).toBe(false);
    await key(document.activeElement!, "Escape");
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it("at 600 px or less: a full-screen sheet with Done, which closes it and gives focus back", async () => {
    await mount({ plan: pathPlanFromMenu(NUCLEAR_MENU, 5, false) }, 375);
    const dialog = await openDrawer();
    expect(dialog.classList.contains("v4StartMore--sheet")).toBe(true);
    await press(buttonIn(dialog, "Done"));
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it("the three sections: 'Most useful first' is all of more (four), 'All, by area' groups it, no direction at width 5", async () => {
    await ready();
    const dialog = await openDrawer();
    expect([...dialog.querySelectorAll(".v4StartMoreSectionTitle")].map((one) => one.textContent)).toEqual(["Most useful first", "All, by area"]);
    expect(ideaTitles(section(dialog, "Most useful first")!)).toEqual(["Falling prices", "Building delays", "Waste for centuries", "Jobs in the regions"]);
    expect(section(dialog, "Other directions")).toBeNull();
    const groups = [...section(dialog, "All, by area")!.querySelectorAll<HTMLElement>(".v4StartMoreGroup")]
      .map((group) => [group.querySelector(".v4StartMoreGroupTitle")?.textContent, ideaTitles(group)]);
    expect(groups).toEqual([
      ["The case against", ["Building delays", "Waste for centuries"]],
      ["Costs to households", ["Falling prices"]],
      ["The wider energy plan", ["Jobs in the regions"]]
    ]);
    // Every idea has its "+ Look into this", and nothing on the drawer says allowance or what would be left.
    expect(buttonsIn(dialog, "+ Look into this")).toHaveLength(8);
    expect(dialog.textContent).not.toMatch(/allowance|left after/iu);
  });

  it("with sixteen paths, 'Most useful first' shows exactly the next ten", async () => {
    const plan = pathPlanFromMenu(SIXTEEN_PATH_MENU, 5, false);
    expect(plan.more).toHaveLength(11);
    await ready(plan, { menu: SIXTEEN_PATH_MENU });
    expect(opener().textContent).toBe("+ 11 more to explore");
    const dialog = await openDrawer();
    expect(ideaTitles(section(dialog, "Most useful first")!)).toEqual(plan.more.slice(0, 10).map((path) => path.title));
  });

  it("width 3: 'Other directions' holds one idea per area no path touches", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 3, false));
    const dialog = await openDrawer();
    expect([...dialog.querySelectorAll(".v4StartMoreSectionTitle")].map((one) => one.textContent))
      .toEqual(["Most useful first", "Other directions", "All, by area"]);
    expect(ideaTitles(section(dialog, "Other directions")!)).toEqual(["Unproven designs and risk", "Using less power first"]);
  });

  it("'Added by you' holds the person's own path when it waits in more", async () => {
    const own = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null, swapWithKey: "kp05" });
    const ownKey = own.paths[4]!.key;
    const plan = planAfter(own, { type: "ADD_FROM_MORE", key: "kp05", intoPathKey: null, swapWithKey: ownKey });
    await ready(plan);
    const dialog = await openDrawer();
    const groups = [...section(dialog, "All, by area")!.querySelectorAll<HTMLElement>(".v4StartMoreGroup")]
      .map((group) => group.querySelector(".v4StartMoreGroupTitle")?.textContent);
    expect(groups).toEqual(["The case against", "Costs to households", "The wider energy plan", "Added by you"]);
    const mine = idea(section(dialog, "All, by area")!, "Fish in the Danube");
    // The person's own words carry no AI mark.
    expect(mine.querySelector("[data-ai-generated]")).toBeNull();
    expect(idea(section(dialog, "All, by area")!, "Falling prices").querySelector(".v4StartMoreIdeaTitle")?.getAttribute("data-ai-generated")).toBe("true");
  });

  it("a late revision's idea is marked new", async () => {
    await ready();
    await act(async () => control!.revise(NUCLEAR_MENU_REV2));
    const dialog = await openDrawer();
    const useful = section(dialog, "Most useful first")!;
    expect(ideaTitles(useful).at(-1)).toBe("Cooling water in hot summers");
    expect(idea(useful, "Cooling water in hot summers").querySelector(".v4StartMoreNew")?.textContent).toBe("new");
    expect(idea(useful, "Falling prices").querySelector(".v4StartMoreNew")).toBeNull();
  });

  it("'+ Look into this' with room adds the idea as a path and says so; the idea leaves the drawer", async () => {
    await ready(planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "REMOVE", key: "kp05" }));
    const dialog = await openDrawer();
    await press(buttonIn(idea(section(dialog, "Most useful first")!, "Building delays"), "+ Look into this"));
    expect(actions.at(-1)).toEqual({ type: "ADD_FROM_MORE", key: "kp07", intoPathKey: null });
    expect(latest!.paths.at(-1)!.title).toBe("Building delays");
    expect(ideaTitles(drawer()!)).not.toContain("Building delays");
    expect(drawer()!.querySelector(".v4StartMoreStatus")?.textContent).toBe("Added as a path ✓");
    expect(drawer()!.contains(document.activeElement)).toBe(true);
  });

  it("on a full list it is never a dead end (choose-f7): PATHS_FULL, then add to a path, swap, or look wider", async () => {
    const full = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    await ready(full);
    let dialog = await openDrawer();
    const jobs = idea(section(dialog, "Most useful first")!, "Jobs in the regions");
    await press(buttonIn(jobs, "+ Look into this"));
    // The model answered PATHS_FULL: nothing changed.
    expect(actions).toEqual([{ type: "ADD_FROM_MORE", key: "kp09", intoPathKey: null }]);
    expect(latest).toBe(full);
    const choice = jobs.querySelector<HTMLElement>(".v4StartFull")!;
    expect(choice.querySelector(".v4StartFullLine")?.textContent).toBe(FULL_LINE);
    expect(["Add to a path…", "Swap for a path…", "Look wider: 7 paths (about 24%, +6%)", "Cancel"]
      .map((name) => buttonsIn(choice, name).length)).toEqual([1, 1, 1, 1]);
    // Look wider: widening brings two ideas up; "Jobs in the regions" takes the last one's place, so the list is exactly seven.
    await press(buttonIn(choice, "Look wider: 7 paths (about 24%, +6%)"));
    expect(actions.slice(1)).toEqual([
      { type: "SET_WIDTH", width: 7 },
      { type: "ADD_FROM_MORE", key: "kp09", intoPathKey: null, swapWithKey: "kp07" }
    ]);
    expect(latest!.width).toBe(7);
    expect(latest!.paths.map((path) => path.title).slice(5)).toEqual(["Falling prices", "Jobs in the regions"]);
    expect(drawer()!.querySelector(".v4StartMoreStatus")?.textContent).toBe("Added as a path ✓");

    // Swap for a path…: in the place of path 5, which goes to the front of more.
    act(() => root?.unmount());
    host?.remove();
    actions = [];
    await ready(full);
    dialog = await openDrawer();
    await press(buttonIn(idea(section(dialog, "Most useful first")!, "Falling prices"), "+ Look into this"));
    const falling = idea(section(drawer()!, "Most useful first")!, "Falling prices");
    await press(buttonIn(falling, "Swap for a path…"));
    await press(buttonIn(falling, "Path 5: Unproven designs and risk"));
    expect(actions.at(-1)).toEqual({ type: "ADD_FROM_MORE", key: "kp06", intoPathKey: null, swapWithKey: "kp05" });
    expect(latest!.paths[4]!.title).toBe("Falling prices");
    expect(latest!.more[0]!.title).toBe("Unproven designs and risk");

    // Add to a path…: its viewpoints into path 1, no extra path.
    await press(buttonIn(idea(section(drawer()!, "Most useful first")!, "Building delays"), "+ Look into this"));
    const delays = idea(section(drawer()!, "Most useful first")!, "Building delays");
    await press(buttonIn(delays, "Add to a path…"));
    await press(buttonIn(delays, "Path 1: Whole-system costs"));
    expect(actions.at(-1)).toEqual({ type: "ADD_FROM_MORE", key: "kp07", intoPathKey: "kp01" });
    expect(latest!.paths[0]!.viewpoints.map((viewpoint) => viewpoint.title)).toEqual(["Whole-system costs", "Building delays"]);
    expect(drawer()!.querySelector(".v4StartMoreStatus")?.textContent).toBe("Added to path 1 ✓");
  });

  it("look wider on the first idea of more: widening alone brings it up", async () => {
    await ready();
    const dialog = await openDrawer();
    const falling = idea(section(dialog, "Most useful first")!, "Falling prices");
    await press(buttonIn(falling, "+ Look into this"));
    await press(buttonIn(falling, "Look wider: 7 paths (about 24%, +6%)"));
    expect(actions.slice(1)).toEqual([{ type: "SET_WIDTH", width: 7 }]);
    expect(latest!.paths.map((path) => path.title)).toContain("Falling prices");
    expect(drawer()!.querySelector(".v4StartMoreStatus")?.textContent).toBe("Added as a path ✓");
  });

  it("Cancel closes the full-list choice and changes nothing", async () => {
    const full = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    await ready(full);
    const dialog = await openDrawer();
    const falling = idea(section(dialog, "Most useful first")!, "Falling prices");
    await press(buttonIn(falling, "+ Look into this"));
    await press(buttonIn(falling, "Cancel"));
    expect(falling.querySelector(".v4StartFull")).toBeNull();
    expect(latest).toBe(full);
  });
});

describe("'Another way to see it' (spec §2 item 4; read-d3, choose-d2)", () => {
  it("each card says its kind and the AI's sentence, and offers what fits it", async () => {
    await ready();
    expect(way("cd1").querySelector(".v4StartWayKind")?.textContent).toBe("A choice you may not have weighed");
    expect(way("cd1").querySelector(".v4StartWaySentence")?.textContent)
      .toBe("Keep the reactors Romania already has running longer; it is often far cheaper than building new ones.");
    expect(way("cd1").querySelector(".v4StartWaySentence")?.getAttribute("data-ai-generated")).toBe("true");
    expect(way("cd2").querySelector(".v4StartWayKind")?.textContent).toBe("What would change the answer");
    // cd1 fits no path: "+ Look into this" and, with a question of its own, "Make this my question".
    expect([...way("cd1").querySelectorAll("button")].map((one) => one.textContent)).toEqual(["+ Look into this", "Make this my question"]);
    // cd2 fits path 1, and has no question of its own.
    expect([...way("cd2").querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Add to path 1, no extra path", "Add as its own path"]);
  });

  it("the four kinds' words", () => {
    expect(["CHOICE_NOT_WEIGHED", "EITHER_OR", "WHAT_WOULD_CHANGE_IT", "OTHER_READING"].map((kind) => CATALOG[`v4.start.ways.kind.${kind}`])).toEqual([
      "A choice you may not have weighed", "It may not be either-or", "What would change the answer", "Another reading of your question"
    ]);
  });

  it("cd2 'Add to path 1, no extra path' → 'Added to path 1 ✓'; Undo brings the buttons back", async () => {
    await ready();
    await press(buttonIn(way("cd2"), "Add to path 1, no extra path"));
    expect(actions).toEqual([{ type: "USE_CARD", cardId: "cd2", intoPathKey: "kp01" }]);
    expect(chipsOf(rows()[0]!)).toEqual(["Whole-system costs", "Cheaper storage"]);
    const added = way("cd2").querySelector<HTMLElement>(".v4StartWayAdded")!;
    expect(added.textContent).toBe("Added to path 1 ✓");
    expect(document.activeElement).toBe(added);
    expect(way("cd2").querySelectorAll("button")).toHaveLength(0);
    await press(buttonIn(card(), "Undo"));
    expect(way("cd2").querySelector(".v4StartWayAdded")).toBeNull();
    expect(buttonsIn(way("cd2"), "Add as its own path")).toHaveLength(1);
  });

  it("'Add as its own path' with room → 'Added as a path ✓'", async () => {
    await ready(planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "REMOVE", key: "kp05" }));
    await press(buttonIn(way("cd2"), "Add as its own path"));
    expect(actions).toEqual([{ type: "USE_CARD", cardId: "cd2", intoPathKey: null }]);
    expect(latest!.paths.at(-1)!.title).toBe("Cheaper storage");
    expect(way("cd2").querySelector(".v4StartWayAdded")?.textContent).toBe("Added as a path ✓");
  });

  it("'+ Look into this' on a full list offers the full-list choice under the card", async () => {
    const full = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    await ready(full);
    await press(buttonIn(way("cd1"), "+ Look into this"));
    expect(actions).toEqual([{ type: "USE_CARD", cardId: "cd1", intoPathKey: null }]);
    expect(latest).toBe(full);
    expect(way("cd1").querySelector(".v4StartFullLine")?.textContent).toBe(FULL_LINE);
    await press(buttonIn(way("cd1"), "Add to a path…"));
    await press(buttonIn(way("cd1"), "Path 3: Security and weapons risks"));
    expect(actions.at(-1)).toEqual({ type: "USE_CARD", cardId: "cd1", intoPathKey: "kp03" });
    expect(way("cd1").querySelector(".v4StartWayAdded")?.textContent).toBe("Added to path 3 ✓");
    expect(way("cd1").querySelector(".v4StartFull")).toBeNull();
  });

  it("cd1 'Make this my question': the model keeps the words read at Next as path 1, the page puts the card's question in the box", async () => {
    await ready();
    await press(buttonIn(way("cd1"), "Make this my question"));
    expect(actions).toEqual([{ type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: START_FIXTURE_QUESTION }]);
    expect(onMakeMyQuestion).toHaveBeenCalledTimes(1);
    expect(onMakeMyQuestion).toHaveBeenCalledWith("cd1");
    expect(latest!.questionSwap?.cardId).toBe("cd1");
    expect(latest!.paths[0]!.question).toBe(START_FIXTURE_QUESTION);
    expect(way("cd1").querySelector(".v4StartWaySwapped")?.textContent)
      .toBe("Your question is now this one. Your earlier question is kept as path 1.");
    expect(buttonsIn(way("cd1"), "Make this my question")).toEqual([]);
    // The list was full: the bottom path the AI wrote made room.
    expect(notice()).toBe("“Unproven designs and risk” moved to more to explore, to make room.");
    await press(buttonIn(card(), "Undo"));
    expect(way("cd1").querySelector(".v4StartWaySwapped")).toBeNull();
    expect(buttonsIn(way("cd1"), "Make this my question")).toHaveLength(1);
  });

  it("'Make this my question' with no path that can make room says so, and the page's box is left alone", async () => {
    const mine = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 3, true),
      { type: "REWRITE", key: "kp01", question: "My own question one?" },
      { type: "REWRITE", key: "kp02", question: "My own question two?" },
      { type: "REWRITE", key: "kp03", question: "My own question three?" });
    await ready(mine, { wider: null });
    await press(buttonIn(way("cd1"), "Make this my question"));
    expect(actions).toEqual([{ type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: START_FIXTURE_QUESTION }]);
    expect(latest).toBe(mine);
    expect(onMakeMyQuestion).not.toHaveBeenCalled();
    expect(way("cd1").querySelector(".v4StartWayNoRoom")?.textContent)
      .toBe("Your earlier question needs a place on the list. Remove or combine a path first.");
  });

  it("is a row of cards that snap on a phone (CSS)", () => {
    expect(CSS).toMatch(/\.v4StartWays\s*\{[^}]*scroll-snap-type:\s*inline mandatory/u);
    expect(CSS).toContain(".v4StartWay { flex: 1 1 0; min-width: 0;");
    expect(CSS).toContain("@media (max-width: 600px) { .v4StartWay { flex: 0 0 85%; } }");
  });
});

/*
 * Keyboard audit 2026-11-12 (V4A-7, V4A-8): a press whose button goes away puts the focus on what took its place: the swapped
 * line after "Make this my question", "Path 1" after "Add to a path…" / "Swap for a path…", and the button that opened the
 * full-list choice after its Cancel. Inside the More drawer the focus never leaves it.
 */
describe("focus after the cards' and the drawer's presses (V4A-7, V4A-8)", () => {
  it("'Make this my question' puts the focus on the line that says the question is now this one", async () => {
    await ready();
    const mine = buttonIn(way("cd1"), "Make this my question");
    await act(async () => { mine.focus(); });
    await press(mine);
    const swapped = way("cd1").querySelector<HTMLElement>(".v4StartWaySwapped")!;
    expect(swapped.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(swapped);
  });

  it("on a card: 'Add to a path…' and 'Swap for a path…' focus Path 1; Cancel focuses the button that opened the choice", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 5, false));
    const look = buttonIn(way("cd1"), "+ Look into this");
    await act(async () => { look.focus(); });
    await press(look);
    await press(buttonIn(way("cd1"), "Add to a path…"));
    expect(document.activeElement).toBe(buttonIn(way("cd1"), "Path 1: Whole-system costs"));
    await press(buttonIn(way("cd1"), "Cancel"));
    expect(way("cd1").querySelector(".v4StartFull")).toBeNull();
    expect(document.activeElement).toBe(look);
    await press(look);
    await press(buttonIn(way("cd1"), "Swap for a path…"));
    expect(document.activeElement).toBe(buttonIn(way("cd1"), "Path 1: Whole-system costs"));
  });

  it("in the drawer: Path 1 after 'Add to a path…', the idea's '+ Look into this' after Cancel, and Tab stays inside", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 5, false));
    const dialog = await openDrawer();
    const falling = idea(section(dialog, "Most useful first")!, "Falling prices");
    const look = buttonIn(falling, "+ Look into this");
    await act(async () => { look.focus(); });
    await press(look);
    await press(buttonIn(falling, "Add to a path…"));
    expect(document.activeElement).toBe(buttonIn(falling, "Path 1: Whole-system costs"));
    expect(drawer()!.contains(document.activeElement)).toBe(true);
    await press(buttonIn(falling, "Cancel"));
    expect(document.activeElement).toBe(look);
    await key(document.activeElement!, "Tab");
    expect(drawer()!.contains(document.activeElement)).toBe(true);
  });
});

/*
 * Keyboard audit 2026-11-12 (V4A-20): on a phone each card takes 85% of the row, so two or more cards always run past the
 * screen, and a card already added with no question of its own has no button: the row itself is a Tab stop there, named by
 * its heading, so the arrow keys can scroll it. On a computer the cards shrink to fit and the row is no Tab stop.
 */
describe("the cards' row scrolls from the keyboard on a phone (V4A-20)", () => {
  const ways = (narrow: boolean): Promise<HTMLDivElement> => {
    const plan = planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "USE_CARD", cardId: "cd2", intoPathKey: "kp01" });
    const props = { plan, catalog: CATALOG, locale: "en", dispatch: () => null, onRefusal: () => undefined, share: null, narrow };
    return mountPart(<V4StartWays {...props} onMakeMyQuestion={() => null} />);
  };

  it("phone: the row is a Tab stop named 'Another way to see it'; the added card in it has no button of its own", async () => {
    await ways(true);
    const strip = host!.querySelector<HTMLElement>(".v4StartWays")!;
    expect(strip.getAttribute("tabindex")).toBe("0");
    expect(nameOf(strip)).toBe("Another way to see it");
    expect(host!.querySelector('.v4StartWay[data-card-id="cd2"] button')).toBeNull();
  });

  it("computer: no Tab stop on the row", async () => {
    await ways(false);
    expect(host!.querySelector(".v4StartWays")!.hasAttribute("tabindex")).toBe(false);
  });
});

describe("the one-tap suggestions (spec §2 item 5; choose-f6)", () => {
  it("say the two sentences, at most two at a time", async () => {
    await ready();
    expect(shownSuggestions()).toEqual(["sg1", "sg2"]);
    expect(suggestion("sg1")!.querySelector(".v4StartSuggestionLine")?.textContent).toBe(
      "“Keeping the lights on in a calm winter week” and “Using less power first”: Both ask how to get through the hardest weeks. Combine them? It frees a path."
    );
    expect([...suggestion("sg1")!.querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Combine", "Keep apart"]);
    expect(suggestion("sg2")!.querySelector(".v4StartSuggestionLine")?.textContent).toBe("“Falling prices” fits path 1. Add it there, no extra path.");
    expect([...suggestion("sg2")!.querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Add to path 1", "Not now"]);
    // The AIs' words are marked as AI text.
    expect([...suggestion("sg1")!.querySelectorAll("[data-ai-generated='true']")].map((one) => one.textContent)).toEqual([
      "Keeping the lights on in a calm winter week", "Using less power first", "Both ask how to get through the hardest weeks."
    ]);
  });

  it("hovering or focusing one outlines both paths it names; leaving and blur take the outline away", async () => {
    await ready();
    expect(named()).toEqual([]);
    await hover(suggestion("sg1")!);
    expect(named()).toEqual(["kp02", "kp04"]);
    await leave(suggestion("sg1")!);
    expect(named()).toEqual([]);
    await act(async () => { buttonIn(suggestion("sg1")!, "Combine").focus(); });
    expect(named()).toEqual(["kp02", "kp04"]);
    // Focus moving inside the suggestion keeps the outline.
    await act(async () => { buttonIn(suggestion("sg1")!, "Keep apart").focus(); });
    expect(named()).toEqual(["kp02", "kp04"]);
    await act(async () => { buttonIn(suggestion("sg1")!, "Keep apart").blur(); });
    expect(named()).toEqual([]);
    // "fits path 1" names path 1 on the list (its idea waits in more).
    await hover(suggestion("sg2")!);
    expect(named()).toEqual(["kp01"]);
  });

  it("Keep apart: the next suggestion shows (sg3), nothing changes on the list, and the outline goes with it", async () => {
    await ready();
    await act(async () => { buttonIn(suggestion("sg1")!, "Keep apart").focus(); });
    await press(buttonIn(suggestion("sg1")!, "Keep apart"));
    expect(actions).toEqual([{ type: "DISMISS_SUGGESTION", suggestionId: "sg1" }]);
    expect(shownSuggestions()).toEqual(["sg2", "sg3"]);
    expect(suggestion("sg3")!.querySelector(".v4StartSuggestionLine")?.textContent).toBe("“Building delays” fits path 5. Add it there, no extra path.");
    expect(named()).toEqual([]);
    expect(rows()).toHaveLength(5);
    // Focus stays among the suggestions.
    expect(card().querySelector(".v4StartSuggest")!.contains(document.activeElement)).toBe(true);
  });

  it("Add to path 1 adds the chip; Not now dismisses; Combine puts the two paths together", async () => {
    await ready();
    await press(buttonIn(suggestion("sg2")!, "Add to path 1"));
    expect(actions).toEqual([{ type: "APPLY_SUGGESTION", suggestionId: "sg2" }]);
    expect(chipsOf(rows()[0]!)).toEqual(["Whole-system costs", "Falling prices"]);
    expect(shownSuggestions()).toEqual(["sg1", "sg3"]);
    await press(buttonIn(suggestion("sg3")!, "Not now"));
    expect(actions.at(-1)).toEqual({ type: "DISMISS_SUGGESTION", suggestionId: "sg3" });
    expect(shownSuggestions()).toEqual(["sg1"]);
    await press(buttonIn(suggestion("sg1")!, "Combine"));
    expect(actions.at(-1)).toEqual({ type: "APPLY_SUGGESTION", suggestionId: "sg1" });
    expect(rows()).toHaveLength(4);
    expect(chipsOf(rows()[1]!)).toEqual(["A calm winter week", "Using less power first"]);
    expect(card().querySelector(".v4StartSuggest")).toBeNull();
    expect(row("kp02")).toBeNull();
  });

  it("their words name no allowance, nothing left, no price", () => {
    const keys = Object.keys(CATALOG).filter((key) => /^v4\.start\.(?:more|ways|suggest|added|lookInto)\b/u.test(key));
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((key) => /allowance|left after|\$|€/iu.test(CATALOG[key]!))).toEqual([]);
  });
});

describe("the CSS (Task 77's rules, ahead of time)", () => {
  const at = CSS.indexOf("/* ---- V4 start step — P3: more to explore, another way to see it, suggestions (Task 74");
  const block = at < 0 ? "" : CSS.slice(at);
  const end = block.indexOf("/* ---- ", 10);
  const own = (end < 0 ? block : block.slice(0, end)).replace(/\/\*[\s\S]*?\*\//gu, "");

  it("holds the drawer's phone rule word for word: a full-screen sheet at 600 px or less", () => {
    expect(own).toContain("@media (max-width: 600px) { .v4StartMore { inset: 0; width: 100%; } }");
    expect(own).toMatch(/\.v4StartRow--named\s*\{/u);
  });

  it("logical properties only, no px value above 44 outside the media queries, nothing dashed", () => {
    expect(own.length).toBeGreaterThan(100);
    expect(own).not.toMatch(/(?:^|[\s;{])(?:left|right|margin-left|margin-right|padding-left|padding-right)\s*:/mu);
    expect(own).not.toMatch(/text-align:\s*(?:left|right)|float:|dashed/u);
    const px = [...own.replace(/@media\s*\([^)]*\)/gu, "").matchAll(/(\d+(?:\.\d+)?)px/gu)].map((match) => Number(match[1]));
    expect(px.filter((value) => value > 44)).toEqual([]);
  });
});
