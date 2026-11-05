import { createHash, randomBytes } from "node:crypto";
import {
  START_STEP_LIMITS, StartCombineResponseSchema, StartMenuSchema, purposeAnswerSentence, type QuestionLanguageOffer,
  type StartCombineRequest, type StartCombineResponse, type StartFitRequest, type StartFitResponse, type StartListsEvent,
  type StartListsRequest, type StartMenu, type StartMergeRequest, type StartMergeResponse, type StartStepNoneReason
} from "@debateai/contract";
import type { FundingBasis, QuestionLanguage } from "@debateai/kernel";
import {
  START_STEP_TIMING, mapCombineStart, mapFitOwnPath, mapMergeStartLists, mapPlanStartAngles, mapRunStartLists, startCodeMenu, type MapCaller,
  type MapSeat, type StartClock, type StartPlanned, type StartStepTiming
} from "@debateai/map";
import type { PreviewProviderTestConfig } from "@debateai/providers";
import { debateShapePlanKeyOf, debateShapeStartStepOf, type DebateShapePlanKey, type DebateShapePolicy } from "@debateai/register";
import { decideRoomSettingsAndPlan, type AskBilling } from "../ask-billing.js";
import { answerForOutcome, type AskQuestionCheck } from "../question-check/ask-gate.js";
import type { QuestionCheckOutcome } from "../question-check/contract.js";
import {
  QuestionLanguageChoiceNeeded, ownerScopeOf, type QuestionLanguageAsk, type QuestionLanguageLock, type QuestionLanguagePort
} from "../question-language/decider.js";
import type { StartCharges } from "./charge.js";
import { createStartBusyBook, startModelOfSeat, startSeatsFor, type StartBusyBook } from "./seats.js";
import {
  signStartCheck, signStartCombine, signStartList, signStartMenu, startCanonicalJson, startDigTryRefOf, startMembersHash, startTryRefOf,
  startTryRefOfCheck, verifyStartCheck, verifyStartMergeRequest, type StartCombineContext, type StartStepKey
} from "./signing.js";
import type { StartCallEnd, StartTransport } from "./transport.js";

/**
 * V4 start step, Task 28 (spec 2026-11-03 §4.1; items ask-f7, ask-f9, read-f13; owner answers Q2 and Q8 of 4 Nov): THE STEP PORT AT
 * NEXT. The question check and the language decision moved from Start to Next, and run beside the angle planner; the lists start once
 * the check passes and the language is settled (so they are written in the right language, and nobody pays for lists on a question
 * that then changes), and stream to the page: the check, each seat's progress, the lists in by the cut, the cut, the late lists, and
 * exactly one `end`, last.
 *
 * Task 29 (spec §4.1, §6 items 3 and 4): THE STEP PORT ON STEP 2. The merge turns the signed lists into the signed menu, on Haiku: the
 * first raced with `mergeDeadlineMs` here (the map's merge has no clock of its own, and the preview never ends a call at its bound), so a
 * slow Haiku shows the first list alone; a late merge adds the lists that came after it. The combine writes one question for points put
 * together, the fit says which chosen path the person's own view fits inside; each is raced with its own deadline. A call the race gave up
 * on is never stopped: it runs on and counts (Calls item 8). Every reference is verified with the line read at Next compared and the
 * version not (owner answer Q8: a site update while the page is open never spoils them); each call runs on the active version's settings,
 * and a merge signs its menu with the version of the reading it belongs to. The same merge or combine from the same person within
 * `serverCacheTtlMs` gets the same answer back with no call, joined while it runs (ask-f9, answer Q2); an answer of none is not kept.
 *
 * Nothing is paid twice (spec §3; ask-f9). For `serverCacheTtlMs` (ten minutes) the same words from the same person get the same
 * reading back with no call and no charge: a second Next, a Try again, Back then Next with the same words, a reload then Next. A second
 * press while the first still runs joins it. A reading that answered nothing (`none`, any reason) is not kept, so Try again really
 * tries again. Leaving the page never stops the calls already started: they run on and count once (Calls item 8), and the next
 * press within the ten minutes gets what they wrote; when everyone has left before the lists start, nothing new starts.
 *
 * Memory only, in this process: the books (the prepared words, the readings, the merges, the combines), each keyed by a hash under a
 * per-process key (32 random bytes, never logged), so a key can never be read back as words and never answers one person with another's
 * reading. No signed reference is ever a key (a ref's MAC has more than one spelling): a merge is keyed by what its references verified.
 * Nothing here logs the question, a list or a person: the timing lines carry a step, a time and a model.
 */
type NamedLanguage = QuestionLanguage;

/** Who reads and under what: the room's binding (Task 30's startStepBindingOf) and what funds the person now. */
export type StartStepContext = Readonly<{ ownerRef: string; ownerScope: string; funding: FundingBasis | null; planKey: DebateShapePlanKey;
  settingsVersion: number }>;
