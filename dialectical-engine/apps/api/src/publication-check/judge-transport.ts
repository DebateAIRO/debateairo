import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import { createSupportModelAdapter, type SupportModelTarget } from "../support/model.js";
import { PublicationJudgeFailure, type JudgeFailureCause, type PublicationJudgePort } from "./check.js";

export function createPublicationJudgeTransport(target: SupportModelTarget, options: {
  readAuthorizationHeader: (path: string) => string;
  fetchImplementation?: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}): PublicationJudgePort {
  return {
    providerRef: target.providerRef, modelId: target.model,
    async complete(input) {
      let httpStatus: number | undefined;
      try {
        const adapter = createSupportModelAdapter(target, {
          ...options, timeoutMs: 20_000,
          fetchImplementation: async (url, init) => {
            const response = await (options.fetchImplementation ?? fetch)(url, init);
            httpStatus = response.status;
            return response;
          }
        });
        const { text } = await adapter.complete({ ...input, language: "en" });
        return { text };
      } catch (error) {
        const cause: JudgeFailureCause = error instanceof TypedDomainError && error.code.startsWith("PROMPT_") ? "JUDGE_DOOR_REFUSED"
          : input.signal.aborted ? "JUDGE_DEADLINE"
          : error instanceof TypedDomainError && error.code === "SUPPORT_MODEL_LENGTH_EXCEEDED" ? "JUDGE_ANSWER_NOT_JSON"
          : httpStatus !== undefined && (httpStatus < 200 || httpStatus > 299) ? "JUDGE_HTTP_STATUS"
          : "JUDGE_TRANSPORT_FAILED";
        throw new PublicationJudgeFailure(cause);
      }
    }
  };
}

export function createPublicationJudgeSwitch(port: PublicationJudgePort | null): {
  current(): PublicationJudgePort | null; toggle(): boolean;
} {
  let enabled = port !== null;
  return {
    current: () => enabled ? port : null,
    toggle: () => { enabled = port !== null && !enabled; return enabled; }
  };
}
