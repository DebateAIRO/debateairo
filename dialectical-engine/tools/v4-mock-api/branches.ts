/*
 * V4 start step, Task 81 (spec 2026-11-03 §2 items 7 and 8, §4.3; items wait-d1, map-d2, journey-f1, wait-f16, public-f25; owner card
 * "Carry-on", "Show it from the start" (Task 57b); owner answer Q17): A PATH DEBATE, played by the mock for the click-test. Plain words:
 *  - A new question is a path debate, as on the API with the start step on. One path per path sent at Start (MENU), in the person's
 *    order, each with who wrote it (Task 33's author rule, read without signatures) and "+ N more" from the menu. With no paths sent
 *    ("Just answer it", or no list), the AIs choose for 8 s (`path_progress: []`), then name five paths (Free three), "Path 1"….
 *  - Each path fills in on its own made-up clock (from the ask; from the naming when the AIs chose): finding sources until 6 s (never on
 *    Free), then arguing, one more point every 2 s up to 6, then checking from 14 s, its points turning "being checked", then "checked",
 *    one by one; at 20 + 6 × (n − 1) s it is argued, with a made-up answer so far and its findings. The answer comes 6 s after the last.
 *  - The scenes, named anywhere in the question line (they combine): `#slowfill` (b2 fills 60 s after its time), `#pathfailed` (b3
 *    fails), `#carryon` (the carry-on box ticked: its line says the answer while the debate runs, then the digs for 20 s, then the report
 *    for 10 s, then nothing). `#reportwaits` (public-f25): the debate's next report is not its first, so it waits for the reset.
 *  - The run read carries no purpose lines (answer Q17: the answers are sentences in the question line).
 * Every body is the contract's (packages/contract); server.ts runs mockPathRunSelfCheck, and checks mockPathRunSamples' answers, at its start.
 */
import {
  mainAnswerTrustWordOf, pathIdOf, pathTrustWordOf, RUN_PATH_LIMITS, RunProjectionSchema, startMoreOf, type AnswerBranch, type AnswerBranches,
  type AnswerWeb, type AskRequest, type CarryOnPart, type PathId, type PathOutcome, type RunPathFinding, type RunPathPointState,
  type RunPathProgress, type RunPathStep, type RunProjection, type StartMenu, type StartPathAuthor, type StartPathChoice,
  type StartPathMember, type StartPaths, type TrustWord
} from "../../packages/contract/src/index.js";
import { joinedPathWords } from "../../packages/kernel/src/path-join.js";
import { mockStartListsScript, mockStartMenu, mockStartRefOf } from "./start-step.js";

/** The fill scenes, named anywhere in the question line (as `#mix` is). They differ from Task 80's lists scenes on purpose. */
export const MOCK_FILL_SCENES = Object.freeze(["#slowfill", "#pathfailed", "#carryon"] as const);
export type MockFillScene = typeof MOCK_FILL_SCENES[number];
/** public-f25: the debate's next report is not its first (a visitor's or the person's own stands), so it waits for the reset. */
export const MOCK_REPORT_WAITS_SCENE = "#reportwaits";

/** Made-up times (ms). The path clock starts at the ask, or when the AIs named the paths (8 s later) when none were sent. */
const FILL = Object.freeze({
  sourcesUntilMs: 6_000, pointEveryMs: 2_000, checkingFromMs: 14_000, firstArguedMs: 20_000, arguedEveryMs: 6_000, slowFillMs: 60_000,
  answerAfterMs: 6_000, namedAfterMs: 8_000, digsForMs: 20_000, reportForMs: 10_000
});
const POINTS_MAX = RUN_PATH_LIMITS.pointsShownMax;
/** With no paths sent: the AIs' own paths, five on a paid plan, three on Free. */
const RUN_BUILT_QUESTIONS = Object.freeze([
  "What is the strongest case for it?", "What is the strongest case against it?", "What would it cost, and who would pay?",
  "What happened where it was already tried?", "What could change the answer?"
]);
const RUN_BUILT_COUNT = Object.freeze({ PAID: 5, FREE: 3 });

