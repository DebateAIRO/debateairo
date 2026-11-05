// tests/unit/paths-early-outcomes.test.ts
// V4 start step, Task 54 (spec 2026-11-03 §4.3, the owner's "First round" answer; items chat-first-round, journey-f1, wait-d1, map-d2):
// EACH PATH'S ANSWER SO FAR AS SOON AS ITS OWN CHECKS END. On a path run one chain per path runs beside the arguing: it waits for its
// own path's checks (Task 53's `pathChecksOver`), investigates that path's cannot-assess points, reads its points' trust words, writes
// its answer so far (Task 49's `runPathOutcomeFor` over a one-path job, `pathOutcomesJobFor`), stored at once, then one FOUND mark per
// point with a trust word. A chain never waits for another path, a failed path is FAILED for that path only, and a re-claimed run whose
// path already has its answer so far makes no call. The main answer (Task 50) is written once every chain has ended. Also: the
// investigations' share of the debate's cap per path, the first debate's suggestions keyed by path on a path run, and the story's
// paths input (Task 51). A scripted lane (fake timers) and scripted gateways; every name and text is made up.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PathGapRound, PathOutcome, TrustWord } from "@debateai/contract";
import type { StoredStartPathSet } from "@debateai/db";
import { readFile } from "node:fs/promises";
import { TypedDomainError, type PathId } from "@debateai/kernel";
import {
  PREVIEW_V2_FINAL_SEATS, ProviderContentUnacceptedError, type PromptPacket, type ProviderCallRequest, type ProviderCallResult, type ProviderGateway
} from "@debateai/providers";
import {
  pathCopyStops, pathFoundMarksOf, pathInvestigationShares, pathOutcomesJobFor, pathReviewFactsOf, pathRunInvestigationsOf, pathsFinalSeatsOf,
  runPathChains, runPathOutcomeFor, type PathChainSteps, type PathOutcomesJob, type PathOutcomesPath
} from "../../apps/runner/src/path-outcomes.js";
import {
  engineSettingsOf, engineVersionPolicyStartValues, parseEngineVersionPolicy, pathRunInvestigations, withPathDebateInvestigations,
  type DebateShapePlanKey
} from "@debateai/register";
import { engineNodeFactsOf } from "../../apps/runner/src/engine-links.js";
import type { PathRewritePoint, PathRewriteQuestion } from "../../apps/runner/src/path-rewrite-material.js";
import { runFirstDebateSuggestions } from "../../apps/runner/src/path-rewrite.js";
import { runPathsMainAnswer, type PathsDossierPath } from "../../apps/runner/src/paths-main-answer.js";
import { storyPathsInputOf } from "../../apps/runner/src/story-snapshot.js";
import { DIG_A, DIG_NODES, digSnapshot, membersOf, memoryStore as rewriteStore, settingsOver, team as rewriteTeam } from "../support/path-rewrite-world.js";

afterEach(() => { vi.useRealTimers(); });

/* ----------------------------------------------------------------- the world */

const RUN = "33333333-3333-4333-8333-333333333333";
const QUESTION: PathRewriteQuestion = Object.freeze({ line: "Should the town build a second ferry pier before next summer?", place: null, time: null,
  purpose: null, readingLevel: null, language: null });
const HAIKU = Object.freeze({ providerRef: "ref-haiku", model: PREVIEW_V2_FINAL_SEATS.writer, maker: "Anthropic" });
const GLM = Object.freeze({ providerRef: "ref-glm", model: PREVIEW_V2_FINAL_SEATS.checker, maker: "Z.AI" });
const PATH_IDS: readonly PathId[] = Object.freeze(["b1", "b2", "b3"] as PathId[]);

const point = (id: string, text: string, trust: TrustWord | null, over: Partial<PathRewritePoint> = {}): PathRewritePoint =>
  Object.freeze({ id, text, onId: null, side: "for" as const, trust, disputed: false, ...over });
function pathOf(pathId: PathId, over: Partial<PathOutcomesPath> = {}): PathOutcomesPath {
  const no = Number(pathId.slice(1));
  return Object.freeze({
    pathId, pathNo: no, title: `Path ${String(no)}`, question: `What does path ${String(no)} ask about the pier?`,
    statement: `Counting upkeep, path ${String(no)} finds the second pier costs more than it saves.`,
    viewpoints: [`Viewpoint ${String(no)}: what would it cost each year?`], ownWords: [], rootNodeId: `root-${String(no)}`,
    points: [point(`n${String(no)}-1`, `Queues at the pier run long at rush hour (${String(no)}).`, "SURE"),
      point(`n${String(no)}-2`, `Winter ridership falls by half (${String(no)}).`, null, { side: "against" }),
      point(`n${String(no)}-3`, `A bus line would carry the winter riders (${String(no)}).`, "STILL_ARGUED", { side: "against", disputed: true })],
    sources: [], ...over
  });
}

