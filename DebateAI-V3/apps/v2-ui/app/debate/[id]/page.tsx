import { cookies } from "next/headers";
import type { Answer } from "@debateai/contract";
import DebatePageGate from "./DebatePageGate";
import { USER_TOKEN_COOKIE, getDebateServer } from "@/lib/serverApi";
import type { DebateDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

function readCookieToken(raw: string | undefined): string | null {
  if (raw === undefined || raw.length === 0) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = readCookieToken((await cookies()).get(USER_TOKEN_COOKIE)?.value);

  // SSR reads the asker-scoped projection with the identity cookie (S05).
  // Any failure — including 404, which in V3 is ambiguous between "run still
  // open" and "not visible to this asker" — renders the pending state; the
  // client's event stream resolves the difference loudly.
  let initialDebate: DebateDetail | null = null;
  let initialAnswer: Answer | null = null;
  let initialPending = true;

  if (token !== null) {
    const result = await getDebateServer(id, token);
    if (result.ok) {
      initialDebate = result.debate;
      initialAnswer = result.answer;
      initialPending = false;
    }
  }

  return (
    <DebatePageGate
      id={id}
      initialDebate={initialDebate}
      initialAnswer={initialAnswer}
      initialPending={initialPending}
    />
  );
}
