// tests/integration/v2-paths-backup-checker.test.ts. The backup checker, end to end: the REAL runner composed as main.ts composes it
// on the preview (the path rewrite switched on), scripted gates, a migrated embedded PostgreSQL, one encrypted owner. GLM checks every
// answer so far, the main answer, the story and a dig's rewrite; here its vendor answers every one of those checks with an error, so its
// call cannot be completed. Each check then goes to one model of a third company (neither Haiku's, which wrote, nor GLM's), at the first
// check's call site with ":BACKUP", and nothing is stored that was not checked. Integration suites are skipped by the CI gate: run this
// file by hand, alone. Every name, question and page is made up.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PostgresDigModelRunnerRepository, PostgresDigPicksRepository, PostgresInvestigationRepository, PostgresPathResultsRepository,
  PostgresStartPathsStore, migrate, type Pool, type StoredPathViewpoint, type StoredStartPathSet
} from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance } from "@debateai/register";
import { StoryRepository } from "@debateai/story";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import { scriptedShapeAnswers } from "../support/debate-shape-harness.js";
import { FIVE_MAKER_REFS, GLM, HAIKU, OWNER_CALL_CONCURRENCY, previewDebateHarness } from "../support/preview-debate-harness.js";
import { PATHS_SETTINGS, pathsShapeOf, storedPathsOf } from "../support/paths-run-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
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
type Called = Readonly<{ key: string; actor: string; outcome: string }>;
const calledOf = async (runId: string): Promise<readonly Called[]> => (await q(database.pool, `SELECT call_site_key, actor_ref, outcome
  FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence`, runId))
  .map((row) => Object.freeze({ key: String(row.call_site_key), actor: String(row.actor_ref), outcome: String(row.outcome) }));

/** GLM's ref on this panel (its writer ref) and Haiku's: the two companies a backup checker may never be. */
const GLM_REF = /fixture-a|glm/iu;
const HAIKU_REF = /haiku/iu;
const isThirdCompany = (actor: string): boolean => !GLM_REF.test(actor) && !HAIKU_REF.test(actor);

/** GLM's vendor answers each check named in `kinds` with an error: its call cannot be completed. */
const glmChecksFail = (kinds: readonly string[]) => (request: GateRequest): GateOverride | null =>
  request.model === GLM && kinds.includes(request.kind) ? { vendorStatus: 500 } : null;

/** The dig's picks, made up: the first two combined into its path b1, the third its path b2. */
const PICKS = Object.freeze(["Do winter crossings fall by half?", "Do the night ferries run empty?", "Would a second pier cut the queues?"]);
function digSet(runId: string): StoredStartPathSet {
  const pick = (pickNo: number): StoredPathViewpoint => Object.freeze({ viewpointId: null, pickNo, title: null, question: PICKS[pickNo - 1]!, own: false });
  return Object.freeze({ runId, source: "DIG_PICKS", width: 2, chosenBy: "PERSON", carryOnToReport: false, menu: null, paths: Object.freeze([
    Object.freeze({ pathId: "b1", pathNo: 1, author: "AI_COMBINED", title: "T1", question: "Q1?", viewpoints: Object.freeze([pick(1), pick(2)]),
      ownWords: Object.freeze([]) }),
    Object.freeze({ pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: "T2", question: PICKS[2]!, viewpoints: Object.freeze([pick(3)]),
      ownWords: Object.freeze([]) })
  ]) });
}

/** One path debate on the five companies, the path rewrite switched on; a dig first joins its parent's investigation and keeps its picks. */
async function runOnFive(label: string, options: Readonly<{ count: number; set: (runId: string) => StoredStartPathSet;
  dig?: Readonly<{ parentRunId: string; positionRef: string }>; before?: (request: GateRequest) => GateOverride | null }>) {
  const source = options.dig === undefined ? "MENU" : "DIG_PICKS";
  const shape = pathsShapeOf("plus", options.count, source, FIVE_MAKER_REFS.length);
  const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "plus", answerLength: PATHS_SETTINGS.answerLength });
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
  const gates = await harness.startGates({}, { unbilled: [] }, (request, chat) => options.before?.(request) ?? scripted(request, chat));
  const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY,
    debateShape: { mapContractHash: mapPromptContractHash() }, engine: { engineContractHash: engineContractHash() }, pathRewrite: true });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, result, called: await calledOf(debate.runId) };
}

