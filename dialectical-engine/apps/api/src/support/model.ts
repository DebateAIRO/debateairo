import { TypedDomainError } from "@debateai/kernel";
import {
  assertDeploymentProviderTargets,
  parseProviderDiscoveryTargets,
  resolveProviderTargetCredentials,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import type { DeploymentMode } from "@debateai/register";

const MAX_RELAY_RESPONSE_BYTES = 256 * 1024;
const MAX_COMPLETION_CODE_POINTS = 16_000;
const DEFAULT_RELAY_TIMEOUT_MS = 180_000;
export const SUPPORT_HERMES_PROVIDER_REF = "development:hermes-glm-5.3-flash" as const;
export const SUPPORT_HERMES_MODEL = "z-ai/glm-5.3-flash" as const;

/**
 * V-30 / task 12. The support chat calls ONE model, so its target set has one
 * member and its maker label is a constant. The label exists only so the
 * DEBATE path's own target parser and mode decision can be reused verbatim;
 * no register row reads it, and no panel is composed from it.
 */
const SUPPORT_MODEL_MAKER = "support" as const;

/** One printable header line — a DELIBERATE MIRROR of the rule `@debateai/crypto` enforces on the file. */
const PRINTABLE_HEADER_LINE = /^[\x20-\x7e]+$/u;

/** The relay's inline bearer, pinned exactly as it has always been. */
const RELAY_BEARER_LINE = /^Bearer [^\s]+$/u;

export type SupportModelDeployment = Readonly<{
  mode: DeploymentMode;
  nodeEnv: string | undefined;
}>;

/**
 * The support chat's model target, in the two lawful shapes:
 *
 * - the ratified loopback relay, with its bearer inline (LOCAL mode only —
 *   hosted refuses it, see `parseSupportModelTargetJson`);
 * - a vendor's `https:` API, whose credential is DECLARED as an absolute path
 *   and resolved once, in memory, by `createSupportModelAdapter`. A local user
 *   may instead declare their own key inline, exactly as the debate path lets
 *   them (V-9(c)).
 */
export type SupportModelTarget = Readonly<{
  providerRef: string;
  baseUrl: string;
  model: string;
  authorizationHeader?: string;
  authorizationFile?: string;
}>;

export type SupportModelMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type SupportModelUsage = Readonly<{
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}>;

export interface SupportModelPort {
  complete(input: Readonly<{
    system: string;
    messages: readonly SupportModelMessage[];
    language: "en" | "ro";
    signal?: AbortSignal;
  }>): Promise<Readonly<{ text: string;usage?: SupportModelUsage }>>;
}

export class SupportModelError extends TypedDomainError {
  constructor(code:
    | "SUPPORT_MODEL_UNAVAILABLE"
    | "SUPPORT_MODEL_PATH_NOT_RATIFIED"
    | "SUPPORT_DISABLED"
    // W10 (F1/F2 class member C): a completion the relay cut off at the token
    // bound. It is its OWN name, never UNAVAILABLE: the relay was available and
    // answered, the answer is simply incomplete, and serving its first half as
    // if it were whole is the failure this code exists to stop.
    | "SUPPORT_MODEL_LENGTH_EXCEEDED") {
    super(code,code);
    this.name = "SupportModelError";
  }
}

function unavailable(): never {
  throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
}

/** W10: the completion stopped because it hit the bound, not because it finished. */
function lengthExceeded(): never {
  throw new SupportModelError("SUPPORT_MODEL_LENGTH_EXCEEDED");
}

function notRatified(): never {
  throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
}

function decodeTargetRow(source: string): Readonly<Record<string,unknown>> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    notRatified();
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)
    || Object.getPrototypeOf(decoded) !== Object.prototype) {
    notRatified();
  }
  return decoded as Readonly<Record<string,unknown>>;
}

/**
 * The relay target, pinned exactly as it has always been: the one ratified
 * loopback Hermes GLM relay, its bearer inline. Byte-for-byte the checks this
 * function has always made — it returns `undefined` instead of throwing only so
 * that a row which is not this shape can be tried as a vendor API below.
 */
