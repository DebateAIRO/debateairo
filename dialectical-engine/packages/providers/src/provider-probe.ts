import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import { THINKING_LEVEL_TOKEN } from "./index.js";
import { PREVIEW_MAX_OUTPUT_BOUND, previewModelRow, previewSamplingMembers } from "./preview-models.js";
import type { ProviderDiscoveryTarget } from "./index.js";
import { PROVIDER_GATE_UNAVAILABLE, PreviewUnbilledRefusal, waitBeforePreviewUnbilledResend } from "./preview-test.js";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  anthropicMessagesProbeAnswer,
  anthropicMessagesProbeRequest
} from "./anthropic-messages.js";

const PROBE_PROMPT = "DR-181 discovery health probe. Reply exactly: OK";

/**
 * Probe answer fix (2026-10-12, practice debate 3): the answer room a probe asks for when its caller names none
 * (hosted and local; the preview names its own, `previewProbeControls`). A model that thinks before it answers spends
 * that thinking out of this room, so the old eight tokens could be gone before "OK" was written (GLM 5.3 Flash
 * answered `content: ""` with 5 of its 8 tokens spent thinking: docs/missions/debate-tiers/00-intake-S03.md, F6).
 * Both wires ask for the same room; a model that does not think answers in a token or two.
 */
const PROBE_DEFAULT_TOKEN_CEILING = 512;

/**
 * Probe answer fix (2026-10-12, practice debate 3): what counts as the model answering the probe. The word OK in any
 * letter case and nothing else, give or take spaces and line breaks, quote, bold or code marks around it and full
 * stops or exclamation marks after it; a finished thinking block before it is skipped. MiMo-V2.6-Pro answered at
 * temperature 1.0 (its setting then) after thinking: a test of the exact bytes "OK" marked it ABSENT for a working answer such as "OK."
 * or "\n\nOK", and with GLM busy the premium plan was refused (ASK_PLAN_TIER_MODEL_UNAVAILABLE). Still refused:
 * an empty reply, an unfinished thinking block, and any other words ("Sure, OK", "OKAY", "NOT OK"). The echoed model
 * id is NOT part of this: it is still compared byte for byte.
 */
