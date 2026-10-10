/** One opt-in private preview test; normal provider/roster behavior stays unchanged. */
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { THINKING_LEVEL_DEFAULT_ONLY, TypedDomainError } from "@debateai/kernel";
import type { CallBound, ProviderCallRequest, ProviderDiscoveryTarget, ProviderGateway } from "./index.js";
import { assertFramedPrompt } from "./prompt-frame.js";
import {
  PREVIEW_ANTHROPIC_MESSAGES_URL, PREVIEW_DEEPINFRA_BASE_URL, PREVIEW_MODEL_ROWS, PREVIEW_REQUEST_BODY_MAX_BYTES,
  previewModelRow, previewModelRowForRef, previewNanoUsdText, previewRefsAreReviewedSet, previewReservationNanoUsd,
  previewRostersHonourMakerRule, type PreviewModelRow, type PreviewProviderName
} from "./preview-models.js";

export const PREVIEW_GLM_MODEL = "zai-org/GLM-5.3-Flash" as const;
export const PREVIEW_GLM_PROVIDER_REF = "preview:fixture-a" as const;
/**
 * The sealed two-GLM register's refs (synthesis writer + checker on one maker). Kept for the v1
 * publish kit (byte for byte) and for runs pinned to that register; the multi-model set is
 * PREVIEW_REVIEWED_PROVIDER_REFS (preview-models.ts).
 */
export const PREVIEW_GLM_PROVIDER_REFS = Object.freeze([PREVIEW_GLM_PROVIDER_REF, "preview:fixture-b"] as const);
export const PREVIEW_GLM_BASE_URL = PREVIEW_DEEPINFRA_BASE_URL;
export const PREVIEW_GLM_DEADLINE_MS = 600_000 as const;
export const PREVIEW_GLM_GENERATION_TOKEN_FLOOR = 8192 as const;
/** GLM's row bound; every row's own bound is PreviewModelRow.outputBound. */
export const PREVIEW_GLM_OUTPUT_RESERVATION = 163_840 as const;
export const PREVIEW_GLM_TARGET = Object.freeze({
  provider_ref: PREVIEW_GLM_PROVIDER_REF, base_url: PREVIEW_GLM_BASE_URL, model: PREVIEW_GLM_MODEL,
  input_price_micros_per_million: 150_000, output_price_micros_per_million: 500_000,
  thinking_parameter: "reasoning_effort", thinking_levels: Object.freeze(["high"]), context_window_tokens: 1_048_576
});
/**
 * Contract A §6. Two accepted forms:
 * - the legacy five keys with `free_model_ids: ["zai-org/GLM-5.3-Flash"]`, meaning free = premium = [GLM]
 *   (so the server's current configuration keeps booting until the owner edits it);
 * - six keys with `free_model_ids` and `premium_model_ids`, each a non-empty list of unique reviewed
 *   model ids; when the two lists together name two or more makers, EACH names two or more.
 * Parsed, both forms carry both lists.
 *
 * PR B: the six-key form may also carry `anthropic_budget_socket`, the Anthropic gate's socket (same
 * folder and pattern, never the DeepInfra socket). A roster naming an Anthropic model requires it.
 * `budget_socket` stays the DeepInfra gate's. Every gate is asked with the one `scope_id`.
 */
export interface PreviewProviderTestConfig {
  readonly deployment: "v3-preview";
  readonly free_model_ids: readonly string[];
  readonly premium_model_ids: readonly string[];
  readonly requested_thinking_level: "high";
  readonly budget_socket: string;
  readonly scope_id: string;
  readonly anthropic_budget_socket?: string;
}
/** Each non-DeepInfra provider's optional socket key (a later provider adds its own key here). */
export const PREVIEW_PROVIDER_SOCKET_KEYS: Readonly<Record<Exclude<PreviewProviderName, "deepinfra">, "anthropic_budget_socket">> =
  Object.freeze({ anthropic: "anthropic_budget_socket" });
