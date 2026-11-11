import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AskClarifyResponseSchema, AskRequestSchema, FREE_PUBLIC_NOTICE_REQUIRED, SignedStartMenuSchema, START_PATHS_NARROWED, START_PATHS_STALE,
  StartCombineResponseSchema, StartFitResponseSchema, StartListsEventSchema, StartMergeEventSchema, StartStepRoomSchema,
  type AskRequest, type SignedStartList, type SignedStartMenu, type StartListsEvent
} from "../../packages/contract/src/index.js";
import { parseStartStepFrames } from "../../packages/contract/src/client.js";
import { ASK_CLARIFY_PAGE_WAIT_MS } from "../../apps/ui/lib/v4/clarifyWait.js";

/*
 * V4 start step, Task 80 (items ask-f9, choose-d2, ask-f2; owner answers Q8 and Q14; Task 76d's clarify members; 4 Nov night: ask-d3,
 * read-f1, read-f3): the mock API plays the step before Start for the click-test. The module is read fresh for each case (its
 * readings, counters and room scene are the mock's life). The routes run on a stand-in request and answer, under fake timers, as the
 * mock's server hands them over; server.ts listens when it is imported, so its wiring is read as source, as v4-mock-api does.
 */
type Mock = typeof import("../../tools/v4-mock-api/start-step.js");
type Timed = Readonly<{ atMs: number; event: StartListsEvent }>;
const T0 = Date.parse("2026-11-06T10:00:00.000Z");
const QUESTION = "Should towns close their centres to cars at weekends?";
const LISTS = "/v1/asks/paths/lists";