const PROBE_FINISHED_THINKING = /^\s*<think>[\s\S]*?<\/think>/u;
const PROBE_OK_ANSWER = /^[\s"'`*_“”„«»]*ok[\s"'`*_“”„«».!]*$/iu;
function probeAnswerIsOk(text: unknown): boolean {
  return typeof text === "string" && PROBE_OK_ANSWER.test(text.replace(PROBE_FINISHED_THINKING, ""));
}

/**
 * DR-181/DR-182 — the ONE provider health probe.
 *
 * PURE MOVE (ruling J21, S06/T3C F34) from `apps/api/src/provider-discovery.ts`.
 * The body below is byte-identical to the original apart from the two type
 * annotations noted next to them: nothing about DR-182's semantics changes, and
 * `apps/api` now imports what it used to define.
 *
 * It lives here because BOTH shipped entry points need it — the API probes at ask
 * time, and the runner must re-probe at claim time (F34) so a pinned member that
 * went absent in between is detected instead of silently trusted. Options that
 * would have given the runner its own probe were rejected on the record: a second
 * implementation is two sources for one rule (J6) and the fastest way to make the
 * two probes disagree.
 *
 * The record and store types are declared STRUCTURALLY rather than imported from
 * `@debateai/db`, so this move adds NO package dependency edge — the scaffold's
 * 28-edge table is untouched. `ProviderProbeRecord` and `ProviderProbeRepository`
 * satisfy these shapes structurally, so every existing caller passes unchanged.
 */

/** Structurally identical to `@debateai/db`'s `ProviderProbeRecord`. */
export type ProviderProbeObservation = Readonly<{
  probeEvidenceRef: string;
  providerRef: string;
  maker: string;
  state: "HEALTHY" | "ABSENT";
  modelId: string | null;
  failureCode: string | null;
  probedAt: Date;
}>;

/** The write half of a probe store; `ProviderProbeRepository` satisfies it. */
export type ProviderProbeRecorder = Readonly<{
  record(observation: ProviderProbeObservation): Promise<void>;
}>;

const MAX_PROBE_RESPONSE_BYTES = 64 * 1024;

/**
 * Spec 2026-10-11 busy model §2: the failure code of a probe the preview gate PROVED was never billed
 * (a `PreviewUnbilledRefusal`: the vendor refused unbilled, was never reached, or the gate had too many
 * calls in flight). Owner ruling R1: an unbilled refusal is not an attempt, so it keeps its own code
 * instead of PROVIDER_PROBE_FAILED, and the preview's one 60-second resend may follow it. The column
 * is free text: no migration. Off the preview no fetch throws that refusal, so nothing else changes.
 */
export const PROVIDER_PROBE_UNBILLED_REFUSAL = "PROVIDER_PROBE_UNBILLED_REFUSAL";

/**
 * Probe failure reasons (2026-10-12, follow-up to practice debate 3): WHY a probe ended ABSENT, recorded as its failure
 * code. Before, every cause below was PROVIDER_PROBE_FAILED, so a failed probe could not be explained afterwards (MiMo's,
 * in practice debate 3, was answered and billed by DeepInfra and still marked ABSENT). Each is ONE UPPER_SNAKE word: the
 * probe row's failure_code is free text (no migration), and the runner copies the code into claim records whose
 * absent_failure_code must match ^[A-Z][A-Z0-9_]{0,95}$ (migration 0069). Codes only: never the reply's words, never a
 * vendor's error body (one can echo part of a key). PROVIDER_PROBE_UNBILLED_REFUSAL, above, keeps its meaning.
 */
const PROBE_FAILURE = Object.freeze({
  /** Before sending: the caller's token ceiling is out of range. */
  TOKEN_CEILING_INVALID: "PROVIDER_PROBE_TOKEN_CEILING_INVALID",
  /** Before sending: a thinking level the target does not offer. */
  THINKING_INVALID: "PROVIDER_PROBE_THINKING_INVALID",
  /** Before sending: the request could not be built (a malformed credential), or the preview's own body check refused it. */
  REQUEST_INVALID: "PROVIDER_PROBE_REQUEST_INVALID",
  /** No answer within the probe's time limit. */
  TIMED_OUT: "PROVIDER_PROBE_TIMED_OUT",
  /** Preview: the gate was halted, its window shut, or the gate itself could not be reached. */
  GATE_UNAVAILABLE: "PROVIDER_PROBE_GATE_UNAVAILABLE",
  /** Preview: the gate refused the call on money (the team's day, or the run's ceiling). */
  GATE_REFUSED: "PROVIDER_PROBE_GATE_REFUSED",
  /** The call failed before any answer came back (the vendor unreachable; preview: sent, then failed at the vendor). */
  NOT_ANSWERED: "PROVIDER_PROBE_NOT_ANSWERED",
  /** The reply was larger than MAX_PROBE_RESPONSE_BYTES. */
  REPLY_TOO_LARGE: "PROVIDER_PROBE_REPLY_TOO_LARGE",
  /** The reply was not a chat answer this wire can read. */
  REPLY_UNREADABLE: "PROVIDER_PROBE_REPLY_UNREADABLE",
  /** The reply named another model, or none. */
  MODEL_MISMATCH: "PROVIDER_PROBE_MODEL_MISMATCH",
  /** Cut off at the length limit before a working answer: thinking spent the room. */
  ANSWER_CUT_OFF: "PROVIDER_PROBE_ANSWER_CUT_OFF",
  /** The model declined to answer. */
  ANSWER_REFUSED: "PROVIDER_PROBE_ANSWER_REFUSED",
  /** An answer with no words in it. */
  ANSWER_EMPTY: "PROVIDER_PROBE_ANSWER_EMPTY",
  /** Words, but not the OK the probe asks for. */
  ANSWER_NOT_OK: "PROVIDER_PROBE_ANSWER_NOT_OK",
  /** Anything else (no known cause): the code every failure had before. */
  UNCLASSIFIED: "PROVIDER_PROBE_FAILED"
});
/** The vendor answered with this HTTP status, not a 2xx: PROVIDER_PROBE_HTTP_ and the three digits. */
function probeHttpFailure(status: number): string {
  return `PROVIDER_PROBE_HTTP_${status}`;
}
/** The preview gate's refusals on money and its own unreachable socket (preview-test.ts, createPreviewBudgetRpcPort). */
const PREVIEW_GATE_MONEY_REFUSALS: ReadonlySet<string> = new Set(["DAILY_COST_ENVELOPE_REACHED", "RUN_COST_ENVELOPE_MONEY_REACHED"]);
const PREVIEW_GATE_UNREACHABLE = "PROVIDER_USAGE_UNREPORTED";
/** The preview guarded fetch's refusal of a body off its reviewed row, before anything is reserved or sent. */
const PREVIEW_BODY_REFUSED = "PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID";

/** Ends a probe ABSENT with its reason. Thrown and caught inside observeProviderTarget only. */
class ProbeFailure extends Error {
  constructor(readonly code: string) { super(code); }
}
function failProbe(code: string): never {
  throw new ProbeFailure(code);
}

/** Why the call itself brought back no answer (thrown by the fetch, or while its body was read). */
function probeCallFailure(error: unknown, signal: AbortSignal): string {
  // Spec 2026-10-11 busy model §2: a gate-proven unbilled refusal keeps its own code.
  if (error instanceof PreviewUnbilledRefusal) return PROVIDER_PROBE_UNBILLED_REFUSAL;
  // The probe's own time limit, however the transport reported it: the preview's gate port reports a call it cancelled
  // as its socket failing (PROVIDER_USAGE_UNREPORTED), not as a timeout.
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  if (signal.aborted || name === "TimeoutError" || name === "AbortError") return PROBE_FAILURE.TIMED_OUT;
  if (error instanceof TypedDomainError) {
    if (error.code === PROVIDER_GATE_UNAVAILABLE || error.code === PREVIEW_GATE_UNREACHABLE) return PROBE_FAILURE.GATE_UNAVAILABLE;
    if (PREVIEW_GATE_MONEY_REFUSALS.has(error.code)) return PROBE_FAILURE.GATE_REFUSED;
  }
  if (error instanceof TypeError && error.message === PREVIEW_BODY_REFUSED) return PROBE_FAILURE.REQUEST_INVALID;
  return PROBE_FAILURE.NOT_ANSWERED;
}

/** Sends one probe and returns its decoded reply; every way of getting no readable reply ends it with its reason. */
async function sendProbe(
  request: Readonly<{ url: string; headers: Record<string, string>; body: string }>,
  timeoutMs: number,
  fetchImplementation: typeof fetch
): Promise<unknown> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  let raw: string;
  try {
    response = await fetchImplementation(request.url, { method: "POST", headers: request.headers, signal, body: request.body });
    raw = await response.text();
  } catch (error) {
    return failProbe(probeCallFailure(error, signal));
  }
  if (!response.ok) failProbe(probeHttpFailure(response.status));
  if (Buffer.byteLength(raw, "utf8") > MAX_PROBE_RESPONSE_BYTES) failProbe(PROBE_FAILURE.REPLY_TOO_LARGE);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return failProbe(PROBE_FAILURE.REPLY_UNREADABLE);
  }
}

