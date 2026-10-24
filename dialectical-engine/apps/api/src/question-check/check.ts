import { randomUUID } from "node:crypto";
import { languageCheckChargeMicros } from "@debateai/budget";
import { CRISIS_LABELS, KEPT_LABELS, REFUSING_KINDS, type QuestionCheckFailureCode, type QuestionCheckOutcome } from "./contract.js";
import { parseQuestionCheckAnswer } from "./verdict.js";
import { buildQuestionCheckPacket, QuestionCheckFailure, type QuestionCheckPort } from "./transport.js";

export type QuestionCheckSpendEntry = Readonly<{
  spendId: string;
  providerRef: string;
  chargedOn: string;
  chargeMicros: number;
  inputTokens: number;
  outputTokens: number;
}>;

// apps/api/src/support/model.ts:38 fixes max_tokens at 16,000.
const MAX_OUTPUT_TOKENS = 16_000;
const LATCH_SQLSTATES = new Set(["42501", "42883", "23514"]);
const SPEND_RETRY_MS = 5 * 60_000;

export function createQuestionCheck(deps: {
  port: () => QuestionCheckPort | null;
  deadlineMs: number;
  price: Readonly<{ input: number; output: number }> | null;
  spend: { record(entry: QuestionCheckSpendEntry): Promise<void> };
  dayPot: Readonly<{ ceilingMicros: number; spentMicros(day: string): Promise<number> }> | null;
  clock: () => Date;
  report: (line: Readonly<{ event: string; code: string }>) => void;
}): { check(questionLine: string): Promise<QuestionCheckOutcome> } {
  let spendFailures = 0;
  let spendRetryAt = 0;

  function unavailable(code: QuestionCheckFailureCode): QuestionCheckOutcome {
    deps.report({ event: "api.question_check.unavailable", code });
    return { outcome: "UNAVAILABLE", code };
  }

  return {
    async check(questionLine) {
      const port = deps.port();
      const price = deps.price;
      if (port === null || price === null) return unavailable("QUESTION_CHECK_NOT_CONFIGURED");
      const startedAt = deps.clock();
      if (spendRetryAt > startedAt.getTime()) return unavailable("QUESTION_CHECK_SPEND_RECORD_DOWN");
      const retryingSpend = spendRetryAt !== 0;
      const chargedOn = startedAt.toISOString().slice(0, 10);
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deferredUnavailable = (code: QuestionCheckFailureCode): QuestionCheckOutcome => ({ outcome: "UNAVAILABLE", code });
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new QuestionCheckFailure("QUESTION_CHECK_DEADLINE"));
        }, deps.deadlineMs);
      });
      const work = async (): Promise<QuestionCheckOutcome> => {
        if (deps.dayPot !== null) {
          try {
            const spent = await deps.dayPot.spentMicros(chargedOn);
            if (abort.signal.aborted) throw new QuestionCheckFailure("QUESTION_CHECK_DEADLINE");
            if (!Number.isFinite(spent) || spent >= deps.dayPot.ceilingMicros) {
              return deferredUnavailable("QUESTION_CHECK_BUDGET_REFUSED");
            }
          } catch {
            if (abort.signal.aborted) throw new QuestionCheckFailure("QUESTION_CHECK_DEADLINE");
            return deferredUnavailable("QUESTION_CHECK_BUDGET_REFUSED");
          }
        }
        if (abort.signal.aborted) throw new QuestionCheckFailure("QUESTION_CHECK_DEADLINE");
        const { packet, expectedCall } = buildQuestionCheckPacket(questionLine);
        let completion: Awaited<ReturnType<QuestionCheckPort["complete"]>> | undefined;
        let outcome: QuestionCheckOutcome;
        try {
          completion = await port.complete({ packet, signal: abort.signal });
          if (abort.signal.aborted) throw new QuestionCheckFailure("QUESTION_CHECK_DEADLINE");
          const answer = parseQuestionCheckAnswer(completion.text, expectedCall);
          if (!answer.ok) outcome = deferredUnavailable(answer.code);
          else if (CRISIS_LABELS.includes(answer.label as typeof CRISIS_LABELS[number])) outcome = { outcome: "CRISIS" };
          else if (REFUSING_KINDS.includes(answer.label as typeof REFUSING_KINDS[number])) {
            outcome = {
              outcome: "REFUSE",
              kind: answer.label as typeof REFUSING_KINDS[number],
              kept: KEPT_LABELS.includes(answer.label as typeof KEPT_LABELS[number])
            };
          } else outcome = { outcome: "PASS" };
        } catch (error) {
          const code = error instanceof QuestionCheckFailure ? error.code
            : abort.signal.aborted ? "QUESTION_CHECK_DEADLINE"
            : "QUESTION_CHECK_TRANSPORT_FAILED";
          outcome = deferredUnavailable(code);
        }

        const usage = completion?.usage ?? {
          inputTokens: packet.messages.reduce((total, message) => total + Buffer.byteLength(message.content, "utf8"), 0),
          outputTokens: MAX_OUTPUT_TOKENS
        };
        try {
          await deps.spend.record({
            spendId: randomUUID(),
            providerRef: `question-check:${port.providerRef}:${port.modelId}`,
            chargedOn,
            chargeMicros: languageCheckChargeMicros(usage, price),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          });
          spendFailures = 0;
          spendRetryAt = 0;
        } catch (error) {
          spendFailures++;
          const sqlstate = typeof error === "object" && error !== null && "code" in error
            ? String(error.code) : "";
          if (retryingSpend || LATCH_SQLSTATES.has(sqlstate) || spendFailures >= 3)
            spendRetryAt = startedAt.getTime() + SPEND_RETRY_MS;
          deps.report({ event: "api.question_check.spend_unrecorded", code: "QUESTION_CHECK_SPEND_RECORD_DOWN" });
        }
        return outcome;
      };
      try {
        const outcome = await Promise.race([work(), deadline]);
        if (outcome.outcome === "UNAVAILABLE") deps.report({ event: "api.question_check.unavailable", code: outcome.code });
        return outcome;
      } catch (error) {
        if (!abort.signal.aborted && !(error instanceof QuestionCheckFailure && error.code === "QUESTION_CHECK_DEADLINE")) throw error;
        return unavailable("QUESTION_CHECK_DEADLINE");
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  };
}
