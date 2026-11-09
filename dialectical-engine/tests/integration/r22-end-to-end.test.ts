// W5-4: R22's V4 pages against the REAL API, with scripted AIs and a scripted search (tests/support/r22-world.ts says exactly what is real and what is scripted).
// Each path sends what the page sends (createDebate over v4AskConfig, the typed client, lib/v4/load.ts, lib/v4/publicPage.ts) over real HTTP, and feeds what comes back
// through the page's own builders (buildV4Map, publicPathViews), so the mock in tools/v4-mock-api can hide no contract mismatch here. No vendor is contacted; all data is made up.
// Integration suites are skipped by the CI gate: run this file by hand, alone.
// V4 start step, Task 88: the world runs with the step before Start switched on, so paths 1-12 run on v2 (an ask without paths builds
// its own list, RUN_BUILT), and paths 13-19 drive the step as the page does: the lists, the merge and the page's own path plan
// (apps/ui/lib/v4/pathPlan.ts), then Start, over real HTTP. Path 19 is the public side of a debate started from its lists.
import { PREVIEW_UNFINISHED_RUNS_SQL } from "../../apps/api/src/preview-budget-estimate.js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StartPathsSchema, type StartListsEvent, type StartPathChoice } from "@debateai/contract";
import { PostgresModelSpendStore } from "@debateai/budget";
import { START_STEP_TIMING, startRestatesMainQuestion } from "@debateai/map";
import { loadV4, loadInvestigation, writeReport, reopenInvestigation, currentReportVersion, loadDigTrail } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { pathWebOf, sourcesOf, webNoteOf } from "../../apps/ui/lib/v4/web.js";
import { askParentOf, digSuggestionsWithMore, ownViewPick, pathSuggestionsOf, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { pathPlanCombineMembers, pathPlanFromMenu, pathPlanReduce, pathPlanToStartPaths, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import type { DigTarget, V4Path } from "../../apps/ui/lib/v4/types.js";
import { stubJudgement, type GateRequest } from "../support/preview-gate-stubs.js";
import { driveStartStep, topPathsChoice, type StartStepDrive } from "../support/start-step-cases.js";
import { publicDigAsk, publicPathViews } from "../../apps/ui/lib/v4/publicPage.js";
import { composeQuestion, purposeLinesOfGoal } from "../../apps/ui/lib/v4/askText.js";
import { canonicalPublicReviewBinding, groundFieldsOf } from "../../apps/api/src/staff/public-review.js";
import { PostgresPublicReviewRepository } from "@debateai/db";
import { TEAM_FEATURE_PLAN_ID, readAbuseLimits } from "@debateai/register";
import { readWebRunPlan } from "../../apps/runner/src/run-settings.js";
import { canonicalTeamLimitActionBinding } from "../../apps/api/src/staff/team-limit.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { startR22World, type R22Account, type R22Script, type R22World } from "../support/r22-world.js";
import { ask, FREE, newDebateCatalog, panelAgrees, PREMIUM, v4Catalog, type V4AskSettings } from "../support/r22-pages.js";

// This one uses the website's own "@/" paths and modules, which only the website's typecheck resolves (as apps/ui/lib/v4/load.ts says of lib/v3): loaded by name, typed here. Vitest resolves it as the page does.
const websiteModule = async <T>(path: string): Promise<T> => import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<T>;
const { handleInvestigationReportRequest } = await websiteModule<{ handleInvestigationReportRequest: (input: unknown) => Promise<Response> }>("../../apps/ui/lib/report/reportRoute.ts");

let world: R22World;
const lines: string[] = [];
// V4 start step, Task 88: the world runs with the step before Start switched on (Task 86), so paths 1-12 run on v2 and 13-19 drive the step.
beforeAll(async () => { world = await startR22World({ startStep: "ON", log: (line) => { lines.push(line); } }); }, 900_000);
afterAll(async () => { await world?.stop(); });

/** The debate page's first read and its map, with the page's own code. */
async function readPage(who: R22Account, runId: string) {
  const load = await loadV4(runId, who.client);
  if (load.kind !== "SERVED") throw new Error(`page still waiting: ${load.run.state} ${String(load.run.terminal_reason)}`);
  return { answer: load.answer, story: load.story, map: buildV4Map({ runId, answer: load.answer, story: load.story }) };
}

const opening = (text: string): string => text.slice(0, text.indexOf(".") + 1);
const pagesOf = (field: (name: string) => string | undefined) => JSON.parse(field("pages") ?? "[]") as { page_id: string; text?: string }[];
/** How many path planners have answered (each plans its own pair). */
let pathPlans = 0;
/** The planner searches a pair per path; the readers quote each page's first sentence, as a real reader of the made-up pages could. */
const webReplies: R22Script = (contract, request, _chat, field) => {
  // A case writer that reads a pack cites its first extract: a point the page shows with its source.
  if (request.kind === "JUDGE") {
    const id = /S[1-9][0-9]*-[1-9][0-9]*/u.exec(field("sources") ?? "")?.[0];
    if (id !== undefined) return { content: JSON.stringify({ ...JSON.parse(stubJudgement("A point the page reports, with its figure.")) as object, way_of_knowing: "LOOKED_UP", locator: id }) };
  }
  if (contract === null) return null;
  // V4 start step, Task 88: on a path debate each path has its own planner (web.plan-dig.v3, a dig's word for word, at WEB:plan:<n>): a
  // pair of its own (the same words from two paths would be one search).
  if (contract === "web.plan-dig.v3") {
    pathPlans += 1;
    return { content: JSON.stringify({ country: null, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: `harbour pier evidence for path ${String(pathPlans)}` },
        { side: "against", local: false, query: `harbour pier evidence against path ${String(pathPlans)}` }] }) };
  }
  if (contract.startsWith("web.plan.")) {
    const answers = JSON.parse(field("answers") ?? "[]") as { answer_id: string }[];
    return { content: JSON.stringify({ country: null, answers: answers.map((answer, index) => ({ answer_id: answer.answer_id, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: `harbour pier evidence for ${String(index)}` }, { side: "against", local: false, query: `harbour pier evidence against ${String(index)}` }] })) }) };
  }
  if (contract.startsWith("web.read-all")) return { content: JSON.stringify({ pages: pagesOf(field).map((page) => ({ page_id: page.page_id, grade: 2, adds: "It adds a figure.", note: "The page reports one figure.", extracts: [opening(page.text ?? "")] })) }) };
  if (contract.startsWith("web.read-top")) return { content: JSON.stringify({ pages: pagesOf(field).map((page) => ({ page_id: page.page_id, grade: 3, extracts: [opening(page.text ?? "")] })), worth_looking_into: ["Winter ridership numbers."] }) };
  return null;
};

const both = (...scripts: readonly R22Script[]): R22Script => (contract, request, chat, field) => {
  for (const script of scripts) { const reply = script(contract, request, chat, field); if (reply !== null) return reply; }
  return null;
};
const webScript = both(panelAgrees, webReplies);
let writes = 0;
/** Every rewrite and climb says something new, so each one really changes its path; `unchangedAfter` makes the rest come out the same. */
const changing = (): R22Script => (contract, _request, _chat, field) => {
  if (contract === null || !contract.startsWith("path-rewrite.writer")) return null;
  const path = JSON.parse(field("path") ?? "{}") as { points?: { ref: string }[] };
  const digPaths = JSON.parse(field("dig_paths") ?? "[]") as { ref: string; points?: { ref: string }[] }[];
  const refs = [...(path.points ?? []), ...digPaths.flatMap((digPath) => digPath.points ?? [])].map((point) => point.ref);
  const own = (JSON.parse(field("picks") ?? "[]") as { marked: string }[]).some((pick) => pick.marked !== "AI_SUGGESTION");
  writes += 1;
  return { content: JSON.stringify({ line: `This path now holds for the case written in draft number ${String(writes)}.`, summary: `The follow-up debate changed this path in draft number ${String(writes)}.`,
    what_changed: [{ text: `The follow-up debate added a reason in draft number ${String(writes)}.`, rests_on: [refs[0] ?? "P1"] }], fate: "HELD_UP",
    view: own ? { outcome: "NOT_SETTLED", scope: "PATH", reason: "The person's view was weighed against the follow-up debate." } : null,
    dig_paths: digPaths.map((digPath) => ({ position_ref: digPath.ref, line: `A dig path line in draft number ${String(writes)}.`, fate: "HELD_UP" })) }) };
};
const spendOf = async (runId: string): Promise<number> => Number((await world.database.pool.query<{ total: string }>("SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE run_id=$1", [runId])).rows[0]!.total);
const listedRef = async (question: string): Promise<string | undefined> => (await world.stranger.readPublicDebates(50, 0) as unknown as { items: { public_ref: string; question: string }[] }).items.find((item) => item.question === question)?.public_ref;
/** What each path saw, in plain words, in the run's log. */
const saw = (path: string, what: string): void => { console.info(`SEEN ${path}: ${what}`); };

/**
 * Security review F2 (0171): a dig's own row, and whether it was written in its run's own transaction (one xmin): the statement that creates the run
 * writes it, so it is there whatever the route does after the submit (the world composes an account-memory store, which no longer writes it).
 * Null: no row.
 */
