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
 * V4 start step, Task 76f (saved-questions spec 2026-11-04 §3.3, §3.4, §3.6, §3.7; owner cards "When saved", "How long", "Where
 * shown"; answers Q1, Q2, Q3, Q8, S1 A, S2 A, S3 A): once the check passes after Next, the account keeps step 2 by itself, one
 * request at a time, about a second after each change and at once when the list lands; Start names the saved question and
 * removes it; "Not started yet" on step 1 lists the newest 5 with Pick up and Delete (Delete waits out the shared 10-second
 * Undo); the page asks before leaving only while the latest change is not saved. The page, its hooks, the card, the bar and the
 * header are the real ones; the saved-question calls are the real contract client's over a fetch stand-in; the AI calls, the
 * session, the consent and the header's account parts are stood in. Every figure and text is made up.
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
// Task 76b: Start waits its 10-second Undo window before the send; here the window is 0 (the 10 seconds: v4-start-undo).
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

describe("the first save (owner card 'When saved': automatically after Next; spec §3.3)", () => {
  it("nothing reaches the account before the check; at the check one POST (chk.sig, LEFT_EARLY); the list's PUT says READY", async () => {
    await mount();
    const before = net.calls.length;
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(net.calls.slice(before)).toEqual([]);
    await emit(CHECK);
    expect(writes("PUT")).toEqual([]);
    const posts = writes("POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.path).toBe(SAVED);
    expect(posts[0]!.body!.doc!.reading.check).toEqual({ ref: "chk.sig" });
    expect(posts[0]!.body!.doc!.reading.end).toBe("LEFT_EARLY");
    expect(posts[0]!.body!.doc!.reading.read_line).toBe(Q);
    // The id goes into step 2's entry beside the words, the router's own keys stay, and the address names neither.
    const state = window.history.state as { __NA?: boolean; tree?: unknown; v4ask?: unknown };
    expect(state.v4ask).toEqual({ step: "read", words: Q, savedId: ID });
    expect(state.__NA).toBe(true);
    expect(state.tree).toEqual([1]);
    expect(window.location.search).toBe("?step=2");
    expect(window.location.href).not.toContain(ID);
    await emit(list(1), list(2), cut(2));
    await answerMerge();
    const puts = writes("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`${SAVED}/${ID}`);
    expect(puts[0]!.body!.revision).toBe(1);
    expect(puts[0]!.body!.doc!.reading.end).toBe("READY");
    expect(puts[0]!.body!.doc!.reading.menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(writes("POST")).toHaveLength(1);
    // S1 A: while the account keeps the question, the card has no "Reloading this page reads your question again." line.
    expect(textCount(RELOAD_LINE)).toBe(0);
  });

  it("later saves: an answer tapped goes in one PUT at 1_000 ms with the new box line; three changes within a second, one PUT; READY at once", async () => {
    vi.useFakeTimers();
    await toSaved();
    await click(buttonNamed("Up to 2050.")!);
    await wait(999);
    expect(writes("PUT")).toHaveLength(1);
    await wait(1);
    expect(writes("PUT")).toHaveLength(2);
    expect(writes("PUT")[1]!.body!.revision).toBe(2);
    expect(writes("PUT")[1]!.body!.doc!.page.box.text).toBe(`${Q}\n\nUntil when? Up to 2050.`);
    await click(buttonNamed("Up to 2030.")!);
    await wait(300);
    await click(buttonNamed("Up to 2050.")!);
    await wait(300);
    await type(stepTwoBox(), stepTwoBox().value.replace(Q, `${Q} By 2040?`));
    await wait(999);
    expect(writes("PUT")).toHaveLength(2);
    await wait(1);
    expect(writes("PUT")).toHaveLength(3);
    expect(writes("PUT")[2]!.body!.doc!.page.box.text).toContain("By 2040?");
    expect(writes("POST")).toHaveLength(1);
  });

  it("nothing is saved after a declined consent, nor for a 'none NOT_ASKED' (no check)", async () => {
    consent.yes = false;
    await mount();
    const before = net.calls.length;
    await click(nextButton());
    expect(onStepTwo()).toBe(false);
    expect(net.calls.slice(before)).toEqual([]);
    await unmount();
    consent.yes = true;
    await mount();
    await click(nextButton());
    await emit({ event: "none", data: { reason: "NOT_ASKED" } });
    await click(buttonNamed("Up to 2050.")!);
    await act(async () => { await new Promise((done) => setTimeout(done, 1_100)); });
    await settle();
    expect(writes("POST")).toEqual([]);
    expect(writes("PUT")).toEqual([]);
  });
});

describe("when saving stops (spec §3.3)", () => {
  async function failNextPut(status: number, error: string): Promise<void> {
    net.answer = (call) => call.method === "PUT" ? net.json(status, { error, message: error }) : undefined;
    await click(buttonNamed("Up to 2050.")!);
    await wait(1_000);
    expect(writes("PUT")).toHaveLength(2);
    net.answer = undefined;
  }

  it("a 401 on a PUT: no more requests, and the signed-out line", async () => {
    vi.useFakeTimers();
    await toSaved();
    await failNextPut(401, "SESSION_REQUIRED");
    const after = accountCalls().length;
    await click(buttonNamed("Up to 2030.")!);
    await wait(3_000);
    expect(accountCalls()).toHaveLength(after);
    expect(textCount(SIGNED_OUT)).toBe(1);
  });

  it("a 409 REVISION: no more requests, and 'This question changed in another window'", async () => {
    vi.useFakeTimers();
    await toSaved();
    await failNextPut(409, "SAVED_QUESTION_REVISION");
    const after = accountCalls().length;
    await click(buttonNamed("Up to 2030.")!);
    await wait(3_000);
    expect(accountCalls()).toHaveLength(after);
    expect(textCount(ELSEWHERE)).toBe(1);
  });

  it("a 400 SAVED_QUESTION_INVALID or a 403: no more requests and no line", async () => {
    vi.useFakeTimers();
    for (const [status, error] of [[400, "SAVED_QUESTION_INVALID"], [403, "SENSITIVE_DATA_CONSENT_REQUIRED"]] as const) {
      net.calls = [];
      window.history.replaceState({ __NA: true, tree: [1] }, "", "/v4");
      await toSaved();
      await failNextPut(status, error);
      const after = accountCalls().length;
      await click(buttonNamed("Up to 2030.")!);
      await wait(3_000);
      expect(accountCalls(), error).toHaveLength(after);
      expect(textCount(ELSEWHERE)).toBe(0);
      expect(textCount(FULL)).toBe(0);
      expect(textCount(SIGNED_OUT)).toBe(0);
      await unmount();
    }
  });

  it("a 409 SAVED_QUESTIONS_FULL on the first POST: no more requests, and step 2 says the account already keeps 20", async () => {
    vi.useFakeTimers();
    net.answer = (call) => call.method === "POST" ? net.json(409, { error: "SAVED_QUESTIONS_FULL", message: "SAVED_QUESTIONS_FULL" }) : undefined;
    await mount();
    await click(nextButton());
    await emit(CHECK);
    expect(writes("POST")).toHaveLength(1);
    expect(textCount(FULL)).toBe(1);
    const after = accountCalls().length;
    await emit(list(1), list(2), cut(2));
    await answerMerge();
    await click(buttonNamed("Up to 2050.")!);
    await wait(3_000);
    expect(accountCalls()).toHaveLength(after);
    // The question lives on the page only, as before saved questions: the card's reload line is true again.
    expect(textCount(RELOAD_LINE)).toBe(1);
  });

  it("a passing fault (500): the change is not saved (the page asks before leaving), and it goes again once the browser is back online", async () => {
    vi.useFakeTimers();
    await toSaved();
    await failNextPut(500, "SERVER_FAILURE");
    expect(asksBeforeLeaving()).toBe(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await settle();
    expect(writes("PUT")).toHaveLength(3);
    expect(writes("PUT")[2]!.body!.doc!.page.box.text).toContain("Up to 2050.");
    expect(asksBeforeLeaving()).toBe(false);
  });

  it("a 422 crisis answer opens no help screen while typing, and the next clean change saves", async () => {
    vi.useFakeTimers();
    await toSaved();
    await failNextPut(422, "CRISIS_SUPPORT_OFFERED");
    expect(document.querySelector('[data-dialog="crisis-support"]')).toBeNull();
    await click(buttonNamed("Up to 2030.")!);
    await wait(1_000);
    expect(writes("PUT")).toHaveLength(3);
    expect(writes("PUT")[2]!.body!.doc!.page.box.text).toContain("Up to 2030.");
  });
});

describe("Start names the saved question and removes it (spec §3.7)", () => {
  it("the ask carries the saved question's id, and one DELETE follows STARTED", async () => {
    await toSaved();
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(lane()!.savedQuestionId).toBe(ID);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]!.path).toBe(`${SAVED}/${ID}`);
  });

  it("a refused Start deletes nothing", async () => {
    server.createDebate.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "SERVER_FAILURE", "SERVER_FAILURE"));
    await toSaved();
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(onStepTwo()).toBe(true);
    expect(deletes()).toEqual([]);
  });

  // Review (wave 16; spec §3.7: '"Just answer it" starts a debate too, so it removes the saved copy the same way'): after Back,
  // step 1's "Just answer it" for the same words starts the question the account keeps; with other words it starts another one.
  it("step 1's 'Just answer it' after Back with the same words names the saved question, and one DELETE follows STARTED", async () => {
    await toSaved();
    await browserBack();
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    await press(host!.querySelector(".v4AskActions .v4AskJust")!);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(lane()?.savedQuestionId).toBe(ID);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]!.path).toBe(`${SAVED}/${ID}`);
  });

  it("step 1's 'Just answer it' after Back with other words names no saved question and deletes nothing", async () => {
    await toSaved();
    await browserBack();
    await type(stepOneBox(), "Should Romania plant more forests by 2040?");
    await press(host!.querySelector(".v4AskActions .v4AskJust")!);
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(lane()?.savedQuestionId).toBeUndefined();
    expect(deletes()).toEqual([]);
  });

  it("Back, new words, Next: the new reading goes by PUT to the same id, never a second POST", async () => {
    await toSaved();
    await browserBack();
    expect(onStepTwo()).toBe(false);
    const changed = `${Q} By 2040?`;
    await type(stepOneBox(), changed);
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(server.lists).toHaveLength(2);
    await emit(CHECK);
    expect(writes("POST")).toHaveLength(1);
    const last = writes("PUT").at(-1)!;
    expect(writes("PUT")).toHaveLength(2);
    expect(last.path).toBe(`${SAVED}/${ID}`);
    expect(last.body!.doc!.reading.read_line).toBe(changed);
    expect(last.body!.doc!.reading.end).toBe("LEFT_EARLY");
  });
});

