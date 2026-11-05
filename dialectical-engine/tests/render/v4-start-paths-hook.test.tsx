// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContractHttpError, QUESTION_NOT_STARTED, START_PATHS_STALE, type PurposeLines, type StartFitRequest, type StartFitResponse,
  type StartListsEvent, type StartListsRequest, type StartMergeRequest, type StartMergeResponse, type StartMenu, type StartStepRoom
} from "@debateai/contract";

/*
 * V4 start step, Task 70 (chat-start-waits-for-paths, read-d6, read-d2, choose-d2, read-d4, choose-d1, choose-f10, choose-f11,
 * choose-f3, choose-f22, ask-f7, owner answers Q8 and Q10): the start card's hook. One lists post for the line read at Next;
 * the check, the progress the dots draw, the lists as they come, one merge at the cut with the answers as they are then; a
 * Start that waits for the paths (greyed until READY or NONE, and while the plan holds more paths than the room's widest)
 * and never hangs (the page gives up after 215 s); one line for why the list is missing; the language offer; no lifetime on
 * the suggestions. Only the server is stood in: each call is held until the test answers it.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void; signal: AbortSignal; end: () => void; fail: (error: unknown) => void };
type MergeCall = { input: StartMergeRequest; signal: AbortSignal | undefined; answer: (response: StartMergeResponse) => void; fail: (error: unknown) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void; fail: (error: unknown) => void };

const server = vi.hoisted(() => ({
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as unknown[],
  fits: [] as FitCall[]
}));
const abortable = (signal: AbortSignal | undefined, reject: (error: unknown) => void): void => {
  signal?.addEventListener("abort", () => { reject(new DOMException("The operation was aborted.", "AbortError")); });
};
vi.mock("@/lib/api", () => ({
  contractClient: {
    startPathLists: (input: StartListsRequest, onEvent: (event: StartListsEvent) => void, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      abortable(signal, reject);
      server.lists.push({ input, onEvent, signal, end: resolve, fail: reject });
    }),
    startPathMerge: (input: StartMergeRequest, signal?: AbortSignal) => new Promise<StartMergeResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.merges.push({ input, signal, answer: resolve, fail: reject });
    }),
    startPathCombine: (input: unknown) => { server.combines.push(input); return new Promise(() => undefined); },
    startPathFit: (input: StartFitRequest, signal?: AbortSignal) => new Promise<StartFitResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.fits.push({ input, answer: resolve, fail: reject });
    })
  }
}));

import { START_PAGE_WAITS, useStartPaths, type V4StartCardState } from "../../apps/ui/lib/v4/useStartPaths.js";
import { pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths } from "../../apps/ui/lib/v4/pathPlan.js";
import type { V4StartHandOver } from "../../apps/ui/lib/v4/types.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedList, signedMenu } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Q = START_FIXTURE_QUESTION;
const REWRITE = "Should Romania build new nuclear power plants?";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Made-up shares of today for 1..7 paths (choose-f22: the share counts the real paths). */
const ROOM: StartStepRoom = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [5, 8, 11, 15, 18, 22, 25] };
const FREE_ROOM: StartStepRoom = { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [5, 8, 11] };

type Input = Parameters<typeof useStartPaths>[0];
const BASE: Input = { active: true, questionLine: Q, siteLanguage: "en", readingLevel: "plain", clarify: null, room: ROOM, freePlan: false };

const CHECK = { event: "check", data: { check_ref: "chk.sig", language: { code: "en", name: "English" }, seats: 4 } } as const satisfies StartListsEvent;
const progress = (answered: number, of = 4): StartListsEvent => ({ event: "progress", data: { answered, of } });
const list = (n: number): StartListsEvent => ({ event: "list", data: { list: signedList(n) } });
const cut = (listsIn: number): StartListsEvent => ({ event: "cut", data: { lists_in: listsIn } });
const none = (reason: "OFF" | "NOT_ASKED" | "POOL_EMPTY" | "NO_LISTS" | "DEADLINE" | "DRAINING"): StartListsEvent => ({ event: "none", data: { reason } });
const end = (reason: "DONE" | "LANGUAGE_CHOICE" | "REFUSED" | "NONE"): StartListsEvent => ({ event: "end", data: { reason } });
const TOP_FIVE = [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false))];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let card: V4StartCardState | null = null;
let props: Input = BASE;

