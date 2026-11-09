// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { V4StartBar, type StartBarState } from "../../apps/ui/components/v4/V4StartBar.js";
import { boxLine, boxOf, boxPlace } from "../../apps/ui/lib/v4/questionBox.js";
import { pathPlanFromMenu } from "../../apps/ui/lib/v4/pathPlan.js";
import type { DigMode, ReadingLevel } from "../../apps/ui/lib/v4/types.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 75 (read-d5, choose-f16, read-f9, choose-f14, read-f24, choose-d5, choose-f4, choose-f10, r2-2, r2-3,
 * the 2-second request, owner answers Q9 and Q10; 4 Nov night: ask-d2, ask-f3, read-f17): step 2's bottom bar. It says what
 * the person gets (never the answers again), one share line whose number rolls with its grey change for 2 seconds, How wide,
 * Quick look / Thorough (never on Free), a Start that waits for the paths, "Just answer it" under it, the carry-on box once it
 * is built, and on a phone two pinned lines with an Options sheet. It steps aside for the keyboard and for the cookie bar.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const NOTICE = "Made-up public notice.";

type Props = Parameters<typeof V4StartBar>[0];

const calls = {
  onWidth: vi.fn((_width: number) => undefined),
  onMode: vi.fn((_mode: DigMode) => undefined),
  onStart: vi.fn(() => undefined),
  onJust: vi.fn(() => undefined),
  onCarryOn: vi.fn((_value: boolean) => undefined),
  onReadyNote: vi.fn(() => undefined)
};

function props(over: Partial<Props> = {}): Props {
  return {
    catalog: CATALOG,
    locale: "en",
    freePlan: false,
    level: "plain" as ReadingLevel,
    widths: { options: [3, 5, 7], default: 5 },
    width: 5,
    onWidth: calls.onWidth,
    mode: "quick" as DigMode,
    onMode: calls.onMode,
    pathCount: 5,
    sharePercent: 18,
    shareDelta: null,
    state: "READY" as StartBarState,
    onStart: calls.onStart,
    justAnswer: { shown: true, ready: true, onPress: calls.onJust },
    carryOnOffered: false,
    carryOn: false,
    onCarryOn: calls.onCarryOn,
    readyNote: false,
    onReadyNote: calls.onReadyNote,
    publicNotice: null,
    above: null,
    combineLine: null,
    narrow: false,
    textFocused: false,
    helpFirst: false,
    ...over
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let reducedMotion = false;

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

async function mount(given: Props): Promise<HTMLDivElement> {
  stubMotion();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<V4StartBar {...given} />));
  return host;
}

async function rerender(given: Props): Promise<void> {
  await act(async () => root!.render(<V4StartBar {...given} />));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  reducedMotion = false;
  vi.useRealTimers();
  for (const call of Object.values(calls)) call.mockClear();
});

