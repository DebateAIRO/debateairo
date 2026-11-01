import { createHash, randomBytes, randomUUID } from "node:crypto";
import { costEnvelopeDay, languageCheckChargeMicros, type AskClarifyChargeEntry } from "@debateai/budget";
import { AskClarifyResponseSchema, WEB_CONTRACT_LIMITS, type AskClarifyResponse, type ClarifyQuestion } from "@debateai/contract";
import { framedAskClarify } from "@debateai/judgement";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, appendFramedRejection, decodeModelJson, type PromptPacket
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
  /** `funding`: what funds this person now (the room's answer); a team member's call names its grant. */
  read(ownerRef: string, questionLine: string, funding: FundingBasis | null): Promise<AskClarifyResponse>;
}

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });
/** A refusal every later record would meet too latches at once; any other failure after this many in a row. */
const RECORD_LATCHING_CODES: ReadonlySet<string> = new Set(["42501", "42883", "23514"]);
const RECORD_FAILURES_IN_A_ROW = 3;

type Reading = Readonly<{ questions: readonly ClarifyQuestion[]; purpose: ClarifyQuestion | null }>;

/** One line of AI text within `max` characters, or null. A copied placeholder ("<a short answer>") is no answer. */
function lineOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/gu, " ").trim();
  if (line.length === 0 || line.length > max || (line.startsWith("<") && line.endsWith(">"))) return null;
  return line;
}

/** A usable question, at most the contract's answers, repeats dropped, or null (too few answers left, or no text). */
function questionOf(value: unknown): ClarifyQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const { text, answers } = value as { text?: unknown; answers?: unknown };
  const asked = lineOf(text, WEB_CONTRACT_LIMITS.clarifyQuestionMaxChars);
  if (asked === null || !Array.isArray(answers)) return null;
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const answer of answers) {
    const line = lineOf(answer, WEB_CONTRACT_LIMITS.clarifyAnswerMaxChars);
    const key = line?.toLocaleLowerCase();
    if (line === null || key === undefined || seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
    if (kept.length === WEB_CONTRACT_LIMITS.clarifyAnswersMax) break;
  }
  return kept.length < WEB_CONTRACT_LIMITS.clarifyAnswersMin ? null : { text: asked, answers: kept };
}

/** The reply as code can read it (the slip order's first step): prose or fences around the JSON, a bad question dropped, a long list cut. Null: nothing readable. */
export function readAskClarifyReply(text: string): Reading | null {
  const decoded = decodeModelJson(text);
  if (!decoded.ok || typeof decoded.value !== "object" || decoded.value === null) return null;
  const { questions, purpose } = decoded.value as { questions?: unknown; purpose?: unknown };
  if (!Array.isArray(questions) && purpose === undefined) return null;
  const purposeQuestion = questionOf(purpose);
  const seen = new Set<string>(purposeQuestion === null ? [] : [purposeQuestion.text.toLocaleLowerCase()]);
  const kept: ClarifyQuestion[] = [];
  for (const item of Array.isArray(questions) ? questions : []) {
    const question = questionOf(item);
    if (question === null || seen.has(question.text.toLocaleLowerCase())) continue;
    seen.add(question.text.toLocaleLowerCase());
    kept.push(question);
    if (kept.length === WEB_CONTRACT_LIMITS.clarifyQuestionsMax) break;
  }
  return Object.freeze({ questions: Object.freeze(kept), purpose: purposeQuestion });
}

/**
 * The rest of the slip order (owner 2026-10-12): code reads the reply; a reply with no purpose question, or nothing readable, is asked again once
 * with a code and a path only. The owner's middle step, a smaller follow-up, saves nothing here: the whole reply is smaller than the turn it would
 * resend. If the second try still has no purpose question, the first try's other questions are kept.
 */
async function readWithRecovery(questionLine: string, transport: FastCheckTransport, signal: AbortSignal): Promise<Reading | null> {
  const packet: PromptPacket = framedAskClarify(questionLine);
  const first = readAskClarifyReply(await transport({ packet, signal }));
  if (first?.purpose !== null && first?.purpose !== undefined) return first;
  const again = appendFramedRejection(packet, first === null
    ? { code: "ASK_CLARIFY_REPLY_UNREADABLE", path: "reply" }
    : { code: "ASK_CLARIFY_PURPOSE_MISSING", path: "purpose" });
  let second: Reading | null;
  try {
    second = readAskClarifyReply(await transport({ packet: again, signal }));
  } catch (failure) {
    if (first === null || first.questions.length === 0) throw failure;
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
}>): AskClarifyPort {
  const deadlineMs = deps.deadlineMs ?? ASK_CLARIFY_DEADLINE_MS;
  const cacheKey = randomBytes(32);
  const cache = new Map<string, Readonly<{ at: number; answer: AskClarifyResponse }>>();
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
  return Object.freeze({
    async read(ownerRef: string, questionLine: string, funding: FundingBasis | null): Promise<AskClarifyResponse> {
      const transportFor = deps.transportFor;
      if (transportFor === null) return NONE;
      const now = deps.clock().getTime();
      const key = createHash("sha256").update(cacheKey).update(ownerRef).update("\0").update(questionLine).digest("base64url");
      const known = cache.get(key);
      if (known !== undefined && now - known.at < CACHE.ttlMs) return known.answer;
      cache.delete(key);
      if (recordDown) return fallback("RECORD_DOWN");
      if (!admitted(ownerRef, now)) return fallback("RATE_LIMITED");
      const transport = transportFor((usage) => charge(ownerRef, funding, usage));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs);
      const abandoned = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("ASK_CLARIFY_DEADLINE")), { once: true });
      });
      try {
        const reading = await Promise.race([readWithRecovery(questionLine, transport, controller.signal), abandoned]);
        if (reading === null || (reading.purpose === null && reading.questions.length === 0)) return fallback("UNREADABLE");
        const answer = AskClarifyResponseSchema.parse({ source: "AI", questions: reading.questions, ...(reading.purpose === null ? {} : { purpose: reading.purpose }) });
        cache.set(key, Object.freeze({ at: now, answer }));
        if (cache.size > CACHE.entries) cache.delete(cache.keys().next().value!);
        return answer;
      } catch {
        return fallback(controller.signal.aborted ? "DEADLINE" : "TRANSPORT");
      } finally {
        clearTimeout(timer);
      }
    }
  });
}
