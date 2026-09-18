"use client";

import { useState } from "react";
import { supportConsentGiven } from "./consent.js";

export type ConsentToggleLanguage = "en" | "ro";

export const CONSENT_TOGGLE_COPY = Object.freeze({
  en: "Let the assistant see the status of my debates for this conversation (never their content).",
  ro: "Permite asistentului să vadă starea dezbaterilor mele în această conversație (niciodată conținutul lor)."
});

/**
 * DL3-F6: `consentedAt` is the server's recorded consent for this conversation,
 * and it is what the box shows. The control keeps only the answer the user just
 * gave, so the tick follows the pointer without waiting for a round trip; a
 * request that fails drops that answer and the server's fact rules again. The
 * answer dies with the component, so remounting with the compact widget — the
 * case that used to show OFF over a live consent — reads the server again.
 */
export function ConsentToggle({ signedIn,language,consentedAt = null,onChange }: Readonly<{
  signedIn: boolean;
  language: ConsentToggleLanguage;
  consentedAt?: string | null;
  onChange?: (on: boolean) => Promise<void> | void;
}>) {
  const [pending,setPending] = useState<boolean | null>(null);
  const [busy,setBusy] = useState(false);
  if (!signedIn) return null;

  const recorded = supportConsentGiven(consentedAt);
  const checked = pending ?? recorded;

  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setPending(next);
          setBusy(true);
          void Promise.resolve(onChange?.(next))
            // A refused change never happened: fall back to the server's record
            // rather than asserting the opposite of what was asked.
            .catch(() => setPending(null))
            .finally(() => setBusy(false));
        }}
      />
      {CONSENT_TOGGLE_COPY[language]}
    </label>
  );
}
