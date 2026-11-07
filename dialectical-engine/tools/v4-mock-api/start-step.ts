/*
 * V4 start step, Task 80 (spec 2026-11-03 §2, §4.1; items ask-f9, choose-d2, ask-f2; owner answers Q8 and Q14; Task 76d's clarify
 * members; 4 Nov night: ask-d3, read-f1, read-f3): THE STEP BEFORE START, played by the mock for the click-test. Plain words:
 *  - POST /v1/asks/paths/lists streams made-up lists as the real step does (the check first, then each seat's progress and list,
 *    one cut, late lists after it, one end), on a scene the question names: none (the default), `#slowpaths`, `#failpaths` or
 *    `#fewpaths`. Seats: Plus 4, Free 2. `#mix` asks for the language first.
 *  - The same words from the mock's one person (same plan, version, level and language choice) are read once in the mock's life:
 *    a second post replays the same lists, and nothing is counted again (ask-f9).
 *  - …/merge streams one menu (the AI's, also from a single list); a late merge keeps every earlier path byte for byte and adds
 *    the late lists' paths at the end, marked new. …/combine and …/fit answer JSON; `#failcombine` makes a combine answer NONE.
 *  - Every reference is the mock's own (`<base64url JSON>.mock`): it names its kind, the read line's hash, the plan and the settings
 *    version. Nothing is secret and no signature is checked; POST /v1/asks reads the plan and the version back (startAskRefusal).
 *  - The room read's start step (How wide and each path count's share, made-up shares) and the room scenes `#siteupdated`,
 *    `#planfails` and `#planfailsall`, set by the switch `roomscene=` (a room read comes before any question is typed).
 *  - POST /v1/asks/clarify: version 2's members (each answer's sentence, the place question marked, "What do you care about most?"),
 *    the scenes `#none`, `#fail`, `#slow`, `#late`, `#purposeonly`, `#nopurpose`, and read-f1's reworded second reading.
 *  - What the calls before Start add to the usage read (they count even without Start), and the counters `/__mock/state` shows.
 * Every body is the contract's (packages/contract) and is checked before it is sent; server.ts runs startStepSelfCheck at its start.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AskClarifyRequestSchema, AskClarifyResponseSchema, FREE_PUBLIC_NOTICE_REQUIRED, SignedStartMenuSchema, START_PATHS_INVALID,
  START_PATHS_NARROWED, START_PATHS_STALE, START_STEP_LIMITS, StartCombineRequestSchema, StartCombineResponseSchema, StartFitRequestSchema,
  StartFitResponseSchema, StartListsEventSchema, StartListsRequestSchema, StartMergeEventSchema, StartMergeRequestSchema, startListNosOfMenu,
  StartStepRoomSchema, type AskClarifyRequest, type AskClarifyResponse, type AskRequest, type ClarifyQuestion, type SignedStartList,
  type SignedStartMenu, type StartAngle, type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse,
  type StartList, type StartListsEvent, type StartListViewpoint, type StartMenu, type StartMenuPath, type StartMenuViewpoint,
  type StartMergeEvent, type StartMergeRequest, type StartStepRoom
} from "../../packages/contract/src/index.js";
import { ASK_CLARIFY_PAGE_WAIT_MS } from "../../apps/ui/lib/v4/clarifyWait.js";

export type StartMockPlan = "PLUS" | "FREE";
type Timed = Readonly<{ atMs: number; event: StartListsEvent }>;

/** The lists scenes, named anywhere in the question line (as `#mix` is). `#siteupdated` also starts the room scene of that name. */
export const START_MOCK_SCENES = Object.freeze(["#slowpaths", "#failpaths", "#fewpaths", "#siteupdated"] as const);
/**
 * The room scenes (switch `roomscene=`): SITEUPDATED (owner answer Q8), 30 s after the first room read the room names the next
 * settings version, whose paid How wide is [3, 5]; PLANFAILS (read-f3), the first two room reads fail and later ones answer;
 * PLANFAILSALL, every room read fails.
 */
export const START_ROOM_SCENES = Object.freeze(["NONE", "SITEUPDATED", "PLANFAILS", "PLANFAILSALL"] as const);
export type StartRoomScene = typeof START_ROOM_SCENES[number];

/** The settings version the mock's room reads name (server.ts's room read), and how long #siteupdated waits before the next one. */
const MOCK_SETTINGS_VERSION = 20;
const SITE_UPDATE_AFTER_MS = 30_000;
/** Made-up times (ms after the post). The slow scene's cut mirrors START_STEP_TIMING.cutAtMs (packages/map/src/start-step.ts). */
const CHECK_MS = 600;
const FAIL_MS = 3_000;
const SCENE_TIMES = Object.freeze({
  DEFAULT: Object.freeze({ listMs: Object.freeze([2_000, 4_000, 6_000, 12_000]), cutMs: 6_000 }),
  SLOW: Object.freeze({ listMs: Object.freeze([20_000, 40_000, 70_000, 95_000]), cutMs: 30_000 })
});
const MERGE_MS = 1_500;
const LATE_MERGE_MS = 1_000;
const COMBINE_MS = 1_000;
const FIT_MS = 800;
const HEARTBEAT_MS = 10_000;
/** The clarifying call: as before; `#late` (ask-d3) at 9 s; `#slow` always past the page's own wait (5 s more), whatever that is. */
const CLARIFY_MS = 900;
const CLARIFY_LATE_MS = 9_000;
const CLARIFY_SLOW_MS = ASK_CLARIFY_PAGE_WAIT_MS + 5_000;
const SEATS: Readonly<Record<StartMockPlan, number>> = Object.freeze({ PLUS: 4, FREE: 2 });
/** Made-up shares of today (Free: of the month) a debate of 1, 2, … paths takes: Plus at depth 1, Plus deeper, Free. */
const PLUS_FIRST_SHARES = Object.freeze([6, 9, 12, 15, 18, 21, 24]);
const PLUS_DEEPER_SHARES = Object.freeze([11, 16, 21, 26, 31, 36, 41]);
const FREE_SHARES = Object.freeze([8, 12, 16]);
const ENGLISH = Object.freeze({ code: "en", name: "English" });
const L = START_STEP_LIMITS;