const text = (): string => host!.textContent ?? "";
const bar = (): HTMLElement => host!.querySelector<HTMLElement>(".v4StartBar")!;
const buttons = (within: ParentNode = host!): HTMLButtonElement[] => [...within.querySelectorAll("button")];
const buttonNamed = (name: string, within: ParentNode = host!): HTMLButtonElement | undefined =>
  buttons(within).find((one) => one.textContent?.trim() === name);
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const justLink = (within: ParentNode = host!): HTMLButtonElement | undefined => buttonNamed(CATALOG["v4.ask.justAnswer"]!, within);
const follows = (first: Node, second: Node): boolean => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => { element.click(); });
};
const sheet = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');
const accessibleName = (element: HTMLElement): string => element.getAttribute("aria-label")
  ?? (element.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
const optionsButton = (): HTMLButtonElement | undefined => buttons().find((one) => one.textContent?.trim().startsWith(CATALOG["v4.start.options"]!));

describe("You'll get: what the person gets, never the answers again", () => {
  it("a plain answer from the paths, an answer at Expert, one path, and R22's line without the card", async () => {
    await mount(props());
    expect(text()).toContain("You'll get: a plain answer from 5 paths.");
    await rerender(props({ level: "expert" }));
    expect(text()).toContain("You'll get: an answer from 5 paths.");
    await rerender(props({ pathCount: 1 }));
    expect(text()).toContain("You'll get: a plain answer from 1 path.");
    await rerender(props({ pathCount: null }));
    expect(text()).toContain("You'll get: a plain answer and a map of what holds up");
  });

  it("names no answer the box holds (r2-3)", async () => {
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const box = boxPlace(boxOf(START_FIXTURE_QUESTION), { key: "Over what time?", text: "Over what time? To 2050." }, ["Over what time?"]);
    expect(boxLine(box)).toContain("To 2050.");
    await mount(props({ pathCount: plan.paths.length }));
    expect(text()).toContain("You'll get: a plain answer from 5 paths.");
    expect(text()).not.toContain("2050");
    expect(text()).not.toContain("Over what time?");
  });
});

describe("one share line, its roll and its grey change", () => {
  it("about 18% of today; Free: about 16% of this month", async () => {
    await mount(props());
    expect(text()).toContain("about 18% of today");
    await rerender(props({ freePlan: true, sharePercent: 16, widths: { options: [3], default: 3 }, width: 3, pathCount: 3 }));
    expect(text()).toContain("about 16% of this month");
    expect(text()).not.toContain("of today");
  });

  it("the change shows '+4%' in grey for 2 seconds, then goes", async () => {
    vi.useFakeTimers();
    await mount(props({ sharePercent: 22, shareDelta: 4 }));
    expect(text()).toContain("+4%");
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(text()).not.toContain("+4%");
    expect(text()).toContain("about 22% of today");
  });

  it("the number rolls to its new value, and never rolls with reduced motion", async () => {
    await mount(props());
    expect(host!.querySelector(".v4StartRoll")).toBeNull();
    await rerender(props({ sharePercent: 22, shareDelta: 4 }));
    expect(host!.querySelector(".v4StartRoll")?.textContent).toBe("22");
    act(() => root?.unmount());
    host?.remove();
    reducedMotion = true;
    await mount(props());
    await rerender(props({ sharePercent: 22, shareDelta: 4 }));
    expect(host!.querySelector(".v4StartRoll")).toBeNull();
    expect(text()).toContain("about 22% of today");
  });
});

describe("How wide and Quick look / Thorough", () => {
  it("one button per width with aria-pressed, and a press says the width", async () => {
    await mount(props());
    const group = host!.querySelector('[role="group"][aria-label="How wide"]')!;
    expect(buttons(group).map((one) => [one.textContent, one.getAttribute("aria-pressed")]))
      .toEqual([["3 paths", "false"], ["5 paths", "true"], ["7 paths", "false"]]);
    await press(buttonNamed("7 paths", group)!);
    expect(calls.onWidth).toHaveBeenCalledWith(7);
  });

  it("no How wide with one option", async () => {
    await mount(props({ widths: { options: [3], default: 3 }, width: 3, pathCount: 3 }));
    expect(host!.querySelector('[aria-label="How wide"]')).toBeNull();
  });

  it("the mode switch on paid plans", async () => {
    await mount(props());
    await press(buttonNamed("Thorough")!);
    expect(calls.onMode).toHaveBeenCalledWith("thorough");
  });

  it("Free: no width, no mode, the month's share", async () => {
    await mount(props({ freePlan: true, widths: { options: [3, 5], default: 3 }, width: 3, pathCount: 3, sharePercent: 16 }));
    expect(host!.querySelector('[aria-label="How wide"]')).toBeNull();
    expect(buttonNamed("Quick look")).toBeUndefined();
    expect(buttonNamed("Thorough")).toBeUndefined();
    expect(text()).toContain("about 16% of this month");
  });
});

describe("Start waits for the paths", () => {
  it("PATHS_COMING: a disabled 'Paths coming…'", async () => {
    await mount(props({ state: "PATHS_COMING" }));
    expect(startButton().textContent).toBe("Paths coming…");
    expect(startButton().disabled).toBe(true);
    await press(startButton());
    expect(calls.onStart).not.toHaveBeenCalled();
  });

  it("READY: 'Start investigating' presses Start", async () => {
    await mount(props());
    expect(startButton().textContent).toBe("Start investigating");
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(calls.onStart).toHaveBeenCalledTimes(1);
  });

  it("every other state's words, each one disabled", async () => {
    const seen: Array<[string, string | null, boolean]> = [];
    await mount(props());
    for (const state of ["WRITING_WAIT", "PENDING", "SENDING", "OFFLINE", "BLOCKED"] as const) {
      await rerender(props({ state }));
      seen.push([state, startButton().textContent, startButton().disabled]);
    }
    expect(seen).toEqual([
      ["WRITING_WAIT", "Starting once the combined question is written", true],
      ["PENDING", "Start investigating", true],
      ["SENDING", "Starting…", true],
      ["OFFLINE", "Start investigating", true],
      ["BLOCKED", "Start investigating", true]
    ]);
  });

  it("ask-f3: crisis words keep Start and the link pressable before the paths, with their READY words", async () => {
    await mount(props({ state: "PATHS_COMING", helpFirst: true, justAnswer: { shown: true, ready: false, onPress: calls.onJust } }));
    expect(startButton().textContent).toBe("Start investigating");
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(calls.onStart).toHaveBeenCalledTimes(1);
    const link = justLink()!;
    expect(link.getAttribute("aria-disabled")).not.toBe("true");
    await press(link);
    expect(calls.onJust).toHaveBeenCalledTimes(1);
  });
});

describe("'Just answer it' under Start (answers Q9, Q10)", () => {
  it("sits after Start and presses its own action", async () => {
    await mount(props());
    const link = justLink()!;
    expect(follows(startButton(), link)).toBe(true);
    await press(link);
    expect(calls.onJust).toHaveBeenCalledTimes(1);
    expect(calls.onStart).not.toHaveBeenCalled();
  });

  it("is gone after the first change (shown false)", async () => {
    await mount(props({ justAnswer: { shown: false, ready: true, onPress: calls.onJust } }));
    expect(justLink()).toBeUndefined();
  });

  it("before the list: greyed like Start, described by its 'Paths coming…', and pressing it does nothing", async () => {
    await mount(props({ state: "PATHS_COMING", justAnswer: { shown: true, ready: false, onPress: calls.onJust } }));
    const link = justLink()!;
    expect(link.getAttribute("aria-disabled")).toBe("true");
    const described = (link.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "");
    expect(described).toContain("Paths coming…");
    await press(link);
    expect(calls.onJust).not.toHaveBeenCalled();
  });
});

describe("the carry-on box and the ready note", () => {
  it("no carry-on box unless it is offered; offered, its tick says so", async () => {
    await mount(props());
    expect(host!.querySelector('input[type="checkbox"]')).toBeNull();
    expect(text()).not.toContain("carry on");
    await rerender(props({ carryOnOffered: true }));
    const box = host!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.labels?.[0]?.textContent).toBe("Let the AIs carry on to the report without asking me");
    await press(box);
    expect(calls.onCarryOn).toHaveBeenCalledWith(true);
  });

  it("'Your paths are ready ↓' is a button that takes the person to path 1", async () => {
    await mount(props());
    expect(buttonNamed("Your paths are ready ↓")).toBeUndefined();
    await rerender(props({ readyNote: true }));
    await press(buttonNamed("Your paths are ready ↓")!);
    expect(calls.onReadyNote).toHaveBeenCalledTimes(1);
  });
});