function ratifiedRelayTarget(
  row: Readonly<Record<string,unknown>>
): ProviderDiscoveryTarget | undefined {
  if (Object.keys(row).sort().join("\0")
    !== ["provider_ref","base_url","model","authorization_header"].sort().join("\0")) {
    return undefined;
  }
  if (row.provider_ref !== SUPPORT_HERMES_PROVIDER_REF
    || row.model !== SUPPORT_HERMES_MODEL
    || typeof row.base_url !== "string"
    || typeof row.authorization_header !== "string") {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(row.base_url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.port !== "8794"
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || url.pathname.replace(/\/+$/u,"") !== "/v1"
    || !RELAY_BEARER_LINE.test(row.authorization_header)) {
    return undefined;
  }
  return Object.freeze({
    providerRef: SUPPORT_HERMES_PROVIDER_REF,
    maker: SUPPORT_MODEL_MAKER,
    baseUrl: url.toString().replace(/\/$/u,""),
    model: SUPPORT_HERMES_MODEL,
    authorizationHeader: row.authorization_header
  });
}

/**
 * A vendor's own API, read by the DEBATE path's target parser over this one
 * row — the member set, the URL shape, the "a credential is named ONE way" rule
 * and the absolute-path rule are read from one place and cannot drift for
 * support. The raw source text is wrapped in an array rather than re-serialised,
 * so the bytes that are validated are the bytes the operator wrote.
 *
 * Two support-side rules on top: the endpoint is `https:` (the paid API path
 * V-9(c) names; a loopback model server is not admitted here), and a credential
 * must be declared — a support chat with no way to authenticate is a start-up
 * mistake, not a runtime surprise.
 */
function apiVendorTarget(
  row: Readonly<Record<string,unknown>>,
  source: string
): ProviderDiscoveryTarget | undefined {
  if (typeof row.provider_ref !== "string" || row.provider_ref.trim() === "") return undefined;
  let parsed: readonly ProviderDiscoveryTarget[];
  try {
    parsed = parseProviderDiscoveryTargets(`[${source}]`, [
      { providerRef: row.provider_ref, maker: SUPPORT_MODEL_MAKER }
    ]);
  } catch {
    return undefined;
  }
  const target = parsed[0];
  if (target === undefined) return undefined;
  if (new URL(target.baseUrl).protocol !== "https:") return undefined;
  if (target.authorizationHeader === undefined && target.authorizationFile === undefined) {
    return undefined;
  }
  return target;
}

/** The target as the support chat carries it: the maker label never leaves this module. */
function supportTarget(target: ProviderDiscoveryTarget): SupportModelTarget {
  return Object.freeze({
    providerRef: target.providerRef,
    baseUrl: target.baseUrl,
    model: target.model,
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader }),
    ...(target.authorizationFile === undefined
      ? {} : { authorizationFile: target.authorizationFile })
  });
}

function providerView(target: SupportModelTarget): ProviderDiscoveryTarget {
  return Object.freeze({ ...target, maker: SUPPORT_MODEL_MAKER });
}

/**
 * V-30(1) / task 12. The support chat's model is CONFIGURATION, decided by the
 * same mode decision the debate path takes (`assertDeploymentProviderTargets`,
 * task 10) — never by a second copy of it:
 *
 * - HOSTED refuses a relay target for support exactly as it refuses one for
 *   debates, with the same typed codes and at start-up:
 *   `PROVIDER_BASE_URL_TLS_REQUIRED:`, `PROVIDER_TARGET_LOOPBACK_REFUSED:` and
 *   `PROVIDER_INLINE_CREDENTIAL_REFUSED:`, each naming the provider ref and
 *   nothing of the credential;
 * - LOCAL keeps today's relay path unchanged (the relays ARE the local
 *   deployment, V-9(c)) and additionally admits the user's own `https:` API.
 *
 * A row that is neither lawful shape keeps this module's own refusal,
 * `SUPPORT_MODEL_PATH_NOT_RATIFIED`.
 */