const written = (no: string): string => JSON.stringify({
  line: `Path ${no}: the second pier helps at rush hour, but not all year.`,
  summary: "The queues at rush hour are real, but winter ridership falls by half, so the pier earns its keep in the busy months only.",
  fate: "PARTLY_HELD", what_changed: [{ text: "The arguing showed that winter ridership falls by half.", rests_on: ["P1"] }], view: null
});
const SATISFIED = JSON.stringify({ satisfied: true, problem: null, part: null });
const ANSWER = JSON.stringify({ segments: [{ text: "Build the second pier for the summer months only; winter use stays low.", rests_on: ["A1"] }] });
const FAILED: PathOutcome = Object.freeze({ state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] }) as PathOutcome;

/** The gateway's first try and its one repair, each read by the request's own classifier; every call noted with the lane's clock. */
function scripted(answer: (request: ProviderCallRequest) => string, noted: string[]) {
  const requests: ProviderCallRequest[] = [];
  const gateway: ProviderGateway = {
    async call(request) {
      requests.push(request);
      noted.push(`${String(Date.now())} call ${request.callSiteKey}`);
      let packet: PromptPacket = request.vendorPacketOf === undefined ? request.packet : await request.vendorPacketOf(request.packet);
      for (let attempt = 1; ; attempt += 1) {
        void packet;
        const content = answer(request);
        const read = request.classifyContent?.(content, { finishReason: "stop" }) ?? { parseStatus: "PARSED" as const, parseError: null };
        if (read.parseStatus === "PARSED") {
          const seat = request.providerRef === HAIKU.providerRef ? HAIKU : GLM;
          return { rawArtifactRef: `raw:${request.callSiteKey}`, ledgerEntryRef: `ledger:${request.callSiteKey}`, content,
            provider: "openai-compatible-http", model: seat.model, maker: seat.maker, modelVersion: "test" } satisfies ProviderCallResult;
        }
        if (attempt >= 2) throw new ProviderContentUnacceptedError(attempt, read.parseStatus, read.parseError, "raw:refused", "ledger:refused");
        packet = request.buildRepairPacket!({ rawText: content, parseStatus: read.parseStatus, parseError: read.parseError });
      }
    }
  };
  return { gateway, requests };
}
/** Every step a writer, a checker or the main answer is asked: b2's answer-so-far writer only ever answers what no reader accepts. */
const replies = (failingWriter: string | null) => (request: ProviderCallRequest): string => {
  const key = request.callSiteKey;
  if (failingWriter !== null && key.startsWith(failingWriter)) return "not json at all";
  if (key.startsWith("PATH_OUTCOME:WRITER:")) return written(key.split(":")[2]!);
  if (key.startsWith("COMPOSER:")) return ANSWER;
  return SATISFIED;
};

function outcomeStore(initial: ReadonlyMap<PathId, PathOutcome>, noted: string[]) {
  const rows = new Map(initial);
  const store: PathOutcomesJob["store"] = {
    readPathOutcomes: async (runId) => { expect(runId).toBe(RUN); return new Map(rows); },
    recordPathOutcome: async (input) => {
      if (rows.has(input.pathId)) return "ALREADY" as const;
      rows.set(input.pathId, input.outcome);
      noted.push(`${String(Date.now())} stored ${input.pathId} ${input.outcome.state}`);
      return "RECORDED" as const;
    }
  };
  return { rows, store };
}

/** One chain's steps as the runner gives them, its checks over after `checksMs`; investigations, marks and FAILED records noted. */
function chainWorld(input: Readonly<{ checksMs: Readonly<Record<string, number>>; failingWriter?: string | null;
  stored?: ReadonlyMap<PathId, PathOutcome>; investigate?: (pathId: PathId) => Promise<void> }>) {
  const noted: string[] = [];
  const marks: string[] = [];
  const { rows, store } = outcomeStore(input.stored ?? new Map(), noted);
  const lane = scripted(replies(input.failingWriter ?? null), noted);
  const base: Omit<PathOutcomesJob, "paths"> = Object.freeze({
    runId: RUN, free: false, question: QUESTION, readingLevel: null, language: Object.freeze({ name: "English", tag: "en" }),
    seats: pathsFinalSeatsOf([HAIKU, GLM])!, gateway: lane.gateway, store, tokenCount: undefined, log: () => undefined
  });
  const stepsOf = (pathId: PathId): PathChainSteps => Object.freeze({
    checksOver: () => new Promise<void>((resolve) => {
      setTimeout(() => { noted.push(`${String(Date.now())} checks ${pathId}`); resolve(); }, input.checksMs[pathId]!);
    }),
    stored: async () => (await store.readPathOutcomes(RUN)).get(pathId) ?? null,
    investigate: async () => {
      noted.push(`${String(Date.now())} investigate ${pathId}`);
      await input.investigate?.(pathId);
    },
    pathOf: async () => pathOf(pathId),
    outcomeOf: (path) => runPathOutcomeFor(pathOutcomesJobFor({ base, path }), pathId),
    found: (foundPath, nodeId, trust) => { marks.push(`${foundPath} ${nodeId} ${trust}`); },
    failed: async () => {
      noted.push(`${String(Date.now())} failed ${pathId}`);
      return await store.recordPathOutcome({ runId: RUN, pathId, outcome: FAILED }) === "ALREADY" ? rows.get(pathId)! : FAILED;
    },
    endsRun: (error) => error instanceof Error && error.message === "LOST_CLAIM",
    log: () => undefined
  });
  return { noted, marks, rows, lane, base, stepsOf };
}

