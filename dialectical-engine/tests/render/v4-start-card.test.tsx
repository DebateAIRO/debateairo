// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
 * V4 start step, Task 73 (read-d4, choose-d1, choose-f4, choose-f5, choose-f11, choose-f10, choose-f3, choose-f15, choose-f8,
 * choose-f7, choose-f16, choose-f2, chat-quota-word-on-choosing-card, read-d2; owner answers Q6, Q8 and "Four per path" A of
 * 5 Nov): the card "What we'll look into". While the AIs read, a low paper band with the question's dot, one dot per AI (lit
 * as each answers), the status words and dashed places the size of real rows (the only dashed things on the card); at
 * READY the rows take the places. Why a list is missing, in one line each; no "Read it again" and no out-of-date line
 * anywhere; the narrowed line after a site update; late ideas; notices one at a time above the list; Undo and Ctrl/Cmd+Z;
 * the person's own path with its fit and the full-list choice (look wider with Task 69's share). The answered clarifying
 * questions fold into one line once the person first acts on a path.
 * The plan is the real path plan model; only the hook (useStartPaths) is stood in by a small holder. Shares are made up, as
 * Task 69's test has them: Plus [6, 9, 12, 15, 18, 21, 24] for 1..7 paths, Free [8, 12, 16].
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

