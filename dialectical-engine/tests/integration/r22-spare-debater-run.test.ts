// R22 (owner ruling 2026-10-30, "Yes, use the spare debater"), end to end: the REAL WalkingSkeletonRunner composed as
// main.ts composes it on the preview (tests/support/preview-debate-harness.ts), on the test site's legacy seat book (no
// backups), against scripted gates, on a migrated embedded PostgreSQL. Integration suites are skipped by the CI gate:
// run this file by hand, alone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { BACKUP_MODEL_USED_WORDING } from "@debateai/runner";
import { ROLE_ROTATION_RULE, type RotatedRoles } from "@debateai/scorecard";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import {
  DEEPSEEK, HAIKU, MIMO, PANEL_REFS, QWEN, TARGETS, previewDebateHarness, rotationPick, type AdmittedRun
} from "../support/preview-debate-harness.js";
import { stubChatBody, type GateOverride, type GateRequest } from "../support/preview-gate-stubs.js";
import { scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * THE R21 MIMO SHAPE (run 3714be1b): MiMo's reply failed the content schema on its original answer and on the patch
 * follow-up, and the gateway refused it (`JudgeContentRefusedError`, JUDGE_SCHEMA_FAILURE). Here MiMo answers every
 * POSITION request it is sent with a reply that fails the schema, so every repair is refused too. On the test site's
 * book a seat has no backup, so today that refusal fails the debate. Now a shaped run hands the position to a spare
 * debater (a seat no position uses, of another maker, up, not sitting out); with no spare — the shape arguing every seat,
 * or today's opening, which argues every seat — the refusal fails the debate exactly as today.
 *
 * The rotation pin is written by hand, so the seats are known: the debaters sit in `eligibleModelIds` order, opener
 * first. Free argues three of the four makers' answers, so the fourth seat (Haiku) is the spare.
 */
let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const SHAPE_SETTINGS = { debateShape: { mapContractHash: mapPromptContractHash() } } as const;
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
const MODEL_REFS: Readonly<Record<string, string>> = Object.freeze({
  [DEEPSEEK]: "preview:deepseek-v4-1-flash", [MIMO]: "preview:mimo-v2-6-pro", [QWEN]: "preview:qwen-3-8-flash", [HAIKU]: "preview:claude-haiku-5-5"
});
/** A pin whose positions are `order`'s models, in that order (the first opens); Qwen writes, DeepSeek checks. */
const pinned = (order: readonly string[]): RotatedRoles => Object.freeze({
  rule: ROLE_ROTATION_RULE,
  answerWriter: rotationPick(MODEL_REFS[QWEN]!), answerChecker: rotationPick(MODEL_REFS[DEEPSEEK]!),
  storyteller: rotationPick(MODEL_REFS[QWEN]!), storyChecker: rotationPick(MODEL_REFS[HAIKU]!),
  opener: rotationPick(MODEL_REFS[order[0]!]!),
  eligibleModelIds: Object.freeze([...order])
});
/** MiMo opens (position 0, call site JUDGE), or argues position 1 (JUDGE:root:secondary); Haiku is last. */
const MIMO_FIRST = pinned([MIMO, DEEPSEEK, QWEN, HAIKU]);
const MIMO_SECOND = pinned([DEEPSEEK, MIMO, QWEN, HAIKU]);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await database?.stop(); });

const rows = (sql: string, values: readonly unknown[]) => database.pool.query(sql, [...values]).then((result) => result.rows);
const materialOf = (request: GateRequest) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body)));
/** A POSITION's author request: a judge leg with no position under debate and no own position (a root, shaped or not). */
const isPositionRequest = (request: GateRequest): boolean => {
  if (request.kind !== "JUDGE") return false;
  const names = materialOf(request).fields.map((field) => field.name);
  return !names.includes("position_under_debate") && !names.includes("own_position");
};
const makerOf = (model: string): string => TARGETS.find((target) => target.model === model)!.maker;
/** MiMo answers every POSITION request with a reply that fails the content schema (original, patch follow-up, re-ask). */
const mimoRefusesPositions = (request: GateRequest): GateOverride | null =>
  request.model === MIMO && isPositionRequest(request) ? { content: "{}" } : null;

