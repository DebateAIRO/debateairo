"use client";

/**
 * 10a — the first-visit cookie notice.
 *
 * Presentational and prop-driven: it is handed its two callbacks and reaches no storage of
 * its own, so `CookieConsent` (the ONE state machine) stays the only reader and writer of
 * `debateai.consent`.
 *
 * DebateAI stores only strictly necessary items, so the notice offers no choice and asks for
 * no consent (SPEC-v2 R01, R05): a link to the cookie policy, a button that opens the storage
 * card, and an acknowledgement — in that DOM order, the tab order DONE.md draws.
 *
 * It is a labelled REGION, not a dialog: it never pulls focus and never traps it (R20), so the
 * page behind it stays operable. Copy comes from the consent catalogue; its look lives in the
 * ONE delimited `consent-ui S01` block of `apps/ui/app/globals.css`, every colour a token.
 */
import type { RefObject } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export type CookieBarProps = {
  catalog: MessageCatalog;
  /** Records the acknowledgement and closes the bar. */
  onAcknowledge: () => void;
  /**
   * Opens the storage card. `opener` is carried only so focus can be returned to this button
   * on close; it is never a discriminator of behaviour. Same shape as `requestPreferences` in
   * `apps/ui/lib/consent.ts`, which every other door uses.
   */
  onOpenCard: (opener: HTMLElement | null) => void;
  /**
   * Attached to the card button, so the ONE shared modal helper can put focus back on THIS
   * bar's control when the card closes. The bar is unmounted while the card is open, so the
   * reference is re-attached to the fresh button when the bar returns — which is why it is the
   * caller's ref and not the card's capture. The bar moves no focus itself: it only lends the node.
   */
  cardButtonRef?: RefObject<HTMLButtonElement | null>;
};

export function CookieBar({ catalog, onAcknowledge, onOpenCard, cardButtonRef }: CookieBarProps) {
  return (
    <div className="consentBar" role="region" aria-label={t(catalog, "consent.bar.label")}>
      <div className="consentBarBezel">
        <div className="consentBarCore">
          <span className="consentTab" aria-hidden="true" />
          <div className="consentCopy">
            <div className="consentEyebrow">{t(catalog, "consent.bar.eyebrow")}</div>
            <div className="consentTitle">{t(catalog, "consent.bar.title")}</div>
            <p className="consentBody">{t(catalog, "consent.bar.body")}</p>
          </div>
          <div className="consentActions">
            <a className="consentLink" href="/cookies">
              {t(catalog, "consent.link.cookiePolicy")}
            </a>
            <button
              type="button"
              className="consentGhost consentGhostStrong"
              ref={cardButtonRef}
              onClick={(event) => onOpenCard(event.currentTarget)}
            >
              {t(catalog, "consent.bar.whatWeStore")}
            </button>
            <button type="button" className="consentPrimary" onClick={onAcknowledge}>
              {t(catalog, "consent.bar.acknowledge")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