const lower = (text: string): string => text.toLocaleLowerCase("en");

/** The fill scenes a question line names, in MOCK_FILL_SCENES order, joined by a space; null for none. */
export function mockFillScenesOf(question: string): string | null {
  const named = MOCK_FILL_SCENES.filter((scene) => lower(question).includes(scene));
  return named.length === 0 ? null : named.join(" ");
}
const names = (scene: string | null, wanted: MockFillScene): boolean => scene !== null && scene.split(" ").includes(wanted);

/** When path n is argued (or fails) on its clock: 20 + 6 × (n − 1) s; under `#slowfill`, b2 60 s later (after every other path). */
function arguedAtMs(pathNo: number, scene: string | null): number {
  return FILL.firstArguedMs + FILL.arguedEveryMs * (pathNo - 1) + (pathNo === 2 && names(scene, "#slowfill") ? FILL.slowFillMs : 0);
}
const failsOf = (pathNo: number, scene: string | null): boolean => pathNo === 3 && names(scene, "#pathfailed");

// ---------------------------------------------------------------------------------------------------------------
// A path's findings and its answer so far (made up; Free never searches, so nothing on it is Sure, as live-seed.ts says)
// ---------------------------------------------------------------------------------------------------------------

const TRUST_PATTERNS: readonly (readonly TrustWord[])[] = Object.freeze([
  ["SURE", "SURE", "SURE_FOR_CASE"], ["SURE", "SURE", "SURE"], ["SURE_FOR_CASE", "STILL_ARGUED", "SURE"], ["SURE", "DIDNT_HOLD", "SURE_FOR_CASE"]
]);
const FINDING_TEXTS: Readonly<Record<TrustWord, readonly string[]>> = Object.freeze({
  SURE: ["The main claim on this path held up when a second AI checked it against the sources.", "A figure this path rests on matches what the sources say."],
  SURE_FOR_CASE: ["This holds for the case asked about, though not everywhere.", "The cost here is in line with what was spent where it was tried, for a place of this size."],
  STILL_ARGUED: ["The AIs still argue about how much one counter-example weighs."],
  DIDNT_HOLD: ["An earlier promise on this path did not hold when it was checked."]
});
const LINE_ENDS: Readonly<Record<TrustWord, string>> = Object.freeze({
  SURE: "this held up when it was checked.", SURE_FOR_CASE: "this holds for the case asked about.",
  STILL_ARGUED: "this held up in part; one point is still argued.", DIDNT_HOLD: "this did not hold up when it was checked."
});
const FATES = Object.freeze({ SURE: "HELD_UP", SURE_FOR_CASE: "HELD_UP", STILL_ARGUED: "PARTLY_HELD", DIDNT_HOLD: "FELL" } as const);
const SUMMARY = "The AIs argued this path for and against, then checked each point. What held is kept here; what is still argued is marked.";
const FAILED_OUTCOME: PathOutcome = Object.freeze({ state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] });

function findingsOf(pathId: string, pathNo: number, free: boolean): RunPathFinding[] {
  const words = TRUST_PATTERNS[(pathNo - 1) % TRUST_PATTERNS.length]!;
  return words.map((word, at) => {
    const trust: TrustWord = free && word === "SURE" ? "SURE_FOR_CASE" : word;
    const texts = FINDING_TEXTS[trust];
    return { node_ref: `mock-${pathId}-${String(at + 1)}`, text: texts[at % texts.length]!, trust };
  });
}

type BranchWords = Omit<AnswerBranch, "state" | "root_node_id" | "outcome">;

