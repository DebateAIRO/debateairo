// tests/unit/start-step-merge.test.ts
// V4 start step, Task 24 (spec 2026-11-03 §2, §4.1): the menu the person shapes, built by packages/map from the lists: the code menu (each
// viewpoint its own path), the menu from the Haiku merge (repeats marked, clear overlaps put together, most useful first, cards and
// suggestions), the late merge that only appends, and the top paths code takes. The map builds menus and never parses them: the API and the
// runner check each against StartMenuSchema, as this test does. A scripted caller whose replies are TEXT read by each call's own spec.
import { describe, expect, it } from "vitest";
import { READER_SENTENCE_WRITING, type ReadingLevel } from "@debateai/kernel";
import {
  START_CALL_SITES, mapMergeStartLists, startCodeMenu, startLateMenu, startMenuFromMerge, startPathRefOf, startTopPaths, type MapCallOutcome,
  type MapCallRequest, type MapCaller, type MapSeat, type StartMergeLateReply, type StartMergeReply
} from "@debateai/map";
import { StartMenuSchema, type StartList, type StartListViewpoint, type StartMenu } from "@debateai/contract";

const Q = "Should the town build a second ferry pier before next summer?";
const LANGUAGE = { code: "en", name: "English" };
const MENU_ID = "Ab3_dEf-Gh1jKl2MnOpQ4r";
const HAIKU: MapSeat = { aiRef: "haiku", maker: "Anthropic" };
const STOP = { finishReason: "stop" };
const angleOf = (no: number): string => `g${String(((no - 1) % 7) + 1)}`;
const vp = (id: string, title: string): StartListViewpoint => ({ viewpoint_id: id, title,
  question: `Would ${title.toLowerCase()} change whether the second pier is worth building?`, why: `${title} could change the answer for the town.`,
  angle_id: angleOf(Number(id[2])) });
const listOf = (no: number, titles: readonly string[]): StartList => ({ list_no: no,
  angles: [{ angle_id: angleOf(no), kind: "SPECIFIC", label: `Angle ${String(no)}` }],
  viewpoints: titles.map((title, at) => vp(`pt${String(no)}${String(at + 1)}`, title)) });
const L1 = listOf(1, ["Queues at the old pier", "Ferries in the winter", "Building costs"]);
const BASE = { questionLine: Q, languageName: "English", languageTag: "en", readingLevel: null as ReadingLevel | null, clarifyLines: [] as string[],
  menuId: MENU_ID };
const shapeOf = (menu: StartMenu) => menu.paths.map((path) => [path.path_ref, path.viewpoint_ids, path.put_together]);
/** Every viewpoint of every list appears exactly once in the menu: shown, or kept as a repeat. */
const everyOnce = (menu: StartMenu, lists: readonly StartList[]): void => {
  const inMenu = [...menu.viewpoints, ...menu.repeats].map((one) => one.viewpoint_id).sort();
  expect(inMenu).toEqual(lists.flatMap((list) => list.viewpoints.map((one) => one.viewpoint_id)).sort());
  expect(StartMenuSchema.safeParse(menu).success, JSON.stringify(StartMenuSchema.safeParse(menu).error?.issues)).toBe(true);
};

type Reply = string | "FAIL";
function scripted(replies: Readonly<Record<string, Reply>>) {
  const requests: MapCallRequest<unknown>[] = [];
  const caller: MapCaller = {
    async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
      requests.push(request as MapCallRequest<unknown>);
      const reply = replies[request.callSiteKey];
      if (reply === undefined || reply === "FAIL") return { kind: "FAILED", code: "TEST_FAILED" };
      if (request.spec.classify(reply, STOP).parseStatus !== "PARSED") return { kind: "FAILED", code: "TEST_UNPARSED" };
      return { kind: "OK", value: request.spec.read(reply, STOP) };
    }
  };
  return { caller, requests };
}
const merge = (value: Readonly<{ repeats?: unknown[]; paths: unknown[]; cards?: unknown[]; suggestions?: unknown[] }>): string =>
  JSON.stringify({ repeats: value.repeats ?? [], paths: value.paths, cards: value.cards ?? [], suggestions: value.suggestions ?? [] });
