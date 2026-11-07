/**
 * Preview practice, mode "debate": the start step, its digs and the month report (V4 start step, Task 91b; spec 2026-11-03 §5 and the
 * decision record of 3 Nov).
 *
 * Plain words: the Free month (2 questions at 3 paths and 2 digs) is measured with real AIs before the upload, not only modelled, and so
 * is the end-of-debate step, which now adds each path's answer so far. `--start-step free:3` (or `premium:5`) makes the practice debate
 * start the way a person's does on the new pages:
 *  1. the step before Start, through the step the ask composition built as main.ts builds it, on the real gates: the lists, the merge
 *     (a late merge when a list came after the first one), and one combine (the menu's first two paths put together, as a person who
 *     combines would ask; its words are not used);
 *  2. Start with the menu's top paths in the AIs' own words (MENU, chosen by the AIs, How wide = the number given: "Just answer it"),
 *     the check of Next and its hand-over, as POST /v1/asks hands them to `submit`; the debate then settles as today's practice does;
 *  3. `--digs N` (0 to 2): each dig takes the debate's "+ N more to explore" first, then the code-found suggestions of one path, at most
 *     the number of paths (DIG_PICKS: one path per pick), admitted, handed over, joined to the investigation and kept as the route does,
 *     and settles.
 * The month's lines (PRE_START, DEBATE, END_OF_DEBATE, DIG: practice-verdict.ts) are read from the throwaway ledger and appended to
 * start-month.jsonl in the --out folder, after a line naming the run (plan, paths, digs, question). Their figures go nowhere else: the
 * progress log says how many lines were written and where, never what they cost.
 *
 * The practice asks without billing, so its plan key is the tier's (`debateShapePlanKeyOf`: free or premium). Plus is measured as
 * premium: the --shape-policy file Step 4 writes gives `plans.premium` the Plus row's sizes in the throwaway register only.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import {
  StartPathsSchema, startListNosOfMenu, type AccountReadingLevel, type AskParent, type AskRequest, type DigPick, type DigSuggestionKind,
  type SignedStartList, type SignedStartMenu, type SiteLanguage, type StartCombineMember, type StartMenuPath, type StartMergeResponse,
  type StartPathChoice, type StartPaths
} from "@debateai/contract";
import { START_STEP_LIMITS, TypedDomainError } from "@debateai/kernel";
import { structureRepairOriginalKey } from "@debateai/providers";
import {
  DEBATE_SHAPE_POLICY_ROW_KEY, debateShapeStartStepStartValues, parseDebateShapePolicy, type BillingPlans, type DebateShapePolicy,
  type FreeFixedGauges
} from "@debateai/register";
import {
  admitDig, digPickAuthorOf, digSuggestionTextOf, joinAtStart, recordDigPicksAtStart, type DigAdmissionPorts, type DigJoinPort, type DigPicksPort
} from "../../apps/api/src/dig-admission.js";
import { ownerScopeOf } from "../../apps/api/src/question-language/decider.js";
import {
  startHandOverOf, startWidthsOfView, type AskStartHandOver, type StartDig, type StartStepView
} from "../../apps/api/src/start-paths-at-ask.js";
import type { StartStepKey } from "../../apps/api/src/start-step/signing.js";
import type { StartStepContext, StartStepPort } from "../../apps/api/src/start-step/step.js";
import { callFamilyOf } from "./practice-lanes.js";
import { parsePracticeRegisterExport, type PracticeRegisterExport } from "./practice-register-import.js";
import { PracticeRefusal } from "./practice-settings.js";
import { practiceStartMonthLines, type PracticeStartMonthCharge, type PracticeStartMonthLine, type PracticeStartMonthPhase } from "./practice-verdict.js";
import { readPracticeLedgerCalls } from "./practice-web.js";

/** The two debate-only flags. */
export const PRACTICE_START_FLAGS = Object.freeze(["--start-step", "--digs"] as const);

