// tests/integration/v2-paths-dig-run.test.ts (V4 start step, Task 55; spec 2026-11-03 §4.4 "Digs work the same way"). A dig of a
// path debate, end to end: the REAL runner composed as main.ts composes it on the preview (the path rewrite switched on), scripted
// gates, a migrated embedded PostgreSQL, one encrypted owner (tests/support/paths-run-harness.ts). The parent is a path debate on
// three paths; the dig joins its investigation under the parent's path b2 with three picks combined into two paths ([1, 2] and
// [3]). Each of the dig's paths is argued as its own branch with its own web search, in dig mode, its planner handed the
// investigation's digest (which the runner reads empty today: the known-defect case below); no gap round; no story: the parent's
// path b2 is rewritten in its place, with the dig's own
// paths named b1 and b2, and the parent's path read without its own root. A Free dig makes no web call and no gap call.
// Integration suites are skipped by the CI gate: run this file by hand, alone. Every name, question and page is made up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StoryBodySchema } from "@debateai/contract";
import {
  PATH_REWRITE_CARRIER, PostgresDigModelRunnerRepository, PostgresDigPicksRepository, PostgresDigPicksRunnerRepository, PostgresInvestigationRepository,
  PostgresPathResultsRepository, PostgresStartPathsStore, decryptContentForRun, migrate, withRunContentLease, type CryptoEnvelope, type Pool,
  type StoredPathViewpoint, type StoredStartPathSet
} from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance } from "@debateai/register";
import type { PerplexitySearchRequest } from "@debateai/providers";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { pointsOf, postgresPathRewriteSources } from "../../apps/runner/src/path-rewrite-sources.js";
import { postgresWebStepRunReaders } from "../../apps/runner/src/web-step.js";
import { scriptedShapeAnswers } from "../support/debate-shape-harness.js";
import { laterStepContent } from "../support/gate-later-steps.js";
import { FIVE_MAKER_REFS, OWNER_CALL_CONCURRENCY, previewDebateHarness } from "../support/preview-debate-harness.js";
import {
  PATHS_SETTINGS, materialOf, pathsShapeOf, pathsWebSettings, plannedSearchFor, readEveryPage, storedPathsOf
} from "../support/paths-run-harness.js";
import type { GateOverride, GateRecord, GateRequest } from "../support/preview-gate-stubs.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, database: () => database, stubClosers });
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); vi.restoreAllMocks(); });
afterAll(async () => {
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
  await database?.stop();
});

const own = (): StoryEncryptedOwner => owner!;
const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const fieldOf = (request: GateRecord, name: string): string | undefined =>
  materialOf(request).fields.find((field) => field.name === name)?.content;

/** The stand-in storyteller's line for every path (tests/support/gate-later-steps.ts): what the parent's story says of each path. */
const STORY_PATH_LINE = "This path came out where its answer so far says.";
/** The stand-in's answer so far on every path: what a path b<n> nothing rewrote yet reads as (Task 55b). */
const OUTCOME_LINE = "This path holds up so far.";
/** The dig's three picks, made up: the first two combined into its path b1, the third its path b2. */
const PICKS = Object.freeze(["Do winter crossings fall by half?", "Do the night ferries run empty?", "Would a second pier cut the queues?"]);

/**
 * The parent's story names every point under each of its paths (the stand-in names only the first point), so each path's points
 * hold that path's own root too, as a real storyteller's may.
 */
const citeEveryPoint = (request: GateRequest, chat: string): GateOverride | null => {
  if (request.kind !== "STORY_PATHS") return null;
  const story = JSON.parse(laterStepContent("STORY_PATHS", chat, "en")) as { short: { paths: { node_refs: string[] }[] } };
  const refs = (JSON.parse(materialOf(request).fields.find((field) => field.name === "points")?.content ?? "[]") as { ref: string }[])
    .map((point) => point.ref).slice(0, 40);
  for (const path of story.short.paths) path.node_refs = refs;
  return { content: JSON.stringify(story) };
};

/** A dig's set as Start seals it for picks [[1, 2], [3]]: b1 the first two combined, b2 the third. */
function digSet(runId: string): StoredStartPathSet {
  const pick = (pickNo: number): StoredPathViewpoint => Object.freeze({ viewpointId: null, pickNo, title: null, question: PICKS[pickNo - 1]!, own: false });
  return Object.freeze({ runId, source: "DIG_PICKS", width: 2, chosenBy: "PERSON", carryOnToReport: false, menu: null, paths: Object.freeze([
    Object.freeze({ pathId: "b1", pathNo: 1, author: "AI_COMBINED", title: "T1", question: "Q1?", viewpoints: Object.freeze([pick(1), pick(2)]),
      ownWords: Object.freeze([]) }),
    Object.freeze({ pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: "T2", question: PICKS[2]!, viewpoints: Object.freeze([pick(3)]),
      ownWords: Object.freeze([]) })
  ]) });
}

