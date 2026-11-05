// tests/support/paths-run-harness.ts
// V4 start step, Task 53 (spec 2026-11-03 §4.2-§4.3): ONE PATH DEBATE, END TO END, over the preview harness
// (tests/support/preview-debate-harness.ts): a run admitted with shape receipt v2 (the sizes the admission would freeze at
// the start values, `resolveDebateShapeV2`), engine 2 and the length row, for one encrypted owner; the paths it was sealed
// with at Start written as Start writes them (0157, `PostgresStartPathsStore`), or none (a run that builds its own list);
// the run's own step-2 lines when given (0144's purpose lines, the API's port); the gates scripted by what was asked
// (`scriptedShapeAnswers`, the later steps' defaults), each path's web planner planning a search on Plus when asked; and the
// runner composed as main.ts composes it, to a completed answer. Every name, question and page is made up.
import { StartMenuSchema, type PurposeLines, type StartMenu, type StartPathsSource } from "@debateai/contract";
import { PostgresStartPathsStore, type PathProgressStore, type Pool, type StoredStartPath, type StoredStartPathSet } from "@debateai/db";
import type { PreviewGateRemaining } from "@debateai/providers";
import type { RotatedRoles } from "@debateai/scorecard";
import { mapPromptContractHash } from "@debateai/map";
import {
  debateShapePolicyStartValues, engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveDebateShapeV2,
  resolveLengthGuidance, type DebateShapePlanKey, type DebateShapeV2Input
} from "@debateai/register";
import type { DebateShapeSettings } from "@debateai/contract";
import { postgresPurposeLines } from "../../apps/api/src/purpose-lines.js";
import { searchCallSubject } from "../../apps/runner/src/call-lane-gateway.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";
import type { WebStepRunnerSettings } from "../../apps/runner/src/web-step.js";
import { framedPromptsOf, scriptedShapeAnswers, type ShapePrompt } from "./debate-shape-harness.js";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import {
  OWNER_CALL_CONCURRENCY, PANEL_REFS, RUN_RESILIENCE, type AdmittedRun, type PreviewGates, type previewDebateHarness
} from "./preview-debate-harness.js";
import { stubChatBody, type GateOverride, type GateRequest } from "./preview-gate-stubs.js";
import type { StoryEncryptedOwner } from "./storyEncryptedOwner.js";
import { perplexity, searchMoney } from "./web-step-world.js";

type PathsHarness = ReturnType<typeof previewDebateHarness>;

export const PATHS_SETTINGS: DebateShapeSettings = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });

/** Path n's made-up title and question: "T<n>", "Q<n>?". */
export const pathTitleOf = (pathNo: number): string => `T${String(pathNo)}`;
export const pathQuestionOf = (pathNo: number): string => `Q${String(pathNo)}?`;
/** Menu viewpoint i (0-based): pt<list><item>, six to a list, as the contract numbers them. */
const viewpointIdOf = (at: number): string => `pt${String(Math.floor(at / 6) + 1)}${String((at % 6) + 1)}`;

/**
 * A menu of `count + 1` paths, one viewpoint each, "T<n>" / "Q<n>?": the first `count` are the ones chosen; the last is left
 * unchosen, so the gap round is told it was raised.
 */
export function pathsMenuOf(count: number): StartMenu {
  const all = Array.from({ length: count + 1 }, (_, at) => at);
  return StartMenuSchema.parse({
    menu_id: "M".repeat(22), revision: 1, language: { code: "en", name: "English" },
    angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
    viewpoints: all.map((at) => ({ viewpoint_id: viewpointIdOf(at), title: pathTitleOf(at + 1), question: pathQuestionOf(at + 1),
      why: "It could change the answer.", angle_id: "g1", repeat_ids: [] })),
    repeats: [],
    paths: all.map((at) => ({ path_ref: `kp${String(at).padStart(2, "0")}`, title: pathTitleOf(at + 1), question: pathQuestionOf(at + 1),
      viewpoint_ids: [viewpointIdOf(at)], put_together: false, is_new: false })),
    cards: [], suggestions: []
  });
}

