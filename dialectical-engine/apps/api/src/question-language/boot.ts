import { randomUUID } from "node:crypto";
import { costEnvelopeDay, languageCheckChargeMicros, type LanguageCheckSpendEntry } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, previewModelRow, previewProviderSocket,
  promptTextHasReservedToken, type PreviewGateSettings, type PreviewModelRow
} from "@debateai/providers";
import {
  questionLanguagePolicyStartValues, type DeploymentMode, type QuestionLanguageFastCheck, type QuestionLanguagePolicy
} from "@debateai/register";
import { QuestionLanguageDecider, type QuestionLanguageChoiceNeeded, type QuestionLanguageFastCheckOffReason, type QuestionLanguageLock } from "./decider.js";
import { loadEldReader } from "./eld.js";
import { ELD_TUNING } from "./eld-tuning.js";
import { QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES, createFastCheck, type FastCheck } from "./fast-check.js";
import type { QuestionLanguageReferenceKey } from "./reference.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "./transport.js";

/**
 * How a fast check may be paid for, decided once at boot (ruling CR-6, ruling L-ROUTE). The transport cannot tell the
 * guarded fetch from the global fetch, and the preview and hosted URLs are the same string, so THIS table is the guard:
 *
 *   deployment                         route    transport                                         who pays
 *   preview + Anthropic gate socket    PREVIEW  the guarded fetch, no key, no spend record        the gate's daily pot
 *   preview, no Anthropic gate socket  NONE     none (reason NO_GATE)                             nothing is called
 *   hosted, 0118's writer absent       NONE     none (reason HOSTED_BEFORE_SPEND_RECORD)          nothing is called
 *   hosted, no Anthropic support key   NONE     none (reason NO_HOSTED_KEY)                       nothing is called
 *   hosted, 0118 + the support key     HOSTED   the support target's key, the exact Anthropic URL the run-less spend record
 *   local mode                         NONE     none (reason LOCAL_MODE)                          nothing is called
 *   the row's fastCheck: null          (any)    none (reason POLICY_OFF)                          nothing is called
 *
 * The API gets no new vendor credential, and on the preview it holds none. The fast check is a SITE cost: nothing
 * here, or anywhere it is called from, charges the person (submit runs it before any allowance or billing step).
 */
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void>;
    /** Asked before each send: null = send; a skip code (breaker down, site pot full) = do not send (fix round 2). */
    beforeSend: () => Promise<string | null> }>
  | Readonly<{ kind: "NONE"; reason: QuestionLanguageFastCheckOffReason }>;

/** The message is the code (pre-flight PF-L13: a test's toThrow("…") reads the message); it carries no owner text. */
const refusal = (code: string): TypedDomainError => new TypedDomainError(code, code);

/**
 * Boot: an owner instruction carrying a frame token, or (on the preview) a model the Anthropic gate does not review
 * or an effort off its reviewed menu, refuses the boot once, by name, never at every ask. The frame-token rule is the
 * providers' one definition (promptTextHasReservedToken, P2L final review I4), the same the hosted publisher and the
 * preview kits ask before sealing; on the hosted route an unpriced model is refused by hostedQuestionLanguageRoute.
 */
export function assertQuestionLanguagePolicyBootable(policy: QuestionLanguagePolicy, route: QuestionLanguagePaidRoute): void {
  if (promptTextHasReservedToken(policy.instruction)) throw refusal("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN");
  if (policy.fastCheck === null || route.kind !== "PREVIEW") return;
  const reviewed = previewModelRow(policy.fastCheck.model);
  if (reviewed === undefined || reviewed.provider !== policy.fastCheck.provider
    || !(reviewed.efforts as readonly string[]).includes(policy.fastCheck.effort)) {
    throw refusal("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW");
  }
}

/**
 * Ruling L-ROUTE (CR-6; pre-flight PF-L35): a deployment with a preview configuration NEVER takes the hosted route,
 * even in hosted mode (#163): the API holds no vendor key on the preview, and the egress proxy admits only the
 * billing hosts. With the guarded fetch AND the Anthropic gate socket it is PREVIEW; without either there is no fast
 * check (eld + site language). `hosted` is asked only when no preview is configured.
 */
export function questionLanguageRouteFor(input: Readonly<{ previewConfigured: boolean; previewFetch: typeof fetch | undefined;
  anthropicSocket: string | undefined; hosted: () => QuestionLanguagePaidRoute }>): QuestionLanguagePaidRoute {
  if (input.previewConfigured) {
    return input.previewFetch !== undefined && input.anthropicSocket !== undefined
      ? Object.freeze({ kind: "PREVIEW", fetch: input.previewFetch })
      : Object.freeze({ kind: "NONE", reason: "NO_GATE" });
  }
  return input.hosted();
}

