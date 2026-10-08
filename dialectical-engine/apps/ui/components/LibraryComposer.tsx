"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { contractClient, validateSession } from "@/lib/api";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { useAskRoom, waitingRoomOf, type AskRoomQuery } from "@/lib/billing/room";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { classifyRequestFailure, requestFailureMessage } from "@/lib/v3/requestFailure";
import { useSensitiveDataConsent } from "@/components/SensitiveDataConsent";
import { isCrisisSupportRefusal, useCrisisSupport } from "@/components/CrisisSupport";

/* The composer asks with /new's Free defaults; the room depends on the ask's settings. */
const COMPOSER_ROOM_QUERY: AskRoomQuery = Object.freeze({ plan_tier: "free", composition_budget_tier: "low", depth: 2 });
const NO_ROOM_CATALOG: MessageCatalog = Object.freeze({});

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
  roomCatalog = NO_ROOM_CATALOG,
  locale,
  crisisCountryHint = null
}: {
  catalog: MessageCatalog;
  /** The interface locale's `newDebate` catalogue: the refusal words /new uses. */
  newDebateCatalog: MessageCatalog;
  /** The room sentences (budget spec §1.3), in the interface's language: `composerRoomCatalog`. */
  roomCatalog?: MessageCatalog;
  /** The interface locale, recorded with the sensitive-data consent. */
  locale: string;
  /** The edge's country, so the crisis screen shows that country's helplines first. */
  crisisCountryHint?: string | null;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom, refreshRoom] = useAskRoom(contractClient, COMPOSER_ROOM_QUERY);
  const consent = useSensitiveDataConsent({ catalog, locale });
  const crisis = useCrisisSupport({ catalog, locale, countryHint: crisisCountryHint });

  // A question too short to debate still reaches the crisis check ("我想死" is three letters).
  const ready = topic.trim().length > 6 || crisis.flags(topic);

  async function start() {
    if (busy) return;
    // V, 2026-09-30: a question that reads as a person in crisis gets help numbers, never a
    // debate — and before anything else, the length rule and the consent screen included.
    if (crisis.offerIfCrisis(topic)) return;
    if (!ready) return;
    // Sentence D: one question already waits, so this one is not sent. The button is disabled
    // too, except for a question the crisis check flags, which the line above has answered.
    if (room?.room === "ALREADY_WAITING") return;
    setBusy(true);
    setError(null);
    try {
      await validateSession();
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      if (!await consent.ensureConsent()) {
        setBusy(false);
        return;
      }
      // /new owns complete ask provenance and account completion. Keep the question.
      router.push(`/new?topic=${encodeURIComponent(topic.trim())}`);
      return;
    } catch (exc) {
      if (isCrisisSupportRefusal(exc)) {
        crisis.offer();
        setBusy(false);
        return;
      }
      // Sentence D where the person typed: from the room re-read, or, when that
      // read fails, from the refusal's own body (its waiting run and start).
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "ALREADY_WAITING") {
        const fresh = await refreshRoom();
        if (fresh === null) setRoom(waitingRoomOf(exc));
        setBusy(false);
        return;
      }
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
          <button type="button" className="libStart" onClick={start} disabled={!ready || busy || (room?.room === "ALREADY_WAITING" && !crisis.flags(topic))}>
            {t(catalog, busy ? "home.starting" : "home.startDebate")} <span aria-hidden>→</span>
          </button>
        </div>
        <RoomNotice room={room} catalog={roomCatalog} locale={locale} />
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
        {consent.declined ? (
          <p className="sensitiveConsentDeclined" role="status">{t(catalog, "home.sensitiveConsent.declined")}</p>
        ) : null}
      </div>
      {consent.dialog}
      {crisis.dialog}
    </div>
  );
}
