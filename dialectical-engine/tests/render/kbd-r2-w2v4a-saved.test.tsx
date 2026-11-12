// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup";
import { FOCUS_GUARD_SETTLE_MS } from "../../apps/ui/lib/focusGuard";
import { pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";
import {
  ContractHttpError, warmCrisisCheck, type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse,
  type StartListsEvent, type StartListsRequest, type StartMenu, type StartMergeRequest, type StartMergeResponse
} from "@debateai/contract";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-2, V4A-3): "Not started yet" on step 1 under the site's focus guard. The page, its
 * hooks, the list and the shared Undo note are the real ones, with the fixtures and stand-ins of v4-saved-questions.test.tsx
 * (copied, so that file stays as it is). Every figure and text is made up.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void };
type MergeCall = { input: StartMergeRequest; answer: (response: StartMergeResponse) => void };
type CombineCall = { input: StartCombineRequest; answer: (response: StartCombineResponse) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void };
type NetCall = { method: string; path: string; body: { revision?: number; doc?: Record<string, any> } | undefined };

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
/** The account's saved questions, over a fetch stand-in: every call is recorded; `answer` may answer one call its own way. */
const net = vi.hoisted(() => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const state = {
    id: "5a1c0f3e-2b7d-4c9e-8f00-000000000a01",
    calls: [] as NetCall[],
    answer: undefined as undefined | ((call: NetCall) => Response | undefined),
    list: [] as unknown[],
    json,
    async fetch(input: unknown, init?: RequestInit): Promise<Response> {
      const url = new URL(String(input));
      const call: NetCall = { method: (init?.method ?? "GET").toUpperCase(), path: url.pathname,
        body: typeof init?.body === "string" ? JSON.parse(init.body) as NetCall["body"] : undefined };
      state.calls.push(call);
      const given = state.answer?.(call);
      if (given !== undefined) return given;
      const base = "/v1/account/saved-questions";
      if (call.path === base && call.method === "GET") return json(200, { questions: state.list });
      if (call.path === base && call.method === "POST") return json(201, { id: state.id, revision: 1 });
      const id = decodeURIComponent(call.path.slice(base.length + 1));
      if (call.method === "PUT") return json(200, { id, revision: (call.body?.revision ?? 0) + 1 });
      if (call.method === "DELETE") return new Response(null, { status: 204 });
      return json(404, { error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" });
    }
  };
  return state;
});
const gate = vi.hoisted(() => ({ session: "IN" as "IN" | "OUT" }));
const consent = vi.hoisted(() => ({ yes: true }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const loads = vi.hoisted(() => [] as string[]);
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/v4/V4AskGate", () => ({
  V4AskGate: ({ children }: { children: (session: "IN" | "OUT") => ReactNode }) => children(gate.session)
}));
// The real header (its brand link and the page's onBrandClick); its quota pill and account button read the account, stood in.
vi.mock("@/components/v4/V4QuotaPill", () => ({ V4QuotaPill: () => null }));
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => consent.yes, declined: false, dialog: null })
}));
vi.mock("@/lib/v4/askHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/askHistory.js")>()),
  loadPage: (href: string) => { loads.push(href); }
}));
// Start waits out its Undo window before the send; here the window is 0 (the window itself: v4-start-undo).
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
}));
vi.mock("@/lib/api", async () => {
  const { createContractClient } = await import("@debateai/contract");
  const account = createContractClient("http://localhost/", ((input: unknown, init?: RequestInit) => net.fetch(input, init)) as typeof fetch);
  return {
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
      }),
      listSavedQuestions: account.listSavedQuestions,
      createSavedQuestion: account.createSavedQuestion,
      saveSavedQuestion: account.saveSavedQuestion,
      readSavedQuestion: account.readSavedQuestion,
      deleteSavedQuestion: account.deleteSavedQuestion
    }
  };
});

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { combineMembersKey } from "../../apps/ui/lib/v4/pathPlan.js";
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
const ID = net.id;
const SAVED = "/v1/account/saved-questions";
const AI = { source: "AI", questions: [{ text: "Until when?", answers: ["Up to 2030.", "Up to 2050."] }] };
const ELSEWHERE = "This question changed in another window. Changes here are not saved.";
const FULL = "Your account already keeps 20 questions you have not started. Delete one under “Not started yet” to keep this one.";
const SIGNED_OUT = "Please sign in again. Your paths stay on this page.";
const LEAVE_UNSAVED = "Leave this page? Your latest changes are not saved yet.";
const RELOAD_LINE = "Reloading this page reads your question again.";

