// V4 start step, Task 56 ("Let the AIs carry on to the report"; owner ruling 3 Nov, evening; decision record answer 9), against the REAL API
// of tests/support/r22-world.ts with the step before Start switched on (the room, the plan windows, the public lane and the reports as
// apps/api/src/main.ts composes them, on the product's own logins) and the REAL runner, whose story stage marks a ticked first debate DUE.
// A person ticks the box at Start; once the first debate settles, `world.api.carryOnTick()` (main.ts runs it every whole minute) digs
// once into each path's top suggestion through the person's own dig step, then presses "Write my report" through their own report step.
// No vendor is contacted (scripted gates, the search stand-in); every name, question and figure is made up. Integration suites are
// skipped by the CI gate: run this file by hand, alone.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartPathsSchema, type Answer, type PathId, type StartPaths } from "@debateai/contract";
import { PostgresDigPicksRunnerRepository, PostgresPublicDebateRunnerRepository, PostgresPublicTreeRepository, RunRepository } from "@debateai/db";
import { topDigSuggestionOf } from "../../apps/api/src/carry-on.js";
import { COOKIE_SESSION_MARKER, createDebate } from "../../apps/ui/lib/api.js";
import { TEST_OWNER_BILLING_PLANS } from "../support/hostedRegisterRows.js";
import { FREE, PREMIUM, newDebateCatalog, panelAgrees, type V4AskSettings } from "../support/r22-pages.js";
import { driveStartStep, topPathsChoice } from "../support/start-step-cases.js";
import { startR22World, type R22Account, type R22World } from "../support/r22-world.js";

// The page's ask settings (r22-pages.ts reads them the same way): the website's own "@/" module, loaded by name, typed here.
const websiteModule = async <T>(path: string): Promise<T> => import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<T>;
const { v4AskConfig } = await websiteModule<{ v4AskConfig: (mode: "quick" | "thorough", level: "plain", settings: V4AskSettings, at: Date,
  catalog: Record<string, string>) => Record<string, unknown> }>("../../apps/ui/lib/v4/askConfig.ts");

// A world of its own for each case: a fresh site day (the made-up day's ceiling carries one case's paid debates and digs, not every
// case's), and no case's marks left for another case's tick.
let world: R22World;
beforeEach(async () => {
  world = await startR22World({ startStep: "ON" });
  world.setScript(panelAgrees);
}, 900_000);
afterEach(async () => { await world?.stop(); });

const READING = "plain" as const;
/** The made-up credits of tests/support/hostedRegisterRows.ts (multiples of eleven): one charge this size uses a month up. */
const FREE_MONTH_MICROS = 440_000;
/**
 * The paid plan the digging scenarios run on. The made-up register's Plus day (11% of its made-up credit) leaves less than one premium
 * dig's share beyond the reserve it keeps, and the stand-in's menu holds fewer than five paths for Plus's four list writers, so they run
 * on MAX (seven list writers, the same rules); Plus's own case is the one where its day stops the first dig. The month wall's case runs
 * on PRO: MAX's made-up month is larger than the made-up site day (110 dollars), so using it up would stop the site's day first.
 */
const PAID = "MAX" as const;
const PAID_PLAN = TEST_OWNER_BILLING_PLANS.plans.find((plan) => plan.plan_id === PAID)!;
const WALL_PLAN = TEST_OWNER_BILLING_PLANS.plans.find((plan) => plan.plan_id === "PRO")!;
const ZERO = { begun: 0, digs: 0, pressed: 0, waiting: 0 };
const pathIds = (count: number): PathId[] => Array.from({ length: count }, (_, at) => `b${String(at + 1)}` as PathId);
const q = async <T extends Record<string, unknown>>(sql: string, values: readonly unknown[]): Promise<T[]> =>
  (await world.database.pool.query<T>(sql, [...values])).rows;