// ---------------------------------------------------------------------------------------------------------------
// The made-up lists: four seats' worth, written for any question. Repeats share a title; two pairs are put together by the merge.
// ---------------------------------------------------------------------------------------------------------------

const ANGLES: Readonly<Record<string, Pick<StartAngle, "kind" | "label">>> = Object.freeze({
  g1: { kind: "OPPOSITE_CASE", label: "The strongest case against" },
  g2: { kind: "ASKER_WORRY", label: "What worries people most" },
  g3: { kind: "PRACTICAL", label: "What it means day to day" },
  g4: { kind: "SPECIFIC", label: "One place that tried it" },
  g5: { kind: "GENERAL", label: "The big picture" },
  g6: { kind: "PRACTICAL", label: "Money and costs" },
  g7: { kind: "SPECIFIC", label: "Who is affected" }
});
type PoolItem = Readonly<{ title: string; question: string; why: string; angle: string }>;
const LIST_POOL: readonly Readonly<{ angles: readonly string[]; items: readonly PoolItem[] }>[] = Object.freeze([
  { angles: ["g1", "g3", "g5"], items: [
    { title: "The cost over ten years", question: "What would it cost over the next ten years, all in?", why: "Money decides most choices like this one.", angle: "g3" },
    { title: "Who gains and who loses", question: "Who would be better off, and who would be worse off?", why: "The same choice lands differently on different people.", angle: "g5" },
    { title: "The strongest case against it", question: "What is the best argument against doing it?", why: "A fair answer meets the other side at its strongest.", angle: "g1" },
    { title: "What the evidence says so far", question: "What do studies and past results say about it so far?", why: "What already happened is the firmest ground.", angle: "g5" },
    { title: "What could go wrong", question: "What could go wrong, and how likely is it?", why: "Risks are easy to skip when a plan sounds good.", angle: "g1" }
  ] },
  { angles: ["g2", "g4", "g6"], items: [
    { title: "The cost over ten years", question: "How much would it cost each year for the next ten years?", why: "The yearly bill is what people feel.", angle: "g6" },
    { title: "What people fear most", question: "What are people most afraid of here, and are those fears borne out?", why: "Fears shape what people accept.", angle: "g2" },
    { title: "A place that already tried it", question: "What happened where this was already tried?", why: "One real case says more than a forecast.", angle: "g4" },
    { title: "Hidden costs nobody counts", question: "Which costs are left out of the usual sums?", why: "The costs nobody counts are often the ones that decide.", angle: "g6" }
  ] },
  { angles: ["g1", "g7"], items: [
    { title: "Who gains and who loses", question: "Which groups gain the most, and which lose the most?", why: "Winners and losers decide whether a plan lasts.", angle: "g7" },
    { title: "The people left out", question: "Who is not part of this debate but would live with the result?", why: "The people left out often pay the most.", angle: "g7" },
    { title: "What would change the answer", question: "Which one fact, if it turned out different, would change the answer?", why: "Knowing what would change it shows how firm it is.", angle: "g1" }
  ] },
  { angles: ["g5", "g6"], items: [
    { title: "The long view, past 2050", question: "How does this look over the long run, past 2050?", why: "Some effects show only after decades.", angle: "g5" },
    { title: "Hidden costs nobody counts", question: "What costs would show up later that nobody counts today?", why: "Late costs change the whole sum.", angle: "g6" },
    { title: "A cheaper way to the same goal", question: "Is there a cheaper way to reach the same goal?", why: "The best plan is not always the first one named.", angle: "g6" }
  ] }
]);
/** The merge's own groups: two viewpoints with these titles go into one path, in the merge's words. */
const MERGED_GROUPS = Object.freeze([
  { titles: ["The cost over ten years", "Hidden costs nobody counts"], title: "What it really costs",
    question: "What would it really cost over the years, the hidden costs included?" },
  { titles: ["The strongest case against it", "What could go wrong"], title: "The case against, and the risks",
    question: "What is the strongest case against it, and what could go wrong?" }
]);
const CARDS: StartMenu["cards"] = [
  { card_id: "cd1", kind: "CHOICE_NOT_WEIGHED", sentence: "Nobody weighed leaving things as they are.",
    new_path: { title: "If nothing changes", question: "What happens if nothing changes at all?" }, fits_path_ref: null, as_question: null },
  { card_id: "cd2", kind: "WHAT_WOULD_CHANGE_IT", sentence: "One number could flip the answer: the real cost.",
    new_path: { title: "The number that decides it", question: "Which single number would change the answer?" }, fits_path_ref: "kp01", as_question: null },
  { card_id: "cd3", kind: "OTHER_READING", sentence: "Your question can also be read as a question about fairness.",
    new_path: { title: "Read as a question of fairness", question: "Is it fair to everyone who would pay for it?" }, fits_path_ref: null,
    as_question: "Is it fair to everyone who would pay for it?" }
];

