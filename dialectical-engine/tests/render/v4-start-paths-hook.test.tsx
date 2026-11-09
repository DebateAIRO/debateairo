// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContractHttpError, QUESTION_NOT_STARTED, START_PATHS_STALE, startListNosOfMenu, type PurposeLines, type StartCombineRequest, type StartCombineResponse,
  type StartFitRequest, type StartFitResponse, type StartListsEvent, type StartListsRequest, type StartMergeRequest, type StartMergeResponse,
  type StartMenu, type StartMenuViewpoint, type StartStepRoom
} from "@debateai/contract";

/*
 * V4 start step, Task 70 (chat-start-waits-for-paths, read-d6, read-d2, choose-d2, read-d4, choose-d1, choose-f10, choose-f11,
 * choose-f3, choose-f22, ask-f7, owner answers Q8 and Q10): the start card's hook. One lists post for the line read at Next;
 * the check, the progress the dots draw, the lists as they come, one merge at the cut with the answers as they are then; a
 * Start that waits for the paths (greyed until READY or NONE, and while the plan holds more paths than the room's widest)
 * and never hangs (the page gives up after 215 s); one line for why the list is missing; the language offer; no lifetime on
 * the suggestions. Only the server is stood in: each call is held until the test answers it.
 * Task 71 (read-d2, choose-d2, choose-f4, owner answer Q8, ask-f13, read-f1): late lists merge in as new ideas under "+ N
 * more", one late merge at a time; each new path being written gets one combine call, answered from the page's memory the
 * next time the same viewpoints are put together; the own-path fit; a stale reading starts nothing new and is read again on
 * Back, then Next; "Use my words instead" reads the person's own words fresh; `shaped` for the page's leave rule.
 */
type ListsCall = { input: StartListsRequest; onEvent: (event: StartListsEvent) => void; signal: AbortSignal; end: () => void; fail: (error: unknown) => void };
type MergeCall = { input: StartMergeRequest; signal: AbortSignal | undefined; answer: (response: StartMergeResponse) => void; fail: (error: unknown) => void };
type CombineCall = { input: StartCombineRequest; signal: AbortSignal | undefined; answer: (response: StartCombineResponse) => void; fail: (error: unknown) => void };
type FitCall = { input: StartFitRequest; answer: (response: StartFitResponse) => void; fail: (error: unknown) => void };

const server = vi.hoisted(() => ({
  lists: [] as ListsCall[],
  merges: [] as MergeCall[],
  combines: [] as CombineCall[],
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
    startPathCombine: (input: StartCombineRequest, signal?: AbortSignal) => new Promise<StartCombineResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.combines.push({ input, signal, answer: resolve, fail: reject });
    }),
    startPathFit: (input: StartFitRequest, signal?: AbortSignal) => new Promise<StartFitResponse>((resolve, reject) => {
      abortable(signal, reject);
      server.fits.push({ input, answer: resolve, fail: reject });
    })
  }
}));

import { START_PAGE_WAITS, useStartPaths, type V4StartCardState } from "../../apps/ui/lib/v4/useStartPaths.js";
import { pathPlanCombineMembers, pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths } from "../../apps/ui/lib/v4/pathPlan.js";
import type { V4StartHandOver } from "../../apps/ui/lib/v4/types.js";
import { NUCLEAR_MENU, NUCLEAR_MENU_REV2, START_FIXTURE_QUESTION, TWO_PATH_MENU, signedList, signedMenu } from "../support/v4-start-menu.js";

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
const lateList = (n: number): StartListsEvent => ({ event: "late_list", data: { list: signedList(n) } });
const OFFER = { check_ref: "offer.sig", main_language: { code: "en", name: "English" },
  languages_seen: [{ code: "en", name: "English" }, { code: "ro", name: "Romanian" }], proposed_question: REWRITE };
/** Made-up words an AI combine writes for kp01 and kp02. */
const WRITTEN = { source: "AI", title: "Costs and a calm winter week",
  question: "What would new plants cost households, and would they keep the lights on in a calm winter week?", combine_ref: "cmb.sig" } as const;
const COMBINE_KP01_KP02 = [{ type: "SELECT", key: "kp01" }, { type: "SELECT", key: "kp02" }, { type: "COMBINE_SELECTED" }] as const;

