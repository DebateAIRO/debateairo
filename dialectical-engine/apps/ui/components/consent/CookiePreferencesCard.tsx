"use client";

import { useId, useRef, type RefObject } from "react";
import { LEGAL_INVENTORY } from "../../lib/legal/pages";
import { backdropCloseHandler, useModalSurface } from "./modalSemantics";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * 10b — the storage card: a read-only list of the eight items DebateAI stores.
 *
 * One row per `LEGAL_INVENTORY` item, in INV order — the same list /cookies draws and the
 * R17 drift test guards (D-27) — each showing the name, its kind, its purpose and its
 * lifetime. The three strings come from the `legal` catalogue, merged into the consent
 * catalogue by the root layout (D-28), so the card and /cookies show one string per item.
 * Nothing here can be switched: no optional item exists (SPEC-v2 R02, R04).
 *
 * Presentational and prop-driven: it holds no state and reaches no storage, so `CookieConsent`
 * (the ONE state machine) stays the only reader and writer of `debateai.consent`. It opens
 * from five doors and behaves identically from each.
 *
 * **It writes no modal semantics of its own.** Focus trap, initial focus, focus return,
 * backdrop close and the dismiss-key stack all come from the ONE shared helper
 * `modalSemantics.ts`, consumed unchanged (R20). `onDismiss` is what the helper's key arm and
 * backdrop arm call, and what `Close` calls; `Close` is also the initial focus (D-31).
 */
export type CookiePreferencesCardProps = {
  catalog: MessageCatalog;
  /** Closing the card: `Close`, the backdrop and the helper's dismiss key all land here. */
  onDismiss: () => void;
  /** Opens the S02 policy modal in read-only mode, over the card. */
  onRequestPolicy: () => void;
  /**
   * Handed straight to the shared helper, which uses it when the opener it captured is not a
   * usable element AT CLOSE — because the commit that opened this card removed it (the bar's
   * card button), or because it left the page while the card was open. The caller owns it
   * because the bar's control is unmounted while this card is open and comes back as a fresh
   * node; nothing this component could capture would still be on the page at close.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function CookiePreferencesCard({
  catalog,
  onDismiss,
  onRequestPolicy,
  returnFocusRef
}: CookiePreferencesCardProps) {
  const titleId = useId();
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /**
   * The card is mounted only while it is open — `CookieConsent` renders it in the `card`
   * surface and nowhere else — so `open` is the constant `true` and the helper's
   * mount/unmount IS the open/close.
   */
  useModalSurface(true, {
    containerRef: cardRef,
    initialFocusRef: closeRef,
    onClose: onDismiss,
    returnFocusRef
  });

  return (
    <div
      className="consentScrim"
      ref={scrimRef}
      // Resolved at CLICK time, never at render time: `scrimRef.current` is still null during
      // the first render. Only a click landing ON the scrim closes.
      onClick={(event) => backdropCloseHandler(scrimRef.current, onDismiss)(event)}
    >
      <div
        className="consentCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={(node) => {
          cardRef.current = node;
        }}
      >
        <div className="consentCardCore">
          <span className="consentTab" aria-hidden="true" />
          <div className="consentEyebrow">{t(catalog, "consent.preferences.eyebrow")}</div>
          <div className="consentCardTitle" id={titleId}>
            {t(catalog, "consent.preferences.title")}
          </div>
          <div className="consentLede">{t(catalog, "consent.preferences.lede")}</div>
          <div className="consentCatList">
            {LEGAL_INVENTORY.map((item) => (
              <div className="consentCatRow" key={item.name}>
                <div className="consentCatMain">
                  <div className="consentCatHead">
                    <code className="consentItemName" dir="ltr">
                      {item.name}
                    </code>
                    <span className="consentTag consentTag-kind">{t(catalog, item.kindKey)}</span>
                  </div>
                  <div className="consentCatDesc">{t(catalog, item.purposeKey)}</div>
                  <div className="consentCatDetail">{t(catalog, item.lifeKey)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="consentCardFooter">
            <button type="button" className="consentLink" onClick={onRequestPolicy}>
              {t(catalog, "consent.preferences.privacyNotice")}
            </button>
            <a className="consentLink" href="/cookies">
              {t(catalog, "consent.link.cookiePolicy")}
            </a>
            <span className="consentFooterGap" />
            <button type="button" className="consentPrimary" ref={closeRef} onClick={onDismiss}>
              {t(catalog, "consent.policy.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