/**
 * One path debate on the five companies (GLM by its writer ref beside the four, so the rewrite's Haiku and GLM are the run's own),
 * its set sealed as Start seals it; a dig first joins its parent's investigation under `dig.positionRef` and keeps its picks, as the
 * asks route does at start. The runner is composed with the path rewrite switched on; the web step on `web`'s plan, every search's
 * mode kept.
 */
async function runOnFive(label: string, options: Readonly<{ plan: "plus" | "free"; count: number; set: (runId: string) => StoredStartPathSet;
  dig?: Readonly<{ parentRunId: string; positionRef: string }>; web?: "PLUS" | "FREE"; before?: (request: GateRequest, chat: string) => GateOverride | null }>) {
  const source = options.dig === undefined ? "MENU" : "DIG_PICKS";
  const shape = pathsShapeOf(options.plan, options.count, source, FIVE_MAKER_REFS.length);
  const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: options.plan, answerLength: PATHS_SETTINGS.answerLength });
  const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: FIVE_MAKER_REFS.length, mapOpening: false });
  const debate = await harness.admittedRun(label, { panelRefs: FIVE_MAKER_REFS, depth: 1, shapeV2: shape, settings: PATHS_SETTINGS, length, engine,
    owner: own() });
  expect(await new PostgresStartPathsStore(database.pool).recordStartPaths(options.set(debate.runId))).toBe("RECORDED");
  if (options.dig !== undefined) {
    const place = `path:${options.dig.positionRef}`;
    expect(await new PostgresInvestigationRepository(database.pool).join({ ownerRef: own().ownerRef, parentRunId: options.dig.parentRunId,
      childRunId: debate.runId, places: [place], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: 1 });
    expect(await new PostgresDigPicksRepository(database.pool).record({ ownerRef: own().ownerRef, runId: debate.runId,
      parentRunId: options.dig.parentRunId, positionRef: options.dig.positionRef,
      picks: PICKS.map((text, at) => ({ kind: "NEEDS_MORE_WEB" as const, suggestionId: `sg-${String(at + 1)}`, place, author: "AI_SUGGESTION" as const, text }))
    })).toBe("RECORDED");
  }
  const scripted = scriptedShapeAnswers(debate.question);
  const planSearch = options.web === "PLUS";
  const web = options.web === undefined ? null : pathsWebSettings(options.web);
  const searchModes: string[] = [];
  const port = web?.settings.search ?? null;
  const webSearch = web === null ? undefined : Object.freeze({ ...web.settings, search: port === null ? null : Object.freeze({
    search: (request: PerplexitySearchRequest, signal?: AbortSignal) => { searchModes.push(request.mode); return port.search(request, signal); } }) });
  // GLM answers (a debate script names no unbilled model), so the rewrite and the final steps sit in Haiku and GLM.
  const gates = await harness.startGates({}, { unbilled: [] }, (request, chat) => options.before?.(request, chat)
    ?? (planSearch ? plannedSearchFor(request, chat) ?? readEveryPage(request, chat) : null) ?? scripted(request, chat));
  const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
    debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() },
    ...(webSearch === undefined ? {} : { webSearch }), pathRewrite: true });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, result, calls: await harness.modelCalls(debate.runId), queries: web?.queries ?? [], searchModes };
}

/** The Plus dig's planner requests, kept for the known-defect case below. */
let plusDigPlanners: readonly GateRecord[] = [];

/** The parent path debate (Plus, three paths, no web), argued once for the whole file. */
let parentMade: ReturnType<typeof runOnFive> | null = null;
const parentDebate = () => parentMade ??= runOnFive("v2-dig-parent", { plan: "plus", count: 3, set: (runId) => storedPathsOf(runId, 3),
  before: citeEveryPoint });