describe("a path debate whose checker cannot be reached", () => {
  it("every answer so far, the main answer and the story are checked by a third company at their own :BACKUP sites, and none is FAILED", async () => {
    const run = await runOnFive("paths-backup-checker", { count: 3, set: (runId) => storedPathsOf(runId, 3),
      before: glmChecksFail(["PATH_OUTCOME_CHECKER", "REPORT_ANSWER_CHECK", "STORY_PATHS_CHECK"]) });
    const runId = run.debate.runId;
    // GLM was asked every check first, and could not answer one.
    const glmChecks = run.gates.requests.filter((request) => request.model === GLM
      && ["PATH_OUTCOME_CHECKER", "REPORT_ANSWER_CHECK", "STORY_PATHS_CHECK"].includes(request.kind));
    expect(glmChecks.length).toBeGreaterThan(0);
    expect(glmChecks.filter((request) => request.answer === "OK")).toEqual([]);

    // Each path's answer so far: GLM's site failed, the backup's answered, by a company that neither wrote nor failed the check.
    const outcomes = await new PostgresPathResultsRepository(database.pool).readPathOutcomes(runId);
    expect([...outcomes.keys()]).toEqual(["b1", "b2", "b3"]);
    for (const [pathId, outcome] of outcomes) {
      expect([pathId, outcome.state]).toEqual([pathId, expect.stringMatching(/^READY/u)]);
      const pathNo = pathId.slice(1);
      const first = run.called.filter((call) => call.key === `PATH_OUTCOME:CHECKER:${pathNo}:1`);
      expect(first.length).toBeGreaterThan(0);
      for (const call of first) expect([call.actor, call.outcome]).toEqual([expect.stringMatching(GLM_REF), expect.not.stringMatching(/^OK$/u)]);
      const backups = run.called.filter((call) => call.key.startsWith(`PATH_OUTCOME:CHECKER:${pathNo}:`) && call.key.endsWith(":BACKUP") && call.outcome === "OK");
      expect(backups.length).toBeGreaterThan(0);
      for (const call of backups) expect(isThirdCompany(call.actor)).toBe(true);
      // The rounds after the first go straight to the backup: GLM is never asked twice in one path's rounds.
      expect(run.called.filter((call) => call.key === `PATH_OUTCOME:CHECKER:${pathNo}:2`)).toEqual([]);
    }

    // The main answer: written by Haiku, checked by the backup at POST_COMPOSE_R9:EVALUATOR:1:BACKUP, and served as the main answer.
    const mainChecks = run.called.filter((call) => call.key.startsWith("POST_COMPOSE_R9:EVALUATOR:") && call.outcome === "OK");
    expect(mainChecks.map((call) => call.key)).toContain("POST_COMPOSE_R9:EVALUATOR:1:BACKUP");
    for (const call of mainChecks) expect(isThirdCompany(call.actor)).toBe(true);
    expect(run.called.filter((call) => call.key.startsWith("COMPOSER:") && call.outcome === "OK").map((call) => call.actor))
      .toEqual([expect.stringMatching(HAIKU_REF)]);
    expect(run.gates.requests.filter((request) => request.kind === "REPORT_ANSWER_CHECK" && request.answer === "OK")
      .every((request) => request.model !== GLM && request.model !== HAIKU)).toBe(true);

    // The story: checked by the backup at STORY:CHECKER:1:BACKUP, and its row names that model as its checker.
    const storyChecks = run.called.filter((call) => call.key === "STORY:CHECKER:1:BACKUP" && call.outcome === "OK");
    expect(storyChecks).toHaveLength(1);
    expect(isThirdCompany(storyChecks[0]!.actor)).toBe(true);
    const story = await new StoryRepository(database.pool).readForAnswer({ answerId: run.result.answerId, answerVersion: null,
      ownership: { ownerRef: own().ownerRef } });
    expect(story).toMatchObject({ outcome: "READY", checkerLineage: { provider_ref: storyChecks[0]!.actor } });

    // Every backup call has its own attempts at its own key: none was refused for a spent allowance.
    expect(run.called.filter((call) => call.key.endsWith(":BACKUP") && call.outcome !== "OK")).toEqual([]);
  }, 1_800_000);
});

describe("a dig whose rewrite checker cannot be reached", () => {
  it("the parent's path is rewritten, checked by a third company at PATH_REWRITE:CHECKER:1:BACKUP on the dig's run", async () => {
    const parent = await runOnFive("paths-backup-checker-parent", { count: 3, set: (runId) => storedPathsOf(runId, 3) });
    const parentId = parent.debate.runId;
    const dig = await runOnFive("paths-backup-checker-dig", { count: 2, set: digSet, dig: { parentRunId: parentId, positionRef: "b2" },
      before: glmChecksFail(["PATH_REWRITE_CHECKER"]) });
    const digId = dig.debate.runId;
    const first = dig.called.filter((call) => call.key === "PATH_REWRITE:CHECKER:1");
    expect(first.length).toBeGreaterThan(0);
    for (const call of first) expect([call.actor, call.outcome]).toEqual([expect.stringMatching(GLM_REF), expect.not.stringMatching(/^OK$/u)]);
    const backups = dig.called.filter((call) => call.key === "PATH_REWRITE:CHECKER:1:BACKUP");
    expect(backups.map((call) => call.outcome)).toEqual(["OK"]);
    expect(isThirdCompany(backups[0]!.actor)).toBe(true);
    const rewrites = await new PostgresDigModelRunnerRepository(database.pool).readPathRewrites(parentId);
    const entry = rewrites?.paths.find((candidate) => candidate.run_id.toLowerCase() === digId.toLowerCase());
    expect(entry).toMatchObject({ position_ref: "b2", state: "READY" });
    const row = await q(database.pool, `SELECT checker_lineage FROM identity.path_rewrite WHERE run_id=$1`, digId);
    expect(row).toEqual([{ checker_lineage: expect.objectContaining({ provider_ref: backups[0]!.actor }) }]);
  }, 1_800_000);
});