describe("the public notice, the lines above, the keyboard and the cookie bar", () => {
  it("the public notice comes before Start on both layouts", async () => {
    await mount(props({ freePlan: true, publicNotice: <p className="made-up-notice">{NOTICE}</p> }));
    expect(follows(host!.querySelector(".made-up-notice")!, startButton())).toBe(true);
    await rerender(props({ freePlan: true, narrow: true, publicNotice: <p className="made-up-notice">{NOTICE}</p> }));
    expect(follows(host!.querySelector(".made-up-notice")!, startButton())).toBe(true);
  });

  it("the lines above sit before the bar, outside its sticky box (read-f9)", async () => {
    const above: ReactNode = <p className="made-up-above">Made-up room line.</p>;
    await mount(props({ above }));
    const line = host!.querySelector(".made-up-above")!;
    expect(bar().contains(line)).toBe(false);
    expect(follows(line, bar())).toBe(true);
    await rerender(props({ above, narrow: true }));
    expect(bar().contains(host!.querySelector(".made-up-above"))).toBe(false);
  });

  it("a focused text box puts the bar in the page (read-f9), and the CSS says so", async () => {
    await mount(props({ textFocused: true }));
    expect(bar().classList.contains("v4StartBar--aside")).toBe(true);
    await rerender(props({ textFocused: false }));
    expect(bar().classList.contains("v4StartBar--aside")).toBe(false);
    expect(CSS).toMatch(/\.v4StartBar--aside\s*\{[^}]*position:\s*static;/u);
    expect(CSS).toMatch(/\.v4StartBar\s*\{[^}]*position:\s*sticky;/u);
  });

  it("ask-d2: the cookie bar puts the new bar in the page too", () => {
    expect(CSS).toMatch(/\.appShell:has\(\.consentBar\) \.v4StartBar \{ position: static; \}/u);
  });
});