const one = (id: string) => ({ ids: [id], title: null, question: null });
const CARD = { kind: "EITHER_OR" as const, sentence: "The question takes for granted that the town must choose between a pier and nothing at all.",
  title: "A bigger ferry instead", question: "Would one bigger ferry serve the town better than a second pier?", fits_path: 2, as_question: null };

describe("the path refs and the top paths", () => {
  it("number the menu's paths kp01..kp54", () => {
    expect([1, 9, 12, 54].map(startPathRefOf)).toEqual(["kp01", "kp09", "kp12", "kp54"]);
    expect(() => startPathRefOf(0)).toThrow();
    expect(() => startPathRefOf(55)).toThrow();
  });

  it("the top paths are the first ones, most useful first", () => {
    const MENU_SIX = startCodeMenu(listOf(1, ["Queues", "Winter", "Costs", "Crews", "Dredging", "Tourists"]), { menuId: MENU_ID, language: LANGUAGE });
    expect(startTopPaths(MENU_SIX, 5).map((path) => path.path_ref)).toEqual(["kp01", "kp02", "kp03", "kp04", "kp05"]);
    expect(startTopPaths(MENU_SIX, 7)).toHaveLength(6);
  });
});

describe("the first menu", () => {
  it("one list still goes to the merge: one call, the reply's order, cards and suggestions kept", async () => {
    const script = scripted({ [START_CALL_SITES.merge]: merge({ paths: [one("pt12"), one("pt11"), one("pt13")], cards: [CARD],
      suggestions: [{ kind: "COMBINE", paths: [1, 2], reason: "Both ask about the pier in the quiet months." }, { kind: "FITS", path: 3, into: 1 }] }) });
    const done = await mapMergeStartLists({ ...BASE, lists: [L1], prior: null, seat: HAIKU, caller: script.caller, signal: new AbortController().signal });
    expect(script.requests.map((request) => [request.callSiteKey, request.step, request.seat.aiRef])).toEqual([["START:merge", "START_MERGE", "haiku"]]);
    expect(done.source).toBe("AI");
    expect(done.calls.map((call) => [call.callSiteKey, call.outcome])).toEqual([["START:merge", "OK"]]);
    expect(shapeOf(done.menu)).toEqual([["kp01", ["pt12"], false], ["kp02", ["pt11"], false], ["kp03", ["pt13"], false]]);
    expect(done.menu.paths[0]).toMatchObject({ title: "Ferries in the winter", question: L1.viewpoints[1]!.question, is_new: false });
    expect(done.menu.cards).toEqual([{ card_id: "cd1", kind: "EITHER_OR", sentence: CARD.sentence, new_path: { title: CARD.title, question: CARD.question },
      fits_path_ref: "kp02", as_question: null }]);
    expect(done.menu.suggestions).toEqual([{ suggestion_id: "sg1", kind: "COMBINE", path_refs: ["kp01", "kp02"], reason: "Both ask about the pier in the quiet months." },
      { suggestion_id: "sg2", kind: "FITS", path_ref: "kp03", into_path_ref: "kp01" }]);
    expect(done.menu).toMatchObject({ menu_id: MENU_ID, revision: 1, language: LANGUAGE, angles: L1.angles });
    everyOnce(done.menu, [L1]);
  });

  it("one list and no Haiku seat: the code menu, each viewpoint its own path, and no call", async () => {
    const script = scripted({});
    const done = await mapMergeStartLists({ ...BASE, lists: [L1], prior: null, seat: null, caller: script.caller, signal: new AbortController().signal });
    expect(done.source).toBe("CODE");
    expect(done.calls).toEqual([]);
    expect(script.requests).toEqual([]);
    expect(done.menu.paths.map((path) => [path.path_ref, path.viewpoint_ids])).toEqual([["kp01", ["pt11"]], ["kp02", ["pt12"]], ["kp03", ["pt13"]]]);
    expect(done.menu.repeats).toEqual([]);
    expect(done.menu.cards).toEqual([]);
    expect(done.menu.suggestions).toEqual([]);
    expect(done.menu).toEqual(startCodeMenu(L1, { menuId: MENU_ID, language: LANGUAGE }));
    everyOnce(done.menu, [L1]);
  });

  it("the merge reads what the asker said; the reader only with a level", async () => {
    for (const readingLevel of [null, "plain"] as const) {
      const script = scripted({ [START_CALL_SITES.merge]: merge({ paths: [one("pt11"), one("pt12"), one("pt13")] }) });
      await mapMergeStartLists({ ...BASE, readingLevel, clarifyLines: ["To decide how to vote"], lists: [L1], prior: null, seat: HAIKU,
        caller: script.caller, signal: new AbortController().signal });
      const spec = script.requests[0]!.spec;
      expect(spec.material.map((entry) => entry.name)).toEqual(readingLevel === null ? ["question_line", "said", "suggestions", "question_language"]
        : ["question_line", "said", "suggestions", "reader", "question_language"]);
      expect(spec.material.find((entry) => entry.name === "said")!.content).toBe(JSON.stringify(["To decide how to vote"]));
      if (readingLevel === null) expect(spec.contract.instruction).not.toContain(READER_SENTENCE_WRITING);
      else expect(spec.contract.instruction).toContain(`\n\n${READER_SENTENCE_WRITING}\n\n`);
    }
  });

  const L1B = listOf(1, ["Queues at the old pier", "Ferries in the winter"]);
  const L2B = listOf(2, ["Queues again at the old pier", "Winter ferry crossings"]);

  it("a repeat, a group and a left-out viewpoint: the group first, the left-out appended, the repeat's own words kept", () => {
    const reply: StartMergeReply = { repeats: [{ id: "pt21", same_as: "pt11" }], paths: [{ ids: ["pt12", "pt22"], title: "Winter at the pier",
      question: "Would the pier be used at all in the winter months?" }], cards: [], suggestions: [] };
    const menu = startMenuFromMerge(reply, [L1B, L2B], { menuId: MENU_ID, language: LANGUAGE });
    expect(shapeOf(menu)).toEqual([["kp01", ["pt12", "pt22"], true], ["kp02", ["pt11"], false]]);
    expect(menu.paths[0]).toMatchObject({ title: "Winter at the pier", question: "Would the pier be used at all in the winter months?" });
    expect(menu.paths[1]).toMatchObject({ title: "Queues at the old pier", question: L1B.viewpoints[0]!.question });
    expect(menu.viewpoints.find((one) => one.viewpoint_id === "pt11")!.repeat_ids).toEqual(["pt21"]);
    expect(menu.repeats).toEqual([L2B.viewpoints[0]]);
    expect(menu.angles.map((angle) => angle.angle_id)).toEqual(["g1", "g2"]);
    everyOnce(menu, [L1B, L2B]);
  });

  it("a group without usable words takes its first viewpoint's; the suggestions name the menu's paths", () => {
    const reply: StartMergeReply = { repeats: [{ id: "pt21", same_as: "pt11" }], paths: [{ ids: ["pt12", "pt22"], title: null, question: null },
      { ids: ["pt11"], title: null, question: null }], cards: [],
    suggestions: [{ kind: "COMBINE", paths: [1, 2], reason: "Both turn on how the pier is used." }] };
    const menu = startMenuFromMerge(reply, [L1B, L2B], { menuId: MENU_ID, language: LANGUAGE });
    expect(shapeOf(menu)).toEqual([["kp01", ["pt12", "pt22"], true], ["kp02", ["pt11"], false]]);
    expect(menu.paths[0]).toMatchObject({ title: "Ferries in the winter", question: L1B.viewpoints[1]!.question });
    expect(menu.suggestions).toEqual([{ suggestion_id: "sg1", kind: "COMBINE", path_refs: ["kp01", "kp02"], reason: "Both turn on how the pier is used." }]);
    everyOnce(menu, [L1B, L2B]);
  });

  it("nine repeats of one viewpoint: its first eight are repeats, the ninth its own path at the end", async () => {
    const lists = [listOf(1, ["Queues at the old pier", "Ferries in the winter"]),
      listOf(2, ["Queues again", "Long queues", "Fishing boats"]),
      ...[3, 4, 5, 6, 7, 8, 9].map((no) => listOf(no, [`Queues once more ${String(no)}`, `Another point ${String(no)}`]))];
    const repeatIds = ["pt21", "pt22", ...[3, 4, 5, 6, 7, 8, 9].map((no) => `pt${String(no)}1`)];
    const kept = ["pt11", "pt12", "pt23", ...[3, 4, 5, 6, 7, 8, 9].map((no) => `pt${String(no)}2`)];
    const script = scripted({ [START_CALL_SITES.merge]: merge({ repeats: repeatIds.map((id) => ({ id, same_as: "pt11" })), paths: kept.map(one) }) });
    const done = await mapMergeStartLists({ ...BASE, lists, prior: null, seat: HAIKU, caller: script.caller, signal: new AbortController().signal });
    expect(done.source).toBe("AI");
    expect(done.menu.viewpoints.find((one) => one.viewpoint_id === "pt11")!.repeat_ids).toEqual(repeatIds.slice(0, 8));
    expect(done.menu.repeats.map((one) => one.viewpoint_id)).toEqual(repeatIds.slice(0, 8));
    expect(done.menu.paths.map((path) => path.viewpoint_ids)).toEqual([...kept.map((id) => [id]), ["pt91"]]);
    expect(done.menu.paths.at(-1)).toMatchObject({ path_ref: "kp11", put_together: false, is_new: false, title: "Queues once more 9" });
    everyOnce(done.menu, lists);
  });

  it("a failed first merge: the code menu of the first list, the others left for a late merge", async () => {
    const script = scripted({ [START_CALL_SITES.merge]: "FAIL" });
    const done = await mapMergeStartLists({ ...BASE, lists: [L1B, L2B], prior: null, seat: HAIKU, caller: script.caller, signal: new AbortController().signal });
    expect(done.source).toBe("CODE");
    expect(done.calls.map((call) => [call.callSiteKey, call.outcome, call.code])).toEqual([["START:merge", "FAILED", "TEST_FAILED"]]);
    expect(done.menu).toEqual(startCodeMenu(L1B, { menuId: MENU_ID, language: LANGUAGE }));
  });

  it("an aborted signal asks nothing and gives the code menu", async () => {
    const script = scripted({ [START_CALL_SITES.merge]: merge({ paths: [one("pt11")] }) });
    const controller = new AbortController();
    controller.abort();
    const done = await mapMergeStartLists({ ...BASE, lists: [L1], prior: null, seat: HAIKU, caller: script.caller, signal: controller.signal });
    expect(script.requests).toEqual([]);
    expect(done.source).toBe("CODE");
  });
});

