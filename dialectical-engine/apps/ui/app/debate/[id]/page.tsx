import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Answer } from "@debateai/contract";
import DebatePageGate from "./DebatePageGate";
import { USER_TOKEN_COOKIE, getDebateServer } from "@/lib/serverApi";
import type { DebateDetail } from "@/lib/types";
import { debateDetailFromRunProjection } from "@/lib/v3/adapter";

export const dynamic = "force-dynamic";

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;

  // SSR reads the asker-scoped projection with the identity cookie (S05).
  // If no answer has been served, the typed run projection distinguishes a
  // real generating/failed run from an honestly nonexistent id.
  let initialDebate: DebateDetail | null = null;
  let initialAnswer: Answer | null = null;
  let initialPending = true;
  let initialError: string | null = null;

  if (token !== null) {
    const result = await getDebateServer(id, token);
    if (result.ok) {
      initialDebate = result.debate;
      initialAnswer = result.answer;
      initialPending = false;
    } else if (result.kind === "loading") {
      initialDebate = debateDetailFromRunProjection(result.run);
      initialPending = true;
    } else if (result.kind === "failed") {
      initialDebate = debateDetailFromRunProjection(result.run);
      initialError = `Debate generation failed: ${result.reason}`;
      initialPending = false;
    } else if (result.kind === "not_found") {
      notFound();
    }
  }

  return (
    <DebatePageGate
      id={id}
      initialDebate={initialDebate}
      initialAnswer={initialAnswer}
      initialError={initialError}
      initialPending={initialPending}
    />
  );
}