/** A question with paths, as the page starts it: the lists read at Next, the AIs' top paths at How wide `width` (fewer: `keep`), the box. */
async function startPathDebate(who: R22Account, question: string, options: Readonly<{ settings: V4AskSettings; width: number; keep?: number;
  carryOn: boolean; freePublicNotice?: boolean; rename?: Readonly<{ at: number; title: string }> }>): Promise<Readonly<{ runId: string; paths: StartPaths }>> {
  const drive = await driveStartStep(who.client, { questionLine: question, siteLanguage: "en", readingLevel: READING });
  if (drive.check === null || drive.menu === null) throw new Error("CARRY_ON_TEST_NO_MENU");
  const top = topPathsChoice(drive, options.width);
  if (top === null || top.paths.length < (options.keep ?? options.width)) throw new Error("CARRY_ON_TEST_MENU_TOO_SMALL");
  const kept = top.paths.slice(0, options.keep ?? options.width)
    .map((path, at) => options.rename?.at === at ? { ...path, title: options.rename.title } : path);
  const paths = StartPathsSchema.parse({ ...top, paths: kept,
    ...(options.keep === undefined && options.rename === undefined ? {} : { chosen_by: "PERSON" }) });
  const { id } = await createDebate(question, v4AskConfig("quick", READING, options.settings, new Date(), newDebateCatalog), COOKIE_SESSION_MARKER,
    who.client, undefined, undefined, undefined, options.freePublicNotice === true ? { freePublicNotice: true } : undefined,
    { startCheck: { ref: drive.check.check_ref }, startPaths: paths, ...(options.carryOn ? { carryOnToReport: true as const } : {}) });
  return { runId: id, paths };
}

const markOf = async (runId: string): Promise<string> => (await q<{ mark: string }>("SELECT core.read_carry_on_mark($1) AS mark", [runId]))[0]!.mark;
const runsOf = async (who: R22Account): Promise<string[]> => (await q<{ run_id: string }>(
  "SELECT run_id::text AS run_id FROM core.run WHERE asker_id = $1 ORDER BY run_id", [`owner:${who.ownerRef}`])).map((row) => row.run_id);
/** The digs of a debate, in the order they started: each one's places and mode (0131's link). */
const digsOf = async (parentRunId: string) => q<{ run_id: string; places: string[]; mode: string }>(
  "SELECT child_run_id::text AS run_id, places, mode FROM identity.dig_link WHERE parent_run_id = $1 ORDER BY created_at, child_run_id", [parentRunId]);
/** 0133's closings of the investigation a debate is the root of, and 0136's report rows of it. */
const closingsOf = async (rootRunId: string): Promise<number> => Number((await q<{ n: string }>(
  "SELECT count(*)::text AS n FROM identity.investigation_closing AS c JOIN identity.investigation AS i USING (investigation_id) WHERE i.root_run_id = $1",
  [rootRunId]))[0]!.n);
const reportRowsOf = async (rootRunId: string): Promise<number> => Number((await q<{ n: string }>(
  "SELECT count(*)::text AS n FROM identity.investigation_report WHERE root_run_id = $1", [rootRunId]))[0]!.n);
/** The publication a debate is the public root of (0147's read), or undefined. */
const publicationOf = async (rootRunId: string): Promise<string | undefined> => {
  const tree = await new PostgresPublicTreeRepository(world.runtimePool).readTreeOfRun(rootRunId);
  return tree === null || tree.dig_update_id !== null ? undefined : tree.publication_ref;
};
/** 0147's public report versions of a public debate, in order. */
const publicReportsOf = async (rootRunId: string) => q<{ writer_ref: string; report_version: number; outcome: string | null }>(
  "SELECT writer_ref::text AS writer_ref, report_version, outcome FROM identity.public_report WHERE publication_ref = $1 ORDER BY report_version",
  [await publicationOf(rootRunId) ?? randomUUID()]);

/** Every queued debate to its end; every one COMPLETED (or PAUSED, where a test says so). */
async function settleAll(): Promise<void> {
  const done = await world.settle();
  expect(done.map((job) => (job.result as { kind?: unknown } | null)?.kind)).toEqual(done.map(() => "COMPLETED"));
}

/** One queued job, by its run, taken out of the line (a test runs it, or holds it back). */
function takeJob(runId: string): { runId: string; workItemId: string } {
  const at = world.queue.findIndex((job) => job.runId === runId);
  if (at === -1) throw new Error("CARRY_ON_TEST_NO_JOB");
  return world.queue.splice(at, 1)[0]!;
}

