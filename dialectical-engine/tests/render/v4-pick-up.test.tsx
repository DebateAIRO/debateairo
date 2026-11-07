// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  warmCrisisCheck, type AskClarifyResponse, type StartCombineRequest, type StartCombineResponse, type StartFitRequest,
  type StartFitResponse, type StartListsEvent, type StartListsRequest, type StartMergeRequest, type StartMergeResponse
} from "@debateai/contract";

/*
 * V4 start step, Task 76f (saved-questions spec 2026-11-04 §3.5, §3.10, §3.11; owner card "Where shown"; answers Q8 and S1 A;
 * read-f23): Pick up, and a reload on step 2, open step 2 exactly as the account kept it, with no AI call and nothing counted:
 * one read of the saved question and the room read fresh. The page's restore is Task 76e's; the seeded questions are drawn at
 * once (no held rows). Start then sends what was kept byte for byte and names the saved question. The page, its hooks, the card
 * and the bar are the real ones; the saved-question calls are the real contract client's over a fetch stand-in; the AI calls,
 * the session, the consent and the header are stood in. Every figure and text is made up.
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
/** What happened, in order: the saves and the page reloads (the banner's Reload must send the latest change first). */
const order = vi.hoisted(() => [] as string[]);
const net = vi.hoisted(() => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const state = {
    calls: [] as NetCall[],
    list: [] as unknown[],
    reads: {} as Record<string, unknown>,
    json,
    async fetch(input: unknown, init?: RequestInit): Promise<Response> {
      const url = new URL(String(input));
      const call: NetCall = { method: (init?.method ?? "GET").toUpperCase(), path: url.pathname,
        body: typeof init?.body === "string" ? JSON.parse(init.body) as NetCall["body"] : undefined };
      state.calls.push(call);
      order.push(call.method);
      const base = "/v1/account/saved-questions";
      if (call.path === base && call.method === "GET") return json(200, { questions: state.list });
      if (call.path === base && call.method === "POST") return json(201, { id: "5a1c0f3e-2b7d-4c9e-8f00-000000000a01", revision: 1 });
      const id = decodeURIComponent(call.path.slice(base.length + 1));
      if (call.method === "PUT") return json(200, { id, revision: (call.body?.revision ?? 0) + 1 });
      if (call.method === "DELETE") return new Response(null, { status: 204 });
      const read = state.reads[id];
      return read === undefined ? json(404, { error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" }) : json(200, read);
    }
  };
  return state;
});
const router = vi.hoisted(() => ({ push: vi.fn() }));
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/lib/v4/siteVersion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/siteVersion.js")>()),
  reloadPage: () => { order.push("RELOAD"); }
}));
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
import { pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { boxOf, boxPlace } from "../../apps/ui/lib/v4/questionBox.js";
import { savedDocOf } from "../../apps/ui/lib/v4/savedQuestion.js";
import type { V4StartKept, V4StartReading } from "../../apps/ui/lib/v4/startKept.js";
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
const SAVED = "/v1/account/saved-questions";
const PICKED = "5a1c0f3e-2b7d-4c9e-8f00-000000000c07";
const SAVED_AT = "2026-10-22T09:00:00.000Z";
const AI = { source: "AI", questions: [{ text: "Until when?", answers: ["Up to 2030.", "Up to 2050."] }] } as const satisfies AskClarifyResponse;
const KEPT_LINE = "Your paths are kept. Press Next to see them.";
const READ_AGAIN = "We need to read your question again. Press Back, then Next.";
const LEFT_EARLY = "The AIs had not finished when you left. Start still works: the debate will choose its own paths.";
const NARROWED_5 = "We've updated the site: it now looks into up to 5 paths. Combine or remove paths down to 5 to start.";
const RELOAD_LINE = "Reloading this page reads your question again.";
const CRISIS = "I want to kill myself tonight.";

/** Made-up shares of today for 1..7 paths. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, settings_version: 31, ...over
});

function reduced(plan: PathPlan, ...actions: PathPlanAction[]): PathPlan {
  return actions.reduce((held, action) => pathPlanReduce(held, action).plan, plan);
}

/** kp01 and kp02 combined by the person (a path still being written). */
function writingPlan(): PathPlan {
  return reduced(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" },
    { type: "COMBINE_SELECTED" });
}

/** Five shaped paths: the combined one written by the AI combine ("cmb.sig"), and an own path. */
function shapedPlan(own = "Fish in the Danube"): PathPlan {
  const writing = writingPlan();
  const key = writing.paths.find((path) => path.wording === "WRITING")!.key;
  return reduced(writing,
    { type: "COMBINE_WRITTEN", key, title: "Hard weeks and using less", question: "How would Romania get through its hardest weeks?", combineRef: "cmb.sig" },
    { type: "ADD_OWN", text: own, intoPathKey: null });
}

const BOX_2050 = boxPlace(boxOf(Q), { key: "Until when?", text: "Until when? Up to 2050." }, ["Until when?"]);

function keptOf(plan: PathPlan = shapedPlan(), over: Partial<V4StartKept> = {}): V4StartKept {
  return {
    v: 1, readLine: Q, box: BOX_2050, sentGoal: { answers: [{ question: "Until when?", answer: "Up to 2050.", other: false }], matters: "" },
    clarify: AI, check: { ref: "chk.sig" }, menu: signedMenu(NUCLEAR_MENU), lists: [], lateLists: [signedList(3)], end: "READY",
    plan, width: 5, mode: "thorough", carryOn: true, ...over
  };
}

function readingOf(kept: V4StartKept): V4StartReading {
  return {
    check: kept.check, menu: kept.menu, lateLists: kept.lateLists, end: kept.end, ...(kept.noneReason === undefined ? {} : { noneReason: kept.noneReason }),
    checkedLine: kept.readLine, readingLevel: "background", language: { code: "en", name: "English" }, seats: 4
  };
}

/** The account keeps this step 2 under PICKED (its read answer, as Pick up gets it). */
function keep(kept: V4StartKept = keptOf(), state: "READY" | "NEEDS_READING" = "READY"): void {
  net.list = [{ id: PICKED, question: Q, saved_at: SAVED_AT }];
  net.reads = { [PICKED]: { id: PICKED, revision: 3, saved_at: SAVED_AT, state, doc: JSON.parse(JSON.stringify(savedDocOf({ kept, reading: readingOf(kept) }))) } };
}

/** setImmediate as Node has it, kept before any test fakes the timers (the history's moves are queued with it). */
const realImmediate = globalThis.setImmediate;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let heldRowsSeen = 0;
let watcher: MutationObserver | null = null;

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
  net.list = [];
  net.reads = {};
  order.length = 0;
  router.push.mockReset();
  heldRowsSeen = 0;
  window.history.replaceState({ __NA: true, tree: [1] }, "", "/v4");
});
afterEach(async () => {
  watcher?.disconnect();
  watcher = null;
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
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
  watcher?.disconnect();
  watcher = new MutationObserver(() => { heldRowsSeen += host?.querySelectorAll(".v4AskHeldRow").length ?? 0; });
  watcher.observe(host, { childList: true, subtree: true });
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion="" initialLevel="plain" />
  ));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