/** `--start-step <plan>:<paths>` and `--digs <n>`: the plan key the practice asks under, How wide, and the digs after the debate. */
export type PracticeStartStep = Readonly<{ plan: "free" | "premium"; paths: number; digs: 0 | 1 | 2 }>;

/** The file the month's lines are appended to, in the --out folder (Step 4's three runs share one folder). */
export const PRACTICE_START_MONTH_FILE = "start-month.jsonl";

/** The person's reading level the practice reads under: the practice person picked none; "plain", as the end-to-end world reads. */
export const PRACTICE_START_READING_LEVEL: AccountReadingLevel = "plain";

const START_STEP_FLAG = /^(free|premium):([1-9][0-9]?)$/u;

/**
 * The start step's flags of a command line: null when neither is given (today's debate command, unchanged). Either outside debate
 * mode is refused; so is `--digs` without `--start-step`. `free` takes at most 3 paths (Free's cap in code), `premium` at most How
 * wide's widest; `--digs` is 0, 1 or 2. Every refusal is PRACTICE_FLAG_VALUE_INVALID naming the flag only (the value is never
 * repeated). Read before anything starts, so a bad value can never start a paid run.
 */
export function practiceStartStepFromArgs(mode: string, flags: ReadonlyMap<string, string>): PracticeStartStep | null {
  const given = PRACTICE_START_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const text = flags.get("--start-step");
  if (text === undefined) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--digs");
  const match = START_STEP_FLAG.exec(text);
  const plan = match?.[1] as PracticeStartStep["plan"] | undefined;
  const paths = Number(match?.[2]);
  if (plan === undefined || paths > (plan === "free" ? START_STEP_LIMITS.freePathsMax : START_STEP_LIMITS.pathsMax)) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--start-step");
  }
  const digsText = flags.get("--digs") ?? "0";
  if (!/^[0-2]$/u.test(digsText)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--digs");
  return Object.freeze({ plan, paths, digs: Number(digsText) as PracticeStartStep["digs"] });
}

/**
 * The start step is on for the plan in the version the debate runs on (its row's switch, the engine row in force: the one v2
 * predicate), and How wide offers the number of paths given; else refused before any AI is asked. How wide's options are product
 * values, not money, so the refusal may name them.
 */
export function assertPracticeStartInForce(start: PracticeStartStep, view: StartStepView): void {
  const widths = startWidthsOfView(view, start.plan);
  if (widths === null) {
    throw new PracticeRefusal("PRACTICE_START_STEP_NOT_IN_FORCE",
      "the version's debate-shape row carries no start step for the plan, or no engine row is in force (--shape-policy)");
  }
  if (!widths.options.includes(start.paths)) {
    throw new PracticeRefusal("PRACTICE_START_STEP_WIDTH_NOT_OFFERED", `--start-step (How wide offers ${widths.options.join(", ")} on this plan)`);
  }
}

/**
 * Step 4's --shape-policy file (plan Task 91b Step 4; written outside the repository, never committed): the export's own
 * debateShapePolicy row of its newest version (so `plans.free` is the release's own Free row, never the start values), the start
 * step's start values added, and `plans.premium` given that row's Plus sizes (the practice asks without billing, so Plus is measured
 * as premium). Checked by the register's own parser; refused when the newest version holds no such row.
 */
export function practiceStartShapePolicyOf(register: PracticeRegisterExport): DebateShapePolicy {
  const newest = register.versions[register.versions.length - 1]?.register_version;
  const row = register.rows.find((one) => one.register_version === newest && one.row_key === DEBATE_SHAPE_POLICY_ROW_KEY);
  if (row === undefined) throw new PracticeRefusal("PRACTICE_START_SHAPE_ROW_MISSING", "the export's newest version holds no debateShapePolicy row");
  const own = parseDebateShapePolicy(JSON.parse(row.value_json));
  return parseDebateShapePolicy({ ...own, plans: { ...own.plans, premium: own.plans.plus }, startStep: debateShapeStartStepStartValues() });
}

