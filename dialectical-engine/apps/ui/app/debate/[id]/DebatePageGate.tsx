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
  timeCatalog,
  debateChromeCatalog,
  debateDrawersCatalog,
  miscCatalog,
  publicCatalog,
  composeCatalog,
  homeCatalog,
  newDebateCatalog
}: {
  id: string;
  initialDebate: DebateDetail | null;
  initialAnswer: Answer | null;
  initialError: string | null;
  initialPending: boolean;
  timeCatalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  debateDrawersCatalog: MessageCatalog;
  miscCatalog: MessageCatalog;
  publicCatalog: MessageCatalog;
  composeCatalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  /** The session gate's copy lives in `newDebate` (review F2). */
  newDebateCatalog: MessageCatalog;
}) {
  return (
    <>
      <AuthGate catalog={newDebateCatalog}>
      {() => (
        <DebatePageClient
          id={id}
          initialDebate={initialDebate}
          initialAnswer={initialAnswer}
          initialError={initialError}
          initialPending={initialPending}
          timeCatalog={timeCatalog}
          debateChromeCatalog={debateChromeCatalog}
          debateDrawersCatalog={debateDrawersCatalog}
          miscCatalog={miscCatalog}
          publicCatalog={publicCatalog}
          composeCatalog={composeCatalog}
          homeCatalog={homeCatalog}
        />
      )}
      </AuthGate>
      <SupportWidget />
    </>
  );
}
