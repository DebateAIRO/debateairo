// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RunProjectionSchema, warmCrisisCheck, type AnswerBranch, type RunProjection, type StartListsEvent, type StartListsRequest,
  type StartMergeRequest, type StartMergeResponse
} from "../../packages/contract/src/index.js";

/*
 * No blank page between Start and the map, even when the map takes long: after Start's Undo window the ask page hands its
 * question and paths to the map page in this tab's memory (lib/v4/startHandOff.ts). The map page draws them, each being looked
 * into, with one quiet "Starting…", while the session is checked (in the held header bar's place) and while its first run read
 * is on its way (under the real header); then the run map takes over with the same path ids and the same header element. A
 * reload, another run, or a hand-off older than a minute: today's grey outline. Only the reads, the session check and the
 * server are stood in; the pages, the map pieces and the hand-off are the real ones. All words are made up.
 */

const which = vi.hoisted(() => ({ page: "map" as "map" | "ask" }));
/** The session check (AuthGate): checking until a test finishes it. */
const gate = vi.hoisted(() => ({ checking: true, finish: null as null | (() => void) }));
/** The map page's debate reads: while `hold`, each read waits here until the test answers it. */
const reads = vi.hoisted(() => ({ hold: true, waiting: [] as ((value: unknown) => void)[] }));
const server = vi.hoisted(() => ({
  lists: [] as { input: StartListsRequest; onEvent: (event: StartListsEvent) => void }[],
  merges: [] as { input: StartMergeRequest; answer: (response: StartMergeResponse) => void }[],
  createDebate: null as null | ((...args: unknown[]) => Promise<unknown>)
}));
/** The hand-off as the map page will find it, read at the moment the ask page moves to the map. */
const router = vi.hoisted(() => ({ push: null as null | ((href: string) => void), pushed: [] as Readonly<{ href: string; handOff: unknown }>[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => router.push?.(href) }) }));
vi.mock("@/components/AuthGate", async () => {
  const { createElement, Fragment, useState } = await import("react");
  return {
    AuthGate: ({ children, checkingView }: { children: (token: string) => ReactNode; checkingView?: ReactNode }) => {
      const [checking, setChecking] = useState(gate.checking);
      gate.finish = () => setChecking(false);
      return createElement(Fragment, null, checking ? checkingView : children("token"));
    }
  };
});
vi.mock("@/components/v4/V4AskGate", () => ({ V4AskGate: ({ children }: { children: (session: "IN") => ReactNode }) => children("IN") }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/lib/v4/carryOn", () => ({ CARRY_ON_BUILT: true }));
vi.mock("@/lib/api", async (original) => {
  const real = await original<typeof import("../../apps/ui/lib/api.js")>();
  const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
    signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
  };
  // The ask page's server, as Task 76b's harness stands it in (no saved questions); the map page keeps the real client.
  const askClient: Record<string, unknown> = {
    readAnswerIndex: async () => ({ items: [], open_runs: [], limit: 32, offset: 0, total: 0 }),
    readDigLinks: async () => ({ parent: null, children: [] }),
    readReadingLevel: async () => ({ reading_level: "plain" }),
    saveReadingLevel: async () => ({ reading_level: "plain" }),
    getAskRoom: async () => ({
      room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS",
      start_step: { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] }
    }),
    clarifyAsk: async () => ({ source: "AI", questions: [{ text: "Which region?", answers: ["The north.", "The south."] }] }),
    startPathLists: (input: StartListsRequest, onEvent: (event: StartListsEvent) => void, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      abortable(signal, reject);
      server.lists.push({ input, onEvent });
    }),
    startPathMerge: (input: StartMergeRequest, signal?: AbortSignal) => new Promise<StartMergeResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.merges.push({ input, answer: resolve });
    })
  };
  const client = new Proxy({}, {
    get: (_target, property) => (which.page === "ask" ? Reflect.get(askClient, property) : Reflect.get(real.contractClient, property))
  });
  return { ...real, createDebate: (...args: unknown[]) => server.createDebate!(...args), contractClient: client };
});
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async (original) => ({ ...(await original<Record<string, unknown>>()), RoomNotice: () => null }));
vi.mock("@/lib/v4/useV4Ask", async (original) => {
  const real = await original<typeof import("../../apps/ui/lib/v4/useV4Ask.js")>();
  const stand = (await import("./v4-debate-harness.js")).useV4AskMock;
  // The ask page runs the real hook (its ask reaches createDebate); the map page the debate harness's stand-in.
  return { ...real, useV4Ask: (input: Parameters<typeof real.useV4Ask>[0]) => (which.page === "ask" ? real.useV4Ask(input) : stand.useV4Ask(input as never)) };
});
vi.mock("@/lib/v4/load", async (original) => {
  const base = (await import("./v4-debate-harness.js")).loadMock(await original());
  return {
    ...base,
    loadV4: (id: string) => (reads.hold ? new Promise((answer) => { reads.waiting.push(answer); }) : (base.loadV4 as (id: string) => Promise<unknown>)(id))
  };
});
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { pathPlanFromMenu } from "../../apps/ui/lib/v4/pathPlan.js";
import { clearHandOff, handOffFor, handOffStart, type StartHandOff } from "../../apps/ui/lib/v4/startHandOff.js";
import { START_UNDO_MS } from "../../apps/ui/lib/v4/startUndo.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedList, signedMenu } from "../support/v4-start-menu.js";
import { CATALOG, harness, mountMap, page, resetHarness, settle, unmountMap } from "./v4-debate-harness.js";

