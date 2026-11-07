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
 * V4 start step, Task 76e (owner answer Q8 "Your rule, no time limit"; read-f2, choose-f2; amended 4 Nov night by owner answer
 * S1 A and review items read-f3 and read-f23): when the site is updated while the ask page is open, one banner says so, on step
 * 1 and on step 2, with Reload; the card's quiet reload line goes while it shows; step 1 sends nothing until Next. Step 2 is
 * never written into the tab's history (S1 A): the account keeps it (Task 76f), and the page's restore opens it exactly as kept
 * with no AI call, the seeded clarifying questions drawn at once (read-f23). The page, its hooks, the card and the bar are the
 * real ones; only the session, the consent, the header, the server and the page reload are stood in. Every figure and text
 * is made up.
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
// Task 76b: Start waits its 10-second Undo window before the send; here the window is 0 (the 10 seconds: v4-start-undo).
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

describe("the update banner (owner answer Q8, splice ruling: either way)", () => {
  it("31, then 32 after SITE_VERSION_POLL_MS: the banner with Reload on step 1, in a status region", async () => {
    vi.useFakeTimers();
    await mount();
    expect(banner()).toBeNull();
    server.roomAnswer = serving(32);
    const reads = server.roomReads;
    await wait(SITE_VERSION_POLL_MS - 1_000);
    expect(server.roomReads).toBe(reads);
    expect(banner()).toBeNull();
    await wait(1_000);
    expect(server.roomReads).toBe(reads + 1);
    expect(banner()).not.toBeNull();
    expect(banner()!.getAttribute("role")).toBe("status");
    expect(buttonNamed("Reload", banner()!)).toBeDefined();
    expect(onStepTwo()).toBe(false);
  });

  it("on step 2 too; while it shows the card holds no reload line, and without it the line shows as Task 73 says", async () => {
    vi.useFakeTimers();
    await mount();
    await click(nextButton());
    await toReady();
    expect(onStepTwo()).toBe(true);
    expect(banner()).toBeNull();
    expect(textCount(RELOAD_LINE)).toBe(1);
    server.roomAnswer = serving(32);
    await wait(SITE_VERSION_POLL_MS);
    expect(banner()).not.toBeNull();
    expect(textCount(UPDATED)).toBe(1);
    expect(textCount(RELOAD_LINE)).toBe(0);
    // The paths and the box stay as they were: nothing is read again.
    expect(rows()).toHaveLength(5);
    expect(server.lists).toHaveLength(1);
    expect(server.asked).toEqual([Q]);
  });

  it("a focus event reads the room, and so does becoming visible", async () => {
    await mount();
    const reads = server.roomReads;
    await focusWindow();
    expect(server.roomReads).toBe(reads + 1);
    expect(banner()).toBeNull();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(server.roomReads).toBe(reads + 1);
    server.roomAnswer = serving(32);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(server.roomReads).toBe(reads + 2);
    expect(banner()).not.toBeNull();
  });

  it("a way back (32, then 31) shows it too", async () => {
    server.roomAnswer = serving(32);
    await mount();
    expect(banner()).toBeNull();
    server.roomAnswer = serving(31);
    await focusWindow();
    expect(banner()).not.toBeNull();
  });

  it("a room with no settings_version never shows it, and equal versions never show it", async () => {
    server.roomAnswer = serving(undefined);
    await mount();
    server.roomAnswer = serving(32);
    await focusWindow();
    expect(banner()).toBeNull();
    await act(async () => root?.unmount());
    host?.remove();
    server.roomAnswer = serving(31);
    await mount();
    server.roomAnswer = serving(undefined);
    await focusWindow();
    expect(banner()).toBeNull();
    await act(async () => root?.unmount());
    host?.remove();
    server.roomAnswer = serving(31);
    await mount();
    const reads = server.roomReads;
    for (let read = 0; read < 3; read += 1) await focusWindow();
    expect(server.roomReads).toBe(reads + 3);
    expect(banner()).toBeNull();
  });

  it("on step 1 the banner sends nothing; Next posts as always, one lists request", async () => {
    vi.useFakeTimers();
    await mount();
    server.roomAnswer = serving(32);
    await wait(SITE_VERSION_POLL_MS);
    expect(banner()).not.toBeNull();
    await wait(SITE_VERSION_POLL_MS);
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    expect(server.merges).toEqual([]);
    expect(server.createDebate).not.toHaveBeenCalled();
    await click(nextButton());
    expect(onStepTwo()).toBe(true);
    expect(server.lists).toHaveLength(1);
    expect(server.lists[0]!.input.question_line).toBe(Q);
    expect(banner()).not.toBeNull();
  });

  it("a read of the update check that fails never takes step 2's card away: the paths stay and Start still works", async () => {
    await mount();
    await click(nextButton());
    await toReady();
    expect(rows()).toHaveLength(5);
    server.roomAnswer = () => Promise.reject(new Error("SERVER_FAILURE"));
    await focusWindow();
    expect(rows()).toHaveLength(5);
    expect(startButton().disabled).toBe(false);
    expect(banner()).toBeNull();
    await press(startButton());
    expect((lane()!.startPaths as { paths: unknown[] }).paths).toHaveLength(5);
  });

  it("Reload reloads the page once, and nothing else is sent", async () => {
    await mount();
    server.roomAnswer = serving(32);
    await focusWindow();
    await click(buttonNamed("Reload", banner()!)!);
    expect(reloads.count).toBe(1);
    expect(server.lists).toEqual([]);
    expect(server.createDebate).not.toHaveBeenCalled();
  });

  it("the tab's history never holds a kept step 2 (owner answer S1 A), with the banner or after a restore", async () => {
    const replaced = vi.spyOn(window.history, "replaceState");
    const pushed = vi.spyOn(window.history, "pushState");
    await mount();
    await click(nextButton());
    await toReady();
    server.roomAnswer = serving(32);
    await focusWindow();
    expect(banner()).not.toBeNull();
    await act(async () => root?.unmount());
    host?.remove();
    await mount(keptOf());
    expect(onStepTwo()).toBe(true);
    const states = [...replaced.mock.calls, ...pushed.mock.calls].map(([state]) => state as { v4ask?: Record<string, unknown> } | null);
    expect(states.length).toBeGreaterThan(0);
    for (const state of states) expect(state?.v4ask === undefined || !("kept" in state.v4ask)).toBe(true);
  });

  it("siteVersion.ts and startKept.ts touch no browser storage", () => {
    for (const file of ["siteVersion.ts", "startKept.ts"]) {
      const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/lib/v4", file), "utf8");
      expect(source, file).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/u);
    }
  });
});