let mock: Mock;
beforeEach(async () => {
  vi.stubEnv("MOCK_QUIET", "1");
  vi.resetModules();
  mock = await import("../../tools/v4-mock-api/start-step.js");
  vi.useFakeTimers({ now: T0, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A posted body, handed over once the route listens for its end (as a socket's arrives). */
function fakeRequest(body: unknown): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & { method: string; url: string; headers: Record<string, string>; destroy(): void };
  Object.assign(request, { method: "POST", url: "/", headers: {}, destroy: () => undefined });
  const on = request.on.bind(request);
  request.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === "end") void Promise.resolve().then(() => { request.emit("data", Buffer.from(JSON.stringify(body))); request.emit("end"); });
    return request;
  }) as typeof request.on;
  return request as unknown as IncomingMessage;
}

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, unknown> = {};
  text = "";
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  writeHead(status: number, headers: Record<string, unknown> = {}): this {
    this.statusCode = status;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
  end(chunk?: string): this {
    if (chunk !== undefined) this.text += chunk;
    this.writableEnded = true;
    this.emit("close");
    return this;
  }
}

/** One POST through the mock's start-step routes, run on for `runMs` of fake time. */
async function post(path: string, body: unknown, runMs: number, plan: "PLUS" | "FREE" = "PLUS"): Promise<FakeResponse> {
  const res = new FakeResponse();
  const handled = mock.routeStartStep(fakeRequest(body), res as unknown as ServerResponse, path, "POST", { plan });
  await vi.advanceTimersByTimeAsync(runMs);
  expect(await handled).toBe(true);
  return res;
}
const framesOf = (res: FakeResponse): readonly Readonly<{ event: string; data: unknown }>[] => parseStartStepFrames(`${res.text}\n\n`).events;
const listEventsOf = (res: FakeResponse): StartListsEvent[] => framesOf(res).map((one) => StartListsEventSchema.parse(one));
const jsonOf = (res: FakeResponse): unknown => JSON.parse(res.text);

const listsOf = (script: readonly Timed[], name: "list" | "late_list"): SignedStartList[] =>
  script.flatMap((one) => (one.event.event === name ? [one.event.data.list] : []));
const checkRefOf = (script: readonly Timed[]): string => {
  const first = script[0]!.event;
  if (first.event !== "check") throw new Error("the check comes first");
  return first.data.check_ref;
};
const BASE_ASK = {
  question_line: QUESTION, risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "test:v4-mock-start-step",
  composition_budget_tier: "medium", depth_params: { depth: 1, answerLength: "short" }, decision_scope: "personal",
  as_of: "2026-11-06T10:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], site_language: "en"
};
function askWithPaths(input: Readonly<{ line: string; checkRef: string; menu: SignedStartMenu; count: number; width: number }>): AskRequest {
  return AskRequestSchema.parse({
    ...BASE_ASK, question_line: input.line, start_check: { ref: input.checkRef },
    start_paths: { source: "MENU", menu: input.menu, width: input.width, chosen_by: "PERSON",
      paths: input.menu.menu.paths.slice(0, input.count).map((path) => ({ title: path.title, question: path.question,
        members: path.viewpoint_ids.map((viewpoint_id) => ({ viewpoint_id })) })) }
  });
}

describe("V4 mock API: the lists before Start (Task 80)", () => {
  it("each scene keeps the stream's order: the check first, one end last, at most one cut after a list, no list after the cut", () => {
    for (const plan of ["PLUS", "FREE"] as const) {
      for (const scene of ["", " #slowpaths", " #failpaths", " #fewpaths"]) {
        const label = `${plan}${scene}`;
        const script = mock.mockStartListsScript(`${QUESTION}${scene}`, plan);
        for (const one of script) expect(StartListsEventSchema.safeParse(one.event).success, label).toBe(true);
        const names = script.map((one) => one.event.event);
        expect(script.map((one) => one.atMs), label).toEqual([...script.map((one) => one.atMs)].sort((a, b) => a - b));
        expect(names[0], label).toBe("check");
        expect(names.filter((name) => name === "end"), label).toEqual(["end"]);
        expect(names.at(-1), label).toBe("end");
        const cuts = names.flatMap((name, at) => (name === "cut" ? [at] : []));
        expect(cuts.length, label).toBeLessThanOrEqual(1);
        if (cuts.length === 1) {
          expect(names.indexOf("list"), label).toBeGreaterThan(-1);
          expect(names.indexOf("list"), label).toBeLessThan(cuts[0]!);
          expect(names.slice(cuts[0]), label).not.toContain("list");
        } else {
          expect(names, label).not.toContain("late_list");
        }
        const check = script[0]!.event;
        const seats = scene === " #fewpaths" ? 1 : plan === "PLUS" ? 4 : 2;
        expect(check.event === "check" ? check.data.seats : null, label).toBe(seats);
      }
    }
  });

  it("the default scene: the check at 600 ms, lists at 2, 4 and 6 s, the cut at 6 s and a late list at 12 s; Free has two seats", () => {
    const plus = mock.mockStartListsScript(QUESTION, "PLUS");
    expect(plus.filter((one) => one.event.event !== "progress").map((one) => [one.event.event, one.atMs])).toEqual([
      ["check", 600], ["list", 2_000], ["list", 4_000], ["list", 6_000], ["cut", 6_000], ["late_list", 12_000], ["end", 12_000]]);
    expect(plus.find((one) => one.event.event === "cut")!.event).toEqual({ event: "cut", data: { lists_in: 3 } });
    expect(plus.filter((one) => one.event.event === "progress").map((one) => one.event.data)).toEqual(
      [1, 2, 3, 4].map((answered) => ({ answered, of: 4 })));
    const free = mock.mockStartListsScript(QUESTION, "FREE");
    expect(free[0]!.event).toMatchObject({ event: "check", data: { seats: 2 } });
    expect(listsOf(free, "list").map((one) => one.list.list_no)).toEqual([1, 2]);
    expect(listsOf(free, "late_list")).toEqual([]);
  });

  it("#slowpaths waits 20, 40, 70 and 95 s with the cut at 30 s; #failpaths ends NO_LISTS at 3 s; #fewpaths has one seat", () => {
    const slow = mock.mockStartListsScript(`${QUESTION} #slowpaths`, "PLUS");
    expect(slow.filter((one) => ["list", "cut", "late_list", "end"].includes(one.event.event)).map((one) => [one.event.event, one.atMs])).toEqual([
      ["list", 20_000], ["cut", 30_000], ["late_list", 40_000], ["late_list", 70_000], ["late_list", 95_000], ["end", 95_000]]);
    const fail = mock.mockStartListsScript(`${QUESTION} #failpaths`, "PLUS");
    expect(fail.slice(-2).map((one) => [one.event, one.atMs])).toEqual([
      [{ event: "none", data: { reason: "NO_LISTS" } }, 3_000], [{ event: "end", data: { reason: "NONE" } }, 3_000]]);
    expect(fail.map((one) => one.event.event)).not.toContain("list");
    const few = mock.mockStartListsScript(`${QUESTION} #fewpaths`, "FREE");
    expect(listsOf(few, "list")).toHaveLength(1);
    expect(few.find((one) => one.event.event === "cut")!.event).toEqual({ event: "cut", data: { lists_in: 1 } });
  });
});

describe("V4 mock API: the merge, combine and fit (Task 80)", () => {
  it("menus parse; a late revision keeps every earlier path byte for byte and adds new ones at the end", () => {
    const script = mock.mockStartListsScript(QUESTION, "PLUS");
    const first = mock.mockStartMenu(listsOf(script, "list"), null);
    expect(first.source).toBe("AI");
    expect(SignedStartMenuSchema.safeParse(first.menu).success).toBe(true);
    expect(first.menu.menu.revision).toBe(1);
    expect(first.menu.menu.paths.some((path) => path.put_together)).toBe(true);
    expect(first.menu.menu.repeats.length).toBeGreaterThan(0);
    expect(first.menu.menu.paths.length).toBeGreaterThanOrEqual(7);
    const late = listsOf(script, "late_list");
    expect(late).toHaveLength(1);
    const second = mock.mockStartMenu(late, first.menu);
    expect(SignedStartMenuSchema.safeParse(second.menu).success).toBe(true);
    expect(second.menu.menu.revision).toBe(2);
    expect(second.menu.menu.menu_id).toBe(first.menu.menu.menu_id);
    const before = first.menu.menu.paths;
    expect(JSON.stringify(second.menu.menu.paths.slice(0, before.length))).toBe(JSON.stringify(before));
    const added = second.menu.menu.paths.slice(before.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((path) => path.is_new)).toBe(true);
    expect(JSON.stringify(second.menu.menu.cards)).toBe(JSON.stringify(first.menu.menu.cards));
  });

  it("one list is merged by the AI too, with cards and suggestions", () => {
    const few = mock.mockStartListsScript(`${QUESTION} #fewpaths`, "PLUS");
    const merged = mock.mockStartMenu(listsOf(few, "list"), null);
    expect(merged.source).toBe("AI");
    expect(SignedStartMenuSchema.safeParse(merged.menu).success).toBe(true);
    expect(merged.menu.menu.paths.some((path) => path.put_together)).toBe(true);
    expect(merged.menu.menu.cards.length).toBeGreaterThan(0);
    expect(merged.menu.menu.suggestions.length).toBeGreaterThan(0);
  });

  it("combine: the AI's words with a signed reference, or NONE with #failcombine", () => {
    const script = mock.mockStartListsScript(QUESTION, "PLUS");
    const checkRef = checkRefOf(script);
    const members = [
      { viewpoint_id: "pt11", pick_no: null, title: "The cost over ten years", question: "What would it cost?" },
      { viewpoint_id: null, pick_no: null, title: null, question: "My own worry: the shops in the centre." }
    ];
    const context = { kind: "MENU" as const, question_line: QUESTION, check_ref: checkRef, menu_id: "A".repeat(22) };
    const combined = StartCombineResponseSchema.parse(mock.mockStartCombine({ context, reading_level: "plain", members }));
    expect(combined.source).toBe("AI");
    const none = mock.mockStartCombine({ context: { ...context, question_line: `${QUESTION} #failcombine` }, reading_level: "plain", members });
    expect(StartCombineResponseSchema.parse(none).source).toBe("NONE");
  });

  it("fit: the first path sharing a word of four letters or more, else none", () => {
    const script = mock.mockStartListsScript(QUESTION, "PLUS");
    const request = { question_line: QUESTION, check_ref: checkRefOf(script), reading_level: "plain" as const,
      own_text: "The shops would lose customers, and the cost falls on them.",
      paths: [{ key: "kp01", title: "What it really costs", question: "What would it cost over the years?" },
        { key: "kp02", title: "Who gains and who loses", question: "Who would be better off?" }] };
    expect(StartFitResponseSchema.parse(mock.mockStartFit(request))).toEqual({ source: "AI", fits_key: "kp01" });
    expect(mock.mockStartFit({ ...request, own_text: "Noise at night." })).toEqual({ source: "AI", fits_key: null });
  });
});

describe("V4 mock API: the step's routes (Task 80)", () => {
  it("the same words twice read once: the second post replays the same lists, and no counter or usage moves (ask-f9)", async () => {
    const body = { question_line: QUESTION, reading_level: "plain" };
    const first = await post(LISTS, body, 13_000);
    expect(first.statusCode).toBe(200);
    expect(String(first.headers["content-type"])).toContain("text/event-stream");
    const events = listEventsOf(first);
    expect(events[0]!.event).toBe("check");
    expect(events.at(-1)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(mock.startStepCounters()).toEqual({ lists: 1, merges: 0, combines: 0, fits: 0 });
    const used = mock.startStepUsedPercent();
    expect(used).toBeGreaterThan(0);
    const again = await post(LISTS, body, 0);
    expect(listEventsOf(again)).toEqual(events);
    expect(mock.startStepCounters().lists).toBe(1);
    expect(mock.startStepUsedPercent()).toBe(used);
  });

  it("the merge streams its menu and ends DONE; the same merge again is not counted; combine and fit answer JSON and count", async () => {
    const lists = await post(LISTS, { question_line: QUESTION, reading_level: "plain" }, 13_000);
    const events = listEventsOf(lists);
    const checkRef = events[0]!.event === "check" ? events[0]!.data.check_ref : "";
    const inByCut = events.flatMap((one) => (one.event === "list" ? [one.data.list] : []));
    const merge = { question_line: QUESTION, check_ref: checkRef, reading_level: "plain", lists: inByCut };
    const menuRes = await post("/v1/asks/paths/merge", merge, 5_000);
    const frames = framesOf(menuRes).map((one) => StartMergeEventSchema.parse(one));
    expect(frames.map((one) => one.event)).toEqual(["menu", "end"]);
    expect(frames[1]).toEqual({ event: "end", data: { reason: "DONE" } });
    await post("/v1/asks/paths/merge", merge, 5_000);
    expect(mock.startStepCounters().merges).toBe(1);
    const menu = frames[0]!.event === "menu" ? frames[0]!.data.menu : null;
    const combine = await post("/v1/asks/paths/combine", { context: { kind: "MENU", question_line: QUESTION, check_ref: checkRef, menu_id: menu!.menu.menu_id },
      reading_level: "plain", members: [{ viewpoint_id: "pt12", pick_no: null, title: "Who gains and who loses", question: "Who gains?" },
        { viewpoint_id: "pt14", pick_no: null, title: "What the evidence says so far", question: "What do studies say?" }] }, 5_000);
    expect(StartCombineResponseSchema.parse(jsonOf(combine)).source).toBe("AI");
    const fit = await post("/v1/asks/paths/fit", { question_line: QUESTION, check_ref: checkRef, reading_level: "plain", own_text: "What studies say",
      paths: [{ key: "kp04", title: "What the evidence says so far", question: "What do studies say?" }] }, 5_000);
    expect(StartFitResponseSchema.parse(jsonOf(fit))).toEqual({ source: "AI", fits_key: "kp04" });
    expect(mock.startStepCounters()).toEqual({ lists: 1, merges: 1, combines: 1, fits: 1 });
  });

  it("#mix asks for the language first, and the choice reads the lists", async () => {
    const offered = listEventsOf(await post(LISTS, { question_line: `${QUESTION} #mix`, reading_level: "plain" }, 2_000));
    expect(offered.map((one) => one.event)).toEqual(["language_offer", "end"]);
    expect(offered[1]).toEqual({ event: "end", data: { reason: "LANGUAGE_CHOICE" } });
    const offer = offered[0]!.event === "language_offer" ? offered[0]!.data.offer : null;
    const chosen = listEventsOf(await post(LISTS, { question_line: offer!.proposed_question, reading_level: "plain",
      question_language_choice: { check_ref: offer!.check_ref, choice: "USE_REWRITE", original_question_line: `${QUESTION} #mix` } }, 13_000));
    expect(chosen[0]!.event).toBe("check");
    expect(mock.startStepCounters().lists).toBe(1);
  });

  it("answers no other route", async () => {
    const res = new FakeResponse();
    expect(await mock.routeStartStep(fakeRequest({}), res as unknown as ServerResponse, "/v1/asks/room", "GET")).toBe(false);
    expect(res.headersSent).toBe(false);
  });
});

describe("V4 mock API: the room and POST /v1/asks (Task 80)", () => {
  it("the room's start step: How wide and each path count's share, by plan and depth (made-up shares)", () => {
    const plusFirst = { lists: "ON", widths: { options: [3, 5, 7], default: 5 }, share_by_paths: [6, 9, 12, 15, 18, 21, 24] };
    expect(mock.startStepRoomPart("PLUS", 1)).toEqual(plusFirst);
    expect(mock.startStepRoomPart("PLUS", 2)).toEqual({ ...plusFirst, share_by_paths: [11, 16, 21, 26, 31, 36, 41] });
    expect(mock.startStepRoomPart("PLUS", 3).share_by_paths).toEqual([11, 16, 21, 26, 31, 36, 41]);
    const free = { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [8, 12, 16] };
    expect(mock.startStepRoomPart("FREE", 1)).toEqual(free);
    expect(mock.startStepRoomPart("FREE", 2)).toEqual(free);
    for (const plan of ["PLUS", "FREE"] as const) for (const depth of [1, 2]) expect(StartStepRoomSchema.safeParse(mock.startStepRoomPart(plan, depth)).success).toBe(true);
  });

  it("a Free new question without the notice is refused 403 while the room has the start step; with it, it goes on (ask-f2, Q14)", () => {
    const ask = AskRequestSchema.parse({ ...BASE_ASK, plan_tier: "free" });
    expect(mock.startStepRoomPart("FREE", 1).lists).toBe("ON");
    expect(mock.startAskRefusal({ ask, newQuestion: true, plan: "FREE" })).toEqual({ status: 403, error: FREE_PUBLIC_NOTICE_REQUIRED });
    expect(mock.startAskRefusal({ ask: { ...ask, free_public_notice: true }, newQuestion: true, plan: "FREE" })).toBeNull();
    // A dig is never held, and a paid person never sees the notice.
    expect(mock.startAskRefusal({ ask, newQuestion: false, plan: "FREE" })).toBeNull();
    expect(mock.startAskRefusal({ ask, newQuestion: true, plan: "PLUS" })).toBeNull();
  });

  it("an edited question line with references signed for the line read at Next goes on (choose-d2); another plan's are stale", () => {
    const script = mock.mockStartListsScript(QUESTION, "PLUS");
    const menu = mock.mockStartMenu(listsOf(script, "list"), null).menu;
    const ask = askWithPaths({ line: `${QUESTION} I mean the next 25 years. A typo fixed.`, checkRef: checkRefOf(script), menu, count: 5, width: 5 });
    expect(mock.startAskRefusal({ ask, newQuestion: true, plan: "PLUS" })).toBeNull();
    // The plan changed since Next (the Free lock comes first, so this Free ask shows the notice).
    expect(mock.startAskRefusal({ ask: { ...ask, free_public_notice: true }, newQuestion: true, plan: "FREE" })).toEqual({ status: 409, error: START_PATHS_STALE });
  });

  it("#siteupdated: 30 s after the first room read the room names the next version and paid widths [3, 5]; older paths go on with 5 and are NARROWED with 7", () => {
    const script = mock.mockStartListsScript(QUESTION, "PLUS");
    const menu = mock.mockStartMenu(listsOf(script, "list"), null).menu;
    mock.setStartRoomScene("SITEUPDATED");
    expect(mock.startRoomReadOutcome(T0)).toBe("ANSWER");
    expect(mock.startSettingsVersion(T0 + 29_999)).toBe(20);
    expect(mock.startStepRoomPart("PLUS", 1, T0 + 29_999).widths.options).toEqual([3, 5, 7]);
    expect(mock.startSettingsVersion(T0 + 30_000)).toBe(21);
    expect(mock.startStepRoomPart("PLUS", 1, T0 + 30_000)).toEqual({ lists: "ON", widths: { options: [3, 5], default: 5 }, share_by_paths: [6, 9, 12, 15, 18] });
    expect(StartStepRoomSchema.safeParse(mock.startStepRoomPart("PLUS", 2, T0 + 30_000)).success).toBe(true);
    expect(mock.startStepRoomPart("FREE", 1, T0 + 30_000).widths.options).toEqual([3]);
    const ask = (count: number) => askWithPaths({ line: QUESTION, checkRef: checkRefOf(script), menu, count, width: 7 });
    expect(mock.startAskRefusal({ ask: ask(5), newQuestion: true, plan: "PLUS", now: T0 + 30_000 })).toBeNull();
    expect(mock.startAskRefusal({ ask: ask(7), newQuestion: true, plan: "PLUS", now: T0 + 30_000 })).toEqual({ status: 409, error: START_PATHS_NARROWED });
    // Before the update, seven go on.
    expect(mock.startAskRefusal({ ask: ask(7), newQuestion: true, plan: "PLUS", now: T0 + 29_999 })).toBeNull();
  });

  it("#siteupdated typed in the question starts the 30 s at Next", async () => {
    await post(LISTS, { question_line: `${QUESTION} #siteupdated`, reading_level: "plain" }, 13_000);
    expect(mock.startRoomScene()).toBe("SITEUPDATED");
    expect(mock.startSettingsVersion(T0 + 29_999)).toBe(20);
    expect(mock.startSettingsVersion(T0 + 30_000)).toBe(21);
  });

  it("#planfails fails the first two room reads and answers the third; #planfailsall fails every one (read-f3)", () => {
    expect(mock.startRoomReadOutcome()).toBe("ANSWER");
    mock.setStartRoomScene("PLANFAILS");
    expect([1, 2, 3, 4].map(() => mock.startRoomReadOutcome())).toEqual(["FAIL", "FAIL", "ANSWER", "ANSWER"]);
    mock.setStartRoomScene("PLANFAILSALL");
    expect([1, 2, 3, 4, 5].map(() => mock.startRoomReadOutcome())).toEqual(["FAIL", "FAIL", "FAIL", "FAIL", "FAIL"]);
    mock.setStartRoomScene("NONE");
    expect(mock.startRoomReadOutcome()).toBe("ANSWER");
  });
});

describe("V4 mock API: the clarifying questions (Task 80)", () => {
  it("carries version 2's members: each answer's sentence, the place question marked, and \"What do you care about most?\"", async () => {
    const res = await post("/v1/asks/clarify", { question_line: QUESTION }, 1_000);
    expect(res.statusCode).toBe(200);
    const reply = AskClarifyResponseSchema.parse(jsonOf(res));
    if (reply.source !== "AI") throw new Error("an AI reply");
    expect(reply.questions.every((question) => question.sentences?.length === question.answers.length)).toBe(true);
    expect(reply.questions.filter((question) => question.about_place === true)).toHaveLength(1);
    expect(reply.cares?.text).toBe("What do you care about most?");
    expect(reply.cares?.sentences?.length).toBe(reply.cares?.answers.length);
    expect(reply.questions.find((question) => question.text === "Over what time?")!.answers.length).toBeGreaterThanOrEqual(3);
  });

  it("#late answers at 9_000 ms and not before; #slow never before the page's own wait", async () => {
    const late = new FakeResponse();
    const handled = mock.routeStartStep(fakeRequest({ question_line: `${QUESTION} #late` }), late as unknown as ServerResponse, "/v1/asks/clarify", "POST");
    await vi.advanceTimersByTimeAsync(8_999);
    expect(late.writableEnded).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await handled).toBe(true);
    expect(late.statusCode).toBe(200);
    expect(AskClarifyResponseSchema.safeParse(jsonOf(late)).success).toBe(true);
    const slow = new FakeResponse();
    const slowHandled = mock.routeStartStep(fakeRequest({ question_line: `${QUESTION} #slow` }), slow as unknown as ServerResponse, "/v1/asks/clarify", "POST");
    await vi.advanceTimersByTimeAsync(ASK_CLARIFY_PAGE_WAIT_MS);
    expect(slow.writableEnded).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await slowHandled).toBe(true);
  });

  it("a second, different line after a first reading with questions gets them reworded: \"By when?\" keeps the answers but the last (read-f1)", () => {
    const first = AskClarifyResponseSchema.parse(mock.mockClarify({ question_line: QUESTION }).body);
    const again = AskClarifyResponseSchema.parse(mock.mockClarify({ question_line: QUESTION }).body);
    expect(again).toEqual(first);
    const second = mock.mockClarify({ question_line: "Should my town close its centre to cars on Saturdays?" });
    expect(second.status).toBe(200);
    const reworded = AskClarifyResponseSchema.parse(second.body);
    if (first.source !== "AI" || reworded.source !== "AI") throw new Error("AI replies");
    const when = first.questions.find((question) => question.text === "Over what time?")!;
    const byWhen = reworded.questions.find((question) => question.text === "By when?")!;
    expect(byWhen.answers).toEqual(when.answers.slice(0, -1));
    expect(byWhen.sentences).toEqual(when.sentences!.slice(0, -1));
    expect(reworded.questions.map((question) => question.text)).not.toContain("Over what time?");
    expect(reworded.cares).toEqual(first.cares);
  });
});