warmCrisisCheck();

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;

const QUESTION = "Should the town build a new bridge over the river?";
const T1 = "The cost to the town";
const T2 = "Traffic on the old bridge";
const STARTING = CATALOG["v4.ask.starting"]!;
const LOOKING = CATALOG["v4.paths.looking"]!;
const flat = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
const cardIds = (): (string | null)[] => [...page().querySelectorAll(".v4MapBranches [data-path-card]")].map((node) => node.getAttribute("data-path-card"));
const cards = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>(".v4MapBranches [data-path-card]")];
const header = (): HTMLElement | null => page().querySelector<HTMLElement>(".v4StandInHeader");
const before = (first: Element, second: Element): boolean => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

function handOffOf(runId: string, at = Date.now()): StartHandOff {
  return {
    runId, questionLine: QUESTION, level: "plain", at,
    paths: [
      { title: T1, question: "Can the town pay for a new bridge?", tag: null },
      { title: T2, question: "Does the old bridge carry too much traffic?", tag: "ADDED" }
    ]
  };
}

/** The first run read of the same debate: both paths still being looked into. */
function runRead(runId: string): RunProjection {
  const branch = (n: number, title: string, question: string): AnswerBranch => ({
    path_id: `b${n}`, order: n, title, question, author: n === 2 ? "PERSON_OWN_VIEW" : "AI_SUGGESTION",
    viewpoints: [{ title: n === 2 ? null : title, question, own: n === 2 }], state: "LOOKING", root_node_id: null, outcome: null
  } as AnswerBranch);
  return RunProjectionSchema.parse({
    run_ref: runId, question_line: QUESTION, state: "RUNNING", terminal_reason: null, hold_until: null,
    branches: {
      source: "MENU", width: 2,
      paths: [branch(1, T1, "Can the town pay for a new bridge?"), branch(2, T2, "Does the old bridge carry too much traffic?")],
      more: [], also_raised: [], main_trust: null, carry_on_to_report: false
    },
    path_progress: [1, 2].map((n) => ({ path_id: `b${n}`, step: "ARGUING", points: ["PUT_FORWARD"], findings: [] }))
  });
}

/** The waiting debate read answers. */
async function answerRead(value: unknown): Promise<void> {
  const answer = reads.waiting.shift();
  if (answer === undefined) throw new Error("no debate read is waiting");
  await act(async () => { answer(value); });
  await settle();
}

async function finishSessionCheck(): Promise<void> {
  await act(async () => { gate.finish?.(); });
  await settle();
}

let used: string[] = [];

beforeEach(() => {
  which.page = "map";
  gate.checking = true;
  gate.finish = null;
  reads.hold = true;
  reads.waiting = [];
  resetHarness();
  used = [];
});

afterEach(async () => {
  await unmountMap();
  await unmountAsk();
  for (const runId of used) clearHandOff(runId);
  vi.useRealTimers();
});