/** A run's newest story: each path's id and the node ids it names. */
async function storyPathRefs(runId: string): Promise<ReadonlyMap<string, readonly string[]>> {
  const row = (await database.pool.query<{ story_id: string; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
    `SELECT story_id::text AS story_id, content, content_ciphertext FROM serve.answer_story WHERE run_id=$1
      ORDER BY answer_version DESC, created_at DESC LIMIT 1`, [runId])).rows[0];
  expect(row).toBeDefined();
  const content = await withRunContentLease(database.pool, [runId], () =>
    decryptContentForRun<unknown>(database.pool, runId, "serve.answer_story", row!.story_id, row!.content_ciphertext, row!.content));
  const body = StoryBodySchema.parse((content as { body: unknown }).body);
  return new Map(body.short.paths.map((path) => [path.position_ref, path.node_refs] as const));
}

const lower = (ids: readonly string[]): string[] => ids.map((id) => id.toLowerCase());

describe("a dig of a path debate argues its picks as paths (Task 55)", () => {
  it("the parent's path b<n>, read for a rewrite, holds the points its story names under it, without that path's own root", async () => {
    const parent = await parentDebate();
    const parentId = parent.debate.runId;
    const roots = await new PostgresPathResultsRepository(database.pool).readPathRoots(parentId);
    expect(roots.map((root) => root.pathId)).toEqual(["b1", "b2", "b3"]);
    const named = await storyPathRefs(parentId);
    const sources = postgresPathRewriteSources(database.pool);
    for (const root of roots) {
      const refs = named.get(root.pathId) ?? [];
      // The story names the path's root under it (every point is named under every path here).
      expect(lower(refs)).toContain(root.rootNodeId.toLowerCase());
      const path = await sources.parentPathOf({ parentRunId: parentId, positionRef: root.pathId, baseRewriteId: null });
      expect(path.positionRef).toBe(root.pathId);
      // Task 55b: nothing rewrote it yet, so its text is its answer so far, not the story's line.
      expect(path.line).toBe(OUTCOME_LINE);
      expect(lower(path.points.map((point) => point.id))).toEqual(lower(refs).filter((id) => id !== root.rootNodeId.toLowerCase()));
    }
  }, 1_800_000);

  it("Plus, picks [[1, 2], [3]] under b2: roots b1 and b2, a planner a path searching in dig mode, the dig's digest, no gap round, no story, and b2 rewritten with the dig's paths b1 and b2", async () => {
    const parent = await parentDebate();
    const parentId = parent.debate.runId;
    const dig = await runOnFive("v2-dig-plus", { plan: "plus", count: 2, set: digSet, dig: { parentRunId: parentId, positionRef: "b2" }, web: "PLUS" });
    const digId = dig.debate.runId;
    // Each pick group is a path, argued from its own root.
    const roots = await q(database.pool, `SELECT path_id, root_index FROM core.path_root WHERE run_id=$1 ORDER BY root_index`, digId);
    expect(roots.map((row) => [row.path_id, row.root_index])).toEqual([["b1", 0], ["b2", 1]]);
    // Each path has its own planner (web.plan-dig, one call site a path), handed the investigation's digest field.
    const planners = dig.gates.requests.filter((request) => request.kind === "WEB_DIG_PLAN" && request.answer === "OK");
    expect(planners).toHaveLength(2);
    for (const request of planners) expect(fieldOf(request, "already_investigated")).toBeDefined();
    // The digest, as the runner's readers read the dig (outside any lease): what the investigation already looked into, the parent's story.
    const known = await postgresWebStepRunReaders(database.pool).dig(digId);
    expect(known?.mode).toBe("quick");
    expect(known?.alreadyInvestigated).not.toBe("[]");
    expect(known?.alreadyInvestigated).toContain(STORY_PATH_LINE);
    plusDigPlanners = planners;
    // Its searches are a dig's (five results each), each kept under its own path.
    expect(dig.searchModes.length).toBeGreaterThan(0);
    expect([...new Set(dig.searchModes)]).toEqual(["DIG"]);
    const searched = await q(database.pool, `SELECT DISTINCT path_ref FROM identity.web_search WHERE run_id=$1 ORDER BY path_ref`, digId);
    expect(searched.map((row) => row.path_ref)).toEqual(["b1", "b2"]);
    // No gap round, no map call.
    expect(await q(database.pool, `SELECT run_id FROM core.path_gap_round WHERE run_id=$1`, digId)).toEqual([]);
    expect(dig.calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toEqual([]);
    // No story: the parent's path is rewritten in its place.
    expect(await q(database.pool, `SELECT story_id FROM serve.answer_story WHERE run_id=$1`, digId)).toEqual([]);
    expect(dig.gates.requests.filter((request) => request.kind === "STORY_PATHS" || request.kind === "STORYTELLER")).toEqual([]);
    // The rewrite's input: the dig's own paths, b1 and b2, in the person's order.
    const input = (await new PostgresDigPicksRunnerRepository(database.pool).read(digId))?.input?.value as { dig_paths: { positionRef: string }[] };
    expect(input.dig_paths.map((path) => path.positionRef)).toEqual(["b1", "b2"]);
    // The rewrite of the parent's b2: READY, its text naming the dig's paths b1 and b2.
    const rewrites = await new PostgresDigModelRunnerRepository(database.pool).readPathRewrites(parentId);
    const entry = rewrites?.paths.find((candidate) => candidate.run_id.toLowerCase() === digId.toLowerCase());
    expect(entry).toMatchObject({ position_ref: "b2", state: "READY" });
    const content = await withRunContentLease(database.pool, [digId], () => decryptContentForRun<unknown>(database.pool, digId,
      PATH_REWRITE_CARRIER, entry!.rewrite_id!, entry!.content as CryptoEnvelope, null)) as { dig_paths: { position_ref: string }[] };
    expect(content.dig_paths.map((path) => path.position_ref)).toEqual(["b1", "b2"]);
    // The writer read the parent's b2 as its story names it, without b2's own root.
    const writers = dig.gates.requests.filter((request) => request.kind === "PATH_REWRITE_WRITER" && request.answer === "OK");
    expect(writers.length).toBeGreaterThan(0);
    const b2Root = (await new PostgresPathResultsRepository(database.pool).readPathRoots(parentId)).find((root) => root.pathId === "b2")!;
    const [rootPoint] = await pointsOf(database.pool, parentId, [b2Root.rootNodeId]);
    const read = await postgresPathRewriteSources(database.pool).parentPathOf({ parentRunId: parentId, positionRef: "b2", baseRewriteId: null });
    const sent = JSON.parse(fieldOf(writers[0]!, "path") ?? "{}") as { points: { text: string }[] };
    expect(sent.points.map((point) => point.text)).toEqual(read.points.map((point) => point.text));
    expect(sent.points.map((point) => point.text)).not.toContain(rootPoint!.text);
    expect(JSON.parse(fieldOf(writers[0]!, "dig_paths") ?? "[]")).toHaveLength(2);
  }, 1_800_000);

  /**
   * KNOWN DEFECT, left open by Task 55's ruling (it is not a path-debate rule and not in Task 55's files): the runner runs the web
   * step inside the dig's own content lease, where opening another debate's story is refused (CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN,
   * withRunContentLease) and the digest leaves that debate out, so the planners are told "[]". R22 digs read it the same way. This
   * case holds the brief's expectation and FAILS today (`it.fails`); once the digest is read where it can be, it passes, `it.fails`
   * turns red, and it becomes a plain `it`.
   */
  it.fails("each planner of the Plus dig is told what the investigation already looked into (the parent's story)", () => {
    expect(plusDigPlanners).toHaveLength(2);
    for (const request of plusDigPlanners) {
      const digest = fieldOf(request, "already_investigated") ?? "";
      expect(digest).not.toBe("[]");
      expect(digest).toContain(STORY_PATH_LINE);
    }
  });

  it("a Free dig of the same debate makes no web call and no gap call, and still argues its picks as paths b1 and b2", async () => {
    const parent = await parentDebate();
    const free = await runOnFive("v2-dig-free", { plan: "free", count: 2, set: digSet, dig: { parentRunId: parent.debate.runId, positionRef: "b1" },
      web: "FREE" });
    const freeId = free.debate.runId;
    const roots = await q(database.pool, `SELECT path_id FROM core.path_root WHERE run_id=$1 ORDER BY root_index`, freeId);
    expect(roots.map((row) => row.path_id)).toEqual(["b1", "b2"]);
    expect(free.calls.filter((call) => call.call_site_key.startsWith("WEB:"))).toEqual([]);
    expect(free.gates.requests.filter((request) => request.kind.startsWith("WEB_"))).toEqual([]);
    expect(free.queries).toEqual([]);
    expect(free.searchModes).toEqual([]);
    expect(await q(database.pool, `SELECT run_id FROM core.path_gap_round WHERE run_id=$1`, freeId)).toEqual([]);
    expect(free.calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toEqual([]);
    expect(free.gates.requests.filter((request) => request.kind === "PATH_GAP")).toEqual([]);
  }, 1_800_000);
});