/** Lets every promise callback and real `setImmediate` turn run (fake timers fake `setTimeout` and `Date` only). */
const drain = async (): Promise<void> => { for (let turn = 0; turn < 50; turn += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };
const at = (noted: readonly string[], text: string): number => noted.findIndex((line) => line.endsWith(text));
const timeOf = (noted: readonly string[], text: string): number => Number(noted[at(noted, text)]?.split(" ")[0]);

/* ----------------------------------------------------------------- the one-path job */

describe("pathOutcomesJobFor", () => {
  it("a one-path job: the base's every member, and only that path", () => {
    const world = chainWorld({ checksMs: {} });
    const job = pathOutcomesJobFor({ base: world.base, path: pathOf("b2") });
    expect(job.paths.map((path) => path.pathId)).toEqual(["b2"]);
    const { paths: _paths, ...rest } = job;
    expect(rest).toEqual(world.base);
    expect(Object.isFrozen(job)).toBe(true);
  });
});

/* ----------------------------------------------------------------- the chains */

describe("each path's answer so far as soon as its own checks end (Task 54)", () => {
  it("checks over at 10 s, 20 s and 60 s: each outcome call right after its own checks; b2's writer fails, b1 and b3 READY; the main answer after the third is stored", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"], now: 0 });
    const world = chainWorld({ checksMs: { b1: 10_000, b2: 20_000, b3: 60_000 }, failingWriter: "PATH_OUTCOME:WRITER:2:" });
    let ended = false;
    const chains = runPathChains(PATH_IDS, world.stepsOf).then((outcomes) => { ended = true; return outcomes; });
    await vi.advanceTimersByTimeAsync(10_000);
    await drain();
    // b1 is filled in at 10 s: it waits for no other path.
    expect(world.noted).toEqual(["10000 checks b1", "10000 investigate b1", "10000 call PATH_OUTCOME:WRITER:1:1", "10000 call PATH_OUTCOME:CHECKER:1:1",
      "10000 stored b1 READY"]);
    await vi.advanceTimersByTimeAsync(10_000);
    await drain();
    expect(world.noted.slice(5)).toEqual(["20000 checks b2", "20000 investigate b2", "20000 call PATH_OUTCOME:WRITER:2:1", "20000 stored b2 FAILED"]);
    await vi.advanceTimersByTimeAsync(39_999);
    await drain();
    expect(ended).toBe(false);
    expect(world.noted).toHaveLength(9);
    await vi.advanceTimersByTimeAsync(1);
    await drain();
    const outcomes = await chains;
    expect(world.noted.slice(9)).toEqual(["60000 checks b3", "60000 investigate b3", "60000 call PATH_OUTCOME:WRITER:3:1", "60000 call PATH_OUTCOME:CHECKER:3:1",
      "60000 stored b3 READY"]);
    // Each outcome call starts right after its own path's checks, in the order the checks ended.
    for (const pathNo of [1, 2, 3]) {
      expect(timeOf(world.noted, `call PATH_OUTCOME:WRITER:${String(pathNo)}:1`)).toBe(timeOf(world.noted, `checks b${String(pathNo)}`));
      expect(at(world.noted, `call PATH_OUTCOME:WRITER:${String(pathNo)}:1`)).toBeGreaterThan(at(world.noted, `checks b${String(pathNo)}`));
    }
    expect([...outcomes.keys()]).toEqual(["b1", "b2", "b3"]);
    expect([...outcomes.values()].map((outcome) => outcome.state)).toEqual(["READY", "FAILED", "READY"]);
    expect([...world.rows.values()].map((outcome) => outcome.state)).toEqual(["READY", "FAILED", "READY"]);
    // Every point with a trust word has its FOUND mark, the FAILED path's too; a point without a word has none.
    expect(world.marks).toEqual(["b1 n1-1 SURE", "b1 n1-3 STILL_ARGUED", "b2 n2-1 SURE", "b2 n2-3 STILL_ARGUED", "b3 n3-1 SURE", "b3 n3-3 STILL_ARGUED"]);
    // The main answer, once every chain has ended: its first call comes after the third outcome is stored, and it still runs with b2 FAILED.
    const paths: PathsDossierPath[] = PATH_IDS.map((pathId) => {
      const path = pathOf(pathId);
      return { pathId, rootNodeId: path.rootNodeId, title: path.title, question: path.question, ownWords: [], outcome: outcomes.get(pathId) ?? null,
        points: path.points, sources: [] };
    });
    const main = await runPathsMainAnswer({ runId: RUN, free: false, answerWords: 300, question: QUESTION, paths, seats: world.base.seats,
      gateway: world.base.gateway, tokenCount: undefined, log: () => undefined });
    expect(main.written.outcome.outcome).toBe("READY");
    expect(main.segments.map((segment) => segment.assertedNodeRefs)).toEqual([["root-1"]]);
    expect(at(world.noted, "call COMPOSER:SYNTHESIZER:INITIAL:1")).toBeGreaterThan(at(world.noted, "stored b3 READY"));
  });

  it("a re-claimed run: a path whose answer so far is stored makes no investigation and no call, and writes its FOUND marks again", async () => {
    const stored: PathOutcome = Object.freeze({ state: "READY", text: { line: "Stored before the copy stopped.", summary: "It was stored.", fate: "HELD_UP" },
      what_changed: ["It held."], view: null, trust: "SURE", rests_on: [] }) as PathOutcome;
    const world = chainWorld({ checksMs: { b1: 0, b2: 0, b3: 0 }, stored: new Map([["b1" as PathId, stored]]) });
    const outcomes = await runPathChains(PATH_IDS, world.stepsOf);
    expect(outcomes.get("b1" as PathId)).toEqual(stored);
    expect(world.lane.requests.map((request) => request.callSiteKey).filter((key) => key.includes(":1:"))).toEqual([]);
    expect(world.noted.filter((line) => line.endsWith("investigate b1"))).toEqual([]);
    expect(world.marks.filter((mark) => mark.startsWith("b1 "))).toEqual(["b1 n1-1 SURE", "b1 n1-3 STILL_ARGUED"]);
    expect([...outcomes.values()].map((outcome) => outcome.state)).toEqual(["READY", "READY", "READY"]);
  });

  it("a step that fails costs that path only (FAILED stored for it); an error that ends the run rejects, and stores nothing for it", async () => {
    const world = chainWorld({ checksMs: { b1: 0, b2: 0, b3: 0 },
      investigate: async (pathId) => { if (pathId === "b2") throw new Error("INVESTIGATION_BROKE"); } });
    const outcomes = await runPathChains(PATH_IDS, world.stepsOf);
    expect([...outcomes.values()].map((outcome) => outcome.state)).toEqual(["READY", "FAILED", "READY"]);
    expect(world.noted.filter((line) => line.includes("failed")).map((line) => line.split(" ").slice(1).join(" "))).toEqual(["failed b2"]);
    expect(world.lane.requests.map((request) => request.callSiteKey).filter((key) => key.includes(":2:"))).toEqual([]);

    const lost = chainWorld({ checksMs: { b1: 0, b2: 0, b3: 0 },
      investigate: async (pathId) => { if (pathId === "b3") throw new Error("LOST_CLAIM"); } });
    await expect(runPathChains(PATH_IDS, lost.stepsOf)).rejects.toThrow("LOST_CLAIM");
    expect(lost.noted.filter((line) => line.includes("failed"))).toEqual([]);
    expect(lost.rows.has("b3" as PathId)).toBe(false);
  });

  it("a chain whose checks never end because the run failed rejects, and nothing is stored for it", async () => {
    const world = chainWorld({ checksMs: { b1: 0, b2: 0, b3: 0 } });
    const steps = (pathId: PathId): PathChainSteps => pathId === "b2"
      ? { ...world.stepsOf(pathId), checksOver: async () => { throw new Error("LOST_CLAIM"); } } : world.stepsOf(pathId);
    await expect(runPathChains(PATH_IDS, steps)).rejects.toThrow("LOST_CLAIM");
    expect(world.rows.has("b2" as PathId)).toBe(false);
  });

  it("the FOUND marks: one per point with a trust word, in the path's order", () => {
    expect(pathFoundMarksOf(pathOf("b2"))).toEqual([{ nodeId: "n2-1", trust: "SURE" }, { nodeId: "n2-3", trust: "STILL_ARGUED" }]);
    expect(pathFoundMarksOf(pathOf("b2", { points: [] }))).toEqual([]);
  });
});