const PREVIEW_SOCKET_PATTERN = /^\/run\/debateai-v3-preview\/[a-z0-9-]+\.sock$/u;
/** The gate socket a provider's calls go through under this config, or undefined when it has none. */
export function previewProviderSocket(config: PreviewProviderTestConfig, provider: PreviewProviderName): string | undefined {
  return provider === "deepinfra" ? config.budget_socket : config[PREVIEW_PROVIDER_SOCKET_KEYS[provider]];
}
/** What the target check needs; the legacy five-key literal (v1 publish kit) still fits it. */
export type PreviewTargetRosters = Readonly<Partial<PreviewProviderTestConfig> & { free_model_ids: readonly string[] }>;
function refused(): never { throw new TypeError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID"); }
const LEGACY_CONFIG_KEYS = ["budget_socket", "deployment", "free_model_ids", "requested_thinking_level", "scope_id"];
const CONFIG_KEYS = [...LEGACY_CONFIG_KEYS, "premium_model_ids"].sort();
const OPTIONAL_SOCKET_KEYS: readonly string[] = Object.values(PREVIEW_PROVIDER_SOCKET_KEYS);
function reviewedRoster(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PREVIEW_MODEL_ROWS.length
    || value.some(id => previewModelRow(id) === undefined) || new Set(value).size !== value.length) return refused();
  return Object.freeze([...value as string[]]);
}
export function parsePreviewProviderTestConfig(source: string | undefined): PreviewProviderTestConfig | undefined {
  if (source === undefined) return undefined;
  let value: unknown; try { value = JSON.parse(source); } catch { return refused(); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refused();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort().join(",");
  const legacy = keys === LEGACY_CONFIG_KEYS.join(",");
  const socketKeys = Object.keys(row).filter(key => OPTIONAL_SOCKET_KEYS.includes(key));
  const baseKeys = Object.keys(row).filter(key => !OPTIONAL_SOCKET_KEYS.includes(key)).sort().join(",");
  if ((!legacy && baseKeys !== CONFIG_KEYS.join(",")) || row.deployment !== "v3-preview" || row.requested_thinking_level !== "high"
    || typeof row.budget_socket !== "string" || !PREVIEW_SOCKET_PATTERN.test(row.budget_socket)
    || typeof row.scope_id !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/u.test(row.scope_id)) return refused();
  // Each provider's own socket: the same folder and pattern, and never another gate's socket.
  const sockets = [row.budget_socket, ...socketKeys.map(key => row[key])];
  if (socketKeys.some(key => typeof row[key] !== "string" || !PREVIEW_SOCKET_PATTERN.test(row[key] as string))
    || new Set(sockets).size !== sockets.length) return refused();
  if (legacy && (!Array.isArray(row.free_model_ids) || row.free_model_ids.length !== 1 || row.free_model_ids[0] !== PREVIEW_GLM_MODEL)) return refused();
  const free = reviewedRoster(row.free_model_ids);
  const premium = legacy ? free : reviewedRoster(row.premium_model_ids);
  if (!previewRostersHonourMakerRule(free, premium)) return refused();
  const config: PreviewProviderTestConfig = Object.freeze({ deployment: "v3-preview", free_model_ids: free, premium_model_ids: premium,
    requested_thinking_level: "high", budget_socket: row.budget_socket, scope_id: row.scope_id,
    ...Object.fromEntries(socketKeys.sort().map(key => [key, row[key] as string])) });
  // A roster model whose provider has no gate socket here could never be called: refuse to boot.
  if ([...free, ...premium].some(id => previewProviderSocket(config, previewModelRow(id)!.provider) === undefined)) return refused();
  return config;
}
export function validatePreviewProviderTestConfig(value: unknown): PreviewProviderTestConfig | undefined {
 if(value===undefined)return undefined;
 let source:string|undefined;try{source=JSON.stringify(value);}catch{return refused();}
 if(source===undefined)return refused();
 return parsePreviewProviderTestConfig(source);
}
/**
 * Step 1 (owner, 2026-10-08): the identity user ids that may start debates on the private
 * preview. Malformed refuses to boot; a value (even an empty one) without the preview
 * configuration refuses to boot, so it never silently applies to the real site; missing or
 * empty on the preview is an empty team and every ask is refused at request time.
 */
export const PREVIEW_TEAM_MAX_MEMBERS = 20 as const;
const PREVIEW_TEAM_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export function parsePreviewTeamUserIds(source: string | undefined, previewConfigured: boolean): readonly string[] | undefined {
  if (source !== undefined && !previewConfigured) throw new TypeError("PREVIEW_TEAM_USER_IDS_WITHOUT_PREVIEW");
  if (!previewConfigured) return undefined;
  if (source === undefined || source.trim() === "") return Object.freeze([]);
  let value: unknown; try { value = JSON.parse(source); } catch { throw new TypeError("PREVIEW_TEAM_USER_IDS_INVALID"); }
  if (!Array.isArray(value) || value.length > PREVIEW_TEAM_MAX_MEMBERS
    || value.some(id => typeof id !== "string" || !PREVIEW_TEAM_USER_ID.test(id))
    || new Set(value).size !== value.length) throw new TypeError("PREVIEW_TEAM_USER_IDS_INVALID");
  return Object.freeze([...value as string[]]);
}
/** The refusal a person outside the preview's team gets, at the route (403) and in submit. */
export const PREVIEW_TEAM_ONLY = "PREVIEW_TEAM_ONLY" as const;
/** Off the preview there is no team rule; on it, only a listed identity user id may start a debate. */
export function previewTeamAdmits(
  config: PreviewProviderTestConfig | undefined, teamUserIds: readonly string[] | undefined, userId: string | undefined
): boolean {
  if (config === undefined) return true;
  return userId !== undefined && teamUserIds !== undefined && teamUserIds.includes(userId);
}
/**
 * Step 1 — THE ONE READ BEHIND THE TEAM RULE FOR RUNS ALREADY IN THE SYSTEM, shared by the
 * API's waker (`#previewTeamRuns`) and the runner's start-up gate so both apply the same rule.
 * $1 = run ids (uuid[]), $2 = team identity user ids (uuid[]). Returns the ids of the runs a
 * team member owns: the owner is the run's latest ownership event, else its `owner:` asker id
 * (core.run_waiting_v's rule); a legacy asker's run has none and is never the team's.
 */
export const PREVIEW_TEAM_RUNS_SQL = `SELECT run.run_id::text AS run_id
       FROM core.run AS run
       LEFT JOIN LATERAL (
         SELECT event.owner_ref
         FROM core.run_ownership_event AS event
         WHERE event.run_id = run.run_id
         ORDER BY event.at_seq DESC
         LIMIT 1
       ) AS latest ON true
       JOIN identity."user" AS account
         ON account.user_id = ANY($2::uuid[])
        AND (account.owner_ref = latest.owner_ref
          OR (latest.owner_ref IS NULL AND run.asker_id = 'owner:' || account.owner_ref::text))
       WHERE run.run_id = ANY($1::uuid[])` as const;
export function previewPlanTierRosters<T extends Readonly<{ free: readonly string[]; premium: readonly string[] }>>(
  config: PreviewProviderTestConfig | undefined, defaults: T
): Readonly<{ free: readonly string[]; premium: readonly string[] }> {
  // Contract A §6: the preview's rosters are the configuration's (legacy form: [GLM] for both).
  // Unique ids, never [GLM, GLM]: admission maps each roster id to one panel member.
  return config === undefined ? defaults : Object.freeze({ free: config.free_model_ids, premium: config.premium_model_ids });
}
/**
 * The two provider sets a preview may run on, in register order: the sealed two-GLM pair, and the
 * reviewed multi-model set. Each declared target must equal its ref's reviewed row field for field
 * and carry no credential; every model the rosters name must have a declared target.
 */
export function assertPreviewProviderTargets(config: PreviewTargetRosters | undefined, targets: readonly ProviderDiscoveryTarget[]): void {
  if (config === undefined) return;
  const refs = targets.map(target => target.providerRef);
  if (refs.join("\0") !== PREVIEW_GLM_PROVIDER_REFS.join("\0") && !previewRefsAreReviewedSet(refs)) refused();
  for (const target of targets) {
    const reviewed = previewModelRowForRef(target.providerRef);
    if (reviewed === undefined || target.model !== reviewed.model || target.maker !== reviewed.maker
      || target.baseUrl !== reviewed.baseUrl
      || (target.adapterKind ?? "openai-compatible-http") !== reviewed.adapterKind
      || (reviewed.effort === null
        ? target.thinkingParameter !== undefined || target.thinkingLevels !== undefined
        : target.thinkingParameter !== "reasoning_effort" || target.thinkingLevels?.length !== 1 || target.thinkingLevels[0] !== reviewed.effort)
      || target.inputPriceMicrosPerMillionTokens !== reviewed.inputPriceMicrosPerMillion
      || target.outputPriceMicrosPerMillionTokens !== reviewed.outputPriceMicrosPerMillion
      || target.contextWindowTokens !== reviewed.contextWindowTokens
      || target.authorizationHeader !== undefined || target.authorizationFile !== undefined) refused();
  }
  const served = new Set(targets.map(target => target.model));
  if ([...config.free_model_ids, ...(config.premium_model_ids ?? [])].some(model => !served.has(model))) refused();
}
/**
 * On the preview, every role the register names (answer writer and checker, storyteller and story
 * checker) must be a declared target: a role on a ref the app cannot reach would fail at claim,
 * after the debate has started. Refused at boot instead (API and runner).
 */
export function assertPreviewRoleTargets(
  config: PreviewTargetRosters | undefined, targets: readonly ProviderDiscoveryTarget[], roleRefs: readonly string[]
): void {
  if (config === undefined) return;
  const declared = new Set(targets.map(target => target.providerRef));
  if (roleRefs.length === 0 || roleRefs.some(ref => !declared.has(ref))) refused();
  assertPreviewRoleGateSockets(config, roleRefs);
}
/**
 * PR B review: a role on a model whose provider gate the config does not name (Claude Haiku with no
 * `anthropic_budget_socket`) could never be called, so every ask would be refused. Refused at boot.
 */
export function assertPreviewRoleGateSockets(config: PreviewTargetRosters, roleRefs: readonly string[]): void {
  for (const ref of roleRefs) {
    const provider = previewModelRowForRef(ref)?.provider;
    if (provider !== undefined && provider !== "deepinfra" && typeof config[PREVIEW_PROVIDER_SOCKET_KEYS[provider]] !== "string") refused();
  }
}
/**
 * The probe's controls for one reviewed target: "high" only where the row has an effort switch,
 * and the generation floor, never above the row's bound. Throws for a target off the reviewed rows.
 */
export function previewProbeControls(target: Readonly<{ model: string }>): Readonly<{ thinkingLevel?: "high"; tokenCeiling: number }> {
  const reviewed = previewModelRow(target.model) ?? refused();
  return Object.freeze({ ...(reviewed.effort === null ? {} : { thinkingLevel: reviewed.effort }),
    tokenCeiling: Math.min(PREVIEW_GLM_GENERATION_TOKEN_FLOOR, reviewed.outputBound) });
}
/**
 * Contract A §2: on the preview only, a target's gateway never asks for more output than its
 * reviewed row allows (max_tokens is clamped to the row's bound, length retries included), so the
 * guarded fetch never meets a bound the gate refuses. Off the preview nothing is added.
 */
export function previewTargetGatewayControls(
  config: PreviewProviderTestConfig | undefined, target: Readonly<{ model: string }>
): Readonly<{ maxOutputTokens?: number }> {
  if (config === undefined) return Object.freeze({});
  return Object.freeze({ maxOutputTokens: (previewModelRow(target.model) ?? refused()).outputBound });
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
/**
 * The preview's per-call policy for ONE target. A row with an effort switch runs every call at the
 * configured level ("high"); a row without one (MiMo) never sends a level, and a request that asks
 * for one is refused before anything is sent.
 */
export function withPreviewProviderCallPolicy(gateway: ProviderGateway, config: PreviewProviderTestConfig, target: Readonly<{ model: string }>): ProviderGateway {
  const reviewed = previewModelRow(target.model) ?? refused();
  return Object.freeze({ call(request: ProviderCallRequest) {
    // A row with no effort switch runs at the vendor default, so "DEFAULT_ONLY" asks for exactly that.
    const asksNoLevel = request.thinkingLevel === undefined
      || (reviewed.effort === null && request.thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY);
    if (!asksNoLevel && (reviewed.effort === null || request.thinkingLevel !== config.requested_thinking_level)) {
      throw new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", reviewed.effort === null
        ? "The private preview connection for this model has no thinking level"
        : "The private preview connection is configured for high only");
    }
    const bound = previewCallBound(request.bound, config);
    // One explicit level replaces whatever the request carried: the configured level on an effort
    // row; DEFAULT_ONLY on a row without one, which the gateway treats exactly as "no level".
    return gateway.call({ ...request, thinkingLevel: reviewed.effort === null ? THINKING_LEVEL_DEFAULT_ONLY : config.requested_thinking_level,
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
/** Each provider's gate port; a single port (the pre-PR-B form) is the DeepInfra gate's. */
export type PreviewBudgetPorts = Readonly<Partial<Record<PreviewProviderName, PreviewBudgetPort>>>;
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Contract A §2: the DeepInfra (OpenAI) body the DeepInfra gate accepts for a row of its own. */
function deepInfraBodyAccepted(body: Record<string, unknown>, reviewed: PreviewModelRow): boolean {
  if (reviewed.provider !== "deepinfra") return false;
  const hasResponseFormat = Object.hasOwn(body, "response_format");
  const responseFormat = body.response_format;
  if (hasResponseFormat && (!reviewed.jsonObject || !isPlainObject(responseFormat)
    || Object.keys(responseFormat).length !== 1 || !Object.hasOwn(responseFormat, "type") || responseFormat.type !== "json_object")) return false;
  const required = ["model", "max_tokens", "messages", ...(reviewed.effort === null ? [] : ["reasoning_effort"])];
  return Object.keys(body).length === required.length + (hasResponseFormat ? 1 : 0)
    && required.every(key => Object.hasOwn(body, key))
    && (reviewed.effort === null || body.reasoning_effort === reviewed.effort)
    && Number.isSafeInteger(body.max_tokens) && Number(body.max_tokens) >= 1 && Number(body.max_tokens) <= reviewed.outputBound
    && Array.isArray(body.messages);
}
/**
 * PR B, the wire contract's Anthropic body, exactly as the Anthropic gate checks it: `model`,
 * `max_tokens` (1..the row's bound), `messages` (each exactly {role, content: non-empty text},
 * roles alternating user/assistant, first and last a user turn, as the adapter builds them), an
 * optional non-empty `system` text, and `output_config` {"effort": "high"} exactly when the row
 * has an effort switch. Nothing else, anywhere.
 */
function anthropicBodyAccepted(body: Record<string, unknown>, reviewed: PreviewModelRow): boolean {
  if (reviewed.provider !== "anthropic") return false;
  const required = ["model", "max_tokens", "messages", ...(reviewed.effort === null ? [] : ["output_config"])];
  const optional = Object.hasOwn(body, "system") ? 1 : 0;
  const messages = body.messages;
  const effort = body.output_config;
  return Object.keys(body).length === required.length + optional
    && required.every(key => Object.hasOwn(body, key))
    && (optional === 0 || (typeof body.system === "string" && body.system.trim().length > 0))
    && (reviewed.effort === null || (isPlainObject(effort) && Object.keys(effort).length === 1 && effort.effort === reviewed.effort))
    && Number.isSafeInteger(body.max_tokens) && Number(body.max_tokens) >= 1 && Number(body.max_tokens) <= reviewed.outputBound
    && Array.isArray(messages) && messages.length % 2 === 1
    && messages.every((message, index) => isPlainObject(message) && Object.keys(message).length === 2
      && message.role === (index % 2 === 0 ? "user" : "assistant")
      && typeof message.content === "string" && message.content.trim().length > 0);
}
/** No key ever leaves the app for a gate: a key header on the guarded fetch is refused. */
function carriesKeyHeader(headers: RequestInit["headers"]): boolean {
  if (headers === undefined) return false;
  const names = [...new Headers(headers).keys()].map(name => name.toLowerCase());
  return names.some(name => name === "authorization" || name === "x-api-key" || name === "x-goog-api-key");
}
/**
 * Contract A §2/§3, PR B: the one fetch the preview's provider calls and probes go through. It
 * routes by the EXACT call URL to that provider's gate (DeepInfra chat completions to the DeepInfra
 * gate, Anthropic Messages to the Anthropic gate), so a call can only ever reach its own provider's
 * socket. It sends only a body that gate accepts for that body's reviewed row of THAT provider
 * (exact keys, the row's effort and JSON switches, 1 <= max_tokens <= the row's bound, at most
 * 256 KiB), never a key header, and reserves at that row's price.
 */
export function createPreviewGuardedFetch(ports: PreviewBudgetPort | PreviewBudgetPorts): typeof fetch {
  const byProvider: PreviewBudgetPorts = typeof (ports as PreviewBudgetPort).execute === "function"
    ? Object.freeze({ deepinfra: ports as PreviewBudgetPort }) : ports as PreviewBudgetPorts;
  return async (input, init) => {
    if (init?.signal?.aborted) throw new DOMException("Private preview call canceled", "TimeoutError");
    const url = String(input);
    const provider: PreviewProviderName | undefined = url === `${PREVIEW_DEEPINFRA_BASE_URL}/chat/completions` ? "deepinfra"
      : url === PREVIEW_ANTHROPIC_MESSAGES_URL ? "anthropic" : undefined;
    if (provider === undefined || init?.method !== "POST" || typeof init.body !== "string"
      || Buffer.byteLength(init.body, "utf8") > PREVIEW_REQUEST_BODY_MAX_BYTES || carriesKeyHeader(init.headers)) refused();
    let decoded: unknown; try { decoded = JSON.parse(init!.body as string); } catch { return refused(); }
    if (!isPlainObject(decoded)) return refused();
    const reviewed: PreviewModelRow = previewModelRow(decoded.model) ?? refused();
    if (!(provider === "deepinfra" ? deepInfraBodyAccepted(decoded, reviewed) : anthropicBodyAccepted(decoded, reviewed))) refused();
    const port = byProvider[provider];
    if (port === undefined) {
      // A configured provider without its gate: nothing is reserved or sent.
      throw new TypedDomainError("PROVIDER_CALL_FAILED", "Private preview gate for this provider is not configured");
    }
    const body = init!.body as string;
    // UTF-8 bytes + template allowance; the row's full output bound, including hidden reasoning.
    const reserved = previewReservationNanoUsd(reviewed, Buffer.byteLength(body, "utf8"));
    const result = await port.execute({ operationId: randomUUID(), requestBody: body,
      requestSha256: createHash("sha256").update(body).digest("hex"), reservedUsd: previewNanoUsdText(reserved) }, init!.signal ?? undefined);
    return new Response(result.body, { status: result.status, headers: { "content-type": "application/json" } });
  };
}
/**
 * Step 1 (owner, 2026-10-08): the v2 gate refuses with 409 and {"error": CODE}. The team's day
 * being used up is the product's daily code (a run-level spend stop lifted by the next day).
 * Too many calls in flight (CONCURRENCY_LIMIT_REACHED) is the gate's own 429: nothing was
 * reserved, and the same call fits once one in flight settles, so it is the transient transport
 * failure every vendor 429 already is (PROVIDER_CALL_FAILED: the gateway wraps it, the runner
 * cools down and retries), never a money stop. Every other refusal, and any body that is not
 * exactly that shape, keeps the per-run money code.
 */
const PREVIEW_DAILY_REFUSALS: ReadonlySet<string> = new Set(["TEAM_DAILY_BUDGET_REACHED", "DAILY_CALL_LIMIT_REACHED"]);
/**
 * Owner ruling 5 (2026-10-10): a call the gate proves never billed (PROVIDER_NOT_REACHED: the
 * connect or TLS handshake failed before a byte was written; PROVIDER_REFUSED_UNBILLED: a vendor
 * 429/529 with no usage and a provably unbilled body) released its hold, so it is the same
 * transient failure as a busy gate: PROVIDER_CALL_FAILED, retried after the cooldown, never a
 * money stop. The gate must list both codes as public refusals for them to arrive here.
 */
const PREVIEW_TRANSIENT_REFUSALS: ReadonlySet<string> = new Set(["CONCURRENCY_LIMIT_REACHED", "PROVIDER_NOT_REACHED", "PROVIDER_REFUSED_UNBILLED"]);
function previewAuthorityRefusal(status: number | undefined, row: unknown): TypedDomainError {
  const code = status === 409 && typeof row === "object" && row !== null && !Array.isArray(row)
    ? (row as Record<string, unknown>).error : undefined;
  if (typeof code === "string" && PREVIEW_DAILY_REFUSALS.has(code)) {
    return new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "Private preview team budget for today is used up");
  }
  if (typeof code === "string" && PREVIEW_TRANSIENT_REFUSALS.has(code)) {
    return new TypedDomainError("PROVIDER_CALL_FAILED", code === "CONCURRENCY_LIMIT_REACHED"
      ? "Private preview gate is at its limit of calls in flight" : "Private preview call was not billed and did not reach an answer");
  }
  return new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "Private preview authority stopped or refused the request");
}
/** Local IPC only: application principals never receive the provider credential or ledger write access. */
export function createPreviewBudgetRpcPort(config: PreviewProviderTestConfig, socketPath: string = config.budget_socket): PreviewBudgetPort {
  return Object.freeze({ execute(input: PreviewBudgetExecution, signal?: AbortSignal) {
    return new Promise<Readonly<{ status: number; body: string }>>((resolve, reject) => {
      const data = JSON.stringify({ scope_id: config.scope_id, ...input });
      const request = httpRequest({ socketPath, path: "/complete", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, response => {
        const chunks: Buffer[] = []; let bytes = 0;
        // A destroy without an error emits only 'close': settle first, so the call can never hang.
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes <= 8 * 1024 * 1024) { chunks.push(chunk); return; }
          reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response too large"));
          response.destroy();
        });
        response.on("error", () => reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response unavailable")));
        // A reply that closes before its end is unreadable; after 'end' this reject is a no-op.
        response.on("close", () => { if (!response.complete) reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response unavailable")); });
        response.on("end", () => {
          let result: unknown; try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority response invalid")); return; }
          const row = result as Record<string, unknown>;
          if (response.statusCode !== 200 || typeof row !== "object" || row === null || !Number.isInteger(row.status) || typeof row.body !== "string") {
            reject(previewAuthorityRefusal(response.statusCode, row)); return;
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
/**
 * PR B: one RPC port per gate this config names (DeepInfra on `budget_socket`, Anthropic on
 * `anthropic_budget_socket` when set). The guarded fetch routes each call to its own provider's port.
 */
export function createPreviewBudgetRpcPorts(config: PreviewProviderTestConfig): PreviewBudgetPorts {
  const ports: Partial<Record<PreviewProviderName, PreviewBudgetPort>> = {};
  for (const provider of ["deepinfra", ...Object.keys(PREVIEW_PROVIDER_SOCKET_KEYS)] as PreviewProviderName[]) {
    const socket = previewProviderSocket(config, provider);
    if (socket !== undefined) ports[provider] = createPreviewBudgetRpcPort(config, socket);
  }
  return Object.freeze(ports);
}
