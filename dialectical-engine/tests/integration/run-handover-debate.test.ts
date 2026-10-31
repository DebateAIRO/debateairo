// Plan 2026-10-31 decision 12 — A PAUSED DEBATE CONTINUES ACROSS AN UPLOAD (owner Q6: "keep whatever the AI 'found' until that
// point"). On real PostgreSQL, with the preview harness's scripted vendors and a hosted runner's REAL money guard, one encrypted
// owner's debate: paused at the month wall under release A and A's wording, the month resets, a new release B is current, Continue
// hands the debate over, B's runner finishes it under B's wording.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { CostEnvelopeGuard, PostgresModelSpendStore, type PersonWindow } from "@debateai/budget";
import { PostgresDigModelRepository, PostgresDigModelRunnerRepository, migrate, recordReleaseEvent, recordReleaseSwitch } from "@debateai/db";
import type { ProviderCallRequest, ProviderCostEnvelopeSeam } from "@debateai/providers";
import { continuePausedRun, runHandoverOf } from "../../apps/api/src/month-pause.js";
import { MonthPause, monthPaused } from "../../apps/runner/src/month-pause.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import {
  PANEL_REFS, TARGETS, previewDebateHarness, type PreviewRunnerMoney
} from "../support/preview-debate-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
const LIMIT = 5_000_000;
const RESERVE = 200_000;
const TOLERANCE = 200_000;
const EDGE = LIMIT - RESERVE;
/** Release keys of one settings version, as a code-only upload makes them: each test's own pair (a switch is for ever). */
const keyOf = (version: number, letter: string, n: number) => `r${String(version)}-${letter.repeat(11)}${(n % 16).toString(16)}`;
let scenario = 0;

/** What another release's sealed wording sent: other bytes, under another contract hash. */
const OLD_HASH = "older-release-sealed-contracts";
const oldWording = (request: ProviderCallRequest): ProviderCallRequest => ({
  ...request, contractHash: OLD_HASH,
  packet: { ...request.packet, messages: request.packet.messages.map((message, index) => index === 0
    ? { ...message, content: `Older wording of this instruction.\n${message.content}` } : message) }
});

function months(runSpent: () => Promise<number>) {
  const now = Date.now();
  const first = Object.freeze({ periodStart: new Date(now - 10 * 86_400_000), resetsAt: new Date(now + 3_600_000) });
  const second = Object.freeze({ periodStart: first.resetsAt, resetsAt: new Date(first.resetsAt.getTime() + 30 * 86_400_000) });
  const state = { month: 1 as 1 | 2, wallDue: false, earlier: 0, spentAtReset: 0 };
  const window = (): PersonWindow => Object.freeze({
    scope: "PERSON_MONTH" as const, limitMicros: LIMIT, ...(state.month === 1 ? first : second),
    finishBasisPoints: 10_000, closeBasisPoints: 9_500, finishOverflowMicros: TOLERANCE, keepsReserveMicros: RESERVE
  });
  const spentInMonth = async (): Promise<number> => {
    const spent = await runSpent();
    if (state.month === 2) return spent - state.spentAtReset;
    if (state.wallDue && state.earlier === 0) state.earlier = EDGE - spent;
    return state.earlier + spent;
  };
  return {
    state, first, second, spentInMonth, persons: { read: async () => Object.freeze([window()]) },
    async reset() { state.spentAtReset = await runSpent(); state.month = 2; }
  };
}

function hostedMoney(runId: () => string, pause: MonthPause, wall: ReturnType<typeof months>, store: PostgresModelSpendStore) {
  const guard = new CostEnvelopeGuard({
    store, policy: { perRunCeilingMicros: 50_000_000, dailyCeilingMicros: Number.MAX_SAFE_INTEGER },
    sharedWall: { finishBasisPoints: null, persons: wall.persons,
      owners: { readRunChargeOwnerRef: async () => owner!.ownerRef, readOwnerSpentMicros: async () => wall.spentInMonth() } },
    inFlight: createRunInFlight()
  });
  const storySeam: ProviderCostEnvelopeSeam = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
  const money: PreviewRunnerMoney = {
    buildCostEnvelopeSeam: () => (seamRunId, phase, sharedWall) => monthPaused(
      guard.providerSeam({ runId: seamRunId, price: PRICE, requireReportedUsage: true, phase, sharedWall }),
      { runId: seamRunId, phase, sharedWall: sharedWall ?? "APPLY", pause, plannedMicros: () => guard.bodyMicrosLeft(runId()) }),
    buildStoryCostEnvelopeSeam: () => () => storySeam,
    providerPrices: new Map(TARGETS.map((target) => [target.providerRef, PRICE]))
  };
  return money;
}