describe("on a phone: two pinned lines and the Options sheet (read-d5, choose-f16)", () => {
  it("the pinned element holds line 1 and Start, nothing else", async () => {
    await mount(props({ narrow: true, carryOnOffered: true }));
    expect(bar().children).toHaveLength(2);
    expect(bar().children[1]!.contains(startButton())).toBe(true);
    expect(bar().children[0]!.textContent).toContain("5 paths · Quick look · about 18% of today");
    expect(justLink()).toBeUndefined();
    expect(text()).not.toContain("You'll get");
  });

  it("Free's line 1 has no mode word", async () => {
    await mount(props({ narrow: true, freePlan: true, widths: { options: [3], default: 3 }, width: 3, pathCount: 3, sharePercent: 16 }));
    expect(host!.querySelector(".v4StartBarLineText")!.textContent).toBe("3 paths · about 16% of this month");
  });

  it("Options opens a sheet with what the computer's bar holds; Done closes it and focus goes back to Options", async () => {
    await mount(props({ narrow: true, carryOnOffered: true }));
    expect(sheet()).toBeNull();
    await act(async () => { optionsButton()!.focus(); });
    await press(optionsButton()!);
    const open = sheet()!;
    expect(accessibleName(open)).toBe("Options");
    expect(open.textContent).toContain("You'll get: a plain answer from 5 paths.");
    expect(open.querySelector('[aria-label="How wide"]')).not.toBeNull();
    expect(buttonNamed("Thorough", open)).toBeDefined();
    expect(open.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(justLink(open)).toBeDefined();
    expect(open.classList.contains("v4Highlight")).toBe(true);
    await press(buttonNamed("Done", open)!);
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(optionsButton());
  });

  it("the combine line sits above a slimmer Start bar", async () => {
    await mount(props({ narrow: true, combineLine: <p className="made-up-combine">Made-up combine line.</p> }));
    expect(bar().classList.contains("v4StartBar--slim")).toBe(true);
    const line = host!.querySelector(".made-up-combine")!;
    expect(bar().contains(line)).toBe(true);
    expect(follows(line, startButton())).toBe(true);
  });
});

describe("words the bar never says (r2-2, chat answers)", () => {
  it("no allowance, nothing left, no 'Let the AIs choose', no 'Starting as soon as'", async () => {
    const seen: string[] = [];
    await mount(props({ carryOnOffered: true, readyNote: true, shareDelta: -2 }));
    seen.push(text());
    for (const state of ["PATHS_COMING", "WRITING_WAIT", "PENDING", "SENDING", "OFFLINE", "BLOCKED"] as const) {
      await rerender(props({ state, carryOnOffered: true }));
      seen.push(text());
    }
    await rerender(props({ narrow: true, carryOnOffered: true }));
    await press(optionsButton()!);
    seen.push(document.body.textContent ?? "");
    expect(seen.filter((words) => /allowance|left after|let the ais choose|starting as soon as/iu.test(words))).toEqual([]);
  });
});

/*
 * V4 start step, Task 75b (ask-d2 A "Steps aside", journey-d3 A, r2-4, ask-f3, ask-f8): step 1 draws Next through the same
 * bar (job NEXT). On a phone one pinned element holds the Free notice, Next, "Just answer it" and the grey line; the lines
 * above (the share, the room notice, the refusal) and a declined consent's line sit right before it. On a computer the same
 * pieces are one plain row, the declined line right under Next, and the lines above come after the row.
 */
describe("job NEXT: step 1's Next in the same bar (Task 75b)", () => {
  const onNext = vi.fn(() => undefined);
  const QUOTA = "Reading your question uses a little of your quota.";
  function nextProps(over: Record<string, unknown> = {}): Parameters<typeof V4StartBar>[0] {
    return {
      job: "NEXT",
      catalog: CATALOG,
      locale: "en",
      freePlan: false,
      next: { label: "Next", disabled: false, busy: false, onPress: onNext },
      justAnswer: { shown: true, ready: true, onPress: calls.onJust },
      declined: null,
      under: <p className="made-up-under">{QUOTA}</p>,
      publicNotice: null,
      above: <p className="made-up-above">Made-up room line.</p>,
      narrow: false,
      textFocused: false,
      helpFirst: false,
      ...over
    } as Parameters<typeof V4StartBar>[0];
  }
  const nextButton = (): HTMLButtonElement => buttonNamed("Next")!;

  afterEach(() => onNext.mockClear());

  it("phone: one pinned element holds Next, the link and the grey line, in that order; the lines above sit before it", async () => {
    await mount(nextProps({ narrow: true }));
    expect([...bar().children].map((child) => child.textContent)).toEqual(["Next", CATALOG["v4.ask.justAnswer"], QUOTA]);
    const above = host!.querySelector(".made-up-above")!;
    expect(bar().contains(above)).toBe(false);
    expect(follows(above, bar())).toBe(true);
    expect(text()).not.toContain("You'll get");
    expect(text()).not.toContain(CATALOG["v4.start.options"]);
    await press(nextButton());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("phone, Free: the public notice comes first inside it; a declined consent's line sits right before it, outside", async () => {
    const declined = <p className="made-up-declined">Made-up declined line.</p>;
    await mount(nextProps({ narrow: true, freePlan: true, publicNotice: <p className="made-up-notice">{NOTICE}</p>, declined }));
    expect(bar().children[0]!.classList.contains("made-up-notice")).toBe(true);
    const line = host!.querySelector(".made-up-declined")!;
    expect(bar().contains(line)).toBe(false);
    expect(line.nextElementSibling).toBe(bar());
  });

  it("the keyboard puts it in the page", async () => {
    await mount(nextProps({ narrow: true, textFocused: true }));
    expect(bar().classList.contains("v4StartBar--aside")).toBe(true);
  });

  it("computer: one plain row, the declined line right under Next and before the link, the lines above after the row", async () => {
    const declined = <p className="made-up-declined">Made-up declined line.</p>;
    await mount(nextProps({ declined }));
    expect(bar().classList.contains("v4StartBar--next")).toBe(true);
    const line = host!.querySelector(".made-up-declined")!;
    expect(bar().contains(line)).toBe(true);
    expect(follows(nextButton(), line)).toBe(true);
    expect(follows(line, justLink()!)).toBe(true);
    expect(follows(bar(), host!.querySelector(".made-up-above")!)).toBe(true);
    expect(CSS).toMatch(/\.v4StartBar--next\s*\{[^}]*position:\s*static;/u);
  });

  it("a greyed Next and link do nothing; crisis words keep both pressable (ask-f3)", async () => {
    await mount(nextProps({ next: { label: "Next", disabled: true, busy: false, onPress: onNext }, justAnswer: { shown: true, ready: false, onPress: calls.onJust } }));
    expect(nextButton().disabled).toBe(true);
    expect(justLink()!.disabled).toBe(true);
    await rerender(nextProps({ helpFirst: true, next: { label: "Next", disabled: true, busy: false, onPress: onNext }, justAnswer: { shown: true, ready: false, onPress: calls.onJust } }));
    expect(nextButton().disabled).toBe(false);
    await press(nextButton());
    expect(onNext).toHaveBeenCalledTimes(1);
    await press(justLink()!);
    expect(calls.onJust).toHaveBeenCalledTimes(1);
  });
});