describe("the waiting band (read-d4, choose-d1, owner answer Q6)", () => {
  it("is nothing in OFF and IDLE", async () => {
    await mount({ phase: "OFF" });
    expect(card()).toBeNull();
    await act(async () => control!.stage({ phase: "IDLE" }));
    expect(card()).toBeNull();
  });

  it("says each phase in one polite status line, under the title 'What we'll look into'", async () => {
    await mount({ phase: "CHECKING" });
    expect(card()!.querySelector("h2")?.textContent).toBe("What we'll look into");
    const line = (): HTMLElement => card()!.querySelector<HTMLElement>(".v4StartBandStatus")!;
    expect(line().getAttribute("role")).toBe("status");
    expect(status()).toBe("Checking your question…");
    await act(async () => control!.stage({ phase: "LANGUAGE_CHOICE" }));
    expect(status()).toBe("Choose how to write your question, and the AIs will start reading it.");
    await act(async () => control!.stage({ phase: "READING", progress: { answered: 0, of: 4 } }));
    expect(line().querySelector(".v4StartBandWords")?.textContent).toBe("AIs from different companies are reading your question…");
    expect(line().querySelector(".v4StartBandCount")?.textContent).toBe("0 of 4 have answered");
    await act(async () => control!.stage({ phase: "MERGING", progress: { answered: 4, of: 4 } }));
    expect(status()).toBe("Putting their ideas together…");
    expect(card()!.querySelectorAll('[role="status"]')).toHaveLength(2);
  });

  it("READING with progress {2,4}: four dots, two lit, '2 of 4 have answered'; the question is a dot at its start edge", async () => {
    await mount({ phase: "READING", progress: { answered: 2, of: 4 } });
    const dots = [...card()!.querySelectorAll(".v4StartDot")];
    expect(dots).toHaveLength(4);
    expect(dots.filter((dot) => dot.classList.contains("v4StartDot--lit"))).toHaveLength(2);
    const question = card()!.querySelector(".v4StartBand .v4StartBandQuestion")!;
    expect(question).not.toBeNull();
    expect(question.compareDocumentPosition(dots[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status()).toContain("2 of 4 have answered");
    // It counts AIs, never items.
    expect(cardText()).not.toMatch(/\bideas?\b|\bitems?\b|viewpoints?/iu);
  });

  it("five places on Plus, three on Free, on a phone three and 'and 2 more'; only the places are dashed", async () => {
    await mount({ phase: "READING", progress: { answered: 1, of: 4 }, width: 5 });
    expect(places()).toHaveLength(5);
    for (const place of places()) expect(place.classList.contains("v4StartPlace--dashed")).toBe(true);
    const dashed = [...card()!.querySelectorAll("*")].filter((element) => /dashed/u.test(element.getAttribute("class") ?? ""));
    expect(dashed).toHaveLength(5);
    expect(dashed.every((element) => element.classList.contains("v4StartPlace"))).toBe(true);
    expect(cardText()).not.toContain("more");
    await act(async () => control!.stage({ room: FREE, freePlan: true, width: 3 }));
    expect(places()).toHaveLength(3);
    await act(async () => control!.stage({ room: PLUS, freePlan: false, width: 5, narrow: true }));
    expect(places()).toHaveLength(3);
    expect(card()!.querySelector(".v4StartPlacesMore")?.textContent).toBe("and 2 more");
  });

  it("READY: the band clears, the places go and five rows take them; a screen reader hears '5 paths ready to choose from'", async () => {
    await mount({ phase: "MERGING", progress: { answered: 4, of: 4 }, width: 5 });
    expect(places()).toHaveLength(5);
    expect(rows()).toEqual([]);
    await act(async () => control!.land(pathPlanFromMenu(NUCLEAR_MENU, 5, false)));
    expect(places()).toEqual([]);
    expect(card()!.querySelector(".v4StartBand")).toBeNull();
    expect(rows()).toHaveLength(5);
    expect(card()!.querySelector(".v4StartRows")?.classList.contains("v4StartRows--clear")).toBe(true);
    expect(spoken()).toBe("5 paths ready to choose from");
    expect(card()!.querySelector(".v4StartSpoken")?.getAttribute("role")).toBe("status");
  });

  it("a two-path menu at width 5: two rows and no place left", async () => {
    await mount({ phase: "MERGING", progress: { answered: 4, of: 4 }, width: 5 });
    await act(async () => control!.land(pathPlanFromMenu(TWO_PATH_MENU, 5, false)));
    expect(rows()).toHaveLength(2);
    expect(places()).toEqual([]);
    expect(spoken()).toBe("2 paths ready to choose from");
  });
});

describe("the lines above and below the list", () => {
  it("the Free line only on Free with no clarifying question on screen (choose-f15)", async () => {
    await mount({ phase: "READING", progress: { answered: 0, of: 2 }, room: FREE, freePlan: true, width: 3, questionsShown: false });
    expect(cardText()).toContain("Free looks into up to 3 paths.");
    await act(async () => control!.stage({ questionsShown: true }));
    expect(cardText()).not.toContain("Free looks into");
    await act(async () => control!.stage({ room: PLUS, freePlan: false, questionsShown: false }));
    expect(cardText()).not.toContain("Free looks into");
  });

  it("the reload line, quiet, under the title once a menu is held (choose-f2)", async () => {
    await mount({ phase: "READING", progress: { answered: 1, of: 4 } });
    expect(cardText()).not.toContain("Reloading this page");
    await act(async () => control!.land(pathPlanFromMenu(NUCLEAR_MENU, 5, false)));
    const line = [...card()!.querySelectorAll(".v4StartCardLine")].map((one) => one.textContent);
    expect(line).toEqual(["Reloading this page reads your question again."]);
  });

  it("a late revision: 'New ideas arrived in More to explore' once under the list, and the spoken line once", async () => {
    await ready();
    expect(cardText()).not.toContain("New ideas");
    await act(async () => control!.revise(NUCLEAR_MENU_REV2));
    expect(card()!.querySelectorAll(".v4StartLate")).toHaveLength(1);
    expect(card()!.querySelector(".v4StartLate")?.textContent).toBe("New ideas arrived in More to explore");
    expect(cardText().split("New ideas arrived in More to explore")).toHaveLength(2);
    expect(spoken()).toBe("New ideas added under more to explore");
    // The late line sits under the list.
    const list = card()!.querySelector(".v4StartList")!;
    expect(list.compareDocumentPosition(card()!.querySelector(".v4StartLate")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("each missing-list line says why (choose-f11, choose-f3), and Free's quota line is the page's reset line", async () => {
    const lines: ReadonlyArray<readonly [StartNoneLine, string]> = [
      ["PASSING", "We couldn't read your question with several AIs just now. Start still works: the debate will choose its own paths."],
      ["NOT_OFFERED", "Start works: the debate will choose its paths."],
      ["TOO_SLOW", "The AIs are taking too long. Start works: the debate will choose its paths."],
      ["OFFLINE", "You're offline. Your choices are kept on this page."],
      ["SIGNED_OUT", "Please sign in again. Your paths stay on this page."]
    ];
    await mount({ phase: "NONE", noneLine: "PASSING" });
    for (const [line, words] of lines) {
      await act(async () => control!.stage({ noneLine: line }));
      expect(card()!.querySelector(".v4StartMissing")?.textContent, line).toBe(words);
      expect(CATALOG[startNoneLineKey(line)], line).toBe(words);
      expect(places()).toEqual([]);
    }
    const quotaLine: MoneyLine = { key: "v4.money.startsWait.PERSON_DAY", values: { time: "08:00" } };
    await act(async () => control!.stage({ noneLine: "QUOTA", quotaLine }));
    expect(card()!.querySelector(".v4StartMissing")?.textContent)
      .toBe("You've used what today allows. New questions and digs can start after 08:00. Anything already running will finish.");
    // Without the page's reset line, the quota line still says why.
    await act(async () => control!.stage({ quotaLine: null }));
    expect(card()!.querySelector(".v4StartMissing")?.textContent).toBe(CATALOG[startNoneLineKey("QUOTA")]);
  });

  it("REFUSED and STALE say their one line", async () => {
    await mount({ phase: "REFUSED" });
    expect(card()!.querySelector(".v4StartMissing")?.textContent).toBe("We can't look into this question as it is.");
    await act(async () => control!.stage({ phase: "STALE" }));
    expect(card()!.querySelector(".v4StartMissing")?.textContent).toBe("We need to read your question again. Press Back, then Next.");
  });

  it("no 'Read it again' button and no out-of-date line in any phase (read-d2, owner answer Q8); no allowance, nothing left", async () => {
    await mount({ phase: "CHECKING" });
    const phases: readonly Partial<Stage>[] = [
      { phase: "LANGUAGE_CHOICE" }, { phase: "READING", progress: { answered: 1, of: 3 } }, { phase: "MERGING" },
      { phase: "NONE", noneLine: "PASSING" }, { phase: "NONE", noneLine: "QUOTA", quotaLine: { key: "v4.money.startsWait.PERSON_MONTH", values: { date: "December 1" } } },
      { phase: "REFUSED" }, { phase: "STALE" }
    ];
    const check = (): void => {
      expect([...host!.querySelectorAll("button")].filter((one) => /read it again/iu.test(one.textContent ?? ""))).toEqual([]);
      expect(host!.textContent).not.toMatch(/out of date/iu);
      expect(host!.textContent).not.toMatch(/allowance|left after/iu);
    };
    check();
    for (const stage of phases) {
      await act(async () => control!.stage(stage));
      check();
    }
    await act(async () => control!.land(pathPlanFromMenu(NUCLEAR_MENU, 5, false)));
    check();
    await act(async () => control!.stage({ phase: "STALE" }));
    check();
  });

  it("narrowedTo 3 with five rows: the site-update line above the list, gone once two paths are removed (owner answer Q8)", async () => {
    await ready(undefined, { widest: 3 });
    const line = "We've updated the site: it now looks into up to 3 paths. Combine or remove paths down to 3 to start.";
    expect(card()!.querySelector(".v4StartNarrowed")?.textContent).toBe(line);
    expect(card()!.querySelector(".v4StartNarrowed")!.compareDocumentPosition(card()!.querySelector(".v4StartList")!)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await rowMenu(5, "Remove");
    expect(cardText()).toContain(line);
    await rowMenu(4, "Remove");
    expect(rows()).toHaveLength(3);
    expect(cardText()).not.toContain("We've updated the site");
  });
});

describe("Undo and Ctrl/Cmd+Z", () => {
  it("the Undo button and Ctrl/Cmd+Z undo the last change; typing keeps its own undo", async () => {
    await ready();
    expect(buttons("Undo")).toEqual([]);
    await rowMenu(5, "Remove");
    expect(rows()).toHaveLength(4);
    await press(button("Undo"));
    expect(actions.at(-1)).toEqual({ type: "UNDO" });
    expect(rows()).toHaveLength(5);
    expect(buttons("Undo")).toEqual([]);
    await rowMenu(5, "Remove");
    await keyZ(document.body, "ctrlKey");
    expect(actions.at(-1)).toEqual({ type: "UNDO" });
    expect(rows()).toHaveLength(5);
    await rowMenu(5, "Remove");
    await keyZ(document.body, "metaKey");
    expect(rows()).toHaveLength(5);
    // In a text box, Ctrl/Cmd+Z is the text's own undo: the list does not change.
    await rowMenu(5, "Remove");
    const count = actions.length;
    await act(async () => { ownField().focus(); });
    await keyZ(ownField(), "ctrlKey");
    await keyZ(ownField(), "metaKey");
    expect(actions).toHaveLength(count);
    expect(rows()).toHaveLength(4);
  });
});

describe("notices, one at a time above the list (choose-f16, choose-f8)", () => {
  it("narrowing 7 → 5: '2 paths moved to more to explore.' with Undo, and its Undo brings both back", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 7, false));
    expect(rows()).toHaveLength(7);
    await act(async () => control!.outside({ type: "SET_WIDTH", width: 5 }));
    expect(rows()).toHaveLength(5);
    expect(notice()).toBe("2 paths moved to more to explore.");
    const undo = card()!.querySelector<HTMLButtonElement>(".v4StartNotice button")!;
    expect(undo.textContent).toBe("Undo");
    await press(undo);
    expect(actions.at(-1)).toEqual({ type: "UNDO" });
    expect(latest!.width).toBe(7);
    expect(titles(latest)).toContain("Falling prices");
    expect(titles(latest)).toContain("Building delays");
    expect(notice()).toBeNull();
  });

  it("narrowing one path away names it", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 7, false));
    await act(async () => control!.outside({ type: "SET_WIDTH", width: 5 }));
    await press(card()!.querySelector<HTMLButtonElement>(".v4StartNotice button")!);
    await act(async () => control!.outside({ type: "REMOVE", key: "kp07" }));
    await act(async () => control!.outside({ type: "SET_WIDTH", width: 5 }));
    expect(notice()).toBe("“Falling prices” moved to more to explore.");
  });

  it("split on a full list shows the fold notice, and a newer notice replaces it", async () => {
    await ready();
    await rowMenu(3, "Split apart");
    expect(rows()).toHaveLength(5);
    expect(notice()).toBe("“Unproven designs and risk” moved to more to explore, to make room.");
    await act(async () => control!.outside({ type: "SET_WIDTH", width: 3 }));
    expect(card()!.querySelectorAll(".v4StartNotice")).toHaveLength(1);
    expect(notice()).toBe("2 paths moved to more to explore.");
    expect(cardText()).not.toContain("to make room");
  });

  it("combining two of five, then the written question: the notice and 'Combined. 4 paths. About 15% of today's quota.'", async () => {
    await ready();
    await rowMenu(1, "Combine with…");
    await press(rowButton(2));
    expect(rows()).toHaveLength(4);
    expect(notice()).toBeNull();
    await act(async () => control!.outside({
      type: "COMBINE_WRITTEN", key: "p1", title: "Costs and a calm winter", question: "What would the costs be, and the lights in winter?", combineRef: "cmb.sig"
    }));
    expect(notice()).toBe("Combined. An AI wrote one question that covers them.");
    expect(spoken()).toBe("Combined. 4 paths. About 15% of today's quota.");
  });

  it("Free: the month's quota in the combined line; with no share, the count alone", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 3, true), { room: FREE, freePlan: true });
    await rowMenu(1, "Combine with…");
    await press(rowButton(2));
    await act(async () => control!.outside({ type: "COMBINE_WRITTEN", key: "p1", title: "Costs", question: "What would it cost?", combineRef: "cmb.sig" }));
    expect(spoken()).toBe("Combined. 2 paths. About 12% of this month's quota.");
  });

  it("with no share the combined line says the count alone", async () => {
    const noShares = StartStepRoomSchema.parse({ lists: "ON", widths: { options: [3, 5, 7], default: 5 } });
    await ready(undefined, { room: noShares });
    await rowMenu(1, "Combine with…");
    await press(rowButton(2));
    await act(async () => control!.outside({ type: "COMBINE_WRITTEN", key: "p1", title: "Costs", question: "What would it cost?", combineRef: "cmb.sig" }));
    expect(spoken()).toBe("Combined. 4 paths.");
  });

  it("a combine the AI could not write keeps the joined words and says so", async () => {
    await ready();
    await rowMenu(1, "Combine with…");
    await press(rowButton(2));
    await act(async () => control!.outside({ type: "COMBINE_FAILED", key: "p1" }));
    expect(notice()).toBe("We couldn't write one question for these just now. Their own questions are kept; you can rewrite them.");
  });

  it("a refused change from a row says why: a fifth of the person's own points (owner answer 'Four per path' A)", async () => {
    const four = planAfter(fourOwnInFirst(pathPlanFromMenu(NUCLEAR_MENU, 5, false)),
      { type: "REMOVE", key: "kp05" }, { type: "ADD_OWN", text: "Point five", intoPathKey: null });
    await ready(four);
    await rowMenu(5, "Combine with…");
    await press(rowButton(1));
    expect(notice()).toBe("A path holds up to four of your own points. Start a new path for this one.");
    expect(spoken()).toBe("A path holds up to four of your own points. Start a new path for this one.");
    // The last path cannot go.
    await remount(pathPlanFromMenu(TWO_PATH_MENU, 5, false));
    await rowMenu(2, "Remove");
    await rowMenu(1, "Remove");
    expect(notice()).toBe("Keep at least one path to look into.");
  });
});

