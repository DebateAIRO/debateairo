import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type Answer, type DebateMapView } from "@debateai/contract";
import type { RunOwnershipAccess } from "@debateai/db";
import { mapAnswersArgued } from "@debateai/map";
import {
  NO_MAP_VIEWS, RepositoryAnswerMapViewApplication, answerNodeIds, debateMapViewFrom, runOwnerCheckFrom,
  type AnswerMapViewApplication, type MapRunFindInput, type MapViewReadInput, type MapViewReader, type MapViewSource, type RunOwnerCheck
} from "../../apps/api/src/map-views.js";
import { readPublishableMapView } from "../../apps/api/src/publications.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_RUN_ID } from "../support/storyApiFixtures.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): the owner's read of the map view,
 * GET /v1/answers/{id}/map, and the copy a publication takes. As with the disclosure route,
 * the answer read is the first ownership check, and "not yours", "no map" and "malformed" are
 * one closed 404. The application checks again (core.run_is_owned_by) before it reads the map.
 * Controller ruling C-ROOTS: a position's title lands on the node the MAP recorded for it
 * (P2b's core.map_position, carried as `rootNodeId` by readMapChoiceForRun), never on a node
 * inferred from the edge graph. The answer's own UUID node ids are only a sanity check: a
 * recorded node the answer does not hold is dropped, so a title never names a node the page
 * cannot show.
 */

const OWNER = testHttpIdentity("map-view-owner");
const HEADERS = testSessionHeaders(OWNER);
const URL_OF = `/v1/answers/${STORY_TEST_ANSWER_ID}/map`;
/** What the route and the publication pass for this signed-in caller (pre-flight PF-C16). */
const OWNERSHIP: RunOwnershipAccess = Object.freeze({ ownerRef: OWNER.authenticated.ownerRef, legacyAskerId: null });
/** An owner check that always says yes, for the tests about the view's content. */
const OWNED: RunOwnerCheck = Object.freeze({ owns: async () => true, ownedRunOfAnswer: async () => STORY_TEST_RUN_ID });

/** Two opening positions, the second of which replies to the first, and one reply that attacks the first. */
const ROOT_A = "a0000000-0000-4000-8000-00000000000a";
const ROOT_B = "b0000000-0000-4000-8000-00000000000b";
const REPLY = "c0000000-0000-4000-8000-00000000000c";

function answerOf(): Answer {
  const base = buildFairShapedAnswer();
  const [position, defeater] = base.nodes;
  return buildFairShapedAnswer({
    answer_id: STORY_TEST_ANSWER_ID,
    run_ref: STORY_TEST_RUN_ID,
    relevant_as_of: "2026-10-12T10:00:00.000Z",
    nodes: [
      { ...position!, node_id: ROOT_A, defeater_refs: [REPLY] },
      { ...position!, node_id: ROOT_B, claim: "The second position.", defeater_refs: [] },
      { ...defeater!, node_id: REPLY }
    ],
    edges: [
      { ...base.edges[0]!, from_node_ref: REPLY, target_ref: ROOT_A },
      { ...base.edges[0]!, edge_id: "edge:attack:2", from_node_ref: ROOT_B, target_ref: ROOT_A }
    ]
  });
}

function application(answer: Answer | null, reads: unknown[] = []): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async (answerId, _session, version, ownership) => {
      reads.push({ answerId, version, ownership });
      return answer;
    },
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

/** A view reader whose cheap pre-check (ruling C-MAPREAD) finds the answer's run, unless `located` says otherwise. */
function views(
  view: DebateMapView | null,
  calls: MapViewReadInput[] = [],
  located: string | null = STORY_TEST_RUN_ID,
  finds: MapRunFindInput[] = []
): AnswerMapViewApplication {
  return {
    findMapRun: async (input) => {
      finds.push(input);
      return located;
    },
    readMapView: async (input) => {
      calls.push(input);
      return view;
    }
  };
}

/** A map choice reader that records every call: the cheap opening lookup and the leased choice read apart. */
function recordingReader(opening: "MAP" | "TODAYS_OPENING" | null, record: MapViewSource | null, log: string[]) {
  return {
    readMapOpeningForRun: async (runId: string) => {
      log.push(`opening:${runId}`);
      return opening;
    },
    readMapChoiceForRun: async (runId: string) => {
      log.push(`choice:${runId}`);
      return record;
    }
  };
}

/** An owner check that records every call, and owns `runOfAnswer`'s run only when `owned`. */
function recordingOwner(owned: boolean, log: string[]): RunOwnerCheck {
  return {
    owns: async (runId) => {
      log.push(`owns:${runId}`);
      return owned;
    },
    ownedRunOfAnswer: async (answerId) => {
      log.push(`owner:${answerId}`);
      return owned ? STORY_TEST_RUN_ID : null;
    }
  };
}

function api(input: { answer: Answer | null; mapViews?: AnswerMapViewApplication; reads?: unknown[] }) {
  return buildApi({
    application: application(input.answer, input.reads),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.mapViews === undefined ? {} : { mapViews: input.mapViews })
  });
}