function Probe(input: Readonly<{ input: Input }>): ReactNode {
  card = useStartPaths(input.input);
  return null;
}

async function flush(): Promise<void> {
  await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
}
async function mount(over: Partial<Input> = {}): Promise<void> {
  props = { ...BASE, ...over };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe input={props} />));
  await flush();
}
async function rerender(over: Partial<Input>): Promise<void> {
  props = { ...props, ...over };
  await act(async () => root!.render(<Probe input={props} />));
  await flush();
}
const lastLists = (): ListsCall => server.lists.at(-1)!;
async function emit(...events: StartListsEvent[]): Promise<void> {
  await act(async () => { for (const event of events) lastLists().onEvent(event); });
  await flush();
}
async function endStream(): Promise<void> {
  await act(async () => { lastLists().end(); });
  await flush();
}
async function answerMerge(menu: StartMenu = NUCLEAR_MENU): Promise<void> {
  await act(async () => { server.merges.at(-1)!.answer({ source: "AI", menu: signedMenu(menu) }); });
  await flush();
}
async function advance(ms: number): Promise<void> {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await flush();
}
/** The usual reading: the check, two seats' lists, the cut, and the merge's menu. */
async function toReady(over: Partial<Input> = {}, menu: StartMenu = NUCLEAR_MENU): Promise<void> {
  await mount(over);
  await emit(CHECK, progress(1), list(1), progress(2), list(2), cut(2));
  await answerMerge(menu);
}
async function handOver(chosenBy: "PERSON" | "AIS", questionLine = Q): Promise<V4StartHandOver> {
  let result: V4StartHandOver | null = null;
  await act(async () => { result = await card!.handOver({ chosenBy, questionLine }); });
  return result!;
}
async function dispatch(...actions: Parameters<V4StartCardState["dispatch"]>[0][]): Promise<void> {
  await act(async () => { for (const action of actions) card!.dispatch(action); });
  await flush();
}