/** A made-up charge on the person's own debate today, of `micros`; its spend id. */
async function charge(runId: string, micros: number): Promise<string> {
  const spendId = randomUUID();
  await world.database.pool.query(`INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, recorded_at)
    VALUES ($1,'RUN',$2,'provider-1',(now() AT TIME ZONE 'UTC')::date,$3,1,1,'BODY',now())`, [spendId, runId, micros]);
  return spendId;
}

/** The month's reset, as tests/integration/r22-end-to-end.test.ts path 7 makes it: the made-up charge no longer counts (the row, gone). */
async function reset(spendId: string): Promise<void> {
  const seed = await world.database.pool.connect();
  try {
    await seed.query("BEGIN"); await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query("DELETE FROM ledger.model_spend WHERE spend_id=$1", [spendId]); await seed.query("COMMIT");
  } finally { seed.release(); }
}

/** A press as the page sends it (the session cookies and the CSRF header), with its status. */
async function post(who: R22Account, path: string): Promise<Readonly<{ status: number; body: unknown }>> {
  const response = await who.send(`${world.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": who.identity.rawCsrfToken }, body: "{}" });
  return { status: response.status, body: await response.json() as unknown };
}

/** The first debate's answer and each path's top suggestion, as the map shows them. */
async function topsOf(who: R22Account, runId: string, count: number): Promise<Readonly<{ answer: Answer; tops: ReturnType<typeof topDigSuggestionOf>[] }>> {
  const answer = await who.client.readRunAnswer(runId);
  return { answer, tops: pathIds(count).map((pathId) => topDigSuggestionOf(answer, pathId)) };
}

/** A run's model calls at a `WEB:` call site (the ledger's own record of each call). */
const webCallsOf = async (runId: string): Promise<string[]> => (await q<{ call_site_key: string }>(
  "SELECT call_site_key FROM ledger.ledger_entry WHERE run_id = $1 AND action_kind = 'MODEL_CALL' AND call_site_key LIKE 'WEB:%' ORDER BY sequence",
  [runId])).map((row) => row.call_site_key);
/** A run's 0134 pause events, in order, and its work items' states. */
const pauseEventsOf = async (runId: string) => (await q<{ kind: string; reason: string | null }>(
  "SELECT kind, reason FROM identity.run_pause_event WHERE run_id = $1 ORDER BY event_no", [runId])).map((row) => [row.kind, row.reason]);
const workStatesOf = async (runId: string): Promise<string[]> => (await q<{ state: string }>(
  "SELECT state FROM core.work_item WHERE run_id = $1", [runId])).map((row) => row.state);

/** Each dig's picks (0135), opened on the runner's pool (the reader 0135 grants it). */
const picksOf = (digRunId: string) => new PostgresDigPicksRunnerRepository(world.runnerPool).read(digRunId);

describe("Task 56 on the real API: the AIs carry on to the report", () => {
  it("without the box: the debate settles, nothing is marked, the tick does nothing", async () => {
    const ana = await world.account("carry-none", PAID);
    const { runId } = await startPathDebate(ana, "Should Harbour Town paint the ferry blue?", { settings: PREMIUM, width: 5, carryOn: false });
    // Task 57c (independent review, 5 Nov): on the real API each charge before Start names the question's try, and Start gave every one
    // of them to this debate (0165), so a failure would give them back. The stand-in answers every list at once: nothing is charged after.
    const tries = await q<{ run_id: string | null }>(`SELECT t.run_id::text AS run_id FROM identity.pre_start_charge AS c
      LEFT JOIN identity.pre_start_try AS t USING (charge_id) WHERE c.owner_ref = $1`, [ana.ownerRef]);
    expect(tries.length).toBeGreaterThan(0);
    expect(tries.map((row) => row.run_id)).toEqual(tries.map(() => runId));
    await settleAll();
    expect(await markOf(runId)).toBe("NONE");
    const before = await runsOf(ana);
    expect(await world.api.carryOnTick()).toEqual(ZERO);
    expect(await runsOf(ana)).toEqual(before);
    expect(await closingsOf(runId)).toBe(0);
  }, 900_000);

  it("five paths, the box ticked: five digs, one per path's top suggestion, then one report once they settle", async () => {
    const ana = await world.account("carry-five", PAID);
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town build a second lighthouse?", { settings: PREMIUM, width: 5, carryOn: true });
    await settleAll();
    expect(await markOf(root)).toBe("DUE");
    const { tops } = await topsOf(ana, root, 5);
    expect(tops.every((top) => top !== null)).toBe(true);
    const before = await runsOf(ana);
    // Made-up figures only: each dig's share as the carry-on measured it, and the site's day so far (printed to read a failure by).
    // A runner beside the API takes each dig as it starts: the made-up gate's pot (9.5 dollars) holds only four premium digs' booked
    // estimates at once (the next case shows the fifth refused while four still run), so the digs started so far settle before the
    // carry-on measures the next one; the last one is still running when the tick presses.
    const shares: number[] = [];
    const share = world.askRoom.digShareMicros.bind(world.askRoom);
    const spy = vi.spyOn(world.askRoom, "digShareMicros").mockImplementation(async (question) => {
      if (shares.length > 0) await settleAll();
      const value = await share(question); shares.push(value); return value;
    });
    let tick: unknown;
    try {
      tick = await world.api.carryOnTick();
    } finally {
      spy.mockRestore();
    }
    const day = (await q<{ total: string }>("SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE charged_on = (now() AT TIME ZONE 'UTC')::date", []))[0]!.total;
    console.info(`SEEN 56 five paths: tick ${JSON.stringify(tick)}; dig shares ${shares.join(",")}; site day spent ${day} (made-up)`);
    expect(tick).toEqual({ begun: 1, digs: 5, pressed: 0, waiting: 1 });
    const digs = await digsOf(root);
    expect((await runsOf(ana)).filter((run) => !before.includes(run)).sort()).toEqual(digs.map((dig) => dig.run_id).sort());
    expect(digs.map((dig) => [dig.places, dig.mode])).toEqual(pathIds(5).map((pathId) => [[`path:${pathId}`], "quick"]));
    for (const [at, dig] of digs.entries()) {
      const picks = await picksOf(dig.run_id);
      expect(picks?.positionRef).toBe(`b${String(at + 1)}`);
      expect(picks?.picks.map((pick) => ({ kind: pick.kind, suggestion_id: pick.suggestionId, text: pick.text, author: pick.author })))
        .toEqual([{ kind: tops[at]!.kind, suggestion_id: tops[at]!.suggestion_id, text: tops[at]!.text, author: "AI_SUGGESTION" }]);
      expect((await new RunRepository(world.fixtureSuperuserPool).readStoredAsk(dig.run_id))?.askContract).not.toHaveProperty("carry_on_to_report");
      expect(await markOf(dig.run_id)).toBe("NONE");
    }
    expect(await markOf(root)).toBe("BEGUN");
    expect(await closingsOf(root)).toBe(0);
    await settleAll();
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await closingsOf(root)).toBe(1);
    expect(await markOf(root)).toBe("DONE");
    await settleAll();
    const read = await ana.client.readInvestigation(root);
    expect(read.versions.map((version) => ({ report_version: version.report_version, state: version.state }))).toEqual([{ report_version: 1, state: "READY" }]);
    const version = read.versions[0]!;
    const dossier = "paths" in version ? (version.paths ?? []).map((path) => path.path_id) : [];
    expect(dossier).toEqual(expect.arrayContaining(pathIds(5)));
    for (let tick = 0; tick < 2; tick += 1) expect(await world.api.carryOnTick()).toEqual(ZERO);
    expect(await closingsOf(root)).toBe(1);
    expect(await reportRowsOf(root)).toBe(1);
  }, 1_800_000);

  it("the gate's pot refuses the fifth dig while four still run: the carry-on stops there, and the report goes on the four", async () => {
    const ana = await world.account("carry-pot", PAID);
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town widen the harbour mouth?", { settings: PREMIUM, width: 5, carryOn: true });
    await settleAll();
    const errors = vi.spyOn(console, "error");
    try {
      expect(await world.api.carryOnTick()).toEqual({ begun: 1, digs: 4, pressed: 0, waiting: 1 });
      expect(errors.mock.calls.map(([line]) => String(line)))
        .toContain(JSON.stringify({ event: "api.carry_on.stopped", stop: "REFUSED", code: "DAILY_COST_ENVELOPE_REACHED" }));
    } finally {
      errors.mockRestore();
    }
    expect((await digsOf(root)).map((dig) => dig.places)).toEqual(pathIds(4).map((pathId) => [`path:${pathId}`]));
    await settleAll();
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await closingsOf(root)).toBe(1);
    expect(await markOf(root)).toBe("DONE");
    await settleAll();
    expect((await ana.client.readInvestigation(root)).versions.map((version) => version.state)).toEqual(["READY"]);
    expect(await digsOf(root)).toHaveLength(4);
  }, 1_800_000);

  it("a path whose branch FAILED gets no dig: four digs on the other paths, then one report", async () => {
    const ana = await world.account("carry-failed", PAID);
    const failing = "Made-up path three that never gets an answer";
    // The third path's answer-so-far writer (its own title in the material) never sends a draft, so that path ends FAILED and the
    // debate still answers.
    world.setScript((contract, request, chat, field) => contract === "path.outcome.v1" && chat.includes(failing)
      ? { content: "no draft here" } : panelAgrees(contract, request, chat, field));
    try {
      const { runId: root } = await startPathDebate(ana, "Should Harbour Town open the old fort to visitors?", { settings: PREMIUM, width: 5, carryOn: true,
        rename: { at: 2, title: failing } });
      await settleAll();
      const { answer } = await topsOf(ana, root, 5);
      expect(answer.branches?.paths.map((path) => path.state)).toEqual(["ARGUED", "ARGUED", "FAILED", "ARGUED", "ARGUED"]);
      expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 4 });
      expect((await digsOf(root)).map((dig) => dig.places)).toEqual([["path:b1"], ["path:b2"], ["path:b4"], ["path:b5"]]);
      await settleAll();
      expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
      expect(await closingsOf(root)).toBe(1);
      await settleAll();
    } finally {
      world.setScript(panelAgrees);
    }
  }, 1_800_000);

  it("two digs settling together, then one report; two ticks at once press one report", async () => {
    for (const label of ["carry-two-a", "carry-two-b"]) {
      const ana = await world.account(label, PAID);
      const { runId: root } = await startPathDebate(ana, `Should Harbour Town rebuild the ${label === "carry-two-a" ? "north" : "south"} jetty?`,
        { settings: PREMIUM, width: 3, keep: 2, carryOn: true });
      await settleAll();
      expect(await world.api.carryOnTick()).toEqual({ begun: 1, digs: 2, pressed: 0, waiting: 1 });
      expect(world.queue).toHaveLength(2);
      // Both digs settle at once: two passes of the runner side by side, each taking one.
      await Promise.all([world.settle(), world.settle()]);
      if (label === "carry-two-a") {
        expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
      } else {
        // As two releases' ticks at a switch: both press, 0133's close numbers one version, and both read it as WRITING.
        const ticks = await Promise.all([world.api.carryOnTick(), world.api.carryOnTick()]);
        expect(ticks).toEqual([{ begun: 0, digs: 0, pressed: 1, waiting: 0 }, { begun: 0, digs: 0, pressed: 1, waiting: 0 }]);
      }
      expect(await closingsOf(root)).toBe(1);
      await settleAll();
      expect(await reportRowsOf(root)).toBe(1);
    }
  }, 1_800_000);

  it("stops early when the day's share runs out: two digs (the reserve kept), NO_ROOM, then the report on the reserve", async () => {
    const ana = await world.account("carry-share", PAID);
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town put solar panels on the fish market?", { settings: PREMIUM, width: 5, carryOn: true });
    await settleAll();
    // Before the first look: a made-up charge on the person's day so that its limit less used is the plan's reserve plus 2.5 digs' share
    // (the dig's whole share: its estimate, its web part and its updates, as the room read shows it).
    const room = world.askRoom;
    const precheck = room.precheck.bind(room);
    const set: { charged: number; share: number; question: Parameters<typeof room.precheck>[0] | null } = { charged: 0, share: 0, question: null };
    const spy = vi.spyOn(room, "precheck").mockImplementationOnce(async (question) => {
      set.question = question;
      set.share = await room.digShareMicros(question);
      const day = (await precheck(question)).personUses.find((use) => use.scope === "PERSON_DAY")!;
      set.charged = day.limitMicros - day.usedMicros - PAID_PLAN.reserve_micros! - Math.floor(2.5 * set.share);
      expect(set.charged).toBeGreaterThan(0);
      await charge(root, set.charged);
      return precheck(question);
    });
    const errors = vi.spyOn(console, "error");
    try {
      expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 2, pressed: 0, waiting: 1 });
      expect(errors.mock.calls.some(([line]) => String(line).includes("NO_ROOM"))).toBe(true);
    } finally {
      spy.mockRestore();
      errors.mockRestore();
    }
    expect((await digsOf(root)).map((dig) => dig.places)).toEqual([["path:b1"], ["path:b2"]]);
    await settleAll();
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    await settleAll();
    const read = await ana.client.readInvestigation(root);
    expect(read.versions.map((version) => version.state)).toEqual(["READY"]);
    // The reserve is intact: after the two digs' charges the day and the week still have at least the reserve left beyond what is used,
    // and the month (whose limit already leaves the reserve out) is not past its limit.
    expect(set.question).not.toBeNull();
    const uses = (await world.askRoom.precheck(set.question!)).personUses;
    for (const use of uses) {
      expect(use.limitMicros - use.usedMicros, use.scope).toBeGreaterThanOrEqual(use.scope === "PERSON_MONTH" ? 0 : PAID_PLAN.reserve_micros!);
    }
  }, 1_800_000);

  // The stand-in gates always leave some point resting on reasoning alone (a judge's LOOKED_UP without a source reads as REASONING), so
  // every path offers a code-found suggestion and a debate with none cannot be built here (tests/unit/carry-on.test.ts covers it). The
  // same outcome, no dig and the report in the same tick, comes on Plus, whose made-up day has no room for one dig beyond its reserve.
  it("no dig at all (Plus's day has no room beyond the reserve): the report in the same tick, written on the reserve", async () => {
    const ana = await world.account("carry-bare", "PLUS");
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town keep the tide clock?", { settings: PREMIUM, width: 3, carryOn: true });
    await settleAll();
    const { tops } = await topsOf(ana, root, 3);
    expect(tops.every((top) => top !== null)).toBe(true);
    const errors = vi.spyOn(console, "error");
    try {
      expect(await world.api.carryOnTick()).toEqual({ begun: 1, digs: 0, pressed: 1, waiting: 0 });
      expect(errors.mock.calls.some(([line]) => String(line).includes("NO_ROOM"))).toBe(true);
    } finally {
      errors.mockRestore();
    }
    expect(await digsOf(root)).toEqual([]);
    expect(await closingsOf(root)).toBe(1);
    await settleAll();
    expect((await ana.client.readInvestigation(root)).versions.map((version) => version.state)).toEqual(["READY"]);
  }, 1_800_000);

  it("the month wall pauses a dig, never stops it: the report goes on without it, and the dig stays PAUSED", async () => {
    const ana = await world.account("carry-wall", WALL_PLAN.plan_id);
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town move the bandstand?", { settings: PREMIUM, width: 3, carryOn: true });
    await settleAll();
    expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 3 });
    const [b1, b2, b3] = await digsOf(root);
    const held = takeJob(b2!.run_id);
    await settleAll();
    // b1's and b3's digs settled; now the person's month is at its wall, and b2's dig meets it at its search.
    await charge(root, WALL_PLAN.monthly_credit_micros);
    world.queue.push(held);
    const done = await world.settle();
    expect(done.map((job) => [job.runId, job.result])).toEqual([[b2!.run_id, { kind: "MONTH_PAUSED" }]]);
    const paused = await ana.client.readRun(b2!.run_id);
    expect(paused.month_pause).toBeDefined();
    expect(paused.state).not.toBe("FAILED");
    expect(await pauseEventsOf(b2!.run_id)).toEqual([["PAUSED", "MONTH_WALL"]]);
    expect(await workStatesOf(b2!.run_id)).not.toContain("FAILED");
    expect([b1?.places, b3?.places]).toEqual([["path:b1"], ["path:b3"]]);
    // A dig paused at the month wall does not hold the report back.
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await closingsOf(root)).toBe(1);
    expect((await ana.client.readRun(b2!.run_id)).state).not.toBe("FAILED");
    expect(await pauseEventsOf(b2!.run_id)).toEqual([["PAUSED", "MONTH_WALL"]]);
  }, 1_800_000);

  it("signed out: the digs still run, as the person; a suspended account: no dig, and its report once it is active again", async () => {
    const ana = await world.account("carry-signed-out", PAID);
    const { runId: root } = await startPathDebate(ana, "Should Harbour Town ring the harbour bell at noon?", { settings: PREMIUM, width: 3, carryOn: true });
    await settleAll();
    await world.database.pool.query("UPDATE identity.session SET revoked_at = clock_timestamp() WHERE session_id = $1", [ana.identity.authenticated.session.session_id]);
    expect(await world.api.carryOnTick()).toEqual({ begun: 1, digs: 3, pressed: 0, waiting: 1 });
    expect((await digsOf(root)).map((dig) => dig.mode)).toEqual(["quick", "quick", "quick"]);
    await settleAll();
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await closingsOf(root)).toBe(1);
    await settleAll();

    const bea = await world.account("carry-suspended", PAID);
    const { runId: second } = await startPathDebate(bea, "Should Harbour Town sell the old pilot boat?", { settings: PREMIUM, width: 3, carryOn: true });
    await settleAll();
    await world.database.pool.query("UPDATE identity.session SET revoked_at = clock_timestamp() WHERE user_id = $1", [bea.userId]);
    await world.database.pool.query(`UPDATE identity."user" SET state = 'suspended' WHERE user_id = $1`, [bea.userId]);
    // Task 56e (owner answer 11: "If the account is no longer active, the digs stop and the report is still written"): the claim takes
    // the debate (BEGUN) without handing it to a dig pass, so no dig ever starts for it. The person's own report step writes only for an
    // active account, so while it is suspended nothing is pressed and nothing is closed.
    expect(await world.api.carryOnTick()).toEqual(ZERO);
    expect(await markOf(second)).toBe("BEGUN");
    expect(await world.api.carryOnTick()).toEqual(ZERO);
    expect(await markOf(second)).toBe("BEGUN");
    expect(await closingsOf(second)).toBe(0);
    // Active again: the report is written, once, on the first debate alone; still no dig.
    await world.database.pool.query(`UPDATE identity."user" SET state = 'active' WHERE user_id = $1`, [bea.userId]);
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await markOf(second)).toBe("DONE");
    expect(await closingsOf(second)).toBe(1);
    await settleAll();
    expect(await reportRowsOf(second)).toBe(1);
    expect(await world.api.carryOnTick()).toEqual(ZERO);
    expect(await digsOf(second)).toEqual([]);
    expect(await closingsOf(second)).toBe(1);
  }, 1_800_000);

  it("Free with the public notice: it waits for the public decision, then one public dig, then the debate's first report on the reserve", async () => {
    const cleo = await world.account("carry-free-public");
    const question = "Should Harbour Town paint the lifeboat station red?";
    const { runId: root } = await startPathDebate(cleo, question, { settings: FREE, width: 3, carryOn: true, freePublicNotice: true });
    // The debate itself, without the servers' timers: DUE, while the Free sweep has not decided its public way.
    await world.composed.runner.executeWorkItem(takeJob(root).workItemId);
    expect(await markOf(root)).toBe("DUE");
    expect(await world.api.carryOnTick()).toEqual(ZERO);
    await settleAll();
    const searched = world.search.counts().searches;
    // A public contribution keeps no mode (0131's link is an own dig's; the public tree's join takes none): the mode the carry-on's
    // dig asked, as the room read it.
    const modes: unknown[] = [];
    const share = world.askRoom.digShareMicros.bind(world.askRoom);
    const spy = vi.spyOn(world.askRoom, "digShareMicros").mockImplementation(async (question) => { modes.push(question.dig?.mode); return share(question); });
    try {
      expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(modes).toEqual(["quick"]);
    const contributions = await q<{ dig_run_id: string }>("SELECT dig_run_id::text AS dig_run_id FROM identity.public_contribution WHERE root_run_id = $1", [root]);
    expect(contributions).toHaveLength(1);
    const contribution = await new PostgresPublicDebateRunnerRepository(world.runnerPool).readContribution(contributions[0]!.dig_run_id);
    expect(contribution).not.toBeNull();
    expect(contribution?.position_ref).toBe("b1");
    await settleAll();
    expect(world.search.counts().searches).toBe(searched);
    expect(await webCallsOf(contributions[0]!.dig_run_id)).toEqual([]);
    // The month used up after the dig settled: the debate's first report still goes, on the kept reserve.
    await charge(root, FREE_MONTH_MICROS);
    const errors = vi.spyOn(console, "error");
    try {
      expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
      expect(errors.mock.calls.some(([line]) => String(line).includes("PUBLIC_DEBATE_WAITS_FOR_RESET"))).toBe(false);
    } finally {
      errors.mockRestore();
    }
    expect((await publicReportsOf(root)).map((row) => [row.writer_ref, row.report_version])).toEqual([[cleo.ownerRef, 1]]);
    expect(await closingsOf(root)).toBe(0);
    await settleAll();
    // A further report waits for the reset.
    expect(await post(cleo, `/v1/runs/${root}/report`)).toEqual({ status: 409,
      body: { error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" } });
  }, 1_800_000);

  // On a world with the step before Start, a Free question without the notice is refused (Task 36's Free notice lock), so the private
  // Free debate is one whose public way the sweep refused: recorded as the sweep records a refused check (0137's refuse_free_publication).
  it("Free whose debate stays private (its public way refused): one private dig, no search, then the report", async () => {
    const dora = await world.account("carry-free-private");
    const question = "Should Harbour Town rename the east quay?";
    const { runId: root } = await startPathDebate(dora, question, { settings: FREE, width: 3, carryOn: true, freePublicNotice: true });
    await world.composed.runner.executeWorkItem(takeJob(root).workItemId);
    expect(await new PostgresPublicDebateRunnerRepository(world.runtimePool).refuseFree(root)).toBe("RECORDED");
    await settleAll();
    expect(await publicationOf(root)).toBeUndefined();
    const searched = world.search.counts().searches;
    expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 1 });
    const digs = await digsOf(root);
    expect(digs.map((dig) => [dig.places, dig.mode])).toEqual([[["path:b1"], "quick"]]);
    await settleAll();
    expect(world.search.counts().searches).toBe(searched);
    expect(await webCallsOf(digs[0]!.run_id)).toEqual([]);
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await closingsOf(root)).toBe(1);
    await settleAll();
  }, 1_800_000);

  it("Free public, a visitor's report first and the month used up: the carry-on's report waits for the reset, and writes nothing", async () => {
    const eva = await world.account("carry-free-visited");
    const dan = await world.account("carry-visitor");
    const question = "Should Harbour Town light the pier at night?";
    const { runId: root } = await startPathDebate(eva, question, { settings: FREE, width: 3, carryOn: true, freePublicNotice: true });
    await settleAll();
    const publicRef = await publicationOf(root);
    expect(publicRef).toBeDefined();
    expect(await world.api.carryOnTick()).toMatchObject({ begun: 1, digs: 1 });
    await settleAll();
    expect(await post(dan, `/v1/public/debates/${publicRef!}/report`)).toEqual({ status: 202, body: { state: "WRITING", report_version: 1 } });
    await settleAll();
    const used = await charge(root, FREE_MONTH_MICROS);
    for (let tick = 0; tick < 2; tick += 1) expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 0, waiting: 1 });
    expect((await publicReportsOf(root)).filter((row) => row.writer_ref === eva.ownerRef)).toEqual([]);
    expect(await markOf(root)).toBe("BEGUN");
    // After the reset the next tick presses: the person's own report, the debate's next version.
    await reset(used);
    expect(await world.api.carryOnTick()).toEqual({ begun: 0, digs: 0, pressed: 1, waiting: 0 });
    expect(await markOf(root)).toBe("DONE");
    expect((await publicReportsOf(root)).map((row) => [row.writer_ref, row.report_version])).toEqual([[dan.ownerRef, 1], [eva.ownerRef, 2]]);
    await settleAll();
    expect(await world.api.carryOnTick()).toEqual(ZERO);
  }, 1_800_000);
});
