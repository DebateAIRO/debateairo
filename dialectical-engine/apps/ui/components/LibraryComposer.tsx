"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COOKIE_SESSION_MARKER, createDebate, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { classifyRequestFailure, requestFailureMessage } from "@/lib/v3/requestFailure";
import { isSensitiveDataConsentRefusal, useSensitiveDataConsent } from "@/components/SensitiveDataConsent";

/* The claim field rests at one line and grows with what is typed. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field === null) return;
  field.style.height = "auto";
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + border}px`;
}

export function LibraryComposer({
  catalog,
  newDebateCatalog,
  locale
}: {
  catalog: MessageCatalog;
  /** The interface locale's `newDebate` catalogue: the refusal words /new uses. */
  newDebateCatalog: MessageCatalog;
  /** The interface locale, recorded with the sensitive-data consent. */
  locale: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consent = useSensitiveDataConsent({ catalog, locale });

  const ready = topic.trim().length > 6;

  async function start() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await validateSession();
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      if (!await consent.ensureConsent()) {
        setBusy(false);
        return;
      }
      const create = () => createDebate(
        topic.trim(), { max_depth: 3, branching: 2, max_tokens: 800 }, COOKIE_SESSION_MARKER
      );
      let debate;
      try {
        debate = await create();
      } catch (refusal) {
        if (!isSensitiveDataConsentRefusal(refusal)) throw refusal;
        if (!await consent.ensureConsent({ known: "required" })) {
          setBusy(false);
          return;
        }
        debate = await create();
      }
      router.push(`/debate/${debate.id}`);
      return;
    } catch (exc) {
      // Task M8 (spec 2026-09-26 §14.4.7): today's limit for new debates is an
      // answer, not a detour. /new would only refuse the same ask again, so the
      // person reads it here, where they typed, in the words /new uses.
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "DAILY_LIMIT_REACHED") {
        setError(requestFailureMessage("DEBATE_CREATE", exc, newDebateCatalog));
        setBusy(false);
        return;
      }
      // Anything else falls through to the authenticated /new flow.
    }
    router.push(`/new?topic=${encodeURIComponent(topic.trim())}`);
    setBusy(false);
  }

  return (
    <div className="libComposer">
      <div className="libComposerCore">
        <textarea
          id="library-claim"
          className="libComposerInput"
          aria-label={t(catalog, "home.debateClaim")}
          ref={grow}
          rows={1}
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            grow(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void start();
            }
          }}
          placeholder={t(catalog, "home.claimPlaceholder")}
        />
        <div className="libComposerFoot">
          <p className="libComposerHint">{t(catalog, "home.composerHint")}</p>
          <span className="libComposerSpacer" aria-hidden />
          <button type="button" className="libStart" onClick={start} disabled={!ready || busy}>
            {t(catalog, busy ? "home.starting" : "home.startDebate")} <span aria-hidden>→</span>
          </button>
        </div>
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
        {consent.declined ? (
          <p className="sensitiveConsentDeclined" role="status">{t(catalog, "home.sensitiveConsent.declined")}</p>
        ) : null}
      </div>
      {consent.dialog}
    </div>
  );
}