function listOf(listNo: number): StartList {
  const pool = LIST_POOL[(listNo - 1) % LIST_POOL.length]!;
  return {
    list_no: listNo,
    angles: pool.angles.map((angle_id) => ({ angle_id, ...ANGLES[angle_id]! })),
    viewpoints: pool.items.map((item, at) => ({ viewpoint_id: `pt${String(listNo)}${String(at + 1)}`, title: item.title, question: item.question,
      why: item.why, angle_id: item.angle }))
  };
}

// ---------------------------------------------------------------------------------------------------------------
// References: the mock's own, never secret, read back at POST /v1/asks
// ---------------------------------------------------------------------------------------------------------------

type RefBinding = Readonly<{ question: string; plan: StartMockPlan; version: number }>;
export type MockStartRef = RefBinding & Readonly<{ kind: string }>;

const lineHash = (line: string): string => createHash("sha256").update(line.trim(), "utf8").digest("hex").slice(0, 16);

function signRef(kind: string, binding: RefBinding, extra: Readonly<Record<string, string | number>> = {}): string {
  const body = { k: kind, q: binding.question, p: binding.plan, v: binding.version, ...extra };
  return `${Buffer.from(JSON.stringify(body), "utf8").toString("base64url")}.mock`;
}

/** A reference the mock wrote: its kind, the read line's hash, the plan and the settings version; null for anything else. */
export function mockStartRefOf(ref: string): MockStartRef | null {
  const [body, mark, more] = ref.split(".");
  if (body === undefined || mark !== "mock" || more !== undefined) return null;
  try {
    const { k, q, p, v } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof k !== "string" || typeof q !== "string" || (p !== "PLUS" && p !== "FREE") || typeof v !== "number") return null;
    return Object.freeze({ kind: k, question: q, plan: p, version: v });
  } catch {
    return null;
  }
}

const bindingOf = (ref: string, fallback: RefBinding): RefBinding => mockStartRefOf(ref) ?? fallback;

// ---------------------------------------------------------------------------------------------------------------
// The room: its scenes and its start step
// ---------------------------------------------------------------------------------------------------------------

let roomScene: StartRoomScene = "NONE";
let roomSceneReads = 0;
/** When #siteupdated's 30 s started: the scene's first room read, or the post that named it in a question. */
let roomSceneClockAt: number | null = null;

/** Starts a room scene afresh (its reads counted from zero); `clockFrom`: its 30 s start then, not at its first room read. */
export function setStartRoomScene(scene: StartRoomScene, clockFrom?: number): void {
  roomScene = scene;
  roomSceneReads = 0;
  roomSceneClockAt = clockFrom ?? null;
}

export function startRoomScene(): StartRoomScene {
  return roomScene;
}

/** One room read under the scene: FAIL makes server.ts answer 503 (read-f3). The first read starts #siteupdated's 30 s. */
export function startRoomReadOutcome(now = Date.now()): "ANSWER" | "FAIL" {
  roomSceneReads += 1;
  roomSceneClockAt ??= now;
  if (roomScene === "PLANFAILSALL") return "FAIL";
  if (roomScene === "PLANFAILS" && roomSceneReads <= 2) return "FAIL";
  return "ANSWER";
}

/** The settings version the room names now: the next one 30 s into #siteupdated (owner answer Q8). */
export function startSettingsVersion(now = Date.now()): number {
  const moved = roomScene === "SITEUPDATED" && roomSceneClockAt !== null && now - roomSceneClockAt >= SITE_UPDATE_AFTER_MS;
  return moved ? MOCK_SETTINGS_VERSION + 1 : MOCK_SETTINGS_VERSION;
}

function roomPartOf(plan: StartMockPlan, depth: number, narrowed: boolean): StartStepRoom {
  if (plan === "FREE") return { lists: "ON", widths: { options: [3], default: 3 }, share_by_paths: [...FREE_SHARES] };
  const options = narrowed ? [3, 5] : [3, 5, 7];
  return { lists: "ON", widths: { options, default: 5 }, share_by_paths: (depth >= 2 ? PLUS_DEEPER_SHARES : PLUS_FIRST_SHARES).slice(0, Math.max(...options)) };
}

/** The room read's `start_step`: the lists run, How wide (Plus [3, 5, 7], [3, 5] after #siteupdated; Free [3]) and made-up shares. */
export function startStepRoomPart(plan: StartMockPlan, depth: number, now = Date.now()): StartStepRoom {
  return roomPartOf(plan, depth, startSettingsVersion(now) > MOCK_SETTINGS_VERSION);
}

const widestOf = (plan: StartMockPlan, now: number): number => Math.max(...startStepRoomPart(plan, 1, now).widths.options);

/**
 * POST /v1/asks, as the API refuses before anything starts. The Free notice lock (ask-f2, owner answer Q14): the mock's start step
 * is on for every plan, so a Free new question without `free_public_notice` is held, 403. The paths chosen before Start: the
 * question line is never compared (choose-d2: words typed on step 2 are the person's), another plan's references are STALE, and
 * references from an earlier settings version go on unless they hold more paths than the room's widest now (NARROWED, Q8).
 */