/** What is wrong with an answer, or null for a working one ("length": cut off; "content_filter": declined). */
function probeAnswerFailure(text: unknown, finishReason: unknown): string | null {
  if (probeAnswerIsOk(text)) return null;
  if (finishReason === "length") return PROBE_FAILURE.ANSWER_CUT_OFF;
  if (finishReason === "content_filter") return PROBE_FAILURE.ANSWER_REFUSED;
  const words = typeof text === "string" ? text.replace(PROBE_FINISHED_THINKING, "").trim() : "";
  return words === "" ? PROBE_FAILURE.ANSWER_EMPTY : PROBE_FAILURE.ANSWER_NOT_OK;
}

/** The OpenAI-compatible reply's reason, or null: readable shape, then the exact model id, then the answer. */
function chatCompletionProbeFailure(decoded: unknown, model: string): string | null {
  const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
    typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
  const reply = record(decoded);
  const first = Array.isArray(reply?.choices) ? record(reply.choices[0]) : undefined;
  const message = record(first?.message);
  if (reply === undefined || first === undefined || message === undefined) return PROBE_FAILURE.REPLY_UNREADABLE;
  const content = message.content;
  if (content !== undefined && content !== null && typeof content !== "string") return PROBE_FAILURE.REPLY_UNREADABLE;
  if (reply.model !== model) return PROBE_FAILURE.MODEL_MISMATCH;
  return probeAnswerFailure(content, first.finish_reason);
}

