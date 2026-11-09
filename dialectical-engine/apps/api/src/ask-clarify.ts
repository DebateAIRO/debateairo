import { createHash, randomBytes, randomUUID } from "node:crypto";
import { costEnvelopeDay, languageCheckChargeMicros, type AskClarifyChargeEntry } from "@debateai/budget";
import { AskClarifyResponseSchema, WEB_CONTRACT_LIMITS, type AskClarifyEarlier, type AskClarifyResponse, type ClarifyQuestion } from "@debateai/contract";
import { ASK_CLARIFY_SEALED_CONTRACTS, ASK_CLARIFY_V2_CONTRACT_ID, framedAskClarify } from "@debateai/judgement";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, appendFramedRejection, decodeModelJson, type PromptContract,
  type PromptPacket
} from "@debateai/providers";
import { exhaustive, type FundingBasis } from "@debateai/kernel";
import type { QuestionLanguageFastCheck, QuestionLanguagePolicy } from "@debateai/register";
import { hostedLanguageCheckPrice, type QuestionLanguagePaidRoute } from "./question-language/boot.js";
import type { FastCheckTransport } from "./question-language/fast-check.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "./question-language/transport.js";

/**
 * DYNAMIC STEP 2 (plan 2026-10-31-r22-owner-changes decisions 29 and 31): one small Haiku call, before any debate exists, that writes the clarifying
 * questions for the ask page. The page never waits on it past a bound and never fails because of it: every failure here is the NONE answer, and the
 * page then shows no questions, only the person's own-words boxes.
 *
 * Money: the call counts in the person's quota. No run exists yet, so it has its own record (0144): one row naming the person, the cost and the time,
 * beside a run-less ledger row that keeps it in the site's day. The windows, a team member's grant and the team's one limit all read it. The caller
 * asks first whether the pool is empty: empty, no call. Every call is recorded from the vendor's real counts, or the projected maximum when a hosted
 * call may have been billed without readable counts; on the preview the gate settles the money and a refused send costs nothing, so only real counts.
 * A record that cannot be written stops the calls until a restart (never spend unrecorded).
 *
 * Privacy: nothing here logs the question, the reply or the suggestions, only codes. Nothing is written to a database or a file but the money rows. The
 * cache below lives in this process's memory for minutes and is keyed by a hash under a per-process key, so it can never answer one person with
 * another's words.
 *
 * The limits are the register's abuseLimits row (R22 decision 18): a guard against a stuck page, not a quota. Per person, per process.
 */

/** The server's bound on the whole step, retries included. The page gives up a little after it (V4 ASK_CLARIFY_PAGE_WAIT_MS). */
const ASK_CLARIFY_DEADLINE_MS = 8_000;

/** What the call is sent with. A price of zero: `hostedLanguageCheckPrice` takes the reviewed provider table's, and refuses a model off it. */
export const ASK_CLARIFY_MODEL_SETTINGS: QuestionLanguageFastCheck = Object.freeze({
  provider: "anthropic",
  model: "claude-haiku-5-5",
  effort: "low",
  timeoutMs: ASK_CLARIFY_DEADLINE_MS,
  // Four questions with four answers at the contract's lengths, in a script of long tokens, with low thinking's room.
  maxOutputTokens: 2_000,
  priceMicrosUsdPerMillionTokens: Object.freeze({ input: 0, output: 0 })
});

/** The ledger's code for the call: names no person. 0144's writer refuses any other shape. */
export const ASK_CLARIFY_SPEND_REF = "ask-clarify:anthropic:claude-haiku-5-5" as const;

/**
 * The route table's input (question-language/boot.ts decides PREVIEW, HOSTED or NONE, one decision for every call before a debate). The route
 * reads only `fastCheck`; the instruction is the sealed contract's, never this row's.
 */
export const ASK_CLARIFY_ROUTE_POLICY: QuestionLanguagePolicy = Object.freeze({
  kind: "QUESTION_LANGUAGE_POLICY", version: 1, fastCheck: ASK_CLARIFY_MODEL_SETTINGS, instruction: "Not read: the route takes the model settings only."
});

