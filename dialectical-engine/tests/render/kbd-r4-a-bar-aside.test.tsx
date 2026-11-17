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
 * Keyboard audit round 4 (2026-11-12), A6: step 2's rule "a text box has focus, so the pinned bar steps into the page"
 * (read-f9, .v4StartBar--aside) counts text entry only: a text input or a textarea, never a check box, and never anything
 * inside the bar itself (its carry-on box would un-pin the bar under the focused box). The harness is v4-start-undo's (the
 * real page on a computer; the session, the consent and the server stood in). Every figure and text is made up.
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


const bar = (): HTMLElement => host!.querySelector<HTMLElement>(".v4StartBar")!;
async function focusOn(element: HTMLElement): Promise<void> {
  await act(async () => element.focus());
  await settle();
}

describe("A6: only text entry moves the bar into the page", () => {
  it("the question box does; the bar's carry-on box and Start do not", async () => {
    await toStepTwo();
    await toReady();
    expect(bar().classList.contains("v4StartBar--aside")).toBe(false);
    await focusOn(box());
    expect(bar().classList.contains("v4StartBar--aside"), "the question box").toBe(true);
    const carry = host!.querySelector<HTMLInputElement>(".v4StartBarCarryOn input");
    expect(carry, "the carry-on box is offered").not.toBeNull();
    await focusOn(carry!);
    expect(document.activeElement).toBe(carry);
    expect(bar().classList.contains("v4StartBar--aside"), "the carry-on check box").toBe(false);
    await focusOn(startButton());
    expect(bar().classList.contains("v4StartBar--aside")).toBe(false);
  });

  it("a check box or radio button elsewhere on step 2 does not either", async () => {
    await toStepTwo();
    await toReady();
    for (const type of ["checkbox", "radio"]) {
      // A made-up control in the card (the rule reads the focused element's kind, wherever it is on step 2).
      const extra = document.createElement("input");
      extra.type = type;
      host!.querySelector(".v4AskCard")!.append(extra);
      await focusOn(extra);
      expect(bar().classList.contains("v4StartBar--aside"), type).toBe(false);
      extra.remove();
    }
    const text = document.createElement("input");
    text.type = "text";
    host!.querySelector(".v4AskCard")!.append(text);
    await focusOn(text);
    expect(bar().classList.contains("v4StartBar--aside"), "a text input").toBe(true);
    text.remove();
  });
});