/** The maker that wrote each position (root order), from the author maker its reduced judgement records. */
const rootMakers = async (runId: string): Promise<string[]> => {
  const makers = new Map((await rows(`SELECT DISTINCT node_id::text AS id, disagreement->'panel'->>'authorMaker' AS maker
    FROM ledger.reduced_judgement WHERE run_id=$1`, [runId])).map((row) => [String(row.id), String(row.maker)]));
  const roots = await rows(`SELECT root_index, root_node_id::text AS id FROM core.map_position WHERE run_id=$1 ORDER BY root_index`, [runId]);
  return roots.map((row) => makers.get(String(row.id))!);
};
const siteRows = (runId: string, siteKey: string) => rows(`SELECT actor_ref, outcome FROM ledger.ledger_entry
  WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key=$2 ORDER BY sequence`, [runId, siteKey]);
const switchEvents = (runId: string) => rows(`SELECT value_json FROM core.run_progress_event
  WHERE run_id=$1 AND value_json->>'state'='BACKUP_MODEL_ENGAGED' ORDER BY at_seq`, [runId])
  .then((events) => events.map((event) => event.value_json as Record<string, unknown>));
const STAND_IN = [BACKUP_MODEL_USED_WORDING.STAND_IN.subject, BACKUP_MODEL_USED_WORDING.STAND_IN.reason];
const backupRecords = async (debate: AdmittedRun, answerId: string) => {
  const { answer } = await harness.servedAnswer(debate, answerId);
  return (answer?.condition_mark_records ?? []).filter((record) => record.mark === "BACKUP-MODEL-USED")
    .map((record) => [record.subject_ref, record.reason]);
};
/** The authorship law, read off the reviews: no node is reviewed by its own author's maker. */
const sameMakerReviews = (runId: string) => rows(`SELECT review.node_id FROM ledger.node_review AS review
  JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
  JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
  WHERE review.run_id=$1 AND author.maker = reviewer.maker`, [runId]);
/** Runs the work item to its end: its result's kind, or the code of the failure it threw. */
const ended = (composed: Awaited<ReturnType<typeof harness.previewRunner>>, debate: AdmittedRun): Promise<string> =>
  composed.runner.executeWorkItem(debate.workItemId)
    .then((result) => result.kind, (error: unknown) => String((error as { code?: unknown }).code));
const freeShape = () => ({ shape: shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD }), settings: STANDARD });

describe("R22 · a refused position on the test site goes to a spare debater (shape on, a spare left)", () => {
  it.each([
    ["position 0", MIMO_FIRST, 0, "JUDGE"],
    ["position 1", MIMO_SECOND, 1, "JUDGE:root:secondary"]
  ] as const)("%s: the spare writes it, under its own route at the same site, and the answer says a stand-in answered", async (_label, pin, rootIndex, siteKey) => {
    const debate = await harness.admittedRun(`spare-${String(rootIndex)}`, { panelRefs: PANEL_REFS, pin, depth: 1, ...freeShape() });
    const scripted = scriptedShapeAnswers(debate.question);
    const gates = await harness.startGates({}, undefined, (request, chat) => mimoRefusesPositions(request) ?? scripted(request, chat));
    const result = await harness.completedRun(await harness.previewRunner(gates, "resend", SHAPE_SETTINGS), debate, gates);
    // Every position was argued, by three makers, none of them MiMo: the spare (Haiku) wrote MiMo's.
    const makers = await rootMakers(debate.runId);
    expect(makers).toHaveLength(3);
    expect(new Set(makers).size).toBe(3);
    expect(makers[rootIndex]).toBe(makerOf(HAIKU));
    expect(makers).not.toContain(makerOf(MIMO));
    // The ledger: MiMo's refused attempts (the original and the patch) under its route, then the spare's answer under
    // its own, at the same site.
    const site = await siteRows(debate.runId, siteKey);
    expect(site.filter((row) => row.actor_ref === MODEL_REFS[MIMO]).length).toBeGreaterThanOrEqual(2);
    expect(site.filter((row) => row.actor_ref === MODEL_REFS[MIMO]).every((row) => row.outcome !== "OK")).toBe(true);
    expect(site.filter((row) => row.outcome === "OK").map((row) => row.actor_ref)).toEqual([MODEL_REFS[HAIKU]]);
    // The authorship law: the spare is the position's author, so its node is never reviewed by its own maker.
    expect(await sameMakerReviews(debate.runId)).toEqual([]);
    // Disclosed: the owner's progress stream names the switch and its cause; the answer says a stand-in answered.
    expect(await switchEvents(debate.runId)).toEqual([expect.objectContaining({
      role: "POSITION", from_provider_ref: MODEL_REFS[MIMO], to_provider_ref: MODEL_REFS[HAIKU], cause: "CONTENT_REFUSED",
      call_site_key: siteKey
    })]);
    expect(await backupRecords(debate, result.answerId)).toEqual([STAND_IN]);
  }, 600_000);

  it("a resumed run keeps the spare: MiMo is not asked again and the spare's answer is replayed, not bought twice", async () => {
    const debate = await harness.admittedRun("spare-resume", { panelRefs: PANEL_REFS, pin: MIMO_FIRST, depth: 1, ...freeShape() });
    const scripted = scriptedShapeAnswers(debate.question);
    const abort = new AbortController();
    // The first copy loses the debate right after the spare answered position 0, before any node is saved (a pass
    // re-claimed after a saved node cannot finish on today's engine: STRENGTH_LINEAGE_UNRESOLVED, its own task).
    const gates = await harness.startGates({}, undefined, (request, chat) => {
      const refused = mimoRefusesPositions(request);
      if (refused !== null) return refused;
      if (request.model === HAIKU && isPositionRequest(request)) abort.abort();
      return scripted(request, chat);
    });
    const first = await harness.previewRunner(gates, "resend", SHAPE_SETTINGS);
    await expect(first.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal: abort.signal }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    const before = await siteRows(debate.runId, "JUDGE");
    expect(before.filter((row) => row.outcome === "OK").map((row) => row.actor_ref)).toEqual([MODEL_REFS[HAIKU]]);
    await database.pool.query(`UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id = $1`,
      [debate.workItemId]);
    const asked = gates.requests.length;
    const result = await harness.completedRun(await harness.previewRunner(gates, "resend", SHAPE_SETTINGS), debate, gates);
    // The second copy never asks MiMo for a position, and position 0's site gains no row: the spare's answer replayed.
    expect(gates.requests.slice(asked).filter((request) => request.model === MIMO && isPositionRequest(request))).toEqual([]);
    expect(await siteRows(debate.runId, "JUDGE")).toEqual(before);
    const makers = await rootMakers(debate.runId);
    expect(makers[0]).toBe(makerOf(HAIKU));
    expect(makers).not.toContain(makerOf(MIMO));
    expect(await sameMakerReviews(debate.runId)).toEqual([]);
    // Told once (the first copy's switch); disclosed on the answer as a stand-in.
    expect(await switchEvents(debate.runId)).toHaveLength(1);
    expect(await backupRecords(debate, result.answerId)).toEqual([STAND_IN]);
  }, 900_000);
});