export function parseSupportModelTargetJson(
  source: string,
  deployment: SupportModelDeployment
): SupportModelTarget {
  const row = decodeTargetRow(source);
  const target = ratifiedRelayTarget(row) ?? apiVendorTarget(row, source) ?? notRatified();
  assertDeploymentProviderTargets([target], deployment);
  return supportTarget(target);
}

function validMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readUsage(value: unknown): SupportModelUsage | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const row = value as Readonly<Record<string, unknown>>;
  const inputTokens = row.prompt_tokens;
  const outputTokens = row.completion_tokens;
  // V-30: the money a call cost travels under two names. `cost_usd` is what the
  // relay reports; `x_cost_usd` is the OpenAI-compatible extension the debate
  // gateway already reads from vendors (`usageSchema`, @debateai/providers), and
  // the support spend accounting (migration 0054's `cost_usd` column) is the
  // same column either way. A vendor that reports neither still reports tokens.
  const costUsd = row.cost_usd ?? row.x_cost_usd;
  const usage: {
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
  } = {};
  if (validMetric(inputTokens)) usage.input_tokens = inputTokens;
  if (validMetric(outputTokens)) usage.output_tokens = outputTokens;
  if (validMetric(costUsd)) usage.cost_usd = costUsd;
  return Object.keys(usage).length === 0 ? undefined : Object.freeze(usage);
}

async function readBoundedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const raw = await response.text();
    if (Buffer.byteLength(raw,"utf8") > MAX_RELAY_RESPONSE_BYTES) unavailable();
    return raw;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RELAY_RESPONSE_BYTES) {
        await reader.cancel("SUPPORT_RELAY_RESPONSE_TOO_LARGE");
        unavailable();
      }
      chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks,total).toString("utf8");
  } finally {
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

export type SupportModelAdapterInput = Readonly<{
  baseUrl: string;
  authorizationHeader: string;
  model: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}>;

/**
 * What a transport accepts, and nothing else about it. The two shipped
 * transports differ ONLY here; everything below — the bounded body, the bounded
 * response, the truncation check, the usage read — is one implementation.
 */
type SupportTransportPolicy = Readonly<{
  acceptsUrl(url: URL): boolean;
  acceptsHeader(value: string): boolean;
}>;

/** Today's relay rule, unchanged: cleartext loopback, any port, a bearer. */
const RELAY_TRANSPORT: SupportTransportPolicy = Object.freeze({
  acceptsUrl: (url: URL) => url.protocol === "http:" && url.hostname === "127.0.0.1",
  acceptsHeader: (value: string) => RELAY_BEARER_LINE.test(value)
});

/**
 * The paid vendor API: TLS only, and any single printable header line — the
 * scheme word is the vendor's business, and the custody reader has already
 * enforced the same shape on the file's contents.
 */
const API_TRANSPORT: SupportTransportPolicy = Object.freeze({
  acceptsUrl: (url: URL) => url.protocol === "https:",
  acceptsHeader: (value: string) => PRINTABLE_HEADER_LINE.test(value) && value === value.trim()
});

class SupportChatCompletionsAdapter implements SupportModelPort {
  readonly #baseUrl: string;
  readonly #authorizationHeader: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(input: SupportModelAdapterInput, transport: SupportTransportPolicy) {
    let url: URL;
    try {
      url = new URL(input.baseUrl);
    } catch {
      throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_RELAY_TIMEOUT_MS;
    if (!transport.acceptsUrl(url)
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || url.pathname.replace(/\/+$/u,"") !== "/v1"
      || !transport.acceptsHeader(input.authorizationHeader)
      || input.model.trim() === ""
      || input.model !== input.model.trim()
      || !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 1
      || timeoutMs > DEFAULT_RELAY_TIMEOUT_MS) {
      throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
    this.#baseUrl = url.toString().replace(/\/$/u,"");
    this.#authorizationHeader = input.authorizationHeader;
    this.#model = input.model;
    this.#timeoutMs = timeoutMs;
    this.#fetch = input.fetchImplementation ?? fetch;
  }

  async complete(input: Parameters<SupportModelPort["complete"]>[0]) {
    try {
      const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
      const signal = input.signal === undefined
        ? timeoutSignal : AbortSignal.any([input.signal,timeoutSignal]);
      const response = await this.#fetch(`${this.#baseUrl}/chat/completions`,{
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: this.#authorizationHeader
        },
        signal,
        body: JSON.stringify({
          model: this.#model,
          stream: false,
          messages: [
            { role: "system",content: input.system },
            ...input.messages
          ]
        })
      });
      if (!response.ok) unavailable();
      const raw = await readBoundedResponse(response);
      const decoded = JSON.parse(raw) as Readonly<Record<string, unknown>>;
      const choices = decoded.choices;
      const first = Array.isArray(choices) ? choices[0] : undefined;
      const message = typeof first === "object" && first !== null
        ? (first as Readonly<Record<string, unknown>>).message : undefined;
      const content = typeof message === "object" && message !== null
        ? (message as Readonly<Record<string, unknown>>).content : undefined;
      // W10: read BEFORE the content checks. A truncated answer is a non-empty
      // string of the right length, so every check below passes and the fragment
      // is served as a complete answer. This adapter also sends no `max_tokens`,
      // so the cap that produces it is the relay's own and invisible from here —
      // the finish reason is the only signal that it happened.
      const finishReason = typeof first === "object" && first !== null
        ? (first as Readonly<Record<string, unknown>>).finish_reason : undefined;
      if (finishReason === "length") lengthExceeded();
      if (typeof content !== "string"
        || content.trim() === ""
        || [...content].length > MAX_COMPLETION_CODE_POINTS) unavailable();
      const usage = readUsage(decoded.usage);
      return Object.freeze({
        text: content.trim(),
        ...(usage === undefined ? {} : { usage })
      });
    } catch (error) {
      if (error instanceof SupportModelError) throw error;
      unavailable();
    }
  }
}