export type StartListsInput = StartListsRequest & StartStepContext & Readonly<{ country: string | null }>;
export type StartMergeInput = StartMergeRequest & StartStepContext;
export type StartCombineInput = StartCombineRequest & StartStepContext & Readonly<{
  digParent: Readonly<{ questionLine: string; language: NamedLanguage }> | null;
}>;
export type StartFitInput = StartFitRequest & StartStepContext;
/** What a settings version gives the step: the shape row (its switch and list writers), the preview line-up and the language port. */
export type StartStepSettings = Readonly<{
  debateShapePolicy: DebateShapePolicy | null; previewConfig: PreviewProviderTestConfig | undefined; questionLanguage: QuestionLanguagePort | undefined;
}>;

export interface StartStepPort {
  readonly route: "PREVIEW" | "NONE";
  lists(input: StartListsInput, emit: (e: StartListsEvent) => void, signal: AbortSignal): Promise<void>;
  merge(input: StartMergeInput, signal: AbortSignal): Promise<StartMergeResponse>;
  combine(input: StartCombineInput, signal: AbortSignal): Promise<StartCombineResponse>;
  fit(input: StartFitInput, signal: AbortSignal): Promise<StartFitResponse>;
}

/** ask-f9: the kept readings, oldest dropped first, at most this many and this many UTF-8 bytes of kept events in all. */
export const START_LISTS_REUSE = Object.freeze({ entries: 2_000, bytesMax: 33_554_432 });
/** The planner, check and language decision kept per person and words (the order's step 4), at most this many, oldest dropped first. */
const START_PREPARED = Object.freeze({ entries: 2_000 });

/**
 * The calls before Start go out only on the preview (spec §3 non-goals), and only where every call can be charged: a preview gate
 * AND the 0156 pre-Start charge writer. Never keyed on the deployment mode: the test site runs in hosted mode.
 */
export function startStepRouteOf(input: Readonly<{ previewGate: unknown; writerPresent: boolean }>): "PREVIEW" | "NONE" {
  return input.previewGate !== undefined && input.writerPresent ? "PREVIEW" : "NONE";
}

/** Who a call before Start is for and under what: the person, the plan their room is read for, the active settings version. */
export type StartStepBinding = Readonly<{ ownerScope: string; planKey: DebateShapePlanKey; settingsVersion: number }>;
/**
 * Task 30: THE ONE BINDING of a person's call before Start, and of POST /v1/asks's check of what Next signed (Task 36): the plan
 * the room is read for (the person's plan with billing on, the team plan for an internal grant, else the premium key), the same
 * decision and the same calls as the room read's own look at a person's plan, under the ACTIVE version. Null without a version
 * (no step, nothing is read). A call before Start verifies its references with the version not compared (Tasks 26b, 29).
 */
export async function startStepBindingOf(input: Readonly<{ ownerRef: string; askBilling: AskBilling | undefined; registerVersion: number | undefined }>):
  Promise<StartStepBinding | null> {
  if (input.registerVersion === undefined) return null;
  const decided = await decideRoomSettingsAndPlan({ plan_tier: "premium", composition_budget_tier: "low", depth_params: { depth: 1 } },
    input.ownerRef, input.askBilling);
  return Object.freeze({ ownerScope: ownerScopeOf({ kind: "server", ownerRef: input.ownerRef }),
    planKey: debateShapePlanKeyOf(decided.planId, decided.settings.plan_tier), settingsVersion: input.registerVersion });
}

type Decided = Readonly<{ kind: "LOCK"; lock: QuestionLanguageLock }> | Readonly<{ kind: "OFFER"; offer: QuestionLanguageOffer }>
  | Readonly<{ kind: "REFUSED" }>;
/**
 * Step 4: started together at the first Next of these words; an offer and its re-post share one planner and the words' check. `checks`
 * holds each line's check once (the words', and an accepted rewrite's: wave-4 review); one that could not answer is forgotten.
 */
type Prepared = { readonly at: number; readonly planned: Promise<StartPlanned>; readonly checks: Map<string, Promise<QuestionCheckOutcome | null>>;
  decided: Promise<Decided> | null };
/** Step 4b: one reading's events, in order, from its first to its end, and who is listening while it runs. */
type Reading = { readonly key: string; readonly createdAt: number; firstAt: number | null; readonly events: StartListsEvent[]; bytes: number;
  answeredNone: boolean; ended: boolean; inBook: boolean; readonly listeners: Set<(event: StartListsEvent) => void> };

/** The reading's own signal: a listener's abort never reaches the calls (Calls item 8). */
const RUNS_ON: AbortSignal = new AbortController().signal;
/** A kept event is shared by every listener: frozen where it is made (each is a fresh object), so none can change another's. */
const frozen = (event: StartListsEvent): StartListsEvent => {
  Object.freeze(event.data);
  return Object.freeze(event);
};
const none = (reason: StartStepNoneReason): readonly StartListsEvent[] => [frozen({ event: "none", data: { reason } }),
  frozen({ event: "end", data: { reason: "NONE" } })];