beforeEach(() => {
  server.lists.length = 0;
  server.merges.length = 0;
  server.combines.length = 0;
  server.fits.length = 0;
  card = null;
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("before the reading (OFF, IDLE)", () => {
  it("OFF without the room's step before Start: no post, Start works, the hand-over is the line alone", async () => {
    await mount({ room: null });
    expect(card!.phase).toBe("OFF");
    expect(card!.startReady).toBe(true);
    expect(server.lists).toHaveLength(0);
    expect(await handOver("PERSON")).toEqual({ questionLine: Q, ownWords: [] });
    expect(await handOver("AIS")).toEqual({ questionLine: Q, ownWords: [] });
  });

  it("OFF when the room's lists are OFF", async () => {
    await mount({ room: { ...ROOM, lists: "OFF" } });
    expect(card!.phase).toBe("OFF");
    expect(server.lists).toHaveLength(0);
  });

  it("IDLE until active: nothing is posted, Start works, the hand-over is the line alone", async () => {
    await mount({ active: false });
    expect(card!.phase).toBe("IDLE");
    expect(card!.startReady).toBe(true);
    expect(card!.progress).toBeNull();
    expect(server.lists).toHaveLength(0);
    expect(await handOver("PERSON")).toEqual({ questionLine: Q, ownWords: [] });
  });
});

describe("the lists, the cut and the one merge", () => {
  it("one lists post with the read line, the site language and the reading level", async () => {
    await mount();
    expect(server.lists).toHaveLength(1);
    expect(server.lists[0]!.input).toEqual({ question_line: Q, site_language: "en", reading_level: "plain" });
    expect(card!.phase).toBe("CHECKING");
  });

  it("check → progress → lists → cut: the merge gets the read line, the check and the lists so far; READY with kp01..kp05", async () => {
    await mount();
    await emit(CHECK);
    expect(card!.phase).toBe("READING");
    expect(card!.progress).toEqual({ answered: 0, of: 4 });
    await emit(progress(1), list(1), progress(2), list(2));
    expect(card!.progress).toEqual({ answered: 2, of: 4 });
    expect(server.merges).toHaveLength(0);
    await emit(cut(2));
    expect(card!.phase).toBe("MERGING");
    expect(server.merges).toHaveLength(1);
    expect(server.merges[0]!.input).toEqual({
      question_line: Q, check_ref: "chk.sig", reading_level: "plain", lists: [signedList(1), signedList(2)]
    });
    expect("clarify" in server.merges[0]!.input).toBe(false);
    await answerMerge();
    expect(card!.phase).toBe("READY");
    expect(card!.plan!.paths.map((path) => path.key)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(card!.menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(card!.checkedLine).toBe(Q);
    expect(server.lists).toHaveLength(1);
  });

  it("the answers go as they are when the merge is asked, never `matters`", async () => {
    const first = { question: "Which region?", answer: "The north." };
    const second = { question: "By when?", answer: "Up to 2050." };
    await mount({ clarify: { answers: [first], matters: "Keeping bills low." } as PurposeLines });
    await emit(CHECK, list(1));
    await rerender({ clarify: { answers: [first, second], matters: "Keeping bills low." } as PurposeLines });
    await emit(cut(1));
    expect(server.merges[0]!.input.clarify).toEqual({ answers: [first, second] });
    expect(server.merges[0]!.input.lists).toEqual([signedList(1)]);
  });

  it("every seat answering before the cut: `end DONE` while the merge runs waits for it, READY, never NONE", async () => {
    await mount();
    await emit(CHECK, progress(1), list(1), progress(2), list(2), progress(3), list(3), progress(4), list(4), cut(4), end("DONE"));
    await endStream();
    expect(card!.phase).toBe("MERGING");
    expect(card!.noneReason).toBeNull();
    await answerMerge();
    expect(card!.phase).toBe("READY");
  });

  it("Start waits for the paths: greyed in CHECKING, READING and MERGING, pressable at READY", async () => {
    await mount();
    expect(card!.phase).toBe("CHECKING");
    expect(card!.startReady).toBe(false);
    await emit(CHECK);
    expect(card!.phase).toBe("READING");
    expect(card!.startReady).toBe(false);
    await emit(list(1), cut(1));
    expect(card!.phase).toBe("MERGING");
    expect(card!.startReady).toBe(false);
    await answerMerge();
    expect(card!.startReady).toBe(true);
  });

  it("a merge answering NONE, or failing: NONE, and Start works", async () => {
    await mount();
    await emit(CHECK, list(1), cut(1));
    await act(async () => { server.merges[0]!.answer({ source: "NONE", reason: "UNREADABLE" }); });
    await flush();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneReason).toBe("UNREADABLE");
    expect(card!.noneLine).toBe("PASSING");
    expect(card!.startReady).toBe(true);
    await rerender({ questionLine: `${Q} Again.` });
    await emit(CHECK, list(1), cut(1));
    await act(async () => { server.merges[1]!.fail(new ContractHttpError("SERVER_FAILURE", 502, "Bad gateway")); });
    await flush();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneLine).toBe("PASSING");
    expect(card!.startReady).toBe(true);
  });

  it("a merge that never answers: NONE after the page's merge wait, TOO_SLOW, the reading aborted", async () => {
    vi.useFakeTimers();
    await mount();
    await emit(CHECK, list(1), cut(1));
    await advance(START_PAGE_WAITS.mergeMs - 1);
    expect(card!.phase).toBe("MERGING");
    await advance(1);
    expect(card!.phase).toBe("NONE");
    expect(card!.noneReason).toBe("DEADLINE");
    expect(card!.noneLine).toBe("TOO_SLOW");
    expect(server.merges[0]!.signal!.aborted).toBe(true);
    expect(card!.startReady).toBe(true);
  });

  it("a merge answered 409 START_PATHS_STALE: STALE, Start greyed", async () => {
    await mount();
    await emit(CHECK, list(1), cut(1));
    await act(async () => { server.merges[0]!.fail(new ContractHttpError("SERVER_FAILURE", 409, `${START_PATHS_STALE}: plan changed`, START_PATHS_STALE)); });
    await flush();
    expect(card!.phase).toBe("STALE");
    expect(card!.startReady).toBe(false);
  });

  it("a new read line aborts the reading and posts once; the same line asks nothing again; leaving never aborts", async () => {
    await mount();
    await emit(CHECK);
    await rerender({ active: false });
    expect(card!.phase).toBe("READING");
    expect(server.lists[0]!.signal.aborted).toBe(false);
    await rerender({ active: true });
    expect(server.lists).toHaveLength(1);
    await rerender({ active: false, questionLine: `${Q} Today.` });
    expect(server.lists[0]!.signal.aborted).toBe(true);
    expect(card!.phase).toBe("IDLE");
    expect(server.lists).toHaveLength(1);
    await rerender({ active: true });
    expect(server.lists).toHaveLength(2);
    expect(server.lists[1]!.input.question_line).toBe(`${Q} Today.`);
    expect(card!.phase).toBe("CHECKING");
    expect(card!.checkedLine).toBeNull();
  });
});

describe("the hand-over at Start", () => {
  it("PERSON at READY: the read line's check as the check gave it, and the plan", async () => {
    await toReady();
    expect(await handOver("PERSON")).toEqual({
      questionLine: Q,
      startCheck: { ref: "chk.sig" },
      startPaths: { source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: TOP_FIVE, width: 5, chosen_by: "PERSON" },
      ownWords: []
    });
  });

  it("the box's line goes as the question; the check stays the read line's, with nothing else in it", async () => {
    await toReady();
    const line = `${Q}\n\nOver what time? To 2050.`;
    const given = await handOver("PERSON", line);
    expect(given.questionLine).toBe(line);
    expect(given.startCheck).toEqual({ ref: "chk.sig" });
    expect(Object.keys(given.startCheck!)).toEqual(["ref"]);
  });

  it("\"Just answer it\" at READY after a REMOVE sends the menu's top five, not the shaped plan", async () => {
    await toReady();
    await dispatch({ type: "REMOVE", key: "kp03" });
    expect(card!.plan!.paths.map((path) => path.key)).toEqual(["kp01", "kp02", "kp04", "kp05"]);
    expect(await handOver("AIS")).toEqual({
      questionLine: Q,
      startCheck: { ref: "chk.sig" },
      startPaths: { source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: TOP_FIVE, width: 5, chosen_by: "AIS" },
      ownWords: []
    });
  });

  it("PERSON waits for a path still being written, at most the combine wait, then sends its joined words", async () => {
    vi.useFakeTimers();
    await toReady();
    await dispatch({ type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" });
    expect(card!.plan!.paths[0]!.wording).toBe("WRITING");
    let given: V4StartHandOver | null = null;
    await act(async () => { void card!.handOver({ chosenBy: "PERSON", questionLine: Q }).then((result) => { given = result; }); });
    await advance(START_PAGE_WAITS.combineMs - 1);
    expect(given).toBeNull();
    await advance(1);
    let expected = pathPlanFromMenu(NUCLEAR_MENU, 5, false);
    for (const action of [{ type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" }] as const) {
      expected = pathPlanReduce(expected, action).plan;
    }
    expected = pathPlanReduce(expected, { type: "COMBINE_FAILED", key: expected.paths[0]!.key }).plan;
    expect(given!.startPaths!.paths).toEqual([...pathPlanToStartPaths(expected)]);
    expect(given!.startPaths!.paths[0]!.combine_ref).toBeUndefined();
    expect(card!.plan!.paths[0]!.wording).toBe("FALLBACK");
  });

  it("a READY card left three days is still READY, Start works, and its hand-over keeps the same check (answer Q8)", async () => {
    vi.useFakeTimers();
    await toReady();
    await advance(3 * DAY_MS);
    expect(card!.phase).toBe("READY");
    expect(card!.startReady).toBe(true);
    const given = await handOver("PERSON");
    expect(given.startCheck).toEqual({ ref: "chk.sig" });
    expect(given.startPaths!.paths).toEqual(TOP_FIVE);
    expect(server.lists).toHaveLength(1);
    expect(server.merges).toHaveLength(1);
  });
});

describe("when the list is missing (choose-f11, choose-f3)", () => {
  it("none → NONE NO_LISTS, PASSING, Start works, and the hand-over carries the check only", async () => {
    await mount();
    await emit(CHECK, none("NO_LISTS"), end("NONE"));
    await endStream();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneReason).toBe("NO_LISTS");
    expect(card!.noneLine).toBe("PASSING");
    expect(card!.startReady).toBe(true);
    expect(await handOver("PERSON")).toEqual({ questionLine: Q, startCheck: { ref: "chk.sig" }, ownWords: [] });
    expect(await handOver("AIS")).toEqual({ questionLine: Q, startCheck: { ref: "chk.sig" }, ownWords: [] });
  });

  it("an `end` with no cut before it (no list came): NONE NO_LISTS", async () => {
    await mount();
    await emit(CHECK, progress(4), end("DONE"));
    expect(card!.phase).toBe("NONE");
    expect(card!.noneReason).toBe("NO_LISTS");
  });

  it("none OFF and NOT_ASKED → NOT_OFFERED", async () => {
    await mount();
    await emit(none("OFF"), end("NONE"));
    expect(card!.noneLine).toBe("NOT_OFFERED");
    expect(card!.startReady).toBe(true);
    expect(await handOver("PERSON")).toEqual({ questionLine: Q, ownWords: [] });
    await rerender({ questionLine: `${Q} Again.` });
    await emit(none("NOT_ASKED"), end("NONE"));
    expect(card!.noneLine).toBe("NOT_OFFERED");
  });

  it("none POOL_EMPTY → QUOTA, and Start waits for the reset", async () => {
    await mount();
    await emit(none("POOL_EMPTY"), end("NONE"));
    expect(card!.noneLine).toBe("QUOTA");
    expect(card!.startReady).toBe(false);
  });

  it("none DEADLINE → TOO_SLOW", async () => {
    await mount();
    await emit(CHECK, none("DEADLINE"), end("NONE"));
    expect(card!.noneLine).toBe("TOO_SLOW");
    expect(card!.startReady).toBe(true);
  });

  it("a 401 from the lists post → SIGNED_OUT", async () => {
    await mount();
    await act(async () => { lastLists().fail(new ContractHttpError("SESSION_REQUIRED", 401, "SESSION_REQUIRED")); });
    await flush();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneLine).toBe("SIGNED_OUT");
  });

  it("navigator.onLine false → OFFLINE and Start greyed, nothing posted; back online → Start works, nothing sent", async () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await mount();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneLine).toBe("OFFLINE");
    expect(card!.online).toBe(false);
    expect(card!.startReady).toBe(false);
    onLine.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await flush();
    expect(card!.online).toBe(true);
    expect(card!.startReady).toBe(true);
    expect(card!.phase).toBe("NONE");
    // Back online the offline line goes: the list is still missing, so the passing-fault line says Start works.
    expect(card!.noneLine).toBe("PASSING");
    expect(server.lists).toHaveLength(0);
    expect(server.merges).toHaveLength(0);
  });

  it("a network failure (TypeError) → OFFLINE; Start follows the online and offline events", async () => {
    await mount();
    await emit(CHECK);
    await act(async () => { lastLists().fail(new TypeError("Failed to fetch")); });
    await flush();
    expect(card!.phase).toBe("NONE");
    expect(card!.noneLine).toBe("OFFLINE");
    // The browser still says it is online, so no `online` event would ever come back: Start stays pressable (never hangs).
    expect(card!.startReady).toBe(true);
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    await flush();
    expect(card!.online).toBe(false);
    expect(card!.startReady).toBe(false);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await flush();
    expect(card!.online).toBe(true);
    expect(card!.startReady).toBe(true);
    expect(card!.phase).toBe("NONE");
    expect(server.lists).toHaveLength(1);
  });

  it("the page gives up after 215 s: NONE DEADLINE, TOO_SLOW, aborted, Start works, nothing sent by itself", async () => {
    vi.useFakeTimers();
    await mount();
    await emit(CHECK, progress(1));
    await advance(START_PAGE_WAITS.giveUpMs - 1);
    expect(card!.phase).toBe("READING");
    await advance(1);
    expect(card!.phase).toBe("NONE");
    expect(card!.noneReason).toBe("DEADLINE");
    expect(card!.noneLine).toBe("TOO_SLOW");
    expect(server.lists[0]!.signal.aborted).toBe(true);
    expect(card!.startReady).toBe(true);
    await advance(3 * DAY_MS);
    expect(server.lists).toHaveLength(1);
    expect(server.merges).toHaveLength(0);
    expect(await handOver("PERSON")).toEqual({ questionLine: Q, startCheck: { ref: "chk.sig" }, ownWords: [] });
  });
});

describe("the check's other answers (ask-f7)", () => {
  it("refused: REFUSED with a readable 422 refusal, Start greyed", async () => {
    await mount();
    await emit({ event: "refused", data: { status: 422, body: { error: QUESTION_NOT_STARTED, message: QUESTION_NOT_STARTED, kind: "WEAPONS",
      screen: "REFUSE", emergency_number: false } } }, end("REFUSED"));
    expect(card!.phase).toBe("REFUSED");
    expect(card!.refusal).toBeInstanceOf(ContractHttpError);
    expect(card!.refusal!.status).toBe(422);
    expect(card!.refusal!.serverCode).toBe(QUESTION_NOT_STARTED);
    expect(card!.refusal!.questionNotStarted).toEqual({ kind: "WEAPONS", screen: "REFUSE", emergencyNumber: false });
    expect(card!.startReady).toBe(false);
  });

  it("the language offer: USE_REWRITE posts the rewrite with the choice; the hand-over carries the original line", async () => {
    await mount();
    const offer = { check_ref: "offer.sig", main_language: { code: "en", name: "English" },
      languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }], proposed_question: REWRITE };
    await emit({ event: "language_offer", data: { offer } }, end("LANGUAGE_CHOICE"));
    await endStream();
    expect(card!.phase).toBe("LANGUAGE_CHOICE");
    expect(card!.languageOffer).toEqual(offer);
    expect(card!.startReady).toBe(false);
    await act(async () => { card!.chooseLanguage("USE_REWRITE"); });
    await flush();
    expect(server.lists).toHaveLength(2);
    expect(server.lists[1]!.input).toEqual({ question_line: REWRITE, site_language: "en", reading_level: "plain",
      question_language_choice: { check_ref: "offer.sig", choice: "USE_REWRITE", original_question_line: Q } });
    expect(card!.phase).toBe("CHECKING");
    expect(card!.languageOffer).toBeNull();
    await emit({ ...CHECK, data: { ...CHECK.data, check_ref: "chk2.sig" } }, list(1), cut(1));
    expect(card!.checkedLine).toBe(REWRITE);
    expect(server.merges[0]!.input.question_line).toBe(REWRITE);
    expect(server.merges[0]!.input.check_ref).toBe("chk2.sig");
    await answerMerge();
    const given = await handOver("PERSON", REWRITE);
    expect(given.startCheck).toEqual({ ref: "chk2.sig", original_question_line: Q });
  });

  it("the language offer: KEEP_MINE posts the person's line with the choice and no original", async () => {
    await mount();
    const offer = { check_ref: "offer.sig", main_language: { code: "en", name: "English" },
      languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }], proposed_question: REWRITE };
    await emit({ event: "language_offer", data: { offer } }, end("LANGUAGE_CHOICE"));
    await act(async () => { card!.chooseLanguage("KEEP_MINE"); });
    await flush();
    expect(server.lists[1]!.input).toEqual({ question_line: Q, site_language: "en", reading_level: "plain",
      question_language_choice: { check_ref: "offer.sig", choice: "KEEP_MINE" } });
    await emit(CHECK, none("NO_LISTS"), end("NONE"));
    expect(card!.checkedLine).toBe(Q);
    expect((await handOver("PERSON")).startCheck).toEqual({ ref: "chk.sig" });
  });
});

