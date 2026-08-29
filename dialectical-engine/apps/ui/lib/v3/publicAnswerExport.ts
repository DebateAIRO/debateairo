import type { PublicDebate } from "@debateai/contract";

export type PublicAnswerExport = Readonly<{
  available: true;
  href: string;
  filename: string;
}>;

export function buildPublicAnswerExport(debate: PublicDebate): PublicAnswerExport {
  const payload = {
    public_ref: debate.public_ref,
    question: debate.question,
    author_pseudonym: debate.author_pseudonym,
    published_at: debate.published_at,
    answer: debate.answer
  };
  return {
    available: true,
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`,
    filename: `public-debate-${debate.public_ref}.json`
  };
}
