/** One opt-in private preview test; normal provider/roster behavior stays unchanged. */
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { TypedDomainError } from "@debateai/kernel";
import type { CallBound, ProviderCallRequest, ProviderDiscoveryTarget, ProviderGateway } from "./index.js";
import { assertFramedPrompt } from "./prompt-frame.js";

export const PREVIEW_GLM_MODEL = "zai-org/GLM-5.3-Flash" as const;
export const PREVIEW_GLM_PROVIDER_REF = "preview:fixture-a" as const;
/** Existing logical synthesis/checker refs; both connect to one real model and maker. */
export const PREVIEW_GLM_PROVIDER_REFS = Object.freeze([PREVIEW_GLM_PROVIDER_REF, "preview:fixture-b"] as const);
export const PREVIEW_GLM_BASE_URL = "https://api.deepinfra.com/v1/openai" as const;
export const PREVIEW_GLM_DEADLINE_MS = 600_000 as const;
export const PREVIEW_GLM_GENERATION_TOKEN_FLOOR = 8192 as const;
export const PREVIEW_GLM_OUTPUT_RESERVATION = 163_840 as const;
export const PREVIEW_GLM_TARGET = Object.freeze({
  provider_ref: PREVIEW_GLM_PROVIDER_REF, base_url: PREVIEW_GLM_BASE_URL, model: PREVIEW_GLM_MODEL,
  input_price_micros_per_million: 150_000, output_price_micros_per_million: 500_000,
  thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze(["high"]), context_window_tokens: 1_048_576
});
export interface PreviewProviderTestConfig {
  readonly deployment: "v3-preview";
  readonly free_model_ids: readonly [typeof PREVIEW_GLM_MODEL];
  readonly requested_thinking_level: "high";
  readonly budget_socket: string;
  readonly scope_id: string;
}
function refused(): never { throw new TypeError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"); }
export function parsePreviewProviderTestConfig(source: string | undefined): PreviewProviderTestConfig | undefined {
  if (source === undefined) return undefined;
  let value: unknown; try { value = JSON.parse(source); } catch { return refused(); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refused();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 5 || row.deployment !== "v3-preview" || row.requested_thinking_level !== "high"
    || !Array.isArray(row.free_model_ids) || row.free_model_ids.length !== 1 || row.free_model_ids[0] !== PREVIEW_GLM_MODEL
    || typeof row.budget_socket !== "string" || !/^\/run\/debateai-v3-preview\/[a-z0-9-]+\.sock$/u.test(row.budget_socket)
    || typeof row.scope_id !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/u.test(row.scope_id)) return refused();
  return Object.freeze({ ...row, free_model_ids: Object.freeze([PREVIEW_GLM_MODEL]) }) as unknown as PreviewProviderTestConfig;
}
export function validatePreviewProviderTestConfig(value: unknown): PreviewProviderTestConfig | undefined {
 if(value===undefined)return undefined;
 let source:string|undefined;try{source=JSON.stringify(value);}catch{return refused();}
 if(source===undefined)return refused();
 return parsePreviewProviderTestConfig(source);
}
export function previewPlanTierRosters<T extends Readonly<{ free: readonly string[]; premium: readonly string[] }>>(
  config: PreviewProviderTestConfig | undefined, defaults: T
): Readonly<{ free: readonly string[]; premium: readonly string[] }> {
  return config === undefined ? defaults : Object.freeze({ free: config.free_model_ids, premium: defaults.premium });
}
export function assertPreviewProviderTargets(config: PreviewProviderTestConfig | undefined, targets: readonly ProviderDiscoveryTarget[]): void {
  if (config === undefined) return;
  if (targets.length !== 2 || targets.some((target, index) => target.providerRef !== PREVIEW_GLM_PROVIDER_REFS[index] || target.model !== PREVIEW_GLM_MODEL
    || target.maker !== "Z.AI" || target.baseUrl !== PREVIEW_GLM_BASE_URL || target.thinkingParameter !== "reasoning_effort"
    || target.thinkingLevels?.length !== 1 || target.thinkingLevels[0] !== "high"
    || target.inputPriceMicrosPerMillionTokens !== 150_000 || target.outputPriceMicrosPerMillionTokens !== 500_000
    || target.contextWindowTokens !== 1_048_576 || target.authorizationHeader !== undefined || target.authorizationFile !== undefined)) refused();
}
export function previewCallBound(bound: CallBound, config: PreviewProviderTestConfig | undefined): CallBound {
  return config === undefined ? bound : Object.freeze({ maxAttempts: 1, tokenCeiling: Math.max(bound.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR), deadlineMs: PREVIEW_GLM_DEADLINE_MS });
}
export function previewRunnerPolicy<T extends { bounds: Readonly<Record<"JUDGE" | "COMPOSER" | "CONFORMANCE", CallBound>>; synthesisRolePolicy: { synthesizerBound: CallBound; evaluatorBound: CallBound } }>(policy: T, config: PreviewProviderTestConfig | undefined): T {
  if (config === undefined) return policy;
  return { ...policy, bounds: { JUDGE: previewCallBound(policy.bounds.JUDGE, config), COMPOSER: previewCallBound(policy.bounds.COMPOSER, config), CONFORMANCE: previewCallBound(policy.bounds.CONFORMANCE, config) }, synthesisRolePolicy: { ...policy.synthesisRolePolicy, synthesizerBound: previewCallBound(policy.synthesisRolePolicy.synthesizerBound, config), evaluatorBound: previewCallBound(policy.synthesisRolePolicy.evaluatorBound, config) } };
}
/** Only the current native storyteller request may keep one safe locator repair. */
function previewStoryRepairAllowed(request: ProviderCallRequest): boolean {
  if (request.lane !== "story" || request.role !== "SYNTHESIZER"
    || !/^STORY:STORYTELLER:[1-8]$/u.test(request.callSiteKey)
    || !Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 2
    || typeof request.classifyContent !== "function" || typeof request.buildRepairPacket !== "function") return false;
  try { return assertFramedPrompt(request.packet).contractId === "story.storyteller.v2"; }
  catch { return false; }
}
export function withPreviewProviderCallPolicy(gateway: ProviderGateway, config: PreviewProviderTestConfig): ProviderGateway {
  return Object.freeze({ call(request: ProviderCallRequest) {
    if (request.thinkingLevel !== undefined && request.thinkingLevel !== config.requested_thinking_level) {
      throw new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", "The private preview connection is configured for high only");
    }
    const bound = previewCallBound(request.bound, config);
    return gateway.call({ ...request, thinkingLevel: config.requested_thinking_level,
      bound: previewStoryRepairAllowed(request) ? Object.freeze({ ...bound, maxAttempts: 2 }) : bound });
  } });
}
export interface PreviewBudgetExecution {
  readonly operationId: string;
  readonly requestBody: string;
  readonly requestSha256: string;
  readonly reservedUsd: string;
}
/** Root-owned authority reserves atomically before any paid POST, then records or retains its charge. */
export interface PreviewBudgetPort {
  execute(input: PreviewBudgetExecution, signal?: AbortSignal): Promise<Readonly<{ status: number; body: string }>>;
}
function nanoUsd(value: bigint): string {
  const source = value.toString().padStart(10, "0");
  return `${source.slice(0, -9)}.${source.slice(-9)}`;
}
export function createPreviewGuardedFetch(port: PreviewBudgetPort): typeof fetch {
  return async (input, init) => {
    if (init?.signal?.aborted) throw new DOMException("Private preview call canceled", "TimeoutError");
    if (String(input) !== `${PREVIEW_GLM_BASE_URL}/chat/completions` || init?.method !== "POST" || typeof init.body !== "string"
      || Buffer.byteLength(init.body, "utf8") > 256 * 1024) refused();
    let decoded: unknown; try { decoded = JSON.parse(init.body); } catch { return refused(); }
    const body = decoded as Record<string, unknown>;
    if (typeof body !== "object" || body === null) refused();
    const hasResponseFormat = Object.hasOwn(body, "response_format");
    const responseFormat = body.response_format as Record<string, unknown> | null;
    if (hasResponseFormat && (typeof responseFormat !== "object" || responseFormat === null || Array.isArray(responseFormat)
      || Object.keys(responseFormat).length !== 1 || !Object.hasOwn(responseFormat, "type") || responseFormat.type !== "json_object")) refused();
    if (Object.keys(body).length !== (hasResponseFormat ? 5 : 4)
      || !["model", "reasoning_effort", "max_tokens", "messages"].every(key => Object.hasOwn(body, key)) || body.model !== PREVIEW_GLM_MODEL || body.reasoning_effort !== "high"
      || !Number.isSafeInteger(body.max_tokens) || Number(body.max_tokens) < 1 || Number(body.max_tokens) > PREVIEW_GLM_OUTPUT_RESERVATION
      || body.stream === true || !Array.isArray(body.messages)) refused();
    // UTF-8 bytes + template allowance; full model output, including hidden reasoning.
    // 150 and 500 nano-USD/token are the same $0.15/$0.50 per-million prices as the native target.
    const reserved = BigInt(Buffer.byteLength(init.body, "utf8") + 2048) * 150n + BigInt(PREVIEW_GLM_OUTPUT_RESERVATION) * 500n;
    const result = await port.execute({ operationId: randomUUID(), requestBody: init.body,
      requestSha256: createHash("sha256").update(init.body).digest("hex"), reservedUsd: nanoUsd(reserved) }, init.signal ?? undefined);
    return new Response(result.body, { status: result.status, headers: { "content-type": "application/json" } });
  };
}
/** Local IPC only: application principals never receive the provider credential or ledger write access. */
export function createPreviewBudgetRpcPort(config: PreviewProviderTestConfig): PreviewBudgetPort {
  return Object.freeze({ execute(input: PreviewBudgetExecution, signal?: AbortSignal) {
    return new Promise<Readonly<{ status: number; body: string }>>((resolve, reject) => {
      const data = JSON.stringify({ scope_id: config.scope_id, ...input });
      const request = httpRequest({ socketPath: config.budget_socket, path: "/complete", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, response => {
        const chunks: Buffer[] = []; let bytes = 0;
        response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) response.destroy(); else chunks.push(chunk); });
        response.on("error", () => reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response unavailable")));
        response.on("end", () => {
          let result: unknown; try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response invalid")); return; }
          const row = result as Record<string, unknown>;
          if (response.statusCode !== 200 || typeof row !== "object" || row === null || !Number.isInteger(row.status) || typeof row.body !== "string") {
            reject(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "Private preview authority stopped or refused the request")); return;
          }
          resolve({ status: Number(row.status), body: row.body });
        });
      });
      const canceled = () => request.destroy(new Error("Private preview call canceled"));
      signal?.addEventListener("abort", canceled, { once: true });
      if (signal?.aborted) canceled();
      request.on("close", () => signal?.removeEventListener("abort", canceled));
      request.setTimeout(PREVIEW_GLM_DEADLINE_MS + 30_000, () => request.destroy());
      request.on("error", () => reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority unavailable")));
      request.end(data);
    });
  } });
}
