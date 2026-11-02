import { askQuestionMaxBytes } from "@debateai/contract";
import type { DeploymentMode, QuestionCheckPolicy } from "@debateai/register";
import { hostedLanguageCheckPrice } from "../question-language/boot.js";
import { createLocalOffFlagSwitch, localOffFlagPath } from "../publication-check/judge-transport.js";
import type { SupportModelTarget } from "../support/model.js";
import type { AskQuestionCheck } from "./ask-gate.js";
import { createQuestionCheck, type QuestionCheckSpendEntry } from "./check.js";
import { questionCheckContract } from "./instruction.js";
import type { QuestionSubjects } from "./subjects.js";
import {
  createPreviewQuestionCheckTransport, createQuestionCheckTransport, questionCheckTarget, type QuestionCheckPort
} from "./transport.js";

export async function composeQuestionCheck(input: Readonly<{
  mode: DeploymentMode;
  apiPort: number;
  target: SupportModelTarget | undefined;
  readAuthorizationHeader(path: string): string;
  reportDiagnostic(diagnostic: Readonly<{ code: string }>): void;
  policy: QuestionCheckPolicy;
  subjects: QuestionSubjects;
  spend: {
    writerPresent(): Promise<boolean>;
    record(entry: QuestionCheckSpendEntry): Promise<void>;
  };
  dayPot: Readonly<{ ceilingMicros: number; spentMicros(day: string): Promise<number> }> | null;
  clock(): Date;
  report(line: Readonly<{ event: string; code: string }>): void;
  /**
   * Ruling L-ROUTE (question-language/boot.ts): with a preview configured (null = none) the check goes through the
   * Anthropic gate when both the guarded fetch and the gate's socket exist, and is off otherwise. It never takes the
   * support target there: the API holds no vendor key on the preview. Money there is the route table's: the gate
   * reserves, settles and caps each call in its own daily pot, so nothing is recorded here and the site's day pot is
   * not asked (a record would count each check twice, and a send the gate refused as a cost never paid).
   */
  preview: Readonly<{ fetch: typeof fetch | undefined; anthropicSocket: string | undefined }> | null;
}>): Promise<AskQuestionCheck> {
  const preview = input.preview;
  const target = preview === null ? questionCheckTarget(input.target) : null;
  const gateFetch = preview?.anthropicSocket === undefined ? undefined : preview.fetch;
  const port: QuestionCheckPort | null = gateFetch !== undefined
    ? createPreviewQuestionCheckTransport({ fetch: gateFetch, deadlineMs: input.policy.deadlineMs })
    : target === null ? null : createQuestionCheckTransport(target, {
      readAuthorizationHeader: input.readAuthorizationHeader,
      reportDiagnostic: input.reportDiagnostic,
      deadlineMs: input.policy.deadlineMs
    });
  // Said once here, at boot: every ask is refused while the check is off (QUESTION_CHECK_UNAVAILABLE).
  if (port === null) input.report({ event: "api.question_check.not_configured", code: "QUESTION_CHECK_NOT_CONFIGURED" });
  const onGate = gateFetch !== undefined;
  const writerPresent = onGate || await input.spend.writerPresent().catch(() => false);
  if (!writerPresent) input.report({ event: "api.question_check.no_spend_writer", code: "QUESTION_CHECK_NOT_CONFIGURED" });

  let price: Readonly<{ input: number; output: number }> | null = null;
  if (port !== null) {
    try {
      // Bytes are an upper bound on charged input tokens. Include the instruction built from the subjects file as well.
      const projectedInput = askQuestionMaxBytes() + Buffer.byteLength(questionCheckContract(input.subjects).instruction, "utf8");
      price = hostedLanguageCheckPrice({ input: 0, output: 0 }, port.modelId, projectedInput);
    } catch {
      input.report({ event: "api.question_check.unpriced", code: "QUESTION_CHECK_NOT_CONFIGURED" });
    }
  }

  const switcher = createLocalOffFlagSwitch(
    port,
    { offFlagPath: input.mode === "hosted" ? null : localOffFlagPath(input.apiPort, "question-check") }
  );
  const checker = createQuestionCheck({
    subjects: input.subjects,
    port: switcher.current,
    deadlineMs: input.policy.deadlineMs,
    price: writerPresent ? price : null,
    spend: { record: onGate ? async () => undefined : input.spend.record },
    dayPot: onGate ? null : input.dayPot,
    clock: input.clock,
    report: input.report
  });
  return { check: checker.check };
}