/* ----------------------------------------------------------------- a stop that ends this copy (review of Task 54) */

/**
 * Review of Task 54 (important): the writer's and checker's loop (`runStoryLoop`) reads EVERY failed call as a failed round. So a call
 * refused because this copy of the run must stop (its claim taken, its time up, its release retiring, its lane stopped) ended FAILED
 * and was stored, and the copy that takes the run on read that FAILED back and never wrote the path; the main answer's fallback was
 * served by a copy that had lost the run. `pathCopyStops` keeps such a stop: it is thrown, and nothing more is stored after it, as the
 * runner's other steps let it leave as it came (`endsThisCopy`, `pointInvestigationFailureOutcome`).
 */
describe("a stop that ends this copy, met inside a path's or the main answer's calls (review of Task 54)", () => {
  const COPY_ENDS: ReadonlySet<string> = new Set(["RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED", "RUNNER_RETIRING", "CALL_LANE_STOPPED"]);
  const endsCopy = (error: unknown): boolean => error instanceof TypedDomainError && COPY_ENDS.has(error.code);
  /** The chains' world, its gateway refusing every call whose key starts with `refused`, with `error`. */
  const refusing = (refused: string, error: Error) => {
    const world = chainWorld({ checksMs: { b1: 0, b2: 0, b3: 0 } });
    const gateway: ProviderGateway = {
      call: (request) => request.callSiteKey.startsWith(refused) ? Promise.reject(error) : world.lane.gateway.call(request)
    };
    return { world, gateway };
  };
  /** The runner's chain steps over the guarded gateway and store. */
  const guardedSteps = (world: ReturnType<typeof chainWorld>, stops: ReturnType<typeof pathCopyStops>) => {
    const base: Omit<PathOutcomesJob, "paths"> = Object.freeze({ ...world.base, gateway: stops.gateway, store: stops.store });
    return (pathId: PathId): PathChainSteps => Object.freeze({ ...world.stepsOf(pathId),
      outcomeOf: (path: PathOutcomesPath) => runPathOutcomeFor(pathOutcomesJobFor({ base, path }), pathId),
      failed: async () => {
        world.noted.push(`${String(Date.now())} failed ${pathId}`);
        await stops.store.recordPathOutcome({ runId: RUN, pathId, outcome: FAILED });
        return FAILED;
      },
      endsRun: endsCopy });
  };

  it("what the review found: with no guard, a lost claim inside b2's writer call is stored as b2's FAILED", async () => {
    const { world, gateway } = refusing("PATH_OUTCOME:WRITER:2:", new TypedDomainError("RUNNER_CLAIM_LOST", "Another copy holds the work item"));
    const outcome = await runPathOutcomeFor(pathOutcomesJobFor({ base: { ...world.base, gateway }, path: pathOf("b2") }), "b2" as PathId);
    expect(outcome.state).toBe("FAILED");
    expect(world.rows.get("b2" as PathId)?.state).toBe("FAILED");
  });

  for (const code of ["RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED", "RUNNER_RETIRING", "CALL_LANE_STOPPED"]) {
    it(`${code} inside b2's writer call: the chains reject with it, nothing is stored for b2 and nothing after it`, async () => {
      const stop = new TypedDomainError(code, "This copy makes no further call");
      const { world, gateway } = refusing("PATH_OUTCOME:WRITER:2:", stop);
      const stops = pathCopyStops(gateway, world.base.store, endsCopy);
      expect(stops.stopped()).toBeNull();
      await expect(runPathChains(PATH_IDS, guardedSteps(world, stops))).rejects.toBe(stop);
      expect(world.rows.has("b2" as PathId)).toBe(false);
      expect(world.noted.filter((line) => line.includes("failed"))).toEqual([]);
      expect(stops.stopped()).toEqual({ error: stop });
      await expect(stops.store.recordPathOutcome({ runId: RUN, pathId: "b3" as PathId, outcome: FAILED })).rejects.toBe(stop);
      expect(() => { stops.throwIfStopped(); }).toThrow(stop);
    });
  }

  it("any other failed call is still that path's FAILED, stored, and the other paths go on (Task 49's rule)", async () => {
    const { world, gateway } = refusing("PATH_OUTCOME:WRITER:2:", new Error("socket hang up"));
    const stops = pathCopyStops(gateway, world.base.store, endsCopy);
    const outcomes = await runPathChains(PATH_IDS, guardedSteps(world, stops));
    expect([...outcomes.values()].map((outcome) => outcome.state)).toEqual(["READY", "FAILED", "READY"]);
    expect(world.rows.get("b2" as PathId)?.state).toBe("FAILED");
    expect(stops.stopped()).toBeNull();
    expect(() => { stops.throwIfStopped(); }).not.toThrow();
  });

  it("the main answer: a time limit inside its writer call ends FAILED in the writer's loop, and the guard keeps it to be thrown", async () => {
    const stop = new TypedDomainError("RUNNER_TIME_LIMIT_REACHED", "The debate reached its time limit");
    const { world, gateway } = refusing("COMPOSER:", stop);
    const stops = pathCopyStops(gateway, world.base.store, endsCopy);
    const paths: PathsDossierPath[] = PATH_IDS.map((pathId) => {
      const path = pathOf(pathId);
      return { pathId, rootNodeId: path.rootNodeId, title: path.title, question: path.question, ownWords: [], outcome: null, points: path.points, sources: [] };
    });
    const main = await runPathsMainAnswer({ runId: RUN, free: false, answerWords: 300, question: QUESTION, paths, seats: world.base.seats,
      gateway: stops.gateway, tokenCount: undefined, log: () => undefined });
    expect(main.written.outcome.outcome).toBe("FAILED");
    expect(stops.stopped()).toEqual({ error: stop });
    expect(() => { stops.throwIfStopped(); }).toThrow(stop);
  });

  it("the runner keeps the stops of every path's and the main answer's calls, and handles a chain that rejects from the start", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toContain("const pathsStops = pathCopyStops(");
    expect(source).toContain("}), settings.pathResults!, (error) => endsThisCopy(error) || keepAliveStop(error));");
    expect(source).toContain("const pathsGateway: ProviderGateway = pathsStops.gateway;");
    expect(source).toContain("seats: pathsFinalSeats, gateway: pathsGateway, store: pathsStops.store,");
    expect(source).toContain("const recorded = await pathsStops.store.recordPathOutcome({ runId: run.runId, pathId, outcome: PATH_OUTCOME_FAILED });");
    expect(source).toContain("pathsStops.throwIfStopped();");
    expect(source).toContain("void pathChains?.catch(() => undefined);");
    expect(source.match(/settings\.pathResults!\.recordPathOutcome\(/gu)).toBeNull();
  });
});