/** A transport that reports one call's cost in tokens to `onUsage`. */
export type AskClarifyTransportFor = (onUsage: (usage: FastCheckUsage) => Promise<void>) => FastCheckTransport;

/**
 * The transports of a route. Local mode has no paid AI (NONE, reason LOCAL_MODE), so its page shows no questions, as the language check makes no call
 * there. Preview: the guarded fetch through the Anthropic gate, no key; only the vendor's real counts reach the person's quota (a send the guarded
 * fetch refused cost nothing, and would otherwise read as a projected maximum). Hosted: the support target's key and the day-pot gate, as the language check.
 */
export function askClarifyTransportFor(route: QuestionLanguagePaidRoute): AskClarifyTransportFor | null {
  switch (route.kind) {
    case "NONE": return null;
    case "PREVIEW": return (onUsage) => anthropicFastCheckTransport({ fetch: route.fetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined,
      settings: ASK_CLARIFY_MODEL_SETTINGS, onUsage: async (usage) => { if (!usage.projected) await onUsage(usage); } });
    case "HOSTED": return (onUsage) => anthropicFastCheckTransport({ fetch, url: `${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`,
      credential: route.credential, settings: ASK_CLARIFY_MODEL_SETTINGS, onUsage, beforeSend: route.beforeSend });
    default: return exhaustive(route);
  }
}

const WINDOWS = Object.freeze({ hourMs: 3_600_000, dayMs: 86_400_000 });
/** A repeat of the same text within this time is answered from memory. */
const CACHE = Object.freeze({ ttlMs: 10 * 60_000, entries: 2_000 });
/** The tables' bound: past it the oldest person is forgotten, which can only give them a fresh limit. */
const PEOPLE_MAX = 20_000;

export type AskClarifyFallback = "RATE_LIMITED" | "DEADLINE" | "TRANSPORT" | "UNREADABLE" | "RECORD_DOWN";

export interface AskClarifyPort {
  /**
   * `funding`: what funds this person now (the room's answer); a team member's call names its grant. V4 start step, Task 76d (read-f1):
   * `earlier`, the questions shown for an earlier wording and the person's answers, framed only once version 2 is sealed. It never
   * changes which reply is reused: the same person's same line within the cache's time is the same reading.
   */
  read(ownerRef: string, questionLine: string, funding: FundingBasis | null, earlier?: AskClarifyEarlier | null): Promise<AskClarifyResponse>;
}

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });
/** A refusal every later record would meet too latches at once; any other failure after this many in a row. */
const RECORD_LATCHING_CODES: ReadonlySet<string> = new Set(["42501", "42883", "23514"]);
const RECORD_FAILURES_IN_A_ROW = 3;

/**
 * V4 start step, Task 76d: which version of the call is asked. "v2" only once its contract is sealed (Task 92 puts it in
 * ASK_CLARIFY_SEALED_CONTRACTS): its sentences, its place mark and its care question are read only then; until then a reply is read as
 * version 1's, whatever it carries.
 */
export type AskClarifyVersion = "v1" | "v2";

type Reading = Readonly<{ questions: readonly ClarifyQuestion[]; purpose: ClarifyQuestion | null; cares: ClarifyQuestion | null }>;

/** One line of AI text within `max` characters, or null. A copied placeholder ("<a short answer>") is no answer. */
function lineOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/gu, " ").trim();
  if (line.length === 0 || line.length > max || (line.startsWith("<") && line.endsWith(">"))) return null;
  return line;
}

/**
 * A usable question, at most the contract's answers, repeats dropped, or null (too few answers left, or no text). Version 2 (Task 76d):
 * with its sentences, each kept with its own answer (a repeat goes with its sentence); all or none, so a list of another length, or one
 * sentence that is no usable line, leaves the answers as today's pairs.
 */
