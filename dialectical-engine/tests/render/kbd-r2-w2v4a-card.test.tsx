// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";
import { StartStepRoomSchema, type StartMenu, type StartStepRoom } from "../../packages/contract/src/index.js";

import {
  V4StartAnswersFold, V4StartCard, startNoneLineKey, startRefusalLine, startWiderWidth
} from "../../apps/ui/components/v4/V4StartCard.js";
import { startPathsShare, startShareChange, type MoneyLine } from "../../apps/ui/lib/v4/money.js";
import {
  PATH_PLAN_LIMITS, pathPlanFromMenu, pathPlanReduce, pathPlanWithRevision, type PathPlan, type PathPlanAction
} from "../../apps/ui/lib/v4/pathPlan.js";
import type { StartCardPhase, StartNoneLine, V4StartCardState } from "../../apps/ui/lib/v4/useStartPaths.js";
import { NUCLEAR_MENU, NUCLEAR_MENU_REV2, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedMenu } from "../support/v4-start-menu.js";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-6, V4A-9, V4A-10): the choosing card under the site's focus guard: a row's
 * "Rewrite it for me" / "Keep my wording", the own path's Add while its fit is found, and the card's Undo buttons and
 * Ctrl/Cmd+Z. The card, its rows and the plan model are the real ones, with the holder of v4-start-card.test.tsx (copied, so
 * that file stays as it is). Every text is made up.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const CSS = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-ask.css"), "utf8");
const PLUS: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] });
const FREE: StartStepRoom = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [8, 12, 16] });

/** What a test sets on the stood-in hook; the plan itself lives in the holder and changes only through the real model. */
type Stage = Readonly<{
  phase: StartCardPhase;
  progress?: Readonly<{ answered: number; of: number }> | null;
  plan?: PathPlan | null;
  /** How wide before a plan lands. */
  width?: number;
  noneLine?: StartNoneLine | null;
  room?: StartStepRoom;
  /** The room's widest after a site update (narrowedTo while the plan holds more). */
  widest?: number | null;
  freePlan?: boolean;
  narrow?: boolean;
  questionsShown?: boolean;
  quotaLine?: MoneyLine | null;
  wider?: Readonly<{ percent: number; delta: number }> | null;
}>;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every action the card sent, in order. */
let actions: PathPlanAction[] = [];
let latest: PathPlan | null = null;
/** The fit answer the stood-in fitOwn gives. */
let fitAnswer: string | null = null;
const fitOwn = vi.fn(async (_text: string): Promise<string | null> => fitAnswer);
/** The page's crisis check: these test words open the help screen (it returns true), nothing else does. */
const offerIfCrisis = vi.fn((text: string): boolean => /hurt myself/iu.test(text));
let control: {
  stage(next: Partial<Stage>): void;
  /** A change the hook makes itself (a written combine, How wide from the bar): not one the card sent. */
  outside(action: PathPlanAction): void;
  revise(menu: StartMenu): void;
  land(plan: PathPlan, phase?: StartCardPhase): void;
} | null = null;

const keysOf = (plan: PathPlan | null): readonly string[] => plan === null ? [] : [...plan.paths, ...plan.more].map((path) => path.key);