describe("the answered clarifying questions fold (read-d4 A)", () => {
  it("fold into one line at the first change to a path; 'Show the questions' opens them; unanswered ones stay open", async () => {
    await ready();
    const answered = host!.querySelector(".testAnswered")!;
    expect(hidden(answered)).toBe(false);
    expect(host!.textContent).not.toContain("Your answers are in your question above.");
    await rowMenu(5, "Remove");
    expect(hidden(answered)).toBe(true);
    expect(hidden(host!.querySelector(".testOpen")!)).toBe(false);
    expect(host!.querySelector(".v4StartFold")?.textContent).toBe("Your answers are in your question above. Show the questions");
    await press(button("Show the questions"));
    expect(hidden(answered)).toBe(false);
    expect(host!.querySelector(".v4StartFold")).toBeNull();
  });
});

describe("your own path (spec §2 item 5; owner decision 2)", () => {
  it("crisis words add nothing and ask no fit", async () => {
    await ready();
    expect(card()!.querySelector("label")?.textContent).toBe("Add your own path");
    expect(cardText()).toContain("What else should the AIs look into?");
    await addOwn("I want to hurt myself");
    expect(offerIfCrisis).toHaveBeenCalledWith("I want to hurt myself");
    expect(fitOwn).not.toHaveBeenCalled();
    expect(actions).toEqual([]);
  });

  it("the fit offer: 'This fits “…”. Add it there (no extra path) or make it its own path?'", async () => {
    await ready();
    fitAnswer = "kp03";
    await addOwn("  Cyber attacks on the grid  ");
    expect(fitOwn).toHaveBeenCalledWith("Cyber attacks on the grid");
    expect(cardText()).toContain("This fits “Security and weapons risks”. Add it there (no extra path) or make it its own path?");
    await press(button("Add it there"));
    expect(actions).toEqual([{ type: "ADD_OWN", text: "Cyber attacks on the grid", intoPathKey: "kp03" }]);
    expect(latest!.paths[2]!.viewpoints.map((viewpoint) => viewpoint.question)).toContain("Cyber attacks on the grid");
    expect(ownField().value).toBe("");
    // The same words again add nothing (Task 33: the same own words never reach Start twice): no second fit is asked, no
    // offer shows that could put them in a second time, and the box empties.
    await addOwn(" Cyber attacks on the grid ");
    expect(fitOwn).toHaveBeenCalledTimes(1);
    expect(cardText()).not.toContain("This fits");
    expect(buttons("Add it there")).toEqual([]);
    expect(buttons("Make it its own path")).toEqual([]);
    expect(ownField().value).toBe("");
    expect(actions).toHaveLength(1);
  });

  it("'Make it its own path' adds it as a path while the list has room; the words are kept as written", async () => {
    await ready(planAfter(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "REMOVE", key: "kp05" }));
    fitAnswer = "kp01";
    await addOwn("Fish in the Danube");
    await press(button("Make it its own path"));
    expect(actions).toEqual([{ type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null }]);
    expect(latest!.paths.at(-1)!.question).toBe("Fish in the Danube");
  });

  it("'Finding where it fits…' while the fit is asked", async () => {
    await ready();
    let answer: (key: string | null) => void = () => undefined;
    fitOwn.mockImplementationOnce(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    await addOwn("Fish in the Danube");
    expect(cardText()).toContain("Finding where it fits…");
    expect(button("Add").disabled).toBe(true);
    fitAnswer = null;
    await act(async () => answer(null));
    expect(cardText()).not.toContain("Finding where it fits…");
  });

  it("on a full list: add to a path, swap, or look wider to 7 (about 24%, +6%), from Task 69's shares", async () => {
    await ready(undefined, { wider: startShareChange(PLUS, 5, 7) });
    await addOwn("Fish in the Danube");
    expect(cardText()).toContain(
      "All 5 paths are in use. Add it to a path where it fits, swap it for one of them, or look wider: 7 paths (about 24%, +6%)."
    );
    expect(buttons("Add to a path…")).toHaveLength(1);
    expect(buttons("Swap for a path…")).toHaveLength(1);
    expect(buttons("Cancel")).toHaveLength(1);
    // The card asked the model first, which answered PATHS_FULL (the list is full): that changed nothing.
    expect(actions).toEqual([{ type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null }]);
    await press(button("Look wider: 7 paths (about 24%, +6%)"));
    expect(actions.slice(1)).toEqual([
      { type: "SET_WIDTH", width: 7 },
      { type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null, swapWithKey: "kp07" }
    ]);
    expect(latest!.width).toBe(7);
    expect(latest!.paths).toHaveLength(7);
    expect(latest!.paths.at(-1)!.question).toBe("Fish in the Danube");
    expect(cardText()).not.toContain("All 5 paths are in use");
  });

  it("'Add to a path…' and 'Swap for a path…' list 'Path {n}: {title}' with Cancel", async () => {
    await ready(undefined, { wider: startShareChange(PLUS, 5, 7) });
    await addOwn("Fish in the Danube");
    await press(button("Add to a path…"));
    expect(buttons("Path 1: Whole-system costs")).toHaveLength(1);
    expect(buttons("Path 5: Unproven designs and risk")).toHaveLength(1);
    await press(button("Path 3: Security and weapons risks"));
    expect(actions.at(-1)).toEqual({ type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: "kp03" });
    expect(latest!.paths[2]!.viewpoints.at(-1)!.question).toBe("Fish in the Danube");
    await addOwn("Cheaper loans");
    await press(button("Swap for a path…"));
    await press(button("Path 5: Unproven designs and risk"));
    expect(actions.at(-1)).toEqual({ type: "ADD_OWN", text: "Cheaper loans", intoPathKey: null, swapWithKey: "kp05" });
    expect(latest!.paths[4]!.question).toBe("Cheaper loans");
    expect(notice()).toBe("“Unproven designs and risk” moved to more to explore, to make room.");
    // Cancel goes back to the words, kept.
    await addOwn("Tourism by the coast");
    await press(button("Cancel"));
    expect(ownField().value).toBe("Tourism by the coast");
    expect(cardText()).not.toContain("are in use");
  });

  it("at the widest, no look wider; with no share, no look wider either", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 7, false), { wider: null });
    await addOwn("Fish in the Danube");
    expect(cardText()).toContain("All 7 paths are in use. Add it to a path where it fits, or swap it for one of them.");
    expect([...host!.querySelectorAll("button")].filter((one) => /look wider/iu.test(one.textContent ?? ""))).toEqual([]);
  });

  it("Free: its cap line, and no look wider", async () => {
    await ready(pathPlanFromMenu(NUCLEAR_MENU, 3, true), { room: FREE, freePlan: true, wider: null });
    await addOwn("Fish in the Danube");
    expect(cardText()).toContain("Free looks into up to 3 paths. Add it to a path where it fits, or swap it for one of them.");
    expect([...host!.querySelectorAll("button")].filter((one) => /look wider/iu.test(one.textContent ?? ""))).toEqual([]);
  });

  it("empty words, too many words, and a fifth own point in a path say why", async () => {
    await ready();
    await addOwn("   ");
    expect(cardText()).toContain("Write a few words first.");
    await addOwn("x".repeat(PATH_PLAN_LIMITS.ownTextMaxChars + 1));
    expect(cardText()).toContain("That is too long. Please keep it under 1000 characters.");
    expect(fitOwn).not.toHaveBeenCalled();
    const four = fourOwnInFirst(pathPlanFromMenu(NUCLEAR_MENU, 5, false));
    await remount(four);
    fitAnswer = four.paths[0]!.key;
    await addOwn("Point five");
    await press(button("Add it there"));
    expect(cardText()).toContain("A path holds up to four of your own points. Start a new path for this one.");
    expect(latest).toBe(four);
  });
});