export function startAskRefusal(input: Readonly<{ ask: AskRequest; newQuestion: boolean; plan: StartMockPlan; now?: number }>):
  Readonly<{ status: 400 | 403 | 409; error: string }> | null {
  const { ask, plan } = input;
  const now = input.now ?? Date.now();
  if (input.newQuestion && plan === "FREE" && ask.free_public_notice !== true) return { status: 403, error: FREE_PUBLIC_NOTICE_REQUIRED };
  const ref = ask.start_check?.ref ?? ask.start_paths?.menu?.ref;
  if (ref === undefined) return null;
  const binding = mockStartRefOf(ref);
  if (binding === null) return { status: 400, error: START_PATHS_INVALID };
  if (binding.plan !== plan) return { status: 409, error: START_PATHS_STALE };
  const chosen = ask.start_paths?.paths.length ?? 0;
  if (binding.version !== startSettingsVersion(now) && chosen > widestOf(plan, now)) return { status: 409, error: START_PATHS_NARROWED };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The lists stream's script
// ---------------------------------------------------------------------------------------------------------------

function listsScriptOf(question: string, plan: StartMockPlan, version: number): readonly Timed[] {
  const binding: RefBinding = { question: lineHash(question), plan, version };
  const failing = /#failpaths/iu.test(question);
  const seats = /#fewpaths/iu.test(question) ? 1 : SEATS[plan];
  const times = /#slowpaths/iu.test(question) ? SCENE_TIMES.SLOW : SCENE_TIMES.DEFAULT;
  const events: Timed[] = [{ atMs: CHECK_MS, event: { event: "check", data: { check_ref: signRef("check", binding), language: { ...ENGLISH }, seats } } }];
  if (failing) {
    for (let answered = 1; answered <= seats; answered += 1) events.push({ atMs: FAIL_MS, event: { event: "progress", data: { answered, of: seats } } });
    events.push({ atMs: FAIL_MS, event: { event: "none", data: { reason: "NO_LISTS" } } }, { atMs: FAIL_MS, event: { event: "end", data: { reason: "NONE" } } });
    return Object.freeze(events);
  }
  // The real step's STREAM cut (packages/map mapRunStartLists): at the cut time once a list is in, else with the first list after it,
  // or when every seat has ended; a list after the cut is late.
  let cut = false;
  let listsIn = 0;
  let lastMs = CHECK_MS;
  for (let seat = 1; seat <= seats; seat += 1) {
    const atMs = times.listMs[seat - 1]!;
    lastMs = atMs;
    if (!cut && listsIn > 0 && atMs > times.cutMs) {
      events.push({ atMs: times.cutMs, event: { event: "cut", data: { lists_in: listsIn } } });
      cut = true;
    }
    events.push({ atMs, event: { event: "progress", data: { answered: seat, of: seats } } });
    const list = { list: listOf(seat), ref: signRef("list", binding, { n: seat }) };
    if (cut) {
      events.push({ atMs, event: { event: "late_list", data: { list } } });
      continue;
    }
    events.push({ atMs, event: { event: "list", data: { list } } });
    listsIn += 1;
    if (atMs >= times.cutMs) {
      events.push({ atMs, event: { event: "cut", data: { lists_in: listsIn } } });
      cut = true;
    }
  }
  if (!cut) events.push({ atMs: lastMs, event: { event: "cut", data: { lists_in: listsIn } } });
  events.push({ atMs: lastMs, event: { event: "end", data: { reason: "DONE" } } });
  return Object.freeze(events);
}

/** The lists stream for this line and plan, signed under the room's settings version now; each event with its time after the post. */
export function mockStartListsScript(question: string, plan: StartMockPlan, now = Date.now()): readonly Readonly<{ atMs: number; event: StartListsEvent }>[] {
  return listsScriptOf(question, plan, startSettingsVersion(now));
}

// ---------------------------------------------------------------------------------------------------------------
// The merge (first and late), combine and fit
// ---------------------------------------------------------------------------------------------------------------

const pathRefOf = (no: number): string => `kp${String(no).padStart(2, "0")}`;
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function anglesOf(groups: readonly Readonly<{ angles: readonly StartAngle[] }>[]): StartAngle[] {
  const seen = new Map<string, StartAngle>();
  for (const angle of groups.flatMap((group) => group.angles)) if (!seen.has(angle.angle_id)) seen.set(angle.angle_id, { ...angle });
  return [...seen.values()].sort((a, b) => byId(a.angle_id, b.angle_id));
}

/**
 * Places the new viewpoints: one with the title of a shown one is its repeat (up to eight), the rest are shown; then each shown one
 * not yet in a path gets one, two of a merge group together in the group's words.
 */
function placeViewpoints(fresh: readonly StartListViewpoint[], viewpoints: StartMenuViewpoint[], firstRef: number, isNew: boolean):
  Readonly<{ shown: StartMenuViewpoint[]; repeats: StartListViewpoint[]; paths: StartMenuPath[] }> {
  const byTitle = new Map<string, StartMenuViewpoint>();
  for (const one of viewpoints) if (!byTitle.has(one.title)) byTitle.set(one.title, one);
  const shown: StartMenuViewpoint[] = [];
  const repeats: StartListViewpoint[] = [];
  for (const one of fresh) {
    const first = byTitle.get(one.title);
    if (first !== undefined && first.repeat_ids.length < 8) {
      first.repeat_ids.push(one.viewpoint_id);
      repeats.push({ ...one });
      continue;
    }
    const added: StartMenuViewpoint = { ...one, repeat_ids: [] };
    shown.push(added);
    viewpoints.push(added);
    if (first === undefined) byTitle.set(one.title, added);
  }
  const placed = new Set<string>();
  const paths: StartMenuPath[] = [];
  for (const one of shown) {
    if (placed.has(one.viewpoint_id)) continue;
    const group = MERGED_GROUPS.find((candidate) => candidate.titles.includes(one.title));
    const members = group === undefined ? [one] : shown.filter((other) => !placed.has(other.viewpoint_id) && group.titles.includes(other.title));
    for (const member of members) placed.add(member.viewpoint_id);
    const together = members.length > 1 && group !== undefined;
    paths.push({ path_ref: pathRefOf(firstRef + paths.length), title: together ? group.title : one.title, question: together ? group.question : one.question,
      viewpoint_ids: members.map((member) => member.viewpoint_id), put_together: together, is_new: isNew });
  }
  return { shown, repeats, paths };
}

function suggestionsOf(paths: readonly StartMenuPath[]): StartMenu["suggestions"] {
  const suggestions: StartMenu["suggestions"] = [];
  const second = paths[1];
  const last = paths.at(-1);
  if (paths.length >= 3 && second !== undefined && last !== undefined) {
    suggestions.push({ suggestion_id: "sg1", kind: "COMBINE", path_refs: [second.path_ref, last.path_ref], reason: "These two look at the question from close angles." });
  }
  const first = paths[0];
  const fourth = paths[3];
  if (first !== undefined && fourth !== undefined) {
    suggestions.push({ suggestion_id: `sg${String(suggestions.length + 1)}`, kind: "FITS", path_ref: fourth.path_ref, into_path_ref: first.path_ref });
  }
  return suggestions;
}

/**
 * The merge's menu: the first (revision 1) from the lists in by the cut, one list too, always the AI's (source AI, with cards and
 * suggestions); a late one (`prior`) as revision + 1, every earlier path, card and suggestion as it was, the late lists' new paths
 * appended and marked new (a late repeat joins the repeats of the viewpoint it repeats). Lists the menu already holds are skipped.
 */
export function mockStartMenu(lists: readonly SignedStartList[], prior: SignedStartMenu | null): Readonly<{ source: "AI" | "CODE"; menu: SignedStartMenu }> {
  const fallback: RefBinding = { question: "", plan: "PLUS", version: startSettingsVersion() };
  if (prior === null) {
    const head = lists[0];
    const binding = head === undefined ? fallback : bindingOf(head.ref, fallback);
    const viewpoints: StartMenuViewpoint[] = [];
    const placed = placeViewpoints(lists.flatMap((one) => one.list.viewpoints), viewpoints, 1, false);
    const menuId = createHash("sha256").update(lists.map((one) => one.ref).join(" "), "utf8").digest("base64url").slice(0, 22);
    const menu: StartMenu = { menu_id: menuId, revision: 1, language: { ...ENGLISH }, angles: anglesOf(lists.map((one) => one.list)),
      viewpoints: placed.shown, repeats: placed.repeats, paths: placed.paths, cards: structuredClone(CARDS), suggestions: suggestionsOf(placed.paths) };
    return Object.freeze({ source: "AI" as const, menu: { menu, ref: signRef("menu", binding, { id: menuId, r: 1 }) } });
  }
  const binding = bindingOf(prior.ref, fallback);
  const held = new Set(startListNosOfMenu(prior.menu));
  const late = lists.filter((one) => !held.has(one.list.list_no));
  const before = structuredClone(prior.menu);
  const viewpoints = before.viewpoints;
  const refs = before.paths.map((path) => Number(path.path_ref.slice(2)));
  const placed = placeViewpoints(late.flatMap((one) => one.list.viewpoints), viewpoints, Math.max(0, ...refs) + 1, true);
  const revision = before.revision + 1;
  const menu: StartMenu = { ...before, revision, angles: anglesOf([before, ...late.map((one) => one.list)]), viewpoints,
    repeats: [...before.repeats, ...placed.repeats], paths: [...before.paths, ...placed.paths] };
  return Object.freeze({ source: "AI" as const, menu: { menu, ref: signRef("menu", binding, { id: menu.menu_id, r: revision }) } });
}

/** At most `max` UTF-16 units, cut at a word edge (never inside a surrogate pair). */
function cutAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space > 0) cut = cut.slice(0, space);
  else if (/[\uD800-\uDBFF]/u.test(cut.slice(-1))) cut = cut.slice(0, -1);
  return cut.trim();
}