function questionOf(value: unknown, version: AskClarifyVersion): ClarifyQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const { text, answers, sentences } = value as { text?: unknown; answers?: unknown; sentences?: unknown };
  const asked = lineOf(text, WEB_CONTRACT_LIMITS.clarifyQuestionMaxChars);
  if (asked === null || !Array.isArray(answers)) return null;
  const written: readonly unknown[] | null = version === "v2" && Array.isArray(sentences) && sentences.length === answers.length ? sentences : null;
  const seen = new Set<string>();
  const kept: string[] = [];
  const said: (string | null)[] = [];
  for (const [at, answer] of answers.entries()) {
    const line = lineOf(answer, WEB_CONTRACT_LIMITS.clarifyAnswerMaxChars);
    const key = line?.toLocaleLowerCase();
    if (line === null || key === undefined || seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
    said.push(written === null ? null : lineOf(written[at], WEB_CONTRACT_LIMITS.clarifyQuestionMaxChars));
    if (kept.length === WEB_CONTRACT_LIMITS.clarifyAnswersMax) break;
  }
  if (kept.length < WEB_CONTRACT_LIMITS.clarifyAnswersMin) return null;
  const sentencesKept = said.filter((sentence): sentence is string => sentence !== null);
  return { text: asked, answers: kept, ...(written !== null && sentencesKept.length === kept.length ? { sentences: sentencesKept } : {}) };
}

/**
 * The reply as code can read it (the slip order's first step): prose or fences around the JSON, a bad question dropped, a long list cut. Null: nothing readable.
 * Version 2 (Task 76d): the sentences, the place mark on the first question that carries it (a question of the AI's own, never the purpose
 * or the care question) and the care question, dropped when its words repeat another question's (the page keys answers by a question's words).
 */
export function readAskClarifyReply(text: string, version: AskClarifyVersion = "v1"): Reading | null {
  const decoded = decodeModelJson(text);
  if (!decoded.ok || typeof decoded.value !== "object" || decoded.value === null) return null;
  const { questions, purpose, cares } = decoded.value as { questions?: unknown; purpose?: unknown; cares?: unknown };
  if (!Array.isArray(questions) && purpose === undefined && (version === "v1" || cares === undefined)) return null;
  const purposeQuestion = questionOf(purpose, version);
  const seen = new Set<string>(purposeQuestion === null ? [] : [purposeQuestion.text.toLocaleLowerCase()]);
  const kept: ClarifyQuestion[] = [];
  let placed = false;
  for (const item of Array.isArray(questions) ? questions : []) {
    const question = questionOf(item, version);
    if (question === null || seen.has(question.text.toLocaleLowerCase())) continue;
    seen.add(question.text.toLocaleLowerCase());
    const where = version === "v2" && !placed && (item as { about_place?: unknown }).about_place === true;
    if (where) placed = true;
    kept.push(where ? { ...question, about_place: true } : question);
    if (kept.length === WEB_CONTRACT_LIMITS.clarifyQuestionsMax) break;
  }
  const caresQuestion = version === "v2" ? questionOf(cares, version) : null;
  const caresKept = caresQuestion === null || seen.has(caresQuestion.text.toLocaleLowerCase()) ? null : caresQuestion;
  return Object.freeze({ questions: Object.freeze(kept), purpose: purposeQuestion, cares: caresKept });
}

/**
 * The rest of the slip order (owner 2026-10-12): code reads the reply; a reply with no purpose question, or nothing readable, is asked again once
 * with a code and a path only. The owner's middle step, a smaller follow-up, saves nothing here: the whole reply is smaller than the turn it would
 * resend. If the second try still has no purpose question, the first try's other questions are kept.
 * Task 76d: `v2`, the sealed version 2 contract (null while only version 1 is sealed); with it, `earlier` is framed and the reply read as
 * version 2's. Without it, version 1's packet, byte for byte, whatever `earlier` says.
 */