/** USD micro-units per million tokens, from a nano-USD-per-token price (USD/M x 1000 nano = USD/M x 1e6 micros). */
const microsPerMillion = (nanoPerToken: bigint): number => Number(nanoPerToken * 1000n);

/**
 * The fast-check model's row on the reviewed provider price table (preview-models.ts), Anthropic only. Hosted never
 * guesses a price (fix round 1, never under-count): a model off the table refuses the boot by name.
 */
function pricedFastCheckRow(model: string): PreviewModelRow {
  const row = previewModelRow(model);
  if (row === undefined || row.provider !== "anthropic") throw refusal("QUESTION_LANGUAGE_FAST_CHECK_MODEL_UNPRICED");
  return row;
}

/**
 * The per-million price a hosted language check is recorded at (the money law: never under-count). Input: the larger
 * of the row's input price at the 5-minute cache-write rate (1.25x, rounded up) and the reviewed table row's
 * cache-write input price; output: the larger of the row's and the table row's. The frame is always cacheable (the fast
 * check's system goes as the two-block form with the one cache mark, transport.ts), so the cache-write rate always
 * applies. At more than the table row's upper-step threshold of input tokens, its upper step. A model off the table
 * throws QUESTION_LANGUAGE_FAST_CHECK_MODEL_UNPRICED.
 */
export function hostedLanguageCheckPrice(rowPrice: Readonly<{ input: number; output: number }>, model: string,
  inputTokens: number): Readonly<{ input: number; output: number }> {
  const row = pricedFastCheckRow(model);
  const step = row.upperStep !== undefined && inputTokens > row.upperStep.aboveChargedInputTokens ? row.upperStep : row;
  const cacheWrite = step.cacheWriteInputNanoUsdPerToken;
  const tableInput = cacheWrite === undefined ? Math.ceil((microsPerMillion(step.inputNanoUsdPerToken) * 5) / 4) : microsPerMillion(cacheWrite);
  return Object.freeze({
    input: Math.max(Math.ceil((rowPrice.input * 5) / 4), tableInput),
    output: Math.max(rowPrice.output, microsPerMillion(step.outputNanoUsdPerToken))
  });
}

/**
 * The lines the hosted spend record writes: each failed record (`spend_unrecorded`), and once, when the breaker latches
 * (`spend_record_down`). The event and a code only, never question, reply or database text.
 */
export type QuestionLanguageSpendReport = Readonly<{
  event: "api.question_language.spend_unrecorded" | "api.question_language.spend_record_down"; code: string }>;
/**
 * The breaker (Task 19 fix round 2, "never spend unrecorded"): a refusal every later record would meet too — no right
 * (42501), no function (42883), a CHECK or the writer's own refusal (23514) — latches at once; any other failure after
 * this many in a row. Latched, nothing more is sent until a restart re-probes.
 */
const SPEND_RECORD_LATCHING_CODES: ReadonlySet<string> = new Set(["42501", "42883", "23514"]);
const SPEND_RECORD_FAILURES_IN_A_ROW = 3;
const CODE_SHAPED = /^[A-Z0-9_]{1,64}$/u;
function spendFailureCode(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && CODE_SHAPED.test(code) ? code : "QUESTION_LANGUAGE_SPEND_RECORD_FAILED";
}

/**
 * The route with no preview configuration (P2L Task 19). Local mode has no paid AI. Hosted turns the fast check on only
 * when BOTH hold, else NONE with the reason:
 *  · `ledger.record_language_check_spend` exists AND the API's role may EXECUTE it (`spend.writerPresent`, the 0118
 *    probe): without either the API keeps the check off (HOSTED_BEFORE_SPEND_RECORD) — never spend unrecorded;
 *  · and, before either, the fast-check model is on the reviewed provider price table, else the boot refuses
 *    (QUESTION_LANGUAGE_FAST_CHECK_MODEL_UNPRICED: a price is never guessed);
 *  · the support model target (apps/api/src/support/model.ts, parsed ABOVE the question-language boot step, pre-flight
 *    PF-L36) is an Anthropic Messages target whose key `readCredential` reads through the custody loader (else
 *    NO_HOSTED_KEY). No key is read from anywhere else, and none before the writer is known to exist.
 * `recordSpend` writes each check as ONE run-less site cost through the writer: `language-check:<provider>:<model>`,
 * the UTC day, the tokens the transport names (a projected record at the projected maximum) priced at
 * `hostedLanguageCheckPrice`. A failed record is reported by code only and never fails the ask: the call already
 * happened (the support chat's rule for unreported cost). It counts in the provider's daily site pot, never a person's.
 * Fix round 2: `beforeSend` keeps the check from being sent when the spend record is down (the breaker above latched)
 * or today's site pot is at or above its day ceiling (ruling L-POT); either is the fallback lock, never a block.
 */
