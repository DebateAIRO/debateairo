import { randomUUID } from "node:crypto";
import { THINKING_LEVEL_TOKEN } from "./index.js";
import { PREVIEW_MAX_OUTPUT_BOUND, previewModelRow, previewSamplingMembers } from "./preview-models.js";
import type { ProviderDiscoveryTarget } from "./index.js";
import { PreviewUnbilledRefusal, waitBeforePreviewUnbilledResend } from "./preview-test.js";
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
 * stops or exclamation marks after it; a finished thinking block before it is skipped. MiMo-V2.6-Pro answers at
 * temperature 1.0 after thinking: a test of the exact bytes "OK" marked it ABSENT for a working answer such as "OK."
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
  let state: ProviderProbeObservation;
  try {
    if(input.tokenCeiling!==undefined&&(!Number.isSafeInteger(input.tokenCeiling)||input.tokenCeiling<1||input.tokenCeiling>(previewModelRow(input.target.model)?.outputBound??PREVIEW_MAX_OUTPUT_BOUND)))throw new TypeError("PROVIDER_PROBE_TOKEN_CEILING_INVALID");
    if(input.thinkingLevel!==undefined&&(!THINKING_LEVEL_TOKEN.test(input.thinkingLevel)||input.target.thinkingParameter===undefined||!input.target.thinkingLevels?.includes(input.thinkingLevel)))throw new TypeError("PROVIDER_PROBE_THINKING_INVALID");
    // Multi-model preview, PR B: a native target is probed on its own wire —
    // the same question, the same answer and model-echo test, its own body.
    if (input.target.adapterKind === ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND) {
      const request = anthropicMessagesProbeRequest({
        model: input.target.model,
        maxTokens: input.tokenCeiling ?? PROBE_DEFAULT_TOKEN_CEILING,
        thinkingLevel: input.thinkingLevel,
        credential: input.target.authorizationHeader,
        prompt: PROBE_PROMPT
      });
      const response = await input.fetchImplementation(`${input.target.baseUrl}${request.path}`, {
        method: "POST",
        headers: request.headers,
        signal: AbortSignal.timeout(input.timeoutMs),
        body: request.body
      });
      const raw = await response.text();
      if (!response.ok || Buffer.byteLength(raw, "utf8") > MAX_PROBE_RESPONSE_BYTES) {
        throw new TypeError("PROVIDER_PROBE_UNAVAILABLE");
      }
      const answer = anthropicMessagesProbeAnswer(JSON.parse(raw));
      if (answer === null || answer.model !== input.target.model || !probeAnswerIsOk(answer.text)) {
        throw new TypeError("PROVIDER_PROBE_RESPONSE_INVALID");
      }
      return Object.freeze({
        probeEvidenceRef,
        providerRef: input.target.providerRef,
        maker: input.target.maker,
        state: "HEALTHY" as const,
        modelId: input.target.model,
        failureCode: null,
        probedAt
      });
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (input.target.authorizationHeader !== undefined) {
      headers.authorization = input.target.authorizationHeader;
    }
    const response = await input.fetchImplementation(
      `${input.target.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(input.timeoutMs),
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
      }
    );
    const raw = await response.text();
    if (!response.ok || Buffer.byteLength(raw, "utf8") > MAX_PROBE_RESPONSE_BYTES) {
      throw new TypeError("PROVIDER_PROBE_UNAVAILABLE");
    }
    const decoded = JSON.parse(raw) as Readonly<Record<string, unknown>>;
    const choices = decoded.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    const message = typeof first === "object" && first !== null
      ? (first as Readonly<Record<string, unknown>>).message
      : undefined;
    const content = typeof message === "object" && message !== null
      ? (message as Readonly<Record<string, unknown>>).content
      : undefined;
    if (decoded.model !== input.target.model || !probeAnswerIsOk(content)) {
      throw new TypeError("PROVIDER_PROBE_RESPONSE_INVALID");
    }
    state = Object.freeze({
      probeEvidenceRef,
      providerRef: input.target.providerRef,
      maker: input.target.maker,
      state: "HEALTHY" as const,
      modelId: input.target.model,
      failureCode: null,
      probedAt
    });
  } catch (error) {
    state = Object.freeze({
      probeEvidenceRef,
      providerRef: input.target.providerRef,
      maker: input.target.maker,
      state: "ABSENT" as const,
      modelId: null,
      // Spec 2026-10-11 busy model §2: a gate-proven unbilled refusal keeps its own code.
      failureCode: error instanceof PreviewUnbilledRefusal ? PROVIDER_PROBE_UNBILLED_REFUSAL : "PROVIDER_PROBE_FAILED",
      probedAt
    });
  }
  return state;
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