const L = START_STEP_LIMITS;
/** ask-f9: the merges and the combines kept, each book at most this many, oldest dropped first. */
const START_ANSWERS_KEPT = Object.freeze({ entries: 2_000 });
/** A merge's, a combine's or a fit's answer of none: never kept, so the next request asks again. */
const noneOf = (reason: StartStepNoneReason) => Object.freeze({ source: "NONE" as const, reason });
/** A kept answer is sent to everyone who asks for it: frozen all through (each is made fresh here), so none can change another's. */
function deepFrozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const member of Object.values(value)) deepFrozen(member);
    Object.freeze(value);
  }
  return value;
}
/** The combined question's two texts as the contract reads them (trimmed): what is signed is what Start reads back (wave-1 note). */
const COMBINED_WORDS = StartCombineResponseSchema.options[0].pick({ title: true, question: true });

/** The step switched on for this plan in these settings: its line-up and language port (the lists' step 1; every call before Start). */
function switchedOn(settings: StartStepSettings, planKey: DebateShapePlanKey):
  Readonly<{ policy: DebateShapePolicy; config: PreviewProviderTestConfig; language: QuestionLanguagePort }> | null {
  const { debateShapePolicy: policy, previewConfig: config, questionLanguage: language } = settings;
  if (policy === null || config === undefined || language === undefined || debateShapeStartStepOf(policy, planKey) === null) return null;
  return Object.freeze({ policy, config, language });
}
/** The merge's, the combine's and the fit's seat: Haiku wherever a target declares it, whatever the plan's line-up (startSeatsFor's rule). */
const haikuOf = (transport: StartTransport): MapSeat | null =>
  startSeatsFor({ roster: [], targetOf: transport.targetOf, count: 0, busy: new Set() }).haiku;
/** What the asker said, as the merge reads it: each answer as its sentence (as the question will say it), then what matters. */
const clarifyLinesOf = (clarify: StartMergeRequest["clarify"]): readonly string[] => Object.freeze([
  ...(clarify?.answers ?? []).map(purposeAnswerSentence), ...(clarify?.matters === undefined ? [] : [clarify.matters])]);
type MergeVerified = ReturnType<typeof verifyStartMergeRequest>;
/** A merge or a combine kept or running under its key: `settledAt` null while it runs (it is joined), else since its answer. */
type Kept<T> = { settledAt: number | null; readonly answer: Promise<T> };

