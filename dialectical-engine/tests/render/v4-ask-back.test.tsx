// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  warmCrisisCheck, type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse,
  type StartListsEvent, type StartListsRequest, type StartMenu, type StartMergeRequest, type StartMergeResponse
} from "@debateai/contract";

/*
 * V4 start step, Task 76c (read-f2, choose-f2, choose-f21, ask-f12; owner answers Q2 A and Q3 A): step 2 has its own place in
 * the browser's history. The address says only that it is step 2; Back goes to step 1 with the words and keeps the paths (a
 * Back while a menu or sheet is open closes only that); during Start's 10 seconds Back is an Undo, and from the send until the
 * outcome it is held; a reload brings the words back and calls no AI; the page asks before leaving only when something would
 * be lost (the logo too, in the page); and a started question says so when its entry is opened again. The page, its hooks, the
 * card, the bar, the header and the dialog are the real ones; only the session, the consent, the server, the header's quota
 * and account parts, and the full page load are stood in. Every figure and text is made up.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void };
type MergeCall = { input: StartMergeRequest; answer: (response: StartMergeResponse) => void };
type CombineCall = { input: StartCombineRequest; answer: (response: StartCombineResponse) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void };

const server = vi.hoisted(() => ({
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  roomReads: 0,
  clarifyAnswer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  clarified: [] as string[],
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as CombineCall[],
  fits: [] as FitCall[],
  createDebate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ id: "run-1" }))
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
/** The full page loads the page asked for (Leave in the logo's dialog). */
const loads = vi.hoisted(() => [] as string[]);
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
// The real header (its brand link and the page's onBrandClick); its quota pill and account button read the account, stood in.
vi.mock("@/components/v4/V4QuotaPill", () => ({ V4QuotaPill: () => null }));
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/lib/v4/askHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/askHistory.js")>()),
  loadPage: (href: string) => { loads.push(href); }
}));
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
    clarifyAsk: async (input: { question_line: string }) => {
      server.clarified.push(input.question_line);
      return server.clarifyAnswer(input.question_line);
    },
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
const AI = { source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] };
const KEPT = "Your paths are kept. Press Next to see them.";
const LEAVE = "Leave this page? The paths the AIs suggested will be lost.";
const STARTED = "This question has started.";
const OPEN_MAP = "Open its map";
const CANCELLED = "Cancelled. Nothing more was used.";

/** Made-up shares of today for 1..7 paths. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, ...over
});

const CHECK: StartListsEvent = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } };
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });

/** setImmediate as Node has it, kept before any test fakes the timers (the history's moves are queued with it). */
const realImmediate = globalThis.setImmediate;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Clicks that reached the document, with whether the page stopped the link; jsdom never navigates (stopped here). */
let documentClicks: Array<{ target: EventTarget | null; prevented: boolean }> = [];
const recordClick = (event: MouseEvent): void => {
  documentClicks.push({ target: event.target, prevented: event.defaultPrevented });
  event.preventDefault();
};

beforeEach(() => {
  server.roomAnswer = () => Promise.resolve(room());
  server.roomReads = 0;
  server.clarifyAnswer = () => Promise.resolve(AI);
  server.clarified = [];
  server.lists = [];
  server.merges = [];
  server.combines = [];
  server.fits = [];
  server.createDebate.mockReset();
  server.createDebate.mockImplementation(async () => ({ id: "run-1" }));
  router.push.mockReset();
  loads.length = 0;
  documentClicks = [];
  document.addEventListener("click", recordClick);
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.removeEventListener("click", recordClick);
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(initialQuestion = Q): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion={initialQuestion} initialLevel="plain" />
  ));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

/** The browser's Back (or Forward): the tab moves to the entry before (after), and the page hears popstate. */
async function browserMove(move: "back" | "forward"): Promise<void> {
  let moved = false;
  const onMove = (): void => { moved = true; };
  window.addEventListener("popstate", onMove);
  try {
    await act(async () => {
      window.history[move]();
      // The tab's move is queued a few times over; with fake timers each queued step lands one fake millisecond later.
      for (let turn = 0; turn < 20 && !moved; turn += 1) {
        if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(1);
        else await new Promise((done) => realImmediate(done));
      }
    });
  } finally {
    window.removeEventListener("popstate", onMove);
  }
  expect(moved, `the tab did not move ${move}`).toBe(true);
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const stepOneBox = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskQuestion textarea")!;
const stepTwoBox = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartList .v4StartRow")];
const noteText = (): string => host!.querySelector(".v4Undo .v4UndoText")?.textContent ?? "";
const brand = (): HTMLAnchorElement => host!.querySelector<HTMLAnchorElement>("a.v4HdrBrand")!;
const leaveDialog = (): HTMLElement | null => document.querySelector<HTMLElement>("[role='alertdialog']");
const entry = (): unknown => (window.history.state as { v4ask?: unknown } | null)?.v4ask;
const brandClicks = (): Array<{ prevented: boolean }> => documentClicks.filter((one) => one.target === brand());

async function toStepTwo(): Promise<HTMLDivElement> {
  const page = await mount();
  await click(nextButton());
  expect(onStepTwo()).toBe(true);
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

/** Whether the browser would ask "Leave site?" now. */
function asksBeforeLeaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** A phone's width: the bar's "Options" opens a sheet. */
function phoneWidth(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
  });
}