describe("the restore: step 2 exactly as kept, with no AI call (owner answer S1 A; read-f23)", () => {
  it("five shaped paths, the box and the clarifying questions with 'The north.' picked; no clarify, lists or merge call, no held row", async () => {
    const kept = keptOf();
    await mount(kept);
    expect(onStepTwo()).toBe(true);
    expect(box().value).toBe(`${Q}\n\nWhich region? The north.`);
    expect(rows()).toHaveLength(5);
    const titles = rows().map((row) => row.textContent ?? "");
    expect(titles.filter((text) => text.includes("Hard weeks and using less") && text.includes("combined by you"))).toHaveLength(1);
    expect(titles.filter((text) => text.includes("Fish in the Danube") && text.includes("added by you"))).toHaveLength(1);
    expect(buttonNamed("The north.", host!)!.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("The south.", host!)!.getAttribute("aria-pressed")).toBe("false");
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    expect(server.merges).toEqual([]);
    expect(server.combines).toEqual([]);
    expect(heldRowsSeen).toBe(0);
    expect(host!.querySelector(".v4AskHeldRow")).toBeNull();
    // The room is read fresh for the restore (its widths reach the card).
    expect(server.roomReads).toBeGreaterThanOrEqual(2);
    expect(startButton().disabled).toBe(false);
  });

  it("Start after the restore sends the kept start_check and start_paths byte for byte, with the box's line", async () => {
    const kept = keptOf();
    await mount(kept);
    await press(startButton());
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![0]).toBe(`${Q}\n\nWhich region? The north.`);
    const sent = lane()!;
    expect(JSON.stringify(sent.startCheck)).toBe(JSON.stringify({ ref: "chk.sig" }));
    const expected = { source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: [...pathPlanToStartPaths(kept.plan)], width: kept.plan.width,
      chosen_by: "PERSON", late_lists: [signedList(3)] };
    expect(JSON.stringify(sent.startPaths)).toBe(JSON.stringify(expected));
    const paths = (sent.startPaths as { paths: Array<{ combine_ref?: string }> }).paths;
    expect(paths.filter((path) => path.combine_ref === "cmb.sig")).toHaveLength(1);
    expect(server.merges).toEqual([]);
  });

  it("the fresh room's widths [3,5] with seven kept paths: Start waits with the narrowed line until two are removed (answer Q8)", async () => {
    server.roomAnswer = () => Promise.resolve(room({ settings_version: 32,
      start_step: { lists: "ON", widths: { options: [3, 5], default: 5 }, share_by_paths: [4, 6, 8, 10, 12] } }));
    const seven = pathPlanFromMenu(NUCLEAR_MENU, 7, false);
    await mount(keptOf(seven));
    expect(rows()).toHaveLength(7);
    expect(textCount(NARROWED_5)).toBe(1);
    expect(startButton().disabled).toBe(true);
    await removePath(7);
    expect(startButton().disabled).toBe(true);
    await removePath(6);
    expect(textCount(NARROWED_5)).toBe(0);
    expect(startButton().disabled).toBe(false);
    // A picked-up step 2 shows no update banner: it reacts only to an update while the page is open (saved-questions spec §3.10).
    expect(banner()).toBeNull();
  });

  it("a kept step 2 the page cannot read (another v, a missing member) is ignored: step 1 as Task 76c says, and nothing is asked", async () => {
    await mount({ ...keptOf(), v: 2 });
    expect(onStepTwo()).toBe(false);
    await act(async () => root?.unmount());
    host?.remove();
    const { plan: _plan, ...noPlan } = keptOf();
    await mount(noPlan);
    expect(onStepTwo()).toBe(false);
    expect(server.asked).toEqual([]);
    expect(server.lists).toEqual([]);
    expect(startKeptOf(keptOf())).not.toBeNull();
    expect(startKeptOf({ ...keptOf(), v: 2 })).toBeNull();
    expect(startKeptOf(noPlan)).toBeNull();
    expect(startKeptOf({ ...keptOf(), menu: null })).toBeNull();
    expect(startKeptOf({ ...keptOf(), menu: null, end: "NONE", noneReason: "DEADLINE" })).not.toBeNull();
    expect(startKeptOf(null)).toBeNull();
  });
});