/** The server's CODE menu of list 1 alone (its first merge ran past its deadline): list 1's viewpoints, one path each. */
const LIST_ONE_MENU: StartMenu = {
  ...NUCLEAR_MENU,
  viewpoints: NUCLEAR_MENU.viewpoints.filter((viewpoint) => viewpoint.viewpoint_id.startsWith("pt1")),
  paths: NUCLEAR_MENU.paths.filter((path) => path.viewpoint_ids.every((id) => id.startsWith("pt1"))),
  cards: [],
  suggestions: []
};
/** The late merge of list 2 into it: revision 2, every path of list 2 new. */
const LIST_TWO_MERGED: StartMenu = {
  ...NUCLEAR_MENU,
  revision: 2,
  paths: NUCLEAR_MENU.paths.map((path) => path.viewpoint_ids.every((id) => id.startsWith("pt1")) ? path : { ...path, is_new: true })
};
const PT41: StartMenuViewpoint = { viewpoint_id: "pt41", title: "List 4 idea", question: "What does list 4 ask about new nuclear plants?",
  why: "Made-up reason.", angle_id: "g1", repeat_ids: [] };
/** The late merge of list 4 into revision 2: revision 3, list 4's idea as the new path kp11. */
const NUCLEAR_MENU_REV3: StartMenu = {
  ...NUCLEAR_MENU_REV2,
  revision: 3,
  viewpoints: [...NUCLEAR_MENU_REV2.viewpoints, PT41],
  paths: [...NUCLEAR_MENU_REV2.paths, { path_ref: "kp11", title: PT41.title, question: PT41.question, viewpoint_ids: ["pt41"], put_together: false, is_new: true }]
};

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
async function answerMergeNone(): Promise<void> {
  await act(async () => { server.merges.at(-1)!.answer({ source: "NONE", reason: "UNREADABLE" }); });
  await flush();
}
async function answerCombine(response: StartCombineResponse = WRITTEN): Promise<void> {
  await act(async () => { server.combines.at(-1)!.answer(response); });
  await flush();
}
const keys = (paths: readonly Readonly<{ key: string }>[]): string[] => paths.map((path) => path.key);

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

