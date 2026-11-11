// V4 start step, Task 90 (spec 2026-11-03 §8; plan Global Constraints "Public repo"): EVERY START-STEP CASE AGAINST THE RELEASE'S
// REGISTER AND THE REAL GATE FIGURES. With the owner's two private files named (DEBATEAI_PRIVATE_REGISTER_EXPORT: the release's
// register export; DEBATEAI_PRIVATE_GATE_FIGURES: each gate's pot, paid calls, calls in flight and models), the world of
// tests/support/r22-world.ts runs on the release's own register with its debate-shape row switched on and its hosted billing, over
// gate doubles that answer /remaining with the owner's figures, lower what is left as calls are billed, and refuse a call over the
// gate's slots. Each case of tests/support/start-step-cases.ts is then driven as the page drives it (lists, merge, late merge,
// combine), started (and dug) over real HTTP, and settled in the runner's own code.
//
// Without both files it prints "SEEN private: not checked" and skips. It never prints a figure: a refusal prints only the gate,
// the case id and shares of the pot (shareOfPot); the API's own refusal line, which names figures, is held back, and so is any
// other log line that speaks of money. No vendor is contacted (the AIs are the gate doubles) and nothing is spent. Integration
// suites are skipped by the CI gate: run this file by hand, alone (Task 91's sitting runs it with the owner's files).
// Task 90b: the export is README S-1's (it ends at the version the owners switched on); on a version that carries the line-up the
// world takes the settings' gate part alone. The gate-figures file is written by tools/preview-practice/practice-gate-figures.ts
// from S-3's status files and S-3b's GO limits and hosted billing (README "The free check of the start step").
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { START_STEP_LIMITS, StartPathsSchema, type ContractClient, type StartPaths, type StartListsEvent } from "@debateai/contract";
import { debateShapeStartStepOf, readDebateShapePolicy, type DebateShapePlanKey, type DebateShapePolicy } from "@debateai/register";
import { digPathTitleOf } from "../../apps/api/src/start-paths-at-ask.js";
import { COOKIE_SESSION_MARKER, createDebate } from "../../apps/ui/lib/api.js";
import { loadV4 } from "../../apps/ui/lib/v4/load.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { pathWebOf } from "../../apps/ui/lib/v4/web.js";
import { askParentOf, ownViewPick, pathSuggestionsOf, suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import type { DigTarget } from "../../apps/ui/lib/v4/types.js";
import { stubJudgement, type GateProvider, type GateRequest } from "../support/preview-gate-stubs.js";
import { PRIVATE_NOT_CHECKED, readPrivateGateFigures, readPrivateRegisterExport, shareOfPot, type PrivateGateFigures } from "../support/private-figures.js";
import { FREE, PREMIUM, newDebateCatalog, panelAgrees, v4Catalog, type V4AskSettings } from "../support/r22-pages.js";
import { START_STEP_CASES, SHAPED_OWN_TEXT, driveStartStep, shapedChoice, topPathsChoice, type StartStepCase, type StartStepDrive } from "../support/start-step-cases.js";
import { startR22World, type R22Account, type R22Script, type R22World } from "../support/r22-world.js";

// The page's ask settings (r22-pages.ts reads them the same way): the website's own "@/" module, loaded by name, typed here.
const websiteModule = async <T>(path: string): Promise<T> => import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<T>;
const { v4AskConfig } = await websiteModule<{ v4AskConfig: (mode: "quick" | "thorough", level: "plain", settings: V4AskSettings, at: Date,
  catalog: Record<string, string>) => Record<string, unknown> }>("../../apps/ui/lib/v4/askConfig.ts");

// The owner's files: both named, or the check is not made. A file that is named but does not read throws its own code (no value).
const FIGURES = readPrivateGateFigures();
const REGISTER_EXPORT = readPrivateRegisterExport();
const CHECKED = FIGURES !== null && REGISTER_EXPORT !== null;

/** This file's own lines, written before any log line is held back (they never carry a figure). */
const say = console.info.bind(console);

/** Every call the doubles answer is held this long, so calls overlap and count against the gate's slots (Task 85: only held calls do). */
const HOLD_MS = 10;
/** TROUBLE's slow seat: past the cut (START_STEP_TIMING.cutAtMs, 30 s), well before the lists' hard cap. */
const LATE_MS = 35_000;
const READING_LEVEL = "plain" as const;

/** Each case's question (made up), each asked by its own account. */
const QUESTIONS: Readonly<Record<string, string>> = Object.freeze({
  FREE_QUICK_TOP: "Should Harbour Town open a winter market on the quay?",
  FREE_QUICK_DIG: "Should Harbour Town plant trees along the ferry road?",
  PLUS_QUICK_SHAPED: "Should Harbour Town build a second ferry pier?",
  PLUS_THOROUGH_SHAPED: "Should Harbour Town move its bus depot out of the old port?",
  PLUS_QUICK_JUST_ANSWER: "Should Harbour Town light the harbour wall at night?",
  PLUS_QUICK_NO_START: "Should Harbour Town charge cars to park by the beach?",
  PLUS_QUICK_TROUBLE: "Should Harbour Town turn the fish market into a library?",
  PRO_QUICK_TOP: "Should Harbour Town run a night ferry in summer?",
  MAX_THOROUGH_TOP: "Should Harbour Town build a sea wall before the next storm season?",
  PLUS_QUICK_DIG: "Should Harbour Town close the old lighthouse to visitors?"
});

const opening = (text: string): string => text.slice(0, text.indexOf(".") + 1);
const pagesOf = (field: (name: string) => string | undefined) => JSON.parse(field("pages") ?? "[]") as { page_id: string; text?: string }[];
/**
 * Each path's own web planner (web.plan-dig.v3, a path debate's) and R22's planner plan a pair of searches; the readers quote each
 * page's first sentence; a case writer that reads a pack cites its first extract. Everything else is the doubles' own reply.
 */
const webReplies: R22Script = (contract, request, _chat, field) => {
  if (request.kind === "JUDGE") {
    const id = /S[1-9][0-9]*-[1-9][0-9]*/u.exec(field("sources") ?? "")?.[0];
    if (id !== undefined) return { content: JSON.stringify({ ...JSON.parse(stubJudgement("A point the page reports, with its figure.")) as object, way_of_knowing: "LOOKED_UP", locator: id }) };
  }
  if (contract === null) return null;
  if (contract === "web.plan-dig.v3") {
    return { content: JSON.stringify({ country: null, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: "harbour town evidence for" }, { side: "against", local: false, query: "harbour town evidence against" }] }) };
  }
  if (contract.startsWith("web.plan.")) {
    const answers = JSON.parse(field("answers") ?? "[]") as { answer_id: string }[];
    return { content: JSON.stringify({ country: null, answers: answers.map((answer, index) => ({ answer_id: answer.answer_id, needs_search: true, reason: null, pace: "normal",
      searches: [{ side: "for", local: false, query: `harbour town evidence for ${String(index)}` }, { side: "against", local: false, query: `harbour town evidence against ${String(index)}` }] })) }) };
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

/**
 * SHAPED's merge (spec §8's Plus case is a combine, a split and an own path): the first two viewpoints each a path of their own, the
 * third and fourth put together in one path with its own words, any further viewpoint a path of its own. The doubles' own merge puts
 * every viewpoint in a path of its own, which would leave shapedChoice nothing to split. Under four viewpoints: the doubles' reply.
 */
const mergeWithAGroup: R22Script = (contract, _request, _chat, field) => {
  if (contract !== "start.merge.v1") return null;
  const ids = (JSON.parse(field("suggestions") ?? "[]") as { id: string }[]).map((one) => one.id);
  if (ids.length < 4) return null;
  const alone = (id: string) => ({ ids: [id], title: null, question: null });
  return { content: JSON.stringify({ repeats: [], cards: [], suggestions: [], paths: [alone(ids[0]!), alone(ids[1]!),
    { ids: [ids[2]!, ids[3]!], title: "The neighbours and the harbour workers", question: "How would the change land on the people who live and work by the harbour?" },
    ...ids.slice(4).map(alone)] }) };
};

/**
 * TROUBLE's list seats, by model in the order each first asks for its list: the first on time, the second answering a vendor 500
 * (every time it asks), the third 35 s late; any further seat on time. Only list calls (START_LIST); the merges, the planner and
 * the debate's calls of the same models are answered as usual.
 */
function troubleSeats() {
  const roles = new Map<string, "ON_TIME" | "FAILS" | "LATE">();
  const order = ["ON_TIME", "FAILS", "LATE"] as const;
  const roleOf = (request: GateRequest) => {
    if (request.kind !== "START_LIST") return null;
    const known = roles.get(request.model);
    if (known !== undefined) return known;
    const role = order[roles.size] ?? "ON_TIME";
    roles.set(request.model, role);
    return role;
  };
  return Object.freeze({
    roles,
    delay: (request: GateRequest): number => roleOf(request) === "LATE" ? LATE_MS : HOLD_MS,
    script: ((_contract, request) => request.kind === "START_LIST" && roles.get(request.model) === "FAILS" ? { vendorStatus: 500 } : null) as R22Script
  });
}

/** What a held-back refusal line of the API's start-of-debate estimate said, as numbers (never printed). */
type GateShortfall = Readonly<{ unit: "money" | "calls"; left: bigint; held: bigint; need: bigint }>;
type HeldRefusal = Readonly<{ kind: string; shortfall: GateShortfall | null }>;
const SHORTFALL = /gate has (\d+) (nano-USD|calls) left, (\d+) held by unfinished debates, the debate needs (\d+)/u;
const MONEY_WORDS = /usd|micros|nano|ceiling|budget|reservation|remaining|\bpot\b/iu;

/** The API's refusal line (preview-budget-estimate.ts, logRefusal), read into numbers; null for any other line. */
function refusalOf(text: string): HeldRefusal | null {
  if (!text.includes("preview.estimate.refused")) return null;
  let kind = "unknown";
  let reason = "";
  try {
    const line = JSON.parse(text) as { kind?: unknown; reason?: unknown };
    kind = typeof line.kind === "string" ? line.kind : kind;
    reason = typeof line.reason === "string" ? line.reason : reason;
  } catch {
    return { kind, shortfall: null };
  }
  const found = SHORTFALL.exec(reason);
  return { kind, shortfall: found === null ? null : { unit: found[2] === "calls" ? "calls" : "money", left: BigInt(found[1]!), held: BigInt(found[3]!), need: BigInt(found[4]!) } };
}

/**
 * Holds back, from the start of the world to its end, every log line that could carry a figure: the API's refusal line (kept as
 * numbers, for the shares) and any line that speaks of money. The rest goes out as before.
 */
function holdBackFigures() {
  const refusals: HeldRefusal[] = [];
  const counted = { heldBack: 0 };
  const spies = (["error", "warn", "info", "log", "debug"] as const).map((name) => {
    const original = console[name].bind(console);
    return vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
      const text = args.map((one) => {
        if (typeof one === "string") return one;
        try { return JSON.stringify(one) ?? String(one); } catch { return String(one); }
      }).join(" ");
      const refusal = refusalOf(text);
      if (refusal !== null) { refusals.push(refusal); return; }
      if (MONEY_WORDS.test(text)) { counted.heldBack += 1; return; }
      original(...args);
    });
  });
  return Object.freeze({ refusals, counted, restore: () => { for (const spy of spies) spy.mockRestore(); } });
}