/** The Anthropic Messages reply's reason, or null. A reply cut off at max_tokens is refused even after an OK (the adapter's rule). */
function messagesProbeFailure(decoded: unknown, model: string): string | null {
  const answer = anthropicMessagesProbeAnswer(decoded);
  if (answer === null) return PROBE_FAILURE.REPLY_UNREADABLE;
  if (answer.model !== model) return PROBE_FAILURE.MODEL_MISMATCH;
  if (answer.refused) return PROBE_FAILURE.ANSWER_REFUSED;
  if (answer.finishReason === "length") return PROBE_FAILURE.ANSWER_CUT_OFF;
  return probeAnswerFailure(answer.text, answer.finishReason);
}

/**
 * The network probe ONLY — it observes and returns, and persists nothing.
 *
 * Split out in T3C r2 (codex r1 B1). The moved `probeTarget` both observed AND
 * recorded, which is right for the API's ask-time discovery, where nothing else
 * writes. It is WRONG for the runner's claim-time re-probe: DR-182 already has the
 * runner persist the claim-time verdict itself (apps/runner/src/index.ts, both the
 * ABSENT and HEALTHY arms), and the established `claimTimeProbe` contract — see the
 * acceptance composition, which persists nothing — is "return the observation, the
 * runner records it". Composing the persisting variant there produced TWO
 * append-only rows and two independent-looking evidence refs per single re-probe.
 *
 * So: one network implementation (J21), and exactly one persistence owner per
 * caller. The API keeps `probeTarget` (observe + record); the runner composes
 * `observeProviderTarget` and lets its own recorder own the row.
 */
export async function observeProviderTarget(input: Readonly<{
  target: ProviderDiscoveryTarget;
  timeoutMs: number;
  thinkingLevel?: string;
  tokenCeiling?: number;
  fetchImplementation: typeof fetch;
  clock: () => Date;
  // MOVED: was `ProviderProbeRecord` (@debateai/db), now the structural twin.
}>): Promise<ProviderProbeObservation> {
  const probeEvidenceRef = randomUUID();
  const probedAt = input.clock();
  let failureCode: string | null = null;
  try {
    if(input.tokenCeiling!==undefined&&(!Number.isSafeInteger(input.tokenCeiling)||input.tokenCeiling<1||input.tokenCeiling>(previewModelRow(input.target.model)?.outputBound??PREVIEW_MAX_OUTPUT_BOUND)))failProbe(PROBE_FAILURE.TOKEN_CEILING_INVALID);
    if(input.thinkingLevel!==undefined&&(!THINKING_LEVEL_TOKEN.test(input.thinkingLevel)||input.target.thinkingParameter===undefined||!input.target.thinkingLevels?.includes(input.thinkingLevel)))failProbe(PROBE_FAILURE.THINKING_INVALID);
    // Multi-model preview, PR B: a native target is probed on its own wire —
    // the same question, the same answer and model-echo test, its own body.
    const messagesWire = input.target.adapterKind === ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND;
    let request: Readonly<{ url: string; headers: Record<string, string>; body: string }>;
    if (messagesWire) {
      try {
        const built = anthropicMessagesProbeRequest({
          model: input.target.model,
          maxTokens: input.tokenCeiling ?? PROBE_DEFAULT_TOKEN_CEILING,
          thinkingLevel: input.thinkingLevel,
          credential: input.target.authorizationHeader,
          prompt: PROBE_PROMPT
        });
        request = { url: `${input.target.baseUrl}${built.path}`, headers: built.headers, body: built.body };
      } catch {
        failProbe(PROBE_FAILURE.REQUEST_INVALID);
      }
    } else {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (input.target.authorizationHeader !== undefined) {
        headers.authorization = input.target.authorizationHeader;
      }
      request = {
        url: `${input.target.baseUrl}/chat/completions`,
        headers,
        body: JSON.stringify({
          model: input.target.model,
          max_tokens: input.tokenCeiling ?? PROBE_DEFAULT_TOKEN_CEILING,
          ...(input.thinkingLevel===undefined?{}:{[input.target.thinkingParameter!]:input.thinkingLevel}),
          // Reviewed sampling (2026-10-12): the probe asks as the debate calls do (none for any other target).
          ...previewSamplingMembers(input.target.baseUrl, input.target.model),
          messages: [{
            role: "user",
            content: PROBE_PROMPT
          }]
        })
      };
    }
    const decoded = await sendProbe(request, input.timeoutMs, input.fetchImplementation);
    failureCode = messagesWire
      ? messagesProbeFailure(decoded, input.target.model)
      : chatCompletionProbeFailure(decoded, input.target.model);
  } catch (error) {
    failureCode = error instanceof ProbeFailure ? error.code : PROBE_FAILURE.UNCLASSIFIED;
  }
  return Object.freeze({
    probeEvidenceRef,
    providerRef: input.target.providerRef,
    maker: input.target.maker,
    state: failureCode === null ? "HEALTHY" as const : "ABSENT" as const,
    modelId: failureCode === null ? input.target.model : null,
    failureCode,
    probedAt
  });
}