/** Made-up shares of today for 1..7 paths. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, settings_version: 31, ...over
});

const CHECK: StartListsEvent = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } };
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });

/** Made-up saved questions, newest first. */
const item = (n: number, question: string, day: number) => ({
  id: `5a1c0f3e-2b7d-4c9e-8f00-0000000000${String(n).padStart(2, "0")}`, question, saved_at: `2026-10-${String(day).padStart(2, "0")}T09:00:00.000Z`
});
const B = item(11, "Should Bucharest build a second metro ring?", 20);
const C = item(12, "Should the Danube delta get more protected areas?", 18);

/** setImmediate as Node has it, kept before any test fakes the timers (the history's moves are queued with it). */
const realImmediate = globalThis.setImmediate;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
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
  net.calls = [];
  net.answer = undefined;
  net.list = [];
  gate.session = "IN";
  consent.yes = true;
  router.push.mockReset();
  loads.length = 0;
  documentClicks = [];
  document.addEventListener("click", recordClick);
  window.history.replaceState({ __NA: true, tree: [1] }, "", "/v4");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.removeEventListener("click", recordClick);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(): Promise<HTMLDivElement> {
  host = document.createElement("div");
  host.id = "main-content";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion={Q} initialLevel="plain" />
  ));
  await settle();
  return host;
}

async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

/** Start, then its Undo window (0 here) runs out and what it sends settles. */
async function press(target: Element): Promise<void> {
  await click(target);
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  await settle();
}

async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

async function type(field: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** The browser's Back: the tab moves to the entry before, and the page hears popstate. */
async function browserBack(): Promise<void> {
  let moved = false;
  const onMove = (): void => { moved = true; };
  window.addEventListener("popstate", onMove);
  try {
    await act(async () => {
      window.history.back();
      for (let turn = 0; turn < 20 && !moved; turn += 1) {
        if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(1);
        else await new Promise((done) => realImmediate(done));
      }
    });
  } finally {
    window.removeEventListener("popstate", onMove);
  }
  expect(moved, "the tab did not move back").toBe(true);
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const buttonsNamed = (name: string, within: ParentNode = document): HTMLButtonElement[] =>
  [...within.querySelectorAll("button")].filter((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const stepOneBox = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskQuestion textarea")!;
const stepTwoBox = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const brand = (): HTMLAnchorElement => host!.querySelector<HTMLAnchorElement>("a.v4HdrBrand")!;
const leaveDialog = (): HTMLElement | null => document.querySelector<HTMLElement>("[role='alertdialog']");
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;
const lane = (call = -1): Record<string, unknown> | undefined => server.createDebate.mock.calls.at(call)![8] as Record<string, unknown> | undefined;
/** The saved-question calls (any method), and the saves among them. */
const accountCalls = (): NetCall[] => net.calls.filter((call) => call.path.startsWith(SAVED));
const writes = (method: "POST" | "PUT"): NetCall[] => accountCalls().filter((call) => call.method === method);
const deletes = (): NetCall[] => accountCalls().filter((call) => call.method === "DELETE");
/** "Not started yet" on step 1: its block, and each line's question. */
const notStarted = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4NotStarted");
const listed = (): string[] => [...(notStarted()?.querySelectorAll(".v4NotStartedQuestion") ?? [])].map((one) => one.textContent ?? "");
const lineOf = (question: string): HTMLElement =>
  [...notStarted()!.querySelectorAll<HTMLElement>(".v4NotStartedItem")].find((one) => one.textContent?.includes(question))!;
// Review (wave 16): the owner's answer Q5 B (5 Nov): every English page writes the day first ("20 Oct"), whichever English.
const dayOf = (iso: string): string => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

/** Whether the browser would ask "Leave site?" now. */
function asksBeforeLeaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function emit(...events: StartListsEvent[]): Promise<void> {
  await act(async () => { for (const event of events) server.lists.at(-1)!.onEvent(event); });
  await settle();
}

async function answerMerge(menu: StartMenu = NUCLEAR_MENU): Promise<void> {
  await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(menu) }); });
  await settle();
}

/** Next, the check (the first save), then the list (its save at once). */
async function toSaved(): Promise<void> {
  await mount();
  await click(nextButton());
  expect(onStepTwo()).toBe(true);
  await emit(CHECK);
  await emit(list(1), list(2), cut(2));
  await answerMerge();
  expect(writes("POST")).toHaveLength(1);
  expect(writes("PUT")).toHaveLength(1);
}

// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
let stopGuard: () => void = () => undefined;
beforeEach(() => { stopGuard = guarded ? startFocusGuard() : installFocusFixup(); });
afterEach(() => { stopGuard(); });

