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
 */
import { randomUUID } from "node:crypto";
import { Judge, type JudgeLeg } from "@debateai/judgement";
import {
  mapProviderPieces,
  mapRotateSeats,
  mapRunAngleMap,
  mapRunBlindLists,
  mapRunSnowball,
  type MapCallOutcome,
  type MapCallRequest,
  type MapCaller,
  type MapResult,
  type MapRunInput
} from "@debateai/map";
import {
  createPreviewGuardedFetch,
  ProviderContentUnacceptedError,
  type CallBound,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget,
  type ProviderGateway
} from "@debateai/providers";
import { abortableWait } from "./practice-concurrency.js";
import {
  errorCodeOf,
  gateOf,
  PRACTICE_MODEL_BUSY,
  practiceAttemptsOf,
  practiceJobGateway,
  practiceLimitedPorts,
  practiceNextBusyWait,
  practiceTurnOrder,
  practiceWireUsage,
  type PracticeWaitBudget
} from "./practice-formats.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import { replyContentOf } from "./practice-lanes.js";
import type { OpeningsArmLine, OpeningsArmNote, OpeningsBusyWait, OpeningsCall, OpeningsCallStatus, OpeningsStep } from "./practice-openings-log.js";
import { OPENINGS_ARMS, OPENINGS_QUESTIONS, type OpeningsArm, type OpeningsQuestion } from "./practice-openings-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import { PracticeRefusal } from "./practice-settings.js";

/** The map's sizes for five AIs, as a Premium plan (spec §5, Pro: 5 map AIs, 4 answers; up to 2 gap rounds, 1 for arm B). */
export const OPENINGS_MAP_SIZES = Object.freeze({ gapRoundsC: 2, gapRoundsB: 1, maxAnswers: 4, pointsPerAnswer: 4 });

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
  contractHashes: Readonly<{ judge: string; map: string }>;
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
}>;

export type OpeningsRunResult = Readonly<{ calls: readonly OpeningsCall[]; arms: readonly OpeningsArmLine[]; busyModels: readonly string[] }>;

/** The failures that are the reply's format: the gateway's last refusal, the judge's and the map's own readers. */
const OPENINGS_FORMAT_ERRORS: ReadonlySet<string> = new Set(["JUDGE_SCHEMA_FAILURE", "JUDGE_PARSE_FAILURE", "MAP_REPLY_UNREADABLE"]);

type OpeningsCallContext = Readonly<{
  arm: OpeningsArm; question: OpeningsQuestion; step: OpeningsStep; callSiteKey: string;
  target: ProviderDiscoveryTarget; shown: "BLIND" | readonly string[]; order: number;
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

/** The arms asked: each one of T, A, B, C, at most once (checked with the questions, before the first call). */
function openingsAssertArms(arms: readonly OpeningsArm[]): void {
  if (arms.some((arm) => !(OPENINGS_ARMS as readonly string[]).includes(arm)) || new Set(arms).size !== arms.length) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--arms (only T, A, B, C, each once)");
  }
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
   * it ends. One call per model is in flight at a time (lists run one per seat, every other step one at a time), so the
   * gate watch's events of this model since the call began are this call's own.
   */
  const oneCall = async <T>(context: OpeningsCallContext, send: (gateway: ProviderGateway) => Promise<T>): Promise<MapCallOutcome<T>> => {
    const { target } = context;
    const model = target.model;
    const gate = gateOf(model);
    const budget = budgets.get(model) ?? { usedMs: 0, waits: 0, inARow: 0 };
    budgets.set(model, budget);
    const base = { arm: context.arm, questionId: context.question.id, step: context.step, callSiteKey: context.callSiteKey,
      aiRef: target.providerRef, model, maker: target.maker, gate, shown: context.shown, order: context.order };
    const skipped = (status: "SKIPPED_MODEL_BUSY" | "SKIPPED_STOPPED", errorCode: string) => {
      const at = new Date().toISOString();
      record({ ...base, startedAt: at, finishedAt: at, latencyMs: 0, inputTokens: null, outputTokens: null, reasoningTokens: null,
        cachedInputTokens: null, costNanoUsd: null, status, errorCode, attempts: [], replyForm: null, replyText: null });
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
      const eventsBefore = input.observer.events.length;
      const startedAt = new Date();
      const started = performance.now();
      let value: T | undefined;
      let ok = false;
      let errorCode: string | null = null;
      let formatError = false;
      try {
        value = await send(remembering);
        ok = true;
      } catch (error) {
        errorCode = errorCodeOf(error);
        formatError = error instanceof ProviderContentUnacceptedError || OPENINGS_FORMAT_ERRORS.has(errorCode);
      }
      const latencyMs = Math.round(performance.now() - started);
      const wire = input.observer.events.slice(eventsBefore).filter((event) => event.model === model);
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
          : last === null ? null : reportableReplyText(replyContentOf(last.rawText)) });
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
  /** The map's caller: each step as role JUDGE on the served lane (the preview's format repair applies), the map's contract hash. */
  const mapCaller = (arm: OpeningsArm, question: OpeningsQuestion): MapCaller => Object.freeze({
    call: <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      const target = targetByRef.get(request.seat.aiRef);
      if (target === undefined) return Promise.resolve({ kind: "FAILED", code: "PRACTICE_OPENINGS_UNKNOWN_SEAT" });
      return oneCall<T>({ arm, question, step: request.step, callSiteKey: request.callSiteKey, target, shown: request.shown, order: request.order },
        async (gateway) => {
          const pieces = mapProviderPieces(request.spec);
          const response = await gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
            bound: openingsStepBound(input.bound, request.step), contractHash: input.contractHashes.map, providerRef: target.providerRef, packet: pieces.framed.packet,
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
        caller: mapCaller(arm, question), seed: `${question.id}|${arm}`,
        gapRoundsMax: openingsGapRoundsMax(arm),
        maxAnswers: OPENINGS_MAP_SIZES.maxAnswers, pointsPerAnswer: OPENINGS_MAP_SIZES.pointsPerAnswer
      };
      const result: MapResult = arm === "A" ? await mapRunSnowball(mapInput)
        : arm === "B" ? await mapRunBlindLists(mapInput) : await mapRunAngleMap(mapInput);
      const { calls: _calls, ...map } = result;
      void _calls; // each call has its own line already
      emit({ arm, questionId: question.id, startedAt, finishedAt: new Date().toISOString(), outcome: result.kind, positions: 0,
        marks: result.marks, notes: withStop(result.notes, "MAP"), map });
      input.progress?.(`${question.id} ${arm}: ${result.kind}, marks ${result.marks.map((mark) => mark.mark).join(",") || "none"}`);
    }
  }
  return Object.freeze({ calls: Object.freeze([...calls]), arms: Object.freeze([...armLines]), busyModels: Object.freeze([...busy]) });
}
