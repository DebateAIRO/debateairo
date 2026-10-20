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
  let spendBreakerLatched = false;

  function unavailable(code: QuestionCheckFailureCode): QuestionCheckOutcome {
    deps.report({ event: "api.question_check.unavailable", code });
    return { outcome: "UNAVAILABLE", code };
  }

  return {
    async check(questionLine) {
      const port = deps.port();
      const price = deps.price;
      if (port === null || price === null) return unavailable("QUESTION_CHECK_NOT_CONFIGURED");
      if (spendBreakerLatched) return unavailable("QUESTION_CHECK_SPEND_RECORD_DOWN");

      const chargedOn = deps.clock().toISOString().slice(0, 10);
      if (deps.dayPot !== null) {
        try {
          const spent = await deps.dayPot.spentMicros(chargedOn);
          if (!Number.isFinite(spent) || spent >= deps.dayPot.ceilingMicros) {
            return unavailable("QUESTION_CHECK_BUDGET_REFUSED");
          }
        } catch {
          return unavailable("QUESTION_CHECK_BUDGET_REFUSED");
        }
      }

      const { packet, expectedCall } = buildQuestionCheckPacket(questionLine);
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let completion: Awaited<ReturnType<QuestionCheckPort["complete"]>> | undefined;
      let outcome: QuestionCheckOutcome;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(new QuestionCheckFailure("QUESTION_CHECK_DEADLINE"));
          }, deps.deadlineMs);
        });
        completion = await Promise.race([port.complete({ packet, signal: abort.signal }), deadline]);
        const answer = parseQuestionCheckAnswer(completion.text, expectedCall);
        if (!answer.ok) outcome = unavailable(answer.code);
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
        outcome = unavailable(code);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
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
      } catch (error) {
        spendFailures++;
        const sqlstate = typeof error === "object" && error !== null && "code" in error
          ? String(error.code) : "";
        if (LATCH_SQLSTATES.has(sqlstate) || spendFailures >= 3) spendBreakerLatched = true;
        deps.report({ event: "api.question_check.spend_unrecorded", code: "QUESTION_CHECK_SPEND_RECORD_DOWN" });
      }
      return outcome;
    }
  };
}