/** The guard's wait, under real or fake timers. */
async function guardWait(): Promise<void> {
  if (vi.isFakeTimers()) await wait(FOCUS_GUARD_SETTLE_MS + 40);
  else await act(async () => { await new Promise((done) => setTimeout(done, FOCUS_GUARD_SETTLE_MS + 40)); });
  await settle();
}
async function keyPress(target: HTMLElement): Promise<void> {
  pressByKeyboard(target);
  await settle();
}
const D = item(13, "Should the Carpathians get a new national park?", 16);
const pickUpOf = (question: string): HTMLButtonElement => buttonNamed("Pick up", lineOf(question))!;

describe("'Show all (n)' under the focus guard (V4A-3)", () => {
  it("the button goes; focus is on the first newly shown question's Pick up", async () => {
    net.list = Array.from({ length: 7 }, (_, at) => item(20 + at, `Made-up question number ${at + 1}?`, 28 - at));
    await mount();
    await keyPress(buttonNamed("Show all (7)", notStarted()!)!);
    await guardWait();
    expect(listed()).toHaveLength(7);
    expect(document.activeElement).toBe(pickUpOf("Made-up question number 6?"));
  });
});

describe("Pick up of a question that is gone (V4A-3)", () => {
  it("its line goes once the list is read again; focus is on the Pick up of the line now in its place", async () => {
    net.list = [B, C, D];
    await mount();
    net.list = [C, D];
    await keyPress(pickUpOf(B.question));
    await guardWait();
    expect(listed()).toEqual([C.question, D.question]);
    expect(document.activeElement).toBe(pickUpOf(C.question));
  });

  it("the last line gone: the list goes, and focus is in the question box", async () => {
    net.list = [B];
    await mount();
    net.list = [];
    await keyPress(pickUpOf(B.question));
    await guardWait();
    expect(notStarted()).toBeNull();
    expect(document.activeElement).toBe(stepOneBox());
  });
});

describe("Delete's Undo window ends under the focus guard (V4A-2)", () => {
  it("the note goes with focus on its Undo; focus is on the Pick up of the line now where the deleted one was", async () => {
    vi.useFakeTimers();
    net.list = [B, C, D];
    await mount();
    await keyPress(buttonNamed("Delete", lineOf(B.question))!);
    expect(document.activeElement).toBe(buttonNamed("Undo", host!.querySelector(".v4Undo")!));
    await wait(DIG_UNDO_MS);
    await guardWait();
    expect(host!.querySelector(".v4Undo")).toBeNull();
    expect(listed()).toEqual([C.question, D.question]);
    expect(document.activeElement).toBe(pickUpOf(C.question));
  });

  it("the last line of the list deleted: focus is on the line before it", async () => {
    vi.useFakeTimers();
    net.list = [B, C];
    await mount();
    await keyPress(buttonNamed("Delete", lineOf(C.question))!);
    await wait(DIG_UNDO_MS);
    await guardWait();
    expect(document.activeElement).toBe(pickUpOf(B.question));
  });

  it("the only line deleted: the list is gone, and focus is in the question box", async () => {
    vi.useFakeTimers();
    net.list = [B];
    await mount();
    await keyPress(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS);
    await guardWait();
    expect(notStarted()).toBeNull();
    expect(document.activeElement).toBe(stepOneBox());
  });

  it("focus moved on before the window ended: it stays where the person put it", async () => {
    vi.useFakeTimers();
    net.list = [B, C];
    await mount();
    await keyPress(buttonNamed("Delete", lineOf(B.question))!);
    act(() => stepOneBox().focus());
    await wait(DIG_UNDO_MS);
    await guardWait();
    expect(document.activeElement).toBe(stepOneBox());
  });
});

describe("V4A-1 (the orchestrator's question): the check refuses the question read at Next, then 'Edit my question'", () => {
  it("the screen closes and step 1 shows: focus is in step 1's question box, with the words as they were", async () => {
    await mount();
    await keyPress(nextButton());
    expect(onStepTwo()).toBe(true);
    await emit({ event: "refused", data: { status: 422, body: {
      error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: "DRUGS", screen: "REFUSE", emergency_number: false
    } } });
    const dialog = document.querySelector('[data-dialog="question-refusal"]');
    expect(dialog).not.toBeNull();
    const back = dialog!.querySelector<HTMLButtonElement>('[data-part="back"]')!;
    expect(back.textContent).toBe(CATALOG["v4.ask.editMyQuestion"]);
    await keyPress(back);
    await guardWait();
    expect(document.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    expect(document.activeElement).toBe(stepOneBox());
  });
});