export function createStartStep(deps: Readonly<{
  route: "PREVIEW" | "NONE"; key: StartStepKey; settingsFor(version: number): Promise<StartStepSettings>;
  questionCheck: AskQuestionCheck | undefined; transport: StartTransport | null; charges: StartCharges; busy?: StartBusyBook;
  clock?: StartClock & Readonly<{ date(): Date }>; timing?: Partial<StartStepTiming>; report(line: Readonly<Record<string, string | number>>): void;
  newMenuId?: () => string;
}>): StartStepPort {
  const processKey = randomBytes(32);
  const timing: StartStepTiming = Object.freeze({ ...START_STEP_TIMING, ...deps.timing });
  const clock = deps.clock;
  const now = (): number => clock === undefined ? Date.now() : clock.now();
  const withClock: Readonly<{ clock?: StartClock }> = clock === undefined ? {} : { clock };
  const busy = deps.busy ?? createStartBusyBook({ now });
  const keyOf = (parts: readonly string[]): string => {
    const hash = createHash("sha256").update(processKey);
    for (const part of parts) hash.update("\0").update(part, "utf8");
    return hash.digest("base64url");
  };
  // The ledger's wave-1 note: a hook that throws (a logger down) never touches the stream or a call.
  const tell = (line: Readonly<Record<string, string | number>>): void => {
    try {
      deps.report(line);
    } catch {
      // the report never changes the reading
    }
  };
  const timed = (step: "STARTED" | "CHECKED" | "SEAT_IN" | "CUT" | "REUSED" | "MERGED" | "LATE_MERGED", startedAt: number, model?: string): void => {
    tell({ event: "api.start_step.timing", step, ms: Math.max(0, now() - startedAt), ...(model === undefined ? {} : { model }) });
  };
  const callEnded = (end: StartCallEnd): void => {
    tell({ event: "api.start_step.call", call_site: end.callSiteKey, model: end.model, outcome: end.outcome, ms: end.ms });
  };
  /**
   * Each call charged to this person (the first asker of a kept answer), through its kind's seam; a call's end is one code line. Task 57c:
   * each charge names the try it was made for (signing.ts), so Start gives it to its debate and a failed debate gives it back (0163).
   */
  const callerOf = (transport: StartTransport, config: PreviewProviderTestConfig, who: StartStepContext, tryRef: string | null): MapCaller =>
    transport.callerFor({ config, busy, onCallEnd: callEnded,
      seamFor: (kind, target) => deps.charges.seamFor({ ownerRef: who.ownerRef, funding: who.funding, kind, target,
        ...(tryRef === null ? {} : { tryRef }) }) });
  const newMenuId = deps.newMenuId ?? ((): string => randomBytes(16).toString("base64url"));

  // Task 29: the step's own clock for the deadlines of step 2 (the map's merge, combine and fit have none; wave-3 note a).
  const sleep = (ms: number, signal: AbortSignal): Promise<void> => clock !== undefined ? clock.sleep(ms, signal) : new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, ms));
    signal.addEventListener("abort", done, { once: true });
  });
  /** A signal that aborts `ms` from now, unless stopped first: the map then stops waiting; the call it asked runs on and counts. */
  const deadlineAfter = (ms: number): Readonly<{ signal: AbortSignal; stop(): void }> => {
    const deadline = new AbortController();
    const over = new AbortController();
    void sleep(ms, over.signal).then(() => { if (!over.signal.aborted) deadline.abort(); });
    return Object.freeze({ signal: deadline.signal, stop: () => { over.abort(); } });
  };
  /** `work` raced with `ms`: its answer, or DEADLINE (the work is never stopped: it runs on and counts, Calls item 8). */
  const within = async <T>(ms: number, work: Promise<T>): Promise<T | "DEADLINE"> => {
    const over = new AbortController();
    try {
      return await Promise.race([work, sleep(ms, over.signal).then(() => "DEADLINE" as const)]);
    } finally {
      over.abort();
    }
  };

  const merges = new Map<string, Kept<StartMergeResponse>>();
  const combines = new Map<string, Kept<StartCombineResponse>>();
  /** The answer kept or running under `key`; every answer kept `serverCacheTtlMs` since it came is forgotten first. */
  const keptIn = <T>(answers: Map<string, Kept<T>>, key: string): Promise<T> | null => {
    const at = now();
    for (const [name, entry] of answers) if (entry.settledAt !== null && at - entry.settledAt >= timing.serverCacheTtlMs) answers.delete(name);
    return answers.get(key)?.answer ?? null;
  };
  /** A new answer under `key`, joined while it runs; at its end one of none is dropped, any other kept. It never rejects. */
  const keep = <T extends Readonly<{ source: string }>>(answers: Map<string, Kept<T>>, key: string, answer: Promise<T>): Promise<T> => {
    const entry: Kept<T> = { settledAt: null, answer };
    answers.set(key, entry);
    while (answers.size > START_ANSWERS_KEPT.entries) answers.delete(answers.keys().next().value!);
    void answer.then((value) => {
      if (answers.get(key) !== entry) return;
      if (value.source === "NONE") answers.delete(key);
      else entry.settledAt = now();
    });
    return answer;
  };
  /** Every call on step 2, once its references verified: the step switched on for the plan on the ACTIVE version (answer Q8), the record up. */
  const readyFor = async (who: StartStepContext): Promise<Readonly<{ config: PreviewProviderTestConfig }> | "OFF" | "RECORD_DOWN"> => {
    const on = switchedOn(await deps.settingsFor(who.settingsVersion), who.planKey);
    if (on === null) return "OFF";
    return deps.charges.recordDown() ? "RECORD_DOWN" : on;
  };

  /**
   * One merge. The first, raced with `mergeDeadlineMs`: past it (or with no Haiku, or a failed call) the map gives the first list's code
   * menu, and a merged menu the contract refuses is a failed merge too (the other lists stay with the page for its late merge, Task 71).
   * A late one, raced with `lateMergeDeadlineMs`: past it none DEADLINE; the menu so far back unchanged, or a menu the contract refuses,
   * none UNREADABLE. Only a menu the contract accepts is signed and sent, as it parsed (what Start reads back), with the reading's version.
   */
  const mergeOnce = async (input: StartMergeInput, verified: MergeVerified, caller: MapCaller, seat: MapSeat | null): Promise<StartMergeResponse> => {
    const startedAt = now();
    const { lock, lists, prior, readingVersion } = verified;
    const language = Object.freeze({ code: lock.language.code, name: lock.language.name });
    const menuId = prior?.menu_id ?? newMenuId();
    const deadline = deadlineAfter(prior === null ? timing.mergeDeadlineMs : timing.lateMergeDeadlineMs);
    let made: Awaited<ReturnType<typeof mapMergeStartLists>>;
    try {
      made = await mapMergeStartLists({ questionLine: input.question_line, languageName: language.name, languageTag: language.code,
        readingLevel: input.reading_level, clarifyLines: clarifyLinesOf(input.clarify), lists, prior, seat, caller, menuId, signal: deadline.signal });
    } finally {
      deadline.stop();
    }
    const signed = (menu: StartMenu, source: "AI" | "CODE"): StartMergeResponse => deepFrozen({ source, menu: { menu,
      ref: signStartMenu(deps.key, { ownerScope: input.ownerScope, questionLine: input.question_line, planKey: input.planKey, settingsVersion: readingVersion,
        menu }) } });
    if (prior === null) {
      const merged = StartMenuSchema.safeParse(made.menu);
      const menu = merged.success ? merged : StartMenuSchema.safeParse(startCodeMenu(lists[0]!, { menuId, language }));
      if (!menu.success) return noneOf("UNREADABLE");
      timed("MERGED", startedAt);
      return signed(menu.data, merged.success ? made.source : "CODE");
    }
    // A late menu that came is used even when the deadline passed in the same moment; with none, the deadline says why.
    if (made.menu.revision === prior.revision) return noneOf(deadline.signal.aborted ? "DEADLINE" : "UNREADABLE");
    const late = StartMenuSchema.safeParse(made.menu);
    if (!late.success) return noneOf("UNREADABLE");
    timed("LATE_MERGED", startedAt);
    return signed(late.data, made.source);
  };
  /** One combined question, raced with `combineDeadlineMs`; signed as the contract reads it, so the page's echo at Start verifies. */
  const combineOnce = async (input: StartCombineInput, main: Readonly<{ questionLine: string; language: NamedLanguage }>, context: StartCombineContext,
    membersHash: string, caller: MapCaller, seat: MapSeat | null): Promise<StartCombineResponse> => {
    if (seat === null) return noneOf("TRANSPORT");
    const written = await within(timing.combineDeadlineMs, mapCombineStart({ mainQuestion: main.questionLine, languageName: main.language.name,
      languageTag: main.language.code, readingLevel: input.reading_level,
      members: input.members.map((member) => ({ title: member.title, question: member.question })), seat, caller }));
    if (written === "DEADLINE") return noneOf("DEADLINE");
    const words = written === null ? null : COMBINED_WORDS.safeParse(written);
    if (words === null || !words.success) return noneOf("UNREADABLE");
    const { title, question } = words.data;
    return deepFrozen({ source: "AI" as const, title, question,
      combine_ref: signStartCombine(deps.key, { ownerScope: input.ownerScope, context, membersHash, title, question }) });
  };

  const prepared = new Map<string, Prepared>();
  const book = new Map<string, Reading>();
  let bookBytes = 0;
  const unbook = (reading: Reading): void => {
    if (!reading.inBook) return;
    reading.inBook = false;
    book.delete(reading.key);
    bookBytes -= reading.bytes;
  };
  const oldestOut = (): void => {
    const oldest = book.values().next().value;
    if (oldest !== undefined) unbook(oldest);
  };
  /** Kept `serverCacheTtlMs` from its first event (a reading with none yet, from its start). */
  const live = (reading: Reading, at: number): boolean => at - (reading.firstAt ?? reading.createdAt) < timing.serverCacheTtlMs;
  const prune = (at: number): void => {
    for (const reading of [...book.values()]) if (!live(reading, at)) unbook(reading);
    for (const [key, entry] of prepared) if (at - entry.at >= timing.serverCacheTtlMs) prepared.delete(key);
  };

  /** One event of a reading: kept in order, sent to everyone listening; its end drops a reading that answered none. */
  const publish = (reading: Reading, event: StartListsEvent): void => {
    if (reading.ended) return;
    const kept = frozen(event);
    reading.events.push(kept);
    reading.firstAt ??= now();
    const bytes = Buffer.byteLength(JSON.stringify(kept), "utf8");
    reading.bytes += bytes;
    if (reading.inBook) {
      bookBytes += bytes;
      while (bookBytes > START_LISTS_REUSE.bytesMax && book.size > 0) oldestOut();
    }
    if (kept.event === "none") reading.answeredNone = true;
    for (const listener of [...reading.listeners]) listener(kept);
    if (kept.event === "end") {
      reading.ended = true;
      if (reading.answeredNone) unbook(reading);
    }
  };
  /**
   * A listener of a reading: what it holds at once, then the rest as it comes, until its end or the listener's abort. A listener whose
   * `emit` throws is the route's failure: it stops listening and its call rejects with it; the reading runs on for the others.
   */
  const listen = async (reading: Reading, emit: (event: StartListsEvent) => void, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return;
    for (const event of reading.events) emit(event);
    if (reading.ended) return;
    await new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        reading.listeners.delete(listener);
        signal.removeEventListener("abort", stop);
        resolve();
      };
      const listener = (event: StartListsEvent): void => {
        if (signal.aborted) return;
        try {
          emit(event);
        } catch (failure) {
          stop();
          reject(failure instanceof Error ? failure : new Error(String(failure)));
          return;
        }
        if (event.event === "end") stop();
      };
      reading.listeners.add(listener);
      signal.addEventListener("abort", stop, { once: true });
    });
  };

  /** The language step: a lock, the offer to answer (an `end LANGUAGE_CHOICE`), or a refused choice. It never throws. */
  const decide = async (language: QuestionLanguagePort, input: StartListsInput): Promise<Decided> => {
    const ask: QuestionLanguageAsk = { question_line: input.question_line,
      ...(input.site_language === undefined ? {} : { site_language: input.site_language }),
      ...(input.question_language_choice === undefined ? {} : { question_language_choice: input.question_language_choice }) };
    try {
      // The route lets only signed-in people with recorded consent this far (Task 30), so the fast check is allowed.
      return Object.freeze({ kind: "LOCK", lock: await language.decide({ ask, ownerScope: input.ownerScope, fastCheckAllowed: true }) });
    } catch (error) {
      return error instanceof QuestionLanguageChoiceNeeded ? Object.freeze({ kind: "OFFER", offer: error.offer }) : Object.freeze({ kind: "REFUSED" });
    }
  };
  /** The question check; one that throws cannot answer (null), as one that answers UNAVAILABLE. */
  const check = async (questionCheck: AskQuestionCheck, line: string): Promise<QuestionCheckOutcome | null> => {
    try {
      return await questionCheck.check(line);
    } catch {
      return null;
    }
  };

  /** A new reading's run, from step 4 to its end. Anything unforeseen ends it `none TRANSPORT`, so it always ends once. */
  const read = async (reading: Reading, run: Readonly<{ input: StartListsInput; seats: readonly MapSeat[]; planner: MapSeat; caller: MapCaller;
    questionCheck: AskQuestionCheck; language: QuestionLanguagePort }>): Promise<void> => {
    const { input, seats, planner, caller } = run;
    const startedAt = now();
    timed("STARTED", startedAt);
    // Step 4: the person's words as they typed them (an accepted rewrite's original), so an offer and its re-post share one planner and
    // one check. The planner reads the words before the language is settled, under today's directive (Task 23).
    const original = input.question_language_choice?.original_question_line;
    const words = original ?? input.question_line;
    const preparedKey = keyOf([input.ownerScope, words]);
    let ready = prepared.get(preparedKey);
    if (ready === undefined || startedAt - ready.at >= timing.serverCacheTtlMs) {
      prepared.delete(preparedKey);
      ready = { at: startedAt, planned: mapPlanStartAngles({ questionLine: words, planner, caller, ...withClock, signal: RUNS_ON }), checks: new Map(),
        decided: null };
      prepared.set(preparedKey, ready);
      while (prepared.size > START_PREPARED.entries) prepared.delete(prepared.keys().next().value!);
    }
    const entry = ready;
    const checkedOnce = (line: string): Promise<QuestionCheckOutcome | null> => {
      const known = entry.checks.get(line);
      if (known !== undefined) return known;
      const asked = check(run.questionCheck, line);
      entry.checks.set(line, asked);
      return asked;
    };
    /** A line's check: null when it passed, else the reading's last events. One that could not answer is forgotten, so Try again checks again. */
    const refusalOf = async (line: string): Promise<readonly StartListsEvent[] | null> => {
      const asked = checkedOnce(line);
      const outcome = await asked;
      if (outcome === null || outcome.outcome === "UNAVAILABLE") {
        if (entry.checks.get(line) === asked) entry.checks.delete(line);
        return none("CHECK_UNAVAILABLE");
      }
      if (outcome.outcome === "PASS") return null;
      return [{ event: "refused", data: { status: 422, body: answerForOutcome(outcome, input.country)!.body } }, { event: "end", data: { reason: "REFUSED" } }];
    };
    void checkedOnce(words);
    const decided = input.question_language_choice === undefined ? entry.decided ?? (entry.decided = decide(run.language, input))
      : decide(run.language, input);

    // Step 5: the check first (the planner is kept whatever it says).
    const refusedWords = await refusalOf(words);
    if (refusedWords !== null) {
      for (const event of refusedWords) publish(reading, event);
      return;
    }
    // Step 6: the language. The lists wait for the person's choice when a rewrite is offered.
    const decision = await decided;
    if (decision.kind === "OFFER") {
      publish(reading, { event: "language_offer", data: { offer: decision.offer } });
      publish(reading, { event: "end", data: { reason: "LANGUAGE_CHOICE" } });
      return;
    }
    if (decision.kind === "REFUSED") {
      for (const event of none("NOT_ASKED")) publish(reading, event);
      return;
    }
    // Step 6b (wave-4 review): the line the lists are written on and the check is signed for has passed the check. After an accepted
    // rewrite that is the rewrite too, asked once its choice verified: R22 checks the re-post's line at POST /v1/asks, and Start checks a
    // line unchanged since Next no more (Task 36), so without this no check would ever read it.
    if (input.question_line !== words) {
      const refusedLine = await refusalOf(input.question_line);
      if (refusedLine !== null) {
        for (const event of refusedLine) publish(reading, event);
        return;
      }
    }
    // Step 7: the check the lists are written under, signed for this line, plan and version (the lock less its original, Task 26).
    const lock = decision.lock;
    const binding = Object.freeze({ ownerScope: input.ownerScope, questionLine: input.question_line, planKey: input.planKey,
      settingsVersion: input.settingsVersion });
    publish(reading, { event: "check", data: { check_ref: signStartCheck(deps.key, { ...binding, lock, originalQuestionLine: lock.originalQuestionLine }),
      language: { code: lock.language.code, name: lock.language.name }, seats: seats.length } });
    timed("CHECKED", startedAt);
    // The decision record of 3 Nov and Calls item 8 (wave-4 review): when everyone has gone before the lists start (Back to new words,
    // the page closed while the planner reads), the calls already started finish and count, and nothing new starts. The reading ends
    // none, so it is not kept; the planner and the check stay for the same words.
    await entry.planned;
    if (reading.listeners.size === 0) {
      for (const event of none("NOT_ASKED")) publish(reading, event);
      return;
    }
    // Step 8: the lists, streamed. The planner's record is the run's own (result.calls); nothing here records it again. In STREAM a run
    // with no list tells its cut (0) at its return: no cut frame is ever sent before `none NO_LISTS`.
    const result = await mapRunStartLists({ questionLine: input.question_line, languageName: lock.language.name, languageTag: lock.language.code,
      readingLevel: input.reading_level, seats, planner, caller, ...withClock, signal: RUNS_ON, cut: "STREAM", planned: entry.planned,
      onSeatDone: (answered, of) => { publish(reading, { event: "progress", data: { answered, of } }); },
      onList: (list, late) => {
        const signed = Object.freeze({ list, ref: signStartList(deps.key, { ...binding, list }) });
        publish(reading, late ? { event: "late_list", data: { list: signed } } : { event: "list", data: { list: signed } });
        timed("SEAT_IN", startedAt, startModelOfSeat(seats[list.list_no - 1]?.aiRef ?? ""));
      },
      onCut: (listsIn) => {
        if (listsIn === 0) return;
        publish(reading, { event: "cut", data: { lists_in: listsIn } });
        timed("CUT", startedAt);
      } });
    if (result.lists.length + result.late.length === 0) for (const event of none("NO_LISTS")) publish(reading, event);
    else publish(reading, { event: "end", data: { reason: "DONE" } });
  };

  const port: StartStepPort = {
    route: deps.route,
    async lists(input, emit, signal) {
      if (signal.aborted) return;
      const answer = (events: readonly StartListsEvent[]): void => { for (const event of events) emit(event); };
      // Step 1: the step is off here, or for this plan.
      const transport = deps.transport;
      if (deps.route === "NONE" || transport === null) return answer(none("OFF"));
      const settings = await deps.settingsFor(input.settingsVersion);
      if (signal.aborted) return;
      const on = switchedOn(settings, input.planKey);
      if (on === null) return answer(none("OFF"));
      const { policy, config, language } = on;
      // Step 2: never spend unrecorded.
      if (deps.charges.recordDown()) return answer(none("RECORD_DOWN"));
      // Step 3: the plan's list seats in the speed order; the planner is the first (Haiku where the plan's line-up has it).
      const { seats } = startSeatsFor({ roster: input.planKey === "free" ? config.free_model_ids : config.premium_model_ids,
        targetOf: transport.targetOf, count: policy.plans[input.planKey].mapAIs, busy: busy.busy() });
      const planner = seats[0];
      if (planner === undefined) return answer(none("NO_LISTS"));
      // Task 28 ruling: with no question check nothing can pass it (submit answers 503 QUESTION_CHECK_UNAVAILABLE), so nothing is asked.
      const questionCheck = deps.questionCheck;
      if (questionCheck === undefined) return answer(none("CHECK_UNAVAILABLE"));
      // Step 4b: the reading book. These words from this person, on this plan, version, level and language choice, read once.
      const at = now();
      prune(at);
      const key = keyOf([input.ownerScope, input.planKey, String(input.settingsVersion), input.reading_level,
        input.question_language_choice?.choice ?? "-", input.question_language_choice?.original_question_line ?? input.question_line]);
      const kept = book.get(key);
      if (kept !== undefined) {
        timed("REUSED", now());
        return listen(kept, emit, signal);
      }
      // Task 57c: the person's words as typed (an accepted rewrite's original), which the planner reads and the check's try names.
      const caller = callerOf(transport, config, input, startTryRefOf(deps.key, { ownerScope: input.ownerScope,
        words: input.question_language_choice?.original_question_line ?? input.question_line }));
      const reading: Reading = { key, createdAt: at, firstAt: null, events: [], bytes: 0, answeredNone: false, ended: false, inBook: true,
        listeners: new Set() };
      book.set(key, reading);
      while (book.size > START_LISTS_REUSE.entries) oldestOut();
      const listening = listen(reading, emit, signal);
      void read(reading, { input, seats, planner, caller, questionCheck, language }).catch(() => {
        for (const event of none("TRANSPORT")) publish(reading, event);
      });
      return listening;
    },

    // Task 29. Each of the three: off as the lists are; its references verified first (a failure throws its TypedDomainError, before
    // any settings are read or anything is asked, so Task 30 answers 400 or 409 before its stream opens); then the active version's
    // settings and the record. A page already gone when it asks gets none NOT_ASKED and nothing new starts (Calls item 8); a page that
    // goes while its call runs is not raced: the answer comes within its deadline, is kept, and the route writes nothing.
    async merge(input, signal) {
      const transport = deps.transport;
      if (deps.route === "NONE" || transport === null) return noneOf("OFF");
      // The line read at Next is compared, the version is not (answer Q8); every list and the menu so far are of the check's reading.
      const verified = verifyStartMergeRequest(deps.key, { ownerScope: input.ownerScope, questionLine: input.question_line, planKey: input.planKey,
        request: input });
      const ready = await readyFor(input);
      if (typeof ready === "string") return noneOf(ready);
      if (verified.prior !== null && verified.prior.revision >= L.menuRevisionsMax) return noneOf("NO_LISTS");
      // ask-f9: the same request from the same person, keyed by what its references verified, never by how they are spelled (wave-3 note b).
      const key = keyOf([input.ownerScope, startCanonicalJson({ question_line: input.question_line, reading_level: input.reading_level,
        clarify: input.clarify ?? null, check: { lock: verified.lock, version: verified.readingVersion }, lists: verified.lists, prior: verified.prior })]);
      const kept = keptIn(merges, key);
      if (kept !== null) return kept;
      if (signal.aborted) return noneOf("NOT_ASKED");
      return keep(merges, key, mergeOnce(input, verified, callerOf(transport, ready.config, input, startTryRefOfCheck(deps.key, input.ownerScope, input.check_ref)),
        haikuOf(transport)).catch(() => noneOf("TRANSPORT")));
    },

    async combine(input, signal) {
      const transport = deps.transport;
      if (deps.route === "NONE" || transport === null) return noneOf("OFF");
      // On the menu: the check verified as a merge's is (a combine carries no original); over a dig's picks: its parent, as the route read it.
      const asked = input.context;
      let main: Readonly<{ questionLine: string; language: NamedLanguage }>;
      let context: StartCombineContext;
      if (asked.kind === "MENU") {
        const lock = verifyStartCheck(deps.key, { ownerScope: input.ownerScope, questionLine: asked.question_line, planKey: input.planKey,
          settingsVersion: null, ref: asked.check_ref, originalQuestionLine: undefined });
        main = { questionLine: asked.question_line, language: lock.language };
        context = { kind: "MENU", menuId: asked.menu_id };
      } else {
        if (input.digParent === null) return noneOf("NOT_ASKED");
        main = input.digParent;
        context = { kind: "DIG", parentRunId: asked.parent_run_id };
      }
      const ready = await readyFor(input);
      if (typeof ready === "string") return noneOf(ready);
      // The same points in any order, where they were put together, from the same person: one call.
      const membersHash = startMembersHash(input.members);
      const key = keyOf([input.ownerScope, startCanonicalJson(context), membersHash]);
      const kept = keptIn(combines, key);
      if (kept !== null) return kept;
      if (signal.aborted) return noneOf("NOT_ASKED");
      // Task 57c: on the menu, the question's try; over a dig's picks, the dig's of its parent.
      const tryRef = asked.kind === "MENU" ? startTryRefOfCheck(deps.key, input.ownerScope, asked.check_ref)
        : startDigTryRefOf(deps.key, { ownerScope: input.ownerScope, parentRunId: asked.parent_run_id });
      return keep(combines, key, combineOnce(input, main, context, membersHash, callerOf(transport, ready.config, input, tryRef), haikuOf(transport))
        .catch(() => noneOf("TRANSPORT")));
    },

    async fit(input, signal) {
      const transport = deps.transport;
      if (deps.route === "NONE" || transport === null) return noneOf("OFF");
      const lock = verifyStartCheck(deps.key, { ownerScope: input.ownerScope, questionLine: input.question_line, planKey: input.planKey,
        settingsVersion: null, ref: input.check_ref, originalQuestionLine: undefined });
      const ready = await readyFor(input);
      if (typeof ready === "string") return noneOf(ready);
      if (signal.aborted) return noneOf("NOT_ASKED");
      const seat = haikuOf(transport);
      if (seat === null) return noneOf("TRANSPORT");
      // Raced with fitDeadlineMs; a key it was not given is refused by the fit's own reader (no usable reply: none UNREADABLE).
      const fitted = await within(timing.fitDeadlineMs, mapFitOwnPath({ questionLine: input.question_line, languageName: lock.language.name,
        languageTag: lock.language.code, ownText: input.own_text, paths: input.paths, seat,
        caller: callerOf(transport, ready.config, input, startTryRefOfCheck(deps.key, input.ownerScope, input.check_ref)) }))
        .catch(() => "THREW" as const);
      if (fitted === "DEADLINE") return noneOf("DEADLINE");
      if (fitted === "THREW") return noneOf("TRANSPORT");
      return fitted === null ? noneOf("UNREADABLE") : Object.freeze({ source: "AI" as const, fits_key: fitted.fitsKey });
    }
  };
  return Object.freeze(port);
}