/** One question for several points: the AI's made-up words over the members, or NONE when `#failcombine` is in the line or a point. */
export function mockStartCombine(request: StartCombineRequest, plan: StartMockPlan = "PLUS"): StartCombineResponse {
  const line = request.context.kind === "MENU" ? request.context.question_line : "";
  const texts = [line, ...request.members.flatMap((member) => [member.title ?? "", member.question])];
  if (texts.some((text) => /#failcombine/iu.test(text))) return { source: "NONE", reason: "TRANSPORT" };
  const fallback: RefBinding = { question: lineHash(request.context.kind === "MENU" ? line : request.context.parent_run_id), plan,
    version: startSettingsVersion() };
  const binding = request.context.kind === "MENU" ? bindingOf(request.context.check_ref, fallback) : fallback;
  const titles = request.members.map((member) => member.title ?? cutAtWord(member.question, 40));
  return {
    source: "AI",
    title: cutAtWord(`Together: ${titles.join(" and ")}`, L.pathTitleMaxChars),
    question: cutAtWord(`Taken together: ${request.members.map((member) => member.question).join(" ")}`, L.pathQuestionMaxChars),
    combine_ref: signRef("combine", binding)
  };
}

const wordsOf = (text: string): Set<string> => new Set(text.toLocaleLowerCase("en").match(/\p{L}{4,}/gu) ?? []);

/** Which chosen path the person's own view fits: the first sharing a word of four letters or more with it; none otherwise. */
export function mockStartFit(request: StartFitRequest): StartFitResponse {
  const own = wordsOf(request.own_text);
  const fits = request.paths.find((path) => [...wordsOf(`${path.title} ${path.question}`)].some((word) => own.has(word)));
  return { source: "AI", fits_key: fits?.key ?? null };
}

// ---------------------------------------------------------------------------------------------------------------
// The clarifying questions (version 2's members, Task 76d; read-f1's reworded second reading)
// ---------------------------------------------------------------------------------------------------------------

const PLACE: ClarifyQuestion = { text: "Which country or region is this about?", answers: ["Romania", "The EU as a whole", "Anywhere in general"],
  sentences: ["I mean in Romania.", "I mean the EU as a whole.", "I mean anywhere, in general."], about_place: true };
const WHEN: ClarifyQuestion = { text: "Over what time?", answers: ["The next 5 years", "The next 25 years", "To 2035"],
  sentences: ["I mean the next 5 years.", "I mean the next 25 years.", "I mean up to 2035."] };
/** read-f1: the second reading's wording of WHEN, its answers kept but the last (which the page then sets aside, if it was picked). */
const BY_WHEN: ClarifyQuestion = { text: "By when?", answers: WHEN.answers.slice(0, -1), sentences: WHEN.sentences!.slice(0, -1) };
const PURPOSE: ClarifyQuestion = { text: "What do you want the answer for?", answers: ["To decide how to vote", "To explain it to someone", "To write about it"],
  sentences: ["I want it to decide how to vote.", "I want to explain it to someone.", "I want to write about it."] };
const CARES: ClarifyQuestion = { text: "What do you care about most?", answers: ["The cost", "Fairness", "Safety"],
  sentences: ["What I care about is: the cost.", "What I care about is: fairness.", "What I care about is: safety."] };

/** The reply for a line, by the scene its end names: `#none` none; `#purposeonly` the purpose question alone; `#nopurpose` without it. */
function clarifyReplyOf(line: string, reworded: boolean): AskClarifyResponse {
  if (line.endsWith("#none")) return { source: "NONE" };
  if (line.endsWith("#purposeonly")) return { source: "AI", questions: [], purpose: structuredClone(PURPOSE) };
  const questions = structuredClone([PLACE, reworded ? BY_WHEN : WHEN]);
  return { source: "AI", questions, ...(line.endsWith("#nopurpose") ? {} : { purpose: structuredClone(PURPOSE) }), cares: structuredClone(CARES) };
}

/** The first line whose reading had questions; a later, different line gets them reworded (read-f1). */
let firstClarifyLine: string | null = null;

/**
 * POST /v1/asks/clarify's answer and when it comes: `#fail` 503, `#late` after 9 s (ask-d3), `#slow` past the page's own wait, else
 * after 0.9 s. A second, different line from the mock's person after a first reading with questions gets that reading's questions
 * reworded ("Over what time?" becomes "By when?", its answers kept but the last), so the page shows kept and set-aside answers.
 */
export function mockClarify(request: AskClarifyRequest): Readonly<{ delayMs: number; status: 200 | 503; body: unknown }> {
  const line = request.question_line.trim();
  const delayMs = line.endsWith("#slow") ? CLARIFY_SLOW_MS : line.endsWith("#late") ? CLARIFY_LATE_MS : CLARIFY_MS;
  if (line.endsWith("#fail")) return { delayMs, status: 503, body: { error: "MOCK_FAILURE", message: "MOCK_FAILURE" } };
  const plain = clarifyReplyOf(line, false);
  if (plain.source !== "AI" || plain.questions.length === 0) return { delayMs, status: 200, body: plain };
  firstClarifyLine ??= line;
  return { delayMs, status: 200, body: line === firstClarifyLine ? plain : clarifyReplyOf(line, true) };
}

// ---------------------------------------------------------------------------------------------------------------
// The counters, and what the calls before Start add to the usage read
// ---------------------------------------------------------------------------------------------------------------

const counters = { lists: 0, merges: 0, combines: 0, fits: 0 };

/** The calls before Start the mock has made: a new reading of lists, a merge, a combine, a fit (a replayed reading counts none). */
export function startStepCounters(): Readonly<{ lists: number; merges: number; combines: number; fits: number }> {
  return Object.freeze({ ...counters });
}

/** Made-up: what those calls add to every window of the usage read, in whole percent (they count even without Start). */
export function startStepUsedPercent(): number {
  return 2 * counters.lists + counters.merges + counters.combines + counters.fits;
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------------

type Schema = { safeParse(value: unknown): { success: boolean; error?: unknown } };

function logRequest(path: string, status: number, note = ""): void {
  if (process.env.MOCK_QUIET === "1") return;
  process.stderr.write(`[mock] POST ${path} ${String(status)}${note === "" ? "" : ` ${note}`}\n`);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 1_048_576) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolveBody(text.trim() === "" ? null : JSON.parse(text));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, path: string, status: number, body: unknown, schema?: Schema): void {
  let finalStatus = status;
  let finalBody = body;
  if (schema !== undefined && !schema.safeParse(body).success) {
    process.stderr.write(`[mock] RESPONSE FAILED ITS SCHEMA for POST ${path}\n`);
    finalStatus = 500;
    finalBody = { error: "MOCK_RESPONSE_INVALID", message: "The mock built a body that fails the contract schema; see the mock's log." };
  }
  const text = JSON.stringify(finalBody);
  res.writeHead(finalStatus, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(text)) });
  res.end(text);
  logRequest(path, finalStatus);
}