function readyOutcomeOf(path: BranchWords, findings: readonly RunPathFinding[]): PathOutcome {
  const trust = pathTrustWordOf(findings.map((finding) => finding.trust)) ?? "STILL_ARGUED";
  const own = path.viewpoints.filter((viewpoint) => viewpoint.own).map((viewpoint) => viewpoint.question);
  return {
    state: "READY",
    text: { line: `${path.title}: ${LINE_ENDS[trust]}`, summary: SUMMARY, fate: FATES[trust] },
    what_changed: [],
    // The person's own words on this path: what became of them (the point of view line).
    view: own.length === 0 ? null : { outcome: "HELPED", scope: "PATH", reason: "Your own view was argued as part of this path, and it held for the case asked about.", own_words: own },
    trust,
    rests_on: findings.map((finding) => finding.node_ref)
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The paths: one per path sent (Task 33's author rule, without signatures), or the AIs' own
// ---------------------------------------------------------------------------------------------------------------

type Member = Readonly<{ viewpointId: string | null; title: string | null; question: string; own: boolean }>;

/** A sent member: the person's own words, a menu viewpoint or card (its words). A dig's pick is not played here (the mock's digs keep their answer). */
function memberOf(member: StartPathMember, menu: StartMenu | null): Member[] {
  if ("own_text" in member) return [{ viewpointId: null, title: null, question: member.own_text.trim(), own: true }];
  if (!("viewpoint_id" in member) || menu === null) return [];
  const shown = menu.viewpoints.find((one) => one.viewpoint_id === member.viewpoint_id);
  if (shown !== undefined) return [{ viewpointId: shown.viewpoint_id, title: shown.title, question: shown.question, own: false }];
  const card = menu.cards.find((one) => one.card_id === member.viewpoint_id);
  return card === undefined ? [] : [{ viewpointId: card.card_id, title: card.new_path.title, question: card.new_path.question, own: false }];
}

const sameWords = (path: StartPathChoice, title: string, question: string): boolean =>
  path.title.trim() === title.trim() && path.question.trim() === question.trim();

/**
 * Who wrote a path, as apps/api/src/start-paths-at-ask.ts authorOf says, with the mock's references read but never verified: one own text,
 * the person's own view; a combine reference the mock wrote, the AI's combined question; a menu path's viewpoints under its words, or one
 * viewpoint or card under its own words, the AI's suggestion; the menu's texts under their code-joined words, combined; anything else, the
 * person's edit.
 */
function authorOf(path: StartPathChoice, members: readonly Member[], menu: StartMenu | null): StartPathAuthor {
  const only = members.length === 1 ? members[0]! : null;
  if (only !== null && only.own) return "PERSON_OWN_VIEW";
  if (path.combine_ref !== undefined && mockStartRefOf(path.combine_ref)?.kind === "combine") return "AI_COMBINED";
  if (menu === null) return "PERSON_EDITED";
  const ids = new Set(members.map((member) => member.viewpointId));
  if (!ids.has(null) && menu.paths.some((one) => one.viewpoint_ids.length === ids.size && one.viewpoint_ids.every((id) => ids.has(id))
    && sameWords(path, one.title, one.question))) return "AI_SUGGESTION";
  if (only !== null && only.viewpointId !== null && only.title !== null && sameWords(path, only.title, only.question)) return "AI_SUGGESTION";
  const texts = members.flatMap((member) => (member.viewpointId !== null && member.title !== null ? [{ title: member.title, question: member.question }] : []));
  if (members.length >= 2 && texts.length === members.length) {
    const joined = joinedPathWords(texts);
    if (sameWords(path, joined.title, joined.question)) return "AI_COMBINED";
  }
  return "PERSON_EDITED";
}

function sentPathsOf(startPaths: StartPaths): BranchWords[] {
  const menu = startPaths.menu?.menu ?? null;
  return startPaths.paths.map((path, at) => {
    const members = path.members.flatMap((member) => memberOf(member, menu));
    return { path_id: pathIdOf(at + 1), order: at + 1, title: path.title.trim(), question: path.question.trim(), author: authorOf(path, members, menu),
      viewpoints: members.map((member) => ({ title: member.title, question: member.question, own: member.own })) };
  });
}

function runBuiltPathsOf(free: boolean): BranchWords[] {
  return RUN_BUILT_QUESTIONS.slice(0, free ? RUN_BUILT_COUNT.FREE : RUN_BUILT_COUNT.PAID).map((question, at) => {
    const title = `Path ${String(at + 1)}`;
    return { path_id: pathIdOf(at + 1), order: at + 1, title, question, author: "AI_SUGGESTION" as const, viewpoints: [{ title, question, own: false }] };
  });
}

/** The path clock: from the ask when paths were sent, from the AIs' naming (8 s later) when none were. */
const pathClockOf = (startPaths: StartPaths | undefined, elapsedMs: number): number =>
  startPaths === undefined ? elapsedMs - FILL.namedAfterMs : elapsedMs;

/**
 * A path debate's paths now: each LOOKING until its time on the path clock, then ARGUED with its made-up answer so far and its root (the
 * seeded position in its place, none past the fourth), or FAILED (b3 under `#pathfailed`). ANSWER: every path done. "+ N more" is the
 * menu's paths none of whose viewpoints was sent. Null: no paths were sent and the AIs are still choosing (the first 8 s). The carry-on
 * box: ticked at Start (`carryOnToReport`, beyond the brief's input) or `#carryon`.
 */
export function mockBranchesOf(input: Readonly<{ startPaths: StartPaths | undefined; free: boolean; positionNodeIds: readonly string[];
  phase: "RUN" | "ANSWER"; elapsedMs: number; scene: string | null; carryOnToReport?: boolean }>): AnswerBranches | null {
  const { startPaths } = input;
  if (startPaths === undefined && input.phase === "RUN" && input.elapsedMs < FILL.namedAfterMs) return null;
  const clock = pathClockOf(startPaths, input.elapsedMs);
  const sent = startPaths === undefined ? runBuiltPathsOf(input.free) : sentPathsOf(startPaths);
  const paths = sent.map((path, at): AnswerBranch => {
    const pathNo = at + 1;
    if (input.phase === "RUN" && clock < arguedAtMs(pathNo, input.scene)) return { ...path, state: "LOOKING", root_node_id: null, outcome: null };
    if (failsOf(pathNo, input.scene)) return { ...path, state: "FAILED", root_node_id: null, outcome: FAILED_OUTCOME };
    return { ...path, state: "ARGUED", root_node_id: input.positionNodeIds[at] ?? null, outcome: readyOutcomeOf(path, findingsOf(path.path_id, pathNo, input.free)) };
  });
  const chosen = new Set(startPaths?.paths.flatMap((path) => path.members.flatMap((member) => ("viewpoint_id" in member ? [member.viewpoint_id] : []))) ?? []);
  const menu = startPaths?.menu?.menu;
  return {
    source: startPaths?.source ?? "RUN_BUILT",
    width: startPaths?.width ?? sent.length,
    paths,
    more: menu === undefined ? [] : startMoreOf(menu, chosen).map((item) => ({ more_id: item.more_id, title: item.title, question: item.question, is_new: item.is_new })),
    also_raised: [],
    main_trust: mainAnswerTrustWordOf(paths.map((path) => path.outcome?.trust ?? null)),
    carry_on_to_report: input.carryOnToReport === true || names(input.scene, "#carryon")
  };
}

/**
 * One path's step line and dots, or its findings once argued (none once failed), at `elapsedMs` on its clock. Finding sources until 6 s
 * (paid only); arguing, one more point every 2 s (from 6 s, Free from 0 s) up to 6; checking from 14 s, each point being checked, then
 * checked, one by one, the last just as the path is argued.
 */
export function mockPathProgress(input: Readonly<{ pathId: PathId; pathNo: number; free: boolean; elapsedMs: number; scene: string | null }>): RunPathProgress {
  const argued = arguedAtMs(input.pathNo, input.scene);
  if (input.elapsedMs >= argued) {
    return { path_id: input.pathId, step: null, points: [], findings: failsOf(input.pathNo, input.scene) ? [] : findingsOf(input.pathId, input.pathNo, input.free) };
  }
  const at = Math.max(0, input.elapsedMs);
  const arguingFrom = input.free ? 0 : FILL.sourcesUntilMs;
  const step: RunPathStep = at < arguingFrom ? "FINDING_SOURCES" : at < FILL.checkingFromMs ? "ARGUING" : "CHECKING";
  const put = at < arguingFrom ? 0 : Math.min(POINTS_MAX, 1 + Math.floor((at - arguingFrom) / FILL.pointEveryMs));
  const pace = (argued - FILL.checkingFromMs) / POINTS_MAX;
  const points = Array.from({ length: put }, (_, index): RunPathPointState => {
    const from = FILL.checkingFromMs + index * pace;
    return at >= from + pace ? "CHECKED" : at >= from ? "BEING_CHECKED" : "PUT_FORWARD";
  });
  return { path_id: input.pathId, step, points, findings: [] };
}

/**
 * The carry-on part (Task 57b, "Show it from the start"): none unless the box was ticked (or `#carryon`); the answer while the debate
 * runs, its paths named or not; then the digs for 20 s after the answer, the report for 10 s, then none (the report is ready).
 */
export function mockCarryOnPart(input: Readonly<{ carryOnToReport: boolean; settled: boolean; sinceAnswerMs: number; scene: string | null }>): CarryOnPart | null {
  if (!input.carryOnToReport && !names(input.scene, "#carryon")) return null;
  if (!input.settled) return "ANSWER";
  if (input.sinceAnswerMs < FILL.digsForMs) return "DIGS";
  if (input.sinceAnswerMs < FILL.digsForMs + FILL.reportForMs) return "REPORT";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// A path debate in server.ts: what POST /v1/asks keeps, when it settles, its run read and its answer
// ---------------------------------------------------------------------------------------------------------------

/** What POST /v1/asks keeps of a new question it argues as a path debate: the paths sent (none: the AIs choose), the plan, the box, the scenes. */
export type MockPathRun = Readonly<{ startPaths: StartPaths | undefined; free: boolean; carryOnToReport: boolean; scene: string | null }>;

export function mockPathRunOf(ask: Pick<AskRequest, "question_line" | "plan_tier" | "start_paths" | "carry_on_to_report">): MockPathRun {
  return Object.freeze({ startPaths: ask.start_paths, free: ask.plan_tier === "free", carryOnToReport: ask.carry_on_to_report === true,
    scene: mockFillScenesOf(ask.question_line) });
}

/** From the ask to the answer: 6 s after the last path is argued (after the AIs' 8 s when none were sent). */
export function mockPathRunMs(run: MockPathRun): number {
  const count = run.startPaths?.paths.length ?? (run.free ? RUN_BUILT_COUNT.FREE : RUN_BUILT_COUNT.PAID);
  const last = Math.max(...Array.from({ length: count }, (_, at) => arguedAtMs(at + 1, run.scene)));
  return (run.startPaths === undefined ? FILL.namedAfterMs : 0) + last + FILL.answerAfterMs;
}

/**
 * The run read's path members now (server.ts runProjection): the paths, each one's progress in order, and the carry-on part. While the AIs
 * choose: `path_progress: []` alone (with the part, the answer, when the box is ticked). A failed debate carries nothing on.
 */
export function mockRunPathsPart(input: Readonly<{ run: MockPathRun; positionNodeIds: readonly string[]; state: RunProjection["state"];
  elapsedMs: number; sinceAnswerMs: number }>): Pick<RunProjection, "branches" | "path_progress" | "carry_on_part"> {
  const { run } = input;
  const settled = input.state === "SETTLED";
  const branches = mockBranchesOf({ startPaths: run.startPaths, free: run.free, positionNodeIds: input.positionNodeIds, phase: settled ? "ANSWER" : "RUN",
    elapsedMs: input.elapsedMs, scene: run.scene, carryOnToReport: run.carryOnToReport });
  const part = input.state === "FAILED" ? null
    : mockCarryOnPart({ carryOnToReport: run.carryOnToReport, settled, sinceAnswerMs: input.sinceAnswerMs, scene: run.scene });
  const carried = part === null ? {} : { carry_on_part: part };
  if (branches === null) return { path_progress: [], ...carried };
  const clock = settled ? Number.MAX_SAFE_INTEGER : pathClockOf(run.startPaths, input.elapsedMs);
  const progress = branches.paths.map((branch) => mockPathProgress({ pathId: pathIdOf(branch.order), pathNo: branch.order, free: run.free, elapsedMs: clock, scene: run.scene }));
  return { branches, path_progress: progress, ...carried };
}

/**
 * The answer's paths (server.ts settledRun): every path done, and its web part named by path id (on a path debate the path id is the
 * position everywhere, spec §4.3): an argued path's web part is its root position's, its suggestions' path places renamed with it; a
 * position no argued path stands on has none.
 */
export function mockAnswerPathsPart(input: Readonly<{ run: MockPathRun; positionNodeIds: readonly string[]; web?: AnswerWeb | undefined }>):
  Readonly<{ branches: AnswerBranches; web?: AnswerWeb }> {
  const { run } = input;
  const branches = mockBranchesOf({ startPaths: run.startPaths, free: run.free, positionNodeIds: input.positionNodeIds, phase: "ANSWER",
    elapsedMs: mockPathRunMs(run), scene: run.scene, carryOnToReport: run.carryOnToReport })!;
  if (input.web === undefined) return { branches };
  const pathOf = new Map(branches.paths.flatMap((branch) => (branch.root_node_id === null ? [] : [[branch.root_node_id, branch.path_id] as const])));
  const place = (one: string): string => (one.startsWith("path:") && pathOf.has(one.slice("path:".length)) ? `path:${pathOf.get(one.slice("path:".length))!}` : one);
  return {
    branches,
    web: {
      paths: input.web.paths.flatMap((path) => {
        const pathId = pathOf.get(path.position_ref);
        return pathId === undefined ? [] : [{ ...path, position_ref: pathId,
          suggestions: path.suggestions.map((suggestion) => ({ ...suggestion, places: suggestion.places.map(place) })) }];
      })
    }
  };
}

/** The answer read's carry-on part (server.ts answerNow), once the answer is served: the digs, then the report, then none. */
export function mockAnswerCarryOn(input: Readonly<{ run: MockPathRun; sinceAnswerMs: number }>): Readonly<{ carry_on_part?: CarryOnPart }> {
  const part = mockCarryOnPart({ carryOnToReport: input.run.carryOnToReport, settled: true, sinceAnswerMs: input.sinceAnswerMs, scene: input.run.scene });
  return part === null ? {} : { carry_on_part: part };
}

// ---------------------------------------------------------------------------------------------------------------
// The report's wait (public-f25, `#reportwaits`)
// ---------------------------------------------------------------------------------------------------------------

export function mockReportWaits(question: string): boolean {
  return lower(question).includes(MOCK_REPORT_WAITS_SCENE);
}

/** The investigation read's `first_closing_left` (Task 56b): false under `#reportwaits`; else true until a report version exists. */
export function mockFirstClosingLeft(input: Readonly<{ question: string; versions: number }>): boolean {
  return !mockReportWaits(input.question) && input.versions === 0;
}

/** POST /v1/runs/{id}/report under `#reportwaits` in the debate's question: 409, nothing started; else null (the press goes on). */
export function mockReportRefusal(question: string):
  Readonly<{ status: 409; body: Readonly<{ error: "PUBLIC_DEBATE_WAITS_FOR_RESET"; message: "PUBLIC_DEBATE_WAITS_FOR_RESET" }> }> | null {
  return mockReportWaits(question)
    ? { status: 409, body: { error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" } }
    : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The startup self-check
// ---------------------------------------------------------------------------------------------------------------

const SAMPLE_QUESTION = "Should towns close their centres to cars at weekends?";
const SAMPLE_OWN = "Shops on the square would lose their weekend customers.";

/**
 * Path debates of every kind the mock plays: three paths sent from a menu (a menu path, one viewpoint, own words), on Plus and on Free;
 * seven menu paths on Plus; none sent, on Plus and on Free; each with no scene, each scene and all three, the box ticked or not.
 */
export function mockPathRunSamples(): readonly MockPathRun[] {
  const lists = mockStartListsScript(SAMPLE_QUESTION, "PLUS").flatMap((one) => (one.event.event === "list" ? [one.event.data.list] : []));
  const menu = mockStartMenu(lists, null).menu;
  const first = menu.menu.paths[0]!;
  const single = menu.menu.viewpoints.find((one) => !first.viewpoint_ids.includes(one.viewpoint_id))!;
  const asWritten = (path: StartMenu["paths"][number]): StartPathChoice =>
    ({ title: path.title, question: path.question, members: path.viewpoint_ids.map((id) => ({ viewpoint_id: id })) });
  const three: StartPaths = { source: "MENU", menu, width: 3, chosen_by: "PERSON", paths: [asWritten(first),
    { title: single.title, question: single.question, members: [{ viewpoint_id: single.viewpoint_id }] },
    { title: "Shops on the square", question: SAMPLE_OWN, members: [{ own_text: SAMPLE_OWN }] }] };
  const wide = menu.menu.paths.slice(0, 7);
  const seven: StartPaths = { source: "MENU", menu, width: wide.length, chosen_by: "AIS", paths: wide.map(asWritten) };
  const shapes: readonly Readonly<{ startPaths: StartPaths | undefined; free: boolean }>[] = [
    { startPaths: three, free: false }, { startPaths: three, free: true }, { startPaths: seven, free: false },
    { startPaths: undefined, free: false }, { startPaths: undefined, free: true }
  ];
  const scenes = [null, ...MOCK_FILL_SCENES, MOCK_FILL_SCENES.join(" ")];
  return Object.freeze(shapes.flatMap((shape) => scenes.flatMap((scene) => [false, true].map((carryOnToReport) =>
    Object.freeze({ ...shape, carryOnToReport, scene })))));
}

/** Every sample's run read, each second from the ask to 40 s after the answer, parses with RunProjectionSchema; the count of reads. */
export function mockPathRunSelfCheck(): number {
  let count = 0;
  for (const run of mockPathRunSamples()) {
    const answerAt = mockPathRunMs(run);
    for (let elapsedMs = 0; elapsedMs <= answerAt + 40_000; elapsedMs += 1_000) {
      const state = elapsedMs >= answerAt ? "SETTLED" as const : "RUNNING" as const;
      const read = { run_ref: "probe", question_line: SAMPLE_QUESTION, state, terminal_reason: null, hold_until: null,
        ...mockRunPathsPart({ run, positionNodeIds: ["n-mix", "n-renew", "n-nuclear", "n-smr"], state, elapsedMs, sinceAnswerMs: elapsedMs - answerAt }) };
      const parsed = RunProjectionSchema.safeParse(read);
      if (!parsed.success) {
        throw new Error(`MOCK_SEED_INVALID: a path debate's run read (${run.startPaths?.source ?? "RUN_BUILT"}, ${String(run.scene)}, at ${String(elapsedMs)} ms) `
          + `does not pass its contract schema:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
      }
      count += 1;
    }
  }
  return count;
}