const markedAtCreation = async (runId: string): Promise<boolean | null> => (await world.database.pool.query<{ same: boolean }>(
  "SELECT mark.xmin::text = run.xmin::text AS same FROM identity.dig_run AS mark JOIN core.run AS run USING (run_id) WHERE mark.run_id=$1", [runId])).rows[0]?.same ?? null;

/** What the start-of-debate estimate still holds right now: a finished dig must not be here, or a few digs refuse the next question. */
const heldByEstimate = async (): Promise<number> => (await world.database.pool.query(PREVIEW_UNFINISHED_RUNS_SQL, [true, 3600])).rows.length;

// V4 start step, Task 88: what paths 13-19 read beside the pages.
/** Every model call's site key on the run, in the ledger's order. */
const runSites = async (runId: string): Promise<readonly string[]> => (await world.database.pool.query<{ call_site_key: string }>(
  "SELECT call_site_key FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL' ORDER BY sequence", [runId])).rows.map((row) => row.call_site_key);
/** The calls before Start booked to the person (0158), each with its ledger row: the kind, the person's cost, the row's source and run. */
const preStart = async (ownerRef: string) => (await world.database.pool.query<{ kind: string; charge_micros: string; spend_source: string | null; run_id: string | null }>(
  `SELECT c.kind, c.charge_micros::text AS charge_micros, s.spend_source, s.run_id::text AS run_id
     FROM identity.pre_start_charge AS c LEFT JOIN ledger.model_spend AS s ON s.spend_id = c.charge_id WHERE c.owner_ref=$1 ORDER BY c.recorded_at`, [ownerRef])).rows;
/** Who chose the run's sealed paths (0159): PERSON or AIS; null: no set. */
const chosenByOf = async (runId: string): Promise<string | null> => (await world.database.pool.query<{ chosen_by: string }>(
  "SELECT chosen_by FROM core.start_path_set WHERE run_id=$1", [runId])).rows[0]?.chosen_by ?? null;
/** What the lists are read with at Next: the line, the page's language and the reading level the ask config sends ("plain"). */
const readOf = (questionLine: string) => Object.freeze({ questionLine, siteLanguage: "en" as const, readingLevel: "plain" as const });
/** A maker's or a model's name as the roster, the declared targets and the gates spell them. */
const MAKER_OR_MODEL = /z\.ai|zai-org|glm|deepseek|xiaomi|mimo|alibaba|qwen|anthropic|claude|haiku|deepinfra/iu;
/** The first maker or model name in a lists stream, its signed references left out (random text that could spell anything); null: none. */
const nameIn = (events: readonly StartListsEvent[]): string | null =>
  MAKER_OR_MODEL.exec(JSON.stringify(events, (key, value: unknown) => key === "ref" || key === "check_ref" ? undefined : value))?.[0] ?? null;
/** A list past the cut (START_STEP_TIMING.cutAtMs, 30 s today: 35 s), well before the lists' hard cap, so it comes late. */
const LATE_MS = START_STEP_TIMING.cutAtMs + 5_000;
/** A delay for the list calls of the models `late` names; every other call is answered at once. */
const listsLate = (late: (model: string) => boolean) => (request: GateRequest): number => request.kind === "START_LIST" && late(request.model) ? LATE_MS : 0;
/**
 * Paths 14 and 17's Free merge: every suggestion a path of its own (the doubles' grouping), one "Another way to see it" card and both
 * one-tap suggestions, "Combine?" for the first two paths and "fits path 1" for the last. Under two suggestions: the doubles' own merge.
 */
const mergeWithCardAndSuggestions: R22Script = (contract, _request, _chat, field) => {
  if (contract !== "start.merge.v1") return null;
  const ids = (JSON.parse(field("suggestions") ?? "[]") as { id: string }[]).map((one) => one.id);
  if (ids.length < 2) return null;
  return { content: JSON.stringify({ repeats: [], paths: ids.map((id) => ({ ids: [id], title: null, question: null })),
    cards: [{ kind: "WHAT_WOULD_CHANGE_IT", sentence: "Cheaper tickets in winter could change who takes the ferry at all.", title: "Winter ticket prices",
      question: "Would cheaper winter tickets change who takes the ferry?", fits_path: null, as_question: null }],
    suggestions: [{ kind: "COMBINE", paths: [1, 2], reason: "Both paths look at the same people from two sides." }, { kind: "FITS", path: ids.length, into: 1 }] }) };
};
/** Path 14's fit: the person's own view fits inside the first path it is given (the doubles' own fit says none). */
const fitsFirst: R22Script = (contract, _request, _chat, field) => contract !== "start.fit.v1" ? null
  : { content: JSON.stringify({ fits: (JSON.parse(field("paths") ?? "[]") as { key: string }[])[0]?.key ?? null }) };

/** The page's path plan after one change (pathPlanReduce): a change it refuses, or one that changes nothing, fails the path. */
function changed(plan: PathPlan, action: PathPlanAction): PathPlan {
  const result = pathPlanReduce(plan, action);
  expect(result.refusal, action.type).toBeNull();
  expect(result.plan, action.type).not.toBe(plan);
  return result.plan;
}
/** The key of the one path on the list still being written (after a Combine, before the AI's words). */
function writingKey(plan: PathPlan): string {
  const writing = plan.paths.filter((path) => path.wording === "WRITING");
  expect(writing).toHaveLength(1);
  return writing[0]!.key;
}
/**
 * A path being written, as the page asks for it (useStartPaths' combine): its members, the line the lists were read with, the check and
 * the menu's id; the AI's words and reference go into the plan.
 */
async function combined(who: R22Account, drive: StartStepDrive, plan: PathPlan, key: string): Promise<PathPlan> {
  const path = plan.paths.find((one) => one.key === key)!;
  const answer = await who.client.startPathCombine({
    context: { kind: "MENU", question_line: drive.read.questionLine, check_ref: drive.check!.check_ref, menu_id: drive.menu!.menu.menu_id },
    reading_level: drive.read.readingLevel, members: [...pathPlanCombineMembers(path)] });
  if (answer.source !== "AI") throw new Error(`the combine answered none: ${answer.reason}`);
  return changed(plan, { type: "COMBINE_WRITTEN", key, title: answer.title, question: answer.question, combineRef: answer.combine_ref });
}

