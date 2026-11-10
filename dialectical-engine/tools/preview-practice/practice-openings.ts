/**
 * Preview practice, mode "openings" (spec 2026-10-12 §2): today's opening (T) and the three map openings (A snowball,
 * B blind lists, C the angle map) on the fixed questions, with the same AIs.
 *
 * Plain words: for each question, each arm is run in turn. T asks every AI for a full position with today's judge
 * contract, blind. A, B and C run the map (packages/map) through a caller that sends each step through exactly the
 * gateway a formats job uses: the gates, the relay, the preview call policy (its one repair try, its one resend after
 * an unbilled refusal), the gates' watch. Every finished call is handed to `onCall` at once (openings.jsonl), every
 * finished arm to `onArm`. The first AI rotates per question, by the question's fixed place among the twelve, so a
 * rerun of a few questions seats the AIs as the full run did. A busy model waits within its budget, as in formats; once
 * its budget is spent it sits out the rest of the run, and the map applies its fallbacks.
 *
 * Arm S (V4 start step, Task 91; spec 2026-11-03 §4.1): the step before Start, timed per plan. For each question it runs
 * the step on Free, Plus, Pro and Max in turn, as the API runs it: the plan's list seats (startSeatsFor, by today's speed
 * order; the planner is the first seat), the planner and the lists (mapRunStartLists, STREAM), the first merge at the cut
 * and one late merge for the lists after it (mapMergeStartLists, on Haiku), each call through the same gateway as every
 * other arm's, with the API's bound for its kind. Once every call a card asked has ended, `onStartCard` is told its
 * START_CARD line (the card's wait, the lists in by the cut, the late ones, each seat's list time; never a cost).
 *
 * Arm Q (V4 start step, Task 91c; owner card "As picked, on measured time"): the clarifying call of step 1's Next, timed per
 * question. For each question, one reading through the API's own step (apps/api/src/ask-clarify.ts: createAskClarify over
 * its preview transport, askClarifyTransportFor PREVIEW), so the call goes to the Anthropic gate exactly as the site sends
 * it: the sealed contract, ASK_CLARIFY_MODEL_SETTINGS, the step's bound and its one retry, through this run's guarded fetch.
 * `onClarify` is told its CLARIFY_TIME line (the time the page waited, AI or NONE, NONE's code; never a word, never a
 * cost). With `dry` it writes made-up times and calls nothing. The plan named this arm C, the angle map's letter: Q here.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { StartList, StartMenu } from "@debateai/contract";
import { Judge, type JudgeLeg } from "@debateai/judgement";
import {
  mapMergeStartLists,
  mapProviderPieces,
  mapRotateSeats,
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  mapRunStartLists,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapResult,
  type MapRunInput,
  type MapStepSpec,
  type StartClock
} from "@debateai/map";
import {
  createPreviewGuardedFetch,
  promptContractFingerprintText,
  ProviderContentUnacceptedError,
  type CallBound,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type PromptContract,
  type ProviderDiscoveryTarget,
  type ProviderGateway
} from "@debateai/providers";
import { askClarifyTransportFor, createAskClarify, type AskClarifyPort } from "../../apps/api/src/ask-clarify.js";
import { startModelOfSeat, startSeatsFor } from "../../apps/api/src/start-step/seats.js";
import { preStartKindOfCallSite, START_STEP_CALL_BOUNDS } from "../../apps/api/src/start-step/transport.js";
import { abortableWait } from "./practice-concurrency.js";
import {
  errorCodeOf,
  gateOf,
  PRACTICE_FORMATS_DEFAULTS,
  PRACTICE_MODEL_BUSY,
  practiceAttemptsOf,
  practiceFirstRefusalOf,
  practiceJobGateway,
  practiceLimitedPorts,
  practiceNextBusyWait,
  practiceTurnOrder,
  practiceWireUsage,
  type PracticeWaitBudget
} from "./practice-formats.js";
import type { PracticeGateName, PracticeGateObserver, PracticeWireEvent } from "./practice-gate-observer.js";
import { replyContentOf } from "./practice-lanes.js";
import type {
  OpeningsArmLine,
  OpeningsArmNote,
  OpeningsBusyWait,
  OpeningsCall,
  OpeningsCallStatus,
  OpeningsClarifyLine,
  OpeningsStartCardLine,
  OpeningsStep
} from "./practice-openings-log.js";
import { practiceWordingMapExtras, practiceWordingNCaller } from "./practice-map-wording.js";
import {
  OPENINGS_ARMS,
  OPENINGS_ENGINE_ARMS,
  OPENINGS_QUESTIONS,
  OPENINGS_START_ARMS,
  OPENINGS_START_PLANS,
  type OpeningsArm,
  type OpeningsQuestion,
  type OpeningsStartPlan
} from "./practice-openings-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import { PracticeRefusal } from "./practice-settings.js";

/** The map's sizes for five AIs, as a Premium plan (spec §5, Pro: 5 map AIs, 4 answers; up to 2 gap rounds, 1 for arm B). */
export const OPENINGS_MAP_SIZES = Object.freeze({ gapRoundsC: 2, gapRoundsB: 1, maxAnswers: 4, pointsPerAnswer: 4 });