describe("the map page while it signs in and reads, after Start (wait-f14)", () => {
  it("while the session is checked: the question, its two paths being looked into and 'Starting…', in the held bar's place, no outline", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId));
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebOutline")).toBeNull();
    // The held header bar of the checking view (V4LoadingPage's), with the real header's size; the real header is not here yet.
    expect(page().querySelector(".v4DebOutlineHdr")).not.toBeNull();
    expect(header()).toBeNull();
    expect(flat(page().querySelector(".v4MapRoot"))).toContain(QUESTION);
    expect(cardIds()).toEqual(["b1", "b2"]);
    expect(flat(cards()[0])).toContain(T1);
    expect(flat(cards()[1])).toContain(T2);
    for (const card of cards()) expect(flat(card)).toContain(LOOKING);
    const status = [...page().querySelectorAll('.v4MapRootExtra [role="status"]')];
    expect(status.map((line) => flat(line))).toEqual([STARTING]);
    // Read-only: no pick boxes, nothing pulses.
    expect(page().querySelector("input[type=checkbox]")).toBeNull();
    expect(page().querySelector(".v4PathPulse")).toBeNull();
  });

  it("once the session is known and the run read is on its way: the same, under the real header", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId));
    await mountMap(1600, runId);
    await finishSessionCheck();
    expect(reads.waiting).toHaveLength(1);
    expect(page().querySelector(".v4DebOutline")).toBeNull();
    expect(page().querySelector(".v4DebOutlineHdr")).toBeNull();
    expect(header()).not.toBeNull();
    expect(before(header()!, page().querySelector(".v4MapRoot")!)).toBe(true);
    expect(flat(page().querySelector(".v4MapRoot"))).toContain(QUESTION);
    expect(cardIds()).toEqual(["b1", "b2"]);
    for (const card of cards()) expect(flat(card)).toContain(LOOKING);
    expect(flat(page().querySelector('.v4MapRootExtra [role="status"]'))).toBe(STARTING);
  });

  it("the first run read: the run map takes over with the same path ids, under the same header element, and the hand-off is used up", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId));
    await mountMap(1600, runId);
    await finishSessionCheck();
    const held = header();
    expect(held).not.toBeNull();
    const firstCard = page().querySelector(".v4MapRoot");
    await answerRead({ kind: "RUN", runId, run: runRead(runId) });
    expect(page().querySelector("[data-wait-block]")).not.toBeNull();
    expect(cardIds()).toEqual(["b1", "b2"]);
    expect(header()).toBe(held);
    expect(held!.isConnected).toBe(true);
    expect(page().querySelectorAll(".v4StandInHeader")).toHaveLength(1);
    expect(page().querySelector(".v4MapRoot")).not.toBeNull();
    expect(firstCard).not.toBeNull();
    expect(page().querySelector(".v4DebOutline")).toBeNull();
    // Used: a reload, or this map opened again, finds none.
    expect(handOffFor(runId, Date.now())).toBeNull();
  });

  it("an R22 run read: the map's first card alone (Task 62), under the same header element", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId));
    await mountMap(1600, runId);
    await finishSessionCheck();
    const held = header();
    expect(held).not.toBeNull();
    await answerRead({
      kind: "RUN", runId,
      run: RunProjectionSchema.parse({ run_ref: runId, question_line: QUESTION, state: "RUNNING", terminal_reason: null, hold_until: null })
    });
    expect(page().querySelector(".v4DebFirstCard")).not.toBeNull();
    expect(page().querySelector(".v4MapBranches")).toBeNull();
    expect(page().textContent).not.toContain(STARTING);
    expect(header()).toBe(held);
    expect(handOffFor(runId, Date.now())).toBeNull();
  });

  it("a first read that fails: today's status screen under the header, not the hand-off", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId));
    reads.hold = false;
    harness.loadError = new Error("made-up network fault");
    gate.checking = false;
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebCentre")).not.toBeNull();
    expect(page().querySelector(".v4MapBranches")).toBeNull();
    expect(page().textContent).not.toContain(STARTING);
    expect(header()).not.toBeNull();
  });

  it("no hand-off (a reload, another tab): today's grey outline while checking and while reading", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().querySelector(".v4MapBranches")).toBeNull();
    await finishSessionCheck();
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().querySelector(".v4MapBranches")).toBeNull();
    expect(page().textContent).not.toContain(STARTING);
  });

  it("another run's hand-off: the outline", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    const other = crypto.randomUUID();
    used.push(other);
    handOffStart(handOffOf(other));
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().textContent).not.toContain(QUESTION);
    await finishSessionCheck();
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().textContent).not.toContain(QUESTION);
  });

  it("a hand-off older than a minute: the outline", async () => {
    vi.useFakeTimers();
    const runId = crypto.randomUUID();
    used.push(runId);
    handOffStart(handOffOf(runId, Date.now() - 60_001));
    await mountMap(1600, runId);
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().textContent).not.toContain(QUESTION);
  });

  it("startHandOff.ts touches no browser storage and puts nothing in the address", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/lib/v4/startHandOff.ts"), "utf8");
    expect(source).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie/u);
    expect(source).not.toMatch(/history\.|location\./u);
  });
});

