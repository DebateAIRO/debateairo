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
 * Each paid call's charge id is reserved for the person first (0171), on the request's own connection while its session is live, so the record after the
 * call, which 0171 made the system login's alone (main.ts's site X32), names the person whatever became of the session meanwhile (a sign-out, a
 * step-up's new token); a reservation the database refuses (the session is not the person's any more) means no further call for this request. A record or a reservation that cannot be written stops the calls until a restart
 * (never spend unrecorded). The database keeps the grant a team member's call names only when it is that person's own and was running when the call was
 * reserved, and otherwise records the call on the person's own plan, refusing nothing. A reservation names its person for an hour: every call is recorded
 * well within that, as the deadline below aborts the call (a hosted send it cuts short is recorded at once, at the projected maximum), the pool waits
 * 5 s at most for a connection and production ends a statement at 30 s. The reservations no charge took (a refused, skipped or abandoned call) go with the next
 * reservations, or with the hourly sweep below, which the API runs outside any request.
 *
 * Privacy: nothing here logs the question, the reply or the suggestions, only codes. Nothing is written to a database or a file but the money rows. The
 * cache below lives in this process's memory for minutes and is keyed by a hash under a per-process key, so it can never answer one person with
 * another's words.
 *
 * The limits are the register's abuseLimits row (R22 decision 18): a guard against a stuck page, not a quota. Per person, per process. A request takes
 * its one call from them as soon as it would make one, and keeps it whatever stops the call after (a refused reservation, a day-pot skip, a vendor's
 * refusal): giving it back would leave the limits no bound on a page that loops.
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

export type AskClarifyFallback = "RATE_LIMITED" | "DEADLINE" | "TRANSPORT" | "UNREADABLE" | "RECORD_DOWN" | "REQUEST_OWNER_MISMATCH";

export interface AskClarifyPort {
  /** `funding`: what funds this person now (the room's answer); a team member's call names its grant. */
  read(ownerRef: string, questionLine: string, funding: FundingBasis | null): Promise<AskClarifyResponse>;
}

const NONE: AskClarifyResponse = Object.freeze({ source: "NONE" });
/** A refusal every later record would meet too latches at once; any other failure after this many in a row. */
const RECORD_LATCHING_CODES: ReadonlySet<string> = new Set(["42501", "42883", "23514"]);
const RECORD_FAILURES_IN_A_ROW = 3;
/**
 * The security review's 0171 (F5): the reservation refuses, with 42501, an owner that is not the account of the live session the request's connection
 * presents. Only this request meets that (its session ended, or a step-up replaced its token, before the call was sent), never the next person's, so it
 * neither latches the breaker nor counts towards it. Refused before the first call, the request makes no paid call and shows no questions; refused before
 * the re-ask, there is no second call, and the first call's reading, reserved while the session was live and charged to the person, stands as for any
 * other failed re-ask. Either way the request has taken its one call from the person's limits, as every request that reaches a call does (a day-pot
 * skip or a vendor's refusal too): only a request whose session ended or was replaced after it was authenticated meets a refusal, and the next request
 * with that token is refused before this route, so it costs the person at most one call per session. Giving the call back would leave the limits no
 * bound on a page that loops while the API and the database disagree about a session (a clock apart at the session's absolute expiry, say).
 * Any other refusal of the reservation, a charge id another owner holds among them (23505, which only an id-reuse bug meets), is a reservation that
 * failed: the breaker counts it, and latches at once only for a code every later one would meet too.
 */
const REQUEST_OWNER_MISMATCH = "REQUEST_OWNER_MISMATCH";

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
  /** The one writer (0144), on the system login since 0171 (main.ts's site X32). A failure stops the calls; it never fails the page. */
  record: (entry: AskClarifyChargeEntry) => Promise<void>;
  /** Before each paid call, on the request's connection: the charge id it will be recorded under, reserved for the person (0171). */
  reserve: (entry: Readonly<{ spendId: string; ownerRef: string }>) => Promise<void>;
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
  /** A record or a reservation that failed: the breaker counts it, and latches at once for a refusal every later one would meet too. */
  const recordFailed = (failure: unknown): void => {
    const code = typeof failure === "object" && failure !== null && "code" in failure ? String(failure.code) : "";
    recordFailures += 1;
    if (RECORD_LATCHING_CODES.has(code) || recordFailures >= RECORD_FAILURES_IN_A_ROW) recordDown = true;
  };
  /** One call's cost, under the id reserved for it, counted in the person's quota. Never throws: a failed record is one code line, and the breaker. */
  const charge = async (spendId: string, ownerRef: string, funding: FundingBasis | null, usage: FastCheckUsage): Promise<void> => {
    try {
      const price = hostedLanguageCheckPrice(ASK_CLARIFY_MODEL_SETTINGS.priceMicrosUsdPerMillionTokens, ASK_CLARIFY_MODEL_SETTINGS.model, usage.inputTokens);
      await deps.record(Object.freeze({ spendId, ownerRef, providerRef: ASK_CLARIFY_SPEND_REF, chargedOn: costEnvelopeDay(deps.clock()),
        chargeMicros: languageCheckChargeMicros(usage, price), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        grant: funding?.kind === "INTERNAL" ? Object.freeze({ grantId: funding.grantId, grantEventId: funding.grantEventId }) : null }));
      recordFailures = 0;
    } catch (failure) {
      recordFailed(failure);
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
      /** What stopped a call before it was sent, if anything: this request's own refusal, or the record's failure. */
      const unsent: { code: "REQUEST_OWNER_MISMATCH" | "RECORD_DOWN" | null } = { code: null };
      // Each paid call (the slip order may make two, one after the other) under its own charge id, reserved before it is sent and charged by it after.
      const transport: FastCheckTransport = async (input) => {
        const spendId = newId();
        try {
          await deps.reserve(Object.freeze({ spendId, ownerRef }));
        } catch (failure) {
          if (failure instanceof Error && failure.message === REQUEST_OWNER_MISMATCH) unsent.code = REQUEST_OWNER_MISMATCH;
          else {
            unsent.code = "RECORD_DOWN";
            recordFailed(failure);
          }
          throw failure;
        }
        return transportFor((usage) => charge(spendId, ownerRef, funding, usage))(input);
      };
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
        return fallback(unsent.code ?? (controller.signal.aborted ? "DEADLINE" : "TRANSPORT"));
      } finally {
        clearTimeout(timer);
      }
    }
  });
}

/** How often the API sweeps the clarify reservations no charge took (0171): hourly, so none outlives about two hours (an hour's window, then a pass). */
export const ASK_CLARIFY_RESERVATION_SWEEP_EVERY_MS = 60 * 60_000;
/** One pass: batches of this many, at most this many batches, so a backlog never holds the timer; the next pass takes the rest. */
const RESERVATION_SWEEP = Object.freeze({ batch: 500, batchesPerPass: 20 });

/**
 * One pass of the sweep (0171's identity.delete_ask_clarify_reservations_due, the cross-account marker's alone): batches until one comes back short.
 * Its caller runs it outside any request, so the API's pool sends it to the system login. A batch that fails ends the pass with its failure; the
 * single-flight trigger logs one content-free line and the next pass tries again. Returns how many reservations went.
 */
export async function sweepAskClarifyReservations(deleteDue: (limit: number) => Promise<number>): Promise<number> {
  let gone = 0;
  for (let batch = 0; batch < RESERVATION_SWEEP.batchesPerPass; batch += 1) {
    const taken = await deleteDue(RESERVATION_SWEEP.batch);
    gone += taken;
    if (taken < RESERVATION_SWEEP.batch) break;
  }
  return gone;
}