afterEach(() => vi.restoreAllMocks());

describe("debate shape P2c — the map view from P2b's map choice", () => {
  const answer = answerOf();
  const roots = answerNodeIds(answer);

  it("checks recorded nodes against every UUID node the answer holds, whatever its edges", () => {
    // The edge graph decides nothing: ROOT_B replies to ROOT_A and is still a candidate.
    expect([...roots].sort()).toEqual([ROOT_A, ROOT_B, REPLY]);
    const odd = buildFairShapedAnswer({
      nodes: [{ ...answer.nodes[0]!, node_id: "node:not-a-uuid", defeater_refs: [] }, answer.nodes[1]!, { ...answer.nodes[2]!, node_id: REPLY }],
      edges: [{ ...answer.edges[0]!, from_node_ref: REPLY, target_kind: "EDGE", target_ref: "edge:attack:other" }]
    });
    // A non-UUID node is never a candidate (P2b records only UUID nodes).
    expect([...answerNodeIds(odd)].sort()).toEqual([ROOT_B, REPLY]);
  });

  it("titles the nodes the map recorded, even one that replies to another position; drops one not in the answer, none, a repeat or no UUID", () => {
    const record: MapViewSource = {
      answers: [
        { statement: "  Move gradually.  ", rootNodeId: ROOT_A },
        { statement: "Stay where you are.", rootNodeId: "d0000000-0000-4000-8000-00000000000d" },
        { statement: "A second answer on the same node.", rootNodeId: ROOT_A },
        { statement: "No position argued this.", rootNodeId: null },
        { statement: "Move now.", rootNodeId: ROOT_B }
      ],
      alsoRaised: []
    };
    expect(answer.edges.some((edge) => edge.from_node_ref === ROOT_B)).toBe(true);
    expect(debateMapViewFrom(record, roots).positions).toEqual([
      { node_id: ROOT_A, answer: "Move gradually." },
      { node_id: ROOT_B, answer: "Move now." }
    ]);
    // Even a caller's set that holds a non-UUID id never makes it a position's node.
    expect(debateMapViewFrom({ answers: [{ statement: "Odd.", rootNodeId: "node:position" }], alsoRaised: [] },
      new Set(["node:position"])).positions).toEqual([]);
  });

  it("lists the also-raised claims most-raised first, once each, without who or how many", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }],
      alsoRaised: [
        { claim: "Raised once.", makers: ["OpenAI"] },
        { claim: "Raised by three.", makers: ["OpenAI", "Anthropic", "xAI", "xAI"] },
        { claim: "   ", makers: ["OpenAI"] },
        { claim: "  raised   ONCE. ", makers: ["Anthropic", "Google"] }
      ]
    }, roots);
    // The two spellings of "Raised once." are one claim (three makers in all), shown in its first spelling.
    expect(view.also_raised).toEqual(["Raised once.", "Raised by three."]);
    const text = JSON.stringify(view);
    for (const forbidden of ["OpenAI", "Anthropic", "makers", "raised_by", "raisedBy"]) expect(text).not.toContain(forbidden);
  });

  it("cuts long text to the contract's limits, never splitting a character", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "a".repeat(700), rootNodeId: ROOT_A }],
      alsoRaised: [{ claim: "b".repeat(300), makers: ["A"] }, { claim: "😀".repeat(200), makers: ["A"] }]
    }, roots);
    expect(DebateMapViewSchema.parse(view)).toEqual(view);
    expect(view.positions[0]!.answer.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars);
    expect(view.positions[0]!.answer.endsWith("…")).toBe(true);
    for (const claim of view.also_raised) {
      expect(claim.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxClaimChars);
      expect(claim).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    }
  });

  it("reads no view when the run has no map choice, or the choice named no answer", async () => {
    const reader = (record: MapViewSource | null) => new RepositoryAnswerMapViewApplication({
      readMapOpeningForRun: async () => "MAP", readMapChoiceForRun: async () => record
    }, OWNED);
    const input: MapViewReadInput = { runId: STORY_TEST_RUN_ID, nodeIds: roots, ownership: OWNERSHIP };
    expect(await reader(null).readMapView(input)).toBeNull();
    expect(await reader({ answers: [], alsoRaised: [{ claim: "Orphan.", makers: ["A"] }] }).readMapView(input)).toBeNull();
    expect(await NO_MAP_VIEWS.readMapView(input)).toBeNull();
  });

  // Ruling C-TWO: the page follows the runner's story rule. With fewer than two map answers the debate argued today's
  // opening and the story got no also-raised points, so the page shows no view (never "No other points came up").
  it("reads no view when fewer than two map answers were argued, the runner's own story rule", async () => {
    const reader = (record: MapViewSource) => new RepositoryAnswerMapViewApplication({
      readMapOpeningForRun: async () => "MAP", readMapChoiceForRun: async () => record
    }, OWNED);
    const input: MapViewReadInput = { runId: STORY_TEST_RUN_ID, nodeIds: roots, ownership: OWNERSHIP };
    const alsoRaised = [{ claim: "Ask the school.", makers: ["A"] }];
    expect(await reader({ answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }], alsoRaised }).readMapView(input)).toBeNull();
    expect(await reader({
      answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }, { statement: "Move now.", rootNodeId: ROOT_B }], alsoRaised
    }).readMapView(input)).toEqual({
      positions: [{ node_id: ROOT_A, answer: "Move gradually." }, { node_id: ROOT_B, answer: "Move now." }],
      also_raised: ["Ask the school."]
    });
    expect([0, 1].map(mapAnswersArgued)).toEqual([false, false]);
    expect([2, 3, 4].map(mapAnswersArgued)).toEqual([true, true, true]);
  });

  it("the runner and the map view share ONE copy of the rule (mapAnswersArgued), not two", () => {
    const runner = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const mapViews = readFileSync(new URL("../../apps/api/src/map-views.ts", import.meta.url), "utf8");
    expect(mapViews).toMatch(/mapAnswersArgued\(record\.answers\.length\)/u);
    expect(runner).toMatch(/mapAnswersArgued\(shapeMapPositions\.length\)/u);
    // No second copy of the threshold beside the runner's map positions.
    expect(runner).not.toMatch(/shapeMapPositions\.length\s*(?:>=|<)\s*2/u);
  });

  // Pre-flight PF-C16: the second owner check. A caller who does not own the run gets no view,
  // and the map is never read for them.
  it("checks the caller owns the run before it reads the map, and reads nothing otherwise", async () => {
    const record: MapViewSource = {
      answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }, { statement: "Move now.", rootNodeId: ROOT_B }], alsoRaised: []
    };
    const mapReads: string[] = [];
    const ownerChecks: { runId: string; ownership: RunOwnershipAccess }[] = [];
    const reader = {
      readMapOpeningForRun: async () => "MAP" as const,
      readMapChoiceForRun: async (runId: string) => {
        mapReads.push(runId);
        return record;
      }
    };
    const owner = (owned: boolean): RunOwnerCheck => ({
      owns: async (runId, ownership) => {
        ownerChecks.push({ runId, ownership });
        return owned;
      },
      ownedRunOfAnswer: async () => (owned ? STORY_TEST_RUN_ID : null)
    });
    const input: MapViewReadInput = { runId: STORY_TEST_RUN_ID, nodeIds: roots, ownership: OWNERSHIP };

    // Not the caller's run: null, and the map is not read.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(false)).readMapView(input)).toBeNull();
    expect(ownerChecks).toEqual([{ runId: STORY_TEST_RUN_ID, ownership: OWNERSHIP }]);
    expect(mapReads).toEqual([]);

    // An ownership naming nobody is refused before any query: no owner check, no map read.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(true))
      .readMapView({ ...input, ownership: { ownerRef: null, legacyAskerId: null } })).toBeNull();
    expect(ownerChecks).toHaveLength(1);
    expect(mapReads).toEqual([]);

    // The caller's run: checked, then read once.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(true)).readMapView(input))
      .toEqual({ positions: [{ node_id: ROOT_A, answer: "Move gradually." }, { node_id: ROOT_B, answer: "Move now." }], also_raised: [] });
    expect(ownerChecks).toHaveLength(2);
    expect(mapReads).toEqual([STORY_TEST_RUN_ID]);
  });

  it("asks core.run_is_owned_by, and only a true answer owns the run", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const check = (rows: readonly Readonly<{ owned?: unknown }>[]) => runOwnerCheckFrom(async (text, values) => {
      queries.push({ text, values });
      return { rows };
    });
    expect(await check([{ owned: true }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(true);
    expect(queries).toEqual([{
      text: "SELECT core.run_is_owned_by($1,$2,$3) AS owned",
      values: [STORY_TEST_RUN_ID, OWNERSHIP.ownerRef, OWNERSHIP.legacyAskerId]
    }]);
    expect(await check([{ owned: false }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
    expect(await check([]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
    expect(await check([{ owned: "true" }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
  });
});

describe("debate shape P2c — ruling C-MAPREAD: no map costs one owner query and one map-choice lookup", () => {
  const find: MapRunFindInput = { answerId: STORY_TEST_ANSWER_ID, ownership: OWNERSHIP };

  it("asks the owner query first; for a run not the caller's it looks nothing else up", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader("MAP", null, log), recordingOwner(false, log));
    expect(await app.findMapRun(find)).toBeNull();
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`]);
  });

  it("an ownership naming nobody is refused before any query", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader("MAP", null, log), recordingOwner(true, log));
    expect(await app.findMapRun({ ...find, ownership: { ownerRef: null, legacyAskerId: null } })).toBeNull();
    expect(log).toEqual([]);
  });

  it("finds no map for the caller's run with no map choice, or one that fell back to today's opening, and never reads the choice", async () => {
    for (const opening of [null, "TODAYS_OPENING"] as const) {
      const log: string[] = [];
      const app = new RepositoryAnswerMapViewApplication(recordingReader(opening, null, log), recordingOwner(true, log));
      expect(await app.findMapRun(find)).toBeNull();
      expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `opening:${STORY_TEST_RUN_ID}`]);
    }
  });

  it("names the caller's run when its map opened the debate", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader("MAP", null, log), recordingOwner(true, log));
    expect(await app.findMapRun(find)).toBe(STORY_TEST_RUN_ID);
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `opening:${STORY_TEST_RUN_ID}`]);
  });

  it("resolves the answer's run in the owner query itself (core.run_is_owned_by), and only a text run id counts", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const check = (rows: readonly Readonly<{ run_id?: unknown }>[]) => runOwnerCheckFrom(async (text, values) => {
      queries.push({ text, values });
      return { rows };
    });
    expect(await check([{ run_id: STORY_TEST_RUN_ID }]).ownedRunOfAnswer(STORY_TEST_ANSWER_ID, OWNERSHIP)).toBe(STORY_TEST_RUN_ID);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toMatch(/FROM serve\.answer AS answer/u);
    expect(queries[0]!.text).toMatch(/core\.run_is_owned_by\(answer\.run_id,\$2,\$3\)/u);
    expect(queries[0]!.values).toEqual([STORY_TEST_ANSWER_ID, OWNERSHIP.ownerRef, OWNERSHIP.legacyAskerId]);
    expect(await check([]).ownedRunOfAnswer(STORY_TEST_ANSWER_ID, OWNERSHIP)).toBeNull();
    expect(await check([{ run_id: 7 }]).ownedRunOfAnswer(STORY_TEST_ANSWER_ID, OWNERSHIP)).toBeNull();
  });

  it("the route answers a run with no map without the full answer read or the leased map read", async () => {
    for (const opening of [null, "TODAYS_OPENING"] as const) {
      const log: string[] = [];
      const reads: unknown[] = [];
      const app = new RepositoryAnswerMapViewApplication(recordingReader(opening, null, log), recordingOwner(true, log));
      const server = api({ answer: answerOf(), mapViews: app, reads });
      const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
      // One owner query, one map-choice lookup, and nothing else: no answer read, no leased choice read.
      expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `opening:${STORY_TEST_RUN_ID}`]);
      expect(reads).toEqual([]);
      await server.close();
    }
  });

  it("the route answers a caller who does not own the answer with the same 404, after the owner query alone", async () => {
    const log: string[] = [];
    const reads: unknown[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader("MAP", null, log), recordingOwner(false, log));
    const server = api({ answer: answerOf(), mapViews: app, reads });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`]);
    expect(reads).toEqual([]);
    await server.close();
  });

  it("the route reads the answer only once a map exists, then reads the view of that same run", async () => {
    const log: string[] = [];
    const reads: unknown[] = [];
    const record: MapViewSource = {
      answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }, { statement: "Move now.", rootNodeId: ROOT_B }],
      alsoRaised: []
    };
    const app = new RepositoryAnswerMapViewApplication(recordingReader("MAP", record, log), recordingOwner(true, log));
    const server = api({ answer: answerOf(), mapViews: app, reads });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(reads).toHaveLength(1);
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `opening:${STORY_TEST_RUN_ID}`, `owns:${STORY_TEST_RUN_ID}`, `choice:${STORY_TEST_RUN_ID}`]);
    await server.close();
  });

  it("the route refuses an answer whose run is not the run the pre-check found", async () => {
    const calls: MapViewReadInput[] = [];
    const server = api({ answer: answerOf(), mapViews: views({ positions: [], also_raised: ["x"] }, calls, "f0000000-0000-4000-8000-00000000000f") });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
    expect(calls).toEqual([]);
    await server.close();
  });
});