// ── The ask page (Task 76b's harness): at STARTED the hand-off is set before the move to the map ─────────────────────
let askRoot: Root | null = null;
let askHost: HTMLDivElement | null = null;

async function unmountAsk(): Promise<void> {
  await act(async () => askRoot?.unmount());
  askHost?.remove();
  askRoot = null;
  askHost = null;
}

async function flush(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function press(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await flush();
}

describe("the ask page hands the question and its paths over at STARTED (wait-f14)", () => {
  it("the hand-off holds the box's line, the plan's paths and the level before router.push is called", async () => {
    which.page = "ask";
    const runId = "11111111-1111-4111-8111-111111111111";
    used.push(runId);
    server.lists = [];
    server.merges = [];
    server.createDebate = async () => ({ id: runId });
    router.pushed = [];
    router.push = (href: string) => { router.pushed.push({ href, handOff: handOffFor(runId, Date.now()) }); };
    window.history.replaceState(null, "", "/v4");
    askHost = document.createElement("div");
    document.body.append(askHost);
    askRoot = createRoot(askHost);
    await act(async () => askRoot!.render(
      <V4AskClient catalog={CATALOG} homeCatalog={messages("home")} newDebateCatalog={messages("newDebate")} billingCatalog={messages("billing")}
        locale="en" crisisCountryHint={null} initialQuestion={START_FIXTURE_QUESTION} initialLevel="plain" />
    ));
    await flush();
    await press(askHost.querySelector(".v4AskActions .v4BtnPrimary")!);
    expect(askHost.querySelector(".v4AskReadTitle")).not.toBeNull();
    const north = [...askHost.querySelectorAll("button")].find((button) => button.textContent?.trim() === "The north.")!;
    await press(north);
    await act(async () => {
      const onEvent = server.lists.at(-1)!.onEvent;
      onEvent({ event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } });
      onEvent({ event: "list", data: { list: signedList(1) } });
      onEvent({ event: "list", data: { list: signedList(2) } });
      onEvent({ event: "cut", data: { lists_in: 2 } });
    });
    await flush();
    await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(NUCLEAR_MENU) }); });
    await flush();
    vi.useFakeTimers();
    const pressedAt = Date.now();
    await press(askHost.querySelector(".v4StartBarStart")!);
    expect(handOffFor(runId, Date.now())).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(START_UNDO_MS); });
    await flush();
    expect(router.pushed).toHaveLength(1);
    expect(router.pushed[0]!.href).toMatch(new RegExp(`^/v4/debate/${runId}(?:\\?|$)`, "u"));
    const handOff = router.pushed[0]!.handOff as StartHandOff | null;
    expect(handOff).not.toBeNull();
    expect(handOff!.runId).toBe(runId);
    expect(handOff!.questionLine).toBe(`${START_FIXTURE_QUESTION}\n\nWhich region? The north.`);
    const plan = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    expect(handOff!.paths.map((path) => path.title)).toEqual(plan.paths.map((path) => path.title));
    expect(handOff!.paths.map((path) => path.question)).toEqual(plan.paths.map((path) => path.question));
    expect(handOff!.level).toBe("plain");
    expect(handOff!.at).toBeGreaterThanOrEqual(pressedAt + START_UNDO_MS);
    expect(handOff!.at).toBeLessThanOrEqual(Date.now());
  });
});
