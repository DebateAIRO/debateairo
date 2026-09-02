import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const MODEL_ROLES = ["JUDGE", "COMPOSER", "CONFORMANCE", "CLASSIFIER"] as const;
export type TypedRole = typeof MODEL_ROLES[number];
export type Lane = "served" | "uniform-panel" | "critic-exempt" | "evaluator";

export interface CallBound {
  readonly maxAttempts: number;
  readonly tokenCeiling: number;
  readonly deadlineMs: number;
}

export interface PromptPacket {
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}

export type ContentClassification =
  | { readonly parseStatus: "PARSED"; readonly parseError: null }
  | { readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED"; readonly parseError: string };

export interface RejectedProviderContent {
  readonly rawText: string;
  readonly parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError: string;
}

export interface ProviderCallRequest {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly role: TypedRole;
  readonly lane: Lane;
  readonly bound: CallBound;
  readonly contractHash: string;
  readonly providerRef: string;
  readonly packet: PromptPacket;
  readonly classifyContent?: (content: string) => ContentClassification;
  readonly buildRepairPacket?: (rejected: RejectedProviderContent) => PromptPacket;
}

export class ProviderCallFailedError extends TypedDomainError {
  override readonly code = "PROVIDER_CALL_FAILED";
  override readonly cause: unknown;

  constructor(
    cause: unknown,
    readonly attempts: number,
    readonly lastOutcome: "TIMED_OUT" | "FAILED",
    readonly lastLedgerEntryRef: string
  ) {
    super("PROVIDER_CALL_FAILED", "PROVIDER_CALL_FAILED");
    this.name = "ProviderCallFailedError";
    this.cause = cause;
  }
}

export class ProviderContentUnacceptedError extends TypedDomainError {
  override readonly code = "PROVIDER_CONTENT_UNACCEPTED";

  constructor(
    readonly attempts: number,
    readonly lastParseStatus: "PARSE_FAILED" | "SCHEMA_FAILED",
    readonly lastParseError: string,
    readonly lastRawArtifactRef: string,
    readonly lastLedgerEntryRef: string
  ) {
    super("PROVIDER_CONTENT_UNACCEPTED", lastParseError);
    this.name = "ProviderContentUnacceptedError";
  }
}

export interface ProviderCallResult {
  readonly rawArtifactRef: string;
  readonly ledgerEntryRef: string;
  readonly content: string;
  readonly provider: "openai-compatible-http";
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string;
}

export interface ProviderGateway {
  call(request: ProviderCallRequest): Promise<ProviderCallResult>;
}

const MAX_PROVIDER_TARGETS = 32;
const MAX_PROVIDER_TARGET_CONFIG_BYTES = 64 * 1024;

export type ProviderDiscoveryTarget = Readonly<{
  providerRef: string;
  maker: string;
  baseUrl: string;
  model: string;
  authorizationHeader?: string;
}>;

function requiredProviderTargetText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    throw new TypeError(code);
  }
  return value;
}

function normalizedProviderBaseUrl(value: unknown): string {
  const source = requiredProviderTargetText(
    value,
    "PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID"
  );
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== "") {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  if (!parsed.pathname.endsWith("/v1")) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID");
  }
  return parsed.toString().replace(/\/$/u, "");
}

export function parseProviderDiscoveryTargets(
  source: string,
  configuredProviders: readonly Readonly<{ providerRef: string; maker: string }>[]
): readonly ProviderDiscoveryTarget[] {
  if (Buffer.byteLength(source, "utf8") > MAX_PROVIDER_TARGET_CONFIG_BYTES) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  if (!Array.isArray(decoded) || decoded.length < 1 || decoded.length > MAX_PROVIDER_TARGETS) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
  }
  const configuredByRef = new Map<string, string>();
  for (const configured of configuredProviders) {
    const providerRef = requiredProviderTargetText(
      configured.providerRef,
      "CONFIGURED_PROVIDER_INVALID"
    );
    const maker = requiredProviderTargetText(configured.maker, "CONFIGURED_PROVIDER_INVALID");
    if (configuredByRef.has(providerRef)) throw new TypeError("CONFIGURED_PROVIDER_DUPLICATE");
    configuredByRef.set(providerRef, maker);
  }
  const targetsByRef = new Map<string, ProviderDiscoveryTarget>();
  for (const candidate of decoded) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    const row = candidate as Readonly<Record<string, unknown>>;
    if (Object.keys(row).some((key) => ![
      "provider_ref", "base_url", "model", "authorization_header"
    ].includes(key))) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGETS_INVALID");
    }
    const providerRef = requiredProviderTargetText(
      row.provider_ref,
      "PROVIDER_DISCOVERY_TARGET_PROVIDER_REF_INVALID"
    );
    if (targetsByRef.has(providerRef)) {
      throw new TypeError("PROVIDER_DISCOVERY_TARGET_DUPLICATE");
    }
    const maker = configuredByRef.get(providerRef);
    if (maker === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    const authorizationHeader = row.authorization_header === undefined
      ? undefined
      : requiredProviderTargetText(
          row.authorization_header,
          "PROVIDER_DISCOVERY_AUTHORIZATION_INVALID"
        );
    targetsByRef.set(providerRef, Object.freeze({
      providerRef,
      maker,
      baseUrl: normalizedProviderBaseUrl(row.base_url),
      model: requiredProviderTargetText(row.model, "PROVIDER_DISCOVERY_TARGET_MODEL_INVALID"),
      ...(authorizationHeader === undefined ? {} : { authorizationHeader })
    }));
  }
  if (targetsByRef.size !== configuredByRef.size) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
  }
  return Object.freeze([...configuredByRef.keys()].map((providerRef) => {
    const target = targetsByRef.get(providerRef);
    if (target === undefined) throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    return target;
  }));
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/**
 * L4-F7: in production a cleartext `http:` base URL may only point at a loopback relay; any
 * other `http:` target would carry the bearer `authorization_header` and every prompt off-box
 * unencrypted. `https:` targets and non-production environments are untouched.
 */