/** The set Start seals for a menu's (or a dig's) `count` paths, chosen by the person, each its own path "T<n>". */
export function storedPathsOf(runId: string, count: number, source: "MENU" | "DIG_PICKS" = "MENU"): StoredStartPathSet {
  const paths: StoredStartPath[] = Array.from({ length: count }, (_, at) => Object.freeze({
    pathId: `b${String(at + 1)}` as StoredStartPath["pathId"], pathNo: at + 1, author: "AI_SUGGESTION" as const,
    title: pathTitleOf(at + 1), question: pathQuestionOf(at + 1),
    viewpoints: Object.freeze([Object.freeze({ viewpointId: source === "MENU" ? viewpointIdOf(at) : null, pickNo: null,
      title: pathTitleOf(at + 1), question: pathQuestionOf(at + 1), own: false })]),
    ownWords: Object.freeze([])
  }));
  return Object.freeze({ runId, source, width: count, chosenBy: "PERSON" as const, carryOnToReport: false, paths: Object.freeze(paths),
    menu: source === "MENU" ? Object.freeze({ menu: pathsMenuOf(count), lateLists: Object.freeze([]) }) : null });
}

/** The panel's refs for a run on `makers` companies: the four-member panel, cut. */
export const panelOf = (makers: number): readonly string[] => PANEL_REFS.slice(0, makers);

/** A request's framed material fields (its contract id first). */
export function materialOf(request: GateRequest): ReturnType<typeof readFramedMaterial> {
  return readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body)));
}

/** Each path's web planner (web.plan-dig.v3) planning two searches, for and against, named by its own path title. */
export function plannedSearchFor(request: GateRequest, chat: string): GateOverride | null {
  if (request.kind !== "WEB_DIG_PLAN") return null;
  const frame = readFramedMaterial(wirePacket(chat));
  const chosen = frame.fields.find((field) => field.name === "chosen")?.content ?? "";
  const tag = /T(\d)/u.exec(chosen)?.[1] ?? "0";
  return { content: JSON.stringify({ country: null, needs_search: true, reason: null, pace: "normal",
    searches: [{ side: "for", local: false, query: `ferry pier queues path ${tag}` }, { side: "against", local: false, query: `ferry riders fall path ${tag}` }] }) };
}

/** Every page read, its first sentence one extract (web.read-all, and the thorough pass's read-top). */
export function readEveryPage(request: GateRequest, chat: string): GateOverride | null {
  if (request.kind !== "WEB_READ_ALL" && request.kind !== "WEB_READ_TOP") return null;
  const frame = readFramedMaterial(wirePacket(chat));
  const pages = JSON.parse(frame.fields.find((field) => field.name === "pages")?.content ?? "[]") as { page_id: string; text?: string }[];
  const opening = (text: string | undefined): string[] => text === undefined ? [] : [text.slice(0, text.indexOf(".") + 1)];
  if (request.kind === "WEB_READ_TOP") {
    return { content: JSON.stringify({ pages: pages.map((page) => ({ page_id: page.page_id, grade: 3, extracts: opening(page.text) })),
      worth_looking_into: [] }) };
  }
  return { content: JSON.stringify({ pages: pages.map((page) => ({ page_id: page.page_id, grade: 3, adds: "It adds a figure.",
    ...(frame.contractId === "web.read-all.v1" ? {} : { note: "The page reports one figure." }), extracts: opening(page.text) })) }) };
}