/** Today's local-mode transport: the ratified loopback relay, unchanged. */
export class RelayAdapter extends SupportChatCompletionsAdapter {
  constructor(input: SupportModelAdapterInput) {
    super(input,RELAY_TRANSPORT);
  }
}

/**
 * V-30(1) / task 12: the paid vendor API — the ONLY transport the hosted
 * deployment can reach a support model through. It supersedes the dormant
 * `KeyBasedAdapter` seam, which existed to refuse this path until it was ruled.
 */
export class ApiVendorAdapter extends SupportChatCompletionsAdapter {
  constructor(input: SupportModelAdapterInput) {
    super(input,API_TRANSPORT);
  }
}

/**
 * The one place a parsed support target becomes a live transport.
 *
 * A declared credential FILE is resolved through task 10b's loader
 * (`resolveProviderTargetCredentials` over `readCustodyAuthorizationHeader`),
 * so the support chat reads a vendor key under exactly the custody contract
 * every other secret file obeys, and its refusals name the provider ref and a
 * code from a closed set — never the path, never a byte of the credential. The
 * resolved header is held in a private field of the adapter and appears in no
 * property, no serialisation and no log line.
 */
export function createSupportModelAdapter(
  target: SupportModelTarget,
  options: Readonly<{
    readAuthorizationHeader: (path: string) => string;
    timeoutMs?: number;
    fetchImplementation?: typeof fetch;
  }>
): SupportModelPort {
  const authorizationHeader = target.authorizationFile === undefined
    ? target.authorizationHeader
    : resolveProviderTargetCredentials(
      [providerView(target)],options.readAuthorizationHeader
    )[0]?.authorizationHeader;
  if (authorizationHeader === undefined) notRatified();
  const input: SupportModelAdapterInput = {
    baseUrl: target.baseUrl,
    authorizationHeader,
    model: target.model,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.fetchImplementation === undefined
      ? {} : { fetchImplementation: options.fetchImplementation })
  };
  // The transport follows the target's own protocol, which the parse and the
  // mode decision above have already ruled lawful for this deployment.
  return new URL(target.baseUrl).protocol === "https:"
    ? new ApiVendorAdapter(input) : new RelayAdapter(input);
}