export function assertProductionProviderTargets(
  targets: readonly ProviderDiscoveryTarget[],
  nodeEnv: string | undefined
): void {
  if (nodeEnv !== "production") return;
  for (const target of targets) {
    const parsed = new URL(target.baseUrl);
    if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new TypeError(`PROVIDER_BASE_URL_TLS_REQUIRED:${target.providerRef}`);
    }
  }
}

export interface ProviderAdapterRegistration {
  readonly providerRef: string;
  readonly adapterKind: string;
  readonly maker: string;
}

export const BUILT_IN_PROVIDER_ADAPTERS = Object.freeze([
  Object.freeze({ adapterKind: "openai-compatible-http", implementation: "OpenAICompatibleProviderGateway" }),
  Object.freeze({ adapterKind: "vllm-openai-compatible-http", implementation: "VllmOpenAICompatibleProviderGateway" })
] as const);

export function selectProviderAdapter(
  providerRef: string,
  configured: readonly ProviderAdapterRegistration[]
): ProviderAdapterRegistration {
  const selected = configured.find((candidate) => candidate.providerRef === providerRef);
  if (selected === undefined) throw new TypeError(`Configured provider is unresolved: ${providerRef}`);
  if (selected.maker.trim().length === 0 || selected.adapterKind.trim().length === 0) {
    throw new TypeError(`Configured provider has incomplete adapter metadata: ${providerRef}`);
  }
  return Object.freeze({ ...selected });
}

export interface RawArtifactInput {
  readonly artifactId: string;
  readonly attemptId: string;
  readonly runId: string | null;
  readonly providerRef: string;
  readonly provider: "openai-compatible-http";
  readonly model: string;
  readonly maker: string;
  readonly modelVersion: string | null;
  readonly rawText: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly parseStatus: "PARSED" | "UNPARSED" | "PARSE_FAILED" | "SCHEMA_FAILED";
  readonly parseError?: string | null;
  readonly inputHash: string;
  readonly contractHash: string;
  readonly contentHash: string;
}

export interface ProviderLedgerInput {
  readonly runId: string | null;
  readonly attemptId: string;
  readonly actionKind: "MODEL_CALL";
  readonly callSiteKey: string;
  readonly subjectItemId: string;
  readonly stanceAtAction: "UNASSIGNED";
  readonly outcome: "OK" | "FAILED" | "TIMED_OUT";
  readonly inputHash: string;
  readonly contractHash: string;
  readonly actorRef: string;
  readonly rawArtifactRef: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

export interface OpenAICompatibleGatewayOptions {
  readonly endpoint: string;
  readonly model: string;
  readonly maker: string;
  readonly authorizationHeader?: string;
  readonly persistRawArtifact: (artifact: RawArtifactInput) => Promise<string>;
  readonly appendLedgerEntry: (entry: ProviderLedgerInput) => Promise<string>;
  readonly assertNoOpenWriteTransaction: () => void;
  readonly fetchImplementation?: typeof fetch;
}

/** L4-F3: a provider body is streamed and abandoned past this many bytes; nothing of it is persisted. */
const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;
/**
 * L4-F2: the serialised request packet is bounded before it is sent. The structural ceiling counts
 * attempts, not tokens, so an unbounded packet turns one ask into unbounded model spend. An
 * oversized packet is a refused attempt — recorded, never sent, never retried.
 */
const MAX_PROVIDER_REQUEST_PACKET_BYTES = 256 * 1024;
const MAX_PROVIDER_MODEL_CHARS = 256;
const MAX_USAGE_COUNTER = 2 ** 31 - 1;

const usageCounter = z.number().int().min(0).max(MAX_USAGE_COUNTER);
const usageSchema = z.object({
  prompt_tokens: usageCounter.optional(),
  completion_tokens: usageCounter.optional(),
  total_tokens: usageCounter.optional(),
  x_cost_usd: z.number().nonnegative().optional()
}).strict();

const modelIdSchema = z.string().min(1).max(MAX_PROVIDER_MODEL_CHARS);

const responseSchema = z.object({
  id: z.string().min(1),
  model: modelIdSchema,
  usage: usageSchema.nullable().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() })
  })).min(1)
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentParseStatus(content: string): "PARSED" | "UNPARSED" {
  try {
    JSON.parse(content);
    return "PARSED";
  } catch {
    return "UNPARSED";
  }
}

