import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { PromptPacket } from "@debateai/providers";
import type { PublicAggregateProvider } from "./consumer.js";

const providerResponseSchema = z.object({
  model: z.string().trim().min(1),
  choices: z.array(z.object({
    message: z.object({ content: z.string() }).strict()
  }).strict()).length(1)
}).passthrough();

const publicAggregateContentSchema = z.object({
  bias_pattern_name: z.string().trim().min(1).max(200),
  capability_summary: z.string().trim().min(1).max(4_000),
  adjacent_domain_flags: z.array(z.object({
    domain_ref: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(1_000),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"])
  }).strict()).max(32)
}).strict();

const selfRoutingKey = /(?:^|_)(?:numeric|ordinal|rank|route|routing|score|weight)(?:_|$)/i;

function containsSelfRoutingField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSelfRoutingField);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => selfRoutingKey.test(key)
    || containsSelfRoutingField(nested));
}

function validateContent(content: string, allowedAdjacentDomainRefs: readonly string[]): void {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED");
  }
  if (containsSelfRoutingField(decoded)) {
    throw new TypedDomainError("SELF_ROUTING_FORBIDDEN", "SELF_ROUTING_FORBIDDEN");
  }
  const parsed = publicAggregateContentSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED");
  }
  const allowed = new Set(allowedAdjacentDomainRefs);
  const refs = parsed.data.adjacent_domain_flags.map((flag) => flag.domain_ref);
  if (refs.some((ref) => !allowed.has(ref)) || new Set(refs).size !== refs.length) {
    throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED");
  }
}

function repairPacket(packet: PromptPacket, code: string): PromptPacket {
  return Object.freeze({ messages: Object.freeze([
    ...packet.messages,
    Object.freeze({
      role: "user" as const,
      content: `The response violated the public aggregate contract (${code}). Return corrected strict JSON only.`
    })
  ]) });
}

/**
 * Public-only evaluator transport. It intentionally has no database, run-key,
 * raw-artifact, ledger, or generic ProviderGateway dependency. Raw provider
 * bytes are validated in memory and are never returned to the consumer.
 */
export function createOpenAiPublicAggregateProvider(options: Readonly<{
  endpoint: string;
  providerRef: string;
  model: string;
  maker: string;
  fetchImplementation?: typeof fetch;
}>): PublicAggregateProvider {
  const endpoint = new URL(options.endpoint);
  if (!/^https?:$/.test(endpoint.protocol)
    || options.providerRef.trim() === ""
    || options.model.trim() === ""
    || options.maker.trim() === "") {
    throw new TypeError("PUBLIC_AGGREGATE_PROVIDER_CONFIGURATION_INVALID");
  }
  const fetcher = options.fetchImplementation ?? fetch;
  return Object.freeze({
    async classify(input: Parameters<PublicAggregateProvider["classify"]>[0]) {
      if (input.consumerModelId !== options.model) {
        throw new TypedDomainError(
          "CONSUMER_AUTHORIZATION_FAILED",
          "CONSUMER_AUTHORIZATION_FAILED"
        );
      }
      let packet = input.packet;
      for (let attempt = 1; attempt <= input.bound.maxAttempts; attempt += 1) {
        try {
          const response = await fetcher(
            `${options.endpoint.replace(/\/$/, "")}/chat/completions`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              signal: AbortSignal.timeout(input.bound.deadlineMs),
              body: JSON.stringify({
                model: options.model,
                max_tokens: input.bound.tokenCeiling,
                messages: packet.messages
              })
            }
          );
          const raw = await response.text();
          if (!response.ok) {
            throw new TypedDomainError("CONSUMER_PROVIDER_FAILED", "CONSUMER_PROVIDER_FAILED");
          }
          let decoded: unknown;
          try {
            decoded = JSON.parse(raw);
          } catch {
            throw new TypedDomainError("CONSUMER_PROVIDER_FAILED", "CONSUMER_PROVIDER_FAILED");
          }
          const providerResponse = providerResponseSchema.safeParse(decoded);
          if (!providerResponse.success) {
            throw new TypedDomainError("CONSUMER_PROVIDER_FAILED", "CONSUMER_PROVIDER_FAILED");
          }
          if (providerResponse.data.model !== options.model) {
            throw new TypedDomainError(
              "CONSUMER_AUTHORIZATION_FAILED",
              "CONSUMER_AUTHORIZATION_FAILED"
            );
          }
          try {
            validateContent(
              providerResponse.data.choices[0]!.message.content,
              input.allowedAdjacentDomainRefs
            );
            return Object.freeze({ classification: "ACCEPTED" as const });
          } catch (error) {
            if (!(error instanceof TypedDomainError)
              || !["SELF_ROUTING_FORBIDDEN", "CONSUMER_CONTENT_REFUSED"].includes(error.code)
              || attempt === input.bound.maxAttempts) {
              throw error;
            }
            packet = repairPacket(packet,error.code);
          }
        } catch (error) {
          if (error instanceof TypedDomainError) throw error;
          if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new TypedDomainError(
              "CONSUMER_PROVIDER_TIMED_OUT",
              "CONSUMER_PROVIDER_TIMED_OUT"
            );
          }
          throw new TypedDomainError("CONSUMER_PROVIDER_FAILED", "CONSUMER_PROVIDER_FAILED");
        }
      }
      throw new TypedDomainError("CONSUMER_CONTENT_REFUSED", "CONSUMER_CONTENT_REFUSED");
    }
  });
}