/* ----------------------------------------------------------------- a path's own review facts (review of Task 54) */

/**
 * Review of Task 54 (important, seen in the reserve case of tests/integration/v2-paths-run.test.ts: b3's chain FAILED with
 * ENGINE_FACTS_INVALID): a path's chain reads the run's three review lists one after another while other paths still record their
 * reviews, so a dispute recorded between two reads is "disputed but not reviewed". The brief's rule, "facts from engineNodeFactsOf
 * restricted to its nodes": every review of the path's own nodes is recorded before its chain reads them, so those lists agree.
 */
describe("a path's review facts are its own nodes' (review of Task 54)", () => {
  const OWN = new Set(["root-1", "n1-1", "n1-2", "n1-3"]);
  // Read in the chain's order while b2 records its reviews: b2's n2-9 was disputed after `reviewed` was read, before `disputed` was.
  const raced = Object.freeze({ reviewedNodeIds: ["root-1", "n1-1", "n1-2", "n2-1"], disputedNodeIds: ["n1-2", "n2-9"],
    cannotAssessNodeIds: ["n1-3", "n2-2"] });

  it("the run's lists read mid-run disagree (what the chain met); the path's own lists agree, and keep every fact of its own", () => {
    expect(() => engineNodeFactsOf({ ...raced, ownReplyEdgeIds: new Map() })).toThrow(/disputed but not reviewed/u);
    const own = pathReviewFactsOf(raced, OWN);
    expect(own).toEqual({ reviewedNodeIds: ["root-1", "n1-1", "n1-2"], disputedNodeIds: ["n1-2"], cannotAssessNodeIds: ["n1-3"] });
    const facts = engineNodeFactsOf({ ...own, ownReplyEdgeIds: new Map() });
    expect([...facts.values()].map((fact) => [fact.nodeId, fact.status, fact.cannotAssessReview])).toEqual([
      ["root-1", "AGREE", false], ["n1-1", "AGREE", false], ["n1-2", "DISPUTE", false], ["n1-3", "CANNOT_ASSESS", true]]);
  });

  it("the runner's chain reads its facts through it, over its own nodes", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const start = source.indexOf("investigate: async () => {");
    const step = source.slice(start, source.indexOf("pathOf: async () => {", start));
    expect(start).toBeGreaterThan(0);
    expect(step).toContain("const ownNodeIds = new Set(pathNodesOf(rootIndex).map((node) => node.nodeId));");
    expect(step).toContain("...pathReviewFactsOf({");
    expect(step).toContain("}, ownNodeIds),");
    expect(step).toContain("rootIds: new Set([root.nodeId]), ownNodeIds,");
  });
});

