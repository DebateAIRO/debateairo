// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  warmCrisisCheck, type AskClarifyResponse, type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse,
  type StartListsEvent, type StartListsRequest, type StartMergeRequest, type StartMergeResponse, type StartStepRoom
} from "@debateai/contract";

/*
 * Keyboard audit 2026-11-12, wave 3 fix round (A8, A10), on the stand-ins of v4-site-updated.test.tsx (copied: that file is
 * not a shared helper). The ask page marks where its content starts for the skip link (`#page-content`, tabIndex -1): one
 * mark on the rendered page, on the step's own root, in every state. The site-updated banner, when it comes mid-session,
 * takes no mark: the mark staying where it was keeps focus where the skip link put it. Made-up words only.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void };
type MergeCall = { input: StartMergeRequest; answer: (response: StartMergeResponse) => void };
type CombineCall = { input: StartCombineRequest; answer: (response: StartCombineResponse) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void };

const server = vi.hoisted(() => ({
  roomAnswer: (_read: number): Promise<unknown> => Promise.resolve(null),
  roomReads: 0,
  clarifyAnswer: (_line: string): Promise<unknown> => Promise.resolve({ source: "NONE" }),
  asked: [] as string[],
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as CombineCall[],
  fits: [] as FitCall[],
  createDebate: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ id: "11111111-1111-4111-8111-111111111111" }))
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
/** The full reloads the banner asked for. */
const reloads = vi.hoisted(() => ({ count: 0 }));
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
  reloadPage: () => { reloads.count += 1; }
}));
// Start waits out its Undo window before the send; here the window is 0 (the window itself: v4-start-undo).
vi.mock("@/lib/v4/startUndo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/v4/startUndo.js")>()), START_UNDO_MS: 0
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
      server.asked.push(input.question_line);
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
import { boxOf, boxPlace } from "../../apps/ui/lib/v4/questionBox.js";
import { pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { SITE_VERSION_POLL_MS } from "../../apps/ui/lib/v4/siteVersion.js";
import { startKeptOf, type V4StartKept } from "../../apps/ui/lib/v4/startKept.js";
import { useAskClarify } from "../../apps/ui/lib/v4/useAskClarify.js";
import { useStartPaths, type V4StartCardState } from "../../apps/ui/lib/v4/useStartPaths.js";
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
const UPDATED = "We've updated the site. Reload to get the newest version; your question and your paths stay.";
const RELOAD_LINE = "Reloading this page reads your question again.";
const NARROWED_5 = "We've updated the site: it now looks into up to 5 paths. Combine or remove paths down to 5 to start.";
const AI = { source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] } as const satisfies AskClarifyResponse;

/** Made-up shares of today for 1..7 paths. */
const START_STEP = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [4, 6, 8, 10, 12, 14, 16] };
const room = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", start_step: START_STEP, ...over
});
/**
 * The room answers this settings version (undefined: none) on every read until a test serves another: the page reads the room
 * more than once as it opens (its query changes once the plan is known), and all those reads are one version.
 */
const serving = (version: number | undefined) => (): Promise<unknown> =>
  Promise.resolve(room(version === undefined ? {} : { settings_version: version }));

async function focusWindow(): Promise<void> {
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await settle();
}

const CHECK: StartListsEvent = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } };
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });

function reduced(plan: PathPlan, ...actions: PathPlanAction[]): PathPlan {
  return actions.reduce((held, action) => pathPlanReduce(held, action).plan, plan);
}

/** Five shaped paths: kp01 and kp02 combined by the person, written by the AI combine (its reference "cmb.sig"), and an own path. */
function shapedPlan(): PathPlan {
  const combined = reduced(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" },
    { type: "COMBINE_SELECTED" });
  const writing = combined.paths.find((path) => path.wording === "WRITING")!;
  return reduced(combined,
    { type: "COMBINE_WRITTEN", key: writing.key, title: "Hard weeks and using less", question: "How would Romania get through its hardest weeks?",
      combineRef: "cmb.sig" },
    { type: "ADD_OWN", text: "Fish in the Danube", intoPathKey: null });
}

const NORTH_BOX = boxPlace(boxOf(Q), { key: "Which region?", text: "Which region? The north." }, ["Which region?"]);

