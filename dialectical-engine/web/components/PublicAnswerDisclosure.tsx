import type { PublicDebate } from "@debateai/contract";

export function PublicAnswerDisclosure({ answer }: { answer: PublicDebate["answer"] }) {
  return <div aria-label="Published answer limitations">
    <p>Answer status: {answer.terminal}</p>
    {!answer.verdict_available
      ? <p>Verdict unavailable in this published serving mode.</p>
      : null}
    <p>Evidence as of {new Date(answer.as_of).toLocaleString()}.</p>
  </div>;
}
