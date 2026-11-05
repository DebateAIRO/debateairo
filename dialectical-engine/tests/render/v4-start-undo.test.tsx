// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContractHttpError, warmCrisisCheck, type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse,
  type StartListsEvent, type StartListsRequest, type StartMenu, type StartMergeRequest, type StartMergeResponse
} from "@debateai/contract";

/*
 * V4 start step, Task 76b (chat-undo-after-every-start, chat-undo-after-start, r2-22, read-f12, choose-f10; owner answers Q8,
 * Q11, Q12 and Q13; 4 Nov night: choose-f19, ask-f3, ask-f8, read-f3, read-f17): a press of Start, or of either "Just answer
 * it", waits 10 seconds with the site's one Undo note before anything is sent. Meanwhile the map shows at once (the question
 * and its paths being looked into, the note under the question); Undo or Esc brings the step back exactly as it was, and
 * leaving sends nothing. The card folds into the map's first card, and back on Undo. The page, its hooks, the card, the bar,
 * the note and the map pieces are the real ones; only the session, the consent and the server are stood in. Every figure and
 * text is made up.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void };
type MergeCall = { input: StartMergeRequest; answer: (response: StartMergeResponse) => void };
type CombineCall = { input: StartCombineRequest; answer: (response: StartCombineResponse) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void };

const server = vi.hoisted(() => ({
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  roomReads: 0,
  clarifyAnswer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as CombineCall[],
  fits: [] as FitCall[],
  createDebate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ id: "11111111-1111-4111-8111-111111111111" }))
}));
/** Each consent asked takes the next answer here; none left: yes. */
const consent = vi.hoisted(() => ({ answers: [] as boolean[], asked: 0 }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({
    ensureConsent: async () => {
      consent.asked += 1;
      return consent.answers.shift() ?? true;
    },
    declined: false,
    dialog: null
  })
}));
vi.mock("@/lib/v4/carryOn", () => ({ CARRY_ON_BUILT: true }));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: (...args: unknown[]) => server.createDebate(...args),
  contractClient: {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    getAskRoom: async () => {
      server.roomReads += 1;
      return server.roomAnswer(server.roomReads);
    },
    clarifyAsk: async (input: { question_line: string }) => server.clarifyAnswer(input.question_line),
    startPathLists: (input: StartListsRequest, onEvent: (event: StartListsEvent) => void, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      abortable(signal, reject);
      server.lists.push({ input, onEvent });
    }),
    startPathMerge: (input: StartMergeRequest, signal?: AbortSignal) => new Promise<StartMergeResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.merges.push({ input, answer: resolve });
    }),
    startPathCombine: (input: StartCombineRequest, signal?: AbortSignal) => new Promise<StartCombineResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.combines.push({ input, answer: resolve });
    }),
    startPathFit: (input: StartFitRequest, signal?: AbortSignal) => new Promise<StartFitResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.fits.push({ input, answer: resolve });
    })
  }
}));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { pathPlanFromMenu, pathPlanToStartPaths, type PathPlan, type PlanPath } from "../../apps/ui/lib/v4/pathPlan.js";
import { pendingPathsOf, START_UNDO_MS } from "../../apps/ui/lib/v4/startUndo.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
warmCrisisCheck();

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const HOME = messages("home");
const NEW_DEBATE = messages("newDebate");
const BILLING = messages("billing");

const Q = START_FIXTURE_QUESTION;
const NORTH = `${Q}\n\nWhich region? The north.`;
const AI = { source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] };
const FOUR = { source: "AI",
  questions: [{ text: "Which region?", answers: ["North", "South"] }, { text: "Which years?", answers: ["Soon", "Later"] },
    { text: "Whose money?", answers: ["Public", "Private"] }, { text: "Which plants?", answers: ["Large", "Small"] }] };
const DECLINED = "No AI reads your question without your OK. You can agree at any time.";
const CHECKING = "Checking your plan…";
const PLAN_UNKNOWN = "We couldn't check your plan. Try again.";
const CANCELLED = "Cancelled. Nothing more was used.";
const ANNOUNCE = "Your question starts in a few seconds. Undo is selected.";
const WRITING = "Starting once the combined question is written";
const TOP_FIVE = [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false))];