// Task 76m (spec §3.2: "the combined questions already written, so that Undo and combine again stays free"; the 76f review): the
// AI's words of a combine the person undid before the save are in neither the plan nor its Undo steps, so the save carries them
// beside the page's state, and after Pick up combining the same paths again asks nothing and counts nothing.
describe("a combine undone before the save (Task 76m)", () => {
  const TITLE = "Hard weeks and using less";
  const QUESTION = "How would Romania get through its hardest weeks?";
  const suggested = (): HTMLButtonElement =>
    buttonNamed("Combine", [...host!.querySelectorAll(".v4StartSuggestion")].find((one) => buttonNamed("Combine", one) !== undefined)!)!;

  it("combine, Undo: the save carries the AI's words by their members; Pick up, combine again: no combine call, the kept words", async () => {
    vi.useFakeTimers();
    await toSaved();
    await click(suggested());
    expect(server.combines).toHaveLength(1);
    await act(async () => { server.combines[0]!.answer({ source: "AI", title: TITLE, question: QUESTION, combine_ref: "cmb.sig" }); });
    await settle();
    await click(host!.querySelector(".v4StartTools .v4StartUndo")!);
    expect(host!.textContent).not.toContain(TITLE);
    await wait(1_000);
    const saved = writes("PUT").at(-1)!.body!.doc!;
    // The plan holds the combine nowhere (the list, "+ N more", the Undo steps): only the cache keeps its words.
    expect(JSON.stringify(saved.page.plan)).not.toContain(TITLE);
    expect(saved.page.combined_written).toEqual([{ members: combineMembersKey(server.combines[0]!.input.members), title: TITLE,
      question: QUESTION, combine_ref: "cmb.sig" }]);

    await unmount();
    window.history.replaceState({ __NA: true, v4ask: { step: "ask", words: Q } }, "", "/v4");
    net.list = [{ id: ID, question: Q, saved_at: "2026-11-05T09:00:00.000Z" }];
    net.answer = (call) => call.method === "GET" && call.path === `${SAVED}/${ID}`
      ? net.json(200, { id: ID, revision: writes("PUT").length + 1, saved_at: "2026-11-05T09:00:00.000Z", state: "READY", doc: saved })
      : undefined;
    await mount();
    await click(buttonNamed("Pick up", lineOf(Q))!);
    expect(onStepTwo()).toBe(true);
    expect(host!.textContent).not.toContain(TITLE);
    await click(suggested());
    expect(server.combines).toHaveLength(1);
    expect(host!.textContent).toContain(TITLE);
  });

  it("Undo before the AI's words come: when they come, nothing on the card changes, and the next save carries them", async () => {
    vi.useFakeTimers();
    await toSaved();
    await click(suggested());
    await click(host!.querySelector(".v4StartTools .v4StartUndo")!);
    await wait(1_000);
    const puts = writes("PUT").length;
    expect(writes("PUT").at(-1)!.body!.doc!.page).not.toHaveProperty("combined_written");
    await act(async () => { server.combines[0]!.answer({ source: "AI", title: TITLE, question: QUESTION, combine_ref: "cmb.sig" }); });
    await settle();
    expect(host!.textContent).not.toContain(TITLE);
    await wait(1_000);
    expect(writes("PUT")).toHaveLength(puts + 1);
    expect(writes("PUT").at(-1)!.body!.doc!.page.combined_written).toEqual([{ members: combineMembersKey(server.combines[0]!.input.members),
      title: TITLE, question: QUESTION, combine_ref: "cmb.sig" }]);
  });
});

