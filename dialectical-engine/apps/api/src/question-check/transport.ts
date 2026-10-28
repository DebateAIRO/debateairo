import { buildFramedPrompt, type PromptPacket } from "@debateai/providers";
import { createSupportModelAdapter, type SupportModelTarget } from "../support/model.js";
import { judgeCallValue } from "../publication-check/verdict.js";
import { type QuestionCheckFailureCode } from "./contract.js";
import { questionCheckContract } from "./instruction.js";
import type { QuestionSubjects } from "./subjects.js";

export const QUESTION_CHECK_MODEL = "claude-haiku-5-5";
const ADAPTER_BACKSTOP_MARGIN_MS = 10_000;
const QUESTION_CHECK_DIAGNOSTIC_PREFIX = "QUESTION_CHECK:";

export function questionCheckTarget(target: SupportModelTarget | undefined): SupportModelTarget | null {
  return target?.model === QUESTION_CHECK_MODEL ? target : null;
}

export interface QuestionCheckPort {
  readonly providerRef: string;
  readonly modelId: string;
  complete(input: { packet: PromptPacket; signal: AbortSignal }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}

export class QuestionCheckFailure extends Error {
  constructor(readonly code: QuestionCheckFailureCode) {
    super(code);
    this.name = "QuestionCheckFailure";
  }
}

export function buildQuestionCheckPacket(questionLine: string, subjects: QuestionSubjects): { packet: PromptPacket; expectedCall: string } {
  const framed = buildFramedPrompt({
    contract: questionCheckContract(subjects),
    material: [{ name: "question", content: questionLine }]
  });
  return { packet: framed.packet, expectedCall: judgeCallValue(framed.fence) };
}

export function createQuestionCheckTransport(target: SupportModelTarget, options: {
  readAuthorizationHeader: (path: string) => string;
  deadlineMs: number;
  fetchImplementation?: typeof fetch;
  reportDiagnostic?: (d: Readonly<{ code: string }>) => void;
}): QuestionCheckPort {
  const backstopMs = options.deadlineMs + ADAPTER_BACKSTOP_MARGIN_MS;
  return {
    providerRef: target.providerRef,
    modelId: target.model,
    async complete(input) {
      let httpStatus: number | undefined;
      try {
        const adapter = createSupportModelAdapter(target, {
          readAuthorizationHeader: options.readAuthorizationHeader,
          timeoutMs: backstopMs,
          ...(options.reportDiagnostic === undefined ? {} : {
            reportDiagnostic: (diagnostic: Readonly<{ code: string }>) =>
              options.reportDiagnostic?.({ code: `${QUESTION_CHECK_DIAGNOSTIC_PREFIX}${diagnostic.code}` })
          }),
          fetchImplementation: async (url, init) => {
            const response = await (options.fetchImplementation ?? fetch)(url, init);
            httpStatus = response.status;
            return response;
          }
        });
        const result = await adapter.complete({ ...input, language: "en" });
        const inputTokens = result.usage?.input_tokens;
        const outputTokens = result.usage?.output_tokens;
        const usage = typeof inputTokens === "number" && Number.isInteger(inputTokens) && inputTokens >= 0
          && typeof outputTokens === "number" && Number.isInteger(outputTokens) && outputTokens >= 0
          ? { inputTokens, outputTokens }
          : undefined;
        return { text: result.text, ...(usage === undefined ? {} : { usage }) };
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? String(error.code) : "";
        const failure: QuestionCheckFailureCode = code.startsWith("PROMPT_") ? "QUESTION_CHECK_DOOR_REFUSED"
          : input.signal.aborted ? "QUESTION_CHECK_DEADLINE"
          : code === "SUPPORT_MODEL_LENGTH_EXCEEDED" ? "QUESTION_CHECK_ANSWER_NOT_JSON"
          : httpStatus !== undefined && (httpStatus < 200 || httpStatus > 299) ? "QUESTION_CHECK_HTTP_STATUS"
          : "QUESTION_CHECK_TRANSPORT_FAILED";
        throw new QuestionCheckFailure(failure);
      }
    }
  };
}
