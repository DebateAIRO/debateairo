"use client";

import type { Answer } from "@debateai/contract";
import DebatePageClient from "./DebatePageClient";
import { AuthGate } from "@/components/AuthGate";
import type { DebateDetail } from "@/lib/types";

/**
 * UI-01 (S05): every V3 read is asker-scoped, so the debate workspace needs
 * an identity before it can show anything. AuthGate is V2's own surface for
 * exactly that — with a valid stored token it is invisible.
 */
export default function DebatePageGate({
  id,
  initialDebate,
  initialAnswer,
  initialError,
  initialPending
}: {
  id: string;
  initialDebate: DebateDetail | null;
  initialAnswer: Answer | null;
  initialError: string | null;
  initialPending: boolean;
}) {
  return (
    <AuthGate>
      {() => (
        <DebatePageClient
          id={id}
          initialDebate={initialDebate}
          initialAnswer={initialAnswer}
          initialError={initialError}
          initialPending={initialPending}
        />
      )}
    </AuthGate>
  );
}