/* ----------------------------------------------------------------- the investigations' share */

describe("pathInvestigationShares: the debate's investigation cap, shared by path in the person's order", () => {
  it("each path its share, the earlier paths the remainder, the keys numbered on from the earlier paths'", () => {
    expect(pathInvestigationShares(2, 3)).toEqual([{ first: 0, slots: 1 }, { first: 1, slots: 1 }, { first: 2, slots: 0 }]);
    expect(pathInvestigationShares(5, 3)).toEqual([{ first: 0, slots: 2 }, { first: 2, slots: 2 }, { first: 4, slots: 1 }]);
    expect(pathInvestigationShares(0, 2)).toEqual([{ first: 0, slots: 0 }, { first: 0, slots: 0 }]);
    expect(pathInvestigationShares(3, 1)).toEqual([{ first: 0, slots: 3 }]);
    expect(pathInvestigationShares(4, 0)).toEqual([]);
  });
});

describe("Task 54e (the owner's answer of 5 Nov, \"One per path\"): every path of a paid path debate holds at least one investigation", () => {
  const START = engineVersionPolicyStartValues();
  /** A receipt's engine as the ceiling mints it: the row's cap, its investigation sites for this debate (`withPathDebateInvestigations`). */
  const engineOf = (cap: number, pathDebate: Readonly<{ plan: DebateShapePlanKey; paths: number }> | null) => withPathDebateInvestigations(
    engineSettingsOf(parseEngineVersionPolicy({ ...START, investigate: { maxPerDebate: cap } }), { makers: 4, mapOpening: false }), pathDebate);
  const slotsOf = (shares: readonly Readonly<{ first: number; slots: number }>[]) => shares.map((share) => share.slots);

  it("max(cap, paths), shared as before: cap 2 gives 3 paths 1 + 1 + 1, 1 path 2, 7 paths one each; a cap of 0 stays 0", () => {
    expect(pathInvestigationShares(pathRunInvestigations(2, 3), 3)).toEqual([{ first: 0, slots: 1 }, { first: 1, slots: 1 }, { first: 2, slots: 1 }]);
    expect(pathInvestigationShares(pathRunInvestigations(2, 1), 1)).toEqual([{ first: 0, slots: 2 }]);
    expect(pathInvestigationShares(pathRunInvestigations(2, 2), 2)).toEqual([{ first: 0, slots: 1 }, { first: 1, slots: 1 }]);
    expect(pathInvestigationShares(pathRunInvestigations(0, 3), 3)).toEqual([{ first: 0, slots: 0 }, { first: 0, slots: 0 }, { first: 0, slots: 0 }]);
    // One numbering per debate: the seven paths take VERDICT:investigate:1 to :7 in the person's order.
    expect(pathInvestigationShares(pathRunInvestigations(2, 7), 7).map((share) => share.first)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(slotsOf(pathInvestigationShares(pathRunInvestigations(2, 7), 7))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // A cap above the paths is kept whole.
    expect(slotsOf(pathInvestigationShares(pathRunInvestigations(5, 3), 3))).toEqual([2, 2, 1]);
  });

  it("a run shares what its receipt priced for its own paths: paid 3 paths 3, Free the cap, a smaller set its own count, never above the receipt", () => {
    expect(pathRunInvestigationsOf(engineOf(2, { plan: "plus", paths: 3 }), 3)).toBe(3);
    expect(slotsOf(pathInvestigationShares(pathRunInvestigationsOf(engineOf(2, { plan: "plus", paths: 3 }), 3), 3))).toEqual([1, 1, 1]);
    expect(pathRunInvestigationsOf(engineOf(2, { plan: "max", paths: 7 }), 7)).toBe(7);
    // Free keeps the debate's cap (its receipt prices the cap): 1 + 1 + 0, as before.
    expect(slotsOf(pathInvestigationShares(pathRunInvestigationsOf(engineOf(2, { plan: "free", paths: 3 }), 3), 3))).toEqual([1, 1, 0]);
    // A run that built fewer paths than its receipt priced (the AIs found 3 of 5): one per path, no more.
    expect(pathRunInvestigationsOf(engineOf(2, { plan: "plus", paths: 5 }), 3)).toBe(3);
    // A receipt that priced the cap alone is never exceeded.
    expect(pathRunInvestigationsOf(engineOf(2, null), 3)).toBe(2);
    expect(pathRunInvestigationsOf(engineOf(0, { plan: "plus", paths: 3 }), 3)).toBe(0);
  });

  it("the runner's chains share them so", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source).toContain("pathInvestigationShares(engine.engine === 2 ? pathRunInvestigationsOf(engine, pathsRunPaths.length) : 0, pathsRunPaths.length)");
  });
});

