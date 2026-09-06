"use client";

import { requestPreferences } from "../../lib/consent";

/**
 * Settings → Privacy (S01-R21): one panel, one button, and the promise the 10b
 * lede makes — `Asked once. Revisit any time from Settings → Privacy.` — kept by
 * a real surface. Shipping that sentence without this panel would be a UI
 * claiming a capability the product lacks (standing V honesty law).
 *
 * **The panel is present whether or not a decision is stored, and the bar may be
 * showing behind it**: the Settings entry has no privileged state, because the
 * discriminator is the stored decision and never the entry point (REQ-REV-01
 * **B1**). It holds no consent state of its own, reads no storage, and decides
 * nothing — it asks, and `CookieConsent` answers.
 *
 * **Why a module-level store and not React context:** S01-R07 pins the consent
 * mount as a SIBLING placed after `{children}` in `apps/ui/app/layout.tsx`, and
 * a sibling cannot provide context to `{children}`. The mechanism is forced by
 * the requirement, not chosen (`apps/ui/lib/consent.ts`, S01-S11).
 *
 * **Why a component and not inline JSX in the page:** `AccountSettingsScreen` is
 * a non-exported local function inside a page wrapped in `<AuthGate>`, so an
 * inline panel could only be exercised by mounting the whole page through the
 * auth gate — and a cluster whose test needs the whole app is not independently
 * verifiable.
 *
 * Anonymous visitors never reach it: `apps/ui/app/settings/page.tsx:37-39` is
 * `<AuthGate>{() => <AccountSettingsScreen />}</AuthGate>` and
 * `apps/ui/components/AuthGate.tsx:21-23` redirects to `/login` (S01-R22). Their
 * route to the card is the bar itself, which is app-wide.
 */
export function ConsentSettingsPanel() {
  return (
    <section aria-labelledby="consent-privacy-heading">
      <div className="setSectionHead">
        <h2 className="setSectionTitle" id="consent-privacy-heading">
          Privacy
        </h2>
        <p className="setSectionHint">
          Choose what this browser stores. Asked once; change it here any time.
        </p>
      </div>
      <div className="setList">
        <button
          type="button"
          className="setBtn"
          // The opener travels with the request so the shared modal helper can
          // return focus to this button when the card closes (S01-R18). It is
          // carried, never consulted: it is not a discriminator of behaviour.
          onClick={(event) => requestPreferences(event.currentTarget)}
        >
          Cookie preferences
        </button>
      </div>
    </section>
  );
}