/** The hook's part, stood in: the plan in state, dispatch through the real model, the share and narrowedTo as the hook reads them. */
function Holder({ initial }: Readonly<{ initial: Stage }>) {
  const [stage, setStage] = useState<Stage>(initial);
  const [plan, setPlan] = useState<PathPlan | null>(initial.plan ?? null);
  const now = useRef<PathPlan | null>(initial.plan ?? null);
  const landed = useRef<readonly string[]>(keysOf(initial.plan ?? null));
  const [folded, setFolded] = useState(false);
  const set = (next: PathPlan): void => {
    now.current = next;
    latest = next;
    setPlan(next);
  };
  const dispatch = (action: PathPlanAction) => {
    actions.push(action);
    const result = pathPlanReduce(now.current!, action);
    set(result.plan);
    return result.refusal;
  };
  control = {
    stage: (next) => setStage((before) => ({ ...before, ...next })),
    outside: (action) => set(pathPlanReduce(now.current!, action).plan),
    revise: (menu) => set(pathPlanWithRevision(now.current!, menu)),
    land: (next, phase = "READY") => {
      landed.current = keysOf(next);
      set(next);
      setStage((before) => ({ ...before, phase }));
    }
  };
  const room = stage.room ?? PLUS;
  const width = plan?.width ?? stage.width ?? room.widths.default;
  const widest = stage.widest ?? null;
  const lateIdeas = plan === null ? 0 : plan.more.filter((path) => path.isNew && !landed.current.includes(path.key)).length;
  const start: V4StartCardState = {
    phase: stage.phase,
    progress: stage.progress ?? null,
    plan,
    menu: plan === null ? null : signedMenu(NUCLEAR_MENU),
    dispatch,
    languageOffer: null,
    chooseLanguage: () => undefined,
    refusal: null,
    sharePercent: startPathsShare(room, plan?.paths.length ?? width),
    shareDelta: null,
    startReady: true,
    online: true,
    handOver: async () => { throw new Error("NOT_IN_THIS_TEST"); },
    width,
    noneReason: null,
    noneLine: stage.noneLine ?? null,
    checkedLine: START_FIXTURE_QUESTION,
    fitOwn,
    markStale: () => undefined,
    narrowedTo: widest !== null && plan !== null && plan.paths.length > widest ? widest : null,
    lateLists: [],
    lateIdeas,
    justLanded: false,
    keepMyWords: () => null,
    shaped: false
  };
  return (
    <>
      <div className="testQuestions">
        <V4StartAnswersFold folded={folded} onShow={() => setFolded(false)} catalog={CATALOG}>
          <p className="testAnswered">Which region? The north.</p>
        </V4StartAnswersFold>
        <p className="testOpen">Over what time?</p>
      </div>
      <V4StartCard
        start={start}
        widths={room.widths}
        freePlan={stage.freePlan ?? false}
        catalog={CATALOG}
        locale="en"
        offerIfCrisis={offerIfCrisis}
        onMakeMyQuestion={() => undefined}
        questionsShown={stage.questionsShown ?? true}
        quotaLine={stage.quotaLine ?? null}
        narrow={stage.narrow ?? false}
        share={{ wider: stage.wider ?? null }}
        onPathsUsed={() => setFolded(true)}
      />
    </>
  );
}

function stubMotion(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
  });
}

async function mount(initial: Stage): Promise<HTMLDivElement> {
  stubMotion();
  latest = initial.plan ?? null;
  host = document.createElement("div");
  host.id = "main-content";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Holder initial={initial} />));
  return host;
}

const ready = (plan: PathPlan = pathPlanFromMenu(NUCLEAR_MENU, 5, false), more: Partial<Stage> = {}): Promise<HTMLDivElement> =>
  mount({ phase: "READY", plan, ...more });

/** A second card in the same test: the first one goes first (its Ctrl/Cmd+Z listener with it). */
async function remount(plan: PathPlan, more: Partial<Stage> = {}): Promise<HTMLDivElement> {
  act(() => root?.unmount());
  host?.remove();
  actions = [];
  return ready(plan, more);
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  actions = [];
  latest = null;
  fitAnswer = null;
  control = null;
  fitOwn.mockClear();
  offerIfCrisis.mockClear();
});

/**
 * Path 1 with four of the person's own points added (the most a path holds, owner answer "Four per path" A). The path is
 * written again after each (its key changes while it is being written), so each step names it by its place.
 */
const fourOwnInFirst = (start: PathPlan): PathPlan => planAfter(start,
  ...["Point one", "Point two", "Point three", "Point four"].map((text) => (plan: PathPlan): PathPlanAction =>
    ({ type: "ADD_OWN", text, intoPathKey: plan.paths[0]!.key })));