/* ----------------------------------------------------------------- the first debate's suggestions on a path run */

describe("a path run's suggestions are keyed by its paths (Task 54)", () => {
  it("each path b<n> from its root (`pathRewriteDigPathsOfRoots` over the path roots), one call per path with points; R22 unchanged", async () => {
    const recorded: string[] = [];
    const store = { positionsOf: async () => new Set<string>(), record: async (input: { positionRef: string }) => { recorded.push(input.positionRef); return "RECORDED"; } };
    const suggest = JSON.stringify({ suggestions: [{ side: "for", question: "Would a count of winter crossings settle it?",
      why: "It would show how many ride in winter.", rests_on: ["f1"] }] });
    const vendors = rewriteTeam({ haiku: () => suggest });
    const settings = settingsOver({ store: rewriteStore(), digs: new Map(),
      extra: { firstDebateSuggestions: { store, read: async () => ({ free: false, wouldChangeIt: null }) } } });
    await runFirstDebateSuggestions(settings, digSnapshot(DIG_A, membersOf(vendors)),
      [{ ref: "b1", rootNodeId: DIG_NODES.no }, { ref: "b2", rootNodeId: DIG_NODES.yes }]);
    expect(recorded.sort()).toEqual(["b1", "b2"]);
    // R22 (no path roots): the paths are keyed by their root node ids, as before.
    const r22: string[] = [];
    const r22Store = { positionsOf: async () => new Set<string>(), record: async (input: { positionRef: string }) => { r22.push(input.positionRef); return "RECORDED"; } };
    await runFirstDebateSuggestions(settingsOver({ store: rewriteStore(), digs: new Map(),
      extra: { firstDebateSuggestions: { store: r22Store, read: async () => ({ free: false, wouldChangeIt: null }) } } }),
    digSnapshot(DIG_A, membersOf(rewriteTeam({ haiku: () => suggest }))));
    expect(r22.sort()).toEqual([DIG_NODES.no, DIG_NODES.yes].sort());
    // Free: none, on a path run too.
    const free: string[] = [];
    const freeStore = { positionsOf: async () => new Set<string>(), record: async (input: { positionRef: string }) => { free.push(input.positionRef); return "RECORDED"; } };
    await runFirstDebateSuggestions(settingsOver({ store: rewriteStore(), digs: new Map(),
      extra: { firstDebateSuggestions: { store: freeStore, read: async () => ({ free: true, wouldChangeIt: null }) } } }),
    digSnapshot(DIG_A, membersOf(rewriteTeam({ haiku: () => suggest }))), [{ ref: "b1", rootNodeId: DIG_NODES.no }]);
    expect(free).toEqual([]);
  });
});

