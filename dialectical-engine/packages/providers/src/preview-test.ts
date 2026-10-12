/** One opt-in private preview test; normal provider/roster behavior stays unchanged. */
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { THINKING_LEVEL_DEFAULT_ONLY, TypedDomainError } from "@debateai/kernel";
import type { CallBound, ProviderCallRequest, ProviderDiscoveryTarget, ProviderGateway } from "./index.js";
import { assertFramedPrompt } from "./prompt-frame.js";
import { ProviderUnbilledRefusal } from "./unbilled-refusal.js";
import { createPreviewRemainingRpcPort, type PreviewRemainingPort } from "./preview-remaining.js";
import {
  PREVIEW_ANTHROPIC_MESSAGES_URL, PREVIEW_DEEPINFRA_BASE_URL, PREVIEW_MODEL_ROWS, PREVIEW_REQUEST_BODY_MAX_BYTES,
  previewModelRow, previewModelRowForRef, previewNanoUsdText, previewRefsAreReviewedSet, previewReservationNanoUsd,
  previewRostersHonourMakerRule, type PreviewModelRow, type PreviewProviderName
} from "./preview-models.js";
import { parsePreviewThinkingLevels, type PreviewThinkingLevels } from "./preview-thinking.js";

export const PREVIEW_GLM_MODEL = "zai-org/GLM-5.3-Flash" as const;
export const PREVIEW_GLM_PROVIDER_REF = "preview:fixture-a" as const;
/**
 * The sealed two-GLM register's refs (synthesis writer + checker on one maker). Kept for the v1
 * publish kit (byte for byte) and for runs pinned to that register; the multi-model set is
 * PREVIEW_REVIEWED_PROVIDER_REFS (preview-models.ts).
 */
export const PREVIEW_GLM_PROVIDER_REFS = Object.freeze([PREVIEW_GLM_PROVIDER_REF, "preview:fixture-b"] as const);
export const PREVIEW_GLM_BASE_URL = PREVIEW_DEEPINFRA_BASE_URL;
/**
 * Every preview call's deadline (previewCallBound). Slow answer (owner ruling 2026-10-12): the GATE decides when a
 * vendor call has taken too long (its CALL_DEADLINE_SECONDS, 1,200 s, and it answers within REPLY_TIMEOUT_SECONDS,
 * that plus 30 s), so the app waits 30 s longer than the gate's reply: 1,260 s. It was 600 s, the gate's old deadline,
 * and a MiMo story at 17 tokens a second ran past both.
 */
export const PREVIEW_GLM_DEADLINE_MS = 1_260_000 as const;
/** The gate socket's own idle timeout: past the app's deadline, so the app's abort always ends a call first. */
export const PREVIEW_GATE_IPC_TIMEOUT_MS = PREVIEW_GLM_DEADLINE_MS + 30_000;
export const PREVIEW_GLM_GENERATION_TOKEN_FLOOR = 8192 as const;
/** GLM's row bound; every row's own bound is PreviewModelRow.outputBound. */
export const PREVIEW_GLM_OUTPUT_RESERVATION = 32_768 as const;
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
 *
 * Spec 2026-10-12 §4.2: either form may also carry the optional `thinking_levels` table (the owner's levels per AI and
 * per step, preview-thinking.ts). It is absent in today's configuration, and then every request is today's.
 */