/** The plan after some actions, through the real model (each must change it). */
function planAfter(start: PathPlan, ...steps: ReadonlyArray<PathPlanAction | ((plan: PathPlan) => PathPlanAction)>): PathPlan {
  return steps.reduce<PathPlan>((plan, step) => {
    const result = pathPlanReduce(plan, typeof step === "function" ? step(plan) : step);
    expect(result.refusal).toBeNull();
    expect(result.plan).not.toBe(plan);
    return result.plan;
  }, start);
}

const card = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4StartCard");
const cardText = (): string => card()?.textContent ?? "";
const status = (): string => card()!.querySelector<HTMLElement>(".v4StartBandStatus")?.textContent ?? "";
const spoken = (): string => card()!.querySelector<HTMLElement>(".v4StartSpoken")?.textContent ?? "";
const places = (): HTMLElement[] => [...card()!.querySelectorAll<HTMLElement>(".v4StartPlace")];
const rows = (): HTMLElement[] => [...card()!.querySelectorAll<HTMLElement>(".v4StartRow")];
const rowButton = (n: number): HTMLButtonElement => rows()[n - 1]!.querySelector<HTMLButtonElement>(".v4StartRowButton")!;
const notice = (): string | null => card()!.querySelector<HTMLElement>(".v4StartNotice p")?.textContent ?? null;
/** Buttons on the card outside any ⋯ menu, by their visible words. */
const buttons = (name: string): HTMLButtonElement[] =>
  [...host!.querySelectorAll<HTMLButtonElement>("button")].filter((one) => one.closest('[role="menu"]') === null && one.textContent?.trim() === name);
const button = (name: string): HTMLButtonElement => {
  const found = buttons(name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};
const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => { element.click(); });
};
/** A path's ⋯ item, by a press on its row's button (outside "Combine with…" the press opens ⋯). */
const rowMenu = async (n: number, item: string): Promise<void> => {
  await press(rowButton(n));
  const found = [...host!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((one) => one.textContent?.trim() === item);
  expect(found, item).toBeDefined();
  await press(found!);
};
const ownField = (): HTMLTextAreaElement => card()!.querySelector<HTMLTextAreaElement>(".v4StartOwnField")!;
const typeInto = async (element: HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const addOwn = async (words: string): Promise<void> => {
  await typeInto(ownField(), words);
  await press(button("Add"));
};
const keyZ = async (target: EventTarget, modifier: "ctrlKey" | "metaKey"): Promise<void> => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "z", [modifier]: true, bubbles: true, cancelable: true })); });
};
const hidden = (element: Element): boolean => element.closest("[hidden]") !== null;
const titles = (plan: PathPlan | null): string[] => plan?.paths.map((path) => path.title) ?? [];

// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
let stopGuard: () => void = () => undefined;
beforeEach(() => { stopGuard = guarded ? startFocusGuard() : installFocusFixup(); });
afterEach(() => { stopGuard(); });

async function keyPress(target: HTMLElement): Promise<void> {
  pressByKeyboard(target);
  await guardSettled();
}
/** A row's ⋯ item, from the keyboard: Enter on the row button opens ⋯, then Enter on the item. */
async function keyRowMenu(n: number, item: string): Promise<void> {
  await keyPress(rowButton(n));
  const found = [...host!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((one) => one.textContent?.trim() === item);
  expect(found, item).toBeDefined();
  await keyPress(found!);
}

describe("a row's 'Rewrite it for me' / 'Keep my wording' (V4A-6)", () => {
  const asking = (): PathPlan => planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false),
    { type: "REWRITE", key: "kp01", question: "Mine?" }, { type: "MOVE_CHIP", chipKey: "pt15", toPathKey: "kp01" });

  // The guard's landing is good enough here: focus keeps the row's place (its <li>), and the row's own button is its first
  // Tab stop, so the next Tab is on the row again.
  const firstStop = (within: Element): Element | undefined =>
    [...within.querySelectorAll<HTMLElement>("button, a[href], input, textarea")].find((one) => one.tabIndex >= 0);

  it("Keep my wording: the two buttons go; focus keeps the row's place, and the next Tab is the row's own button", async () => {
    await ready(asking());
    await keyPress(buttons("Keep my wording")[0]!);
    expect(buttons("Keep my wording")).toEqual([]);
    expect(document.activeElement).toBe(rows()[0]);
    expect(firstStop(rows()[0]!)).toBe(rowButton(1));
  });

  it("Rewrite it for me: the same, while its question is written", async () => {
    await ready(asking());
    await keyPress(buttons("Rewrite it for me")[0]!);
    expect(cardText()).toContain("Writing one question that covers them…");
    expect(document.activeElement).toBe(rows()[0]);
    expect(firstStop(rows()[0]!)).toBe(rowButton(1));
  });
});