describe("debate shape P2c — GET /v1/answers/{id}/map", () => {
  const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };

  it("needs a session", async () => {
    const reads: unknown[] = [];
    const server = api({ answer: answerOf(), mapViews: views(view), reads });
    const response = await server.inject({ method: "GET", url: URL_OF });
    expect(response.statusCode).toBe(401);
    expect(reads).toEqual([]);
    await server.close();
  });

  // Pre-flight PF-C15: every gate case records the reader's calls and proves the map was never read.
  it("answers the closed 404 without reading the map, for no reader, a malformed id, and an answer that is not the caller's", async () => {
    const cases: { answer: Answer | null; composed: boolean; url: string }[] = [
      { answer: answerOf(), composed: false, url: URL_OF },
      { answer: answerOf(), composed: true, url: "/v1/answers/not-a-uuid/map" },
      { answer: null, composed: true, url: URL_OF }
    ];
    for (const item of cases) {
      const calls: MapViewReadInput[] = [];
      const server = api(item.composed
        ? { answer: item.answer, mapViews: views(view, calls) }
        : { answer: item.answer });
      const response = await server.inject({ method: "GET", url: item.url, headers: HEADERS });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
      expect(calls).toEqual([]);
      await server.close();
    }
  });

  it("answers the same closed 404 when the run has no map view", async () => {
    const calls: MapViewReadInput[] = [];
    const server = api({ answer: answerOf(), mapViews: views(null, calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
    expect(calls).toHaveLength(1);
    await server.close();
  });

  it("reads the view of the answer's own run, against the answer's own nodes, as the caller", async () => {
    const calls: MapViewReadInput[] = [];
    const reads: { answerId: string; ownership: unknown }[] = [];
    const server = api({ answer: answerOf(), mapViews: views(view, calls), reads: reads as unknown[] });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(view);
    expect(reads.map((read) => [read.answerId, read.ownership])).toEqual([[STORY_TEST_ANSWER_ID, OWNERSHIP]]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.runId).toBe(STORY_TEST_RUN_ID);
    expect([...calls[0]!.nodeIds].sort()).toEqual([ROOT_A, ROOT_B, REPLY]);
    expect(calls[0]!.ownership).toEqual(OWNERSHIP);
    await server.close();
  });
});

describe("debate shape P2c — the published copy", () => {
  const input = {
    runId: STORY_TEST_RUN_ID, answer: answerOf(), owner: { userId: OWNER.authenticated.userId, ownerRef: OWNER.authenticated.ownerRef }, source: { requestId: "req-map" } as never
  };

  it("copies the owner's view, read as the publisher against the answer's nodes, and never blocks publishing when the read fails", async () => {
    const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };
    const calls: MapViewReadInput[] = [];
    expect(await readPublishableMapView(views(view, calls), input)).toEqual(view);
    expect(calls.map((call) => call.ownership)).toEqual([OWNERSHIP]);
    expect(calls.map((call) => [...call.nodeIds].sort())).toEqual([[ROOT_A, ROOT_B, REPLY]]);
    expect(await readPublishableMapView(NO_MAP_VIEWS, input)).toBeNull();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: MapViewReader = { readMapView: async () => { throw new Error("database unreachable"); } };
    expect(await readPublishableMapView(failing, input)).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toContain("api.publication.map_view_not_published");
    expect(String(logged.mock.calls[0]![0])).not.toContain("database unreachable");
  });
});