/** Nano-USD as the gates' plain decimal, rounded up to a micro-dollar (shareOfPot's form). */
function usdOfNano(nano: bigint): string {
  const micros = (nano > 0n ? nano : 0n) + 999n;
  const whole = micros / 1000n;
  return `${String(whole / 1_000_000n)}.${String(whole % 1_000_000n).padStart(6, "0")}`;
}

/** A refused ask's one line: the gate, the case id and the shares of the pot; never a figure. */
function refusalLine(caseId: string, gate: GateProvider | null, refusal: HeldRefusal | null, figures: PrivateGateFigures): string {
  if (gate === null || refusal === null) return `${caseId} refused before any gate was read`;
  const shortfall = refusal.shortfall;
  if (shortfall === null) return `${caseId} refused on ${gate}: the gate was ${refusal.kind === "unavailable" ? "unavailable" : "short"}`;
  const pot = figures.gates[gate];
  const left = shortfall.left - shortfall.held;
  if (shortfall.unit === "calls") {
    const day = String(pot.max_paid_posts_per_day);
    if (day === "0") return `${caseId} refused on ${gate} (paid calls): the gate allows no paid call a day`;
    return `${caseId} refused on ${gate} (paid calls): needs ${shareOfPot(String(shortfall.need), day)}, left today ${shareOfPot(String(left > 0n ? left : 0n), day)}`;
  }
  return `${caseId} refused on ${gate}: needs ${shareOfPot(usdOfNano(shortfall.need), pot.daily_budget_usd)}, left today ${shareOfPot(usdOfNano(left), pot.daily_budget_usd)}`;
}