async function readWithRecovery(questionLine: string, earlier: AskClarifyEarlier | null, v2: PromptContract | null, transport: FastCheckTransport,
  signal: AbortSignal): Promise<Reading | null> {
  const version: AskClarifyVersion = v2 === null ? "v1" : "v2";
  const packet: PromptPacket = framedAskClarify(questionLine, v2 === null ? {} : { contract: v2, ...(earlier === null ? {} : { earlier }) });
  const first = readAskClarifyReply(await transport({ packet, signal }), version);
  if (first?.purpose !== null && first?.purpose !== undefined) return first;
  const again = appendFramedRejection(packet, first === null
    ? { code: "ASK_CLARIFY_REPLY_UNREADABLE", path: "reply" }
    : { code: "ASK_CLARIFY_PURPOSE_MISSING", path: "purpose" });
  let second: Reading | null;
  try {
    second = readAskClarifyReply(await transport({ packet: again, signal }), version);
  } catch (failure) {
    if (first === null || (first.questions.length === 0 && first.cares === null)) throw failure;
    return first;
  }
  return second?.purpose !== null && second !== null ? second : second !== null && second.questions.length >= (first?.questions.length ?? 0) ? second : first;
}

export function createAskClarify(deps: Readonly<{
  /** The register's abuseLimits row: enough for a person who edits their question, little for a page reloaded in a loop. */
  limits: Readonly<{ perHour: number; perDay: number }>;
  /** Null: this deployment has no paid AI for it (local mode, no gate, no key, no writer). */
  transportFor: AskClarifyTransportFor | null;
  /** The one writer (0144). A failure stops the calls; it never fails the page. */
  record: (entry: AskClarifyChargeEntry) => Promise<void>;
  clock: () => Date;
  report: (line: Readonly<{ event: string; code: string }>) => void;
  deadlineMs?: number;
  newId?: () => string;
  /**
   * V4 start step, Task 76d: the sealed contracts of the call (ASK_CLARIFY_SEALED_CONTRACTS, which Task 92 extends with version 2); a
   * test stands in a list holding version 2. The call is asked with version 2 only once it is on this list.
   */
  sealed?: readonly PromptContract[];
}>): AskClarifyPort {
  const deadlineMs = deps.deadlineMs ?? ASK_CLARIFY_DEADLINE_MS;
  const v2 = (deps.sealed ?? ASK_CLARIFY_SEALED_CONTRACTS).find((contract) => contract.contractId === ASK_CLARIFY_V2_CONTRACT_ID) ?? null;
  const cacheKey = randomBytes(32);
  const cache = new Map<string, Readonly<{ at: number; answer: AskClarifyResponse }>>();
  /**
   * V4 start step, Task 28 (ask-f9, read-f13): the reads still waiting on their AI, under the cache's key. A second read of the same line
   * by the same person while the first runs gets the first's answer: one AI call, counted once, and no call taken from the limits.
   */
  const running = new Map<string, Promise<AskClarifyResponse>>();
  const calls = new Map<string, number[]>();
  const newId = deps.newId ?? randomUUID;
  let recordDown = false;
  let recordFailures = 0;
  /** One call's cost, counted in the person's quota. Never throws: a failed record is one code line, and the breaker. */
  const charge = async (ownerRef: string, funding: FundingBasis | null, usage: FastCheckUsage): Promise<void> => {
    try {
      const price = hostedLanguageCheckPrice(ASK_CLARIFY_MODEL_SETTINGS.priceMicrosUsdPerMillionTokens, ASK_CLARIFY_MODEL_SETTINGS.model, usage.inputTokens);
      await deps.record(Object.freeze({ spendId: newId(), ownerRef, providerRef: ASK_CLARIFY_SPEND_REF, chargedOn: costEnvelopeDay(deps.clock()),
        chargeMicros: languageCheckChargeMicros(usage, price), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        grant: funding?.kind === "INTERNAL" ? Object.freeze({ grantId: funding.grantId, grantEventId: funding.grantEventId }) : null }));
      recordFailures = 0;
    } catch (failure) {
      const code = typeof failure === "object" && failure !== null && "code" in failure ? String(failure.code) : "";
      recordFailures += 1;
      if (RECORD_LATCHING_CODES.has(code) || recordFailures >= RECORD_FAILURES_IN_A_ROW) recordDown = true;
      deps.report({ event: "api.ask_clarify.charge_unrecorded", code: "RECORD_DOWN" });
    }
  };
  const fallback = (code: AskClarifyFallback): AskClarifyResponse => {
    deps.report({ event: "api.ask_clarify.none", code });
    return NONE;
  };
  /** Takes one call from the person's limits, or says none is left. */
  const admitted = (ownerRef: string, now: number): boolean => {
    const recent = (calls.get(ownerRef) ?? []).filter((at) => now - at < WINDOWS.dayMs);
    if (recent.length >= deps.limits.perDay || recent.filter((at) => now - at < WINDOWS.hourMs).length >= deps.limits.perHour) {
      calls.set(ownerRef, recent);
      return false;
    }
    recent.push(now);
    calls.delete(ownerRef);
    calls.set(ownerRef, recent);
    if (calls.size > PEOPLE_MAX) calls.delete(calls.keys().next().value!);
    return true;
  };
  /** One read's AI call and answer (the cache keeps an AI answer for CACHE.ttlMs). */
  const readOnce = async (transportFor: AskClarifyTransportFor, key: string, now: number, ownerRef: string, questionLine: string,
    funding: FundingBasis | null, earlier: AskClarifyEarlier | null): Promise<AskClarifyResponse> => {
    if (recordDown) return fallback("RECORD_DOWN");
    if (!admitted(ownerRef, now)) return fallback("RATE_LIMITED");
    const transport = transportFor((usage) => charge(ownerRef, funding, usage));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    const abandoned = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("ASK_CLARIFY_DEADLINE")), { once: true });
    });
    try {
      const reading = await Promise.race([readWithRecovery(questionLine, earlier, v2, transport, controller.signal), abandoned]);
      if (reading === null || (reading.purpose === null && reading.questions.length === 0 && reading.cares === null)) return fallback("UNREADABLE");
      const answer = AskClarifyResponseSchema.parse({ source: "AI", questions: reading.questions, ...(reading.purpose === null ? {} : { purpose: reading.purpose }),
        ...(reading.cares === null ? {} : { cares: reading.cares }) });
      cache.set(key, Object.freeze({ at: now, answer }));
      if (cache.size > CACHE.entries) cache.delete(cache.keys().next().value!);
      return answer;
    } catch {
      return fallback(controller.signal.aborted ? "DEADLINE" : "TRANSPORT");
    } finally {
      clearTimeout(timer);
    }
  };
  return Object.freeze({
    async read(ownerRef: string, questionLine: string, funding: FundingBasis | null, earlier?: AskClarifyEarlier | null): Promise<AskClarifyResponse> {
      const transportFor = deps.transportFor;
      if (transportFor === null) return NONE;
      const now = deps.clock().getTime();
      const key = createHash("sha256").update(cacheKey).update(ownerRef).update("\0").update(questionLine).digest("base64url");
      const known = cache.get(key);
      if (known !== undefined && now - known.at < CACHE.ttlMs) return known.answer;
      cache.delete(key);
      // Task 28: the same person's same line, still being read, is joined (nothing is awaited before it is registered, so two reads
      // made at once meet here); once it has ended, answered or not, it is joined no more.
      const joined = running.get(key);
      if (joined !== undefined) return joined;
      // Task 76d (read-f1): `earlier` is no part of the key; two reads of the same new line are the same reading.
      const reading = readOnce(transportFor, key, now, ownerRef, questionLine, funding, earlier ?? null);
      running.set(key, reading);
      const over = (): void => { if (running.get(key) === reading) running.delete(key); };
      void reading.then(over, over);
      return reading;
    }
  });
}
