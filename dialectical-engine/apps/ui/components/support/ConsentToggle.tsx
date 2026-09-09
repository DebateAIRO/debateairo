"use client";

import { useState } from "react";

export type ConsentToggleLanguage = "en" | "ro";

export const CONSENT_TOGGLE_COPY = Object.freeze({
  en: "Let the assistant see the status of my debates for this conversation (never their content).",
  ro: "Permite asistentului să vadă starea dezbaterilor mele în această conversație (niciodată conținutul lor)."
});

export function ConsentToggle({ signedIn,language,onChange }: Readonly<{
  signedIn: boolean;
  language: ConsentToggleLanguage;
  onChange?: (on: boolean) => Promise<void> | void;
}>) {
  const [checked,setChecked] = useState(false);
  const [busy,setBusy] = useState(false);
  if (!signedIn) return null;

  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setChecked(next);
          setBusy(true);
          void Promise.resolve(onChange?.(next)).catch(() => setChecked(!next)).finally(() => setBusy(false));
        }}
      />
      {CONSENT_TOGGLE_COPY[language]}
    </label>
  );
}