describe("the late merge", () => {
  const PRIOR = startMenuFromMerge({ repeats: [], paths: [one("pt11"), one("pt12"), one("pt13")], cards: [{ ...CARD, fits_path: 1 }],
    suggestions: [{ kind: "COMBINE", paths: [1, 2], reason: "Both ask about the pier in the quiet months." }] }, [L1], { menuId: MENU_ID, language: LANGUAGE });
  const LATE = listOf(2, ["Queues again at the old pier", "Dredging the harbour"]);

  it("only appends: the prior paths, repeats, cards and suggestions in place, a new path marked new, its fit a suggestion", async () => {
    const script = scripted({ [START_CALL_SITES.mergeLate]: JSON.stringify({ repeats: [{ id: "pt21", same_as: "pt11" }], paths: [one("pt22")],
      fits: [{ path: 1, into: "kp02" }] }) });
    const done = await mapMergeStartLists({ ...BASE, lists: [LATE], prior: PRIOR, seat: HAIKU, caller: script.caller, signal: new AbortController().signal });
    expect(script.requests.map((request) => request.callSiteKey)).toEqual(["START:merge-late"]);
    expect(done.source).toBe("AI");
    expect(done.menu.revision).toBe(2);
    expect(done.menu.paths.slice(0, 3)).toEqual(PRIOR.paths);
    expect(done.menu.repeats.slice(0, PRIOR.repeats.length)).toEqual(PRIOR.repeats);
    expect(done.menu.cards).toEqual(PRIOR.cards);
    expect(done.menu.suggestions.slice(0, 1)).toEqual(PRIOR.suggestions);
    expect(done.menu.paths[3]).toEqual({ path_ref: "kp04", title: "Dredging the harbour", question: LATE.viewpoints[1]!.question, viewpoint_ids: ["pt22"],
      put_together: false, is_new: true });
    expect(done.menu.suggestions[1]).toEqual({ suggestion_id: "sg2", kind: "FITS", path_ref: "kp04", into_path_ref: "kp02" });
    expect(done.menu.viewpoints.find((one) => one.viewpoint_id === "pt11")!.repeat_ids).toEqual(["pt21"]);
    expect(done.menu.repeats).toEqual([LATE.viewpoints[0]]);
    everyOnce(done.menu, [L1, LATE]);
  });

  it("a late repeat beyond the eighth becomes a new path", () => {
    const first = [listOf(1, ["Queues at the old pier", "Ferries in the winter"]), listOf(2, ["Queues again", "Long queues", "Waiting in line"]),
      listOf(3, ["Queues once more", "Lines at the pier"]), listOf(4, ["Queueing cars", "Queueing walkers"]), listOf(5, ["Queues in summer"])];
    const eight = ["pt21", "pt22", "pt23", "pt31", "pt32", "pt41", "pt42", "pt51"];
    const prior = startMenuFromMerge({ repeats: eight.map((id) => ({ id, same_as: "pt11" })), paths: [one("pt11"), one("pt12")], cards: [], suggestions: [] },
      first, { menuId: MENU_ID, language: LANGUAGE });
    const late = listOf(6, ["Queues yet again", "The harbour wall"]);
    const reply: StartMergeLateReply = { repeats: [{ id: "pt61", same_as: "pt11" }], paths: [{ ids: ["pt62"], title: null, question: null }], fits: [] };
    const menu = startLateMenu(prior, reply, [late]);
    expect(menu.viewpoints.find((one) => one.viewpoint_id === "pt11")!.repeat_ids).toEqual(eight);
    expect(menu.paths.slice(2).map((path) => [path.path_ref, path.viewpoint_ids, path.is_new])).toEqual([["kp03", ["pt62"], true], ["kp04", ["pt61"], true]]);
    everyOnce(menu, [...first, late]);
  });

  it("no seat, or a failed late merge: the menu so far, unchanged", async () => {
    const none = await mapMergeStartLists({ ...BASE, lists: [LATE], prior: PRIOR, seat: null, caller: scripted({}).caller, signal: new AbortController().signal });
    expect(none).toEqual({ menu: PRIOR, source: "CODE", calls: [] });
    const script = scripted({ [START_CALL_SITES.mergeLate]: "FAIL" });
    const failed = await mapMergeStartLists({ ...BASE, lists: [LATE], prior: PRIOR, seat: HAIKU, caller: script.caller, signal: new AbortController().signal });
    expect(failed.menu).toBe(PRIOR);
    expect(failed.source).toBe("CODE");
    expect(failed.calls.map((call) => [call.callSiteKey, call.outcome])).toEqual([["START:merge-late", "FAILED"]]);
  });
});
