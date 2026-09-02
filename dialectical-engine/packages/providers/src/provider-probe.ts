import { randomUUID } from "node:crypto";
import type { ProviderDiscoveryTarget } from "./index.js";

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

export async function probeTarget(input: Readonly<{
  target: ProviderDiscoveryTarget;
  // MOVED: was `ProviderDiscoveryProbeStore` (apps/api). Structurally the same
  // for this function, which only ever calls `record`.
  probes: ProviderProbeRecorder;
  timeoutMs: number;
  fetchImplementation: typeof fetch;
  clock: () => Date;
  // MOVED: was `ProviderProbeRecord` (@debateai/db), now the structural twin.
}>): Promise<ProviderProbeObservation> {
  const probeEvidenceRef = randomUUID();
  const probedAt = input.clock();
  let state: ProviderProbeObservation;
  try {
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
          max_tokens: 8,
          messages: [{
            role: "user",
            content: "DR-181 discovery health probe. Reply exactly: OK"
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
    if (decoded.model !== input.target.model || content !== "OK") {
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
  } catch {
    state = Object.freeze({
      probeEvidenceRef,
      providerRef: input.target.providerRef,
      maker: input.target.maker,
      state: "ABSENT" as const,
      modelId: null,
      failureCode: "PROVIDER_PROBE_FAILED",
      probedAt
    });
  }
  await input.probes.record(state);
  return state;
}