describe("Task 71: late lists merge in as new ideas (choose-f4)", () => {
  it("a late list at READY → one late merge with the menu so far; the paths stay, kp10 comes new at the end of more, the hand-over carries revision 2", async () => {
    await toReady();
    expect(server.merges).toHaveLength(1);
    await emit(lateList(3));
    expect(server.merges).toHaveLength(2);
    expect(server.merges[1]!.input).toEqual({
      question_line: Q, check_ref: "chk.sig", reading_level: "plain", lists: [signedList(3)], prior_menu: signedMenu(NUCLEAR_MENU)
    });
    expect(card!.lateLists).toEqual([signedList(3)]);
    // A Start while the late merge runs carries list 3 in late_lists.
    expect((await handOver("PERSON")).startPaths).toEqual({
      source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: TOP_FIVE, width: 5, chosen_by: "PERSON", late_lists: [signedList(3)]
    });
    await answerMerge(NUCLEAR_MENU_REV2);
    expect(card!.phase).toBe("READY");
    expect(card!.menu).toEqual(signedMenu(NUCLEAR_MENU_REV2));
    expect(keys(card!.plan!.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(keys(card!.plan!.more)).toEqual(["kp06", "kp07", "kp08", "kp09", "kp10"]);
    expect(card!.plan!.more.at(-1)!.isNew).toBe(true);
    expect(card!.lateIdeas).toBe(1);
    expect(card!.lateLists).toEqual([]);
    expect((await handOver("PERSON")).startPaths).toEqual({
      source: "MENU", menu: signedMenu(NUCLEAR_MENU_REV2), paths: TOP_FIVE, width: 5, chosen_by: "PERSON"
    });
    expect(server.merges).toHaveLength(2);
    expect(server.lists).toHaveLength(1);
  });

  it("queued: a late list during a late merge waits, then goes alone in the next one with the newer menu; until then Start carries it", async () => {
    await toReady();
    await emit(lateList(3));
    await emit(lateList(4));
    expect(server.merges).toHaveLength(2);
    expect(server.merges[1]!.input.lists).toEqual([signedList(3)]);
    await answerMerge(NUCLEAR_MENU_REV2);
    expect(server.merges).toHaveLength(3);
    expect(server.merges[2]!.input).toEqual({
      question_line: Q, check_ref: "chk.sig", reading_level: "plain", lists: [signedList(4)], prior_menu: signedMenu(NUCLEAR_MENU_REV2)
    });
    expect((await handOver("PERSON")).startPaths).toEqual({
      source: "MENU", menu: signedMenu(NUCLEAR_MENU_REV2), paths: TOP_FIVE, width: 5, chosen_by: "PERSON", late_lists: [signedList(4)]
    });
    await answerMerge(NUCLEAR_MENU_REV3);
    expect(card!.menu!.menu.revision).toBe(3);
    expect(keys(card!.plan!.more)).toEqual(["kp06", "kp07", "kp08", "kp09", "kp10", "kp11"]);
    expect(card!.lateIdeas).toBe(2);
    expect(card!.lateLists).toEqual([]);
    expect(server.merges).toHaveLength(3);
  });

  it("a late list before the first menu waits for it, then is merged with that menu", async () => {
    await mount();
    await emit(CHECK, list(1), list(2), cut(2), lateList(3));
    expect(server.merges).toHaveLength(1);
    expect(server.merges[0]!.input.lists).toEqual([signedList(1), signedList(2)]);
    expect(card!.lateLists).toEqual([signedList(3)]);
    await answerMerge();
    expect(server.merges).toHaveLength(2);
    expect(server.merges[1]!.input).toEqual({
      question_line: Q, check_ref: "chk.sig", reading_level: "plain", lists: [signedList(3)], prior_menu: signedMenu(NUCLEAR_MENU)
    });
  });

  it("a first merge past its deadline (the server's menu of list 1) → one late merge of list 2; a Start before it carries list 2; list 2's ideas then come under more, marked new", async () => {
    await mount();
    await emit(CHECK, list(1), list(2), cut(2));
    await act(async () => { server.merges[0]!.answer({ source: "CODE", menu: signedMenu(LIST_ONE_MENU) }); });
    await flush();
    expect(card!.phase).toBe("READY");
    expect(keys(card!.plan!.paths)).toEqual(["kp01", "kp02", "kp03", "kp06"]);
    expect(server.merges).toHaveLength(2);
    expect(server.merges[1]!.input).toEqual({
      question_line: Q, check_ref: "chk.sig", reading_level: "plain", lists: [signedList(2)], prior_menu: signedMenu(LIST_ONE_MENU)
    });
    expect((await handOver("PERSON")).startPaths!.late_lists).toEqual([signedList(2)]);
    await answerMerge(LIST_TWO_MERGED);
    expect(keys(card!.plan!.paths)).toEqual(["kp01", "kp02", "kp03", "kp06"]);
    expect(keys(card!.plan!.more)).toEqual(["kp04", "kp05", "kp07", "kp08", "kp09"]);
    expect(card!.plan!.more.flatMap((path) => path.viewpoints.map((viewpoint) => viewpoint.key))).toEqual(["pt21", "pt22", "pt23", "pt25", "pt24"]);
    expect(card!.plan!.more.every((path) => path.isNew)).toBe(true);
    expect(card!.lateIdeas).toBe(5);
    expect(card!.lateLists).toEqual([]);
    expect("late_lists" in (await handOver("PERSON")).startPaths!).toBe(false);
  });

  it("a late merge answering NONE is asked once more with the same lists; NONE again keeps the menu, and the lists go with Start", async () => {
    await toReady();
    await emit(lateList(3));
    await answerMergeNone();
    expect(server.merges).toHaveLength(3);
    expect(server.merges[2]!.input).toEqual(server.merges[1]!.input);
    await answerMergeNone();
    expect(server.merges).toHaveLength(3);
    expect(card!.phase).toBe("READY");
    expect(card!.menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(keys(card!.plan!.more)).toEqual(["kp06", "kp07", "kp08", "kp09"]);
    expect(card!.lateIdeas).toBe(0);
    expect(card!.lateLists).toEqual([signedList(3)]);
    expect((await handOver("PERSON")).startPaths!.late_lists).toEqual([signedList(3)]);
    // A later list is merged by the next late merge, with the lists still held.
    await emit(lateList(4));
    expect(server.merges).toHaveLength(4);
    expect(server.merges[3]!.input.lists).toEqual([signedList(3), signedList(4)]);
  });

  it("a late merge that never answers is stopped after the page's late-merge wait and asked once more", async () => {
    vi.useFakeTimers();
    await toReady();
    await emit(lateList(3));
    await advance(START_PAGE_WAITS.lateMergeMs - 1);
    expect(server.merges).toHaveLength(2);
    await advance(1);
    expect(server.merges[1]!.signal!.aborted).toBe(true);
    expect(server.merges).toHaveLength(3);
    expect(server.merges[2]!.input).toEqual(server.merges[1]!.input);
    expect(card!.phase).toBe("READY");
    expect(server.lists[0]!.signal.aborted).toBe(false);
  });

  it("a late merge answered 409 START_PATHS_STALE → STALE, and no late merge after it", async () => {
    await toReady();
    await emit(lateList(3));
    await act(async () => { server.merges[1]!.fail(new ContractHttpError("SERVER_FAILURE", 409, START_PATHS_STALE, START_PATHS_STALE)); });
    await flush();
    expect(card!.phase).toBe("STALE");
    expect(card!.startReady).toBe(false);
    await emit(lateList(4));
    expect(server.merges).toHaveLength(2);
  });

  it("no late merge after revision 9: the list waits and goes with Start", async () => {
    await toReady({}, { ...NUCLEAR_MENU, revision: 9 });
    await emit(lateList(3));
    expect(server.merges).toHaveLength(1);
    expect(card!.lateLists).toEqual([signedList(3)]);
  });
});

describe("Task 71: combines are asked once (choose-d2, choose-f10)", () => {
  it("a new path being written gets one call with the read line, the check and the menu id; written → COMBINED; Undo and the same combine again asks nothing", async () => {
    await toReady();
    await dispatch(...COMBINE_KP01_KP02);
    const writing = card!.plan!.paths[0]!;
    expect(writing.wording).toBe("WRITING");
    expect(server.combines).toHaveLength(1);
    expect(server.combines[0]!.input).toEqual({
      context: { kind: "MENU", question_line: Q, check_ref: "chk.sig", menu_id: "m".repeat(22) },
      reading_level: "plain",
      members: [...pathPlanCombineMembers(writing)]
    });
    await answerCombine();
    expect(card!.plan!.paths[0]).toMatchObject({ key: writing.key, wording: "COMBINED", title: WRITTEN.title, question: WRITTEN.question, combineRef: "cmb.sig" });
    await dispatch({ type: "UNDO" });
    expect(keys(card!.plan!.paths)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    await dispatch(...COMBINE_KP01_KP02);
    expect(card!.plan!.paths[0]).toMatchObject({ wording: "COMBINED", title: WRITTEN.title, question: WRITTEN.question, combineRef: "cmb.sig" });
    expect(server.combines).toHaveLength(1);
  });

  it("NONE → FALLBACK and the next combine asks again; past the combine wait → stopped, FALLBACK, and asked again next time", async () => {
    vi.useFakeTimers();
    await toReady();
    await dispatch(...COMBINE_KP01_KP02);
    await answerCombine({ source: "NONE", reason: "UNREADABLE" });
    expect(card!.plan!.paths[0]).toMatchObject({ wording: "FALLBACK", combineRef: null });
    await dispatch({ type: "UNDO" }, ...COMBINE_KP01_KP02);
    expect(server.combines).toHaveLength(2);
    expect(card!.plan!.paths[0]!.wording).toBe("WRITING");
    await advance(START_PAGE_WAITS.combineMs - 1);
    expect(card!.plan!.paths[0]!.wording).toBe("WRITING");
    await advance(1);
    expect(server.combines[1]!.signal!.aborted).toBe(true);
    expect(card!.plan!.paths[0]).toMatchObject({ wording: "FALLBACK", combineRef: null });
    expect(card!.phase).toBe("READY");
    await dispatch({ type: "UNDO" }, ...COMBINE_KP01_KP02);
    expect(server.combines).toHaveLength(3);
  });

  it("Start waits for a path still being written and goes as soon as it is written, with its combine reference", async () => {
    await toReady();
    await dispatch(...COMBINE_KP01_KP02);
    let given: V4StartHandOver | null = null;
    await act(async () => { void card!.handOver({ chosenBy: "PERSON", questionLine: Q }).then((result) => { given = result; }); });
    await flush();
    expect(given).toBeNull();
    await answerCombine();
    expect(given!.startPaths!.paths[0]).toEqual({ title: WRITTEN.title, question: WRITTEN.question,
      members: [{ viewpoint_id: "pt11" }, { viewpoint_id: "pt13" }], combine_ref: "cmb.sig" });
  });

  // Review of Task 71: a late merge may land while Start waits for a path being written. The hand-over then sends the
  // newer menu (which holds list 3), never the menu from before the wait with late_lists counted against the newer one:
  // that pair held list 3 nowhere, so its ideas never reached the debate.
  it("a late merge landing while Start waits for a path being written: the newer menu goes, and every list is in it or in late_lists", async () => {
    await toReady();
    await emit(lateList(3));
    expect(server.merges).toHaveLength(2);
    await dispatch(...COMBINE_KP01_KP02);
    let given: V4StartHandOver | null = null;
    await act(async () => { void card!.handOver({ chosenBy: "PERSON", questionLine: Q }).then((result) => { given = result; }); });
    await flush();
    expect(given).toBeNull();
    await answerMerge(NUCLEAR_MENU_REV2);
    await answerCombine();
    const sent = given!.startPaths!;
    expect(sent.menu).toEqual(signedMenu(NUCLEAR_MENU_REV2));
    expect("late_lists" in sent).toBe(false);
    const listNos = [...startListNosOfMenu(sent.menu.menu), ...(sent.late_lists ?? []).map((one) => one.list.list_no)];
    expect([...listNos].sort()).toEqual([1, 2, 3]);
    expect(sent.paths[0]!.combine_ref).toBe("cmb.sig");
  });

  it("three days at READY: still READY, a new combine still asks, and the hand-over keeps its check and its paths (answer Q8)", async () => {
    vi.useFakeTimers();
    await toReady();
    await advance(3 * DAY_MS);
    expect(card!.phase).toBe("READY");
    await dispatch(...COMBINE_KP01_KP02);
    expect(server.combines).toHaveLength(1);
    expect(server.combines[0]!.input.context).toEqual({ kind: "MENU", question_line: Q, check_ref: "chk.sig", menu_id: "m".repeat(22) });
    await answerCombine();
    const given = await handOver("PERSON");
    expect(given.startCheck).toEqual({ ref: "chk.sig" });
    expect(given.startPaths!.menu).toEqual(signedMenu(NUCLEAR_MENU));
    expect(given.startPaths!.paths[0]!.combine_ref).toBe("cmb.sig");
    expect(given.startPaths!.paths.slice(1)).toEqual(TOP_FIVE.slice(2));
    expect(server.lists).toHaveLength(1);
    expect(server.merges).toHaveLength(1);
  });

  it("STALE starts no combine, and a combine already asked finishes", async () => {
    await toReady();
    await dispatch(...COMBINE_KP01_KP02);
    await act(async () => { card!.markStale(); });
    await flush();
    expect(card!.phase).toBe("STALE");
    await answerCombine();
    expect(card!.plan!.paths[0]).toMatchObject({ wording: "COMBINED", combineRef: "cmb.sig" });
    await dispatch({ type: "SELECT", key: "kp03" }, { type: "SELECT", key: "kp04" }, { type: "COMBINE_SELECTED" });
    expect(card!.plan!.paths.some((path) => path.wording === "WRITING")).toBe(true);
    expect(server.combines).toHaveLength(1);
  });

  it("a combine answered 409 START_PATHS_STALE → STALE", async () => {
    await toReady();
    await dispatch(...COMBINE_KP01_KP02);
    await act(async () => { server.combines[0]!.fail(new ContractHttpError("SERVER_FAILURE", 409, START_PATHS_STALE, START_PATHS_STALE)); });
    await flush();
    expect(card!.phase).toBe("STALE");
    expect(card!.startReady).toBe(false);
  });
});

describe("Task 71: the own-path fit", () => {
  const OWN = "Fish farming near the plants?";
  /** fitOwn asked inside act; its answer stays a promise (wrapped, so awaiting the ask does not wait for the answer). */
  async function askFit(text = OWN): Promise<Readonly<{ answer: Promise<string | null> }>> {
    let fit: Promise<string | null> | null = null;
    await act(async () => { fit = card!.fitOwn(text); });
    return { answer: fit! };
  }

  it("the key of a path on the list, for the trimmed words", async () => {
    await toReady();
    const fit = (await askFit(`  ${OWN}  `)).answer;
    expect(server.fits[0]!.input.own_text).toBe(OWN);
    await act(async () => { server.fits[0]!.answer({ source: "AI", fits_key: "kp04" }); });
    expect(await fit).toBe("kp04");
    expect(card!.phase).toBe("READY");
  });

  it("NONE → null", async () => {
    await toReady();
    const fit = (await askFit()).answer;
    await act(async () => { server.fits[0]!.answer({ source: "NONE", reason: "DEADLINE" }); });
    expect(await fit).toBeNull();
  });

  it("a key not on the list (kp08 waits under more) → null", async () => {
    await toReady();
    const fit = (await askFit()).answer;
    await act(async () => { server.fits[0]!.answer({ source: "AI", fits_key: "kp08" }); });
    expect(await fit).toBeNull();
  });

  it("before the check, and with none and no check: null, nothing asked", async () => {
    await mount();
    let fit = (await askFit()).answer;
    expect(server.fits).toHaveLength(0);
    expect(await fit).toBeNull();
    await emit(none("OFF"), end("NONE"));
    expect(card!.phase).toBe("NONE");
    fit = (await askFit()).answer;
    expect(server.fits).toHaveLength(0);
    expect(await fit).toBeNull();
  });

  it("on a stale reading: null, nothing asked", async () => {
    await toReady();
    await act(async () => { card!.markStale(); });
    await flush();
    const fit = (await askFit()).answer;
    expect(server.fits).toHaveLength(0);
    expect(await fit).toBeNull();
  });
});

describe("Task 71: nothing on step 2 is read again (read-d2, choose-d2)", () => {
  it("the hook has no box input: what the page does to its box asks nothing and changes no phase", async () => {
    await toReady();
    await rerender({ clarify: { answers: [{ question: "Which region?", answer: "The north." }] } });
    const box = `${Q}\n\nWhich region? The north.\nAnd the south too.`;
    const given = await handOver("PERSON", box);
    expect(given.questionLine).toBe(box);
    expect(card!.phase).toBe("READY");
    expect(server.lists).toHaveLength(1);
    expect(server.merges).toHaveLength(1);
    expect(server.combines).toHaveLength(0);
    expect(server.fits).toHaveLength(0);
  });

  it("Back, then Next with the same line at READY asks nothing again", async () => {
    await toReady();
    const plan = card!.plan;
    await rerender({ active: false });
    await rerender({ active: true });
    expect(server.lists).toHaveLength(1);
    expect(card!.phase).toBe("READY");
    expect(card!.plan).toBe(plan);
  });

  it("a swapped question goes as question_swap {card_id, original_question_line}", async () => {
    await toReady();
    await dispatch({ type: "MAKE_MY_QUESTION", cardId: "cd1", originalQuestion: Q });
    expect((await handOver("PERSON")).startPaths!.question_swap).toEqual({ card_id: "cd1", original_question_line: Q });
  });
});

describe("Task 71: a stale reading is read again on Back, then Next (read-f1)", () => {
  it("markStale(), then inactive and active again with the same line → one lists post and READY again", async () => {
    await toReady();
    await act(async () => { card!.markStale(); });
    await flush();
    await rerender({ active: false });
    expect(server.lists).toHaveLength(1);
    expect(card!.phase).toBe("STALE");
    await rerender({ active: true });
    expect(server.lists).toHaveLength(2);
    expect(server.lists[1]!.input).toEqual({ question_line: Q, site_language: "en", reading_level: "plain" });
    expect(card!.phase).toBe("CHECKING");
    expect(card!.plan).toBeNull();
    await emit({ ...CHECK, data: { ...CHECK.data, check_ref: "chk2.sig" } }, list(1), list(2), cut(2));
    await answerMerge();
    expect(card!.phase).toBe("READY");
    expect(card!.startReady).toBe(true);
    expect((await handOver("PERSON")).startCheck).toEqual({ ref: "chk2.sig" });
    await rerender({ active: false });
    await rerender({ active: true });
    expect(server.lists).toHaveLength(2);
  });
});

describe("Task 71: \"Use my words instead\" (ask-f13)", () => {
  it("after USE_REWRITE, keepMyWords() gives the original words and reads them fresh with KEEP_MINE; the offer does not come back", async () => {
    await mount();
    await emit({ event: "language_offer", data: { offer: OFFER } }, end("LANGUAGE_CHOICE"));
    await endStream();
    await act(async () => { card!.chooseLanguage("USE_REWRITE"); });
    await flush();
    await emit({ ...CHECK, data: { ...CHECK.data, check_ref: "chk2.sig" } }, list(1), cut(1));
    await answerMerge();
    expect(card!.phase).toBe("READY");
    expect(card!.checkedLine).toBe(REWRITE);
    const rewritten = card!.plan;
    let kept: string | null = null;
    await act(async () => { kept = card!.keepMyWords(); });
    expect(kept).toBe(Q);
    await rerender({ questionLine: Q });
    expect(server.lists).toHaveLength(3);
    expect(server.lists[2]!.input).toEqual({ question_line: Q, site_language: "en", reading_level: "plain",
      question_language_choice: { check_ref: "offer.sig", choice: "KEEP_MINE" } });
    expect(card!.phase).toBe("CHECKING");
    expect(card!.plan).toBeNull();
    expect(card!.menu).toBeNull();
    expect(card!.progress).toBeNull();
    expect(card!.lateLists).toEqual([]);
    await emit({ event: "language_offer", data: { offer: OFFER } });
    expect(card!.phase).toBe("CHECKING");
    expect(card!.languageOffer).toBeNull();
    await emit({ ...CHECK, data: { ...CHECK.data, check_ref: "chk3.sig" } }, list(1), cut(1));
    expect(card!.checkedLine).toBe(Q);
    expect(server.merges[1]!.input.question_line).toBe(Q);
    expect(server.merges[1]!.input.check_ref).toBe("chk3.sig");
    await answerMerge();
    expect(card!.phase).toBe("READY");
    expect(card!.plan).not.toBe(rewritten);
    expect((await handOver("PERSON")).startCheck).toEqual({ ref: "chk3.sig" });
    let again: string | null = "unset";
    await act(async () => { again = card!.keepMyWords(); });
    expect(again).toBeNull();
    expect(server.lists).toHaveLength(3);
  });

  it("keepMyWords() with no rewrite accepted → null and no request", async () => {
    await toReady();
    let kept: string | null = "unset";
    await act(async () => { kept = card!.keepMyWords(); });
    expect(kept).toBeNull();
    await act(async () => root!.unmount());
    host?.remove();
    await mount({ questionLine: `${Q} Again.` });
    await emit({ event: "language_offer", data: { offer: OFFER } }, end("LANGUAGE_CHOICE"));
    kept = "unset";
    await act(async () => { kept = card!.keepMyWords(); });
    expect(kept).toBeNull();
    await act(async () => { card!.chooseLanguage("KEEP_MINE"); });
    await flush();
    kept = "unset";
    await act(async () => { kept = card!.keepMyWords(); });
    expect(kept).toBeNull();
    expect(server.lists).toHaveLength(3);
    expect(card!.phase).toBe("CHECKING");
  });
});

describe("Task 71: shaped, for the page's leave rule (Task 76c)", () => {
  it("false at READY, true after a REMOVE, false after its UNDO, true after ADD_OWN", async () => {
    await toReady();
    expect(card!.shaped).toBe(false);
    await dispatch({ type: "REMOVE", key: "kp05" });
    expect(card!.shaped).toBe(true);
    await dispatch({ type: "UNDO" });
    expect(card!.shaped).toBe(false);
    // The list is full at How wide 5: the person's own path takes kp05's place.
    await dispatch({ type: "ADD_OWN", text: "Fish farming near the plants?", intoPathKey: null, swapWithKey: "kp05" });
    expect(card!.plan!.paths.at(-1)!.tag).toBe("ADDED_BY_YOU");
    expect(card!.shaped).toBe(true);
  });

  it("the hook adds no beforeunload listener", async () => {
    const listen = vi.spyOn(window, "addEventListener");
    await toReady();
    await dispatch({ type: "REMOVE", key: "kp05" }, { type: "ADD_OWN", text: "Fish farming near the plants?", intoPathKey: null });
    expect(card!.shaped).toBe(true);
    expect(listen.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
  });
});
