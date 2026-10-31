// R22 W3-8 — THE MONTH PAUSE IS DURABLE (the money rule, owner 31 Oct 2026: "pause any 'future' AI calls/searches … with
// the possibility to resume once the monthly quota is back", resumed "with a click", true resume). On real PostgreSQL,
// with the preview harness's scripted vendors and a hosted runner's REAL money guard (CostEnvelopeGuard with a
// billingPlans v4 month window: its limit, the 20-cent final-answer reserve kept inside it, the 20-cent in-flight
// tolerance), one encrypted owner's debate:
//  1. reaches the month wall while arguing: the pause is recorded (0134, with the planned work's estimate), the copy
//     stops as a planned stop — the work item is released, never FAILED, and no answer is written;
//  2. survives a runner restart: no list re-sends it and a fresh runner cannot claim it (the database keeps it paused);
//  3. Continue before the month's reset is refused, nothing changes;
//  4. after the reset Continue records the resume and wakes the item; the next copy replays every call the first copy
//     got answered (never asked or charged again) and argues to its answer;
//  5. the final answer is written, and the month's spend at the pause never reached into the reserve.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import {
  CostEnvelopeGuard,
  PostgresModelSpendStore,
  type PersonWindow
} from "@debateai/budget";
import { PostgresDigModelRepository, PostgresDigModelRunnerRepository, migrate } from "@debateai/db";
import type { ProviderCostEnvelopeSeam } from "@debateai/providers";
import { continuePausedRun, continuedRunWake } from "../../apps/api/src/month-pause.js";
import { MonthPause, monthPaused } from "../../apps/runner/src/month-pause.js";
import { createRunInFlight } from "../../apps/runner/src/run-in-flight.js";
import type { CallConcurrencyPolicy } from "@debateai/register";
import {
  OWNER_CALL_CONCURRENCY, PANEL_REFS, TARGETS, previewDebateHarness, type PreviewRunnerMoney
} from "../support/preview-debate-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import {
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // ONE encrypted owner: a live private debate (0134 pauses only those), its rows sealed by the pool's content cipher.
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** A paid plan's month (billingPlans v4): $5, its 20-cent final-answer reserve kept inside, the 20-cent in-flight tolerance. */
const LIMIT = 5_000_000;
const RESERVE = 200_000;
const TOLERANCE = 200_000;
const EDGE = LIMIT - RESERVE;
/** The month reaches its wall right after the debate's third review is answered. */
const WALL_AT_REVIEW = 3;

/**
 * The person's months, as the shipped runner reads them (billing-core's v4 windows): the paused month ends an hour from
 * now (0134 refuses a pause whose reset is not ahead), the next one starts then. The month's spend is the person's
 * earlier spend in it plus this debate's RUN spend; the earlier spend is set, once the wall is due, so that the month
 * stands exactly at its edge (the limit less the reserve).
 */
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
    state, first, second, spentInMonth,
    persons: { read: async () => Object.freeze([window()]) },
    /** The month resets: the next window counts only what the debate spends from now on. */
    async reset() { state.spentAtReset = await runSpent(); state.month = 2; }
  };
}

/** A hosted runner's money, as main.ts composes it: each walled call under the month pause, the body room left recorded. */
function hostedMoney(runId: () => string, pause: MonthPause, wall: ReturnType<typeof months>, store: PostgresModelSpendStore) {
  const guard = new CostEnvelopeGuard({
    store,
    policy: { perRunCeilingMicros: 50_000_000, dailyCeilingMicros: Number.MAX_SAFE_INTEGER },
    sharedWall: {
      finishBasisPoints: null, persons: wall.persons,
      owners: { readRunChargeOwnerRef: async () => owner!.ownerRef, readOwnerSpentMicros: async () => wall.spentInMonth() }
    },
    inFlight: createRunInFlight()
  });
  // The story spends its own envelope (spec §8), never walled: not what this file measures.
  const storySeam: ProviderCostEnvelopeSeam = { assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined };
  const money: PreviewRunnerMoney = {
    buildCostEnvelopeSeam: () => (seamRunId, phase, sharedWall) => monthPaused(
      guard.providerSeam({ runId: seamRunId, price: PRICE, requireReportedUsage: true, phase, sharedWall }),
      { runId: seamRunId, phase, sharedWall: sharedWall ?? "APPLY", pause, plannedMicros: () => guard.bodyMicrosLeft(runId()) }),
    buildStoryCostEnvelopeSeam: () => () => storySeam,
    providerPrices: new Map(TARGETS.map((target) => [target.providerRef, PRICE]))
  };
  return { guard, money };
}

const okCalls = async (runId: string) => (await database.pool.query<{ key: string; sequence: string }>(
  `SELECT call_site_key AS key, sequence::text AS sequence FROM ledger.ledger_entry AS entry
    WHERE run_id=$1 AND action_kind='MODEL_CALL' AND outcome='OK' ORDER BY entry.sequence`, [runId])).rows;