async function press(target: Element): Promise<void> {
  await click(target);
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  await settle();
}

async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

async function browserBack(): Promise<void> {
  let moved = false;
  const onMove = (): void => { moved = true; };
  window.addEventListener("popstate", onMove);
  try {
    await act(async () => {
      window.history.back();
      for (let turn = 0; turn < 20 && !moved; turn += 1) await new Promise((done) => realImmediate(done));
    });
  } finally {
    window.removeEventListener("popstate", onMove);
  }
  expect(moved, "the tab did not move back").toBe(true);
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const stepOneBox = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskQuestion textarea")!;
const box = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartList .v4StartRow")];
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;
const lane = (call = -1): Record<string, unknown> | undefined => server.createDebate.mock.calls.at(call)![8] as Record<string, unknown> | undefined;
const accountCalls = (): NetCall[] => net.calls.filter((call) => call.path.startsWith(SAVED));
const callNames = (calls: readonly NetCall[]): string[] => calls.map((call) => `${call.method} ${call.path}`);
const pickUp = (): HTMLButtonElement => buttonNamed("Pick up", host!.querySelector(".v4NotStarted")!)!;
function noAiCall(): void {
  expect(server.clarified).toEqual([]);
  expect(server.lists).toEqual([]);
  expect(server.merges).toEqual([]);
  expect(server.combines).toEqual([]);
  expect(server.fits).toEqual([]);
}

async function removePath(n: number): Promise<void> {
  await click(rows()[n - 1]!.querySelector(".v4StartRowMore")!);
  const remove = [...host!.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent?.trim() === "Remove");
  await click(remove!);
}

/** The page opened, then Pick up pressed on the one saved question. */
async function pickedUp(): Promise<void> {
  await mount();
  expect(host!.querySelector(".v4NotStarted")).not.toBeNull();
  await click(pickUp());
}

describe("Pick up: no AI call (owner card 'Where shown'; read-f23)", () => {
  it("one GET by id and the room read; no clarify, lists, merge, combine or fit; the router's keys survive; no held row; focus on step 2's heading", async () => {
    keep();
    await mount();
    const roomReads = server.roomReads;
    const before = net.calls.length;
    await click(pickUp());
    expect(onStepTwo()).toBe(true);
    expect(callNames(net.calls.slice(before))).toEqual([`GET ${SAVED}/${PICKED}`]);
    expect(server.roomReads).toBeGreaterThan(roomReads);
    noAiCall();
    expect(heldRowsSeen).toBe(0);
    expect(host!.querySelector(".v4AskHeldRow")).toBeNull();
    expect(window.history.state).toEqual({ __NA: true, tree: [1], v4ask: { step: "read", words: Q, savedId: PICKED } });
    expect(window.location.search).toBe("?step=2");
    expect(document.activeElement).toBe(host!.querySelector(".v4AskReadTitle"));
    // S1 A: while the account keeps the question, the card has no "Reloading this page reads your question again." line.
    expect(textCount(RELOAD_LINE)).toBe(0);
  });

  it("step 2 as left: the box, five rows with the combined and the own path, the answer picked, How wide 5, Thorough, the carry-on tick", async () => {
    keep();
    await pickedUp();
    expect(box().value.endsWith("Until when? Up to 2050.")).toBe(true);
    expect(rows()).toHaveLength(5);
    const texts = rows().map((row) => (row.textContent ?? "").toLowerCase());
    expect(texts.filter((text) => text.includes("hard weeks and using less") && text.includes("combined by you"))).toHaveLength(1);
    expect(texts.filter((text) => text.includes("fish in the danube") && text.includes("added by you"))).toHaveLength(1);
    expect(buttonNamed("Up to 2050.", host!)!.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Up to 2030.", host!)!.getAttribute("aria-pressed")).toBe("false");
    expect(host!.querySelector(".v4StartBarWidths button[aria-pressed='true']")?.textContent).toBe("5 paths");
    expect(host!.querySelector(".v4AskMode button[aria-pressed='true']")?.textContent).toBe("Thorough");
    expect(host!.querySelector<HTMLInputElement>(".v4StartBarCarryOn input")!.checked).toBe(true);
  });

  it("Start after Pick up sends the stored start_check and start_paths byte for byte, and the saved question's id", async () => {
    const kept = keptOf();
    keep(kept);
    await pickedUp();
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![0]).toBe(`${Q}\n\nUntil when? Up to 2050.`);
    const sent = lane()!;
    expect(JSON.stringify(sent.startCheck)).toBe(JSON.stringify({ ref: "chk.sig" }));
    const expected = { source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: [...pathPlanToStartPaths(kept.plan)], width: kept.plan.width,
      chosen_by: "PERSON", late_lists: [signedList(3)] };
    expect(JSON.stringify(sent.startPaths)).toBe(JSON.stringify(expected));
    expect(sent.savedQuestionId).toBe(PICKED);
    expect(sent.carryOnToReport).toBe(true);
    noAiCall();
    expect(callNames(accountCalls().filter((call) => call.method === "DELETE"))).toEqual([`DELETE ${SAVED}/${PICKED}`]);
  });

  it("a path still being written shows its joined words, and no combine request is sent", async () => {
    const writing = writingPlan();
    const key = writing.paths.find((path) => path.wording === "WRITING")!.key;
    const joined = pathPlanReduce(writing, { type: "COMBINE_FAILED", key }).plan.paths.find((path) => path.key === key)!;
    keep(keptOf(writing));
    await pickedUp();
    expect(rows()).toHaveLength(writing.paths.length);
    expect(rows().some((row) => row.textContent?.includes(joined.title))).toBe(true);
    await settle();
    expect(server.combines).toEqual([]);
  });
});

describe("what Pick up can meet (spec §3.5, §3.10)", () => {
  it("NEEDS_READING: the same step 2, 'We need to read your question again. Press Back, then Next.' and Start greyed", async () => {
    keep(keptOf(), "NEEDS_READING");
    await pickedUp();
    expect(onStepTwo()).toBe(true);
    expect(rows()).toHaveLength(5);
    expect(textCount(READ_AGAIN)).toBeGreaterThanOrEqual(1);
    expect(startButton().disabled).toBe(true);
    noAiCall();
  });

  it("LEFT_EARLY: the answers, no rows, its own line, and Start works", async () => {
    const empty: PathPlan = { ...pathPlanFromMenu(NUCLEAR_MENU, 5, false), paths: [], more: [], cards: [], suggestions: [], seenPathRefs: [] };
    keep(keptOf(empty, { menu: null, end: "LEFT_EARLY", lateLists: [] }));
    await pickedUp();
    expect(onStepTwo()).toBe(true);
    expect(rows()).toEqual([]);
    expect(buttonNamed("Up to 2050.", host!)!.getAttribute("aria-pressed")).toBe("true");
    expect(textCount(LEFT_EARLY)).toBe(1);
    expect(startButton().disabled).toBe(false);
    noAiCall();
  });

  it("the fresh room's widths [3,5] with seven kept paths: the narrowed line, Start greyed until two are removed (answer Q8)", async () => {
    server.roomAnswer = () => Promise.resolve(room({ start_step: { lists: "ON", widths: { options: [3, 5], default: 5 }, share_by_paths: [4, 6, 8, 10, 12] } }));
    const seven = pathPlanFromMenu(NUCLEAR_MENU, 7, false);
    keep(keptOf(seven, { width: 7 }));
    await pickedUp();
    expect(rows()).toHaveLength(7);
    expect(textCount(NARROWED_5)).toBe(1);
    expect(startButton().disabled).toBe(true);
    await removePath(7);
    expect(startButton().disabled).toBe(true);
    await removePath(6);
    expect(textCount(NARROWED_5)).toBe(0);
    expect(startButton().disabled).toBe(false);
  });

  it("GONE: the list is read again (and no longer holds it); a document the page cannot read: step 1 with its title", async () => {
    net.list = [{ id: PICKED, question: Q, saved_at: SAVED_AT }];
    await mount();
    const listReads = (): number => accountCalls().filter((call) => call.method === "GET" && call.path === SAVED).length;
    const before = listReads();
    net.list = [];
    await click(pickUp());
    expect(onStepTwo()).toBe(false);
    expect(listReads()).toBe(before + 1);
    expect(host!.querySelector(".v4NotStarted")).toBeNull();
    keep();
    net.reads = { [PICKED]: { ...(net.reads[PICKED] as Record<string, unknown>), doc: { v: 2, reading: {}, page: {} } } };
    await act(async () => root?.unmount());
    host?.remove();
    await mount();
    await click(pickUp());
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    noAiCall();
  });

  // Review (wave 16, Task 76e's open point 4): the restore's fresh room read failing must not take the card away. Before the
  // fix, useAskRoom's failed read blanked the room, the start card went, and Start sent the line alone (no paths, no id).
  it("a fresh room read that fails at Pick up keeps the card: the rows stay, and Start sends the kept paths and the id", async () => {
    keep();
    await mount();
    const reads = server.roomReads;
    server.roomAnswer = () => Promise.reject(new Error("SERVER_FAILURE"));
    await click(pickUp());
    expect(server.roomReads).toBeGreaterThan(reads);
    expect(onStepTwo()).toBe(true);
    expect(rows()).toHaveLength(5);
    expect(startButton().disabled).toBe(false);
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    const sent = lane()!;
    expect((sent.startPaths as { paths: unknown[] }).paths).toHaveLength(5);
    expect(sent.savedQuestionId).toBe(PICKED);
    noAiCall();
  });

  it("crisis words in a saved own path open the help screen instead of step 2", async () => {
    keep(keptOf(shapedPlan(CRISIS)));
    await pickedUp();
    expect(document.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
    expect(onStepTwo()).toBe(false);
    noAiCall();
  });

  it("Back goes to step 1 with the question and 'Your paths are kept. Press Next to see them.'", async () => {
    keep();
    await pickedUp();
    await browserBack();
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    expect(textCount(KEPT_LINE)).toBe(1);
    expect(window.history.state).toEqual({ __NA: true, tree: [1], v4ask: { step: "ask", words: Q } });
    noAiCall();
  });
});

describe("a reload on step 2 reopens it from the account (owner answer S1 A)", () => {
  it("a remount on ?step=2 whose entry holds the id: the same restore with no AI call", async () => {
    keep();
    window.history.replaceState({ __NA: true, v4ask: { step: "read", words: Q, savedId: PICKED } }, "", "/v4?step=2");
    await mount();
    expect(onStepTwo()).toBe(true);
    expect(callNames(accountCalls())).toEqual([`GET ${SAVED}/${PICKED}`]);
    expect(rows()).toHaveLength(5);
    expect(box().value.endsWith("Until when? Up to 2050.")).toBe(true);
    expect(window.location.search).toBe("?step=2");
    expect(textCount(RELOAD_LINE)).toBe(0);
    noAiCall();
  });

  it("GONE: step 1 with the entry's words, as Task 76c says", async () => {
    window.history.replaceState({ __NA: true, v4ask: { step: "read", words: Q, savedId: PICKED } }, "", "/v4?step=2");
    await mount();
    expect(onStepTwo()).toBe(false);
    expect(stepOneBox().value).toBe(Q);
    expect(window.history.state).toEqual({ __NA: true, v4ask: { step: "ask", words: Q } });
    expect(window.location.search).toBe("");
    noAiCall();
  });

  it("the banner's Reload sends the waiting change before the page reloads", async () => {
    vi.useFakeTimers();
    keep();
    await pickedUp();
    await click(buttonNamed("Up to 2030.", host!)!);
    server.roomAnswer = () => Promise.resolve(room({ settings_version: 32 }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await settle();
    const reload = buttonNamed("Reload", host!);
    expect(reload).toBeDefined();
    expect(order.filter((one) => one === "PUT")).toEqual([]);
    await click(reload!);
    expect(order.slice(-2)).toEqual(["PUT", "RELOAD"]);
    const put = accountCalls().find((call) => call.method === "PUT")!;
    expect(put.path).toBe(`${SAVED}/${PICKED}`);
    expect(put.body!.revision).toBe(3);
    expect(put.body!.doc!.page.box.text).toContain("Up to 2030.");
  });
});