describe("useStartPaths: the reading Task 76f saves, and a kept step 2", () => {
  const ROOM: StartStepRoom = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [5, 8, 11, 15, 18, 22, 25] };
  type Input = Parameters<typeof useStartPaths>[0];
  const BASE: Input = { active: true, questionLine: Q, siteLanguage: "en", readingLevel: "background", clarify: null, room: ROOM, freePlan: false };
  let card: V4StartCardState | null = null;
  function Probe(input: Readonly<{ input: Input }>): ReactNode {
    card = useStartPaths(input.input);
    return null;
  }
  async function probe(input: Input): Promise<void> {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe input={input} />));
    await settle();
  }

  it("reading: null before the check; then the check, its language and seats, LEFT_EARLY until the list; READY with the menu", async () => {
    await probe(BASE);
    expect(card!.reading).toBeNull();
    await emit(CHECK);
    expect(card!.reading).toEqual({ check: { ref: "chk.sig" }, menu: null, lateLists: [], end: "LEFT_EARLY", checkedLine: Q,
      readingLevel: "background", language: { code: "en", name: "English" }, seats: 4 });
    await emit(list(1), list(2), cut(2));
    await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(NUCLEAR_MENU) }); });
    await settle();
    expect(card!.reading).toMatchObject({ end: "READY", menu: signedMenu(NUCLEAR_MENU), lateLists: [] });
    expect(card!.reading).not.toHaveProperty("noneReason");
  });

  it("reading: NONE with its reason", async () => {
    await probe(BASE);
    await emit(CHECK, { event: "none", data: { reason: "DEADLINE" } });
    expect(card!.phase).toBe("NONE");
    expect(card!.reading).toMatchObject({ end: "NONE", noneReason: "DEADLINE", menu: null });
  });

  it("kept: READY with the kept plan and lists, nothing posted; a path still being written shows its joined words, with no call", async () => {
    const writing = reduced(pathPlanFromMenu(NUCLEAR_MENU, 5, false), { type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" },
      { type: "COMBINE_SELECTED" }, { type: "SELECT", key: "kp03" });
    expect(writing.paths.some((path) => path.wording === "WRITING")).toBe(true);
    await probe({ ...BASE, kept: keptOf(writing) });
    expect(server.lists).toEqual([]);
    expect(card!.phase).toBe("READY");
    expect(card!.plan!.paths.map((path) => path.key)).toEqual(writing.paths.map((path) => path.key));
    expect(card!.plan!.paths.filter((path) => path.wording === "WRITING")).toEqual([]);
    expect(card!.plan!.paths.filter((path) => path.wording === "FALLBACK")).toHaveLength(1);
    expect(card!.plan!.selected).toEqual([]);
    expect(card!.plan!.undo).toEqual(writing.undo.map((step) => ({ ...step, paths: step.paths.map((path) => path.wording === "WRITING"
      ? { ...path, wording: "FALLBACK", combineRef: null } : path) })));
    expect(card!.lateLists).toEqual([signedList(3)]);
    expect(card!.checkedLine).toBe(Q);
    expect(card!.reading).toMatchObject({ check: { ref: "chk.sig" }, end: "READY", lateLists: [signedList(3)], checkedLine: Q });
    expect(card!.startReady).toBe(true);
    await settle();
    expect(server.combines).toEqual([]);
    expect(server.merges).toEqual([]);
  });

  it("kept: NONE and LEFT_EARLY open with no list, Start works, and nothing is posted", async () => {
    await probe({ ...BASE, kept: keptOf(shapedPlan(), { menu: null, end: "NONE", noneReason: "DEADLINE", lateLists: [] }) });
    expect(card!.phase).toBe("NONE");
    expect(card!.noneLine).toBe("TOO_SLOW");
    expect(card!.reading).toMatchObject({ end: "NONE", noneReason: "DEADLINE" });
    await act(async () => root?.unmount());
    host?.remove();
    await probe({ ...BASE, kept: keptOf(shapedPlan(), { menu: null, end: "LEFT_EARLY", lateLists: [] }) });
    expect(card!.phase).toBe("NONE");
    expect(card!.startReady).toBe(true);
    expect(card!.plan).toBeNull();
    expect(card!.reading).toMatchObject({ end: "LEFT_EARLY", menu: null });
    expect(server.lists).toEqual([]);
  });
});

describe("useAskClarify: a seed shows its reply without a call", () => {
  it("the seeded reply at once, never waiting, and no call", async () => {
    let clarify: ReturnType<typeof useAskClarify> | null = null;
    const waited: boolean[] = [];
    function Probe(): ReactNode {
      clarify = useAskClarify({ active: true, question: Q, mayCall: true, seed: AI });
      waited.push(clarify.waiting);
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe />));
    await settle();
    expect(clarify!.reply).toEqual(AI);
    expect(clarify!.line).toBe(Q);
    expect(waited.every((one) => !one)).toBe(true);
    expect(server.asked).toEqual([]);
  });
});