describe("step 2's place in the history (read-f2, choose-f2)", () => {
  it("Next: the entry holds the words, step 1's entry too, and the address says only ?step=2", async () => {
    await toStepTwo();
    expect(entry()).toEqual({ step: "read", words: Q });
    expect(window.location.search).toBe("?step=2");
    for (const word of ["Romania", "nuclear", "plants"]) expect(window.location.href).not.toContain(word);
  });

  it("Back: step 1 with the words and 'Your paths are kept'; Next again calls nothing and the card is as it was", async () => {
    await toStepTwo();
    await toReady();
    expect(rows()).toHaveLength(5);
    const clarified = server.clarified.length;
    await browserMove("back");
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    expect(entry()).toEqual({ step: "ask", words: Q });
    expect(window.location.search).toBe("");
    expect(host!.textContent).toContain(KEPT);
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(server.clarified).toHaveLength(clarified);
    expect(server.lists).toHaveLength(1);
    expect(rows()).toHaveLength(5);
    expect(entry()).toEqual({ step: "read", words: Q });
  });

  it("'Your paths are kept' only while the words are the ones read and a list is held", async () => {
    await toStepTwo();
    await browserMove("back");
    // No list yet.
    expect(host!.textContent).not.toContain(KEPT);
    await browserMove("forward");
    await toReady();
    await browserMove("back");
    expect(host!.textContent).toContain(KEPT);
    await type(stepOneBox(), `${Q} By 2040?`);
    expect(host!.textContent).not.toContain(KEPT);
  });

  it("the page's own Back goes back in the history too, so Forward brings step 2 back as held", async () => {
    await toStepTwo();
    await toReady();
    await act(async () => { host!.querySelector<HTMLButtonElement>(".v4AskBack")!.click(); });
    expect(onStepTwo()).toBe(false);
    await act(async () => { for (let turn = 0; turn < 5; turn += 1) await new Promise((done) => realImmediate(done)); });
    await settle();
    expect(entry()).toEqual({ step: "ask", words: Q });
    await browserMove("forward");
    expect(onStepTwo()).toBe(true);
    expect(rows()).toHaveLength(5);
    expect(server.lists).toHaveLength(1);
  });

  it("Back with the Options sheet open closes only the sheet, and step 2 stays with its entry", async () => {
    phoneWidth();
    await toStepTwo();
    await toReady();
    await click(host!.querySelector(".v4StartBarOptions")!);
    expect(host!.querySelector(".v4StartSheet")).not.toBeNull();
    await browserMove("back");
    expect(host!.querySelector(".v4StartSheet")).toBeNull();
    expect(onStepTwo()).toBe(true);
    expect(entry()).toEqual({ step: "read", words: Q });
    expect(window.location.search).toBe("?step=2");
    // The next Back goes to step 1.
    await browserMove("back");
    expect(onStepTwo()).toBe(false);
  });

  it("Back with a path's ⋯ menu open closes only the menu", async () => {
    await toStepTwo();
    await toReady();
    await click(rows()[0]!.querySelector(".v4StartRowMore")!);
    expect(host!.querySelector('[role="menu"]')).not.toBeNull();
    await browserMove("back");
    expect(host!.querySelector('[role="menu"]')).toBeNull();
    expect(onStepTwo()).toBe(true);
    expect(rows()).toHaveLength(5);
    expect(entry()).toEqual({ step: "read", words: Q });
  });

  it("a reload on ?step=2 shows step 1 with the words from the entry, and calls no AI (answer Q3)", async () => {
    window.history.replaceState({ __NA: true, v4ask: { step: "read", words: Q } }, "", "/v4?step=2");
    await mount("");
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    expect(server.clarified).toHaveLength(0);
    expect(server.lists).toHaveLength(0);
    // The entry is step 1's now, and the address no longer says step 2.
    expect(entry()).toEqual({ step: "ask", words: Q });
    expect(window.location.search).toBe("");
    expect((window.history.state as { __NA?: boolean }).__NA).toBe(true);
  });
});

