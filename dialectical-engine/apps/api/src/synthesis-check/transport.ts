import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import type { SynthesisCheckFailureCode } from "../../../../packages/contract/src/synthesis-check.js";
import type { PromptPacket } from "../../../../packages/providers/src/index.js";
import { createSupportModelAdapter, type SupportModelTarget, type SupportModelUsage } from "../support/model.js";
import { localOffFlagPath } from "../publication-check/judge-transport.js";

const ADAPTER_BACKSTOP_MARGIN_MS = 10_000;

export interface SynthesisCheckPort {
  readonly providerRef: string;
  readonly modelId: string;
  complete(input: { packet: PromptPacket; signal: AbortSignal }): Promise<{ text: string; usage?: SupportModelUsage }>;
}

export class SynthesisCheckFailure extends Error {
  constructor(readonly code: SynthesisCheckFailureCode) {
    super(code);
    this.name = "SynthesisCheckFailure";
  }
}

export function synthesisCheckFailureCode(error: unknown, signal: AbortSignal, httpStatus?: number): SynthesisCheckFailureCode {
  return error instanceof TypedDomainError && error.code.startsWith("PROMPT_") ? "DOOR_REFUSED"
    : signal.aborted ? "DEADLINE"
    : error instanceof TypedDomainError && error.code === "SUPPORT_MODEL_LENGTH_EXCEEDED" ? "ANSWER_NOT_JSON"
    : httpStatus !== undefined && (httpStatus < 200 || httpStatus > 299) ? "HTTP_STATUS"
    : "TRANSPORT_FAILED";
}

export function createSynthesisCheckTransport(target: SupportModelTarget, options: {
  readAuthorizationHeader: (path: string) => string;
  deadlineMs: number;
  fetchImplementation?: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}): SynthesisCheckPort {
  return {
    providerRef: target.providerRef,
    modelId: target.model,
    async complete(input) {
      let httpStatus: number | undefined;
      try {
        const adapter = createSupportModelAdapter(target, {
          readAuthorizationHeader: options.readAuthorizationHeader,
          timeoutMs: options.deadlineMs + ADAPTER_BACKSTOP_MARGIN_MS,
          ...(options.reportDiagnostic === undefined ? {} : {
            reportDiagnostic: (diagnostic: Readonly<{ code: string }>) => {
              options.reportDiagnostic?.({ code: `SYNTHESIS_CHECK:${diagnostic.code}` });
            }
          }),
          fetchImplementation: async (url, init) => {
            const response = await (options.fetchImplementation ?? fetch)(url, init);
            httpStatus = response.status;
            return response;
          }
        });
        return await adapter.complete({ ...input, language: "en" });
      } catch (error) {
        throw new SynthesisCheckFailure(synthesisCheckFailureCode(error, input.signal, httpStatus));
      }
    }
  };
}

export function synthesisCheckOffFlagPath(apiPort: number, directory?: string): string {
  return localOffFlagPath(apiPort, "synthesis-check", directory);
}