const malformed = (res: ServerResponse, path: string): void => {
  sendJson(res, path, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
};
const gone = (res: ServerResponse): boolean => res.destroyed || res.writableEnded;

function wait(res: ServerResponse, ms: number): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    res.once("close", () => {
      clearTimeout(timer);
      done();
    });
  });
}

/**
 * Plays timed events as an event stream (`event: <name>`, `data: <json>`, a keep-alive comment every 10 s), from `startedAt`: an
 * event whose time has passed (a replayed reading) goes at once, the rest at their times, in order. Each event is the contract's;
 * one that is not ends the stream `none TRANSPORT`. Resolves when the stream ends or the page goes.
 */
function playStream<E extends { event: string; data: unknown }>(res: ServerResponse, path: string, events: readonly Readonly<{ atMs: number; event: E }>[],
  startedAt: number, schema: Schema): Promise<void> {
  return new Promise((done) => {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
    logRequest(path, 200, "(event stream)");
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const beat = setInterval(() => {
      if (!gone(res)) res.write(": keep-alive\n\n");
    }, HEARTBEAT_MS);
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(beat);
      done();
    };
    const frame = (event: { event: string; data: unknown }): string => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    let index = 0;
    const next = (): void => {
      while (!finished && index < events.length && events[index]!.atMs <= Date.now() - startedAt) {
        const one = events[index]!.event;
        index += 1;
        if (gone(res)) return finish();
        if (!schema.safeParse(one).success) {
          process.stderr.write(`[mock] EVENT FAILED ITS SCHEMA for POST ${path}: ${one.event}\n`);
          res.write(frame({ event: "none", data: { reason: "TRANSPORT" } }));
          res.end(frame({ event: "end", data: { reason: "NONE" } }));
          return finish();
        }
        if (one.event === "end") {
          res.end(frame(one));
          return finish();
        }
        res.write(frame(one));
      }
      if (!finished && index < events.length) timer = setTimeout(next, events[index]!.atMs - (Date.now() - startedAt));
    };
    res.once("close", finish);
    next();
  });
}

