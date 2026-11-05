// V4 start step, Task 53 (spec 2026-11-03 §4.3; plan Task 53): a path debate's set, worked out by the runner. The list seats of a
// run that builds its own list (distinct companies first, then a company's second seat marked "#2"), the stable menu id, the set it
// records (top paths, or the question itself when no list came), what the gap round is told was already raised, where the set comes
// from (read first; a menu or dig set missing refuses the run), the carry-on member, and the runner's map caller for the start steps.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MENU_ID_PATTERN, StartMenuSchema, pathIdOf, type StartList, type StartMenu } from "@debateai/contract";
import type { StartPathsStore, StoredStartPathSet } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { START_SEAT_REUSE_SUFFIX, mapAnglesSpec, mapPromptContractHash, type MapCallOutcome, type MapCallRequest, type MapCaller, type MapSeat } from "@debateai/map";
import { replyLanguageExpectation } from "@debateai/kernel";
import { readPromptFrame, type PromptPacket, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { WEB_DIG_PLANNER_V3_CONTRACT_ID } from "@debateai/judgement";
import { runRunnerWebStep } from "../../apps/runner/src/web-step.js";
import type { WebReuseSource } from "../../apps/runner/src/web-reuse.js";
import { membersOf, memoryStore, perplexity, stepInput, team } from "../support/web-step-world.js";
import {
  PATHS_RUN_CODES, carryOnToReportOf, gapAlreadyRaised, resolvePathsRunSet, runBuiltListSeats, runBuiltMenu, runBuiltMenuId,
  runBuiltStartPathSet
} from "../../apps/runner/src/paths-run.js";
import { createRunnerMapCaller, mapStageBound, type MapStageDeps } from "../../apps/runner/src/map-stage.js";

const RUN = "11111111-2222-4333-8444-555555555555";
const seat = (aiRef: string, maker: string): MapSeat => Object.freeze({ aiRef, maker });

/** A menu of six one-viewpoint paths, T1..T6 asking Q1?..Q6?, from one list. */
function menuOfSix(): StartMenu {
  const numbers = [1, 2, 3, 4, 5, 6];
  const menu: StartMenu = {
    menu_id: runBuiltMenuId(RUN), revision: 1, language: { code: "en", name: "English" },
    angles: [{ angle_id: "g1", kind: "GENERAL", label: "In general" }],
    viewpoints: numbers.map((n) => ({ viewpoint_id: `pt1${String(n)}`, title: `T${String(n)}`, question: `Q${String(n)}?`, why: "It matters.",
      angle_id: "g1", repeat_ids: [] })),
    repeats: [],
    paths: numbers.map((n) => ({ path_ref: `kp0${String(n)}`, title: `T${String(n)}`, question: `Q${String(n)}?`, viewpoint_ids: [`pt1${String(n)}`],
      put_together: false, is_new: false })),
    cards: [], suggestions: []
  };
  expect(StartMenuSchema.safeParse(menu).success).toBe(true);
  return menu;
}
const LATE: StartList = { list_no: 2, angles: [{ angle_id: "g1", kind: "GENERAL", label: "In general" }],
  viewpoints: [{ viewpoint_id: "pt21", title: "Late", question: "Late question?", why: "It came late.", angle_id: "g1" }] };

describe("the list seats of a run that builds its own list", () => {
  it("one seat per company first, then each company's second seat marked #2, never more than twice the companies", () => {
    const ordered = [seat("pA", "A"), seat("pB", "B"), seat("pA2", "A"), seat("pC", "C")];
    expect(runBuiltListSeats(ordered, 4).map((one) => one.aiRef)).toEqual(["pA", "pB", "pC", `pA${START_SEAT_REUSE_SUFFIX}`]);
    expect(runBuiltListSeats(ordered, 2).map((one) => one.aiRef)).toEqual(["pA", "pB"]);
    // Seven writers on three companies: six seats (two a company), never a third seat of one company.
    const seven = runBuiltListSeats(ordered, 7);
    expect(seven.map((one) => one.aiRef)).toEqual(["pA", "pB", "pC", "pA#2", "pB#2", "pC#2"]);
    expect(seven.map((one) => one.maker)).toEqual(["A", "B", "C", "A", "B", "C"]);
    expect(runBuiltListSeats([], 4)).toEqual([]);
  });
});

describe("the run-built menu id", () => {
  it("is the same for the same run, another for another run, and a menu id the contract accepts", () => {
    const id = runBuiltMenuId(RUN);
    expect(id).toBe(createHash("sha256").update(`run-built-menu:${RUN}`).digest("base64url").slice(0, 22));
    expect(runBuiltMenuId(RUN)).toBe(id);
    expect(runBuiltMenuId("99999999-2222-4333-8444-555555555555")).not.toBe(id);
    expect(id).toMatch(MENU_ID_PATTERN);
  });
});

describe("the set a run that builds its own list records", () => {
  it("the menu's top paths at How wide, each an AI suggestion, chosen by the AIs, the menu kept", () => {
    const menu = menuOfSix();
    const set = runBuiltStartPathSet({ runId: RUN, menu, width: 5, free: false, carryOnToReport: true, questionLine: "Should the town build it?" });
    expect(set).toMatchObject({ runId: RUN, source: "RUN_BUILT", width: 5, chosenBy: "AIS", carryOnToReport: true, menu: { menu, lateLists: [] } });
    expect(set.paths.map((path) => [path.pathId, path.pathNo, path.author, path.title, path.question])).toEqual([
      ["b1", 1, "AI_SUGGESTION", "T1", "Q1?"], ["b2", 2, "AI_SUGGESTION", "T2", "Q2?"], ["b3", 3, "AI_SUGGESTION", "T3", "Q3?"],
      ["b4", 4, "AI_SUGGESTION", "T4", "Q4?"], ["b5", 5, "AI_SUGGESTION", "T5", "Q5?"]]);
    expect(set.paths[0]!.viewpoints).toEqual([{ viewpointId: "pt11", pickNo: null, title: "T1", question: "Q1?", own: false }]);
    expect(set.paths.every((path) => path.ownWords.length === 0)).toBe(true);
  });

  it("Free takes at most 3, whatever the width", () => {
    const set = runBuiltStartPathSet({ runId: RUN, menu: menuOfSix(), width: 5, free: true, carryOnToReport: false, questionLine: "Q?" });
    expect(set.paths.map((path) => path.pathId)).toEqual(["b1", "b2", "b3"]);
    expect(set.carryOnToReport).toBe(false);
  });

  it("no list: one path b1, the question itself, edited by the person, no own words, no viewpoint, no menu", () => {
    const set = runBuiltStartPathSet({ runId: RUN, menu: null, width: 5, free: false, carryOnToReport: false,
      questionLine: "Should the town build a second ferry pier before the bridge opens?" });
    expect(set).toMatchObject({ source: "RUN_BUILT", chosenBy: "AIS", menu: null });
    expect(set.paths).toEqual([{ pathId: "b1", pathNo: 1, author: "PERSON_EDITED", title: "Should the town build a second ferry pier before the bridge opens?",
      question: "Should the town build a second ferry pier before the bridge opens?", viewpoints: [], ownWords: [] }]);
  });

  // Review of Task 53: a question line may hold up to 8 KiB, but a path's question never more than pathQuestionMaxChars (1000), the
  // bound every reader of a path keeps (StartPathChoice, Answer.branches). The run's whole question still reaches every leg.
  it("no list and a question line longer than a path's question: the path's question is cut at a word edge to the path limit", async () => {
    const { START_STEP_LIMITS } = await import("@debateai/contract");
    const long = Array.from({ length: 300 }, (_, at) => `pier${String(at)}`).join(" ");
    expect(long.length).toBeGreaterThan(START_STEP_LIMITS.pathQuestionMaxChars);
    const set = runBuiltStartPathSet({ runId: RUN, menu: null, width: 5, free: false, carryOnToReport: false, questionLine: long });
    const question = set.paths[0]!.question;
    expect(question.length).toBeLessThanOrEqual(START_STEP_LIMITS.pathQuestionMaxChars);
    expect(long.startsWith(question)).toBe(true);
    expect(long[question.length]).toBe(" ");
    expect(set.paths[0]!.title.length).toBeLessThanOrEqual(START_STEP_LIMITS.pathTitleMaxChars);
  });
});

describe("what the gap round is told was already raised", () => {
  const pathOf = (n: number) => Object.freeze({ pathId: pathIdOf(n), pathNo: n, author: "AI_SUGGESTION" as const, title: `T${String(n)}`,
    question: `Q${String(n)}?`, viewpoints: [{ viewpointId: `pt1${String(n)}`, pickNo: null, title: `T${String(n)}`, question: `Q${String(n)}?`, own: false }],
    ownWords: [] });
  it("the menu's paths not chosen, then the late lists' viewpoints; a dig's set has none", () => {
    const menuSet: StoredStartPathSet = { runId: RUN, source: "MENU", width: 5, chosenBy: "PERSON", carryOnToReport: false,
      paths: [1, 2, 3, 4, 5].map(pathOf), menu: { menu: menuOfSix(), lateLists: [LATE] } };
    expect(gapAlreadyRaised(menuSet)).toEqual(["T6: Q6?", "Late: Late question?"]);
    const digSet: StoredStartPathSet = { runId: RUN, source: "DIG_PICKS", width: 3, chosenBy: "PERSON", carryOnToReport: false,
      paths: [1, 2].map(pathOf), menu: null };
    expect(gapAlreadyRaised(digSet)).toEqual([]);
  });
});

describe("where a path debate's set comes from", () => {
  const stored: StoredStartPathSet = runBuiltStartPathSet({ runId: RUN, menu: null, width: 3, free: false, carryOnToReport: false, questionLine: "Q?" });
  const store = (read: readonly (StoredStartPathSet | null)[], recorded: "RECORDED" | "ALREADY" = "RECORDED") => {
    const reads = [...read];
    return {
      readStartPaths: vi.fn(async () => reads.shift() ?? null),
      recordStartPaths: vi.fn(async () => recorded)
    } as unknown as StartPathsStore & { readStartPaths: ReturnType<typeof vi.fn>; recordStartPaths: ReturnType<typeof vi.fn> };
  };

  it("a stored set is read first, and nothing is built or recorded", async () => {
    const paths = store([stored]);
    const build = vi.fn(async () => stored);
    expect(await resolvePathsRunSet({ store: paths, runId: RUN, source: "MENU", build })).toBe(stored);
    expect(build).not.toHaveBeenCalled();
    expect(paths.recordStartPaths).not.toHaveBeenCalled();
  });

  it("a menu's or a dig's set that is missing refuses the run, PATHS_SET_MISSING, building nothing", async () => {
    for (const source of ["MENU", "DIG_PICKS"] as const) {
      const build = vi.fn(async () => stored);
      await expect(resolvePathsRunSet({ store: store([null]), runId: RUN, source, build }))
        .rejects.toMatchObject({ code: PATHS_RUN_CODES.noSet });
      expect(build).not.toHaveBeenCalled();
    }
    expect(PATHS_RUN_CODES).toEqual({ unconfigured: "PATHS_RUNNER_UNCONFIGURED", overReceipt: "PATHS_OVER_RECEIPT", noSet: "PATHS_SET_MISSING",
      menuInvalid: "START_MENU_INVALID" });
  });

  it("a run that builds its own: built once and recorded; when another copy recorded first, the stored one is argued", async () => {
    const own = store([null]);
    const build = vi.fn(async () => stored);
    expect(await resolvePathsRunSet({ store: own, runId: RUN, source: "RUN_BUILT", build })).toBe(stored);
    expect(build).toHaveBeenCalledTimes(1);
    expect(own.recordStartPaths).toHaveBeenCalledWith(stored);
    const winner: StoredStartPathSet = { ...stored, width: 5 };
    const raced = store([null, winner], "ALREADY");
    expect(await resolvePathsRunSet({ store: raced, runId: RUN, source: "RUN_BUILT", build })).toBe(winner);
  });
});

describe("the carry-on box on the run's ask", () => {
  it("only the ask contract's own true member", () => {
    expect(carryOnToReportOf({ carry_on_to_report: true })).toBe(true);
    expect(carryOnToReportOf({ carry_on_to_report: "true" })).toBe(false);
    expect(carryOnToReportOf({})).toBe(false);
    expect(carryOnToReportOf(null)).toBe(false);
  });
});

describe("a run's own menu (the lists, then the merge on Haiku)", () => {
  /** A scripted map caller: the planner fails (the fixed angles), every list one viewpoint, the merge as given. */
  const scripted = (merge: unknown): MapCaller & { steps: string[] } => {
    const steps: string[] = [];
    return {
      steps,
      call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
        steps.push(request.callSiteKey);
        if (request.step === "ANGLES") return { kind: "FAILED", code: "SCRIPTED" };
        if (request.step === "START_LIST") {
          const angle = (request.spec as unknown as { material: readonly { name: string; content: string }[] }).material
            .find((field) => field.name === "angles")!.content;
          const ids = (JSON.parse(angle) as { angle_id: string }[]).map((one) => one.angle_id);
          return { kind: "OK", value: { paths: [{ angle_id: ids[0]!, title: `Title ${request.callSiteKey}`, question: "A question?", why: "Why." }] } as T };
        }
        return { kind: "OK", value: merge as T };
      }
    };
  };
  const input = (caller: MapCaller) => ({ runId: RUN, questionLine: "Should the town build a second pier?", languageName: "English",
    languageTag: "en", readingLevel: null, clarifyLines: [], seats: [seat("pA", "A"), seat("pB", "B")], haiku: seat("pH", "H"), caller });

  it("a merged menu the contract accepts is the run's menu, under the run's own menu id", async () => {
    const caller = scripted({ repeats: [], paths: [], cards: [], suggestions: [] });
    const menu = await runBuiltMenu(input(caller));
    expect(menu?.menu_id).toBe(runBuiltMenuId(RUN));
    expect(menu?.paths.length).toBe(2);
    expect(caller.steps).toEqual(["START:angles", "START:list:1", "START:list:2", "START:merge"]);
  });

  it("a merged menu the contract refuses refuses the run, START_MENU_INVALID, and nothing is asked after the merge", async () => {
    const caller = scripted({ repeats: [], paths: [{ ids: ["pt11", "pt21"], title: "x".repeat(500), question: "A combined question?" }],
      cards: [], suggestions: [] });
    const refused = await runBuiltMenu(input(caller)).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TypedDomainError);
    expect(refused).toMatchObject({ code: PATHS_RUN_CODES.menuInvalid });
    expect(caller.steps.at(-1)).toBe("START:merge");
  });

  it("no list: no menu", async () => {
    expect(await runBuiltMenu({ ...input(scripted({})), seats: [] })).toBeNull();
  });
});