export async function hostedQuestionLanguageRoute(input: Readonly<{
  mode: DeploymentMode;
  fastCheck: QuestionLanguageFastCheck | null;
  readCredential: () => string | undefined;
  spend: Readonly<{ writerPresent: () => Promise<boolean>; record: (entry: LanguageCheckSpendEntry) => Promise<void> }>;
  /**
   * Ruling L-POT: today's site pot and the day ceiling the ask admission uses. At or above it, a check is skipped (no
   * call, no spend; the fallback lock). Hosted without it refuses the boot (QUESTION_LANGUAGE_DAY_POT_UNAVAILABLE).
   */
  dayPot: Readonly<{ ceilingMicros: number; spentMicros: (day: string) => Promise<number> }> | null;
  clock: () => Date;
  report: (line: QuestionLanguageSpendReport) => void;
  newSpendId?: () => string;
}>): Promise<QuestionLanguagePaidRoute> {
  if (input.mode !== "hosted") return Object.freeze({ kind: "NONE", reason: "LOCAL_MODE" });
  const fastCheck = input.fastCheck;
  if (fastCheck === null) return Object.freeze({ kind: "NONE", reason: "POLICY_OFF" });
  // Fix round 1: a model off the reviewed price table refuses the boot (typed), before the database or the key.
  pricedFastCheckRow(fastCheck.model);
  const dayPot = input.dayPot;
  if (dayPot === null || !Number.isSafeInteger(dayPot.ceilingMicros) || dayPot.ceilingMicros < 0) {
    throw refusal("QUESTION_LANGUAGE_DAY_POT_UNAVAILABLE");
  }
  if (!(await input.spend.writerPresent())) return Object.freeze({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
  const credential = input.readCredential();
  if (credential === undefined) return Object.freeze({ kind: "NONE", reason: "NO_HOSTED_KEY" });
  const providerRef = `language-check:${fastCheck.provider}:${fastCheck.model}`;
  const newSpendId = input.newSpendId ?? randomUUID;
  let recordDown = false;
  let failuresInARow = 0;
  const recordSpend = async (usage: FastCheckUsage): Promise<void> => {
    try {
      const price = hostedLanguageCheckPrice(fastCheck.priceMicrosUsdPerMillionTokens, fastCheck.model, usage.inputTokens);
      await input.spend.record(Object.freeze({ spendId: newSpendId(), providerRef, chargedOn: costEnvelopeDay(input.clock()),
        chargeMicros: languageCheckChargeMicros(usage, price), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }));
      failuresInARow = 0;
    } catch (error) {
      const code = spendFailureCode(error);
      input.report(Object.freeze({ event: "api.question_language.spend_unrecorded", code }));
      failuresInARow += 1;
      if (!recordDown && (SPEND_RECORD_LATCHING_CODES.has(code) || failuresInARow >= SPEND_RECORD_FAILURES_IN_A_ROW)) {
        recordDown = true;
        input.report(Object.freeze({ event: "api.question_language.spend_record_down", code }));
      }
    }
  };
  const beforeSend = async (): Promise<string | null> => {
    if (recordDown) return QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES.spendRecordDown;
    try {
      const spent = await dayPot.spentMicros(costEnvelopeDay(input.clock()));
      return Number.isFinite(spent) && spent < dayPot.ceilingMicros ? null : QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES.dayPot;
    } catch {
      // A pot that cannot be read is treated as full: never spend past what cannot be checked.
      return QUESTION_LANGUAGE_FAST_CHECK_SKIP_CODES.dayPot;
    }
  };
  return Object.freeze({ kind: "HOSTED", credential, recordSpend, beforeSend });
}

/**
 * Side-by-side spec §13 (S14, ruling R57) — THE SITE's ROUTE, ONE DECISION, for apps/api/src/main.ts's
 * `questionLanguage.routeFor` and check-version's API half (which hands it a fetch that refuses and a spend writer that
 * is absent, so it can never send or spend). Task 19 and ruling L-ROUTE: with no preview configured the hosted side
 * decides (`hostedQuestionLanguageRoute`: the price-table and day-pot boot refusals, then 0118's writer, then the support
 * target's key, read only through `readCredential`); a configured preview is PREVIEW (the guarded fetch with the
 * Anthropic gate socket) or NONE, never HOSTED. Asked per settings version with its policy and the day ceiling its
 * admission uses (ruling L-POT).
 */
export async function questionLanguageSiteRoute(input: Readonly<{
  mode: DeploymentMode;
  policy: QuestionLanguagePolicy | null;
  dayCeilingMicros: number | null;
  previewGate: PreviewGateSettings | undefined;
  previewFetch: typeof fetch | undefined;
  readCredential: () => string | undefined;
  spend: Readonly<{ writerPresent: () => Promise<boolean>; record: (entry: LanguageCheckSpendEntry) => Promise<void> }>;
  daySpentMicros: (day: string) => Promise<number>;
  report: (line: QuestionLanguageSpendReport) => void;
}>): Promise<QuestionLanguagePaidRoute> {
  const { previewGate, previewFetch, policy, dayCeilingMicros } = input;
  const hostedRoute = previewGate !== undefined ? undefined : await hostedQuestionLanguageRoute({
    mode: input.mode,
    fastCheck: (policy ?? questionLanguagePolicyStartValues()).fastCheck,
    readCredential: input.readCredential,
    spend: input.spend,
    // Ruling L-POT: the day ceiling the ask admission uses (costEnvelopeGuardPolicy), against the day's whole site pot.
    dayPot: dayCeilingMicros === null ? null : { ceilingMicros: dayCeilingMicros, spentMicros: input.daySpentMicros },
    clock: () => new Date(),
    report: input.report
  });
  return questionLanguageRouteFor({
    previewConfigured: previewGate !== undefined,
    previewFetch,
    anthropicSocket: previewGate === undefined ? undefined : previewProviderSocket(previewGate, "anthropic"),
    hosted: () => {
      if (hostedRoute === undefined) throw new TypeError("QUESTION_LANGUAGE_HOSTED_ROUTE_ON_PREVIEW");
      return hostedRoute;
    }
  });
}

/**
 * The decider, composed once at boot, and only with the debate shape row in force (the caller's condition: row absent
 * = no eld load, today's boot). `policy` null = the start values. eld's database is loaded here (Task 3's choice).
 * `onDecided`: the practice report's hook (P2d), never a logger.
 */
export async function composeQuestionLanguage(input: Readonly<{ policy: QuestionLanguagePolicy | null; route: QuestionLanguagePaidRoute;
  clock: () => Date; maxQuestionBytes: number; referenceKey: QuestionLanguageReferenceKey;
  onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void }>): Promise<QuestionLanguageDecider> {
  const policy = input.policy ?? questionLanguagePolicyStartValues();
  const route = input.route;
  assertQuestionLanguagePolicyBootable(policy, route);
  let fastCheck: FastCheck | null = null;
  let fastCheckOffReason: QuestionLanguageFastCheckOffReason | undefined;
  if (policy.fastCheck === null) {
    fastCheckOffReason = "POLICY_OFF";
  } else if (route.kind === "NONE") {
    fastCheckOffReason = route.reason;
  } else {
    // The preview: the guarded fetch, no credential and NO onUsage (the gate settles preview money; a guarded-fetch
    // refusal would otherwise be recorded as phantom spend). Hosted: the global fetch to the exact Anthropic URL.
    const transport = route.kind === "PREVIEW"
      ? anthropicFastCheckTransport({ fetch: route.fetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings: policy.fastCheck })
      : anthropicFastCheckTransport({ fetch, url: `${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`,
        credential: route.credential, settings: policy.fastCheck, onUsage: route.recordSpend, beforeSend: route.beforeSend });
    fastCheck = createFastCheck({ transport, instruction: policy.instruction, timeoutMs: policy.fastCheck.timeoutMs });
  }
  const eld = await loadEldReader(ELD_TUNING.database);
  return new QuestionLanguageDecider({ eld, fastCheck, key: input.referenceKey, clock: input.clock, maxQuestionBytes: input.maxQuestionBytes,
    ...(fastCheckOffReason === undefined ? {} : { fastCheckOffReason }),
    ...(input.onDecided === undefined ? {} : { onDecided: input.onDecided }) });
}
