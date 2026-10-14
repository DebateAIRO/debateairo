import { randomUUID } from "node:crypto";
import { costEnvelopeDay, languageCheckChargeMicros, type LanguageCheckSpendEntry } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, previewModelRow, type PreviewModelRow } from "@debateai/providers";
import {
  questionLanguagePolicyStartValues, type DeploymentMode, type QuestionLanguageFastCheck, type QuestionLanguagePolicy
} from "@debateai/register";
import { QuestionLanguageDecider, type QuestionLanguageChoiceNeeded, type QuestionLanguageFastCheckOffReason, type QuestionLanguageLock } from "./decider.js";
import { loadEldReader } from "./eld.js";
import { ELD_TUNING } from "./eld-tuning.js";
import { assertQuestionLanguageInstructionFrameable, createFastCheck, type FastCheck } from "./fast-check.js";
import type { QuestionLanguageReferenceKey } from "./reference.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "./transport.js";

/**
 * How a fast check may be paid for, decided once at boot (ruling CR-6, ruling L-ROUTE). The transport cannot tell the
 * guarded fetch from the global fetch, and the preview and hosted URLs are the same string, so THIS table is the guard:
 *
 *   deployment                         route    transport                                         who pays
 *   preview + Anthropic gate socket    PREVIEW  the guarded fetch, no key, no spend record        the gate's daily pot
 *   preview, no Anthropic gate socket  NONE     none (reason NO_GATE)                             nothing is called
 *   hosted, 0117's writer absent       NONE     none (reason HOSTED_BEFORE_SPEND_RECORD)          nothing is called
 *   hosted, no Anthropic support key   NONE     none (reason NO_HOSTED_KEY)                       nothing is called
 *   hosted, 0117 + the support key     HOSTED   the support target's key, the exact Anthropic URL the run-less spend record
 *   local mode                         NONE     none (reason LOCAL_MODE)                          nothing is called
 *   the row's fastCheck: null          (any)    none (reason POLICY_OFF)                          nothing is called
 *
 * The API gets no new vendor credential, and on the preview it holds none. The fast check is a SITE cost: nothing
 * here, or anywhere it is called from, charges the person (submit runs it before any allowance or billing step).
 */
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void> }>
  | Readonly<{ kind: "NONE"; reason: QuestionLanguageFastCheckOffReason }>;

/** The message is the code (pre-flight PF-L13: a test's toThrow("…") reads the message); it carries no owner text. */
const refusal = (code: string): TypedDomainError => new TypedDomainError(code, code);

/**
 * Boot: an owner instruction carrying a frame token, or (on the preview) a model the Anthropic gate does not review
 * or an effort off its reviewed menu, refuses the boot once, by name, never at every ask.
 */