describe("startRefusalLine, startNoneLineKey and startWiderWidth", () => {
  const plus5 = pathPlanFromMenu(NUCLEAR_MENU, 5, false);

  it("say each refusal in the owner's answer A words (draft wording)", () => {
    expect(startRefusalLine("VIEWPOINTS_FULL", plus5, PLUS.widths, CATALOG)).toBe("This path is full. Start a new path, or move one out.");
    expect(startRefusalLine("OWN_WORDS_FULL", plus5, PLUS.widths, CATALOG))
      .toBe("A path holds up to four of your own points. Start a new path for this one.");
    // "four" is the limit the model holds.
    expect(PATH_PLAN_LIMITS.ownWordsAndPicksPerPathMax).toBe(4);
    expect(startRefusalLine("EMPTY", plus5, PLUS.widths, CATALOG)).toBe("Write a few words first.");
    expect(startRefusalLine("LAST_PATH", plus5, PLUS.widths, CATALOG)).toBe("Keep at least one path to look into.");
    expect(startRefusalLine("TOO_LONG", plus5, PLUS.widths, CATALOG)).toBe("That is too long. Please keep it under 1000 characters.");
    expect(startRefusalLine("TOO_LONG", plus5, PLUS.widths, CATALOG, { action: { type: "REWRITE", key: "kp01", title: "t".repeat(121), question: "Q?" } }))
      .toBe("That is too long. Please keep it under 120 characters.");
    expect(startRefusalLine("TOO_LONG", plus5, PLUS.widths, CATALOG, { action: { type: "REWRITE", key: "kp01", title: "T", question: "q".repeat(1001) } }))
      .toBe("That is too long. Please keep it under 1000 characters.");
  });

  it("the full list: look wider with its share, the widest, and Free", () => {
    expect(startRefusalLine("PATHS_FULL", plus5, PLUS.widths, CATALOG, { wider: { percent: 24, delta: 6 } })).toBe(
      "All 5 paths are in use. Add it to a path where it fits, swap it for one of them, or look wider: 7 paths (about 24%, +6%)."
    );
    expect(startRefusalLine("PATHS_FULL", plus5, PLUS.widths, CATALOG))
      .toBe("All 5 paths are in use. Add it to a path where it fits, or swap it for one of them.");
    expect(startRefusalLine("PATHS_FULL", pathPlanFromMenu(NUCLEAR_MENU, 7, false), PLUS.widths, CATALOG, { wider: { percent: 30, delta: 6 } }))
      .toBe("All 7 paths are in use. Add it to a path where it fits, or swap it for one of them.");
    expect(startRefusalLine("PATHS_FULL", pathPlanFromMenu(NUCLEAR_MENU, 3, true), FREE.widths, CATALOG))
      .toBe("Free looks into up to 3 paths. Add it to a path where it fits, or swap it for one of them.");
  });

  it("the next width up, none at the widest, on Free or without widths", () => {
    expect(startWiderWidth(PLUS.widths, 5, false)).toBe(7);
    expect(startWiderWidth(PLUS.widths, 3, false)).toBe(5);
    expect(startWiderWidth(PLUS.widths, 7, false)).toBeNull();
    expect(startWiderWidth(FREE.widths, 3, true)).toBeNull();
    expect(startWiderWidth(null, 5, false)).toBeNull();
  });

  it("a key per missing-list line", () => {
    const lines: readonly StartNoneLine[] = ["PASSING", "NOT_OFFERED", "QUOTA", "OFFLINE", "SIGNED_OUT", "TOO_SLOW"];
    for (const line of lines) expect(CATALOG[startNoneLineKey(line)], line).toBeTruthy();
  });

  it("every new card line is in quota words: none says allowance or what would be left", () => {
    const keys = Object.keys(CATALOG).filter((key) => /^v4\.start\.(?:title|freeLine|reloadLine|phase|answered|morePlaces|readyAnnounce|late|none|refused|answersFolded|showQuestions|undo|combinedAnnounce|notice|own|full|refusal)/u.test(key));
    expect(keys.length).toBeGreaterThan(30);
    expect(keys.filter((key) => /allowance|left after|\$|€/iu.test(CATALOG[key]!))).toEqual([]);
  });
});

describe("the card's CSS (Task 77's rules, ahead of time)", () => {
  const at = CSS.indexOf("/* ---- V4 start step — P3: the card (Task 73");
  const block = at < 0 ? "" : CSS.slice(at);

  it("has its own block, with logical properties only and no px value above 44", () => {
    expect(block.length).toBeGreaterThan(100);
    const end = block.indexOf("/* ---- ", 10);
    const own = (end < 0 ? block : block.slice(0, end)).replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(own).not.toMatch(/(?:^|[\s;{])(?:left|right|margin-left|margin-right|padding-left|padding-right)\s*:/mu);
    expect(own).not.toMatch(/text-align:\s*(?:left|right)/u);
    const px = [...own.matchAll(/(\d+(?:\.\d+)?)px/gu)].map((match) => Number(match[1]));
    expect(px.filter((value) => value > 44)).toEqual([]);
    // Only the places are dashed.
    const dashedRules = [...own.matchAll(/([^{}]+)\{[^}]*dashed[^}]*\}/gu)].map((match) => match[1]!.trim());
    expect(dashedRules).toEqual([".v4StartPlace--dashed"]);
  });
});
