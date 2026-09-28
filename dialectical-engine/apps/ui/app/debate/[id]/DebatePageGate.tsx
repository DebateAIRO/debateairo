"use client";

import type { Answer, AnswerFloor } from "@debateai/contract";
import DebatePageClient from "./DebatePageClient";
import { AuthGate } from "@/components/AuthGate";
import { SupportWidget } from "@/components/support/SupportWidget";
import type { DebateDetail } from "@/lib/types";
import type { LocaleCode } from "@/lib/i18n/locales";
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
  newDebateCatalog,
  questionLocale = null,
  storyLocale,
  storyCatalog,
  initialFloor
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
  /** The question's locale (spec 2026-09-26 §14.3), for the offer to switch the page to it. */
  questionLocale?: LocaleCode | null;
  /** The verdict story strip's locale: the question's, or the interface's when the server learned none. */
  storyLocale: LocaleCode;
  /** The `public` catalogue of `storyLocale`. */
  storyCatalog: MessageCatalog;
  /** A components-only answer's floor, from the server's read (spec 2026-09-26 §14.4.4); null when none was read. */
  initialFloor: AnswerFloor | null;
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
          questionLocale={questionLocale}
          storyLocale={storyLocale}
          storyCatalog={storyCatalog}
          initialFloor={initialFloor}
        />
      )}
      </AuthGate>
      <SupportWidget />
    </>
  );
}