describe("'Not started yet' on step 1 (owner card 'Where shown'; answer S3 A)", () => {
  it("after Back it lists the made-up items, newest first, without the one this page holds, each with Pick up and Delete; a remount lists that one too", async () => {
    net.list = [B, C];
    await toSaved();
    net.list = [item(10, Q, 21), B, C].map((one, at) => at === 0 ? { ...one, id: ID } : one);
    await browserBack();
    expect(onStepTwo()).toBe(false);
    expect(notStarted()?.querySelector("h2")?.textContent).toBe("Not started yet");
    expect(listed()).toEqual([B.question, C.question]);
    for (const one of [B, C]) {
      const line = lineOf(one.question);
      expect(buttonNamed("Pick up", line)).toBeDefined();
      expect(buttonNamed("Delete", line)).toBeDefined();
      expect(line.textContent).toContain(dayOf(one.saved_at));
    }
    expect(lineOf(B.question).textContent).toContain("20 Oct");
    expect(lineOf(B.question).textContent).not.toContain("Oct 20");
    await unmount();
    window.history.replaceState({ __NA: true, v4ask: { step: "ask", words: Q } }, "", "/v4");
    await mount();
    expect(listed()).toEqual([Q, B.question, C.question]);
  });

  it("with 7 kept, the newest 5 show and 'Show all (7)'; pressing it shows all 7 in the same place", async () => {
    net.list = Array.from({ length: 7 }, (_, at) => item(20 + at, `Made-up question number ${at + 1}?`, 28 - at));
    await mount();
    expect(listed()).toEqual([1, 2, 3, 4, 5].map((n) => `Made-up question number ${n}?`));
    await click(buttonNamed("Show all (7)", notStarted()!)!);
    expect(listed()).toHaveLength(7);
    expect(buttonNamed("Show all (7)")).toBeUndefined();
  });

  it("signed out, or with no start step on the site: no list and no request", async () => {
    net.list = [B, C];
    gate.session = "OUT";
    await mount();
    expect(notStarted()).toBeNull();
    expect(accountCalls()).toEqual([]);
    await unmount();
    gate.session = "IN";
    const { start_step: _step, ...withoutStep } = room();
    server.roomAnswer = () => Promise.resolve(withoutStep);
    await mount();
    expect(notStarted()).toBeNull();
    expect(accountCalls()).toEqual([]);
  });
});