/** The lists' wall times as the page sees them: when the cut came and when the first menu was in hand (the card). */
function timedClient(client: ContractClient) {
  const started = performance.now();
  const marks: { cutMs: number | null; cardMs: number | null } = { cutMs: null, cardMs: null };
  const since = (): number => performance.now() - started;
  const timed: Pick<ContractClient, "startPathLists" | "startPathMerge"> = {
    startPathLists: (request, onEvent, signal) => client.startPathLists(request, (event: StartListsEvent) => {
      if (event.event === "cut") marks.cutMs ??= since();
      onEvent(event);
    }, signal),
    startPathMerge: async (request, signal) => {
      const answer = await client.startPathMerge(request, signal);
      marks.cardMs ??= since();
      return answer;
    }
  };
  return Object.freeze({ client: timed, marks });
}

const seconds = (ms: number | null): string => ms === null ? "-" : (ms / 1000).toFixed(1);

describe.runIf(!CHECKED)("the start-step cases against the private figures, without the owner's files", () => {
  it("prints not checked and skips", () => {
    say(`SEEN private: ${PRIVATE_NOT_CHECKED}`);
    expect(CHECKED).toBe(false);
  });
});

describe.runIf(CHECKED)("every start-step case against the release's register and the real gate figures", () => {
  const figures = FIGURES!;
  let world: R22World;
  let shape: DebateShapePolicy;
  let held: ReturnType<typeof holdBackFigures>;

  beforeAll(async () => {
    held = holdBackFigures();
    world = await startR22World({ register: "PRIVATE", spendLowersRemaining: true, refuseOverConcurrency: true });
    world.setScript(webScript);
    world.setDelays(() => HOLD_MS);
    const read = await readDebateShapePolicy(world.database.pool, world.nextVersion);
    if (read === null) throw new Error("the release's debate shape is not in force");
    shape = read;
  }, 900_000);
  afterAll(async () => {
    await world?.stop();
    if (held !== undefined) {
      say(`SEEN private: ${String(held.counted.heldBack)} log lines that speak of money held back`);
      held.restore();
    }
  });

  const planKeyOf = (startCase: StartStepCase): DebateShapePlanKey => startCase.plan.toLowerCase() as DebateShapePlanKey;
  const settingsOf = (startCase: StartStepCase): V4AskSettings => startCase.plan === "FREE" ? FREE : PREMIUM;
  const configOf = (startCase: StartStepCase, mode: "quick" | "thorough") => v4AskConfig(mode, READING_LEVEL, settingsOf(startCase), new Date(), newDebateCatalog);

  /** An ask that must be admitted; a refusal fails the case with only the gate, the case id and the shares of the pot. */
  async function admitted(startCase: StartStepCase, send: () => Promise<{ id: string }>): Promise<string> {
    const readsBefore = world.stubs.remainingReads.length;
    const refusalsBefore = held.refusals.length;
    try {
      return (await send()).id;
    } catch (failure) {
      const reads = world.stubs.remainingReads.slice(readsBefore);
      const refusal = held.refusals.slice(refusalsBefore).at(-1) ?? null;
      if (refusal !== null) {
        const line = refusalLine(startCase.id, reads.at(-1)?.provider ?? null, refusal, figures);
        say(`SEEN private refusal: ${line}`);
        throw new Error(`START_STEP_CASE_REFUSED: ${line}`);
      }
      const status = (failure as { status?: unknown }).status;
      const code = (failure as { serverCode?: unknown }).serverCode;
      throw new Error(`START_STEP_CASE_REFUSED: ${startCase.id}: ${typeof status === "number" ? String(status) : "no status"} ${typeof code === "string" ? code : "no code"}`);
    }
  }

  /** Every queued debate to its end: every one COMPLETED (the kinds only), and no request the doubles could not name. */
  async function settled(startCase: StartStepCase): Promise<number> {
    const done = await world.settle();
    expect(done.length, startCase.id).toBeGreaterThan(0);
    expect(done.map((job) => (job.result as { kind?: unknown } | null)?.kind), startCase.id).toEqual(done.map(() => "COMPLETED"));
    expect(world.stubs.requests.filter((request) => request.kind === "UNKNOWN").map((request) => request.model), startCase.id).toEqual([]);
    return done.length;
  }

  /** The served answer of a run, read as the page reads it. */
  async function served(who: R22Account, runId: string) {
    const load = await loadV4(runId, who.client);
    if (load.kind !== "SERVED") throw new Error(`the page still waits: ${load.run.state} ${String(load.run.terminal_reason)}`);
    return load;
  }

  /** How far apart the paths' answers so far were written (each path fills in on its own, Task 54): ids and times only. */
  async function pathsFilledIn(runId: string): Promise<Readonly<{ paths: number; spreadMs: number }>> {
    const row = (await world.database.pool.query<{ paths: number; spread_ms: number }>(
      "SELECT count(*)::int AS paths, coalesce(round(extract(epoch FROM max(recorded_at) - min(recorded_at)) * 1000), 0)::int AS spread_ms FROM core.path_outcome WHERE run_id=$1",
      [runId])).rows[0]!;
    return { paths: row.paths, spreadMs: row.spread_ms };
  }

  /** The pre-Start charges the owner was booked, by kind, each with its ledger row (run-less, PRE_START). */
  async function preStartCharges(ownerRef: string) {
    return (await world.database.pool.query<{ kind: string; spend_source: string | null; run_id: string | null }>(
      "SELECT c.kind, s.spend_source, s.run_id::text AS run_id FROM identity.pre_start_charge AS c LEFT JOIN ledger.model_spend AS s ON s.spend_id = c.charge_id WHERE c.owner_ref=$1",
      [ownerRef])).rows;
  }

  /** The calls the doubles refused over a gate's slots since `from` (the real gate would have held them for a slot). */
  const overSlots = (from: number): number => world.stubs.requests.slice(from).filter((request) => request.answer === "GATE_REFUSED").length;

  /**
   * A dig of the case's first debate, as the map sends one with paths: its picks on the first path (a dig's picks rest on one path,
   * DIG_PICKS_ONE_PATH), two of the person's own views and, on a paid plan, the first suggestion offered there; one path per pick
   * (DIG_PICKS), each in the pick's own words.
   */
  async function digWithPaths(startCase: StartStepCase, who: R22Account, parentRunId: string): Promise<Readonly<{ runId: string; picks: number }>> {
    const page = await served(who, parentRunId);
    const map = buildV4Map({ runId: parentRunId, answer: page.answer, story: page.story });
    const first = map.paths[0];
    if (first === undefined) throw new Error(`${startCase.id}: the debate has no path to dig`);
    const views = [ownViewPick(first.id, "Made-up view: the harbour workers were never asked.", 0),
      ownViewPick(first.id, "Made-up view: the winter months change the answer.", 1)];
    const offered = startCase.plan === "FREE" ? [] : pathSuggestionsOf(page.answer, first.id);
    const picks = offered[0] === undefined ? views : [suggestionPick(first.id, offered[0]), ...views];
    const target: DigTarget = { kind: "picks", path: first, picks };
    const parent = askParentOf(parentRunId, target, "quick");
    if (parent === null || parent.picks === undefined) throw new Error(`${startCase.id}: the dig's parent does not parse`);
    const startPaths: StartPaths = StartPathsSchema.parse({ source: "DIG_PICKS", width: parent.picks.length, chosen_by: "PERSON",
      paths: parent.picks.map((pick, at) => ({ title: digPathTitleOf(pick.text), question: pick.text, members: [{ pick_no: at + 1 }] })) });
    const runId = await admitted(startCase, () => createDebate(digQuestion(target, page.answer.question_line, v4Catalog, "en"), configOf(startCase, "quick"),
      COOKIE_SESSION_MARKER, who.client, undefined, parent, undefined, undefined, { startPaths }));
    return { runId, picks: parent.picks.length };
  }

  for (const startCase of START_STEP_CASES) {
    it(`${startCase.id}: driven as the page drives it, started${startCase.dig ? ", dug" : ""} and settled on the release's register and the gate figures`, async () => {
      const question = QUESTIONS[startCase.id];
      if (question === undefined) throw new Error(`${startCase.id} has no question`);
      expect(world.queue, startCase.id).toEqual([]);
      const who = await world.account(`t90-${startCase.id.toLowerCase()}`, startCase.plan);
      const widths = debateShapeStartStepOf(shape, planKeyOf(startCase));
      if (widths === null) throw new Error(`${startCase.id}: the start step is not on for its plan`);
      const from = world.stubs.requests.length;
      const freeLane = startCase.plan === "FREE" ? { freePublicNotice: true as const } : undefined;

      // Step 1's "Just answer it": no lists are read; the question goes alone and the run builds its own paths.
      if (startCase.start === "JUST_ANSWER") {
        const runId = await admitted(startCase, () => createDebate(question, configOf(startCase, startCase.depth), COOKIE_SESSION_MARKER, who.client,
          undefined, undefined, undefined, freeLane));
        await settled(startCase);
        const { answer } = await served(who, runId);
        expect(answer.branches?.source, startCase.id).toBe("RUN_BUILT");
        expect(await preStartCharges(who.ownerRef), startCase.id).toEqual([]);
        const filled = await pathsFilledIn(runId);
        say(`SEEN private ${startCase.id}: RUN_BUILT, ${String(answer.branches!.paths.length)} paths (${answer.branches!.paths.map((path) => path.state).join(" ")}); `
          + `run COMPLETED; ${String(overSlots(from))} calls over a gate's slots`);
        say(`START-STEP TIMING ${startCase.id} (${startCase.plan}): no lists before Start; ${String(filled.paths)} paths filled in ${String(filled.spreadMs)} ms apart`);
        return;
      }

      // The lists, as the page reads them at Next: TROUBLE with one seat answering 500 and one 35 s late.
      const trouble = startCase.start === "TROUBLE" ? troubleSeats() : null;
      if (trouble !== null) {
        world.setScript(both(trouble.script, webScript));
        world.setDelays(trouble.delay);
      }
      // SHAPED: a merge with a put-together path after the first two, for the person to split.
      if (startCase.start === "SHAPED") world.setScript(both(mergeWithAGroup, webScript));
      const timed = timedClient(who.client);
      let drive: StartStepDrive;
      try {
        drive = await driveStartStep(timed.client, { questionLine: question, siteLanguage: "en", readingLevel: READING_LEVEL });
      } finally {
        world.setScript(webScript);
        world.setDelays(() => HOLD_MS);
      }
      const check = drive.check;
      const menu = drive.menu;
      expect(drive.events.filter((event) => event.event === "none" || event.event === "refused"), startCase.id).toEqual([]);
      expect(drive.events.at(-1), startCase.id).toEqual({ event: "end", data: { reason: "DONE" } });
      if (check === null || menu === null) throw new Error(`${startCase.id}: the lists gave no menu`);
      // The list writers are the plan's number in the active settings version, never more (spec §7 "Which AIs", S5; §8's Free: 2 AIs).
      expect(check.seats, startCase.id).toBeLessThanOrEqual(shape.plans[planKeyOf(startCase)].mapAIs);
      const cut = drive.events.find((event) => event.event === "cut");
      const listsIn = cut?.event === "cut" ? cut.data.lists_in : 0;
      let revision = "";

      if (trouble !== null) {
        // One seat answered 500 and one came after the cut: the late list was merged as revision 2, which keeps revision 1's paths.
        if (check.seats < 3) throw new Error(`${startCase.id} needs at least three list seats`);
        expect([...trouble.roles.values()], startCase.id).toEqual(expect.arrayContaining(["ON_TIME", "FAILS", "LATE"]));
        expect(world.stubs.requests.slice(from).some((request) => request.kind === "START_LIST" && request.answer === "VENDOR_ERROR"), startCase.id).toBe(true);
        expect(listsIn, startCase.id).toBeLessThan(check.seats - 1);
        expect(drive.late.length, startCase.id).toBeGreaterThanOrEqual(1);
        const first = drive.merges[0];
        if (first === undefined || first.source === "NONE") throw new Error(`${startCase.id}: the first merge gave no menu`);
        expect(first.menu.menu.revision, startCase.id).toBe(1);
        expect(menu.menu.revision, startCase.id).toBe(2);
        expect(menu.menu.paths.slice(0, first.menu.menu.paths.length), startCase.id).toEqual(first.menu.menu.paths);
        expect(menu.menu.paths.length, startCase.id).toBeGreaterThan(first.menu.menu.paths.length);
        revision = `, one seat answering 500; revision 2 keeps revision 1's ${String(first.menu.menu.paths.length)} paths`;
      }

      // No Start: only the calls before Start are booked, all to the case's owner, each run-less; no debate starts.
      if (startCase.start === "NO_START") {
        const charges = await preStartCharges(who.ownerRef);
        expect([...new Set(charges.map((charge) => charge.kind))].sort(), startCase.id).toEqual(expect.arrayContaining(["ANGLES", "LIST", "MERGE"]));
        expect(charges.every((charge) => charge.spend_source === "PRE_START" && charge.run_id === null), startCase.id).toBe(true);
        expect((await world.database.pool.query("SELECT 1 FROM core.run_ownership_event WHERE owner_ref=$1", [who.ownerRef])).rows, startCase.id).toEqual([]);
        expect((await world.database.pool.query("SELECT 1 FROM billing.run_charge_scope WHERE owner_ref=$1", [who.ownerRef])).rows, startCase.id).toEqual([]);
        expect(world.queue, startCase.id).toEqual([]);
        say(`SEEN private ${startCase.id}: ${String(check.seats)} seats, ${String(listsIn)} in at the cut, ${String(drive.late.length)} late; `
          + `${String(charges.length)} pre-Start charges (${[...new Set(charges.map((charge) => charge.kind))].join(",")}), all run-less; no debate; ${String(overSlots(from))} calls over a gate's slots`);
        say(`START-STEP TIMING ${startCase.id} (${startCase.plan}): card at ${seconds(timed.marks.cardMs)} s from ${String(listsIn)} list(s); ${String(drive.late.length)} late; no Start`);
        return;
      }

      // Start: the person's shaped list, or the AIs' top paths at How wide (the latest menu: TROUBLE's revision 2).
      const startPaths = startCase.start === "SHAPED" ? await shapedChoice(drive, who.client) : topPathsChoice(drive, widths.default);
      if (startPaths === null) throw new Error(`${startCase.id}: no paths to start with`);
      if (trouble !== null) expect(startPaths.menu?.menu.revision, startCase.id).toBe(2);
      let split = "";
      if (startCase.start === "SHAPED") {
        // Spec §8's Plus case is a combine, a split and an own path: the menu's put-together path after the first two goes to Start as
        // one path per viewpoint, each in its own words.
        const grouped = menu.menu.paths.slice(2).find((path) => path.put_together);
        if (grouped === undefined) throw new Error(`${startCase.id}: the menu has no put-together path to split`);
        const alone = (id: string): number => startPaths.paths.filter((path) => path.members.length === 1
          && (path.members[0] as { viewpoint_id?: string }).viewpoint_id === id).length;
        expect(grouped.viewpoint_ids.map(alone), startCase.id).toEqual(grouped.viewpoint_ids.map(() => 1));
        split = `, a put-together path split into ${String(grouped.viewpoint_ids.length)}`;
      }
      const runId = await admitted(startCase, () => createDebate(drive.read.questionLine, configOf(startCase, startCase.depth), COOKIE_SESSION_MARKER, who.client,
        undefined, undefined, undefined, freeLane, { startCheck: { ref: check.check_ref }, startPaths }));
      let runs = await settled(startCase);
      const { answer } = await served(who, runId);
      const branches = answer.branches;
      if (branches === undefined) throw new Error(`${startCase.id}: the answer has no paths`);
      expect(branches.source, startCase.id).toBe("MENU");
      expect(branches.paths.map((path) => path.title), startCase.id).toEqual(startPaths.paths.map((path) => path.title));
      if (startCase.start === "SHAPED") {
        // The person's list: every path argued, every path searched; the AIs' combined path and the person's own are there.
        expect(branches.paths.map((path) => path.state), startCase.id).toEqual(branches.paths.map(() => "ARGUED"));
        expect(branches.paths.map((path) => pathWebOf(answer, path.path_id)?.search.status), startCase.id).toEqual(branches.paths.map(() => "SEARCHED"));
        expect(branches.paths.map((path) => path.author), startCase.id).toEqual(expect.arrayContaining(["AI_COMBINED", "PERSON_OWN_VIEW"]));
        expect(branches.paths.some((path) => path.title === SHAPED_OWN_TEXT), startCase.id).toBe(true);
      }
      if (startCase.plan === "FREE") {
        // Spec §8's Free case: at most 3 paths, and no search (every path's web part says not on this plan).
        expect(branches.paths.length, startCase.id).toBeLessThanOrEqual(START_STEP_LIMITS.freePathsMax);
        expect(branches.paths.map((path) => pathWebOf(answer, path.path_id)?.search.status), startCase.id).toEqual(branches.paths.map(() => "NOT_ON_PLAN"));
      }
      const filled = await pathsFilledIn(runId);

      // A dig with paths of the debate just settled.
      let dug = "";
      if (startCase.dig) {
        const dig = await digWithPaths(startCase, who, runId);
        runs += await settled(startCase);
        const ids = (await world.database.pool.query<{ ids: string[] | null }>("SELECT core.read_start_path_ids($1) AS ids", [dig.runId])).rows[0]!.ids;
        expect(ids, startCase.id).toEqual(Array.from({ length: dig.picks }, (_, at) => `b${String(at + 1)}`));
        dug = `; a dig of ${String(dig.picks)} picks as ${String(dig.picks)} paths, COMPLETED`;
      }
      say(`SEEN private ${startCase.id}: ${String(check.seats)} seats, ${String(listsIn)} in at the cut, ${String(drive.late.length)} late${revision}${split}; `
        + `${String(branches.paths.length)} paths (${branches.paths.map((path) => `${path.author}/${path.state}`).join(" ")}); ${String(runs)} run(s) COMPLETED${dug}; `
        + `${String(overSlots(from))} calls over a gate's slots`);
      say(`START-STEP TIMING ${startCase.id} (${startCase.plan}): card at ${seconds(timed.marks.cardMs)} s from ${String(listsIn)} list(s); ${String(drive.late.length)} late; `
        + `${String(filled.paths)} paths filled in ${String(filled.spreadMs)} ms apart`);
    }, 600_000);
  }
});