/** Made-up shares of today for 1..7 paths: five paths take 18%. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, ...over
});
/** Made-up shares of this month for Free's 1..3 paths: three take 16%. */
const FREE_ROOM = room({ plan_id: "FREE", start_step: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [6, 11, 16] } });
const down = (): Promise<unknown> => Promise.reject(new Error("SERVER_FAILURE"));

const CHECK: StartListsEvent = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } };
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });

const CARD_RECT = { left: 16, top: 300, width: 343, height: 600 };
const FIRST_CARD_RECT = { left: 16, top: 120, width: 343, height: 120 };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const MEASURE = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect")!;

beforeEach(() => {
  server.roomAnswer = () => Promise.resolve(room());
  server.roomReads = 0;
  server.clarifyAnswer = () => Promise.resolve(AI);
  server.lists = [];
  server.merges = [];
  server.combines = [];
  server.fits = [];
  server.createDebate.mockReset();
  server.createDebate.mockImplementation(async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
  consent.answers = [];
  consent.asked = 0;
  router.push.mockReset();
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
  Object.defineProperty(Element.prototype, "getBoundingClientRect", MEASURE);
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion={Q} initialLevel="plain" />
  ));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

/** Fake time moves on; every timer due meanwhile fires, then the page settles. */
async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

async function nextFrame(): Promise<void> {
  await act(async () => { vi.advanceTimersToNextFrame(); });
}

async function key(target: EventTarget, init: KeyboardEventInit): Promise<void> {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const stepOneJust = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4AskJust")!;
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const justLink = (): HTMLButtonElement | null => host!.querySelector<HTMLButtonElement>(".v4StartBarJust");
const box = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartList .v4StartRow")];
const note = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4Undo");
const noteText = (): string => note()?.querySelector(".v4UndoText")?.textContent ?? "";
const undoButton = (): HTMLButtonElement | null => host!.querySelector<HTMLButtonElement>(".v4Undo .v4UndoBtn");
const firstCard = (): HTMLElement => host!.querySelector<HTMLElement>(".v4MapRoot")!;
const lane = (call = -1): Record<string, unknown> | undefined => server.createDebate.mock.calls.at(call)![8] as Record<string, unknown> | undefined;
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;
const before = (first: Element, second: Element): boolean => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

async function toStepTwo(): Promise<HTMLDivElement> {
  const page = await mount();
  await click(nextButton());
  expect(host!.querySelector(".v4AskReadTitle")).not.toBeNull();
  return page;
}

async function emit(...events: StartListsEvent[]): Promise<void> {
  await act(async () => { for (const event of events) server.lists.at(-1)!.onEvent(event); });
  await settle();
}

async function answerMerge(menu: StartMenu = NUCLEAR_MENU): Promise<void> {
  await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(menu) }); });
  await settle();
}

async function toReady(): Promise<void> {
  await emit(CHECK, list(1), list(2), cut(2));
  await answerMerge();
}

async function tap(name: string): Promise<void> {
  const target = buttonNamed(name, host!);
  if (target === undefined) throw new Error(`no button "${name}"`);
  await click(target);
}

async function type(field: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function removePath(n: number): Promise<void> {
  await click(rows()[n - 1]!.querySelector(".v4StartRowMore")!);
  const remove = [...host!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === "Remove");
  await click(remove!);
}

/** Less motion asked: the page's moves are instant and take the 1-second highlight. */
function reduceMotion(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
  });
}

/** The card and the map's first card where choose-f19's case puts them; everything else has no size. */
function placeCards(): void {
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true, writable: true,
    value(this: Element) {
      const rect = this.matches(".v4AskCard") ? CARD_RECT : this.matches(".v4MapRoot") ? FIRST_CARD_RECT : { left: 0, top: 0, width: 0, height: 0 };
      return { ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => rect };
    }
  });
}