/** Reads the body through its stream and cancels it the moment the cap is crossed (L4-F3). */
async function readBoundedResponseText(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_PROVIDER_RESPONSE_BYTES) {
        const refusal = new TypedDomainError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          `Provider response body exceeded ${MAX_PROVIDER_RESPONSE_BYTES} bytes`
        );
        await reader.cancel(refusal);
        throw refusal;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Typed refusals for an over-long model id or a usage block outside the four bounded fields (L4-F3). */
function assertBoundedProviderResponse(decoded: unknown): void {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return;
  const row = decoded as Readonly<Record<string, unknown>>;
  if (typeof row.model === "string" && !modelIdSchema.safeParse(row.model).success) {
    throw new TypedDomainError(
      "PROVIDER_MODEL_INVALID",
      `Provider model id must be 1..${MAX_PROVIDER_MODEL_CHARS} characters`
    );
  }
  if (row.usage !== undefined && row.usage !== null && !usageSchema.safeParse(row.usage).success) {
    throw new TypedDomainError(
      "PROVIDER_USAGE_INVALID",
      "Provider usage may carry only bounded prompt_tokens, completion_tokens, total_tokens and x_cost_usd"
    );
  }
}

export class OpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #options: OpenAICompatibleGatewayOptions;

  constructor(options: OpenAICompatibleGatewayOptions) {
    this.#options = options;
  }

  async call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    this.#options.assertNoOpenWriteTransaction();
    if (!Number.isInteger(request.bound.maxAttempts) || request.bound.maxAttempts < 1) {
      throw new TypeError("CallBound.maxAttempts must be a positive integer");
    }
    const fetcher = this.#options.fetchImplementation ?? fetch;
    let attemptsMade = 0;
    let packetRefused = false;
    let lastError: unknown;
    let lastOutcome: "TIMED_OUT" | "FAILED" = "FAILED";
    let lastLedgerEntryRef = "PROVIDER_LEDGER_ENTRY_UNRESOLVED";
    let attemptPacket = request.packet;
    let lastContentRejection: {
      attempts: number;
      parseStatus: "PARSE_FAILED" | "SCHEMA_FAILED";
      parseError: string;
      rawArtifactRef: string;
      ledgerEntryRef: string;
    } | null = null;

    for (let attempt = 1; attempt <= request.bound.maxAttempts; attempt += 1) {
      attemptsMade = attempt;
      const inputHash = digest(JSON.stringify(attemptPacket));
      const attemptId = randomUUID();
      const startedAt = new Date();
      let rawArtifactRef: string | null = null;
      let ledgerRecorded = false;
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (this.#options.authorizationHeader !== undefined) {
          headers.authorization = this.#options.authorizationHeader;
        }
        const body = JSON.stringify({
          model: this.#options.model,
          max_tokens: request.bound.tokenCeiling,
          messages: attemptPacket.messages
        });
        if (Buffer.byteLength(body, "utf8") > MAX_PROVIDER_REQUEST_PACKET_BYTES) {
          packetRefused = true;
          throw new TypedDomainError(
            "PROVIDER_PACKET_TOO_LARGE",
            `Provider request packet exceeded ${MAX_PROVIDER_REQUEST_PACKET_BYTES} bytes`
          );
        }
        const response = await fetcher(`${this.#options.endpoint}/chat/completions`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(request.bound.deadlineMs),
          body
        });
        const rawText = await readBoundedResponseText(response);
        let decoded: unknown;
        try {
          decoded = JSON.parse(rawText);
        } catch {
          decoded = null;
        }
        const candidate = z.object({ id: z.string(), model: modelIdSchema }).passthrough().safeParse(decoded);
        const observedUsage = z.object({ usage: usageSchema.nullable().optional() })
          .passthrough().safeParse(decoded);
        const strict = responseSchema.safeParse(decoded);
        const content = strict.success ? strict.data.choices[0]!.message.content : null;
        let classifiedContent: ContentClassification | {
          readonly parseStatus: "UNPARSED";
          readonly parseError: null;
        };
        try {
          classifiedContent = content === null
            ? { parseStatus: "UNPARSED", parseError: null }
            : request.classifyContent?.(content) ?? {
                parseStatus: contentParseStatus(content),
                parseError: null
              };
        } catch (error) {
          classifiedContent = {
            parseStatus: "SCHEMA_FAILED",
            parseError: error instanceof Error ? error.message : String(error)
          };
        }
        rawArtifactRef = await this.#options.persistRawArtifact({
          artifactId: randomUUID(),
          attemptId,
          runId: request.runId,
          providerRef: request.providerRef,
          provider: "openai-compatible-http",
          model: candidate.success ? candidate.data.model : this.#options.model,
          maker: this.#options.maker,
          modelVersion: candidate.success ? candidate.data.model : null,
          rawText,
          metadata: {
            status: response.status,
            attempt,
            usage: observedUsage.success ? observedUsage.data.usage ?? null : null
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText)
        });
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
        assertBoundedProviderResponse(decoded);
        const responseJson = responseSchema.parse(decoded);
        if (
          request.classifyContent !== undefined
          && (classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED")
        ) {
          const ledgerEntryRef = await this.#options.appendLedgerEntry({
            attemptId,
            runId: request.runId,
            actionKind: "MODEL_CALL",
            callSiteKey: request.callSiteKey,
            subjectItemId: request.subjectItemId,
            stanceAtAction: "UNASSIGNED",
            outcome: "FAILED",
            inputHash,
            contractHash: request.contractHash,
            actorRef: request.providerRef,
            rawArtifactRef,
            startedAt,
            finishedAt: new Date()
          });
          ledgerRecorded = true;
          lastContentRejection = {
            attempts: attempt,
            parseStatus: classifiedContent.parseStatus,
            parseError: classifiedContent.parseError,
            rawArtifactRef,
            ledgerEntryRef
          };
          if (attempt < request.bound.maxAttempts && request.buildRepairPacket !== undefined) {
            attemptPacket = request.buildRepairPacket({
              rawText: responseJson.choices[0]!.message.content,
              parseStatus: classifiedContent.parseStatus,
              parseError: classifiedContent.parseError
            });
          }
          continue;
        }
        lastContentRejection = null;
        const ledgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: "OK",
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
        });
        ledgerRecorded = true;
        return {
          rawArtifactRef,
          ledgerEntryRef,
          content: responseJson.choices[0]!.message.content,
          provider: "openai-compatible-http",
          model: responseJson.model,
          maker: this.#options.maker,
          modelVersion: responseJson.model
        };
      } catch (error) {
        lastContentRejection = null;
        lastError = error;
        if (!ledgerRecorded) {
          lastOutcome = error instanceof DOMException && error.name === "TimeoutError" ? "TIMED_OUT" : "FAILED";
          lastLedgerEntryRef = await this.#options.appendLedgerEntry({
          attemptId,
          runId: request.runId,
          actionKind: "MODEL_CALL",
          callSiteKey: request.callSiteKey,
          subjectItemId: request.subjectItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: lastOutcome,
          inputHash,
          contractHash: request.contractHash,
          actorRef: request.providerRef,
          rawArtifactRef,
          startedAt,
          finishedAt: new Date()
          });
        }
      }
      // L4-F2: an oversized packet is deterministic — resending it would burn the ceiling for
      // an identical refusal, so the loop stops on the attempt that refused it.
      if (packetRefused) break;
    }
    if (lastContentRejection !== null) {
      throw new ProviderContentUnacceptedError(
        lastContentRejection.attempts,
        lastContentRejection.parseStatus,
        lastContentRejection.parseError,
        lastContentRejection.rawArtifactRef,
        lastContentRejection.ledgerEntryRef
      );
    }
    throw new ProviderCallFailedError(
      lastError,
      attemptsMade,
      lastOutcome,
      lastLedgerEntryRef
    );
  }
}

export class VllmOpenAICompatibleProviderGateway implements ProviderGateway {
  readonly #delegate: OpenAICompatibleProviderGateway;

  constructor(options: OpenAICompatibleGatewayOptions) {
    this.#delegate = new OpenAICompatibleProviderGateway(options);
  }

  call(request: ProviderCallRequest): Promise<ProviderCallResult> {
    return this.#delegate.call(request);
  }
}