describe("the runner's map caller on the start steps", () => {
  const BOUND = { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 1_260_000 };
  it("a run-built merge is held to the merge bound", () => {
    expect(mapStageBound(BOUND, "START_MERGE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(32_768);
    expect(mapStageBound(BOUND, "START_LIST", { merge: 32_768, choose: 16_384 })).toBe(BOUND);
  });

  it("a company's second seat (#2) is called as its member: the mark is stripped before the member is found or asked", async () => {
    const seen: ProviderCallRequest[] = [];
    const asked: string[] = [];
    const benched: string[] = [];
    const provider = { call: async (call: ProviderCallRequest) => { seen.push(call); return { content: JSON.stringify({ angles: [
      { angle_id: "a", kind: "GENERAL", label: "In general", focus: "All of it." }] }) } as never; } } as ProviderGateway;
    const deps: MapStageDeps = {
      runId: RUN, subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(), judgeBound: BOUND, longBounds: { merge: 32_768, choose: 32_768 },
      memberOf: (aiRef) => { asked.push(aiRef); return { provider, providerRef: aiRef }; },
      sitsOut: (aiRef) => { benched.push(aiRef); return false; }, satOutBy: () => false, spendStopOf: () => null, laneStopped: () => false,
      abandon: () => false, serial: false
    };
    const spec = mapAnglesSpec({ questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
      replyLanguage: replyLanguageExpectation("Should buses be free?") });
    await createRunnerMapCaller(deps).call({ step: "ANGLES", callSiteKey: "START:list:4", seat: seat(`pA${START_SEAT_REUSE_SUFFIX}`, "A"), order: 4,
      shown: "BLIND", spec: spec as never });
    expect(asked).toEqual(["pA"]);
    expect(benched).toEqual(["pA"]);
    expect(seen[0]).toMatchObject({ providerRef: "pA", callSiteKey: "START:list:4" });
  });
});

describe("a path debate's lineage disclosure (Task 53: the one-path debate)", () => {
  const root = Object.freeze({ nodeId: "node:path-b1", maker: "DeepSeek" });
  const base = { effectiveMakerCount: 4, runBodyBudgetStop: null, authoredMakerPositions: [root], servedRoot: root,
    monoMakerConditionMarks: [], monoMakerRecords: [] };
  it("one served root on a path debate, nothing stopped: no lineage mark; any other run is still refused as unreachable", async () => {
    const { buildMakerPositionDisclosure } = await import("../../apps/runner/src/index.js");
    expect(buildMakerPositionDisclosure({ ...base, pathsRun: true })).toEqual({ conditionMarks: [], records: [] });
    expect(() => buildMakerPositionDisclosure(base)).toThrow(expect.objectContaining({ code: "MAKER_POSITION_DISCLOSURE_UNRESOLVED" }));
  });
  it("a spend stop on a path debate is still disclosed as one lineage, naming the stop", async () => {
    const { buildMakerPositionDisclosure } = await import("../../apps/runner/src/index.js");
    const stopped = buildMakerPositionDisclosure({ ...base, pathsRun: true, runBodyBudgetStop: "ATTEMPTS" as const });
    expect(stopped.conditionMarks).toEqual(["SINGLE-LINEAGE"]);
  });
});

/**
 * Review of Task 53 (spec 2026-11-03 §4.4; Task 48's DIG mode): a dig of a path debate searches each of its paths as a dig does — its
 * planners are told what the debate's investigation already looked into, and the investigation's read pages are reused. The runner
 * hands the web step a path mode that carries neither (it never reads the dig); the step reads the dig itself, so it fills them in.
 */
describe("a dig of a path debate on the runner's web step", () => {
  const INVESTIGATED = "[\"Ferry queues at the north quay were already looked into.\"]";
  const planner = (packet: PromptPacket): string => {
    const chosen = readPromptFrame(packet).fields.find((entry) => entry.name === "chosen")?.content ?? "";
    const tag = /T(\d)/u.exec(chosen)?.[1] ?? "0";
    return JSON.stringify({ country: null, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: `ferry pier queues path ${tag}` }, { side: "against", local: false, query: `ferry riders fall path ${tag}` }] });
  };
  const run = async (origin: "START" | "DIG") => {
    const ais = team({ haiku: { planner } });
    const search = perplexity();
    const store = memoryStore();
    const asked: string[] = [];
    const reuse: WebReuseSource = { find: async (addresses) => { asked.push(...addresses); return new Map(); } };
    const base = stepInput({ members: membersOf(ais.all), search: search.port, prepare: store.prepare });
    const result = await runRunnerWebStep({
      ...base, pool: {} as never, lane: null,
      settings: { switchedOn: true, search: search.port, searchSubject: {} as never, searchSeamOf: null, readRunPlan: async () => "PLUS" },
      readers: { siteLanguage: async () => null,
        dig: async () => origin === "START" ? null : { picks: [{ pickNo: 1, text: "T1 pick" }, { pickNo: 2, text: "T2 pick" }],
          alreadyInvestigated: INVESTIGATED, mode: "quick", reuse } },
      stepPorts: { prepare: store.prepare, recordPlanPathStatuses: base.recordPlanPathStatuses },
      // As the runner sends it: the path mode carries no investigation of its own.
      pathsMode: { origin, cap: 8, alreadyInvestigated: "", reuse: null, purposeLines: null,
        paths: [1, 2].map((no) => ({ pathNo: no, pathRef: `b${String(no)}`, chosen: `Q${String(no)}?\nT${String(no)}` })) }
    });
    const planners = ais.haiku.bodies.filter((body) => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages })
      .contractId === WEB_DIG_PLANNER_V3_CONTRACT_ID);
    const told = planners.map((body) => readPromptFrame({ messages: (JSON.parse(body) as { messages: PromptPacket["messages"] }).messages })
      .fields.find((entry) => entry.name === "already_investigated")?.content);
    return { result, told, asked };
  };

  it("a dig: every path's planner reads what was already investigated, and the investigation's read pages are looked up", async () => {
    const { result, told, asked } = await run("DIG");
    expect(told).toEqual([INVESTIGATED, INVESTIGATED]);
    expect(asked.length).toBeGreaterThan(0);
    expect(result.paths.map((path) => path.pathRef)).toEqual(["b1", "b2"]);
  });

  it("a first path debate (no dig): nothing was investigated before, and nothing is reused", async () => {
    const { told, asked } = await run("START");
    expect(told).toEqual(["", ""]);
    expect(asked).toEqual([]);
  });
});