/**
 * Arm S's list writers per plan: the plans' mapAIs of spec 2026-11-03 §4.1 "Which AIs" (S5: Free 2, Plus 4, Pro 5, Max
 * 7). Fixed here, as OPENINGS_MAP_SIZES is: openings reads no register, so each plan is timed with S5's count.
 */
export const OPENINGS_START_LIST_WRITERS: Readonly<Record<OpeningsStartPlan, number>> = Object.freeze({ FREE: 2, PLUS: 4, PRO: 5, MAX: 7 });

/**
 * The calls at once a run allows unless --max-in-flight says otherwise: with arm S, the most list writers of a plan and
 * the merge, so every list of a card starts at the same moment, as the API starts them (spec §4.1); else the formats'
 * (arm Q asks one call at a time).
 */
export function openingsMaxInFlightDefault(arms: readonly OpeningsArm[]): number {
  return arms.includes("S")
    ? Math.max(PRACTICE_FORMATS_DEFAULTS.maxInFlight, ...Object.values(OPENINGS_START_LIST_WRITERS)) + 1
    : PRACTICE_FORMATS_DEFAULTS.maxInFlight;
}

/**
 * Arm Q's made-up times for --dry (Task 91c), in ms, by each question's fixed place among the twelve: --dry calls nothing,
 * so every reading is AI at its time here. Made up; the sitting measures the real ones.
 */
export const OPENINGS_DRY_CLARIFY_MS: readonly number[] = Object.freeze([2_400, 3_100, 2_800, 3_600, 2_200, 4_100, 2_600, 3_300,
  2_900, 3_800, 4_400, 2_500]);

/** The hash of the contract a start-step call sends, as the API's transport records it (the drafts are sealed by Task 92). */
const startContractHashOf = (contract: PromptContract): string =>
  createHash("sha256").update(promptContractFingerprintText(contract), "utf8").digest("hex");

/**
 * The gap rounds an arm may run (ruling T9-m1): A none (the snowball has no gap step; the map forces it too), B exactly
 * one (as Free), C up to two (all five preview AIs, as Premium).
 */
export function openingsGapRoundsMax(arm: Exclude<OpeningsArm, "T">): number {
  return arm === "A" ? 0 : arm === "B" ? OPENINGS_MAP_SIZES.gapRoundsB : OPENINGS_MAP_SIZES.gapRoundsC;
}

export type OpeningsRunInput = Readonly<{
  config: PreviewProviderTestConfig;
  targets: readonly ProviderDiscoveryTarget[];
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  /** Fixed questions only (OPENINGS_QUESTIONS): each seats the AIs by its fixed place. */
  questions: readonly OpeningsQuestion[];
  arms: readonly OpeningsArm[];
  /** The judge organ's bound (the preview policy raises it to its 8,192-token floor). */
  bound: CallBound;
  /** `engine`: engineContractHash(), the seal an engine-2 map call records (arms C2, C2N; Task 17a). */
  contractHashes: Readonly<{ judge: string; map: string; engine?: string }>;
  /** Test seam and --dry: the policy's resend wait and the busy waits. */
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  /** One content-free progress line at a time. */
  progress?: (line: string) => void;
  /** Set to stop between calls (the operator's interrupt). */
  shouldStop?: () => boolean;
  /** Aborted by the operator's interrupt: cuts the busy waits short. */
  stopSignal?: AbortSignal;
  /** Each model's budget of busy waits, in ms (0: a busy model sits out at once). */
  busyWaitMs?: number;
  gateLimits?: Readonly<Partial<Record<PracticeGateName, number>>>;
  maxInFlight?: number;
  onCall?: (call: OpeningsCall) => void;
  onArm?: (arm: OpeningsArmLine) => void;
  /** Told each model marked busy for good (its wait budget spent: it sits out the rest of the run). */
  onBusy?: (model: string) => void;
  onBusyWait?: (wait: OpeningsBusyWait) => void;
  /** Arm S (Task 91): told each card's START_CARD line once every call the card asked has ended. */
  onStartCard?: (card: OpeningsStartCardLine) => void;
  /** Test seam, arm S: the step before Start's clock (its cut, its cap, the planner's race) and the card's times. */
  startClock?: StartClock;
  /** --dry (Task 91c): arm Q writes made-up times (OPENINGS_DRY_CLARIFY_MS) and calls nothing; the other arms' dry answers are the ports'. */
  dry?: boolean;
  /** Arm Q (Task 91c): told each question's CLARIFY_TIME line once its reading has ended. */
  onClarify?: (line: OpeningsClarifyLine) => void;
}>;

