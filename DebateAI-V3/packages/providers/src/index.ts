import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";

export const MODEL_ROLES = ["JUDGE", "COMPOSER", "CONFORMANCE"] as const;
export type TypedRole = typeof MODEL_ROLES[number];
export type Lane = "served" | "uniform-panel" | "critic-exempt";

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

const responseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
    x_cost_usd: z.number().nonnegative().optional()
  }).passthrough().nullable().optional(),
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
        const response = await fetcher(`${this.#options.endpoint}/chat/completions`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(request.bound.deadlineMs),
          body: JSON.stringify({
            model: this.#options.model,
            max_tokens: request.bound.tokenCeiling,
            messages: attemptPacket.messages
          })
        });
        const rawText = await response.text();
        let decoded: unknown;
        try {
          decoded = JSON.parse(rawText);
        } catch {
          decoded = null;
        }
        const candidate = z.object({ id: z.string(), model: z.string() }).passthrough().safeParse(decoded);
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
            usage: strict.success ? strict.data.usage ?? null : null
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText)
        });
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
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
      request.bound.maxAttempts,
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
