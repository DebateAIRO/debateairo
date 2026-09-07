"use client";

/**
 * 10a — the first-visit cookie bar.
 *
 * Presentational and prop-driven (S01-S13): it is handed the three controls
 * S01-R04 names and reaches no storage of its own, so `CookieConsent` (the ONE
 * state machine, cluster C5) stays the only reader and writer of
 * `debateai.consent`.
 *
 * It is a labelled REGION, not a dialog: it never pulls focus, never traps it,
 * and offers no dismissal that is not a decision (S01-R12, S01-R13). A visitor
 * has to be able to read the page before deciding, and `Essential only` is the
 * one-click way out, so nothing is coerced.
 *
 * Copy is byte-exact from `SPEC.md` §Copy (S01-R11); geometry lives in the ONE
 * delimited `consent-ui S01` block at the end of `apps/ui/app/globals.css`
 * (S01-R09, S01-R10) and every colour there is a `var(--token)` reference.
 */
import type { RefObject } from "react";

export type CookieBarProps = {
  /** Writes R04 row 2 and closes the bar. */
  onEssentialOnly: () => void;
  /**
   * Opens the preferences card. `opener` is carried only so focus can be
   * returned to this button on close (S01-R18); it is never a discriminator of
   * behaviour — the stored decision is (S01-R14, B1). Same shape as
   * `requestPreferences` in `apps/ui/lib/consent.ts`, which the Settings
   * re-entry uses, so the two entry points hand the machine the same thing.
   */
  onChoose: (opener: HTMLElement | null) => void;
  /** Writes R04 row 1 and closes the bar. */
  onAcceptAll: () => void;
  /**
   * Attached to `Choose what to store`, so the ONE shared helper can put focus back on
   * THIS bar's control when the card closes (S01-R18's bar direction, V-22). The bar is
   * unmounted while the card is open, so the reference is re-attached to the fresh button
   * when the bar returns — which is the whole point of it being the caller's ref and not
   * the card's capture. The bar still moves no focus itself: it only lends the node.
   */
  chooseRef?: RefObject<HTMLButtonElement | null>;
};

export function CookieBar({ onEssentialOnly, onChoose, onAcceptAll, chooseRef }: CookieBarProps) {
  return (
    <div className="consentBar" role="region" aria-label="Cookie consent">
      <div className="consentBarBezel">
        <div className="consentBarCore">
          <span className="consentTab" aria-hidden="true" />
          <div className="consentCopy">
            <div className="consentEyebrow">YOUR DATA, ON THE RECORD</div>
            <div className="consentTitle">
              We store only what keeps the bench running — unless you say otherwise.
            </div>
            <p className="consentBody">
              Essential cookies hold your session, MFA state and device record. Analytics and
              model-quality telemetry are optional and never sold. You can change this any time in
              Settings.
            </p>
          </div>
          <div className="consentActions">
            <button type="button" className="consentGhost" onClick={onEssentialOnly}>
              Essential only
            </button>
            <button
              type="button"
              className="consentGhost consentGhostStrong"
              ref={chooseRef}
              onClick={(event) => onChoose(event.currentTarget)}
            >
              Choose what to store
            </button>
            <button type="button" className="consentPrimary" onClick={onAcceptAll}>
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