describe("width, share, the ready note, stale and narrowed", () => {
  it("Free: width 3 whatever the room's default, and three paths", async () => {
    await mount({ freePlan: true, room: FREE_ROOM });
    expect(card!.width).toBe(3);
    await act(async () => root!.unmount());
    host?.remove();
    // Review of Task 70: a row whose default says 5 is capped in code before the list lands too: three places wait, and
    // the share counts three (the landed plan below is capped again by pathPlanFromMenu, so only this catches it).
    await mount({ freePlan: true, room: ROOM });
    expect(card!.width).toBe(3);
    expect(card!.sharePercent).toBe(11);
    await emit(CHECK, progress(1), list(1), progress(2), list(2), cut(2));
    await answerMerge();
    expect(card!.width).toBe(3);
    expect(card!.plan!.paths).toHaveLength(3);
    expect((await handOver("AIS")).startPaths!.width).toBe(3);
  });

  it("a two-path menu at width 5: the share counts the two real paths (choose-f22)", async () => {
    await mount();
    expect(card!.width).toBe(5);
    expect(card!.sharePercent).toBe(18);
    await emit(CHECK, list(1), cut(1));
    await answerMerge(TWO_PATH_MENU);
    expect(card!.width).toBe(5);
    expect(card!.plan!.paths).toHaveLength(2);
    expect(card!.sharePercent).toBe(8);
    // The landing is no change of the person's: no grey "−10%" when the real paths replace the places.
    expect(card!.shareDelta).toBeNull();
  });

  it("the share 18 → 15 shows its change −3 for 2 seconds", async () => {
    vi.useFakeTimers();
    await toReady();
    expect(card!.sharePercent).toBe(18);
    expect(card!.shareDelta).toBeNull();
    await dispatch({ type: "REMOVE", key: "kp05" });
    expect(card!.sharePercent).toBe(15);
    expect(card!.shareDelta).toBe(-3);
    await advance(START_PAGE_WAITS.deltaShowMs - 1);
    expect(card!.shareDelta).toBe(-3);
    await advance(1);
    expect(card!.shareDelta).toBeNull();
    expect(card!.sharePercent).toBe(15);
  });

  it("\"Your paths are ready ↓\" holds for 4 seconds after READY", async () => {
    vi.useFakeTimers();
    await mount();
    expect(card!.justLanded).toBe(false);
    await emit(CHECK, list(1), cut(1));
    await answerMerge();
    expect(card!.justLanded).toBe(true);
    expect(card!.lateIdeas).toBe(0);
    await advance(START_PAGE_WAITS.readyNoteMs - 1);
    expect(card!.justLanded).toBe(true);
    await advance(1);
    expect(card!.justLanded).toBe(false);
  });

  it("markStale(): STALE, Start greyed, and no combine or fit is asked after it", async () => {
    await toReady();
    let fit: Promise<string | null> | null = null;
    await act(async () => { fit = card!.fitOwn("Fish?"); });
    expect(server.fits).toHaveLength(1);
    expect(server.fits[0]!.input).toEqual({ question_line: Q, check_ref: "chk.sig", reading_level: "plain", own_text: "Fish?",
      paths: card!.plan!.paths.map((path) => ({ key: path.key, title: path.title, question: path.question })) });
    await act(async () => { server.fits[0]!.answer({ source: "AI", fits_key: "kp02" }); });
    expect(await fit!).toBe("kp02");
    await act(async () => { card!.markStale(); });
    await flush();
    expect(card!.phase).toBe("STALE");
    expect(card!.startReady).toBe(false);
    let late: string | null = "unset";
    await act(async () => { late = await card!.fitOwn("Fish?"); });
    expect(late).toBeNull();
    expect(server.fits).toHaveLength(1);
    await dispatch({ type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" });
    await flush();
    expect(server.combines).toHaveLength(0);
    expect(card!.phase).toBe("STALE");
  });

  it("a fit naming no current path answers null; a fit answered 409 STALE makes the card STALE", async () => {
    await toReady();
    let fit: Promise<string | null> | null = null;
    await act(async () => { fit = card!.fitOwn("Fish?"); });
    await act(async () => { server.fits[0]!.answer({ source: "AI", fits_key: "kp09" }); });
    expect(await fit!).toBeNull();
    await act(async () => { fit = card!.fitOwn("Fish?"); });
    await act(async () => { server.fits[1]!.fail(new ContractHttpError("SERVER_FAILURE", 409, START_PATHS_STALE, START_PATHS_STALE)); });
    expect(await fit!).toBeNull();
    await flush();
    expect(card!.phase).toBe("STALE");
  });

  it("narrowed: five paths in a room whose widest is 3 → narrowedTo 3, Start greyed; two REMOVEs → null, Start works", async () => {
    await toReady();
    expect(card!.narrowedTo).toBeNull();
    await rerender({ room: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [5, 8, 11] } });
    expect(card!.phase).toBe("READY");
    expect(card!.narrowedTo).toBe(3);
    expect(card!.startReady).toBe(false);
    await dispatch({ type: "REMOVE", key: "kp05" });
    expect(card!.narrowedTo).toBe(3);
    await dispatch({ type: "REMOVE", key: "kp04" });
    expect(card!.narrowedTo).toBeNull();
    expect(card!.startReady).toBe(true);
    await rerender({ room: ROOM });
    expect(card!.narrowedTo).toBeNull();
    expect(server.lists).toHaveLength(1);
    expect(server.merges).toHaveLength(1);
  });

  // Review of Task 70 (answer Q8): after a site update allows fewer paths and the person removed down to the new widest,
  // "Just answer it" sends the AIs' top paths at that widest, never more than the site now allows (the server would refuse
  // five as START_PATHS_NARROWED, and the page would ask to remove down again, which the person already did).
  it("narrowed, then removed down to the room's widest: \"Just answer it\" sends the menu's top three, not five", async () => {
    await toReady();
    await rerender({ room: { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [5, 8, 11] } });
    await dispatch({ type: "REMOVE", key: "kp05" }, { type: "REMOVE", key: "kp04" });
    expect(card!.narrowedTo).toBeNull();
    expect(card!.startReady).toBe(true);
    expect(await handOver("AIS")).toEqual({
      questionLine: Q,
      startCheck: { ref: "chk.sig" },
      startPaths: { source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 3, false))],
        width: 3, chosen_by: "AIS" },
      ownWords: []
    });
  });
});
