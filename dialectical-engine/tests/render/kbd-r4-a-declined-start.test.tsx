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
 * Keyboard audit round 4 (2026-11-12), A2: on step 2 reached without consent in this page (here Pick up: the page restores step 2
 * and never asks), Start, then "I don't agree", shows the declined line with "Show it again". Pressing it opens the consent
 * screen again; the line (and its button) must stay until consent is given, so the screen records "Show it again" as its opener
 * and a second "I don't agree" gives focus back to it, as step 1's Next line does. The harness is v4-pick-up's, with the REAL
 * sensitive-data consent hook and screen over a stood-in consent client (a fresh mount: nothing given yet). Made-up figures.
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
      readSensitiveDataConsent: async () => ({ status: "required" }),
      giveSensitiveDataConsent: async () => ({ status: "given" }),
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
import {
  combineMembersKey, pathPlanCombineMembers, pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths, type PathPlan, type PathPlanAction
} from "../../apps/ui/lib/v4/pathPlan.js";
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

const SHOW_AGAIN = CATALOG["v4.ask.consentShowAgain"]!;
const DECLINE = HOME["home.sensitiveConsent.decline"]!;
const consentScreen = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-dialog="sensitive-data-consent"]');
const declineButton = (): HTMLButtonElement => consentScreen()!.querySelector<HTMLButtonElement>(".sensitiveConsentDecline")!;
const showAgain = (): HTMLButtonElement | undefined => host!.querySelector(".v4AskDeclined") === null ? undefined
  : buttonNamed(SHOW_AGAIN, host!.querySelector(".v4AskDeclined")!);

describe("A2: step 2's declined line stays until consent is given", () => {
  it("after Pick up: Start, I don't agree, Show it again, I don't agree: focus is back on Show it again", async () => {
    expect(DECLINE).toBeTruthy();
    keep();
    await pickedUp();
    expect(onStepTwo()).toBe(true);
    startButton().focus();
    await press(startButton());
    expect(consentScreen(), "Start asks for consent (none given in this page)").not.toBeNull();
    await press(declineButton());
    expect(consentScreen()).toBeNull();
    const again = showAgain();
    expect(again, "the declined line with Show it again").toBeDefined();
    again!.focus();
    await press(again!);
    expect(consentScreen(), "Show it again opens the screen").not.toBeNull();
    expect(showAgain(), "the line stays while the screen is up").toBeDefined();
    await press(declineButton());
    expect(consentScreen()).toBeNull();
    expect(showAgain()).toBeDefined();
    expect(document.activeElement, "focus goes back to Show it again").toBe(showAgain());
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("once consent is given at Show it again, the line goes and the press goes on", async () => {
    keep();
    await pickedUp();
    await press(startButton());
    await press(declineButton());
    await press(showAgain()!);
    await press(consentScreen()!.querySelector<HTMLButtonElement>(".policyPrimary")!);
    expect(consentScreen()).toBeNull();
    expect(host!.querySelector(".v4AskDeclined")).toBeNull();
    expect(server.createDebate).toHaveBeenCalledTimes(1);
  });
});