const workItemOf = async (workItemId: string) => (await database.pool.query<{ state: string; terminal_reason: string | null;
  lapsed: boolean }>(`SELECT state, terminal_reason, claim_deadline <= clock_timestamp() AS lapsed FROM core.work_item
    WHERE work_item_id=$1`, [workItemId])).rows[0]!;
const answersOf = async (runId: string) => (await database.pool.query<{ n: number }>(
  `SELECT count(*)::int AS n FROM serve.answer WHERE run_id=$1`, [runId])).rows[0]!.n;
const pauseEvents = async (runId: string) => (await database.pool.query<{ kind: string; planned_calls: number | null;
  planned_micros: string | null; resumable_at: Date | null }>(
  `SELECT kind, planned_calls, planned_micros::text, resumable_at FROM identity.run_pause_event WHERE run_id=$1 ORDER BY event_no`,
  [runId])).rows;
const runSpendRows = async (runId: string) => (await database.pool.query<{ n: number; total: string }>(
  `SELECT count(*)::int AS n, coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend
    WHERE run_id=$1 AND spend_source='RUN'`, [runId])).rows[0]!;

/** One debate paused at the wall, a restart, Continue before and after the reset, and the resumed debate to its answer. */
async function pausedAndResumed(label: string, callConcurrency?: CallConcurrencyPolicy): Promise<void> {
  const serial = callConcurrency === undefined;
  const pool = database.pool;
  const store = new PostgresModelSpendStore(pool);
  const debate = await harness.admittedRun(label, { panelRefs: PANEL_REFS, depth: 2, owner: owner! });
  const wall = months(() => store.readRunSpentMicros(debate.runId));
  const pause = new MonthPause({ store: new PostgresDigModelRunnerRepository(pool) });
  const { money } = hostedMoney(() => debate.runId, pause, wall, store);
  const scripted = scriptedAnswers(debate.question);
  let reviews = 0;
  const gates = await harness.startGates({}, undefined, (request, chat) => {
    if (request.kind === "REVIEW" && wall.state.month === 1) {
      reviews += 1;
      // This review is answered (the vendor has it); the month stands at its wall for the debate's NEXT walled call.
      if (reviews === WALL_AT_REVIEW) wall.state.wallDue = true;
    }
    return scripted(request, chat);
  });

  // 1. The wall: the pause is recorded and the copy stops as a planned stop.
  const runnerOptions = { money, ...(serial ? {} : { callConcurrency }) };
  const first = await harness.previewRunner(gates, "resend", runnerOptions);
  await expect(first.runner.executeWorkItem(debate.workItemId)).resolves.toEqual({ kind: "MONTH_PAUSED" });
  // Calls already sent when the copy stopped (calls together) are never awaited by it; their answers still land and are
  // recorded, as a stopped copy's do. Wait until every request is answered, then the record is still for a second.
  const inFlightAtStop = gates.arrivals.filter((arrival) => arrival.kind !== "PROBE" && arrival.answeredAt === null).length;
  const settleBy = Date.now() + 30_000;
  for (let last = -1, stillSince = Date.now(); ;) {
    const now = (await okCalls(debate.runId)).length;
    if (now !== last) { last = now; stillSince = Date.now(); }
    if (gates.arrivals.every((arrival) => arrival.answeredAt !== null) && Date.now() - stillSince >= 1_000) break;
    if (Date.now() > settleBy) throw new Error("test: the stopped copy's calls did not settle within 30 s");
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  if (serial) expect(inFlightAtStop).toBe(0);
  const paused = await pauseEvents(debate.runId);
  expect(paused).toHaveLength(1);
  expect(paused[0]).toMatchObject({ kind: "PAUSED", planned_calls: 1 });
  expect(paused[0]!.resumable_at?.getTime()).toBe(wall.first.resetsAt.getTime());
  // The planned work's estimate: the run's body room left when it paused (its ceiling less what it had spent).
  const spentAtPause = Number((await runSpendRows(debate.runId)).total);
  const plannedMicros = Number(paused[0]!.planned_micros);
  if (serial) expect(plannedMicros).toBe(50_000_000 - spentAtPause);
  else expect(plannedMicros).toBeGreaterThanOrEqual(50_000_000 - spentAtPause);
  expect(await workItemOf(debate.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, lapsed: true });
  expect(await answersOf(debate.runId)).toBe(0);
  // The reserve is untouched: the month stood at its edge (the limit less the 20-cent reserve); only calls already in
  // flight when it got there (calls together) finished past it, within the 20-cent tolerance.
  if (serial) expect(await wall.spentInMonth()).toBe(EDGE);
  expect(await wall.spentInMonth()).toBeGreaterThanOrEqual(EDGE);
  expect(await wall.spentInMonth()).toBeLessThanOrEqual(EDGE + TOLERANCE);
  const firstCopy = await okCalls(debate.runId);
  expect(firstCopy.length).toBeGreaterThan(0);
  const lastOfFirstCopy = Math.max(...firstCopy.map((call) => Number(call.sequence)));

  // 2. A runner restart changes nothing: nothing re-sends the debate, and a fresh runner cannot claim it.
  const work = new WorkItemRepository(pool);
  expect((await work.listDispatchable(100)).map((item) => item.workItemId)).not.toContain(debate.workItemId);
  expect((await work.listLapsedClaimed(100)).map((item) => item.workItemId)).not.toContain(debate.workItemId);
  const restarted = await harness.previewRunner(gates, "resend", runnerOptions);
  await expect(restarted.runner.executeWorkItem(debate.workItemId)).resolves.toEqual({ kind: "NO_WORK" });
  expect(await workItemOf(debate.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, lapsed: true });
  expect(await okCalls(debate.runId)).toEqual(firstCopy);

  // 3. Continue before the month's reset: refused with the reset, nothing recorded, nobody woken.
  const pauses = new PostgresDigModelRepository(pool);
  const dispatched: Readonly<{ runId: string; workItemId: string }>[] = [];
  const wake = continuedRunWake({
    claimableWorkItemOf: (runId) => work.claimableWorkItemOfRun(runId),
    dispatch: async (job) => { dispatched.push(job); }
  });
  const room = { monthHasRoom: async () => wall.state.month === 2 };
  const continueAt = (now: Date) => continuePausedRun({ ownerRef: owner!.ownerRef, runId: debate.runId, now }, pauses, room, wake);
  expect(await continueAt(new Date())).toEqual({ kind: "UNTIL_RESET", until: wall.first.resetsAt.toISOString() });
  expect((await pauseEvents(debate.runId)).map((event) => event.kind)).toEqual(["PAUSED"]);
  expect(dispatched).toEqual([]);
  // Another account's press finds nothing.
  expect(await continuePausedRun({ ownerRef: "00000000-0000-4000-8000-000000000000", runId: debate.runId,
    now: new Date(wall.second.periodStart.getTime() + 1_000) }, pauses, room, wake)).toEqual({ kind: "NOT_FOUND" });

  // 4. The month resets; Continue records the resume and wakes the item; a second press is idempotent.
  await wall.reset();
  const afterReset = new Date(wall.second.periodStart.getTime() + 1_000);
  expect(await continueAt(afterReset)).toEqual({ kind: "CONTINUING" });
  expect(dispatched).toEqual([{ runId: debate.runId, workItemId: debate.workItemId }]);
  expect(await continueAt(afterReset)).toEqual({ kind: "CONTINUING" });
  expect((await pauseEvents(debate.runId)).map((event) => event.kind)).toEqual(["PAUSED", "RESUMED"]);
  expect((await work.listLapsedClaimed(100)).map((item) => item.workItemId)).toContain(debate.workItemId);

  // The woken copy (the restarted runner) replays what the first copy got answered and argues to its answer.
  const resumed = await harness.completedRun(restarted, debate, gates);
  expect(await answersOf(debate.runId)).toBeGreaterThan(0);
  expect(await workItemOf(debate.workItemId)).toMatchObject({ state: "DONE", terminal_reason: null });

  // 5. Nothing finished is paid twice: no call site the first copy got answered is asked again (one call at a time:
  // nothing was in flight at the wall; calls together: their answers were recorded too), and every answered call was
  // charged exactly once.
  const all = await okCalls(debate.runId);
  const before = new Set(firstCopy.map((call) => call.key));
  const askedAgain = all.filter((call) => Number(call.sequence) > lastOfFirstCopy && before.has(call.key)).map((call) => call.key);
  expect(askedAgain).toEqual([]);
  expect(all.length).toBeGreaterThan(firstCopy.length);
  // (The verdict story spends its own STORY envelope, not counted here.)
  expect((await runSpendRows(debate.runId)).n).toBe(all.filter((call) => !call.key.startsWith("STORY:")).length);
  // The answer was written in the new month; the paused month's spend never passed its edge.
  expect(resumed.kind).toBe("COMPLETED");
  expect(wall.state.earlier + spentAtPause).toBeLessThanOrEqual(EDGE + TOLERANCE);
}

it("one call at a time: a debate paused at the month wall stays paused across a runner restart, Continue is refused before the reset, and after it the debate resumes without paying twice and writes its answer", async () => {
  await pausedAndResumed("month_pause_serial");
}, 900_000);

it("calls together: the same, the calls in flight at the wall finishing within the tolerance and never paid twice", async () => {
  await pausedAndResumed("month_pause_together", OWNER_CALL_CONCURRENCY);
}, 900_000);
