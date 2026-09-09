import { TypedDomainError } from "@debateai/kernel";

const MAX_RELAY_RESPONSE_BYTES = 256 * 1024;
const MAX_COMPLETION_CODE_POINTS = 16_000;
const DEFAULT_RELAY_TIMEOUT_MS = 180_000;
export const SUPPORT_HERMES_PROVIDER_REF = "development:hermes-glm-5.3-flash" as const;
export const SUPPORT_HERMES_MODEL = "z-ai/glm-5.3-flash" as const;

export type SupportModelTarget = Readonly<{
  providerRef: typeof SUPPORT_HERMES_PROVIDER_REF;
  baseUrl: string;
  model: typeof SUPPORT_HERMES_MODEL;
  authorizationHeader: string;
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
  constructor(code: "SUPPORT_MODEL_UNAVAILABLE" | "SUPPORT_MODEL_PATH_NOT_RATIFIED" | "SUPPORT_DISABLED") {
    super(code,code);
    this.name = "SupportModelError";
  }
}

function unavailable(): never {
  throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
}

export function parseSupportModelTargetJson(source: string): SupportModelTarget {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)
    || Object.getPrototypeOf(decoded) !== Object.prototype
    || Object.keys(decoded).sort().join("\0")
      !== ["provider_ref","base_url","model","authorization_header"].sort().join("\0")) {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
  const row = decoded as Readonly<Record<string,unknown>>;
  if (row.provider_ref !== SUPPORT_HERMES_PROVIDER_REF
    || row.model !== SUPPORT_HERMES_MODEL
    || typeof row.base_url !== "string"
    || typeof row.authorization_header !== "string") {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
  let url: URL;
  try {
    url = new URL(row.base_url);
  } catch {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
  if (url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.port !== "8794"
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || url.pathname.replace(/\/+$/u,"") !== "/v1"
    || !/^Bearer [^\s]+$/u.test(row.authorization_header)) {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
  return Object.freeze({
    providerRef: SUPPORT_HERMES_PROVIDER_REF,
    baseUrl: url.toString().replace(/\/$/u,""),
    model: SUPPORT_HERMES_MODEL,
    authorizationHeader: row.authorization_header
  });
}

function validMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readUsage(value: unknown): SupportModelUsage | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const row = value as Readonly<Record<string, unknown>>;
  const inputTokens = row.prompt_tokens;
  const outputTokens = row.completion_tokens;
  const costUsd = row.cost_usd;
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

export class RelayAdapter implements SupportModelPort {
  readonly #baseUrl: string;
  readonly #authorizationHeader: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(input: Readonly<{
    baseUrl: string;
    authorizationHeader: string;
    model: string;
    timeoutMs?: number;
    fetchImplementation?: typeof fetch;
  }>) {
    let url: URL;
    try {
      url = new URL(input.baseUrl);
    } catch {
      throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_RELAY_TIMEOUT_MS;
    if (url.protocol !== "http:"
      || url.hostname !== "127.0.0.1"
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || url.pathname.replace(/\/+$/u,"") !== "/v1"
      || !/^Bearer [^\s]+$/u.test(input.authorizationHeader)
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

export class KeyBasedAdapter implements SupportModelPort {
  async complete(_input: Parameters<SupportModelPort["complete"]>[0]): Promise<never> {
    throw new SupportModelError("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  }
}