export type PathsDebateOptions = Readonly<{
  label: string;
  owner: StoryEncryptedOwner;
  /** The plan the receipt was priced on (default "plus"; "free" never searches and has no gap round). */
  plan?: DebateShapePlanKey;
  /** How many paths (default 3). */
  paths?: number;
  /** Where the set comes from (default MENU, written before the run; RUN_BUILT: none, the run builds its own). */
  source?: StartPathsSource;
  /** The companies on the panel (default 4). */
  makers?: number;
  depth?: number;
  question?: string;
  /** The run's own reading level (depth params); absent, none. */
  readingLevel?: "simple" | "standard" | "expert";
  /** The run's step-2 lines (0144), written for its owner before the run. */
  purposeLines?: PurposeLines;
  /** The web step: on (the run's plan read as `webPlan`) or absent (no web settings on the runner). */
  web?: Readonly<{ webPlan: "PLUS" | "FREE"; planSearch?: boolean }>;
  /** Asked before the script for every gate request; null lets the script answer. */
  before?: (request: GateRequest, chat: string) => GateOverride | null;
  /** The runner's progress store (default 0159's on the runner's pool). */
  pathProgress?: PathProgressStore;
  /** The admitted run, given; absent, a new one. */
  debate?: AdmittedRun;
  /** Review Focus 2: the Anthropic gate offers the FINAL_WRITER tier (its `/remaining` names final-writer room), as on the preview. */
  finalWriterTier?: boolean;
  /** Review of Task 53 (Review Focus 3): the preview's run resilience (the sit-out book), as main.ts composes it. */
  resilience?: boolean;
  /** Review of Task 53: false admits a menu's or a dig's run without writing its set (Start never sealed it); absent, it is written. */
  sealSet?: false;
  /**
   * Review of Task 53: the run's rotation pin, written by hand; absent, the one admission picks from the question (so the
   * storyteller differs from run to run).
   */
  pin?: RotatedRoles;
}>;

/** A made-up Anthropic gate `/remaining` with room for one final-writer call (the FINAL_WRITER tier offered). */
export const FINAL_WRITER_ROOM: PreviewGateRemaining = Object.freeze({
  state: "active", windowOpen: true, remainingNanoUsd: 9_000_000_000n, remainingCalls: 500, maxConcurrentCalls: 4,
  largestReservationNanoUsd: 100_000_000n, enabledModels: Object.freeze(["claude-haiku-5-5"]),
  largestFinalWriterReservationNanoUsd: 400_000_000n, finalWriterMaxInFlight: 1
});

export type PathsDebateRun = Readonly<{
  debate: AdmittedRun; gates: PreviewGates; shape: DebateShapeV2Input; result: Readonly<{ kind: "COMPLETED"; answerId: string }>;
  calls: Awaited<ReturnType<PathsHarness["modelCalls"]>>; prompts: readonly ShapePrompt[]; queries: readonly string[];
}>;

/** The sizes the admission freezes for a path debate at the start values. */
export function pathsShapeOf(plan: DebateShapePlanKey, paths: number, source: StartPathsSource, makers: number): DebateShapeV2Input {
  return resolveDebateShapeV2(debateShapePolicyStartValues(), plan, { ...PATHS_SETTINGS, paths, pathsSource: source }, makers);
}

/** Admits a path debate for `owner` (engine 2, the length row, receipt v2) and writes what Start would have written. */
export async function admittedPathsRun(harness: PathsHarness, pool: Pool, options: PathsDebateOptions): Promise<Readonly<{
  debate: AdmittedRun; shape: DebateShapeV2Input }>> {
  const plan = options.plan ?? "plus";
  const count = options.paths ?? 3;
  const source = options.source ?? "MENU";
  const makers = options.makers ?? PANEL_REFS.length;
  const shape = pathsShapeOf(plan, count, source, makers);
  const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan, answerLength: PATHS_SETTINGS.answerLength });
  const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers, mapOpening: false });
  const debate = options.debate ?? await harness.admittedRun(options.label, {
    panelRefs: panelOf(makers), depth: options.depth ?? 1, shapeV2: shape, ...(options.pin === undefined ? {} : { pin: options.pin }),
    settings: { ...PATHS_SETTINGS, ...(options.readingLevel === undefined ? {} : { readingLevel: options.readingLevel }) } as DebateShapeSettings,
    length, engine, owner: options.owner, ...(options.question === undefined ? {} : { question: options.question })
  });
  if (options.debate === undefined && source !== "RUN_BUILT" && options.sealSet !== false) {
    const recorded = await new PostgresStartPathsStore(pool).recordStartPaths(storedPathsOf(debate.runId, count, source === "DIG_PICKS" ? "DIG_PICKS" : "MENU"));
    if (recorded !== "RECORDED") throw new Error(`test: the start set was not recorded (${recorded})`);
  }
  if (options.debate === undefined && options.purposeLines !== undefined) {
    const kept = await postgresPurposeLines(pool).record(options.owner.ownerRef, debate.runId, options.purposeLines);
    if (kept !== "RECORDED") throw new Error(`test: the purpose lines were not recorded (${kept})`);
  }
  return { debate, shape };
}

