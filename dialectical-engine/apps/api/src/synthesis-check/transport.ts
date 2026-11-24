import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import type { SynthesisCheckFailureCode } from "../../../../packages/contract/src/synthesis-check.js";
import type { PromptPacket } from "../../../../packages/providers/src/index.js";
import { createSupportModelAdapter, type SupportModelTarget, type SupportModelUsage } from "../support/model.js";
import { localOffFlagPath } from "../publication-check/judge-transport.js";
import {
  CONTENT_CHECK_GATE_MODEL, CONTENT_CHECK_GATE_PROVIDER_REF, ContentCheckGateFailure, createContentCheckGateCall
} from "../publication-check/gate-transport.js";

const ADAPTER_BACKSTOP_MARGIN_MS = 10_000;

export interface SynthesisCheckPort {
  readonly providerRef: string;
  readonly modelId: string;
  complete(input: { packet: PromptPacket; signal: AbortSignal }): Promise<{ text: string; usage?: SupportModelUsage }>;
}

export class SynthesisCheckFailure extends Error {
  // responded: the provider sent an HTTP response, so the call may have been billed (t_79c1879c).
  constructor(readonly code: SynthesisCheckFailureCode, readonly responded = false) {
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
        throw new SynthesisCheckFailure(synthesisCheckFailureCode(error, input.signal, httpStatus), httpStatus !== undefined);
      }
    }
  };
}

/**
 * The synthesis check on the gate route (publication-check/gate-transport.ts). `responded` is the gate route's word for "this
 * call may have been charged". A refusal the app can tell reserved nothing (busy, cooling, not served, the day used up) is never
 * recorded as spent, so a full day or a busy gate cannot fill the site's day pot with calls nobody paid for. A refusal it cannot
 * tell from a failure after a reservation (the gate's opaque stop, a halted gate, a line closed without an answer) is recorded
 * at the check's estimate, as a call that may have been paid: the site's day is then counted a little high, never low. The
 * check's own day-pot read and its spend record are the same on both routes.
 */
export function createPreviewSynthesisCheckTransport(options: Readonly<{
  fetch: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}>): SynthesisCheckPort {
  const send = createContentCheckGateCall({ fetch: options.fetch,
    reportDiagnostic: (code) => options.reportDiagnostic?.({ code: `SYNTHESIS_CHECK:${code}` }) });
  return {
    providerRef: CONTENT_CHECK_GATE_PROVIDER_REF,
    modelId: CONTENT_CHECK_GATE_MODEL,
    async complete(input) {
      try {
        return await send(input);
      } catch (error) {
        const failure = error instanceof ContentCheckGateFailure ? error : new ContentCheckGateFailure("SEND_FAILED", true);
        const code: SynthesisCheckFailureCode = failure.kind === "DOOR_REFUSED" ? "DOOR_REFUSED"
          : input.signal.aborted ? "DEADLINE"
          : failure.kind === "TRUNCATED" ? "ANSWER_NOT_JSON"
          : failure.kind === "HTTP_STATUS" ? "HTTP_STATUS"
          : "TRANSPORT_FAILED";
        throw new SynthesisCheckFailure(code, failure.billed);
      }
    }
  };
}

export function synthesisCheckOffFlagPath(apiPort: number, directory?: string): string {
  return localOffFlagPath(apiPort, "synthesis-check", directory);
}
