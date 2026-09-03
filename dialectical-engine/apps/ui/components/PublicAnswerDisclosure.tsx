import type { PublicDebate } from "@debateai/contract";

export function PublicAnswerDisclosure({ answer }: { answer: PublicDebate["answer"] }) {
  return <div aria-label="Published answer limitations">
    <p>Published debates may be indexed by search engines. Copies may persist after unpublishing.</p>
    <p>Answer status: {answer.terminal}</p>
    {!answer.verdict_available
      ? <p>Verdict unavailable in this published serving mode.</p>
      : null}
    {answer.tree_included !== true
      ? <p>This publication predates argument-tree publishing; only the answer summary is available.</p>
      : null}
    <p>Evidence as of {new Date(answer.as_of).toLocaleString()}.</p>
  </div>;
}
