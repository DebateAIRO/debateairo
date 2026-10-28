import type { PromptContract } from "@debateai/providers";
import type { QuestionSubject, QuestionSubjects } from "./subjects.js";

export const QUESTION_CHECK_CONTRACT_ID = "question.start-check.v2";

function subjectLine(subject: QuestionSubject): string {
  const examples = (list: readonly string[]) => list.length === 0 ? [] : [`Examples: ${list.join(" | ")}.`];
  return [
    `${subject.id}: Not healthy: ${subject.notHealthy}`, ...examples(subject.examplesNotHealthy),
    ...(subject.healthy === null ? [] : [`Still healthy: ${subject.healthy}`, ...examples(subject.examplesHealthy)])
  ].join(" ");
}

/** V, 2026-10-28: the model names the question's subject from the subjects file, or NONE, and whether it is healthy. */
export function questionCheckContract(subjects: QuestionSubjects): PromptContract {
  const ids = subjects.map(subject => subject.id);
  return {
    contractId: QUESTION_CHECK_CONTRACT_ID,
    instruction: [
      "Read the question line. Name the one subject below that the question is about, or NONE if it is about none of them, and decide whether the question is healthy. A question counts whether its wording is explicit or indirect.",
      "A question about a subject is healthy unless it is what that subject's 'Not healthy' line describes; a subject with no 'Still healthy' part has no healthy questions. If several subjects fit, name the first one in this order whose 'Not healthy' line applies, or else the first that fits:",
      ...subjects.map(subjectLine),
      "A question about NONE of these subjects is healthy."
    ].join("\n"),
    answerForm: `A single JSON object and nothing else: {"call":"<the 32 hexadecimal characters of this call's boundary marker>","subject":"<one of ${ids.join(", ")}, or NONE>","healthy":true or false}`
  };
}