describe("Delete (spec §3.6: the shared Undo note, 10 seconds)", () => {
  it("the line leaves at once with the shared note; no DELETE before 10_000 ms, one at 10_000 ms", async () => {
    vi.useFakeTimers();
    net.list = [B, C];
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    expect(listed()).toEqual([C.question]);
    expect(host!.querySelector(".v4Undo .v4UndoText")?.textContent).toContain(`Deleted “${B.question}”`);
    expect(buttonNamed("Undo", host!.querySelector(".v4Undo")!)).toBeDefined();
    await wait(9_999);
    expect(deletes()).toEqual([]);
    await wait(1);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]!.path).toBe(`${SAVED}/${B.id}`);
    expect(listed()).toEqual([C.question]);
  });

  it("Undo at 4_000 ms brings the line back, and no DELETE is ever sent", async () => {
    vi.useFakeTimers();
    net.list = [B, C];
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(4_000);
    await click(buttonNamed("Undo", host!.querySelector(".v4Undo")!)!);
    expect(listed()).toEqual([B.question, C.question]);
    await wait(20_000);
    expect(deletes()).toEqual([]);
  });

  it("a DELETE answered 503 brings the line back", async () => {
    vi.useFakeTimers();
    net.list = [B, C];
    net.answer = (call) => call.method === "DELETE" ? net.json(503, { error: "SAVED_QUESTIONS_UNAVAILABLE", message: "SAVED_QUESTIONS_UNAVAILABLE" }) : undefined;
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(10_000);
    expect(deletes()).toHaveLength(1);
    expect(listed()).toEqual([B.question, C.question]);
  });
});

