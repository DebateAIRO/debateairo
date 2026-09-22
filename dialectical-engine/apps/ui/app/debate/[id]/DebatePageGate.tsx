"use client";

import type { Answer } from "@debateai/contract";
import DebatePageClient from "./DebatePageClient";
import { AuthGate } from "@/components/AuthGate";
import { SupportWidget } from "@/components/support/SupportWidget";
import type { DebateDetail } from "@/lib/types";
import type { MessageCatalog } from "@/lib/i18n/translate";

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
  initialPending,
  timeCatalog
}: {
  id: string;
  initialDebate: DebateDetail | null;
  initialAnswer: Answer | null;
  initialError: string | null;
  initialPending: boolean;
  timeCatalog: MessageCatalog;
}) {
  return (
    <>
      <AuthGate>
      {() => (
        <DebatePageClient
          id={id}
          initialDebate={initialDebate}
          initialAnswer={initialAnswer}
          initialError={initialError}
          initialPending={initialPending}
          timeCatalog={timeCatalog}
        />
      )}
      </AuthGate>
      <SupportWidget />
    </>
  );
}
