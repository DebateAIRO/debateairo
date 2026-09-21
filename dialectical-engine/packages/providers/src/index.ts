import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import {
  declaredRef,
  emit,
  getObsContext,
  runWithObsContext,
} from "@debateai/obs-capture";

// T9 (goal 232-235): SYNTHESIZER and EVALUATOR are NAMED PROVIDER ROLES,
// not organ aliases. A debater's model may hold either role; the CALL is
// fresh-context, and the ledger records which role made it under its own
// name rather than under COMPOSER/CONFORMANCE, which mean other things.
export const MODEL_ROLES = [
  "JUDGE", "COMPOSER", "CONFORMANCE", "CLASSIFIER", "SYNTHESIZER", "EVALUATOR"
] as const;
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

/**
 * W10/1 (`board/W10-call-budget-truthfulness.md`, audit
 * `audits/token-budget-reasoning.md`): the OpenAI-compatible completion that
 * was cut off at `max_tokens` reports it, and until this row existed nobody
 * read it. A truncated body fails the contract classifier exactly as bad JSON
 * does, so the two were recorded under one name and a length failure looked
 * like a model that cannot follow a schema.
 */
export const PROVIDER_FINISH_REASON_LENGTH = "length" as const;
export const PROVIDER_CONTENT_LENGTH_EXCEEDED = "LENGTH_EXCEEDED" as const;

/**
 * How a provider's content was REFUSED. `LENGTH_EXCEEDED` is its own member and
 * is never collapsed into `PARSE_FAILED`.
 *
 * It is deliberately NOT a `raw_artifact.parse_status` value: that column's
 * CHECK constraint seals four names (`migrations/0004_s04.sql:14-21`) and the
 * erasure-redaction constraint pins their `parse_error` pairs
 * (`migrations/0040_account_erasure.sql:338-340`). Widening the column is a
 * migration this ticket does not own, so the truncation travels on the typed
 * refusal and in the artifact's unconstrained `metadata.finish_reason`.
 */
export type ProviderContentRejectionStatus =
  | "PARSE_FAILED"
  | "SCHEMA_FAILED"
  | typeof PROVIDER_CONTENT_LENGTH_EXCEEDED;

export interface RejectedProviderContent {
  readonly rawText: string;
  readonly parseStatus: ProviderContentRejectionStatus;
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
    readonly lastParseStatus: ProviderContentRejectionStatus,
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

const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
  x_cost_usd: z.number().nonnegative().optional()
}).passthrough();

const responseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  usage: usageSchema.nullable().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
    // W10/1: carried, never required — a provider that omits it is still a
    // lawful response, and its absence is recorded as absent rather than as
    // "not truncated".
    finish_reason: z.string().nullable().optional()
  })).min(1)
});

/**
 * W10/1: the finish reason read LENIENTLY, off the decoded body, so a response
 * the strict schema rejects still records why it was cut off. The strict parse
 * happens later and throws; this read must survive it.
 */
const observedFinishReasonSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string().nullable().optional() }).passthrough()).min(1)
}).passthrough();

function observedFinishReason(decoded: unknown): string | null {
  const parsed = observedFinishReasonSchema.safeParse(decoded);
  return parsed.success ? parsed.data.choices[0]!.finish_reason ?? null : null;
}

/**
 * W10/2 (D58 — the outcome is the ticket's, the mechanism is this seat's): the
 * bound a retry asks for after `n` length failures on the same call.
 *
 * At the base a truncation routed to the schema-repair path, which APPENDS a
 * correction and reuses the same bound: attempt 2 had a longer input, the
 * identical `max_tokens`, and the same schema to satisfy — output at least as
 * long as the one just cut. Attempts 2 and 3 were byte-identical requests, so
 * all three calls burned producing one failure, reported as a contract error.
 *
 * The escalation is LINEAR in the number of length failures, so every attempt
 * of a truncating call is distinct and the worst case is bounded by
 * `maxAttempts` (3 attempts → at most 3x the sealed ceiling). The SEALED
 * `tokenCeiling` itself is untouched: this is a per-attempt ask made only after
 * a measured truncation, never a new default.
 */
export function lengthRetryTokenCeiling(sealedTokenCeiling: number, lengthFailures: number): number {
  if (!Number.isInteger(lengthFailures) || lengthFailures < 0) {
    throw new TypeError("PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID");
  }
  return sealedTokenCeiling * (lengthFailures + 1);
}

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

const PROVIDER_INHERITED_CONTEXT_FIELDS = Object.freeze([
  "run_ref",
  "work_item_ref",
  "zone_context",
] as const);