describe("R22 on the real API", () => {
  const QUESTION = "Should Harbour Town build a second ferry pier?";
  let ana: R22Account; let firstRun: string; let digRun: string; let publicRef: string; let publicQuestion: string; let bea: R22Account;

  /** What the V4 map's dig bar sends: the question from the picks, the parent from the same target; returns the dig's run. */
  async function dig(who: R22Account, parentRun: string, path: V4Path, picks: ReadonlyArray<ReturnType<typeof ownViewPick>>, parentQuestion: string, settings: V4AskSettings = PREMIUM) {
    const target: DigTarget = { kind: "picks", path, picks };
    const parent = askParentOf(parentRun, target, "quick");
    expect(parent).not.toBeNull();
    return (await ask(who, digQuestion(target, parentQuestion, v4Catalog, "en"), { parent: parent!, settings })).id;
  }

  it("path 1: a paid question: clarify, Start with the answers, web search stand-in, sources under points, search status per path", async () => {
    world.setScript(webScript);
    ana = await world.account("ana", "PLUS");
    const clarify = await ana.client.clarifyAsk({ question_line: QUESTION });
    expect(clarify.source).toBe("AI");
    if (clarify.source !== "AI") throw new Error("unreachable");
    const purpose = clarify.purpose!;
    expect(purpose.answers.length).toBeGreaterThanOrEqual(2);
    const chosen = purpose.answers[0]!;
    const goal = { answers: [{ question: purpose.text, answer: chosen }], matters: "", angles: [] } as never;
    const started = await ask(ana, composeQuestion(QUESTION, goal, newDebateCatalog), { purposeLines: purposeLinesOfGoal(goal)! });
    firstRun = started.id;
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const { answer, map } = await readPage(ana, firstRun);
    expect(answer.question_line).toContain(chosen);
    expect(world.search.counts().searches).toBeGreaterThanOrEqual(4);
    expect(world.search.counts().spentNanoUsd).toBe("0");
    expect(world.stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(map.paths.length).toBeGreaterThanOrEqual(2);
    for (const path of map.paths) {
      const web = pathWebOf(answer, path.id);
      expect(web?.search.status, path.id).toBe("SEARCHED");
      expect(web?.otherPages.length ?? 0, path.id).toBeGreaterThan(0);
    }
    const sourced = answer.nodes.filter((node) => sourcesOf(node).length > 0);
    expect(sourced.length).toBeGreaterThan(0);
    const source = sourcesOf(sourced[0]!)[0]!;
    expect(source.quote.length).toBeLessThanOrEqual(120);
    const sawAnswer = world.stubs.requests.filter((request) => JSON.stringify(request.body).includes(chosen));
    expect(sawAnswer.length).toBeGreaterThan(0);
    saw("1", `clarify AI; answer in the question line; ${String(world.search.counts().searches)} searches, $0; ${String(map.paths.length)} paths SEARCHED; ${String(sourced.length)}/${String(answer.nodes.length)} points with sources, first "${source.quote}" from ${source.site}; chosen answer read by ${[...new Set(sawAnswer.map((request) => request.kind))].join(",")}`);
  }, 300_000);

  it("path 2: Free: the notice, a run with no search, public after the AI check; a refused check stays private", async () => {
    world.setScript(panelAgrees);
    bea = await world.account("bea");
    const searched = world.search.counts().searches;
    publicQuestion = "Should Harbour Town open a winter market?";
    const started = await ask(bea, publicQuestion, { settings: FREE, publicLane: { freePublicNotice: true } });
    await world.settle();
    const { map } = await readPage(bea, started.id);
    expect(world.search.counts().searches).toBe(searched);
    expect(map.paths.length).toBeGreaterThanOrEqual(1);
    publicRef = (await listedRef(publicQuestion))!;
    expect(publicRef).toBeDefined();
    publicRunIds.set(publicRef, started.id);
    const page = await world.stranger.readPublicDebate(publicRef);
    expect(page.question).toBe(publicQuestion);
    expect(page.author_pseudonym).toBe(bea.pseudonym);
    const refusedQuestion = "Should Harbour Town rename the refused square?";
    world.content.refuse = (snapshot) => snapshot.question === refusedQuestion;
    const refused = await ask(bea, refusedQuestion, { settings: FREE, publicLane: { freePublicNotice: true } });
    await world.settle();
    world.content.refuse = () => false;
    expect((await readPage(bea, refused.id)).map.paths.length).toBeGreaterThanOrEqual(1);
    expect(await listedRef(refusedQuestion)).toBeUndefined();
    saw("2", `Free ran with no search, public under ${bea.pseudonym}; refused check kept private and readable by its owner`);
  }, 300_000);

  it("path 3: a dig from a suggestion with the person's own view: the verdict on the view, what the dig changed", async () => {
    world.setScript(both(changing(), webScript));
    const { answer, map } = await readPage(ana, firstRun);
    const path = map.paths[0]!;
    const offered = pathSuggestionsOf(answer, path.id);
    expect(offered.length).toBeGreaterThan(0);
    const view = "My own view: tourists keep the second pier full.";
    digRun = await dig(ana, firstRun, path, [suggestionPick(path.id, offered[0]!), ownViewPick(path.id, view, 0)], answer.question_line);
    // The dig started through POST /v1/asks is marked a dig by its run's creation, before anything else is written for it; its parent is no dig.
    expect([await markedAtCreation(digRun), await markedAtCreation(firstRun)]).toEqual([true, null]);
    await world.settle();
    const child = await readPage(ana, digRun);
    const rewrite = child.answer.dig?.rewrite;
    if (rewrite?.state !== "READY") throw new Error(`the dig's rewrite: ${String(rewrite?.state)}`);
    expect(rewrite.changed).toBe(true);
    expect(rewrite.what_changed.length).toBeGreaterThan(0);
    // "Your point of view": the verdict on the person's own words, and their words as they wrote them.
    expect(rewrite.view).toMatchObject({ outcome: "NOT_SETTLED", own_words: [view] });
    const after = await readPage(ana, firstRun);
    expect(after.map.paths.find((each) => each.id === path.id)?.line).toBe(rewrite.text.line);
    expect(after.answer.path_rewrites?.changed_since.count).toBe(1);
    expect(after.answer.main_answer?.current).toMatchObject({ version: 1, trigger: "PATH_REWRITE", position_ref: path.id });
    // The writer of the update: Haiku (the report's dossier-first form), with no failed try and no backup. A form the stand-in could not read would show as an UNKNOWN request.
    expect(world.stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(lines.filter((line) => line.includes("STORY_BACKUP_USED"))).toEqual([]);
    saw("3", `a suggestion and an own view dug: rewrite READY, changed; "What the dig changed": ${rewrite.what_changed[0]!}; view ${rewrite.view!.outcome} with the person's words; parent path shows the new line; changed_since 1; main answer version 1 (PATH_REWRITE)`);
  }, 300_000);

    it("path 4: a three-level dig, then a chain to level 10 and the refusal at 11; a level 2+ rewrite reads the parent dig's rewrite (decision 1)", async () => {
    const paths: string[] = [];
    const changes = changing();
    world.setScript(both((contract, _request, _chat, field) => { if (contract?.startsWith("path-rewrite.writer") === true) paths.push(field("path") ?? ""); return null; }, changes, panelAgrees));
    let parentRun = digRun;
    let level = 1;
    while (level < 10) {
      const parent = await readPage(ana, parentRun);
      const path = parent.map.paths[0]!;
      paths.length = 0;
      const child = await dig(ana, parentRun, path, [ownViewPick(path.id, `A view at level ${String(level + 1)}.`, 0)], parent.answer.question_line);
      const done = await world.settle();
      expect(done.map((job) => job.result), `level ${String(level + 1)}`).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
      const read = await readPage(ana, child);
      expect(read.answer.dig?.level).toBe(level + 1);
      const rewrite = read.answer.dig?.rewrite;
      expect(rewrite?.state, `rewrite at level ${String(level + 1)}: ${JSON.stringify(rewrite)}`).toBe("READY");
      // Decision 1: the writer read the path above from the parent dig's rewrite (its `dig_paths`), never a story a dig does not have.
      expect(paths.length).toBeGreaterThan(0);
      const parentLine = (JSON.parse(paths[0]!) as { line: string }).line;
      if (parent.answer.dig?.rewrite?.state === "READY") expect(parent.answer.dig.rewrite.dig_paths.map((own) => own.line)).toContain(parentLine);
      parentRun = child;
      level += 1;
      if (level === 3) saw("4", `level 3 READY; the writer read the parent line "${parentLine}" from the parent dig's rewrite`);
    }
    const bottom = await readPage(ana, parentRun);
    const trail = await loadDigTrail(bottom.answer.dig!, ana.client);
    expect(trail.complete).toBe(true);
    expect(trail.steps).toHaveLength(10);
    const path = bottom.map.paths[0]!;
    await expect(dig(ana, parentRun, path, [ownViewPick(path.id, "One level too deep.", 0)], bottom.answer.question_line)).rejects.toMatchObject({ status: 409, serverCode: "DIG_TOO_DEEP" });
    expect(world.queue).toHaveLength(0);
    saw("4", `chain reached level ${String(bottom.answer.dig!.level)}, the trail read back ${String(trail.steps.length)} debates; level 11 refused 409 DIG_TOO_DEEP, nothing started; question line ${String(bottom.answer.question_line.length)} characters`);
  }, 600_000);

  it("path 5: a climb that changes the main answer, and one that stops at an unchanged level (decisions 2, 3)", async () => {
    // The chain above changed every level, so the climb reached the first debate each time: the main answer has moved on.
    const main = (await readPage(ana, firstRun)).answer.main_answer!;
    expect(main.history.length).toBeGreaterThan(1);
    expect(main.current?.trigger).toBe("CHILD_PATH");
    saw("5", `after the chain: main answer version ${String(main.current!.version)}, trigger CHILD_PATH`);
    // A deep dig whose rewrites come out unchanged above it: the climb stops at the first unchanged level and the main answer stays.
    const before = main.current!.version;
    const climbs = () => world.stubs.requests.filter((request) => request.kind === "PATH_REWRITE_WRITER").length;
    world.setScript(both((contract, _request, _chat, field) => {
      if (contract?.startsWith("path-rewrite.writer") !== true) return null;
      const path = JSON.parse(field("path") ?? "{}") as { line: string; summary?: string; fate: string; points?: { ref: string }[] };
      const digPaths = JSON.parse(field("dig_paths") ?? "[]") as { ref: string; points?: { ref: string }[] }[];
      const refs = [...(path.points ?? []), ...digPaths.flatMap((digPath) => digPath.points ?? [])].map((point) => point.ref);
      const own = (JSON.parse(field("picks") ?? "[]") as { marked: string }[]).some((pick) => pick.marked !== "AI_SUGGESTION");
      return { content: JSON.stringify({ line: path.line, summary: path.summary ?? "The path stands as it did.", what_changed: [{ text: "The follow-up debate changed nothing here.", rests_on: [refs[0] ?? "P1"] }], fate: path.fate,
        view: own ? { outcome: "NOT_SETTLED", scope: "PATH", reason: "The person's view was weighed against the follow-up debate." } : null,
        dig_paths: digPaths.map((digPath) => ({ position_ref: digPath.ref, line: "A dig path line.", fate: "HELD_UP" })) }) };
    }, panelAgrees));
    const parent = await readPage(ana, digRun);
    const path = parent.map.paths[0]!;
    const start = climbs();
    const child = await dig(ana, digRun, path, [ownViewPick(path.id, "A view that changes nothing.", 0)], parent.answer.question_line);
    await world.settle();
    expect((await readPage(ana, child)).answer.dig?.rewrite?.state).toBe("READY");
    const asked = climbs() - start;
    expect((await readPage(ana, firstRun)).answer.main_answer!.current!.version).toBe(before);
    saw("5", `an unchanged rewrite: ${String(asked)} writer call, no climb, main answer stays at version ${String(before)}`);
  }, 300_000);

  it("path 6: Write my report, the PDF, a later version; the paths-changed count before and after", async () => {
    world.setScript(both(changing(), panelAgrees));
    const before = (await readPage(ana, firstRun)).answer.path_rewrites!.changed_since;
    expect(before.count).toBeGreaterThan(0);
    expect(before.since_report_version).toBeNull();
    const pressed = await writeReport(firstRun, ana.client);
    expect(pressed.kind).toBe("WRITING");
    await world.settle();
    const investigation = await loadInvestigation(firstRun, ana.client);
    const current = currentReportVersion(investigation);
    expect(current?.report_version).toBe(1);
    const after = (await readPage(ana, firstRun)).answer.path_rewrites!.changed_since;
    expect(after).toMatchObject({ count: 0, since_report_version: 1 });
    const pdf = await handleInvestigationReportRequest({ id: firstRun, sessionCookie: ana.identity.rawSessionToken, interfaceLocale: "en", now: new Date(), signal: AbortSignal.timeout(120_000), client: () => ana.client });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    // Keep digging: a new dig moves the count; a second report is a new version and the first stays.
    expect((await reopenInvestigation(firstRun, ana.client)).kind).toBe("OPEN");
    const page = await readPage(ana, firstRun);
    const path = page.map.paths[1]!;
    await dig(ana, firstRun, path, [ownViewPick(path.id, "A later view on the other path.", 0)], page.answer.question_line);
    await world.settle();
    const moved = (await readPage(ana, firstRun)).answer.path_rewrites!.changed_since;
    expect(moved).toMatchObject({ count: 1, since_report_version: 1 });
    expect((await writeReport(firstRun, ana.client)).kind).toBe("WRITING");
    await world.settle();
    const later = await loadInvestigation(firstRun, ana.client);
    expect(currentReportVersion(later)?.report_version).toBe(2);
    expect(later!.versions.map((version) => version.report_version)).toEqual([1, 2]);
    expect((await readPage(ana, firstRun)).answer.path_rewrites!.changed_since.count).toBe(0);
    saw("6", `changed count ${String(before.count)} before the report, 0 after; PDF ${String(bytes.length)} bytes, %PDF; after Keep digging and a dig, count 1 since version 1; version 2 written, versions [1,2], count 0`);
  }, 300_000);

  it("path 7: a paused debate continuing: the month wall stops it, Continue before the reset is refused, after it the debate goes on and finishes", async () => {
    world.setScript(panelAgrees);
    const caro = await world.account("caro", "PLUS");
    const earlier = await ask(caro, "Should Harbour Town keep the day ferry?");
    await world.settle();
    const started = await ask(caro, "Should Harbour Town keep the night ferry?");
    // The month is used up after the ask got in: one made-up charge on the person's earlier debate, up to the plan's own limit.
    const spent = randomUUID();
    await world.database.pool.query(`INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, recorded_at)
      VALUES ($1,'RUN',$2,'provider-1',(now() AT TIME ZONE 'UTC')::date,7700000,1,1,'BODY',now())`, [spent, earlier.id]);
    const first = await world.settle(1);
    expect(first.map((job) => job.result)).toEqual([{ kind: "MONTH_PAUSED" }]);
    const run = await caro.client.readRun(started.id);
    expect(run.month_pause).toBeDefined();
    const load = await loadV4(started.id, caro.client);
    expect(load.kind).toBe("RUN");
    const refused = await caro.client.continueRun(started.id);
    expect(refused).toMatchObject({ error: "RUN_PAUSED_UNTIL_RESET" });
    const callsAtPause = world.stubs.requests.filter((request) => request.kind !== "PROBE").length;
    // The month's reset: the used-up charge no longer counts (a made-up row, gone, as a new month's window would leave it out).
    const seed = await world.database.pool.connect();
    try {
      await seed.query("BEGIN"); await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query("DELETE FROM ledger.model_spend WHERE spend_id=$1", [spent]);
      await seed.query("UPDATE identity.run_pause_event SET resumable_at = now() - interval '1 minute' WHERE run_id=$1", [started.id]); await seed.query("COMMIT");
    } finally { seed.release(); }
    const continued = await caro.client.continueRun(started.id);
    expect(continued).toEqual({ state: "CONTINUING" });
    const done = await world.settle(1);
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const served = await readPage(caro, started.id);
    expect(served.map.paths.length).toBeGreaterThanOrEqual(2);
    saw("7", `paused at the wall (${String(callsAtPause)} calls so far), Continue refused until ${(refused as { until: string }).until}; after the reset CONTINUING, finished with ${String(served.map.paths.length)} paths; the hand-over across a release is proved by tests/integration/run-handover-debate.test.ts, not here`);
  }, 300_000);

  let dan: R22Account;
  it("path 8: a stranger's dig on a public debate: allowed changes the page under their name; refused stays private and leaves the page", async () => {
    dan = await world.account("dan");
    const changes = changing();
    world.setScript(both(changes, panelAgrees));
    const page = await world.stranger.readPublicDebate(publicRef);
    const views = publicPathViews(page);
    expect(views.length).toBeGreaterThan(0);
    const send = (view: string, who: R22Account = dan) => { const built = publicDigAsk({ publicRef, question: page.question, path: views[0]!, views: [view], catalog: v4Catalog, locale: "en" }); expect(built).not.toBeNull();
      return ask(who, built!.questionLine, { settings: FREE, publicLane: { publicParent: built!.parent } }); };
    const allowed = await send("Winter stalls would need heating.");
    expect(allowed.public_dig_not_joined).toBeUndefined();
    // A stranger's dig on a public debate is a dig from its run's creation too; the public debate it was dug from is none.
    expect([await markedAtCreation(allowed.id), await markedAtCreation(publicRunIds.get(publicRef)!)]).toEqual([true, null]);
    await world.settle();
    const shown = await world.stranger.readPublicDebate(publicRef);
    expect(shown.contributions?.[0]).toMatchObject({ position_ref: views[0]!.ref, contributor: dan.pseudonym, own_rewrite: true });
    const after = publicPathViews(shown);
    expect(after[0]!.line).toBe(shown.contributions![0]!.line);
    expect(after[0]!.additions[0]!.contributor).toBe(dan.pseudonym);
    expect(await spendOf(allowed.id)).toBeGreaterThan(0);
    const contributions = shown.contributions!.length;
    // A check that refuses: the dig stays the digger's own, the page does not move.
    world.setScript(both((contract) => contract === "public.contribution-check.v1" ? { content: JSON.stringify({ verdict: "REFUSE", reason: "CONTENT" }) } : null, changes, panelAgrees));
    const refused = await send("A refused contribution with REFUSED-WORDS.");
    await world.settle();
    const unchanged = await world.stranger.readPublicDebate(publicRef);
    expect(unchanged.contributions).toHaveLength(contributions);
    expect(JSON.stringify(unchanged)).not.toContain("REFUSED-WORDS");
    const own = await readPage(dan, refused.id);
    // Their own page: the rewrite, the plain line, no story, and nothing that names the debate above it.
    expect(own.answer.contribution).toMatchObject({ public_ref: publicRef, state: "KEPT_PRIVATE" });
    expect(own.answer.contribution!.rewrite?.line).toEqual(expect.any(String));
    expect(own.answer.dig).toBeUndefined();
    expect(own.map.storyState).toBe("NONE");
    const ownAllowed = await readPage(dan, allowed.id);
    expect(ownAllowed.answer.contribution).toMatchObject({ public_ref: publicRef, state: "ON_THE_PAGE" });
    expect(ownAllowed.answer.contribution!.rewrite?.line).toBe(shown.contributions![0]!.line);
    expect(ownAllowed.map.storyState).toBe("NONE");
    // Three fields, none a run id, and the first author's run id nowhere on the digger's page.
    expect(JSON.stringify(ownAllowed.answer)).not.toContain(publicRunIds.get(publicRef)!);
    expect(Object.keys(ownAllowed.answer.contribution!).sort()).toEqual(["public_ref", "rewrite", "state"]);
    // The first author's own dig on their own public debate behaves the same.
    const authors = await send("My own second thought, as its author.", bea);
    await world.settle();
    const authorsOwn = await readPage(bea, authors.id);
    expect(authorsOwn.answer.contribution).toMatchObject({ public_ref: publicRef, state: "KEPT_PRIVATE" });
    expect(authorsOwn.answer.contribution!.rewrite?.line).toEqual(expect.any(String));
    expect(authorsOwn.answer.dig).toBeUndefined();
    expect(authorsOwn.map.storyState).toBe("NONE");
    expect(await spendOf(refused.id)).toBeGreaterThan(0);
    expect(await heldByEstimate()).toBe(0);
    saw("8", `allowed: ${String(contributions)} contribution under ${dan.pseudonym}, line "${after[0]!.line}", the digger's run paid ${String(await spendOf(allowed.id))} micros; refused: page unchanged; the digger's own page has their rewrite and the kept-private line, no story; earlier no word of the refusal (no dig part, story WRITING)`);
  }, 300_000);

  // Path 9, a stranger's report on a public debate, is tests/integration/r22-public-report.test.ts (owner, 3 Nov), on the
  // product's own logins since upload check Task 9 fixed the fault it met there.
  const publicRunIds = new Map<string, string>();

  // Paths 10 and 11: the team's side, with tests/integration/public-tree-flow.test.ts's seam: a real elevated staff row and a stored action proof, no passkey and no staff HTTP route.
  let owner: Actor;
  type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;
  const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  async function teamMember(): Promise<Actor> {
    const q = world.database.pool;
    const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
    await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
    await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
    await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
    await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
    await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]]);
    await q.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
    await q.query("INSERT INTO staff.team_limit_holder(staff_id,granted_by_staff_id,granted_operation_id) VALUES($1,$1,$2)", [staffId, randomUUID()]);
    const context = (await world.fixtureSuperuserPool.query("SELECT staff.read_context($1,$2,$3) AS context", [userId, sessionId, hash(privilegeId)])).rows[0].context as Record<string, unknown>;
    return { userId, sessionId, staffId, privilegeId, context };
  }
  type Piece = Readonly<{ kind?: "SNAPSHOT" | "UPDATE"; id?: string; pointer?: string; text?: string }>;
  async function act(actor: Actor, debate: Readonly<{ ref: string; root: string }>, step: "HIDE" | "REPUBLISH" | "CORRECT", piece: Piece = {}) {
    const q = world.database.pool;
    const revision = (await q.query<{ n: number }>("SELECT coalesce(max(revision),0)::int AS n FROM identity.public_review_event WHERE publication_ref=$1", [debate.ref])).rows[0]!.n;
    const operationId = randomUUID();
    const textSha = piece.text === undefined ? null : createHash("sha256").update(piece.text).digest("hex");
    // 0157: a correction states its ground; a hide and a re-publish carry none.
    const facts = step === "CORRECT" ? "It names a private person." : null;
    const factsSha = facts === null ? null : createHash("sha256").update(facts).digest("hex");
    const ground = step === "CORRECT" ? { grounds: ["PERSONAL_DATA" as const], source: "OWN_INITIATIVE" as const, flag_id: null } : { grounds: [], source: null, flag_id: null };
    const intent = step === "HIDE" ? { action: "PUBLIC_REVIEW_HIDE" as const, publication_ref: debate.ref, expected_revision: revision, operation_id: operationId, ...ground }
      : { action: "PUBLIC_REVIEW_STEP" as const, publication_ref: debate.ref, step, piece_kind: piece.kind ?? null, piece_id: piece.id ?? null, pointer: piece.pointer ?? null, text_sha256: textSha, expected_revision: revision, operation_id: operationId,
        ...ground, facts_sha256: factsSha };
    const binding = canonicalPublicReviewBinding(intent as never, { expectedRevision: revision, hidden: false }) as unknown as Record<string, unknown>;
    const proofId = randomUUID(), c = actor.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
    await q.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',now(),now()+interval '5 minutes')`, [proofId, actor.staffId, actor.userId, actor.sessionId, actor.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
    await authorizeStaffAlertFixture(q, operationId);
    const alert = { schema: "staff-alert-v1", event: "PUBLIC_REVIEW_CHANGED", operationId, envelope: { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" } };
    const content = piece.text === undefined ? null : await world.withReviewKey(debate.ref, debate.root, (cipher) => cipher.encrypt({ text: piece.text }));
    const sealedFacts = facts === null ? null : await world.withReviewKey(debate.ref, debate.root, (cipher) => cipher.encrypt({ facts }));
    return new PostgresPublicReviewRepository(world.fixtureSuperuserPool).act({ actor: actor.context as never, proof: { proofId, binding } as never, step, publicationRef: debate.ref, pieceKind: piece.kind ?? null, pieceId: piece.id ?? null,
      pointer: piece.pointer ?? null, textSha256: textSha, content, ground: groundFieldsOf(intent as never), facts: sealedFacts, expectedRevision: revision, operationId, alertIntent: alert as never });
  }
  async function freePublic(who: R22Account, question: string): Promise<Readonly<{ ref: string; root: string }>> {
    const started = await ask(who, question, { settings: FREE, publicLane: { freePublicNotice: true } });
    await world.settle();
    const ref = await listedRef(question);
    expect(ref, question).toBeDefined();
    return { ref: ref!, root: started.id };
  }
  const isGone = async (ref: string): Promise<boolean> => world.stranger.readPublicDebate(ref).then(() => false, (failure: { status?: number }) => { expect(failure.status).toBe(410); return true; });

  it("path 10: hide, correct and re-publish (through the database's own rules, with the HTTP tests' staff seam: no passkey)", async () => {
    world.setScript(panelAgrees);
    owner = await teamMember();
    const debate = await freePublic(bea, "Should Harbour Town paint the old lighthouse?");
    await act(owner, debate, "HIDE");
    expect(await isGone(debate.ref)).toBe(true);
    expect(await listedRef("Should Harbour Town paint the old lighthouse?")).toBeUndefined();
    await act(owner, debate, "CORRECT", { kind: "SNAPSHOT", id: debate.ref, pointer: "/story_short/paths/0/line", text: "Yes: a corrected line." });
    expect(await isGone(debate.ref)).toBe(true);
    await act(owner, debate, "REPUBLISH");
    const page = await world.stranger.readPublicDebate(debate.ref);
    expect(publicPathViews(page)[0]!.line).toBe("Yes: a corrected line.");
    saw("10", `HIDE: 410 DEBATE_UNDER_REVIEW and off the list at once; CORRECT while hidden; REPUBLISH: the page's own builder shows the corrected line. Staff HTTP routes, the team page and a real passkey not exercised`);
  }, 300_000);

  it("path 11: the Report button: the AI agrees (hides, queue); not (the plain sentence, a second report goes to the queue, the rate limit); one automatic hide per debate", async () => {
    world.setScript(panelAgrees);
    const pressing = await world.account("eve"), second = await world.account("fay");
    const flagsOf = async (ref: string) => (await world.database.pool.query<{ state: string; verdict: string | null }>("SELECT state,verdict FROM identity.public_flag WHERE publication_ref=$1 ORDER BY created_at", [ref])).rows;
    // The AI agrees, with words that are on the page.
    const debate = await freePublic(bea, "Should Harbour Town move the fish market?");
    const words = (await world.stranger.readPublicDebate(debate.ref)).question;
    world.flag.reply = () => JSON.stringify({ verdict: "AGREE", reason: "PERSONAL", quote: words });
    expect(await pressing.client.flagPublicDebate(debate.ref, { where: "The question", claim: "It names a private person in its words.", good_faith: true })).toEqual({ state: "HIDDEN" });
    expect(await isGone(debate.ref)).toBe(true);
    expect(await flagsOf(debate.ref)).toEqual([{ state: "HIDDEN", verdict: "AGREE" }]);
    // Re-published: reports only go to a person, whatever the AI would say.
    await act(owner, debate, "REPUBLISH");
    expect(await second.client.flagPublicDebate(debate.ref, { where: "The question", claim: "It still names a private person.", good_faith: true })).toEqual({ state: "WITH_A_PERSON" });
    expect(await isGone(debate.ref)).toBe(false);
    // The AI does not agree: the plain sentence; a second report with details goes to the queue and hides nothing.
    const other = await freePublic(bea, "Should Harbour Town rebuild the sea wall?");
    world.flag.reply = () => JSON.stringify({ verdict: "NOT_FOUND", reason: null, quote: null });
    const notFound = await second.client.flagPublicDebate(other.ref, { where: "The question", claim: "It breaks the rules somewhere here.", good_faith: true });
    expect(notFound).toEqual({ state: "NOT_FOUND" });
    expect(v4Catalog[`v4.public.flag.${notFound.state}`]).toContain("We have not acted on this report: it was stopped automatically, and no person has read it.");
    const again = await second.client.flagPublicDebate(other.ref, { where: "The question", claim: "With more details: the second sentence breaks the rules.", good_faith: true });
    expect(again).toEqual({ state: "WITH_A_PERSON" });
    expect(await isGone(other.ref)).toBe(false);
    // The rate limit: this person's reports an hour; past it, the one answer every refusal shares. No row is added.
    const limit = await new PostgresFlagLimit().personHour();
    const stranger3 = await world.account("gus");
    const answers: string[] = [];
    for (let press = 0; press <= limit; press += 1) answers.push((await stranger3.client.flagPublicDebate(other.ref, { where: "Here", claim: `A claim number ${String(press)} about this page.`, good_faith: true })).state);
    expect(answers.at(-1)).toBe("NOT_FOUND");
    saw("11", `AGREE: HIDDEN, 410, row HIDDEN/AGREE; after re-publish WITH_A_PERSON, still public; NOT_FOUND answer: "${v4Catalog[`v4.public.flag.${notFound.state}`]!}"; second report WITH_A_PERSON, nothing hidden; ${String(limit)} an hour, then NOT_FOUND. The judge's reply is scripted; the mail is not sent here`);
  }, 300_000);
  class PostgresFlagLimit { async personHour(): Promise<number> { return (await readAbuseLimits(world.fixtureSuperuserPool, world.nextVersion)).publicFlag.personHour; } }

  // V4 start step, Task 88: paths 13-19, the step before Start as the page drives it (tests/support/start-step-cases.ts's drive: the
  // lists read once for the line at Next, the first merge at the cut, a late merge of the late lists), the person's list shaped
  // through the page's own path plan, then Start.
  let fia: R22Account; let shapedRun: string;
  const SHAPED_QUESTION = "Should Harbour Town build a new ferry terminal?";
  const OWN_PATH = "My own path: the terminal must not take the fishing boats' moorings.";

  it("path 13: Plus: four lists, one cut; the menu shaped (combine, split, combine, rewrite, own path); Start with a clarify answer in the line: the paths argued as sent", async () => {
    world.setScript(webScript);
    const from = world.stubs.requests.length;
    fia = await world.account("fia", "PLUS");
    // Next: the lists for the line as typed; nothing in the stream names a maker or a model.
    const drive = await driveStartStep(fia.client, readOf(SHAPED_QUESTION));
    const check = drive.check!;
    const signed = drive.menu!;
    expect(check.seats).toBe(4);
    const progress = drive.events.flatMap((event) => event.event === "progress" ? [event.data] : []);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.map((one) => one.of)).toEqual(progress.map(() => 4));
    expect(drive.events.filter((event) => event.event === "cut")).toHaveLength(1);
    expect(drive.events.at(-1)).toEqual({ event: "end", data: { reason: "DONE" } });
    expect(nameIn(drive.events)).toBeNull();
    expect(drive.late).toEqual([]);
    expect(signed.menu.paths.length).toBeGreaterThanOrEqual(3);
    // Review Focus 1: the clarifying answer flies into the box after Next; the lists and every pre-Start call keep the line read at Next.
    const clarify = await fia.client.clarifyAsk({ question_line: SHAPED_QUESTION });
    if (clarify.source !== "AI") throw new Error(`clarify answered ${clarify.source}`);
    const purpose = clarify.purpose!;
    const chosen = purpose.answers[0]!;
    const goal = { answers: [{ question: purpose.text, answer: chosen }], matters: "" } as never;
    const line = composeQuestion(SHAPED_QUESTION, goal, newDebateCatalog);
    expect(line).not.toBe(drive.read.questionLine);
    // Step 2, through the page's own plan at How wide 3: combine the first two, split them apart again, combine the second with the
    // third, rewrite the first in the person's words, add the person's own path.
    let plan = pathPlanFromMenu(signed.menu, 3, false);
    const [first, second] = plan.paths;
    plan = changed(plan, { type: "SELECT", key: first!.key });
    plan = changed(plan, { type: "SELECT", key: second!.key });
    plan = changed(plan, { type: "COMBINE_SELECTED" });
    plan = await combined(fia, drive, plan, writingKey(plan));
    plan = changed(plan, { type: "SPLIT", key: plan.paths[0]!.key });
    expect(plan.paths.map((path) => path.viewpoints.length)).toEqual([1, 1, 1]);
    const [, splitOff, third] = plan.paths;
    plan = changed(plan, { type: "SELECT", key: splitOff!.key });
    plan = changed(plan, { type: "SELECT", key: third!.key });
    plan = changed(plan, { type: "COMBINE_SELECTED" });
    plan = await combined(fia, drive, plan, writingKey(plan));
    plan = changed(plan, { type: "REWRITE", key: plan.paths[0]!.key, title: "Who runs the terminal in winter",
      question: "Who would pay to keep the new terminal open through the winter months?" });
    plan = changed(plan, { type: "ADD_OWN", text: OWN_PATH, intoPathKey: null });
    expect(plan.paths.map((path) => path.wording)).toEqual(["PERSON", "COMBINED", "PERSON"]);
    const startPaths = StartPathsSchema.parse({ source: "MENU", menu: signed, paths: [...pathPlanToStartPaths(plan)], width: plan.width, chosen_by: "PERSON" });
    // Start: the box's whole line with the check and the paths; the server checks the whole line once.
    const checks = () => world.stubs.requests.filter((request) => request.kind === "QUESTION_CHECK");
    const checkedBefore = checks().length;
    const started = await ask(fia, line, { purposeLines: purposeLinesOfGoal(goal)!, startLane: { startCheck: { ref: check.check_ref }, startPaths } });
    const checked = checks().slice(checkedBefore);
    expect(checked).toHaveLength(1);
    expect(JSON.stringify(checked[0]!.body)).toContain(chosen);
    shapedRun = started.id;
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const { answer, map } = await readPage(fia, shapedRun);
    const branches = answer.branches!;
    expect(answer.question_line).toContain(chosen);
    expect(branches.source).toBe("MENU");
    expect(await chosenByOf(shapedRun)).toBe("PERSON");
    expect(branches.paths.map((path) => path.title)).toEqual(startPaths.paths.map((path) => path.title));
    expect(branches.paths.map((path) => path.author)).toEqual(["PERSON_EDITED", "AI_COMBINED", "PERSON_OWN_VIEW"]);
    expect(startRestatesMainQuestion(branches.paths[1]!.question, SHAPED_QUESTION, "en")).toBe(false);
    expect((await preStart(fia.ownerRef)).filter((charge) => charge.kind === "COMBINE")).toHaveLength(2);
    expect(branches.paths.map((path) => pathWebOf(answer, path.path_id)?.search.status)).toEqual(branches.paths.map(() => "SEARCHED"));
    // No call of R22's map step and none of the step before Start: the debate's only MAP: calls are its gap rounds (MAP:gap-paths:<round>).
    const sites = await runSites(shapedRun);
    expect(sites.filter((site) => (site.startsWith("MAP:") && !/^MAP:gap-paths:[1-9][0-9]*$/u.test(site)) || site.startsWith("START:"))).toEqual([]);
    expect(world.stubs.requests.slice(from).filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    expect(branches.paths[2]!.outcome?.view).toEqual(expect.objectContaining({ outcome: expect.any(String) }));
    expect(map.paths.map((path) => path.id)).toEqual(["b1", "b2", "b3"]);
    saw("13", `4 seats, ${String(progress.length)} progress events of 4, one cut, end DONE, no maker or model named; combine, split, combine, rewrite, own path; `
      + `Start with the clarify answer in the line (one whole-line check): ${branches.paths.map((path) => `${path.path_id} ${path.author} "${path.title}"`).join(", ")}; 2 COMBINE charges; every path SEARCHED; ${String(sites.length)} run calls, none of R22's map step or START: (gap rounds ${String(sites.filter((site) => site.startsWith("MAP:gap-paths:")).length)})`);
  }, 300_000);

  it("path 14: Free: two lists, a menu with a card and both suggestions, one AI combine and a fit; four paths refused, the AIs' three started: no search, no AI dig suggestion", async () => {
    world.setScript(both(mergeWithCardAndSuggestions, fitsFirst, webScript));
    const hal = await world.account("hal");
    const question = "Should Harbour Town open a summer night market by the quay?";
    const drive = await driveStartStep(hal.client, readOf(question));
    const check = drive.check!;
    const signed = drive.menu!;
    expect(check.seats).toBe(2);
    expect(signed.menu.cards.length).toBeGreaterThan(0);
    expect([...new Set(signed.menu.suggestions.map((suggestion) => suggestion.kind))].sort()).toEqual(["COMBINE", "FITS"]);
    // "Combine?" taken as the page takes it: one path being written, one AI combine, booked once.
    let plan = pathPlanFromMenu(signed.menu, 3, true);
    plan = changed(plan, { type: "APPLY_SUGGESTION", suggestionId: signed.menu.suggestions.find((suggestion) => suggestion.kind === "COMBINE")!.suggestion_id });
    plan = await combined(hal, drive, plan, writingKey(plan));
    expect((await preStart(hal.ownerRef)).filter((charge) => charge.kind === "COMBINE")).toHaveLength(1);
    // The person's own path: which path on the list it fits inside.
    const fit = await hal.client.startPathFit({ question_line: drive.read.questionLine, check_ref: check.check_ref, reading_level: drive.read.readingLevel,
      own_text: "My own view: the market should close by ten.", paths: plan.paths.map((path) => ({ key: path.key, title: path.title, question: path.question })) });
    expect(fit).toEqual({ source: "AI", fits_key: plan.paths[0]!.key });
    // Four paths are more than Free's How wide allows: refused, nothing started.
    const startCheck = { ref: check.check_ref };
    const asWritten: StartPathChoice[] = signed.menu.paths.slice(0, 3).map((path) => ({ title: path.title, question: path.question,
      members: path.viewpoint_ids.map((id) => ({ viewpoint_id: id })) }));
    const owns: StartPathChoice[] = Array.from({ length: 4 - asWritten.length }, (_unused, at) => {
      const text = `My own path number ${String(at + 1)}: the stalls need light.`;
      return { title: text, question: text, members: [{ own_text: text }] };
    });
    const four = StartPathsSchema.parse({ source: "MENU", menu: signed, paths: [...asWritten, ...owns], width: 4, chosen_by: "PERSON" });
    await expect(ask(hal, question, { settings: FREE, publicLane: { freePublicNotice: true }, startLane: { startCheck, startPaths: four } }))
      .rejects.toMatchObject({ status: 400, serverCode: "START_PATHS_TOO_MANY" });
    expect(world.queue).toHaveLength(0);
    // "Just answer it" on step 2: the AIs' top three, admitted.
    const top = topPathsChoice(drive, 3)!;
    const suggestionCalls = () => world.stubs.requests.filter((request) => request.kind === "SUGGESTIONS").length;
    const suggestedBefore = suggestionCalls();
    const started = await ask(hal, question, { settings: FREE, publicLane: { freePublicNotice: true }, startLane: { startCheck, startPaths: top } });
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const { answer, map } = await readPage(hal, started.id);
    const branches = answer.branches!;
    expect(branches.source).toBe("MENU");
    expect(branches.paths).toHaveLength(3);
    expect(branches.paths.map((path) => path.author)).toEqual(["AI_SUGGESTION", "AI_SUGGESTION", "AI_SUGGESTION"]);
    expect(await chosenByOf(started.id)).toBe("AIS");
    expect(webNoteOf(answer)).toBe("FREE");
    expect((await runSites(started.id)).filter((site) => site.startsWith("WEB:"))).toEqual([]);
    // After the debate: only the suggestions code finds, no AI suggestion call (owner F14).
    expect(suggestionCalls()).toBe(suggestedBefore);
    const offered = map.paths.flatMap((path) => pathSuggestionsOf(answer, path.id));
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((suggestion) => suggestion.kind === "HELPS_MAIN_QUESTION")).toEqual([]);
    saw("14", `2 seats; menu with ${String(signed.menu.cards.length)} card(s) and suggestions ${signed.menu.suggestions.map((suggestion) => suggestion.kind).join(",")}; one AI combine, one COMBINE charge; `
      + `fit ${String(fit.source === "AI" ? fit.fits_key : fit.reason)}; four paths 400 START_PATHS_TOO_MANY; three by the AIs COMPLETED, web note FREE, no WEB: call, ${String(offered.length)} code-found dig suggestion(s), no AI suggestion call`);
  }, 300_000);

  it("path 15: Plus: the lists read and merged, Start never pressed: only the calls before Start are booked, run-less, and they count in the person's usage", async () => {
    world.setScript(webScript);
    const gil = await world.account("gil", "PLUS");
    const spend = new PostgresModelSpendStore(world.database.pool);
    const now = new Date();
    const monthOf = async () => spend.readOwnerSpentMicros(gil.ownerRef, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), new Date(Date.now() + 60_000));
    const usedBefore = await monthOf();
    const drive = await driveStartStep(gil.client, readOf("Should Harbour Town charge cars to park by the beach?"));
    expect(drive.check?.seats).toBe(4);
    expect(drive.menu).not.toBeNull();
    const charges = await preStart(gil.ownerRef);
    expect(charges.map((charge) => charge.kind).sort()).toEqual(["ANGLES", "LIST", "LIST", "LIST", "LIST", "MERGE"]);
    expect(charges.filter((charge) => charge.spend_source === "PRE_START" && charge.run_id === null)).toHaveLength(6);
    expect((await world.database.pool.query("SELECT 1 FROM core.run_ownership_event WHERE owner_ref=$1", [gil.ownerRef])).rows).toEqual([]);
    expect(world.queue).toHaveLength(0);
    const usedAfter = await monthOf();
    const booked = charges.reduce((sum, charge) => sum + Number(charge.charge_micros), 0);
    expect(booked).toBeGreaterThan(0);
    expect(usedAfter - usedBefore).toBe(booked);
    saw("15", `4 seats; charges ANGLES 1, LIST 4, MERGE 1, all run-less PRE_START ledger rows; no run; the month's usage moved by ${String(booked)} micros (made-up prices)`);
  }, 300_000);

  it("path 16: \"Just answer it\" on step 1: no lists before Start; the run writes its own lists and merge and argues the AIs' top paths", async () => {
    world.setScript(webScript);
    const hu = await world.account("hu", "PLUS");
    const started = await ask(hu, "Should Harbour Town add a late bus to the ferry?");
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const branches = (await readPage(hu, started.id)).answer.branches!;
    expect(branches.source).toBe("RUN_BUILT");
    expect(await chosenByOf(started.id)).toBe("AIS");
    expect(branches.paths.map((path) => path.author)).toEqual(branches.paths.map(() => "AI_SUGGESTION"));
    expect(branches.paths.length).toBeLessThanOrEqual(5);
    const sites = await runSites(started.id);
    expect(sites).toEqual(expect.arrayContaining(["START:angles", "START:list:1", "START:merge"]));
    expect(sites.filter((site) => site === "MAP:choose" || site === "MAP:check")).toEqual([]);
    expect(await preStart(hu.ownerRef)).toEqual([]);
    saw("16", `RUN_BUILT, ${String(branches.paths.length)} paths by the AIs; run calls ${[...new Set(sites.filter((site) => site.startsWith("START:")))].join(",")}, no MAP:choose or MAP:check; no pre-Start charge`);
  }, 300_000);

  it("path 17: trouble: every list fails (none, then a Start with no paths builds its own); two of four lists late (revision 2 keeps revision 1, Start admitted); Free with one list late", async () => {
    // Every list answers a vendor 500: no list, none, the stream ends NONE; Start with the check alone, and the run builds its own list.
    const ivy = await world.account("ivy", "PLUS");
    const failingQuestion = "Should Harbour Town move the ferry ticket office?";
    world.setScript(both((_contract, request) => request.kind === "START_LIST" ? { vendorStatus: 500 } : null, webScript));
    let failed: StartStepDrive;
    try { failed = await driveStartStep(ivy.client, readOf(failingQuestion)); } finally { world.setScript(webScript); }
    expect(failed.events.filter((event) => event.event === "list" || event.event === "late_list")).toEqual([]);
    expect(failed.events.slice(-2).map((event) => event.event)).toEqual(["none", "end"]);
    expect(failed.events.at(-1)).toEqual({ event: "end", data: { reason: "NONE" } });
    expect(failed.menu).toBeNull();
    const lone = await ask(ivy, failingQuestion, failed.check === null ? {} : { startLane: { startCheck: { ref: failed.check.check_ref } } });
    const loneDone = await world.settle();
    expect(loneDone.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    expect((await readPage(ivy, lone.id)).answer.branches?.source).toBe("RUN_BUILT");
    const noneReason = failed.events.find((event) => event.event === "none");
    // Two of Plus's four lists (Qwen's and DeepSeek's) come after the cut: two in at the cut, the first menu from them, both late lists
    // merged as revision 2, which keeps revision 1's paths; Start with revision 2 is admitted and the debate finishes.
    const jan = await world.account("jan", "PLUS");
    const slowQuestion = "Should Harbour Town turn the fish market into a library?";
    world.setScript(webScript);
    world.setDelays(listsLate((model) => model.startsWith("Qwen/") || model.startsWith("deepseek-ai/")));
    let slow: StartStepDrive;
    try { slow = await driveStartStep(jan.client, readOf(slowQuestion)); } finally { world.setDelays(null); }
    expect(slow.events.find((event) => event.event === "cut")).toEqual({ event: "cut", data: { lists_in: 2 } });
    expect(slow.late).toHaveLength(2);
    const firstMerge = slow.merges[0];
    if (firstMerge === undefined || firstMerge.source === "NONE") throw new Error("the first merge gave no menu");
    expect(firstMerge.menu.menu.revision).toBe(1);
    expect(slow.menu!.menu.revision).toBe(2);
    expect(slow.menu!.menu.paths.slice(0, firstMerge.menu.menu.paths.length)).toEqual(firstMerge.menu.menu.paths);
    const top = topPathsChoice(slow, 5)!;
    expect(top.menu?.menu.revision).toBe(2);
    await ask(jan, slowQuestion, { startLane: { startCheck: { ref: slow.check!.check_ref }, startPaths: top } });
    const slowDone = await world.settle();
    expect(slowDone.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    // Free with GLM's list late: one list in at the cut, and the first menu (an AI merge of that one list) already has a card and a suggestion.
    const kai = await world.account("kai");
    world.setScript(both(mergeWithCardAndSuggestions, webScript));
    world.setDelays(listsLate((model) => model.startsWith("zai-org/")));
    let one: StartStepDrive;
    try { one = await driveStartStep(kai.client, readOf("Should Harbour Town plant trees along the ferry road?")); } finally { world.setDelays(null); world.setScript(webScript); }
    expect(one.check?.seats).toBe(2);
    expect(one.events.find((event) => event.event === "cut")).toEqual({ event: "cut", data: { lists_in: 1 } });
    const freeFirst = one.merges[0];
    if (freeFirst === undefined || freeFirst.source === "NONE") throw new Error("the Free first merge gave no menu");
    expect(freeFirst.source).toBe("AI");
    expect(freeFirst.menu.menu.cards.length).toBeGreaterThanOrEqual(1);
    expect(freeFirst.menu.menu.suggestions.length).toBeGreaterThanOrEqual(1);
    saw("17", `every list 500: ${JSON.stringify(noneReason?.data)}, end NONE, a lone check RUN_BUILT COMPLETED; two late: cut 2, late 2, revision 2 keeps revision 1's ${String(firstMerge.menu.menu.paths.length)} paths, Start COMPLETED; `
      + `Free with GLM late: cut 1, first menu AI with ${String(freeFirst.menu.menu.cards.length)} card(s) and ${String(freeFirst.menu.menu.suggestions.length)} suggestion(s)`);
  }, 300_000);

  it("path 18: digs with paths: three picks on b2 (one the person's own view) argued as three paths; the parent's b2 rewritten, its title kept; a '+ N more' idea dug", async () => {
    world.setScript(both(changing(), webScript));
    const parent = await readPage(fia, shapedRun);
    const b2 = parent.map.paths.find((path) => path.id === "b2")!;
    const offered = pathSuggestionsOf(parent.answer, b2.id).slice(0, 2).map((suggestion) => suggestionPick(b2.id, suggestion));
    const views = Array.from({ length: 3 - offered.length }, (_unused, at) => ownViewPick(b2.id, `My own view number ${String(at + 1)}: the terminal needs a winter timetable.`, at));
    const digRun = await dig(fia, shapedRun, b2, [...offered, ...views], parent.answer.question_line);
    const done = await world.settle();
    expect(done.length).toBeGreaterThan(0);
    expect(done.map((job) => job.result)).toEqual(done.map(() => expect.objectContaining({ kind: "COMPLETED" })));
    const child = await readPage(fia, digRun);
    const dugPaths = child.answer.branches!;
    expect(dugPaths.source).toBe("DIG_PICKS");
    expect(dugPaths.paths).toHaveLength(3);
    expect(dugPaths.paths.map((path) => path.author)).toContain("PERSON_OWN_VIEW");
    expect(child.answer.dig?.position_ref).toBe("b2");
    const rewrite = child.answer.dig?.rewrite;
    if (rewrite?.state !== "READY") throw new Error(`the dig's rewrite: ${String(rewrite?.state)}`);
    const after = await readPage(fia, shapedRun);
    expect(after.answer.path_rewrites?.paths.map((path) => path.position_ref)).toContain("b2");
    const moved = after.map.paths.find((path) => path.id === "b2")!;
    expect(moved.line).toBe(rewrite.text.line);
    expect(moved.line).not.toBe(b2.line);
    expect(moved.branch?.title).toBe(b2.branch?.title);
    // A "+ N more" idea the person left out before Start, dug from the main question.
    const more = digSuggestionsWithMore(after.answer, []).filter((pick) => pick.kind === "MORE");
    expect(more.length).toBeGreaterThan(0);
    const target: DigTarget = { kind: "picks", path: null, picks: [more[0]!] };
    const moreParent = askParentOf(shapedRun, target, "quick");
    expect(moreParent).not.toBeNull();
    const moreDig = await ask(fia, digQuestion(target, after.answer.question_line, v4Catalog, "en"), { parent: moreParent! });
    expect(moreDig.id).toEqual(expect.any(String));
    const moreDone = await world.settle();
    expect(moreDone.length).toBeGreaterThan(0);
    expect(moreDone.map((job) => job.result)).toEqual(moreDone.map(() => expect.objectContaining({ kind: "COMPLETED" })));
    saw("18", `a dig of b2 with ${String(offered.length)} suggestion(s) and ${String(views.length)} own view(s): DIG_PICKS ${dugPaths.paths.map((path) => `${path.path_id} ${path.author}`).join(", ")}; `
      + `b2's line "${moved.line}", title kept "${String(moved.branch?.title)}"; a '+ N more' dig (${more[0]!.key}) admitted and COMPLETED`);
  }, 300_000);

  it("path 19: a Free debate started from its lists goes public with its paths' titles; a stranger digs path:b1; a refused check keeps a second one private", async () => {
    world.setScript(webScript);
    const jo = await world.account("jo");
    const question = "Should Harbour Town paint the ferry blue?";
    const drive = await driveStartStep(jo.client, readOf(question));
    const started = await ask(jo, question, { settings: FREE, publicLane: { freePublicNotice: true },
      startLane: { startCheck: { ref: drive.check!.check_ref }, startPaths: topPathsChoice(drive, 3)! } });
    const done = await world.settle();
    expect(done.map((job) => job.result)).toEqual([expect.objectContaining({ kind: "COMPLETED" })]);
    const ref = await listedRef(question);
    expect(ref).toBeDefined();
    const page = await world.stranger.readPublicDebate(ref!);
    const own = await readPage(jo, started.id);
    expect(page.branches?.paths.map((path) => path.title)).toEqual(own.answer.branches!.paths.map((path) => path.title));
    // A stranger's dig on the first path, as the public page sends it.
    const kim = await world.account("kim");
    const first = publicPathViews(page).find((view) => view.ref === "b1")!;
    const built = publicDigAsk({ publicRef: ref!, question: page.question, path: first, views: ["A stranger's view: blue fades fast in the sea air."], catalog: v4Catalog, locale: "en" })!;
    expect(built.parent.places).toContain("path:b1");
    const dug = await ask(kim, built.questionLine, { settings: FREE, publicLane: { publicParent: built.parent } });
    expect(dug.public_dig_not_joined).toBeUndefined();
    await world.settle();
    // A second debate whose check refuses: it stays its author's own.
    const refusedQuestion = "Should Harbour Town paint the refused ferry red?";
    const second = await driveStartStep(jo.client, readOf(refusedQuestion));
    world.content.refuse = (snapshot) => snapshot.question === refusedQuestion;
    try {
      const kept = await ask(jo, refusedQuestion, { settings: FREE, publicLane: { freePublicNotice: true },
        startLane: { startCheck: { ref: second.check!.check_ref }, startPaths: topPathsChoice(second, 3)! } });
      await world.settle();
      expect((await readPage(jo, kept.id)).answer.branches?.source).toBe("MENU");
    } finally {
      world.content.refuse = () => false;
    }
    expect(await listedRef(refusedQuestion)).toBeUndefined();
    saw("19", `public under ${jo.pseudonym} with titles ${page.branches!.paths.map((path) => `"${path.title}"`).join(", ")}; a stranger's dig on path:b1 admitted; a refused check kept the second debate private`);
  }, 300_000);

  // V4 start step, Task 88: path 12 runs last. Its first funded question waits in the site's line for good (its later start is
  // tests/integration/team-limit-admission.test.ts's), and the line makes every later question wait behind it.
  it("path 12: the team limit and an allowance: a funded question waits with no limit set, starts under the limit, and runs with the top plan's features", async () => {
    world.setScript(webScript);
    const fixture = internalFundingFixture(world.database.pool, world.fixtureSuperuserPool);
    const actor = await fixture.fundedActor();
    const command = fixture.configureCommand(actor, { amountMicros: 1_000_000 });
    await fixture.configure(actor, command);
    const member = await world.signedIn({ userId: actor.userId, ownerRef: actor.ownerRef });
    const setLimit = async (amount: number) => {
      const now = (await world.database.pool.query("SELECT coalesce(max(revision),0)::int r, coalesce((SELECT amount_micros FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1),0)::bigint a FROM staff.team_limit_event")).rows[0] as { r: number; a: string };
      const current = Number(now.a), operationId = randomUUID();
      const binding = canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_SET", amount_micros: amount, current_micros: current, expected_revision: now.r, operation_id: operationId }, actor.staffId, { currentMicros: current, expectedRevision: now.r });
      const stored = await fixture.storeProof(actor, binding as never);
      await authorizeStaffAlertFixture(world.database.pool, operationId);
      await world.fixtureSuperuserPool.query("SELECT staff.set_team_limit($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb)", [actor.context, stored.proofId, binding,
        { targetId: actor.staffId, amountMicros: amount, currentMicros: current, expectedRevision: now.r, operationId, reason: { code: "FUNDING_APPROVAL" } }, { ...stored.alert, event: "TEAM_LIMIT_CHANGED" }]);
    };
    // With no limit set a funded question waits, naming the team's month and no amount.
    const waits = await ask(member, "Should the team try the longer ferry route?");
    const waiting = await member.client.readRun(waits.id);
    expect(waiting.state).toBe("WAITING");
    expect(JSON.stringify(waiting)).not.toMatch(/micros/iu);
    expect(world.queue).toHaveLength(0);
    // Under a limit a new funded question starts, and goes by the top plan: its web search runs.
    await setLimit(900_000_000);
    const searched = world.search.counts().searches;
    const started = await ask(member, "Should the team try the shorter ferry route?");
    await world.settle();
    const page = await readPage(member, started.id);
    expect(world.search.counts().searches).toBeGreaterThan(searched);
    await expect(readWebRunPlan(world.fixtureSuperuserPool, started.id)).resolves.toBe(TEAM_FEATURE_PLAN_ID);
    saw("12", `no limit: WAITING with no amount; limit set: a funded ask started, searched the web, ${String(page.map.paths.length)} paths. The owner's team page, its passkey and the waiter's later start (tests/integration/team-limit-admission.test.ts) are not walked here`);
  }, 300_000);
});