describe("the own path's Add while the fit is found (V4A-9)", () => {
  it("the fit lands: focus is on 'Add it there', the first of the two choices", async () => {
    await ready();
    let answer: (key: string | null) => void = () => undefined;
    fitOwn.mockImplementationOnce(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    await typeInto(ownField(), "Cyber attacks on the grid");
    await keyPress(button("Add"));
    expect(button("Add").disabled).toBe(true);
    await act(async () => answer("kp03"));
    await guardSettled();
    expect(document.activeElement).toBe(button("Add it there"));
  });

  it("on a full list with no fit: focus is on 'Add to a path…', the first of the full list's choices", async () => {
    await ready();
    let answer: (key: string | null) => void = () => undefined;
    fitOwn.mockImplementationOnce(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    await typeInto(ownField(), "Fish in the Danube");
    await keyPress(button("Add"));
    await act(async () => answer(null));
    await guardSettled();
    expect(document.activeElement).toBe(button(CATALOG["v4.start.full.addTo"]!));
  });

  it("with room and no fit, the path is added and focus is back in the emptied box (as before)", async () => {
    await ready(planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "REMOVE", key: "kp05" }));
    let answer: (key: string | null) => void = () => undefined;
    fitOwn.mockImplementationOnce(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    await typeInto(ownField(), "Fish in the Danube");
    await keyPress(button("Add"));
    await act(async () => answer(null));
    await guardSettled();
    expect(ownField().value).toBe("");
    expect(document.activeElement).toBe(ownField());
  });
});

describe("the card's Undo buttons and Ctrl/Cmd+Z (V4A-10)", () => {
  it("the narrowing notice's Undo: the notice goes; focus is on the first row", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 7, false));
    await act(async () => control!.outside({ type: "SET_WIDTH", width: 5 }));
    await keyPress(card()!.querySelector<HTMLButtonElement>(".v4StartNotice button")!);
    expect(notice()).toBeNull();
    expect(rows()).toHaveLength(7);
    expect(document.activeElement).toBe(rowButton(1));
  });

  it("the last bottom Undo: the button goes; focus is on the first row", async () => {
    await ready();
    await keyRowMenu(5, "Remove");
    expect(rows()).toHaveLength(4);
    await keyPress(button("Undo"));
    expect(buttons("Undo")).toEqual([]);
    expect(rows()).toHaveLength(5);
    expect(document.activeElement).toBe(rowButton(1));
  });

  it("a bottom Undo with more left keeps focus on Undo", async () => {
    await ready();
    await keyRowMenu(5, "Remove");
    await keyRowMenu(4, "Remove");
    await keyPress(button("Undo"));
    expect(rows()).toHaveLength(4);
    expect(document.activeElement).toBe(button("Undo"));
  });

  it("Ctrl+Z on a row the undo takes away: focus is on the first row", async () => {
    await ready();
    await keyRowMenu(3, "Split apart");
    const piece = document.activeElement as HTMLElement;
    expect(piece.classList.contains("v4StartRowButton")).toBe(true);
    const pieceKey = latest!.paths.find((path) => rowButton(latest!.paths.indexOf(path) + 1) === piece)?.key;
    await act(async () => { piece.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })); });
    await guardSettled();
    expect(actions.at(-1)).toEqual({ type: "UNDO" });
    expect(latest!.paths.some((path) => path.key === pieceKey)).toBe(false);
    expect(document.activeElement).toBe(rowButton(1));
  });
});
