import { askQuestionMaxBytes } from "@debateai/contract";
import type { DeploymentMode, QuestionCheckPolicy } from "@debateai/register";
import { hostedLanguageCheckPrice } from "../question-language/boot.js";
import { createLocalOffFlagSwitch, localOffFlagPath } from "../publication-check/judge-transport.js";
import type { SupportModelTarget } from "../support/model.js";
import type { AskQuestionCheck } from "./ask-gate.js";
import { createQuestionCheck, type QuestionCheckSpendEntry } from "./check.js";
import { questionCheckContract } from "./instruction.js";
import { createQuestionCheckTransport, questionCheckTarget } from "./transport.js";

export async function composeQuestionCheck(input: Readonly<{
  mode: DeploymentMode;
  apiPort: number;
  target: SupportModelTarget | undefined;
  readAuthorizationHeader(path: string): string;
  reportDiagnostic(diagnostic: Readonly<{ code: string }>): void;
  policy: QuestionCheckPolicy;
  spend: {
    writerPresent(): Promise<boolean>;
    record(entry: QuestionCheckSpendEntry): Promise<void>;
  };
  dayPot: Readonly<{ ceilingMicros: number; spentMicros(day: string): Promise<number> }> | null;
  keeper: { keep(questionLine: string, accountUserId: string | null): Promise<string> };
  clock(): Date;
  report(line: Readonly<{ event: string; code: string }>): void;
}>): Promise<AskQuestionCheck> {
  const target = questionCheckTarget(input.target);
  const writerPresent = await input.spend.writerPresent().catch(() => false);
  if (!writerPresent) input.report({ event: "api.question_check.no_spend_writer", code: "QUESTION_CHECK_NOT_CONFIGURED" });

  let price: Readonly<{ input: number; output: number }> | null = null;
  if (target !== null) {
    try {
      // Bytes are an upper bound on charged input tokens. Include the fixed instruction as well.
      const projectedInput = askQuestionMaxBytes() + Buffer.byteLength(questionCheckContract().instruction, "utf8");
      price = hostedLanguageCheckPrice({ input: 0, output: 0 }, target.model, projectedInput);
    } catch {
      input.report({ event: "api.question_check.unpriced", code: "QUESTION_CHECK_NOT_CONFIGURED" });
    }
  }

  const switcher = createLocalOffFlagSwitch(
    target === null ? null : createQuestionCheckTransport(target, {
      readAuthorizationHeader: input.readAuthorizationHeader,
      reportDiagnostic: input.reportDiagnostic,
      deadlineMs: input.policy.deadlineMs
    }),
    { offFlagPath: input.mode === "hosted" ? null : localOffFlagPath(input.apiPort, "question-check") }
  );
  const checker = createQuestionCheck({
    port: switcher.current,
    deadlineMs: input.policy.deadlineMs,
    price: writerPresent ? price : null,
    spend: { record: input.spend.record },
    dayPot: input.dayPot,
    clock: input.clock,
    report: input.report
  });
  return {
    check: checker.check,
    async keep({ questionLine, accountUserId }) {
      await input.keeper.keep(questionLine, accountUserId);
    }
  };
}