describe("leaving (owner answer S2 A: only while the latest change is not saved)", () => {
  it("beforeunload asks 500 ms after a change, and not once the PUT answered (2_000 ms)", async () => {
    vi.useFakeTimers();
    await toSaved();
    expect(asksBeforeLeaving()).toBe(false);
    await click(buttonNamed("Up to 2050.")!);
    await wait(500);
    expect(asksBeforeLeaving()).toBe(true);
    await wait(1_500);
    expect(writes("PUT")).toHaveLength(2);
    expect(asksBeforeLeaving()).toBe(false);
  });

  it("the logo asks 'Your latest changes are not saved yet' only while a change waits", async () => {
    vi.useFakeTimers();
    await toSaved();
    await click(buttonNamed("Up to 2050.")!);
    await click(brand());
    expect(leaveDialog()?.textContent).toContain(LEAVE_UNSAVED);
    await click(buttonNamed(CATALOG["v4.suggest.leaveStay"]!)!);
    expect(leaveDialog()).toBeNull();
    await wait(1_000);
    expect(writes("PUT")).toHaveLength(2);
    await click(brand());
    expect(leaveDialog()).toBeNull();
    expect(loads).toEqual([]);
  });
});

describe("storage", () => {
  it("no storage API is touched while the account keeps, lists and deletes questions", async () => {
    const touched = [vi.spyOn(Storage.prototype, "setItem"), vi.spyOn(Storage.prototype, "getItem"), vi.spyOn(Storage.prototype, "removeItem")];
    net.list = [B, C];
    await toSaved();
    await click(buttonNamed("Up to 2050.")!);
    await browserBack();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    for (const spy of touched) expect(spy).not.toHaveBeenCalled();
    for (const file of ["lib/v4/savedQuestion.ts", "lib/v4/useSavedQuestion.ts", "components/v4/V4NotStarted.tsx"]) {
      const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/u);
    }
  });
});
