import { TypedDomainError } from "@debateai/kernel";
import { ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, previewModelRow } from "@debateai/providers";
import { questionLanguagePolicyStartValues, type DeploymentMode, type QuestionLanguagePolicy } from "@debateai/register";
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
 *   hosted, before Task 19             NONE     none (reason HOSTED_BEFORE_SPEND_RECORD)          nothing is called
 *   hosted, Task 19 (spend record)     HOSTED   the support target's key, the exact Anthropic URL the run-less spend record
 *   local mode                         NONE     none (reason LOCAL_MODE)                          nothing is called
 *   the row's fastCheck: null          (any)    none (reason POLICY_OFF)                          nothing is called
 *
 * The API gets no new vendor credential, and on the preview it holds none. The fast check is a SITE cost: nothing
 * here, or anywhere it is called from, charges the person (submit runs it before any allowance or billing step).
 */
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void> }>
  | Readonly<{ kind: "NONE"; reason: Exclude<QuestionLanguageFastCheckOffReason, "POLICY_OFF"> }>;

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

/**
 * The route with no preview configuration. Local mode has no paid AI. Hosted builds no transport until Task 19's
 * run-less spend record exists (global constraints, Money).
 * Task 19: hosted returns { kind: "HOSTED", credential, recordSpend } only when ALL hold: the support model target
 * (apps/api/src/support/model.ts parseSupportModelTargetJson, parsed ABOVE the question-language boot step, pre-flight
 * PF-L36) is an Anthropic Messages target with a custody-read credential, and
 * `ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)` exists (to_regprocedure). No key is read
 * from anywhere else.
 */
export function hostedQuestionLanguageRoute(mode: DeploymentMode): QuestionLanguagePaidRoute {
  return mode === "hosted"
    ? Object.freeze({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" })
    : Object.freeze({ kind: "NONE", reason: "LOCAL_MODE" });
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