export type OpeningsRunResult = Readonly<{ calls: readonly OpeningsCall[]; arms: readonly OpeningsArmLine[]; busyModels: readonly string[];
  /** Arm S's card lines, in run order (none without arm S). */
  startCards: readonly OpeningsStartCardLine[];
  /** Arm Q's CLARIFY_TIME lines, in run order (none without arm Q). */
  clarifyTimes: readonly OpeningsClarifyLine[] }>;

/** The failures that are the reply's format: the gateway's last refusal, the judge's and the map's own readers. */
const OPENINGS_FORMAT_ERRORS: ReadonlySet<string> = new Set(["JUDGE_SCHEMA_FAILURE", "JUDGE_PARSE_FAILURE", "MAP_REPLY_UNREADABLE"]);

type OpeningsCallContext = Readonly<{
  arm: OpeningsArm; question: OpeningsQuestion; step: OpeningsStep; callSiteKey: string;
  target: ProviderDiscoveryTarget; shown: "BLIND" | readonly string[]; order: number;
  /** Arm S only: the plan whose card the call is for. */
  plan?: OpeningsStartPlan;
}>;

/**
 * Each asked question's fixed place among the twelve: its seat rotation (ruling P9). Checked for every question before
 * the first call (ruling T11-m6): a question must be one of the twelve word for word (id, line and language), each at
 * most once, so nothing outside the fixed list is ever sent and a bad selection spends nothing. The refusal never
 * repeats what it was given.
 */
export function openingsQuestionRotations(questions: readonly OpeningsQuestion[]): readonly number[] {
  const rotations = questions.map((question) => OPENINGS_QUESTIONS.findIndex((known) => known.id === question.id
    && known.questionLine === question.questionLine && known.languageTag === question.languageTag && known.languageName === question.languageName));
  if (rotations.some((fixed) => fixed < 0) || new Set(rotations).size !== rotations.length) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--questions (only the fixed question ids, each once)");
  }
  return Object.freeze(rotations);
}

/** The arms asked: each one of T, A, B, C, C2, C2N, S, Q, at most once (checked with the questions, before the first call). */
function openingsAssertArms(arms: readonly OpeningsArm[]): void {
  const known: readonly string[] = [...OPENINGS_ARMS, ...OPENINGS_ENGINE_ARMS, ...OPENINGS_START_ARMS];
  if (arms.some((arm) => !known.includes(arm)) || new Set(arms).size !== arms.length) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--arms (only T, A, B, C, C2, C2N, S, Q, each once)");
  }
}

/**
 * The contract hash a map step records: an engine-2 step (`spec.engine`) the engine seal, any other step the map's hash.
 * A wording-N call keeps `spec.engine`, so it records the engine seal too; its own `.wording-n` id says it is not that
 * seal's text. An engine-2 step with no engine seal is a practice refusal (ruling R3-T17a.2: the arm ends on it, loudly).
 */
export function openingsMapContractHash(spec: Pick<MapStepSpec<unknown>, "engine">, hashes: OpeningsRunInput["contractHashes"]): string {
  if (spec.engine !== true) return hashes.map;
  if (hashes.engine === undefined) throw new PracticeRefusal("PRACTICE_OPENINGS_ENGINE_UNSEALED", "the engine-2 arms need the engine seal");
  return hashes.engine;
}

/**
 * Controller ruling R-1: a merge or choose reply is a long structured list, and a thinking model spends its thinking
 * inside the same bound (a real run's merge used the whole judge bound on thinking and was cut off, then fell back to
 * the code merge). Those two steps get the preview's own per-call answer cap (preview-models.ts).
 */
const OPENINGS_LONG_STEP_TOKEN_CEILING = 32_768;

/** The bound a map step is sent under: MERGE and CHOOSE get the answer room; every other step keeps the judge bound. */
function openingsStepBound(bound: CallBound, step: OpeningsStep): CallBound {
  if (step !== "MERGE" && step !== "CHOOSE") return bound;
  return Object.freeze({ ...bound, tokenCeiling: Math.max(bound.tokenCeiling, OPENINGS_LONG_STEP_TOKEN_CEILING) });
}

export async function runPracticeOpenings(input: OpeningsRunInput): Promise<OpeningsRunResult> {
  // Task 91: each gate event is told to the call that sent it (the call's async context), so two calls of one model at
  // once (arm S's "#2" seats, a merge beside a late list) each count only their own tokens and cost.
  const wireOfCall = new AsyncLocalStorage<PracticeWireEvent[]>();
  const unlisten = input.observer.listen({ event: (event) => { wireOfCall.getStore()?.push(event); } });
  try {
    return await openingsRun(input, wireOfCall);
  } finally {
    unlisten();
  }
}

