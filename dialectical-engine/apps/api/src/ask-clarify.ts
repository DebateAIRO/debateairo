import { createHash, randomBytes } from "node:crypto";
import { AskClarifyResponseSchema, WEB_CONTRACT_LIMITS, type AskClarifyResponse, type ClarifyQuestion } from "@debateai/contract";
import { framedAskClarify } from "@debateai/judgement";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, appendFramedRejection, decodeModelJson, type PromptPacket
} from "@debateai/providers";
import { exhaustive } from "@debateai/kernel";
import type { QuestionLanguageFastCheck, QuestionLanguagePolicy } from "@debateai/register";
import type { QuestionLanguagePaidRoute } from "./question-language/boot.js";
import type { FastCheckTransport } from "./question-language/fast-check.js";
import { anthropicFastCheckTransport } from "./question-language/transport.js";

/**
 * DYNAMIC STEP 2 (plan 2026-10-31-r22-owner-changes decision 29): one small Haiku call, before any debate exists, that writes the clarifying
 * questions for the ask page. The page never waits on it past a bound and never fails because of it: every failure here is the GENERIC answer,
 * and the page then shows its generic purpose options.
 *
 * Money: no run exists yet, so the call is one run-less site cost, the same as the two other calls made before a debate (the language check and
 * the question check), through the language check's writer (0118) under its own provider reference, so it needs no migration and counts in the
 * day's site pot. It is NOT in the person's quota share: a person's windows are the charges of the runs pinned to them, and a run-less row names
 * nobody. What bounds it per person is the limit below. Preview: the Anthropic gate settles it in its daily pot, like the language check.
 *
 * Privacy: nothing here logs the question, the reply or the suggestions, only codes. Nothing is written to a database or a file except the money
 * row (a day, a charge and two counts). The cache below lives in this process's memory for minutes and is keyed by a hash under a per-process key,
 * so it can never answer one person with another's words.
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

export const ASK_CLARIFY_SPEND_REF = "language-check:ask-clarify:claude-haiku-5-5" as const;

/**
 * The route table's input (question-language/boot.ts decides PREVIEW, HOSTED or NONE, one decision for every call before a debate). The route
 * reads only `fastCheck`; the instruction is the sealed contract's, never this row's.
 */
export const ASK_CLARIFY_ROUTE_POLICY: QuestionLanguagePolicy = Object.freeze({
  kind: "QUESTION_LANGUAGE_POLICY", version: 1, fastCheck: ASK_CLARIFY_MODEL_SETTINGS, instruction: "Not read: the route takes the model settings only."
});

/**
 * The transport for a route. Local mode has no paid AI (NONE, reason LOCAL_MODE), so its page shows the generic purpose options, as the language
 * check falls back there; a person running it locally loses nothing but the tailored questions. Preview: the guarded fetch through the Anthropic
 * gate, no key, no usage record (the gate settles). Hosted: the support target's key and the day-pot gate, as the language check.
 */
export function askClarifyTransport(route: QuestionLanguagePaidRoute): FastCheckTransport | null {
  switch (route.kind) {
    case "NONE": return null;
    case "PREVIEW": return anthropicFastCheckTransport({ fetch: route.fetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings: ASK_CLARIFY_MODEL_SETTINGS });
    case "HOSTED": return anthropicFastCheckTransport({ fetch, url: `${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`,
      credential: route.credential, settings: ASK_CLARIFY_MODEL_SETTINGS, onUsage: route.recordSpend, beforeSend: route.beforeSend });
    default: return exhaustive(route);
  }
}

/** Per person, per process: enough for a person who edits their question, little for a page reloaded in a loop. */
const LIMITS = Object.freeze({ perHour: 12, perDay: 30, hourMs: 3_600_000, dayMs: 86_400_000 });
/** A repeat of the same text within this time is answered from memory. */
const CACHE = Object.freeze({ ttlMs: 10 * 60_000, entries: 2_000 });
/** The tables' bound: past it the oldest person is forgotten, which can only give them a fresh limit. */
const PEOPLE_MAX = 20_000;

export type AskClarifyFallback = "NOT_CONFIGURED" | "RATE_LIMITED" | "DEADLINE" | "TRANSPORT" | "UNREADABLE";

export interface AskClarifyPort {
  read(ownerRef: string, questionLine: string): Promise<AskClarifyResponse>;
}

const GENERIC: AskClarifyResponse = Object.freeze({ source: "GENERIC" });

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
 * resend. What the second try cannot give falls to the generic answer: readable questions with no purpose question are still no answer,
 * because the purpose question is the one the owner asked for always.
 */
async function readWithRecovery(questionLine: string, transport: FastCheckTransport, signal: AbortSignal): Promise<Reading | null> {
  const packet: PromptPacket = framedAskClarify(questionLine);
  const first = readAskClarifyReply(await transport({ packet, signal }));
  if (first?.purpose !== null && first?.purpose !== undefined) return first;
  const again = appendFramedRejection(packet, first === null
    ? { code: "ASK_CLARIFY_REPLY_UNREADABLE", path: "reply" }
    : { code: "ASK_CLARIFY_PURPOSE_MISSING", path: "purpose" });
  return readAskClarifyReply(await transport({ packet: again, signal }));
}

export function createAskClarify(deps: Readonly<{
  /** Null: this deployment has no paid AI for it (local mode, no gate, no key, no spend writer). */
  transport: FastCheckTransport | null;
  clock: () => Date;
  report: (line: Readonly<{ event: string; code: string }>) => void;
  deadlineMs?: number;
}>): AskClarifyPort {
  const deadlineMs = deps.deadlineMs ?? ASK_CLARIFY_DEADLINE_MS;
  const cacheKey = randomBytes(32);
  const cache = new Map<string, Readonly<{ at: number; answer: AskClarifyResponse }>>();
  const calls = new Map<string, number[]>();
  const fallback = (code: AskClarifyFallback): AskClarifyResponse => {
    deps.report({ event: "api.ask_clarify.generic", code });
    return GENERIC;
  };
  /** Takes one call from the person's limits, or says none is left. */
  const admitted = (ownerRef: string, now: number): boolean => {
    const recent = (calls.get(ownerRef) ?? []).filter((at) => now - at < LIMITS.dayMs);
    if (recent.length >= LIMITS.perDay || recent.filter((at) => now - at < LIMITS.hourMs).length >= LIMITS.perHour) {
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
    async read(ownerRef: string, questionLine: string): Promise<AskClarifyResponse> {
      const transport = deps.transport;
      if (transport === null) return GENERIC;
      const now = deps.clock().getTime();
      const key = createHash("sha256").update(cacheKey).update(ownerRef).update("\0").update(questionLine).digest("base64url");
      const known = cache.get(key);
      if (known !== undefined && now - known.at < CACHE.ttlMs) return known.answer;
      cache.delete(key);
      if (!admitted(ownerRef, now)) return fallback("RATE_LIMITED");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs);
      const abandoned = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("ASK_CLARIFY_DEADLINE")), { once: true });
      });
      try {
        const reading = await Promise.race([readWithRecovery(questionLine, transport, controller.signal), abandoned]);
        if (reading === null || reading.purpose === null) return fallback("UNREADABLE");
        const answer = AskClarifyResponseSchema.parse({ source: "AI", questions: reading.questions, purpose: reading.purpose });
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