/* ----------------------------------------------------------------- the story's paths */

describe("storyPathsInputOf: a path run's story input (Task 51's StoryPathsInput)", () => {
  it("the paths in the person's order with their answers so far, the main answer's segments and trust, and the gap round's untagged points", () => {
    const set: StoredStartPathSet = Object.freeze({ runId: RUN, source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, menu: null,
      paths: [3, 1, 2].map((no) => Object.freeze({ pathId: `b${String(no)}` as PathId, pathNo: no, author: no === 2 ? "PERSON_EDITED" as const : "AI_SUGGESTION" as const,
        title: `Path ${String(no)}`, question: `Q${String(no)}?`, viewpoints: [], ownWords: no === 2 ? ["I think tourists fill the ferries."] : [] })) });
    const ready: PathOutcome = Object.freeze({ state: "READY", text: { line: "It held.", summary: "It held up.", fate: "HELD_UP" }, what_changed: ["It held."],
      view: null, trust: "SURE", rests_on: [] }) as PathOutcome;
    const gap: PathGapRound = { points: [{ text: "Nobody asked about the bus line.", path_id: null }, { text: "Winter ferries.", path_id: "b1" as PathId },
      { text: "Who pays for upkeep?", path_id: null }] };
    const input = storyPathsInputOf({ set, outcomes: new Map([["b1" as PathId, ready], ["b2" as PathId, FAILED]]),
      mainAnswer: ["Build it for summer.", "Winter use stays low."], mainTrust: "SURE_FOR_CASE", gap });
    expect(input.paths.map((path) => [path.pathId, path.author, path.ownWords, path.outcome?.state ?? null])).toEqual([
      ["b1", "AI_SUGGESTION", [], "READY"], ["b2", "PERSON_EDITED", ["I think tourists fill the ferries."], "FAILED"], ["b3", "AI_SUGGESTION", [], null]]);
    expect(input.mainAnswer).toEqual(["Build it for summer.", "Winter use stays low."]);
    expect(input.mainTrust).toBe("SURE_FOR_CASE");
    expect(input.alsoRaised).toEqual(["Nobody asked about the bus line.", "Who pays for upkeep?"]);
    expect(storyPathsInputOf({ set, outcomes: new Map(), mainAnswer: [], mainTrust: null, gap: null }).alsoRaised).toEqual([]);
  });
});