/**
 * Observe AND persist — the ask-time discovery shape, byte-equivalent to the
 * function apps/api defined before J21's move. `createProviderDiscoveryResolver`
 * still calls exactly this, so the API's behaviour is unchanged.
 */
export async function probeTarget(input: Readonly<{
  target: ProviderDiscoveryTarget;
  probes: ProviderProbeRecorder;
  timeoutMs: number;
  thinkingLevel?: string;
  tokenCeiling?: number;
  fetchImplementation: typeof fetch;
  clock: () => Date;
}>): Promise<ProviderProbeObservation> {
  const { probes, ...observation } = input;
  const state = await observeProviderTarget(observation);
  await probes.record(state);
  return state;
}

/**
 * Spec 2026-10-11 busy model §2 — the PREVIEW's claim-time probe of one target (amendment §3a: never at
 * ask time; the API's discovery round sends one probe per model and a refused model sits out): one
 * observation, and ONE more after the preview's 60-second wait when (and only when) the first
 * was a gate-proven unbilled refusal. The same rule as a debate call (owner ruling 5 / R4). The sealed
 * `panelDiscoveryPolicy.probe_max_attempts: 1` is read, never edited: an unbilled refusal is not an
 * attempt (R1). A billed failure, or an answer, gets no resend.
 *
 * It observes only; it returns every observation in order (one or two). The target is "busy" exactly
 * when every returned observation is that refusal.
 */
export async function observePreviewProviderTarget(input: Parameters<typeof observeProviderTarget>[0] & Readonly<{
  sleep?: (milliseconds: number) => Promise<void>;
}>): Promise<readonly ProviderProbeObservation[]> {
  const { sleep, ...observation } = input;
  const first = await observeProviderTarget(observation);
  if (first.failureCode !== PROVIDER_PROBE_UNBILLED_REFUSAL) return Object.freeze([first]);
  await waitBeforePreviewUnbilledResend(sleep);
  return Object.freeze([first, await observeProviderTarget(observation)]);
}

/**
 * Spec 2026-10-11 busy model §2, the runner's claim-time probe (apps/runner/src/main.ts, both claim
 * probes): on the preview the one resend after an unbilled refusal, and the claim keeps the LAST
 * observation (the runner records it); off the preview one probe, exactly as before.
 */
export async function observeClaimTimeTarget(input: Parameters<typeof observePreviewProviderTarget>[0] & Readonly<{
  preview: boolean;
}>): Promise<ProviderProbeObservation> {
  const { preview, ...probe } = input;
  if (!preview) {
    const { sleep: _sleep, ...single } = probe;
    return observeProviderTarget(single);
  }
  const observations = await observePreviewProviderTarget(probe);
  return observations[observations.length - 1]!;
}

/**
 * Spec 2026-10-11 busy model §3: every probe of the target this round was a gate-proven unbilled refusal
 * (at ask time, §3a, the round has exactly one probe per model).
 */
export function previewProbeRoundBusy(observations: readonly ProviderProbeObservation[]): boolean {
  return observations.length > 0 && observations.every((entry) => entry.failureCode === PROVIDER_PROBE_UNBILLED_REFUSAL);
}