export interface PreviewProviderTestConfig {
  readonly deployment: "v3-preview";
  readonly free_model_ids: readonly string[];
  readonly premium_model_ids: readonly string[];
  readonly requested_thinking_level: "high";
  readonly budget_socket: string;
  readonly scope_id: string;
  readonly anthropic_budget_socket?: string;
  /** Spec 2026-10-12 §4.2: the owner's thinking-level table, keyed by reviewed model id; absent = every row's default. */
  readonly thinking_levels?: PreviewThinkingLevels;
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
  // Spec 2026-10-12 §4.2: `thinking_levels` is an optional key on both forms, so the key checks look past it.
  const own = Object.keys(row).filter(key => key !== "thinking_levels");
  const keys = [...own].sort().join(",");
  const legacy = keys === LEGACY_CONFIG_KEYS.join(",");
  const socketKeys = own.filter(key => OPTIONAL_SOCKET_KEYS.includes(key));
  const baseKeys = own.filter(key => !OPTIONAL_SOCKET_KEYS.includes(key)).sort().join(",");
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
  // Spec 2026-10-12 §4.2: a bad table throws PREVIEW_THINKING_LEVELS_INVALID from the parser, unwrapped, so the boot error names it.
  const config: PreviewProviderTestConfig = Object.freeze({ deployment: "v3-preview", free_model_ids: free, premium_model_ids: premium,
    requested_thinking_level: "high", budget_socket: row.budget_socket, scope_id: row.scope_id,
    ...Object.fromEntries(socketKeys.sort().map(key => [key, row[key] as string])),
    ...(row.thinking_levels === undefined ? {} : { thinking_levels: parsePreviewThinkingLevels(row.thinking_levels) }) });
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
      || (reviewed.defaultEffort === "default"
        ? target.thinkingParameter !== undefined || target.thinkingLevels !== undefined
        : target.thinkingParameter !== "reasoning_effort" || target.thinkingLevels?.length !== 1 || target.thinkingLevels[0] !== reviewed.defaultEffort)
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
 * The probe's controls for one reviewed target: the row's default level (spec 2026-10-12 §4.5: today's request) unless
 * that is "default" (no member), and the generation floor, never above the row's bound. Throws for a target off the
 * reviewed rows.
 */
export function previewProbeControls(target: Readonly<{ model: string }>): Readonly<{ thinkingLevel?: string; tokenCeiling: number }> {
  const reviewed = previewModelRow(target.model) ?? refused();
  return Object.freeze({ ...(reviewed.defaultEffort === "default" ? {} : { thinkingLevel: reviewed.defaultEffort }),
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
/**
 * The preview's token floor and deadline on a call bound. Preview retry fix, option B (spec 2026-10-11
 * §1.1, owner ruling R1): `maxAttempts` is kept, because it is the step's sealed LIFETIME allowance the
 * counting gateway reads against the ledger. Lowering it to 1 made the one resend after an unbilled
 * refusal, and the runner's own final retry after a cooldown, meet a spent step (CALL_BUDGET_EXHAUSTED);
 * the preview's one POST per call is `maxAttemptsThisCall` (withPreviewProviderCallPolicy) instead.
 */
export function previewCallBound(bound: CallBound, config: PreviewProviderTestConfig | undefined): CallBound {
  return config === undefined ? bound : Object.freeze({ maxAttempts: bound.maxAttempts, tokenCeiling: Math.max(bound.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR), deadlineMs: PREVIEW_GLM_DEADLINE_MS });
}
export function previewRunnerPolicy<T extends { bounds: Readonly<Record<"JUDGE" | "COMPOSER" | "CONFORMANCE", CallBound>>; synthesisRolePolicy: { synthesizerBound: CallBound; evaluatorBound: CallBound } }>(policy: T, config: PreviewProviderTestConfig | undefined): T {
  if (config === undefined) return policy;
  return { ...policy, bounds: { JUDGE: previewCallBound(policy.bounds.JUDGE, config), COMPOSER: previewCallBound(policy.bounds.COMPOSER, config), CONFORMANCE: previewCallBound(policy.bounds.CONFORMANCE, config) }, synthesisRolePolicy: { ...policy.synthesisRolePolicy, synthesizerBound: previewCallBound(policy.synthesisRolePolicy.synthesizerBound, config), evaluatorBound: previewCallBound(policy.synthesisRolePolicy.evaluatorBound, config) } };
}
/** A story call site on the story lane, by its own role: the storyteller (SYNTHESIZER) or the story checker (EVALUATOR). */
function previewStorySite(request: ProviderCallRequest, site: "STORYTELLER" | "CHECKER"): boolean {
  return request.lane === "story" && (site === "STORYTELLER"
    ? request.role === "SYNTHESIZER" && /^STORY:STORYTELLER:[1-8]$/u.test(request.callSiteKey)
    : request.role === "EVALUATOR" && /^STORY:CHECKER:[1-8]$/u.test(request.callSiteKey));
}
/**
 * Only the current native storyteller and story checker requests may keep one safe locator repair (story format
 * robustness, 2026-10-12: the checker too, so one format slip no longer costs the story its check).
 */
function previewStoryRepairAllowed(request: ProviderCallRequest): boolean {
  const site = previewStorySite(request, "STORYTELLER") ? "STORYTELLER" : previewStorySite(request, "CHECKER") ? "CHECKER" : null;
  if (site === null || !Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 2
    || typeof request.classifyContent !== "function" || typeof request.buildRepairPacket !== "function") return false;
  try { return assertFramedPrompt(request.packet).contractId === (site === "STORYTELLER" ? "story.storyteller.v3" : "story.checker.v2"); }
  catch { return false; }
}
/**
 * All-steps format robustness (2026-10-12): every other structured step gets the story's one repair try on the preview.
 * A debate step on the served lane (the author legs incl. critic and cross-root, panel and review: JUDGE; the answer
 * writer: SYNTHESIZER; the answer checker: EVALUATOR) whose request carries its own content check and repair packet, with
 * a framed prompt and a sealed lifetime bound of at least two, may send a second POST in the same call, and only after
 * its reply was refused by that check (`retryOnlyAfterContentRejection`): the repair packet names the issues, exactly as
 * hosted and local repair within the sealed bound. The counting gateway still reads the step's allowance per maker off
 * the ledger (attemptScope "actor"), so the repair is billed and counted like any attempt and the sealed bound of three
 * leaves the runner's final retry its room. A transport failure still ends the call after one POST, and an unbilled
 * refusal still gets the one 60-second resend.
 *
 * Patch follow-up (owner design, 2026-10-12): that second POST is the SHORT follow-up whenever the refused reply decoded
 * to an object refused at named members (the gateway decides; `planPatchFollowUp`), and a call whose second POST was a
 * patch may send a third, the full re-ask, still within the sealed bound the counting gateway hands down as what is
 * left (`remaining`), so it never meets a spent step. The story's sealed bound of two leaves the patch only.
 */
function previewFormatRepairAllowed(request: ProviderCallRequest): boolean {
  if (request.lane !== "served" || (request.role !== "JUDGE" && request.role !== "SYNTHESIZER" && request.role !== "EVALUATOR")
    || !Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 2
    || typeof request.classifyContent !== "function" || typeof request.buildRepairPacket !== "function") return false;
  try { assertFramedPrompt(request.packet); return true; }
  catch { return false; }
}
/**
 * Story format robustness (2026-10-12), finding 1: the storyteller thinks before it writes, and on every reviewed row
 * that thinking counts toward max_tokens (DeepInfra reports it as reasoning tokens inside the completion; Anthropic
 * counts thinking as output). DeepSeek spent 11,317 of the sealed 12,000 thinking and its story was cut off. On the
 * preview only, the storyteller's call asks for its row's story allowance (PreviewModelRow.storytellerTokenCeiling,
 * never above the row's answer cap, which the gate already reserves for every call: previewReservationNanoUsd).
 * Slow answer (owner ruling 2026-10-12): the whole cap on the fast rows (DeepSeek, Claude Haiku), 16,384 on the slower
 * ones (MiMo, Qwen, GLM). A length retry still asks twice the allowance, held to the row's cap by the gateway. The
 * sealed register row is untouched; every other call keeps previewCallBound.
 */
export function previewStorytellerTokenCeiling(reviewed: Readonly<{ storytellerTokenCeiling: number }>): number {
  return reviewed.storytellerTokenCeiling;
}
/**
 * Owner ruling 5 (2026-10-10): how long the preview waits before its one retry of a call the gate
 * proved was never billed (PROVIDER_NOT_REACHED, PROVIDER_REFUSED_UNBILLED, and by owner ruling R4 of
 * 2026-10-11 its own CONCURRENCY_LIMIT_REACHED).
 */
const PREVIEW_UNBILLED_RETRY_COOLDOWN_MS = 60_000;
/**
 * Spec 2026-10-11 busy model §2: the same one wait before the probe's one resend (provider-probe.ts),
 * so a probe and a debate call wait the same 60 seconds. `sleep` is injectable for tests.
 */
export function waitBeforePreviewUnbilledResend(
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise<void>((resolve) => { setTimeout(resolve, milliseconds); })
): Promise<void> {
  return sleep(PREVIEW_UNBILLED_RETRY_COOLDOWN_MS);
}
/**
 * A gate refusal for a call that provably cost nothing: the vendor was never reached, refused unbilled,
 * or the gate itself had too many calls in flight. A ProviderUnbilledRefusal, so the gateway records the
 * attempt as REFUSED and no attempt count includes it (spec 2026-10-11 §1.2 (d)).
 */
export class PreviewUnbilledRefusal extends ProviderUnbilledRefusal {
  constructor(message = "Private preview call was not billed and did not reach an answer") { super(message); }
}
/**
 * Run resilience, review amendment R-d (orchestrator, 2026-10-12): the unbilled refusal that says the MODEL is
 * busy — the VENDOR refused the call and the gate proved it unbilled (PROVIDER_REFUSED_UNBILLED: a vendor 429/529,
 * hold released), or, since gate v4, the gate refused it because that one model is cooling off after such refusals
 * (MODEL_COOLING, `PreviewModelCooling` below). The gate's other unbilled refusals stay plain
 * `PreviewUnbilledRefusal`s: its slots were full (CONCURRENCY_LIMIT_REACHED), the vendor was never reached
 * (PROVIDER_NOT_REACHED), or the vendor answered with an error that bills nothing but is not "busy"
 * (PROVIDER_ERROR_UNBILLED, review 2026-10-12: Anthropic's 400/404/413/500, which a resend of the same request would
 * meet again); they are still REFUSED rows with the one 60-second resend, but they say nothing about the model being
 * busy, so they never make it sit out (`providerCallEndedVendorRefusedUnbilled`, read by the runner's sit-out book).
 */
export class PreviewVendorRefusedUnbilled extends PreviewUnbilledRefusal {
  constructor(message = "Private preview vendor refused the call unbilled") { super(message); }
}
/** The longest cool-off the gate ever names (preview_budget_authority.py COOL_OFF_MAX_SECONDS: 60 s doubling to 600 s). */
const PREVIEW_MODEL_COOLING_MAX_SECONDS = 600;
/**
 * Gate v4 (2026-10-12): MODEL_COOLING. After two or more vendor-unbilled refusals in a row for ONE model, the gate
 * lets that model cool off (60 seconds, doubling up to 600) and refuses its calls before reserving anything and
 * without contacting the vendor; after the wait one trial call goes through, and an answer clears it. Other models
 * are not affected. For the app this is the model being busy, exactly like the vendor's own unbilled refusal: a
 * REFUSED row, the one 60-second resend (which lands about when the first wait ends, so it is often the trial), and
 * the model sits out the rest of the run. Never a money stop. `retryAfterSeconds` is the gate's wait in whole
 * seconds, kept only when it is a whole number from 1 to 600; it is informational (nothing waits on it).
 */
export class PreviewModelCooling extends PreviewVendorRefusedUnbilled {
  readonly retryAfterSeconds: number | undefined;
  constructor(retryAfterSeconds?: unknown) {
    super("Private preview gate is letting this model cool off after it was busy");
    this.retryAfterSeconds = Number.isSafeInteger(retryAfterSeconds) && Number(retryAfterSeconds) >= 1
      && Number(retryAfterSeconds) <= PREVIEW_MODEL_COOLING_MAX_SECONDS ? Number(retryAfterSeconds) : undefined;
  }
}
/**
 * R-d: a call that ENDED in the vendor's gate-proven unbilled refusal — the gateway's PROVIDER_CALL_FAILED whose last
 * attempt (on the preview, the one 60-second resend) was a `PreviewVendorRefusedUnbilled`. A bare refusal is not a
 * call's end (the gateway records and wraps every one), so it is false; so is a call that ended in the gate's own
 * refusal, even after a vendor refusal before it.
 */
export function providerCallEndedVendorRefusedUnbilled(error: unknown): boolean {
  return error instanceof TypedDomainError && error.code === "PROVIDER_CALL_FAILED"
    && (error as { cause?: unknown }).cause instanceof PreviewVendorRefusedUnbilled;
}
/** The refusal itself, or the gateway's PROVIDER_CALL_FAILED wrapping it as its cause. */
function previewCallWasUnbilled(error: unknown): boolean {
  return error instanceof PreviewUnbilledRefusal || (typeof error === "object" && error !== null
    && (error as { cause?: unknown }).cause instanceof PreviewUnbilledRefusal);
}
/**
 * The preview's per-call policy for ONE target. A row with an effort switch runs every call at the
 * configured level ("high"); a row without one (MiMo, Qwen) never sends a level, and a request that asks
 * for one is refused before anything is sent.
 *
 * Preview retry fix, option B (spec 2026-10-11 §1.1, owner ruling R1): the request's lifetime bound
 * passes through (token floor and deadline applied, `maxAttempts` kept; the storyteller's token ceiling is
 * its row's bound), and each call may send ONE POST (`maxAttemptsThisCall`; the storyteller's and the story
 * checker's repair calls two; every other structured step's two, the second only to repair a refused reply:
 * `previewFormatRepairAllowed`, all-steps format robustness, 2026-10-12). The counting gateway behind this
 * wrapper reads the step's allowance off the ledger, where an unbilled refusal is a REFUSED row it
 * does not count.
 *
 * Owner ruling 5: a call the gate proves was never billed is sent ONCE more after
 * PREVIEW_UNBILLED_RETRY_COOLDOWN_MS. Only those refusals (R4: the gate's own concurrency refusal too);
 * never a second retry; never on the storyteller or the story checker, whose two attempts already include
 * one after any failure. The start-of-debate estimate counts this retry. The runner's own cooldown and final retry
 * still follow a failure this wrapper passes up.
 */
export function withPreviewProviderCallPolicy(
  gateway: ProviderGateway, config: PreviewProviderTestConfig, target: Readonly<{ model: string }>,
  options: Readonly<{ sleep?: (milliseconds: number) => Promise<void> }> = {}
): ProviderGateway {
  const reviewed = previewModelRow(target.model) ?? refused();
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => { setTimeout(resolve, milliseconds); }));
  return Object.freeze({ call(request: ProviderCallRequest) {
    // A row with no effort switch runs at the vendor default, so "DEFAULT_ONLY" asks for exactly that.
    const asksNoLevel = request.thinkingLevel === undefined
      || (reviewed.defaultEffort === "default" && request.thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY);
    if (!asksNoLevel && (reviewed.defaultEffort === "default" || request.thinkingLevel !== config.requested_thinking_level)) {
      throw new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", reviewed.defaultEffort === "default"
        ? "The private preview connection for this model has no thinking level"
        : "The private preview connection is configured for high only");
    }
    const preview = previewCallBound(request.bound, config);
    const bound = previewStorySite(request, "STORYTELLER")
      ? Object.freeze({ ...preview, tokenCeiling: previewStorytellerTokenCeiling(reviewed) }) : preview;
    const storyRepair = previewStoryRepairAllowed(request);
    const formatRepair = !storyRepair && previewFormatRepairAllowed(request);
    // One explicit level replaces whatever the request carried: the configured level on an effort
    // row; DEFAULT_ONLY on a row without one, which the gateway treats exactly as "no level".
    // Run resilience (spec 2026-10-12, fix (b)): the step's allowance is this maker's own (`attemptScope`), so a
    // fallback that moves a call to another maker never finds the step spent by the makers it moved away from.
    const send = () => gateway.call({ ...request, thinkingLevel: reviewed.defaultEffort === "default" ? THINKING_LEVEL_DEFAULT_ONLY : config.requested_thinking_level,
      bound, maxAttemptsThisCall: storyRepair || formatRepair ? 2 : 1, attemptScope: "actor",
      ...(formatRepair ? { retryOnlyAfterContentRejection: true } : {}) });
    if (storyRepair) return send();
    return send().catch(async (error: unknown) => {
      if (!previewCallWasUnbilled(error)) throw error;
      await sleep(PREVIEW_UNBILLED_RETRY_COOLDOWN_MS);
      return send();
    });
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
/** Spec 2026-10-12 §4.5: a body's effort is on the row's menu; "default" only as an absent member, never a wire word. */
function effortOnMenu(present: boolean, value: unknown, reviewed: PreviewModelRow): boolean {
  return present
    ? typeof value === "string" && value !== "default" && (reviewed.efforts as readonly string[]).includes(value)
    : reviewed.efforts.includes("default");
}
/**
 * Contract A §2: the DeepInfra (OpenAI) body the DeepInfra gate accepts for a row of its own. Reviewed sampling
 * (2026-10-12): a row with `sampling` requires exactly those members with exactly those numbers (a row without one
 * accepts none of them, as it accepts no other member), as the gate's DeepInfraProfile.body_valid does. Spec
 * 2026-10-12 §4.5: `reasoning_effort`, when present, is a word on the row's menu; absent only where the menu holds
 * "default".
 */
function deepInfraBodyAccepted(body: Record<string, unknown>, reviewed: PreviewModelRow): boolean {
  if (reviewed.provider !== "deepinfra") return false;
  const hasResponseFormat = Object.hasOwn(body, "response_format");
  const responseFormat = body.response_format;
  if (hasResponseFormat && (!reviewed.jsonObject || !isPlainObject(responseFormat)
    || Object.keys(responseFormat).length !== 1 || !Object.hasOwn(responseFormat, "type") || responseFormat.type !== "json_object")) return false;
  const sampling = Object.entries(reviewed.sampling ?? {});
  const hasEffort = Object.hasOwn(body, "reasoning_effort");
  const required = ["model", "max_tokens", "messages", ...(hasEffort ? ["reasoning_effort"] : []),
    ...sampling.map(([key]) => key)];
  return Object.keys(body).length === required.length + (hasResponseFormat ? 1 : 0)
    && required.every(key => Object.hasOwn(body, key))
    && effortOnMenu(hasEffort, body.reasoning_effort, reviewed)
    && sampling.every(([key, value]) => typeof body[key] === "number" && body[key] === value)
    && Number.isSafeInteger(body.max_tokens) && Number(body.max_tokens) >= 1 && Number(body.max_tokens) <= reviewed.outputBound
    && Array.isArray(body.messages);
}
/** A text block of exactly `keys`, whose text is not only whitespace. */
function isTextBlock(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
    && value.type === "text" && typeof value.text === "string" && value.text.trim().length > 0;
}
/**
 * Prompt caching (owner approval 2026-10-12): the Anthropic `system` is either a text that is not only whitespace,
 * or exactly the adapter's two text blocks (anthropicCacheableSystem): the first exactly {type, text, cache_control}
 * with cache_control exactly {"type": "ephemeral"} (no ttl), the second exactly {type, text}. The gate's
 * AnthropicProfile.system_valid is the same rule (tests/unit/fixtures/anthropic-cache-bodies.json).
 */
function anthropicSystemAccepted(system: unknown): boolean {
  if (typeof system === "string") return system.trim().length > 0;
  if (!Array.isArray(system) || system.length !== 2) return false;
  const [first, second] = system as unknown[];
  if (!isTextBlock(first, ["type", "text", "cache_control"]) || !isTextBlock(second, ["type", "text"])) return false;
  const mark = first.cache_control;
  return isPlainObject(mark) && Object.keys(mark).length === 1 && mark.type === "ephemeral";
}
/** An accepted Anthropic body asks for a cache write exactly when its system is the two-block form. */
function anthropicBodyAsksCacheWrite(body: Record<string, unknown>): boolean {
  return Array.isArray(body.system) && anthropicSystemAccepted(body.system);
}
/**
 * PR B, the wire contract's Anthropic body, exactly as the Anthropic gate checks it: `model`,
 * `max_tokens` (1..the row's bound), `messages` (each exactly {role, content: non-empty text},
 * roles alternating user/assistant, first and last a user turn, as the adapter builds them), an
 * optional `system` (a non-empty text, or the two blocks carrying the one cache mark:
 * anthropicSystemAccepted), and `output_config` exactly {"effort": <a word on the row's menu>} (spec 2026-10-12
 * §4.5; absent only where the menu holds "default", which no Anthropic row does). Nothing else, anywhere.
 */
function anthropicBodyAccepted(body: Record<string, unknown>, reviewed: PreviewModelRow): boolean {
  if (reviewed.provider !== "anthropic") return false;
  const hasEffort = Object.hasOwn(body, "output_config");
  const required = ["model", "max_tokens", "messages", ...(hasEffort ? ["output_config"] : [])];
  const optional = Object.hasOwn(body, "system") ? 1 : 0;
  const messages = body.messages;
  const effort = body.output_config;
  return Object.keys(body).length === required.length + optional
    && required.every(key => Object.hasOwn(body, key))
    && (optional === 0 || anthropicSystemAccepted(body.system))
    && (hasEffort ? isPlainObject(effort) && Object.keys(effort).length === 1 && effortOnMenu(true, effort.effort, reviewed)
      : effortOnMenu(false, undefined, reviewed))
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
 * (exact keys, the row's effort and JSON switches and its reviewed sampling, 1 <= max_tokens <= the row's bound, at most
 * 256 KiB), never a key header, and reserves at that row's price (an Anthropic body carrying the one cache
 * mark: its input at the step's 5-minute cache-write price, 2026-10-12).
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
    // UTF-8 bytes + template allowance; the row's full output bound, including hidden reasoning. A body carrying the
    // cache mark reserves its whole input at the step's cache-write price, as the gate does.
    const reserved = previewReservationNanoUsd(reviewed, Buffer.byteLength(body, "utf8"),
      { cacheWrite: provider === "anthropic" && anthropicBodyAsksCacheWrite(decoded) });
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
 * cools down and retries), never a money stop. Owner ruling R4 (2026-10-11): it is also unbilled
 * (PreviewUnbilledRefusal: a REFUSED row, and the one 60-second resend). Every other refusal, and
 * any body that is not exactly that shape, keeps the per-run money code.
 */
const PREVIEW_DAILY_REFUSALS: ReadonlySet<string> = new Set(["TEAM_DAILY_BUDGET_REACHED", "DAILY_CALL_LIMIT_REACHED"]);
/**
 * Owner ruling 5 (2026-10-10): a call the gate proves never billed (PROVIDER_NOT_REACHED: the
 * connect or TLS handshake failed before a byte was written; PROVIDER_REFUSED_UNBILLED: a vendor
 * 429/529 with no usage and a provably unbilled body) released its hold, so it is the same
 * transient failure as a busy gate: PROVIDER_CALL_FAILED (as PreviewUnbilledRefusal, which
 * withPreviewProviderCallPolicy sends once more after its cooldown), never a money stop. The gate
 * must list both codes as public refusals for them to arrive here. Gate v4 (2026-10-12) adds MODEL_COOLING: the
 * gate refused one busy model's call before reserving or sending anything, which the app reads as the vendor's own
 * unbilled refusal (`PreviewModelCooling`). Review 2026-10-12 adds PROVIDER_ERROR_UNBILLED: the vendor answered with an
 * error that bills nothing but does not say it is busy (Anthropic's 400/404/413/500); the gate counts it toward its
 * five-in-a-row streak, as before gate v4, and the app reads it as the plain `PreviewUnbilledRefusal`, never "busy".
 */
const PREVIEW_TRANSIENT_REFUSALS: ReadonlySet<string> = new Set(["CONCURRENCY_LIMIT_REACHED", "PROVIDER_NOT_REACHED", "PROVIDER_REFUSED_UNBILLED", "PROVIDER_ERROR_UNBILLED", "MODEL_COOLING"]);
function previewAuthorityRefusal(status: number | undefined, row: unknown): TypedDomainError {
  const code = status === 409 && typeof row === "object" && row !== null && !Array.isArray(row)
    ? (row as Record<string, unknown>).error : undefined;
  if (typeof code === "string" && PREVIEW_DAILY_REFUSALS.has(code)) {
    return new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "Private preview team budget for today is used up");
  }
  if (typeof code === "string" && PREVIEW_TRANSIENT_REFUSALS.has(code)) {
    // Owner ruling R4 (2026-10-11): the gate's own concurrency refusal reserved and sent nothing, so it
    // is unbilled like the other two: a REFUSED row no count includes, and the one 60-second resend.
    // R-d (2026-10-12): only the vendor's refusal says the model is busy; the gate's own two never do.
    if (code === "PROVIDER_REFUSED_UNBILLED") return new PreviewVendorRefusedUnbilled();
    // Gate v4: the gate's cool-off for one busy model is the same "this model is busy" as the vendor's refusal.
    if (code === "MODEL_COOLING") return new PreviewModelCooling((row as Record<string, unknown>).retry_after);
    if (code === "PROVIDER_ERROR_UNBILLED") return new PreviewUnbilledRefusal("Private preview vendor answered with an error that was not billed");
    return code === "CONCURRENCY_LIMIT_REACHED"
      ? new PreviewUnbilledRefusal("Private preview gate is at its limit of calls in flight")
      : new PreviewUnbilledRefusal();
  }
  // Gate v4: the gate says outright that it was already halted when the call arrived, before reserving anything.
  if (code === "AUTHORITY_HALTED") return new PreviewGateUnavailable();
  // Slow answer (2026-10-12): the call was sent and failed or ran out of time at the vendor; the gate booked its whole
  // reservation and stays active. A billed transport failure, never money, never unbilled, never "unavailable".
  if (code === PROVIDER_CHARGE_BOOKED_MAX) return new PreviewChargeBookedMax();
  return new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "Private preview authority stopped or refused the request");
}
/**
 * Run resilience (spec docs/superpowers/specs/2026-10-12-preview-run-resilience-design.md, fix (c)) — A HALTED GATE
 * IS UNAVAILABLE, NOT MONEY. On 2026-10-11 the DeepInfra gate halted (its daily unbilled ceiling) and refused the next
 * call PREVIEW_TEST_AUTHORITY_STOPPED, which `previewAuthorityRefusal` reads as the run's money ceiling; the preview
 * has no run money seam (apps/runner/src/main.ts, costEnvelopePolicy is hosted only), so that was a misdiagnosis, and
 * the serve fallback then walked every maker behind the same halted gate. A STOPPED refusal now asks the gate's
 * read-only `/remaining` (preview-remaining.ts, on the same socket): a gate that is not active, or whose window is
 * shut, is UNAVAILABLE. The code is never a spend stop, the call is never resent (it is not an unbilled refusal),
 * and the gateway still records its FAILED row (counted against this maker only, fix (b)). Any other `/remaining`
 * answer, or none, keeps today's mapping. Gate v4 (2026-10-12) made the "gate change, later": a gate that is already
 * halted when a call arrives now says so itself (AUTHORITY_HALTED, found before anything is reserved), which is read
 * as UNAVAILABLE straight away, without asking `/remaining`. STOPPED stays the gate's word for everything else (a halt
 * after the call was reserved, or doubt about whether it was sent), and an older gate that only says STOPPED keeps
 * the `/remaining` read above.
 */
export const PROVIDER_GATE_UNAVAILABLE = "PROVIDER_GATE_UNAVAILABLE" as const;
/**
 * Slow answer (owner ruling 2026-10-12): the gate's public refusal for a call it reserved and SENT whose vendor
 * connection then failed or ran past the gate's deadline (1,200 s). The gate books the call's whole reservation as its
 * charge (ledger state settled_reserved_max) and stays active. Before, it answered PREVIEW_TEST_AUTHORITY_STOPPED,
 * which the app read as the run's money ceiling. It is the app's own sent-and-failed transport failure: the code is
 * PROVIDER_CALL_FAILED (so the gateway records a billed FAILED attempt and the runner cools down and retries as after
 * any transport failure), it is never a ProviderUnbilledRefusal (no REFUSED row, no 60-second resend), never a money
 * code, never gate-unavailable, and no `/remaining` is read for it.
 */
export const PROVIDER_CHARGE_BOOKED_MAX = "PROVIDER_CHARGE_BOOKED_MAX" as const;
export class PreviewChargeBookedMax extends TypedDomainError {
  constructor() { super("PROVIDER_CALL_FAILED", "Private preview vendor call failed after it was sent; the gate booked its full reservation"); }
}
export class PreviewGateUnavailable extends TypedDomainError {
  constructor() { super(PROVIDER_GATE_UNAVAILABLE, "Private preview gate is halted or its window is shut"); }
}
/** The refusal itself, or the gateway's PROVIDER_CALL_FAILED with it as its cause. */
export function providerCallGateUnavailable(error: unknown): boolean {
  const unavailable = (value: unknown): boolean => value instanceof TypedDomainError && value.code === PROVIDER_GATE_UNAVAILABLE;
  return unavailable(error) || (typeof error === "object" && error !== null && unavailable((error as { cause?: unknown }).cause));
}
/** The one refusal that asks `/remaining`: a 409 whose body is exactly {"error": "PREVIEW_TEST_AUTHORITY_STOPPED", …}. */
function previewAuthorityStopped(status: number | undefined, row: unknown): boolean {
  return status === 409 && typeof row === "object" && row !== null && !Array.isArray(row)
    && (row as Record<string, unknown>).error === "PREVIEW_TEST_AUTHORITY_STOPPED";
}
/**
 * Run resilience (spec 2026-10-12, fix (d)): what the runner's per-run sit-out book needs to know of a reviewed ref
 * on the preview — the gate its calls go through and the model it serves. Undefined off the preview, where the
 * runner builds no book (hosted and local unchanged).
 */
export function previewRunResilience(config: PreviewProviderTestConfig | undefined): Readonly<{
  gateOf: (providerRef: string) => string | undefined;
  modelOf: (providerRef: string) => string | undefined;
}> | undefined {
  if (config === undefined) return undefined;
  return Object.freeze({
    gateOf: (providerRef: string) => previewModelRowForRef(providerRef)?.provider,
    modelOf: (providerRef: string) => previewModelRowForRef(providerRef)?.model
  });
}
/** Local IPC only: application principals never receive the provider credential or ledger write access. */
export function createPreviewBudgetRpcPort(
  config: PreviewProviderTestConfig, socketPath: string = config.budget_socket,
  // Fix (c): the same gate's read-only `/remaining`, asked only after a STOPPED refusal.
  remaining: PreviewRemainingPort = createPreviewRemainingRpcPort({ budget_socket: socketPath, scope_id: config.scope_id })
): PreviewBudgetPort {
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
            const refusal = previewAuthorityRefusal(response.statusCode, row);
            if (!previewAuthorityStopped(response.statusCode, row)) { reject(refusal); return; }
            // Fix (c): STOPPED asks whether the gate itself is halted; a failed read keeps today's mapping.
            remaining.remaining(signal).then(
              (gate) => reject(gate.state !== "active" || !gate.windowOpen ? new PreviewGateUnavailable() : refusal),
              () => reject(refusal)
            );
            return;
          }
          resolve({ status: Number(row.status), body: row.body });
        });
      });
      const canceled = () => request.destroy(new Error("Private preview call canceled"));
      signal?.addEventListener("abort", canceled, { once: true });
      if (signal?.aborted) canceled();
      request.on("close", () => signal?.removeEventListener("abort", canceled));
      request.setTimeout(PREVIEW_GATE_IPC_TIMEOUT_MS, () => request.destroy());
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