/** The lists readings of the mock's life (ask-f9), by plan, version, level, language choice and the person's words. */
const readings = new Map<string, Readonly<{ startedAt: number; events: readonly Timed[] }>>();
/** The merges answered (ask-f9 for the merge): by the lists, the menu so far and the answers sent. */
const merges = new Map<string, Readonly<{ late: boolean; answer: StartMergeEvent }>>();

async function lists(req: IncomingMessage, res: ServerResponse, path: string, plan: StartMockPlan): Promise<void> {
  const parsed = StartListsRequestSchema.safeParse(await readBody(req).catch(() => undefined));
  if (!parsed.success) return malformed(res, path);
  const asked = parsed.data;
  const now = Date.now();
  const words = asked.question_language_choice?.original_question_line ?? asked.question_line;
  // #siteupdated named in the question: the room scene starts, its 30 s from this post (a room read may not follow until later).
  if (/#siteupdated/iu.test(words) && roomScene !== "SITEUPDATED") setStartRoomScene("SITEUPDATED", now);
  if (/#mix/iu.test(asked.question_line) && asked.question_language_choice === undefined) {
    const proposed = asked.question_line.replace(/#mix/giu, "").replace(/\s{2,}/gu, " ").trim() || asked.question_line;
    const offer = { check_ref: `mockoffer.${lineHash(asked.question_line)}`, main_language: { ...ENGLISH },
      languages_seen: [{ ...ENGLISH }, { code: "ro", name: "Romanian" }], proposed_question: proposed };
    return playStream(res, path, [{ atMs: CHECK_MS, event: { event: "language_offer", data: { offer } } },
      { atMs: CHECK_MS, event: { event: "end", data: { reason: "LANGUAGE_CHOICE" } } }], now, StartListsEventSchema);
  }
  const version = startSettingsVersion(now);
  const key = JSON.stringify([plan, version, asked.reading_level, asked.question_language_choice?.choice ?? "-", words]);
  let reading = readings.get(key);
  if (reading === undefined) {
    reading = Object.freeze({ startedAt: now, events: listsScriptOf(asked.question_line, plan, version) });
    readings.set(key, reading);
    counters.lists += 1;
  }
  return playStream(res, path, reading.events, reading.startedAt, StartListsEventSchema);
}

function mergeAnswerOf(request: StartMergeRequest): StartMergeEvent {
  if (request.prior_menu !== undefined && request.prior_menu.menu.revision >= L.menuRevisionsMax) return { event: "none", data: { reason: "NO_LISTS" } };
  const made = mockStartMenu(request.lists, request.prior_menu ?? null);
  return { event: "menu", data: { source: made.source, menu: made.menu } };
}

async function merge(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const parsed = StartMergeRequestSchema.safeParse(await readBody(req).catch(() => undefined));
  if (!parsed.success) return malformed(res, path);
  const asked = parsed.data;
  const key = JSON.stringify([asked.lists.map((one) => one.ref), asked.prior_menu?.ref ?? null, asked.clarify ?? null]);
  let kept = merges.get(key);
  if (kept === undefined) {
    kept = Object.freeze({ late: asked.prior_menu !== undefined, answer: mergeAnswerOf(asked) });
    merges.set(key, kept);
    counters.merges += 1;
  }
  const atMs = kept.late ? LATE_MERGE_MS : MERGE_MS;
  const end: StartMergeEvent = { event: "end", data: { reason: kept.answer.event === "menu" ? "DONE" : "NONE" } };
  return playStream(res, path, [{ atMs, event: kept.answer }, { atMs, event: end }], Date.now(), StartMergeEventSchema);
}

async function combine(req: IncomingMessage, res: ServerResponse, path: string, plan: StartMockPlan): Promise<void> {
  const parsed = StartCombineRequestSchema.safeParse(await readBody(req).catch(() => undefined));
  if (!parsed.success) return malformed(res, path);
  counters.combines += 1;
  await wait(res, COMBINE_MS);
  if (!gone(res)) sendJson(res, path, 200, mockStartCombine(parsed.data, plan), StartCombineResponseSchema);
}

async function fit(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const parsed = StartFitRequestSchema.safeParse(await readBody(req).catch(() => undefined));
  if (!parsed.success) return malformed(res, path);
  counters.fits += 1;
  await wait(res, FIT_MS);
  if (!gone(res)) sendJson(res, path, 200, mockStartFit(parsed.data), StartFitResponseSchema);
}

async function clarify(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const parsed = AskClarifyRequestSchema.safeParse(await readBody(req).catch(() => undefined));
  if (!parsed.success) return malformed(res, path);
  const reply = mockClarify(parsed.data);
  await wait(res, reply.delayMs);
  if (gone(res)) return;
  sendJson(res, path, reply.status, reply.body, reply.status === 200 ? AskClarifyResponseSchema : undefined);
}

/**
 * The step's routes: POST /v1/asks/clarify, …/paths/lists, …/paths/merge, …/paths/combine and …/paths/fit, for the mock's person on
 * `context.plan`. True when the route was one of them (answered, or refused 400); false for anything else, which server.ts answers.
 * Resolves once the answer is sent, the stream has ended, or the page has gone.
 */
export async function routeStartStep(req: IncomingMessage, res: ServerResponse, path: string, method: string,
  context: Readonly<{ plan: StartMockPlan }> = { plan: "PLUS" }): Promise<boolean> {
  if (method !== "POST") return false;
  if (path === "/v1/asks/clarify") await clarify(req, res, path);
  else if (path === "/v1/asks/paths/lists") await lists(req, res, path, context.plan);
  else if (path === "/v1/asks/paths/merge") await merge(req, res, path);
  else if (path === "/v1/asks/paths/combine") await combine(req, res, path, context.plan);
  else if (path === "/v1/asks/paths/fit") await fit(req, res, path);
  else return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The startup check (server.ts): every body this module can send passes its contract schema
// ---------------------------------------------------------------------------------------------------------------

/** Checks every scene's stream, menus, combine, fit, clarify reply and room part; throws MOCK_SEED_INVALID on the first bad one. */
export function startStepSelfCheck(): number {
  let count = 0;
  const check = (label: string, schema: Schema, body: unknown): void => {
    const result = schema.safeParse(body);
    if (!result.success) throw new Error(`MOCK_SEED_INVALID: ${label} does not pass its contract schema:\n${JSON.stringify(result.error, null, 2)}`);
    count += 1;
  };
  const question = "Should towns close their centres to cars at weekends?";
  for (const plan of ["PLUS", "FREE"] as const) {
    for (const depth of [1, 2]) {
      for (const narrowed of [false, true]) check(`start_step (${plan}, depth ${String(depth)}, narrowed ${String(narrowed)})`, StartStepRoomSchema, roomPartOf(plan, depth, narrowed));
    }
    for (const scene of ["", " #slowpaths", " #failpaths", " #fewpaths"]) {
      const script = listsScriptOf(`${question}${scene}`, plan, MOCK_SETTINGS_VERSION);
      for (const one of script) check(`lists (${plan}${scene}) ${one.event.event}`, StartListsEventSchema, one.event);
      const inByCut = script.flatMap((one) => (one.event.event === "list" ? [one.event.data.list] : []));
      if (inByCut.length === 0) continue;
      let menu = mockStartMenu(inByCut, null).menu;
      check(`merge (${plan}${scene})`, SignedStartMenuSchema, menu);
      for (const one of script) {
        if (one.event.event !== "late_list") continue;
        menu = mockStartMenu([one.event.data.list], menu).menu;
        check(`late merge (${plan}${scene}) revision ${String(menu.menu.revision)}`, SignedStartMenuSchema, menu);
      }
      const checkEvent = script[0]!.event;
      const checkRef = checkEvent.event === "check" ? checkEvent.data.check_ref : "x.mock";
      const members = menu.menu.paths.slice(0, 2).map((path) => ({ viewpoint_id: path.viewpoint_ids[0]!, pick_no: null, title: path.title, question: path.question }));
      if (members.length === 2) {
        const context = { kind: "MENU" as const, question_line: question, check_ref: checkRef, menu_id: menu.menu.menu_id };
        check(`combine (${plan}${scene})`, StartCombineResponseSchema, mockStartCombine({ context, reading_level: "plain", members }, plan));
      }
      check(`fit (${plan}${scene})`, StartFitResponseSchema, mockStartFit({ question_line: question, check_ref: checkRef, reading_level: "plain",
        own_text: "The cost would fall on the shops.", paths: menu.menu.paths.slice(0, 7).map((path) => ({ key: path.path_ref, title: path.title, question: path.question })) }));
    }
  }
  for (const end of ["", " #none", " #purposeonly", " #nopurpose"]) {
    for (const reworded of [false, true]) check(`clarify (${end || "default"}, reworded ${String(reworded)})`, AskClarifyResponseSchema, clarifyReplyOf(`${question}${end}`, reworded));
  }
  return count;
}