describe("leaving (read-f2, choose-f2; answer Q2: only when something would be lost)", () => {
  it("not with only the question and an unshaped list", async () => {
    await toStepTwo();
    await toReady();
    expect(asksBeforeLeaving()).toBe(false);
  });

  it("after an answer is picked", async () => {
    await toStepTwo();
    await toReady();
    await click(buttonNamed("The north.", host!)!);
    expect(asksBeforeLeaving()).toBe(true);
  });

  it("after typing in the step-2 box", async () => {
    await toStepTwo();
    await toReady();
    await type(stepTwoBox(), `${Q} By 2040?`);
    expect(asksBeforeLeaving()).toBe(true);
  });

  it("after a REMOVE", async () => {
    await toStepTwo();
    await toReady();
    await removePath(5);
    expect(asksBeforeLeaving()).toBe(true);
  });

  it("the logo with a shaped path: the page's own question; Stay keeps the page, Leave goes", async () => {
    await toStepTwo();
    await toReady();
    await removePath(5);
    await click(brand());
    expect(brandClicks().at(-1)?.prevented).toBe(true);
    expect(leaveDialog()?.textContent).toContain(LEAVE);
    await click(buttonNamed(CATALOG["v4.suggest.leaveStay"]!)!);
    expect(leaveDialog()).toBeNull();
    expect(onStepTwo()).toBe(true);
    expect(rows()).toHaveLength(4);
    expect(loads).toEqual([]);
    await click(brand());
    await click(buttonNamed(CATALOG["v4.suggest.leaveGo"]!)!);
    expect(leaveDialog()).toBeNull();
    expect(loads).toEqual([`${window.location.origin}/v4`]);
    // Leaving is not asked twice: the browser's own question stays away for that page load.
    expect(asksBeforeLeaving()).toBe(false);
  });

  it("the logo with nothing to lose goes at once, never for the question alone", async () => {
    await toStepTwo();
    await toReady();
    await click(brand());
    expect(leaveDialog()).toBeNull();
    expect(brandClicks().at(-1)?.prevented).toBe(false);
  });

  it("ask-f12: words a reload brings back are not at risk; one typed letter more is", async () => {
    window.history.replaceState({ v4ask: { step: "read", words: Q } }, "", "/v4?step=2");
    await mount("");
    expect(stepOneBox().value).toBe(Q);
    expect(asksBeforeLeaving()).toBe(false);
    await type(stepOneBox(), `${Q}s`);
    expect(asksBeforeLeaving()).toBe(true);
  });
});

describe("Back during Start's 10 seconds (ask-f12) and a started question (choose-f21, answer Q3)", () => {
  it("Back at 5_000 ms is an Undo: nothing is sent, step 2 as it was with its entry, and 'Cancelled.'", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    expect(host!.querySelector(".v4AskCard")).toBeNull();
    await wait(5_000);
    await browserMove("back");
    expect(onStepTwo()).toBe(true);
    expect(stepTwoBox().value).toBe(Q);
    expect(rows()).toHaveLength(5);
    expect(entry()).toEqual({ step: "read", words: Q });
    expect(window.location.search).toBe("?step=2");
    expect(host!.textContent).toContain(CANCELLED);
    expect(document.activeElement).toBe(startButton());
    await wait(15_000);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("Back at 10_500 ms, while the send is in flight, is held: step 2's entry again, the note still 'Starting…', one ask", async () => {
    await toStepTwo();
    await toReady();
    server.createDebate.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers();
    await click(startButton());
    await wait(10_500);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    await browserMove("back");
    expect(entry()).toEqual({ step: "read", words: Q });
    expect(window.location.search).toBe("?step=2");
    expect(noteText()).toContain("Starting…");
    expect(onStepTwo()).toBe(false);
    await wait(20_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
  });

  it("at the send the entry becomes the started question's; opened again it says so, with its map, and no step 2", async () => {
    await toStepTwo();
    await toReady();
    vi.useFakeTimers();
    await click(startButton());
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(entry()).toEqual({ step: "started", runId: "run-1" });
    expect(window.location.pathname + window.location.search).toBe("/v4");
    expect(router.push).toHaveBeenCalledWith("/v4/debate/run-1");
    vi.useRealTimers();
    // Back from the map: the ask page mounts again on that entry.
    await act(async () => root!.unmount());
    host!.remove();
    await mount("");
    expect(host!.textContent).toContain(STARTED);
    const link = [...host!.querySelectorAll("a")].find((anchor) => anchor.textContent?.trim() === OPEN_MAP)!;
    expect(link.getAttribute("href")).toBe("/v4/debate/run-1");
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe("");
    expect(server.clarified).toHaveLength(1);
  });

  it("step 1's 'Just answer it': its entry becomes the started question's too, so no step-1 entry is left to start a second copy", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_step: undefined, start_share_percent: 6 }));
    await mount();
    const entries = window.history.length;
    vi.useFakeTimers();
    await click(host!.querySelector(".v4AskActions .v4AskJust")!);
    // No entry is pushed for the 10 s.
    expect(window.history.length).toBe(entries);
    await wait(10_000);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(entry()).toEqual({ step: "started", runId: "run-1" });
    expect(window.history.length).toBe(entries);
  });
});