/** Writes Step 4's file from the export file (a new file only, private); nothing is printed: the file is the only output. */
export function writePracticeStartShapeFile(exportPath: string, outPath: string): void {
  const policy = practiceStartShapePolicyOf(parsePracticeRegisterExport(readFileSync(exportPath, "utf8")));
  writeFileSync(outPath, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

/** The Free plan's fixed gauges in the version (its billingPlans row), or null without the row or the gauges. */
export function practiceFreeGaugesOf(plans: BillingPlans | null): FreeFixedGauges | null {
  return plans?.plans.find((plan) => plan.planId === "FREE")?.fixedGauges ?? null;
}

/**
 * What `--start-step free` changes in the practice's ask, laid over today's premium ask: nothing without the step or on premium; on
 * Free the plan's own settings, as billing decides them for a Free person (`decideSettingsForPlan`): the free tier, composition low,
 * and the plan's sealed risk tier and depth when the version carries them. The practice keeps billing off, so it applies them itself.
 */
export function practiceStartFreeAsk(start: PracticeStartStep | undefined, gauges: FreeFixedGauges | null,
  depthParams: Readonly<Record<string, unknown> & { depth: number }>): Readonly<{ plan_tier?: "free"; composition_budget_tier?: "low";
    risk_tier?: FreeFixedGauges["riskTier"]; depth_params?: Readonly<Record<string, unknown> & { depth: number }> }> {
  if (start?.plan !== "free") return Object.freeze({});
  return Object.freeze({ plan_tier: "free" as const, composition_budget_tier: "low" as const,
    ...(gauges === null ? {} : { risk_tier: gauges.riskTier, depth_params: Object.freeze({ ...depthParams, depth: gauges.depth }) }) });
}

/* ------------------------------------------------------------------ the step before Start */

/** The reading's own signal: the practice never leaves the page. */
const RUNS_ON: AbortSignal = new AbortController().signal;

/**
 * One drive of the step before Start, as the page drives it (Tasks 70 and 71): `check` (the reference of Next; null: none came),
 * the lists in by the cut and after it, the latest menu (null: none), how the lists stream ended (and its none's reason), how many
 * merges were asked, and the one combine's answer (NOT_ASKED: no menu of two paths).
 */
export type PracticeStartDrive = Readonly<{
  check: string | null; lists: readonly SignedStartList[]; late: readonly SignedStartList[]; menu: SignedStartMenu | null;
  end: string | null; none: string | null; merges: number; combine: "AI" | "NONE" | "NOT_ASKED";
}>;

/** The lists held that the menu does not hold yet, in the order they came. */
function unmergedOf(menu: SignedStartMenu, held: readonly SignedStartList[]): readonly SignedStartList[] {
  const inMenu = new Set(startListNosOfMenu(menu.menu));
  return held.filter((one) => !inMenu.has(one.list.list_no));
}

/**
 * Reads the lists and merges them as the page does: the first merge at the cut, with the lists in by then; then one late merge of
 * every list the menu does not hold, with the menu so far (asked once more if it answers none). Then ONE combine: the menu's first two
 * paths put together (a menu of fewer paths asks none). Every call goes through `step`, so each is charged to the person (0158).
 */
export async function drivePracticeStartStep(input: Readonly<{ step: StartStepPort; context: StartStepContext; questionLine: string;
  siteLanguage: SiteLanguage | undefined; readingLevel: AccountReadingLevel }>): Promise<PracticeStartDrive> {
  const { step, context, questionLine, readingLevel } = input;
  const lists: SignedStartList[] = [];
  const late: SignedStartList[] = [];
  const seen: { check: string | null; first: Promise<StartMergeResponse> | null; end: string | null; none: string | null } =
    { check: null, first: null, end: null, none: null };
  const mergeOf = (checkRef: string, signed: readonly SignedStartList[], prior?: SignedStartMenu): Promise<StartMergeResponse> =>
    step.merge({ ...context, question_line: questionLine, check_ref: checkRef, reading_level: readingLevel, lists: [...signed],
      ...(prior === undefined ? {} : { prior_menu: prior }) }, RUNS_ON);
  await step.lists({ ...context, country: null, question_line: questionLine, reading_level: readingLevel,
    ...(input.siteLanguage === undefined ? {} : { site_language: input.siteLanguage }) }, (event) => {
    if (event.event === "check") seen.check = event.data.check_ref;
    else if (event.event === "list") lists.push(event.data.list);
    else if (event.event === "late_list") late.push(event.data.list);
    else if (event.event === "none") seen.none = event.data.reason;
    else if (event.event === "end") seen.end = event.data.reason;
    else if (event.event === "cut" && seen.first === null && seen.check !== null && lists.length > 0) {
      const merging = mergeOf(seen.check, lists);
      // Read below once the stream has ended; until then a failure must not go unhandled.
      merging.catch(() => undefined);
      seen.first = merging;
    }
  }, RUNS_ON);
  const check = seen.check;
  let menu: SignedStartMenu | null = null;
  let merges = 0;
  if (check !== null && seen.first !== null) {
    const first = await seen.first.catch((): StartMergeResponse => ({ source: "NONE", reason: "TRANSPORT" }));
    merges += 1;
    if (first.source !== "NONE") menu = first.menu;
    for (let attempt = 0; menu !== null && attempt < 2; attempt += 1) {
      const pending = unmergedOf(menu, [...lists, ...late]);
      if (pending.length === 0) break;
      const answer = await mergeOf(check, pending, menu).catch((): StartMergeResponse => ({ source: "NONE", reason: "TRANSPORT" }));
      merges += 1;
      if (answer.source !== "NONE") {
        menu = answer.menu;
        break;
      }
    }
  }
  let combine: PracticeStartDrive["combine"] = "NOT_ASKED";
  const [firstPath, secondPath] = menu?.menu.paths ?? [];
  if (menu !== null && check !== null && firstPath !== undefined && secondPath !== undefined) {
    const shown = menu.menu.viewpoints;
    const members: StartCombineMember[] = [...firstPath.viewpoint_ids, ...secondPath.viewpoint_ids].flatMap((id) => {
      const one = shown.find((viewpoint) => viewpoint.viewpoint_id === id);
      return one === undefined ? [] : [{ viewpoint_id: one.viewpoint_id, pick_no: null, title: one.title, question: one.question }];
    });
    if (members.length >= 2) {
      const answer = await step.combine({ ...context, digParent: null, reading_level: readingLevel, members,
        context: { kind: "MENU", question_line: questionLine, check_ref: check, menu_id: menu.menu.menu_id } }, RUNS_ON)
        .catch(() => ({ source: "NONE" as const }));
      combine = answer.source === "AI" ? "AI" : "NONE";
    }
  }
  return Object.freeze({ check, lists: Object.freeze(lists), late: Object.freeze(late), menu, end: seen.end, none: seen.none, merges, combine });
}

/** A menu path as the AIs wrote it: its words and its viewpoints. */
const asWritten = (path: StartMenuPath): StartPathChoice =>
  ({ title: path.title, question: path.question, members: path.viewpoint_ids.map((id) => ({ viewpoint_id: id })) });

/**
 * "Just answer it" on step 2: the menu's first `width` paths (all of them when it has fewer) in the AIs' words, MENU, chosen by the
 * AIs, at How wide `width`, with the lists the menu does not hold yet. Null without a menu. (The tool's own copy of the end-to-end
 * world's topPathsChoice: tools never import tests/support.)
 */
export function practiceTopPaths(drive: PracticeStartDrive, width: number): StartPaths | null {
  const menu = drive.menu;
  if (menu === null) return null;
  const pending = unmergedOf(menu, [...drive.lists, ...drive.late]);
  return StartPathsSchema.parse({ source: "MENU", menu, ...(pending.length === 0 ? {} : { late_lists: [...pending] }),
    paths: menu.menu.paths.slice(0, width).map(asWritten), width, chosen_by: "AIS" });
}

/** The one binding of Next and Start for the practice person (no billing: the plan key is the tier's). */
function bindingOf(input: Readonly<{ ownerRef: string; plan: PracticeStartStep["plan"]; settingsVersion: number }>) {
  return Object.freeze({ ownerScope: ownerScopeOf({ kind: "server", ownerRef: input.ownerRef }), planKey: input.plan,
    settingsVersion: input.settingsVersion });
}

/** A refusal of the hand-over (a TypedDomainError's code), or the error itself to rethrow. */
function refusalCodeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  throw error;
}

/**
 * The step before Start, then the ask Start sends: the debate's own ask with the check of Next and the top paths, and the hand-over
 * POST /v1/asks would give `submit` (`startHandOverOf`, the route's one verifier, with the binding Next used). `refused`: no debate
 * is asked (no menu, or the hand-over refused); the calls already made stay charged.
 */
export async function practiceStartAtNext(input: Readonly<{
  start: PracticeStartStep; step: StartStepPort; key: StartStepKey; view: StartStepView; ownerRef: string; settingsVersion: number;
  request: AskRequest; readingLevel: AccountReadingLevel; progress: (line: string) => void;
}>): Promise<Readonly<{ request: AskRequest; handOver: AskStartHandOver }> | Readonly<{ refused: string }>> {
  const binding = bindingOf({ ownerRef: input.ownerRef, plan: input.start.plan, settingsVersion: input.settingsVersion });
  const context: StartStepContext = Object.freeze({ ownerRef: input.ownerRef, ownerScope: binding.ownerScope, funding: null,
    planKey: binding.planKey, settingsVersion: binding.settingsVersion });
  const drive = await drivePracticeStartStep({ step: input.step, context, questionLine: input.request.question_line,
    siteLanguage: input.request.site_language, readingLevel: input.readingLevel });
  input.progress(`start step: ${String(drive.lists.length)} list(s) by the cut, ${String(drive.late.length)} after it, ${String(drive.merges)} merge(s), `
    + `${drive.menu === null ? "no menu" : `a menu of ${String(drive.menu.menu.paths.length)} path(s)`}; the combine ${drive.combine === "AI"
      ? "written" : drive.combine === "NONE" ? "answered none" : "not asked"}`);
  const paths = practiceTopPaths(drive, input.start.paths);
  if (drive.check === null || paths === null) return Object.freeze({ refused: `START_STEP_NO_MENU:${drive.none ?? drive.end ?? "NO_END"}` });
  const request = { ...input.request, start_check: { ref: drive.check }, start_paths: paths } as AskRequest;
  let handed: ReturnType<typeof startHandOverOf>;
  try {
    handed = startHandOverOf({ key: input.key, ownerRef: input.ownerRef, ask: request, binding, view: input.view, dig: null, now: new Date() });
  } catch (error) {
    return Object.freeze({ refused: refusalCodeOf(error) });
  }
  if (handed === null) return Object.freeze({ refused: "START_STEP_NO_HAND_OVER" });
  input.progress(`start: ${String(paths.paths.length)} path(s) of the menu's top ${String(input.start.paths)}, chosen by the AIs`);
  return Object.freeze({ request, handOver: Object.freeze({ binding: handed.binding, verified: handed.verified, lock: handed.lock }) });
}

/* ------------------------------------------------------------------ the digs */

/** What a dig reads of the debate's served answer: its "+ N more to explore" and each path's code-found suggestions. */
export type PracticeDigSource = Readonly<{
  branches?: Readonly<{ more: readonly Readonly<{ more_id: string; question: string }>[] }> | undefined;
  web?: Readonly<{ paths: readonly Readonly<{ suggestions: readonly Readonly<{ suggestion_id: string; kind: DigSuggestionKind; text: string;
    places: readonly string[] }>[] }>[] }> | undefined;
}> | null;

/**
 * A dig's picks: the debate's "+ N more to explore" first (each a MORE pick: the AIs' words, at its own place, as the page sends it),
 * then, when none is left, the code-found suggestions of the first path that offers any, at the place they share; at most `max`, none
 * an earlier dig took. Never both kinds in one dig: the more items hang under the main question and a path's suggestions under that
 * path, and the route admits only picks on one path (owner Q-D1, `digPicksOnOnePath`).
 */
export function practiceDigPicks(answer: PracticeDigSource, taken: ReadonlySet<string>, max: number): readonly DigPick[] {
  const more = (answer?.branches?.more ?? []).filter((item) => !taken.has(item.more_id));
  if (more.length > 0) {
    return Object.freeze(more.slice(0, max).map((item): DigPick => Object.freeze({ kind: "HELPS_MAIN_QUESTION", suggestion_id: item.more_id,
      place: item.more_id, text: item.question })));
  }
  for (const path of answer?.web?.paths ?? []) {
    const offered = path.suggestions.filter((suggestion) => !taken.has(suggestion.suggestion_id) && suggestion.places.length > 0);
    const place = offered[0]?.places[0];
    if (place === undefined) continue;
    return Object.freeze(offered.filter((suggestion) => suggestion.places[0] === place).slice(0, max).map((suggestion): DigPick =>
      Object.freeze({ kind: suggestion.kind, suggestion_id: suggestion.suggestion_id, place, text: suggestion.text })));
  }
  return Object.freeze([]);
}

/**
 * A dig's question line, in the page's form off an English page (apps/ui/lib/v4/askText.ts `digQuestion`): the pick's text, or the
 * picks numbered; a blank line; the debate's own question in quotes.
 */
export function practiceDigQuestionLine(picks: readonly DigPick[], parentQuestionLine: string): string {
  const body = picks.length === 1 ? picks[0]!.text : picks.map((pick, index) => `${String(index + 1)}. ${pick.text}`).join("\n");
  return `${body}\n\n“${parentQuestionLine}”`;
}

/** One admitted ask's run and the work item the runner runs. */
export type PracticeStartRun = Readonly<{ runId: string; workItemId: string }>;

/**
 * The digs after the debate, one after the other, each as POST /v1/asks takes it: its picks (`practiceDigPicks`), `admitDig`, the
 * hand-over (one path per pick, DIG_PICKS; each pick's author read from the served answer), `submit`, then `joinAtStart` and
 * `recordDigPicksAtStart`, then the dig settles. A dig with nothing left to pick, or refused, ends the digs. Answers each dig's run.
 */
export async function practiceStartDigs(input: Readonly<{
  start: PracticeStartStep; key: StartStepKey; view: StartStepView; ownerRef: string; settingsVersion: number;
  parent: Readonly<{ runId: string; questionLine: string }>;
  /** The debate's own ask (its settings and language); the dig drops its start members and sends its own line and parent. */
  request: AskRequest;
  readAnswer(runId: string): Promise<PracticeDigSource>;
  ports: Readonly<{ admission: DigAdmissionPorts; join: DigJoinPort; picks: DigPicksPort }>;
  submit(ask: AskRequest, handOver: AskStartHandOver | null): Promise<PracticeStartRun | Readonly<{ refused: string }>>;
  settle(run: PracticeStartRun): Promise<string>;
  progress: (line: string) => void;
}>): Promise<readonly string[]> {
  const { start, ownerRef, progress } = input;
  const binding = bindingOf({ ownerRef, plan: start.plan, settingsVersion: input.settingsVersion });
  const answer = await input.readAnswer(input.parent.runId).catch(() => null);
  const taken = new Set<string>();
  const runs: string[] = [];
  const { start_check: _check, start_paths: _paths, ...base } = input.request;
  void _check;
  void _paths;
  for (let digNo = 1; digNo <= start.digs; digNo += 1) {
    const picks = practiceDigPicks(answer, taken, start.paths);
    if (picks.length === 0) {
      progress(`dig ${String(digNo)}: nothing left to dig (the debate's answer offers no more item or suggestion)`);
      break;
    }
    for (const pick of picks) if (pick.suggestion_id !== null) taken.add(pick.suggestion_id);
    const parent: AskParent = Object.freeze({ parent_run_id: input.parent.runId, places: [...new Set(picks.map((pick) => pick.place))],
      mode: "quick" as const, picks: [...picks] });
    const admitted = await admitDig({ ownerRef, parent, free: start.plan === "free" }, input.ports.admission);
    if (admitted.kind !== "ADMIT") {
      progress(`dig ${String(digNo)}: refused at its admission (${admitted.kind === "MALFORMED" ? admitted.reason : admitted.kind})`);
      break;
    }
    const ask = { ...base, question_line: practiceDigQuestionLine(picks, input.parent.questionLine), parent } as AskRequest;
    const suggestionText = async (_owner: string, _parentRunId: string, suggestionId: string): Promise<string | null> =>
      digSuggestionTextOf(answer, suggestionId);
    const dig: StartDig = Object.freeze({ parentRunId: input.parent.runId, picks,
      pickAuthors: Object.freeze(picks.map((pick) => digPickAuthorOf(pick, pick.suggestion_id === null ? null : digSuggestionTextOf(answer, pick.suggestion_id)))) });
    let handed: ReturnType<typeof startHandOverOf>;
    try {
      handed = startHandOverOf({ key: input.key, ownerRef, ask, binding, view: input.view, dig, now: new Date() });
    } catch (error) {
      progress(`dig ${String(digNo)}: refused at Start (${refusalCodeOf(error)})`);
      break;
    }
    const run = await input.submit(ask, handed === null ? null : Object.freeze({ binding: handed.binding, verified: handed.verified, lock: handed.lock }));
    if ("refused" in run) {
      progress(`dig ${String(digNo)}: not admitted (${run.refused})`);
      break;
    }
    const joined = await joinAtStart({ ownerRef, parent, childRunId: run.runId }, input.ports.join, progress);
    if (joined === "JOINED" || joined === "ALREADY") {
      await recordDigPicksAtStart({ ownerRef, parent, childRunId: run.runId, positionRef: admitted.positionRef }, input.ports.picks, suggestionText, progress);
    }
    progress(`dig ${String(digNo)}: run ${run.runId} admitted with ${String(picks.length)} pick(s), joined ${joined}; it starts`);
    const outcome = await input.settle(run);
    progress(`dig ${String(digNo)}: ended ${outcome}`);
    runs.push(run.runId);
  }
  return Object.freeze(runs);
}

/* ------------------------------------------------------------------ the month */

/** The calls that end a debate: each path's answer so far (writer and checker), the main answer and its check, and the story. */
const END_OF_DEBATE_FAMILIES: ReadonlySet<string> = new Set(["PATH_OUTCOME", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER",
  "STORY_CHARTS"]);

/**
 * A run's model call's phase: every call of a dig is the dig's; a debate's call ends it (END_OF_DEBATE) when it is a path's answer so
 * far, the main answer, its check or the story (a structure repair of one of them too: it is that call's), else it is the debate's.
 */
export function practiceStartPhaseOf(callSiteKey: string, dig: boolean): PracticeStartMonthPhase {
  if (dig) return "DIG";
  return END_OF_DEBATE_FAMILIES.has(callFamilyOf(structureRepairOriginalKey(callSiteKey))) ? "END_OF_DEBATE" : "DEBATE";
}

/**
 * Task 54's re-read (each path now fills in early): how far apart the paths filled in, from each path's last accepted answer-so-far
 * writer call (`PATH_OUTCOME:WRITER:<path>:<round>`, a structure repair of one included), first path to last, in whole seconds. Null
 * when no path's answer so far was written. Seconds only, never money.
 */
export function practicePathFillSpread(calls: readonly Readonly<{ callSiteKey: string; outcome: string; finishedAt: Date }>[]):
  Readonly<{ paths: number; spreadSeconds: number }> | null {
  const last = new Map<string, number>();
  for (const call of calls) {
    const path = /^PATH_OUTCOME:WRITER:([0-9]+):/u.exec(structureRepairOriginalKey(call.callSiteKey))?.[1];
    if (path === undefined || call.outcome !== "OK") continue;
    last.set(path, Math.max(last.get(path) ?? Number.NEGATIVE_INFINITY, call.finishedAt.getTime()));
  }
  if (last.size === 0) return null;
  const times = [...last.values()];
  return Object.freeze({ paths: last.size, spreadSeconds: Math.round((Math.max(...times) - Math.min(...times)) / 1000) });
}

/**
 * The month's lines of one question, from the throwaway ledger: every call before Start (0158's run-less rows, at their charge), each
 * model call of the debate and of each dig (its stored usage, priced as the practice prices every call), and each run's search fees
 * when they were paid (`searchFeesPaid`; the stand-in pays none).
 */
export async function readPracticeStartMonth(pool: Pool, input: Readonly<{ parentRunId: string | null; digRunIds: readonly string[];
  searchFeesPaid: boolean }>): Promise<readonly PracticeStartMonthLine[]> {
  const charges: PracticeStartMonthCharge[] = [];
  const preStart = (await pool.query<{ charge_micros: string }>(
    "SELECT charge_micros::text FROM ledger.model_spend WHERE spend_source = 'PRE_START' AND run_id IS NULL ORDER BY charged_on, spend_id")).rows;
  for (const row of preStart) charges.push(Object.freeze({ phase: "PRE_START", runId: null, costNanoUsd: BigInt(row.charge_micros) * 1000n, call: true }));
  const runs = [...(input.parentRunId === null ? [] : [{ runId: input.parentRunId, dig: false }]),
    ...input.digRunIds.map((runId) => ({ runId, dig: true }))];
  for (const { runId, dig } of runs) {
    for (const call of await readPracticeLedgerCalls(pool, runId, "")) {
      charges.push(Object.freeze({ phase: practiceStartPhaseOf(call.callSiteKey, dig), runId, costNanoUsd: call.costNanoUsd, call: true }));
    }
    if (!input.searchFeesPaid) continue;
    const fee = (await pool.query<{ micros: string | null }>(
      "SELECT sum(charge_micros)::text AS micros FROM identity.web_search WHERE run_id = $1", [runId])).rows[0]?.micros ?? null;
    if (fee !== null && fee !== "0") charges.push(Object.freeze({ phase: dig ? "DIG" : "DEBATE", runId, costNanoUsd: BigInt(fee) * 1000n, call: false }));
  }
  return practiceStartMonthLines({ parentRunId: input.parentRunId, digRunIds: input.digRunIds, charges });
}

/**
 * Appends one question's month to start-month.jsonl in `directory` (made private if new): a line naming the run, then its lines.
 * Answers the file's path. The file is only ever appended to, so Step 4's three runs into one --out folder keep each other's.
 */
export function appendPracticeStartMonth(directory: string, run: Readonly<{ plan: PracticeStartStep["plan"]; paths: number; digs: number;
  questionId: string }>, lines: readonly PracticeStartMonthLine[]): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, PRACTICE_START_MONTH_FILE);
  const head = { kind: "START_MONTH_RUN", plan: run.plan, paths: run.paths, digs: run.digs, questionId: run.questionId };
  appendFileSync(path, [head, ...lines].map((line) => `${JSON.stringify(line)}\n`).join(""), { mode: 0o600 });
  return path;
}