const ok = async (runId: string) => (await database.pool.query<{ key: string; actor: string; sequence: string; contract: string }>(
  `SELECT call_site_key AS key, actor_ref AS actor, sequence::text AS sequence, contract_hash AS contract FROM ledger.ledger_entry AS entry
    WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK' ORDER BY entry.sequence`, [runId])).rows;
const spendTotal = async (runId: string) => (await database.pool.query<{ n: number; total: string }>(
  `SELECT count(*)::int AS n, coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE run_id=$1 AND spend_source='RUN'`, [runId])).rows[0]!;
const holds = async (runId: string) => (await database.pool.query<{ n: number }>(
  `SELECT count(*)::int AS n FROM ledger.model_spend_hold WHERE run_id=$1`, [runId])).rows[0]!.n;
const answers = async (runId: string) => (await database.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM serve.answer WHERE run_id=$1`, [runId])).rows[0]!.n;
const item = async (id: string) => (await database.pool.query<{ state: string; terminal_reason: string | null }>(
  `SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1`, [id])).rows[0]!;
/** The panel a site belongs to: the site without the member's route (`preview:<model>`) and seat. */
const panelKey = (key: string) => key.replace(/:preview:.*$/u, "");

type Scene = Awaited<ReturnType<typeof pausedUnderReleaseA>>;

/** One debate under release A and A's wording, paused at the wall after the `wallAfter`'th answer of that kind. */
async function pausedUnderReleaseA(label: string, wallAfter: Readonly<{ kind: "REVIEW" | "PANEL"; count: number }>) {
  scenario += 1;
  const pool = database.pool;
  const store = new PostgresModelSpendStore(pool);
  const versionOfRun = async (runId: string) => (await pool.query<{ v: number }>(`SELECT register_version::integer AS v FROM core.run WHERE run_id=$1`, [runId])).rows[0]!.v;
  const firstStamp = keyOf(1, "a", scenario);
  const probe = await harness.admittedRun(`${label} probe`, { panelRefs: PANEL_REFS, depth: 2, owner: owner!, releaseKey: firstStamp });
  const version = await versionOfRun(probe.runId);
  const releaseA = keyOf(version, "a", scenario);
  const releaseB = keyOf(version, "b", scenario);
  const debate = await harness.admittedRun(label, { panelRefs: PANEL_REFS, depth: 2, owner: owner!, releaseKey: releaseA });
  await pool.query("UPDATE core.work_item SET state='FAILED', terminal_reason='TEST_PROBE' WHERE run_id=$1", [probe.runId]);
  // The hold the room opened when it admitted the debate (the harness composes no room).
  await pool.query("INSERT INTO ledger.model_spend_hold (hold_id, run_id, held_micros, opened_at) VALUES (gen_random_uuid(), $1, 1000000, clock_timestamp())", [debate.runId]);
  const wall = months(() => store.readRunSpentMicros(debate.runId));
  const pause = new MonthPause({ store: new PostgresDigModelRunnerRepository(pool) });
  const money = hostedMoney(() => debate.runId, pause, wall, store);
  const scripted = scriptedAnswers(debate.question);
  let seen = 0;
  const gates = await harness.startGates({}, undefined, (request, chat) => {
    if (request.kind === wallAfter.kind && wall.state.month === 1) {
      seen += 1;
      if (seen === wallAfter.count) wall.state.wallDue = true;
    }
    return scripted(request, chat);
  });
  const underA = await harness.previewRunner(gates, "resend", { money, releaseKey: releaseA, reword: oldWording });
  await expect(underA.runner.executeWorkItem(debate.workItemId)).resolves.toEqual({ kind: "MONTH_PAUSED" });
  const answeredUnderA = await ok(debate.runId);
  expect(answeredUnderA.length).toBeGreaterThan(0);
  expect(answeredUnderA.every((call) => call.contract === OLD_HASH)).toBe(true);
  const paidUnderA = await spendTotal(debate.runId);
  expect(await holds(debate.runId)).toBe(1);

  // The upload: B is current, A drains. The month resets.
  // (An earlier scene's upload has finished draining: one drain at a time.)
  await recordReleaseEvent(pool, { releaseKey: releaseB, kind: "STAGED", recordedBy: "test" });
  const current = (await pool.query<{ release_key: string }>("SELECT release_key FROM core.read_current_release()")).rows[0]?.release_key ?? null;
  for (const { release_key: drained } of (await pool.query<{ release_key: string }>("SELECT release_key FROM core.release_state_v WHERE state = 'DRAINING'")).rows) {
    await pool.query("SELECT core.record_release_event($1, 'RETIRED', 'test', 'DRAINED')", [drained]);
  }
  await recordReleaseSwitch(pool, { newReleaseKey: releaseB, expectedCurrent: current, takeTrafficFrom: new Date(), recordedBy: "test" });
  await wall.reset();
  return { pool, store, debate, wall, money, gates, version, releaseA, releaseB, answeredUnderA, paidUnderA, underA };
}

function continueIn(scene: Scene) {
  const pauses = new PostgresDigModelRepository(scene.pool);
  const handover = runHandoverOf({ ownReleaseKey: scene.releaseB, readRunReleaseNow: (runId) => pauses.readRunReleaseNow(runId),
    versionPassed: async () => true, activeVersion: async () => scene.version,
    resumeInRelease: (ownerRef, runId, key, version) => pauses.resumeInRelease(ownerRef, runId, key, version) });
  return continuePausedRun({ ownerRef: owner!.ownerRef, runId: scene.debate.runId, now: new Date(scene.wall.second.periodStart.getTime() + 1_000) },
    pauses, { monthHasRoom: async () => true }, undefined, undefined, handover);
}

it("a debate paused under one contract hash continues under another: answered calls are not re-sent or re-paid, the rest run under the new wording, one hold", async () => {
  const scene = await pausedUnderReleaseA("handed over whole", { kind: "REVIEW", count: 3 });
  const { debate, pool } = scene;
  const work = new WorkItemRepository(pool, { releaseKey: scene.releaseB });
  const workA = new WorkItemRepository(pool, { releaseKey: scene.releaseA });

  // Before Continue the debate is still A's and is paused: nobody takes it.
  await expect(work.claimById({ workItemId: debate.workItemId, workerId: "b", claimSeconds: 60 })).resolves.toBeNull();
  await expect(workA.claimById({ workItemId: debate.workItemId, workerId: "a", claimSeconds: 60 })).resolves.toBeNull();

  await expect(continueIn(scene)).resolves.toEqual({ kind: "CONTINUING" });
  await expect(continueIn(scene)).resolves.toEqual({ kind: "CONTINUING" });
  expect((await pool.query("SELECT hop, from_release_key, to_release_key FROM identity.run_handover WHERE run_id=$1", [debate.runId])).rows)
    .toEqual([{ hop: 1, from_release_key: scene.releaseA, to_release_key: scene.releaseB }]);

  // The older release never touches it again, even restarted, and its runner refuses by the fence.
  await expect(workA.claimById({ workItemId: debate.workItemId, workerId: "a", claimSeconds: 60 })).resolves.toBeNull();
  expect((await workA.listDispatchable(100)).map((job) => job.workItemId)).not.toContain(debate.workItemId);
  await expect(scene.underA.runner.executeWorkItem(debate.workItemId)).resolves.toEqual({ kind: "NO_WORK" });
  expect((await work.listDispatchable(100)).map((job) => job.workItemId)).toContain(debate.workItemId);

  const before = scene.gates.arrivals.length;
  const underB = await harness.previewRunner(scene.gates, "resend", { money: scene.money, releaseKey: scene.releaseB });
  await harness.completedRun(underB, debate, scene.gates);
  expect(await item(debate.workItemId)).toMatchObject({ state: "DONE", terminal_reason: null });
  expect(await answers(debate.runId)).toBeGreaterThan(0);

  const all = await ok(debate.runId);
  const lastOfA = Math.max(...scene.answeredUnderA.map((call) => Number(call.sequence)));
  const afterHandover = all.filter((call) => Number(call.sequence) > lastOfA);
  // Nothing answered under A was asked again, though every one of its prompts now reads differently.
  const answeredKeys = new Set(scene.answeredUnderA.map((call) => `${call.key}|${call.actor}`));
  expect(afterHandover.filter((call) => answeredKeys.has(`${call.key}|${call.actor}`)).map((call) => call.key)).toEqual([]);
  // The rest really ran under the new wording.
  expect(afterHandover.length).toBeGreaterThan(0);
  expect(afterHandover.every((call) => call.contract !== OLD_HASH)).toBe(true);
  expect(scene.gates.arrivals.length).toBeGreaterThan(before);
  // A's money stands as charged: each of A's calls has its one charge, and no new hold was opened.
  const paidNow = await spendTotal(debate.runId);
  expect(paidNow.n).toBeGreaterThanOrEqual(scene.paidUnderA.n);
  expect(Number(paidNow.total)).toBeGreaterThanOrEqual(Number(scene.paidUnderA.total));
  expect(await holds(debate.runId)).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id=$1 AND spend_source='RUN'", [debate.runId])).rows[0].n)
    .toBeLessThanOrEqual(all.length);
}, 900_000);

it("a step half-done at the wall re-runs whole under the new wording, never mixed; finished steps stand", async () => {
  // The wall comes after one member of a panel answered, so the next member of that panel is the refused call.
  const scene = await pausedUnderReleaseA("half a panel", { kind: "PANEL", count: 1 });
  const { debate } = scene;
  const panels = scene.answeredUnderA.filter((call) => call.key.startsWith("PANEL:"));
  expect(panels).toHaveLength(1);
  const halfDone = panelKey(panels[0]!.key);

  await expect(continueIn(scene)).resolves.toEqual({ kind: "CONTINUING" });
  const underB = await harness.previewRunner(scene.gates, "resend", { money: scene.money, releaseKey: scene.releaseB });
  await harness.completedRun(underB, debate, scene.gates);

  const all = await ok(debate.runId);
  const lastOfA = Math.max(...scene.answeredUnderA.map((call) => Number(call.sequence)));
  const onStep = all.filter((call) => Number(call.sequence) > lastOfA && panelKey(call.key) === halfDone);
  // Asked again, the member that answered under A among them, and every answer of that step under B's wording.
  expect(onStep.length).toBeGreaterThanOrEqual(2);
  expect(onStep.map((call) => call.actor)).toContain(panels[0]!.actor);
  expect(onStep.every((call) => call.contract !== OLD_HASH)).toBe(true);
  // The non-panel calls before the wall stood: none of them was asked again.
  const finished = scene.answeredUnderA.filter((call) => !call.key.startsWith("PANEL:"));
  expect(finished.length).toBeGreaterThan(0);
  const asked = new Set(all.filter((call) => Number(call.sequence) > lastOfA).map((call) => `${call.key}|${call.actor}`));
  expect(finished.filter((call) => asked.has(`${call.key}|${call.actor}`))).toEqual([]);
  expect(await item(debate.workItemId)).toMatchObject({ state: "DONE" });
}, 900_000);

it("a kill during the hand-over resumes: the handed-over copy dies, the next copy of the new release finishes, nothing asked twice", async () => {
  const scene = await pausedUnderReleaseA("killed after the hand-over", { kind: "REVIEW", count: 2 });
  const { debate, pool } = scene;
  await expect(continueIn(scene)).resolves.toEqual({ kind: "CONTINUING" });

  // The first copy under B dies after a few new calls (its release stops its calls); its claim then lapses.
  const startedWith = (await ok(debate.runId)).length;
  let stopped = false;
  const dying = await harness.previewRunner(scene.gates, "resend", { money: scene.money, releaseKey: scene.releaseB,
    retirement: { claimsStopped: () => false, callsStopped: () => stopped } });
  const watch = setInterval(() => { void ok(debate.runId).then((rows) => { if (rows.length >= startedWith + 2) stopped = true; }); }, 20);
  await dying.runner.executeWorkItem(debate.workItemId).catch(() => undefined).finally(() => { clearInterval(watch); });
  const atKill = await ok(debate.runId);
  expect(atKill.length).toBeGreaterThan(startedWith);
  await pool.query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1 AND state='CLAIMED'", [debate.workItemId]);
  expect((await item(debate.workItemId)).state).toBe("CLAIMED");

  const again = await harness.previewRunner(scene.gates, "resend", { money: scene.money, releaseKey: scene.releaseB });
  await harness.completedRun(again, debate, scene.gates);
  expect(await item(debate.workItemId)).toMatchObject({ state: "DONE" });
  const all = await ok(debate.runId);
  const lastAtKill = Math.max(...atKill.map((call) => Number(call.sequence)));
  const answered = new Set(atKill.map((call) => `${call.key}|${call.actor}`));
  expect(all.filter((call) => Number(call.sequence) > lastAtKill && answered.has(`${call.key}|${call.actor}`)).map((call) => call.key)).toEqual([]);
  expect((await pool.query("SELECT count(*)::int AS n FROM identity.run_handover WHERE run_id=$1", [debate.runId])).rows[0].n).toBe(1);
}, 900_000);