describe("V4 mock API: server.ts serves the step (Task 80)", () => {
  const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");

  it("the startup self-check passes every body the step can send, and moves no counter", () => {
    expect(mock.startStepSelfCheck()).toBeGreaterThan(50);
    expect(mock.startStepCounters()).toEqual({ lists: 0, merges: 0, combines: 0, fits: 0 });
    expect(mock.startStepUsedPercent()).toBe(0);
  });
  const between = (from: string, to: string): string => server.slice(server.indexOf(from), server.indexOf(to, server.indexOf(from)));

  it("routes the step and the clarifying questions through start-step.ts, before POST /v1/asks", () => {
    expect(server).toContain('from "./start-step.js";');
    const routed = server.indexOf("if (await routeStartStep(req, res, path, method, { plan: planMode })) return;");
    expect(routed).toBeGreaterThan(-1);
    expect(routed).toBeLessThan(server.indexOf('if (path === "/v1/asks" && method === "POST") return postAsk(req, res);'));
    expect(server).not.toContain("postClarify");
  });

  it("the room read: the scenes' failures, the version, the start step on a new question's read with its depth", () => {
    const room = between('if (path === "/v1/asks/room" && isGet) {', 'if (path === "/v1/asks" && method === "POST")');
    expect(room).toContain('if (startRoomReadOutcome() === "FAIL") return sendJson(req, res, 503,');
    expect(room).toContain("query.data.depth");
    const read = between("function roomRead(", "/** GET /v1/billing/subscription");
    expect(read).toContain("settings_version: startSettingsVersion(now)");
    expect(read).toContain('...("start_share_percent" in share ? { start_step: startStepRoomPart(plan_id, depth, now) } : {})');
  });

  it("the usage that moves, the state's counters, the startup self-check and the room scene switch", () => {
    expect(between("function billingUsage(", "/** The register's default plans")).toContain("startStepUsedPercent()");
    expect(between("function mockState(", "function positiveInt(")).toContain("...startStepCounters()");
    expect(between("function startupCheck(", "const CHECKED = startupCheck();")).toContain("startStepSelfCheck()");
    expect(between('if (parts[1] === "set"', 'if (parts[1] === "sign-in"')).toContain('url.searchParams.get("roomscene")');
  });

  it("POST /v1/asks refuses as the step says before anything starts", () => {
    const ask = between("async function postAsk(", "function sendProgress(");
    expect(ask).toContain("startAskRefusal({ ask: parsed.data, newQuestion: parent === null && publicParent === undefined, plan: planMode })");
    expect(ask.indexOf("startAskRefusal(")).toBeLessThan(ask.indexOf("const runRef = randomUUID();"));
  });
});