/** The web step's settings: the given plan read for every run, the scripted Perplexity behind the real adapter. */
export function pathsWebSettings(webPlan: "PLUS" | "FREE"): Readonly<{ settings: WebStepRunnerSettings; queries: readonly string[] }> {
  const search = perplexity();
  const money = searchMoney();
  return { queries: search.queries, settings: Object.freeze({ switchedOn: true, search: search.port, searchSubject: searchCallSubject(undefined),
    searchSeamOf: () => money.seam(), readRunPlan: async () => webPlan }) };
}

/** The scripted gates and the runner composed as main.ts for one admitted path debate. */
async function composedPathsRunner(harness: PathsHarness, debate: AdmittedRun, options: PathsDebateOptions) {
  const scripted = scriptedShapeAnswers(debate.question);
  const before = options.before;
  const planSearch = options.web?.planSearch === true;
  const gates = await harness.startGates({}, undefined, (request, chat) => before?.(request, chat)
    ?? (planSearch ? plannedSearchFor(request, chat) ?? readEveryPage(request, chat) : null) ?? scripted(request, chat));
  const web = options.web === undefined ? null : pathsWebSettings(options.web.webPlan);
  const composed = await harness.previewRunner(gates, "resend", {
    callConcurrency: OWNER_CALL_CONCURRENCY,
    debateShape: { mapContractHash: mapPromptContractHash() },
    engine: { engineContractHash: engineContractHash() },
    ...(web === null ? {} : { webSearch: web.settings }),
    ...(options.pathProgress === undefined ? {} : { pathProgress: options.pathProgress }),
    ...(options.finalWriterTier === true ? { gateRemaining: { anthropic: async () => FINAL_WRITER_ROOM } } : {}),
    ...(options.resilience === true ? { resilience: RUN_RESILIENCE } : {})
  });
  return { gates, composed, web };
}

/**
 * Review of Task 53: one path debate the runner refuses, as it refuses it: the code it threw, the work item's state and terminal
 * reason, and every model call it made first (none, for a refusal before any call).
 */
export async function refusedPathsRun(harness: PathsHarness, pool: Pool, options: PathsDebateOptions): Promise<Readonly<{
  code: string | null; state: string; terminalReason: string | null; calls: Awaited<ReturnType<PathsHarness["modelCalls"]>>; gates: PreviewGates }>> {
  const { debate } = await admittedPathsRun(harness, pool, options);
  const { gates, composed } = await composedPathsRunner(harness, debate, options);
  let code: string | null = null;
  try {
    const result = await composed.runner.executeWorkItem(debate.workItemId);
    throw new Error(`test: the run was not refused (${JSON.stringify(result)})`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("test:")) throw error;
    code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null;
  }
  const row = (await pool.query<{ state: string; terminal_reason: string | null }>(
    `SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1`, [debate.workItemId])).rows[0]!;
  return { code, state: row.state, terminalReason: row.terminal_reason, calls: await harness.modelCalls(debate.runId), gates };
}

/** One path debate, admitted (or given), argued against the scripted gates by a runner composed as main.ts, to its answer. */
export async function runPathsDebate(harness: PathsHarness, pool: Pool, options: PathsDebateOptions): Promise<PathsDebateRun> {
  const { debate, shape } = await admittedPathsRun(harness, pool, options);
  const { gates, composed, web } = await composedPathsRunner(harness, debate, options);
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, shape, result, calls: await harness.modelCalls(debate.runId), prompts: framedPromptsOf(gates.requests),
    queries: web?.queries ?? [] };
}
