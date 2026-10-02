"use client";

import { requestPreferences } from "../../lib/consent";

/**
 * Reopens the cookie preferences card from anywhere (footer, cookie policy). The card and its
 * state machine are `CookieConsent`'s, mounted once by the root layout; this control only asks,
 * through the same request channel Settings → Privacy uses, and lends itself as the opener so
 * focus returns here when the card closes.
 */
export function CookiePreferencesButton({ label, className }: { label: string; className: string }) {
  return (
    <button type="button" className={className} onClick={(event) => requestPreferences(event.currentTarget)}>
      {label}
    </button>
  );
}