describe("R22 · with no spare the refusal fails the debate exactly as today", () => {
  /** MiMo's position: its original answer and its patch follow-up both refused, and no other route asked at its site. */
  const mimoRefusedAlone = async (runId: string): Promise<void> => {
    const refused = await rows(`SELECT call_site_key, actor_ref, outcome FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND actor_ref=$2 AND outcome <> 'OK'`, [runId, MODEL_REFS[MIMO]]);
    expect(refused.length).toBeGreaterThanOrEqual(2);
    expect(new Set(refused.map((row) => row.call_site_key))).toEqual(new Set(["JUDGE:root:secondary"]));
    expect((await siteRows(runId, "JUDGE:root:secondary")).map((row) => row.actor_ref)).toEqual(refused.map(() => MODEL_REFS[MIMO]));
    expect(await switchEvents(runId)).toEqual([]);
  };

  it("shape on, no spare: Pro argues all four makers' answers, so every seat holds a position", async () => {
    const debate = await harness.admittedRun("no-spare", {
      panelRefs: PANEL_REFS, pin: MIMO_SECOND, depth: 1,
      shape: shapeForTest({ plan: "pro", makers: PANEL_REFS.length, settings: STANDARD }), settings: STANDARD
    });
    const scripted = scriptedShapeAnswers(debate.question, { chooseAnswers: 4 });
    const gates = await harness.startGates({}, undefined, (request, chat) => mimoRefusesPositions(request) ?? scripted(request, chat));
    expect(await ended(await harness.previewRunner(gates, "resend", SHAPE_SETTINGS), debate)).toBe("JUDGE_SCHEMA_FAILURE");
    await mimoRefusedAlone(debate.runId);
  }, 600_000);

  it("shape off: today's opening argues every seat, so there is no spare", async () => {
    const debate = await harness.admittedRun("shape-off", { panelRefs: PANEL_REFS, pin: MIMO_SECOND, depth: 1 });
    const scripted = scriptedAnswers(debate.question);
    const gates = await harness.startGates({}, undefined, (request, chat) => mimoRefusesPositions(request) ?? scripted(request, chat));
    expect(await ended(await harness.previewRunner(gates, "resend", {}), debate)).toBe("JUDGE_SCHEMA_FAILURE");
    await mimoRefusedAlone(debate.runId);
  }, 600_000);
});