/** Arm S alone (Task 91): every question's card on Free, Plus, Pro and Max in turn; the card lines, as `onStartCard` is told them. */
export async function runStartStepArm(input: OpeningsRunInput): Promise<readonly OpeningsStartCardLine[]> {
  return (await runPracticeOpenings({ ...input, arms: ["S"] })).startCards;
}

/**
 * Arm Q alone (Task 91c): one clarifying call per question on the Anthropic gate, as apps/api/src/ask-clarify.ts sends it (the
 * sealed contract, ASK_CLARIFY_MODEL_SETTINGS, its bound); the CLARIFY_TIME lines, as `onClarify` is told them. Codes and times
 * only, never words.
 */
export async function runClarifyArm(input: OpeningsRunInput): Promise<readonly OpeningsClarifyLine[]> {
  return (await runPracticeOpenings({ ...input, arms: ["Q"] })).clarifyTimes;
}

async function openingsRun(input: OpeningsRunInput, wireOfCall: AsyncLocalStorage<PracticeWireEvent[]>): Promise<OpeningsRunResult> {
  // The whole selection first: nothing is sent for a run that would refuse midway.
  const rotations = openingsQuestionRotations(input.questions);
  openingsAssertArms(input.arms);
  const budgetMs = input.busyWaitMs ?? 0;
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  // As formats: each call takes a place at its gate, then one overall, before the brake looks at it.
  const guardedFetch = createPreviewGuardedFetch(practiceLimitedPorts(input.ports, {
    ...(input.gateLimits === undefined ? {} : { gateLimits: input.gateLimits }),
    ...(input.maxInFlight === undefined ? {} : { maxInFlight: input.maxInFlight }) }));
  const runId = randomUUID();
  const calls: OpeningsCall[] = [];
  const armLines: OpeningsArmLine[] = [];
  const busy: string[] = [];
  const budgets = new Map<string, PracticeWaitBudget>();
  const record = (call: OpeningsCall) => { const frozen = Object.freeze(call); calls.push(frozen); input.onCall?.(frozen); };

  /**
   * One call: sent through a fresh job gateway, retried after a busy wait while the model's budget lasts, recorded once
   * it ends. Its gate events are the ones its own sending told (`wireOfCall`), so calls of one model in flight together
   * (arm S's "#2" seats) never count each other's.
   */
  const oneCall = async <T>(context: OpeningsCallContext, send: (gateway: ProviderGateway) => Promise<T>): Promise<MapCallOutcome<T>> => {
    const { target } = context;
    const model = target.model;
    const gate = gateOf(model);
    const budget = budgets.get(model) ?? { usedMs: 0, waits: 0, inARow: 0 };
    budgets.set(model, budget);
    const base = { arm: context.arm, questionId: context.question.id, step: context.step, callSiteKey: context.callSiteKey,
      aiRef: target.providerRef, model, maker: target.maker, gate, shown: context.shown, order: context.order,
      ...(context.plan === undefined ? {} : { plan: context.plan }) };
    const skipped = (status: "SKIPPED_MODEL_BUSY" | "SKIPPED_STOPPED", errorCode: string) => {
      const at = new Date().toISOString();
      record({ ...base, startedAt: at, finishedAt: at, latencyMs: 0, inputTokens: null, outputTokens: null, reasoningTokens: null,
        cachedInputTokens: null, costNanoUsd: null, status, errorCode, attempts: [], replyForm: null, replyText: null, firstRefused: null });
    };
    for (;;) {
      if (busy.includes(model)) {
        skipped("SKIPPED_MODEL_BUSY", PRACTICE_MODEL_BUSY);
        return { kind: "BUSY", code: PRACTICE_MODEL_BUSY };
      }
      const stop = input.observer.stopped(gate);
      if (stop !== null || input.shouldStop?.() === true) {
        const code = stop?.reason ?? "PRACTICE_INTERRUPTED";
        skipped("SKIPPED_STOPPED", code);
        return { kind: "FAILED", code };
      }
      const job = practiceJobGateway({ target, config: input.config, guardedFetch, ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
      // F-I1: the content of the last response the gateway accepted. After a patch follow-up it is the merged reply,
      // while the last stored artifact holds only the patch fragment; the owners score the whole reply.
      const accepted: { content: string | null } = { content: null };
      const remembering: ProviderGateway = Object.freeze({
        call: async (request: Parameters<ProviderGateway["call"]>[0]) => {
          const response = await job.gateway.call(request);
          accepted.content = response.content;
          return response;
        }
      });
      const own: PracticeWireEvent[] = [];
      const startedAt = new Date();
      const started = performance.now();
      let value: T | undefined;
      let ok = false;
      let errorCode: string | null = null;
      let formatError = false;
      try {
        value = await wireOfCall.run(own, () => send(remembering));
        ok = true;
      } catch (error) {
        errorCode = errorCodeOf(error);
        formatError = error instanceof ProviderContentUnacceptedError || OPENINGS_FORMAT_ERRORS.has(errorCode);
      }
      const latencyMs = Math.round(performance.now() - started);
      const wire = own.filter((event) => event.model === model);
      const endedBusy = job.endedBusy();
      const next = endedBusy ? practiceNextBusyWait(budget, budgetMs, wire, input.random) : null;
      if (next !== null) {
        // Parked: the same call again after the wait (this try is not recorded as a call; the wire lines keep its calls).
        input.onBusyWait?.(Object.freeze({ model, arm: context.arm, questionId: context.question.id, callSiteKey: context.callSiteKey,
          wait: budget.waits, ...next }));
        input.progress?.(`${model} is busy (refused, not billed): waiting ${String(Math.round(next.waitMs / 1_000))}s, then ${context.callSiteKey} again`);
        await abortableWait(sleep, next.waitMs, input.stopSignal);
        continue;
      }
      if (!endedBusy) budget.inARow = 0;
      const attempts = practiceAttemptsOf(job.sink);
      const refused = job.sink.artifacts.some((artifact) => artifact.parseStatus !== "PARSED");
      const status: OpeningsCallStatus = ok ? (refused ? "REPAIRED" : "ACCEPTED") : endedBusy ? "BUSY" : formatError ? "FORMAT_FAILED" : "CALL_FAILED";
      const last = job.sink.artifacts.at(-1) ?? null;
      record({ ...base, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), latencyMs,
        ...practiceWireUsage(model, wire),
        status, errorCode, attempts,
        replyForm: ok ? ([...attempts].reverse().find((attempt) => attempt.outcome === "OK")?.replyForm ?? null) : null,
        replyText: ok && accepted.content !== null ? reportableReplyText(accepted.content)
          : last === null ? null : reportableReplyText(replyContentOf(last.rawText)),
        // Item 0 (owner 9 Nov): the slip itself, before any repair (a patched call's replyText is the merged reply).
        firstRefused: practiceFirstRefusalOf(job.sink) });
      input.progress?.(`${context.question.id} ${context.arm} ${context.callSiteKey} ${model}: ${status} ${String(latencyMs)}ms`);
      if (endedBusy) {
        // Its budget spent: the model sits out the rest of the run (marked once, after its call is told).
        if (!busy.includes(model)) {
          busy.push(model);
          input.onBusy?.(model);
          input.progress?.(`${model} is busy (refused, not billed): it sits out the rest`);
        }
        return { kind: "BUSY", code: errorCode ?? "PROVIDER_CALL_FAILED" };
      }
      return ok ? { kind: "OK", value: value as T } : { kind: "FAILED", code: errorCode ?? "UNKNOWN" };
    }
  };

  const targetByRef = new Map(input.targets.map((target) => [target.providerRef, target] as const));
  /**
   * The map's caller: each step as role JUDGE on the served lane (the preview's format repair applies), with the hash
   * `openingsMapContractHash` picks (its refusal ends the arm: the map's `abandon` below rethrows it).
   */
  const mapCaller = (arm: OpeningsArm, question: OpeningsQuestion): MapCaller => Object.freeze({
    call: <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      const contractHash = openingsMapContractHash(request.spec, input.contractHashes);
      const target = targetByRef.get(request.seat.aiRef);
      if (target === undefined) return Promise.resolve({ kind: "FAILED", code: "PRACTICE_OPENINGS_UNKNOWN_SEAT" });
      return oneCall<T>({ arm, question, step: request.step, callSiteKey: request.callSiteKey, target, shown: request.shown, order: request.order },
        async (gateway) => {
          const pieces = mapProviderPieces(request.spec);
          const response = await gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
            bound: openingsStepBound(input.bound, request.step), contractHash, providerRef: target.providerRef, packet: pieces.framed.packet,
            classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket });
          return pieces.readAccepted(response.content);
        });
    }
  });

  /** Arm T: today's opening, every AI a full position, blind; root 0 primary, the rest independent (the runner's call sites). */
  const positions = async (question: OpeningsQuestion, seats: readonly ProviderDiscoveryTarget[]): Promise<number> => {
    const ends = await Promise.all(seats.map((target, index) => {
      const leg: JudgeLeg = index === 0 ? { kind: "primary-root" } : { kind: "independent-root" };
      const callSiteKey = index === 0 ? "JUDGE" : index === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(index)}`;
      return oneCall({ arm: "T", question, step: "POSITION", callSiteKey, target, shown: "BLIND", order: index }, async (gateway) => {
        await new Judge(gateway).judge({ runId, subjectItemId: randomUUID(), callSiteKey, questionLine: question.questionLine,
          argumentLanguageName: question.languageName, leg, providerRef: target.providerRef, contractHash: input.contractHashes.judge,
          bound: input.bound });
        return true;
      });
    }));
    return ends.filter((end) => end.kind === "OK").length;
  };

  const targetByModel = new Map(input.targets.map((target) => [target.model, target] as const));
  const startNow = (): number => input.startClock?.now() ?? Date.now();
  /**
   * Arm S's caller: a seat's aiRef is its model, "#2" on a company's second seat (as the API's transport reads it). Each
   * call goes through `oneCall` with the API's bound for its kind (START_STEP_CALL_BOUNDS) and the hash of the contract it
   * sends; every call asked joins `asked`, and a list's time from asked to answered (null: no list) goes to `listMs`.
   */
  const startCaller = (question: OpeningsQuestion, plan: OpeningsStartPlan, asked: Promise<unknown>[],
    listMs: Map<string, number | null>): MapCaller => Object.freeze({
    call: <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      const target = targetByModel.get(startModelOfSeat(request.seat.aiRef));
      const kind = preStartKindOfCallSite(request.callSiteKey);
      if (target === undefined) return Promise.resolve({ kind: "FAILED", code: "PRACTICE_OPENINGS_UNKNOWN_SEAT" });
      if (kind === null) return Promise.resolve({ kind: "FAILED", code: "START_STEP_CALL_SITE_UNKNOWN" });
      const askedAt = startNow();
      const call = oneCall<T>({ arm: "S", question, step: request.step, callSiteKey: request.callSiteKey, target, shown: request.shown,
        order: request.order, plan }, async (gateway) => {
        const pieces = mapProviderPieces(request.spec);
        const response = await gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
          bound: START_STEP_CALL_BOUNDS[kind], contractHash: startContractHashOf(request.spec.contract), providerRef: target.providerRef,
          packet: pieces.framed.packet, classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket,
          ...(request.spec.guidedWords === null ? {} : { guidedWords: request.spec.guidedWords }),
          ...(request.spec.replyWordsCeiling === null ? {} : { replyWordsCeiling: request.spec.replyWordsCeiling }) });
        return pieces.readAccepted(response.content);
      }).then((outcome) => {
        if (request.step === "START_LIST") listMs.set(request.seat.aiRef, outcome.kind === "OK" ? startNow() - askedAt : null);
        return outcome;
      });
      asked.push(call);
      return call;
    }
  });

  /**
   * One card of arm S: the plan's seats (startSeatsFor over the plan's line-up, Free's or the paid one, by today's speed
   * order, models that sat out left out; the planner is the first seat, the merges Haiku's, as the API seats them), the
   * planner and the lists (STREAM), the first merge started at the cut over the lists in by then, and one late merge over
   * the lists after it. No page leaves the card, so it runs to its end, and its line waits for every call it asked. With
   * no seat at all it asks nothing (a line with no list in).
   */
  const startCard = async (question: OpeningsQuestion, plan: OpeningsStartPlan): Promise<OpeningsStartCardLine> => {
    const { seats, haiku } = startSeatsFor({ roster: plan === "FREE" ? input.config.free_model_ids : input.config.premium_model_ids,
      targetOf: (model) => targetByModel.get(model) ?? null, count: OPENINGS_START_LIST_WRITERS[plan], busy: new Set(busy) });
    const line = (cardMs: number, listsIn: number, late: number, seatMs: OpeningsStartCardLine["seatMs"]): OpeningsStartCardLine =>
      Object.freeze({ kind: "START_CARD" as const, plan, questionId: question.id, cardMs, listsIn, late, seatMs: Object.freeze(seatMs) });
    const planner = seats[0];
    if (planner === undefined) return line(0, 0, 0, []);
    const asked: Promise<unknown>[] = [];
    const listMs = new Map<string, number | null>();
    const caller = startCaller(question, plan, asked, listMs);
    const signal = new AbortController().signal;
    const step = { questionLine: question.questionLine, languageName: question.languageName, languageTag: question.languageTag, readingLevel: null };
    const merge = (lists: readonly StartList[], prior: StartMenu | null) => mapMergeStartLists({ ...step, clarifyLines: [], lists, prior,
      seat: haiku, caller, menuId: randomUUID(), signal });
    const inByCut: StartList[] = [];
    const cut: { listsIn: number; first: Promise<Readonly<{ menu: StartMenu; at: number }>> | null } = { listsIn: 0, first: null };
    const startedAt = startNow();
    const lists = await mapRunStartLists({ ...step, seats, planner, caller, signal, cut: "STREAM",
      ...(input.startClock === undefined ? {} : { clock: input.startClock }),
      onSeatDone: () => undefined,
      onList: (list, late) => { if (!late) inByCut.push(list); },
      onCut: (listsIn) => {
        cut.listsIn = listsIn;
        // The card: the first merge, started at the cut over the lists in by then, while later lists may still come.
        if (listsIn > 0) cut.first = merge([...inByCut], null).then((merged) => Object.freeze({ menu: merged.menu, at: startNow() }));
      } });
    const returnedAt = startNow();
    const first = cut.first === null ? null : await cut.first;
    // The API's small second merge for the lists after the cut; it never moves the card's time.
    if (first !== null && lists.late.length > 0) await merge(lists.late, first.menu);
    await Promise.allSettled(asked);
    return line((first?.at ?? returnedAt) - startedAt, cut.listsIn, lists.late.length,
      seats.map((seat) => Object.freeze({ model: seat.aiRef, ms: listMs.get(seat.aiRef) ?? null })));
  };
  const startCards: OpeningsStartCardLine[] = [];
  const emitCard = (card: OpeningsStartCardLine): void => {
    startCards.push(card);
    input.onStartCard?.(card);
    input.progress?.(`${card.questionId} S ${card.plan}: card ${String(card.cardMs)}ms, ${String(card.listsIn)} list(s) in by the cut, `
      + `${String(card.late)} late`);
  };

  /**
   * Arm Q's reader (Task 91c): the API's own clarifying step, made once per run as the API makes it once per process, over its
   * preview transport on this run's guarded fetch (the Anthropic gate, no key). The practice keeps no money row: the gate settles
   * the money and its wire lines carry it, so the step's record does nothing. Its limits are the questions asked, so no reading is
   * refused by them; one made-up person asks every question (the step's memory is per person and per line, and no line repeats).
   * NONE's code is the step's own report line. At its bound the step lets its call go, as on the site (the gate delivers and
   * settles it): the practice keeps each such call (`clarifyInFlight`) and waits for it after the reading is timed, so its gate
   * line (its money) is in the log before the reading's line, and the next reading never shares the gate with it.
   */
  const clarifyOwner = randomUUID();
  const clarifyNone: { code: string | null } = { code: null };
  const clarifyInFlight = new Set<Promise<Response>>();
  const clarifyFetch: typeof fetch = (url, init) => {
    const call = guardedFetch(url, init);
    clarifyInFlight.add(call);
    const ended = (): void => { clarifyInFlight.delete(call); };
    void call.then(ended, ended);
    return call;
  };
  let clarifyPort: AskClarifyPort | null = null;
  const clarifyReader = (): AskClarifyPort => {
    clarifyPort ??= createAskClarify({ limits: { perHour: input.questions.length, perDay: input.questions.length },
      transportFor: askClarifyTransportFor({ kind: "PREVIEW", fetch: clarifyFetch }), reserve: async () => undefined, record: async () => undefined, clock: () => new Date(),
      report: (line) => { if (line.event === "api.ask_clarify.none") clarifyNone.code = line.code; } });
    return clarifyPort;
  };
  const clarifyLine = (questionId: string, ms: number, source: "AI" | "NONE", code: string | null): OpeningsClarifyLine =>
    Object.freeze({ kind: "CLARIFY_TIME" as const, questionId, ms, source, code });
  /** One reading: made up with --dry (nothing is called), else the step's answer, timed from the read to its end as the page waits. */
  const clarifyReading = async (question: OpeningsQuestion, place: number): Promise<OpeningsClarifyLine> => {
    if (input.dry === true) return clarifyLine(question.id, OPENINGS_DRY_CLARIFY_MS[place]!, "AI", null);
    clarifyNone.code = null;
    const started = performance.now();
    const answer = await clarifyReader().read(clarifyOwner, question.questionLine, null);
    const ms = Math.round(performance.now() - started);
    // A call the step let go at its bound ends here, outside the time the page waited.
    await Promise.allSettled([...clarifyInFlight]);
    return answer.source === "AI" ? clarifyLine(question.id, ms, "AI", null) : clarifyLine(question.id, ms, "NONE", clarifyNone.code ?? "UNKNOWN");
  };
  const clarifyTimes: OpeningsClarifyLine[] = [];
  const emitClarify = (line: OpeningsClarifyLine): void => {
    clarifyTimes.push(line);
    input.onClarify?.(line);
    input.progress?.(`${line.questionId} Q: ${line.source}${line.code === null ? "" : ` ${line.code}`} ${String(line.ms)}ms`);
  };

  const emit = (line: OpeningsArmLine) => { const frozen = Object.freeze(line); armLines.push(frozen); input.onArm?.(frozen); };
  /**
   * Ruling T11-m1: a stopped or halted gate (or the operator's interrupt) ends the run. The arm in progress finishes
   * (its calls behind the stopped gate are SKIPPED_STOPPED) and carries a STOPPED note, so those calls are not read as
   * the models' own fallbacks; no new arm or question starts.
   */
  const stopNow = (): string | null => {
    const stops = (["deepinfra", "anthropic"] as const).flatMap((gate) => {
      const stop = input.observer.stopped(gate);
      return stop === null ? [] : [`${gate}:${stop.reason}`];
    });
    if (stops.length > 0) return stops.join(",");
    return input.shouldStop?.() === true ? "PRACTICE_INTERRUPTED" : null;
  };
  const withStop = (notes: readonly OpeningsArmNote[], step: OpeningsArmNote["step"]): readonly OpeningsArmNote[] => {
    const stopped = stopNow();
    return stopped === null ? notes : [...notes, Object.freeze({ note: "STOPPED" as const, step, detail: stopped })];
  };
  const order = practiceTurnOrder(input.targets);
  for (const [index, question] of input.questions.entries()) {
    if (stopNow() !== null) break;
    const rotation = rotations[index]!;
    for (const arm of input.arms) {
      if (stopNow() !== null) break;
      if (arm === "S") {
        for (const plan of OPENINGS_START_PLANS) {
          if (stopNow() !== null) break;
          const card = await startCard(question, plan);
          // A card a stop cut short (a stopped gate, the operator's interrupt) is not timed; its calls keep their lines.
          if (stopNow() !== null) {
            input.progress?.(`${question.id} S ${plan}: stopped, the card is not timed`);
            break;
          }
          emitCard(card);
        }
        continue;
      }
      if (arm === "Q") {
        const reading = await clarifyReading(question, rotation);
        // A reading a stop cut short (a stopped gate, the operator's interrupt) is not timed, as arm S's card is not.
        if (stopNow() !== null) {
          input.progress?.(`${question.id} Q: stopped, the reading is not timed`);
          continue;
        }
        emitClarify(reading);
        continue;
      }
      const seats = mapRotateSeats(order, rotation).filter((target) => !busy.includes(target.model));
      const startedAt = new Date().toISOString();
      if (arm === "T") {
        const written = await positions(question, seats);
        emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: "POSITIONS", positions: written,
          marks: [], notes: withStop([], "POSITION"), map: null });
        input.progress?.(`${question.id} T: ${String(written)} position(s)`);
        continue;
      }
      const mapInput: MapRunInput = {
        questionLine: question.questionLine, languageName: question.languageName, languageTag: question.languageTag,
        seats: seats.map((target) => Object.freeze({ aiRef: target.providerRef, maker: target.maker })),
        // Task 17a (D5): C2N's calls go out in wording N; C2 and C2N run engine 2 (practiceWordingMapExtras; {} for T, A, B, C).
        // Ruling R3-T17a.1: C2N takes C2's seed, so both arms see the same items in the same order (only the wording differs).
        caller: arm === "C2N" ? practiceWordingNCaller(mapCaller(arm, question)) : mapCaller(arm, question),
        seed: `${question.id}|${arm === "C2N" ? "C2" : arm}`,
        gapRoundsMax: openingsGapRoundsMax(arm),
        maxAnswers: OPENINGS_MAP_SIZES.maxAnswers, pointsPerAnswer: OPENINGS_MAP_SIZES.pointsPerAnswer,
        ...practiceWordingMapExtras(arm),
        // Ruling R3-T17a.2: a practice refusal in the caller (the engine seal missing, wording N's base moved) is rethrown,
        // never turned into a failed call and a map fallback. Known limit (re-review N5): the map starts a step's list calls
        // in one synchronous batch, and a rethrow does not cancel the batch's siblings. Safe today: both refusals throw
        // before any gateway call, and every call of one batch shares one contract and one base, so a batch refuses whole
        // (nothing of it is sent). A refusal that could hit only some siblings would need the map to settle the batch first.
        abandon: (error) => error instanceof PracticeRefusal
      };
      // Task 17a: the engine-2 arms' lines say how many seats they started with (a seat busy in C2 sits out C2N).
      const seated = (OPENINGS_ENGINE_ARMS as readonly string[]).includes(arm) ? { seats: seats.length } : {};
      let result: MapResult;
      try {
        result = arm === "A" ? await mapRunSnowball(mapInput)
          : arm === "B" ? await mapRunBlindLists(mapInput) : await mapRunAngleMap(mapInput);
      } catch (error) {
        if (!(error instanceof PracticeRefusal)) throw error;
        // The arm ends here, loudly: no map, and its note names the refusal (the run goes on with the next arm).
        emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: "UNAVAILABLE", positions: 0,
          marks: [], notes: withStop([Object.freeze({ note: "PRACTICE_REFUSED" as const, step: "MAP" as const, detail: error.code })], "MAP"),
          map: null, ...seated });
        input.progress?.(`${question.id} ${arm}: refused, ${error.code}`);
        continue;
      }
      const { calls: _calls, ...map } = result;
      void _calls; // each call has its own line already
      emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: result.kind, positions: 0,
        marks: result.marks, notes: withStop(result.notes, "MAP"), map, ...seated });
      input.progress?.(`${question.id} ${arm}: ${result.kind}, marks ${result.marks.map((mark) => mark.mark).join(",") || "none"}`);
    }
  }
  return Object.freeze({ calls: Object.freeze([...calls]), arms: Object.freeze([...armLines]), busyModels: Object.freeze([...busy]),
    startCards: Object.freeze([...startCards]), clarifyTimes: Object.freeze([...clarifyTimes]) });
}