/** Step 2 as the account would keep it (made up): the box with the answer, the questions as shown, the check, the menu and a late list. */
function keptOf(plan: PathPlan = shapedPlan(), over: Partial<V4StartKept> = {}): V4StartKept {
  return {
    v: 1, readLine: Q, box: NORTH_BOX, sentGoal: { answers: [{ question: "Which region?", answer: "The north.", other: false }], matters: "" },
    clarify: AI, check: { ref: "chk.sig" }, menu: signedMenu(NUCLEAR_MENU), lists: [], lateLists: [signedList(3)], end: "READY",
    plan, width: plan.width, mode: "thorough", carryOn: false, ...over
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every held row of the clarifying questions that ever reached the page (read-f23). */
let heldRowsSeen = 0;
let watcher: MutationObserver | null = null;

beforeEach(() => {
  server.roomAnswer = serving(31);
  server.roomReads = 0;
  server.clarifyAnswer = () => Promise.resolve(AI);
  server.asked = [];
  server.lists = [];
  server.merges = [];
  server.combines = [];
  server.fits = [];
  server.createDebate.mockReset();
  server.createDebate.mockImplementation(async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
  router.push.mockReset();
  reloads.count = 0;
  heldRowsSeen = 0;
  window.history.replaceState(null, "", "/v4");
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
  Reflect.deleteProperty(document, "visibilityState");
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(kept?: unknown): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  watcher?.disconnect();
  watcher = new MutationObserver(() => { heldRowsSeen += host?.querySelectorAll(".v4AskHeldRow").length ?? 0; });
  watcher.observe(host, { childList: true, subtree: true });
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={CATALOG} homeCatalog={HOME} newDebateCatalog={NEW_DEBATE} billingCatalog={BILLING} locale="en"
      crisisCountryHint={null} initialQuestion={Q} initialLevel="plain" {...(kept === undefined ? {} : { kept: kept as V4StartKept })} />
  ));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

/** Start or "Just answer it", then its Undo window (0 here) runs out and what it sends settles. */
async function press(target: Element): Promise<void> {
  await click(target);
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  await settle();
}

async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const nextButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4AskActions .v4BtnPrimary")!;
const startButton = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>(".v4StartBarStart")!;
const box = (): HTMLTextAreaElement => host!.querySelector<HTMLTextAreaElement>(".v4AskCard textarea")!;
const onStepTwo = (): boolean => host!.querySelector(".v4AskReadTitle") !== null;
const rows = (): HTMLElement[] => [...host!.querySelectorAll<HTMLElement>(".v4StartList .v4StartRow")];
const banner = (): HTMLElement | null => [...host!.querySelectorAll<HTMLElement>("[role='status']")]
  .find((region) => region.textContent?.includes(UPDATED)) ?? null;
const textCount = (text: string): number => (host!.textContent ?? "").split(text).length - 1;
const lane = (call = -1): Record<string, unknown> | undefined => server.createDebate.mock.calls.at(call)![8] as Record<string, unknown> | undefined;

async function emit(...events: StartListsEvent[]): Promise<void> {
  await act(async () => { for (const event of events) server.lists.at(-1)!.onEvent(event); });
  await settle();
}

async function toReady(): Promise<void> {
  await emit(CHECK, list(1), list(2), cut(2));
  await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(NUCLEAR_MENU) }); });
  await settle();
}

async function removePath(n: number): Promise<void> {
  await click(rows()[n - 1]!.querySelector(".v4StartRowMore")!);
  const remove = [...host!.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === "Remove");
  await click(remove!);
}

const marks = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("#page-content")];
/** Exactly one mark on the rendered page, focusable from script only, and it is the element `where` names. */
function oneMarkOn(where: string): HTMLElement {
  const all = marks();
  expect(all, "one #page-content in the rendered page").toHaveLength(1);
  expect(all[0]!.getAttribute("tabindex")).toBe("-1");
  expect(all[0]!.matches(where), `the mark is on ${where}`).toBe(true);
  return all[0]!;
}

describe("the ask page's content start (A10) and the update banner (A8)", () => {
  it("step 1: one mark, on the step's root; the banner comes and the mark (and the focus on it) stays", async () => {
    vi.useFakeTimers();
    await mount();
    const mark = oneMarkOn(".v4AskMain");
    act(() => mark.focus());
    server.roomAnswer = serving(32);
    await wait(SITE_VERSION_POLL_MS);
    expect(banner()).not.toBeNull();
    expect(banner()!.id, "the banner carries no mark").toBe("");
    expect(oneMarkOn(".v4AskMain")).toBe(mark);
    expect(document.activeElement).toBe(mark);
  });

  it("step 2: one mark, on the step's root, before and after the banner", async () => {
    vi.useFakeTimers();
    await mount();
    await click(nextButton());
    await toReady();
    expect(onStepTwo()).toBe(true);
    const mark = oneMarkOn(".v4AskMainRead");
    server.roomAnswer = serving(32);
    await wait(SITE_VERSION_POLL_MS);
    expect(banner()).not.toBeNull();
    expect(oneMarkOn(".v4AskMainRead")).toBe(mark);
  });
});