describe("the 10 seconds (chat-undo-after-every-start, answers Q11 and Q13, r2-22)", () => {
  it("START_UNDO_MS is the dig's Undo window, so both timers always match", () => {
    expect(START_UNDO_MS).toBe(DIG_UNDO_MS);
    expect(START_UNDO_MS).toBe(10_000);
  });

  it("a press at READY: nothing sent at 9_999 ms, one ask at 10_000 ms with the lane; the note names the bar's share", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(noteText()).toContain("Starting your question · about 18% of today");
    await wait(9_999);
    expect(server.createDebate).not.toHaveBeenCalled();
    await wait(1);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![0]).toBe(Q);
    expect(lane()!.startCheck).toEqual({ ref: "chk.sig" });
    expect((lane()!.startPaths as { chosen_by: string; paths: unknown[] }).chosen_by).toBe("PERSON");
    expect((lane()!.startPaths as { paths: unknown[] }).paths).toEqual(TOP_FIVE);
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/v4\/debate\/11111111-1111-4111-8111-111111111111(?:\?|$)/u));
  });

  it("Free: the note names this month's share", async () => {
    server.roomAnswer = () => Promise.resolve(FREE_ROOM);
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(noteText()).toContain("Starting your question · about 16% of this month");
  });

  it("answer Q11: the map at once (the question, five paths being looked into, the note under the question), no step-2 box, focus on Undo", async () => {
    await toStepTwo();
    await tap("The north.");
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(firstCard().textContent).toContain("Which region? The north.");
    expect(firstCard().textContent).toContain(Q);
    const cards = [...host!.querySelectorAll(".v4PathCard")];
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card.textContent).toContain("Looking into it");
    expect(host!.querySelector(".v4MapRootExtra .v4Undo")).not.toBeNull();
    expect(host!.querySelector(".v4AskCard")).toBeNull();
    expect(host!.querySelector("textarea")).toBeNull();
    expect(host!.querySelector(".v4StartBar")).toBeNull();
    // r2-22: the shared note's quiet shrinking line, and one line read out once.
    expect(note()!.querySelector(".v4UndoLine .v4UndoLineFill")).not.toBeNull();
    expect(note()!.querySelector('[role="status"]')?.textContent).toBe(ANNOUNCE);
    expect(document.activeElement).toBe(undoButton());
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("Undo at 5_000 ms: never sent; step 2 back as it was, focus on Start, and the confirmation line", async () => {
    await toStepTwo();
    await tap("The north.");
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    await wait(5_000);
    await click(undoButton()!);
    expect(box().value).toBe(NORTH);
    expect(rows()).toHaveLength(5);
    expect(buttonNamed("The north.", host!)!.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(startButton());
    expect(startButton().textContent).toBe("Start investigating");
    expect(host!.textContent).toContain(CANCELLED);
    expect(before(host!.querySelector(".v4Undo")!, host!.querySelector(".v4StartBar")!)).toBe(true);
    await wait(15_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("Esc does the same", async () => {
    await toStepTwo();
    await tap("The north.");
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    await wait(5_000);
    await key(document.activeElement!, { key: "Escape" });
    expect(box().value).toBe(NORTH);
    expect(rows()).toHaveLength(5);
    expect(document.activeElement).toBe(startButton());
    expect(host!.textContent).toContain(CANCELLED);
    await wait(15_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("during the 10 s Back is absent and Ctrl/Cmd+Z changes nothing", async () => {
    await toStepTwo();
    await toReady();
    await removePath(5);
    expect(rows()).toHaveLength(4);
    vi.useFakeTimers();
    await click(startButton());
    expect(host!.querySelector(".v4AskBack")).toBeNull();
    expect(host!.querySelectorAll(".v4PathCard")).toHaveLength(4);
    await key(document, { key: "z", ctrlKey: true });
    await key(document, { key: "z", metaKey: true });
    await click(undoButton()!);
    expect(rows()).toHaveLength(4);
  });

  it("after 10 s the note reads 'Starting…' and has no Undo", async () => {
    await toStepTwo();
    await toReady();
    server.createDebate.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers();
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(noteText()).toContain("Starting…");
    expect(undoButton()).toBeNull();
  });

  it("a refusal unlocks step 2 with every pick kept, and shows its line above the bar", async () => {
    await toStepTwo();
    await tap("The north.");
    await toReady();
    server.createDebate.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "SERVER_FAILURE", "SERVER_FAILURE"));
    vi.useFakeTimers();
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(box().value).toBe(NORTH);
    expect(rows()).toHaveLength(5);
    const line = host!.querySelector(".v4AskRefusal")!;
    expect(line).not.toBeNull();
    expect((line.textContent ?? "").length).toBeGreaterThan(0);
    expect(before(line, host!.querySelector(".v4StartBar")!)).toBe(true);
    expect(startButton().disabled).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("choose-f10: a path still being written at 10_000 ms: the note waits for it, then one send right after it is written", async () => {
    await toStepTwo();
    await toReady();
    const suggestion = [...host!.querySelectorAll(".v4StartSuggestion")].find((one) => buttonNamed("Combine", one) !== undefined)!;
    await click(buttonNamed("Combine", suggestion)!);
    expect(server.combines).toHaveLength(1);
    vi.useFakeTimers();
    await click(startButton());
    // Task 33b's note: a path still being written is drawn with the combined tag.
    expect([...host!.querySelectorAll(".v4PathTag")].map((tag) => tag.textContent)).toContain(CATALOG["v4.paths.tag.COMBINED"]);
    await wait(10_000);
    expect(noteText()).toContain(WRITING);
    expect(server.createDebate).not.toHaveBeenCalled();
    await act(async () => {
      server.combines[0]!.answer({ source: "AI", title: "Hard weeks and using less", question: "How would Romania get through its hardest weeks?",
        combine_ref: "cmb.sig" });
    });
    await settle();
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    const paths = (lane()!.startPaths as { paths: Array<{ combine_ref?: string }> }).paths;
    expect(paths.filter((path) => path.combine_ref === "cmb.sig")).toHaveLength(1);
  });

  it("ask-f3: crisis words typed in the box open the help screen at the press, and nothing waits", async () => {
    await toStepTwo();
    await toReady();
    await type(box(), `${Q}\n\nI want to kill myself tonight.`);
    vi.useFakeTimers();
    await click(startButton());
    expect(document.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
    expect(note()).toBeNull();
    await wait(20_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("answer Q8: a press after three days on step 2 sends the same references at +10 s, and they are taken", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(lane()!.startCheck).toEqual({ ref: "chk.sig" });
    expect((lane()!.startPaths as { menu: unknown }).menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("leaving the page during the 10 s sends nothing", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    await wait(5_000);
    await act(async () => root!.unmount());
    root = null;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("step 2's 'Just answer it' goes through the same note: nothing before 10_000 ms, then the menu's top five chosen by the AIs", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(justLink()!);
    expect(noteText()).toContain("Starting your question · about 18% of today");
    expect(host!.querySelectorAll(".v4PathCard")).toHaveLength(5);
    await wait(9_999);
    expect(server.createDebate).not.toHaveBeenCalled();
    await wait(1);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    const paths = lane()!.startPaths as { chosen_by: string; paths: unknown[] };
    expect(paths.chosen_by).toBe("AIS");
    expect(paths.paths).toEqual(TOP_FIVE);
  });

  it("answer Q12: step 1's 'Just answer it' too, with step 1's share; the AIs are choosing; Undo brings step 1 back with focus on the link", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_step: undefined, start_share_percent: 6 }));
    await mount();
    expect(host!.textContent).toContain("This question uses about 6% of today.");
    vi.useFakeTimers();
    await click(stepOneJust());
    expect(noteText()).toContain("Starting your question · about 6% of today");
    expect(host!.querySelector(".v4RunChoosing")?.textContent).toBe(CATALOG["v4.paths.choosing"]);
    expect(host!.querySelectorAll(".v4PathCard")).toHaveLength(0);
    expect(host!.querySelector("textarea")).toBeNull();
    await click(undoButton()!);
    expect(host!.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(Q);
    expect(document.activeElement).toBe(stepOneJust());
    expect(host!.textContent).toContain(CANCELLED);
    await click(stepOneJust());
    await wait(9_999);
    expect(server.createDebate).not.toHaveBeenCalled();
    await wait(1);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![0]).toBe(Q);
    expect(lane()).toBeUndefined();
  });

  it("no storage API is touched from the press to the send", async () => {
    await toStepTwo();
    await toReady();
    const used = [
      vi.spyOn(Storage.prototype, "getItem"), vi.spyOn(Storage.prototype, "setItem"), vi.spyOn(Storage.prototype, "removeItem"),
      vi.spyOn(Storage.prototype, "clear")
    ];
    vi.useFakeTimers();
    await click(startButton());
    await wait(5_000);
    await click(undoButton()!);
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    for (const spy of used) expect(spy).not.toHaveBeenCalled();
  });
});

describe("4 Nov night: a declined consent, an unknown plan, sentence D (ask-f8, read-f3, read-f17)", () => {
  it("ask-f8: a decline at Start: the declined line above the bar, nothing waits, nothing is sent", async () => {
    consent.answers = [true, false];
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(consent.asked).toBe(2);
    const line = host!.querySelector(".v4AskDeclined")!;
    expect(line.textContent).toContain(DECLINED);
    expect(before(line, host!.querySelector(".v4StartBar")!)).toBe(true);
    expect(note()).toBeNull();
    await wait(20_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("read-f3: the plan unknown at the press: one room read, 'Checking your plan…', then on PLUS the 10 s and an ask without the Free flag", async () => {
    let release: ((value: unknown) => void) | null = null;
    server.roomAnswer = (read) => read <= 2 ? down()
      : read === 3 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(room({ start_step: undefined }));
    await toStepTwo();
    expect(server.roomReads).toBe(2);
    vi.useFakeTimers();
    await click(startButton());
    expect(server.roomReads).toBe(3);
    expect(startButton().textContent).toBe(CHECKING);
    expect(startButton().getAttribute("aria-busy")).toBe("true");
    expect(note()).toBeNull();
    await act(async () => { release!(room({ start_step: undefined })); });
    await settle();
    expect(note()).not.toBeNull();
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toBeUndefined();
  });

  it("read-f3: the read names FREE with four answers given: nothing waits and nothing is sent; with one cleared, the press sends the Free flag", async () => {
    server.roomAnswer = (read) => read <= 2 ? down() : Promise.resolve(room({ plan_id: "FREE", start_step: undefined }));
    server.clarifyAnswer = () => Promise.resolve(FOUR);
    await toStepTwo();
    for (const name of ["North", "Soon", "Public", "Large"]) await tap(name);
    expect(box().value.split("\n\n")[1]!.split("\n")).toHaveLength(4);
    vi.useFakeTimers();
    await click(startButton());
    expect(server.roomReads).toBe(3);
    expect(note()).toBeNull();
    // Never a silent drop: the four answers stay given; Free's cap now keeps three in the box (Task 76h says why in one line).
    for (const name of ["North", "Soon", "Public", "Large"]) expect(buttonNamed(name, host!)!.getAttribute("aria-pressed")).toBe("true");
    expect(box().value.split("\n\n")[1]!.split("\n")).toHaveLength(3);
    // Task 76h (read-f8): the one still line, once the plan is known.
    expect((host!.textContent ?? "").split("3 answers given. Clear one to change.")).toHaveLength(2);
    await wait(20_000);
    expect(server.createDebate).not.toHaveBeenCalled();
    await tap("Large");
    await click(startButton());
    expect(server.roomReads).toBe(3);
    expect(note()).not.toBeNull();
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toEqual({ freePublicNotice: true });
  });

  it("read-f3: the read at the press fails too: 'We couldn't check your plan. Try again.' above the bar, and nothing is sent", async () => {
    server.roomAnswer = down;
    await toStepTwo();
    vi.useFakeTimers();
    await click(startButton());
    expect(server.roomReads).toBe(3);
    const line = [...host!.querySelectorAll("p")].find((one) => one.textContent === PLAN_UNKNOWN)!;
    expect(line).toBeDefined();
    expect(before(line, host!.querySelector(".v4StartBar")!)).toBe(true);
    expect(note()).toBeNull();
    expect(startButton().textContent).toBe("Start investigating");
    await wait(20_000);
    expect(server.createDebate).not.toHaveBeenCalled();
    // The next press tries again.
    await click(startButton());
    expect(server.roomReads).toBe(4);
    expect(textCount(PLAN_UNKNOWN)).toBe(1);
  });

  it("read-f3: the same on step 1's 'Just answer it': 'Checking your plan…' on the link, then the line under the buttons, and nothing is sent", async () => {
    let fail: ((error: unknown) => void) | null = null;
    server.roomAnswer = (read) => read <= 2 ? down() : new Promise((_resolve, reject) => { fail = reject; });
    await mount();
    vi.useFakeTimers();
    await click(stepOneJust());
    expect(server.roomReads).toBe(3);
    expect(stepOneJust().textContent).toBe(CHECKING);
    expect(stepOneJust().getAttribute("aria-busy")).toBe("true");
    await act(async () => { fail!(new Error("SERVER_FAILURE")); });
    await settle();
    const line = [...host!.querySelectorAll("p")].find((one) => one.textContent === PLAN_UNKNOWN)!;
    expect(line).toBeDefined();
    expect(before(stepOneJust(), line)).toBe(true);
    expect(note()).toBeNull();
    await wait(20_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("read-f17: a send refused ALREADY_WAITING whose room re-read shows sentence D: step 2 back, and one of the two sentences only", async () => {
    await toStepTwo();
    await toReady();
    server.roomAnswer = () => Promise.resolve(room({ room: "ALREADY_WAITING", scope: "PERSON_DAY", resets_at: "2026-11-06T08:00:00.000Z",
      waiting_run_ref: "22222222-2222-4222-8222-222222222222" }));
    server.createDebate.mockRejectedValue(new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING", "ASK_ALREADY_WAITING"));
    vi.useFakeTimers();
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(host!.querySelector(".v4AskCard")).not.toBeNull();
    expect(host!.querySelectorAll('.roomNotice[data-room="ALREADY_WAITING"]')).toHaveLength(1);
    expect(host!.textContent).not.toContain(CATALOG["v4.askError.alreadyWaiting"]);
    expect(host!.querySelector(".v4AskRefusal")).toBeNull();
    expect(startButton().disabled).toBe(true);
  });
});

describe("choose-f19: the card folds into the map's first card, and back on Undo", () => {
  it("the first card grows from where the card was, in one frame's time; Undo plays it backwards", async () => {
    placeCards();
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(firstCard().style.transform).toBe("translate(0px, 180px) scale(1, 5)");
    expect(firstCard().classList.contains("v4FoldMoving")).toBe(false);
    await nextFrame();
    expect(firstCard().style.transform).toBe("none");
    expect(firstCard().classList.contains("v4FoldMoving")).toBe(true);
    // The path cards and the note appear at once.
    for (const card of host!.querySelectorAll<HTMLElement>(".v4PathCard")) expect(card.style.transform).toBe("");
    await wait(5_000);
    await click(undoButton()!);
    const card = host!.querySelector<HTMLElement>(".v4AskCard")!;
    expect(card.style.transform).toBe("translate(0px, -180px) scale(1, 0.2)");
    await nextFrame();
    expect(card.style.transform).toBe("none");
    expect(card.classList.contains("v4FoldMoving")).toBe(true);
    expect(document.activeElement).toBe(startButton());
  });

  it("less motion: no transform at any time, and the first card takes the 1-second highlight", async () => {
    placeCards();
    reduceMotion();
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(firstCard().style.transform).toBe("");
    expect(firstCard().classList.contains("v4Highlight")).toBe(true);
    await nextFrame();
    expect(firstCard().style.transform).toBe("");
    await wait(1_000);
    expect(firstCard().classList.contains("v4Highlight")).toBe(false);
    await click(undoButton()!);
    expect(host!.querySelector<HTMLElement>(".v4AskCard")!.style.transform).toBe("");
  });
});

describe("pendingPathsOf (Task 33b's note)", () => {
  it("each path's tag as the map draws it during the 10 s; no plan, no paths", () => {
    const base: PathPlan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    const one = (over: Partial<PlanPath>): PlanPath => ({ ...base.paths[0]!, ...over });
    const plan: PathPlan = {
      ...base,
      paths: [
        one({ wording: "AI", tag: null }),
        one({ wording: "AI", tag: "PUT_TOGETHER_BY_US" }),
        one({ wording: "WRITING", tag: "COMBINED_BY_YOU" }),
        one({ wording: "FALLBACK", tag: "COMBINED_BY_YOU" }),
        one({ wording: "COMBINED", tag: "COMBINED_BY_YOU" }),
        one({ wording: "PERSON", tag: null }),
        one({ wording: "PERSON", tag: "COMBINED_BY_YOU" }),
        one({ wording: "PERSON", tag: "ADDED_BY_YOU" }),
        one({ wording: "AI", tag: "ADDED_WHEN_WIDENED" })
      ]
    };
    expect(pendingPathsOf(plan).map((path) => path.tag)).toEqual([null, "TOGETHER", "COMBINED", "COMBINED", "COMBINED", "EDITED", "EDITED", "ADDED", null]);
    expect(pendingPathsOf(plan)[0]).toEqual({ title: base.paths[0]!.title, question: base.paths[0]!.question, tag: null });
    expect(pendingPathsOf(null)).toEqual([]);
  });
});