export function assertQuestionLanguagePolicyBootable(policy: QuestionLanguagePolicy, route: QuestionLanguagePaidRoute): void {
  assertQuestionLanguageInstructionFrameable(policy.instruction);
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

/** The reviewed provider table's Haiku row: the floor of every hosted language-check price (Task 4 note, Task 19). */
const HAIKU_PRICE_ROW_MODEL = "claude-haiku-5-5";

/** USD micro-units per million tokens, from a nano-USD-per-token price (USD/M x 1000 nano = USD/M x 1e6 micros). */
const microsPerMillion = (nanoPerToken: bigint): number => Number(nanoPerToken * 1000n);

/**
 * The per-million price a hosted language check is recorded at (the money law: never under-count). Input: the larger
 * of the row's input price at the 5-minute cache-write rate (1.25x, rounded up) and the provider table's cache-write
 * input price; output: the larger of the row's and the table's. The frame is always cacheable (the fast check's system
 * goes as the two-block form with the one cache mark, transport.ts), so the cache-write rate always applies. The table
 * is the reviewed Anthropic rows (preview-models.ts): Haiku's row, and the configured model's own row when it has one;
 * at more than the row's upper-step threshold of input tokens, each row's upper step.
 */
export function hostedLanguageCheckPrice(rowPrice: Readonly<{ input: number; output: number }>, model: string,
  inputTokens: number): Readonly<{ input: number; output: number }> {
  const haiku = previewModelRow(HAIKU_PRICE_ROW_MODEL);
  if (haiku === undefined || haiku.provider !== "anthropic") throw refusal("QUESTION_LANGUAGE_PRICE_TABLE_UNAVAILABLE");
  const own = previewModelRow(model);
  const rows: PreviewModelRow[] = [haiku, ...(own !== undefined && own.provider === "anthropic" && own !== haiku ? [own] : [])];
  let input = Math.ceil((rowPrice.input * 5) / 4);
  let output = rowPrice.output;
  for (const row of rows) {
    const step = row.upperStep !== undefined && inputTokens > row.upperStep.aboveChargedInputTokens ? row.upperStep : row;
    const cacheWrite = step.cacheWriteInputNanoUsdPerToken;
    const tableInput = cacheWrite === undefined ? Math.ceil((microsPerMillion(step.inputNanoUsdPerToken) * 5) / 4) : microsPerMillion(cacheWrite);
    input = Math.max(input, tableInput);
    output = Math.max(output, microsPerMillion(step.outputNanoUsdPerToken));
  }
  return Object.freeze({ input, output });
}

/** The one line a failed record writes: the event and a code, never question, reply or database text. */
export type QuestionLanguageSpendReport = Readonly<{ event: "api.question_language.spend_unrecorded"; code: string }>;
const CODE_SHAPED = /^[A-Z0-9_]{1,64}$/u;
function spendFailureCode(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && CODE_SHAPED.test(code) ? code : "QUESTION_LANGUAGE_SPEND_RECORD_FAILED";
}

/**
 * The route with no preview configuration (P2L Task 19). Local mode has no paid AI. Hosted turns the fast check on only
 * when BOTH hold, else NONE with the reason:
 *  · `ledger.record_language_check_spend` exists (`spend.writerPresent`, the 0117 probe): without it the API keeps the
 *    check off (HOSTED_BEFORE_SPEND_RECORD) — never spend unrecorded;
 *  · the support model target (apps/api/src/support/model.ts, parsed ABOVE the question-language boot step, pre-flight
 *    PF-L36) is an Anthropic Messages target whose key `readCredential` reads through the custody loader (else
 *    NO_HOSTED_KEY). No key is read from anywhere else, and none before the writer is known to exist.
 * `recordSpend` writes each check as ONE run-less site cost through the writer: `language-check:<provider>:<model>`,
 * the UTC day, the tokens the transport names (a projected record at the projected maximum) priced at
 * `hostedLanguageCheckPrice`. A failed record is reported by code only and never fails the ask: the call already
 * happened (the support chat's rule for unreported cost). It counts in the provider's daily site pot, never a person's.
 */
export async function hostedQuestionLanguageRoute(input: Readonly<{
  mode: DeploymentMode;
  fastCheck: QuestionLanguageFastCheck | null;
  readCredential: () => string | undefined;
  spend: Readonly<{ writerPresent: () => Promise<boolean>; record: (entry: LanguageCheckSpendEntry) => Promise<void> }>;
  clock: () => Date;
  report: (line: QuestionLanguageSpendReport) => void;
  newSpendId?: () => string;
}>): Promise<QuestionLanguagePaidRoute> {
  if (input.mode !== "hosted") return Object.freeze({ kind: "NONE", reason: "LOCAL_MODE" });
  const fastCheck = input.fastCheck;
  if (fastCheck === null) return Object.freeze({ kind: "NONE", reason: "POLICY_OFF" });
  if (!(await input.spend.writerPresent())) return Object.freeze({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
  const credential = input.readCredential();
  if (credential === undefined) return Object.freeze({ kind: "NONE", reason: "NO_HOSTED_KEY" });
  const providerRef = `language-check:${fastCheck.provider}:${fastCheck.model}`;
  const newSpendId = input.newSpendId ?? randomUUID;
  const recordSpend = async (usage: FastCheckUsage): Promise<void> => {
    try {
      const price = hostedLanguageCheckPrice(fastCheck.priceMicrosUsdPerMillionTokens, fastCheck.model, usage.inputTokens);
      await input.spend.record(Object.freeze({ spendId: newSpendId(), providerRef, chargedOn: costEnvelopeDay(input.clock()),
        chargeMicros: languageCheckChargeMicros(usage, price), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }));
    } catch (error) {
      input.report(Object.freeze({ event: "api.question_language.spend_unrecorded", code: spendFailureCode(error) }));
    }
  };
  return Object.freeze({ kind: "HOSTED", credential, recordSpend });
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
        credential: route.credential, settings: policy.fastCheck, onUsage: route.recordSpend });
    fastCheck = createFastCheck({ transport, instruction: policy.instruction, timeoutMs: policy.fastCheck.timeoutMs });
  }
  const eld = await loadEldReader(ELD_TUNING.database);
  return new QuestionLanguageDecider({ eld, fastCheck, key: input.referenceKey, clock: input.clock, maxQuestionBytes: input.maxQuestionBytes,
    ...(fastCheckOffReason === undefined ? {} : { fastCheckOffReason }),
    ...(input.onDecided === undefined ? {} : { onDecided: input.onDecided }) });
}
