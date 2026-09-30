import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import { createSupportModelAdapter, type SupportModelTarget } from "../support/model.js";
import { PUBLICATION_CHECK_DEADLINE_MS, PublicationJudgeFailure, type JudgeFailureCause, type PublicationJudgePort } from "./check.js";

/**
 * FIX-HS2-p1 pt-N4: the adapter's own timeout is a BACKSTOP strictly above the check's deadline D, so the only
 * clock that can end a call inside D is the check's shared signal, and every expiry is recorded as JUDGE_DEADLINE.
 */
const ADAPTER_BACKSTOP_MS = PUBLICATION_CHECK_DEADLINE_MS + 10_000;

/** FIX-HS2-p1 sd-N6: the judge's diagnostics carry the judge's name, never the support chat's. */
const JUDGE_DIAGNOSTIC_PREFIX = "PUBLICATION_JUDGE:";

export function createPublicationJudgeTransport(target: SupportModelTarget, options: {
  readAuthorizationHeader: (path: string) => string;
  fetchImplementation?: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}): PublicationJudgePort {
  const report = options.reportDiagnostic;
  return {
    providerRef: target.providerRef, modelId: target.model,
    async complete(input) {
      let httpStatus: number | undefined;
      try {
        const adapter = createSupportModelAdapter(target, {
          readAuthorizationHeader: options.readAuthorizationHeader,
          timeoutMs: ADAPTER_BACKSTOP_MS,
          ...(report === undefined ? {} : {
            reportDiagnostic: (diagnostic: Readonly<{ code: string }>) => { report({ code: `${JUDGE_DIAGNOSTIC_PREFIX}${diagnostic.code}` }); }
          }),
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

/**
 * FIX-HS2-p1 sd-N5 (SPEC-v2 §6 step 9): the judge-off switch of a LOCAL deployment is a flag file named by the API
 * port. While it exists every publish answers UNAVAILABLE `JUDGE_NOT_CONFIGURED`; it is read on every attempt, so
 * it is explicit (`touch` = off, `rm` = on), idempotent, and it survives an API restart. A hosted composition passes
 * `offFlagPath: null` and reads no file.
 */
export function publicationJudgeOffFlagPath(apiPort: number, directory: string = tmpdir()): string {
  return join(directory, `debateai-publication-judge-${apiPort}.off`);
}

export function createPublicationJudgeSwitch(port: PublicationJudgePort | null, options: {
  offFlagPath: string | null;
}): { current(): PublicationJudgePort | null; switchOff(): boolean } {
  const flag = options.offFlagPath;
  const off = () => flag !== null && existsSync(flag);
  return {
    current: () => port === null || off() ? null : port,
    switchOff: () => {
      if (flag !== null) writeFileSync(flag, "");
      return port !== null && !off();
    }
  };
}