function emitProviderExhaustion(input: {
  readonly code: "PROVIDER_CALL_FAILED" | "PROVIDER_CONTENT_UNACCEPTED";
  readonly attemptId: string;
  readonly ledgerEntryRef: string;
  readonly attemptCount: number;
}): void {
  try {
    const context: Record<string, unknown> = {
      attempt_ref: declaredRef("attempt", input.attemptId),
      ledger_ref: declaredRef("ledger_entry", input.ledgerEntryRef),
    };
    const ambient = getObsContext();
    if (ambient !== undefined) {
      for (const field of PROVIDER_INHERITED_CONTEXT_FIELDS) {
        const descriptor = Object.getOwnPropertyDescriptor(ambient, field);
        if (descriptor === undefined) continue;
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new TypeError("PROVIDER_OBS_CONTEXT_ACCESSOR_FORBIDDEN");
        }
        context[field] = descriptor.value;
      }
    }
    runWithObsContext(Object.freeze(context), () => emit(Object.freeze({
      code: input.code,
      taxonomy_class: "PROVIDER_EXHAUSTED",
      capture_point: "provider",
      disposition: "THROWN",
      source: "first_party",
      template_parameters: Object.freeze({ attempt_count: input.attemptCount }),
    })));
  } catch {
    // Provider product semantics always win over observability.
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
    let lastAttemptId = "PROVIDER_ATTEMPT_UNRESOLVED";
    let attemptPacket = request.packet;
    /** W10/2: how many attempts of THIS call were cut off at the bound. */
    let lengthFailures = 0;
    let lastContentRejection: {
      attempts: number;
      parseStatus: ProviderContentRejectionStatus;
      parseError: string;
      rawArtifactRef: string;
      ledgerEntryRef: string;
    } | null = null;

    for (let attempt = 1; attempt <= request.bound.maxAttempts; attempt += 1) {
      const attemptTokenCeiling = lengthRetryTokenCeiling(request.bound.tokenCeiling, lengthFailures);
      const inputHash = digest(JSON.stringify(attemptPacket));
      const attemptId = randomUUID();
      lastAttemptId = attemptId;
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
            max_tokens: attemptTokenCeiling,
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
        const observedUsage = z.object({ usage: usageSchema.nullable().optional() })
          .passthrough().safeParse(decoded);
        const strict = responseSchema.safeParse(decoded);
        const finishReason = observedFinishReason(decoded);
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
            usage: observedUsage.success ? observedUsage.data.usage ?? null : null,
            // W10/1: the reason this completion stopped, recorded on EVERY
            // attempt. `raw_artifact.metadata` is unconstrained jsonb, so the
            // truncation is durable even though `parse_status` cannot name it.
            finish_reason: finishReason,
            // W10/2: the bound this attempt actually asked for. Without it the
            // ledger cannot tell a raised retry from a repeat of the attempt
            // that was just cut off.
            token_ceiling: attemptTokenCeiling
          },
          parseStatus: classifiedContent.parseStatus,
          parseError: classifiedContent.parseError,
          inputHash,
          contractHash: request.contractHash,
          contentHash: digest(rawText)
        });
        if (!response.ok) throw new Error(`PROVIDER_HTTP_STATUS_${response.status}`);
        // W10/1: a refusal that arrived with `finish_reason: "length"` is a
        // TRUNCATION, and it is named as one. The classifier's own verdict
        // (PARSE_FAILED on a half-written object) describes the symptom; the
        // finish reason describes the cause, and only the cause is actionable.
        //
        // W10 fix round 1 (F7): the truncation WINS even when the cut landed
        // before a body the strict response schema will accept. Previously that
        // case fell through to `responseSchema.parse`, which threw and surfaced
        // as PROVIDER_CALL_FAILED — a transport-shaped name for a length
        // failure, which is the very confusion this ticket exists to remove.
        const truncated = finishReason === PROVIDER_FINISH_REASON_LENGTH;
        const contentRejection: {
          readonly parseStatus: ProviderContentRejectionStatus;
          readonly parseError: string;
        } | null =
          classifiedContent.parseStatus === "PARSE_FAILED" || classifiedContent.parseStatus === "SCHEMA_FAILED"
            ? {
                parseStatus: truncated ? PROVIDER_CONTENT_LENGTH_EXCEEDED : classifiedContent.parseStatus,
                parseError: classifiedContent.parseError
              }
            : truncated && !strict.success
              ? {
                  parseStatus: PROVIDER_CONTENT_LENGTH_EXCEEDED,
                  parseError: "The completion was cut off at the token bound before a parseable response body"
                }
              : null;
        if (request.classifyContent !== undefined && contentRejection !== null) {
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
            parseStatus: contentRejection.parseStatus,
            parseError: contentRejection.parseError,
            rawArtifactRef,
            ledgerEntryRef
          };
          if (contentRejection.parseStatus === PROVIDER_CONTENT_LENGTH_EXCEEDED) {
            // W10/2: a truncation is NOT repaired by asking again for the same
            // thing. Appending a correction is strictly counterproductive here
            // — it lengthens the input the model must re-read while the output
            // it owes stays the same — so the next attempt re-sends the
            // ORIGINAL packet under a raised bound.
            lengthFailures += 1;
            attemptPacket = request.packet;
          } else if (attempt < request.bound.maxAttempts && request.buildRepairPacket !== undefined) {
            attemptPacket = request.buildRepairPacket({
              // `content` is the strict parse's, or the raw body when the cut
              // landed before one existed. Either way it is what arrived.
              rawText: content ?? rawText,
              parseStatus: contentRejection.parseStatus,
              parseError: contentRejection.parseError
            });
          }
          continue;
        }
        lastContentRejection = null;
        const responseJson = responseSchema.parse(decoded);
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
      emitProviderExhaustion({
        code: "PROVIDER_CONTENT_UNACCEPTED",
        attemptId: lastAttemptId,
        ledgerEntryRef: lastContentRejection.ledgerEntryRef,
        attemptCount: lastContentRejection.attempts,
      });
      throw new ProviderContentUnacceptedError(
        lastContentRejection.attempts,
        lastContentRejection.parseStatus,
        lastContentRejection.parseError,
        lastContentRejection.rawArtifactRef,
        lastContentRejection.ledgerEntryRef
      );
    }
    emitProviderExhaustion({
      code: "PROVIDER_CALL_FAILED",
      attemptId: lastAttemptId,
      ledgerEntryRef: lastLedgerEntryRef,
      attemptCount: request.bound.maxAttempts,
    });
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

// DR-181/DR-182's provider health probe (moved here by ruling J21 so the API and
// the runner share ONE implementation). See ./provider-probe.ts.
export {
  observeProviderTarget,
  probeTarget,
  type ProviderProbeObservation,
  type ProviderProbeRecorder
} from "./provider-probe.js";
